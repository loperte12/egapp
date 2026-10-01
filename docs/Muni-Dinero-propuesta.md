# EG Route Plan × Muni Dinero
## Propuesta de colaboración para el monedero virtual


---

## 1. Qué es EG Route Plan

**Una super-app para Guinea Ecuatorial**: en la misma aplicación se pide un taxi, se compra
comida a domicilio, se compra y vende en el mercado **Ecomerse**, se reserva hotel, se compran
billetes de **Ciudad a Ciudad**, se alquila una vivienda o un coche, se busca trabajo y se
publica contenido en **Life Book**.

Todo eso ya funciona en un teléfono Android, con backend propio, y **lo que une todas esas
actividades es el dinero**: cada pedido, cada reserva, cada billete y cada servicio se paga dentro
de la app.

**Ese es el proyecto del monedero**: pasar de «pago en efectivo al recibir» a un **monedero
virtual** que mueva el dinero de forma segura, con trazabilidad y con red de agentes.

---

## 2. El problema que resolvemos juntos

Hoy, en la app, el dinero se mueve así: el cliente paga en efectivo al repartidor, al conductor o
al hotelero; los vendedores del mercado gestionan pedidos y reembolsos a mano; y quien no está en
la misma ciudad depende de que alguien lleve el efectivo.

Los frenos son siempre los mismos, y son los que **Muni Dinero conoce mejor que nadie**:

- **Efectivo en la calle**: sin recibo, sin historial y con riesgo para quien lo lleva encima.
- **Nadie paga por adelantado a un desconocido**: sin confianza no hay comercio a distancia.
- **Devoluciones y disputas**: hoy se resuelven por teléfono, sin rastro.
- **Sin acceso financiero**: mucha gente tiene teléfono, pero no cuenta bancaria.

El monedero ya resuelve la **experiencia**: saldo, recargas, retiradas, pagos, custodia del dinero
hasta que el pedido se entrega, reembolsos con estado visible y un PIN que protege cada operación.
Lo que no queremos —ni debemos— improvisar es **la parte regulada**: custodia de fondos,
liquidación, cumplimiento y red de efectivo. **Ahí es donde entra Muni Dinero.**

---

## 3. Qué ya está funcionando hoy (no es una idea)

No venimos con una presentación: venimos con la app instalada y operando.

| Capacidad | Estado |
|---|---|
| Monedero con saldo real, movimientos con estado y PIN de 4 dígitos | **Funcionando** |
| **Recarga y retirada en efectivo con agentes** (con zona y código de agente) | **Funcionando**, con agentes activos |
| Panel del agente: confirma cada entrega con el **código del cliente** (OTP) | **Funcionando** |
| **Verificación de identidad (KYC)**: documento + prueba de vida + aprobación | **Funcionando** |
| Límites diarios de recarga y retirada | **Funcionando** (configurables) |
| Pago de pedidos de comida y de mercado, con **dinero en custodia** hasta la entrega | **Funcionando** |
| Reserva de hotel con **señal** (15–30 %) y resto al llegar | **Funcionando** |
| Billetes Ciudad a Ciudad: asiento o vehículo completo, pago al abordar o al llegar | **Funcionando** |
| Planes y servicios de pago (publicar, destacar, tienda) con reembolsos y disputas | **Funcionando** |
| Clave de idempotencia en cada intento de pago (un reintento **no** cobra dos veces) | **Funcionando** |

Cifras de operación actuales *(a completar por el equipo antes de enviar)*:

- Usuarios registrados: **«dato»**
- Movimiento mensual del monedero (XAF): **«dato»**
- Agentes de efectivo activos: **«dato»** · Ciudades cubiertas: **«dato»**
- Comercios y restaurantes activos: **«dato»**

---

## 4. Por qué esto le interesa a Muni Dinero

1. **Una cartera de usuarios que ya paga dentro de una app.** No hay que enseñarles a usar un
   monedero: ya lo usan para pagar comida, hotel o billetes. Cada uno de esos pagos es volumen
   para su red.
2. **Comercios con necesidad real de cobrar a distancia.** El mercado Ecomerse, las tiendas de
   Life Book, los restaurantes y los hoteles necesitan **cobrar sin efectivo** y con garantía.
3. **Una red de agentes que ya trabaja con códigos y zonas**: si su red es más amplia, se suma; si
   la nuestra sirve, se comparte. En los dos casos, más puntos de recarga y retirada.
4. **Custodia y confianza**: hoy el dinero de los pedidos lo guarda la plataforma hasta que el
   servicio se entrega. Con un socio autorizado, esa custodia pasa a donde debe estar.
5. **Cumplimiento hecho en conjunto**: el KYC ya existe en la app; su experiencia en normativa
   convierte eso en un proceso que aguanta una revisión.

---

## 5. Modelos de colaboración que proponemos

No traemos un contrato cerrado: traemos cuatro formas de encajar, y **ustedes eligen** la que
mejor encaje en su modelo.

**A. Monedero alojado en Muni Dinero (el más completo).**
El saldo del usuario vive en Muni Dinero. La app es la interfaz; ustedes son la entidad. Nosotros
aportamos usuarios, comercios y flujos; ustedes, custodia, liquidación, cumplimiento y la relación
con el regulador.

**B. Riel de pagos (el más rápido de arrancar).**
Muni Dinero se usa como **medio de pago** dentro de la app (cobro a comercios, pago de pedidos y
billetes), sin custodia de saldos. Empezaríamos por aquí mientras se prepara el modelo A.

**C. Red de agentes compartida.**
Sumar su red a los puntos de recarga y retirada, o al revés: nuestros agentes como puntos suyos.
Se comparte la comisión por operación.

**D. Productos conjuntos.**
Recarga de su monedero desde la app, pago de servicios, envío de dinero a familiares entre
ciudades, y adelanto al comerciante sobre ventas ya cobradas.

---

## 6. Qué pedimos y qué ofrecemos

**Pedimos:**
- Una **reunión de trabajo** (60 minutos) con su equipo de negocio y el técnico.
- Saber su **modelo de integración**: API, agregador, o proceso manual al principio.
- Sus condiciones: comisión por operación, requisitos de KYC, límites y tiempos.
- Claridad sobre **licencias y cobertura** (qué podemos hacer hoy y qué requiere autorización).

**Ofrecemos:**
- **Los usuarios y los comercios**: tráfico real que ya quiere pagar sin efectivo.
- **La integración hecha**: la app, el backend y el equipo técnico. Trabajamos con API.
- **El KYC ya construido**, que podemos adaptar a sus requisitos.
- **Volumen desde el primer día** en comida, mercado, hotel y transporte interurbano.
- **Datos y trazabilidad**: cada operación queda registrada con su estado, su referencia y su
  historial de reembolso o disputa.

---

## 7. Lo que no somos (y por qué eso nos hace buenos socios)

**EG Route Plan no es una entidad de dinero electrónico y no pretende serlo.** No custodiamos
fondos por vocación: lo hacemos hoy porque no existe todavía un socio autorizado que lo haga.

Eso significa que **no competimos con Muni Dinero: le llevamos clientes.** Nuestro negocio es la
plataforma de servicios; el suyo, el dinero. La colaboración no reparte un pastel: **agranda el
suyo**.


