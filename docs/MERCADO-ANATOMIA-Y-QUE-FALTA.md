# Mercado (市集) — anatomía, qué tenemos y qué falta

> Estado: **investigación hecha** y **tres piezas implementadas**: el flujo embebido del chat
> (niveles 1 y 2), la consulta estructurada de producto y **el pedido dentro del chat (tanda E)**.
> Fecha: 14/09/2026.
> **El footer NO se ha tocado** (decisión del dueño): el Mercado sigue entrando por el menú de
> servicios, y el tab 市集 queda pendiente de autorización.

---

## 0-bis. Implementado también: EL PEDIDO VIVE EN EL CHAT (tanda E)

Lo cuenta `docs/TANDA-E-EL-PEDIDO-EN-EL-CHAT.md`. En una línea: al crear un pedido se publica su
**tarjeta** en el chat con la tienda (y en el **grupo** si la compra nació ahí, como «✅ {nombre}
compró {producto}»), y **el estado de la tarjeta es el vivo** —lo resuelve el servidor al leer el
mensaje—, así que un pedido aceptado se ve «Confirmado por la tienda» sin reabrir nada. Verificado
en el teléfono y con 35 comprobaciones contra la API real.

---

## 0. Implementado: el flujo EMBEBIDO del chat (niveles 1 y 2)

**Qué era antes**: la tarjeta de producto del chat tenía «Comprar» y **te sacaba a la ficha en
pantalla completa**, y de ahí a la caja. Tres navegaciones, y el documento de Mercado explica por
qué eso cuesta ventas (de ~39 % a ~75 % de compras terminadas, según sus números).

**Qué hay ahora** (`components/lifebook/ProductoEnChatSheet.tsx`, conectado desde la tarjeta del
chat):

| Nivel | Qué hace |
|---|---|
| **1** | Tocar la tarjeta abre una **hoja inferior (65 %)** con la foto, el nombre, la descripción corta, el precio, las **variantes** (obligatorias si las hay), el **selector de cantidad**, el **total en vivo** y dos botones: **«Añadir al carrito»** y **«Comprar ahora»**. El chat se queda **detrás, oscurecido**; al tocar fuera o cerrar, se vuelve exactamente donde estabas |
| **2** | «Comprar ahora» **expande la MISMA hoja** (92 %) con el resumen (producto y variante elegida), el desglose (subtotal, envío, cupón, **total**) y **«Pagar {total}»** → abre la caja que ya existe con producto, variante y cantidad. Un tirador permite encogerla y seguir mirando |
| **3** | El pago sigue siendo pantalla completa (`/lifebook-checkout`), que es lo que la propia especificación permite porque es una pasarela externa |

**Lo que la hoja dice en voz alta** (en vez de disimularlo): el envío «se elige en la caja» y los
cupones «todavía no hay cupones». Un resumen que oculta lo que falta es peor que no tenerlo.

**Estado de la verificación** (14/09/2026): **VISTO EN PANTALLA** en el Poco F5. Tocar «Comprar» en
la tarjeta del chat abre **la hoja** (no la ficha), con «Talla 42 · 12.000 XAF», «Cantidad 1» y los
dos botones; «Comprar ahora» **expande la misma hoja** («Confirmar la compra», subtotal, «Envío: se
elige en la caja», «Cupón: todavía no hay cupones», Total 12.000 XAF, «Pagar 12.000 XAF»); «Pagar»
abre la caja y el pedido se crea de verdad (LB-260914-0003). El detalle completo está en
`docs/TANDA-E-EL-PEDIDO-EN-EL-CHAT.md`.

---

## 1. Lo que YA está construido (y no hay que rehacer)

| Pieza de la especificación | Dónde está | Estado |
|---|---|---|
| Rejilla de productos a **doble columna con precio** | `app/lifebook-catalog.tsx` («Tiendas y servicios») | Hecho. Ahora con tarjetas de 208 dp, descripción corta y «X vendidos» |
| **Categorías** con «Todo» primero | mismo fichero | Hecho (fila de chips arreglada: 32 dp de alto, texto legible) |
| **Buscador** del catálogo | ídem + `commerce.service.ts` | Hecho y mejorado: busca también por tienda y categoría |
| **Ficha de producto** con carrusel, precio grande, nombre, descripción larga y **selector de variantes** | `app/lifebook-product/[id].tsx` | Hecho |
| **Elegir antes de comprar**: «Comprar» y «Añadir al carrito» abren un **selector** (talla, color, cantidad) con la **foto real de cada color**, el precio y el stock de ESA combinación y lo agotado en gris | `components/lifebook/SelectorDeVariante.tsx` + `product_option_groups`/`product_option_values` | **Hecho (tanda K)**: los dos botones ya no compran directo con la primera opción de la lista. El comerciante configura los ejes antes de publicar, con la **tabla de tallas** (mujer/hombre/unisex) dentro del publicador |
| **Variantes** con precio propio | `lifebook.product_variants` (25 filas) | Hecho. Tanda K: además llevan la **combinación** (`attributes`) y la **foto del color** |
| **Añadir al carrito** y **Comprar ahora** en la ficha | ídem + `app/lifebook-carrito.tsx` | Hecho esta sesión |
| **Carrito** con cantidades, total y quitar línea | `lifebook.cart_items` + pantalla propia | **Hecho y ampliado (carrito v2)**: agrupado **por tienda**, casillas de tres estados, variante cambiable sin salir, precio anterior tachado, modo Editar, deslizar para eliminar y **caja con un pedido por tienda**. Ver `docs/CARRITO-V2.md` |
| **Caja** (cantidad, entrega, forma de pago) | `app/lifebook-checkout.tsx` | Existe (no la he auditado campo por campo) |
| **Pedidos** con varias líneas, estados y escrow | `lifebook.orders` (138) + `order_items` (93) | Existe y con datos reales |
| **Mis pedidos** | `app/lifebook-orders.tsx` | Existe |
| **Tarjeta de producto dentro del chat** (nivel 0/1: se manda y se ve) | `lifebook.messages` (`kind='product'`) + `Bubble` | Hecho esta sesión |
| **Tarjeta del PEDIDO dentro del chat, con estado vivo** | `lifebook.messages` (`kind='order'`) + `components/lifebook/OrderCardEnChat.tsx` | **Hecho (tanda E)**: se publica al crear el pedido en el chat con la tienda y en el grupo donde nació; el estado se resuelve al leer |
| **Mensaje social «✅ {nombre} compró {producto}» en el grupo** | mismo sitio (`social: true`) | **Hecho (tanda E)**, verificado en el teléfono |
| **Mensajes con tiendas** | chat 1 a 1 con el dueño de la tienda | Existe (no es un canal de «atención al cliente» aparte) |
| **Tienda completa** (banner, logo, nombre, ★, seguir, contactar) | `app/lifebook-shop/[id].tsx` | Existe |

## 2. Lo que FALTA (medido)

| Pieza | Estado | Nota |
|---|---|---|
| **Tab 市集 en la barra inferior** | No existe | El catálogo se abre desde el menú de servicios. **OJO**: la barra está en `components/FloatingFooter.tsx`, que el dueño pidió **no tocar**; añadir un tab ahí necesita su permiso |
| **Canales rápidos** (lives, escaparate del comprador, estrenos, frutas de temporada, snacks de oficina) | No existe **ningún concepto de canal editorial** | No hay tabla, ni curación, ni algoritmo. Es la pieza más «de plataforma» de la especificación |
| **Fila de 5 accesos**: Mis pedidos · Carrito · **Cupones** · Mensajes de servicio · **Historial de productos** | 4 de 5 | **Cupones**: **empezados (tanda H2)** — tablas `coupons` + `coupon_claims` + `order_coupons`, la tienda los crea y la persona los recoge (35/35 contra la API); falta aplicarlos en la caja y las pantallas. **Historial de productos: hecho (tanda F)**. **Mensajes de servicio**: es el chat con la tienda que ya existe |
| **Vídeo corto en autoplay dentro de la tarjeta** | No | La rejilla solo pinta foto |
| **Badges de tienda** («Tienda oficial», «Envío gratis», «Devolución gratis») | Parcial | Existe «verificada» (`is_verified`) y los niveles de verificación; los otros badges no |
| **Etiqueta de canal** en la tarjeta | No | Depende de los canales, que no existen |
| **Waterfall con alturas según la foto** (verticales 3:4 más altas) | No | La rejilla usa una altura fija de 108 dp |
| **Reseñas del producto** (puntuación, listado, «ver todas») | No | Las tablas existen (`wallet.ecomerse_reviews`, `rating`, `rating_count`) pero **están vacías (0 filas)** y no hay pantalla. El propio código las marca como futuras |
| **«Notas relacionadas»** (contenido → producto) | No | Hicimos lo contrario (producto dentro de la nota). Falta el camino de vuelta: ver en la ficha las notas donde se menciona |
| **Checkout con dirección guardada, cupón, mensaje al vendedor y desglose** | Parcial | La caja existe; **no hay libreta de direcciones** ni cupones ni desglose visible. **Sin verificar campo por campo** |
| **Pasarela de pago** (métodos, confirmación, «pago exitoso», pedido en «pendiente de envío») | Parcial | Hay `payment_method`/`payment_status` en los pedidos y flujo de escrow; **sin verificar** si hay pantalla de pago real |
| **Flujo EMBEBIDO del chat (niveles 1-2-3)** | Niveles 1 y 2 hechos | La tarjeta abre una **hoja** (65 %) para elegir variante y cantidad, se **expande** (92 %) con el desglose y «Pagar». Lo que falta es el **nivel 3 dentro del chat**: el pago sigue siendo la caja a pantalla completa (la especificación lo permite, pero no es «todo dentro») |
| **Mensaje del sistema «✅ Has comprado X»** en el grupo (prueba social) | **Hecho (tanda E)** | El aviso sale al crear el pedido y la tarjeta lleva el estado vivo |
| **Panel del comerciante**: cuántos tocan, cuántos llegan al panel, cuántas compras, cuánto ingresa | No | No se mide nada de eso |
| **Aviso de reposición** («avísame cuando llegue») | **Hecho (tanda G)** | Tabla `product_interest`, botón en la ficha cuando está agotado y aviso **por el chat** al reponer (panel, republicar o aprobar). Ver `docs/TANDA-G-AVISO-Y-ZONA.md` |
| **«Fuera de zona»** (la tienda no envía a donde vive el comprador) | **Hecho (tanda G)** | El bloque del carrito lo dice y solo ofrece recoger en tienda |

## 3. Las tres piezas que de verdad mueven la aguja (por orden de valor/esfuerzo)

### A. El flujo embebido del chat (lo que el propio documento llama «la clave»)
Los niveles 1, 2 y el aviso social **ya están** (ver secciones 0 y 0-bis). Lo que falta es el nivel 3:
1. ~~al tocar la tarjeta → hoja inferior con fotos, variantes, cantidad y total~~ **hecho y visto en pantalla**;
2. ~~«Comprar ahora» → la misma hoja se expande con el resumen y el desglose~~ **hecho** (dirección y
   cupón siguen fuera: la dirección se elige en la caja y los cupones no existen);
3. «Pagar» → **aquí sí se sale** a la caja a pantalla completa; al volver, la **tarjeta del pedido**
   ya está en el chat con su estado, y en el grupo con el aviso social (**hecho en la tanda E**).
   Falta meter el pago dentro del chat para cerrar el nivel 3.

Es la pieza con mejor relación valor/esfuerzo porque **las piezas ya existen** (producto, variantes,
carrito, caja) y lo que se añade es cómo se presentan. Y es la que el documento justifica con
números (de ~39 % a ~75 % de compras completadas).

### B. Historial de productos + Cupones (2 de los 5 accesos)
* **Historial**: es una tabla nueva (`product_views`: persona, producto, cuándo) + registrar la
  visita al abrir una ficha + una pantalla de rejilla. Barato y muy visible («viste esto ayer»).
* **Cupones**: tabla de cupones + reglas (mínimo, caducidad, tienda) + pantalla de «usables/usados».
  Es dinero: merece su propia tanda y probarlo con cuidado.

### C. Tab 市集 + canales
El **tab** es barato pero **toca la barra inferior, que está fuera de límites** hasta que el dueño
lo autorice. Los **canales editoriales** son lo más caro y lo más «de plataforma»: sin curaduría
ni datos de ventas suficientes, un canal inventado hoy no tendría contenido que enseñar.

## 4. Decisiones que necesito antes de tocar nada

1. **¿Puedo tocar la barra inferior (`FloatingFooter.tsx`)** para añadir el tab 市集, o preferís que
   el Mercado siga entrando por el menú de servicios? (Fue una de las tres cosas que pediste no
   tocar al principio.)
2. **¿Empezamos por el flujo embebido del chat (A)**, que es lo que más convierte y donde ya hay
   base, o preferís primero **el historial y los cupones (B)**?
3. **Reseñas**: están las tablas pero **vacías**. ¿Montamos la pantalla y pedimos reseñas a los
   compradores, o lo dejamos para después de que haya ventas reales?
4. **Direcciones de envío**: la caja actual no tiene libreta de direcciones. ¿La hacemos ahora
   (hace falta para el checkout completo) o seguimos usando la dirección del pedido?

## 5. Verificado después (14/09/2026, para no suponer)

* **La caja NO está vacía**: `app/lifebook-checkout.tsx` tiene subtotal, **modos de entrega reales**
  de la tienda (+ «recoger en tienda»), elección de ciudad, **métodos de pago** del catálogo
  (`LB_PAY_METHODS`), coste de envío, **total** y hasta el aviso de pago en efectivo contra
  entrega. Es una caja de **un producto** bastante completa. Lo que le falta respecto a la
  especificación: **libreta de direcciones**, **cupones**, **mensaje al vendedor** y la línea de
  descuento en el desglose.
* **La barra inferior YA tiene 5 tabs**: `Life Book · Llamar Taxi · Inicio · Mensajes · Perfil`
  (`components/FloatingFooter.tsx:25-30`). El Mercado sería el **sexto**: o se añade (seis iconos
  se aprietan en un móvil), o **sustituye a uno**, o el Mercado sigue entrando por el menú de
  servicios. Y ese fichero es uno de los que pediste no tocar.

## 6. Lo que sigue sin verificar (y no voy a suponer)

* **La pasarela de pago**: el 14/09/2026 se recorrió la caja **en el teléfono** y el pedido se creó
  de verdad (`LB-260914-0003`): entrega («Recoger en tienda», «Recoges en Hotel Demo Malabo ·
  Paraíso»), formas de pago de la tienda (Billing, Efectivo contra entrega, Señal, Pago en tienda,
  Transferencia), total y confirmación. Lo que **sigue sin verificarse** es si hay un cobro real
  (WebView/redirección) o si solo se **registra el método** elegido en el pedido.
* Si existe algún flujo de **devoluciones/postventa** más allá de los estados del pedido.
* Si el **panel del comerciante** mide hoy algo del grupo o de la tienda.
