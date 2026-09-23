# Tanda P — COMPRA: elegir el pago, la tarjeta del pedido en el chat y el ticket

> Hecho el 15/09/2026. Es el **punto 4** de «lo que falta» del traspaso: los tres fallos que reportó
> el dueño en `PENDIENTE-COMPRA-PAGO-Y-TICKET.md`.

---

## 0. Qué se diagnosticó ANTES de tocar nada (con evidencia, no suposiciones)

| # | Lo que dijo el dueño | Lo que se comprobó |
|---|---|---|
| 1 | «A la hora de comprar no seleccionas el método de pago» | **La caja lo marcaba SOLA.** El servidor devuelve las formas de pago de la tienda `ORDER BY method`, o sea **alfabéticamente**, y la caja marcaba la primera activa: **`billing`**. La tienda de prueba tiene 5 activas (billing, cash_on_delivery, deposit, in_store, transfer) y **los 10 pedidos de la base salieron `billing`** — nadie eligió nada. El servidor NO tiene la culpa: valida y guarda lo que le manda la app (`orders.service.ts`: `PAY_METHODS` + «la tienda no acepta ese método»). |
| 2 | «al pulsar ‹escribir a la tienda› no sale la tarjeta de la compra embebida» | **La tarjeta sí existe y sí llega** (comprobado con la misma llamada que hace el botón: 8 tarjetas `kind='order'` con su `orderRef` en la conversación `3e274f1a…`). Lo que NO hacía el botón era **poner delante la de ESE pedido**: en una conversación con varias compras el comerciante no sabe de cuál se le habla, y en un pedido anterior a la tarjeta no hay ninguna. |
| 3 | «en el ticket no incluye el nombre, la dirección, el método de envío» | El `orderRef` que el servidor servía **no llevaba forma de pago ni dirección** (el nombre sí, pero la app solo lo pintaba en los avisos de grupo). Y no había ninguna etiqueta de «Pago» ni de «Entrega» con la dirección. |

## 1. Lo que se arregló

### Servidor (`pruebas/parche73-ticket-y-tarjeta.py`, ya aplicado)

| Fichero | Cambio |
|---|---|
| `lifebook/orders.service.ts` | La tarjeta del chat comprador↔tienda lleva ahora el **ticket**: `paymentMethod`, `deliveryAddress` y `note`. La del **grupo** se publica sin ellos (mismo `base`, sin el bloque `ticket`): **la dirección del comprador no es asunto de un grupo**. |
| `lifebook/orders.service.ts` | Método nuevo **`publicarTarjetaEnChat()`**: vuelve a publicar la tarjeta de ese pedido. Autorización por `publicOrder` (comprador, tienda o admin). No publica en grupos. |
| `lifebook/orders.controller.ts` | Ruta nueva **`POST /v1/lifebook/commerce/orders/:id/chat-card`**, que devuelve la conversación. |
| `lifebook/lifebook.service.ts` | El `orderRef` que lee la app sirve `paymentMethod`, `deliveryAddress` y `note`; en las tarjetas de grupo van en `null`. |

Chequeo previo obligatorio (`--noEmit`): **0 errores**. Emitido y `pm2 restart malabogo-api --update-env` → `online`.

### App

| Fichero | Cambio |
|---|---|
| `app/lifebook-checkout.tsx` | **La forma de pago ya no se marca sola.** En el pie se ve «Pagas: …» o, en rojo, «Elige cómo pagas». |
| `app/lifebook-carrito-checkout.tsx` | Igual, por tienda: sin marcar nada, y el pie dice en qué tienda falta elegir. |
| `app/lifebook-order/[id].tsx` | «Escribir a la tienda» **publica la tarjeta de ESE pedido** antes de abrir el chat (y abre la conversación que devuelve el servidor). Si falla, abre el chat igual. |
| `components/lifebook/OrderCardEnChat.tsx` | La tarjeta enseña el ticket: **Compra** (nombre), **Pago** (forma de pago), **Entrega** (recoger en tienda, o el reparto **con la dirección**) y **Nota**. No se pinta en tarjetas de grupo. |
| `api/commerce.ts` | `commerceOrdersApi.publicarTarjeta(id)`. |
| `api/messages.ts` | El tipo `LbMessageOrderRef` con los tres campos nuevos. |

## 2. Lo verificado contra la API real

`pruebas/lb71a-ticket-del-pedido.cjs` (lanzado desde el servidor, porque la red del equipo no llega):

```
pedido de prueba: LB-260914-0011 (created, pago=billing, entrega=pickup)
=== 1. BOTÓN «ESCRIBIR A LA TIENDA» ===
  OK   POST chat-card → HTTP 201
  OK   devuelve la conversación: 3e274f1a-7a0f-4d9c-8bcb-3861e5772dd4
=== 2. LA TARJETA (lo que recibe la app) ===
  OK   hay tarjetas de pedido: 9
  OK   la última tarjeta trae orderRef (no llega como texto plano)
  OK   la última tarjeta es la del pedido pulsado: LB-260914-0011
  OK   trae el nombre de quien compra: Administrador EG Route Plan
  OK   trae la forma de pago: billing
  OK   trae la dirección (aunque sea vacía en recogida): {"city":"","zone":"","reference":""}
=== 3. AUTORIZACIÓN ===
  OK   un pedido que no es mío NO se publica → HTTP 404 ORDER_NOT_FOUND
TODO OK
```

Además: `tsc --noEmit` de la app → **0 errores**; APK compilado (`BUILD SUCCESSFUL` en 1m 3s) e
instalado a las 15:16; y dentro del APK instalado está el código nuevo (el bundle contiene `chat-card`,
`publicarTarjeta`, `Pagas: ` y `Elige cómo pagas en `). El `tsc --noEmit` del **servidor** también pasó
(0 errores) antes de emitir, y `pm2` quedó `online`.

### Copias del servidor en el repositorio

Como manda la costumbre del proyecto, las tres copias del servidor **ya parcheadas** quedan en
`backend/server-src/` (`orders.service.ts`, `orders.controller.ts`, `lifebook.service.ts`) para poder
anclar el próximo parche con precisión. El respaldo de lo anterior sigue en el servidor como
`.bak-ticket-pedido-20260215`.

## 3. Lo que NO queda verificado

* **En pantalla**: que la caja ya no marque nada y que el pie diga «Elige cómo pagas»; que el ticket
  se vea bien dentro de la burbuja de la tarjeta (la tarjeta mide 236 px y ahora lleva 4 líneas más);
  y que «Escribir a la tienda» abra el chat con la tarjeta delante. **Lo prueba el dueño**: los toques
  automáticos ya crearon pedidos reales dos veces.
* **Un pedido de reparto de verdad** — ✅ **YA VERIFICADO (15/09, `pruebas/lb73a-ticket-con-direccion.cjs`,
  TODO OK)**: pedido con `taxi_moto` + dirección + cupón + contra entrega. La tarjeta del chat con la
  tienda lleva **la dirección** (`Malabo · Ela Nguema · portón azul, junto al mercado`), la forma de
  entrega, **cómo se paga**, **quién compra** y **el descuento**; el envío es el fijo de la tienda
  (1.500 XAF) y el total cuadra (`12.000 + 1.500 − 1.200 = 12.300`); con contra entrega sale código de
  entrega. Lo que sigue sin verse es **eso en la pantalla del móvil** (es del dueño).
* **Privacidad en grupos** — ✅ **YA VERIFICADO (15/09, `pruebas/lb74a-privacidad-del-grupo.cjs`, TODO OK)**:
  la tarjeta «social» del grupo lleva `social: true` y **`deliveryAddress: null`, `note: null`,
  `paymentMethod: null`** (y sí el nombre, que es el aviso). En el chat con la tienda, en cambio, va
  todo. Es decir: **la dirección del comprador no sale en un grupo**.
* **Cupones** — hecho en la tanda Q (`TANDA-Q-CUPONES-Y-BOTON-DE-PAGAR.md`): se aplican en la caja.
  Verificado contra la API (`lb72a`) y confirmado por el dueño **en el carrito**; falta verlo aplicado
  en la pantalla de la caja del producto.

## 4. Nota sobre los datos de prueba

`LB-260914-0011` sigue **abierto** (`created`): es el pedido que quedó de los toques automáticos del
14/09 y no se ha cancelado (no es mío decidirlo). El script de verificación **publicó una tarjeta más**
de ese pedido en la conversación de prueba con «Hotel Demo Malabo»: es la prueba del arreglo, y se ve
en el chat.
