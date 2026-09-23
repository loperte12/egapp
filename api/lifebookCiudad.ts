/**
 * LA CIUDAD (同城) — feed por distancia.
 *
 * Lo que resuelve: el feed de la sección Ciudad puede pedir «lo que tengo cerca» (附近), «a un
 * paseo» (3 km) o **toda la ciudad** (全城), y cada tarjeta dice a qué distancia está y cuál es su
 * **sitio exacto** (POI).
 *
 * Vive en su propio fichero, como los demás módulos de estas tandas, para no tocar
 * `api/lifebook.ts` (que el dueño pidió no tocar). Se reutilizan sus TIPOS y su `toPostCard`, que
 * es lo que hace que la tarjeta siga siendo la misma de siempre.
 *
 * Servidor (tanda I): `channel=nearby` acepta `lat`, `lng`, `radiusKm`, `sort` y `since`; las notas
 * SIN sitio quedan fuera cuando se pide un radio (no se promete una distancia que no se sabe).
 */
import { http } from './httpClient';
import { toPostCard, type LbFeedPage, type LbPostBase, type LbPostCard } from './lifebook';

/** Los tres chips de distancia de la especificación. `radiusKm: null` = 全城 (toda la ciudad). */
export const LB_DISTANCIAS: { id: 'cerca' | '3km' | 'ciudad'; label: string; radiusKm: number | null; hint: string }[] = [
  { id: 'cerca', label: 'Cerca', radiusKm: 1, hint: 'Lo que puedes ir andando desde donde estás' },
  { id: '3km', label: '3 km', radiusKm: 3, hint: 'Tu barrio: lo que se hace en bici o en 10 minutos' },
  { id: 'ciudad', label: 'Toda la ciudad', radiusKm: null, hint: 'Todo lo de tu ciudad, sin filtro de distancia' },
];

/** Un post del feed con lo que añade la tanda I. */
export type LbPostConSitio = LbPostBase & {
  /** El lugar exacto de la nota («Cafetería X»). `null` si la nota no tiene sitio. */
  placeName?: string | null;
  /** A qué distancia está de mí, en km (redondeado a 100 m). `null` si no se pidió con posición. */
  distanceKm?: number | null;
};

export interface LbFeedCiudadOpts {
  city?: string; type?: string; cursor?: string; limit?: number;
  /** Mi posición (para calcular la distancia). Sin ella, no hay distancia que enseñar. */
  lat?: number | null; lng?: number | null;
  /** El radio: 1 (附近), 3, o `null` para TODA la ciudad. */
  radiusKm?: number | null;
  /** `distance` (más cerca primero) · `hot` (más popular) · por defecto, lo más nuevo. */
  sort?: 'distance' | 'hot' | null;
  /** `1h` · `24h` · `7d` · `30d`. */
  since?: string | null;
}

export const ciudadApi = {
  /**
   * El feed de la ciudad. Es la MISMA ruta que `lifebookApi.feed`, con los parámetros nuevos.
   * `radiusKm` solo se manda si hay posición: un radio sin posición no significa nada.
   */
  feed: (channel: string, o: LbFeedCiudadOpts = {}) => {
    const conRadio = o.radiusKm !== null && o.radiusKm !== undefined && o.lat !== null && o.lat !== undefined && o.lng !== null && o.lng !== undefined;
    const qs = [
      `channel=${encodeURIComponent(channel)}`,
      o.city ? `city=${encodeURIComponent(o.city)}` : '',
      o.type ? `type=${encodeURIComponent(o.type)}` : '',
      o.cursor ? `cursor=${encodeURIComponent(o.cursor)}` : '',
      o.limit ? `limit=${o.limit}` : '',
      o.lat !== null && o.lat !== undefined ? `lat=${o.lat}` : '',
      o.lng !== null && o.lng !== undefined ? `lng=${o.lng}` : '',
      conRadio ? `radiusKm=${o.radiusKm}` : '',
      o.sort ? `sort=${o.sort}` : '',
      o.since ? `since=${o.since}` : '',
    ].filter(Boolean).join('&');
    return http.get<LbFeedPage>(`/lifebook/posts/feed?${qs}`);
  },
};

/** «400 m» · «3,2 km» · «15 km»: legible y sin decimales de más. */
export function etiquetaKm(km: number): string {
  if (!Number.isFinite(km) || km < 0) return '';
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 50) * 50)} m`;
  if (km < 10) return `${km.toFixed(1).replace('.', ',')} km`;
  return `${Math.round(km)} km`;
}

/**
 * EL CENTRO DE CADA CIUDAD.
 *
 * La especificación lo dice: la distancia se mide desde **mi posición**… o **desde el centro de la
 * ciudad cuando he cambiado de ciudad a mano**. Sin esto, mirar Malabo desde otro sitio daría
 * «11.000 km» en cada tarjeta, que es verdad pero no sirve para nada: lo que quieres saber es a qué
 * distancia está de la ciudad que estás explorando.
 */
export const LB_CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  malabo: { lat: 3.7504, lng: 8.7371 },
  bata: { lat: 1.8639, lng: 9.7658 },
  ebebiyin: { lat: 2.1511, lng: 11.3353 },
  mongomo: { lat: 1.6267, lng: 11.3136 },
  luba: { lat: 3.4567, lng: 8.5550 },
};

/** El centro de la ciudad, si lo conocemos (se comparan sin acentos ni mayúsculas). */
export function centroDe(ciudad: string | null | undefined): { lat: number; lng: number } | null {
  const k = String(ciudad ?? '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return LB_CITY_CENTERS[k] ?? null;
}

/**
 * La tarjeta de siempre, pero con el SITIO de la nota y su distancia.
 *
 * Se reutiliza `toPostCard` (el mismo que usa el resto de la app) y solo se reemplaza la línea de
 * ubicación: «Cafetería X · 3,2 km» en vez de «Malabo · Ela Nguema». Así la tarjeta no cambia de
 * aspecto ni hay un segundo diseño que mantener.
 */
export function tarjetaConSitio(post: LbPostBase): LbPostCard {
  const card = toPostCard(post);
  const p = post as LbPostConSitio;
  const sitio = typeof p.placeName === 'string' && p.placeName.trim() ? p.placeName.trim() : null;
  const km = typeof p.distanceKm === 'number' && Number.isFinite(p.distanceKm) ? p.distanceKm : null;
  if (!sitio && km === null) return card;
  const partes = [sitio ?? card.locationLabel, km !== null ? etiquetaKm(km) : null].filter(Boolean);
  return { ...card, locationLabel: partes.join(' · ') };
}
