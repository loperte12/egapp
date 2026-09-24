/**
 * EcomerseCheckoutScreen — Checkout del pedido (v2, auditoría senior).
 * Multi-línea REAL (el API agrupa por vendedor), desglose fijo encima del CTA,
 * Buy Now "pagar solo este" vs carrito, validación de agente (dirección + zona
 * obligatorias, km validado), idempotencia por payload + lock real, garantía
 * condicional por método, Eg Pay visible como "próximamente", SafeArea y a11y.
 * Ruta: /ecomerse-checkout?productId=&solo=1
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banknote, CreditCard, MapPin, Pencil, ShoppingCart, Trash2, Wallet } from 'lucide-react-native';
import { alpha, espaciado, FormField, ilustracion, MasOpciones, peso, PrimaryButton, radios, ScreenHeader, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import { ecomerseApi, EcomerseAddress, EcomerseDeliveryZone, EcomerseProduct } from '../api/ecomerse';
import { walletApi } from '../api/wallet';
import { fijarPin } from '../api/settlement';
import { PinSheet } from '@egrouteplan/ui-kit';
import { cartTotal, claveLinea, useEcomerseStore, type CartLine } from '../state/ecomerse';
import { formatXAF } from '../utils/formatHelpers';
import { brand } from '@egrouteplan/ui-kit';
import { ir } from '../constants/rutas';

interface CheckoutLine extends CartLine {
  photo?: string | null;
}

/** Hash simple para la idempotency key (payload → key). */
function hashKey(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return Math.abs(h).toString(36);
}

/**
 * El texto que se CONGELA en el pedido (`delivery_address`): calle + referencia + ciudad. Se compone
 * en un solo sitio para que elegir una dirección guardada y escribirla a mano den el MISMO formato
 * —el agente lee siempre lo mismo— y para que el pedido no dependa de que la agenda siga existiendo.
 */
function textoDeDireccion(d: EcomerseAddress): string {
  return [d.detail, d.landmark, d.city].map((x) => (x ?? '').trim()).filter(Boolean).join(', ');
}

export default function EcomerseCheckoutScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    productId?: string | string[]; solo?: string | string[]; variantId?: string | string[]; qty?: string | string[];
  }>();
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const buyNowId = uno(params.productId);
  const soloMode = uno(params.solo) === '1';
  /**
   * «Pagar solo este» no toca el carrito, así que la combinación y la cantidad tienen que viajar por
   * la ruta (fase 4). Sin esto, comprar directamente un anuncio con ejes perdería la elección y el
   * servidor rechazaría la línea.
   */
  const soloVariantId = uno(params.variantId) ?? null;
  const soloQty = Math.max(1, Number(uno(params.qty) ?? '1') || 1);

  const [product, setProduct] = useState<EcomerseProduct | null>(null);
  const [productLoading, setProductLoading] = useState(!!buyNowId);
  const [address, setAddress] = useState('');
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<'cash' | 'billing' | 'likebook_wallet'>('cash');
  /**
   * PAGO CON EL MONEDERO (parche 101): el comprador confirma con su PIN y el importe queda EN
   * GARANTÍA; el vendedor cobra en su monedero al entregar. Solo compras de UNA tienda: el token
   * de pago va ligado a un importe y cada tienda genera su propio pedido.
   */
  const [pinOpen, setPinOpen] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [needSetPin, setNeedSetPin] = useState(false);
  const [saldoMonedero, setSaldoMonedero] = useState<number | null>(null);
  const [fulfillment, setFulfillment] = useState<'seller' | 'agent'>('seller');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const { cart, setQty, removeFromCart, clearCart, updateLinePrice } = useEcomerseStore();

  // Zonas de entrega (tarifa logística)
  const [zones, setZones] = useState<EcomerseDeliveryZone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);
  const [zonesError, setZonesError] = useState(false);
  const [zoneId, setZoneId] = useState('');
  const [kmText, setKmText] = useState('');

  /* LA AGENDA DE DIRECCIONES (Fase 2 del pie): aquí se ELIGE en vez de teclear. Elegir una no sólo
     rellena el texto del pedido —que es lo que se congela—, también HEREDA SU ZONA de reparto: eso
     es lo que ahorra el paso de calcular la tarifa, que antes había que hacer a mano cada vez. */
  const [direcciones, setDirecciones] = useState<EcomerseAddress[]>([]);
  const [addressId, setAddressId] = useState('');
  /** El comprador pidió escribir la suya: no se le vuelve a proponer la guardada encima. */
  const [manual, setManual] = useState(false);

  // ---- Buy Now: solo este producto (no toca el carrito)
  useEffect(() => {
    if (!buyNowId) return;
    let alive = true;
    ecomerseApi.product(buyNowId).then((p) => { if (alive) setProduct(p); })
      .catch(() => undefined)
      .finally(() => { if (alive) setProductLoading(false); });
    return () => { alive = false; };
  }, [buyNowId]);

  // ---- Revalidar precios del carrito (aviso si el servidor cambió el precio)
  // ---- Zonas de la ciudad (carrito o compra directa)
  const cityForZones = soloMode ? product?.city : cart[0]?.city;
  /**
   * Antes de cobrar, cada línea se contrasta con el anuncio. Con combinaciones (fase 4) hay que
   * mirar **la combinación, no el anuncio**: su precio puede ser distinto y su stock es el que
   * limita. Mirar el anuncio daría un aviso de «precio cambiado» falso en cada entrada —el de la
   * combinación no tiene por qué coincidir con el del anuncio— y dejaría pasar cantidades que la
   * combinación no tiene.
   *
   * Y dos casos que **retiran la línea**, porque no se pueden pedir y dejarlos puestos solo sirve
   * para que el servidor los rechace al confirmar: la combinación que ya no existe, y la línea sin
   * combinación de un anuncio que ahora sí tiene ejes (se añadió desde una tarjeta, que no elige).
   */
  useEffect(() => {
    if (soloMode || cart.length === 0) return;
    let alive = true;
    const avisos: string[] = [];
    let huboPrecio = false;
    (async () => {
      for (const line of cart) {
        try {
          const p = await ecomerseApi.product(line.productId);
          if (!alive) return;
          const clave = claveLinea(line);
          const v = line.variantId ? (p.variants ?? []).find((x) => x.id === line.variantId) ?? null : null;

          if (line.variantId && !v) {
            avisos.push(`«${line.title}»${line.variantName ? ` (${line.variantName})` : ''}: esa combinación ya no está disponible; se ha quitado del carrito.`);
            setQty(clave, 0);
            continue;
          }
          if (!line.variantId && (p.variants ?? []).length > 0) {
            avisos.push(`«${line.title}»: este anuncio necesita que elijas una combinación. Se ha quitado del carrito; ábrelo y elige.`);
            setQty(clave, 0);
            continue;
          }

          const precio = v?.priceXaf ?? p.priceXaf;
          if (Number(precio) !== line.priceXaf) {
            avisos.push(`«${line.title}»${v ? ` (${v.name})` : ''} pasó de ${formatXAF(line.priceXaf)} a ${formatXAF(Number(precio))}`);
            updateLinePrice(clave, Number(precio));
            huboPrecio = true;
          }
          const tope = v ? Number(v.stockQuantity ?? 0) : p.stock;
          if (tope < line.qty) setQty(clave, Math.max(1, tope));
        } catch { /* sin red: se confía en el precio del carrito */ }
      }
      if (alive && avisos.length) {
        Alert.alert(
          'Tu carrito ha cambiado',
          avisos.join('\n') + (huboPrecio ? '\n\nSe cobrará el precio actual del vendedor.' : ''),
        );
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Zonas de la ciudad (carrito o compra directa)
  useEffect(() => {
    let alive = true;
    if (!cityForZones) { setZones([]); return; }
    setZonesLoading(true);
    setZonesError(false);
    ecomerseApi.deliveryZones(cityForZones)
      .then((z) => { if (alive) setZones(z); })
      .catch(() => { if (alive) setZonesError(true); })
      .finally(() => { if (alive) setZonesLoading(false); });
    return () => { alive = false; };
  }, [cityForZones]);

  // ---- La agenda de direcciones del comprador (Fase 2 del pie)
  useEffect(() => {
    let alive = true;
    ecomerseApi.addresses()
      .then((d) => { if (alive) setDirecciones(d); })
      /* SI FALLA, EL CHECKOUT SIGUE IGUAL. Sin sesión, sin red o con la agenda caída la lista se
         queda vacía y vuelve el campo de texto de siempre: elegir una dirección guardada es una
         comodidad, y una comodidad no puede impedir comprar. */
      .catch(() => { if (alive) setDirecciones([]); });
    return () => { alive = false; };
  }, []);

  /** Las direcciones que sirven para ESTE pedido: las de la ciudad donde se entrega. */
  const direccionesDeCiudad = useMemo(() => {
    if (!cityForZones) return [];
    const c = cityForZones.trim().toLowerCase();
    return direcciones.filter((d) => d.city.trim().toLowerCase() === c);
  }, [direcciones, cityForZones]);

  /* Tiene direcciones, pero en otra ciudad. Se DICE en vez de esconderlas sin explicar nada: si no,
     el comprador vería su agenda ignorada y no sabría por qué. */
  const enOtraCiudad = direcciones.length > 0 && direccionesDeCiudad.length === 0;

  const elegirDireccion = useCallback((d: EcomerseAddress) => {
    setManual(false);
    setAddressId(d.id);
    setAddress(textoDeDireccion(d));
    /* La zona de la dirección MANDA: si la trae, se hereda su tarifa y el comprador no vuelve a
       elegirla. Si no la trae, se limpia, para no dejar puesta la zona de una dirección anterior. */
    setZoneId(d.zoneId ?? '');
    setKmText('');
  }, []);

  /* Se propone la predeterminada de esta ciudad sin que haya que pulsar —es justo lo que el
     comprador venía a hacer aquí—, pero sólo si no ha elegido ya y no ha pedido escribir la suya. */
  useEffect(() => {
    if (manual || addressId || direccionesDeCiudad.length === 0) return;
    elegirDireccion(direccionesDeCiudad.find((d) => d.isDefault) ?? direccionesDeCiudad[0]);
  }, [direccionesDeCiudad, addressId, manual, elegirDireccion]);

  /**
   * La combinación elegida en la ficha, cuando se compra «solo este». La ruta lleva solo su id: el
   * precio, el stock y la foto se leen del anuncio que se acaba de traer, que es la única fuente que
   * no puede estar desfasada.
   */
  const soloVariante = useMemo(
    () => (soloVariantId ? (product?.variants ?? []).find((v) => v.id === soloVariantId) ?? null : null),
    [product, soloVariantId],
  );

  // ---- Líneas (pagar solo este → solo el producto; si no → carrito)
  const lines: CheckoutLine[] = useMemo(() => {
    if (soloMode) {
      if (!product) return [];
      const v = soloVariante;
      return [{
        productId: product.id,
        title: product.title,
        priceXaf: v?.priceXaf ?? product.priceXaf,
        qty: soloQty,
        photos: product.photos ?? [],
        stock: v ? Number(v.stockQuantity ?? 0) : product.stock,
        /* La miniatura es la de la COMBINACIÓN: es lo que se ha elegido y lo que se va a recibir. */
        photo: v?.imageUrl ?? product.photos?.[0] ?? null,
        city: product.city,
        ...(v?.id
          ? { variantId: v.id, variantName: v.name, variantAttributes: v.attributes ?? {}, variantImageUrl: v.imageUrl ?? null }
          : {}),
      }];
    }
    return cart.map((c) => ({ ...c, photo: c.variantImageUrl ?? c.photos?.[0] ?? null, city: undefined }));
  }, [soloMode, product, cart, soloVariante, soloQty]);

  /** El total sale de las MISMAS líneas que se van a pedir (no del carrito): así no puede descuadrar. */
  const total = cartTotal(lines);

  // Tarifa: SOLO con zona elegida (nunca un 500 fantasma)
  const zone = zones.find((z) => z.id === zoneId);
  const kmRaw = Number(kmText);
  const km = Number.isFinite(kmRaw) && kmRaw > 0 ? Math.max(1, Math.min(kmRaw, 200)) : (zone?.kmDefault ?? 0);
  const zoneFee = zone ? zone.baseFeeXaf + zone.perKmXaf * km : 0;
  const logisticsFee = fulfillment === 'agent' && zone ? zoneFee : 0;
  const totalFinal = total + logisticsFee;
  const canConfirm = lines.length > 0 && (fulfillment !== 'agent' || !!zone) && !busy;

  const makeIdemKey = () => `ec-${Date.now()}-${hashKey(JSON.stringify({ lines, method, fulfillment, zoneId, km, address }))}`;

  const confirm = async (paymentToken?: string) => {
    if (busyRef.current) return;
    if (lines.length === 0) return;
    if (lines.some((l) => l.qty < 1)) return;
    if (fulfillment === 'agent') {
      if (!address.trim()) { Alert.alert('Dirección', 'Para entrega por agente indica dónde entregamos.'); return; }
      if (!zoneId) { Alert.alert('Zona', 'Elige la zona para calcular la tarifa de entrega.'); return; }
    }
    if (kmText && (!Number.isFinite(kmRaw) || kmRaw < 1 || kmRaw > 200)) {
      Alert.alert('Distancia', 'Pon un km válido (1–200) o deja el valor de la zona.'); return;
    }
    // Monedero: primero el PIN (el importe se retiene antes de crear el pedido).
    if (method === 'likebook_wallet' && !paymentToken) {
      setPinErr(null); setNeedSetPin(false); setPinOpen(true);
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const r = await ecomerseApi.createOrder({
        items: lines.map((l) => ({ productId: l.productId, qty: l.qty, variantId: l.variantId })),
        paymentMethod: method,
        deliveryAddress: address.trim() || undefined,
        note: note.trim() || undefined,
        idempotencyKey: makeIdemKey(),
        fulfillmentType: fulfillment,
        deliveryZoneId: fulfillment === 'agent' ? zoneId : null,
        deliveryKm: fulfillment === 'agent' && km > 0 ? km : null,
      }, paymentToken);
      if (!soloMode) clearCart(); // solo se vacía lo realmente pedido (carrito completo)
      const count = r.orderCount ?? 1;
      if (r.billingOrderId) {
        Alert.alert('Pedido creado', r.message, [
          { text: 'Ver mis pedidos', style: 'cancel', onPress: () => router.replace('/ecomerse-orders' as any) },
          { text: 'Pagar ahora', onPress: () => router.replace({ pathname: '/billing-checkout', params: { orderId: r.billingOrderId } } as any) },
        ]);
      } else {
        Alert.alert(count > 1 ? 'Pedidos creados' : 'Pedido creado', r.message, [
          { text: 'OK', onPress: () => router.replace('/ecomerse-orders' as any) },
        ]);
      }
    } catch (e) {
      const code = (e as { code?: string })?.code;
      // PIN incorrecto o aún sin PIN: la hoja lo explica y permite crearlo en el mismo paso.
      if (method === 'likebook_wallet' && (code === 'PIN_INVALID' || code === 'PIN_LOCKED' || code === 'PAYMENT_TOKEN_INVALID')) {
        if (!needSetPin) {
          setNeedSetPin(true);
          setPinErr('Si es tu primer pago: escribe tu contraseña y elige tu PIN de 6 dígitos.');
        } else {
          setPinErr(e instanceof Error ? e.message : 'No se pudo confirmar el pago');
        }
        setPinOpen(true);
      } else {
        Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo crear el pedido');
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  /** PIN confirmado → token del importe exacto → pedido. */
  const pagarConMonedero = async (pin: string, password?: string) => {
    if (pinBusy) return;
    setPinBusy(true); setPinErr(null);
    try {
      if (needSetPin) await fijarPin(pin, password);
      const token = await walletApi.paymentToken(pin, 'ESCROW_LOCK', totalFinal);
      setPinOpen(false);
      await confirm(token);
    } catch (e) {
      setPinErr(e instanceof Error ? e.message : 'No se pudo confirmar el pago');
    } finally {
      setPinBusy(false);
    }
  };

  // Saldo del monedero al elegir esa forma de pago: saber si llega ANTES de intentarlo.
  useEffect(() => {
    if (method !== 'likebook_wallet') { setSaldoMonedero(null); return; }
    let vivo = true;
    void walletApi.getWallet()
      .then((w) => { if (vivo) setSaldoMonedero(Number(w.balanceAvailable ?? 0)); })
      .catch(() => { if (vivo) setSaldoMonedero(null); });
    return () => { vivo = false; };
  }, [method]);

  const s = styles(colors);

  // ---- Carrito vacío (sin compra directa): pantalla única, sin formulario
  if (!soloMode && cart.length === 0) {
    return (
      <View style={[stylesRoot(colors).root, { paddingTop: insets.top }]}>
        <ScreenHeader titulo="Confirmar pedido" alVolver={() => ir.atras()} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e32 }}>
          <Text style={{ fontSize: ilustracion.md, marginBottom: espaciado.e10 }}>🛒</Text>
          <Text style={{ fontSize: tipografia.body, fontWeight: '800', color: colors.textPrimary }}>Tu carrito está vacío</Text>
          <Text style={{ fontSize: tipografia.body, color: colors.textSecondary, textAlign: 'center', marginTop: espaciado.e6, lineHeight: 18 }}>
            Explora el mercado y añade productos: pago en efectivo o por la app.
          </Text>
          <Pressable onPress={() => router.replace('/ecomerse' as any)} style={{ marginTop: espaciado.e18, backgroundColor: brand.secondary, paddingHorizontal: espaciado.e20, paddingVertical: espaciado.e11, borderRadius: radios.full }}>
            <Text style={{ color: brand.white, fontWeight: '800', fontSize: tipografia.body }}>Explorar el mercado</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[stylesRoot(colors).root, { paddingTop: insets.top }]}>
      <ScreenHeader titulo="Confirmar pedido" alVolver={() => ir.atras()} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
        <ScrollView contentContainerStyle={{ padding: espaciado.e16, paddingBottom: espaciado.e24 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {/* Líneas del pedido */}
          {productLoading && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, backgroundColor: colors.surface, borderRadius: radios.md, padding: espaciado.e12, marginBottom: espaciado.e8 }}>
              <View style={{ width: 48, height: 48, borderRadius: radios.sm, backgroundColor: colors.border }} />
              <View style={{ flex: 1, gap: espaciado.e6 }}>
                <View style={{ height: 12, borderRadius: radios.sm, backgroundColor: colors.border, width: '80%' }} />
                <View style={{ height: 12, borderRadius: radios.sm, backgroundColor: colors.border, width: '40%' }} />
              </View>
            </View>
          )}
          {lines.map((l) => (
            <View key={claveLinea(l)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radios.md, padding: espaciado.e12, marginBottom: espaciado.e8 }}>
              {l.photo ? (
                <Image source={{ uri: l.photo }} style={{ width: 48, height: 48, borderRadius: radios.sm, backgroundColor: colors.border }} contentFit="cover" />
              ) : (
                <View style={{ width: 48, height: 48, borderRadius: radios.sm, backgroundColor: alpha(colors.primary, 0.1), alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ fontSize: ilustracion.sm }}>📦</Text>
                </View>
              )}
              <View style={{ flex: 1, marginLeft: espaciado.e10 }}>
                <Text numberOfLines={1} style={{ fontSize: tipografia.body, fontWeight: '700', color: colors.textPrimary }}>{l.title}</Text>
                {/* La combinación, debajo del título: es lo que distingue dos líneas del MISMO anuncio. */}
                {l.variantName ? (
                  <Text numberOfLines={1} style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.textSecondary, marginTop: espaciado.e2 }}>
                    {l.variantName}
                  </Text>
                ) : null}
                <Text style={{ fontSize: tipografia.body, fontWeight: '900', color: brand.secondary, marginTop: espaciado.e2 }}>
                  {formatXAF(l.priceXaf)}{l.qty > 1 ? ` × ${l.qty} = ${formatXAF(l.priceXaf * l.qty)}` : ''}
                </Text>
              </View>
              {!soloMode ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}>
                  <Pressable onPress={() => setQty(claveLinea(l), Math.max(1, l.qty - 1))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Quitar uno" style={qtyBtn(colors)}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '900' }}>−</Text>
                  </Pressable>
                  <Text style={{ fontSize: tipografia.body, fontWeight: '800', color: colors.textPrimary, minWidth: 22, textAlign: 'center' }}>{l.qty}</Text>
                  <Pressable onPress={() => setQty(claveLinea(l), Math.min(l.stock ?? 99, l.qty + 1))} hitSlop={10} accessibilityRole="button" accessibilityLabel="Añadir uno" style={qtyBtn(colors)}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '900' }}>+</Text>
                  </Pressable>
                  <Pressable onPress={() => removeFromCart(claveLinea(l))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Quitar del carrito">
                    <Trash2 size={16} color={colors.danger} />
                  </Pressable>
                </View>
              ) : (
                <Text style={{ fontSize: tipografia.body, color: colors.textSecondary }}>×{l.qty}</Text>
              )}
            </View>
          ))}

          {/* LA AGENDA (Fase 2 del pie): aquí se ELIGE en vez de teclear. Lo que se congela en el
              pedido es el texto de la dirección marcada, y de ella se HEREDA la zona —que es la que
              trae la tarifa—, así que elegir ahorra el cálculo manual en cada compra. */}
          <Text style={s.label}>Dirección de entrega {fulfillment === 'agent' ? '* (obligatoria con agente)' : '(opcional)'}</Text>

          {/* Tiene agenda, pero de OTRA ciudad. Se DICE en vez de esconderla sin explicar nada. */}
          {enOtraCiudad && !manual ? (
            <View style={{ backgroundColor: alpha(colors.primary, 0.08), borderRadius: radios.md, padding: espaciado.e10, marginBottom: espaciado.e8 }}>
              <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary }}>
                Tus direcciones guardadas son de otra ciudad. Aquí se entrega en {cityForZones ?? 'esta ciudad'}: escribe dónde o guárdala desde «Mis direcciones».
              </Text>
            </View>
          ) : null}

          {direccionesDeCiudad.length > 0 && !manual ? (
            <>
              {direccionesDeCiudad.map((d) => {
                const elegida = addressId === d.id;
                return (
                  <Pressable
                    key={d.id}
                    onPress={() => elegirDireccion(d)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: elegida }}
                    accessibilityLabel={`Entregar en la dirección de ${d.recipient}`}
                    style={[s.addrCard, { backgroundColor: colors.surface, borderColor: elegida ? colors.primary : colors.border, borderWidth: elegida ? trazo.fuerte : trazo.fino }]}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: tipografia.body, fontWeight: peso.fuerte, color: colors.textPrimary }} numberOfLines={1}>
                        {d.recipient}
                      </Text>
                      {d.label ? (
                        <View style={[s.sello, { borderColor: colors.border }]}>
                          <Text style={{ fontSize: tipografia.micro, fontWeight: peso.fuerte, color: colors.textSecondary }}>{d.label}</Text>
                        </View>
                      ) : null}
                      {d.isDefault ? (
                        <View style={[s.sello, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                          <Text style={{ fontSize: tipografia.micro, fontWeight: peso.fuerte, color: brand.white }}>Predeterminada</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, marginTop: espaciado.e2 }}>{d.phone}</Text>
                    <Text style={{ fontSize: tipografia.body, color: colors.textPrimary, marginTop: espaciado.e4 }} numberOfLines={2}>
                      {textoDeDireccion(d)}
                    </Text>
                    {/* La zona que se HEREDA se dice: es lo que decide la tarifa del agente. */}
                    {d.zoneLabel ? (
                      <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, marginTop: espaciado.e2 }}>Zona: {d.zoneLabel}</Text>
                    ) : (
                      <Text style={{ fontSize: tipografia.caption, color: colors.danger, fontWeight: peso.fuerte, marginTop: espaciado.e2 }}>
                        Sin zona: elige abajo la tarifa.
                      </Text>
                    )}
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => { setManual(true); setAddressId(''); }}
                accessibilityRole="button"
                accessibilityLabel="Escribir otra dirección a mano"
                style={s.addrLink}
              >
                <Pencil size={14} color={colors.primary} />
                <Text style={{ fontSize: tipografia.body, fontWeight: peso.fuerte, color: colors.primary }}>Escribir otra dirección a mano</Text>
              </Pressable>
            </>
          ) : (
            <>
              {/* Vuelta atrás: quien pidió teclear puede recuperar sus guardadas sin salir del checkout. */}
              {direccionesDeCiudad.length > 0 ? (
                <Pressable
                  onPress={() => setManual(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Usar una de mis direcciones guardadas"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, paddingBottom: espaciado.e6 }}
                >
                  <MapPin size={14} color={colors.primary} />
                  <Text style={{ fontSize: tipografia.body, fontWeight: peso.fuerte, color: colors.primary }}>Usar una de mis direcciones guardadas</Text>
                </Pressable>
              ) : null}
              <FormField value={address} onChangeText={setAddress} placeholder="Ej: Zona Industrial, Malabo II" />
            </>
          )}

          {/* Lo único accesorio de esta pantalla. La ZONA no se pliega: define la tarifa. */}
          <MasOpciones
            abrir="Añadir una nota para el vendedor"
            cerrar="Ocultar la nota"
            abiertoInicial={note.trim() !== ''}
          >
            <FormField value={note} onChangeText={setNote} placeholder="Ej: llamar al llegar" />
          </MasOpciones>

          <Text style={s.label}>Método de pago</Text>
          <Pressable onPress={() => setMethod('cash')} accessibilityRole="radio" accessibilityState={{ checked: method === 'cash' }}
            style={[s.methodCard, { borderColor: method === 'cash' ? brand.secondary : colors.border, borderWidth: method === 'cash' ? 2 : 1 }]}>
            <Banknote size={18} color={brand.secondary} />
            <View style={{ flex: 1, marginLeft: espaciado.e10 }}>
              <Text style={{ fontSize: tipografia.body, fontWeight: '700', color: colors.textPrimary }}>Efectivo a la entrega</Text>
              <Text style={{ fontSize: tipografia.body, color: colors.textSecondary }}>
                Pagas al {fulfillment === 'agent' ? 'agente' : 'vendedor'} al recibir. EG Route Plan no retiene el dinero; la garantía de 7 días aplica solo con pago Billing.
              </Text>
            </View>
          </Pressable>
          <Pressable onPress={() => setMethod('billing')} accessibilityRole="radio" accessibilityState={{ checked: method === 'billing' }}
            style={[s.methodCard, { borderColor: method === 'billing' ? brand.secondary : colors.border, borderWidth: method === 'billing' ? 2 : 1, marginTop: espaciado.e8 }]}>
            <CreditCard size={18} color={colors.primary} />
            <View style={{ flex: 1, marginLeft: espaciado.e10 }}>
              <Text style={{ fontSize: tipografia.body, fontWeight: '700', color: colors.textPrimary }}>Pago Billing (transferencia)</Text>
              <Text style={{ fontSize: tipografia.body, color: colors.textSecondary }}>
                Genera una orden de {formatXAF(totalFinal)} XAF; sube tu comprobante y el admin la aprueba (habitual 2–24 h). El pedido no se mueve hasta aprobarse.
              </Text>
            </View>
          </Pressable>
          {/* PAGO CON EL MONEDERO (parche 101): era la tarjeta «Eg Pay · Próximamente». */}
          <Pressable onPress={() => setMethod('likebook_wallet')} accessibilityRole="radio" accessibilityState={{ checked: method === 'likebook_wallet' }}
            style={[s.methodCard, { borderColor: method === 'likebook_wallet' ? brand.secondary : colors.border, borderWidth: method === 'likebook_wallet' ? 2 : 1, marginTop: espaciado.e8 }]}>
            <Wallet size={18} color={colors.primary} />
            <View style={{ flex: 1, marginLeft: espaciado.e10 }}>
              <Text style={{ fontSize: tipografia.body, fontWeight: '700', color: colors.textPrimary }}>Monedero</Text>
              <Text style={{ fontSize: tipografia.body, color: colors.textSecondary }}>
                Confirmas con tu PIN y los {formatXAF(totalFinal)} quedan en garantía hasta que recibas el pedido.
              </Text>
              {method === 'likebook_wallet' && saldoMonedero !== null ? (
                <Text style={{ fontSize: tipografia.body, fontWeight: '800', marginTop: espaciado.e3, color: saldoMonedero >= totalFinal ? brand.success : brand.dangerPressed }}>
                  Tienes {formatXAF(saldoMonedero)}{saldoMonedero >= totalFinal ? '' : ' · no llega'}
                </Text>
              ) : null}
            </View>
          </Pressable>

          <Text style={s.label}>Entrega</Text>
          <Pressable onPress={() => setFulfillment('seller')} accessibilityRole="radio" accessibilityState={{ checked: fulfillment === 'seller' }}
            style={[s.methodCard, { borderColor: fulfillment === 'seller' ? brand.secondary : colors.border, borderWidth: fulfillment === 'seller' ? 2 : 1 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: tipografia.body, fontWeight: '700', color: colors.textPrimary }}>Entrega directa del vendedor</Text>
              <Text style={{ fontSize: tipografia.body, color: colors.textSecondary }}>Quedan en un punto acordado y el vendedor entrega.</Text>
            </View>
          </Pressable>
          <Pressable onPress={() => setFulfillment('agent')} accessibilityRole="radio" accessibilityState={{ checked: fulfillment === 'agent' }}
            style={[s.methodCard, { borderColor: fulfillment === 'agent' ? brand.secondary : colors.border, borderWidth: fulfillment === 'agent' ? 2 : 1, marginTop: espaciado.e8 }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: tipografia.body, fontWeight: '700', color: colors.textPrimary }}>Entrega por agente 🚚</Text>
              <Text style={{ fontSize: tipografia.body, color: colors.textSecondary }}>Un agente local recoge y entrega con seguimiento. Se aplica la tarifa de tu zona.</Text>
            </View>
          </Pressable>

          {/* Zona → tarifa (nunca un 500 fantasma) */}
          {fulfillment === 'agent' && (
            <View style={{ marginTop: espaciado.e10 }}>
              <Text style={s.label}>Zona de entrega * (define la tarifa)</Text>
              {zonesLoading ? (
                <Text style={{ fontSize: tipografia.body, color: colors.textSecondary }}>Cargando zonas…</Text>
              ) : zonesError || zones.length === 0 ? (
                <View style={{ backgroundColor: alpha(colors.danger, 0.08), borderRadius: radios.md, padding: espaciado.e10 }}>
                  <Text style={{ fontSize: tipografia.body, color: colors.danger, fontWeight: '700' }}>
                    No hay agentes disponibles en {cityForZones ?? 'esta ciudad'} ahora mismo. Usa la entrega directa del vendedor.
                  </Text>
                </View>
              ) : (
                <>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6 }}>
                    {zones.map((z) => (
                      <Pressable key={z.id} onPress={() => setZoneId(z.id)} accessibilityRole="button" accessibilityLabel={z.label}
                        style={{ paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e6, borderRadius: radios.md, backgroundColor: zoneId === z.id ? colors.primary : colors.surface, borderWidth: 1, borderColor: zoneId === z.id ? colors.primary : colors.border }}>
                        <Text style={{ fontSize: tipografia.body, fontWeight: '700', color: zoneId === z.id ? brand.white : colors.textPrimary }}>{z.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {zone && (
                    <View style={{ marginTop: espaciado.e8 }}>
                      <Text style={{ fontSize: tipografia.body, color: colors.textSecondary }}>
                        Tarifa base {formatXAF(zone.baseFeeXaf)} + {formatXAF(zone.perKmXaf)}/km · por defecto {zone.kmDefault} km
                      </Text>
                      <TextInput
                        value={kmText}
                        onChangeText={setKmText}
                        placeholder={`Distancia en km (1–200; por defecto ${zone.kmDefault})`}
                        placeholderTextColor={colors.textSecondary}
                        keyboardType="numeric"
                        accessibilityLabel="Distancia en kilómetros"
                        style={[s.kmInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                      />
                    </View>
                  )}
                </>
              )}
            </View>
          )}

          {/* Desglose fijo, SIEMPRE visible, encima del CTA */}
          <View style={[s.summary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Row label={`Subtotal (${lines.length} artículo${lines.length === 1 ? '' : 's'})`} value={formatXAF(total)} />
            <Row label={fulfillment === 'agent' ? `Entrega · ${zone?.label ?? 'sin zona'}` : 'Entrega (vendedor)'} value={logisticsFee > 0 ? formatXAF(logisticsFee) : 'Gratis'} />
            <View style={[s.divider, { backgroundColor: colors.border }]} />
            <Row label="Total a pagar" value={formatXAF(totalFinal)} big />
          </View>
          {fulfillment === 'agent' && !zone && (
            <Text style={{ fontSize: tipografia.body, color: colors.danger, fontWeight: '700', marginTop: espaciado.e6 }}>
              Elige la zona para calcular el total. No se aplican cargos ocultos.
            </Text>
          )}

          <View style={{ marginTop: espaciado.e16 }}>
            <PrimaryButton
              title={busy ? 'Creando pedido…' : `Confirmar · ${formatXAF(totalFinal)}`}
              /* Sin envolver: el botón pasa el EVENTO como primer argumento y se colaría
                 como token de pago. Con monedero, la hoja del PIN pide el token. */
              onPress={() => void confirm()}
              disabled={!canConfirm}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <PinSheet
        visible={pinOpen}
        title={`Pagar ${formatXAF(totalFinal)} con el monedero`}
        subtitle={needSetPin
          ? 'Primer pago: escribe tu contraseña y elige un PIN de 6 dígitos.'
          : 'El importe queda en garantía hasta que recibas el pedido.'}
        busy={pinBusy}
        error={pinErr}
        needPassword={needSetPin}
        confirmLabel={needSetPin ? 'Guardar PIN y pagar' : 'Confirmar pago'}
        onClose={() => setPinOpen(false)}
        onConfirm={(pin, pwd) => void pagarConMonedero(pin, pwd)}
      />
    </View>
  );
}

function Row({ label, value, big }: { label: string; value: string; big?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: espaciado.e4 }}>
      <Text style={{ fontSize: big ? 15 : 13, fontWeight: big ? '900' : '600', color: colors.textPrimary }}>{label}</Text>
      <Text style={{ fontSize: big ? 17 : 13, fontWeight: '900', color: big ? brand.secondary : colors.textPrimary }}>{value}</Text>
    </View>
  );
}

const stylesRoot = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({ root: { flex: 1, backgroundColor: c.background } });

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  label: { fontSize: tipografia.body, fontWeight: '700', color: c.textPrimary, marginTop: espaciado.e14, marginBottom: espaciado.e6 },
  methodCard: { flexDirection: 'row', alignItems: 'center', borderRadius: radios.md, padding: espaciado.e14, backgroundColor: c.surface },
  /* Las direcciones guardadas se pintan como tarjetas elegibles, no como cromo decorativo: la
     marcada se distingue por el borde (2 px + primario), la misma señal que los métodos de pago. */
  addrCard: { borderRadius: radios.md, padding: espaciado.e12, marginBottom: espaciado.e8 },
  sello: { borderRadius: radios.sm, borderWidth: trazo.fino, paddingHorizontal: espaciado.e6, paddingVertical: 1 },
  addrLink: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, paddingVertical: espaciado.e8 },
  kmInput: { marginTop: espaciado.e8, borderRadius: radios.md, borderWidth: 1, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e9, fontSize: tipografia.body },
  summary: { borderRadius: radios.md, borderWidth: 1, padding: espaciado.e12, marginTop: espaciado.e18 },
  divider: { height: 1, marginVertical: espaciado.e6 },
});

const qtyBtn = (c: ReturnType<typeof useTheme>['colors']) => ({
  width: 28, height: 28, borderRadius: radios.sm, alignItems: 'center' as const, justifyContent: 'center' as const,
  backgroundColor: c.border,
});
