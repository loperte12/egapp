// =============================================================================
// lb42a-merchant.service.ts — PARTE 42-a · SERVICIO DEL COMERCIANTE (panel del hotel)
//
// Sustituye a los métodos que envió el dueño, conservando lo que estaba bien y
// arreglando lo que impedía que funcionara:
//
//   · SQL DIRECTO (`$queryRaw`), no `prisma.lifebookReservation`: ese modelo NO
//     existe en el esquema desplegado (24 modelos, ninguno de hotel) y el fichero
//     habría reventado con TypeError en la primera llamada.
//
//   · 🔒 LA PUERTA VA EN LA CONSULTA, NO EN EL CONTROLADOR. La pertenencia viaja
//     DENTRO del WHERE (`owner_id = usuario`), así que un `shopId` ajeno devuelve
//     CERO filas y no hay nada que recordar: el guard es defensa en profundidad,
//     no la puerta única. (Es el patrón de la Parte 39 y lo que la 40 dejó clavado.)
//
//   · El nombre del huésped SÍ, su identificador NO. El panel necesita saludar y
//     hacer el check-in; no necesita el `guestId`, que era una fuga de identidad.
//     El teléfono solo se expone en el DETALLE (hace falta para confirmar una
//     llegada), nunca en el listado.
//
//   · `hold` entra en el panel: era el agujero de la máquina de estados del dueño.
//     Una reserva retenida sin pagar es la que más urge (se libera sola).
//
//   · Cambio de estado con guardado optimista (lo que el dueño ya hacía bien), con
//     `reason` obligatorio al cancelar/no-presentar, y con el dinero auditado
//     (`deposit_confirmed_by` / `deposit_proof`).
// =============================================================================
import { Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../services/payment-auth.service';
import { MobilityPrismaService } from '../mobility/mobility-prisma.service';
import { LifebookHotelService } from './hotel.service';
import { LifebookReservationsService } from './reservations.service';

/** Acciones admitidas y su estado de destino. */
export const ACCIONES: Record<string, string> = {
  confirm: 'confirmed',
  checkin: 'checked_in',
  checkout: 'checked_out',
  cancel: 'cancelled',
  noshow: 'no_show',
};

/** Desde qué estados se puede hacer cada acción. */
export const DESDE: Record<string, string[]> = {
  confirm: ['pending'],
  checkin: ['confirmed'],
  checkout: ['checked_in'],
  cancel: ['hold', 'pending', 'confirmed', 'checked_in'],
  noshow: ['pending', 'confirmed'],
};

/**
 * Quién puede cada acción.
 *
 * `cancel` es de **los dos**: el huésped cancela su reserva y el hotel también puede
 * cancelarla (una reserva que no se va a poder atender, un no-show sin marcar…). El
 * resto son del hotel, que es quien recibe y cobra.
 */
const PERMISO: Record<string, Array<'hotel' | 'guest'>> = {
  confirm: ['hotel'],
  checkin: ['hotel'],
  checkout: ['hotel'],
  noshow: ['hotel'],
  cancel: ['hotel', 'guest'],
};

/** Estados que OCUPAN inventario. */
const OCUPAN = ['hold', 'pending', 'confirmed', 'checked_in'];

@Injectable()
export class LifebookHotelMerchantService {
  private readonly log = new Logger('LifebookHotelMerchant');

  constructor(
    private readonly db: MobilityPrismaService,
    private readonly hotel: LifebookHotelService,
    private readonly reservas: LifebookReservationsService,
  ) {}

  // ─────────────────────────── utilidades ───────────────────────────────────
  private uuid(v: unknown, field = 'Identificador'): string {
    const s = String(v ?? '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
      throw new DomainError('ID_INVALID', `${field} no válido`);
    }
    return s;
  }

  /** Hora de Malabo (UTC+1) para las fechas del panel. */
  private hoyMalabo(): string {
    return new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  /** `DATE` del driver llega como objeto `Date` (y `String()` daría «Fri Sep 11»). */
  private fecha(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) {
      if (Number.isNaN(v.getTime())) return null;
      return new Date(v.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
    }
    return String(v).slice(0, 10);
  }

  /**
   * 🔒 Resuelve el hotel del usuario y comprueba que la tienda pedida es suya.
   * Devuelve `null` si no hay tienda o si es de otro (el llamante decide el 404).
   */
  private async shopOf(userId: string, shopId?: string): Promise<any | null> {
    const filas: any[] = shopId
      ? await this.db.$queryRaw`
          SELECT id, name, owner_id, is_hotel, is_active FROM lifebook.shops
           WHERE id = ${shopId}::uuid AND owner_id = ${userId}::uuid LIMIT 1`
      : await this.db.$queryRaw`
          SELECT id, name, owner_id, is_hotel, is_active FROM lifebook.shops
           WHERE owner_id = ${userId}::uuid LIMIT 1`;
    return filas[0] ?? null;
  }

  private async isAdmin(userId: string): Promise<boolean> {
    const filas: any[] = await this.db.$queryRaw`
      SELECT 1 FROM mobility.users WHERE id = ${userId}::uuid AND role = 'ADMIN' LIMIT 1`;
    return !!filas[0];
  }

  // ─────────────────────────── PANEL DEL DÍA ─────────────────────────────────
  /**
   * Resumen del día en hora de MALABO, con los estados que de verdad importan:
   * llegadas, salidas, dentro, **por confirmar** (señal pagada sin confirmar),
   * **retenidas sin pagar** (se liberan solas) y la ocupación por tipo de habitación.
   */
  async getHotelDashboard(userId: string, shopId?: string) {
    const shop = await this.shopOf(userId, shopId);
    if (!shop) throw new DomainError('SHOP_NOT_FOUND', 'Esa tienda no existe o no es tuya');
    const hoy = this.hoyMalabo();

    const filas: any[] = await this.db.$queryRaw`
      SELECT
        count(*) FILTER (WHERE check_in = ${hoy}::date AND status IN ('pending','confirmed','checked_in'))::int AS arrivals_today,
        count(*) FILTER (WHERE check_out = ${hoy}::date AND status IN ('confirmed','checked_in'))::int AS departures_today,
        count(*) FILTER (WHERE status = 'checked_in')::int AS inside_now,
        count(*) FILTER (WHERE status = 'confirmed' AND check_in > ${hoy}::date)::int AS upcoming,
        count(*) FILTER (WHERE status = 'pending')::int AS to_confirm,
        count(*) FILTER (WHERE status = 'hold' AND (hold_expires_at IS NULL OR hold_expires_at > now()))::int AS unpaid_holds,
        count(*) FILTER (WHERE status IN ('pending','confirmed') AND payment_status IN ('pending','proof_submitted')
                           AND deposit_xaf > 0)::int AS deposit_due
      FROM lifebook.reservations WHERE shop_id = ${shop.id}::uuid`;

    const ocupacion: any[] = await this.db.$queryRaw`
      SELECT rt.id AS room_type_id, rt.name, rt.total_units,
             (SELECT count(*)::int FROM lifebook.reservation_nights rn
                JOIN lifebook.reservations r2 ON r2.id = rn.reservation_id
               WHERE rn.room_type_id = rt.id AND rn.night = ${hoy}::date
                 AND r2.status = ANY(${OCUPAN}::varchar[])
                 AND (r2.status <> 'hold' OR r2.hold_expires_at IS NULL OR r2.hold_expires_at > now())) AS occupied
        FROM lifebook.room_types rt
       WHERE rt.shop_id = ${shop.id}::uuid AND rt.is_active
       ORDER BY rt.name`;

    const r = filas[0] ?? {};
    return {
      shop: { id: shop.id, name: shop.name, isActive: !!shop.is_active },
      date: hoy,
      arrivalsToday: Number(r.arrivals_today ?? 0),
      departuresToday: Number(r.departures_today ?? 0),
      insideNow: Number(r.inside_now ?? 0),
      upcoming: Number(r.upcoming ?? 0),
      // Los dos contadores que faltaban: señal pagada sin confirmar y retenidas sin pagar.
      pendingConfirm: Number(r.to_confirm ?? 0),
      unpaidHolds: Number(r.unpaid_holds ?? 0),
      depositDue: Number(r.deposit_due ?? 0),
      occupancy: ocupacion.map((o) => ({
        roomTypeId: o.room_type_id,
        name: o.name,
        totalUnits: Number(o.total_units),
        occupied: Number(o.occupied),
        free: Math.max(0, Number(o.total_units) - Number(o.occupied)),
      })),
    };
  }

  // ─────────────────────────── LISTADO DE RESERVAS ──────────────────────────
  /**
   * Reservas del hotel. 🔒 La pertenencia va en el WHERE: con un `shopId` ajeno esto
   * devuelve cero filas (y el controlador responde 404), no las reservas del otro.
   *
   * Sin teléfono y sin `guestId`: el listado enseña el NOMBRE del huésped (hace falta
   * para recibirlo) y nada más.
   */
  async listReservationsForShop(
    userId: string,
    opts: { shopId?: string; status?: string; from?: string; to?: string; limit?: number } = {},
  ) {
    const shop = await this.shopOf(userId, opts.shopId);
    if (!shop) throw new DomainError('SHOP_NOT_FOUND', 'Esa tienda no existe o no es tuya');

    const estados = ['hold', 'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show'];
    if (opts.status && !estados.includes(opts.status)) {
      throw new DomainError('STATUS_INVALID', `Estado no válido: ${opts.status}`);
    }
    const limite = Math.min(Math.max(Number(opts.limit ?? 60), 1), 200);
    const desde = opts.from ? this.uuidLikeDate(opts.from, 'Desde') : null;
    const hasta = opts.to ? this.uuidLikeDate(opts.to, 'Hasta') : null;
    if (desde && hasta && hasta < desde) {
      throw new DomainError('DATE_RANGE_INVALID', 'La fecha final no puede ser anterior a la inicial');
    }

    const filas: any[] = await this.db.$queryRaw`
      SELECT r.id, r.code, r.status, r.payment_status, r.payment_method,
             r.check_in::text AS check_in, r.check_out::text AS check_out,
             r.nights, r.units, r.guests, r.room_name_snapshot,
             r.price_per_night_xaf, r.total_xaf, r.deposit_percent, r.deposit_xaf, r.remaining_xaf,
             r.hold_expires_at, rt.cancellation_hours, r.created_at, r.updated_at,
             r.deposit_paid_at, r.deposit_confirmed_by, r.deposit_proof,
             r.checked_in_at, r.checked_out_at, r.cancelled_at, r.cancel_reason,
             rt.name AS room_type_name,
             COALESCE(r.guest_name, u.full_name, 'Huésped') AS guest_name,
             u.avatar_url AS guest_avatar
        FROM lifebook.reservations r
        LEFT JOIN lifebook.room_types rt ON rt.id = r.room_type_id
        LEFT JOIN mobility.users u ON u.id = r.guest_id
       WHERE r.shop_id = ${shop.id}::uuid
         AND (${opts.status ?? null}::text IS NULL OR r.status = ${opts.status ?? null})
         AND (${desde}::date IS NULL OR r.check_out >= ${desde}::date)
         AND (${hasta}::date IS NULL OR r.check_in <= ${hasta}::date)
       ORDER BY
         -- Lo urgente primero: retenidas sin pagar, luego por confirmar, y después por fecha.
         CASE r.status WHEN 'hold' THEN 0 WHEN 'pending' THEN 1 ELSE 2 END,
         r.check_in ASC
       LIMIT ${limite}`;

    return {
      shop: { id: shop.id, name: shop.name },
      count: filas.length,
      reservations: filas.map((f) => this.shape(f)),
    };
  }

  private uuidLikeDate(v: string, campo: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) {
      throw new DomainError('DATE_INVALID', `${campo}: usa el formato AAAA-MM-DD`);
    }
    return v;
  }

  // ─────────────────────────── DETALLE ──────────────────────────────────────
  /**
   * Detalle de una reserva del hotel (con el TELÉFONO del huésped: hace falta para
   * confirmar una llegada o avisar; sin `guestId`, que no aporta nada al panel).
   */
  async getReservationForShop(userId: string, reservationId: string, shopId?: string) {
    const id = this.uuid(reservationId, 'Reserva');
    const tienda = shopId ? this.uuid(shopId, 'Tienda') : null;
    // 🔒 La pertenencia va en el WHERE: si el `shopId` que llega no es del usuario, la
    // subconsulta no devuelve filas y esto responde 404 (no las reservas del otro).
    const filas: any[] = await this.db.$queryRaw`
      SELECT r.*, r.check_in::text AS check_in, r.check_out::text AS check_out,
             rt.name AS room_type_name, rt.capacity, rt.amenities AS room_amenities,
             hp.checkin_from, hp.checkin_until, hp.checkout_until,
             COALESCE(r.guest_name, u.full_name, 'Huésped') AS guest_name,
             u.avatar_url AS guest_avatar
        FROM lifebook.reservations r
        LEFT JOIN lifebook.room_types rt ON rt.id = r.room_type_id
        LEFT JOIN lifebook.hotel_profiles hp ON hp.shop_id = r.shop_id
        LEFT JOIN mobility.users u ON u.id = r.guest_id
       WHERE r.id = ${id}::uuid
         AND (${tienda}::uuid IS NULL OR r.shop_id = ${tienda}::uuid)
         AND r.shop_id IN (SELECT id FROM lifebook.shops WHERE owner_id = ${userId}::uuid)
       LIMIT 1`;
    const r = filas[0];
    // 🔒 Mismo 404 para «no existe» y para «es de otro hotel»: no se filtra existencia.
    if (!r) throw new DomainError('RESERVATION_NOT_FOUND', 'Esa reserva no existe o no es de tu hotel');

    return {
      reservation: {
        ...this.shape(r),
        // El teléfono SÍ en el detalle (hace falta para recibir al huésped), nunca en el listado.
        guestPhone: r.guest_phone ?? null,
        guestEmail: r.guest_email ?? null,
        roomType: r.room_type_id ? { id: r.room_type_id, name: r.room_type_name, capacity: r.capacity } : null,
        hotel: {
          checkinFrom: r.checkin_from ?? null,
          checkinUntil: r.checkin_until ?? null,
          checkoutUntil: r.checkout_until ?? null,
        },
      },
    };
  }

  /**
   * Forma de salida del listado: la CANÓNICA del módulo (una sola, compartida con el
   * endpoint de reservas del huésped/hotel). Antes el listado devolvía una forma y el
   * detalle la fila cruda: dos serializadores que se desincronizan y filtran campos
   * internos (`guest_phone`, `idempotency_key`, `cancel_reason` sin querer).
   */
  private shape(f: any) {
    return {
      ...this.hotel.hotelReservationShape(f),
      // El detalle del huésped SÍ lleva `guestId` (para el chat y para saber quién es);
      // el panel del hotel NO lo expone, y lo dice con un `null` explícito en vez de
      // dejar el campo ausente (que en el cliente se lee como «undefined»).
      guestId: null,
      // `roomType` para la ficha del panel (nombre y capacidad), sin fotos: las fotos las
      // sirve la habitación (`room_types.images`) en el detalle público.
      roomType: f.room_type_name ? { id: f.room_type_id ?? null, name: f.room_type_name, capacity: f.capacity ?? null } : null,
    };
  }

  // ─────────────────────────── ACCIONES ─────────────────────────────────────
  /**
   * Cambia el estado de una reserva (panel del hotelero o huésped, según la acción).
   *
   * Conserva el GUARDADO OPTIMISTA del dueño (`AND status = lo que leí` → 409 claro si
   * otro recepcionista se adelantó) y añade lo que faltaba:
   *   · `reason` obligatorio al cancelar y al marcar no-presentado (queda registrado);
   *   · `checkout` cobra el resto en recepción y deja la estancia PAGADA;
   *   · cancelar con la señal cobrada marca el dinero como **devuelto** (pendiente de
   *     devolución real: el estado del pago queda explícito, no se finge que no pasó);
   *   · al liberar la habitación se borran sus noches (`reservation_nights`).
   */
  async updateReservationStatus(
    userId: string,
    reservationId: string,
    nextStatus: string,
    opts: { shopId?: string; reason?: string; action?: string } = {},
  ) {
    // La app desplegada manda `{ action }`; el DTO del dueño manda `{ status }`. Los
    // dos se aceptan y se traducen aquí (una sola lógica, dos puertas).
    const pedido = String(nextStatus ?? opts.action ?? '').trim().toLowerCase();
    const accion = ACCIONES[pedido]
      ? pedido
      : Object.keys(ACCIONES).find((k) => ACCIONES[k] === pedido) ?? '';
    if (!accion) {
      throw new DomainError('ACTION_INVALID', 'Acción no válida (confirm · checkin · checkout · cancel · noshow)');
    }
    const destino = ACCIONES[accion];
    const reason = String(opts.reason ?? '').trim().slice(0, 300);

    const { row: r, esHotel, esAdmin } = await this.loadForActor(userId, reservationId, opts.shopId);
    const esHuesped = r.guest_id === userId;

    // Quién puede: el hotel confirma, registra entrada/salida y no-presentado, y
    // **cancela**; el huésped cancela lo suyo; la administración puede todo.
    //
    // ⚠️ Dos casos reales que había que cubrir y que una tabla de UN solo papel no
    // cubría: (1) una cuenta que es a la vez dueña del hotel y huésped de su propia
    // reserva —se le negaba todo—, y (2) el HOTEL cancelando la reserva de un huésped
    // —se le respondía «esa acción es del huésped», que no tiene sentido.
    if (!esAdmin) {
      const roles = PERMISO[accion] ?? [];
      const tieneElPapel = (roles.includes('hotel') && esHotel) || (roles.includes('guest') && esHuesped);
      if (!tieneElPapel) {
        throw new DomainError(
          'NOT_RESERVATION_PARTICIPANT',
          roles.includes('hotel') ? 'Esa acción es del hotel' : 'Esa acción es del huésped',
        );
      }
    }
    if ((accion === 'cancel' || accion === 'noshow') && reason.length < 3) {
      throw new DomainError('REASON_REQUIRED', 'Indica el motivo (queda registrado en la reserva)');
    }

    const estado = String(r.status);
    const vencida = estado === 'hold' && r.hold_expires_at && new Date(r.hold_expires_at).getTime() <= Date.now();
    if (vencida && !['cancel', 'noshow'].includes(accion)) {
      throw new DomainError('HOLD_EXPIRED', 'La retención venció: esa reserva ya no ocupa la habitación');
    }
    if (!DESDE[accion].includes(estado)) {
      throw new DomainError('INVALID_TRANSITION', `No se puede pasar de «${estado}» a «${destino}»`);
    }
    if (accion === 'checkin') {
      const hoy = this.hoyMalabo();
      const entrada = this.fecha(r.check_in) ?? '';
      if (entrada && hoy < entrada) throw new DomainError('TOO_EARLY', `La entrada es el ${entrada}`);
      if (r.payment_status === 'pending' && Number(r.deposit_xaf) > 0) {
        throw new DomainError('DEPOSIT_NOT_CONFIRMED', 'Confirma antes el cobro de la señal');
      }
    }

    const reembolso = accion === 'cancel' && ['deposit_paid', 'paid'].includes(String(r.payment_status));
    const cobra = accion === 'checkout';

    await this.db.$transaction(async (tx: any) => {
      const cambiadas: number = await tx.$executeRaw`
        UPDATE lifebook.reservations
           SET status = ${destino},
               updated_at = now(),
               checked_in_at  = CASE WHEN ${destino} = 'checked_in'  THEN now() ELSE checked_in_at END,
               checked_out_at = CASE WHEN ${destino} = 'checked_out' THEN now() ELSE checked_out_at END,
               cancelled_at   = CASE WHEN ${destino} IN ('cancelled','no_show') THEN now() ELSE cancelled_at END,
               cancel_reason  = CASE WHEN ${destino} IN ('cancelled','no_show') THEN ${reason} ELSE cancel_reason END,
               payment_status = CASE WHEN ${cobra} THEN 'paid'
                                     WHEN ${reembolso} THEN 'refunded'
                                     ELSE payment_status END,
               paid_at = CASE WHEN ${cobra} THEN now() ELSE paid_at END
         WHERE id = ${r.id}::uuid AND status = ${estado}`;
      // Guardado optimista: si otro se adelantó, no se pisa nada.
      if (!cambiadas) {
        throw new DomainError('RESERVATION_STATE_CHANGED', 'La reserva cambió de estado mientras la mirabas. Recarga.');
      }
      if (destino === 'cancelled' || destino === 'no_show') {
        // 🔒 Liberar la habitación = borrar sus noches (devuelve el inventario).
        await tx.$executeRaw`DELETE FROM lifebook.reservation_nights WHERE reservation_id = ${r.id}::uuid`;
      }
    });

    const avisos: Record<string, string> = {
      confirm: 'El hotel confirmó tu reserva ✅',
      checkin: 'Entrada registrada. ¡Buenas noches!',
      checkout: 'Salida registrada. ¡Gracias por tu visita!',
      noshow: `La reserva se marcó como no presentada · ${reason}`,
      cancel: `La reserva se canceló · ${reason}`,
    };
    await this.notify(r, userId, avisos[accion] ?? 'La reserva cambió de estado');

    this.log.log(`reserva ${r.code}: ${estado} → ${destino} por ${userId}`);
    // La respuesta se lee según QUIÉN actuó: el hotel ve su detalle (con el teléfono),
    // el huésped el suyo. Antes se devolvía siempre el detalle del hotel, así que a un
    // huésped que cancelaba su propia reserva se le respondía 404 al leerla.
    if (esHotel || esAdmin) return this.getReservationForShop(userId, r.id, opts.shopId);
    return this.reservas.detail(r.id, userId);
  }

  /**
   * Confirmar el cobro de la señal.
   *
   * Admitido desde `hold` (la reserva por transferencia, que es LA que el hotel
   * confirma cuando ve el dinero) y desde `pending` (señal ya cobrada por otro
   * camino). Queda registrado **quién** y **con qué referencia**: antes esto lo podía
   * disparar cualquiera con el id de la reserva y sin dejar rastro.
   */
  async confirmDepositForShop(
    userId: string,
    reservationId: string,
    opts: { shopId?: string; proof?: string } = {},
  ) {
    const { row: r, esHotel, esAdmin } = await this.loadForActor(userId, reservationId, opts.shopId);
    if (!esHotel && !esAdmin) {
      throw new DomainError('NOT_RESERVATION_PARTICIPANT', 'Solo el hotel (o la administración) confirma el cobro');
    }
    if (!['hold', 'pending'].includes(String(r.status))) {
      throw new DomainError('INVALID_STATE', `No se puede confirmar la señal de una reserva «${r.status}»`);
    }
    if (Number(r.deposit_xaf) <= 0) {
      throw new DomainError('NO_DEPOSIT', 'Esa reserva no tiene señal: se paga al llegar');
    }
    const vencida = String(r.status) === 'hold' && r.hold_expires_at
      && new Date(r.hold_expires_at).getTime() <= Date.now();
    if (vencida) {
      throw new DomainError('HOLD_EXPIRED', 'La retención venció: pídele al huésped que reserve otra vez');
    }
    const proof = String(opts.proof ?? '').trim().slice(0, 200) || null;

    await this.db.$transaction(async (tx: any) => {
      const cambiadas: number = await tx.$executeRaw`
        UPDATE lifebook.reservations
           SET payment_status = 'deposit_paid',
               deposit_paid_at = now(),
               deposit_confirmed_by = ${userId}::uuid,
               deposit_proof = ${proof},
               status = CASE WHEN status = 'hold' THEN 'pending' ELSE status END,
               hold_expires_at = now() + interval '24 hours',
               updated_at = now()
         WHERE id = ${r.id}::uuid AND status IN ('hold','pending')`;
      if (!cambiadas) {
        throw new DomainError('RESERVATION_STATE_CHANGED', 'La reserva cambió de estado mientras la mirabas. Recarga.');
      }
    });

    await this.notify(r, userId, `Señal de ${Number(r.deposit_xaf).toLocaleString('fr-FR')} XAF confirmada ✅`);
    return this.getReservationForShop(userId, r.id, opts.shopId);
  }

  /**
   * 🔒 Carga la reserva comprobando quién pregunta: el huésped, el dueño del hotel
   * (con la pertenencia DENTRO del WHERE, así un `shopId` ajeno no devuelve nada) o
   * la administración. Sin identidad no se lee.
   */
  private async loadForActor(userId: string, reservationId: string, shopId?: string) {
    const id = this.uuid(reservationId, 'Reserva');
    const filas: any[] = await this.db.$queryRaw`
      SELECT r.*, r.check_in::text AS check_in, r.check_out::text AS check_out,
             rt.name AS room_type_name, rt.cancellation_hours,
             s.owner_id AS shop_owner
        FROM lifebook.reservations r
        LEFT JOIN lifebook.room_types rt ON rt.id = r.room_type_id
        LEFT JOIN lifebook.shops s ON s.id = r.shop_id
       WHERE r.id = ${id}::uuid LIMIT 1`;
    const r = filas[0];
    if (!r) throw new DomainError('RESERVATION_NOT_FOUND', 'Esa reserva no existe o no es de tu hotel');

    const esAdmin = await this.isAdmin(userId);
    if (esAdmin) return { row: r, esHuesped: false, esHotel: false, esAdmin: true };

    const esHuesped = r.guest_id === userId;
    let esHotel = r.shop_owner === userId;
    // Si la petición traía un shopId concreto, la tienda tiene que ser ESA y ser suya.
    if (esHotel && shopId) {
      const propia = await this.shopOf(userId, shopId);
      esHotel = !!propia && propia.id === r.shop_id;
    }
    if (!esHuesped && !esHotel && !esAdmin) {
      throw new DomainError('RESERVATION_NOT_FOUND', 'Esa reserva no existe o no es de tu hotel');
    }
    return { row: r, esHuesped, esHotel, esAdmin };
  }

  // ─────────────────────────── AVISO EN EL CHAT ─────────────────────────────
  private async notify(r: any, autorId: string, texto: string) {
    try {
      if (!texto) return;
      const otro = r.shop_owner === autorId || r.guest_id !== autorId ? r.guest_id : r.shop_owner;
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
