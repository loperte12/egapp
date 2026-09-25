/**
 * Life Book — PEDIDOS (/lifebook-orders?side=buyer|seller).
 * Pestañas Compras/Ventas con estado, precio, contraparte y acciones
 * (vendedor: aceptar/rechazar → enviar → entregar; comprador: cancelar/disputar),
 * más "Ver anuncio" y "Hablar" con la contraparte.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, EmptyState, espaciado, radios, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { ArrowLeft, MessageCircle, PackageOpen, ShoppingBag, Store } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { absUrl } from '../api/config';
import { lifebookOrdersApi, lifebookChatApi, type LbOrder } from '../api/lifebook';
import { commerceOrdersApi, type LbOrderCard } from '../api/commerce';
import { LB_ORDER_META, LB_ORDER_ACTIONS, LB_ORDER_BUYER_ACTIONS, LB_ORDER_ACTION_LABEL, lbXaf } from '../constants/lifebook';
import FloatingFooter, { DOCK_BODY_H } from '../components/FloatingFooter';
import { useAppDock } from '../core/useAppDock';
import { ir as irSeguro } from '../constants/rutas';

export default function OrdersScreen() {
  return (
    <AuthGate>
      <OrdersContent />
    </AuthGate>
  );
}

function OrdersContent() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{ side?: string }>();
  const [side, setSide] = useState<'buyer' | 'seller'>(p.side === 'seller' ? 'seller' : 'buyer');
  const [orders, setOrders] = useState<LbOrder[] | null>(null);
  // Parte 36: pedidos del COMERCIO (carrito/tienda) — van arriba de la lista.
  const [comercio, setComercio] = useState<LbOrderCard[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const dock = useAppDock();

  const load = useCallback(async () => {
    try { setOrders(await lifebookOrdersApi.mine(side)); }
    catch { setOrders([]); }
    try {
      const page = await commerceOrdersApi.mine(side);
      setComercio(page.orders ?? []);
    } catch { setComercio([]); }
  }, [side]);
  useEffect(() => { load(); }, [load]);

  const act = async (order: LbOrder, action: string) => {
    setBusyId(order.id);
    try {
      await lifebookOrdersApi.action(order.id, action);
      await load();
    } catch (e) {
      Alert.alert('Pedidos', e instanceof Error ? e.message : 'No se pudo cambiar el estado.');
    } finally { setBusyId(null); }
  };

  const talk = async (order: LbOrder) => {
    try {
      const otherId = side === 'buyer' ? order.seller.id : order.buyer.id;
      const otherName = side === 'buyer' ? order.seller.fullName : order.buyer.fullName;
      const conv = await lifebookChatApi.open(otherId);
      irSeguro.libre('/lifebook-chat/[id]', { id: conv.id, name: otherName ?? 'Chat' });
    } catch { Alert.alert('Mensajes', 'No se pudo abrir la conversación.'); }
  };

  const allowed = (order: LbOrder) => side === 'seller' ? (LB_ORDER_ACTIONS[order.status] ?? []) : (LB_ORDER_BUYER_ACTIONS[order.status] ?? []);
  const otherOf = (o: LbOrder) => (side === 'buyer' ? o.seller : o.buyer);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.topBar, { borderBottomColor: colors.border, paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingVertical: espaciado.e4 }}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Pedidos</Text>
        {/* Parte 39: desde Ventas se entra directo al panel de la tienda. */}
        {side === 'seller' ? (
          <Pressable
            onPress={() => irSeguro.libre('/lifebook-merchant')}
            hitSlop={8}
            accessibilityLabel="Panel de mi tienda"
            style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, backgroundColor: alpha(colors.primary, 0.12), borderRadius: radios.full, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e5 }}
          >
            <Store size={13} color={colors.primary} />
            <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.titulo }}>Mi tienda</Text>
          </Pressable>
        ) : null}
        <View style={{ flexDirection: 'row', backgroundColor: colors.surface, borderRadius: radios.full, padding: espaciado.e3 }}>
          {(['buyer', 'seller'] as const).map((s) => (
            <Pressable key={s} onPress={() => setSide(s)} style={[styles.seg, { backgroundColor: side === s ? colors.primary : 'transparent' }]}>
              <Text style={{ color: side === s ? brand.white : colors.textSecondary, fontWeight: peso.titulo, fontSize: tipografia.caption }}>{s === 'buyer' ? 'Compras' : 'Ventas'}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {orders === null ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(o) => o.id}
          ListHeaderComponent={
            comercio.length ? (
              <View style={{ paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e6 }}>
                <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.titulo, marginTop: espaciado.e10, marginBottom: espaciado.e8 }}>
                  Pedidos de tienda
                </Text>
                {comercio.map((o) => {
                  const meta = LB_ORDER_META[o.status] ?? { label: o.status, color: colors.textSecondary };
                  return (
                    <Pressable
                      key={o.id}
                      onPress={() => irSeguro.libre('/lifebook-order/[id]', { id: o.id })}
                      accessibilityLabel={`Pedido ${o.code}`}
                      style={[styles.commerceCard, { borderColor: colors.border, backgroundColor: colors.surface }]}
                    >
                      {o.mediaUrl ? (
                        <Image source={{ uri: absUrl(o.mediaUrl) }} style={styles.commerceThumb} />
                      ) : (
                        <View style={[styles.commerceThumb, { backgroundColor: colors.card }]} />
                      )}
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>
                          {o.code} · {o.title}
                        </Text>
                        <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>
                          {side === 'buyer' ? (o.shop?.name ?? 'Tienda') : (o.buyer?.name ?? 'Cliente')}
                          {' · '}{o.itemsCount} artículo{o.itemsCount === 1 ? '' : 's'}
                        </Text>
                        <Text style={{ color: meta.color, fontSize: tipografia.caption, fontWeight: peso.titulo, marginTop: espaciado.e3 }}>{meta.label}</Text>
                      </View>
                      <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.body }}>{lbXaf(o.totalXaf)}</Text>
                    </Pressable>
                  );
                })}
                <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.titulo, marginTop: espaciado.e14, marginBottom: espaciado.e6 }}>
                  Pedidos de publicaciones
                </Text>
              </View>
            ) : null
          }
          contentContainerStyle={{ padding: espaciado.e14, paddingBottom: DOCK_BODY_H + insets.bottom + 20, flexGrow: 1 }}
          refreshing={false}
          onRefresh={load}
          ListEmptyComponent={
            <EmptyState
              icono={<PackageOpen size={42} color={alpha(colors.primary, 0.45)} />}
              titulo={side === 'buyer' ? 'Aún no has comprado nada' : 'Aún no tienes ventas'}
              texto={side === 'buyer'
                ? 'Cuando pidas un producto del feed aparecerá aquí, con su estado y lo que puedes hacer.'
                : 'Cuando alguien pida tu producto aparecerá aquí, con su estado y lo que puedes hacer.'}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => {
            const meta = LB_ORDER_META[item.status] ?? { label: item.status, color: colors.textSecondary };
            const other = otherOf(item);
            const actions = allowed(item);
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', gap: espaciado.e10 }}>
                  {item.media?.[0] ? (
                    <Pressable onPress={() => irSeguro.libre('/lifebook-post/[id]', { id: item.postId })}>
                      <Image source={{ uri: absUrl(item.media[0].url) }} style={[styles.thumb, { backgroundColor: colors.surface }]} />
                    </Pressable>
                  ) : (
                    <View style={[styles.thumb, { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }]}>
                      <ShoppingBag size={20} color={colors.textSecondary} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaciado.e6 }}>
                      <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.maximo }}>{item.orderNo}</Text>
                      <View style={{ backgroundColor: alpha(meta.color, 0.13), borderRadius: radios.full, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3 }}>
                        <Text style={{ color: meta.color, fontSize: 10.5, fontWeight: peso.titulo }}>{meta.label}</Text>
                      </View>
                    </View>
                    <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: 14.5, fontWeight: peso.titulo, marginTop: espaciado.e3 }}>
                      {item.title ?? 'Producto'}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 1 }}>
                      {lbXaf(item.priceXaf)}{item.negotiable ? ' · negociable' : ''} · con {other.fullName ?? 'usuario'}
                    </Text>
                  </View>
                </View>
                {item.message ? (
                  <Text numberOfLines={2} style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e8, backgroundColor: colors.surface, borderRadius: 10, padding: espaciado.e8 }}>
                    💬 “{item.message}”
                  </Text>
                ) : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8, marginTop: espaciado.e10 }}>
                  {actions.map((a) => (
                    <Pressable key={a} onPress={() => act(item, a)} disabled={busyId === item.id} style={[styles.actBtn, { backgroundColor: colors.primary }]}>
                      {busyId === item.id
                        ? <ActivityIndicator size="small" color={brand.white} />
                        : <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: peso.titulo }}>{LB_ORDER_ACTION_LABEL[a] ?? a}</Text>}
                    </Pressable>
                  ))}
                  <Pressable onPress={() => irSeguro.libre('/lifebook-post/[id]', { id: item.postId })} style={[styles.actBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>Ver anuncio</Text>
                  </Pressable>
                  <Pressable onPress={() => talk(item)} style={[styles.actBtn, { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 }]}>
                    <MessageCircle size={13} color={colors.textPrimary} />
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>Hablar</Text>
                  </Pressable>
                </View>
              </View>
            );
          }}
        />
      )}

      <FloatingFooter onNavigate={dock} showUnreadBadge />
    </View>
  );
}

const styles = StyleSheet.create({
  commerceCard: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e10,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: radios.md, padding: espaciado.e10, marginBottom: espaciado.e8,
  },
  commerceThumb: { width: 44, height: 44, borderRadius: radios.sm },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingHorizontal: espaciado.e12, paddingBottom: espaciado.e8, borderBottomWidth: StyleSheet.hairlineWidth },
  topTitle: { fontSize: 19, fontWeight: peso.titulo, flex: 1 },
  seg: { borderRadius: radios.full, paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e6 },
  card: { borderRadius: radios.lg, borderWidth: StyleSheet.hairlineWidth, padding: espaciado.e12 },
  thumb: { width: 62, height: 62, borderRadius: radios.md },
  actBtn: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e5, borderRadius: radios.full, paddingHorizontal: espaciado.e13, paddingVertical: espaciado.e7 },
});

