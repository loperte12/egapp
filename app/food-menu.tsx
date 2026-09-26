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
import { Minus, Plus, Star } from 'lucide-react-native';
import { alpha, brand, EmptyState, espaciado, peso, Precio, radios, ScreenHeader, tipografia, trazo, useTheme, trazoIcono} from '@egrouteplan/ui-kit';
import { foodApi, FoodMenuItem, FoodRestaurantDetail, SPICE_LABEL, SPICE_ICON } from '../api/food';
import { foodCartCount, foodCartTotal, FoodCartLine, useFoodStore } from '../state/food';
import { itemDetailSummary } from '../utils/foodItemDetails';
import { formatXAF } from '../utils/formatHelpers';

const CAT_ORDER = ['plato', 'bebida', 'postre'] as const;
const CAT_LABEL: Record<string, string> = { plato: 'Platos', bebida: 'Bebidas', postre: 'Postres' };
// Acento del flujo de servicios (naranja), consistente con la home de Comida y
// Ecomerse. Nota DS: migración a token del theme (secondary el naranja de servicios) sería un
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
      {/* Cabecera del kit desde el 24/09/2026. `lineasTitulo={2}` porque el título es el NOMBRE DEL
          COMERCIO (`detail?.businessName`), que no tiene tope de longitud conocido. */}
      <ScreenHeader
        titulo={detail?.businessName ?? 'Menú'}
        alVolver={() => router.back()}
        lineasTitulo={2}
      />

      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: 96 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <MenuSkeleton colors={colors} />
        ) : error ? (
          <View style={s_center.wrap}>
            <Text style={{ fontSize: tipografia.kpi, marginBottom: espaciado.e8 }}>📡</Text>
            <Text style={[s_center.title, { color: colors.textPrimary }]}>No pudimos cargar el menú</Text>
            <Text style={[s_center.sub, { color: colors.textSecondary }]}>{error}</Text>
            <Pressable onPress={retry} accessibilityRole="button" style={s_center.btnPrimary}>
              <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>Reintentar</Text>
            </Pressable>
          </View>
        ) : detail ? (
          <>
            {/* Cabecera del restaurante */}
            <RestaurantHeader detail={detail} />

            {isOpen === false && (
              <View style={[s.closedNote, { backgroundColor: alpha(colors.danger, 0.07), borderColor: alpha(colors.danger, 0.25) }]}>
                <Text style={{ color: colors.text.danger, fontSize: tipografia.caption, fontWeight: peso.fuerte, lineHeight: 16 }}>
                  Cerrado ahora · puedes dejar tu pedido y el restaurante lo confirmará cuando abra.
                </Text>
              </View>
            )}

            {detail.menu.length === 0 ? (
              /* Es una ESPERA: la carta la publica el restaurante. Se dice qué la llena y no
                 se inventa un botón (regla de la tanda 2 del informe). */
              <EmptyState
                icono={<Text style={{ fontSize: tipografia.emoji }}>🍽️</Text>}
                titulo="Todavía no hay ítems en el menú"
                texto="Los platos publicados y aprobados por el restaurante aparecerán aquí, con su precio."
              />
            ) : (
              CAT_ORDER.map((cat) => {
                const items = detail.menu.filter((m) => m.category === cat);
                if (items.length === 0) return null;
                return (
                  <View key={cat} style={{ marginBottom: espaciado.e18 }}>
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
        <View style={[s.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: espaciado.e10 + insets.bottom }]}>
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
    <View style={{ marginBottom: espaciado.e14 }}>
      <Text style={[s_h.name, { color: colors.textPrimary }]}>{detail.businessName}</Text>
      <Text style={[s_h.sub, { color: colors.textSecondary }]}>
        {detail.cuisineLabel ?? 'Restaurante'} · {detail.city}
      </Text>
      <View style={s_h.metaRow}>
        {open !== null ? (
          <View style={[s_h.badge, { backgroundColor: open ? alpha(colors.success, 0.14) : alpha(colors.danger, 0.12) }]}>
            <View style={[s_h.dot, { backgroundColor: open ? colors.success : colors.danger }]} />
            <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: open ? colors.text.success : colors.text.danger }}>
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
          <Star size={12} color={colors.text.secondary} fill={colors.text.secondary} />
          <Text style={[s_h.sub, { color: colors.textSecondary }]}>
            {detail.ratingAvg.toFixed(1)} · {detail.ratingCount} valoración{detail.ratingCount === 1 ? '' : 'es'}
          </Text>
        </View>
      )}
      {detail.address ? (
        <Text numberOfLines={2} style={[s_h.sub, { color: colors.textSecondary, marginTop: espaciado.e2 }]}>📍 {detail.address}</Text>
      ) : null}
      {km > 0 ? (
        <Text style={[s_h.sub, { color: ACCENT, fontWeight: peso.fuerte, marginTop: espaciado.e2 }]}>🛵 Reparto hasta {km} km</Text>
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
          <Text style={{ fontSize: tipografia.nota, fontWeight: peso.fuerte, color: colors.textSecondary, textAlign: 'center' }}>
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
                <Text style={[s_row.miniChipText, { color: colors.text.primary }]}>📏 {item.portionSize}</Text>
              </View>
            ) : null}
            {detailSummary ? (
              <View style={[s_row.miniChip, { backgroundColor: colors.border }]}>
                <Text style={[s_row.miniChipText, { color: colors.textPrimary }]}>{detailSummary}</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Precio valor={item.priceXaf} tamano="md" color={ACCENT} style={{ marginTop: espaciado.e2 }} />
      </View>
      {qty === 0 ? (
        <Pressable onPress={onAdd} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Añadir ${item.name}`}
          style={s_row.addBtn}>
          <Plus size={16} color={brand.white} strokeWidth={trazoIcono.marcado} />
        </Pressable>
      ) : (
        <View style={s_row.stepper}>
          <Pressable onPress={onDec} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Quitar uno de ${item.name}`}
            style={[s_row.stepBtn, { backgroundColor: colors.border }]}>
            <Minus size={14} color={colors.textPrimary} strokeWidth={trazoIcono.marcado} />
          </Pressable>
          <Text style={[s_row.qty, { color: colors.textPrimary }]}>{qty}</Text>
          <Pressable onPress={onInc} disabled={atMax} hitSlop={6} accessibilityRole="button"
            accessibilityLabel={`Añadir más ${item.name}`}
            style={[s_row.stepBtn, { backgroundColor: ACCENT, opacity: atMax ? 0.4 : 1 }]}>
            <Plus size={14} color={brand.white} strokeWidth={trazoIcono.marcado} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

function MenuSkeleton({ colors }: { colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <View>
      <View style={{ marginBottom: espaciado.e16, gap: espaciado.e7 }}>
        <View style={{ height: 18, borderRadius: radios.punta, backgroundColor: colors.border, width: '55%' }} />
        <View style={{ height: 11, borderRadius: radios.punta, backgroundColor: colors.border, width: '38%' }} />
        <View style={{ height: 11, borderRadius: radios.punta, backgroundColor: colors.border, width: '48%' }} />
      </View>
      <View style={{ height: 13, borderRadius: radios.punta, backgroundColor: colors.border, width: 90, marginBottom: espaciado.e10 }} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={[s_sk.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={{ width: 52, height: 52, borderRadius: radios.chip, backgroundColor: colors.border }} />
          <View style={{ flex: 1, marginLeft: espaciado.e10, gap: espaciado.e6 }}>
            <View style={{ height: 11, borderRadius: radios.punta, backgroundColor: colors.border, width: '70%' }} />
            <View style={{ height: 10, borderRadius: radios.punta, backgroundColor: colors.border, width: '45%' }} />
          </View>
          <View style={{ width: 30, height: 30, borderRadius: radios.hermano, backgroundColor: colors.border }} />
        </View>
      ))}
    </View>
  );
}

const s_h = StyleSheet.create({
  name: { fontSize: tipografia.cifra, fontWeight: peso.titulo },
  sub: { fontSize: tipografia.caption, marginTop: espaciado.e2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, marginTop: espaciado.e5, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, borderRadius: radios.chip, paddingHorizontal: espaciado.e7, paddingVertical: espaciado.e3 },
  dot: { width: 6, height: 6, borderRadius: radios.punta },
});

const s_row = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: radios.md, padding: espaciado.e10, marginBottom: espaciado.e8, borderWidth: trazo.fino },
  // 64 en vez de 52: la foto de un plato es lo primero que mira el cliente («¿esto tiene buena
  // pinta?»). A 52 px no se distinguía el plato; a 64 se ve, y sigue cabiendo en la fila.
  img: { width: 64, height: 64, borderRadius: radios.chip },
  imgFallback: { backgroundColor: 'rgba(255,107,53,0.08)', alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, marginLeft: espaciado.e10, marginRight: espaciado.e8 },
  name: { fontSize: tipografia.body, fontWeight: peso.fuerte },
  desc: { fontSize: tipografia.micro, marginTop: 1, lineHeight: 14 },
  price: { fontSize: tipografia.body, fontWeight: peso.titulo, color: ACCENT, marginTop: espaciado.e2 },
  addBtn: { backgroundColor: ACCENT, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e8, borderRadius: radios.chip },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 },
  stepBtn: { width: 30, height: 30, borderRadius: radios.hermano, alignItems: 'center', justifyContent: 'center' },
  qty: { fontSize: tipografia.body, fontWeight: peso.maximo, minWidth: 18, textAlign: 'center' },
  // ── Detalle del plato (041) ──
  // Nota: `card` usa alignItems:'center' a propósito. Con detalles la tarjeta
  // crece a 3-5 líneas y la foto y el stepper quedan centrados en vertical, que
  // es lo que ya pasa hoy con la descripción larga. No se cambia para no mover
  // el aspecto de los platos que no declaran ningún detalle.
  detailLine: { fontSize: tipografia.micro, marginTop: espaciado.e2, lineHeight: 14 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e5, marginTop: espaciado.e4 },
  miniChip: { borderRadius: radios.sm, paddingHorizontal: espaciado.e7, paddingVertical: espaciado.e3 },
  miniChipText: { fontSize: tipografia.nota, fontWeight: peso.fuerte, color: ACCENT },
});

const s_sk = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', borderRadius: radios.md, padding: espaciado.e10, marginBottom: espaciado.e8, borderWidth: trazo.fino },
});

const s_center = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 48, paddingHorizontal: espaciado.e28 },
  title: { fontSize: tipografia.cuerpo, fontWeight: peso.maximo, textAlign: 'center' },
  sub: { fontSize: tipografia.caption, textAlign: 'center', marginTop: espaciado.e6, lineHeight: 18 },
  btnPrimary: { marginTop: espaciado.e18, backgroundColor: ACCENT, paddingHorizontal: espaciado.e24, paddingVertical: espaciado.e11, borderRadius: radios.panelAncho },
});

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  content: { padding: espaciado.e16 },
  catTitle: { fontSize: tipografia.body, fontWeight: peso.maximo, color: c.textPrimary, marginBottom: espaciado.e8 },
  closedNote: { borderRadius: radios.chip, borderWidth: trazo.fino, padding: espaciado.e10, marginBottom: espaciado.e12 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: espaciado.e16, paddingTop: espaciado.e10, borderTopWidth: trazo.fino },
  cta: { backgroundColor: ACCENT, borderRadius: radios.md, paddingVertical: espaciado.e14, alignItems: 'center' },
  ctaText: { color: brand.white, fontSize: tipografia.cuerpo, fontWeight: peso.titulo },
});
