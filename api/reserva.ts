/**
 * Cliente de reserva anticipada de vehículo (backend unificado NestJS).
 * Endpoint: /mobility/trips/reserve (vía httpClient con sesión de la app).
 */

import { http, ApiError } from './httpClient';

export { ApiError };

export interface ReservePayload {
  userId?: string;
  origin?: string;
  dest?: string;
  pickupLat?: number;
  pickupLng?: number;
  dropoffLat?: number;
  dropoffLng?: number;
  scheduledAt: string;
  durationMin?: number;
  estimatedPrice?: number;
  budget?: number;
  vehicleType?: string;
  notes?: string;
}

export interface Reservation {
  id: string;
  scheduled_at: string;
  status: string;
  estimated_price: number | string;
}

export const reservaApi = {
  reserve: (body: ReservePayload) =>
    http.post<Reservation>('/mobility/trips/reserve', body),
};
