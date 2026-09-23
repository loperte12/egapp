/**
 * LAS CUATRO SECCIONES DEL COMPRADOR, EN UN SOLO SITIO.
 *
 * POR QUÉ EXISTE ESTE FICHERO. La Fase 1 del pie pide que el perfil muestre 我的订单 con sus cuatro
 * secciones —待付款 · 打包中 · 待收货 · 评价, tal como salen en la referencia (Pinduoduo, imágenes #4
 * y #6)— y que cada una ABRA la lista ya filtrada. Eso son dos sitios preguntando lo mismo: el
 * perfil, que pinta el nombre y el número, y `ecomerse-orders.tsx`, que traduce ese nombre a una
 * consulta. Si cada uno guardara su copia del rótulo o del estado, un día el perfil diría «En
 * preparación» y el chip filtraría por otra cosa —y un contador que no filtra lo que promete es un
 * número decorativo, que es justo lo que el proyecto no quiere.
 *
 * POR QUÉ NO HAY TRADUCCIÓN AQUÍ. El id (`pendiente`, `preparando`…) es el que viaja en la URL
 * (`/ecomerse-orders?filtro=preparando`) y el rótulo es el que se lee. Los nombres van en español,
 * como el resto de la app: la app es para Guinea Ecuatorial y el chino de la referencia es la
 * referencia, no el texto que se pinta.
 *
 * LO QUE ESTE FICHERO **NO** ES. No añade ningún endpoint ni ningún estado: los cuatro salen de la
 * máquina de estados que ya existía (`pending / confirmed / in_transit / delivered`). En particular
 * 打包中 («preparando el paquete») NO es un estado nuevo: es `confirmed`, que significa «el vendedor
 * aceptó el pedido» — decisión cerrada en `MERCADO-PIE-PLAN.md` §5.d, y por eso el rótulo se
 * reinterpreta sin tocar el motor del pedido, que ya está probado de punta a punta.
 */

import { ecomerseApi, type EcomerseOrder } from '../../api/ecomerse';

export interface SeccionCompra {
  /** El id que viaja en `/ecomerse-orders?filtro=`. NO se renombra: hay enlaces guardados. */
  id: 'pendiente' | 'preparando' | 'enviado' | 'valorar';
  /** Lo que se lee. */
  label: string;
  /** Los estados del pedido que caen dentro. */
  estados: readonly string[];
  /** `valorar` (评价): de los entregados, sólo los que todavía NO tienen reseña. */
  sinResena?: boolean;
}

/**
 * El orden NO es alfabético ni casual: es el del ciclo de vida del pedido visto por quien compra
 * —pago lo que debo, el vendedor lo prepara, va en camino, y cuando llega lo valoro—, que es el
 * mismo orden que usa la referencia.
 */
export const SECCIONES_COMPRA: readonly SeccionCompra[] = [
  { id: 'pendiente', label: 'Por pagar', estados: ['pending'] },
  { id: 'preparando', label: 'En preparación', estados: ['confirmed'] },
  { id: 'enviado', label: 'En camino', estados: ['in_transit'] },
  { id: 'valorar', label: 'Por valorar', estados: ['delivered'], sinResena: true },
] as const;

export type SeccionId = SeccionCompra['id'];

export const buscarSeccion = (id: string) => SECCIONES_COMPRA.find((s) => s.id === id);

/**
 * Tope real de una llamada a `myOrders`: el servicio acota en el servidor con
 * `Math.min(Math.max(Number(limit) || 30, 1), 100)`. Este número es el techo de UNA petición, y es
 * lo que hace que el recuento de abajo pueda venir saturado.
 */
export const PAGINA_VALORAR = 100;

export interface EntregadosSinResena {
  orders: EcomerseOrder[];
  /** Cuántos entregados siguen sin reseña (el «评价» de la referencia). */
  n: number;
  /** `true` si hay más entregados de los que caben en una página: `n` es un SUELO, no el total. */
  truncado: boolean;
}

/**
 * Los entregados que siguen SIN reseña: el 评价 (待评价) de la referencia.
 *
 * POR QUÉ SE CUENTA EN EL CLIENTE. El contador del servidor (`orders/counts`) agrupa por ESTADO, y
 * «sin reseña» no es un estado: es la ausencia de fila en `wallet.ecomerse_reviews`. Añadirlo al
 * backend era cambiar el contrato en una fase que se llama «sin backend nuevo», así que se cuenta
 * aquí sobre los entregados, que sí traen `reviewed` pedido a pedido.
 *
 * LO QUE ESTO NO ES — y por eso devuelve `truncado`. Con más de 100 entregados el número sería un
 * SUELO, no el total, y quien lo pinta tiene que decirlo (`99+`). Un «37» que parece exacto y no lo
 * es hace más daño que un «99+» honesto; es la misma regla que el KPI del comerciante, que avisa
 * cuando calcula sobre una página.
 *
 * CUÁNDO HABRÁ QUE CAMBIARLO. Cuando un comprador pase de 100 pedidos entregados, esto pide un
 * contador en el backend. Mientras, el tope se dice en pantalla en vez de esconderse.
 */
export async function traerEntregadosSinResena(): Promise<EntregadosSinResena> {
  const r = await ecomerseApi.myOrders('buyer', { status: 'delivered', limit: PAGINA_VALORAR });
  const orders = r.orders.filter((o) => !o.reviewed);
  return { orders, n: orders.length, truncado: r.total > r.orders.length };
}
