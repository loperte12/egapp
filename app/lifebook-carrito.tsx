/**
 * EL CARRITO · /lifebook-carrito
 *
 * Lo que hace, según la especificación del carrito:
 *   · Es **uno solo** y vive en la cuenta (no hay carrito por tienda ni por grupo).
 *   · Los productos van **agrupados por tienda**: cada bloque tiene su casilla (selecciona todo el
 *     bloque), el logo, el nombre y la flecha para abrir la tienda.
 *   · Cada línea lleva casilla de **tres estados** (marcada / vacía / gris si no se puede pagar),
 *     miniatura que abre la ficha, nombre, la **variante en una píldora** (se cambia sin salir del
 *     carrito), las etiquetas de estado y el precio (con el anterior tachado si cambió).
 *   · La cantidad se cambia con − / + : el «−» se apaga en 1 y el «+» al llegar al **stock real**.
 *   · Abajo, fijo: «Todo», el **total** en rojo, lo que **ahorras** y **«Pagar(N)»** (apagado si no
 *     hay nada marcado). En modo **Editar** cambia a «Mover a favoritos» + «Eliminar».
 *   · Un producto agotado, retirado o **borrado por la tienda** no desaparece: se queda apagado,
 *     dice por qué y solo se va si la persona lo quita.
 *
 * Lo que NO se inventa (y por eso no se ve):
 *   · **Cupones**: existen desde la tanda Q y se aplican **en la caja** (ahí se elige el de cada
 *     tienda y se ve el descuento), no en el carrito: aquí todavía no se sabe el envío ni la tienda
 *     definitiva de cada línea, así que un «ahorras X» sería un número inventado.
 *   · **«Precio de live»**: no hay transmisiones con oferta. El código ya distingue de dónde vino
 *     cada línea (`sourceKind`), así que el día que exista se pinta sin tocar nada más.
 *   · **«Fuera de zona»**: el envío se comprueba en la caja (política de la tienda), no aquí.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Swipeable } from 'react-native-gesture-handler';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, altura, useTheme, tipografia, radios } from '@egrouteplan/ui-kit';
import { ArrowLeft, Check, ChevronRight, Minus, Plus, ShoppingCart, Store, Trash2, X } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { absUrl } from '../api/config';
import { commerceApi, type LbProductVariant } from '../api/commerce';
import { carritoApi, type LbCarrito, type LbLineaCarrito, type LbGrupoCarrito } from '../api/lifebookCarrito';
import { lbXaf } from '../constants/lifebook';
import { ir as irSeguro } from '../constants/rutas';
import { brand } from '@egrouteplan/ui-kit';

/**
 * La casilla redonda del carrito. Tres estados, como pide la especificación.
 *
 * ── CORRECCIÓN TÁCTIL (24/09/2026, Fase 2 de la reconstrucción) ──
 * El círculo mide 21 dp y se salvaba con `hitSlop={8}`, que daba 37 dp de área táctil. Los dos
 * números incumplen: el mínimo de la plataforma son 44 dp, y `hitSlop` **no cambia lo que el usuario
 * ve ni a lo que apunta** — agranda la zona que responde, pero el dedo sigue yendo a un círculo de
 * 21. En un carrito, con el pulgar y una sola mano, eso es un toque fallido.
 *
 * El arreglo es el que manda el plan: **crecer el elemento, no el hitSlop.** Pero crecer el CÍRCULO a
 * 44 lo convertiría en un disco enorme que rompe el diseño, así que se separan las dos cosas:
 *   · el **Pressable mide 44 dp** (`altura.punto`) y es lo que el dedo encuentra;
 *   · el **círculo sigue midiendo 21** y va centrado dentro, así que el diseño no cambia ni un píxel.
 * Se retira el `hitSlop`: ya no hace falta y era el parche que ocultaba el problema.
 */
function Casilla({ estado, onPress, etiqueta }: {
  /** `on` marcada · `off` vacía · `bloqueada` gris (no responde). */
  estado: 'on' | 'off' | 'bloqueada';
  onPress?: () => void;
  etiqueta: string;
}) {
  const { colors } = useTheme();
  const bloqueada = estado === 'bloqueada';
  return (
    <Pressable
      onPress={bloqueada ? undefined : onPress}
      disabled={bloqueada}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: estado === 'on', disabled: bloqueada }}
      accessibilityLabel={etiqueta}
      style={styles.toque}
    >
      <View
        style={[
          styles.casilla,
          {
            borderColor: bloqueada ? alpha(colors.border, 0.8) : estado === 'on' ? colors.primary : colors.border,
            backgroundColor: bloqueada ? alpha(colors.border, 0.25) : estado === 'on' ? colors.primary : 'transparent',
          },
        ]}
      >
        {estado === 'on' ? <Check size={13} color={brand.white} /> : null}
      </View>
    </Pressable>
  );
}

export default function LifeBookCarritoScreen() {
  return (
    <AuthGate>
      <CarritoContent />
    </AuthGate>
  );
}

function CarritoContent() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [carrito, setCarrito] = useState<LbCarrito | null>(null);
  const [cargando, setCargando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  /** Ids de LÍNEA marcados (no de producto: el mismo producto puede estar con dos variantes). */
  const [sel, setSel] = useState<string[]>([]);
  const [tocado, setTocado] = useState(false);
  /** Línea cuya variante se está cambiando (hoja inferior). */
  const [varianteDe, setVarianteDe] = useState<LbLineaCarrito | null>(null);
  const [variantes, setVariantes] = useState<LbProductVariant[] | null>(null);

  const aplicar = useCallback((nuevo: LbCarrito, marcarTodo = false) => {
    setCarrito(nuevo);
    setSel((prev) => {
      const disponibles = (nuevo.items ?? []).filter((i) => i.available).map((i) => i.id);
      if (marcarTodo || !tocado) return disponibles;           // primera carga: todo lo pagable, marcado
      return prev.filter((id) => disponibles.includes(id));   // al cambiar, se respeta lo marcado
    });
  }, [tocado]);

  const cargar = useCallback(async () => {
    try {
      aplicar(await carritoApi.ver());
    } catch {
      setCarrito({ groups: [], items: [], count: 0, lines: 0, totalXaf: 0, totalDisponibleXaf: 0, problems: 0, hasOnRequest: false });
    } finally { setCargando(false); }
  }, [aplicar]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  const items = carrito?.items ?? [];
  const grupos = carrito?.groups ?? [];

  /* ── Selección ─────────────────────────────────────────────────────────────── */
  const alternar = (id: string) => {
    setTocado(true);
    setSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const alternarGrupo = (g: LbGrupoCarrito) => {
    setTocado(true);
    const ids = g.items.filter((i) => i.available).map((i) => i.id);
    const todos = ids.every((id) => sel.includes(id));
    setSel((prev) => (todos ? prev.filter((x) => !ids.includes(x)) : [...new Set([...prev, ...ids])]));
  };
  const marcarTodo = () => {
    setTocado(true);
    const disponibles = items.filter((i) => i.available).map((i) => i.id);
    const todos = disponibles.every((id) => sel.includes(id));
    setSel(todos ? [] : disponibles);
  };

  const seleccionadas = useMemo(() => items.filter((i) => sel.includes(i.id)), [items, sel]);
  const unidades = seleccionadas.reduce((n, i) => n + i.quantity, 0);
  const total = seleccionadas.reduce((n, i) => n + (i.lineTotalXaf ?? 0), 0);
  /** Lo que se ahorra: precio anterior (oferta de la tienda o el de cuando se añadió) − el de hoy. */
  const ahorro = seleccionadas.reduce((n, i) => {
    const referencia = i.oldPriceXaf ?? (i.priceChanged ? i.addedPriceXaf : null);
    if (referencia === null || referencia === undefined || i.priceXaf === null) return n;
    return referencia > i.priceXaf ? n + (referencia - i.priceXaf) * i.quantity : n;
  }, 0);
  const disponibles = items.filter((i) => i.available);
  const todoMarcado = disponibles.length > 0 && disponibles.every((i) => sel.includes(i.id));

  /* ── Acciones ──────────────────────────────────────────────────────────────── */
  const cambiarCantidad = async (linea: LbLineaCarrito, cantidad: number) => {
    if (ocupado) return;
    setOcupado(linea.id);
    try { aplicar(await carritoApi.linea(linea.id, { quantity: cantidad })); }
    catch (e) { Alert.alert('Carrito', e instanceof Error ? e.message : 'No se pudo cambiar la cantidad'); }
    finally { setOcupado(null); }
  };

  const quitarLinea = async (linea: LbLineaCarrito) => {
    if (ocupado) return;
    setOcupado(linea.id);
    try { aplicar(await carritoApi.quitarLinea(linea.id)); }
    catch (e) { Alert.alert('Carrito', e instanceof Error ? e.message : 'No se pudo quitar'); }
    finally { setOcupado(null); }
  };

  const confirmarQuitar = (linea: LbLineaCarrito) => {
    Alert.alert('Quitar del carrito', `¿Quitar «${linea.title}»?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar', style: 'destructive', onPress: () => void quitarLinea(linea) },
    ]);
  };

  const abrirVariantes = async (linea: LbLineaCarrito) => {
    if (!linea.productId) return;
    setVarianteDe(linea);
    setVariantes(null);
    try {
      const { product } = await commerceApi.product(linea.productId);
      setVariantes((product?.variants ?? []) as LbProductVariant[]);
    } catch {
      setVariantes([]);
    }
  };

  const elegirVariante = async (linea: LbLineaCarrito, variantId: string | null) => {
    setVarianteDe(null);
    if (ocupado) return;
    setOcupado(linea.id);
    try { aplicar(await carritoApi.linea(linea.id, { variantId })); }
    catch (e) { Alert.alert('Carrito', e instanceof Error ? e.message : 'No se pudo cambiar la opción'); }
    finally { setOcupado(null); }
  };

  const menuLargo = (linea: LbLineaCarrito) => {
    const botones: { text: string; style?: 'cancel' | 'destructive'; onPress?: () => void }[] = [];
    if (linea.productId) {
      botones.push({ text: 'Mover a favoritos', onPress: () => void moverAFavoritos([linea]) });
      botones.push({ text: 'Ver el producto', onPress: () => irSeguro.libre('/lifebook-product/[id]', { id: linea.productId as string }) });
    }
    botones.push({ text: 'Eliminar', style: 'destructive', onPress: () => void quitarLinea(linea) });
    botones.push({ text: 'Cancelar', style: 'cancel' });
    // «Encontrar similar» NO está: la plataforma no tiene búsqueda por parecido (no nos lo inventamos).
    Alert.alert(linea.title, '¿Qué quieres hacer con este producto?', botones);
  };

  const moverAFavoritos = async (lineas: LbLineaCarrito[]) => {
    const ids = lineas.filter((l) => l.productId).map((l) => l.id);
    if (!ids.length) return;
    setOcupado('bloque');
    try {
      const r = await carritoApi.enBloque({ toFavorites: ids });
      aplicar(r);
      Alert.alert('Guardados', `Se ${ids.length === 1 ? 'ha' : 'han'} movido ${ids.length} producto${ids.length === 1 ? '' : 's'} a tus guardados.`);
    } catch (e) { Alert.alert('Carrito', e instanceof Error ? e.message : 'No se pudo mover'); }
    finally { setOcupado(null); }
  };

  const borrarSeleccion = () => {
    if (!sel.length) return;
    Alert.alert('Eliminar del carrito', `¿Quitar ${sel.length} producto${sel.length === 1 ? '' : 's'} del carrito?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive',
        onPress: async () => {
          setOcupado('bloque');
          try { aplicar(await carritoApi.enBloque({ remove: sel })); }
          catch (e) { Alert.alert('Carrito', e instanceof Error ? e.message : 'No se pudo eliminar'); }
          finally { setOcupado(null); }
        },
      },
    ]);
  };

  /* ── Pintado ───────────────────────────────────────────────────────────────── */
  const cabecera = (
    <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: alpha(colors.border, 0.5) }]}>
      <Pressable onPress={() => irSeguro.atras()} hitSlop={10} accessibilityLabel="Volver">
        <ArrowLeft size={20} color={colors.textPrimary} />
      </Pressable>
      <Text style={{ color: colors.textPrimary, fontWeight: '900', fontSize: 17, flex: 1, textAlign: 'center' }}>
        Carrito{carrito?.count ? ` (${carrito.count})` : ''}
      </Text>
      {items.length > 0 ? (
        <Pressable onPress={() => setEditando((v) => !v)} hitSlop={10} accessibilityLabel={editando ? 'Listo' : 'Editar'}>
          <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: '900' }}>{editando ? 'Listo' : 'Editar'}</Text>
        </Pressable>
      ) : (
        <View style={{ width: 44 }} />
      )}
    </View>
  );

  if (cargando) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {cabecera}
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {cabecera}
        <View style={styles.center}>
          <ShoppingCart size={46} color={alpha(colors.primary, 0.35)} />
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.subtitle, fontWeight: '900', marginTop: 12 }}>
            Tu carrito está vacío
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', paddingHorizontal: 44, marginTop: 6, lineHeight: 18 }}>
            Lo que añadas desde la ficha de un producto o desde el chat con una tienda aparece aquí,
            en tu cuenta: da igual desde qué móvil entres.
          </Text>
          <Pressable
            onPress={() => irSeguro.libre('/lifebook-catalog')}
            accessibilityLabel="Ir al mercado"
            style={[styles.ctaPagar, { backgroundColor: colors.primary, marginTop: 16, paddingHorizontal: 22 }]}
          >
            <Text style={{ color: brand.white, fontSize: 14.5, fontWeight: '900' }}>Ir al mercado</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const pieAltura = 132;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {cabecera}

      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: pieAltura + insets.bottom, gap: 12 }}>
        {grupos.map((g) => {
          const clave = g.shop?.id ?? 'sin-tienda';
          const idsBloque = g.items.filter((i) => i.available).map((i) => i.id);
          const marcadosBloque = idsBloque.filter((id) => sel.includes(id)).length;
          const estadoBloque: 'on' | 'off' | 'bloqueada' = !idsBloque.length
            ? 'bloqueada'
            : marcadosBloque === idsBloque.length ? 'on' : 'off';
          return (
            <View key={clave} style={[styles.bloque, { backgroundColor: colors.card, borderColor: alpha(colors.border, 0.6) }]}>
              {/* Cabecera de la tienda */}
              <View style={styles.cabeceraTienda}>
                <Casilla estado={estadoBloque} onPress={() => alternarGrupo(g)} etiqueta={`Seleccionar todo lo de ${g.shop?.name ?? 'esta tienda'}`} />
                {g.shop?.logoUrl ? (
                  <Image source={absUrl(g.shop.logoUrl)} style={styles.logoTienda} contentFit="cover" transition={0} />
                ) : (
                  <View style={[styles.logoTienda, { alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.primary, 0.1) }]}>
                    <Store size={14} color={alpha(colors.primary, 0.7)} />
                  </View>
                )}
                <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '900', flex: 1 }}>
                  {g.shop?.name ?? 'Tienda no disponible'}
                </Text>
                {g.shop ? (
                  <Pressable
                    onPress={() => irSeguro.libre('/lifebook-shop/[id]', { id: g.shop?.id as string })}
                    hitSlop={8}
                    accessibilityLabel={`Abrir la tienda ${g.shop.name}`}
                    style={{ flexDirection: 'row', alignItems: 'center' }}
                  >
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>Ver tienda</Text>
                    <ChevronRight size={14} color={colors.textSecondary} />
                  </Pressable>
                ) : null}
              </View>

              {/* Aviso de zona: la tienda no envía a donde vive el comprador. Se dice y se
                  ofrece lo único que sí se puede hacer (recoger), en vez de dejar comprar un
                  envío que no existe. */}
              {g.shippingWarning ? (
                <View style={[styles.avisoZona, { backgroundColor: alpha(brand.secondary, 0.12) }]}>
                  <Text style={{ color: brand.warning, fontSize: tipografia.micro, fontWeight: '800' }}>
                    🚚 {g.shippingWarning}
                  </Text>
                </View>
              ) : null}

              {/* Líneas */}
              {g.items.map((l) => {
                const marcada = sel.includes(l.id);
                const bloqueada = !l.available;
                const referencia = l.oldPriceXaf ?? (l.priceChanged ? l.addedPriceXaf : null);
                const tope = l.maxQuantity;
                const enTope = l.quantity >= tope;
                const fila = (
                  <View style={[styles.linea, { backgroundColor: colors.card, opacity: bloqueada ? 0.55 : 1 }]}>
                    <Casilla
                      estado={bloqueada ? 'bloqueada' : marcada ? 'on' : 'off'}
                      onPress={() => alternar(l.id)}
                      etiqueta={`Seleccionar ${l.title}`}
                    />
                    <Pressable
                      onPress={() => (l.productId ? irSeguro.libre('/lifebook-product/[id]', { id: l.productId }) : undefined)}
                      accessibilityLabel={`Abrir ${l.title}`}
                    >
                      {l.coverUrl ? (
                        <Image source={absUrl(l.coverUrl)} style={styles.foto} contentFit="cover" transition={0} />
                      ) : (
                        <View style={[styles.foto, { alignItems: 'center', justifyContent: 'center', backgroundColor: alpha(colors.primary, 0.08) }]}>
                          <ShoppingCart size={18} color={alpha(colors.primary, 0.5)} />
                        </View>
                      )}
                    </Pressable>

                    <View style={{ flex: 1, gap: 3 }}>
                      <Text numberOfLines={2} style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '800' }}>
                        {l.title}
                      </Text>

                      {/* Variante en píldora: se cambia sin salir del carrito */}
                      <Pressable
                        onPress={() => void abrirVariantes(l)}
                        disabled={!l.productId}
                        accessibilityLabel={l.variantName ? `Cambiar la opción ${l.variantName}` : 'Elegir una opción'}
                        style={[styles.pildora, { borderColor: alpha(colors.border, 0.9), backgroundColor: colors.surface }]}
                      >
                        <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: 10.5, fontWeight: '700' }}>
                          {l.variantName ?? 'Elegir opción'}
                        </Text>
                      </Pressable>

                      {/* Etiquetas de estado (solo las que de verdad aplican) */}
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                        {l.statusLabel ? (
                          <Text style={{ color: colors.danger, fontSize: 10.5, fontWeight: '900' }}>{l.statusLabel}</Text>
                        ) : null}
                        {l.priceChanged && l.available ? (
                          <Text style={{ color: brand.secondary, fontSize: 10.5, fontWeight: '900' }}>Precio cambió</Text>
                        ) : null}
                        {l.sourceKind === 'grupo' ? (
                          <Text style={{ color: colors.primary, fontSize: 10.5, fontWeight: '900' }}>
                            Precio del grupo{l.sourceLabel ? ` · ${l.sourceLabel}` : ''}
                          </Text>
                        ) : null}
                        {l.sourceKind === 'live' ? (
                          <Text style={{ color: '#E0439A', fontSize: 10.5, fontWeight: '900' }}>Precio de live</Text>
                        ) : null}
                        {l.maxQuantity <= l.quantity && l.available && l.maxQuantity < 99 ? (
                          <Text style={{ color: colors.textSecondary, fontSize: 10.5, fontWeight: '700' }}>
                            Solo quedan {l.maxQuantity}
                          </Text>
                        ) : null}
                      </View>

                      {/* Precio (rojo) con el anterior tachado si cambió */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={{ color: l.available ? colors.danger : colors.textSecondary, fontSize: 14.5, fontWeight: '900' }}>
                          {l.priceXaf === null ? 'A consultar' : lbXaf(l.priceXaf)}
                        </Text>
                        {referencia !== null && referencia !== undefined && l.priceXaf !== null && referencia !== l.priceXaf ? (
                          <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, textDecorationLine: 'line-through' }}>
                            {lbXaf(referencia)}
                          </Text>
                        ) : null}
                      </View>

                      {/* Cantidad */}
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 }}>
                        <Pressable
                          onPress={() => void cambiarCantidad(l, l.quantity - 1)}
                          disabled={l.quantity <= 1 || ocupado === l.id}
                          accessibilityLabel={`Quitar una unidad de ${l.title}`}
                          style={[styles.paso, {
                            borderColor: colors.border,
                            opacity: l.quantity <= 1 ? 0.35 : 1,
                          }]}
                        >
                          <Minus size={13} color={colors.textPrimary} />
                        </Pressable>
                        <Text style={{ color: colors.textPrimary, fontWeight: '900', fontSize: tipografia.body, minWidth: 22, textAlign: 'center' }}>
                          {ocupado === l.id ? '…' : l.quantity}
                        </Text>
                        <Pressable
                          onPress={() => void cambiarCantidad(l, l.quantity + 1)}
                          disabled={enTope || ocupado === l.id}
                          accessibilityLabel={`Añadir una unidad de ${l.title}`}
                          style={[styles.paso, {
                            borderColor: colors.border,
                            opacity: enTope ? 0.35 : 1,
                          }]}
                        >
                          <Plus size={13} color={colors.textPrimary} />
                        </Pressable>
                        {l.lineTotalXaf !== null && l.quantity > 1 ? (
                          <Text style={{ color: colors.textSecondary, fontSize: 10.5, marginLeft: 2 }}>
                            = {lbXaf(l.lineTotalXaf)}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <Pressable
                      onPress={() => confirmarQuitar(l)}
                      hitSlop={8}
                      accessibilityLabel={`Quitar ${l.title} del carrito`}
                      style={{ alignSelf: 'flex-start', padding: 4 }}
                    >
                      <X size={15} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                );

                // Deslizar a la izquierda = eliminar (atajo), y mantener pulsado = menú.
                return (
                  <Swipeable
                    key={l.id}
                    renderRightActions={() => (
                      <Pressable
                        onPress={() => void quitarLinea(l)}
                        accessibilityLabel={`Eliminar ${l.title}`}
                        style={[styles.accionDeslizar, { backgroundColor: colors.danger }]}
                      >
                        <Trash2 size={18} color={brand.white} />
                        <Text style={{ color: brand.white, fontSize: tipografia.micro, fontWeight: '900' }}>Eliminar</Text>
                      </Pressable>
                    )}
                  >
                    <Pressable onLongPress={() => menuLargo(l)} delayLongPress={450}>
                      {fila}
                    </Pressable>
                  </Swipeable>
                );
              })}

              <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: 8, textAlign: 'right' }}>
                {g.count} ud · {lbXaf(g.subtotalXaf)}
              </Text>
            </View>
          );
        })}

        {carrito?.hasOnRequest ? (
          <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: '700' }}>
            Hay productos «a consultar»: el total no es el definitivo. La tienda los presupuesta por el chat.
          </Text>
        ) : null}
        {carrito?.problems ? (
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 16 }}>
            {carrito.problems} producto{carrito.problems === 1 ? '' : 's'} no se puede
            {carrito.problems === 1 ? '' : 'n'} pagar ahora (agotado, retirado o eliminado). Se quedan
            en la lista y no cuentan en el total; los quitas cuando quieras.
          </Text>
        ) : null}
      </ScrollView>

      {/* ── Barra inferior fija ────────────────────────────────────────────────── */}
      <View style={[styles.pie, { backgroundColor: colors.background, borderTopColor: alpha(colors.border, 0.7), paddingBottom: insets.bottom + 10 }]}>
        {editando ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable
              onPress={marcarTodo}
              hitSlop={8}
              accessibilityLabel="Seleccionar todo"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Casilla estado={todoMarcado ? 'on' : 'off'} onPress={marcarTodo} etiqueta="Todo" />
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: '800' }}>Todo</Text>
            </Pressable>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={() => void moverAFavoritos(seleccionadas)}
              disabled={!sel.length || ocupado === 'bloque'}
              accessibilityLabel="Mover a favoritos"
              style={[styles.accionEditar, { borderColor: colors.primary, opacity: sel.length ? 1 : 0.4 }]}
            >
              <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: '900' }}>Mover a favoritos</Text>
            </Pressable>
            <Pressable
              onPress={borrarSeleccion}
              disabled={!sel.length || ocupado === 'bloque'}
              accessibilityLabel="Eliminar"
              style={[styles.accionEditar, { borderColor: colors.danger, opacity: sel.length ? 1 : 0.4 }]}
            >
              <Text style={{ color: colors.danger, fontSize: tipografia.body, fontWeight: '900' }}>
                Eliminar{sel.length ? ` (${sel.length})` : ''}
              </Text>
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable onPress={marcarTodo} hitSlop={8} accessibilityLabel="Seleccionar todo" style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Casilla estado={todoMarcado ? 'on' : 'off'} onPress={marcarTodo} etiqueta="Todo" />
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: '800' }}>Todo</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.danger, fontSize: 18, fontWeight: '900' }}>
                Total: {lbXaf(total)}
              </Text>
              {ahorro > 0 ? (
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: '700' }}>
                  Ahorras {lbXaf(ahorro)}
                </Text>
              ) : (
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro }}>
                  {unidades} unidad{unidades === 1 ? '' : 'es'} marcada{unidades === 1 ? '' : 's'}
                </Text>
              )}
            </View>
            <Pressable
              onPress={() => irSeguro.libre('/lifebook-carrito-checkout', { lineas: sel.join(',') })}
              disabled={!sel.length}
              accessibilityLabel={`Pagar ${unidades} productos`}
              style={[styles.ctaPagar, { backgroundColor: sel.length ? colors.primary : alpha(colors.textSecondary, 0.3) }]}
            >
              <Text style={{ color: brand.white, fontSize: 14.5, fontWeight: '900' }}>
                Pagar({unidades})
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* ── Hoja para cambiar la variante sin ir a la ficha ───────────────────── */}
      <Modal visible={!!varianteDe} transparent animationType="slide" onRequestClose={() => setVarianteDe(null)} statusBarTranslucent>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={() => setVarianteDe(null)} />
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: insets.bottom + 16 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 15.5, fontWeight: '900', marginBottom: 4 }}>
            Opción de «{varianteDe?.title}»
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginBottom: 10 }}>
            Cambiarla aquí no te saca del carrito. El precio se actualiza al de la opción que elijas.
          </Text>
          {variantes === null ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
          ) : (
            <View style={{ gap: 8 }}>
              {variantes.map((v) => {
                const activa = varianteDe?.variantId === v.id;
                const sinStock = v.stockQuantity !== null && v.stockQuantity !== undefined && v.stockQuantity <= 0;
                return (
                  <Pressable
                    key={v.id}
                    onPress={() => { if (varianteDe) void elegirVariante(varianteDe, String(v.id)); }}
                    disabled={sinStock}
                    accessibilityLabel={`Opción ${v.name}`}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radios.md, borderWidth: 1, padding: 10,
                      borderColor: activa ? colors.primary : alpha(colors.border, 0.7),
                      backgroundColor: activa ? alpha(colors.primary, 0.08) : colors.surface,
                      opacity: sinStock ? 0.45 : 1,
                    }}
                  >
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '800', flex: 1 }}>{v.name}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
                      {v.priceXaf === null ? 'A consultar' : lbXaf(v.priceXaf)}
                    </Text>
                    {sinStock ? <Text style={{ color: colors.danger, fontSize: tipografia.micro, fontWeight: '800' }}>Agotada</Text> : null}
                  </Pressable>
                );
              })}
              {variantes.length === 0 ? (
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', paddingVertical: 12 }}>
                  Este producto no tiene opciones.
                </Text>
              ) : null}
            </View>
          )}
          <Pressable onPress={() => setVarianteDe(null)} style={{ alignItems: 'center', paddingVertical: 12 }}>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, fontWeight: '800' }}>Cerrar</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  /** Área táctil real de la casilla: 44 dp, el mínimo que pide la plataforma. */
  toque: { width: altura.punto, height: altura.punto, alignItems: 'center', justifyContent: 'center' },
  /** El círculo VISIBLE. No se toca: sigue midiendo 21, que es lo que pide el diseño. */
  casilla: { width: 21, height: 21, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  bloque: { borderRadius: 14, borderWidth: 1, padding: 10, gap: 10 },
  cabeceraTienda: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  /** Aviso de «no llega a tu zona»: naranja, bajo la cabecera de la tienda. */
  avisoZona: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, marginTop: 6 },
  logoTienda: { width: 24, height: 24, borderRadius: radios.md },
  linea: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingVertical: 4 },
  foto: { width: 78, height: 78, borderRadius: 10 },
  pildora: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: radios.full, paddingHorizontal: 8, paddingVertical: 3, maxWidth: '100%' },
  paso: { width: 26, height: 26, borderRadius: radios.sm, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  accionDeslizar: { width: 78, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: radios.md, marginVertical: 4 },
  pie: { paddingHorizontal: 12, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  ctaPagar: { borderRadius: radios.full, paddingHorizontal: 16, paddingVertical: 11, alignItems: 'center', justifyContent: 'center' },
  accionEditar: { borderWidth: 1.5, borderRadius: radios.full, paddingHorizontal: 12, paddingVertical: 9 },
});
