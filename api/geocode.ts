/**
 * Cliente del geocoder local (calles/avenidas/POIs de OSM, mirror HK).
 * Endpoints servidos por el mbtiles-server :8081 vía nginx /maps/tiles/:
 *   · /geocode?q=...   — búsqueda por nombre
 *   · /reverse?lon=&lat= — nombre del punto al tocar/arrastrar el mapa
 */

import { API_HOST } from './config';

export interface GeoPlace {
  name: string;
  kind: string;
  lon: number;
  lat: number;
}

export interface ReversePlace extends GeoPlace {
  distanceM: number;
}

export const GEOCODE_URL = `${API_HOST}/maps/tiles/geocode`;
export const REVERSE_URL = `${API_HOST}/maps/tiles/reverse`;

export async function geocode(q: string): Promise<GeoPlace[]> {
  const query = q.trim().toLowerCase();
  if (query.length < 2) return [];
  try {
    const res = await fetch(`${GEOCODE_URL}?q=${encodeURIComponent(query)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.results ?? []) as GeoPlace[];
  } catch {
    return [];
  }
}

/** Nombre real del lugar en (lon,lat) — p. ej. al fijar destino tocando el mapa. */
export async function reverseGeocode(lon: number, lat: number): Promise<ReversePlace[]> {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return [];
  try {
    const res = await fetch(`${REVERSE_URL}?lon=${lon.toFixed(6)}&lat=${lat.toFixed(6)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.results ?? []) as ReversePlace[];
  } catch {
    return [];
  }
}

/** Kinds de calle: si el punto está en una vía, su nombre es la "dirección". */
const ROAD_KINDS = new Set([
  'road', 'residential', 'primary', 'secondary', 'tertiary', 'motorway', 'trunk',
  'unclassified', 'service', 'living_street', 'pedestrian', 'path', 'steps',
]);

/**
 * Elige la mejor etiqueta para un punto del mapa: prefiere la calle más
 * cercana (< 600 m) y, si no hay, el POI/lugar más cercano.
 */
export function pickReverseLabel(results: ReversePlace[]): string | null {
  if (!results || results.length === 0) return null;
  const road = results.find((r) => ROAD_KINDS.has(r.kind) && r.distanceM <= 600);
  if (road) return road.name;
  const near = results.find((r) => r.distanceM <= 600);
  if (near) return near.name;
  return results[0]?.name ?? null;
}
