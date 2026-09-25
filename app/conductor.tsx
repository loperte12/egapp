/**
 * ConductorScreen — pantalla principal del conductor (Uber Driver · EG Route Plan).
 * Estado A: oferta entrante (15 s, badge modalidad, ganancia neta −10%,
 *           elegir precio, botón gigante aceptar).
 * Estado B: en ruta (panel pasajero + llamar/WhatsApp + terminar viaje).
 * Backend unificado: /wallet/api/v1/mobility/trips/driver + accept + status.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { sayNavigation, stopAllVoice } from '../api/voice';
import {
  ArrowLeft, BadgeCheck, Banknote, Box, Bus, Camera, CarFront, CheckCircle2, ChevronDown, ChevronUp, Compass, Flag, MessageCircle, Navigation, Phone, ShieldCheck, Star, Tag,
  Users, User, UserRound, MapPin, Siren, Volume2, VolumeX, X,
} from 'lucide-react-native';
import { alpha, altura, CameraCapture, elevation, espaciado, GhostButton, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import EmergencyModal from '../components/EmergencyModal';
import DriverHomeSheet, { type HomeTab } from '../components/DriverHomeSheet';
import { EgMapView, EgCamera, EgMarkers, EgRoutePolyline, type EgMapViewHandle, type Coord } from '../packages/map';
import { taxiApi } from '../api/taxi';
import { settlementApi } from '../api/settlement';
import { driverApi } from '../api/driver';
import { getGqPositionIfAllowed } from '../api/locate';
import { isNightGq } from '../api/nightMode';
import { MALABO_CENTER } from '../constants/geo';
import { heatZonesNear } from '../constants/heatZones';

import { OSRM_BASE } from '../api/config';
import { brand } from '@egrouteplan/ui-kit';

const OSRM = OSRM_BASE;
const COMMISSION = 0.10; // 10% comisión de la app
const OFFER_SECONDS = 15;
/** Velocidad de la SIMULACIÓN de avance cuando no hay GPS real (pruebas). */
const SIM_KMH = 45;

/** Distancia aproximada en metros entre dos [lon,lat] (equirrectangular). */
function distM(a: Coord, b: Coord): number {
  const dLat = (b[1] - a[1]) * 111320;
  const dLon = (b[0] - a[0]) * 111320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLon * dLon);
}

/** Punto de la ruta a `meters` del inicio (interpolado entre vértices). */
function pointAt(coords: Coord[], cum: number[], meters: number): Coord {
  const total = cum[cum.length - 1];
  let m = Math.max(0, Math.min(meters, total));
  let i = 1;
  while (i < cum.length - 1 && cum[i] < m) i++;
  const segLen = cum[i] - cum[i - 1] || 1;
  const f = (m - cum[i - 1]) / segLen;
  const a = coords[i - 1];
  const b = coords[i];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
}

/** Metros recorridos desde el inicio hasta el punto de la polilínea más
 *  cercano al vehículo (proyección sobre los vértices). */
function alongAt(coords: Coord[], cum: number[], pt: Coord): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < coords.length; i++) {
    const d = distM(coords[i], pt);
    if (d < bestD) { bestD = d; best = cum[i]; }
  }
  return best;
}

/** Rumbo (0=norte, 90=este) entre dos puntos, en grados. */
function headingDeg(a: Coord, b: Coord): number {
  const dLng = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
  const dLat = b[1] - a[1];
  if (Math.abs(dLng) < 1e-9 && Math.abs(dLat) < 1e-9) return NaN;
  return (Math.atan2(dLng, dLat) * 180) / Math.PI;
}

/** Punto desplazado `meters` hacia adelante según el rumbo (grados, 0=norte).
 *  Con heading-up, centramos la cámara POR DELANTE del coche para que el
 *  coche quede en el tercio inferior de la pantalla (vista "sumergida", no
 *  aérea centrada). */
function pointShift(p: Coord, heading: number, meters: number): Coord {
  const r = (heading * Math.PI) / 180;
  const dLat = (meters * Math.cos(r)) / 111320;
  const dLng = (meters * Math.sin(r)) / (111320 * Math.cos((p[1] * Math.PI) / 180));
  return [p[0] + dLng, p[1] + dLat];
}

/** Zoom de conducción "sumergido" según velocidad: en ciudad MUY cerca
 *  (16.4–17.0), solo en vía rápida/carretera se abre (14.2) para ver la salida.
 *  NUNCA se ve toda la ciudad: el conductor mira la calle, no el mapa. */
function navZoomBySpeed(speedKmh: number): number {
  if (speedKmh >= 75) return 14.2;
  if (speedKmh >= 50) return 15.6;
  if (speedKmh >= 25) return 16.4;
  return 17.0;
}

/** Metros a los que colocamos el centro de la cámara POR DELANTE del coche
 *  (look-ahead) para que el coche quede en el TERCIO INFERIOR de la pantalla.
 *  Se ajusta en bucle cerrado con el cy que devuelve la página (ver navTick
 *  y onNavState): con pitch 60° un look-ahead fijo proyecta el coche fuera
 *  del borde inferior. */
function navLookAheadMeters(zoom: number): number {
  if (zoom >= 16.6) return 260;
  if (zoom >= 16.3) return 300;
  if (zoom >= 16.0) return 340;
  if (zoom >= 15.5) return 420;
  return 520;
}
function clampLookAhead(v: number): number {
  return Math.min(900, Math.max(90, Math.round(v)));
}

/** Emoji/icono legible de la maniobra para el cajetín. */
function turnGlyph(type: string, modifier: string): string {
  const m = (modifier || '').toLowerCase();
  const t = (type || '').toLowerCase();
  if (t === 'depart' || t === 'arrive' || t === 'end of road') return t === 'depart' ? '🚗' : t === 'arrive' ? '🏁' : '↗️';
  if (t === 'roundabout' || t === 'rotary' || t === 'exit roundabout') return '↻';
  if (t === 'merge' || t === 'fork' || t === 'on ramp' || t === 'off ramp') return t.indexOf('ramp') > 0 ? '↗️' : '↔️';
  if (m.indexOf('uturn') >= 0 || m.indexOf('u-turn') >= 0) return '🔃';
  if (m === 'sharp left') return '↰';
  if (m === 'sharp right') return '↱';
  if (m === 'slight left' || m === 'left') return '⬅️';
  if (m === 'slight right' || m === 'right') return '➡️';
  if (m === 'straight' || t === 'new name' || t === 'continue') return '⬆️';
  return '🔄';
}

/** Frase hablada en español para una maniobra (turn-by-turn).
 *  · distMeters >= 150 → frase LARGA con la distancia ("En 300 metros…").
 *  · distMeters < 150  → frase CORTA al acercarse ("Gira a la izquierda…").
 *  OJO (auditoría voz 2026-09-08): 'end of road' NO es "llegar al destino":
 *  es una maniobra normal (la vía acaba y hay que girar) → se guía por su
 *  modifier (izquierda/derecha). El destino real solo llega con type 'arrive',
 *  que se maneja aparte (según tramo: recogida vs destino). */
function turnVoice(type: string, modifier: string, name: string, distMeters: number): string {
  const m = (modifier || '').toLowerCase();
  const t = (type || '').toLowerCase();
  let action = '';
  if (m.indexOf('uturn') >= 0) action = 'haz un cambio de sentido';
  else if (m === 'sharp left' || m === 'left' || m === 'slight left') action = 'gira a la izquierda';
  else if (m === 'sharp right' || m === 'right' || m === 'slight right') action = 'gira a la derecha';
  else if (m === 'straight' || t === 'continue' || t === 'new name') action = 'continúa recto';
  else if (t === 'end of road') {
    action = m.indexOf('left') >= 0
      ? 'gira a la izquierda al final de la vía'
      : m.indexOf('right') >= 0
        ? 'gira a la derecha al final de la vía'
        : 'al final de la vía, gira';
  }
  else if (t === 'rotary' || t === 'roundabout' || t === 'exit roundabout') action = 'toma la rotonda';
  else if (t.indexOf('ramp') >= 0) action = 'incorpórate a la vía';
  else if (t === 'depart') action = 'comienza la ruta';
  else action = 'sigue las indicaciones';
  const street = (name || '').trim();
  let sentence = '';
  if (distMeters >= 150) sentence = `En ${Math.round(distMeters)} metros, ${action}`;
  else sentence = action;
  if (street) sentence += ` por ${street}`;
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}

/** PIN de confirmación (últimos 4 dígitos del teléfono del pasajero). */
function pinLast4(p?: string | null): string {
  const d = (p || '').replace(/\D/g, '');
  return d.length >= 4 ? d.slice(-4) : d.padStart(4, '0');
}

interface Offer {
  id: string;
  pickup_lat: string; pickup_lng: string; pickup_address?: string;
  dropoff_lat: string; dropoff_lng: string; dropoff_address?: string;
  modality?: string;
  requested_price?: string;
  algorithm_price?: string;
  final_price?: string;
  // P1-c liquidación: qué se pactó y cuánto se cobra neto al cerrar.
  city?: string | null;
  settlement_kind?: string | null;
  payment_locked_at?: string | null;
  fee_info?: { fee?: number; scope?: string } | null;
  arrived_at?: string | null;
  status: string;
  passenger_name?: string;
  passenger_rating?: string;
  passenger_phone?: string;
  // P2: historial y confianza del pasajero + nº de asientos pedidos.
  passenger_trips?: string | number | null;
  passenger_trust?: string | number | null;
  is_pool?: boolean;
  max_pool_seats?: string | number | null;
}

/** Radar de búsqueda del conductor (rediseño): PIN central + ondas de radar y
 *  un barrido girando 360° a su alrededor. Compacto, translúcido, sobre el mapa. */
function SearchSpin({ color }: { color: string }) {
  const r = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const l = Animated.loop(Animated.timing(r, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true }));
    l.start();
    return () => l.stop();
  }, [r]);
  const spin = r.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const S = 84; // contenedor del barrido
  return (
    <View style={{ width: S, height: S, alignItems: 'center', justifyContent: 'center' }}>
      {/* ondas de radar estáticas */}
      <View style={{ position: 'absolute', width: S * 0.72, height: S * 0.72, borderRadius: S * 0.36, borderWidth: trazo.fino, borderColor: color + '59' }} />
      <View style={{ position: 'absolute', width: S, height: S, borderRadius: S / 2, borderWidth: trazo.fino, borderColor: color + '2E' }} />
      {/* barrido 360° (línea desde el centro hacia el borde, rotando) */}
      <Animated.View style={{ position: 'absolute', width: S, height: S, transform: [{ rotate: spin }] }}>
        <View style={{ position: 'absolute', left: S / 2, top: S / 2 - 1, width: S / 2, height: 2, backgroundColor: color, opacity: 0.85 }} />
      </Animated.View>
      {/* PIN central (la zona de búsqueda) */}
      <View style={{ width: 34, height: 34, borderRadius: radios.full, backgroundColor: color, alignItems: 'center', justifyContent: 'center', elevation: 4 }}>
        <MapPin size={17} color={brand.white} strokeWidth={2.6} />
      </View>
    </View>
  );
}

export default function ConductorScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const mapRef = useRef<EgMapViewHandle>(null);

  const [offers, setOffers] = useState<Offer[]>([]);
  const [current, setCurrent] = useState<Offer | null>(null); // oferta en pantalla
  const [phase, setPhase] = useState<'waiting' | 'offer' | 'ruta'>('waiting');
  const [chosenPrice, setChosenPrice] = useState<number | null>(null);
  const [routeCoords, setRouteCoords] = useState<Coord[]>([]);
  const [eta, setEta] = useState('—');
  const [km, setKm] = useState('—');
  // ── Navegación: posición del vehículo, progreso y seguimiento de cámara ──
  const [vehiclePos, setVehiclePos] = useState<Coord | null>(null);
  const [navKmLeft, setNavKmLeft] = useState<number | null>(null);
  const [navMinLeft, setNavMinLeft] = useState<number | null>(null);
  const [followNav, setFollowNav] = useState(true);
  // Tarjetas compactas por defecto: el mapa debe seguir siendo protagonista.
  const [cardExpanded, setCardExpanded] = useState(false);
  const [leg, setLeg] = useState<'approach' | 'trip'>('approach');
  const anchorRef = useRef<Coord>(MALABO_CENTER);
  const tripPolyRef = useRef<Coord[]>([]);
  // ── Vista de conducción ──
  const [navSpeed, setNavSpeed] = useState(0);            // km/h
  const [navDist, setNavDist] = useState<number>(0);      // metros hasta siguiente maniobra
  const [navTurn, setNavTurn] = useState<{ name: string; dist: number; type: string; modifier: string } | null>(null);
  const [navTurn2, setNavTurn2] = useState<{ name: string; dist: number; type: string; modifier: string } | null>(null);
  const [navRoad, setNavRoad] = useState(''); // calle actual ("Estás en …")
  const [headingUp, setHeadingUp] = useState(true);
  // 2.5D AUTOMÁTICO al conducir (aprobado): pitch ~55 (más horizonte: se
  // aprecian los carriles lejanos) + heading-up + zoom 16.0-16.5.
  const [pitch3D, setPitch3D] = useState(true);
  const NAV_PITCH = 55; // inclinación 2.5D (0 = cenital)
  const [voiceOn, setVoiceOn] = useState(true);
  const lastHeadingRef = useRef<number | undefined>(undefined);
  const smoothHeadingRef = useRef<number | undefined>(undefined);
  const lastCenterRef = useRef<Coord | null>(null);
  const lastLocReportRef = useRef(0);
  const lastCamSentRef = useRef(0);
  const userZoomRef = useRef<number | undefined>(undefined);
  const [navDbg, setNavDbg] = useState<{ bearing: number; pitch: number; zoom: number; cy?: number } | null>(null);
  // Look-ahead ADAPTATIVO: la página reporta cy (posición vertical 0..1 donde
  // proyecta el coche); con pitch 60° un valor fijo lo saca del borde inferior,
  // así que se corrige en cada navstate para mantener el coche en el tercio
  // inferior (cy objetivo ≈ 0.78–0.86).
  const lookAheadRef = useRef<number>(navLookAheadMeters(16.2));
  const stepsRef = useRef<Array<{ dist: number; name: string; type: string; modifier: string }>>([]);
  // spokenRef: índice anunciado. spokenStage: 0=nada, 1=ya se anunció LEJOS
  // (con distancia), 2=ya se anunció CERCA ("gira ya") → máximo 2 avisos por
  // maniobra (patrón DiDi: "gira en 300 m" → "gira a la izquierda").
  const spokenRef = useRef(-1);
  const spokenStage = useRef<Record<number, number>>({});
  const lastFixRef = useRef<{ p: Coord; t: number } | null>(null);
  const cumRef = useRef<number[]>([]);
  const totalRef = useRef(0);
  const simTravRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  // Aviso NO-error (p. ej. "El pasajero canceló el viaje"): pill temporal.
  const [rutaNotice, setRutaNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [driverStatus, setDriverStatus] = useState<'none' | 'pending' | 'approved' | 'rejected' | 'checking'>('checking');
  const [online, setOnline] = useState(false);
  const [resting, setResting] = useState(false); // DESCANSO: sin solicitudes, sin selfie al volver
  const [selfieOpen, setSelfieOpen] = useState(false);
  const [selfieErr, setSelfieErr] = useState<string | null>(null);
  const [emergencyOpen, setEmergencyOpen] = useState(false);
  const [workMode, setWorkMode] = useState<'city' | 'intercity' | 'both'>('both');
  const [expiryWarnings, setExpiryWarnings] = useState<string[]>([]);
  // ── P4 EFECTIVO: bloqueo por cobro no confirmado al terminar el viaje ─────
  const [cashOpen, setCashOpen] = useState(false);          // modal "¿Recibiste el dinero?"
  const [blockedCash, setBlockedCash] = useState(false);    // cobro pendiente → sin solicitudes
  const [blockedCashTrip, setBlockedCashTrip] = useState<string | null>(null);
  const [fareTotal, setFareTotal] = useState(0);            // precio final aceptado (sello)
  const [tripExpanded, setTripExpanded] = useState(false);  // tarjeta del viaje: "Más"
  // ── P1 HOME conductor: bottom-sheet de 3 pestañas ─────────────────────────
  const [homeOpen, setHomeOpen] = useState(false);
  const [homeTab, setHomeTab] = useState<HomeTab>('flujo');
  // ── P3 ZONAS CALIENTES (simulación visual) ────────────────────────────────
  const [heatOn, setHeatOn] = useState(false);
  // ── Código del pasajero en la RECOGIDA (validación de 4 dígitos) ─────────
  const [pinOpen, setPinOpen] = useState(false);

  /** Activa/desactiva las zonas calientes simuladas (círculos de demanda).
   *  SOLO visual por ahora (decisión del dueño): sin datos reales aún. */
  const toggleHeat = () => {
    const nv = !heatOn;
    setHeatOn(nv);
    const base = anchorRef.current ?? MALABO_CENTER;
    mapRef.current?.setHeatZones?.(nv ? heatZonesNear(base[0], base[1]) : []);
  };

  // Gate: primero el alta (cuenta + documentos) y luego la identidad al salir en línea.
  useEffect(() => {
    (async () => {
      try {
        const st = await driverApi.status();
        setDriverStatus(st.status);
        // En línea SOLO si status active y NO en descanso (resting es columna
        // propia: status sigue 'active' por el CHECK de la tabla).
        setOnline(!!st.driver && st.driver.status === 'active');
        setResting(!!st.driver?.resting);
        setWorkMode((st.driver?.work_mode as 'city' | 'intercity' | 'both') ?? 'both');
        // P4: si hay un cobro sin confirmar en el servidor → bloqueado.
        const blocked = !!(st.driver as any)?.cash_blocked_at;
        setBlockedCash(blocked);
        if (blocked) setBlockedCashTrip(((st.driver as any)?.cash_blocked_trip as string) ?? null);
      } catch { setDriverStatus('none'); }
      driverApi.expiries().then((r) => {
        const warn = r.expiries
          .filter((e) => e.status !== 'ok')
          .map((e) => `${e.label}: ${e.status === 'expired' ? 'VENCIDO' : `caduca en ${e.daysLeft} días`}`);
        setExpiryWarnings(warn);
      }).catch(() => {});
    })();
  }, []);

  // Countdown 15s (barra de progreso)
  const countdown = useRef(new Animated.Value(1)).current;
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startCountdown = useCallback(() => {
    countdown.setValue(1);
    Animated.timing(countdown, { toValue: 0, duration: OFFER_SECONDS * 1000, useNativeDriver: false }).start();
    if (countdownRef.current) clearInterval(countdownRef.current);
    // Al expirar → la oferta desaparece (queda en backend para otros conductores)
    countdownRef.current = setInterval(() => {
      setPhase('waiting');
      setCurrent(null);
      clearInterval(countdownRef.current!);
    }, OFFER_SECONDS * 1000);
  }, [countdown]);

  // Polling de solicitudes
  const load = useCallback(async () => {
    if (workMode === 'intercity') return; // hoy no recibe solicitudes de ciudad
    if (!online) {
      // Desconectado: no procesar ofertas (solo estado "No estás en línea").
      setPhase('waiting');
      setCurrent(null);
      setOffers([]);
      return;
    }
    if (blockedCash) {
      // P4: cobro sin confirmar → el servidor rechaza aceptar; no mostramos ofertas.
      setPhase('waiting');
      setCurrent(null);
      setOffers([]);
      return;
    }
    try {
      const list = await taxiApi.driverTrips();
      const trips = (Array.isArray(list) ? list : []) as Offer[];
      setOffers(trips);
      // CANCELACIÓN REMOTA (pasajero): si estamos en ruta con un viaje propio
      // y el servidor ya lo marca 'cancelled' (el pasajero canceló desde su
      // app), salimos de la ruta de inmediato con un aviso.
      if (phase === 'ruta' && current) {
        const own = trips.find((t) => t.id === current.id);
        if (own && String(own.status) === 'cancelled') {
          setPhase('waiting'); setCurrent(null); setRouteCoords([]);
          setLeg('approach'); setVehiclePos(null); setTripExpanded(false); setFareTotal(0);
          setRutaNotice('El pasajero canceló el viaje.');
          return;
        }
        // P1-c: viaje con monedero BLOQUEADO mientras estamos en ruta (el
        // pasajero confirma el precio con PIN tarde) → fusionamos los campos de
        // liquidación para que el botón cambie a «He llegado» sin reiniciar nada.
        if (own) {
          const o = own as any; const c = current as any;
          if (o.payment_locked_at !== c.payment_locked_at || o.arrived_at !== c.arrived_at
            || o.settlement_kind !== c.settlement_kind || String(o.status) !== String(c.status)
            || String(o.final_price ?? '') !== String(c.final_price ?? '')) {
            setCurrent((prev) => (prev ? { ...prev,
              status: o.status, payment_locked_at: o.payment_locked_at, arrived_at: o.arrived_at,
              settlement_kind: o.settlement_kind, fee_info: o.fee_info, final_price: o.final_price } as Offer : prev));
          }
        }
        // P1-c: viaje de monedero LIQUIDADO (el pasajero confirmó la llegada o
        // cerró solo a los 10 min) → salir de la ruta anunciando el neto cobrado.
        if (own && String(own.status) === 'completed') {
          const bruto = Number((current as any).final_price ?? 0);
          const comi = Number(((current as any).fee_info?.fee ?? (own as any).fee_info?.fee ?? 0));
          setPhase('waiting'); setCurrent(null); setRouteCoords([]);
          setLeg('approach'); setVehiclePos(null); setTripExpanded(false); setFareTotal(0);
          setRutaNotice(comi > 0
            ? `Viaje cerrado y liquidado: ${Math.max(0, bruto - comi).toLocaleString('es')} XAF netos (comisión ${comi.toLocaleString('es')} XAF).`
            : 'Viaje cerrado: cobra en efectivo al pasajero.');
          return;
        }
      }
      // Estado A: oferta entrante (la más reciente 'requested')
      if (phase !== 'ruta') {
        const open = trips.find((t) => t.status === 'requested');
        if (open && (!current || current.id !== open.id)) {
          setCurrent(open);
          setChosenPrice(Number(open.algorithm_price) ?? Number(open.requested_price) ?? null);
          setPhase('offer');
          startCountdown();
          fetchRoute(open);
        } else if (!open && phase === 'offer') {
          setPhase('waiting');
          setCurrent(null);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red');
    }
  }, [phase, current, startCountdown, workMode, online, blockedCash]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => { clearInterval(t); if (countdownRef.current) clearInterval(countdownRef.current); };
  }, [load]);

  // El aviso (p. ej. "El pasajero canceló el viaje") se auto-borra a los 6 s.
  useEffect(() => {
    if (!rutaNotice) return;
    const t = setTimeout(() => setRutaNotice(null), 6000);
    return () => clearTimeout(t);
  }, [rutaNotice]);

  // Ruta OSRM desde las coordenadas de la oferta
  const fetchRoute = useCallback(async (o: Offer) => {
    const from: Coord = [Number(o.pickup_lng), Number(o.pickup_lat)];
    const to: Coord = [Number(o.dropoff_lng), Number(o.dropoff_lat)];
    if (!from[0] || !to[0]) return;
    try { mapRef.current?.fitBounds([from, to], { bottomFrac: 0.3 }); } catch { /* noop */ }
    try {
      const res = await fetch(`${OSRM}/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=full&geometries=geojson`);
      if (!res.ok) return;
      const data = await res.json();
      const route = data?.routes?.[0];
      if (route) {
        const coords = (route.geometry?.coordinates ?? []) as Coord[];
        if (coords.length >= 2) {
          tripPolyRef.current = coords; // ruta REAL del viaje: recogida → destino
          setRouteCoords(coords);
          setKm(`${Math.round((route.distance / 1000) * 10) / 10} km`);
          setEta(`${Math.round(route.duration / 60)} min`);
        }
      }
    } catch { /* sin ruta */ }
  }, []);

  // Longitudes acumuladas de la polilínea (para simular/proyectar avance).
  useEffect(() => {
    if (routeCoords.length < 2) { cumRef.current = []; totalRef.current = 0; return; }
    const cum = [0];
    let t = 0;
    for (let i = 1; i < routeCoords.length; i++) {
      t += distM(routeCoords[i - 1], routeCoords[i]);
      cum.push(t);
    }
    cumRef.current = cum;
    totalRef.current = t;
  }, [routeCoords]);

  const setNavFromRemaining = useCallback((remainingM: number) => {
    const rem = Math.max(0, remainingM);
    setNavKmLeft(rem / 1000);
    setNavMinLeft(Math.max(1, Math.ceil((rem / 1000) / (SIM_KMH) * 60)));
  }, []);

  /** Un "tick" de la vista de conducción: velocidad, rumbo, cámara nav
   *  (heading-up/2D-3D/zoom por velocidad), maniobra actual y voz. */
  /** Zoom efectivo 2.5D: fijo 16.0–16.5 (perspectiva sumergida sin perder las
   *  manzanas). Respeta el zoom del conductor solo dentro de ese rango. */
  const camZoom = (): number => {
    const uz = userZoomRef.current;
    const z = uz != null ? uz : 16.2;
    return Math.min(16.5, Math.max(16.0, z));
  };

  const navTick = useCallback((
    pos: Coord,
    travelledM: number,
    dtMs: number,
    stepM: number,
    tangentHeading: number | undefined,
  ) => {
    // Velocidad (km/h): simulación usa SIM_KMH; GPS real por delta de tiempo.
    let speed = SIM_KMH;
    if (dtMs > 0 && stepM > 0) speed = (stepM / (dtMs / 1000)) * 3.6;
    if (!Number.isFinite(speed) || speed <= 0) speed = 0;
    setNavSpeed(Math.round(speed));

    let heading = tangentHeading;
    if (!Number.isFinite(heading ?? NaN) && lastFixRef.current) {
      heading = headingDeg(lastFixRef.current.p, pos);
    }
    if (Number.isFinite(heading ?? NaN)) {
      const target = heading as number;
      lastHeadingRef.current = target;
      // Suavizado de rumbo (sin giros bruscos): lerp por el camino más corto.
      const prev = smoothHeadingRef.current;
      if (prev == null) smoothHeadingRef.current = target;
      else {
        let d = ((target - prev) % 360 + 540) % 360 - 180;
        smoothHeadingRef.current = (prev + d * 0.5 + 360) % 360;
      }
    }
    lastCenterRef.current = pos;
    lastFixRef.current = { p: pos, t: Date.now() };

    if (followNav) {
      // Resuelve el rumbo SIEMPRE (fallback al último conocido, nunca se salta
      // el comando): así bearing/pitch llegan en cada tick.
      const camHeading = headingUp ? (smoothHeadingRef.current ?? 0) : 0;
      const zoom = camZoom();
      // "Sumergido": en 3D heading-up la cámara mira por delante del coche,
      // así el coche queda en el tercio inferior (como DiDi/Uber), no aéreo.
      const fwd = pitch3D && headingUp ? pointShift(pos, camHeading, lookAheadRef.current) : pos;
      // Envío de cámara cada ~700 ms (una sola easeTo canónica en la página):
      // llamar a cada tick cancelaba las transiciones y dejaba el mapa plano.
      const nowCam = Date.now();
      if (nowCam - lastCamSentRef.current >= 700) {
        lastCamSentRef.current = nowCam;
        mapRef.current?.setNavView?.({
          lng: fwd[0], lat: fwd[1], zoom,
          bearing: camHeading,
          pitch: pitch3D ? NAV_PITCH : 0,
          durationMs: 700,
          // Posición REAL del coche: la página la usa para reportar cy.
          carLng: pos[0], carLat: pos[1],
        });
        // Línea de guía: ya no se dibuja nada encima del azul (2026-09-05 el
        // dueño pidió CANCELAR la línea blanca de predicción: tapaba la ruta y
        // "borraba" las flechas animadas). setGuide queda como no-op de limpieza.
        mapRef.current?.setGuide?.([]);
      }
    }

    // Maniobras (turn-by-turn) según los pasos OSRM y lo recorrido.
    // AUDITORÍA VOZ 2026-09-08 (bug "dice 'has llegado a tu destino' al
    // empezar"): la llegada SOLO se anuncia cuando quedan ≤60 m Y es el ÚLTIMO
    // paso del tramo. Antes se anunciaba con d1≤420 en tramos cortos (rutas
    // con 1-2 pasos: a los pocos metros ya hablaba "llegaste") y 'end of road'
    // se trataba como llegada. Además el texto distingue tramo: a la RECOGIDA
    // se dice "punto de recogida", al DESTINO se dice "tu destino".
    const steps = stepsRef.current;
    if (steps.length) {
      let idx = -1;
      for (let i = 0; i < steps.length; i++) {
        if (steps[i].dist >= travelledM - 4) { idx = i; break; }
      }
      if (idx < 0) idx = steps.length - 1;
      const cur = steps[idx];
      if (cur) {
        const d1 = Math.max(0, cur.dist - travelledM);
        const isLast = idx === steps.length - 1;
        setNavDist(d1);
        setNavTurn({ name: cur.name, dist: d1, type: cur.type, modifier: cur.modifier });
        const n2 = steps[idx + 1];
        setNavTurn2(n2 ? { name: n2.name, dist: Math.max(0, n2.dist - travelledM), type: n2.type, modifier: n2.modifier } : null);
        if (voiceOn) {
          const speakable = cur.type === 'turn' || cur.type === 'roundabout' || cur.type === 'exit roundabout' || cur.type === 'merge' || cur.type === 'new name' || cur.type === 'end of road' || cur.type === 'arrive';
          if (speakable && cur.type === 'arrive' && isLast && d1 <= Math.min(60, Math.max(14, totalRef.current * 0.2))) {
            if ((spokenStage.current[idx] ?? 0) < 2) {
              spokenStage.current[idx] = 2; spokenRef.current = idx;
              sayEs(leg === 'approach' ? 'Has llegado al punto de recogida. Espera al pasajero.' : 'Has llegado a tu destino');
            }
          } else if (speakable && cur.type !== 'arrive') {
            const stage = spokenStage.current[idx] ?? 0;
            // Fase 1 (lejos, con distancia) y fase 2 (cerca, corta): DiDi no
            // repite la distancia a 30 m; con "gira ya" es más natural.
            if (stage === 0 && d1 <= 420) {
              spokenStage.current[idx] = 1; spokenRef.current = idx;
              sayEs(turnVoice(cur.type, cur.modifier, cur.name, d1));
            } else if (stage === 1 && d1 <= 120) {
              spokenStage.current[idx] = 2; spokenRef.current = idx;
              sayEs(turnVoice(cur.type, cur.modifier, cur.name, 0)); // sin metros
            }
          }
        }
        // Calle actual ("Estás en …"): la del tramo en el que vamos antes del giro.
        let road = '';
        for (let j = idx - 1; j >= 0; j--) { if (steps[j].name) { road = steps[j].name; break; } }
        if (!road && cur.name) road = cur.name;
        setNavRoad(road);
      }
    }
    // ETA con la velocidad real.
    if (totalRef.current > 0 && speed > 6) {
      const restM = Math.max(0, totalRef.current - travelledM);
      setNavMinLeft(Math.max(1, Math.ceil((restM / 1000) / (speed / 60))));
      setNavKmLeft(restM / 1000);
    }
  }, [headingUp, pitch3D, voiceOn, followNav, routeCoords, leg]);

  // Carga los pasos OSRM (maniobras) del tramo activo para el turn-by-turn.
  useEffect(() => {
    if (phase !== 'ruta' || !current) return;
    const pickup: Coord = [Number(current.pickup_lng), Number(current.pickup_lat)];
    const dropoff: Coord = [Number(current.dropoff_lng), Number(current.dropoff_lat)];
    const from = leg === 'approach' ? anchorRef.current : pickup;
    const to = leg === 'approach' ? pickup : dropoff;
    if (!from[0] || !to[0]) return;
    spokenRef.current = -1;
    spokenStage.current = {};
    (async () => {
      try {
        const res = await fetch(`${OSRM}/driving/${from[0]},${from[1]};${to[0]},${to[1]}?overview=false&steps=true`);
        const data = await res.json();
        const steps = (data?.routes?.[0]?.legs ?? []).flatMap((lg: any) => lg.steps || []);
        let run = 0;
        const list: Array<{ dist: number; name: string; type: string; modifier: string }> = [];
        for (const s of steps) {
          list.push({ dist: run, name: s.name || '', type: s.maneuver?.type || '', modifier: s.maneuver?.modifier || '' });
          run += s.distance || 0;
        }
        if (list.length) {
          stepsRef.current = list;
          // Anuncio de SALIDA del tramo (una vez por viaje+tramo, como DiDi):
          // al ir a RECOGER → "de camino al pasajero"; con pasajero a bordo →
          // "de camino al destino". Solo si la voz está activa.
          if (voiceOn) {
            try {
              if (leg === 'approach') void sayEs('De camino a recoger al pasajero.');
              else void sayEs('Pasajero recogido. De camino al destino.');
            } catch { /* voz opcional */ }
          }
        }
      } catch { /* sin instrucciones */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, current?.id, leg]);

  // Cada fase/oferta empieza con la tarjeta COMPACTA (el mapa visible).
  useEffect(() => { setCardExpanded(false); }, [phase, current?.id]);

  // Detiene la voz si se sale del conductor.
  useEffect(() => () => { stopAllVoice(); }, []);

  // Nota: NO usamos getAvailableVoicesAsync(): en algunos motores TTS (p. ej.
  // el de Oplus/ColorOS) ese método crashea la app (LanguageUtils). La voz
  // PRINCIPAL es Qwen3 cloud (voz Cherry, proxy backend) con FALLBACK local
  // es-ES si no hay red: sayNavigation nunca lanza y siempre habla algo.
  const sayEs = useCallback((text: string) => { if (!voiceOn) return;
    void sayNavigation(text, { forceLocal: false });
  }, [voiceOn]);

  // Aplica la cámara INMEDIATAMENTE al pulsar 3D/Norte (aunque el coche esté
  // parado): rumbo (heading-up/norte) + inclinación (3D) sobre la posición.
  useEffect(() => {
    if (phase !== 'ruta' || !vehiclePos) return;
    lastCenterRef.current = vehiclePos;
    // No forzar rumbo 0 antes del primer movimiento: si aún no hay rumbo y
    // vamos en heading-up, esperamos al primer tick de navegación.
    if (headingUp && !Number.isFinite(lastHeadingRef.current ?? NaN)) return;
    const h = headingUp ? (smoothHeadingRef.current ?? 0) : 0;
    const zoom = camZoom();
    const fwd = pitch3D && headingUp ? pointShift(vehiclePos, h || 0, lookAheadRef.current) : vehiclePos;
    mapRef.current?.setNavView?.({
      lng: fwd[0], lat: fwd[1], zoom,
      bearing: h,
      pitch: pitch3D ? NAV_PITCH : 0,
      durationMs: 600,
      carLng: vehiclePos[0], carLat: vehiclePos[1],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pitch3D, headingUp, phase]);

  // Fuera de la ruta (esperando/oferta) el mapa vuelve a 2D plano.
  useEffect(() => {
    mapRef.current?.setNavMode?.(phase === 'ruta' ? 'drive' : 'normal');
    if (phase === 'ruta') return;
    if (lastCenterRef.current) {
      mapRef.current?.setNavView?.({
        lng: lastCenterRef.current[0], lat: lastCenterRef.current[1],
        zoom: 13, bearing: 0, pitch: 0, durationMs: 500,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Modo NOCHE del mapa por horario de Guinea Ecuatorial (UTC+1): se aplica al
  // montar y se re-evalúa cada minuto (cruzar 19:00/06:00 cambia la paleta en
  // vivo, sin recargar el mapa).
  useEffect(() => {
    let nightNow = isNightGq();
    mapRef.current?.setNight?.(nightNow);
    const t = setInterval(() => {
      const n = isNightGq();
      if (n !== nightNow) { nightNow = n; mapRef.current?.setNight?.(n); }
    }, 60000);
    return () => clearInterval(t);
  }, []);

  // Heartbeat: reporta la posición del conductor cada ~3 s para que el
  // pasajero vea el coche acercándose en su mapa.
  useEffect(() => {
    if (phase !== 'ruta' || !current || !vehiclePos) return;
    const now = Date.now();
    if (now - lastLocReportRef.current < 3000) return;
    lastLocReportRef.current = now;
    taxiApi.reportLocation(current.id, vehiclePos[1], vehiclePos[0]).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehiclePos, phase, current?.id]);

  // CUERDA ROJA del CONDUCTOR (DiDi, lado conductor): línea fina que une SU
  // coche con el OBJETIVO del tramo — al RECOGER (leg 'approach') con el punto
  // de recogida; llevando al pasajero (leg 'trip') con el DESTINO FINAL. Se
  // refresca ~cada 0,8 s con la posición en vivo.
  const lastRopeRef = useRef(0);
  useEffect(() => {
    if (phase !== 'ruta' || !current || !vehiclePos) {
      mapRef.current?.setRope?.(null, null, null, null);
      return;
    }
    const now = Date.now();
    if (now - lastRopeRef.current < 800) return;
    lastRopeRef.current = now;
    const targetLng = leg === 'trip'
      ? Number(current.dropoff_lng)
      : Number(current.pickup_lng);
    const targetLat = leg === 'trip'
      ? Number(current.dropoff_lat)
      : Number(current.pickup_lat);
    mapRef.current?.setRope?.(
      vehiclePos[0], vehiclePos[1],
      targetLng, targetLat,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, current?.id, leg, vehiclePos]);

  // ── Motor de navegación (fase 'ruta', por TRAMOS):
  //    · leg 'approach': ruta = posición del conductor → punto de recogida.
  //    · leg 'trip':      ruta = recogida → destino (igual que ve el pasajero).
  //    · GPS real dentro de GQ → posición en vivo cada 3 s y cámara que sigue.
  //    · Sin GPS real (pruebas fuera del país) → AVANCE SIMULADO por la ruta.
  useEffect(() => {
    if (phase !== 'ruta' || routeCoords.length < 2) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let alive = true;
    simTravRef.current = 0;
    lastFixRef.current = null;
    setVehiclePos(routeCoords[0]);
    setNavFromRemaining(totalRef.current);
    const tangentAt = (trav: number): number | undefined => {
      const a = pointAt(routeCoords, cumRef.current, trav);
      const b = pointAt(routeCoords, cumRef.current, Math.min(trav + 3, totalRef.current));
      const h = headingDeg(a, b);
      return Number.isFinite(h) ? h : undefined;
    };
    (async () => {
      // GPS real SOLO si el permiso ya está concedido (nunca mostramos el
      // diálogo de permisos al conducir: eso congelaba la aceptación en
      // algunos Android). Si no → simulación inmediata.
      const gps = await getGqPositionIfAllowed(2500);
      if (!alive) return;
      if (gps) {
        const push = async (first: boolean) => {
          const g = await getGqPositionIfAllowed(2500);
          if (!alive || !g) return;
          const prev = lastFixRef.current;
          const stepM = prev ? distM(prev.p, g) : 0;
          const along = alongAt(routeCoords, cumRef.current, g);
          setVehiclePos(g);
          // Rumbo por la GEOMETRÍA de la ruta (no por el GPS/brújula): la
          // cámara mira SIEMPRE hacia donde va la carretera.
          const tg = tangentAt(along);
          navTick(g, along, first || !prev ? 3000 : Date.now() - prev.t, stepM, tg);
        };
        push(true);
        timer = setInterval(() => push(false), 3000);
      } else {
        // Simulación: avanza a SIM_KMH sobre la polilínea del tramo actual.
        // Tick de 250 ms → movimiento SUAVE del coche. Si la app estuvo en
        // segundo plano (temporizadores suspendidos), al volver RECUPERA el
        // tiempo transcurrido y coloca el coche donde debería estar.
        let lastRun = Date.now();
        let done = false;
        timer = setInterval(() => {
          if (!alive) return;
          const now = Date.now();
          const dtS = Math.min((now - lastRun) / 1000, 180); // recupera hasta 3 min de pausa
          lastRun = now;
          const before = simTravRef.current;
          const stepM = (SIM_KMH / 3.6) * dtS;
          const next = Math.min(before + stepM, totalRef.current);
          simTravRef.current = next;
          const p = pointAt(routeCoords, cumRef.current, next);
          const moved = next - before;
          if (moved > 0.01) {
            // Al volver de un salto grande (fondo) no se anuncian maniobras sueltas.
            if (dtS > 5) { spokenRef.current = 9999; spokenStage.current = {}; }
            setVehiclePos((prev) => {
              if (prev && Math.abs(prev[0] - p[0]) < 0.00001 && Math.abs(prev[1] - p[1]) < 0.00001) return prev;
              return p;
            });
            navTick(p, next, dtS * 1000, moved, tangentAt(next));
          } else if (!done) {
            done = true; // llegó al final del tramo: última actualización de UI
            navTick(p, next, 250, 0, tangentAt(next));
            setNavSpeed(0);
            setNavFromRemaining(0);
            // Mantén la cámara 2.5D en reposo (zoom 16.0-16.5, rumbo, pitch).
            const hz = Number.isFinite(lastHeadingRef.current ?? NaN) ? (lastHeadingRef.current as number) : 0;
            mapRef.current?.setNavView?.({
              lng: p[0], lat: p[1], zoom: camZoom(),
              bearing: headingUp ? hz : 0,
              pitch: pitch3D ? NAV_PITCH : 0,
              durationMs: 600,
            });
          }
        }, 250);
      }
    })();
    return () => { alive = false; if (timer) clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, current?.id, leg, routeCoords]);

  const algoPrice = current ? Number(current.algorithm_price) : 0;
  const userPrice = current ? Number(current.requested_price) : 0;
  // P1-c: la comisión ya NO es un 10 % fijo — es POR CIUDAD (Malabo 20 % con
  // tope, Bata 50 plano) y la fija el servidor según su política en BD. La app
  // pregunta el neto real por SSE ciudad+precio; mientras llega, estima (≈).
  const [netQuote, setNetQuote] = useState<Record<string, number>>({});
  const netCity = String((current as any)?.city ?? '') || 'Malabo';
  const netOf = (p: number) => {
    if (!Number.isFinite(p) || p <= 0) return 0;
    const hit = netQuote[`${netCity}:${p}`];
    return hit ?? Math.round(p * (1 - COMMISSION));
  };
  const netExact = (p: number) => Number.isFinite(p) && p > 0 && netQuote[`${netCity}:${p}`] != null;
  useEffect(() => {
    if (phase !== 'offer' || !current) return;
    const city = String((current as any).city ?? '') || 'Malabo';
    const prices = [algoPrice, userPrice].filter((p) => Number.isFinite(p) && p > 0);
    let alive = true;
    for (const p of prices) {
      const key = `${city}:${p}`;
      if (netQuote[key] != null) continue;
      settlementApi.quote(city, p)
        .then((q) => { if (alive) setNetQuote((prev) => ({ ...prev, [key]: q.net })); })
        .catch(() => { /* sin cuota: se queda la estimación ≈ */ });
    }
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, current?.id, algoPrice, userPrice]);
  const isCompartido = current?.modality === 'compartido' || current?.modality === 'minibus';
  // ── P2: perfil del pasajero en la tarjeta de solicitud ────────────────────
  // nº de pasajeros = asientos pedidos (pool) o 1 en privado; historial =
  // completed_trips; "verificado" = cuenta con historial o puntos de confianza.
  const paxCount = current
    ? current.is_pool
      ? Math.max(1, Math.min(6, Number(current.max_pool_seats) || 1))
      : 1
    : 1;
  const paxTrips = Math.max(0, Number(current?.passenger_trips) || 0);
  const paxTrust = Math.max(0, Number(current?.passenger_trust) || 0);
  const paxVerified = paxTrips > 0 || paxTrust > 0;
  const paxInitial = (current?.passenger_name || 'P').trim().charAt(0).toUpperCase();

  // FASE 3 DiDi: doble botón grande — el conductor elige con qué precio acepta
  // (algoritmo naranja o presupuesto del usuario azul) y el viaje arranca.
  const aceptar = async (price?: number) => {
    const p = price ?? chosenPrice;
    if (!current || p == null || !(p > 0) || busy) return;
    setChosenPrice(p);
    setFareTotal(p); // P4: precio FINAL sellado que se cobra en efectivo
    setTripExpanded(false);
    setBusy(true); setError(null);
    const offer = current; // captura la oferta aceptada
    try {
      // 1) Aceptar en backend (rápido). Si el servidor confirma, PASAMOS a
      //    'ruta' YA: el GPS o el cálculo de la ruta de acercamiento NO pueden
      //    congelar la pantalla (eran awaits bloqueantes sin timeout: en
      //    algunos Android el diálogo de permisos o el fix GPS cuelgan).
      await taxiApi.acceptTrip(offer.id, p);
      // Tras aceptar, la solicitud pasa a ser "viaje propio" y el backend
      // expone el TELÉFONO del pasajero (para WhatsApp/llamada/PIN). Lo
      // fusionamos en la oferta en pantalla.
      (async () => {
        try {
          const upd = await taxiApi.driverTrips();
          const own = Array.isArray(upd)
            ? (upd as Offer[]).find((x) => x.id === offer.id && x.status !== 'requested')
            : null;
          if (own) setCurrent((prev) => (prev ? { ...prev, ...own } : prev));
        } catch { /* sin red: reintentará en el próximo estado */ }
      })();
      if (countdownRef.current) clearInterval(countdownRef.current);
      setPhase('ruta');
      // 2) Acercamiento en PARALELO con timeouts (sin bloquear la UI):
      //    · GPS real solo si el permiso YA existe (≤2,5 s).
      //    · OSRM con AbortController (≤8 s).
      //    Si algo falla → tramo directo al destino (tripPolyRef de la oferta).
      (async () => {
        const from: Coord = [Number(offer.pickup_lng), Number(offer.pickup_lat)];
        const to: Coord = [Number(offer.dropoff_lng), Number(offer.dropoff_lat)];
        try {
          const gps = await getGqPositionIfAllowed(2500);
          if (gps) anchorRef.current = gps;
        } catch { /* sin GPS → ancla por defecto */ }
        if (!from[0] || !to[0]) { setLeg('trip'); if (tripPolyRef.current.length >= 2) setRouteCoords(tripPolyRef.current); return; }
        try {
          const ctrl = new AbortController();
          const toFall = setTimeout(() => ctrl.abort(), 8000);
          const res = await fetch(`${OSRM}/driving/${anchorRef.current[0]},${anchorRef.current[1]};${from[0]},${from[1]}?overview=full&geometries=geojson`, { signal: ctrl.signal });
          clearTimeout(toFall);
          const data = await res.json();
          const coords = (data?.routes?.[0]?.geometry?.coordinates ?? []) as Coord[];
          if (coords.length >= 2) {
            setLeg('approach');
            setRouteCoords(coords);
          } else {
            setLeg('trip');
            if (tripPolyRef.current.length >= 2) setRouteCoords(tripPolyRef.current);
          }
        } catch {
          // Red lenta/OSRM caído: NO congelamos; arrancamos el tramo directo.
          setLeg('trip');
          if (tripPolyRef.current.length >= 2) setRouteCoords(tripPolyRef.current);
        }
      })();
      // 3) Forzar la cámara "sumergida" al aceptar (zoom cerca + pitch 60).
      setTimeout(() => {
        const p0 = anchorRef.current;
        mapRef.current?.setNavView?.({
          lng: p0[0], lat: p0[1], zoom: 16.5,
          bearing: 0, pitch: pitch3D ? NAV_PITCH : 0, durationMs: 900,
        });
      }, 150);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo aceptar');
    } finally { setBusy(false); }
  };

  /** Recoger pasajero: pasa a 'in_progress' (viaje en marcha). */
  const avanzar = async (status: 'in_progress') => {
    if (!current || busy) return;
    setBusy(true); setError(null);
    try {
      await taxiApi.updateStatus(current.id, status);
      // TRAMO 2: recogida → destino (ruta REAL del viaje, la del pasajero).
      setLeg('trip');
      if (tripPolyRef.current.length >= 2) setRouteCoords(tripPolyRef.current);
      setKm('');
      setEta('');
      setTimeout(() => {
        const c = tripPolyRef.current[0] ?? MALABO_CENTER;
        mapRef.current?.setNavView?.({
          lng: c[0], lat: c[1], zoom: 16.5, bearing: 0, pitch: pitch3D ? NAV_PITCH : 0, durationMs: 900,
        });
      }, 150);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al actualizar');
    } finally { setBusy(false); }
  };

  /** P1-c: «He llegado» — abre la ventana de confirmación del pasajero
   *  (auto-cierre del servidor a los 10 min). Solo para viajes PAGADOS CON
   *  MONEDERO: los de efectivo siguen usando «Terminar viaje y cobrar». */
  const heLlegado = async () => {
    if (!current || busy) return;
    setBusy(true); setError(null);
    try {
      await settlementApi.arrival(current.id);
      setCurrent((prev) => (prev ? { ...prev, status: 'arrived', arrived_at: new Date().toISOString() } as Offer : prev));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo avisar de la llegada');
    } finally { setBusy(false); }
  };

  /** P4 TERMINAR VIAJE: completa en el servidor e informa si cobró en efectivo.
   *  cashOk=false ⇒ el backend BLOQUEA al conductor (cash_blocked_at) hasta que
   *  confirme desde la tarjeta "Confirmar cobro" (decisión del dueño 2026-09-08).
   *  P1-c: si el viaje está PAGADO con monedero el servidor responde
   *  SETTLEMENT_REQUIRED: aquí NO se cierra — usa «He llegado» y espera. */
  const terminarViaje = async (cashOk: boolean) => {
    const offer = current;
    if (!offer || busy) return;
    setBusy(true); setError(null);
    try {
      await taxiApi.updateStatus(offer.id, 'completed', cashOk);
      if (!cashOk) {
        setBlockedCash(true);
        setBlockedCashTrip(offer.id);
      }
      setPhase('waiting'); setCurrent(null); setRouteCoords([]);
      setLeg('approach'); setVehiclePos(null); setTripExpanded(false); setFareTotal(0);
      setCashOpen(false);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      if (code === 'SETTLEMENT_REQUIRED') {
        setError('Este viaje lo pagó el pasajero con el monedero: pulsa «He llegado» y él confirmará el cierre (se cierra solo a los 10 min).');
      } else {
        setError(e instanceof Error ? e.message : 'Error al terminar el viaje');
      }
    } finally { setBusy(false); }
  };

  /** Confirmar el cobro pendiente → desbloquea en servidor y vuelve a trabajar. */
  const confirmarCobro = async () => {
    const id = blockedCashTrip ?? current?.id;
    if (!id || busy) return;
    setBusy(true); setError(null);
    try {
      await taxiApi.confirmCash(id);
      setBlockedCash(false);
      setBlockedCashTrip(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo confirmar el cobro');
    } finally { setBusy(false); }
  };

  /** DESCANSO (decisión del dueño revisada 2026-09-08): es SOLO una marca
   *  'resting' en backend. El conductor SIGUE en línea y SIGUE recibiendo
   *  solicitudes: aceptar o no es SIEMPRE su elección. No pide selfie. */
  const descansar = async (rest: boolean) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      await driverApi.setRest(rest);
      setResting(rest);
      if (!rest) load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado');
    } finally { setBusy(false); }
  };

  /** Emergencia en ruta: cancela el viaje actual y abre la marcación 24/7. */
  const alertCancel = async () => {
    if (!current || busy) return;
    setBusy(true); setError(null);
    try {
      // P1-c: con el fare bloqueado la cancelación va por LIQUIDACIÓN:
      // reembolso total al pasajero + falta (3 en 7 días → suspensión).
      if ((current as any).payment_locked_at || (current as any).settlement_kind === 'WALLET') {
        const r = await settlementApi.driverCancel(current.id, 'emergencia en ruta');
        if (r.suspension?.suspended_until) {
          setRutaNotice(`Has cancelado 3 viajes en 7 días: cuenta suspendida hasta ${new Date(r.suspension.suspended_until).toLocaleString('es')}.`);
        }
      } else {
        await taxiApi.updateStatus(current.id, 'cancelled' as any);
      }
      setPhase('waiting'); setCurrent(null); setRouteCoords([]);
      setLeg('approach'); setVehiclePos(null); setTripExpanded(false); setFareTotal(0);
      setEmergencyOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cancelar');
    } finally { setBusy(false); }
  };

  const stars = useMemo(() => {
    const r = Number(current?.passenger_rating) || 5;
    return Array.from({ length: 5 }, (_, i) => i < Math.round(r));
  }, [current]);

  const s = styles(colors);
  const pickup = current?.pickup_address || 'Origen';
  const dropoff = current?.dropoff_address || 'Destino';
  // P1-c: viaje pagado con el monedero → el cierre lo confirma el PASAJERO
  // (o el servidor solo). El conductor avisa de llegada y cobra el NETO.
  const walletRide = !!(current as any)?.payment_locked_at;
  const rideArrived = !!(current as any)?.arrived_at || String(current?.status ?? '') === 'arrived';
  const netRide = Math.max(0, Number((current as any)?.final_price ?? 0) - Number((current as any)?.fee_info?.fee ?? 0));

  // HUD de carriles (cuadraditos azules con flechas) desde la maniobra actual.
  const laneChips: string[] = (() => {
    const m = (navTurn?.modifier || '').toLowerCase();
    const t = (navTurn?.type || '').toLowerCase();
    const chips = ['⬆️'];
    if (m.indexOf('uturn') >= 0) chips.push('🔃');
    else if (m.indexOf('right') >= 0 || t.indexOf('roundabout') >= 0) chips.push('➡️');
    else if (m.indexOf('left') >= 0) chips.push('⬅️');
    return chips;
  })();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {/* Cargando estado del conductor */}
      {driverStatus === 'checking' && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: espaciado.e10 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, fontWeight: peso.medio }}>Comprobando tu cuenta de conductor…</Text>
        </View>
      )}
      {/* GATE: sin alta de conductor → onboarding (cuenta + documentos) */}
      {(driverStatus === 'none' || driverStatus === 'pending' || driverStatus === 'rejected') && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaciado.e24, gap: espaciado.e12 }}>
          <ShieldCheck size={44} color={colors.primary} />
          <Text style={{ fontSize: tipografia.title, fontWeight: peso.titulo, color: colors.textPrimary, textAlign: 'center' }}>
            {driverStatus === 'pending' ? 'Documentos en revisión' : driverStatus === 'rejected' ? 'Alta rechazada' : 'Aún no eres conductor'}
          </Text>
          <Text style={{ fontSize: tipografia.body, textAlign: 'center', color: colors.textSecondary, lineHeight: 20 }}>
            {driverStatus === 'pending'
              ? 'El administrador está revisando tus documentos. Vuelve pronto.'
              : 'Para aceptar viajes necesitas el alta de conductor: crea tu cuenta si no la tienes y sube licencia, DIP y selfie.'}
          </Text>
          {driverStatus !== 'pending' && (
            <Pressable onPress={() => router.push('/driver-onboarding')} style={{ backgroundColor: colors.primary, borderRadius: radios.full, paddingVertical: espaciado.e14, paddingHorizontal: espaciado.e32 }}>
              <Text style={{ color: brand.white, fontSize: tipografia.subtitle, fontWeight: peso.maximo }}>Completar alta de conductor</Text>
            </Pressable>
          )}
          <GhostButton title="Volver" onPress={() => router.back()} />
        </View>
      )}

      {driverStatus === 'approved' && workMode === 'intercity' && !online && null}
      {driverStatus === 'approved' && !online && workMode !== 'intercity' && null}

      {selfieOpen && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#000000', zIndex: 20 }]}>
          <CameraCapture variant="selfie" instruction="Pon tu cara dentro del óvalo, con buena luz y sin gorra ni gafas" onCapture={async (photo) => {
            setBusy(true); setSelfieErr(null);
            try {
              // Selfie REAL en base64 para el match facial 1:1.
              const payload = photo.base64 ? `data:image/jpeg;base64,${photo.base64}` : `captured://selfie/online/${Date.now()}`;
              const res = await driverApi.goOnline(payload);
              if (res.online) {
                setSelfieOpen(false);
                setOnline(true); setDriverStatus('approved');
                setError(null);
              } else {
                // No cerramos la cámara: el conductor reintenta con la guía.
                setSelfieErr('No se pudo confirmar la identidad. Reintenta mirando de frente, con buena luz.');
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : '';
              setSelfieErr(
                /coincide|iluminaci|detect|selfie|face|identidad/i.test(msg)
                  ? msg
                  : 'No se pudo confirmar la identidad. Revisa tu conexión y reintenta.',
              );
            } finally { setBusy(false); }
          }} />
          {busy && (
            <View style={{ position: 'absolute', top: 64, alignSelf: 'center', backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: radios.full, paddingHorizontal: espaciado.e18, paddingVertical: espaciado.e9 }}>
              <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>Verificando identidad…</Text>
            </View>
          )}
          {selfieErr && !busy && (
            <View style={{ position: 'absolute', bottom: 120, alignSelf: 'center', backgroundColor: 'rgba(245,63,63,0.92)', borderRadius: 14, paddingHorizontal: espaciado.e18, paddingVertical: espaciado.e12, marginHorizontal: espaciado.e24 }}>
              <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body, textAlign: 'center' }}>{selfieErr}</Text>
              <Text style={{ color: brand.white, opacity: 0.9, fontSize: tipografia.caption, textAlign: 'center', marginTop: espaciado.e6 }}>
                Pulsa el botón blanco para reintentar.
              </Text>
            </View>
          )}
        </View>
      )}

      {/* ───────── UI DEL CONDUCTOR (aprobado): mapa + tarjetas ───────── */}
      {driverStatus === 'approved' && (
        <>
          {/* Cabecera */}
          <View style={s.topBar}>
            <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: espaciado.e4 }} accessibilityRole="button" accessibilityLabel="Volver">
              <ArrowLeft size={22} color={colors.textPrimary} />
            </Pressable>
            <Text style={s.title}>👨‍✈️ Conductor</Text>
            <View style={{ flexDirection: 'row', gap: espaciado.e14 }}>
              {/* Perfil (P1): abre el bottom-sheet en la pestaña Perfil. El
                  logout SOLO vive dentro de ese Perfil (decisión del dueño). */}
              <Pressable onPress={() => { setHomeTab('perfil'); setHomeOpen(true); }} hitSlop={12} accessibilityRole="button" accessibilityLabel="Perfil y opciones">
                <UserRound size={20} color={colors.textPrimary} />
              </Pressable>
              <Pressable onPress={() => setEmergencyOpen(true)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Emergencia">
                <Siren size={20} color={colors.danger} />
              </Pressable>
            </View>
          </View>

          {/* Avisos compactos (1 línea, no roban mapa) */}
          {expiryWarnings.length > 0 && (
            <View style={s.warnStrip}>
              <Siren size={13} color={colors.danger} />
              <Text style={{ color: colors.danger, fontWeight: peso.fuerte, fontSize: tipografia.caption, flex: 1 }} numberOfLines={1}>
                {expiryWarnings[0]}{expiryWarnings.length > 1 ? ` (+${expiryWarnings.length - 1} más)` : ''}
              </Text>
            </View>
          )}
          {error && <Text style={[s.error, { color: colors.danger }]}>{error}</Text>}
          {/* Aviso de cancelación remota (pasajero): pill temporal en espera */}
          {rutaNotice && phase === 'waiting' && (
            <View style={[s.rutaNoticePill, { borderColor: '#F5A62366' }]}>
              <Text style={{ color: brand.warning, fontWeight: peso.maximo, fontSize: tipografia.body }}>🚫 {rutaNotice}</Text>
            </View>
          )}

          {/* Mapa ocupa el resto de la pantalla (flex) */}
          <View style={s.mapArea}>
            <EgMapView ref={mapRef} style={StyleSheet.absoluteFill}
              onMapPress={(c) => {
                // P1: en espera, un toque mueve la ZONA de búsqueda (ancla visual).
                if (phase === 'waiting' && offers.length === 0 && !heatOn) {
                  anchorRef.current = c;
                  mapRef.current?.setCamera({ centerCoordinate: c, zoomLevel: 15, durationMs: 500 });
                }
              }}
              onHazard={(h) => {
              // ZONAS SENSIBLES + SEMÁFOROS/PASOS/STOP: aviso por DISTANCIA en
              // metros (la página escanea ≤300 m y deduplica por coordenada).
              // Sin simular color del semáforo (no hay datos reales en GQ).
              if (phase !== 'ruta' || !voiceOn) return;
              const d = (h && typeof h.distM === 'number') ? h.distM : 999;
              if (!h || d <= 0) return;
              if (h.kind === 'school' && d <= 260) {
                const nm = h.name ? ` de ${h.name}` : '';
                void sayNavigation(d >= 100
                  ? `Cuidado, hay una escuela cerca${nm ? ' ' + nm : ''} a ${d} metros. Reduce la velocidad.`
                  : `Cuidado, hay una escuela cerca${nm ? ' ' + nm : ''}. Reduce la velocidad.`, { forceLocal: false });
              } else if (h.kind === 'signal' && d <= 300) {
                void sayNavigation(d >= 100
                  ? `Semáforo a ${d} metros. Prepárate para detenerte.`
                  : 'Semáforo próximo. Prepárate para detenerte.', { forceLocal: false });
              } else if (h.kind === 'zebra' && d <= 180) {
                void sayNavigation(d >= 100
                  ? `Paso de peatones a ${d} metros. Reduce la velocidad.`
                  : 'Paso de peatones. Reduce la velocidad.', { forceLocal: false });
              } else if (h.kind === 'stop' && d <= 160) {
                void sayNavigation(d >= 100
                  ? `Señal de stop a ${d} metros. Prepárate para detenerte.`
                  : 'Señal de stop. Prepárate para detenerte.', { forceLocal: false });
              }
            }} onNavState={(s) => {
              userZoomRef.current = s.zoom || userZoomRef.current;
              setNavDbg(s);
              // Look-ahead ADAPTATIVO (bucle cerrado): la página reporta cy
              // (0..1 = altura donde proyecta el coche). Objetivo: tercio
              // inferior ≈ 0.80. Si el coche se sale por abajo (cy≥1) o va
              // muy arriba (cy bajo), corregimos la distancia de la cámara.
              // cy<0 = página sin posición de coche (no ajustar).
              if (phase === 'ruta' && typeof s.cy === 'number' && Number.isFinite(s.cy) && s.cy >= 0.05) {
                const cy = s.cy;
                let la = lookAheadRef.current;
                if (cy >= 1) la = clampLookAhead(la * 0.78);      // fuera por abajo → acercar
                else if (cy > 0.90) la = clampLookAhead(la * 0.9);
                else if (cy < 0.68) la = clampLookAhead(la * 1.12);  // demasiado alto → alejar
                else if (cy < 0.76) la = clampLookAhead(la * 1.06);
                else if (cy > 0.86) la = clampLookAhead(la * 0.94);
                if (la !== lookAheadRef.current) lookAheadRef.current = la;
              }
            }}>
              <EgCamera centerCoordinate={MALABO_CENTER} zoomLevel={13} animationMode="moveTo" />
              <EgMarkers
                markers={[
                  ...(phase !== 'ruta' && current && current.pickup_lat ? [{ id: 'o', coordinate: [Number(current.pickup_lng), Number(current.pickup_lat)] as Coord, kind: 'origin' as const, label: pickup }] : []),
                  ...(phase !== 'ruta' && current && current.dropoff_lat ? [{ id: 'd', coordinate: [Number(current.dropoff_lng), Number(current.dropoff_lat)] as Coord, kind: 'destination' as const, label: dropoff }] : []),
                  ...(vehiclePos ? [{ id: 'car', coordinate: vehiclePos, kind: 'driver' as const, heading: smoothHeadingRef.current ?? undefined }] : []),
                ]}
              />
              {routeCoords.length >= 2 && <EgRoutePolyline coordinates={routeCoords} />}
            </EgMapView>

            {/* Badge de modalidad (solo en la OFERTA; en ruta el mapa es el foco) */}
            {phase === 'offer' && current && (
              <View style={[s.badge, { backgroundColor: isCompartido ? brand.primary : brand.warning }]}>
                <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.caption }}>
                  {isCompartido ? `COMPARTIDO · ${current.modality === 'minibus' ? 'MINI BUS (CIEN-CIEN)' : '500 XAF Malabo / 300 XAF Bata por asiento'}` : 'CARRERA PRIVADA'}
                </Text>
              </View>
            )}

            {/* Tarjeta(s) inferiores superpuestas al mapa (no compiten en el layout) */}
            <View style={[s.overlayWrap, { paddingBottom: insets.bottom + 12 }]} pointerEvents="box-none">
              {/* DESCONECTADO: tarjeta limpia para ponerse en línea */}
              {!online && (
                <View style={[s.bottomCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={s.statusRow}>
                    <View style={[s.statusDot, { backgroundColor: colors.danger }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.subtitle }}>No estás en línea</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>
                        {workMode === 'intercity'
                          ? 'Estás en modo Ciudad a Ciudad: no recibirás solicitudes de taxi. Publica tus viajes interurbanos.'
                          : 'Conéctate para recibir solicitudes de taxi en la ciudad.'}
                      </Text>
                    </View>
                  </View>
                  {workMode === 'intercity' ? (
                    <>
                      <Pressable onPress={() => router.push('/intercity-publish' as any)} style={[s.goOnlineBtn, { backgroundColor: colors.primary }]}>
                        <Text style={s.goOnlineText}>🚌 Publicar viaje interurbano</Text>
                      </Pressable>
                      <GhostButton title="Cambiar modo del día" onPress={() => router.push('/driver-profile' as any)} />
                    </>
                  ) : (
                    <Pressable onPress={() => setSelfieOpen(true)} style={s.goOnlineBtn}>
                      <Text style={s.goOnlineText}>Conectarse (selfie rápida)</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: tipografia.caption, fontWeight: peso.medio }}>
                        {driverStatus === 'approved' ? 'Confirmas tu identidad y entras en línea' : ''}
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}

              {/* P4 EFECTIVO: cobro pendiente → no se reciben solicitudes hasta
                  confirmar (bloqueo también EN SERVIDOR: el accept devuelve 403). */}
              {online && blockedCash && (
                <View style={[s.bottomCard, { backgroundColor: colors.card, borderColor: '#F5A62366' }]}>
                  <View style={s.statusRow}>
                    <View style={[s.statusDot, { backgroundColor: brand.warning }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: 15 }}>Cobro pendiente de confirmar</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>
                        No recibirás solicitudes nuevas hasta confirmar que cobraste el último viaje en efectivo.
                      </Text>
                    </View>
                  </View>
                  <Pressable onPress={confirmarCobro} disabled={busy} style={[s.goOnlineBtn, { backgroundColor: brand.success, opacity: busy ? 0.6 : 1 }]}>
                    {busy ? <ActivityIndicator color={brand.white} /> : <Text style={s.goOnlineText}>✓ Confirmar cobro y seguir trabajando</Text>}
                  </Pressable>
                </View>
              )}

              {/* BUSCANDO SOLICITUDES: PIN + radar 360° DENTRO del mapa.
                  Descanso NO bloquea: se sigue recibiendo y aceptar es elección
                  del conductor. Toca el mapa para fijar la zona (ancla visual). */}
              {online && phase === 'waiting' && (
                <View pointerEvents="box-none" style={s.waitRadarWrap}>
                  <View pointerEvents="none" style={[s.waitRadarCard, { borderColor: 'rgba(255,255,255,0.14)' }]}>
                    <SearchSpin color={resting ? brand.warning : brand.secondary} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, marginTop: espaciado.e8 }}>
                      {resting && <Text style={{ fontSize: tipografia.caption }}>☕</Text>}
                      <Text style={{ color: 'rgba(255,255,255,0.92)', fontSize: tipografia.caption, fontWeight: peso.maximo }}>
                        {resting ? 'En descanso · sigues recibiendo solicitudes' : 'Buscando solicitudes…'}
                      </Text>
                    </View>
                    <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10.5, fontWeight: peso.medio, marginTop: espaciado.e2 }}>
                      Toca el mapa para fijar tu zona
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => descansar(!resting)}
                    disabled={busy}
                    accessibilityRole="button"
                    accessibilityLabel={resting ? 'Volver a trabajar' : 'Descansar (sigues recibiendo solicitudes)'}
                    style={[s.restPill, { borderColor: 'rgba(255,255,255,0.22)', backgroundColor: resting ? 'rgba(245,166,35,0.9)' : 'rgba(15,20,28,0.45)' }]}
                  >
                    {busy ? <ActivityIndicator size="small" color={brand.white} /> : <Text style={{ color: resting ? '#141414' : 'rgba(255,255,255,0.9)', fontSize: tipografia.caption, fontWeight: peso.maximo }}>
                      {resting ? 'Volver a trabajar' : '☕ Descansar'}
                    </Text>}
                  </Pressable>
                </View>
              )}

              {/* OFERTA (15 s) — P2 DiDi: tarjeta OSCURA y flotante sobre el
                  mapa (independiente del tema claro/oscuro de la app). */}
              {online && phase === 'offer' && current && (
                <View style={[s.bottomCard, { backgroundColor: 'rgba(20,25,32,0.97)', borderColor: 'rgba(255,255,255,0.12)' }]}>
                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.offerContent}>
                    {/* Countdown */}
                    <View style={s.countRow}>
                      <Text style={PK.countTxt}>⏱ {OFFER_SECONDS} s para aceptar</Text>
                      <View style={[s.countTrack, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
                        <Animated.View style={[s.countFill, { width: countdown.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) as any }]} />
                      </View>
                    </View>

                    {/* Pasajero: nombre GRANDE + check de verificación + historial */}
                    <View style={PK.paxRow}>
                      <View style={PK.avatar}>
                        <Text style={PK.avatarTxt}>{paxInitial}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e7 }}>
                          <Text style={PK.name} numberOfLines={1}>{current.passenger_name || 'Pasajero'}</Text>
                          {paxVerified ? (
                            <View style={PK.badgeGreen}>
                              <BadgeCheck size={12} color={brand.success} />
                              <Text style={PK.badgeGreenTxt}>Verificado</Text>
                            </View>
                          ) : (
                            <View style={PK.badgeGray}>
                              <UserRound size={11} color="rgba(255,255,255,0.6)" />
                              <Text style={PK.badgeGrayTxt}>Cuenta nueva</Text>
                            </View>
                          )}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e3, marginTop: espaciado.e3 }}>
                          {stars.map((on, i) => (
                            <Star key={i} size={11} color={on ? brand.warning : 'rgba(255,255,255,0.22)'} fill={on ? brand.warning : 'transparent'} />
                          ))}
                          <Text style={[PK.metaTxt, { marginLeft: espaciado.e3 }]}>
                            {Number(current.passenger_rating) > 0 ? Number(current.passenger_rating).toFixed(1) : '—'}
                            {' · '}{paxTrips} viajes · {paxCount} {paxCount === 1 ? 'pasajero' : 'pasajeros'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* Trayecto origen → destino + distancia/tiempo */}
                    <View style={s.routeInfo}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e7 }}>
                        <MapPin size={14} color={brand.success} />
                        <Text style={[s.routeText, { color: brand.white }]} numberOfLines={1}>{pickup}</Text>
                      </View>
                      <View style={{ paddingLeft: espaciado.e13 }}>
                        <View style={PK.vLine} />
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e7 }}>
                        <Flag size={14} color={brand.secondary} />
                        <Text style={[s.routeText, { color: brand.white }]} numberOfLines={1}>{dropoff}</Text>
                      </View>
                      <Text style={[s.meta, { color: 'rgba(255,255,255,0.62)' }]}>📏 {km} · ⏱ {eta} (OSRM)</Text>
                    </View>

                    {/* Doble botón GRANDE (P2 DiDi): naranja = ALGORITMO, azul =
                        PRESUPUESTO del pasajero. Tocar uno = precio FINAL sellado. */}
                    <Pressable
                      onPress={() => aceptar(algoPrice)}
                      disabled={busy || !(algoPrice > 0)}
                      accessibilityRole="button"
                      accessibilityLabel={`Aceptar por el precio del algoritmo, ${algoPrice.toLocaleString('es')} XAF`}
                      style={[s.bigAccept, { backgroundColor: brand.secondary }, (busy || !(algoPrice > 0)) && { opacity: 0.55 }]}
                    >
                      <Text style={s.bigAcceptTop}>{algoPrice > 0 ? `Aceptar por ${algoPrice.toLocaleString('es')} XAF` : 'Precio no disponible'}</Text>
                      <Text style={s.bigAcceptSub}>Precio del algoritmo · ganas {netExact(algoPrice) ? '' : '≈ '}{netOf(algoPrice).toLocaleString('es')} XAF</Text>
                    </Pressable>
                    {userPrice > 0 && (
                      <Pressable
                        onPress={() => aceptar(userPrice)}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityLabel={`Aceptar por el presupuesto del pasajero, ${userPrice.toLocaleString('es')} XAF`}
                        style={[s.bigAccept, { backgroundColor: brand.primary }, busy && { opacity: 0.55 }]}
                      >
                        <Text style={s.bigAcceptTop}>Aceptar por {userPrice.toLocaleString('es')} XAF</Text>
                        <Text style={s.bigAcceptSub}>Presupuesto del pasajero · ganas {netExact(userPrice) ? '' : '≈ '}{netOf(userPrice).toLocaleString('es')} XAF</Text>
                      </Pressable>
                    )}
                    {busy && <ActivityIndicator color={brand.secondary} style={{ marginTop: espaciado.e8 }} />}
                  </ScrollView>
                </View>
              )}

              {/* EN RUTA = VISTA DE CONDUCCIÓN (interfaz mínima, mapa protagonista).
                  El panel se muestra SIEMPRE en ruta (independiente de current). */}
              {online && phase === 'ruta' && (
                <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
                  {/* Estado + pasajero (chip) */}
                  <View pointerEvents="none" style={[s.dvState, { alignSelf: 'flex-start', marginTop: espaciado.e4 }]}>
                    <Text style={[s.dvStateText, { backgroundColor: colors.card, color: colors.textPrimary, borderColor: colors.border }]}>
                      {leg === 'trip' ? `Viaje en progreso · ${current?.passenger_name || 'Pasajero'}` : 'Yendo a por el pasajero'}
                    </Text>
                  </View>
                  {navRoad ? (
                    <View pointerEvents="none" style={[s.dvState, { alignSelf: 'flex-start' }]}>
                      <Text style={[s.dvStateText, { backgroundColor: 'rgba(0,132,255,0.14)', color: colors.primary, borderColor: 'rgba(0,132,255,0.45)' }]}>
                        Estás en {navRoad}
                      </Text>
                    </View>
                  ) : null}

                  {/* HUD de carriles: cuadraditos azules con flechas (estilo Amap) */}
                  <View pointerEvents="none" style={s.dvLanes}>
                    {laneChips.map((g, i) => (
                      <View key={i} style={[s.dvLaneChip, { backgroundColor: i === laneChips.length - 1 && laneChips.length > 1 ? brand.primary : 'rgba(10,108,255,0.55)' }]}>
                        <Text style={s.dvLaneGlyph2}>{g}</Text>
                      </View>
                    ))}
                    <Text style={[s.dvLaneDist2, { backgroundColor: colors.card, color: colors.textPrimary, borderColor: colors.border }]}>
                      {navDist >= 1000 ? `${(navDist / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(navDist))} m`}
                    </Text>
                  </View>

                  {/* Próxima maniobra (estilo Amap: banner compacto oscuro,
                      centrado ARRIBA — no tapa la carretera por delante) */}
                  <View pointerEvents="none" style={s.dvMvCard}>
                    <View style={s.dvMvGlyphBox}>
                      <Text style={s.dvMvGlyphBig}>{navTurn ? turnGlyph(navTurn.type, navTurn.modifier) : '⬆️'}</Text>
                    </View>
                    <View style={{ flex: 1, justifyContent: 'center' }}>
                      <Text style={s.dvMvDist}>
                        {navDist >= 1000 ? `${(navDist / 1000).toFixed(1)} km` : `${Math.max(0, Math.round(navDist))} m`}
                      </Text>
                      <Text numberOfLines={1} style={s.dvMvName}>
                        {navTurn?.name || (leg === 'approach' ? 'Hacia el punto de recogida' : 'Hacia el destino')}
                      </Text>
                    </View>
                    {navTurn2 ? (
                      <View style={s.dvMvNext}>
                        <Text style={s.dvMvGlyphSmall}>{turnGlyph(navTurn2.type, navTurn2.modifier)}</Text>
                        <Text numberOfLines={1} style={s.dvMvNextText}>
                          {navTurn2.name || 'siguiente'}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Controles mínimos: rumbo · 3D · voz */}
                  <View style={s.dvCtrls} pointerEvents="box-none">
                    <Pressable onPress={() => setHeadingUp((h) => !h)} accessibilityRole="button" accessibilityLabel={headingUp ? 'Mapa orientado al movimiento (tocar: norte fijo)' : 'Mapa con norte fijo (tocar: seguir rumbo)'} style={[s.dvBtn, { backgroundColor: headingUp ? colors.primary : colors.card, borderColor: colors.border }]}>
                      <Compass size={18} color={headingUp ? brand.white : colors.textSecondary} />
                    </Pressable>
                    <Pressable onPress={() => setPitch3D((p) => !p)} accessibilityRole="button" accessibilityLabel={pitch3D ? 'Desactivar vista 3D' : 'Activar vista 3D'} style={[s.dvBtn, { backgroundColor: pitch3D ? colors.primary : colors.card, borderColor: colors.border }]}>
                      <Box size={18} color={pitch3D ? brand.white : colors.textSecondary} />
                    </Pressable>
                    <Pressable onPress={() => setVoiceOn((prev) => { const nv = !prev; if (!nv) stopAllVoice(); else setTimeout(() => sayEs('Indicaciones por voz activadas'), 150); return nv; })} accessibilityRole="button" accessibilityLabel={voiceOn ? 'Silenciar indicaciones por voz' : 'Activar indicaciones por voz'} style={[s.dvBtn, { backgroundColor: voiceOn ? colors.primary : colors.card, borderColor: colors.border }]}>
                      {voiceOn ? <Volume2 size={18} color={brand.white} /> : <VolumeX size={18} color={colors.textSecondary} />}
                    </Pressable>
                    {/* Descanso SIEMPRE disponible (también en viaje): no bloquea,
                        solo marca 'resting'; aceptar sigue siendo tu elección. */}
                    <Pressable
                      onPress={() => descansar(!resting)}
                      disabled={busy}
                      accessibilityRole="button"
                      accessibilityLabel={resting ? 'Volver a trabajar (sin selfie)' : 'Descansar (sigues recibiendo solicitudes)'}
                      style={[s.dvBtn, { backgroundColor: resting ? brand.warning : alpha(colors.card, 0.92), borderColor: resting ? brand.warning : colors.border }]}
                    >
                      {busy ? <ActivityIndicator size="small" color={resting ? '#141414' : colors.textSecondary} /> : <Text style={{ fontSize: 17, color: resting ? '#141414' : colors.textSecondary }}>☕</Text>}
                    </Pressable>
                  </View>

                  {/* Estado real del mapa (verificación 3D: b=rumbo p=inclinación) */}
                  {navDbg && (
                    <View pointerEvents="none" style={[s.dvDbg, { backgroundColor: pitch3D ? 'rgba(0,132,255,0.18)' : colors.card, borderColor: pitch3D ? colors.primary : colors.border }]}>
                      <Text style={{ color: pitch3D ? colors.primary : colors.textSecondary, fontSize: tipografia.nota, fontWeight: peso.titulo }}>
                        {pitch3D ? '3D ' : ''}b {navDbg.bearing}° · p {navDbg.pitch}° · z{navDbg.zoom}
                        {typeof navDbg.cy === 'number' ? ` · c${navDbg.cy}` : ''}
                      </Text>
                    </View>
                  )}

                  {/* Velocidad actual (transparente, no tapa el mapa) */}
                  <View style={[s.dvSpeed, { backgroundColor: 'rgba(15,20,28,0.5)', borderColor: 'rgba(255,255,255,0.16)' }]}>
                    <Text style={[s.dvSpeedNum, { color: brand.white }]}>{Math.round(navSpeed)}</Text>
                    <Text style={[s.dvSpeedUnit, { color: 'rgba(255,255,255,0.7)' }]}>km/h</Text>
                  </View>

                  {/* TARJETA B — Viaje en marcha al DESTINO FINAL (P4): TOTAL en
                      efectivo + hora + "Más". Compacta y translúcida. */}
                  {leg === 'trip' ? (
                    <>
                      <View style={[s.dvTrip, { backgroundColor: 'rgba(15,20,28,0.55)', borderColor: 'rgba(255,255,255,0.14)' }]}>
                        <View style={{ flex: 1, gap: 1 }}>
                          <Text style={{ color: 'rgba(255,255,255,0.62)', fontSize: tipografia.minimo, fontWeight: peso.maximo, letterSpacing: 0.5 }}>
                            {walletRide ? 'PAGADO CON PIN · TU NETO' : 'TOTAL EFECTIVO'}
                          </Text>
                          <Text style={[s.dvTripFare, { color: brand.white }]}>
                            {walletRide
                              ? `${netRide.toLocaleString('es')} XAF`
                              : fareTotal > 0 ? `${fareTotal.toLocaleString('es')} XAF` : '—'}
                          </Text>
                          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: tipografia.caption, fontWeight: peso.maximo }}>
                            Llega {new Date(Date.now() + (navMinLeft || 0) * 60000).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })} ·{' '}
                            {navKmLeft != null ? `${navKmLeft < 1 ? `${Math.round(navKmLeft * 1000)} m` : `${navKmLeft.toFixed(1)} km`} · ${navMinLeft ?? '—'} min` : 'calculando…'}
                          </Text>
                        </View>
                        <Pressable
                          onPress={() => setTripExpanded((v) => !v)}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={tripExpanded ? 'Ocultar detalles del viaje' : 'Ver más detalles del viaje'}
                          style={[s.dvMoreBtn, { borderColor: 'rgba(255,255,255,0.22)' }]}
                        >
                          {tripExpanded ? <ChevronDown size={14} color="rgba(255,255,255,0.9)" /> : <ChevronUp size={14} color="rgba(255,255,255,0.9)" />}
                          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: tipografia.nota, fontWeight: peso.maximo }}>{tripExpanded ? 'Menos' : 'Más'}</Text>
                        </Pressable>
                      </View>
                      {tripExpanded && current && (
                        <View style={[s.dvTripMore, { backgroundColor: 'rgba(15,20,28,0.62)', borderColor: 'rgba(255,255,255,0.14)' }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6 }}>
                            <MapPin size={12} color={brand.success} />
                            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: tipografia.caption, fontWeight: peso.medio, flex: 1 }} numberOfLines={1}>{pickup}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6 }}>
                            <Flag size={12} color={brand.secondary} />
                            <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: tipografia.caption, fontWeight: peso.medio, flex: 1 }} numberOfLines={1}>{dropoff}</Text>
                          </View>
                          <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.6)', fontSize: 10.5, fontWeight: peso.medio }}>
                            👤 {current.passenger_name || 'Pasajero'} · {paxCount} {paxCount === 1 ? 'pasajero' : 'pasajeros'}
                          </Text>
                        </View>
                      )}
                    </>
                  ) : (
                    /* TARJETA A — "Camino para recoger al pasajero": dirección +
                       WhatsApp y teléfono. Transparente y compacta. */
                    <View pointerEvents="box-none" style={[s.dvCardA, { backgroundColor: 'rgba(15,20,28,0.5)', borderColor: 'rgba(255,255,255,0.14)' }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: brand.success, fontSize: tipografia.nota, fontWeight: peso.titulo, letterSpacing: 0.4 }}>🟢 CAMINO PARA RECOGER AL PASAJERO</Text>
                        <Text numberOfLines={1} style={{ color: brand.white, fontSize: tipografia.body, fontWeight: peso.maximo, marginTop: espaciado.e2 }}>{pickup}</Text>
                        {current?.passenger_name ? (
                          <Text numberOfLines={1} style={{ color: 'rgba(255,255,255,0.62)', fontSize: tipografia.micro, fontWeight: peso.medio, marginTop: 1 }}>👤 {current.passenger_name}</Text>
                        ) : null}
                      </View>
                      <View style={{ flexDirection: 'row', gap: espaciado.e8 }}>
                        <Pressable
                          onPress={() => { const d = (current?.passenger_phone || '').replace(/\D/g, ''); if (d) Linking.openURL(`https://wa.me/${d}`).catch(() => {}); }}
                          disabled={!current?.passenger_phone}
                          accessibilityRole="button"
                          accessibilityLabel="Escribir al pasajero por WhatsApp"
                          style={[s.contactBtn, { backgroundColor: brand.success }]}
                        >
                          <MessageCircle size={17} color={brand.white} />
                        </Pressable>
                        <Pressable
                          onPress={() => { const d = (current?.passenger_phone || '').replace(/\D/g, ''); if (d) Linking.openURL(`tel:${d}`).catch(() => {}); }}
                          disabled={!current?.passenger_phone}
                          accessibilityRole="button"
                          accessibilityLabel="Llamar al pasajero"
                          style={[s.contactBtn, { backgroundColor: brand.primary }]}
                        >
                          <Phone size={17} color={brand.white} />
                        </Pressable>
                      </View>
                    </View>
                  )}

                  {/* PIN del pasajero (solo al LLEGAR: pídele el código) */}
                  {leg === 'approach' && (navKmLeft ?? 1) < 0.08 && current?.passenger_phone ? (
                    <View pointerEvents="none" style={[s.dvPin, { backgroundColor: 'rgba(15,20,28,0.6)', borderColor: 'rgba(43,194,106,0.5)' }]}>
                      <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: tipografia.nota, fontWeight: peso.maximo, letterSpacing: 0.4 }}>CÓDIGO DEL PASAJERO</Text>
                      <Text style={{ color: brand.success, fontSize: 17, fontWeight: peso.titulo, letterSpacing: 5 }}>{pinLast4(current.passenger_phone)}</Text>
                    </View>
                  ) : null}

                  {/* Botones: Cancelar / Recoger al llegar · Terminar y cobrar */}
                  <View style={s.dvActions} pointerEvents="box-none">
                    <Pressable onPress={alertCancel} accessibilityRole="button" accessibilityLabel="Cancelar y alertar" style={[s.dvCancel, { backgroundColor: 'rgba(15,20,28,0.5)', borderColor: 'rgba(255,255,255,0.2)' }]}>
                      <X size={18} color={brand.danger} />
                    </Pressable>
                    <Pressable
                      onPress={() => {
                        // RECOGIDA: al llegar, pedir el CÓDIGO de 4 dígitos al
                        // pasajero (panel profesional) → validado → in_progress.
                        // P1-c: viaje con monedero → «He llegado» (el cierre lo
                        // confirma el pasajero o auto a los 10 min). Efectivo:
                        // Terminar el viaje exige CONFIRMAR el cobro (modal P4).
                        if (leg === 'approach' && (navKmLeft ?? 1) < 0.08) {
                          if (!current?.passenger_phone) { avanzar('in_progress'); return; }
                          setPinOpen(true);
                        } else if (walletRide && !rideArrived) {
                          void heLlegado();
                        } else if (walletRide && rideArrived) {
                          /* esperando al pasajero: sin acción */
                        } else {
                          setCashOpen(true);
                        }
                      }}
                      disabled={busy || (walletRide && rideArrived)}
                      accessibilityRole="button"
                      accessibilityLabel={leg === 'approach' && (navKmLeft ?? 1) < 0.08 ? 'Recoger pasajero' : walletRide ? (rideArrived ? 'Esperando confirmación del pasajero' : 'Marcar llegada al destino') : 'Terminar viaje y cobrar'}
                      style={[s.dvMain, {
                        backgroundColor: leg === 'approach' && (navKmLeft ?? 1) < 0.08
                          ? brand.success
                          : walletRide ? (rideArrived ? '#8A8F98' : brand.warning) : brand.danger,
                      }, busy && { opacity: 0.6 }]}
                    >
                      {leg === 'approach' && (navKmLeft ?? 1) < 0.08 ? (
                        <>
                          <CheckCircle2 size={18} color={brand.white} />
                          <Text style={s.dvMainText}>Recoger pasajero</Text>
                        </>
                      ) : walletRide ? (
                        rideArrived ? (
                          <>
                            <Text style={{ fontSize: 15 }}>⏳</Text>
                            <Text style={s.dvMainText}>Esperando confirmación del pasajero</Text>
                          </>
                        ) : (
                          <>
                            <Flag size={18} color={brand.white} />
                            <Text style={s.dvMainText}>He llegado al destino</Text>
                          </>
                        )
                      ) : (
                        <>
                          <Banknote size={18} color={brand.white} />
                          <Text style={s.dvMainText}>Terminar viaje y cobrar</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>
              )}
            </View>

            {/* P1: botón de PERFIL transparente abajo-derecha (abre el
                bottom-sheet Home en la pestaña Perfil). Oculto durante la
                oferta y la conducción para no estorbar. */}
            {phase !== 'offer' && phase !== 'ruta' && (
              <>
                {heatOn && (
                  <View pointerEvents="none" style={[s.heatChip, { backgroundColor: alpha(brand.warning, 0.92) }]}>
                    <Text style={{ color: brand.onWarning, fontSize: tipografia.caption, fontWeight: peso.maximo }}>
                      🔥 Zonas calientes (simulación) · sin demanda real aún
                    </Text>
                  </View>
                )}
                {/* EMERGENCIA (mapa): marcación directa 24/7 (ícono tipo DiDi SOS) */}
                <Pressable
                  onPress={() => setEmergencyOpen(true)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Emergencia: marcación directa 24/7"
                  style={[s.homeFab, { bottom: 216, backgroundColor: 'rgba(245,63,63,0.92)', borderColor: brand.danger }]}
                >
                  <Siren size={18} color={brand.white} />
                </Pressable>
                <Pressable
                  onPress={toggleHeat}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={heatOn ? 'Ocultar zonas calientes' : 'Mostrar zonas calientes simuladas'}
                  accessibilityState={{ selected: heatOn }}
                  style={[s.homeFab, { bottom: 156, backgroundColor: heatOn ? alpha(brand.warning, 0.9) : alpha(colors.card, 0.55), borderColor: heatOn ? brand.warning : alpha(colors.border, 0.8) }]}
                >
                  <Text style={{ fontSize: tipografia.cifra }}>🔥</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setHomeTab('perfil'); setHomeOpen(true); }}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Abrir perfil y opciones del conductor"
                  style={[s.homeFab, { bottom: 96, backgroundColor: alpha(colors.card, 0.55), borderColor: alpha(colors.border, 0.8) }]}
                >
                  <UserRound size={21} color={colors.primary} />
                </Pressable>
              </>
            )}
          </View>
        </>
      )}

      <EmergencyModal visible={emergencyOpen} onClose={() => setEmergencyOpen(false)} />
      <CashFlowModal
        visible={cashOpen}
        amount={fareTotal}
        busy={busy}
        onYes={() => terminarViaje(true)}
        onNo={() => terminarViaje(false)}
        onClose={() => setCashOpen(false)}
      />
      <PinPadModal
        visible={pinOpen}
        passengerName={current?.passenger_name}
        busy={busy}
        onCancel={() => setPinOpen(false)}
        onOk={async (d) => {
          // Valida los 4 dígitos contra el PIN derivado del teléfono del pasajero.
          if (current && pinLast4(current.passenger_phone) === d) {
            setPinOpen(false);
            await avanzar('in_progress');
            return true;
          }
          return false;
        }}
      />
      <DriverHomeSheet visible={homeOpen} tab={homeTab} onClose={() => setHomeOpen(false)} />
    </View>
  );
}

/** P4 — Modal "¿Recibiste el dinero?" (efectivo) al terminar el viaje.
 *  · SÍ  → se completa y el conductor sigue disponible.
 *  · NO  → se completa y el conductor queda BLOQUEADO (servidor) para nuevas
 *          solicitudes hasta que confirme el cobro desde la tarjeta de espera. */
/** RECOGIDA — Panel profesional para pedir el CÓDIGO (PIN) al pasajero.
 *  Teclado numérico; con 4 dígitos valida contra onOk (PIN = últimos 4 del
 *  teléfono del pasajero). Acierto → siguiente estado; fallo → error y borra. */
function PinPadModal({ visible, passengerName, busy, onCancel, onOk }: {
  visible: boolean; passengerName?: string; busy: boolean;
  onCancel: () => void; onOk: (digits: string) => Promise<boolean>;
}) {
  const [digits, setDigits] = useState('');
  const [err, setErr] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => { if (visible) { setDigits(''); setErr(false); setChecking(false); } }, [visible]);

  const press = (k: string) => {
    if (busy || checking) return;
    setErr(false);
    if (k === 'DEL') { setDigits((d) => d.slice(0, -1)); return; }
    if (digits.length >= 4) return;
    const next = digits + k;
    setDigits(next);
    if (next.length === 4) {
      setChecking(true);
      (async () => {
        const ok = await onOk(next).catch(() => false);
        if (!ok) { setDigits(''); setErr(true); }
        setChecking(false);
      })();
    }
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'DEL'];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={pps.overlay}>
        <View style={pps.card}>
          <View style={pps.iconCircle}>
            <ShieldCheck size={26} color={brand.success} />
          </View>
          <Text style={pps.title}>Código del pasajero</Text>
          <Text style={pps.sub} numberOfLines={1}>
            Pídele a {passengerName || 'el pasajero'} el código de 4 dígitos
          </Text>

          {/* Cajas del código */}
          <View style={pps.boxRow}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={[pps.box, { borderColor: err ? brand.danger : digits.length > i ? brand.success : '#E5E7EB' }]}>
                <Text style={{ color: '#111827', fontSize: 26, fontWeight: peso.titulo }}>{digits[i] ?? ''}</Text>
              </View>
            ))}
          </View>
          {err ? <Text style={pps.errTxt}>Código incorrecto — vuelve a preguntarlo</Text> : null}
          {checking ? <ActivityIndicator color={brand.success} style={{ marginVertical: espaciado.e6 }} /> : null}

          {/* Teclado */}
          <View style={pps.pad}>
            {keys.map((k, idx) =>
              k === '' ? <View key={idx} style={pps.key} />
                : (
                  <Pressable key={idx} onPress={() => press(k)} disabled={busy || checking}
                    accessibilityRole="button" accessibilityLabel={k === 'DEL' ? 'Borrar dígito' : `Dígito ${k}`}
                    style={({ pressed }) => [pps.key, { backgroundColor: k === 'DEL' ? '#F53F3F10' : '#F3F4F6', opacity: pressed ? 0.6 : 1 }]}>
                    {k === 'DEL'
                      ? <X size={20} color={brand.danger} />
                      : <Text style={{ color: '#111827', fontSize: tipografia.subtitulo, fontWeight: peso.maximo }}>{k}</Text>}
                  </Pressable>
                ),
            )}
          </View>

          <Pressable onPress={onCancel} disabled={busy} accessibilityRole="button" accessibilityLabel="Cancelar petición de código" style={{ marginTop: espaciado.e10 }}>
            <Text style={{ color: '#6B7280', fontSize: tipografia.body, fontWeight: peso.fuerte }}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const pps = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: espaciado.e24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: brand.white, borderRadius: radios.marco, padding: espaciado.e22, alignItems: 'center', gap: espaciado.e6 },
  iconCircle: { width: 54, height: 54, borderRadius: radios.full, backgroundColor: '#27AE6018', alignItems: 'center', justifyContent: 'center', marginBottom: espaciado.e2 },
  title: { color: '#111827', fontSize: tipografia.cifra, fontWeight: peso.titulo, textAlign: 'center' },
  sub: { color: '#6B7280', fontSize: tipografia.caption, fontWeight: peso.medio, textAlign: 'center' },
  boxRow: { flexDirection: 'row', gap: espaciado.e12, marginVertical: espaciado.e12 },
  box: { width: 56, height: 64, borderRadius: radios.md, borderWidth: trazo.fuerte, alignItems: 'center', justifyContent: 'center' },
  errTxt: { color: brand.danger, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e2 },
  pad: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: espaciado.e8, marginTop: espaciado.e8 },
  key: { width: 76, height: altura.boton, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center' },
});

function CashFlowModal({ visible, amount, busy, onYes, onNo, onClose }: {
  visible: boolean; amount: number; busy: boolean;
  onYes: () => void; onNo: () => void; onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={cfm.overlay}>
        <View style={cfm.card}>
          <View style={cfm.iconCircle}>
            <Banknote size={30} color={brand.success} />
          </View>
          <Text style={cfm.title}>¿Recibiste el dinero?</Text>
          <Text style={cfm.sub}>Viaje en efectivo · cobra al pasajero antes de continuar</Text>
          <Text style={cfm.amount}>{amount > 0 ? `${amount.toLocaleString('es')} XAF` : '— XAF'}</Text>
          <Pressable
            onPress={onYes}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Sí, recibí el dinero en efectivo"
            style={[cfm.btnYes, busy && { opacity: 0.6 }]}
          >
            {busy ? <ActivityIndicator color={brand.white} /> : <Text style={cfm.btnYesTxt}>Sí, lo recibí ✓</Text>}
          </Pressable>
          <Pressable
            onPress={onNo}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="No recibí el dinero"
            style={[cfm.btnNo, busy && { opacity: 0.6 }]}
          >
            <Text style={cfm.btnNoTxt}>No recibí el dinero</Text>
          </Pressable>
          <Text style={cfm.note}>
            Si marcas "No", no recibirás solicitudes nuevas hasta confirmar el cobro (bloqueo en servidor).
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const cfm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: espaciado.e24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: brand.white, borderRadius: radios.marco, padding: espaciado.e22, alignItems: 'center', gap: espaciado.e8 },
  iconCircle: { width: 60, height: 60, borderRadius: radios.full, backgroundColor: '#27AE6018', alignItems: 'center', justifyContent: 'center', marginBottom: espaciado.e4 },
  title: { color: '#111827', fontSize: tipografia.title, fontWeight: peso.titulo, textAlign: 'center' },
  sub: { color: '#6B7280', fontSize: tipografia.body, fontWeight: peso.medio, textAlign: 'center' },
  amount: { color: '#111827', fontSize: tipografia.heroGrande, fontWeight: peso.titulo, marginVertical: espaciado.e6 },
  btnYes: { width: '100%', backgroundColor: brand.success, borderRadius: radios.lg, paddingVertical: 15, alignItems: 'center', marginTop: espaciado.e6, elevation: 3 },
  btnYesTxt: { color: brand.white, fontSize: tipografia.subtitle, fontWeight: peso.titulo },
  btnNo: { width: '100%', borderWidth: trazo.base, borderColor: '#F53F3F55', borderRadius: radios.lg, paddingVertical: espaciado.e12, alignItems: 'center', marginTop: espaciado.e8, backgroundColor: '#F53F3F0C' },
  btnNoTxt: { color: brand.danger, fontSize: tipografia.fino, fontWeight: peso.maximo },
  note: { color: '#9CA3AF', fontSize: tipografia.micro, fontWeight: peso.medio, textAlign: 'center', marginTop: espaciado.e6 },
});

const styles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e16, paddingTop: espaciado.e12, paddingBottom: espaciado.e6 },
    title: { fontSize: tipografia.cabecera, fontWeight: peso.maximo, color: c.textPrimary },
    error: { fontSize: tipografia.caption, fontWeight: peso.fuerte, textAlign: 'center', marginHorizontal: espaciado.e16 },
    mapWrap: { height: '50%', position: 'relative' },
    mapArea: { flex: 1, position: 'relative' },
    overlayWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, top: 0, justifyContent: 'flex-end', padding: espaciado.e12 },
    bottomCard: {
      width: '100%', maxHeight: '36%', borderRadius: radios.marco, borderWidth: trazo.fino,
      padding: espaciado.e14, gap: espaciado.e10,
      ...elevation.lg,
    },
    offerContent: { gap: espaciado.e12, paddingBottom: espaciado.e6 },
    warnStrip: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e7, marginHorizontal: espaciado.e12, marginTop: espaciado.e6, backgroundColor: '#F53F3F14', borderRadius: 10, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e6 },
    rutaNoticePill: {
      alignSelf: 'center', marginTop: espaciado.e8, borderRadius: radios.full, borderWidth: trazo.fino,
      backgroundColor: 'rgba(15,20,28,0.82)', paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e8,
    },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, width: '100%' },
    statusDot: { width: 12, height: 12, borderRadius: 6 },
    goOnlineBtn: { width: '100%', backgroundColor: brand.success, borderRadius: radios.full, paddingVertical: 15, alignItems: 'center', elevation: 4 },
    goOnlineText: { color: brand.white, fontSize: tipografia.subtitle, fontWeight: peso.titulo, letterSpacing: 0.2 },
    followBtn: { position: 'absolute', top: 8, right: 10, flexDirection: 'row', alignItems: 'center', gap: espaciado.e5, borderRadius: radios.full, borderWidth: trazo.fino, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e6, elevation: 4 },
    navRow: { flexDirection: 'row', alignItems: 'baseline', gap: espaciado.e6, marginTop: espaciado.e2 },
    badge: { position: 'absolute', top: 64, alignSelf: 'center', borderRadius: radios.full, paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e6, elevation: 4 },
    panel: { flex: 1, margin: espaciado.e12, borderRadius: 20, borderWidth: trazo.fino, padding: espaciado.e16, gap: espaciado.e10, alignItems: 'center', justifyContent: 'center' },
    waitText: { fontSize: tipografia.body, fontWeight: peso.medio, marginTop: espaciado.e8 },
    countRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, width: '100%' },
    countTrack: { flex: 1, height: 6, borderRadius: radios.punta, backgroundColor: c.border, overflow: 'hidden' },
    countFill: { height: 6, backgroundColor: brand.secondary, borderRadius: radios.punta },
    netLabel: { fontSize: tipografia.micro, fontWeight: peso.fuerte, letterSpacing: 0.4 },
    netAmount: { fontSize: tipografia.display, fontWeight: peso.titulo },
    routeInfo: { width: '100%', gap: espaciado.e4, marginTop: espaciado.e4 },
    routeText: { fontSize: tipografia.body, fontWeight: peso.fuerte, flex: 1 },
    meta: { fontSize: tipografia.caption, fontWeight: peso.medio, marginTop: espaciado.e4 },
    priceRow: { flexDirection: 'row', gap: espaciado.e10, width: '100%' },
    priceChip: { flex: 1, borderRadius: 14, borderWidth: trazo.base, padding: espaciado.e10, alignItems: 'center', gap: espaciado.e2 },
    acceptBtn: { width: '100%', backgroundColor: brand.success, borderRadius: radios.panel, paddingVertical: 15, alignItems: 'center', gap: espaciado.e2, elevation: 4 },
    acceptText: { color: brand.white, fontSize: 17, fontWeight: peso.titulo },
    bigAccept: { width: '100%', borderRadius: radios.lg, paddingVertical: espaciado.e13, paddingHorizontal: espaciado.e14, alignItems: 'center', gap: espaciado.e2, elevation: 3 },
    bigAcceptTop: { color: brand.white, fontSize: 17, fontWeight: peso.titulo },
    bigAcceptSub: { color: 'rgba(255,255,255,0.9)', fontSize: tipografia.caption, fontWeight: peso.medio },
    headerState: { fontSize: tipografia.subtitle, fontWeight: peso.maximo },
    passenger: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, width: '100%' },
    avatar: { width: 46, height: 46, borderRadius: radios.full, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' },
    roundBtn: { width: 46, height: 46, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center' },
    goBtn: { width: '100%', backgroundColor: brand.primary, borderRadius: radios.lg, paddingVertical: espaciado.e13, alignItems: 'center' },
    goText: { color: brand.white, fontSize: 15, fontWeight: peso.maximo },
    endBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e8, width: '100%', backgroundColor: brand.danger, borderRadius: radios.lg, paddingVertical: espaciado.e14 },
    endText: { color: brand.white, fontSize: 15, fontWeight: peso.titulo },
    alertBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e8, width: '100%', borderWidth: trazo.fino, borderColor: '#F53F3F55', borderRadius: 14, paddingVertical: espaciado.e11, backgroundColor: '#F53F3F10' },
    // ── Vista de conducción ──
    dvState: { paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e4, marginTop: espaciado.e2 },
    dvStateText: { fontSize: tipografia.caption, fontWeight: peso.maximo, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e6, borderRadius: radios.full, borderWidth: trazo.fino, overflow: 'hidden' },
    dvLane: { position: 'absolute', top: 92, left: 12, width: 74, height: 74, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center', ...elevation.lg },
    dvLanes: { position: 'absolute', top: 212, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e6 },
    dvLaneChip: { width: 36, height: 36, borderRadius: radios.hermano, alignItems: 'center', justifyContent: 'center', elevation: 4 },
    dvLaneGlyph2: { color: brand.white, fontSize: tipografia.cifra, fontWeight: peso.titulo },
    dvLaneDist2: { fontSize: tipografia.caption, fontWeight: peso.maximo, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3, borderRadius: radios.sm, borderWidth: trazo.fino, color: brand.white, backgroundColor: 'rgba(10,16,28,0.7)', borderColor: 'transparent' },
    dvLaneGlyph: { color: brand.white, fontSize: tipografia.heroGrande, fontWeight: peso.titulo },
    dvLaneDist: { color: brand.white, fontSize: 10.5, fontWeight: peso.titulo, marginTop: -4 },
    dvMvCard: { position: 'absolute', top: 150, alignSelf: 'center', maxWidth: '82%', flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, borderRadius: radios.full, backgroundColor: 'rgba(10,16,28,0.80)', paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e6, ...elevation.lg },
    dvMvGlyphBox: { width: 42, height: 42, borderRadius: radios.full, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
    dvMvGlyphBig: { fontSize: tipografia.tituloFicha, fontWeight: peso.titulo },
    dvMvGlyphSmall: { fontSize: 15 },
    dvMvDist: { fontSize: tipografia.cifraGrande, fontWeight: peso.titulo, color: brand.white },
    dvMvName: { fontSize: tipografia.caption, fontWeight: peso.fuerte, color: 'rgba(255,255,255,0.85)', marginTop: 1 },
    dvMvNext: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, borderLeftWidth: trazo.fino, borderLeftColor: 'rgba(255,255,255,0.3)', paddingLeft: espaciado.e8, maxWidth: 90 },
    dvMvNextText: { fontSize: 10.5, fontWeight: peso.medio, color: 'rgba(255,255,255,0.8)' },
    dvCtrls: { position: 'absolute', top: 8, right: 10, gap: espaciado.e8 },
    dvDbg: { position: 'absolute', top: 210, right: 10, borderRadius: radios.sm, borderWidth: trazo.fino, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e4 },
    dvBtn: { width: 42, height: 42, borderRadius: radios.full, borderWidth: trazo.fino, alignItems: 'center', justifyContent: 'center', elevation: 4 },
    dvSpeed: { position: 'absolute', bottom: 104, left: 14, width: 74, height: 74, borderRadius: radios.full, borderWidth: trazo.fuerte, alignItems: 'center', justifyContent: 'center', elevation: 5 },
    dvSpeedNum: { fontSize: tipografia.cifraGrande, fontWeight: peso.titulo },
    dvSpeedUnit: { fontSize: 9, fontWeight: peso.fuerte },
    dvEta: { position: 'absolute', bottom: 96, right: 14, borderRadius: 14, borderWidth: trazo.fino, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8, elevation: 5 },
    dvEtaClock: { fontSize: tipografia.body, fontWeight: peso.titulo },
    dvEtaSub: { fontSize: tipografia.micro, fontWeight: peso.medio },
    dvActions: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e8 },
    dvPin: { position: 'absolute', bottom: 172, alignSelf: 'center', alignItems: 'center', borderRadius: radios.md, borderWidth: trazo.fino, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e5, elevation: 5 },
    // P4: tarjeta del viaje EN MARCHA (TOTAL efectivo + hora + "Más" expandible)
    dvTrip: {
      position: 'absolute', bottom: 96, right: 14, left: 118, borderRadius: 14, borderWidth: trazo.fino,
      paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, elevation: 5,
    },
    dvTripFare: { fontSize: 17, fontWeight: peso.titulo },
    dvMoreBtn: { flexDirection: 'column', alignItems: 'center', gap: 1, borderWidth: trazo.fino, borderRadius: 10, paddingHorizontal: espaciado.e7, paddingVertical: espaciado.e4 },
    dvTripMore: {
      position: 'absolute', bottom: 172, right: 14, left: 118, borderRadius: radios.md, borderWidth: trazo.fino,
      padding: espaciado.e8, gap: espaciado.e5, elevation: 5,
    },
    dvCancel: { width: 48, height: 48, borderRadius: radios.full, borderWidth: trazo.fino, alignItems: 'center', justifyContent: 'center', elevation: 5 },
    dvMain: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e8, borderRadius: 20, paddingVertical: espaciado.e13, elevation: 6 },
    dvMainText: { color: brand.white, fontSize: tipografia.fino, fontWeight: peso.titulo },
    // P1: botón de perfil TRANSPARENTE abajo-derecha sobre el mapa (Home sheet)
    homeFab: {
      position: 'absolute', right: 14, width: 48, height: 48, borderRadius: radios.full,
      borderWidth: trazo.base, alignItems: 'center', justifyContent: 'center',
      ...elevation.md,
    },
    heatChip: {
      position: 'absolute', top: 10, alignSelf: 'center', borderRadius: radios.full,
      paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e7, elevation: 5,
    },
    // ── Espera: radar de búsqueda DENTRO del mapa (transparente) ──
    waitRadarWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
    waitRadarCard: {
      alignItems: 'center', borderRadius: radios.panelAncho, borderWidth: trazo.fino, paddingHorizontal: espaciado.e22, paddingVertical: espaciado.e14,
      backgroundColor: 'rgba(15,20,28,0.45)',
    },
    restPill: {
      marginTop: espaciado.e14, borderRadius: radios.full, borderWidth: trazo.fino, paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e8,
      backgroundColor: 'rgba(15,20,28,0.45)',
    },
    // ── Ruta: tarjetas A/B compactas y translúcidas + botones ──
    dvCardA: {
      position: 'absolute', bottom: 96, right: 14, left: 118, borderRadius: 14, borderWidth: trazo.fino,
      paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8, flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, elevation: 5,
    },
    contactBtn: { width: 36, height: 36, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center', elevation: 3 },
  });

// ── P2 DiDi: estilos de la tarjeta de SOLICITUD OSCURA (paleta fija, no sigue
// el tema claro/oscuro de la app). El fondo/borde van inline sobre s.bottomCard. ──
const PK = StyleSheet.create({
  countTxt: { color: 'rgba(255,255,255,0.85)', fontWeight: peso.fuerte, fontSize: 15 },
  paxRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e11, width: '100%' },
  avatar: { width: 46, height: 46, borderRadius: radios.full, backgroundColor: brand.primary, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: brand.white, fontSize: tipografia.title, fontWeight: peso.titulo },
  name: { color: brand.white, fontSize: tipografia.cifra, fontWeight: peso.titulo, flexShrink: 1 },
  badgeGreen: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e3,
    backgroundColor: 'rgba(43,194,106,0.16)', borderRadius: radios.full, paddingHorizontal: espaciado.e7, paddingVertical: espaciado.e2,
  },
  badgeGreenTxt: { color: brand.success, fontSize: 10.5, fontWeight: peso.maximo },
  badgeGray: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e3,
    backgroundColor: 'rgba(255,255,255,0.10)', borderRadius: radios.full, paddingHorizontal: espaciado.e7, paddingVertical: espaciado.e2,
  },
  badgeGrayTxt: { color: 'rgba(255,255,255,0.6)', fontSize: 10.5, fontWeight: peso.fuerte },
  metaTxt: { color: 'rgba(255,255,255,0.66)', fontSize: tipografia.caption, fontWeight: peso.medio },
  vLine: { width: 2, height: 16, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: radios.pista, marginVertical: 1 },
});
