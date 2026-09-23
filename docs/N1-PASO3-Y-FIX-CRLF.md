# N1 · PASO 3 aplicado — y el hallazgo que bloqueaba los reembolsos (`.env` con CRLF)

> Para el otro agente. Fecha: 2026-09-12. Continúa `N1-transacciones.md` (que describe los 6 sitios) y
> cierra el paso 3, el único que quedaba. Incluye un defecto **que no era de N1** y que estaba dejando
> los reembolsos en 500 para todo el mundo, y los errores que cometí yo al medir, para que no se repitan.

---

## 1. Lo primero: los reembolsos no funcionaban, y no era por las transacciones

### El síntoma
La prueba de reembolso concurrente que escribí para el paso 3 devolvía **500 «Error interno» en las dos
peticiones** y **0 filas** en `wallet.billing_refunds`. El log del proceso:

```
[unhandled] PrismaClientKnownRequestError: Raw query failed.
Code: `22001`. Message: `ERROR: value too long for type character varying(3)`
    at /opt/mirror/app/src/billing/billing-adjustments.service.ts:237:31   ← INSERT INTO wallet.billing_refunds
```

### La causa, medida
`BILLING_CURRENCY` valía **`XAF\r`** (4 caracteres: X, A, F y un retorno de carro) en el proceso que
corre:

```
tr '\0' '\n' < /proc/<pid>/environ | grep BILLING_ | cat -A
  BILLING_CURRENCY=XAF^M$        ← ^M es el \r
grep -n 'BILLING' /opt/mirror/app/.env | cat -A
  23:BILLING_CURRENCY=XAF^M$     ← el .env está guardado con finales de línea de Windows
```

**26 de las 42 líneas** del `.env` tenían CR. Y el arranque es `set -a; . ./.env; set +a; pm2 restart
--update-env`: `source` **no quita el `\r`**, así que llega al entorno tal cual. Como
`wallet.billing_refunds.currency` es `varchar(3)`, el `INSERT` moría. Medido: la tabla
`wallet.billing_refunds` tenía **0 filas en toda su historia** y en el log no hay ningún error `22001`
anterior a hoy (ver la precisión sobre la antigüedad, más abajo).

### El arreglo (dos capas, porque el fichero se puede volver a guardar mal)
1. **El fichero**: copia previa en `/opt/mirror/app/.env.antes-crlf-20260912-122640` y conversión a
   finales de línea de Unix (`sed -i 's/\r$//'`, 26→0 líneas con CR, mismas 37 claves).
2. **El arranque**: nuevo `src/env-normalizar.ts`, importado **como primera línea de `main.ts`**, que
   quita los `\r` del entorno y avisa con los NOMBRES de las variables (nunca los valores: ahí hay
   credenciales). Tiene que ser lo primero porque media docena de constantes se calculan **al importar
   su módulo**; limpiarlo en `bootstrap()` llegaría tarde.

### Por qué la segunda capa no es paranoia
`(process.env.X ?? 'true') !== 'false'` evalúa a `true` si la variable vale `false\r`: **una bandera
puesta a «false» se lee como «true»**. Eso hoy no afecta a ecomerse (sus banderas no están en el
`.env`), pero es exactamente el pie de la próxima sorpresa si alguien vuelve a guardar el fichero con
Windows. También hay que saber que el mismo valor envenenado iba a
`billing_payment_intents.currency` desde `billing-gateway.service.ts:101` (ver §5).

### El mismo `\r` estaba rompiendo ADEMÁS todas las subidas de ficheros (medido)

No era solo el dinero. En el entorno del proceso, **26 de 42** variables llevaban `\r`, entre ellas
`MINIO_SECRET_KEY` y `JWT_SECRET`. Comprobado con el cliente que usa la app (`@aws-sdk/client-s3`, el de
`lifebook/media.service.ts`) y su mismo endpoint:

```
✔ secreto ACTUAL (sin \r): subida OK
✖ secreto con \r (el de antes): FALLA
```

El servidor MinIO (`docker inspect mirror-minio`) tiene `MINIO_ROOT_PASSWORD=a4cf08…8f$`, **sin `\r`**:
la app firmaba con otro valor, así que **toda subida a MinIO fallaba** (fotos de platos y documentos
KYC). Por eso el arreglo no es cosmético: repara esa vía. Comprobado de punta a punta por la ruta real
de la app, `POST /api/food/photo`:

```
{"url":"https://hk.egrouteplan.com/storage/food-photos/restaurants/<uuid>.jpg"}
HTTP 200 · 6070 bytes · bytes IDÉNTICOS a los subidos
```

(el objeto de prueba se borró después; en el bucket quedan las 27 fotos reales de platos, intactas).

⚠️ Dos consecuencias que hay que saber:

- **`JWT_SECRET` cambia de valor** (antes acababa en `\r`), así que **los tokens emitidos antes del
  reinicio dejan de valer**: hay que volver a iniciar sesión una vez. El refresh token va firmado con el
  mismo secreto, así que también. En la base no hay tabla de sesiones (0 filas): no hay nada que limpiar.
- **`KYC_KEK_HEX` NO cambia la clave derivada**: `Buffer.from(hex, 'hex')` ignora el `\r` final y produce
  los mismos 32 bytes (comprobado: misma longitud y mismo sha256). Los **43 documentos KYC** guardados se
  siguen descifrando.

Y una precisión sobre la antigüedad: `.env.bak-lb41` (7-sep) **ya tenía las mismas 26 líneas con CR**, así
que el veneno no entró hoy. Lo que sí se puede afirmar es que `billing_refunds` tiene **0 filas** en toda
su historia y que en el log **no hay ningún 22001 anterior a hoy**, o sea que no hay ni una prueba de que
un reembolso haya funcionado nunca; mientras el `.env` tuvo CRLF, no podía funcionar.

---

## 2. Paso 3 — `withTx` de `billing-adjustments.service.ts`

Aplicado según `N1-transacciones.md` §4, con dos decisiones propias:

| Pieza | Qué se hizo |
|---|---|
| `withTx` | `$executeRawUnsafe('BEGIN')` → `$transaction((tx) => fn(tx), { timeout: 20000, maxWait: 10000 })` |
| 8 helpers de BD | `db: Db = this.prisma` (los sitios que no se tocan siguen compilando) |
| 5 métodos | callback con `tx`; `this.prisma.$…` → `tx.$…`; cada helper recibe `tx` |
| `deactivateAcross` | **sin `db`**: no toca la base, llama a rental/work/intercity (§4 del documento) |
| `deactivateEntitlement` | mixto: `db` para lo suyo, `deactivateAcross` fuera |

**El tope de 20 s es deliberado.** El defecto por defecto de Prisma son 5 s y dentro de la transacción
se llama a otros módulos (`deactivateAcross`); dejar 5 s convertiría un reembolso legítimo algo lento en
un fallo, o sea arreglar una cosa rompiendo otra. El lock ya se retenía ese rato antes de N1: no empeora.

### Un escalón que me costó un ciclo de compilación (y ya está en las guardias)
La primera versión añadía `db` **siempre al final** de la firma. `ledger` acaba en `refCode?: string`,
así que al llamar `this.ledger(…, tx)` el `tx` caía en `refCode` y el build falló con
*«TransactionClient is not assignable to parameter of type 'string'»* (líneas 207 y 261). **El
parámetro opcional tiene que seguir siendo el último**: `db` va antes. El parche ahora comprueba la
**posición** del argumento (`args[índiceDeDb] === 'tx'`) en cada llamada, no solo que el texto esté.

### Medición antes / después (3 rondas × 3 reembolsos simultáneos sobre una orden de 100 XAF)

| | antes | después |
|---|---|---|
| rondas que devolvieron el dinero **dos veces** | **2 de 3** (200 XAF de una orden de 100) | **0 de 3** |
| respuestas típicas | `201 · 400 · 201` | `400 · 400 · 201` |
| conexiones «idle in transaction» con el lock retenido | 1 (bloqueaba incluso mi limpieza) | 0 |
| resultado de la prueba | 4/6 PASS | **6/6 PASS** |

Y los otros cuatro métodos, que el parche tocó y nadie había ejercitado (`lb43-smoke-ajustes.cjs`,
**19/19 PASS**): `userCancel` (cancelada + auditoría `cancel_order_self`), `reverseOrder` (reversada +
recibo `void` + **asiento −100 XAF** + entitlement `deactivated`), `voidReceipt` (repetir es idempotente;
el camino bueno anula y audita) y `adminCancel` (ver §4). Ningún 5xx, ninguna conexión colgada.

### Suites de no-regresión tras el reinicio
`puertas del hotel ✅` · `e2e-pedidos 49/49` · `contrato de la app 21/21` · salud `/api/food/restaurants`
y `/api/billing/plans` = 200.

---

## 3. Auditoría GLOBAL: N1 se puede dar por cerrado

`lb43-auditar-transacciones.cjs` recorre **todo `src/`** (115 ficheros .ts), localiza cada
`$transaction(` y mira **dentro del callback** (contando llaves, no con grep) si aparece
`this.prisma.$…`, que es justo el defecto que N1 cierra: una escritura que se cree dentro de la
transacción y sale por la conexión compartida del pool.

```
ficheros .ts revisados: 115
transacciones encontradas: 57
✔ ninguna transacción escribe por la conexión compartida y no queda ningún BEGIN suelto
```

Ni un `BEGIN`/`COMMIT`/`ROLLBACK` suelto en todo el código, y las 57 transacciones usan `tx`. La
medición de mecanismo del otro agente (5 secuencias a la vez, 4 de 5 escrituras sobrevivían a su
`ROLLBACK`) ya no tiene ningún sitio donde aplicarse.

---

## 4. Hallazgo pendiente de DECISIÓN (no lo he tocado)

`billing.controller.ts` declara **dos veces** la misma ruta:

```
línea 101   @Post('admin/orders/:id/cancel')  → billing.service.ts        (action 'cancel',  devuelve {message})
línea 182   @Post('admin/orders/:id/cancel')  → adjustments.adminCancel   (action 'cancel_order', idempotente)
```

NestJS se queda con la primera, así que **`BillingAdjustmentsService.adminCancel` no se ejecuta nunca
por HTTP**: es código muerto por duplicidad de ruta. Medido: la auditoría de esa llamada escribe
`cancel:pending_payment→cancelled`, no `cancel_order`. No es peligroso (las dos cancelan y auditan), pero
*cuál de las dos debe quedarse* es decisión de producto: la de `billing.service.ts` acepta más estados
(`ORDER_ACTIVE`); la de adjustments es idempotente y más estricta (`CANCELABLE`). Mientras no se decida,
la prueba se hace contra la que responde de verdad.

---

## 5. Lo que NO queda verificado (dicho claro)

- **Pago por pasarela**: `POST /api/billing/payments/session` responde **404 «Proveedor no encontrado o
  deshabilitado»**, así que no llega al `INSERT` y no se puede comprobar de punta a punta. Lo que sí está
  medido es que la moneda que iba a ese `INSERT` ya no lleva el `\r` y que la tabla
  `billing_payment_intents` tiene 0 filas históricas (ha sido un camino latente, no una avería en uso).
- **`voidReceipt` sobre una orden con entitlement activo**: se prueba el rechazo y el camino bueno, pero
  el camino bueno exige desactivar el entitlement a mano (es una orden de prueba). El rechazo con
  entitlement activo es intencionado y lo cambié yo en el paso 2: no lo he vuelto a medir.
- **M9** (`createOrder` de ecomerse no atómico: el cobro de Billing va por otra conexión) sigue **fuera
  de N1** y sin arreglar, según §8 del documento. El diseño acordado es el mismo: `db: Db = this.prisma`
  opcional en `createCustomAmountOrder`. Con las banderas actuales `ECOMMERSE_BILLING_ENABLED` **no está
  en el `.env`**, así que vale `true` por defecto: M9 es alcanzable hoy.

---

## 6. Mis errores de instrumento (para no repetirlos)

Los apunto porque cada uno me costó una tanda y son la clase de cosa que se repite:

1. **Un PASS por el motivo equivocado.** La primera prueba de stock dio «400 y 400, ganadoras=0» y lo leí
   como fallo del parche: era mi propia prueba, que restauraba el `stock` pero **no el `status`**, y el
   producto quedó `sold_out` con stock 1. Los dos pedidos murieron en «producto no disponible», que es un
   400 correcto y **no tiene nada que ver con la carrera**. Desde entonces la prueba comprueba la
   **precondición** (que el producto sea comprable AHORA) antes de medir.
2. **`o.id` en un JOIN**: `SELECT id … JOIN billing_plans` → *«column reference "id" is ambiguous»*. El
   error no se veía porque mi helper `sql()` se tragaba el `stderr`: parecía un fallo del servidor.
3. **`201`, no `200`.** NestJS contesta 201 a un POST. Seis FAIL de golpe con todo funcionando.
4. **Las formas de las respuestas no son las de Nest**: el error llega como
   `{"error":{"code":"HTTP_400","message":"…"}}` (hay un filtro global) y el éxito de crear una orden
   como `{message, order:{id}}`, no `{orderId}`. Mi primera versión «leyó» un motivo vacío.
5. **`limpiar()` desactivaba el plan** y, al llamarlo justo después de activarlo para barrer el residuo,
   lo dejaba en `active=false`: la creación de la orden devolvía 404 «Plan no encontrado». El orden de mis
   propias sentencias era el problema.
6. **Salto de línea dentro del SQL** que viaja en `-c "…"` → `syntax error at or near "\"`. Y peor: la
   consulta de conexiones huérfanas fallaba y su «0» se leía como PASS. Ahora el SQL se aplana y **un
   resultado vacío solo puede significar fallo**; el «no hay ninguna» devuelve una fila `0|-`.
7. **Un cuelgue no se mide colgándose**: la primera prueba de reembolso duró más que mi propio tope, se
   perdió toda la salida y el servidor quedó con una transacción abierta reteniendo el lock. Ahora cada
   petición lleva tope (20 s), la salida se escribe línea a línea en `/tmp/lb43-*.log`, y **antes de
   limpiar se sueltan las conexiones huérfanas** (solo las que están sobre `billing_orders`).
8. **Una sola tirada no demuestra una carrera**: dos peticiones dieron «201 y 201» (defecto) en una tanda
   y «201 y 400» (sin defecto) en la siguiente, simplemente porque en la segunda no llegaron a
   solaparse. Por eso la prueba son 3 rondas × 3 peticiones.

---

## 7. Ficheros, copias y hashes

| Fichero | md5 ahora | copia previa |
|---|---|---|
| `src/billing/billing-adjustments.service.ts` | `ca344e44797272d56c802c4d7064bc54` | `/opt/mirror/backups/billing-adjustments.service.ts.antes-n1-paso3-2026-09-12T04-34-00` |
| `src/billing/billing.service.ts` (paso 2) | `763493bbbec257bc16e5cc6cf5ee1e4c` | `…antes-n1-paso2-20260912-115928` |
| `src/ecomerse/ecomerse.service.ts` (paso 4) | `b27fff82d0ccceeb13be7d800121707a` | `…antes-n1-paso4-2026-09-12T04-05-56` |
| `src/food/food.service.ts` (paso 1) | `a4991c4c613b50c11a23828ec662a249` | — |
| `src/env-normalizar.ts` (nuevo) | `a20a108bb458be46751fd7d37b148b97` | — |
| `src/main.ts` (import primero) | `7e52b2edbdbda39dc9f194bf4e050f6d` | — |
| `.env` | convertido a LF | `/opt/mirror/app/.env.antes-crlf-20260912-122640` |

⚠️ **No desplegar `billing-adjustments.service.ts` desde una copia vieja**: la versión instalada es la
única con `$transaction` y con `db`/`tx` propagados. Si hay que tocarlo, partir de `ca344e44…`.

Estado de la base al cerrar: 0 órdenes del plan de prueba, plan `active=false`, 0 conexiones
`idle in transaction`, 11 órdenes de pago (las de siempre).

## 8. Herramientas nuevas (todas en `/tmp` del servidor y en `server-fix/`)

```
lb43-prueba-reembolso-rondas.cjs   la prueba del paso 3: 3 rondas × 3 reembolsos simultáneos
lb43-smoke-ajustes.cjs             los otros 4 métodos de adjustments, con su efecto en la base
lb43-auditar-transacciones.cjs     auditoría global: ninguna transacción escribe por this.prisma
lb43-parche-paso3.cjs              el parche, por regiones, con guardias (y modo previsualización)
lb43-aplicar-paso3.sh              md5 de partida → parche → build → reinicio → suites → prueba
lb43-aplicar-fix-crlf.sh           el .env a LF + env-normalizar + verificación de la moneda
lb42z2-prueba-stock.cjs            la prueba de stock del paso 4, con la precondición corregida
```
