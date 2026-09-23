/**
 * HomeScreen — EG Route Plan.
 * Composición: MapBackground (100%) + LocationBadge + MapTools +
 * BottomSheet deslizable (SearchHeader / ServiceGrid / PromoCarousel) +
 * FloatingFooter + LocationModal + EmergencyModal.
 *
 * Auditoría bottom-sheet v5 (2026-09-02):
 *  · collapse() (no snapToIndex, deprecado/inestable) + Keyboard.dismiss.
 *  · enableDynamicSizing={false} (snap points fijos en %) y
 *    enablePanDownToClose={false}: el sheet NUNCA se cierra del todo (el mapa
 *    queda siempre visible arriba). Por eso tampoco hay backdrop de
 *    tap-to-close: cerrar el sheet dejaría el footer sin recuperación y
 *    atenuaría el mapa en el estado colapsado (trampa de UX, no aplica aquí).
 *  · keyboardBehavior="interactive" + blur restore (el teclado no tapa).
 *  · paddingBottom con safe-area inferior real (insets), no constante mágica.
 *  · COLLAPSED derivado del snap point ('36%') para no desincronizar footer.
 *  · La búsqueda aterriza en un SERVICIO real si el texto lo nombra (comida,
 *    mercado, taxi, alquiler…); si no, va a Llamar Taxi. Nunca a un stub.
 *  · Tarjeta de tarifa con la ciudad elegida (no "Malabo" fijo).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, StyleSheet, View, useWindowDimensions } from 'react-native';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useTheme } from '../theme/ThemeContext';
import MapBackground from '../components/MapBackground';
import { EgMarkers, EgCamera, type EgMapViewHandle } from '../packages/map';
import SocialHomeHeader, { homeBannerHeight } from '../components/SocialHomeHeader';
import LocationModal from '../components/LocationModal';
import MapTools from '../components/MapTools';
import SearchHeader from '../components/SearchHeader';
import ServiceGrid from '../components/ServiceGrid';
import PromoCarousel from '../components/PromoCarousel';
import FareQuoteCard from '../components/FareQuoteCard';
import FloatingFooter, { DOCK_BODY_H, type FooterTab } from '../components/FloatingFooter';
import EmergencyModal from '../components/EmergencyModal';
import { CITIES, SERVICES, type City } from '../constants/data';
import { CITY_CENTERS, CITY_ZOOM, MALABO_CENTER } from '../constants/geo';
import { takeGeoPick } from '../state/geoPick';
import { getCurrentGqPosition, nearestCityName as nearestCityOf } from '../api/locate';
import { reverseGeocode, pickReverseLabel } from '../api/geocode';
import { ir as irSeguro } from '../constants/rutas';
import { elevation } from '@egrouteplan/ui-kit';

// Única fuente de verdad de los snap points.
const SNAP = ['36%', '64%', '92%'] as const;
/** El dock inferior ocupa su franja: la BottomSheet se apoya encima (no se solapan). */
const dockBottomInset = (insetsBottom: number) => DOCK_BODY_H + insetsBottom + 6;


export default function HomeScreen() {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const mapRef = useRef<EgMapViewHandle>(null);
  const sheetRef = useRef<BottomSheet>(null);

  const snapPoints = useMemo(() => [...SNAP], []);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [city, setCity] = useState<City>(CITIES[0]); // Malabo por defecto
  const [locationOpen, setLocationOpen] = useState(false);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [tab, setTab] = useState<FooterTab>('inicio');
  // Punto seleccionado en el mapa (pin naranja): lo pones al tocar el mapa o
  // al elegir ciudad; la cámara vuela a él.
  const [picked, setPicked] = useState<[number, number] | null>(null);
  // ORIGEN real (ubicación de partida) por ciudad: dirección conocida dentro
  // de la ciudad, no el nombre genérico de la ciudad (estilo DiDi: el origen
  // se refleja con su PIN en el mapa).
  const originFor = useCallback((c: City): { coord: [number, number]; label: string } => {
    if (c.id === 'malabo') return { coord: [8.7761, 3.7542], label: 'Av. de la Independencia, Malabo' };
    if (c.id === 'bata') return { coord: [9.7652, 1.8625], label: 'Av. de las Naciones Unidas, Bata' };
    const coord = CITY_CENTERS[c.id] ?? MALABO_CENTER;
    return { coord, label: `Centro de ${c.name}` };
  }, []);
  const [origin, setOrigin] = useState<{ coord: [number, number]; label: string }>(() => originFor(CITIES[0]));

  const flyTo = useCallback((coord: [number, number], zoom: number, ms = 600) => {
    setPicked(coord);
    mapRef.current?.setCamera({ centerCoordinate: coord, zoomLevel: zoom, durationMs: ms });
  }, []);

  /** Tocar un punto del mapa = elegir DESTINO y pedir taxi (DiDi): marca el
   *  punto, resuelve su nombre real y entra en /taxi con ese destino, donde
   *  se dibuja la ruta desde la ubicación actual de la tarjeta. */
  const handleMapPress = useCallback(async (coord: [number, number]) => {
    flyTo(coord, 15, 350);
    let label = 'Destino en el mapa';
    try {
      const res = await reverseGeocode(coord[0], coord[1]);
      const n = pickReverseLabel(res);
      if (n) label = n;
    } catch { /* seguimos con la etiqueta genérica */ }
    router.push({
      pathname: '/taxi',
      params: {
        city: city.name,
        dLat: coord[1].toFixed(6),
        dLng: coord[0].toFixed(6),
        dLabel: label,
      },
    } as never);
  }, [flyTo, router, city]);

  /** Elegir ciudad en el modal → origen = dirección real + cámara vuela. */
  const selectCity = useCallback((c: City) => {
    setCity(c);
    const o = originFor(c);
    setOrigin(o);
    setPicked(null);
    mapRef.current?.setCamera({ centerCoordinate: o.coord, zoomLevel: 14, durationMs: 500 });
  }, [originFor]);

  /** Ubicarme ahora: GPS real fresco si el dispositivo está en GQ; si no
   *  (sin permiso o fuera del país), vuelve al origen de la ciudad activa. */
  const recenter = useCallback(async () => {
    setPicked(null);
    const gps = await getCurrentGqPosition();
    if (!gps) {
      mapRef.current?.setCamera({ centerCoordinate: origin.coord, zoomLevel: 14, durationMs: 500 });
      return;
    }
    let label = '';
    try {
      const res = await reverseGeocode(gps[0], gps[1]);
      label = pickReverseLabel(res) ?? '';
    } catch { /* sin nombre: usamos ciudad */ }
    const cn = nearestCityOf(gps);
    const cityMatch = CITIES.find((x) => x.name === cn);
    setOrigin({ coord: gps, label: label || `Mi ubicación · ${cn || city?.name || 'Malabo'}` });
    if (cityMatch) setCity(cityMatch);
    // Punto EXACTO en el que estás ahora, no la dirección por defecto.
    mapRef.current?.setCamera({ centerCoordinate: gps, zoomLevel: 16, durationMs: 400 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin]);

  // La cámara inicial la fija MapBackground vía `initialCamera` (origen real de
  // Malabo en el primer arranque): evita el race montaje ↔ WebView aún no
  // ready, que hacía abrir la Home en la vista isla en arranque en frío.

  // Al volver del buscador con un ORIGEN nuevo (modo=origen), aplicarlo como
  // punto de partida real (comportamiento DiDi: eliges dirección y vuelves).
  useFocusEffect(
    useCallback(() => {
      const gp = takeGeoPick();
      if (!gp || gp.mode !== 'origen' || !gp.coord) return;
      if (gp.coord[0] === 0 && gp.coord[1] === 0) return; // elección de ciudad, sin coordenada
      const label = gp.label && gp.label.trim() ? gp.label.trim() : 'Mi ubicación';
      setOrigin({ coord: [gp.coord[0], gp.coord[1]], label });
      setPicked(null);
      mapRef.current?.setCamera({ centerCoordinate: [gp.coord[0], gp.coord[1]], zoomLevel: 15, durationMs: 500 });
    }, []),
  );

  const handleNavigate = useCallback(
    (next: FooterTab) => {
      setTab(next);
      // Lazy Auth: Monedero y Perfil navegan directamente; el AuthGate de
      // cada pantalla muestra el Glass Pane + modal lazy si hace falta.
      if (next === 'lifebook') irSeguro.libre('/lifebook');
      if (next === 'mensajes') irSeguro.libre('/lifebook-messages');
      if (next === 'taxi') router.push({ pathname: '/taxi', params: { city: city.name } } as any);
      if (next === 'monedero') router.push('/monedero' as any);
      if (next === 'perfil') router.push('/profile' as any);
      if (next === 'inicio') {
        // v5: collapse() (snapToIndex está deprecado/inestable).
        sheetRef.current?.collapse();
        Keyboard.dismiss();
      }
    },
    [router, city],
  );

  const handleSheetChange = useCallback((index: number) => {
    setSheetIndex(index);
    if (index === 0) Keyboard.dismiss(); // teclado no tapa el mapa al colapsar
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* 1. Mapa a pantalla completa; pin origen = pill DiDi con la dirección real.
          Abre centrado en el origen real (no en la vista isla). */}
      <MapBackground
        ref={mapRef}
        onMapPress={handleMapPress}
        pin={picked}
        initialCamera={{ centerCoordinate: origin.coord, zoomLevel: 14 }}
      >
        <EgCamera centerCoordinate={origin.coord} zoomLevel={14} animationMode="moveTo" />
        <EgMarkers
          markers={[
            { id: 'origin', coordinate: origin.coord, kind: 'origin' as const, label: origin.label },
          ]}
        />
      </MapBackground>

      {/* 2. Cabecera: capa perfil SIEMPRE + capa publicidad superpuesta */}
      <SocialHomeHeader cityName={city.name} onPressCity={() => setLocationOpen(true)} />
      {/* Botones flotantes (Emergencia · Ubicarme · Escanear) SIEMPRE bajo el banner */}
      <MapTools
        onRecenter={recenter}
        recenterLabel="Ubicarme ahora"
        topOffset={homeBannerHeight(winH) + 8}
        onEmergency={() => setEmergencyOpen(true)}
      />

      {/* 3. Panel deslizable (se apoya sobre el dock; el mapa queda visible).
          Fondo GLASS (BlurView) para que el mapa se vea a través. */}
      <BottomSheet
        ref={sheetRef}
        index={0}
        snapPoints={snapPoints}
        bottomInset={dockBottomInset(insets.bottom)}
        onChange={handleSheetChange}
        backgroundComponent={SheetGlassBackground}
        handleIndicatorStyle={{ backgroundColor: isDark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.18)', width: 44 }}
        style={styles.sheet}
        enableDynamicSizing={false}
        enablePanDownToClose={false}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
      >
        <BottomSheetScrollView
          contentContainerStyle={[styles.sheetContent, { paddingBottom: 24 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <SearchHeader
            city={origin.label}
            cityName={city.name}
            onPressCity={() => irSeguro.libre('/buscar', { city: city.name, mode: 'origen' })}
            glass
          />
          <ServiceGrid onEmergencyPress={() => setEmergencyOpen(true)} glass />
          <FareQuoteCard distanceKm={3.5} city={city.name} />
          <PromoCarousel />
        </BottomSheetScrollView>
      </BottomSheet>

      {/* 4. Dock de navegación inferior SIEMPRE visible (mapa + hoja por encima) */}
      <FloatingFooter
        active={tab}
        onNavigate={handleNavigate}
        onEmergency={() => setEmergencyOpen(true)}
        showUnreadBadge
      />

      {/* 5. Modales */}
      <LocationModal
        visible={locationOpen}
        currentCityId={city.id}
        onClose={() => setLocationOpen(false)}
        onSelect={selectCity}
      />
      <EmergencyModal visible={emergencyOpen} onClose={() => setEmergencyOpen(false)} />
    </View>
  );
}

/** Fondo de la BottomSheet con cristal esmerilado (BlurView) para que el mapa
 *  se vea a través. @gorhom/bottom-sheet pasa `style` con posición/altura. */
function SheetGlassBackground({ style }: { style?: any }) {
  const { isDark } = useTheme();
  return (
    <View style={[{ flex: 1, borderRadius: 20, overflow: 'hidden' }, style]}>
      <BlurView
        style={StyleSheet.absoluteFill}
        intensity={36}
        tint={isDark ? 'dark' : 'light'}
      />
      {/* Tinte suave de marca para legibilidad */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: isDark ? 'rgba(23,23,26,0.35)' : 'rgba(255,255,255,0.30)' },
        ]}
        pointerEvents="none"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  sheet: {
    ...elevation.lg,
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 6,
  },
});


