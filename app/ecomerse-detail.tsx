/**
 * EcomerseDetailScreen — Ficha de producto estándar Taobao/Xianyu.
 * v2 (auditoría senior): id robusto sin hang, error con Reintentar, rating y
 * verificado honestos (sin 5.0 inventado ni escudo falso), garantía condicional,
 * CTA con precio + Buy Now = addToCart+checkout (mismo snapshot), stepper de
 * cantidad con tope de stock, teléfono GQ estricto con feedback, reportar en
 * Android+iOS (Modal), favorito con sesión, galería sin FlatList anidado,
 * SafeArea y dimensiones reactivas.
 * Ruta: /ecomerse-detail?id=
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Dimensions, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eye, Flag, Heart, MapPin, ShieldCheck, ShoppingCart, Star } from 'lucide-react-native';
import {EstadoDinero, Precio, ScreenHeader, Sheet, Tactil, alpha, espaciado, ilustracion, neutro, peso, radios, tipografia, trazo, useTheme} from '@egrouteplan/ui-kit';
import { ecomerseApi, EcomerseProduct, EcomerseProductVariant } from '../api/ecomerse';
import { useAccionesProducto } from '../components/ecomerse/useAccionesProducto';
import SelectorDeVariante, { type Eleccion, type ModoSelector } from '../components/ecomerse/SelectorDeVariante';

/**
 * Nombres de los documentos tal y como los lee el comprador. El `id` tiene que coincidir con el
 * CHECK de `wallet.ecomerse_product_docs` (migración 019) y con el formulario del vendedor.
 */
const DOC_LABEL: Record<string, string> = {
  factura_compra: 'Factura de compra',
  certificado_autenticidad: 'Certificado de autenticidad',
  autorizacion_marca: 'Autorización de marca',
};
import { useEcomerseStore } from '../state/ecomerse';
import { useSession } from '../state/session';
import { formatXAF } from '../utils/formatHelpers';
import { toGqMsisdn } from '../utils/phone';
import { brand } from '@egrouteplan/ui-kit';
import { CabeceraTienda } from '../components/ecomerse/CabeceraTienda';
import { BotonPreguntarTienda } from '../components/ecomerse/BotonPreguntarTienda';
import { llamarTelefono } from '../utils/llamar';

async function openWa(phone: string, text: string) {
  const cc = toGqMsisdn(phone);
  if (!cc) {
    Alert.alert('WhatsApp', 'Este vendedor no tiene un número válido. Usa Comprar ahora.');
    return;
  }
  const url = `https://wa.me/${cc}?text=${encodeURIComponent(text)}`;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('WhatsApp', 'No se pudo abrir WhatsApp. Instálalo o compra in-app para conservar la garantía.');
  }
}

export default function EcomerseDetailScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const SCREEN_W = Dimensions.get('window').width;
  const rawId = useLocalSearchParams<{ id?: string | string[] }>().id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  const { isAuthenticated } = useSession();

  const [product, setProduct] = useState<EcomerseProduct | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState('');
  const [reportBusy, setReportBusy] = useState(false);
  const addToCart = useEcomerseStore((s) => s.addToCart);
  const cartCount = useEcomerseStore((s) => s.cart.reduce((a, c) => a + c.qty, 0));
  /**
   * EL CORAZÓN Y LOS FAVORITOS VIENEN DEL MÓDULO COMÚN (Fase 2, 24/09/2026).
   *
   * Antes esto era la TERCERA copia de la misma regla —sesión, marca optimista y vuelta atrás si la
   * API falla—, escrita aquí a mano y en otros dos sitios. Ahora es una:
   * `components/ecomerse/useAccionesProducto.ts`.
   *
   * `abrirFicha` y `anadirAlCarrito` del módulo NO se usan en esta pantalla, y es deliberado: la ficha
   * tiene combinaciones, cantidad y «comprar ahora», y ese flujo es suyo (ver la cabecera del módulo).
   *
   * Y llega con algo que esta pantalla no tenía: el módulo sincroniza `favIds` al montar, así que
   * abrir una ficha por enlace directo —sin pasar por la home— ya no enseña el corazón vacío cuando
   * el producto sí está guardado.
   */
  const { favIds, alternarFavorito } = useAccionesProducto();
  const fav = favIds.includes(id ?? '');

  /**
   * ── FASE 4: LA COMBINACIÓN (21-sep-2026) ────────────────────────────────────────────────────────
   *
   * Si el anuncio tiene combinaciones, «Añadir» y «Comprar» **no compran**: abren la hoja de
   * elección, que es el paso que el servidor exige desde la fase 4 (una línea sin combinación en un
   * anuncio con combinaciones se rechaza). `elegido` recuerda la última elección para que la fila
   * «Combinación» la enseñe y para que el botón de comprar **no mienta con el precio**: el de la
   * combinación puede no ser el del anuncio.
   */
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [modoSelector, setModoSelector] = useState<ModoSelector>('comprar');
  const [elegido, setElegido] = useState<Eleccion | null>(null);

  const load = useCallback(async () => {
    if (!id) { setError('No encontramos este producto.'); return; }
    setError(null);
    try {
      setProduct(await ecomerseApi.product(id));
    } catch (e) {
      setProduct(null);
      setError(e instanceof Error ? e.message : 'No se pudo cargar');
    }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const s = styles(colors);

  if (!product && !error) {
    // Carga: skeleton ligero (sin hang si id inválido: load ya setea error)
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
        {/* Esqueleto: sin `alVolver` el componente deja el hueco del ancho del icono, así que el
            título sigue centrado exactamente igual que antes. */}
        <ScreenHeader titulo="Producto" />
        <View style={{ height: 280, backgroundColor: colors.surface }} />
        <View style={{ padding: espaciado.e16, gap: espaciado.e10 }}>
          <View style={{ height: 26, borderRadius: radios.sm, backgroundColor: colors.border, width: '40%' }} />
          <View style={{ height: 16, borderRadius: radios.sm, backgroundColor: colors.border, width: '85%' }} />
          <View style={{ height: 12, borderRadius: radios.sm, backgroundColor: colors.border, width: '60%' }} />
        </View>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e32, paddingTop: insets.top }}>
        <Text style={{ fontSize: ilustracion.md, marginBottom: espaciado.e8 }}>📦</Text>
        <Text style={{ fontSize: tipografia.body, fontWeight: peso.maximo, color: colors.textPrimary }}>No pudimos cargar el producto</Text>
        <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, textAlign: 'center', marginTop: espaciado.e6, lineHeight: 18 }}>{error}</Text>
        <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e18 }}>
          <Pressable onPress={load} style={{ backgroundColor: brand.secondary, paddingHorizontal: espaciado.e18, paddingVertical: espaciado.e11, borderRadius: radios.full }}>
            <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>Reintentar</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} style={{ paddingHorizontal: espaciado.e18, paddingVertical: espaciado.e11, borderRadius: radios.full, borderWidth: trazo.fino, borderColor: colors.border }}>
            <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body }}>Volver</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const phone = product.seller?.phoneContact ?? null;
  const canBuy = product.status === 'active' && product.stock > 0;
  const soldOut = product.stock <= 0 || product.status === 'sold_out';
  const photos = product.photos?.length ? product.photos : [null];
  const isFeat = product.isFeatured;
  /**
   * LA TIENDA ES UNA PUERTA (20-sep-2026). Aquí se calculaban a mano la valoración, el texto de
   * «sin valoraciones» y el escudo, y ese bloque **no llevaba a ninguna parte**: el comprador veía
   * quién vende y no podía ver qué más vende. Ahora los pinta `CabeceraTienda` —la misma tarjeta
   * que usan el directorio y la página de tienda— y la pulsación abre la tienda.
   * Las cuatro líneas se borran en vez de dejarlas: el texto de la valoración vive ya en el
   * componente, y tenerlo también aquí sería la primera grieta de dos versiones del mismo dato.
   */
  const sellerId = product.seller?.id ?? null;
  /**
   * FICHA TÉCNICA (tanda 3). El formulario de publicar ya recoge marca, modelo, SKU, talla y color
   * —y los guarda en `attributes`, que es jsonb—, pero la ficha NO los enseñaba: se recogían para
   * nada. Aquí se convierten en lo que el comprador necesita para decidir sin preguntar. Se omiten
   * los que no existan: una tabla con guiones es ruido.
   */
  const attrs = (product.attributes ?? {}) as Record<string, unknown>;
  const attrTxt = (k: string) => (typeof attrs[k] === 'string' && (attrs[k] as string).trim() ? (attrs[k] as string).trim() : null);
  const ficha: { label: string; valor: string }[] = [
    { label: 'Estado', valor: attrTxt('estado') ?? '' },
    { label: 'Marca', valor: attrTxt('marca') ?? '' },
    { label: 'Modelo', valor: attrTxt('modelo') ?? '' },
    { label: 'Talla / medida', valor: attrTxt('talla') ?? '' },
    { label: 'Color', valor: attrTxt('color') ?? '' },
    { label: 'Código (SKU)', valor: attrTxt('sku') ?? '' },
    /* Tanda 4: plazo de preparación y devoluciones. Van en la MISMA tabla que los atributos porque
       son lo mismo para el comprador —datos del artículo y de las condiciones— y separarlos en dos
       bloques rompería la lectura. El plazo se muestra en horas tal y como lo declara el vendedor;
       no se convierte a «1 día» porque «en 24 h» es como se pide. */
    { label: 'Preparación', valor: product.handlingHours ? `En ${product.handlingHours} h` : '' },
    { label: 'Devoluciones', valor: product.returnsAccepted ? 'Las acepta el vendedor' : '' },
  ].filter((f) => f.valor);
  /**
   * ¿El anuncio se compra por combinaciones? Un anuncio SIN ejes (`variants` vacío o ausente) sigue
   * funcionando exactamente como antes: cantidad en el cuerpo de la ficha y «Añadir»/«Comprar»
   * directos. Ese caso es el normal —todos los anuncios hasta hoy—, no una avería.
   */
  const combinaciones = product.variants ?? [];
  const hayCombinaciones = combinaciones.length > 0;

  /* Texto del precio para los BOTONES de la barra de compra. No se usa `<Precio>` aquí: el botón no
     enseña un importe, enseña una frase («Comprar · 18.500 XAF»), y esa frase tiene su propio
     defecto pendiente —se parte en dos líneas dentro del botón y deja ver la capa de abajo—, que va
     con la tanda de la barra de acciones. Se mantiene el mismo texto que había, incluido el
     «Consultar» del caso sin precio, para no mezclar dos cambios.
     Lo único que cambia con la fase 4: si hay una combinación elegida manda **su** precio, porque es
     el que se va a cobrar; un botón que enseñara el del anuncio estaría mintiendo justo cuando el
     comprador mira. */
  const precioBoton = elegido?.variant?.priceXaf ?? product.priceXaf;
  const priceTxt = Number.isFinite(precioBoton) ? formatXAF(precioBoton) : 'Consultar';
  const createdTs = Date.parse(product.createdAt ?? '');
  const created = Number.isFinite(createdTs)
    ? new Date(createdTs).toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' })
    : null;

  /**
   * Mete una línea en el carrito. Con combinación, la línea lleva su id, su nombre, sus atributos y
   * **su stock** (el tope que de verdad limita la cantidad); sin ella, es el anuncio entero como
   * siempre. El precio de la línea es el que se va a cobrar.
   */
  const pushCart = (n: number, variante?: EcomerseProductVariant | null) => {
    if (!canBuy) return;
    addToCart({
      productId: product.id,
      title: product.title,
      priceXaf: variante?.priceXaf ?? product.priceXaf,
      qty: Math.min(n, variante ? variante.stockQuantity : product.stock),
      photos: product.photos ?? [],
      stock: variante ? variante.stockQuantity : product.stock,
      city: product.city,
      ...(variante?.id
        ? {
            variantId: variante.id,
            variantName: variante.name,
            variantAttributes: variante.attributes ?? {},
            variantImageUrl: variante.imageUrl ?? null,
          }
        : {}),
    });
  };

  /**
   * «Comprar». Con carrito vacío añade la línea y va al checkout (que lee el store, mismo snapshot
   * de precio); con artículos dentro, ofrece pagar **solo este**, y ahí la combinación y la cantidad
   * viajan por la ruta, porque ese camino no toca el carrito.
   */
  const comprar = (variante: EcomerseProductVariant | null, cantidad: number) => {
    if (!canBuy) return;
    if (cartCount > 0) {
      Alert.alert('Tu carrito tiene artículos', '¿Cómo quieres pagar?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Pagar solo este',
          onPress: () => router.push({
            pathname: '/ecomerse-checkout',
            params: {
              productId: product.id,
              solo: '1',
              ...(variante?.id ? { variantId: variante.id, qty: String(cantidad) } : {}),
            },
          } as any),
        },
        { text: 'Añadir y pagar todo', onPress: () => { pushCart(cantidad, variante); router.push('/ecomerse-checkout' as any); } },
      ]);
      return;
    }
    pushCart(cantidad, variante);
    router.push('/ecomerse-checkout' as any); // el checkout lee el store (mismo snapshot de precio)
  };

  const abrirSelector = (modo: ModoSelector) => { setModoSelector(modo); setSelectorOpen(true); };

  /** Lo que devuelve la hoja cuando se elige «Añadir al carrito». */
  const alCarrito = (e: Eleccion) => {
    setElegido(e);
    setSelectorOpen(false);
    pushCart(e.cantidad, e.variant);
    Alert.alert('Añadido al carrito', '¿Quieres seguir comprando o ir al carrito?', [
      { text: 'Seguir', style: 'cancel' },
      { text: 'Ver carrito', onPress: () => router.push('/ecomerse-checkout' as any) },
    ]);
  };

  /** Lo que devuelve la hoja cuando se elige «Comprar ahora». */
  const alComprar = (e: Eleccion) => {
    setElegido(e);
    setSelectorOpen(false);
    comprar(e.variant, e.cantidad);
  };

  const addToCartFlow = () => {
    if (hayCombinaciones) { abrirSelector('carrito'); return; }
    pushCart(qty);
    Alert.alert('Añadido al carrito', '¿Quieres seguir comprando o ir al carrito?', [
      { text: 'Seguir', style: 'cancel' },
      { text: 'Ver carrito', onPress: () => router.push('/ecomerse-checkout' as any) },
    ]);
  };

  const buyNow = () => {
    if (hayCombinaciones) { abrirSelector('comprar'); return; }
    comprar(null, qty);
  };

  /* AQUÍ VIVÍA `toggleFav` — la tercera copia de la regla del corazón. Se retiró el 24/09/2026
     (Fase 2): ahora es `alternarFavorito` del módulo `useAccionesProducto`, que hace exactamente lo
     mismo —sesión primero, marca optimista, vuelta atrás con aviso— y además sincroniza `favIds` al
     montar, cosa que esta pantalla no hacía. Los textos de los dos avisos son idénticos porque son el
     mismo aviso: no se reescriben, se unifican. */

  const sendReport = async () => {
    if (reportReason.trim().length < 10) {
      Alert.alert('Motivo obligatorio', 'Describe el motivo con al menos 10 caracteres.');
      return;
    }
    setReportBusy(true);
    try {
      const r = await ecomerseApi.reportProduct(product.id, reportReason.trim());
      Alert.alert('Reporte enviado', r.message);
      setReportOpen(false);
      setReportReason('');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo reportar');
    } finally {
      setReportBusy(false);
    }
  };

  return (
    <View style={[stylesRoot(colors).root, { paddingTop: insets.top }]}>
      {/* Cabecera del kit desde el 24/09/2026. La acción de la derecha es el aviso de reporte. */}
      <ScreenHeader
        titulo="Producto"
        alVolver={() => router.back()}
        accion={
          <Tactil onPress={() => setReportOpen(true)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Reportar anuncio">
            <Flag size={18} color={colors.textSecondary} />
          </Tactil>
        }
      />

      <ScrollView contentContainerStyle={{ paddingBottom: 130 }} showsVerticalScrollIndicator={false}>
        {/* Galería swipe (ScrollView paging, sin FlatList anidado) */}
        <View>
          {photos[0] ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => setPhotoIdx(Math.round(e.nativeEvent.contentOffset.x / SCREEN_W))}
            >
              {photos.map((ph, i) => (
                <Image key={i} source={{ uri: ph! }} style={{ width: SCREEN_W, height: 280, backgroundColor: colors.surface }}
                  contentFit="cover" transition={200} accessibilityLabel={`Foto ${i + 1} de ${photos.length}`} />
              ))}
            </ScrollView>
          ) : (
            <View style={{ width: SCREEN_W, height: 280, backgroundColor: alpha(colors.primary, 0.08), alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: ilustracion.lg }}>{product.categoryIcon ?? '📦'}</Text>
            </View>
          )}
          {photos[0] && (
            <View style={s.photoCounter}><Text style={{ color: brand.white, fontSize: tipografia.micro, fontWeight: peso.maximo }}>{photoIdx + 1}/{photos.length}</Text></View>
          )}
        </View>

        <View style={{ padding: espaciado.e16 }}>
          {/* Etiquetas */}
          <View style={{ flexDirection: 'row', gap: espaciado.e6, marginBottom: espaciado.e8 }}>
            {isFeat && <View style={s.tagFeat}><Text style={s.tagFeatText}>🔥 Destacado</Text></View>}
            {product.seller?.badge === 'Pro' && <View style={s.tagPro}><Text style={s.tagProText}>Tienda PRO</Text></View>}
            {product.isNegotiable && <View style={s.tagSoft}><Text style={s.tagSoftText}>💰 Negociable</Text></View>}
          </View>

          {/* Precio + título */}
          <Precio valor={product.priceXaf} tamano="xl" textoVacio="Consultar" />
          <Text style={s.title}>{product.title}</Text>

          {/* Métricas */}
          <View style={s.metrics}>
            {product.views > 0 && <Metric icon={<Eye size={12} color={colors.textSecondary} />} label={`${product.views} vistas`} />}
            {product.favoriteCount > 0 && <Metric icon={<Heart size={12} color={colors.textSecondary} />} label={`${product.favoriteCount} fav`} />}
            <Metric icon={<ShoppingCart size={12} color={colors.textSecondary} />} label={soldOut ? 'Agotado' : `Stock ${product.stock}`} />
            <Metric icon={<MapPin size={12} color={colors.textSecondary} />} label={product.city} />
            {created && <Metric icon={<Text style={{ fontSize: tipografia.micro }}>🗓</Text>} label={created} />}
          </View>
          {product.categoryLabel && (
            <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, marginTop: espaciado.e6 }}>
              {product.categoryIcon} {product.categoryLabel}{product.subcategoryLabel ? ` · ${product.subcategoryLabel}` : ''}
            </Text>
          )}

          {/* DÓNDE ESTÁ EL DINERO (tanda 1 «el dinero se ve»).
              Antes: una sola frase («Garantía EG Route Plan de 7 días si pagas por la app…») que
              el comprador tenía que creer, y colocada a media pantalla. Ahora el bloque de los tres
              estados reales del dinero, justo encima de la cantidad y del CTA, que es donde la
              confianza decide. Los estados NO son inventados: los impone el backend
              (`liberarSiMonederoEc` exige status='delivered'; `devolverSiMonederoEc`, 'cancelled').
              Si el anuncio no admite compra in-app, se dice eso y nada más: no se promete garantía
              sobre un camino que no existe. */}
          {canBuy ? (
            <EstadoDinero activo="retenido" />
          ) : (
            <View style={[s.warranty, { backgroundColor: alpha(colors.primary, 0.06), borderColor: colors.border }]}>
              <ShieldCheck size={16} color={colors.text.primary} />
              <Text style={{ flex: 1, marginLeft: espaciado.e8, fontSize: tipografia.caption, color: colors.textPrimary, fontWeight: peso.fuerte }}>
                Este anuncio no admite compra in-app ahora mismo.
              </Text>
            </View>
          )}

          {/* Cantidad. CON combinaciones la cantidad se elige DENTRO de la hoja, y no por comodidad:
              es el único sitio donde se conoce el tope real. El `stock` del anuncio es la SUMA de las
              combinaciones, así que un «máx. 3» aquí puede ser mentira para la combinación que se
              acabe eligiendo. En su lugar va la puerta a la elección, que además enseña lo elegido. */}
          {canBuy && (hayCombinaciones ? (
            <Pressable
              onPress={() => abrirSelector('comprar')}
              accessibilityRole="button"
              accessibilityLabel={elegido?.variant ? `Combinación elegida: ${elegido.variant.name}. Cambiar` : 'Elegir la combinación'}
              style={[s.qtyRow, {
                borderRadius: radios.md, borderWidth: trazo.fino, borderColor: colors.border,
                paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e12,
              }]}
            >
              <Text style={{ fontSize: tipografia.body, fontWeight: peso.fuerte, color: colors.textPrimary }}>Combinación</Text>
              <Text
                numberOfLines={1}
                style={{
                  flex: 1, marginLeft: espaciado.e8, textAlign: 'right',
                  fontSize: tipografia.body, fontWeight: peso.fuerte,
                  color: elegido?.variant ? colors.textPrimary : colors.text.primary,
                }}
              >
                {elegido?.variant ? `${elegido.variant.name} × ${elegido.cantidad}` : 'Elegir'}
              </Text>
            </Pressable>
          ) : (
            <View style={s.qtyRow}>
              <Text style={{ fontSize: tipografia.body, fontWeight: peso.maximo, color: colors.textPrimary }}>Cantidad</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e12 }}>
                <Pressable onPress={() => setQty((q) => Math.max(1, q - 1))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Menos"
                  style={[s.qtyBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.subtitle }}>−</Text>
                </Pressable>
                <Text style={{ fontSize: tipografia.subtitle, fontWeight: peso.titulo, color: colors.textPrimary, minWidth: 24, textAlign: 'center' }}>{qty}</Text>
                <Pressable onPress={() => setQty((q) => Math.min(product.stock, q + 1))} hitSlop={8} accessibilityRole="button" accessibilityLabel="Más"
                  style={[s.qtyBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.subtitle }}>+</Text>
                </Pressable>
                <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>máx. {product.stock}</Text>
              </View>
            </View>
          ))}

          {/* Tienda — y ahora es una PUERTA. Antes este bloque enseñaba quién vende y no dejaba
              entrar: era el mejor sitio de la app para abrir una tienda y era un callejón sin
              salida. La tarjeta es el componente compartido (`CabeceraTienda`), el mismo que usan
              el directorio de tiendas y la página de tienda.
              La llamada sigue registrando el lead del ANUNCIO (`contactIntent`), que es lo único
              que distingue esta llamada de la que se hace desde la tienda: aquí se sabe de qué
              anuncio viene el interés, allí no. Y solo se registra si de verdad se abrió el
              marcador (`llamarTelefono` devuelve `false` con un número inválido). */}
          <View style={{ marginTop: espaciado.e18 }}>
            <Text style={s.sectionTitle}>Tienda</Text>
            <CabeceraTienda
              seller={product.seller}
              onPress={sellerId
                ? () => router.push({ pathname: '/ecomerse-tienda', params: { id: sellerId, nombre: product.seller?.businessName ?? '' } } as any)
                : undefined}
              onLlamar={phone
                ? () => {
                    void llamarTelefono(phone).then((abierto) => {
                      if (abierto && isAuthenticated) ecomerseApi.contactIntent(product.id, 'call').catch(() => undefined);
                    });
                  }
                : undefined}
            />
            {/*
              LA PUERTA AL CHAT (Fase 4 del pie). Va justo debajo de la tarjeta de la tienda y no en
              la barra de abajo, y eso es una decisión: la barra está ordenada alrededor del DINERO
              —Comprar manda, Añadir acompaña, y el contacto con WhatsApp bajó a icono discreto a
              propósito, para que el trato ocurra dentro de la app—. La conversación con la tienda
              también ocurre dentro de la app: es la pieza que le faltaba al bloque «quién vende»,
              que ya era puerta a la tienda y ahora es también puerta a hablar con ella.
              El `productId` viaja para que el primer mensaje cite ESTE anuncio. Que se cite o no lo
              decide el servidor —sólo si el hilo estaba vacío y el anuncio es de esta tienda—.
            */}
            <BotonPreguntarTienda
              sellerId={sellerId}
              productId={product.id}
              nombre={product.seller?.businessName ?? null}
              telefono={phone}
              /* El margen lo pone la ficha, no el botón: aquí se separa con `marginTop` y en la
                 página de tienda con el `gap` de su contenedor. */
              style={{ marginTop: espaciado.e12 }}
            />
          </View>

          {/* FICHA TÉCNICA: lo que el formulario recoge y el comprador necesita saber. Va después de
              la descripción y antes del vendedor: primero el artículo, después quién lo vende. */}
          {ficha.length > 0 && (
            <View style={{ marginTop: espaciado.e18 }}>
              <Text style={s.sectionTitle}>Características</Text>
              <View style={{ borderRadius: radios.md, borderWidth: trazo.fino, borderColor: colors.border, overflow: 'hidden' }}>
                {ficha.map((f, i) => (
                  <View
                    key={f.label}
                    style={{
                      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espaciado.e12,
                      paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e9,
                      borderTopWidth: i === 0 ? 0 : 1, borderTopColor: colors.border,
                    }}
                  >
                    <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary }}>{f.label}</Text>
                    <Text style={{ flex: 1, textAlign: 'right', fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.textPrimary }} numberOfLines={2}>
                      {f.valor}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* DOCUMENTOS DEL VENDEDOR (tanda 4 · sección 4). Se enseñan CON SU ESTADO, y esa es la
              decisión importante: el informe de Dewu concluyó que «un badge de verificado sin
              evidencia consultable es marketing; uno con informe y trazabilidad es un sistema». Aquí
              el comprador ve si el papel está aprobado por la plataforma o todavía en revisión, en
              vez de un escudo que promete más de lo que se ha comprobado. */}
          {(product.docs?.length ?? 0) > 0 && (
            <View style={{ marginTop: espaciado.e18 }}>
              <Text style={s.sectionTitle}>Documentación</Text>
              <View style={{ gap: espaciado.e6 }}>
                {product.docs!.map((d) => {
                  const etiqueta = DOC_LABEL[d.docType] ?? d.docType;
                  const aprobado = d.status === 'approved';
                  const rechazado = d.status === 'rejected';
                  const color = aprobado ? colors.success : rechazado ? colors.danger : colors.textSecondary;
                  return (
                    <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}>
                      <ShieldCheck size={14} color={color} />
                      <Text style={{ flex: 1, fontSize: tipografia.caption, color: colors.textPrimary }}>
                        {etiqueta}
                        {d.docNumber ? ` · ${d.docNumber}` : ''}
                        {d.amountXaf !== null && d.amountXaf !== undefined ? ` · ${formatXAF(d.amountXaf)}` : ''}
                      </Text>
                      <Text style={{ fontSize: tipografia.micro, fontWeight: peso.maximo, color }}>
                        {aprobado ? 'Revisado' : rechazado ? 'Rechazado' : 'En revisión'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* Descripción */}
          {product.description ? (
            <View style={{ marginTop: espaciado.e18 }}>
              <Text style={s.sectionTitle}>Descripción</Text>
              <Text style={{ fontSize: tipografia.body, lineHeight: 20, color: colors.textSecondary }}>{product.description}</Text>
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* ACCIÓN PRINCIPAL (tanda 2 de la comparación con 得物/Dewu).
          Antes había CUATRO acciones del mismo orden (WhatsApp 157x138, Favorito 121x110,
          Carrito 326x145 y Comprar 302x203): ninguna mandaba, y `WhatsApp` —cuyo trato la propia
          garantía declara NO cubierto— competía de igual a igual con comprar. La regla del spec de
          referencia es una acción dominante al pie. Ahora:
            · Comprar  → CTA principal, ancho y con el precio.
            · Añadir   → secundaria, contorno (sigue siendo cómoda para varios artículos).
            · ♥ / 💬   → iconos discretos; el contacto pasa a ser la salida MENOS prominente,
                         que es donde debe estar si queremos que el dinero pase por la app.
          Se conservan las cuatro funciones: no se pierde ninguna salida, se ordena su peso. */}
      <View style={[s.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
        {canBuy && (
          <Text style={[s.notaFuera, { color: colors.textSecondary }]}>
            Si compras por WhatsApp, la garantía no cubre el trato.
          </Text>
        )}
        <View style={s.acciones}>
          <Pressable onPress={() => alternarFavorito(product)} hitSlop={8} accessibilityRole="button"
            accessibilityLabel={fav ? 'Quitar de favoritos' : 'Añadir a favoritos'}
            accessibilityState={{ selected: fav }} style={s.iconCol}>
            <Heart size={22} color={fav ? brand.like : colors.textSecondary} fill={fav ? brand.like : 'transparent'} />
          </Pressable>
          <Pressable onPress={() => phone && openWa(phone, 'Hola, me interesa tu anuncio: ' + product.title).then(() => {
            if (isAuthenticated) ecomerseApi.contactIntent(product.id, 'whatsapp').catch(() => undefined);
          })} hitSlop={8}
            accessibilityRole="button" accessibilityLabel="Escribir por WhatsApp" style={s.iconCol}>
            <Text style={{ fontSize: tipografia.subtitle, opacity: 0.55 }}>💬</Text>
          </Pressable>
          <Pressable onPress={addToCartFlow} disabled={!canBuy} accessibilityRole="button" accessibilityState={{ disabled: !canBuy }}
            accessibilityLabel="Añadir al carrito"
            style={[s.cartBtn, { borderColor: canBuy ? brand.secondary : colors.border }]}>
            <Text style={{ color: canBuy ? colors.text.secondary : colors.textSecondary, fontSize: tipografia.body, fontWeight: peso.maximo }}>Añadir</Text>
          </Pressable>
          <Pressable onPress={buyNow} disabled={!canBuy} accessibilityRole="button" accessibilityState={{ disabled: !canBuy }}
            accessibilityLabel={canBuy ? `Comprar por ${priceTxt}` : 'No disponible'}
            style={[s.buyBtn, { backgroundColor: canBuy ? brand.secondary : colors.border }]}>
            <Text style={{ color: brand.white, fontSize: tipografia.subtitle, fontWeight: peso.titulo }}>
              {canBuy ? `Comprar · ${priceTxt}` : soldOut ? 'Agotado' : 'No disponible'}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ── LA ELECCIÓN DE COMBINACIÓN (fase 4) ─────────────────────────────────────────────────────
          La hoja solo existe si el anuncio tiene ejes; en un anuncio sin ejes ningún camino la abre
          (los dos botones y la fila de cantidad comprueban `hayCombinaciones`), así que no se monta
          nada de más y el comportamiento de siempre queda intacto. */}
      <SelectorDeVariante
        visible={selectorOpen}
        product={product}
        modoInicial={modoSelector}
        seleccionInicial={elegido?.variant ?? null}
        onClose={() => setSelectorOpen(false)}
        onCarrito={alCarrito}
        onComprar={alComprar}
      />

      {/*
        Reportar anuncio. Era un `<Modal>` a mano que repetía lo del `Sheet`; con él se hereda el
        fondo, el cierre al tocar fuera, el botón de atrás y el título anunciado como cabecera.
      */}
      <Sheet
        visible={reportOpen}
        position="bottom"
        busy={reportBusy}
        title="Reportar anuncio"
        subtitle="Cuéntanos el motivo (fraude, prohibido, estafa…). Lo revisa el equipo de moderación."
        onClose={() => setReportOpen(false)}
      >
        <TextInput
          value={reportReason}
          onChangeText={setReportReason}
          placeholder="Motivo (mín. 10 caracteres)"
          placeholderTextColor={colors.textSecondary}
          multiline
          style={[s.reportInput, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
        />
        <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e12 }}>
          <Pressable onPress={() => setReportOpen(false)} style={[s.modalBtn, { borderWidth: trazo.fino, borderColor: colors.border }]}>
            <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body }}>Cancelar</Text>
          </Pressable>
          <Pressable onPress={sendReport} disabled={reportBusy} style={[s.modalBtn, { backgroundColor: colors.danger, flex: 1 }]}>
            <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>{reportBusy ? 'Enviando…' : 'Enviar reporte'}</Text>
          </Pressable>

            </View>
      </Sheet>
    </View>
  );
}

function Metric({ icon, label }: { icon: React.ReactNode; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e3 }}>
      {icon}
      <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>{label}</Text>
    </View>
  );
}

const stylesRoot = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({ root: { flex: 1, backgroundColor: c.background } });

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  photoCounter: { position: 'absolute', right: 12, bottom: 12, backgroundColor: 'rgba(0,0,0,0.55)', paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3, borderRadius: radios.full },
  tagFeat: { backgroundColor: 'rgba(255,107,53,0.14)', borderRadius: radios.sm, paddingHorizontal: espaciado.e7, paddingVertical: espaciado.e3 },
  tagFeatText: { color: brand.secondary, fontSize: tipografia.micro, fontWeight: peso.maximo },
  /* `avatar` y `roundBtn` se fueron con el bloque de la tienda: viven en `CabeceraTienda`, que es
     donde se pintan ahora. Dejar aquí sus copias era garantizar que un día se cambie una sí y otra
     no. */
  tagPro: { backgroundColor: 'rgba(0,132,255,0.12)', borderRadius: radios.sm, paddingHorizontal: espaciado.e7, paddingVertical: espaciado.e3 },
  tagProText: { color: brand.primary, fontSize: tipografia.micro, fontWeight: peso.maximo },
  tagSoft: { backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: radios.sm, paddingHorizontal: espaciado.e7, paddingVertical: espaciado.e3 },
  tagSoftText: { color: brand.success, fontSize: tipografia.micro, fontWeight: peso.maximo },
  title: { fontSize: tipografia.subtitle, fontWeight: peso.maximo, color: c.textPrimary, marginTop: espaciado.e6, lineHeight: 23 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e12, marginTop: espaciado.e10 },
  warranty: { flexDirection: 'row', alignItems: 'center', borderRadius: radios.md, borderWidth: trazo.fino, padding: espaciado.e10, marginTop: espaciado.e12 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: espaciado.e14 },
  qtyBtn: { width: 34, height: 34, borderRadius: radios.md, borderWidth: trazo.fino, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: tipografia.body, fontWeight: peso.maximo, color: c.textPrimary, marginBottom: espaciado.e8 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: espaciado.e14, paddingTop: espaciado.e8, borderTopWidth: trazo.fino, gap: espaciado.e6 },
  /** Nota de alcance de la garantía: encima de las acciones, a sangre dentro de la barra. */
  notaFuera: { textAlign: 'center', fontSize: tipografia.micro },
  /** Fila de acciones: antes era la barra entera; ahora la nota va arriba y esto debajo. */
  acciones: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10 },
  iconCol: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e2 },
  /** Añadir: secundaria de contorno. Antes era un bloque relleno (neutro.n300) que pesaba como el CTA. */
  cartBtn: { borderRadius: radios.md, borderWidth: trazo.base, paddingVertical: espaciado.e12, paddingHorizontal: espaciado.e16, alignItems: 'center' },
  /** Comprar: la única acción dominante. Crece para quedarse con el espacio sobrante. */
  buyBtn: { flex: 1, borderRadius: radios.md, paddingVertical: espaciado.e14, alignItems: 'center' },
  reportInput: { borderRadius: radios.md, borderWidth: trazo.fino, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10, minHeight: 90, textAlignVertical: 'top', fontSize: tipografia.body },
  modalBtn: { paddingVertical: espaciado.e12, paddingHorizontal: espaciado.e16, borderRadius: radios.md, alignItems: 'center' },
});
