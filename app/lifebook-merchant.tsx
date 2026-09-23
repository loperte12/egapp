/**
 * app/lifebook-merchant.tsx — MI TIENDA · PANEL DEL COMERCIANTE (Parte 39).
 *
 * Resumen real del negocio, calculado en el SERVICIO (no en la app):
 *   · el «hoy» es el de **Malabo**, no UTC;
 *   · «Cobrado hoy» es dinero **entregado y cobrado**; lo que está pendiente de
 *     contra entrega se muestra aparte («Por cobrar»), para no confundir
 *     facturación con caja;
 *   · la tienda sale del **token**: esta pantalla no manda ningún `shopId`.
 *
 * Se refresca sola cada 20 s mientras está en pantalla (no hay push todavía) y
 * al volver a ella. Las secciones que aún no existen (opiniones, cobros en
 * línea) se anuncian como «próximamente» en vez de inventar datos.
 */
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, GhostButton, PrimaryButton, useTheme, tipografia, radios } from '@egrouteplan/ui-kit';
import { useScreenGuard } from '@egrouteplan/ui-kit';
import {
  ArrowLeft, BarChart3, BedDouble, Bookmark, ChevronRight, MessageCircle, Package, Settings,
  ShoppingBag, Star, Store, TriangleAlert,
} from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { PanelGate } from '../core/PanelGate';
import { absUrl } from '../api/config';
import { commerceMerchantApi, type LbMerchantDashboard } from '../api/commerce';
import { hotelApi } from '../api/hotel';
import { lbXaf } from '../constants/lifebook';
import { LB_VERIFICATION } from '../constants/commerce';
import { ir as irSeguro } from '../constants/rutas';
import { brand } from '@egrouteplan/ui-kit';

export default function MerchantScreen() {
  return (
    <AuthGate>
      <PanelGate><MerchantContent /></PanelGate>
    </AuthGate>
  );
}

/** Cada cuánto se refresca el resumen mientras la pantalla está visible. */
const REFRESCO_MS = 20_000;

function MerchantContent() {
  useScreenGuard();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [data, setData] = useState<LbMerchantDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  const vivo = useRef(true);

  /**
   * ¿Esta tienda es un ALOJAMIENTO?
   *
   * El resumen del comerciante no lo dice, así que se pregunta al módulo de hotel (una
   * petición más, y solo para decidir si se enseña el acceso). Es el puente que faltaba:
   * el hotelero tiene su recepción, sus habitaciones y su calendario en OTRO panel, y hasta
   * ahora la única forma de llegar era el botón «Mi hotel» del buscador — dentro de «Mi
   * tienda» no había ninguna pista. Si el módulo responde con error, la pantalla sigue
   * funcionando sin el acceso.
   */
  const [hotel, setHotel] = useState<{ isHotel: boolean; rooms: number; publicadas: number } | null>(null);

  const load = useCallback(async (silencioso = false) => {
    if (!silencioso) setRefrescando(true);
    try {
      const res = await commerceMerchantApi.dashboard();
      if (vivo.current) { setData(res); setError(null); }
    } catch (e) {
      if (vivo.current) setError(e instanceof Error ? e.message : 'No se pudo cargar el resumen');
    } finally {
      if (vivo.current) setRefrescando(false);
    }
    try {
      const h = await hotelApi.myHotel();
      if (vivo.current) {
        const rooms = h.rooms ?? [];
        setHotel({
          isHotel: h.hotel?.isHotel === true,
          rooms: rooms.length,
          publicadas: rooms.filter((r) => r.isActive && r.productStatus === 'active').length,
        });
      }
    } catch {
      if (vivo.current) setHotel(null);
    }
  }, []);

  // Refresco al volver a la pantalla + sondeo suave (interino hasta que haya push).
  useFocusEffect(useCallback(() => {
    vivo.current = true;
    load();
    const t = setInterval(() => load(true), REFRESCO_MS);
    return () => { vivo.current = false; clearInterval(t); };
  }, [load]));

  /** NAVEGACIÓN SEGURA: las rutas de este panel vienen de una lista, así que se validan antes
   *  de ir. Antes navegaba a ciegas (`irSeguro.libre(String(ruta ?? ''))`): si la ruta llegaba vacía o
   *  mal escrita, la pulsación no hacía NADA y el usuario lo veía como un botón roto. */
  // Con parámetros: el filtro va APARTE de la ruta ({ f: 'pending' }), nunca dentro del texto ('…?f=pending'),
  // porque el ayudante seguro rechaza la ruta con «?» dentro y el botón acaba en «No pudimos abrir esa pantalla».
  const ir = (ruta: string, params?: Record<string, unknown>) => irSeguro.libre(ruta, params);

  if (!data && !error) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const shop = data?.shop ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: alpha(colors.border, 0.5) }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Volver">
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontWeight: '900', fontSize: tipografia.subtitle, marginLeft: 10, flex: 1 }}>
          Mi tienda
        </Text>
        {shop ? (
          <Pressable onPress={() => ir('/lifebook-merchant-settings')} hitSlop={10} accessibilityLabel="Ajustes de la tienda">
            <Settings size={19} color={colors.textPrimary} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 28 }}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={() => load()} tintColor={colors.primary} />}
      >
        {error ? (
          <View style={[styles.card, { borderColor: colors.danger, backgroundColor: alpha(colors.danger, 0.06), marginBottom: 14 }]}>
            <Text style={{ color: colors.danger, fontSize: tipografia.caption }}>{error}</Text>
          </View>
        ) : null}

        {/*
          EL PUENTE AL PANEL DEL HOTEL.
          Un alojamiento tiene DOS paneles: este (escaparate, publicaciones y pedidos) y el
          del hotel (recepción, reservas, habitaciones, precios). Son cosas distintas y el
          hotelero tiene que poder llegar a los dos desde donde está. Antes solo se llegaba
          por el botón «Mi hotel» del buscador de hotel.
        */}
        {/*
          ── UNA SOLA PUERTA A LA OTRA PARTE ──
          El panel del comerciante son DOS partes (decisión del dueño, 2026-09-12): **Hoy**
          (esta: lo que caduca — pedidos por atender, cobros y mensajes) y **Gestión**
          (publicaciones, existencias, precios y ajustes). Mezclarlas hace que lo urgente se
          pierda entre lo que puede esperar, así que aquí no hay atajos sueltos: hay UNA puerta
          clara. Es la misma forma que el panel del hotel, para que las dos se reconozcan.
        */}
        {shop ? (
          <Pressable
            onPress={() => ir('/lifebook-merchant-gestion')}
            accessibilityRole="button"
            accessibilityLabel="Gestión: publicaciones, existencias y ajustes de la tienda"
            style={[styles.card, {
              flexDirection: 'row', alignItems: 'center', gap: 11,
              borderColor: colors.border, backgroundColor: colors.card, marginBottom: 14, minHeight: 56,
            }]}
          >
            <View style={[styles.iconoSeccion, { backgroundColor: alpha(colors.primary, 0.12) }]}>
              <Settings size={17} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '800' }}>Gestión</Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 2 }}>
                Publicaciones, existencias, precios y ajustes de la tienda
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textSecondary} />
          </Pressable>
        ) : null}

        {shop && hotel?.isHotel ? (
          <View style={[styles.card, { borderColor: alpha(colors.primary, 0.35), backgroundColor: alpha(colors.primary, 0.06), marginBottom: 14 }]}>
            {/*
              Las DOS PARTES del panel del comerciante (decisión del dueño, 2026-09-12).
              No son dos apps: es el mismo trabajo con dos naturalezas distintas, y mezclarlas
              hace que lo urgente se pierda entre lo que puede esperar.
                · HOY      → lo que caduca: gente esperando y dinero por cobrar.
                · GESTIÓN  → lo que se configura: precios, fotos, textos, catálogo.
              Aquí, en la puerta, se ofrecen las dos por igual para que el hotelero sepa que
              existen y no tenga que adivinar dónde está cada cosa.
            */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <View style={[styles.iconoSeccion, { backgroundColor: alpha(colors.primary, 0.16) }]}>
                <BedDouble size={17} color={colors.primary} />
              </View>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '900', flex: 1 }}>
                Tu alojamiento
              </Text>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 7, lineHeight: 18 }}>
              {hotel.rooms
                ? `${hotel.rooms} tipo(s) de habitación · ${hotel.publicadas} se puede(n) reservar ya`
                : 'Todavía no has creado ninguna habitación'}
            </Text>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <PrimaryButton title="Hoy" onPress={() => ir('/lifebook-hotel-panel')} />
              </View>
              <View style={{ flex: 1 }}>
                <GhostButton title="Gestión" onPress={() => ir('/lifebook-hotel-gestion')} />
              </View>
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 8, lineHeight: 16 }}>
              «Hoy»: llegadas, salidas, cobros y reservas. «Gestión»: ficha, habitaciones y precios.
            </Text>
          </View>
        ) : null}

        {/* Sin tienda: el panel no existe todavía, se ofrece abrirla. */}
        {!shop ? (
          <View style={{ alignItems: 'center', paddingTop: 60, gap: 10 }}>
            <Store size={44} color={alpha(colors.primary, 0.45)} />
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.subtitle, fontWeight: '900' }}>Todavía no tienes tienda</Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', paddingHorizontal: 30 }}>
              Abre tu tienda para vender productos, comida o servicios y gestionar tus pedidos desde aquí.
            </Text>
            <View style={{ marginTop: 8, minWidth: 220 }}>
              <PrimaryButton title="Abrir mi tienda" onPress={() => ir('/lifebook-sell')} />
            </View>
          </View>
        ) : (
          <>
            {/* ── Ficha de la tienda ── */}
            <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                {shop.logoUrl ? (
                  <Image source={absUrl(shop.logoUrl)} style={styles.logo} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                ) : (
                  <View style={[styles.logo, { backgroundColor: alpha(colors.primary, 0.12), alignItems: 'center', justifyContent: 'center' }]}>
                    <Store size={22} color={colors.primary} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: tipografia.subtitle, fontWeight: '900' }}>{shop.name}</Text>
                  <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 2 }}>
                    {LB_VERIFICATION[shop.verificationLevel]?.icon} {LB_VERIFICATION[shop.verificationLevel]?.label}
                    {shop.city ? ` · ${shop.city}${shop.barrio ? ` (${shop.barrio})` : ''}` : ''}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Star size={12} color={brand.secondary} />
                      <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
                        {shop.ratingCount > 0 ? `${shop.rating.toFixed(1)} (${shop.ratingCount})` : 'Sin valoraciones'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                      <Bookmark size={12} color={colors.textSecondary} />
                      <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{shop.followersCount} seguidores</Text>
                    </View>
                  </View>
                </View>
                {!shop.isActive ? (
                  <View style={{ backgroundColor: alpha(colors.danger, 0.12), borderRadius: radios.full, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ color: colors.danger, fontSize: tipografia.micro, fontWeight: '900' }}>PAUSADA</Text>
                  </View>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <View style={{ flex: 1 }}>
                  <GhostButton title="Ver como cliente" onPress={() => ir(`/lifebook-shop/${shop.id}`)} />
                </View>
                <View style={{ flex: 1 }}>
                  <GhostButton title="Ajustes" onPress={() => ir('/lifebook-merchant-settings')} />
                </View>
              </View>
            </View>

            {/* ── Avisos: solo lo que requiere una acción hoy ── */}
            {data?.alerts ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                {data.alerts.newOrders > 0 ? (
                  <Aviso icon={<ShoppingBag size={13} color={brand.white} />} color={colors.primary}
                    texto={`${data.alerts.newOrders} pedido${data.alerts.newOrders === 1 ? '' : 's'} nuevo${data.alerts.newOrders === 1 ? '' : 's'}`}
                    onPress={() => ir('/lifebook-orders', { side: 'seller' })} />
                ) : null}
                {data.alerts.pendingProducts > 0 ? (
                  <Aviso icon={<Package size={13} color={brand.white} />} color={brand.secondary}
                    texto={`${data.alerts.pendingProducts} en revisión`}
                    onPress={() => ir('/lifebook-merchant-products', { f: 'pending' })} />
                ) : null}
                {data.alerts.outOfStock > 0 ? (
                  <Aviso icon={<TriangleAlert size={13} color={brand.white} />} color={brand.danger}
                    texto={`${data.alerts.outOfStock} sin existencias`}
                    onPress={() => ir('/lifebook-merchant-products', { f: 'agotado' })} />
                ) : null}
                {data.alerts.unreadMessages > 0 ? (
                  <Aviso icon={<MessageCircle size={13} color={brand.white} />} color={brand.success}
                    texto={`${data.alerts.unreadMessages} sin leer`}
                    onPress={() => ir('/lifebook-messages')} />
                ) : null}
              </View>
            ) : null}

            {/* ── Caja del día (hora de Malabo) ── */}
            <Seccion titulo="Caja" icono={<BarChart3 size={15} color={colors.textPrimary} />}>
              <View style={[styles.card, { borderColor: colors.border }]}>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>Cobrado hoy</Text>
                <Text style={{ color: colors.success, fontSize: tipografia.display, fontWeight: '900', marginTop: 2 }}>
                  {lbXaf(data?.money?.paidTodayXaf ?? 0)}
                </Text>
                <View style={{ flexDirection: 'row', gap: 16, marginTop: 12 }}>
                  <Mini label="Este mes" valor={lbXaf(data?.money?.paidMonthXaf ?? 0)} />
                  <Mini label="Por cobrar" valor={lbXaf(data?.money?.pendingCodXaf ?? 0)} />
                </View>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: 10, lineHeight: 15 }}>
                  Solo cuenta lo entregado y cobrado. «Por cobrar» es lo pendiente de contra entrega.
                  Día del servidor: {data?.serverDay ?? '—'} (hora de Malabo{data?.serverTime ? `, ${data.serverTime}` : ''}).
                </Text>
              </View>
            </Seccion>

            {/* ── Pedidos ── */}
            <Seccion titulo="Pedidos" icono={<ShoppingBag size={15} color={colors.textPrimary} />}>
              <View style={[styles.card, { borderColor: colors.border }]}>
                <View style={styles.fila}>
                  <Mini label="Hoy" valor={String(data?.orders?.today ?? 0)} />
                  <Mini label="En curso" valor={String(data?.orders?.active ?? 0)} />
                  <Mini label="Entregados" valor={String(data?.orders?.delivered ?? 0)} />
                  <Mini label="Cancelados" valor={String(data?.orders?.cancelled ?? 0)} />
                </View>
                <View style={{ marginTop: 12 }}>
                  <GhostButton title="Ver pedidos de la tienda" onPress={() => ir('/lifebook-orders', { side: 'seller' })} />
                </View>
                {/*
                  EL DINERO DE MI TIENDA (decisión del dueño, 18/09/2026): «sin esto el vendedor no sabe
                  si gana dinero dentro de la app». Lo que ha vendido, la comisión, lo que le queda por
                  cobrar y lo que espera a que venza la ventana de reclamación.
                */}
                <View style={{ marginTop: 10 }}>
                  <PrimaryButton title="El dinero de mi tienda" onPress={() => ir('/lifebook-dinero')} />
                </View>
              </View>
            </Seccion>

            {/* ── Catálogo ── */}
            <Seccion titulo="Catálogo" icono={<Package size={15} color={colors.textPrimary} />}>
              <View style={[styles.card, { borderColor: colors.border }]}>
                <View style={styles.fila}>
                  <Mini label="Publicados" valor={String(data?.products?.active ?? 0)} />
                  <Mini label="En revisión" valor={String(data?.products?.pending ?? 0)} />
                  <Mini label="Agotados" valor={String(data?.products?.soldOut ?? 0)} />
                  <Mini label="Borradores" valor={String(data?.products?.draft ?? 0)} />
                </View>
                <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                  <View style={{ flex: 1 }}>
                    <GhostButton title="Gestionar" onPress={() => ir('/lifebook-merchant-products')} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <PrimaryButton title="Publicar" onPress={() => ir('/lifebook-sell')} />
                  </View>
                </View>
              </View>
            </Seccion>

            {/* ── Lo que aún no existe (dicho claro) ── */}
            <Seccion titulo="Próximamente" icono={<Star size={15} color={colors.textPrimary} />}>
              <View style={[styles.card, { borderColor: colors.border }]}>
                <Futuro titulo="Opiniones de clientes" detalle="Cuando un pedido se entrega se podrá valorar la tienda y el producto." />
                <Futuro titulo="Cobros en línea" detalle="Transferencia con comprobante y monedero Life Book, sin efectivo." />
                <Futuro titulo="Promociones" detalle="Descuentos y ofertas destacadas dentro del catálogo." />
              </View>
            </Seccion>

            <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, textAlign: 'center', marginTop: 8 }}>
              Los datos son de tu tienda y se cargan con tu sesión · se actualiza cada {REFRESCO_MS / 1000} s
            </Text>
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─────────────────────────────── piezas locales ──────────────────────────────

function Seccion({ titulo, icono, children }: { titulo: string; icono: React.ReactNode; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        {icono}
        <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '900' }}>{titulo}</Text>
      </View>
      {children}
    </View>
  );
}

function Mini({ label, valor }: { label: string; valor: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro }} numberOfLines={1}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '900', marginTop: 1 }} numberOfLines={1}>{valor}</Text>
    </View>
  );
}

function Aviso({ icon, color, texto, onPress }: { icon: React.ReactNode; color: string; texto: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.aviso, { backgroundColor: color }]}>
      {icon}
      <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: '900' }}>{texto}</Text>
      <ChevronRight size={13} color={brand.white} />
    </Pressable>
  );
}

function Futuro({ titulo, detalle }: { titulo: string; detalle: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6 }}>
      <View style={{ backgroundColor: alpha(colors.textSecondary, 0.15), borderRadius: radios.full, paddingHorizontal: 8, paddingVertical: 2, marginTop: 1 }}>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: '900' }}>PRÓXIMAMENTE</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: '800' }}>{titulo}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 16 }}>{detalle}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radios.lg, padding: 14 },
  iconoSeccion: { width: 30, height: 30, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 52, height: 52, borderRadius: radios.md },
  fila: { flexDirection: 'row', gap: 10 },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radios.full, paddingHorizontal: 11, paddingVertical: 6 },
});
