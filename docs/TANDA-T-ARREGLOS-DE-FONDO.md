# TANDA T — LOS ARREGLOS DE FONDO DE LA §3 (registro, punto por punto)

> **Para quién es:** el dueño y el otro agente. Cada punto de la §3 de
> `docs/ACCION-INMEDIATA-PARA-EL-OTRO-AGENTE.md` con **qué se hizo, con qué prueba**, y lo que está
> **bloqueado y por qué**.
>
> **Orden:** el de la §3 (6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16). La regla es la de siempre: un cambio
> por parche, `npx tsc --noEmit` en 0 antes de emitir, `pm2 restart` después, y prueba contra la API
> real antes de pasar al siguiente.

---

## T.6 — Avisos de estado del pedido (push + chat): **mitad hecha, mitad bloqueada**

### La mitad del CHAT: existe y está VERIFICADA

`orderAction` ya llamaba a `notify()`, pero eso no se había medido nunca. **Medido ahora**
(`pruebas/lb83a-avisos-del-pedido.cjs`, **TODO OK**), abriendo la conversación comprador↔tienda por la
misma ruta que usa la app (`POST /lifebook/chat/open`):

| Quién hace qué | Aviso que le llega al otro | Antes → después |
|---|---|---|
| La tienda **acepta** | «La tienda aceptó tu pedido» (al comprador) | 4 → 5 |
| La tienda **prepara** | «Tu pedido está en preparación» (al comprador) | 4 → 5 |
| El comprador **cancela** | «El comprador canceló el pedido» (a la tienda) | 6 → 7 |

Y en la base de datos se ve el rastro de todos: `lifebook.messages` con `kind='system'` (ahí aparece
también el «La tienda ha marcado tu pedido como cobrado ✅» del R.5b).

> **Trampa que me costó tres falsos fallos** (queda apuntada para el que venga): `GET
> /lifebook/chat/conversations` devuelve un **array pelado** (no `{ conversations: […] }`) y el
> comprador de pruebas tiene **102 conversaciones**, así que buscar el aviso «entre las primeras» no
> encuentra nada aunque exista. Y la lista de mensajes viene **del más nuevo al más viejo**: cortar por
> el final devuelve los viejos. Se cuentan apariciones antes y después, y se abre la conversación por su
> interlocutor.

### La mitad del PUSH: **no se puede montar ni comprobar sin cuentas del dueño**

Medido (no supuesto):

* `expo-notifications` **no está instalado** (`package.json`).
* **No hay proyecto de EAS** (`app.json` sin `extra.eas.projectId`).
* **No hay `google-services.json`** (ningún fichero en el proyecto).

Con eso, un token de push **no se puede obtener**: en Android hace falta un proyecto de Firebase (FCM) y,
con Expo, un proyecto de EAS que lo gestione. Y sin token no hay nada que probar — y **la regla de esta
casa es no hacer lo que no se puede comprobar**.

**Lo que hace falta (acción del dueño, 10 minutos):**

1. Crear una cuenta en **expo.dev** (gratis) e iniciar sesión en el ordenador con `npx eas-cli login`.
2. En el proyecto: `npx eas-cli init` (crea el `projectId` en `app.json`).
3. `npx eas-cli credentials` → Android → dejar que **EAS cree la clave de FCM** (pide iniciar sesión con
   una cuenta de Google; es el paso que no puede hacer un agente).
4. A partir de ahí, el trabajo es: instalar `expo-notifications`, pedir permiso, registrar el token en el
   servidor (`push_tokens`), y al cambiar el estado del pedido mandar el aviso con la API de Expo
   (`https://exp.host/--/api/v2/push/send`, **sin credenciales en el servidor**) además del mensaje del
   chat. Está estimado en media tanda.

**Mientras eso no exista, el aviso del chat ya cumple**: el comprador y la tienda ven el cambio en la
conversación del pedido (verificado arriba) — lo que falta es que **suene el teléfono** sin abrir la app.

---

## T.7 — Reseñas y disputas: **reseñas hechas en el servidor; la pantalla y el motivo de la disputa, no**

### Lo que faltaba de verdad (medido, no supuesto)

* `lifebook.products` **ya tenía** `rating` y `rating_count`; `lifebook.shops`, también. **Nadie los
  escribía jamás** (`0` productos con nota, `0` tiendas con nota): la valoración era un adorno muerto, y
  sin valoraciones un desconocido no compra (§A.7, prioridad 2).
* **Disputas sí existen**: la acción `dispute` del comprador ya pone el pedido en `disputed` (desde
  `confirmed`, `preparing`, `in_transit`, `ready_pickup` y `delivered`). Lo que **no** existe es el
  **motivo**: esa acción no guarda nada de lo que escriba el comprador.

### Las reseñas (servidor) · HECHO

**Migración `pruebas/80-resenas-del-pedido.sql`** (tabla `lifebook.order_reviews`: `order_id` **UNIQUE**,
`shop_id`, `buyer_id`, `rating` 1-5 con `CHECK`, `comment`, `created_at`) y **`pruebas/parche81-resenas.py`**:

* `POST /lifebook/commerce/orders/:id/review` con `{ rating, comment }`.
* **Solo el comprador** del pedido, y **solo si está entregado** (valorar lo que no ha llegado sería
  inventarse la experiencia).
* **Una reseña por pedido**: el índice único hace que un doble toque no cuente dos veces
  (`REVIEW_ALREADY_DONE`), y la reseña y las notas se mueven **en la misma transacción**.
* La nota se mueve como **media ponderada por los votos que ya había**, no como «la última que entró»:
  con 4 y 3 votos y un 5 nuevo, queda 4,25. Es la diferencia entre una valoración y un adorno.
* Se mueven **la nota de la tienda y la de los productos del pedido** (una vez por producto).
* El aviso va al chat («El comprador ha valorado el pedido con 5 de 5 ⭐») y `orderDetail` devuelve
  `review`, así que **el comprador ve lo que escribió y la tienda lo que le han puesto**.

**Prueba** (`pruebas/lb84a-resenas.cjs`, **TODO OK**, 16 comprobaciones):

| Caso | Resultado |
|---|---|
| Valorar un pedido **sin entregar** | `ORDER_NOT_DELIVERED` |
| Valorar **como tienda** | `NOT_ORDER_PARTICIPANT` |
| Notas `0`, `6`, `4.5` y `"mucho"` | `RATING_INVALID` (cuatro casos) |
| Reseña buena (5) con comentario de **600** caracteres | HTTP 201 · nota 5 · comentario **recortado a 500** |
| Valorar **dos veces** el mismo pedido | `REVIEW_ALREADY_DONE` |
| La nota del producto | votos 0 → 1, nota **5** |
| La **tienda** mira su pedido | ve la valoración que le han puesto |
| **Segundo voto (3)** | votos 1 → 2 y la nota queda **4** = la media, **no 3** |

En la base de datos se comprobó el rastro (`order_reviews` con sus dos filas, tienda y producto a
**4.00 con 2 votos**) y **se limpió**: las reseñas de prueba se borraron y las notas volvieron a 0 —
dejar votos de un test sería **prueba social falsa**, que es justo lo que este punto viene a arreglar.
Stock y ventas, como siempre, de vuelta a 20 y 0.

### La pantalla de la reseña · HECHA y medida en pantalla

`commerceOrdersApi.valorar(id, { rating, comment })` en `api/commerce.ts` (y `review` en `LbOrder`), y en
`app/lifebook-order/[id].tsx` una caja **«¿Cómo fue la compra?»** con **5 estrellas** y el comentario,
solo para el comprador, solo si el pedido está entregado y solo si no la ha escrito ya. Cuando existe,
se enseña **para los dos** («Tu valoración» / «Valoración del comprador») con las estrellas pintadas.

**Medido en pantalla** (APK de 18:43, pedido `LB-260915-0035` entregado en la cuenta del móvil):

| Paso | Lo que salió |
|---|---|
| Abrir el pedido | El pedido sale **Entregado** y **Cobrado · 2026/9/15** (pago en tienda cerrado al entregar: se ve funcionando el R.5) y la caja con **5 estrellas vacías** (`☆`) |
| Tocar la 5ª estrella | **5 llenas (`★`), 0 vacías** — la selección responde |
| Enviar | Aviso «Gracias · Tu valoración ya cuenta para la tienda y para el producto.» |
| Volver a abrir | **«Tu valoración: ★★★★★»** y **la caja de valorar ya no está** (una sola vez, como manda el servidor) |

En la base de datos quedó la reseña (nota 5) y **la tienda y el producto a 5.00 con 1 voto** ✓.
**Limpieza hecha:** la reseña de la prueba se borró y las notas volvieron a 0 (dejar un voto de test sería
prueba social falsa), stock 20 y ventas 0.

### El motivo de la reclamación · HECHO (servidor y pantalla)

**Migración `pruebas/81-motivo-de-la-reclamacion.sql`** (`dispute_reason`, `disputed_at`) y
**`pruebas/parche82-motivo-reclamacion.py`**:

* `dispute` exige un **motivo de al menos 10 caracteres** (`DISPUTE_REASON_REQUIRED`) y lo recorta a 500.
* Se guarda el motivo y **cuándo** se abrió (la fecha es lo que hará falta para la ventana de garantía
  del patrón de Ecomerse).
* El **aviso del chat lleva el motivo** («El comprador abrió una reclamación: “…”»): es justo lo que la
  tienda necesita leer.
* El detalle lo devuelve a **las dos partes** (`disputeReason`, `disputedAt`).
* En la app, la reclamación **deja de ser un chip**: es una caja **«¿Algo ha ido mal?»** con el motivo y
  el botón que **dice cuánto falta** («Escribe el motivo (0/10)») y no se enciende hasta que se escribe.

**Prueba** (`pruebas/lb85a-motivo-de-reclamacion.cjs`, **TODO OK**, 10 comprobaciones): sin motivo y con
4 letras → `DISPUTE_REASON_REQUIRED` **y el pedido no se toca**; con motivo → `disputed`, el motivo
entero guardado, con fecha, **la tienda lo lee** y **el aviso del chat lo lleva dentro**; y en
reclamación la tienda **no puede seguir** con la gestión normal (`INVALID_STATE_TRANSITION`).

En pantalla se vio la caja («¿Algo ha ido mal?» + «Escribe el motivo (0/10)»). **No he tocado el botón de
reclamar en el móvil**: eso abriría una reclamación de verdad en un pedido real y no hace falta para
comprobar el diseño — la prueba del servidor ya cubre el resto.

### Lo que queda del punto 7

* La **ventana de garantía** (cuántos días se puede reclamar, como en Ecomerse) sigue sin decidir: ahora
  se puede reclamar en cualquier momento, incluso un mes después. La fecha ya se guarda (`disputed_at`),
  así que poner el límite es una línea **cuando el dueño diga cuántos días**.

---

## T.8 — El dinero del comercio: comisión congelada, libro de cuentas y liquidación · HECHO (servidor)

**Lo que faltaba (medido):** al entregar, el pedido quedaba `paid`… y **no había ni una línea de dinero**.
`payment_status` dice que se cobró, pero **cuánto se queda la plataforma y cuánto hay que pagarle a la
tienda no estaba en ningún sitio**. Con entregas en efectivo que cobra una persona en mano, eso es no
poder cuadrar nada.

**Se ha portado el patrón de Comida** (`src/food/food-fees.ts`, `food-settlement.service.ts`) en vez de
inventar uno: **8 % con mínimo de 500 XAF y tope del 40 %**, comisiones **congeladas por pedido** y
liquidación manual registrada.

### La aritmética, en un módulo puro que se puede probar con números

`src/lifebook/orders-fees.ts` (sin base de datos, sin Prisma, sin cobrar nada):

* **Comisión**: 8 % de lo que ingresa la tienda (subtotal − cupón), **con mínimo de 500 XAF**.
* **Tope del 40 %**: la comisión nunca pasa de ahí, y **el tope manda sobre el mínimo**. Es la promesa de
  que **ninguna tienda paga por vender**: un pedido de 1 000 XAF deja 400 de comisión y 600 para la tienda.
* **La entrega NO se comisiona** (va a quien reparte), y queda en el libro como «a pagar al reparto».
* Los números viven en `lifebook.commerce_fee_config`, **en la base**, para cambiarlos sin desplegar.

**Prueba con números** (`pruebas/lb87x-fees-puros.cjs`, **TODO OK**): seis casos exactos (12 000 → 960 y
11 040; 1 000 → 400 y 600 con tope; 6 000 → manda el mínimo; 6 250 → justo en el mínimo; sin importe → 0)
y **tres propiedades comprobadas sobre 4 286 importes de 0 a 30 000 XAF**: la tienda **nunca** queda en
negativo, la comisión **nunca** pasa del tope y el desglose **siempre** cuadra.

### El asiento, dentro de la transacción de la entrega

`asentarDinero(tx, o)` se llama en **las dos vías de entrega** (el botón de la tienda y el código de
contra entrega), **dentro de la misma transacción**: un pedido entregado siempre tiene sus cuentas y uno
no entregado nunca las tiene. Congela el desglose en `lifebook.order_fees` y escribe el **libro de doble
partida** en `lifebook.ledger_entries`:

```
caja                 debe  12 000      (lo que entra)
a_pagar_tienda       haber 11 040
comision_plataforma  haber    960
```

**Suma del debe = suma del haber.** Y si el pedido ya estaba asentado, el `ON CONFLICT (order_id) DO
NOTHING` no deja escribir ni una línea más: un reintento no cuenta el dinero dos veces.

### Lo que ya se puede preguntar (rutas nuevas, en un controlador aparte)

| Ruta | Quién | Qué responde |
|---|---|---|
| `GET /lifebook/commerce/money/balance?shopId=` | la tienda | facturado, **comisión**, **lo que se le debe**, y sus liquidaciones |
| `POST /lifebook/commerce/money/settlements` | **solo el admin** | liquida la tienda (pago a mano) y lo deja registrado con quién y por qué pedidos |
| `GET /lifebook/commerce/money/summary` | **solo el admin** | la caja de la plataforma: comisión total, lo que debe a las tiendas y **el cuadre del libro** |

Y el detalle del pedido enseña al **vendedor** su comisión y lo que va a cobrar (el **comprador no la
ve**: no le corresponde).

**Prueba** (`pruebas/lb87a-dinero.cjs`, **TODO OK**, 21 comprobaciones): la comisión es 960 y lo que se le
paga a la tienda 11 040; el pendiente y la comisión acumulada suben exactamente eso; **el libro cuadra
(12 000 = 12 000)**; el comprador **no** ve la caja de la plataforma (`NOT_ADMIN`); pedir el saldo de una
**tienda ajena** da `NOT_ORDER_PARTICIPANT` (comprobado aparte: HTTP 403, no hay fuga); liquidar solo lo
puede hacer el admin; se liquida **todo** el pendiente y queda a 0; y **no se puede liquidar dos veces**
(`NOTHING_TO_SETTLE`).

> **Un falso fallo que me llevé** (queda anotado): llamé `balance` **sin** `shopId` esperando un error, y
> devolvió 200… con la tienda del propio que llama, porque **el comprador de pruebas también tiene una
> tienda**. El endpoint hace lo correcto (solo devuelve tiendas del que pregunta); la comprobación que
> vale es pedir la de **otro**.

### Lo que hay que decir sin adornos

* **Los pedidos entregados ANTES de este arreglo no tienen comisión ni asiento**: el dinero se cuenta
  desde ahora. Es lo mismo que pasa con los 34 entregados sin cobrar: la historia no se puede reescribir
  sin inventarse datos. Si el dueño quiere, se puede asentar hacia atrás **solo** lo que tenga
  `payment_status = 'paid'` y fecha conocida — pero eso hay que decidirlo, no deducirlo.
* **La liquidación es un pago a mano**: la app todavía no tiene la pantalla del panel de la tienda (el
  servidor ya responde). Es la siguiente pieza, con la tanda que toque de app.
* **La conciliación del efectivo de cada repartidor** (lo que cobra en mano y tiene que entregar) **no
  está**: Life Book todavía no tiene repartidores propios; el reparto va «a acordar» por el chat. El
  libro ya tiene la cuenta `a_pagar_reparto` preparada para cuando existan.

---

## T.10 — Los productos agotados, fuera del escaparate · HECHO

**Lo que pasaba (medido, no supuesto):** el catálogo filtraba por `p.status = 'active'` y **nada más**.
Un producto con stock exacto a 0 **seguía listado**: el escaparate enseñaba lo que no se puede comprar y
el comprador se encontraba «agotado» al entrar. La ficha ya calculaba bien el estado; la rejilla no.

**Arreglo** (`pruebas/parche84-agotados-fuera.py`): la condición «se puede comprar» entra en **los tres
sitios públicos** donde se cuenta o se lista lo que hay en una tienda, para que **no se contradigan**
(un chip que dice «3 productos» y abre una rejilla con 2 es una trampa, y su propio comentario lo dice):

1. `listCatalog` — la rejilla del catálogo.
2. `shopCategories` — los chips por categoría del perfil público (`GET /shops/:id/categories`).
3. El detalle de la tienda — sus contadores `products` / `sales` / `services`.

**La regla, que es lo importante:** solo se esconde lo que **no se puede comprar**.

* `stock_mode <> 'exact'` → **nunca** se esconde: «a pedido», «aproximado» y «sin límite» **no se agotan**.
* Si el producto tiene **tallas con stock**, se ve **aunque el total esté a 0** (la talla sí se compra).
* La **ficha del producto no cambia**: sigue abriéndose con su enlace, sus fotos y sus tallas, y sigue
  diciendo «agotado». Lo que se quita es el escaparate, no la información.

**Prueba en cuatro fases** (`pruebas/lb88a-agotados.cjs`, **TODO OK** en las cuatro), moviendo el stock
de verdad en la base y restaurándolo después:

| Fase | Catálogo | Chips del perfil | Contadores | Ficha |
|---|---|---|---|---|
| **antes** (stock 20) | **está** | 35 | 35 | se abre |
| **agotado** (stock 0 y las 6 tallas a 0) | **no está** (0 resultados) | **34** | **34** | **sigue abriéndose** y dice stock 0 |
| **a pedido** (stock 0, modo `approximate`) | **está** (no se agota) | 35 | 35 | se abre |
| **restaurado** | **está** | 35 | 35 | se abre |

Todo quedó restaurado después (stock 20, modo `exact`, las tallas con sus valores originales: 1, 4, 0,
0, 2 y 3; ventas y notas a 0).

> Nota de método: el catálogo devuelve **30 por página** y esta tienda tiene 35 productos activos, así que
> buscar «en las primeras 30» habría dado un **falso** «no está». La prueba busca por texto
> (`q=Camiseta`) para no depender de la paginación.

---

## T.11 — «Reponer stock con tope»: **el fallo real ya estaba cerrado**, y lo demás es una decisión

El punto decía que reponer stock «suma sin tope» e infla el inventario. Comprobado el código tal como está
hoy (`orders.service.ts:666-680`):

* La reposición vive **dentro del compare-and-set de la R.4**: la transacción primero hace el `UPDATE …
  AND status = <el que se leyó>` y **corta si no afectó a ninguna fila**, así que la reposición **solo
  ocurre una vez por pedido**. Era ese el fallo real (cancelar dos veces devolvía el stock dos veces), y
  está medido: en `pruebas/lb77a-compare-and-set.cjs`, **8 cancelaciones simultáneas** del mismo pedido
  dejan el stock en **20 exactos** — con el fallo habría quedado en **27**.
* Al producto solo se le repone si su modo de stock es `exact` o `approximate` (`AND stock_mode IN
  ('exact','approximate')`): a un producto «a pedido» o «sin límite» **no** se le inventa inventario.
* Las tallas se reponen siempre (una talla siempre es stock exacto).

**Lo que no se ha hecho, y por qué no me lo invento:** un «tope» de verdad necesitaría saber **cuánto
stock había** cuando se creó el pedido, y eso hoy **no se guarda** en ningún sitio (ni en el pedido ni en
la línea). Poner un tope sin ese dato sería elegir un número al azar. Si el dueño quiere ese tope, es una
columna (`stock_at_order`) y una decisión suya sobre qué hacer cuando la tienda ha tocado el stock por
medio; con lo que hay, **el inventario ya no se infla por cancelaciones repetidas**, que era el agujero.

## T.13 — El número de pedido: **el índice único YA existía** (el documento se equivocaba) y el fallo era otro

### Lo que decía el documento, y lo que hay

El punto 13 decía: «`order_no` único — `count(*) + 1`, **sin índice único**; dos compras a la vez pueden
repetir número». **Comprobado en la base** (`pruebas/83-numero-de-pedido-unico.sql`):

* El índice **ya existe y es único**: `orders_order_no_key ON lifebook.orders (order_no)`.
* Y no hay ni un número repetido: **207 pedidos, 207 números distintos**.

O sea: la frase «sin índice único» es **falsa**, y el número **no se puede repetir**. Lo que sí estaba
mal era el **cálculo**, y su síntoma era peor de lo que parecía: como el número salía de **contar** los
pedidos del día, dos compras a la vez contaban lo mismo, calculaban el mismo número, y la segunda
**chocaba con el índice y se caía con un error del servidor**: el comprador **perdía la compra**.

### Los tres intentos (los dos primeros fallaron, y el log lo dijo)

| Intento | Qué se hizo | Qué pasó (medido) |
|---|---|---|
| 1 | `pg_advisory_xact_lock` dentro de la transacción | **8 de 8 compras con HTTP 500** — `P2010: Failed to deserialize column of type 'void'` (Prisma no sabe leer lo que devuelve el candado) |
| 2 | el candado convertido a texto (`::text`) | **6 de 8 con HTTP 500** — `P2028: Transaction already closed … timeout 5000 ms`: el candado se queda sujeto hasta el commit, así que las compras se ponen **en fila durante toda la creación del pedido** |
| 3 (**el bueno**) | el número se aparta en una **transacción corta** contra un **mostrador** por día (`lifebook.order_counters`, migración 84), **antes** de abrir la del pedido | **4 de 4 compras simultáneas salen**, con números **distintos y consecutivos** |

El mostrador aparta el número con **una sola frase atómica**
(`INSERT … ON CONFLICT (day) DO UPDATE … RETURNING`), que bloquea la fila microsegundos y —esto es lo que
importa— deja el número **escrito**, así que el siguiente lo ve. La fila se sembró con el número más alto
de cada día que ya existía (260915 → 38, 260914 → 12, 260912 → 68, 260911 → 25) para no chocar con los
pedidos anteriores.

**Prueba** (`pruebas/lb89a-numero-de-pedido.cjs`, **TODO OK**): 4 compras a la vez → **4 de 4**, números
`0078 0079 0080 0081` (distintos, consecutivos, sin huecos), el stock baja exactamente lo comprado y
vuelve al cancelarlas ✓.

### HALLAZGO NUEVO, abierto (medido, no arreglado): con 8 compras a la vez, la mitad fallan

Con **8 compras simultáneas**, **4 salen y 4 fallan con HTTP 500** por `P2028: Transaction already closed
… timeout 5000 ms`. Y **no es cosa del número**: se repite igual con **8 productos DISTINTOS**
(`pruebas/sonda-concurrencia.cjs`: 4 de 8 en 5 040 ms), así que no es la fila del producto. Tampoco es el
pool: hay **15 conexiones** abiertas y el tope de Postgres son **100**.

Lo que **sí** queda claro:
* Una compra sola tarda **14-18 ms** y 4 a la vez **49 ms** (`pruebas/sonda-tiempo-compra.cjs`), así que
  el camino normal está sano.
* Algo **dentro de la transacción del pedido** se queda esperando más de 5 s cuando hay 8 a la vez. No
  se ha identificado el qué, y **no se ha arreglado**: inventarse un arreglo sin saber la causa sería
  justo lo que no se hace aquí.

**Lo que hay que decidir:** si esto importa al negocio (8 compras del mismo producto en el mismo segundo
es un caso de «se acabó el stock»), el arreglo probable es subir el tiempo de transacción y/o acortar la
creación del pedido. Es una tanda propia, con la causa identificada primero. Mientras tanto, el número ya
no se repite y **no se pierde ninguna compra** en el uso normal (una compra tras otra: 14 ms).


---

## T.14 — Un cupón que todavía no empieza no se recoge · HECHO

**Lo que pasaba:** al recoger un cupón se comprobaba que estuviera activo, que no hubiera caducado y que
no estuviera agotado… **pero no `starts_at`**. Así que el cupón de una promoción que empieza la semana
que viene se podía **recoger hoy**: quedaba guardado en la cuenta del comprador y el fallo aparecía
**al pagar**, con otro mensaje y sin decir cuándo vale. El comprador creía tener un cupón y no lo tenía.

**Arreglo** (`pruebas/parche86-cupon-que-no-empieza.py`): la misma comprobación que ya hacía el pago, en
el momento de recogerlo, con el **mismo código de error** (`COUPON_NOT_STARTED`, para que la app no tenga
que aprender dos) y **con la fecha dentro** del mensaje.

**Prueba** (`pruebas/lb90a-cupon-que-no-empieza.cjs`, **TODO OK**), con un cupón creado con `starts_at`
mañana y borrado después:

* recogerlo antes de tiempo → **`COUPON_NOT_STARTED`** y el mensaje **«Ese cupón todavía no se puede usar:
  empieza el 16/9/2026»**;
* y **no queda guardado** en la cuenta del comprador (sus otros 3 cupones siguen igual);
* un cupón que ya vale (`PRUEBA135085`) se recoge sin problema → HTTP 201.

> Nota de método: el primer intento de esta prueba falló **por mi culpa**, no del código — la tabla
> `lifebook.coupons` no tiene `description` (tiene `title`) y el cupón no llegó a crearse, así que el
> error que salió fue `COUPON_NOT_FOUND`. Los campos reales se miraron **antes** de repetir la prueba.

---

## T.15 — Cerrar el coste del envío en el total · HECHO (servidor)

**Lo que pasaba (medido):** cuando la política de envío de la tienda es «se acuerda por el chat»
(`on_request`) o «según la distancia» (`calculated`), el pedido **nace con coste de entrega 0** y lo
único que se añade es un texto. Comprobado con la política puesta en `on_request`: pedido
`LB-260915-0082` → **reparto 0 XAF y total 12 000 XAF** (sin el reparto). Es decir: ese dinero se movía
**por fuera y sin rastro**, el total no lo llevaba, y el libro de cuentas no tenía nada que anotar.

**Arreglo** (`pruebas/parche87-coste-de-envio.py`): la tienda puede **cerrar el coste del reparto** en el
pedido antes de entregar.

```
PATCH /lifebook/commerce/orders/:id/delivery-cost   { deliveryCostXaf }
```

Con sus reglas, cada una por un motivo:

* **solo la tienda** del pedido (es su reparto);
* **no** si el pedido ya está entregado, cancelado o en reclamación (ya no admite cambios de dinero);
* **nunca si ya está cobrado** (`ORDER_ALREADY_PAID`): si el comprador ya pagó un importe, cambiarlo
  después dejaría el libro contando una cosa y el comprador habiendo pagado otra;
* **no** para recogida en tienda: no hay reparto que cobrar;
* entero entre 0 y 500 000 XAF, sin decimales ni negativos;
* recalcula el total (productos − cupón + reparto) y **avisa al comprador en el chat** con el total nuevo.

**Lo que NO hace:** no inventa precios de reparto. No hay tarifas por kilómetro ni distancias: el precio
lo pone la tienda, que es quien reparte o quien lo contrata. Lo que se arregla es que **se pueda cerrar**
y que quede en el total y en el libro.

**Prueba** (`pruebas/lb91a-coste-de-envio.cjs`, **TODO OK**, 16 comprobaciones): nace con 0 y el total sin
el reparto; el comprador no puede fijarlo (`NOT_ORDER_PARTICIPANT`); negativos, 900 000 y decimales
rechazados (`DELIVERY_COST_INVALID`); en recogida `DELIVERY_NOT_APPLICABLE`; en un pedido **ya cobrado**
`ORDER_ALREADY_PAID`; la tienda fija 2 000 → **total 14 000**, y el comprador lo ve; al entregar, el
desglose guarda el reparto real (2 000) y **la comisión sigue siendo del producto (960)**, no del
reparto; y un pedido entregado ya no admite cambios.

**Y el libro lo recoge** (el punto entero era esto), del pedido entregado con reparto cerrado:

```
caja                 debe  14 000      (12 000 de productos + 2 000 de reparto)
a_pagar_tienda       haber 11 040
comision_plataforma  haber    960
a_pagar_reparto      haber  2 000      ← antes esta línea no existía nunca
```

Suma del debe = suma del haber (14 000) ✓. El dinero del reparto ya **tiene rastro** y se puede cuadrar.

**Lo que falta de este punto:** el **campo en la app** para que la tienda lo cierre desde el móvil (el
servidor ya lo acepta y está probado); y, si algún día se quiere el modo «según la distancia», habrá que
decidir la tarifa (es una decisión de negocio, no un cálculo que se pueda inventar).

---

## T.12 — Idempotencia: la huella del contenido y la clave caducada · HECHO

**Lo que pasaba (dos cosas, las dos contra el comprador):**

1. **No se guardaba nada del contenido del pedido.** La clave de idempotencia protege del doble toque…
   pero solo si el contenido es el mismo. Reutilizarla con **otro** pedido devolvía el pedido anterior
   **en silencio**: el comprador creía haber comprado una cosa y había comprado otra.
2. **Dentro de la transacción, la lectura de la clave no filtraba la caducidad.** Una clave caducada —y
   hay **173 de 244** en la tabla— se trataba como «pedido en curso», así que un reintento legítimo se
   quedaba con «Ese pedido ya se está creando, espera un momento» **para siempre**.

**Arreglo** (migración **`pruebas/85-huella-de-idempotencia.sql`** + **`pruebas/parche88-idempotencia.py`**):

* `huellaDePedido(dto)` = SHA-256 de los artículos, la entrega, el pago, la dirección y el cupón. **La
  nota libre no entra a propósito**: cambiar una coma en el texto no debe romper un reintento.
* La clave se reserva **con su huella** (`idempotency_keys.request_hash`) y, al repetirse:
  * mismo contenido y sin caducar → **devuelve el mismo pedido** (replay, como debe ser);
  * contenido **distinto** → **`IDEMPOTENCY_KEY_REUSED`** («Esa clave ya se usó para otro pedido»),
    en vez de devolver el pedido viejo en silencio;
  * **caducada** → se **recicla** (se limpia su respuesta y se sigue creando) en vez de atascarse.
* Las claves viejas sin huella (`NULL`) no se comparan: no hay con qué, y no se inventa.

**Prueba** (`pruebas/lb92a-idempotencia.cjs`, **TODO OK**, 8 comprobaciones, los tres casos con la **misma
clave**):

| Caso | Resultado |
|---|---|
| A · mismo contenido | el reintento devuelve **el mismo pedido** (`LB-260915-0085`), no crea otro |
| B · contenido distinto (2 en vez de 1) | **`IDEMPOTENCY_KEY_REUSED`**, sin pedido y **sin tocar el stock** |
| C · clave caducada | **se crea el pedido** (`LB-260915-0086`), no se queda en «ya se está creando» |

Los dos pedidos de la prueba se cancelaron y el stock volvió a su sitio (20 ✓); las claves de prueba se
borraron para dejar la tabla como estaba.

---

## T.9 — La pieza para enchufar un cobro de verdad (sin proveedor) · HECHO

**Qué es y qué no es.** Es **la pieza**, no el proveedor. Hoy el comercio **registra** la forma de pago y
el dinero se mueve fuera (efectivo, transferencia, depósito): **no hay ninguna pasarela, y no se inventa
ninguna**. Lo que queda hecho es el hueco, con su forma y sus reglas, para que el día que el dueño firme
con Maviance, Notch Pay o el QR CEMAC, conectarlo sea **escribir un fichero que cumpla la interfaz y
registrarlo en una línea**, sin tocar el comercio (ni el carrito, ni el pedido, ni el libro de cuentas).

**Ficheros** (`src/lifebook/payments.service.ts` + `payments.controller.ts`, registrados con
`parche89`):

* La **interfaz** `PaymentProvider`: `id`, `name`, `capabilities` (¿QR? ¿webhook? ¿devoluciones?),
  `createCharge`, `getCharge`, `verifyWebhook?`, `refund?`.
* El proveedor **`manual`**: el camino que ya existe (la tienda cobra por fuera y lo marca con su
  justificante, `POST /orders/:id/mark-paid`). Está ahí para que el comportamiento de hoy tenga el mismo
  nombre y el mismo hueco que tendrá el de mañana.
* Rutas: `GET /lifebook/commerce/money/payment-providers` (qué se puede cobrar hoy, con sus
  capacidades), `POST /lifebook/commerce/money/charge` (abrir un cobro) y
  `POST /lifebook/commerce/payments/webhook/:provider` (el aviso del proveedor, sin sesión).

**Las cuatro reglas que quedan escritas en el código:**

1. **El importe lo pone el SERVIDOR** (el `total_xaf` del pedido), nunca la app ni quien llama.
2. **Un aviso suelto (webhook) no marca nada**: se verifica la firma y se **confirma con el proveedor**
   (`getCharge`) antes de tocar un pedido. Un webhook sin comprobar sería regalar mercancía.
3. **Idempotencia**: el mismo cobro no se marca dos veces.
4. **Sin proveedor conectado, el camino de siempre** (`manual`), que ya funciona.

**Prueba** (`pruebas/lb93a-pieza-de-cobro.cjs`, **TODO OK**, 14 comprobaciones): la lista dice que solo
está el cobro manual y **avisa de que no hay pasarela conectada**; abrir un cobro usa **el importe del
pedido** (12 000) y **mandar 1 XAF no cambia nada**; la referencia es `manual:LB-…` y queda pendiente sin
enlace de pago; la tienda **no** puede cobrar el pedido del comprador (`NOT_ORDER_PARTICIPANT`);
`maviance` **no está conectado** (`PAYMENT_PROVIDER_UNKNOWN`); el cobro manual no tiene webhook
(`PAYMENT_NO_WEBHOOK`); un webhook de un proveedor inventado se rechaza; **y ningún aviso suelto deja el
pedido cobrado** (sigue `pending`); un pedido ya cobrado no abre otro cobro (`PAYMENT_ALREADY_PAID`).

> **Un fallo por el camino, y el log lo dijo**: la primera versión pedía `o.currency` en la consulta del
> pedido… y **`lifebook.orders` no tiene esa columna**, así que **todos** los cobros devolvían
> HTTP 500 (8 comprobaciones en rojo). Corregido en `parche89b`: el comercio es XAF y ya está escrito en
> todas partes (`total_xaf`, `lbXaf`); la moneda se pone como constante, no se lee de una columna que no
> existe.

**Lo que falta para cobrar de verdad:** que el dueño cierre el acuerdo con un proveedor (es la §2.1 del
documento, y es **solo suya**: cuentas, contrato y comisión). Con el acuerdo hecho, conectar es una
tanda corta: el fichero del proveedor, su `clientId`/`secret` en `.env`, y probarlo con el modo de
pruebas que dé el proveedor.

---

## T.16 — El buscador: **ya existía** (tercera frase del documento que no era cierta) · HECHO (nada que hacer)

El punto 16 decía, en una línea: «**Buscador** — nuevo — Los favoritos ya existen; el buscador no». Y en
§A.7, fila 8: «falta buscador, una pantalla de favoritos fuera del perfil, y aviso de bajada de precio».

**Comprobado en el código y contra la API:**

* **La pantalla del catálogo TIENE buscador** (`app/lifebook-catalog.tsx`): caja con lupa y aspa para
  limpiar, texto «Busca producto, comida o servicio…», con retardo (debounce) y conectada a
  `commerceApi.catalog({ q })` — o sea, busca de verdad.
* **Y el servidor busca bien**: el catálogo filtra por **título, descripción corta, descripción larga,
  nombre de la TIENDA y nombre de la CATEGORÍA** (está en `listCatalog`, con su comentario explicando que
  antes solo miraba el título). Verificado por API en mis propias pruebas: `q=Camiseta` devuelve el
  producto ✓.
* Y hay **otra** búsqueda general (`app/lifebook-search.tsx`, desde la lupa del explorador) que busca
  **publicaciones, personas y temas** (con tendencias y sugerencias): esa **no** pide productos del
  comercio — el servidor sí sabe hacerlo, pero esa pantalla no lo pide.

**Lo que sí falta** de aquella fila de §A.7 (y no es el buscador): una **pantalla de favoritos fuera del
perfil** y el **aviso de bajada de precio**. Son dos añadidos de app, no arreglos de fondo, y van con la
tanda de pantallas pendientes (el panel de dinero de la tienda y el campo del reparto, que también tienen
el servidor hecho).

> **No he podido medirlo en pantalla**: el enlace directo a esa pantalla (`egrouteplan://lifebook-catalog`)
> **no navegó** (el volcado salió con 0 textos: la trampa ya conocida de que el enlace directo no siempre
> entra). Lo que sostengo es lo que **sí** está comprobado: el código de la pantalla y la búsqueda del
> servidor contra la API. La prueba en pantalla —escribir en la caja y ver los resultados— es del dueño,
> y es un minuto.

---

# RESUMEN DE LA §3 (estado al cerrar la ronda 11)

| # | Punto | Estado |
|---|---|---|
| 6 | Avisos del pedido | **mitad**: el chat medido y verificado; **el push bloqueado** por cuentas del dueño (Expo/Firebase) |
| 7 | Reseñas y disputas | **hecho**: estrellas en la app (medidas en pantalla) y motivo de la reclamación obligatorio |
| 8 | Ledger + liquidación | **hecho**: comisión congelada, libro de doble partida, saldo del vendedor y liquidación manual |
| 9 | Interfaz `PaymentProvider` | **hecho**: la pieza, con sus reglas, probada; el proveedor lo tiene que firmar el dueño |
| 10 | Agotados fuera del catálogo | **hecho** (catálogo, chips y contadores) |
| 11 | Reponer stock con tope | **era falso**: el fallo real (doble reposición) ya lo cerró el compare-and-set de la §1 |
| 12 | Idempotencia | **hecho**: huella del contenido y clave caducada |
| 13 | `order_no` único | **el índice ya existía** (el documento se equivocaba); el cálculo, arreglado |
| 14 | Cupón: `starts_at` al recoger | **hecho** |
| 15 | Cerrar el coste de envío | **hecho** (servidor): la tienda lo cierra y el libro lo anota |
| 16 | Buscador | **ya existía** (esta misma ficha) |

**Y sigue abierto, medido y sin arreglar:** con **8 compras simultáneas** la mitad fallan por tiempo de
transacción (5 s) — ver T.13. No es el número, no es el producto, no es el pool; **no se toca a ciegas**.

---

## T.17 — Las dos decisiones del dueño (18/09/2026) · HECHO (servidor)

Del documento `docs/DECISIONES-Y-SIGUIENTE-TRABAJO.md` (manda sobre los anteriores). Se han aplicado sus
**dos consecuencias inmediatas**, y las dos en el **servidor** (no solo en la pantalla: una pantalla se
puede saltar). `pruebas/parche90-decisiones.py`.

### Decisión 1 — El justificante es OBLIGATORIO para transferencia y facturación · HECHO

`markPaid` rechaza el cobro si el método es `transfer` o `billing` y no viene justificante
(**`PAYMENT_PROOF_REQUIRED`**, con el mensaje «Hace falta la imagen del comprobante para dar por cobrado
un pago por transferencia o facturación»). Contra entrega y pago en tienda **no se pide**: allí el dinero
se ve en mano (y esos dos ya quedan cobrados solos al entregar).

**Prueba** (`pruebas/lb94a-decisiones.cjs`): transferencia sin comprobante → **rechazada**; con comprobante
→ **cobrada** (201); facturación sin comprobante → **rechazada**; pago en tienda sin comprobante →
**admitido** ✓.

**Lo que queda de esta decisión (app):** que el botón **no deje continuar** sin la foto y lo diga, en vez
de dejar pulsar y contestar con un aviso. El servidor ya lo bloquea, así que **no se puede colar nada**;
es la mitad de comodidad, y va con la tanda de pantallas.

### Decisión 2 — La ventana de reclamación son 7 días desde la entrega · HECHO

* `dispute` se rechaza pasados 7 días desde `delivered_at` (**`DISPUTE_WINDOW_CLOSED`**), **en el
  servidor**.
* **Y a la tienda no se le paga antes de que venza:** el dinero que todavía se puede reclamar se cuenta
  aparte (`enEsperaXaf`/`enEsperaPedidos` en el saldo) y **no entra en lo que se liquida**; si se intenta
  liquidar solo eso, el error lo dice: **`SETTLEMENT_WINDOW_OPEN`** («Todavía no se le puede pagar: X XAF
  esperan a que venzan los 7 días para reclamar»).

**Prueba** (misma prueba + `pruebas/sonda-ventana.cjs`):

| Caso | Resultado |
|---|---|
| Pedido entregado **hoy**, reclamar | **se admite** (HTTP 200) |
| Pedido con la entrega puesta **10 días atrás** (por SQL), reclamar | **HTTP 422 `DISPUTE_WINDOW_CLOSED`** — «Ya han pasado los 7 días para reclamar ese pedido: habla con la tienda por el chat» |
| Saldo de la tienda con un pedido recién entregado | **pendiente 0 · en espera 22 080 XAF (2 pedidos)** |
| Intentar liquidar | **`SETTLEMENT_WINDOW_OPEN`** (dice que espera la ventana) |
| El mismo pedido, ya con 10 días | su dinero pasa a **pendiente 11 040 XAF** (ya se puede pagar) ✓ |

**Limpieza:** los pedidos de la prueba se cancelaron o se devolvieron a su estado, los asientos y
comisiones de prueba se borraron (0 asientos, 0 comisiones, 0 liquidaciones), la entrega que puse a mano
10 días atrás se devolvió a su fecha real, el stock volvió a **20** y no queda ningún pedido en
reclamación.

### Y lo siguiente, por decisión del dueño: las 4 pantallas

Siguiente trabajo (una cada vez, medida en pantalla): **1** panel de dinero de la tienda · **2** campo del
reparto · **3** favoritos fuera del perfil · **4** aviso de bajada de precio. El servidor de las dos
primeras ya está hecho y probado (T.8 y T.15).

---

## T.18 — Pantalla 1 de las 4: EL DINERO DE MI TIENDA · HECHA y medida en pantalla

Decisión del dueño (18/09/2026): «sin esto el vendedor no sabe si gana dinero dentro de la app». El
servidor ya lo sabía (T.8: comisión congelada por pedido + libro de doble partida), faltaba la puerta.

**Qué se ha añadido:**

| Fichero | Qué |
|---|---|
| `api/commerce.ts` | `commerceOrdersApi.saldo(shopId?)` + el tipo `LbSaldoTienda` |
| `app/lifebook-dinero.tsx` | La pantalla nueva: **lo que hay que cobrar** en grande, lo que está **en espera**, lo vendido (facturado · comisión · a pagar) y las **liquidaciones** |
| `app/lifebook-merchant.tsx` | El botón **«El dinero de mi tienda»** en el panel del comerciante (MI TIENDA), debajo de «Ver pedidos de la tienda» |

**Cómo está pensada (y por qué):**

* **Los números los calcula el servidor**: la pantalla no suma ni redondea nada, para que no pueda decir
  algo distinto del libro de cuentas.
* Lo primero que se ve es **«Pendiente de cobrar»**, que es a lo que el vendedor viene.
* **«En espera (7 días para reclamar)»** con su explicación escrita: «No se ha perdido: se paga después»
  — porque si no, parecería que la plataforma se ha quedado con el dinero (es la decisión 2 del dueño).
* Si la cuenta tiene **varias tiendas**, se cambia con chips sin salir de la pantalla.
* Si **no hay liquidaciones**, se dice qué falta («cuando venza la ventana de reclamación…») en vez de
  dejar la sección vacía.
* Se puede tirar hacia abajo para refrescar (el dinero cambia en el servidor).

**Medido en pantalla** (APK de 19:40, con la cuenta del móvil, que **sí tiene tienda**: «Tienda Admin
152394750»), abierto por enlace directo, **18 textos en el árbol**:

```
El dinero de mi tienda · Tienda Admin 152394750 · 0 pedidos entregados
Pendiente de cobrar 0 XAF · En espera (7 días para reclamar) 0 XAF · (la explicación)
Lo que has vendido: Facturado (productos) 0 XAF · Comisión de la plataforma 0 XAF · A pagar a tu tienda 0 XAF
Liquidaciones: «Todavía no se ha liquidado nada. Cuando venza la ventana de reclamación…»
```

Los ceros son **correctos**: esa tienda no tiene ventas. Los **números con ventas reales** están
probados por API en `pruebas/lb87a-dinero.cjs` (comisión 960, a pagar 11 040, libro 14 000 = 11 040 +
960 + 2 000). Lo que se ha medido aquí es que **la pantalla abre, pide y enseña lo que responde el
servidor**, con sus filas y su aviso de la ventana.

> Detalle que se corrigió al verlo: la comisión salía como **«−0 XAF»** (un menos delante de un cero).
> Ahora solo lleva el menos cuando hay algo que restar.

**Lo que queda de esta pantalla:** nada obligatorio. (El botón para **liquidar** no está aquí a
propósito: liquidar es del **admin** —es el dinero de la plataforma—; la tienda ve sus liquidaciones, que
es lo que necesita.)

---

## T.19 — Pantalla 2 de las 4: EL CAMPO DEL REPARTO · HECHA y medida en pantalla

Decisión del dueño: el coste del envío tiene que **entrar en el total** y quedar anotado. El servidor ya
lo hacía (T.15: `PATCH /orders/:id/delivery-cost`, con el libro escribiendo `a_pagar_reparto`); faltaba
el campo en la app.

**Qué se ha añadido:** `commerceOrdersApi.cerrarReparto(id, deliveryCostXaf)` y, en el detalle del pedido,
una caja con el campo y el botón — **solo para la tienda**, y solo si el pedido **no está** entregado,
cancelado, en reclamación, cobrado, ni es recogida en tienda (las mismas reglas del servidor, dichas
antes de intentarlo).

**Medido en pantalla** (APK de 19:47, pedido `LB-260915-0094` con reparto de 1 500 XAF), bajando porque la
caja queda debajo de las acciones:

```
El reparto (Taxi o moto)
Ahora el comprador paga 1.500 XAF de reparto. Puedes cambiarlo antes de entregar.
[1500]  →  «Escribe el coste del reparto»
```

* La cabecera dice **de qué modo es el reparto** (`Taxi o moto`) y **cuánto paga ahora** el comprador —
  para que la tienda no cierre un precio sin saber el que hay.
* El botón **no se enciende** hasta que se escribe un importe, y cuando se escribe dice el número
  («Cerrar el reparto en 2.000 XAF»), no un «Aceptar» a ciegas.
* Si el reparto está a 0 (envío «a acordar»), el texto avisa: «Todavía no está cerrado: el comprador paga
  el pedido sin el reparto».
* El campo solo acepta números (se limpia lo que no lo sea y se corta a 6 cifras).

**Lo que queda de esta pantalla:** la prueba del botón **pulsado** la tiene que hacer el dueño con la
sesión de la **tienda** (la cuenta del móvil es admin: le deja *ver* la caja, y eso es lo que se ha
medido, pero **cobrar no es suyo** y el servidor lo rechazaría). El servidor está probado aparte:
`pruebas/lb91a-coste-de-envio.cjs`, 16 comprobaciones, con el libro cuadrando
(`caja 14 000 = a_pagar_tienda 11 040 + comisión 960 + a_pagar_reparto 2 000`).

> El pedido de la prueba (`LB-260915-0094`) se canceló y el stock volvió a 20.

---

## T.20 — Pantalla 3 de las 4: MIS GUARDADOS FUERA DEL PERFIL · HECHA y medida en pantalla

Encargo del dueño: «poder ver y gestionar los guardados sin entrar en tu perfil (hoy solo en la pestaña
«Colección» del perfil propio)». La API ya existía (`commerceApi.mySaved()` → `GET /commerce/my/saved`, y
`toggleSave`), así que era pantalla y puerta.

**Qué se ha añadido:** `app/lifebook-guardados.tsx` (la pantalla) y el **corazón** en la cabecera del
**catálogo** (`app/lifebook-catalog.tsx`), al lado del carrito — que es donde uno está mirando productos
cuando quiere volver a uno.

**Qué hace:** lista lo guardado con **precio, estado (nuevo/usado) y si es «a pedir»**; cada uno se abre
con un toque; y **se gestiona ahí mismo** con «Quitar» (el mismo corazón que los puso). Si no hay nada, lo
dice y explica cómo se guarda, con un botón al catálogo.

**Medido en pantalla** (APK de 19:51, enlace directo a `egrouteplan://lifebook-guardados`), **14 textos**:

```
Mis guardados · 3 productos
Zapatillas de prueba (número de calzado) · 25.000 XAF · Nuevo · a pedir · [Quitar]
Producto pedidos 224163567 · 10.000 XAF · Nuevo · a pedir · [Quitar]
Producto de otra tienda 224163567 · 5.000 XAF · Nuevo · a pedir · [Quitar]
```

**Dos cosas que decir sin adornos:**

* **Sin fotos, a propósito**: esta pantalla usa solo los campos que el servidor manda a `mySaved`
  (título, precio, estado). Las fotos están en la rejilla de la Colección del perfil, que usa otro
  componente; reutilizarlo aquí es una mejora clara para la próxima pasada, y **preferí no inventarme el
  nombre del campo de imagen** ni meter un `any` para adivinarlo.
* Al medirlo guardé/desguardé el producto de prueba `Camiseta de prueba` en la cuenta del móvil (el
  «corazón» es un interruptor): el estado se **restauró** después. Los 3 guardados que se ven son los que
  ya había en esa cuenta.

---

## T.21 — Pantalla 4 de las 4: AVISO DE BAJADA DE PRECIO · **NO hecha** (localizada, y digo por qué)

Encargo del dueño: «que el comprador se entere cuando baja el precio de algo que guardó — provocar una
bajada y ver el aviso». **No la he hecho**, y prefiero decirlo antes que dejarla a medias: lo que queda
de sesión no da para descubrir el mecanismo, migrar, parchear y **medirlo** con la regla de esta casa
(un cambio, una compilación, una medida). Lo que **sí** dejo hecho es el trabajo de localización, para que
la siguiente pasada empiece en el sitio exacto:

**Dónde se provoca la bajada (servidor).** `src/lifebook/commerce.service.ts`, en el `UPDATE` del
producto (≈línea 1380): se escribe `price_xaf = ${price}` y **el precio anterior ya está leído** en la
variable `p` (`p.price_xaf`). Ahí es donde hay que comparar: si `price < p.price_xaf` → es una bajada.

**El patrón a copiar (ya existe en casa).** Justo debajo de ese `UPDATE` está
`await this.avisarReposiciones(pid)`, que avisa a quien esperaba stock («avísame cuando llegue»). La
bajada de precio es **el mismo caso** con otro texto: hay que mirar cómo notifica ese ayudante (a qué
tabla y por qué canal) y copiarlo, en vez de inventar un canal nuevo. **No lo he leído entero**: es el
primer paso de la próxima pasada, no una suposición que pueda dejar escrita.

**Lo que habría que añadir (estimación corta y concreta):**

1. Una tabla `lifebook.price_drops` (`product_id`, `shop_id`, `price_before_xaf`, `price_after_xaf`,
   `created_at`) para que la bajada quede **registrada** y no solo avisada (si el aviso se pierde, el
   dato queda).
2. La detección en el `UPDATE` del producto y el aviso a **quien lo guardó** (`product_saves` / los
   seguidores), copiando `avisarReposiciones`.
3. En la pantalla T.20 (`app/lifebook-guardados.tsx`), **una línea por producto**: «Bajó de 25 000 a
   20 000 XAF», que es lo que el comprador quiere ver al volver a la lista. Con eso la pantalla 3 y la 4
   quedan juntas, que es como el dueño las usa.

**Lo que NO hay que hacer:** un aviso de bajada **no** puede inventarse comparando `old_price_xaf`, que es
un campo que el vendedor escribe a mano («antes 25 000») y no un registro de lo que pasó.

---

## T.22 — EL FALLO QUE TUMBABA LA APP (reportado por el dueño, 15/09) · ARREGLADO

**Lo que se veía:** al abrir la app salía una pantalla con **«Error al arrancar la app — Cannot read
property 'slice' of undefined»** y se quedaba ahí: la app **no arrancaba**.

**Lo que dijo el móvil** (volcado de la pantalla, sin preguntar a nadie):

```
TypeError: Cannot read property 'slice' of undefined
    at shortDate        (index.android.bundle…)
    at quePasaAhora     (…)
    at OrderCardEnChat  (…)      ← la tarjeta del pedido dentro del chat
```

**La causa exacta:** en `utils/datetime.ts`:

```ts
export function shortDate(iso: string, withYear = false) {
  const d = parseIso(iso);
  const mes = MONTH_LONG[d.getUTCMonth()].slice(0, 3);   // ← aquí
```

Cuando la fecha **no se puede leer**, `parseIso` devuelve un `Invalid Date`, `getUTCMonth()` es `NaN`,
`MONTH_LONG[NaN]` es `undefined` y el `.slice(0, 3)` revienta. Y como ese error salta al pintar la
tarjeta del pedido, **sube hasta el arranque** y deja la app inservible.

**El arreglo** (`utils/datetime.ts`): **una fecha que no se puede leer no puede tumbar la app**. Si el
`Date` es inválido, `shortDate` y `longDate` devuelven **vacío** — es lo honesto (no se enseña una fecha
inventada) y no se lleva la app por delante.

**Verificado en pantalla** (APK de 21:29): la app **arranca** (28 textos, el perfil del dueño con sus
negocios) y **el error de arranque ya no aparece**.

**Lo que queda por identificar (y no lo tapo):** *por qué* llegó una fecha ilegible a esa tarjeta. El
camino es `LbMessageOrderRef.deliveredAt` (lo que el servidor manda en la tarjeta del pedido) o lo que
construye la app al pintar el mensaje. El blindaje evita el daño, pero la causa merece una vuelta:
**el siguiente paso es registrar ese valor** (o mirar qué manda el servidor para un pedido entregado) y
decidir qué fecha debe enseñar la tarjeta.

**Nota de método:** este fallo **no lo habría cazado ninguna prueba de API** (era la pantalla). Salió
porque el dueño lo vio y el volcado del móvil lo dijo con nombre y apellido. Es el mismo camino que
encontró el «Ver el justificante» con XML.

---

## T.23 — «OTRA PANTALLA RARA»: la pantalla de ruta que no existe (reportada por el dueño) · ARREGLADA

**Lo que se veía** (volcado del móvil): `No pudimos abrir esa pantalla · Destino:
/lifebook-inbox?tab=likes`. No era una pantalla rota: era el **aviso de ruta no encontrada** de la app
—que existe para no romper nada— disparado porque **la navegación estaba mal hecha**.

**La causa:** se pasaba la ruta **con el filtro dentro del texto**:

```ts
irSeguro.libre('/lifebook-inbox?tab=likes')            // ✗ el ayudante seguro la rechaza
irSeguro.libre('/lifebook-inbox', { tab: 'likes' })    // ✓ así es como se usa en toda la app
```

El ayudante pide **ruta y parámetros por separado**; con el `?` dentro del texto, la navegación se
rechaza y el usuario acaba en «No pudimos abrir esa pantalla».

**Los sitios arreglados** (mismo error, siete navegaciones en dos ficheros):

* `app/lifebook-messages.tsx` — los tres botones de la bandeja (**Me gusta · Guardados**, **Seguidores**,
  **Comentarios y @**).
* `app/lifebook-merchant-gestion.tsx` — los cuatro atajos de «lo que falta» en el panel del comerciante
  (**agotado**, **pending**, **rejected**, **draft**): ahí la ruta viajaba en un campo `ruta: '…?f=…'` y
  ahora se parte en ruta + parámetros al pulsar (con su comentario, para que no vuelva a pasar).

**Verificado en pantalla** (APK de 21:38): la misma ruta abre **la Bandeja de verdad** —
`Notificaciones · Me gusta · Guardados · Seguidores · Comentarios y @` y las notificaciones con su
«Agradecer por mensaje» — **22 textos y sin el aviso de error**.

**Un detalle más que se ve en ese volcado, y que anoto:** los títulos de las notificaciones llegan con
una **entidad HTML literal** (`&#128196; fhfh`) en vez del icono 📄. Es un texto que manda el servidor ya
escapado: hay que mirarlo en el generador de notificaciones y decidir si se manda el emoji o nada, pero
**no se toca a ciegas**.

---

## T.24 — «SIEMPRE ME APARECE ESA PANTALLA» al entrar en el dinero de mi tienda · ARREGLADO

**Lo que pasaba:** el botón **«El dinero de mi tienda»** (y el **corazón** de guardados del catálogo)
llevaban **siempre** a «No pudimos abrir esa pantalla», aunque las dos pantallas **existen y funcionan**
(las medí yo por enlace directo en T.18 y T.20).

**La causa exacta**, en `constants/rutas.ts`: el ayudante de navegación de la app **no navega a ciegas**.
Tiene un **mapa de rutas** (`RUTAS`) y su validador rechaza cualquier ruta que no esté en él:

```
La ruta "/lifebook-dinero" no existe en el mapa de rutas.
```

Mis dos pantallas nuevas **no estaban en ese mapa** ✗ — el fichero de la pantalla existía y expo-router la
registraba, pero el ayudante seguro la rechazaba **antes** de navegar, y por eso salía siempre la pantalla
de error (con su destino y su botón de salida, que es lo que hace que no se rompa nada).

**El arreglo:**

```ts
// constants/rutas.ts
lifebookDinero:    { ruta: '/lifebook-dinero', params: [] },
lifebookGuardados: { ruta: '/lifebook-guardados', params: [] },
```

**Estado de la comprobación, sin adornos:**

* El arreglo está **compilado e instalado** (APK de 21:41) y el validador ahora **acepta** las dos rutas
  (es determinista: la ruta está en el mapa y no pide parámetros).
* **No he podido medirlo pulsando el botón**: el enlace directo al panel del comerciante
  (`egrouteplan://lifebook-merchant`) **no navegó** (el volcado salió con 4 textos: la trampa ya conocida
  de que el enlace directo no siempre entra). Así que la prueba del toque es del dueño: abrir **Mi tienda →
  El dinero de mi tienda**, y el **corazón** del catálogo.

**Lección para lo que venga, y la apunto aquí porque me ha pasado a mí:** **una pantalla nueva no está
"puesta" hasta que está en `RUTAS`.** Yo la medí por enlace directo (que no pasa por el ayudante) y di por
bueno algo que desde un botón no funcionaba. La próxima pantalla nueva: **añadir la entrada al mapa en el
mismo cambio**, y comprobarla **pulsando su botón**, no solo por enlace.

---

## T.25 — DOS LECCIONES CARAS DE ESTA TANDA (y el arreglo de las tres navegaciones del panel)

**1) Faltaba MÁS de lo que dijo mi primera búsqueda.** El aviso de ruta rechazada seguía saliendo con
`/lifebook-merchant-products?f=pending`: en `app/lifebook-merchant.tsx` había **tres** navegaciones con el
filtro dentro del texto (`?side=seller`, `?f=pending`, `?f=agotado`) y su `ir` local **no aceptaba
parámetros**. Mi primer barrido buscó solo con comillas simples y no las vio. Arreglado: `ir` acepta
parámetros y las tres llamadas los pasan aparte (el mapa de rutas **sí** tenía esas dos pantallas).

**2) ROMPÍ EL FICHERO Y EL BUILD LO INSTALÓ.** Al cambiar la línea del `ir`, el `\n` de mi reemplazo se
escribió **literal**, así que la definición quedó **comentada** dentro de una línea larga. El `tsc` lo
dijo (`TS2304: Cannot find name 'ir'`, seis veces)… y **el build siguió igual y me instaló esa versión en
el móvil**, porque `compilar-apk.ps1` **no comprueba tipos** y yo los encadené en el mismo comando.

> **REGLA QUE NO SE VUELVE A ROMPER: `npx tsc --noEmit` en 0 y SE MIRA; si hay una sola línea, NO se
> compila.** No encadenar `tsc; build` en el mismo comando: si el chequeo falla, el build ya ha arrancado.
> Se comprueba primero, y solo entonces se compila. Es la regla nº2 del documento de la §1 y me la salté.

**Estado:** el fichero está **reparado**, `tsc --noEmit` en **0**, y el APK bueno está **compilado e
instalado** (21:49). Verificado en pantalla al arrancar: la app **abre** y el **panel del comerciante**
pinta sus datos («Mi tienda · Gestión · Hotel Demo Malabo · ✅ Tienda verificada · 8 pedidos nuevos · 25
sin existencias · 17 sin leer · Caja · Cobrado hoy 180.000 XAF»).

**Lo que falta comprobar (dueño):** pulsar esos atajos del panel —«8 pedidos nuevos», «25 sin
existencias», «Ver pedidos de la tienda»— y el corazón de guardados; ahora llevan a su pantalla.

---

## T.26 — Tres cosas del dueño (15/09): monedero, chips de grupos y acceso a grupos

**1) EL MONEDERO NO ABRE · causa encontrada (no arreglado todavía)**

Diagnóstico en el móvil (enlace directo `egrouteplan://wallet`): la pantalla se queda en

```
Cannot GET /api/v1/mobility/kyc/submissions/me   [Reintentar] [Cerrar sesión]
```

* La app pide esa ruta en `api/kyc.ts:53` (`current: () => http.get('/mobility/kyc/submissions/me')`).
* **Esa ruta NO existe en el servidor** (no hay controlador de KYC en `src/mobility/`) → el servidor
  contesta 404 y **la pantalla muere**: el monedero depende de una verificación de identidad (KYC) que
  nunca se llegó a construir.
* **Arreglo recomendado (pequeño y sin inventar nada):** que el monedero **tolere** que esa llamada
  falle —abrir igual y decir «verificación pendiente»— en vez de quedarse en el error. Construir el KYC
  entero es otra tanda y necesita decisión del dueño (qué documento, quién revisa, dónde se guarda).

**2) LOS CHIPS DE «DESCUBRIR GRUPOS» SE VEN MAL (cortados/encimados) · localizado, sin tocar**

Están en `app/lifebook-groups.tsx`: hay **dos filas de chips** horizontales —ciudades (L201) y categorías
(L220, con una lista de categorías escrita a mano en L27)— y su aspecto lo decide `styles.chip`.
**No he tocado los estilos a ciegas**: la regla de esta casa es medir antes, y un cambio de maquetación
sin ver la pantalla es justo lo que rompe cosas. El siguiente paso es el método que ya ha funcionado tres
veces hoy: **volcar esa pantalla en el móvil y medir la geometría de los chips** (alto, ancho, si el texto
se corta) y arreglar con el número delante.

**3) UN BOTÓN DE ACCESO A «DESCUBRIR GRUPOS»**

Hoy existe **uno**: en `app/lifebook-messages.tsx:130` («Descubrir grupos»). El dueño quiere acceso desde
otro sitio («este panel debería tener un botón para acceder») — falta confirmar **desde cuál**; añadirlo es
una línea (`irSeguro.libre('/lifebook-groups')`).

---

## T.27 — EL MONEDERO, CERRADO (con un incidente feo mío en el camino) · 15/09 noche

**1) INCIDENTE: vacié `app/wallet.tsx`.** En la prisa por depurar, encadené tres `-replace` de PowerShell
en UNA línea; el tercero tenía una regex inválida (`<WebView` sin escapar), la asignación entera falló,
y el `Set-Content` siguiente **escribió la variable vacía sobre el fichero** → 3 bytes (solo el BOM).
Sin git, sin copia. **Lección grabada: NUNCA hacer `Set-Content` con un valor que pueda venir de una
cadena de `-replace` que puede lanzar; o se comprueba `$null`/vacío antes de escribir, o se usan
`.Replace()` literales encadenados con comprobación entre pasos** (así se arreglaron los ficheros antes,
y esta vez me salté mi propio método).

**2) RECONSTRUCCIÓN.** El fichero está rehecho y **declarado como reconstruido en su cabecera**: cabecera,
constantes, guarda de URLs, efecto KYC, aviso y JSX del WebView son literales de lecturas de la sesión;
`retryCheck`, `onMessage` y la UI de error se reescribieron en pequeño con el mismo contrato.
`tsc --noEmit`: 0. Compilado e instalado (APK de 22:49) **comprobando tipos ANTES** (regla de T.25,
cumplida esta vez).

**3) LAS TRES CAUSAS DEL MONEDERO, TODAS RESUELTAS:**
* *KYC 404 mataba la pantalla* → «servicio caído» ≠ «sin verificar»: abre con aviso (decisión del dueño:
  el monedero es parte del proyecto, no un proyecto aparte).
* *El panel de administración aparecía dentro* → el SPA viejo de `hk.egrouteplan.com/wallet/`; el dueño
  fijó la URL buena: `http://106.14.104.146/wallet/`.
* *Con la URL nueva no cargaba («No se pudo cargar el monedero»)* → el endurecimiento lo bloqueaba dos
  veces: `isAllowedUrl` exigía https y el host no estaba en la allowlist; y Android (API 28+) bloquea
  cleartext por defecto. Abierto **solo para esa IP** en `network_security_config.xml` + allowlist JS.

**Verificado en pantalla** (22:50): 28 textos con el contenido del SPA: «Hola, María · EN GARANTÍA
45.000 XAF · Recargar con agente · Retirar efectivo · Ruta del agente MBO-0042 · Actividad reciente ·
Inicio/Monedero/Garantía/Perfil».

**Avisos que dejo puestos, no tapados:**
* El JWT viaja a un SPA por **HTTP sin TLS** — cualquiera en la red puede interceptarlo. Permitido por
  orden del dueño y acotado a esa IP, pero **el monedero de verdad necesita https** antes de manejar
  dinero real.
* El SPA enseña datos de demo (María, MBO-0042, iPhone 13): si el dueño pedía cuentas reales, el login
  del SPA aún no está enchufado al backend — pendiente de que él lo pruebe.
