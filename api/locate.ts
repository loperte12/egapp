/**
 * Localización real (GPS) para acciones "ubicarme ahora" y modo navegación.
 * Regla de negocio: el GPS solo se usa si el dispositivo está DENTRO de Guinea
 * Ecuatorial (bbox). Fuera (p. ej. el dueño probando desde China) devolvemos
 * null y cada pantalla usa su fallback (dirección real de la ciudad activa).
 *
 * ⚠️ NUNCA bloquear el flujo del conductor por el GPS: estas funciones tienen
 * timeout. Si el permiso no está concedido o no hay fix en X ms → null.
 */

import * as Location from 'expo-location';
import { CITIES } from '../constants/data';
import { CITY_CENTERS } from '../constants/geo';

export type LocCoord = [number, number];

/** Bounding box aproximado de Guinea Ecuatorial (incluye islas). */
export function isInsideGq(c: LocCoord): boolean {
  return c[0] >= 5.0 && c[0] <= 11.6 && c[1] >= -1.7 && c[1] <= 4.2;
}

/** Ciudad (por nombre) más cercana a unas coordenadas, para etiquetas. */
export function nearestCityName(coord: LocCoord): string {
  let best = '';
  let bestD = Infinity;
  for (const [id, c] of Object.entries(CITY_CENTERS)) {
    const d = (c[0] - coord[0]) ** 2 + (c[1] - coord[1]) ** 2;
    if (d < bestD) { bestD = d; best = id; }
  }
  return CITIES.find((c) => c.id === best)?.name ?? '';
}

/** Resuelve una promesa o devuelve `fallback` pasados `ms` (evita cuelgues). */
function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** Posición GPS fresca si el permiso YA está concedido y hay fix en ≤timeoutMs.
 *  NO muestra el diálogo de permisos (flujo conductor: aceptar un viaje no
 *  puede quedar bloqueado por un diálogo de Android ni por falta de señal). */
export async function getGqPositionIfAllowed(timeoutMs = 2500): Promise<LocCoord | null> {
  try {
    const perm = await withTimeout(Location.getForegroundPermissionsAsync(), 1200, null);
    if (!perm || perm.status !== 'granted') return null;
    const p = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      timeoutMs,
      null as never,
    );
    if (!p) return null;
    const c: LocCoord = [p.coords.longitude, p.coords.latitude];
    return isInsideGq(c) ? c : null;
  } catch {
    return null;
  }
}

/**
 * Posición GPS FRESCA del dispositivo si está dentro de GQ; null si no hay
 * permiso, falla el GPS o el dispositivo está fuera del país. Esta versión SÍ
 * puede pedir permiso (acciones explícitas del usuario: "Ubicarme ahora").
 */
export async function getCurrentGqPosition(): Promise<LocCoord | null> {
  try {
    const perm = await withTimeout(Location.requestForegroundPermissionsAsync(), 4000, null);
    if (!perm || perm.status !== 'granted') return null;
    const p = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      5000,
      null as never,
    );
    if (!p) return null;
    const c: LocCoord = [p.coords.longitude, p.coords.latitude];
    return isInsideGq(c) ? c : null;
  } catch {
    return null;
  }
}
