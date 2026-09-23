/**
 * settlement.ts — cliente de la LIQUIDACIÓN DE VIAJES (P1-c).
 *
 * Todo el dinero de un viaje de taxi se rige aquí: el pasajero confirma con
 * PIN el precio que propuso el conductor (lock → escrow), y al terminar cobra
 * el conductor el NETO mientras la plataforma retiene la COMISIÓN del viaje
 * (por ciudad, congelada al bloquear). Los viajes en efectivo solo se
 * REGISTRAN: cero dinero por el ledger.
 *
 * Reglas del servidor que la app debe respetar (doc P1-c, decisiones cerradas):
 *   · POST de dinero → cabecera Idempotency-Key obligatoria y token de pago
 *     (scope TRIP) emitido para IMPORTE Y VIAJE EXACTOS (TTL 90 s, un solo uso).
 *   · Ventana de cancelación gratis: 5 min desde la aceptación. Después, cuota
 *     de no-show (min(200, 20 % del fare)) al conductor y el resto de vuelta.
 *   · Cierre automático 10 min después de la llegada del conductor
 *     («He llegado»); el botón «¿Ha llegado?» del pasajero cierra antes.
 *   · Disputa: hasta 7 días después del cierre; un admin puede revertir todo.
 */

import { httpRequest } from './httpClient';

export interface SettlementView {
  tripId: string;
  role: 'DRIVER' | 'PASSENGER';
  status: string;                       // requested|accepted|in_progress|arrived|completed|cancelled
  state: 'proposed' | 'locked' | 'arrival' | 'settled' | 'cancelled' | 'disputed' | 'cash';
  kind: 'WALLET' | 'CASH' | null;
  city: string | null;
  fare: number;
  fee: number;                          // comisión CONGELADA en el lock
  net: number;                          // lo que cobra el conductor
  money: { locked: boolean; released: boolean; refunded: boolean; cancel_fee_to_driver: number; platform_fee: number };
  timers: { free_cancel_until: string | null; auto_close_at: string | null };
  timestamps: Record<string, string | null>;
  dispute: { at: string; reason: string | null; resolved_at: string | null } | null;
  settlement: Record<string, unknown> | null;
  payout_estimate: { net: number } | null;
}

/** Llave idempotencia nueva por pulsación (≤80 chars, única en el servidor). */
export const nuevaLlave = (prefijo: string) =>
  `${prefijo}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

/** Emite el token de pago PIN para un viaje (importe y viaje exactos). */
export async function tokenDeViaje(pin: string, amount: number, referenceId: string): Promise<string> {
  const r = await httpRequest<{ paymentToken?: string }>('/auth/payment-token', {
    method: 'POST',
    body: { method: 'PIN', pin, scope: 'TRIP', amount, referenceId },
  });
  if (!r?.paymentToken) throw new Error('PIN incorrecto o bloqueado');
  return r.paymentToken;
}

/** Alta/cambio del PIN de 6 dígitos (pide la contraseña de la cuenta). */
export function fijarPin(pin: string, password?: string, currentPin?: string) {
  return httpRequest<{ ok: boolean }>('/wallet/pin', {
    method: 'POST', body: { pin, ...(password ? { password } : {}), ...(currentPin ? { currentPin } : {}) },
  });
}

export const settlementApi = {
  /** Compañero del diseño: la comisión la CUOTA el servidor (política en BD). */
  quote: (city: string | null | undefined, fare: number) =>
    httpRequest<{ scope: string | null; fee: number; net: number }>(
      `/rides/quote?city=${encodeURIComponent(city ?? '')}&fare=${encodeURIComponent(String(fare))}`,
      { method: 'GET' },
    ),

  /** Vista de liquidación del viaje (estado derivado del ledger). */
  view: (tripId: string) =>
    httpRequest<SettlementView>(`/rides/${tripId}/settlement`, { method: 'GET' }),

  /** Pasajero: confirma con PIN el precio propuesto → bloquea el fare. */
  lock: (tripId: string, paymentToken: string, city?: string | null) =>
    httpRequest<{ fare: number; fee: number; net: number; replay?: boolean }>(`/rides/${tripId}/lock`, {
      method: 'POST', body: city ? { city } : {},
      headers: { 'Idempotency-Key': nuevaLlave('lock'), 'X-Payment-Token': paymentToken },
    }),

  /** Pasajero: paga en efectivo al conductor (sin nada en el monedero). */
  chooseCash: (tripId: string) =>
    httpRequest<{ kind: string }>(`/rides/${tripId}/cash`, {
      method: 'POST', body: {}, headers: { 'Idempotency-Key': nuevaLlave('cash') },
    }),

  /** CONDUCTOR: «He llegado» → abre la cuenta atrás de cierre automático. */
  arrival: (tripId: string) =>
    httpRequest<{ status: string }>(`/rides/${tripId}/arrival`, {
      method: 'POST', body: {}, headers: { 'Idempotency-Key': nuevaLlave('arrival') },
    }),

  /** Pasajero (o sistema a los 10 min): cierra y reparte neto+comisión. */
  settle: (tripId: string) =>
    httpRequest<{ fare: number; fee: number; net: number; replay?: boolean }>(`/rides/${tripId}/settle`, {
      method: 'POST', body: {}, headers: { 'Idempotency-Key': nuevaLlave('settle') },
    }),

  /** Pasajero cancela: gratis en ventana, cuota de no-show después. */
  cancel: (tripId: string, reason?: string) =>
    httpRequest<{ refunded: number; fee_to_driver: number; free_window: boolean }>(`/rides/${tripId}/cancel`, {
      method: 'POST', body: { ...(reason ? { reason } : {}) }, headers: { 'Idempotency-Key': nuevaLlave('cancel') },
    }),

  /** CONDUCTOR cancela: reembolso total al pasajero + falta (3 → suspensión). */
  driverCancel: (tripId: string, reason?: string) =>
    httpRequest<{ strikes_7d: number; suspension: { suspended_until: string } | null }>(`/rides/${tripId}/driver-cancel`, {
      method: 'POST', body: { ...(reason ? { reason } : {}) }, headers: { 'Idempotency-Key': nuevaLlave('dcancel') },
    }),

  /** Pasajero abre disputa (hasta 7 días tras el cierre). */
  dispute: (tripId: string, reason: string) =>
    httpRequest<{ disputed: boolean }>(`/rides/${tripId}/dispute`, {
      method: 'POST', body: { reason }, headers: { 'Idempotency-Key': nuevaLlave('dispute') },
    }),
};
