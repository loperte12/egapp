/**
 * Paquete de mapas EG Route Plan — versión compatible con Expo Go.
 *
 * El mapa se renderiza con MapLibre GL JS dentro de un WebView (react-native-webview,
 * incluido en Expo Go) consumiendo tiles/style/glyphs self-hosted de egrouteplan.com.
 * NO usa @maplibre/maplibre-react-native (módulo nativo que crashea en Expo Go):
 * ese código queda reservado para un futuro development build (ver native.ts).
 *
 * Coordenadas: WGS84 [longitude, latitude].
 */

export { EgMapViewWeb as EgMapView, type EgMapViewHandle } from './mapWeb';
export { EgMapCamera as EgCamera, type EgCameraHandle } from './mapWeb';
export { EgMapMarkers as EgMarkers, EgMapUserLocation as EgUserLocation } from './mapWeb';
export { EgRoutePolyline } from './mapWeb';
export { MAP_STYLE_LIGHT, MAP_STYLE_DARK } from './styles';
export { loadMapLibre, hasNativeMapLibre, forceNativeMap } from './native';
export { MAP_COLORS, type Coord, type MapMarker, type MarkerKind, type RouteSegment, type CameraBounds } from './types';
