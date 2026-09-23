/**
 * Life Book — EXPLORAR (/lifebook-explore)
 *
 * Grid de descubrimiento con datos REALES (no mock):
 *  - Buscador (abre la pantalla de búsqueda con tendencias y sugerencias).
 *  - Filtros: tipo de publicación (hoja) + ciudad (chips).
 *  - Canales en una fila horizontal (los 13 del feed).
 *  - Masonry de 2 columnas con `PostCard` v2, pull-to-refresh y paginación.
 *
 * API: GET /lifebook/posts/feed?channel=&city=&type=&cursor=&limit=
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { alpha, useTheme, brand, tipografia, radios } from '@egrouteplan/ui-kit';
import { RefreshCw, Search, SlidersHorizontal, X } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { Alert } from 'react-native';
import {
  lifebookActionsApi, lifebookApi,
  LB_CARD_DEFAULT_RATIO, toPostCard,
  type LbPostBase, type LbPostCard,
} from '../api/lifebook';
import { LB_CHANNELS, LB_CITIES } from '../constants/lifebook';
import { PostCard } from '../components/lifebook/PostCard';
import { ReportSheet } from '../components/lifebook/ReportSheet';
import { formaHoja } from '../components/lifebook/ui/Sheet';
import DockFooter, { DOCK_BODY_H, type FooterTab } from '../components/FloatingFooter';
import { useAppDock } from '../core/useAppDock';

/** Filtros de tipo reales del feed (`type`). */
const TYPE_FILTERS = [
  { id: '', label: 'Todo' },
  { id: 'note', label: 'Notas' },
  { id: 'video', label: 'Vídeos' },
  { id: 'podcast', label: 'Podcasts' },
  { id: 'serie', label: 'Series' },
  { id: 'sale', label: 'Ventas' },
  { id: 'service', label: 'Servicios' },
  { id: 'debate', label: 'Debates' },
] as const;

export default function LifeBookExploreScreen() {
  return (
    <AuthGate>
      <ExploreContent />
    </AuthGate>
  );
}

function ExploreContent() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const navigate = useAppDock('lifebook');

  const GAP = 8;
  const PADDING = 12;
  const colWidth = Math.floor((screenW - PADDING * 2 - GAP) / 2);

  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState('for_you');
  const [city, setCity] = useState<string | null>(null);
  const [type, setType] = useState<string>('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [posts, setPosts] = useState<LbPostCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<LbPostCard | null>(null);

  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /* ── Carga real desde el feed ── */
  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (busy.current) return;
    busy.current = true;
    if (mode === 'initial') setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const page = await lifebookApi.feed(channel, {
        city: city ?? undefined,
        type: type || undefined,
        limit: 20,
      });
      if (!mounted.current) return;
      setPosts((page.posts ?? []).map(toPostCard));
      setCursor(page.nextCursor ?? null);
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'No se pudo cargar');
    } finally {
      busy.current = false;
      if (mounted.current) { setLoading(false); setRefreshing(false); }
    }
  }, [channel, city, type]);

  useEffect(() => { load('initial'); }, [load]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore || busy.current) return;
    setLoadingMore(true);
    try {
      const page = await lifebookApi.feed(channel, { city: city ?? undefined, type: type || undefined, cursor, limit: 20 });
      if (!mounted.current) return;
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...(page.posts ?? []).map(toPostCard).filter((p) => !seen.has(p.id))];
      });
      setCursor(page.nextCursor ?? null);
    } catch { /* silencioso */ }
    finally { if (mounted.current) setLoadingMore(false); }
  }, [channel, city, type, cursor, loadingMore]);

  /* ── Filtro de texto en cliente sobre lo ya cargado ── */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return posts;
    return posts.filter((p) => `${p.title} ${p.body ?? ''} ${p.topicLabel ?? ''} ${p.author?.name ?? ''}`
      .toLowerCase().includes(q));
  }, [posts, query]);

  /* ── Masonry (mismo reparto por altura que el feed) ── */
  const { leftCol, rightCol } = useMemo(() => {
    const left: LbPostCard[] = [];
    const right: LbPostCard[] = [];
    let hL = 0;
    let hR = 0;
    for (const p of visible) {
      const h = colWidth / (p.media?.aspectRatio ?? LB_CARD_DEFAULT_RATIO) + 78;
      if (hL <= hR) { left.push(p); hL += h; } else { right.push(p); hR += h; }
    }
    return { leftCol: left, rightCol: right };
  }, [visible, colWidth]);

  const onDockNavigate = (t: FooterTab) => navigate(t);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {/* Header: buscar + filtros */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.push('/lifebook-search' as never)}
          style={[styles.searchBox, { backgroundColor: colors.surface }]}
          accessibilityRole="search"
          accessibilityLabel="Buscar en Life Book"
        >
          <Search size={16} color={colors.textSecondary} />
          <Text style={{ flex: 1, marginLeft: 6, color: colors.textSecondary, fontSize: tipografia.body }}>
            {query || 'Buscar comida, taxi, debates…'}
          </Text>
        </Pressable>
        <Pressable
          style={styles.filterBtn}
          hitSlop={8}
          onPress={() => setFiltersOpen(true)}
          accessibilityLabel="Filtros"
        >
          <SlidersHorizontal size={18} color={type ? colors.primary : colors.textPrimary} />
        </Pressable>
      </View>

      {/* Canales */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 44, flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
      >
        {LB_CHANNELS.map((c) => {
          const active = channel === c.id;
          const Icon = c.icon;
          return (
            <Pressable
              key={c.id}
              onPress={() => setChannel(c.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.chipChannel, { backgroundColor: active ? c.color : colors.surface }]}
            >
              <Icon size={13} color={active ? brand.white : colors.textSecondary} />
              <Text style={{ color: active ? brand.white : colors.textPrimary, fontSize: tipografia.caption, fontWeight: '600', marginLeft: 4 }}>
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Ciudades */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 38, flexGrow: 0 }}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 6, marginTop: 6, alignItems: 'center' }}
      >
        <Pressable
          onPress={() => setCity(null)}
          style={[styles.chipCity, { backgroundColor: city === null ? colors.primary : colors.surface }]}
        >
          <Text style={{ color: city === null ? brand.white : colors.textSecondary, fontSize: tipografia.micro, fontWeight: '600' }}>Todas</Text>
        </Pressable>
        {LB_CITIES.map((c) => {
          const active = city === c;
          return (
            <Pressable
              key={c}
              onPress={() => setCity(active ? null : c)}
              style={[styles.chipCity, { backgroundColor: active ? colors.primary : colors.surface }]}
            >
              <Text style={{ color: active ? brand.white : colors.textSecondary, fontSize: tipografia.micro, fontWeight: '600' }}>{c}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Filtro activo */}
      {type ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, marginTop: 8 }}>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
            Filtro: {TYPE_FILTERS.find((f) => f.id === type)?.label}
          </Text>
          <Pressable onPress={() => setType('')} hitSlop={8} accessibilityLabel="Quitar filtro">
            <X size={13} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      {/* Grid */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={{ color: colors.danger, fontSize: tipografia.body, fontWeight: '700', textAlign: 'center', paddingHorizontal: 30 }}>{error}</Text>
          <Pressable onPress={() => load('initial')} style={[styles.retry, { backgroundColor: colors.surface }]}>
            <RefreshCw size={15} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '800', fontSize: tipografia.body }}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={[{ left: leftCol, right: rightCol }]}
          keyExtractor={() => 'explore'}
          renderItem={({ item }) => (
            <View style={styles.masonryRow}>
              <View style={styles.masonryCol}>
                {item.left.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    width={colWidth}
                    onPress={(id) => router.push({ pathname: '/lifebook-post/[id]', params: { id } })}
                    onMore={setReportTarget}
                  />
                ))}
              </View>
              <View style={styles.masonryCol}>
                {item.right.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    width={colWidth}
                    onPress={(id) => router.push({ pathname: '/lifebook-post/[id]', params: { id } })}
                    onMore={setReportTarget}
                  />
                ))}
              </View>
            </View>
          )}
          contentContainerStyle={{ padding: PADDING, paddingBottom: DOCK_BODY_H + insets.bottom + 16, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          refreshing={refreshing}
          onRefresh={() => load('refresh')}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, textAlign: 'center' }}>
                {query.trim()
                  ? `Nada coincide con “${query.trim()}”.`
                  : 'Aún no hay publicaciones en este canal'}
              </Text>
            </View>
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 14 }} /> : null}
        />
      )}

      {/* Hoja de filtros (tipo de publicación) */}
      <Modal visible={filtersOpen} transparent animationType="slide" onRequestClose={() => setFiltersOpen(false)} statusBarTranslucent>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={() => setFiltersOpen(false)} />
        <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 18 }]}>
          <View style={styles.sheetHeader}>
            <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '900', flex: 1 }}>Filtrar por tipo</Text>
            <Pressable onPress={() => setFiltersOpen(false)} hitSlop={10}><X size={20} color={colors.textSecondary} /></Pressable>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TYPE_FILTERS.map((f) => {
              const active = type === f.id;
              return (
                <Pressable
                  key={f.id || 'all'}
                  onPress={() => { setType(f.id); setFiltersOpen(false); }}
                  style={[styles.typeChip, { backgroundColor: active ? colors.primary : alpha(colors.textSecondary, 0.08) }]}
                >
                  <Text style={{ color: active ? brand.white : colors.textPrimary, fontSize: tipografia.body, fontWeight: active ? '800' : '600' }}>{f.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>

      <DockFooter active="lifebook" onNavigate={onDockNavigate} showUnreadBadge />

      <ReportSheet
        post={reportTarget}
        onClose={() => setReportTarget(null)}
        onReport={async (postId, reason) => {
          try {
            await lifebookActionsApi.report(postId, 'post', reason);
            Alert.alert('Gracias', 'Tu reporte fue enviado. El equipo lo revisará.');
          } catch (e) {
            Alert.alert('Reportar', e instanceof Error ? e.message : 'No se pudo enviar el reporte.');
          }
        }}
        onBlocked={() => load('initial')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, gap: 8 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: radios.full, paddingHorizontal: 12, height: 38 },
  filterBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  chipChannel: { flexDirection: 'row', alignItems: 'center', borderRadius: radios.full, paddingHorizontal: 12, height: 32 },
  chipCity: { borderRadius: radios.full, paddingHorizontal: 12, height: 28, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingBottom: 60 },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: radios.full, paddingHorizontal: 16, paddingVertical: 9 },
  masonryRow: { flexDirection: 'row', gap: 8 },
  masonryCol: { flex: 1, gap: 8 },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { ...formaHoja },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  typeChip: { borderRadius: radios.full, paddingHorizontal: 14, paddingVertical: 9 },
});
