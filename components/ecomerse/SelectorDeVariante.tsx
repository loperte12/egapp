/**
 * components/ecomerse/SelectorDeVariante.tsx — ELEGIR LA COMBINACIÓN ANTES DE COMPRAR (fase 4).
 *
 * EL PROBLEMA QUE CIERRA. Hasta la fase 4, en el Mercado «Comprar» y «Añadir» compraban el anuncio
 * ENTERO: no existía nada que elegir. El formulario del vendedor pedía «talla» y «color» como texto
 * libre y los guardaba en `attributes`, donde no los leía nadie. Con combinaciones en el servidor,
 * comprar sin elegir ya no es una posibilidad: el pedido se rechaza. Esta hoja es el paso que
 * faltaba entre «quiero esto» y «el pedido».
 *
 * ES UN PORTE DEL SELECTOR DE LIFE BOOK (`components/lifebook/SelectorDeVariante.tsx`), y lo es a
 * propósito: los dos mercados comparten las REGLAS del SKU (módulo `opciones-producto.ts` del
 * servidor), así que la forma de los ejes es la misma y las dos fichas tienen que comportarse igual
 * ante el mismo dato. Si un día se cambia una regla de elección, se cambia en los dos sitios.
 *
 * LO QUE **NO** SE PORTA, porque el Mercado no lo tiene (y no se inventa):
 *   · **Nada de «bajo pedido»**: en el Mercado cada combinación tiene su número exacto de unidades.
 *     Life Book tiene modos de stock (`exact` / `on_request` / …); aquí no hay tal cosa.
 *   · **Nada de precio anterior tachado**: el anuncio del Mercado no guarda precio antiguo.
 *   · **Nada de asistente de talla**: eso vive en las tablas de medidas de Life Book y el Mercado no
 *     tiene tablas.
 *   · **Nada de «avísame cuando llegue»**: el endpoint de aviso por combinación es de Life Book. Sin
 *     él, un valor que no se puede elegir no se queda en un callejón: al tocarlo, la hoja **dice por
 *     qué** («no existe» o «agotado») y se puede seguir eligiendo el otro eje.
 *   · **Nada de estado «ocupado»**: en el Mercado el carrito es local y comprar es navegar, así que
 *     no hay ninguna llamada lenta que bloquear y un «cargando» sería decorativo.
 *
 * Y una diferencia de forma deliberada: la hoja la pinta **`Sheet`** del kit, no un `<Modal>` a
 * mano como el de Life Book. Se hereda el fondo, el cierre al tocar fuera, el **botón físico de
 * atrás**, el foco encerrado dentro del diálogo y el tope de altura. Se pierde el «deslizar hacia
 * abajo para cerrar», que es lo que cuesta el `<Modal>` propio — y no compensa: el `Sheet` documenta
 * que 51 ficheros escribiendo su propio modal es justo el problema que existe para no repetir.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { Minus, Plus } from 'lucide-react-native';
import {
  alpha, altura, brand, espaciado, icono, ilustracion, peso, Precio, radios, Sheet, tipografia, trazo, useTheme,
} from '@egrouteplan/ui-kit';
import type { EcomerseOptionGroup, EcomerseProduct, EcomerseProductVariant } from '../../api/ecomerse';
import { formatXAF } from '../../utils/formatHelpers';

export interface Eleccion {
  variant: EcomerseProductVariant | null;
  cantidad: number;
}

/** De qué botón se abrió: ese queda como principal en la hoja y el otro al lado. */
export type ModoSelector = 'carrito' | 'comprar';

/** Compara valores de eje sin depender de mayúsculas ni de espacios sobrantes. */
const norm = (v: unknown): string => String(v ?? '').trim().toLowerCase();

export default function SelectorDeVariante({
  visible, product, modoInicial = 'comprar', seleccionInicial, onClose, onCarrito, onComprar,
}: {
  visible: boolean;
  product: EcomerseProduct;
  modoInicial?: ModoSelector;
  /** Lo que ya se había elegido en la ficha: al volver a abrir, se mantiene. */
  seleccionInicial?: EcomerseProductVariant | null;
  onClose: () => void;
  onCarrito: (e: Eleccion) => void;
  onComprar: (e: Eleccion) => void;
}) {
  const { colors } = useTheme();
  /**
   * EL ALTO DE LA LISTA, Y POR QUÉ SE CALCULA.
   *
   * `Sheet` topa la hoja al **80 % de la pantalla** (`hojaAbajo.maxHeight`), pero el tope es del
   * `Sheet`, no de lo de dentro: si el contenido pide más, **desborda** y lo que cae fuera se pierde.
   * Medido en el emulador (640 dp de alto): con la lista a 300 dp los dos botones acabaron en
   * `[42,1231][303,1232]`, o sea **fuera de la pantalla** y sin forma de confirmar la compra.
   *
   * El cromo que va FUERA de la lista (y que por tanto hay que descontar) es fijo y medido:
   * relleno de la hoja 20+22, título 24, margen 14, cabecera 104 (foto de 92 o la columna de texto,
   * lo que sea mayor), dos huecos de 10 y los botones 46 → **250 dp**. Se presupuestan 270 para dejar
   * margen a un `font_scale` alto. Comprobado en el aparato: con este presupuesto, en el emulador
   * (640 dp) los botones quedaron en `y 1096..1188`, dentro de la pantalla; antes, en `y 1231`.
   *
   * El título del producto va DENTRO de la cabecera con `numberOfLines={1}` a propósito: si fuera el
   * `subtitle` del `Sheet`, un nombre largo envolvería a dos o tres líneas y volvería a empujar los
   * botones fuera — que es exactamente el defecto que esto arregla.
   */
  const { height: altoPantalla } = useWindowDimensions();
  const altoLista = Math.max(140, Math.round(altoPantalla * 0.8) - 270);
  const grupos = useMemo(
    () => (product.options ?? []).filter((g) => (g.values ?? []).length > 0),
    [product.options],
  );
  const variantes = useMemo(() => (product.variants ?? []).filter((v) => v.id), [product.variants]);

  /** Lo elegido, por código de eje: `{ color: 'Rojo', talla: 'M' }`. */
  const [sel, setSel] = useState<Record<string, string>>({});
  const [cant, setCant] = useState(1);
  /** Valor que NO se puede elegir y que se acaba de tocar, para explicar por qué. */
  const [nota, setNota] = useState<{ code: string; value: string; agotado: boolean } | null>(null);

  /**
   * Al abrir: **nada se elige por el comprador**. Dos excepciones honestas: si la ficha ya tenía una
   * combinación elegida se mantiene, y si el anuncio tiene UNA sola combinación se marca (no hay
   * nada que decidir). Elegir «la primera» por su cuenta es exactamente el defecto que esta hoja
   * existe para cerrar.
   */
  useEffect(() => {
    if (!visible) return;
    setCant(1);
    setNota(null);
    const deLaFicha = seleccionInicial?.id && variantes.some((v) => v.id === seleccionInicial.id)
      ? seleccionInicial : null;
    const unica = variantes.length === 1 ? variantes[0] : null;
    const base = deLaFicha ?? unica;
    setSel(base
      ? Object.fromEntries(
        grupos.map((g) => [g.code, String(base.attributes?.[g.code] ?? '')]).filter(([, v]) => v),
      )
      : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, product.id]);

  /** ¿Le quedan unidades? En el Mercado el stock de una combinación es siempre un número. */
  const conStock = (v: EcomerseProductVariant | undefined): boolean =>
    !!v && Number(v.stockQuantity ?? 0) > 0;

  /** La combinación que corresponde a una elección completa. */
  const varianteDe = (eleccion: Record<string, string>): EcomerseProductVariant | null => {
    if (!grupos.length) return variantes[0] ?? null;
    return variantes.find((v) => grupos.every((g) => norm(v.attributes?.[g.code]) === norm(eleccion[g.code]))) ?? null;
  };

  /**
   * ¿EXISTE la combinación con ese valor? (aunque esté agotada) y ¿tiene unidades AHORA?
   *
   * Se miran SOLO los ejes ya elegidos, que es como funciona en todas partes: al tocar «Blanco», las
   * tallas se recalculan y las que no existan para blanco se apagan; al cambiar a «Rojo» se liberan
   * otras. Si se miraran todos los ejes, ningún valor se podría elegir nunca.
   */
  const combosCon = (code: string, value: string) => {
    const cand = { ...sel, [code]: value };
    const codigos = grupos.map((g) => g.code).filter((c) => cand[c]);
    return variantes.filter((v) => codigos.every((c) => norm(v.attributes?.[c]) === norm(cand[c])));
  };
  const existeCombo = (code: string, value: string) => !variantes.length || combosCon(code, value).length > 0;
  const disponible = (code: string, value: string) => !variantes.length || combosCon(code, value).some(conStock);

  const faltan = grupos.filter((g) => !sel[g.code]).map((g) => g.label);
  const eleccionCompleta = faltan.length === 0;
  const elegida = eleccionCompleta ? varianteDe(sel) : null;
  /** La combinación existe pero ahora mismo no tiene unidades. */
  const agotada = eleccionCompleta && !!elegida && !conStock(elegida);

  /**
   * El precio: el de la combinación elegida; si hay precios distintos entre combinaciones y todavía
   * no se ha elegido nada, el RANGO (que es lo honesto: el anuncio no tiene un precio único); si no,
   * el del anuncio.
   */
  const precios = useMemo(() => {
    const lista = variantes
      .map((v) => (v.priceXaf ?? product.priceXaf))
      .filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
    return [...new Set(lista)].sort((a, b) => a - b);
  }, [variantes, product.priceXaf]);
  const precioElegido = elegida?.priceXaf ?? null;
  const hayRango = !eleccionCompleta && precios.length > 1;
  const precioSuelto = Number.isFinite(product.priceXaf) ? product.priceXaf : null;

  const tope = elegida ? Number(elegida.stockQuantity ?? 0) : Number(product.stock ?? 0);
  /** Al cambiar de combinación la cantidad tiene que caber en la nueva: solo se recorta, nunca sube. */
  useEffect(() => {
    setCant((c) => Math.min(c, Math.max(1, tope)));
  }, [tope]);
  const pocoStock = tope > 0 && tope < 10;
  const stockTexto = agotada
    ? 'Agotada en esa combinación'
    : tope > 0
      ? (pocoStock ? `Quedan pocas unidades (${tope})` : `Stock: ${tope}`)
      : 'Sin stock';

  /**
   * La foto que se enseña: la de la combinación elegida; si no, la del color elegido; si no, la
   * primera del anuncio. Las dos primeras son URLs del **mismo saco** que `photos` (el servidor
   * exige que la foto de un color sea una de las fotos del anuncio), así que se usan tal cual, sin
   * recomponer la ruta.
   */
  const foto = useMemo(() => {
    if (elegida?.imageUrl) return elegida.imageUrl;
    for (const g of grupos) {
      if (g.kind !== 'color') continue;
      const v = (g.values ?? []).find((x) => x.value === sel[g.code]);
      if (v?.imageUrl) return v.imageUrl;
    }
    return (product.photos ?? [])[0] ?? null;
  }, [elegida, grupos, sel, product.photos]);

  const resumen = grupos.filter((g) => sel[g.code]).map((g) => `${g.label}: ${sel[g.code]}`).join(' · ');
  const puedeConfirmar = eleccionCompleta && !agotada && tope > 0;

  const principal: ModoSelector = modoInicial;
  const secundario: ModoSelector = modoInicial === 'carrito' ? 'comprar' : 'carrito';
  const confirmar = (modo: ModoSelector) => (modo === 'carrito'
    ? onCarrito({ variant: elegida, cantidad: cant })
    : onComprar({ variant: elegida, cantidad: cant }));

  /** Un bloque de eje: color con SU foto, o valores como botones. */
  const Eje = ({ g }: { g: EcomerseOptionGroup }) => (
    <View style={{ marginTop: espaciado.e12 }}>
      <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.fuerte, marginBottom: espaciado.e4 }}>
        {g.label}
        {sel[g.code]
          ? <Text style={{ color: colors.textSecondary, fontWeight: peso.medio }}>{`  ${sel[g.code]}`}</Text>
          : null}
      </Text>
      <View style={estilos.valores}>
        {(g.values ?? []).map((v) => {
          const activo = sel[g.code] === v.value;
          const existe = existeCombo(g.code, v.value);
          /**
           * AGOTADO = la combinación existe pero no tiene unidades. NO se puede elegir (se ve apagado
           * y tachado), pero sí tocar para que la hoja explique por qué.
           */
          const agotadoAqui = existe && !disponible(g.code, v.value);
          const libre = existe && !agotadoAqui;
          const etiqueta = `${g.label} ${v.value}${!existe ? ' (no disponible)' : agotadoAqui ? ' (agotado)' : ''}`;
          const onPress = () => {
            if (libre) { setSel((p) => ({ ...p, [g.code]: v.value })); setNota(null); return; }
            setNota({ code: g.code, value: v.value, agotado: agotadoAqui });
          };
          if (g.kind === 'color') {
            return (
              <Pressable
                key={v.value}
                onPress={onPress}
                accessibilityLabel={etiqueta}
                accessibilityState={{ selected: activo, disabled: !libre }}
                style={[estilos.colorCaja, {
                  borderColor: activo ? colors.primary : alpha(colors.border, 0.9),
                  borderWidth: activo ? trazo.fuerte : trazo.fino,
                  backgroundColor: activo ? alpha(colors.primary, 0.08) : 'transparent',
                  opacity: libre ? 1 : 0.45,
                }]}
              >
                {/* LA FOTO REAL del anuncio en ese color: no un cuadradito de color. */}
                {v.imageUrl ? (
                  <Image
                    source={v.imageUrl}
                    style={estilos.colorImg}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={0}
                  />
                ) : (
                  <View style={[estilos.colorImg, estilos.sinFoto, { backgroundColor: alpha(colors.border, 0.4) }]}>
                    <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>sin foto</Text>
                  </View>
                )}
                <Text numberOfLines={1} style={{
                  color: activo ? colors.primary : colors.textPrimary,
                  fontSize: tipografia.micro, fontWeight: peso.fuerte,
                  marginTop: espaciado.e4, maxWidth: 68, textAlign: 'center',
                }}>
                  {v.value}
                </Text>
                {agotadoAqui ? (
                  <Text style={{ color: colors.danger, fontSize: tipografia.micro, fontWeight: peso.fuerte }}>agotado</Text>
                ) : null}
              </Pressable>
            );
          }
          return (
            <Pressable
              key={v.value}
              onPress={onPress}
              accessibilityLabel={etiqueta}
              accessibilityState={{ selected: activo, disabled: !libre }}
              style={[estilos.chip, {
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

      {/* Por qué un valor no se deja elegir. Sustituye al «avísame cuando llegue» de Life Book, que
          aquí no tiene servidor que lo apunte. Las dos frases valen tanto si el comprador ya ha
          elegido otro eje como si no: decir «con lo que has elegido» mentiría cuando no hay nada
          elegido, que es justo el primer toque que recibe la hoja. */}
      {nota?.code === g.code ? (
        <View style={[estilos.nota, { borderColor: alpha(colors.danger, 0.5), backgroundColor: alpha(colors.danger, 0.06) }]}>
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, flex: 1 }}>
            {nota.agotado
              ? `«${nota.value}» no tiene unidades disponibles.`
              : `«${nota.value}» no está disponible en este anuncio.`}
          </Text>
          <Pressable onPress={() => setNota(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Entendido">
            <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.titulo }}>Entendido</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );

  return (
    <Sheet
      visible={visible}
      position="bottom"
      title="Elige la combinación"
      onClose={onClose}
    >
      {/* ── Cabecera: la foto de lo elegido, su precio y su stock ── */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {foto ? (
          <Image source={foto} style={[estilos.foto, { borderColor: alpha(colors.border, 0.8) }]} contentFit="cover" cachePolicy="memory-disk" transition={0} />
        ) : (
          <View style={[estilos.foto, estilos.sinFoto, { borderColor: alpha(colors.border, 0.8), backgroundColor: alpha(colors.primary, 0.1) }]}>
            <Text style={{ fontSize: ilustracion.md }}>📦</Text>
          </View>
        )}
        <View style={{ flex: 1, marginLeft: espaciado.e12 }}>
          {/* El nombre, aquí y a una línea: ver el porqué de `altoLista`. */}
          <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginBottom: espaciado.e2 }}>
            {product.title}
          </Text>
          {precioElegido !== null || !hayRango ? (
            <Precio
              valor={precioElegido ?? precioSuelto}
              tamano="lg"
              textoVacio="A consultar"
              color={agotada ? colors.textSecondary : undefined}
            />
          ) : (
            /* Un rango no es una cifra: son dos, y el componente de precio pinta una. Va como frase
               (con `numberOfLines={1}`, que es lo que impide que se parta por la mitad). */
            <Text numberOfLines={1} style={{ color: colors.primary, fontSize: tipografia.title, fontWeight: peso.titulo }}>
              {`${formatXAF(precios[0])} – ${formatXAF(precios[precios.length - 1])}`}
            </Text>
          )}
          {/* A UNA línea, y no por estética: si el resumen puede ocupar dos, la columna de texto
              supera los 92 dp de la foto, la cabecera crece con ella y **vuelve a empujar los
              botones**. A una línea la cabecera la manda la foto, que es de alto fijo. El resumen
              tampoco pierde nada: cada eje enseña arriba el valor elegido. */}
          <Text numberOfLines={1} style={{ color: colors.textPrimary, fontSize: tipografia.caption, marginTop: espaciado.e4 }}>
            {resumen}
          </Text>
          <Text style={{ color: agotada ? colors.danger : colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e4 }}>
            {stockTexto}
          </Text>
        </View>
      </View>

      <ScrollView style={{ maxHeight: altoLista }} showsVerticalScrollIndicator={false}>
        {grupos.map((g) => <Eje key={g.code} g={g} />)}

        {/* ── Cantidad, con el tope REAL de la combinación (no un 99 inventado) ── */}
        <View style={{ marginTop: espaciado.e16, flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.fuerte }}>Cantidad</Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e2 }}>
              {elegida ? `Máx. ${tope}` : ''}
            </Text>
          </View>
          <View style={[estilos.stepper, { borderColor: alpha(colors.border, 0.9) }]}>
            <Pressable
              onPress={() => setCant((c) => Math.max(1, c - 1))}
              disabled={cant <= 1}
              accessibilityRole="button"
              accessibilityLabel="Quitar una unidad"
              style={estilos.stepBtn}
            >
              <Minus size={icono.sm} color={cant <= 1 ? alpha(colors.textSecondary, 0.5) : colors.textPrimary} />
            </Pressable>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.fuerte, minWidth: 30, textAlign: 'center' }}>{cant}</Text>
            <Pressable
              onPress={() => setCant((c) => Math.min(Math.max(tope, 1), c + 1))}
              disabled={cant >= Math.max(tope, 1)}
              accessibilityRole="button"
              accessibilityLabel="Añadir una unidad"
              style={estilos.stepBtn}
            >
              <Plus size={icono.sm} color={cant >= Math.max(tope, 1) ? alpha(colors.textSecondary, 0.5) : colors.textPrimary} />
            </Pressable>
          </View>
        </View>

        {faltan.length ? (
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e8 }}>
            Elige: {faltan.join(' · ')}
          </Text>
        ) : null}
        {agotada ? (
          <Text style={{ color: colors.danger, fontSize: tipografia.caption, marginTop: espaciado.e8 }}>
            Esa combinación está agotada. Prueba otra.
          </Text>
        ) : null}
      </ScrollView>

      {/* ── Los botones: el de la acción con la que se abrió, en grande ── */}
      <View style={{ flexDirection: 'row', gap: espaciado.e8 }}>
        <Pressable
          onPress={() => confirmar(secundario)}
          disabled={!puedeConfirmar}
          accessibilityRole="button"
          accessibilityLabel={secundario === 'carrito' ? 'Añadir al carrito' : 'Comprar ahora'}
          accessibilityState={{ disabled: !puedeConfirmar }}
          style={[estilos.secBtn, { borderColor: colors.primary, opacity: puedeConfirmar ? 1 : 0.45 }]}
        >
          <Text numberOfLines={1} style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.titulo }}>
            {secundario === 'carrito' ? 'Al carrito' : 'Comprar ahora'}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => confirmar(principal)}
          disabled={!puedeConfirmar}
          accessibilityRole="button"
          accessibilityLabel={principal === 'carrito' ? 'Añadir al carrito' : 'Comprar ahora'}
          accessibilityState={{ disabled: !puedeConfirmar }}
          style={[estilos.priBtn, { backgroundColor: puedeConfirmar ? colors.primary : alpha(colors.primary, 0.4) }]}
        >
          <Text numberOfLines={1} style={{ color: brand.white, fontSize: tipografia.body, fontWeight: peso.titulo }}>
            {principal === 'carrito' ? 'Añadir al carrito' : 'Comprar ahora'}
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
}

const estilos = StyleSheet.create({
  foto: { width: 92, height: 92, borderRadius: radios.md, borderWidth: trazo.fino, overflow: 'hidden' },
  sinFoto: { alignItems: 'center', justifyContent: 'center' },
  valores: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 },
  colorCaja: { alignItems: 'center', borderRadius: radios.sm, padding: espaciado.e4 },
  colorImg: { width: 58, height: 58, borderRadius: radios.sm },
  chip: {
    borderWidth: trazo.fino, borderRadius: radios.sm,
    paddingHorizontal: espaciado.e12, minHeight: altura.punto, minWidth: 46,
    alignItems: 'center', justifyContent: 'center',
  },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: trazo.fino, borderRadius: radios.sm, paddingHorizontal: espaciado.e4, minHeight: altura.punto },
  stepBtn: { width: altura.punto, height: altura.punto, alignItems: 'center', justifyContent: 'center' },
  nota: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, borderWidth: trazo.fino, borderRadius: radios.md, padding: espaciado.e8, marginTop: espaciado.e8 },
  secBtn: { flex: 1, height: altura.control, borderRadius: radios.md, borderWidth: trazo.base, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e8 },
  priBtn: { flex: 1.4, height: altura.control, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e12 },
});
