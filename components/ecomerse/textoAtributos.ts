/**
 * Texto · resolución de atributos del VOCABULARIO DE TEXTO de Taobao
 * =================================================================
 *
 * **Puro a propósito**, como los demás: el oráculo importa este módulo directamente.
 *
 * ## El hallazgo que reduce el trabajo
 *
 * Taobao tiene **cuatro widgets de texto** (`DXTEXTVIEW`, `DXRICHTEXT`, `DXTEXTSPAN`,
 * `DXFASTTEXTVIEW`) — y **comparten las claves**. Verificado:
 *
 * ```
 * DXTEXTSPAN_TEXT == DXCARTTEXTSPAN_TEXT == DXCARTTEXTINPUT_TEXT   → 00000008e396ac59
 * DXRICHTEXT_TEXTCOLOR == DXTEXTSPAN_ == DXMEGAPRICEVIEW_ == DXCARTTEXTINPUT_  → 4fa0a53cf9ff05cd
 * DXRICHTEXT_TEXTSIZE  == DXTEXTSPAN_ == DXMEGAPRICEVIEW_ == DXCARTTEXTINPUT_  → 5db0637a915fa268
 * ```
 *
 * **La clave es del ATRIBUTO, no del widget.** Implementar esto una vez sirve para
 * `DXRICHTEXT`, `DXTEXTSPAN`, `DXCARTTEXTSPAN`, `DXCARTTEXTINPUT` y `DXMEGAPRICEVIEW`.
 *
 * Y `DXTEXTVIEW` **no tiene atributos propios**: su única entrada es su ID de tipo
 * (`dae9dad699db9648`). Todo lo que usa viene de este vocabulario compartido.
 *
 * ## Uso real medido sobre las 246 plantillas — es el componente MÁS usado
 *
 * `TEXT` **220** · `TEXTCOLOR` **220** · `TEXTSIZE` **220** · `EVENT_TAP` **207** ·
 * `ISBOLD` **165** · `LINEBREAKMODE` **165** · `TEXTGRAVITY` **141** · `MAXLINES` **116** ·
 * `MAXWIDTH` 64 · `FONT` 54 · `LINESPACING` 38 · `LINEHEIGHT` 16 · `FONTWEIGHT` 15 …
 *
 * **31 de 62 claves del vocabulario están en uso.**
 *
 * ## Los enums, con sus nombres reales
 *
 * ```
 * TEXTGRAVITY     0=left · 1=center · 2=right
 * LINEBREAKMODE   0=none · 1=start · 2=middle · 3=end · 4=char
 * ISBOLD          0=false · 1=true
 * ```
 */

// ─────────────────────────── las claves ───────────────────────────

/**
 * Claves `long` del vocabulario de texto, en hex de 16.
 *
 * **Copiadas de `tabla-claves.json` con un script, no a mano** — y verificadas por
 * `mercado-fase1/o1-oraculo/test/claves.test.mjs`. Ese test existe porque en
 * `imagenAtributos.ts` se llegaron a escribir hex inventados.
 */
export const CLAVES_TEXTO = {
  TEXT: '00000008e396ac59',
  TEXTCOLOR: '4fa0a53cf9ff05cd',
  TEXTSIZE: '5db0637a915fa268',
  TEXTGRAVITY: 'ea489e00edd43eb6',
  MAXLINES: '4104ac824834d149',
  FONT: '00000007f3748b6b',
  ISBOLD: '00217a84c0a4e823',
  FONTWEIGHT: 'e9f178c344298c29',
  LINESPACING: 'df1efa2adfdd6878',
  LINEHEIGHT: '547793880a65750b',
  LINEBREAKMODE: '16e689cf8629401f',
  FIXBREAKMODE: '0f96048fb67c5ebd',
  FORCEORIGINAL: 'a5edb5c6729d6851',
  BASELINE: '141059aa7cbbd94b',
  SHRINKLINES: '46a710649cbe1195',
  EXPANDED: '20b08b52ea925251',
  MAXWIDTH: '4104acaeac93fd4e',
  ISITALIC: '30f463d79fdbaf3a',
  ONPRESS: '47d68a4bafe73f71',
  ISTRUNCATED: 'e7eb29d91eb3c891',
  SHADOWCOLOR: '9b12478c7e317490',
  SHADOWRADIUS: 'f2ddcb334e1722fa',
  SHADOWOFFSET: 'f2dd0aa8471721f9',
} as const;

export type NombreAtributoTexto = keyof typeof CLAVES_TEXTO;

// ─────────────────────────── los enums, con nombre ───────────────────────────

/** `TEXTGRAVITY` → `textAlign` de React Native. Los valores son los del `enumMap` real. */
export const GRAVEDAD = Object.freeze({ 0: 'left', 1: 'center', 2: 'right' } as Record<number, 'left' | 'center' | 'right'>);

/**
 * `LINEBREAKMODE` → `ellipsizeMode` de React Native.
 *
 * **Es una decisión declarada, no una equivalencia.** React Native tiene cuatro modos
 * (`head`, `middle`, `tail`, `clip`); Taobao tiene cinco. Los dos que no encajan se mapean:
 *
 * | Taobao | RN | Nota |
 * |---|---|---|
 * | `none` (0) | — | sin `numberOfLines`: no se trunca |
 * | `start` (1) | `head` | |
 * | `middle` (2) | `middle` | |
 * | `end` (3) | **`tail`** | **el más usado: 437 veces** |
 * | `char` (4) | `tail` | RN no trunca por carácter; la diferencia queda declarada |
 */
export const TRUNCADO = Object.freeze({
  1: 'head', 2: 'middle', 3: 'tail', 4: 'tail',
} as Record<number, 'head' | 'middle' | 'tail'>);

// ─────────────────────────── resolución ───────────────────────────

export type AtributosDxTexto = Record<string, number | string | boolean | null | undefined>;

/** Lo que `Texto` resuelve, en forma neutra (sin tipos de React Native). */
export interface ResolucionTexto {
  contenido: string | null;
  color?: string;
  tamano?: number;
  alineacion?: 'left' | 'center' | 'right';
  /** `undefined` = sin límite (Taobao usa `-1`). */
  lineasMaximas?: number;
  truncado?: 'head' | 'middle' | 'tail';
  negrita: boolean;
  cursiva: boolean;
  familia?: string;
  peso?: string;
  interlineado?: number;
  /** `MAXWIDTH` es LAYOUT: se implementa, no se compara por valor. */
  anchoMaximo?: number;
  ajustarTamano: boolean;
  sombra?: { color?: string; radio?: number; desplazamiento?: number };
  /** `true` si Taobao traía un manejador de toque. */
  tieneToque: boolean;
  /** Atributos que **no se implementan**, declarados en vez de olvidados. */
  noImplementados: NombreAtributoTexto[];
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/** Canoniza un color a `#RRGGBB` o `#AARRGGBB`. */
export function canonizarColor(v: unknown): string | undefined {
  let hex: string | undefined;
  if (typeof v === 'string' && v.startsWith('#')) hex = v.slice(1).toUpperCase();
  else {
    const n = num(v);
    if (n === undefined) return undefined;
    hex = (n >>> 0).toString(16).padStart(8, '0').toUpperCase();
  }
  if (hex.length === 6) return '#' + hex;                       // ya es RRGGBB
  if (hex.length === 8) return '#' + hex.slice(2) + hex.slice(0, 2); // AARRGGBB -> RRGGBBAA
  return '#' + hex;
}

/** Atributos del vocabulario que **no** se implementan en esta versión, y por qué. */
const NO_IMPLEMENTADOS: NombreAtributoTexto[] = [
  'FORCEORIGINAL',    // comportamiento del pipeline de texto de Android
  'BASELINE',         // alineación por línea base: Android
  'EXPANDED',         // expandir/contraer: necesita estado y un «ver más»
  'ISTRUNCATED',      // lo informa el motor tras medir; aquí lo daría el layout
  'FIXBREAKMODE',     // modo de corte de línea de Android
];

/**
 * Convierte los atributos del vocabulario de texto a forma neutra.
 */
export function resolverTexto(dx: AtributosDxTexto = {}): ResolucionTexto {
  const crudo = dx[CLAVES_TEXTO.TEXT];
  const contenido = crudo === undefined || crudo === null ? null : String(crudo);

  const r: ResolucionTexto = {
    contenido,
    negrita: num(dx[CLAVES_TEXTO.ISBOLD]) === 1,
    cursiva: num(dx[CLAVES_TEXTO.ISITALIC]) === 1,
    ajustarTamano: dx[CLAVES_TEXTO.SHRINKLINES] !== undefined,
    tieneToque: dx[CLAVES_TEXTO.ONPRESS] !== undefined,
    noImplementados: NO_IMPLEMENTADOS.filter((n) => dx[CLAVES_TEXTO[n]] !== undefined),
  };

  r.color = canonizarColor(dx[CLAVES_TEXTO.TEXTCOLOR]);
  const tam = num(dx[CLAVES_TEXTO.TEXTSIZE]);
  if (tam !== undefined) r.tamano = tam;

  const grav = num(dx[CLAVES_TEXTO.TEXTGRAVITY]);
  if (grav !== undefined && GRAVEDAD[grav]) r.alineacion = GRAVEDAD[grav];

  // `MAXLINES = -1` significa SIN LÍMITE en Taobao: se traduce a «no poner `numberOfLines`».
  const max = num(dx[CLAVES_TEXTO.MAXLINES]);
  if (max !== undefined && max >= 0) r.lineasMaximas = max;

  const lbm = num(dx[CLAVES_TEXTO.LINEBREAKMODE]);
  if (lbm !== undefined && TRUNCADO[lbm]) r.truncado = TRUNCADO[lbm];

  const fuente = dx[CLAVES_TEXTO.FONT];
  if (typeof fuente === 'string' && fuente) r.familia = fuente;
  const peso = dx[CLAVES_TEXTO.FONTWEIGHT];
  if (peso !== undefined && peso !== null) r.peso = String(peso);

  // `LINESPACING` manda sobre `LINEHEIGHT` cuando están los dos.
  const inter = num(dx[CLAVES_TEXTO.LINESPACING]) ?? num(dx[CLAVES_TEXTO.LINEHEIGHT]);
  if (inter !== undefined) r.interlineado = inter;

  const ancho = num(dx[CLAVES_TEXTO.MAXWIDTH]);
  if (ancho !== undefined) r.anchoMaximo = ancho;

  const sc = canonizarColor(dx[CLAVES_TEXTO.SHADOWCOLOR]);
  const sr = num(dx[CLAVES_TEXTO.SHADOWRADIUS]);
  const so = num(dx[CLAVES_TEXTO.SHADOWOFFSET]);
  if (sc || sr !== undefined || so !== undefined) {
    r.sombra = { color: sc, radio: sr, desplazamiento: so };
  }

  return r;
}

export default { CLAVES_TEXTO, GRAVEDAD, TRUNCADO, resolverTexto, canonizarColor };
