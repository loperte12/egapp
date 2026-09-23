/**
 * Cliente de taxi unificado (backend NestJS /wallet/api/v1/mobility).
 * Modalidades con algoritmo de precios + pedir viaje + conductor.
 */

import { http } from './httpClient';

export interface TaxiMode {
  id: string;
  label: string;
  icon: string;
  price: number;
  etaMin: number;
}

export interface TaxiTripPayload {
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string;
  dropoffLat: number;
  dropoffLng: number;
  dropoffAddress?: string;
  zoneType?: string;
  requestedPrice?: number;   // presupuesto elegido por el pasajero
  algorithmPrice?: number;   // precio del algoritmo (modalidad)
  modality?: string;
  isPool?: boolean;
  maxPoolSeats?: number;
  passengers?: number;       // nº de pasajeros (1–6)
  city?: string;             // P1-c: 'Malabo' | 'Bata' — la comisión del viaje es por ciudad
}

export const taxiApi = {
  /** Modalidades con el precio del algoritmo (según ciudad y distancia OSRM). */
  modes: (city = 'Malabo', distanceKm = 0) =>
    http.get<{ modes: TaxiMode[] }>(`/mobility/fares/taxi/modes?city=${encodeURIComponent(city)}&distanceKm=${distanceKm}`, false),

  /** Pedir taxi (requiere sesión). */
  createTrip: (body: TaxiTripPayload) =>
    http.post<{ id: string; status: string }>('/mobility/trips', body, true),

  /** Estado del viaje (polling del pasajero). */
  getTrip: (id: string) =>
    http.get<Record<string, unknown>>(`/mobility/trips/${id}`, true),

  /** Viaje ACTIVO del pasajero (requested/accepted/in_progress) para reanudar
   *  tras cerrar la app o desde la tarjeta del Perfil. null si no hay. */
  activeTrip: () =>
    http.get<Record<string, unknown> | null>('/mobility/trips/active', true),

  /** Solicitudes abiertas + propias (panel del conductor). */
  driverTrips: () =>
    http.get<unknown[]>('/mobility/trips/driver', true),

  /** El conductor acepta y elige el precio (final_price). */
  acceptTrip: (id: string, price?: number) =>
    http.post<Record<string, unknown>>(`/mobility/trips/${id}/accept`, price != null ? { price } : {}, true),

  /** El conductor avanza estados: in_progress → completed / cancelled.
   *  P4: cashConfirmed=false al completar ⇒ el servidor BLOQUEA al conductor
   *  hasta que confirme el cobro (confirmCash). */
  updateStatus: (id: string, status: 'in_progress' | 'completed' | 'cancelled', cashConfirmed?: boolean) =>
    http.put<Record<string, unknown>>(`/mobility/trips/${id}/status`, { status, ...(cashConfirmed !== undefined ? { cashConfirmed } : {}) }, true),

  /** P4: el conductor confirma que SÍ cobró el viaje en efectivo → desbloqueo. */
  confirmCash: (id: string) =>
    http.post<{ unblocked: boolean; trip?: string }>(`/mobility/trips/${id}/confirm-cash`, {}, true),

  /** Heartbeat del conductor: posición en vivo para que el pasajero lo vea. */
  reportLocation: (id: string, lat: number, lng: number) =>
    http.post<{ id: string; driver_lat: number; driver_lng: number }>(
      `/mobility/trips/${id}/location`, { lat, lng }, true,
    ),

  /** PASAJERO: rechaza al conductor asignado → el viaje vuelve a "requested"
   *  y se sigue buscando otro conductor (flujo DiDi Fase 2). */
  rejectDriver: (id: string) =>
    http.post<{ id: string; status: string }>(`/mobility/trips/${id}/reject`, {}, true),

  /** PASAJERO: cancela ("rendirse") antes de iniciar el viaje.
   *  P1e: acepta el motivo (visible para el admin). */
  cancelTrip: (id: string, reason?: string) =>
    http.post<{ id: string; status: string; cancelledReason?: string | null }>(
      `/mobility/trips/${id}/cancel`, reason ? { reason } : {}, true,
    ),

  /** P1e: el pasajero puntúa al conductor (1–5) tras completar el viaje. */
  rateTrip: (id: string, score: number, comment?: string) =>
    http.post<{ tripId: string; score: number; driverRatingAvg: number; driverRatingCount: number }>(
      `/mobility/trips/${id}/rate`, { score, ...(comment ? { comment } : {}) }, true,
    ),

  /** P6: historial de viajes del usuario (conductor o pasajero, según rol). */
  history: () =>
    http.get<{ asDriver: boolean; trips: TripHistoryItem[] }>('/mobility/trips/history', true),
};

export interface TripHistoryItem {
  id: string;
  status: 'completed' | 'cancelled';
  pickup_address?: string | null;
  dropoff_address?: string | null;
  final_price?: string | null;
  requested_price?: string | null;
  modality?: string | null;
  cancelled_reason?: string | null;
  created_at: string;
  accepted_at?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  cancelled_at?: string | null;
  counterpart_name?: string | null;
  vehicle_plate?: string | null;
  vehicle_model?: string | null;
  my_rating?: number | null;
  my_comment?: string | null;
  rated_at?: string | null;
  // P1-c: liquidación del viaje (viajes nuevos; los viejos vienen sin estas claves).
  city?: string | null;
  settlement_kind?: 'WALLET' | 'CASH' | null;
  fee_info?: { fee?: number; scope?: string; city?: string } | null;
  settlement?: {
    kind?: string; fare?: number; fee?: number; net?: number;
    fee_to_driver?: number; refunded?: number;
    dispute?: { outcome?: string; note?: string; at?: string; resolved_at?: string };
  } | null;
  cancelled_by?: string | null;
  disputed_at?: string | null;
}
