/**
 * EL VOCABULARIO DE ESTADOS Y TONOS — en `constants/`, no en los componentes.
 *
 * ── POR QUÉ ESTÁ AQUÍ Y NO EN `piezas.tsx` ──────────────────────────────────
 * Nació dentro de las tarjetas, que es donde se usa. Pero `constants/lifebook.ts` también necesita
 * decidir el color de un estado (`LB_ORDER_META`), y un fichero de constantes que importa de un
 * componente está al revés: la capa de datos pasando a depender de la de pintado.
 *
 * Aquí no depende de `react-native` ni de ningún componente: es una tabla. Los dos lados la usan.
 * `piezas.tsx` la **re-exporta**, así que las 30 tarjetas siguen importando de donde siempre.
 *
 * ── LA LEY DE COLOR ─────────────────────────────────────────────────────────
 * El rojo (`peligro`) existe, pero **solo para `rechazado`**. Es una excepción aprobada por el
 * dueño el 17/10/2026: un pedido rechazado se pinta en rojo. El resto de estados no lo usan, y
 * `tonoDeClave` no devuelve `peligro` para ninguna otra clave — el rojo no se «cuela» por accidente.
 */

export type Tono = 'exito' | 'proceso' | 'espera' | 'neutro' | 'peligro';

export function colorDeTono(
  tono: Tono,
  colors: { success: string; secondary: string; warning: string; textSecondary: string; danger?: string },
): string {
  switch (tono) {
    case 'exito': return colors.success;
    case 'proceso': return colors.secondary;
    case 'espera': return colors.warning;
    case 'peligro': return colors.danger ?? colors.textSecondary;
    default: return colors.textSecondary;
  }
}

/**
 * EL ESTADO DE MÁQUINA, separado del rótulo que se lee.
 *
 * Antes las tarjetas recibían `estado: string` y el color lo decidía quien llamaba. Eso confunde
 * dos cosas distintas: **en qué punto está** (la máquina) y **cómo se llama ese punto en la
 * pantalla** (el rótulo). Mezcladas, la tarjeta no puede decidir el color sin parsear texto — y
 * parsear texto para decidir un color es cómo se acaba pintando de rojo «No entregado» porque
 * lleva la palabra «no».
 *
 * La referencia (`content.data.content.state` frente a `statusInfo.text`) también las separa.
 */
export type ClaveEstado = 'pendiente' | 'en_proceso' | 'hecho' | 'cancelado' | 'rechazado' | 'aviso';

/**
 * De la clave al tono. Un solo sitio decide.
 *
 * `rechazado` es la ÚNICA clave que devuelve `peligro`, y es una excepción aprobada: el resto de la
 * app reserva el rojo para emergencias, pero un pedido rechazado lo lleva por decisión del dueño.
 */
export function tonoDeClave(clave: ClaveEstado): Tono {
  switch (clave) {
    case 'hecho': return 'exito';
    case 'en_proceso': return 'proceso';
    case 'rechazado': return 'peligro';
    case 'pendiente':
    case 'aviso': return 'espera';
    case 'cancelado':
    default: return 'neutro';
  }
}

/**
 * LOS ESTADOS REALES DEL PEDIDO, y a qué clave van.
 *
 * Son **once** y vienen de dos generaciones del flujo, que conviven en `lifebook.orders`:
 *
 *   · la antigua (Mercado):  `requested`, `accepted`, `declined`
 *   · la del comercio:       `created`, `confirmed`, `preparing`, `in_transit`, `ready_pickup`,
 *                            `delivered`, `cancelled`
 *   · y `disputed`, que existe en las dos.
 *
 * Verificado sobre el código del servidor (`ACTIONS` de `orders.service.ts` y `LB_ORDER_META`), no
 * inventado: los once aparecen escritos en el repo.
 *
 * Lo desconocido cae en `pendiente`: un estado nuevo que este cliente no conozca se pinta en ámbar
 * («pendiente»), que es lo más honesto que se puede decir de él — mejor que decir «hecho» o
 * «cancelado» sin saberlo.
 */
export function claveDeEstadoPedido(status: string): ClaveEstado {
  switch (String(status ?? '').trim().toLowerCase()) {
    case 'delivered': return 'hecho';
    case 'accepted':
    case 'confirmed':
    case 'preparing':
    case 'in_transit':
    case 'ready_pickup': return 'en_proceso';
    case 'cancelled': return 'cancelado';
    case 'declined': return 'rechazado';
    case 'disputed': return 'aviso';
    case 'requested':
    case 'created':
    default: return 'pendiente';
  }
}
