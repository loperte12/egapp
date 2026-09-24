// egrouteplan-app/app/taxi.tsx
/**
 * TaxiScreen — pedir taxi (DiDi-like) con modalidades, doble precio y MAPA.
 * Backend: /wallet/api/v1/mobility (modes + trips). Ruta OSRM real.
 *
 * Auditoría senior (2026-09-02, v3):
 *  · ORIGEN real: GPS (expo-location) con permiso → tu posición; denegado →
 *    ciudad de la Home (?city=) o Malabo, SIEMPRE con banner visible.
 *  · Destino: tocar el mapa (debounce + AbortController en la ruta OSRM);
 *    escribir dirección = guía hasta tocar el mapa (sin geocoder propio aún).
 *  · Errores visibles: ruta OSRM y modalidades con Reintentar; precio con
 *    error inline (500–9.999 XAF) además del bloqueo del botón.
 *  · Mapa = MapBackground (carga/error/Reintentar internos + fallback Expo Go)
 *    con marcadores y polyline DENTRO (hijos del EgMapView).
 *  · useTripLogic (polling + reset + cleanup) y AbortController limpian en
 *    unmount. SafeArea, a11y (back, radios), FlatList con getItemLayout.
 * Ruta: /taxi?city=Malabo
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, Image, KeyboardAvoidingView, Linking, Modal,
  Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import {
  ArrowLeft, ArrowUpDown, Bus, CarFront, MapPin, Navigation, Pencil, RefreshCw, Star, Tag, Users, User, X,
} from 'lucide-react-native';
import { elevation, espaciado, GhostButton, PrimaryButton, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';
import MapBackground from '../components/MapBackground';
import { EgMarkers, EgRoutePolyline, type Coord, type EgMapViewHandle } from '../packages/map';
import { taxiApi, type TaxiMode } from '../api/taxi';
import { adsApi } from '../api/ads';
import { reverseGeocode, pickReverseLabel } from '../api/geocode';
import { getCurrentGqPosition } from '../api/locate';
import { isNightGq } from '../api/nightMode';
import { useDriverLiveTrack } from '../components/DriverLiveMap';
import { useSession } from '../state/session';
import { takeGeoPick } from '../state/geoPick';
import { CITIES } from '../constants/data';
import { CITY_CENTERS } from '../constants/geo';
import { settlementApi, SettlementView, tokenDeViaje, fijarPin } from '../api/settlement';

import { OSRM_BASE, absUrl } from '../api/config';
import { brand } from '@egrouteplan/ui-kit';

const OSRM = OSRM_BASE;

/** alpha local (misma impl que constants/colors) para tintes de fila. */
function alphaC(hex: string, opacity: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

/** PIN de confirmación: últimos 4 dígitos del teléfono del pasajero. */
function pinLast4(p?: string | null): string {
  const d = (p || '').replace(/\D/g, '');
  return d.length >= 4 ? d.slice(-4) : d.padStart(4, '0');
}

const MODE_ICON: Record<string, React.ReactNode> = {
  recomendado: <Star size={22} color={brand.primary} />,
  compartido: <Users size={22} color={brand.secondary} />,
  no_compartido: <User size={22} color={brand.success} />,
  especial: <Tag size={22} color={brand.primary} />,
  minibus: <Bus size={22} color={brand.secondary} />,
};

const STATUS_UI: Record<string, { t: string; c: string }> = {
  requested: { t: 'Buscando conductor…', c: brand.secondary },
  accepted: { t: 'Conductor en camino', c: brand.success },
  cancelled: { t: 'Viaje cancelado', c: brand.danger },
  completed: { t: 'Viaje finalizado', c: brand.success },
};

/** Motivos de rechazo/cancelación del viaje (DiDi). */
const REJECT_REASONS = [
  'Tarda demasiado en llegar',
  'El precio no me convence',
  'El coche no coincide',
  'Cambié de planes',
  'Otro motivo',
];

/** Ciudad (por nombre) más cercana a unas coordenadas, para etiquetas/tarifas. */
function nearestCityName(coord: Coord): string {
  let best = '';
  let bestD = Infinity;
  for (const [id, c] of Object.entries(CITY_CENTERS)) {
    const d = (c[0] - coord[0]) ** 2 + (c[1] - coord[1]) ** 2;
    if (d < bestD) { bestD = d; best = id; }
  }
  return CITIES.find((c) => c.id === best)?.name ?? '';
}

/** Debounce de invocación: devuelve una función que solo se ejecuta tras `delay` ms de silencio. */
function useDebouncedCall<A extends unknown[]>(fn: (...args: A) => void, delay: number): (...args: A) => void {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return useCallback((...args: A) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => fnRef.current(...args), delay);
  }, [delay]);
}

/** Lógica del viaje: estado, polling (3 s) y reset con cleanup en unmount. */
function useTripLogic() {
  const [status, setStatus] = useState<'idle' | 'requested' | 'accepted' | 'cancelled' | 'completed'>('idle');
  const [tripId, setTripId] = useState<string | null>(null);
  const [trip, setTrip] = useState<Record<string, any> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  const resetTrip = useCallback(() => {
    stopPolling();
    setStatus('idle'); setTripId(null); setTrip(null); setError(null);
  }, [stopPolling]);

  const startPolling = useCallback((id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const t = await taxiApi.getTrip(id);
        setTrip(t);
        if (t.status === 'accepted' || t.status === 'cancelled') {
          setStatus(t.status);
          stopPolling();
        }
      } catch { /* reintenta en el siguiente tick */ }
    }, 3000);
  }, [stopPolling]);

  useEffect(() => stopPolling, [stopPolling]);

  return { status, setStatus, tripId, setTripId, trip, setTrip, error, setError, busy, setBusy, resetTrip, startPolling };
}

/** Radar "Buscando taxi" (DiDi): 3 anillos que se expanden + icono de coche.
 *  Animated nativo (sin Lottie, decisión 2026-09-08). */
function SearchRadar({ color }: { color: string }) {
  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  const a3 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = (a: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(a, { toValue: 1, duration: 1900, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(a, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]));
    loop(a1, 0).start();
    loop(a2, 630).start();
    loop(a3, 1260).start();
    return () => { a1.stopAnimation(); a2.stopAnimation(); a3.stopAnimation(); };
  }, [a1, a2, a3]);
  const ring = (a: Animated.Value) => ({
    opacity: a.interpolate({ inputRange: [0, 0.85, 1], outputRange: [0.5, 0.06, 0] }),
    transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.55, 2.6] }) }],
  });
  return (
    <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center' }}>
      {[a1, a2, a3].map((a, i) => (
        <Animated.View
          key={i}
          pointerEvents="none"
          style={[{ position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 2, borderColor: color }, ring(a)]}
        />
      ))}
      <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: color, alignItems: 'center', justifyContent: 'center', elevation: 6 }}>
        <CarFront size={28} color={brand.white} />
      </View>
    </View>
  );
}

export default function TaxiScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { city: cityParam, dLat, dLng, dLabel, oLat, oLng, oLabel } = useLocalSearchParams<{
    city?: string; dLat?: string; dLng?: string; dLabel?: string;
    /** Origen pre-fijado (p. ej. el aeropuerto, desde la ficha del hotel): así el huésped que acaba de
     *  aterrizar no tiene que escribir ninguna dirección para ir a su alojamiento. */
    oLat?: string; oLng?: string; oLabel?: string;
  }>();
  const { isAuthenticated, phone } = useSession();
  const mapRef = useRef<EgMapViewHandle>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [origin, setOrigin] = useState<Coord | null>(null);
  const [originLabel, setOriginLabel] = useState('Localizando…');
  const [locBanner, setLocBanner] = useState<string | null>(null);
  const [modes, setModes] = useState<TaxiMode[]>([]);
  const [modesLoading, setModesLoading] = useState(true);
  const [modesError, setModesError] = useState<string | null>(null);
  const [modeId, setModeId] = useState('recomendado');
  const [destCoord, setDestCoord] = useState<Coord | null>(null);
  const [destText, setDestText] = useState('');
  const [routeCoords, setRouteCoords] = useState<Coord[]>([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [userPrice, setUserPrice] = useState('');
  // Promo de taxi activa (campaña publicitaria con descuento, p. ej. -20 %).
  const [promo, setPromo] = useState<{ pct: number; title: string } | null>(null);
  // Selector de pasajeros (DiDi: 1–6). El total de modos COMPARTIDOS se calcula
  // POR ASIENTO × pasajeros; los privados son por coche (no cambia).
  const [passengers, setPassengers] = useState(1);
  // ETA de la ruta (OSRM → minutos) para la tarjeta del pin destino.
  const [etaMin, setEtaMin] = useState<number | null>(null);
  // Flujo de rechazo/cancelación del viaje (DiDi Fase 2).
  const [cancelOpen, setCancelOpen] = useState(false);        // modal de motivos
  const [cancelBusy, setCancelBusy] = useState(false);
  // P1b: editar modalidad/presupuesto DURANTE la búsqueda (re-lanzar sin volver
  // a idle). searchEdit = selector abierto; relaunching = llamada en curso.
  const [searchEdit, setSearchEdit] = useState(false);
  const [relaunching, setRelaunching] = useState(false);
  // P1e: rating del conductor al completar el viaje (1–5 + comentario opcional).
  const [ratingOpen, setRatingOpen] = useState(false);
  const [ratingScore, setRatingScore] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [ratingBusy, setRatingBusy] = useState(false);
  const ratedTripRef = useRef<string | null>(null);
  const rejectBusyRef = useRef(false);
  // Qué fija un toque en el mapa: 'destino' (por defecto) o 'origen' (cambiar
  // el punto de partida con un solo clic, como DiDi permite ajustar la salida).
  const [moveTarget, setMoveTarget] = useState<'origen' | 'destino'>('destino');
  // Secuencia para no aplicar respuestas reverse-geocoder obsoletas (carreras).
  const revSeq = useRef(0);
  // Viaje ACTIVO reanudado desde el servidor: mientras exista, el GPS de arranque
  // y los cambios de origen/destino quedan BLOQUEADOS (decisión del dueño:
  // tras confirmar no se puede editar el trayecto).
  const lockedTripRef = useRef<string | null>(null);

  const { status, setStatus, tripId, setTripId, trip, setTrip, error, setError, busy, setBusy, resetTrip, startPolling } = useTripLogic();

  // ── Seguimiento EN VIVO del conductor (estilo DiDi) ──────────────────────
  // Polling GET /trips/:id cada 2,5 s mientras haya conductor asignado; el
  // coche se anima DENTRO de la página del mapa (rAF + ease-in-out 2 s,
  // geo-lerp). Rumbo por GPS si viene, si no entre 2 últimas posiciones.
  // >10 s sin fix → `lost` (banner + marcador gris). completed/cancelled →
  // el hook para el polling solo y notifica onEnded. Se le pasa tripId solo
  // en 'accepted' para no sondear en idle/requested (ya lo hace startPolling).
  const live = useDriverLiveTrack({
    tripId: status === 'accepted' ? tripId : null,
    mapRef,
    onEnded: (s) => {
      if (s === 'completed') {
        setStatus('completed');
        // P1e: ofrecer valorar al conductor al terminar (una vez por viaje).
        if (tripId && ratedTripRef.current !== tripId) {
          ratedTripRef.current = tripId;
          setRatingScore(5); setRatingComment('');
          setRatingOpen(true);
        }
      } else if (s === 'cancelled') setStatus('cancelled');
    },
  });

  // ── FASES DEL VIAJE EN VIVO (P3/P4, 2026-09-08) ──────────────────────────
  // El pasajero vive en 'accepted' tanto de camino a recogerle como ya en
  // ruta. El estado CRUDO del servidor (live.status) distingue:
  //   · 'accepted'     → APPROACH: conductor viene a recogerte (tarjeta completa).
  //   · 'in_progress'  → EN MARCHA: te recogió y va al destino (tarjeta mínima
  //                      transparente; la pantalla es la ruta con el coche).
  const enMarcha = live.status === 'in_progress';
  // P1-c: 'arrived' = el conductor avisó de llegada (la app CIERRA o espera el
  // auto-cierre a los 10 min). No es 'in_progress': la tarjeta es distinta.
  const arrived = live.status === 'arrived';
  const approach = status === 'accepted' && !enMarcha && !arrived;

  // ── Paleta Amap en viaje activo (PASAJERO) ───────────────────────────────
  // Mismo mapa verde/calles oscuras que el conductor (navMode passenger),
  // con pan libre y pitch 0. Fuera del viaje activo → mapa claro de búsqueda.
  const isLivePhase = status === 'requested' || status === 'accepted';
  useEffect(() => {
    mapRef.current?.setNavMode?.(isLivePhase ? 'passenger' : 'normal');
  }, [isLivePhase]);

  // Modo NOCHE del mapa por horario de Guinea Ecuatorial (UTC+1): al montar y
  // cada minuto (cruzar 19:00/06:00 cambia la paleta en vivo, sin recargar).
  useEffect(() => {
    let nightNow = isNightGq();
    mapRef.current?.setNight?.(nightNow);
    const t = setInterval(() => {
      const n = isNightGq();
      if (n !== nightNow) { nightNow = n; mapRef.current?.setNight?.(n); }
    }, 60000);
    return () => clearInterval(t);
  }, []);

  // ── Aproximación del conductor + fitBounds coche↔pasajero ────────────────
  const pickup = origin; // recogida = posición del pasajero
  const lastApproachRef = useRef<{ at: number; lng: number; lat: number } | null>(null);
  const lastFitRef = useRef<{ lng: number; lat: number; dKm: number } | null>(null);
  const prevLiveStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const fx = live.fix;
    const st = live.status;
    const prevSt = prevLiveStatusRef.current;
    prevLiveStatusRef.current = st;
    // La RUTA REAL por calles conductor→recogida (DiDi: el pasajero ve por qué
    // calles viene el coche) y el atenuado del azul solo aplican mientras el
    // conductor va de camino ('accepted' = "Conductor en camino").
    const onWay = st === 'accepted';
    mapRef.current?.setRouteDim?.(onWay);
    if (!fx || !pickup || status !== 'accepted' || !onWay) {
      if (!onWay) mapRef.current?.setApproach?.([]);
      return;
    }
    // Ruta REAL conductor → recogida (OSRM) con throttle ~5 s / avance real.
    const la = lastApproachRef.current;
    const dMove = la
      ? Math.abs(fx.lng - la.lng) * 95 + Math.abs(fx.lat - la.lat) * 111
      : 999;
    if (!la || (Date.now() - la.at > 5000 && dMove > 0.04)) {
      lastApproachRef.current = { at: Date.now(), lng: fx.lng, lat: fx.lat };
      (async () => {
        try {
          const res = await fetch(`${OSRM}/driving/${fx.lng},${fx.lat};${pickup[0]},${pickup[1]}?overview=full&geometries=geojson`);
          const data = await res.json();
          const coords = (data?.routes?.[0]?.geometry?.coordinates ?? []) as Coord[];
          if (coords.length >= 2) mapRef.current?.setApproach?.(coords);
        } catch { /* sin ruta: no se dibuja nada */ }
      })();
    }
    // fitBounds: al llegar el PRIMER fix del conductor (transición hacia
    // 'accepted') o cuando el coche avanza mucho y saldría de pantalla
    // (distancia coche→pasajero crece > ~35 % respecto al último encuadre).
    const havKm = (a: Coord, b: Coord) => {
      const R = 6371, toR = Math.PI / 180;
      const dLa = (b[1] - a[1]) * toR, dLo = (b[0] - a[0]) * toR;
      const s = Math.sin(dLa / 2) ** 2 + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLo / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(s));
    };
    const dKm = havKm([fx.lng, fx.lat], pickup as Coord);
    const lf = lastFitRef.current;
    const entering = prevSt !== 'accepted' && st === 'accepted';
    const growing = lf && dKm > lf.dKm * 1.35 + 0.08;
    if (entering || growing) {
      lastFitRef.current = { lng: fx.lng, lat: fx.lat, dKm };
      // Encuadra los DOS puntos: conductor (pos. actual) y pasajero (recogida).
      mapRef.current?.fitBounds([[fx.lng, fx.lat], pickup as unknown as Coord], { bottomFrac: 0.3 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.fix?.lng, live.fix?.lat, live.status, status]);

  // ── Origen: GPS real (solo si está DENTRO de Guinea Ecuatorial). Si el
  // dispositivo está fuera (o sin permiso), usamos una DIRECCIÓN REAL de la
  // ciudad activa (p. ej. una avenida de Malabo) para que OSRM (cobertura GQ)
  // pueda calcular rutas reales dentro de la ciudad. Si se REANUDA un viaje en
  // curso (lockedTripRef) el origen es el del viaje: el GPS nunca lo pisa. ──
  useEffect(() => {
    let alive = true;
    const useCityOrigin = (fbName?: string) => {
      const fb = fbName
        ? CITIES.find((ci) => ci.name.trim().toLowerCase() === fbName.trim().toLowerCase())
        : undefined;
      if (fb?.id === 'malabo') {
        // Punto real en el centro de Malabo (Avenida de la Independencia).
        setOrigin([8.7761, 3.7542]);
        setOriginLabel('Mi ubicación · Av. de la Independencia');
      } else if (fb?.id === 'bata') {
        setOrigin([9.7652, 1.8625]);
        setOriginLabel('Mi ubicación · Av. de las Naciones Unidas');
      } else if (fb && CITY_CENTERS[fb.id]) {
        setOrigin(CITY_CENTERS[fb.id]);
        setOriginLabel(`Mi ubicación · ${fb.name}`);
      } else {
        setOrigin([8.7761, 3.7542]);
        setOriginLabel('Mi ubicación · Av. de la Independencia');
      }
      setLocBanner('Ubicación aproximada en ' + (fb?.name ?? 'Malabo') + '. Toca "Desde" para cambiarla.');
    };
    (async () => {
      try {
        const perm = await Location.requestForegroundPermissionsAsync();
        if (perm.status === 'granted' && alive) {
          const p = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          if (p && alive) {
            const c: Coord = [p.coords.longitude, p.coords.latitude];
            // Bounding box de Guinea Ecuatorial (aprox., incluye islas).
            const insideGQ = c[0] >= 5.0 && c[0] <= 11.6 && c[1] >= -1.7 && c[1] <= 4.2;
            if (lockedTripRef.current) return; // viaje reanudado: respetar su origen
            // ── Y SI EL ORIGEN VENÍA PUESTO, EL GPS NO LO PISA ──────────────────────
            // El caso del huésped que llega al aeropuerto: la ficha del hotel abre el taxi con la
            // SALIDA ya puesta (el aeropuerto). Si el GPS la sobrescribe con «dónde estás ahora», el
            // botón deja de servir para lo único que existe: pedir el taxi desde el aeropuerto al
            // hotel sin escribir nada. Se comprueba con la referencia, no con el texto.
            if (geoOrigenRef.current) return;
            if (insideGQ) {
              setOrigin(c);
              setOriginLabel(`Mi ubicación · ${nearestCityName(c)}`);
              return;
            }
            // Fuera de GQ (p. ej. el dueño probando desde China): usar ciudad.
            if (alive) useCityOrigin(cityParam);
            return;
          }
        }
      } catch { /* GPS falla → fallback */ }
      if (alive && !lockedTripRef.current) useCityOrigin(cityParam);
    })();
    return () => { alive = false; };
  }, [cityParam]);

  const fareCity = useMemo(() => {
    if (origin) {
      const n = nearestCityName(origin);
      if (n) return n;
    }
    if (cityParam) return String(cityParam);
    return 'Malabo';
  }, [origin, cityParam]);

  // Promo de taxi activa (banner publicitario con serviceKey=taxi y descuento)
  // para la ciudad actual. Se aplica al precio al confirmar.
  useEffect(() => {
    let alive = true;
    setPromo(null);
    if (!fareCity) return;
    adsApi.homeBanner(fareCity)
      .then((b) => {
        if (!alive) return;
        const pct = Number(b?.discountPct ?? 0);
        if (b?.serviceKey === 'taxi' && pct > 0 && pct <= 90) {
          setPromo({ pct, title: b.title });
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [fareCity]);

  // Cámara con la que ABRE el mapa (MapBackground la aplica en cuanto el
  // WebView está ready): dirección real de la ciudad activa. Antes se abría en
  // la vista isla (z8) y el usuario veía mar hasta elegir destino.
  const initCam = useMemo(() => {
    const fb = cityParam
      ? CITIES.find((ci) => ci.name.trim().toLowerCase() === String(cityParam).trim().toLowerCase())
      : undefined;
    if (fb?.id === 'malabo') return { centerCoordinate: [8.7761, 3.7542] as Coord, zoomLevel: 13.6 };
    if (fb?.id === 'bata') return { centerCoordinate: [9.7652, 1.8625] as Coord, zoomLevel: 13.6 };
    if (fb && CITY_CENTERS[fb.id]) return { centerCoordinate: CITY_CENTERS[fb.id], zoomLevel: 12.5 };
    return { centerCoordinate: [8.7761, 3.7542] as Coord, zoomLevel: 13.6 };
  }, [cityParam]);

  // ── Ruta OSRM real, con cancelación de peticiones pendientes.
  const fetchRoute = useCallback(async (to: Coord, opts?: { fit?: boolean }) => {
    if (!origin) return;
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setRouteError(null);
    setRouteCoords([]);
    setDistanceKm(0);
    try {
      const res = await fetch(
        `${OSRM}/driving/${origin[0]},${origin[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`,
        { signal: ctrl.signal },
      );
      if (!res.ok) { setRouteError('No se pudo calcular la ruta (servicio OSRM).'); return; }
      const data = await res.json();
      const route = data?.routes?.[0];
      if (!route || !route.geometry?.coordinates?.length) { setRouteError('No se encontró ruta hasta ese punto.'); return; }
      const coords: Coord[] = route.geometry.coordinates;
      setRouteCoords(coords);
      setDistanceKm(Math.round((route.distance / 1000) * 10) / 10);
      setEtaMin(Math.max(1, Math.round((route.duration ?? 0) / 60)));
      if (coords.length >= 2 && opts?.fit !== false) {
        try { mapRef.current?.fitBounds([coords[0], coords[coords.length - 1]], { bottomFrac: 0.42 }); } catch { /* noop */ }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setRouteError('No se pudo calcular la ruta. Revisa tu conexión.');
      }
    }
  }, [origin]);

  // Debounce de llamadas: taps rápidos seguidos no disparan rutas OSRM en cascada.
  const debouncedFetchRoute = useDebouncedCall(fetchRoute, 300);

  // ── REANUDAR VIAJE ACTIVO (decisión del dueño: persistencia) ──────────────
  // Al abrir la pantalla (o volver a ella) con sesión y SIN flujo local en
  // curso, preguntamos por el viaje activo del pasajero
  // (GET /mobility/trips/active). Si existe (requested/accepted/in_progress)
  // se restaura todo (origen, destino, estado, polling, ruta/cámara) para que
  // el usuario continúe donde lo dejó aunque la app se hubiera cerrado.
  const applyResume = useCallback((t: Record<string, any>) => {
    const st = String(t.status ?? '');
    if (!['requested', 'accepted', 'in_progress'].includes(st)) return;
    const plng = Number(t.pickup_lng), plat = Number(t.pickup_lat);
    const dlng = Number(t.dropoff_lng), dlat = Number(t.dropoff_lat);
    if (!Number.isFinite(plng) || !Number.isFinite(plat) || !Number.isFinite(dlng) || !Number.isFinite(dlat)) return;
    lockedTripRef.current = String(t.id);
    setTripId(String(t.id));
    setTrip(t);
    // El pasajero vive en 'accepted' tanto "conductor en camino" como "viaje en
    // marcha": el seguimiento en vivo distingue por el status crudo del server.
    const mapped: 'requested' | 'accepted' = st === 'requested' ? 'requested' : 'accepted';
    setStatus(mapped);
    setOrigin([plng, plat]);
    setOriginLabel(String(t.pickup_address ?? 'Punto de recogida'));
    setDestCoord([dlng, dlat]);
    setDestText(String(t.dropoff_address ?? 'Destino'));
    setUserPrice('');
    setPassengers(1);
    setLocBanner(null);
    setRouteCoords([]); setDistanceKm(0); setEtaMin(null); setRouteError(null);
    if (st === 'requested') startPolling(String(t.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startPolling]);

  // Consulta única por foco: solo cuando no hay flujo local activo.
  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated || status !== 'idle' || !!tripId) return;
      let alive = true;
      taxiApi.activeTrip()
        .then((t) => { if (alive && t) applyResume(t); })
        .catch(() => { /* sin red o sin sesión: se reintenta al volver a la pestaña */ });
      return () => { alive = false; };
    }, [isAuthenticated, status, tripId, applyResume]),
  );

  // Tras reanudar: dibujar la ruta origen→destino del viaje recuperado y
  // encuadrar la cámara (solo si aún no hay ruta dibujada en pantalla).
  useEffect(() => {
    if (!tripId || status === 'idle' || !origin || !destCoord) return;
    if (routeCoords.length >= 2 || routeError) return;
    debouncedFetchRoute(destCoord);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId, status]);

  // Al terminar/cancelar el viaje se libera el bloqueo de edición (el GPS de
  // una próxima sesión podrá volver a fijar el origen con normalidad).
  useEffect(() => {
    if (status === 'cancelled' || status === 'completed') lockedTripRef.current = null;
  }, [status]);

  // ── Destino pre-fijado desde el buscador (geocoder: dLat/dLng/dLabel).
  const geoDest: Coord | null = useMemo(() => {
    const lat = Number(dLat);
    const lng = Number(dLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return [lng, lat];
  }, [dLat, dLng]);

  // Destino pre-fijado desde la URL (Home → /taxi?dLat&dLng&dLabel). Se aplica
  // UNA vez por par de coordenadas: si después el usuario cambia el ORIGEN (⇅,
  // toque, GPS…) no debe volver a pisar el destino elegido. Nunca pisa un
  // viaje reanudado o ya solicitado.
  const geoAppliedRef = useRef('');
  useEffect(() => {
    if (lockedTripRef.current || status !== 'idle') return;
    if (!geoDest || !origin) return;
    const key = `${geoDest[0].toFixed(6)},${geoDest[1].toFixed(6)}`;
    if (geoAppliedRef.current === key) return;
    geoAppliedRef.current = key;
    setDestCoord(geoDest);
    setDestText(String(dLabel ?? `Punto en el mapa (${geoDest[1].toFixed(4)}, ${geoDest[0].toFixed(4)})`));
    setUserPrice('');
    debouncedFetchRoute(geoDest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoDest && geoDest[0], geoDest && geoDest[1], origin]);

  // ── Origen pre-fijado (oLat/oLng/oLabel): el aeropuerto desde la ficha del hotel.
  const geoOrigin: Coord | null = useMemo(() => {
    const lat = Number(oLat);
    const lng = Number(oLng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return [lng, lat];
  }, [oLat, oLng]);

  // Se aplica UNA vez por par de coordenadas y solo si el viaje está en reposo: es la SALIDA del
  // huésped que llega al aeropuerto, y no puede pisar un viaje en curso ni su GPS si ya se movió.
  const geoOrigenRef = useRef('');
  useEffect(() => {
    if (lockedTripRef.current || status !== 'idle') return;
    if (!geoOrigin) return;
    const key = `${geoOrigin[0].toFixed(6)},${geoOrigin[1].toFixed(6)}`;
    if (geoOrigenRef.current === key) return;
    geoOrigenRef.current = key;
    setOrigin(geoOrigin);
    setOriginLabel(String(oLabel ?? `Salida (${geoOrigin[1].toFixed(4)}, ${geoOrigin[0].toFixed(4)})`));
    // Con el origen ya fijado, la ruta se recalcula si además hay destino (el caso del hotel).
    if (destCoord) debouncedFetchRoute(destCoord);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geoOrigin && geoOrigin[0], geoOrigin && geoOrigin[1], destCoord]);

  // ── Aplica la selección devuelta por el Buscador (origen/destino/atajos). ──
  useFocusEffect(
    useCallback(() => {
      const pick = takeGeoPick();
      if (!pick || pick.coord[0] === 0) return;
      // Viaje reanudado o en curso: la selección del buscador no puede pisarlo.
      if (lockedTripRef.current || status !== 'idle') return;
      const c: Coord = [pick.coord[0], pick.coord[1]];
      if (pick.mode === 'origen') {
        setOrigin(c);
        setOriginLabel(pick.label);
        setDestCoord(null); setDestText(''); setRouteCoords([]); setDistanceKm(0);
        mapRef.current?.setCamera({ centerCoordinate: c, zoomLevel: 14, durationMs: 400 });
      } else {
        setDestCoord(c);
        setDestText(pick.label);
        setUserPrice('');
        mapRef.current?.setCamera({ centerCoordinate: c, zoomLevel: 15, durationMs: 400 });
        debouncedFetchRoute(c);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [origin]),
  );

  const onMapPress = useCallback(
    (coord: Coord, meta?: { drag?: boolean; kind?: string }) => {
      // Tras confirmar (requested/accepted/…) el trayecto queda BLOQUEADO:
      // no se permite mover origen/destino ni recalcular rutas.
      if (status !== 'idle') return;
      const seq = ++revSeq.current;
      // Un ARRASTRE del pin trae su kind (origin/destination); un toque usa el
      // modo elegido (moveTarget). Ambos actualizan el punto con un solo gesto.
      const asOrigin = meta?.kind === 'origin' || (meta?.kind !== 'destination' && moveTarget === 'origen');

      const nameFor = (coordTo: Coord) => {
        reverseGeocode(coordTo[0], coordTo[1])
          .then((res) => {
            if (seq !== revSeq.current) return;
            const name = pickReverseLabel(res);
            if (!name) return; // conserva el texto actual si no hay resultado
            if (asOrigin) setOriginLabel(name);
            else setDestText(name);
          })
          .catch(() => {});
      };

      if (asOrigin) {
        setOrigin(coord);
        setOriginLabel('Punto de partida…');
        // Vuelve a modo destino para el siguiente toque (DiDi: ajustas y sigues).
        setMoveTarget('destino');
        if (!meta?.drag) mapRef.current?.setCamera({ centerCoordinate: coord, zoomLevel: 15, durationMs: 400 });
        nameFor(coord);
        if (destCoord) debouncedFetchRoute(destCoord, { fit: !meta?.drag });
      } else {
        setDestCoord(coord);
        setDestText('Destino en el mapa…');
        setUserPrice('');
        if (!meta?.drag) mapRef.current?.setCamera({ centerCoordinate: coord, zoomLevel: 15, durationMs: 400 });
        nameFor(coord);
        debouncedFetchRoute(coord, { fit: !meta?.drag });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [debouncedFetchRoute, destCoord, moveTarget],
  );

  /** Botón "ubicarme": GPS real fresco si el dispositivo está en GQ (punto
   *  EXACTO donde estás), y si no hay GPS real, centra el origen de ciudad. */
  const handleLocate = useCallback(async () => {
    const gps = await getCurrentGqPosition();
    // Viaje solicitado/en curso: SOLO centrar el mapa, jamás tocar la ruta.
    if (status !== 'idle') {
      const c = gps ?? origin;
      if (c) mapRef.current?.setCamera({ centerCoordinate: c, zoomLevel: gps ? 16 : 14, durationMs: 400 });
      return;
    }
    if (gps) {
      const seq = ++revSeq.current;
      setOrigin(gps);
      setOriginLabel('Mi ubicación…');
      setLocBanner(null);
      mapRef.current?.setCamera({ centerCoordinate: gps, zoomLevel: 16, durationMs: 400 });
      reverseGeocode(gps[0], gps[1])
        .then((res) => {
          if (seq !== revSeq.current) return;
          const n = pickReverseLabel(res);
          setOriginLabel(n ? `Mi ubicación · ${n}` : `Mi ubicación · ${nearestCityName(gps)}`);
        })
        .catch(() => { setOriginLabel(`Mi ubicación · ${nearestCityName(gps)}`); });
      if (destCoord) debouncedFetchRoute(destCoord, { fit: false });
    } else {
      if (origin) mapRef.current?.setCamera({ centerCoordinate: origin, zoomLevel: 14, durationMs: 500 });
      setLocBanner((prev) => prev ?? 'Sin GPS real: usando la dirección de la ciudad. Toca Desde para cambiarla.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destCoord, debouncedFetchRoute, status]);

  /** Intercambiar origen ↔ destino (icono ⇅ entre los dos puntos, como DiDi):
   *  el destino pasa a ser la salida y viceversa; se recalcula la ruta. */
  const handleSwap = useCallback(() => {
    if (!origin || !destCoord) return;
    const o = origin;
    const oLabel = originLabel.trim() || 'Mi ubicación';
    const dLabel = destText.trim() || 'Destino';
    // Intercambiamos estados…
    setOrigin(destCoord);
    setOriginLabel(dLabel);
    setDestCoord(o);
    setDestText(oLabel);
    setUserPrice('');
    // …y esperamos al render para que fetchRoute use el NUEVO origen (la
    // ruta se recalcula desde el destino anterior hacia el origen anterior).
    setTimeout(() => {
      debouncedFetchRoute(o, { fit: true });
    }, 150);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destCoord, originLabel, destText, debouncedFetchRoute]);

  const onDestText = useCallback((t: string) => {
    setDestText(t);
    if (destCoord) { setDestCoord(null); setRouteCoords([]); setDistanceKm(0); setRouteError(null); }
  }, [destCoord]);

  // ── Modalidades según distancia y ciudad detectada.
  useEffect(() => {
    let alive = true;
    setModesLoading(true);
    setModesError(null);
    taxiApi.modes(fareCity, distanceKm)
      .then((d) => { if (alive) setModes(d?.modes ?? []); })
      .catch(() => { if (alive) setModesError('No se pudieron cargar las modalidades.'); })
      .finally(() => { if (alive) setModesLoading(false); });
    return () => { alive = false; };
  }, [fareCity, distanceKm]);

  const retryModes = useCallback(() => {
    setModesLoading(true);
    setModesError(null);
    taxiApi.modes(fareCity, distanceKm)
      .then((d) => setModes(d?.modes ?? []))
      .catch(() => setModesError('No se pudieron cargar las modalidades.'))
      .finally(() => setModesLoading(false));
  }, [fareCity, distanceKm]);

  const mode = useMemo(() => modes.find((m) => m.id === modeId) ?? modes[0], [modes, modeId]);
  const algoPrice = mode?.price ?? null;
  // Asientos según modalidad (compartido/minibus) para recalcular por pasajeros.
  const poolCap = modeId === 'minibus' ? 6 : modeId === 'compartido' ? 3 : 0;
  const isPool = poolCap > 0;
  const pax = Math.max(1, Math.min(6, Math.round(passengers || 1)));
  const usedPax = isPool ? Math.min(pax, poolCap) : pax;
  // Total sugerido: pool = precio (por asiento) × pasajeros; privado = precio.
  const suggestedTotal = mode && algoPrice != null
    ? Math.round(algoPrice * (isPool ? usedPax : 1))
    : null;
  // Tarjeta flotante del PIN de DESTINO: "Llegada X min · X.X km" (DiDi) — si
  // aún no hay ruta calculada, muestra la dirección mientras se escribe.
  const destPinLabel = useMemo(() => {
    if (!destCoord) return undefined;
    if (etaMin != null && distanceKm > 0) {
      return `Llegada: ${etaMin} min · ${distanceKm.toLocaleString('es')} km`;
    }
    return destText.trim() || 'Destino';
  }, [destCoord, etaMin, distanceKm, destText]);

  // ── PRESUPUESTO POR OPCIONES (sin escribir): Malabo 500–10.000 XAF; Bata y
  // otras ciudades 300–10.000 XAF. El pasajero ELIGE su presupuesto de una
  // lista fija (decisión del dueño 2026-09-08: evitar ambigüedades). ──
  const budgetMin = (fareCity || '').trim().toLowerCase() === 'malabo' ? 500 : 300;
  const budgetMax = 10000;
  const budgetOptions = useMemo(() => {
    const steps = [300, 400, 500, 600, 700, 800, 900, 1000, 1200, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7500, 9000, 10000];
    return steps.filter((v) => v >= budgetMin && v <= budgetMax);
  }, [budgetMin]);
  const up = Number(userPrice);
  const userPriceOk = userPrice !== '' && !Number.isNaN(up) && up >= budgetMin && up <= budgetMax;
  const typedWithoutTap = destText.trim() !== '' && !destCoord;
  const canConfirm = !!origin && !!destCoord && !!mode && userPriceOk && !routeError && status === 'idle' && !typedWithoutTap;

  // Promo publicitaria: el descuento se aplica sobre el presupuesto confirmado.
  const promoApplied = promo && userPriceOk;
  const finalPrice = promoApplied ? Math.max(budgetMin, Math.round(up * (100 - promo.pct) / 100)) : up;
  const promoNote = promoApplied ? `Promo ${promo.title}: ${up.toLocaleString('es')} → ${finalPrice.toLocaleString('es')} XAF (-${promo.pct} %)` : null;

  // ── P1-c LIQUIDACIÓN: propuesta de precio → confirmación PIN → llegada ─────
  // El conductor acepta y PROPONE precio; el pasajero lo confirma con PIN (el
  // fare queda BLOQUEADO en el monedero con la comisión congelada por ciudad).
  // Cancelar: gratis en los primeros 5 min tras aceptar; después, cuota de
  // absentismo. Llegada del conductor: cierre manual o automático a los 10 min.
  // El viaje en efectivo solo se REGISTRA (cero dinero en el ledger).
  const [sv, setSv] = useState<SettlementView | null>(null);
  const [svBusy, setSvBusy] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [pinValue, setPinValue] = useState('');
  const [pwdValue, setPwdValue] = useState('');
  const [needSetPin, setNeedSetPin] = useState(false);
  const [payErr, setPayErr] = useState<string | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [dispOpen, setDispOpen] = useState(false);
  const [dispReason, setDispReason] = useState('');
  const [dispBusy, setDispBusy] = useState(false);
  const refreshSv = useCallback(async () => {
    if (!tripId) { setSv(null); return; }
    try { setSv(await settlementApi.view(tripId)); } catch { setSv(null); }
  }, [tripId]);
  useEffect(() => { void refreshSv(); }, [refreshSv, live.status, status]);
  const abrirPago = () => { setPayErr(null); setPinValue(''); setNeedSetPin(false); setPinOpen(true); };
  const confirmarPago = async () => {
    if (payBusy || !tripId) return;
    setPayBusy(true); setPayErr(null);
    try {
      const fare = Number(sv?.fare ?? 0);
      if (needSetPin) { await fijarPin(pinValue, pwdValue || undefined); }
      const token = await tokenDeViaje(pinValue, fare, tripId);
      await settlementApi.lock(tripId, token, sv?.city ?? null);
      setPinOpen(false); setPwdValue('');
      await refreshSv();
    } catch (e) {
      const err = e as { code?: string; message?: string };
      if (!needSetPin) {
        setNeedSetPin(true);
        setPayErr('¿Primer pago? Escribe tu contraseña y elige tu PIN de 6 dígitos.');
      } else {
        setPayErr(err?.message ?? 'No se pudo confirmar el pago');
      }
    } finally { setPayBusy(false); }
  };
  const pagarEfectivo = async () => {
    if (!tripId) return;
    try { await settlementApi.chooseCash(tripId); await refreshSv(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo registrar el efectivo'); }
  };
  const cerrarViaje = async () => {
    if (!tripId || svBusy) return;
    setSvBusy(true);
    try { await settlementApi.settle(tripId); await refreshSv(); }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo cerrar el viaje'); }
    finally { setSvBusy(false); }
  };
  const disputar = async () => {
    if (!tripId || dispBusy || dispReason.trim().length < 10) return;
    setDispBusy(true);
    try {
      await settlementApi.dispute(tripId, dispReason.trim());
      setDispOpen(false); setDispReason('');
      await refreshSv();
      setError('Disputa abierta: el soporte revisará el viaje y, si procede, te devolverá el importe.');
    } catch (e) { setError(e instanceof Error ? e.message : 'No se pudo abrir la disputa'); }
    finally { setDispBusy(false); }
  };

  const confirmar = async () => {
    if (!canConfirm || busy || !origin || !destCoord) return;
    if (!isAuthenticated) { router.push('/auth' as any); return; }
    setBusy(true); setError(null);
    try {
      const t = await taxiApi.createTrip({
        pickupLat: origin[1], pickupLng: origin[0], pickupAddress: originLabel,
        dropoffLat: destCoord[1], dropoffLng: destCoord[0], dropoffAddress: destText.trim() || 'Punto en el mapa',
        zoneType: 'inside', requestedPrice: finalPrice, algorithmPrice: suggestedTotal ?? algoPrice ?? undefined,
        modality: modeId, isPool: isPool,
        // Compartido: hasta 3 asientos (DiDi "coche compartido"); mini bus: 6.
        maxPoolSeats: isPool ? usedPax : 1,
        passengers: usedPax,
        city: fareCity ?? undefined,   // P1-c: la comisión del viaje es por ciudad
      });
      setTripId(t.id);
      setStatus('requested');
      startPolling(t.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo pedir el taxi');
    } finally { setBusy(false); }
  };

  // ── P1b DiDi: durante la BÚSQUEDA el pasajero puede re-elegir modalidad,
  // presupuesto o nº de personas. La solicitud actual se CANCELA y se relanza
  // automáticamente con los nuevos parámetros (sin volver al paso 1). ────────
  const relaunch = useCallback(async (patch?: { modeId?: string; price?: string; passengers?: number }) => {
    if (!origin || !destCoord || relaunching || busy) return;
    const nextMode = patch?.modeId ?? modeId;
    const nextCap = nextMode === 'minibus' ? 6 : nextMode === 'compartido' ? 3 : 0;
    const nextPool = nextCap > 0;
    const nextPax = Math.max(1, Math.min(6, Math.round(patch?.passengers ?? (passengers || 1))));
    const nextUsed = nextPool ? Math.min(nextPax, nextCap) : nextPax;
    const nextPrice = patch?.price ?? userPrice;
    const nextUp = Number(nextPrice);
    if (nextPrice === '' || Number.isNaN(nextUp) || nextUp < budgetMin || nextUp > budgetMax) return;
    const nextModeObj = modes.find((m) => m.id === nextMode) ?? null;
    setRelaunching(true); setError(null);
    try {
      // 1) Cancelar la solicitud actual si existe.
      if (tripId) await taxiApi.cancelTrip(tripId).catch(() => {});
      // 2) Relanzar con los nuevos parámetros.
      const t2 = await taxiApi.createTrip({
        pickupLat: origin[1], pickupLng: origin[0], pickupAddress: originLabel,
        dropoffLat: destCoord[1], dropoffLng: destCoord[0], dropoffAddress: destText.trim() || 'Punto en el mapa',
        zoneType: 'inside', requestedPrice: nextUp,
        algorithmPrice: nextModeObj?.price ?? undefined,
        modality: nextMode, isPool: nextPool,
        maxPoolSeats: nextPool ? nextUsed : 1,
        passengers: nextUsed,
        city: fareCity ?? undefined,   // P1-c
      });
      setModeId(nextMode);
      setUserPrice(String(nextUp));
      if (patch?.passengers) setPassengers(patch.passengers);
      setTripId(t2.id);
      setStatus('requested');
      startPolling(t2.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo re-lanzar la solicitud');
    } finally {
      setRelaunching(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [origin, destCoord, modeId, modes, userPrice, passengers, budgetMin, budgetMax, tripId, relaunching, busy]);

  const handleResetTrip = useCallback(() => {
    resetTrip();
    setDestCoord(null); setDestText(''); setRouteCoords([]); setDistanceKm(0); setEtaMin(null); setRouteError(null);
    setPassengers(1);
  }, [resetTrip]);

  // ── CANCELACIÓN DEL PASAJERO (DiDi) ───────────────────────────────────────
  // Al elegir el MOTIVO en el modal, el viaje se cancela DE INMEDIATO (sin
  // pantalla intermedia). Si el servidor lo rechaza porque el viaje YA terminó
  // en otra sesión (completed/cancelled/inexistente), también salimos del
  // estado "en curso" local (evita pantallas fantasma). Si está EN MARCHA
  // (in_progress, conductor ya te recogió) no se cancela y se avisa.
  const cancelWithReason = useCallback(async (reason?: string) => {
    if (rejectBusyRef.current) return;
    rejectBusyRef.current = true;
    setCancelBusy(true);
    let cancelled = false;
    let cuotaMsg: string | null = null;   // P1-c: mensaje con cuota/reembolso cuando hay lock
    try {
      if (tripId) {
        try {
          if (sv?.money?.locked) {
            // P1-c: fare bloqueado → la cancelación va por LIQUIDACIÓN: dentro
            // de la ventana (5 min) vuelve todo; después paga el conductor la
            // cuota de absentismo y el resto vuelve a tu monedero.
            const r = await settlementApi.cancel(tripId, reason);
            cancelled = true;
            cuotaMsg = Number(r.fee_to_driver) > 0
              ? `Viaje cancelado: ${Number(r.fee_to_driver).toLocaleString('es')} XAF de cuota y ${Number(r.refunded).toLocaleString('es')} XAF devueltos.`
              : 'Viaje cancelado: el importe bloqueado volvió entero a tu monedero.';
          } else {
            await taxiApi.cancelTrip(tripId, reason);
            cancelled = true;
          }
        } catch (e) {
          const code = (e as { code?: string })?.code ?? '';
          if (code === 'SETTLEMENT_REQUIRED') {
            // El viaje se bloqueó entre medias (otra sesión pagó): reintenta por liquidación.
            const r = await settlementApi.cancel(tripId, reason);
            cancelled = true;
            cuotaMsg = Number(r.fee_to_driver) > 0
              ? `Viaje cancelado: ${Number(r.fee_to_driver).toLocaleString('es')} XAF de cuota y ${Number(r.refunded).toLocaleString('es')} XAF devueltos.`
              : 'Viaje cancelado: el importe bloqueado volvió entero a tu monedero.';
          } else if (code === 'TRIP_NOT_FOUND') {
            // El viaje ya no existe: nada que cancelar → salir igualmente.
            cancelled = true;
          } else if (code === 'TRIP_NOT_CANCELLABLE') {
            // Comprobar el estado REAL en el servidor antes de decidir.
            const t = await taxiApi.getTrip(tripId).catch(() => null);
            const real = String(t?.status ?? '');
            if (real === 'completed' || real === 'cancelled' || real === '') {
              // Ya terminó (p. ej. en otra sesión): salir del estado local.
              cancelled = true;
            } else {
              // Sigue activo (in_progress: te recogieron) → no se puede cancelar.
              throw e;
            }
          } else {
            throw e;
          }
        }
      } else {
        cancelled = true; // sin viaje en curso local: solo limpiar estado
      }
      if (cancelled) {
        resetTrip();
        lockedTripRef.current = null; // liberar el bloqueo de edición
        setError(cuotaMsg ?? 'Viaje cancelado. Puedes pedir otro taxi.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cancelar el viaje');
    } finally {
      rejectBusyRef.current = false;
      setCancelBusy(false);
      setCancelOpen(false);
    }
  }, [tripId, resetTrip, sv]);

  // Cleanup de peticiones OSRM al desmontar.
  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  // Etiqueta de estado: en marcha (in_progress) el chip dice "Viaje en marcha".
  const st = enMarcha ? { t: 'Viaje en marcha', c: brand.primary } : arrived ? { t: 'Has llegado al destino', c: brand.warning } : STATUS_UI[status];
  const s = styles(colors);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Mapa a pantalla completa (DiDi): panel de tarifas se superpone SIN encoger */}
      <MapBackground ref={mapRef} style={StyleSheet.absoluteFill} onMapPress={onMapPress} initialCamera={initCam}>
        <EgMarkers
          markers={[
            ...(origin ? [{ id: 'o', coordinate: origin, kind: 'origin' as const, label: originLabel, draggable: status === 'idle' }] : []),
            ...(destCoord ? [{ id: 'd', coordinate: destCoord, kind: 'destination' as const, label: destPinLabel, draggable: status === 'idle' }] : []),
            // El coche del conductor se anima por SEPARADO (useDriverLiveTrack →
            // setCarLive en la página del mapa), no como pin estático de EgMarkers.
          ]}
        />
        {routeCoords.length >= 2 && <EgRoutePolyline coordinates={routeCoords} />}
      </MapBackground>

      {/* Tarjeta flotante origen → destino (estilo DiDi, sobre el mapa).
          P2 (2026-09-08): SOLO en idle (pedir taxi). Con viaje en curso
          (requested/accepted/in_progress) NO se muestra: no se puede cambiar
          origen ni destino ni el "modal de poner destino". */}
      {status === 'idle' && (
      <View style={[s.topCard, { top: insets.top + 4, backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={s.topCardHeader}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Volver"
            style={s.backBtn}
          >
            <ArrowLeft size={20} color={colors.textPrimary} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={s.topCardRow}>
              <View style={s.stopIconBox}><View style={[s.stopDot, { backgroundColor: brand.success }]} /></View>
              <Pressable
                style={{ flex: 1 }}
                disabled={status !== 'idle'}
                onPress={() => router.push({ pathname: '/buscar', params: { city: cityParam ?? fareCity, mode: 'origen' } } as never)}
                accessibilityRole="button"
                accessibilityLabel={status === 'idle' ? 'Cambiar origen' : 'Origen'}
              >
                <Text style={[s.stopValue, { color: status === 'idle' ? colors.textPrimary : colors.textSecondary }]} numberOfLines={1}>{originLabel}</Text>
              </Pressable>
              {/* Cambiar la salida con UN TOQUE en el mapa (como el destino) */}
              {status === 'idle' ? (
                <Pressable
                  onPress={() => setMoveTarget((p) => (p === 'origen' ? 'destino' : 'origen'))}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Mover el punto de partida tocando el mapa"
                  accessibilityState={{ selected: moveTarget === 'origen' }}
                  style={[s.mapPickBtn, { backgroundColor: moveTarget === 'origen' ? alphaC(brand.success, 0.16) : 'transparent', borderColor: moveTarget === 'origen' ? brand.success : colors.border }]}
                >
                  <Pencil size={14} color={moveTarget === 'origen' ? brand.success : colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>
            {/* Entre las dos filas: línea vertical + botón ⇅ para INTERCAMBIAR
                origen ↔ destino (misma columna que los puntos, estilo DiDi). */}
            <View style={s.connectorGap}>
              <View style={s.connectorCol}>
                <View style={[s.connectorVLine, { backgroundColor: colors.border }]} />
                <Pressable
                  onPress={handleSwap}
                  disabled={!destCoord || status !== 'idle'}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Intercambiar origen y destino"
                  accessibilityHint="El punto de partida y el destino se cambian entre sí y se recalcula la ruta"
                  style={[
                    s.swapBtn,
                    {
                      backgroundColor: colors.card,
                      borderColor: destCoord && status === 'idle' ? colors.primary : colors.border,
                      opacity: destCoord && status === 'idle' ? 1 : 0.35,
                    },
                  ]}
                >
                  <ArrowUpDown size={13} color={colors.primary} />
                </Pressable>
              </View>
            </View>
            <View style={s.topCardRow}>
              <View style={s.stopIconBox}><View style={[s.stopDot, { backgroundColor: brand.danger }]} /></View>
              <Pressable
                style={{ flex: 1 }}
                disabled={status !== 'idle'}
                onPress={() => router.push({ pathname: '/buscar', params: { city: cityParam ?? fareCity, mode: 'destino' } } as never)}
                accessibilityRole="button"
                accessibilityLabel={status === 'idle' ? 'Cambiar destino' : 'Destino'}
              >
                <Text style={[s.stopValueDest, { color: destCoord ? colors.textPrimary : colors.textSecondary }]} numberOfLines={1}>
                  {destText.trim() || '¿A dónde vas?'}
                </Text>
              </Pressable>
              {destCoord && status === 'idle' ? (
                <Pressable onPress={handleResetTrip} hitSlop={8} accessibilityRole="button" accessibilityLabel="Borrar destino">
                  <X size={16} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>
          </View>
        </View>
      </View>
      )}

      {/* Aviso flotante mientras se elige mover el punto de partida */}
      {status === 'idle' && moveTarget === 'origen' && (
        <View pointerEvents="none" style={[s.mapHint, { top: insets.top + 126, backgroundColor: 'rgba(0,178,106,0.95)' }]}>
          <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: '800' }}>🟢 Toca el mapa para cambiar la salida</Text>
        </View>
      )}

      {/* Botón flotante de origen: ubicarme por GPS real (o centrar en origen) */}
      <View style={[s.mapFabRow]}>
        <Pressable onPress={handleLocate} style={[s.mapFab, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="button" accessibilityLabel="Ubicarme en mi posición actual">
          <Navigation size={17} color={colors.primary} />
        </Pressable>
      </View>

      {/* Panel inferior superpuesto (no empuja el mapa). P3/P4: en marcha el
          panel es TRANSPARENTE (sin fondo ni maxHeight) para que el mapa y la
          ruta dominen; el resto de fases usa su fondo habitual. */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={enMarcha
          ? { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: espaciado.e2 }
          : [s.panel, { backgroundColor: colors.background }]}
        pointerEvents={enMarcha ? 'box-none' : 'auto'}
      >
        {(moveTarget === 'origen' || !destCoord) && !enMarcha && (
          <View style={[s.askDestBanner, { backgroundColor: moveTarget === 'origen' ? brand.success : colors.overlay }]}>
            <Text style={{ color: brand.white, fontSize: tipografia.body, fontWeight: '700' }}>
              {moveTarget === 'origen' ? '🟢 Mueve la SALIDA: toca el mapa' : '👆 Toca el mapa para fijar el destino'}
            </Text>
          </View>
        )}
        <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} scrollEnabled={!enMarcha}>
          {error && (
            <View style={[s.banner, { backgroundColor: colors.danger + '14' }]}>
              <Text style={{ color: colors.danger, fontWeight: '700', fontSize: tipografia.body }}>{error}</Text>
            </View>
          )}
          {locBanner && (
            <View style={[s.banner, { backgroundColor: colors.surface }]}>
              <MapPin size={14} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginLeft: espaciado.e6, fontWeight: '600' }}>{locBanner}</Text>
            </View>
          )}
          {/* FASE 2 DiDi: "Buscando taxi" con radar animado (nativo). */}
          {status === 'requested' && (
            <View style={{ alignItems: 'center', gap: espaciado.e8, paddingVertical: espaciado.e6 }}>
              <SearchRadar color={brand.secondary} />
              <Text style={{ color: brand.secondary, fontWeight: '800', fontSize: 15 }}>
                {relaunching ? 'Re-lanzando solicitud…' : 'Buscando taxi…'}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center' }}>
                {tripId ? `Solicitud ${tripId.slice(0, 8).toUpperCase()}` : 'Enviando solicitud a los conductores cercanos'}
              </Text>

              {/* P1b: mientras busca, el pasajero puede CAMBIAR modalidad/presupuesto
                  (la solicitud se cancela y se relanza sola). */}
              {!searchEdit ? (
                <Pressable
                  onPress={() => setSearchEdit(true)}
                  disabled={relaunching}
                  accessibilityRole="button"
                  accessibilityLabel="Cambiar modalidad, presupuesto o pasajeros mientras buscas"
                  style={[s.cancelLink, { borderColor: colors.primary + '66' }]}
                >
                  <Text style={{ color: colors.primary, fontWeight: '800', fontSize: tipografia.body }}>
                    {relaunching ? 'Re-lanzando…' : '⇄ Cambiar modalidad / presupuesto'}
                  </Text>
                </Pressable>
              ) : (
                <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, width: '100%', gap: espaciado.e10 }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '900', fontSize: tipografia.body }}>
                      Ajusta tu solicitud
                    </Text>
                    <Pressable onPress={() => setSearchEdit(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Cerrar ajustes">
                      <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: tipografia.caption }}>Listo ✕</Text>
                    </Pressable>
                  </View>
                  <Text style={{ fontSize: 10.5, color: colors.textSecondary, fontWeight: '600' }}>
                    Se cancela esta búsqueda y se lanza una nueva con tus cambios.
                  </Text>
                  {relaunching ? (
                    <ActivityIndicator color={colors.primary} style={{ marginVertical: espaciado.e10 }} />
                  ) : (
                    <>
                      {modes.length > 0 && (
                        <View style={{ gap: espaciado.e6 }}>
                          {modes.map((item) => {
                            const active = modeId === item.id;
                            const cap = item.id === 'minibus' ? 6 : item.id === 'compartido' ? 3 : 0;
                            const total = item.price != null
                              ? Math.round(item.price * (cap > 0 ? Math.min(pax, cap) : 1))
                              : null;
                            return (
                              <Pressable
                                key={item.id}
                                onPress={() => void relaunch({ modeId: item.id })}
                                accessibilityRole="radio"
                                accessibilityState={{ checked: active }}
                                accessibilityLabel={`${item.label}, ${total?.toLocaleString('es') ?? ''} XAF`}
                                style={[s.modeRow, { backgroundColor: active ? alphaC(colors.primary, 0.07) : colors.surface, borderColor: active ? colors.primary : colors.border, borderWidth: active ? 1.5 : 1 }]}
                              >
                                <View style={{ flex: 1 }}>
                                  <Text style={[s.modeName, { color: colors.textPrimary, fontSize: tipografia.body }]}>{item.label}</Text>
                                  <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>
                                    ⏱ {item.etaMin} min{cap > 0 ? ` · hasta ${cap} plazas` : ''}
                                  </Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                  <Text style={{ color: brand.secondary, fontSize: tipografia.body, fontWeight: '800' }}>
                                    {total != null ? `${total.toLocaleString('es')} XAF` : '—'}
                                  </Text>
                                  <Text style={{ fontSize: 10, color: active ? colors.primary : colors.textSecondary, fontWeight: '800' }}>
                                    {active ? '✓ Solicitando' : 'Elegir'}
                                  </Text>
                                </View>
                              </Pressable>
                            );
                          })}
                        </View>
                      )}
                      {/* Presupuesto re-elegible */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, fontWeight: '700' }}>Presupuesto</Text>
                        <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, fontWeight: '700' }}>{userPrice ? `${up.toLocaleString('es')} XAF` : '—'}</Text>
                      </View>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6 }}>
                        {budgetOptions.slice(0, 8).map((v) => {
                          const active = Number(userPrice) === v;
                          return (
                            <Pressable
                              key={v}
                              onPress={() => void relaunch({ price: String(v) })}
                              style={[s.budgetChip, { borderColor: active ? brand.secondary : colors.border, backgroundColor: active ? alphaC(brand.secondary, 0.12) : colors.surface }]}
                            >
                              <Text style={{ fontSize: tipografia.caption, fontWeight: '800', color: active ? brand.secondary : colors.textPrimary }}>
                                {v.toLocaleString('es')}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </>
                  )}
                </View>
              )}

              <Pressable
                onPress={() => setCancelOpen(true)}
                disabled={cancelBusy}
                accessibilityRole="button"
                accessibilityLabel="Cancelar búsqueda"
                style={[s.cancelLink, { borderColor: colors.border }]}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: tipografia.body }}>Cancelar búsqueda</Text>
              </Pressable>
            </View>
          )}

          {st && status !== 'requested' && (
            <View style={[s.statusChip, { backgroundColor: st.c + '14' }]}>
              <Text style={{ color: st.c, fontWeight: '700', fontSize: tipografia.body }}>
                {st.t}{trip?.final_price != null ? ` · ${Number(trip.final_price).toLocaleString('es')} XAF` : ''}
              </Text>
            </View>
          )}
          {/* Señal perdida: >10 s sin un fix nuevo del conductor (coche en gris). */}
          {live.lost && status === 'accepted' && (
            <View style={[s.banner, { backgroundColor: '#F53F3F14' }]} accessibilityLiveRegion="polite">
              <RefreshCw size={14} color={brand.danger} />
              <Text style={{ color: brand.danger, fontSize: tipografia.caption, marginLeft: espaciado.e6, fontWeight: '700' }}>
                Señal perdida — esperando al GPS del conductor…
              </Text>
            </View>
          )}

          {/* ── FASE APPROACH (conductor viene a recogerte) ──────────────────
              Tarjeta COMPLETA del conductor: foto, nombre, MATRÍCULA destacada,
              valoración/viajes, coche, precio, PIN y acciones. */}
          {approach && (
            <View style={[s.card, { backgroundColor: '#27AE600F', borderColor: '#27AE6033', gap: espaciado.e10 }]}>
              <Text style={{ color: brand.success, fontWeight: '900', fontSize: 15, textAlign: 'center' }}>🚕 Conductor en camino</Text>
              {(() => {
                const t = (trip ?? {}) as Record<string, any>;
                const name = String(t.driver_name ?? 'Conductor');
                // El backend expone el vehículo con prefijo driver_* (alias).
                const plate = String(t.driver_plate ?? t.vehicle_plate ?? '');
                const model = String(t.driver_model ?? t.vehicle_model ?? '');
                // P1a: color y foto REAL del coche (los añade el backend).
                const color = String(t.driver_vehicle_color ?? '').trim();
                const carPhoto = typeof t.driver_vehicle_photo === 'string' && t.driver_vehicle_photo && !t.driver_vehicle_photo.startsWith('captured://') ? absUrl(t.driver_vehicle_photo) : null;
                const carTxt = [model, plate].filter(Boolean).join(' · ');
                const photo = typeof t.driver_photo === 'string' && t.driver_photo && !t.driver_photo.startsWith('captured://') ? absUrl(t.driver_photo) : null;
                const wa = typeof t.driver_phone === 'string' && t.driver_phone.trim() ? t.driver_phone.replace(/\D/g, '') : null;
                const tel = wa ? `tel:${wa}` : null;
                // P1c: valoración y experiencia del conductor.
                const rating = Number(t.driver_rating);
                const ratingOk = Number.isFinite(rating) && rating > 0;
                const trips = Number(t.driver_trips);
                const tripsOk = Number.isFinite(trips) && trips > 0;
                const dotColor: Record<string, string> = {
                  blanco: '#F2F2F2', negro: '#26282C', gris: '#9AA0A6', plata: '#C9CFD6',
                  rojo: brand.danger, azul: brand.primary, verde: brand.success, amarillo: brand.warning,
                  naranja: brand.warning, marrón: '#8B5A2B',
                };
                return (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e12 }}>
                      {photo ? (
                        <Image source={{ uri: photo }} style={s.avatar} />
                      ) : (
                        <View style={[s.avatar, { backgroundColor: '#27AE6033' }]}>
                          <Text style={{ color: brand.success, fontWeight: '900', fontSize: tipografia.title }}>{(name || 'C').charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6 }}>
                          <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.subtitle }} numberOfLines={1}>{name}</Text>
                          {(ratingOk || tripsOk) && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e2 }}>
                              <Star size={12} color={brand.warning} fill={brand.warning} />
                              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '800' }}>
                                {ratingOk ? rating.toFixed(1) : '—'}
                                {tripsOk ? ` · ${trips} viaje${trips === 1 ? '' : 's'}` : ''}
                              </Text>
                            </View>
                          )}
                        </View>
                        {carPhoto ? (
                          <>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, marginTop: espaciado.e2 }}>
                              <Image source={{ uri: carPhoto }} style={s.carThumb} resizeMode="cover" />
                              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '600', flex: 1 }} numberOfLines={1}>
                                {carTxt || 'Coche asignado'}
                              </Text>
                            </View>
                            {color && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, marginTop: espaciado.e2 }}>
                                <View style={[s.colorSwatch, { backgroundColor: dotColor[color.toLowerCase()] ?? '#ccc' }]} />
                                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '600' }}>{color}</Text>
                              </View>
                            )}
                          </>
                        ) : (
                          <>
                            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '600' }} numberOfLines={1}>{carTxt || 'Coche asignado'}</Text>
                            {color && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, marginTop: espaciado.e2 }}>
                                <View style={[s.colorSwatch, { backgroundColor: dotColor[color.toLowerCase()] ?? '#ccc' }]} />
                                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '600' }}>{color}</Text>
                              </View>
                            )}
                          </>
                        )}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={{ color: brand.secondary, fontWeight: '900', fontSize: tipografia.subtitle }}>
                          {t.final_price != null ? `${Number(t.final_price).toLocaleString('es')} XAF` : '—'}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 10.5 }}>Precio acordado</Text>
                      </View>
                    </View>
                    {/* Matrícula DESTACADA (P1): placa visible de un vistazo */}
                    {plate ? (
                      <View style={s.plateBox}>
                        <Text style={s.plateTxt}>{plate.toUpperCase()}</Text>
                      </View>
                    ) : null}
                    <Text style={{ fontSize: tipografia.body, color: colors.textPrimary, fontWeight: '600', textAlign: 'center' }}>
                      El conductor te pedirá este PIN para empezar el viaje:
                    </Text>
                    <Text style={{ fontSize: 30, fontWeight: '900', letterSpacing: 6, color: brand.success, textAlign: 'center' }}>
                      {pinLast4(phone)}
                    </Text>
                    {(wa || tel) && (
                      <View style={{ flexDirection: 'row', gap: espaciado.e8 }}>
                        {tel ? (
                          <Pressable
                            onPress={() => Linking.openURL(tel).catch(() => setError('No se pudo abrir el teléfono.'))}
                            accessibilityRole="button"
                            accessibilityLabel="Llamar al conductor"
                            style={[s.waBtn, { flex: 1, backgroundColor: brand.success }]}
                          >
                            <Text style={{ color: brand.white, fontWeight: '800', fontSize: tipografia.body }}>📞 Llamar</Text>
                          </Pressable>
                        ) : null}
                        {wa ? (
                          <Pressable
                            onPress={() => {
                              const msg = encodeURIComponent('Hola, soy tu pasajero de EG Route Plan. ¿Vienes de camino?');
                              Linking.openURL(`https://wa.me/${wa}?text=${msg}`).catch(() =>
                                setError('No se pudo abrir WhatsApp. Instálalo o escribe por teléfono.'));
                            }}
                            accessibilityRole="button"
                            accessibilityLabel="Contactar por WhatsApp"
                            style={[s.waBtn, { flex: 2, backgroundColor: brand.whatsapp }]}
                          >
                            <Text style={{ color: brand.white, fontWeight: '800', fontSize: tipografia.body }}>WhatsApp</Text>
                          </Pressable>
                        ) : null}
                      </View>
                    )}
                  </>
                );
              })()}
              {/* ── P1-c LIQUIDACIÓN: confirmar el precio propuesto con PIN ─────
                  El bloque deja de ser palabra de honor: el fare sale de tu
                  monedero SOLO si lo confirmas con PIN, y al cerrar cobra el
                  conductor el NETO (la comisión se la queda la plataforma). */}
              {sv && sv.state === 'proposed' && Number(sv.fare) > 0 && (
                <View style={{ gap: espaciado.e8 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
                      Comisión EG ({sv.city ?? fareCity}) · al conductor {Number(sv.net).toLocaleString('es')} XAF
                    </Text>
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '800' }}>{Number(sv.fee).toLocaleString('es')} XAF</Text>
                  </View>
                  <PrimaryButton
                    title={`Confirmar precio y pagar · ${Number(sv.fare).toLocaleString('es')} XAF`}
                    onPress={abrirPago}
                  />
                  <Pressable
                    onPress={pagarEfectivo}
                    accessibilityRole="button"
                    accessibilityLabel="Pagar en efectivo al conductor"
                    style={{ paddingVertical: espaciado.e4, alignItems: 'center' }}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '700', textDecorationLine: 'underline' }}>
                      Prefiero pagar en efectivo al llegar
                    </Text>
                  </Pressable>
                </View>
              )}
              {sv?.money.locked && !sv.money.released && (
                <View style={{ padding: espaciado.e10, borderRadius: radios.md, borderWidth: 1, borderColor: '#27AE6055', backgroundColor: '#27AE6010' }}>
                  <Text style={{ color: brand.success, fontWeight: '900', fontSize: tipografia.body }}>
                    💳 {Number(sv.fare).toLocaleString('es')} XAF bloqueados con tu PIN
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>
                    {(() => {
                      const until = sv.timers.free_cancel_until ? new Date(sv.timers.free_cancel_until).getTime() : 0;
                      const mins = Math.max(0, Math.round((until - Date.now()) / 60000));
                      return mins > 0
                        ? `Tienes ${mins} min para cancelarlo sin coste; después, cuota de absentismo.`
                        : 'Fuera de la ventana gratis: cancelarlo deja al conductor la cuota de absentismo.';
                    })()}
                  </Text>
                </View>
              )}
              {sv?.state === 'cash' && (
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center' }}>
                  Viaje en efectivo: paga al conductor al terminar. Queda registrado sin cargo en tu monedero.
                </Text>
              )}
              <Pressable
                onPress={() => setCancelOpen(true)}
                disabled={cancelBusy}
                accessibilityRole="button"
                accessibilityLabel="Rechazar o cancelar el viaje"
                style={[s.cancelLink, { borderColor: '#F53F3F55' }]}
              >
                <Text style={{ color: brand.danger, fontWeight: '700', fontSize: tipografia.body }}>Rechazar / Cancelar viaje</Text>
              </Pressable>
            </View>
          )}

          {/* ── FASE LLEGADA (P1-c): el conductor avisó; el pasajero cierra o ──
              el servidor auto-cierra a los 10 min. Sin confirmación no hay
              payout; con disputa, el admin puede devolver el viaje entero. */}
          {arrived && (
            <View style={[s.card, { backgroundColor: '#F6B1000F', borderColor: '#F6B10033', gap: espaciado.e10 }]}>
              <Text style={{ color: colors.textPrimary, fontWeight: '900', fontSize: 15, textAlign: 'center' }}>
                🏁 El conductor dice que habéis llegado
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center' }}>
                ¿Te ha dejado ya? Confirma y el conductor cobra su parte del importe bloqueado.
              </Text>
              <PrimaryButton title={svBusy ? 'Cerrando…' : 'Confirmar llegada y cerrar'} onPress={cerrarViaje} disabled={svBusy} loading={svBusy} />
              {sv?.timers.auto_close_at && (
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center' }}>
                  Sin tu confirmación se cerrará solo en{' '}
                  {Math.max(0, Math.round((new Date(sv.timers.auto_close_at).getTime() - Date.now()) / 60000))} min.
                  {' '}¿Ha habido un problema?{' '}
                  <Text onPress={() => setDispOpen(true)} style={{ color: brand.primary, fontWeight: '800' }}>Disputar</Text>
                </Text>
              )}
            </View>
          )}

          {/* ── FASE EN MARCHA (conductor te recogió, viaje in_progress) ──────
              El mapa es el protagonista (ruta + coche animado). Tarjeta MINIMA
              transparente: nombre del conductor, perfil y contacto. Sin PIN,
              sin cancelar ni editar. */}
          {enMarcha && (
            <View pointerEvents="box-none" style={{ paddingVertical: espaciado.e4 }}>
              <View style={[s.card, { backgroundColor: 'rgba(15,20,28,0.45)', borderColor: 'rgba(255,255,255,0.18)', gap: espaciado.e6, alignItems: 'center' }]}>
                <Text style={{ color: brand.white, fontWeight: '900', fontSize: tipografia.body }}>🚗 Viaje en marcha</Text>
                {(() => {
                  const t = (trip ?? {}) as Record<string, any>;
                  const name = String(t.driver_name ?? 'Conductor');
                  const plate = String(t.driver_plate ?? t.vehicle_plate ?? '');
                  const model = String(t.driver_model ?? t.vehicle_model ?? '');
                  const photo = typeof t.driver_photo === 'string' && t.driver_photo && !t.driver_photo.startsWith('captured://') ? absUrl(t.driver_photo) : null;
                  const wa = typeof t.driver_phone === 'string' && t.driver_phone.trim() ? t.driver_phone.replace(/\D/g, '') : null;
                  const tel = wa ? `tel:${wa}` : null;
                  return (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e10 }}>
                        {photo ? (
                          <Image source={{ uri: photo }} style={{ width: 40, height: 40, borderRadius: 20 }} />
                        ) : (
                          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ color: brand.white, fontWeight: '900', fontSize: 18 }}>{(name || 'C').charAt(0).toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: brand.white, fontWeight: '800', fontSize: 15 }} numberOfLines={1}>{name}</Text>
                          <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: tipografia.caption, fontWeight: '600' }}>
                            {[model, plate].filter(Boolean).join(' · ') || 'Conductor'}
                          </Text>
                        </View>
                      </View>
                      {(wa || tel) ? (
                        <View style={{ flexDirection: 'row', gap: espaciado.e8, alignSelf: 'stretch' }}>
                          {tel ? (
                            <Pressable
                              onPress={() => Linking.openURL(tel).catch(() => setError('No se pudo abrir el teléfono.'))}
                              accessibilityRole="button"
                              accessibilityLabel="Llamar al conductor"
                              style={[s.waBtn, { flex: 1, backgroundColor: 'rgba(255,255,255,0.9)' }]}
                            >
                              <Text style={{ color: '#0F141C', fontWeight: '800', fontSize: tipografia.body }}>📞 Llamar</Text>
                            </Pressable>
                          ) : null}
                          {wa ? (
                            <Pressable
                              onPress={() => {
                                const msg = encodeURIComponent('Hola, soy tu pasajero de EG Route Plan. ¿Vamos bien?');
                                Linking.openURL(`https://wa.me/${wa}?text=${msg}`).catch(() => setError('No se pudo abrir WhatsApp.'));
                              }}
                              accessibilityRole="button"
                              accessibilityLabel="Contactar por WhatsApp"
                              style={[s.waBtn, { flex: 2, backgroundColor: brand.whatsapp }]}
                            >
                              <Text style={{ color: brand.white, fontWeight: '800', fontSize: tipografia.body }}>WhatsApp</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      ) : null}
                    </>
                  );
                })()}
              </View>
            </View>
          )}

          {status === 'idle' && distanceKm > 0 && (
            <View style={[s.summaryRow, { backgroundColor: colors.surface }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.summaryOrigin, { color: colors.textPrimary }]} numberOfLines={1}>🟢 {originLabel}</Text>
                <Text style={[s.summaryDest, { color: colors.textPrimary }]} numberOfLines={1}>🟠 {destText || 'Destino'}</Text>
              </View>
              <Text style={[s.summaryKm, { color: colors.textSecondary }]}>
                {etaMin != null ? `${etaMin} min` : '—'} · {distanceKm} km
              </Text>
            </View>
          )}
          {status === 'idle' && routeError && (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <RefreshCw size={14} color={colors.danger} />
              <Text style={{ fontSize: tipografia.caption, color: colors.danger, marginLeft: espaciado.e4, flex: 1 }}>{routeError}</Text>
            </View>
          )}

          {status === 'idle' && (
          <>
          <Text style={s.sectionTitle}>Modalidad de viaje</Text>
          {modesLoading ? (
            <ActivityIndicator style={{ marginVertical: espaciado.e12 }} color={colors.primary} />
          ) : modesError ? (
            <View style={[s.card, { backgroundColor: colors.danger + '08' }]}>
              <Text style={{ fontSize: tipografia.caption, color: colors.danger }}>{modesError}</Text>
              <GhostButton title="Reintentar" onPress={retryModes} />
            </View>
          ) : modes.length === 0 ? (
            <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, marginVertical: espaciado.e8 }}>
              Sin modalidades para esta distancia todavía.
            </Text>
          ) : (
            // Lista vertical estilo DiDi: fila por modalidad con precio a la derecha
            // (ref. flow2.xml / flow3.xml de DiDi: 一口价 + descuento + selección).
            <View style={{ gap: espaciado.e8 }}>
              {modes.map((item) => {
                const active = modeId === item.id;
                const Icon = MODE_ICON[item.id] ?? <CarFront size={20} color={colors.textSecondary} />;
                const cap = item.id === 'minibus' ? 6 : item.id === 'compartido' ? 3 : 0;
                const rowPax = cap > 0 ? Math.min(pax, cap) : pax;
                const rowTotal = item.price != null ? Math.round(item.price * (cap > 0 ? rowPax : 1)) : null;
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => { setModeId(item.id); if (cap > 0 && passengers > cap) setPassengers(cap); }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={`${item.label}, ${rowTotal?.toLocaleString('es') ?? ''} XAF, ${item.etaMin} min`}
                    testID={`taxi-mode-${item.id}`}
                    style={({ pressed }) => [
                      s.modeRow,
                      {
                        backgroundColor: colors.card,
                        borderColor: active ? colors.primary : colors.border,
                        borderWidth: active ? 1.5 : 1,
                        opacity: pressed ? 0.85 : 1,
                      },
                    ]}
                  >
                    <View style={[s.modeIconWrap, { backgroundColor: active ? alphaC(colors.primary, 0.12) : colors.surface }]}>
                      {Icon}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.modeName, { color: colors.textPrimary }]}>{item.label}</Text>
                      <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, marginTop: 1 }}>
                        ⏱ {item.etaMin} min{cap > 0 ? ` · hasta ${cap} plazas` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[s.modePrice, { color: brand.secondary }]}>
                        {rowTotal != null ? `${rowTotal.toLocaleString('es')} XAF` : '—'}
                      </Text>
                      <Text style={{ fontSize: 10, color: active ? colors.primary : colors.textSecondary, fontWeight: '700' }}>
                        {active ? '✓ Seleccionado' : 'Elegir'}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Selector de PASAJEROS (DiDi, 1–6): cambia el total de compartidos */}
          {destCoord && (
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={s.sectionTitle}>Pasajeros</Text>
              <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, marginTop: espaciado.e2 }}>
                {isPool
                  ? `Precio por asiento × ${usedPax} · máx. ${poolCap} en ${mode?.label ?? 'esta modalidad'}`
                  : `Carrera privada · precio por coche${pax > 1 ? ` (${pax} pasajeros)` : ''}`}
              </Text>
              <View style={s.paxRow}>
                {[1, 2, 3, 4, 5, 6].map((n) => {
                  const over = isPool && n > poolCap;
                  const active = n === usedPax;
                  return (
                    <Pressable
                      key={n}
                      onPress={() => setPassengers(n)}
                      disabled={over}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active, disabled: over }}
                      accessibilityLabel={`${n} pasajero${n > 1 ? 's' : ''}${over ? ` (máximo ${poolCap} en ${mode?.label})` : ''}`}
                      style={[s.paxChip, {
                        backgroundColor: active ? alphaC(colors.primary, 0.14) : colors.surface,
                        borderColor: active ? colors.primary : colors.border,
                        opacity: over ? 0.3 : 1,
                      }]}
                    >
                      <Text style={[s.paxNum, { color: active ? colors.primary : colors.textPrimary }]}>{n}</Text>
                      <Text style={{ fontSize: 9, color: active ? colors.primary : colors.textSecondary, fontWeight: '700' }}>
                        {n === 1 ? 'persona' : 'personas'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={s.label}>Tu presupuesto (elige uno) · {budgetMin}–{budgetMax.toLocaleString('es')} XAF · {fareCity}</Text>
            <View style={s.budgetWrap}>
              {budgetOptions.map((v) => {
                const active = Number(userPrice) === v;
                return (
                  <Pressable
                    key={v}
                    onPress={() => setUserPrice(String(v))}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={`${v.toLocaleString('es')} XAF`}
                    style={[s.budgetChip, {
                      backgroundColor: active ? alphaC(brand.secondary, 0.14) : colors.surface,
                      borderColor: active ? brand.secondary : colors.border,
                    }]}
                  >
                    <Text style={[s.budgetTxt, { color: active ? brand.secondary : colors.textPrimary }]}>
                      {v.toLocaleString('es')} XAF
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {userPrice !== '' && !userPriceOk && (
              <Text style={{ fontSize: tipografia.micro, color: colors.danger, marginTop: espaciado.e4 }}>
                El presupuesto debe estar entre {budgetMin} y {budgetMax.toLocaleString('es')} XAF
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e12 }}>
              <View style={[s.priceBox, { backgroundColor: colors.surface }]}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: colors.textPrimary }}>
                  {suggestedTotal != null ? `${suggestedTotal.toLocaleString('es')} XAF` : '—'}
                </Text>
                <Text style={{ fontSize: 10, color: colors.textSecondary }}>
                  Precio {mode?.label}{isPool ? ` × ${usedPax}` : ''}
                </Text>
                <Text style={{ fontSize: 10, color: colors.primary, fontWeight: '700' }}>{distanceKm || '—'} km · {etaMin != null ? `${etaMin} min` : '—'}</Text>
              </View>
              <View style={[s.priceBox, { backgroundColor: colors.surface }]}>
                <Text style={{ fontSize: 17, fontWeight: '800', color: userPriceOk ? brand.secondary : colors.textSecondary }}>
                  {userPriceOk ? `${up.toLocaleString('es')} XAF` : '—'}
                </Text>
                <Text style={{ fontSize: 10, color: colors.textSecondary }}>Tu presupuesto</Text>
                <Text style={{ fontSize: 10, color: colors.textSecondary }}>{budgetMin}–{budgetMax.toLocaleString('es')} XAF</Text>
              </View>
            </View>
          </View>
          </>
          )}

          {(status === 'cancelled' || status === 'completed') && (
            <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, alignItems: 'center' }]}>
              <Text style={{ fontSize: tipografia.subtitle, fontWeight: '800', color: colors.textPrimary }}>{st?.t}</Text>
              {tripId && <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e4 }}>Ref: {tripId.slice(0, 8)}</Text>}
              {/* P1-c: resumen de la liquidación + puerta de disputa (7 días). */}
              {sv && (sv.state === 'settled' || sv.state === 'disputed') && sv.kind === 'WALLET' && (
                <View style={{ alignSelf: 'stretch', gap: espaciado.e4, padding: espaciado.e10, borderRadius: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, marginTop: espaciado.e6 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }}>
                    {sv.state === 'disputed' ? '⚖️ Viaje en disputa (en revisión)' : 'Liquidación del viaje'}
                  </Text>
                  {sv.money.released && (
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
                      Tarifa {Number(sv.fare).toLocaleString('es')} · comisión {Number(sv.fee).toLocaleString('es')} · al conductor {Number(sv.net).toLocaleString('es')} XAF
                    </Text>
                  )}
                  {sv.state === 'settled' && (
                    <Text onPress={() => setDispOpen(true)} style={{ color: brand.primary, fontSize: tipografia.caption, fontWeight: '800' }}>
                      ¿Problemas con el viaje? Disputar (hasta 7 días)
                    </Text>
                  )}
                </View>
              )}
              {status === 'completed' && (
                <GhostButton
                  title="Puntuar mi viaje"
                  onPress={() => { setRatingScore(5); setRatingComment(''); setRatingOpen(true); }}
                />
              )}
              <GhostButton title="Ir al inicio" onPress={() => router.replace('/' as never)} />
            </View>
          )}
        </ScrollView>

        {status === 'idle' && (
          <View style={[s.footer, { borderTopColor: colors.border }]}>
            {promoNote && (
              <Text style={{ textAlign: 'center', fontSize: tipografia.caption, color: colors.success, fontWeight: '800', marginBottom: espaciado.e6 }}>
                {promoNote}
              </Text>
            )}
            <PrimaryButton
              title={busy ? 'Enviando…' : userPriceOk ? `Confirmar taxi · ${finalPrice.toLocaleString('es')} XAF` : 'Confirmar taxi'}
              onPress={confirmar}
              disabled={!canConfirm || busy}
              loading={busy}
            />
            {!destCoord && destText.trim() !== '' && (
              <Text style={{ textAlign: 'center', fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e6 }}>
                Toca el mapa para fijar el destino y poder confirmar.
              </Text>
            )}
            {!userPriceOk && (
              <Text style={{ textAlign: 'center', fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e6 }}>
                Elige tu presupuesto ({budgetMin}–{budgetMax.toLocaleString('es')} XAF en {fareCity}) para confirmar.
              </Text>
            )}
            {!isAuthenticated && (
              <Text style={{ textAlign: 'center', fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e6 }}>
                Al confirmar crearás tu cuenta.
              </Text>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      {/* Modal de motivos de cancelación (DiDi): elegir motivo = CANCELAR el
          viaje de inmediato y volver al panel de pedir taxi. */}
      <Modal visible={cancelOpen} transparent animationType="fade" onRequestClose={() => { if (!cancelBusy) setCancelOpen(false); }}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '900', textAlign: 'center' }}>
              ¿Por qué cancelas el viaje?
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', marginTop: espaciado.e4 }}>
              {cancelBusy ? 'Cancelando el viaje…' : 'Tu conductor será liberado y podrá atender a otros pasajeros.'}
            </Text>
            {cancelBusy ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: espaciado.e18 }} />
            ) : (
              <View style={{ gap: espaciado.e8, marginTop: espaciado.e14 }}>
                {REJECT_REASONS.map((r) => (
                  <Pressable
                    key={r}
                    onPress={() => cancelWithReason(r)}
                    accessibilityRole="button"
                    accessibilityLabel={`Cancelar el viaje · Motivo: ${r}`}
                    style={[s.reasonRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '700' }}>{r}</Text>
                  </Pressable>
                ))}
              </View>
            )}
            <GhostButton title="Volver" onPress={() => setCancelOpen(false)} disabled={cancelBusy} />
          </View>
        </View>
      </Modal>

      {/* P1e: valorar al conductor al terminar el viaje (1–5 estrellas). */}
      <Modal visible={ratingOpen} transparent animationType="fade" onRequestClose={() => { if (!ratingBusy) setRatingOpen(false); }}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '900', textAlign: 'center' }}>
              ¿Cómo fue tu viaje?
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', marginTop: espaciado.e4 }}>
              Valora a tu conductor (también le sirve de referencia a otros pasajeros).
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: espaciado.e10, marginTop: espaciado.e16 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setRatingScore(n)}
                  disabled={ratingBusy}
                  accessibilityRole="button"
                  accessibilityLabel={`${n} de 5 estrellas`}
                  hitSlop={6}
                >
                  <Star size={34} color={n <= ratingScore ? brand.warning : colors.border} fill={n <= ratingScore ? brand.warning : 'transparent'} />
                </Pressable>
              ))}
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, textAlign: 'center', marginTop: espaciado.e6, fontWeight: '700' }}>
              {ratingScore >= 4 ? '¡Excelente! 🎉' : ratingScore === 3 ? 'Bien, gracias 😊' : 'Gracias por tu honestidad 🙏'}
            </Text>
            <TextInput
              style={[s.ratingInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
              placeholder="Comentario opcional…"
              placeholderTextColor={colors.textSecondary}
              value={ratingComment}
              onChangeText={setRatingComment}
              editable={!ratingBusy}
              maxLength={280}
            />
            <View style={{ gap: espaciado.e10, marginTop: espaciado.e12 }}>
              <PrimaryButton
                title={ratingBusy ? 'Enviando…' : 'Enviar valoración'}
                onPress={async () => {
                  if (!tripId || ratingBusy) return;
                  setRatingBusy(true);
                  try {
                    await taxiApi.rateTrip(tripId, ratingScore, ratingComment.trim() || undefined);
                    // P5: al puntuar → volver al Home.
                    setRatingOpen(false);
                    router.replace('/' as never);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'No se pudo enviar la valoración');
                    setRatingOpen(false);
                  } finally { setRatingBusy(false); }
                }}
                disabled={ratingBusy}
                loading={ratingBusy}
              />
              <GhostButton
                title="Ahora no"
                onPress={() => { setRatingOpen(false); router.replace('/' as never); }}
                disabled={ratingBusy}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* P1-c: teclado PIN para confirmar el fare (token TRIP + lock en escrow).
          Si el usuario aún no tiene PIN de 6 dígitos, el primer fallo abre el
          alta: contraseña de la cuenta + PIN nuevo (un solo paso). */}
      <Modal visible={pinOpen} transparent animationType="fade" onRequestClose={() => { if (!payBusy) setPinOpen(false); }}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '900', textAlign: 'center' }}>
              Confirmar {Number(sv?.fare ?? 0).toLocaleString('es')} XAF
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', marginTop: espaciado.e4 }}>
              {needSetPin
                ? 'Primer pago: escribe tu contraseña y elige un PIN de 6 dígitos.'
                : 'Introduce tu PIN para bloquear el importe en tu monedero.'}
            </Text>
            {needSetPin && (
              <TextInput
                style={[s.ratingInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary, marginTop: espaciado.e12 }]}
                placeholder="Contraseña de tu cuenta"
                placeholderTextColor={colors.textSecondary}
                value={pwdValue}
                onChangeText={setPwdValue}
                secureTextEntry
                autoCorrect={false}
                editable={!payBusy}
              />
            )}
            <TextInput
              style={[s.ratingInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary, marginTop: needSetPin ? 8 : 12, textAlign: 'center', fontSize: 22, letterSpacing: 8 }]}
              placeholder="••••••"
              placeholderTextColor={colors.textSecondary}
              value={pinValue}
              onChangeText={(t) => setPinValue(t.replace(/\D/g, '').slice(0, 6))}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
              editable={!payBusy}
              autoFocus
            />
            {payErr && (
              <Text style={{ color: brand.danger, fontSize: tipografia.caption, textAlign: 'center', marginTop: espaciado.e8 }}>{payErr}</Text>
            )}
            {payBusy ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: espaciado.e18 }} />
            ) : (
              <View style={{ gap: espaciado.e10, marginTop: espaciado.e14 }}>
                <PrimaryButton
                  title={needSetPin ? 'Guardar PIN y pagar' : 'Pagar ahora'}
                  onPress={confirmarPago}
                  disabled={pinValue.length !== 6 || (needSetPin && pwdValue.length < 4)}
                />
                <GhostButton title="Volver" onPress={() => setPinOpen(false)} />
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* P1-c: disputa del viaje (ventana de 7 días tras el cierre). */}
      <Modal visible={dispOpen} transparent animationType="fade" onRequestClose={() => { if (!dispBusy) setDispOpen(false); }}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '900', textAlign: 'center' }}>
              Disputar este viaje
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', marginTop: espaciado.e4 }}>
              Cuéntanos qué pasó. Mientras el soporte revisa la disputa el dinero no se mueve; si tienes razón, te devolvemos el importe completo.
            </Text>
            <TextInput
              style={[s.ratingInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary, marginTop: espaciado.e12, minHeight: 72 }]}
              placeholder="Motivo (mínimo 10 caracteres)…"
              placeholderTextColor={colors.textSecondary}
              value={dispReason}
              onChangeText={setDispReason}
              multiline
              maxLength={280}
              editable={!dispBusy}
            />
            {dispBusy ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: espaciado.e18 }} />
            ) : (
              <View style={{ gap: espaciado.e10, marginTop: espaciado.e12 }}>
                <PrimaryButton title="Enviar disputa" onPress={disputar} disabled={dispReason.trim().length < 10} />
                <GhostButton title="Volver" onPress={() => setDispOpen(false)} />
              </View>
            )}
          </View>
        </View>
      </Modal>

      {busy && <ActivityIndicator color={colors.primary} style={s.loading} />}
    </View>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.background },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e8 },
    title: { fontSize: 18, fontWeight: '800', color: c.textPrimary },
    banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: espaciado.e16, marginBottom: espaciado.e4, borderRadius: radios.sm, paddingVertical: espaciado.e8, paddingHorizontal: espaciado.e12 },
    statusChip: { alignSelf: 'center', borderRadius: radios.full, paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e8, marginBottom: espaciado.e4 },
    mapHint: { position: 'absolute', top: 120, alignSelf: 'center', borderRadius: radios.full, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e6 },
    // Tarjeta flotante origen → destino (DiDi): compacta, sobre el mapa.
    topCard: {
      position: 'absolute', top: 4, left: 10, right: 10,
      borderRadius: 18, borderWidth: 1, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e4,
      ...elevation.md,
    },
    topCardHeader: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 },
    backBtn: { padding: espaciado.e2, marginRight: espaciado.e2 },
    topCardRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, minHeight: 27 },
    stopIconBox: { width: 15, alignItems: 'center' },
    stopDot: { width: 10, height: 10, borderRadius: 5 },
    connectorRow: { width: 2, height: 8, marginLeft: espaciado.e7, marginVertical: 1, borderRadius: 1 },
    connectorGap: { height: 26, marginVertical: 0 },
    connectorCol: { width: 16, height: '100%', alignItems: 'center', justifyContent: 'center', position: 'relative' },
    connectorVLine: { position: 'absolute', left: 7, top: 0, bottom: 0, width: 2, borderRadius: 1 },
    swapBtn: { width: 24, height: 24, borderRadius: radios.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', zIndex: 2, elevation: 3 },
    stopLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
    stopValue: { fontSize: tipografia.body, fontWeight: '700', marginLeft: espaciado.e2 },
    stopValueDest: { fontSize: tipografia.body, fontWeight: '800', marginLeft: espaciado.e2 },
    mapPickBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginLeft: espaciado.e4 },
    // FAB centrar (abajo-derecha sobre el mapa, visible al colapsar panel)
    mapFabRow: { position: 'absolute', right: 14, bottom: 84 },
    mapFab: { borderRadius: 30, borderWidth: 1, padding: espaciado.e11, ...elevation.md },
    // Panel inferior superpuesto: NO empuja el mapa (DiDi).
    panel: {
      position: 'absolute', left: 0, right: 0, bottom: 0,
      maxHeight: '46%', borderTopLeftRadius: 22, borderTopRightRadius: 22,
      paddingTop: espaciado.e2,
      ...elevation.lg,
    },
    askDestBanner: { alignSelf: 'center', borderRadius: radios.full, paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e7, marginVertical: espaciado.e6 },
    summaryRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, borderRadius: 14, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e9 },
    summaryOrigin: { fontSize: tipografia.body, fontWeight: '700' },
    summaryDest: { fontSize: tipografia.body, fontWeight: '800', marginTop: espaciado.e2 },
    summaryKm: { fontSize: 15, fontWeight: '800' },
    content: { padding: espaciado.e16, paddingBottom: espaciado.e14, gap: espaciado.e12 },
    card: { borderRadius: radios.lg, padding: espaciado.e14, borderWidth: 1 },
    label: { fontSize: tipografia.caption, fontWeight: '700', color: c.textSecondary },
    input: { fontSize: 15, padding: 0, marginTop: espaciado.e4 },
    sectionTitle: { fontSize: 15, fontWeight: '800', color: c.textPrimary, marginTop: espaciado.e2 },
    modeRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, borderRadius: radios.lg, padding: espaciado.e12 },
    modeIconWrap: { width: 40, height: 40, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center' },
    modeName: { fontSize: 15, fontWeight: '800' },
    modePrice: { fontSize: 17, fontWeight: '800' },
    avatar: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
    carThumb: { width: 34, height: 26, borderRadius: 6, overflow: 'hidden', backgroundColor: '#EAEAEA' },
    colorSwatch: { width: 12, height: 12, borderRadius: 6, borderWidth: 0.6, borderColor: 'rgba(0,0,0,0.2)' },
    waBtn: { borderRadius: 14, paddingVertical: espaciado.e12, alignItems: 'center', marginTop: espaciado.e2 },
    cancelLink: { borderRadius: radios.full, borderWidth: 1, paddingVertical: espaciado.e7, paddingHorizontal: espaciado.e18, alignSelf: 'center', marginTop: espaciado.e2 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e24 },
    modalCard: { width: '100%', maxWidth: 420, borderRadius: 20, borderWidth: 1, padding: espaciado.e20 },
    ratingInput: { borderRadius: radios.md, borderWidth: 1, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10, fontSize: tipografia.body, marginTop: espaciado.e12, minHeight: 46 },
    reasonRow: { borderRadius: radios.md, borderWidth: 1, paddingVertical: espaciado.e13, paddingHorizontal: espaciado.e14 },
    paxRow: { flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e10 },
    paxChip: { flex: 1, alignItems: 'center', borderRadius: radios.md, borderWidth: 1.5, paddingVertical: espaciado.e8, gap: 1 },
    paxNum: { fontSize: tipografia.subtitle, fontWeight: '900' },
    budgetWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8, marginTop: espaciado.e8 },
    budgetChip: { borderRadius: radios.full, borderWidth: 1.2, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7 },
    budgetTxt: { fontSize: tipografia.body, fontWeight: '800' },
    priceRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, borderWidth: 1, borderRadius: radios.md, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8, marginTop: espaciado.e6 },
    priceBox: { flex: 1, borderRadius: radios.md, padding: espaciado.e10, alignItems: 'center' },
    // Matrícula DESTACADA del coche (estilo placa, P1).
    plateBox: { alignSelf: 'center', borderWidth: 1.5, borderColor: '#2B2F36', borderRadius: 6, paddingHorizontal: espaciado.e18, paddingVertical: espaciado.e5, backgroundColor: '#F5F7FA', marginTop: espaciado.e2 },
    plateTxt: { fontSize: 19, fontWeight: '900', letterSpacing: 2, color: '#14171C' },
    footer: { padding: espaciado.e14, paddingBottom: espaciado.e18, borderTopWidth: 1 },
    loading: { position: 'absolute', top: '50%', alignSelf: 'center' },
  });
