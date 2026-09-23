/**
 * Detección del mapa NATIVO (@maplibre/maplibre-react-native).
 *
 * Desde 2026-09-03 el paquete renderiza el mapa con MapLibre GL JS dentro de un
 * WebView (compatible con Expo Go). El módulo nativo solo existe en builds con
 * la librería compilada (development/production build); en Expo Go NO existe y
 * un import estático crashea la app.
 *
 * Modo nativo (opcional, futuro dev-build): forzar con forceNativeMap(true)
 * desde el código de arranque de un dev-build; mientras tanto hasNativeMapLibre
 * devuelve false y todo el flujo usa el WebView.
 */

let nativeForced = false;

/** Activar manualmente desde un dev-build para usar el módulo nativo real. */
export function forceNativeMap(enabled: boolean) {
  nativeForced = enabled;
}

export function hasNativeMapLibre(): boolean {
  return nativeForced;
}

export function loadMapLibre(): null {
  return null;
}
