/**
 * Pedidos — la pestaña de ventas de la zona del comerciante.
 *
 * NO es una pantalla nueva: es el carril de VENDEDOR de `ecomerse-orders`, que ya estaba construido
 * y probado (actividad y envío embebidos, timeline, disputa dentro de ventana, cobro al entregar).
 * Aquel motor existía entero… detrás de un enlace de texto de 12 px en la cabecera de la pantalla
 * vieja de tienda: estaba construido y no tenía puerta. Este fichero es la puerta.
 *
 * Lo que hace aquí y no allí: fija el rol (no se pregunta en qué papel estás dentro de tu tienda) y
 * oculta el segmento Compras/Ventas. Se pasa por props y no por URL para que la pantalla pueda vivir
 * DENTRO de la zona: con una redirección a `/ecomerse-orders` el comerciante saldría de su barra.
 */

import React from 'react';
import EcomerseOrdersScreen from '../ecomerse-orders';

export default function TiendaPedidos() {
  return <EcomerseOrdersScreen rolInicial="seller" ocultarSegmento />;
}
