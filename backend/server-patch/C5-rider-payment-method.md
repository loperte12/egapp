# PARCHE C5 · `paymentMethod` en la entrega del repartidor

**Defecto:** A7 de `docs/AUDITORIA-COMIDA-RAPIDA.md` (antes C5, reclasificado).

**Estado:**
- ✅ **FRONTEND APLICADO** en `D:\egapp` (2026-09-12, `tsc` 0 errores):
  - `api/food.ts` — `paymentMethod?: string | null` en `FoodDelivery`, opcional porque
    el servidor aún no lo devuelve.
  - `app/food-rider.tsx` — distintivo de cobro en la tarjeta de entrega, visible **antes**
    de llegar a la puerta: `💵 COBRAR X en la puerta` (cash) · `✓ Ya pagado — NO cobrar nada`
    (billing) · `⚠️ No consta cómo se paga` (sin dato). Y la precarga del campo de efectivo
    ya no mete el total a ciegas: `cash` → total, `billing` → `0`, sin dato → vacío.
  - Copias previas en `backend/server-patch/pre-c5-backup/`.
- ⏳ **BACKEND PENDIENTE** (los dos cambios de abajo). `food.service.ts` es territorio del
  otro agente —su guardia de MD5 en `lb42v-aplicar-dinero.sh` parará si el fichero
  cambia—, así que se aplica coordinado con él o se le pasa tal cual.

**Mientras el backend no se despliegue** la app funciona y no engaña: `paymentMethod`
llega `undefined` y se muestra el aviso neutro «⚠️ No consta cómo se paga». Es el
comportamiento correcto para ese estado, no un fallo. Lo que sí hace es que **el defecto
A7 siga vivo** hasta aplicar los dos cambios de abajo.

> ⚠️ **Nota sobre el método de escritura.** `api/food.ts` y `app/food-rider.tsx` no
> admiten sobrescritura atómica: su ACL contiene derechos genéricos (`268435456`,
> `-536805376`) que la copia+renombrado no sabe re-aplicar. Se escribieron **en el
> sitio**, que no toca la ACL. Verificado después: mismo número de ACE, mismo
> propietario, sin BOM y sin CRLF introducidos. Si otro agente encuentra el mismo error
> al editarlos, es esto.

---

## ✅ APLICADO Y VERIFICADO EN VIVO (2026-09-12, 10:10)

Los dos cambios están desplegados por el otro agente. `BUILD_EXIT=0`, 0 errores TS,
servicio vivo, y **verificado con entregas reales de los dos métodos de pago**:

```
repartidor activo · 2 entregas asignadas
  3cb5cbe3 · total 3500 XAF · paymentMethod="billing"
  92cd543e · total 3500 XAF · paymentMethod="cash"
PASS la entrega EN EFECTIVO llega con «cash»    (sabe que cobra)
PASS la entrega por BILLING llega con «billing» (sabe que NO cobra)
PASS ninguna entrega llega SIN el dato          0 de 2
7/7 PASS
```

**A7 queda cerrado.** El distintivo 💵/✓/⚠️ del frontend ya recibe dato real y deja de
mostrar el aviso neutro.

**Punto de partida actual:** `food.service.ts` → md5 `3071095f57f8a78c2c24f3c68108a049`
(10:10:38). Copia local en `server-fix\descargas\food.service.ts` verificada como
idéntica. Quien vuelva a tocar el fichero debe partir de ahí y pasar su md5 al terminar.

---

## ⚠️ CORRECCIÓN: lo que dije del MD5 era falso

Este documento afirmaba que la copia local (`8ed444c8…`) y la guardia
(`f8176eac…`) «no coincidían», y concluía que **la copia local no era la versión
instalada**. **Esa conclusión era incorrecta.**

Lo que realmente pasaba: `f8176eac` era el fichero instalado **antes** del despliegue
del dinero. La guardia de `lb42v-aplicar-dinero.sh` **recibe el MD5 esperado como
argumento**, así que el registro que leí contenía el valor de aquel momento, no un
desajuste. Medido antes de tocar nada: local = servidor = `8ed444c8`, idénticos.

**El error de razonamiento fue mío**: vi dos hashes distintos y salté a «los ficheros
difieren» sin considerar que uno de los dos valores era histórico. Corregido aquí para
que nadie reconstruya desde una base vieja por culpa de esa frase.

**La recomendación de aplicar por anclaje sigue valiendo**, y de hecho funcionó: se
aplicó así y los dos cambios acertaron a la primera. Los números de línea en un
documento siempre son orientativos; los anclajes de contenido, no. Esa parte se
mantiene.

---

## Por qué

El repartidor no recibe el método de pago del pedido. Llega a la puerta sin saber si
debe cobrar. El servidor **sí** impide anotar efectivo en un pedido Billing
(`descargas/food.service.ts:532-534`), así que la contabilidad está protegida — pero
la protección llega tarde: salta **después** de que el repartidor haya cobrado al
cliente. Un pedido pagado por transferencia puede acabar cobrado dos veces, y la
plataforma nunca lo registra porque el rechazo ocurre antes del ledger.

Agravado en la app: `food-rider.tsx:386` pre-rellenaba el campo de efectivo con
`totalXaf`, que es el importe completo. En un pedido Billing el valor por defecto era
exactamente el incorrecto, y el texto de ayuda («si ya estaba pagado, pon 0») exigía
que el repartidor lo borrase a mano. *(Ya corregido en el frontend.)*

---

## La buena noticia: el patrón ya existe en la misma clase

`mapOrder()` —el mapeador de **pedidos**— ya devuelve el método de pago
(`descargas/food.service.ts:1008`):

```ts
      items: r.items ?? [], totalXaf: Number(r.total_xaf), paymentMethod: r.payment_method,
```

`mapDelivery()` —el mapeador de **entregas**— no lo hace. Es la misma clase, el mismo
fichero, dos métodos hermanos. No se está inventando nada: se está copiando una línea
que ya funciona en producción, a cuarenta líneas de distancia.

⚠️ **No confundir los dos al editar.** `mapOrder` está alrededor de la línea 1008 y
`mapDelivery` alrededor de la 1031. El que hay que tocar es **`mapDelivery`**, el que
empieza con `id: String(r.id), orderId: String(r.order_id), riderId: String(r.rider_id),
trackingCode: r.tracking_code`. Si se edita `mapOrder` por error, el cambio no hará nada
y parecerá que el parche no funciona.

---

## CAMBIO 1 · `riderMe()` — seleccionar el método de pago

**ANCLA:** la consulta que empieza con
`` `SELECT d.*, o.id AS order_id, o.items, o.total_xaf, r.business_name `` dentro de
`riderMe()`. Es la única del fichero con esa forma.

Se añade `o.payment_method` a la lista del SELECT. **El resto no cambia**, incluidos
el filtro `d.status <> 'delivered'` y el `LIMIT 20`.

```ts
    const deliveries: any[] = rows[0] ? await this.prisma.$queryRawUnsafe(
      `SELECT d.*, o.id AS order_id, o.items, o.total_xaf, o.payment_method, r.business_name,
              r.address AS restaurant_address, r.phone_contact AS restaurant_phone,
              o.user_id AS customer_user_id, o.delivery_address, o.note, o.pickup_type
       FROM wallet.food_deliveries d
       JOIN wallet.food_orders o ON o.id = d.order_id
       JOIN wallet.food_restaurants r ON r.id = o.restaurant_id
       WHERE d.rider_id=$1::uuid AND d.status <> 'delivered'
       ORDER BY d.created_at DESC LIMIT 20`, rows[0].id)
      : [];
```

## CAMBIO 2 · `mapDelivery()` — devolverlo

**ANCLA:** dentro de `private mapDelivery(r: any): any {`, la línea
`items: r.items ?? [], totalXaf: Number(r.total_xaf),` seguida de
`restaurantName: r.business_name ?? null`. Esa secuencia es única de `mapDelivery`;
en `mapOrder` la misma línea va seguida de `billingOrderId`, no de `restaurantName`.

```ts
      items: r.items ?? [], totalXaf: Number(r.total_xaf),
      paymentMethod: r.payment_method ?? null,   // ▼ NUEVO (C5)
      restaurantName: r.business_name ?? null, restaurantAddress: r.restaurant_address ?? null,
```

`?? null` a propósito: las entregas antiguas y cualquier consulta que no traiga la
columna devuelven `null`, que la app trata como «no declarado» y muestra el aviso
neutro. Nunca se inventa un `cash` por defecto — inventarlo es justo el error que
estamos arreglando.

(`mapOrder` no lleva el `?? null` y funciona, porque su consulta siempre trae la
columna. Aquí se pone igualmente: cuesta cero y cubre la entrega antigua.)

---

## No hace falta tocar

- **`food.dto.ts`**: esta es una respuesta, no una entrada. No pasa por Zod.
- **`food.controller.ts`**: `riderMe` ya devuelve lo que el service construye.
- **`anotarCobroRepartidor`**: su validación (`:532-534`) ya es correcta. No se cambia.
- **`mapOrder`**: ya devuelve `paymentMethod`. No tocar —ver el aviso de arriba.
- **Ningún fichero compartido** de `PROTOCOLO-COEXISTENCIA.md` §3, y ningún código de
  error nuevo en `error.filter.ts`.

---

## Comprobación tras desplegar

```bash
# Con un repartidor activo y una entrega asignada:
curl -s -H "Authorization: Bearer $TOKEN" https://hk.egrouteplan.com/api/food/rider/me \
  | python3 -c "import sys,json; [print(d['orderId'][:8], d.get('paymentMethod')) for d in json.load(sys.stdin)['deliveries']]"
```

Debe imprimir `cash` o `billing` en cada entrega, no `None`.

Y la suite correspondiente: `node lb42-deploy.cjs e2e-pedidos → 49/49`.
