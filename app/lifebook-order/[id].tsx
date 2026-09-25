/**
 * app/lifebook-order/[id].tsx — DETALLE DEL PEDIDO (Parte 36).
 *
 * Construido sobre la pantalla del dueño, con los arreglos:
 *   · la cabecera depende del ESTADO (antes decía «Pedido realizado» con visto
 *     bueno verde incluso en un pedido cancelado);
 *   · barra de progreso con los estados reales;
 *   · el código de entrega solo lo ve el comprador (el servidor no se lo manda
 *     al vendedor) y se explica para qué sirve;
 *   · acciones por rol (vendedor: aceptar → preparar → enviar → entregar con
 *     código; comprador: cancelar o reclamar);
 *   · `lbXaf()`, `absUrl()`, `<AuthGate>`, área segura y refresco al enfocar.
 */
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, GhostButton, peso, Precio, PrimaryButton, radios, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import { AlertCircle, ArrowLeft, Camera, CheckCircle2, MessageCircle, Package, Truck } from 'lucide-react-native';
import { AuthGate } from '../../core/AuthGate';
import { absUrl } from '../../api/config';
import { lifebookMediaApi } from '../../api/lifebook';
import { messagesApi } from '../../api/messages';
import { commerceOrdersApi, type LbOrder } from '../../api/commerce';
import {
  LB_COMMERCE_BUYER_ACTIONS, LB_ORDER_ACTION_LABEL, LB_ORDER_ACTION_LABEL_EXTRA, LB_ORDER_FLOW,
  LB_ORDER_META, LB_SELLER_ORDER_ACTIONS, lbXaf,
} from '../../constants/lifebook';
import { lbPayLabel, lbTransportLabel } from '../../constants/commerce';
import { Chip, ChipRow } from '../../components/lifebook/Chip';
import { Notice, SummaryRow } from '../../components/lifebook/publish/PublishParts';

export default function LifeBookOrderScreen() {
  return (
    <AuthGate>
      <OrderContent />
    </AuthGate>
  );
}

function OrderContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [order, setOrder] = useState<LbOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [notaCobro, setNotaCobro] = useState('');
  const [justificante, setJustificante] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  /**
   * El justificante se mira DENTRO de la app, no en el navegador.
   *
   * Lo reportó el dueño: al pulsar «Ver el justificante» se abría una página de fuera que solo enseñaba
   * el XML del almacenamiento (porque el enlace que usé en la prueba apuntaba a un fichero que no
   * existía). Dos arreglos: (1) se enseña aquí dentro, con la foto; y (2) si el enlace no carga, se dice
   * con palabras en vez de dejar al usuario en una página de error.
   */
  const [verJustificante, setVerJustificante] = useState(false);
  const [justificanteFalla, setJustificanteFalla] = useState(false);
  /** TANDA T (T.7): la valoración del pedido, que escribe el comprador una sola vez. */
  const [estrellas, setEstrellas] = useState(0);
  const [comentario, setComentario] = useState('');
  /** TANDA T (T.7b): el motivo de la reclamación (obligatorio, mínimo 10 letras). */
  const [motivoReclamo, setMotivoReclamo] = useState('');
  /** El coste del reparto que la tienda escribe para cerrarlo (llega como texto del campo). */
  const [costeReparto, setCosteReparto] = useState('');
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const { order: o } = await commerceOrdersApi.detail(String(id));
      if (mounted.current) { setOrder(o); setError(null); }
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'No se pudo cargar el pedido');
    }
  }, [id]);

  // Se recarga al volver a la pantalla: el estado cambia en el servidor.
  useFocusEffect(useCallback(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; };
  }, [load]));

  const accion = async (action: string) => {
    if (!order || busy) return;
    setBusy(action);
    try {
      const { order: o } = await commerceOrdersApi.action(order.id, action as never);
      setOrder(o);
    } catch (e) {
      Alert.alert('Pedido', e instanceof Error ? e.message : 'No se pudo hacer la acción');
    } finally {
      setBusy(null);
    }
  };

  const confirmarCodigo = async () => {
    if (!order || busy) return;
    setBusy('code');
    try {
      const { order: o } = await commerceOrdersApi.confirmCode(order.id, code.trim());
      setOrder(o);
      setCode('');
      Alert.alert('Entregado', 'Pedido entregado y cobrado.');
    } catch (e) {
      Alert.alert('Código de entrega', e instanceof Error ? e.message : 'El código no coincide');
    } finally {
      setBusy(null);
    }
  };

  /**
   * EL JUSTIFICANTE DEL COBRO (TANDA R, R.5b).
   *
   * Se elige la foto y se sube YA, para no meter la imagen dentro de la petición del cobro. Si falla,
   * se dice y no se pierde nada: el cobro se puede marcar sin justificante (puede no haber recibo).
   */
  const adjuntarJustificante = async () => {
    try {
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync().catch(() => null);
      if (perm && perm.granted === false) await ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => null);
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, selectionLimit: 1 });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setSubiendo(true);
      const up = await lifebookMediaApi.uploadFile('image', {
        uri: asset.uri,
        name: asset.fileName ?? `justificante-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      setJustificante(up.url);
    } catch (e) {
      Alert.alert('Justificante', e instanceof Error ? e.message : 'No se pudo subir la foto');
    } finally {
      setSubiendo(false);
    }
  };

  /**
   * MARCAR COBRADO: para lo que se paga POR FUERA de la app (transferencia, facturación, depósito).
   *
   * Contra entrega y pago en tienda se cierran solos al entregar. Lo demás se quedaba «pendiente» para
   * siempre: el vendedor no veía esa caja. El servidor guarda quién lo marca y cuándo, y avisa al
   * comprador en el chat.
   */
  /**
   * CERRAR EL COSTE DEL REPARTO (decisión del dueño: el envío tiene que entrar en el total).
   *
   * Cuando el envío está «a acordar» o «según la distancia», el pedido nace con reparto 0: ese dinero se
   * movía por fuera y sin rastro. La tienda lo cierra ANTES de entregar, entra en el total y, al
   * entregar, el libro de cuentas lo anota como `a_pagar_reparto`. El importe lo pone la tienda: el
   * servidor no inventa tarifas.
   */
  const cerrarReparto = async () => {
    if (!order || busy) return;
    const valor = Number(String(costeReparto).replace(/[^0-9]/g, ''));
    if (!Number.isFinite(valor) || valor <= 0) return;
    setBusy('reparto');
    try {
      const { order: o } = await commerceOrdersApi.cerrarReparto(order.id, valor);
      setOrder(o);
      setCosteReparto('');
      Alert.alert('Reparto cerrado', `El total del pedido queda en ${lbXaf(o.totalXaf)}.`);
    } catch (e) {
      Alert.alert('Reparto', e instanceof Error ? e.message : 'No se pudo cerrar el coste del reparto');
    } finally {
      setBusy(null);
    }
  };

  const marcarCobrado = async () => {
    if (!order || busy) return;
    setBusy('cobro');
    try {
      const { order: o } = await commerceOrdersApi.marcarCobrado(order.id, {
        proofUrl: justificante,
        note: notaCobro.trim() || null,
      });
      setOrder(o);
      setNotaCobro('');
      setJustificante(null);
      Alert.alert('Cobrado', 'El pedido queda marcado como cobrado y el comprador recibe el aviso.');
    } catch (e) {
      Alert.alert('Cobro', e instanceof Error ? e.message : 'No se pudo marcar el cobro');
    } finally {
      setBusy(null);
    }
  };

  /**
   * VALORAR EL PEDIDO (TANDA T, T.7).
   *
   * Una sola vez: lo impone el servidor con un índice único (`REVIEW_ALREADY_DONE` si se repite). La
   * nota mueve la de la tienda y la de los productos del pedido, como media ponderada con los votos que
   * ya había — por eso no se puede «cambiar de opinión» reenviando: sería falsear la media.
   */
  const enviarValoracion = async () => {
    if (!order || busy || estrellas === 0) return;
    setBusy('valorar');
    try {
      const { order: o } = await commerceOrdersApi.valorar(order.id, {
        rating: estrellas,
        comment: comentario.trim() || null,
      });
      setOrder(o);
      setComentario('');
      Alert.alert('Gracias', 'Tu valoración ya cuenta para la tienda y para el producto.');
    } catch (e) {
      Alert.alert('Valoración', e instanceof Error ? e.message : 'No se pudo enviar la valoración');
    } finally {
      setBusy(null);
    }
  };

  /**
   * RECLAMAR EL PEDIDO (TANDA T, T.7b).
   *
   * El motivo es obligatorio en el servidor (mínimo 10 letras): una reclamación sin motivo no se puede
   * atender, y el motivo es lo único que la tienda va a leer. Viaja en el aviso del chat.
   */
  const reclamar = async () => {
    if (!order || busy || motivoReclamo.trim().length < 10) return;
    setBusy('reclamar');
    try {
      const { order: o } = await commerceOrdersApi.action(order.id, 'dispute', motivoReclamo.trim());
      setOrder(o);
      setMotivoReclamo('');
      Alert.alert('Reclamación abierta', 'La tienda recibe tu motivo en el chat del pedido.');
    } catch (e) {
      Alert.alert('Reclamación', e instanceof Error ? e.message : 'No se pudo abrir la reclamación');
    } finally {
      setBusy(null);
    }
  };

  const hablar = async () => {
    if (!order) return;
    const otro = order.role === 'seller' ? order.buyer?.id : order.shop?.ownerId;
    if (!otro) return;
    /**
     * ANTES DE ABRIR EL CHAT se deja ahí la TARJETA de ESTE pedido.
     *
     * Lo reportó el dueño: al pulsar «escribir a la tienda» no salía la tarjeta de la compra, así que
     * el comerciante no sabía de qué pedido le hablaban (en una conversación con varias compras, o en
     * un pedido anterior a la tarjeta). Si esto falla, se abre el chat igual: escribir importa más que
     * la tarjeta.
     */
    const convId = await commerceOrdersApi.publicarTarjeta(order.id)
      .then((r) => r?.conversationId ?? null)
      .catch(() => null);
    try {
      const conv = convId ? { id: convId } : await messagesApi.open(otro);
      router.push({
        pathname: '/lifebook-chat/[id]',
        params: {
          id: conv.id,
          name: order?.role === 'seller' ? (order?.buyer?.name ?? 'Comprador') : (order?.shop?.name ?? 'Tienda'),
          peerId: otro,
          draft: `Hola, sobre el pedido ${order?.code}…`,
        },
      } as never);
    } catch { /* silencioso */ }
  };

  if (error && !order) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: espaciado.e24, gap: espaciado.e12 }]}>
        <AlertCircle size={34} color={colors.danger} />
        <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, textAlign: 'center' }}>{error}</Text>
        <GhostButton title="Volver" onPress={() => router.back()} />
      </View>
    );
  }
  if (!order) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const meta = LB_ORDER_META[order.status] ?? { label: order.status, color: colors.textSecondary };
  const esComprador = order.role === 'buyer';
  const acciones = esComprador
    ? (LB_COMMERCE_BUYER_ACTIONS[order.status] ?? [])
    : (LB_SELLER_ORDER_ACTIONS[order.status] ?? []);
  /**
   * TANDA T (T.7b): la reclamación SALE de los chips y tiene su propia caja, porque necesita el motivo.
   * Un chip que abre una reclamación sin explicar nada es lo que había antes.
   */
  const puedeReclamar = esComprador && acciones.includes('dispute');
  const accionesSueltas = acciones.filter((a) => a !== 'dispute');
  /**
   * DECISIÓN DEL DUEÑO (18/09/2026): para **transferencia y facturación** el justificante es
   * OBLIGATORIO. El servidor ya rechaza el cobro sin comprobante (`PAYMENT_PROOF_REQUIRED`); aquí el
   * botón no deja ni intentarlo y dice qué falta, en vez de dejar pulsar y contestar con un aviso.
   * Contra entrega y pago en tienda no se pide: el dinero se ve en mano.
   */
  const necesitaComprobante = order.paymentMethod === 'transfer' || order.paymentMethod === 'billing';
  const pasoActual = LB_ORDER_FLOW.findIndex((f) => f.status === order.status);
  const cancelado = order.status === 'cancelled' || order.status === 'declined';
  const enDisputa = order.status === 'disputed';

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: alpha(colors.border, 0.5) }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Volver">
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.subtitle, marginLeft: espaciado.e10, flex: 1 }} numberOfLines={1}>
          Pedido {order.code}
        </Text>
        <Text style={{ color: meta.color, fontWeight: peso.titulo, fontSize: tipografia.caption }}>{meta.label}</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: espaciado.e16, paddingBottom: espaciado.e24 }}>
        {/* Cabecera según el ESTADO (no siempre «éxito») */}
        <View style={{ alignItems: 'center', paddingVertical: espaciado.e6, gap: espaciado.e6 }}>
          {cancelado ? <AlertCircle size={40} color={colors.danger} />
            : enDisputa ? <AlertCircle size={40} color={colors.secondary} />
              : order.status === 'delivered' ? <CheckCircle2 size={40} color={colors.success} />
                : <Truck size={40} color={colors.primary} />}
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.cabecera, fontWeight: peso.titulo }}>
            {cancelado ? 'Pedido cancelado' : enDisputa ? 'Pedido en reclamación'
              : order.status === 'delivered' ? 'Pedido entregado' : 'Tu pedido está en marcha'}
          </Text>
          {esComprador ? (
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>Compra en {order.shop?.name ?? 'la tienda'}</Text>
          ) : (
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>Compra de {order.buyer?.name ?? 'un cliente'}</Text>
          )}
        </View>

        {/* Barra de progreso */}
        {!cancelado && !enDisputa ? (
          <View style={styles.flow}>
            {LB_ORDER_FLOW.map((f, i) => {
              const activo = pasoActual >= i;
              return (
                <View key={f.status} style={{ flex: 1, alignItems: 'center', gap: espaciado.e5 }}>
                  <View style={[styles.dot, { backgroundColor: activo ? colors.primary : alpha(colors.border, 0.8) }]} />
                  <Text numberOfLines={2} style={{ color: activo ? colors.textPrimary : colors.textSecondary, fontSize: tipografia.minimo, fontWeight: peso.fuerte, textAlign: 'center' }}>
                    {f.label}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Código de entrega: SOLO el comprador lo recibe */}
        {esComprador && order.deliveryCode ? (
          <View style={[styles.codeBox, { borderColor: colors.primary, backgroundColor: alpha(colors.primary, 0.06) }]}>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, textAlign: 'center' }}>
              Lee este código a quien te entregue y paga en efectivo:
            </Text>
            <Text style={{ color: colors.primary, fontSize: tipografia.heroGrande, fontWeight: peso.titulo, letterSpacing: 8 }}>{order.deliveryCode}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, textAlign: 'center' }}>
              La tienda lo confirma y el pedido queda entregado y cobrado.
            </Text>
          </View>
        ) : null}

        {/* Vendedor: confirmar el código que le da el comprador */}
        {!esComprador && order.paymentMethod === 'cash_on_delivery' && order.status !== 'delivered' && !cancelado ? (
          <View style={[styles.codeBox, { borderColor: alpha(colors.border, 0.9) }]}>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte, textAlign: 'center' }}>
              Cobro en efectivo: pide al comprador su código de 4 dígitos
            </Text>
            <TextInput
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
              placeholder="0000"
              placeholderTextColor={colors.textSecondary}
              style={[styles.codeInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            <PrimaryButton title="Confirmar entrega y cobro" loading={busy === 'code'} disabled={code.length !== 4} onPress={confirmarCodigo} />
          </View>
        ) : null}

        {order.note ? <Notice>{order.note}</Notice> : null}

        {/* Artículos */}
        <Text style={[styles.section, { color: colors.textPrimary }]}>Artículos</Text>
        <View style={[styles.card, { borderColor: alpha(colors.border, 0.6) }]}>
          {order.items.map((it) => (
            <View key={it.id} style={styles.itemRow}>
              {it.mediaUrl ? (
                <Image source={absUrl(it.mediaUrl)} style={styles.thumb} contentFit="cover" cachePolicy="memory-disk" transition={0} />
              ) : (
                <View style={[styles.thumb, { backgroundColor: alpha(colors.primary, 0.1), alignItems: 'center', justifyContent: 'center' }]}>
                  <Package size={18} color={alpha(colors.primary, 0.6)} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text numberOfLines={2} style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{it.titleSnapshot}</Text>
                {it.variantSnapshot ? <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{it.variantSnapshot}</Text> : null}
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{it.quantity} × {lbXaf(it.unitPriceXaf)}</Text>
              </View>
              <Precio valor={it.lineTotalXaf} tamano="sm" color={colors.textPrimary} />
            </View>
          ))}
          <SummaryRow label="Subtotal" value={lbXaf(order.subtotalXaf)} />
          <SummaryRow label={`Entrega (${lbTransportLabel(order.deliveryMode)})`} value={order.deliveryCostXaf > 0 ? lbXaf(order.deliveryCostXaf) : 'A acordar'} />
          {/* TANDA Q: el cupón, con su código. Se ve de dónde sale el total. */}
          {order.discountXaf > 0 ? (
            <SummaryRow label={`Cupón${order.couponCode ? ` ${order.couponCode}` : ''}`} value={`−${lbXaf(order.discountXaf)}`} />
          ) : null}
          <SummaryRow label="Total" value={lbXaf(order.totalXaf)} />
          <SummaryRow label="Pago" value={lbPayLabel(order.paymentMethod)} />
          {/* TANDA R (R.5b): el cobro, en la misma ficha que el resto del dinero (una línea, no tres). */}
          {order.paymentStatus === 'paid' ? (
            <SummaryRow label="Cobrado" value={order.paidAt ? new Date(order.paidAt).toLocaleDateString() : 'sí'} />
          ) : null}
        </View>

        {/* Con qué se dio por cobrado: la referencia de la tienda y el justificante. Lo ven las dos partes. */}
        {order.paymentStatus === 'paid' && order.paymentNote ? (
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e8 }}>Cobro: {order.paymentNote}</Text>
        ) : null}
        {order.paymentStatus === 'paid' && order.paymentProofUrl ? (
          <Pressable
            onPress={() => { setJustificanteFalla(false); setVerJustificante(true); }}
            accessibilityRole="button"
            accessibilityLabel="Ver el justificante del cobro"
          >
            <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e6 }}>Ver el justificante</Text>
          </Pressable>
        ) : null}

        {/* TANDA T (T.7b): la reclamación y su motivo, para que lo vean los dos. */}
        {order.disputeReason ? (
          <View style={{ marginTop: espaciado.e8 }}>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
              {esComprador ? 'Tu reclamación' : 'Reclamación del comprador'}
            </Text>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption }}>«{order.disputeReason}»</Text>
          </View>
        ) : null}

        {/* TANDA T (T.7): la valoración, si ya está escrita. La ven el comprador y la tienda. */}
        {order.review ? (
          <View style={{ marginTop: espaciado.e8 }}>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
              {esComprador ? 'Tu valoración' : 'Valoración del comprador'}:{' '}
              <Text style={{ color: brand.warning, fontSize: tipografia.body }}>
                {'★'.repeat(order.review.rating)}{'☆'.repeat(5 - order.review.rating)}
              </Text>
            </Text>
            {order.review.comment ? (
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>«{order.review.comment}»</Text>
            ) : null}
          </View>
        ) : null}

        {/* Entrega */}
        {order.deliveryMode !== 'pickup' && (order.deliveryAddress?.zone || order.deliveryAddress?.reference) ? (
          <>
            <Text style={[styles.section, { color: colors.textPrimary }]}>Entrega</Text>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption }}>
              {[order.deliveryAddress?.city, order.deliveryAddress?.zone, order.deliveryAddress?.reference].filter(Boolean).join(' · ')}
            </Text>
          </>
        ) : (
          <>
            <Text style={[styles.section, { color: colors.textPrimary }]}>Recogida</Text>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption }}>
              En la tienda {order.shop?.name ? `«${order.shop.name}»` : ''} · acuerda la hora por el chat
            </Text>
          </>
        )}

        {/* Acciones */}
        {accionesSueltas.length > 0 ? (
          <>
            <Text style={[styles.section, { color: colors.textPrimary }]}>{esComprador ? '¿Qué quieres hacer?' : 'Gestiona el pedido'}</Text>
            <ChipRow>
              {accionesSueltas.map((a) => (
                <Chip
                  key={a}
                  label={LB_ORDER_ACTION_LABEL[a] ?? LB_ORDER_ACTION_LABEL_EXTRA[a] ?? a}
                  onPress={() => accion(a)}
                  disabled={!!busy}
                />
              ))}
            </ChipRow>
          </>
        ) : null}

        {/*
          TANDA T (T.7b) — RECLAMAR, CON MOTIVO.
          Antes era un chip que cambiaba el estado sin guardar por qué: la tienda veía «en reclamación» y
          no sabía qué contestar. El servidor exige ahora al menos 10 letras, así que el botón se apaga
          hasta que se escriban (y dice por qué).
        */}
        {puedeReclamar ? (
          <View style={[styles.codeBox, { borderColor: alpha(colors.border, 0.9), alignItems: 'stretch', marginTop: espaciado.e16 }]}>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo, textAlign: 'center' }}>
              ¿Algo ha ido mal?
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center' }}>
              Cuéntanoslo y la tienda lo recibe en el chat. Una reclamación sin motivo no se puede atender.
            </Text>
            <TextInput
              value={motivoReclamo}
              onChangeText={setMotivoReclamo}
              placeholder="Qué ha pasado (mínimo 10 letras)"
              placeholderTextColor={colors.textSecondary}
              multiline
              style={[styles.notaInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface, minHeight: 58 }]}
            />
            <PrimaryButton
              title={motivoReclamo.trim().length < 10 ? `Escribe el motivo (${motivoReclamo.trim().length}/10)` : 'Reclamar el pedido'}
              loading={busy === 'reclamar'}
              disabled={!!busy || motivoReclamo.trim().length < 10}
              onPress={reclamar}
            />
          </View>
        ) : null}

        {/*
          DECISIÓN DEL DUEÑO — CERRAR EL COSTE DEL REPARTO ANTES DE ENTREGAR.
          Si la tienda tiene el envío «a acordar» o «según la distancia», el pedido nace con reparto 0:
          ese dinero se movía por fuera y sin rastro. Aquí lo cierra, entra en el total y el libro de
          cuentas lo anota como `a_pagar_reparto`. Solo la tienda, y no si el pedido ya está cobrado,
          entregado, cancelado o en reclamación (lo impone el servidor).
        */}
        {!esComprador && !cancelado && !enDisputa && order.status !== 'delivered'
          && order.deliveryMode !== 'pickup' && order.paymentStatus !== 'paid' ? (
          <View style={[styles.codeBox, { borderColor: alpha(colors.border, 0.9), alignItems: 'stretch', marginTop: espaciado.e16 }]}>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo, textAlign: 'center' }}>
              El reparto ({lbTransportLabel(order.deliveryMode)})
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center' }}>
              {order.deliveryCostXaf > 0
                ? `Ahora el comprador paga ${lbXaf(order.deliveryCostXaf)} de reparto. Puedes cambiarlo antes de entregar.`
                : 'Todavía no está cerrado: el comprador paga el pedido sin el reparto. Ciérralo antes de entregar.'}
            </Text>
            <TextInput
              value={costeReparto}
              onChangeText={(v) => setCosteReparto(v.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad"
              placeholder={order.deliveryCostXaf > 0 ? String(order.deliveryCostXaf) : 'Coste del reparto en XAF'}
              placeholderTextColor={colors.textSecondary}
              style={[styles.notaInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            <PrimaryButton
              title={Number(costeReparto) > 0 ? `Cerrar el reparto en ${lbXaf(Number(costeReparto))}` : 'Escribe el coste del reparto'}
              loading={busy === 'reparto'}
              disabled={!!busy || !(Number(costeReparto) > 0)}
              onPress={cerrarReparto}
            />
          </View>
        ) : null}

        {/*
          TANDA R (R.5b) — LA TIENDA MARCA COBRADO LO QUE SE PAGA POR FUERA.
          Una transferencia, una facturación o un depósito no pasan por la app: antes se quedaban
          «pendiente» para siempre y esa caja no se veía en ningún sitio. Aquí se cierra, con el
          justificante y la referencia, y queda con quién lo marcó y cuándo.
          VA DESPUÉS DE LAS ACCIONES a propósito: aceptar/preparar/entregar son lo principal y no se
          pueden quedar debajo del pliegue por una caja secundaria.
        */}
        {!esComprador && !cancelado && !enDisputa && order.paymentStatus !== 'paid' ? (
          <View style={[styles.codeBox, { borderColor: alpha(colors.border, 0.9), alignItems: 'stretch', marginTop: espaciado.e16 }]}>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo, textAlign: 'center' }}>
              ¿Ya te han pagado? ({lbPayLabel(order.paymentMethod)})
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center' }}>
              Si el dinero ha entrado por fuera de la app, márcalo aquí. El comprador recibe el aviso y
              los dos podéis ver con qué se dio por cobrado.
            </Text>
            <TextInput
              value={notaCobro}
              onChangeText={setNotaCobro}
              placeholder="Referencia del cobro (ej.: transferencia BGFI 99123)"
              placeholderTextColor={colors.textSecondary}
              style={[styles.notaInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
            />
            <Pressable
              onPress={adjuntarJustificante}
              disabled={subiendo || !!busy}
              accessibilityRole="button"
              accessibilityLabel="Adjuntar el justificante del cobro"
              style={[styles.adjunto, { borderColor: alpha(colors.border, 0.9) }]}
            >
              <Camera size={16} color={colors.textPrimary} />
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte, flex: 1 }} numberOfLines={1}>
                {subiendo ? 'Subiendo la foto…'
                  : justificante ? 'Comprobante adjunto ✓'
                    : necesitaComprobante ? 'Adjuntar el comprobante (obligatorio)'
                      : 'Adjuntar justificante (opcional)'}
              </Text>
            </Pressable>
            <PrimaryButton
              title={necesitaComprobante && !justificante ? 'Hace falta el comprobante' : 'Marcar cobrado'}
              loading={busy === 'cobro'}
              disabled={!!busy || subiendo || (necesitaComprobante && !justificante)}
              onPress={marcarCobrado}
            />
          </View>
        ) : null}

        {/*
          TANDA T (T.7) — VALORAR EL PEDIDO.
          Solo el comprador, solo si está ENTREGADO y solo una vez (lo impone el servidor). La nota mueve
          la de la tienda y la del producto: `rating` y `rating_count` existían desde siempre y no los
          escribía nadie.
        */}
        {esComprador && order.status === 'delivered' && !order.review ? (
          <View style={[styles.codeBox, { borderColor: alpha(colors.border, 0.9), alignItems: 'stretch', marginTop: espaciado.e16 }]}>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo, textAlign: 'center' }}>
              ¿Cómo fue la compra?
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center' }}>
              Tu nota cuenta para la tienda y para el producto. Solo se puede valorar una vez.
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: espaciado.e4, marginVertical: espaciado.e2 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setEstrellas(n)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Valorar con ${n} de 5`}
                  style={styles.estrella}
                >
                  <Text style={{ fontSize: tipografia.hero, color: n <= estrellas ? brand.warning : colors.textSecondary }}>
                    {n <= estrellas ? '★' : '☆'}
                  </Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={comentario}
              onChangeText={setComentario}
              placeholder="¿Quieres contar algo? (opcional)"
              placeholderTextColor={colors.textSecondary}
              multiline
              style={[styles.notaInput, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface, minHeight: 58 }]}
            />
            <PrimaryButton
              title="Enviar valoración"
              loading={busy === 'valorar'}
              disabled={!!busy || estrellas === 0}
              onPress={enviarValoracion}
            />
          </View>
        ) : null}

        <View style={{ marginTop: espaciado.e18 }}>
          <GhostButton title={esComprador ? 'Escribir a la tienda' : 'Escribir al comprador'} onPress={hablar} />
        </View>
      </ScrollView>

      {/*
        EL JUSTIFICANTE, AQUÍ DENTRO (TANDA S).
        Antes se abría el navegador con el enlace y, si el enlace no existía, el usuario acababa en una
        página que solo enseñaba el XML del almacenamiento. Ahora se ve la foto en la app y, si no carga,
        se dice con palabras.
      */}
      <Modal visible={verJustificante} transparent animationType="fade" onRequestClose={() => setVerJustificante(false)}>
        <View style={styles.modalFondo}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setVerJustificante(false)} accessibilityLabel="Cerrar el justificante" />
          <Text style={{ color: brand.white, fontSize: tipografia.body, fontWeight: peso.maximo }}>Justificante del cobro</Text>
          {order.paymentProofUrl ? (
            justificanteFalla ? (
              <Text style={{ color: brand.white, fontSize: tipografia.body, textAlign: 'center', paddingHorizontal: espaciado.e24 }}>
                No se pudo cargar el justificante.{'\n'}La tienda lo tiene en su teléfono.
              </Text>
            ) : (
              <Image
                source={absUrl(order.paymentProofUrl)}
                style={styles.justificante}
                contentFit="contain"
                transition={120}
                onError={() => setJustificanteFalla(true)}
              />
            )
          ) : null}
          <Pressable onPress={() => setVerJustificante(false)} style={styles.cerrarModal} accessibilityRole="button" accessibilityLabel="Cerrar">
            <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>Cerrar</Text>
          </Pressable>
        </View>
      </Modal>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 10, borderTopColor: alpha(colors.border, 0.5), backgroundColor: colors.background }]}>
        <View style={{ flex: 1 }}>
          <GhostButton title="Mis pedidos" onPress={() => router.replace('/lifebook-orders' as never)} />
        </View>
        <View style={{ flex: 1 }}>
          <PrimaryButton title="Ver la tienda" onPress={() => order.shop && router.push({ pathname: '/lifebook-shop/[id]', params: { id: order.shop.id } } as never)} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  flow: { flexDirection: 'row', marginTop: espaciado.e14, marginBottom: espaciado.e6 },
  dot: { width: 10, height: 10, borderRadius: radios.marca },
  codeBox: { borderWidth: trazo.base, borderRadius: radios.campo, padding: espaciado.e14, marginTop: espaciado.e10, gap: espaciado.e8, alignItems: 'center' },
  codeInput: {
    borderWidth: trazo.fino, borderRadius: radios.chip, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8,
    fontSize: tipografia.subtitulo, fontWeight: peso.titulo, letterSpacing: 8, textAlign: 'center', width: 140,
  },
  /** TANDA R (R.5b): la referencia del cobro y el botón del justificante. */
  notaInput: {
    borderWidth: trazo.fino, borderRadius: radios.chip, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e9, fontSize: tipografia.body,
  },
  adjunto: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, borderWidth: trazo.fino, borderRadius: radios.chip,
    paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10,
  },
  /** TANDA T (T.7): una estrella de la valoración (se toca para puntuar). */
  estrella: { paddingHorizontal: espaciado.e3 },
  /** El visor del justificante (TANDA S): oscuro, la foto entera y un botón para cerrar. */
  modalFondo: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: espaciado.e12, padding: espaciado.e20, backgroundColor: 'rgba(0,0,0,0.92)' },
  justificante: { width: '100%', height: '74%', borderRadius: radios.md },
  cerrarModal: {
    borderWidth: trazo.fino, borderColor: 'rgba(255,255,255,0.45)', borderRadius: radios.chip,
    paddingHorizontal: espaciado.e20, paddingVertical: espaciado.e10,
  },
  section: { fontSize: tipografia.body, fontWeight: peso.maximo, marginTop: espaciado.e20, marginBottom: espaciado.e8 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radios.campo, padding: espaciado.e12 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, marginBottom: espaciado.e10 },
  thumb: { width: 48, height: 48, borderRadius: radios.sm },
  footer: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e10,
    paddingHorizontal: espaciado.e14, paddingTop: espaciado.e10, borderTopWidth: StyleSheet.hairlineWidth,
  },
});
