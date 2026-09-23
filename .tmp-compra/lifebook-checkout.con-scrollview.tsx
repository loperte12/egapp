/**
 * app/lifebook-checkout.tsx — FINALIZAR PEDIDO (Parte 36).
 *
 * Construido sobre la pantalla que envió el dueño, con los arreglos necesarios:
 *   · la lista de pagos sale del catálogo (`LB_PAY_METHODS`), con `transfer` y
 *     `deposit` incluidos y sin los que no existen (era el fallo que dejaba al
 *     comprador SIN poder pagar);
 *   · **clave de idempotencia estable por compra** (se genera una vez y se
 *     reutiliza: un doble toque o un reintento no crean dos pedidos);
 *   · los chips son `Chip` (Pressable) con los tokens reales del tema;
 *   · `lbXaf()`, `absUrl()`, `<AuthGate>`, área segura y validación de dirección.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, GhostButton, PrimaryButton, useTheme } from '@egrouteplan/ui-kit';
import { ArrowLeft, Banknote, Building2, MapPin, Package, Store, Truck, Wallet } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { absUrl } from '../api/config';
import { commerceApi, commerceOrdersApi, cuponesApi, descuentoDeCupon, type LbCupon, type LbProduct } from '../api/commerce';
import { SelectorDeCupon } from '../components/lifebook/SelectorDeCupon';
import { LB_CITIES, lbXaf } from '../constants/lifebook';
import { LB_PAY_METHODS, LB_PAY_STATUS_LABEL, lbPayLabel, lbTransportLabel } from '../constants/commerce';
import { Chip, ChipRow } from '../components/lifebook/Chip';
import { Notice } from '../components/lifebook/publish/PublishParts';
import { ir as irSeguro } from '../constants/rutas';

const PAY_ICON: Record<string, React.ReactNode> = {
  cash_on_delivery: <Banknote size={15} color="#16a34a" />,
  likebook_wallet: <Wallet size={15} color="#86909C" />,
  billing: <Building2 size={15} color="#0084FF" />,
};

export default function LifeBookCheckoutScreen() {
  return (
    <AuthGate>
      <CheckoutContent />
    </AuthGate>
  );
}

function CheckoutContent() {
  const { productId, variantId, quantity: qtyParam, conversationId: convParam } = useLocalSearchParams<{ productId: string; variantId?: string; quantity?: string; conversationId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const quantity = Math.max(1, Math.min(99, Number(qtyParam ?? '1') || 1));
  const [product, setProduct] = useState<LbProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [deliveryMode, setDeliveryMode] = useState('pickup');
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);
  const [city, setCity] = useState('Malabo');
  const [zone, setZone] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  /** Para poder LLEVAR LA VISTA al sitio que falta cuando el botón no puede seguir. */
  const scrollRef = useRef<ScrollView>(null);
  const pagoY = useRef(0);
  const direccionY = useRef(0);
  /** Una sola clave por compra: se reutiliza si el usuario reintenta. */
  const idemKey = useRef<string>(Crypto.randomUUID());

  /** Las formas de pago que de verdad se pueden elegir (el servidor manda el estado). */
  const metodosActivos = useMemo(
    () => (product?.paymentMethods ?? []).filter((m) => m.status === 'active'),
    [product],
  );

  useEffect(() => {
    mounted.current = true;
    (async () => {
      try {
        const { product: p } = await commerceApi.product(String(productId));
        if (!mounted.current) return;
        setProduct(p);
        setCity(p.originCity ?? p.shop.city ?? 'Malabo');
        /**
         * NADA de marcar una forma de pago sola… salvo que solo haya UNA.
         *
         * Antes se marcaba siempre la primera activa, y esa lista llega **ordenada alfabéticamente**
         * («billing» la primera): todos los pedidos salían pagados por un método que nadie había
         * elegido — lo reportó el dueño («a la hora de comprar no seleccionas el método de pago»).
         * Si solo hay una forma de cobro no hay nada que elegir (obligar a tocar sería un paso tonto),
         * pero con dos o más **elige quien compra**.
         */
        const activos = (p.paymentMethods ?? []).filter((m) => m.status === 'active');
        if (activos.length === 1) setPaymentMethod(activos[0].method);
      } catch (e) {
        if (mounted.current) setError(e instanceof Error ? e.message : 'No se pudo cargar la publicación');
      } finally {
        if (mounted.current) setLoading(false);
      }
    })();
    return () => { mounted.current = false; };
  }, [productId]);

  const variant = useMemo(
    () => product?.variants.find((v) => v.id === variantId) ?? null,
    [product, variantId],
  );
  const unitPrice = variant?.priceXaf ?? product?.priceXaf ?? 0;
  const subtotal = unitPrice * quantity;

  /** Modos de entrega reales de la tienda (+ recogida siempre). */
  const deliveryOptions = useMemo(() => {
    const modos = product?.shippingPolicy?.transportModes ?? [];
    return ['pickup', ...modos.filter((m) => m !== 'pickup')];
  }, [product]);

  const policy = product?.shippingPolicy ?? null;
  const envioAConsultar = deliveryMode !== 'pickup' && (!policy || policy.costMode === 'on_request');
  const deliveryCost = deliveryMode === 'pickup' ? 0 : policy?.costMode === 'fixed' ? policy.baseCostXaf : 0;

  /* ── TANDA Q: EL CUPÓN ───────────────────────────────────────────────────────────────────────
   *
   * Se piden MIS cupones al abrir la caja (no al pulsar pagar): el descuento tiene que verse ANTES
   * de confirmar. Los de otras tiendas no se enseñan aquí: un cupón solo vale en su tienda.
   * El descuento que se cobra lo decide el servidor; esto es solo el espejo para la pantalla.
   */
  const [cupones, setCupones] = useState<LbCupon[]>([]);
  const [cuponElegido, setCuponElegido] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await cuponesApi.mios();
        if (vivo) setCupones(r.items ?? []);
      } catch { if (vivo) setCupones([]); }
    })();
    return () => { vivo = false; };
  }, []);

  const cuponesDeLaTienda = useMemo(
    () => cupones.filter((c) => !c.shopId || c.shopId === product?.shop.id),
    [cupones, product],
  );
  const cuponObj = useMemo(
    () => cuponesDeLaTienda.find((c) => c.code === cuponElegido) ?? null,
    [cuponesDeLaTienda, cuponElegido],
  );
  const descuento = descuentoDeCupon(cuponObj, subtotal);
  const total = Math.max(0, subtotal + deliveryCost - descuento);

  /** Recoger un cupón por su código y, si vale aquí, dejarlo aplicado. */
  const recogerCupon = useCallback(async (code: string): Promise<string | null> => {
    try {
      await cuponesApi.recoger(code);
      const r = await cuponesApi.mios();
      const lista = r.items ?? [];
      setCupones(lista);
      const nuevo = lista.find((c) => c.code.toUpperCase() === code.toUpperCase());
      if (nuevo && (!nuevo.shopId || nuevo.shopId === product?.shop.id)) setCuponElegido(nuevo.code);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'No se pudo usar ese código';
    }
  }, [product]);

  const confirmar = useCallback(async () => {
    if (!product || submitting) return;
    /**
     * Si falta algo, se DICE **y se lleva la vista allí**.
     *
     * Antes el aviso salía en un recuadro ARRIBA del todo —fuera de la pantalla cuando estás en el
     * pie—, así que el botón parecía no hacer nada: es lo que reportó el dueño («el botón confirmar
     * pagar no reacciona»). Ahora el motivo se ve en el pie y la pantalla se desplaza al sitio que
     * hay que rellenar.
     */
    if (!paymentMethod) {
      setError(metodosActivos.length
        ? 'Elige cómo pagas para poder confirmar'
        : 'Esta tienda no tiene ninguna forma de pago activa');
      scrollRef.current?.scrollTo({ y: Math.max(0, pagoY.current - 80), animated: true });
      return;
    }
    if (deliveryMode !== 'pickup' && (!city.trim() || (!zone.trim() && !reference.trim()))) {
      setError('Para el reparto indica ciudad y barrio, o un punto de referencia');
      scrollRef.current?.scrollTo({ y: Math.max(0, direccionY.current - 80), animated: true });
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const { order } = await commerceOrdersApi.create({
        items: [{ productId: product.id, variantId: variant?.id ?? null, quantity }],
        deliveryMode,
        deliveryAddress: deliveryMode === 'pickup' ? {} : { city: city.trim(), zone: zone.trim(), reference: reference.trim() },
        paymentMethod: paymentMethod as never,
        note: note.trim() || undefined,
        /* TANDA Q: el cupón elegido. Solo viaja el CÓDIGO: el descuento lo calcula el servidor. */
        ...(cuponElegido ? { couponCode: cuponElegido } : {}),
        /* MERCADO (tanda E): la compra nació en un chat → el pedido se publica allí como tarjeta.
           Si el chat es un GRUPO, además con el aviso social. El servidor comprueba que de verdad
           sea una conversación suya: aquí solo se transporta el identificador. */
        ...(convParam ? { conversationId: String(convParam) } : {}),
      }, idemKey.current);
      irSeguro.libre('/lifebook-order/[id]', { id: order.id }, true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear el pedido');
    } finally {
      setSubmitting(false);
    }
  }, [product, variant, quantity, deliveryMode, paymentMethod, city, zone, reference, note, submitting, router, metodosActivos, cuponElegido]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!product) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: 24, gap: 12 }]}>
        <Text style={{ color: colors.textPrimary, fontWeight: '800', textAlign: 'center' }}>{error ?? 'No se pudo cargar'}</Text>
        <GhostButton title="Volver" onPress={() => router.back()} />
      </View>
    );
  }

  const input = [styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: alpha(colors.border, 0.5) }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Volver">
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontWeight: '900', fontSize: 16, marginLeft: 10 }}>Finalizar pedido</Text>
      </View>

      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '900' }}>PRUEBA-CUERPO</Text>
        {error ? <Notice tone="error">{error}</Notice> : null}

        {/* Artículo */}
        <View style={[styles.card, { borderColor: alpha(colors.border, 0.6), backgroundColor: colors.card }]}>
          {product.media[0] ? (
            <Image source={absUrl(product.media[0].url)} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" transition={0} />
          ) : (
            <View style={[styles.thumb, { backgroundColor: alpha(colors.primary, 0.1), alignItems: 'center', justifyContent: 'center' }]}>
              <Package size={20} color={alpha(colors.primary, 0.6)} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text numberOfLines={2} style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 13.5 }}>{product.title}</Text>
            {variant ? <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Opción: {variant.name}</Text> : null}
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>Cantidad: {quantity}</Text>
          </View>
          <Text style={{ color: colors.primary, fontWeight: '900' }}>{lbXaf(subtotal)}</Text>
        </View>

        {/* Entrega */}
        <Text style={[styles.section, { color: colors.textPrimary }]}>¿Cómo lo recibes?</Text>
        <ChipRow>
          {deliveryOptions.map((m) => (
            <Chip
              key={m}
              label={m === 'pickup' ? 'Recoger en tienda' : lbTransportLabel(m)}
              active={deliveryMode === m}
              onPress={() => setDeliveryMode(m)}
            />
          ))}
        </ChipRow>

        {deliveryMode !== 'pickup' ? (
          <View
            style={{ gap: 8, marginTop: 10 }}
            onLayout={(e) => { direccionY.current = e.nativeEvent.layout.y; }}
          >
            <Text style={[styles.label, { color: colors.textSecondary }]}>Ciudad</Text>
            <ChipRow>
              {LB_CITIES.map((c) => (
                <Chip key={c} label={c} active={city === c} onPress={() => setCity(c)} compact />
              ))}
            </ChipRow>
            <TextInput value={zone} onChangeText={setZone} placeholder="Barrio o zona (Ej: Ela Nguema)"
              placeholderTextColor={colors.textSecondary} maxLength={60} style={input} />
            <TextInput value={reference} onChangeText={setReference} placeholder="Punto de referencia (Ej: portón azul, junto al mercado)"
              placeholderTextColor={colors.textSecondary} maxLength={200} style={input} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MapPin size={15} color={colors.primary} />
              <Text style={{ color: colors.textSecondary, fontSize: 11.5, flex: 1 }}>
                El pin del mapa y el teléfono se comparten con la tienda por el chat.
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <Store size={15} color={colors.primary} />
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
              Recoges en {product.shop.name}{product.shop.barrio ? ` · ${product.shop.barrio}` : ''}
            </Text>
          </View>
        )}

        {/* Pago */}
        <Text style={[styles.section, { color: colors.textPrimary }]}>¿Cómo pagas?</Text>
        <View
          style={{ gap: 8 }}
          onLayout={(e) => { pagoY.current = e.nativeEvent.layout.y; }}
        >
          {(product.paymentMethods ?? []).map((pm) => {
            const meta = LB_PAY_METHODS.find((p) => p.id === pm.method);
            const selectable = pm.status === 'active';
            const active = paymentMethod === pm.method && selectable;
            return (
              <View key={pm.method} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Chip
                  label={meta?.label ?? lbPayLabel(pm.method)}
                  icon={PAY_ICON[pm.method]}
                  active={active}
                  disabled={!selectable}
                  onPress={() => setPaymentMethod(pm.method)}
                />
                {!selectable ? (
                  <Text style={{ color: colors.textSecondary, fontSize: 11 }}>
                    {LB_PAY_STATUS_LABEL[pm.status] ?? pm.status}
                  </Text>
                ) : null}
              </View>
            );
          })}
          {metodosActivos.length === 0 ? (
            <Text style={{ color: colors.danger, fontSize: 11.5, fontWeight: '700', lineHeight: 17 }}>
              Esta tienda no tiene formas de pago activas: todavía no se puede pedir.
            </Text>
          ) : (
            <Text style={{
              color: paymentMethod ? colors.textSecondary : colors.danger,
              fontSize: 11.5,
              lineHeight: 17,
              fontWeight: paymentMethod ? '400' : '700',
            }}>
              {!paymentMethod
                ? 'Falta elegir cómo pagas.'
                : paymentMethod === 'cash_on_delivery'
                  ? 'Pagas en efectivo al recibir: la tienda te pedirá el código de entrega.'
                  : paymentMethod === 'transfer' || paymentMethod === 'billing'
                    ? 'Te enviaremos las instrucciones y subirás el comprobante; la tienda lo confirma y prepara el pedido.'
                    : 'El pago se acuerda con la tienda.'}
            </Text>
          )}
        </View>

        {/* Cupón (tanda Q): aquí es donde se aplica y donde se ve el descuento antes de pagar. */}
        <Text style={[styles.section, { color: colors.textPrimary }]}>Cupón</Text>
        <SelectorDeCupon
          cupones={cuponesDeLaTienda}
          subtotalXaf={subtotal}
          elegido={cuponElegido}
          onElegir={setCuponElegido}
          onRecoger={recogerCupon}
        />

        {/* Nota */}
        <Text style={[styles.section, { color: colors.textPrimary }]}>Nota para la tienda (opcional)</Text>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Ej.: llamar al llegar"
          placeholderTextColor={colors.textSecondary}
          maxLength={300}
          multiline
          style={[input, styles.area]}
        />
        <Text style={{ color: colors.textSecondary, fontSize: 11.5, marginTop: 6 }}>
          No pongas teléfonos ni enlaces: el contacto va por el chat de Life Book.
        </Text>
      </ScrollView>

      {/* Totales y confirmar */}
      <View style={{
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: alpha(colors.border, 0.6),
        backgroundColor: colors.background,
        paddingBottom: insets.bottom + 10,
      }}>
        {/*
          EL MOTIVO, EN EL PIE. El recuadro de arriba se queda fuera de la pantalla cuando estás aquí
          abajo, así que el botón parecía no hacer nada: es el fallo que reportó el dueño.
        */}
        {error ? (
          <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700', paddingHorizontal: 16, paddingTop: 9 }}>
            {error}
          </Text>
        ) : null}
        <View style={[styles.footer, { borderTopWidth: 0, paddingBottom: 0 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '900' }}>PRUEBA-PIE</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 11.5 }}>
              Entrega: {envioAConsultar ? 'a acordar con la tienda' : lbXaf(deliveryCost)}
            </Text>
            {descuento > 0 ? (
              <Text style={{ color: colors.success, fontSize: 11.5, fontWeight: '800' }}>
                Cupón {cuponElegido}: −{lbXaf(descuento)}
              </Text>
            ) : null}
            {/* Se ve ANTES de confirmar con qué se paga: era justo lo que faltaba. */}
            <Text style={{
              color: paymentMethod ? colors.textSecondary : colors.danger,
              fontSize: 11.5,
              fontWeight: paymentMethod ? '400' : '800',
            }}>
              {paymentMethod ? `Pagas: ${lbPayLabel(paymentMethod)}` : 'Elige cómo pagas'}
            </Text>
            <Text style={{ color: colors.textPrimary, fontSize: 19, fontWeight: '900' }}>Total: {lbXaf(total)}</Text>
          </View>
          {/*
            El botón NUNCA está muerto: si falta elegir, lo dice él mismo y al pulsarlo lleva la vista
            a las formas de pago. Solo se apaga cuando no hay nada que elegir (la tienda no cobra).
          */}
          <PrimaryButton
            title={metodosActivos.length === 0 ? 'Sin forma de pago' : paymentMethod ? 'Confirmar pedido' : 'Elige cómo pagas'}
            disabled={metodosActivos.length === 0}
            loading={submitting}
            onPress={confirmar}
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  card: { flexDirection: 'row', gap: 12, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: 12 },
  thumb: { width: 64, height: 64, borderRadius: 10 },
  section: { fontSize: 14, fontWeight: '800', marginTop: 20, marginBottom: 8 },
  label: { fontSize: 12, fontWeight: '700' },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13.5 },
  area: { minHeight: 70, textAlignVertical: 'top' },
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth,
  },
});
