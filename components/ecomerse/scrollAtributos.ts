/**
 * Scroll · resolución de atributos del widget `DXSCROLLERLAYOUT` de Taobao
 * =======================================================================
 *
 * **Puro a propósito**: el oráculo de fidelidad importa este módulo directamente.
 *
 * ## Uso real: 36 nodos · 25 de 42 atributos (60 %) en su propio tipo
 *
 * El 40 % restante cae en `SLIDER` (15 usos) — **y tiene sentido: los dos son contenedores
 * que se desplazan.** Comparten `ORIENTATION` y `SHOW_INDICATOR`.
 *
 * ## Y dos nombres distintos para la misma clave, medido
 *
 * ```
 * DXSCROLLERLAYOUT_ENABLESMOOTHSCROLL    == DX_SCROLLER_LAYOUT_ENABLE_SMOOTH_SCROLL   67fb87e076af86f5
 * DXSCROLLERLAYOUT_OPENSCROLLERANIMATION == DX_SCROLLER_LAYOUT_OPEN_SCROLLER_ANIMATION 9d22ed9f99766bad
 * ```
 *
 * **La misma clave declarada dos veces con nombres distintos.** Es la misma anomalía que
 * `SCALETYPE` y `CORNERRADIUS`, pero dentro del mismo widget: **el nombre no es identidad;
 * la clave sí.**
 */

// ─────────────────────────── las claves ───────────────────────────

/**
 * Claves `long` de `DXSCROLLERLAYOUT`, en hex de 16.
 *
 * **Extraídas con script de `tabla-claves.json`**, no tecleadas. Es la regla que quedó tras
 * haber escrito hex inventados dos veces.
 */
export const CLAVES_SCROLL = {
  /** `DXSCROLLERLAYOUT_DISABLEBOUNCES`. */
  DESACTIVAR_REBOTE: '94d84af3275759b1',
  /** `DXSCROLLERLAYOUT_ENABLESMOOTHSCROLL` (== `DX_SCROLLER_LAYOUT_ENABLE_SMOOTH_SCROLL`). */
  DESPLAZAMIENTO_SUAVE: '67fb87e076af86f5',
  /** `DXSCROLLERLAYOUT_NESTEDSCROLLINGENABLED`. */
  SCROLL_ANIDADO: '0857c145698d3af1',
  /** `DXSCROLLERLAYOUT_VELOCITYSPEED`. */
  VELOCIDAD: '862fd1efa9da236d',
  /** `DXSCROLLERLAYOUT_IGNOREREPEATRENDER`. */
  IGNORAR_RENDER_REPETIDO: 'eb0b3b994af25257',
  /** `DX_SCROLLER_LAYOUT_CONTENT_OFFSET`. */
  DESPLAZAMIENTO_INICIAL: '184c1a61a546d96f',
  /** `DX_SCROLLER_LAYOUT_IS_SUPPORT_RECYCLE`. */
  SOPORTA_RECICLADO: '70fcc696ad010bb0',
  /** `DX_SCROLLER_LAYOUT_ITEM_PREFETCH`. */
  PREFETCH: '33a770d7553c3bec',
  /** Compartida con `Carrusel`: `DX_SCROLL_LAYOUT_BASE_SHOW_INDICATOR`. */
  MOSTRAR_INDICADOR: 'cbbfeefe62c2246b',
  /** Compartida con `Carrusel`: `DX_SCROLL_LAYOUT_BASE_INDICATOR_ID`. */
  ID_INDICADOR: '63de61898ca79d75',
  /** Compartida con `Contenedor` y `Carrusel`. */
  ORIENTACION: '9c173339fd9791b7',
  // Del ciclo de vida de Android.
  /** `DXSCROLLERLAYOUT_ANDROIDFIXSCROLLVERTICALCONFLICT`. */
  ARREGLO_CONFLICTO_VERTICAL_ANDROID: '2a3a6f20e3548606',
  /** `DXSCROLLERLAYOUT_DISABLECONTENTOFFSETRESET`. */
  DESACTIVAR_RESET_OFFSET_ANDROID: '9756f63199cabe32',
  /** Compartida con `Carrusel`: `OPENSCROLLERANIMATION`. */
  ANIMACION_APERTURA: '9d22ed9f99766bad',
} as const;

/** El **ID DE TIPO** del widget. */
export const TIPO_DXSCROLLERLAYOUT = '480f2cdb5773b9d2';

export type NombreAtributoScroll = keyof typeof CLAVES_SCROLL;

/** **Todos** los nombres vienen de la tabla: aquí no hay inferencia. */
export const CONFIANZA: Record<NombreAtributoScroll, 'tabla'> = {
  DESACTIVAR_REBOTE: 'tabla', DESPLAZAMIENTO_SUAVE: 'tabla', SCROLL_ANIDADO: 'tabla',
  VELOCIDAD: 'tabla', IGNORAR_RENDER_REPETIDO: 'tabla', DESPLAZAMIENTO_INICIAL: 'tabla',
  SOPORTA_RECICLADO: 'tabla', PREFETCH: 'tabla', MOSTRAR_INDICADOR: 'tabla',
  ID_INDICADOR: 'tabla', ORIENTACION: 'tabla', ARREGLO_CONFLICTO_VERTICAL_ANDROID: 'tabla',
  DESACTIVAR_RESET_OFFSET_ANDROID: 'tabla', ANIMACION_APERTURA: 'tabla',
};

// ─────────────────────────── los enums ───────────────────────────

/** `DX_VIEW_ORIENTATION`, del `enumMap` real. La misma que en `Contenedor`. */
export const ORIENTACION = Object.freeze({ 0: 'horizontal', 1: 'vertical' } as Record<number, string>);

// ─────────────────────────── resolución ───────────────────────────

export type AtributosDxScroll = Record<string, number | string | boolean | null | undefined>;

/** Lo que `Scroll` resuelve, en forma neutra. */
export interface ResolucionScroll {
  horizontal: boolean;
  /** `true` si Taobao pidió quitar el efecto de rebote. */
  sinRebote: boolean;
  /** `true` si pidió desplazamiento suave. */
  suave: boolean;
  /** `true` si pidió permitir scroll anidado. */
  anidado: boolean;
  /** Posición inicial, si Taobao la fijó. */
  desplazamientoInicial?: number;
  /** Velocidad de desplazamiento, si Taobao la fijó. */
  velocidad?: number;
  /** `true` si hay que mostrar los puntos de posición. */
  mostrarIndicador: boolean;
  /** El ID del nodo que hace de indicador. **Se expone, no se resuelve.** */
  idIndicador?: string;
  /** Atributos que **no** se implementan, declarados en vez de olvidados. */
  noImplementados: NombreAtributoScroll[];
}

function numero(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/** Taobao manda los booleanos como `0`/`1`, y a veces como la cadena `"false"`. */
function bool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'false' || s === '0' || s === '') return false;
    if (s === 'true' || s === '1') return true;
    const n = Number(s);
    if (Number.isFinite(n)) return n !== 0;
  }
  return undefined;
}

/**
 * Los que se declaran en vez de implementarse.
 *
 * - Los tres de Android: no tienen equivalente en React Native.
 * - `SOPORTA_RECICLADO`, `PREFETCH` e `IGNORAR_RENDER_REPETIDO`: son del motor de reciclado de
 *   vistas de Android. **React Native recicla por su cuenta** (`FlatList`), y aquí el contenedor
 *   monta todos los hijos — **si el Mercado necesita reciclado de verdad, eso es `FlatList`, no
 *   este componente.** Decirlo es más útil que fingir que se implementa.
 */
const NO_IMPLEMENTADOS: NombreAtributoScroll[] = [
  'ARREGLO_CONFLICTO_VERTICAL_ANDROID',
  'DESACTIVAR_RESET_OFFSET_ANDROID',
  'ANIMACION_APERTURA',
  'SOPORTA_RECICLADO',
  'PREFETCH',
  'IGNORAR_RENDER_REPETIDO',
];

/**
 * Convierte los atributos del scroll a forma neutra.
 */
export function resolverScroll(dx: AtributosDxScroll = {}): ResolucionScroll {
  const orient = numero(dx[CLAVES_SCROLL.ORIENTACION]);

  const r: ResolucionScroll = {
    // Se implementa lo que dice el dato: `1` es vertical, que es además el caso normal
    // de un contenedor de scroll.
    horizontal: orient !== undefined && ORIENTACION[orient] === 'horizontal',
    sinRebote: bool(dx[CLAVES_SCROLL.DESACTIVAR_REBOTE]) === true,
    suave: bool(dx[CLAVES_SCROLL.DESPLAZAMIENTO_SUAVE]) === true,
    anidado: bool(dx[CLAVES_SCROLL.SCROLL_ANIDADO]) === true,
    mostrarIndicador: bool(dx[CLAVES_SCROLL.MOSTRAR_INDICADOR]) === true,
    noImplementados: [],
  };

  const off = numero(dx[CLAVES_SCROLL.DESPLAZAMIENTO_INICIAL]);
  if (off !== undefined) r.desplazamientoInicial = off;
  const vel = numero(dx[CLAVES_SCROLL.VELOCIDAD]);
  if (vel !== undefined) r.velocidad = vel;
  const id = dx[CLAVES_SCROLL.ID_INDICADOR];
  if (typeof id === 'string' && id) r.idIndicador = id;

  for (const k of NO_IMPLEMENTADOS) if (dx[CLAVES_SCROLL[k]] !== undefined) r.noImplementados.push(k);

  return r;
}

export default {
  CLAVES_SCROLL, CONFIANZA, ORIENTACION, TIPO_DXSCROLLERLAYOUT, resolverScroll,
};
