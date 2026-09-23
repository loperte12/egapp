# AUDITORÍA DE EXTREMO A EXTREMO — MÓDULO COMIDA RÁPIDA

**Fecha:** 2026-09-12
**Alcance:** cliente → restaurante → repartidor, incluido backend, base de datos y coherencia entre capas.
**Fuentes:** `D:\egapp` (frontend) y `D:\Users\nisang12\AppData\Local\Programs\DeepSeek Harness\server-snapshot\` (snapshot del backend en producción).

---

## 0. Cómo leer este informe

Tres advertencias sobre el método, para que no te fíes más de lo debido:

1. **El backend auditado es un snapshot, no el servidor.** Los ficheros en `server-snapshot\` son la copia de referencia local. Si alguien desplegó algo después, puede diferir. Los hallazgos de backend deben confirmarse contra el código real antes de actuar.
2. **Nada se ha ejecutado.** Esta auditoría es estática: lectura de código. No se ha consultado la base de datos, no se ha llamado a ningún endpoint, no se ha reproducido ningún bug en marcha. Cada hallazgo dice qué línea lo produce, no que se haya observado ocurriendo.
3. **Los hallazgos marcados `[verificado]` los leí yo directamente** en el fichero del servidor. El resto procede de la inspección delegada y cito la línea, pero no la he vuelto a leer una a una.

La severidad se ordena por un único criterio: **¿puede corromper datos o dinero de forma irreversible?** En un proyecto sin staging y con una sola app en producción —como describe tu protocolo— ese es el criterio que importa, no la estética ni la comodidad.

---

## 1. Resumen ejecutivo

El módulo está **mejor construido de lo que sugiere la lista de fallos**. La arquitectura monetaria es sólida, la validación es estricta y la autorización verifica propiedad en cada mutación. No hay ningún agujero por el que un usuario pueda manipular un precio.

Lo que sí hay es un grupo de **defectos que corrompen datos o dejan al usuario sin salida**, y todos comparten una raíz: el módulo creció pantalla a pantalla sin cerrar los caminos de error. Se puede pedir, se puede pagar, se puede cocinar y se puede entregar — pero **nadie puede cancelar nada**, y cuando algo falla a mitad, no hay vuelta atrás.

Recuento **tras las reclasificaciones y los despliegues del 2026-09-12**. Los siete
críticos originales ya no son siete: dos bajaron de severidad al verificarlos contra el
código real, y los demás están cerrados o resueltos por decisión del dueño.

| Severidad | Abiertos | Cerrados | Qué caracteriza al grupo |
|---|---|---|---|
| 🔴 CRÍTICO | 0 | **C2** ✅ concurrencia optimista · **C3** ✅ cancelación por rol · **C7** ✅ foto sin re-moderar · **C4** ✅ decisión del dueño (pedir cerrado con aviso + `scheduledFor`) · **C6** ✅ decisión del dueño (modelo de efectivo adoptado; falta el cierre semanal) | Corrompe estado, bloquea una función publicada, o deja dinero sin rastro |
| 🟠 ALTO | A1 · A2 · **A3** · A4 | **A5** ✅ índice · **A6** ✅ vía C3 · **A7** ✅ cerrado en vivo (C5) | Rompe la operación diaria; alguien se queda sin salida |
| 🟡 MEDIO | M1–M8 · **M9** (antes C1) · **M10** (nuevo) | — | Degrada la experiencia, o deja huecos de control y atomicidad |
| 🟢 BAJO | B1–B6 | — | Deuda técnica y detalles |
| ⚪ ESPERADO | 1 | — | Los campos del plato ya están desplegados (041); la nota histórica se conserva en §6 |
| 🆕 NUEVO | **N1** — transacciones rotas en 6 ficheros, 3 de pagos | — | Hallazgo posterior a la auditoría inicial; medido en vivo por el otro agente |

Los tres más urgentes que quedan abiertos: **N1** (dinero bajo carga), **A3** (el dueño no
se entera de que le ha entrado un pedido) y **M9** (factura huérfana; bloqueado por N1
porque toca el mismo módulo de pagos).

> **Correcciones a la versión inicial de este informe** (2026-09-12, al implementar el Lote 1):
>
> 1. **C1 era menos grave de lo que afirmé.** Escribí «dinero movido sin contrapartida»;
>    es falso. `createCustomAmountOrder` no cobra, crea una factura en estado pendiente
>    con deduplicación. **Reclasificado de CRÍTICO a MEDIO** (M9).
> 2. **El arreglo que proponía para C1 era incorrecto y se retira.** Recomendé copiar el
>    `BEGIN`/`COMMIT` de `assignRider`. Ese patrón **no garantiza atomicidad con Prisma**:
>    cada llamada puede tomar una conexión distinta del pool. Al verificarlo apareció un
>    defecto mayor y transversal, que se documenta como **N1** en §2bis.
>
> Las dos correcciones están ampliadas en `backend/server-patch/LOTE1-food-service.md` §4.

**El hallazgo más útil no es el que creía.** Al intentar arreglar C1 apareció N1: seis
ficheros del proyecto —dos de ellos del módulo de pagos— usan un patrón de transacción
que no transacciona. Está en §2bis y es más importante que C1.

---

## 2. Los defectos críticos

### ~~🔴 C1~~ → 🟡 M9. `createOrder` no es atómico — **RECLASIFICADO, ver corrección**

> **Este hallazgo se corrigió tras la auditoría inicial.** Se mantiene aquí por
> trazabilidad, pero su gravedad real es MEDIA y pasa a la sección 4 como **M9**.
> El arreglo que se proponía era incorrecto: ver **N1** en §2bis.

**Dónde:** `food.service.ts:264-274`

```
264  let billingOrderId: string | null = null;
265  if (d.paymentMethod === 'billing') {
266    const bo = await this.billing.createCustomAmountOrder(userId, 'food_purchase', total, 'food');
267    billingOrderId = bo.orderId ?? null;
268  }
269  const o: any[] = await this.prisma.$queryRawUnsafe(
270    `INSERT INTO wallet.food_orders (...)
```

**Qué pasa:** se crea la orden de cobro en la línea 266 y el pedido en la 269, sin
transacción que los envuelva. Si el INSERT falla, la orden de cobro queda sin pedido.

**Lo que dije mal:** afirmé que era «dinero movido sin contrapartida» y «no se revierte
solo». **Es falso.** `createCustomAmountOrder` (`billing.service.ts:163-184`) no cobra
nada: crea una fila en `billing_orders` en estado pendiente. El dinero solo se mueve
cuando el cliente sube un comprobante y un admin lo aprueba. Y hay deduplicación en las
líneas 170-176: si ya existe una orden abierta, devuelve la existente.

**Daño real:** una factura huérfana sin pagar. Visible en el panel de billing,
rechazable por un admin, reutilizable en un reintento. Molesta, no destructiva.

**Lo que dije mal (2):** «la solución ya existe en el mismo fichero, hay que copiar el
`BEGIN`/`COMMIT` de `assignRider`». Ese patrón **no funciona con Prisma**. Ver N1.

---

## 2bis. N1 — Hallazgo posterior: el patrón de transacción está roto en seis ficheros

### Qué encontré al intentar arreglar C1

Recomendé copiar el patrón de `assignRider` (`food.service.ts:484-500`):

```ts
await this.prisma.$executeRawUnsafe(`BEGIN`);
try {
  await this.prisma.$executeRawUnsafe(`INSERT ...`);
  await this.prisma.$executeRawUnsafe(`COMMIT`);
} catch (e) {
  await this.prisma.$executeRawUnsafe(`ROLLBACK`).catch(() => undefined);
  throw e;
}
```

**Eso no garantiza atomicidad con Prisma.** Cada llamada `$executeRawUnsafe` sobre el
`PrismaClient` puede tomar **una conexión distinta del pool**: el `BEGIN` se ejecuta en
una conexión, el `INSERT` en otra y el `COMMIT` en una tercera. Las sentencias no
comparten transacción.

Prisma exige una transacción interactiva, que sí fija una única conexión:

```ts
await this.prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe(`INSERT ...`);
});
```

### Alcance: no es un caso aislado

| Fichero | Líneas | Módulo | Estado |
|---|---|---|---|
| `food.service.ts` | 484, 496 | comida | ❌ patrón roto |
| `billing.service.ts` | 363, 384 | **pagos** | ❌ |
| `billing.service.ts` | 418, 452 | **pagos** | ❌ |
| `billing-adjustments.service.ts` | 33, 36 | **pagos** | ❌ |
| `ecomerse.service.ts` | 376, 461 | tienda | ❌ |
| `ecomerse.service.ts` | 609, 627 | tienda | ❌ |
| `ecomerse.service.ts` | 1218 | tienda | ✅ `$transaction` correcto |
| `intercity.service.ts` | 415, 512, 570, 581 | intercity | ✅ |
| `mobility.service.ts` | 114 | movilidad | ✅ |
| `mobility-auth.service.ts` | 119 | movilidad | ✅ |

El proyecto **conoce el patrón correcto** y lo usa en cuatro ficheros. En otros seis, no.

### Por qué es el peor tipo de defecto

Busqué `connection_limit` en la configuración del snapshot y no aparece: aplica el pool
por defecto de Prisma, con varias conexiones. Eso significa que el bug **es
intermitente**:

- Con una sola petición en vuelo, el pool suele reutilizar la misma conexión libre →
  `BEGIN`, `INSERT` y `COMMIT` caen en la misma → **funciona**.
- Con dos peticiones concurrentes, cada una toma una conexión distinta → **la
  transacción no existe** y un fallo a mitad deja datos a medias.

No se reproduce en pruebas manuales. Aparece bajo carga, y cuando aparece, corrompe.

### Por qué no lo arreglo en el Lote 1

Tres de los seis sitios están en el **módulo de pagos** (`billing.service.ts`,
`billing-adjustments.service.ts`) y dos en ecomerse. Arreglarlos bien exige:

1. Cambiar la firma de `createCustomAmountOrder` para que acepte el cliente
   transaccional (`tx`) — lo usa `food.service.ts:266` **y** `ecomerse.service.ts:432`.
2. Reescribir los seis bloques como `$transaction(async (tx) => {...})`.
3. Pasar `e2e-pedidos → 49/49`, `e2e-panel → 49/49`, `contrato → 21/21` y el resto de
   suites, porque toca dos módulos en producción.

Eso excede el Lote 1 que aprobaste y cruza la línea que tu propio protocolo marca para
los ficheros delicados. **Merece su propia parte de trabajo y tu decisión explícita.**

**Mi recomendación:** tratarlo como prioridad alta e independiente. Es más urgente que
C1 (que resulta ser medio) y afecta a más módulos que todo el Lote 1 junto.

---

### 🔴 C2. Carrera en las transiciones de estado: dos personas pueden avanzar el mismo pedido `[verificado]`

**Dónde:** `food.service.ts:338-370`

```
352  const next: Record<string, Record<string, string>> = {
353    owner: { placed: 'confirmed', confirmed: 'preparing', preparing: 'ready', ready: 'delivered' },
354    user:  { ready: 'delivered' },
355  };
356  if (next[as][o.status] !== status) {
357    throw new BadRequestException(`Transición inválida: ${o.status} → ${status}`);
358  }
...
368  await this.prisma.$executeRawUnsafe(
369    `UPDATE wallet.food_orders SET status=$2, ... WHERE id=$1::uuid`, orderId, status);
```

**Qué pasa:** la función **lee** el estado en la línea 342-344, lo **valida** en la 356 y lo **escribe** en la 368. El `UPDATE` final filtra solo por `id`, no por el estado que se leyó. Entre la lectura y la escritura, otro actor puede cambiarlo.

**Consecuencia real:** el dueño pulsa "confirmar" dos veces rápido, o el dueño y el cliente tocan a la vez. Ambos pasan la validación con el mismo estado antiguo y ambos escriben. El pedido salta estados o retrocede. Y como no hay `food_order_events` para las transiciones de cocina (solo se registran las de entrega), **no queda rastro de que ocurrió**.

**Arreglo:** una cláusula más en el WHERE. `WHERE id=$1 AND status=$3` con el estado leído, y comprobar que la fila afectada sea 1. Si es 0, alguien llegó antes: error de conflicto. Es un cambio de dos líneas.

---

### 🔴 C3. El estado `cancelled` es inalcanzable: nadie puede cancelar nada `[verificado]`

**Dónde:** `food.service.ts:351-355`

```
351  if (o.status === 'cancelled') throw new BadRequestException('Pedido cerrado');
352  const next: Record<string, Record<string, string>> = {
353    owner: { placed: 'confirmed', confirmed: 'preparing', preparing: 'ready', ready: 'delivered' },
354    user:  { ready: 'delivered' },
355  };
```

**Qué pasa:** la tabla de transiciones **no contiene ninguna entrada que produzca `cancelled`**. Ni para el cliente, ni para el dueño, ni para el repartidor. La línea 351 trata `cancelled` como estado terminal —o sea, el código sabe que existe— pero no hay forma de llegar a él.

El DTO lo acepta (`food.dto.ts:87`) y la base de datos lo permite en su CHECK. **Tres capas lo contemplan y la única que decide no.**

**Consecuencia real, y es la peor de todas por alcance:**

- Un cliente que se equivoca al pedir **no puede cancelar**. Tiene que llamar al restaurante.
- Un restaurante al que le entra un pedido que no puede servir —plato agotado, local cerrado, error— **no puede rechazarlo**. El pedido se queda en `placed` para siempre.
- Un repartidor que abandona deja el pedido **colgado sin salida**.
- El filtro "cancelados" de `food-orders.tsx` **siempre devolverá vacío**, porque ningún pedido puede llegar a ese estado.

Combinado con C4 (el horario no bloquea pedidos), el escenario es: un cliente pide a las 3 de la mañana a un restaurante cerrado, el pedido entra, el dueño lo ve al abrir, no puede rechazarlo, el cliente no puede cancelarlo, y queda un pedido fantasma en el sistema con un cobro asociado.

Este es el defecto con mayor impacto operativo de toda la auditoría, aunque no mueva dinero directamente.

---

### 🔴 C4. El horario de apertura no impide pedir: es solo decorativo

**Dónde:** `food.service.ts:238-241`

```
238  const rest: any[] = await this.prisma.$queryRawUnsafe(
239    `SELECT id, business_name, phone_contact, city FROM wallet.food_restaurants
240     WHERE id=$1::uuid AND status='active' LIMIT 1`, d.restaurantId);
241  if (!rest[0]) throw new BadRequestException('Restaurante no disponible');
```

**Qué pasa:** `createOrder` valida que el restaurante esté `active`. **Nunca consulta `isOpen`**, aunque el servidor lo calcula (`computeIsOpen()`, `food.service.ts:714-736`) y lo sirve en el listado.

**Consecuencia real:** el badge verde/rojo de "abierto/cerrado" en `food.tsx:309-316` es información, no control. Se puede pedir a un restaurante cerrado. El checkout lo reconoce con honestidad —"tu pedido quedará en cola" (`food-checkout.tsx:163-167`)— pero eso traslada el problema al dueño, que según C3 **no puede rechazar el pedido**.

Los dos defectos se refuerzan: el sistema deja entrar pedidos que no se pueden servir y no permite cerrarlos.

---

### ~~🔴 C5~~ → 🟠 A7. El repartidor no sabe si debe cobrar — **RECLASIFICADO, ver corrección**

> **Corregido tras leer el backend desplegado** (`server-fix/descargas/food.service.ts`).
> Afirmé que esto corrompía la contabilidad del repartidor. **Es falso**: el servidor
> sí lo bloquea. Pasa de CRÍTICO a ALTO porque el daño es real pero de otro tipo.

**Dónde:** `riderMe` no selecciona `payment_method` (`descargas/food.service.ts:633-642`),
`mapDelivery` no lo devuelve (`:1031-1040`) y `FoodDelivery` no lo declara
(`api/food.ts:150-157`).

**Lo que dije mal:** escribí que el repartidor podía anotar un cobro en un pedido ya
pagado y que esa cifra alimentaba el ledger y el cierre semanal. **El servidor lo
impide** en `descargas/food.service.ts:532-534`:

```ts
// Un pedido pagado por Billing NO se cobra en la puerta: si el repartidor anota dinero ahí, es un
// error de dedo y hay que pararlo antes de que acabe en su liquidación.
if (o.payment_method === 'billing' && efectivo > 0) {
  throw new BadRequestException('Ese pedido ya estaba pagado: no hay nada que cobrar en la puerta');
}
```

La contabilidad está protegida. Bien hecho por quien lo escribió.

**El daño real, que sigue siendo grave:** el repartidor llega a la puerta **sin saber
si debe cobrar**. Nada se lo dice antes de intentarlo. Si el pedido era Billing y cobra
igualmente, el servidor rechazará su anotación *después* — pero **el cliente ya soltó
el dinero dos veces**. La plataforma no registra ese doble cobro, porque nunca llega al
ledger.

Es un defecto de información con consecuencia monetaria para el cliente, no de
integridad de datos. Tiene además un coste operativo: el repartidor solo descubre que
el pedido ya estaba pagado al recibir un error, en la puerta y con el cliente delante.

**Arreglo:** añadir `payment_method` a la consulta de `riderMe`, a `mapDelivery` y al
tipo `FoodDelivery`, y mostrarlo en la tarjeta de entrega antes de llegar. Ver
`backend/server-patch/C5-rider-payment-method.md`.

> ✅ **CERRADO (2026-09-12, 10:10).** Aplicado el backend por el otro agente y el
> frontend por esta parte. Verificado en vivo con **entregas reales de los dos métodos
> de pago** —que es lo único que prueba el arreglo, porque el defecto solo se ve en el
> caso `billing`: `7/7 PASS`, 0 de 2 entregas sin el dato. `BUILD_EXIT=0`, 0 errores TS.

---

### 🔴 C6. No existe liquidación ni conciliación de lo que cobran los repartidores

**Dónde:** ausente en base de datos, backend y frontend. Lo reconoce el propio código en `food-rider.tsx:12-13`: *"modelo de pago al rider queda pendiente de su ronda de monetización"*.

**Qué pasa:** los pedidos `cash` los cobra físicamente el repartidor. No hay ninguna tabla, campo ni endpoint que registre:
- cuánto cobró cada repartidor
- cuánto debe rendir a la plataforma o al restaurante
- cuándo se liquidó

Lo único que se contabiliza es `deliveries_count` (`food.service.ts:541-543`): cuántos viajes hizo, nunca cuánto dinero pasó por sus manos.

**Consecuencia real:** el dinero en efectivo de los pedidos sale del cliente, pasa por el repartidor y **desaparece del sistema**. No hay forma de saber si llegó al restaurante. Con un solo repartidor de confianza esto aguanta; con tres, es imposible de auditar.

Es un hueco de modelo de negocio, no un bug de código, pero es el más caro de los siete a medio plazo.

---

### 🔴 C7. Cambiar la foto de un plato aprobado es imposible — y el frontend promete lo contrario

**Dónde:** `api/food.ts:154-159` contra `food.service.ts:187`

El frontend:
```
154  /** La FOTO de un plato se pone o se cambia cuando haga falta: el servidor lo permite en
155   *  cualquier estado y, si SOLO cambia la foto, el plato NO vuelve a revisión ni pierde su
156   *  estado. Es lo único que se puede tocar fuera de la moderación, porque no cambia lo que se
157   *  vende: cambia cómo se ve. */
158  setItemPhoto: (id: string, photos: string[]) =>
159    http.put<{ message: string }>(f(`/food/menu/${id}`), { photos }, true),
```

El backend, en el mismo endpoint:
```
187  if (rows[0].status !== 'rejected') throw new BadRequestException('Solo se editan ítems rechazados');
```

**Qué pasa:** el comentario del frontend describe un comportamiento que **el backend no implementa**. `PUT /menu/:id` rechaza cualquier edición si el plato no está en `rejected`. Un plato `active` no puede cambiarse de foto.

**Consecuencia real:** el dueño toca "cambiar foto", la sube, y recibe *"Solo se editan ítems rechazados"*. La función está rota en producción. Y el comentario induce a error a quien lea el código después —exactamente lo que pasó en esta auditoría: el diseño es correcto, la implementación no lo sigue.

**Arreglo:** o se añade la excepción en el backend (si solo cambia `photos`, no se toca `status`), o se corrige el comentario y se quita el botón. La primera opción es la que el diseño pedía.

---

## 3. Defectos altos

### 🟠 A1. El precio que ve el cliente no se revalida antes de cobrar

`food-checkout.tsx:198` muestra un total calculado con el snapshot local del carrito (`food-checkout.tsx:58`). El servidor **sí** recalcula desde la base de datos (`food.service.ts:256`), que es lo correcto —el cliente no puede manipular el precio, y eso está bien hecho.

El problema es de comunicación: si el dueño cambió el precio entre "añadir al carrito" y "confirmar", el cliente ve X en pantalla y se le cobra Y. El pedido se crea igual, sin advertencia.

No es un agujero de seguridad, es una fuente de disputas. Arreglo: recargar precios al entrar en checkout y avisar si difieren.

### 🟠 A2. Sin clave de idempotencia en `createOrder`

`api/food.ts:162-163` no envía `Idempotency-Key`, aunque otros módulos del proyecto sí lo hacen (`api/ecomerse.ts:104-105`) y el módulo de hotel también (`reserve`, en `api/hotel.ts`).

El botón se deshabilita y hay un `busyRef` (`food-checkout.tsx:50,53,96`), que cubre el doble toque. No cubre el reintento de red: si la petición sale, el servidor la procesa y la respuesta se pierde, el cliente reintenta y **se crea un segundo pedido**.

Es el mismo patrón que ya está resuelto en dos módulos hermanos. Falta aplicarlo aquí.

### 🟠 A3. El dueño no recibe ningún aviso de pedido nuevo

No hay push, no hay WebSocket, no hay polling. Solo pull-to-refresh manual (`food-orders.tsx:125-138`) y recarga al volver a la pantalla.

Un restaurante con la app en segundo plano **no se entera de que le ha entrado un pedido**. En comida rápida, donde la expectativa es de minutos, esto es el cuello de botella de todo el flujo. Los SMS existen para el repartidor y el cliente (`food.service.ts:506,548`) pero **no para el dueño**.

### 🟠 A4. No hay cancelación, reasignación ni timeout de entregas

Complementa C3. Una vez asignado el repartidor, `assignRider` bloquea la reasignación si ya hay `rider_id` (`food.service.ts:479`) y no existe endpoint para desasignar.

Si el repartidor abandona, tiene un accidente o simplemente no aparece, el pedido queda en `assigned` o `in_transit` **de forma indefinida**. Solo un administrador tocando la base de datos a mano puede resolverlo.

### 🟠 A5. Falta índice en `food_orders.status` `[verificado]`

Los índices que existen en `030_food.sql`:
```
48  idx_food_restaurants_status   (status)
67  idx_food_menu_restaurant      (restaurant_id, status)
88  idx_food_orders_user          (user_id, created_at DESC)
89  idx_food_orders_restaurant    (restaurant_id, created_at DESC)
115 idx_food_reports_status       (status, created_at DESC)
```

Las tablas hermanas **sí** indexan por estado; `food_orders` no. Y el filtro más usado del panel del dueño es precisamente por estado (`food-orders.tsx:52-57`: `open`/`delivered`/`cancelled`).

Hoy, con 1 pedido en la base, no se nota. Con 10 000, cada apertura del panel hace un recorrido secuencial completo. Es un arreglo de una línea y conviene hacerlo antes de tener tráfico, no después.

### 🟠 A6. El cliente no puede cancelar su propio pedido

Consecuencia directa de C3, pero con entidad propia: `USER_NEXT` en `food-orders.tsx:49-51` solo permite `ready → delivered`. No hay ninguna acción de cancelación para `placed`, `confirmed` o `preparing`.

---

## 4. Defectos medios

| # | Hallazgo | Evidencia | Consecuencia |
|---|---|---|---|
| M1 | **El cliente puede marcar `delivered` él solo** | `food.service.ts:354` — `user: { ready: 'delivered' }` | Cierra el pedido sin que el repartidor confirme la entrega. Ante una disputa, no hay forma de saber quién cerró qué |
| M2 | **Plato desactivado invisible en el carrito** | `state/food.ts` persiste sin revalidar; `food-menu.tsx:87-90` filtra por restaurante, no por `available` | El cliente descubre en checkout que un plato ya no existe. Error genérico del servidor |
| M3 | **`trackingCode` no se muestra al cliente** | Existe en `FoodDelivery` (`api/food.ts:119`); el tipo `FoodOrder` (`api/food.ts:96-98`) no lo incluye | Se genera un código de seguimiento que solo ve el repartidor. El cliente no puede verificar la entrega |
| M4 | **Un dueño puede leer pedidos de otro restaurante** | `food.service.ts:347-350` — verifica `isUser OR isOwner`, sin comprobar que el dueño lo sea **de ese** restaurante | Viola el mínimo privilegio. Riesgo bajo porque requiere conocer el UUID, que no es secuencial |
| M5 | **Sin coste de envío configurable** | `delivery_km` existe (`030_food.sql:38`); `delivery_fee` no existe en ninguna tabla | El reparto es gratis por omisión. El restaurante asume el coste sin poder repercutirlo |
| M6 | **Sin validación de distancia real** | El cliente elige `pickup`/`delivery` libremente en `food-checkout.tsx` | Se puede pedir entrega fuera del radio declarado. `delivery_km` es informativo |
| M7 | **SMS fire-and-forget sin registro** | `void this.sms.send(...)` en `food.service.ts:506,548` | Correcto que no bloquee el pedido. Incorrecto que si falla no quede rastro: soporte no puede saber que el cliente nunca recibió el aviso |
| M8 | **El panel del dueño no tiene gestión de inventario** | Los endpoints `myRooms`/`saveCalendar`/`dayBook` existen para hotel; para comida no hay métricas, histórico, exportación ni pausa temporal | El restaurante no puede ver sus ventas ni pausar el local sin borrar platos uno a uno |
| M9 | **`createOrder` no es atómico** (antes C1, reclasificado) | `food.service.ts:264-274` — crea la orden de billing en 266 y el pedido en 269, sin transacción. Si el INSERT falla, la orden de billing queda huérfana | **Factura huérfana sin pagar**, visible y rechazable por admin. No es dinero perdido: `createCustomAmountOrder` no cobra, solo crea una orden pendiente (`billing.service.ts:163-184`). Deduplicación en 170-176. Su arreglo requiere tocar el módulo de pagos → ver N1 |
| M10 | **Repartidores homónimos indistinguibles al asignar** *(hallado por el otro agente, 2026-09-12)* | Dos repartidores activos con el nombre exacto «Bernardo loperte». El dueño busca por texto y asigna al equivocado | Pedido entregado por la persona incorrecta. La asignación usa `rider.id` (`food-orders.tsx:242`), así que **la app no asigna mal por sí sola**: el error lo comete el humano al elegir |

**Sobre M10 — el diagnóstico del otro agente tiene un matiz que cambia el arreglo.**

Su informe dice que en el modal de asignar «el dueño ve **dos nombres idénticos y nada
más**». Verificado: **no es así**. `activeRiders()` ya devuelve `zone` y
`deliveriesCount` (`descargas/food.service.ts:781-786`), y el modal ya los pinta
(`food-orders.tsx:413-416`):

```tsx
<Text style={{ fontSize: 11, color: colors.textSecondary }}>
  {r.vehicleType === 'moto' ? '🛵 Moto' : ... }
  {r.zone ? ` · ${r.zone}` : ''} · {r.deliveriesCount} entregas
</Text>
```

O sea, cada fila ya muestra vehículo, zona y nº de entregas. Si los dos «Bernardo
loperte» salieron idénticos **también** en esa línea, es porque comparten vehículo, zona
y contador — no porque la lista solo muestre el nombre.

**Consecuencia práctica:** añadir «teléfono o zona» no arregla nada si la zona ya está y
es igual. Lo que distinguiría de verdad a dos personas homónimas es un dato que hoy
`activeRiders()` **no** devuelve: el teléfono (`phone_contact` existe en
`wallet.food_riders`, pero no está en el SELECT de la línea 781). Y exponer el teléfono
del repartidor al dueño choca con la regla del proyecto de **no exponer teléfonos en
listados** (`PROTOCOLO-COEXISTENCIA.md`, y el patrón de `resolvePhones` que se usa solo
para el repartidor asignado a una entrega concreta).

Así que M10 no es un bug de una línea. Requiere decisión: o se muestra un identificador
no telefónico (p. ej. los 6 últimos dígitos del alta, o un alias que el repartidor
elija), o se acepta que los homónimos son indistinguibles en la lista y se fuerza al
dueño a confirmar por otro canal. Es la misma familia que B5, pero B5 es «sin filtro de
zona» y esto es «la zona no basta para distinguir».

---

## 5. Defectos bajos

| # | Hallazgo | Evidencia |
|---|---|---|
| B1 | Envío hardcodeado a "0 XAF" con texto "sin recargo por ahora" | `food-checkout.tsx:193-194` — cuando se active el cobro, será un cambio visible para todos los usuarios |
| B2 | Límite de precio inconsistente: 10 M XAF en cliente, 100 M en servidor | `food-owner.tsx:329` contra `food.dto.ts:60` — el cliente es más restrictivo, así que no hay daño, pero confunde |
| B3 | Zona horaria calculada a mano como UTC+1 | `food.service.ts:719` — `Date.now() + 60*60*1000`. Funciona para Malabo, que no tiene horario de verano. Frágil si se extiende a otra zona |
| B4 | Recalculo del rating medio sin protección de carrera | `food.service.ts:388` — dos reseñas simultáneas pueden dejar el promedio desviado |
| B5 | `activeRiders()` devuelve hasta 100 repartidores sin filtro de zona | `food.service.ts:557-564` — el dueño ve repartidores lejanos y no puede filtrar |
| B6 | No hay estado "suspendido" para repartidores | `032_food_riders.sql:27` — solo `pending`/`active`/`rejected`. Un admin no puede suspender temporalmente a un repartidor problemático sin rechazarlo de forma permanente |

---

## 6. Discrepancia esperada (no es un bug)

El frontend envía seis campos de detalle del plato —`ingredients`, `spiceLevel`, `portionSize`, `drinkIncluded`, `sides`, `prepMinutes` (`food-owner.tsx`, `api/food.ts:47`)— que **no están en los DTOs ni en el SQL del snapshot**.

Esto es correcto y esperado: son los campos de la **migración 041**, cuyos parches están escritos como documentación en `D:\egapp\backend\server-patch\041-A-food.dto.md` y `041-B-food.service.md` y **aún no se han desplegado**.

Hasta que se apliquen, Zod descarta esos campos en silencio y no se guardan. No es un fallo: es un despliegue pendiente. **Pero hay que saberlo**, porque si se despliega el frontend sin el backend, el dueño rellenará los detalles y se perderán sin ningún error visible.

---

## 7. Lo que está bien hecho y no debe tocarse

Diez decisiones correctas que conviene preservar explícitamente, porque varias de ellas son justo lo que falta en los puntos críticos:

1. **El dinero nunca viaja desde el cliente.** `createOrder` recibe solo `itemId` y `qty` (`food-checkout.tsx:100-107`) y recalcula el total desde la base de datos (`food.service.ts:256`). No hay forma de manipular un precio desde la app. Es la decisión de seguridad más importante del módulo y está bien.

2. **Todo el dinero es entero `bigint` en XAF.** Cero aritmética de punto flotante en toda la cadena. Sin errores de redondeo posibles.

3. ~~**`assignRider` usa transacción explícita**~~ — **RETIRADO.** Esta entrada
   afirmaba que `assignRider` (`food.service.ts:484-500`) era el modelo a copiar.
   Es falso: su `BEGIN`/`COMMIT` no garantiza atomicidad con Prisma. Ver N1 en §2bis.
   `assignRider` **también está afectado** por ese defecto y necesita arreglo.

4. **Snapshot JSONB de los ítems en cada pedido** (`030_food.sql:74`). Los pedidos históricos guardan nombre y precio del momento. Cambiar el menú después no corrompe el historial. Es la decisión de integridad mejor tomada del módulo.

5. **Validación Zod estricta sin `.passthrough()`.** Los campos no declarados se descartan. Superficie de ataque mínima y ningún error filtra stack traces ni nombres de tabla.

6. **Verificación de propiedad en cada mutación del dueño y del repartidor.** `requireActiveRestaurant()` (`food.service.ts:663-678`) y `WHERE d.rider_id=$2::uuid` (`food.service.ts:520`). Nadie modifica lo ajeno —salvo el caso concreto de M4.

7. **El SMS no bloquea la operación.** `void this.sms.send(...)` — si el proveedor falla, el pedido sigue adelante. Decisión correcta; solo falta el registro (M7).

8. **Puerta de cobro antes de cocinar.** El dueño no puede confirmar un pedido Billing hasta que el comprobante esté aprobado (`food.service.ts:361-367`). Evita cocinar sin cobrar, y el botón se oculta en la UI (`food-orders.tsx:421`).

9. **Un pedido = un restaurante**, con validación dura en el store (`state/food.ts:60`) y diálogo de confirmación (`food-menu.tsx:54-62`). Elimina de raíz toda una clase de bugs de mezcla de carritos.

10. **Trazabilidad en `food_order_events`** (`032_food_riders.sql:53-63`) con actor registrado en cada evento. Existe la infraestructura de auditoría; solo falta usarla también en las transiciones de cocina.

Y un detalle de oficio que vale la pena señalar: en `food-menu.tsx:250-257`, cuando un plato no tiene foto, el código **no pone un dibujo de comida** —pone un hueco limpio con la categoría escrita. El comentario explica por qué: un dibujo ocupa el sitio de la foto y disimula que falta. Esa es la decisión correcta, y el razonamiento está documentado.

---

## 8. Plan de arreglo propuesto

Ordenado por riesgo, no por esfuerzo. Los cuatro primeros son cambios pequeños en el backend con efecto inmediato sobre datos y dinero.

### Lote 1 — Detener la corrupción de datos (backend, sin tocar el frontend)

| # | Arreglo | Fichero | Tamaño |
|---|---|---|---|
| 1 | ~~Envolver `createOrder` en transacción copiando `assignRider`~~ → **RETIRADO**: ese patrón no transacciona. Ver N1; requiere decisión propia porque toca el módulo de pagos | `food.service.ts:264-274` | Fuera de este lote |
| 2 | Añadir `AND status=$expected` al UPDATE de estado y comprobar filas afectadas | `food.service.ts:368-370` | 2 líneas |
| 3 | Añadir las transiciones a `cancelled` (cliente antes de `preparing`, dueño en cualquier estado no entregado) | `food.service.ts:352-355` | Pequeño |
| 4 | Crear índice en `food_orders.status` | nueva migración | 1 línea |

### Lote 2 — Cerrar los caminos sin salida

| # | Arreglo | Tamaño |
|---|---|---|
| 5 | Validar `isOpen` en `createOrder`, o decidir conscientemente que se permite pedir en cola y dar al dueño la forma de rechazar | Pequeño, pero requiere decisión de producto |
| 6 | Permitir cambiar la foto sin perder el estado aprobado (o retirar el botón y corregir el comentario) | Pequeño |
| 7 | Añadir `paymentMethod` a `FoodDelivery` para que el repartidor sepa si cobrar | Pequeño |
| 8 | Clave de idempotencia en `createOrder`, igual que en `ecomerse` y `hotel` | Pequeño |

### Lote 3 — Operación diaria

| # | Arreglo | Tamaño |
|---|---|---|
| 9 | Notificar al dueño de pedidos nuevos (el mínimo viable es polling cada 30 s en `food-orders.tsx`; push es otro proyecto) | Medio |
| 10 | Cancelación, reasignación y timeout de entregas | Medio |
| 11 | Registro de liquidación de efectivo por repartidor | Medio, requiere diseñar el modelo |
| 12 | Revalidar precios al entrar en checkout | Pequeño |

### Lo que no tocaría ahora

Coste de envío (M5), validación de distancia (M6), métricas del panel (M8) y mapa para el repartidor. Son funciones nuevas, no defectos, y ninguna corrompe datos. Merecen su propia decisión de producto —y M5 y M6 dependen de cómo resuelvas la monetización del reparto, que es lo mismo que C6 deja abierto.

---

## 9. Dos decisiones de producto que bloquean trabajo técnico

No son bugs y no puedo resolverlas leyendo código. Conviene decidirlas antes del Lote 2.

**1. ¿Se puede pedir a un restaurante cerrado?**
Hoy el sistema lo permite y el dueño no puede rechazarlo. Las tres salidas coherentes son: bloquear el pedido fuera de horario, permitirlo con aviso explícito de "queda en cola" y dar al dueño el botón de rechazar, o dejarlo como está y aceptar los pedidos fantasma. La segunda es la que mejor encaja con un mercado donde los horarios declarados rara vez se cumplen, pero exige arreglar C3 primero.

**2. ¿Quién cobra y quién liquida el efectivo?**
C6 no se arregla con código hasta que se decida el modelo: ¿el repartidor rinde al restaurante, a la plataforma, o se queda una comisión? ¿Con qué periodicidad? ¿Qué comprobante se emite? Sin esa respuesta, cualquier tabla que se diseñe será provisional.

---

## 10. Nota sobre el otro agente

El documento `ACCESO-Y-MIGRACION-COMIDA.md` asigna a otro agente la migración de este módulo a Life Book. Su §3.2 afirma que la app *«ya pinta»* los campos de `FoodItemDetails`.

Eso es incorrecto y conviene corregirlo antes de que construya encima: ese tipo lo añadí yo en esta sesión (`api/food.ts:47`) y **no hay ninguna pantalla que lo pintara entonces**. Ahora sí la hay —`food-owner.tsx` y `food-menu.tsx` se actualizaron después— pero en el momento en que se escribió ese documento, no.

La consecuencia práctica es positiva para los dos caminos: su §3.3 reconoce que `lifebook.products` **no tiene dónde guardar** estos campos. O sea, que si se migra, la migración 041 es paso previo obligatorio en cualquier caso. No es trabajo que se pierda por elegir una ruta u otra.

Lo que sí está ocurriendo es que ambos agentes leen y escriben sobre los mismos ficheros sin sincronizar. Antes del Lote 1 conviene acordar quién toca `food.service.ts`.

---

## Apéndice — Mapa del flujo auditado

```
CLIENTE                          RESTAURANTE                     REPARTIDOR
───────                          ───────────                     ──────────
food.tsx                         food-owner.tsx                  food-rider.tsx
  listar/buscar/filtrar            alta + KYC (mobility)           alta + KYC compartido
        │                          menú: crear/editar/foto         │
        ▼                                │                         │
food-menu.tsx                            ▼                         │
  ver menú + carrito             food-orders.tsx?as=owner          │
        │                          ver pedido entrante             │
        ▼                                │                         │
food-checkout.tsx                        ▼                         │
  pickup/delivery                placed → confirmed → preparing    │
  cash/billing                        → ready                      │
        │                                │                         │
        ▼                                └─── assignRider ────────►│
  createOrder                                                      ▼
        │                                                  assigned → picked_up
        ▼                                                    → in_transit
food-orders.tsx?as=user                                        → delivered
  placed → confirmed → preparing
        → ready → delivered ◄────── (M1: el cliente cierra solo)

  ✗ cancelled  ← inalcanzable desde cualquier rol (C3)
```

**Estados del pedido:** `placed`, `confirmed`, `preparing`, `ready`, `delivered`, `cancelled` (muerto).
**Estados de la entrega:** `assigned`, `picked_up`, `in_transit`, `delivered`.
**Estados del restaurante:** `pending`, `active`, `rejected`. Sin `paused`.
**Estados del plato:** `pending`, `active`, `rejected`, `sold_out`.
**Estados del repartidor:** `pending`, `active`, `rejected`. Sin `suspended`.
