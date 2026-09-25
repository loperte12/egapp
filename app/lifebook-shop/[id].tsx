/**
 * app/lifebook-shop/[id].tsx — TIENDA de un vendedor (Parte 33).
 *
 * Pestañas simples: Productos · Servicios · Información (con valoración,
 * seguidores, entrega y métodos de pago reales). El botón principal cambia
 * según lo que venda la tienda, como pide la hoja de ruta.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, GhostButton, PrimaryButton, radios, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import {
  ArrowLeft, MapPin, MessageCircle, Package, ShieldCheck, Store, Truck, Wrench,
} from 'lucide-react-native';
import { AuthGate } from '../../core/AuthGate';
import { absUrl } from '../../api/config';
import { messagesApi } from '../../api/messages';
import { commerceApi, type LbProductCard, type LbShop } from '../../api/commerce';
import { lbXaf } from '../../constants/lifebook';
import {
  LB_PAY_STATUS_LABEL, LB_VERIFICATION, lbCoverageLabel, lbPayLabel,
  lbPriceLabel, lbRegionLabel, lbTransportLabel,
} from '../../constants/commerce';
import { ir as irSeguro } from '../../constants/rutas';

type Tab = 'products' | 'services' | 'info';

export default function LifeBookShopScreen() {
  return (
    <AuthGate>
      <ShopContent />
    </AuthGate>
  );
}

function ShopContent() {
  const { id, product } = useLocalSearchParams<{ id: string; product?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [shop, setShop] = useState<LbShop | null>(null);
  const [items, setItems] = useState<LbProductCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('products');
  const [following, setFollowing] = useState(false);
  /** ¿Es mi propia tienda? (para ofrecer «Administrar» en vez de «Seguir»). */
  const [esMia, setEsMia] = useState(false);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  /**
   * TANDA A — POSICIONADO EN UN PRODUCTO. Cuando se llega desde la tarjeta del perfil
   * (`?product=<id>`), la tienda no se abre por arriba: baja hasta ese producto y lo deja
   * marcado, porque es un ATAJO (el visitante ya ha elegido qué mirar), no un destino final.
   */
  const listaRef = useRef<FlatList<LbProductCard>>(null);
  const [resaltado, setResaltado] = useState<string | null>(null);
  const [yaPosicionado, setYaPosicionado] = useState(false);
  /** Evita pedir dos veces el mismo producto que no venía en la página cargada. */
  const trayendoRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [{ shop: s }, page] = await Promise.all([
        commerceApi.shop(String(id)),
        commerceApi.shopProducts(String(id), { limit: 30 }),
      ]);
      if (!mounted.current) return;
      setShop(s);
      setFollowing(!!s.followedByMe);
      setItems((page as { items: LbProductCard[] }).items ?? []);
      // Sesión opcional: sin sesión (o sin tienda) simplemente no es mía.
      commerceApi.myShop()
        .then(({ shop: mia }) => { if (mounted.current) setEsMia(!!mia && mia.id === s.id); })
        .catch(() => { if (mounted.current) setEsMia(false); });
    } catch {
      /* la ficha avisa con el estado vacío */
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; };
  }, [load]);

  const productos = useMemo(() => items.filter((p) => p.serviceType === 'physical' || p.serviceType === 'food'), [items]);
  const servicios = useMemo(() => items.filter((p) => p.serviceType !== 'physical' && p.serviceType !== 'food'), [items]);
  const visibles = tab === 'services' ? servicios : productos;

  /**
   * TANDA A — bajar hasta el producto por el que se ha entrado. Se hace UNA vez, cuando la
   * lista ya tiene datos. Si el producto no está en la pestaña que se está viendo (p. ej. es
   * un servicio y se ve «Productos»), se cambia de pestaña para que aparezca: si no, el
   * atajo llevaría a una pantalla donde el producto no está.
   */
  useEffect(() => {
    if (!product || yaPosicionado || !items.length) return;
    const enProductos = productos.findIndex((p) => p.id === product);
    const enServicios = servicios.findIndex((p) => p.id === product);
    if (enProductos < 0 && enServicios < 0) {
      /**
       * NO ESTÁ EN LO CARGADO. Esta tienda tiene 58 productos y la pantalla pide 30, así que
       * un producto antiguo puede no venir en la primera página: el atajo desde el perfil
       * fallaba en silencio (medido con el producto MÁS ANTIGUO: la tienda se abría arriba y
       * sin marcar nada). Se pide ESE producto y se trae a la vista, marcado, en vez de dejar
       * al visitante buscándolo a mano.
       */
      if (trayendoRef.current === product) return;
      trayendoRef.current = product;
      commerceApi.product(String(product))
        .then((res) => {
          /* OJO con la forma: la ficha NO viene suelta, viene envuelta (`{ product: … }`).
             Leerla mal fue un fallo real de esta función: comparaba `res.shopId`, que es
             `undefined`, y el atajo no traía nada. */
          const envuelto = res as unknown as { product?: LbProductCard };
          const p = envuelto.product ?? (res as unknown as LbProductCard | null);
          if (!p || String((p as { shopId?: string }).shopId) !== String(id)) return;
          // La ficha trae `media` pero no `coverUrl` (lo comprobé contra el API): se usa la
          // primera foto para que la miniatura no salga vacía.
          const fila = {
            ...p,
            coverUrl: (p as { coverUrl?: string | null }).coverUrl
              ?? (Array.isArray(p.media) ? p.media[0]?.url ?? null : null),
          } as LbProductCard;
          setItems((prev) => (prev.some((x) => x.id === fila.id) ? prev : [fila, ...prev]));
        })
        .catch(() => { /* si no se puede traer, la tienda se queda como está */ });
      return;
    }
    const destino = enProductos >= 0 ? 'products' : 'services';
    if (tab !== destino) { setTab(destino as Tab); return; }
    const idx = enProductos >= 0 ? enProductos : enServicios;
    setResaltado(String(product));
    setYaPosicionado(true);
    // Se espera un pelo a que la lista pinte la fila; si el índice aún no está medido,
    // FlatList avisa por `onScrollToIndexFailed` y allí se corrige.
    const t = setTimeout(() => {
      listaRef.current?.scrollToIndex({ index: idx, animated: true, viewPosition: 0.25 });
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product, items, productos, servicios, tab, yaPosicionado]);

  const toggleFollow = async () => {
    if (!shop || busy) return;
    setBusy(true);
    const before = following;
    setFollowing(!before);
    try {
      const res = await commerceApi.toggleFollow(shop.id);
      setFollowing(res.following);
    } catch {
      setFollowing(before);
    } finally {
      setBusy(false);
    }
  };

  const contactar = async () => {
    if (!shop?.owner) return;
    setBusy(true);
    try {
      const conv = await messagesApi.open(shop.owner.id);
      router.push({
        pathname: '/lifebook-chat/[id]',
        params: { id: conv.id, name: conv.peer.name ?? shop.name, peerId: shop.owner.id, draft: `Hola, vi tu tienda «${shop.name}» y quería preguntar…` },
      } as never);
    } catch {
      /* silencioso */
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!shop) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: espaciado.e24, gap: espaciado.e12 }]}>
        <Store size={40} color={alpha(colors.primary, 0.4)} />
        <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo }}>Esta tienda no está disponible</Text>
        <GhostButton title="Volver" onPress={() => router.back()} />
      </View>
    );
  }

  const nivel = LB_VERIFICATION[shop.verificationLevel] ?? LB_VERIFICATION.basic;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <FlatList
        ref={listaRef}
        data={tab === 'info' ? [] : visibles}
        keyExtractor={(p) => p.id}
        numColumns={2}
        columnWrapperStyle={{ gap: espaciado.e10, paddingHorizontal: espaciado.e14 }}
        contentContainerStyle={{ paddingBottom: insets.bottom + 100, gap: espaciado.e12 }}
        showsVerticalScrollIndicator={false}
        /* Si el índice aún no está medido (fila alta, recién pintada), FlatList avisa: se
           corrige bajando a ojo, para que el atajo nunca deje al visitante arriba del todo. */
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            listaRef.current?.scrollToOffset({ offset: Math.max(0, info.averageItemLength * info.index), animated: true });
          }, 250);
        }}
        ListHeaderComponent={
          <View>
            {/* ── Portada y cabecera ── */}
            <View style={[styles.cover, { backgroundColor: colors.surface }]}>
              {shop.coverUrl ? (
                <Image source={absUrl(shop.coverUrl)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" transition={0} />
              ) : null}
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
              <Pressable
                onPress={() => router.back()}
                hitSlop={10}
                accessibilityLabel="Volver"
                style={[styles.backBtn, { top: insets.top + 10 }]}
              >
                <ArrowLeft size={20} color={brand.white} />
              </Pressable>
            </View>

            <View style={{ paddingHorizontal: espaciado.e16, marginTop: -34 }}>
              <View style={[styles.logoWrap, { borderColor: colors.background, backgroundColor: colors.surface }]}>
                {shop.logoUrl ? (
                  <Image source={absUrl(shop.logoUrl)} style={styles.logo} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                ) : (
                  <View style={[styles.logo, { alignItems: 'center', justifyContent: 'center' }]}>
                    <Store size={26} color={colors.primary} />
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, marginTop: espaciado.e10 }}>
                <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: peso.titulo, flex: 1 }} numberOfLines={1}>
                  {shop.name}
                </Text>
                {shop.isVerified ? <ShieldCheck size={16} color={colors.success} /> : null}
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e2 }}>
                {nivel.icon} {nivel.label}
                {shop.ecomerse ? ' · Tienda Ecomerse' : ''}
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, marginTop: espaciado.e6, flexWrap: 'wrap' }}>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
                  {[shop.city, shop.barrio, lbRegionLabel(shop.region)].filter(Boolean).join(' · ')}
                </Text>
                {shop.ratingCount > 0 ? (
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>★ {shop.rating.toFixed(1)} ({shop.ratingCount})</Text>
                ) : null}
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{shop.stats?.followers ?? shop.followersCount} seguidores</Text>
              </View>
              {shop.description ? (
                <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, marginTop: espaciado.e8, lineHeight: 19 }}>{shop.description}</Text>
              ) : null}

              {/* ── Acciones ── */}
              <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e12 }}>
                {esMia ? (
                  // Parte 39: si la tienda es tuya, lo que quieres es administrarla.
                  <View style={{ flex: 1 }}>
                    <PrimaryButton title="Administrar mi tienda" onPress={() => irSeguro.libre('/lifebook-merchant')} />
                  </View>
                ) : (
                  <View style={{ flex: 1 }}>
                    <PrimaryButton
                      title={shop.followedByMe || following ? 'Siguiendo' : 'Seguir tienda'}
                      loading={busy}
                      onPress={toggleFollow}
                    />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <GhostButton title="Chat" onPress={contactar} />
                </View>
              </View>

              {/* ── Pestañas ── */}
              <View style={[styles.tabs, { borderBottomColor: alpha(colors.border, 0.6) }]}>
                {([
                  { id: 'products' as Tab, label: `Productos${productos.length ? ` (${productos.length})` : ''}` },
                  { id: 'services' as Tab, label: `Servicios${servicios.length ? ` (${servicios.length})` : ''}` },
                  { id: 'info' as Tab, label: 'Información' },
                ]).map((t) => {
                  const active = tab === t.id;
                  return (
                    <Pressable key={t.id} onPress={() => setTab(t.id)} accessibilityRole="tab" accessibilityState={{ selected: active }} style={styles.tab}>
                      <Text style={{ color: active ? colors.textPrimary : colors.textSecondary, fontWeight: active ? '900' : '600', fontSize: tipografia.body }}>
                        {t.label}
                      </Text>
                      {active ? <View style={[styles.tabLine, { backgroundColor: colors.primary }]} /> : null}
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* ── Información ── */}
            {tab === 'info' ? (
              <View style={{ paddingHorizontal: espaciado.e16, paddingTop: espaciado.e14 }}>
                {shop.addressReference ? (
                  <InfoRow colors={colors} icon={<MapPin size={16} color={colors.primary} />} text={shop.addressReference} />
                ) : null}
                {shop.shippingPolicies.map((sp) => (
                  <InfoRow
                    key={sp.id}
                    colors={colors}
                    icon={<Truck size={16} color={colors.primary} />}
                    text={`${sp.name} · ${sp.coverage.map(lbCoverageLabel).join(' / ') || 'sin cobertura indicada'}${
                      sp.transportModes.length ? ` · ${sp.transportModes.map(lbTransportLabel).join(', ')}` : ''
                    }${sp.costMode === 'on_request' ? ' · coste a consultar' : ` · desde ${lbXaf(sp.baseCostXaf)}`}`}
                  />
                ))}
                <View style={{ marginTop: espaciado.e8 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body, marginBottom: espaciado.e6 }}>Pagos aceptados</Text>
                  {shop.paymentMethods.map((pm) => (
                    <Text key={pm.method} style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginBottom: espaciado.e3 }}>
                      · {lbPayLabel(pm.method)}{pm.status !== 'active' ? ` (${LB_PAY_STATUS_LABEL[pm.status] ?? pm.status})` : ''}
                    </Text>
                  ))}
                </View>
                <Pressable
                  onPress={() => shop.owner && irSeguro.libre('/lifebook-user', { id: shop.owner.id })}
                  accessibilityLabel="Ver el perfil del vendedor"
                  style={{ marginTop: espaciado.e16 }}
                >
                  <Text style={{ color: colors.primary, fontWeight: peso.maximo, fontSize: tipografia.caption }}>Ver el perfil de {shop.owner?.name ?? 'el vendedor'} →</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          tab === 'info' ? null : (
            <View style={{ alignItems: 'center', paddingTop: 40, gap: espaciado.e8 }}>
              {tab === 'services' ? <Wrench size={34} color={alpha(colors.primary, 0.4)} /> : <Package size={34} color={alpha(colors.primary, 0.4)} />}
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, textAlign: 'center' }}>
                {tab === 'services' ? 'Esta tienda aún no ofrece servicios.' : 'Esta tienda aún no tiene productos publicados.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => irSeguro.libre('/lifebook-product/[id]', { id: item.id })}
            accessibilityLabel={item.title}
            style={[styles.card, {
              backgroundColor: colors.card,
              // TANDA A: si se ha llegado por un atajo a este producto, se marca para que el
              // visitante vea DE CUÁL venía sin tener que adivinarlo.
              borderColor: resaltado === item.id ? colors.primary : alpha(colors.border, 0.5),
              borderWidth: resaltado === item.id ? 2 : 1,
            }]}
          >
            {item.coverUrl ? (
              <Image
                source={absUrl(item.coverUrl)}
                style={styles.cardImg}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={item.id}
                transition={0}
              />
            ) : (
              <View style={[styles.cardImg, { backgroundColor: alpha(colors.primary, 0.08), alignItems: 'center', justifyContent: 'center' }]}>
                <Package size={22} color={alpha(colors.primary, 0.5)} />
              </View>
            )}
            <Text numberOfLines={2} style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e6 }}>
              {item.title}
            </Text>
            {/* Marca visible del atajo: si se ha entrado desde la tarjeta del perfil, el
                visitante ve CUÁL de todos los productos era el que tocó. Sin esto solo había
                un borde de color, que no se puede ni leer con un lector de pantalla (y que yo
                tampoco podía comprobar en el teléfono). */}
            {resaltado === item.id ? (
              <Text style={{ color: colors.primary, fontSize: 10.5, fontWeight: peso.titulo, marginTop: espaciado.e2 }}>
                📍 Es el que tocaste
              </Text>
            ) : null}
            <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.titulo, marginTop: espaciado.e3 }}>
              {lbPriceLabel(item.priceXaf, item.priceMode, lbXaf)}
            </Text>
            <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e2 }}>
              {[item.originCity, item.shipsInternational ? 'envía al extranjero' : null].filter(Boolean).join(' · ')}
            </Text>
            {/* «X vendidos»: el dato ya venía (`salesCount`) y no se pintaba. Solo si hay
                ventas: un «0 vendidos» en la rejilla de la tienda ahuyenta. */}
            {item.salesCount > 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: 10.5, fontWeight: peso.fuerte, marginTop: 1 }}>
                {item.salesCount} vendido{item.salesCount === 1 ? '' : 's'}
              </Text>
            ) : null}
          </Pressable>
        )}
      />
    </View>
  );
}

function InfoRow({ colors, icon, text }: { colors: any; icon: React.ReactNode; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: espaciado.e8 }}>
      {icon}
      <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, marginLeft: espaciado.e8, flex: 1, lineHeight: 18 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cover: { height: 150, overflow: 'hidden' },
  backBtn: {
    position: 'absolute', left: 14, width: 34, height: 34, borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center',
  },
  logoWrap: { width: 74, height: 74, borderRadius: 37, borderWidth: 3, overflow: 'hidden' },
  logo: { width: '100%', height: '100%', borderRadius: 37 },
  tabs: { flexDirection: 'row', gap: espaciado.e18, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: espaciado.e16 },
  tab: { paddingBottom: espaciado.e8, alignItems: 'center' },
  tabLine: { height: 2.5, width: 26, borderRadius: 2, marginTop: espaciado.e5 },
  card: { flex: 1, borderRadius: radios.md, borderWidth: StyleSheet.hairlineWidth, padding: espaciado.e8, maxWidth: '50%' },
  cardImg: { width: '100%', height: 120, borderRadius: radios.sm },
});
