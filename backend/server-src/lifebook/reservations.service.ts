// =============================================================================
// lb42-reservations.service.ts — PARTE 42 · RESERVAS DEL HOTEL (señal + calendario)
//
// Aquí está el corazón del módulo: **reservar noches de verdad**.
//
//   · 🔒 ANTI-SOBREVENTA (lo que faltaba en el código recibido): la tabla
//     `lifebook.reservation_nights` tiene PK (room_type_id, night, unit_index).
//     La reserva inserta una fila por noche y unidad DENTRO de la transacción y
//     exige que se hayan insertado todas (`ON CONFLICT DO NOTHING` + comprobación
//     del número): dos personas que reserven la última habitación a la vez no
//     pueden colar — la segunda inserta menos filas y recibe 409. No es una
//     comprobación de código que se pueda olvidar: es una clave primaria.
//     Además se bloquea (`FOR UPDATE`) la fila del tipo de habitación, que es una
//     fila ESTABLE (el `FOR UPDATE` sobre filas que aún no existen no bloquea nada:
//     ese era el error de Postgres medido en la entrega 54).
//
//   · PAGO PARCIAL: el total y la señal se calculan SIEMPRE en el servidor. La
//     reserva nace retenida con caducidad (`hold_expires_at`) y el hotel confirma
//     el cobro de la señal; el resto se paga al llegar. El estado del DINERO
//     (`payment_status`) va separado del estado de la RESERVA (`status`).
//
//   · IDEMPOTENCIA como en los pedidos (Parte 36): clave obligatoria, reservada
//     DENTRO de la transacción, y la respuesta guardada se devuelve tal cual. El
//     doble toque no crea dos reservas ni dos veces las mismas noches.
//
//   · PUERTAS: huésped, dueño del hotel o ADMIN. Sin identidad no se lee nada
//     (la ausencia de visor nunca amplía el acceso — lección de la Parte 40), y
//     un tercero recibe 403 NOT_RESERVATION_PARTICIPANT.
// =============================================================================
import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash, randomInt } from 'node:crypto';
import { DomainError } from '../services/payment-auth.service';
import { MobilityPrismaService } from '../mobility/mobility-prisma.service';
import { LifebookHotelService, MAX_RANGE_NIGHTS, plazoVencido } from './hotel.service';
import { WalletService } from '../services/wallet.service';

/** Métodos de pago válidos en una reserva de hotel. */
const METHODS = ['transfer', 'deposit', 'in_store', 'billing', 'likebook_wallet'] as const;
// La lista de estados que OCUPAN inventario y la regla del plazo viven en `hotel.service.ts`
// (`ESTADOS_QUE_OCUPAN` / `plazoVencido` / `ocupaInventario`). Aquí había **otra copia** de esa
// lista, sin usar: es exactamente el patrón que hizo daño en LH-06 (cuatro copias de una regla) y
// en LH-08 (seis copias del predicado de ocupación, la mitad mirando solo `hold`).

/**
 * Estados desde los que se puede CANCELAR. **Esta es la lista.**
 *
 * 🔒 La lee la app desde el contrato (`packages/contracts/src/reservation-flow.ts`) y el
 * panel del hotelero desde aquí, así que no puede haber dos versiones: si divergen, la
 * pantalla ofrece lo que el servidor rechaza (o al revés), que es exactamente el estado
 * en el que estaba `LH-06` — la regla escrita a mano en CUATRO sitios.
 *
 * Y `checked_in` **no está**: con el huésped dentro la reserva se está consumiendo y la
 * única salida es `checkout`. Ofrecer «cancelar» ahí prometía una devolución que el hotel
 * no debía.
 */
export const CANCELABLES: string[] = ['hold', 'pending', 'confirmed'];
/** Horas que se retiene una reserva por transferencia mientras llega la señal. */
const TRANSFER_HOLD_HOURS = (() => {
  const n = Number(process.env.HOTEL_TRANSFER_HOLD_HOURS ?? 24);
  return Number.isFinite(n) && n >= 1 && n <= 168 ? Math.floor(n) : 24;
})();

/** Hash estable (64 bits) del par usuario+clave, para el cerrojo de idempotencia. */
function lockKey(userId: string, key: string): bigint {
  const h = createHash('sha256').update(`${userId}|createReservation|${key}`).digest();
  return h.readBigInt64BE(0);
}

export interface ReservationInput {
  roomTypeId?: string;
  checkIn?: string;
  checkOut?: string;
  units?: number;
  guests?: number;
  guestName?: string;
  guestPhone?: string;
  guestEmail?: string;
  paymentMethod?: string;
  /** Señal que quiere pagar el huésped (0–100 %). Sin esto, la del tipo. */
  depositPercent?: number;
  note?: string;
}

@Injectable()
export class LifebookReservationsService {
  private readonly log = new Logger('LifebookReservations');

  constructor(
    private readonly db: MobilityPrismaService,
    private readonly hotel: LifebookHotelService,
    // Parche 99: el monedero paga la SEÑAL de la reserva (retenida → cobrada al entrar /
    // devuelta al cancelar). Mismo módulo Nest, así que la inyección es directa.
    private readonly wallets: WalletService,
  ) {}

  private get h() {
    return this.hotel;
  }

  // ═══════════════════════════ CREAR RESERVA ════════════════════════════════
  /**
   * Crea la reserva. Requiere `Idempotency-Key` (es dinero y son noches).
   *
   * Todo va en UNA transacción: reserva de la clave → bloqueo del tipo de
   * habitación → disponibilidad y calendario → noches (anti-sobreventa) → fila
   * de la reserva → respuesta guardada.
   */
  async createReservation(guestId: string, dto: ReservationInput, idemKey: string, paymentToken?: string) {
    const key = String(idemKey ?? '').trim().slice(0, 120);
    if (!key) throw new DomainError('IDEMPOTENCY_KEY_REQUIRED', 'Falta la cabecera Idempotency-Key');

    // Camino rápido: si esa reserva ya se completó, se devuelve la misma.
    const prev: any[] = await this.db.$queryRaw`
      SELECT response FROM lifebook.idempotency_keys
       WHERE user_id = ${guestId}::uuid AND endpoint = 'createReservation' AND key = ${key}
         AND (expires_at IS NULL OR expires_at > now()) LIMIT 1`;
    if (prev[0]?.response) return prev[0].response;

    const roomTypeId = this.h.uuid(dto?.roomTypeId, 'Habitación');
    const checkIn = this.h.date(dto?.checkIn, 'Entrada');
    const checkOut = this.h.date(dto?.checkOut, 'Salida');
    const nights = this.h.nightsBetween(checkIn, checkOut);
    if (nights < 1) throw new DomainError('DATE_RANGE_INVALID', 'La salida tiene que ser posterior a la entrada');
    if (nights > MAX_RANGE_NIGHTS) throw new DomainError('RANGE_TOO_LONG', `Como máximo ${MAX_RANGE_NIGHTS} noches por reserva`);
    if (checkIn < this.h.todayMalabo()) throw new DomainError('DATE_IN_PAST', 'La fecha de entrada ya pasó');

    const units = this.h.int(dto?.units, 1, 50, 'Habitaciones', 1) as number;
    const guests = this.h.int(dto?.guests, 1, 200, 'Huéspedes', 1) as number;
    const guestName = this.h.clean(dto?.guestName, 120);
    if (guestName.length < 3) throw new DomainError('GUEST_NAME_REQUIRED', 'Indica el nombre de quien se aloja');
    const guestPhone = this.h.clean(dto?.guestPhone, 24);
    if (guestPhone.replace(/\D/g, '').length < 6) throw new DomainError('GUEST_PHONE_REQUIRED', 'Indica un teléfono de contacto');
    const guestEmail = this.h.clean(dto?.guestEmail, 160) || null;
    const note = this.h.clean(dto?.note, 300) || null;
    const method = this.h.one(dto?.paymentMethod, METHODS, 'in_store', 'PAYMENT_METHOD_INVALID', 'Forma de pago no válida');

    let lockTxId: string | null = null;
    let reservaId: string | null = null;
    let result: any;
    try {
    result = await this.db.$transaction(async (tx: any) => {
      // 1) CERROJO por (usuario, clave) antes de nada: dos peticiones idénticas a
      //    la vez se ordenan aquí. Sin él, la segunda no bloquea en el ON CONFLICT
      //    (lanza violación de clave en cuanto la primera confirma) y el cliente
      //    recibía un 500 en vez de su propia reserva — pasó en el E2E del doble
      //    toque simultáneo.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey(guestId, key)}::bigint)`;

      const reservado: number = await tx.$executeRaw`
        INSERT INTO lifebook.idempotency_keys (user_id, endpoint, key)
        VALUES (${guestId}::uuid, 'createReservation', ${key})
        ON CONFLICT (user_id, endpoint, key) DO NOTHING`;
      if (!reservado) {
        const cur: any[] = await tx.$queryRaw`
          SELECT response FROM lifebook.idempotency_keys
           WHERE user_id = ${guestId}::uuid AND endpoint = 'createReservation' AND key = ${key} LIMIT 1`;
        if (cur[0]?.response) return { replayed: cur[0].response };
        throw new DomainError('IDEMPOTENCY_IN_PROGRESS', 'Esa reserva ya se está creando, espera un momento');
      }

      // 2) 🔒 Fila ESTABLE bloqueada: serializa las reservas de ESTE tipo de
      //    habitación (dos a la vez se ordenan aquí, no se pisan).
      const rtRows: any[] = await tx.$queryRaw`
        SELECT rt.*, s.is_hotel, s.is_active AS shop_active, s.owner_id AS shop_owner, s.name AS shop_name,
               p.status AS product_status
          FROM lifebook.room_types rt
          JOIN lifebook.shops s ON s.id = rt.shop_id
          LEFT JOIN lifebook.products p ON p.id = rt.product_id
         WHERE rt.id = ${roomTypeId}::uuid
         FOR UPDATE OF rt`;
      const rt = rtRows[0];
      if (!rt || !rt.is_hotel || !rt.shop_active || !rt.is_active || rt.product_status !== 'active') {
        throw new DomainError('ROOM_NOT_AVAILABLE', 'Esa habitación ya no está disponible');
      }
      if (rt.shop_owner === guestId) {
        throw new DomainError('CANNOT_BOOK_OWN', 'No puedes reservar en tu propio hotel');
      }
      if (nights < Number(rt.min_nights)) {
        throw new DomainError('MIN_NIGHTS_NOT_MET', `Ese tipo de habitación pide un mínimo de ${rt.min_nights} noche(s)`);
      }
      if (nights > Number(rt.max_nights)) {
        throw new DomainError('MAX_NIGHTS_EXCEEDED', `Como máximo ${rt.max_nights} noche(s) por reserva`);
      }
      if (guests > Number(rt.capacity) * units) {
        throw new DomainError('CAPACITY_EXCEEDED', `En ${units} habitación(es) de ese tipo caben ${Number(rt.capacity) * units} persona(s)`);
      }

      // 3) Forma de pago: tiene que estar ACTIVA en la tienda (no se inventa).
      const pay: any[] = await tx.$queryRaw`
        SELECT method, status FROM lifebook.shop_payment_methods
         WHERE shop_id = ${rt.shop_id}::uuid AND method = ${method} LIMIT 1`;
      if (!pay[0] || pay[0].status !== 'active') {
        throw new DomainError('PAYMENT_METHOD_NOT_ACCEPTED', 'El hotel no acepta esa forma de pago');
      }

      // 4) Calendario + disponibilidad real del rango.
      const noches = this.h.nightsList(checkIn, checkOut);
      const cal: any[] = await tx.$queryRaw`
        SELECT date::text AS date, price_xaf, min_nights, is_closed, note
          FROM lifebook.room_type_calendar
         WHERE room_type_id = ${roomTypeId}::uuid AND date = ANY(${noches}::date[])`;
      const porFecha = new Map<string, any>(cal.map((c) => [c.date, c]));
      const minPedida = noches.reduce((max, n) => Math.max(max, Number(porFecha.get(n)?.min_nights ?? 0)), 0);
      if (minPedida > nights) {
        throw new DomainError('MIN_NIGHTS_NOT_MET', `Esas fechas piden un mínimo de ${minPedida} noche(s)`);
      }
      const occ: any[] = await tx.$queryRaw`
        SELECT rn.night::text AS night, count(*)::int AS usadas
          FROM lifebook.reservation_nights rn
          JOIN lifebook.reservations r ON r.id = rn.reservation_id
         WHERE rn.room_type_id = ${roomTypeId}::uuid AND rn.night = ANY(${noches}::date[])
           AND r.status IN ('hold','pending','confirmed','checked_in')
           -- Ocupa mientras su plazo siga vivo: la regla de plazoVencido() (LH-08).
           AND (r.status NOT IN ('hold','pending') OR r.hold_expires_at IS NULL OR r.hold_expires_at > now())
         GROUP BY rn.night`;
      const usadas = new Map<string, number>(occ.map((o) => [o.night, Number(o.usadas)]));

      // Precio por noche (temporada > fin de semana > base) y disponibilidad.
      const weekend = rt.weekend_price_xaf === null || rt.weekend_price_xaf === undefined ? null : Number(rt.weekend_price_xaf);
      const precios: number[] = [];
      for (const n of noches) {
        const c = porFecha.get(n);
        if (c?.is_closed) {
          throw new DomainError('DATES_CLOSED', `El hotel tiene cerrada la noche del ${n}`);
        }
        const dow = new Date(`${n}T00:00:00Z`).getUTCDay();
        precios.push(c?.price_xaf != null
          ? Number(c.price_xaf)
          : (weekend !== null && (dow === 5 || dow === 6) ? weekend : Number(rt.base_price_xaf)));
        const libre = Number(rt.total_units) - (usadas.get(n) ?? 0);
        if (libre < units) {
          throw new DomainError('ROOM_SOLD_OUT', units === 1
            ? `Ya no queda hueco la noche del ${n}`
            : `Ya no hay ${units} habitaciones libres la noche del ${n}`);
        }
      }
      // El precio de la reserva: el mayor de las noches (snapshot prudente) y el
      // desglose por noche para que el huésped vea exactamente lo que paga.
      const precioNoche = Math.max(...precios);
      const desglose = noches.map((n, i) => ({ date: n, priceXaf: precios[i] }));
      // PAGO PARCIAL: el huésped puede elegir la señal (0 = pagar todo al llegar),
      // pero nunca por encima del 100 % ni por encima de lo que pide el hotel.
      const pctPedido = this.h.int(dto?.depositPercent, 0, 100, 'Señal (%)', null);
      const pctTipo = Number(rt.deposit_percent);
      const pct = pctPedido === null ? pctTipo : Math.min(pctPedido, pctTipo);
      const cuenta = this.h.quote({
        basePriceNight: precioNoche, nights, units,
        cleaningFeeXaf: Number(rt.cleaning_fee_xaf ?? 0), taxesXaf: Number(rt.taxes_xaf ?? 0),
        depositPercent: pct,
      });

      /**
       * 5-bis) EL DINERO DEL MONEDERO (parche 99): la SEÑAL se retiene aquí.
       *
       * El importe lo calcula el servidor (nunca el cliente) y el token de pago (PIN, scope
       * ESCROW_LOCK, importe EXACTO) se consume al retener: uno robado no sirve dos veces.
       *
       * 🔒 LH-09: la clave del cerrojo lleva un NONCE DEL INTENTO, no solo la `Idempotency-Key`.
       * Antes era `lb-hotel:<clave>`; el monedero **devuelve el cerrojo antiguo** cuando la clave
       * ya existe (`replay: true`) y el `catch` de aquí abajo ya lo había devuelto al huésped
       * cuando el primer intento falló. Como la app NO renueva su clave al fallar (a propósito:
       * así el doble toque no crea dos reservas), el reintento —la carrera por la última
       * habitación— enlazaba con la reserva nueva un cerrojo **ya reembolsado**: la reserva decía
       * «señal pagada» sin un franco retenido, y al entrar la liberación fallaba por saldo y el
       * hotel no cobraba nunca.
       *
       * El nonce NO rompe el doble toque: la clave de idempotencia se sigue reservando DENTRO de
       * esta transacción bajo `pg_advisory_xact_lock`, así que dos peticiones idénticas a la vez
       * se ordenan y la segunda devuelve la respuesta guardada **sin llegar hasta aquí**. Lo que
       * cambia es que cada creación que de verdad se ejecuta retiene dinero de verdad.
       */
      if (method === 'likebook_wallet' && cuenta.depositXaf > 0) {
        if (!paymentToken) {
          throw new DomainError('PAYMENT_TOKEN_REQUIRED', 'Falta el token de pago del monedero: confirma la señal con tu PIN');
        }
        const intento = randomInt(1, 2 ** 31).toString(36);
        const lock = await this.wallets.lockForCommerceOrder({
          userId: guestId, amount: cuenta.depositXaf, paymentToken, idempotencyKey: `lb-hotel:${key}:${intento}`,
        });
        lockTxId = lock.transactionId;
      }

      // 5) Retención: con señal por cobrar la habitación se retiene; sin señal,
      //    la reserva queda pendiente de que el hotel confirme (con su plazo).
      const haySenal = cuenta.depositXaf > 0;
      /**
       * 🔒 LH-07: el plazo depende de QUÉ se está esperando, y con el monedero ya no se espera
       * dinero.
       *
       * Antes usaba `hold_minutes` (5–120, por defecto **20 min**) siempre que hubiera señal
       * —también con el monedero, donde la señal **ya está retenida**. Resultado: el huésped
       * pagaba la señal a las 22:00 y a las 22:20 el barrido cancelaba su reserva y le devolvía
       * el dinero si el hotel no había pulsado «confirmar», mientras el hotel creía tener las
       * 24 h que él mismo configuró (`confirmation_hours`) y que su panel muestra como «Horas
       * para confirmar».
       *
       * Con el dinero ya en garantía lo que se espera es **la confirmación del hotel**, así que
       * el plazo es el suyo. `hold_minutes` sigue midiendo lo que siempre midió: cuánto se
       * espera a que LLEGUE una transferencia.
       */
      const esperaDinero = haySenal && method !== 'likebook_wallet';
      const crudo = esperaDinero
        ? (method === 'transfer' ? TRANSFER_HOLD_HOURS * 60 : Number(rt.hold_minutes ?? 20))
        : Number(rt.confirmation_hours ?? 24) * 60;
      const holdMin = Number.isFinite(crudo) && crudo > 0 ? Math.floor(crudo) : 24 * 60;
      const holdExpires = `now() + interval '${holdMin} minutes'`;
      // 17/09 (parche 99: con monedero NO hay espera). «hold» significa «retenida hasta que
      // llegue la transferencia»; si el dinero ya está retenido en el monedero, la reserva nace
      // pendiente de que el hotel confirme, igual que cuando no hay señal que cobrar.
      const status = (haySenal && method !== 'likebook_wallet') ? 'hold' : 'pending';
      // Con monedero la señal queda RETENIDA (escrow) desde el primer instante: el hotel puede
      // confirmar sin esperar comprobantes, y si nunca confirma, el barrido la devuelve.
      const pagoStatus = method === 'likebook_wallet' && cuenta.depositXaf > 0 ? 'deposit_paid' : 'pending';

      const code = await this.nextCode(tx);
      const ins: any[] = await tx.$queryRaw`
        INSERT INTO lifebook.reservations
          (code, shop_id, room_type_id, guest_id, guest_name, guest_phone, guest_email,
           check_in, check_out, nights, units, guests, room_name_snapshot,
           price_per_night_xaf, subtotal_xaf, cleaning_fee_xaf, taxes_xaf, total_xaf,
           deposit_percent, deposit_xaf, remaining_xaf, payment_method, payment_status,
           status, hold_expires_at, note, idempotency_key)
        VALUES
          (${code}, ${rt.shop_id}::uuid, ${roomTypeId}::uuid, ${guestId}::uuid, ${guestName}, ${guestPhone}, ${guestEmail},
           ${checkIn}::date, ${checkOut}::date, ${nights}, ${units}, ${guests}, ${rt.name},
           ${precioNoche}, ${cuenta.subtotalXaf}, ${cuenta.cleaningFeeXaf}, ${cuenta.taxesXaf}, ${cuenta.totalXaf},
           ${cuenta.depositPercent}, ${cuenta.depositXaf}, ${cuenta.remainingXaf}, ${method}, ${pagoStatus},
           ${status}, NULL::timestamptz, ${note}, ${key})
        RETURNING id`;
      const reservationId = ins[0].id as string;
      reservaId = reservationId;

      // La caducidad se pone con una expresión (no se puede interpolar un intervalo
      // como parámetro): sentencia propia y cerrada, sin datos del cliente.
      await tx.$executeRawUnsafe(
        `UPDATE lifebook.reservations SET hold_expires_at = ${holdExpires} WHERE id = $1::uuid`,
        reservationId,
      );

      // 6) 🔒 LAS NOCHES: una fila por noche y unidad. Si alguna está cogida, la
      //    inserción no llega a completarse y se lanza 409 (la transacción entera
      //    se deshace: no queda reserva a medias).
      /**
       * 17/09 (parche 99, noches): SE ELIGEN LAS UNIDADES LIBRES.
       *
       * Antes se insertaban siempre los índices 0..units-1: en un hotel con VARIAS habitaciones
       * del mismo tipo, la SEGUNDA reserva de la misma noche chocaba con la unidad 0 ya cogida
       * (ON CONFLICT DO NOTHING no insertaba nada), el recuento no cuadraba y el huésped recibía
       * «ROOM_SOLD_OUT: alguien acaba de coger esas noches» con el hotel vacío. Lo destapó el e2e
       * del monedero (`lb99a`) al hacer dos reservas seguidas. Ahora se toma la primera unidad
       * libre de cada noche y el `ON CONFLICT` sigue siendo la red contra la sobreventa real
       * (dos a la vez): el que llega segundo inserta menos filas y se le dice que no.
       */
      let insertadas = 0;
      for (const noche of noches) {
        const n: number = await tx.$executeRaw`
          INSERT INTO lifebook.reservation_nights (room_type_id, night, unit_index, reservation_id)
          SELECT ${roomTypeId}::uuid, ${noche}::date, u.idx, ${reservationId}::uuid
            FROM generate_series(0, ${Number(rt.total_units)} - 1) AS u(idx)
           WHERE NOT EXISTS (
                   SELECT 1 FROM lifebook.reservation_nights ya
                    WHERE ya.room_type_id = ${roomTypeId}::uuid
                      AND ya.night = ${noche}::date
                      AND ya.unit_index = u.idx)
           ORDER BY u.idx
           LIMIT ${units}
          ON CONFLICT (room_type_id, night, unit_index) DO NOTHING`;
        insertadas += n;
      }
      const esperadas = nights * units;
      if (insertadas !== esperadas) {
        throw new DomainError('ROOM_SOLD_OUT',
          'Alguien acaba de coger esas noches. Prueba con otras fechas o con otro tipo de habitación.');
      }

      const detalle = await this.detail(reservationId, guestId, tx);
      await tx.$executeRaw`
        UPDATE lifebook.idempotency_keys
           SET response = ${JSON.stringify(detalle)}::jsonb, expires_at = now() + interval '2 days'
         WHERE user_id = ${guestId}::uuid AND endpoint = 'createReservation' AND key = ${key}`;
      return { created: { ...detalle, nightlyPrices: desglose } };
    });

    } catch (e) {
      // La reserva no llegó a existir: la señal retenida VUELVE al huésped.
      if (lockTxId) {
        await this.wallets.refundCommerceOrder({ lockTransactionId: lockTxId })
          .catch((r) => this.log.warn(`no se pudo devolver el cerrojo ${lockTxId}: ${(r as Error).message}`));
      }
      throw e;
    }
    // El cerrojo se enlaza con la reserva: es lo que permite cobrarla o devolverla después.
    if (lockTxId && reservaId) {
      // Parche 105: si el enlace falla, la señal VUELVE y la reserva queda sin pago de monedero.
      const enlace = await this.wallets.linkCommerceLockOrUndo({ transactionId: lockTxId, orderId: reservaId });
      if (!enlace.linked) {
        await this.db.$executeRaw`UPDATE lifebook.reservations SET payment_method = 'in_store', payment_status = 'pending', updated_at = now() WHERE id = ${reservaId}::uuid`;
        this.log.error(`reserva ${reservaId}: cerrojo no enlazado (${enlace.refunded ? 'señal devuelta' : 'sin devolver, revisar'})`);
      }
    }

    const out = 'replayed' in result ? result.replayed : result.created;
    this.log.log(`reserva ${out?.reservation?.code ?? '?'} de ${nights} noche(s) creada por ${guestId}`);
    return out;
  }

  /**
   * Código legible de reserva: LBH-AAMMDD-NNNN (hora de Malabo), **único**.
   *
   * `code` es UNIQUE en la base: con dos reservas del mismo día creadas a la vez,
   * el `count(*)+1` daba el mismo número a las dos y la segunda reventaba con 500
   * (lo destapó el E2E del doble toque simultáneo). Ahora se comprueba el número
   * y se prueba el siguiente un par de veces.
   */
  private async nextCode(tx: any): Promise<string> {
    const m = new Date(Date.now() + 60 * 60 * 1000);
    const dia = `${String(m.getUTCFullYear()).slice(-2)}${String(m.getUTCMonth() + 1).padStart(2, '0')}${String(m.getUTCDate()).padStart(2, '0')}`;
    const rows: any[] = await tx.$queryRaw`
      SELECT count(*)::int AS n FROM lifebook.reservations WHERE code LIKE ${'LBH-' + dia + '-%'}`;
    let n = Number(rows[0]?.n ?? 0) + 1 + randomInt(0, 3);
    for (let intento = 0; intento < 4; intento++, n += 1) {
      const code = `LBH-${dia}-${String(n).padStart(4, '0')}`;
      const ocupado: any[] = await tx.$queryRaw`
        SELECT 1 FROM lifebook.reservations WHERE code = ${code} LIMIT 1`;
      if (!ocupado[0]) return code;
    }
    // Recurso extremo (jamás debería hacer falta): código con sufijo del reloj.
    return `LBH-${dia}-${String(Date.now()).slice(-4)}`;
  }

  // ═══════════════════════════ LEER (con puertas) ═══════════════════════════
  /**
   * 🔒 Resuelve la reserva comprobando QUIÉN pregunta, en el único sitio por el
   * que se leen reservas: huésped, dueño del hotel o admin. Sin identidad no se
   * lee (nunca la ausencia de visor amplía el acceso).
   */
  async loadForViewer(reservationIdRaw: string, viewerId: string | undefined, db: any = this.db) {
    const reservationId = this.h.uuid(reservationIdRaw, 'Reserva');
    const rows: any[] = await db.$queryRaw`
      SELECT r.*, r.check_in::text AS check_in, r.check_out::text AS check_out,
             s.name AS shop_name, s.owner_id AS shop_owner, s.logo_url AS shop_logo,
             s.city AS shop_city, s.barrio AS shop_barrio, s.address_reference AS shop_address,
             s.lat AS shop_lat, s.lng AS shop_lng,
             rt.name AS room_name, rt.capacity AS room_capacity, rt.amenities AS room_amenities,
             -- La ventana de cancelacion vive en el TIPO de habitacion, no en la reserva:
             -- sin este campo freeCancellationUntil salia siempre vacio y la pantalla no
             -- podia decir hasta cuando se cancela gratis (lo destapo el detalle del huesped).
             rt.cancellation_hours AS cancellation_hours,
             hp.checkin_from AS checkin_from, hp.checkout_until AS checkout_until,
             u.full_name AS guest_full_name, u.avatar_url AS guest_avatar
        FROM lifebook.reservations r
        LEFT JOIN lifebook.shops s ON s.id = r.shop_id
        LEFT JOIN lifebook.room_types rt ON rt.id = r.room_type_id
        LEFT JOIN lifebook.hotel_profiles hp ON hp.shop_id = r.shop_id
        LEFT JOIN mobility.users u ON u.id = r.guest_id
       WHERE r.id = ${reservationId}::uuid LIMIT 1`;
    const r = rows[0];
    if (!r) throw new DomainError('RESERVATION_NOT_FOUND', 'Esa reserva no existe');
    const esHuesped = !!viewerId && r.guest_id === viewerId;
    const esHotel = !!viewerId && r.shop_owner === viewerId;
    const esAdmin = !!viewerId && (await this.h.isAdmin(viewerId));
    if (!esHuesped && !esHotel && !esAdmin) {
      throw new DomainError('NOT_RESERVATION_PARTICIPANT', 'Esa reserva no es tuya');
    }
    return { row: r, esHuesped, esHotel, esAdmin };
  }

  /** Detalle público de una reserva (forma de salida estable). */
  async detail(reservationIdRaw: string, viewerId: string, db: any = this.db) {
    const { row: r, esHuesped, esHotel, esAdmin } = await this.loadForViewer(reservationIdRaw, viewerId, db);
    return { reservation: this.shape(r, { esHuesped, esHotel, esAdmin }) };
  }

  /**
   * 🔒 Acciones del HUÉSPED sobre SU reserva (detalle y cancelación desde la app).
   *
   * El hotel también puede leer la reserva y también puede cancelarla, pero **no por esta
   * puerta**: aquí el actor tiene que ser el huésped (o la administración). Lo destapó el
   * E2E: el dueño del hotel cancelaba por la ruta «del huésped» y el servidor respondía
   * 200 — funcionaba, pero por el camino equivocado, y esa mezcla es la que luego deja
   * acciones ofrecidas a quien no le toca.
   */
  async assertGuestOf(reservationIdRaw: string, userId: string, db: any = this.db) {
    const { row: r, esHuesped, esAdmin } = await this.loadForViewer(reservationIdRaw, userId, db);
    if (!esHuesped && !esAdmin) {
      throw new DomainError('NOT_RESERVATION_PARTICIPANT', 'Esa reserva no es tuya');
    }
    return r;
  }

  /** Detalle para el huésped: mismo dato, con la puerta del huésped por delante. */
  async guestDetail(reservationIdRaw: string, userId: string) {
    const r = await this.assertGuestOf(reservationIdRaw, userId);
    return { reservation: this.shape(r, { esHuesped: true, esHotel: false, esAdmin: false }) };
  }

  /**
   * Una fecha `DATE` de Postgres llega como objeto `Date` al driver, y `String(fecha)`
   * da «Fri Sep 11» (¡no `YYYY-MM-DD`!): la app no podía comparar ni mostrar el día
   * de entrada. Aquí se normaliza SIEMPRE a `YYYY-MM-DD` en hora de Malabo, y las
   * consultas que la devuelven la traen ya como texto (`::text`).
   */
  fecha(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) {
      if (Number.isNaN(v.getTime())) return null;
      return new Date(v.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
    }
    return String(v).slice(0, 10);
  }

  /**
   * Forma de salida de una reserva: **la canónica del módulo**
   * (`LifebookHotelService.hotelReservationShape`). Una sola definición para el
   * huésped, el hotel y el panel del comerciante, de modo que no puedan
   * desincronizarse ni filtrar campos internos por descuido.
   *
   * El contexto añade lo que cambia según quién mira: `role`, el `hotel` al que
   * pertenece y el contacto del huésped (que el hotel sí necesita para recibirlo).
   */
  private shape(r: any, roles: { esHuesped: boolean; esHotel: boolean; esAdmin: boolean }) {
    // ¿Puede cancelar AHORA? Se calcula en el servidor porque depende del estado y de la
    // ventana de cancelación del tipo de habitación. La app lo deduce con
    // `availableActions()`, pero el detalle necesita el dato explícito y con la MISMA
    // verdad que aplica el servidor al cancelar.
    const cancelaHasta = this.freeCancellationUntil(r);
    const vivaAhora = this.h.hotelReservationShape(r).viva as boolean;
    // 🔒 `CANCELABLES`, no una lista copiada aquí: la misma que aplica `permitido` y la
    // misma que ve la app en su contrato. Con el huésped dentro no hay «cancelar».
    const canCancel = vivaAhora
      && CANCELABLES.includes(String(r.status))
      && (!cancelaHasta || Date.now() <= new Date(cancelaHasta).getTime());
    return this.h.hotelReservationShape(r, {
      role: roles.esHuesped ? 'guest' : roles.esHotel ? 'hotel' : 'admin',
      // Identificador del huésped: SOLO para el propio huésped (o la administración).
      // El hotel no lo necesita —para eso está el nombre— y no se le expone.
      guestId: roles.esHuesped || roles.esAdmin ? r.guest_id ?? null : null,
      // Para la pantalla de cancelación, con la verdad del servidor:
      canCancel,
      cancellationHours: Number(r.cancellation_hours ?? 0),
      roomTypeId: r.room_type_id ?? null,
      hotel: r.shop_id
        ? {
            id: r.shop_id, name: r.shop_name, logoUrl: r.shop_logo, city: r.shop_city,
            barrio: r.shop_barrio, addressReference: r.shop_address, lat: r.shop_lat, lng: r.shop_lng,
          }
        : null,
      guest: {
        name: r.guest_name ?? 'Huésped',
        avatarUrl: r.guest_avatar ?? null,
        phone: roles.esHuesped || roles.esHotel || roles.esAdmin ? r.guest_phone ?? null : null,
        email: roles.esHotel || roles.esAdmin ? r.guest_email ?? null : null,
      },
      checkinFrom: r.checkin_from ?? null,
      checkoutUntil: r.checkout_until ?? null,
    });
  }

  /**
   * Hasta cuándo se puede cancelar sin coste. **No calcula: delega.**
   *
   * Aquí vivía una SEGUNDA copia de la fórmula con la hora de entrada incrustada a `14:00`
   * y en `Z` (LH-13): dos sitios que respondían distinto sobre el MISMO hotel según por
   * dónde entraras. La definición es una, y vive donde vive `checkin_from`.
   */
  private freeCancellationUntil(r: any): string | null {
    return this.h.freeCancellationUntil(r);
  }

  /** Mis reservas: `side=guest` (viajero) o `side=hotel` (hotelero). */
  async myReservations(userId: string, side: string) {
    const comoHotel = side === 'hotel';
    const rows: any[] = comoHotel
      ? await this.db.$queryRaw`
          SELECT r.*, r.check_in::text AS check_in, r.check_out::text AS check_out,
                 s.name AS shop_name, s.logo_url AS shop_logo, rt.name AS room_name,
                 u.full_name AS guest_full_name,
                 -- Sin estas dos columnas la ventana de cancelación sale null y la tarjeta
                 -- de la LISTA no puede decir hasta cuándo se cancela gratis: el rótulo
                 -- existía en la app y nunca aparecía (el detalle sí las traía y lo pintaba).
                 rt.cancellation_hours AS cancellation_hours,
                 hp.checkin_from AS checkin_from
            FROM lifebook.reservations r
            LEFT JOIN lifebook.shops s ON s.id = r.shop_id
            LEFT JOIN lifebook.room_types rt ON rt.id = r.room_type_id
            LEFT JOIN lifebook.hotel_profiles hp ON hp.shop_id = r.shop_id
            LEFT JOIN mobility.users u ON u.id = r.guest_id
           WHERE r.shop_id IN (SELECT id FROM lifebook.shops WHERE owner_id = ${userId}::uuid)
           ORDER BY r.check_in DESC, r.created_at DESC LIMIT 100`
      : await this.db.$queryRaw`
          SELECT r.*, r.check_in::text AS check_in, r.check_out::text AS check_out,
                 s.name AS shop_name, s.logo_url AS shop_logo, s.city AS shop_city, s.barrio AS shop_barrio,
                 rt.name AS room_name, rt.images AS room_images,
                 -- La LISTA del huésped pinta «Cancelación gratuita hasta…» (reservas.tsx):
                 -- sin estas dos columnas el rótulo sale vacío siempre.
                 rt.cancellation_hours AS cancellation_hours,
                 hp.checkin_from AS checkin_from
            FROM lifebook.reservations r
            LEFT JOIN lifebook.shops s ON s.id = r.shop_id
            LEFT JOIN lifebook.room_types rt ON rt.id = r.room_type_id
            LEFT JOIN lifebook.hotel_profiles hp ON hp.shop_id = r.shop_id
           WHERE r.guest_id = ${userId}::uuid
           ORDER BY r.check_in DESC, r.created_at DESC LIMIT 100`;
    return {
      side: comoHotel ? 'hotel' : 'guest',
      reservations: rows.map((r) => this.shape(r, { esHuesped: !comoHotel, esHotel: comoHotel, esAdmin: false })),
    };
  }

  /** Ocupación del hotelero para un día: quién entra, quién sale, quién está. */
  async dayBook(shopIdRaw: string, userId: string, dateRaw?: string) {
    const shopId = this.h.uuid(shopIdRaw, 'Hotel');
    if (!(await this.h.ownsShop(userId, shopId)) && !(await this.h.isAdmin(userId))) {
      throw new DomainError('NOT_HOTEL_OWNER', 'Ese hotel no es tuyo');
    }
    const fecha = dateRaw ? this.h.date(dateRaw, 'Fecha') : this.h.todayMalabo();
    const rows: any[] = await this.db.$queryRaw`
      SELECT r.*, r.check_in::text AS check_in, r.check_out::text AS check_out,
             rt.name AS room_name, u.full_name AS guest_full_name,
             -- El panel del hotelero pinta la tarjeta con el rótulo de cancelación gratuita:
             -- estas dos columnas son las que lo hacen posible (ver myReservations).
             rt.cancellation_hours AS cancellation_hours,
             hp.checkin_from AS checkin_from
        FROM lifebook.reservations r
        LEFT JOIN lifebook.room_types rt ON rt.id = r.room_type_id
        LEFT JOIN lifebook.hotel_profiles hp ON hp.shop_id = r.shop_id
        LEFT JOIN mobility.users u ON u.id = r.guest_id
       WHERE r.shop_id = ${shopId}::uuid
         AND r.check_in <= ${fecha}::date AND r.check_out > ${fecha}::date
         AND r.status IN ('hold','pending','confirmed','checked_in')
       ORDER BY r.check_in`;
    const llegan: any[] = await this.db.$queryRaw`
      SELECT r.*, r.check_in::text AS check_in, r.check_out::text AS check_out,
             rt.name AS room_name,
             rt.cancellation_hours AS cancellation_hours, hp.checkin_from AS checkin_from
        FROM lifebook.reservations r
        LEFT JOIN lifebook.room_types rt ON rt.id = r.room_type_id
        LEFT JOIN lifebook.hotel_profiles hp ON hp.shop_id = r.shop_id
       WHERE r.shop_id = ${shopId}::uuid AND r.check_in = ${fecha}::date
         AND r.status IN ('pending','confirmed') ORDER BY r.created_at`;
    const salen: any[] = await this.db.$queryRaw`
      SELECT r.*, r.check_in::text AS check_in, r.check_out::text AS check_out,
             rt.name AS room_name,
             rt.cancellation_hours AS cancellation_hours, hp.checkin_from AS checkin_from
        FROM lifebook.reservations r
        LEFT JOIN lifebook.room_types rt ON rt.id = r.room_type_id
        LEFT JOIN lifebook.hotel_profiles hp ON hp.shop_id = r.shop_id
       WHERE r.shop_id = ${shopId}::uuid AND r.check_out = ${fecha}::date
         AND r.status IN ('confirmed','checked_in') ORDER BY r.created_at`;
    const ocupacion: any[] = await this.db.$queryRaw`
      SELECT rt.id AS room_type_id, rt.name, rt.total_units,
             (SELECT count(*)::int FROM lifebook.reservation_nights rn
                JOIN lifebook.reservations r2 ON r2.id = rn.reservation_id
               WHERE rn.room_type_id = rt.id AND rn.night = ${fecha}::date
                 AND r2.status IN ('hold','pending','confirmed','checked_in')
                 -- Ocupa mientras su plazo siga vivo: la regla de plazoVencido() (LH-08).
                 AND (r2.status NOT IN ('hold','pending') OR r2.hold_expires_at IS NULL OR r2.hold_expires_at > now())) AS ocupadas
        FROM lifebook.room_types rt WHERE rt.shop_id = ${shopId}::uuid AND rt.is_active ORDER BY rt.name`;
    const forma = (r: any) => this.shape(r, { esHuesped: false, esHotel: true, esAdmin: false });
    return {
      date: fecha,
      staying: rows.map(forma),
      arrivals: llegan.map(forma),
      departures: salen.map(forma),
      occupancy: ocupacion.map((o) => ({
        roomTypeId: o.room_type_id, name: o.name, totalUnits: Number(o.total_units),
        occupied: Number(o.ocupadas), free: Number(o.total_units) - Number(o.ocupadas),
      })),
    };
  }

  // ═══════════════════════════ ACCIONES ═════════════════════════════════════
  /**
   * Confirmar el cobro de la señal. Lo hace **el hotel** (es quien recibe la
   * transferencia; en la app de alquiler no hay forma de cobrar por el huésped) o
   * el administrador. Queda registrado QUIÉN y CUÁNDO: antes esto lo podía hacer
   * cualquier usuario con el id de la reserva (el agujero de la entrega 54/55).
   */
  async confirmDeposit(userId: string, reservationIdRaw: string, proof?: string) {
    const { row: r, esHotel, esAdmin } = await this.loadForViewer(reservationIdRaw, userId);
    if (!esHotel && !esAdmin) {
      throw new DomainError('NOT_RESERVATION_PARTICIPANT', 'Solo el hotel (o la administración) confirma el cobro');
    }
    const estados = ['hold', 'pending'];
    if (!estados.includes(String(r.status))) {
      throw new DomainError('INVALID_STATE_TRANSITION', `No se puede confirmar la señal de una reserva «${r.status}»`);
    }
    // LH-08: la misma regla que en `action` y que en el SQL (una llamada a `plazoVencido`, no una
    // comparación de fechas escrita a mano). Confirmar la señal de una retención vencida resucitaría
    // una reserva cuya habitación ya volvió al calendario.
    const retenida = plazoVencido(r.status, r.hold_expires_at);
    if (r.status === 'hold' && retenida) {
      throw new DomainError('HOLD_EXPIRED', 'La retención de esa reserva ya venció: pídele al huésped que reserve otra vez');
    }
    if (Number(r.deposit_xaf) <= 0) {
      throw new DomainError('NO_DEPOSIT', 'Esa reserva no tiene señal: se paga al llegar');
    }
    const nota = this.h.clean(proof, 200);
    await this.db.$transaction(async (tx: any) => {
      await tx.$executeRaw`
        UPDATE lifebook.reservations
           SET payment_status = 'deposit_paid', deposit_paid_at = now(),
               status = CASE WHEN status = 'hold' THEN 'pending' ELSE status END,
               hold_expires_at = now() + interval '${Number(r.confirmation_hours ?? 24)} hours',
               note = COALESCE(${nota || null}, note),
               updated_at = now()
         WHERE id = ${r.id}::uuid AND status IN ('hold','pending')`;
    });
    await this.notify(r, userId, `Señal de ${Number(r.deposit_xaf).toLocaleString('fr-FR')} XAF confirmada ✅`);
    return this.detail(r.id, userId);
  }

  /**
   * Acciones del hotelero y del huésped sobre una reserva.
   *
   * 🔒 **Quién puede cada una** (`PERMISOS`): el huésped cancela; el hotel
   * confirma, registra entrada/salida, marca no presentado y también cancela.
   * La administración puede todo (con el motivo registrado).
   *
   * (En la primera pasada del E2E, `cancel` estaba metida en el saco de «acciones
   * del hotel», así que el huésped recibía 403 en SU propia reserva: por eso la
   * tabla de permisos es explícita y no una lista de acciones «de hotel».)
   */
  async action(userId: string, reservationIdRaw: string, actionRaw: string, reasonRaw?: string) {
    const accion = String(actionRaw ?? '').trim().toLowerCase();
    const { row: r, esHuesped, esHotel, esAdmin } = await this.loadForViewer(reservationIdRaw, userId);
    const reason = this.h.clean(reasonRaw, 300) || null;

    const PERMISOS: Record<string, { guest?: boolean; hotel: boolean; txt: string }> = {
      confirm:  { hotel: true, txt: 'Solo el hotel (o la administración) confirma la reserva' },
      checkin:  { hotel: true, txt: 'Solo el hotel registra la entrada' },
      checkout: { hotel: true, txt: 'Solo el hotel registra la salida' },
      noshow:   { hotel: true, txt: 'Solo el hotel marca que el huésped no se presentó' },
      cancel:   { guest: true, hotel: true, txt: 'Esa reserva no es tuya' },
    };
    const permiso = PERMISOS[accion];
    if (!permiso) throw new DomainError('ACTION_INVALID', 'Acción no válida');
    if (!esAdmin) {
      if (esHotel && !permiso.hotel) throw new DomainError('NOT_RESERVATION_PARTICIPANT', 'Esa acción es del huésped');
      if (esHuesped && !esHotel && !permiso.guest) throw new DomainError('NOT_RESERVATION_PARTICIPANT', permiso.txt);
      if (!esHotel && !esHuesped) throw new DomainError('NOT_RESERVATION_PARTICIPANT', permiso.txt);
    }
    if ((accion === 'cancel' || accion === 'noshow') && !reason) {
      throw new DomainError('REASON_REQUIRED', 'Indica el motivo (queda registrado en la reserva)');
    }
    const estado = String(r.status);
    // LH-08: el plazo vencido cuenta también en `pending`. Es LA MISMA regla que aplica el SQL de
    // disponibilidad, así que si aquí no se comprobara se podría confirmar una reserva cuya
    // habitación el hotel ya volvió a tener libre — dos huéspedes y una cama.
    const vencida = plazoVencido(estado, r.hold_expires_at);
    if (vencida && !['cancel', 'noshow'].includes(accion)) {
      throw new DomainError('HOLD_EXPIRED', 'El plazo de esa reserva venció: ya no ocupa la habitación');
    }

    // ── Transiciones permitidas (cerradas, como en los pedidos) ──
    const permitido: Record<string, string[]> = {
      confirm: ['pending'],
      checkin: ['confirmed'],
      checkout: ['checked_in'],
      noshow: ['confirmed', 'pending'],
      cancel: CANCELABLES,
    };
    if (!permitido[accion].includes(estado)) {
      throw new DomainError('INVALID_STATE_TRANSITION', `No se puede hacer eso con una reserva «${estado}»`);
    }
    /**
     * 🔒 LH-02: CONFIRMAR ES UN ACTO DE DINERO.
     *
     * `confirm` daba por buena la reserva sin mirar la señal, y esa pulsación es irreversible:
     * después, `confirm-deposit` responde 409 (solo admite `hold`/`pending`), el comprobante ya
     * no se admite (`submitProof` exige lo mismo) y la entrada queda bloqueada por
     * `DEPOSIT_NOT_CONFIRMED`. La reserva se trababa con el huésped viendo «Confirmada» y el
     * hotel sin poder cobrar ni alojarlo; la única salida era cancelar y perder la estancia.
     *
     * La app ya declaraba la exigencia (`requiresDepositPaid: true`), pero la aplicaba solo a la
     * transición de estado y el panel no le pasaba `depositPaid`; el servidor era el único que
     * podía sostenerla. Sin señal (`deposit_xaf = 0`) sí se confirma: no hay nada que cobrar.
     */
    if (accion === 'confirm' && Number(r.deposit_xaf) > 0
        && !['deposit_paid', 'paid'].includes(String(r.payment_status))) {
      throw new DomainError('DEPOSIT_NOT_CONFIRMED', 'Confirma antes el cobro de la señal');
    }
    // Check-in: no antes del día de entrada (ni sin confirmar el cobro).
    if (accion === 'checkin') {
      const hoy = this.h.todayMalabo();
      const entrada = this.fecha(r.check_in) as string;
      if (hoy < entrada) throw new DomainError('TOO_EARLY', `La entrada es el ${entrada}`);
      if (estado === 'confirmed' && r.payment_status === 'pending' && Number(r.deposit_xaf) > 0) {
        throw new DomainError('DEPOSIT_NOT_CONFIRMED', 'Confirma antes el cobro de la señal');
      }
    }

    const nuevo: Record<string, string> = {
      confirm: 'confirmed', checkin: 'checked_in', checkout: 'checked_out', noshow: 'no_show', cancel: 'cancelled',
    };
    const destino = nuevo[accion];
    // Cancelar con la señal ya cobrada deja el dinero pendiente de devolución.
    const reembolso = accion === 'cancel' && ['deposit_paid', 'paid'].includes(String(r.payment_status));

    await this.db.$transaction(async (tx: any) => {
      await tx.$executeRaw`
        UPDATE lifebook.reservations
           SET status = ${destino},
               updated_at = now(),
               checked_in_at  = CASE WHEN ${destino} = 'checked_in'  THEN now() ELSE checked_in_at END,
               checked_out_at = CASE WHEN ${destino} = 'checked_out' THEN now() ELSE checked_out_at END,
               cancelled_at   = CASE WHEN ${destino} IN ('cancelled','no_show') THEN now() ELSE cancelled_at END,
               cancel_reason  = CASE WHEN ${destino} IN ('cancelled','no_show') THEN ${reason} ELSE cancel_reason END,
               payment_status = CASE WHEN ${destino} = 'checked_out' THEN 'paid'
                                     WHEN ${reembolso} THEN 'refunded'
                                     ELSE payment_status END,
               paid_at = CASE WHEN ${destino} = 'checked_out' THEN now() ELSE paid_at END
         WHERE id = ${r.id}::uuid`;

      // 🔒 Al liberar la habitación se BORRAN sus noches: es lo que devuelve el
      // inventario al calendario (la PK deja de estar ocupada).
      if (['cancelled', 'no_show'].includes(destino)) {
        await tx.$executeRaw`DELETE FROM lifebook.reservation_nights WHERE reservation_id = ${r.id}::uuid`;
      }
    });

    const avisos: Record<string, string> = {
      confirm: 'El hotel confirmó tu reserva ✅',
      checkin: 'Entrada registrada. ¡Buenas noches!',
      checkout: 'Salida registrada. ¡Gracias por tu visita!',
      noshow: 'La reserva se marcó como no presentada',
      cancel: 'La reserva se canceló',
    };
    // Parche 99: el dinero del monedero, DESPUÉS de que la reserva quede en firme.
    //  · ENTRAR (checkin) → el hotel cobra la señal en su monedero.
    //  · NO PRESENTADO (noshow) → también: la señal es su compensación, para eso existe.
    //  · CANCELAR → vuelve íntegra al huésped.
    // Y por la MISMA puerta que el panel del hotelero (LH-01), no por una propia.
    await this.liquidarMonedero(r.id, accion);
    await this.notify(r, userId, `${avisos[accion]}${reason ? ` · ${reason}` : ''}`);
    return this.detail(r.id, userId);
  }

  /** El huésped guarda el comprobante de la transferencia (queda el estado «en revisión»). */
  async submitProof(userId: string, reservationIdRaw: string, proof: string) {
    const texto = this.h.clean(proof, 300);
    if (texto.length < 4) throw new DomainError('PROOF_REQUIRED', 'Escribe la referencia de la transferencia');
    const { row: r, esHuesped } = await this.loadForViewer(reservationIdRaw, userId);
    if (!esHuesped) throw new DomainError('NOT_RESERVATION_PARTICIPANT', 'Solo el huésped envía su comprobante');
    if (r.payment_method !== 'transfer') {
      throw new DomainError('PROOF_NOT_APPLICABLE', 'Esa reserva no se paga por transferencia');
    }
    if (!['hold', 'pending'].includes(String(r.status))) {
      throw new DomainError('INVALID_STATE_TRANSITION', 'Esa reserva ya no admite comprobantes');
    }
    await this.db.$executeRaw`
      UPDATE lifebook.reservations
         SET payment_status = 'proof_submitted', note = COALESCE(${texto}, note), updated_at = now()
       WHERE id = ${r.id}::uuid`;
    await this.notify(r, userId, `El huésped envió el comprobante: ${texto}`);
    return this.detail(r.id, userId);
  }

  // ═══════════════════════════ BARRIDO ══════════════════════════════════════
  /**
   * El barrido, AUTOMÁTICO (LH-08).
   *
   * `expireStale` existía desde el principio, pero su **único** acceso era una ruta ADMIN a mano:
   * en todo el backend no hay ningún `@Cron` de reservas (los tres que hay son de cobros y de
   * SMS), así que una retención vencida se quedaba en la tabla indefinidamente —el inventario no
   * volvía al calendario y el hotelero veía reservas zombis—.
   *
   * Cada 15 minutos y con `catch`: si el barrido falla, el siguiente lo reintenta, y el trabajo es
   * idempotente (el `UPDATE` filtra por estado y por plazo, así que dos barridos a la vez no pisan
   * nada). Si alguien lo llamaba ya desde fuera por la ruta ADMIN, ahora se hace dos veces: no pasa
   * nada, por lo mismo.
   *
   * La DISPONIBILIDAD no depende de esto (el SQL ya ignora lo vencido, LH-08): esto es la limpieza
   * de verdad, más el reintento del dinero (LH-10).
   */
  @Cron('*/15 * * * *')
  async barridoAutomatico(): Promise<void> {
    try {
      await this.expireStale(200);
    } catch (e) {
      this.log.warn(`el barrido automático de reservas falló: ${(e as Error).message}`);
    }
  }

  /**
   * Libera lo que ya venció: retenciones sin pagar y reservas que el hotel no
   * confirmó dentro de su plazo. Se puede llamar a mano (ADMIN) o desde un cron.
   *
   * OJO: el calendario NO depende de este barrido (la disponibilidad ignora las
   * retenciones vencidas); esto es la limpieza de verdad, para que el hotelero no
   * vea reservas zombis y el inventario quede liberado en la tabla.
   */
  async expireStale(limit = 200) {
    const filas: any[] = await this.db.$queryRaw`
      SELECT id FROM lifebook.reservations
       WHERE status IN ('hold','pending')
         AND hold_expires_at IS NOT NULL AND hold_expires_at <= now()
         -- LH-08: TODO lo vencido, sin mirar el pago. Antes había un filtro por payment_status
         -- que dejaba fuera justo un caso: la reserva por transferencia con la señal ya cobrada
         -- (deposit_paid) y el hotel sin confirmar. No la barría nadie —y con la regla nueva
         -- tampoco ocupaba—, así que quedaba en el limbo: invisible para la disponibilidad, sin
         -- poder confirmarse y sin cancelar. Un plazo vencido es un plazo vencido.
         -- (Los nombres van SIN acentos graves a proposito: uno de ellos dentro de un comentario
         --  SQL cierra el template literal de $queryRaw y el fichero deja de parsear. Fallo 49.)
       ORDER BY hold_expires_at LIMIT ${Math.min(Math.max(Number(limit) || 200, 1), 1000)}`;
    let liberadas = 0;
    for (const f of filas) {
      await this.db.$transaction(async (tx: any) => {
        const upd: number = await tx.$executeRaw`
          UPDATE lifebook.reservations
             SET status = 'cancelled', cancelled_at = now(),
                 -- LH-07: el motivo dice QUÉ se estaba esperando. Con el monedero la señal ya
                 -- estaba pagada, así que «sin pagar la señal» era sencillamente falso: lo que
                 -- faltó fue la confirmación del hotel.
                 cancel_reason = COALESCE(cancel_reason,
                   CASE WHEN payment_status IN ('pending','proof_submitted')
                        THEN 'Sin pagar la señal a tiempo'
                        ELSE 'El hotel no confirmó dentro de su plazo' END),
                 -- El barrido ES una cancelación, así que deja el dinero igual que la deja
                 -- action: si había señal cobrada, queda pendiente de devolución. Sin esto, una
                 -- cancelación de monedero decía «señal pagada» para siempre aunque el dinero ya
                 -- hubiera vuelto al huésped.
                 payment_status = CASE WHEN payment_status IN ('deposit_paid','paid')
                                       THEN 'refunded' ELSE payment_status END,
                 updated_at = now()
           WHERE id = ${f.id}::uuid AND status IN ('hold','pending')
             AND hold_expires_at IS NOT NULL AND hold_expires_at <= now()`;
        if (upd) {
          await tx.$executeRaw`DELETE FROM lifebook.reservation_nights WHERE reservation_id = ${f.id}::uuid`;
          liberadas += 1;
        }
      });
      // Fuera de la transacción (el monedero es otro cliente de BD) y con `catch`:
      // si falla, el dinero queda RETENIDO —dirección segura— y el reintento es idempotente.
      await this.devolverSiMonederoHotel(f.id);
    }
    if (liberadas) this.log.log(`barrido de hotel: ${liberadas} reserva(s) sin pagar liberadas`);
    // LH-10: y de paso, el dinero que se quedó a medias. Va aquí y no en un método aparte porque
    // el barrido ya es, por definición, «lo que revisa lo que no llegó a su fin».
    const dinero = await this.reconciliarMonedero();
    if (dinero.liberaciones || dinero.devoluciones) {
      this.log.log(`barrido de hotel · monedero reintentado: ${dinero.liberaciones} liberación(es) · ${dinero.devoluciones} devolución(es)`);
    }
    return { checked: filas.length, released: liberadas, ...dinero };
  }

  /**
   * LIBERAR LA SEÑAL AL HOTEL (parche 99). Se comprueba la reserva en la base —no lo que diga
   * la llamada— y solo actúa si es de monedero y el huésped ya entró (o no se presentó).
   * Hoteles no tiene comisión de plataforma todavía: el hotel cobra la señal ÍNTEGRA. Cuando
   * exista, entra aquí como `platformFee`.
   *
   * 🔒 LH-10: al liberar se deja MARCA (`paid_at`), que es lo que dice «el hotel ya cobró» y lo
   * que permite distinguir después una liberación que falló de una que se hizo. Antes el fallo
   * solo dejaba un `warn` en un log que se rota: ni rastro ni reintento, así que el dinero del
   * huésped se quedaba en garantía para siempre y el hotel cobraba cero.
   *
   * Es **idempotente por `idempotencyKey`** (`lb-release:<reserva>`): si ya se liberó, el monedero
   * responde `replay` y no mueve un franco. Por eso el barrido puede reintentarla sin miedo, y por
   * eso también las reservas anteriores a esta tanda —que se liberaron bien pero no dejaron marca—
   * se vuelven a pasar sin efecto una sola vez.
   */
  private async liberarSiMonederoHotel(reservationId: string) {
    const filas: any[] = await this.db.$queryRaw`
      SELECT r.payment_method, r.status, r.deposit_xaf, s.owner_id
        FROM lifebook.reservations r JOIN lifebook.shops s ON s.id = r.shop_id
       WHERE r.id = ${reservationId}::uuid LIMIT 1`;
    const r = filas[0];
    if (!r || String(r.payment_method) !== 'likebook_wallet') return;
    if (!['checked_in', 'no_show'].includes(String(r.status))) return;
    const senal = Number(r.deposit_xaf ?? 0);
    if (senal <= 0) return;
    try {
      await this.wallets.releaseCommerceOrder({
        orderId: reservationId, sellerId: String(r.owner_id),
        sellerNet: senal, platformFee: 0, deliveryHeld: 0,
      });
      await this.db.$executeRaw`
        UPDATE lifebook.reservations
           SET paid_at = COALESCE(paid_at, now()), updated_at = now()
         WHERE id = ${reservationId}::uuid`;
    } catch (e) {
      // No se traga el fallo: queda con marca propia en el log y con `paid_at` SIN escribir, que
      // es lo que hace que el barrido lo vuelva a intentar (LH-10). La causa más frecuente es el
      // hotelero sin monedero provisionado (`WALLET_NOT_FOUND`).
      this.log.warn(`LIQUIDACION_PENDIENTE reserva ${reservationId} con la señal retenida y sin liberar: ${(e as Error).message}`);
    }
  }

  /** DEVOLVER LA SEÑAL AL HUÉSPED (parche 99). Idempotente. */
  private async devolverSiMonederoHotel(reservationId: string) {
    const filas: any[] = await this.db.$queryRaw`
      SELECT payment_method, status FROM lifebook.reservations WHERE id = ${reservationId}::uuid LIMIT 1`;
    const r = filas[0];
    if (!r || String(r.payment_method) !== 'likebook_wallet') return;
    if (!['cancelled', 'expired'].includes(String(r.status))) return;
    try {
      await this.wallets.refundCommerceOrder({ orderId: reservationId });
    } catch (e) {
      // LH-10: con marca propia, para poder buscar el caso en el log. No hay estado nuevo que
      // escribir —`payment_status` ya dice «refunded» desde que se canceló— pero el barrido
      // encuentra la devolución por «cancelada + de monedero + pago sin cerrar» y la reintenta.
      this.log.warn(`LIQUIDACION_PENDIENTE reserva ${reservationId} cancelada y sin devolver el monedero: ${(e as Error).message}`);
    }
  }

  /**
   * Mueve el monedero por una transición, DESPUÉS de que el estado quede en firme.
   *
   * 🔒 ES PÚBLICO A PROPÓSITO. Hay **dos puertas** que cambian el estado de una reserva
   * —la app (`action`) y el panel del hotelero (`updateReservationStatus`)— y las dos
   * tienen que liquidar igual. El panel no lo hacía (LH-01), y el resultado era dinero
   * varado en las dos direcciones:
   *
   *   · el hotel marcaba la entrada desde su panel → **la señal se quedaba en garantía
   *     para siempre: el hotel no cobraba nunca**;
   *   · el hotel cancelaba → el `payment_status` decía «refunded» **sin devolver un
   *     franco: el huésped no recuperaba nunca**.
   *
   * Se llama FUERA de la transacción del estado, como en el mercado, la comida y
   * ciudad-a-ciudad: si el monedero falla, la reserva queda en firme con el dinero retenido
   * —dirección segura— en vez de deshacer un cambio de estado que ya ocurrió. Las dos
   * operaciones son **idempotentes por `idempotencyKey`** (`lb-release:` / `lb-refund:`),
   * así que llamarlas dos veces (o desde las dos puertas) no cobra dos veces.
   *
   * Lo que NO cubre: provisionar el monedero del HOTELERO. Si la liquidación falla queda un `warn`
   * marcado como `LIQUIDACION_PENDIENTE` —pero ya no se pierde: `paid_at` sin escribir es la marca
   * de que el hotel no cobró, y el barrido reintenta la operación cada 15 minutos (LH-10). Lo del
   * monedero del vendedor vive en un fichero COMPARTIDO que esta tanda no toca; queda en el acta.
   */
  async liquidarMonedero(reservationId: string, accion: string) {
    if (accion === 'checkin' || accion === 'noshow') await this.liberarSiMonederoHotel(reservationId);
    if (accion === 'cancel') await this.devolverSiMonederoHotel(reservationId);
  }

  /**
   * REINTENTAR EL DINERO QUE SE QUEDÓ A MEDIAS (LH-10).
   *
   * Las dos operaciones del monedero son idempotentes por clave (`lb-release:` / `lb-refund:`): si
   * ya se hicieron, el monedero responde `replay` y no mueve nada. Así que reintentar es gratis y
   * la única pregunta es **a quién**. Se busca en la propia tabla de reservas, **sin estado nuevo**:
   * el esquema de hotel no está versionado, así que no se inventa un valor de `payment_status` sin
   * poder leer su `CHECK` — y resulta que no hace falta.
   *
   *   · LIBERAR → de monedero, con la entrada registrada o no presentado, y `paid_at` **vacío**.
   *     `paid_at` es la marca de «el hotel ya cobró», así que esto es exactamente «quedó sin
   *     liberar»; no hace falta ningún `release_pending`.
   *   · DEVOLVER → de monedero, cancelada o caducada, con el pago sin cerrar.
   *
   * Se acota a **48 h** con `ORDER BY updated_at DESC`: un fallo de monedero se arregla enseguida
   * (o no se arregla nunca), y así el barrido no arrastra para siempre las reservas viejas. Pasado
   * el plazo queda el rastro —`paid_at` vacío en una estancia cerrada, y el `warn` del log—.
   *
   * Lo que NO hace: provisionar el monedero del hotelero. Eso vive en `wallet.service` (más
   * `KycGateService`), fichero COMPARTIDO por mercado, comida y viajes que **no está versionado**
   * en el repo: tocarlo sería un cambio de alcance que esta tanda no puede verificar.
   */
  async reconciliarMonedero(limit = 25) {
    const n = Math.min(Math.max(Number(limit) || 25, 1), 200);
    const porLiberar: any[] = await this.db.$queryRaw`
      SELECT id FROM lifebook.reservations
       WHERE payment_method = 'likebook_wallet' AND payment_status = 'deposit_paid'
         AND paid_at IS NULL AND status IN ('checked_in', 'no_show')
         AND updated_at > now() - interval '48 hours'
       ORDER BY updated_at DESC LIMIT ${n}`;
    for (const f of porLiberar) await this.liberarSiMonederoHotel(f.id);
    const porDevolver: any[] = await this.db.$queryRaw`
      SELECT id FROM lifebook.reservations
       WHERE payment_method = 'likebook_wallet'
         AND status IN ('cancelled', 'expired')
         AND payment_status IN ('deposit_paid', 'refunded')
         AND updated_at > now() - interval '48 hours'
       ORDER BY updated_at DESC LIMIT ${n}`;
    for (const f of porDevolver) await this.devolverSiMonederoHotel(f.id);
    return { liberaciones: porLiberar.length, devoluciones: porDevolver.length };
  }

  // ═══════════════════════════ AVISO EN EL CHAT ═════════════════════════════
  /** Aviso huésped ↔ hotel en el chat de Life Book (como hacen los pedidos). */
  private async notify(r: any, autorId: string, texto: string) {
    try {
      const hotelRows: any[] = await this.db.$queryRaw`
        SELECT owner_id FROM lifebook.shops WHERE id = ${r.shop_id}::uuid LIMIT 1`;
      const otro = r.guest_id === autorId ? hotelRows[0]?.owner_id : r.guest_id;
      if (!otro || otro === autorId) return;
      let conv: any[] = await this.db.$queryRaw`
        SELECT id, user_a, user_b FROM lifebook.conversations
         WHERE kind = 'direct' AND ((user_a = ${autorId}::uuid AND user_b = ${otro}::uuid)
                                 OR (user_a = ${otro}::uuid AND user_b = ${autorId}::uuid)) LIMIT 1`;
      if (!conv[0]) {
        conv = await this.db.$queryRaw`
          INSERT INTO lifebook.conversations (kind, user_a, user_b)
          VALUES ('direct', ${autorId}::uuid, ${otro}::uuid) RETURNING id, user_a, user_b`;
      }
      const cuerpo = `${r.code ? `[${r.code}] ` : ''}${texto}`.slice(0, 300);
      await this.db.$executeRaw`
        INSERT INTO lifebook.messages (conversation_id, sender_id, body, kind, payload)
        VALUES (${conv[0].id}::uuid, ${autorId}::uuid, ${cuerpo}, 'system', '{}'::jsonb)`;
      const meIsA = conv[0].user_a === autorId;
      await this.db.$executeRaw`
        UPDATE lifebook.conversations
           SET last_message = ${cuerpo}, last_message_at = now(),
               unread_a = unread_a + CASE WHEN ${!meIsA} THEN 1 ELSE 0 END,
               unread_b = unread_b + CASE WHEN ${meIsA} THEN 1 ELSE 0 END
         WHERE id = ${conv[0].id}::uuid`;
    } catch (e) {
      this.log.warn(`no se pudo avisar de la reserva: ${(e as Error).message}`);
    }
  }
}
