/**
 * Cliente de alta de conductor (backend unificado /wallet/api/v1/mobility).
 * Documentos (licencia f/r + DIP + selfie), vehículo y re-verificación online.
 */

import { http } from './httpClient';

export interface DriverStatus {
  status: 'none' | 'pending' | 'approved' | 'rejected';
  verified?: boolean;
  driver?: {
    id: string;
    vehicle_type?: string;
    vehicle_plate?: string;
    vehicle_model?: string;
    vehicle_color?: string;          // P1a: color del coche
    vehicle_photo_url?: string | null; // P1a: foto real del coche (URL interna)
    status?: string;
    resting?: boolean;              // DESCANSO: activo pero sin solicitudes
    cash_blocked_at?: string | null; // cobro sin confirmar (P4)
    cash_blocked_trip?: string | null;
    work_mode?: string;
    nationality?: string;
  };
}

export interface DocRequirementApi {
  code: string;
  label: string;
  isRequired: boolean;
  photos: 1 | 2;
  note: string | null;
  hasExpiry: boolean;
  submitted: boolean;
  frontUrl: string | null;
  backUrl: string | null;
  expiresAt: string | null;
  status: string;
}

export interface DocExpiry {
  docType: string;
  label: string;
  expiresAt: string;
  daysLeft: number;
  status: 'expired' | 'expiring' | 'ok';
}

export interface DocCategoryApi {
  code: string;
  title: string;
  docs: DocRequirementApi[];
}

export interface DriverDocProgress {
  categories: DocCategoryApi[];
  vehicle: {
    vehicle_type?: string; vehicle_plate?: string; vehicle_model?: string; license_number?: string;
    vehicle_color?: string; vehicle_photo_url?: string | null; // P1a
  } | null;
}

export const driverApi = {
  /** Estado del perfil de conductor. */
  status: () => http.get<DriverStatus>('/mobility/driver/status', true),

  /** Envía documentos + vehículo → queda PENDING (revisión admin). */
  submitDocuments: (body: {
    licenseFront: string; licenseBack: string; dipFront: string; selfie: string;
    licenseNumber?: string; vehicleType?: string; vehiclePlate?: string; vehicleModel?: string;
  }) => http.post<{ status: string; message: string }>('/mobility/driver/documents', body, true),

  /** Catálogo de requisitos + progreso del alta (wizard). */
  requirements: () => http.get<DriverDocProgress>('/mobility/driver/documents/requirements', true),

  /** Guarda un paso del alta (una categoría de documentos; 'vehiculo' incluye datos del vehículo). */
  submitStep: (body: {
    category: string;
    nationality?: string;
    vehicle?: {
      vehicleType?: string; vehiclePlate?: string; vehicleModel?: string; licenseNumber?: string;
      vehicleColor?: string;        // P1a: color del coche
      vehiclePhoto?: string;        // P1a: foto real (dataURL/captured://)
    };
    docs: Array<{ code: string; front?: string; back?: string; expiresAt?: string }>;
  }) => http.post<{ status: string; message: string }>('/mobility/driver/documents/step', body, true),

  /** Avisos de caducidad de documentos (expired / próxima a caducar). */
  expiries: () => http.get<{ expiries: DocExpiry[] }>('/mobility/driver/documents/expiries', true),

  /** Modo de trabajo del día: 'city' | 'intercity' | 'both'. */
  setWorkMode: (mode: 'city' | 'intercity' | 'both') =>
    http.put<{ workMode: string; message: string }>('/mobility/driver/work-mode', { mode }, true),

  /** Selfie de identidad (paso final del alta). */
  submitSelfie: (selfie: string) =>
    http.post<{ status: string; message: string }>('/mobility/driver/documents/selfie', { selfie }, true),

  /** Re-verificación de identidad (selfie) para ponerse en línea. */
  goOnline: (selfie: string) =>
    http.post<{ online: boolean; message: string }>('/mobility/driver/online', { selfie }, true),

  /** DESCANSO (decisión del dueño): estado propio 'resting' en backend; volver
   *  a trabajar es UN TOQUE sin selfie (rest=false). */
  setRest: (rest: boolean) =>
    http.post<{ resting: boolean; status: string; message: string }>('/mobility/driver/rest', { rest }, true),
};
