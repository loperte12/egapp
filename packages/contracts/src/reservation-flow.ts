/**
 * reservation-flow — LA MÁQUINA DE ESTADOS DE UNA RESERVA, en un solo sitio.
 *
 * Lo que corrige del bloque que se escribió antes:
 *   · **Faltaba `hold`**, que es el estado en el que NACE toda reserva con pago parcial
 *     (la habitación retenida mientras se paga la señal): sin él, la pantalla no ofrecía
 *     ninguna acción justo cuando el usuario más las necesita.
 *   · Las etiquetas estaban indexadas por ESTADO cuando el nombre decía «acción»: ahora
 *     son acciones (`confirm`, `checkin`, `cancel`…) con su estado de destino.
 *   · Faltaba **quién** puede cada acción (el huésped solo cancela) y **qué exige**
 *     (motivo obligatorio al cancelar, depósito confirmado antes del check-in): sin eso
 *     la interfaz ofrece botones que el servidor rechaza con 409.
 *   · `Record<string, …>` no da tipos: ahora es `Record<ReservationStatus, …>`, así que
 *     una errata la caza el compilador.
 *
 * Sigue siendo una copia del servidor (el servidor es la fuente): vive aquí para que la
 * app no cablee literales en las pantallas y para poder probarla sin base de datos.
 *
 * **LA REGLA DE CANCELAR ESTABA ESCRITA TRES VECES.** Medido el 27-sep-2026: este fichero
 * (`RESERVATION_TRANSITIONS`) más dos condiciones copiadas entre sí, a mano, en las dos
 * pantallas del huésped (`lifebook-hotel-reservas.tsx` y `lifebook-hotel-reserva.tsx`), las
 * dos con la misma lista `!['checked_out','cancelled','no_show']`. Ninguna de las tres
 * excluía `checked_in`. Se unifican aquí: las pantallas preguntan a `availableActions()`.
 *
 * **[PENDIENTE EN EL SERVIDOR — no cerrado por esto]** `reservations.service.ts` calcula su
 * propio `canCancel` y su lista **sí incluye `checked_in`**, así que el servidor sigue
 * aceptando cancelar una estancia en curso. Este cambio endurece EL CLIENTE (deja de ofrecer
 * el botón); no cierra el agujero. Cuando el servidor corrija su lista, el cliente debe pasar
 * a confiar en `reservation.canCancel ?? availableActions(...)`: la ventana de cancelación
 * depende del reloj y el reloj del servidor es el que vale.
 */

/** Los SIETE estados reales (los mismos que la tabla `lifebook.reservations`). */
export const RESERVATION_STATUSES = [
  'hold', 'pending', 'confirmed', 'checked_in', 'checked_out', 'cancelled', 'no_show',
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Estados de pago (el dinero va SEPARADO del estado de la reserva). */
export const PAYMENT_STATUSES = [
  'pending', 'proof_submitted', 'deposit_paid', 'paid', 'refunded', 'failed',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Las acciones que una persona puede ejecutar. */
export const RESERVATION_ACTIONS = ['confirm', 'checkin', 'checkout', 'cancel', 'noshow'] as const;
export type ReservationAction = (typeof RESERVATION_ACTIONS)[number];

export interface ReservationActionSpec {
  /** Estado al que lleva la acción. */
  to: ReservationStatus;
  /** Etiqueta para el botón, desde el punto de vista de quien la ejecuta. */
  label: string;
  /** Quién puede: el hotel, el huésped, o los dos. */
  who: Array<'hotel' | 'guest'>;
  /** ¿Exige motivo escrito? (queda registrado en la reserva) */
  reasonRequired?: boolean;
  /** ¿Exige que la señal esté cobrada? */
  requiresDepositPaid?: boolean;
}

/** Acciones por estado de origen. Un estado terminal no tiene ninguna (`[]`). */
export const RESERVATION_TRANSITIONS: Readonly<Record<ReservationStatus, ReservationAction[]>> = {
  // Retenida sin pagar: lo urgente es cobrar la señal (botón aparte) o soltarla.
  hold: ['cancel'],
  // Señal cobrada, sin confirmar por el hotel: lo natural es confirmar la reserva.
  pending: ['confirm', 'cancel'],
  confirmed: ['checkin', 'noshow', 'cancel'],
  // Con el huésped DENTRO no existe «cancelar» (decisión §8.2 del dossier del hotel).
  // Antes decía `['checkout', 'cancel']`, y con eso una estancia en curso se podía
  // «cancelar»: el resultado medido era «Devuelto» SIN devolución, y la habitación
  // quedaba libre con el huésped dentro. La regla es de tiempo y de estado: antes del
  // check-in cancela el huésped; después, el hotel cierra con `checkout` o `no_show`
  // (este último solo desde `confirmed`).
  checked_in: ['checkout'],
  checked_out: [],
  cancelled: [],
  no_show: [],
};

/** La ficha de cada acción (etiqueta, quién y qué exige). */
export const RESERVATION_ACTIONS_SPEC: Readonly<Record<ReservationAction, ReservationActionSpec>> = {
  confirm: { to: 'confirmed', label: 'Confirmar reserva', who: ['hotel'], requiresDepositPaid: true },
  checkin: { to: 'checked_in', label: 'Registrar entrada', who: ['hotel'], requiresDepositPaid: true },
  checkout: { to: 'checked_out', label: 'Registrar salida', who: ['hotel'] },
  cancel: { to: 'cancelled', label: 'Cancelar reserva', who: ['hotel', 'guest'], reasonRequired: true },
  noshow: { to: 'no_show', label: 'No se presentó', who: ['hotel'], reasonRequired: true },
};

/**
 * Etiquetas de estado en lenguaje humano, con el matiz del DINERO incluido (una
 * reserva «pending» no es solo «pendiente»: es «señal pagada, por confirmar»).
 */
export const RESERVATION_STATUS_LABELS: Readonly<Record<ReservationStatus, string>> = {
  hold: 'Sin pagar (retenida)',
  pending: 'Señal pagada · por confirmar',
  confirmed: 'Confirmada',
  checked_in: 'Huésped dentro',
  checked_out: 'Finalizada',
  cancelled: 'Cancelada',
  no_show: 'No se presentó',
};

/** Estados que OCUPAN inventario (una retención vencida ya no). */
export const OCCUPYING_STATUSES: readonly ReservationStatus[] =
  ['hold', 'pending', 'confirmed', 'checked_in'];

/**
 * ¿Sigue ocupando la habitación? Una retención con la cuenta atrás agotada ya NO,
 * aunque el barrido del servidor todavía no la haya cancelado.
 */
export function isReservationLive(
  status: ReservationStatus | string,
  holdExpiresAt?: string | null,
  now: number = Date.now(),
): boolean {
  if (!OCCUPYING_STATUSES.includes(status as ReservationStatus)) return false;
  if (status === 'hold' && holdExpiresAt) return new Date(holdExpiresAt).getTime() > now;
  return true;
}

/**
 * Acciones que puede hacer un actor ahora mismo sobre una reserva.
 *
 * `who`: 'hotel' | 'guest' | 'admin'. La administración las tiene todas.
 * `depositPaid`: para no ofrecer un check-in que el servidor va a rechazar.
 */
export function availableActions(
  status: ReservationStatus | string,
  opts: { who: 'hotel' | 'guest' | 'admin'; depositPaid?: boolean; viva?: boolean } ,
): ReservationAction[] {
  const acciones = RESERVATION_TRANSITIONS[status as ReservationStatus] ?? [];
  const viva = opts.viva ?? isReservationLive(status as ReservationStatus);
  return acciones.filter((a) => {
    const spec = RESERVATION_ACTIONS_SPEC[a];
    if (opts.who !== 'admin' && !spec.who.includes(opts.who)) return false;
    // Una retención vencida solo se puede «soltar» (cancelar/no presentar).
    if (!viva && a !== 'cancel') return false;
    // Confirmar y entrar exigen que la señal esté cobrada (si hay señal).
    if (spec.requiresDepositPaid && opts.depositPaid === false && status === 'confirmed') {
      return a !== 'checkin';
    }
    return true;
  });
}
