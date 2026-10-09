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
  /** Color de la polyline (por defecto `MAP_COLORS.primary`) */
  color?: string;
  /** Grosor en px (6 por defecto, estilo DiDi) */
  width?: number;
}

export interface CameraBounds {
  ne: Coord;  // esquina noreste
  sw: Coord;  // esquina suroeste
  padding?: number;
}

/**
 * Colores del mapa — ESPEJO de los tokens de marca de `@egrouteplan/ui-kit`.
 *
 * ⚠️ DUPLICACIÓN DELIBERADA, y es deuda reconocida. El motivo:
 * `packages/map/package.json` NO declara ninguna dependencia — tampoco con
 * `@egrouteplan/ui-kit` — y este paquete lo consume además el mapa WEB
 * (`mapWeb.tsx`). Importar el barril de ui-kit aquí arrastraría componentes de
 * React Native al bundle del webview. Hasta que eso se resuelva, se copian.
 *
 * 🔴 CONSECUENCIA QUE HAY QUE SABER: el trinquete `npm run diseno` NO escanea
 * `packages/map`, así que si un token cambia, aquí NO se entera nadie y nada
 * falla. Este bloque es un punto ciego de la guardia. Antes era peor: llevaba
 * la paleta vieja completa —un azul que no era el de la marca, un naranja, un
 * verde y un rojo que ya no existían en el sistema de diseño—, así que la ruta
 * del taxi se dibujaba con el color equivocado y nada lo detectaba.
 * (Los valores retirados NO se escriben aquí a propósito: el trinquete cuenta
 * los literales que aparecen dentro de los comentarios.)
 *
 * REGLA: si tocas un color de marca, TOCA TAMBIÉN ESTE BLOQUE.
 * Corregido el 07-oct-2026 contra `packages/ui-kit/src/theme/colors.ts`.
 */
export const MAP_COLORS = {
  primary: '#0066CC',      // polyline ruta, pin origen, botones   ← brand.primary
  secondary: '#C2410C',    // pin destino, taxis disponibles       ← brand.secondary
  success: '#1E7A45',      // conductor asignado                   ← brand.success
  danger: '#C62828',       // errores                              ← brand.danger
  cardBg: '#F5F7FA',       // fondo tarjetas flotantes             ← lightColors.surface
  sheetBg: '#FFFFFF',      // fondo bottom-sheet                   ← lightColors.sheet
  textPrimary: '#1D2129',  //                                      ← lightColors.textPrimary
  textSecondary: '#6B7280',//                                      ← lightColors.textSecondary
} as const;
