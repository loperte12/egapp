/**
 * distancia — cuánto hay de un punto a otro, y cómo se escribe al lado de un alojamiento.
 *
 * POR QUÉ EXISTE ESTE FICHERO (27-sep-2026). La fórmula de Haversine **ya estaba escrita en el
 * proyecto**, pero dentro de `app/taxi.tsx` (`:343`), local y sin exportar. Al añadir la distancia
 * a los resultados del hotel, la salida cómoda era copiar las cinco líneas: eso deja dos versiones
 * del mismo cálculo donde una puede redondear distinto que la otra, y nadie sabe cuál es la buena.
 * Se escribe aquí **una vez**.
 *
 * DEUDA DECLARADA: `taxi.tsx` sigue con su copia local. Migrarla toca la pantalla del conductor
 * —que tiene su propia verificación— y se hará en su tanda, no de tapadillo dentro de la del hotel.
 *
 * La distancia es **en línea recta**, no por carretera: sirve para decir «está cerca», nunca para
 * navegar. Escribirlo importa: un «a 1,1 km» junto a un mapa se lee como ruta, y no lo es.
 */

/** [longitud, latitud] — la convención del proyecto (GeoJSON, igual que `api/locate.ts`). */
export type Coord = [number, number];

const RADIO_TIERRA_KM = 6371;
const A_RADIANES = Math.PI / 180;

/** Distancia en línea recta entre dos coordenadas, en kilómetros. */
export function havKm(a: Coord, b: Coord): number {
  const dLat = (b[1] - a[1]) * A_RADIANES;
  const dLon = (b[0] - a[0]) * A_RADIANES;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a[1] * A_RADIANES) * Math.cos(b[1] * A_RADIANES) * Math.sin(dLon / 2) ** 2;
  return 2 * RADIO_TIERRA_KM * Math.asin(Math.sqrt(s));
}

/**
 * Cómo se escribe la distancia: «a 850 m», «a 1,1 km», «a 12 km».
 *
 * Un decimal solo hasta 10 km, que es donde el dato cambia una decisión; a partir de ahí, entero
 * (nadie elige un hotel entre 12,3 y 12,4 km). Devuelve cadena vacía si el número no sirve —así
 * quien la use decide no pintar la fila en vez de pintar «a NaN km»—.
 */
export function etiquetaDistancia(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km < 1) return `a ${Math.round(km * 1000)} m`;
  if (km < 10) return `a ${km.toFixed(1).replace('.', ',')} km`;
  return `a ${Math.round(km)} km`;
}
