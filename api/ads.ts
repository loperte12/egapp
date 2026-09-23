/**
 * Cliente de publicidad del Home — GET /api/ads/ público + contadores + banner.
 * Los anuncios se gestionan desde el web-dashboard admin.
 * NOTA: este servicio vive bajo /api (sin /wallet/api/v1), como work.
 */

import { http } from './httpClient';
import { API_HOST } from './config';

export const ADS_API = `${API_HOST}/api`;
const a = (p: string) => `${ADS_API}${p}`;

export interface HomeAd {
  id: string;
  kind: string;
  serviceKey: string | null;
  targetRoute: string | null;
  title: string;
  subtitle: string | null;
  emoji: string | null;
  color: string;
  imageUrl: string | null;
  externalUrl?: string | null;
  cities?: string[];
  /** Descuento porcentual aplicable (p. ej. 20 = -20 % en taxi). */
  discountPct?: number;
  sort: number;
  active: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
  impressions: number;
  clicks: number;
}

export const adsApi = {
  /** Listado público (Home). Opcional: filtra por ciudad. */
  list: (city?: string) => http.get<HomeAd[]>(a(`/ads/${city ? `?city=${encodeURIComponent(city)}` : ''}`), false),

  /** Banner superior de la Home (un anuncio por ciudad/horario). */
  homeBanner: (city?: string) =>
    http.get<HomeAd | null>(a(`/ads/home-banner${city ? `?city=${encodeURIComponent(city)}` : ''}`), false),

  impression: (id: string) => http.post<{ ok: boolean }>(a(`/ads/${id}/impression`), {}, false),
  click: (id: string) => http.post<{ ok: boolean }>(a(`/ads/${id}/click`), {}, false),
};
