# Carrito v2 — agrupado por tienda, con la verdad de cada línea

> Estado: **servidor 51/51** y **verificado en el Poco F5** de punta a punta (compra real pagada
> desde el carrito). Fecha: 14/09/2026.
> `api/lifebook.ts` y `components/FloatingFooter.tsx` siguen sin tocarse.

---

## 1. Lo que pide la especificación y lo que hay

| Lo pedido | Estado |
|---|---|
| **Un carrito global y por cuenta** (no por tienda, ni por grupo, ni por dispositivo) | Ya era así (`lifebook.cart_items` por usuario). Se mantiene |
| **Tres puertas**: el mercado, la ficha y el chat embebido | El **catálogo** («Tiendas y servicios») lleva ahora un **icono de carrito con globito** en la cabecera; en la **ficha** está «Añadir al carrito» (en la zona del precio, por petición expresa del dueño: la barra ya tiene el icono del carrito); el **chat embebido** lo tiene en su hoja de producto |
| **Cabecera** «Carrito» + «Editar» + volver | Hecho (`Carrito (2)` · `Editar`/`Listo`) |
| **Agrupación por tienda** con casilla, logo, nombre, flecha y cupón disponible | Hecho: cada bloque tiene su casilla, el logo, el nombre, «Ver tienda ›» y su pie «N ud · subtotal». **Cupón: no se pinta porque no existe** (ver §5) |
| **Casilla de tres estados** por producto (marcada / vacía / gris) | Hecho, con `accessibilityState` para lectores de pantalla |
| **Miniatura** que abre la ficha | Hecho |
| **Variante en píldora** que se cambia en una hoja, sin salir del carrito | Hecho: la hoja enseña las opciones **con su precio** y marca las **agotadas** |
| **Etiquetas de estado** («Precio del grupo», «Precio de live», «Con cupón», «Agotado», «Precio cambió») | Hecho para las que existen: **«Agotado»**, **«Ya no está a la venta»**, **«Producto eliminado»**, **«Precio cambió»**, **«Solo quedan N»**. Las de grupo/live/cupón se pintan solas en cuanto existan: la línea ya guarda `sourceKind` |
| **Precio en rojo + anterior tachado** | Hecho: el tachado es el precio anterior de la tienda **o el de cuando se añadió** si cambió |
| **Selector de cantidad** (− / número / +) con «−» apagado en 1 y «+» apagado al llegar al stock | Hecho, con el **stock real** (`maxQuantity` de esa variante), no un 99 inventado |
| **Productos no seleccionables**: casilla gris, opacidad reducida, motivo, eliminables a mano y fuera del total | Hecho. **No se borran solos**: la línea sobrevive aunque la tienda borre el producto |
| **Cupón aplicable** entre la lista y el total, con hoja de aplicables/no aplicables | **No**: no hay cupones en la plataforma (no existe la tabla). No se inventa |
| **Barra inferior fija**: «Todo», Total en rojo, «Ahorras X», «Pagar(N)» | Hecho. «Ahorras» solo sale si hay algo que ahorrar de verdad |
| **Modo Editar**: sin Total, con «Mover a favoritos» y «Eliminar» | Hecho, con contador en «Eliminar (N)» y desactivados si no hay nada marcado |
| **Deslizar a la izquierda → Eliminar** | Hecho (`Swipeable`), con el botón rojo detrás |
| **Toque largo → menú contextual** | Hecho: «Mover a favoritos», «Ver el producto», «Eliminar». **«Encontrar similar» NO está**: la plataforma no tiene búsqueda por parecido y no se inventa |
| **Carrito vacío**: ilustración, texto y «Ir al mercado» | Hecho, y además explica que el carrito va con la cuenta |
| **Persistencia honesta**: si el precio cambia se ve el nuevo y el anterior; si la variante se agota, «Agotado»; si la tienda borra el producto, «Producto eliminado» | Hecho y **verificado contra la API real** (incluido el borrado, que antes hacía desaparecer la línea sin avisar) |
| **Relación con el chat**: añadir al carrito es **silencioso**; el aviso «✅ … compró …» solo al comprar | Hecho: `addToCart` no manda ningún mensaje; la tarjeta del pedido se publica al **crear el pedido** (tanda E) |
| **Caja del carrito**: dirección, resumen por tienda, cupón, mensaje al vendedor por tienda, desglose y «Pagar» | Hecho **salvo el cupón**. Cada bloque lleva su **forma de entrega** y su **forma de pago** reales (de la tienda), y su **mensaje para esa tienda** |
| **Un pedido por tienda** | Hecho: lo marcado se agrupa por tienda y se crea **un pedido por tienda**; los productos pagados salen del carrito |
| **«Pago exitoso» + «Ver pedido»** | Hecho |

## 2. Servidor (desplegado y verificado)

* **DDL 012** (`sql/lifebook/20260214_carrito_v2.sql`): `unit_price_xaf` (precio del día que se
  añadió), `title_snapshot`, `media_snapshot`, `source_kind`, `source_id`, `source_label`, y el
  vínculo con el producto pasa de `ON DELETE CASCADE` a **`ON DELETE SET NULL`** (una línea puede
  sobrevivir a su producto).
* **`GET my/cart`** devuelve `groups` (por tienda) con `shop`, `items`, `count`, `subtotalXaf`,
  `problems`, `paymentMethods` y `deliveryModes` + `deliveryCostMode`/`deliveryCostXaf`; y los
  totales `totalXaf`, `totalDisponibleXaf` (lo que de verdad se puede pagar), `problems`,
  `hasOnRequest`.
* **Por línea**: `PATCH my/cart/line/:id` (cantidad y/o variante) y `DELETE my/cart/line/:id`.
  Antes se quitaba **por producto**, y eso se llevaba las dos variantes del mismo producto.
* **En bloque**: `POST my/cart/bulk { remove, toFavorites }` — «mover a favoritos» las guarda en
  `product_saves` y las saca del carrito, en una transacción.
* **`addToCart`** guarda la foto del momento y **de dónde viene** (`sourceKind`, `sourceId`,
  `sourceLabel`). En un re-toque **no pisa** el precio de referencia: el «Precio cambió» se mide
  contra la primera vez que se añadió.

### Verificación: `pruebas/lb55a-verificar-carrito-v2.cjs` → **51 PASA · 0 FALLA**

```
1. UN CARRITO, EN LA CUENTA                       groups, no una lista plana
2. SE AÑADE CON SU FUENTE Y SU FOTO DEL MOMENTO   sourceKind=chat · addedPriceXaf=12000
3. AGRUPADO POR TIENDA                            subtotal del bloque = suma de sus líneas
3-bis. DOS TIENDAS EN EL MISMO CARRITO            2 bloques, cada uno con su pago y su entrega
4. LA CANTIDAD SE CAMBIA POR LÍNEA                subir una no toca la otra; tope 99; stock real
5. CAMBIAR LA VARIANTE SIN IR A LA FICHA          y el precio de referencia se actualiza
6. UN PRODUCTO RETIRADO NO DESAPARECE             no_disponible · «Ya no está a la venta»
7. «MOVER A FAVORITOS» Y QUITAR, EN BLOQUE        queda en guardados y sale del carrito
8. UN PRODUCTO BORRADO SE QUEDA COMO «ELIMINADO»  product_id = NULL y el nombre guardado
9. NADIE VE EL CARRITO DE OTRO                    401 sin sesión
```

## 3. Verificado en el Poco F5 (volcado de pantalla)

| Qué | Lo que se leyó |
|---|---|
| Cabecera | «Carrito (2)» · «Editar» · «Volver» |
| Bloque de tienda | casilla «Seleccionar todo lo de Hotel Demo Malabo» · «Hotel Demo Malabo» · «Ver tienda ›» |
| Línea | casilla «Seleccionar …» · miniatura «Abrir …» · nombre · píldora «Cambiar la opción Talla 42» · **«Solo quedan 1»** · **12.000 XAF** · «− 1 +» · «Quitar … del carrito» |
| Pie del bloque | «2 ud · 24.000 XAF» |
| Barra fija | «Todo» · **«Total: 24.000 XAF»** · «2 unidades marcadas» · **«Pagar(2)»** |
| Modo Editar | cabecera «Listo» y abajo **«Mover a favoritos»** + **«Eliminar (2)»** (el Total desaparece) |
| Hoja de variante | «Opción de «Producto pedidos 222579699»» · «Talla 42 · 12.000 XAF» · «Cerrar» |
| Caja del carrito | «Confirmar pedido» · «Hotel Demo Malabo · 2 ud · 24.000 XAF» · líneas con variante · **«CÓMO LO RECIBES»** («Recoger en tienda», «Taxi o moto») · **«CÓMO PAGAS»** (los 5 métodos de esa tienda) · «MENSAJE PARA ESTA TIENDA» · «Envío: Recoges en la tienda» · «Total de este pedido 24.000 XAF» · «Subtotal 24.000 XAF · Envío 0 XAF» · **«Pagar 24.000 XAF»** |
| Pago | **«Pago exitoso»** · «Tu pedido **LB-260914-0007** ya está con la tienda» · «Ver pedido» · «Seguir comprando» |
| Después | El carrito queda **vacío** y el pedido tiene **2 líneas** (24.000 XAF, recogida en tienda, Billing) |

El pedido de la prueba se **canceló** al terminar (devuelve el stock) y el carrito de prueba quedó
**vacío**: ya no arrastra los dos productos que llevaba de las pruebas anteriores.

## 4. Mapa de ficheros

| Cosa | Sitio |
|---|---|
| DDL | `/opt/mirror/app/sql/lifebook/20260214_carrito_v2.sql` (copia local `backend/sql/012_carrito_v2.sql`) |
| Servidor | `/opt/mirror/app/src/lifebook/commerce.service.ts` (`myCart`, `addToCart`, `setCartLine`, `removeCartLine`, `cartBulk`) · `commerce.controller.ts` (`my/cart/line/:id`, `my/cart/bulk`) |
| Parches | `pruebas/parche45-carrito-v2.py`, `parche46-pagos-del-carrito.py`, `parche47-entrega-del-carrito.py` |
| Respaldos | `commerce.service.ts.bak-carrito-v2-20260214`, `.bak-pagos-del-carrito-20260214`, `.bak-entrega-del-carrito-20260214` |
| App | `api/lifebookCarrito.ts` (tipos y llamadas) · `app/lifebook-carrito.tsx` (pantalla) · `app/lifebook-carrito-checkout.tsx` (**nueva**) · `app/lifebook-catalog.tsx` (icono con globito) |
| Prueba | `pruebas/lb55a-verificar-carrito-v2.cjs` (51 comprobaciones) |

## 5. Lo que NO está hecho (dicho claro)

0. **Ampliado el 14/09/2026 (tanda G)**: el carrito ya dice **«no llega a tu zona»** cuando la
   tienda no envía a donde vive el comprador (y solo ofrece recoger), y los productos agotados
   tienen **aviso de reposición**. Ver `docs/TANDA-G-AVISO-Y-ZONA.md`.

1. **Cupones**: no existen (ni tabla ni pantalla). Por eso **no hay fila de cupón**, ni «Con cupón»,
   ni línea de descuento en el desglose. Es la pieza que falta y toca dinero, así que va en su tanda.
2. **«Precio del grupo» y «Precio de live»**: la línea ya guarda `sourceKind`/`sourceId`, así que la
   etiqueta se pintará sola, pero hoy **no hay ningún sitio que venda con precio de grupo o de live**.
3. **«Con cupón» en el carrito desde el chat**: depende de los cupones.
4. **«Fuera de zona»**: no se marca en el carrito; la entrega se valida en la caja con la política
   de la tienda (y el servidor rechaza un pedido sin dirección cuando no es recogida).
5. **«Encontrar similar»** en el menú del toque largo: no hay búsqueda por parecido en la plataforma.
6. **«Todo» en modo Editar** marca también los no seleccionables (la casilla de una línea con
   problema sigue gris, pero el maestro marca las pagables) — es lo que se decidió: nada de incluir
   en el total algo que no se puede pagar.
7. **Un pedido por tienda se paga en un solo gesto, pero son N pedidos**: si la segunda tienda
   falla (por ejemplo, sin stock a última hora), la primera ya está creada. La app lo dice con el
   error y el carrito conserva lo no comprado; **no hay pago conjunto transaccional** en el servidor.
