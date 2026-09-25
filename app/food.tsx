/**
 * FoodScreen — Home de Comida Rápida: restaurantes activos con búsqueda
 * server-side (debounce), filtros por cocina y ciudad (Malabo/Bata), tarjeta
 * con foto, abierto/cerrado calculado en el servidor (hora de Malabo), rating
 * y radio de reparto.
 * v3 (paginación): catálogo paginado en el servidor (?page&limit, total y
 * hasMore) con infinite scroll, footer con estados propios (cargando más /
 * error con Reintentar / fin de resultados), skeleton inicial y pull-to-refresh
 * que conserva la lista. Ruta: /food
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bike, Search, Utensils } from 'lucide-react-native';
import { alpha, EmptyState, espaciado, radios, ScreenHeader, Tactil, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { foodApi, FoodCuisine, FoodRestaurant, FoodRestaurantsPage } from '../api/food';
import { brand } from '@egrouteplan/ui-kit';

const FOOD_CITIES = ['Malabo', 'Bata'];
const PAGE_SIZE = 20;
const SKELETONS = [0, 1, 2, 3];

export default function FoodScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [restaurants, setRestaurants] = useState<FoodRestaurant[]>([]);
  const [cuisines, setCuisines] = useState<FoodCuisine[]>([]);
  const [q, setQ] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [city, setCity] = useState('');
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Evita aplicar respuestas obsoletas si el usuario cambia filtros mientras
  // una petición (primera página o más) está en vuelo.
  const reqId = useRef(0);

  // Las cocinas no cambian con los filtros: se cargan una sola vez.
  useEffect(() => {
    let alive = true;
    foodApi.cuisines().then((c) => { if (alive) setCuisines(c); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const buildQs = useCallback((pg: number): Record<string, string> => {
    const qs: Record<string, string> = { page: String(pg), limit: String(PAGE_SIZE) };
    if (cuisine) qs.cuisine = cuisine;
    if (city) qs.city = city;
    const t = q.trim();
    if (t) qs.q = t;
    return qs;
  }, [cuisine, city, q]);

  /** Primera página (filtros/búsqueda): vacía la lista para nunca mostrar
   *  datos stale; skeleton mientras carga. */
  const loadFirst = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    setRestaurants([]);
    setLoadMoreError(false);
    try {
      const r = await foodApi.restaurants(buildQs(1));
      if (id !== reqId.current) return;
      apply(r);
    } catch {
      if (id !== reqId.current) return;
      setError('No pudimos cargar los restaurantes. Revisa tu conexión e inténtalo de nuevo.');
      setRestaurants([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildQs]);

  const apply = (r: FoodRestaurantsPage) => {
    setRestaurants(r.items);
    setTotal(r.total);
    setPage(r.page);
    setPageSize(r.limit);
    setHasMore(r.hasMore);
    setLoadMoreError(false);
  };

  /** Pull-to-refresh: conserva la lista visible mientras refresca. */
  const refresh = useCallback(async () => {
    const id = reqId.current;
    setRefreshing(true);
    try {
      const r = await foodApi.restaurants(buildQs(1));
      if (id !== reqId.current) return;
      apply(r);
      setError(null);
    } catch {
      // Pull-to-refresh fallido: se conserva la lista ya cargada.
    } finally {
      if (id === reqId.current) setRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildQs]);

  /** Infinite scroll: añade la siguiente página al final de la lista. */
  const loadMore = useCallback(async () => {
    if (loading || refreshing || loadingMore || !hasMore) return;
    const id = reqId.current;
    const next = page + 1;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const r = await foodApi.restaurants(buildQs(next));
      if (id !== reqId.current) return;
      setRestaurants((prev) => [...prev, ...r.items]);
      setTotal(r.total);
      setPage(r.page);
      setPageSize(r.limit);
      setHasMore(r.hasMore);
    } catch {
      if (id !== reqId.current) return;
      setLoadMoreError(true);
    } finally {
      if (id === reqId.current) setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, refreshing, loadingMore, hasMore, page, buildQs]);

  // Búsqueda y filtros con debounce de 300 ms.
  useEffect(() => {
    const t = setTimeout(() => { loadFirst(); }, 300);
    return () => clearTimeout(t);
  }, [loadFirst]);

  const hasFilters = !!cuisine || !!city || !!q.trim();

  const listData: FoodRestaurant[] = useMemo(() => {
    if (loading && !restaurants.length) return SKELETONS.map((i) => ({ id: `__sk_${i}` } as FoodRestaurant));
    return restaurants;
  }, [loading, restaurants]);

  const isSkeleton = (id: string) => id.startsWith('__sk_');
  const showEndNote = !hasMore && !loadingMore && total > pageSize;

  const s = styles(colors);
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Cabecera del kit desde el 24/09/2026. Las dos acciones van en `accion`. */}
      <ScreenHeader
        titulo="Comida Rápida"
        alVolver={() => router.back()}
        accion={
          <>
            <Tactil onPress={() => router.push('/food-rider' as any)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Ser repartidor">
              <Bike size={20} color={colors.primary} />
            </Tactil>
            <Tactil onPress={() => router.push('/food-owner' as any)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Mi restaurante">
              <Utensils size={20} color={colors.primary} />
            </Tactil>
          </>
        }
      />

      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={s.listContent}
        keyboardShouldPersistTaps="handled"
        refreshing={refreshing}
        onRefresh={refresh}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View>
            {/* Búsqueda server-side */}
            <View style={s.searchBox}>
              <Search size={16} color={colors.textSecondary} />
              <TextInput
                value={q}
                onChangeText={setQ}
                placeholder="Buscar restaurante, plato o ciudad…"
                placeholderTextColor={colors.textSecondary}
                accessibilityLabel="Buscar restaurantes"
                returnKeyType="search"
                autoCorrect={false}
                style={s.searchInput}
              />
            </View>

            {/* Ciudad */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espaciado.e8, paddingRight: espaciado.e16 }}>
              <Chip label="📍 Todas" active={city === ''} onPress={() => setCity('')} />
              {FOOD_CITIES.map((c) => (
                <Chip key={c} label={c} active={city === c} onPress={() => setCity(city === c ? '' : c)} />
              ))}
            </ScrollView>

            {/* Cocina */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: espaciado.e8 }} contentContainerStyle={{ gap: espaciado.e8, paddingRight: espaciado.e16 }}>
              <Chip label="✨ Todas" active={cuisine === ''} onPress={() => setCuisine('')} />
              {cuisines.map((c) => (
                <Chip key={c.id} label={c.label} icon={c.icon} active={cuisine === c.id}
                  onPress={() => setCuisine(cuisine === c.id ? '' : c.id)} />
              ))}
            </ScrollView>

            {!error && (
              <Text style={s.resultsLabel}>
                {loading ? 'Cargando…' : `${total} restaurante${total === 1 ? '' : 's'} · pide y recoge o recibe en casa`}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          error ? (
            <EmptyState
              icono={<Text style={{ fontSize: 40 }}>📡</Text>}
              titulo="Algo salió mal"
              texto={error}
              accionLabel="Reintentar"
              onAccion={loadFirst}
              accionPrimaria
            />
          ) : loading ? null : (
            <EmptyState
              icono={<Text style={{ fontSize: 40 }}>🍽️</Text>}
              titulo={hasFilters ? 'Sin resultados con estos filtros' : 'Todavía no hay restaurantes'}
              texto={hasFilters
                ? 'Prueba a quitar filtros o buscar en otra ciudad.'
                : 'Sé el primero en tu zona: identidad verificada y aprobación del administrador.'}
              accionLabel={hasFilters ? 'Quitar filtros' : 'Registra tu restaurante'}
              accionPrimaria={!hasFilters}
              onAccion={hasFilters
                ? () => { setCuisine(''); setCity(''); setQ(''); }
                : () => router.push('/food-owner' as any)}
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={s.footerNote}><ActivityIndicator size="small" color={colors.primary} /></View>
          ) : loadMoreError ? (
            <Pressable onPress={loadMore} style={s.footerNote} accessibilityRole="button">
              <Text style={[s.footerText, { color: colors.primary }]}>No se pudieron cargar más restaurantes · Reintentar</Text>
            </Pressable>
          ) : showEndNote ? (
            <View style={s.footerNote}><Text style={[s.footerText, { color: colors.textSecondary }]}>Ya están todos · fin de resultados</Text></View>
          ) : null
        }
        renderItem={({ item }) =>
          isSkeleton(item.id) ? (
            <RestaurantSkeleton key={item.id} colors={colors} />
          ) : (
            <RestaurantCard
              key={item.id}
              item={item}
              onPress={() => router.push({ pathname: '/food-menu', params: { id: item.id } } as any)}
            />
          )
        }
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

function Chip({ label, icon, active, onPress }: { label: string; icon?: string | null; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }}
      style={[s_chip.base, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }]}>
      {icon ? <Text style={{ fontSize: tipografia.body }}>{icon}</Text> : null}
      <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: active ? brand.white : colors.textPrimary }}>{label}</Text>
    </Pressable>
  );
}

function RestaurantCard({ item, onPress }: { item: FoodRestaurant; onPress: () => void }) {
  const { colors } = useTheme();
  // Guard de URL: solo se renderiza la foto si el servidor devolvió una URL
  // http(s) real (photoUrl); nunca una key de objeto suelta.
  const photo = item.photoUrl && /^https?:\/\//i.test(item.photoUrl) ? item.photoUrl : null;
  const showRating = item.ratingCount > 0 && Number.isFinite(item.ratingAvg);
  const km = Number.isFinite(item.deliveryKm) && item.deliveryKm > 0 ? item.deliveryKm : 0;
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityLabel={`${item.businessName}, ${item.cuisineLabel ?? 'restaurante'} en ${item.city}${item.isOpen !== null ? (item.isOpen ? ', abierto' : ', cerrado') : ''}`}
      style={[s_card.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {photo ? (
        <Image source={{ uri: photo }} style={s_card.img} contentFit="cover" transition={200} />
      ) : (
        <View style={[s_card.img, s_card.imgFallback]}>
          <Text style={{ fontSize: 34 }}>{item.cuisineIcon ?? '🍽️'}</Text>
        </View>
      )}
      <View style={s_card.body}>
        <View style={s_card.titleRow}>
          <Text numberOfLines={1} style={[s_card.name, { color: colors.textPrimary }]}>{item.businessName}</Text>
          {showRating && (
            <Text style={[s_card.rating, { color: colors.secondary }]}>★ {item.ratingAvg.toFixed(1)}</Text>
          )}
        </View>
        {/* Fila badges estilo Meituan: estado + cocina */}
        <View style={[s_card.badgeRow, { marginTop: espaciado.e4 }]}>
          {item.isOpen !== null && (
            <View style={[s_card.chip, { backgroundColor: item.isOpen ? 'rgba(16,185,129,0.12)' : 'rgba(239,68,68,0.1)' }]}>
              <View style={[s_card.dot, { backgroundColor: item.isOpen ? brand.success : brand.danger }]} />
              <Text style={[s_card.chipText, { color: item.isOpen ? brand.success : brand.danger }]}>
                {item.isOpen ? 'Abierto' : 'Cerrado'}
              </Text>
            </View>
          )}
          {item.cuisineLabel && (
            <View style={[s_card.chip, { backgroundColor: alpha(colors.secondary, 0.1) }]}>
              <Text style={[s_card.chipText, { color: colors.secondary }]} numberOfLines={1}>{item.cuisineLabel}</Text>
            </View>
          )}
        </View>
        {/* Línea de ciudad + meta de entrega (patrón Meituan) */}
        <Text numberOfLines={1} style={[s_card.sub, { color: colors.textSecondary, marginTop: espaciado.e4 }]}>
          📍 {item.city}{item.address ? ` · ${item.address}` : ''}
        </Text>
        <View style={s_card.metaRow}>
          <Text numberOfLines={1} style={[s_card.meta, { color: brand.secondary }]}>
            {km > 0 ? `🛵 Reparto hasta ${km} km` : (item.hours ? `🕐 ${item.hours}` : 'Pide y recoge')}
          </Text>
          {showRating && (
            <Text style={{ fontSize: 10.5, color: colors.textSecondary, fontWeight: peso.medio }}>
              {item.ratingCount} valoraciones
            </Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

function RestaurantSkeleton({ colors }: { colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <View style={[s_sk.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={{ width: 90, height: 90, backgroundColor: colors.border }} />
      <View style={{ flex: 1, padding: espaciado.e12, gap: espaciado.e8 }}>
        <View style={{ height: 12, borderRadius: radios.punta, backgroundColor: colors.border, width: '72%' }} />
        <View style={{ height: 10, borderRadius: radios.punta, backgroundColor: colors.border, width: '46%' }} />
        <View style={{ height: 10, borderRadius: radios.punta, backgroundColor: colors.border, width: '60%' }} />
      </View>
    </View>
  );
}


const s_chip = StyleSheet.create({
  base: { paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e8, borderRadius: radios.panel, flexDirection: 'row', alignItems: 'center', gap: espaciado.e5, borderWidth: trazo.fino },
});

const s_card = StyleSheet.create({
  card: { flexDirection: 'row', borderRadius: radios.lg, overflow: 'hidden', borderWidth: trazo.fino, marginBottom: espaciado.e10 },
  img: { width: 104, height: 104 },
  imgFallback: { backgroundColor: 'rgba(255,107,53,0.08)', alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, padding: espaciado.e12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaciado.e8 },
  name: { fontSize: 15.5, fontWeight: peso.maximo, flex: 1 },
  rating: { fontSize: tipografia.body, fontWeight: peso.titulo },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, borderRadius: radios.sm, paddingHorizontal: espaciado.e7, paddingVertical: espaciado.e3, maxWidth: '60%' },
  dot: { width: 6, height: 6, borderRadius: radios.punta },
  chipText: { fontSize: 10.5, fontWeight: peso.maximo, flexShrink: 1 },
  sub: { fontSize: tipografia.micro, fontWeight: peso.medio },
  metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaciado.e8, marginTop: espaciado.e6 },
  meta: { fontSize: tipografia.caption, fontWeight: peso.maximo, flexShrink: 1 },
});

const s_sk = StyleSheet.create({
  card: { flexDirection: 'row', borderRadius: 14, overflow: 'hidden', borderWidth: trazo.fino, marginBottom: espaciado.e10 },
});



const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  searchBox: { flexDirection: 'row', alignItems: 'center', marginTop: espaciado.e12, backgroundColor: c.surface, borderRadius: radios.md, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10, borderWidth: trazo.fino, borderColor: c.border },
  searchInput: { flex: 1, color: c.textPrimary, fontSize: tipografia.body, marginLeft: espaciado.e8 },
  resultsLabel: { fontSize: tipografia.caption, fontWeight: peso.fuerte, color: c.textSecondary, marginTop: espaciado.e14, marginBottom: espaciado.e10 },
  listContent: { paddingHorizontal: espaciado.e16, paddingBottom: espaciado.e32 },
  footerNote: { paddingVertical: espaciado.e16, alignItems: 'center' },
  footerText: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
});
