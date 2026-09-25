/**
 * app/lifebook-product/[id].tsx — FICHA de producto o servicio (Parte 33).
 *
 * Adaptada de la maqueta del dueño a la app real:
 *   · tokens del tema correctos (textPrimary/textSecondary/surface/border…)
 *   · `PrimaryButton/GhostButton` con `title` (no `label`), `Pressable` (no TouchableOpacity)
 *   · `lbXaf()` para el dinero y `absUrl()` para las fotos
 *   · galería con el visor de zoom de la Parte 32 y `expo-image` con caché
 *   · acción principal según el tipo (Comprar · Pedir · Solicitar · Reservar…)
 *
 * La compra real (pedido, entrega y pago) llega en la siguiente parte: hoy el
 * botón abre el CHAT con la tienda y un mensaje ya escrito, que es lo que ya
 * funciona de verdad y no un botón muerto.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, GhostButton, radios, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import {
  Banknote, Building2, CheckCircle2, Clock, Eye, Heart, MapPin, MessageCircle, Package, ShoppingCart,
  Plane, ShieldCheck, Ship, Store, Truck, Wallet, X,
} from 'lucide-react-native';
import { AuthGate } from '../../core/AuthGate';
import { absUrl } from '../../api/config';
import { messagesApi } from '../../api/messages';
import { commerceApi, avisoStockApi, type LbProduct, type LbProductVariant } from '../../api/commerce';
import { carritoApi } from '../../api/lifebookCarrito';
import { lbXaf } from '../../constants/lifebook';
import {
  LB_PAY_STATUS_LABEL, LB_PRODUCT_STATUS, lbCoverageLabel, lbPayLabel,
  lbPriceLabel, lbRegionLabel, lbServiceAction, lbServiceLabel, lbTransportLabel,
} from '../../constants/commerce';
import { ZoomableImage, type ZoomableImageHandle } from '../../components/lifebook/ZoomableImage';
import { ViewerZoomControls } from '../../components/lifebook/ViewerControls';
import SelectorDeVariante, { type Eleccion } from '../../components/lifebook/SelectorDeVariante';
import { ir as irSeguro } from '../../constants/rutas';
import { productosEnNotaApi } from '../../api/lifebookProductos';
import { brand } from '@egrouteplan/ui-kit';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const HERO_H = Math.round(SCREEN_W * 1.1);

export default function LifeBookProductScreen() {
  return (
    <AuthGate>
      <ProductContent />
    </AuthGate>
  );
}

function ProductContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [product, setProduct] = useState<LbProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [variant, setVariant] = useState<LbProductVariant | null>(null);
  /** TANDA K/L: el selector «elegir antes de comprar» (lo abren Comprar y Añadir al carrito).
   *  Se guarda **de qué botón se abrió** para poner esa acción como principal dentro del panel. */
  const [selectorModo, setSelectorModo] = useState<'carrito' | 'comprar' | null>(null);
  const [imgIdx, setImgIdx] = useState(0);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerZoomed, setViewerZoomed] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busySave, setBusySave] = useState(false);
  const [busyChat, setBusyChat] = useState(false);
  const [following, setFollowing] = useState(false);
  const [busyFollow, setBusyFollow] = useState(false);
  /* TANDA D — carrito: cuántas cosas llevo (para el globito) y si estoy añadiendo esta. */
  const [carritoCount, setCarritoCount] = useState(0);
  const [busyCarrito, setBusyCarrito] = useState(false);
  /** Tanda G: pidiendo (o quitando) el aviso de reposición. */
  const [busyAviso, setBusyAviso] = useState(false);

  const viewerListRef = useRef<FlatList<string>>(null);
  const zoomHandles = useRef<Record<number, ZoomableImageHandle | null>>({});
  const mounted = useRef(true);

  /* TANDA D: cuántas cosas llevo en el carrito (para el globito del icono). */
  useEffect(() => {
    let vivo = true;
    carritoApi.ver()
      .then((c) => { if (vivo) setCarritoCount(Number(c?.count ?? 0)); })
      .catch(() => { /* sin carrito, sin globito */ });
    return () => { vivo = false; };
  }, []);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { product: p } = await commerceApi.product(String(id));
      if (!mounted.current) return;
      setProduct(p);
      setSaved(!!p.savedByMe);
      /**
       * TANDA K — NADA DE ELEGIR POR EL COMPRADOR.
       *
       * Antes esto ponía `setVariant(p.variants?.[0])`: la primera opción de la lista quedaba
       * marcada sola y «Comprar» compraba ESA, que es lo que el dueño rechazó («el paso de pulsar
       * comprar ya no será directo: primero se elige la talla, el color…»). Ahora solo se marca
       * cuando no hay nada que elegir: si el producto tiene ejes, el comprador los elige en el
       * selector (y si solo hay una combinación, el selector la marca porque no hay decisión).
       */
      setVariant((p.options ?? []).length ? null : (p.variants?.[0] ?? null));
      setError(null);
      /**
       * MERCADO (tanda F) — EL HISTORIAL DE PRODUCTOS.
       *
       * Abrir la ficha apunta el «visto» con una llamada PROPIA y con sesión. Antes se apuntaba
       * dentro de la lectura de la ficha, que es pública: si el token acababa de caducar, esa
       * petición salía sin identidad (200 anónimo) y la visita se perdía en silencio —medido en el
       * teléfono, con la tabla `product_views` vacía después de abrir el producto—. Así, un 401
       * dispara el refresco y el reintento del cliente. Nunca rompe la pantalla: si falla, se calla.
       */
      void commerceApi.registrarVista(p.id).catch(() => { /* el historial no puede romper la ficha */ });
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : 'No se pudo cargar la publicación');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => { mounted.current = false; };
  }, [load]);

  const photos = useMemo(
    () => (product?.media ?? []).filter((m) => m.type !== 'video').map((m) => absUrl(m.url)),
    [product],
  );

  const openViewer = (url: string) => {
    setImgIdx(Math.max(0, photos.indexOf(url)));
    setViewerOpen(true);
    Image.prefetch(photos, { cachePolicy: 'memory-disk' }).catch(() => {});
  };

  const toggleSave = async () => {
    if (!product || busySave) return;
    setBusySave(true);
    const before = saved;
    setSaved(!before);
    try {
      const res = await commerceApi.toggleSave(product.id);
      setSaved(res.saved);
    } catch {
      setSaved(before);
    } finally {
      setBusySave(false);
    }
  };

  const toggleFollow = async () => {
    if (!product || busyFollow) return;
    setBusyFollow(true);
    const before = following;
    setFollowing(!before);
    try {
      const res = await commerceApi.toggleFollow(product.shop.id);
      setFollowing(res.following);
    } catch {
      setFollowing(before);
    } finally {
      setBusyFollow(false);
    }
  };

  /**
   * «CONVERSAR» — EFECTO EMBEBIDO (guía del dueño, regla 3: «el producto viaja con el usuario»).
   *
   * Antes esto abría el chat con un BORRADOR DE TEXTO («Hola, me interesa «X»… ¿Sigue
   * disponible?»): el cliente tenía que enviarlo y el comerciante adivinaba de qué producto le
   * hablaban. Ahora la conversación se abre con la **TARJETA ESTRUCTURADA** del producto como
   * primer mensaje, con la **variante** ya elegida y marcada como CONSULTA (el chat pinta la
   * línea gris «… está consultando sobre este producto»). Así el producto no se pierde de vista y
   * nadie tiene que describir nada.
   */
  const startChat = async () => {
    if (!product || busyChat) return;
    const ownerId = product.shop.ownerId;
    if (!ownerId) return;
    setBusyChat(true);
    try {
      const conv = await messagesApi.open(ownerId);
      // La tarjeta va PRIMERO (es el motivo del mensaje). Si falla, se entra igual al chat:
      // dejar al cliente sin conversación sería peor que quedarse sin la tarjeta.
      try {
        await productosEnNotaApi.enviarAlChat(conv.id, product.id, {
          variantLabel: variant?.name ?? null,
          asking: true,
        });
      } catch { /* el chat se abre igual */ }
      router.push({
        pathname: '/lifebook-chat/[id]',
        params: { id: conv.id, name: conv.peer.name ?? product.shop.name, peerId: ownerId },
      } as never);
    } catch {
      // Si no se puede abrir la conversación, se DICE (antes se quedaba mudo y parecía roto).
      irSeguro.explicar('No se pudo abrir el chat con la tienda.', `/lifebook-product/${product.id}`);
    } finally {
      setBusyChat(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (error || !product) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: espaciado.e24, gap: espaciado.e12 }]}>
        <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, textAlign: 'center' }}>{error ?? 'Publicación no encontrada'}</Text>
        <GhostButton title="Volver" onPress={() => router.back()} />
      </View>
    );
  }

  const p = product;
  const stockLimit = p.stockMode === 'exact'
    ? (variant ? variant.stockQuantity : p.stockQuantity)
    : null;
  const agotado = p.status === 'sold_out' || (stockLimit !== null && stockLimit <= 0);
  const estado = LB_PRODUCT_STATUS[p.status];
  /**
   * Parte 36: si hay precio y stock, la acción principal es PEDIR (checkout real
   * con pedido, entrega y pago). Si es «a consultar», está agotado o es mío, se
   * mantiene el chat con la tienda.
   */
  const puedeComprar = !p.isMine && !agotado && p.priceMode !== 'on_request' && p.stockMode !== 'on_request';

  /**
   * TANDA K: lo que se ha elegido, en una línea, con la FOTO del color elegido. El servidor copia
   * la foto del color a la combinación (`fotoDeCombinacion`), así que aquí solo hay que enseñarla.
   */
  const resumenEleccion = variant
    ? ((p.options ?? []).length
      ? (p.options ?? [])
        .filter((g) => variant.attributes?.[g.code])
        .map((g) => `${g.label}: ${variant.attributes?.[g.code]}`)
        .join(' · ')
      : variant.name)
    : '';
  const fotoElegida = variant?.imageUrl ? absUrl(variant.imageUrl) : null;

  /**
   * El PRECIO QUE SE ENSEÑA. Medido en el Poco F5 con la «Camiseta de prueba»: al elegir «Azul · M»
   * el selector decía 13.500 XAF pero la ficha seguía poniendo 12.000. Si la combinación elegida
   * tiene su propio precio, el precio de la ficha es ESE (es lo que se va a pagar).
   */
  const precioMostrado = variant?.priceXaf ?? p.priceXaf;

  /**
   * UN SOLO CAMINO PARA HABLAR CON LA TIENDA (petición del dueño), y una salida útil cuando está
   * agotado:
   *
   *   · producto con precio y stock → «Comprar» (caja) + icono de mensaje ✓
   *   · servicio / «a consultar»    → «Solicitar»/«Consultar», que ES el chat → sin icono
   *   · agotado                     → **«Avísame cuando llegue»**: apunta la espera y la tienda
   *     avisa por el chat al reponer (tanda G). Sigue habiendo icono de mensaje para preguntar
   *   · es mi publicación           → «Es tu publicación» y sin icono (no me escribo a mí mismo)
   */
  const ctaEsElChat = !p.isMine && !agotado && !puedeComprar;
  const mostrarIconoChat = !p.isMine && !ctaEsElChat;
  /**
   * Textos del CTA. **Cortos a propósito**: medido en el Poco F5, «Te avisamos cuando llegue» no
   * cabía en la píldora (146 dp de hueco para un texto de ~175 dp) y la letra salía cortada. El
   * botón mide lo que mide (los iconos de la izquierda no se tocan), así que el texto se adapta.
   */
  const etiquetaCta = p.isMine
    ? 'Es tu publicación'
    : agotado
      ? (p.watching ? 'Te avisamos ✓' : 'Avísame si llega')
      : lbServiceAction(p.serviceType);
  /** Agotado SÍ se puede pulsar: es pedir el aviso (o quitarlo). */
  const ctaActivo = !p.isMine;

  /**
   * MERCADO (tanda G) — «AVÍSAME CUANDO LLEGUE».
   *
   * Pide el aviso (o lo quita, si ya estaba pedido) y lo dice en pantalla con el mensaje del
   * servidor. Se pide **por la variante elegida**: quien espera la «Talla 42» no quiere que le
   * avisen por la «Talla 40». Y si resulta que ya se puede comprar, el servidor lo dice y no apunta
   * nada: no se promete un aviso de algo que ya está.
   */
  const alternarAviso = async () => {
    if (!product || busyAviso) return;
    setBusyAviso(true);
    try {
      if (product.watching) {
        const r = await avisoStockApi.dejarDeVigilar(product.id);
        setProduct((prev) => (prev ? { ...prev, watching: r.watching } : prev));
        Alert.alert('Aviso quitado', 'Ya no te avisamos de este producto.');
      } else {
        const r = await avisoStockApi.vigilar(product.id, variant?.id ?? null);
        setProduct((prev) => (prev ? { ...prev, watching: r.watching } : prev));
        Alert.alert(r.watching ? 'Te avisamos' : 'Ya está disponible', r.mensaje ?? '');
      }
    } catch (e) {
      Alert.alert('Aviso de reposición', e instanceof Error ? e.message : 'No se pudo completar');
    } finally {
      setBusyAviso(false);
    }
  };

  /**
   * TANDA K — AÑADIR AL CARRITO LO ELEGIDO.
   *
   * Antes esta función no recibía nada: añadía `variant` (que era la primera de la lista, puesta
   * sola al cargar) y cantidad 1. Ahora recibe lo que el comprador eligió en el selector —
   * combinación y cantidad—, que es lo que de verdad quería.
   */
  const anadirAlCarrito = async (e: Eleccion) => {
    if (busyCarrito || !product) return;
    setBusyCarrito(true);
    try {
      const c = await carritoApi.anadir(product.id, { variantId: e.variant?.id ?? null, quantity: e.cantidad });
      setCarritoCount(Number(c?.count ?? 0));
      setVariant(e.variant);
      setSelectorModo(null);
      Alert.alert('Añadido al carrito', `«${product.title}»${e.variant ? ` (${e.variant.name})` : ''} ya está en tu carrito.`);
    } catch (err) {
      Alert.alert('Carrito', err instanceof Error ? err.message : 'No se pudo añadir al carrito');
    } finally { setBusyCarrito(false); }
  };

  /** TANDA K: ir a la caja con lo elegido (combinación y cantidad), no con la primera opción. */
  const comprarLoElegido = (e: Eleccion) => {
    if (!product) return;
    setVariant(e.variant);
    setSelectorModo(null);
    router.push({
      pathname: '/lifebook-checkout',
      params: { productId: product.id, ...(e.variant?.id ? { variantId: e.variant.id } : {}), quantity: String(e.cantidad) },
    } as never);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* ── Cabecera ── */}
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: alpha(colors.border, 0.5) }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Volver">
          <X size={20} color={colors.textPrimary} />
        </Pressable>
        <Text numberOfLines={1} style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: 15, flex: 1, marginLeft: espaciado.e10 }}>
          {lbServiceLabel(p.serviceType)}
        </Text>
        <Pressable onPress={toggleSave} hitSlop={10} accessibilityLabel={saved ? 'Quitar de guardados' : 'Guardar'}>
          <Heart size={20} color={saved ? brand.like : colors.textPrimary} fill={saved ? brand.like : 'none'} />
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}>
        {/* ── Galería ── */}
        {photos.length > 0 ? (
          <View>
            <FlatList
              data={photos}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(u) => u}
              onMomentumScrollEnd={(e) => setImgIdx(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))}
              renderItem={({ item }) => (
                <Pressable onPress={() => openViewer(item)} accessibilityLabel="Ver la foto a pantalla completa">
                  <Image
                    source={item}
                    style={{ width: SCREEN_W, height: HERO_H, backgroundColor: colors.surface }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={item}
                    transition={0}
                  />
                </Pressable>
              )}
            />
            {photos.length > 1 ? (
              <View style={[styles.counter, { backgroundColor: alpha('#000000', 0.55) }]}>
                <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: peso.titulo }}>{imgIdx + 1}/{photos.length}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          <View style={[styles.heroEmpty, { backgroundColor: alpha(colors.primary, 0.1) }]}>
            <Text style={{ fontSize: 40 }}>📦</Text>
          </View>
        )}

        <View style={{ padding: espaciado.e16 }}>
          {/* ── Aviso para el dueño (moderación) ── */}
          {p.isMine && estado ? (
            <View style={[styles.notice, { backgroundColor: alpha(estado.tone === 'ok' ? colors.success : colors.primary, 0.1) }]}>
              <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.caption }}>
                {estado.label} · {estado.hint}
              </Text>
              {p.status === 'rejected' && p.rejectionReason ? (
                <Text style={{ color: colors.danger, fontSize: tipografia.caption, marginTop: espaciado.e3 }}>{p.rejectionReason}</Text>
              ) : null}
            </View>
          ) : null}

          {/* TANDA H — «N personas esperan esto»: solo lo ve el DUEÑO, y solo si hay alguien
              esperando. Es el dato que dice si merece la pena reponer existencias (y al reponer se
              les avisa por el chat automáticamente). */}
          {p.isMine && Number(p.waitingCount ?? 0) > 0 ? (
            <View style={[styles.notice, { backgroundColor: alpha(brand.secondary, 0.12) }]}>
              <Text style={{ color: brand.warning, fontWeight: peso.titulo, fontSize: tipografia.caption }}>
                🔔 {p.waitingCount} {p.waitingCount === 1 ? 'persona espera' : 'personas esperan'} este producto
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e3, lineHeight: 16 }}>
                Al reponer existencias se les avisa solos por el chat con la tienda.
              </Text>
            </View>
          ) : null}

          {/* ── Precio y título ── */}
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: agotado ? colors.textSecondary : colors.primary }]}>
              {agotado ? 'Agotado' : lbPriceLabel(precioMostrado, p.priceMode, lbXaf)}
            </Text>
            {p.oldPriceXaf ? (
              <Text style={[styles.oldPrice, { color: colors.textSecondary }]}>{lbXaf(p.oldPriceXaf)}</Text>
            ) : null}
          </View>

          <Text style={[styles.title, { color: colors.textPrimary }]}>{p.title}</Text>
          {p.shortDescription ? (
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, marginTop: espaciado.e4 }}>{p.shortDescription}</Text>
          ) : null}

          {/* ── Insignias de confianza ── */}
          <View style={styles.badges}>
            {p.shop.isVerified ? (
              <Badge colors={colors} icon={<ShieldCheck size={13} color={colors.success} />} text="Tienda verificada" />
            ) : (
              <Badge colors={colors} icon={<Store size={13} color={colors.textSecondary} />} text="Tienda nueva" />
            )}
            {p.shipsInternational ? <Badge colors={colors} icon={<Plane size={13} color={colors.primary} />} text="Envío internacional" /> : null}
            {p.stockMode === 'exact' && p.stockQuantity > 0 && !variant ? (
              <Badge colors={colors} icon={<Package size={13} color={colors.textSecondary} />} text={`Quedan ${p.stockQuantity}`} />
            ) : null}
            {p.stockMode === 'on_request' ? <Badge colors={colors} icon={<Clock size={13} color={colors.textSecondary} />} text="Bajo pedido" /> : null}
            <Badge colors={colors} icon={<Eye size={13} color={colors.textSecondary} />} text={`${p.viewsCount} vistas`} />
          </View>

          {/*
            «AÑADIR AL CARRITO» VIVE AQUÍ, NO EN LA BARRA DE ABAJO.

            Antes estaba en la barra, justo al lado del icono del carrito: dos botones de carrito
            pegados. El dueño lo dijo claro —«esta interfaz ya había un botón de carrito con ícono,
            no es necesario volver a agregar otro»—. La barra se queda con **un solo** control de
            carrito (el icono, que abre el carrito y lleva el globito con cuántas cosas hay) y la
            acción de añadir se pone donde se elige: debajo del precio y las opciones, sin competir
            con el CTA azul.

            TANDA K: este botón **ya no añade directo** (añadía la primera opción de la lista, sin
            preguntar). Abre el selector, que es el mismo que abre «Comprar»: un solo sitio donde se
            decide talla, color y cantidad.
          */}
          {!p.isMine && puedeComprar ? (
            <>
              {p.variants.length > 0 ? (
                <Pressable
                  onPress={() => setSelectorModo('comprar')}
                  accessibilityLabel="Elegir talla, color y cantidad"
                  style={[styles.elegirRow, { borderColor: alpha(colors.border, 0.8), backgroundColor: colors.surface }]}
                >
                  {fotoElegida ? (
                    <Image source={fotoElegida} style={styles.elegirFoto} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                  ) : (
                    <View style={[styles.elegirFoto, { backgroundColor: alpha(colors.primary, 0.12), alignItems: 'center', justifyContent: 'center' }]}>
                      <Package size={16} color={colors.primary} />
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: espaciado.e10 }}>
                    <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>
                      {resumenEleccion || 'Elegir talla y color'}
                    </Text>
                  </View>
                  <Text style={{ color: colors.primary, fontWeight: peso.titulo, fontSize: tipografia.caption }}>
                    {resumenEleccion ? 'Cambiar' : 'Elegir'}
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={() => setSelectorModo('carrito')}
                disabled={busyCarrito}
                accessibilityLabel="Añadir al carrito"
                style={[styles.anadirBtn, { borderColor: colors.primary }]}
              >
                {busyCarrito ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <ShoppingCart size={15} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.titulo }}>Añadir al carrito</Text>
                  </>
                )}
              </Pressable>
            </>
          ) : null}

          {/* ── Descripción ── */}
          {p.longDescription ? (
            <Section colors={colors} title="Descripción">
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, lineHeight: 20 }}>{p.longDescription}</Text>
            </Section>
          ) : null}

          {/* ── Detalles (atributos) ── */}
          {p.attributes.length > 0 ? (
            <Section colors={colors} title="Detalles">
              {p.attributes.map((a) => (
                <View key={a.key} style={[styles.attrRow, { borderBottomColor: alpha(colors.border, 0.6) }]}>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{a.key}</Text>
                  <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.medio }}>{a.value}</Text>
                </View>
              ))}
            </Section>
          ) : null}

          {/* ── Entrega ── */}
          {p.shippingPolicy ? (
            <Section colors={colors} title="Entrega">
              <InfoLine colors={colors} icon={<Truck size={16} color={colors.primary} />}
                text={`Desde ${p.shippingPolicy.originCity ?? p.originCity ?? '—'}${p.shippingPolicy.originBarrio ? ` · ${p.shippingPolicy.originBarrio}` : ''}`} />
              {p.shippingPolicy.coverage.length > 0 ? (
                <InfoLine colors={colors} icon={<MapPin size={16} color={colors.primary} />}
                  text={p.shippingPolicy.coverage.map(lbCoverageLabel).join(' · ')} />
              ) : null}
              {p.shippingPolicy.transportModes.length > 0 ? (
                <InfoLine colors={colors} icon={<Ship size={16} color={colors.primary} />}
                  text={p.shippingPolicy.transportModes.map(lbTransportLabel).join(' · ')} />
              ) : null}
              <View style={styles.chips}>
                {p.shippingPolicy.costMode === 'on_request' ? (
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>Coste de envío a consultar con la tienda</Text>
                ) : (
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
                    Envío desde {lbXaf(p.shippingPolicy.baseCostXaf)}
                    {p.shippingPolicy.perKmXaf ? ` + ${lbXaf(p.shippingPolicy.perKmXaf)}/km` : ''}
                    {p.shippingPolicy.estimatedTime ? ` · ${p.shippingPolicy.estimatedTime}` : ''}
                  </Text>
                )}
              </View>
            </Section>
          ) : null}

          {/* ── Pagos aceptados ── */}
          {p.paymentMethods.length > 0 ? (
            <Section colors={colors} title="Pagos aceptados">
              {p.paymentMethods.map((pm) => (
                <InfoLine
                  key={pm.method}
                  colors={colors}
                  icon={pm.method === 'cash_on_delivery'
                    ? <Banknote size={16} color={colors.success} />
                    : pm.method === 'likebook_wallet'
                      ? <Wallet size={16} color={colors.textSecondary} />
                      : <Building2 size={16} color={colors.primary} />}
                  text={`${lbPayLabel(pm.method)}${pm.status !== 'active' ? ` · ${LB_PAY_STATUS_LABEL[pm.status] ?? ''}` : ''}`}
                />
              ))}
            </Section>
          ) : null}

          {/* ── Tienda ── */}
          <View style={[styles.shopCard, { borderColor: alpha(colors.border, 0.7), backgroundColor: colors.surface }]}>
            {p.shop.logoUrl ? (
              <Image source={absUrl(p.shop.logoUrl)} style={styles.shopLogo} contentFit="cover" cachePolicy="memory-disk" transition={0} />
            ) : (
              <View style={[styles.shopLogo, { backgroundColor: alpha(colors.primary, 0.12), alignItems: 'center', justifyContent: 'center' }]}>
                <Store size={20} color={colors.primary} />
              </View>
            )}
            <View style={{ flex: 1, marginHorizontal: espaciado.e10 }}>
              <Text numberOfLines={1} style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body }}>{p.shop.name}</Text>
              <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>
                {[p.shop.city, lbRegionLabel(p.shop.region), p.shop.ratingCount > 0 ? `★ ${p.shop.rating.toFixed(1)} (${p.shop.ratingCount})` : null]
                  .filter(Boolean).join(' · ')}
              </Text>
            </View>
            <Pressable
              onPress={toggleFollow}
              accessibilityLabel={following ? 'Dejar de seguir la tienda' : 'Seguir la tienda'}
              style={[styles.followBtn, { borderColor: colors.primary, backgroundColor: following ? colors.primary : 'transparent' }]}
            >
              <Text style={{ color: following ? brand.white : colors.primary, fontWeight: peso.maximo, fontSize: tipografia.caption }}>
                {following ? 'Siguiendo' : 'Seguir'}
              </Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => irSeguro.libre('/lifebook-shop/[id]', { id: p.shop.id })}
            accessibilityLabel="Ver la tienda"
            style={{ marginTop: espaciado.e10, alignItems: 'center' }}
          >
            <Text style={{ color: colors.primary, fontWeight: peso.maximo, fontSize: tipografia.caption }}>Ver todos los productos de la tienda →</Text>
          </Pressable>

          {/* ── Mis acciones (dueño) ── */}
          {p.isMine ? (
            <View style={{ marginTop: espaciado.e18, gap: espaciado.e8 }}>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>
                {p.salesCount} ventas · {p.savesCount} guardados · {p.ratingCount} valoraciones
              </Text>
              <View style={{ flexDirection: 'row', gap: espaciado.e8, flexWrap: 'wrap' }}>
                <GhostButton title="Editar" onPress={() => irSeguro.libre('/lifebook-sell', { editId: p.id })} />
                {/* Parte 39: el día a día (precio y existencias) se ajusta en el panel
                    sin devolver la publicación a revisión. */}
                <GhostButton title="Precio y stock" onPress={() => irSeguro.libre('/lifebook-merchant-products')} />
                <GhostButton title={p.status === 'hidden' ? 'Publicar' : 'Ocultar'} onPress={async () => {
                  try {
                    await commerceApi.setProductStatus(p.id, p.status === 'hidden' ? 'activate' : 'hide');
                    await load();
                  } catch { /* silencioso */ }
                }} />
                <GhostButton title="Borrar" onPress={async () => {
                  try {
                    await commerceApi.deleteProduct(p.id);
                    router.back();
                  } catch { /* silencioso */ }
                }} />
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* ── Barra inferior fija ── */}
      <View style={[styles.bottomBar, { backgroundColor: colors.background, borderTopColor: alpha(colors.border, 0.7), paddingBottom: insets.bottom + 10 }]}>
        <Pressable onPress={toggleSave} accessibilityLabel="Guardar" style={[styles.iconBtn, { borderColor: colors.border }]}>
          <Heart size={18} color={saved ? brand.like : colors.textPrimary} fill={saved ? brand.like : 'none'} />
        </Pressable>
        {/* UN SOLO CAMINO PARA HABLAR CON LA TIENDA: el icono solo sale si el botón principal no
            es ya el chat (ver `mostrarIconoChat`). Tener los dos repetía la misma acción. */}
        {mostrarIconoChat ? (
          <Pressable onPress={startChat} accessibilityLabel="Escribir a la tienda" style={[styles.iconBtn, { borderColor: colors.border }]}>
            <MessageCircle size={18} color={colors.textPrimary} />
          </Pressable>
        ) : null}
        {/* TANDA D: el carrito, con el globito de cuántas cosas llevas. */}
        <Pressable
          onPress={() => irSeguro.libre('/lifebook-carrito')}
          accessibilityLabel={`Mi carrito${carritoCount ? `, ${carritoCount} producto${carritoCount === 1 ? '' : 's'}` : ''}`}
          style={[styles.iconBtn, { borderColor: colors.border }]}
        >
          <ShoppingCart size={18} color={colors.textPrimary} />
          {carritoCount > 0 ? (
            <View style={[styles.cartBadge, { backgroundColor: colors.primary }]}>
              <Text style={{ color: brand.white, fontSize: 9.5, fontWeight: peso.titulo }}>{carritoCount > 99 ? '99+' : carritoCount}</Text>
            </View>
          ) : null}
        </Pressable>
        <View style={{ flex: 1 }}>
          {/*
            EL CTA DE LA BARRA, DEL ALTO DE LA BARRA.

            Antes era un `PrimaryButton` (alto FIJO de 52 dp) dentro de una barra de botones de
            44 dp: medido en el Poco F5, salía de 170 × 52 dp al lado de tres círculos de 44 dp
            —el dueño lo vio «mal ajustado y muy grande»—. El botón grande tiene sentido a lo ancho
            de la pantalla (caja, hojas); en una barra de acciones, no.

            Y el texto dice lo que de verdad hace: para un servicio «a consultar» **abre el chat con
            la tienda** (y por eso el icono de mensaje desaparece cuando este botón ya es el chat).
            Antes, cuando el producto estaba agotado, aquí ponía «Avísame cuando llegue» y hacía
            exactamente lo mismo que el icono de al lado: dos botones para lo mismo.
          */}
          <Pressable
            onPress={() => {
              // 🔒 ALOJAMIENTO: no se compra, se RESERVA por noches.
              //
              // El botón ya decía «Reservar», pero llevaba a `/lifebook-checkout` — la caja de
              // un producto: cantidad, entrega, forma de pago. Una habitación entraba por ahí
              // sin fechas, sin noches y sin comprobar disponibilidad, y el pedido se aceptaba
              // de verdad (probado: pedido LB-260911-0001 sobre una habitación). Además el
              // dinero acababa en el flujo de PEDIDOS en vez del de RESERVAS, saltándose
              // `reservation_nights`, que es la única verdad contra la sobreventa.
              //
              // Se entra por la ficha del hotel, que es donde se eligen fechas y huéspedes y
              // donde el servidor comprueba inventario, estancia mínima, capacidad y cierre de
              // fechas. El servidor ya rechaza el atajo (`SERVICE_NOT_ORDERABLE`); esto evita
              // que el usuario llegue hasta ahí.
              if (p.serviceType === 'hotel_room') {
                irSeguro.libre('/lifebook-hotel-detalle', { id: p.shopId });
                return;
              }
              // AGOTADO: el botón pide el aviso de reposición (o lo quita). No lleva a la caja
              // —no hay nada que comprar— y no es un botón muerto.
              if (agotado) { void alternarAviso(); return; }
              if (!puedeComprar) { startChat(); return; }
              /**
               * TANDA K — «COMPRAR» YA NO COMPRA DIRECTO.
               *
               * Antes esto entraba en la caja con `variant`, que era la PRIMERA opción de la lista
               * puesta sola al cargar: se compraba la talla 42 sin que nadie la eligiera. Ahora
               * abre el selector (talla, color, cantidad) y desde ahí se va a la caja con lo
               * elegido.
               */
              setSelectorModo('comprar');
            }}
            disabled={!ctaActivo || busyChat}
            accessibilityLabel={etiquetaCta === 'Avísame si llega' ? 'Avísame cuando llegue' : etiquetaCta}
            accessibilityState={{ disabled: !ctaActivo }}
            style={[
              styles.ctaBtn,
              { backgroundColor: ctaActivo ? colors.primary : alpha(colors.primary, 0.35) },
            ]}
          >
            {busyChat ? (
              <ActivityIndicator size="small" color={brand.white} />
            ) : (
              /* `flexShrink: 1` + `numberOfLines`: si el texto no cupiera, se recorta CON puntos
                 suspensivos en vez de salirse de la píldora y quedar cortado por el borde. */
              <Text numberOfLines={1} style={{ color: brand.white, fontSize: tipografia.body, fontWeight: peso.titulo, flexShrink: 1, textAlign: 'center' }}>
                {etiquetaCta}
              </Text>
            )}
          </Pressable>
        </View>
      </View>

      {/*
        TANDA K — EL SELECTOR, FUERA DEL ALOJAMIENTO.

        Una habitación no se compra: se RESERVA por noches y huéspedes, y eso se elige en la ficha
        del hotel (que es donde el servidor comprueba inventario, estancia mínima y capacidad). Por
        eso el selector no se abre para `hotel_room`: su botón sigue llevando a la ficha del hotel.
      */}
      {!p.isMine && p.serviceType !== 'hotel_room' ? (
        <SelectorDeVariante
          visible={selectorModo !== null}
          product={p}
          modoInicial={selectorModo ?? 'comprar'}
          /** Si ya se había elegido una combinación, al reabrir se mantiene (no vuelve a cero). */
          seleccionInicial={variant}
          busy={busyCarrito ? 'carrito' : null}
          onClose={() => setSelectorModo(null)}
          onCarrito={(e) => { void anadirAlCarrito(e); }}
          onComprar={comprarLoElegido}
        />
      ) : null}

      {/* ── Visor de fotos (zoom de la Parte 32) ── */}
      <Modal visible={viewerOpen} transparent animationType="none" onRequestClose={() => setViewerOpen(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: '#000000' }}>
          <FlatList
            ref={viewerListRef}
            data={photos}
            horizontal
            pagingEnabled
            scrollEnabled={!viewerZoomed}
            initialScrollIndex={Math.max(0, imgIdx)}
            getItemLayout={(_, i) => ({ length: SCREEN_W, offset: SCREEN_W * i, index: i })}
            keyExtractor={(u) => u}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setImgIdx(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))}
            renderItem={({ item, index }) => (
              <ZoomableImage
                ref={(h) => { zoomHandles.current[index] = h; }}
                uri={item}
                width={SCREEN_W}
                height={SCREEN_H}
                resetKey={`${index}-${imgIdx}`}
                blockScrollRef={viewerListRef}
                onZoomChange={index === imgIdx ? setViewerZoomed : undefined}
                onSingleTap={() => setViewerOpen(false)}
              />
            )}
          />
          <ViewerZoomControls
            bottom={insets.bottom + 18}
            onZoomOut={() => zoomHandles.current[imgIdx]?.zoomOut()}
            onFit={() => zoomHandles.current[imgIdx]?.fit()}
            onZoomIn={() => zoomHandles.current[imgIdx]?.zoomIn()}
          />
          <Pressable
            onPress={() => setViewerOpen(false)}
            accessibilityLabel="Cerrar foto"
            style={[styles.viewerClose, { top: insets.top + 10 }]}
          >
            <X size={20} color={brand.white} />
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

// ── piezas pequeñas reutilizadas dentro de la ficha ──────────────────────────
function Badge({ colors, icon, text }: { colors: any; icon: React.ReactNode; text: string }) {
  return (
    <View style={[styles.badge, { borderColor: alpha(colors.border, 0.8), backgroundColor: colors.surface }]}>
      {icon}
      <Text style={{ color: colors.textPrimary, fontSize: tipografia.micro, fontWeight: peso.fuerte, marginLeft: espaciado.e4 }}>{text}</Text>
    </View>
  );
}

function Section({ colors, title, children }: { colors: any; title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: espaciado.e20 }}>
      <Text style={{ color: colors.textPrimary, fontSize: 14.5, fontWeight: peso.maximo, marginBottom: espaciado.e8 }}>{title}</Text>
      {children}
    </View>
  );
}

function InfoLine({ colors, icon, text }: { colors: any; icon: React.ReactNode; text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: espaciado.e7 }}>
      {icon}
      <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, marginLeft: espaciado.e8, flex: 1 }}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  heroEmpty: { width: SCREEN_W, height: HERO_H * 0.6, alignItems: 'center', justifyContent: 'center' },
  counter: { position: 'absolute', bottom: 10, right: 12, borderRadius: radios.full, paddingHorizontal: espaciado.e9, paddingVertical: espaciado.e3 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: espaciado.e10 },
  price: { fontSize: 24, fontWeight: peso.titulo },
  oldPrice: { fontSize: tipografia.body, textDecorationLine: 'line-through', marginBottom: espaciado.e3 },
  title: { fontSize: 18.5, fontWeight: peso.maximo, marginTop: espaciado.e6, lineHeight: 24 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6, marginTop: espaciado.e12 },
  badge: {
    flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radios.full, paddingHorizontal: espaciado.e9, paddingVertical: espaciado.e5,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 },
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radios.md, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e9 },
  attrRow: {
    flexDirection: 'row', justifyContent: 'space-between', paddingVertical: espaciado.e7,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  notice: { borderRadius: radios.md, padding: espaciado.e10, marginBottom: espaciado.e12 },
  shopCard: { flexDirection: 'row', alignItems: 'center', borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, padding: espaciado.e12, marginTop: espaciado.e22 },
  shopLogo: { width: 44, height: 44, borderRadius: 22 },
  followBtn: { borderWidth: 1.5, borderRadius: radios.full, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e7 },
  bottomBar: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e10,
    paddingHorizontal: espaciado.e14, paddingTop: espaciado.e10, borderTopWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: {
    width: 44, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', justifyContent: 'center',
  },
  /**
   * «Añadir al carrito» (secundario, contorneado): va en la zona del precio y las opciones, no en
   * la barra inferior, donde el carrito ya tiene su icono. Alto 40 dp y ancho el del texto.
   */
  anadirBtn: {
    alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: espaciado.e7,
    height: 40, borderRadius: radios.full, borderWidth: 1.5, paddingHorizontal: espaciado.e14, marginTop: espaciado.e12,
  },
  /** TANDA K: la fila que enseña lo elegido (con la foto del color) y abre el selector. */
  elegirRow: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: radios.md,
    padding: espaciado.e9, marginTop: espaciado.e12,
  },
  elegirFoto: { width: 40, height: 40, borderRadius: 9 },
  /**
   * El CTA de la barra inferior: MISMO alto que los botones redondos (44 dp) y forma de píldora,
   * para que la fila se vea de una pieza. Ocupa el ancho que sobra (`flex: 1`) y el texto se
   * recorta con puntos suspensivos antes que romper la fila.
   */
  ctaBtn: {
    flex: 1, height: 44, borderRadius: radios.full, paddingHorizontal: espaciado.e12,
    alignItems: 'center', justifyContent: 'center',
  },
  /* TANDA D: el globito con cuántas cosas llevas en el carrito. */
  cartBadge: {
    position: 'absolute', top: -2, right: -2, minWidth: 17, height: 17, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e3,
  },
  viewerClose: {
    position: 'absolute', right: 16, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center',
  },
});
