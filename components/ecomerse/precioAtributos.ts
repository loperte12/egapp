/**
 * Precio · el vocabulario de `DXMEGAPRICEVIEW`, el widget de precio de Taobao
 * =========================================================================
 *
 * ## Por qué existe este módulo
 *
 * **Porque el árbol no sabía formatear.** En la lista se vio el síntoma:
 *
 * ```
 * la lista del ÁRBOL:   4000
 * el .map de siempre:   4.000 XAF
 * ```
 *
 * Un árbol declarativo **no tiene funciones**, así que no puede llamar a `formatXAF`. Y no es
 * solo el separador de miles: **Taobao separa la cifra del símbolo y les da TAMAÑOS distintos.**
 *
 * ## Y Taobao ya tenía el widget
 *
 * `DXMEGAPRICEVIEW` tiene **once** claves, y sueltan justo eso:
 *
 * ```
 * CURRENCYSYMBOL   el símbolo            DECIMALSYMBOL   el separador
 * CURRENCYPOSITION delante o detrás      DECIMALSIZE     su tamaño
 * CURRENCYSIZE     el tamaño del símbolo PRICESTYLE      un estilo predefinido
 * FORMATTEDPRICE   la cifra ya formateada
 * ```
 *
 * **Clave suelta, tamaño suelto.** Es el patrón del comercio —cifra grande, unidad pequeña— que
 * el `Precio` del ui-kit hace con `partesXAF`. **No hay que inventar un `formato`: había un
 * widget y estaba mal clasificado.**
 *
 * ## La corrección que trae
 *
 * **`DXMEGAPRICEVIEW` estaba en los alias de `Texto`.** Un servidor que mandara ese widget se
 * pintaba como texto plano — **el `4000` exacto**. Ahora apunta a `Precio`, y hay un test que lo
 * fija para que no vuelva.
 *
 * ## Todo se comparte con `Texto` excepto lo propio del precio
 *
 * `TEXTCOLOR` = `4fa0a53cf9ff05cd` y `TEXTSIZE` = `5db0637a915fa268`, **las mismas**. Por eso se
 * declaran aquí en `TEXTO_COMPARTIDO` en vez de importarlas: **este módulo tiene que ser
 * autocontenido para poder probarse en Node** (ver la nota larga en `entradaAtributos.ts`), y un
 * test afirma que las copias son idénticas.
 */

import type { TextStyle } from 'react-native';

/**
 * Las claves de texto, **las mismas que las de `textoAtributos` y `entradaAtributos`.**
 * Un test comprueba que las tres copias coinciden.
 */
export const TEXTO_COMPARTIDO = {
  TEXTCOLOR: '4fa0a53cf9ff05cd',
  TEXTSIZE: '5db0637a915fa268',
} as const;

export const CLAVES_PRECIO = {
  /** El símbolo: `XAF`, `¥`, `€`… **Lo manda el servidor, no se asume.** */
  CURRENCYSYMBOL: 'c46837aa6227ebef',      // DXMEGAPRICEVIEW_CURRENCYSYMBOL
  /** Delante o detrás de la cifra. */
  CURRENCYPOSITION: '1a38bafff3d08bd0',    // DXMEGAPRICEVIEW_CURRENCYPOSITION
  /** **Tamaño del símbolo**, distinto del de la cifra. */
  CURRENCYSIZE: '217b0d03e1ec8912',        // DXMEGAPRICEVIEW_CURRENCYSIZE
  /** El separador decimal (`,`, `.`). */
  DECIMALSYMBOL: '584841dfb5b81852',       // DXMEGAPRICEVIEW_DECIMALSYMBOL
  /** **Tamaño de los decimales**, que el comercio pinta menor. */
  DECIMALSIZE: '8ae6a281cd4ef975',         // DXMEGAPRICEVIEW_DECIMALSIZE
  /** La cifra ya formateada por el servidor. Si viene, se usa tal cual. */
  FORMATTEDPRICE: '2356e109e73565c7',      // DXMEGAPRICEVIEW_FORMATTEDPRICE
  /** Un estilo predefinido del widget. */
  PRICESTYLE: '583180051d90d02e',          // DXMEGAPRICEVIEW_PRICESTYLE
  /** El tipo del widget. */
  TIPO: '2b85a6c2624a8015',                // DXMEGAPRICEVIEW_MEGAPRICEVIEW
  /** La fuente. */
  FONT: '00000007f3748b6b',                // DXMEGAPRICEVIEW_FONT
} as const;

export type NombreAtributoPrecio = keyof typeof CLAVES_PRECIO;

export const PROCEDENCIA: Record<NombreAtributoPrecio, string> = {
  CURRENCYSYMBOL: 'tabla · DXMEGAPRICEVIEW_CURRENCYSYMBOL',
  CURRENCYPOSITION: 'tabla · DXMEGAPRICEVIEW_CURRENCYPOSITION',
  CURRENCYSIZE: 'tabla · DXMEGAPRICEVIEW_CURRENCYSIZE',
  DECIMALSYMBOL: 'tabla · DXMEGAPRICEVIEW_DECIMALSYMBOL',
  DECIMALSIZE: 'tabla · DXMEGAPRICEVIEW_DECIMALSIZE',
  FORMATTEDPRICE: 'tabla · DXMEGAPRICEVIEW_FORMATTEDPRICE',
  PRICESTYLE: 'tabla · DXMEGAPRICEVIEW_PRICESTYLE',
  TIPO: 'tabla · DXMEGAPRICEVIEW_MEGAPRICEVIEW',
  FONT: 'tabla · DXMEGAPRICEVIEW_FONT',
};

export type AtributosDxPrecio = Record<string, number | string | boolean | null | undefined>;

export interface ResolucionPrecio {
  /** El símbolo, ya resuelto. */
  simbolo?: string;
  /** `true` si el símbolo va DETRÁS de la cifra (`4.000 XAF`) y no delante (`¥4.000`). */
  simboloDetras: boolean;
  /** Tamaño del símbolo. Si no viene, se usa el de la cifra. */
  tamanoSimbolo?: number;
  /** Tamaño de la cifra. */
  tamano?: number;
  /** Color de todo el precio. */
  color?: string;
  /** El separador decimal. */
  separadorDecimal?: string;
  /** Lo que el servidor ya formateó. **Si viene, manda sobre todo lo demás.** */
  formateado?: string;
  /** Lo que se reconoce y no se implementa. */
  noImplementados: NombreAtributoPrecio[];
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return undefined;
}

/**
 * `PRICESTYLE` y `FONT` **se reconocen y no se implementan.**
 *
 * `PRICESTYLE` es un estilo predefinido: **su tabla de valores no se encontró**, y adivinar qué
 * combinación de tamaños y colores implica cada número sería inventar. `FONT` es una fuente
 * concreta y la app usa la suya.
 *
 * Se declaran para que el servidor **vea** que el cliente no los pinta.
 */
const NO_IMPLEMENTADOS: NombreAtributoPrecio[] = ['PRICESTYLE', 'FONT'];

/**
 * **`#AARRGGBB` de Taobao → `#RRGGBBAA` de React Native.**
 *
 * ## Esta función está repetida, y este comentario explica por qué
 *
 * **Es la CUARTA copia.** Está en `textoAtributos`, `imagenAtributos`, `contenedorAtributos` y
 * aquí. Y este módulo nació **sin ella**: al pintar el precio con `#FFFF5000` de Taobao, React
 * Native leyó el alfa como `00` y **el precio salió invisible** — el mismo fallo que ya se había
 * corregido tres veces.
 *
 * **No es descuido: es que la copia no tiene red.** Se copia para que cada módulo siga siendo
 * autocontenido (y por tanto se pueda probar en Node, que es la herramienta que más ha valido
 * aquí), pero **nada obligaba a que las cuatro coincidieran**. Un módulo nuevo simplemente la
 * olvida — y eso es exactamente lo que pasó.
 *
 * **La red es un test**: `claves.test.mjs` comprueba que los cuatro módulos canonizan IGUAL una
 * tabla de colores. Si alguien arregla una y no las otras, el test lo dice.
 */
export function canonizarColor(v: unknown): string | undefined {
  let hex: string | undefined;
  if (typeof v === 'string' && v.startsWith('#')) hex = v.slice(1).toUpperCase();
  else {
    const n = num(v);
    if (n === undefined) return undefined;
    hex = (n >>> 0).toString(16).padStart(8, '0').toUpperCase();
  }
  if (hex.length === 6) return '#' + hex;                            // ya es RRGGBB
  if (hex.length === 8) return '#' + hex.slice(2) + hex.slice(0, 2); // AARRGGBB -> RRGGBBAA
  return '#' + hex;
}

/**
 * Convierte los atributos de Taobao en lo que hace falta para pintar un precio.
 *
 * ## La posición del símbolo
 *
 * **`CURRENCYPOSITION` no tiene enum encontrado**, así que se traduce con una decisión
 * declarada: **`1` = detrás, cualquier otro o ausente = delante.**
 *
 * Se elige así por el caso real: **`XAF` va detrás (`4.000 XAF`)** y el `¥` de Taobao va delante
 * (`¥4.000`). Poner el símbolo detrás por defecto dejaría `4.000XAF` en toda la app.
 */
export function resolverPrecio(dx: AtributosDxPrecio = {}): ResolucionPrecio {
  const r: ResolucionPrecio = { simboloDetras: false, noImplementados: [] };

  const sim = dx[CLAVES_PRECIO.CURRENCYSYMBOL];
  if (sim !== undefined && sim !== null && String(sim).trim() !== '') r.simbolo = String(sim);

  const pos = num(dx[CLAVES_PRECIO.CURRENCYPOSITION]);
  r.simboloDetras = pos === 1;

  const tSim = num(dx[CLAVES_PRECIO.CURRENCYSIZE]);
  if (tSim !== undefined && tSim > 0) r.tamanoSimbolo = tSim;

  const t = num(dx[TEXTO_COMPARTIDO.TEXTSIZE]);
  if (t !== undefined) r.tamano = t;

  const col = canonizarColor(dx[TEXTO_COMPARTIDO.TEXTCOLOR]);
  if (col) r.color = col;

  const sep = dx[CLAVES_PRECIO.DECIMALSYMBOL];
  if (sep !== undefined && sep !== null && String(sep) !== '') r.separadorDecimal = String(sep);

  const fmt = dx[CLAVES_PRECIO.FORMATTEDPRICE];
  if (fmt !== undefined && fmt !== null && String(fmt).trim() !== '') r.formateado = String(fmt);

  for (const nombre of NO_IMPLEMENTADOS) {
    if (dx[CLAVES_PRECIO[nombre]] !== undefined) r.noImplementados.push(nombre);
  }

  return r;
}

/**
 * La cifra, con separador de miles.
 *
 * ## Por qué NO se usa `toLocaleString`
 *
 * **Dos motivos, y el primero se vio midiendo.**
 *
 * 1. **`toLocaleString('es-ES')` no agrupa los números de CUATRO dígitos**: da `4000`, no
 *    `4.000`. Es una regla del locale, y **el Mercado sí muestra `4.000 XAF`** — o sea que la
 *    app no sigue esa regla. Se descubrió probando `4000` contra `18500` y ver que solo uno
 *    llevaba punto.
 * 2. **Hermes —el motor de JavaScript de React Native— tiene `Intl` limitado.** Que funcione en
 *    Node no garantiza que funcione en el móvil, y un precio sin separador en producción es un
 *    precio que se lee mal (`18500` se confunde con `18,500`).
 *
 * Así que se agrupa a mano: es determinista, no depende del motor, y **da el mismo resultado en
 * los dos sitios**.
 *
 * ## Y lo que sí respeta del árbol
 *
 * `DECIMALSYMBOL` cambia **el separador decimal** (`,` por defecto, como en español). El de
 * miles es siempre el punto: Taobao **no tiene un atributo para él**, así que inventarse uno
 * sería añadir vocabulario que el servidor no puede mandar.
 */
export function formatearCifra(valor: unknown, separadorDecimal?: string): string | undefined {
  const n = typeof valor === 'number' ? valor : num(valor);
  if (n === undefined) return undefined;

  const negativo = n < 0;
  const abs = Math.abs(n);
  const entero = Math.trunc(abs);
  const resto = abs - entero;

  // Agrupación de miles a mano, cada 3 dígitos desde la derecha.
  const agrupado = String(entero).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  // **Sin decimales cuando el número es entero**: un precio en XAF no lleva céntimos, y el
  // vocabulario no tiene un atributo de precisión que diga lo contrario.
  let salida = agrupado;
  if (resto > 1e-9) {
    const decimales = resto.toFixed(2).slice(2);
    salida = `${agrupado}${separadorDecimal ?? ','}${decimales}`;
  }
  return negativo ? `-${salida}` : salida;
}

/** Todos los atributos que este componente conoce. */
export function atributosDelPrecio(): NombreAtributoPrecio[] {
  return Object.keys(CLAVES_PRECIO) as NombreAtributoPrecio[];
}

export default {
  CLAVES_PRECIO, TEXTO_COMPARTIDO, PROCEDENCIA,
  resolverPrecio, formatearCifra, atributosDelPrecio,
};
