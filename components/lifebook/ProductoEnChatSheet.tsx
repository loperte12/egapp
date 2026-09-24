/**
 * ProductoEnChatSheet — el flujo EMBEBIDO de compra dentro del chat (niveles 1 y 2).
 *
 * QUÉ PROBLEMA RESUELVE (lo explica el propio documento de Mercado): cada vez que sacas al usuario
 * de donde está, se pierde gente. Hoy la tarjeta de producto del chat tiene un botón «Comprar» que
 * **te saca a la ficha en pantalla completa** y de ahí a la caja: tres navegaciones. Lo que pide la
 * especificación (y lo que hacen WeChat y Xiaohongshu) es no salir nunca del chat:
 *
 *   Nivel 1 · tocas la tarjeta → se abre una HOJA inferior (~65 %) con fotos, variantes, cantidad y
 *             total. El chat sigue detrás, oscurecido. Si cierras, vuelves exactamente donde estabas.
 *   Nivel 2 · «Comprar ahora» → la MISMA hoja se expande (~92 %) con el resumen, el desglose del
 *             total y «Pagar».
 *   Nivel 3 · «Pagar» → ahí sí se sale a la caja que ya existe (`/lifebook-checkout`, con entrega y
 *             forma de pago). La especificación permite que el pago sea pantalla completa, porque es
 *             una pasarela externa.
 *
 * Lo que NO hace todavía (y se dice en la pantalla, no se disimula): **libreta de direcciones**.
 * (Los cupones SÍ existen desde la tanda Q: se eligen en la caja, que es donde se sabe el envío y la
 * tienda exacta de cada pedido.)
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { ChevronDown, Minus, Plus, ShoppingCart, Store, X } from 'lucide-react-native';
import { absUrl } from '../../api/config';
import { commerceApi, type LbProduct, type LbProductVariant } from '../../api/commerce';
import { carritoApi } from '../../api/lifebookCarrito';
import { lbXaf } from '../../constants/lifebook';
import { lbPriceLabel } from '../../constants/commerce';
import { ir } from '../../constants/rutas';

export function ProductoEnChatSheet({ productId, visible, onClose, onAnadido, conversationId }: {
  productId: string | null;
  visible: boolean;
  onClose: () => void;
  /** Se añadió al carrito o se pidió comprar: el chat puede refrescar su globito. */
  onAnadido?: () => void;
  /**
   * MERCADO (tanda E): chat donde está pasando la compra. Viaja hasta la caja y de ahí al servidor,
   * que publica la TARJETA DEL PEDIDO en esa conversación (y siempre en el chat con la tienda).
   */
  conversationId?: string | null;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [producto, setProducto] = useState<LbProduct | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [variante, setVariante] = useState<LbProductVariant | null>(null);
  const [cantidad, setCantidad] = useState(1);
  /** `false` = nivel 1 (ficha embebida) · `true` = nivel 2 (resumen y pagar). */
  const [expandido, setExpandido] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!visible || !productId) return;
    let vivo = true;
    setCargando(true);
    setError(null);
    setExpandido(false);
    setCantidad(1);
    setVariante(null);
    // La ficha viene envuelta (`{ product }`): leerla mal fue un fallo real en la tanda D.
    commerceApi.product(String(productId))
      .then((res) => {
        if (!vivo) return;
        const envuelto = res as unknown as { product?: LbProduct };
        const p = envuelto.product ?? (res as unknown as LbProduct | null);
        if (!p) { setError('No se pudo abrir el producto.'); return; }
        setProducto(p);
        // Si solo hay una variante, se preselecciona: ahorra un toque en el caso más común.
        if (Array.isArray(p.variants) && p.variants.length === 1) setVariante(p.variants[0]);
      })
      .catch((e) => { if (vivo) setError(e instanceof Error ? e.message : 'No se pudo abrir el producto.'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [visible, productId]);

  if (!visible) return null;

  const precioUnitario = variante?.priceXaf ?? producto?.priceXaf ?? null;
  const total = precioUnitario === null ? null : precioUnitario * cantidad;
  const necesitaVariante = !!producto?.variants?.length && !variante;
  const fotos = (producto?.media ?? []).map((m) => absUrl(m.url)).filter(Boolean);
  const foto = fotos[0] ?? null;

  /** Añade al carrito sin salir del chat (valida variante si el producto tiene). */
  const anadir = async () => {
    if (!producto || ocupado) return;
    if (necesitaVariante) { Alert.alert('Elige una opción', 'Este producto tiene variantes: elige talla o color.'); return; }
    setOcupado(true);
    try {
      await carritoApi.anadir(producto.id, { variantId: variante?.id ?? null, quantity: cantidad });
      onAnadido?.();
      Alert.alert('Añadido al carrito', `«${producto.title}» · ${cantidad} ud.`);
      onClose();
    } catch (e) {
      Alert.alert('Carrito', e instanceof Error ? e.message : 'No se pudo añadir');
    } finally { setOcupado(false); }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      {/* El chat se queda DETRÁS y oscurecido: se toca fuera para volver donde estabas. */}
      <Pressable style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.45)' }]} onPress={onClose} />
      <View style={[styles.sheet, {
        backgroundColor: colors.card,
        height: expandido ? '92%' : '65%',
        paddingBottom: insets.bottom + 12,
      }]}>
        {/* Tirador: sube/baja entre nivel 1 y 2 sin perder el contexto. */}
        <Pressable
          onPress={() => setExpandido((v) => !v)}
          accessibilityLabel={expandido ? 'Encoger el panel' : 'Ampliar el panel'}
          style={styles.handleWrap}
        >
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
        </Pressable>

        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e6 }}>
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.subtitle, fontWeight: '900', flex: 1 }} numberOfLines={1}>
            {expandido ? 'Confirmar la compra' : 'Producto'}
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
            <X size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        {cargando ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, textAlign: 'center', paddingHorizontal: espaciado.e30 }}>{error}</Text>
          </View>
        ) : producto ? (
          <ScrollView contentContainerStyle={{ padding: espaciado.e14, paddingTop: espaciado.e4, gap: espaciado.e10 }} keyboardShouldPersistTaps="handled">
            {/* Foto (en el nivel 2 se enseña más pequeña: el protagonismo pasa al resumen) */}
            {foto ? (
              <Image
                source={foto}
                style={{ width: '100%', height: expandido ? 120 : 190, borderRadius: radios.md }}
                contentFit="cover"
                transition={0}
              />
            ) : (
              <View style={{ height: expandido ? 90 : 150, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.primary, 0.08) }}>
                <ShoppingCart size={26} color={alpha(colors.primary, 0.5)} />
              </View>
            )}

            <View>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: '900' }} numberOfLines={expandido ? 1 : 3}>
                {producto.title}
              </Text>
              {!expandido && producto.shortDescription ? (
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e3 }} numberOfLines={2}>
                  {producto.shortDescription}
                </Text>
              ) : null}
              <Text style={{ color: colors.primary, fontSize: 19, fontWeight: '900', marginTop: espaciado.e6 }}>
                {lbPriceLabel(precioUnitario, producto.priceMode, lbXaf)}
                {cantidad > 1 && precioUnitario !== null ? (
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '700' }}>
                    {'   '}{cantidad} × {lbXaf(precioUnitario)}
                  </Text>
                ) : null}
              </Text>
              {producto.shop?.name ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, marginTop: espaciado.e6 }}>
                  <Store size={12} color={colors.textSecondary} />
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }} numberOfLines={1}>{producto.shop.name}</Text>
                </View>
              ) : null}
            </View>

            {/* Variantes: se eligen aquí mismo, sin salir del chat. */}
            {Array.isArray(producto.variants) && producto.variants.length > 0 ? (
              <View>
                <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: '800', marginBottom: espaciado.e6 }}>
                  Elige una opción{necesitaVariante ? ' (obligatorio)' : ''}
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 }}>
                  {producto.variants.map((v) => {
                    const on = variante?.id === v.id;
                    return (
                      <Pressable
                        key={v.id}
                        onPress={() => setVariante(v)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: on }}
                        accessibilityLabel={`Opción ${v.name}`}
                        style={[styles.chip, {
                          borderColor: on ? colors.primary : alpha(colors.border, 0.8),
                          backgroundColor: on ? alpha(colors.primary, 0.12) : colors.surface,
                        }]}
                      >
                        <Text style={{ color: on ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: '800' }}>
                          {v.name}{v.priceXaf !== null && v.priceXaf !== undefined ? ` · ${lbXaf(v.priceXaf)}` : ''}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Cantidad */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e12 }}>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: '800', flex: 1 }}>Cantidad</Text>
              <Pressable onPress={() => setCantidad((n) => Math.max(1, n - 1))} accessibilityLabel="Quitar una unidad" style={[styles.paso, { borderColor: colors.border }]}>
                <Minus size={14} color={colors.textPrimary} />
              </Pressable>
              <Text style={{ color: colors.textPrimary, fontWeight: '900', fontSize: 15, minWidth: 26, textAlign: 'center' }}>{cantidad}</Text>
              <Pressable onPress={() => setCantidad((n) => Math.min(99, n + 1))} accessibilityLabel="Añadir una unidad" style={[styles.paso, { borderColor: colors.border }]}>
                <Plus size={14} color={colors.textPrimary} />
              </Pressable>
            </View>

            {/* NIVEL 2: resumen, desglose y pagar */}
            {expandido ? (
              <View style={{ gap: espaciado.e6, marginTop: espaciado.e4 }}>
                <View style={[styles.linea, { borderTopColor: alpha(colors.border, 0.6) }]}>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>Producto</Text>
                  <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: '700' }}>
                    {variante ? `${producto.title} · ${variante.name}` : producto.title}
                  </Text>
                </View>
                <View style={styles.linea}>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>Subtotal</Text>
                  <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: '700' }}>{total === null ? '—' : lbXaf(total)}</Text>
                </View>
                <View style={styles.linea}>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>Envío</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>se elige en la caja</Text>
                </View>
                <View style={styles.linea}>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>Cupón</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>se elige en la caja</Text>
                </View>
                <View style={[styles.linea, { marginTop: espaciado.e4 }]}>
                  <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '900' }}>Total a pagar</Text>
                  <Text style={{ color: colors.primary, fontSize: 17, fontWeight: '900' }}>{total === null ? 'A consultar' : lbXaf(total)}</Text>
                </View>
                <Pressable
                  onPress={() => {
                    if (!producto || necesitaVariante) {
                      Alert.alert('Elige una opción', 'Este producto tiene variantes: elige talla o color.');
                      return;
                    }
                    onClose();
                    ir.libre('/lifebook-checkout', {
                      productId: producto.id,
                      ...(variante?.id ? { variantId: variante.id } : {}),
                      quantity: String(cantidad),
                      ...(conversationId ? { conversationId: String(conversationId) } : {}),
                    });
                  }}
                  accessibilityLabel="Pagar"
                  style={[styles.pagar, { backgroundColor: colors.primary }]}
                >
                  <Text style={{ color: brand.white, fontSize: 15.5, fontWeight: '900' }}>
                    Pagar{total !== null ? ` ${lbXaf(total)}` : ''}
                  </Text>
                </Pressable>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, textAlign: 'center', marginTop: espaciado.e2 }}>
                  La dirección y la forma de pago se eligen en la caja. Al pagar volverás aquí.
                </Text>
              </View>
            ) : null}
          </ScrollView>
        ) : null}

        {/* NIVEL 1: las dos acciones, sin salir del chat */}
        {!expandido && producto ? (
          <View style={[styles.acciones, { borderTopColor: alpha(colors.border, 0.6), backgroundColor: colors.card }]}>
            <Pressable
              onPress={() => { void anadir(); }}
              disabled={ocupado}
              accessibilityLabel="Añadir al carrito"
              style={[styles.accionSec, { borderColor: colors.primary }]}
            >
              {ocupado ? <ActivityIndicator size="small" color={colors.primary} /> : (
                <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: '900' }}>Añadir al carrito</Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                if (necesitaVariante) { Alert.alert('Elige una opción', 'Este producto tiene variantes: elige talla o color.'); return; }
                setExpandido(true);
              }}
              accessibilityLabel="Comprar ahora"
              style={[styles.accionPri, { backgroundColor: colors.primary }]}
            >
              <Text style={{ color: brand.white, fontSize: tipografia.body, fontWeight: '900' }}>Comprar ahora</Text>
            </Pressable>
          </View>
        ) : null}

        {expandido ? (
          <Pressable
            onPress={() => setExpandido(false)}
            accessibilityLabel="Volver al detalle del producto"
            style={[styles.encoger, { borderTopColor: alpha(colors.border, 0.6) }]}
          >
            <ChevronDown size={16} color={colors.textSecondary} />
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '800' }}>Seguir mirando el producto</Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1 },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' },
  handleWrap: { alignItems: 'center', paddingTop: espaciado.e8, paddingBottom: espaciado.e2 },
  handle: { width: 38, height: 4, borderRadius: 2 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  chip: { borderWidth: 1, borderRadius: radios.full, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7 },
  paso: { width: 30, height: 30, borderRadius: radios.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  linea: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaciado.e10 },
  pagar: { borderRadius: 14, paddingVertical: espaciado.e14, alignItems: 'center', marginTop: espaciado.e6 },
  acciones: { flexDirection: 'row', gap: espaciado.e10, padding: espaciado.e12, borderTopWidth: StyleSheet.hairlineWidth },
  accionSec: { flex: 1, borderWidth: 1.5, borderRadius: 14, paddingVertical: espaciado.e12, alignItems: 'center' },
  accionPri: { flex: 1, borderRadius: 14, paddingVertical: espaciado.e12, alignItems: 'center' },
  encoger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e6, paddingVertical: espaciado.e12, borderTopWidth: StyleSheet.hairlineWidth },
});
