# Tanda B — El tab «Productos» del perfil

> Estado: **hecha** (servidor + app desplegada y comprobada en el teléfono). Fecha: 14/09/2026.
> Segunda de las tandas aprobadas (A: tarjeta de tienda — hecha · **B: tab de productos** ·
> C: productos dentro de las notas · D: carrito y tarjeta de producto en el chat).

## 1. Qué pide la especificación y cómo queda

| Lo pedido | Cómo queda |
|---|---|
| Tabs del perfil profesional: **Notas · Productos · Colección** | **Notas · Productos** · Videos · Podcasts · Series · Ventas · **Colección** · Todo. Se CONSERVAN las pestañas que ya existían (Videos, Podcasts, Series, Ventas) porque esta app tiene contenido que Xiaohongshu no tiene: quitarlas escondería publicaciones que hoy se ven. «Productos» va justo detrás de «Notas» y «Colección» **solo en tu propio perfil** (decisión aprobada) |
| **Icono de buscar a la derecha** | Lupa al final de la barra → abre el catálogo (que ya tiene buscador, categorías y orden) |
| **Fila de categorías** con «Todo» primero y seleccionada | Sí, con la cuenta de cada una: «Todo (58) · Habitación doble (1) · Habitación individual (1)». Solo salen las categorías **que esa tienda usa de verdad** (no las 193 de la plataforma: un chip que lleva a una rejilla vacía es una trampa) |
| **Rejilla de doble columna** («el mismo layout waterfall del feed») | La MISMA `FlatList` de dos columnas del perfil: solo cambia de dónde salen los datos y cómo se pinta la celda |
| Celda: imagen · nombre (1-2 líneas) · precio en color de acento · descripción corta gris · «X vendidos» | Sí, en ese orden. **No** se pinta puntuación del producto, ni stock, ni envío (lo pide así la especificación) |
| Tocar un producto → ficha completa | Sí, `/lifebook-product/[id]` (ya existía) |

## 2. Lo que hubo que tocar (muy poco, y por qué)

**Servidor** (`parche25`):

* `shopProducts` **ya usaba** el catálogo, que **ya sabía filtrar por `shopId` y `categoryId`**:
  solo faltaba **reenviarle** la categoría. Dos líneas.
* **Nuevo** `GET /lifebook/commerce/shops/:id/categories`: las categorías que usa esa tienda con
  su cuenta de productos **activos**, y `total`. «Todo» no viaja desde aquí: lo pone la app con
  `total`, porque «Todo» no es una categoría de la base sino la ausencia de filtro.

**App**:

| Fichero | Qué se añadió |
|---|---|
| `api/lifebookTienda.ts` | `categorias(shopId)`, `productos(shopId, {categoryId, cursor, limit})`, `guardados()` |
| `api/commerce.ts` | `LbProductCard` ahora declara `shortDescription` y `currency` (**el servidor ya los mandaba** desde la tanda A; faltaban en el tipo) |
| `app/lifebook-user.tsx` | Pestañas nuevas + lupa, fila de categorías, rejilla de productos/guardados reutilizando la lista, celda `TarjetaProducto`, y «Ver más productos» (la tienda corta en 30 por página) |

**Buena noticia que ahorró trabajo:** la «descripción corta» **ya existía** como columna
(`products.short_description`) y ya se mandaba; no hay que recortar nada en el servidor (la
decisión 5 del plan partía de que no existía). Se pinta con `numberOfLines={1}`, que es lo que
pide la especificación.

## 3. Verificación

| Comprobación | Resultado |
|---|---|
| `shops/:id/categories` | 58 productos activos · 2 categorías usadas, con su cuenta |
| Filtro por categoría (API) | `categoryId` de una categoría con 1 producto → devuelve **1** |
| «Colección» (API) | A tiene **1 guardado**, con `shortDescription` y `currency` en la respuesta |
| **Barra de pestañas (teléfono)** | «Notas» `[87,2182]`, **«Productos»** `[328,2182]`, «Videos» `[667,2182]` y **lupa** `[942,2156][1080,2270]` al final |
| **Fila de categorías (teléfono)** | «Categoría **Todo (58)**», «Categoría Habitación doble (1)», «Categoría Habitación individual (1)» — «Todo» la primera |
| **Tocar una categoría (teléfono)** | El chip queda **seleccionado** (`selected=true` confirmado en el volcado) |
| **Rejilla (teléfono)** | Dos columnas con título y precio («Servicio a consultar 194335816» → «A consultar»; «Producto pedidos 194335816» → «10.000 XAF») |

## 4. Un fallo REAL encontrado al comprobar el filtro (y corregido)

Al probar el filtro por categoría, el producto salía bien pero con **`shortDescription: null`**.
La causa no era el mapeo (que ya estaba puesto en la tanda A) sino que **las consultas no
seleccionaban la columna**: el `SELECT` del catálogo pedía `p.media, p.tags, …` pero **no
`p.short_description`**, así que el mapeo leía `undefined` y lo convertía en `null`.

Pasó desapercibido porque **la única consulta que sí la seleccionaba** era la de la tarjeta de
la tienda del perfil (`userShopCard`) — justo la que se verificó en la tanda A.

Arreglado en `parche26` añadiendo `p.short_description` y `p.currency` a las **cuatro**
consultas de tarjeta (catálogo/productos de tienda, mis publicaciones, mis guardados).
**Comprobado después**: el filtro por «Habitación individual» devuelve
`desc corta = "Habitación en el Hotel Demo Malabo" · moneda = XAF`.

## 5. Lo que NO queda verificado (dicho claro)

1. **Que la rejilla quede con UN solo producto** al filtrar por «Habitación individual» no lo
   llegué a ver en pantalla: el filtro está verificado contra el API (devuelve **1**, con su
   descripción corta) y el chip queda seleccionado en el aparato, pero el volcado de la rejilla
   ya filtrada no lo capture (el automatismo de toques y desplazamientos se me iba de sitio).
2. **La descripción corta dentro de una celda** no se ha visto todavía en pantalla; sí está
   verificada en la respuesta del API (arriba). En el catálogo se comprobó antes el «7 vendidos»
   con un dato de prueba.
3. **«Colección» no se ha abierto en el teléfono** (verificado por API: 1 guardado, sin
   descripción corta escrita en ese producto).
4. **Falta un retoque de comodidad**: al cambiar de categoría, la lista vuelve arriba del todo
   del perfil (hay que bajar otra vez hasta las categorías para elegir otra). Se arregla
   midiendo la altura de la cabecera (`onLayout`) y desplazando a esa posición; queda pendiente.
5. La tanda A sigue pasando después de estos cambios: `lb51z` → **22/22**.

## 5. Mapa de ficheros

| Cosa | Sitio |
|---|---|
| Categorías + reenvío del filtro | `/opt/mirror/app/src/lifebook/commerce.service.ts` (`shopCategories`, `shopProducts`) |
| Ruta nueva | `/opt/mirror/app/src/lifebook/commerce.controller.ts` (`shops/:id/categories`) |
| API de la app | `D:\egapp\api\lifebookTienda.ts` |
| Tipo de la tarjeta | `D:\egapp\api\commerce.ts` (`LbProductCard.shortDescription`) |
| Pantalla | `D:\egapp\app\lifebook-user.tsx` (pestañas, categorías, `TarjetaProducto`) |
| Copias de seguridad | `commerce.service.ts.bak-tanda-b-categorias-20260214`, `commerce.controller.ts.bak-…` |
