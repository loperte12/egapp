/**
 * Layout · el vocabulario de CAJA que comparten TODOS los widgets
 * ===============================================================
 *
 * **Esto existe porque en Taobao `layout_width`, `margin*` y `visibility` no son del contenedor:
 * son de `DXWidgetNode`, la clase BASE de la que heredan los 59 widgets.**
 *
 * En Taobao:
 *
 * ```java
 * public abstract class DXWidgetNode {
 *   // el vocabulario base, para TODOS
 *   void setLayoutWidth(int i); void setLayoutHeight(int i);
 *   void setMarginLeft(int i);  void setMarginTop(int i); …
 *   void setVisibility(int i);  void setAlpha(int i);  void setEnabled(int i);
 *   void setAccessibility(int i);
 * }
 * ```
 *
 * ## Por qué hizo falta
 *
 * Los atributos de `CLAVES_LAYOUT` **solo los leía `Contenedor`**. Así que un `Texto` con
 * `MARGIN_LEFT` **lo ignoraba**, y una `Imagen` con `LAYOUT_WIDTH: -1` **se quedaba sin ancho**.
 *
 * **Se descubrió renderizando**, no con el oráculo: en el móvil salió `Malabo1 disponibles` —
 * el margen de 4 puntos entre la ciudad y el stock **no se aplicaba**, porque el margen estaba
 * en el nodo `Texto` y `Texto` no leía el vocabulario de layout.
 *
 * ## Qué entra aquí y qué no
 *
 * | Aquí (base, para los 9) | En `Contenedor` (solo él) |
 * |---|---|
 * | `LAYOUT_WIDTH` · `LAYOUT_HEIGHT` | `PADDING_*` |
 * | `MIN_WIDTH` · `MIN_HEIGHT` · `WEIGHT` | `BACKGROUNDCOLOR` |
 * | `MARGIN_LEFT/RIGHT/TOP/BOTTOM` | `CORNERRADIUS` · `BORDER_*` |
 * | `VISIBILITY` · `ALPHA` · `ENABLED` | `CLIP_CHILDREN` |
 * | `ACCESSIBILITY` · `ACCESSIBILITY_TEXT` · `ACCESSIBILITY_ROLE` | `ORIENTATION` · `GRAVITY` |
 *
 * **Criterio**: lo que en `DXWidgetNode.java` se declara en la clase base entra; lo que declara
 * un widget concreto, no. **No es una decisión de diseño mía: es de dónde está el código.**
 */

import type { StyleProp, TextStyle, ViewStyle } from 'react-native';
import {
  ACCESIBILIDAD, CLAVES_LAYOUT, MEDIDA, VISIBILIDAD,
  type AtributosDxLayout, type Caja,
} from './contenedorAtributos';

export type { AtributosDxLayout };

/** Lo que la caja resuelve, en forma neutra. */
export interface ResolucionCaja {
  /** `match_parent` · `match_content`, o ausente si Taobao no lo dijo. */
  ancho?: 'match_parent' | 'match_content';
  alto?: 'match_parent' | 'match_content';
  /**
   * Medida EXPLICITA en puntos, si Taobao dio un numero.
   *
   * Esto faltaba, y era un bug de verdad: MEDIDA solo conoce -1 y -2, asi que
   * LAYOUT_HEIGHT: 300 **se ignoraba por completo**. Una imagen con altura 300 salia sin
   * altura: invisible y sin ocupar sitio.
   */
  anchoPx?: number;
  altoPx?: number;
  /** Peso en el layout del padre (`setWeight`). */
  peso?: number;
  minAncho?: number;
  minAlto?: number;
  margen?: Caja;
  /** `gone` no ocupa sitio; `invisible` ocupa pero no se ve. */
  visibilidad: 'visible' | 'invisible' | 'gone';
  /** Opacidad 0..1, ya normalizada. */
  alfa?: number;
  /** `false` si Taobao lo marcó deshabilitado. */
  habilitado?: boolean;
  /** `off` / `on` / `off_child` / `auto`. */
  accesibilidad?: string;
  textoAccesibilidad?: string;
  rolAccesibilidad?: string;
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/** Los cuatro lados, con el nombre de la clave para cada uno. */
const LADOS = {
  margen: { izquierda: 'MARGIN_LEFT', derecha: 'MARGIN_RIGHT', arriba: 'MARGIN_TOP', abajo: 'MARGIN_BOTTOM' },
} as const;

/**
 * Resuelve el vocabulario de caja. **Lo usan los 9 componentes.**
 */
export function resolverCaja(dx: AtributosDxLayout = {}): ResolucionCaja {
  const vis = num(dx[CLAVES_LAYOUT.VISIBILITY]);
  const visibilidad = (vis !== undefined && VISIBILIDAD[vis] ? VISIBILIDAD[vis] : 'visible') as
    'visible' | 'invisible' | 'gone';

  const r: ResolucionCaja = { visibilidad };

  // -1/-2 son los valores especiales; **cualquier positivo es una medida en puntos**.
  const w = num(dx[CLAVES_LAYOUT.LAYOUT_WIDTH]);
  if (w !== undefined) {
    const m = MEDIDA[String(w)];
    if (m) r.ancho = m as 'match_parent' | 'match_content';
    else if (w > 0) r.anchoPx = w;
  }
  const h = num(dx[CLAVES_LAYOUT.LAYOUT_HEIGHT]);
  if (h !== undefined) {
    const m = MEDIDA[String(h)];
    if (m) r.alto = m as 'match_parent' | 'match_content';
    else if (h > 0) r.altoPx = h;
  }

  const peso = num(dx[CLAVES_LAYOUT.WEIGHT]);
  if (peso !== undefined && peso > 0) r.peso = peso;

  const minW = num(dx[CLAVES_LAYOUT.MIN_WIDTH]);
  if (minW !== undefined) r.minAncho = minW;
  const minH = num(dx[CLAVES_LAYOUT.MIN_HEIGHT]);
  if (minH !== undefined) r.minAlto = minH;

  const caja: Caja = {};
  for (const lado of ['izquierda', 'derecha', 'arriba', 'abajo'] as const) {
    const v = num(dx[CLAVES_LAYOUT[LADOS.margen[lado]]]);
    if (v !== undefined) caja[lado] = v;
  }
  if (Object.keys(caja).length) r.margen = caja;

  const alfa = num(dx[CLAVES_LAYOUT.ALPHA]);
  if (alfa !== undefined) r.alfa = alfa > 1 ? Math.min(1, alfa / 255) : alfa;
  const hab = num(dx[CLAVES_LAYOUT.ENABLED]);
  if (hab !== undefined) r.habilitado = hab !== 0;

  const acc = num(dx[CLAVES_LAYOUT.ACCESSIBILITY]);
  if (acc !== undefined && ACCESIBILIDAD[acc]) r.accesibilidad = ACCESIBILIDAD[acc];
  const at = dx[CLAVES_LAYOUT.ACCESSIBILITY_TEXT];
  if (at !== undefined && at !== null) r.textoAccesibilidad = String(at);
  const ar = dx[CLAVES_LAYOUT.ACCESSIBILITY_ROLE];
  if (ar !== undefined && ar !== null) r.rolAccesibilidad = String(ar);

  return r;
}

/**
 * El estilo de React Native para el vocabulario de caja.
 *
 * **Devuelve un objeto que vale igual para `View` y para `Text`** — márgenes, ancho mínimo y
 * opacidad existen en los dos. Lo único que no: `display: 'none'` en `Text` se comporta igual
 * que en `View`, así que `gone` se traduce ahí y no hace falta que cada componente devuelva
 * `null`.
 *
 * `match_parent` se traduce a **`alignSelf: 'stretch'`**, que estira en el eje cruzado tanto en
 * fila como en columna. **Es la misma decisión que ya tomaba `Contenedor`**, y por eso no cambia
 * su comportamiento.
 */
export function estiloDeCaja(dx: AtributosDxLayout = {}): StyleProp<ViewStyle & TextStyle> {
  const r = resolverCaja(dx);
  const s: ViewStyle & TextStyle = {};

  // Medida explícita primero; match_parent la pisa sólo si Taobao la pidió.
  if (r.anchoPx !== undefined) s.width = r.anchoPx;
  if (r.altoPx !== undefined) s.height = r.altoPx;
  if (r.ancho === 'match_parent') s.alignSelf = 'stretch';
  if (r.alto === 'match_parent') s.flex = 1;
  if (r.peso !== undefined) s.flex = r.peso;

  if (r.minAncho !== undefined) s.minWidth = r.minAncho;
  if (r.minAlto !== undefined) s.minHeight = r.minAlto;

  if (r.margen) {
    if (r.margen.arriba !== undefined) s.marginTop = r.margen.arriba;
    if (r.margen.abajo !== undefined) s.marginBottom = r.margen.abajo;
    if (r.margen.izquierda !== undefined) s.marginLeft = r.margen.izquierda;
    if (r.margen.derecha !== undefined) s.marginRight = r.margen.derecha;
  }

  // `gone` no ocupa sitio. Se traduce aquí para que ningún componente tenga que devolver `null`.
  if (r.visibilidad === 'gone') s.display = 'none';
  else if (r.visibilidad === 'invisible') s.opacity = 0;

  if (r.alfa !== undefined) s.opacity = r.alfa;
  if (r.habilitado === false) s.pointerEvents = 'none';

  return s;
}

/**
 * Las props de accesibilidad, aparte del estilo porque no son estilo.
 *
 * **Va separado a propósito**: `display: 'none'` oculta visualmente, pero un lector de pantalla
 * necesita `accessibilityElementsHidden`, y mezclar las dos cosas en un objeto de estilo es
 * justo lo que hace que la accesibilidad se olvide.
 */
export function propsDeAccesibilidad(dx: AtributosDxLayout = {}): Record<string, unknown> {
  const r = resolverCaja(dx);
  const p: Record<string, unknown> = {};
  if (r.accesibilidad === 'off' || r.accesibilidad === 'off_child') {
    p.accessibilityElementsHidden = true;
    p.importantForAccessibility = 'no-hide-descendants';
  }
  if (r.textoAccesibilidad) p.accessibilityLabel = r.textoAccesibilidad;
  if (r.rolAccesibilidad) p.accessibilityRole = r.rolAccesibilidad;
  return p;
}

export default { resolverCaja, estiloDeCaja, propsDeAccesibilidad };
