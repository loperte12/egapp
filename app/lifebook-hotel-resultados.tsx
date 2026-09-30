/**
 * lifebook-hotel-resultados — LA LISTA DE RESULTADOS + EL MAPA CON DRAWER.
 *
 * REESTRUCTURADA el 30-sep-2026 desde el diseño del 快搭 (`pruebas/kuaida-v12/results.html`):
 * TopBar (56) + buscador (52) + barra de chips + lista de tarjetas + FAB «Ver en mapa»
 * que abre un drawer del 70 % con el mapa real y una tira horizontal de mini-tarjetas.
 *
 * QUÉ ENTRA DEL DISEÑO Y QUÉ NO, Y POR QUÉ (auditoría completa en `docs/KUAIDA-V12-AUDITORIA.md`):
 *  · **El mapa del diseño era un DEMO**: burbujas colocadas por hash, sin dato real. Aquí va el
 *    mapa REAL (`packages/map`, MapLibre en WebView self-hosted): cada hotel con `lat`/`lng` que
 *    manda el servidor se pinta como pin con su precio, y el drawer hace `fitBounds` sobre ellos.
 *    Un hotel sin coordenadas NO se inventa posición: queda fuera del mapa y se cuenta en el
 *    encabezado («N sin ubicación»).
 *  · **«Estrellas», «Distancia» y «Ordenar» no existen en el servidor**: el DTO de la búsqueda
 *    sólo admite city/fechas/huéspedes/precio/página (`sort` responde 400). Se aplican EN EL
 *    CLIENTE sobre la página cargada — el mismo trato que ya recibe «Cerca de mí» en el
 *    buscador, y por eso el control promete poco: filtra y ordena lo que está en pantalla.
 *  · **«Amenities» se cae**: `HotelSummary` no trae servicios (viven en `HotelProfile`, otra
 *    ruta) y filtrar por algo que no llega es mentir. Pendiente de servidor.
 *  · **El conversor EUR/USD del diseño fuera**: el cobro es en XAF (`HotelFx` ya lo resuelve
 *    el servidor cuando hace falta; aquí no hay cambio de moneda).
 *  · **La barra inferior de pestañas del diseño no entra**: la app tiene su propia navegación;
 *    meter un TabBar en esta pantalla habría dos formas de «ir a inicio».
 *  · Los precios del diseño usaban prefijo «XAF 45 000»: aquí manda el formato de la app
 *    («45 000 XAF», con espacio, vía `xaf()`).
 *  · El rojo de peligro del diseño (`#FF6B6B`) se sustituye por los tokens del tema.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, Easing, FlatList, PanResponder, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  alpha, espaciado, FormField, GhostButton, PrimaryButton, radios, tipografia, trazo, useTheme, peso,
} from '@egrouteplan/ui-kit';
import { EgCamera, EgMarkers, EgMapView, type EgMapViewHandle, type MapMarker } from '../packages/map';
import type { Coord } from '../packages/map';
import { HotelResultCard } from '../components/HotelResultCard';
import { LazyImage } from '../components/rental/LazyImage';
import { hotelApi, type HotelSearchResult } from '../api/hotel';
import { ApiError } from '../api/httpClient';
import { absUrl } from '../api/config';
import { getCurrentGqPosition } from '../api/locate';
import { havKm } from '../utils/distancia';
import { nightsBetween, xaf } from '../utils/datetime';

/** Normaliza para buscar en vivo: minúsculas y sin acentos, igual que el diseño. */
function norm(s: string | null | undefined): string {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

type Orden = 'recom' | 'priceAsc' | 'priceDesc' | 'rating' | 'distAsc';
type Fila = { h: HotelSearchResult['hotels'][number]; km: number | null };

const ORDEN_ETIQUETA: Record<Orden, string> = {
  recom: 'Recomendado', priceAsc: 'Precio: menor a mayor', priceDesc: 'Precio: mayor a menor',
  rating: 'Mejor valorados', distAsc: 'Más cercanos',
};

/** Rangos rápidos de precio del diseño: chip → min/max que SÍ admite el servidor. */
const RANGOS_PRECIO = [
  { id: 'low', etiqueta: 'Menos de 30 000', chip: '<30 000', min: undefined, max: 29_999 },
  { id: 'mid', etiqueta: '30 000 – 60 000', chip: '30–60 000', min: 30_000, max: 60_000 },
  { id: 'high', etiqueta: 'Más de 60 000', chip: '>60 000', min: 60_001, max: undefined },
] as const;

const RANGOS_VALORACION = [
  { valor: 3, etiqueta: '★ 3,0 o más', chip: '≥3,0' },
  { valor: 4, etiqueta: '★ 4,0 o más', chip: '≥4,0' },
  { valor: 4.5, etiqueta: '★ 4,5 o más', chip: '≥4,5' },
] as const;

const RANGOS_DISTANCIA = [
  { valor: 2, etiqueta: 'Hasta 2 km', chip: '≤2 km' },
  { valor: 5, etiqueta: 'Hasta 5 km', chip: '≤5 km' },
] as const;

export default function HotelResultadosScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const p = useLocalSearchParams<{
    city?: string; checkIn?: string; checkOut?: string; guests?: string; units?: string;
  }>();

  const [ciudad, setCiudad] = useState(p.city ?? '');
  const [huespedes] = useState(Number(p.guests ?? 2));
  const [habitaciones] = useState(Number(p.units ?? 1));
  const [datos, setDatos] = useState<HotelSearchResult | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Filtro de precio: SE REENVÍA AL SERVIDOR (`minPrice`/`maxPrice`), como antes. */
  const [rangoPrecio, setRangoPrecio] = useState<'low' | 'mid' | 'high' | null>(null);
  const [minTexto, setMinTexto] = useState('');
  const [maxTexto, setMaxTexto] = useState('');
  const [aplicado, setAplicado] = useState<{ min?: number; max?: number; error?: string }>({});
  const [panelAbierto, setPanelAbierto] = useState<'precio' | 'estrellas' | 'distancia' | 'orden' | null>(null);

  /** Filtros y orden EN CLIENTE sobre la página cargada (el servidor no los admite). */
  const [consulta, setConsulta] = useState('');
  const [valoracionMin, setValoracionMin] = useState<number | null>(null);
  const [distMax, setDistMax] = useState<number | null>(null);
  const [miPos, setMiPos] = useState<Coord | null>(null);
  const [avisoGps, setAvisoGps] = useState<string | null>(null);
  const [orden, setOrden] = useState<Orden>('recom');

  /** Paginación. 20 como antes; el servidor lo llama `pageSize`. */
  const POR_PAGINA = 20;
  const [pagina, setPagina] = useState(1);
  const [masCargando, setMasCargando] = useState(false);

  const checkIn = p.checkIn ?? undefined;
  const checkOut = p.checkOut ?? undefined;
  const noches = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;

  const cargar = useCallback(async (silencioso = false, pag = 1) => {
    if (!silencioso) setCargando(true);
    setError(null);
    try {
      const out = await hotelApi.search({
        city: ciudad || undefined,
        checkIn,
        checkOut,
        guests: huespedes,
        units: habitaciones,
        minPrice: aplicado.min,
        maxPrice: aplicado.max,
        page: pag,
        limit: POR_PAGINA,
      });
      // Al paginar se ACUMULA; al buscar de nuevo se reemplaza. Si no, «Ver más» borraría lo
      // que el usuario ya estaba mirando.
      setDatos((prev) => (pag > 1 && prev ? { ...out, hotels: [...prev.hotels, ...(out.hotels ?? [])] } : out));
      setPagina(pag);
    } catch (e) {
      // El error se ENSEÑA: un fallo de red no puede parecer «no hay hoteles».
      setError(e instanceof ApiError ? e.message : 'No se pudo buscar. Revisa tu conexión.');
      if (pag === 1) setDatos(null);
    } finally {
      setCargando(false);
      setRefrescando(false);
      setMasCargando(false);
    }
  }, [ciudad, checkIn, checkOut, huespedes, habitaciones, aplicado]);

  useEffect(() => { void cargar(); }, [cargar]);

  /* ── Filtros en cliente ─────────────────────────────────────────────────────── */

  const filasBase = useMemo<Fila[]>(() => (datos?.hotels ?? []).map((h) => ({
    h,
    km: miPos && h.hotel.lat != null && h.hotel.lng != null
      ? havKm(miPos, [h.hotel.lng, h.hotel.lat])
      : null,
  })), [datos, miPos]);

  const filas = useMemo<Fila[]>(() => {
    let out = filasBase;
    const q = norm(consulta.trim());
    if (q) {
      out = out.filter((f) =>
        norm(f.h.hotel.name).includes(q)
        || norm(f.h.hotel.barrio).includes(q)
        || norm(f.h.hotel.city).includes(q));
    }
    // «Estrellas» = valoración publicada. Sin `ratingPublished` no se puede afirmar una nota
    // (C-1), así que un hotel sin nota publicada no satisface «★ 4,0 o más» y sale del filtro.
    if (valoracionMin != null) {
      out = out.filter((f) => f.h.hotel.ratingPublished === true && Number(f.h.hotel.rating) >= valoracionMin);
    }
    if (distMax != null) out = out.filter((f) => f.km != null && f.km <= distMax);
    const arr = out.slice();
    // Ordenar en el servidor exige `sort`, que no existe (400): se ordena la página cargada,
    // como ya hacía «Cerca de mí» en el buscador.
    if (orden === 'priceAsc') arr.sort((a, b) => a.h.fromPricePerNightXaf - b.h.fromPricePerNightXaf);
    else if (orden === 'priceDesc') arr.sort((a, b) => b.h.fromPricePerNightXaf - a.h.fromPricePerNightXaf);
    else if (orden === 'rating') arr.sort((a, b) => (Number(b.h.hotel.rating) - Number(a.h.hotel.rating)) || (b.h.hotel.ratingCount - a.h.hotel.ratingCount));
    else if (orden === 'distAsc') arr.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
    return arr;
  }, [filasBase, consulta, valoracionMin, distMax, orden]);

  /** «Filtros activos»: lo que enseña el chip de reinicio. La búsqueda cuenta como uno. */
  const activos =
    (rangoPrecio ? 1 : 0)
    + (aplicado.min !== undefined || aplicado.max !== undefined ? 1 : 0)
    + (valoracionMin != null ? 1 : 0)
    + (distMax != null ? 1 : 0)
    + (consulta.trim() ? 1 : 0);

  const quitarFiltros = () => {
    setConsulta('');
    setRangoPrecio(null);
    setMinTexto('');
    setMaxTexto('');
    setAplicado({});
    setValoracionMin(null);
    setDistMax(null);
    setOrden('recom');
    setAvisoGps(null);
  };

  const pickPrecioRapido = (id: 'low' | 'mid' | 'high' | null) => {
    setRangoPrecio(id);
    const r = RANGOS_PRECIO.find((x) => x.id === id);
    setAplicado(r ? { min: r.min, max: r.max } : {});
    setMinTexto('');
    setMaxTexto('');
    if (id) setPanelAbierto(null);
  };

  /** Aplica el precio escrito a mano. Se comprueba aquí para no mandar basura al servidor. */
  const aplicarFiltroManual = () => {
    const num = (t: string) => {
      const n = Number(String(t).replace(/[^\d]/g, ''));
      return String(t).trim() && Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const min = num(minTexto);
    const max = num(maxTexto);
    if (min !== undefined && max !== undefined && max < min) {
      setAplicado((a) => ({ ...a, error: 'El máximo no puede ser menor que el mínimo.' }));
      return;
    }
    setAplicado({ min, max });
    setRangoPrecio(null);
    setPanelAbierto(null);
  };

  /**
   * «Distancia» necesita saber DÓNDE está el huésped. El GPS del proyecto sólo devuelve
   * posición dentro de Guinea Ecuatorial (`api/locate.ts`): fuera, o sin permiso, devuelve
   * `null` — y aquí se dice por qué en vez de dejar un filtro que no filtra.
   */
  const pedirDistancia = async (): Promise<boolean> => {
    if (miPos) return true;
    setAvisoGps(null);
    const pos = await getCurrentGqPosition();
    if (!pos) {
      setAvisoGps('No he podido situarte. La distancia sólo funciona dentro de Guinea Ecuatorial; puedes filtrar por precio y valoración igual.');
      return false;
    }
    setMiPos(pos);
    return true;
  };

  const alternarDistancia = async (km: number) => {
    if (distMax === km) { setDistMax(null); setPanelAbierto(null); return; }
    if (await pedirDistancia()) {
      setDistMax(km);
      setPanelAbierto(null);
    }
  };

  /* ── Mapa con drawer ────────────────────────────────────────────────────────── */

  const [pantallaH, setPantallaH] = useState(0);
  const altoDrawer = Math.round(pantallaH * 0.7); // el 70 % del diseño
  const [mapaAbierto, setMapaAbierto] = useState(false);
  const [mapaMontado, setMapaMontado] = useState(false); // el WebView se monta a la 1.ª apertura
  const [mapaListo, setMapaListo] = useState(false);
  const drawerY = useRef(new Animated.Value(0)).current;
  const mapaRef = useRef<EgMapViewHandle>(null);

  /** Hoteles filtrados CON coordenadas: los únicos que se pintan. Sin coords no hay pin. */
  const marcadores = useMemo<MapMarker[]>(
    () => filas
      .filter((f) => f.h.hotel.lat != null && f.h.hotel.lng != null)
      .map((f) => ({
        id: f.h.hotel.id,
        coordinate: [f.h.hotel.lng as number, f.h.hotel.lat as number] as Coord,
        kind: 'poi' as const,
        label: xaf(f.h.fromPricePerNightXaf),
      })),
    [filas],
  );
  const sinUbicacion = filas.length - marcadores.length;

  // Centro de reserva (Malabo) por si hay que encuadrar sin marcadores; las coordenadas
  // verdaderas SIEMPRE ganan: nada de colocar un hotel en el centro por defecto.
  const CENTRO_RESERVA: Coord = [8.7833, 3.7522];

  // Cerrado = trasladado su altura completa. Se coloca UNA vez, cuando se conoce el alto:
  // re-colocar en cada cambio de `mapaAbierto` mataría la animación de cierre a mitad.
  const colocadoRef = useRef(false);
  useEffect(() => {
    if (!colocadoRef.current && altoDrawer > 0) {
      colocadoRef.current = true;
      drawerY.setValue(altoDrawer);
    }
  }, [altoDrawer, drawerY]);

  const abrirMapa = useCallback(() => {
    setPanelAbierto(null);
    setMapaMontado(true);
    setMapaAbierto(true);
    if (altoDrawer > 0) {
      Animated.timing(drawerY, { toValue: 0, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [altoDrawer, drawerY]);

  const cerrarMapa = useCallback(() => {
    setMapaAbierto(false);
    if (altoDrawer > 0) {
      Animated.timing(drawerY, { toValue: altoDrawer, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: true }).start();
    }
  }, [altoDrawer, drawerY]);

  // Arrastre del tirador, como el diseño: soltar por debajo del 45 % vuelve a cerrar.
  // El PanResponder se crea UNA vez, así que NO puede leer estado del render: va por refs
  // (`altoRef`, `abrirRef`, `cerrarRef`), o vería `altoDrawer === 0` para siempre.
  const altoRef = useRef(0);
  altoRef.current = altoDrawer;
  const abrirRef = useRef(abrirMapa);
  abrirRef.current = abrirMapa;
  const cerrarRef = useRef(cerrarMapa);
  cerrarRef.current = cerrarMapa;
  const pan = useRef({ inicio: 0 });
  const panResp = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: () => { drawerY.stopAnimation((v) => { pan.current.inicio = v; }); },
    onPanResponderMove: (_, g) => {
      if (altoRef.current > 0) drawerY.setValue(Math.max(0, Math.min(altoRef.current, pan.current.inicio + g.dy)));
    },
    onPanResponderRelease: (_, g) => {
      const alto = altoRef.current;
      const ty = Math.max(0, Math.min(alto, pan.current.inicio + g.dy));
      if (ty > alto * 0.45) cerrarRef.current(); else abrirRef.current();
    },
  })).current;

  // Cuando el mapa está listo: modo oscuro (el drawer es oscuro) y encuadre sobre los pins.
  useEffect(() => {
    if (!mapaListo) return;
    mapaRef.current?.setNight?.(true);
    if (marcadores.length > 0) {
      mapaRef.current?.fitBounds(marcadores.map((m) => m.coordinate), { bottomFrac: 0.3 });
    } else {
      mapaRef.current?.setCamera({ centerCoordinate: CENTRO_RESERVA, zoomLevel: 12 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapaListo, marcadores]);

  const abrirDetalle = useCallback((f: Fila) => {
    router.push({
      pathname: '/lifebook-hotel-detalle',
      params: {
        id: f.h.hotel.id,
        ...(checkIn ? { checkIn } : {}),
        ...(checkOut ? { checkOut } : {}),
        guests: String(huespedes),
        units: String(habitaciones),
      },
    } as never);
  }, [router, checkIn, checkOut, huespedes, habitaciones]);

  /* ── Esqueleto (el diseño carga con tarjetas pulsantes, no con un «cargando» seco) ── */
  const pulso = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    if (!cargando) { pulso.setValue(1); return; }
    const seq = Animated.loop(Animated.sequence([
      Animated.timing(pulso, { toValue: 0.85, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulso, { toValue: 0.45, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    seq.start();
    return () => seq.stop();
  }, [cargando, pulso]);

  const hayFiltroPrecio = aplicado.min !== undefined || aplicado.max !== undefined;
  const chipPrecio = hayFiltroPrecio
    ? `${aplicado.min !== undefined ? xaf(aplicado.min) : '0'} – ${aplicado.max !== undefined ? xaf(aplicado.max) : 'sin tope'}`
    : null;
  const chipValoracion = valoracionMin != null ? (RANGOS_VALORACION.find((r) => r.valor === valoracionMin)?.chip ?? null) : null;
  const chipDistancia = distMax != null ? (RANGOS_DISTANCIA.find((r) => r.valor === distMax)?.chip ?? null) : null;

  return (
    <View
      style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top }]}
      onLayout={(e) => setPantallaH(e.nativeEvent.layout.height)}
    >
      {/* ── TopBar 56 + buscador 52, fijos como el diseño ── */}
      <View style={[styles.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Volver"
          style={[styles.volver, { borderColor: colors.border, backgroundColor: colors.background }]}
        >
          <Text style={[styles.volverTxt, { color: colors.textPrimary }]}>‹</Text>
        </Pressable>
        <View style={styles.topTitulos}>
          <Text style={[styles.topTitulo, { color: colors.textPrimary }]} numberOfLines={1}>
            {ciudad ? `${ciudad}${noches ? ` · ${noches} noche(s)` : ''}` : 'Alojamiento'}
          </Text>
          <Text style={[styles.topSub, { color: colors.textSecondary }]} numberOfLines={1}>
            Estadías · Guinea Ecuatorial
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/lifebook-hotel' as never)}
          accessibilityRole="button"
          accessibilityLabel="Cambiar la búsqueda"
          style={[styles.cambiar, { borderColor: colors.border }]}
        >
          <Text style={[styles.cambiarTxt, { color: colors.text.primary }]}>Cambiar</Text>
        </Pressable>
      </View>

      <View style={[styles.searchBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={[styles.cajaBusca, { borderColor: colors.border, backgroundColor: colors.background }]}>
          <Text style={[styles.lupa, { color: colors.textSecondary }]}>⌕</Text>
          <TextInput
            value={consulta}
            onChangeText={setConsulta}
            placeholder={ciudad ? `Buscar en ${ciudad}…` : 'Buscar alojamiento…'}
            placeholderTextColor={colors.textSecondary}
            style={[styles.buscaInput, { color: colors.textPrimary }]}
            accessibilityLabel="Buscar en los resultados"
            autoCorrect={false}
          />
          {consulta.trim() ? (
            <Pressable
              onPress={() => setConsulta('')}
              accessibilityRole="button"
              accessibilityLabel="Limpiar búsqueda"
              style={[styles.buscaClear, { backgroundColor: colors.card }]}
            >
              <Text style={[styles.buscaClearTxt, { color: colors.textSecondary }]}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ── Barra de chips: precio (servidor), valoración y distancia (cliente), orden ── */}
      <View style={[styles.filtros, { borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtrosFila}>
          <Chip
            activo={!!chipPrecio} etiqueta="Precio" valor={chipPrecio}
            color={colors} onPress={() => setPanelAbierto(panelAbierto === 'precio' ? null : 'precio')}
            a11y="Filtrar por precio por noche"
          />
          <Chip
            activo={!!chipValoracion} etiqueta="Estrellas" valor={chipValoracion}
            color={colors} onPress={() => setPanelAbierto(panelAbierto === 'estrellas' ? null : 'estrellas')}
            a11y="Filtrar por valoración mínima"
          />
          <Chip
            activo={!!chipDistancia} etiqueta="Distancia" valor={chipDistancia}
            color={colors} onPress={() => setPanelAbierto(panelAbierto === 'distancia' ? null : 'distancia')}
            a11y="Filtrar por distancia al centro"
          />
          {activos > 0 ? (
            <Pressable
              onPress={quitarFiltros}
              accessibilityRole="button"
              accessibilityLabel="Quitar todos los filtros"
              style={[styles.chipReset, { backgroundColor: alpha(colors.primary, 0.14) }]}
            >
              <Text style={[styles.chipResetTxt, { color: colors.text.primary }]}>↺ {activos}</Text>
            </Pressable>
          ) : null}
        </ScrollView>
        <Chip
          activo={orden !== 'recom'} etiqueta={orden === 'recom' ? 'Ordenar' : ORDEN_ETIQUETA[orden]} valor={null}
          color={colors} onPress={() => setPanelAbierto(panelAbierto === 'orden' ? null : 'orden')}
          a11y="Cambiar el orden de la lista"
        />
      </View>

      {/* Panel de filtros / orden, bajo la barra (inline: empuja la lista, sin tapar nada). */}
      {panelAbierto ? (
        <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.card }]}>
          {panelAbierto === 'precio' ? (
            <View style={{ gap: espaciado.e10 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 }}>
                {RANGOS_PRECIO.map((r) => (
                  <PickChip
                    key={r.id} activo={rangoPrecio === r.id} etiqueta={r.etiqueta}
                    color={colors} onPress={() => pickPrecioRapido(r.id)}
                  />
                ))}
              </View>
              <View style={{ flexDirection: 'row', gap: espaciado.e10 }}>
                <View style={{ flex: 1 }}>
                  <FormField
                    label="Precio mínimo (XAF)" value={minTexto} onChangeText={setMinTexto}
                    keyboardType="number-pad" placeholder="Sin mínimo"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <FormField
                    label="Precio máximo (XAF)" value={maxTexto} onChangeText={setMaxTexto}
                    keyboardType="number-pad" placeholder="Sin tope"
                  />
                </View>
              </View>
              {aplicado.error ? (
                <Text style={{ color: colors.text.secondary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>
                  ⚠ {aplicado.error}
                </Text>
              ) : null}
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 16 }}>
                Es el precio por noche y lo aplica el servidor. Deja un campo vacío para no poner tope.
              </Text>
              <PrimaryButton title="Buscar con este precio" onPress={aplicarFiltroManual} />
            </View>
          ) : null}

          {panelAbierto === 'estrellas' ? (
            <View style={{ gap: espaciado.e10 }}>
              <Text style={[styles.panelTitulo, { color: colors.textPrimary }]}>Valoración mínima</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 }}>
                {RANGOS_VALORACION.map((r) => (
                  <PickChip
                    key={r.valor} activo={valoracionMin === r.valor} etiqueta={r.etiqueta}
                    color={colors} onPress={() => { setValoracionMin(valoracionMin === r.valor ? null : r.valor); setPanelAbierto(null); }}
                  />
                ))}
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 16 }}>
                Se aplica a los hoteles ya cargados: el servidor no filtra por nota. Sólo cuentan
                hoteles con nota publicada.
              </Text>
            </View>
          ) : null}

          {panelAbierto === 'distancia' ? (
            <View style={{ gap: espaciado.e10 }}>
              <Text style={[styles.panelTitulo, { color: colors.textPrimary }]}>Distancia a tu posición</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 }}>
                {RANGOS_DISTANCIA.map((r) => (
                  <PickChip
                    key={r.valor} activo={distMax === r.valor} etiqueta={r.etiqueta}
                    color={colors} onPress={() => void alternarDistancia(r.valor)}
                  />
                ))}
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 16 }}>
                Distancia en línea recta desde tu ubicación, no por carretera. Sólo funciona
                dentro de Guinea Ecuatorial.
              </Text>
            </View>
          ) : null}

          {panelAbierto === 'orden' ? (
            <View style={{ gap: espaciado.e2 }}>
              {(['recom', 'priceAsc', 'priceDesc', 'rating', ...(miPos ? ['distAsc' as const] : [])] as Orden[]).map((o) => (
                <Pressable
                  key={o}
                  onPress={() => { setOrden(o); setPanelAbierto(null); }}
                  accessibilityRole="button"
                  accessibilityLabel={`Ordenar por ${ORDEN_ETIQUETA[o]}`}
                  style={[styles.ordenFila, orden === o && { backgroundColor: alpha(colors.primary, 0.12) }]}
                >
                  <Text style={[styles.ordenTxt, { color: orden === o ? colors.text.primary : colors.textSecondary }]}>
                    {ORDEN_ETIQUETA[o]}{orden === o ? ' ✓' : ''}
                  </Text>
                </Pressable>
              ))}
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 16, marginTop: espaciado.e6 }}>
                Ordena lo que ya está cargado en la lista; «Ver más» añade y reordena.
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {avisoGps ? (
        <Text style={[styles.avisoGps, { color: colors.textSecondary }]}>{avisoGps}</Text>
      ) : null}

      {/* ── Lista / carga / error ── */}
      {cargando ? (
        <View style={styles.lista}>
          {[0, 1, 2, 3, 4].map((i) => (
            <View key={i} style={[styles.esqueleto, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Animated.View style={[styles.esqFoto, { opacity: pulso, backgroundColor: colors.surface, borderColor: colors.border }]} />
              <View style={{ flex: 1, gap: espaciado.e8 }}>
                {[0, 1, 2].map((j) => (
                  <Animated.View
                    key={j}
                    style={[styles.esqLinea, { opacity: pulso, backgroundColor: colors.surface, width: `${72 - j * 18}%` }]}
                  />
                ))}
              </View>
            </View>
          ))}
          <ActivityIndicator color={colors.text.primary} style={{ marginTop: espaciado.e12 }} />
        </View>
      ) : error ? (
        <View style={[styles.aviso, { borderColor: colors.danger, backgroundColor: alpha(colors.danger, 0.06) }]}>
          <Text style={{ color: colors.text.danger, fontSize: tipografia.body, fontWeight: peso.medio }}>{error}</Text>
          <Pressable onPress={() => void cargar()} accessibilityRole="button" accessibilityLabel="Reintentar">
            <Text style={[styles.enlace, { color: colors.text.primary }]}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={filas}
          keyExtractor={(item) => item.h.hotel.id}
          contentContainerStyle={{ padding: espaciado.e14, paddingBottom: insets.bottom + 96, gap: espaciado.e12 }}
          refreshControl={
            <RefreshControl
              refreshing={refrescando}
              onRefresh={() => { setRefrescando(true); void cargar(true); }}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            filas.length ? (
              <View style={styles.cuentaFila}>
                <Text style={[styles.cuentaCiudad, { color: colors.textSecondary }]} numberOfLines={1}>
                  {[ciudad, 'Guinea Ecuatorial'].filter(Boolean).join(', ')}
                </Text>
                <Text style={[styles.cuentaNum, { color: colors.textPrimary }]}>
                  {filas.length} {filas.length === 1 ? 'alojamiento encontrado' : 'alojamientos encontrados'}
                  {filas.some((f) => f.h.soldOut) ? ' · «sin hueco» = lleno esas fechas' : ''}
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={
            /*
              Paginación. `hasMore` puede venir AUSENTE (el servidor hace un `return` temprano sin
              los campos de paginación cuando no hay hoteles): «ausente» se trata como «no hay más».
            */
            datos?.hasMore && filas.length ? (
              <View style={{ marginTop: espaciado.e8 }}>
                <GhostButton
                  title={masCargando ? 'Buscando más…' : 'Ver más alojamientos'}
                  onPress={() => { setMasCargando(true); void cargar(true, pagina + 1); }}
                  disabled={masCargando}
                />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={[styles.vacio, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={[styles.vacioIcono, { backgroundColor: colors.card }]}>
                <Text style={{ fontSize: 24 }}>⌕</Text>
              </View>
              <Text style={[styles.vacioTitulo, { color: colors.textPrimary }]}>Sin resultados</Text>
              <Text style={[styles.vacioTexto, { color: colors.textSecondary }]}>
                {activos > 0
                  ? 'Ningún alojamiento cumple los filtros. Prueba con otras opciones.'
                  : 'Prueba otras fechas, otra ciudad o menos habitaciones.'}
              </Text>
              {activos > 0 ? (
                <View style={{ alignSelf: 'stretch', marginTop: espaciado.e12 }}>
                  <PrimaryButton title="Limpiar filtros" onPress={quitarFiltros} />
                </View>
              ) : (
                <View style={{ alignSelf: 'stretch', marginTop: espaciado.e12 }}>
                  <PrimaryButton title="Cambiar la búsqueda" onPress={() => router.push('/lifebook-hotel' as never)} />
                </View>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <HotelResultCard
              datos={item.h}
              habitaciones={habitaciones}
              listo={!!(checkIn && checkOut)}
              distanciaKm={item.km}
              onAbrir={() => abrirDetalle(item)}
            />
          )}
        />
      )}

      {/* ── FAB «Ver en mapa» ── */}
      {!mapaAbierto && !cargando && !error ? (
        <Pressable
          onPress={abrirMapa}
          accessibilityRole="button"
          accessibilityLabel="Ver los resultados en el mapa"
          style={[styles.fab, { borderColor: colors.primary, backgroundColor: colors.card, bottom: insets.bottom + 82 }]}
        >
          <Text style={[styles.fabTxt, { color: colors.text.primary }]}>📍 Ver en mapa</Text>
        </Pressable>
      ) : null}

      {/* ── Drawer del mapa (70 %), con tirador arrastrable ── */}
      {mapaAbierto ? (
        <Pressable
          style={[styles.tapadera, { top: insets.top }]}
          onPress={cerrarMapa}
          accessibilityRole="button"
          accessibilityLabel="Cerrar el mapa"
        />
      ) : null}
      <Animated.View
        style={[
          styles.drawer,
          {
            height: Math.max(altoDrawer, 1),
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            transform: [{ translateY: altoDrawer > 0 ? drawerY : altoDrawer }],
          },
        ]}
        pointerEvents={mapaAbierto ? 'auto' : 'none'}
      >
        <View {...panResp.panHandlers} style={styles.tirador}>
          <View style={[styles.tiradorBarra, { backgroundColor: colors.border }]} />
        </View>

        <View style={[styles.drawerCabecera, { borderBottomColor: colors.border }]}>
          <View style={styles.drawerFila}>
            <Text style={[styles.drawerTitulo, { color: colors.textPrimary }]} numberOfLines={1}>
              Mapa de {ciudad || 'Guinea Ecuatorial'}
            </Text>
            <Text style={[styles.drawerCuenta, { color: colors.textSecondary }]}>
              {marcadores.length} {marcadores.length === 1 ? 'precio' : 'precios'}
              {sinUbicacion > 0 ? ` · ${sinUbicacion} sin ubicación` : ''}
            </Text>
          </View>
        </View>

        {marcadores.length === 0 ? (
          <View style={styles.mapaVacio}>
            <Text style={{ color: colors.textSecondary, textAlign: 'center', lineHeight: 20 }}>
              Ninguno de los hoteles cargados tiene coordenadas todavía. El pin aparece en cuanto
              el hotelero fija su ubicación en el mapa.
            </Text>
          </View>
        ) : (
          <>
            <View style={styles.mapaArea}>
              {mapaMontado ? (
                <EgMapView ref={mapaRef} style={StyleSheet.absoluteFill} onMapLoaded={() => setMapaListo(true)}>
                  <EgCamera centerCoordinate={marcadores.length ? marcadores[0].coordinate : CENTRO_RESERVA} zoomLevel={12} />
                  <EgMarkers markers={marcadores} />
                </EgMapView>
              ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }]}>
                  <ActivityIndicator color={colors.text.primary} />
                </View>
              )}
            </View>

            {/* Tira de mini-tarjetas: tocar abre la ficha, como en la lista. */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tira}
              contentContainerStyle={styles.tiraContenido}
            >
              {filas.slice(0, 20).map((f) => {
                const portada = absUrl(f.h.hotel.coverUrl) || null;
                return (
                  <Pressable
                    key={f.h.hotel.id}
                    onPress={() => abrirDetalle(f)}
                    accessibilityRole="button"
                    accessibilityLabel={`${f.h.hotel.name}, ${xaf(f.h.fromPricePerNightXaf)} por noche`}
                    style={[styles.mini, { borderColor: colors.border, backgroundColor: colors.card }]}
                  >
                    <View style={[styles.miniFoto, { backgroundColor: colors.surface }]}>
                      {portada
                        ? <LazyImage source={{ uri: portada }} style={{ width: '100%', height: '100%' }} />
                        : <Text style={{ fontSize: 20 }}>🏨</Text>}
                    </View>
                    <View style={styles.miniCuerpo}>
                      <Text style={[styles.miniNombre, { color: colors.textPrimary }]} numberOfLines={1}>{f.h.hotel.name}</Text>
                      <Text style={[styles.miniPrecio, { color: colors.text.secondary }]}>{xaf(f.h.fromPricePerNightXaf)}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        )}

        <View style={[styles.drawerPie, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
          <PrimaryButton title="Ver lista" onPress={cerrarMapa} />
        </View>
      </Animated.View>
    </View>
  );
}

/* ── Chips ───────────────────────────────────────────────────────────────────── */

function Chip({
  activo, etiqueta, valor, color, onPress, a11y,
}: {
  activo: boolean; etiqueta: string; valor: string | null;
  color: ReturnType<typeof useTheme>['colors']; onPress: () => void; a11y: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ selected: activo }}
      style={[styles.chip, {
        borderColor: activo ? color.primary : color.border,
        backgroundColor: activo ? alpha(color.primary, 0.12) : 'transparent',
      }]}
    >
      <Text style={{ color: activo ? color.text.primary : color.textSecondary, fontSize: tipografia.caption, fontWeight: peso.maximo }} numberOfLines={1}>
        {valor ? `${etiqueta}: ${valor}` : etiqueta}
      </Text>
    </Pressable>
  );
}

function PickChip({
  activo, etiqueta, color, onPress,
}: {
  activo: boolean; etiqueta: string; color: ReturnType<typeof useTheme>['colors']; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={etiqueta}
      accessibilityState={{ selected: activo }}
      style={[styles.pickChip, {
        borderColor: activo ? color.primary : color.border,
        backgroundColor: activo ? alpha(color.primary, 0.12) : color.surface,
      }]}
    >
      <Text style={{ color: activo ? color.text.primary : color.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>
        {etiqueta}{activo ? ' ✓' : ''}
      </Text>
    </Pressable>
  );
}

/* ── Estilos ─────────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // TopBar 56 (el paddingTop del safe area lo pone la pantalla).
  topBar: {
    height: 56, flexDirection: 'row', alignItems: 'center', gap: espaciado.e8,
    paddingHorizontal: espaciado.e14, borderBottomWidth: trazo.fino,
  },
  volver: {
    width: 36, height: 36, borderRadius: 18, borderWidth: trazo.fino,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  volverTxt: { fontSize: tipografia.display, fontWeight: peso.fuerte, lineHeight: 26 },
  topTitulos: { flex: 1, minWidth: 0 },
  topTitulo: { fontSize: tipografia.ancho, fontWeight: peso.maximo },
  topSub: { fontSize: tipografia.micro },
  cambiar: { borderWidth: trazo.fino, borderRadius: radios.md, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e7, flexShrink: 0 },
  cambiarTxt: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  // Buscador 52.
  searchBar: { height: 52, justifyContent: 'center', paddingHorizontal: espaciado.e14, borderBottomWidth: trazo.fino },
  cajaBusca: {
    height: 40, flexDirection: 'row', alignItems: 'center', gap: espaciado.e8,
    borderRadius: radios.md, borderWidth: trazo.fino, paddingHorizontal: espaciado.e10,
  },
  lupa: { fontSize: 18, fontWeight: peso.maximo },
  buscaInput: { flex: 1, minWidth: 0, fontSize: tipografia.body, padding: 0 },
  buscaClear: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buscaClearTxt: { fontSize: 11, fontWeight: peso.maximo },
  // Barra de chips 48.
  filtros: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e8,
    paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e8, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  filtrosFila: { alignItems: 'center', gap: espaciado.e8, paddingRight: espaciado.e8 },
  chip: {
    borderWidth: trazo.fino, borderRadius: radios.full, paddingHorizontal: espaciado.e11,
    minHeight: 36, justifyContent: 'center',
  },
  chipReset: { borderRadius: radios.full, paddingHorizontal: espaciado.e11, minHeight: 36, justifyContent: 'center' },
  chipResetTxt: { fontSize: tipografia.caption, fontWeight: peso.maximo },
  // Panel inline bajo la barra.
  panel: {
    marginHorizontal: espaciado.e14, marginTop: espaciado.e10, padding: espaciado.e14,
    borderRadius: radios.lg, borderWidth: trazo.fino, gap: espaciado.e10,
  },
  panelTitulo: { fontSize: tipografia.body, fontWeight: peso.maximo },
  pickChip: { borderWidth: trazo.fino, borderRadius: radios.md, paddingHorizontal: espaciado.e11, minHeight: 36, justifyContent: 'center' },
  ordenFila: { minHeight: 44, justifyContent: 'center', paddingHorizontal: espaciado.e10, borderRadius: radios.md },
  ordenTxt: { fontSize: tipografia.body, fontWeight: peso.fuerte },
  avisoGps: { paddingHorizontal: espaciado.e14, paddingTop: espaciado.e8, fontSize: tipografia.caption, lineHeight: 17 },
  // Lista y estados.
  lista: { padding: espaciado.e14, gap: espaciado.e12 },
  esqueleto: {
    flexDirection: 'row', gap: espaciado.e10, borderRadius: radios.lg, borderWidth: trazo.fino,
    padding: espaciado.e10,
  },
  esqFoto: { width: 104, height: 104, borderRadius: radios.campo, borderWidth: trazo.fino, flexShrink: 0 },
  esqLinea: { height: 12, borderRadius: 6 },
  cuentaFila: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: espaciado.e10 },
  cuentaCiudad: { fontSize: tipografia.caption, flexShrink: 1 },
  cuentaNum: { fontSize: tipografia.caption, fontWeight: peso.maximo, textAlign: 'right', flexShrink: 2 },
  aviso: { margin: espaciado.e14, borderWidth: trazo.fino, borderRadius: radios.campo, padding: espaciado.e12, gap: espaciado.e6 },
  enlace: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  vacio: { alignItems: 'center', borderWidth: trazo.fino, borderRadius: radios.lg, padding: espaciado.e16, gap: espaciado.e6 },
  vacioIcono: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  vacioTitulo: { fontSize: tipografia.ancho, fontWeight: peso.maximo },
  vacioTexto: { fontSize: tipografia.caption, textAlign: 'center', lineHeight: 18 },
  // FAB.
  fab: {
    position: 'absolute', right: espaciado.e14, borderWidth: trazo.fino,
    borderRadius: radios.full, paddingHorizontal: espaciado.e14, height: 44,
    alignItems: 'center', justifyContent: 'center',
  },
  fabTxt: { fontSize: tipografia.caption, fontWeight: peso.maximo },
  // Drawer del mapa.
  tapadera: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)' },
  drawer: {
    position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden',
    borderTopWidth: trazo.fino, borderTopLeftRadius: radios.lg, borderTopRightRadius: radios.lg,
  },
  tirador: { height: 32, alignItems: 'center', justifyContent: 'center' },
  tiradorBarra: { width: 40, height: 4, borderRadius: 2 },
  drawerCabecera: { paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10, borderBottomWidth: trazo.fino },
  drawerFila: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: espaciado.e10 },
  drawerTitulo: { fontSize: tipografia.body, fontWeight: peso.maximo, flexShrink: 1 },
  drawerCuenta: { fontSize: tipografia.caption, flexShrink: 0 },
  mapaVacio: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaciado.e20 },
  mapaArea: { flex: 1, minHeight: 200 },
  tira: { flexShrink: 0 },
  tiraContenido: { paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e10, gap: espaciado.e10 },
  mini: { width: 132, borderRadius: radios.lg, borderWidth: trazo.fino, overflow: 'hidden' },
  miniFoto: { height: 74, alignItems: 'center', justifyContent: 'center' },
  miniCuerpo: { padding: espaciado.e8, gap: 2 },
  miniNombre: { fontSize: tipografia.micro, fontWeight: peso.fuerte },
  miniPrecio: { fontSize: tipografia.caption, fontWeight: peso.maximo },
  drawerPie: { padding: espaciado.e10, borderTopWidth: trazo.fino },
});
