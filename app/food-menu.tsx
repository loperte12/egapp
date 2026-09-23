/**
 * FoodMenuScreen — Menú del restaurante con carrito (Zustand persistente).
 *
 * Auditoría senior (2026-09-02):
 *  · Carrito por restaurante: cada línea lleva su restaurantId; al entrar a un
 *    restaurante con carrito de OTRO, se pregunta (diálogo) — nunca se borra
 *    sin avisar ni se mezclan restaurantes.
 *  · Carga con skeleton + error con Reintentar (nunca pantalla vacía por red).
 *  · Empty state cuando el restaurante aún no tiene ítems.
 *  · Header con Abierto/Cerrado (servidor, hora de Malabo); cerrado NO bloquea:
 *    "el restaurante confirmará tu pedido cuando abra" (decisión de producto).
 *  · a11y (back, +/−, CTA con total), SafeArea superior e inferior, tope de 99
 *    por ítem (backend capa en 100), selectores puros con useMemo.
 * Ruta: /food-menu?id=
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Minus, Plus, Star } from 'lucide-react-native';
import { useTheme, alpha, brand, EmptyState, tipografia, radios } from '@egrouteplan/ui-kit';
import { foodApi, FoodMenuItem, FoodRestaurantDetail, SPICE_LABEL, SPICE_ICON } from '../api/food';
import { foodCartCount, foodCartTotal, FoodCartLine, useFoodStore } from '../state/food';
import { itemDetailSummary } from '../utils/foodItemDetails';
import { formatXAF } from '../utils/formatHelpers';

const CAT_ORDER = ['plato', 'bebida', 'postre'] as const;
const CAT_LABEL: Record<string, string> = { plato: 'Platos', bebida: 'Bebidas', postre: 'Postres' };
// Acento del flujo de servicios (naranja), consistente con la home de Comida y
// Ecomerse. Nota DS: migración a token del theme (secondary #FF7D00) sería un
// repintado global del marketplace — pendiente como ronda de design system.
const ACCENT = brand.primary; // A1: la acción avanza en azul

export default function FoodMenuScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [detail, setDetail] = useState<FoodRestaurantDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const cart = useFoodStore((s) => s.cart);

  // ── Entrada: si el carrito es de OTRO restaurante, confirmar el descarte.
  // Se lee el estado con getState() (sin dependencias → sin bucles) y el Alert
  // no es cancelable en Android (no se puede quedar en un limbo).
  useEffect(() => {
    if (!id) return;
    const st = useFoodStore.getState();
    if (st.restaurantId && st.restaurantId !== id && st.cart.length > 0) {
      Alert.alert(
        '¿Nuevo pedido?',
        'Ya tienes ítems de otro restaurante en el carrito. Para pedir aquí hay que descartarlos.',
        [
          { text: 'Volver', style: 'cancel', onPress: () => router.back() },
          { text: 'Descartar y pedir aquí', style: 'destructive', onPress: () => useFoodStore.getState().switchRestaurant(id) },
        ],
        { cancelable: false },
      );
    } else {
      st.setRestaurant(id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ── Carga del detalle (skeleton / error / Reintentar). cancelled evita
  // setState de una petición obsoleta (cambio de id o desmontaje).
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setDetail(null);
    foodApi.restaurant(id)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch(() => { if (!cancelled) setError('No pudimos cargar el menú. Revisa tu conexión e inténtalo de nuevo.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, reloadKey]);

  const retry = useCallback(() => setReloadKey((k) => k + 1), []);

  // Líneas del carrito de ESTE restaurante (defensa ante estados raros).
  const lines = useMemo<FoodCartLine[]>(
    () => (id ? cart.filter((c) => c.restaurantId === id) : []),
    [cart, id],
  );
  const qtyMap = useMemo(() => new Map(lines.map((c) => [c.itemId, c.qty])), [lines]);
  const count = useMemo(() => foodCartCount(lines), [lines]);
  const total = useMemo(() => foodCartTotal(lines), [lines]);
  const isOpen = detail?.isOpen ?? null;

  const add = (m: FoodMenuItem) => {
    if (!id) return;
    useFoodStore.getState().addToCart({
      itemId: m.id, restaurantId: id, name: m.name, priceXaf: m.priceXaf, category: m.category,
    });
  };

  const s = styles(colors);
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>{detail?.businessName ?? 'Menú'}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: 96 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <MenuSkeleton colors={colors} />
        ) : error ? (
          <View style={s_center.wrap}>
            <Text style={{ fontSize: 38, marginBottom: 8 }}>📡</Text>
            <Text style={[s_center.title, { color: colors.textPrimary }]}>No pudimos cargar el menú</Text>
            <Text style={[s_center.sub, { color: colors.textSecondary }]}>{error}</Text>
            <Pressable onPress={retry} accessibilityRole="button" style={s_center.btnPrimary}>
              <Text style={{ color: brand.white, fontWeight: '800', fontSize: tipografia.body }}>Reintentar</Text>
            </Pressable>
          </View>
        ) : detail ? (
          <>
            {/* Cabecera del restaurante */}
            <RestaurantHeader detail={detail} />

            {isOpen === false && (
              <View style={[s.closedNote, { backgroundColor: alpha(colors.danger, 0.07), borderColor: alpha(colors.danger, 0.25) }]}>
                <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: '700', lineHeight: 16 }}>
                  Cerrado ahora · puedes dejar tu pedido y el restaurante lo confirmará cuando abra.
                </Text>
              </View>
            )}

            {detail.menu.length === 0 ? (
              /* Es una ESPERA: la carta la publica el restaurante. Se dice qué la llena y no
                 se inventa un botón (regla de la tanda 2 del informe). */
              <EmptyState
                icono={<Text style={{ fontSize: 40 }}>🍽️</Text>}
                titulo="Todavía no hay ítems en el menú"
                texto="Los platos publicados y aprobados por el restaurante aparecerán aquí, con su precio."
              />
            ) : (
              CAT_ORDER.map((cat) => {
                const items = detail.menu.filter((m) => m.category === cat);
                if (items.length === 0) return null;
                return (
                  <View key={cat} style={{ marginBottom: 18 }}>
                    <Text style={s.catTitle}>{CAT_LABEL[cat]}</Text>
                    {items.map((m) => (
                      <MenuItemRow key={m.id} item={m} qty={qtyMap.get(m.id) ?? 0}
                        onAdd={() => add(m)}
                        onDec={() => useFoodStore.getState().setQty(m.id, (qtyMap.get(m.id) ?? 0) - 1)}
                        onInc={() => useFoodStore.getState().setQty(m.id, (qtyMap.get(m.id) ?? 0) + 1)}
                      />
                    ))}
                  </View>
                );
              })
            )}
          </>
        ) : null}
      </ScrollView>

      {/* Barra sticky de pedido (solo ítems de este restaurante) */}
      {count > 0 && (
        <View style={[s.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: 10 + insets.bottom }]}>
          <Pressable
            onPress={() => router.push({ pathname: '/food-checkout', params: { restaurantId: id } } as any)}
            accessibilityRole="button"
            accessibilityLabel={`Ver pedido: ${count} ítems, total ${formatXAF(total)}`}
            style={s.cta}
          >
            <Text style={s.ctaText}>Ver pedido · {count} ítem{count === 1 ? '' : 's'} · {formatXAF(total)}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

function RestaurantHeader({ detail }: { detail: FoodRestaurantDetail }) {
  const { colors } = useTheme();
  const showRating = detail.ratingCount > 0 && Number.isFinite(detail.ratingAvg);
  const km = Number.isFinite(detail.deliveryKm) && detail.deliveryKm > 0 ? detail.deliveryKm : 0;
  const open = detail.isOpen ?? null;
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[s_h.name, { color: colors.textPrimary }]}>{detail.businessName}</Text>
      <Text style={[s_h.sub, { color: colors.textSecondary }]}>
        {detail.cuisineLabel ?? 'Restaurante'} · {detail.city}
      </Text>
      <View style={s_h.metaRow}>
        {open !== null ? (
          <View style={[s_h.badge, { backgroundColor: open ? alpha(colors.success, 0.14) : alpha(colors.danger, 0.12) }]}>
            <View style={[s_h.dot, { backgroundColor: open ? colors.success : colors.danger }]} />
            <Text style={{ fontSize: tipografia.caption, fontWeight: '800', color: open ? colors.success : colors.danger }}>
              {open ? 'Abierto' : 'Cerrado'}
            </Text>
          </View>
        ) : null}
        <Text style={[s_h.sub, { color: colors.textSecondary, flexShrink: 1 }]}>
          {detail.hours ? `🕐 ${detail.hours}` : 'Horario no publicado'}
        </Text>
      </View>
      {showRating && (
        <View style={s_h.metaRow}>
          <Star size={12} color={colors.secondary} fill={colors.secondary} />
          <Text style={[s_h.sub, { color: colors.textSecondary }]}>
            {detail.ratingAvg.toFixed(1)} · {detail.ratingCount} valoración{detail.ratingCount === 1 ? '' : 'es'}
          </Text>
        </View>
      )}
      {detail.address ? (
        <Text numberOfLines={2} style={[s_h.sub, { color: colors.textSecondary, marginTop: 2 }]}>📍 {detail.address}</Text>
      ) : null}
      {km > 0 ? (
        <Text style={[s_h.sub, { color: ACCENT, fontWeight: '700', marginTop: 2 }]}>🛵 Reparto hasta {km} km</Text>
      ) : null}
    </View>
  );
}

function MenuItemRow({ item, qty, onAdd, onDec, onInc }: {
  item: FoodMenuItem; qty: number; onAdd: () => void; onDec: () => void; onInc: () => void;
}) {
  const { colors } = useTheme();
  const photo = item.photos?.[0] && /^https?:\/\//i.test(item.photos[0]) ? item.photos[0] : null;
  const atMax = qty >= 99;
  // Detalle del plato (041): ingredientes, picante, ración, acompañantes.
  // Todo condicional — un plato sin declarar nada se ve igual que antes.
  const detailSummary = itemDetailSummary(item);
  return (
    <View style={[s_row.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {photo ? (
        <Image source={{ uri: photo }} style={s_row.img} contentFit="cover" transition={200} />
      ) : (
        /* Sin foto: NO se pone un dibujo de comida. Un dibujo ocupa el sitio de la foto y disimula
           que falta —el cliente cree que está viendo el plato y no está viendo nada—. Se deja un
           hueco limpio con la categoría escrita: es lo que hay, dicho claro. */
        <View style={[s_row.img, s_row.imgFallback]}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: colors.textSecondary, textAlign: 'center' }}>
            {item.category === 'plato' ? 'Plato' : item.category === 'bebida' ? 'Bebida' : 'Postre'}
          </Text>
        </View>
      )}
      <View style={s_row.body}>
        <Text numberOfLines={1} style={[s_row.name, { color: colors.textPrimary }]}>{item.name}</Text>
        {item.description ? (
          <Text numberOfLines={2} style={[s_row.desc, { color: colors.textSecondary }]}>{item.description}</Text>
        ) : null}

        {/* Ingredientes */}
        {item.ingredients ? (
          <Text numberOfLines={1} style={[s_row.detailLine, { color: colors.textSecondary }]}>
            🧂 {item.ingredients}
          </Text>
        ) : null}
        {/* Acompañantes */}
        {item.sides && item.sides.length > 0 ? (
          <Text numberOfLines={1} style={[s_row.detailLine, { color: colors.textSecondary }]}>
            🍚 {item.sides.join(', ')}
          </Text>
        ) : null}

        {/* Chips: picante · ración · resumen (bebida/prep) */}
        {(item.spiceLevel || item.portionSize || detailSummary) ? (
          <View style={s_row.chips}>
            {item.spiceLevel ? (
              <View style={[s_row.miniChip, { backgroundColor: alpha(ACCENT, 0.1) }]}>
                <Text style={s_row.miniChipText}>{SPICE_ICON[item.spiceLevel]} {SPICE_LABEL[item.spiceLevel]}</Text>
              </View>
            ) : null}
            {item.portionSize ? (
              <View style={[s_row.miniChip, { backgroundColor: alpha(colors.primary, 0.08) }]}>
                <Text style={[s_row.miniChipText, { color: colors.primary }]}>📏 {item.portionSize}</Text>
              </View>
            ) : null}
            {detailSummary ? (
              <View style={[s_row.miniChip, { backgroundColor: colors.border }]}>
                <Text style={[s_row.miniChipText, { color: colors.textPrimary }]}>{detailSummary}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Text style={s_row.price}>{formatXAF(item.priceXaf)}</Text>
      </View>
      {qty === 0 ? (
        <Pressable onPress={onAdd} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Añadir ${item.name}`}
          style={s_row.addBtn}>
          <Plus size={16} color={brand.white} strokeWidth={3} />
        </Pressable>
      ) : (
        <View style={s_row.stepper}>
          <Pressable onPress={onDec} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Quitar uno de ${item.name}`}
            style={[s_row.stepBtn, { backgroundColor: colors.border }]}>
            <Minus size={14} color={colors.textPrimary} strokeWidth={3} />
          </Pressable>
          <Text style={[s_row.qty, { color: colors.textPrimary }]}>{qty}</Text>
          <Pressable onPress={onInc} disabled={atMax} hitSlop={6} accessibilityRole="button"
            accessibilityLabel={`Añadir más ${item.name}`}
            style={[s_row.stepBtn, { backgroundColor: ACCENT, opacity: atMax ? 0.4 : 1 }]}>
            <Plus size={14} color={brand.white} strokeWidth={3} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function MenuSkeleton({ colors }: { colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <View>
      <View style={{ marginBottom: 16, gap: 7 }}>
        <View style={{ height: 18, borderRadius: 4, backgroundColor: colors.border, width: '55%' }} />
        <View style={{ height: 11, borderRadius: 4, backgroundColor: colors.border, width: '38%' }} />
        <View style={{ height: 11, borderRadius: 4, backgroundColor: colors.border, width: '48%' }} />
      </View>
      <View style={{ height: 13, borderRadius: 4, backgroundColor: colors.border, width: 90, marginBottom: 10 }} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={[s_sk.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: colors.border }} />
          <View style={{ flex: 1, marginLeft: 10, gap: 6 }}>
            <View style={{ height: 11, borderRadius: 4, backgroundColor: colors.border, width: '70%' }} />
            <View style={{ height: 10, borderRadius: 4, backgroundColor: colors.border, width: '45%' }} />
          </View>
          <View style={{ width: 30, height: 30, borderRadius: 9, backgroundColor: colors.border }} />
        </View>
      ))}
    </View>
  );
}

const s_h = StyleSheet.create({
  name: { fontSize: 19, fontWeight: '900' },
  sub: { fontSize: tipografia.caption, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  dot: { width: 6, height: 6, borderRadius: 3 },
});

const s_row = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: radios.md, padding: 10, marginBottom: 8, borderWidth: 1 },
  // 64 en vez de 52: la foto de un plato es lo primero que mira el cliente («¿esto tiene buena
  // pinta?»). A 52 px no se distinguía el plato; a 64 se ve, y sigue cabiendo en la fila.
  img: { width: 64, height: 64, borderRadius: 10 },
  imgFallback: { backgroundColor: 'rgba(255,107,53,0.08)', alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, marginLeft: 10, marginRight: 8 },
  name: { fontSize: tipografia.body, fontWeight: '700' },
  desc: { fontSize: tipografia.micro, marginTop: 1, lineHeight: 14 },
  price: { fontSize: tipografia.body, fontWeight: '900', color: ACCENT, marginTop: 2 },
  addBtn: { backgroundColor: ACCENT, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  qty: { fontSize: tipografia.body, fontWeight: '800', minWidth: 18, textAlign: 'center' },
  // ── Detalle del plato (041) ──
  // Nota: `card` usa alignItems:'center' a propósito. Con detalles la tarjeta
  // crece a 3-5 líneas y la foto y el stepper quedan centrados en vertical, que
  // es lo que ya pasa hoy con la descripción larga. No se cambia para no mover
  // el aspecto de los platos que no declaran ningún detalle.
  detailLine: { fontSize: 10.5, marginTop: 2, lineHeight: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 4 },
  miniChip: { borderRadius: radios.sm, paddingHorizontal: 7, paddingVertical: 3 },
  miniChipText: { fontSize: 10, fontWeight: '700', color: ACCENT },
});

const s_sk = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: radios.md, padding: 10, marginBottom: 8, borderWidth: 1 },
});

const s_center = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 28 },
  title: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  sub: { fontSize: tipografia.caption, textAlign: 'center', marginTop: 6, lineHeight: 18 },
  btnPrimary: { marginTop: 18, backgroundColor: ACCENT, paddingHorizontal: 24, paddingVertical: 11, borderRadius: 22 },
});

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '800', color: c.textPrimary },
  content: { padding: 16 },
  catTitle: { fontSize: tipografia.body, fontWeight: '800', color: c.textPrimary, marginBottom: 8 },
  closedNote: { borderRadius: 10, borderWidth: 1, padding: 10, marginBottom: 12 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
  cta: { backgroundColor: ACCENT, borderRadius: radios.md, paddingVertical: 14, alignItems: 'center' },
  ctaText: { color: brand.white, fontSize: 15, fontWeight: '900' },
});
