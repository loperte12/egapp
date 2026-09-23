/**
 * Cliente del servicio Ciudad a Ciudad (intercity) — backend unificado.
 * ⚠️ Base ABSOLUTA: el intercity vive en /api/intercity/* (no bajo /wallet/api/v1).
 * Endpoints públicos: locations, routes, trips, fotos · Autenticados: publicar,
 * mis viajes, estados, edición, reservas (idempotentes), cancelaciones, pago,
 * tarifa y earnings (ganancias del conductor).
 */

import { http, httpRequest } from './httpClient';

import { API_HOST } from './config';
export const IC_API_BASE = `${API_HOST}/api`;
const ic = (p: string) => `${IC_API_BASE}${p}`;

export interface IcLocation { province: string; district: string; zone: string; }
export interface IcRoute {
  id: string; originCity: string; destinationCity: string;
  originProvince?: string; originDistrict?: string; originZone?: string;
  destinationProvince?: string; destinationDistrict?: string; destinationZone?: string;
  basePrice: string; currency: string; isActive: boolean;
}
export const IC_VEHICLE_TYPES = ['car', 'van', 'minibus', 'truck'] as const;
export type IcVehicleType = (typeof IC_VEHICLE_TYPES)[number];
export const IC_VEHICLE_LABELS: Record<string, string> = { car: 'Coche', van: 'Furgoneta', minibus: 'Minibús', truck: 'Camión' };

export interface IcTrip {
  id: string; routeId: string; vehiclePlate?: string; vehicleModel?: string;
  vehicleType?: string; rentalPrice?: string | null;
  totalSeats: number; availableSeats: number; price: string; currency: string;
  status: string; departureTime: string; arrivalTime?: string;
  publisherName?: string | null; publisherPhoto?: string | null; route?: IcRoute;
  publisherBadge?: string | null; priority?: number;
  photos?: string[];
  bookings?: Array<{ id: string; seatCount: number; totalPrice?: string | null; status: string; fareStatus: string; paymentStatus: string; payOn?: string; buyerName?: string | null; buyerPhone?: string | null; passenger?: { firstName: string; lastName: string; phone: string } }>;
}
export interface IcBooking {
  id: string; tripId: string; seatCount: number; totalPrice: string;
  ticketQrCode: string; shortCode?: string | null; status: string; pickupType: string; pickupAddress?: string;
  fareStatus: string; paymentStatus: string; payOn?: string;
  buyerName?: string | null; buyerPhone?: string | null;
}

export interface IcTicket {
  id: string; tripId: string; seatCount: number; totalPrice: string;
  ticketQrCode: string; shortCode?: string | null; status: string; pickupType: string; pickupAddress?: string;
  fareStatus: string; paymentStatus: string; payOn?: string;
  buyerName?: string | null; buyerPhone?: string | null;
  passenger?: { firstName: string; lastName: string; phone: string };
  trip?: { id: string; departureTime: string; status: string; price: string; route?: IcRoute };
}
export interface DriverEarnings {
  period: string;
  totalGross: number;
  totalNet: number;
  city: { gross: number; net: number; trips: number };
  intercity: { gross: number; bookings: number; pendingCollection: number };
  commissionDebt?: { pendingXaf: number; entries: number; rateBps: number };
}

export interface IcPlan {
  planCode: string; planName: string; monthlyTrips: number; // -1 = ilimitado
  monthlyUsed: number; expiresAt: string | null; publisherType: 'driver' | 'agent';
}

export const intercityApi = {
  locations: () => http.get<IcLocation[]>(ic('/intercity/locations'), false),
  routes: (q: Record<string, string> = {}) => {
    const qs = new URLSearchParams(q).toString();
    return http.get<IcRoute[]>(ic(`/intercity/routes${qs ? '?' + qs : ''}`), false);
  },
  trips: (routeId?: string, date?: string, vehicleType?: string) => {
    const p: Record<string, string> = {};
    if (routeId) p.routeId = routeId;
    if (date) p.date = date;
    if (vehicleType) p.vehicleType = vehicleType;
    const qs = new URLSearchParams(p).toString();
    return http.get<IcTrip[]>(ic(`/intercity/trips${qs ? '?' + qs : ''}`), false);
  },
  publish: (body: {
    origin: IcLocation; destination: IcLocation;
    departureTime?: string; departureDays?: string[]; departureTimeOfDay?: string;
    seats: number; price: number; vehiclePlate?: string; vehicleModel?: string;
    vehicleType?: string; rentalPrice?: number; photos?: string[];
  }) => http.post<{ message: string; trips: IcTrip[] }>(ic('/intercity/trips'), body, true),
  updateTrip: (tripId: string, body: {
    price?: number; seats?: number; rentalPrice?: number | null;
    vehiclePlate?: string; vehicleModel?: string; vehicleType?: string; departureTime?: string;
  }) => http.put<{ message: string; trip: IcTrip }>(ic(`/intercity/trips/${tripId}`), body, true),
  addTripPhotos: (tripId: string, photos: string[]) =>
    http.post<{ message: string; photos: string[] }>(ic(`/intercity/trips/${tripId}/photos`), { photos }, true),
  myTrips: () => http.get<IcTrip[]>(ic('/intercity/trips/mine'), true),
  myPlan: () => http.get<IcPlan>(ic('/intercity/me/plan'), true),
  tripStatus: (tripId: string, status: string) =>
    http.put<{ message: string }>(ic(`/intercity/trips/${tripId}/status`), { status }, true),
  cancelTrip: (tripId: string) =>
    http.put<{ message: string }>(ic(`/intercity/trips/${tripId}/cancel`), {}, true),
  book: (body: {
    tripId: string; seatCount: number;
    passenger: { firstName: string; lastName: string; phone: string; nationalityType: string; documentType: string; documentNumber: string; isMinor?: boolean; minorCount?: number; guardianId?: string; guardianName?: string; specialNeeds?: string };
    pickupType?: string; pickupAddress?: string; passengerFare?: number; rental?: boolean; payOn?: 'boarding' | 'destination';
  }, idemKey?: string) => httpRequestWithIdem<{ booking: IcBooking; ticketQrCode: string; message: string; fareStatus: string }>(ic('/intercity/bookings'), body, idemKey),
  cancelBooking: (bookingId: string) =>
    http.put<{ message: string }>(ic(`/intercity/bookings/${bookingId}/cancel`), {}, true),
  /** Mis tickets: como comprador o como viajero. */
  myBookings: () => http.get<IcTicket[]>(ic('/intercity/bookings/mine'), true),
  markPaid: (bookingId: string) =>
    http.put<{ message: string }>(ic(`/intercity/bookings/${bookingId}/paid`), {}, true),
  decideFare: (bookingId: string, action: 'accept' | 'decline') =>
    http.put<{ message: string }>(ic(`/intercity/bookings/${bookingId}/fare`), { action }, true),
  /** Ganancias del conductor (ciudad + intercity). period: today|week|month|all. */
  earnings: (period = 'all') =>
    http.get<DriverEarnings>(ic(`/intercity/driver/earnings?period=${period}`), true),
};

async function httpRequestWithIdem<T>(path: string, body: unknown, idemKey?: string): Promise<T> {
  return httpRequest<T>(path, {
    method: 'POST',
    body,
    headers: idemKey ? { 'Idempotency-Key': idemKey } : undefined,
  });
}
