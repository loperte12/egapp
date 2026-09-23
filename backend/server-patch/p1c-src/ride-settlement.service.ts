// =============================================================================
// RideSettlementService — P1-c: liquidación de viajes de taxi al ledger.
// (docs/P1-c-LIQUIDACION-VIAJES.md — decisiones del dueño CERRADAS 16/09/2026)
//
// Repite el patrón de escrow.service.ts sobre las tablas que YA existen:
//   PROPUEST ──(pasajero confirma PIN)──> LOCKED(fare)         [ESCROW_LOCK]
//   LOCKED ──(llegada + confirma pasajero o auto 10 min)──> SETTLED
//          SETTLED: RELEASE(fare−fee → conductor) + FEE(fee → plataforma),
//          ambos contra el ESCROW bloqueado: por viaje, ΣRELEASE+ΣFEE==ΣLOCK.
//   LOCKED ──(pasajero cancela fuera de ventana 5 min)──> CANCELLED
//          CANCELLED: RELEASE(cuota→conductor) + REFUND(fare−cuota→pasajero)
//   LOCKED ──(conductor cancela)──> ABORTED: REFUND(total) + strike (3/7d → 24h;
//          reincidente → 7d)
//   LOCKED|SETTLED ──(disputa pasajero)──> DISPUTED → admin: REVERSA(refund+fee)
//          o libera. Viaje CASH: se REGISTRA (settlement_kind='CASH') sin mover
//          dinero — el plan B (comisión de cash) NO se activa (decisión §3.4).
//
// Verdad del dinero = wallet.transactions/ledger_entries con
// reference_activity_id = taxi_requests.id y claves `${tripId}:evento`.
// Las columnas de mobility.taxi_requests (city, settlement_kind, fee_info,
// arrived_at…) son CACHE de UI y temporizadores: si se desincronizan, el
// barrido las reconcilia contra el ledger — nunca al revés.
//
// Reglas duras de la casa (todas heredadas de escrow.service):
//   · Ningún saldo negativo; toda mutación dentro de UNA $transaction con
//     SELECT … FOR UPDATE; dos monederos se bloquean en orden de UUID.
//   · El token de pago (scope TRIP, importe = fare, referenceId = viaje) se
//     consume DENTRO de la TX del lock.
//   · Idempotencia: P2002 sobre idempotency_key → replay con el resultado
//     original, sin duplicar asientos.
//   · La comisión se CONGELA en el lock (fee_info): el dueño puede cambiar la
//     política mañana y este viaje liquida con lo pactado hoy.
//   · Cuota por no-show del pasajero: 200 XAF, o 20 % del fare si es MENOR,
//     nunca más que el propio viaje; si el lock no la cubre, se libera todo al
//     conductor y el saldo queda a cero (sin deudas).
//   · «No subiste, no pagas»: viaje cancelado sin lock no mueve dinero.
// =============================================================================

import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../http/prisma.service';
import { MobilityPrismaService } from '../mobility/mobility-prisma.service';
import { DomainError, PaymentAuthService } from './payment-auth.service';
import { FeeService } from './fee.service';
import { KycGateService } from './kyc-gate.service';

// — Parámetros del dueño (§3). La comisión por ciudad NO vive aquí: vive en
//   wallet.fee_policies (TAXI_MALABO 20 % tope 1.500 · TAXI_BATA 50 plano),
//   que el dueño puede editar con un UPDATE. Estos tres números son de ciclo
//   de vida, no de política de cobro, y admiten override por env por si el
//   dueño los mueve sin compilar:
//     RIDE_FREE_WINDOW_MIN (5) · RIDE_AUTO_CLOSE_MIN (10) · RIDE_NO_SHOW_FEE (200)
const FREE_WINDOW_MIN = Number(process.env.RIDE_FREE_WINDOW_MIN ?? 5);
const AUTO_CLOSE_MIN = Number(process.env.RIDE_AUTO_CLOSE_MIN ?? 10);
const NO_SHOW_FEE = Number(process.env.RIDE_NO_SHOW_FEE ?? 200);
const ZOMBIE_MINUTES = 90;           // anti-zombi de la casa (activeTaxiTrip)
const DISPUTE_WINDOW_DAYS = 7;       // disputa tras cierre: la ventana de reclamación de la casa
const SWEEP_INTERVAL_MS = 30_000;

const CITIES: Record<string, string> = { MALABO: 'TAXI_MALABO', BATA: 'TAXI_BATA' };

function normCity(city: string | null | undefined): string | null {
  if (!city) return null;
  return CITIES[String(city).trim().toUpperCase()] ?? null;
}

export type SettlementKind = 'WALLET' | 'CASH' | null;

@Injectable()
export class RideSettlementService implements OnModuleInit, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(PrismaService) private readonly db: any,             // cliente WALLET (dinero)
    private readonly rides: MobilityPrismaService,               // cliente MOBILITY (viajes)
    private readonly paymentAuth: PaymentAuthService,
    private readonly fees: FeeService,
    private readonly gate: KycGateService,
  ) {}

  // El barrido hace lo que el botón del pasajero haría si estuviera mirando:
  // cerrar a los 10 min de la llegada y reembolsar zombies. Idempotente por
  // clave: dos procesos, dos barridos, un solo asiento.
  onModuleInit() {
    if (String(process.env.RIDE_SWEEP_DISABLED ?? '') === '1') return;
    this.timer = setInterval(() => { this.sweepAll().catch((e) => console.warn('[ride-settlement] sweep:', e?.message ?? e)); }, SWEEP_INTERVAL_MS);
    this.timer.unref?.();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  // -------------------------------------------------------------------------
  // Helpers — monederos y asientos (copia fiel de escrow.service.ts)
  // -------------------------------------------------------------------------

  private async lockWallet(tx: any, userId: string) {
    const rows: any[] = await tx.$queryRaw`
      SELECT * FROM wallets WHERE user_id = ${userId}::uuid FOR UPDATE`;
    if (rows.length === 0) throw new DomainError('WALLET_NOT_FOUND', 'Monedero no encontrado');
    return rows[0];
  }

  private async lockTwoWallets(tx: any, userA: string, userB: string) {
    const [first, second] = [userA, userB].sort();
    const w1 = await this.lockWallet(tx, first);
    const w2 = await this.lockWallet(tx, second);
    return userA === first ? [w1, w2] : [w2, w1];
  }

  private async postEntry(tx: any, p: {
    transactionId: string; walletId: string; bucket: 'AVAILABLE' | 'ESCROW';
    direction: 'DEBIT' | 'CREDIT'; amount: number; currentBalance: number;
  }): Promise<number> {
    const delta = p.direction === 'CREDIT' ? p.amount : -p.amount;
    const balanceAfter = p.currentBalance + delta;
    if (balanceAfter < 0) throw new DomainError('INSUFFICIENT_FUNDS', 'Saldo insuficiente en la garantía del viaje');
    const column = p.bucket === 'AVAILABLE' ? 'balance_available' : 'balance_escrow';
    await tx.$executeRawUnsafe(
      `UPDATE wallets SET ${column} = $1, version = version + 1 WHERE id = $2::uuid`,
      balanceAfter, p.walletId,
    );
    await tx.ledgerEntry.create({
      data: {
        transactionId: p.transactionId, walletId: p.walletId, bucket: p.bucket,
        direction: p.direction, amount: p.amount, balanceAfter,
      },
    });
    return balanceAfter;
  }

  // -------------------------------------------------------------------------
  // Helpers — viaje (mobility) y ledger derivado (wallet)
  // -------------------------------------------------------------------------

  private async getRide(tripId: string) {
    const rows: any[] = await this.rides.$queryRaw`
      SELECT id, user_id, driver_id, status, modality, requested_price, algorithm_price,
             final_price, city, settlement_kind, payment_locked_at, fee_info, arrived_at,
             cancelled_by, cancelled_at, cancelled_reason, disputed_at, dispute_reason,
             dispute_resolved_at, settlement, accepted_at, started_at, completed_at, created_at
      FROM mobility.taxi_requests WHERE id = ${tripId}::uuid`;
    if (!rows[0]) throw new DomainError('TRIP_NOT_FOUND', 'Viaje no encontrado');
    return rows[0];
  }

  /** El fare pactado: lo que el conductor puso al aceptar (o el presupuesto). */
  private fareOf(ride: any): number {
    return Math.round(Number(ride.final_price ?? ride.requested_price ?? 0));
  }

  private async findTx(idempotencyKey: string) {
    return this.db.transaction.findUnique({ where: { idempotencyKey } });
  }

  private keys(tripId: string) {
    return {
      lock: `${tripId}:lock`,
      release: `${tripId}:release`,
      releaseFee: `${tripId}:release:fee`,
      cancelRelease: `${tripId}:cancel-release`,
      refund: `${tripId}:refund`,
      disputeRefund: `${tripId}:dispute-refund`,
      feeReverse: `${tripId}:dispute-fee-reverse`,
    };
  }

  /** Política por ciudad + comisión CONGELADA (redondeada hacia abajo, tope
      de la política, nunca superior al propio fare). */
  private async freezeFee(city: string | null, fare: number): Promise<{ scope: string; fee: number; policy: any } | null> {
    const scope = normCity(city);
    if (!scope) return null;
    const { policy } = await this.fees.quote(scope as any, fare);
    if (!policy || !policy.active) throw new DomainError('FEE_POLICY_MISSING', `Sin política de comisión para ${city} (${scope})`);
    const pct = Number(policy.percent ?? 0);
    const flat = Number(policy.flat ?? 0);
    const minFee = Number(policy.minFee ?? 0);
    const maxFee = policy.maxFee === null || policy.maxFee === undefined ? Infinity : Number(policy.maxFee);
    let fee = Math.max(Math.floor(fare * pct) + flat, minFee);
    if (Number.isFinite(maxFee)) fee = Math.min(fee, maxFee);
    fee = Math.min(fee, fare);
    return { scope, fee, policy };
  }

  /**
   * PREVISUALIZACIÓN de comisión con la política vigente (misma fórmula que el
   * congelado del lock). La app la enseña ANTES de confirmar con PIN: el
   * pasajero ve lo que paga y el conductor lo que cobrará, y el número lo
   * pone siempre el servidor — cero fórmulas en el cliente.
   */
  async quoteView(city: string | null | undefined, fare: number): Promise<{ scope: string; fee: number; net: number } | null> {
    if (!(fare > 0)) return null;
    try {
      const f = await this.freezeFee(city ?? null, fare);
      if (!f) return null;
      return { scope: f.scope, fee: f.fee, net: Math.max(0, fare - f.fee) };
    } catch { return null; }
  }

  /** CAS sobre el viaje: solo escribe si el estado sigue siendo el esperado. */
  private async casRide(tripId: string, expectStatus: string[], set: string, params: any[]): Promise<number> {
    const statusList = expectStatus.map((s) => `'${s}'`).join(',');
    const res = await this.rides.$executeRawUnsafe(
      `UPDATE mobility.taxi_requests SET ${set}, updated_at = now()
       WHERE id = $1::uuid AND status IN (${statusList})`,
      tripId, ...params,
    );
    return res;
  }

  // -------------------------------------------------------------------------
  // 1) PIN → LOCK del fare pactado (pasajero) — nace el viaje WALLET
  //    POST /v1/rides/:tripId/lock · X-Payment-Token (TRIP) · Idempotency-Key
  // -------------------------------------------------------------------------
  async lockFare(params: { passengerId: string; tripId: string; paymentToken?: string; idempotencyKey: string; city?: string }) {
    const ride = await this.getRide(params.tripId);
    if (ride.user_id !== params.passengerId) throw new DomainError('NOT_OWNER', 'Solo el pasajero del viaje puede confirmarlo');
    if (ride.status !== 'accepted') throw new DomainError('TRIP_NOT_ACCEPTED', 'El precio se confirma solo sobre una propuesta del conductor');
    if (!ride.driver_id) throw new DomainError('NO_DRIVER', 'El viaje no tiene conductor asignado');
    if (ride.settlement_kind === 'CASH') throw new DomainError('KIND_IS_CASH', 'Este viaje se pactó en efectivo: no hay lock que hacer');

    const fare = this.fareOf(ride);
    if (fare <= 0) throw new DomainError('FARE_INVALID', 'El viaje no tiene precio pactado');
    const city = normCity(ride.city ?? params.city ?? null) ? (ride.city ?? params.city) : null;
    if (!city) throw new DomainError('CITY_REQUIRED', 'El viaje no registra ciudad (Malabo/Bata): no se puede calcular la comisión');

    const k = this.keys(ride.id);
    const existing = await this.findTx(k.lock);
    if (existing) {
      // Replay: aseguramos que el cache del viaje cuadre (la 1.ª vez pudo caerse
      // el UPDATE de taxi_requests entre la TX del dinero y aquí).
      await this.casRide(ride.id, ['accepted'],
        `settlement_kind='WALLET', payment_locked_at=COALESCE(payment_locked_at, now()),
         fee_info=COALESCE(fee_info, $2::jsonb), city=COALESCE(city, $3)`,
        [JSON.stringify(await this.feeInfoOf(k.lock, ride, fare, city)), city ?? null]);
      return { replay: true, tripId: ride.id, lockTransactionId: existing.id };
    }

    const frozen = await this.freezeFee(city, fare);
    if (!frozen) throw new DomainError('CITY_REQUIRED', 'Ciudad de viaje desconocida');
    const { scope, fee } = frozen;

    // KYC del pagador + provisionado lazy de ambos (el pasajero puede llegar
    // de la auth unificada sin monedero; el conductor recibirá el payout).
    await this.gate.ensureProvisioned(params.passengerId);
    await this.gate.enforce(params.passengerId, 'ESCROW_LOCK');
    await this.gate.ensureProvisioned(ride.driver_id);

    try {
      const r = await this.db.$transaction(async (tx: any) => {
        await this.paymentAuth.requirePaymentToken(tx, {
          userId: params.passengerId, token: params.paymentToken,
          scope: 'TRIP', amount: fare, referenceId: ride.id,
        });
        const wallet = await this.lockWallet(tx, params.passengerId);
        if (Number(wallet.balance_available) < fare) {
          throw new DomainError('INSUFFICIENT_FUNDS',
            `Saldo insuficiente: necesitas ${fare} XAF. Puedes recargar con un agente (CASH_IN).`);
        }
        const lockTx = await tx.transaction.create({
          data: {
            idempotencyKey: k.lock,
            senderId: params.passengerId, receiverId: null,
            amount: fare, type: 'ESCROW_LOCK', status: 'COMPLETED',
            referenceActivityId: ride.id, completedAt: new Date(),
            metadata: { kind: 'RIDE', fare, fee, city, scope },
          },
        });
        await this.postEntry(tx, {
          transactionId: lockTx.id, walletId: wallet.id, bucket: 'AVAILABLE',
          direction: 'DEBIT', amount: fare, currentBalance: Number(wallet.balance_available),
        });
        await this.postEntry(tx, {
          transactionId: lockTx.id, walletId: wallet.id, bucket: 'ESCROW',
          direction: 'CREDIT', amount: fare, currentBalance: Number(wallet.balance_escrow),
        });
        return { lockTransactionId: lockTx.id };
      });

      await this.casRide(ride.id, ['accepted'],
        `settlement_kind='WALLET', payment_locked_at=now(), fee_info=$2::jsonb, city=COALESCE(city, $3)`,
        [JSON.stringify({
          fare, fee, city, scope,
          percent: String(frozen.policy.percent), flat: String(frozen.policy.flat),
          max_fee: frozen.policy.maxFee === null ? null : String(frozen.policy.maxFee),
          frozen_at: new Date().toISOString(),
        }), city]);

      return { replay: false, tripId: ride.id, fare, fee, net: fare - fee, ...r };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const original = await this.findTx(k.lock);
        if (original) return { replay: true, tripId: ride.id, lockTransactionId: original.id };
      }
      throw e;
    }
  }

  /** Reconstruye fee_info en un replay leyendo el lock original del ledger. */
  private async feeInfoOf(lockKey: string, ride: any, fare: number, city: string) {
    const lockTx = await this.findTx(lockKey);
    const md: any = lockTx?.metadata ?? {};
    const frozen = await this.freezeFee(city, fare);
    return {
      fare, fee: md.fee ?? frozen?.fee ?? 0, city, scope: md.scope ?? frozen?.scope ?? null,
      percent: md?.policy?.percent ?? null, flat: md?.policy?.flat ?? null, max_fee: md?.policy?.max_fee ?? null,
      frozen_at: lockTx?.createdAt ? new Date(lockTx.createdAt).toISOString() : new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // 2) Pactar en EFECTIVO (pasajero) — queda registrado, sin dinero ni deuda
  // -------------------------------------------------------------------------
  async chooseCash(params: { passengerId: string; tripId: string }) {
    const ride = await this.getRide(params.tripId);
    if (ride.user_id !== params.passengerId) throw new DomainError('NOT_OWNER', 'Solo el pasajero del viaje puede elegir el pago');
    if (ride.status !== 'accepted') throw new DomainError('TRIP_NOT_ACCEPTED', 'La forma de pago se elige sobre la propuesta aceptada');
    if (ride.settlement_kind === 'WALLET') throw new DomainError('KIND_IS_WALLET', 'Este viaje ya tiene el fare bloqueado en el monedero');
    const changed = await this.casRide(ride.id, ['accepted'],
      `settlement_kind='CASH', fee_info=COALESCE(fee_info, $2::jsonb)`,
      [JSON.stringify({ kind: 'CASH', fare: this.fareOf(ride), fee_expected: 0, note: 'plan B no activado (decisión §3.4)' })]);
    return { tripId: ride.id, kind: 'CASH', changed: changed === 1 };
  }

  // -------------------------------------------------------------------------
  // 3) Llegada a destino (conductor) — arranca el reloj del cierre automático
  // -------------------------------------------------------------------------
  async markArrival(params: { driverId: string; tripId: string }) {
    const ride = await this.getRide(params.tripId);
    if (ride.driver_id !== params.driverId) throw new DomainError('NOT_DRIVER', 'No estás asignado a este viaje');
    if (!['in_progress', 'accepted'].includes(ride.status)) {
      throw new DomainError('TRIP_NOT_ACTIVE', `Llegada no válida en estado ${ride.status}`);
    }
    const changed = await this.casRide(ride.id, ['in_progress', 'accepted'],
      `status='arrived', arrived_at=now()`, []);
    if (changed !== 1) throw new DomainError('TRIP_CHANGED', 'El viaje cambió de estado; recarga la pantalla');
    return { tripId: ride.id, status: 'arrived', arrivedAt: new Date(), autoCloseAt: new Date(Date.now() + AUTO_CLOSE_MIN * 60_000) };
  }

  // -------------------------------------------------------------------------
  // 4) CIERRE DEL VIAJE: RELEASE al conductor (menos FEE congelada) +
  //    FEE a la plataforma. Lo dispara el pasajero al confirmar, o el barrido
  //    a los AUTO_CLOSE_MIN de la llegada. El lock (si existe de verdad) es la
  //    única fuente: sin lock no hay settle (viaje CASH → marcar, no cobrar).
  // -------------------------------------------------------------------------
  async settle(params: { tripId: string; actor: { type: 'PASSENGER' | 'SYSTEM' | 'ADMIN'; id?: string; adminId?: string } }) {
    const ride = await this.getRide(params.tripId);
    if (params.actor.type === 'PASSENGER' && ride.user_id !== params.actor.id) {
      throw new DomainError('NOT_OWNER', 'Solo el pasajero puede confirmar la llegada final');
    }
    if (ride.settlement_kind !== 'WALLET') {
      // CASH / no pactado: registrar y nada de dinero.
      return this.markCashClosed(ride);
    }
    if (ride.disputed_at && !ride.dispute_resolved_at) throw new DomainError('DISPUTE_OPEN', 'El viaje está disputado: el cierre espera al soporte');
    const k = this.keys(ride.id);
    const lockTx = await this.findTx(k.lock);
    if (!lockTx) throw new DomainError('NOT_LOCKED', 'No hay fare bloqueado para este viaje');
    const existingRelease = await this.findTx(k.release);
    if (existingRelease) {
      await this.syncRideAfterRelease(ride);
      return { replay: true, tripId: ride.id, payoutTransactionId: existingRelease.id };
    }
    // Auto-cierre: hay que haber llegado hace AUTO_CLOSE_MIN; el pasajero
    // manual puede cerrar en cuanto el conductor marque la llegada. Un viaje
    // cerrado por la puerta antigua (APK vieja: completed sin arrived) también
    // se liquida por SYSTEM — el dinero bloqueado no puede quedar huérfano.
    if (params.actor.type === 'SYSTEM') {
      if (ride.status !== 'completed') {
        if (!ride.arrived_at || ride.arrived_at.getTime() > Date.now() - AUTO_CLOSE_MIN * 60_000) {
          return { tripId: ride.id, status: ride.status, autoClosePending: true };
        }
      }
    } else if (!ride.arrived_at) {
      throw new DomainError('NOT_ARRIVED', 'El conductor debe marcar la llegada antes de cerrar el viaje');
    }

    const fare = this.fareOf(ride);
    const feeInfo: any = ride.fee_info ?? {};
    const fee = Math.min(Math.max(Number(feeInfo.fee ?? 0), 0), fare);
    const scope = String(feeInfo.scope ?? normCity(ride.city) ?? 'TAXI_MALABO');
    const driverId = ride.driver_id!;
    const passengerId = ride.user_id;

    try {
      const r = await this.db.$transaction(async (tx: any) => {
        const [pw, dw] = await this.lockTwoWallets(tx, passengerId, driverId);
        const net = fare - fee;
        const releaseTx = await tx.transaction.create({
          data: {
            idempotencyKey: k.release,
            senderId: passengerId, receiverId: driverId,
            amount: net, type: 'ESCROW_RELEASE', status: 'COMPLETED',
            referenceActivityId: ride.id, completedAt: new Date(),
            metadata: { kind: 'RIDE', actor: params.actor.type, fare, fee },
          },
        });
        // El escrow del pasajero se parte en dos: NETO al conductor, FEE a la
        // plataforma (política congelada en fee_info). La invariant del diseño
        // §4.4 —ΣRELEASE + ΣFEE == ΣLOCK − ΣREFUND— solo cuadra así.
        await this.postEntry(tx, {
          transactionId: releaseTx.id, walletId: pw.id, bucket: 'ESCROW',
          direction: 'DEBIT', amount: net, currentBalance: Number(pw.balance_escrow),
        });
        await this.postEntry(tx, {
          transactionId: releaseTx.id, walletId: dw.id, bucket: 'AVAILABLE',
          direction: 'CREDIT', amount: net, currentBalance: Number(dw.balance_available),
        });
        let feeApplied: any = { fee: 0, feeTransactionId: null };
        if (fee > 0) {
          feeApplied = await this.fees.applyFee(tx, {
            scope: scope as any,
            payerUserId: passengerId,                 // paga contra el ESCROW bloqueado
            baseAmount: fare,
            overrideFee: fee,                         // congelada en el lock — FeeService parche P1-c
            idempotencyKey: k.releaseFee,
            referenceActivityId: ride.id,
            fromBucket: 'ESCROW',
            payerWalletId: pw.id,
            payerBucketBalance: Number(pw.balance_escrow) - net,
          });
        }
        return { payoutTransactionId: releaseTx.id, feeApplied, net };
      });

      await this.syncRideAfterRelease(ride);
      return {
        replay: false, tripId: ride.id, status: 'completed', fare, fee,
        net: r.net, payoutTransactionId: r.payoutTransactionId,
      };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const original = await this.findTx(k.release);
        if (original) return { replay: true, tripId: ride.id, payoutTransactionId: original.id };
      }
      throw e;
    }
  }

  /** Marca completed el viaje cuando el payout YA existe (reconciliación). */
  private async syncRideAfterRelease(ride: any) {
    const fare = this.fareOf(ride);
    const fee = Math.min(Math.max(Number((ride.fee_info as any)?.fee ?? 0), 0), fare);
    await this.casRide(ride.id, ['accepted', 'in_progress', 'arrived'],
      `status='completed', completed_at=COALESCE(completed_at, now()), settlement=$2::jsonb`,
      [JSON.stringify({ kind: 'WALLET', fare, fee, net: fare - fee, at: new Date().toISOString() })]);
  }

  /** Viajes cerrados sin dinero ourougeano: quedan registrados como CASH. */
  private async markCashClosed(ride: any) {
    const fare = this.fareOf(ride);
    if (ride.settlement_kind === 'WALLET') return { tripId: ride.id, skipped: true };
    await this.casRide(ride.id, ['accepted', 'in_progress', 'arrived', 'completed'],
      `settlement_kind='CASH', settlement=COALESCE(settlement, $2::jsonb)`,
      [JSON.stringify({ kind: 'CASH', fare, fee_charged: 0, fee_expected: 0, note: 'viaje en efectivo — plan B no activado' })]);
    return { tripId: ride.id, status: ride.status, kind: 'CASH', fare };
  }

  // -------------------------------------------------------------------------
  // 5) Cancelación del PASAJERO con liquidación:
  //    sin lock → gratis siempre («no subiste, no pagas»);
  //    con lock → ventana gratis FREE_WINDOW_MIN desde accepted_at; fuera de
  //    ventana o con llegada marcada: cuota NO_SHOW_FEE (o 20 % si MENOR) al
  //    conductor + REFUND del resto. Nunca deuda: si el lock no cubre la
  //    cuota, se libera todo al conductor.
  // -------------------------------------------------------------------------
  async cancelByPassenger(params: { passengerId: string; tripId: string; reason?: string; idempotencyKey: string }) {
    const ride = await this.getRide(params.tripId);
    if (ride.user_id !== params.passengerId) throw new DomainError('NOT_OWNER', 'Solo el pasajero puede cancelar su viaje');
    if (!['requested', 'accepted', 'in_progress', 'arrived'].includes(ride.status)) {
      throw new DomainError('TRIP_NOT_CANCELLABLE', 'El viaje ya no se puede cancelar');
    }
    const k = this.keys(ride.id);
    const lockTx = await this.findTx(k.lock);
    const reason = typeof params.reason === 'string' && params.reason.trim() ? params.reason.trim().slice(0, 120) : null;

    if (!lockTx || ride.settlement_kind !== 'WALLET') {
      const changed = await this.casRide(ride.id, ['requested', 'accepted', 'in_progress', 'arrived'],
        `status='cancelled', cancelled_at=now(), cancelled_by='PASSENGER', cancelled_reason=$2`, [reason]);
      return { tripId: ride.id, status: 'cancelled', money: 'none', changed: changed === 1 };
    }

    const fare = this.fareOf(ride);
    const withinFreeWindow = ride.accepted_at
      && ride.accepted_at.getTime() > Date.now() - FREE_WINDOW_MIN * 60_000
      && !ride.arrived_at;
    const cuota = withinFreeWindow ? 0
      : Math.min(NO_SHOW_FEE, Math.floor(fare * 0.2), fare);
    if (cuota > fare) throw new DomainError('INTERNAL', 'cuota > fare (no debería pasar: se recorta arriba)');

    try {
      const r = await this.db.$transaction(async (tx: any) => {
        const [pw, dw] = await this.lockTwoWallets(tx, ride.user_id, ride.driver_id!);
        let refundAmount = fare;
        let releaseAmount = 0;
        if (cuota > 0) {
          releaseAmount = Math.min(cuota, Number(pw.balance_escrow));
          refundAmount = fare - releaseAmount;
          if (releaseAmount > 0) {
            const crel = await tx.transaction.create({
              data: {
                idempotencyKey: k.cancelRelease,
                senderId: ride.user_id, receiverId: ride.driver_id,
                amount: releaseAmount, type: 'ESCROW_RELEASE', status: 'COMPLETED',
                referenceActivityId: ride.id, completedAt: new Date(),
                metadata: { kind: 'RIDE_CANCEL_FEE', fare, cuota },
              },
            });
            await this.postEntry(tx, {
              transactionId: crel.id, walletId: pw.id, bucket: 'ESCROW',
              direction: 'DEBIT', amount: releaseAmount, currentBalance: Number(pw.balance_escrow),
            });
            await this.postEntry(tx, {
              transactionId: crel.id, walletId: dw.id, bucket: 'AVAILABLE',
              direction: 'CREDIT', amount: releaseAmount, currentBalance: Number(dw.balance_available),
            });
          }
        }
        if (refundAmount > 0) {
          const rt = await tx.transaction.create({
            data: {
              idempotencyKey: k.refund,
              senderId: ride.user_id, receiverId: ride.user_id,
              amount: refundAmount, type: 'ESCROW_REFUND', status: 'COMPLETED',
              referenceActivityId: ride.id, completedAt: new Date(),
              metadata: { kind: 'RIDE_CANCEL', fare, fee_kept_by_driver: releaseAmount, reason },
            },
          });
          await this.postEntry(tx, {
            transactionId: rt.id, walletId: pw.id, bucket: 'ESCROW',
            direction: 'DEBIT', amount: refundAmount, currentBalance: Number(pw.balance_escrow) - releaseAmount,
          });
          await this.postEntry(tx, {
            transactionId: rt.id, walletId: pw.id, bucket: 'AVAILABLE',
            direction: 'CREDIT', amount: refundAmount, currentBalance: Number(pw.balance_available),
          });
        }
        return { refundAmount, releaseAmount };
      });

      await this.casRide(ride.id, ['accepted', 'in_progress', 'arrived'],
        `status='cancelled', cancelled_at=now(), cancelled_by='PASSENGER', cancelled_reason=$2, settlement=$3::jsonb`,
        [reason ?? 'cancelada_por_pasajero', JSON.stringify({
          kind: 'WALLET_CANCEL', fare, to_driver: r.releaseAmount, refund_to_passenger: r.refundAmount,
          free_window: withinFreeWindow, at: new Date().toISOString(),
        })]);

      return {
        tripId: ride.id, status: 'cancelled',
        fare, fee_to_driver: r.releaseAmount, refunded: r.refundAmount, free_window: withinFreeWindow,
      };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        const orig = await this.findTx(k.refund) || await this.findTx(k.cancelRelease);
        if (orig) {
          await this.casRide(ride.id, ['accepted', 'in_progress', 'arrived'],
            `status='cancelled', cancelled_at=now(), cancelled_by='PASSENGER', cancelled_reason=$2`, [reason ?? 'cancelada_por_pasajero']);
          return { tripId: ride.id, status: 'cancelled', replay: true };
        }
      }
      throw e;
    }
  }

  // -------------------------------------------------------------------------
  // 6) Cancelación del CONDUCTOR: reembolso total al pasajero (nunca paga) +
  //    strike. 3 faltas en 7 días → suspensión 24 h; reincidente → 7 días.
  // -------------------------------------------------------------------------
  async cancelByDriver(params: { driverId: string; tripId: string; reason?: string }) {
    const ride = await this.getRide(params.tripId);
    if (ride.driver_id !== params.driverId) throw new DomainError('NOT_DRIVER', 'No estás asignado a este viaje');
    if (!['accepted', 'in_progress', 'arrived'].includes(ride.status)) {
      throw new DomainError('TRIP_NOT_CANCELLABLE', 'El viaje ya no se puede cancelar');
    }
    const k = this.keys(ride.id);
    const reason = typeof params.reason === 'string' && params.reason.trim() ? params.reason.trim().slice(0, 120) : 'cancelada_por_conductor';

    const lockTx = await this.findTx(k.lock);
    if (lockTx && ride.settlement_kind === 'WALLET') {
      const existing = await this.findTx(k.refund);
      if (!existing) {
        const fare = this.fareOf(ride);
        try {
          await this.db.$transaction(async (tx: any) => {
            const pw = await this.lockWallet(tx, ride.user_id);
            const rt = await tx.transaction.create({
              data: {
                idempotencyKey: k.refund,
                senderId: ride.user_id, receiverId: ride.user_id,
                amount: fare, type: 'ESCROW_REFUND', status: 'COMPLETED',
                referenceActivityId: ride.id, completedAt: new Date(),
                metadata: { kind: 'RIDE_DRIVER_CANCEL', fare, reason },
              },
            });
            await this.postEntry(tx, {
              transactionId: rt.id, walletId: pw.id, bucket: 'ESCROW',
              direction: 'DEBIT', amount: fare, currentBalance: Number(pw.balance_escrow),
            });
            await this.postEntry(tx, {
              transactionId: rt.id, walletId: pw.id, bucket: 'AVAILABLE',
              direction: 'CREDIT', amount: fare, currentBalance: Number(pw.balance_available),
            });
          });
        } catch (e: any) {
          if (e?.code !== 'P2002') throw e;
        }
      }
    }

    await this.casRide(ride.id, ['accepted', 'in_progress', 'arrived'],
      `status='cancelled', cancelled_at=now(), cancelled_by='DRIVER', cancelled_reason=$2`, [reason]);

    // Strike sobre datos reales: cancelaciones del conductor en 7 días.
    const strikes: any[] = await this.rides.$queryRaw`
      SELECT count(*)::int AS n FROM mobility.taxi_requests
      WHERE driver_id = ${params.driverId}::uuid AND cancelled_by = 'DRIVER'
        AND cancelled_at > now() - interval '7 days'`;
    let suspension: any = null;
    if (Number(strikes[0]?.n ?? 0) >= 3) {
      const rows: any[] = await this.rides.$queryRaw`
        UPDATE mobility.drivers
        SET suspension_count = suspension_count + 1,
            suspended_until = now() + (CASE WHEN suspension_count >= 1 THEN interval '7 days' ELSE interval '24 hours' END),
            updated_at = now()
        WHERE user_id = ${params.driverId}::uuid
        RETURNING suspended_until, suspension_count`;
      suspension = rows[0] ? { suspended_until: rows[0].suspended_until, suspension_count: rows[0].suspension_count } : { suspended_until: null, note: 'sin alta de conductor: falta' };
    }
    return { tripId: ride.id, status: 'cancelled', refund: !!lockTx, strikes_7d: Number(strikes[0]?.n ?? 0), suspension };
  }

  // -------------------------------------------------------------------------
  // 7) DISPUTA (pasajero): «no subí», cierre automático con el que no está de
  //    acuerdo… Abre en LOCKED (congela cierre/auto) y también tras SETTLED
  //    dentro de la ventana de reclamación de la casa (7 días). El dinero
  //    espera al soporte; la resolución puede REVERSAR fee+release.
  // -------------------------------------------------------------------------
  async dispute(params: { passengerId: string; tripId: string; reason: string }) {
    const ride = await this.getRide(params.tripId);
    if (ride.user_id !== params.passengerId) throw new DomainError('NOT_OWNER', 'Solo el pasajero puede disputar su viaje');
    if (ride.settlement_kind !== 'WALLET') throw new DomainError('DISPUTE_WALLET_ONLY', 'Los viajes en efectivo se aclaran con el conductor: no hay dinero que revertir');
    const k = this.keys(ride.id);
    const lockTx = await this.findTx(k.lock);
    if (!lockTx) throw new DomainError('NOT_LOCKED', 'No hay fare bloqueado que disputar');
    const settled = await this.findTx(k.release);
    if (settled) {
      const closedAt = ride.completed_at ?? settled.completedAt;
      if (!closedAt || closedAt.getTime() < Date.now() - DISPUTE_WINDOW_DAYS * 86_400_000) {
        throw new DomainError('DISPUTE_WINDOW_CLOSED', `La disputa de viajes cerrados cabe en ${DISPUTE_WINDOW_DAYS} días`);
      }
    }
    const reason = typeof params.reason === 'string' && params.reason.trim() ? params.reason.trim().slice(0, 280) : '';
    if (reason.length < 10) throw new DomainError('REASON_REQUIRED', 'Describe el motivo de la disputa');
    await this.casRide(ride.id, ['accepted', 'in_progress', 'arrived', 'completed'],
      `disputed_at=now(), dispute_reason=$2`, [reason]);
    return { tripId: ride.id, disputed: true, reason };
  }

  // -------------------------------------------------------------------------
  // 8) Resolución de disputa (ADMIN) — patrón resolveDispute de escrow.
  //    LOCKED: libera al conductor o reembolsa al pasajero.
  //    SETTLED: CLOSE (queda) o REFUND (revira release + fee del conductor).
  // -------------------------------------------------------------------------
  async resolveDispute(params: {
    adminId: string; tripId: string; outcome: 'RELEASE_DRIVER' | 'REFUND_PASSENGER' | 'CLOSE';
    note: string; idempotencyKey: string;
  }) {
    const ride = await this.getRide(params.tripId);
    if (!ride.disputed_at || ride.dispute_resolved_at) {
      throw new DomainError('NOT_DISPUTED', 'El viaje no tiene una disputa abierta');
    }
    const k = this.keys(ride.id);
    const settledTx = await this.findTx(k.release);
    const note = typeof params.note === 'string' ? params.note.trim().slice(0, 200) : '';
    const fare = this.fareOf(ride);

    if (!settledTx) {
      if (params.outcome === 'RELEASE_DRIVER') {
        const s = await this.settle({ tripId: ride.id, actor: { type: 'ADMIN', id: params.adminId } });
        await this.casRide(ride.id, ['completed', 'arrived', 'in_progress', 'accepted'],
          `dispute_resolved_at=now(), settlement=(COALESCE(settlement,'{}'::jsonb) || $2::jsonb)`,
          [JSON.stringify({ dispute: { outcome: 'RELEASE_DRIVER', note, admin: params.adminId, at: new Date().toISOString() } })]);
        return s;
      }
      if (params.outcome === 'CLOSE') {
        await this.casRide(ride.id, ['accepted', 'in_progress', 'arrived'],
          `dispute_resolved_at=now(), settlement=(COALESCE(settlement,'{}'::jsonb) || $2::jsonb)`,
          [JSON.stringify({ dispute: { outcome: 'CLOSE', note, admin: params.adminId, at: new Date().toISOString() } })]);
        return { tripId: ride.id, resolved: 'CLOSE', money: 'unchanged' };
      }
      // REFUND_PASSENGER sobre viaje aún bloqueado → reembolso total.
      const existing = await this.findTx(k.disputeRefund);
      if (!existing) {
        await this.db.$transaction(async (tx: any) => {
          const pw = await this.lockWallet(tx, ride.user_id);
          const rt = await tx.transaction.create({
            data: {
              idempotencyKey: k.disputeRefund,
              senderId: ride.user_id, receiverId: ride.user_id,
              amount: fare, type: 'ESCROW_REFUND', status: 'COMPLETED',
              referenceActivityId: ride.id, completedAt: new Date(),
              metadata: { kind: 'RIDE_DISPUTE_REFUND', note, admin: params.adminId },
            },
          });
          await this.postEntry(tx, {
            transactionId: rt.id, walletId: pw.id, bucket: 'ESCROW',
            direction: 'DEBIT', amount: fare, currentBalance: Number(pw.balance_escrow),
          });
          await this.postEntry(tx, {
            transactionId: rt.id, walletId: pw.id, bucket: 'AVAILABLE',
            direction: 'CREDIT', amount: fare, currentBalance: Number(pw.balance_available),
          });
        });
      }
      await this.casRide(ride.id, ['accepted', 'in_progress', 'arrived'],
        `status='cancelled', cancelled_at=now(), cancelled_by='SYSTEM', cancelled_reason='dispute_resolved_refund', dispute_resolved_at=now(), settlement=(COALESCE(settlement,'{}'::jsonb) || $2::jsonb)`,
        [JSON.stringify({ dispute: { outcome: 'REFUND_PASSENGER', note, fare, admin: params.adminId, at: new Date().toISOString() } })]);
      return { tripId: ride.id, resolved: 'REFUND_PASSENGER', refund: fare };
    }

    // —— Caso SETTLED: la disputa puede devolver el viaje al pasajero.
    if (params.outcome !== 'REFUND_PASSENGER') {
      await this.casRide(ride.id, ['completed'],
        `dispute_resolved_at=now(), settlement=(COALESCE(settlement,'{}'::jsonb) || $2::jsonb)`,
        [JSON.stringify({ dispute: { outcome: params.outcome, note, admin: params.adminId, at: new Date().toISOString() } })]);
      return { tripId: ride.id, resolved: params.outcome, money: 'unchanged' };
    }
    const reversed = await this.findTx(k.feeReverse);
    if (!reversed) {
      const fee = Math.min(Math.max(Number((ride.fee_info as any)?.fee ?? 0), 0), fare);
      const net = fare - fee;
      const PLATFORM = process.env.PLATFORM_USER_ID ?? '00000000-0000-0000-0000-000000000001';
      // El pasajero recupera el fare COMPLETO: el conductor devuelve su NETO y
      // la plataforma devuelve su FEE (cada uno devuelve lo que cobró, criterio
      // DiDi). La invariant del viaje sigue cuadrando: el RELEASE y el FEE
      // originales se anulan con el REFUND(net) y el FEE-reversa(fee).
      await this.db.$transaction(async (tx: any) => {
        // Orden de la casa: usuarios por UUID ascendente; plataforma, al final.
        const [pw, dw] = await this.lockTwoWallets(tx, ride.user_id, ride.driver_id!);
        if (net > 0) {
          const rt = await tx.transaction.create({
            data: {
              idempotencyKey: k.disputeRefund,
              senderId: ride.driver_id!, receiverId: ride.user_id,
              amount: net, type: 'ESCROW_REFUND', status: 'COMPLETED',
              referenceActivityId: ride.id, completedAt: new Date(),
              metadata: { kind: 'RIDE_DISPUTE_REVERSAL_DRIVER', note, admin: params.adminId },
            },
          });
          await this.postEntry(tx, {
            transactionId: rt.id, walletId: dw.id, bucket: 'AVAILABLE',
            direction: 'DEBIT', amount: net, currentBalance: Number(dw.balance_available),
          });
          await this.postEntry(tx, {
            transactionId: rt.id, walletId: pw.id, bucket: 'AVAILABLE',
            direction: 'CREDIT', amount: net, currentBalance: Number(pw.balance_available),
          });
        }
        if (fee > 0) {
          const rows: any[] = await tx.$queryRaw`
            SELECT * FROM wallets WHERE user_id = ${PLATFORM}::uuid FOR UPDATE`;
          if (rows.length === 0) throw new DomainError('PLATFORM_WALLET_MISSING', 'Monedero de la plataforma no provisionado');
          const ftx = await tx.transaction.create({
            data: {
              idempotencyKey: k.feeReverse,
              senderId: PLATFORM, receiverId: ride.user_id,
              amount: fee, type: 'FEE', status: 'COMPLETED',
              referenceActivityId: ride.id, completedAt: new Date(),
              metadata: { kind: 'RIDE_FEE_REVERSAL', baseAmount: fare, note, admin: params.adminId },
            },
          });
          await this.postEntry(tx, {
            transactionId: ftx.id, walletId: rows[0].id, bucket: 'AVAILABLE',
            direction: 'DEBIT', amount: fee, currentBalance: Number(rows[0].balance_available),
          });
          await this.postEntry(tx, {
            transactionId: ftx.id, walletId: pw.id, bucket: 'AVAILABLE',
            direction: 'CREDIT', amount: fee, currentBalance: Number(pw.balance_available) + net,
          });
        }
      });
    }
    await this.casRide(ride.id, ['completed'],
      `dispute_resolved_at=now(), settlement=(COALESCE(settlement,'{}'::jsonb) || $2::jsonb)`,
      [JSON.stringify({ dispute: { outcome: 'REFUND_PASSENGER_REVERSAL', note, fare, admin: params.adminId, at: new Date().toISOString() } })]);
    return { tripId: ride.id, resolved: 'REFUND_PASSENGER', refund: fare, reversed: true };
  }

  // -------------------------------------------------------------------------
  // 9) Vista de liquidación para la app (y reparación perezosa de cache).
  // -------------------------------------------------------------------------
  async getSettlementView(params: { userId: string; tripId: string }) {
    const ride = await this.getRide(params.tripId);
    const isParty = ride.user_id === params.userId || ride.driver_id === params.userId;
    if (!isParty) {
      throw new DomainError('NOT_TRIP_PARTICIPANT', 'No tienes acceso a la liquidación de este viaje');
    }
    // Reparación perezosa del cache contra el ledger (barato: solo esta fila).
    try { await this.repairOne(ride); } catch { /* la vista manda aunque el repair falle */ }

    const k = this.keys(ride.id);
    const [lockTx, releaseTx, refundTx, cancelTx, feeTx] = await Promise.all([
      this.findTx(k.lock), this.findTx(k.release), this.findTx(k.refund),
      this.findTx(k.cancelRelease), this.findTx(k.releaseFee),
    ]);
    const fare = this.fareOf(ride);
    const feeInfo: any = ride.fee_info ?? {};
    // Antes del lock no hay fee congelada: la vista muestra la PROYECCIÓN con
    // la política vigente (misma fórmula que freezeFee) para que la app pueda
    // enseñar «comisión X · neto Y» ANTES de confirmar con PIN. Cero fórmulas
    // en el cliente: el número lo pone siempre el servidor.
    let fee = Number(feeInfo.fee ?? 0);
    if (!lockTx && fare > 0) fee = (await this.quoteView(ride.city, fare))?.fee ?? 0;
    const isDriver = ride.driver_id === params.userId;

    let state: string;
    if (ride.disputed_at && !ride.dispute_resolved_at) state = 'disputed';
    else if (ride.status === 'cancelled') state = 'cancelled';
    else if (ride.status === 'completed') state = 'settled';
    else if (ride.status === 'arrived') state = 'arrival';
    else if (releaseTx) state = 'settled';
    else if (lockTx) state = 'locked';
    else if (ride.settlement_kind === 'CASH') state = 'cash';
    else state = 'proposed';

    return {
      tripId: ride.id,
      role: isDriver ? 'DRIVER' : 'PASSENGER',
      status: ride.status,
      state,
      kind: ride.settlement_kind ?? null,
      city: ride.city ?? null,
      fare,
      fee,
      net: Math.max(fare - fee, 0),
      money: {
        locked: !!lockTx, released: !!releaseTx, refunded: !!refundTx,
        cancel_fee_to_driver: cancelTx ? Number(cancelTx.amount) : 0,
        platform_fee: feeTx ? Number(feeTx.amount) : 0,
      },
      timers: {
        free_cancel_until: ride.accepted_at
          ? new Date(ride.accepted_at.getTime() + FREE_WINDOW_MIN * 60_000).toISOString() : null,
        auto_close_at: ride.arrived_at
          ? new Date(ride.arrived_at.getTime() + AUTO_CLOSE_MIN * 60_000).toISOString() : null,
      },
      timestamps: {
        locked_at: ride.payment_locked_at ?? null,
        arrived_at: ride.arrived_at ?? null,
        completed_at: ride.completed_at ?? null,
        cancelled_at: ride.cancelled_at ?? null,
      },
      dispute: ride.disputed_at ? {
        at: ride.disputed_at, reason: ride.dispute_reason, resolved_at: ride.dispute_resolved_at,
      } : null,
      settlement: ride.settlement ?? null,
      payout_estimate: isDriver && releaseTx ? { net: Math.max(fare - fee, 0) } : null,
    };
  }

  // -------------------------------------------------------------------------
  // 10) Barrido periódico: auto-cierre, zombies bloqueados, cache caído.
  // -------------------------------------------------------------------------
  private async sweepAll() {
    const open: any[] = await this.rides.$queryRaw`
      SELECT id FROM mobility.taxi_requests
      WHERE settlement_kind = 'WALLET'
        AND status IN ('accepted','in_progress','arrived')
      ORDER BY updated_at ASC LIMIT 25`;
    for (const row of open) {
      await this.sweepOne(String(row.id)).catch(() => undefined);
    }
    // Cancelados/vivales con dinero bloqueado sin liquidar (APK vieja, caídas):
    // la comprobación del ledger se hace EN EL CLIENTE WALLET por viaje
    // (repairOne), nunca cruzando esquemas en una sola consulta.
    const stuck: any[] = await this.rides.$queryRaw`
      SELECT id FROM mobility.taxi_requests
      WHERE settlement_kind = 'WALLET' AND status = 'cancelled'
        AND payment_locked_at IS NOT NULL
        AND updated_at < now() - interval '10 minutes'
      ORDER BY updated_at ASC LIMIT 10`;
    for (const row of stuck) {
      await this.sweepOne(String(row.id)).catch(() => undefined);
    }
  }

  /** Reconcilia UN viaje contra su dinero (reparación perezosa del cache). */
  async repairOne(ride: any) {
    const k = this.keys(ride.id);
    const lockTx = await this.findTx(k.lock);
    // Zombie con lock: 90 min de inactividad → reembolso total y cancelado SYSTEM.
    if (lockTx && ['accepted', 'in_progress', 'arrived'].includes(ride.status)
      && ride.updated_at && ride.updated_at.getTime() < Date.now() - ZOMBIE_MINUTES * 60_000) {
      const refundExists = await this.findTx(k.refund);
      if (!refundExists) {
        const fare = this.fareOf(ride);
        try {
          await this.db.$transaction(async (tx: any) => {
            const pw = await this.lockWallet(tx, ride.user_id);
            const rt = await tx.transaction.create({
              data: {
                idempotencyKey: k.refund,
                senderId: ride.user_id, receiverId: ride.user_id,
                amount: fare, type: 'ESCROW_REFUND', status: 'COMPLETED',
                referenceActivityId: ride.id, completedAt: new Date(),
                metadata: { kind: 'RIDE_AUTO_EXPIRE', fare },
              },
            });
            await this.postEntry(tx, {
              transactionId: rt.id, walletId: pw.id, bucket: 'ESCROW',
              direction: 'DEBIT', amount: fare, currentBalance: Number(pw.balance_escrow),
            });
            await this.postEntry(tx, {
              transactionId: rt.id, walletId: pw.id, bucket: 'AVAILABLE',
              direction: 'CREDIT', amount: fare, currentBalance: Number(pw.balance_available),
            });
          });
          await this.casRide(ride.id, ['accepted', 'in_progress', 'arrived'],
            `status='cancelled', cancelled_at=now(), cancelled_by='SYSTEM', cancelled_reason='auto_expired_settled'`, []);
        } catch (e: any) { if (e?.code !== 'P2002') throw e; }
      } else {
        await this.casRide(ride.id, ['accepted', 'in_progress', 'arrived'],
          `status='cancelled', cancelled_at=now(), cancelled_by='SYSTEM', cancelled_reason='auto_expired_settled'`, []);
      }
      return;
    }
    // Cancelado sin reembolso con lock COMPLETED (APK vieja) → devuelve todo.
    if (lockTx && ride.status === 'cancelled') {
      const refundExists = await this.findTx(k.refund) || await this.findTx(k.cancelRelease) || await this.findTx(k.disputeRefund);
      if (!refundExists) {
        const fare = this.fareOf(ride);
        try {
          await this.db.$transaction(async (tx: any) => {
            const pw = await this.lockWallet(tx, ride.user_id);
            const rt = await tx.transaction.create({
              data: {
                idempotencyKey: k.refund,
                senderId: ride.user_id, receiverId: ride.user_id,
                amount: fare, type: 'ESCROW_REFUND', status: 'COMPLETED',
                referenceActivityId: ride.id, completedAt: new Date(),
                metadata: { kind: 'RIDE_RECONCILE_REFUND', fare },
              },
            });
            await this.postEntry(tx, {
              transactionId: rt.id, walletId: pw.id, bucket: 'ESCROW',
              direction: 'DEBIT', amount: fare, currentBalance: Number(pw.balance_escrow),
            });
            await this.postEntry(tx, {
              transactionId: rt.id, walletId: pw.id, bucket: 'AVAILABLE',
              direction: 'CREDIT', amount: fare, currentBalance: Number(pw.balance_available),
            });
          });
        } catch (e: any) { if (e?.code !== 'P2002') throw e; }
      }
      return;
    }
    // Completed con release (o sin él pero WALLET y abierto): sincroniza cache.
    if (ride.settlement_kind === 'WALLET') {
      const releaseTx = await this.findTx(k.release);
      if (releaseTx && ride.status !== 'completed') await this.syncRideAfterRelease(ride);
      if (!releaseTx && ride.status === 'completed') {
        // El viaje se cerró por la puerta antigua teniendo lock: cierra por la
        // buena — libera y comisiona (es el dinero del pasajero ya bloqueado).
        await this.settle({ tripId: ride.id, actor: { type: 'SYSTEM' } }).catch(() => undefined);
      }
    } else if (!ride.settlement_kind && ['completed'].includes(ride.status)) {
      await this.markCashClosed(ride);
    }
  }

  private async sweepOne(tripId: string) {
    const ride = await this.getRide(tripId);
    await this.repairOne(ride);
    // Auto-cierre a los 10 min de la llegada (si sigue sin disputar).
    if (ride.settlement_kind === 'WALLET' && ride.arrived_at && !ride.disputed_at
      && ['in_progress', 'arrived'].includes(ride.status)
      && ride.arrived_at.getTime() <= Date.now() - AUTO_CLOSE_MIN * 60_000) {
      await this.settle({ tripId: ride.id, actor: { type: 'SYSTEM' } });
    }
  }
}
