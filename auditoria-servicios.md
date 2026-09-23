# Auditoría de servicios — EG Route Plan

**Ámbito:** servicios de la super-app (taxi, comida, Life Book, monedero, hotel, intercity, alquiler, trabajo) en **app + backend**.
**Profundidad:** exhaustiva. **Salida:** SOLO HALLAZGOS (no se ha modificado ni una línea de código ni de datos).
**Fecha:** 18/09/2026.
**Modo:** auditoría **en solo lectura**. Toda lectura de base de datos ha sido `SELECT`; ninguna consulta ha escrito.

---

## Resumen en una página

**97 hallazgos** en total: **10 transversales** (T, §2) y **87 por servicio** (V: 16 · C: 13 · L: 54 · M: 12, §3). De ellos, **16 críticos**: los 6 transversales T-01…T-06, dos de movilidad (V-01, V-02), los tres de comida y mercado (C-01/C-02 y C-03), los cuatro de Life Book y servicios (L-07, LC-01, LC-02, LH-01) y uno de dinero (M-01).

**Lo que más urge, ordenado por lo que cuesta si espera:**

1. **Hay 227.000 XAF retenidos sin salida en producción, hoy** (T-06): 60 cerrojos de escrow sin liberar ni devolver, 46.500 de ellos de viajes de taxi terminados o en curso y 19.500 de pedidos de Life Book. No hay ninguna ruta automática que los recupere — y la causa raíz está verificada: **ningún barrido se dispara solo** (el crontab del host y los timers de systemd no tienen nada de la aplicación, y los barridos del código no están en `@Cron`). **Antes de tocar código hay que decidir qué se hace con lo ya varado.**
2. **El agente de caja no puede confirmar efectivo desde la app** (T-08/M-01): el rol `AGENT` no existe en la identidad de movilidad, así que las cuatro rutas de trabajo no pueden autorizarse con el token que la app lleva (el 403 concreto es una inferencia del `RolesGuard`, no una llamada observada: ver §4). Como el efectivo es el canal principal de entrada de dinero, esto corta la recarga. Un decorador mal puesto; el remedio lo tiene el propio fichero dos líneas más arriba.
3. **Cualquier cuenta con sesión puede aceptar el viaje de otro y fijar el precio** (T-05/V-01): no se exige ser conductor verificado, y el precio entra sin cota por el cuerpo de la petición.
4. **El itinerario de entrega cierra el pedido sin liberar el escrow** (T-07/C-01/C-02/C-03): en Food y en el Mercado la liberación está cableada **en un solo camino de cada servicio**. Entregar por el otro deja al comercio sin cobrar y al comprador sin su dinero.
5. **Un cerrojo ya devuelto se puede volver a usar y su liberación falla en silencio** (T-09): el reembolso no marca el cerrojo y el replay del cerrojo se salta el PIN. Cuatro de los cinco servicios usan la clave del cliente (comida, no). Hay pedidos que pueden crearse sin dinero detrás.
6. **La «moderación» de rutas y paradas se auto-autoriza** (T-01): cuatro rutas `admin/*` de movilidad sin guarda, y el identificador de quien revisa lo pone quien llama.
7. **El documento de identidad de cualquier arrendador es público** (L-07): `GET /rental/landlords/:id` devuelve `docType`, `docNumber` y la URL de la foto del DIP.
8. **Un pedido en reclamación es un callejón sin salida** (LC-01): `disputed` no aparece en ninguna transición de salida, así que el dinero se queda retenido para siempre.
9. **El panel del hotelero mueve la reserva y no el monedero** (LH-01): marca `paid` y `refunded` **sin una sola llamada al monedero** (0 coincidencias en todo el fichero), mientras la misma acción por la puerta del huésped sí libera y sí devuelve. El hotel no cobra y el huésped no recupera.

**Lo que NO es un problema, aunque lo parezca:** los cerrojos son idempotentes, no hay claves duplicadas, no hay saldos negativos, la comisión se congela bien, el segundo factor del dinero es real y el camino de webhooks de pago está cerrado. Detalle en §7.

**Errata del briefing:** el contenedor no se llama `malabo-postgres` (§5.1), los roles de base de datos **no** están aislados por esquema (§5.2) y una cifra de mi propio primer pase era falsa (§5.3).

---

## 0. Cómo leer esto, y qué NO afirma

1. **No se ha ejecutado ni un solo cambio.** No hay código tocado, ni un `UPDATE`, ni un despliegue. Las únicas escrituras de esta sesión están fuera del proyecto auditado: los espejos y los informes dentro de `D:\egapp\.auditoria-servicios\` y los scripts `pruebas\as-*.cjs`.
2. **La evidencia es `archivo:línea` sobre el código en vuelo.** El backend auditado es el de producción: `root@8.218.88.237`, `/opt/mirror/app`, pm2 `malabogo-api`. Se descargó un espejo exacto el 18/09/2026: **125 ficheros `.ts`**, sha256 del paquete `21378a0d475dedb77aa6bbea03ca910fd40cb05c77a69e00083591c4a3304651`, idéntico al del servidor. Las líneas citadas corresponden a ese espejo.
3. **El código en vuelo es `src/`, NO `dist/`.** `dist/` está fechado el 7 de septiembre y `src/` es muy posterior: se compila al desplegar. Cualquier lectura de `dist/` mediría una versión vieja.
4. **Lo que no se ha podido comprobar está en §4 y no se afirma en ningún otro sitio.**
5. **Este informe corrige cinco datos heredados o mal medidos** — tres del briefing (`PARAMETROS-AUDITORIA-SERVICIOS.md`) y dos que había medido mal yo. Están en §5, con la prueba.

---

## 1. Inventario de lo auditado

### 1.1 Superficie del backend (medida, no estimada)

Generado con `pruebas\as-rutas-backend.cjs` sobre los `*.controller.ts` del espejo. Fichero: `as-matriz-rutas.md`.

| Medida | Valor |
|---|---|
| Rutas HTTP encontradas | **575** |
| Rutas **sin ninguna guarda** (ni de método ni de clase) | **79** |
| Rutas solo con `JwtAuthGuard` (sesión, sin rol) | **374** |
| Rutas con `RolesGuard` (rol comprobado) | **122** |
| Ficheros de controlador | 30 |
| Módulos de servicio | 14 |

**Hecho estructural que condiciona todo lo demás:** la única guarda **global** del backend es el throttler (`src/http/app.module.ts:122`, `APP_GUARD` → `UserThrottlerGuard`). **No hay guarda de autenticación global.** Por tanto, en este backend *«sin `@UseGuards`» significa ruta pública de verdad*, salvo que el propio manejador compruebe la identidad por dentro.

**Cuántas de esas 79 están vivas: esa es la pregunta, y la respuesta es «casi ninguna».** El censo `as-rutas-abiertas.md` las lista con el cuerpo de cada manejador, y el cruce con `app/` y `api/` dice cuáles llama de verdad el producto. Casi todas las mutaciones abiertas pertenecen a **propuestas abandonadas de una versión anterior de la API** (una segunda clase controladora sin el prefijo `v1/mobility`, con `POST stops`, `PUT admin/stops/:id`, `POST trips/request`…): sobreviven desplegadas y alcanzables por HTTP, pero **ninguna pantalla ni script las llama**. La app viva usa las rutas con guarda (`POST /v1/mobility/trips`, `trips/:id/accept`, `trips/:id/status`). Por eso T-01 va marcado con esa salvedad: el agujero es real, la explotación práctica por la interfaz no existe, y arreglarlo es más barato que discutirlo (borrar o cerrar).

### 1.1-bis · Una corrección al informe de movilidad (28 ≠ 36)

El especialista de movilidad escribió en `movilidad-taxi.md` que **28 de las 52 rutas** del controlador de movilidad están sin guarda, y lo marcó como una corrección de su propio primer recuento (que decía 20). **El recuento correcto es 36**, y la discrepancia no es de criterio: son 8 rutas que su lista omite y que he comprobado una a una en la fuente, donde el decorador de ruta va **seguido directamente del `async`, sin `@UseGuards` interpuesto**:

`PUT trips/:id/accept` (`:214`), `PUT trips/:id/reject` (`:222`), `PUT trips/:id/complete` (`:230`), `PATCH admin/stops/:id/moderate` (`:299`), `PATCH admin/routes/:id/moderate` (`:305`), `PATCH rides/:id/respond` (`:333`), `GET driver/selfie/:id` (`:1094`) y `GET user/photo/:id` (`:1104`).

No es un detalle de contabilidad: tres de esas ocho (las dos de `moderate` y `rides/:id/respond`) son **mutaciones sobre datos de producción**, y dos (`driver/selfie/:id` y `user/photo/:id`) sirven **fotos de documentos e identidad sin sesión**. La cifra válida para el conjunto del backend sigue siendo la de §1.1 (79 sin guarda), que sale del extractor automático y no de un recuento a mano.

### 1.2 Unidades auditadas (servicio × superficie)

| Servicio | App | Cliente API | Rutas backend | Servicio backend | Base de datos |
|---|---|---|---|---|---|
| Monedero / escrow / pagos | `monedero*.tsx`, `billing-*.tsx`, `agente.tsx` | `api/wallet.ts`, `billing.ts` | `http/wallet|escrow|agent|auth.controller.ts` | `services/wallet|escrow|fee|payment-auth|otp|ride-settlement` | `wallet.*`, `tx_shape_chk` |
| Taxi y movilidad | `taxi.tsx`, `conductor.tsx`, `trips-history.tsx`, `reserva.tsx` | `api/taxi.ts`, `driver.ts`, `mobility.ts`, `locate.ts` | `mobility/mobility.controller.ts` (52), `ride-settlement.controller.ts` | `services/ride-settlement.service.ts`, `mobility-prisma.service.ts` | `mobility.taxi_requests`, `service_fares`, `driver_documents` |
| KYC | `kyc/*.tsx`, `driver-onboarding.tsx` | `api/kyc.ts` | `mobility/kyc/*` (8 ficheros) | `kyc.service.ts`, `kyc.fsm.ts`, providers | `mobility.kyc_*` |
| Comida | `food*.tsx` (6) | `api/food.ts` | `food/food.controller.ts` (35) | `food.service.ts`, `food-fees.ts`, `food-settlement.*` | `wallet.food_*` |
| Mercado (Ecomerse) | `ecomerse*.tsx` (7) | `api/ecomerse.ts` | `ecomerse.controller.ts` (46) | `ecomerse.service.ts` | `wallet.ecomerse_*` |
| Life Book (social + comercio) | `lifebook*.tsx` (decenas) | `api/lifebook*.ts` | `lifebook.controller.ts` (121), `commerce.controller.ts` (47) | `lifebook.service.ts`, `commerce.service.ts` | `lifebook.*` |
| Hotel | `lifebook-hotel-*.tsx` (12) | `api/hotel.ts` | `hotel.controller.ts` (23), `hotel-merchant.controller.ts` (11) | `hotel.service.ts`, `hotel-merchant.service.ts`, `reservations.service.ts` | `lifebook.reservations`, `room_type_calendar` |
| Intercity | `intercity*.tsx` (3) | `api/intercity.ts` | `intercity.controller.ts` (19) | `intercity.service.ts` | `wallet.intercity_*` |
| Alquiler | `alquiler*.tsx` (4) | `api/rental.ts` | `rental.controller.ts` (22) | `rental.service.ts` | `wallet.rental_*` |
| Trabajo | `work*.tsx` (6) | `api/work.ts` | `work.controller.ts` (18) | `work.service.ts` | `wallet.jobs`, `job_*` |
| Facturación / planes | `billing-*.tsx` | `api/billing.ts` | `billing.controller.ts` (54) | `billing-*.service.ts` (8 ficheros) | `wallet.billing_*` |

### 1.3 Qué quedó FUERA, y por qué

| Fuera | Motivo |
|---|---|
| Diseño, color, tipografía, accesibilidad visual, rendimiento percibido | Ya cubierto por `design-audit-report.md` (60 hallazgos) y `.design-audit\*.md`. Repetirlo haría parecer nuevo lo que no lo es. |
| Seguridad del monedero (escrow, PIN, idempotencia, concurrencia) | Ya cubierto por `security-audit-skill\egrouteplan-wallet\run-1\` (28 unidades, F1–F8) y `run-2\` (F9). Aquí solo se aporta lo nuevo. |
| `src/services/.backups-services-20260829-123004/` y `*.bak*` del servidor | Copias antiguas: no están en el camino de ejecución. |
| `src/ads`, `src/tts` | Publicidad y voz: fuera de los ocho servicios del encargo. |
| `media`, `storage`, `redis` como servicio propio | Se han mirado solo donde tocan a un servicio auditado (subida de fotos de hotel/intercity y `idempotency_keys`). |
| Publicación de la app en tiendas, nginx y certificados | Infraestructura, no servicio. |
| El APK instalado en el teléfono como artefacto | Se ha usado el **código**, no el binario. No se ha recompilado nada (regla de la casa: una cosa por tanda y con verificación detrás), así que **la app instalada podría no corresponder exactamente a este `app/`**: ver §4. |

---

## 2. Hallazgos transversales (capa común a todos los servicios)

> Los hallazgos por servicio están en §3, con sus informes de especialista en `D:\egapp\.auditoria-servicios\`.

### T-01 · La «moderación» de paradas y rutas se auto-autoriza, y la identidad del revisor la pone quien llama

**Severidad: Crítica** · Ámbito: backend · Esfuerzo: bajo

- `src/mobility/mobility.controller.ts:246` (`PUT /api/v1/mobility/admin/stops/:id`) y `:258` (`PUT .../admin/routes/:id`) **no tienen `@UseGuards`**: son rutas públicas (la única guarda global es el throttler, `src/http/app.module.ts:122`).
- El revisor **se lo cree del cuerpo de la petición**: `:247` `body: { action: 'approve' | 'reject'; reviewerId: string; reason?: string }` y `:251-253` solo comprueba que el campo esté presente, no que exista ni que sea administrador. Igual en `:259-265`.
- En la base, `Route.reviewedBy` es `VarChar(36)` **sin clave ajena** (`prisma/mobility/schema.prisma:546`), así que cualquier cadena pasa y queda registrada como revisión legítima.
- Consecuencia: cualquiera puede **crear una ruta con el precio que quiera** (`POST /api/v1/mobility/routes`, `:172`, también pública) y **acto seguido aprobarla** (`PUT .../admin/routes/:id`), dejando una tarifa «aprobada» en el panel de tarifas que ve el pasajero (`GET /api/v1/mobility/fares`, `:187`) y que fija el precio por defecto de viajes pidiendo solo una sesión (`src/mobility/mobility-prisma.service.ts:203`, `amount = roundToCustom(data.amount ?? route.customFare)`).
- Escala real: la app **no** llama a estas rutas (verificado: 0 coincidencias de `stops/suggest`, `routes/suggest`, `admin/proposals` en `app/` y `api/`; la app viva usa `POST /api/v1/mobility/trips` y `trips/:id/accept`, ambas con guarda). Es **código muerto de una propuesta anterior**, pero sigue desplegado y alcanzable por HTTP.
- **Y ya se ha escrito por ahí.** Verificado en producción: existe **una fila en `mobility.stops`** creada por esa puerta abierta, con `proposed_by = 'tu-uuid-de-usuario'` —literalmente el texto de relleno de un ejemplo de la documentación— y `status = 'PENDING_APPROVAL'`. Es la huella de una escritura anónima en datos de producción: alguien probó el endpoint público y la fila quedó. No es una hipótesis de lectura de código.
- Arreglo mínimo: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('ADMIN')` en las cuatro rutas `admin/*` (`:240`, `:246`, `:258`, `:299`, `:305`), y tomar el revisor de `@CurrentUser()` en lugar del cuerpo. Si la intención es retirarlas, borrarlas.

### T-02 · El `ValidationPipe` global no valida los cuerpos de la mayoría de endpoints: son tipos, no clases

**Severidad: Alta** · Ámbito: backend · Esfuerzo: medio

- `src/main.ts:27-33` configura `new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })`.
- Ese pipe **solo actúa sobre clases DTO** (necesita metadatos de `class-validator`, que se emiten en tiempo de ejecución). Un tipo inline de TypeScript **no existe en tiempo de ejecución**: no hay nada que validar ni que filtrar.
- Medición sobre el espejo: **24 clases DTO y 225 decoradores de validación, en solo 4 ficheros** (`http/dto.ts`, `lifebook/lifebook.controller.ts`, `mobility/mobility-auth.controller.ts`, `mobility/status.controller.ts`), frente a **50 cuerpos declarados con tipo inline** (`@Body() body: { … }`).
- El caso más grande es el propio controlador de movilidad: **52 rutas y ningún DTO**. `POST /api/v1/mobility/trips` (`:404`) declara siete campos inline, incluidos `requestedPrice` y `algorithmPrice`.
- Consecuencia concreta: `forbidNonWhitelisted` **no rechaza nada** en esos endpoints, y no hay validación de tipos ni de rangos salvo la que cada manejador escriba a mano. En movilidad sí hay comprobaciones manuales puntuales (`:417` limita `requestedPrice` a 300–10.000 XAF), pero **no hay ninguna sobre `algorithmPrice`**.

### T-03 · Dos libros mayores y dos tablas `reservations` en la misma base, con identificadores que se repiten entre esquemas

**Severidad: Alta** (riesgo latente: hoy no se ha encontrado un fallo explotado) · Ámbito: base de datos y backend · Esfuerzo: medio

- La base `egrouteplan` tiene **tres esquemas**: `wallet`, `mobility`, `lifebook`.
- **Los tres roles tienen `USAGE` en los tres esquemas** (verificado en producción con `has_schema_privilege`), así que el esquema no aísla nada por sí mismo: el aislamiento está en los permisos **por tabla**.
- Hay **homónimas reales**, que es lo peligroso en SQL sin calificar:
  - `products`: existe en `wallet` (**3 filas**, catálogo legado) y en `lifebook` (**120 filas**, el catálogo vivo).
  - `ledger_entries`: existe en `wallet` (dinero del monedero) y en `lifebook` (libro del comercio).
  - `reservations`: existe en `mobility` y en `lifebook`.
- `src/mobility/mobility.controller.ts:367-381` hace `INSERT INTO reservations (…)` **sin calificar el esquema**, mientras el resto del fichero escribe `mobility.` explícitamente (p. ej. `INSERT INTO mobility.taxi_requests`, `:420`). Con `search_path` = `"$user", public` para los tres roles (verificado), si el rol no tiene `public` en la ruta o la tabla vive en `mobility`, la inserción cae en `mobility.reservations`; si algún día se añade `lifebook` al `search_path`, **cae en `lifebook.reservations` sin dar error**.
- Censo de este patrón (`pruebas\as-sql-sin-esquema.cjs`, informe `as-sql-sin-esquema.md`): **14 referencias sin calificar** sobre 5 tablas — `wallets` (10), `escrow_orders`, `transactions` y dos falsos positivos de palabras SQL. Las tres primeras son tablas que **solo** existen en `wallet`, así que hoy resuelven bien; el riesgo es de mantenimiento, no un fallo en curso. Corregido: un primer pase de este mismo censo dio 703 porque el patrón contaba `wallet.` y `lifebook.` como si fueran tablas.
- Idea de fondo: hay **tres sitios** donde vive dinero (`wallet.transactions`/`ledger_entries`, `lifebook.ledger_entries`/`order_fees`/`settlements` y `lifebook.reservations` con su depósito). El modelo de escrow con restricción de forma (`tx_shape_chk`) solo aplica al primero.

### T-04 · El rol del monedero puede escribir en todo Life Book, y Life Book no pasa por el escrow

**Severidad: Alta** · Ámbito: base de datos · Esfuerzo: alto (es de diseño)

- Verificado en producción: el rol `malabogo` (el del monedero) tiene `SELECT`, `INSERT`, `UPDATE` y `DELETE` sobre **las 66 tablas** del esquema `lifebook`, incluidas `lifebook.ledger_entries`, `lifebook.settlements` y `lifebook.order_fees`.
- El rol `mobility_app` **sí puede leer** 7 tablas del esquema de dinero: `wallet.ecomerse_sellers`, `wallet.food_menu_items`, `wallet.food_restaurants`, `wallet.intercity_routes`, `wallet.jobs`, `wallet.rental_landlords`, `wallet.rental_properties`. Todas de catálogo y **solo lectura** (sin `INSERT`/`UPDATE`/`DELETE`).
- Esto corrige el briefing, que afirmaba aislamiento por esquema (ver §5.2).
- Lo relevante para la auditoría: el dinero de Life Book se lleva **fuera** del modelo de dinero del monedero. `src/lifebook/orders.service.ts:1258-1283` escribe `lifebook.order_fees` y cuatro asientos en `lifebook.ledger_entries` con `debe_xaf`/`haber_xaf`, y las liquidaciones de tienda son filas de `lifebook.settlements` (`:1419-1421`). No hay `ESCROW_LOCK`/`RELEASE`/`REFUND` ni `tx_shape_chk` en ese camino.

*(Los hallazgos por servicio se añaden en §3 cuando cierran los cuatro especialistas.)*

### T-05 · Aceptar un viaje de taxi no exige ser conductor verificado, y el precio lo fija quien acepta

**Severidad: Alta** · Ámbito: backend (+ app en el lado conductor) · Esfuerzo: bajo

- `src/mobility/mobility.controller.ts:600-621`, `POST /api/v1/mobility/trips/:id/accept`, lleva `@UseGuards(JwtAuthGuard)` (`:601`): exige **sesión**, no rol ni alta de conductor.
- El cuerpo es `{ price?: number }` (`:602`) y se escribe **tal cual** en la columna del cobro: `:617-618` → `SET status = 'accepted', driver_id = ${u.userId}::uuid, final_price = ${body.price ?? trip.requested_price}`.
- Esa columna es **la fuente del importe que se cobra**: `src/services/ride-settlement.service.ts:145-147` (`fareOf` = `final_price ?? requested_price`) alimenta el `ESCROW_LOCK` de `lockFare`.
- El único control de rango que existe en todo el flujo está en el **otro** endpoint, sobre otro campo: `:415-418` limita `requestedPrice` a 300–10.000 XAF. **`price` y `algorithmPrice` no tienen ninguna cota.**
- No se comprueba que el llamante sea el pasajero ni que esté dado de alta como conductor: el `driver_id` se asigna al que llama. Consecuencia: **cualquier cuenta con sesión** (un pasajero cualquiera) puede aceptar el viaje de otro y fijar el precio.
- El daño está acotado por el saldo: el pasajero solo puede bloquear lo que tenga disponible (`ride-settlement.service.ts:253-256`), pero si un pasajero bloqueó 10.000 XAF y quien acepta pone 12.000, la liquidación se hace por `final_price` y el pasajero **no recupera la diferencia** (el `RELEASE` va por `fareOf`, no por el importe bloqueado).
- Nota de «quién lo explota»: esta ruta se usa de verdad — `app/conductor.tsx:896` `taxiApi.acceptTrip(offer.id, p)` → `api/taxi.ts:57` `POST /mobility/trips/${id}/accept` con `{ price }`. La app solo la ofrece en la pantalla de conductor, así que el hueco se explota con la API directa, no desde la interfaz.
- Relacionado y del mismo sitio: `:230` `PUT /trips/:id/complete` (que ahora es `POST`) **no comprueba que el llamante sea el conductor asignado** (a diferencia de `PUT /trips/:id/status`, que sí lo hace en `:465`), y `:437` la lista `GET /trips/driver` devuelve **todos** los viajes en estado `requested` —con nombre, valoración y contador del pasajero— a cualquier sesión, no solo a conductores.
- Arreglo mínimo: exigir alta de conductor (`mobility.drivers` con `is_verified` y `status='active'`) en `accept` y `complete`; validar `price` contra la misma banda que `requestedPrice` (300–10.000 XAF) o contra la tarifa de la zona; y no devolver `passenger_*` en `GET /trips/driver` a quien no sea conductor.

---

### T-06 · Hay 227.000 XAF retenidos sin salida: 60 cerrojos de escrow sin liberar ni devolver, en producción, hoy

**Severidad: Crítica** · Ámbito: backend movilidad + comida + Life Book + escrow · Esfuerzo: alto (primero hay que decidir qué hacer con lo ya varado, después tocar código)

Medido en la base de producción con `SELECT` (consultas reproducibles en `as-consulta-integridad-*.sql`). No es una hipótesis de lectura de código: son filas reales con importe y fecha.

Un **cerrojo sin salida** = un `ESCROW_LOCK` en estado `COMPLETED` cuya referencia no tiene ni `ESCROW_RELEASE` ni `ESCROW_REFUND`. Clasificado por origen:

| Origen | Cerrojos | Importe | Más antiguo | Más reciente |
|---|---|---|---|---|
| `escrow_orders` (wallet) | 5 | 157.000 XAF | 25/08/2026 | 28/08/2026 |
| **viaje de taxi** | **39** | **46.500 XAF** | 16/09/2026 | 17/09/2026 |
| **pedido de Life Book** | **13** | **19.500 XAF** | 17/09/2026 | 17/09/2026 |
| pedido de comida | 2 | 3.000 XAF | 17/09/2026 | 17/09/2026 |
| sin fila que lo explique | 1 | 1.000 XAF | 17/09/2026 | 17/09/2026 |
| **TOTAL** | **60** | **227.000 XAF** | | |

- De los 39 de taxi, **31 están en estado `completed`** (43.300 XAF): el viaje terminó, el pasajero pagó y **el conductor no ha cobrado**; los otros 8 siguen en `accepted` (3.200 XAF). Los importes son 600, 1.500 y 2.000 XAF, del 16 y 17/09.
- Los **13 pedidos de Life Book** (19.500 XAF, todos del 17/09) y los **2 de comida** son el mismo patrón por el lado del comercio: entregado y sin cobrar. Encajan con el hallazgo C-03 del especialista de comida, que documenta un caso concreto: el pedido `LB-260917-0002`, entregado y pagado, **con su asiento contable y su cerrojo de 1.500 XAF intacto**.
- Los 5 de `escrow_orders` (157.000 XAF, del 25–28/08) son los más antiguos: tres semanas parados. Dos de los cerrojos grandes de esas fechas llevan `metadata: {"seed": true}`, es decir, son **datos de prueba dentro de la contabilidad real**; los otros tres (50.000, 20.000 y 10.000 XAF) no lo declaran.
- **El descuadre de conjunto:** en los monederos figuran **223.000 XAF** en el bucket `ESCROW`, mientras los cerrojos sin salida suman **227.000 XAF**. La diferencia es de **4.000 XAF** y **no he averiguado su origen**; no la presento como prueba de un fallo, solo como un número que no cierra (§4). *(Aviso de método: mi primera medición de este punto decía «1 monedero con los asientos descuadrados». Era **falso** y era culpa de mi consulta: sumaba los asientos de todos los monederos juntos, incluyendo la cuenta de plataforma —cuyos `FEE` son créditos sin contrapartida por diseño del camino bueno— y 17 monederos sin ningún asiento. Corregido tras la comprobación de §5.4; el especialista de dinero, con otra consulta, midió **0 descuadres** y los datos le dan la razón.)*
- **Causa raíz verificada: ningún barrido se dispara solo.** El especialista de servicios revisó el **crontab del host** y los **timers de systemd**, y yo lo he comprobado directamente en el servidor. Lo que hay programado es: `sync-traffic.js` (lunes 4:25), `lb-backup.sh` (4:20), y los timers del sistema (`certbot`, `apt-daily`, `logrotate`, `fwupd-refresh`…). **Nada de la aplicación.** Y los barridos que existen en el código no están en `@Cron`: `intercity.service.ts:844` define `expireStale(horas = 12)`, pero solo lo alcanza una ruta `@Roles('ADMIN')` (`intercity.controller.ts:12-15`) a la que nadie llama. En todo el backend hay **3 `@Cron`** (`billing-lifecycle.service.ts:35`, `billing-ops.service.ts:25`, `sms-scheduler.service.ts:21`) y ninguno barre estos casos. Es decir: el único barrido que podría correr es el `setInterval` de `ride-settlement.service.ts:85`, y por diseño **no cubre los `completed` sin liberar**.
- **El barrido que debería arreglarlo no lo está haciendo.** `sweepAll()` (`:861-882`) recorre viajes en `accepted`/`in_progress`/`arrived`, y `repairOne()` (`:925-953`) devuelve el dinero de los cancelados. **Ninguno de los dos cubre los `completed` sin release**: el único camino es `repairOne` en el caso `!releaseTx && ride.status === 'completed'`, que llama a `settle(...)` con `catch(() => undefined)` (`:961`), es decir, **si falla, no se entera nadie**.
- Evidencia de que ese barrido no corre o falla en silencio: los barridos de otros servicios **sí dejan su línea** en el log del proceso (`[food] barrido: 1 pedido(s)…`, `[ecomerse] …`, `[intercity] …`), y **no hay ninguna línea de `[ride-settlement]`** en `/root/.pm2/logs/malabogo-api-error.log`. La variable que lo desactiva (`RIDE_SWEEP_DISABLED`) **no está definida** en el `.env` (comprobado: 0 coincidencias).
- Corroboración independiente: el especialista de comida llegó por otra ruta a **223.000 XAF en garantía** y a 30 cerrojos sin liberar por 185.200 XAF (criterio más estrecho: excluye los de taxi). Los dos números son compatibles: 227.000 − 46.500 (taxi) = **180.500 XAF**, del mismo orden que sus 185.200 XAF.
- **Lo que NO afirmo:** la causa última del varado (§4). Lo verificado es el hecho —hay 227.000 XAF retenidos sin salida, 46.500 de ellos de viajes de taxi terminados o en curso— y que **no hay ninguna ruta automática que los recupere**.
- Arreglo mínimo (en este orden): (1) **primero**, un script de reconciliación de una sola pasada que liquide o devuelva lo ya varado, revisado antes de ejecutarlo; (2) después, que `sweepAll` cubra `completed` sin release y que el `catch` deje de ser mudo (debe gritar en el log); (3) una alerta cuando `sum(balance_escrow)` y los cerrojos sin salida se separen más de un margen.

### T-07 · Pedido entregado ≠ dinero liberado: el escrow se libera en una transición, no en la entrega

**Severidad: Crítica** · Ámbito: backend comida y mercado · Esfuerzo: medio

Hallado por el especialista de comida y mercado; lo reproduzco aquí porque es el mismo patrón que T-06 y explica parte del varado.

- En Food, el reparto lo cierra el repartidor pero **la liberación del escrow está cableada solo en la transición de estado que hace el dueño/cliente**: `src/food/food.service.ts:932-934` (camino del repartidor) frente a `:577-581` (camino que sí libera). Entregar por el primer camino deja el pedido cerrado, el dinero retenido y al comercio sin cobrar.
- Comprobado de forma independiente y concluyente: en todo `food.service.ts`, `liberarSiMonedero` **se llama una sola vez** (línea 578) y en todo `ecomerse.service.ts`, `liberarSiMonederoEc` **se llama una sola vez** (línea 647). Sus funciones hermanas de devolución tampoco cubren todos los caminos (`food.service.ts:646`, `ecomerse.service.ts:692` y `:994`). Es decir: **la cadena no es que se rompa en un caso raro, es que solo existe en un camino de cada servicio.**
- Lo mismo en el Mercado: `src/ecomerse/ecomerse.service.ts:736-740` frente a `:647`, y el barrido **no cubre el estado `delivered`** (`:633`).
- Detalle completo, con los 13 hallazgos (C-01…C-13), en `comida-mercado.md`.

### T-08 · El agente de caja no puede confirmar efectivo desde la app: el rol `AGENT` es inalcanzable con el token que emite la app

**Severidad: Crítica** · Ámbito: backend monedero + app del agente · Esfuerzo: bajo (es un decorador mal puesto)

- `src/http/agent.controller.ts:19-21`: la clase entera exige `@UseGuards(JwtAuthGuard, RolesGuard)` con `@Roles('AGENT')`, y las **cuatro rutas de trabajo no lo relajan** — `confirm-cash-in` (`:56`), `confirm-cash-out` (`:68`), `escrow/orders/:id/scan/pickup` (`:80`) y `scan/delivery` (`:92`). Solo los dos GET llevan `@Roles('USER','AGENT','ADMIN')` (`:42` y `:49`).
- El `RolesGuard` (`src/http/guards.ts:72-81`) traduce roles de movilidad al vocabulario del monedero con `ROLE_ALIASES = { PASSENGER: 'USER', DRIVER: 'USER' }`: **`AGENT` no es un destino del alias**.
- **Verificado en producción (solo `SELECT`):** el enum de la identidad de movilidad es `{PASSENGER, DRIVER, ADMIN}` — **`AGENT` no existe** — y los roles realmente presentes en `mobility.users` son `ADMIN, DRIVER, PASSENGER`. Un token emitido por `/mobility/auth/login` copia ese rol tal cual, así que **nunca** puede satisfacer `@Roles('AGENT')`. De los **4 agentes activos**, **3 no tienen ninguna fila en `mobility.users`** y el cuarto (`MBO-0042`, el que figura en el briefing) es `DRIVER`, que se aliasa a `USER`.
- La app usa su propia sesión para esas rutas (`api/agent.ts:72-91`, con `confirmCashIn` en `:72`) y **no llama al login del monedero**: la única puerta que emite `role: 'AGENT'` es `src/http/auth.controller.ts:94-105`, y ningún cliente de la app la usa.
- El propio código lo tenía a medio ver: `agent.controller.ts:38-40` dice *«El token de la app es DRIVER… así que estos dos GET se autorizan por identidad»* — el remedio se aplicó a los GET y se olvidó en las cuatro rutas que mueven dinero.
- **Impacto:** el efectivo es el canal principal de entrada de dinero en Guinea Ecuatorial (no hay pasarela de tarjeta activa, ver §7.6). Si el agente no puede confirmar un `CASH_IN`, el pasajero que entrega el dinero en mano **no recibe saldo**. El camino queda a medias: la operación existe, el efectivo se entrega, y la confirmación la rechaza el servidor con un 403.
- **Lo que NO afirmo:** no he ejecutado la llamada con la cuenta de agente (§4). La conclusión es de código más el estado real de la base.
- Arreglo mínimo: `@Roles('USER','AGENT','ADMIN')` en las cuatro rutas de trabajo, y resolver el perfil de agente **por identidad** (como ya hacen los GET con `agentProfileId`, `:29-36`), que es lo que la propia clase ya sabe hacer. El control de que sea agente de verdad no se pierde: `agentProfileId` comprueba `status === 'ACTIVE'` contra la base.

### T-09 · Un cerrojo ya devuelto se puede volver a usar, y liberarlo falla en silencio: hay pedidos que se crean sin dinero detrás

**Severidad: Alta** · Ámbito: backend dinero + los cuatro servicios que lo usan · Esfuerzo: bajo (marcar el cerrojo)

Cadena verificada eslabón a eslabón, la mayoría leyendo el código en vuelo. La encontró el especialista de comida (C-08); yo he comprobado cada paso y he acotado con precisión en qué servicios aplica y en cuál no.

1. **El reembolso no marca el cerrojo.** `src/services/wallet.service.ts:421-461` crea el `ESCROW_REFUND` y devuelve el dinero, y **no toca la fila del `ESCROW_LOCK`**: no le cambia el estado ni la anota como devuelta. La fila sigue ahí, íntegra, con la misma clave de idempotencia.
2. **Un cerrojo ya usado se devuelve como replay.** `lockForCommerceOrder` (`:282-284`) hace `findUnique({ where: { idempotencyKey } })` y **si encuentra la fila anterior devuelve `{ replay: true, transactionId }` sin consumir el token de PIN** — el `requirePaymentToken` está en la línea siguiente (`:285`), después del `return`. Un reintento con la misma clave hereda un cerrojo que ya no tiene dinero detrás.
3. **La liberación de ese pedido falla por saldo cero.** `postEntry` (`:141`) lanza `INSUFFICIENT_FUNDS` si el bucket quedaría negativo; el escrow del comprador ya se vació al devolver, así que el `RELEASE` revienta.
4. **Y el fallo se traga.** El `catch` de los caminos de liberación solo deja un `warn` (`food.service.ts:602-605`, `ecomerse.service.ts:1020-1022`): nadie reintenta, nadie avisa y el comercio **se queda sin cobrar sin que nadie se entere**.
5. **La columna que lo habría delatado existe y está sin usar.** `released_at` aparece **una sola vez en todo el backend, y es una lectura** (`ecomerse.service.ts:1051`): nunca se escribe. El especialista de comida comprobó además que `wallet.food_orders.released_at` existe en producción. Es el mismo patrón que `markUsed` en la media de Life Book (LS-07): un estado que se consulta y que nadie escribe.

**Dónde aplica y dónde no** (esto acota el hallazgo, no lo infla): de los cinco servicios que llaman a `lockForCommerceOrder`, **comida está a salvo** porque genera una clave nueva en cada intento (`food.service.ts:373`, `fd-order:${crypto.randomUUID()}`, con un comentario que explica exactamente por qué). Los otros cuatro usan **la clave del cliente**: `ecomerse.service.ts:456` (`ec-order:` + la del cliente), `intercity.service.ts:431`, `lifebook/orders.service.ts:340` y `lifebook/reservations.service.ts:248`. En esos cuatro, la misma clave que el carrito mantiene por tienda (`lifebook-carrito-checkout.tsx:256-257`) es la que reabre el cerrojo.

**Impacto:** un pedido puede quedar **creado, aceptado por el comerciante y con un cerrojo que ya no tiene dinero**. Al intentar cobrarlo, la liberación falla en silencio: el comerciante no cobra, el comprador no recibe nada, y el pedido se queda en un estado que parece normal. Es además una de las vías que engorda el dinero varado de T-06.

**Arreglo mínimo:** (1) que `refundCommerceOrder` marque el cerrojo (por ejemplo `status='REFUNDED'`) y que `lockForCommerceOrder` **no** haga replay de un cerrojo ya devuelto; (2) mover el `requirePaymentToken` **antes** del `return` del replay, para que un replay no pueda saltarse el PIN; (3) escribir `released_at` al liberar, que es la mitad que ya existe; (4) que el `catch` de la liberación deje de ser mudo.

### T-10 · Hay dinero en monederos sin dueño: 7 monederos con saldo que no corresponden a ningún usuario

**Severidad: Media** · Ámbito: base de datos (datos), no código · Esfuerzo: bajo (decidir y limpiar)

Apareció al preparar la reparación del dinero varado, y no es un hallazgo de código: es de **datos**.

- Verificado en producción: **7 monederos tienen saldo** (`balance_available` o `balance_escrow` mayor que cero) y **su `user_id` no existe en `mobility.users`**.

| Monedero | Disponible | En garantía | Nota |
|---|---|---|---|
| `cfddadbc-…7ef9` | 239.500 XAF | 60.500 XAF | 300.000 XAF sin dueño: el mayor |
| `1f0af473-…4ab0` | 0 | 50.000 XAF | origen de uno de los cerrojos varados |
| `19c5d266-…3d8` | 39.000 XAF | 0 | |
| `ffdb91c3-…f58` | 0 | 20.000 XAF | origen de otro cerrojo varado |
| `082cadab-…f62` | 0 | 10.000 XAF | origen del tercero |
| `00000000-…0001` | 6.200 XAF | 0 | **es la cuenta de plataforma** (`PLATFORM_USER_ID`): correcto, no es un huérfano |
| `340e4612-…c40` | 200 XAF | 0 | |

- Los seis primeros suman **619.200 XAF** de saldo real sin usuario. Los tres del medio (50.000 + 20.000 + 10.000) son exactamente los que tienen cerrojos varados: encajan con lo de T-06.
- **El séptimo no es un problema**: `00000000-0000-0000-0000-000000000001` es la cuenta de la plataforma que el código usa como destino de las comisiones (`ride-settlement.service.ts:729`). Que no exista en `mobility.users` es correcto: no es una persona.
- Por qué importa: un monedero sin usuario es dinero que **nadie puede reclamar ni gastar** (no hay sesión que lo abra), y a la vez contamina cualquier conciliación. Además delata lo de fondo: las referencias de usuario no están protegidas por clave ajena en `wallet.wallets`, así que un `user_id` puede quedar apuntando a la nada.
- Arreglo mínimo: **decidir primero** si esos saldos son de usuarios borrados (entonces hay que recuperar la identidad) o de datos de prueba (entonces se liquidan y se cierran). No borrar monederos con saldo sin esa decisión.

## 3. Hallazgos por servicio

Los cuatro especialistas escribieron su informe completo en esta misma carpeta. **Los hallazgos que cito aquí los he validado yo contra el código antes de aceptarlos** (la verificación de cada uno está dicha en la ficha); el resto están en su informe, con su evidencia.

| Informe | Fichero | Volumen | Hallazgos |
|---|---|---|---|
| Movilidad y taxi | `movilidad-taxi.md` | 945 líneas | 16 (V-01…V-16): 2 críticos |
| Comida y mercado | `comida-mercado.md` | 393 líneas | 13 (C-01…C-13): 3 críticos |
| Life Book y servicios | `lifebook-y-servicios.md` (+ 3 parciales) | 1.643 líneas | 54 (L/LS/LC/LH): 4 críticos |
| Dinero y monedero | `dinero-monedero.md` | 674 líneas | 12 (M-01…M-12): 1 crítica, 3 altas |
| **Plan de arreglo de la tanda 1** | `TANDA-1-PLAN-RECONCILIACION.md` | — | Causa raíz ya localizada, 5 pasos y 2 decisiones del dueño. **Pendiente de luz verde: no se ha ejecutado ninguna escritura.** |

### 3.1 Los doce hallazgos de servicio que hay que leer antes que ningún otro

| # | Id | Servicio | Hallazgo | Sev. | Validado por mí |
|---|---|---|---|---|---|
| 1 | **V-01** | Taxi | `trips/:id/accept` no exige ser conductor verificado: robo de viaje, precio libre y acceso al teléfono del pasajero (= mi T-05) | Crítica | Sí |
| 2 | **V-02** | Taxi | 28 de las 52 rutas del controlador de movilidad **sin guarda**; `GET /mobility/admin/proposals` responde **HTTP 200 sin token** (reproducido en vivo por el especialista) (= mi T-01) | Crítica | Sí (por código) |
| 3 | **L-07** | Alquiler | `GET /rental/landlords/:id` es **público** y devuelve `docType`, `docNumber` y la **URL de la foto del DIP/pasaporte** de cualquier arrendador | Crítica | **Sí, y ampliada**: `rental.service.ts:99-106` los expone a propósito en `mapLandlord`, no es un `SELECT *` que se escape |
| 4 | **LC-01** | Life Book | Un pedido en `disputed` es un **callejón sin salida**: el dinero se queda retenido para siempre | Crítica | **Sí**: `disputed` (línea 34) **no aparece en ningún `FROM`** (líneas 37-46) de `orders.service.ts` |
| 5 | **LC-02** | Life Book | La liquidación paga al comerciante dinero que la plataforma **nunca cobró** (efectivo, transferencia, pago en tienda) | Crítica | Ver informe |
| 6 | **LH-01** | Hotel | El panel del hotelero mueve la reserva **sin mover el monedero** —ni libera al entrar ni devuelve al cancelar—; la misma acción por la otra puerta sí lo hace | Crítica | **Sí**: `hotel-merchant.service.ts:382-404` escribe `payment_status='paid'` (`:391`) y `'refunded'` (`:392`) con **cero llamadas al monedero**; `reservations.service.ts:735-736` sí libera |
| 7 | **C-01/C-02** | Comida/Mercado | Entregar por el camino del repartidor/agente cierra el pedido **sin liberar el escrow**, y ningún barrido lo reintenta (= mi T-07) | Crítica | **Sí**: `liberarSiMonedero` y `liberarSiMonederoEc` se llaman **una sola vez** cada una |
| 8 | **C-03** | Dinero | La liberación falla **en silencio** y nadie la reintenta; sin cron para los barridos ya escritos | Crítica | **Sí** (ver T-06) |
| 9 | **V-03** | Taxi | El mismo trayecto de 3,5 km se anuncia a **1.275 XAF** en la portada y a **1.850 XAF** en la pantalla de taxi; la banda de negociación de `service_fares` no se aplica en ningún punto | Alta | Ver informe |
| 10 | **V-04** | Taxi | El conductor puede ponerse en línea y aceptar con los documentos **caducados**: la consulta de `driver/online` **no selecciona `expires_at`** | Alta | **Sí**: `mobility.controller.ts:1012-1016` || 11 | **M-01** | Monedero | El panel del agente **no puede confirmar efectivo ni escanear QR**: el rol `AGENT` es inalcanzable con el token de la app (= mi T-08) | Crítica | **Sí, en producción**: el enum es `{PASSENGER,DRIVER,ADMIN}` |
| 12 | **M-04** | Monedero | La comisión de comercio sale del escrow del comprador y **no entra en ningún monedero ni tiene apunte**: 7.650 XAF (el 37 % de las comisiones) sin contrapartida | Alta | **Sí**: `wallet.service.ts:407-415` crea el `FEE` con `receiverId: null` y sin `postEntry` |

### 3.2 Lo que los especialistas confirmaron de forma independiente

Que dos auditorías separadas lleguen a lo mismo por caminos distintos es la mejor señal de que el hallazgo es real:

- **T-01/V-02** (rutas de movilidad sin guarda): el especialista lo **reprodujo en vivo** (HTTP 200 sin token en `admin/proposals`) además de leerlo.
- **T-04/L-18** (permisos de base de datos): el especialista de Life Book midió lo mismo que yo y **añadió** que el rol del monedero lee `mobility.users` (teléfonos) y `mobility.drivers`, y que el código lo aprovecha a propósito (`rental.service.ts:124`, `intercity.service.ts:413,526`, `work.service.ts:211`).
- **T-06/C-03** (dinero retenido): 227.000 XAF por mi cuenta, 223.000 XAF en garantía y 30 cerrojos por 185.200 XAF por la suya. Criterios distintos, misma realidad.
- **V-04/V-05** (documentos y caducidades), comprobado por mí en producción: hay un conductor con `is_verified = true` y `status = 'active'` que tiene **2 documentos aprobados**, frente a otro con 16. Las 16 tipologías que existen en la tabla (`criminal_record`, `dip`, `driving_license`, `insurance_rc`, `medical_cert`, `municipal_permit`, `plate_inspection`, `professional_license`, `residence_permit`, `tax_id`, `transport_cert`, `selfie`…) son las del catálogo obligatorio. Es decir: **el sistema marca «verificado» sin comprobar el catálogo**, exactamente como decía el hallazgo.
- Y una observación mía, del mismo sitio: hay **3 filas de conductor y solo 2 usuarios con rol `DRIVER`** (más 12 `PASSENGER` y 2 `ADMIN`), que es la raíz del hallazgo V-10 (el historial del conductor es inalcanzable porque la cara se elige por `users.role`, y ese rol no se concede al aprobar el alta). También en `mobility.reservations`: **2 filas, una con `user_id` nulo**, sin clave ajena (V-07).
- El especialista de Life Book verificó además en la base que `transactions_idempotency_key_key UNIQUE` y `tx_shape_chk` con sus seis formas **existen tal y como dice el diseño**: el modelo de dinero del monedero está bien construido; lo que falla son los caminos que no lo usan.
- Y se corrigió a sí mismo donde la evidencia no le daba la razón: su hallazgo LS-11 (cuarentena automática de contenido por reportes) **bajó de gravedad** al comprobar que `lifebook.reports` sí tiene `uq_lb_report_once UNIQUE (content_id, reporter_id)`, así que hacen falta cinco cuentas distintas, no cinco pulsaciones de una. La matización está escrita junto al hallazgo, no en una nota al pie.

### 3.3 Un patrón que se repite en tres servicios distintos

Vale la pena verlo junto, porque no son tres fallos independientes sino **el mismo fallo tres veces**: *un camino de negocio que cierra la operación sin cerrar el dinero.*

| Servicio | Cierra bien por… | Y no cierra por… |
|---|---|---|
| Comida | el dueño marca `delivered` (`food.service.ts:577-581`) | el repartidor entrega (`:932-934`) |
| Mercado | la transición con reparto (`ecomerse.service.ts:647`) | la entrega por agente (`:736-740`) |
| Hotel | una de las dos puertas del panel (`lifebook/hotel-merchant.service.ts`) | la otra puerta, que mueve la reserva y no el monedero (LH-01) |
| Life Book | `cancel`/`decline` devuelven (`orders.service.ts:860`) | `disputed` **no tiene salida** (LC-01) |

Lo que los une: **el barrido que debería repararlo no cubre el estado final** (T-06). Cualquier arreglo que solo toque una de las puertas dejará el mismo agujero en la otra, así que el arreglo de verdad es (a) un único camino de cierre y (b) un barrido que cubra *todos* los estados terminales con dinero vivo.

### 3.4 El mismo patrón, tres veces, en columnas que existen y nadie escribe

Hay tres columnas que **el código lee o declara y nunca escribe**. No son restos inofensivos: cada una era la salvaguarda que habría delatado un problema.

| Columna | Dónde se lee | Qué habría evitado |
|---|---|---|
| `released_at` | `ecomerse.service.ts:1051` (única aparición en todo el backend) | Saber qué pedidos ya se cobraron, y cerrar T-09 |
| `media_uploads.status = 'used'` + `used_at` | `media.service.ts:484-488` define `markUsed`, que **nadie llama** | Distinguir media publicada de media huérfana: `purgeOrphans` filtra por `pending`/`ready`, así que el barrido no puede distinguirlas (LS-07) |
| `handed_over_at` (efectivo del repartidor) | `food.service.ts:706` (única aparición en todo el backend, y es un `SELECT`) | Conciliar el efectivo que el repartidor dice haber entregado (C-07) |

La lectura útil no es «faltan columnas», sino **«la salvaguarda ya estaba diseñada y se quedó a medio cablear»**: en los tres casos el arreglo es escribir lo que ya se lee, no inventar un mecanismo nuevo.

---

## 4. No verificable sin ejecutar

Nada de lo que sigue se afirma en el resto del informe. Se lista para que nadie lo dé por bueno, y para que quien venga detrás sepa exactamente dónde empieza el trabajo de comprobación.

1. **La causa última del dinero varado (T-06).** Está verificado el hecho (60 cerrojos, 227.000 XAF, 31 viajes `completed` sin liquidar) y que el barrido no los cubre por diseño. **No está verificado por qué el barrido no los salvó igualmente**: no he reproducido una liquidación fallida ni he visto la excepción. El `catch` mudo de `ride-settlement.service.ts:961` es un sospechoso, no una prueba.
2. **Los 4.000 XAF de diferencia** entre el bucket `ESCROW` de los monederos (223.000) y la suma de cerrojos sin salida (227.000). No he averiguado si son un cerrojo sin monedero, un monedero sin cerrojo o dos mediciones que no son comparables. **El barrido de cuadre no ha cerrado** (§5.4).
   - Lo que **sí** está comprobado: los saldos **no** están descuadrados contra el libro. El monedero grande (502 asientos) tiene sus `balance_after` coherentes y su `version` (553) al día, y el especialista de dinero midió **0 descuadres** con otra consulta. La sospecha de «monedero descuadrado» que dejó escrita mi primera medición era un artefacto de mi consulta, no un hallazgo.
3. **Que la app instalada en el teléfono corresponda a este `app/`.** He auditado el **código fuente**, no el APK. No se ha recompilado (habría sido un cambio, y el encargo era solo hallazgos). Cualquier afirmación sobre «lo que ve el usuario» es, en rigor, «lo que el código fuente pinta».
4. **Los hallazgos que exigen una llamada HTTP real.** Se ha leído el código, no se ha atacado el servicio. El especialista de movilidad **sí reprodujo en vivo** que `GET /mobility/admin/proposals` responde HTTP 200 sin token; el resto de rutas abiertas no se han llamado. **No se ha intentado ninguna escritura** (crear parada, aprobar ruta, aceptar viaje ajeno): hacerlo habría modificado datos de producción.
5. **La explotabilidad de T-05 con una cuenta real.** Está verificado que el código no comprueba el alta de conductor, pero **no se ha ejecutado** el ataque con una cuenta de pasajero. La conclusión es de lectura de código.
6. **El comportamiento bajo carga y con dos procesos a la vez.** No se ha probado la concurrencia real de la idempotencia ni qué pasa con dos `settle` simultáneos.
7. **La rama de webhooks de pago en vivo.** Está verificado que ningún proveedor implementa `verifyWebhookSignature` y que los cuatro proveedores automáticos están desactivados, pero no se ha enviado un webhook firmado para comprobar el rechazo.
8. **Los datos de los roles que esta cuenta no tiene.** Varios caminos (panel admin de documentos, consola de agente de caja, paneles de hotelero y de tienda) solo se han auditado por código. No se ha entrado con esas cuentas.
9. **El estado del APK, de las tiendas y de la infraestructura** (nginx, certificados, PM2 más allá de lo citado). Fuera del encargo.
10. **Los logs anteriores al 17/09 18:22.** El log de errores del proceso empieza en el último reinicio, así que `[ride-settlement]` podría haber escrito antes y no lo vería. La afirmación del informe es «no aparece **en el log actual**», no «nunca ha aparecido».

## 5. Errata: datos heredados que esta auditoría corrige

### 5.1 El contenedor de Postgres no se llama `malabo-postgres`

- El briefing (`PARAMETROS-AUDITORIA-SERVICIOS.md`) y `backend/SALVAGE.md:37` citan el contenedor **`malabo-postgres`**.
- Los contenedores reales en `8.218.88.237` son **`mirror-postgres`**, `mirror-redis`, `mirror-minio` y `egrp-osrm` (`docker ps`).
- Consecuencia práctica: cualquier `docker exec malabo-postgres psql …` devuelve **vacío, no un error visible** (el contenedor no existe; el script de SSH descarta stderr). Costó dos intentos en esta sesión.

### 5.2 Los roles de base de datos NO están aislados por esquema

- El briefing afirma: *«Los roles de base de datos están aislados por esquema: el rol de `wallet` no tiene permiso sobre `mobility`»*.
- Medido con `has_schema_privilege`: `malabogo`, `mobility_app` y `food_agent` tienen **`USAGE` en `wallet`, `mobility` y `lifebook`**.
- Medido con `has_table_privilege`: `malabogo` tiene **CRUD completo sobre las 66 tablas de `lifebook`** y `SELECT` sobre `mobility.taxi_ratings`; `mobility_app` tiene `SELECT` sobre 7 tablas de `wallet`; `food_agent` tiene `SELECT` sobre las 83 tablas de `wallet`.
- El aislamiento **sí existe donde de verdad importa**: `mobility_app` **no puede escribir** en ninguna tabla de dinero del esquema `wallet` (no tiene `INSERT`/`UPDATE`/`DELETE` sobre `wallets`, `transactions`, `ledger_entries` ni `escrow_*`). La parte «no tiene permiso» era cierta para **escritura**, no para lectura.

### 5.3 Una precisión sobre T-08: quien usa el login del monedero es el WebView heredado, no la app nueva

- El especialista de dinero aportó la traza que faltaba: los accesos a `POST /v1/auth/login` (el **único** emisor del rol `AGENT`) registrados en nginx el 17/09 provienen del **WebView heredado** (`hk.egrouteplan.com/wallet/`), no de un cliente nuevo. Los dos `GET` del panel de agente **sí** funcionan (el agente ve su cola), y la última confirmación real de efectivo es del **26/08**, anterior al cambio de alias del parche 93.
- Eso refuerza el hallazgo en vez de rebajarlo: el camino bueno existe, se usó hasta el 26/08, y desde el cambio quedó cortado sin que nadie lo notara. En el mismo informe se cuantifica: **66.000 XAF** en retiradas con el hold vencido y **87.000 XAF** de escrow de recados con agente asignado que dependen de un escaneo imposible.

### 5.4 Mi propia medición del cuadre de monederos era inválida (y la corregí)

- Mi primera consulta de cuadre dijo **«1 monedero con los asientos descuadrados»** (`diferencia disponible 134.700 XAF`). Llegó a estar escrito en el borrador de este informe.
- **Era falso, y el fallo era del instrumento:** sumaba los asientos de **todos** los monederos en una sola cifra, cuando (a) solo **13 de los 30** monederos tienen asientos, (b) los `balance_after` son instantáneas sucesivas del mismo saldo y no importes que se sumen, y (c) la cuenta de plataforma recibe créditos `FEE` sin contrapartida **por diseño del camino bueno** (`fee.service.ts`), así que su suma nunca cuadra con su saldo. Es el mismo error de diseño que ya había cometido antes con un `join` sin condición.
- Comprobado bien, el monedero señalado (502 asientos) tiene sus `balance_after` coherentes y su `version` (553) al día, y el especialista de dinero midió **0 descuadres** en todos los monederos con otra consulta independiente.
- **Consecuencia para el informe:** no hay ningún hallazgo de «monedero descuadrado». Lo único que queda abierto de aquella medición son los 4.000 XAF de §4, presentados como número sin explicar y **no** como prueba de un fallo. Lo dejo escrito porque es el cuarto dato de esta auditoría que resultó falso al comprobarlo —y el segundo que era mío.

### 5.5 La matriz de rutas de este informe tuvo un falso positivo que hay que dejar escrito

- La primera versión de `pruebas\as-rutas-backend.cjs` buscaba las guardas **hacia atrás** del decorador de ruta y produjo **«425 de 575 rutas sin guardas»**.
- Era **falso**: en este código las guardas van **después** (`@Post('jobs')` → `@UseGuards(JwtAuthGuard)` → método). El bucle se detenía al encontrar la firma del método anterior.
- Corregido a búsqueda hacia delante y **verificado con el ejemplo mínimo**: el resultado válido es **79 rutas sin guarda, 374 solo con sesión, 122 con rol**. Las cifras de §1.1 son las corregidas.

---

## 6. Instrumentos (todo reproducible)

Ninguno de estos scripts toca el proyecto auditado: leen y escriben solo dentro de `D:\egapp\.auditoria-servicios\`.

| Script | Qué produce |
|---|---|
| `pruebas\as-traer-backend.ps1` | Espejo local del `src/` y `prisma/` en vuelo, con sha256 para comparar |
| `pruebas\as-rutas-backend.cjs` | `as-matriz-rutas.md` — las 575 rutas con guardas y roles |
| `pruebas\as-censo-abiertas.cjs` | `as-rutas-abiertas.md` — las 79 rutas sin guarda, con el cuerpo del manejador |
| `pruebas\as-sql-sin-esquema.cjs` | `as-sql-sin-esquema.md` — censo de SQL que no califica el esquema |
| `pruebas\as-verifica-citas.cjs` | **Comprueba que cada cita `archivo:línea` de este informe dice lo que el informe dice** |
| `.auditoria-servicios\as-consulta-*.sql` | Las 8 consultas de solo lectura lanzadas contra producción, tal cual se ejecutaron (integridad del dinero, comisiones, agentes, movilidad, proveedores). Reproducibles: `docker exec -i mirror-postgres psql -U postgres -d egrouteplan -f - < <fichero>` |

El verificador no es decorativo: en su primera pasada cazó **dos citas mías equivocadas** (el `INSERT INTO reservations` está en la línea 367, no 366; el `assertAdmin` en la 126, no 127), y más tarde otras cinco por un desfase de una línea. Están corregidas y las **81 citas** del informe pasan. Antes de citar cualquier línea nueva, se añade a ese fichero y se vuelve a ejecutar:

```
cd D:\egapp; node pruebas\as-verifica-citas.cjs
```

Dos scripts más vienen del especialista de movilidad: `check-drift.cjs` compara por sha256 los ficheros clave del espejo local con el servidor (12 ficheros, 0 distintos) y `dup-rutas.cjs` comprueba rutas duplicadas.

---

## 7. Lo que está bien (y conviene no romper)

Lo escribo con datos, no por cortesía: hay partes del sistema que están mejor construidas que la media y que **una reparación apresurada de lo de arriba podría estropear**.

1. **El modelo de dinero del monedero está bien pensado y bien puesto en la base.** Verificado en producción: `transactions_idempotency_key_key UNIQUE`, y la restricción `tx_shape_chk` con sus seis formas permitidas (`DEPOSIT`, `WITHDRAWAL`, `ESCROW_LOCK`, `ESCROW_RELEASE`, `ESCROW_REFUND`, `FEE`) exactamente como las describe el código. Los cerrojos son idempotentes por clave (`${tripId}:lock`, `:release`, `:refund`), se toman con `SELECT … FOR UPDATE`, los dos monederos se bloquean **en orden de UUID** (evita el interbloqueo) y **no hay un solo saldo negativo** en los 30 monederos. Cero claves de idempotencia duplicadas.
2. **La comisión se congela en el cerrojo** (`fee_info`): si mañana cambia la política, el viaje de hoy liquida con lo pactado hoy. Es la decisión correcta y está implementada.
3. **La liquidación de viajes contempla los caminos difíciles**: la ventana de cancelación gratis, la cuota por no presentarse acotada por el propio importe («nunca deuda»), el reembolso total si cancela el conductor con aviso por faltas (3 en 7 días), el reembolso de zombies a los 90 minutos y la disputa con reversa en la que **cada parte devuelve lo que cobró**. Está mejor que la media del sector.
4. **El segundo factor del dinero es de verdad**: token de un solo uso, 90 s, atado al importe y a la referencia, consumido **dentro** de la transacción del cerrojo, con PIN en Argon2id.
5. **La puerta de propiedad de tienda está bien hecha** (`ShopOwnerGuard`, `http/guards.ts:120-144`): comprueba la pertenencia **contra la base**, y responde el **mismo 404** para «no existe» y para «es de otro» (`:138`), así que no filtra la existencia de tiendas ajenas. Cuando la ruta no trae `:shopId`, resuelve la tienda del usuario y no inventa ninguna comprobación.
6. **El camino de webhooks de pago está cerrado hoy, y por eso no lo cuento como hallazgo**: ningún proveedor implementa `verifyWebhookSignature` (los tres que existen no la tienen, así que la ruta responde siempre 400) y los cuatro proveedores automáticos están desactivados, con `auto_approve` inactivo en los cinco. **Pero está cerrado por accidente, no por diseño**: si alguien añade un proveedor real con `auto_approve`, la ruta que marca `signature_status = 'valid'` sin mirar el resultado (`billing-webhook.controller.ts:35-40`) pasa a ser un problema.
7. **El JWT ya no degrada en silencio**: si falta `JWT_SECRET` o es corto, **la API no arranca** (`http/app.module.ts:73-79`). Es exactamente lo contrario del `|| 'super-secret-key'` que había antes.
8. **El throttler sí está registrado** como guarda global (`app.module.ts:122`) y cada ruta sensible lo aprieta con su propio `@Throttle` (5/min en login, 3/min en reenviar OTP).
