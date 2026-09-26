/**
 * MapBackground — contenedor de mapa reutilizable.
 *
 * Desde 2026-09-03 el mapa es MapLibre GL JS en WebView (packages/map), que
 * funciona en Expo Go Y en el APK release (tiles/style self-hosted en
 * egrouteplan.com/maps). Por eso aquí SIEMPRE se renderiza el EgMapView
 * (WebView) — ya no existe rama "placeholder requiere build de desarrollo".
 *
 * Coordenadas [lon, lat] (GeoJSON). Tiles propios en /maps/tiles.
 *
 * v4 (rediseño DiDi 2026-09-04):
 *  · Se elimina el gateo por hasNativeMapLibre(): el módulo nativo ya no existe
 *    y el WebView es el mapa real también en release.
 *  · Acepta `style` (tamaño/posición controlados por el padre) y `children`
 *    (marcadores, polylines…) que se renderizan DENTRO del EgMapView.
 *  · onMapPress → toque con coordenadas; pin → marcador naranja extra.
 *  · `initialCamera` → cámara con la que ABRE la pantalla (p. ej. la dirección
 *    real de la ciudad). Sin ella se usa ISLAND_CENTER (vista país/isla).
 *  · Carga: overlay hasta onMapLoaded; timeout 12 s → error con Reintentar
 *    (remount vía key).
 */

import React, { forwardRef, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { MapPin, RefreshCw } from 'lucide-react-native';
import {
  EgMapView, EgCamera, EgUserLocation, EgMarkers,
  type EgMapViewHandle, type Coord,
} from '../packages/map';
import { useTheme } from '../theme/ThemeContext';
import { ISLAND_CENTER, ISLAND_ZOOM } from '../constants/geo';
import {brand, espaciado, neutro, peso, radios, tipografia} from '@egrouteplan/ui-kit';

const LOAD_TIMEOUT_MS = 12000;

export interface MapPressMeta {
  drag?: boolean;
  kind?: string;
}

interface MapBackgroundProps {
  /** Contenido extra dentro del mapa (EgMarkers, EgRoutePolyline…). */
  children?: ReactNode;
  /** Tamaño/posición del contenedor (por defecto flex:1). */
  style?: StyleProp<ViewStyle>;
  /** Toque en el mapa (o fin de arrastre de un pin → meta.drag/kind). */
  onMapPress?: (coord: Coord, meta?: MapPressMeta) => void;
  /** Zona sensible detectada cerca del coche (conductor): escuela/hospital… */
  onHazard?: (h: { kind: string; name: string; distM: number }) => void;
  pin?: Coord | null;
  /** Cámara inicial con la que abrir el mapa ([lon,lat] + zoom). */
  initialCamera?: { centerCoordinate: Coord; zoomLevel?: number };
}

const MapBackground = forwardRef<EgMapViewHandle, MapBackgroundProps>(function MapBackground(
  { children, style, onMapPress, onHazard, pin, initialCamera },
  ref,
) {
  const { colors, isDark } = useTheme();
  const [ready, setReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  };

  useEffect(() => {
    setReady(false);
    setTimedOut(false);
    clearTimer();
    timeoutRef.current = setTimeout(() => setTimedOut(true), LOAD_TIMEOUT_MS);
    return clearTimer;
  }, [attempt]);

  const handleLoaded = useCallback(() => {
    clearTimer();
    setReady(true);
    setTimedOut(false);
  }, []);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  return (
    <View style={[styles.fill, style]} testID="map-background">
      {/* Mapa WebView + overlays de carga/error */}
      <EgMapView
        key={attempt}
        ref={ref}
        style={StyleSheet.absoluteFill}
        rotateEnabled={false}
        pitchEnabled={false}
        compassEnabled={false}
        attributionEnabled
        onMapLoaded={handleLoaded}
        onPress={onMapPress}
        onHazard={onHazard}
      >
        <EgCamera
          centerCoordinate={initialCamera?.centerCoordinate ?? ISLAND_CENTER}
          zoomLevel={initialCamera?.zoomLevel ?? ISLAND_ZOOM}
          animationMode="moveTo"
        />
        <EgUserLocation visible />
        {pin ? <EgMarkers id="map-pin" markers={[{ id: 'map-pin', coordinate: pin, kind: 'destination' }]} /> : null}
        {children}
      </EgMapView>

      {!ready && !timedOut && (
        <View style={[styles.overlay, { backgroundColor: isDark ? colors.shadow : neutro.n200 }]} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.text.primary} />
          <Text style={{ marginTop: espaciado.e12, color: colors.textSecondary, fontSize: tipografia.body }}>Cargando mapa…</Text>
        </View>
      )}

      {timedOut && (
        <View style={[styles.overlay, { backgroundColor: isDark ? colors.shadow : neutro.n200 }]}>
          <MapPin size={26} color={colors.text.danger} />
          <Text style={[styles.errTitle, { color: colors.textPrimary }]}>No se pudo cargar el mapa</Text>
          <Text style={[styles.errHint, { color: colors.textSecondary }]}>
            Comprueba tu conexión o que el servidor de mapas esté disponible.
          </Text>
          <Pressable
            onPress={retry}
            accessibilityRole="button"
            accessibilityLabel="Reintentar cargar el mapa"
            style={({ pressed }) => [styles.retryBtn, { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <RefreshCw size={16} color={brand.white} />
            <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body, marginLeft: espaciado.e6 }}>Reintentar</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
});

export default MapBackground;

const styles = StyleSheet.create({
  fill: { flex: 1, overflow: 'hidden' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  errTitle: { fontSize: tipografia.title, fontWeight: peso.fuerte, letterSpacing: 0.3, textAlign: 'center' },
  errHint: { fontSize: tipografia.body, textAlign: 'center', lineHeight: 18, marginTop: espaciado.e4 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', marginTop: espaciado.e16, paddingHorizontal: espaciado.e18, paddingVertical: espaciado.e11, borderRadius: radios.md },
});
