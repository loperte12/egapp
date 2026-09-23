/**
 * OSRM Client — Cliente para el motor de rutas auto-hospedado OSRM.
 *
 * Endpoints usados:
 *   · GET /route/v1/driving/{lon1},{lat1};{lon2},{lat2}?overview=full&geometries=geojson
 *     → Devuelve ruta, distancia (m), duración (s), geometría GeoJSON LineString.
 *   · GET /table/v1/driving/{lon1},{lat1};{lon2},{lat2};...
 *     → Matriz de distancias (para buscar taxis/restaurantes cercanos).
 *   · GET /nearest/v1/driving/{lon},{lat}
 *     → Snap a la carretera más cercana.
 *
 * Todo en WGS84 [lon, lat] — sin transformación GCJ-02.
 * Sin claves API, sin servicios externos.
 */

import { OSRM_BASE } from '../api/config';

/**
 * Distancia haversine entre dos puntos WGS84 [lon, lat] en metros.
 * Fallback cuando OSRM no está disponible.
 */
function haversineM(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function straightLineRoute(waypoints: [number, number][]): OsrmRouteResult {
  const coords = waypoints;
  let distance = 0;
  for (let i = 1; i < coords.length; i += 1) {
    distance += haversineM(coords[i - 1], coords[i]);
  }
  // Estimación de duración: 30 km/h en ciudad
  const duration = (distance / 1000 / 30) * 3600;
  return {
    routes: [
      {
        coordinates: coords,
        distance,
        duration,
        distanceKm: distance / 1000,
        durationMin: duration / 60,
      },
    ],
    legs: [
      {
        distance,
        duration,
        steps: [],
      },
    ],
  };
}

export interface OsrmRoute {
  /** Geometría de la ruta en formato GeoJSON LineString [lon, lat][] */
  coordinates: [number, number][];
  /** Distancia en metros */
  distance: number;
  /** Duración en segundos */
  duration: number;
  /** Distancia en km (conveniencia) */
  distanceKm: number;
  /** Duración en minutos (conveniencia) */
  durationMin: number;
}

export interface OsrmRouteStep {
  distance: number;
  duration: number;
  geometry: { coordinates: [number, number][]; type: string };
  name: string;
  maneuver: {
    type: string;
    modifier?: string;
    instruction?: string;
    location: [number, number];
  };
}

export interface OsrmRouteResult {
  routes: OsrmRoute[];
  legs: { steps: OsrmRouteStep[]; distance: number; duration: number }[];
}

export interface OsrmTableResult {
  /** Matriz de distancias (metros). distances[i][j] = de origen i a destino j */
  distances: number[][];
  /** Matriz de duraciones (segundos) */
  durations: number[][];
}

/**
 * Obtiene una ruta entre dos o más puntos.
 *
 * @param waypoints Array de coordenadas [lon, lat] en WGS84
 * @param profile 'driving' | 'walking' | 'cycling' (driving por defecto)
 * @returns Ruta con geometría, distancia y duración
 *
 * @example
 * const route = await osrm.getRoute([[8.7371, 3.7504], [9.8, 1.8]]);
 * // route.distanceKm → 280.5
 * // route.coordinates → [[8.7371, 3.7504], ...ruta..., [9.8, 1.8]]
 */
async function getRoute(
  waypoints: [number, number][],
  profile: 'driving' | 'walking' | 'cycling' = 'driving',
  opts?: { alternatives?: boolean; steps?: boolean },
): Promise<OsrmRouteResult> {
  const coords = waypoints.map(([lon, lat]) => `${lon},${lat}`).join(';');
  const params = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    annotations: 'true',
  });
  if (opts?.alternatives) params.set('alternatives', 'true');
  if (opts?.steps) params.set('steps', 'true');

  const url = `${OSRM_BASE.replace('/route/v1', '')}/route/v1/${profile}/${coords}?${params}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`OSRM route error: HTTP ${res.status}`);
    }
    const data = await res.json();
  if (data.code !== 'Ok') {
    throw new Error(`OSRM route failed: ${data.message ?? data.code}`);
  }

  const routes: OsrmRoute[] = data.routes.map((r: any) => ({
    coordinates: r.geometry.coordinates as [number, number][],
    distance: r.distance,
    duration: r.duration,
    distanceKm: r.distance / 1000,
    durationMin: r.duration / 60,
  }));

  const legs = (data.routes[0]?.legs ?? []).map((leg: any) => ({
    distance: leg.distance,
    duration: leg.duration,
    steps: (leg.steps ?? []).map((s: any) => ({
      distance: s.distance,
      duration: s.duration,
      geometry: s.geometry,
      name: s.name,
      maneuver: s.maneuver,
    })),
  }));

    return { routes, legs };
  } catch (err) {
    console.warn('OSRM no disponible, usando distancia recta:', err);
    return straightLineRoute(waypoints);
  }
}

/**
 * Matriz de distancias — para buscar taxis/restaurantes cercanos.
 *
 * @param sources Coordenadas de origen [lon, lat][]
 * @param destinations Coordenadas de destino [lon, lat][]
 * @returns Matriz de distancias y duraciones
 *
 * @example
 * // Buscar taxis más cercanos al usuario
 * const { distances } = await osrm.getTable(
 *   [[userLon, userLat]],  // 1 origen
 *   taxis.map(t => [t.lon, t.lat])  // N destinos
 * );
 * // distances[0][i] = distancia en metros del usuario al taxi i
 */
async function getTable(
  sources: [number, number][],
  destinations: [number, number][],
  profile: 'driving' | 'walking' | 'cycling' = 'driving',
): Promise<OsrmTableResult> {
  const all = [...sources, ...destinations];
  const coords = all.map(([lon, lat]) => `${lon},${lat}`).join(';');
  const srcIdx = sources.map((_, i) => i).join(';');
  const dstIdx = destinations.map((_, i) => i + sources.length).join(';');

  const params = new URLSearchParams({
    sources: srcIdx,
    destinations: dstIdx,
    annotations: 'distance,duration',
  });

  const url = `${OSRM_BASE.replace('/route/v1', '')}/table/v1/${profile}/${coords}?${params}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`OSRM table error: HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.code !== 'Ok') {
      throw new Error(`OSRM table failed: ${data.message ?? data.code}`);
    }

    return {
      distances: data.distances as number[][],
      durations: data.durations as number[][],
    };
  } catch (err) {
    console.warn('OSRM table no disponible, usando distancia recta:', err);
    const distances = sources.map((src) =>
      destinations.map((dst) => haversineM(src, dst)),
    );
    const durations = distances.map((row) =>
      row.map((d) => (d / 1000 / 30) * 3600),
    );
    return { distances, durations };
  }
}

/**
 * Snap a la carretera más cercana — para corregir GPS imperfecto.
 *
 * @param lon Longitud WGS84
 * @param lat Latitud WGS84
 * @returns Coordenada [lon, lat] snapped a la carretera más cercana
 */
async function getNearest(
  lon: number,
  lat: number,
  profile: 'driving' | 'walking' | 'cycling' = 'driving',
): Promise<[number, number]> {
  const url = `${OSRM_BASE.replace('/route/v1', '')}/nearest/v1/${profile}/${lon},${lat}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`OSRM nearest error: HTTP ${res.status}`);
    }
    const data = await res.json();
    if (data.code !== 'Ok') {
      throw new Error(`OSRM nearest failed: ${data.message ?? data.code}`);
    }
    return data.waypoints[0].location as [number, number];
  } catch (err) {
    console.warn('OSRM nearest no disponible, devolviendo coordenada original:', err);
    return [lon, lat];
  }
}

export const osrm = {
  getRoute,
  getTable,
  getNearest,
};
