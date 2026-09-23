/**
 * heatZones — ZONAS CALIENTES SIMULADAS (P3, decisión del dueño 2026-09-08):
 * SOLO visual, círculos rojo/amarillo/azul; NO hay demanda real todavía.
 * Los centros son aproximaciones por barrios conocidos (no datos reales).
 */

export type HeatLevel = 'high' | 'mid' | 'low';

export interface HeatZone {
  city: 'malabo' | 'bata';
  lat: number;
  lng: number;
  rM: number;      // radio en metros (aprox.)
  level: HeatLevel;
}

export const HEAT_ZONES: HeatZone[] = [
  // ── Malabo ────────────────────────────────────────────────────────────────
  { city: 'malabo', lng: 8.7761, lat: 3.7542, rM: 900, level: 'high' },   // Centro / Plaza
  { city: 'malabo', lng: 8.7738, lat: 3.7546, rM: 600, level: 'high' },   // Mercado
  { city: 'malabo', lng: 8.7816, lat: 3.7518, rM: 800, level: 'mid' },    // Ela Nguema
  { city: 'malabo', lng: 8.7595, lat: 3.7580, rM: 700, level: 'mid' },    // Estadio
  { city: 'malabo', lng: 8.7700, lat: 3.7465, rM: 750, level: 'low' },    // Zona portuaria
  { city: 'malabo', lng: 8.9280, lat: 3.6680, rM: 1100, level: 'low' },   // Sipopo
  { city: 'malabo', lng: 8.7174, lat: 3.7373, rM: 1000, level: 'low' },   // Aeropuerto
  // ── Bata ──────────────────────────────────────────────────────────────────
  { city: 'bata', lng: 9.7652, lat: 1.8625, rM: 850, level: 'high' },     // Centro
  { city: 'bata', lng: 9.7610, lat: 1.8640, rM: 600, level: 'high' },     // Mercado
  { city: 'bata', lng: 9.7700, lat: 1.8590, rM: 750, level: 'mid' },      // Barrio residencial
  { city: 'bata', lng: 9.8050, lat: 1.9050, rM: 1000, level: 'low' },     // Aeropuerto
  { city: 'bata', lng: 9.7480, lat: 1.8560, rM: 700, level: 'low' },      // Playa
];

/** Elige el conjunto de zonas para la ciudad MÁS CERCANA a un punto dado. */
export function heatZonesNear(lng: number, lat: number): Array<Omit<HeatZone, 'city'>> {
  const centers: Record<HeatZone['city'], [number, number]> = {
    malabo: [8.7761, 3.7542],
    bata: [9.7652, 1.8625],
  };
  let near: HeatZone['city'] = 'malabo';
  let best = Infinity;
  (Object.keys(centers) as HeatZone['city'][]).forEach((c) => {
    const d = Math.abs(centers[c][0] - lng) + Math.abs(centers[c][1] - lat);
    if (d < best) { best = d; near = c; }
  });
  return HEAT_ZONES.filter((z) => z.city === near).map(({ city: _c, ...rest }) => rest);
}
