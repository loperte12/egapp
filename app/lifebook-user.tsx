/**
 * Life Book — PERFIL PÚBLICO (/lifebook-user?id=…).
 * Cabecera (portada + identidad), contadores, badges de rol verificado,
 * bio/enlaces, Seguir/Dejando de seguir (o Editar perfil si es propio) y
 * pestañas de contenido (Notas · Ventas · Todo) en grid de 2 columnas.
 * DISEÑO-UX-LIFEBOOK-PERFIL.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { alpha, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import {
  ArrowLeft, BadgeCheck, Bookmark, Building2, CarTaxiFront, ChevronRight, Heart, Home, MoreHorizontal,
  MapPin, Package, PenSquare, Search, Star, Store, Utensils, Users,
} from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { absUrl } from '../api/config';
import { lifebookApi, lifebookBlocksApi, lifebookChatApi, toPostCard, type LbGroupCard, type LbPostBase, type LbProfile } from '../api/lifebook';
import { gruposEnlacesApi } from '../api/lifebookGrupos';
import type { LbGroupCardConEnlace } from '../api/lifebookGrupos';
import { tiendaApi, type LbTarjetaDeTienda } from '../api/lifebookTienda';
import type { LbProductCard } from '../api/commerce';
import { lbXaf } from '../constants/lifebook';
import { lbPriceLabel } from '../constants/commerce';
import { PostCard } from '../components/lifebook/PostCard';
import { formaHoja } from '../components/lifebook/ui/Sheet';
import StatusRingAvatar from '../components/status/StatusRingAvatar';
import StatusDetailModal from '../components/status/StatusDetailModal';
import { statusApi, type UserStatus } from '../api/status';
import { useStatusStore } from '../state/statusStore';
import { useWindowDimensions } from 'react-native';
import { ir as irSeguro } from '../constants/rutas';
import { brand } from '@egrouteplan/ui-kit';

export default function LifeBookUserScreen() {
  return (
    <AuthGate>
      <UserContent />
    </AuthGate>
  );
}

const VERIFIED_CHIPS: Array<{ key: keyof LbProfile['verified']; label: string; icon: typeof Store; color: string }> = [
  { key: 'driver', label: 'Conductor', icon: CarTaxiFront, color: brand.primary },
  { key: 'seller', label: 'Tienda', icon: Store, color: brand.social },
  { key: 'food', label: 'Restaurante', icon: Utensils, color: brand.secondary },
  { key: 'work', label: 'Contratante', icon: Building2, color: brand.lifebook },
  { key: 'rental', label: 'Anfitrión', icon: Home, color: brand.success },
];

function UserContent() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const GAP = 12;
  const cellW = (width - GAP * 3) / 2;
  const { id } = useLocalSearchParams<{ id?: string }>();

  const [profile, setProfile] = useState<LbProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState('note');
  const [posts, setPosts] = useState<LbPostBase[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyFollow, setBusyFollow] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  /**
   * ── EL ESTADO 24 H DE ESTA PERSONA ─────────────────────────────────────────
   *
   * Antes **no se veía aquí, y eso convertía el estado en un diario privado**: el editor, el
   * anillo, la píldora y el modal de historia existían y se pintaban en `/profile`, `/status`,
   * `/edit-profile` y la cabecera de inicio… **siempre con `myStatus`**, o sea sólo para su
   * autor. La persona que publicaba un estado no lo enseñaba a nadie: sus seguidores no tenían
   * ningún sitio donde verlo.
   *
   * Lo tenía todo hecho menos el último cable: el servidor ya expone
   * `GET /mobility/status/users/:userId` («estado visible de un usuario», con la visibilidad ya
   * filtrada) y el cliente ya tenía `statusApi.userStatus()`. **Nadie lo llamaba.**
   *
   * Se usan DOS fuentes a propósito:
   *  · Si el perfil es el TUYO → el store (`myStatus`), que es el que se actualiza solo al
   *    publicar o finalizar desde esta misma pantalla.
   *  · Si es el de otra persona → `statusApi.userStatus()`, que respeta la visibilidad.
   */
  const { status: miEstado } = useStatusStore();
  const [estadoAjeno, setEstadoAjeno] = useState<UserStatus | null>(null);
  /** `true` mientras el detalle del estado está abierto. */
  const [estadoOpen, setEstadoOpen] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!id) { setError('Falta el usuario'); return; }
    try {
      setProfile(await lifebookApi.profile(id));
      lifebookBlocksApi.mine().then((list) => setBlocked(list.some((x) => x.id === id))).catch(() => {});
    }
    catch { setError('Usuario no encontrado'); }
  }, [id]);

  const loadPosts = useCallback(async (type: string, userId: string) => {
    setLoadingPosts(true);
    try {
      const page = await lifebookApi.userPosts(userId, { type: type || undefined, limit: 20 });
      setPosts(page.posts ?? []);
      setNextCursor(page.nextCursor ?? null);
    } catch { /* perfil sin contenido no bloquea */ }
    finally { setLoadingPosts(false); }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);
  useEffect(() => { if (profile) { setPosts([]); setNextCursor(null); loadPosts(tab, profile.id); } }, [tab, profile, loadPosts]);

  /* El estado 24 h de la persona cuyo perfil se está viendo. Si el perfil es el mío, no se pide:
     ya está en el store (y así se refresca solo al publicarlo o finalizarlo desde aquí). */
  useEffect(() => {
    const esMio = profile?.relation?.isSelf === true;
    if (!profile?.id || esMio) { setEstadoAjeno(null); return; }
    let vivo = true;
    statusApi.userStatus(profile.id)
      .then((r) => { if (vivo) setEstadoAjeno(r?.status ?? null); })
      // Si el estado falla, no puede tumbar el perfil: simplemente no hay anillo.
      .catch(() => { if (vivo) setEstadoAjeno(null); });
    return () => { vivo = false; };
  }, [profile?.id, profile?.relation?.isSelf]);

  /**
   * P3 — ENLACES DE GRUPO. Un enlace de tipo `group` no es una dirección: su valor es el
   * CÓDIGO del grupo. Para enseñarlo como tarjeta (foto, nombre y cuánta gente hay) hay
   * que pedir la ficha con ese código, y si el código ya CADUCÓ el servidor lo dice: aquí
   * se pinta «ya no sirve» en vez de una tarjeta que engañe.
   *
   * OJO: esto va ANTES de los `return` tempranos (perfil cargando / error) a propósito.
   * Los hooks de React tienen que ejecutarse siempre en el mismo orden, y más abajo hay
   * returns que cortan el render.
   */
  const enlacesGrupo = (Array.isArray(profile?.links) ? profile?.links ?? [] : [])
    .filter(Boolean)
    .map((l) => (typeof l === 'string' ? { label: l, value: l } : l) as { kind?: string; label?: string; value?: string; pinned?: boolean })
    .filter((l) => l.kind === 'group' && !!l.value)
    .map((l) => ({ code: String(l.value).trim().toUpperCase(), label: String(l.label ?? 'Grupo'), pinned: l.pinned === true }));
  const codigosGrupo = enlacesGrupo.map((g) => g.code).join(',');
  /**
   * Cada enlace de grupo, con lo que se ha podido averiguar: `card` (vivo), o `null` con el
   * MOTIVO por el que no se pudo leer.
   *
   * Antes cualquier fallo pintaba «Este enlace ya no sirve», y eso es mentira cuando el
   * fallo es un corte de red: el enlace estaba bien (comprobado contra el API: respondía
   * 200) y el perfil lo daba por muerto. Ahora se distingue por el código del error.
   */
  const [fichas, setFichas] = useState<Record<string, { card: LbGroupCardConEnlace | null; motivo: string }>>({});
  /** Sube al tocar un enlace que no se pudo comprobar: vuelve a intentarlo. */
  const [reintento, setReintento] = useState(0);
  useEffect(() => {
    if (!codigosGrupo) return;
    let vivo = true;
    void (async () => {
      for (const g of enlacesGrupo) {
        try {
          const f = await gruposEnlacesApi.porCodigo(g.code);
          if (vivo) setFichas((prev) => (prev[g.code] !== undefined ? prev : { ...prev, [g.code]: { card: f, motivo: '' } }));
        } catch (e) {
          const code = String((e as { code?: string })?.code ?? '');
          const motivo = code === 'INVITE_CODE_INVALID'
            ? 'Este enlace ya no sirve (ha caducado)'
            : code === 'INVITE_CODE_NOT_FOUND' || code === 'HTTP_404'
              ? 'Este enlace ya no existe'
              // El grupo es privado y quien mira no es miembro: reintentar no arregla nada,
              // así que NO se ofrece reintento (comprobado contra el API: 403 con el mensaje
              // «Este grupo es privado: solo se entra por invitación»).
              : code === 'GROUP_FORBIDDEN' || code === 'HTTP_403'
                ? 'Grupo privado: hace falta invitación'
                // Ni caducado, ni borrado, ni privado: no se pudo preguntar (red). Se dice tal
                // cual y se deja tocar para reintentar, en vez de acusar al enlace de muerto.
                : 'No se pudo comprobar el enlace · toca para reintentar';
          if (vivo) setFichas((prev) => (prev[g.code] !== undefined ? prev : { ...prev, [g.code]: { card: null, motivo } }));
        }
      }
    })();
    return () => { vivo = false; };
    // Solo cuando cambian los códigos del perfil (o cuando el usuario pide reintentar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigosGrupo, reintento]);

  /**
   * TANDA A — LA TARJETA DE LA TIENDA (lo que el perfil enseña entre la bio y los botones).
   *
   * Se pide al servidor en UNA petición (`/lifebook/commerce/users/:id/shop-card`) porque
   * trae de golpe el nombre comercial, el logo, la puntuación y hasta 3 destacados. Si la
   * persona no tiene tienda, el servidor responde `shop: null` y aquí simplemente no se
   * pinta NADA: la especificación pide que no quede hueco vacío.
   *
   * Va antes de los `return` tempranos por lo mismo que el bloque de grupos: los hooks de
   * React tienen que ejecutarse siempre en el mismo orden.
   */
  const [tienda, setTienda] = useState<LbTarjetaDeTienda | null>(null);
  useEffect(() => {
    const uid = profile?.id;
    if (!uid) return;
    let vivo = true;
    tiendaApi.tarjeta(uid)
      .then((t) => { if (vivo) setTienda(t); })
      .catch(() => { if (vivo) setTienda(null); });
    return () => { vivo = false; };
  }, [profile?.id]);

  /**
   * TANDA B — EL TAB «PRODUCTOS» DEL PERFIL.
   *
   * Lo que pide la especificación: dentro del perfil de una cuenta con tienda, un tab de
   * productos con una fila de CATEGORÍAS arriba («Todo» primero y seleccionada) y una rejilla
   * de dos columnas con imagen, nombre (1-2 líneas), precio en color de acento, descripción
   * corta en gris y «X vendidos» cuando lo hay. Sin puntuación del producto, sin stock y sin
   * envío: solo lo justo para decidir si se toca o se sigue bajando.
   *
   * Se cargan solo cuando se abre el tab (no al abrir el perfil): abrir un perfil no debe
   * costar la descarga de todo el catálogo de la tienda.
   */
  const [prodTienda, setProdTienda] = useState<LbProductCard[]>([]);
  const [catsTienda, setCatsTienda] = useState<{ id: string; name: string; count: number }[]>([]);
  const [totalTienda, setTotalTienda] = useState(0);
  const [catSel, setCatSel] = useState<string | null>(null);   // null = «Todo»
  const [cargandoProd, setCargandoProd] = useState(false);
  const [masProd, setMasProd] = useState(false);
  const [cursorProd, setCursorProd] = useState<string | null>(null);
  /** «Colección»: mis guardados (solo en mi propio perfil). */
  const [guardados, setGuardados] = useState<LbProductCard[]>([]);
  const [cargandoGuardados, setCargandoGuardados] = useState(false);

  const shopId = tienda?.shop?.id ?? null;

  useEffect(() => {
    if (tab !== 'productos' || !shopId) return;
    let vivo = true;
    setCargandoProd(true);
    (async () => {
      try {
        const [cats, pagina] = await Promise.all([
          tiendaApi.categorias(shopId),
          tiendaApi.productos(shopId, { categoryId: catSel, limit: 30 }),
        ]);
        if (!vivo) return;
        setCatsTienda(cats.categories ?? []);
        setTotalTienda(Number(cats.total ?? 0));
        setProdTienda(pagina.items ?? []);
        setCursorProd(pagina.nextCursor ?? null);
      } catch {
        if (vivo) { setProdTienda([]); setCursorProd(null); }
      } finally {
        if (vivo) setCargandoProd(false);
      }
    })();
    return () => { vivo = false; };
  }, [tab, shopId, catSel]);

  useEffect(() => {
    if (tab !== 'coleccion' || guardados.length) return;
    let vivo = true;
    setCargandoGuardados(true);
    tiendaApi.guardados()
      .then((r) => { if (vivo) setGuardados(r.items ?? []); })
      .catch(() => { if (vivo) setGuardados([]); })
      .finally(() => { if (vivo) setCargandoGuardados(false); });
    return () => { vivo = false; };
  }, [tab, guardados.length]);

  /** «Ver más» de la rejilla de productos (la tienda corta en 30 por página). */
  const verMasProductos = async () => {
    if (!shopId || !cursorProd || masProd) return;
    setMasProd(true);
    try {
      const p = await tiendaApi.productos(shopId, { categoryId: catSel, cursor: cursorProd, limit: 30 });
      setProdTienda((prev) => {
        const vistos = new Set(prev.map((x) => x.id));
        return [...prev, ...(p.items ?? []).filter((x) => !vistos.has(x.id))];
      });
      setCursorProd(p.nextCursor ?? null);
    } catch { /* se queda como está */ }
    finally { setMasProd(false); }
  };

  const loadMore = async () => {    if (!nextCursor || loadingMore || !profile) return;
    setLoadingMore(true);
    try {
      const page = await lifebookApi.userPosts(profile.id, { type: tab || undefined, cursor: nextCursor, limit: 20 });
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...(page.posts ?? []).filter((p) => !seen.has(p.id))];
      });
      setNextCursor(page.nextCursor ?? null);
    } catch { /* silencioso */ }
    finally { setLoadingMore(false); }
  };

  const toggleFollow = async () => {
    if (!profile || busyFollow) return;
    setBusyFollow(true);
    const was = profile.relation.isFollowing;
    setProfile({
      ...profile,
      relation: { ...profile.relation, isFollowing: !was },
      stats: { ...profile.stats, followers: Math.max(0, profile.stats.followers + (was ? -1 : 1)) },
    });
    try { await (was ? lifebookApi.unfollow(profile.id) : lifebookApi.follow(profile.id)); }
    catch {
      setProfile((p) => p && {
        ...p,
        relation: { ...p.relation, isFollowing: was },
        stats: { ...p.stats, followers: p.stats.followers },
      });
    }
    finally { setBusyFollow(false); }
  };

  const askToggleBlock = () => {
    if (!profile) return;
    Alert.alert(
      blocked ? 'Desbloquear a este usuario' : 'Bloquear a este usuario',
      blocked ? 'Volverás a ver su contenido y podrá escribirte.' : 'No verás su contenido ni podrá escribirte. Puedes desbloquearlo cuando quieras desde Ajustes.',
      [
        { text: 'Cancelar', style: 'cancel' } as never,
        {
          text: blocked ? 'Desbloquear' : 'Bloquear',
          style: blocked ? 'default' : 'destructive',
          onPress: async () => {
            try {
              if (blocked) await lifebookBlocksApi.unblock(profile.id);
              else await lifebookBlocksApi.block(profile.id);
              setBlocked(!blocked);
              setUserMenuOpen(false);
            } catch (e) {
              Alert.alert('Bloquear', e instanceof Error ? e.message : 'No se pudo completar.');
            }
          },
        } as never,
      ],
    );
  };

  const openChat = async () => {
    if (!profile) return;
    try {
      const conv = await lifebookChatApi.open(profile.id);
      irSeguro.libre('/lifebook-chat/[id]', { id: conv.id, name: profile.fullName ?? 'Chat', peerId: profile.id });
    } catch { Alert.alert('Mensajes', 'No se pudo abrir la conversación.'); }
  };

  if (error || !id) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.topBar, { borderBottomColor: colors.border, paddingTop: insets.top + 6 }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingVertical: espaciado.e4 }}><ArrowLeft size={22} color={colors.textPrimary} /></Pressable>
          <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Perfil</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaciado.e30, gap: espaciado.e6 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.cuerpo }}>{error ?? 'Perfil'}</Text>
        </View>
      </View>
    );
  }
  if (!profile) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const rel = profile.relation;
  const coverSrc = absUrl(profile.coverPhotoUrl);
  /** El estado 24 h que se pinta: el MÍO desde el store, el de otra persona desde el endpoint. */
  const estado = rel.isSelf ? miEstado : estadoAjeno;

  /**
   * El autor, traducido a la forma que pide el modal de estado (la de `MeProfile`).
   *
   * Hay que traducirlo porque **los dos endpoints devuelven tipos distintos para la misma
   * persona**: `LbProfile` (perfil público) tiene `fullName: string | null` y `role: string | null`,
   * mientras que `MeProfile` (sesión) los exige no nulos y con el rol acotado a tres valores. Se
   * hace explícito y sin `as any`: si la traducción no cuadra, el compilador lo dice.
   */
  const rolAutor: 'PASSENGER' | 'DRIVER' | 'ADMIN' =
    profile.role === 'DRIVER' || profile.role === 'ADMIN' ? profile.role : 'PASSENGER';
  const autorEstado = {
    id: profile.id,
    fullName: profile.fullName ?? '',
    avatarUrl: profile.avatarUrl,
    role: rolAutor,
    nameColor: profile.nameColor ?? undefined,
  };
  const verifiedList = VERIFIED_CHIPS.filter((v) => profile.verified[v.key]);
  /**
   * Un enlace FIJADO por su dueño. Se enseña primero y marcado con 📌.
   */
  const esFijado = (l: unknown) => !!(l && typeof l === 'object' && (l as { pinned?: boolean }).pinned === true);
  /**
   * Los enlaces, con los FIJADOS primero. Es lo que se pidió para el perfil público:
   * que cada cual pueda fijar un enlace (por ejemplo el de su grupo) y que quien entra
   * lo vea arriba, sin tener que buscarlo. El resto de enlaces se quedan igual.
   */
  const links = (Array.isArray(profile.links) ? profile.links.filter(Boolean) : [])
    .slice()
    .sort((a, b) => Number(esFijado(b)) - Number(esFijado(a)));
  /* Los enlaces de GRUPO no se pintan como chips (su valor es un código, no una
     dirección): van en su propia tarjeta, más abajo. */
  const linksChip = links.filter((l) => (typeof l === 'string' ? true : (l as { kind?: string }).kind !== 'group'));

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Barra flotante */}
      <View style={[styles.topBarFloat, { paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={[styles.roundIcon, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
          <ArrowLeft size={21} color={brand.white} />
        </Pressable>
        <View style={{ flex: 1 }} />
        {rel.isSelf && (
          <Pressable onPress={() => router.push('/edit-profile')} style={[styles.roundIcon, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
            <PenSquare size={18} color={brand.white} />
          </Pressable>
        )}
        {!rel.isSelf && (
          <Pressable onPress={() => setUserMenuOpen(true)} style={[styles.roundIcon, { backgroundColor: 'rgba(0,0,0,0.35)' }]} accessibilityLabel='Más opciones'>
            <MoreHorizontal size={20} color={brand.white} />
          </Pressable>
        )}
      </View>

      <FlatList
        /* TANDA B: la misma rejilla de dos columnas sirve para las publicaciones y para los
           productos de la tienda; solo cambia de dónde salen los datos y cómo se pinta cada
           celda. Así el tab «Productos» se ve EXACTAMENTE como el feed (que es lo que pide la
           especificación: «el mismo layout waterfall del feed principal»). */
        data={tab === 'productos' ? (prodTienda as unknown as LbPostBase[]) : tab === 'coleccion' ? (guardados as unknown as LbPostBase[]) : posts}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ paddingHorizontal: GAP, gap: GAP }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 30, flexGrow: 1, gap: GAP }}
        ListHeaderComponent={
          <View>
            {/* Portada + identidad */}
            <View style={{ height: 208 }}>
              {coverSrc ? (
                <Image source={{ uri: coverSrc }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <Svg style={StyleSheet.absoluteFill}>
                  <Defs>
                    <SvgLinearGradient id="lbCover" x1="0" y1="0" x2="1" y2="1">
                      <Stop offset="0" stopColor={brand.primary} />
                      <Stop offset="0.55" stopColor={brand.primary} />
                      <Stop offset="1" stopColor={brand.info} />
                    </SvgLinearGradient>
                  </Defs>
                  <Rect width="100%" height="100%" fill="url(#lbCover)" />
                </Svg>
              )}
              <Svg style={StyleSheet.absoluteFill}>
                <Defs>
                  <SvgLinearGradient id="lbScrim" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="transparent" />
                    <Stop offset="1" stopColor="rgba(0,0,0,0.62)" />
                  </SvgLinearGradient>
                </Defs>
                <Rect width="100%" height="100%" fill="url(#lbScrim)" />
              </Svg>
            </View>

            {/* Identidad superpuesta */}
            <View style={[styles.identity, { paddingHorizontal: espaciado.e16, marginTop: -46 }]}>
              {/* El avatar pasa a ser `StatusRingAvatar`: trae el ANILLO del estado 24 h y, si no
                  hay foto, la inicial — que es justo lo que este bloque hacía a mano. Tamaño 80
                  + 3 de anillo = 86, exactamente el avatar que había, así que el hueco no cambia.
                  El toque sólo hace algo si HAY estado: sin estado no se abre nada, y así el
                  avatar sigue siendo un avatar y no un botón que no lleva a ninguna parte. */}
              <StatusRingAvatar
                avatarUrl={profile.avatarUrl}
                name={profile.fullName}
                status={estado}
                size={80}
                ringWidth={3}
                defaultRingColor={colors.background}
                onPress={estado ? () => setEstadoOpen(true) : undefined}
              />
              <View style={{ flex: 1, paddingTop: espaciado.e4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e5 }}>
                  <Text numberOfLines={2} style={[styles.fullName, { color: profile.nameColor || colors.textPrimary }]}>
                    {profile.fullName ?? 'Usuario'}
                  </Text>
                  {verifiedList.length > 0 && <BadgeCheck size={18} color={brand.primary} fill={brand.primary} stroke={brand.white} strokeWidth={2.5} />}
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 1 }}>
                  {[profile.profession, profile.school].filter(Boolean).join(' · ') || (rel.isSelf ? 'Tu perfil' : 'Miembro de Life Book')}
                </Text>
                {profile.city ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e3, marginTop: espaciado.e2 }}>
                    <MapPin size={11} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
                      {[profile.country, profile.city].filter(Boolean).join(' · ')}
                    </Text>
                  </View>
                ) : null}
                {verifiedList.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e5, marginTop: espaciado.e6 }}>
                    {verifiedList.map((v) => {
                      const Icon = v.icon;
                      return (
                        <View key={v.key} style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e3, backgroundColor: alpha(v.color, 0.12), borderRadius: radios.full, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3 }}>
                          <Icon size={11} color={v.color} />
                          <Text style={{ color: v.color, fontSize: tipografia.micro, fontWeight: peso.titulo }}>{v.label} ✓</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>

            {/* Stats */}
            <View style={[styles.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {[
                { n: profile.stats.posts, l: 'Publicaciones', Icon: Bookmark },
                { n: profile.stats.followers, l: 'Seguidores', Icon: Users },
                { n: profile.stats.following, l: 'Seguidos', Icon: Users },
                { n: profile.stats.likes, l: 'Me gusta', Icon: Heart },
              ].map((s, i) => {
                const Icon = s.Icon;
                return (
                  <View key={s.l} style={[styles.stat, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.border }]}>
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.anchoFuerte, fontWeight: peso.titulo }}>{s.n}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e3, marginTop: 1 }}>
                      <Icon size={10.5} color={colors.textSecondary} />
                      <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.minimo, fontWeight: peso.fuerte }}>{s.l}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Bio — SE HA SUBIDO aquí arriba (antes iba DEBAJO de los botones) para que la
                tarjeta de la tienda quede donde pide la especificación: entre la bio y los
                botones de seguir/mensaje. Tal como estaba, ese hueco no existía. */}
            {profile.bio ? (
              <View style={{ paddingHorizontal: espaciado.e16, marginTop: espaciado.e12 }}>
                <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, lineHeight: 20 }}>{profile.bio}</Text>
              </View>
            ) : null}

            {/* TANDA A — TARJETA DE LA TIENDA. Es un atajo, no un destino: tocar la cabecera
                abre la tienda; tocar una miniatura abre la tienda POSICIONADA en ese
                producto (no la ficha del producto). */}
            {tienda?.shop ? (
              <View style={{ paddingHorizontal: espaciado.e16, marginTop: espaciado.e12 }}>
                <View style={[styles.tiendaCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Pressable
                    onPress={() => irSeguro.libre('/lifebook-shop/[id]', { id: tienda.shop!.id })}
                    accessibilityLabel={`Abrir la tienda ${tienda.shop.name}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}
                  >
                    {tienda.shop.logoUrl ? (
                      <Image source={{ uri: absUrl(tienda.shop.logoUrl) }} style={styles.tiendaLogo} />
                    ) : (
                      <View style={[styles.tiendaLogo, { backgroundColor: alpha(colors.primary, 0.12), alignItems: 'center', justifyContent: 'center' }]}>
                        <Store size={16} color={colors.primary} />
                      </View>
                    )}
                    <Text numberOfLines={1} style={{ flex: 1, color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.titulo }}>
                      {tienda.shop.name}
                    </Text>
                    {/* ★ SOLO si hay reseñas. Sin ninguna NO se pinta puntuación: ni «0
                        estrellas» ni un hueco. Por eso se mira `ratingCount`, no `rating`
                        (hoy hay 116 productos con `rating` y 0 reseñas). */}
                    {tienda.shop.ratingCount > 0 ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e3 }}>
                        <Star size={13} color={brand.warning} fill={brand.warning} />
                        <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>
                          {tienda.shop.rating.toFixed(1)}
                        </Text>
                      </View>
                    ) : null}
                    <ChevronRight size={16} color={colors.textSecondary} />
                  </Pressable>

                  {tienda.featured.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espaciado.e8, paddingTop: espaciado.e10 }}>
                      {tienda.featured.map((f) => (
                        <Pressable
                          key={f.id}
                          onPress={() => irSeguro.libre('/lifebook-shop/[id]', { id: tienda.shop!.id, product: f.id })}
                          accessibilityLabel={`${f.title}: verlo en la tienda`}
                          style={{ width: 96 }}
                        >
                          <View style={styles.tiendaThumb}>
                            {f.coverUrl ? (
                              <Image source={{ uri: absUrl(f.coverUrl) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                            ) : (
                              <View style={[StyleSheet.absoluteFill, { backgroundColor: alpha(colors.primary, 0.08), alignItems: 'center', justifyContent: 'center' }]}>
                                <Package size={18} color={alpha(colors.primary, 0.5)} />
                              </View>
                            )}
                            {/* El precio ENCIMA de la foto sobre un badge oscuro
                                semitransparente, para que se lea sobre cualquier imagen. */}
                            <View style={styles.tiendaPrecio}>
                              <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: peso.titulo }}>
                                {lbPriceLabel(f.priceXaf, f.priceMode, lbXaf)}
                              </Text>
                            </View>
                          </View>
                          <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e4 }}>
                            {f.title}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  ) : null}
                </View>
              </View>
            ) : null}

            {/* Acciones */}
            <View style={{ paddingHorizontal: espaciado.e16, marginTop: espaciado.e12 }}>
              {rel.isSelf ? (
                <>
                  <Pressable onPress={() => router.push('/edit-profile')} style={[styles.mainBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <PenSquare size={16} color={colors.textPrimary} />
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.fino, fontWeight: peso.titulo }}>Editar perfil</Text>
                  </Pressable>
                  <View style={{ flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e8 }}>
                    <Pressable onPress={() => irSeguro.libre('/lifebook-orders')} style={[styles.mainBtn, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>📦 Pedidos</Text>
                    </Pressable>
                    <Pressable onPress={() => irSeguro.libre('/lifebook-messages')} style={[styles.mainBtn, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>💬 Mensajes</Text>
                    </Pressable>
                  </View>
                  {/* MERCADO (tanda F): los otros dos accesos rápidos del comprador que YA existen.
                      «Carrito» estaba solo dentro de la ficha de un producto y el historial no tenía
                      puerta. NO hay botón de «Cupones»: desde la tanda Q los cupones se recogen y se
                      aplican EN LA CAJA (con su código), así que una pantalla aparte todavía no
                      tiene nada que enseñar; un botón que no lleva a nada es una trampa. */}
                  <View style={{ flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e8 }}>
                    <Pressable onPress={() => irSeguro.libre('/lifebook-carrito')} style={[styles.mainBtn, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>🛒 Carrito</Text>
                    </Pressable>
                    <Pressable onPress={() => irSeguro.libre('/lifebook-vistos')} style={[styles.mainBtn, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>🕘 Vistos</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <View style={{ flexDirection: 'row', gap: espaciado.e8 }}>
                  <Pressable onPress={toggleFollow} style={[styles.mainBtn, { flex: 1.4, backgroundColor: rel.isFollowing ? colors.surface : colors.primary, borderColor: rel.isFollowing ? colors.border : colors.primary }]}>
                    {busyFollow ? <ActivityIndicator size="small" color={rel.isFollowing ? colors.textPrimary : brand.white} /> : (
                      <>
                        <Heart size={15} color={rel.isFollowing ? colors.textPrimary : brand.white} fill={rel.isFollowing ? 'transparent' : brand.white} />
                        <Text style={{ color: rel.isFollowing ? colors.textPrimary : brand.white, fontSize: tipografia.fino, fontWeight: peso.titulo }}>
                          {rel.isFollowing ? 'Siguiendo' : 'Seguir'}
                        </Text>
                      </>
                    )}
                  </Pressable>
                  <Pressable onPress={openChat} style={[styles.mainBtn, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>💬 Mensaje</Text>
                  </Pressable>
                </View>
              )}
              {!rel.isSelf && profile.verified.seller && (
                <Pressable
                  onPress={() => irSeguro.libre('/lifebook-store', { sellerId: profile.id })}
                  style={[styles.mainBtn, { marginTop: espaciado.e8, backgroundColor: alpha(colors.secondary, 0.1), borderColor: alpha(colors.secondary, 0.4) }]}
                >
                  <Text style={{ color: colors.secondary, fontSize: tipografia.body, fontWeight: peso.titulo }}>🛍 Ver tienda</Text>
                </Pressable>
              )}
            </View>

            {profile.ratingAvg != null && profile.ratingAvg > 0 ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, paddingHorizontal: espaciado.e16, marginTop: espaciado.e8 }}>
                <Star size={13} color={brand.warning} fill={brand.warning} />
                <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.body }}>{profile.ratingAvg.toFixed(1)}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>valoración</Text>
              </View>
            ) : null}
            {/* P3 — ENLACES DE GRUPO: tarjeta con la foto y el nombre del grupo. Se toca y
                lleva a la ficha del grupo (donde ya se une uno, se pide entrar o se
                responde la pregunta), reutilizando la pantalla de Descubrir grupos con el
                código puesto: así no hay dos maneras distintas de entrar a un grupo. */}
            {enlacesGrupo.length > 0 && (
              <View style={{ paddingHorizontal: espaciado.e16, marginTop: espaciado.e10, gap: espaciado.e8 }}>
                {enlacesGrupo.map((g) => {
                  const ficha = fichas[g.code];
                  const cargando = ficha === undefined;
                  const card = ficha?.card ?? null;
                  const vivo = !!card;
                  const sePuedeReintentar = !cargando && !vivo && /reintentar/i.test(ficha?.motivo ?? '');
                  return (
                    <Pressable
                      key={g.code}
                      disabled={!vivo && !sePuedeReintentar}
                      onPress={() => {
                        // Si solo falló la comprobación, el toque REINTENTA (no navega).
                        if (!vivo) {
                          setFichas((prev) => { const c = { ...prev }; delete c[g.code]; return c; });
                          setReintento((n) => n + 1);
                          return;
                        }
                        irSeguro.libre('/lifebook-groups', { code: g.code });
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={vivo ? `Abrir el grupo ${card?.title ?? g.label}` : (ficha?.motivo || 'Enlace de grupo')}
                      style={({ pressed }) => [{
                        flexDirection: 'row' as const, alignItems: 'center' as const, gap: espaciado.e10,
                        backgroundColor: colors.surface, borderRadius: radios.campo, padding: espaciado.e10,
                        opacity: pressed ? 0.8 : 1,
                        /* Fijado: se distingue igual que los chips fijados. */
                        ...(g.pinned ? { borderWidth: trazo.fino, borderColor: colors.primary } : {}),
                      }]}
                    >
                      {card?.photoUrl ? (
                        <Image source={{ uri: absUrl(card.photoUrl) }} style={{ width: 44, height: 44, borderRadius: radios.md }} />
                      ) : (
                        <View style={{ width: 44, height: 44, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.primary, 0.12) }}>
                          <Users size={22} color={colors.primary} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }} numberOfLines={1}>
                          {g.pinned ? '📌 ' : ''}{card?.title ?? g.label}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }} numberOfLines={1}>
                          {cargando
                            ? 'Comprobando el enlace…'
                            : vivo
                              /* El MODO DE ENTRADA importa antes de tocar: si hay que pedir
                                 permiso o responder una pregunta, el visitante debe saberlo
                                 aquí y no después de pulsar. El dato ya venía en la ficha
                                 (`joinMode`) y la etiqueta ya estaba escrita en
                                 `GroupCardSheet`: solo no se pintaba. */
                              ? `${card!.membersCount} ${card!.membersCount === 1 ? 'miembro' : 'miembros'} · ${
                                  card!.joinMode === 'open' ? 'entrada libre'
                                    : card!.joinMode === 'approval' ? 'con aprobación'
                                      : 'con pregunta'
                                }`
                              : (ficha?.motivo ?? 'Este enlace ya no sirve (ha caducado)')}
                        </Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
            {linksChip.length > 0 && (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6, paddingHorizontal: espaciado.e16, marginTop: espaciado.e10 }}>
                {linksChip.map((l, i) => {
                  /* ESTABA ROTO: el editor de perfil guarda `{kind,label,value}` y aquí se
                     leía `l.url`, que no existe nunca → el enlace salía VACÍO y, además,
                     el chip era un `View` sin `Pressable`, así que no se podía tocar. O
                     sea: en el perfil público los enlaces eran decorativos. Se aceptan
                     las dos formas (`value` y `url`) y si es una dirección se abre. */
                  const o = (typeof l === 'string' ? { label: l, value: l } : l) as { kind?: string; label?: string; value?: string; url?: string };
                  const label = String(o?.label ?? o?.value ?? o?.url ?? '');
                  const destino = String(o?.value ?? o?.url ?? '');
                  /* Se aceptan los tres casos que hay de verdad:
                     · una dirección web (http/https),
                     · un `mailto:`/`tel:` ya escrito así,
                     · y un CORREO SUELTO — que es justo el ÚNICO enlace que existe hoy
                       en la base (`{"kind":"email","label":"EgRoutePlan",
                       "value":"egrouteplan@gmail.com"}`), y que con la comprobación
                       anterior se quedaba sin poder abrir. */
                  const href = /^(https?:\/\/|mailto:|tel:)/i.test(destino)
                    ? destino
                    : (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destino) ? `mailto:${destino}` : '');
                  const abrible = !!href;
                  const chip = (
                    <View style={{
                      backgroundColor: colors.surface, borderRadius: radios.full, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e5,
                      /* Los fijados se distinguen del resto: borde del color de marca. */
                      ...(esFijado(o) ? { borderWidth: trazo.fino, borderColor: colors.primary } : {}),
                    }}>
                      <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.fuerte }} numberOfLines={1}>
                        {esFijado(o) ? '📌 ' : ''}{label}{abrible ? ' ↗' : ''}
                      </Text>
                    </View>
                  );
                  return abrible ? (
                    <Pressable
                      key={i}
                      onPress={() => { Linking.openURL(href).catch(() => {}); }}
                      accessibilityRole="link"
                      accessibilityLabel={`Abrir ${label}`}
                    >
                      {chip}
                    </Pressable>
                  ) : (
                    <View key={i}>{chip}</View>
                  );
                })}
              </View>
            )}

            {/* Pestañas. TANDA B: en una cuenta con tienda se añade «Productos» justo después
                de «Notas» (y «Colección» —mis guardados— solo en MI perfil), que es lo que
                pide la especificación. Se CONSERVAN las pestañas que ya existían (Videos,
                Podcasts, Series, Ventas) porque esta app tiene contenido que Xiaohongshu no
                tiene: quitarlas escondería publicaciones que hoy se pueden ver. A la derecha
                del todo, la lupa. */}
            <View style={{ borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center' }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espaciado.e8, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e10 }} style={{ flex: 1 }}>
                {[
                  { id: 'note', label: 'Notas' },
                  ...(shopId ? [{ id: 'productos', label: 'Productos' }] : []),
                  { id: 'video', label: 'Videos' },
                  { id: 'podcast', label: 'Podcasts' },
                  { id: 'serie', label: 'Series' },
                  { id: 'sale', label: 'Ventas' },
                  ...(rel.isSelf ? [{ id: 'coleccion', label: 'Colección' }] : []),
                  { id: '', label: 'Todo' },
                ].map((t) => {
                  const on = tab === t.id;
                  return (
                    <Pressable
                      key={t.label}
                      onPress={() => setTab(t.id)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      style={[styles.tabPill, { backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border }]}
                    >
                      <Text style={{ color: on ? brand.white : colors.textSecondary, fontSize: tipografia.body, fontWeight: on ? peso.titulo : peso.fuerte }}>{t.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              <Pressable
                onPress={() => router.push({ pathname: '/lifebook-catalog', params: shopId ? { shopId } : {} } as never)}
                hitSlop={10}
                accessibilityLabel="Buscar productos"
                style={{ paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e10 }}
              >
                <Search size={18} color={colors.textSecondary} />
              </Pressable>
            </View>

            {/* TANDA B — fila de CATEGORÍAS del tab «Productos»: «Todo» primero y seleccionada
                por defecto, y solo las categorías que esta tienda usa de verdad. */}
            {tab === 'productos' && catsTienda.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espaciado.e8, paddingHorizontal: espaciado.e14, paddingTop: espaciado.e10 }}>
                {[{ id: null as string | null, label: `Todo${totalTienda ? ` (${totalTienda})` : ''}` },
                  ...catsTienda.map((c) => ({ id: c.id as string | null, label: `${c.name} (${c.count})` }))].map((c) => {
                  const on = catSel === c.id;
                  return (
                    <Pressable
                      key={c.label}
                      onPress={() => setCatSel(c.id)}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`Categoría ${c.label}`}
                      style={[styles.tabPill, { backgroundColor: on ? alpha(colors.primary, 0.15) : colors.surface, borderColor: on ? colors.primary : colors.border }]}
                    >
                      <Text style={{ color: on ? colors.primary : colors.textSecondary, fontSize: tipografia.caption, fontWeight: on ? peso.titulo : peso.fuerte }}>{c.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
            {loadingPosts && posts.length === 0 ? (
              <ActivityIndicator color={colors.primary} style={{ marginTop: espaciado.e30 }} />
            ) : null}
          </View>
        }
        renderItem={({ item }) =>
          tab === 'productos' || tab === 'coleccion' ? (
            <TarjetaProducto
              producto={item as unknown as LbProductCard}
              colors={colors}
              ancho={cellW}
              onPress={() => irSeguro.libre('/lifebook-product/[id]', { id: item.id })}
            />
          ) : (
            <PostCard post={toPostCard(item)} width={cellW} onPress={(pid) => router.push({ pathname: '/lifebook-post/[id]', params: { id: pid } })} />
          )
        }
        onEndReached={tab === 'productos' ? verMasProductos : loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          !loadingPosts && posts.length === 0 ? (
            <View style={{ alignItems: 'center', paddingTop: 44, gap: espaciado.e6 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.cuerpo }}>
                {tab === 'productos' ? 'Sin productos' : tab === 'coleccion' ? 'Sin guardados' : tab === 'note' ? 'Sin notas' : tab === 'video' ? 'Sin videos' : tab === 'podcast' ? 'Sin podcasts' : tab === 'serie' ? 'Sin series' : tab === 'sale' ? 'Sin ventas' : 'Sin publicaciones'}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', paddingHorizontal: espaciado.e30 }}>
                {tab === 'productos' ? 'Esta tienda no tiene productos en esta categoría.' : tab === 'coleccion' ? 'Guarda productos con el marcador y aparecerán aquí.' : rel.isSelf ? 'Publica algo para que tu ciudad te vea.' : 'Este perfil todavía no ha publicado aquí.'}
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={
          (tab === 'productos' && cursorProd) || masProd ? (
            <Pressable
              onPress={() => void verMasProductos()}
              disabled={masProd}
              accessibilityLabel="Ver más productos"
              style={{ alignItems: 'center', paddingVertical: espaciado.e16 }}
            >
              {masProd
                ? <ActivityIndicator color={colors.primary} />
                : <Text style={{ color: colors.primary, fontWeight: peso.titulo, fontSize: tipografia.body }}>Ver más productos</Text>}
            </Pressable>
          ) : loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: espaciado.e16 }} /> : <View style={{ height: 8 }} />
        }
      />

      {/* Menú ⋯ del perfil ajeno */}
      <Modal visible={userMenuOpen} transparent animationType="fade" onRequestClose={() => setUserMenuOpen(false)} statusBarTranslucent>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setUserMenuOpen(false)} />
        <View style={[styles.userMenuSheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
          <Pressable
            onPress={askToggleBlock}
            style={({ pressed }) => [styles.userMenuRow, { backgroundColor: pressed ? alpha(colors.danger, 0.05) : 'transparent' }]}
          >
            <Text style={{ color: blocked ? colors.primary : colors.danger, fontSize: tipografia.cuerpo, fontWeight: peso.maximo }}>
              {blocked ? 'Desbloquear usuario' : 'Bloquear usuario'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => { setUserMenuOpen(false); irSeguro.libre('/lifebook-blocks'); }}
            style={({ pressed }) => [styles.userMenuRow, { backgroundColor: pressed ? alpha(colors.primary, 0.06) : 'transparent' }]}
          >
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.cuerpo, fontWeight: peso.fuerte }}>Usuarios bloqueados</Text>
          </Pressable>
          <Pressable onPress={() => setUserMenuOpen(false)} style={{ paddingVertical: espaciado.e10 }}>
            <Text style={{ textAlign: 'center', color: colors.textSecondary, fontWeight: peso.maximo, fontSize: tipografia.body }}>Cancelar</Text>
          </Pressable>
        </View>
      </Modal>

      {/* ── ESTADO 24 H EN GRANDE ───────────────────────────────────────────────────
          Es la MISMA vista de historia que ya usaba el dueño desde su perfil, sin duplicar nada.

          `isMine` se pasa EXPLÍCITAMENTE y no se deja al aire: dentro del componente hay
          `const mine = isMine ?? !author`, o sea que si no se le dice nada, **asume que el estado
          es tuyo** y te ofrece «finalizar». En el perfil de otra persona eso sería darle a un
          visitante el botón de terminar el estado ajeno. Con `isMine={rel.isSelf}` y el `author`
          del perfil, cada uno ve lo que le toca: el dueño finaliza, el visitante reporta. */}
      {estado ? (
        <StatusDetailModal
          visible={estadoOpen}
          status={estado}
          author={autorEstado}
          isMine={rel.isSelf}
          onClose={() => setEstadoOpen(false)}
          onEnded={() => { setEstadoAjeno(null); setEstadoOpen(false); }}
        />
      ) : null}
    </View>
  );
}

/**
 * TANDA B — la celda de la rejilla de productos del perfil.
 *
 * Lo que pide la especificación, ni una cosa más: imagen, nombre (1-2 líneas, cortado con
 * puntos suspensivos), precio en el color de acento, descripción corta en gris y «X vendidos»
 * cuando lo hay. **No** se pinta la puntuación del producto, ni el stock, ni el envío: solo lo
 * justo para decidir si se toca o se sigue bajando. La descripción corta la escribe el
 * comerciante al publicar (`products.short_description`), así que no hay que recortarla.
 */
function TarjetaProducto({ producto, colors, ancho, onPress }: {
  producto: LbProductCard;
  colors: { primary: string; card: string; border: string; textPrimary: string; textSecondary: string };
  ancho: number;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={producto.title}
      style={{ width: ancho, backgroundColor: colors.card, borderRadius: radios.campo, borderWidth: trazo.fino, borderColor: alpha(colors.border, 0.5), padding: espaciado.e8 }}
    >
      {producto.coverUrl ? (
        <Image source={{ uri: absUrl(producto.coverUrl) }} style={styles.prodImg} resizeMode="cover" />
      ) : (
        <View style={[styles.prodImg, { alignItems: 'center', justifyContent: 'center' }]}>
          <Package size={20} color={alpha(colors.primary, 0.5)} />
        </View>
      )}
      <Text numberOfLines={2} style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e6 }}>
        {producto.title}
      </Text>
      <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.titulo, marginTop: espaciado.e3 }}>
        {lbPriceLabel(producto.priceXaf, producto.priceMode, lbXaf)}
      </Text>
      {producto.shortDescription ? (
        <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e2 }}>
          {producto.shortDescription}
        </Text>
      ) : null}
      {producto.salesCount > 0 ? (
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.fuerte, marginTop: espaciado.e2 }}>
          {producto.salesCount} vendido{producto.salesCount === 1 ? '' : 's'}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /* ── Tanda B: la celda de producto de la rejilla ──────────────────────────────── */
  prodImg: { width: '100%', aspectRatio: 1, borderRadius: radios.md, backgroundColor: 'rgba(0,0,0,0.04)' },

  /* ── Tanda A: la tarjeta de la tienda ─────────────────────────────────────────── */
  tiendaCard: { borderWidth: trazo.fino, borderRadius: radios.campo, padding: espaciado.e10 },
  tiendaLogo: { width: 30, height: 30, borderRadius: radios.sm },
  /* Miniatura CASI cuadrada (la especificación pide «cuadradas o casi»). 96×96 para que
     quepan tres y se vea que hay más desplazando. */
  tiendaThumb: {
    width: 96, height: 96, borderRadius: radios.chip, overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  /* El precio va ENCIMA de la foto, en la esquina inferior, con fondo oscuro
     semitransparente para que se lea sobre una foto clara o oscura. */
  tiendaPrecio: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: espaciado.e6, paddingVertical: espaciado.e3,
    alignItems: 'center',
  },

  topBar: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingHorizontal: espaciado.e12, paddingBottom: espaciado.e8, borderBottomWidth: StyleSheet.hairlineWidth },
  topTitle: { fontSize: tipografia.subtitle, fontWeight: peso.titulo, flex: 1 },
  topBarFloat: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 5, flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e12 },
  roundIcon: { width: 36, height: 36, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center' },
  identity: { flexDirection: 'row', gap: espaciado.e12 },
  avatar: { width: 86, height: 86, borderRadius: radios.full, borderWidth: trazo.anillo },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  fullName: { fontSize: tipografia.title, fontWeight: peso.titulo, flexShrink: 1 },
  statsRow: { flexDirection: 'row', marginHorizontal: espaciado.e16, marginTop: espaciado.e12, borderRadius: radios.campo, borderWidth: StyleSheet.hairlineWidth, paddingVertical: espaciado.e10 },
  stat: { flex: 1, alignItems: 'center' },
  mainBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e7, borderRadius: radios.full, paddingVertical: espaciado.e11, borderWidth: trazo.fino, borderColor: 'transparent' },
  tabs: { flexDirection: 'row', marginTop: espaciado.e14, borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, alignItems: 'center', paddingVertical: espaciado.e10 },
  tabPill: { borderRadius: radios.full, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e7, borderWidth: trazo.fino, borderColor: 'transparent' },
  userMenuSheet: { ...formaHoja },
  userMenuRow: { borderRadius: radios.md, paddingVertical: espaciado.e13, paddingHorizontal: espaciado.e12 },
});



