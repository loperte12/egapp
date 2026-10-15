/**
 * valorAtributos · lo que el árbol SABÍA describir y no sabía calcular
 * ==================================================================
 *
 * ## Las tres cosas que faltaban, medidas
 *
 * En las 22 pantallas del Mercado, **8.394 líneas de JSX**, esto **no era expresable en un árbol**:
 *
 * ```
 *   80   valores por defecto        ?? '—'
 *   11   tablas de búsqueda         DOC_LABEL[x]
 *    9   frases con 2+ datos        `${a} · ${b}`
 * ```
 *
 * Son pocos sitios, **pero son los que hacen que un bloque sirva o no**: sin `?? '—'`, un campo
 * vacío deja un hueco que se lee como un fallo; sin tabla, «aprobado» no se traduce a «Aprobado»;
 * sin frase, tres datos no se pueden juntar en una línea.
 *
 * ## Y NO SON DE TAOBAO — esto es lo que hay que saber antes de leer el resto
 *
 * Se buscaron en la tabla de claves y **no existen**:
 *
 * ```
 * VALOR POR DEFECTO  ->  nada
 * TABLA / MAPA       ->  solo `COLORMAP` y `MAPTOARRAY`, que son PARSERS
 * SEPARADOR          ->  nada
 * ```
 *
 * **Taobao no las tiene como atributos porque las resuelve con su lenguaje de expresiones** (los
 * 93 `DX_PARSER_*`). La tabla *es* un parser; el valor por defecto es lógica del parser.
 *
 * Así que **estas claves son una extensión de este cliente, no una copia**. Van con el prefijo
 * **`ext:`** a propósito:
 *
 *   · **Es imposible confundirlas con una clave de Taobao**, que son 16 dígitos hex.
 *   · Y en el JSON del servidor **se ve a la legua qué es de Taobao y qué es nuestro**.
 *
 * **Lo que NO se hizo, y por qué.** La alternativa era implementar el lenguaje de expresiones —
 * un intérprete dentro del cliente. Eso es lo que hace que DinamicX sean 93 parsers y una clase
 * de 164 KB, y **no hace falta para estas tres cosas**. Si algún día hace falta una condición
 * compuesta (`stock > 0 && activo`), entonces sí toca hablar de un intérprete — y será una
 * decisión consciente, no un descuido.
 *
 * ## Todo esto es PURO y por eso se prueba en Node
 *
 * Sin red, sin React, sin efectos. Igual que los módulos de atributos, y por la misma razón: un
 * segundo de prueba en vez de dos minutos de compilación.
 */

/** Las cuatro claves. **`ext:` = extensión nuestra, no de Taobao.** */
export const CLAVES_VALOR = {
  /**
   * Qué poner cuando el valor no resuelve o viene vacío.
   *
   * `?? '—'` del JSX. **Sin esto, un campo que falta deja un hueco en blanco**, y un hueco se lee
   * como un fallo de la app — no como «este producto no tiene ese dato».
   */
  DEFECTO: 'ext:defecto',
  /**
   * Una tabla de búsqueda: `{ aprobado: 'Aprobado', rechazado: 'Rechazado' }`.
   *
   * El `valor` del nodo es **la clave** que se busca. `DOC_LABEL[item.docType]` del JSX.
   */
  TABLA: 'ext:tabla',
  /**
   * Qué poner ENTRE los hijos de un `Texto` cuando lleva varios.
   *
   * `` `${a} · ${b}` `` del JSX. **Es lo que hace Taobao con los `TextSpan`**: partir el texto en
   * trozos en vez de concatenar cadenas — un árbol no tiene `+`.
   */
  SEPARADOR: 'ext:separador',
  /**
   * **QUÉ HACER al pulsar, además de a dónde ir.**
   *
   * Taobao tiene `EVENT_TAP` para todo, y en este contrato `ONPRESS` lleva **el id del producto** (es
   * como la tarjeta navega a la ficha: `ONPRESS: '$item.id'`). Un id **no dice qué hacer**: favorito y
   * carrito son dos acciones distintas sobre el mismo producto.
   *
   * Por eso la acción va en **su propio atributo**: `ONPRESS` sigue llevando el id —y la navegación
   * sigue funcionando igual— y aquí viaja el nombre de la acción.
   *
   * ```jsonc
   * { "tipo": "Icono", "valor": "Heart",
   *   "atributos": { "47d68a4bafe73f71": "$item.id", "ext:accion": "ext:favorito" } }
   * ```
   *
   * **Los valores conocidos hoy**: `ext:favorito` y `ext:carrito` (ver `ACCIONES`). El cliente los
   * interpreta; el árbol **no guarda estado** — si el corazón está puesto o no, eso es un dato.
   */
  ACCION: 'ext:accion',
} as const;

/**
 * Las acciones que una tarjeta puede pedir hoy.
 *
 * **Son tres, y cada una existe porque sin ella una pantalla no se puede mudar al árbol**:
 * `ext:favorito` y `ext:carrito` son lo que impedía que la rejilla servida sustituyera a la lista; y
 * **`ext:dejardeseguir`** (15/10/2026) es lo que necesita la lista de tiendas seguidas — una tarjeta de
 * «siguiendo» sin forma de dejar de seguir es media tarjeta.
 *
 * ⚠️ **El oráculo comprueba que toda acción que mande el servidor esté declarada aquí**: una acción sin
 * declarar no es un fallo de pintado, es un toque que no hace nada.
 */
export const ACCIONES = {
  FAVORITO: 'ext:favorito',
  CARRITO: 'ext:carrito',
  DEJAR_DE_SEGUIR: 'ext:dejardeseguir',
} as const;

export type NombreAccion = (typeof ACCIONES)[keyof typeof ACCIONES];

export type NombreClaveValor = keyof typeof CLAVES_VALOR;

/** Lo que cuenta como «vacío» para el valor por defecto. */
function estaVacio(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Un valor con aspecto de clave de Taobao: 16 dígitos hex. */
export function esClaveDeTaobao(k: string): boolean {
  return /^[0-9a-f]{16}$/.test(k);
}

/**
 * El valor que hay que pintar, después de la tabla y del valor por defecto.
 *
 * El orden importa y es **tabla primero, defecto después**:
 *
 * ```
 * valor = 'aprobado'         tabla = { aprobado: 'Aprobado' }   ->  'Aprobado'
 * valor = 'desconocido'      tabla = { aprobado: 'Aprobado' }   ->  '(sin estado)'   <- defecto
 * valor = undefined          tabla = {...}                      ->  '(sin estado)'   <- defecto
 * valor = 'aprobado'         sin tabla                          ->  'aprobado'
 * ```
 *
 * **Una clave que NO está en la tabla cae al valor por defecto, no se pinta cruda.** Es lo que
 * hace falta: `DOC_LABEL[x] ?? x` en el JSX pintaba el código crudo, y eso en pantalla es
 * `pending_review` — **que el comprador no debería leer**. Si el servidor quiere eso, pone el
 * `ext:defecto` que quiera.
 */
export function valorEfectivo(valor: unknown, atributos?: Record<string, unknown>): unknown {
  const tabla = atributos?.[CLAVES_VALOR.TABLA];
  const defecto = atributos?.[CLAVES_VALOR.DEFECTO];

  // Con tabla, el valor es una CLAVE que se busca. **Si no está, cae al defecto** — ver arriba.
  if (tabla && typeof tabla === 'object' && !Array.isArray(tabla)) {
    const mapa = tabla as Record<string, unknown>;
    if (!estaVacio(valor)) {
      const clave = String(valor);
      if (Object.prototype.hasOwnProperty.call(mapa, clave)) return mapa[clave];
    }
    return defecto;
  }

  // Sin tabla: el defecto solo entra si el valor no resolvió o vino vacío.
  if (estaVacio(valor)) return defecto;
  return valor;
}

/**
 * Junta los trozos de un `Texto` con separador.
 *
 * **Los trozos vacíos se quitan** y el separador no se duplica. Es lo que hace falta para
 * `` `${a} · ${b}` `` cuando `b` no viene: sin esto saldría `Malabo · ` con el punto colgando.
 */
export function unirTrozos(trozos: unknown[], separador: string): string {
  return trozos
    .map((t) => (t === null || t === undefined ? '' : String(t)))
    .filter((t) => t.trim() !== '')
    .join(separador);
}

export default { CLAVES_VALOR, valorEfectivo, unirTrozos, esClaveDeTaobao };
