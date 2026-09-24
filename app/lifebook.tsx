/**
 * Life Book — INICIO (feed por canales) · Estilo Xiaohongshu
 *
 * Barra superior: búsqueda + ciudad + mensajes.
 * Canales: tabs de texto con indicador inferior (sin pills de color).
 * Feed: masonry 2 columnas con tarjetas de altura variable.
 * FAB "+" compacto (esquina inferior derecha, sobre el dock).
 * Skeleton loading, pull-to-refresh, paginación por cursor.
 *
 * API: /lifebook/posts/feed?channel=…&city=…&cursor=…
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, elevation, espaciado, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';
import {
  ChevronDown,
  Clapperboard,
  MapPin,
  Mic,
  Package,
  PenSquare,
  Play,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  Video,
} from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import {
  lifebookActionsApi,
  lifebookApi,
  LB_CARD_DEFAULT_RATIO,
  toPostCard,
  type LbFeedPage,
  type LbPostBase,
  type LbPostCard,
} from '../api/lifebook';
import { authApi } from '../api/auth';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import { LB_CHANNELS, LB_CHIPS_BY_TAB, LB_CITIES, LB_TABS } from '../constants/lifebook';
import { PostCard } from '../components/lifebook/PostCard';
/* TANDA I: el buscador de sitios + mapa real (el mismo de las rutas y las quedadas). */
import { LocationPickerSheet } from '../components/lifebook/LocationPickerSheet';
/* TANDA I — la ciudad con DISTANCIA: chips 附近 / 3 km / 全城, posición propia y el sitio de cada
   nota en la tarjeta. Va en su propio módulo para no tocar `api/lifebook.ts`. */
import { ciudadApi, tarjetaConSitio, LB_DISTANCIAS, centroDe } from '../api/lifebookCiudad';
import * as Location from 'expo-location';
import FloatingFooter, {
  DOCK_BODY_H,
  type FooterTab,
} from '../components/FloatingFooter';
import { useAppDock } from '../core/useAppDock';
import { ReportSheet } from '../components/lifebook/ReportSheet';
import { AvatarsSeguidos } from '../components/lifebook/AvatarsSeguidos';
import { seguidosApi, type LbSeguido } from '../api/lifebookSeguidos';
import { ir as irSeguro } from '../constants/rutas';
import { brand } from '@egrouteplan/ui-kit';

/* ──────────────────────────────────────────────
   Constantes de layout
────────────────────────────────────────────── */
const { width: SCREEN_W } = Dimensions.get('window');
const COLUMN_GAP = 8;
const SIDE_PADDING = 10;
const COLUMN_W = (SCREEN_W - SIDE_PADDING * 2 - COLUMN_GAP) / 2;

/* ──────────────────────────────────────────────
   Copy de estados vacíos
────────────────────────────────────────────── */
const EMPTY_COPY: Record<string, string> = {
  for_you: 'Descubre contenido de tu comunidad.\n¡Sé el primero en publicar!',
  following:
    'Aún no hay publicaciones de tus seguidos.\nSigue a personas desde su perfil para verlas aquí.',
  nearby:
    'Todavía no hay publicaciones cerca de ti.\n¡Sé el primero en compartir algo!',
  debates:
    'Todavía no hay debates en esta ciudad.\nInicia uno sobre un problema del barrio.',
  sales: 'No hay ventas por aquí todavía.\nPublica la primera.',
  food: 'No hay publicaciones de comida todavía.',
  taxi: 'No hay avisos de transporte todavía.',
  work: 'No hay ofertas de trabajo publicadas todavía.',
  rental: 'No hay anuncios de alquiler todavía.',
  culture: 'No hay publicaciones de cultura todavía.',
  music: 'No hay publicaciones de música todavía.',
  sports: 'No hay publicaciones de deportes todavía.',
};

/* ──────────────────────────────────────────────
   Skeleton card (shimmer placeholder)
────────────────────────────────────────────── */
function SkeletonCard({ width }: { width: number }) {
  const { colors } = useTheme();
  const h = 140 + Math.round(Math.random() * 80);
  return (
    <View style={{ width, marginBottom: COLUMN_GAP }}>
      <View
        style={{
          width,
          height: h,
          borderRadius: radios.sm,
          backgroundColor: alpha(colors.textSecondary, 0.08),
        }}
      />
      <View
        style={{
          marginTop: espaciado.e6,
          height: 12,
          width: '80%',
          borderRadius: 4,
          backgroundColor: alpha(colors.textSecondary, 0.08),
        }}
      />
      <View
        style={{
          marginTop: espaciado.e6,
          height: 10,
          width: '50%',
          borderRadius: 4,
          backgroundColor: alpha(colors.textSecondary, 0.06),
        }}
      />
    </View>
  );
}

function SkeletonGrid() {
  return (
    <View
      style={{
        flexDirection: 'row',
        paddingHorizontal: SIDE_PADDING,
        gap: COLUMN_GAP,
        paddingTop: espaciado.e8,
      }}
    >
      <View style={{ flex: 1, gap: COLUMN_GAP }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={`l${i}`} width={COLUMN_W} />
        ))}
      </View>
      <View style={{ flex: 1, gap: COLUMN_GAP }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={`r${i}`} width={COLUMN_W} />
        ))}
      </View>
    </View>
  );
}

/* ──────────────────────────────────────────────
   Entrada principal
────────────────────────────────────────────── */
/**
 * Parte 31: ¿el feed recargado es el mismo que ya está en pantalla?
 * Se comparan solo los campos que se ven (id, me gusta, comentarios, guardados
 * y el estado "me gusta"). Si nada cambió, se conserva la referencia anterior
 * para que las tarjetas memoizadas no se vuelvan a renderizar ni parpadeen.
 */
function sameFeed(a: LbPostBase[], b: LbPostBase[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const p = a[i];
    const q = b[i];
    if (!q || p.id !== q.id) return false;
    const sp = p.stats ?? ({} as LbPostBase['stats']);
    const sq = q.stats ?? ({} as LbPostBase['stats']);
    if (
      (sp.likes ?? 0) !== (sq.likes ?? 0) ||
      (sp.comments ?? 0) !== (sq.comments ?? 0) ||
      (sp.bookmarks ?? 0) !== (sq.bookmarks ?? 0) ||
      !!sp.likedByMe !== !!sq.likedByMe
    ) {
      return false;
    }
  }
  return true;
}

export default function LifeBookScreen() {
  return (
    <AuthGate>
      <LifeBookContent />
    </AuthGate>
  );
}

/* ──────────────────────────────────────────────
   Componente principal
────────────────────────────────────────────── */
function LifeBookContent() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  /* ── Estado ── */
  /**
   * ── SECCIÓN y CHIP ─────────────────────────────────────────────────────────
   * La SECCIÓN son las tres pestañas de arriba (Seguidos · Descubrir · Ciudad) y el
   * CHIP es el filtro de dentro de esa sección. Cada sección tiene los suyos (ver
   * `LB_CHIPS_BY_TAB`), que es lo que pidió el dueño: «cuando estás en Seguidos los
   * que muestran abajo serán distintos de los que hayan en Descubrir o ciudad».
   *
   * Y no es solo el dibujo: el chip **filtra dentro de la sección**. «Comercio» en
   * Seguidos es el comercio DE LA GENTE QUE SIGO; «Comida» en Ciudad, la de mi ciudad.
   * Para eso se amplió el backend en esta misma ronda.
   *
   * `channelId` ya NO es estado: se DERIVA del chip activo, para que no haya dos
   * fuentes de verdad que se puedan separar.
   */
  const [tab, setTab] = useState('for_you');
  const [chipIdx, setChipIdx] = useState(0);
  const chipsDeTab = LB_CHIPS_BY_TAB[tab] ?? [];
  const chip = chipsDeTab[Math.min(chipIdx, Math.max(0, chipsDeTab.length - 1))] ?? null;
  /** Lo que se le pide al servidor. */
  const channelId = chip?.channel ?? tab;
  /** Filtro por tipo del chip (Comercio → 'sale', Vídeos → 'video'). */
  const tipo = chip?.type ?? null;
  /**
   * Solo los chips de CIUDAD mandan la ciudad. Los temas de Descubrir se quedan
   * globales: si se les mandara, Cultura pasaría de 10 publicaciones a 2 (se probó y
   * era una regresión).
   */
  /**
   * Canales que SÍ usan la ciudad en el servidor (los demás la ignoran, y los temas
   * de Descubrir deben quedarse globales).
   */
  const CANALES_CON_CIUDAD = new Set(['nearby', 'today', 'debates', 'sales']);
  const conCiudad = !!chip?.conCiudad || CANALES_CON_CIUDAD.has(channelId);
  const conCiudadRef = useRef(true);
  useEffect(() => { conCiudadRef.current = conCiudad; }, [conCiudad]);
  /**
   * El tipo se lee por REF dentro de `load`, para no tener que cambiar su firma ni las
   * cuatro llamadas que ya lo usan (foco, reintentar, refrescar, desbloquear).
   */
  const tipoRef = useRef<string | null>(null);
  useEffect(() => { tipoRef.current = tipo; }, [tipo]);
  /** Abre una sección: se queda en su primer chip (que es «Todo»/«Recomendado»). */
  const abrirTab = useCallback((id: string) => { setTab(id); setChipIdx(0); }, []);
  const [city, setCity] = useState('Malabo');  /* El contador de no leídos y el avatar del dueño YA NO SE USAN AQUÍ: el icono de
     Mensajes salió de esta barra (vive en el dock, que tiene su propio contador a
     través del hook compartido) y el avatar se mudó a la pantalla de mensajes. Se
     quitaron también el hook y el estado para no dejar un sondeo cada 15 s sin nadie
     que lo mire ni código muerto. */
  /**
   * TANDA I — MI POSICIÓN Y LA DISTANCIA DEL FEED DE CIUDAD.
   *
   * Por defecto «3 km» (el radio que la especificación dice que el algoritmo privilegia). Si no hay
   * permiso de ubicación se avisa y se enseña toda la ciudad: un feed vacío sin explicación es peor
   * que decir que falta un permiso.
   */
  const [distIdx, setDistIdx] = useState(1); // 0 = Cerca · 1 = 3 km · 2 = Toda la ciudad
  const [miPos, setMiPos] = useState<{ lat: number; lng: number } | null>(null);
  const distRef = useRef<number | null>(LB_DISTANCIAS[1].radiusKm);
  const posRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => {
    distRef.current = LB_DISTANCIAS[Math.min(distIdx, LB_DISTANCIAS.length - 1)]?.radiusKm ?? null;
  }, [distIdx]);
  useEffect(() => { posRef.current = miPos; }, [miPos]);


  /**
   * Pide la ubicación (una vez) y la guarda. La RECARGA la dispara el `useFocusEffect` de abajo:
   * `miPos` y `distIdx` entran en su clave, así que el feed se recarga solo (y no hay que
   * llamar a `load` desde aquí, que se declara más abajo).
   */
  const pedirUbicacion = useCallback(async (): Promise<{ lat: number; lng: number } | null> => {
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') { setMiPos(null); return null; }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const p = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setMiPos(p);
      posRef.current = p;
      return p;
    } catch {
      setMiPos(null);
      return null;
    }
  }, []);

  /** Cambiar de distancia: si hace falta la posición, se pide entonces (no al abrir la app). */
  const elegirDistancia = useCallback(async (idx: number) => {
    const d = LB_DISTANCIAS[idx];
    distRef.current = d?.radiusKm ?? null;
    if (d?.radiusKm !== null && d?.radiusKm !== undefined && !posRef.current) await pedirUbicacion();
    setDistIdx(idx);
  }, [pedirUbicacion]);

  const [cityOpen, setCityOpen] = useState(false);
  /** TANDA I: posición elegida A MANO (mapa o buscador) para explorar otra zona sin estar ahí. */
  const [posManual, setPosManual] = useState<{ lat: number; lng: number } | null>(null);
  const [mapaCiudadOpen, setMapaCiudadOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [morePost, setMorePost] = useState<LbPostCard | null>(null);
  const [meCity, setMeCity] = useState<string | null>(null);

  /**
   * LA POSICIÓN CON LA QUE SE MIDE: la mía, **o el centro de la ciudad** si he cambiado de ciudad a
   * mano (regla de la especificación: «la distancia se calcula desde la posición actual del usuario
   * o desde el centro de la ciudad si cambió de ciudad manualmente»). Sin esto, mirar Malabo desde
   * otro sitio pondría «11.000 km» en cada tarjeta: es verdad, pero no sirve para decidir.
   */
  const posEfectiva = useMemo(
    () => (posManual ?? (meCity && city && city.toLowerCase() !== meCity.toLowerCase() ? centroDe(city) : miPos)),
    [meCity, city, miPos],
  );
  const posEfectivaRef = useRef<{ lat: number; lng: number } | null>(null);
  useEffect(() => { posEfectivaRef.current = posEfectiva; }, [posEfectiva]);
  /**
   * La gente a la que sigo, para la fila de avatares de la pestaña «Seguidos».
   * Se carga una vez al entrar: es una lista corta y no cambia sola.
   */
  const [seguidos, setSeguidos] = useState<LbSeguido[]>([]);

  const [posts, setPosts] = useState<LbPostBase[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const busy = useRef(false);
  const mounted = useRef(true);
  /**
   * Parte 31 (navegación fluida): canal+ciudad de la última carga correcta.
   * Al VOLVER de un detalle (publicación, chat, perfil) la clave coincide y la
   * recarga se hace en silencio: el feed se queda en pantalla en vez de
   * desaparecer detrás del esqueleto de carga (ese era el parpadeo).
   */
  const loadedKey = useRef<string | null>(null);

  /**
   * B1 · Los posts CRUDOS, en un ref, para que `openPost` sepa si lo que se tocó
   * es un vídeo y mandarlo al feed inmersivo en vez del detalle.
   *
   * En un ref y no en estado a propósito: `openPost` es un callback ESTABLE por
   * diseño (Parte 31, navegación fluida) y las tarjetas están memoizadas. Añadir
   * `posts` a sus dependencias las volvería a pintar en cada recarga silenciosa,
   * que es justo el parpadeo que esa parte arregló.
   */
  const postsRef = useRef<LbPostBase[]>([]);
  useEffect(() => { postsRef.current = posts; }, [posts]);

  /** Canal y ciudad actuales, también en ref y por el mismo motivo: que
   *  `openPost` pueda leerlos sin volverlos dependencias suyas. */
  const ctxRef = useRef({ channelId: 'for_you', city: 'Malabo' });
  useEffect(() => { ctxRef.current = { channelId, city }; }, [channelId, city]);

  /* ── Tarjetas (LbPostCard) y masonry: 2 columnas por altura ── */
  const cards = useMemo(() => posts.map(tarjetaConSitio), [posts]);

  const { leftCol, rightCol } = useMemo(() => {
    const left: LbPostCard[] = [];
    const right: LbPostCard[] = [];
    let hL = 0;
    let hR = 0;
    for (const p of cards) {
      // Estimación de altura: imagen (ratio real) + texto + footer
      const imgH = COLUMN_W / (p.media?.aspectRatio ?? LB_CARD_DEFAULT_RATIO);
      const totalH = imgH + 60;
      if (hL <= hR) {
        left.push(p);
        hL += totalH;
      } else {
        right.push(p);
        hR += totalH;
      }
    }
    return { leftCol: left, rightCol: right };
  }, [cards]);

  /* ── Efectos ── */
  useEffect(() => {
    mounted.current = true;
    authApi
      .me()
      .then((m) => {
        if (!mounted.current) return;
        if (m?.city) {
          setMeCity(m.city);
          setCity(m.city);
        }
        /* El id y el avatar que se sacaban de aquí eran para el avatar de la barra
           superior, que ahora vive en la pantalla de mensajes (junto a los contadores).
           Esta llamada sigue haciendo falta por la CIUDAD: no se pide nada de más. */
      })
      .catch(() => {});
    return () => {
      mounted.current = false;
    };
  }, []);

  /* A quién sigo: alimenta la fila de avatares de la pestaña «Seguidos». Una sola vez
     al entrar; si falla, la fila no se pinta y el feed sigue funcionando. */
  useEffect(() => {
    seguidosApi.lista(20).then((l) => setSeguidos(Array.isArray(l) ? l : [])).catch(() => {});
  }, []);

  /* ── Carga de datos ── */
  const load = useCallback(
    async (
      chan: string,
      cty: string,
      mode: 'initial' | 'refresh' | 'silent' = 'initial',
    ) => {
      if (busy.current) return;
      busy.current = true;
      // 'silent': recarga en segundo plano SIN spinner ni esqueleto — la lista
      // que ya está en pantalla se mantiene (Parte 31: sin parpadeos).
      if (mode === 'initial') setLoading(true);
      else if (mode === 'refresh') setRefreshing(true);
      setError(null);
      try {
        const page: LbFeedPage = await ciudadApi.feed(chan, {
          /* La ciudad solo se manda cuando el chip la usa. Mandarla siempre fue lo que
             encogió los temas de Descubrir a una sola ciudad (Cultura: 10 → 2). */
          ...(conCiudadRef.current ? { city: cty } : {}),
          limit: 20,
          /* El tipo del chip activo, si lo tiene (Comercio → 'sale'). Va por ref para
             no cambiar la firma de `load` ni sus cuatro llamadas. */
          ...(tipoRef.current ? { type: tipoRef.current } : {}),
          /* TANDA I: en Ciudad, mi posición y el radio del chip (附近 / 3 km / 全城). Fuera de
             Ciudad no se manda nada de esto: los demás canales no filtran por distancia. */
          ...(chan === 'nearby' && posEfectivaRef.current ? { lat: posEfectivaRef.current.lat, lng: posEfectivaRef.current.lng } : {}),
          ...(chan === 'nearby' ? { radiusKm: distRef.current } : {}),
        });
        if (!mounted.current) return;
        const incoming = page.posts ?? [];
        loadedKey.current = `${chan}|${cty}|${tipoRef.current ?? ''}`;
        // En silencio solo se reemplaza la lista si algo cambió de verdad:
        // si no, se conserva la MISMA referencia y las tarjetas (memo) no se
        // vuelven a renderizar → cero parpadeo al volver de un detalle.
        if (mode === 'silent') {
          setPosts((prev) => (sameFeed(prev, incoming) ? prev : incoming));
        } else {
          setPosts(incoming);
        }
        setNextCursor(page.nextCursor ?? null);
      } catch (e) {
        if (!mounted.current) return;
        setError(
          e instanceof Error ? e.message : 'No se pudo cargar el feed',
        );
      } finally {
        busy.current = false;
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [],
  );

  useFocusEffect(
    useCallback(() => {
      // Primera vez (o canal/ciudad nuevos) → esqueleto. Al volver de un
      // detalle → recarga silenciosa, el feed no se desmonta.
      // OJO: la clave incluye el CHIP, no solo el canal. Sin esto, cambiar de chip
      // dentro de la misma sección no recargaría: Ciudad·Recomendado y
      // Ciudad·Comercio son el MISMO canal (`nearby`) con distinto filtro.
      const key = `${channelId}|${city}|${tipo ?? ''}`;
      load(channelId, city, loadedKey.current === key ? 'silent' : 'initial');
    }, [channelId, city, tipo, distIdx, load]),
  );

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore || busy.current || loading) return;
    setLoadingMore(true);
    try {
      const page = await ciudadApi.feed(channelId, {
        ...(conCiudadRef.current ? { city } : {}),
        cursor: nextCursor,
        limit: 20,
        ...(tipoRef.current ? { type: tipoRef.current } : {}),
        ...(channelId === 'nearby' && posEfectivaRef.current ? { lat: posEfectivaRef.current.lat, lng: posEfectivaRef.current.lng } : {}),
        ...(channelId === 'nearby' ? { radiusKm: distRef.current } : {}),
      });
      if (!mounted.current) return;
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...(page.posts ?? []).filter((p) => !seen.has(p.id))];
      });
      setNextCursor(page.nextCursor ?? null);
    } catch {
      /* silencioso en paginación */
    } finally {
      if (mounted.current) setLoadingMore(false);
    }
  }, [channelId, city, nextCursor, loadingMore, loading]);

  const channel =
    LB_CHANNELS.find((c) => c.id === channelId) ?? LB_CHANNELS[0];

  /**
   * Las TRES pestañas de arriba. Los chips van en su propia fila (`chipsDeTab`),
   * debajo, y son distintos en cada sección — ver `LB_CHIPS_BY_TAB`.
   */
  const tabsVisibles = useMemo(
    () => LB_TABS.map((id) => LB_CHANNELS.find((c) => c.id === id)).filter((c): c is (typeof LB_CHANNELS)[number] => !!c),
    [],
  );

  /**
   * Me gusta desde la tarjeta del feed (corazón o doble toque). Se pinta al
   * momento y, si el servidor falla, se deshace.
   */
  const likeFromCard = useCallback((card: LbPostCard, liked: boolean) => {
    const patch = (list: LbPostBase[]) => list.map((p) => {
      if (p.id !== card.id) return p;
      const stats = p.stats ?? ({} as LbPostBase['stats']);
      const likes = Math.max(0, (stats.likes ?? 0) + (liked ? 1 : -1));
      return { ...p, stats: { ...stats, likedByMe: liked, likes } };
    });
    setPosts(patch);
    lifebookActionsApi.toggleLike(card.id, liked).catch(() => {
      setPosts((list) => list.map((p) => {
        if (p.id !== card.id) return p;
        const stats = p.stats ?? ({} as LbPostBase['stats']);
        return {
          ...p,
          stats: { ...stats, likedByMe: !liked, likes: Math.max(0, (stats.likes ?? 0) + (liked ? -1 : 1)) },
        };
      }));
    });
  }, []);

  /**
   * Parte 31: callback estable para abrir una publicación. Al ser estable, las
   * tarjetas memoizadas (PostCard) no se vuelven a renderizar cuando la
   * pantalla cambia por cualquier otro motivo.
   *
   * B1 (2026-09-12): si la publicación es un VÍDEO reproducible, se abre el feed
   * inmersivo (`/lifebook-videos`) empezando por ese vídeo — es la entrada B de la
   * decisión del dueño (A+B). Todo lo demás sigue yendo al detalle.
   *
   * Se comprueba la URL real en el payload, no el `type`: un post marcado como
   * vídeo sin URL pintaría una pantalla negra, y `/lifebook-videos` filtra igual
   * (su `videoUrlOf`), así que entrar con un id sin vídeo dejaría la lista vacía.
   */
  const openPost = useCallback(
    (id: string) => {
      const raw = postsRef.current.find((p) => p.id === id);
      const payload = (raw?.payload ?? {}) as Record<string, unknown>;
      const vurl = typeof payload.videoUrl === 'string' ? payload.videoUrl.trim() : '';
      if (raw && vurl) {
        router.push({
          pathname: '/lifebook-videos',
          // De un ref: meter `channelId`/`city` en las dependencias haría el
          // callback inestable y repintaría las tarjetas memoizadas al cambiar de
          // canal — justo lo que la Parte 31 evitó.
          params: { startId: id, channel: ctxRef.current.channelId, city: ctxRef.current.city },
        } as never);
        return;
      }
      irSeguro.libre('/lifebook-post/[id]', { id });
    },
    [router],
  );

  /** Deslizar en el feed cambia de canal (Para ti → Siguiendo → Cerca…). */
  const goChannel = useCallback((dir: 1 | -1) => {
    const ids = LB_TABS;
    const i = ids.indexOf(channelId);
    const next = ids[Math.min(ids.length - 1, Math.max(0, i + dir))];
    if (next && next !== tab) abrirTab(next);
  }, [tab, abrirTab]);

  const swipeChannels = useMemo(() => Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-18, 18])
    .onEnd((e) => {
      if (e.translationX <= -60) runOnJS(goChannel)(1);
      else if (e.translationX >= 60) runOnJS(goChannel)(-1);
    }), [goChannel]);

  /* ── Dock ── */
  const dockNav = useAppDock('lifebook');
  const onDockNavigate = (t: FooterTab) => dockNav(t, city);

  /* ── Opciones de publicación ── */
  const PUBLISH_OPTIONS = useMemo(
    () => [
      {
        label: 'Nota',
        desc: 'Texto y fotos de tu día a día',
        icon: PenSquare,
        color: brand.like,
        route: '/lifebook-compose' as const,
        params: {},
      },
      // Parte 33: publicar en la tienda (producto o servicio) desde el panel «+».
      {
        label: 'Vender',
        desc: 'Producto con precio, entrega y pago',
        icon: ShoppingBag,
        color: brand.success,
        route: '/lifebook-sell' as const,
        params: { type: 'sale' },
      },
      {
        label: 'Ofrecer servicio',
        desc: 'Oficios, clases, reparaciones…',
        icon: Package,
        color: brand.info,
        route: '/lifebook-sell' as const,
        params: { type: 'service' },
      },
      {
        label: 'Video corto',
        desc: 'Hasta 1 min · talento, humor, tutoriales',
        icon: Video,
        color: '#7C3AED',
        route: '/lifebook-media' as const,
        params: { kind: 'video' },
      },
      {
        label: 'Podcast',
        desc: 'Audio con portada · charlas y cultura',
        icon: Mic,
        color: '#E0439A',
        route: '/lifebook-media' as const,
        params: { kind: 'podcast' },
      },
      {
        label: 'Serie',
        desc: 'Episodios por temporadas · comedia, drama…',
        icon: Clapperboard,
        color: brand.secondary,
        route: '/lifebook-media' as const,
        params: { kind: 'serie' },
      },
    ],
    [],
  );

  /* ────────────────────────────────────────────
     RENDER
  ──────────────────────────────────────────── */
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* ═══════════ BARRA SUPERIOR ═══════════ */}
      <View
        style={[
          styles.topBar,
          {
            paddingTop: insets.top + 4,
            borderBottomColor: alpha(colors.border, 0.6),
          },
        ]}
      >
        {/* La barra de arriba se queda con lo mínimo (lo pidió el dueño):
            · FUERA «Volver»: Life Book es una pestaña del dock, y volver desde una
              pestaña no significa nada.
            · FUERA el selector de ciudad: la ciudad pasa a ser una PESTAÑA
              («Ciudad»), que es donde tiene sentido cambiarla y ver lo de cada una.
            · FUERA el icono de Mensajes: ya está en el dock, y ahí lleva el contador
              de no leídos (no se pierde el aviso).
            · FUERA el avatar: se muda a la pantalla de mensajes, junto a los
              contadores de me gusta, seguidores y comentarios. El perfil sigue
              teniendo puerta en el dock, así que no se pierde ninguna.
            Queda la BÚSQUEDA, que es lo único que no está en otro sitio. */}

        {/* TANDA M — EL ASISTENTE DE IA, A LA IZQUIERDA (lo pidió el dueño: «el icono está mal
            posicionado, debe irse a la izquierda»). Va antes del espaciador, que es lo que empuja el
            resto a la derecha: así es lo PRIMERO de la barra, siempre a mano. Abre un chat que
            recomienda productos REALES del catálogo. */}
        <Pressable
          onPress={() => irSeguro.libre('/lifebook-ai')}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Asistente"
          style={[styles.msgBtn, { marginRight: espaciado.e8 }]}
        >
          <Sparkles size={20} color={colors.primary} />
        </Pressable>

        <View style={styles.topBarSpacer} />

        {/* La entrada al feed inmersivo de vídeo YA NO VIVE AQUÍ.
            Estaba como icono en esta barra y el dueño pidió moverla junto al botón de
            publicar (abajo, a la derecha), con un ▶ en vez del icono de vídeo: la barra
            superior queda para lo que es navegación (ciudad, buscar, mensajes) y el
            vídeo pasa a estar donde está la acción de publicar. Ver el FAB de abajo. */}

        {/* B4 · Buscar como ICONO, no como barra ancha.
            Antes había aquí un campo falso ("Buscar en Life Book") que ocupaba
            todo el ancho disponible y solo servía para navegar a
            /lifebook-search — donde está el campo de verdad. O sea: la barra
            duplicaba visualmente algo que ya existe en su pantalla, y dejaba la
            ciudad y los mensajes apretados en los bordes.
            El icono de cámara que llevaba dentro era DECORATIVO: no tenía
            onPress propio (toda la barra navegaba al buscador), y el escaneo
            real ya es accesible desde /lifebook-messages (`onQr`), así que no se
            pierde ninguna función al quitarlo. */}
        <Pressable
          onPress={() => irSeguro.libre('/lifebook-search')}
          hitSlop={8}
          accessibilityRole="search"
          accessibilityLabel="Buscar en Life Book"
          style={styles.msgBtn}
        >
          <Search size={20} color={colors.textPrimary} />
        </Pressable>

        {/* Aquí estaba el asistente de IA: el dueño lo quiere a la IZQUIERDA de la barra, así que
            vive antes del espaciador. */}

        {/* Aquí estaban el icono de Mensajes y el avatar del dueño, y los dos se han
            ido a propósito: Mensajes ya vive en el dock (con su contador) y el avatar
            se muda a la pantalla de mensajes, junto a los contadores de me gusta,
            seguidores y comentarios. El perfil conserva su puerta en el dock. */}
      </View>

      {/* ═══════════ CANALES (tabs estilo XHS) ═══════════ */}      <View style={[styles.channelsWrap, { borderBottomColor: alpha(colors.border, 0.5) }]}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={tabsVisibles}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: espaciado.e12, gap: espaciado.e4 }}
          renderItem={({ item }) => {
            const active = item.id === channelId;
            return (
              <Pressable
                onPress={() => abrirTab(item.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={styles.channelTab}
              >
                <Text
                  style={[
                    styles.channelText,
                    {
                      color: active ? colors.textPrimary : colors.textSecondary,
                      fontWeight: active ? '800' : '500',
                      fontSize: active ? 14.5 : 13.5,
                    },
                  ]}
                >
                  {item.label}
                </Text>
                {/* Indicador inferior */}
                {active && (
                  <View
                    style={[
                      styles.channelIndicator,
                      { backgroundColor: colors.primary },
                    ]}
                  />
                )}
              </Pressable>
            );
          }}
        />
      </View>

      {/* SELECTOR DE CIUDAD — dentro de Ciudad, que es donde el dueño dijo que tiene sentido
          cambiarla. La hoja de ciudades ya existía, pero NADA la abría: era código muerto y por eso
          no había forma de mirar el contenido de otra ciudad. */}
      {tab === 'nearby' ? (
        <Pressable
          onPress={() => setCityOpen(true)}
          accessibilityLabel={"Ciudad: " + city + ". Cambiar de ciudad"}
          style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, paddingHorizontal: espaciado.e14, paddingTop: espaciado.e9 }}
        >
          <MapPin size={15} color={colors.primary} />
          <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: '900' }}>{city}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '700' }}>▾ cambiar</Text>
        </Pressable>
      ) : null}
      {/* ═══ CHIPS DE DISTANCIA (solo en la sección CIUDAD · 同城) ═══
          La especificación pide tres distancias: 附近 (lo que se puede ir andando), 3 km (el
          barrio) y 全城 (toda la ciudad, sin filtro). Filtran de verdad: el servidor calcula la
          distancia real desde mi posición y deja fuera lo que no tiene sitio (no se promete una
          distancia que no se sabe). Si no hay permiso de ubicación se dice, en vez de dejar el
          feed vacío sin explicación. */}
      {tab === 'nearby' ? (
        <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: alpha(colors.border, 0.5) }}>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={LB_DISTANCIAS}
            keyExtractor={(d) => d.id}
            contentContainerStyle={{ paddingHorizontal: espaciado.e12, gap: espaciado.e8, paddingVertical: espaciado.e8 }}
            renderItem={({ item, index }) => {
              const activo = index === distIdx;
              return (
                <Pressable
                  onPress={() => { void elegirDistancia(index); }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: activo }}
                  accessibilityLabel={`${item.label} · ${item.hint}`}
                  style={{
                    paddingHorizontal: espaciado.e13, paddingVertical: espaciado.e7, borderRadius: radios.full, borderWidth: 1,
                    borderColor: activo ? colors.primary : alpha(colors.border, 0.7),
                    backgroundColor: activo ? alpha(colors.primary, 0.14) : 'transparent',
                  }}
                >
                  <Text style={{ fontSize: tipografia.caption, fontWeight: activo ? '900' : '600', color: activo ? colors.primary : colors.textSecondary }}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            }}
          />
          {!miPos && distIdx !== LB_DISTANCIAS.length - 1 ? (
            <Pressable onPress={() => { void pedirUbicacion(); }} accessibilityLabel="Activar la ubicación" style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e5, paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e8 }}>
              <Text style={{ color: brand.warning, fontSize: tipografia.caption, fontWeight: '800' }}>📍 Activar la ubicación</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* ═══ CHIPS DE LA SECCIÓN ═══
          La segunda fila: cada sección tiene los suyos (es lo que pidió el dueño) y
          filtran DENTRO de ella, no son decorativos: «Comercio» en Seguidos es el
          comercio de la gente que sigo, y en Ciudad el de mi ciudad. */}
      <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: alpha(colors.border, 0.5) }}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={chipsDeTab}
          keyExtractor={(c) => `${tab}-${c.channel}-${c.type ?? 'todo'}`}
          contentContainerStyle={{ paddingHorizontal: espaciado.e12, gap: espaciado.e8, paddingVertical: espaciado.e9 }}
          renderItem={({ item, index }) => {
            const activo = index === chipIdx;
            return (
              <Pressable
                onPress={() => setChipIdx(index)}
                accessibilityRole="button"
                accessibilityState={{ selected: activo }}
                style={{
                  paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e6, borderRadius: radios.full,
                  backgroundColor: activo ? alpha(colors.primary, 0.14) : alpha(colors.textPrimary, 0.06),
                }}
              >
                <Text
                  style={{
                    fontSize: tipografia.caption,
                    fontWeight: activo ? '800' : '600',
                    color: activo ? colors.primary : colors.textSecondary,
                  }}
                >
                  {item.label}
                </Text>
              </Pressable>
            );
          }}
        />
      </View>

      {/* ═══ A QUIEN SIGUES (solo en la pestaña «Seguidos», con el chip «Todo») ═══
          Es el módulo de Xiaohongshu que pidió el dueño: en 关注, arriba, los avatares
          de la gente que sigues. Se pinta SOLO ahí: en Descubrir o Ciudad no significa
          nada. Sin anillo de «novedad» a propósito (haría falta estado por usuario y autor
          que no existe); va ordenada por quién publicó más recientemente, que sí se puede
          calcular.

          OJO — DEFECTO ARREGLADO: la condición era `channelId === 'following'`, y ese canal
          lo comparten TODOS los chips de la sección (Todo, Comercio, Vídeos, Debates: ver
          `LB_CHIPS_BY_TAB`). Así que al filtrar por «Comercio» seguía saliendo el carrusel
          de avatares, que ahí no pinta nada (el dueño lo vio: «has agregado el carrusel de
          A QUIÉN SIGUES en comercio, no deben estar ahí»). Ahora exige además el chip
          «Todo» (`chipIdx === 0`): es la portada de la sección, no un filtro. */}
      {channelId === 'following' && chipIdx === 0 ? (
        <AvatarsSeguidos
          gente={seguidos}
          colors={colors}
          onOpen={(id) => irSeguro.libre('/lifebook-user', { id })}
        />
      ) : null}

      {/* ═══════════ FEED ═══════════ */}
      {loading ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          <SkeletonGrid />
        </ScrollView>
      ) : error ? (
        <View style={styles.center}>
          <Text
            style={{
              color: colors.danger,
              fontSize: tipografia.body,
              fontWeight: '700',
              textAlign: 'center',
              paddingHorizontal: espaciado.e30,
              marginBottom: espaciado.e14,
            }}
          >
            {error}
          </Text>
          <Pressable
            onPress={() => load(channelId, city, 'initial')}
            style={[styles.retryBtn, { backgroundColor: colors.primary }]}
          >
            <RefreshCw size={14} color={brand.white} />
            <Text style={{ color: brand.white, fontWeight: '800', fontSize: tipografia.body }}>
              Reintentar
            </Text>
          </Pressable>
        </View>
      ) : posts.length === 0 ? (
        /* ── Estado vacío ── */
        <View style={styles.center}>
          <channel.icon size={44} color={alpha(channel.color, 0.4)} />
          <Text
            style={[
              styles.emptyTitle,
              { color: colors.textPrimary, marginTop: espaciado.e12 },
            ]}
          >
            Sin publicaciones
          </Text>
          <Text
            style={[
              styles.emptyText,
              { color: colors.textSecondary, marginTop: espaciado.e6 },
            ]}
          >
            {EMPTY_COPY[channelId] ?? 'Todavía no hay publicaciones aquí.'}
          </Text>
        </View>
      ) : (
        /* ── Feed masonry (desliza en horizontal para cambiar de canal) ── */
        <GestureDetector gesture={swipeChannels}>
        <FlatList
          data={[{ left: leftCol, right: rightCol }]}
          keyExtractor={() => 'masonry'}
          renderItem={({ item }) => (
            <View style={styles.masonryRow}>
              {/* Columna izquierda */}
              <View style={styles.masonryCol}>
                {item.left.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    width={COLUMN_W}
                    onPress={openPost}
                    onMore={setMorePost}
                    onLike={likeFromCard}
                  />
                ))}
              </View>
              {/* Columna derecha */}
              <View style={styles.masonryCol}>
                {item.right.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    width={COLUMN_W}
                    onPress={openPost}
                    onMore={setMorePost}
                    onLike={likeFromCard}
                  />
                ))}
              </View>
            </View>
          )}
          contentContainerStyle={{
            paddingBottom: DOCK_BODY_H + insets.bottom + 80,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshing={refreshing}
          onRefresh={() => load(channelId, city, 'refresh')}
          ListFooterComponent={
            loadingMore ? (
              <ActivityIndicator
                color={colors.primary}
                style={{ marginVertical: espaciado.e16 }}
              />
            ) : posts.length > 0 && !nextCursor ? (
              <Text
                style={{
                  textAlign: 'center',
                  color: colors.textSecondary,
                  fontSize: tipografia.caption,
                  marginVertical: espaciado.e14,
                }}
              >
                Ya estás al día ✨
              </Text>
            ) : null
          }
        />
        </GestureDetector>
      )}

      {/* ═══════════ FABs: ▶ vídeos + publicar ═══════════
          Los dos van en la MISMA columna y anclados juntos, no cada uno con su
          `bottom` calculado a mano: así el ▶ queda siempre «justo encima» del de
          publicar (que es lo que se pidió) y no se descuadran si el dock cambia de
          alto. El orden visual es ▶ arriba, + abajo.
          El ▶ es la MISMA navegación que hacía el icono que estaba en la barra
          superior: abre /lifebook-videos por el canal y la ciudad que se están
          mirando. Fondo oscuro y no `colors.primary`: el de publicar es LA acción de
          la pantalla y dos botones del mismo color competirían por la mirada. */}
      <View style={[styles.fabCol, { bottom: DOCK_BODY_H + insets.bottom + 16 }]}>
        <Pressable
          onPress={() => router.push({
            pathname: '/lifebook-videos',
            params: { channel: channelId, city },
          } as never)}
          accessibilityRole="button"
          accessibilityLabel="Vídeos en pantalla completa"
          style={[styles.fab, { backgroundColor: colors.textPrimary }]}
        >
          <Play size={22} color={brand.white} fill={brand.white} strokeWidth={1.5} style={{ marginLeft: espaciado.e3 }} />
        </Pressable>

        <Pressable
          onPress={() => setPublishOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Publicar contenido"
          style={[styles.fab, { backgroundColor: colors.primary }]}
        >
          <Plus size={24} color={brand.white} strokeWidth={2.5} />
        </Pressable>
      </View>

      {/* ═══════════ DOCK ═══════════ */}
      <FloatingFooter active="lifebook" onNavigate={onDockNavigate} showUnreadBadge />

      {/* ═══════════ MODAL: Reportar ═══════════ */}
      <ReportSheet
        post={morePost}
        onClose={() => setMorePost(null)}
        onReport={async (postId, reason) => {
          try {
            await lifebookActionsApi.report(postId, 'post', reason);
            Alert.alert('Gracias', 'Tu reporte fue enviado. El equipo lo revisará.');
          } catch (e) {
            Alert.alert('Reportar', e instanceof Error ? e.message : 'No se pudo enviar el reporte.');
          }
        }}
        onBlocked={() => load(channelId, city, 'initial')}
      />

      {/* ═══════════ MODAL: Publicar ═══════════ */}
      <Modal
        visible={publishOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPublishOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setPublishOpen(false)}
        >
          <Pressable
            style={[
              styles.pubSheet,
              {
                backgroundColor: colors.card,
                paddingBottom: insets.bottom + 20,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <View
              style={[
                styles.sheetHandle,
                { backgroundColor: alpha(colors.textSecondary, 0.2) },
              ]}
            />
            <Text
              style={[
                styles.pubSheetTitle,
                { color: colors.textPrimary },
              ]}
            >
              ¿Qué quieres publicar?
            </Text>

            {PUBLISH_OPTIONS.map((o) => {
              const Icon = o.icon;
              return (
                <Pressable
                  key={o.label}
                  onPress={() => {
                    setPublishOpen(false);
                    router.push({
                      pathname: o.route,
                      params: o.params,
                    } as never);
                  }}
                  style={({ pressed }) => [
                    styles.pubRow,
                    {
                      backgroundColor: pressed
                        ? alpha(o.color, 0.06)
                        : alpha(colors.textSecondary, 0.04),
                    },
                  ]}
                  accessibilityRole="button"
                >
                  <View
                    style={[
                      styles.pubIcon,
                      { backgroundColor: alpha(o.color, 0.12) },
                    ]}
                  >
                    <Icon size={22} color={o.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: colors.textPrimary,
                        fontSize: 15,
                        fontWeight: '800',
                      }}
                    >
                      {o.label}
                    </Text>
                    <Text
                      style={{
                        color: colors.textSecondary,
                        fontSize: tipografia.caption,
                        marginTop: 1,
                      }}
                    >
                      {o.desc}
                    </Text>
                  </View>
                  <ChevronDown
                    size={16}
                    color={colors.textSecondary}
                    style={{ transform: [{ rotate: '-90deg' }] }}
                  />
                </Pressable>
              );
            })}

            <Pressable
              onPress={() => setPublishOpen(false)}
              style={{ paddingVertical: espaciado.e12, marginTop: espaciado.e4 }}
            >
              <Text
                style={{
                  textAlign: 'center',
                  color: colors.textSecondary,
                  fontWeight: '700',
                  fontSize: tipografia.body,
                }}
              >
                Cancelar
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ═══════════ MODAL: Selector de ciudad ═══════════ */}
      <Modal
        visible={cityOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCityOpen(false)}
      >
        <Pressable
          style={styles.backdrop}
          onPress={() => setCityOpen(false)}
        >
          <Pressable
            style={[
              styles.sheet,
              {
                backgroundColor: colors.card,
                paddingBottom: insets.bottom + 18,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View
              style={[
                styles.sheetHandle,
                { backgroundColor: alpha(colors.textSecondary, 0.2) },
              ]}
            />
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
              Elige ciudad
            </Text>
            <Text
              style={[styles.sheetHint, { color: colors.textSecondary }]}
            >
              Afecta a los canales de tu zona (Cerca, ventas, debates…)
            </Text>

            {/* OJO: con 20 ciudades la lista NO cabía en la hoja y no había forma de llegar a las
                de abajo (reportado desde el teléfono). Se desplaza y tiene un tope de alto. */}
            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
            {LB_CITIES.map((c) => {
              const active = c === city;
              return (
                <Pressable
                  key={c}
                  onPress={() => {
                    setCity(c);
                    setCityOpen(false);
                  }}
                  style={[
                    styles.cityOption,
                    {
                      backgroundColor: active
                        ? alpha(colors.primary, 0.08)
                        : 'transparent',
                    },
                  ]}
                >
                  <MapPin
                    size={16}
                    color={active ? colors.primary : colors.textSecondary}
                  />
                  <Text
                    style={{
                      color: active
                        ? colors.primary
                        : colors.textPrimary,
                      fontSize: 15,
                      fontWeight: active ? '800' : '600',
                    }}
                  >
                    {c}
                  </Text>
                </Pressable>
              );
            })}
            </ScrollView>

            {/* ELEGIR LIBREMENTE: el mapa y el buscador de sitios que ya existen. Sirve para
                explorar otra zona sin estar ahí (y para las ciudades que no van a estar nunca en
                una lista corta). Al elegir un sitio, se toma su ciudad si el geocoder la da; si no,
                se usa el propio sitio como referencia de la distancia. */}
            <Pressable
              onPress={() => { setCityOpen(false); setMapaCiudadOpen(true); }}
              accessibilityLabel="Elegir en el mapa o buscar un sitio"
              style={{ marginTop: espaciado.e12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e7 }}
            >
              <MapPin size={15} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: '900' }}>
                🗺️ Elegir en el mapa o buscar
              </Text>
            </Pressable>

            {meCity && meCity !== city && (
              <Pressable
                onPress={() => {
                  setCity(meCity);
                  setCityOpen(false);
                }}
                style={{ marginTop: espaciado.e6 }}
              >
                <Text
                  style={{
                    color: colors.primary,
                    fontSize: tipografia.caption,
                    textAlign: 'center',
                    fontWeight: '600',
                  }}
                >
                  Usar mi ciudad: {meCity}
                </Text>
              </Pressable>
            )}
          </Pressable>
        </Pressable>
      </Modal>
      {/* TANDA I — ELEGIR CIUDAD O ZONA LIBREMENTE: el buscador de sitios y el mapa que ya existen
          (los mismos de «Crear ruta» y las quedadas). Del resultado se saca la ciudad
          («Sitio, Ciudad, País»); si no se puede, el punto elegido se usa como referencia para
          medir distancias. Así se explora cualquier zona sin estar físicamente ahí. */}
      <LocationPickerSheet
        visible={mapaCiudadOpen}
        onClose={() => setMapaCiudadOpen(false)}
        title="¿Qué zona quieres explorar?"
        onSubmit={(loc) => {
          const partes = String(loc.label ?? '').split(',').map((s) => s.trim()).filter(Boolean);
          /* La ciudad se busca ENTRE LAS QUE CONOCEMOS: el geocoder devuelve cosas como
             «EGTC - Tienda Semu, Malabo, Guinea Ecuatorial», y quedarse con una posición fija del
             texto ponía el nombre de la TIENDA como si fuera la ciudad (pasó). */
          const ciudad = partes.find((x) => (LB_CITIES as readonly string[]).some((c2) => c2.toLowerCase() === x.toLowerCase()))
            ?? (partes.length >= 2 ? partes[partes.length - 2] : (partes[0] ?? ''));
          if (ciudad) setCity(ciudad);
          setPosManual({ lat: loc.lat, lng: loc.lng });
          setMapaCiudadOpen(false);
        }}
      />
    </View>
  );
}

/* ──────────────────────────────────────────────
   ESTILOS
────────────────────────────────────────────── */
const styles = StyleSheet.create({
  root: { flex: 1 },

  /* ── Barra superior ── */
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: espaciado.e10,
    paddingBottom: espaciado.e8,
    gap: espaciado.e8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  /**
   * Separador flexible de la barra superior: deja la búsqueda a la derecha.
   *
   * (Antes empujaba también los mensajes y dejaba la ciudad a la izquierda; los dos
   * se han quitado de la barra — ver el comentario de la cabecera — así que este
   * estilo se queda solo con la búsqueda.)
   */
  topBarSpacer: { flex: 1 },
  msgBtn: { padding: espaciado.e4 },

  /* ── Canales ── */
  channelsWrap: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  channelTab: {
    paddingHorizontal: espaciado.e10,
    paddingVertical: espaciado.e10,
    alignItems: 'center',
  },
  channelText: {
    fontSize: tipografia.body,
  },
  channelIndicator: {
    marginTop: espaciado.e4,
    width: 20,
    height: 2.5,
    borderRadius: 2,
  },

  /* ── Feed masonry ── */
  masonryRow: {
    flexDirection: 'row',
    paddingHorizontal: SIDE_PADDING,
    gap: COLUMN_GAP,
    paddingTop: espaciado.e8,
  },
  masonryCol: {
    flex: 1,
    gap: COLUMN_GAP,
  },

  /* ── Estados ── */
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.e7,
    borderRadius: radios.full,
    paddingHorizontal: espaciado.e18,
    paddingVertical: espaciado.e10,
  },
  emptyTitle: { fontSize: tipografia.subtitle, fontWeight: '800' },
  emptyText: {
    fontSize: tipografia.body,
    textAlign: 'center',
    lineHeight: 19,
    paddingHorizontal: 40,
  },

  /* ── FABs ──
     `fabCol` es quien se ancla (posición y `bottom`, que va en línea porque depende
     de los insets). Cada `fab` solo pone su tamaño, su forma y su sombra. */
  fabCol: {
    position: 'absolute',
    right: 16,
    alignItems: 'center',
    gap: espaciado.e10,
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.md,
  },

  /* ── Modales ── */
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: espaciado.e18,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: espaciado.e14,
  },
  sheetTitle: { fontSize: 17, fontWeight: '900' },
  sheetHint: { fontSize: tipografia.caption, marginTop: espaciado.e3, marginBottom: espaciado.e10 },
  cityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.e10,
    paddingVertical: espaciado.e12,
    paddingHorizontal: espaciado.e12,
    borderRadius: radios.md,
  },
  pubSheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: espaciado.e18,
  },
  pubSheetTitle: {
    fontSize: 17,
    fontWeight: '900',
    marginBottom: espaciado.e14,
    textAlign: 'center',
  },
  pubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.e12,
    borderRadius: 14,
    padding: espaciado.e13,
    marginBottom: espaciado.e8,
  },
  pubIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
