/**
 * Cliente API de movilidad — EG Route Plan.
 * Consume el módulo mobility del backend unificado (schema mobility).
 * Endpoints públicos (auth=false): zonas, servicios, tarifas. El mapa y el
 * grid los consumen en modo invitado (sin token) → fricción cero en lectura.
 * Usa httpClient (sesión inyectada + refresco 401 silencioso para rutas privadas).
 */

import { http } from './httpClient';

export interface Zone {
  id: string;
  name: string;
  zoneType: 'inside' | 'outside';
  centerLat: number;
  centerLng: number;
  radiusKm: number;
}

export interface FareQuote {
  serviceType: string;
  zoneType: string;
  vehicleType: string | null;
  currency: 'XAF';
  quote: number;
  band: { min: number; max: number };
  breakdown: {
    baseFare: number;
    perKmRate: number;
    minimumFare: number;
    distanceKm: number;
    formula: string;
  };
}

export interface ServiceCatalogEntry {
  id: string;
  serviceType: string | null;
  label: string;
  icon: string;
  eta: string;
}

export const mobilityApi = {
  zones: () => http.get<{ zones: Zone[] }>('/mobility/zones', false).then((r) => r.zones),

  services: () =>
    http.get<{ services: ServiceCatalogEntry[] }>('/mobility/services', false).then((r) => r.services),

  fareQuote: (params: {
    serviceType: 'TAXI' | 'RESERVA_COCHE' | 'PAQUETE' | 'MUDANZA' | 'ALQUILER';
    zoneType: 'inside' | 'outside';
    vehicleType?: 'motorcycle' | 'car' | 'van' | 'truck';
    distanceKm?: number;
  }): Promise<FareQuote> => {
    const qs = new URLSearchParams({
      serviceType: params.serviceType,
      zoneType: params.zoneType,
      ...(params.vehicleType ? { vehicleType: params.vehicleType } : {}),
      ...(params.distanceKm !== undefined ? { distanceKm: String(params.distanceKm) } : {}),
    });
    return http.get<FareQuote>(`/mobility/fares/quote?${qs.toString()}`, false);
  },
};

/** Formateo XAF sin decimales con separador de miles. */
export const fmtXaf = (n: number) => n.toLocaleString('es-GQ');
