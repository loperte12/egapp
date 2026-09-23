# Modelo de dinero y pedidos programados — lo que hace Meituan y cómo lo adaptamos

**Fecha:** 2026-09-12 · **Encargo:** «investiga cómo Meituan lo hace y lo adoptamos a nuestro estilo».

---

## 0 · Lo que has decidido (y lo que queda por decidir)

### Decidido
1. **Se puede pedir a un restaurante cerrado**, con aviso, y el dueño tiene el **botón de rechazar**.
2. **Un pedido fuera del horario se programa para el día siguiente**, y se entrega a la hora a la que
   abre el local (si el dueño ya no está).
3. **El dinero del repartidor lo adelanta la plataforma** (tú). Se le paga **semanalmente**.
4. **El repartidor cobra SOLO por entrega** (porcentaje + fijo por entrega). **Sin sueldo base.**
5. **El repartidor anota lo que saca de cada entrega** y su porcentaje; queda en **su contabilidad diaria**
   y en la tuya (**desde el admin**).
6. **Al restaurante se le descuentan las dos comisiones**: la de la plataforma **más** la del repartidor.

### Los números (adoptados)
| Concepto | Valor |
|---|---|
| Comisión de la plataforma | **8%** del pedido, con **mínimo 500 XAF** por pedido |
| Comisión del repartidor | **500 XAF fijos por entrega + 5%** del pedido (+ plus por distancia, si algún día se activa) |
| Liquidación al restaurante | **semanal** |
| Pago al repartidor | **semanal**, solo comisiones, con el efectivo descontado |
| Pedido fuera de horario | **a la apertura siguiente** |

**Los dos ciclos son semanales**: mismo ritmo para el restaurante y para el repartidor, y la misma
semana como unidad de cuadre. Es más trabajo administrativo que el mes, pero el dinero se mueve antes y
el efectivo en la mano de un repartidor no se acumula durante 30 días, que es el riesgo real.

### Lo que hay que decidir más adelante (no bloquea empezar)
- El **día** exacto del mes en que se paga al repartidor y el de la liquidación semanal.
- Si algún día se añade **plus por distancia** (la tabla lo contempla desde el principio).

### ⚠️ Consecuencia de quitar el sueldo base (hay que resolverla ahora, no en la primera nómina)
Sin sueldo base, **el repartidor que no entrega, no cobra** — y eso es una decisión de negocio legítima.
Pero crea un caso que el sistema tiene que saber resolver: **si el efectivo que tiene en la mano es mayor
que sus comisiones del mes, la liquidación sale NEGATIVA** (te debe dinero). Con sueldo base eso no
pasaba nunca. Regla adoptada:

> **La liquidación de un repartidor nunca se paga en negativo.** Si `efectivo en mano > comisiones`, su
> liquidación del mes es **0** y **el resto queda como deuda suya**, que arrastra al mes siguiente
> (`carry_over_xaf`). El panel del admin lo muestra en rojo hasta que la salde, y no se le asignan
> entregas nuevas con deuda vencida si así lo decides.

Es la única forma de que el efectivo no se convierta en un agujero silencioso. Lo dejamos escrito y
visible en su contabilidad diaria, no escondido en una nómina.

---

## 1 · Cómo lo hace Meituan (con las fuentes)

### 1.1 La tarifa está PARTIDA en dos, y eso es lo importante

Desde la reforma de **mayo de 2021** ([fuente oficial de Meituan](https://www.meituan.com/news/NN241025051008799)),
el cobro al comercio son **dos cosas distintas**:

| Concepto | Qué es | Cuánto |
|---|---|---|
| **技术服务费** (la comisión de verdad) | Mostrar el negocio, la tecnología, el tráfico, el soporte | **6% – 8%** del pedido |
| **履约服务费** (servicio de reparto) | Pagar al repartidor + centros de reparto + coordinación | **por tramos**: distancia + precio del pedido + franja horaria (+ clima). Solo existe si el reparto lo hace la plataforma |

El propio Meituan lo dijo así al desmentir el «30% de comisión»: *«la comisión real es 6-8%; el resto que
ve el comerciante es el coste del reparto»* ([ithome](https://m.ithome.com/html/868672.htm),
[NBD](https://m.nbd.com.cn/articles/2025-07-16/3947954.html)).

**Y hay un MÍNIMO por pedido (保底).** En la práctica, el comercio paga `max(porcentaje × pedido, mínimo)`.
Ejemplos reales medidos por comerciantes: **6,2% con mínimo 1,4 ¥**, con variantes por provincia de
**5,8% / 6,2% / 6,4%** y mínimos de **1,04 / 1,38 / 1,40 ¥**
([tabla comparativa](https://www.waimaiwanjia.com/?p=27466)). El total que se le descuenta al comercio
(comisión + reparto) se mueve entre el **15% y el 35%** según distancia y hora, y **más de la mitad es
reparto** ([análisis del sector](https://www.eshutong.com/archives/44318.html)).

### 1.2 El reparto se cobra por tramos, no por porcentaje
`总扣款 = 技术服务费 + (距离收费 + 价格收费 + 时段收费)`. Cuanto más lejos, más caro; de noche o en hora
punta, más caro; y en pedidos de precio bajo el reparto **cuesta más de lo que se cobra**, así que la
plataforma lo cruza con los pedidos caros. Es un dato que conviene tener delante: **el reparto, por sí
solo, da pérdidas**; Meituan facturó 441 亿 ¥ de reparto y gastó 480 亿 ¥ (primer semestre de 2024).

### 1.3 Cuándo se le paga al comercio
- **Meituan: cada 3 días.** «El cuarto día se paga a la tarjeta del comercio lo de los tres días
  anteriores».
- **Ele.me:** el dinero queda en un monedero del comercio y **no se pueden retirar los últimos 3 días**
  ([comparativa de plazos](https://www.waimaiwanjia.com/?p=20467)).

O sea: **la plataforma retiene el dinero unos días** — es lo normal, no un abuso, y hay que decidir
nuestro plazo.

### 1.4 Al repartidor se le paga por pedido, con pluses
Los anuncios de empleo de Meituan publican **≈6 ¥ por pedido** como base, más pluses por **distancia,
franja horaria, clima y hora punta**. Dos figuras distintas:
- **众包 (crowdsourcing):** cobra por pedido, con retirada frecuente.
- **专送 (dedicado, en un centro):** sueldo + comisión por pedido, gestionado por el concesionario del centro.

**Tu modelo se parece al segundo** (sueldo base + comisión, pago mensual), con una diferencia que anotamos
en §5: tú adelantas el dinero y cuadras a fin de mes.

### 1.5 Pedidos fuera del horario: Meituan NO deja pedir, salvo con «预订单»
Es exactamente la regla que has pedido, y está descrita así en el material de comerciantes:

> «Cuando el local no está en horario de apertura, **normalmente no se puede hacer un pedido**. Si se
> activa el **预订单** (pedido programado), **sí se puede pedir fuera del horario**, y la hora de entrega
> **se elige dentro de las franjas que el comercio tenga configuradas** para su horario.»
> — [tutorial de pedidos programados](https://www.aiyemao.com/1497.html)

Y se activa en **Comercio → Ajustes → Ajustes de reparto → «permitir pedir fuera de horario»**. La
diferencia con lo que tú quieres es pequeña y buena: Meituan deja elegir la hora; **tú quieres que por
defecto vaya a la apertura siguiente**, que es más simple para el cliente y evita que alguien pida a las 3
de la mañana para las 13:00 sin darse cuenta.

---

## 2 · Nuestro modelo (adaptación, no copia)

### 2.1 Las dos comisiones, al restaurante
```
Pedido del cliente ................................ 10 000 XAF
  − comisión de la plataforma (configurable, p. ej. 8%)
  − comisión del repartidor (configurable, p. ej. 5% + 500 XAF fijos por entrega)
  = lo que le queda al restaurante ............ se le ingresa en su liquidación
```
Con mínimo por pedido, como Meituan: `comisión_plataforma = max(porcentaje × total, mínimo)` — sin
mínimo, un pedido de 1 000 XAF deja 80 XAF, que no paga ni el soporte.

**Por qué dos líneas separadas y no una sola** (y esto lo copiamos de Meituan a propósito): el
restaurante tiene derecho a saber **cuánto paga por vender** y **cuánto paga por repartir**. Una sola
cifra del 20% es la que hace que los comerciantes de Meituan crean que les roban, cuando la mitad es el
reparto. En nuestro panel debe salir desglosado.

### 2.2 El repartidor: SOLO comisión por entrega (sin sueldo base), y su contabilidad diaria
```
Para cada entrega:
   • importe cobrado en efectivo (si el pedido es en efectivo)   ← lo anota él
   • su comisión por esa entrega (500 XAF + 5%)                   ← la calcula el servidor, no él
Al cerrar la semana:
   a pagar = Σ comisiones de la semana − efectivo que aún tenga en la mano
   · si sale positivo  → se le paga esa semana
   · si sale NEGATIVO  → se le paga 0 y el resto queda como deuda suya (arrastra a la semana siguiente)
```
**La última línea es la que evita el agujero.** Si el repartidor cobra 10 000 XAF en la puerta y no lo
entrega, ese dinero tiene que aparecer en algún sitio: en nuestro modelo **se descuenta de su
liquidación**, y si el efectivo supera sus comisiones **queda debiendo** — nunca se le paga en negativo
ni se le perdona. Es la forma en que el dinero en efectivo **no desaparece del sistema**, que es el
defecto C6 de la auditoría.

**Lo que significa para el repartidor, dicho sin adornos:** sin sueldo base, una semana sin entregas es
una semana sin ingresos. Es una decisión tuya y está adoptada; queda aquí escrito para que no sorprenda a
nadie en la primera liquidación. Si algún día quieres suavizarlo sin volver al sueldo fijo, la palanca
natural es un **mínimo garantizado por día trabajado** (solo en los días en que se conecta), no un fijo.

### 2.4 ⚠️ LO QUE HA APARECIDO AL PONER NÚMEROS: **los pedidos baratos salen en NEGATIVO**

Al ejecutar la migración se calcularon dos ejemplos con los números adoptados, y el segundo es un
problema real que hay que resolver **antes** de calcular comisiones de verdad:

```
Pedido 10 000 XAF → plataforma 800 + reparto 1 000 = 1 800 · neto restaurante  8 200 XAF  ✓
Pedido  1 000 XAF → plataforma 500 (manda el MÍNIMO) + reparto 550 = 1 050 · neto −50 XAF  ✗
```

Con un pedido de 1 000 XAF, el restaurante **paga 50 XAF por servirlo**. Y no es un caso raro: con el
mínimo de 500 y un fijo de reparto de 500, cualquier pedido por debajo de **1 100 XAF** sale en pérdidas
para el restaurante.

**Cómo lo evita Meituan** (y aquí se ve por qué su modelo es así): el **reparto lo paga el cliente**, no el
comercio; el comercio paga sobre todo la comisión; y hay un **importe mínimo de pedido para repartir**
(起送价). Nuestro modelo, tal como lo has decidido, pone **las dos comisiones al restaurante**, así que hay
que poner una de estas tres barreras:

| Opción | Qué hace | Mi lectura |
|---|---|---|
| **A · Importe mínimo de pedido** (起送价) | No se puede pedir a domicilio por debajo de, p. ej., **2 000 XAF** | La más simple y la que hace Meituan. No toca el reparto ni el recorte |
| **B · Tope a lo que se descuenta** | El descuento nunca pasa del **40%** del pedido; si lo pasa, se recorta la comisión de plataforma | Protege al restaurante, pero **alguien paga la diferencia**: o tú, o el repartidor |
| **C · Que el reparto lo pague el cliente** | Como Meituan: el envío se le cobra al cliente | Es lo más sano económicamente, pero **cambia lo que decidiste** («desde el restaurante se les descuenta…») |

**Mi recomendación: A + un tope de seguridad de B.** El importe mínimo evita el 99% de los casos (nadie
pide un plato de 1 000 XAF a domicilio pagando 550 de reparto) y el tope garantiza que **ningún pedido
deje al restaurante en negativo**, que es lo que no puede pasar nunca. La opción C es la correcta a largo
plazo, pero es tu decisión y no la tomo yo.

### 2.3 Quién ve qué
| Quién | Qué ve |
|---|---|
| **Restaurante** | Cada pedido con su desglose (comisión plataforma, comisión reparto, neto) y su liquidación; y **el botón de rechazar** |
| **Repartidor** | Su **contabilidad diaria**: entregas, efectivo cobrado, comisión acumulada; y su liquidación del mes (sueldo base + comisiones − efectivo) |
| **Admin (tú)** | Todo: comisiones por restaurante, efectivo en manos de cada repartidor, nóminas, y el cuadre del mes |

---

## 3 · Pedidos fuera de horario (programados)

### La regla
1. El cliente puede pedir **aunque el local esté cerrado**: se le avisa **en el mismo sitio donde
   confirma**, no en un texto pequeño: «El local está cerrado. Tu pedido se entregará **mañana a las
   08:00**, cuando abra.»
2. El pedido nace **programado**, no `placed`: el dueño **no lo ve como urgente** hasta que llega su hora.
3. A la hora de apertura, el sistema lo **suelta** y entra al flujo normal (con su aviso al dueño).
4. **El dueño puede rechazarlo** en cualquier momento antes de cocinarlo (y desde hoy ya puede: el botón
   de cancelar del Lote 1 está desplegado y **verificado en vivo**).
5. Si el local cambia su horario o cierra ese día, los pedidos programados **avisan** en vez de perderse.

### Los dos estados nuevos
```
scheduled  → pedido aceptado, en espera de la hora de apertura
released   → ya es un pedido normal (pasa a `placed` y sigue el flujo de siempre)
```
En la base, `scheduled_for timestamptz` en `wallet.food_orders` (aditiva, anulable, sin tocar nada
existente) y el `CHECK` de estado ampliado. **No hace falta tocar la máquina de estados**: `released`
es `placed` con un aviso.

---

## 4 · Lo que hay que construir

### 4.1 Base de datos (todo aditivo)
| Tabla / columna | Para qué |
|---|---|
| `wallet.food_commission_config` | Porcentajes y mínimos **por restaurante** (y por vertical si algún día hace falta). Nada de números en el código |
| `wallet.food_orders`: `scheduled_for`, `released_at` | Pedidos programados |
| `wallet.food_orders`: `platform_fee_xaf`, `rider_fee_xaf`, `restaurant_net_xaf` | **El desglose se congela en el pedido** al crearlo, como ya se congela el precio de los platos: si mañana cambian las comisiones, lo pasado no se corrompe |
| `wallet.food_rider_ledger` | Una línea por entrega: pedido, efectivo cobrado, comisión, fecha |
| `wallet.food_rider_payouts` | Cierre mensual: **Σ comisiones − efectivo**, `carry_over_xaf` (la deuda que arrastra) y fecha de pago. **Sin sueldo base** |
| `wallet.food_restaurant_settlements` | Liquidación al restaurante (bruto, comisiones, neto, periodo, fecha) |

### 4.2 Servidor (módulo comida)
- Calcular y **congelar** el desglose al crear el pedido; devolverlo en la vista del dueño y del admin.
- Avisar al dueño de pedido nuevo (hoy no le avisa nadie — defecto A3): como mínimo consulta periódica.
- `POST /food/orders/:id/cancel` (ya existe la transición) desde la app del dueño y del cliente.
- Suelta de pedidos programados (una tarea que revisa `scheduled_for`).
- Contabilidad del repartidor: anotar entrega y efectivo; su vista diaria; cierre mensual.

### 4.3 App
- **Restaurante:** desglose por pedido, «Rechazar pedido», y su liquidación.
- **Cliente:** el aviso de cerrado con la hora de entrega, y el pedido en su lista como «programado».
- **Repartidor:** anotar el efectivo cobrado en cada entrega (un toque) y ver su acumulado.
- **Admin:** comisiones, efectivo en manos de cada repartidor y nóminas.

### 4.4 Quién lo hace
Esto cruza el trabajo del otro agente (él lleva el módulo de comida y la migración a Life Book). Por
tanto: **primero se acuerda, después se toca**. Propuesta de reparto: la base de datos y el cálculo del
desglose son suyos (es su módulo); la UI del repartidor y del admin la puedo hacer yo, que es donde
tengo el entorno de control montado.

---

## 5 · Números adoptados (ya no hay nada que decidir aquí)

| Concepto | Valor adoptado | De dónde sale |
|---|---|---|
| Comisión de plataforma | **8% con mínimo 500 XAF** | Rango de Meituan (6-8%) + mínimo por pedido, que es su mecanismo real |
| Comisión de reparto | **500 XAF fijos + 5% del pedido** | El reparto se cobra por coste, no por porcentaje (distancia/hora en Meituan) |
| Sueldo base del repartidor | **NO existe** | Decisión tuya: comisión pura por entrega |
| Pago al repartidor | **Mensual**, solo comisiones, con el efectivo descontado | Lo pediste así |
| Liquidación al restaurante | **Semanal** | Meituan hace 3 días; Ele.me retiene 3 |
| Efectivo | Lo cobra el repartidor y **se le descuenta**; si supera sus comisiones, **queda debiendo** (nunca se paga en negativo) | Es lo único que cierra el agujero de C6 |
| Pedido programado | Va **a la apertura siguiente**; hora elegible si el local la configura | Lo pediste así y es lo que hace Meituan |

**Queda por concretar solo el calendario** (qué día del mes se paga al repartidor y qué día se liquida al
restaurante). No bloquea empezar: son columnas de fecha, no lógica.

---

## 6 · Lo que NO copiamos de Meituan

1. **La comisión que sube con el precio del pedido** en la parte de reparto: aquí un pedido caro no
   cuesta más de repartir. Cobrar por precio es lo que dispara el «20%» que la gente no entiende.
2. **Retener el dinero del comercio 3 días sin decirlo**: si retenemos, **se dice en el panel** con la
   fecha exacta de pago.
3. **El reparto como pérdida estructural**: Meituan pierde dinero en el reparto y lo compensa con
   pedidos caros. Nosotros no tenemos ese volumen: la comisión de reparto debe **cubrir el coste real**
   desde el primer pedido, o el modelo se sostiene con tu bolsillo.
4. **La subasta de pedidos y el castigo por rechazo** al repartidor: aquí el repartidor es plantilla, no
   competencia.
5. **El documento de identidad del cliente**: es exigencia regulatoria china; en Guinea Ecuatorial es una
   **cuestión legal local que hay que confirmar antes** de pedir datos personales.

---

## 7 · Lo que verifiqué y lo que no

**Verificado con fuente oficial o de comerciantes:** la partición comisión/servicio de reparto y su
rango 6-8%; que el reparto se cobra por distancia, precio y horario; el concepto de mínimo por pedido
con cifras reales (6,2% / 1,4 ¥); los plazos de liquidación (Meituan cada 3 días, Ele.me retiene 3); y
que Meituan **no permite pedir con el local cerrado salvo activando pedidos programados**, eligiendo hora
dentro del horario.

**No verificado:** la comisión exacta por ciudad y categoría (no es pública: es contractual), el pago
exacto por pedido de cada ciudad, y las condiciones reales de los centros de reparto. Las cifras de «≈6 ¥
por pedido» salen de **anuncios de empleo**, no de un contrato: sirven como orden de magnitud, no como
dato.
