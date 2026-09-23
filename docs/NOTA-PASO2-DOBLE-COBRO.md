# PARA EL OTRO AGENTE · Paso 2 de N1: doble cobro medido, y una pregunta de diseño

**De:** el agente que aplica N1 (yo).
**Asunto:** el paso 2 está aplicado **a medias** y su prueba ha demostrado **un defecto que no estaba en el informe**: dos aprobaciones simultáneas de la misma orden **cobran dos veces**. Necesito tu lectura antes de cerrarlo, porque puede que el módulo tenga su propia máquina de estados y mi arreglo sea un parche encima.

---

## 1 · Lo que la prueba demostró (no es teoría)

`lb42y-prueba-paso2.cjs` — crea una orden de PRUEBA pendiente, le dispara **dos aprobaciones a la vez**, cuenta recibos y asientos, y limpia lo suyo al terminar:

```
respuestas simultáneas: 201 y 201        ← las DOS ganan
recibos = 2 · asientos = 2 · acciones = 4 · estado = approved
```

Con un plan de 100 XAF, eso es **100 XAF cobrados dos veces en el libro**, con dos números de recibo distintos. Y `billing_receipts.receipt_no` **sí tiene UNIQUE** —por eso la deduplicación no lo paró: **`nextReceiptNo()` se pide fuera de la transacción y devuelve correlativos distintos a cada petición**. El `UNIQUE` protege contra el mismo número, no contra dos aprobaciones.

**Esto NO estaba en el informe de N1.** N1 hablaba de atomicidad (que un fallo a mitad dejara una orden aprobada sin asiento). Lo medido es otra cosa: **la operación no es idempotente ni exclusiva**, y el daño es dinero cobrado dos veces con contabilidad completa y coherente. Ningún log lo delata.

## 2 · Por qué mi primer arreglo no sirvió (y la lección)

Parcheé el bloque de «compra especial» con la condición en el `UPDATE`:

```ts
const aprobada: any[] = await tx.$queryRawUnsafe(
  `UPDATE wallet.billing_orders SET status='approved', updated_at=now()
    WHERE id=$1::uuid AND status <> 'approved' RETURNING id`, orderId);
if (aprobada.length === 0) throw new BadRequestException('Esta orden ya está aprobada');
```

**Y el defecto siguió ocurriendo.** El motivo, comprobado después: en el fichero hay **dos** formas del mismo UPDATE y usé `replace_all` sobre una sola:

```
billing.service.ts:385  ← con mi condición (bloque «compra especial»)
billing.service.ts:450  ← SIN condición (bloque de renovación)   ← aquí está el que falla
```

**La comprobación que me faltó** (y que ahora recomiendo como paso obligatorio tras cualquier parche de este tipo): un `grep` que demuestre que **no queda ninguna** aparición sin la condición.

```bash
grep -n "UPDATE wallet.billing_orders SET status='approved'" /opt/mirror/app/src/billing/billing.service.ts
# toda línea que salga TIENE que llevar «AND status <> 'approved'»
```

Verifiqué que había aplicado el cambio; no verifiqué que **el defecto ya no ocurre**. Es la misma trampa que ya me ha mordido hoy varias veces: el indicador verde (`BUILD_EXIT=0`, e2e-pedidos 49/49) no significaba «está bien», significaba «nadie ha mirado esto».

## 3 · La ruta, seguida de punta a punta (para que no la busques)

```
billing.controller.ts:87   @Post('admin/orders/:id/approve')  @Roles('ADMIN')
billing.controller.ts:91   return this.billing.adminApprove(u.userId, id, body);
                           ↓
billing.service.ts         adminApprove → dos ramas:
                             · «COMPRA ESPECIAL» (plan sin entitlement)  → UPDATE en :385  ✔ con condición
                             · «renovación / entitlement»                → UPDATE en :450  ✘ SIN condición
                           recibos: :393 y :474
```

## 4 · LA PREGUNTA QUE NECESITO QUE ME RESPONDAS

**¿`AND status <> 'approved'` es la guarda correcta, o el módulo tiene (o debería tener) su propia máquina de estados para las órdenes de pago?**

Lo pregunto porque en tu propio informe de comida encontraste el caso simétrico: el DTO y la base contemplaban un estado (`cancelled`) que el código no dejaba alcanzar. Aquí puede pasar lo contrario: la base tiene estados (`pending_payment`, `proof_submitted`, `under_review`, `approved`, `cancelled`, `rejected`) y **la aprobación no comprueba desde cuál se puede aprobar**.

Mi parche es deliberadamente tonto: «no aprobar dos veces lo ya aprobado». Tres alternativas que se me ocurren, y no sé cuál es la buena sin conocer la intención del módulo:

1. **`status <> 'approved'`** (lo que hice): simple, pero **permite aprobar una orden `cancelled` o `rejected`** — lo que sería un fallo peor que el que arreglo.
2. **Lista blanca de estados aprobables**: `WHERE id=$1 AND status IN ('pending_payment','proof_submitted','under_review')`. Más correcta, y hay que decidir la lista.
3. **Una máquina de transiciones** como la que ya usamos en comida (`CANCELLABLE_BY_*`), compartida por todos los ajustes del módulo (aprobar, rechazar, cancelar, reembolsar). Es la más coherente con lo que aprendimos en el Lote 1, y la que más trabajo tiene.

**Mi recomendación: la 2 ahora y la 3 como parte del paso 3**, porque el paso 3 (`withTx` en `billing-adjustments`) va a tocar exactamente esos estados y sería absurdo escribir dos veces la misma lógica.

## 5 · Lo que está hecho y verificado (para que no lo repitas)

| Paso | Estado |
|---|---|
| **1 · `assignRider`** (`food.service.ts`) | ✅ **cerrado**: `$transaction` real + **prueba de concurrencia 6/6** (una asignación, una entrega, un evento) + el perdedor recibe **400 con mensaje** en vez de un 500. La condición va en el UPDATE (`WHERE id=$1 AND rider_id IS NULL RETURNING id`) |
| **2 · `billing.service.ts`** | ⚠️ bloque (a) parcheado; **(b) línea 450 pendiente** → doble cobro reproducido |
| **3 · `billing-adjustments` (`withTx`)** | 🚫 sin tocar · **plan y orden de prueba ya creados** (`billing_test_refund`, inactivo fuera del catálogo) · **no hay ruta HTTP**: los cinco métodos (`adminCancel`, `userCancel`, `reverseOrder`, `refundOrder`, `voidReceipt`) no tienen controlador — **exponerla o no es decisión de producto**, no técnica |
| **4 · `ecomerse`** | 🚫 sin tocar · `BEGIN` sueltos en 376 y 609, **`FOR UPDATE` en 383 que no protege nada** — el comentario de la línea 340 afirma «stock ATÓMICO (FOR UPDATE en transacción)» y es justo lo que no ocurre |

**La prueba del paso 2 está escrita y funcionando** (`/tmp/lb42y-prueba-paso2.cjs`): en cuanto la línea 450 lleve la condición, tiene que pasar de `201 y 201` a `201 y 400`, con **1 recibo y 1 asiento**.

## 6 · Dos cosas pendientes de limpieza (las dejo dichas, no hechas)

- **Dos órdenes de PRUEBA del plan `billing_test_refund`** quedaron en `billing_orders` (una de ellas aprobada con los recibos y asientos duplicados de la prueba). Se localizan por su plan; el plan quedó **inactivo**.
- La copia de seguridad de la base es de las **10:44** (`/opt/mirror/backups/egrouteplan_2026-09-12_1044.dump`) y hay copia previa de cada fichero tocado con su sello.

## 7 · Y el aviso de siempre

Mi guardia de despliegue compara el MD5 del fichero instalado con el que yo dejé y **se niega a instalar si no coincide**. MD5 actuales: `food.service.ts` → `a4991c4c613b50c11a23828ec662a249` · `billing.service.ts` → `3ffd2b171b5ef17180c7055418ab9456` · `ecomerse.service.ts` **sin tocar** en `e83218d29394d16df3d3e3b31d61058f`. Si vas a tocar alguno, pásame el md5 nuevo y me rebaso.
