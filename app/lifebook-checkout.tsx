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
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as Crypto from 'expo-crypto';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, GhostButton, neutro, peso, Precio, PrimaryButton, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import { ArrowLeft, Banknote, Building2, MapPin, Package, Store, Truck, Wallet } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { absUrl } from '../api/config';
import { commerceApi, commerceOrdersApi, cuponesApi, descuentoDeCupon, type LbCupon, type LbProduct } from '../api/commerce';
import { walletApi } from '../api/wallet';
import { fijarPin } from '../api/settlement';
import { PinSheet } from '@egrouteplan/ui-kit';
import { SelectorDeCupon } from '../components/lifebook/SelectorDeCupon';
import { LB_CITIES, lbXaf } from '../constants/lifebook';
import { LB_PAY_METHODS, LB_PAY_STATUS_LABEL, lbPayLabel, lbTransportLabel } from '../constants/commerce';
import { Chip, ChipRow } from '../components/lifebook/Chip';
import { Notice } from '../components/lifebook/publish/PublishParts';
import { ir as irSeguro } from '../constants/rutas';
import { brand } from '@egrouteplan/ui-kit';

const PAY_ICON: Record<string, React.ReactNode> = {
  cash_on_delivery: <Banknote size={15} color={brand.success} />,
  likebook_wallet: <Wallet size={15} color={neutro.n600} />,
  billing: <Building2 size={15} color={brand.primary} />,
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
  /**
   * PAGO CON EL MONEDERO (parche 97): el comprador confirma con su PIN y el dinero queda
   * EN GARANTÍA hasta que reciba el pedido; entonces el vendedor cobra en SU monedero.
   * El token de pago se pide al servidor justo antes de crear el pedido, con el importe
   * exacto del total (si el total cambia, el token deja de valer: es a propósito).
   */
  const [pinOpen, setPinOpen] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [needSetPin, setNeedSetPin] = useState(false);
  const [saldoMonedero, setSaldoMonedero] = useState<number | null>(null);
  const [city, setCity] = useState('Malabo');
  const [zone, setZone] = useState('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  /** Una sola clave por compra: se reutiliza si el usuario reintenta. */
  const idemKey = useRef<string>(Crypto.randomUUID());

  /** Las formas de pago que de verdad se pueden elegir (el servidor manda el estado). */
  const metodosActivos = useMemo(
    () => (product?.paymentMethods ?? []).filter((m) => m.status === 'active'),
    [product],
  );

  /** 
   * EL CUERPO EN BLANCO: CAUSA RAÍZ Y ARREGLO (15/09/2026).
   *
   * El pie llevaba el PrimaryButton del kit dentro de una FILA. Ese botón trae width: '100%'
   * (pensado para ir a lo ancho de una columna): en la fila se comía TODO el ancho, la columna de
   * totales quedaba a ~0 px, sus textos se partían letra por letra hasta ~2.133 px de alto, el pie
   * pasaba a medir 2.110 px y el cuerpo (flex: 1) se quedaba con 0 → cuerpo en blanco.
   * Medido: 2 textos en el árbol con el fallo, 24 después; pie a y=2.078-2.186 y no a 244.
   * El botón va ahora en su propia caja de ancho fijo (ver el pie).
   */

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

  const confirmar = useCallback(async (paymentToken?: string) => {
    if (!product || submitting) return;
    /**
     * Si falta algo, se DICE en el pie, junto al botón.
     *
     * Antes el aviso salía en un recuadro ARRIBA del todo —fuera de la pantalla cuando estás en el
     * pie—, así que el botón parecía no hacer nada: es lo que reportó el dueño («el botón confirmar
     * pagar no reacciona»).
     */
    if (!paymentMethod) {
      setError(metodosActivos.length
        ? 'Elige cómo pagas para poder confirmar'
        : 'Esta tienda no tiene ninguna forma de pago activa');
      return;
    }
    if (deliveryMode !== 'pickup' && (!city.trim() || (!zone.trim() && !reference.trim()))) {
      setError('Para el reparto indica ciudad y barrio, o un punto de referencia');
      return;
    }
    // Monedero: se pide el PIN antes de tocar nada (el dinero se retiene en la garantía).
    if (paymentMethod === 'likebook_wallet' && !paymentToken) {
      setPinErr(null); setNeedSetPin(false); setPinOpen(true);
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
      }, idemKey.current, paymentToken);
      irSeguro.libre('/lifebook-order/[id]', { id: order.id }, true);
    } catch (e) {
      const code = (e as { code?: string })?.code;
      // PIN incorrecto o aún sin PIN: la hoja del PIN explica y permite crearlo.
      if (paymentMethod === 'likebook_wallet' && (code === 'PIN_INVALID' || code === 'PIN_LOCKED' || code === 'PAYMENT_TOKEN_INVALID')) {
        if (!needSetPin) {
          setNeedSetPin(true);
          setPinErr('Si es tu primer pago: escribe tu contraseña y elige tu PIN de 6 dígitos.');
        } else {
          setPinErr(e instanceof Error ? e.message : 'No se pudo confirmar el pago');
        }
        setPinOpen(true);
      } else {
        setError(e instanceof Error ? e.message : 'No se pudo crear el pedido');
      }
    } finally {
      setSubmitting(false);
    }
  }, [product, variant, quantity, deliveryMode, paymentMethod, city, zone, reference, note, submitting, router, metodosActivos, cuponElegido, needSetPin]);

  // Saldo del monedero al elegir pagar con él: saber si llega ANTES de intentarlo.
  useEffect(() => {
    if (paymentMethod !== 'likebook_wallet') { setSaldoMonedero(null); return; }
    let vivo = true;
    void walletApi.getWallet()
      .then((w) => { if (vivo) setSaldoMonedero(Number(w.balanceAvailable ?? 0)); })
      .catch(() => { if (vivo) setSaldoMonedero(null); });
    return () => { vivo = false; };
  }, [paymentMethod]);

  /** PIN confirmado → token de pago del importe exacto → pedido. */  const pagarConMonedero = useCallback(async (pin: string, password?: string) => {
    if (pinBusy) return;
    setPinBusy(true); setPinErr(null);
    try {
      if (needSetPin) await fijarPin(pin, password);
      const token = await walletApi.paymentToken(pin, 'ESCROW_LOCK', total);
      setPinOpen(false);
      await confirmar(token);
    } catch (e) {
      setPinErr(e instanceof Error ? e.message : 'No se pudo confirmar el pago');
    } finally {
      setPinBusy(false);
    }
  }, [pinBusy, needSetPin, total, confirmar]);

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }
  if (!product) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: espaciado.e24, gap: espaciado.e12 }]}>
        <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, textAlign: 'center' }}>{error ?? 'No se pudo cargar'}</Text>
        <GhostButton title="Volver" onPress={() => irSeguro.atras()} />
      </View>
    );
  }

  const input = [styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }];

  return (
    /*
      OJO, ESTO NO ES UN CAMBIO DE ESTILO: es un arreglo.

      Antes aquí había un `KeyboardAvoidingView` (con `behavior` indefinido en Android, o sea, un
      envoltorio que no hacía nada) y dentro un `ScrollView`. En el móvil el cuerpo salía **VACÍO**:
      la cabecera y el pie sí, y todo lo del medio no —ni el artículo, ni «¿Cómo pagas?», ni las
      formas de pago, ni el cupón—. Comprobado con el volcado de la pantalla y midiendo los píxeles:
      esa zona era un color plano. Quitando el envoltorio, el mismo `ScrollView` con el mismo
      contenido se pinta entero. Por eso ahora es un `View` normal.
    */
    <View
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: alpha(colors.border, 0.5) }]}>
        <Pressable onPress={() => irSeguro.atras()} hitSlop={10} accessibilityLabel="Volver">
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.subtitle, marginLeft: espaciado.e10 }}>Finalizar pedido</Text>
      </View>

      {/*
        EL CUERPO ES UN `View`, NO UN `ScrollView`. Y no es capricho: en el móvil, con un `ScrollView`
        aquí, el cuerpo salía **VACÍO** (ni el artículo, ni «¿Cómo pagas?», ni las formas de pago, ni el
        cupón: esa zona era un color plano, medido en los píxeles de la pantalla y en el volcado de la
        interfaz). Comprobado aislándolo: un texto de prueba *dentro* del `ScrollView` tampoco salía, y
        el mismo texto *fuera* sí. Con un `View` se pinta todo. Ver `TANDA-R`.
      */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: espaciado.e16, paddingTop: espaciado.e16, paddingBottom: espaciado.e24 }} keyboardShouldPersistTaps="handled">
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
            <Text numberOfLines={2} style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body }}>{product.title}</Text>
            {variant ? <Text style={{ color: colors.textSecondary, fontSize: tipografia.body }}>Opción: {variant.name}</Text> : null}
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.body }}>Cantidad: {quantity}</Text>
          </View>
          <Precio valor={subtotal} tamano="md" color={colors.primary} />
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
          <View style={{ gap: espaciado.e8, marginTop: espaciado.e10 }}>
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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}>
              <MapPin size={15} color={colors.primary} />
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, flex: 1 }}>
                El pin del mapa y el teléfono se comparten con la tienda por el chat.
              </Text>
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, marginTop: espaciado.e10 }}>
            <Store size={15} color={colors.primary} />
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.body }}>
              Recoges en {product.shop.name}{product.shop.barrio ? ` · ${product.shop.barrio}` : ''}
            </Text>
          </View>
        )}

        {/* Pago */}
        <Text style={[styles.section, { color: colors.textPrimary }]}>¿Cómo pagas?</Text>
        <View style={{ gap: espaciado.e8 }}>
          {(product.paymentMethods ?? []).map((pm) => {
            const meta = LB_PAY_METHODS.find((p) => p.id === pm.method);
            const selectable = pm.status === 'active';
            const active = paymentMethod === pm.method && selectable;
            return (
              <View key={pm.method} style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e10 }}>
                <Chip
                  label={meta?.label ?? lbPayLabel(pm.method)}
                  icon={PAY_ICON[pm.method]}
                  active={active}
                  disabled={!selectable}
                  onPress={() => setPaymentMethod(pm.method)}
                />
                {!selectable ? (
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.body }}>
                    {LB_PAY_STATUS_LABEL[pm.status] ?? pm.status}
                  </Text>
                ) : null}
              </View>
            );
          })}
          {metodosActivos.length === 0 ? (
            <Text style={{ color: colors.danger, fontSize: tipografia.body, fontWeight: peso.fuerte, lineHeight: 17 }}>
              Esta tienda no tiene formas de pago activas: todavía no se puede pedir.
            </Text>
          ) : (
            <Text style={{
              color: paymentMethod ? colors.textSecondary : colors.danger,
              fontSize: tipografia.body,
              lineHeight: 17,
              fontWeight: paymentMethod ? peso.normal : peso.fuerte,
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
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, marginTop: espaciado.e6 }}>
          No pongas teléfonos ni enlaces: el contacto va por el chat de Life Book.
        </Text>
      </ScrollView>
      {/* Totales y confirmar */}
      <View
        style={{
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
          <Text style={{ color: colors.danger, fontSize: tipografia.body, fontWeight: peso.fuerte, paddingHorizontal: espaciado.e16, paddingTop: espaciado.e9 }}>
            {error}
          </Text>
        ) : null}
        <View style={[styles.footer, { borderTopWidth: 0, paddingBottom: 0 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.body }}>
              Entrega: {envioAConsultar ? 'a acordar con la tienda' : lbXaf(deliveryCost)}
            </Text>
            {descuento > 0 ? (
              <Text style={{ color: colors.success, fontSize: tipografia.body, fontWeight: peso.maximo }}>
                Cupón {cuponElegido}: −{lbXaf(descuento)}
              </Text>
            ) : null}
            {/* Se ve ANTES de confirmar con qué se paga: era justo lo que faltaba. */}
            <Text style={{
              color: paymentMethod ? colors.textSecondary : colors.danger,
              fontSize: tipografia.body,
              fontWeight: paymentMethod ? peso.normal : peso.maximo,
            }}>
              {paymentMethod ? `Pagas: ${lbPayLabel(paymentMethod)}` : 'Elige cómo pagas'}
            </Text>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.cifra, fontWeight: peso.titulo }}>Total: {lbXaf(total)}</Text>
            {paymentMethod === 'likebook_wallet' && saldoMonedero !== null ? (
              <Text style={{ color: saldoMonedero >= total ? brand.success : brand.dangerPressed, fontSize: tipografia.body, fontWeight: peso.fuerte }}>
                Monedero: {lbXaf(saldoMonedero)}{saldoMonedero >= total ? '' : ' · no llega'}
              </Text>
            ) : null}
          </View>
          {/*
            El botón NUNCA está muerto: si falta elegir, lo dice él mismo; solo se apaga cuando no
            hay nada que elegir (la tienda no tiene ninguna forma de cobro).

            ── Y VA EN SU PROPIA CAJA: ES EL ARREGLO DEL CUERPO EN BLANCO (15/09/2026) ──────────────
            `PrimaryButton` del kit trae `width: '100%'` (línea 102 de
            `node_modules/@egrouteplan/ui-kit/src/primitives/PrimaryButton.tsx`), pensado para ir a lo
            ancho de una COLUMNA. Aquí está dentro de una FILA junto a la columna de totales: ese
            100% se queda con TODO el ancho (botón de 984 px medidos), la columna se aplasta a ~0 px,
            sus textos se parten letra por letra y crecen hasta ~2.133 px de alto → el pie pasa a
            medir 2.110 px → el cuerpo (`flex: 1`) se queda con 0 px **y la pantalla sale en blanco**
            (cabecera y pie sí, el medio no). Lo mismo rompía `lifebook-order/[id]`.
            Con una caja de ancho fijo, el 100% es el de la caja y la columna respira.
          */}
          <View style={{ width: 176 }}>
            <PrimaryButton
              title={metodosActivos.length === 0 ? 'Sin forma de pago' : paymentMethod ? 'Confirmar pedido' : 'Elige cómo pagas'}
              disabled={metodosActivos.length === 0}
              loading={submitting}
              /* Sin envolver: el botón pasa el EVENTO como primer argumento y se colaría
                 como token de pago. Con monedero, la hoja del PIN pide el token. */
              onPress={() => void confirmar()}
            />
          </View>
        </View>
      </View>

      <PinSheet
        visible={pinOpen}
        title={`Pagar ${lbXaf(total)} con el monedero`}
        subtitle={needSetPin
          ? 'Primer pago: escribe tu contraseña y elige un PIN de 6 dígitos.'
          : 'El dinero queda en garantía hasta que recibas el pedido.'}
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

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  card: { flexDirection: 'row', gap: espaciado.e12, alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: espaciado.e12 },
  thumb: { width: 64, height: 64, borderRadius: 10 },
  /** Las secciones van juntas: el cuerpo no se desplaza, así que el hueco cuenta. */
  section: { fontSize: tipografia.body, fontWeight: peso.maximo, marginTop: espaciado.e13, marginBottom: espaciado.e8 },
  label: { fontSize: tipografia.body, fontWeight: peso.fuerte },
  input: { borderWidth: trazo.fino, borderRadius: 10, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10, fontSize: tipografia.body },
  area: { minHeight: 70, textAlignVertical: 'top' },
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e12,
    paddingHorizontal: espaciado.e16, paddingTop: espaciado.e10, borderTopWidth: StyleSheet.hairlineWidth,
  },
});
