# Tanda E — EL PEDIDO VIVE EN EL CHAT (Mercado)

> Estado: **servidor 35/35** y **verificado en el teléfono (Poco F5)**, incluido el refresco del
> estado con el chat abierto. Fecha: 14/09/2026.
> **El footer NO se ha tocado** y `api/lifebook.ts` tampoco.

---

## 1. Qué problema resuelve

El documento del Mercado pide dos cosas que hasta hoy no existían:

1. **La tarjeta del pedido dentro de la conversación**: el comprador y la tienda hablan de la
   entrega en el chat, pero el pedido solo se veía en «Mis pedidos» (otra pantalla). En el chat
   quedaban **avisos sueltos de texto** («Tu pedido va en camino») sin el objeto: nadie podía ver
   **qué** se pidió ni cuánto ni en qué estado iba.
2. **El aviso social en el grupo**: «✅ {nombre} compró {producto}», que es la prueba social que la
   especificación usa para vender más dentro de las conversaciones.

Antes de esta tanda, en la app **no aparecía la palabra «compró» en ninguna parte** (comprobado).

## 2. Cómo quedó

| Pieza | Qué hace |
|---|---|
| **Tarjeta de pedido en el chat** (`kind='order'`) | Foto, artículo, variante, cantidad, total, forma de entrega, **estado** y botón **«Ver pedido»** → `/lifebook-order/[id]` |
| **Estado VIVO** | El estado **no se congela**: lo resuelve el servidor al **leer** el mensaje (JOIN con `lifebook.orders`). Un mensaje de hace una semana enseña el estado de hoy |
| **En el chat con la tienda** | La tarjeta se publica **siempre**, tenga o no chat previo (se crea la conversación si hace falta). Es donde se acuerda la entrega |
| **En el grupo** | Si la compra nació en un **grupo del comprador**, la tarjeta se publica **también allí**, con el rótulo social «✅ {nombre} compró {producto}» y el número de pedido debajo en pequeño |
| **Sin fecha inventada** | El esquema **no tiene fecha estimada de entrega**, así que la tarjeta **no la inventa**: dice lo que sí se sabe («Recoges en {tienda} cuando la tienda lo acepte», «En camino · la entrega se acuerda por el chat», «Entregado el 14 sep») |
| **Buscador «🧾 Pedidos»** | Nuevo apartado en el buscador del historial del chat (`?kind=order`) |
| **Refresco con el chat abierto** | Las tarjetas de pedido **se refrescan** en cada sondeo del chat (4 s), no solo se añaden las nuevas |

### De dónde sale cada dato

* **Foto del momento**: título, variante, cantidad e importe se guardan en el `payload` del mensaje
  al crear el pedido. Es la verdad histórica: si la tienda borra el producto, el pedido sigue
  contando qué se compró.
* **Estado de hoy**: del `JOIN` con `lifebook.orders` al leer (`ord_status`, `ord_total`,
  `ord_delivery`, `ord_delivered`). Es el mismo criterio que la tarjeta de producto de la tanda D
  (que enseña el precio de hoy, no el del día que se envió).

## 3. Verificación contra la API real (`pruebas/lb53a-verificar-pedido-en-chat.cjs`)

**35 PASA · 0 FALLA** con datos reales (comprador de prueba, tienda real, pedido de verdad que se
cancela al final para devolver el stock):

```
=== 1. EL PEDIDO SE PUBLICA EN EL CHAT DE LA TIENDA ===
  tarjeta con número, estado del momento, total, 1 artículo, nombre del artículo,
  foto, forma de entrega, «no es aviso social», texto «🧾 Pedido LB-…» y nombre de quien compró
=== 2. Y EN EL GRUPO, COMO PRUEBA SOCIAL ===
  «✅ BERNARDO LOPERTE compró «Producto pedidos 224163567»» · social=true · tienda en la tarjeta
=== 3. EL ESTADO ES EL VIVO, NO EL DEL DÍA DE LA COMPRA ===
  la tienda acepta → EL MISMO mensaje (mismo id) pasa a «confirmed» · sigue habiendo UNA sola tarjeta
=== 4. REINTENTO IDEMPOTENTE: NO SE DUPLICA ===
  devuelve el mismo pedido y NO publica otra tarjeta
=== 5. QUIEN NO PARTICIPA NO LEE ESA CONVERSACIÓN ===
  403 en el chat comprador↔tienda y 403 en el grupo
=== 6. EL BUSCADOR DEL CHAT ENCUENTRA LOS PEDIDOS ===
  ?kind=order → 200 y devuelve la tarjeta, sin colar otros tipos
```

## 4. Verificación en el teléfono (Poco F5), leído de la pantalla

**Compra hecha desde la app** (catálogo → ficha → chat con la tienda → tarjeta del producto →
hoja embebida → caja), sin salir del flujo del Mercado:

| Paso | Lo que se leyó |
|---|---|
| Hoja nivel 1 (chat detrás) | «Producto pedidos 224163567» · 12.000 XAF · «Hotel Demo Malabo» · «Elige una opción» «Talla 42 · 12.000 XAF» · «Cantidad 1» · «Añadir al carrito» / «Comprar ahora» |
| Hoja nivel 2 (expandida) | «Confirmar la compra» · «Producto pedidos 224163567 · Talla 42» · Subtotal 12.000 · Envío «se elige en la caja» · Cupón «todavía no hay cupones» · **Total 12.000 XAF** · «Pagar 12.000 XAF» |
| Caja | «Finalizar pedido» · «Recoger en tienda» · «Recoges en Hotel Demo Malabo · Paraíso» · Billing · «Confirmar pedido» |
| Pedido creado | «Pedido LB-260914-0003» · «Pedido creado» · «Tu pedido está en marcha» |
| **Tarjeta en el chat** | «Pedido LB-260914-0003» · pastilla **«Pedido creado»** · «Producto pedidos 224163567» · «Talla 42» · «12.000 XAF» · «Recogida en tienda» · **«Recoges en Hotel Demo Malabo cuando la tienda lo acepte»** · «Ver pedido» |
| **Estado vivo (chat abierto)** | La tienda acepta → la pastilla pasa a **«Confirmado por la tienda»** y la línea a **«Puedes recogerlo en Hotel Demo Malabo cuando te avisen»**, **con el chat abierto**, sin cerrar ni reabrir |
| **Grupo (prueba social)** | «**✅ Administrador EG Route Plan compró**» · «Pedido creado» · «Producto pedidos 224163567» · 10.000 XAF · «Pedido LB-260914-0004 · Hotel Demo Malabo» · «Recoges en Hotel Demo Malabo cuando la tienda lo acepte» |
| **Estado vivo en el grupo** | Se acepta el pedido → **«Confirmado por la tienda»** + «Puedes recogerlo…»; después se cancela → **«Cancelado»** + «El pedido se canceló». Todo **sin reabrir el chat** |
| «Ver pedido» | Abre `/lifebook-order/[id]`: «Pedido LB-260914-0004» · «Confirmado por la tienda» · barra Recibido→Confirmado→En preparación→En camino→Entregado · artículos · subtotal · total |
| Buscador «🧾 Pedidos» | Pestaña nueva en el buscador del historial: lista «🧾 Pedido LB-260914-0004» y «🧾 Pedido LB-260914-0003» |
| Chat con la tienda | Las dos tarjetas conviven con los avisos del sistema («La tienda aceptó tu pedido», «El comprador canceló el pedido») |

### Un fallo que encontró esta verificación (y se corrigió)

**La tarjeta no se refrescaba con el chat abierto.** El sondeo del chat (cada 4 s) solo **añadía**
mensajes nuevos (`!seen.has(id)`), así que un pedido ya aceptado seguía diciendo «Pedido creado»
—con el aviso «La tienda aceptó tu pedido» ya en pantalla— hasta cerrar y reabrir el chat. Se vio
en el teléfono, no en el laboratorio. Ahora el sondeo **refresca los mensajes de pedido** (y solo
esos, para no pisar estados locales como el voto optimista de una votación).

## 5. Lo que NO está hecho (dicho claro)

1. **La compra no se puede completar sin salir del chat**: el nivel 3 sigue siendo la caja a pantalla
   completa (`/lifebook-checkout`). La especificación lo permite (es una pasarela externa), pero no
   es «todo dentro del chat»: falta el pago embebido.
2. **El estado no se actualiza solo si el chat está cerrado**: al abrirlo se ve el estado bueno
   (se resuelve al leer), pero no hay notificación push del cambio de estado más allá del aviso de
   sistema que ya existía.
3. **No hay fecha estimada de entrega** en el esquema, así que la tarjeta no la enseña. Si se quiere
   «Llegada: 2 días», hay que añadir el dato al pedido y que la tienda lo ponga.
4. **El cupón sigue sin existir** (no hay tabla) y la libreta de direcciones tampoco: la caja es la
   de siempre.
5. **Pedidos con varias líneas**: la tarjeta enseña el primero y «y N artículos más»; hoy la caja
   solo sabe comprar un producto (el carrito se compra línea a línea).
6. **En el grupo solo se publica si la compra nació ahí** (el chat viaja con la compra desde la hoja
   del producto). Comprar desde la ficha suelta o desde el carrito publica la tarjeta **solo** en el
   chat con la tienda.

## 6. Mapa de ficheros

| Cosa | Sitio |
|---|---|
| Publicar la tarjeta + estado vivo (servidor) | `/opt/mirror/app/src/lifebook/orders.service.ts` (`conversacionDirecta`, `publicarEnChat`, `publicarPedido`), `lifebook.service.ts` (`serializeMessage` → `orderRef`, JOIN con `lifebook.orders`) |
| Parche aplicado | `D:\egapp\pruebas\parche41-pedido-en-chat.py` |
| Respaldos | `orders.service.ts.bak-pedido-en-chat-20260214`, `lifebook.service.ts.bak-pedido-en-chat-20260214` |
| Copias de trabajo del servidor | `D:\egapp\.tmp-servidor\` (con `servidor-ssh.ps1` y `servidor-subir.ps1` para lanzar comandos y subir ficheros) |
| Tipos de la app | `api/messages.ts` (`LbMessageOrderRef`, `kind: 'order'`) · `api/commerce.ts` (`conversationId`) |
| Tarjeta | `components/lifebook/OrderCardEnChat.tsx` (**nuevo**) |
| Chat | `app/lifebook-chat/[id].tsx` (rama `kind === 'order'`, refresco del sondeo, `conversationId` a la hoja) |
| Hoja y caja | `components/lifebook/ProductoEnChatSheet.tsx`, `app/lifebook-checkout.tsx` |
| Buscador | `constants/lifebook-chat.ts` (pestaña «🧾 Pedidos») |
| Prueba | `pruebas/lb53a-verificar-pedido-en-chat.cjs` (35 comprobaciones) |

---

## 7. Cómo se lanza el servidor (por si hace falta repetirlo)

```powershell
pwsh -File D:\egapp\pruebas\servidor-subir.ps1 -Local D:\egapp\pruebas\parche41-pedido-en-chat.py -Remoto /root/parche41-pedido-en-chat.py
pwsh -File D:\egapp\pruebas\servidor-ssh.ps1   -Comando 'cd /opt/mirror/app && python3 /root/parche41-pedido-en-chat.py'
pwsh -File D:\egapp\pruebas\servidor-ssh.ps1   -Comando 'cd /opt/mirror/app && npx tsc -p tsconfig.json && pm2 restart malabogo-api'
```

> El parche **no escribe nada** si algún anclaje no aparece exactamente el número de veces esperado:
> primero comprueba y luego escribe. La clave SSH vive en `%USERPROFILE%\.ssh\askpass-servidor.cmd`
> (fuera del repositorio).
