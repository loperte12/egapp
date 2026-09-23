# Tanda A — La tarjeta de tienda en el perfil

> Estado: **hecha y verificada** (servidor 22/22 + teléfono). Fecha: 14/09/2026.
> Es la primera de las tres tandas aprobadas por el dueño (A: tarjeta de tienda · B: tab
> «Productos» del perfil · C: productos dentro de las notas), más una cuarta pendiente que
> el dueño añadió después (D: carrito y tarjeta de producto dentro del chat).
> Especificación de partida: la del perfil de Xiaohongshu, punto 1.

## 1. Qué se pidió y qué había (medido)

| Pieza pedida | Antes de esta tanda |
|---|---|
| Nombre **comercial** de la tienda en el perfil | No existía: el perfil solo sabía «es vendedor» (`verified.seller`) |
| Puntuación con estrellas **solo si hay reseñas** | No existía en el perfil |
| Hasta **3 productos destacados elegidos a mano** | **Imposible de guardar**: no había columna de destacado ni de orden (`featured|destac|position|sort` → 0 filas) |
| Precio **encima** de la miniatura, sobre badge oscuro | No existía (el catálogo lo pinta debajo) |
| Tocar una miniatura → tienda **posicionada** en ese producto | No existía el parámetro |
| Mini-tarjeta de **grupo** debajo | **Ya estaba** hecha (enlace de grupo del perfil), y no deja hueco si no hay grupo |

Dato que cambió el plan a mejor: `lifebook.products` **ya tenía** `short_description` y
`long_description`. Lo que faltaba no era la columna, era **mandarla**: las cuatro formas de
tarjeta del catálogo no la incluían. Eso es código, no base de datos.

## 2. Lo que se hizo

### Servidor

* **DDL** (`sql/lifebook/20260214_destacados.sql`, copia local `backend/sql/008_destacados.sql`,
  md5 idéntico): `products.featured_position smallint` con
  `CHECK (1..3)` y **índice único** `(shop_id, featured_position)` — no puede haber dos
  «destacado 1». Se eligió columna y no tabla nueva: son 3 puestos y la posición ya dice el orden.
* **`GET /lifebook/commerce/users/:userId/shop-card`** (público, sin sesión): la tarjeta
  completa **en una petición** → `{ shop, featured }`. Devuelve **`shop: null`** si esa
  persona no tiene tienda activa, para que la app no tenga que adivinar.
  Manda `rating` **y `ratingCount`**: quien decide si se pintan estrellas es el contador.
* **`PUT /lifebook/commerce/my/shop/featured`** (solo el dueño; la tienda sale del token,
  nunca del cuerpo): guarda hasta 3 **en orden**, valida que los productos son **suyos y
  activos**, y apaga el resto. Con más de 3 se quedan los tres primeros (mejor que rechazar
  toda la petición y perder lo que sí habían elegido).
* **`shortDescription` y `currency`** añadidos a las **cuatro** formas de tarjeta del catálogo
  (antes solo los mandaba la ficha completa).
* Códigos de error: `PRODUCT_NOT_MINE` → **400** (caía en el 422 por defecto).

### App

| Fichero | Qué hace |
|---|---|
| `api/lifebookTienda.ts` (**nuevo**) | `tarjeta(userId)` y `destacar(ids)`. Vive aparte para no tocar `api/lifebook.ts` |
| `app/lifebook-user.tsx` | La **tarjeta** entre la bio y los botones: logo (o 🏪), nombre comercial, ★ **solo con `ratingCount > 0`**, y fila de hasta 3 miniaturas con el **precio encima** sobre badge oscuro. Sin destacados, la fila no aparece; sin tienda, no hay tarjeta |
| `app/lifebook-shop/[id].tsx` | Acepta `?product=<id>`: cambia a la pestaña donde esté, baja hasta él y lo marca con **«📍 Es el que tocaste»** |
| `app/lifebook-merchant-products.tsx` | Selector del comerciante: **«Destacados en mi perfil 3/3»** con hojas de selección numerada (1, 2, 3) y guardado de una vez |

### Un cambio de orden que la especificación obligaba

La tarjeta va «entre la bio y los botones de seguir/mensaje», pero en este perfil **la bio
estaba DEBAJO de los botones**: ese hueco no existía. Se ha **subido la bio** (bio → tarjeta
→ botones). Es un cambio visible y deliberado, no un efecto secundario.

## 3. Verificación

**Contra la API real** — `pruebas/lb51z-verificar-tarjeta-de-tienda.cjs`: **22 comprobaciones,
0 fallos**. Cubre: la tarjeta es pública · trae el nombre comercial, logo, descripción y
`ratingCount` · los 3 destacados se guardan **en orden** (el 1º se ve primero) · otro usuario
los ve · más de 3 se recortan a los tres primeros · un producto de **otra tienda se rechaza
(400)** y lo ya destacado no se pierde · un usuario **sin tienda** recibe `shop: null` · sin
sesión no se puede cambiar nada (401) · al terminar deja los destacados como estaban.

**En el teléfono (Poco F5)** — textos leídos de la pantalla, no «debería funcionar»:

| Qué | Lo que se leyó |
|---|---|
| Tarjeta en el perfil de A | «**Hotel Demo Malabo**» + 3 miniaturas: «Habitación individual» **18.000 XAF**, «Habitación doble» **28.000 XAF**, «Producto pedidos 224163567» **10.000 XAF** |
| Estrellas sin reseñas | **No se pinta ninguna** (las tres tiendas tienen `ratingCount = 0`) |
| Orden en el perfil | Tarjeta → «Siguiendo / 💬 Mensaje» (la tarjeta va **encima** de los botones) |
| Atajo a un producto | Tras tocar «Habitación individual» (el producto **más antiguo**: 56 más nuevos por delante): pestaña **«Servicios (16)»** y el producto visible con «**📍 Es el que tocaste**» |
| Selector del comerciante | «**Destacados en mi perfil  0/3**», y al abrirlo: «Hasta 3. El número es el ORDEN…» con las filas «Destacar…» |

## 4. Tres fallos REALES que encontró esta verificación (y se corrigieron)

1. **La tarjeta de enlace de grupo MENTÍA.** Cualquier fallo se pintaba como «Este enlace ya
   no sirve (ha caducado)». Se comprobó contra el API que el enlace estaba **bien** (200) y
   la app lo daba por muerto: era un fallo del cliente. Ahora se distingue por el código del
   error: caducado · ya no existe · **grupo privado (403)** · no se pudo comprobar (red, y
   entonces SÍ se ofrece reintentar tocando). Verificado en pantalla: hoy dice
   «**Grupo privado: hace falta invitación**», que es la verdad (la sesión del teléfono no es
   miembro de ese grupo privado).
2. **El atajo al producto no traía nada** cuando el producto no estaba entre los 30 cargados
   (la tienda tiene 58). La causa de fondo era otra: la ficha viene **envuelta**
   (`{ product: {…} }`) y el código leía `res.shopId` de la raíz — siempre `undefined`. Y la
   ficha trae `media` pero **no `coverUrl`**, así que la miniatura salía vacía: se usa la
   primera foto.
3. **El API de la tienda corta en 30** aunque se pidan más: los productos antiguos no llegan
   en la primera página. Por eso el atajo ahora **pide ese producto concreto** y lo pone a la
   vista en vez de fallar en silencio.

## 5. Lo que NO queda verificado (dicho claro)

1. **El guardado desde el selector del comerciante no se ha probado en el teléfono**: se
   verificó que la hoja abre y lista (0/3), y el guardado está verificado **contra el API**
   (22/22), pero no pulsando «Guardar destacados» en el aparato.
2. **La puntuación con estrellas nunca se ha visto**: las **tres** tiendas tienen
   `ratingCount = 0`, así que lo único comprobable hoy es que **no** se pinta (que es justo lo
   que pide la especificación). El camino «con reseñas» está sin ejercitar por falta de datos.
3. **El orden bio → tarjeta → botones** está en el código, pero el perfil que usé para
   comprobarlo **no tiene bio**: el hueco entre ambas cosas no se ha visto con una bio real.
4. **La sesión del teléfono es «Administrador EG Route Plan»**, no la cuenta A. Descubrirlo
   costó una confusión (un 403 que parecía un enlace roto). Para futuras comprobaciones:
   **mirar quién está logueado antes de comparar**.
5. Las pestañas internas de la tienda (Todos / Novedades / Más vendidos / Actividades) y la
   **información legal** (licencia, entidad, devoluciones) **no** son parte de esta tanda: los
   campos legales ni existen en el modelo.

## 6. Mapa de ficheros

| Cosa | Sitio |
|---|---|
| DDL (servidor / local) | `/opt/mirror/app/sql/lifebook/20260214_destacados.sql` · `backend/sql/008_destacados.sql` |
| Tarjeta + destacados | `/opt/mirror/app/src/lifebook/commerce.service.ts` (`userShopCard`, `setFeatured`) |
| Rutas | `/opt/mirror/app/src/lifebook/commerce.controller.ts` (`users/:userId/shop-card`, `my/shop/featured`) |
| Códigos de error | `/opt/mirror/app/src/http/error.filter.ts` (`PRODUCT_NOT_MINE`) |
| API de la app | `D:\egapp\api\lifebookTienda.ts` |
| Tarjeta en el perfil | `D:\egapp\app\lifebook-user.tsx` |
| Atajo posicionado | `D:\egapp\app\lifebook-shop\[id].tsx` |
| Selector del comerciante | `D:\egapp\app\lifebook-merchant-products.tsx` |
| Prueba | `D:\egapp\pruebas\lb51z-verificar-tarjeta-de-tienda.cjs` |
| Copias de seguridad | `commerce.service.ts.bak-tanda-a-tienda-20260214`, `commerce.controller.ts.bak-…` |
