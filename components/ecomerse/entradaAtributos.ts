/**
 * Entrada · el vocabulario de los DOS widgets de texto de entrada de Taobao
 * ========================================================================
 *
 * ## Hay dos, y hacen falta los dos
 *
 * Buscando `DXCARTTEXTINPUT` apareció que Taobao tiene **dos** widgets de entrada distintos:
 *
 * | Widget | Claves | Lo que aporta |
 * |---|---|---|
 * | `DXCartTextInputWidgetNode` | 13 | `TEXT` · `PLACEHOLDER` · `MAXLENGTH` · `KEYBOARD` · `ONCHANGE` |
 * | `DXTEXTINPUTVIEW` | 7 | **`ISSINGLELINE`** · **`MULTILINEMAXHEIGHT`** · **`ISSHOWHINTNUM`** (el contador) |
 *
 * **Y hacían falta los dos de verdad**: de los 5 campos de entrada del Mercado, **4 son
 * multilínea** — y `multiline` no está en `DXCARTTEXTINPUT`. Está en el otro, invertido:
 * **`ISSINGLELINE`**.
 *
 * ## El texto se COMPARTE, y esto está comprobado
 *
 * Las claves de texto **no son propias de la entrada**. Medido con la tabla:
 *
 * ```
 * DXCARTTEXTINPUT_TEXT      38178040921          = 00000008e396ac59
 * textoAtributos.TEXT                            = 00000008e396ac59   ← la MISMA
 * DXCARTTEXTINPUT_TEXTCOLOR 5737767606580872653  = 4fa0a53cf9ff05cd
 * textoAtributos.TEXTCOLOR                       = 4fa0a53cf9ff05cd   ← la MISMA
 * ```
 *
 * Lo mismo con `TEXTSIZE` y `TEXTGRAVITY`. **La tabla las da en decimal y los módulos en hex de
 * 16 dígitos: parecían distintas y son la misma.** Por eso `TEXT`, `TEXTCOLOR`, `TEXTSIZE` y
 * `TEXTGRAVITY` **se reusan de `textoAtributos`** en vez de volver a declararlas — si se
 * declararan dos veces, un cambio en una no llegaría a la otra.
 *
 * ## Las claves se EXTRAJERON, no se teclearon
 *
 * Los 16 hex de abajo salen de `tabla-claves.json` por script. **Un hex a mano es un bug que
 * aparece tres pantallas más tarde.**
 */

import type { TextStyle } from 'react-native';

/**
 * **Las cuatro claves de texto, que SON LAS MISMAS que las de `textoAtributos`.**
 *
 * Comprobado con la tabla: `DXCARTTEXTINPUT_TEXT` = `38178040921` y `textoAtributos.TEXT` =
 * `'00000008e396ac59'` = **el mismo número** (la tabla lo da en decimal, el módulo en hex).
 * Ídem `TEXTCOLOR`, `TEXTSIZE` y `TEXTGRAVITY`.
 *
 * **¿Y por qué se declaran aquí en vez de importarlas?** Porque **este módulo tiene que ser
 * autocontenido**: `renderizadorNucleo`, `textoAtributos` y `listaAtributos` no importan nada
 * interno, y **por eso el oráculo puede cargarlos en Node y verificarlos en un segundo**. En
 * cuanto un módulo importa a otro, Node no resuelve la ruta sin extensión (Metro sí) y **se
 * pierde la prueba pura** — que es la herramienta que más ha valido en esta sesión.
 *
 * **El precio es una copia; la garantía es un test.** `claves.test.mjs` afirma que estas cuatro
 * son **exactamente iguales** a las de `textoAtributos`. Si alguien cambia una, el test lo dice
 * — que es mejor que un import que además arrastra el módulo entero.
 */
export const TEXTO_COMPARTIDO = {
  TEXT: '00000008e396ac59',
  TEXTCOLOR: '4fa0a53cf9ff05cd',
  TEXTSIZE: '5db0637a915fa268',
  TEXTGRAVITY: 'ea489e00edd43eb6',
} as const;

/** Los dos tipos de widget que esta `Entrada` sabe pintar. */
export const TIPOS_ENTRADA = {
  /** `DXCartTextInputWidgetNode` — el del carrito. */
  CART: '6b36e7b48733bf6c',
  /** `DXTEXTINPUTVIEW` — el que trae `ISSINGLELINE` y el contador. */
  VIEW: '99540a9e0ccb955d',
} as const;

export const CLAVES_ENTRADA = {
  // ── propias de `DXCARTTEXTINPUT` ──────────────────────────────────────────────────────────
  PLACEHOLDER: '52ff33d38a18698e',        // DXCARTTEXTINPUT_PLACEHOLDER
  PLACEHOLDERCOLOR: '10b9fcd413f0b192',   // DXCARTTEXTINPUT_PLACEHOLDERCOLOR
  MAXLENGTH: 'db87161311e231b1',          // DXCARTTEXTINPUT_MAXLENGTH
  KEYBOARD: '38e890ed60464d59',           // DXCARTTEXTINPUT_KEYBOARD
  RETURNTYPE: 'dd780b6ffcf6fc4c',         // DXCARTTEXTINPUT_RETURNTYPE
  ONCHANGE: '49652a47524c602b',           // DXCARTTEXTINPUT_ONCHANGE
  ONFINISH: '49653682c7ceb746',           // DXCARTTEXTINPUT_ONFINISH
  FOCUS: '00001003e6919fc5',              // DXCARTTEXTINPUT_FOCUS

  // ── propias de `DXTEXTINPUTVIEW` ──────────────────────────────────────────────────────────
  ISSINGLELINE: '7fb1a412d3a028d2',       // DXTEXTINPUTVIEW_ISSINGLELINE
  MULTILINEMAXHEIGHT: '1e319938a3411144', // DXTEXTINPUTVIEW_MULTILINEMAXHEIGHT
  ISSHOWHINTNUM: '224ec4e23514ac4d',      // DXTEXTINPUTVIEW_ISSHOWHINTNUM
  COUNTNUMCOLOR: '7de5a3f514096865',      // DXTEXTINPUTVIEW_COUNTNUMCOLOR
  TOTALNUMCOLOR: '0080f3a65729d560',      // DXTEXTINPUTVIEW_TOTALNUMCOLOR
  TEXTINPUTDONE: '2decb71baebe5468',      // DXTEXTINPUTVIEW_TEXTINPUTDONE
} as const;

export type NombreAtributoEntrada = keyof typeof CLAVES_ENTRADA;

/** De dónde salió cada clave. **Para que nadie tenga que volver al binario.** */
export const PROCEDENCIA: Record<NombreAtributoEntrada, string> = {
  PLACEHOLDER: 'tabla · DXCARTTEXTINPUT_PLACEHOLDER',
  PLACEHOLDERCOLOR: 'tabla · DXCARTTEXTINPUT_PLACEHOLDERCOLOR',
  MAXLENGTH: 'tabla · DXCARTTEXTINPUT_MAXLENGTH',
  KEYBOARD: 'tabla · DXCARTTEXTINPUT_KEYBOARD',
  RETURNTYPE: 'tabla · DXCARTTEXTINPUT_RETURNTYPE',
  ONCHANGE: 'tabla · DXCARTTEXTINPUT_ONCHANGE',
  ONFINISH: 'tabla · DXCARTTEXTINPUT_ONFINISH',
  FOCUS: 'tabla · DXCARTTEXTINPUT_FOCUS',
  ISSINGLELINE: 'tabla · DXTEXTINPUTVIEW_ISSINGLELINE',
  MULTILINEMAXHEIGHT: 'tabla · DXTEXTINPUTVIEW_MULTILINEMAXHEIGHT',
  ISSHOWHINTNUM: 'tabla · DXTEXTINPUTVIEW_ISSHOWHINTNUM',
  COUNTNUMCOLOR: 'tabla · DXTEXTINPUTVIEW_COUNTNUMCOLOR',
  TOTALNUMCOLOR: 'tabla · DXTEXTINPUTVIEW_TOTALNUMCOLOR',
  TEXTINPUTDONE: 'tabla · DXTEXTINPUTVIEW_TEXTINPUTDONE',
};

/**
 * **`#AARRGGBB` de Taobao -> `#RRGGBBAA` de React Native.**
 *
 * **Este modulo nacio SIN esta funcion, el mismo dia que `precioAtributos`.** Los dos pintaban
 * colores de Taobao tal cual: React Native lee el alfa primero, asi que `#FFFF5000` (naranja
 * OPACO en Taobao) se convierte en alfa `00` y **sale invisible**. Es el cuarto modulo que
 * tropieza con esto.
 *
 * **Lo que faltaba no era cuidado, era una red**: la funcion esta copiada en cuatro modulos para
 * que cada uno siga siendo autocontenido (y se pueda probar en Node), y **nada obligaba a que
 * coincidieran**. `claves.test.mjs` ahora compara los cuatro contra una tabla de colores.
 */
export function canonizarColor(v: unknown): string | undefined {
  let hex: string | undefined;
  if (typeof v === 'string' && v.startsWith('#')) hex = v.slice(1).toUpperCase();
  else {
    const n = num(v);
    if (n === undefined) return undefined;
    hex = (n >>> 0).toString(16).padStart(8, '0').toUpperCase();
  }
  if (hex.length === 6) return '#' + hex;
  if (hex.length === 8) return '#' + hex.slice(2) + hex.slice(0, 2);
  return '#' + hex;
}

export type AtributosDxEntrada = Record<string, number | string | boolean | null | undefined>;

export interface ResolucionEntrada {
  /** El texto que se está escribiendo. **Lo pone el binding `$...`**, no el usuario del árbol. */
  texto?: string;
  marcador?: string;
  colorMarcador?: string;
  tamano?: number;
  color?: string;
  alineacion?: TextStyle['textAlign'];
  /** Tope de caracteres (`MAXLENGTH`). */
  maximoCaracteres?: number;
  /** **`ISSINGLELINE` invertido.** Ver la nota del valor por defecto en `resolverEntrada`. */
  multilinea: boolean;
  /** Altura máxima, sólo si es multilínea. */
  alturaMaxima?: number;
  /** `true` si Taobao pidió el contador `12/1000`. */
  mostrarContador: boolean;
  colorContador?: string;
  colorTotal?: string;
  /** Claves que se reconocen y NO se implementan, con su nombre. */
  noImplementados: NombreAtributoEntrada[];
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

/** `TEXTGRAVITY` → `textAlign`, con los valores que ya usa `textoAtributos`. */
const GRAVEDAD: Record<number, TextStyle['textAlign']> = { 0: 'left', 1: 'center', 2: 'right' };

/**
 * `KEYBOARD` y `RETURNTYPE` **se reconocen pero NO se implementan.**
 *
 * Sus enums **no se encontraron**: en `DXCartTextInputWidgetNode.java` los dos caen en
 * `getDefaultValueForIntAttr` y devuelven `0`. **Mapear a ojo sería inventar**, y un teclado
 * equivocado (numérico donde va texto) es un fallo que el usuario nota.
 *
 * Se declaran para que el servidor **vea** que el cliente no los pinta, en vez de mandarlos al
 * vacío. Es el mismo criterio que con `sticky` en la lista.
 */
const NO_IMPLEMENTADOS: NombreAtributoEntrada[] = [
  'KEYBOARD',
  'RETURNTYPE',
  'ONFINISH',
  'TEXTINPUTDONE',
  'FOCUS',
];

/**
 * Convierte los atributos de los dos widgets en lo que `TextInput` necesita.
 */
export function resolverEntrada(dx: AtributosDxEntrada = {}): ResolucionEntrada {
  const r: ResolucionEntrada = { multilinea: false, mostrarContador: false, noImplementados: [] };

  // ── el texto: CLAVES COMPARTIDAS con `Texto` ──
  const t = dx[TEXTO_COMPARTIDO.TEXT];
  if (t !== undefined && t !== null) r.texto = String(t);
  const col = canonizarColor(dx[TEXTO_COMPARTIDO.TEXTCOLOR]);
  if (col) r.color = col;
  const tam = num(dx[TEXTO_COMPARTIDO.TEXTSIZE]);
  if (tam !== undefined) r.tamano = tam;
  const grav = num(dx[TEXTO_COMPARTIDO.TEXTGRAVITY]);
  if (grav !== undefined && GRAVEDAD[grav]) r.alineacion = GRAVEDAD[grav];

  // ── propias de la entrada ──
  const ph = dx[CLAVES_ENTRADA.PLACEHOLDER];
  if (ph !== undefined && ph !== null) r.marcador = String(ph);
  const phc = canonizarColor(dx[CLAVES_ENTRADA.PLACEHOLDERCOLOR]);
  if (phc) r.colorMarcador = phc;

  const max = num(dx[CLAVES_ENTRADA.MAXLENGTH]);
  if (max !== undefined && max > 0) r.maximoCaracteres = Math.floor(max);

  // ── `ISSINGLELINE`: el inverso de `multiline`, y de OTRO widget ──
  //
  // **Decisión declarada**: si el atributo no viene, se asume UNA línea. Taobao devuelve `0`
  // por defecto para los atributos que el nodo no conoce, y `ISSINGLELINE: 0` leería como «no es
  // de una línea» = **multilínea**, lo que volvería multilínea todo campo por defecto. Se elige
  // lo contrario —un campo suelto es de una línea— y **se dice aquí** en vez de dejarlo mudo.
  const single = bool(dx[CLAVES_ENTRADA.ISSINGLELINE]);
  r.multilinea = single === undefined ? false : !single;

  const maxH = num(dx[CLAVES_ENTRADA.MULTILINEMAXHEIGHT]);
  if (maxH !== undefined && maxH > 0 && r.multilinea) r.alturaMaxima = maxH;

  // ── el contador `12/1000` ──
  const hint = bool(dx[CLAVES_ENTRADA.ISSHOWHINTNUM]);
  if (hint === true) r.mostrarContador = true;
  const cc = canonizarColor(dx[CLAVES_ENTRADA.COUNTNUMCOLOR]);
  if (cc) r.colorContador = cc;
  const tc = canonizarColor(dx[CLAVES_ENTRADA.TOTALNUMCOLOR]);
  if (tc) r.colorTotal = tc;

  for (const nombre of NO_IMPLEMENTADOS) {
    if (dx[CLAVES_ENTRADA[nombre]] !== undefined) r.noImplementados.push(nombre);
  }

  return r;
}

/** Todos los atributos que esta `Entrada` conoce. */
export function atributosDeLaEntrada(): NombreAtributoEntrada[] {
  return Object.keys(CLAVES_ENTRADA) as NombreAtributoEntrada[];
}

export default { CLAVES_ENTRADA, TEXTO_COMPARTIDO, TIPOS_ENTRADA, PROCEDENCIA, resolverEntrada, atributosDeLaEntrada };
