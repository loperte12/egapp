# =============================================================================
# parche91 — P1-c LIQUIDACIÓN DE VIAJES DE TAXI AL LEDGER
# (docs/P1-c-LIQUIDACION-VIAJES.md — decisiones del dueño CERRADAS 16/09/2026)
#
# Toca SOLO ficheros existentes; los dos nuevos (ride-settlement.service.ts y
# ride-settlement.controller.ts) se suben aparte y se colocan antes de correr
# esto. Cada pieza exige UNA aparición exacta de su anclaje; si algo no cuadra
# NO se escribe nada. Deja .bak con el sello.
#
#   1. payment-auth.service.ts · uniones de scope += 'TRIP' (token PIN de viaje)
#   2. http/dto.ts            · PaymentTokenDto acepta scope TRIP
#   3. fee.service.ts         · FeeScopeT += TAXI_MALABO/TAXI_BATA + applyFee
#                              puede recibir overrideFee (la fee CONGELADA del
#                              fee_info del viaje: no se recalcula con política
#                              nueva a mitad de viaje)
#   4. prisma/schema.prisma   · enum PaymentScope += TRIP; enum FeeScope +=
#                              TAXI_MALABO, TAXI_BATA (regenerar cliente)
#   5. mobility.controller.ts · city en POST /trips; suspensión por strikes al
#                              aceptar; el flujo monedero manda sobre el antiguo
#                              (completed/cancelled con lock → redirigidos);
#                              registro CASH al completar viajes de efectivo;
#                              cancelled_by en todas las salidas; columnas de
#                              liquidación en el panel del conductor y en el
#                              historial
#   6. wallet.service.ts +    · POST /v1/wallet/pin — alta/cambio del PIN de 6
#      wallet.controller.ts     dígitos PARA USUARIOS DE LA AUTH UNIFICADA: hoy
#                              el pin_hash provisionado es la contraseña (no
#                              pasa el formato 6d y nadie puede emitir token de
#                              pago). Se verifica la contraseña mobility antes
#                              de escribir el PIN nuevo.
#   7. http/app.module.ts     · controllers + providers de la liquidación
#
# Uso:  python3 /root/parche91-ride-settlement.py
# =============================================================================
import shutil
import sys

SELLO = 'ride-settlement-p1c-20260916'

# ── 1. payment-auth: scope TRIP en emisión y consumo ─────────────────────────
PA_P = '/opt/mirror/app/src/services/payment-auth.service.ts'
PA_OLD = "    scope: 'DEPOSIT' | 'WITHDRAWAL' | 'ESCROW_LOCK' | 'DISPUTE_CONFIRM';"
PA_NEW = "    scope: 'DEPOSIT' | 'WITHDRAWAL' | 'ESCROW_LOCK' | 'DISPUTE_CONFIRM' | 'TRIP';"
# (aparece 2 veces: issuePaymentToken y requirePaymentToken — ambas se ensanchan)
PA_N = 2

# ── 2. dto: PaymentTokenDto ──────────────────────────────────────────────────
DT_P = '/opt/mirror/app/src/http/dto.ts'
DT_OLD = """  @IsIn(['DEPOSIT', 'WITHDRAWAL', 'ESCROW_LOCK', 'DISPUTE_CONFIRM'])
  scope!: 'DEPOSIT' | 'WITHDRAWAL' | 'ESCROW_LOCK' | 'DISPUTE_CONFIRM';"""
DT_NEW = """  // P1-c: TRIP — confirmar con PIN el fare pactado de un viaje de taxi.
  @IsIn(['DEPOSIT', 'WITHDRAWAL', 'ESCROW_LOCK', 'DISPUTE_CONFIRM', 'TRIP'])
  scope!: 'DEPOSIT' | 'WITHDRAWAL' | 'ESCROW_LOCK' | 'DISPUTE_CONFIRM' | 'TRIP';"""

# ── 3. fee.service: scope taxi + overrideFee ─────────────────────────────────
FE_P = '/opt/mirror/app/src/services/fee.service.ts'
FE_OLD_UNION = "export type FeeScopeT = 'ESCROW_SALE' | 'WITHDRAWAL' | 'DEPOSIT';"
FE_NEW_UNION = ("export type FeeScopeT = 'ESCROW_SALE' | 'WITHDRAWAL' | 'DEPOSIT'\n"
                "  | 'TAXI_MALABO' | 'TAXI_BATA';  // P1-c: comisión de viaje POR CIUDAD (política en fee_policies)")
FE_OLD_SIGN = """    payerWalletId: string;
    payerBucketBalance: number;
    agentUserId?: string;
  }): Promise<{ fee: number; agentShare: number; platformShare: number; feeTransactionId: string | null }> {
    const { fee, policy } = await this.quote(params.scope, params.baseAmount);"""
FE_NEW_SIGN = """    payerWalletId: string;
    payerBucketBalance: number;
    agentUserId?: string;
    /** P1-c (viajes): el llamador pasó una fee CONGELADA al pactar el servicio
     *  (fee_info del viaje). Cuando viene, NO se recalcula: la política puede
     *  haber cambiado entre medias y el usuario pactó otro número. Reparto sin
     *  política: íntegra a la plataforma. */
    overrideFee?: number;
  }): Promise<{ fee: number; agentShare: number; platformShare: number; feeTransactionId: string | null }> {
    const { fee, policy } = params.overrideFee !== undefined
      ? { fee: Math.max(0, Math.min(Math.round(params.overrideFee), params.baseAmount)), policy: null as any }
      : await this.quote(params.scope, params.baseAmount);"""

# ── 4. prisma schema (wallet): enums ──────────────────────────────────────────
PR_P = '/opt/mirror/app/prisma/schema.prisma'
PR_OLD_PAY = """enum PaymentScope {
  DEPOSIT
  WITHDRAWAL
  ESCROW_LOCK
  DISPUTE_CONFIRM

  @@map("payment_scope")
}"""
PR_NEW_PAY = """enum PaymentScope {
  DEPOSIT
  WITHDRAWAL
  ESCROW_LOCK
  DISPUTE_CONFIRM
  TRIP

  @@map("payment_scope")
}"""
PR_OLD_FEE = """enum FeeScope {
  ESCROW_SALE
  WITHDRAWAL
  DEPOSIT

  @@map("fee_scope")
}"""
PR_NEW_FEE = """enum FeeScope {
  ESCROW_SALE
  WITHDRAWAL
  DEPOSIT
  TAXI_MALABO
  TAXI_BATA

  @@map("fee_scope")
}"""

# ── 5. mobility.controller ────────────────────────────────────────────────────
MO_P = '/opt/mirror/app/src/mobility/mobility.controller.ts'

# 5a. POST /trips guarda city (la comisión se cobra POR CIUDAD: sin city no
#     hay lock de wallet — decisión del diseño §2.1).
MO_OLD_CREATE = """    zoneType?: string; requestedPrice?: number; algorithmPrice?: number;
    modality?: string; isPool?: boolean; maxPoolSeats?: number;
  }) {
    if (body.pickupLat == null || body.dropoffLat == null) throw this.bad('COORDS_REQUIRED', 'pickup y dropoff son obligatorios');"""
MO_NEW_CREATE = """    zoneType?: string; requestedPrice?: number; algorithmPrice?: number;
    modality?: string; isPool?: boolean; maxPoolSeats?: number;
    city?: string;   // P1-c: 'Malabo' | 'Bata' — la comisión del viaje es por ciudad
  }) {
    if (body.pickupLat == null || body.dropoffLat == null) throw this.bad('COORDS_REQUIRED', 'pickup y dropoff son obligatorios');
    const city = ['Malabo', 'Bata'].includes(String(body.city ?? '').trim()) ? String(body.city).trim() : null;"""
MO_OLD_INS = """        modality, requested_price, algorithm_price, is_pool, max_pool_seats, status
      ) VALUES (
        ${u.userId}::uuid, ${body.pickupLat}, ${body.pickupLng}, ${body.pickupAddress ?? null},
        ${body.dropoffLat}, ${body.dropoffLng}, ${body.dropoffAddress ?? null}, ${body.zoneType ?? 'inside'},
        ${body.modality ?? null}, ${body.requestedPrice ?? null}, ${body.algorithmPrice ?? null},
        ${body.isPool ?? false}, ${body.maxPoolSeats ?? 1}, 'requested'
      )"""
MO_NEW_INS = """        modality, requested_price, algorithm_price, is_pool, max_pool_seats, status, city
      ) VALUES (
        ${u.userId}::uuid, ${body.pickupLat}, ${body.pickupLng}, ${body.pickupAddress ?? null},
        ${body.dropoffLat}, ${body.dropoffLng}, ${body.dropoffAddress ?? null}, ${body.zoneType ?? 'inside'},
        ${body.modality ?? null}, ${body.requestedPrice ?? null}, ${body.algorithmPrice ?? null},
        ${body.isPool ?? false}, ${body.maxPoolSeats ?? 1}, 'requested', ${city}
      )"""

# 5b. Aceptar: los strikes suspenden (P1-c §2.3 — 3 cancelaciones/7 días).
MO_OLD_ACCEPT = """    const dbl: any[] = await this.db.$queryRaw`SELECT cash_blocked_at FROM mobility.drivers WHERE user_id = ${u.userId}::uuid`;
    if (dbl[0]?.cash_blocked_at) throw this.bad('CASH_BLOCKED', 'Tienes un cobro sin confirmar: no puedes aceptar solicitudes hasta confirmarlo');"""
MO_NEW_ACCEPT = """    const dbl: any[] = await this.db.$queryRaw`SELECT cash_blocked_at, suspended_until FROM mobility.drivers WHERE user_id = ${u.userId}::uuid`;
    if (dbl[0]?.cash_blocked_at) throw this.bad('CASH_BLOCKED', 'Tienes un cobro sin confirmar: no puedes aceptar solicitudes hasta confirmarlo');
    // P1-c: cancelaste 3 viajes en 7 días → suspensión temporal del conductor.
    if (dbl[0]?.suspended_until && new Date(dbl[0].suspended_until).getTime() > Date.now()) {
      throw this.bad('DRIVER_SUSPENDED',
        `Cuenta de conductor suspendida por cancelaciones hasta ${new Date(dbl[0].suspended_until).toISOString()}`);
    }"""

# 5c. PUT /trips/:id/status: el flujo monedero MANDA sobre el antiguo.
#     - completed con lock → hay que cerrar por rides/:id/settle (o auto 10 min)
#     - completed sin lock (efectivo) → se REGISTRACASH y nada de dinero
#     - cancelled con lock → hay que cancelar por rides/:id/cancel (cuota/ventana)
MO_OLD_STATUS = """    const colMap: Record<string, string> = { in_progress: 'started_at', completed: 'completed_at', cancelled: 'cancelled_at' };
    const col = colMap[body.status];
    await this.db.$executeRawUnsafe(
      `UPDATE mobility.taxi_requests SET status = $1, ${col} = now(), updated_at = now() WHERE id = $2::uuid`,
      body.status, id,
    );"""
MO_NEW_STATUS = """    // P1-c: un viaje con el fare bloqueado en el monedero NO se cierra ni se
    // cancela por aquí — el dinero sigue al pasajero/conductor hasta la
    // liquidación (rides/:id/settle, /cancel o /driver-cancel).
    if ((trip as any).settlement_kind === 'WALLET' && (trip as any).payment_locked_at
      && ['completed', 'cancelled'].includes(body.status)) {
      throw this.bad('SETTLEMENT_REQUIRED',
        'Este viaje se paga con el monedero: ciérralo o cancela desde la tarjeta del viaje');
    }
    const colMap: Record<string, string> = { in_progress: 'started_at', completed: 'completed_at', cancelled: 'cancelled_at' };
    const byWho = { in_progress: null, completed: null, cancelled: 'DRIVER' } as Record<string, string | null>;
    const col = colMap[body.status];
    const byCol = byWho[body.status] ? `, cancelled_by = '${byWho[body.status]}'` : '';
    // P1-c §2.1: un viaje CERRADO sin lock queda REGISTRADO como efectivo
    // (settlement=CASH, sin deuda — plan B no activado, decisión §3.4).
    const cashMark = body.status === 'completed' && !(trip as any).settlement_kind
      ? `, settlement_kind = 'CASH'`
      : '';
    await this.db.$executeRawUnsafe(
      `UPDATE mobility.taxi_requests SET status = $1, ${col} = now()${byCol}${cashMark}, updated_at = now() WHERE id = $2::uuid`,
      body.status, id,
    );"""

# 5d. Cancel del pasajero (antigua): cancelled_by + desvío si hay lock.
MO_OLD_CANCEL = """    if (!['requested', 'accepted'].includes(trip.status)) throw this.bad('TRIP_NOT_CANCELLABLE', 'El viaje ya no se puede cancelar');
    const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 120) : null;
    await this.db.$queryRaw`UPDATE mobility.taxi_requests SET status = 'cancelled',
      cancelled_at = now(), cancelled_reason = ${reason}, updated_at = now() WHERE id = ${id}::uuid`;"""
MO_NEW_CANCEL = """    if (!['requested', 'accepted'].includes(trip.status)) throw this.bad('TRIP_NOT_CANCELLABLE', 'El viaje ya no se puede cancelar');
    // P1-c: cancelado con lock = hay reembolso/cuota por medio → flujo de liquidación.
    if ((trip as any).payment_locked_at) {
      throw this.bad('SETTLEMENT_REQUIRED', 'Este viaje tiene el importe bloqueado: cancélalo desde la tarjeta del viaje');
    }
    const reason = typeof body?.reason === 'string' && body.reason.trim() ? body.reason.trim().slice(0, 120) : null;
    await this.db.$queryRaw`UPDATE mobility.taxi_requests SET status = 'cancelled',
      cancelled_at = now(), cancelled_reason = ${reason}, cancelled_by = 'PASSENGER', updated_at = now() WHERE id = ${id}::uuid`;"""

# 5e. Anti-zombi: registrar quién canceló (SYSTEM) y no tocar los bloqueados —
#     su reembolso lo hace el barrido de liquidación.
MO_OLD_ZOMBIE = """    await this.db.$queryRaw`
      UPDATE mobility.taxi_requests
      SET status = 'cancelled', cancelled_at = now(),
          cancelled_reason = COALESCE(cancelled_reason, 'auto_expired'),
          updated_at = now()
      WHERE user_id = ${u.userId}::uuid
        AND status IN ('requested','accepted','in_progress')
        AND updated_at < now() - interval '90 minutes'`;"""
MO_NEW_ZOMBIE = """    await this.db.$queryRaw`
      UPDATE mobility.taxi_requests
      SET status = 'cancelled', cancelled_at = now(),
          cancelled_reason = COALESCE(cancelled_reason, 'auto_expired'),
          cancelled_by = 'SYSTEM',
          updated_at = now()
      WHERE user_id = ${u.userId}::uuid
        AND status IN ('requested','accepted','in_progress')
        AND updated_at < now() - interval '90 minutes'
        AND payment_locked_at IS NULL`;"""

# 5f. Panel del conductor: ver qué se pacta (ciudad, comisión, lock, strikes).
MO_OLD_DRV = """             t.modality, t.requested_price, t.algorithm_price, t.final_price, t.status,
             t.is_pool, t.max_pool_seats,"""
MO_NEW_DRV = """             t.modality, t.requested_price, t.algorithm_price, t.final_price, t.status,
             t.is_pool, t.max_pool_seats,
             t.city, t.settlement_kind, t.payment_locked_at, t.fee_info, t.arrived_at,"""

# 5g. Historial: la liquidación viaja con la fila (detalle en el ítem).
MO_OLD_HIST = """             t.final_price, t.requested_price, t.modality, t.cancelled_reason,
             t.created_at, t.accepted_at, t.started_at, t.completed_at, t.cancelled_at,"""
MO_NEW_HIST = """             t.final_price, t.requested_price, t.modality, t.cancelled_reason,
             t.created_at, t.accepted_at, t.started_at, t.completed_at, t.cancelled_at,
             t.city, t.settlement_kind, t.fee_info, t.settlement, t.cancelled_by, t.disputed_at,"""

# ── 6. wallet: PIN para usuarios de la auth unificada ─────────────────────────
WS_P = '/opt/mirror/app/src/services/wallet.service.ts'
WS_OLD_HEAD = """import { DomainError, PaymentAuthService, hashToken, generateOpaqueToken } from './payment-auth.service';
import { FeeService } from './fee.service';
import { KycGateService } from './kyc-gate.service';
import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../http/prisma.service';"""
WS_NEW_HEAD = """import { DomainError, PaymentAuthService, hashToken, generateOpaqueToken } from './payment-auth.service';
import { FeeService } from './fee.service';
import { KycGateService } from './kyc-gate.service';
import { Inject, Injectable } from '@nestjs/common';
import argon2 from 'argon2';
import { PrismaService } from '../http/prisma.service';
import { MobilityPrismaService } from '../mobility/mobility-prisma.service';"""
WS_OLD_CTOR = """    private readonly fees: FeeService,        // comisión WITHDRAWAL retenida en el hold
    private readonly gate: KycGateService,    // gating KYC (nivel + riesgo + provisioning)
  ) {}"""
WS_NEW_CTOR = """    private readonly fees: FeeService,        // comisión WITHDRAWAL retenida en el hold
    private readonly gate: KycGateService,    // gating KYC (nivel + riesgo + provisioning)
    private readonly mobility: MobilityPrismaService,  // P1-c: verificar contraseña de auth unificada
  ) {}

  /**
   * P1-c — ALTA/CAMBIO DEL PIN DE 6 DÍGITOS para usuarios de la auth unificada.
   *
   * Al provisionar, el pin_hash heredó la contraseña mobility (Argon2id) — y el
   * formato del PIN es 6 dígitos, así que nadie de esa vía podía emitir un
   * token de pago. Aquí se pone el PIN de verdad: hay que probar la contraseña
   * actual (mobility.users.password_hash) o, para cuentas de monedero puro
   * (registro legacy), el PIN anterior. Reincializa intentos/bloqueo.
   */
  async setPin(params: { userId: string; pin: string; password?: string; currentPin?: string }) {
    if (!/^\\d{6}$/.test(params.pin ?? '')) throw new DomainError('PIN_INVALID', 'El PIN son 6 dígitos');
    await this.gate.ensureProvisioned(params.userId);
    const user = await this.db.user.findUnique({ where: { id: params.userId } });
    if (!user) throw new DomainError('WALLET_NOT_FOUND', 'Monedero no encontrado');

    const mu: any[] = await this.mobility.$queryRaw`
      SELECT password_hash FROM mobility.users WHERE id = ${params.userId}::uuid`;
    const puedePorPassword = !!mu[0]?.password_hash;
    let ok = false;
    if (puedePorPassword && params.password) {
      ok = await argon2.verify(mu[0].password_hash, params.password).catch(() => false);
    } else if (!puedePorPassword && params.currentPin) {
      ok = await argon2.verify(user.pinHash, params.currentPin).catch(() => false);
    }
    if (!ok) {
      throw new DomainError(
        puedePorPassword ? 'PASSWORD_REQUIRED' : 'PIN_INVALID',
        puedePorPassword ? 'Escribe tu contraseña para fijar el PIN' : 'El PIN actual no coincide',
      );
    }
    await this.db.user.update({
      where: { id: params.userId },
      data: {
        pinHash: await PaymentAuthService.hashPin(params.pin),
        pinAttempts: 0,
        pinLockedUntil: null,
      },
    });
    return { ok: true };
  }"""
WC_P = '/opt/mirror/app/src/http/wallet.controller.ts'
WC_OLD = """  // POST /v1/wallet/deposits — inicio de CASH_IN con agente (OTP)."""
WC_NEW = """  // POST /v1/wallet/pin — fija/cambia el PIN de 6 dígitos (P1-c: sin PIN no
  // hay token de pago, y los usuarios de la auth unificada llegan sin él).
  @Post('pin')
  @HttpCode(200)
  @Roles('USER', 'AGENT', 'ADMIN')
  setPin(
    @CurrentUser() actor: { userId: string },
    @Body() dto: SetPinDto,
  ) {
    return this.wallets.setPin({
      userId: actor.userId, pin: dto.pin, password: dto.password, currentPin: dto.currentPin,
    });
  }

  // POST /v1/wallet/deposits — inicio de CASH_IN con agente (OTP)."""
WC_OLD_IMP = """import { DepositDto, WithdrawalDto } from './dto';"""
WC_NEW_IMP = """import { DepositDto, SetPinDto, WithdrawalDto } from './dto';"""
DT_OLD_TAIL = """export class DepositDto {"""
DT_NEW_TAIL = """// P1-c: alta/cambio de PIN — contraseña mobility (o PIN anterior en legacy).
export class SetPinDto {
  @Matches(/^\\d{6}$/) pin!: string;
  @IsOptional() @IsString() password?: string;
  @IsOptional() @Matches(/^\\d{6}$/) currentPin?: string;
}

export class DepositDto {"""

# ── 7. app.module: registrar la liquidación ──────────────────────────────────
AM_P = '/opt/mirror/app/src/http/app.module.ts'
AM_OLD_IMP = """import { PaymentAuthService } from '../services/payment-auth.service';"""
AM_NEW_IMP = """import { PaymentAuthService } from '../services/payment-auth.service';
import { RideSettlementService } from '../services/ride-settlement.service';
import { RideSettlementController, AdminRideSettlementController } from './ride-settlement.controller';"""
AM_OLD_CTRL = """    WalletController,
    EscrowController,"""
AM_NEW_CTRL = """    WalletController,
    EscrowController,
    RideSettlementController,
    AdminRideSettlementController,"""
AM_OLD_PROV = """    WalletService,
    EscrowService,"""
AM_NEW_PROV = """    WalletService,
    EscrowService,
    RideSettlementService,"""

# ── 8. error.filter: códigos HTTP de la liquidación (sin esto todo cae a 422) ─
EF_P = '/opt/mirror/app/src/http/error.filter.ts'
EF_OLD = """  ID_INVALID: HttpStatus.BAD_REQUEST,
};"""
EF_NEW = """  ID_INVALID: HttpStatus.BAD_REQUEST,
  // --- P1-c · Liquidación de viajes (ride-settlement) ---
  // 400: petición inválida · 403: quién/no puede · 404: no existe · 409: estado
  TRIP_NOT_FOUND: HttpStatus.NOT_FOUND,
  NOT_OWNER: HttpStatus.FORBIDDEN,
  NOT_TRIP_PARTICIPANT: HttpStatus.FORBIDDEN,
  NOT_DRIVER: HttpStatus.FORBIDDEN,
  ADMIN_REQUIRED: HttpStatus.FORBIDDEN,
  DRIVER_SUSPENDED: HttpStatus.FORBIDDEN,
  // CITY_REQUIRED ya estaba mapeado por una tanda anterior — no duplicar.
  FARE_INVALID: HttpStatus.BAD_REQUEST,
  OUTCOME_INVALID: HttpStatus.BAD_REQUEST,
  TRIP_NOT_ACCEPTED: HttpStatus.CONFLICT,
  TRIP_NOT_ACTIVE: HttpStatus.CONFLICT,
  TRIP_NOT_CANCELLABLE: HttpStatus.CONFLICT,
  TRIP_CHANGED: HttpStatus.CONFLICT,
  NOT_ARRIVED: HttpStatus.CONFLICT,
  NOT_LOCKED: HttpStatus.CONFLICT,
  SETTLEMENT_REQUIRED: HttpStatus.CONFLICT,
  DISPUTE_OPEN: HttpStatus.CONFLICT,
  DISPUTE_WINDOW_CLOSED: HttpStatus.CONFLICT,
  DISPUTE_WALLET_ONLY: HttpStatus.CONFLICT,
  KIND_IS_CASH: HttpStatus.CONFLICT,
  KIND_IS_WALLET: HttpStatus.CONFLICT,
  FEE_POLICY_MISSING: HttpStatus.CONFLICT,
};"""

# ─────────────────────────────────────────────────────────────────────────────
TARGETS = [
    (PA_P, [(PA_OLD, PA_NEW, PA_N)]),
    (DT_P, [(DT_OLD, DT_NEW, 1), (DT_OLD_TAIL, DT_NEW_TAIL, 1)]),
    (FE_P, [(FE_OLD_UNION, FE_NEW_UNION, 1), (FE_OLD_SIGN, FE_NEW_SIGN, 1)]),
    (PR_P, [(PR_OLD_PAY, PR_NEW_PAY, 1), (PR_OLD_FEE, PR_NEW_FEE, 1)]),
    (MO_P, [
        (MO_OLD_CREATE, MO_NEW_CREATE, 1),
        (MO_OLD_INS, MO_NEW_INS, 1),
        (MO_OLD_ACCEPT, MO_NEW_ACCEPT, 1),
        (MO_OLD_STATUS, MO_NEW_STATUS, 1),
        (MO_OLD_CANCEL, MO_NEW_CANCEL, 1),
        (MO_OLD_ZOMBIE, MO_NEW_ZOMBIE, 1),
        (MO_OLD_DRV, MO_NEW_DRV, 1),
        (MO_OLD_HIST, MO_NEW_HIST, 1),
    ]),
    (WS_P, [(WS_OLD_HEAD, WS_NEW_HEAD, 1), (WS_OLD_CTOR, WS_NEW_CTOR, 1)]),
    (WC_P, [(WC_OLD_IMP, WC_NEW_IMP, 1), (WC_OLD, WC_NEW, 1)]),
    (AM_P, [(AM_OLD_IMP, AM_NEW_IMP, 1), (AM_OLD_CTRL, AM_NEW_CTRL, 1), (AM_OLD_PROV, AM_NEW_PROV, 1)]),
    (EF_P, [(EF_OLD, EF_NEW, 1)]),
]

MARCA = 'P1-c'


def main():
    # Primera pasada: verificar TODOS los anclajes antes de tocar nada.
    textos = {}
    problemas = []
    for path, piezas in TARGETS:
        try:
            src = open(path, encoding='utf-8').read()
        except OSError as e:
            problemas.append(f'{path}: {e}')
            continue
        if MARCA in src and 'parche91' not in src and 'TRIP' in src and 'setPin' in src:
            problemas.append(f'{path}: PARECE YA APLICADO (no se toca)')
            continue
        for viejo, _, n in piezas:
            c = src.count(viejo)
            if c != n:
                problemas.append(f'{path}: esperaba {n} aparición(es) y hay {c} → ' + viejo.strip().splitlines()[0][:70])
        textos[path] = src
    if problemas:
        print('FALLO: los anclajes no cuadran. NO SE ESCRIBE NADA.')
        for p in problemas:
            print('  ·', p)
        return 1
    # Segunda pasada: escribir.
    for path, piezas in TARGETS:
        src = textos[path]
        shutil.copyfile(path, f'{path}.bak-{SELLO}')
        for viejo, nuevo, _ in piezas:
            src = src.replace(viejo, nuevo)
        open(path, 'w', encoding='utf-8', newline='').write(src)
        print(f'parchado: {path} (respaldo .bak-{SELLO})')
    print('LISTO — recuerda: SQL 86 ANTES de reiniciar, y `npx prisma generate` (cliente wallet)')
    return 0


sys.exit(main())
