/**
 * components/lifebook/SelectorDeVariante.tsx — «ELEGIR ANTES DE COMPRAR» (tandas K y L).
 *
 * EL PROBLEMA QUE CIERRA. Hasta la tanda K, pulsar «Comprar» o «Añadir al carrito» compraba DIRECTO
 * con la primera variante de la lista (`p.variants?.[0]`): nadie elegía talla ni color, y la ficha
 * solo podía enseñar la PALABRA «Talla 42». El dueño lo pidió así: «el paso de pulsar comprar o
 * agregar en el carrito ya no será directo, deberá primero seleccionar la talla, el color si es ropa
 * y así sucesivamente con otros productos, mostrando claramente el color de la prenda: no vale sólo
 * poner color, debe verse el producto de la foto real de este color».
 *
 * LO QUE HACE (según la especificación del panel):
 *   · Cabecera: miniatura de la combinación elegida (cambia sola), precio de ESA combinación —o el
 *     RANGO si hay precios distintos y aún no se ha elegido—, precio anterior tachado si hay
 *     descuento, y el stock («quedan pocas unidades» cuando es poco).
 *   · Un bloque por eje: colores con SU FOTO, tallas como botones, y cualquier otro eje (memoria,
 *     formato, tono…) con sus valores.
 *   · EL AGOTADO ES POR COMBINACIÓN, no por eje: «Blanco · M» puede estar agotada con «Blanco · L»
 *     disponible. Cada vez que se toca algo se recalculan todas las opciones; un color con TODAS sus
 *     tallas agotadas sale apagado entero.
 *   · Cantidad con el tope real de esa combinación (no un 99 inventado).
 *   · «¿No sabes tu talla?» → el asistente de medidas (tanda L) DENTRO del mismo panel.
 *   · Cierre con la X, tocando fuera o deslizando hacia abajo.
 *
 * LO QUE NO ES (a propósito): si un valor está agotado **no se puede seleccionar** (se ve apagado y
 * tachado). Para que eso no deje al comprador sin salida, al tocar un valor agotado se ofrece
 * **«avísame cuando llegue ESA combinación»** —que es lo que hace Taobao («缺货中，提醒掌柜补货»)—,
 * sin seleccionarla: el servidor apunta la espera por variante desde la tanda G.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Minus, Plus, X } from 'lucide-react-native';
import { alpha, brand, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { absUrl } from '../../api/config';
import { avisoStockApi, commerceApi, type LbOptionGroup, type LbProduct, type LbProductVariant, type LbSizeChart } from '../../api/commerce';
import { lbXaf } from '../../constants/lifebook';
import AsistenteDeTalla from './AsistenteDeTalla';

export interface Eleccion {
  variant: LbProductVariant | null;
  cantidad: number;
}

/** De qué botón se abrió: el panel pone ese como principal (el otro queda al lado). */
export type ModoSelector = 'carrito' | 'comprar';

export default function SelectorDeVariante({
  visible, product, modoInicial = 'comprar', seleccionInicial, busy, onClose, onCarrito, onComprar,
}: {
  visible: boolean;
  product: LbProduct;
  modoInicial?: ModoSelector;
  /** Lo que ya se había elegido en la ficha (si se vuelve a abrir, se mantiene). */
  seleccionInicial?: LbProductVariant | null;
  /** Mientras se añade o se abre la caja: los botones se apagan, no se duplican pedidos. */
  busy?: ModoSelector | null;
  onClose: () => void;
  onCarrito: (e: Eleccion) => void;
  onComprar: (e: Eleccion) => void;
}) {
  const { colors } = useTheme();
  const grupos = useMemo(
    () => (product.options ?? []).filter((g) => (g.values ?? []).length > 0),
    [product.options],
  );
  const variantes = useMemo(() => (product.variants ?? []).filter((v) => v.id), [product.variants]);
  const grupoTalla = useMemo(() => grupos.find((g) => g.kind === 'size') ?? null, [grupos]);

  /** Lo elegido, por código de eje: `{ color: 'Rojo', talla: 'M' }`. */
  const [sel, setSel] = useState<Record<string, string>>({});
  const [cant, setCant] = useState(1);
  /** Dentro del panel: elegir, o el asistente de talla (que NO es una pantalla nueva). */
  const [modo, setModo] = useState<'elegir' | 'talla'>('elegir');
  /** Las tablas del producto: sirven para saber si se puede ofrecer el asistente. */
  const [tablas, setTablas] = useState<LbSizeChart[]>([]);
  /** Valor agotado que se ha tocado (para ofrecer el aviso, sin seleccionarlo). */
  const [avisoPara, setAvisoPara] = useState<{ code: string; label: string; value: string } | null>(null);
  const [busyAviso, setBusyAviso] = useState(false);

  /**
   * Al abrir: NADA se elige por el comprador. Dos excepciones honestas: si la ficha ya tenía una
   * combinación elegida se mantiene, y si el producto tiene una única combinación se marca (no hay
   * nada que decidir). Elegir «la primera» por su cuenta es justo lo que había antes.
   */
  useEffect(() => {
    if (!visible) return;
    setCant(1);
    setModo('elegir');
    setAvisoPara(null);
    const deLaFicha = seleccionInicial?.id && variantes.some((v) => v.id === seleccionInicial.id) ? seleccionInicial : null;
    const unica = variantes.length === 1 ? variantes[0] : null;
    const base = deLaFicha ?? unica;
    setSel(base
      ? Object.fromEntries(grupos.map((g) => [g.code, String(base.attributes?.[g.code] ?? '')]).filter(([, v]) => v))
      : {});
    if ((product.options ?? []).some((g) => g.kind === 'size')) {
      commerceApi.sizeChart(product.id)
        .then((r) => setTablas(r.charts ?? []))
        .catch(() => setTablas([]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, product.id]);

  const conStock = (v: LbProductVariant | undefined): boolean => {
    if (!v) return false;
    if (product.stockMode !== 'exact') return true;
    return Number(v.stockQuantity ?? 0) > 0;
  };

  const varianteDe = (eleccion: Record<string, string>): LbProductVariant | null => {
    if (!grupos.length) return variantes[0] ?? null;
    return variantes.find((v) => grupos.every((g) => (
      String(v.attributes?.[g.code] ?? '').trim().toLowerCase() === String(eleccion[g.code] ?? '').trim().toLowerCase()
    ))) ?? null;
  };

  /**
   * ¿EXISTE la combinación con ese valor? (aunque esté agotada) y ¿tiene stock AHORA?
   *
   * Se miran SOLO los ejes ya elegidos, como en Taobao: al tocar «Blanco», las tallas se recalculan
   * y las que no tengan stock para blanco se apagan; al cambiar a «Rojo» se liberan otras.
   */
  const combosCon = (code: string, value: string) => {
    const cand = { ...sel, [code]: value };
    const codigos = grupos.map((g) => g.code).filter((c) => cand[c]);
    return variantes.filter((v) => codigos.every((c) => (
      String(v.attributes?.[c] ?? '').trim().toLowerCase() === String(cand[c]).trim().toLowerCase()
    )));
  };
  const existeCombo = (code: string, value: string) => !variantes.length || combosCon(code, value).length > 0;
  const disponible = (code: string, value: string) => !variantes.length || combosCon(code, value).some(conStock);

  const faltan = grupos.filter((g) => !sel[g.code]).map((g) => g.label);
  const eleccionCompleta = faltan.length === 0;
  const elegida = eleccionCompleta ? varianteDe(sel) : null;
  /** La combinación elegida existe pero ahora mismo no tiene stock. */
  const agotada = eleccionCompleta && !!elegida && !conStock(elegida);

  /**
   * El precio: el de la combinación elegida; si hay precios distintos entre combinaciones y aún no
   * se ha elegido nada, el RANGO (como pide la especificación); si no, el del producto.
   */
  const precios = useMemo(() => {
    const lista = variantes.map((v) => (v.priceXaf ?? product.priceXaf)).filter((n): n is number => typeof n === 'number' && n > 0);
    return [...new Set(lista)].sort((a, b) => a - b);
  }, [variantes, product.priceXaf]);
  const precioElegido = elegida?.priceXaf ?? null;
  const precioTexto = precioElegido !== null
    ? lbXaf(precioElegido)
    : (!eleccionCompleta && precios.length > 1)
      ? `${lbXaf(precios[0])} – ${lbXaf(precios[precios.length - 1])}`
      : (product.priceXaf !== null && product.priceXaf !== undefined ? lbXaf(product.priceXaf) : 'A consultar');
  /** El precio anterior SOLO si de verdad es mayor que el que se enseña (si no, sería mentira). */
  const precioAntiguo = useMemo(() => {
    const viejo = product.oldPriceXaf ?? null;
    if (!viejo) return null;
    const actual = precioElegido ?? (precios.length ? precios[0] : product.priceXaf) ?? 0;
    return viejo > actual ? viejo : null;
  }, [product.oldPriceXaf, precioElegido, precios, product.priceXaf]);

  const tope = product.stockMode === 'exact'
    ? Math.max(0, elegida ? Number(elegida.stockQuantity ?? 0) : Number(product.stockQuantity ?? 0))
    : 99;
  const pocoStock = product.stockMode === 'exact' && tope > 0 && tope < 10;
  const stockTexto = agotada
    ? 'Agotada en esa combinación'
    : product.stockMode === 'on_request'
      ? 'Bajo pedido'
      : product.stockMode !== 'exact'
        ? 'Disponible'
        : tope > 0
          ? (pocoStock ? `Quedan pocas unidades (${tope})` : `Stock: ${tope}`)
          : 'Sin stock';

  /** La foto que se enseña: la de la combinación elegida; si no, la del color elegido; si no, la 1ª. */
  const foto = useMemo(() => {
    if (elegida?.imageUrl) return absUrl(elegida.imageUrl);
    for (const g of grupos) {
      if (g.kind !== 'color') continue;
      const v = (g.values ?? []).find((x) => x.value === sel[g.code]);
      if (v?.imageUrl) return absUrl(v.imageUrl);
    }
    const primera = (product.media ?? []).find((m) => m.type !== 'video');
    return primera ? absUrl(primera.url) : null;
  }, [elegida, grupos, sel, product.media]);

  const resumen = grupos.filter((g) => sel[g.code]).map((g) => `${g.label}: ${sel[g.code]}`).join(' · ');
  const puedeConfirmar = !busy && (!grupos.length || (eleccionCompleta && !agotada)) && tope > 0;

  /** ¿Se puede ofrecer el asistente? Solo si hay un eje de tallas Y la tienda tiene tabla para él. */
  const tablaDelGrupo = useMemo(() => {
    const tipo = grupoTalla?.chartKind ?? null;
    if (!tipo) return null;
    return tablas.find((c) => c.kind === tipo) ?? null;
  }, [tablas, grupoTalla]);

  /**
   * AVISO DE REPOSICIÓN DE UNA COMBINACIÓN AGOTADA.
   *
   * El valor agotado NO se selecciona (la especificación lo pide así), pero tampoco se queda en un
   * callejón: al tocarlo se ofrece avisar cuando vuelva ESA combinación. El servidor ya lo apunta por
   * variante, así que quien espera la «Blanco · M» recibe el aviso de esa y no de otra talla.
   */
  const pedirAviso = async (code: string, value: string) => {
    if (busyAviso) return;
    const objetivo = varianteDe({ ...sel, [code]: value });
    if (!objetivo?.id) return;
    setBusyAviso(true);
    try {
      const r = await avisoStockApi.vigilar(product.id, objetivo.id);
      Alert.alert(
        r.watching ? 'Te avisamos' : 'Ya está disponible',
        r.mensaje ?? (r.watching
          ? `Te avisaremos por el chat cuando vuelva la «${objetivo.name}».`
          : 'Parece que ya se puede comprar.'),
      );
      setAvisoPara(null);
    } catch (e) {
      Alert.alert('Aviso de reposición', e instanceof Error ? e.message : 'No se pudo completar');
    } finally {
      setBusyAviso(false);
    }
  };

  /**
   * CIERRE DESLIZANDO HACIA ABAJO (además de la X y de tocar fuera).
   *
   * El `Modal` de React Native no trae «arrastrar para cerrar», así que se pone un tirador arriba con
   * su propio `PanResponder`: deslizar hacia abajo más de 70 dp cierra. Va SOLO en el tirador para no
   * pelearse con el scroll de las opciones.
   */
  const dragY = useRef(0);
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_e, g) => { dragY.current = Math.max(0, g.dy); },
    onPanResponderRelease: (_e, g) => {
      if (g.dy > 70) onClose();
      dragY.current = 0;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [onClose]);

  /** Un bloque de eje (color con foto, o valores como botones). */
  const Eje = ({ g }: { g: LbOptionGroup }) => (
    <View style={{ marginTop: espaciado.e14 }}>
      <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo, marginBottom: espaciado.e7 }}>
        {g.label}{sel[g.code] ? <Text style={{ color: colors.textSecondary, fontWeight: peso.medio }}>{`  ${sel[g.code]}`}</Text> : null}
      </Text>
      <View style={styles.valores}>
        {(g.values ?? []).map((v) => {
          const activo = sel[g.code] === v.value;
          const existe = existeCombo(g.code, v.value);
          const libre = existe && disponible(g.code, v.value);
          /**
           * AGOTADO = existe la combinación pero no hay stock. NO se puede seleccionar (se ve apagado
           * y tachado), pero sí tocar para pedir el aviso de reposición.
           */
          const agotadoAqui = existe && !libre;
          const etiqueta = `${g.label} ${v.value}${!existe ? ' (no disponible)' : agotadoAqui ? ' (agotado)' : ''}`;
          const onPress = () => {
            if (libre) { setSel((p) => ({ ...p, [g.code]: v.value })); setAvisoPara(null); return; }
            if (agotadoAqui) setAvisoPara({ code: g.code, label: g.label, value: v.value });
          };
          if (g.kind === 'color') {
            return (
              <Pressable
                key={v.value}
                onPress={onPress}
                accessibilityLabel={etiqueta}
                accessibilityState={{ selected: activo, disabled: !libre }}
                style={[styles.colorCaja, {
                  borderColor: activo ? colors.primary : alpha(colors.border, 0.9),
                  borderWidth: activo ? 2 : 1,
                  backgroundColor: activo ? alpha(colors.primary, 0.08) : 'transparent',
                  opacity: libre ? 1 : 0.45,
                }]}
              >
                {/* LA FOTO REAL del producto en ese color: no un cuadradito de color. */}
                {v.imageUrl ? (
                  <Image source={absUrl(v.imageUrl)} style={styles.colorImg} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                ) : (
                  <View style={[styles.colorImg, { backgroundColor: alpha(colors.border, 0.4), alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: tipografia.minimo, color: colors.textSecondary }}>sin foto</Text>
                  </View>
                )}
                <Text numberOfLines={1} style={{ color: activo ? colors.primary : colors.textPrimary, fontSize: tipografia.micro, fontWeight: peso.fuerte, marginTop: espaciado.e4, maxWidth: 68, textAlign: 'center' }}>
                  {v.value}
                </Text>
                {agotadoAqui ? <Text style={{ color: colors.danger, fontSize: tipografia.minimo, fontWeight: peso.maximo }}>agotado</Text> : null}
              </Pressable>
            );
          }
          return (
            <Pressable
              key={v.value}
              onPress={onPress}
              accessibilityLabel={etiqueta}
              accessibilityState={{ selected: activo, disabled: !libre }}
              style={[styles.chip, {
                borderColor: activo ? colors.primary : alpha(colors.border, 0.9),
                backgroundColor: activo ? alpha(colors.primary, 0.1) : 'transparent',
                opacity: libre ? 1 : 0.45,
              }]}
            >
              <Text style={{
                color: activo ? colors.primary : colors.textPrimary,
                fontSize: tipografia.caption, fontWeight: peso.fuerte,
                textDecorationLine: libre ? 'none' : 'line-through',
              }}>
                {v.value}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* El enlace del asistente, solo si la tienda tiene tabla para ese tipo de prenda. */}
      {g.code === grupoTalla?.code && tablaDelGrupo ? (
        <Pressable onPress={() => setModo('talla')} accessibilityLabel="No sé mi talla" style={{ marginTop: espaciado.e8 }}>
          <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>¿No sabes tu talla?</Text>
        </Pressable>
      ) : null}

      {/* «Avísame cuando llegue» de la combinación agotada que se ha tocado. */}
      {avisoPara?.code === g.code ? (
        <View style={[styles.aviso, { borderColor: alpha(colors.primary, 0.5), backgroundColor: alpha(colors.primary, 0.06) }]}>
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, flex: 1 }}>
            «{avisoPara.value}» agotada. ¿Te avisamos?
          </Text>
          <Pressable onPress={() => { void pedirAviso(avisoPara.code, avisoPara.value); }} disabled={busyAviso} accessibilityLabel="Sí, avisadme">
            {busyAviso ? <ActivityIndicator size="small" color={colors.primary} /> : (
              <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.titulo }}>Avisadme</Text>
            )}
          </Pressable>
          <Pressable onPress={() => setAvisoPara(null)} hitSlop={8} accessibilityLabel="No, gracias">
            <X size={14} color={colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  const principal: ModoSelector = modoInicial;
  const secundario: ModoSelector = modoInicial === 'carrito' ? 'comprar' : 'carrito';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Cerrar el selector">
        <Pressable style={[styles.sheet, { backgroundColor: colors.background }]} onPress={() => { /* dentro no se cierra */ }}>
          {/* Tirador: deslizar hacia abajo cierra (el Modal de RN no lo trae). */}
          <View {...pan.panHandlers} style={styles.tiradorZona} accessibilityLabel="Desliza hacia abajo para cerrar">
            <View style={[styles.tirador, { backgroundColor: alpha(colors.textSecondary, 0.4) }]} />
          </View>

          {/* ── Cabecera: la foto de lo elegido, su precio y su stock ── */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            {foto ? (
              <Image source={foto} style={[styles.foto, { borderColor: alpha(colors.border, 0.8) }]} contentFit="cover" cachePolicy="memory-disk" transition={0} />
            ) : (
              <View style={[styles.foto, { borderColor: alpha(colors.border, 0.8), backgroundColor: alpha(colors.primary, 0.1), alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ fontSize: 26 }}>📦</Text>
              </View>
            )}
            <View style={{ flex: 1, marginLeft: espaciado.e12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: espaciado.e8 }}>
                <Text numberOfLines={1} style={{ color: colors.primary, fontSize: tipografia.cifra, fontWeight: peso.titulo, flexShrink: 1 }}>
                  {precioTexto}
                </Text>
                {precioAntiguo ? (
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textDecorationLine: 'line-through', marginBottom: espaciado.e2 }}>
                    {lbXaf(precioAntiguo)}
                  </Text>
                ) : null}
              </View>
              <Text numberOfLines={2} style={{ color: colors.textPrimary, fontSize: tipografia.caption, marginTop: espaciado.e3, lineHeight: 17 }}>
                {resumen}
              </Text>
              <Text style={{ color: agotada ? colors.danger : colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e4 }}>
                {stockTexto}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
              <X size={19} color={colors.textSecondary} />
            </Pressable>
          </View>

          {modo === 'talla' && grupoTalla ? (
            <View style={{ marginTop: espaciado.e10 }}>
              <Pressable onPress={() => setModo('elegir')} accessibilityLabel="Volver a las opciones" style={{ marginBottom: espaciado.e8 }}>
                <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>← Volver a las opciones</Text>
              </Pressable>
              <AsistenteDeTalla
                product={product}
                grupo={grupoTalla}
                tablas={tablas}
                onUsarTalla={(talla) => {
                  setSel((p) => ({ ...p, [grupoTalla.code]: talla }));
                  setModo('elegir');
                }}
              />
            </View>
          ) : (
            <>
              <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
                {grupos.map((g) => <Eje key={g.code} g={g} />)}

                {/* ── Cantidad, con el tope real ── */}
                <View style={{ marginTop: espaciado.e16, flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>Cantidad</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e2 }}>
                      {product.stockMode === 'exact' ? `Máx. ${tope || 0}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.stepper, { borderColor: alpha(colors.border, 0.9) }]}>
                    <Pressable
                      onPress={() => setCant((c) => Math.max(1, c - 1))}
                      disabled={cant <= 1}
                      accessibilityLabel="Quitar una unidad"
                      style={styles.stepBtn}
                    >
                      <Minus size={16} color={cant <= 1 ? alpha(colors.textSecondary, 0.5) : colors.textPrimary} />
                    </Pressable>
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo, minWidth: 30, textAlign: 'center' }}>{cant}</Text>
                    <Pressable
                      onPress={() => setCant((c) => Math.min(tope || 1, c + 1))}
                      disabled={cant >= (tope || 1)}
                      accessibilityLabel="Añadir una unidad"
                      style={styles.stepBtn}
                    >
                      <Plus size={16} color={cant >= (tope || 1) ? alpha(colors.textSecondary, 0.5) : colors.textPrimary} />
                    </Pressable>
                  </View>
                </View>

                {faltan.length ? (
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e10 }}>
                    Elige: {faltan.join(' · ')}
                  </Text>
                ) : null}
              </ScrollView>

              {/* ── Los botones: el de la acción con la que se abrió, en grande ── */}
              <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e14 }}>
                <Pressable
                  onPress={() => (secundario === 'carrito'
                    ? onCarrito({ variant: elegida, cantidad: cant })
                    : onComprar({ variant: elegida, cantidad: cant }))}
                  disabled={!puedeConfirmar}
                  accessibilityLabel={secundario === 'carrito' ? 'Añadir al carrito' : 'Comprar now'}
                  style={[styles.secBtn, { borderColor: colors.primary, opacity: puedeConfirmar ? 1 : 0.45 }]}
                >
                  {busy === secundario ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <Text numberOfLines={1} style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.titulo }}>
                      {secundario === 'carrito' ? 'Al carrito' : 'Comprar now'}
                    </Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => (principal === 'carrito'
                    ? onCarrito({ variant: elegida, cantidad: cant })
                    : onComprar({ variant: elegida, cantidad: cant }))}
                  disabled={!puedeConfirmar}
                  accessibilityLabel={principal === 'carrito' ? 'Añadir al carrito' : 'Comprar now'}
                  style={[styles.priBtn, { backgroundColor: puedeConfirmar ? colors.primary : alpha(colors.primary, 0.4) }]}
                >
                  {busy === principal ? (
                    <ActivityIndicator size="small" color={brand.white} />
                  ) : (
                    <Text numberOfLines={1} style={{ color: brand.white, fontSize: tipografia.body, fontWeight: peso.titulo }}>
                      {principal === 'carrito' ? 'Añadir al carrito' : 'Comprar now'}
                    </Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: espaciado.e16, paddingBottom: espaciado.e24 },
  tiradorZona: { paddingVertical: espaciado.e8, alignItems: 'center' },
  tirador: { width: 44, height: 4, borderRadius: radios.pista },
  foto: { width: 92, height: 92, borderRadius: radios.md, borderWidth: trazo.fino, overflow: 'hidden' },
  valores: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e9 },
  colorCaja: { alignItems: 'center', borderRadius: radios.md, padding: espaciado.e5 },
  colorImg: { width: 58, height: 58, borderRadius: radios.hermano },
  chip: { borderWidth: trazo.fino, borderRadius: 10, paddingHorizontal: espaciado.e13, minHeight: 44, minWidth: 46, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: trazo.fino, borderRadius: 10, paddingHorizontal: espaciado.e4, minHeight: 44 },
  stepBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, borderWidth: trazo.fino, borderRadius: 10, padding: espaciado.e9, marginTop: espaciado.e8 },
  secBtn: { flex: 1, height: 46, borderRadius: radios.md, borderWidth: trazo.base, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e8 },
  priBtn: { flex: 1.4, height: 46, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e10 },
});
