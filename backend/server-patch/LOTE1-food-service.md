# LOTE 1 — Parches de backend para el módulo de comida

**Fecha:** 2026-09-12
**Origen:** `D:\egapp\docs\AUDITORIA-COMIDA-RAPIDA.md`
**Ámbito:** solo `food.service.ts` (no es fichero compartido según `PROTOCOLO-COEXISTENCIA.md` §3) y una migración SQL nueva.
**Estado:** escrito, **no aplicado**. El backend real está en el servidor; aquí solo hay el snapshot.

> **Dos correcciones al informe de auditoría**, detectadas al implementar:
>
> 1. El arreglo que proponía para C1 («copiar el patrón `BEGIN`/`COMMIT` de `assignRider`)
>    **era incorrecto y se retira**. Ese patrón no garantiza atomicidad con Prisma —ver §4.
> 2. La gravedad de C1 estaba **sobreestimada**: no mueve dinero, crea una factura en
>    `pending_payment` con deduplicación. Pasa de CRÍTICO a MEDIO —ver §4.
>
> C1 se documenta pero **no se arregla en este lote**, porque hacerlo bien exige tocar
> `billing.service.ts` (módulo de pagos, compartido con ecomerse). Requiere decisión previa.

---

## 1. C2 — Carrera en las transiciones de estado

### El defecto

`food.service.ts:338-370`. La función **lee** el estado (línea 342), lo **valida**
(356) y lo **escribe** (368) en tres pasos separados. El `UPDATE` final filtra solo
por `id`:

```sql
UPDATE wallet.food_orders SET status=$2, ... WHERE id=$1::uuid
```

Entre la lectura y la escritura otro actor puede cambiar el estado. Ambos pasan la
validación con el mismo valor antiguo y ambos escriben. El pedido salta estados o
retrocede, y como `food_order_events` solo registra las transiciones de entrega
—no las de cocina— **no queda rastro**.

### El arreglo

Cerrar la carrera con una cláusula de concurrencia optimista: el `UPDATE` solo
afecta a la fila **si sigue en el estado que se leyó**. Si afecta a 0 filas, alguien
llegó antes y se responde con conflicto.

**SUSTITUIR** el bloque final de `updateOrderStatus` (líneas 368-371):

```ts
    // ANTES
    await this.prisma.$executeRawUnsafe(
      `UPDATE wallet.food_orders SET status=$2, delivered_at=CASE WHEN $2='delivered' THEN now() ELSE delivered_at END, updated_at=now()
       WHERE id=$1::uuid`, orderId, status);
    return { message: status === 'delivered' ? 'Pedido entregado' : `Pedido → ${status}` };
```

```ts
    // DESPUÉS — concurrencia optimista: solo actualiza si el estado sigue siendo
    // el que se leyó arriba. Si otra petición ya lo avanzó, esto afecta a 0 filas
    // y se responde con conflicto en vez de pisar el cambio ajeno.
    const updated: any[] = await this.prisma.$queryRawUnsafe(
      `UPDATE wallet.food_orders
          SET status=$2,
              delivered_at=CASE WHEN $2='delivered' THEN now() ELSE delivered_at END,
              updated_at=now()
        WHERE id=$1::uuid AND status=$3
        RETURNING id`, orderId, status, o.status);
    if (updated.length === 0) {
      throw new BadRequestException('El pedido cambió de estado mientras tanto. Recarga la lista.');
    }

    // Auditoría de la transición de cocina (antes solo se registraban las de entrega).
    await this.prisma.$executeRawUnsafe(
      `INSERT INTO wallet.food_order_events (order_id, from_status, to_status, actor_type, actor_id, note)
       VALUES ($1::uuid, $2, $3, $4, $5::uuid, 'Cambio de estado del pedido')`,
      orderId, o.status, status, as === 'owner' ? 'owner' : 'user', userId);

    return { message: status === 'delivered' ? 'Pedido entregado' : `Pedido → ${status}` };
```

### Notas de aplicación

- `$queryRawUnsafe` con `UPDATE ... RETURNING` es válido en Prisma contra PostgreSQL
  y es la forma de saber cuántas filas se afectaron sin una segunda consulta.
  **Precedente en este mismo proyecto:** `ecomerse.service.ts:1239-1242` hace
  exactamente eso (`UPDATE wallet.ecomerse_favorites SET special = NOT special ...
  RETURNING special`). No es un patrón nuevo que haya que validar.
- `actor_type` **admite `'user'`**: en `032_food_riders.sql:58` la columna es
  `varchar(10)` sin CHECK, con el comentario `user | owner | rider | admin | system`.
  Verificado, no hay que ampliar ningún constraint.
- El `INSERT` en `food_order_events` va **fuera** del `UPDATE` a propósito: si falla,
  la transición ya está hecha y no debe deshacerse. Registrarla es deseable, no
  esencial. Si se prefiere atomicidad estricta, envolver ambos en
  `$transaction(async (tx) => {...})` —ver §4 para por qué **no** usar `BEGIN`/`COMMIT`.

### Efecto sobre el frontend

Ninguno cambio necesario. El nuevo error llega como `BadRequestException` y
`food-orders.tsx` ya muestra los mensajes del servidor.

---

## 2. C3 — El estado `cancelled` es inalcanzable

### El defecto

`food.service.ts:352-355`. La tabla de transiciones no contiene **ninguna** entrada
que produzca `cancelled`:

```ts
const next: Record<string, Record<string, string>> = {
  owner: { placed: 'confirmed', confirmed: 'preparing', preparing: 'ready', ready: 'delivered' },
  user:  { ready: 'delivered' },
};
```

La línea 351 trata `cancelled` como terminal —el código sabe que existe—, el DTO lo
acepta (`food.dto.ts:87`) y la base de datos lo permite (`030_food.sql:85`). Tres
capas lo contemplan; la única que decide, no.

**Consecuencia:** un cliente no puede cancelar, un restaurante no puede rechazar un
pedido que no puede servir, y el filtro «cancelados» de `food-orders.tsx:52-57`
siempre devuelve vacío.

### El arreglo

**SUSTITUIR** la tabla `next` y su validación (líneas 352-358):

```ts
    // Transiciones hacia delante (sin cambio respecto a antes).
    const next: Record<string, Record<string, string>> = {
      owner: { placed: 'confirmed', confirmed: 'preparing', preparing: 'ready', ready: 'delivered' },
      user:  { ready: 'delivered' },
    };

    // CANCELACIÓN. Se permite desde cualquier estado no terminal, con reglas por rol:
    //  · El CLIENTE puede cancelar mientras no haya empezado la cocina
    //    (placed | confirmed). A partir de `preparing` ya hay comida en marcha y
    //    debe hablar con el restaurante.
    //  · El DUEÑO puede cancelar en cualquier estado no entregado, incluido
    //    `preparing` y `ready`: es quien sabe si puede servir el pedido. Es la
    //    salida que faltaba para un restaurante cerrado o sin stock.
    const CANCELLABLE_BY_USER  = ['placed', 'confirmed'];
    const CANCELLABLE_BY_OWNER = ['placed', 'confirmed', 'preparing', 'ready'];
    const cancellable = (as === 'owner' ? CANCELLABLE_BY_OWNER : CANCELLABLE_BY_USER);

    if (status === 'cancelled') {
      if (!cancellable.includes(o.status)) {
        throw new BadRequestException(
          as === 'owner'
            ? `No se puede cancelar un pedido en estado "${o.status}".`
            : `El restaurante ya empezó a preparar tu pedido. Contacta con él para cancelarlo.`,
        );
      }
    } else if (next[as][o.status] !== status) {
      throw new BadRequestException(`Transición inválida: ${o.status} → ${status}`);
    }
```

### Interacción con el resto del código

- La guarda de la línea 351 (`if (o.status === 'cancelled') throw 'Pedido cerrado'`)
  sigue delante y **debe mantenerse**: impide reabrir o volver a cancelar un pedido
  ya cerrado.
- El gate de Billing (líneas 361-367) solo aplica a `status === 'confirmed'`, así que
  cancelar no lo atraviesa. Correcto.
- **Pendiente de decisión, no incluido aquí:** si el pedido tenía `billing_order_id`,
  cancelar debería anular también la orden de pago. Eso toca `billing.service.ts`
  → mismo bloqueo que C1, ver §4. Mientras tanto, cancelar un pedido Billing deja la
  factura abierta; es visible y el admin puede rechazarla, pero conviene saberlo.

### Cambio necesario en el frontend

`food-orders.tsx:46-51` define las máquinas de transición del cliente. Hay que añadir
la acción de cancelar:

```ts
// USER_NEXT y OWNER_NEXT siguen igual; añadir, en OrderCard, un botón "Cancelar"
// visible cuando:
//   as === 'user'  && ['placed','confirmed'].includes(o.status)
//   as === 'owner' && ['placed','confirmed','preparing','ready'].includes(o.status)
```

El botón debe pedir **motivo** antes de enviar, igual que hace la cancelación de
reserva de hotel en `lifebook-hotel-reserva.tsx:145-183` —hay patrón propio en el
proyecto, conviene reutilizarlo. El motivo se puede mandar en el `note` del evento.

⚠️ Este cambio de frontend **no está escrito todavía**. Es el siguiente paso del lote
y conviene hacerlo después de desplegar el backend, para no publicar un botón que el
servidor aún rechaza.

---

## 3. A5 — Falta índice en `food_orders.status`

### El defecto

Los índices existentes en `030_food.sql`:

```
48   idx_food_restaurants_status  (status)
67   idx_food_menu_restaurant     (restaurant_id, status)
88   idx_food_orders_user         (user_id, created_at DESC)
89   idx_food_orders_restaurant   (restaurant_id, created_at DESC)
115  idx_food_reports_status      (status, created_at DESC)
```

Las tablas hermanas indexan por estado; `food_orders` no. Y el filtro más usado del
panel del dueño es precisamente por estado (`food-orders.tsx:52-57`:
`open`/`delivered`/`cancelled`), que el servidor resuelve en `myOrders`
(`food.service.ts:293-301`) con `o.status IN (...)`.

Con 1 pedido en la base no se nota. Con miles, cada apertura del panel recorre la
tabla entera.

### La migración

Fichero real, ya escrito: **`backend/sql/food-orders-index.sql.sh`**.

No se reproduce aquí a propósito: una copia pegada en dos sitios acaba divergiendo, y
la versión que se ejecuta es la del fichero. Ábrelo para leerlo.

Cumple el formato `.sql.sh` que exige `PROTOCOLO-COEXISTENCIA.md` §8: idempotente
(`IF NOT EXISTS`), con foto ANTES y control DESPUÉS.

### ⚠️ Dos cosas del script que no son obvias

**1. No lleva `BEGIN`/`COMMIT`, a diferencia de `food-item-details.sql.sh`.**

`CREATE INDEX CONCURRENTLY` **falla** dentro de un bloque de transacción
(`cannot run inside a transaction block`). psql en modo autocommit ejecuta cada
sentencia por su cuenta, que es lo que necesita.

Se usa `CONCURRENTLY` a propósito: no bloquea las escrituras, y en una caja con una
sola aplicación en producción eso es lo que importa. El coste es que tarda más y que,
si se interrumpe, deja un índice `INVALID`. El script lo verifica con `indisvalid` y
dice qué hacer si sale mal.

**2. No lleva `EXPLAIN` de verificación, y es deliberado.**

Con ~1 fila en la tabla el planificador elegirá **siempre** un recorrido secuencial,
porque es más barato que usar el índice. Un `EXPLAIN` ahora daría «Seq Scan» y
parecería que el índice no sirve, cuando en realidad sería correcto para ese volumen.
Para comprobarlo de verdad harían falta miles de filas de prueba en
`egrouteplan_staging`.

### Nota sobre el volumen actual

El índice se justifica por el volumen **futuro**, no por el actual: hoy no mejora nada
medible. Se hace antes de tener tráfico, no después — crearlo en caliente sobre una
tabla grande es justo el problema que `CONCURRENTLY` evita, pero conviene dejarlo
resuelto mientras cuesta cero.

---

## 4. C1 — Retirado de este lote, con la corrección

### Lo que dije mal en el informe

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
`PrismaClient` puede tomar una conexión distinta del pool: el `BEGIN` se ejecuta en
una conexión, el `INSERT` en otra y el `COMMIT` en una tercera. La transacción no
envuelve las sentencias.

Prisma exige una transacción interactiva, que sí fija una única conexión:

```ts
await this.prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe(`INSERT ...`);
});
```

El proyecto **ya tiene ese patrón correcto** en `ecomerse.service.ts:1218`,
`intercity.service.ts:415,512,570,581`, `mobility.service.ts:114` y
`mobility-auth.service.ts:119`.

### Alcance real del problema (hallazgo nuevo, mayor que C1)

El patrón roto no está solo en `assignRider`. Aparece en **seis sitios**, dos de ellos
en el módulo de pagos:

| Fichero | Líneas | Módulo |
|---|---|---|
| `food.service.ts` | 484, 496 | comida |
| `billing.service.ts` | 363, 384 | **pagos** |
| `billing.service.ts` | 418, 452 | **pagos** |
| `billing-adjustments.service.ts` | 33, 36 | **pagos** |
| `ecomerse.service.ts` | 376, 461 | tienda |
| `ecomerse.service.ts` | 609, 627 | tienda |

No encontré `connection_limit` en la configuración del snapshot, así que aplica el
pool por defecto de Prisma (varias conexiones). Es el peor tipo de defecto: con una
sola petición en vuelo suele funcionar, porque el pool reutiliza la conexión libre;
falla bajo concurrencia.

**Esto merece su propia parte de trabajo y su propia decisión**, no meterlo de
refilón en el Lote 1: tocar `billing.service.ts` es tocar el módulo que mueve dinero,
y está compartido con ecomerse.

### Por qué además C1 era menos grave de lo que dije

Escribí «dinero movido sin contrapartida». **Es falso.**

`createCustomAmountOrder` (`billing.service.ts:163-184`) no cobra: crea una fila en
`wallet.billing_orders` que nace en estado pendiente. El dinero solo se mueve cuando
el cliente sube un comprobante de transferencia y un administrador lo aprueba. Y hay
deduplicación en las líneas 170-176: si el usuario ya tiene una orden abierta para ese
plan, devuelve la existente en vez de crear otra.

Así que el daño real de C1 es una **factura huérfana sin pagar**: visible en el panel
de billing, rechazable por un admin, y que un reintento incluso reutilizaría. No es
dinero perdido.

**C1 queda reclasificado de CRÍTICO a MEDIO.**

### Por qué no se arregla en este lote

La única corrección real es que `createCustomAmountOrder` acepte el cliente
transaccional (`tx`) para participar en la misma transacción que el INSERT del pedido.
Eso cambia la firma de un método de `billing.service.ts` que también usa
`ecomerse.service.ts:432`.

Reordenar las llamadas dentro de `food.service.ts` (crear el pedido primero y la
factura después) **no lo arregla**: la factura seguiría creándose en otra conexión,
fuera de la transacción. Solo estrecharía la ventana.

No lo hago sin que lo decidas, porque:
1. Está fuera del alcance que aprobaste (Lote 1 = comida).
2. Toca el módulo de pagos, compartido con otro flujo en producción.
3. `PROTOCOLO-COEXISTENCIA.md` §5 exige pasar las cuatro comprobaciones antes de
   desplegar, y `e2e-pedidos → 49/49` cubre precisamente este camino.

---

## 5. Orden de aplicación recomendado

1. **Migración del índice** (§3) — riesgo cero, no toca código. Verificar `indisvalid`.
2. **C2 + C3 en `food.service.ts`** (§1, §2) — son el mismo método, se aplican juntos.
3. `node lb42-deploy.cjs build` → debe dar **`errores TS: 0`**.
4. `bash /tmp/lb42e-guard-check.sh` → las puertas del hotel en pie. No las toco, pero
   el protocolo exige comprobarlo tras cada despliegue.
5. `node lb42-deploy.cjs e2e-pedidos` → **49/49**. Es la suite que cubre este camino.
   Si alguna prueba asume que `cancelled` es inalcanzable, fallará: es esperado y hay
   que actualizarla, no revertir el arreglo.
6. **Solo después**, el botón de cancelar en `food-orders.tsx` (§2).

Antes de todo: `bash /tmp/lb-backup.sh` y confirmar que dice «el respaldo se puede leer».

---

## 6. Lo que este lote NO toca

- `billing.service.ts` y `billing-adjustments.service.ts` —módulo de pagos.
- `ecomerse.service.ts` —otro flujo en producción.
- Los cuatro ficheros compartidos de `PROTOCOLO-COEXISTENCIA.md` §3
  (`lifebook/orders.service.ts`, `lifebook/commerce.service.ts`,
  `http/error.filter.ts`, `http/app.module.ts`). Las puertas del hotel quedan intactas.
- Ningún código de error nuevo en `error.filter.ts`: los tres parches usan
  `BadRequestException`, que ya está mapeado. Esto importa porque duplicar un código
  rompe la compilación entera con `TS1117` (§5 del protocolo).
- El frontend, salvo lo señalado en §2 como paso posterior.

---

## 7. Aviso de coordinación

`ACCESO-Y-MIGRACION-COMIDA.md` asigna a otro agente la migración de este módulo a
Life Book. Este lote modifica `food.service.ts`, que ese agente también va a tocar.

Conviene acordar quién aplica qué **antes** de desplegar, porque dos parches sobre el
mismo método (`updateOrderStatus`) se pisan en silencio: el último que instala gana.
