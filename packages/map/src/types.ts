/**
 * Tipos compartidos del paquete de mapas.
 * MapLibre usa coordenadas [longitude, latitude] (convención GeoJSON).
 * react-native-maps usaba {latitude, longitude} — esto es un cambio clave
 * de la migración: todos los componentes usan [lon, lat] en WGS84.
 */

/** Coordenada WGS84 en formato GeoJSON: [longitude, latitude] */
export type Coord = [number, number];

export type MarkerKind = 'origin' | 'destination' | 'taxi' | 'driver' | 'user' | 'poi';

export interface MapMarker {
  id: string;
  coordinate: Coord;
  kind: MarkerKind;
  label?: string;
  /** Datos extra para mostrar en el callout (opcional) */
  subtitle?: string;
  /** Si true el pin se puede ARRASTRAR en el mapa (DiDi: ajustar punto y la
   *  ruta se recalcula). Por defecto false. */
  draggable?: boolean;
  /** Rumbo (grados, 0=norte) para marcadores con rotación propia, p. ej. el
   *  coche del conductor: la página dibuja la flecha con (rumbo − bearing del
   *  mapa) para que apunte siempre al frente en pantalla (estilo Amap). */
  heading?: number;
}

export interface RouteSegment {
  coordinates: Coord[];
  /** Color de la polyline (#0084FF para ruta principal) */
  color?: string;
  /** Grosor en px (6 por defecto, estilo DiDi) */
  width?: number;
}

export interface CameraBounds {
  ne: Coord;  // esquina noreste
  sw: Coord;  // esquina suroeste
  padding?: number;
}

/** Colores corporativos Eg Route Plan */
export const MAP_COLORS = {
  primary: '#0084FF',      // polyline ruta, pin origen, botones
  secondary: '#FF7D00',    // pin destino, taxis disponibles
  success: '#27AE60',      // conductor asignado
  danger: '#F53F3F',       // errores
  cardBg: '#F5F7FA',       // fondo tarjetas flotantes
  sheetBg: '#FFFFFF',      // fondo bottom-sheet
  textPrimary: '#1D2129',
  textSecondary: '#86909C',
} as const;
