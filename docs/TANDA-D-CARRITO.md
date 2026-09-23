# Tanda D — Carrito y tarjeta de producto en el chat

> ⚠️ **Ampliado el 14/09/2026**: el carrito es ahora el **carrito v2** (agrupado por tienda, casillas
> de tres estados, variante cambiable sin salir, precios comparados y **caja con un pedido por
> tienda**). Este documento cuenta la primera versión; la vigente está en `docs/CARRITO-V2.md`.

> Estado: **las DOS partes hechas y verificadas** (servidor + teléfono). Fecha: 14/09/2026.
> Cuarta tanda del plan aprobado (A · B · C hechas; **D: carrito + producto en el chat**).

## 0. La TARJETA DE PRODUCTO EN EL CHAT (2ª parte)

Lo que pide la especificación: un **mensaje de producto** en el chat — no un enlace (que te saca
del contexto) sino una **tarjeta embebida** con imagen, nombre, precio y botón de compra.

| Pieza | Cómo queda |
|---|---|
| Tipo de mensaje | Nuevo `kind='product'` en `CHAT_KINDS`, con `payload.productId` |
| Datos de la tarjeta | Los resuelve el servidor **al leer** (JOIN con `products`), así el precio que se ve es el de **hoy**: si el comerciante lo cambia, la tarjeta no miente. Si el producto ya no está a la venta se dice («Ya no está a la venta») en vez de ofrecer comprarlo |
| Enviar | Botón «+» del chat → **«Producto»** → selector con **mis** productos activos → se manda la tarjeta |
| Pintar | Tarjeta con foto, nombre, precio (o «Precio a consultar») y **«Comprar»**, que lleva a la ficha, donde está la compra real |
| Permisos | Si el grupo no permite ese tipo, el servidor lo rechaza (`KIND_NOT_ALLOWED`, 403). Se añadió «Tarjetas de tienda» a los tipos que el dueño puede permitir en su grupo |
| Verificado (API) | Enviar → 201 · al leer, `productRef` con nombre, precio, foto y `available:true` · producto inexistente → **404 `PRODUCT_NOT_FOUND`** · grupo que no lo permite → 403 |
| Verificado (teléfono) | El «+» muestra **«Producto»** · el selector lista mis productos («Mandar el producto …») · al tocar uno, **la tarjeta aparece en el chat** con su nombre, su precio y **«Ver y comprar»** (dos tarjetas en el hilo tras la prueba) |

### Tres fallos REALES que encontró esta parte (y se corrigieron)

0. **DOS FALLOS MÁS, encontrados porque el dueño avisó: «no sale la tarjeta, sale un texto».**
   * **REENVIAR una tarjeta mandaba TEXTO.** El menú de reenviar (`forwardTo`) tenía una rama por
     cada tipo (nota, foto, archivo, ubicación, votación…) y **ninguna para producto**, así que
     caía en el `else` final: `send({ text: msg.text })` → al otro lado le llegaba «🛍 Producto …»
     como texto. Corregido: ahora reenvía la tarjeta de verdad (`enviarAlChat`).
   * **Los grupos NUEVOS rechazaban las tarjetas**: la lista por defecto de tipos permitidos
     (`DEFAULT_KINDS`) no incluía `product`, así que el servidor respondía
     *«El administrador del grupo no permite ese tipo de mensaje»*. Era una función **imposible de
     usar** sin entrar a los ajustes del grupo a activarla (y al usuario le parecía que «no
     funciona»). Corregido en el servidor; los grupos que ya existen conservan sus ajustes, pero
     el dueño puede activar **«Tarjetas de tienda»** en la gestión de su grupo.
   * Comprobado después: en un grupo nuevo la tarjeta se manda (201) y **se ve como tarjeta** en
     el teléfono (nombre, precio y «Ver y comprar»); y **el receptor la recibe con todos sus
     datos** (`kind: product` + `productRef`), no como texto.

1. **El mensaje se pintaba como TEXTO**, no como tarjeta: el mapeador de mensajes no copiaba
   `productRef` (se veía «🛍 Producto …» a secas). Faltaba la línea en `toMessage`.
2. **El selector se quedaba cargando para siempre**: la acción abría la hoja pero **no llamaba a
   cargar la lista**; el servidor no recibía ni una petición (comprobado en el registro del proxy).
3. **«Producto no válido» al enviar**: el `sendRich` de `api/lifebook.ts` (que no se puede tocar)
   solo reenvía unos campos fijos y el `productId` se perdía por el camino. Ahora el envío va por
   `productosEnNotaApi.enviarAlChat`, que manda el mismo mensaje con el campo que falta.

### Lo que NO está hecho de esta parte

1. **No hay mini-caja de pago dentro del chat**: «Comprar» lleva a la ficha del producto y desde
   ahí a la caja de siempre. La especificación pide un mini-checkout en el propio chat
   (cantidad, variante, dirección y pago sin salir); eso es trabajo aparte.
2. **No hay aviso social** «X compró este producto»: hacen falta eventos de pedido dentro del
   chat, y hoy el pedido no nace ahí.
3. **La foto de la tarjeta** sale con el icono de repuesto cuando el producto no tiene foto
   válida: los productos de prueba apuntan a `/storage/lb-images/e2e.jpg`, que **no existe en el
   servidor** (404). Es un problema de **datos de prueba**, no del código — y es también la causa
   del bucle de reintentos de esa imagen que se vio antes.

---

## 1. Qué había (medido, y una sorpresa buena)

| Pieza | Estado antes |
|---|---|
| `lifebook.orders` + `lifebook.order_items` | **Ya existían**, y con forma de pedido de **varias líneas**: `shop_id`, `subtotal_xaf`, `total_xaf`, y en las líneas `product_id`, `variant_id`, `quantity`, `unit_price_xaf`, `line_total_xaf` |
| Caja de pago | **Ya existía**: `/lifebook-checkout` (cantidad, entrega y forma de pago) |
| **Carrito** | **No existía nada**: 0 tablas con «cart» en el nombre |
| Botones de la ficha | Solo **uno** («Comprar»/«Reservar» → la caja de un producto). La especificación pide **dos**: «Añadir al carrito» y «Comprar ahora» |

O sea: no había que inventar ni pedidos ni cobro, **solo el carrito**.

## 2. Lo que se hizo

### Servidor

* **DDL**: `lifebook.cart_items (user_id, product_id, variant_id, quantity)` con
  `CHECK (quantity 1..99)` y un **índice único con `COALESCE(variant_id, …)`** — sin eso, el
  mismo producto sin variante se podría añadir mil veces, porque en SQL los `NULL` no chocan
  entre sí.
* **Cinco rutas**: `GET my/cart`, `POST my/cart`, `PATCH my/cart/:productId`,
  `DELETE my/cart/:productId`, `DELETE my/cart` (vaciar).
* Reglas: solo productos **activos** y **no míos** (`CANNOT_BUY_OWN`: comprarse a uno mismo no
  es una compra y descuadraría las ventas); un producto **retirado no se cuenta ni en el total**;
  los productos «a consultar» (sin precio) **no se suman** y la respuesta lo avisa con
  `hasOnRequest`, en vez de contar 0 y dar un total falso.
* Los totales los calcula el **servidor** (la app no suma: se equivocaría).

### App

| Fichero | Qué se añadió |
|---|---|
| `api/lifebookCarrito.ts` (**nuevo**) | `ver`, `anadir`, `cantidad`, `quitar`, `vaciar` |
| `app/lifebook-product/[id].tsx` | **«Añadir al carrito»** en la zona del precio (antes era un «+ Carrito» en la barra de abajo, retirado el 14/09/2026 a petición del dueño: la barra ya tiene el icono del carrito con globito), y un **icono de carrito con globito** del número de cosas que llevas |
| `app/lifebook-carrito.tsx` (**nuevo**) | Las líneas con su **tienda**, la **variante** elegida, el precio, los controles de cantidad, quitar línea, vaciar, el **TOTAL** y «Seguir comprando»; cada línea tiene su «Comprar» que entra en la caja que ya existía |

## 3. Verificación

**API** (contra el servidor real): añadir 2 unidades → 1 línea, 2 uds, total **20.000 XAF** ·
añadir otro producto → 2 líneas, total **30.000 XAF** (cuadra) · cambiar cantidad a 5 → **60.000** ·
quitar una línea → 1 línea, **50.000** · **añadir un producto propio → 400 `CANNOT_BUY_OWN`** ·
vaciar → 0.

**Teléfono (Poco F5)**, leído de la pantalla:

| Qué | Lo que se leyó |
|---|---|
| Botones de la ficha | «Mi carrito» (icono) · **«Añadir al carrito»** (+ Carrito) · **«Comprar»** |
| Al añadir | Alerta «**Añadido al carrito** — «Producto pedidos 224163567» ya está en tu carrito.» |
| Carrito | «**Mi carrito (1)**» · «**Hotel Demo Malabo**» · producto · **«Talla 42»** · **12.000 XAF** — la **variante** viajó desde la ficha, con su precio (no el base de 10.000) |
| Cantidades | «Quitar una unidad» · «1» · «Añadir una unidad» · «Quitar …» · «Comprar» por línea |
| Pie | «**TOTAL (1 uds) 12.000 XAF**» |
| Persistencia | Cerrar y abrir la app: **el carrito sigue ahí** |

## 4. Dos fallos MÍOS que encontró esta verificación (y se corrigieron)

1. **El total no se veía**: el pie era una fila (total + botón) y el botón se comía el total —
   en pantalla no aparecía ni el número ni el aviso de «a consultar». Ahora va en columna.
2. **Escribí `**asteriscos**` de markdown** en un texto que React Native no interpreta: salían
   los asteriscos tal cual. Quitados.

## 5. Lo que NO está hecho (dicho claro)

1. **La tarjeta de producto DENTRO del chat** (la otra mitad de esta tanda): hoy el chat tiene
   tarjeta embebida de **publicación/venta** (`postRef`), no de **producto**, y no hay «comprar»
   dentro del chat ni el aviso social «X compró esto». Es lo siguiente.
2. **Comprar todo el carrito de una vez no se puede**: la caja existente trabaja con **un
   producto** (productId + variante + cantidad), así que se compra **línea a línea**. El esquema
   de pedidos ya soporta varias líneas, así que falta hacerlo en el servidor (un pago conjunto),
   no rehacer nada. La app lo dice en pantalla para no engañar.
3. **No se ha tocado el pago**: el carrito deja el pedido listo y la caja sigue siendo la de
   siempre. Meter mano al cobro sin poder probarlo con dinero real es lo último que hay que hacer
   a lo loco.

## 6. Mapa de ficheros

| Cosa | Sitio |
|---|---|
| DDL (servidor) | `/opt/mirror/app/sql/lifebook/20260214_carrito.sql` |
| Carrito (servicio) | `/opt/mirror/app/src/lifebook/commerce.service.ts` (`myCart`, `addToCart`, `setCartQuantity`, `removeFromCart`, `clearCart`) |
| Rutas | `/opt/mirror/app/src/lifebook/commerce.controller.ts` (`my/cart…`) |
| API de la app | `D:\egapp\api\lifebookCarrito.ts` |
| Botones de la ficha | `D:\egapp\app\lifebook-product\[id].tsx` |
| Pantalla del carrito | `D:\egapp\app\lifebook-carrito.tsx` |
| Copias de seguridad | `commerce.service.ts.bak-tanda-d-carrito-20260214`, `commerce.controller.ts.bak-…` |
