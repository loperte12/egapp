/**
 * FoodOrdersScreen — Mis pedidos (cliente u dueño) con timeline de estados
 * (placed→confirmed→preparing→ready→delivered), filtros por estado y
 * valoración tras entrega.
 *
 * Auditorías senior (2026-09-02):
 *  · Valoración con MODAL de 5 estrellas cross-platform (Alert.prompt era iOS).
 *  · Asignar repartidor en MODAL de lista (Alert con >3 botones rompe Android).
 *  · LISTA PAGINADA server-side (?page&limit&state, {items,total,hasMore}) con
 *    infinite scroll, footer propio (cargando/error/fin) y chips de filtro:
 *    Todos / En curso / Entregados / Cancelados (filtro en el servidor para que
 *    la paginación sea correcta).
 *  · Máquina de estados del cliente extraída a constantes (OWNER_FLOW/
 *    USER_FLOW) — un solo lugar, sincronizada con el backend.
 *  · Timeline con labels bajo cada punto y rol progressbar; cancelado = banner
 *    (sin stepper falso).
 *  · Carga skeleton / error+Reintentar / pull-to-refresh; vacíos por rol con
 *    CTA; fecha y hora completas del pedido; keys estables; a11y en acciones.
 * Ruta: /food-orders?as=user|owner
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Star } from 'lucide-react-native';
import { alpha, espaciado, GhostButton, radios, ScreenHeader, Sheet, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { foodApi, FoodOrder, FoodOrdersPage, FoodRider } from '../api/food';
import { formatDateTime, formatXAF } from '../utils/formatHelpers';
import { abrirMapa } from '../utils/maps';
import { brand } from '@egrouteplan/ui-kit';

type Role = 'user' | 'owner';
type StateFilter = '' | 'open' | 'delivered' | 'cancelled';

const ACCENT = brand.primary; // A1: la acción avanza en azul
const PAGE_SIZE = 20;
const STATUS: Record<string, { label: string; color: string }> = {
  placed: { label: 'Recibido', color: brand.warning },
  confirmed: { label: 'Confirmado', color: brand.info },
  preparing: { label: 'Preparando', color: brand.info },
  ready: { label: 'Listo', color: brand.success },
  delivered: { label: 'Entregado', color: brand.success },
  cancelled: { label: 'Cancelado', color: brand.neutral },
};
const FLOW = ['placed', 'confirmed', 'preparing', 'ready', 'delivered'] as const;
// Máquina de estados del cliente (única fuente; espejo del backend).
const OWNER_NEXT: Record<string, string | null> = {  placed: 'confirmed', confirmed: 'preparing', preparing: 'ready', ready: 'delivered', delivered: null, cancelled: null,
};
const USER_NEXT: Record<string, string | null> = {
  ready: 'delivered', delivered: null, cancelled: null,
};

/**
 * ¿Se puede cancelar este pedido, con este rol, en este estado?
 *
 * Es ESPEJO de la tabla del servidor (`updateOrderStatus`, reglas del Lote 1), y está aquí para no
 * ofrecer un botón que el servidor va a rechazar. Si algún día cambian las reglas, cambian en el
 * servidor y aquí: las dos listas tienen que decir lo mismo.
 *   · el CLIENTE, mientras no haya empezado la cocina;
 *   · el DUEÑO, en cualquier estado no entregado (es quien sabe si puede servir el pedido).
 */
const CANCELABLE_BY_OWNER = ['placed', 'confirmed', 'preparing', 'ready'];
const CANCELABLE_BY_USER = ['placed', 'confirmed'];
const puedeCancelar = (isOwner: boolean, status: string) =>
  (isOwner ? CANCELABLE_BY_OWNER : CANCELABLE_BY_USER).includes(status);
const STATE_CHIPS: Array<{ key: StateFilter; label: string }> = [
  { key: '', label: 'Todos' },
  { key: 'open', label: 'En curso' },
  { key: 'delivered', label: 'Entregados' },
  { key: 'cancelled', label: 'Cancelados' },
];
const SKELETONS = [0, 1, 2];

export default function FoodOrdersScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { as } = useLocalSearchParams<{ as?: string }>();
  const role: Role = as === 'owner' ? 'owner' : 'user';
  const isOwner = role === 'owner';

  const [orders, setOrders] = useState<FoodOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [stateFilter, setStateFilter] = useState<StateFilter>('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [reviewOrder, setReviewOrder] = useState<FoodOrder | null>(null);
  const [assignOrder, setAssignOrder] = useState<FoodOrder | null>(null);
  const [riders, setRiders] = useState<FoodRider[]>([]);
  const [ridersLoading, setRidersLoading] = useState(false);
  const reqId = useRef(0);
  const busyRef = useRef(false);
  // ── AVISO DE PEDIDO NUEVO AL DUEÑO (A3) ───────────────────────────────────────
  // Hasta hoy el dueño solo se enteraba si abría la pantalla o tiraba del dedo para refrescar: con
  // la app en segundo plano, un pedido entraba y nadie lo veía. En comida rápida eso es el cuello de
  // botella de todo el flujo.
  //  · Se consulta cada 30 s MIENTRAS LA PANTALLA ESTÁ ABIERTA (no en segundo plano: eso exige
  //    notificaciones push, que son otro trabajo).
  //  · Se guardan los ids ya vistos y se avisa SOLO de los que aparecen nuevos. Si no, cada consulta
  //    avisaría de los mismos pedidos y el aviso dejaría de significar nada.
  //  · El aviso **no** lo damos al abrir la pantalla por primera vez: los pedidos que ya estaban no
  //    son «nuevos», y avisar de ellos convertiría esto en ruido.
  const idsVistos = useRef<Set<string> | null>(null);
  const [pedidosNuevos, setPedidosNuevos] = useState(0);

  const buildQs = useCallback((pg: number): Record<string, string> => {
    const qs: Record<string, string> = { as: role, page: String(pg), limit: String(PAGE_SIZE) };
    if (stateFilter) qs.state = stateFilter;
    return qs;
  }, [role, stateFilter]);

  const apply = useCallback((r: FoodOrdersPage) => {
    setOrders(r.items);
    setTotal(r.total);
    setPage(r.page);
    setPageSize(r.limit);
    setHasMore(r.hasMore);
    setLoadMoreError(false);
  }, []);

  /** Primera página (montaje / cambio de filtro): sin datos stale. */
  const loadFirst = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    setOrders([]);
    setLoadMoreError(false);
    try {
      const r = await foodApi.myOrders(role, buildQs(1));
      if (id !== reqId.current) return;
      apply(r);
    } catch {
      if (id !== reqId.current) return;
      setError('No pudimos cargar los pedidos. Revisa tu conexión e inténtalo de nuevo.');
      setOrders([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [buildQs, role, apply]);

  /** Pull-to-refresh: conserva la lista visible. */
  const refresh = useCallback(async () => {
    const id = reqId.current;
    setRefreshing(true);
    try {
      const r = await foodApi.myOrders(role, buildQs(1));
      if (id !== reqId.current) return;
      apply(r);
      setError(null);
    } catch {
      // refresco fallido: se conserva la lista
    } finally {
      if (id === reqId.current) setRefreshing(false);
    }
  }, [buildQs, role, apply]);

  /** Infinite scroll: página siguiente al final. */
  const loadMore = useCallback(async () => {
    if (loading || refreshing || loadingMore || !hasMore) return;
    const id = reqId.current;
    const next = page + 1;
    setLoadingMore(true);
    setLoadMoreError(false);
    try {
      const r = await foodApi.myOrders(role, buildQs(next));
      if (id !== reqId.current) return;
      setOrders((prev) => [...prev, ...r.items]);
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
  }, [loading, refreshing, loadingMore, hasMore, page, buildQs, role]);

  useEffect(() => { loadFirst(); }, [loadFirst]);

  // ── El aviso de pedido nuevo (A3), en marcha ─────────────────────────────────
  useEffect(() => {
    // Solo para el DUEÑO: al cliente no le llegan pedidos, le salen (y avisarle de «pedidos nuevos»
    // sería avisarle de los suyos propios).
    if (role !== 'owner') return;
    let parado = false;
    const mirar = async () => {
      try {
        const r = await foodApi.myOrders('owner', { page: '1', limit: String(PAGE_SIZE), ...(stateFilter ? { state: stateFilter } : {}) });
        if (parado) return;
        const ids = new Set((r.items ?? []).map((o) => o.id));
        if (idsVistos.current) {
          const nuevos = [...ids].filter((id) => !idsVistos.current!.has(id));
          if (nuevos.length > 0) {
            setPedidosNuevos((n) => n + nuevos.length);
            // Se avisa con el nombre del restaurante y el importe: lo que el dueño necesita para
            // decidir si corre a la cocina, no un «tienes un pedido» genérico.
            const primero = (r.items ?? []).find((o) => nuevos.includes(o.id));
            Alert.alert(
              nuevos.length === 1 ? '🛎 Pedido nuevo' : `🛎 ${nuevos.length} pedidos nuevos`,
              primero ? `${primero.restaurantName ?? 'Tu restaurante'} · ${formatXAF(primero.totalXaf)}\n${(primero.items ?? []).map((i) => `${i.qty} × ${i.name}`).join(', ')}` : '',
              [{ text: 'Ver ahora', onPress: () => { setPedidosNuevos(0); void loadFirst(); } }, { text: 'Luego', style: 'cancel' }],
            );
          }
        }
        idsVistos.current = ids;
      } catch { /* sin conexión: se reintenta en la siguiente vuelta, sin molestar */ }
    };
    void mirar();                                   // la primera vuelta solo aprende qué hay
    const t = setInterval(mirar, 30_000);
    return () => { parado = true; clearInterval(t); };
  }, [role, stateFilter, loadFirst]);

  /** Ejecuta una transición tras confirmación del usuario. */
  const act = (o: FoodOrder, nextStatus: string) => {
    if (busyRef.current) return;
    const label = STATUS[nextStatus]?.label ?? nextStatus;
    Alert.alert('Confirmar acción', `¿Marcar el pedido como "${label}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí, continuar', onPress: () => doAct(o.id, nextStatus) },
    ]);
  };

  /**
   * Cancelar/rechazar, con confirmación y avisando de lo que NO se deshace.
   *
   * El mensaje es distinto según quién cancela, porque la consecuencia es distinta: al cliente hay
   * que decirle que el pedido no se hará; al dueño, que el cliente se quedará sin él. Y si el pedido
   * venía pagado por Billing, se avisa de que la factura queda abierta para que el admin la rechace
   * — es un fleco conocido (toca el módulo de pagos) y es mejor decirlo que callarlo.
   */
  const cancelar = (o: FoodOrder) => {
    if (busyRef.current) return;
    const conBilling = o.paymentMethod === 'billing';
    const esDueno = role === 'owner';
    Alert.alert(
      esDueno ? 'Rechazar pedido' : 'Cancelar pedido',
      (esDueno
        ? 'El cliente se quedará sin este pedido. Se le avisará.'
        : 'El restaurante dejará de prepararlo. Si ya había empezado, habla con él.')
      + (conBilling ? '\n\nEl pago era por Billing: la factura queda abierta y administración tendrá que rechazarla.' : ''),
      [
        { text: 'No cancelar', style: 'cancel' },
        { text: esDueno ? 'Sí, rechazar' : 'Sí, cancelar', style: 'destructive', onPress: () => doAct(o.id, 'cancelled') },
      ],
    );
  };

  const doAct = async (id: string, nextStatus: string) => {    if (busyRef.current) return;
    busyRef.current = true;
    setBusyOrderId(id);
    try {
      await foodApi.updateStatus(id, nextStatus, role);
      await refresh();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo actualizar el pedido');
    } finally {
      busyRef.current = false;
      setBusyOrderId(null);
    }
  };

  const openAssign = async (o: FoodOrder) => {
    setAssignOrder(o);
    setRidersLoading(true);
    setRiders([]);
    try {
      setRiders(await foodApi.activeRiders());
    } catch { /* empty state */ }
    finally { setRidersLoading(false); }
  };

  const assignRider = async (rider: FoodRider) => {
    if (!assignOrder || busyRef.current) return;
    busyRef.current = true;
    setBusyOrderId(assignOrder.id);
    try {
      const res = await foodApi.assignRider(assignOrder.id, rider.id);
      setAssignOrder(null);
      Alert.alert('Repartidor asignado', res.message);
      await refresh();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo asignar el repartidor');
    } finally {
      busyRef.current = false;
      setBusyOrderId(null);
    }
  };

  const listData: FoodOrder[] = useMemo(() => {
    if (loading && !orders.length) return SKELETONS.map((i) => ({ id: `__sk_${i}` } as FoodOrder));
    return orders;
  }, [loading, orders]);
  const isSkeleton = (id: string) => id.startsWith('__sk_');

  const s = styles(colors);
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Header — del kit desde el 24/09/2026 (piloto de la unificación de las 21 cabeceras).
          Las dos claves locales `header`/`headerTitle` se retiran: son 5 literales menos en la
          guardia y, sobre todo, ya no hay 21 copias de la misma fila que mantener a la vez. */}
      <ScreenHeader
        titulo={isOwner ? 'Pedidos recibidos' : 'Mis pedidos'}
        alVolver={() => router.back()}
      />

      <FlatList
        data={listData}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: espaciado.e16, paddingBottom: espaciado.e32 + insets.bottom }}
        refreshing={refreshing}
        onRefresh={refresh}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View>
            {/* Filtros por estado (server-side: la paginación sigue siendo correcta) */}
            <View style={{ flexDirection: 'row', gap: espaciado.e8, paddingVertical: espaciado.e12, flexWrap: 'wrap' }}>
              {STATE_CHIPS.map((c) => (
                <Chip key={c.key || 'all'} label={c.label} active={stateFilter === c.key}
                  onPress={() => setStateFilter(stateFilter === c.key ? '' : c.key)} />
              ))}
            </View>
            {!error && (
              <Text style={s.resultsLabel}>
                {loading ? 'Cargando…' : `${total} pedido${total === 1 ? '' : 's'}`}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          error ? (
            <View style={s_center.wrap}>
              <Text style={{ fontSize: tipografia.kpi, marginBottom: espaciado.e8 }}>📡</Text>
              <Text style={[s_center.title, { color: colors.textPrimary }]}>Algo salió mal</Text>
              <Text style={[s_center.sub, { color: colors.textSecondary }]}>{error}</Text>
              <Pressable onPress={loadFirst} accessibilityRole="button" style={s_center.btnPrimary}>
                <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>Reintentar</Text>
              </Pressable>
            </View>
          ) : loading ? null : stateFilter !== '' ? (
            <View style={s_center.wrap}>
              <Text style={{ fontSize: tipografia.emoji, marginBottom: espaciado.e10 }}>📭</Text>
              <Text style={[s_center.title, { color: colors.textPrimary }]}>Sin pedidos en este estado</Text>
              <Text style={[s_center.sub, { color: colors.textSecondary }]}>Prueba con otro filtro.</Text>
              <Pressable onPress={() => setStateFilter('')} accessibilityRole="button" style={s_center.btnGhost}>
                <Text style={{ color: ACCENT, fontWeight: peso.maximo, fontSize: tipografia.body }}>Ver todos</Text>
              </Pressable>
            </View>
          ) : (
            <View style={s_center.wrap}>
              <Text style={{ fontSize: tipografia.emoji, marginBottom: espaciado.e10 }}>{isOwner ? '🍽️' : '🛒'}</Text>
              <Text style={[s_center.title, { color: colors.textPrimary }]}>
                {isOwner ? 'Aún no recibes pedidos' : 'Todavía no has pedido'}
              </Text>
              <Text style={[s_center.sub, { color: colors.textSecondary }]}>
                {isOwner
                  ? 'Cuando alguien pida en tu restaurante aparecerá aquí.'
                  : 'Elige un restaurante y pide para recoger o recibir en casa.'}
              </Text>
              <Pressable
                onPress={() => router.push((isOwner ? '/food-owner' : '/food') as any)}
                accessibilityRole="button"
                style={s_center.btnPrimary}
              >
                <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>
                  {isOwner ? 'Ir a mi restaurante' : 'Ver restaurantes'}
                </Text>
              </Pressable>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={s.footerNote}><ActivityIndicator size="small" color={colors.primary} /></View>
          ) : loadMoreError ? (
            <Pressable onPress={loadMore} style={s.footerNote} accessibilityRole="button">
              <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>No se pudieron cargar más pedidos · Reintentar</Text>
            </Pressable>
          ) : !hasMore && total > pageSize ? (
            <View style={s.footerNote}><Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>Fin de los pedidos</Text></View>
          ) : null
        }
        renderItem={({ item }) =>
          isSkeleton(item.id) ? (
            <OrdersSkeleton key={item.id} colors={colors} />
          ) : (
            <OrderCard
              key={item.id}
              order={item}
              role={role}
              busy={busyOrderId === item.id}
              onAct={(next) => act(item, next)}
              onCancel={() => cancelar(item)}
              onAssign={() => openAssign(item)}
              onReview={() => setReviewOrder(item)}
            />
          )
        }
      />

      {/* Modal de valoración (5 estrellas, Android + iOS) */}
      {reviewOrder && (
        <ReviewModal
          key={reviewOrder.id}
          order={reviewOrder}
          onClose={() => setReviewOrder(null)}
          onDone={async (rating) => {
            try {
              const r = await foodApi.review(reviewOrder.id, rating);
              setReviewOrder(null);
              Alert.alert('Valoración', r.message);
              await refresh();
            } catch (e) {
              Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo valorar el pedido');
            }
          }}
        />
      )}

      {/* Modal de asignación de repartidor (lista, seguro en Android) */}
      {assignOrder && (
        /*
          Era un `<Modal>` a mano que repetía lo del `Sheet` (fondo, cierre al tocar fuera, foco
          atrapado) y además no anunciaba el título como cabecera. El contenido es el mismo.
        */
        <Sheet
          visible
          position="bottom"
          title="Asignar repartidor"
          subtitle={`${assignOrder.restaurantName} · ${formatXAF(assignOrder.totalXaf)} · a domicilio`}
          onClose={() => setAssignOrder(null)}
        >
          {/* La lista lleva su propio marginBottom: se envuelve para que el gap del Sheet no lo doble. */}
          <View>
        {ridersLoading ? (
          <ActivityIndicator style={{ paddingVertical: espaciado.e24 }} color={colors.primary} />
        ) : riders.length === 0 ? (
          <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, paddingVertical: espaciado.e18, textAlign: 'center' }}>
            No hay repartidores activos todavía. Aprueba uno desde el panel de administración.
          </Text>
        ) : (
          riders.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => assignRider(r)}
              accessibilityRole="button"
              accessibilityLabel={`Asignar a ${r.fullName}`}
              style={[s.riderRow, { backgroundColor: colors.surface, borderColor: colors.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: tipografia.body, fontWeight: peso.fuerte, color: colors.textPrimary }}>{r.fullName}</Text>
                <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>
                  {r.vehicleType === 'moto' ? '🛵 Moto' : r.vehicleType === 'bici' ? '🚲 Bici' : '🚗 Coche'}
                  {r.zone ? ` · ${r.zone}` : ''} · {r.deliveriesCount} entregas
                </Text>
              </View>
              <Text style={{ color: colors.primary, fontWeight: peso.maximo, fontSize: tipografia.caption }}>Asignar →</Text>
            </Pressable>
          ))
        )}

          </View>
          <Pressable onPress={() => setAssignOrder(null)} accessibilityRole="button" style={{ alignSelf: 'center', paddingVertical: espaciado.e10 }}>
            <Text style={{ color: colors.textSecondary, fontWeight: peso.fuerte, fontSize: tipografia.body }}>Cancelar</Text>
          </Pressable>
        </Sheet>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }}
      style={[s_chip.base, { backgroundColor: active ? ACCENT : colors.surface, borderColor: active ? ACCENT : colors.border }]}>
      <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: active ? brand.white : colors.textPrimary }}>{label}</Text>
    </Pressable>
  );
}

function OrderCard({ order: o, role, busy, onAct, onAssign, onReview, onCancel }: {
  order: FoodOrder; role: Role; busy: boolean;
  onAct: (nextStatus: string) => void; onAssign: () => void; onReview: () => void; onCancel: () => void;
}) {
  const { colors } = useTheme();
  const isOwner = role === 'owner';
  const st = STATUS[o.status] ?? { label: o.status, color: colors.textSecondary };
  const cancelled = o.status === 'cancelled';
  const idx = cancelled ? -1 : FLOW.indexOf(o.status as (typeof FLOW)[number]);
  const billingPending = o.paymentMethod === 'billing' && o.billingStatus !== 'approved';
  const nextAction = (isOwner ? OWNER_NEXT : USER_NEXT)[o.status] ?? null;
  // Con Billing sin aprobar el dueño NO puede confirmar (gate backend + UI).
  const showConfirm = !(isOwner && nextAction === 'confirmed' && billingPending);
  return (
    <View style={[s_card.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Cabecera: restaurante + estado + fecha/hora */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaciado.e8 }}>
        <Text numberOfLines={1} style={{ flex: 1, fontSize: tipografia.body, fontWeight: peso.maximo, color: colors.textPrimary }}>{o.restaurantName}</Text>
        <View style={{ backgroundColor: alpha(st.color, 0.12), paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3, borderRadius: radios.sm }}>
          <Text style={{ fontSize: tipografia.micro, fontWeight: peso.maximo, color: st.color }}>{st.label}</Text>
        </View>
      </View>
      <Text style={{ fontSize: 10.5, color: colors.textSecondary, marginTop: espaciado.e2 }}>{formatDateTime(o.createdAt)}</Text>

      {/* Líneas */}
      {o.items.map((it, i) => (
        <Text key={`${o.id}-${it.itemId}-${i}`} style={{ fontSize: tipografia.caption, color: colors.textSecondary, marginTop: espaciado.e2 }}>{it.qty} × {it.name}</Text>
      ))}
      <Text style={{ fontSize: tipografia.body, fontWeight: peso.titulo, color: ACCENT, marginTop: espaciado.e4 }}>
        {formatXAF(o.totalXaf)} · {o.pickupType === 'delivery' ? 'a domicilio' : 'recoger'} · {o.paymentMethod === 'cash' ? 'efectivo' : 'Billing'}
      </Text>

      {/* Pago Billing */}
      {billingPending && (
        <Text style={{ fontSize: tipografia.micro, fontWeight: peso.fuerte, color: brand.warning, marginTop: espaciado.e4 }}>
          ⏳ Comprobante de pago pendiente (2–24 h){isOwner ? ' · se confirma al aprobarse' : ''}
        </Text>
      )}
      {o.paymentMethod === 'billing' && o.billingStatus === 'approved' && (
        <Text style={{ fontSize: tipografia.micro, fontWeight: peso.fuerte, color: brand.success, marginTop: espaciado.e4 }}>✓ Pago Billing aprobado</Text>
      )}

      {/* ── PEDIDO PROGRAMADO ────────────────────────────────────────────────────
          Se pidió con el local cerrado: se entregará a la hora que abre. Sin esto, el cliente ve un
          pedido «en curso» que nadie está cocinando y el dueño cree que llega tarde. */}
      {o.scheduledFor ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, marginTop: espaciado.e6, backgroundColor: alpha(brand.decoIndigo, 0.12), borderRadius: radios.sm, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e5 }}>
          <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: brand.decoIndigo }}>
            🕐 Programado para {formatDateTime(o.scheduledFor)}
          </Text>
        </View>
      ) : null}

      {/* ── EL DESGLOSE DEL DINERO (dueño Y cliente) ─────────────────────────────
          Decisión del dueño (2026-09-12): «la comisión se muestra a ambos».
          Las dos comisiones van en líneas SEPARADAS a propósito: es lo que hace Meituan y lo que
          evita que el comerciante crea que «le quitan el 20%» cuando la mitad es el reparto.

          Pero el MISMO número significa cosas distintas según quién lo lea, y por eso el texto
          cambia: las comisiones salen del restaurante (restaurantNet = bruto − comisiones, ver
          food-fees.ts), NO del cliente — el cliente paga el bruto. Mostrar «− 800 XAF» a un
          cliente sin aclararlo le haría creer que se le cobran 800 de más. De ahí que para el
          cliente las cifras vayan sin signo menos y con la explicación debajo.

          El neto del restaurante («Te queda») sigue siendo SOLO del dueño: es su margen comercial,
          no hay razón para que un cliente lo vea, y la decisión fue sobre la comisión. */}
      {o.platformFeeXaf !== null && o.riderFeeXaf !== null ? (
        <View style={{ marginTop: espaciado.e8, borderTopWidth: trazo.fino, borderTopColor: colors.border, paddingTop: espaciado.e6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary }}>Comisión de la plataforma</Text>
            <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary }}>
              {isOwner ? '− ' : ''}{formatXAF(o.platformFeeXaf)}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary }}>Comisión del reparto</Text>
            <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary }}>
              {isOwner ? '− ' : ''}{formatXAF(o.riderFeeXaf)}
            </Text>
          </View>
          {isOwner ? (
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: espaciado.e3 }}>
              <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: colors.textPrimary }}>Te queda</Text>
              <Text style={{ fontSize: tipografia.caption, fontWeight: peso.titulo, color: brand.success }}>
                {o.restaurantNetXaf !== null ? formatXAF(o.restaurantNetXaf) : '—'}
              </Text>
            </View>
          ) : (
            <Text style={{ fontSize: 10.5, color: colors.textSecondary, marginTop: espaciado.e4, lineHeight: 14 }}>
              Estas comisiones las paga el restaurante, no tú: ya van incluidas en el precio que pagaste.
            </Text>
          )}
        </View>
      ) : null}

      {/* Dirección y nota (el dueño reparte sin ciegas) */}
      {o.pickupType === 'delivery' && o.deliveryAddress ? (
        <Text numberOfLines={2} style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e4 }}>📍 {o.deliveryAddress}</Text>
      ) : null}
      {o.note ? (
        <Text numberOfLines={2} style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2 }}>📝 {o.note}</Text>
      ) : null}

      {/* ── PUNTO DE ENCUENTRO ────────────────────────────────────────────────────
          Lo anota el REPARTIDOR al llegar y aquí lo ve el CLIENTE: es la respuesta al hotel, las
          viviendas sociales o el portal sin número, donde la dirección no basta para encontrarse.
          Se muestra en cuanto existe, sin tocar nada: el repartidor ya avisó por SMS también. */}
      {o.meetingNote ? (
        <View style={{ marginTop: espaciado.e6, borderRadius: 10, borderWidth: trazo.fino, padding: espaciado.e10, borderColor: alpha(colors.success, 0.45), backgroundColor: alpha(colors.success, 0.10) }}>
          <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: colors.success }}>🤝 El repartidor te espera aquí</Text>
          <Text style={{ fontSize: tipografia.caption, color: colors.textPrimary, marginTop: espaciado.e3, lineHeight: 16 }}>{o.meetingNote}</Text>
          {typeof o.meetingLat === 'number' && typeof o.meetingLng === 'number' ? (
            <Pressable
              onPress={() => abrirMapa(o.meetingLat as number, o.meetingLng as number, o.meetingNote ?? null)}
              accessibilityRole="button"
              accessibilityLabel="Ver el punto de encuentro en el mapa"
              style={{ marginTop: espaciado.e6, alignSelf: 'flex-start' }}
            >
              <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: ACCENT }}>Ver en el mapa</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Timeline (o estado cerrado) */}
      {cancelled ? (
        <View style={[s_card.cancelledBox, { backgroundColor: alpha(brand.neutral, 0.1) }]}>
          <Text style={{ color: brand.neutral, fontSize: tipografia.caption, fontWeight: peso.maximo }}>Pedido cerrado · cancelado</Text>
        </View>
      ) : (
        <View
          accessibilityRole="progressbar"
          accessibilityLabel={`Pedido en "${st.label}", paso ${Math.max(idx, 0) + 1} de ${FLOW.length}`}
          style={{ marginTop: espaciado.e10 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {FLOW.map((stName, i) => {
              const done = i <= idx;
              return (
                <View key={stName} style={{ flex: 1, alignItems: 'center' }}>
                  <View style={{ width: 10, height: 10, borderRadius: radios.marca, backgroundColor: done ? ACCENT : colors.border }} />
                  {i < FLOW.length - 1 && <View style={{ height: 2, flex: 1, backgroundColor: i < idx ? ACCENT : colors.border, marginHorizontal: -10 }} />}
                </View>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', marginTop: espaciado.e4 }}>
            {FLOW.map((stName) => {
              const pos = FLOW.indexOf(stName);
              return (
                <Text key={stName} numberOfLines={1}
                  style={{ flex: 1, textAlign: 'center', fontSize: tipografia.sello, fontWeight: pos <= idx ? peso.maximo : peso.medio, color: pos <= idx ? ACCENT : colors.textSecondary }}>
                  {STATUS[stName].label}
                </Text>
              );
            })}
          </View>
        </View>
      )}

      {/* ETA de cocina (041): solo en pedidos en curso y si algún plato declaró
          su tiempo. `estPrepMinutes` es el plato MÁS LENTO; los pedidos creados
          antes de la migración vienen null y no muestran nada. */}
      {!cancelled && o.status !== 'delivered' && typeof o.estPrepMinutes === 'number' && o.estPrepMinutes > 0 && (
        <View style={[s_card.etaBox, { backgroundColor: alpha(ACCENT, 0.08), borderColor: alpha(ACCENT, 0.25) }]}>
          <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: ACCENT }}>
            ⏱️ Tiempo de cocina estimado: ~{o.estPrepMinutes} min
          </Text>
          <Text style={{ fontSize: 10.5, color: colors.textSecondary, marginTop: espaciado.e2 }}>
            {o.status === 'placed'
              ? 'Se cuenta desde que el restaurante confirme tu pedido.'
              : 'A contar desde que el restaurante empieza a preparar.'}
          </Text>
        </View>
      )}

      {/* Acciones */}
      {busy ? (
        <View style={{ alignItems: 'center', paddingVertical: espaciado.e12 }}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e12, flexWrap: 'wrap' }}>
          {isOwner && o.pickupType === 'delivery' && !o.riderId && ['placed', 'confirmed'].includes(o.status) && (
            <GhostButton title="Asignar repartidor" accessibilityLabel="Asignar repartidor a este pedido"
              accessibilityHint="Abre la lista de repartidores disponibles" onPress={onAssign} />
          )}
          {nextAction && showConfirm && (
            <GhostButton
              title={nextAction === 'delivered' ? 'Marcar entregado' : `Avanzar a "${STATUS[nextAction].label}"`}
              accessibilityLabel={`Marcar pedido como ${STATUS[nextAction].label}`}
              onPress={() => onAct(nextAction)}
            />
          )}
          {!isOwner && o.status === 'ready' && (
            <GhostButton title="He recibido mi pedido" accessibilityLabel="Marcar pedido como recibido" onPress={() => onAct('delivered')} />
          )}
          {!isOwner && o.status === 'delivered' && !o.reviewed && (
            <GhostButton title="Valorar" accessibilityLabel="Valorar este pedido" onPress={onReview} />
          )}
          {!isOwner && o.status === 'delivered' && o.reviewed && (
            <Text style={{ color: brand.success, fontSize: tipografia.caption, fontWeight: peso.fuerte, alignSelf: 'center' }}>✓ Valoración enviada</Text>
          )}
          {/* ── RECHAZAR / CANCELAR ─────────────────────────────────────────────────
              Es la salida que faltaba en todo el flujo: hasta hoy `cancelled` era inalcanzable y un
              restaurante con un pedido que no puede servir (local cerrado, plato agotado) se quedaba
              con él para siempre. Las reglas las decide el SERVIDOR y son distintas por rol:
                · el cliente cancela mientras no haya empezado la cocina (placed | confirmed);
                · el dueño cancela en cualquier estado no entregado (incluido preparing).
              La app solo ofrece el botón donde el servidor lo va a aceptar: prometer un botón que
              responde 400 es peor que no tenerlo. */}
          {puedeCancelar(isOwner, o.status) ? (
            <GhostButton
              title={isOwner ? 'Rechazar pedido' : 'Cancelar pedido'}
              accessibilityLabel={isOwner ? 'Rechazar este pedido' : 'Cancelar este pedido'}
              accessibilityHint="Se pide confirmación antes de cancelarlo"
              onPress={onCancel}
            />
          ) : null}
        </View>
      )}
    </View>
  );
}

function ReviewModal({ order, onClose, onDone }: {
  order: FoodOrder; onClose: () => void; onDone: (rating: number) => Promise<void>;
}) {
  const { colors } = useTheme();
  const [rating, setRating] = useState(0);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const submit = async () => {
    if (rating < 1 || rating > 5 || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    await onDone(rating);
    busyRef.current = false;
    setBusy(false);
  };

  return (
    /*
      Valorar tu pedido. Era un `<Modal>` a mano que repetía lo del `Sheet` (fondo, cierre al
      tocar fuera, foco atrapado) y no anunciaba el título como cabecera. El nombre del
      restaurante pasa al subtítulo.
    */
    <Sheet
      visible
      position="center"
      busy={busy}
      title="Valorar tu pedido"
      subtitle={order.restaurantName ?? undefined}
      onClose={onClose}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: espaciado.e6 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setRating(n)} hitSlop={4}
            accessibilityRole="button" accessibilityLabel={`${n} de 5 estrellas`}
            accessibilityState={{ selected: rating >= n }}>
            <Star size={32} color={n <= rating ? brand.warning : colors.border} fill={n <= rating ? brand.warning : 'transparent'} />
          </Pressable>
        ))}
      </View>
      <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.textPrimary, textAlign: 'center', marginTop: espaciado.e10, minHeight: 18 }}>
        {rating === 0 ? 'Toca las estrellas para puntuar' : `${rating} de 5`}
      </Text>
      <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e16 }}>
        <Pressable onPress={onClose} disabled={busy} accessibilityRole="button"
          style={[s_rm.btnGhost, { borderColor: colors.border }]}>
          <Text style={{ color: colors.textSecondary, fontWeight: peso.maximo, fontSize: tipografia.body }}>Cancelar</Text>
        </Pressable>
        <Pressable onPress={submit} disabled={busy || rating === 0} accessibilityRole="button"
          style={[s_rm.btnPrimary, { opacity: busy || rating === 0 ? 0.5 : 1 }]}>
          {busy
            ? <ActivityIndicator size="small" color={brand.white} />
            : <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>Enviar valoración</Text>}
        </Pressable>

          </View>
    </Sheet>
  );
}

function OrdersSkeleton({ colors }: { colors: ReturnType<typeof useTheme>['colors'] }) {
  return (
    <View style={[s_sk.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={{ height: 13, borderRadius: radios.punta, backgroundColor: colors.border, width: '55%' }} />
      <View style={{ height: 10, borderRadius: radios.punta, backgroundColor: colors.border, width: '30%', marginTop: espaciado.e8 }} />
      <View style={{ height: 10, borderRadius: radios.punta, backgroundColor: colors.border, width: '75%', marginTop: espaciado.e6 }} />
      <View style={{ height: 13, borderRadius: radios.punta, backgroundColor: colors.border, width: '40%', marginTop: espaciado.e10 }} />
    </View>
  );
}

const s_chip = StyleSheet.create({
  base: { paddingHorizontal: espaciado.e13, paddingVertical: espaciado.e7, borderRadius: radios.lg, borderWidth: trazo.fino },
});

const s_card = StyleSheet.create({
  card: { borderRadius: 14, padding: espaciado.e14, marginBottom: espaciado.e12, borderWidth: trazo.fino },
  cancelledBox: { borderRadius: 10, padding: espaciado.e8, marginTop: espaciado.e10, alignItems: 'center' },
  etaBox: { borderRadius: 10, borderWidth: trazo.fino, padding: espaciado.e9, marginTop: espaciado.e10 },
});

const s_rm = StyleSheet.create({
  btnGhost: { flex: 1, borderRadius: radios.md, borderWidth: trazo.fino, paddingVertical: espaciado.e12, alignItems: 'center' },
  btnPrimary: { flex: 1, borderRadius: radios.md, backgroundColor: ACCENT, paddingVertical: espaciado.e12, alignItems: 'center' },
});

const s_sk = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: trazo.fino, padding: espaciado.e14, marginBottom: espaciado.e12 },
});

const s_center = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 48, paddingHorizontal: espaciado.e28 },
  title: { fontSize: 15, fontWeight: peso.maximo, textAlign: 'center' },
  sub: { fontSize: tipografia.caption, textAlign: 'center', marginTop: espaciado.e6, lineHeight: 18 },
  btnPrimary: { marginTop: espaciado.e18, backgroundColor: ACCENT, paddingHorizontal: espaciado.e24, paddingVertical: espaciado.e11, borderRadius: radios.panelAncho },
  btnGhost: { marginTop: espaciado.e18, paddingHorizontal: espaciado.e24, paddingVertical: espaciado.e11, borderRadius: radios.panelAncho, borderWidth: trazo.fino, borderColor: ACCENT },
});

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  resultsLabel: { fontSize: tipografia.caption, fontWeight: peso.fuerte, color: c.textSecondary, marginBottom: espaciado.e10 },
  footerNote: { paddingVertical: espaciado.e16, alignItems: 'center' },
  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: espaciado.e18, maxHeight: '75%' },
  modalTitle: { fontSize: tipografia.subtitle, fontWeight: peso.titulo, marginBottom: espaciado.e4 },
  riderRow: { flexDirection: 'row', alignItems: 'center', borderRadius: radios.md, borderWidth: trazo.fino, padding: espaciado.e12, marginBottom: espaciado.e8 },
});
