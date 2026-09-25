/**
 * Life Book — BÚSQUEDA (estilo Xiaohongshu)
 *
 * Estructura:
 *  - Barra de búsqueda con auto-focus y botón cancelar.
 *  - Sin texto: historial + tendencias reales + categorías sugeridas.
 *  - Con texto: resultados en masonry (misma tarjeta y reparto que el feed).
 *  - Sugerencias en tiempo real (debounce 350 ms).
 *
 * API (Parte 9, desplegada en HK):
 *   GET /lifebook/search?q=…&type=…&city=…&cursor=…
 *   GET /lifebook/search/trends?city=…
 *   GET /lifebook/search/suggest?q=…
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { alpha, EmptyState, espaciado, radios, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import {
  Clock,
  Flame,
  Hash,
  MapPin,
  Search,
  TrendingUp,
  User as UserIcon,
  X,
} from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import {
  lifebookActionsApi,
  lifebookApi,
  LB_CARD_DEFAULT_RATIO,
  toPostCard,
  type LbPostCard,
  type LbSuggestion,
  type LbTrend,
} from '../api/lifebook';
import { authApi } from '../api/auth';
import { PostCard } from '../components/lifebook/PostCard';
import { ReportSheet } from '../components/lifebook/ReportSheet';
import { ir as irSeguro } from '../constants/rutas';
import { brand } from '@egrouteplan/ui-kit';

const { width: SCREEN_W } = Dimensions.get('window');
const COLUMN_GAP = 8;
const SIDE_PADDING = 10;
const COLUMN_W = (SCREEN_W - SIDE_PADDING * 2 - COLUMN_GAP) / 2;
const HISTORY_KEY = 'lb_search_history';

/* Filtros de tipo de contenido (tipos de publicación + canales temáticos) */
const SEARCH_FILTERS = [
  { id: 'all', label: 'Todo' },
  { id: 'note', label: 'Notas' },
  { id: 'video', label: 'Videos' },
  { id: 'sale', label: 'Ventas' },
  { id: 'debate', label: 'Debates' },
  { id: 'food', label: 'Comida' },
  { id: 'taxi', label: 'Taxi' },
] as const;

/* Categorías sugeridas cuando aún no hay texto */
const DISCOVER_TAGS = ['Comida local', 'Malabo', 'Bata', 'Música', 'Trabajo', 'Alquiler', 'Taxi', 'Moda', 'Fútbol', 'Emprendimiento'];

export default function LifeBookSearchScreen() {
  return (
    <AuthGate>
      <LifeBookSearchContent />
    </AuthGate>
  );
}

function LifeBookSearchContent() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Permite abrir la búsqueda ya con un término (p. ej. desde un #tema del detalle).
  const { q: qParam } = useLocalSearchParams<{ q?: string }>();

  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const appliedQ = useRef<string | null>(null);

  /* ── Estado ── */
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [city, setCity] = useState('Malabo');
  const [history, setHistory] = useState<string[]>([]);
  const [trends, setTrends] = useState<LbTrend[]>([]);
  const [suggestions, setSuggestions] = useState<LbSuggestion[]>([]);
  const [results, setResults] = useState<LbPostCard[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [morePost, setMorePost] = useState<LbPostCard | null>(null);

  const busy = useRef(false);
  const mounted = useRef(true);

  /* ── Historial (persistencia local) ── */
  const loadHistory = useCallback(async () => {
    try {
      const stored = await AsyncStorage.getItem(HISTORY_KEY);
      if (stored && mounted.current) setHistory(JSON.parse(stored));
    } catch { /* silencioso */ }
  }, []);

  const saveToHistory = useCallback((term: string, current: string[]) => {
    const t = term.trim();
    if (!t) return;
    const next = [t, ...current.filter((h) => h !== t)].slice(0, 15);
    setHistory(next);
    AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    AsyncStorage.removeItem(HISTORY_KEY).catch(() => {});
  }, []);

  /* ── Tendencias reales del servidor (30 días) ── */
  const loadTrends = useCallback(async (cty: string) => {
    try {
      const data = await lifebookApi.searchTrends({ city: cty });
      if (mounted.current) setTrends(data?.trends ?? []);
    } catch { /* silencioso */ }
  }, []);

  /* ── Auto-focus + ciudad del usuario ── */
  useEffect(() => {
    mounted.current = true;
    const t = setTimeout(() => inputRef.current?.focus(), 300);
    loadHistory();
    authApi.me()
      .then((m) => { if (m?.city && mounted.current) setCity(m.city); })
      .catch(() => {});
    return () => {
      mounted.current = false;
      clearTimeout(t);
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [loadHistory]);

  useEffect(() => { loadTrends(city); }, [city, loadTrends]);

  /* ── Sugerencias en tiempo real (debounce 350 ms) ── */
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    try {
      const data = await lifebookApi.searchSuggest(q);
      if (mounted.current) {
        setSuggestions(data?.suggestions ?? []);
        setShowSuggestions(true);
      }
    } catch { /* silencioso */ }
  }, []);

  const onQueryChange = (text: string) => {
    setQuery(text);
    setShowSuggestions(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(text), 350);
  };

  /* ── Búsqueda principal ── */
  const doSearch = useCallback(
    async (q: string, reset = true, filterOverride?: string) => {
      const term = q.trim();
      if (!term || busy.current) return;
      const activeFilter = filterOverride ?? filter;
      busy.current = true;
      setShowSuggestions(false);
      Keyboard.dismiss();
      saveToHistory(term, history);

      if (reset) {
        setLoading(true);
        setHasSearched(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const page = await lifebookApi.search(term, {
          type: activeFilter === 'all' ? undefined : activeFilter,
          city,
          cursor: reset ? undefined : nextCursor ?? undefined,
          limit: 20,
        });
        if (!mounted.current) return;
        const cards = (page.posts ?? []).map(toPostCard);
        if (reset) {
          setResults(cards);
        } else {
          setResults((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            return [...prev, ...cards.filter((p) => !seen.has(p.id))];
          });
        }
        setNextCursor(page.nextCursor ?? null);
      } catch (e) {
        if (mounted.current) {
          Alert.alert('Buscar', e instanceof Error ? e.message : 'No se pudo buscar.');
        }
      } finally {
        busy.current = false;
        if (mounted.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [filter, nextCursor, city, history, saveToHistory],
  );

  const onFilterChange = (f: string) => {
    setFilter(f);
    // El filtro nuevo se pasa explícito: setFilter aún no se ha aplicado.
    if (query.trim()) doSearch(query, true, f);
  };

  /* ── Término inicial recibido por parámetro (#tema del detalle) ── */
  useEffect(() => {
    const term = (qParam ?? '').trim();
    if (!term || appliedQ.current === term) return;
    appliedQ.current = term;
    setQuery(term);
    // Se busca en el momento (sin temporizador: un re-render lo cancelaría).
    doSearch(term);
  }, [qParam, doSearch]);

  const onPickTerm = (term: string) => {
    setQuery(term);
    doSearch(term);
  };

  /* ── Masonry: mismo reparto por altura que el feed ── */
  const { leftCol, rightCol } = useMemo(() => {
    const left: LbPostCard[] = [];
    const right: LbPostCard[] = [];
    let hL = 0;
    let hR = 0;
    for (const p of results) {
      const imgH = COLUMN_W / (p.media?.aspectRatio ?? LB_CARD_DEFAULT_RATIO);
      const totalH = imgH + 60;
      if (hL <= hR) { left.push(p); hL += totalH; } else { right.push(p); hR += totalH; }
    }
    return { leftCol: left, rightCol: right };
  }, [results]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* ═══════ BARRA DE BÚSQUEDA ═══════ */}
      <View style={[styles.searchBar, { borderBottomColor: alpha(colors.border, 0.5) }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ padding: espaciado.e4 }} accessibilityLabel="Cerrar búsqueda">
          <X size={20} color={colors.textSecondary} />
        </Pressable>

        <View style={[styles.inputWrap, { backgroundColor: alpha(colors.textSecondary, 0.07) }]}>
          <Search size={15} color={colors.textSecondary} />
          <TextInput
            ref={inputRef}
            value={query}
            onChangeText={onQueryChange}
            onSubmitEditing={() => doSearch(query)}
            placeholder="Buscar personas, temas, productos…"
            placeholderTextColor={colors.textSecondary}
            returnKeyType="search"
            style={[styles.input, { color: colors.textPrimary }]}
            autoFocus
            clearButtonMode="never"
          />
          {query.length > 0 && (
            <Pressable
              onPress={() => { setQuery(''); setResults([]); setHasSearched(false); setSuggestions([]); }}
              hitSlop={8}
              accessibilityLabel="Borrar texto"
            >
              <X size={15} color={colors.textSecondary} />
            </Pressable>
          )}
        </View>

        <Pressable onPress={() => doSearch(query)} hitSlop={8} accessibilityRole="button">
          <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.maximo }}>
            Buscar
          </Text>
        </Pressable>
      </View>

      {/* ═══════ SUGERENCIAS ═══════ */}
      {showSuggestions && suggestions.length > 0 && !hasSearched && (
        <View style={[styles.suggestList, { backgroundColor: colors.background }]}>
          {suggestions.map((s, i) => (
            <Pressable
              key={`${s.text}-${i}`}
              onPress={() => onPickTerm(s.text)}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: espaciado.e10,
                paddingVertical: espaciado.e12,
                paddingHorizontal: espaciado.e16,
                backgroundColor: pressed ? alpha(colors.textSecondary, 0.05) : 'transparent',
              })}
            >
              {s.type === 'tag' ? (
                <Hash size={15} color={colors.primary} />
              ) : s.type === 'user' ? (
                <UserIcon size={15} color={colors.textSecondary} />
              ) : (
                <Search size={15} color={colors.textSecondary} />
              )}
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, flex: 1 }} numberOfLines={1}>{s.text}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro }}>
                {s.type === 'tag' ? 'tema' : s.type === 'user' ? 'persona' : 'buscar'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* ═══════ RESULTADOS ═══════ */}
      {hasSearched ? (
        <View style={{ flex: 1 }}>
          {/* Filtros */}
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={SEARCH_FILTERS}
            keyExtractor={(f) => f.id}
            style={{ flexGrow: 0 }}
            contentContainerStyle={{ paddingHorizontal: espaciado.e12, gap: espaciado.e6, paddingVertical: espaciado.e8 }}
            renderItem={({ item }) => {
              const active = item.id === filter;
              return (
                <Pressable
                  onPress={() => onFilterChange(item.id)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.filterChip,
                    { backgroundColor: active ? colors.primary : alpha(colors.textSecondary, 0.06) },
                  ]}
                >
                  <Text
                    style={{
                      color: active ? brand.white : colors.textPrimary,
                      fontSize: tipografia.caption,
                      fontWeight: active ? peso.maximo : peso.medio,
                    }}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              );
            }}
          />

          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : results.length === 0 ? (
            /* Vacío del kit. Es una búsqueda sin resultados: se dice qué se buscó y qué hacer. */
            <EmptyState
              compacto
              icono={<Search size={36} color={colors.textSecondary} />}
              titulo="Sin resultados"
              texto={`No encontramos contenido para "${query}". Intenta con otra palabra.`}
            />
          ) : (
            <FlatList
              data={[{ left: leftCol, right: rightCol }]}
              keyExtractor={() => 'search-masonry'}
              renderItem={({ item }) => (
                <View style={styles.masonryRow}>
                  <View style={styles.masonryCol}>
                    {item.left.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        width={COLUMN_W}
                        onPress={(id) => router.push({ pathname: '/lifebook-post/[id]', params: { id } })}
                        onMore={setMorePost}
                      />
                    ))}
                  </View>
                  <View style={styles.masonryCol}>
                    {item.right.map((post) => (
                      <PostCard
                        key={post.id}
                        post={post}
                        width={COLUMN_W}
                        onPress={(id) => router.push({ pathname: '/lifebook-post/[id]', params: { id } })}
                        onMore={setMorePost}
                      />
                    ))}
                  </View>
                </View>
              )}
              contentContainerStyle={{ paddingBottom: insets.bottom + 40, flexGrow: 1 }}
              showsVerticalScrollIndicator={false}
              onEndReached={() => { if (nextCursor && !loadingMore) doSearch(query, false); }}
              onEndReachedThreshold={0.5}
              ListFooterComponent={
                loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: espaciado.e16 }} /> : null
              }
            />
          )}
        </View>
      ) : (
        /* ═══════ PANTALLA VACÍA: Historial + Tendencias + Descubre ═══════
           `keyboardShouldPersistTaps="always"`: con el teclado abierto (el
           buscador tiene auto-focus), el primer toque debe llegar a los botones
           —historial, tendencias, tags y «Explorar todo»— en vez de solo
           cerrar el teclado. */
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
        >
          {/* Historial */}
          {history.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Recientes</Text>
                <Pressable onPress={clearHistory} hitSlop={8}>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>Limpiar</Text>
                </Pressable>
              </View>
              <View style={styles.tagsWrap}>
                {history.map((h) => (
                  <Pressable
                    key={h}
                    onPress={() => onPickTerm(h)}
                    style={[styles.historyTag, { backgroundColor: alpha(colors.textSecondary, 0.06) }]}
                  >
                    <Clock size={12} color={colors.textSecondary} />
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption }}>{h}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}

          {/* Tendencias */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Flame size={16} color={brand.like} />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
                Tendencias en {city}
              </Text>
            </View>
            {trends.length === 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, paddingHorizontal: espaciado.e2 }}>
                Todavía no hay tendencias en tu ciudad.
              </Text>
            ) : (
              trends.map((t, i) => (
                <Pressable
                  key={`${t.tag}-${i}`}
                  onPress={() => onPickTerm(t.tag)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: espaciado.e10,
                    paddingVertical: espaciado.e11,
                    opacity: pressed ? 0.7 : 1,
                  })}
                >
                  <Text
                    style={{
                      fontSize: tipografia.cuerpo,
                      fontWeight: peso.titulo,
                      color: i < 3 ? brand.like : colors.textSecondary,
                      width: 20,
                      textAlign: 'center',
                    }}
                  >
                    {i + 1}
                  </Text>
                  <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.medio, flex: 1 }} numberOfLines={1}>
                    {t.tag}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro }}>
                    {formatCount(t.count)}
                  </Text>
                  {t.hot ? <Flame size={13} color={brand.secondary} /> : null}
                </Pressable>
              ))
            )}
          </View>

          {/* Categorías sugeridas + entrada a Explorar */}
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <TrendingUp size={16} color={colors.primary} />
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>Descubre</Text>
              <Pressable onPress={() => irSeguro.libre('/lifebook-explore')} hitSlop={8} accessibilityRole="link">
                <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>Explorar todo →</Text>
              </Pressable>
            </View>
            <View style={styles.tagsWrap}>
              {DISCOVER_TAGS.map((tag) => (
                <Pressable
                  key={tag}
                  onPress={() => onPickTerm(tag)}
                  style={[styles.discoverTag, { backgroundColor: alpha(colors.primary, 0.06) }]}
                >
                  <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.medio }}>{tag}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6 }}>
              <MapPin size={13} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
                Buscando en {city} · se muestran solo publicaciones públicas
              </Text>
            </View>
          </View>
        </ScrollView>
      )}

      {/* ═══════ MODAL: Reportar (⋯ de tarjeta) ═══════ */}
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
        onBlocked={() => { if (query.trim()) doSearch(query, true); }}
      />
    </View>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.e8,
    paddingHorizontal: espaciado.e12,
    paddingBottom: espaciado.e10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.e8,
    borderRadius: radios.tarjeta,
    paddingHorizontal: espaciado.e12,
    paddingVertical: espaciado.e8,
  },
  input: { flex: 1, fontSize: tipografia.body, paddingVertical: 0 },
  suggestList: {
    position: 'absolute',
    top: 56,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    elevation: 10,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
  filterChip: {
    borderRadius: radios.full,
    paddingHorizontal: espaciado.e14,
    paddingVertical: espaciado.e7,
  },
  masonryRow: {
    flexDirection: 'row',
    paddingHorizontal: SIDE_PADDING,
    gap: COLUMN_GAP,
    paddingTop: espaciado.e4,
  },
  masonryCol: { flex: 1, gap: COLUMN_GAP },
  section: { paddingHorizontal: espaciado.e16, marginTop: espaciado.e20 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espaciado.e6,
    marginBottom: espaciado.e10,
  },
  sectionTitle: { fontSize: tipografia.subtitle, fontWeight: peso.maximo },
  tagsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 },
  historyTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.e5,
    borderRadius: radios.full,
    paddingHorizontal: espaciado.e12,
    paddingVertical: espaciado.e7,
  },
  discoverTag: {
    borderRadius: radios.full,
    paddingHorizontal: espaciado.e14,
    paddingVertical: espaciado.e8,
  },
});
