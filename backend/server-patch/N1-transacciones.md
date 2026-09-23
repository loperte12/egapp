# PARCHE N1 · Transacciones reales en los seis sitios con `BEGIN`/`COMMIT` suelto

**Defecto:** N1 de `docs/AUDITORIA-COMIDA-RAPIDA.md`.
**Estado:** escrito, **no aplicado**. Requiere acceso al servidor y paso por las cuatro
comprobaciones de `PROTOCOLO-COEXISTENCIA.md` §5.
**Luz verde del dueño:** sí (2026-09-12).
**Coordinación:** el otro agente ya reclamó N1 como suyo («yo digo sí; ver §2» de
`lb42v-RESUMEN-PARA-EL-OTRO-AGENTE.md`) y tiene el arnés de medición
(`lb42t-n1.cjs`), la base de auditoría y el flujo de despliegue. **Este documento es
la especificación; quien lo aplique debe ser uno solo.** Ver §7.

---

## 1. El defecto, ampliado: son TRES fallos, no uno

La medición del otro agente ya lo estableció (`lb42t-n1.cjs`, sobre la base de auditoría):

```
sin carga : la tabla temporal SÍ se ve → el pool reutilizó la conexión → «transacciona» por casualidad
5 a la vez: las 5 secuencias cayeron en conexiones DISTINTAS (pids 28820/28821/28822/28824)
            y 4 de 5 escrituras SOBREVIVIERON a su propio ROLLBACK
```

Al leer los seis sitios encontré dos consecuencias más que **no estaban en mi informe
original** y que suben la gravedad:

### 1a. Los `SELECT ... FOR UPDATE` no protegen nada

`FOR UPDATE` bloquea la fila **hasta el fin de la transacción**. Sin transacción real,
cada sentencia corre en autocommit: el bloqueo se libera en cuanto termina el SELECT.

Esto afecta a **los dos flujos que mueven dinero de verdad**:

- `billing-adjustments.service.ts` — `getOrderForUpdate()` (`:44-49`) y
  `getReceiptForUpdate()` (`:51-56`), usados dentro de `withTx` en **5 métodos**:
  `adminCancel`, `userCancel`, `reverseOrder`, `refundOrder`, `voidReceipt`.
- `ecomerse.service.ts` — el `FOR UPDATE` sobre productos en la creación de pedido
  (bloque que empieza en `:376`), que es justo lo que impide vender más stock del que hay.

**Caso concreto de daño, en `refundOrder` (`:212-264`):**

```
línea 213  const order = await this.getOrderForUpdate(orderId);   ← el lock no dura
línea 223  const refunded = await this.getRefundedAmount(orderId);
línea 226  if (remaining <= 0) throw ...                          ← los dos pasan aquí
línea 237  INSERT INTO wallet.billing_refunds ...                 ← los dos insertan
```

Dos reembolsos concurrentes sobre la misma orden pueden pasar **ambos** la comprobación
`remaining > 0` y **ambos** insertar. El resultado es devolver el dinero dos veces.

La idempotencia por `idempotencyKey` (`:215-219`) solo cubre el caso de **reintento con
la misma clave**. No cubre dos administradores, o dos pestañas, reembolsando a la vez con
claves distintas.

En ecomerse el equivalente es el stock: dos compradores concurrentes pueden pasar ambos
el `if (it.qty > Number(p.stock))` (`:392`) y reservar el mismo artículo.

### 1b. Contaminación cruzada del pool

Un `BEGIN` ejecutado en la conexión A devuelve A al pool **con la transacción abierta**.
La siguiente petición que tome A corre dentro de esa transacción ajena.

Consecuencias posibles, ninguna de ellas visible en logs:
- Una petición ve datos **no commiteados** de otra (lectura sucia).
- El `COMMIT` de una petición cierra cambios de otra.
- El `ROLLBACK` de una descarta cambios de otra.

Esto no es teórico: es exactamente el mecanismo por el que la medición del otro agente
vio «4 de 5 escrituras sobrevivieron a su propio ROLLBACK». Cada una de esas cuatro
quedó en una conexión distinta que luego volvió al pool sucia.

### 1c. El que ya conocíamos: falta de atomicidad

`billing.service.ts` marca la orden como `approved` y **después** inserta el asiento
contable, el recibo y la auditoría. Si falla a mitad, queda una orden aprobada sin
contabilidad. En el bloque de renovación (`:418-456`) además se crea el derecho
(`billing_entitlements`) antes del asiento: un fallo deja un derecho activo sin ingreso
registrado.

---

## 2. Los seis sitios

Aplicar por **anclaje de contenido**, no por número de línea. Los números de aquí salen
de dos copias distintas: `food.service.ts` de `server-fix\descargas\` (sincronizada con
el servidor, md5 `3071095f57f8a78c2c24f3c68108a049`) y el resto de `server-snapshot\`
(copia del 02-09, **puede estar desfasada** — confirmar contra el servidor antes).

| # | Fichero | Anclaje | Gravedad |
|---|---|---|---|
| 1 | `src/food/food.service.ts` | dentro de `assignRider`, tras `` const tracking = `FD-${crypto.randomBytes(3)`` | Media: 3 escrituras, sin dinero |
| 2 | `src/billing/billing.service.ts` | bloque de «COMPRA ESPECIAL», tras `const label = o.plan_code === 'commission_settlement'` | **Alta**: orden aprobada + asiento + recibo |
| 3 | `src/billing/billing.service.ts` | bloque de renovación, tras el cálculo de `expiresAt` y `entitlementAction` | **Alta**: derecho activo + asiento |
| 4 | `src/billing/billing-adjustments.service.ts` | `private async withTx<T>(fn: () => Promise<T>)` | **Crítica**: 5 métodos, reembolsos con `FOR UPDATE` |
| 5 | `src/ecomerse/ecomerse.service.ts` | tras `const created: Array<{ id: string; billingOrderId: string \| null }> = [];` | **Crítica**: reserva de stock con `FOR UPDATE` |
| 6 | `src/ecomerse/ecomerse.service.ts` | dentro de cancelar pedido, tras `const from = o.status;` | Alta: cancelación + restauración de stock |

**No confundir con lo que ya está bien:** `ecomerse.service.ts` tiene además
`$transaction(async (tx) =>` en `toggleFavorite`, e `intercity.service.ts` y
`mobility*.service.ts` lo usan correctamente. El proyecto conoce el patrón; seis sitios
no lo siguen.

---

## 3. El patrón de corrección

```ts
// ❌ ANTES — no transacciona: cada llamada puede tomar otra conexión del pool
await this.prisma.$executeRawUnsafe(`BEGIN`);
try {
  await this.prisma.$executeRawUnsafe(`UPDATE ...`);
  await this.prisma.$executeRawUnsafe(`INSERT ...`);
  await this.prisma.$executeRawUnsafe(`COMMIT`);
} catch (e) {
  await this.prisma.$executeRawUnsafe(`ROLLBACK`).catch(() => undefined);
  throw e;
}

// ✅ DESPUÉS — $transaction fija UNA conexión para todo el callback
await this.prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe(`UPDATE ...`);
  await tx.$executeRawUnsafe(`INSERT ...`);
});
```

Dentro del callback hay que usar **`tx`**, no `this.prisma`. Es el error más fácil de
cometer y el más silencioso: si una sentencia se deja con `this.prisma`, sale de la
transacción sin que nada falle. Al terminar, `grep` por `this.prisma` dentro del bloque
nuevo debe dar **cero** resultados.

No hace falta `try/catch`: `$transaction` hace rollback solo si el callback lanza.

### ⚠️ Import necesario o el build falla

Ninguno de los services importa el namespace `Prisma` — solo `PrismaService`:

```ts
import { PrismaService } from '../http/prisma.service';
```

Si se usa el tipo `Prisma.TransactionClient` (necesario en el sitio 4 y para el
parámetro opcional de §4), hay que añadir en cada fichero tocado:

```ts
import { Prisma } from '@prisma/client';
```

Sin eso: `error TS2304: Cannot find name 'Prisma'`. Y un build roto a mitad es justo lo
que `PROTOCOLO-COEXISTENCIA.md` §5.2 avisa que deja el despliegue colgado.

---

## 4. Sitio 4 — `withTx` es el único que necesita diseño, no sustitución

`billing-adjustments.service.ts` no tiene bloques sueltos: tiene un helper (`withTx`) que
los 5 métodos usan. El callback **no recibe nada**, así que los helpers privados que
tocan tablas `wallet.billing_*` (`getOrderForUpdate`, `getReceiptForUpdate`,
`getRefundedAmount`, `getEntitlementByOrder`, `ledger`, `audit`, `deactivateEntitlement`,
`voidReceiptForOrder`) llaman a `this.prisma` y quedarían **fuera** de la transacción
aunque se arregle `withTx`.

(`deactivateAcross` es la excepción: no toca la BD, llama a otros servicios. No lleva
`tx` —ver más abajo.)

Cambiar solo `withTx` daría la apariencia de arreglarlo sin arreglar nada — el `FOR UPDATE`
seguiría en otra conexión. Es la trampa más peligrosa de los seis sitios.

**Arreglo:** propagar `tx` con parámetro opcional, igual que el diseño ya acordado para
`createCustomAmountOrder`. Así los call sites que no se toquen siguen compilando.

```ts
import { Prisma } from '@prisma/client';

type Db = Prisma.TransactionClient | PrismaService;

// ANTES
private async withTx<T>(fn: () => Promise<T>): Promise<T> {
  await this.prisma.$executeRawUnsafe(`BEGIN`);
  try {
    const r = await fn();
    await this.prisma.$executeRawUnsafe(`COMMIT`);
    return r;
  } catch (e) {
    await this.prisma.$executeRawUnsafe(`ROLLBACK`).catch(() => undefined);
    throw e;
  }
}

// DESPUÉS
private async withTx<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return this.prisma.$transaction((tx) => fn(tx));
}
```

Y cada helper privado **que toque tablas `wallet.billing_*` directamente** gana el
parámetro opcional **al final**, con default:

```ts
// ANTES
private async getOrderForUpdate(orderId: string): Promise<any> {
  const rows: any[] = await this.prisma.$queryRawUnsafe(
    `SELECT * FROM wallet.billing_orders WHERE id=$1::uuid FOR UPDATE`, orderId);
  ...
}

// DESPUÉS
private async getOrderForUpdate(orderId: string, db: Db = this.prisma): Promise<any> {
  const rows: any[] = await db.$queryRawUnsafe(
    `SELECT * FROM wallet.billing_orders WHERE id=$1::uuid FOR UPDATE`, orderId);
  ...
}
```

Y en los 5 métodos, el callback recibe `tx` y se lo pasa a cada helper:

```ts
// ANTES
return this.withTx(async () => {
  const order = await this.getOrderForUpdate(orderId);
  ...
});

// DESPUÉS
return this.withTx(async (tx) => {
  const order = await this.getOrderForUpdate(orderId, tx);
  ...
});
```

Mismo tratamiento para los `$queryRawUnsafe` / `$executeRawUnsafe` **directos** dentro
de esos callbacks (p. ej. el `INSERT INTO wallet.billing_refunds` de `:237` y el
`UPDATE wallet.billing_orders` de `:148`): todos pasan a `tx.`.

### ⚠️ Excepción: `deactivateAcross` NO lleva `tx`

**Corrección a una primera versión de este documento**, que decía «los 9 helpers ganan
`tx`». Es falso para uno de ellos.

`deactivateAcross` (`:122-136`) **no toca la base de datos**: itera sobre
`this.rental`, `this.work`, `this.intercity` y llama a su `deactivateEntitlement`. Son
**otros servicios NestJS con su propia conexión**. Pasarles `tx` no tiene sentido —no
aceptan un cliente transaccional— y añadirles el parámetro daría la falsa impresión de
que la desactivación cross-module está dentro de la transacción. **No lo está, ni puede
estarlo**: son escrituras en otros módulos/esquemas que no comparten la conexión del
`$transaction` de billing.

Así que `deactivateAcross` se queda **tal cual**, sin `tx`.

### ⚠️ `deactivateEntitlement` es MIXTO y hay que partirlo con cuidado

`deactivateEntitlement` (`:86-103`) mezcla las dos cosas en este orden:

```
:87  getEntitlementByOrder(orderId)        ← lectura wallet.billing_* → SÍ lleva tx
:93  deactivateAcross(ent)                 ← cross-module → NO lleva tx (ver arriba)
:97  this.prisma.$executeRawUnsafe(UPDATE billing_entitlements ...)  → SÍ lleva tx
:101 audit(...)                            ← escritura wallet.billing_* → SÍ lleva tx
```

El helper gana `db: Db = this.prisma` y usa `db` en las líneas 87, 97 y 101, **pero la
llamada a `deactivateAcross` en la 93 se queda fuera**. Queda así:

```ts
private async deactivateEntitlement(orderId: string, adminId: string | null, reason: string, db: Db = this.prisma): Promise<any | null> {
  const ent = await this.getEntitlementByOrder(orderId, db);   // ← tx
  if (!ent) return null;
  if (!ACTIVE_ENT.includes(ent.status)) return ent;
  const from = ent.status;
  let syncError: string | null = null;
  try {
    await this.deactivateAcross(ent);                          // ← cross-module, FUERA de tx (sin cambio)
  } catch (e) {
    syncError = (e as Error).message;
  }
  await db.$executeRawUnsafe(                                   // ← tx
    `UPDATE wallet.billing_entitlements SET status='deactivated', ...`, syncError, ent.id);
  await this.audit(orderId, adminId, ..., db);                 // ← tx
  ...
}
```

### 🔒 Consecuencia que hay que aceptar conscientemente: transacción larga

Con esto, el `$transaction` de billing **queda abierto mientras corre `deactivateAcross`**
—que hace llamadas a rental/work/intercity—. Durante ese rato la transacción mantiene el
`FOR UPDATE` sobre la orden. Es el mismo tiempo de retención de lock que hay **hoy**
(porque `deactivateAcross` ya está dentro de `withTx`), así que N1 no lo empeora; pero
conviene saberlo, porque una transacción que retiene locks mientras hace trabajo
cross-module es justo el patrón que provoca contención bajo carga.

**No es parte de N1** sacar `deactivateAcross` fuera de la transacción (sería rediseñar
la cancelación/reembolso y su compensación). Se deja como está y se documenta. Si en el
futuro se quiere acortar el lock, la vía es: cerrar la transacción de dinero, y hacer la
desactivación cross-module después como efecto secundario compensable —igual que
`billing.service.ts:458-477` ya hace la activación **fuera** de su transacción.

**Verificación obligatoria de este sitio:** tras aplicarlo, dentro de cada callback de
`withTx` no debe quedar ni un `this.prisma` **en las sentencias que tocan
`wallet.billing_*`**. Las llamadas a `this.rental/work/intercity` sí se quedan con
`this.` —es correcto, van fuera.

---

## 5. Sitio 1 — `food.service.ts`, el más simple

`assignRider` tiene 3 escrituras y ninguna lectura dentro del bloque, así que no hay
helpers que propagar. Sustitución directa.

```ts
    const tracking = `FD-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `INSERT INTO wallet.food_deliveries (order_id, rider_id, tracking_code, status)
         VALUES ($1::uuid, $2::uuid, $3, 'assigned')`, orderId, d.riderId, tracking);
      await tx.$executeRawUnsafe(
        `UPDATE wallet.food_orders SET rider_id=$2::uuid, delivery_status='assigned', updated_at=now() WHERE id=$1::uuid`,
        orderId, d.riderId);
      await tx.$executeRawUnsafe(
        `INSERT INTO wallet.food_order_events (order_id, from_status, to_status, actor_type, actor_id, note)
         VALUES ($1::uuid, $2, 'assigned', 'owner', $3::uuid, 'Repartidor asignado: '||$4)`,
        orderId, ord[0].status, userId, tracking);
    });
```

El SMS al repartidor (tras el bloque) se queda **fuera**, igual que ahora: notificar no
debe deshacer la asignación.

---

## 6. Sitio 2 y 3 — `billing.service.ts`

Ambos bloques son sustitución directa: solo contienen `$executeRawUnsafe`, sin llamadas a
helpers que usen `this.prisma`. Hay que comprobarlo en cada uno antes de darlo por hecho
— en el bloque de renovación (`:418-456`) las variables `expiresAt`,
`entitlementAction` y `receiptNo` se calculan **antes** del bloque y se usan **después**
(`:461-477`, la activación en los módulos). Esas no entran en la transacción y está bien:
la activación es un efecto secundario en otros módulos que no debe deshacer el asiento
contable.

Lo único que hay que cuidar es que `entitlementAction` se asigna **dentro** del bloque
(`:428` y `:438`) y se lee fuera. Con `$transaction(async (tx) => {...})` eso sigue
funcionando porque la variable está declarada fuera del callback (`:411`). No cambiar su
declaración de sitio.

---

## 7. Orden de aplicación

El propuesto por el otro agente, que comparto: **`assignRider` → pagos → ecomerse**.

| Paso | Sitio | Por qué este orden |
|---|---|---|
| 1 | `food.service.ts` (`assignRider`) | Mismo módulo, aislado, sin helpers. Sirve para validar el patrón con la suite que ya conocemos: `e2e-pedidos → 49/49` |
| 2 | `billing.service.ts` (2 bloques) | Dinero, pero sustitución directa |
| 3 | `billing-adjustments.service.ts` (`withTx`) | El más invasivo: 8 helpers de BD + 5 métodos (`deactivateAcross` va aparte, ver §4). Hacerlo solo, con su propia copia previa, y con prueba de reembolso concurrente escrita ANTES |
| 4 | `ecomerse.service.ts` (2 bloques) | Otro flujo en producción; `FOR UPDATE` de stock |

**Cada paso, separado:** copia previa → aplicar → `build` con `errores TS: 0` →
`guard-check` → suites. No aplicar los cuatro de golpe: si algo falla no se sabe dónde,
y `PROTOCOLO-COEXISTENCIA.md` §1 recuerda que no hay staging y la única app en marcha es
la que usa el cliente en el móvil.

### Suites por paso

```
paso 1  node lb42-deploy.cjs e2e-pedidos      → 49/49
paso 2  node lb42-deploy.cjs contrato         → 21/21
        + lo que cubra aprobación de órdenes de billing
paso 3  pruebas de reembolso/cancelación si existen; si no, ESCRIBIRLAS antes
paso 4  suites de ecomerse
todos   bash /tmp/lb42e-guard-check.sh        → las puertas del hotel en pie
```

⚠️ **El paso 3 puede no tener cobertura de pruebas.** No he encontrado una suite de
reembolsos en el snapshot. Verificar con `node lb42-deploy.cjs` sin argumentos o en el
servidor. Si no existe, **escribir una prueba de reembolso concurrente antes de tocar
`withTx`** — es el único sitio donde el defecto produce dinero devuelto dos veces, y
arreglarlo sin prueba que lo demuestre es cambiar el módulo de pagos a ciegas.

El arnés `lb42t-n1.cjs` ya hace algo parecido a nivel de mecanismo (mide si el patrón
transacciona). Falta la versión a nivel de negocio: dos `refundOrder` concurrentes sobre
la misma orden deben dar **un** reembolso, no dos.

---

## 8. Fuera del alcance de N1

**M9 (`createOrder` no atómico) NO se arregla aquí**, aunque parezca que sí.

M9 necesita que `createCustomAmountOrder` acepte `tx` para participar en la misma
transacción que el INSERT del pedido. Eso es un cambio de firma en `billing.service.ts`
que también afecta a `ecomerse.service.ts:432`. Se puede hacer **después** del paso 2,
con el mismo diseño de parámetro opcional (`db: Db = this.prisma`), pero es otra parte de
trabajo con su propia prueba.

Meterlo dentro de N1 ampliaría el cambio al flujo de pedidos de dos módulos a la vez.

---

## 9. Comprobación tras cada paso

```bash
# 1. Que no quede ningún BEGIN suelto en el fichero tocado
grep -c 'executeRawUnsafe(`BEGIN`)' /opt/mirror/app/src/<fichero>
#    → debe dar 0

# 2. Que no quede this.prisma DENTRO de un callback de transacción
#    (revisión manual del diff; no hay grep fiable para esto)

# 3. Que el import de Prisma esté si se usa el tipo
grep -n "import { Prisma" /opt/mirror/app/src/<fichero>

# 4. El mecanismo, medido en la base de auditoría (nunca en producción)
node lb-run.cjs "cd /opt/mirror/app && DATABASE_URL=\$AUDIT node /tmp/lb42t-n1.cjs"
```

Y la comprobación que de verdad importa, que **no es estática**: repetir la medición de
carga del otro agente (5 secuencias a la vez) y confirmar que ahora **0 de 5** escrituras
sobreviven a su rollback. Con el patrón viejo eran 4 de 5.
