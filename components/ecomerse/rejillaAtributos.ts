/**
 * Rejilla · resolución de atributos del widget `DX_GRID_LAYOUT` de Taobao
 * ======================================================================
 *
 * **Puro a propósito**: el oráculo de fidelidad importa este módulo directamente.
 *
 * ## El componente con MÁS confianza de todos los hechos hasta ahora
 *
 * A diferencia de los demás, **8 de sus 9 atributos tienen nombre en la tabla**. No hay que
 * inferir nada:
 *
 * ```
 * DX_GRID_LAYOUT_COLUMN_COUNT     3e2dcaff35b84aa2
 * DX_GRID_LAYOUT_COLUMN_SPACING   9dca6270e598e560
 * DX_GRID_LAYOUT_ROW_SPACING      ad36537101a1ce27
 * DX_GRID_LAYOUT_ITEM_WIDTH       b3f10f88295e8ab8
 * DX_GRID_LAYOUT_ITEM_HEIGHT      f3a6de8ce8a0bf12
 * DX_GRID_LAYOUT_LINE_COLOR       ebfa4daaf4f020b0
 * DX_GRID_LAYOUT_LINE_WIDTH       ebfa7653fbb455b1
 * DX_GRID_LAYOUT_NEED_SEPARATOR   915258d0679b055a
 * DX_GRID_LAYOUT_ROW_COUNT        55acab8dfcc06869
 * ```
 *
 * ## Y comparte atributos con otros dos widgets — medido
 *
 * | Clave | Nombre aquí | También es |
 * |---|---|---|
 * | `3e2dcaff35b84aa2` | `DX_GRID_LAYOUT_COLUMN_COUNT` | **`DXRECYCLERLAYOUT_COLUMNCOUNT`** |
 * | `9c173339fd9791b7` | `DX_VIEW_ORIENTATION` | **`DXRECYCLERLAYOUT_ORIENTATION`** |
 *
 * **La rejilla y la lista comparten el número de columnas.** Eso significa que `Rejilla` es
 * también la mitad de `DXRECYCLERLAYOUT`: cuando se construya la lista, **la lógica de rejilla
 * ya está hecha.**
 *
 * ## Uso real: 18 nodos
 *
 * Es el componente **menos usado** de los que hemos hecho hasta ahora. Se construye porque
 * **desbloquea el feed y la lista**, no porque el corpus lo use mucho.
 */

// ─────────────────────────── las claves ───────────────────────────

/** Claves `long` de `DX_GRID_LAYOUT`, en hex de 16. De `tabla-claves.json`. */
export const CLAVES_REJILLA = {
  COLUMN_COUNT: '3e2dcaff35b84aa2',
  COLUMN_SPACING: '9dca6270e598e560',
  ROW_SPACING: 'ad36537101a1ce27',
  ITEM_WIDTH: 'b3f10f88295e8ab8',
  ITEM_HEIGHT: 'f3a6de8ce8a0bf12',
  LINE_COLOR: 'ebfa4daaf4f020b0',
  LINE_WIDTH: 'ebfa7653fbb455b1',
  NEED_SEPARATOR: '915258d0679b055a',
  ROW_COUNT: '55acab8dfcc06869',
} as const;

/** El **ID DE TIPO** del widget. No es un atributo. */
export const TIPO_DX_GRID_LAYOUT = '6c1a25039b88a40e';

/** La clave compartida con `DXRECYCLERLAYOUT_COLUMNCOUNT`. */
export const CLAVE_COLUMN_COUNT_COMPARTIDA = '3e2dcaff35b84aa2';

export type NombreAtributoRejilla = keyof typeof CLAVES_REJILLA;

/** De dónde viene cada nombre. **Aquí todos vienen de la tabla.** */
export const CONFIANZA: Record<NombreAtributoRejilla, 'tabla'> = {
  COLUMN_COUNT: 'tabla',
  COLUMN_SPACING: 'tabla',
  ROW_SPACING: 'tabla',
  ITEM_WIDTH: 'tabla',
  ITEM_HEIGHT: 'tabla',
  LINE_COLOR: 'tabla',
  LINE_WIDTH: 'tabla',
  NEED_SEPARATOR: 'tabla',
  ROW_COUNT: 'tabla',
};

// ─────────────────────────── resolución ───────────────────────────

export type AtributosDxRejilla = Record<string, number | string | boolean | null | undefined>;

/** Lo que `Rejilla` resuelve, en forma neutra. */
export interface ResolucionRejilla {
  /** Número de columnas. `undefined` si Taobao no lo declaró. */
  columnas?: number;
  /** Número de filas, si Taobao fija la rejilla en vez de dejarla crecer. */
  filas?: number;
  /** Separación horizontal entre celdas. Es LAYOUT: se implementa, no se compara por valor. */
  separacionColumnas?: number;
  /** Separación vertical entre celdas. */
  separacionFilas?: number;
  /** Ancho fijo de celda, o `match_content`/`match_parent`. */
  anchoCelda?: number | 'match_content' | 'match_parent';
  /** Alto fijo de celda. */
  altoCelda?: number | 'match_content' | 'match_parent';
  /** `true` si Taobao pidió separadores entre celdas. */
  separadores: boolean;
  /** Color de las líneas separadoras. */
  colorLinea?: string;
  /** Grosor de las líneas. */
  grosorLinea?: number;
  /** Atributos no implementados, declarados. */
  noImplementados: NombreAtributoRejilla[];
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/** Canoniza un color a `#RRGGBB` o `#AARRGGBB`. */
export function canonizarColor(v: unknown): string | undefined {
  if (typeof v === 'string' && v.startsWith('#')) return v.toUpperCase();
  const n = num(v);
  if (n === undefined) return undefined;
  return '#' + (n >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

/**
 * Un tamaño de celda: `-1` = `match_parent`, `-2` = `match_content`, o un número de puntos.
 *
 * **Es el MISMO convenio que `layout_width`/`layout_height`** del contenedor — coherente con
 * Android, que es lo que hay debajo.
 */
function tamanoCelda(v: unknown): number | 'match_content' | 'match_parent' | undefined {
  const n = num(v);
  if (n === undefined) return undefined;
  if (n === -1) return 'match_parent';
  if (n === -2) return 'match_content';
  return n;
}

/**
 * Convierte los atributos de la rejilla a forma neutra.
 */
export function resolverRejilla(dx: AtributosDxRejilla = {}): ResolucionRejilla {
  const r: ResolucionRejilla = { separadores: false, noImplementados: [] };

  const cols = num(dx[CLAVES_REJILLA.COLUMN_COUNT]);
  // Una rejilla de 0 columnas no tiene sentido: se ignora en vez de pintar algo roto.
  if (cols !== undefined && cols > 0) r.columnas = cols;

  const filas = num(dx[CLAVES_REJILLA.ROW_COUNT]);
  if (filas !== undefined && filas > 0) r.filas = filas;

  const sc = num(dx[CLAVES_REJILLA.COLUMN_SPACING]);
  if (sc !== undefined && sc >= 0) r.separacionColumnas = sc;
  const sr = num(dx[CLAVES_REJILLA.ROW_SPACING]);
  if (sr !== undefined && sr >= 0) r.separacionFilas = sr;

  r.anchoCelda = tamanoCelda(dx[CLAVES_REJILLA.ITEM_WIDTH]);
  r.altoCelda = tamanoCelda(dx[CLAVES_REJILLA.ITEM_HEIGHT]);

  r.separadores = dx[CLAVES_REJILLA.NEED_SEPARATOR] !== undefined
    && num(dx[CLAVES_REJILLA.NEED_SEPARATOR]) !== 0;

  const color = canonizarColor(dx[CLAVES_REJILLA.LINE_COLOR]);
  if (color) r.colorLinea = color;
  const grosor = num(dx[CLAVES_REJILLA.LINE_WIDTH]);
  if (grosor !== undefined && grosor >= 0) r.grosorLinea = grosor;

  return r;
}

export default { CLAVES_REJILLA, CONFIANZA, TIPO_DX_GRID_LAYOUT, resolverRejilla, canonizarColor };
