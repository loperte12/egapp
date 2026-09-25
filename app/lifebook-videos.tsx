/**
 * LifeBookVideosScreen — FEED INMERSIVO DE VÍDEO (B1).
 *
 * Deslizar arriba/abajo pasa de un vídeo al siguiente SIN salir a otra pantalla:
 * una página por vídeo, autoplay del que está visible y pausa del resto, silencio
 * al entrar con botón para activar el sonido, doble toque = me gusta, y el
 * siguiente vídeo ya montado (precarga) para que el pase no espere.
 *
 * ── POR QUÉ ASÍ, Y NO DE OTRA FORMA ─────────────────────────────────────────
 * · FlatList con `pagingEnabled` + `getItemLayout` de altura fija. En el proyecto
 *   NO hay `react-native-pager-view` ni `@shopify/flash-list`, y añadirlos por esto
 *   no compensa: con una página = una pantalla, `getItemLayout` da paginado exacto,
 *   `initialScrollIndex` gratis y precarga controlada con `windowSize`.
 * · El feed masonry de `lifebook.tsx` NO se toca. Es un FlatList con UN solo item
 *   que contiene las dos columnas (`data={[{ left, right }]}`), así que un vídeo a
 *   pantalla completa no cabe ahí dentro ni se puede paginar. Esta pantalla es
 *   aparte a propósito — es la opción A+B que decidió el dueño: canal de vídeo
 *   propio, y al tocar una tarjeta de vídeo del masonry se entra aquí.
 * · **ÉSTE ES EL ÚNICO ESTADO DE VER VÍDEO.** `/lifebook-player` ya sólo reproduce
 *   audio: su reproductor de vídeo se retiró (ver [P9] y la cabecera de ese fichero).
 *   Cuando esta pantalla pierde el foco (se abre el detalle), el vídeo se pausa y al
 *   volver se reanuda el visible: la lista no se desmonta ni se recarga.
 *
 * ── DECISIONES DE LA RONDA DE PRUEBAS EN EL APARATO (2026-09-13) ────────────
 * El dueño probó el build y pidió cambios concretos. Cada uno está marcado abajo
 * con [P#] para que se pueda rastrear por qué el código es así:
 *
 * [P2] `contentFit` pasa de `cover` a `contain`. Con `cover` un vídeo vertical se
 *      recortaba para llenar la pantalla y "no se alcanzaba a ver bien". `contain`
 *      muestra el vídeo ENTERO (con bandas negras arriba/abajo si hace falta) y el
 *      zoom que falte se lo da el usuario con la pinza ([P5]).
 * [P4] BUG GRAVE corregido: al pausar se veía la PORTADA en vez del fotograma del
 *      vídeo. La capa de portada se ocultaba con `opacity: isActive && !paused ? 0 : 1`,
 *      o sea que estaba atada al estado de pausa. Ahora se rige por
 *      `onFirstFrameRender`: la portada tapa solo hasta que hay fotograma real, y
 *      desde entonces no vuelve a aparecer. Pausar ya no la trae de vuelta.
 * [P5] ❌ QUITADO en la segunda ronda con el aparato (2026-09-13). Se añadió la pinza
 *      para hacer zoom con los dedos y el dueño la rechazó: en un vídeo a pantalla
 *      completa el zoom solo sirve para DEJAR DE VER el vídeo, y el resultado era
 *      «demasiado zoom, no se alcanza a ver bien».
 *      Lo que NO se toca: el doble toque sigue siendo ME GUSTA y el toque simple
 *      pausa/reanuda. El zoom era el único gesto que sobraba.
 * [P6] Compartir y Guardar en la columna de acciones, junto a me gusta y comentarios.
 *      Guardar usa el endpoint que YA existe (`toggleSave`), no se inventa nada.
 * [P8] Fila «Búsquedas relacionadas» como en 小红书: chips con los temas de la publicación que
 *      llevan al buscador. Se construye con `topics`/`tags`, que YA vienen en el
 *      post — cero peticiones extra.
 *      ⚠️ El GRUPO del autor que pedía el dueño NO se puede pintar: `LbAuthor`
 *      (api/lifebook.ts:15-25) trae id, nombre, avatar, rol y seguidoPorMí, pero
 *      NO trae grupo, y no hay endpoint de «grupos de un usuario». Hace falta
 *      backend. No se inventa un campo que el servidor no manda.
 * [P9] ❌ QUITADO. El icono «Ver a pantalla completa» abría `/lifebook-player`. El dueño
 *      pidió que hubiera UN ÚNICO estado de ver vídeo —éste— y el reproductor de vídeo se
 *      retiró entero (ver la cabecera de `app/lifebook-player.tsx`). Un toque sobre un
 *      vídeo LARGO, que antes llevaba allí, ahora lo reproduce AQUÍ.
 * [P10] LA FRANJA NEGRA, FUERA. El móvil es 2,20:1 y un vídeo 9:16 deja dos bandas negras
 *      del 19 % con `contain`. Ahora se LLENA la pantalla cuando el recorte que cuesta es
 *      asumible (≤25 %) y, cuando no (un vídeo horizontal), se enseña entero sobre un fondo
 *      DESENFOCADO del propio vídeo, nunca sobre negro. Se decide con el tamaño real del
 *      vídeo (`player.videoTrack.size`). Ver `RECORTE_MAX` y el comentario en `VideoPage`.
 * [P11] UN GESTO = UN VÍDEO. `disableIntervalMomentum` + `decelerationRate="fast"`: un
 *      deslizamiento rápido ya no encadena dos o tres vídeos.
 * [P12] LOS COMENTARIOS NO TAPAN EL VÍDEO. Se abre la misma hoja del detalle, pero con el
 *      velo a 0 (aquí debajo hay un vídeo reproduciéndose, no una pantalla que oscurecer) y
 *      con la altura acotada al 55 % para que el vídeo conserve casi media pantalla.
 *
 * ── NOMENCLATURA: NADA DE CHINO EN LO QUE SE LEE ────────────────────────────
 * Los diseños de referencia son de 小红书 (Xiaohongshu) y TikTok, y en los comentarios se
 * citan por su nombre: eso ayuda a entender de dónde sale cada cosa y se queda así.
 * Lo que NO se queda en chino es **nada que el usuario pueda leer**, ni etiquetas visibles ni
 * `accessibilityLabel`: la app está en español y un lector de pantalla leería caracteres que
 * el usuario no sabe leer. Se coló «相关搜索» copiado del diseño; ahora es «Búsquedas
 * relacionadas». La misma revisión encontró las pestañas en chino de
 * `app/ecomerse-favorites.tsx`, que también se tradujeron.
 *
 * ── LÍMITES MEDIDOS, no supuestos ───────────────────────────────────────────
 * · `expo-video` 2.2.3 **no exporta `useVideoPlayerStatus`**: el estado de
 *   reproducción se gestiona aquí con estado propio (somos nosotros quienes
 *   llamamos a `play()`/`pause()`), sin suscribirse a eventos. Menos superficie y
 *   sin API inventada.
 * · No hay `seekTo()` en esta versión: se salta asignando `player.currentTime`
 *   (documentado en VideoPlayer.types.d.ts:44-48). No se usa aquí, pero queda
 *   anotado para quien añada barra de progreso.
 * · `expo-haptics` **no está instalado**, así que el doble toque NO vibra. Añadir
 *   la dependencia por una vibración no merece la pena sin decidirlo aparte.
 *
 * Ruta: /lifebook-videos?startId=&channel=&city=
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, Share, StyleSheet, Text, View,
  useWindowDimensions, type ViewToken, type ViewabilityConfig,
} from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
// [P5] `runOnJS` se queda: los TAPES son gestos y corren en la UI thread, así que
// avisar a la JS thread de «doble toque = me gusta» sigue pasando por aquí. Lo que se
// fue con el zoom son `Animated`, `useSharedValue`, `useAnimatedStyle` y `withTiming`.
import { runOnJS } from 'react-native-reanimated';
import { useVideoPlayer, VideoView } from 'expo-video';
import {
  ArrowLeft, Bookmark, Heart, MessageCircle, Share2, ShoppingBag, Volume2, VolumeX,
} from 'lucide-react-native';
import { alpha, EmptyState, espaciado, InlineError, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { absUrl } from '../api/config';
import { ir as irSeguro } from '../constants/rutas';
import { authApi } from '../api/auth';
import { productosEnNotaApi, type LbProductoEnNota } from '../api/lifebookProductos';
import { lbXaf } from '../constants/lifebook';
import {
  lifebookActionsApi, lifebookApi,
  type LbFeedPage, type LbPostBase,
} from '../api/lifebook';
import { CommentsSheet } from '../components/lifebook/CommentsSheet';
import { SeguirViendo } from '../components/lifebook/SeguirViendo';
import { watchApi, type LbSeguirViendo } from '../api/lifebookWatch';
import { fmtDur } from '../constants/lifebook';
import { brand } from '@egrouteplan/ui-kit';

const LIKE_RED = brand.like;
const PAGE = 40;

/**
 * Cuánto se acepta RECORTAR del vídeo con tal de llenar la pantalla (0,25 = 25 %).
 *
 * Es la bisagra entre «llenar» y «encajar» (ver el comentario largo en `VideoPage`). Por
 * encima de esto el recorte se nota y se pierde contenido de verdad, así que se prefiere
 * encajar el vídeo entero sobre un fondo desenfocado antes que comerse un cuarto de la imagen.
 */
const RECORTE_MAX = 0.25;

/**
 * Degradado inferior de legibilidad, SIN dependencias.
 *
 * Antes esto era un rectángulo PLANO: `rgba(0,0,0,0.42)` de 250 px de alto, con un borde
 * superior recto. Sobre un vídeo que ya no llena la pantalla con bandas negras, ese borde se
 * ve como lo que es —una capa pegada encima— y el dueño lo reportó tal cual: «esta capa que
 * cubre la parte inferior del vídeo de color negro transparente».
 *
 * No se añade `expo-linear-gradient` por esto: el proyecto evita dependencias nuevas cuando
 * se puede resolver con lo que ya hay, y aquí basta con apilar franjas de opacidad creciente.
 * A la vista es un degradado continuo; por dentro son 10 `View`.
 */
const SCRIM_BANDS = 10;
function BottomScrim({ height, max }: { height: number; max: number }) {
  const bands = [];
  for (let i = 0; i < SCRIM_BANDS; i++) {
    // De casi transparente arriba al máximo abajo: sin borde, sin escalón visible.
    const a = (max * (i + 1)) / SCRIM_BANDS;
    bands.push(
      <View
        key={i}
        style={{ height: height / SCRIM_BANDS, backgroundColor: `rgba(0,0,0,${a.toFixed(3)})` }}
      />,
    );
  }
  return (
    <View
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 2 }}
      pointerEvents="none"
    >
      {bands}
    </View>
  );
}

/**
 * A partir de aquí, un vídeo es LARGO (Parte 50) y el feed cambia de trato.
 *
 * El feed inmersivo está pensado para clips: autoplay del visible, en bucle, y el vídeo
 * siguiente con un desliz. Un vídeo de 50 minutos ahí dentro es lo peor de los dos mundos:
 *   · Autoplay + bucle = se descarga entero (cientos de MB) mientras el usuario mira, y al
 *     terminar vuelve a empezar como si fuera un clip.
 *   · Sin barra de progreso no hay forma de saber por dónde va ni de saltar.
 * Así que el largo NO se reproduce solo: se ve su portada con la duración y un botón, y al
 * tocarlo se abre el reproductor de verdad, que sí tiene controles. El umbral es el mismo
 * del backend (`video_short` = 60 s), para que "corto" signifique lo mismo en todas partes.
 */
const LARGO_DESDE_SEC = 60;

/** `payload.videoUrl` resuelto. El feed guarda los posts CRUDOS (`LbPostBase`),
 *  así que el vídeo está disponible aunque `toPostCard()` no lo exponga en la
 *  tarjeta. Devuelve '' si la publicación no tiene vídeo reproducible. */
function videoUrlOf(p: LbPostBase): string {
  const v = (p.payload ?? {}) as Record<string, unknown>;
  const raw = typeof v.videoUrl === 'string' ? v.videoUrl.trim() : '';
  return raw ? absUrl(raw) : '';
}

function coverOf(p: LbPostBase): string {
  const v = (p.payload ?? {}) as Record<string, unknown>;
  const c = typeof v.coverUrl === 'string' && v.coverUrl.trim() ? v.coverUrl.trim() : '';
  if (c) return absUrl(c);
  const first = p.media?.[0]?.url;
  return first ? absUrl(first) : '';
}

/**
 * [P8] Temas de la publicación para la fila «Búsquedas relacionadas». El servidor los manda como
 * `topics` y además como alias `tags` (Parte 11), así que se mira en los dos. Se
 * quitan vacíos y duplicados y se recorta a 6: más de seis chips no caben en una
 * fila y obligan a envolver, que en un vídeo a pantalla completa estorba.
 */
function topicsOf(p: LbPostBase): string[] {
  const raw = [...(p.topics ?? []), ...(p.tags ?? [])];
  const out: string[] = [];
  for (const t of raw) {
    const s = String(t ?? '').trim();
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= 6) break;
  }
  return out;
}

export default function LifeBookVideosScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height: H } = useWindowDimensions();
  const { startId, channel, city } = useLocalSearchParams<{
    startId?: string; channel?: string; city?: string;
  }>();

  const [posts, setPosts] = useState<LbPostBase[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Índice del vídeo visible = el único que reproduce. */
  const [active, setActive] = useState(0);
  /**
   * TANDA C — LOS PRODUCTOS QUE VAN DENTRO DE CADA VÍDEO.
   *
   * Se piden solo para el vídeo que se está viendo (una petición al cambiar de vídeo, y ninguna
   * si el vídeo no lleva productos): pedirlos para toda la lista sería una petición por vídeo.
   * Se guardan por id para no volver a pedirlos al subir y bajar.
   */
  const [prodsVideo, setProdsVideo] = useState<Record<string, LbProductoEnNota[]>>({});
  useEffect(() => {
    const p = posts[active];
    if (!p || prodsVideo[p.id]) return;
    let vivo = true;
    productosEnNotaApi.deNota(p.id)
      .then((r) => { if (vivo) setProdsVideo((prev) => ({ ...prev, [p.id]: r.products ?? [] })); })
      .catch(() => { if (vivo) setProdsVideo((prev) => ({ ...prev, [p.id]: [] })); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, posts]);
  /** Silencio por defecto al entrar (como 小红书): el sonido se activa a mano. */
  const [muted, setMuted] = useState(true);
  /** Pausa forzada por el usuario con un toque; se reinicia al cambiar de vídeo. */
  const [pausedId, setPausedId] = useState<string | null>(null);
  /** La pantalla perdió el foco (se abrió el detalle): pausar todo. */
  const [focused, setFocused] = useState(true);
  /** Usuario actual: lo necesita la hoja de comentarios para marcar los míos. */
  const [meId, setMeId] = useState<string | null>(null);
  /**
   * Comentarios EN SITIO, sin salir del feed.
   *
   * Antes el botón de comentarios hacía `router.push('/lifebook-post/[id]')`: te sacaba del
   * feed a otra pantalla y, al perder el foco, el vídeo se PAUSABA (`useFocusEffect` de
   * abajo). O sea que leer los comentarios paraba el vídeo y te sacaba del inmersivo, que es
   * justo lo contrario de lo que hace 小红书/TikTok y de lo que se pidió.
   *
   * Ahora se pinta la MISMA `CommentsSheet` (el componente que ya usa el detalle, sin
   * tocarlo) encima del vídeo, y el vídeo SIGUE REPRODUCIÉNDOSE debajo.
   *
   * `allowComments` NO viene en el feed: está en `LbPostDetail`, no en `LbPostBase`. Por eso
   * se abre con `true` y se corrige con el detalle en cuanto llega; suponerlo sin más
   * enseñaría la caja de escribir en una publicación que tiene los comentarios cerrados.
   */
  const [comments, setComments] = useState<{ id: string; allowComments: boolean } | null>(null);
  /**
   * «Seguir viendo»: los vídeos que dejé a medias. Se carga al entrar y se enseña
   * SOLO en el primer vídeo (ver `SeguirViendo`): el feed es inmersivo y una fila fija
   * encima estorba en cuanto se desliza.
   */
  const [seguir, setSeguir] = useState<LbSeguirViendo[]>([]);

  const listRef = useRef<FlatList<LbPostBase>>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  const didInitialScroll = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /* ── Carga ────────────────────────────────────────────────────────────────
     Se pide `type: 'video'` al servidor (el parámetro existe y ya lo usa
     `lifebook-explore.tsx`). Aun así se FILTRA en cliente por `videoUrl` real: un
     post de tipo vídeo sin URL reproducible pintaría un rectángulo negro, y eso es
     peor que no mostrarlo. */
  const load = useCallback(async (mode: 'initial' | 'more') => {
    if (busy.current) return;
    busy.current = true;
    if (mode === 'initial') { setLoading(true); setError(null); } else setLoadingMore(true);
    try {
      const page: LbFeedPage = await lifebookApi.feed(channel || 'for_you', {
        city: city || undefined,
        type: 'video',
        cursor: mode === 'more' ? (cursor ?? undefined) : undefined,
        limit: PAGE,
      });
      if (!mounted.current) return;
      const withVideo = (page.posts ?? []).filter((p) => videoUrlOf(p) !== '');
      setPosts((prev) => (mode === 'more' ? [...prev, ...withVideo] : withVideo));
      setCursor(page.nextCursor ?? null);
    } catch (e) {
      if (!mounted.current) return;
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los vídeos.');
    } finally {
      busy.current = false;
      if (mounted.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [channel, city, cursor]);

  useEffect(() => { void load('initial'); }, [channel, city]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Entrada B: empezar por el vídeo que se tocó en el masonry ─────────────
     `initialScrollIndex` necesita el índice en el primer render, y aún no hay
     datos. Se resuelve tras la primera carga con `scrollToIndex` sin animar. Si el
     vídeo no viene en la primera página (puede pasar si el feed del masonry estaba
     paginado), la lista se queda arriba: se avisa con el comentario de abajo en vez
     de fingir que siempre funciona. */
  useEffect(() => {
    if (loading || didInitialScroll.current || posts.length === 0) return;
    if (!startId) { didInitialScroll.current = true; return; }
    const i = posts.findIndex((p) => p.id === startId);
    didInitialScroll.current = true;
    if (i > 0) {
      // En el siguiente frame: la lista ya tiene `getItemLayout` y medida la altura.
      requestAnimationFrame(() => {
        listRef.current?.scrollToIndex({ index: i, animated: false });
        setActive(i);
      });
    }
  }, [loading, posts, startId]);

  /* ── Foco: al abrir el detalle o el reproductor, PAUSAR ────────────────────
     Sin esto el audio seguiría sonando encima de la otra pantalla, que es el fallo
     más visible de un feed de vídeo. Al volver, se reanuda solo el visible. */
  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => setFocused(false);
  }, []));

  const viewability = useRef<ViewabilityConfig>({
    // Con `pagingEnabled` el vídeo asentado ocupa el 100 %; 60 % evita que el
    // vecino cuente como visible a mitad de un deslizamiento.
    viewAreaCoveragePercentThreshold: 60,
  }).current;

  // Callback ESTABLE por referencia: si se recrea en cada render, FlatList avisa y
  // deja de notificar. De ahí el useRef con la lógica dentro.
  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[]; changed: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) {
      setActive(first.index);
      /* Al cambiar de vídeo se quita la pausa manual: el siguiente empieza reproduciendo…
         SALVO si es LARGO. Un vídeo de 50 minutos no puede autoreproducirse (descargaría
         cientos de MB sin que nadie lo haya pedido): arranca en pausa y el toque es el
         permiso. Antes esto se conseguía con un `!esLargo` en el efecto de reproducción,
         pero eso dejaba los largos sin forma de arrancarse; ahora es un estado. */
      const item = first.item as LbPostBase | undefined;
      const dur = Number((item?.payload as Record<string, unknown> | undefined)?.durationSec);
      setPausedId(Number.isFinite(dur) && dur > LARGO_DESDE_SEC ? (item?.id ?? null) : null);
    }
  }).current;

  /* ── ALTO REAL DE LA PÁGINA (medido, no supuesto) ───────────────────────────
     `pagingEnabled` pagina por el alto del VIEWPORT de la lista. Si la página mide otra
     cosa, cada página queda desalineada y **se ve un trozo de la de al lado** — que es
     exactamente lo que se reportó.

     Se usaba `useWindowDimensions().height`, y en Android esa altura NO es el hueco donde
     vive la lista: puede incluir barras del sistema. La única altura que vale es la que la
     propia lista reporta en `onLayout`, así que se mide y se usa ESA para las tres cosas
     que tienen que coincidir: el alto de cada página, el `getItemLayout` y el paginado. */
  const [pageH, setPageH] = useState(0);
  const altoPagina = pageH > 0 ? pageH : H;

  const getItemLayout = useCallback(
    (_: ArrayLike<LbPostBase> | null | undefined, index: number) => ({
      length: altoPagina, offset: altoPagina * index, index,
    }),
    [altoPagina],
  );

  /* ── Me gusta: optimista y con marcha atrás si el servidor falla ────────────
     El mismo contrato que usa el feed (`lifebookActionsApi.toggleLike(id, liked)`),
     para que el corazón no quede desincronizado entre las dos pantallas. */
  const toggleLike = useCallback((id: string, liked: boolean) => {
    setPosts((list) => list.map((p) => {
      if (p.id !== id) return p;
      const stats = p.stats ?? ({} as LbPostBase['stats']);
      return {
        ...p,
        stats: { ...stats, likedByMe: liked, likes: Math.max(0, (stats.likes ?? 0) + (liked ? 1 : -1)) },
      };
    }));
    lifebookActionsApi.toggleLike(id, liked).catch(() => {
      setPosts((list) => list.map((p) => {
        if (p.id !== id) return p;
        const stats = p.stats ?? ({} as LbPostBase['stats']);
        return {
          ...p,
          stats: { ...stats, likedByMe: !liked, likes: Math.max(0, (stats.likes ?? 0) + (liked ? -1 : 1)) },
        };
      }));
    });
  }, []);

  /* ── [P6] Guardar: mismo patrón optimista que el like ───────────────────────
     El endpoint ya existe (`toggleSave(postId, saved)` → `POST /posts/:id/save`).
     Se actualiza `savedByMe` y `savedCount` en el post crudo para que el icono y
     el contador no se desincronicen al deslizar y volver. */
  const toggleSave = useCallback((id: string, saved: boolean) => {
    setPosts((list) => list.map((p) => (p.id === id ? { ...p, savedByMe: saved } : p)));
    lifebookActionsApi.toggleSave(id, saved).catch(() => {
      setPosts((list) => list.map((p) => (p.id === id ? { ...p, savedByMe: !saved } : p)));
    });
  }, []);

  /* ── Comentarios EN SITIO (sin salir del feed) ──────────────────────────────
     Ver la nota de `comments` arriba. Lo importante de estas funciones: la hoja se abre YA
     —sin esperar a la red, que por VPN puede tardar— y solo después se corrige
     `allowComments` con lo que diga el detalle, que es donde vive ese dato. */
  const openComments = useCallback((p: LbPostBase) => {
    // `payload.allowComments` SÍ viaja en el feed. Comprobado contra el servidor: las claves
    // del payload de un vídeo son `coverUrl, videoUrl, durationSec, allowComments,
    // allowDownload`. Leyéndolo de ahí, en el caso normal NO hace falta ninguna petición y
    // la hoja abre con el dato bueno desde el primer render (nada de enseñar la caja de
    // escribir para luego quitarla).
    const pl = (p.payload ?? {}) as Record<string, unknown>;
    const conocido = typeof pl.allowComments === 'boolean' ? pl.allowComments : null;
    setComments({ id: p.id, allowComments: conocido ?? true });
    if (conocido !== null) return;
    // Respaldo para publicaciones antiguas sin el campo: se pregunta al detalle y se corrige
    // al llegar. La hoja ya está abierta, así que nadie espera por un booleano.
    lifebookApi.post(p.id).then((d) => {
      setComments((cur) => (cur && cur.id === p.id ? { id: p.id, allowComments: !!d.allowComments } : cur));
    }).catch(() => {
      /* Si el detalle falla, la lista de comentarios se carga dentro de la propia hoja. */
    });
  }, []);

  /** La hoja avisa del total REAL; el contador de la columna derecha se actualiza con él. */
  const onCommentsCount = useCallback((id: string, total: number) => {
    setPosts((list) => list.map((p) => (
      p.id === id ? { ...p, stats: { ...(p.stats ?? ({} as LbPostBase['stats'])), comments: total } } : p
    )));
  }, []);

  // El usuario actual, para que la hoja marque los comentarios míos como míos.
  useEffect(() => { authApi.me().then((m) => setMeId(m?.id ?? null)).catch(() => {}); }, []);

  /** Los vídeos a medias, para la fila «Seguir viendo». Si falla, no se enseña nada. */
  useEffect(() => {
    watchApi.seguirViendo(12).then((l) => setSeguir(Array.isArray(l) ? l : [])).catch(() => {});
  }, []);

  /**
   * Abre un vídeo de «seguir viendo». Si ya está en el feed se salta a él —y se
   * reanuda solo, porque el progreso se lee al cargar la fuente—; si no está en la
   * lista cargada, se abre el feed en ese vídeo con `startId`.
   */
  const abrirSeguir = useCallback((id: string) => {
    const i = posts.findIndex((p) => p.id === id);
    if (i >= 0) { listRef.current?.scrollToIndex({ index: i, animated: true }); return; }
    irSeguro.libre('/lifebook-videos', { startId: id });
  }, [posts, router]);

  const renderItem = useCallback(({ item, index }: { item: LbPostBase; index: number }) => (
    <VideoPage
      post={item}
      height={altoPagina}
      isActive={index === active && focused}
      muted={muted}
      insets={{ top: insets.top, bottom: insets.bottom }}
      onTogglePause={() => setPausedId((cur) => (cur === item.id ? null : item.id))}
      paused={pausedId === item.id}
      onLike={(liked) => toggleLike(item.id, liked)}
      onSave={(saved) => toggleSave(item.id, saved)}
      onSearchTopic={(topic) => router.push({
        pathname: '/lifebook-search', params: { q: topic },
      } as never)}
      onOpenComments={() => openComments(item)}
      onOpenDetail={() => irSeguro.libre('/lifebook-post/[id]', { id: item.id })}
      /* Cuando los comentarios de ESTE vídeo están abiertos, el vídeo se ENCOGE
         arriba en vez de quedarse debajo de la hoja. Es lo que hacen TikTok y
         Xiaohongshu: el contenido no se tapa, se redimensiona. */
      /* TANDA C: los productos que van DENTRO del vídeo (el sticker) se piden solo para el que
         se está viendo: pedirlos para todos sería una petición por vídeo de la lista. */
      productos={index === active ? (prodsVideo[item.id] ?? []) : []}
      onOpenProduct={(pid) => irSeguro.libre('/lifebook-product/[id]', { id: pid })}
      conComentarios={comments?.id === item.id}
    />
  ), [altoPagina, active, focused, muted, insets.top, insets.bottom, pausedId, toggleLike, toggleSave, router, openComments, comments, prodsVideo]);

  const keyExtractor = useCallback((p: LbPostBase) => p.id, []);

  return (
    <View style={[s.root, { backgroundColor: brand.visor }]}>
      {loading && posts.length === 0 ? (
        <View style={s.center}>
          <ActivityIndicator color={brand.white} />
        </View>
      ) : error && posts.length === 0 ? (
        /*
          La pantalla es NEGRA a propósito y el kit pinta con el tema: `sobreOscuro` evita texto
          oscuro sobre negro. De paso, el error se anuncia al lector de pantalla y vibra.
        */
        <View style={s.center}>
          <InlineError
            sobreOscuro
            mensaje={`No se pudieron cargar los vídeos. ${error}`}
            onReintentar={() => { didInitialScroll.current = true; void load('initial'); }}
          />
        </View>
      ) : posts.length === 0 ? (
        <View style={s.center}>
          <EmptyState
            sobreOscuro
            icono={<Text style={{ fontSize: tipografia.emoji }}>🎬</Text>}
            titulo="Todavía no hay vídeos aquí"
            texto="Cuando alguien publique un vídeo en este canal aparecerá en este feed."
          />
        </View>
      ) : (
        <FlatList
          ref={listRef}
          data={posts}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          pagingEnabled
          /* El alto del hueco REAL donde vive la lista. Es la medida que hace que
             `pagingEnabled` y el alto de página coincidan: sin ella, cada página queda
             desalineada y se ve un trozo de la de al lado (ver `altoPagina`). */
          style={{ flex: 1 }}
          onLayout={(e) => {
            const h = Math.round(e.nativeEvent.layout.height);
            // Mismo objeto si no cambia: `onLayout` puede dispararse varias veces y no
            // queremos un render por cada vez.
            setPageH((cur) => (cur === h ? cur : h));
          }}
          /* ── PASO DE UN VÍDEO AL SIGUIENTE ───────────────────────────────────
             Aquí se probaron `disableIntervalMomentum` y `decelerationRate="fast"`,
             razonando que un gesto rápido podía encadenar dos páginas. **Fue un error y
             el dueño lo detectó probándolo**: el feed pasó a «resistirse» (el gesto se
             frena en seco) y a dejar ver el vídeo de al lado, porque la lista se quedaba
             en una posición intermedia en vez de encajar en la página.
             `disableIntervalMomentum` hace exactamente eso: obliga a parar en el índice
             siguiente ignorando la velocidad del dedo. Quitado.
             Se deja `pagingEnabled` a secas, que es lo que ya funcionaba y lo que hace
             que cada página encaje limpiamente. */
          showsVerticalScrollIndicator={false}
          viewabilityConfig={viewability}
          onViewableItemsChanged={onViewable}
          initialNumToRender={1}
          maxToRenderPerBatch={1}
          // 3 pantallas montadas: la visible y la de arriba/abajo. Es lo que da la
          // precarga del siguiente sin tener decenas de reproductores vivos.
          windowSize={3}
          onEndReached={() => { if (cursor && !loadingMore) void load('more'); }}
          onEndReachedThreshold={0.5}
        />
      )}

      {/* Cabecera flotante: volver + sonido. Va encima del vídeo, no ocupa sitio. */}
      <View style={[s.topBar, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} hitSlop={12} style={s.iconBtn}
          accessibilityRole="button" accessibilityLabel="Volver">
          <ArrowLeft size={22} color={brand.white} />
        </Pressable>
        <Pressable onPress={() => setMuted((m) => !m)} hitSlop={12} style={s.iconBtn}
          accessibilityRole="button"
          accessibilityLabel={muted ? 'Activar el sonido' : 'Silenciar'}
          accessibilityState={{ checked: !muted }}>
          {muted ? <VolumeX size={20} color={brand.white} /> : <Volume2 size={20} color={brand.white} />}
        </Pressable>
      </View>

      {/* ── SEGUIR VIENDO ────────────────────────────────────────────────────────
          Va DEBAJO de la cabecera flotante (que es de una sola línea) para no tapar
          los botones de volver y sonido, y solo en el primer vídeo: al primer
          deslizamiento desaparece y el feed vuelve a ser inmersivo. */}
      {active === 0 && seguir.length > 0 ? (
        <SeguirViendo
          items={seguir}
          colors={colors}
          top={insets.top + 58}
          onOpen={abrirSeguir}
          onQuitar={(id) => {
            setSeguir((l) => l.filter((x) => x.id !== id));
            watchApi.borrar(id).catch(() => { /* si falla, vuelve en la próxima entrada */ });
          }}
        />
      ) : null}

      {loadingMore && (
        <View style={[s.moreBox, { paddingBottom: insets.bottom + 10 }]} pointerEvents="none">
          <ActivityIndicator color={brand.white} />
        </View>
      )}

      {/* ── COMENTARIOS ENCIMA DEL VÍDEO, SIN TAPARLO ────────────────────────────
          Es la MISMA `CommentsSheet` que usa el detalle, sin duplicar nada: ya es un
          `Modal` transparente con la hoja abajo, que es la forma que hace falta.
          Dos ajustes que sólo tienen sentido AQUÍ y por eso son props opcionales (el
          detalle sigue con sus valores de siempre):

          · `dimBackdrop={0}` — el velo oscuro que en el detalle ayuda a leer, aquí TAPA
            el vídeo. Debajo hay un vídeo reproduciéndose: en 小红书/TikTok se lee con el
            vídeo a plena luz. El velo sigue ocupando la pantalla (para cerrar tocando
            fuera) pero es invisible.
          · `maxHeightPct={55}` — con el 80 % de antes, unos cuantos comentarios tapaban
            el vídeo ENTERO y el usuario dejaba de ver un vídeo para ver una lista. Con
            55 % el vídeo conserva casi la mitad de la pantalla siempre.

          El vídeo sigue reproduciéndose porque NO se navega: se queda el foco, así que el
          `useFocusEffect` de arriba no lo pausa. Para que se VEA detrás del `Modal`, el
          `VideoView` tiene que ser `textureView` (ver el comentario allí). */}
      <CommentsSheet
        visible={!!comments}
        onClose={() => setComments(null)}
        postId={comments?.id ?? ''}
        tint={colors.primary}
        allowComments={comments?.allowComments ?? true}
        meId={meId}
        title="Comentarios"
        placeholder="Añade un comentario..."
        dimBackdrop={0}
        maxHeightPct={55}
        onCountChange={(total) => { if (comments) onCommentsCount(comments.id, total); }}
      />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Una página = un vídeo
// ─────────────────────────────────────────────────────────────────────────────

function VideoPage({ post, height, isActive, muted, paused, onTogglePause, onLike, onSave, onSearchTopic, onOpenComments, onOpenDetail, onOpenProduct, productos = [], insets, conComentarios = false }: {
  post: LbPostBase; height: number; isActive: boolean; muted: boolean; paused: boolean;
  /** Si los comentarios de ESTE vídeo están abiertos: el vídeo se encoge arriba. */
  conComentarios?: boolean;
  onTogglePause: () => void; onLike: (liked: boolean) => void; onSave: (saved: boolean) => void;
  onSearchTopic: (topic: string) => void;
  onOpenComments: () => void;
  onOpenDetail: () => void;
  /** TANDA C: abrir el producto del sticker (lleva a su ficha, donde se compra). */
  onOpenProduct: (productId: string) => void;
  /** TANDA C: productos enganchados a este vídeo (se pintan como sticker). */
  productos?: LbProductoEnNota[];
  insets: { top: number; bottom: number };
}) {
  const { colors } = useTheme();
  const src = useMemo(() => videoUrlOf(post), [post]);
  const cover = useMemo(() => coverOf(post), [post]);
  const topics = useMemo(() => topicsOf(post), [post]);
  /* TANDA C: si el sticker del producto está desplegado (cerrado solo enseña el precio). */
  const [stickerAbierto, setStickerAbierto] = useState(false);

  /** Duración declarada al publicar (la que verificó el servidor con ffprobe). */
  const dur = Number((post.payload as Record<string, unknown>)?.durationSec);
  const durOk = Number.isFinite(dur) && dur > 0;
  const esLargo = durOk && dur > LARGO_DESDE_SEC;

  const [liked, setLiked] = useState(!!post.stats?.likedByMe);
  const [likes, setLikes] = useState(post.stats?.likes ?? 0);
  const [saved, setSaved] = useState(!!post.savedByMe);
  const [heartPop, setHeartPop] = useState(false);
  /**
   * [P4] La portada solo tapa HASTA que hay fotograma real. Antes se ataba al estado
   * de pausa y al pausar volvía a aparecer encima del vídeo — el bug grave que
   * reportó el dueño. `onFirstFrameRender` de `VideoView` es justo el evento para
   * esto (lo dice su propia doc: "hide any cover images that conceal the initial
   * loading of the player").
   */
  const [firstFrame, setFirstFrame] = useState(false);
  const popTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // El estado real puede llegar después (recarga silenciosa del feed).
  useEffect(() => { setLiked(!!post.stats?.likedByMe); }, [post.stats?.likedByMe]);
  useEffect(() => { setLikes(post.stats?.likes ?? 0); }, [post.stats?.likes]);
  useEffect(() => { setSaved(!!post.savedByMe); }, [post.savedByMe]);
  // Cambiar de fuente vuelve a necesitar portada: sin esto, al reciclar la celda
  // (FlatList reutiliza componentes) se vería el vídeo anterior un instante.
  useEffect(() => { setFirstFrame(false); }, [src]);
  useEffect(() => () => { if (popTimer.current) clearTimeout(popTimer.current); }, []);

  const player = useVideoPlayer(src || null, (p) => {
    // En bucle, como en todo feed inmersivo: al terminar, vuelve a empezar en vez de
    // quedarse en un fotograma negro. (`/lifebook-player` usa loop=false, que allí
    // sí tiene sentido: es reproducción de detalle.)
    // Los LARGOS no: repetir 50 minutos no es un feed, es un error.
    p.loop = !esLargo;
    p.muted = muted;
    // 0.25 s en vez de los 0.5 por defecto: la línea de tiempo se mueve fluida sin
    // disparar un render cada 50 ms.
    p.timeUpdateEventInterval = 0.25;
  });

  /* ── LÍNEA DE TIEMPO (lo que se perdió al quitar el reproductor a pantalla completa) ──
     El reproductor externo tenía barra de progreso y tiempos; al retirarlo, **el vídeo se
     quedó sin ninguna referencia de por dónde va**. En un clip de 12 s da igual, pero en un
     vídeo de 50 minutos no saber si vas por el minuto 3 o por el 40 es lo que hace que la
     gente no vea vídeos largos.

     Se recupera DENTRO del único estado de vídeo que hay, con la forma que usan 小红书 y
     TikTok en el feed: una línea fina pegada al borde inferior, que se rellena. */
  /* Se llaman `tl*` (timeline) y NO `cur`/`dur` a propósito: en esta función `dur` ya
     existe y es la duración DECLARADA en el post (`payload.durationSec`, la que decide si
     el vídeo es corto o largo). La de aquí es la que mide el reproductor al cargar. */
  const [tlCur, setTlCur] = useState(0);
  const [tlDur, setTlDur] = useState(0);
  /** Mientras se mantiene pulsado: la barra se ve y se arrastra. */
  const [scrubbing, setScrubbing] = useState(false);
  /** Posición que marca el dedo mientras se arrastra (null = manda la reproducción). */
  const [tlSeek, setTlSeek] = useState<number | null>(null);
  /** Espejo en ref para que `scrubEnd` sea idempotente: `onEnd` y `onFinalize` pueden
   *  llegar los dos, y reanudar dos veces (o reanudar sin haber arrastrado) se nota. */
  const scrubbingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);

  /* ── SEGUIR VIENDO (progreso de reproducción) ────────────────────────────────
     El tiempo y la duración se copian también a REFS: al desmontar la pantalla hay
     que guardar lo último que se vio, y justo entonces el estado del componente ya no
     es de fiar. Y reanudar es UNA vez por vídeo: si no, cada repintado pelearía con
     quien está mirando. */
  const tiempoRef = useRef(0);
  const durRef = useRef(0);
  const reanudadoRef = useRef(false);

  useEffect(() => {
    if (!src) return;
    const subs = [
      player.addListener('timeUpdate', (e) => {
        tiempoRef.current = e.currentTime;      // para poder guardarlo al desmontar
        if (mountedRef.current) setTlCur(e.currentTime);
      }),
      player.addListener('sourceLoad', (e) => {
        const dur = Number.isFinite(e.duration) ? e.duration : 0;
        durRef.current = dur;
        if (mountedRef.current) setTlDur(dur);
      }),
    ];
    return () => { subs.forEach((s) => s.remove()); };
  }, [player, src]);

  /* Autoplay SOLO del visible, y pausa del resto. Es el corazón de B1: sin esto,
     todos los vídeos montados reproducirían a la vez (audio solapado y datos).

     OJO con `esLargo`: aquí NO se usa. Antes la condición era `isActive && !paused &&
     !esLargo`, y eso tenía un fallo que apareció al quitar el reproductor externo: un vídeo
     LARGO no se autoreproducía (bien) pero el toque TAMPOCO podía arrancarlo nunca (mal),
     porque el toque sólo quitaba la pausa y el candado del largo seguía puesto. Ahora la
     pausa inicial de un largo es un ESTADO (`pausedId`, ver `onViewable`) y el toque la
     quita: el largo sigue sin autoreproducirse, pero se reproduce cuando el usuario lo pide. */
  useEffect(() => {
    if (!src) return;
    if (isActive && !paused) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, paused, player, src]);

  // El silencio es global (un botón en la cabecera), así que se sincroniza aquí.
  useEffect(() => { player.muted = muted; }, [muted, player]);

  /* El BUCLE también se sincroniza aquí, y no sólo al crear el reproductor.
     Estaba puesto únicamente dentro del `setup` de `useVideoPlayer`, y medido en el aparato
     eso NO basta: se entraba al feed, el clip se reproducía y **al llegar al final se
     quedaba clavado en el último fotograma** en vez de repetir — que es justo lo que un feed
     inmersivo no puede hacer (el vídeo siguiente no llega solo, y la pantalla se ve muerta).
     Dejarlo como efecto, igual que el silencio, hace que el valor se aplique cuando el
     reproductor ya está listo y no sólo en su construcción. */
  useEffect(() => { player.loop = !esLargo; }, [player, esLargo]);

  /* ── SEGUIR VIENDO: reanudar y guardar ──────────────────────────────────────
     Hasta esta ronda no había NINGUNA forma de reanudar un vídeo (no existía ni el
     dato: se buscó `progress|position|resume` en la app y lo único que salía era el
     progreso de SUBIDA). Esto es lo que hace que «seguir viendo» sea de verdad. */

  /**
   * REANUDAR: al pasar a ser el vídeo activo y con la fuente YA cargada —antes de eso
   * el reproductor no admite saltar y `currentTime` se ignora—, se salta a donde lo
   * dejó. Solo si de verdad iba por la mitad: ni recién empezado (5 s) ni casi
   * acabado (90 %), el mismo criterio que usa el servidor para la lista.
   */
  useEffect(() => {
    if (!isActive || !src || reanudadoRef.current || tlDur <= 0) return;
    reanudadoRef.current = true;
    watchApi.leer(post.id).then((p) => {
      const pos = Number(p?.positionSec ?? 0);
      const total = Number(p?.durationSec ?? 0) || tlDur;
      if (!mountedRef.current) return;
      if (pos >= 5 && (!total || pos < total * 0.9)) {
        tiempoRef.current = pos;
        player.currentTime = pos;
      }
    }).catch(() => { /* sin progreso, se empieza del principio */ });
  }, [isActive, src, tlDur, post.id, player]);

  /** Guarda dónde va. Lee de los refs porque también se llama al desmontar. */
  const guardarAhora = useCallback(() => {
    const t = Math.floor(tiempoRef.current);
    if (!post?.id || t < 1) return;
    watchApi.guardar(post.id, t, Math.floor(durRef.current)).catch(() => { /* no se le cuenta al usuario */ });
  }, [post?.id]);

  /* Tres momentos y ni uno más, para no machacar el servidor: cada 15 s mientras se
     reproduce, al dejar de ser el vídeo activo, y al salir de la pantalla. */
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => { if (!paused) guardarAhora(); }, 15000);
    return () => clearInterval(id);
  }, [isActive, paused, guardarAhora]);

  useEffect(() => { if (!isActive) guardarAhora(); }, [isActive, guardarAhora]);
  useEffect(() => () => { guardarAhora(); }, [guardarAhora]);

  /* ── ¿LLENAR O ENCAJAR? — fuera la franja negra ──────────────────────────────
     El móvil es 1080x2374 = 2,20:1, bastante más alto que un vídeo 9:16 (1,78:1). Con
     `contain` un 9:16 deja DOS FRANJAS NEGRAS de ~227 px (el 19 % de la pantalla), y es
     exactamente lo que se reportó como «una franja negra que dificulta la vista».

     Lo que hacen las plataformas de vídeo vertical: LLENAR cuando el contenido es
     vertical —que es el caso normal, y el recorte que cuesta es pequeño— y, para lo que
     no encaja (un vídeo horizontal en una pantalla altísima), enseñarlo ENTERO sobre un
     FONDO DESENFOCADO del propio vídeo en vez de sobre negro.

     Se decide con el tamaño REAL del vídeo, que `expo-video` publica en
     `player.videoTrack.size` (no hay que pedírselo a nadie ni adivinarlo). Se mide lo que
     costaría llenar: si recortar se lleva más del 25 % del vídeo, se encaja.
       · 9:16 en esta pantalla → cuesta 19 % → se LLENA (es lo que hace TikTok)
       · 16:9 en esta pantalla → costaría 74 % → se ENCAJA sobre fondo desenfocado */
  const { width: vpW, height: vpH } = useWindowDimensions();
  const [tamVideo, setTamVideo] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    if (!src) { setTamVideo(null); return; }
    const leer = () => {
      const s = player.videoTrack?.size;
      if (!s || s.width <= 0 || s.height <= 0) return;
      /* Devolver EL MISMO objeto cuando el tamaño no cambia es lo que evita un render por
         cada evento. `statusChange` se dispara muchas veces (carga, buffer, listo…), y
         crear un `{...}` nuevo cada vez hacía re-renderizar la página constantemente: eso
         se nota como tirones al pasar de un vídeo a otro. React se salta el render si el
         estado es idéntico por referencia. */
      setTamVideo((cur) => (cur && cur.w === s.width && cur.h === s.height ? cur : { w: s.width, h: s.height }));
    };
    leer();
    // Se lee en los dos eventos porque el track puede no estar listo todavía en
    // `sourceLoad` según el contenedor; `statusChange` cubre el caso de que llegue tarde.
    const subs = [
      player.addListener('sourceLoad', leer),
      player.addListener('statusChange', leer),
    ];
    return () => { subs.forEach((s) => s.remove()); };
  }, [player, src]);

  /** Fracción del vídeo que se perdería al llenar la pantalla (0…1), o null si aún no se sabe. */
  const recorteAlLlenar = useMemo(() => {
    if (!tamVideo || vpW <= 0 || vpH <= 0) return null;
    const escala = Math.max(vpW / tamVideo.w, vpH / tamVideo.h);
    const rw = tamVideo.w * escala;
    const rh = tamVideo.h * escala;
    return 1 - Math.min(vpW / rw, vpH / rh);
  }, [tamVideo, vpW, vpH]);

  // Sin tamaño todavía se LLENA: es preferible un recorte momentáneo a una franja negra
  // en cuanto entra el vídeo.
  const llenar = recorteAlLlenar == null || recorteAlLlenar <= RECORTE_MAX;

  /* ── [P5] QUITADO: aquí vivía el zoom con los dedos (pinza + arrastre) ────────
     Se fue entero en la segunda ronda con el aparato: el dueño pidió que el vídeo NO
     se pueda ampliar con los dedos. Se eliminan los seis shared values, el estado
     `zoomed`, los dos reconocedores (`Gesture.Pinch` y `Gesture.Pan`) y el
     `useAnimatedStyle` que los aplicaba.

     Efecto secundario bueno: al no haber `transform` sobre el vídeo, desaparece
     `surfaceType="textureView"`, que existía SOLO para que la pinza se viera. El
     `surfaceView` por defecto gasta menos batería.

     Quedan los TAPES, que no se tocan: doble = me gusta, simple = pausa/reanudar. */

  const applyLike = (next: boolean) => {
    setLiked(next);
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)));
    onLike(next);
  };

  /** Doble toque = me gusta + corazón grande. Mismo patrón y mismos tiempos que
   *  `PostCard.tsx` (260 ms de ventana, 650 ms de corazón), para que el gesto se
   *  sienta igual en el masonry y aquí. No vibra: `expo-haptics` no está instalado. */
  const doubleTapLike = () => {
    if (!liked) applyLike(true);
    setHeartPop(true);
    if (popTimer.current) clearTimeout(popTimer.current);
    popTimer.current = setTimeout(() => setHeartPop(false), 650);
  };
  // Un toque: pausa/reanuda, SIEMPRE. Antes un vídeo LARGO abría el reproductor a pantalla
  // completa; ahora que ese reproductor ya no existe, el toque arranca el vídeo AQUÍ. El
  // largo sigue SIN autoreproducirse (para no descargar cientos de MB sin permiso), así que
  // el toque es exactamente el permiso que faltaba.
  const singleTap = () => onTogglePause();

  /* ── Mantener pulsado: barrita visible + arrastrar para avanzar ──────────────
     El gesto lo lanza `scrub` (ver `composed`), que sólo se activa con el dedo quieto
     280 ms. Estas tres funciones son el lado JS. */
  const scrubStart = () => {
    scrubbingRef.current = true;
    setScrubbing(true);
    setTlSeek(tlCur);
    // Se pausa para que lo que se ve sea el fotograma del punto al que apuntas, y para que
    // el vídeo no siga avanzando mientras el dedo decide. Al soltar se reanuda si tocaba.
    player.pause();
  };
  const scrubMove = (x: number) => {
    if (tlDur <= 0 || vpW <= 0) return;
    const ratio = Math.max(0, Math.min(1, x / vpW));
    const t = ratio * tlDur;
    // `expo-video` 2.2.3 no tiene `seekTo()`: se salta escribiendo `currentTime`.
    player.currentTime = t;
    setTlSeek(t);
  };
  const scrubEnd = () => {
    // Idempotente: `onEnd` y `onFinalize` pueden llegar los dos.
    if (!scrubbingRef.current) return;
    scrubbingRef.current = false;
    setScrubbing(false);
    setTlSeek(null);
    // Se reanuda sólo si este vídeo es el visible y no estaba pausado a propósito.
    if (isActive && !paused) player.play();
  };

  /* [P6] Compartir. `Share` es de React Native (ya se usa en `lifebook-post/[id].tsx`
     y en alquiler/trabajo), así que no hace falta dependencia nueva. En Android solo
     se admite `message`+`title` (la `url` es de iOS), de ahí el enlace dentro del
     texto — es lo mismo que hace el detalle de la publicación. */
  const share = () => {
    const t = post.title?.trim() || post.body?.trim() || 'Vídeo';
    Share.share({ message: `${t} — Life Book · EG Route Plan` }).catch(() => {});
  };

  const taps = Gesture.Exclusive(
    Gesture.Tap().numberOfTaps(2).maxDuration(260).onEnd(() => { runOnJS(doubleTapLike)(); }),
    Gesture.Tap().numberOfTaps(1).onEnd(() => { runOnJS(singleTap)(); }),
  );

  /* ── BARRITA DE TIEMPO AL MANTENER PULSADO (como TikTok/Douyin) ───────────────
     `activateAfterLongPress(280)` es la pieza que lo hace posible sin arriesgar el pase de
     vídeo: el gesto **no puede activarse hasta que el dedo lleva 280 ms quieto**. Un toque
     rápido no lo activa, y un deslizamiento normal tampoco —el dedo se mueve antes de los
     280 ms y el requisito deja de cumplirse—, así que la lista se queda con su gesto de
     siempre.

     Y va en `Gesture.Race` con los toques: gana el primero que se active y el otro se
     cancela. Con un toque rápido gana el toque (no hay pausa doble al soltar); con un
     mantenido gana el arrastre, y al soltar NO se dispara además un toque que pausara el
     vídeo. `Exclusive` no valdría: ahí el primero de la lista tiene prioridad y los toques
     esperarían a que el mantenido falle, o sea que pausar tardaría 280 ms en responder. */
  const scrub = Gesture.Pan()
    .activateAfterLongPress(280)
    .onStart(() => { runOnJS(scrubStart)(); })
    .onUpdate((e) => { runOnJS(scrubMove)(e.x); })
    .onEnd(() => { runOnJS(scrubEnd)(); })
    // `onFinalize` cubre también la cancelación (el sistema se queda el gesto, una llamada
    // entrante…): sin él, la barra se quedaría pegada en pantalla.
    .onFinalize(() => { runOnJS(scrubEnd)(); });

  const composed = Gesture.Race(scrub, taps);

  const authorName = post.author?.fullName?.trim() || post.author?.name?.trim() || 'Usuario';
  const title = post.title?.trim() || post.body?.trim() || '';

  /** 0…100 para la barra. Mientras se arrastra manda el dedo, no la reproducción. */
  const tlPct = tlDur > 0 ? Math.min(100, ((tlSeek ?? tlCur) / tlDur) * 100) : 0;

  /**
   * [P8] Términos de la fila «Búsquedas relacionadas», como la barra de 小红书.
   *
   * El fallo que apareció EN EL APARATO: casi ningún vídeo publicado hasta hoy lleva
   * temas (`topics`/`tags` vienen vacíos), así que la fila **no se pintaba nunca** y
   * desde fuera parecía que la función no existía. Eso no es un detalle de estilo: una
   * función que no se ve es una función que no está.
   *
   * Ahora, si no hay temas, se cae a lo que el post SÍ trae — ciudad, autor y las
   * primeras palabras del título — de forma que la fila sale siempre. El título es
   * obligatorio al publicar vídeo, así que el último recurso nunca falta.
   */
  const relTerms = useMemo(() => {
    const out: string[] = [];
    const push = (raw: unknown) => {
      const v = String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, 24);
      if (v && !out.includes(v) && out.length < 6) out.push(v);
    };
    for (const t of topics) push(t);
    if (out.length === 0) {
      push(post.city);
      push(post.author?.fullName ?? post.author?.name);
      push(title.split(/\s+/).slice(0, 3).join(' '));
    }
    return out;
  }, [topics, post.city, post.author?.fullName, post.author?.name, title]);

  return (
    <View style={{ height, width: '100%', backgroundColor: brand.visor }}>
      <GestureDetector gesture={composed}>
        <View style={conComentarios
          ? {
              // CON LOS COMENTARIOS ABIERTOS el vídeo NO se queda debajo de la hoja: se
              // encoge y se va arriba. El 42 % es lo que deja libre la hoja del feed
              // (`maxHeightPct={55}`) con un poco de aire, y así el vídeo se sigue viendo
              // ENTERO mientras se leen los comentarios. Es lo que hacen TikTok y
              // Xiaohongshu (ver docs/COMENTARIOS-QUE-NO-TAPEN-EL-CONTENIDO.md): el
              // contenido se redimensiona, no se tapa.
              //
              // El alto de la PÁGINA no cambia a propósito: si cambiara, el feed (que está
              // paginado por alto de página) saltaría de vídeo al abrir los comentarios.
              position: 'absolute', left: 0, right: 0, top: 0,
              height: Math.round(height * 0.42),
              overflow: 'hidden',
            }
          : StyleSheet.absoluteFill}>
          {src ? (
            <>
              {/* FONDO, solo cuando el vídeo NO llena la pantalla. Es el propio póster
                  desenfocado y ampliado, así que las bandas dejan de ser NEGRAS y pasan a
                  ser una continuación difusa del vídeo. Es lo que hacen YouTube y Reels
                  con el contenido que no es vertical: nunca una franja negra.
                  No se pinta cuando sí se llena: ahí no hay banda que tapar y ahorramos
                  una capa de imagen por página. */}
              {(!llenar || conComentarios) && cover ? (
                <Image
                  source={cover}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                  blurRadius={28}
                  cachePolicy="memory-disk"
                />
              ) : null}

              <VideoView
                player={player}
                style={StyleSheet.absoluteFill}
                // LLENAR o ENCAJAR, decidido con el tamaño real del vídeo: ver el
                // comentario largo de `recorteAlLlenar`. En corto: si parece a la pantalla
                // se llena (fuera franja negra); si no, se enseña entero sobre el fondo
                // desenfocado de arriba.
                // Encogido SIEMPRE `contain`: en una caja más pequeña, recortar (cover)
                // cortaría media imagen. Así se ve el fotograma entero, con el fondo
                // desenfocado alrededor.
                contentFit={conComentarios ? 'contain' : (llenar ? 'cover' : 'contain')}
                // `textureView` por un motivo de verdad: la hoja de comentarios es un
                // `Modal` (otra ventana) y el `surfaceView` por defecto no compone con nada
                // que lo tape — el vídeo se vería como un agujero NEGRO detrás de los
                // comentarios. La doc de expo-video lo dice con estas palabras:
                // `textureView` es para «overlapping video views». Cuesta más batería, y es
                // el precio de poder leer los comentarios con el vídeo corriendo debajo.
                surfaceType="textureView"
                // Sin controles nativos: tap = pausa/reanudar. No hay más estado de vídeo
                // que este (el reproductor a pantalla completa se retiró).
                nativeControls={false}
                allowsFullscreen={false}
                // [P4] Es lo que arregla el bug de la portada al pausar.
                onFirstFrameRender={() => setFirstFrame(true)}
              />
            </>
          ) : cover ? (
            <Image source={cover} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
          ) : null}

          {/* [P4] Portada encima SOLO hasta que hay fotograma real. Ya no depende de
              `paused`, que era lo que la hacía reaparecer al pausar. */}
          {src && cover && !firstFrame ? (
            <Image
              source={cover}
              style={StyleSheet.absoluteFill}
              contentFit={conComentarios ? 'contain' : 'cover'}
              cachePolicy="memory-disk"
              transition={200}
              pointerEvents="none"
            />
          ) : null}

          {/* Pausa: indicador central, como en TikTok. Es el ÚNICO botón en el centro
              del vídeo ([P1]: fuera los ±5 s y ±15 s, que vivían en el reproductor). */}
          {paused && isActive && !esLargo ? (
            <View style={s.pauseDot} pointerEvents="none">
              <Text style={{ fontSize: tipografia.display, color: brand.white }}>▶</Text>
            </View>
          ) : null}

          {/* VÍDEO LARGO: no se reproduce solo, para no descargar cientos de MB sin
              permiso. Se ve su portada con la duración y un ▶, y el toque lo reproduce
              AQUÍ MISMO (el reproductor externo ya no existe). */}
          {esLargo ? (
            <View style={s.largoBox} pointerEvents="none">
              <View style={s.largoPlay}>
                <Text style={{ fontSize: tipografia.hero, color: brand.white, marginLeft: espaciado.e4 }}>▶</Text>
              </View>
              <Text style={s.largoTxt}>
                Vídeo de {fmtDur(dur)}{'\n'}
                <Text style={s.largoSub}>Toca para reproducirlo</Text>
              </Text>
            </View>
          ) : null}

          {/* Corazón del doble toque */}
          {heartPop ? (
            <View style={s.heartPop} pointerEvents="none">
              <Heart size={92} color={LIKE_RED} fill={LIKE_RED} />
            </View>
          ) : null}
        </View>
      </GestureDetector>

      {/* ── BARRITA DE TIEMPO: aparece al MANTENER PULSADO, como TikTok/Douyin ──────
          Al retirar el reproductor a pantalla completa, el vídeo se quedó sin ninguna
          referencia de por dónde va, y en un vídeo de 50 minutos eso es lo que hace que la
          gente no los vea. Investido cómo lo hacen ellas (ver
          `docs/LINEA-DE-TIEMPO-INVESTIGACION.md`): **TikTok, Douyin y Xiaohongshu NO llevan
          barra permanente en el feed** — en TikTok/Douyin aparece al mantener pulsado y ahí
          se arrastra para avanzar; en Xiaohongshu mantener pulsado abre la velocidad. La
          permanente es YouTube Shorts, y no es lo que se pidió.

          Así que: el feed se queda limpio, y la barra sale al mantener pulsado, con el
          tiempo a la vista para saber a dónde vas. Al soltar se oculta y el vídeo sigue.

          Detalles que no son decoración:
          · Se pinta SÓLO en la página visible (`isActive`): si se pintara en todas, se
            asomaría también en el trozo de la de al lado.
          · No es interactiva por sí misma; el dedo lo lee el gesto `scrub`, que es quien
            hace el trabajo. Un elemento táctil pegado al borde inferior es justo lo que hay
            que evitar: ahí abajo el sistema se queda los deslizamientos. */}
      {isActive && scrubbing && tlDur > 0 ? (
        <>
          <View style={s.tlTime} pointerEvents="none">
            <Text style={s.tlTimeTxt}>{fmtDur(tlSeek ?? tlCur)} / {fmtDur(tlDur)}</Text>
          </View>
          <View style={s.tlLine} pointerEvents="none">
            <View style={[s.tlFill, { width: `${tlPct}%` }]} />
          </View>
        </>
      ) : null}

      {/* Degradado inferior para que el texto se lea sobre el vídeo. Se genera por franjas
          (ver `BottomScrim`): antes era un rectángulo PLANO con un borde recto que se veía
          como una capa negra pegada encima del vídeo. */}
      <BottomScrim height={250 + insets.bottom} max={0.62} />

      {/* Columna de acciones (derecha), como en 小红书/TikTok.
          [P6] ahora con compartir y guardar además de like y comentarios. */}
      <View style={[s.actions, { bottom: insets.bottom + 96 }]} pointerEvents="box-none">
        <Pressable onPress={() => applyLike(!liked)} hitSlop={10} style={s.actBtn}
          accessibilityRole="button"
          accessibilityLabel={`Me gusta${likes ? `, ${likes}` : ''}`}
          accessibilityState={{ selected: liked }}>
          <Heart size={27} color={liked ? LIKE_RED : brand.white} fill={liked ? LIKE_RED : 'none'} />
          <Text style={s.actN}>{fmtCount(likes)}</Text>
        </Pressable>

        {/* Comentarios: abre la hoja ENCIMA del vídeo, sin salir del feed.
            Antes hacía `onOpenDetail` (navegaba a `/lifebook-post/[id]`), y al perder el
            foco esta pantalla PAUSABA todos los vídeos: leer los comentarios paraba el
            vídeo y te sacaba del inmersivo. Ahora el vídeo sigue sonando debajo. */}
        <Pressable onPress={onOpenComments} hitSlop={10} style={s.actBtn}
          accessibilityRole="button"
          accessibilityLabel={`Comentarios${post.stats?.comments ? `, ${post.stats.comments}` : ''}`}>
          <MessageCircle size={26} color={brand.white} />
          <Text style={s.actN}>{fmtCount(post.stats?.comments ?? 0)}</Text>
        </Pressable>

        {/* [P6] Guardar: el endpoint ya existe (`toggleSave`). Rellenado cuando está
            guardado, igual que el corazón. */}
        <Pressable onPress={() => { const next = !saved; setSaved(next); onSave(next); }}
          hitSlop={10} style={s.actBtn}
          accessibilityRole="button"
          accessibilityLabel={saved ? 'Quitar de guardados' : 'Guardar'}
          accessibilityState={{ selected: saved }}>
          <Bookmark size={25} color={brand.white} fill={saved ? brand.white : 'none'} />
        </Pressable>

        {/* [P6] Compartir. Sin contador: el servidor no da "veces compartido". */}
        <Pressable onPress={share} hitSlop={10} style={s.actBtn}
          accessibilityRole="button" accessibilityLabel="Compartir">
          <Share2 size={25} color={brand.white} />
        </Pressable>

        {/* ❌ AQUÍ ESTABA «Ver a pantalla completa» (icono `Maximize` → `/lifebook-player`).
            Se quitó junto con el reproductor: **sólo hay UN estado de ver vídeo, éste.**
            Dos pantallas para lo mismo obligaban a mantener dos juegos de controles, dos
            listas de gestos y dos sitios donde arreglar cada fallo, y el dueño lo pidió
            explícitamente («sólo debe existir un estado de ver vídeos, el inmersivo»).
            Si algún día hace falta verlo más grande, es ESTA pantalla la que crece. */}
      </View>

      {/* Texto inferior: autor, título, duración y [P8] la fila de «Búsquedas relacionadas». */}
      <View style={[s.info, { paddingBottom: insets.bottom + 14 }]} pointerEvents="box-none">
        {/* TANDA C — EL STICKER DEL PRODUCTO, encima del vídeo y abajo a la izquierda, como en
            Xiaohongshu. Cerrado enseña la miniatura y el precio; al tocarlo se abre y aparece
            el nombre y el botón de compra. Es un atajo dentro del vídeo, no un anuncio que tape
            la imagen: solo sale si el vídeo TIENE productos.

            ⚠️ VA EN EL FLUJO, **ENCIMA DEL NOMBRE DE LA TIENDA**, NO FLOTANDO.
            Antes estaba en `position: absolute` con `bottom: insets.bottom + 130` dentro de este
            mismo bloque. Pero este bloque se ancla abajo y CRECE hacia arriba según lo que lleve
            (título de una o dos líneas + chips de «Búsquedas relacionadas»…) y se mide en píxeles,
            no en «huecos»: con un vídeo con título y tres chips, esos 130 dp caían justo **encima
            del nombre del autor** y lo tapaban (lo vio el dueño: «tapa el nombre de la tienda»).
            Medido en el Poco F5: el sticker y el nombre acababan los dos en y≈1944.

            En el flujo no puede pasar: el bloque está anclado abajo, así que este sticker se pinta
            siempre por encima del nombre, y al abrirse crece hacia arriba sin mover el texto. */}
        {productos.length > 0 ? (
          <View style={{ alignSelf: 'flex-start', marginBottom: espaciado.e10, maxWidth: '100%', zIndex: 6 }}>
            {stickerAbierto ? (
              <View style={{ backgroundColor: 'rgba(0,0,0,0.72)', borderRadius: radios.campo, padding: espaciado.e10, width: 216 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}>
                  {productos[0].coverUrl ? (
                    <Image source={{ uri: productos[0].coverUrl }} style={{ width: 42, height: 42, borderRadius: radios.hermano }} />
                  ) : (
                    <View style={{ width: 42, height: 42, borderRadius: radios.hermano, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' }}>
                      <ShoppingBag size={18} color={brand.white} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={2} style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: peso.maximo }}>{productos[0].title}</Text>
                    <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: peso.titulo, marginTop: espaciado.e2 }}>
                      {productos[0].priceXaf === null ? 'A consultar' : lbXaf(productos[0].priceXaf)}
                    </Text>
                  </View>
                </View>
                {productos.length > 1 ? (
                  <Text style={{ color: 'rgba(255,255,255,0.75)', fontSize: tipografia.micro, marginTop: espaciado.e6 }}>
                    y {productos.length - 1} producto{productos.length - 1 === 1 ? '' : 's'} más en esta publicación
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e8 }}>
                  <Pressable
                    onPress={() => onOpenProduct(productos[0].id)}
                    accessibilityLabel={`Comprar ${productos[0].title}`}
                    style={{ flex: 1, backgroundColor: brand.like, borderRadius: radios.full, paddingVertical: espaciado.e7, alignItems: 'center' }}
                  >
                    <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: peso.titulo }}>Comprar</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setStickerAbierto(false)}
                    accessibilityLabel="Cerrar el producto"
                    style={{ paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7 }}
                  >
                    <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: peso.maximo }}>Cerrar</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setStickerAbierto(true)}
                accessibilityLabel={`Producto del vídeo: ${productos[0].title}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e7, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: radios.full, paddingLeft: espaciado.e4, paddingRight: espaciado.e12, paddingVertical: espaciado.e4 }}
              >
                {productos[0].coverUrl ? (
                  <Image source={{ uri: productos[0].coverUrl }} style={{ width: 28, height: 28, borderRadius: radios.full }} />
                ) : (
                  <View style={{ width: 28, height: 28, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.15)' }}>
                    <ShoppingBag size={14} color={brand.white} />
                  </View>
                )}
                <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: peso.titulo }}>
                  {productos[0].priceXaf === null ? 'Ver producto' : lbXaf(productos[0].priceXaf)}
                </Text>
                {productos.length > 1 ? (
                  <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: tipografia.micro, fontWeight: peso.maximo }}>+{productos.length - 1}</Text>
                ) : null}
              </Pressable>
            )}
          </View>
        ) : null}

        {/* El nombre del autor (la tienda, si vende) y la duración. Va DESPUÉS del sticker: este
            bloque se ancla abajo, así que el orden del JSX es el orden de abajo hacia arriba. */}
        <View style={s.authorRow}>
          {post.author?.avatarUrl ? (
            <Image source={absUrl(post.author.avatarUrl)} style={s.avatar} contentFit="cover" cachePolicy="memory-disk" />
          ) : (
            <View style={[s.avatar, { backgroundColor: alpha(colors.primary, 0.5) }]}>
              <Text style={{ fontSize: tipografia.micro, fontWeight: peso.maximo, color: brand.white }}>
                {authorName.trim().charAt(0).toUpperCase() || '?'}
              </Text>
            </View>
          )}
          <Text numberOfLines={1} style={s.author}>{authorName}</Text>
          {durOk ? (
            <View style={s.durChip}><Text style={s.durText}>{fmtDur(dur)}</Text></View>
          ) : null}
        </View>

        {/* El título abre el detalle completo. Era la entrada que tenía el botón de
            comentarios; ahora que ese abre la hoja en sitio, el detalle se alcanza por aquí
            y no se pierde ninguna entrada: sigue estando a un toque. */}
        {title ? (
          <Pressable onPress={onOpenDetail} hitSlop={6} accessibilityRole="button"
            accessibilityLabel={`Abrir publicación: ${title}`}>
            <Text numberOfLines={2} style={s.title}>{title}</Text>
          </Pressable>
        ) : null}

        {/* [P8] «Búsquedas relacionadas» — como la barra de 小红书. Chips con los temas de la
            publicación; tocar uno abre el buscador con ese término.
            Sale SIEMPRE: si el post no trae temas se usan ciudad, autor y título
            (ver `relTerms`). Antes se ocultaba cuando no había temas y, como casi
            ningún vídeo lleva, en la práctica no se veía nunca.
            ⚠️ El GRUPO del autor NO está: `LbAuthor` no trae grupo y no hay
            endpoint de grupos por usuario. Hace falta backend (ver cabecera). */}
        {relTerms.length > 0 ? (
          <View style={s.relBox}>
            <Text style={s.relLabel}>Búsquedas relacionadas</Text>
            <View style={s.relRow}>
              {relTerms.map((t) => (
                <Pressable key={t} onPress={() => onSearchTopic(t)} hitSlop={4} style={s.relChip}
                  accessibilityRole="button" accessibilityLabel={`Buscar ${t}`}>
                  <Text numberOfLines={1} style={s.relChipText}>{t}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function fmtCount(n: number): string {
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

const s = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e32, backgroundColor: brand.visor },
  topBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e14,
  },
  iconBtn: { width: 38, height: 38, borderRadius: radios.full, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  moreBox: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', zIndex: 4 },
  /* Barrita de tiempo: sólo sale al mantener pulsado, así que puede tener el aspecto de
     «modo arrastre» — algo más gruesa y más blanca que una línea de adorno. Pista al 35 %
     para que se intuya el recorrido, relleno blanco casi opaco. Pegada al borde inferior
     (`bottom: 0`), como en TikTok/Douyin. */
  tlLine: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, zIndex: 6,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  tlFill: { height: 3, backgroundColor: 'rgba(255,255,255,0.95)' },
  /* El tiempo mientras se arrastra. Va por encima de la barra, con pastilla oscura para que
     se lea sobre cualquier vídeo. `bottom: 12` lo deja separado de la línea. */
  tlTime: {
    position: 'absolute', left: 0, right: 0, bottom: 12, zIndex: 6, alignItems: 'center',
  },
  tlTimeTxt: {
    color: brand.white, fontSize: tipografia.caption, fontWeight: peso.maximo,
    backgroundColor: 'rgba(0,0,0,0.55)', overflow: 'hidden',
    paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e4, borderRadius: radios.chip,
  },
  // El degradado inferior ya no es un estilo: se genera por franjas en `BottomScrim`.
  actions: { position: 'absolute', right: 10, zIndex: 3, alignItems: 'center', gap: espaciado.e16 },
  actBtn: { alignItems: 'center' },
  actN: { color: brand.white, fontSize: tipografia.micro, fontWeight: peso.maximo, marginTop: espaciado.e3 },
  info: { position: 'absolute', left: 14, right: 74, bottom: 0, zIndex: 3 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e7 },
  avatar: { width: 26, height: 26, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center' },
  author: { color: brand.white, fontSize: tipografia.body, fontWeight: peso.maximo, flexShrink: 1 },
  durChip: { backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: radios.sm, paddingHorizontal: espaciado.e6, paddingVertical: espaciado.e2 },
  durText: { color: brand.white, fontSize: tipografia.micro, fontWeight: peso.maximo },
  title: { color: 'rgba(255,255,255,0.94)', fontSize: tipografia.body, lineHeight: 18, marginTop: espaciado.e6 },
  // [P8] fila «Búsquedas relacionadas»
  relBox: { marginTop: espaciado.e9 },
  relLabel: { color: 'rgba(255,255,255,0.62)', fontSize: tipografia.micro, fontWeight: peso.maximo, marginBottom: espaciado.e6 },
  relRow: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6 },
  relChip: {
    backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radios.md,
    paddingHorizontal: espaciado.e9, paddingVertical: espaciado.e4, maxWidth: 190,
  },
  relChipText: { color: brand.white, fontSize: tipografia.caption, fontWeight: peso.fuerte },
  pauseDot: {
    ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 3,
  },
  largoBox: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 3, gap: espaciado.e12 },
  largoPlay: {
    width: 70, height: 70, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: trazo.fuerte, borderColor: 'rgba(255,255,255,0.85)',
  },
  largoTxt: { color: brand.white, fontSize: tipografia.body, fontWeight: peso.titulo, textAlign: 'center', lineHeight: 19 },
  largoSub: { color: 'rgba(255,255,255,0.8)', fontSize: tipografia.caption, fontWeight: peso.fuerte },
  heartPop: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 4 },
});
