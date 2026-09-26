/**
 * CONFIRMAR EL PEDIDO DEL CARRITO · /lifebook-carrito-checkout
 *
 * Lo que pide la especificación y aquí se hace:
 *   · **Un pedido por tienda**: lo marcado en el carrito se agrupa por tienda y cada tienda recibe
 *     SU pedido, con su entrega, su forma de pago y su mensaje. Se paga una vez por el total, pero
 *     el seguimiento es independiente (es lo que hace la especificación: «2 productos de A + 1 de B
 *     = 2 pedidos separados»).
 *   · **Dirección de envío** una sola vez (ciudad + barrio + punto de referencia). Cada pedido la
 *     lleva; «recoger en tienda» no la necesita.
 *   · **Mensaje al vendedor POR TIENDA** (una nota para cada uno, como pide la especificación).
 *   · **Desglose por bloque**: subtotal + envío = total, y el total general abajo. El envío se
 *     calcula con la política REAL de cada tienda (fijo / a calcular / a consultar): si es «a
 *     consultar» se dice, no se pone un 0 que mienta.
 *   · Al terminar: «Pago exitoso» con **«Ver pedido»**, y esos productos salen del carrito.
 *
 * Los **cupones** (tanda Q): cada tienda lleva SU cupón, porque cada una recibe SU pedido. El
 * descuento lo calcula el SERVIDOR al crear el pedido; aquí solo se enseña antes de pagar, con la
 * misma regla, para que la pantalla y el cobro no puedan decir cosas distintas.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, MasOpciones, peso, PinSheet, Precio, radios, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import { ArrowLeft, Check, Store } from 'lucide-react-native';
import * as Crypto from 'expo-crypto';
import { AuthGate } from '../core/AuthGate';
import { commerceOrdersApi, cuponesApi, descuentoDeCupon, type LbCupon } from '../api/commerce';
import { walletApi } from '../api/wallet';
import { carritoApi, type LbCarrito, type LbGrupoCarrito, type LbLineaCarrito } from '../api/lifebookCarrito';
import { SelectorDeCupon } from '../components/lifebook/SelectorDeCupon';
import { LB_CITIES, lbXaf } from '../constants/lifebook';
import { lbPayLabel, lbTransportLabel } from '../constants/commerce';
import { ir as irSeguro } from '../constants/rutas';

export default function LifeBookCarritoCheckoutScreen() {
  return (
    <AuthGate>
      <CheckoutContent />
    </AuthGate>
  );
}

function CheckoutContent() {
  const { lineas } = useLocalSearchParams<{ lineas?: string }>();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [carrito, setCarrito] = useState<LbCarrito | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [ciudad, setCiudad] = useState('Malabo');
  const [zona, setZona] = useState('');
  const [referencia, setReferencia] = useState('');
  /** Por tienda: forma de entrega, forma de pago y mensaje. */
  const [entrega, setEntrega] = useState<Record<string, string>>({});
  const [pago, setPago] = useState<Record<string, string>>({});
  const [nota, setNota] = useState<Record<string, string>>({});
  /** Clave de idempotencia por tienda: un doble toque no crea dos pedidos. */
  const claves = useMemo(() => ({} as Record<string, string>), []);
  const [exito, setExito] = useState<{ ids: string[]; codigos: string[] } | null>(null);

  const idsSeleccionados = useMemo(
    () => String(lineas ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    [lineas],
  );

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const c = await carritoApi.ver();
        if (!vivo) return;
        setCarrito(c);
        const ent: Record<string, string> = {};
        const pag: Record<string, string> = {};
        for (const g of c.groups ?? []) {
          const clave = g.shop?.id ?? 'sin-tienda';
          const modos = g.deliveryModes?.length ? g.deliveryModes : ['pickup'];
          ent[clave] = modos[0];
          /**
           * LA FORMA DE PAGO NO SE MARCA SOLA… salvo que solo haya UNA.
           *
           * Antes se marcaba siempre la primera activa, y esa lista llega **ordenada alfabéticamente**
           * («billing» la primera): todos los pedidos salían pagados por un método que nadie había
           * elegido — lo reportó el dueño («a la hora de comprar no seleccionas el método de pago»).
           * Si la tienda solo tiene una forma de cobro no hay nada que elegir; con dos o más, elige
           * quien compra.
           */
          const activos = (g.paymentMethods ?? []).filter((m) => m.status === 'active');
          if (activos.length === 1) pag[clave] = activos[0].method;
        }
        setEntrega(ent);
        setPago(pag);
      } catch (e) {
        if (vivo) setError(e instanceof Error ? e.message : 'No se pudo cargar el carrito');
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  /** Los bloques que de verdad se van a pagar (solo lo marcado y pagable). */
  const bloques = useMemo(() => {
    const grupos = (carrito?.groups ?? []).map((g) => {
      const items = g.items.filter((i) => idsSeleccionados.includes(i.id) && i.available);
      return { ...g, items, count: items.reduce((n, i) => n + i.quantity, 0), subtotalXaf: items.reduce((n, i) => n + (i.lineTotalXaf ?? 0), 0) };
    }).filter((g) => g.items.length > 0);
    return grupos;
  }, [carrito, idsSeleccionados]);

  const envioDe = useCallback((g: LbGrupoCarrito, modo: string) => {
    if (modo === 'pickup') return 0;
    if (g.deliveryCostMode === 'fixed') return g.deliveryCostXaf ?? 0;
    return null; // a consultar
  }, []);

  /**
   * TANDA Q: MIS CUPONES. Se declaran AQUÍ ARRIBA porque el resumen (el total que se va a pagar) los
   * necesita: el descuento tiene que verse antes de pagar, no después.
   */
  const [cupones, setCupones] = useState<LbCupon[]>([]);
  const [cuponPorTienda, setCuponPorTienda] = useState<Record<string, string>>({});

  const resumen = useMemo(() => {
    let subtotal = 0;
    let envio = 0;
    let descuento = 0;
    let aConsultar = false;
    for (const g of bloques) {
      const clave = g.shop?.id ?? 'sin-tienda';
      subtotal += g.subtotalXaf;
      const e = envioDe(g, entrega[clave] ?? 'pickup');
      if (e === null) aConsultar = true; else envio += e;
      const code = cuponPorTienda[clave];
      const cup = code ? cupones.find((c) => c.code === code) ?? null : null;
      descuento += descuentoDeCupon(cup, g.subtotalXaf);
    }
    return { subtotal, envio, descuento, total: Math.max(0, subtotal + envio - descuento), aConsultar };
  }, [bloques, entrega, envioDe, cupones, cuponPorTienda]);

  /** Tiendas a las que todavía no se les ha dicho cómo se paga: sin eso no se puede pagar. */
  const sinPago = bloques.filter((g) => !pago[g.shop?.id ?? 'sin-tienda']);

  /* ── TANDA Q: EL CUPÓN, POR TIENDA ───────────────────────────────────────────────────────────
   *
   * Cada tienda recibe SU pedido, así que cada uno lleva SU cupón (un cupón vale solo en su tienda).
   * Se piden MIS cupones al abrir la caja: el descuento tiene que verse antes de pagar. El que se
   * cobra lo decide el servidor; aquí solo se enseña, con la misma regla.
   */
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

  /** Los cupones que valen en una tienda. */
  const cuponesDeTienda = useCallback(
    (shopId: string) => cupones.filter((c) => !c.shopId || c.shopId === shopId),
    [cupones],
  );
  /** El cupón elegido para una tienda (o `null`). */
  const cuponDe = useCallback((g: LbGrupoCarrito): LbCupon | null => {
    const code = cuponPorTienda[g.shop?.id ?? 'sin-tienda'];
    if (!code) return null;
    return cupones.find((c) => c.code === code) ?? null;
  }, [cuponPorTienda, cupones]);

  /** Recoger un cupón por su código y, si vale en esa tienda, aplicarlo a ese pedido. */
  const recogerCupon = useCallback(async (shopId: string, code: string): Promise<string | null> => {
    try {
      await cuponesApi.recoger(code);
      const r = await cuponesApi.mios();
      const lista = r.items ?? [];
      setCupones(lista);
      const nuevo = lista.find((c) => c.code.toUpperCase() === code.toUpperCase());
      if (nuevo && (!nuevo.shopId || nuevo.shopId === shopId)) {
        setCuponPorTienda((prev) => ({ ...prev, [shopId]: nuevo.code }));
      }
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : 'No se pudo usar ese código';
    }
  }, []);

  /**
   * PAGO CON MONEDERO EN EL CARRITO (Fase 0 de la auditoría de diseño, D-36).
   *
   * El token de pago va atado a un importe EXACTO, así que solo se pide cuando el total de esa
   * tienda se conoce de verdad. Si el envío queda «a consultar», no hay importe que firmar.
   */
  const [pinTienda, setPinTienda] = useState<{ clave: string; nombre: string; total: number } | null>(null);
  const [tokensPago, setTokensPago] = useState<Record<string, string>>({});
  const [pinErr, setPinErr] = useState<string | null>(null);

  /** Total exacto de una tienda, o null si todavía no se sabe (envío a consultar). */
  const totalDeTienda = useCallback((g: LbGrupoCarrito): number | null => {
    const clave = g.shop?.id ?? 'sin-tienda';
    const envio = envioDe(g, entrega[clave] ?? 'pickup');
    if (envio === null) return null;
    return Math.max(0, g.subtotalXaf + envio - descuentoDeCupon(cuponDe(g), g.subtotalXaf));
  }, [envioDe, entrega, cuponDe]);

  const pagar = useCallback(async (tokens: Record<string, string> = tokensPago) => {
    if (enviando || !bloques.length) return;
    /**
     * Comprobaciones ANTES de tocar el dinero: dirección y forma de pago por tienda.
     *
     * Si falta algo, se DICE en el pie (donde se está mirando) **y la vista va al bloque que falta**:
     * antes el aviso salía en un recuadro arriba del todo y el botón parecía no reaccionar.
     */
    for (const g of bloques) {
      const clave = g.shop?.id ?? 'sin-tienda';
      const nombre = g.shop?.name ?? 'la tienda';
      if (!pago[clave]) {
        setError(`Elige cómo pagas en ${nombre}`);
        return;
      }
      if ((entrega[clave] ?? 'pickup') !== 'pickup' && (!ciudad.trim() || (!zona.trim() && !referencia.trim()))) {
        setError(`Para el reparto de ${nombre} indica ciudad y barrio, o un punto de referencia`);
        return;
      }
    }
    // Monedero: cada tienda que se pague con monedero necesita su token (importe exacto + PIN).
    const conMonedero = bloques.filter(
      (g) => pago[g.shop?.id ?? 'sin-tienda'] === 'likebook_wallet' && !tokens[g.shop?.id ?? 'sin-tienda'],
    );
    if (conMonedero.length) {
      const g0 = conMonedero[0];
      const clave0 = g0.shop?.id ?? 'sin-tienda';
      const total0 = totalDeTienda(g0);
      if (total0 === null) {
        setError(`En el pedido de ${g0.shop?.name ?? 'esa tienda'} el envío se acuerda al confirmar: elige efectivo, o paga con monedero desde la ficha del producto.`);
        return;
      }
      setPinErr(null);
      setPinTienda({ clave: clave0, nombre: g0.shop?.name ?? 'la tienda', total: total0 });
      return;
    }
    setEnviando(true);
    setError(null);
    const hechos: string[] = [];
    const codigos: string[] = [];
    try {
      for (const g of bloques) {
        const clave = g.shop?.id ?? 'sin-tienda';
        const modo = entrega[clave] ?? 'pickup';
        // Una clave de idempotencia por tienda y por intento: reintentar no duplica el pedido.
        if (!claves[clave]) claves[clave] = Crypto.randomUUID();
        const { order } = await commerceOrdersApi.create({
          items: g.items.map((i: LbLineaCarrito) => ({
            productId: i.productId as string,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
          deliveryMode: modo,
          deliveryAddress: modo === 'pickup' ? {} : { city: ciudad.trim(), zone: zona.trim(), reference: referencia.trim() },
          paymentMethod: pago[clave] as never,
          note: (nota[clave] ?? '').trim() || undefined,
          /* TANDA Q: el cupón de ESA tienda. Solo viaja el CÓDIGO: el descuento lo hace el servidor. */
          ...(cuponPorTienda[clave] ? { couponCode: cuponPorTienda[clave] } : {}),
        }, claves[clave], tokens[clave]);
        hechos.push(order.id);
        codigos.push(order.code);
      }
      // Los productos comprados salen del carrito (los demás se quedan).
      const comprados = bloques.flatMap((g) => g.items.map((i) => i.id));
      await carritoApi.enBloque({ remove: comprados }).catch(() => { /* el pedido ya está hecho */ });
      setExito({ ids: hechos, codigos });
      // Los tokens de pago son de UN SOLO USO: si se quedaran, el siguiente pedido fallaría.
      setTokensPago({});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar el pago');
    } finally {
      setEnviando(false);
    }
  }, [enviando, bloques, entrega, pago, nota, ciudad, zona, referencia, claves, cuponPorTienda, tokensPago, totalDeTienda]);

  /** El PIN del monedero: se obtiene el token de ESA tienda y se sigue con el pedido. */
  const confirmarPin = useCallback(async (pin: string) => {
    if (!pinTienda) return;
    try {
      const token = await walletApi.paymentToken(pin, 'ESCROW_LOCK', pinTienda.total);
      const siguiente = { ...tokensPago, [pinTienda.clave]: token };
      setTokensPago(siguiente);
      setPinTienda(null);
      // Se sigue con el mapa ya completo: si queda otra tienda con monedero, se pedirá el suyo.
      void pagar(siguiente);
    } catch (e) {
      setPinErr(e instanceof Error ? e.message : 'No se pudo confirmar el PIN');
    }
  }, [pinTienda, tokensPago, pagar]);

  const input = [styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }];

  if (cargando) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.text.primary} />
      </View>
    );
  }

  /* ── Pago exitoso ──────────────────────────────────────────────────────────── */
  if (exito) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: espaciado.e24, gap: espaciado.e10 }]}>
        <View style={[styles.okIcono, { backgroundColor: alpha(colors.success, 0.15) }]}>
          <Check size={30} color={colors.text.success} />
        </View>
        <Text style={{ color: colors.textPrimary, fontSize: tipografia.cabecera, fontWeight: peso.titulo }}>Pago exitoso</Text>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, textAlign: 'center', lineHeight: 18 }}>
          {exito.codigos.length === 1
            ? `Tu pedido ${exito.codigos[0]} ya está con la tienda.`
            : `${exito.codigos.length} pedidos creados (uno por tienda): ${exito.codigos.join(', ')}.`}
          {'\n'}La tienda te contesta por el chat del pedido.
        </Text>
        <Pressable
          onPress={() => irSeguro.libre('/lifebook-orders', undefined, true)}
          accessibilityLabel="Ver pedido"
          style={[styles.cta, { backgroundColor: colors.primary, marginTop: espaciado.e10, paddingHorizontal: espaciado.e26 }]}
        >
          <Text style={{ color: brand.white, fontSize: tipografia.fino, fontWeight: peso.titulo }}>Ver pedido</Text>
        </Pressable>
        <Pressable onPress={() => irSeguro.libre('/lifebook-catalog')} accessibilityLabel="Seguir comprando">
          <Text style={{ color: colors.text.primary, fontSize: tipografia.body, fontWeight: peso.maximo, marginTop: espaciado.e6 }}>Seguir comprando</Text>
        </Pressable>
      </View>
    );
  }

  const totalUnidades = bloques.reduce((n, g) => n + g.count, 0);
  void totalUnidades;

  return (
    /*
      El envoltorio es un `View`, no un `KeyboardAvoidingView`: en Android, con `behavior` indefinido,
      ese componente no hacía nada... salvo romper el `ScrollView` de dentro, que salía **VACÍO** (el
      cuerpo no se pintaba: comprobado en el móvil y midiendo los píxeles de la pantalla). Mismo
      arreglo que en `lifebook-checkout.tsx`.
    */
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: alpha(colors.border, 0.5) }]}>
        <Pressable onPress={() => irSeguro.atras()} hitSlop={10} accessibilityLabel="Volver">
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.subtitle, marginLeft: espaciado.e10 }}>
          Confirmar pedido
        </Text>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: espaciado.e14, paddingBottom: espaciado.e30 }} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={[styles.aviso, { backgroundColor: alpha(colors.danger, 0.1), borderColor: alpha(colors.danger, 0.4) }]}>
            <Text style={{ color: colors.text.danger, fontSize: tipografia.body, fontWeight: peso.fuerte }}>{error}</Text>
          </View>
        ) : null}

        {bloques.length === 0 ? (
          <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 40 }}>
            No hay nada que pagar: vuelve al carrito y marca algún producto.
          </Text>
        ) : null}

        {/* ── Un bloque por tienda: es un PEDIDO por tienda ───────────────────── */}
        {bloques.map((g) => {
          const clave = g.shop?.id ?? 'sin-tienda';
          const modo = entrega[clave] ?? 'pickup';
          const envio = envioDe(g, modo);
          const metodos = (g.paymentMethods ?? []);
          return (
            <View
              key={clave}
              style={[styles.bloque, { backgroundColor: colors.card, borderColor: alpha(colors.border, 0.6) }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e7 }}>
                <Store size={14} color={colors.text.primary} />
                <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.titulo, flex: 1 }} numberOfLines={1}>
                  {g.shop?.name ?? 'Tienda'}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.body }}>
                  {g.count} ud · {lbXaf(g.subtotalXaf)}
                </Text>
              </View>

              {g.items.map((i) => (
                <View key={i.id} style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, marginTop: espaciado.e8 }}>
                  <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: tipografia.body, flex: 1 }}>
                    {i.quantity} × {i.title}{i.variantName ? ` · ${i.variantName}` : ''}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.body }}>
                    {i.lineTotalXaf === null ? 'A consultar' : lbXaf(i.lineTotalXaf)}
                  </Text>
                </View>
              ))}

              <Text style={[styles.etiqueta, { color: colors.textSecondary }]}>CÓMO LO RECIBES</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e7 }}>
                {(g.deliveryModes?.length ? g.deliveryModes : ['pickup']).map((m) => {
                  const on = modo === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setEntrega((prev) => ({ ...prev, [clave]: m }))}
                      accessibilityLabel={m === 'pickup' ? 'Recoger en tienda' : lbTransportLabel(m)}
                      style={[styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? alpha(colors.primary, 0.12) : colors.surface }]}
                    >
                      <Text style={{ color: on ? colors.text.primary : colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>
                        {m === 'pickup' ? 'Recoger en tienda' : lbTransportLabel(m)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={[styles.etiqueta, { color: colors.textSecondary }]}>CÓMO PAGAS</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e7 }}>
                {metodos.length === 0 ? (
                  <Text style={{ color: colors.text.danger, fontSize: tipografia.body, fontWeight: peso.fuerte }}>
                    Esta tienda no tiene formas de pago configuradas.
                  </Text>
                ) : null}
                {metodos.map((pm) => {
                  const activo = pm.status === 'active';
                  const on = pago[clave] === pm.method && activo;
                  return (
                    <Pressable
                      key={pm.method}
                      onPress={() => activo && setPago((prev) => ({ ...prev, [clave]: pm.method }))}
                      disabled={!activo}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on, disabled: !activo }}
                      accessibilityLabel={lbPayLabel(pm.method)}
                      style={[styles.chip, {
                        borderColor: on ? colors.primary : colors.border,
                        backgroundColor: on ? alpha(colors.primary, 0.12) : colors.surface,
                        opacity: activo ? 1 : 0.45,
                      }]}
                    >
                      <Text style={{ color: on ? colors.text.primary : colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>
                        {lbPayLabel(pm.method)}{activo ? '' : ' · no disponible'}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/*
                Plegado (Fase 2 · punto 25). Es una nota POR TIENDA: cada tienda recibe su pedido.
                El CUPÓN de abajo NO se pliega: cambia el total y el descuento tiene que verse
                antes de confirmar (decisión documentada en la tanda Q).
              */}
              <MasOpciones
                abrir="Añadir un mensaje para esta tienda"
                cerrar="Ocultar el mensaje"
                abiertoInicial={(nota[clave] ?? '').trim() !== ''}
              >
                <TextInput
                  value={nota[clave] ?? ''}
                  onChangeText={(t) => setNota((prev) => ({ ...prev, [clave]: t }))}
                  placeholder="Ej.: llamar al llegar, entregar por la tarde…"
                  placeholderTextColor={colors.textSecondary}
                  maxLength={300}
                  style={input}
                />
              </MasOpciones>

              {/* Cupón (tanda Q): cada tienda lleva SU cupón, porque cada una recibe SU pedido. */}
              <Text style={[styles.etiqueta, { color: colors.textSecondary }]}>CUPÓN</Text>
              <SelectorDeCupon
                cupones={cuponesDeTienda(clave)}
                subtotalXaf={g.subtotalXaf}
                elegido={cuponPorTienda[clave] ?? null}
                onElegir={(code) => setCuponPorTienda((prev) => {
                  const copia = { ...prev };
                  if (code) copia[clave] = code; else delete copia[clave];
                  return copia;
                })}
                onRecoger={(code) => recogerCupon(clave, code)}
              />

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: espaciado.e10 }}>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.body }}>Envío</Text>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.body }}>
                  {modo === 'pickup' ? 'Recoges en la tienda' : envio === null ? 'a acordar con la tienda' : lbXaf(envio)}
                </Text>
              </View>
              {descuentoDeCupon(cuponDe(g), g.subtotalXaf) > 0 ? (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: espaciado.e4 }}>
                  <Text style={{ color: colors.text.success, fontSize: tipografia.body, fontWeight: peso.maximo }}>
                    Cupón {cuponPorTienda[clave]}
                  </Text>
                  <Text style={{ color: colors.text.success, fontSize: tipografia.body, fontWeight: peso.maximo }}>
                    −{lbXaf(descuentoDeCupon(cuponDe(g), g.subtotalXaf))}
                  </Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: espaciado.e4 }}>
                <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.titulo }}>Total de este pedido</Text>
                <Precio valor={Math.max(0, g.subtotalXaf + (envio ?? 0) - descuentoDeCupon(cuponDe(g), g.subtotalXaf))} tamano="md" color={colors.text.primary} />
              </View>
            </View>
          );
        })}

        {/* ── Dirección (una vez; la usan los pedidos que no son «recoger» ) ──── */}
        {bloques.some((g) => (entrega[g.shop?.id ?? 'sin-tienda'] ?? 'pickup') !== 'pickup') ? (
          <View style={[styles.bloque, { backgroundColor: colors.card, borderColor: alpha(colors.border, 0.6) }]}>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.titulo }}>Dirección de entrega</Text>
            <Text style={[styles.etiqueta, { color: colors.textSecondary }]}>CIUDAD</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e7 }}>
              {LB_CITIES.map((c) => {
                const on = ciudad === c;
                return (
                  <Pressable
                    key={c}
                    onPress={() => setCiudad(c)}
                    accessibilityLabel={c}
                    style={[styles.chip, { borderColor: on ? colors.primary : colors.border, backgroundColor: on ? alpha(colors.primary, 0.12) : colors.surface }]}
                  >
                    <Text style={{ color: on ? colors.text.primary : colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>{c}</Text>
                  </Pressable>
                );
              })}
            </View>
            <TextInput
              value={zona}
              onChangeText={setZona}
              placeholder="Barrio o zona (Ej: Ela Nguema)"
              placeholderTextColor={colors.textSecondary}
              maxLength={60}
              style={[input, { marginTop: espaciado.e8 }]}
            />
            <TextInput
              value={referencia}
              onChangeText={setReferencia}
              placeholder="Punto de referencia (Ej: portón azul, junto al mercado)"
              placeholderTextColor={colors.textSecondary}
              maxLength={200}
              style={[input, { marginTop: espaciado.e8 }]}
            />
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, marginTop: espaciado.e6 }}>
              El teléfono y el punto exacto se comparten con la tienda por el chat del pedido.
            </Text>
          </View>
        ) : null}

        <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, lineHeight: 17, marginTop: espaciado.e2 }}>
          {bloques.length > 1
            ? `Se crearán ${bloques.length} pedidos (uno por tienda): cada tienda prepara y entrega lo suyo.`
            : 'La tienda confirma el pedido y te escribe por el chat.'}
        </Text>
      </ScrollView>

      {/* ── Desglose y pagar ───────────────────────────────────────────────────── */}
      <View style={{
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: alpha(colors.border, 0.6),
        backgroundColor: colors.background,
        paddingBottom: insets.bottom + 10,
      }}>
        {/* EL MOTIVO, EN EL PIE: arriba se queda fuera de la pantalla y el botón parece muerto. */}
        {error ? (
          <Text style={{ color: colors.text.danger, fontSize: tipografia.body, fontWeight: peso.fuerte, paddingHorizontal: espaciado.e14, paddingTop: espaciado.e9 }}>
            {error}
          </Text>
        ) : null}
        <View style={[styles.pie, { borderTopWidth: 0, paddingBottom: 0 }]}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.body }}>
              Subtotal {lbXaf(resumen.subtotal)} · Envío {resumen.aConsultar ? 'a acordar' : lbXaf(resumen.envio)}
            </Text>
            {resumen.descuento > 0 ? (
              <Text style={{ color: colors.text.success, fontSize: tipografia.body, fontWeight: peso.maximo }}>
                Cupón: −{lbXaf(resumen.descuento)}
              </Text>
            ) : null}
            {/*
              Con qué se paga, ANTES de pagar. Si falta elegirlo en alguna tienda se dice cuál: era el
              fallo que reportó el dueño (el pedido salía con un método que nadie eligió).
            */}
            {sinPago.length ? (
              <Text style={{ color: colors.text.danger, fontSize: tipografia.body, fontWeight: peso.maximo }} numberOfLines={1}>
                Elige cómo pagas en {sinPago.map((g) => g.shop?.name ?? 'la tienda').join(', ')}
              </Text>
            ) : (
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.body }} numberOfLines={1}>
                Pagas: {bloques.map((g) => lbPayLabel(pago[g.shop?.id ?? 'sin-tienda'] ?? '')).join(' · ')}
              </Text>
            )}
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.cifra, fontWeight: peso.titulo }}>Total: {lbXaf(resumen.total)}</Text>
          </View>
          {/*
            El botón NUNCA está muerto. Sin nada marcado en el carrito, en vez de quedarse apagado dice
            qué pasa y al pulsarlo se vuelve al carrito.
          */}
          <Pressable
            onPress={() => {
              if (!bloques.length) { irSeguro.libre('/lifebook-carrito'); return; }
              void pagar();
            }}
            accessibilityLabel={!bloques.length ? 'Elige productos en el carrito'
              : sinPago.length ? 'Elige cómo pagas' : `Pagar ${lbXaf(resumen.total)}`}
            style={[styles.cta, { backgroundColor: bloques.length ? colors.primary : alpha(colors.textSecondary, 0.3) }]}
          >
            {enviando ? (
              <ActivityIndicator size="small" color={brand.white} />
            ) : (
              <Text style={{ color: bloques.length ? brand.white : colors.textPrimary, fontSize: tipografia.cuerpo, fontWeight: peso.titulo }}>
                {!bloques.length ? 'Elige productos' : sinPago.length ? 'Elige cómo pagas' : `Pagar ${lbXaf(resumen.total)}`}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
      <PinSheet
        visible={!!pinTienda}
        title={pinTienda ? `Pagar ${lbXaf(pinTienda.total)} en ${pinTienda.nombre}` : 'Confirmar el pago'}
        subtitle="El importe queda en garantía hasta que recibas el pedido."
        busy={false}
        error={pinErr}
        confirmLabel="Confirmar pago"
        onClose={() => { setPinTienda(null); setPinErr(null); }}
        onConfirm={(pin) => void confirmarPin(pin)}
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
  bloque: { borderRadius: radios.campo, borderWidth: trazo.fino, padding: espaciado.e12, marginBottom: espaciado.e12 },
  etiqueta: { fontSize: tipografia.micro, fontWeight: peso.titulo, letterSpacing: 0.7, marginTop: espaciado.e12, marginBottom: espaciado.e6 },
  chip: { borderWidth: trazo.fino, borderRadius: radios.full, paddingHorizontal: espaciado.e11, paddingVertical: espaciado.e7 },
  input: { borderWidth: trazo.fino, borderRadius: radios.chip, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e9, fontSize: tipografia.body },
  pie: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, paddingHorizontal: espaciado.e14, paddingTop: espaciado.e10, borderTopWidth: StyleSheet.hairlineWidth },
  cta: { borderRadius: radios.full, paddingHorizontal: espaciado.e18, paddingVertical: espaciado.e12, alignItems: 'center', justifyContent: 'center' },
  okIcono: { width: 62, height: 62, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center' },
  aviso: { borderRadius: radios.md, borderWidth: trazo.fino, padding: espaciado.e10, marginBottom: espaciado.e12 },
});
