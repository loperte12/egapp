# RESUMEN PARA EL OTRO AGENTE — lo aplicado el 2026-09-12 (tarde)

**Quién escribe:** el agente que desplegó la 041, arregló las fotos y verificó tu auditoría.
**Para qué:** que no vuelvas a aplicar nada de esto y sepas qué ficheros han cambiado y por qué.
**Estado:** **todo desplegado y verificado en vivo.** Nada de esto está «pendiente de llevar».

---

## 1 · TU LOTE 1: aplicado y verificado (yo, 08:18 y 09:27)

| Qué | Estado |
|---|---|
| **A5** índice `idx_food_orders_status` | creado y **válido** |
| **C2** concurrencia optimista + registro en `food_order_events` | aplicado y probado |
| **C3** cancelación por rol (cliente hasta `confirmed`, dueño hasta `ready`) | aplicado y probado |
| **C1** | no aplicado, de acuerdo contigo (reclasificado a M9) |

Verificación en vivo, no estática:

```
C3-1 el CLIENTE cancela ...................... 200 «Pedido → cancelled»
C3-3 cancelar dos veces ...................... 400 «Pedido cerrado»
C3-4 con la cocina en marcha el cliente no puede 400 (con mensaje que lo explica)
C3-5 el DUEÑO sí cancela en «preparing» ...... 200   ← la salida que faltaba
C2  cinco «confirmar» a la vez → gana UNA .... 200,400,400,400,400
e2e-pedidos .................................. 49/49   (no asumía nada sobre `cancelled`)
guard-check del hotel ........................ ✅ las puertas en pie
```

**En tu script del índice había un defecto**: los comentarios SQL (`--`) estaban fuera/dentro del
`heredoc` en el sitio equivocado, así que bash intentaba ejecutarlos como comandos y, con `set -e`,
**el control «DESPUÉS» no llegaba a correr** y el script terminaba en error aunque el índice se creara
bien. **Arreglado en `D:\egapp\backend\sql\food-orders-index.sql.sh`**; ahora imprime
`DESPUES: índice VALIDO ✓` y sale con código 0. (Y mi primer arreglo lo empeoró: metí la nota dentro
del heredoc y psql la leyó como SQL. Los dos tropiezos quedan escritos en el fichero.)

---

## 2 · N1: LO MEDÍ, Y MI DECISIÓN ES SÍ

Tu corrección era correcta y mi recomendación de copiar `assignRider` era mala. Lo medí contra la base
de auditoría con el rol de auditoría (`lb42t-n1.cjs`):

```
sin carga : la tabla temporal SÍ se ve → el pool reutilizó la conexión → «transacciona» por casualidad
5 a la vez: las 5 secuencias cayeron en conexiones DISTINTAS (pids 28820/28821/28822/28824)
            y 4 de 5 escrituras SOBREVIVIERON a su propio ROLLBACK
```

**Decisión: se arregla**, como parte propia, con el diseño que te quita el bloqueo: el parámetro `tx`
**opcional** (`tx: Prisma.TransactionClient = this.prisma`), para que `ecomerse.service.ts:432` siga
llamando igual sin tocarse. Orden: `assignRider` (mismo módulo, aislado) → pagos → ecomerse, cada uno
con copia previa, compilación, guard-check y suites.

---

## 3 · EL MODELO DE DINERO (decidido por el dueño) Y LO QUE APARECIÓ AL PONER NÚMEROS

Números adoptados: **comisión de plataforma 8% con mínimo 500 XAF** · **reparto 500 XAF fijos + 5%** ·
**liquidación semanal** (al restaurante **y** al repartidor) · **sin sueldo base** (comisión pura por
entrega, con el efectivo descontado; `aPagar = max(comisiones − efectivo, 0)` y lo que sobra queda como
deuda que arrastra) · **pedido fuera de horario → a la apertura siguiente**.

**El hallazgo, que cambia el diseño**: con esos números, un pedido de **1 000 XAF dejaba −50 XAF** al
restaurante (mínimo 500 + reparto 550 > 1 000). El dueño decidió **opción A + tope de B**: importe
mínimo de pedido para reparto (**2 000 XAF**) **y** tope del **40%** a lo que se descuenta. Cuando el
tope recorta, **se recorta primero la comisión de la plataforma y solo después la del repartidor**.

```
10 000 XAF → plataforma 800 + reparto 1 000 = 1 800 · neto restaurante 8 200  ✓
 1 000 XAF → plataforma 500 + reparto   550 = 1 050 → TOPE 40% = 400 · neto 600 ✓ (antes −50)
```

---

## 4 · LO QUE HE CONSTRUIDO ENCIMA (todo tuyo por territorio: mira la lista de ficheros)

### Base de datos (`food-money-and-scheduled.sql.sh`, aditiva e idempotente)
- `wallet.food_commission_config` — comisiones **por restaurante**, con mínimo, tope y **importe mínimo
  de reparto**. Los 8 restaurantes de la demo ya tienen fila con los números adoptados.
- `wallet.food_orders` — **`platform_fee_xaf`, `rider_fee_xaf`, `restaurant_net_xaf`** (el desglose
  **congelado** al crear el pedido, igual que se congela el precio de los platos) y **`scheduled_for`**.
- `wallet.food_rider_ledger` — una línea por entrega: efectivo cobrado + comisión (UNIQUE por pedido).
- `wallet.food_rider_payouts` — cierre **semanal** (`period_start`/`period_end`), con `carry_over_xaf`.
  Un `CHECK` **impide por construcción** que se pague en negativo.
- `wallet.food_restaurant_settlements` — liquidación al restaurante.

> ⚠️ **LECCIÓN IMPORTANTE PARA LOS DOS**: las tablas las crea `postgres` y la app entra como
> `malabogo`. Las tablas viejas tenían los permisos puestos a mano; **las nuevas no**, y eso dio
> **siete errores 500** con `permission denied for table food_commission_config` (código 42501) que en
> la app se ven como «Error interno» sin pistas. **El compilador no lo detecta: solo se ve ejecutando.**
> Ya está arreglado en la migración **y he dejado `ALTER DEFAULT PRIVILEGES` en `wallet`**, así que la
> próxima tabla que cree cualquiera de los dos nace con permisos.

### Servidor
- **`src/food/food-fees.ts` (NUEVO)** — el dinero en un módulo puro, con **17/17 pruebas** que incluyen
  un barrido de 439 importes comprobando que al restaurante **nunca** le queda un neto negativo. Aquí
  vive la regla de precedencia (el tope manda sobre el mínimo) y está escrita, no implícita.
- **`food.service.ts`**: `createOrder` carga la configuración, **exige el importe mínimo para reparto**
  (400 con la cifra exacta y la alternativa de recoger), calcula y **guarda el desglose**, acepta
  `scheduledFor`, y devuelve el desglose. `mapOrder` devuelve el desglose y la hora programada
  (`null` = pedido antiguo, **no cero**). Nuevos: **`anotarCobroRepartidor`** y
  **`contabilidadRepartidor`** (semana desde el lunes, con la regla del dueño aplicada).
- **`food.controller.ts`**: `GET /food/rider/contabilidad` y `POST /food/rider/cobro`.
- **`food.dto.ts`**: `scheduledFor` declarado (**sin declararlo, Zod lo tiraría en silencio** — la
  misma trampa que avisaste con los seis campos del plato).

Verificado en vivo (**11/11**, `lb42v-verificar-dinero.cjs`): desglose congelado y coherente,
mínimo de reparto que rechaza a domicilio y permite recoger, `scheduledFor` guardado y validado, y la
contabilidad con la regla aplicada.

### App
- **`app/food-orders.tsx`**: botón **«Rechazar pedido»** para el dueño (y «Cancelar pedido» para el
  cliente) **solo donde el servidor lo va a aceptar** — con confirmación y avisando de que una factura
  Billing queda abierta. **Desglose del dinero en la tarjeta del dueño, en dos líneas separadas**
  (plataforma y reparto): es lo que evita que el comerciante crea que «le quitan el 20%» cuando la
  mitad es el reparto. Y **aviso del pedido programado**.
- **`app/food-rider.tsx`**: bloque **«Tu semana»** (entregas, comisiones, efectivo que lleva y lo que se
  le pagará, con la deuda en rojo) y **campo en línea para anotar el efectivo** de cada entrega.
- **`api/food.ts`**: tipos `OrderFees` y `ContabilidadRepartidor`, `riderContabilidad`,
  `riderAnotarCobro`, `scheduledFor` en la creación, y los campos nuevos en `FoodOrder`.

> ⚠️ **`Alert.prompt` es SOLO de iOS.** Mi primera versión lo usaba para pedir el efectivo: en Android
> —la plataforma real— el repartidor **no habría podido anotar nada** y su liquidación habría salido
> descuadrada sin ningún error. Por eso el importe se escribe en un campo en línea.

`tsc` **0 errores** · APK compilado e instalado (09:27) · **el botón «Rechazar pedido» verificado en
pantalla** en el panel del dueño.

---

## 5 · FICHEROS QUE HE TOCADO (para que no te sorprenda)

**Servidor** (`/opt/mirror/app/src/food/`): `food-fees.ts` *(nuevo)*, `food.service.ts`,
`food.controller.ts`, `food.dto.ts`. Copias previas en `/opt/mirror/backups/` con sello
`antes-dinero-20260912-09*` y `antes-lote1-20260912-081822`.

**App** (`D:\egapp`): `api/food.ts`, `app/food-orders.tsx`, `app/food-rider.tsx`,
`backend/sql/food-orders-index.sql.sh` (el arreglo del comentario).

**Mi guardia de convivencia**: antes de instalar `food.service.ts` compruebo que el MD5 de la copia
instalada es **exactamente** el que dejé yo. Si no coincide, el script **se para** y no pisa nada:

```
=== 0. ¿La copia instalada es la que dejé yo? ===
   food.service.ts actual: f8176eac41e7b11d4c1b8180d87de5d4
```

Está en `lb42v-aplicar-dinero.sh`. Úsalo (o dime el MD5 tuyo y lo actualizo) para que ninguno de los
dos pise al otro.

---

## 6 · PENDIENTE Y DECISIONES

### C5 ES TUYO — aquí tienes los enchufes exactos (yo no lo toco)

Me aparto de C5 por indicación del dueño. Para que no tengas que buscar dónde encaja, y sobre todo para
que **no despliegues `food.service.ts` desde una copia antigua**, este es el estado real:

```
food.service.ts en el servidor: md5 8ed444c82accebd5f2a16e5082c2cac5  (09:18:48 de hoy)
   ← es la MISMA que mi copia local, y lleva: 041 + tu Lote 1 (C2/C3) + el dinero
```

**Si despliegas una copia anterior a esa hora, se pierden tres cosas**: la migración 041 enchufada, tu
propio Lote 1 y todo el dinero. Lo digo sin rodeos porque es el único riesgo serio que veo: no es que
pises una línea, es que retrocedes el módulo dos días.

Y C5 encaja en **tres sitios**, ninguno de ellos tocado por el dinero:

| Dónde | Qué | Nota |
|---|---|---|
| `food.service.ts` → `mapDelivery` | añadir `paymentMethod: r.payment_method` | Es el único punto del servidor. **El dinero no toca `mapDelivery`**: mi código está en `createOrder`, `mapOrder`, `anotarCobroRepartidor` y `contabilidadRepartidor` |
| `api/food.ts` → `FoodDelivery` | añadir `paymentMethod: string` | Y en la tarjeta del repartidor, decir **«cobra 8 000 XAF»** o **«ya está pagado»** antes de salir |
| `app/food-rider.tsx` | mostrarlo en la tarjeta de la entrega | Ahí he añadido el bloque «Tu semana» y el campo para anotar el efectivo: **el aviso va encima de eso**, no dentro |

**Y ya hay una guarda en el servidor que juega a tu favor**: `anotarCobroRepartidor` **rechaza** que el
repartidor anote efectivo en un pedido pagado por Billing («Ese pedido ya estaba pagado: no hay nada que
cobrar en la puerta»). C5 es justo lo que le falta para saberlo **antes** de llegar, no después.

**Cuando termines**: pásame el md5 nuevo de `food.service.ts` y me vuelvo a basar en él. Mi script de
despliegue **se niega a instalar** si la copia del servidor no es la que dejé yo (así ninguno pisa al
otro), y con tu md5 actualizo la referencia.

### El resto de lo pendiente

1. **N1**: esperando tu confirmación para empezar (yo digo sí; ver §2).
2. **Cancelar un pedido Billing deja la factura abierta** (toca el módulo de pagos): la app lo avisa al
   usuario, y el admin puede rechazarla. Está documentado, no escondido.
3. **La liquidación semanal no se genera sola todavía**: las tablas y el cálculo están; falta el proceso
   que cierra la semana y crea la fila de `food_rider_payouts` / `food_restaurant_settlements`, y su
   pantalla de admin.
4. **Aviso al dueño de pedido nuevo (A3)**: sigue sin existir; es lo que más duele en la operación diaria.
5. **C4/C6 del informe**: el dueño decidió permitir pedir con el local cerrado **con aviso** y programar
   la entrega; y el modelo de efectivo está adoptado (§3). Con eso, C6 deja de ser «hueco» y pasa a ser
   «pendiente de construir el cierre semanal».
