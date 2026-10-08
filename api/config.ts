/**
 * Config de API y servicios compartida.
 * Backend en Tencent CloudBase (Web Function egrouteplan-api, ap-singapore).
 * No hay claves de terceros ni APIs externas.
 */

// --- Host del backend NestJS (CloudBase, Singapur) ---
// Dominio propio atado a la Web Function vía HTTP gateway (ruta /api).
// DNS en ALIYUN: CNAME api → api.egrouteplan.com.tcbaccess-sg.tencentcloudbase.com
// Cert TrustAsia DV bPwiXAN5 (vence 2027-01-06, renovación manual).
export const API_HOST = 'https://api.egrouteplan.com';

// ⚠️ Mapas siguen en el espejo HK (Alibaba 8.218.88.237): mbtiles-server + OSRM
// NO están migrados a CloudBase. No apuntar API_HOST aquí.
export const MAPS_HOST = 'https://hk.egrouteplan.com';

// --- Backend NestJS (wallet + mobility auth + KYC + lifebook) ---
// En CloudBase el prefijo global del Nest es 'api' (antes Vercel servía
// /wallet/api/* con rewrite; aquí NO hay /wallet).
export const API_BASE = `${API_HOST}/api/v1`;

// --- Mapa auto-hospedado (Protomaps PMTiles + OSRM) ---
// Los tiles se sirven via nginx reverse proxy en https://hk.egrouteplan.com/maps/
export const MAP_TILES_BASE = `${MAPS_HOST}/maps/tiles`;
export const MAP_STYLE_LIGHT = `${MAPS_HOST}/maps/style-light.json`;
export const MAP_STYLE_DARK = `${MAPS_HOST}/maps/style-dark.json`;

// OSRM: motor de rutas auto-hospedado (espejo HK :5000 vía /routing/)
export const OSRM_BASE = `${MAPS_HOST}/routing/route/v1`;

/**
 * Resuelve una URL de imagen que el backend devuelve como ruta INTERNA:
 * React Native necesita una URL completa para <Image>.
 * - URLs ya absolutas (https:// o data:) pasan intactas; captured:// (marcador
 *   de prueba sin foto real) se devuelve tal cual (el llamador decide no pintarla).
 * - Rutas legacy "/wallet/api/v1/…" (respuesta de servidores antiguos o filas
 *   viejas de la BD) se reescriben al host/prefijo nuevos: /api/v1/…
 */
export function absUrl(p?: string | null): string {
  if (!p) return '';
  if (p.startsWith('http') || p.startsWith('data:') || p.startsWith('captured://')) return p;
  const ruta = p.startsWith('/') ? p : `/${p}`;
  const normalizada = ruta.startsWith('/wallet/api/') ? ruta.replace('/wallet/api/', '/api/') : ruta;
  return `${API_HOST}${normalizada}`;
}

// --- Centro por defecto: Malabo (Isla de Bioko) ---
// WGS84 — sin transformación GCJ-02 (GPS nativo del dispositivo)
export const DEFAULT_CENTER = {
  longitude: 8.7371,   // Malabo
  latitude: 3.7504,
  zoom: 12,
} as const;
