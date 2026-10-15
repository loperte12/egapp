/**
 * uiContrato · cómo se interpreta lo que manda el servidor de UI
 * =============================================================
 *
 * ## Por qué esto está aparte de `api/ecomerseUi.ts`
 *
 * **Para poder probarlo.** `api/ecomerseUi.ts` hace la `fetch`, y una `fetch` no se prueba en Node
 * — así que si la interpretación del contrato viviera ahí dentro, **no habría forma de comprobar
 * que el cliente rechaza lo que debe rechazar**.
 *
 * Aquí está solo la parte pura: dado lo que devolvió el servidor, ¿esto es un árbol que se puede
 * pintar? **Sin red, sin React, sin efectos.** Igual que los módulos de atributos, y por la misma
 * razón: un segundo de prueba en vez de dos minutos de compilación.
 *
 * ## Y las reglas que aplica, que son decisiones
 *
 * | qué llega | qué se hace | por qué |
 * |---|---|---|
 * | `esquema` distinto | **no se pinta** | un árbol de otra versión puede traer claves con otro significado; pintarlo «como se pueda» muestra datos equivocados con tranquilidad |
 * | `arbol: null` | **no se pinta, y NO es un error** | «no hay nada que pintar» es un estado legítimo del contrato |
 * | cuerpo vacío o no-JSON | no se pinta | un 200 con basura es un servidor mal configurado |
 * | `tipo` que no es texto | no se pinta | sin `tipo` no hay nada que buscar en la lista blanca |
 *
 * **Ninguna de estas lanza.** Una sección que no se puede pintar no es un fallo que deba tumbar la
 * pantalla: el resto de la vista es perfectamente utilizable.
 */

/**
 * La versión de la forma que este cliente sabe pintar.
 *
 * **Sube esto cuando cambie la forma del árbol.** Un cliente viejo con un servidor nuevo no pinta
 * —que es lo correcto: es mejor una sección que no está que una sección con datos mal leídos.
 */
export const ESQUEMA_UI = 1;

/** Un nodo del árbol, tal como lo manda el servidor. */
export interface NodoRemoto {
  tipo: string;
  atributos?: Record<string, unknown>;
  valor?: string | number;
  hijos?: NodoRemoto[];
  id?: string;
}

export interface UiRemota {
  arbol: NodoRemoto;
  /** Los datos contra los que se resuelven los bindings del árbol (`$item.titulo`). */
  datos: unknown;
}

/**
 * ¿Esto es una respuesta de UI que se puede pintar?
 *
 * Devuelve el árbol y sus datos, o `null`. **Nunca lanza** — ver la tabla de arriba.
 */
export function interpretarRespuestaUi(cuerpo: unknown): UiRemota | null {
  if (!cuerpo || typeof cuerpo !== 'object') return null;
  const c = cuerpo as { esquema?: unknown; arbol?: unknown; datos?: unknown };

  // **El esquema se comprueba ANTES de mirar el árbol.** Un árbol de otra versión puede traer
  // claves con otro significado, y pintarlo «como se pueda» sería mostrar datos equivocados sin
  // que nadie se entere.
  if (c.esquema !== ESQUEMA_UI) return null;

  // `arbol: null` es un estado LEGÍTIMO: «no hay nada que pintar», y no un fallo.
  if (c.arbol === null || c.arbol === undefined) return null;

  const arbol = c.arbol as NodoRemoto;
  if (typeof arbol !== 'object' || typeof arbol.tipo !== 'string' || arbol.tipo === '') return null;

  return { arbol, datos: c.datos };
}

export default { ESQUEMA_UI, interpretarRespuestaUi };
