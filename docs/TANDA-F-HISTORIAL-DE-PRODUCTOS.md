# Tanda F — HISTORIAL DE PRODUCTOS («vistos hace poco»)

> Estado: **servidor 31/31** y **verificado en el teléfono (Poco F5)**. Fecha: 14/09/2026.
> **El footer NO se ha tocado** y `api/lifebook.ts` tampoco.

---

## 1. Qué problema resuelve

La especificación del Mercado pide, entre los **cinco accesos rápidos del comprador**, el
**Historial de productos** («viste esto ayer»). En la base solo existía `products.views_count`: un
contador **por producto**, que no sirve para volver a algo que miraste —no dice **quién** ni
**cuándo**— y que además no se puede borrar (no es de nadie).

Y había un hueco de navegación: el **carrito** solo se alcanzaba desde dentro de la ficha de un
producto, y el historial **no tenía puerta**.

## 2. Cómo quedó

| Pieza | Qué hace |
|---|---|
| **Tabla `lifebook.product_views`** (DDL 011) | Una fila por **persona + producto** (no por visita): `viewed_at` (última vez, ordena la rejilla), `times` (cuántas veces) y `first_seen_at`. `ON DELETE CASCADE` por los dos lados: si se borra la cuenta o el producto, el rastro se va con ellos |
| **Registrar la visita** | `POST /commerce/products/:id/view`, que **exige sesión**. Es la única puerta que escribe el historial. Nunca apunta al dueño ni a un producto que ya no está a la venta (devuelve `registrada: false` con el motivo, no un error) |
| **`GET /commerce/my/views`** | El historial propio, lo último primero, con **la misma tarjeta que el catálogo** + `viewedAt`, `times` y `available` |
| **`DELETE /commerce/my/views`** | Vaciar el historial (es el rastro de la persona). Devuelve cuántas filas borró |
| **Pantalla «Historial de productos»** | `app/lifebook-vistos.tsx`: rejilla de dos columnas con **la tarjeta compartida**, «Visto hace un momento / ayer / el 12 sep», «· N veces», «Borrar» en la cabecera, tirar para refrescar y estado vacío que explica para qué sirve |
| **Tarjeta compartida** | `components/lifebook/ProductoCard.tsx` (**nuevo**): la tarjeta de rejilla sale de `app/lifebook-catalog.tsx` y pasa a ser un componente que usan **el catálogo, el tab «Productos» del perfil y el historial**. Estaba copiada; con tres copias habrían acabado distintas |
| **Puerta** | En el perfil propio, junto a «📦 Pedidos» y «💬 Mensajes», una segunda fila con **«🛒 Carrito»** y **«🕘 Vistos»** — los dos accesos del comprador que ya existían pero estaban escondidos |

### Dos decisiones que se dicen en voz alta

* **Un producto que ya no está a la venta NO se esconde**: sigue en el historial, apagado y con «Ya
  no está a la venta». Borrarlo del rastro de alguien sin avisar sería más cómodo y menos honesto.
* **NO hay botón de «Cupones»** aunque la especificación lo ponga en esa fila: los cupones no
  existen en la plataforma (no hay tabla) y un botón que no lleva a nada es una trampa. Irá con su
  propia tanda.

## 3. Verificación contra la API real (`pruebas/lb54a-verificar-historial-productos.cjs`)

**36 PASA · 0 FALLA** con dos cuentas reales, dos productos reales y limpieza al final:

```
=== 1. ABRIR UNA FICHA APUNTA EL «VISTO» ===          leer la ficha NO apunta nada; la llamada
                                                      propia sí (201, registrada=true), con fecha
                                                      times=1 y disponible
=== 2. LA TARJETA TRAE LO QUE PINTA LA REJILLA ===    título, precio, modo, foto, descripción,
                                                      tienda, «vendidos» y precio tachado
=== 3. MIRAR DOS VECES NO DUPLICA: SUMA Y SUBE ===    2 filas (no 3), el último primero, times=2
=== 4. MIRAR LO TUYO NO ES UN «VISTO» ===             motivo «es_tuya» y el dueño sigue a cero
=== 5. CADA PERSONA TIENE EL SUYO ===                 el comprador conserva solo lo suyo
=== 6. LO QUE YA NO ESTÁ A LA VENTA SE DICE ===       ocultar P1 → sigue en la lista, available=false
=== 7. VACIAR EL HISTORIAL ===                        DELETE → deleted=2 y lista vacía
=== 8. SIN SESIÓN ===                                 la ficha es pública; la visita y el historial, 401
```

### Un fallo real que encontró la primera pasada (y se corrigió)

En la primera versión la visita se apuntaba **dentro de `GET /commerce/products/:id`**, que es una
ruta **pública** con sesión opcional. En el teléfono no se apuntaba nada. El log de nginx lo explicó
(el mismo segundo):

```
GET /commerce/my/cart            → 401   (el token acababa de caducar)
GET /commerce/products/<id>      → 200   (pública: salió SIN identidad)
POST /mobility/auth/refresh      → 200
```

La app solo reintenta cuando recibe **401**, y esa ruta responde **200** aunque no haya sesión, así
que la visita se perdía en silencio. Ahora la visita se apunta con **`POST products/:id/view`**, que
exige sesión: un token caducado da 401, el cliente refresca y reintenta. Un solo sitio escribe, así
que la visita tampoco se cuenta dos veces.

## 4. Verificación en el teléfono (Poco F5), leído de la pantalla

| Qué | Lo que se leyó |
|---|---|
| Catálogo (regresión) | La rejilla sigue igual tras sacar la tarjeta a un componente: dos columnas, foto de 108 dp y tres líneas |
| Entrada | Perfil propio → «📦 Pedidos» · «💬 Mensajes» · **«🛒 Carrito»** · **«🕘 Vistos»** |
| Historial | «Historial de productos» · «Solo lo ves tú» · «**3 productos · lo último que miraste, primero**» · «Borrar» en la cabecera |
| Tarjetas | «Servicio a consultar 224163567» (**A consultar**) · «Producto pedidos 224163567» **10.000 XAF** · «Producto pedidos 222579699» **10.000 XAF**, cada una con su tienda y el pie «**Visto hace un momento · 2 veces**» / «· 3 veces» / sin veces (1) |
| Tamaño | Tarjetas de **483 × 725 px** (161 × 241 dp): 33 dp más altas que las del catálogo por la línea del «Visto…» |
| Registro real | Tras abrir tres fichas desde la app, la API del teléfono devuelve las tres con `times` 2, 3 y 1: **el historial se apunta de verdad desde el móvil** |
| Volver a la ficha | Tocar la tarjeta abre el producto (y para una habitación, la ficha del hotel, igual que en el catálogo) |
| Vaciar | «Borrar» → confirmación → la rejilla queda vacía con el estado vacío que explica para qué sirve |

`available` significa «**sigue en el catálogo**» (status `active`). Un producto sin existencias
—«Servicio a consultar» está a 0— sigue con `available: true` y su ficha dice «Agotado»: la rejilla
del historial no promete stock, solo que el producto existe.

## 5. Lo que NO está hecho (dicho claro)

1. **No se registran las visitas sin sesión**: sin token no hay historial (no se guarda una huella
   anónima, a propósito).
2. **No se borra el historial por trozos** (todo o nada) ni hay caducidad automática: la tabla crece
   una fila por persona y producto, no por visita.
3. **No hay «seguir mirando» dentro de la ficha** ni recomendaciones a partir del historial: solo la
   lista.
4. **Los cupones siguen sin existir** (ni tabla ni pantalla): es la pieza que falta de los cinco
   accesos y toca dinero, así que va en su propia tanda.
5. **El historial no se enseña a la tienda** ni al comerciante en su panel: se decidió que el rastro
   de quien mira no es un dato del vendedor.

## 6. Mapa de ficheros

| Cosa | Sitio |
|---|---|
| DDL | `/opt/mirror/app/sql/lifebook/20260214_historial_productos.sql` (copia local `backend/sql/011_historial_productos.sql`) |
| Servicio | `/opt/mirror/app/src/lifebook/commerce.service.ts` (`cardDeProducto`, `registrarVista`, `myViews`, `clearViews`) |
| Rutas | `/opt/mirror/app/src/lifebook/commerce.controller.ts` (`POST products/:id/view`, `GET my/views`, `DELETE my/views`) |
| Parches aplicados | `D:\egapp\pruebas\parche42-historial-productos.py` y `D:\egapp\pruebas\parche43-vista-con-sesion.py` |
| Respaldos | `commerce.service.ts.bak-historial-productos-20260214`, `commerce.service.ts.bak-vista-con-sesion-20260214` (+ los del controlador) |
| API de la app | `api/commerce.ts` (`LbViewedProduct`, `misVistos`, `registrarVista`, `borrarVistos`) |
| Tarjeta compartida | `components/lifebook/ProductoCard.tsx` (**nuevo**); el catálogo ahora la usa |
| Pantalla | `app/lifebook-vistos.tsx` (**nuevo**) |
| Puerta | `app/lifebook-user.tsx` (fila «🛒 Carrito» · «🕘 Vistos» en el perfil propio) |
| Prueba | `pruebas/lb54a-verificar-historial-productos.cjs` (31 comprobaciones) |
