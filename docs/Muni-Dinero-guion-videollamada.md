# Guion para la videollamada con Muni Dinero
### Cómo explicar el proyecto y el monedero en colaboración

*Uso: este es tu guion de conversación. El documento que les dejas **después** es
`Muni-Dinero-propuesta.md`. Objetivo de la llamada: **acordar un piloto**, no firmar nada hoy.*

**Duración:** 45–60 min · **Tú hablas el 60 %, ellos el 40 %.** Si hablas tú todo el rato, no
sabrás qué necesitan.

---

## 0. Antes de empezar (5 min, preparación tuya)

- [ ] Ten a mano las **cifras reales**: usuarios, operaciones al mes, comercios, agentes, ciudades.
- [ ] **La app abierta y con sesión iniciada** en el teléfono (ver el guion de demo, §8).
- [ ] Saber **el nombre y el cargo** de cada persona de la llamada.
- [ ] Decide de antemano **qué pides**: una reunión técnica y un **piloto de 30 días en una ciudad**.
- [ ] Una botella de agua. Vas a hablar mucho.

---

## 1. Apertura (2 minutos) — la frase que lo resume

> «EG Route Plan es una super-app para Guinea Ecuatorial: taxi, comida a domicilio, mercado, hotel,
> alquiler, trabajo y billetes Ciudad a Ciudad. Todo en una aplicación, funcionando hoy.
>
> Lo que une todas esas cosas es el dinero: cada pedido y cada reserva se paga dentro de la app.
> Y ahí está el problema: hoy ese dinero se mueve en efectivo.
>
> Hemos construido un monedero que ya funciona: saldo, PIN, recarga y retirada con agentes, y
> verificación de identidad. **Lo que no queremos improvisar es la parte regulada.** Por eso
> queremos hablar con vosotros.»

**Por qué empieza así:** defines el proyecto, dices que ya funciona y llegas a la colaboración en
90 segundos, sin pedir nada todavía.

---

## 2. Qué es la app (5 minutos) — con la pantalla compartida

Enséñala, no la describas. Abre la app y **nombra los servicios pasando por encima**: taxi, comida,
mercado, hotel, Ciudad a Ciudad, Life Book, alquiler, trabajo.

> «No es una idea ni un prototipo: está en Google Play, tiene backend propio y comercios reales
> usándola.»

Cierra el bloque con esto:

> «Cada uno de esos servicios genera **dos cosas que os interesan**: gente que quiere pagar sin
> efectivo y comercios que necesitan cobrar a distancia.»

---

## 3. El problema, en vuestro idioma (5 minutos)

Cuatro frenos, cortos:

1. **Efectivo en la calle**: sin recibo, sin historial, y con riesgo para quien lo lleva.
2. **Nadie paga por adelantado a un desconocido**: sin confianza no hay comercio a distancia.
3. **Devoluciones y disputas** resueltas por teléfono, sin rastro.
4. **Gente con teléfono y sin cuenta bancaria.**

> «Nosotros hemos resuelto la **experiencia** de todo eso. La **parte regulada** —custodia,
> liquidación, cumplimiento— es la que no vamos a improvisar. Y es exactamente vuestro terreno.»

---

## 4. El monedero que ya funciona (7 minutos) — **este es el bloque que convence**

No lo cuentes: **muéstralo**. Y di lo que hay detrás de cada cosa, porque eso es lo que ellos
evalúan:

| Lo que enseñas | Lo que dices |
|---|---|
| Saldo y movimientos con estado | «Cada operación queda registrada con su estado: completada, en custodia, reembolsada.» |
| Recarga y retirada con **agentes de efectivo** | «El agente entrega el efectivo y **el cliente confirma con un código**. No hay operación sin las dos partes.» |
| **PIN** del monedero | «Ninguna operación de dinero sale sin PIN, y se bloquea tras varios intentos.» |
| **Verificación de identidad** (documento + prueba de vida) | «Ya tenemos KYC. Podemos adaptarlo a vuestros requisitos.» |
| Límites diarios | «Hoy son configurables. Los fijamos con vosotros.» |
| Pago de un pedido con **dinero en custodia** | «El dinero no llega al vendedor hasta que el pedido se entrega. Si se cancela, se devuelve.» |
| **Idempotencia** en cada intento de pago | «Si se cae la red a mitad de un pago y el usuario reintenta, **no se cobra dos veces**. Esto ya está resuelto.» |

**Esa última línea es la que un socio financiero quiere oír.** Es el detalle que demuestra que esto
se ha pensado para dinero real, no para una demo.

---

## 5. Cómo lo integraríamos con Muni Dinero (10 minutos) — **el corazón de la llamada**

Di esto despacio, y **en tres fases**. Que quede claro que **no les pedimos que cambien nada para
empezar**.

### Fase 1 — Muni Dinero como medio de pago *(semanas 1–6)*

- El cliente elige **Muni Dinero** al pagar en la app.
- Se le lleva a la confirmación en su entorno (app o USSD, como prefieran).
- Confirmado el cobro, el pedido avanza; **vosotros liquidáis al comercio**.
- **Lo que necesitamos de vosotros**: API de cobro (inicio + confirmación), consulta de estado, y
  credenciales de pruebas.
- **Quién hace qué**: vosotros custodiáis y liquidáis; nosotros orquestamos pedido, entrega y
  disputa.
- **Lo que NO cambia**: vuestro saldo, vuestras reglas, vuestra comisión. Solo sumáis un canal.

### Fase 2 — El saldo vive en Muni Dinero *(meses 3–6)*

Aquí es donde el monedero pasa a estar **alojado en vosotros**:

| Operación | Cómo funciona |
|---|---|
| **Alta de usuario** | La app captura documento + prueba de vida; vosotros validáis y abrís la cuenta |
| **Recarga** | El agente entrega el efectivo, el cliente confirma con su código, **vosotros acreditáis el saldo** |
| **Retirada** | Orden en la app → **vosotros debitáis** → el agente entrega el efectivo con el código del cliente |
| **Pago de un pedido** | **Retención (hold)** del importe → se libera al entregar, o se devuelve si se cancela |
| **Conciliación** | Cuadre diario de operaciones; cada intento lleva **clave única** para que un reintento no duplique un cobro |

> «El usuario no nota la diferencia, salvo una: **su dinero está en Muni Dinero**, con las garantías
> de una entidad autorizada, y no en una aplicación.»

### Fase 3 — Productos juntos *(a partir del mes 6)*

- **Red de agentes compartida**: sumamos la nuestra a la vuestra (o al revés) y compartimos comisión.
- **Envío de dinero entre ciudades**, usando nuestras rutas y comercios como puntos de recogida.
- Pago de servicios y recargas desde la app.
- **Adelanto al comerciante** sobre ventas ya cobradas: con historial de ventas en la app, se puede
  ofrecer capital de trabajo. *(Este es el producto que más margen tiene para vosotros.)*

### Reparto de responsabilidades (enséñalo como tabla)

| | EG Route Plan | Muni Dinero |
|---|---|---|
| Usuarios, comercios y app | **✔** | |
| Custodia de fondos y liquidación | | **✔** |
| Cumplimiento y regulador | | **✔** |
| KYC (captura) | **✔** | valida y abre cuenta |
| Límites y antifraude | reglas en la app | **política y control** |
| Red de agentes | **✔** (hoy) | **✔** (se suma) |
| Atención al cliente del monedero | primer nivel | segundo nivel |
| Integración técnica | **✔** (nosotros la construimos) | API y credenciales |

---

## 6. Qué pedimos y qué ofrecemos (3 minutos)

**Pedimos** (dilo entero, sin marear):
1. Una **reunión técnica** con quien decida sobre su API.
2. Su **modelo de integración** y sus condiciones: comisión, requisitos de KYC, límites.
3. **Un piloto de 30 días en una ciudad**, con un número cerrado de comercios.

**Ofrecemos**:
- Usuarios y comercios que **ya quieren pagar sin efectivo**.
- **La integración hecha**: la construimos nosotros.
- **El KYC ya construido**, adaptable a sus requisitos.
- Volumen desde el primer día en comida, mercado, hotel y transporte.

---

## 7. Objeciones y cómo responder (tenlas apuntadas)

| Si dicen… | Respondes… |
|---|---|
| «¿Y si mañana desaparecéis?» | «El saldo está en Muni Dinero, no en la app. El usuario puede operar con vosotros directamente. Y por eso queremos el modelo A: para que no dependa de nosotros.» |
| «¿Quién asume el fraude?» | «Proponemos repartirlo por tipo: identidad falsa es del KYC (compartido), operación no reconocida con PIN y código, nuestra; y lo definimos por escrito en el piloto.» |
| «¿Cuánto volumen vais a traer?» | «Empecemos por el piloto: una ciudad, N comercios, y **métricas acordadas**. Prefiero un número pequeño y cumplido que una promesa.» |
| «¿Por qué no lo hacéis solos?» | «Porque no somos entidad de dinero electrónico y **no vamos a improvisar la custodia de dinero de la gente**. Nuestro negocio es la plataforma; el vuestro, el dinero.» |
| «¿Nos estáis haciendo competencia?» | «Al contrario: **os llevamos clientes**. No repartimos un pastel, agrandamos el vuestro.» |
| «¿Quién paga la integración?» | «El desarrollo, nosotros. Vosotros ponéis las credenciales y vuestra parte operativa.» |
| «¿Qué pasa si un cliente reclama?» | «Hay un flujo de disputa con estado y trazabilidad, y escalado acordado. Hoy ya funciona con pedidos y reembolsos.» |
| «Necesitamos estudiarlo» | «Perfecto: os dejo el documento de una página y os llamo el «día». ¿Quién más tendría que estar en la próxima?» |

---

## 8. Guion de la demo en vivo (7 minutos, en este orden)

1. **Abrir la app** y pasar por los servicios (30 s). No entres en ninguno.
2. **Monedero**: saldo, movimientos con estado, y el PIN (30 s).
3. **Recarga/retirada**: enseña la lista de **agentes con su zona y código** (30 s).
4. **Elegir un producto del mercado o un plato y llegar al pago** (2 min): aquí se ve el pago sin
   efectivo y el **dinero en custodia**.
5. **Hotel**: la reserva con **señal** y el resto al llegar (1 min).
6. **Ciudad a Ciudad**: billete con asiento o vehículo completo (1 min).
7. **Verificación de identidad**: la pantalla del KYC, sin completarla (30 s).

**Qué NO tocar en directo:** no canceles un pedido real, no envíes un reporte, no publiques nada, no
hagas una retirada. **Un fallo en directo no es un desastre; una operación real sí.**

---

## 9. Cierre (2 minutos) — la petición concreta

> «Resumiendo: tenemos la app, los usuarios y los comercios; vosotros tenéis la licencia, la
> custodia y la experiencia. Podemos empezar por lo fácil —que Muni Dinero sea un medio de pago
> dentro de nuestra app— y crecer hasta que el saldo viva en vosotros.
>
> Lo que os pido hoy es una cosa: **una reunión técnica y un piloto de 30 días en una ciudad**.
> Nosotros ponemos el trabajo. Vosotros ponéis las reglas. Y si funciona, escalamos a todo el país.»

**Y calla.** Deja que respondan ellos.

---

## 10. Después de la llamada (mismo día)

- [ ] Enviar `Muni-Dinero-propuesta.md` con **las cifras rellenadas**.
- [ ] Anotar **lo que pidieron** y las dudas que quedaron sin responder.
- [ ] Proponer **fecha concreta** para la reunión técnica.
- [ ] Apuntar sus condiciones (comisión, KYC, límites) en este mismo documento.

---

### Los tres mensajes que deben quedarles

1. **Ya funciona** (no es una idea): app, monedero, agentes, KYC, custodia.
2. **No competimos**: les llevamos clientes y les dejamos el dinero.
3. **Empezamos por lo fácil**: medio de pago primero, saldo alojado después.
