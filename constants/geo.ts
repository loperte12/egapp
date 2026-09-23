/**
 * MALABO_CENTER — Centro de Malabo en WGS84 [lon, lat] (convención GeoJSON).
 * MapLibre usa [longitude, latitude], NO {latitude, longitude} como
 * react-native-maps. Sin transformación GCJ-02 — GPS nativo del dispositivo.
 *
 * Bounding box aproximado de Guinea Ecuatorial (para descarga OSM):
 *   N=4.0, S=-1.7, W=5.4, E=11.4
 */
export const MALABO_CENTER: [number, number] = [8.7371, 3.7504];
export const MALABO_ZOOM = 12;

/** Vista que muestra la isla de Bioko completa con mar alrededor (zoom ~8). */
export const ISLAND_CENTER: [number, number] = [8.72, 3.5];
export const ISLAND_ZOOM = 8.2;

/** Vista que muestra todo el país (Bioko + Río Muni) con contexto. */
export const COUNTRY_CENTER: [number, number] = [9.35, 1.55];
export const COUNTRY_ZOOM = 7.6;

/** Centro de Bata (continental, Río Muni) */
export const BATA_CENTER: [number, number] = [9.7741, 1.8618];

/**
 * Centros por ciudad (WGS84 [lon, lat]) para CENTRAR LA CÁMARA al elegir
 * ciudad en la Home o al volar con un toque en el mapa.
 * Aproximaciones de localidad (o de la capital de provincia para localidades
 * menores) — valen para centrado/contexto, NO para navegación ni rutas.
 */
export const CITY_CENTERS: Record<string, [number, number]> = {
  // Bioko Norte
  malabo: [8.7371, 3.7504],
  rebola: [8.84, 3.72],
  baney: [8.94, 3.72],
  // Bioko Sur
  luba: [8.55, 3.46],
  riaba: [8.77, 3.37],
  // Annobón
  pale: [5.632, -1.406],
  // Litoral (Río Muni)
  bata: [9.7741, 1.8618],
  cogo: [9.69, 1.08],
  mbini: [9.70, 1.55],
  machinda: [9.95, 1.70],
  bitica: [9.62, 1.43],
  corisco: [9.33, 1.00],
  // Kié-Ntem
  ebebia: [11.335, 2.151],
  nsang: [10.94, 2.02],
  micomeseng: [10.62, 2.10],
  // Centro Sur
  evinayong: [10.57, 1.74],
  niefang: [10.25, 1.85],
  aconibe: [10.94, 1.30],
  acurenam: [10.65, 1.03],
  // Wele-Nzas
  mongomo: [11.317, 1.628],
  anisok: [10.77, 1.86],
  nsok: [11.27, 1.13],
  ayene: [10.70, 1.88],
  // Djibloho
  paz: [10.88, 1.58],
};

/** Zoom al volar a una ciudad seleccionada (contexto regional). */
export const CITY_ZOOM = 11;

/** Bounding box de Guinea Ecuatorial para consultas PostGIS */
export const GE_BBOX = {
  minLon: 5.4,
  minLat: -1.7,
  maxLon: 11.4,
  maxLat: 4.0,
} as const;
