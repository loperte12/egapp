# Tanda G — «Avísame cuando llegue» (aviso de reposición) y «no llega a tu zona»

> Estado: **servidor 28/28** contra la API real y **verificado en el Poco F5**. Fecha: 14/09/2026.
> `api/lifebook.ts` y `components/FloatingFooter.tsx` siguen sin tocarse.

---

## 1. Los dos puntos que quedaban pendientes del carrito

### A. El aviso de reposición (antes: botón apagado)

Cuando algo se agotaba, la ficha terminaba en un botón apagado («Agotado») y la única salida era
preguntar por el chat. Ahora **se apunta el interés y se avisa de verdad**:

| Pieza | Qué hace |
|---|---|
| **`lifebook.product_interest`** (DDL 013) | Una fila por **persona + producto + variante**. Quien espera la «Talla 42» no recibe el aviso de la «Talla 40» |
| **`POST /commerce/products/:id/interest`** | Pide el aviso. Si ya se puede comprar, **no apunta nada** y lo dice: *«Ya está disponible: puedes comprarlo ahora mismo»* |
| **`DELETE /commerce/products/:id/interest`** | Deja de esperar (y dice cuántas esperas quitó) |
| **`product()` → `watching`** | La ficha enseña si ya lo estás esperando |
| **El aviso** | Al reponer, un mensaje de **sistema en el chat comprador↔tienda**: «✅ «Producto X» (Talla 42) vuelve a estar disponible». Se manda **una sola vez** por persona y variante (`notified_at`) |
| **Los tres caminos de reposición** | El panel del comerciante («Precio y stock»), volver a publicar y **aprobar** una publicación que volvió a revisión avisan los tres. Sin el tercero, reponer editando el producto no avisaba a nadie (era el único camino que faltaba) |
| **La ficha** | Agotado → **«Avísame cuando llegue»** (se puede pulsar) → pasa a **«Te avisamos cuando llegue»**; volver a pulsar lo quita |

**Lo que no se promete**: no hay notificación push. El aviso llega **por el chat** (donde la persona
va a mirar y donde puede responder) y con el contador de no leídos del chat.

### B. «Fuera de zona» en el carrito (antes: no existía)

La política de envío de la tienda guarda su **cobertura** (`same_city`, `insular_region`,
`continental_region`, `national`, `international`). Ahora el carrito la lee y, si la tienda no llega
a la zona del comprador:

* el bloque de esa tienda lo dice: **«Esta tienda solo entrega en Malabo · puedes recoger en tienda»**;
* **solo se ofrece recoger en tienda** (no se ofrece un envío que no existe);
* **el producto sigue siendo pagable**: recoger sí se puede. No se bloquea una compra legítima.

Sin ciudad en el perfil no se juzga nada (no se avisa en falso). La comparación de ciudades ignora
mayúsculas y acentos («Ebebiyín» = «ebebiyin»).

## 2. Verificación contra la API real (`pruebas/lb56a-verificar-aviso-y-zona.cjs`)

**28 PASA · 0 FALLA**:

```
1. SE AGOTA Y SE PIDE EL AVISO          stock 0 · la ficha dice watching:false · se apunta · pasa a true
                                        pedir aviso de una variante CON stock NO se apunta (dice que ya está)
2. EL DUEÑO NO SE ESPERA A SÍ MISMO     400 CANNOT_WATCH_OWN
3. LA TIENDA REPONE Y LLEGA EL AVISO    el panel repone · aviso nuevo en el chat · con el nombre del producto
                                        y las esperas quedan cerradas
4. EL AVISO NO SE REPITE                volver a tocar el stock no manda otro aviso
5. SI YA SE PUEDE COMPRAR, NO SE APUNTA  «Ya está disponible: puedes comprarlo ahora mismo»
6. DEJAR DE ESPERAR                     DELETE · quitadas:1 · la ficha deja de decir que espero
7. ZONA DE ENVÍO                        desde Malabo SÍ llega (pickup, taxi_moto) · desde Acurenam NO
                                        (aviso + solo pickup) · y sigue siendo pagable
```

> **Lo que la prueba NO ejercita**: el aviso de una espera **por variante** con su nombre. Los datos
> de prueba no tienen ninguna variante agotada (todas con stock), así que esa rama queda escrita y
> compilada pero **no vista funcionando**; se verificó la rama equivalente por producto.

Dos fallos reales aparecieron al escribir esta prueba y se corrigieron:
1. **El aviso no salía al reponer desde el panel**: `quickEdit` (el camino que el comerciante usa a
   diario) no llamaba al aviso. Ahora sí.
2. **Aprobar una publicación repuesta tampoco avisaba**: `moderate` → `approve` es el momento en que
   el producto vuelve a venderse. Ahora también avisa.

## 3. Verificado en el Poco F5 (volcado de pantalla)

| Qué | Lo que se leyó |
|---|---|
| Ficha agotada | Barra: «Guardar» · «Escribir a la tienda» · «Mi carrito» · **«Avísame cuando llegue»** (los cuatro a 44 dp) |
| Tras pulsar | La alerta «**Te avisamos**» con el mensaje del servidor y el botón pasa a «**Te avisamos cuando llegue**» |
| Carrito (cuenta de Acurenam, tienda de Malabo) | Bajo la cabecera de la tienda: **«🚚 Esta tienda solo entrega en Malabo · puedes recoger en tienda»** |
| Caja del carrito | En «CÓMO LO RECIBES» solo aparece **«Recoger en tienda»** |

## 4. Lo que NO está hecho (dicho claro)

1. **No hay push**: el aviso es un mensaje de sistema en el chat. Si la app está cerrada, se verá al
   abrirla (con su contador de no leídos).
2. **No hay caducidad de la espera**: si la persona ya no quiere el producto, la quita ella (o el
   aviso se da una vez y la fila queda marcada como avisada).
3. **La cobertura es por región/ciudad**, como la declara la tienda: no hay un mapa de barrios ni
   distancias. Una tienda que solo entrega en su ciudad no puede afinar más allá de eso.
4. **`product_interest` no se usa para nada más** (ni para avisar al comerciante de cuánta gente
   espera un producto). Sería el siguiente paso natural: «12 personas esperan esto».
5. **La rama del aviso por variante con nombre** no se ha podido ver funcionando (no hay variantes
   agotadas en los datos de prueba).

## 5. Mapa de ficheros

| Cosa | Sitio |
|---|---|
| DDL | `/opt/mirror/app/sql/lifebook/20260214_aviso_de_reposicion.sql` (copia local `backend/sql/013_aviso_de_reposicion.sql`) |
| Servidor | `commerce.service.ts` (`watchProduct`, `unwatchProduct`, `avisarReposiciones`, `avisarEnChat`, `watching`, zona en `myCart`) · `commerce.controller.ts` (`products/:id/interest`) · `merchant.service.ts` (avisa al reponer) · `http/error.filter.ts` (`CANNOT_WATCH_OWN` → 400, `CART_LINE_NOT_FOUND` → 404) |
| Parches | `parche48-aviso-y-zona.py`, `parche49-norm.py`, `parche50-cobertura-lista.py`, `parche51-http-codigos.py`, `parche52-aviso-en-panel.py`, `parche53-aprobar-avisa.py` |
| App | `api/commerce.ts` (`avisoStockApi`, `watching`) · `api/lifebookCarrito.ts` (tipos de zona) · `app/lifebook-product/[id].tsx` (CTA de aviso) · `app/lifebook-carrito.tsx` (aviso de zona) |
| Prueba | `pruebas/lb56a-verificar-aviso-y-zona.cjs` (28 comprobaciones) |

## 6. Un aviso para el que toque estos ficheros

* **Editar un producto con `PUT` lo devuelve a revisión** (y sus variantes se recrean con ids
  nuevos). Para el día a día (precio y stock) el camino es `PATCH /lifebook/merchant/products/:id/quick`.
  Esta prueba lo aprendió por las malas: dejó un producto de demostración en `pending` y hubo que
  aprobarlo de nuevo.
* La **cobertura** de la política de envío es una **lista** (`text[]`), no un valor: `{same_city}` o
  `{same_city,national}`. Leerla con `String(...)` funciona con un valor y falla con dos.
