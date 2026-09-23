# PENDIENTE — Comprar: pago, tarjeta del pedido en el chat y ticket

> **Reportado por el dueño el 15/09/2026 · RESUELTO el 15/09/2026 → `TANDA-P-COMPRA-PAGO-Y-TICKET.md`.**
> Lo que sigue son SUS palabras, tal cual, y debajo de cada punto lo que resultó ser de verdad (con la
> evidencia). Se deja este documento porque el diagnóstico es lo que importa cuando algo vuelva a
> pasar aquí.

## 1. Al comprar no se elige el método de pago

«A la hora de comprar no seleccionas el método de pago.»

**RESUELTO — era de la app.** El servidor devuelve las formas de pago `ORDER BY method` (o sea,
**alfabéticamente**) y la caja **marcaba sola la primera activa**, que es **`billing`**: los 10 pedidos
de la base salieron `billing` sin que nadie lo eligiera. El servidor siempre guardó bien lo que le
mandaron (valida el método y que la tienda lo acepte). Ahora la caja **no marca nada**, en el pie se ve
«Pagas: …» y sin elegirlo no se puede pagar.

## 2. Al escribir a la tienda no sale la tarjeta del pedido

«Una vez comprado, al pulsar «escribir a la tienda» no te sale la tarjeta de la compra embebida para
que el comerciante pueda saber qué pedido es.»

**RESUELTO — la tarjeta ya estaba; lo que faltaba era ponerla al pulsar.** Comprobado con la misma
llamada que hace el botón: la conversación tenía 8 tarjetas `kind='order'` con su `orderRef`. Lo que no
hacía el botón era **dejar delante la de ESE pedido** (y en un pedido anterior a la tarjeta, no había
ninguna). Ahora el botón publica la tarjeta de ese pedido y abre la conversación que devuelve el
servidor (`POST /lifebook/commerce/orders/:id/chat-card`).

## 3. El ticket no trae lo mínimo

«Tampoco en el ticket incluye el nombre del que compra, la dirección, el método de envío.»

**RESUELTO — faltaban datos en el `orderRef`.** El nombre venía pero la app solo lo pintaba en los
avisos de grupo, y **la forma de pago y la dirección no se servían en absoluto**. Ahora la tarjeta
lleva **Compra · Pago · Entrega** (con la dirección del reparto) **y Nota**. En las tarjetas de grupo
esos datos van en `null` a propósito: la dirección del comprador no es asunto de un grupo.

## Lo que sigue pendiente de verdad

* **Probarlo en pantalla** (lo hace el dueño: los toques automáticos ya crearon pedidos reales).
* **Un pedido de reparto de verdad**: el ticket con dirección solo se ha probado con un pedido de
  recogida, donde la dirección va vacía.
* **Cupones en la caja**: **HECHOS en la tanda Q** (`TANDA-Q-CUPONES-Y-BOTON-DE-PAGAR.md`): se eligen
  en la caja, con su código y su descuento. Falta probarlos en pantalla.
* **El botón de pagar que «no reaccionaba»** (lo reportó el dueño después): era el aviso de lo que
  faltaba, que salía **fuera de la pantalla**. Arreglado en la tanda Q: el motivo se dice en el pie y
  el botón nunca se queda apagado sin explicar por qué.
