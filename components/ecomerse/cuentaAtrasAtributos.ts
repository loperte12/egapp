/**
 * Cuenta atrás · resolución de atributos del widget `DXCOUNTDOWNVIEW` de Taobao
 * ============================================================================
 *
 * **Puro a propósito**: el oráculo de fidelidad importa este módulo directamente.
 *
 * ## Uso real: **82 nodos en 46 plantillas**
 *
 * Más de lo que parecía desde la ficha de producto. Aparece en el feed, en las ofertas y en
 * los pedidos — es el «termina en 02:14:07» de un marketplace.
 *
 * ## Lo que se sabe con certeza, y lo que no
 *
 * Taobao **declara 6 constantes** para este widget:
 *
 * ```java
 * public static final long DXCOUNTDOWNVIEW_FONT = 34149272427L;              // el FONT compartido
 * public static final long DXCOUNTDOWNVIEW_SHOWHOURSECOND = -8830056631125429559L;
 * public static final long DXCOUNTDOWNVIEW_SHOWMINUTESECOND = 4747633075395742623L;
 * public static final long DXCOUNTDOWNVIEW_PARTIALREFRESH = -1786570581920862006L;
 * public static final long DXCOUNTDOWNVIEW_NOTSTOPWHENDETACH_ANDROID = -3801534021456228085L;
 * public static final int  DXCOUNTDOWNVIEW_FONTSTYLE_BOLD = 1; NONE = -1; NORMAL = 0;
 * ```
 *
 * **Y los demás NO tienen nombre**: el fichero `d0.java` guarda sus valores en campos
 * **ofuscados** (`G1`, `H1`, `q1`, `w1`…). Se conoce **la clave y el campo**, no el nombre.
 *
 * ## Cómo se asignan los roles — y con qué confianza
 *
 * Los campos se asignan **en un orden estable**, y el tipo de dato acota el rol:
 *
 * | Evidencia | Lectura |
 * |---|---|
 * | campo `str` con valor `":"` | es el **separador** |
 * | campo `str` con valor `"00:00:00"` | es el **formato por defecto** |
 * | cinco campos con valores 10–24 | son **tamaños de las partes** (hora, minuto, segundo…) |
 * | cuatro campos `int` con valores `#AARRGGBB` | son **colores de las partes** |
 *
 * **Qué es cada cuál, no lo he confirmado.** En el código de render los campos se leen por
 * getter desde otra clase, y ahí se pierde la pista. **Va marcado como inferencia.**
 */

// ─────────────────────────── las claves ───────────────────────────

/**
 * Claves `long` de `DXCOUNTDOWNVIEW`, en hex de 16.
 *
 * Las 6 primeras **vienen de las constantes declaradas en `d0.java`** — nombre real.
 * Las demás **vienen de la tabla de `if` del mismo fichero** — clave real, nombre inferido.
 */
export const CLAVES_CUENTA_ATRAS = {
  // ── nombre REAL: constante declarada en d0.java ──
  FONT: '00000007f3748b6b',                 // DXCOUNTDOWNVIEW_FONT (compartido con texto)
  SHOW_HOUR_SECOND: '85755647132fb2c9',     // R1
  SHOW_MINUTE_SECOND: '41e2fb20c6dbcb9f',   // S1
  PARTIAL_REFRESH: 'e734d3857a71b0ca',      // sin campo asignado en d0.java
  NOT_STOP_WHEN_DETACH_ANDROID: 'cb3e3cf2e98a110b',  // W2
  FONT_STYLE: 'f9f475e1242f0dd1',           // Y1 · los valores FONTSTYLE_* lo confirman

  // ── clave REAL, nombre INFERIDO del rol medido ──
  /** Campo `q1`. Valores: `":"` en 78 de 78 nodos. **El separador.** */
  SEPARADOR: '6868078f811eb0c9',
  /** Campo `w1`. Valor `"00:00:00"` en 30 nodos. **El formato por defecto.** */
  FORMATO: '3a22ade48a7b7180',
  /** Campo `V1`. Otra cadena; 0 apariciones medidas. */
  TEXTO_ALTERNATIVO: '93b40cb2474b98ba',

  // tamaños de las partes — CUÁL ES CUÁL no está confirmado
  TAMANO_A: 'b7e525c7cecb042e',   // G1 · 81 usos · valores 13,14,15,24
  TAMANO_B: '4699724940e9d76e',   // P1 · 73 usos · valores 10,11,12,13
  TAMANO_C: '31cb49cf582586d4',   // H1 · 71 usos · valores 16,17,18,20
  TAMANO_D: 'b6e1c58ae1cd741f',   // C1 · 56 usos · valores 10,12,13,14 (campo `double`)
  TAMANO_E: '7d56e21dc55bbd68',   // O1 · 50 usos · valores 10,11,12,13

  // colores de las partes
  COLOR_A: '96f537c78b5e33cd',    // r1 · 38 usos
  COLOR_B: 'e350c7d71eb17234',    // D1 · 73 usos
  COLOR_C: '31c63723810713d3',    // F1 · 23 usos
  COLOR_D: '0b9bdea47f51e384',    // x1 · 15 usos

  // banderas
  BANDERA_A: 'f177ccaffef25f55',  // X1 · 79 usos · 1×77, 0×2
  BANDERA_B: '88ff9f3b17e152ed',  // W1 · 30 usos · siempre 1
  BANDERA_C: 'f90753eb2800fe25',  // Q1 · 55 usos · false/true
  BANDERA_D: '9755bc91429ea703',  // E1 · 19 usos · valores 2,3,4
} as const;

/** El **ID DE TIPO** del widget. */
export const TIPO_DXCOUNTDOWNVIEW = 'cf796bf8ffd08149';

export type NombreAtributoCuentaAtras = keyof typeof CLAVES_CUENTA_ATRAS;

/**
 * De dónde viene cada nombre. **Sé honesto sobre esto.**
 *
 * - `constante` — declarado como `DXCOUNTDOWNVIEW_*` en `d0.java`
 * - `tipo` — el tipo de dato lo determina (una cadena con `:` solo puede ser un separador)
 * - `rol` — inferido del rol medido; **cuál es cuál no está confirmado**
 */
export const CONFIANZA: Record<NombreAtributoCuentaAtras, 'constante' | 'tipo' | 'rol'> = {
  FONT: 'constante', SHOW_HOUR_SECOND: 'constante', SHOW_MINUTE_SECOND: 'constante',
  PARTIAL_REFRESH: 'constante', NOT_STOP_WHEN_DETACH_ANDROID: 'constante', FONT_STYLE: 'constante',
  SEPARADOR: 'tipo', FORMATO: 'tipo',
  TEXTO_ALTERNATIVO: 'rol',
  TAMANO_A: 'rol', TAMANO_B: 'rol', TAMANO_C: 'rol', TAMANO_D: 'rol', TAMANO_E: 'rol',
  COLOR_A: 'rol', COLOR_B: 'rol', COLOR_C: 'rol', COLOR_D: 'rol',
  BANDERA_A: 'rol', BANDERA_B: 'rol', BANDERA_C: 'rol', BANDERA_D: 'rol',
};

// ─────────────────────────── los enums medidos ───────────────────────────

/** `DXCOUNTDOWNVIEW_FONTSTYLE_*`, tal como los declara `d0.java`. */
export const ESTILO_FUENTE = Object.freeze({ '-1': 'none', 0: 'normal', 1: 'bold' } as Record<string | number, string>);

/** El campo `Y1` toma estos valores en el corpus. */
export const VALORES_ESTILO_VISTOS = Object.freeze({ 0: 'normal', '-1': 'none', 1: 'bold' } as Record<string, string>);

// ─────────────────────────── resolución ───────────────────────────

export type AtributosDxCuentaAtras = Record<string, number | string | boolean | null | undefined>;

/** Qué partes muestra la cuenta atrás. */
export type Formato = 'hour-second' | 'minute-second' | 'desconocido';

/** Lo que `CuentaAtras` resuelve, en forma neutra. */
export interface ResolucionCuentaAtras {
  /** Las partes que Taobao pidió mostrar. */
  formato: Formato;
  /** Cadena entre partes. Por defecto `:`. */
  separador: string;
  /** Valor inicial o plantilla, si Taobao la traía (`"00:00:00"`). */
  plantilla?: string;
  /** Familia de fuente, si Taobao la declaró. */
  familia?: string;
  /** `none` / `normal` / `bold`. */
  estiloFuente?: string;
  /** Tamaños de las partes, en el orden en que Taobao los declara. */
  tamanos: number[];
  /** Colores de las partes. */
  colores: string[];
  /** `true` si Taobao pidió no parar el temporizador al desmontar (Android). */
  noPararAlDesmontar: boolean;
  /** `true` si pidió refresco parcial. */
  refrescoParcial: boolean;
  /** Atributos presentes que **no** se implementan, declarados en vez de olvidados. */
  noImplementados: NombreAtributoCuentaAtras[];
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/** Canoniza un color a `#AARRGGBB`. */
export function canonizarColor(v: unknown): string | undefined {
  if (typeof v === 'string' && v.startsWith('#')) return v.toUpperCase();
  const n = num(v);
  if (n === undefined) return undefined;
  return '#' + (n >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

const CLAVES_TAMANOS: NombreAtributoCuentaAtras[] = ['TAMANO_A', 'TAMANO_B', 'TAMANO_C', 'TAMANO_D', 'TAMANO_E'];
const CLAVES_COLORES: NombreAtributoCuentaAtras[] = ['COLOR_A', 'COLOR_B', 'COLOR_C', 'COLOR_D'];

/**
 * Convierte los atributos de la cuenta atrás a forma neutra.
 */
export function resolverCuentaAtras(dx: AtributosDxCuentaAtras = {}): ResolucionCuentaAtras {
  const r: ResolucionCuentaAtras = {
    formato: 'desconocido',
    separador: ':',
    tamanos: [],
    colores: [],
    noPararAlDesmontar: false,
    refrescoParcial: false,
    noImplementados: [],
  };

  // El formato. Los dos valores son excluyentes: Taobao pone uno u otro.
  const hora = num(dx[CLAVES_CUENTA_ATRAS.SHOW_HOUR_SECOND]);
  const minuto = num(dx[CLAVES_CUENTA_ATRAS.SHOW_MINUTE_SECOND]);
  if (hora === 1 || (hora !== undefined && hora !== 0)) r.formato = 'hour-second';
  else if (minuto === 1 || (minuto !== undefined && minuto !== 0)) r.formato = 'minute-second';

  const sep = dx[CLAVES_CUENTA_ATRAS.SEPARADOR];
  if (typeof sep === 'string' && sep.length > 0) r.separador = sep;

  const fmt = dx[CLAVES_CUENTA_ATRAS.FORMATO];
  if (typeof fmt === 'string' && fmt) r.plantilla = fmt;

  const fuente = dx[CLAVES_CUENTA_ATRAS.FONT];
  if (typeof fuente === 'string' && fuente) r.familia = fuente;

  const estilo = num(dx[CLAVES_CUENTA_ATRAS.FONT_STYLE]);
  if (estilo !== undefined && ESTILO_FUENTE[estilo] !== undefined) r.estiloFuente = ESTILO_FUENTE[estilo];

  for (const k of CLAVES_TAMANOS) {
    const v = num(dx[CLAVES_CUENTA_ATRAS[k]]);
    if (v !== undefined) r.tamanos.push(v);
  }
  for (const k of CLAVES_COLORES) {
    const v = canonizarColor(dx[CLAVES_CUENTA_ATRAS[k]]);
    if (v) r.colores.push(v);
  }

  r.noPararAlDesmontar = dx[CLAVES_CUENTA_ATRAS.NOT_STOP_WHEN_DETACH_ANDROID] !== undefined;
  r.refrescoParcial = dx[CLAVES_CUENTA_ATRAS.PARTIAL_REFRESH] !== undefined;

  // Los que tienen clave pero no rol confirmado se declaran.
  if (dx[CLAVES_CUENTA_ATRAS.TEXTO_ALTERNATIVO] !== undefined) r.noImplementados.push('TEXTO_ALTERNATIVO');

  return r;
}

/**
 * Descompone los segundos restantes en las partes que Taobao pidió.
 *
 * Es la única lógica de negocio del componente, y es pura: se puede probar sin renderizar.
 */
export function partesDe(segundos: number, formato: Formato): number[] {
  const s = Math.max(0, Math.floor(segundos));
  const horas = Math.floor(s / 3600);
  const minutos = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  if (formato === 'hour-second') return [horas, minutos, seg];
  if (formato === 'minute-second') return [minutos, seg];
  // Sin formato declarado se asume el más corto, que es lo que hace un marketplace.
  return [minutos, seg];
}

export default {
  CLAVES_CUENTA_ATRAS, CONFIANZA, ESTILO_FUENTE, TIPO_DXCOUNTDOWNVIEW,
  resolverCuentaAtras, partesDe, canonizarColor,
};
