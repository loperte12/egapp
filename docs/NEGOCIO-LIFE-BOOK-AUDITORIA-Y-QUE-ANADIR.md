# LIFE BOOK — Auditoría del negocio y qué añadir (16/09/2026)

> Documento de trabajo del dueño. Se escribe en dos partes: **(A) auditoría del negocio desde dentro**
> (lo que la app hace hoy, medido en el código y en el móvil) y **(B) la investigación de fuera**
> (plantillas de producción, MedusaJS, pagos reales en Guinea Ecuatorial y mercado local).
>
> Regla de este documento: **lo medido se dice como medido y lo que es opinión se dice como opinión.**
> Nada de cifras inventadas: donde no hay dato, se escribe «dato no encontrado».

---

## A.0 Correcciones y estado (tras la ronda 12 del otro agente)

**Tres afirmaciones de este documento eran FALSAS.** Se corrigen aquí con su prueba, porque el resto del
documento se apoya en la auditoría que las produjo:

| Afirmación falsa | Realidad medida |
|---|---|
| «El detalle del pedido está en blanco» | **Falso positivo:** la pantalla pinta bien (28 textos medidos, incluido «Lee este código…» y el código real que devuelve la API). El método de píxeles me engañó: las tarjetas del tema se parecen al fondo |
| «`orders.order_no` no tiene índice único» | **Ya existía**; y ahora hay mostrador atómico: 4 compras a la vez dan números consecutivos (**214 pedidos, 214 números distintos**) |
| «Falta buscador» | **Ya existía:** catálogo con caja de búsqueda y búsqueda en servidor por título, descripción, tienda y categoría |

**Lo que estaba bien diagnosticado ya está arreglado y medido:**

* **`sales_count`**: vuelve a contar al entregar por las dos vías, sin contar dos veces → «N ventas» está vivo.
* **Código de entrega blindado**: 5 fallos seguidos → 15 minutos sin admitir intentos, y el `UPDATE` con `AND status <> 'delivered'`.
* **Compare-and-set del estado**: 8 cancelaciones a la vez → gana una y 7 reciben `ORDER_CHANGED`; **sin el arreglo el stock se inflaba de 20 a 27**.
* **El pago cerrado de verdad**: contra entrega y pago en tienda quedan cobrados al entregar, y **la tienda marca cobrado con justificante**, con rastro de quién y cuándo (`pruebas/lb80a`, 14 comprobaciones) y el botón verificado en pantalla.
* **Y de §A.7/§C**: reseñas (estrellas en la app + media ponderada), reclamación con **motivo obligatorio**, **comisión 8 % con mínimo 500 XAF y tope 40 %** congelada por pedido, **libro de doble partida que cuadra**, saldo del vendedor y liquidación manual, la pieza **`PaymentProvider`** (el importe lo pone el servidor; **un aviso suelto no cobra nada**), agotados fuera del escaparate y de los contadores, idempotencia con **huella del contenido**, cupón que no ha empezado **no se recoge**, y **el coste de envío lo cierra la tienda antes de entregar** (caja 14 000 = 11 040 + 960 + 2 000).

**Queda abierto, medido y sin tocar a ciegas:**

1. Con **8 compras simultáneas** la mitad fallan por **tiempo de transacción** (no es el número, ni el producto, ni el pool).
2. **Cancelar un pedido ya cobrado no devuelve el cobro** (va junto con devoluciones).
3. **Push**: bloqueado por cuentas de **Expo/EAS + clave FCM** (del dueño).
4. **Cobro real**: la pieza está lista; falta el acuerdo con **Maviance / Notch Pay / Getesa**.

**Estado del sistema:** `pm2` online, `tsc --noEmit` en 0 en cada parche, y **todos los datos de prueba limpiados** (0 asientos, 0 reseñas, 0 comisiones de prueba, stock 20, política de envío restaurada).

---

# A. Auditoría del negocio desde dentro

## A.1 Qué es Life Book hoy, en una frase

Una **super-app** (transporte, hotel, alquiler, trabajo, comida, viajes…) donde la parte de **comercio**
funciona como un **mercado social**: cualquiera con cuenta puede publicar productos, hay escaparates de
tiendas, **chat comprador-vendedor dentro de la app** con tarjetas de producto, carrito, dos cajas
(la del producto y la del carrito), cupones, pedidos, panel de comerciante y un **asistente de IA
(Cucucul)** que recomienda productos reales del catálogo y resuelve «cómo se hace» dentro de la app.

## A.2 Lo que ya está construido y funciona (con su prueba)

| Pieza | Estado | Prueba / medición |
|---|---|---|
| Catálogo, ficha de producto con **variantes** (talla/color) y **guía de tallas** | Funciona | Probado en móvil con productos de prueba; `pruebas/lb60a` 54/54 |
| **Carrito** y caja del carrito | Funciona | Confirmado por el dueño en pantalla; `lb72a` (cupones) OK |
| **Caja del producto** (comprar desde la ficha) | **Arreglada hoy** | Cuerpo en blanco → 2 textos en pantalla; ahora **24** (artículo, 5 formas de pago, cupón, nota) |
| **Cupones** (recoger, aplicar, descontar en el pedido) | Funciona | `lb72a`; descuento calculado en el servidor |
| **Pedidos** con estados y **código de entrega** | Funciona en servidor | Pruebas `lb70a`, `lb71a` |
| **Chat del pedido** con tarjeta de producto y aviso a la tienda | Funciona | Documentado en las tandas E y P |
| **Asistente de IA** con productos reales, fotos y 17 temas de ayuda | Funciona | `lb62a`, `lb63a`, `lb65a` (visión), `lb66a` (personal shopper, chino, memoria de estilo) |
| Formas de pago: efectivo contra entrega, transferencia, «señal», pago en tienda, monedero | Funciona | 5 activas en la BD, se ven en la ficha y en la caja |
| **Prohibición de stock negativo** … | **Ver §A.4: aquí está el agujero grande** | — |

## A.3 El diagnóstico del negocio en cinco frases (opinión, marcada como tal)

1. **Life Book ya tiene el escaparate y la conversación, pero no tiene el negocio**: hoy nadie cobra
   comisión, no hay liquidación al vendedor y no hay ninguna métrica de venta que el dueño pueda mirar.
   Es un mercado sin caja registradora.
2. **El activo más valioso es el chat + la IA**: en un país donde la gente ya compra por WhatsApp y
   Facebook, «hablar con quien vende» **dentro de la app** es la ventaja competitiva real, no el carrito.
3. **La confianza es el cuello de botella**: sin valoraciones, sin vendedor verificado visible y sin
   posventa (devoluciones/disputas), el comprador nuevo no se atreve a pagar por adelantado. De ahí que
   el efectivo contra entrega sea la forma de pago que de verdad cierra ventas.
4. **La logística decide el modelo**: si la entrega la hace el vendedor, la plataforma no controla ni el
   plazo ni el precio; si la hace la plataforma, hace falta cobrar por ello. Hay que elegir.
5. **El riesgo número uno es la fuga**: vendedor y comprador se conocen por el chat y cierran la venta
   fuera de la app. Sin comisión no hay negocio; y la comisión solo se cobra si el pago pasa por aquí.

## A.4 Riesgos técnicos que ya conozco (y que son de negocio)

| Riesgo | Por qué es de negocio | Estado |
|---|---|---|
| **Detalle del pedido en blanco** (`lifebook-order/[id]`) | El comprador **no ve su código de entrega** ni el estado → no puede recibir ni pagar | **Roto** (medido por el otro agente: 93,6 % de la zona lisa) |
| **Stock** | — | **Verificado y BIEN HECHO**: se descuenta **al crear el pedido**, atómico (transacción + `WHERE stock_quantity >= cantidad`) y lanza `STOCK_INSUFFICIENT` si no hay (`orders.service.ts:255,269-289,277,283`); se devuelve al cancelar (`:583-591`). Matices: con `stock_mode = 'approximate'` **se puede sobrevender a propósito** (`:284-288`); con `unlimited`/`on_request` no se lleva cuenta; y si la variante se borró o el stock quedó negativo, el bloque se salta **sin error** y el pedido se crea sin descontar (`:272-273`) |
| **Sin notificaciones push** | El comprador no sabe que su pedido va en camino; el vendedor no sabe que vendió | **Confirmado: NO existe** |
| **Sin valoraciones** | Sin reputación no hay confianza, y sin confianza no hay pago por adelantado | **Confirmado: 0 reseñas**; 116 productos con `rating_count=0` y `sales_count=0` |
| **Sin escrow** | El dinero no está retenido: si el vendedor no entrega, el comprador pierde | **Confirmado: no existe** (ningún documento lo sostiene en el código) |
| **Sin comisión ni pago al vendedor en comercio** | Es el ingreso del negocio y hoy no existe | **Confirmado.** Lo único diseñado es la comisión de **comida**: 8 % con mínimo 500 XAF y liquidación semanal (`docs/MODELO-DINERO-Y-PEDIDOS-PROGRAMADOS.md:22-24`) — sirve de precedente para comercio |
| **Sin libreta de direcciones** | El comprador reescribe su dirección en cada pedido | **Confirmado: NO existe** |
| **Sin i18n ni analítica de embudo** | No se puede medir dónde se pierde la venta | **Confirmado: NO existe** |
| **Sin pasarela de pago real** | Todo el dinero se mueve fuera de la app: no se puede cobrar comisión ni medir | **Confirmado: NO existe** (investigación de pagos en curso, §B.3) |
| **Un pedido pagado por transferencia o en tienda se queda «pendiente» para siempre** | La tienda cobra pero el sistema cree que no: nadie puede cuadrar la caja | `orders.payment_status` solo pasa a `paid` al entregar con **efectivo contra entrega** (`orders.service.ts:319,573-577,636`); con `billing`/`transfer`/`in_store` se queda en `pending` |
| **Número de pedido duplicable** | Dos pedidos con el mismo número = lío en la tienda y en las cuentas | `orders.order_no` se genera con `count(*) + 1` del día (`orders.service.ts:83-90`) y **no hay índice único** en el repositorio: bajo dos compras a la vez, se puede repetir |
| **Dos cajas distintas** (producto y carrito) | Dos caminos que mantener y dos sitios donde puede fallar el cobro | Deuda asumida; la del producto se acaba de arreglar |
| **Sin cobro propio** (no hay pasarela) | Todo el dinero se mueve fuera de la app: no se puede cobrar comisión ni medir | Investigación en curso (parte B) |

## A.5 Cómo ganaría dinero Life Book (hipótesis, por orden de realismo)

| Modelo | Cómo | Por qué es realista aquí |
|---|---|---|
| **1. Comisión por venta** | Un % sobre el pedido cerrado dentro de la app | Es el modelo de todos los mercados; exige que el pago pase por la app |
| **2. Tarifa de entrega** | Cobrar el reparto y pagar al repartidor (moto-taxi) | El cliente ya paga entregas informales; aquí se puede ordenar y quedarse un margen |
| **3. Suscripción de tienda** | Cuota mensual por escaparate: más fotos, aparecer arriba, estadísticas | Ingreso predecible sin depender del volumen; ya existe panel de comerciante |
| **4. Destacados** | Pagar por salir en portada/búsqueda | Barato de construir, se vende a las tiendas que ya venden |
| **5. Publicidad local** | Espacios de marcas (bancos, telefónicas) | Con audiencia suficiente; hoy prematuro |
| **6. Servicios de la super-app** | El comercio «engancha» y los ingresos vienen de viajes/hotel/comida | Ya está construido el resto de la super-app |

**Opinión honesta:** empezar por **1 + 2** (comisión + entrega) y **3** en cuanto haya 10 tiendas que
vendan solas. Sin cobro dentro de la app, los modelos 1, 3 y 4 son humo.

**Precedente que ya existe en casa:** el módulo de **comida** ya tiene diseñada su comisión (8 % con
mínimo 500 XAF y liquidación semanal, `docs/MODELO-DINERO-Y-PEDIDOS-PROGRAMADOS.md:22-24`). Copiar ese
mismo criterio para comercio evita inventar dos modelos de dinero distintos en la misma app.

## A.6 Las métricas que el dueño debe mirar desde el día 1

| Métrica | Cómo se calcula |
|---|---|
| Ventas cerradas | nº de pedidos con estado «entregado» |
| **Valor medio del pedido** | suma de importes ÷ nº de pedidos |
| **Comisión cobrada** | suma de (importe × % comisión) de los pedidos entregados |
| **Pedidos cancelados** | cancelados ÷ total (si sube, hay un problema real) |
| **Publicaciones sin venta** | publicaciones activas que nunca han vendido ÷ total |
| **Vendedores que venden** | vendedores con ≥1 venta ÷ vendedores con publicaciones |
| **Tiempo hasta la primera venta** | días desde publicar hasta el primer pedido |
| **Recompra** | compradores con ≥2 pedidos ÷ compradores |
| **Fuga** | pedidos creados vs. conversaciones de chat que no acaban en pedido |

## A.7 Lo que yo añadiría en la próxima tanda (impacto vs. esfuerzo)

| # | Qué | Por qué ahora | Esfuerzo |
|---|---|---|---|
| 1 | **Arreglar el detalle del pedido** (código de entrega y estado) | Está roto y es el final del embudo: sin esto no hay compra completa | Bajo |
| 2 | **Valoraciones del vendedor y del producto** | Es lo que hace que un desconocido te compre | Medio |
| 3 | **Avisos de estado del pedido** (push + chat) | Quita trabajo al dueño y miedo al comprador | Medio |
| 4 | **Reserva de stock al crear el pedido** | Evita vender lo que no hay | Bajo/Medio |
| 5 | **Historial y panel de ventas del vendedor** (cuánto vendió, qué cobrar) | Sin esto el vendedor no sabe si gana dinero dentro de la app | Medio |
| 6 | **Comisión + liquidación** (aunque sea manual al principio) | Es el ingreso; se puede empezar con un registro y pago manual | Medio |
| 7 | **Devoluciones y disputas** (flujo simple con el chat como sede) | Posventa mínima para que la gente se atreva | Medio |
| 8 | **Buscador** (los **favoritos ya existen**: botón en la ficha, pestaña «Colección» en tu perfil y «mover a favoritos» desde el carrito; falta buscador, una pantalla de favoritos fuera del perfil, y aviso de bajada de precio) | Con catálogo creciendo, sin buscar no se vende | Bajo |

---

## A.8 El hallazgo que cambia la lista de prioridades: **casi todo lo que falta ya está hecho en casa**

La auditoría del código (16/09) encontró esto, y es lo más importante de todo el documento:

Los módulos **hermanos** de la app ya tienen construidas —y en uso— las piezas que en comercio figuran
como «no existe»:

| Pieza que falta en comercio | Dónde YA existe en la app | Ruta |
|---|---|---|
| **Reseñas con estrellas** | Ecomerse: `POST /ecomerse/orders/:id/review` con `{ rating, comment }` + UI de 5 estrellas | `api/ecomerse.ts:117-118`, `app/ecomerse-orders.tsx:114,125,339` |
| **Disputas con ventana y motivo mínimo** | Ecomerse (garantía condicional: efectivo = mediación; facturación = garantía 7 días) | `app/ecomerse-orders.tsx:6-7,113,121,317,331-336` |
| **Escrow (bandera)** | Ecomerse (`GET /ecomerse/flags` → `{ f1, cash, billing, escrow }`) y Comida | `api/ecomerse.ts:88`, `api/food.ts:191` |
| **Comisión y liquidación al vendedor** | Comida (comisiones del repartidor, contabilidad semanal, «a pagar nunca negativo») y Billing (`POST /billing/commissions/settle`) | `api/food.ts:93-103,246`, `api/billing.ts:50` |
| **Reembolsos** | Billing (`refunded`, `refund_status_partial`) | `app/billing-status.tsx:35,37,290-295` |

**Consecuencia práctica:** reseñas, disputas, reembolsos, comisión y liquidación **no son I+D nueva** en
esta app: son patrones ya implementados y probados en otros módulos. La vía barata es **portar el
patrón** (tabla + endpoints + pantalla), no inventarlo. Eso abarata y acelera las prioridades 2, 6 y 7
de §A.7 de forma notable.

**Lo único que NO existe en ningún módulo de la app es lo caro: una pasarela de pago real.** Los tres
comercios (Life Book, Ecomerse, Comida) solo **registran el método elegido**; el dinero se mueve fuera.
Ese es el verdadero cuello de botella del negocio y depende de §B.3.

---

## A.9 Hallazgos de la auditoría de código del 16/09 (todos con fichero:línea)

Ordenados por lo que valen para el negocio, no por gravedad técnica:

| # | Hallazgo | Por qué importa al negocio | Arreglo |
|---|---|---|---|
| 1 | **`sales_count` NUNCA se incrementa al vender** (`backend/server-src`: 0 escrituras; solo lecturas) | La ficha presume de «N ventas» y ordena por ventas… y está muerto: **la prueba social más barata que tenemos no funciona** (encaja con los 116 productos en `sales_count = 0`) | Una línea al entregar el pedido |
| 2 | **El código de entrega de 4 dígitos no tiene límite de intentos** y `confirmDeliveryCode` fuerza `delivered` + `paid` sin comprobar el estado previo (`orders.service.ts:253,630-637`) | Alguien puede **probar códigos hasta acertar y dar por cobrado un pedido** que no se entregó: es un fraude con dinero real | Contador de intentos + compare-and-set |
| 3 | **El envío puede quedar fuera del total del pedido**: con `cost_mode` `calculated` u `on_request`, el coste se pone a 0 y solo se añade un texto (`orders.service.ts:233-241,251,324`) | **La tarifa de entrega (modelo de ingreso nº 2 de §A.5) no se puede cobrar ni comisionar así**: el dinero del reparto se mueve por fuera, sin trazabilidad | Cerrar el coste antes de confirmar |
| 4 | **Los productos agotados siguen listados**: nada los pasa a `sold_out` al llegar a 0 y el catálogo no filtra por stock (`commerce.service.ts:1673`) | Se vende lo que no hay → cancelaciones y enfado (aunque el pedido se rechace bien, el escaparate engaña) | Marcar agotado + filtrar |
| 5 | **Reponer stock al cancelar no tiene tope** (`orders.service.ts:585-590`) | Inventario inflado: acabas con más unidades «en venta» de las que existen | Tope en la reposición |
| 6 | `orderAction` lee el estado y luego actualiza sin condición de estado (`orders.service.ts:563-565` vs `:572-577`); el patrón correcto ya existe en el repo (`commerce.service.ts:1426`) | Dos acciones a la vez (cancelar y entregar) pueden pisarse | Copiar el `CASE WHEN` que ya está hecho |
| 7 | Idempotencia: el camino con transacción no filtra `expires_at` (`orders.service.ts:262-264`) y **no hay hash del contenido** | Un reintento legítimo devuelve el pedido viejo; y reutilizar la clave con otro contenido devuelve el pedido anterior en silencio | Filtrar caducidad + guardar hash |
| 8 | Cupón recogible antes de su `starts_at` (`commerce.service.ts:1932-1937` vs `orders.service.ts:526`) | Se recoge un cupón que aún no vale y falla al pagar, con otro mensaje | Comprobar `starts_at` al recoger |

**Aviso de método (importante para futuras auditorías):** el espejo `backend/server-src/` está
**incompleto**: le faltan el controlador de opciones del producto y el de comerciante, que **sí existen
en el servidor real** (lo prueban `pruebas/lb60a` con 54/54 y `lb56a` contra la API real). Auditar solo
el espejo lleva a conclusiones falsas («esa ruta da 404»).

**Confirmado como inexistente** (0 coincidencias en el backend): comisión, liquidación al vendedor,
escrow, retención, monedero, libro de cuentas; reseñas (solo campos de lectura); i18n; push; analítica;
**factura fiscal**; libreta de direcciones (la dirección es texto libre); geolocalización de productos;
y KYC de vendedor (solo se lee `is_verified`, ningún endpoint lo escribe).

## A.10 Los tres arreglos que yo haría antes de añadir nada nuevo

Por relación impacto/esfuerzo, y porque sin ellos lo nuevo se construye sobre arena:

1. **Incrementar `sales_count` al entregar** — una línea; enciende la prueba social que ya está en la
   interfaz y no funciona.
2. **Cerrar el pago de verdad**: `payment_status` → `paid` para transferencia/facturación/tienda, con
   validación del justificante. Sin esto, **el panel del vendedor nunca cuenta esa caja** y ningún
   modelo de comisión es verificable.
3. **Blindar el código de entrega**: límite de intentos y compare-and-set del estado. Es dinero real.

---

# B. La investigación de fuera

Informe completo y con fuentes: **`reports/informe-lifebook-marketplace.md`** (7 apartados, 31 URLs).
Aquí va lo que decide, ya contrastado.

## B.1 Plantillas de producción: **ninguna sirve tal cual** (y tres son un riesgo legal)

Verificadas una a una (no por titulares):

| Plantilla | Veredicto para nosotros |
|---|---|
| `burakorkmez/expo-ecommerce` | Stack distinto, y **SIN licencia** → «todos los derechos reservados»: **no se puede usar en un producto comercial** |
| `Amang9446/Expo-Ecommerce` | Igual: **sin licencia** |
| `pipesort/react-native-medusa` | Igual: **sin licencia** |
| `enatega/shopping-cart-ecommerce` | Su propio README dice que el backend/API son **propietarios y se licencian aparte** |
| `JamesUgbanu/Ecommerce-mobile-template` | Solo frontend (NativeWind), pensado para enchufar a una API existente: no aporta negocio |
| `bidah/universal-medusa`, `bidah/mobile-medusa` | Lo único que aporta **variantes e inventario reales**, pero a través de Medusa; `mobile-medusa` se declara **alpha** y sin proveedor de pago |

**Conclusión:** ninguna usa NestJS+Postgres (lo nuestro) ni soporta XAF. **Se copian ideas, no código** — y
con las tres sin licencia, ni ideas copiadas literalmente.

## B.2 MedusaJS: **no migrar** (y el argumento no es técnico, es de esfuerzo)

* Versión real verificada: **2.21.0**. Licencia: MIT **excepto** materiales «Enterprise Edition» (no es MIT puro).
* **Multivendedor: sin soporte oficial.** La opción de terceros seria (Mercur) **depende de Stripe Connect** → inservible en Guinea Ecuatorial.
* **El argumento decisivo:** lo verdaderamente difícil del negocio (reparto de pagos + liquidación a vendedores) es **el mismo trabajo con Medusa o sin él**. Migrar multiplicaría el riesgo sin ahorrar esa parte.
* **Decisión: seguir con NestJS + Prisma y copiar los conceptos** (regiones, canales de venta, promociones, inventario transaccional, devoluciones).

## B.3 Pagos: el titular que lo condiciona todo

> **Hoy NO existe ninguna pasarela verificada que dé de alta a un comercio de Guinea Ecuatorial y cobre
> en XAF por internet.**

Lo que sí está verificado (con fuente):

* **Stripe no está disponible**: en `stripe.com/global` no aparecen ni «Equatorial» ni «XAF». En África solo Sudáfrica, Nigeria, Ghana, Kenia y Costa de Marfil. ⚠️ Trampa: **Stripe Tax sí cubre 19 países africanos** (incluidos Camerún y Guinea) — pero eso es **presentar impuestos, no cobrar**.
* **Guinea Ecuatorial apenas tiene pagos digitales**: está «au bas du classement» de la CEMAC en pagos móviles; **«Getesa Money» sigue SIN lanzar** (anunciado en 2019, relanzado en 2024, aún no operativo); **no hay M-Pesa ni MTN MoMo** en el país y Orange Money no está confirmado.
* **Flutterwave** con «Francophone Mobile Money» cubre **solo Camerún, Costa de Marfil, Malí y Senegal**: **GQ no aparece**. Sí tiene Subaccounts + Split Payments.
* **Notch Pay**: XAF es ciudadanía de primera clase y tiene **«Sync»** (split de pagos + cuentas conectadas, estructuralmente igual a Stripe Connect). Su FAQ solo dice «small fee», **sin cifra publicada**.
* **Maviance / Smobilpay**: tiene un **«Agregador GIMAC»** → es el candidato CEMAC **más plausible**.
* **La vía con más futuro: el QR Comunitario CEMAC.** El BEAC y GIMAC lo lanzaron el **30-jul-2026 en Douala**: un QR único legible por todas las apps autorizadas en los **seis países de la CEMAC, Guinea Ecuatorial incluida**. Pero es **cobro presencial**, no una API de checkout disponible hoy.
* **No hay tarifas publicadas** para XAF/GQ en ningún proveedor: no se han inventado cifras.

**Acción pendiente (no la puede hacer un agente):** hay que **escribir directamente** a **Maviance/Smobilpay**,
**Getesa Money** y **Notch Pay** preguntando si aceptan un comercio registrado en GQ con **liquidación en
XAF**. Ninguna web lo dice; es el único camino para cerrar este bloque.

**Decisión de diseño que sí se puede tomar ya:** construir una **interfaz abstracta `PaymentProvider`**
(deja el cobro detrás de una pieza intercambiable) para poder enchufar el QR CEMAC o un agregador
después **sin rehacer el comercio**. Es barato ahora y carísimo más tarde.

## B.4 Cómo se mueve el dinero cuando no hay split: **libro de doble partida + liquidación manual**

Aporte conceptual clave del informe: **«quien cobra, controla»**. Con **efectivo contra entrega, el
mensajero cobra en mano**: no se puede retener una comisión automáticamente — se descuenta de la remesa
o queda como factura incobrable.

Arquitectura correcta **sin** pasarela con split:
1. **Libro interno de doble partida** (`LedgerEntry` en Prisma): cada venta genera asientos (venta,
   comisión de la plataforma, a pagar al vendedor, coste de reparto).
2. **Liquidación manual** al vendedor, registrada como un asiento más (no un número en una hoja de cálculo).
3. **Conciliación del efectivo** del reparto: qué cobró cada mensajero, qué entregó y qué falta.

Así la comisión se puede empezar a cobrar **sin pasarela** y sin mentir en las cuentas — y el día que
haya QR o agregador, solo cambia la «cobranza», no la contabilidad.

## B.5 El mercado local: cómo compra hoy la gente (y quién más está intentándolo)

| Punto | Lo que dice la investigación |
|---|---|
| **Canal real hoy** | **Grupos de WhatsApp y Facebook de «encargos»**: es el canal consolidado de compraventa, **con estafas documentadas**. Es exactamente el hueco que Life Book puede ocupar (hablar y pagar dentro, con historial y reputación) |
| **Competencia local (¡ojo!)** | **Ya existen apps pequeñas**: **EGMARKET** (Play Store/App Store), **OKOUME** (lanzada en Malabo en 2026) y **Chekea**. No estamos solos: conviene mirarlas antes de decidir posicionamiento |
| **Referencia de precio y confianza** | El **Mercado Central de Malabo** (>500 puestos, rehabilitado) sigue siendo el patrón de precio y de confianza (no verificado para Bata) |
| **Logística** | Taxi y moto-taxi están documentados como **movilidad general, no como mensajería**. Lo que aparece son operadores de **carga y forwarding** (EG McDan, Gecotel, EV Cargo), **no última milla urbana** |
| **Coste de un envío urbano** | **DATO NO ENCONTRADO** (en XAF). Habrá que medirlo sobre el terreno: es el número que decide si la entrega puede ser un ingreso o solo un gasto |
| **¿Prefieren recoger en tienda?** | **No verificado** |
| **Comisión de referencia** | Jumia publica tablas por país y categoría en su VendorHub (Costa de Marfil, Kenia, Marruecos, Uganda, Ghana), pero **el rango en % no se pudo verificar** sin abrir esas tablas, y en la CEMAC (Djoolah y VendHype, Camerún) tampoco. **No se inventa ninguna cifra**: la referencia de casa sigue siendo el **8 % con mínimo 500 XAF de Comida** |
| **Fiscalidad** | Un impuesto general sobre las ventas/valor añadido del **15 %** aparece **solo en fuentes secundarias** (no confirmado en ley primaria). Requisitos especiales para vender online: **dato no encontrado** |

**Conclusión de §B.5:** el hueco de negocio está confirmado (la gente ya compra por grupos, con miedo a
las estafas), la competencia local **existe y es reciente**, y los dos números que faltan —**coste real
de una entrega urbana** y **comisión que aguanta el mercado**— solo se pueden cerrar **preguntando a
repartidores y vendedores reales en Malabo**, no en internet.

---

## B.6 Análisis de competencia (Guinea Ecuatorial, verificado el 16/09/2026)

### Quién está ahí de verdad

| Plataforma | Qué es | Detrás | Pago / entrega / reseñas | Punto débil |
|---|---|---|---|---|
| **OKOUME** | **Clasificados**: publicar productos y servicios, empleo y eventos, contacto directo comprador-vendedor. Lanzada el **18-ago-2026** en Malabo (hotel Colinas). App `com.elebi.okoume` | **Iniciativas Elebi**, fundador **Víctor Ele Ela** | **No confirmado ninguno de los tres**; en su acto de lanzamiento hubo mesa sobre «infraestructuras de pago y fintech» → **el cobro no está resuelto** | Su propio discurso es «ordenar lo que ya se mueve por WhatsApp»: es un **directorio**, no un mercado donde el trato se cierre y se cobre. Sin entrega, pago ni reputación confirmados |
| **EGMARKET** | App de compras (catálogo tipo tienda) | No publicado | Datos no encontrados | Ficha iOS de **2021 que ya no resuelve** y dos identificadores Android distintos → **indicio de app abandonada** |
| **Chekea** | **NO es competencia** (una app de finanzas de Venezuela y otra ecuatoriana ya desaparecida) | — | — | Descartada tras verificar |
| **Otras** | Ninguna app ecuatoguineana de compraventa o reparto confirmada | — | — | Dibida es de **Guinea-Conakri**; Jumli, África francófona |

### El competidor de verdad no es una app: es **WhatsApp**

Sin cifras públicas de grupos (dato no encontrado), pero el peso del canal está documentado en la prensa
local, **con fraude real**: estafas en grupos de «encargos» y un caso de **más de 50 millones XAF a 25
personas** por compraventa de vehículos. Ese es el mercado que existe hoy: **mucho volumen, cero
trazabilidad y miedo justificado**.

### Los 5 diferenciadores realistas de Life Book (no genéricos)

1. **Cerrar el trato dentro de la app**: chat con tarjetas de producto + **pedido con código de entrega**.
   El competidor deriva a WhatsApp y ahí se pierde el rastro (y aparece la estafa).
2. **Pago contra entrega con código de 4 dígitos**: ataca el miedo al pago por adelantado, que es *el*
   freno del mercado. (Hoy ya existe, pero **hay que blindarlo**: sin límite de intentos es un fraude).
3. **Asistente de IA que solo recomienda stock real y disponible**, con precio y vendedor. Resuelve dos
   problemas de los grupos: saturación y búsqueda imposible. **Esto no lo tiene nadie aquí.**
4. **Panel del comerciante** que sustituya «el estado de WhatsApp» y el cuaderno: catálogo, stock, pedidos
   y cuentas. (Ya está construido; falta que **cuadre la caja**, ver §A.9).
5. **Una sola identidad para todo**: transporte, hotel, comida y compras con la misma cuenta, cartera y
   reputación → el usuario abre la app aunque no compre ese día. Es el argumento que un competidor de
   una sola vertical no puede copiar rápido.

### La conclusión estratégica

**El hueco no es «faltan apps en Guinea Ecuatorial»: es que nadie cierra la transacción.** OKOUME acaba de
llegar con clasificados y sin cobro; el resto está muerto o es de otro país. La ventaja de Life Book no es
tener catálogo (eso lo tiene cualquiera): es tener **pedido, código de entrega, chat, panel del vendedor y
una super-app detrás**. Pero esa ventaja **solo se convierte en negocio si se puede cobrar y cuadrar** —
de ahí que el bloqueo de pagos (§B.3) y el ledger (§B.4) sean más urgentes que cualquier función nueva.

**Sin verificar (no se usa para decidir):** descargas y valoraciones reales de OKOUME y EGMARKET,
sus comisiones, sus métodos de pago, si tienen entrega, chat o reseñas; y el tamaño real (nº de grupos y
miembros) del canal Facebook/WhatsApp.


---

# C. Decisión propuesta (lista priorizada)

| Prioridad | Qué | Por qué | Esfuerzo |
|---|---|---|---|
| 1 | Arreglar **detalle del pedido** (código de entrega) | Final del embudo, hoy roto | Bajo |
| 2 | Encender **`sales_count`** | Una línea; enciende la prueba social ya existente | Muy bajo |
| 3 | **Cerrar el pago** (`paid` con justificante) | Sin esto no hay caja cuadrada ni comisión verificable | Medio |
| 4 | **Blindar el código de entrega** (intentos + compare-and-set) | Fraude con dinero real | Bajo |
| 5 | **Avisos de estado del pedido** (push + chat) | Quita miedo al comprador y trabajo a ti | Medio |
| 6 | **Portar de Ecomerse**: reseñas y disputas | Ya están hechas en casa | Medio |
| 7 | **Ledger + liquidación manual** (comisión 8 % con mínimo 500 XAF, como Comida) | Es el ingreso, y se puede empezar sin pasarela | Medio |
| 8 | **Interfaz `PaymentProvider`** y carta a Maviance/Notch/Getesa | Prepara el cobro real sin rehacer nada | Bajo |
| 9 | **Productos agotados** fuera del catálogo + reserva de stock | El escaparate no debe engañar | Bajo |
| 10 | **Buscador** (los favoritos ya existen) | Sin buscar, el catálogo no se vende | Bajo |

