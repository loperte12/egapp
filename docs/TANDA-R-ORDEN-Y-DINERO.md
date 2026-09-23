# TANDA R — EL PEDIDO Y EL DINERO (los 5 puntos de la §1 de la acción inmediata)

> **Para quién es:** el otro agente y el dueño. Es el registro de lo que se hizo, **con la prueba de
> cada cosa** y con lo que **queda pendiente** y por qué.
>
> **De dónde sale:** `docs/ACCION-INMEDIATA-PARA-EL-OTRO-AGENTE.md` §1 («lo que se hace hoy, por orden,
> y sin saltarse ninguno»). **Los 5 puntos quedan cerrados**, cada uno en su apartado: el 1 (la caja del
> código de entrega, medido en pantalla), el 2 (`sales_count`), el 3 (el código blindado), el 4
> (compare-and-set) y el 5 (cerrar el pago, con la decisión del dueño, **y la tienda ya puede marcar
> cobrado con justificante** desde la API, en el R.5b). Lo único que falta de todo esto es el **botón en
> la app** para marcar cobrado desde el móvil de la tienda.
>
> **Regla que se ha seguido:** un arreglo por parche, `npx tsc --noEmit` en 0 **antes** de emitir,
> `pm2 restart` después, y comprobación contra la API real antes de pasar al siguiente.

---

## R.2 — «N ventas» estaba muerto: `sales_count` nunca subía · HECHO

**Qué pasaba.** `lifebook.products.sales_count` existía, la ficha lo pinta («N ventas») y **no lo
tocaba nadie**: 116 productos a 0. Era la única señal honesta de que algo se vende, y estaba apagada.

**Arreglo** (`pruebas/parche76-ventas.py`): al pasar un pedido a `delivered` se suma **dentro de la
misma transacción** que el cambio de estado (`sumarVentas(tx, orderId)`), en las **dos** vías de
entrega —el código de contra entrega y el botón de la tienda—, y `confirmDeliveryCode` se metió en una
transacción para que no pueda quedar entregado sin su venta. No hay que restar nada al cancelar: un
pedido entregado ya no se puede cancelar.

**Prueba** (`pruebas/lb76a-ventas.cjs`, contra la API real): ventas 0 → 2 entregando por código → 3
entregando por botón; una segunda entrega da **HTTP 409 `INVALID_STATE_TRANSITION`** y las ventas no
se mueven. **TODO OK.**

---

## R.4 — Compare-and-set del estado: cancelar y entregar a la vez se pisaban · HECHO

**Qué pasaba.** `orderAction` **leía** el estado del pedido, validaba la transición y luego actualizaba
`UPDATE … WHERE id = …` **sin mirar el estado**. Dos cambios simultáneos pasaban los dos y el pedido
acababa en un estado que no correspondía a lo que hizo nadie.

**Arreglo** (`pruebas/parche77-compare-and-set.py`): el estado leído viaja **también en el `WHERE`**
(`AND status = ${o.status}`); si no cuadra, no se actualiza ninguna fila y se corta con
`ORDER_CHANGED` (422) en vez de pisar el cambio del otro. En `confirmDeliveryCode`, el `UPDATE` lleva
`AND status <> 'delivered'` (lo pedía el punto 3 y es la misma idea).

**Desvío consciente de lo que sugería el documento.** La §1 proponía copiar el patrón
`CASE WHEN p.status = ANY(cfg.from) THEN … ELSE status END` de `commerce.service.ts:1426`. Ese patrón
deja pasar el `UPDATE` sin enterarse de que ha perdido la carrera (la app no se entera de nada); con el
`AND status = …` **se detecta** y la app puede decir «el pedido cambió, vuelve a abrirlo». Es el mismo
compare-and-set, pero además avisa.

**Prueba** (`pruebas/lb77a-compare-and-set.cjs`, contra la API real). Ojo: la carrera no se puede
forzar desde fuera, pero **sí se puede medir su consecuencia** — sin el arreglo, cada cancelación que
leyó «created» devuelve su cantidad al stock:

* **8 cancelaciones simultáneas del mismo pedido**: gana **exactamente una**; las otras **7 contestan
  `ORDER_CHANGED`** (o sea: la ventana se ejercitó de verdad, no es teoría) y el **stock vuelve
  exactamente al de antes (20)**. Sin el arreglo habría quedado en **27**.
* **Carrera mixta** (el comprador cancela y la tienda acepta a la vez): gana una sola, el pedido
  acaba en el estado del que ganó y el stock cuadra con ese estado.
* **Regresión de la vía del dinero**: se repitió `lb76a` después del parche → las dos entregas y los
  contadores de ventas siguen **TODO OK** (entrega por código 201 `delivered`/`paid`, por botón
  `accept→prepare→ready→deliver`, y la segunda entrega rechazada con 409).

---

## R.3 — El código de entrega se podía probar sin límite · HECHO

**Qué pasaba.** El código de contra entrega son **4 dígitos** y `confirmDeliveryCode` comparaba y ya
estaba: **10 000 intentos seguidos**. Al acertar, el pedido pasa a `delivered` + `paid`. Con dinero
real, eso es la tienda marcando «entregado y cobrado» un pedido que el comprador nunca recibió.

**Arreglo.** Migración **`pruebas/78-intentos-codigo-entrega.sql`** (dos columnas nuevas en
`lifebook.orders`: `delivery_code_attempts`, `delivery_code_locked_until`) y parche
**`pruebas/parche78-codigo-de-entrega.py`**:

* cada fallo cuenta; al **5º fallo seguido** el pedido queda **15 minutos** sin admitir **ningún**
  intento;
* entregar bien deja el contador a **0** y el candado limpio;
* el candado se mira **antes** que el código. Esto es a propósito: si se dejara pasar el código
  correcto durante el bloqueo, el que prueba a ciegas seguiría probando sin freno y el candado no
  serviría de nada. Con esto, agotar las 10 000 combinaciones son **5 intentos cada 15 minutos ≈ 3
  semanas**, y el comprador se entera mucho antes.

**Prueba** (`pruebas/lb78a-codigo-de-entrega.cjs`, en 4 fases, con comprobaciones por SQL entre
medias):

| Fase | Qué se hizo | Resultado |
|---|---|---|
| 1 | 5 códigos equivocados seguidos y después **el correcto** | los 5 dan `DELIVERY_CODE_INVALID`; el correcto da **`DELIVERY_CODE_LOCKED`** y el pedido **sigue `created` / `on_delivery`** (ni entregado ni cobrado) |
| — | SQL, con el pedido bloqueado | `delivery_code_attempts = 5`, `locked_until = ahora + 895 s`, `bloqueado_ahora = t` |
| 2 | SQL caduca el bloqueo → **un fallo más** | se rechaza y **vuelve a bloquear al momento** (`attempts = 6`, otros 895 s) |
| 3 | SQL caduca el bloqueo → **el código correcto** | **HTTP 201 `delivered` + `paid`** (el candado caducado no estorba a una entrega buena) |
| 4 | Pedido nuevo, sin fallos previos | se entrega **a la primera** (el candado no estorba el camino normal) |
| — | SQL, tras entregar | `delivery_code_attempts = 0` y candado a `NULL` en los dos pedidos entregados |

**Lo que hay que decir sin adornos de este punto:**

* Los números (**5** fallos, **15** minutos) son una **decisión**, no un dato: están en una línea de
  `orders.service.ts` y se cambian en un minuto si el dueño quiere otra cosa.
* Durante el bloqueo se rechaza **también el código correcto**. Es lo que hace que sirva; el mensaje
  lo explica al vendedor («Espera unos minutos y vuelve a probar con el que te dé el comprador»).
* **No existe** ninguna función para generar un código nuevo, así que el mensaje **no la promete**.
* La app **no enseña** cuántos intentos quedan: el vendedor ve el mensaje del error. El mensaje llega
  tal cual porque el sobre de error del servidor (`{ error: { code, message } }`) se guarda en
  `ApiError.message` (`api/httpClient.ts:30-38`) y las pantallas enseñan `e.message`. **Sin comprobar
  en pantalla** (no había móvil).

---

## R.1 y R.5 — los dos últimos puntos de la §1 (hechos el mismo día)

### R.1 — la caja del CÓDIGO DE ENTREGA en pantalla · HECHO (medido el 15/09 con el móvil conectado)

Era la medición pendiente: **¿el comprador ve su código de entrega?** Se creó un pedido de prueba contra
entrega **en la cuenta del móvil** (`pruebas/lb75a-codigo-de-entrega.cjs crear` → pedido
**LB-260915-0018**, código **5826**), se abrió con `egrouteplan://lifebook-order/58819c9a-…` y se volcó
el árbol.

**Resultado: la caja está, con el número correcto.**

* **28 textos** en el árbol (el criterio del propio documento: con el fallo ~2, sano >15) y el marcador
  **`Pedido LB-260915-0018`** en la cabecera, que es lo que prueba que la pantalla es ésta y no una vieja
  (por enlace directo no siempre navega: hay que mirar el marcador antes de creerse la medida).
* Los textos de la caja: **«Lee este código a quien te entregue y paga en efectivo:»**, **`5826`** (el
  mismo que devolvió la API) y **«La tienda lo confirma y el pedido queda entregado y cobrado.»**, más
  `Pago · Efectivo contra entrega` y la nota del pedido.
* **Geometría sana** (pantalla 1080×2374): la frase ocupa x 94-985 · y 883-994, **el número va en grande
  (y 1018-1154, 136 px de alto)** y la explicación y 1178-1274. Nada fuera de pantalla ni a 0 px. Captura
  en `.tmp-compra/codigo-entrega.png`.
* Después se **canceló** el pedido (`LB-260915-0018` → `cancelled`) y el **stock volvió a 20** con
  `sales_count` a 0: no queda nada de esta prueba.

### R.5 — cerrar el pago · HECHO (con la decisión del dueño)

**El agujero, medido:** `LB-260915-0009` y `LB-260915-0015` estaban **entregados con
`payment_status = 'pending'`** y `paid_at` a `NULL`, porque **solo el efectivo contra entrega** cerraba
el pago. Un pedido pagado en tienda se quedaba pendiente para siempre: el vendedor no ve su caja y
ninguna comisión es verificable.

**La decisión (dueño, 15/09/2026):** se dan por **cobrados al entregar** los métodos que **se pagan al
recoger** —contra entrega y pago en tienda—; los demás (transferencia, facturación, depósito, monedero)
**no** se tocan, porque puede que el dinero no esté cobrado y darlo por cobrado sería inventarse un
ingreso.

**Arreglo** (`pruebas/parche79-cerrar-el-pago.py`): las dos condiciones del `UPDATE` de la entrega pasan
de `payment_method = 'cash_on_delivery'` a `payment_method IN ('cash_on_delivery','in_store')`.

**Prueba** (`pruebas/lb79a-pago-cerrado.cjs` + SQL), los tres casos:

| Pedido | Método | Al entregar la API dice | `paid_at` en la BD |
|---|---|---|---|
| `LB-260915-0019` | pago en tienda | **`paid`** | **sí** |
| `LB-260915-0020` | transferencia | `pending` (no se pasa de listo) | no |
| `LB-260915-0021` | contra entrega (con el código) | **`paid`** | **sí** |

**TODO OK**, stock y ventas restaurados a 20 / 0.

### R.5b — el justificante: la tienda marca cobrado lo que se paga por fuera · HECHO (servidor)

**Lo que faltaba de verdad:** con el R.5, contra entrega y pago en tienda se cierran al entregar, pero
una **transferencia, una facturación o un depósito** entran por fuera: se quedaban `pending` para
siempre y el vendedor no veía esa caja.

**Arreglo** (migración **`pruebas/79-justificante-del-cobro.sql`** + **`pruebas/parche80-justificante.py`**):
ruta nueva **`POST /lifebook/commerce/orders/:id/mark-paid`** (`{ proofUrl, note }`) y método
`markPaid`:

* **Solo la tienda del pedido** puede marcar (el comprador recibe `NOT_ORDER_PARTICIPANT`).
* Guarda **quién** lo marcó (`paid_by`), **cuándo** (`paid_at`), el **justificante**
  (`payment_proof_url`, tiene que ser un enlace `http(s)`) y una **nota** con la referencia
  (`payment_note`, máx. 300 caracteres).
* No se puede marcar un pedido **cancelado** (`ORDER_CANCELLED`) ni uno **ya cobrado**
  (`PAYMENT_ALREADY_PAID`): no se reescribe la fecha del cobro.
* El comprador **recibe el aviso en el chat** y **ve en su detalle** con qué se dio por cobrado
  (`paymentProofUrl`, `paymentNote`, `paidAt`): el rastro es de los dos.

**Prueba** (`pruebas/lb80a-justificante-del-cobro.cjs`, **TODO OK**, 14 comprobaciones):

| Caso | Qué se hizo | Resultado |
|---|---|---|
| A | la tienda marca cobrada una transferencia, con justificante y nota | HTTP 201 · `paid` · `paidAt` con fecha · justificante y nota guardados |
| B | marcarlo otra vez | `PAYMENT_ALREADY_PAID` |
| C | **el comprador** intenta marcarlo él | `NOT_ORDER_PARTICIPANT` |
| D | marcar cobrado un pedido **cancelado** | `ORDER_CANCELLED` |
| E | justificante que no es un enlace (`javascript:…`) | `PROOF_URL_INVALID` |
| F | sin justificante | se admite y queda a `null` (ver la decisión abierta) |
| G | un pedido de pago en tienda ya cobrado al entregar | `PAYMENT_ALREADY_PAID` (coherente con el R.5) |
| H | el comprador mira su detalle | ve `paid`, el justificante y la nota |

En la base de datos se comprobó el rastro (`paid_by`, `paid_at`, justificante y nota) y después se
dejaron los datos coherentes: los dos pedidos de prueba que se marcaron cobrados y luego se cancelaron
**se devolvieron a `pending`** (un pedido cancelado no puede figurar como cobrado), el stock volvió a
**20** y `sales_count` a **0**.

**Dos cosas que hay que decir sin adornos:**

1. **El justificante es opcional**, y es una **decisión que no me invento**: obligarlo bloquearía a una
   tienda que cobró en efectivo un depósito sin recibo. Si el dueño lo quiere obligatorio, es cambiar
   dos líneas de `markPaid` (está señalado en el parche) y volver a probar.
2. **Hallazgo nuevo, de esta prueba**: cancelar un pedido **ya cobrado** no toca el cobro. En una tienda
   de verdad eso es un **reembolso pendiente**, y hoy la app no tiene ese flujo (sí existe el patrón en
   Billing: `refunded`, `refund_status_partial`). Encaja con el punto de **devoluciones y disputas**, así
   que **no lo he inventado aquí**: va con ese punto.

**Lo que falta todavía de este punto:**

* El **botón en la app** para que la tienda marque cobrado (con la foto del justificante). El servidor
  ya lo acepta y está probado; sin el botón, la tienda no puede usarlo desde el móvil. Es lo siguiente.
* **34 pedidos** están entregados sin cobrar en la base de datos, y **no se arreglan solos** (el parche
  solo mira lo que se entregue a partir de ahora):
  * **31** son **pedidos viejos** (09-10/09) con `payment_method` a **NULL**: son de antes de que
    existiera la forma de pago, así que **no hay forma de saber cómo se pagaron**. Se quedan como están
    (tocarlos sería inventarse el dato); conviene que el dueño decida si los borra del histórico.
  * **2** son de mis pruebas de hoy **anteriores al parche** (`0009` y `0015`, pago en tienda) y **1** es
    de hoy a propósito (`0020`, transferencia, para comprobar que NO se da por cobrado).

---

## Datos de prueba que quedan (para no confundirlos con ventas de verdad)

* Pedidos de prueba en la cuenta del comprador de pruebas (`+240555000003`): **9 entregados**
  (`LB-260915-0008`, `0009`, `0014`–`0017`, `0019`–`0021`) y **12 cancelados** (`0001`–`0007`,
  `0010`–`0013` y `0018`). Los entregados **no se pueden cancelar** (un pedido entregado ya no se
  cancela): se quedan ahí. Todos llevan «PRUEBA» en la nota; el `0018` es el del código de entrega
  (se canceló y devolvió el stock).
* Producto «Camiseta de prueba»: **stock 20 y `sales_count` 0** (restaurado a mano por SQL tras cada
  prueba: ningún producto queda con ventas). **Ningún pedido queda bloqueado.**
* El cupón `PRUEBA135085` (10 %, mínimo 5 000 XAF) sigue **activo** para que lo pruebe el dueño.

## Trampa de trabajo (para el que venga detrás)

Con el ayudante de SSH, un `grep` con **comillas dobles** en el comando remoto parte el patrón por las
tuberías: `grep -n "uno\|otro"` acaba ejecutando `grep -n uno`, luego `otro` y luego otra cosa, y
**devuelve vacío como si no existiera el código**. Hay que usar **comillas simples dentro** del comando
remoto (o `grep -E` con el patrón entre comillas simples). Me ha hecho perder dos comprobaciones.

## Ficheros de esta tanda

* Parches: `pruebas/parche76-ventas.py`, `pruebas/parche77-compare-and-set.py`,
  `pruebas/parche78-codigo-de-entrega.py`, `pruebas/parche79-cerrar-el-pago.py`,
  `pruebas/parche80-justificante.py`.
* Migraciones: `pruebas/78-intentos-codigo-entrega.sql`, `pruebas/79-justificante-del-cobro.sql`.
* Pruebas: `pruebas/lb76a-ventas.cjs`, `pruebas/lb77a-compare-and-set.cjs`,
  `pruebas/lb78a-codigo-de-entrega.cjs` (por fases), `pruebas/lb79a-pago-cerrado.cjs`,
  `pruebas/lb80a-justificante-del-cobro.cjs`, `pruebas/lb75a-codigo-de-entrega.cjs` (medición en
  pantalla), `pruebas/sonda-stock.cjs` (solo lee).
* Captura de la caja del código: `.tmp-compra/codigo-entrega.png` (y el volcado
  `.tmp-compra/codigo-entrega.xml`).
* Copias de anclaje del servidor: `backend/server-src/orders.service.ts`.
