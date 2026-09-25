/**
 * Life Book — DETALLE DE PUBLICACIÓN (ruta dinámica `/lifebook-post/:id`)
 * Pantalla: LifeBookPostDetailScreen
 *
 * Estructura estilo Xiaohongshu:
 *  - Cabecera fija: volver · autor (→ perfil) · Seguir · ⋯.
 *  - Imagen/vídeo grande arriba (scroll horizontal + contador + visor a pantalla
 *    completa al tocar).
 *  - Título, descripción, tags (#tema → búsqueda) y ubicación + fecha.
 *  - Botón de servicio si la publicación enlaza un servicio real (taxi/comida/
 *    tienda/alquiler/trabajo).
 *  - Paneles por tipo: venta (comprar/contraoferta), servicio, debate y serie
 *    (episodios + añadir episodio).
 *  - Comentarios.
 *  - Barra inferior fija: input de comentario + me gusta + guardar + compartir.
 *  - "Descubrir más": publicaciones relacionadas al final.
 *
 * API: GET /lifebook/posts/:id · GET /lifebook/posts/:id/related ·
 *      POST /lifebook/posts/:id/like|comment|bookmark · POST /lifebook/users/:id/follow
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Image, KeyboardAvoidingView, Modal,
  Platform, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View,
} from 'react-native';
// Parte 32: expo-image (caché memoria+disco) para la tira de fotos — sin
// destello blanco al abrir/cerrar el visor ni al volver de él.
import { Image as ExpoImage } from 'expo-image';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import {
  ArrowLeft, Bookmark, Briefcase, Car, ChevronRight, Heart, Home, MapPin,
  MoreHorizontal, Package, Play, Plus, Send, Share2, ShoppingBag, ShoppingCart, Store, Utensils, X,
} from 'lucide-react-native';
import { AuthGate } from '../../core/AuthGate';
import { absUrl } from '../../api/config';
import { authApi } from '../../api/auth';
import {
  lifebookActionsApi, lifebookApi, lifebookMediaApi,
  LB_CARD_DEFAULT_RATIO, toPostCard,
  type LbCommentItem, type LbEpisode, type LbPostCard, type LbPostDetail,
} from '../../api/lifebook';
import { lifebookPostOpsApi } from '../../api/lifebookPostOps';
import { PostCard } from '../../components/lifebook/PostCard';
import { ReportSheet } from '../../components/lifebook/ReportSheet';
import { fmtDur, lbTimeAgo, lbTypeLabel, lbXaf } from '../../constants/lifebook';
import { lbPriceLabel } from '../../constants/commerce';
import { productosEnNotaApi, type LbProductoEnNota } from '../../api/lifebookProductos';
import { ZoomableImage, type ZoomableImageHandle } from '../../components/lifebook/ZoomableImage';
import { ViewerZoomControls } from '../../components/lifebook/ViewerControls';
import { CommentRow, CommentsSheet } from '../../components/lifebook/CommentsSheet';
import { OrderSheet } from '../../components/lifebook/OrderSheet';
import { formaHoja } from '../../components/lifebook/ui/Sheet';
import { ir as irSeguro } from '../../constants/rutas';
import { brand } from '@egrouteplan/ui-kit';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const COLUMN_GAP = 8;
const SIDE_PADDING = 10;
const COLUMN_W = (SCREEN_W - SIDE_PADDING * 2 - COLUMN_GAP) / 2;

/**
 * Carrusel del detalle: caja fija **3:4** (vertical, estilo Xiaohongshu).
 * Todas las fotos ocupan lo mismo y se recortan con `cover`, así el detalle no
 * baila de alto según la proporción de cada imagen.
 */
const DETAIL_MEDIA_H = Math.round((SCREEN_W * 4) / 3);

const TYPE_TINT: Record<string, string> = {
  note: '#6B7280', sale: '#E0439A', service: brand.primary, debate: brand.secondary,
  video: '#7C3AED', podcast: '#E0439A', serie: brand.secondary,
};
const CONDITION_LABEL: Record<string, string> = {
  nuevo: 'Nuevo', como_nuevo: 'Como nuevo', usado: 'Usado', piezas: 'Por piezas',
};
const UNIT_LABEL: Record<string, string> = {
  por_hora: 'por hora', por_servicio: 'por servicio', negociable: 'negociable',
};
const CONTACT_LABEL: Record<string, string> = {
  inapp: 'Por la app', phone: 'Por teléfono', whatsapp: 'Por WhatsApp',
};
const STATE_LABEL: Record<string, string> = {
  open: 'Abierto', discussing: 'En discusión', proposals: 'Recogiendo propuestas',
  community_resolved: 'Resuelto por la comunidad', attention: 'En espera de atención', closed: 'Cerrado',
};
/** Servicios reales enlazables (mismo mapa que usa el Estado 24h + alias shop/delivery). */
const SERVICE_ROUTES: Record<string, { route: string; label: string; color: string; icon: typeof Car }> = {
  taxi: { route: '/taxi', label: 'Llamar Taxi', color: brand.secondary, icon: Car },
  food: { route: '/food', label: 'Pedir comida', color: '#E0439A', icon: Utensils },
  ecomerse: { route: '/ecomerse', label: 'Ver tienda', color: brand.primary, icon: ShoppingBag },
  shop: { route: '/ecomerse', label: 'Ver tienda', color: brand.primary, icon: ShoppingBag },
  work: { route: '/work', label: 'Ver oferta', color: '#7C3AED', icon: Briefcase },
  rental: { route: '/alquiler', label: 'Ver alquiler', color: '#00A870', icon: Home },
  paquete: { route: '/service/paquete', label: 'Enviar paquete', color: '#00A870', icon: Package },
  delivery: { route: '/service/paquete', label: 'Enviar paquete', color: '#00A870', icon: Package },
  lifebook: { route: '/lifebook-store', label: 'Ver su tienda', color: brand.primary, icon: Store },
};

export default function LifeBookPostDetailScreen() {
  return (
    <AuthGate>
      <PostContent />
    </AuthGate>
  );
}

function Avatar({ url, name, size = 40 }: { url?: string | null; name?: string | null; size?: number }) {
  const { colors } = useTheme();
  const src = absUrl(url);
  if (src) return <Image source={{ uri: src }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface }} />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: alpha(colors.primary, 0.15), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.primary, fontSize: size * 0.5, fontWeight: peso.titulo }}>{(name ?? '?').charAt(0).toUpperCase()}</Text>
    </View>
  );
}

function Chip({ text, color, bg }: { text: string; color: string; bg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: radios.full, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e4 }}>
      <Text style={{ color, fontSize: tipografia.caption, fontWeight: peso.maximo }}>{text}</Text>
    </View>
  );
}

/** Botón de la barra inferior (diseño del dueño): icono + contador opcional. */
function DetailActionButton({ icon, count, active, activeColor, colors, onPress, label }: {
  icon: React.ReactNode;
  count?: number;
  active?: boolean;
  activeColor?: string;
  colors: any;
  onPress: () => void;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={count ? `${label}, ${count}` : label}
      style={{ alignItems: 'center', justifyContent: 'center', minWidth: 38, paddingVertical: espaciado.e2 }}
    >
      {icon}
      {typeof count === 'number' && count > 0 ? (
        <Text style={{
          marginTop: espaciado.e2, fontSize: 10.5, fontWeight: peso.titulo,
          color: active ? activeColor : colors.textSecondary,
        }}>
          {count > 999 ? '999+' : count}
        </Text>
      ) : null}
    </Pressable>
  );
}

function PostContent() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  /* ── Estado ── */
  const [post, setPost] = useState<LbPostDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [comments, setComments] = useState<LbCommentItem[]>([]);
  /** Total real de comentarios (lo manda el servidor en `total`). */
  const [commentsTotal, setCommentsTotal] = useState(0);
  /** Hoja de comentarios (la caja de texto vive ahí, no en la barra). */
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [busyLike, setBusyLike] = useState(false);
  const [imgIdx, setImgIdx] = useState(0);
  const [episodes, setEpisodes] = useState<LbEpisode[] | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [following, setFollowing] = useState(false);
  const [busyFollow, setBusyFollow] = useState(false);
  /** Hoja de compra (la compra vive en la barra inferior). */
  const [orderOpen, setOrderOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  /** `true` mientras el servidor borra el post y sus archivos. */
  const [borrando, setBorrando] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerIdx, setViewerIdx] = useState(0);
  /** `true` mientras la foto del visor está ampliada (bloquea el pase). */
  const [viewerZoomed, setViewerZoomed] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [moreRelated, setMoreRelated] = useState<LbPostCard | null>(null);
  const [related, setRelated] = useState<LbPostCard[]>([]);
  /**
   * TANDA C — los productos enganchados a la nota. Se piden aparte (una petición más al abrir
   * la nota, y ninguna si no hay) para no tocar el tipo `LbPost` de `api/lifebook.ts`, que no
   * se puede modificar.
   *
   * OJO CON EL SITIO: estos hooks van AQUÍ ARRIBA, con los demás, y NO junto al texto que
   * pintan. La primera versión los puso más abajo (junto a `topics`) y eso rompía la pantalla
   * entera: «Rendered more hooks than during the previous render», porque más abajo hay
   * `return` tempranos (cargando / no encontrada) que se saltan los hooks en unos renderizados
   * y en otros no. React exige el mismo orden SIEMPRE.
   */
  const [productos, setProductos] = useState<LbProductoEnNota[]>([]);
  useEffect(() => {
    const pid = id;
    if (!pid) return;
    let vivo = true;
    productosEnNotaApi.deNota(String(pid))
      .then((r) => { if (vivo) setProductos(r.products ?? []); })
      .catch(() => { if (vivo) setProductos([]); });
    return () => { vivo = false; };
  }, [id]);

  const mounted = useRef(true);
  /* Parte 32: refs del visor de fotos — la lista (para que la pinza le gane el
     toque al pase de páginas) y el mando de zoom de cada página. */
  const viewerListRef = useRef<FlatList<string>>(null);
  const zoomHandles = useRef<Record<number, ZoomableImageHandle | null>>({});

  /* ── Carga ── */
  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { post: p } = await lifebookApi.postDetail(id);
      if (!p) { setNotFound(true); return; }
      setPost(p);
      setNotFound(false);
      // Vista previa: los 3 comentarios MÁS NUEVOS + el total real.
      // (El servidor los manda del más antiguo al más nuevo, así que se
      //  invierte la página y se toman los 3 primeros.)
      const page = await lifebookApi.postComments(id, { limit: 50 })
        .catch(() => ({ comments: [] as LbCommentItem[], total: 0, nextCursor: null }));
      setComments([...(page.comments ?? [])].reverse().slice(0, 3));
      setCommentsTotal(Number(page.total ?? (page.comments ?? []).length));
      lifebookApi.relatedPosts(id, 6)
        .then((page) => { if (mounted.current) setRelated((page.posts ?? []).map(toPostCard)); })
        .catch(() => {});
      if (p.type === 'serie') {
        const eps = await lifebookMediaApi.serieEpisodes(id).catch(() => [] as LbEpisode[]);
        setEpisodes(eps);
      }
      // Parte 11: el propio servidor indica si sigo al autor.
      setFollowing(!!p.author?.followedByMe);
    } catch { setNotFound(true); }
    finally { if (mounted.current) setLoading(false); }
  }, [id]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => { authApi.me().then((m) => setMeId(m?.id ?? null)).catch(() => {}); }, []);

  /* ── Acciones ── */
  const toggleLike = async () => {
    if (!post || busyLike) return;
    setBusyLike(true);
    const wasLiked = !!post.stats?.likedByMe;
    const stats = post.stats ?? {};
    setPost({ ...post, stats: { ...stats, likedByMe: !wasLiked, likes: Math.max(0, (stats.likes ?? 0) + (wasLiked ? -1 : 1)) } });
    try { await lifebookActionsApi.toggleLike(post.id, wasLiked); }
    catch {
      setPost((cur) => (cur ? { ...cur, stats: { ...(cur.stats ?? {}), likedByMe: wasLiked, likes: Math.max(0, (cur.stats?.likes ?? 0)) } } : cur));
    }
    finally { setBusyLike(false); }
  };

  const toggleSave = async () => {
    if (!post) return;
    const was = !!post.stats?.bookmarkedByMe;
    setPost({ ...post, stats: { ...(post.stats ?? {}), bookmarkedByMe: !was } });
    try { await lifebookActionsApi.toggleSave(post.id, was); }
    catch { setPost((cur) => (cur ? { ...cur, stats: { ...(cur.stats ?? {}), bookmarkedByMe: was } } : cur)); }
  };

  const toggleFollow = async () => {
    if (!post?.author?.id || busyFollow) return;
    setBusyFollow(true);
    const was = following;
    setFollowing(!was);
    try { await lifebookActionsApi.toggleFollow(post.author.id, !was); }
    catch { setFollowing(was); }
    finally { setBusyFollow(false); }
  };

  /** Refresca la vista previa (y el total) tras comentar en la hoja. */
  const refreshComments = useCallback(async () => {
    if (!id) return;
    const page = await lifebookApi.postComments(id, { limit: 50 })
      .catch(() => ({ comments: [] as LbCommentItem[], total: 0, nextCursor: null }));
    setComments([...(page.comments ?? [])].reverse().slice(0, 3));
    setCommentsTotal(Number(page.total ?? (page.comments ?? []).length));
  }, [id]);

  const toggleComments = async () => {
    if (!post) return;
    try {
      await lifebookActionsApi.commentsState(post.id, !post.allowComments);
      setMenuOpen(false);
      await load();
    } catch (e) {
      Alert.alert('Comentarios', e instanceof Error ? e.message : 'No se pudo cambiar la opción.');
    }
  };

  /**
   * Borra la publicación (autor o ADMIN, lo decide el servidor).
   *
   * El aviso dice lo que de verdad se pierde: no hay papelera, y con el post se van sus
   * comentarios **y sus archivos del almacén** — en un vídeo largo son cientos de MB. Un
   * «¿seguro?» a secas no informa de eso.
   */
  const borrarPost = () => {
    if (!post || borrando) return;
    setMenuOpen(false);
    const queEs = post.type === 'video' || post.type === 'episode'
      ? 'este vídeo'
      : post.type === 'podcast'
        ? 'este podcast'
        : post.type === 'serie'
          ? 'esta serie'
          : 'esta publicación';
    Alert.alert(
      'Eliminar publicación',
      `Se borrará ${queEs}, con sus comentarios y sus archivos. No se puede deshacer.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setBorrando(true);
            try {
              await lifebookPostOpsApi.borrarPost(post.id);
              // Ya no existe: quedarse aquí mostrándolo sería mentir. Si hay historial se
              // vuelve por donde se vino (el feed recarga al recuperar el foco); si no
              // (enlace profundo), se va al feed, que es lo único que sigue en pie.
              if (router.canGoBack()) router.back();
              else irSeguro.libre('/lifebook-videos', undefined, true);
            } catch (e) {
              setBorrando(false);
              Alert.alert('Eliminar', e instanceof Error ? e.message : 'No se pudo eliminar la publicación.');
            }
          },
        },
      ],
    );
  };

  /** Parte 14: me gusta en un comentario (optimista). */
  const toggleCommentLike = async (commentId: string) => {
    const target = comments.find((c) => c.id === commentId);
    if (!target) return;
    const was = !!target.likedByMe;
    const next = comments.map((c) => (c.id === commentId
      ? { ...c, likedByMe: !was, likes: Math.max(0, (c.likes ?? 0) + (was ? -1 : 1)) }
      : c));
    setComments(next);
    try { await lifebookApi.toggleCommentLike(commentId, was); }
    catch { setComments(comments); }
  };

  const sharePost = () => {
    Share.share({ message: `${post?.title ?? post?.body ?? 'Publicación'} — Life Book · EG Route Plan` }).catch(() => {});
  };

  /* ── Masonry de relacionadas (mismo reparto que el feed) ── */
  const { leftCol, rightCol } = useMemo(() => {
    const left: LbPostCard[] = [];
    const right: LbPostCard[] = [];
    let hL = 0;
    let hR = 0;
    for (const p of related) {
      const imgH = COLUMN_W / (p.media?.aspectRatio ?? LB_CARD_DEFAULT_RATIO);
      const totalH = imgH + 60;
      if (hL <= hR) { left.push(p); hL += totalH; } else { right.push(p); hR += totalH; }
    }
    return { leftCol: left, rightCol: right };
  }, [related]);

  /* ── Estados de carga / error ── */
  if (loading && !post) {
    return (
      <View style={[styles.root, styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (notFound || !post) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + 4, borderBottomColor: alpha(colors.border, 0.4) }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: espaciado.e4 }} accessibilityLabel="Volver">
            <ArrowLeft size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.titulo, flex: 1 }}>Publicación</Text>
        </View>
        <View style={[styles.center, { flex: 1, padding: espaciado.e30, gap: espaciado.e8 }]}>
          <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: 15 }}>No se encontró esta publicación</Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, textAlign: 'center' }}>
            Puede que se haya eliminado o que su visibilidad no te lo permita.
          </Text>
        </View>
      </View>
    );
  }

  const tint = TYPE_TINT[post.type] ?? '#6B7280';
  const pl = post.payload ?? {};
  const price = (pl.priceXaf as number | undefined) ?? undefined;
  const isSale = post.type === 'sale';
  const isService = post.type === 'service';
  const isDebate = post.type === 'debate';
  const isMine = !!meId && meId === post.author?.id;
  const topics = (post.topics ?? []) as string[];
  /** Título y texto de la caja de comentarios (diseño del dueño). */
  const commentSectionTitle = 'Comentarios';
  const commentPlaceholder = isDebate
    ? 'Aporta al debate…'
    : post.type === 'sale'
      ? 'Pregunta por este artículo...'
      : 'Añade un comentario...';
  // Portada: fotos de la galería o la portada de vídeo/podcast/serie.
  const coverUrl = typeof pl.coverUrl === 'string' ? absUrl(pl.coverUrl) : '';
  const gallery = (post.media ?? []).map((m) => absUrl(m.url));
  const mediaUrls = gallery.length ? gallery : (coverUrl ? [coverUrl] : []);
  /**
   * Parte 32: abre el visor en la foto tocada y **precarga** todas las fotos en
   * la caché de disco de expo-image, así el visor aparece sin destello blanco.
   */
  const openViewer = (url: string) => {
    setViewerIdx(Math.max(0, mediaUrls.indexOf(url)));
    setViewerOpen(true);
    ExpoImage.prefetch(mediaUrls, { cachePolicy: 'memory-disk' }).catch(() => {});
    ExpoImage.prefetch(url, { cachePolicy: 'memory-disk' }).catch(() => {});
  };
  // El carrusel del detalle usa caja fija 3:4 (`DETAIL_MEDIA_H`), así que ya no
  // se calcula la altura a partir de `coverRatio` (eso sigue en la tarjeta).
  const linkType = post.serviceLink ? String(post.serviceLink.type) : '';
  const linkCfg = SERVICE_ROUTES[linkType];
  // La ruta la resuelve el servidor (serviceLink.route); el mapa local es el respaldo.
  const linkRoute = post.serviceLink?.route ?? linkCfg?.route ?? null;
  const linkLabel = linkCfg?.label ?? 'Ver servicio';
  const linkColor = linkCfg?.color ?? colors.primary;
  const isPlaying = post.type === 'video' || post.type === 'serie';

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* ═══════ CABECERA FIJA: autor + seguir + ⋯ ═══════ */}
      <View style={[styles.header, { paddingTop: insets.top + 4, borderBottomColor: alpha(colors.border, 0.4) }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: espaciado.e4 }} accessibilityLabel="Volver">
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>

        <Pressable
          style={styles.headerAuthor}
          onPress={() => irSeguro.libre('/lifebook-user', { id: post.author?.id ?? '' })}
          accessibilityRole="button"
        >
          <Avatar url={post.author?.avatarUrl} name={post.author?.fullName} size={30} />
          <Text numberOfLines={1} style={{ color: post.author?.nameColor || colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.fuerte, flex: 1 }}>
            {post.author?.fullName ?? 'Usuario'}
          </Text>
        </Pressable>

        {!isMine && (
          <Pressable
            onPress={toggleFollow}
            accessibilityRole="button"
            accessibilityState={{ selected: following }}
            style={[styles.followBtn, { backgroundColor: following ? alpha(colors.textSecondary, 0.08) : colors.primary }]}
          >
            <Text style={{ color: following ? colors.textSecondary : brand.white, fontSize: tipografia.caption, fontWeight: peso.maximo }}>
              {following ? 'Siguiendo' : 'Seguir'}
            </Text>
          </Pressable>
        )}

        <Pressable onPress={() => setMenuOpen(true)} hitSlop={8} style={{ padding: espaciado.e4, marginLeft: espaciado.e6 }} accessibilityLabel="Más opciones">
          <MoreHorizontal size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* ═══════ CONTENIDO ═══════ */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 108 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* Carrusel 3:4 (scroll horizontal + contador + puntos → visor) */}
        {mediaUrls.length > 0 ? (
          <View style={{ backgroundColor: colors.surface }}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setImgIdx(Math.round(e.nativeEvent.contentOffset.x / Math.max(1, e.nativeEvent.layoutMeasurement.width)))}
            >
              {mediaUrls.map((u) => (
                <Pressable
                  key={u}
                  onPress={() => {
                    // AUDIO (podcast) → su reproductor. VÍDEO → el feed inmersivo,
                    // empezando por esta publicación: es el ÚNICO estado de ver vídeo
                    // (el reproductor de vídeo se retiró; ver `app/lifebook-player.tsx`).
                    // Sólo se entra al feed si hay una URL de vídeo REAL: un post de tipo
                    // serie o vídeo sin URL dejaría el feed sin nada que mostrar.
                    const vurl = String(pl.videoUrl ?? '').trim();
                  if (post.type === 'podcast') {
                    router.push({
                      pathname: '/lifebook-player',
                      params: {
                        kind: 'audio',
                        src: String(pl.audioUrl ?? ''),
                        title: String(post.title ?? lbTypeLabel(post.type)),
                        cover: coverUrl,
                      },
                    } as never);
                  } else if (vurl) {
                    router.push({
                      pathname: '/lifebook-videos',
                      params: { startId: post.id },
                    } as never);
                  } else {
                    openViewer(u);
                  }
                }}
                  accessibilityLabel={isPlaying ? 'Reproducir' : 'Ver foto a pantalla completa'}
                >
                  <ExpoImage
                    source={u}
                    style={{ width: SCREEN_W, height: DETAIL_MEDIA_H, backgroundColor: colors.surface }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={u}
                    transition={0}
                  />
                </Pressable>
              ))}
            </ScrollView>

            {isPlaying && (
              <View style={styles.playOverlay} pointerEvents="none">
                <View style={styles.playCircle}>
                  <Play size={28} color={brand.white} fill={brand.white} style={{ marginLeft: espaciado.e3 }} />
                </View>
              </View>
            )}

            {mediaUrls.length > 1 && (
              <>
                <View style={[styles.countBadge, { backgroundColor: 'rgba(0,0,0,0.55)' }]}>
                  <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: peso.titulo }}>{imgIdx + 1}/{mediaUrls.length}</Text>
                </View>
                <View style={styles.dots}>
                  {mediaUrls.map((_, i) => (
                    <View key={i} style={[styles.dot, { backgroundColor: i === imgIdx ? brand.white : 'rgba(255,255,255,0.5)' }]} />
                  ))}
                </View>
              </>
            )}
          </View>
        ) : (
          <View style={[styles.hero, { backgroundColor: alpha(tint, 0.12) }]}>
            <Text style={[styles.heroType, { color: tint }]}>{lbTypeLabel(post.type)}</Text>
            {price !== undefined && <Text style={[styles.heroPrice, { color: tint }]}>{lbXaf(price)}</Text>}
          </View>
        )}

        <View style={{ paddingHorizontal: espaciado.e16, paddingTop: espaciado.e14 }}>
          {/* Título + descripción */}
          {post.title ? <Text style={[styles.postTitle, { color: colors.textPrimary }]}>{post.title}</Text> : null}
          {post.body ? <Text style={[styles.postBody, { color: colors.textPrimary }]}>{post.body}</Text> : null}

          {/* TANDA C — LOS PRODUCTOS DENTRO DE LA NOTA. Van justo aquí: debajo del texto y
              ANTES de los hashtags, que es donde los pone Xiaohongshu. Si la nota no tiene
              productos, no se pinta nada (ni hueco). */}
          {productos.length > 0 ? (
            <View style={{ marginTop: espaciado.e12, gap: espaciado.e8 }}>
              {productos.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => irSeguro.libre('/lifebook-product/[id]', { id: p.id })}
                  accessibilityLabel={`Ver el producto ${p.title}`}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, padding: espaciado.e8,
                    borderRadius: radios.md, borderWidth: trazo.fino,
                    borderColor: alpha(colors.primary, 0.35),
                    backgroundColor: alpha(colors.primary, 0.06),
                  }}
                >
                  {p.coverUrl ? (
                    <Image source={{ uri: absUrl(p.coverUrl) }} style={{ width: 46, height: 46, borderRadius: 10 }} />
                  ) : (
                    <View style={{ width: 46, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.primary, 0.12) }}>
                      <Package size={18} color={colors.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>{p.title}</Text>
                    <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.titulo, marginTop: 1 }}>
                      {lbPriceLabel(p.priceXaf, p.priceMode, lbXaf)}
                    </Text>
                  </View>
                  <View style={{ paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e6, borderRadius: radios.full, backgroundColor: colors.primary }}>
                    <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: peso.titulo }}>Ver</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ) : null}

          {/* Tags (temas) → búsqueda */}
          {(topics.length > 0 || post.tone) && (
            <View style={styles.chipRow}>
              {post.tone ? <Chip text={post.tone} color={colors.textPrimary} bg={colors.surface} /> : null}
              {topics.map((t) => (
                <Pressable
                  key={t}
                  onPress={() => irSeguro.libre('/lifebook-search', { q: t })}
                  accessibilityRole="link"
                >
                  <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.medio }}>#{t}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {/* Ubicación + fecha */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, marginTop: espaciado.e12, flexWrap: 'wrap' }}>
            {post.city ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 }}>
                <MapPin size={13} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
                  {post.barrio ? `${post.barrio}, ` : ''}{post.city}
                </Text>
              </View>
            ) : null}
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{lbTimeAgo(post.createdAt)}</Text>
          </View>

          {/* Botón de servicio enlazado */}
          {linkRoute ? (
            <Pressable
              onPress={() => {
                // `lifebook` enlaza un PERFIL: la tienda (`/lifebook-store`) exige
                // `sellerId`, así que sin id se abría vacía. Se va al perfil.
                if (post.serviceLink?.type === 'lifebook' && post.serviceLink?.id) {
                  irSeguro.libre('/lifebook-user', { id: String(post.serviceLink.id) });
                  return;
                }
                /* La ruta del servicio sale de una tabla; se valida por si esa entrada apunta a
                   una pantalla que ya no existe (fue justo el caso de `/emergencia`). */
                irSeguro.libre(String(linkRoute));
              }}
              accessibilityRole="button"
              style={[styles.serviceBtn, { backgroundColor: linkColor }]}
            >
              {linkCfg ? <linkCfg.icon size={16} color={brand.white} /> : <Store size={16} color={brand.white} />}
              <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>{linkLabel}</Text>
              <ChevronRight size={14} color="rgba(255,255,255,0.7)" />
            </Pressable>
          ) : null}

          {/* Venta */}
          {isSale && (
            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.panelTitle, { color: colors.textPrimary }]}>
                Precio: {price !== undefined ? lbXaf(price) : 'A convenir'}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e3 }}>
                {(CONDITION_LABEL[String(pl.condition ?? '')] ?? pl.condition ?? '')}{pl.negotiable ? ' · negociable' : ''}{pl.category ? ` · ${pl.category}` : ''}
              </Text>
              {(pl.delivery as string[] | undefined)?.length ? (
                <Text style={styles.panelLine}>Entrega: {(pl.delivery as string[]).join(' · ')}</Text>
              ) : null}
              {(pl.paymentMethods as string[] | undefined)?.length ? (
                <Text style={styles.panelLine}>Pago: {(pl.paymentMethods as string[]).join(' · ')}</Text>
              ) : null}
              <Text style={styles.panelLine}>Contacto: {CONTACT_LABEL[String(pl.contactMode ?? '')] ?? pl.contactMode}</Text>
            </View>
          )}

          {/* Servicio */}
          {isService && (
            <View style={[styles.panel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <Text style={[styles.panelTitle, { color: colors.textPrimary }]}>
                {pl.serviceType ? String(pl.serviceType) : 'Servicio'}
                {price !== undefined ? ` · ${lbXaf(price)}` : ''}{pl.unit ? ` ${UNIT_LABEL[String(pl.unit)] ?? pl.unit}` : ''}
              </Text>
              {(pl.availability as string[] | undefined)?.length ? (
                <Text style={styles.panelLine}>Disponible: {(pl.availability as string[]).join(' · ')}</Text>
              ) : null}
              <Text style={styles.panelLine}>Contacto: {CONTACT_LABEL[String(pl.contactMode ?? '')] ?? pl.contactMode}</Text>
            </View>
          )}

          {/* Debate */}
          {isDebate && post.debate && (
            <View style={[styles.panel, { borderColor: alpha(tint, 0.4) }]}>
              <View style={{ flexDirection: 'row', gap: espaciado.e8, flexWrap: 'wrap' }}>
                <Chip text={String(post.debate.category ?? '')} color={tint} bg={alpha(tint, 0.12)} />
                <Chip text={STATE_LABEL[post.debate.state] ?? post.debate.state} color={brand.white} bg={tint} />
              </View>
              {post.debate.problem ? <Text style={[styles.panelTitle, { color: colors.textPrimary, marginTop: espaciado.e8 }]}>El problema</Text> : null}
              {post.debate.problem ? <Text style={styles.panelLine}>{post.debate.problem}</Text> : null}
              {post.debate.context ? <Text style={styles.panelLine}>{post.debate.context}</Text> : null}
              {post.debate.initialProposal ? <Text style={styles.panelLine}>Propuesta inicial: {post.debate.initialProposal}</Text> : null}
              {post.debate.resolvedSummary ? (
                <>
                  <Text style={[styles.panelTitle, { color: colors.success, marginTop: espaciado.e6 }]}>✓ Cómo se resolvió</Text>
                  <Text style={styles.panelLine}>{post.debate.resolvedSummary}</Text>
                </>
              ) : null}
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e8 }}>
                {post.debate.allowProposals ? 'Acepta propuestas de solución' : 'No acepta propuestas'}
                {post.debate.allowVotes ? ' · con votos de la comunidad' : ''}
              </Text>
              {/* Parte 14: agregado real de los votos de las propuestas */}
              {(post.debate.votesYes !== undefined || post.debate.votesNo !== undefined) && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, flexWrap: 'wrap', marginTop: espaciado.e10 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
                    Comunidad: {post.debate.votesYes ?? 0} a favor · {post.debate.votesNo ?? 0} en contra
                  </Text>
                  {post.debate.myVote ? (
                    <Chip
                      text={post.debate.myVote === 'yes' ? 'Tu voto: sí' : 'Tu voto: no'}
                      color={brand.white}
                      bg={tint}
                    />
                  ) : null}
                </View>
              )}
            </View>
          )}

          {/* Serie: episodios */}
          {post.type === 'serie' && (
            <View style={{ marginTop: espaciado.e16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, flexWrap: 'wrap' }}>
                <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0, color: colors.textPrimary }]}>Episodios</Text>
                {post.serie ? (
                  <Chip
                    text={post.serie.episodesCount > 0 ? `📺 ${post.serie.episodesCount} eps · ${post.serie.seasons} temp.` : 'Sin episodios aún'}
                    color={colors.textPrimary}
                    bg={colors.surface}
                  />
                ) : null}
                {isMine && (
                  <Pressable
                    onPress={() => irSeguro.libre('/lifebook-media', { kind: 'episode', serieId: post.id, serieTitle: String(post.title ?? '') })}
                    style={[styles.epAddBtn, { backgroundColor: alpha(TYPE_TINT.serie, 0.14) }]}
                    accessibilityLabel="Añadir episodio"
                  >
                    <Plus size={14} color={TYPE_TINT.serie} />
                    <Text style={{ color: TYPE_TINT.serie, fontSize: tipografia.caption, fontWeight: peso.titulo }}>Añadir episodio</Text>
                  </Pressable>
                )}
              </View>
              {episodes === null ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: espaciado.e14 }} />
              ) : episodes.length === 0 ? (
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, marginTop: espaciado.e8, lineHeight: 19 }}>
                  {isMine ? 'Tu serie aún no tiene episodios. Añade el primero.' : 'Esta serie aún no tiene episodios publicados.'}
                </Text>
              ) : (
                episodes.map((ep) => (
                  <Pressable
                    key={ep.id}
                    onPress={() => router.push({
                      // `kind: 'episode'`: un episodio de serie NO es una publicación, así
                      // que no puede ir al feed inmersivo (ver `EpisodePlayerView`).
                      pathname: '/lifebook-player',
                      params: { kind: 'episode', src: ep.videoUrl, title: `${ep.label} — ${ep.title ?? post.title ?? 'Episodio'}` },
                    } as never)}
                    style={({ pressed }) => [styles.epRow, { backgroundColor: pressed ? alpha(colors.primary, 0.06) : colors.surface, borderColor: colors.border }]}
                  >
                    <View style={[styles.epThumb, { backgroundColor: alpha(TYPE_TINT.serie, 0.16) }]}>
                      <Text style={{ fontSize: tipografia.subtitle }}>🎬</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.body }}>
                        {ep.label}{ep.title ? ` — ${ep.title}` : ''}
                      </Text>
                      {ep.body ? <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 1 }}>{ep.body}</Text> : null}
                    </View>
                    {ep.durationSec != null && (
                      <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.fuerte }}>{fmtDur(ep.durationSec)}</Text>
                    )}
                    <Play size={15} color={colors.primary} fill={colors.primary} style={{ marginLeft: espaciado.e6 }} />
                  </Pressable>
                ))
              )}
            </View>
          )}


          {/* Stats */}
          <View style={[styles.statsRow, { borderBottomColor: alpha(colors.border, 0.4) }]}>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
              {formatCount(post.stats?.likes ?? 0)} Me gusta · {formatCount(post.stats?.comments ?? 0)} Comentarios
            </Text>
          </View>

          {/* ═══════ COMENTARIOS (vista previa → hoja) ═══════ */}
          <View style={{ marginTop: espaciado.e18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: tipografia.subtitle, fontWeight: peso.titulo, color: colors.textPrimary }}>{commentSectionTitle}</Text>
              <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: colors.textSecondary }}>
                {formatCount(commentsTotal || (post.stats?.comments ?? 0))}
              </Text>
            </View>

            {!post.allowComments ? (
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, textAlign: 'center', paddingVertical: espaciado.e18 }}>
                Los comentarios están desactivados
              </Text>
            ) : comments.length === 0 ? (
              <Pressable
                onPress={() => setCommentsOpen(true)}
                accessibilityLabel="Sé el primero en comentar"
                style={{
                  marginTop: espaciado.e10, borderRadius: radios.lg, borderWidth: trazo.fino, borderColor: colors.border,
                  backgroundColor: colors.surface, paddingVertical: espaciado.e16, alignItems: 'center',
                }}
              >
                <Text style={{ fontSize: tipografia.body, fontWeight: peso.maximo, color: colors.textSecondary }}>Sé el primero en comentar</Text>
              </Pressable>
            ) : (
              <View style={{ marginTop: espaciado.e4 }}>
                {comments.slice(0, 3).map((c) => (
                  <CommentRow
                    key={c.id}
                    c={c}
                    tint={tint}
                    colors={colors}
                    onLike={() => toggleCommentLike(c.id)}
                    onReply={() => setCommentsOpen(true)}
                  />
                ))}
              </View>
            )}

            {(commentsTotal || (post.stats?.comments ?? 0)) > 3 ? (
              <Pressable
                onPress={() => setCommentsOpen(true)}
                accessibilityLabel={`Ver los ${commentsTotal} comentarios`}
                style={{ marginTop: espaciado.e8, paddingVertical: espaciado.e10, alignItems: 'center' }}
              >
                <Text style={{ color: colors.primary, fontWeight: peso.titulo, fontSize: tipografia.body }}>
                  Ver los {formatCount(commentsTotal || (post.stats?.comments ?? 0))} comentarios
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* ═══════ DESCUBRIR MÁS (relacionadas) ═══════ */}
          {related.length > 0 && (
            <View style={{ marginTop: espaciado.e24 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.maximo, marginBottom: espaciado.e12 }}>
                Descubrir más
              </Text>
              <View style={styles.masonryRow}>
                <View style={styles.masonryCol}>
                  {leftCol.map((p) => (
                    <PostCard
                      key={p.id}
                      post={p}
                      width={COLUMN_W}
                      onPress={(pid) => router.push({ pathname: '/lifebook-post/[id]', params: { id: pid } })}
                      onMore={setMoreRelated}
                    />
                  ))}
                </View>
                <View style={styles.masonryCol}>
                  {rightCol.map((p) => (
                    <PostCard
                      key={p.id}
                      post={p}
                      width={COLUMN_W}
                      onPress={(pid) => router.push({ pathname: '/lifebook-post/[id]', params: { id: pid } })}
                      onMore={setMoreRelated}
                    />
                  ))}
                </View>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ═══════ BARRA INFERIOR FIJA (diseño del dueño) ═══════ */}
      <View
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0,
          backgroundColor: alpha(colors.surface, 0.98),
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8 }}>
          {/* La caja es una pastilla: el texto se escribe en la hoja de comentarios */}
          <Pressable
            onPress={() => setCommentsOpen(true)}
            accessibilityLabel={post.allowComments ? commentPlaceholder : 'Comentarios desactivados'}
            style={{
              flex: 1, height: 38, borderRadius: radios.full,
              backgroundColor: alpha(colors.textPrimary, 0.07),
              paddingHorizontal: espaciado.e14, justifyContent: 'center',
            }}
          >
            <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.body, fontWeight: peso.fuerte }}>
              {post.allowComments ? commentPlaceholder : 'Comentarios desactivados'}
            </Text>
          </Pressable>

          {/* La compra vive aquí (solo artículos de otros) */}
          {!isMine && post.type === 'sale' ? (
            <Pressable
              onPress={() => setOrderOpen(true)}
              accessibilityLabel="Comprar"
              style={{
                height: 38, borderRadius: radios.full, backgroundColor: colors.primary,
                flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, paddingHorizontal: espaciado.e14,
              }}
            >
              <ShoppingCart size={16} color={brand.white} />
              <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: tipografia.body }}>Comprar</Text>
            </Pressable>
          ) : null}

          <DetailActionButton
            label="Me gusta"
            onPress={toggleLike}
            active={!!post.stats?.likedByMe}
            activeColor={brand.like}
            colors={colors}
            count={post.stats?.likes ?? 0}
            icon={
              <Heart
                size={22}
                color={post.stats?.likedByMe ? brand.like : colors.textPrimary}
                fill={post.stats?.likedByMe ? brand.like : 'transparent'}
              />
            }
          />

          <DetailActionButton
            label="Guardar"
            onPress={toggleSave}
            active={!!post.stats?.bookmarkedByMe}
            activeColor="#FFB800"
            colors={colors}
            count={post.savedCount ?? post.stats?.bookmarks ?? 0}
            icon={
              /* Mismo icono y color que la tarjeta del feed y el perfil. */
              <Bookmark
                size={22}
                color={post.stats?.bookmarkedByMe ? '#FFB800' : colors.textPrimary}
                fill={post.stats?.bookmarkedByMe ? '#FFB800' : 'none'}
              />
            }
          />

          <DetailActionButton
            label="Compartir"
            onPress={sharePost}
            colors={colors}
            icon={<Share2 size={22} color={colors.textPrimary} />}
          />
        </View>
      </View>

      {/* ═══════ Hoja de comentarios ═══════ */}
      <CommentsSheet
        visible={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        postId={post.id}
        tint={tint}
        allowComments={post.allowComments}
        meId={meId}
        title={commentSectionTitle}
        placeholder={commentPlaceholder}
        onCountChange={(n) => { setCommentsTotal(n); setPost((cur) => (cur ? { ...cur, stats: { ...(cur.stats ?? {}), comments: n } } : cur)); }}
        onSent={refreshComments}
        /*
          La publicación NO se tapa entera: con el 80 % de antes, la hoja se comía
          casi toda la pantalla y lo único que quedaba a la vista era el borde de
          arriba. Con 62 % se sigue viendo el autor y la foto mientras se leen los
          comentarios, que es lo que hacen Xiaohongshu y TikTok (redimensionar, no
          tapar). Ver docs/COMENTARIOS-QUE-NO-TAPEN-EL-CONTENIDO.md.
        */
        maxHeightPct={62}
      />

      {/* ═══════ Hoja de compra ═══════ */}
      <OrderSheet
        visible={orderOpen}
        onClose={() => setOrderOpen(false)}
        postId={post.id}
        priceXaf={Number(pl.priceXaf ?? 0) || 0}
        negotiable={!!pl.negotiable}
        onCreated={(orderNo) => {
          setOrderOpen(false);
          Alert.alert('Pedido creado', `Tu pedido ${orderNo} se envió al vendedor.`);
          irSeguro.libre('/lifebook-orders', undefined, true);
        }}
      />

      {/* ═══════ Menú ⋯ ═══════ */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)} statusBarTranslucent>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setMenuOpen(false)} />
        <View style={[styles.menuSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          {isMine ? (
            <>
              <Pressable
                onPress={toggleComments}
                style={({ pressed }) => [styles.menuRow, { backgroundColor: pressed ? alpha(colors.primary, 0.06) : 'transparent' }]}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.fuerte }}>
                  {post.allowComments ? 'Desactivar comentarios' : 'Activar comentarios'}
                </Text>
              </Pressable>
              <Pressable
                onPress={borrarPost}
                disabled={borrando}
                style={({ pressed }) => [
                  styles.menuRow,
                  { backgroundColor: pressed ? alpha(colors.danger, 0.05) : 'transparent', opacity: borrando ? 0.5 : 1 },
                ]}
              >
                <Text style={{ color: colors.danger, fontSize: 15, fontWeight: peso.maximo }}>
                  {borrando ? 'Eliminando…' : 'Eliminar publicación'}
                </Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={() => { setMenuOpen(false); setReportOpen(true); }}
              style={({ pressed }) => [styles.menuRow, { backgroundColor: pressed ? alpha(colors.danger, 0.05) : 'transparent' }]}
            >
              <Text style={{ color: colors.danger, fontSize: 15, fontWeight: peso.maximo }}>Reportar publicación</Text>
            </Pressable>
          )}
          <Pressable onPress={() => setMenuOpen(false)} style={{ paddingVertical: espaciado.e10 }}>
            <Text style={{ textAlign: 'center', color: colors.textSecondary, fontWeight: peso.maximo, fontSize: tipografia.body }}>Cancelar</Text>
          </Pressable>
        </View>
      </Modal>

      {/* ═══════ Visor completo: zoom por pinza/doble toque + pase de foto ═══════
          Parte 32: entra SIN animación (el fundido sobre negro era parte del
          parpadeo), las fotos van con caché de disco (expo-image) y la pinza
          bloquea el pase de páginas para que el zoom funcione de verdad. */}
      <Modal
        visible={viewerOpen}
        transparent
        animationType="none"
        onRequestClose={() => setViewerOpen(false)}
        statusBarTranslucent
      >
        <View style={{ flex: 1, backgroundColor: '#000000' }}>
          <FlatList
            ref={viewerListRef}
            data={mediaUrls}
            horizontal
            pagingEnabled
            /* Con la foto ampliada el arrastre mueve la imagen, no cambia de foto. */
            scrollEnabled={!viewerZoomed}
            initialScrollIndex={viewerIdx}
            getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
            keyExtractor={(u) => u}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setViewerIdx(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))}
            renderItem={({ item, index }) => (
              <ZoomableImage
                ref={(h) => { zoomHandles.current[index] = h; }}
                uri={item}
                width={SCREEN_W}
                height={SCREEN_H}
                resetKey={`${index}-${viewerIdx}`}
                blockScrollRef={viewerListRef}
                onZoomChange={index === viewerIdx ? setViewerZoomed : undefined}
                onSingleTap={() => setViewerOpen(false)}
              />
            )}
          />
          <Pressable
            onPress={() => setViewerOpen(false)}
            style={{ position: 'absolute', top: insets.top + 10, right: 16, width: 36, height: 36, borderRadius: radios.full, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}
            accessibilityLabel="Cerrar"
          >
            <X size={20} color={brand.white} />
          </Pressable>

          {/* Controles de zoom (Parte 32): funcionan aunque el gesto no salga. */}
          <ViewerZoomControls
            bottom={insets.bottom + 18}
            onZoomOut={() => zoomHandles.current[viewerIdx]?.zoomOut()}
            onFit={() => zoomHandles.current[viewerIdx]?.fit()}
            onZoomIn={() => zoomHandles.current[viewerIdx]?.zoomIn()}
          />

          {mediaUrls.length > 1 ? (
            <View style={{ position: 'absolute', bottom: insets.bottom + 18, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: radios.full, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e5 }}>
              <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: tipografia.caption }}>{viewerIdx + 1}/{mediaUrls.length}</Text>
            </View>
          ) : null}
          <Text style={{ position: 'absolute', bottom: insets.bottom + 18, right: 18, color: 'rgba(255,255,255,0.75)', fontSize: tipografia.caption, fontWeight: peso.fuerte }}>
            {viewerZoomed ? 'Doble toque: encajar' : 'Pellizca para ampliar'}
          </Text>
        </View>
      </Modal>

      {/* ═══════ Reportar (⋯ del detalle y de las tarjetas) ═══════ */}
      <ReportSheet
        post={moreRelated ?? (reportOpen ? toPostCard(post) : null)}
        onClose={() => { setReportOpen(false); setMoreRelated(null); }}
        onReport={async (postId, reason) => {
          try {
            await lifebookActionsApi.report(postId, 'post', reason);
            Alert.alert('Gracias', 'Tu reporte fue enviado. El equipo lo revisará.');
          } catch (e) {
            Alert.alert('Reportar', e instanceof Error ? e.message : 'No se pudo enviar el reporte.');
          }
        }}
        onBlocked={() => router.back()}
      />
    </KeyboardAvoidingView>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: espaciado.e12,
    paddingBottom: espaciado.e10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: espaciado.e8,
  },
  headerAuthor: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, flex: 1 },
  followBtn: { borderRadius: radios.full, paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e7 },
  hero: { height: 120, alignItems: 'center', justifyContent: 'center', gap: espaciado.e4 },
  heroType: { fontSize: tipografia.title, fontWeight: peso.titulo, letterSpacing: 2 },
  heroPrice: { fontSize: 17, fontWeight: peso.titulo },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  playCircle: {
    width: 64,
    height: 64,
    borderRadius: radios.full,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dots: { position: 'absolute', bottom: 8, alignSelf: 'center', flexDirection: 'row', gap: espaciado.e5 },
  countBadge: { position: 'absolute', top: 10, right: 12, borderRadius: radios.full, paddingHorizontal: espaciado.e9, paddingVertical: espaciado.e4 },
  dot: { width: 6, height: 6, borderRadius: radios.punta },
  postTitle: { fontSize: 18, fontWeight: peso.titulo, lineHeight: 23 },
  postBody: { fontSize: 15.5, lineHeight: 22.5, marginTop: espaciado.e8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: espaciado.e7, marginTop: espaciado.e12 },
  serviceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.e8,
    borderRadius: radios.md,
    paddingHorizontal: espaciado.e16,
    paddingVertical: espaciado.e12,
    marginTop: espaciado.e14,
  },
  panel: { borderRadius: 14, borderWidth: trazo.fino, padding: espaciado.e12, marginTop: espaciado.e14 },
  panelTitle: { fontSize: 15, fontWeight: peso.titulo },
  panelLine: { color: '#5B6470', fontSize: tipografia.body, marginTop: espaciado.e4, lineHeight: 18 },
  statsRow: { marginTop: espaciado.e14, paddingBottom: espaciado.e12, borderBottomWidth: StyleSheet.hairlineWidth },
  sectionTitle: { fontSize: 14.5, fontWeight: peso.titulo, marginTop: espaciado.e20, marginBottom: espaciado.e8 },
  epAddBtn: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, borderRadius: radios.full, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e5, marginLeft: 'auto' },
  epRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, borderRadius: radios.md, borderWidth: StyleSheet.hairlineWidth, padding: espaciado.e10, marginTop: espaciado.e8 },
  epThumb: { width: 40, height: 40, borderRadius: radios.hermano, alignItems: 'center', justifyContent: 'center' },
  masonryRow: { flexDirection: 'row', gap: COLUMN_GAP },
  masonryCol: { flex: 1, gap: COLUMN_GAP },
  menuSheet: { ...formaHoja },
  menuRow: { borderRadius: radios.md, paddingVertical: espaciado.e13, paddingHorizontal: espaciado.e12 },
});
