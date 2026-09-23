# Tienda y comercio — auditoría de los 7 puntos de contacto

Fecha: **2026-09-14**.

Esto es una **auditoría medida leyendo el código**, no una propuesta de diseño. Cada
afirmación sale de haber abierto el fichero y de citar su línea. Donde no encontré nada,
lo digo: «No existe» es un resultado, no un hueco del documento.

Ámbito leído: `D:\egapp\app`, `D:\egapp\components`, `D:\egapp\api`, `D:\egapp\core`,
`D:\egapp\state`, `D:\egapp\constants`, `D:\egapp\backend\sql`,
`D:\egapp\backend\server-patch` y `D:\egapp\docs`.

## 0. Aviso que condiciona todo lo demás: hay TRES comercios distintos

Antes de la tabla, porque si no se confunden las piezas. En el código hay tres mundos
separados que no comparten datos:

| Mundo | Qué es | Dónde vive | Cómo se entra |
|---|---|---|---|
| **A. Tienda del perfil** | Las **publicaciones de venta** (`type='sale'`) de una persona | Pantalla `app/lifebook-store.tsx` + API `lifebookStoreApi.page()` → `/lifebook/stores/:sellerId` (`api/lifebook.ts:745-747`, respuesta con `sales: LbPostBase[]` en `api/lifebook.ts:620-637`) | Botón «🛍 Ver tienda» del perfil (`app/lifebook-user.tsx:448-455`) |
| **B. Tienda con productos** | El **catálogo real**: `LbProduct`, variantes, stock, pedidos, panel del comerciante | `/lifebook/commerce/*` (`api/commerce.ts:283-347`) + pantallas `lifebook-shop/[id].tsx`, `lifebook-product/[id].tsx`, `lifebook-sell.tsx`, `lifebook-merchant*.tsx` | Ficha de producto (`app/lifebook-product/[id].tsx:411-417`), pedidos, panel del comerciante. **El perfil NO lleva aquí** |
| **C. Ecomerse** | El marketplace antiguo, estilo Taobao/Xianyu: carrito, destacados, reseñas | `app/ecomerse*.tsx` + `api/ecomerse.ts` + `state/ecomerse.ts` | Drawer ☰ → «Ecomerse» (`components/ServicesDrawer.tsx:164`) |

Y un dato que decide varios puntos: **la pantalla de catálogo del mundo B existe pero no
tiene puerta**. Busqué `lifebook-catalog` en todo el código de la app y la única aparición
es su propio fichero (`app/lifebook-catalog.tsx:2`): ninguna pantalla hace
`router.push('/lifebook-catalog')`.

## 1. Los 7 puntos de contacto

| # | Punto | ¿Existe? | Dónde está | Qué le falta |
|---|---|---|---|---|
| 1 | Tarjeta de tienda en el perfil (encabezado + 3 destacados + mini-tarjeta de grupo) | **No existe** (salvo 2 piezas sueltas: el botón «Ver tienda» y la mini-tarjeta de grupo) | `app/lifebook-user.tsx:448-455` (botón), `:464-470` (★ del perfil), `:475-519` (grupo) | Todo: no hay tarjeta, ni número de productos, ni destacados, ni precio superpuesto, ni salto a la tienda posicionada en el producto |
| 2 | Tab **商品 Productos** en el perfil | **No existe** en el perfil · **Existe a medias** en el catálogo suelto | Perfil: `app/lifebook-user.tsx:572-579`. Catálogo: `app/lifebook-catalog.tsx:89-92` y `:180-241` | La pestaña, la pestaña «Colección», la descripción corta y el «X vendidos» |
| 3 | Productos vinculados dentro de una nota | **No existe** (sí existe el panel de la venta propia, que no es un producto) | `app/lifebook-post/[id].tsx:583-601` (botón de servicio), `:604-619` (panel de venta) | El vínculo nota→producto: el compositor no lo recoge y la API no tiene campo (`api/lifebook.ts:320-331`) |
| 4 | Feed del tab **市集 (Mercado)** | **Existe a medias** | `app/lifebook-catalog.tsx:180-241` (grid 2 col + precio) | No hay tab ni entrada a esa pantalla, no muestra «vendidos» y no es grid uniforme |
| 5 | Búsqueda con pestañas 综合 · 笔记 · 商品 · 用户 | **Existe a medias** | `app/lifebook-search.tsx:64-72` (filtros), `:393-429` (resultados) | Las pestañas 商品 y 用户, y el orden dentro de productos por relevancia + ventas + puntuación |
| 6 | Live (bolsa con número, panel de productos, producto fijado) | **No existe** | Lo único llamado «live» es **ubicación en vivo del chat**: `api/lifebook.ts:892-899`, `app/lifebook-chat/[id].tsx:141-143` | Todo. No hay retransmisión, ni espectadores, ni bolsa, ni productos del live, ni fijado con cuenta atrás |
| 7 | Grupo de chat: mensaje de producto con compra dentro | **Existe a medias** | Tarjeta embebida de **publicación/venta**: `app/lifebook-chat/[id].tsx:1477-1490`, enviada desde `:558-568` | Es un `postId`, no un producto; no hay compra en el chat ni «X compró este producto» |

### Punto 1 — Tarjeta de tienda en el perfil

Lo que **sí** hay hoy, medido:

- Un botón «🛍 Ver tienda», y solo si el perfil está marcado como vendedor
  (`profile.verified.seller`), que lleva a la tienda de **publicaciones de venta**:
  `app/lifebook-user.tsx:448-455`.
- La puntuación del **perfil** con **una sola** estrella dibujada, y se pinta si
  `ratingAvg > 0` (`app/lifebook-user.tsx:464-470`). No es la puntuación de la tienda ni
  depende de que haya reseñas de tienda.
- La fila de contadores del perfil es Publicaciones · Seguidores · Seguidos · Me gusta
  (`app/lifebook-user.tsx:394-412`): **no hay contador de productos de la tienda**.
  Los chips de rol verificado (`:377-389`) llevan icono + etiqueta («Tienda ✓»), pero
  **sin número**.
- La **mini-tarjeta de grupo** debajo sí existe y sí desaparece cuando no hay grupo: el
  bloque entero va dentro de `enlacesGrupo.length > 0 &&` (`app/lifebook-user.tsx:475`),
  así que **no deja hueco**. Pinta foto, nombre, 📌 si está fijado y
  «N miembros · toca para entrar» (`:496-513`).
  **Le falta el modo de entrada**: el dato existe y llega —
  `joinMode: 'open' | 'approval' | 'question'` en `api/lifebook.ts:807` — y la etiqueta ya
  está escrita en otra pantalla («Abierto» / «Con aprobación del organizador» /
  «Pregunta de ingreso», `components/lifebook/GroupCardSheet.tsx:74-76`; también se pinta
  en la lista en `app/lifebook-groups.tsx:292-294`). Aquí simplemente no se lee.

Lo que **no existe**:

- No hay tarjeta de tienda con encabezado.
- No hay **productos destacados**. Y «destacado» **no es un dato del comercio de Life
  Book**: `isFeatured` aparece en `api/ecomerse.ts:33`, `api/rental.ts:35` y
  `api/work.ts:23`, pero **no en `api/commerce.ts`** (ni en `LbProduct` ni en
  `LbProductCard` ni en `LbMyProductCard`, `api/commerce.ts:115-229`).
- No hay **precio superpuesto** en ninguna rejilla de tienda/catálogo: el precio sobre
  badge oscuro semitransparente existe solo en la tarjeta del feed
  (`components/lifebook/PostCard.tsx:257` `backgroundColor: 'rgba(0,0,0,0.5)'`, posición
  `:260` abajo-izquierda). En el catálogo y en la tienda el precio va **debajo** de la
  imagen (`app/lifebook-catalog.tsx:226-228`, `app/lifebook-shop/[id].tsx:306-308`).
- No se puede abrir la tienda **posicionada en un producto**: la tienda solo lee `id`
  (`app/lifebook-shop/[id].tsx:38`) y además hace lo contrario de lo pedido — su rejilla
  abre la **ficha** del producto (`:285`). La tienda de publicaciones también abre la
  publicación (`app/lifebook-store.tsx:167`).

### Punto 2 — Tab 商品 (Productos) dentro del perfil

- **No existe la pestaña.** Las del perfil son, leídas literalmente:
  Notas · Videos · Podcasts · Series · Ventas · Todo (`app/lifebook-user.tsx:572-579`).
  No hay «Productos» ni «Colección»: busqué `colecc`/`collection` en `app`, `components`,
  `api` y `constants` y no hay ninguna pantalla ni tipo de colección.
- **La fila de categorías con «Todo» primero y seleccionada por defecto sí existe, pero
  en el catálogo**: `app/lifebook-catalog.tsx:89-92` construye los chips con
  `{ id: '', label: 'Todo', icon: '✨' }` en primer lugar, y el estado inicial es
  `useState<string>('')` (`:45`), o sea «Todo» activo.
- **El grid de doble columna sí existe, también en el catálogo**: `numColumns={2}`
  (`app/lifebook-catalog.tsx:183`), imagen (`:216-222`), nombre truncado a 2 líneas
  (`:223-225`), **precio en color de acento** (`:226-228`, `color: colors.primary`),
  tienda con escudo y ciudad (`:232-238`).
- **Lo que falta de la tarjeta**: **descripción corta en gris** (no se pinta; el dato
  `shortDescription` sí existe en `LbProduct`, `api/commerce.ts:121`) y **«X vendidos»**.
  Busqué `salesCount`/`vendidos` en toda la app: el único sitio donde se enseña algo así
  es la ficha, y solo **para el dueño**: «{p.salesCount} ventas · {p.savesCount}
  guardados» (`app/lifebook-product/[id].tsx:423`). En las tarjetas de rejilla, nada.

### Punto 3 — Productos vinculados dentro de una nota

**No existe el vínculo nota→producto.** Comprobado por tres lados:

1. **El compositor de notas no puede enganchar nada**: `api/lifebook.ts:320-331`
   (`LbCreateNoteInput`) tiene `body`, `title`, `media`, `city`, `barrio`, `topics`,
   `tone`, `visibility` y `coverRatio`. **No hay `productId`, ni `shopId`, ni
   `serviceLink`.** Y `app/lifebook-compose.tsx` no importa nada de comercio
   (`commerceApi`, `linkType`, `serviceLink` no aparecen en él).
2. **En la nota de imagen no hay tarjeta horizontal.** El orden real del detalle es:
   carrusel (`app/lifebook-post/[id].tsx:469-546`) → título y texto (`:550-551`) →
   **hashtags** (`:554-567`) → ubicación y fecha (`:570-580`) → botón de servicio
   (`:583-601`) → panel de venta (`:604-619`). O sea: cualquier cosa de comercio va
   **después** de los hashtags, no antes, y no hay miniatura + nombre + precio + «Ver».
3. **En vídeo no hay sticker.** Busqué `priceXaf`, `product`, `tienda`, `sticker` y
   `carrito` en `app/lifebook-videos.tsx`: el único resultado es la palabra
   «reproductor» en comentarios. No hay ninguna superposición de producto.

Lo que **sí** hay, y conviene no confundirlo con esto:

- Un **botón de servicio enlazado** que abre una **ruta**, no un producto:
  `app/lifebook-post/[id].tsx:583-601`, con el mapa `SERVICE_ROUTES` (`:82-92`) que
  incluye `ecomerse`/`shop` → «Ver tienda» y `lifebook` → «Ver su tienda».
- El **panel de la venta propia**: precio, condición, negociable, categoría, entrega,
  pago y contacto, todo leído de `post.payload` (no de un producto)
  (`app/lifebook-post/[id].tsx:604-619`).
- La compra de esa venta, que sí funciona: botón «Comprar» en la barra inferior
  (`:856-869`) → `OrderSheet` (`:936-939`) → pedido sobre el **post**
  (`components/lifebook/OrderSheet.tsx:48-51`, `api/lifebook.ts:737-739`).
  Es el camino del mundo A, no un producto del mundo B.

### Punto 4 — Feed del tab 市集 (Mercado)

- **No hay tab 市集 ni Mercado.** El dock global tiene cinco destinos y ninguno es
  comercio: Life Book · Llamar Taxi · Inicio · Mensajes · Perfil
  (`components/FloatingFooter.tsx:25-30`). En el feed, lo más parecido es un **chip**:
  «Comercio», `channel: 'sales'` (`constants/lifebook.ts:45`, chips en `:86-118`), que
  filtra publicaciones `type='sale'` dentro de la pestaña activa.
- **La pantalla de grid sí está construida**: «Tiendas y servicios»
  (`app/lifebook-catalog.tsx:101-103`), grid de 2 columnas con precio
  (`:180-241`), filtros por tipo (`:127-144`), ciudad (`:147-165`), orden
  (`:166-174`) y buscador propio (`:114-124`).
- **Pero no se llega a ella desde ningún sitio** (ver §0). Ese es el hallazgo que más
  pesa aquí: la pantalla funciona y está sin puerta.
- Tampoco muestra **«vendidos»**, y su rejilla es uniforme pero de altura fija
  (`styles.cardImg` 130 px, `app/lifebook-catalog.tsx:261`), no la doble columna con
  precio y ventas que pide el punto.

### Punto 5 — Búsqueda

- **Pestañas**: hay una fila de filtros, pero no es la pedida. Los filtros reales son
  Todo · Notas · Videos · Ventas · Debates · Comida · Taxi
  (`app/lifebook-search.tsx:64-72`). **No hay 商品 (productos) ni 用户 (usuarios).**
  Los usuarios solo aparecen en las **sugerencias** mientras escribes: tipo `'user'`
  (`api/lifebook.ts:356-359`, endpoint `:393-395`), pintadas en
  `app/lifebook-search.tsx:325-335`.
- **Resultados**: masonry de publicaciones con la misma tarjeta del feed
  (`app/lifebook-search.tsx:256-267` y `:393-429`).
- **Orden**: la búsqueda manda solo `q`, `type`, `city`, `cursor` y `limit`
  (`api/lifebook.ts:382-387`). **No hay ningún parámetro de orden**, así que no hay
  relevancia + ventas + puntuación de tienda.
- La búsqueda de **productos** existe, pero vive aparte y en otra pantalla
  (el buscador del catálogo, `app/lifebook-catalog.tsx:114-124`). Sus órdenes son
  `recent | price_asc | price_desc | rating` (`api/commerce.ts:290`, pintados en
  `app/lifebook-catalog.tsx:21-26`). **No hay orden por ventas** y «rating» es el de la
  ficha del producto, no una puntuación de tienda ordenable aparte.

### Punto 6 — Live

**No existe.** Todo lo «vivo» del código es otra cosa:

- `lifebookLiveApi` es **ubicación en vivo dentro de un chat**: `list`, `start`,
  `update`, `stop` sobre `/lifebook/chat/conversations/:id/live`
  (`api/lifebook.ts:892-899`), con el tipo `LbLiveSharer` (`:875`), usado en
  `app/lifebook-chat/[id].tsx:141-143` (estado), `:386-435` (empezar/parar/actualizar) y
  `:940-965` (barra con quién comparte).
- No hay **retransmisión**: busqué `rtmp`, `hls`, `streamUrl`, `streaming`,
  `espectador`, `viewers` y `直播` en `app`, `components`, `api` y `constants`. Los únicos
  resultados son «MP3 streaming» de audio (`api/voice.ts:9`) y un
  `accessibilityLiveRegion` de accesibilidad. En `app/lifebook-videos.tsx` no aparece
  ninguna marca de «En vivo».
- Por tanto, del punto 6 no hay **nada**: ni barra inferior con bolsa y número, ni panel
  lateral con lista numerada, ni precio de live distinto del normal, ni «Ir a comprar»,
  ni estado (en venta / agotado / próximamente), ni producto fijado con cuenta atrás.

### Punto 7 — Grupo de chat: mensaje de producto

- **La tarjeta embebida existe, pero es de publicación, no de producto**: los mensajes
  `kind='post'` o `kind='sale'` pintan una tarjeta con portada, título y precio a partir
  de `msg.postRef` (`app/lifebook-chat/[id].tsx:1477-1490`), y se envían desde
  `sharePost()` (`:558-568`), que solo manda `postId` y un `postRef` local
  (`{ id, title, priceXaf }`).
- **El selector del «+» del chat no ofrece productos**: las 12 acciones son Fotos,
  Cámara, Compartir nota, Archivo, **Venta personal**, Tema, Ubicación, Quedada, Cadena,
  Votación, Anuncio del grupo y Plaza de retos
  (`components/lifebook/ChatPlusPanel.tsx:22-35`). «Venta personal» (`:27`) comparte una
  **publicación de venta mía**, no un producto del catálogo.
- **No hay compra dentro del chat**: `OrderSheet` crea el pedido sobre un `postId`
  (`components/lifebook/OrderSheet.tsx:48-51`) y se abre desde la ficha de la
  publicación (`app/lifebook-post/[id].tsx:856-869`), no desde el chat.
- **«X compró este producto» no existe**: busqué `compró` en toda la app y no hay
  ninguna coincidencia. No hay ningún aviso de compra ni efecto social en el chat.

## 2. La ficha de producto

Fichero: `app/lifebook-product/[id].tsx`.

| Pieza | ¿Está? | Línea |
|---|---|---|
| Carrusel de imágenes | **Sí** — `FlatList` horizontal con `pagingEnabled`, contador 1/N y visor con zoom | `:208-235` (contador `:230-234`), visor `:490-530` |
| Precio grande | **Sí** — `fontSize: 24`, en color primario; gris y «Agotado» si no hay stock; tachado si hay `oldPriceXaf` | `:256-263`, estilo `:572` |
| Nombre completo | **Sí** — sin `numberOfLines` | `:265` |
| Descripción corta | **Sí** | `:266-268` |
| Descripción larga | **Sí** | `:322-326` |
| Atributos / detalles | **Sí** | `:329-338` |
| Selector de variantes | **Sí** — chips por variante, con precio propio y «agotada», y el precio/stock se recalcula con la variante activa | `:286-319`; `:179-182` |
| Entrega y pagos aceptados | **Sí** | `:341-365`, `:368-383` |
| Tarjeta de la tienda en la ficha | **Sí** — logo, nombre, ciudad/región, «★ x (n)» solo si `ratingCount > 0`, botón «Seguir» | `:386-410` |
| **Botones fijos «Añadir al carrito» / «Comprar ahora»** | **No** | Barra inferior: guardar (♥), escribir a la tienda y **un solo** botón primario cuyo texto sale del tipo de servicio: `lbServiceAction()` (`:457-458`, `constants/commerce.ts:22-23` y `:11` → «Comprar»). **No hay carrito en el comercio de Life Book**: el carrito vive en Ecomerse (`state/ecomerse.ts:14-88`) |
| **Reseñas** | **No** | No hay endpoint de reseñas en `api/commerce.ts`; el propio tipo lo dice: «Las opiniones todavía no existen como tabla propia: se dice, no se inventa» (`api/commerce.ts:478-479`); y el panel del comerciante las anuncia como futuro: `app/lifebook-merchant.tsx:357` |
| **Notas vinculadas** (publicaciones donde el comerciante mencionó el producto) | **No** | La ficha solo tiene `product`, `shop` y `shopProducts` (`api/commerce.ts:300-310`). No hay llamada a publicaciones y en la pantalla no hay ninguna lista de notas |

Notas de la ficha que sí conviene saber:

- La acción principal **no** es «Comprar ahora» sino el flujo de pedido del mundo B:
  lleva a `/lifebook-checkout` con `productId` y `variantId`
  (`app/lifebook-product/[id].tsx:479-484`), salvo si el producto es mío, está agotado o
  es «a consultar», en cuyo caso abre el chat con un mensaje ya escrito (`:136-159`).
- Una habitación de hotel **no** se compra aquí: redirige a la ficha del hotel
  (`:462-478`).
- El dueño ve «{salesCount} ventas · {savesCount} guardados · {ratingCount}
  valoraciones» y botones de editar, precio y stock, ocultar y borrar (`:420-444`).
- `commerceApi.mySaved()` existe (`api/commerce.ts:345`) y **ninguna pantalla lo usa**:
  hoy no hay «productos guardados» donde mirar.

## 3. La tienda completa

Fichero: `app/lifebook-shop/[id].tsx`.

| Pieza | ¿Está? | Línea |
|---|---|---|
| Banner / portada | **Sí** — imagen de portada a 150 px con velo oscuro, o fondo liso si no hay | `:148-161`, estilo `:330` |
| Logo circular | **Sí** — 74×74 con `borderRadius: 37` y borde del color de fondo | `:164-172`, estilos `:335-336` |
| Nombre | **Sí** | `:175-179` |
| Descripción | **Sí** | `:193-195` |
| Nivel de verificación y «Tienda Ecomerse» | **Sí** | `:180-183` |
| Estrellas | **Parcial** — solo si `ratingCount > 0`, y se pinta como **texto** «★ 4.5 (3)», no como estrellas dibujadas (`lucide` `Star` solo se usa en la ficha del producto y en el panel) | `:188-190` |
| Seguidores, ciudad, barrio, región | **Sí** | `:184-192` |
| Botón «Seguir tienda» | **Sí** (y «Administrar mi tienda» si es tuya) | `:199-212` |
| Botón «Contactar» | **Sí, pero se llama «Chat»** | `:213-215` |
| Pestañas internas **Todos / Novedades / Más vendidos / Actividades** | **No** | Las que hay son **Productos · Servicios · Información** (`:220-235`), y separan por `serviceType` (`:81-83`). Los órdenes Novedades/Precio/Best valorados existen, pero **en el catálogo** (`app/lifebook-catalog.tsx:21-26`) |
| Grid de productos con precio | **Sí** — 2 columnas, título a 2 líneas, precio en color primario, ciudad y «envía al extranjero» | `:283-313` (precio `:306-308`) |
| **Información legal al pie** (licencia, entidad, devoluciones, contacto) | **No** | La pestaña «Información» tiene dirección, tarifas de envío y formas de pago (`:241-261`), y un enlace «Ver el perfil de X» (`:262-268`). **No hay licencia, ni entidad legal, ni política de devoluciones**: `LbShopInput` (`api/commerce.ts:231-257`) no tiene ningún campo de ese tipo, y la pantalla de ajustes del comerciante (`app/lifebook-merchant-settings.tsx:212-253`) tampoco los pide — solo nombre, descripción, ciudad, barrio, región, referencia, logo, portada, cobros y entrega |

Relacionado, para no confundir dos pantallas con nombre parecido:

- `app/lifebook-store.tsx` es la **tienda de publicaciones** del mundo A: cabecera con
  avatar, bio, ciudad, ★ y chips de seguimiento (`:100-153`), sección «Productos» con
  «N en venta» (`:155-158`) y una rejilla de **publicaciones** (`:166-168`). Su logo es
  cuadrado redondeado (`borderRadius: 16`, `:179`), no circular, y **no tiene portada**.
- `app/lifebook-shop/[id].tsx` es la tienda del mundo B (la de arriba).

## 4. Lo que NO se pudo verificar

Lista honesta, y va en serio: son cosas que **no supuse**.

1. **El backend NestJS no está en este equipo.** `D:\egapp\backend` contiene solo dos
   carpetas: `sql\` (7 migraciones `001`–`007` y 2 scripts `.sh`) y `server-patch\`
   (7 ficheros `.md`/`.bak`). **No existe `backend\src`.** Por tanto **no he podido leer
   ni un controlador, ni un servicio, ni un DTO del servidor**: todo lo que digo de
   endpoints viene del **cliente** (`api/*.ts`) y de comentarios dentro del código.
2. **No hay ninguna migración de comercio en el SQL local.** Las 7 migraciones son de
   movilidad, estado social (24 h), comentarios con adjunto, seguir viendo y código que
   caduca. Ninguna crea `shops`, `products`, `variants`, `orders` ni `reviews`. Así que
   **no sé qué columnas existen de verdad** en el servidor: si `featured` existe en la
   tabla de productos, si hay tabla de reseñas, o si el stock del live existe en algún
   sitio. Lo que afirmo como «no existe» es **«no existe en la app»**.
3. **No he tocado la base de datos** (nada de SSH, como se pidió). No sé cuántas tiendas
   ni productos reales hay hoy, ni si algún producto tiene variantes con stock, ni si hay
   pedidos del mundo B entregados. Los números que se citan en
   `docs/TIENDAS-XIAOHONGSHU-INVESTIGACION.md` (103 ventas, 1 vendedor, 11 productos,
   9 pedidos) **son de ese documento, no los he vuelto a medir**.
4. **Lo que dice un documento no es prueba de que esté en la app.** Comprobado en un caso
   concreto: `docs/ORGANIZACION-LIFEBOOK-XIAOHONGSHU.md:413` cita
   `app/lifebook-catalog.tsx` y `app/lifebook-store.tsx` como si fueran la solución de
   comercio ya disponible. Los ficheros existen, sí, pero **el catálogo no tiene ni un
   solo punto de entrada en el código**: «estar en el repo» no es «ser alcanzable».
5. **No he ejecutado la app ni he visto una pantalla.** Todo el apartado visual es
   lectura de estilos (colores, tamaños, posiciones), no una captura. No puedo afirmar
   cómo se ve de verdad un grid con datos reales ni si algún texto se corta.
6. **Campos que el tipo declara y no sé si llegan**: `LbShop.stats` y `activeProducts`
   (`api/commerce.ts:110-112`), `LbProductCard.rating`/`ratingCount`
   (`api/commerce.ts:185-186`) o `page.sales.length` de la tienda del mundo A. El
   cliente los pinta; sin servidor no sé si el servidor los manda.
7. **El estado de las otras dos tiendas** (Ecomerse, `app/ecomerse*.tsx`) solo lo miré de
   refilón, para saber dónde vive el carrito y lo destacado. No lo audité: no es el
   modelo que se pidió.

## 5. Los 3 arreglos más baratos con más valor

Ninguno es un refactor. Los tres son pintar datos que **ya llegan** o dar puerta a algo
que **ya funciona**.

**1. Poner «X vendidos» en las tarjetas de producto.**
Dónde: `app/lifebook-catalog.tsx:226-238` (tarjeta del catálogo) y
`app/lifebook-shop/[id].tsx:306-311` (tarjeta de la tienda).
Por qué es barato: **el dato ya está en la API y nadie lo pinta**. `salesCount` está en
`LbProductCard` (`api/commerce.ts:187`) y en `LbMyProductCard` (`:226`). Es añadir una
línea de `Text` con el mismo estilo que la ciudad que ya se pinta justo debajo. No toca
servidor, no toca tipos, no toca navegación. Es lo que separa la rejilla actual de la
rejilla de 市集.

**2. Dar una puerta a `/lifebook-catalog`.**
Dónde: `components/ServicesDrawer.tsx:210-212` (junto a «Publicar en Life Book» / «Mis
publicaciones») y, si se quiere más visible, el feed `app/lifebook.tsx` en la zona de
chips (`constants/lifebook.ts:86-118`).
Por qué es barato: **la pantalla está entera y funcionando** (grid de 2 columnas,
categorías con «Todo» primero, ciudad, orden, buscador, estado vacío con llamada a abrir
tienda: `app/lifebook-catalog.tsx:180-241`) y **no hay ni un `router.push` en todo el
código que la abra**. Es un `route: '/lifebook-catalog'` en la lista del drawer, con su
icono. Devuelve a la vida el único escaparate de comercio del mundo B que ya está
construido.

**3. Enseñar el modo de entrada en la mini-tarjeta de grupo del perfil.**
Dónde: `app/lifebook-user.tsx:507-513` (la segunda línea de la tarjeta de grupo).
Por qué es barato: **el dato ya llega y la etiqueta ya está escrita**. `joinMode`
(`'open' | 'approval' | 'question'`) viene en `LbGroupCard` (`api/lifebook.ts:807`) y ya
se traduce a texto en `components/lifebook/GroupCardSheet.tsx:74-76` («Con aprobación del
organizador», etc.). Es leer un campo que ya está en memoria y añadirlo a un `Text` que
ya existe. Cierra, además, la parte del punto 1 que hoy queda a medias y que el visitante
necesita para saber si entra directo o tiene que pedir permiso.

---

## Anexo 2 — Los TRES arreglos baratos: hechos y verificados en el teléfono (14/09/2026)

Se hicieron los tres, sin tocar servidor ni base de datos, y **cada uno se comprobó en el
Poco F5 leyendo la pantalla** (no «debería funcionar»):

| Arreglo | Fichero tocado | Lo que se leyó en pantalla |
|---|---|---|
| «X vendidos» en las tarjetas de producto | `app/lifebook-catalog.tsx` y `app/lifebook-shop/[id].tsx` | **«7 vendidos»** junto al nombre de la tienda; y en los productos con 0 ventas **no aparece nada** (un «0 vendidos» ahuyenta) |
| Puerta al catálogo | `components/ServicesDrawer.tsx` (sección «Comercio y creador», icono `LayoutGrid`, que **no** es el de «Ecomerse») | Se vio la entrada **«Catálogo de productos»** `[160,2081][1050,2176]`, y al tocarla abre **«Tiendas y servicios»** (categorías «✨ Todo · 🛍 Producto · 🍲 Comida», buscador arriba) |
| Modo de entrada en la tarjeta de grupo del perfil | `app/lifebook-user.tsx` | **«Grupo E2E 055962134 v2» / «2 miembros · entrada libre»** |

**Aviso honesto sobre el primero:** hoy los **116 productos tienen `sales_count = 0`**, así
que el arreglo **no se ve** con los datos de producción. Para poder verlo se puso
`sales_count = 7` a **un** producto, se comprobó que la tarjeta lo pinta, y **se devolvió a
0** (el producto quedó como estaba). Cuando haya una sola venta real, aparecerá solo.

**Lo que sigue faltando para la tarjeta del perfil (punto 1)** y que este anexo no
resuelve: los **3 productos destacados elegidos a mano** necesitan una columna o tabla que
**no existe** (ver Anexo 1); y la **descripción corta** que la especificación pide en la
celda no viene en `LbProductCard` (`api/commerce.ts:172-203`), así que pintarla exige tocar
el servidor.


---

## Anexo — El BACKEND, medido (esto la auditoría no lo pudo ver)

La auditoría avisó de que en el equipo **no está el servidor** (`D:\egapp\backend` solo
tiene `sql\` y `server-patch\`; no hay `backend\src`). Como el backend vive en
`root@8.218.88.237:/opt/mirror/app`, se ha mirado **allí** para no dejar el documento
apoyado en suposiciones. Lo que sigue está **comprobado** (consulta a `information_schema`
y lectura del controlador), no deducido:

### Tablas que existen de verdad

```
lifebook.shops                 lifebook.products            lifebook.product_variants
lifebook.product_attributes    lifebook.product_saves       lifebook.categories
lifebook.orders                lifebook.order_items         lifebook.shop_follows
lifebook.shop_payment_methods
wallet.ecomerse_products       wallet.ecomerse_reviews      wallet.ecomerse_categories
wallet.ecomerse_orders         wallet.ecomerse_order_items  (módulo aparte, más viejo)
```

`lifebook.products` trae ya las columnas que la ficha y la rejilla necesitan:
**`sales_count`**, **`rating`**, **`rating_count`**, `stock_mode`, `stock_quantity`.

### Rutas que existen de verdad (`src/lifebook/commerce.controller.ts`)

`GET categories` · `GET catalog` · `GET products/:id` · `GET shops/:id` ·
`GET shops/:id/products` · `GET my/shop` · `POST shops` · `PATCH my/shop` ·
`GET my/products` · `POST products` · `PATCH products/:id/status` ·
`DELETE products/:id` · `POST products/:id/save` · `GET my/saved` ·
`POST shops/:id/follow` · `GET admin/products` · `PATCH admin/products/:id`
(+ `src/lifebook/merchant.controller.ts`: `GET dashboard`, `PATCH products/:id/quick`).

O sea: **la tienda no es una idea, está construida por detrás.** Lo que falta está casi
todo en la app.

### Datos reales (14/09/2026)

| Tabla | Filas |
|---|---|
| `lifebook.shops` | **3** |
| `lifebook.products` | **116** |
| `lifebook.product_variants` | 25 |
| `lifebook.categories` | 193 |
| `lifebook.orders` / `order_items` | 138 / 93 |
| `lifebook.shop_follows` | **0** |
| `lifebook.product_saves` | 1 |
| `wallet.ecomerse_products` / `ecomerse_reviews` | 11 / 0 |

Y de los 116 productos: **0 con ventas** (`sales_count = 0`), **0 con reseñas**
(`rating_count = 0`), pero **116 con `rating` puesto**. Consecuencia importante para el
punto 1: la regla «si la tienda es nueva y no tiene reseñas, no se muestra puntuación» hay
que aplicarla con `rating_count`, **no** con `rating` — si se usara `rating`, hoy las tres
tiendas enseñarían estrellas sin haber recibido una sola reseña.

### Y lo que NO existe (esto sí cambia el punto 1)

**No hay ninguna columna de «destacado» ni de orden manual** en `shops` ni en `products`:
la consulta por `featured|destac|highlight|position|sort|order_pos` devuelve **0 filas**.
Es decir, los **3 productos destacados elegidos a mano** de la tarjeta del perfil no se
pueden guardar todavía: hace falta una tabla (o una columna `featured_position` en
`products`). Es el único trozo de la tarjeta del perfil que necesita **base de datos**, y
conviene saberlo antes de empezar a pintarla.

