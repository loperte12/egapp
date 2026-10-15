/**
 * Lista · el vocabulario de `DXRecyclerLayout` de Taobao
 * ======================================================
 *
 * ## De dónde sale esto
 *
 * **No está inventado.** Sale de `DXRecyclerLayout.java` (164 KB, el widget de lista de DinamicX),
 * que es el que registra estos nombres. `DXNativeListLayout.java` —lo que parecía la clase
 * obvia— resultó ser **un `LinearLayout` de 771 bytes sin un solo atributo**:
 *
 * ```java
 * public class DXNativeListLayout extends DXNativeLinearLayout { … }
 * ```
 *
 * **La lista de Taobao no es un widget con atributos propios: es un bucle sobre datos.**
 *
 * ## La prueba de que es un bucle
 *
 * En `DXWidgetNode.java` —la clase BASE— estas palabras aparecen **cero veces**:
 *
 * ```
 * repeat    0        loop        0        forEach    0
 * listItem  0        itemCount   0
 * ```
 *
 * Y en `DXRecyclerLayout` sí aparecen, **por nombre**:
 *
 * ```
 * data · item_data · isRepeat · repeatMode · index · empty
 * columnGap · leftGap · rightGap · sticky · ability_span
 * ```
 *
 * O sea: **la repetición no es un atributo de la base, es del widget de lista, y se declara con
 * `data` + una plantilla + `item_data`.** Eso es exactamente `FlatList` + `renderItem`.
 *
 * ## Y lo que NO es de aquí
 *
 * Los otros (posición de scroll, `onEndReached`, `onPullDistance`) **sí son claves hex** de la
 * tabla — `DXRECYCLERLAYOUT_ONENDREACHED` = `-2277119638481222228`, `DXRECYCLERLAYOUT_ONSTAY`
 * = `9859236201376900`. **No entran en esta versión porque el evento necesita el mismo camino
 * que `alEvento` y todavía no lo tiene.** Se declaran abajo, sin implementar, en vez de
 * inventarles un comportamiento.
 */

/** Los atributos de nivel de plantilla, tal como los registra `DXRecyclerLayout`. */
export const CLAVES_LISTA = {
  /** La fuente de datos. **Se declara aquí, no en `atributos`, porque el árbol ya la resuelve.** */
  DATA: 'data',
  /**
   * La dirección de la lista: `0` = fila (HORIZONTAL), `1` o ausente = columna.
   *
   * **Es la clave del vocabulario de CAJA compartido** (`contenedorAtributos.ORIENTATION`,
   * `DX_VIEW_ORIENTATION`), y está aquí a propósito: **`DXRecyclerLayout` extiende
   * `DXLinearLayout`**, así que hereda su orientación. No es una clave propia de la lista, y por
   * eso se documenta en vez de inventarle una.
   *
   * **Y hay UN solo repetidor, no cuatro.** `Carrusel`, `Rejilla` y `Scroll` reciben `children`,
   * no datos: darles a los tres el mecanismo de plantilla sería tener tres formas de repetir. En
   * Taobao el repetidor es `DXRecyclerLayout`, y una franja horizontal es **una lista con
   * orientación de fila** — no un widget distinto.
   */
  ORIENTATION: '9c173339fd9791b7',
  /** Cómo se llama el dato del elemento dentro de la plantilla. */
  ITEM_DATA: 'item_data',
  /** Si la lista se repite. */
  IS_REPEAT: 'isRepeat',
  /** Cómo se repite. */
  REPEAT_MODE: 'repeatMode',
  /** Separación entre columnas. */
  COLUMN_GAP: 'columnGap',
  /** Separación a la izquierda y a la derecha. */
  LEFT_GAP: 'leftGap',
  RIGHT_GAP: 'rightGap',
  /** Cabeceras que se quedan pegadas al hacer scroll. */
  STICKY: 'sticky',
  /** El estado vacío. */
  EMPTY: 'empty',
  /** Cuántas columnas (el `span` del widget de rejilla). */
  ABILITY_SPAN: 'ability_span',
  /**
   * **Qué tarjeta usa cada elemento.** Es el nombre REGISTRADO de Taobao, y se midió en el feed de
   * descubrimiento (`live_flexalocal/discovery_video_list_new.json`): allí **cada elemento** lleva
   * `templateName`, y en la MISMA lista conviven varias tarjetas:
   *
   * ```
   * 11× taolive_discovery_feed_live_v2        ← la tarjeta normal
   *  1× taolive_discovery_feed_goods_card_v2  ← una tarjeta DISTINTA en la misma lista
   *  1× taolive_discovery_head_card_2024      ← la cabecera
   *  1× taolive_discovery_subtab_card_2024    ← las pestañas
   * ```
   *
   * Es la diferencia entre una lista homogénea —una plantilla para todos— y **una lista donde cada
   * elemento dice qué es**. El `span` no viaja aquí: viaja en la **entrada de plantilla**
   * (`{name, span, url4Android}`), o sea que **el ancho es del diseño de la tarjeta**.
   */
  TEMPLATE_NAME: 'templateName',

  // ── de la tabla de claves (hex) — **medidas**, no nombres ──
  /** `DXRECYCLERLAYOUT_ONENDREACHED` — se llega al final. */
  ON_END_REACHED: '-2277119638481222228',
  /** `DXRECYCLERLAYOUT_ONSTAY` — el elemento se queda quieto. */
  ON_STAY: '9859236201376900',
  /** `DXSCROLLLAYOUTBASE_MAXWIDTH` — ancho máximo del área de scroll. */
  MAX_WIDTH: '4685059378591825230',
  /** `DXSCROLLLAYOUTBASE_MAXHEIGHT` — alto máximo. */
  MAX_HEIGHT: '-2628143228636041048',
  /** `DXSECTIONLAYOUT_SECTIONLAYOUT` — el marcador de sección. */
  SECTION_LAYOUT: '4134435766638294492',
  /** `DXADAPTIVELINEARLAYOUT_HIDEWHENEMPTY` — esconderse si no hay nada. */
  HIDE_WHEN_EMPTY: '1761983530541074760',
  /** `DXADAPTIVELINEARLAYOUT_MINCOUNT` — mínimo de elementos para pintarse. */
  MIN_COUNT: '4694181174831931477',

  // ── de `DX_GRID_LAYOUT_*`: la rejilla dentro de la lista ──
  COLUMN_COUNT: '4480460401770252962',
  ROW_SPACING: '-5965488911581852121',
  COLUMN_SPACING: '-7076735627431451296',
  ITEM_WIDTH: '-5480582194049152328',
  ITEM_HEIGHT: '-889779179579457774',
  NEED_SEPARATOR: '-7975214338005072550',
} as const;

export type NombreAtributoLista = keyof typeof CLAVES_LISTA;

/**
 * De dónde salió cada clave. **Para que nadie tenga que volver a buscar en el binario.**
 */
export const PROCEDENCIA: Record<NombreAtributoLista, string> = {
  DATA: 'DXRecyclerLayout (nombre registrado)',
  ORIENTATION: 'contenedorAtributos · DX_VIEW_ORIENTATION — DXRecyclerLayout hereda de DXLinearLayout',
  ITEM_DATA: 'DXRecyclerLayout (nombre registrado)',
  IS_REPEAT: 'DXRecyclerLayout (nombre registrado)',
  REPEAT_MODE: 'DXRecyclerLayout (nombre registrado)',
  COLUMN_GAP: 'DXRecyclerLayout (nombre registrado)',
  LEFT_GAP: 'DXRecyclerLayout (nombre registrado)',
  RIGHT_GAP: 'DXRecyclerLayout (nombre registrado)',
  STICKY: 'DXRecyclerLayout (nombre registrado)',
  EMPTY: 'DXRecyclerLayout (nombre registrado)',
  ABILITY_SPAN: 'DXRecyclerLayout (nombre registrado)',
  TEMPLATE_NAME: 'live_flexalocal/discovery_video_list_new.json — `templateName` por elemento (11+1 tarjetas distintas en la misma lista)',
  ON_END_REACHED: 'tabla de claves · DXRECYCLERLAYOUT_ONENDREACHED',
  ON_STAY: 'tabla de claves · DXRECYCLERLAYOUT_ONSTAY',
  MAX_WIDTH: 'tabla de claves · DXSCROLLLAYOUTBASE_MAXWIDTH',
  MAX_HEIGHT: 'tabla de claves · DXSCROLLLAYOUTBASE_MAXHEIGHT',
  SECTION_LAYOUT: 'tabla de claves · DXSECTIONLAYOUT_SECTIONLAYOUT',
  HIDE_WHEN_EMPTY: 'tabla de claves · DXADAPTIVELINEARLAYOUT_HIDEWHENEMPTY',
  MIN_COUNT: 'tabla de claves · DXADAPTIVELINEARLAYOUT_MINCOUNT',
  COLUMN_COUNT: 'tabla de claves · DX_GRID_LAYOUT_COLUMN_COUNT',
  ROW_SPACING: 'tabla de claves · DX_GRID_LAYOUT_ROW_SPACING',
  COLUMN_SPACING: 'tabla de claves · DX_GRID_LAYOUT_COLUMN_SPACING',
  ITEM_WIDTH: 'tabla de claves · DX_GRID_LAYOUT_ITEM_WIDTH',
  ITEM_HEIGHT: 'tabla de claves · DX_GRID_LAYOUT_ITEM_HEIGHT',
  NEED_SEPARATOR: 'tabla de claves · DX_GRID_LAYOUT_NEED_SEPARATOR',
};

export type AtributosDxLista = Record<string, number | string | boolean | null | undefined>;

export interface ResolucionLista {
  /** Cuántas columnas. `1` = lista vertical normal; `>1` = rejilla. */
  columnas: number;
  /** `true` si la lista va en FILA — una franja que se desliza de lado. */
  horizontal: boolean;
  /** Separación entre columnas, en puntos. */
  separacionColumnas?: number;
  /** Separación entre filas. */
  separacionFilas?: number;
  /** Separación lateral (izquierda y derecha). */
  margenLateral?: number;
  /** `true` si Taobao pidió esconder la lista cuando no hay nada. */
  esconderSiVacia: boolean;
  /** Mínimo de elementos para pintarse. */
  minimoElementos?: number;
  /** Lo que se declara y NO se implementa, con su clave — para no fingir cobertura. */
  noImplementados: NombreAtributoLista[];
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

function bool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  const n = num(v);
  return n === undefined ? undefined : n !== 0;
}

/**
 * Los atributos que **no** se implementan en esta versión, y por qué.
 *
 * **Van declarados y no callados**: si el servidor manda `sticky`, tiene que poder ver que el
 * cliente no lo pinta. Un atributo ignorado en silencio es un fallo que aparece en producción.
 */
const NO_IMPLEMENTADOS: NombreAtributoLista[] = [
  'IS_REPEAT',       // el árbol ya repite por construcción: una lista con plantilla siempre repite
  'REPEAT_MODE',     // modos de repetición de Taobao (circular, etc.) sin equivalencia medida
  'STICKY',          // cabeceras pegajosas: `FlatList` lo tiene pero necesita secciones
  'EMPTY',           // el estado vacío es un nodo, no un atributo: iría como segundo hijo
  'ON_STAY',         // el evento no tiene camino todavía
  'MAX_WIDTH',       // se puede expresar con el vocabulario de caja compartido
  'MAX_HEIGHT',      // ídem
  'SECTION_LAYOUT',  // secciones: fuera de alcance en esta versión
  'ITEM_WIDTH',      // medidas fijas por celda: se expresan en la plantilla
  'ITEM_HEIGHT',     // ídem
  'NEED_SEPARATOR',  // líneas separadoras: se expresan con bordes en la plantilla
];
// **`ABILITY_SPAN` ya NO está en esta lista** (15/10/2026): el `span` por elemento se implementó.
// Ver `CLAVE_SPAN_ELEMENTO` y `filasPorSpan`.

/**
 * Convierte los atributos de Taobao en lo que `FlatList` necesita.
 */
export function resolverLista(dx: AtributosDxLista = {}): ResolucionLista {
  const r: ResolucionLista = { columnas: 1, horizontal: false, esconderSiVacia: false, noImplementados: [] };

  // `DX_GRID_LAYOUT_COLUMN_COUNT` es el número de columnas. **Sin él, una lista vertical.**
  const cols = num(dx[CLAVES_LISTA.COLUMN_COUNT]);
  if (cols !== undefined && cols >= 1) r.columnas = Math.floor(cols);

  // La ORIENTACIÓN: `0` = fila. **Una franja horizontal es una lista con orientación de fila**,
  // no un widget aparte — es lo que hace `DXRecyclerLayout` al heredar de `DXLinearLayout`.
  r.horizontal = num(dx[CLAVES_LISTA.ORIENTATION]) === 0;
  // Con fila y columnas a la vez no se puede: `FlatList` prohíbe `horizontal` + `numColumns`. Se
  // queda la fila, que es la que pidió el servidor de forma explícita.
  if (r.horizontal) r.columnas = 1;

  const sepCol = num(dx[CLAVES_LISTA.COLUMN_SPACING]) ?? num(dx[CLAVES_LISTA.COLUMN_GAP]);
  if (sepCol !== undefined) r.separacionColumnas = sepCol;
  const sepFila = num(dx[CLAVES_LISTA.ROW_SPACING]);
  if (sepFila !== undefined) r.separacionFilas = sepFila;

  // Los laterales: Taobao tiene `leftGap`/`rightGap` por separado; aquí se usa el mayor de los
  // dos como margen simétrico. **Es una decisión, no una equivalencia**: si difieren, se pierde
  // la asimetría, y por eso se declara.
  const izq = num(dx[CLAVES_LISTA.LEFT_GAP]);
  const der = num(dx[CLAVES_LISTA.RIGHT_GAP]);
  if (izq !== undefined || der !== undefined) r.margenLateral = Math.max(izq ?? 0, der ?? 0);

  const esconder = bool(dx[CLAVES_LISTA.HIDE_WHEN_EMPTY]);
  if (esconder !== undefined) r.esconderSiVacia = esconder;

  const min = num(dx[CLAVES_LISTA.MIN_COUNT]);
  if (min !== undefined) r.minimoElementos = min;

  for (const nombre of NO_IMPLEMENTADOS) {
    if (dx[CLAVES_LISTA[nombre]] !== undefined) r.noImplementados.push(nombre);
  }
  // `ON_END_REACHED` se cuenta aparte: la clave existe y se detecta, pero el evento no se emite.
  if (dx[CLAVES_LISTA.ON_END_REACHED] !== undefined) r.noImplementados.push('ON_END_REACHED');

  return r;
}

/** Todos los atributos que este componente conoce. */
export function atributosDeLaLista(): NombreAtributoLista[] {
  return Object.keys(CLAVES_LISTA) as NombreAtributoLista[];
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL `span` POR ELEMENTO — la rejilla irregular de Taobao
// ══════════════════════════════════════════════════════════════════════════════════════════════

/**
 * **El `span` de una PLANTILLA**: cuántas columnas ocupa la tarjeta que la usa.
 *
 * Se midió en el corpus: en Taobao el `span` **no es un atributo de la lista ni del elemento**, sino
 * un campo de la **entrada de plantilla** (`livehomecore_flexalocal/bottoming_template_list.json` y
 * `template_list.json`), junto a `name`, `url4Android` y `version4Android`:
 *
 * ```json
 * { "name": "taolive_morelive_entry_202303", "span": "1", "url4Android": "https://…", "version4Android": 17 }
 * ```
 *
 * Es **texto** (`"1"`, `"2"` y a veces `""`) en las 77 apariciones del corpus, y la mezcla es real:
 * el catálogo de seguidos tiene **31 de 41 con span 2** y 10 con span 1; `template_list.json`, 24
 * con 1, 2 con 2 y 3 vacías. *(Con `""` —o sin `span`— la tarjeta ocupa una columna.)*
 *
 * **Consecuencia, y es la que importa**: el ancho es del DISEÑO de la tarjeta, no del producto. Por eso
 * aquí esta clave vive en el **nodo de la plantilla** (constante), y no como binding por elemento: el
 * elemento lo que hace es elegir su tarjeta (`TEMPLATE_NAME`).
 *
 * La `ABILITY_SPAN` de `DXRecyclerLayout` es el nombre registrado de la capacidad.
 */
export const CLAVE_SPAN_PLANTILLA = 'ext:span';

/** El `span` de una plantilla, saneado: sin dato (o vacío) es **1**, y nunca pasa de las columnas. */
export function spanDeElemento(valor: unknown, columnas: number): number {
  const cols = Math.max(1, Math.floor(columnas));
  const n = num(valor);
  // **Un `span` de 0, negativo o basura no encoge la tarjeta a nada: se queda en 1.** Y uno mayor que
  // la rejilla se recorta: prometer 3 columnas en una rejilla de 2 no cabe, y callarlo daría una
  // tarjeta desbordada.
  if (n === undefined || !Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), cols);
}

/** Un elemento colocado en su fila, con el `span` ya resuelto. */
export interface ElementoColocado<T> {
  elemento: T;
  indice: number;
  span: number;
}

/**
 * REPARTE LOS ELEMENTOS EN FILAS SEGÚN SU `span`. Es puro y por eso se puede probar sin pintar nada.
 *
 * La regla es la de un flujo con huecos: se recorre la lista y cada elemento entra en la fila abierta
 * si cabe (`suma + span <= columnas`); si no, abre fila. Un elemento que pide la fila entera
 * (`span >= columnas`) **va solo**, y eso es lo que deja la rejilla irregular: dos tarjetas anchas
 * nunca comparten fila, y dos estrechas sí.
 *
 * **`irregular` es lo que decide si hay que cambiar de pintado**: con todos los `span` en 1, la
 * rejilla es la de siempre (`FlatList` con `numColumns`) y este camino no se usa. Sin esa bandera,
 * una rejilla normal pagaría el coste de las filas sin necesitarlo.
 */
export function filasPorSpan<T>(
  elementos: T[],
  columnas: number,
  spanDe?: (elemento: T, indice: number) => unknown,
): { filas: Array<Array<ElementoColocado<T>>>; irregular: boolean } {
  const cols = Math.max(1, Math.floor(columnas));
  const filas: Array<Array<ElementoColocado<T>>> = [];
  let abierta: Array<ElementoColocado<T>> = [];
  let usadas = 0;
  let irregular = false;

  elementos.forEach((elemento, indice) => {
    const span = spanDe ? spanDeElemento(spanDe(elemento, indice), cols) : 1;
    if (span > 1) irregular = true;
    // Una tarjeta ancha cierra lo que hubiera abierto **antes** de ponerse ella: si no, quedaría una
    // fila con un hueco muerto a su izquierda.
    if (span >= cols && usadas > 0) { filas.push(abierta); abierta = []; usadas = 0; }
    abierta.push({ elemento, indice, span });
    usadas += span;
    if (usadas >= cols) { filas.push(abierta); abierta = []; usadas = 0; }
  });

  if (abierta.length > 0) filas.push(abierta);
  return { filas, irregular };
}

/**
 * ELIGE LA PLANTILLA DE UN ELEMENTO. Puro, y por eso se prueba sin pintar.
 *
 * El elemento lo dice por su **`templateName`** (medido: cada elemento del feed de Taobao lo lleva).
 * Si el nombre no está entre las plantillas de la lista —o no lo trae— se usa **la primera** y se
 * declara, que es la diferencia entre degradar y mentir: la tarjeta se pinta (con el diseño por
 * defecto) y quien lea el diagnóstico sabe que ahí falta una plantilla, en vez de ver un hueco.
 */
export function elegirPlantilla(
  nombres: string[],
  declarado: unknown,
): { indice: number; desconocida?: string } {
  if (nombres.length === 0) return { indice: -1 };
  const buscado = typeof declarado === 'string' && declarado !== '' ? declarado : undefined;
  // Sin `templateName` no hay nada que declarar: es una lista de una sola tarjeta, como siempre.
  if (!buscado) return { indice: 0 };
  const i = nombres.indexOf(buscado);
  return i >= 0 ? { indice: i } : { indice: 0, desconocida: buscado };
}

export default {
  CLAVES_LISTA, PROCEDENCIA, CLAVE_SPAN_PLANTILLA, resolverLista, atributosDeLaLista,
  spanDeElemento, filasPorSpan, elegirPlantilla,
};
