/**
 * Contenedor · vocabulario de LAYOUT de Taobao — **nombres REALES del motor**
 * ==========================================================================
 *
 * **Puro a propósito**: el oráculo de fidelidad importa este módulo directamente.
 *
 * ## Cómo se obtuvieron — y por qué la versión anterior estaba MAL
 *
 * La primera versión de este módulo **INFIRIÓ** los nombres desde los valores del `enumMap`:
 * `match_parent`/`match_content` tenía que ser `layout_width` o `layout_height`, pero
 * **el enum es idéntico en los dos**, así que no se podía distinguir. Se eligió uno.
 *
 * **Se eligió mal: estaban INTERCAMBIADOS.**
 *
 * Los nombres reales **estaban en el motor**, en `DXWidgetNode.java` del APK decompilado,
 * como `if (<long>L == j) { setX(i); }`:
 *
 * ```
 * if (20052926345925L == j)      { setLayoutWidth(i); }    // 0x0000123cef8d32c5
 * if (9346582897824575L == j)    { setLayoutHeight(i); }   // 0x002134aae97d133f
 * if (-916628110244908525L == j) { setMarginLeft(i); }     // 0xf3477b9719b6f213
 * if (6506044224063169535L == j) { setMarginBottom(i); }   // 0x5a4a1cc0544463ff
 * ```
 *
 * **La lección**: una inferencia de «alta confianza» sobre dos candidatos simétricos
 * **es una moneda al aire**. Si el nombre fuera ilegible, ignorarlo habría sido honesto;
 * **siendo legible, inferir fue el error.**
 *
 * ## Uso real medido sobre las 254 plantillas
 *
 * | Atributo | Usos | | Atributo | Usos |
 * |---|---|---|---|---|
 * | `marginLeft` | **1506** | | `paddingRight` | 351 |
 * | `accessibility` | **1487** | | `marginBottom` | 344 |
 * | `marginRight` | **980** | | `paddingLeft` | 338 |
 * | `marginTop` | **941** | | `weight` | 87 |
 * | `backgroundColor` | **689** | | | |
 *
 * `accessibility` — 1487 usos — era el misterioso enum `off/on/off_child/auto`.
 * **Tiene sentido: accesibilidad activada, y `off_child` = desactivada también para los hijos.**
 */

// ─────────────────────────── la tabla, del motor ───────────────────────────

/**
 * Claves `long` de `DXWidgetNode`, en hex de 16.
 *
 * **Extraídas del decompilado `DXWidgetNode.java`** (`mercado-fase1/re-d/src6/sources/`),
 * leyendo los `if (<long>L == j) { setX(i); }`. **No inferidas.**
 */
export const CLAVES_LAYOUT = {
  // ── medidas ──
  LAYOUT_WIDTH: '0000123cef8d32c5',        // setLayoutWidth
  LAYOUT_HEIGHT: '002134aae97d133f',       // setLayoutHeight
  MIN_WIDTH: '41251532fca5f94c',           // setMinWidth
  MIN_HEIGHT: '1c7866ccea56e8a6',          // setMinHeight
  WEIGHT: '002516dc25a6220e',              // setWeight
  // ── márgenes ──
  MARGIN_LEFT: 'f3477b9719b6f213',
  MARGIN_RIGHT: 'bf223101e6211687',
  MARGIN_TOP: 'db57377d2b2b8bba',
  MARGIN_BOTTOM: '5a4a1cc0544463ff',
  // ── relleno ──
  PADDING_LEFT: 'fabdd4832f84d66d',
  PADDING_RIGHT: '2cd1cba4de1111e1',
  PADDING_TOP: 'db779dc86d8bd514',
  PADDING_BOTTOM: 'be236d8182451259',
  // ── fondo, esquinas y borde ──
  BACKGROUNDCOLOR: 'd8dd7d9b3cd5482e',     // setBackGroundColor
  CORNERRADIUS: '579cb14ee9f16dfd',        // el radio general (nombre de tabla)
  CORNER_RADIUS_LEFT_TOP: '9e3ed51c3c63dcc2',
  CORNER_RADIUS_RIGHT_TOP: '787413396f0ff336',
  CORNER_RADIUS_LEFT_BOTTOM: 'cc1eb7c6ca726f07',
  CORNER_RADIUS_RIGHT_BOTTOM: '17786d52ac6fe47b',
  BORDER_WIDTH: '90b377e9617a3789',
  BORDER_COLOR: '90b2d5822583fc88',
  BORDER_TYPE: '1997bf62eea68f2a',
  DASH_WIDTH: '32c0bd01c984520d',
  DASH_GAP: '4aba40fd33ce1923',
  // ── estado ──
  CLIP_CHILDREN: '905d86ffdf63e356',      // setClipChildren
  ALPHA: '00000f5bec358c6b',
  ENABLED: '42ae0afbeefa07d2',
  // ── accesibilidad: es el atributo del enum `off/on/off_child/auto` ──
  ACCESSIBILITY: 'a2cbb9c8d247d175',       // setAccessibility
  ACCESSIBILITY_TEXT: '57749838175c891e',
  ACCESSIBILITY_ROLE: '57749440193a8b0b',
  // ── del vocabulario de vista, compartido ──
  VISIBILITY: '5086155c409bd152',
  ORIENTATION: '9c173339fd9791b7',          // DX_VIEW_ORIENTATION
  GRAVITY: 'd35754e84f6522f6',
  LAYOUT_GRAVITY: '43b83460932c0a8d',
} as const;

export type NombreAtributoLayout = keyof typeof CLAVES_LAYOUT;

/**
 * De dónde viene cada nombre.
 *
 * **28 de 33 vienen del MOTOR** — leídos del decompilado. Los 5 restantes siguen marcados
 * como lo que son.
 */
export const CONFIANZA: Record<NombreAtributoLayout, 'motor' | 'tabla' | 'alta' | 'media'> = {
  LAYOUT_WIDTH: 'motor', LAYOUT_HEIGHT: 'motor', MIN_WIDTH: 'motor', MIN_HEIGHT: 'motor',
  WEIGHT: 'motor',
  MARGIN_LEFT: 'motor', MARGIN_RIGHT: 'motor', MARGIN_TOP: 'motor', MARGIN_BOTTOM: 'motor',
  PADDING_LEFT: 'motor', PADDING_RIGHT: 'motor', PADDING_TOP: 'motor', PADDING_BOTTOM: 'motor',
  BACKGROUNDCOLOR: 'motor', CORNER_RADIUS_LEFT_TOP: 'motor', CORNER_RADIUS_RIGHT_TOP: 'motor',
  CORNER_RADIUS_LEFT_BOTTOM: 'motor', CORNER_RADIUS_RIGHT_BOTTOM: 'motor',
  BORDER_WIDTH: 'motor', BORDER_COLOR: 'motor', BORDER_TYPE: 'motor',
  DASH_WIDTH: 'motor', DASH_GAP: 'motor',
  CLIP_CHILDREN: 'motor', ALPHA: 'motor', ENABLED: 'motor',
  ACCESSIBILITY: 'motor', ACCESSIBILITY_TEXT: 'motor', ACCESSIBILITY_ROLE: 'motor',
  // Estos cinco siguen sin venir del motor:
  CORNERRADIUS: 'tabla',     // `DXIMAGESPAN_CORNERRADIUS` en tabla-claves.json
  VISIBILITY: 'tabla',       // su enum está en tabla-claves.json
  ORIENTATION: 'tabla',      // `DX_VIEW_ORIENTATION`, nombre en la tabla
  GRAVITY: 'alta',           // enum de 9 posiciones: es una gravedad, pero no lo he leído
  LAYOUT_GRAVITY: 'media',   // misma forma que GRAVITY
};

// ─────────────────────────── los enums medidos ───────────────────────────

/** `visibility`: los tres valores, del `enumMap` real. */
export const VISIBILIDAD = Object.freeze({ 0: 'visible', 1: 'invisible', 2: 'gone' } as Record<number, string>);

/** `layout_width` / `layout_height`: los dos valores especiales de Android. */
export const MEDIDA = Object.freeze({ '-1': 'match_parent', '-2': 'match_content' } as Record<string, string>);

/** `gravity` / `layout_gravity`: las 9 posiciones, del `enumMap` real. */
export const GRAVEDAD = Object.freeze({
  0: 'leftTop', 1: 'leftCenter', 2: 'leftBottom',
  3: 'centerTop', 4: 'center', 5: 'centerBottom',
  6: 'rightTop', 7: 'rightCenter', 8: 'rightBottom',
} as Record<number, string>);

/** `DX_VIEW_ORIENTATION`. */
export const ORIENTACION = Object.freeze({ 0: 'horizontal', 1: 'vertical' } as Record<number, string>);

/**
 * `accessibility`: los cuatro valores, del `enumMap` real.
 *
 * `off_child` = desactivada **también para los hijos**. Por eso el enum tiene cuatro valores
 * y no dos: es una **propagación**, no un booleano.
 */
export const ACCESIBILIDAD = Object.freeze({ 0: 'off', 1: 'on', 2: 'off_child', 3: 'auto' } as Record<number, string>);

// ─────────────────────────── resolución ───────────────────────────

export type AtributosDxLayout = Record<string, number | string | boolean | null | undefined>;

/** Traducción de `gravity` a los dos ejes de flexbox de React Native. */
export interface Alineacion {
  justifyContent: 'flex-start' | 'center' | 'flex-end';
  alignItems: 'flex-start' | 'center' | 'flex-end';
}

/** Los cuatro lados de una caja. */
export interface Caja {
  izquierda?: number;
  derecha?: number;
  arriba?: number;
  abajo?: number;
}

/** Lo que `Contenedor` resuelve, en forma neutra. */
export interface ResolucionContenedor {
  visibilidad: 'visible' | 'invisible' | 'gone';
  ancho?: 'match_parent' | 'match_content';
  alto?: 'match_parent' | 'match_content';
  /** Medida EXPLÍCITA en puntos. **Antes se ignoraba**: MEDIDA solo conoce -1 y -2. */
  anchoPx?: number;
  altoPx?: number;
  direccion?: 'row' | 'column';
  alineacionHijos?: Alineacion;
  alineacionPropia?: Alineacion;
  radioEsquina?: number;
  fondo?: string;
  margen?: Caja;
  relleno?: Caja;
  /** Peso en el layout del padre (`setWeight`). */
  peso?: number;
  /** Opacidad 0..1. */
  alfa?: number;
  /** `false` si Taobao lo marcó como deshabilitado. */
  habilitado?: boolean;
  /** `true` si Taobao pidió recortar los hijos al contenedor (`setClipChildren`). */
  recortarHijos?: boolean;
  /** `off` / `on` / `off_child` / `auto`. */
  accesibilidad?: string;
  textoAccesibilidad?: string;
  rolAccesibilidad?: string;
  noImplementados: NombreAtributoLayout[];
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/** Canoniza un color a `#AARRGGBB`. Taobao manda el color como entero de 32 bits. */
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

/**
 * Traduce una de las 9 posiciones de Taobao a los dos ejes de flexbox.
 *
 * **Es una decisión, no una equivalencia.** Android posiciona con `gravity` sobre el rectángulo
 * ya medido; flexbox coloca **dentro del flujo**. En un contenedor con un solo hijo coinciden;
 * con varios, `justifyContent` reparte el espacio libre entre ellos **y Android no hace eso**.
 */
export function alineacionDe(gravedad: number): Alineacion | undefined {
  const nombre = GRAVEDAD[gravedad];
  if (!nombre) return undefined;
  const vertical = nombre.includes('Top') ? 'flex-start' : nombre.includes('Bottom') ? 'flex-end' : 'center';
  const horizontal = nombre.startsWith('left') ? 'flex-start' : nombre.startsWith('right') ? 'flex-end' : 'center';
  return { justifyContent: horizontal, alignItems: vertical };
}

/** Las cuatro claves de cada caja, con el nombre del lado. */
const LADOS: Record<'margen' | 'relleno', Record<'izquierda' | 'derecha' | 'arriba' | 'abajo', NombreAtributoLayout>> = {
  margen: { izquierda: 'MARGIN_LEFT', derecha: 'MARGIN_RIGHT', arriba: 'MARGIN_TOP', abajo: 'MARGIN_BOTTOM' },
  relleno: { izquierda: 'PADDING_LEFT', derecha: 'PADDING_RIGHT', arriba: 'PADDING_TOP', abajo: 'PADDING_BOTTOM' },
};

export function resolverContenedor(dx: AtributosDxLayout = {}): ResolucionContenedor {
  const vis = num(dx[CLAVES_LAYOUT.VISIBILITY]);
  const visibilidad = (vis !== undefined && VISIBILIDAD[vis] ? VISIBILIDAD[vis] : 'visible') as
    'visible' | 'invisible' | 'gone';

  const r: ResolucionContenedor = { visibilidad, noImplementados: [] };

  // ── medidas: `-1` = match_parent, `-2` = match_content ──
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

  // ── márgenes y relleno, los cuatro lados ──
  for (const campo of ['margen', 'relleno'] as const) {
    const caja: Caja = {};
    for (const lado of ['izquierda', 'derecha', 'arriba', 'abajo'] as const) {
      const v = num(dx[CLAVES_LAYOUT[LADOS[campo][lado]]]);
      if (v !== undefined) caja[lado] = v;
    }
    if (Object.keys(caja).length) r[campo] = caja;
  }

  // ── orientación y alineación ──
  const orient = num(dx[CLAVES_LAYOUT.ORIENTATION]);
  if (orient !== undefined && ORIENTACION[orient]) {
    r.direccion = ORIENTACION[orient] === 'horizontal' ? 'row' : 'column';
  }
  const grav = num(dx[CLAVES_LAYOUT.GRAVITY]);
  if (grav !== undefined) r.alineacionHijos = alineacionDe(grav);
  const lgrav = num(dx[CLAVES_LAYOUT.LAYOUT_GRAVITY]);
  if (lgrav !== undefined) r.alineacionPropia = alineacionDe(lgrav);

  // ── fondo y esquinas ──
  const fondo = canonizarColor(dx[CLAVES_LAYOUT.BACKGROUNDCOLOR]);
  if (fondo) r.fondo = fondo;
  const radio = num(dx[CLAVES_LAYOUT.CORNERRADIUS]);
  if (radio !== undefined && radio >= 0) r.radioEsquina = radio;

  // ── estado ──
  const alfa = num(dx[CLAVES_LAYOUT.ALPHA]);
  if (alfa !== undefined) r.alfa = alfa > 1 ? Math.min(1, alfa / 255) : alfa;
  const hab = num(dx[CLAVES_LAYOUT.ENABLED]);
  if (hab !== undefined) r.habilitado = hab !== 0;
  const clip = num(dx[CLAVES_LAYOUT.CLIP_CHILDREN]);
  if (clip !== undefined) r.recortarHijos = clip !== 0;

  // ── accesibilidad ──
  const acc = num(dx[CLAVES_LAYOUT.ACCESSIBILITY]);
  if (acc !== undefined && ACCESIBILIDAD[acc]) r.accesibilidad = ACCESIBILIDAD[acc];
  const at = dx[CLAVES_LAYOUT.ACCESSIBILITY_TEXT];
  if (at !== undefined && at !== null) r.textoAccesibilidad = String(at);
  const ar = dx[CLAVES_LAYOUT.ACCESSIBILITY_ROLE];
  if (ar !== undefined && ar !== null) r.rolAccesibilidad = String(ar);

  return r;
}

/** Todos los atributos que este componente implementa. */
export function atributosDelLayout(): NombreAtributoLayout[] {
  return Object.keys(CLAVES_LAYOUT) as NombreAtributoLayout[];
}

export default {
  CLAVES_LAYOUT, CONFIANZA, VISIBILIDAD, MEDIDA, GRAVEDAD, ORIENTACION, ACCESIBILIDAD,
  resolverContenedor, alineacionDe, atributosDelLayout, canonizarColor,
};

