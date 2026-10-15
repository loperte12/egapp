/**
 * ecomerseUi.ts — el cliente de la UI dirigida por el servidor
 * ============================================================
 *
 * ## Qué hace
 *
 * Pide a `/api/ecomerse/ui/home` **un árbol y sus datos**, y los devuelve listos para el
 * `Renderizador`. Eso es todo: **no sabe qué pantalla es, ni qué widgets hay dentro.**
 *
 * ## Por qué el árbol Y los datos en la misma respuesta
 *
 * El servidor es el que sabe las dos cosas. Si vinieran por canales separados, una respuesta
 * podría llegar sin la otra y **la pantalla se pintaría vacía sin que nadie supiera por qué** —
 * ¿faltan los datos, o falla la forma? Van juntos, y si falla, falla entero.
 *
 * ## El esquema
 *
 * La respuesta trae `esquema: 1`. **Si llega un esquema que no conocemos, NO se pinta.** Es
 * deliberado: un árbol de una versión más nueva puede traer claves con otro significado, y
 * pintarlo «como se pueda» es peor que no pintarlo — mostraría datos equivocados con toda
 * tranquilidad.
 *
 * ## Y si el servidor no responde
 *
 * Devuelve `null` y **la pantalla no pinta la sección**. No hay árbol de reemplazo en el cliente:
 * un árbol de repuesto es una segunda fuente de verdad que se queda obsoleta en silencio, y
 * entonces nadie sabe si lo que se ve vino del servidor o de aquí. **Una sección que no llega es
 * una sección que no está** — y se nota, que es lo correcto.
 */

import { API_HOST } from './config';
import { tokenActual } from './httpClient';
import { interpretarRespuestaUi, ESQUEMA_UI as ESQUEMA, type NodoRemoto } from '../components/ecomerse/uiContrato';

/**
 * La versión de la forma que este cliente sabe pintar.
 *
 * **La regla vive en `components/ecomerse/uiContrato.ts`**, que es puro y por eso se puede probar
 * en Node. Aquí solo se re-exporta, para que quien importe el cliente no tenga que saber dónde
 * está.
 */
export const ESQUEMA_UI = ESQUEMA;

export type { NodoRemoto };

/**
 * De dónde se piden los árboles.
 *
 * **Se puede cambiar con `EXPO_PUBLIC_UI_HOST` para probar contra un servidor local.** Es lo que
 * permite verificar en el móvil sin desplegar: `adb reverse tcp:8788 tcp:8788` hace que el
 * `localhost:8788` del teléfono sea el del PC, y aquí se apunta ahí.
 *
 * En producción va vacío y se usa `API_HOST`, que es el servidor de verdad.
 */
const UI_HOST = process.env.EXPO_PUBLIC_UI_HOST || API_HOST;

// **`NodoRemoto` NO se declara aqui: se importa de `uiContrato.ts` y se re-exporta arriba.**
// Tenerlo dos veces seria dos formas de la misma cosa, y la primera que se cambie no llegaria a la
// otra. `UiRemota` sale del modulo puro por la misma razon.

export interface UiRemota {
  arbol: NodoRemoto;
  /** Los datos contra los que se resuelven los bindings del árbol (`$item.titulo`). */
  datos: unknown;
}

/**
 * Pide una pantalla al servidor.
 *
 * **Nunca lanza.** Devuelve `null` si algo va mal —sin red, 404, esquema desconocido, forma
 * inválida— porque **una pantalla que no puede pintar una sección no es un error que deba tumbar
 * la pantalla entera**: el resto de la vista es perfectamente utilizable.
 *
 * `tema` es `'claro'` u `'oscuro'` y **se le dice al servidor**, que es quien resuelve los colores
 * (igual que Taobao resuelve `style.styleData.*` en el servidor). **El cliente no tiene tabla de
 * temas**: si la tuviera, habría dos sitios donde arreglar el mismo color.
 *
 * ## `alFallar`: por qué sigue devolviendo `null`, pero dice el motivo
 *
 * El `null` NO se toca: el contrato es «o llega, o no se pinta», y quien lo consuma tiene derecho a
 * tratarlo todo igual. Pero desde el 15/10/2026 **el Mercado sustituye su lista por una sección**, y
 * ahí el `null` se vuelve peligroso: la pantalla tiene que decidir si enseña **«todavía no hay
 * productos»** —una afirmación sobre el catálogo— o **«no pudimos cargar»**. Sin el motivo, un fallo
 * de red se vestiría de catálogo vacío, que es una mentira.
 *
 * Así que el motivo sale por aquí, **como aviso y no como valor de retorno**: quien no lo pase sigue
 * viendo exactamente el mismo `null` de antes. Los motivos que SÍ se distinguen son los tres que se
 * pueden saber aquí: `red` (no hay conexión o el servidor no está), `respuesta` (HTTP distinto de 200,
 * o un cuerpo que no es JSON) y `contrato` (llegó algo, pero el cliente no sabe pintarlo). **El
 * «sin contenido» legítimo (`arbol: null`) no es un fallo y no avisa**: es el servidor diciendo que no
 * hay nada.
 */
export async function pedirUi(
  ruta: string,
  senal?: AbortSignal,
  tema?: string,
  alFallar?: (motivo: 'red' | 'respuesta' | 'contrato') => void,
  opciones?: {
    /**
     * **Pedir la sección CON LA SESIÓN DEL USUARIO.**
     *
     * Hay secciones que son **de quien pregunta** —las tiendas que sigue (`sellers/following`), los
     * favoritos, sus pedidos—, y un árbol público no puede servirlas: sin token, el servidor no sabe
     * quién pregunta y **no puede contestar sin inventarse un usuario**.
     *
     * Por eso la petición lleva el mismo `Authorization: Bearer` que cualquier otra, y por eso esas
     * rutas **no se pueden cachear en público** (ver el `Cache-Control: private, no-store` del
     * servidor): una respuesta con las tiendas de alguien, guardada en una caché compartida, se le
     * sirve al siguiente que pregunte.
     */
    conSesion?: boolean;
  },
): Promise<UiRemota | null> {
  const separador = ruta.includes('?') ? '&' : '?';
  const conTema = tema ? `${ruta}${separador}tema=${encodeURIComponent(tema)}` : ruta;
  const url = `${UI_HOST}/api/ecomerse/ui/${conTema.replace(/^\//, '')}`;
  // **El token se pide a `httpClient`**, que es quien lo guarda y lo rota (`tokenActual`). Sin sesión no
  // se manda una cabecera vacía: se manda lo mismo que antes, y el servidor dirá «no hay nada».
  const tok = opciones?.conSesion ? tokenActual() : null;
  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      signal: senal,
      headers: tok ? { Authorization: `Bearer ${tok}` } : undefined,
    });
  } catch {
    // Sin red, o el servidor no está. **No se distingue a propósito**: desde aquí son lo mismo, y
    // quien depure tiene el log del servidor.
    alFallar?.('red');
    return null;
  }
  if (!respuesta.ok) {
    alFallar?.('respuesta');
    return null;
  }

  let cuerpo: unknown;
  try {
    cuerpo = await respuesta.json();
  } catch {
    // Un 200 con cuerpo que no es JSON es un servidor mal configurado, no una pantalla rota.
    alFallar?.('respuesta');
    return null;
  }

  // **La interpretación vive en el módulo puro** (`uiContrato.ts`): así se puede probar que
  // rechaza lo que debe rechazar, sin red y sin React.
  const r = interpretarRespuestaUi(cuerpo);
  // Un cuerpo que llega pero no se entiende SÍ avisa; un `arbol: null` legítimo no (ver arriba).
  if (!r && (cuerpo as { arbol?: unknown } | null)?.arbol !== null) alFallar?.('contrato');
  return r;
}

/** La portada del Mercado. */
export const uiHome = (senal?: AbortSignal, tema?: string) => pedirUi('home', senal, tema);

/**
 * Los relacionados de una ficha de producto.
 *
 * **Una ruta por sección, no una para todo.** Si todas las pantallas pidieran `home`, todas
 * recibirían el mismo árbol y el servidor no podría decir cosas distintas en cada sitio. El `id`
 * viaja para que el servidor pueda excluir el producto que se está mirando — «también te puede
 * interesar» no eres tú.
 */
export const uiDetail = (id: string, senal?: AbortSignal, tema?: string) =>
  pedirUi(`detail?id=${encodeURIComponent(id)}`, senal, tema);

export default { pedirUi, uiHome, uiDetail, ESQUEMA_UI };
