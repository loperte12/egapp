/**
 * LOS DOS CANALES DEL SISTEMA — el contrato compartido (Fase 3 del pie del Mercado, 22-sep-2026).
 *
 * POR QUÉ ESTÁ EN UN MÓDULO Y NO DENTRO DE UNA PANTALLA
 * Exactamente por lo mismo que `seccionesCompra.ts`: el rótulo de un canal y el significado de su id
 * los usan **dos** sitios —la bandeja de Mensajes, que pinta las dos filas con su contador, y la
 * pantalla del canal, que pone ese rótulo en su cabecera y lo manda en la URL—. Si cada uno
 * guardara su copia, un día la fila diría «Avisos de tus pedidos» y la cabecera «Transacciones», y
 * el usuario no tendría forma de saber que son el mismo sitio. **El id es el que viaja en la URL**,
 * y por eso la URL y las dos pantallas hablan del mismo canal por construcción.
 *
 * LA `nota` EXPLICA QUÉ TRAE CADA CANAL, no lo adorna
 * Una fila que sólo dice «Avisos de tus pedidos» no ayuda a decidir cuál abrir; la nota enumerada
 * («cuando pagas, cuando la tienda acepta, cuando se cancela…») sí. Está escrita con los hechos que
 * el servidor produce de verdad —los ocho códigos de `avisoDe()` en `ecomerse.service.ts`— y no con
 * una lista aspiracional: si mañana se añade un hecho, esto se queda corto pero **no miente**.
 *
 * El ORDEN es el del uso: primero lo que pasó con el dinero, después dónde va el paquete. Es el
 * mismo orden en que la bandeja pinta sus filas y en el que el servidor devuelve los contadores.
 */

/** Los dos canales. El tipo vive aquí y el cliente de la API lo importa de aquí. */
export type CanalAviso = 'transaction' | 'logistics';

export interface CanalDef {
  id: CanalAviso;
  /** El rótulo de la fila y el título de la pantalla. El mismo texto en los dos sitios, a propósito. */
  label: string;
  /** Qué aparece dentro, con los hechos reales. */
  nota: string;
}

export const CANALES_AVISO: CanalDef[] = [
  {
    id: 'transaction',
    label: 'Avisos de tus pedidos',
    nota: 'Cuando el pedido nace, cuando la tienda lo confirma, cuando se cancela y cuando se abre o se cierra una disputa.',
  },
  {
    id: 'logistics',
    label: 'Asistente de logística',
    nota: 'El viaje del paquete: el agente asignado, la salida hacia tu zona y la entrega.',
  },
];

/**
 * El canal que pide la URL —`/ecomerse-mensajes-avisos?canal=logistics`—, o `null` si el id no es
 * de ningún canal. Devolver `null` en vez de un canal por defecto es lo que permite que una URL
 * manipulada o vacía se lea como «todos los avisos» en lugar de como un canal que nadie pidió.
 */
export const buscarCanal = (id?: string | null): CanalDef | null =>
  CANALES_AVISO.find((c) => c.id === id) ?? null;
