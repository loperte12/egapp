/**
 * Contenedor · el contenedor base del Mercado, portado del vocabulario de layout de Taobao
 * ========================================================================================
 *
 * **El nodo más usado de Taobao.** En las 53 plantillas de ficha de producto:
 *
 * ```
 * 52e0c78fcad859e5   452 usos   (contenedor)
 * 705a8a00492bfa74   196       (contenedor)
 * 5c1dfa3cff34b6da   159       (contenedor)
 * 99473ba1b2f79d1b    37       (contenedor)
 *                   ────
 *                    844 usos de contenedores solo en la ficha
 * ```
 *
 * **Y sirve para varios tipos de nodo a la vez.** Taobao tiene varios contenedores distintos
 * (`52e0c78fcad859e5`, `705a8a00492bfa74`…) y **no sé cuál es cuál** — la tabla de tipos de
 * widget no los nombra. Implementan el **mismo vocabulario de layout**, así que este componente
 * los cubre a todos.
 *
 * ## De dónde salen los nombres
 *
 * **Están INFERIDOS de los valores del `enumMap`**, no leídos de una constante del APK. Ver
 * `contenedorAtributos.ts` para la confianza de cada uno. Y `visibility`, con **3123
 * apariciones, es el atributo más usado de todo Taobao**.
 */

import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { resolverContenedor, type AtributosDxLayout, type Alineacion } from './contenedorAtributos';

export interface ContenedorProps {
  children?: React.ReactNode;
  /** Atributos de layout decodificados, por clave hex de Taobao. */
  dx?: AtributosDxLayout;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /** Fuerza la dirección, si no viene en `dx`. */
  direccion?: 'row' | 'column';
}

/** Traduce la alineación neutra a `justifyContent`/`alignItems` de React Native. */
function aEstilo(a: Alineacion | undefined): ViewStyle {
  if (!a) return {};
  return { justifyContent: a.justifyContent, alignItems: a.alignItems };
}

/**
 * El contenedor base del Mercado.
 *
 * ```tsx
 * <Contenedor dx={{ '9c173339fd9791b7': 0 }}>   {/* ORIENTATION = horizontal *\/}
 *   <Imagen uri={foto} />
 *   <Texto>{titulo}</Texto>
 * </Contenedor>
 * ```
 */
export function Contenedor({ children, dx, style, testID, direccion }: ContenedorProps) {
  const r = resolverContenedor(dx);

  // `gone`: no ocupa sitio. Se devuelve `null` en vez de `display:'none'` porque un nodo
  // ausente no monta efectos, y en una lista eso importa.
  if (r.visibilidad === 'gone') return null;

  const estilo: ViewStyle = {};

  // `invisible`: ocupa sitio pero no se ve. **La diferencia con `gone` importa** — es la razón
  // de que Taobao tenga tres valores y no dos.
  if (r.visibilidad === 'invisible') estilo.opacity = 0;

  // Dirección. Por defecto `column`, que es el `vertical` de Taobao.
  estilo.flexDirection = r.direccion ?? direccion ?? 'column';

  /*
   * `match_parent` / `match_content` de Android → flexbox de React Native.
   *
   * **Es una decisión, no una equivalencia.** Android mide primero y reparte después; flexbox
   * reparte y mide. La traducción habitual es `flex: 1` + `alignSelf: 'stretch'` para
   * `match_parent` y nada para `match_content`, **y es la que se aplica aquí**.
   *
   * El oráculo marca estos atributos como LAYOUT, así que los compara como AVISO, no como FALLO.
   */
  if (r.ancho === 'match_parent') {
    estilo.flexGrow = 1;
    estilo.flexShrink = 1;
    estilo.alignSelf = 'stretch';
  }
  // Medida explicita en puntos. **Antes se ignoraba**: MEDIDA solo conoce -1 y -2.
  if (r.anchoPx !== undefined) estilo.width = r.anchoPx;
  if (r.altoPx !== undefined) estilo.height = r.altoPx;
  if (r.alto === 'match_parent') estilo.flex = 1;

  // `setWeight`: peso en el layout del padre. Es el `layout_weight` de Android → `flex` aquí.
  if (r.peso !== undefined) estilo.flex = r.peso;

  // Márgenes y relleno. Los cuatro lados van sueltos: Taobao **no tiene** un `margin` de
  // cuatro lados, solo las cuatro claves por lado.
  if (r.margen) {
    if (r.margen.arriba !== undefined) estilo.marginTop = r.margen.arriba;
    if (r.margen.abajo !== undefined) estilo.marginBottom = r.margen.abajo;
    if (r.margen.izquierda !== undefined) estilo.marginLeft = r.margen.izquierda;
    if (r.margen.derecha !== undefined) estilo.marginRight = r.margen.derecha;
  }
  if (r.relleno) {
    if (r.relleno.arriba !== undefined) estilo.paddingTop = r.relleno.arriba;
    if (r.relleno.abajo !== undefined) estilo.paddingBottom = r.relleno.abajo;
    if (r.relleno.izquierda !== undefined) estilo.paddingLeft = r.relleno.izquierda;
    if (r.relleno.derecha !== undefined) estilo.paddingRight = r.relleno.derecha;
  }

  // Radio de esquina. `overflow: 'hidden'` es necesario: sin él, los hijos se salen de la
  // esquina redondeada, que es justo lo que Taobao evita con este atributo.
  if (r.radioEsquina !== undefined) {
    estilo.borderRadius = r.radioEsquina;
    estilo.overflow = 'hidden';
  }
  // setClipChildren: recortar los hijos al contenedor. En RN es overflow: 'hidden'.
  if (r.recortarHijos) estilo.overflow = 'hidden';

  // Color de fondo. Va antes que style, así que quien use el componente puede pisarlo.
  if (r.fondo) estilo.backgroundColor = r.fondo;

  // Estado.
  if (r.alfa !== undefined) estilo.opacity = r.alfa;
  if (r.habilitado === false) estilo.pointerEvents = 'none';

  /*
   * Accesibilidad — `setAccessibility`, **1487 usos**, el segundo atributo más usado de Taobao.
   * Era el misterioso enum `off/on/off_child/auto`.
   *
   * | Taobao | Aquí |
   * |---|---|
   * | `on` (1) | se expone al lector de pantalla |
   * | `off` (0) | `accessibilityElementsHidden` |
   * | `off_child` (2) | lo mismo **y** `no-hide-descendants`: se propaga a los hijos |
   * | `auto` (3) | lo decide el sistema |
   */
  const accProps: Record<string, unknown> = {};
  if (r.accesibilidad === 'off' || r.accesibilidad === 'off_child') {
    accProps.accessibilityElementsHidden = true;
    accProps.importantForAccessibility = 'no-hide-descendants';
  }
  if (r.textoAccesibilidad) accProps.accessibilityLabel = r.textoAccesibilidad;
  if (r.rolAccesibilidad) accProps.accessibilityRole = r.rolAccesibilidad;

  return (
    <View
      testID={testID}
      style={[estilo, aEstilo(r.alineacionHijos), aEstilo(r.alineacionPropia), style]}
      {...accProps}
    >
      {children}
    </View>
  );
}

export default Contenedor;

export {
  resolverContenedor, alineacionDe, atributosDelLayout,
  CLAVES_LAYOUT, CONFIANZA, VISIBILIDAD, MEDIDA, GRAVEDAD, ORIENTACION,
} from './contenedorAtributos';
export type {
  AtributosDxLayout, ResolucionContenedor, Alineacion, NombreAtributoLayout,
} from './contenedorAtributos';


