/**
 * FoodCheckoutScreen — Confirmar pedido: pickup|delivery, efectivo|Billing,
 * dirección (si delivery), resumen del carrito editable.
 *
 * Auditorías senior (2026-09-02, revisión técnica):
 *  · Fuente única coherente: restaurantId del param con fallback al store, y
 *    guard explícito ANTES de enviar (URL vs store vs líneas del carrito).
 *  · clearCart() DESPUÉS de navegar (no se pierde el pedido si algo falla) +
 *    bandera `sent` (imposible duplicar el pedido con doble tap).
 *  · Carrito editable en el propio checkout (− / + / 🗑️ por línea, tope 99).
 *  · Errores inline (la dirección se valida bajo el campo, sin Alert que
 *    bloquee); FormField con error/maxLength/autoComplete; nota multiline.
 *  · Tarjeta de contexto del restaurante + cerrado (no bloquea; queda en cola).
 *  · SafeArea + KeyboardAvoidingView + a11y (radios, controles, volver).
 *
 * Auditoría de extremo a extremo (2026-09-12, ver docs/AUDITORIA-COMIDA-RAPIDA.md):
 *  · A1 — los precios se muestran DESDE EL SERVIDOR (`detail.menu`), no desde el
 *    snapshot del carrito, y se avisa con nombre y las dos cifras si el dueño los
 *    cambió. El servidor siempre recalcula al crear el pedido; antes la app
 *    mostraba un total y se cobraba otro.
 *  · Platos ya no disponibles: se detectan ANTES de enviar (el servidor los
 *    rechazaba con un error genérico), se nombran y se bloquea el CTA.
 *  · El desglose ya no dice "Envío 0 XAF · sin recargo": el reparto es gratis para
 *    el cliente y las comisiones (plataforma + reparto) las paga el RESTAURANTE.
 *  · 起送价: el importe mínimo de reparto se avisa ANTES de confirmar, con el valor que
 *    manda el servidor POR RESTAURANTE (`minOrderXaf`), y bloquea el CTA solo cuando el
 *    envío es a domicilio — recoger en el local no tiene mínimo. Aplicado el 2026-09-12;
 *    ver backend/server-patch/CHECKOUT-fees-y-minimo.md. El servidor sigue siendo la
 *    autoridad: aquí solo se avisa.
 * Ruta: /food-checkout?restaurantId=
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Banknote, Bike, CreditCard, MapPin, Minus, Plus, Store, Trash2, Wallet } from 'lucide-react-native';
import { alpha, espaciado, FormField, MasOpciones, peso, Precio, PrimaryButton, radios, ScreenHeader, tipografia, trazo, useTheme, trazoIcono} from '@egrouteplan/ui-kit';
import { foodApi, FoodRestaurantDetail } from '../api/food';
import { walletApi } from '../api/wallet';
import { fijarPin } from '../api/settlement';
import { PinSheet } from '@egrouteplan/ui-kit';
import { getGqPositionIfAllowed } from '../api/locate';
import { foodCartCount, foodCartTotal, useFoodStore } from '../state/food';
import { formatXAF } from '../utils/formatHelpers';
import { brand } from '@egrouteplan/ui-kit';
import { InlineError } from '@egrouteplan/ui-kit';
import { mensajeDeError } from '../constants/errores';
import { ir } from '../constants/rutas';

// Acento del flujo de servicios (naranja), consistente con el resto del
// marketplace. (Migración al token del theme = ronda de design system aparte.)
const ACCENT = brand.primary; // A1: la acción avanza en azul
const MAX_QTY = 99;

export default function FoodCheckoutScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { restaurantId: paramRid } = useLocalSearchParams<{ restaurantId: string }>();
  const cart = useFoodStore((s) => s.cart);
  const storeRestaurantId = useFoodStore((s) => s.restaurantId);
  // Fuente única de verdad: param con fallback al store (auditoría P0).
  const rid = paramRid || storeRestaurantId || '';

  const [pickup, setPickup] = useState<'pickup' | 'delivery'>('pickup');
  const [address, setAddress] = useState('');
  // Ubicación EXACTA del cliente (opcional), como [lng, lat] igual que `LocCoord` en api/locate.ts.
  // Es opcional a propósito: pedirla obligatoria dejaría sin pedir a quien no quiera dar su posición.
  // Con ella, el repartidor navega al punto; sin ella, al menos tiene el texto.
  const [pin, setPin] = useState<[number, number] | null>(null);
  const [ubicando, setUbicando] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [method, setMethod] = useState<'cash' | 'billing' | 'likebook_wallet'>('cash');
  /**
   * PAGO CON EL MONEDERO (parche 98): el cliente confirma con su PIN y el importe queda EN
   * GARANTÍA; el restaurante cobra en su monedero al entregar el pedido.
   */
  const [pinOpen, setPinOpen] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinErr, setPinErr] = useState<string | null>(null);
  const [needSetPin, setNeedSetPin] = useState(false);
  const [saldoMonedero, setSaldoMonedero] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [detail, setDetail] = useState<FoodRestaurantDetail | null>(null);
  const busyRef = useRef(false);

  // Líneas del carrito de ESTE restaurante (nunca se envía otro pedido).
  const lines = useMemo(() => (rid ? cart.filter((c) => c.restaurantId === rid) : []), [cart, rid]);
  const count = useMemo(() => foodCartCount(lines), [lines]);

  // ── PRECIOS DEL SERVIDOR, no los del carrito (A1 de la auditoría) ──────────────
  // El carrito guarda el precio del momento en que se añadió (snapshot local en
  // AsyncStorage, y puede sobrevivir días). Si el dueño cambió el precio después, el
  // cliente veía un total y se le cobraba otro: el servidor SIEMPRE recalcula desde la
  // BD al crear el pedido (nunca acepta precios del cliente), así que la app tiene que
  // mostrar lo que el servidor va a cobrar, no lo que el carrito recuerda.
  //
  // No hace falta una petición extra: `detail.menu` ya viene en la misma llamada que el
  // contexto del restaurante. Mientras `detail` no llegue (o si falla, que no es
  // crítico) se usa el precio del carrito, que es lo que se mostraba antes.
  const serverPrices = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of detail?.menu ?? []) m.set(it.id, it.priceXaf);
    return m;
  }, [detail]);

  const pricedLines = useMemo(
    () => lines.map((c) => {
      const p = serverPrices.get(c.itemId);
      return typeof p === 'number' ? { ...c, priceXaf: p } : c;
    }),
    [lines, serverPrices],
  );

  const total = useMemo(() => foodCartTotal(pricedLines), [pricedLines]);

  // Qué cambió respecto al carrito, con nombre y las dos cifras: un aviso genérico
  // («los precios han cambiado») no le dice al cliente qué plato ni cuánto.
  const priceChanges = useMemo(() => {
    const out: Array<{ name: string; antes: number; ahora: number }> = [];
    for (const c of lines) {
      const p = serverPrices.get(c.itemId);
      if (typeof p === 'number' && p !== c.priceXaf) out.push({ name: c.name, antes: c.priceXaf, ahora: p });
    }
    return out;
  }, [lines, serverPrices]);

  // Platos del carrito que el restaurante YA NO sirve (desactivado o borrado). El
  // servidor los rechaza al enviar con un error genérico; mejor decirlo antes y con el
  // nombre del plato. Solo se calcula cuando `detail` ya cargó, para no marcar como
  // «no disponible» algo que simplemente no ha llegado todavía por la red.
  const missing = useMemo(
    () => (detail === null ? [] : lines.filter((c) => !serverPrices.has(c.itemId))),
    [detail, lines, serverPrices],
  );

  // 起送价: importe mínimo para pedir a DOMICILIO, POR RESTAURANTE (lo manda el servidor en
  // `minOrderXaf`; no se escribe a mano aquí, que es justo la desincronización que se está arreglando).
  // Y solo cuenta para reparto: recoger en el local no tiene mínimo. Esa distinción la garantiza el
  // servidor, así que la app la respeta en vez de inventarse su propia regla.
  const minimoReparto = typeof detail?.minOrderXaf === 'number' && detail.minOrderXaf > 0 ? detail.minOrderXaf : null;
  const bloqueadoPorMinimo = pickup === 'delivery' && minimoReparto !== null && total < minimoReparto;

  // Contexto del restaurante (público): nombre, ciudad, dirección, horario.
  useEffect(() => {
    if (!rid) return;
    let cancelled = false;
    foodApi.restaurant(rid)
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch(() => undefined); // contexto no crítico
    return () => { cancelled = true; };
  }, [rid]);

  // Estado de pantalla cuando no hay líneas confirmables.
  const empty: { emoji: string; title: string; sub: string } | null = useMemo(() => {
    if (lines.length > 0) return null;
    if (!rid) return { emoji: '🍽️', title: 'Pedido incompleto', sub: 'Falta el restaurante. Vuelve al menú y vuelve a confirmar.' };
    if (cart.length > 0) return { emoji: '🛒', title: 'Carrito de otro restaurante', sub: 'Tu carrito tiene ítems de otro restaurante. Vuelve al menú correcto.' };
    return { emoji: '🛒', title: 'Tu carrito está vacío', sub: 'Añade platos desde el menú del restaurante y vuelve a confirmar.' };
  }, [lines.length, rid, cart.length]);

  const store = useFoodStore;

  const confirm = async (paymentToken?: string) => {
    if (!rid || lines.length === 0 || busyRef.current || sent) return;
    // Monedero: primero el PIN (el dinero se retiene antes de crear el pedido).
    if (method === 'likebook_wallet' && !paymentToken) {
      setPinErr(null); setNeedSetPin(false); setPinOpen(true);
      return;
    }
    // No enviar un pedido que el servidor va a rechazar por platos inexistentes: el
    // error volvería genérico y el cliente no sabría qué plato quitar. Se bloquea aquí
    // con el nombre, que es la información útil.
    if (missing.length > 0) {
      setSubmitError(`Quita del pedido ${missing.length === 1 ? 'el plato que ya no está disponible' : 'los platos que ya no están disponibles'}: ${missing.map((m) => m.name).join(', ')}.`);
      return;
    }
    // Guard de coherencia (URL vs store) antes de enviar — auditoría P0.
    if (storeRestaurantId && storeRestaurantId !== rid) {
      Alert.alert('Error', 'Este pedido no corresponde al restaurante que tienes abierto.');
      return;
    }
    if (cart.some((c) => c.restaurantId && c.restaurantId !== rid)) {
      Alert.alert('Error', 'Hay ítems de otro restaurante en el carrito.');
      return;
    }
    // Validación inline (sin Alert bloqueante) para la dirección.
    if (pickup === 'delivery' && !address.trim()) {
      setAddressError('Indica la dirección de entrega.');
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setSubmitError(null);
    try {
      const r = await foodApi.createOrder({
        restaurantId: rid,
        items: lines.map((c) => ({ itemId: c.itemId, qty: c.qty })),
        paymentMethod: method,
        pickupType: pickup,
        deliveryAddress: pickup === 'delivery' ? address.trim() : undefined,
        // El pin viaja solo si es a domicilio y el cliente lo dio: `LocCoord` es [lng, lat] y la API
        // espera lat/lng por separado (el servidor valida las dos y que caigan dentro del país).
        deliveryLat: pickup === 'delivery' && pin ? pin[1] : undefined,
        deliveryLng: pickup === 'delivery' && pin ? pin[0] : undefined,
        note: note.trim() || undefined,
      }, paymentToken);
      setSent(true); // el pedido existe: no permitir reenviar aunque falle la navegación
      if (r.billingOrderId) {
        router.replace({ pathname: '/billing-checkout', params: { orderId: r.billingOrderId } } as any);
      } else {
        router.replace('/food-orders' as any);
      }
      store.getState().clearCart(); // DESPUÉS de navegar (auditoría P0)
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
        setSubmitError(mensajeDeError(e, 'No se pudo enviar el pedido. Revisa tu conexión e inténtalo de nuevo.'));
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
      const token = await walletApi.paymentToken(pin, 'ESCROW_LOCK', total);
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
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      {/* Cabecera del kit desde el 24/09/2026. */}
      <ScreenHeader titulo="Confirmar pedido" alVolver={() => ir.atras()} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={{ padding: espaciado.e16, paddingBottom: 40 + insets.bottom }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {empty ? (
            <View style={s_center.wrap}>
              <Text style={{ fontSize: tipografia.emoji, marginBottom: espaciado.e10 }}>{empty.emoji}</Text>
              <Text style={[s_center.title, { color: colors.textPrimary }]}>{empty.title}</Text>
              <Text style={[s_center.sub, { color: colors.textSecondary }]}>{empty.sub}</Text>
              <Pressable onPress={() => ir.atras()} accessibilityRole="button" style={s_center.btnPrimary}>
                <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>Volver</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {/* Contexto del restaurante */}
              {detail && (
                <View style={[s.restCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={{ fontSize: tipografia.fino, fontWeight: peso.maximo, color: colors.textPrimary }}>{detail.businessName}</Text>
                  <Text style={{ fontSize: tipografia.body, color: colors.textSecondary, marginTop: espaciado.e2 }}>
                    {detail.cuisineLabel ?? 'Restaurante'} · {detail.city}
                  </Text>
                  {detail.hours ? <Text style={{ fontSize: tipografia.body, color: colors.textSecondary, marginTop: espaciado.e2 }}>🕐 {detail.hours}</Text> : null}
                  {detail.address ? (
                    <Text numberOfLines={2} style={{ fontSize: tipografia.body, color: colors.textSecondary, marginTop: espaciado.e2 }}>📍 {detail.address}</Text>
                  ) : null}
                  {detail.isOpen === false && (
                    <Text style={{ fontSize: tipografia.body, fontWeight: peso.fuerte, color: colors.text.danger, marginTop: espaciado.e4 }}>
                      Cerrado ahora · tu pedido quedará en cola y lo confirmarán cuando abra.
                    </Text>
                  )}
                </View>
              )}

              {/* Resumen editable. Se pinta con `pricedLines`, no con `lines`: la línea
                  muestra el precio que el servidor va a cobrar. */}
              <Text style={s.label}>Tu pedido · {count} ítem{count === 1 ? '' : 's'}</Text>

              {missing.length > 0 && (
                <View style={[s.warnBox, { backgroundColor: alpha(colors.danger, 0.08), borderColor: alpha(colors.danger, 0.3) }]}>
                  <Text style={{ fontSize: tipografia.body, fontWeight: peso.maximo, color: colors.text.danger }}>
                    {missing.length === 1 ? 'Un plato ya no está disponible' : `${missing.length} platos ya no están disponibles`}
                  </Text>
                  <Text style={{ fontSize: tipografia.body, color: colors.textSecondary, marginTop: espaciado.e3, lineHeight: 15 }}>
                    {missing.map((m) => m.name).join(', ')} · quítalo{missing.length === 1 ? '' : 's'} del pedido para poder confirmar.
                  </Text>
                </View>
              )}

              {priceChanges.length > 0 && (
                <View style={[s.warnBox, { backgroundColor: alpha(brand.warning, 0.1), borderColor: alpha(brand.warning, 0.35) }]}>
                  <Text style={{ fontSize: tipografia.body, fontWeight: peso.maximo, color: brand.warningText }}>
                    El restaurante cambió algún precio
                  </Text>
                  {priceChanges.map((c) => (
                    <Text key={c.name} style={{ fontSize: tipografia.body, color: colors.textSecondary, marginTop: espaciado.e2, lineHeight: 15 }}>
                      {c.name}: {formatXAF(c.antes)} → <Text style={{ fontWeight: peso.maximo, color: brand.warningText }}>{formatXAF(c.ahora)}</Text>
                    </Text>
                  ))}
                  <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e3 }}>
                    Los importes de abajo ya están actualizados.
                  </Text>
                </View>
              )}

              {/* 起送价: el mínimo se avisa ANTES de confirmar. Antes el cliente elegía reparto,
                  pulsaba «Confirmar» y se enteraba del mínimo al final del flujo, cuando ya había
                  decidido. Solo aparece con reparto y con cifra del servidor. */}
              {bloqueadoPorMinimo && minimoReparto !== null && (
                <View style={[s.warnBox, { backgroundColor: alpha(colors.danger, 0.08), borderColor: alpha(colors.danger, 0.3) }]}>
                  <Text style={{ fontSize: tipografia.body, fontWeight: peso.maximo, color: colors.text.danger }}>
                    Para reparto el pedido mínimo es {formatXAF(minimoReparto)}
                  </Text>
                  <Text style={{ fontSize: tipografia.body, color: colors.textSecondary, marginTop: espaciado.e3, lineHeight: 15 }}>
                    Llevas {formatXAF(total)}. Añade algo más o cambia a recoger en el local.
                  </Text>
                </View>
              )}

              {pricedLines.map((c) => (
                <CartLineRow
                  key={c.itemId}
                  name={c.name}
                  price={c.priceXaf}
                  qty={c.qty}
                  lineTotal={c.priceXaf * c.qty}
                  onDec={() => store.getState().setQty(c.itemId, c.qty - 1)}
                  onInc={() => store.getState().setQty(c.itemId, c.qty + 1)}
                  onRemove={() => store.getState().removeFromCart(c.itemId)}
                />
              ))}

              {/* Desglose de costos */}
              <View style={s.breakdown}>
                <View style={s.brRow}>
                  <Text style={{ fontSize: tipografia.body, color: colors.textSecondary }}>Subtotal</Text>
                  <Precio valor={total} tamano="md" color={colors.textPrimary} />
                </View>
                <View style={s.brRow}>
                  <Text style={{ fontSize: tipografia.body, color: colors.textSecondary }}>Envío</Text>
                  <Text style={{ fontSize: tipografia.body, fontWeight: peso.fuerte, color: colors.text.primary }}>Gratis</Text>
                </View>
                <View style={[s.brRow, { marginTop: espaciado.e4 }]}>
                  <Text style={{ fontSize: tipografia.cuerpo, fontWeight: peso.maximo, color: colors.textPrimary }}>Total</Text>
                  <Precio valor={total} tamano="lg" color={ACCENT} />
                </View>
                {/* Honestidad sobre las comisiones: existen y las paga el restaurante. Se dice
                    aquí porque el dueño decidió que la comisión se muestre a ambos, y el
                    desglose con cifras llega en la pantalla del pedido (food-orders). El importe
                    exacto no se puede calcular en la app: la configuración es POR RESTAURANTE
                    (`wallet.food_commission_config`) y `mapRestaurant` no la devuelve — ver el
                    parche `CHECKOUT-fees-y-minimo.md`. Hasta que se exponga, se explica sin cifras
                    en vez de inventar un cálculo que podría no coincidir con el del servidor. */}
                <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e4, lineHeight: 14 }}>
                  El reparto es gratis para ti. Las comisiones de la plataforma y del reparto las
                  paga el restaurante: van incluidas en estos precios, no se te suman.
                </Text>
              </View>

              {/* Recogida o reparto */}
              <Text style={s.label}>Entrega</Text>
              <Pressable onPress={() => setPickup('pickup')} accessibilityRole="radio" accessibilityState={{ checked: pickup === 'pickup' }}
                accessibilityLabel="Recoger en el local"
                style={[s.modeCard, { borderColor: pickup === 'pickup' ? ACCENT : colors.border, borderWidth: pickup === 'pickup' ? 2 : 1 }]}>
                <Store size={18} color={ACCENT} />
                <View style={{ flex: 1, marginLeft: espaciado.e10 }}>
                  <Text style={{ fontSize: tipografia.body, fontWeight: peso.fuerte, color: colors.textPrimary }}>Recoger en el local</Text>
                  <Text style={{ fontSize: tipografia.body, color: colors.textSecondary }}>Pasa a recoger tu pedido.</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => setPickup('delivery')} accessibilityRole="radio" accessibilityState={{ checked: pickup === 'delivery' }}
                accessibilityLabel="A domicilio"
                style={[s.modeCard, { borderColor: pickup === 'delivery' ? ACCENT : colors.border, borderWidth: pickup === 'delivery' ? 2 : 1, marginTop: espaciado.e8 }]}>
                <Bike size={18} color={ACCENT} />
                <View style={{ flex: 1, marginLeft: espaciado.e10 }}>
                  <Text style={{ fontSize: tipografia.body, fontWeight: peso.fuerte, color: colors.textPrimary }}>A domicilio</Text>
                  <Text style={{ fontSize: tipografia.body, color: colors.textSecondary }}>Reparto a tu dirección.</Text>
                </View>
              </Pressable>

              {pickup === 'delivery' && (
                <>
                  <Text style={s.label}>Dirección de entrega *</Text>
                  <FormField
                    value={address}
                    onChangeText={(t) => { setAddress(t); if (addressError) setAddressError(null); }}
                    placeholder="Ej: Zona Industrial, Malabo II"
                    error={addressError ?? undefined}
                    maxLength={300}
                    autoComplete="street-address"
                  />

                  {/* ── UBICACIÓN EXACTA (opcional) ─────────────────────────────────
                      «Aeropuerto» no se puede navegar: el repartidor necesita un punto. Este botón
                      toma la posición del cliente y la manda CON el pedido. Es opcional —quien no
                      quiera dar su posición sigue pidiendo con la dirección escrita— pero cuando
                      está, el repartidor abre el mapa en el punto exacto. */}
                  <Pressable
                    onPress={async () => {
                      setUbicando(true);
                      try {
                        const c = await getGqPositionIfAllowed(6000);
                        if (!c) {
                          Alert.alert('Ubicación', 'No pudimos obtener tu ubicación. Puedes pedir igualmente con la dirección escrita.');
                          return;
                        }
                        setPin(c);
                      } finally { setUbicando(false); }
                    }}
                    disabled={ubicando}
                    accessibilityRole="button"
                    accessibilityLabel="Añadir mi ubicación exacta para el reparto"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, marginTop: espaciado.e8, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10, borderRadius: radios.chip, borderWidth: trazo.fino, borderColor: pin ? alpha(colors.success, 0.5) : colors.border, backgroundColor: pin ? alpha(colors.success, 0.08) : 'transparent' }}
                  >
                    <MapPin size={15} color={pin ? colors.text.success : colors.textPrimary} />
                    <Text style={{ flex: 1, fontSize: tipografia.body, fontWeight: peso.fuerte, color: pin ? colors.text.success : colors.textPrimary }}>
                      {ubicando ? 'Buscando tu ubicación…' : pin ? '✓ Ubicación exacta añadida al pedido' : 'Añadir mi ubicación exacta (ayuda al repartidor a llegar)'}
                    </Text>
                    {pin ? (
                      <Pressable onPress={() => setPin(null)} accessibilityRole="button" accessibilityLabel="Quitar la ubicación exacta" hitSlop={8}>
                        <Text style={{ fontSize: tipografia.body, color: colors.textSecondary }}>Quitar</Text>
                      </Pressable>
                    ) : null}
                  </Pressable>
                  {pin ? (
                    <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e4 }}>
                      Se envía solo con este pedido y el repartidor lo usa para llegar.
                    </Text>
                  ) : null}
                </>
              )}
              {/*
                Plegado (Fase 2 · punto 25): la nota es lo ÚNICO accesorio de esta pantalla. La
                dirección y el método de pago se quedan a la vista — sin ellos no hay pedido —.
                La etiqueta «Nota (opcional)» desaparece porque el enlace ya dice qué se añade.
              */}
              <MasOpciones
                abrir="Añadir una nota para el restaurante"
                cerrar="Ocultar la nota"
                abiertoInicial={note.trim() !== ''}
              >
                <TextInput
                  value={note}
                  onChangeText={setNote}
                  placeholder="Ej: sin cebolla, llamar al llegar…"
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  maxLength={500}
                  style={[s.area, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
                />
              </MasOpciones>

              {/* Método de pago */}
              <Text style={s.label}>Método de pago</Text>
              <Pressable onPress={() => setMethod('cash')} accessibilityRole="radio" accessibilityState={{ checked: method === 'cash' }}
                accessibilityLabel="Efectivo al recoger o recibir"
                style={[s.modeCard, { borderColor: method === 'cash' ? ACCENT : colors.border, borderWidth: method === 'cash' ? 2 : 1 }]}>
                <Banknote size={18} color={ACCENT} />
                <View style={{ flex: 1, marginLeft: espaciado.e10 }}>
                  <Text style={{ fontSize: tipografia.body, fontWeight: peso.fuerte, color: colors.textPrimary }}>Efectivo al recoger/recibir</Text>
                  <Text style={{ fontSize: tipografia.body, color: colors.textSecondary }}>Paga al recoger o recibir · EG no retiene el dinero.</Text>
                </View>
              </Pressable>
              <Pressable onPress={() => setMethod('billing')} accessibilityRole="radio" accessibilityState={{ checked: method === 'billing' }}
                accessibilityLabel="Pago Billing por transferencia"
                style={[s.modeCard, { borderColor: method === 'billing' ? ACCENT : colors.border, borderWidth: method === 'billing' ? 2 : 1, marginTop: espaciado.e8 }]}>
                <CreditCard size={18} color={ACCENT} />
                <View style={{ flex: 1, marginLeft: espaciado.e10 }}>
                  <Text style={{ fontSize: tipografia.body, fontWeight: peso.fuerte, color: colors.textPrimary }}>Pago Billing (transferencia)</Text>
                  <Text style={{ fontSize: tipografia.body, color: colors.textSecondary }}>Orden de pago con comprobante · aprobación 2–24 h.</Text>
                </View>
              </Pressable>
              {/* PAGO CON EL MONEDERO (parche 98): retiene el importe y el restaurante cobra al entregar. */}
              <Pressable onPress={() => setMethod('likebook_wallet')} accessibilityRole="radio" accessibilityState={{ checked: method === 'likebook_wallet' }}
                accessibilityLabel="Pagar con el monedero"
                style={[s.modeCard, { borderColor: method === 'likebook_wallet' ? ACCENT : colors.border, borderWidth: method === 'likebook_wallet' ? 2 : 1, marginTop: espaciado.e8 }]}>
                <Wallet size={18} color={ACCENT} />
                <View style={{ flex: 1, marginLeft: espaciado.e10 }}>
                  <Text style={{ fontSize: tipografia.body, fontWeight: peso.fuerte, color: colors.textPrimary }}>Monedero</Text>
                  <Text style={{ fontSize: tipografia.body, color: colors.textSecondary }}>
                    Confirmas con tu PIN y el importe queda en garantía hasta que recibas el pedido.
                  </Text>
                  {method === 'likebook_wallet' && saldoMonedero !== null ? (
                    <Text style={{ fontSize: tipografia.body, fontWeight: peso.maximo, marginTop: espaciado.e3, color: saldoMonedero >= total ? colors.text.success : brand.dangerPressed }}>
                      Tienes {formatXAF(saldoMonedero)}{saldoMonedero >= total ? '' : ' · no llega'}
                    </Text>
                  ) : null}
                </View>
              </Pressable>
              {method === 'billing' && (
                <Text style={{ fontSize: tipografia.body, color: colors.textSecondary, marginTop: espaciado.e6, lineHeight: 15 }}>
                  Tras confirmar crearás una orden de pago y subirás el comprobante. El restaurante prepara tu pedido
                  cuando el pago esté aprobado (revisión 2–24 h).
                </Text>
              )}

              {/* Error persistente */}
              {submitError ? (
                <View style={{ marginBottom: espaciado.e12 }}>
                  {/* Error EN LA PANTALLA, no encima: el usuario no pierde lo que estaba haciendo. */}
                  <InlineError mensaje={submitError} />
                </View>
              ) : null}

              {/* CTA con TOTAL visible antes de confirmar */}
              <View style={{ marginTop: espaciado.e20 }}>
                <PrimaryButton
                  title={busy ? 'Enviando pedido…' : `Confirmar pedido · ${formatXAF(total)}`}
                  /* Sin envolver: el botón pasa el EVENTO como primer argumento y se colaría
                     como token de pago. Con monedero, la hoja del PIN pide el token. */
                  onPress={() => void confirm()}
                  disabled={busy || sent || lines.length === 0 || missing.length > 0 || bloqueadoPorMinimo}
                />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <PinSheet
        visible={pinOpen}
        title={`Pagar ${formatXAF(total)} con el monedero`}
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

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

function CartLineRow({ name, price, qty, lineTotal, onDec, onInc, onRemove }: {
  name: string; price: number; qty: number; lineTotal: number;
  onDec: () => void; onInc: () => void; onRemove: () => void;
}) {
  const { colors } = useTheme();
  const atMax = qty >= MAX_QTY;
  return (
    <View style={[s_line.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaciado.e8 }}>
          <Text numberOfLines={2} style={{ flex: 1, fontSize: tipografia.body, color: colors.textPrimary }}>{name}</Text>
          <Precio valor={lineTotal} tamano="md" color={colors.textPrimary} />
        </View>
        <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: 1 }}>{formatXAF(price)} c/u</Text>
        <View style={s_line.controls}>
          <Pressable onPress={onRemove} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Quitar ${name} del pedido`}
            style={[s_line.iconBtn, { backgroundColor: alpha(colors.danger, 0.1) }]}>
            <Trash2 size={14} color={colors.text.danger} />
          </Pressable>
          <Pressable onPress={onDec} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Reducir cantidad de ${name}`}
            style={[s_line.stepBtn, { backgroundColor: colors.border }]}>
            <Minus size={13} color={colors.textPrimary} strokeWidth={trazoIcono.marcado} />
          </Pressable>
          <Text style={[s_line.qty, { color: colors.textPrimary }]}>{qty}</Text>
          <Pressable onPress={onInc} disabled={atMax} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Aumentar cantidad de ${name}`}
            style={[s_line.stepBtn, { backgroundColor: ACCENT, opacity: atMax ? 0.4 : 1 }]}>
            <Plus size={13} color={brand.white} strokeWidth={trazoIcono.marcado} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const s_line = StyleSheet.create({
  card: { borderRadius: radios.md, borderWidth: trazo.fino, padding: espaciado.e10, marginBottom: espaciado.e6 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, marginTop: espaciado.e8 },
  iconBtn: { width: 28, height: 28, borderRadius: radios.sm, alignItems: 'center', justifyContent: 'center' },
  stepBtn: { width: 28, height: 28, borderRadius: radios.sm, alignItems: 'center', justifyContent: 'center' },
  qty: { fontSize: tipografia.body, fontWeight: peso.maximo, minWidth: 16, textAlign: 'center' },
});

const s_center = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 56, paddingHorizontal: espaciado.e28 },
  title: { fontSize: tipografia.cuerpo, fontWeight: peso.maximo, textAlign: 'center' },
  sub: { fontSize: tipografia.body, textAlign: 'center', marginTop: espaciado.e6, lineHeight: 18 },
  btnPrimary: { marginTop: espaciado.e18, backgroundColor: brand.secondary, paddingHorizontal: espaciado.e28, paddingVertical: espaciado.e11, borderRadius: radios.panelAncho },
});

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  label: { fontSize: tipografia.body, fontWeight: peso.fuerte, color: c.textPrimary, marginTop: espaciado.e14, marginBottom: espaciado.e6 },
  restCard: { borderRadius: radios.md, borderWidth: trazo.fino, padding: espaciado.e12, marginBottom: espaciado.e4 },
  breakdown: { backgroundColor: c.surface, borderRadius: radios.md, borderWidth: trazo.fino, borderColor: c.border, padding: espaciado.e12, marginTop: espaciado.e10 },
  brRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: espaciado.e2 },
  modeCard: { flexDirection: 'row', alignItems: 'center', borderRadius: radios.md, padding: espaciado.e14, backgroundColor: c.surface },
  warnBox: { borderRadius: radios.chip, borderWidth: trazo.fino, padding: espaciado.e10, marginBottom: espaciado.e10 },
  area: { minHeight: 64, borderRadius: radios.campo, borderWidth: trazo.fino, padding: espaciado.e12, fontSize: tipografia.body, textAlignVertical: 'top' },
  errorBox: { borderRadius: radios.chip, padding: espaciado.e10, marginTop: espaciado.e14 },
});
