/**
 * Carrusel · resolución de atributos del widget `DXSLIDERLAYOUT` de Taobao
 * =======================================================================
 *
 * **Puro a propósito**: el oráculo de fidelidad importa este módulo directamente.
 *
 * ## El componente con los datos más limpios de todos — medido
 *
 * ```
 * 43 nodos · 175 atributos usados · 171 (98 %) caen en DXSLIDERLAYOUT mismo
 * ```
 *
 * **Prácticamente no comparte nada.** Comparado con `DXTABHEADERLAYOUT` (2 nodos, 10 %
 * propios) o `DXVIDEOVIEW` (0 nodos), este es el caso claro.
 *
 * ## Sus atributos, con nombre
 *
 * | Atributo | Usos | Qué es |
 * |---|---|---|
 * | `DX_VIEW_ORIENTATION` | 43 | dirección del desplazamiento — **clave compartida con `Contenedor`** |
 * | `MANUAL_SWITCH_ENABLED` | 39 | el usuario puede deslizar |
 * | `SHOW_INDICATOR` | 38 | pintar los puntos |
 * | `AUTO_SCROLL_INTERVAL` | 35 | **en milisegundos**: 3000, 1000, 1500 |
 * | `AUTO_SCROLL` | 26 | avance automático |
 * | `IS_INFINITE` | 20 | bucle |
 * | `INDICATOR_ID` | 19 | **el ID de OTRO nodo** con los puntos |
 * | `AVOIDINCESSANTSCROLL` | 17 | amortiguar el deslizamiento |
 * | `INTERCEPTTOUCHEVENT` | 13 | interceptar el toque |
 *
 * ## ⚠️ La orientación sale «vertical» 38 de 43 veces, y lo dejo escrito
 *
 * Para un carrusel de escaparate lo esperable es horizontal. **No lo he resuelto**: puede ser
 * que el enum signifique otra cosa en un slider, o que estos sliders sean listas verticales.
 * **Se implementa lo que dice el dato**, en vez de «corregirlo» hacia lo que parece razonable.
 */

// ─────────────────────────── las claves ───────────────────────────

/** Claves `long` de `DXSLIDERLAYOUT`, en hex de 16. De `tabla-claves.json`, no a mano. */
export const CLAVES_CARRUSEL = {
  AUTO_SCROLL: '2457c0d2d388f252',              // DX_SLIDER_LAYOUT_AUTO_SCROLL
  AUTO_SCROLL_INTERVAL: '4c58970c0c9adb9f',     // DX_SLIDER_LAYOUT_AUTO_SCROLL_INTERVAL
  IS_INFINITE: 'cee972552098e61c',              // DX_SLIDER_LAYOUT_IS_INFINITE
  MANUAL_SWITCH_ENABLED: '9d5cf8515e4bdaae',    // DX_SLIDER_LAYOUT_MANUAL_SWITCH_ENABLED
  SHOW_INDICATOR: 'cbbfeefe62c2246b',           // DX_SCROLL_LAYOUT_BASE_SHOW_INDICATOR
  INDICATOR_ID: '63de61898ca79d75',             // DX_SCROLL_LAYOUT_BASE_INDICATOR_ID
  AVOID_INCESSANT_SCROLL: '55b40071fc61873e',   // DXSLIDERLAYOUT_AVOIDINCESSANTSCROLL
  INTERCEPT_TOUCH_EVENT: 'd002266d3a2449e6',    // DXSLIDERLAYOUT_INTERCEPTTOUCHEVENT
  /** **Compartida con `Contenedor`**: la misma clave, el mismo significado. */
  ORIENTATION: '9c173339fd9791b7',              // DX_VIEW_ORIENTATION
  // Del ciclo de vida de Android.
  AVOID_INDEX_DELTA_TOO_LARGE_ANDROID: '3e7847164cfc76e1',
  IS_ENABLE_DETACHED_STOP_TIMER_ANDROID: 'c2a4851455b2c657',
  OPEN_SCROLLER_ANIMATION: '9d22ed9f99766bad',  // DX_SCROLLER_LAYOUT_OPEN_SCROLLER_ANIMATION
} as const;

/** El **ID DE TIPO** del widget. */
export const TIPO_DXSLIDERLAYOUT = '6a19fe9d2c852bed';

export type NombreAtributoCarrusel = keyof typeof CLAVES_CARRUSEL;

/** De dónde viene cada nombre. Aquí **todos vienen de la tabla**. */
export const CONFIANZA: Record<NombreAtributoCarrusel, 'tabla'> = {
  AUTO_SCROLL: 'tabla', AUTO_SCROLL_INTERVAL: 'tabla', IS_INFINITE: 'tabla',
  MANUAL_SWITCH_ENABLED: 'tabla', SHOW_INDICATOR: 'tabla', INDICATOR_ID: 'tabla',
  AVOID_INCESSANT_SCROLL: 'tabla', INTERCEPT_TOUCH_EVENT: 'tabla', ORIENTATION: 'tabla',
  AVOID_INDEX_DELTA_TOO_LARGE_ANDROID: 'tabla', IS_ENABLE_DETACHED_STOP_TIMER_ANDROID: 'tabla',
  OPEN_SCROLLER_ANIMATION: 'tabla',
};

// ─────────────────────────── los enums medidos ───────────────────────────

/** `DX_VIEW_ORIENTATION`: del `enumMap` real. */
export const ORIENTACION = Object.freeze({ 0: 'horizontal', 1: 'vertical' } as Record<number, string>);

/**
 * El intervalo de avance automático, en milisegundos.
 *
 * **Medido**: 3000 (14 nodos), 1000 (7), 1500 (6). Si Taobao no lo declara, **3000 es el valor
 * más común** — pero eso es una decisión, no un dato del nodo concreto.
 */
export const INTERVALO_POR_DEFECTO_MS = 3000;

// ─────────────────────────── resolución ───────────────────────────

export type AtributosDxCarrusel = Record<string, number | string | boolean | null | undefined>;

/** Lo que `Carrusel` resuelve, en forma neutra. */
export interface ResolucionCarrusel {
  /** `row` si Taobao dijo horizontal, `column` si vertical. */
  direccion: 'row' | 'column';
  /** Avance automático. */
  autoScroll: boolean;
  /** Milisegundos entre avances. */
  intervaloMs: number;
  /** `true` si Taobao pidió bucle. */
  infinito: boolean;
  /** `true` si el usuario puede deslizar. */
  deslizable: boolean;
  /** `true` si hay que pintar los puntos. */
  mostrarIndicador: boolean;
  /** El ID del nodo que hace de indicador, si Taobao lo referencia. */
  idIndicador?: string;
  /** `true` si hay que amortiguar el deslizamiento. */
  amortiguar: boolean;
  /** `true` si hay que interceptar el toque. */
  interceptaToque: boolean;
  /** Atributos presentes que **no** se implementan, declarados en vez de olvidados. */
  noImplementados: NombreAtributoCarrusel[];
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

/** Los tres atributos del ciclo de vida de Android que se declaran en vez de implementarse. */
const DE_MOTOR: NombreAtributoCarrusel[] = [
  'AVOID_INDEX_DELTA_TOO_LARGE_ANDROID',
  'IS_ENABLE_DETACHED_STOP_TIMER_ANDROID',
  'OPEN_SCROLLER_ANIMATION',
];

/**
 * Convierte los atributos del carrusel a forma neutra.
 */
export function resolverCarrusel(dx: AtributosDxCarrusel = {}): ResolucionCarrusel {
  const orient = numero(dx[CLAVES_CARRUSEL.ORIENTATION]);
  // Se implementa lo que dice el dato: `1` = vertical, aunque en un escaparate sorprenda.
  const direccion: 'row' | 'column' = orient !== undefined && ORIENTACION[orient] === 'vertical'
    ? 'column' : 'row';

  const intervalo = numero(dx[CLAVES_CARRUSEL.AUTO_SCROLL_INTERVAL]);

  const r: ResolucionCarrusel = {
    direccion,
    autoScroll: bool(dx[CLAVES_CARRUSEL.AUTO_SCROLL]) === true,
    intervaloMs: intervalo !== undefined && intervalo > 0 ? intervalo : INTERVALO_POR_DEFECTO_MS,
    infinito: bool(dx[CLAVES_CARRUSEL.IS_INFINITE]) === true,
    // Taobao lo declara explícitamente: si no está, se asume que sí se puede deslizar.
    deslizable: bool(dx[CLAVES_CARRUSEL.MANUAL_SWITCH_ENABLED]) !== false,
    mostrarIndicador: bool(dx[CLAVES_CARRUSEL.SHOW_INDICATOR]) === true,
    amortiguar: bool(dx[CLAVES_CARRUSEL.AVOID_INCESSANT_SCROLL]) === true,
    interceptaToque: bool(dx[CLAVES_CARRUSEL.INTERCEPT_TOUCH_EVENT]) === true,
    noImplementados: [],
  };

  const id = dx[CLAVES_CARRUSEL.INDICATOR_ID];
  if (typeof id === 'string' && id) r.idIndicador = id;

  for (const k of DE_MOTOR) if (dx[CLAVES_CARRUSEL[k]] !== undefined) r.noImplementados.push(k);

  return r;
}

export default {
  CLAVES_CARRUSEL, CONFIANZA, ORIENTACION, INTERVALO_POR_DEFECTO_MS, TIPO_DXSLIDERLAYOUT,
  resolverCarrusel,
};
