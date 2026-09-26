# HOTEL — diagnóstico antes de reestructurar

**Encargo:** «nuestro sistema de hoteles necesita una reestructuración de construcción de backend y
frontend», con 31 capturas del flujo de hoteles de **Meituan** como referencia.

**Regla de este documento:** todo lo que va aquí está **medido sobre el código** el 26-sep-2026. Lo que no
he podido medir va marcado como **[SUP]** (supuesto) o **[SIN MEDIR]** y no se usa para decidir.

---

## 0. Resumen: qué es «reestructurar» aquí

El sistema **no está mal construido**. Está **incompleto por tres lados distintos**, y los tres exigen
trabajos que no se pueden mezclar:

| | Trabajo | Bloquea a | Estado |
|---|---|---|---|
| **A** | **Deuda de DINERO del backend** — 12 hallazgos, **1 crítica** | **todo lo demás** | abierta |
| **B** | **Versionar lo que ya existe** — el esquema del hotel no está en el repo | A y C | sin empezar |
| **C** | **Capa de descubrimiento y confianza** — lo que Meituan hace y no existe | — | parcial · **alcance recortado** (D2, §7) |

**Alcance de C — decidido por Bernardo el 26-sep** (§7): **los hoteles que hay hoy son EJEMPLOS, no hoteles
reales**, igual que las tiendas y los usuarios. No hay ningún hotel dado de alta de verdad. Después de
publicar irá **hotel en hotel** buscando que se unan.

Eso parte C en dos tiempos, y evita el error de construir para un mercado que aún no existe:

- **Ahora (antes de publicar):** la **ficha** (lo que decide la compra), la **confianza** y el **desglose de
  precio**, más la **búsqueda por filtro y por ubicación del usuario** — que es lo que Bernardo ha pedido
  expresamente.
- **Después (con inventario real):** el **aparato de saturación de Meituan** — 9 ordenaciones, mapa con 18
  precios, ranking, «% de elección», promociones y 神券. Ese aparato resuelve «demasiadas opciones»; con 3
  hoteles de ejemplo es **ruido**, y su coste (backend de ordenación + modelo de promociones) no se puede
  amortizar contra cero inventario.

**Y una consecuencia que nace hoy, no estaba en el encargo:** si todo es de ejemplo, hace falta **poder
distinguirlos y purgarlos** antes de publicar. Hoy **el ejemplar no se marca**: no hay bandera, no hay seed
versionado (medido: `backend/sql/` no tiene ni una migración del hotel y el seed no está en el repo). Los
ejemplos viven **solo en la base del servidor**. Eso convierte el trabajo B de «higiene» en **requisito de
publicación**: sin el esquema versionado, los ejemplos no se pueden borrar ni recargar de forma reproducible.

---

## 1. Lo que YA existe (medido)

### 1.1 Frontend

**13 pantallas + 1 tarjeta = 6.412 líneas.**

| Fichero | Líneas | Qué es |
|---|---|---|
| `app/lifebook-hotel.tsx` | 516 | Buscador (ciudad, fechas, huéspedes, modos) |
| `app/lifebook-hotel-resultados.tsx` | 354 | Lista de resultados **con filtro de precio** |
| `app/lifebook-hotel-fechas.tsx` | 311 | Calendario a pantalla completa |
| `app/lifebook-hotel-detalle.tsx` | 547 | Ficha + habitaciones + calendario por tipo |
| `app/lifebook-hotel-habitaciones.tsx` | 483 | Panel hotelero: lista de tipos de habitación |
| `app/lifebook-hotel-habitacion.tsx` | 540 | Panel hotelero: alta/edición de un tipo |
| `app/lifebook-hotel-calendario.tsx` | 484 | Panel hotelero: precios por noche y cierre de fechas |
| `app/lifebook-hotel-perfil.tsx` | 466 | Panel hotelero: ficha del hotel (estrellas, horarios, normas) |
| `app/lifebook-hotel-gestion.tsx` | 327 | Panel hotelero: gestión (dos partes, decisión del 12-sep) |
| `app/lifebook-hotel-panel.tsx` | 521 | Panel hotelero: operación del día + máquina de estados |
| `app/lifebook-hotel-reservar.tsx` | 698 | Rellenar y confirmar la reserva |
| `app/lifebook-hotel-reserva.tsx` | 487 | Detalle de una reserva (huésped) |
| `app/lifebook-hotel-reservas.tsx` | 497 | Mis reservas / las de mi hotel |
| `components/HotelResultCard.tsx` | 181 | Tarjeta de resultado |

**Cliente API:** `api/hotel.ts` — 529 líneas, **20 métodos**, cabecera `Idempotency-Key` obligatoria al
reservar con clave **estable por intento**.

**Contrato:** `packages/contracts/src/reservation-flow.ts` — 126 líneas.

### 1.2 Backend (`Parte 42`)

| Fichero | Líneas | Rutas |
|---|---|---|
| `lifebook/hotel.controller.ts` | 270 | **23** |
| `lifebook/hotel-merchant.controller.ts` | 148 | **11** |
| `lifebook/hotel.service.ts` | 1.287 | — |
| `lifebook/hotel-merchant.service.ts` | 537 | — |
| `lifebook/reservations.service.ts` | 874 | — |
| `lifebook/dto/hotel-reservation.dto.ts` | 208 | — (2 DTO sin usar) |

**34 rutas** — 6 públicas, 1 con sesión opcional (`OptionalJwtGuard`), 27 con `JwtAuthGuard`, 5 de la
familia `shops/:shopId/*` con `ShopOwnerGuard` extra.

### 1.3 Modelo de datos — 5 tablas propias

| Tabla | Columnas medidas |
|---|---|
| `lifebook.hotel_profiles` | `property_kind` (6 valores) · `stars` 1-5 · `checkin_from` / `checkin_until` / `checkout_until` · `reception_open_24h` · `taxes_included` · `house_rules` (600) · `arrival_note` (600) · `cancellation_policy` (**600, texto libre**) · `amenities` |
| `lifebook.room_types` | `base_price_xaf` · `weekend_price_xaf` · `min_nights` · `max_nights` · `total_units` · `deposit_percent` · `hold_minutes` · `confirmation_hours` · `cancellation_hours` (0-720, def. 48) · `images` (máx 12) · `amenities` · `beds` (máx 8) · `product_id` → **el tipo de habitación ES un producto de Life Book** |
| `lifebook.room_type_calendar` | Excepciones por noche (precio, cierre, estancia mínima) |
| `lifebook.reservations` | Reserva + `hold_expires_at` |
| `lifebook.reservation_nights` | **Una fila por noche y unidad** — es el anti-sobreventa |

**`AMENITIES` es un enum CERRADO de 21 valores** (`wifi`, `desayuno`, `aire`, `piscina`, `parking`,
`restaurante`, `bar`, `gimnasio`, `recepcion_24h`, `agua_caliente`, `generador`, `lavanderia`, `tv`,
`terraza`, `ascensor`, `admite_mascotas`, `adaptado`, `cocina`, `nevera`, `caja_fuerte`, `seguridad`).
Un valor fuera de la lista da `AMENITY_INVALID`. Máx 20 por hotel.

### 1.4 Lo que está bien (y no hay que tocar)

- **Anti-sobreventa real**, no una comprobación de código: fila por noche y unidad insertada dentro de la
  transacción, `FOR UPDATE` sobre la fila estable del tipo y recuento obligatorio.
- **El dinero lo calcula siempre el servidor** (`quote()`): el cliente no manda importes y el % de señal se
  topa con el del hotel (`Math.min`).
- **Propiedad de recursos cerrada**: `owner_id` dentro del `WHERE` y 404 idéntico para «no existe» y «es de
  otro».
- **Transiciones cerradas** con tabla de permisos por acción y guardado optimista (`409` si otro
  recepcionista se adelantó).
- **Idempotencia** por `(usuario, clave)` con `pg_advisory_xact_lock` y respuesta guardada.
- **Coherencia de disponibilidad**: calendario público, búsqueda y creación usan la MISMA consulta.

---

## 2. Trabajo A — la deuda de dinero (12 hallazgos)

**1 Crítica · 5 Altas · 4 Medias · 2 Bajas.** Detalle completo en `.auditoria-servicios/_parte-hotel.md`.

| # | Sev. | Qué pasa |
|---|---|---|
| **LH-01** | **Crítica** | **El panel del hotelero no mueve el monedero.** Registra entrada/cancelación por `hotel-merchant.service` sin `ESCROW_RELEASE`/`ESCROW_REFUND`: **el hotel nunca cobra y el huésped nunca recupera**. Y la MISMA estancia se comporta distinto según la pantalla (`lifebook-hotel-reservas.tsx` sí devuelve; el panel no). |
| LH-02 | Alta | «Confirmar reserva» sin cobrar la señal deja la reserva atascada sin salida |
| LH-03 | Alta | Guardar precio o estancia mínima **REABRE los días cerrados** del calendario |
| LH-04 | Alta | El precio cambia según la pantalla y el cobro usa la noche **MÁS CARA** |
| LH-05 | Alta | El método «Monedero» es **inalcanzable** desde la app: toda reserva con él responde 400 |
| LH-06 | Alta | Se puede **cancelar DESPUÉS del check-in**: «Devuelto» sin devolución y habitación liberada con el huésped dentro. **La regla estaba escrita TRES veces y el servidor tiene una CUARTA** (§9.1). **Mitad cliente: HECHA** (`egapp 0d30e35`) · **mitad servidor: ABIERTA** |
| LH-07 | Media | La señal pagada con monedero caduca en `hold_minutes` (20 min) aunque el hotel tenga 24 h |
| LH-08 | Media | Una reserva `pending` con retención vencida ocupa inventario y sigue «viva» para siempre |
| LH-09 | Media | Reintentar con la misma `Idempotency-Key` reaprovecha un cerrojo **ya devuelto**: el hotel no cobra |
| LH-10 | Media | Si la liberación al hotel falla, no hay reintento ni cola: la señal se queda en garantía |
| LH-11 | Baja | `pending` significa dos cosas y la app lo rotula «Señal pagada · por confirmar» aunque no haya señal |
| LH-12 | Baja | Los DTO no se aplican en el panel: un `images` malformado **borra las fotos** |

**Por qué esto bloquea lo demás:** cada pantalla nueva que añade un camino a «confirmar entrada»,
«cancelar» o «cerrar reserva» **multiplica un camino roto**. LH-01 es exactamente el caso: dos pantallas,
dos comportamientos del dinero. **Construir descubrimiento y confianza antes de cerrar esto es ampliar la
superficie de un fallo que ya mueve dinero.**

**Y no vale decir «como todo es de prueba, da igual»** (D5, §7.1): LH-01 no pierde dinero hoy porque no hay
hoteles reales, pero **es un fallo de código que se cobra el primer día que haya uno**. Ver §7.1.

**[SIN MEDIR]** El barrido `expire-stale`: no hay `@Cron` dentro del backend. De ese dato depende la
gravedad real de LH-07 y LH-08. Requiere el servidor.

---

## 3. Trabajo B — lo que NO está versionado

**Las 20 migraciones de `backend/sql/` son de movilidad, carrito, cupones y comida. Ninguna es del hotel.**
El `prisma/mobility/schema.prisma` local es del esquema `mobility` y **no contiene hotel**.

Las 5 tablas del hotel existen **solo en el servidor**. Ni en `backend/sql/`, ni en `prisma/`, ni en
`backend/server-src/` (los 12 ficheros descargados el 15-sep **no incluyen la Parte 42**).

**Consecuencia, y es la primera tarea real de «reestructuración de backend»:**

1. **La base no se puede reconstruir desde cero.** Si el servidor se pierde, el esquema del hotel se pierde.
2. **Ninguna migración del hotel tiene historial.** Cualquier columna nueva entra sin saber qué había antes.
3. **La copia que se audita es la que se congeló el 18-sep** — el `hotel.service.ts` congelado es del
   **17-sep 14:53** y el `reservations.service.ts` del **17-sep 16:59**. Todo lo que se construyó después
   **no está en el repo**.

> **Antes de escribir una línea de backend:** volcar el esquema real del hotel (5 tablas, columnas, tipos,
> índices, constraints) a `backend/sql/` y bajar la Parte 42 a `backend/server-src/`. Sin esto se trabaja
> contra una foto de 9 días.
>
> **MATIZADO el 27-sep (§9.3):** esa foto resultó estar **viva** — las 5 huellas del código del hotel
> coinciden al byte con el servidor. Así que **se puede editar en local y desplegar sin riesgo de partir de
> una base falsa**. El volcado del esquema (el `CREATE TABLE` de las 5 tablas) sigue pendiente y sigue siendo
> lo que permite **versionar** y **purgar los ejemplos**: eso no lo cubre la verificación de huellas, porque
> lo que falta no es el código, es **el esquema de la base**.

**Y B tiene ahora un motivo de publicación, no solo de higiene** (D5, §7.1): los hoteles que hay son
**ejemplos** y hay que poder **purgarlos o recargarlos** cuando lleguen los reales. Un ejemplo que no se puede
identificar ni borrar de forma reproducible **se queda dentro al publicar**. El volcado del esquema es el
paso previo a cualquier carga de datos reales.

---

## 4. Trabajo C — el mapa de brecha frente a Meituan

31 capturas cubren **8 etapas**: buscador · calendario · buscador de ciudad · ocupación · resultados
(5 capturas de filtros) · ordenación · modo mapa · ficha (4 pestañas) · habitación · rellenar pedido · pago
· estados del pedido.

| Elemento de Meituan | Hoy | Trabajo |
|---|---|---|
| Buscador con ciudad + fechas + ocupación | **existe** | — |
| Calendario con precio por noche y festivos | **existe** (`lifebook-hotel-fechas`) | — |
| Resultados con tarjeta de hotel | **existe** | — |
| **Filtro de precio** | **existe** (hoja de filtros, `minPrice`/`maxPrice`) | — |
| **Ordenación** (9 modos) | **NO** — el servidor no la admite, declarado en `resultados.tsx:51` | **después de publicar** (§7/D2): es exactamente el aparato que resuelve «demasiadas opciones» |
| **Filtros de estrellas / 钻** | `stars` 1-5 existe y **no se filtra** | backend + frontend |
| **Filtros de facilidades** | `amenities` (21 valores) existe y **no se filtra** | backend + frontend |
| **Filtros de TEMAS** (电竞酒店 · 情侣约会 · 温泉汤池 · 亲子 · 商务) | **no existe el dato** — `amenities` son servicios, no temas | **modelo nuevo** |
| **Filtro de distancia con % de elección** | no existe | **backend + frontend** — y Bernardo **lo ha pedido**: la búsqueda se hará «por filtro o por la ubicación donde se encuentra el usuario». La parte de **distancia** sí; el **«% de elección»** de Meituan no (necesita volumen, §7/D4) |
| **Modo mapa con precios** | **0** en resultados (MapLibre ya se usa en `-reserva.tsx:417` y la ficha tiene lat/lng) | frontend — **después de publicar** (§7/D2) |
| **Valoraciones: escribir y listar** | **`rating` sale de `shops.rating`** — la nota **de la tienda**, no del hotel. **No hay tabla de reseñas.** | **modelo nuevo · DEFINIDO (§8.1)**: tabla `lifebook.hotel_reviews` (`021`), permiso = reserva `checked_out`, espejo en `hotel_profiles`. `shops.rating` **no se toca** (es la nota del mercado) |
| **Pestañas 亮点 / 设施 / 政策 / 周边** | la ficha es **una sola página** (amenities como chips) | frontend |
| **Galería 封面 / 房间 / 公共区域 / 相册** | `images` (máx 12) **sin clasificar** | modelo + frontend |
| **Política con fecha/hora + penalización calculada** | `cancellation_policy` es **texto libre 600** y `cancellation_hours` un número relativo (0-720, def. 48). Meituan usa **hasta qué hora** y **tramos con tarifa** | **MODELO DECIDIDO (§8.2): `cancellation_hours`, sin tramos.** El modelo de tramos **no se construye**; la penalización **es la señal**. El rótulo **ya está pintado** (3 pantallas) y el servidor ya calcula el campo → lo que queda es **backend**: el instante (LH-13) y el efecto en el dinero (LH-01), más el desacople del texto libre |
| **Etiqueta 立即确认** | **el dato YA existe**: `room_types.confirmation_hours`. No se pinta | **solo frontend** |
| **费用明细 con N descuentos** | `quote()` devuelve total / señal / restante. **Sin desglose** | backend |
| **Promociones y 神券 del hotel** | `014_cupones.sql` es del **mercado**, no del hotel | modelo |
| **入住礼赠 / 会员权益 / 积分奖励** | no existe | modelo |
| **订房必读 + 住客姓名 por habitación + 预计到店** | el rellenado pide huéspedes; **no nombre por habitación ni hora de llegada** | modelo + frontend |
| **待付款 con 打车 / 地图 / 联系酒店** | existe la reserva y el taxi; **no el bloque de acciones del estado** | frontend |
| **Iconos de servicio en la tarjeta** (品牌床垫 · 智能客控 · 免费行李) | no existe | modelo |
| **销量 + «40分钟前 最新预订»** | no existe | backend |

### 4.1 Las cinco filas que cuestan poco y valen mucho

1. **Etiqueta de confirmación inmediata** — el dato (`confirmation_hours`) **ya está en la base**. Es una
   etiqueta en la tarjeta. El propio informe de Meituan dice que reduce la ansiedad de espera.
2. **Filtro de facilities sobre `amenities`** — el enum existe, es cerrado y validado. Solo falta exponerlo.
3. **Filtro de estrellas** — `stars` existe.
4. **Política de cancelación por N horas** — **decidido**: `cancellation_hours` (0-720, def. 48) ya existe.
   **Corregido el 27-sep: el rótulo ya está pintado** en tres pantallas y el servidor ya calcula el campo
   (`freeCancellationUntil`). Lo que falta es **backend**, no frontend: el instante usa 14:00 UTC fijo en
   vez del `checkin_from` del hotel (**LH-13**), y fuera de plazo no cambia lo que se devuelve (**LH-01**).
5. **Modo mapa** — MapLibre ya está en uso y las coordenadas ya vienen en `arrival`. *(Se construye después de
   publicar, §7/D2 — pero el coste es el mismo de siempre: bajo.)*

### 4.2 Las dos que exigen modelo nuevo de verdad

1. **Valoraciones.** Hoy la nota es la de la tienda (`shops.rating`). Hacer lo de Meituan es: tabla de
   reseñas, permiso de escritura solo para quien se alojó, agregado por hotel, y **UI de leer y escribir**.
   Es el hueco **con más dependencias detrás**: sin reseñas no hay filtro «4.5+», ni ordenación por
   puntuación, ni etiquetas extraídas. → **Modelo DEFINIDO en §8.1** (`021_hotel_resenas.sql`).
2. **Filtros de tema.** `amenities` es una lista de SERVICIOS. «电竞酒店», «情侣约会», «亲子» son otra
   dimensión. O se añade un campo `themes` con su propio enum, o los filtros de Meituan no se replican.
   **No urge con 0 hoteles reales** (§7/D2).

---

## 5. Lo que NO hay que copiar (ya razonado, se mantiene)

Del `docs/DISENO-UX-MEITUAN-HOTELES.md` §10.3, sin cambios:

- **PMS con 6 estados por habitación física** (limpia/sucia/mantenimiento/bloqueada) — es otro producto.
  Aquí se gestionan **tipos + calendario**, que es lo que necesita un hotel pequeño.
- **钟点房** (habitación por horas) — decisión de negocio local.
- **Documento de identidad obligatorio** — es exigencia regulatoria china; en GQ es una **cuestión legal
  local que hay que confirmar**, no algo que se copie.
- **Compensación tasada por falta de habitación** — implica que **la plataforma asume dinero**.
- **Resumen IA de valoraciones** — necesita miles de reseñas; con 50 basta mostrarlas ordenadas.
- **性价比 con algoritmo** — necesita volumen de precios y puntuaciones por mercado.
- **Los tramos de penalización de cancelación** — **decidido** (§7/D4): «N horas antes» es el modelo. Los
  tramos de Meituan existen porque allí la cancelación es un **producto** con mercado secundario y presión de
  sobreventa; aquí es una **condición del hotel**, y `cancellation_hours` ya la expresa.

Y **el aparato de descubrimiento de Meituan** (9 ordenaciones · 5 niveles de filtro · mapa con 18 pins ·
排行榜) **ya tiene decisión: se construye DESPUÉS de publicar** (§7/D2), cuando haya inventario real. Antes de
publicar solo entra la **búsqueda por filtro y por ubicación del usuario**, que es la petición expresa.

---

## 6. Correcciones a los documentos anteriores (medidas hoy)

| Documento | Decía | Es |
|---|---|---|
| `DISENO-UX-MEITUAN-HOTELES.md` §10.2 hueco 7 | «los endpoints existen pero **no hay pantalla**» | **Caducado.** `habitaciones`, `habitacion`, `calendario` y `perfil` existen (2.014 líneas). El hueco se cerró después del 12-sep |
| `DISENO-UX-MEITUAN-HOTELES.md` §10.2 hueco 1 | «falta la hoja de filtros» | **Cerrado.** Existe y usa `minPrice`/`maxPrice`. Lo que **sigue faltando es la ordenación**, y no es de frontend: el servidor no la admite |
| `DISENO-UX-MEITUAN-HOTELES.md` §10.2 hueco 3 | «falta la etiqueta de confirmación inmediata» | Correcto, **y es más barato de lo que dice**: el dato (`confirmation_hours`) ya está en `room_types` |

---

## 7. Decisiones de Bernardo (26-sep-2026)

Respuestas literales, resumidas, y su consecuencia medida en el código.

| # | Pregunta | Decisión | Consecuencia |
|---|---|---|---|
| **D1** | ¿Orden de trabajos? | **Sin respuesta explícita.** Mi recomendación sigue siendo **A → B → C** | **[PROPUESTA, no acuerdo]** |
| **D2** | ¿Cuántos hoteles hay? | **Cero reales.** «Los hoteles que tenemos son de ejemplo, no son reales, son de prueba, nunca deben ser considerados reales». En **Malabo, Bata y otras ciudades hay muchos** (físicamente), y «después de publicar iremos hotel en hotel para buscar que se unan». **La búsqueda se hará por filtro o por la ubicación donde se encuentre el usuario** | El aparato de descubrimiento de Meituan **se pospone a después de publicar**; antes solo **filtro + ubicación** |
| **D3** | ¿La valoración es de la tienda o del hotel? | **Del hotel** | Desacoplar `shops.rating` + reseñas propias → **modelo definido en §8.1** |
| **D4** | ¿Tramos de cancelación o N horas? | **Por N horas** | **El modelo de tramos NO se construye.** `cancellation_hours` es la fuente → **§8.2**, y queda **solo frontend** |
| **D5** | ¿Y el resto de datos? | «Nada de lo que tenemos construido en la app, como tienda o usuario, es real; simplemente nos sirven de prueba» | Regla de oro del proyecto: **ningún dato de la app es real**; lo prioritario son los **fallos de código**, no los importes |

### 7.1 La lectura peligrosa que hay que bloquear

De D5 se puede deducir «entonces la deuda de dinero da igual». **No.** LH-01 **no es una pérdida de dinero**:
es un **fallo de código que se cobrará el día que haya un hotel real**. Como todo es de prueba, nadie lo nota
hoy — y por eso nadie lo ha arreglado. El primer hotel que se una a la app después de publicar es el que
descubre que **su panel no le ingresa nada**. D5 no rebaja A; **D5 es la razón por la que A sigue abierta
desde hace tiempo sin que se notara.**

Y refuerza **B** por una vía que no estaba prevista: si los ejemplos viven **solo en la base del servidor**
(no hay migración ni seed del hotel en el repo), **no se pueden purgar ni recargar de forma reproducible**.
Publicar con ejemplos dentro exige poder **identificarlos y borrarlos**, y eso hoy no está versionado.

### 7.2 Lo que sigue abierto

1. **El orden de trabajos** (D1): A → B → C, pendiente de su palabra.
2. **[SIN MEDIR]** El barrido `expire-stale`: no hay `@Cron` dentro del backend. De ahí depende la gravedad
   real de LH-07 y LH-08. **Requiere el servidor.**
3. **Cómo se marca un ejemplo**: ¿bandera en la tabla, o disciplina de nombres? No he medido ninguna bandera.
   Es requisito de publicación (D5) y no existe hoy.
4. **Los filtros de TEMA** (§4.2): con 0 hoteles reales **no urgen**; se reevalúan con el inventario delante.
5. ~~¿La valoración es de la tienda o del hotel?~~ → **decidido** (§8.1).
6. ~~¿Tramos de cancelación, o «N horas»?~~ → **decidido** (§8.2).

---

## 8. Las dos decisiones delegadas (26-sep-2026)

Bernardo: «**la valoración te dejo como tu decisión y la política de cancelación**». Decididas las dos, con
el modelo concreto. Marcadas **`[D-K]`** las que son criterio mío de producto y no una restricción técnica:
son las únicas revisables sin tocar código.

### 8.1 Valoración — modelo decidido

**La nota es del HOTEL y se calcula de reseñas propias. `shops.rating` no se toca: es la nota del MERCADO.**
Si un hotel vende además como tienda, tendrá **dos notas distintas y las dos verdaderas** — una por lo que
vende en el mercado, otra por cómo aloja. Mezclarlas es lo que hay que evitar, y es lo que pasa hoy.

**Migración `021_hotel_resenas.sql`** (una tabla, siguiendo la numeración de `backend/sql/`):

| Columna | Tipo | Por qué |
|---|---|---|
| `id` | `uuid pk` | — |
| `shop_id` | `uuid not null` → `lifebook.shops(id)` | el hotel **es** una `shop` (así funcionan los 5 endpoints `shops/:shopId/*`) |
| `reservation_id` | `uuid not null UNIQUE` → `lifebook.reservations(id)` | **una reseña por estancia** — el `UNIQUE` es lo que lo garantiza, no una comprobación |
| `guest_id` | `uuid not null` | autor |
| `rating` | `smallint not null CHECK (rating between 1 and 5)` | 1–5, la escala que la app ya usa (`stars`) |
| `body` | `text` (tope **600**) | 600 es el tope del módulo (`house_rules`, `cancellation_policy`) — no se inventa otro |
| `reply` + `replied_at` | `text` + `timestamptz` | **la respuesta del hotel** |
| `created_at` | `timestamptz not null default now()` | el patrón de todas las hermanas |

**Quién puede escribir, y por qué el permiso no es un `if`:** solo el autor de una reserva **`checked_out`**
suya. El derecho **es** la fila de la reserva: `reservation_id` es el permiso. Un `no_show` **no** da
derecho (no se alojó), y `cancelled` tampoco.

- **El hotelero responde, no borra** `[D-K]`. Su panel ofrece «Responder» y nunca «Eliminar»: si pudiera
  borrar, solo existirían las notas buenas y la nota dejaría de valer.
- **El autor puede borrar dentro de 7 días** `[D-K]`; después solo el administrador. Sin plazo, el hotel
  puede presionar al huésped para que borre.
- **Sin moderación previa.** Publicar no pasa por revisión: el control es la respuesta y el borrado del
  administrador. Un hotel pequeño no tiene con quién moderar.
- **La reseña es única e inmutable en su nota** `[D-K]`: no se edita (para cambiar la nota, se borra y se
  vuelve a escribir dentro del plazo). Editar la nota sin dejar rastro es la forma más fácil de que una
  valoración deje de significar nada.

**El agregado va en columnas ESPEJO de `hotel_profiles`** — `hotel_rating numeric(3,2)` y
`hotel_rating_count int`, recalculadas **en la misma transacción** del alta y del borrado. No es una
preferencia: la lista de resultados pinta una tarjeta por hotel y **no puede agregar por subconsulta en
cada tarjeta**, ni ordenar por una nota calculada al vuelo. Es el mismo patrón que el `stock` del anuncio
(espejo de la suma de sus variantes, comprobado).

> **`[D-K]` No se publica la nota hasta tener 3 reseñas.** Con una sola, un «5,0» no es información: es el
> ruido que ya descartamos en §5 con el 性价比 de Meituan. Por debajo del umbral la ficha **muestra las
> reseñas y dice cuántas hay**, sin cifra. El umbral es un número, no un modelo: se cambia sin migración.

**Desacople, en tres sitios y no en uno:** (1) el mapper que hoy lee `shops.rating` para el hotel, (2) el
filtro «4,5+» y la ordenación por nota cuando se construyan (ya sobre el espejo, no sobre `shops`), y
(3) la ficha, que debe decir **«4,6 · 38 reseñas»** en lugar de heredar el número de una tienda.

### 8.2 Política de cancelación — modelo decidido

**`room_types.cancellation_hours` es la única fuente.** No se construye el modelo de tramos (§7/D4) y **no
hace falta ninguna columna nueva**:

| Valor | Significa | Rótulo que genera el servidor |
|---|---|---|
| `0` | **No reembolsable** | «No reembolsable» |
| `1…719` | **Cancelación gratuita** hasta N h antes de la entrada | «Cancelación gratis hasta 48 h antes» |
| `720` (máx.) | 30 días | «Cancelación gratis hasta 30 días antes» |

**El instante de referencia es la ENTRADA, no la medianoche:** `fecha de entrada + hotel.checkin_from − h`,
y si `checkin_from` viniera nulo, 00:00. Un huésped entiende «hasta 48 h antes de las 14:00 del día de
entrada»; «hasta 48 h antes de ese día» es ambiguo justo cuando importa.

> **CORRECCIÓN MEDIDA (27-sep-2026) — esto NO es «solo frontend», como decía esta sección.**
> El rótulo **ya existe y ya se pinta**, en tres pantallas (`lifebook-hotel-panel.tsx:413`,
> `lifebook-hotel-reserva.tsx:313` y `:378`, `lifebook-hotel-reservas.tsx:408`), y el servidor **ya
> calcula el campo** (`freeCancellationUntil`, en `reservations.service.ts:511` y `hotel.service.ts:852`;
> el tipo del cliente ya lo declara, `api/hotel.ts:237`). Lo que **falta** no es pintarlo:
> 1. **El cálculo ignora el horario real del hotel.** El servidor hace
>    `new Date(fecha + 'T14:00:00Z')` — **14:00 UTC fijo** (16:00 en Malabo, UTC+1) — en vez de usar el
>    `checkin_from` que el propio fichero mapea unas líneas antes. **[NUEVO · LH-13]**
> 2. **El efecto en el dinero no existe:** fuera de plazo el servidor no devuelve distinto. Eso es LH-01.
> 3. Y `canCancel` (el dato que el servidor sí manda) lo **calcula con una regla que contradice §8.2** —
>    ver §9.1.

**La penalización ya existe: es la SEÑAL.** Fuera de plazo se pierde el depósito ya cobrado
(`deposit_percent` sobre el total) y **se devuelve el resto** si lo había pagado. No se inventa una tarifa
de cancelación: introducir otro importe obligaría a modelarlo, a devengarlo y a una segunda ruta en el
monedero — con `LH-01`, `LH-02` y `LH-10` ya abiertos, **sería la cuarta forma de mover el mismo dinero**.

**Y cierra `LH-06` por diseño, no por parche:** con el huésped **dentro** (`checked_in`) **no existe la
acción «cancelar»**. Hoy el contrato la ofrece (`reservation-flow.ts:56`: `checked_in: ['checkout',
'cancel']`) y el resultado medido es «Devuelto» sin devolución. La regla pasa a ser de tiempo y de estado:
antes del check-in cancela el huésped; después, el hotel cierra con `checkout` o `no_show`.

**`confirmation_hours` y `hold_minutes` NO son esto** y no se mezclan (§8.3). Y **`cancellation_policy`
(el texto libre de 600) se queda** como **nota del hotelero**, rotulada aparte («Notas del hotel»), nunca
como si fuera la política: retirarla tiraría texto ya escrito, y computarla dejaría dos verdades.

### 8.3 Los tres relojes de una reserva

Las tres columnas que ya existen miden **cosas distintas**, y confundirlas es la raíz de `LH-07`:

1. **`hold_minutes`** (20 min) — plazo del **huésped** para pagar la señal. Si vence, la retención se
   suelta. No tiene nada que ver con el hotel.
2. **`confirmation_hours`** — plazo del **hotel** para confirmar. **Es la etiqueta de «confirmación
   inmediata»**: `0` significa que confirma al instante.
3. **`cancellation_hours`** (def. 48) — plazo del **huésped** para cancelar gratis, contado **hacia atrás
   desde la entrada**.

`LH-07` es exactamente una confusión de relojes: la señal pagada con monedero caduca en el reloj 1
(20 min) mientras la reserva vive en el reloj 2 (24 h). Al escribir código de este módulo, **decir en qué
reloj se está** resuelve la mitad de los hallazgos de dinero.

### 8.4 Lo que estas dos decisiones cierran

- Del mapa de brecha: **«política con fecha/hora y tramos»** → cerrado como **backend** (corregido el
  27-sep: el rótulo ya existía y el campo ya se calculaba); **«valoraciones: escribir y listar»** → cerrado
  como **modelo**, con la tabla ya definida.
- De §7.2: quedan **el orden de trabajos (D1)**, el barrido `expire-stale` **[SIN MEDIR]**, y **cómo se
  marca un ejemplo** (bandera o disciplina de nombres — sigue sin medirse ninguna bandera).
- Y queda **una migración por escribir** (`021`) más el volcado del esquema del hotel (trabajo B), del que
  `021` es la primera pieza versionada: hoy **ni una** de las cinco tablas del hotel está en el repo.

---

## 9. Trabajo A — acta de la primera tanda (27-sep-2026)

Bernardo: «**sigue la orden que has propuesto**» → autorizado **A → B → C**. Dentro de A, el orden lo
decide la puerta, no la severidad: **LH-01 (la crítica) exige servidor** y el servidor no está accesible
(§9.3). A se parte, por tanto, en dos frentes que **no se mezclan**:

| Frente | Qué entra | Puerta |
|---|---|---|
| **A-cliente** | contrato + pantallas; lo que vive en el repo y se verifica con `tsc` + guardias | **abierta** |
| **A-servidor** | todo lo que mueve el monedero: LH-01, LH-02, LH-04, LH-05, LH-07→LH-10, LH-12 | **bloqueada** (§9.3) |

### 9.1 LH-06: la regla estaba escrita CUATRO veces, y la cuarta es la que manda

Al ir a arreglarlo apareció que **no era un botón mal puesto**: era la misma regla copiada, y ninguna copia
coincidía con la decisión §8.2.

| # | Sitio | Regla | ¿Excluye `checked_in`? |
|---|---|---|---|
| 1 | `packages/contracts/src/reservation-flow.ts:56` | `checked_in: ['checkout','cancel']` | **no** |
| 2 | `app/lifebook-hotel-reservas.tsx:327` | `!['checked_out','cancelled','no_show']` | **no** |
| 3 | `app/lifebook-hotel-reserva.tsx:128` | **idéntica a la 2** (copia literal) | **no** |
| 4 | `reservations.service.ts:479` (servidor) | `viva && ['hold','pending','confirmed','checked_in'] && ventana` | **no** |

**Y el censo por función no las veía.** Buscar `availableActions` devolvía **dos** consumidores (el contrato
y el panel del hotelero); las dos pantallas del huésped **no usaban el contrato**: tenían su propio `if`. Se
localizaron censando por **la acción sobre la API** (`hotelApi.cancel`), no por el ayudante. *Regla: cuando la
regla de negocio se puede escribir a mano, se copia a mano — censar por el efecto, no por la función.*

**Decisión de diseño:** la regla **de estado** vive en el contrato (es estática y compartida); la regla **de
tiempo** vive en el servidor (`canCancel`), porque depende del reloj. Hoy el cliente **no** puede confiar en
`canCancel`, porque la lista del servidor incluye `checked_in`.

### 9.2 Lo que se ha hecho (commit `egapp 0d30e35`, 3 ficheros, +30/−4)

1. `reservation-flow.ts`: `checked_in` pasa de `['checkout','cancel']` a **`['checkout']`**.
2. Las dos pantallas del huésped preguntan a `availableActions()` en vez de a su lista copiada.
3. El porqué queda escrito **dentro del contrato**, incluido lo que **no** cierra.

**Verificación (la tabla completa, no el caso suelto): 7 estados × 3 roles × 2 modos = 21 filas comparadas
contra el respaldo. 3 cambios, y los 3 son `checked_in` perdiendo «cancel»:**

| Estado / rol | Antes | Ahora |
|---|---|---|
| `checked_in` · hotel | `checkout, cancel` | `checkout` |
| `checked_in` · huésped | `cancel` | *(ninguna)* — `checkout` es acción solo del hotel |
| `checked_in` · admin | `checkout, cancel` | `checkout` |

Las **otras 18 filas salen idénticas**: no hay regresión en ningún otro estado ni rol. Puertas: `tsc
--noEmit` limpio · trinquete intacto (`hex 0 · fontSize 0 · borderRadius 0 · fontWeight 0 · borderWidth 5 ·
espaciado 183 · precioFigura 5 · strokeWidth 0`) · rutas sin enlaces rotos.

> **Y esto NO cierra LH-06.** Endurece el cliente: la app deja de ofrecer el botón. El servidor sigue
> aceptando `cancel` desde `checked_in` (fila 4 de la tabla), así que **la mitad que manda queda abierta**.
> Se declara así a propósito, para que nadie lo dé por cerrado.

### 9.3 La puerta al servidor: se abrió, y la copia del 17-sep queda VERIFICADA

Al principio de la sesión el servidor no respondía:

```
ssh root@8.218.88.237  →  Connection timed out during banner exchange
```

El **TCP conecta** (llega al intercambio de banner) y el handshake no se completa; con el aislamiento del
entorno quitado pasa lo mismo → es el **veto del servidor** (`fail2ban`), no el sandbox. **No se reintenta en
ráfaga: cada intento lo alarga.**

**Bernardo eligió reintentar más tarde, y a los ~40 minutos la puerta se abrió.** El recon (solo lectura) trajo
lo que faltaba, y **retira el `[SIN MEDIR]` más importante del documento**:

| Fichero (`/opt/mirror/app/src/lifebook/`) | bytes | mtime en el servidor | huella local vs servidor |
|---|---|---|---|
| `hotel.service.ts` | 66.676 | 2026-09-17 14:53:31 | `3c38d2a1…` = `3c38d2a1…` ✓ |
| `hotel.controller.ts` | 11.887 | 2026-09-17 14:53:31 | `9c812ca3…` = `9c812ca3…` ✓ |
| `hotel-merchant.service.ts` | 27.086 | 2026-09-12 03:16:55 | `77523f2b…` = `77523f2b…` ✓ |
| `hotel-merchant.controller.ts` | 6.197 | 2026-09-12 03:16:55 | `fee2272a…` = `fee2272a…` ✓ |
| `reservations.service.ts` | 48.746 | 2026-09-17 16:59:19 | `989f5c0b…` = `989f5c0b…` ✓ |

**La copia congelada ES el código desplegado: 5 de 5 huellas idénticas, y los `mtime` al segundo.**

Consecuencias, las tres:
1. **La auditoría es válida** — los 13 hallazgos se midieron sobre el código que de verdad corre.
2. **Se puede editar en local y desplegar con confianza**: la base de partida está probada.
3. **[RETIRADO] «hay arreglos posteriores al 17-sep».** Se dedujo del comentario de
   `reservations.service.ts:399`; el fichero desplegado **es** el del 17-sep 16:59, así que ese comentario
   ya estaba dentro. También se confirma que **el `canCancel` desplegado es el que incluye `checked_in`**.
4. Y `dist/src/lifebook/*.js` está compilado el **23-sep 19:12** — **no contradice nada**: con
   `rootDir: "."`, un `tsc` de cualquier módulo recompila el árbol entero. Lo que manda es el `.ts`.

**Lo que sigue sin medir:** el barrido `expire-stale` (no hay `@Cron` en el backend) y **cómo se marca un
ejemplo** — ninguna de las dos bloquea A.

> **Lo que esto NO cambia:** el trabajo **B sigue siendo requisito de publicación**, pero ya no por «no poder
> auditar» — la auditoría vale. Sigue siendo por **versionar** (hoy las 5 tablas existen **solo** en la base
> del servidor) y por **poder purgar los ejemplos**.

### 9.4 A-servidor: el inventario de lo que hay que tocar, ya localizado

| # | Sev. | Fichero (copia del 17-sep) | Qué hay que cambiar |
|---|---|---|---|
| LH-01 | **Crítica** | `hotel-merchant.service.ts` | las transiciones del panel deben emitir `ESCROW_RELEASE` / `ESCROW_REFUND`, igual que ya hace `lifebook-hotel-reservas.tsx` |
| LH-06 | Alta | `reservations.service.ts:479` | quitar `checked_in` de la lista de `canCancel` |
| LH-13 | **nueva** | `reservations.service.ts:511` | el instante: `T14:00:00Z` fijo → `checkin_from` del hotel |
| LH-05 | Alta | método «Monedero» | inalcanzable: toda reserva con él responde 400 |
| LH-02 | Alta | `hotel-merchant.service.ts` | «Confirmar reserva» sin cobrar la señal deja la reserva sin salida |
| LH-07 | Media | el reloj de `hold_minutes` | la señal con monedero caduca a los 20 min aunque el hotel dé 24 h |
| LH-10 | Media | el `ESCROW_RELEASE` | si falla la liberación, no hay reintento ni cola |
| **LH-04** | Alta | `quote()` (servidor) | **cobra `max(precio por noche) × noches`** en vez de la suma. El cliente lo reproduce **a propósito** (`reservar.tsx:197-200`, con el comentario «el servidor usa el mayor (snapshot prudente)») y la ficha **suma** (`detalle.tsx:135`) → **el huésped ve dos totales distintos y se le cobra el mayor**. **No se puede arreglar en el cliente:** alinear la ficha al máximo propagaría un cobro que no corresponde, y alinearla a la suma dejaría al huésped viendo 110.000 mientras se le cobran 150.000 **sin aviso** |

**Y una cosa que §3 decía y §9.3 ha corregido:** la copia del 17-sep **está verificada contra el servidor**
(5 de 5 huellas), así que **A-servidor ya no tiene el obstáculo de «trabajar a ciegas»**: se puede editar en
local, compilar y desplegar con la base de partida probada. El único obstáculo que queda es el `fail2ban`:
**la puerta se abre y se cierra**, así que el despliegue hay que pedirlo como una **ventana**, no intentarlo
como parte de una tanda larga. El volcado del esquema (**B**) sigue pendiente y es lo que habilita
**versionar y purgar**.

### 9.5 Segunda tanda del cliente — `A-2` (`LH-11`), commit `egapp 56699d6`

Bernardo eligió seguir por A-cliente mientras el servidor esté cerrado. `LH-04` se descartó al medirlo (§9.4:
es del servidor y hacerlo en el cliente lo empeora), así que la tanda es `LH-11`.

**El defecto estaba contado tres veces, y una decisión de dinero dos.** El mismo patrón que `LH-06`: una
regla de negocio escrita a mano donde cabía.

| # | Sitio | Qué decía |
|---|---|---|
| 1 | `RESERVATION_STATUS_LABELS` (contrato) | `pending` = «Señal pagada · por confirmar» **siempre** |
| 2 | `RESERVA_ETIQUETA` (`api/hotel.ts`) | un **segundo** mapa, con textos distintos para los mismos estados («Dentro» vs «Huésped dentro», «Salida hecha» vs «Finalizada») |
| 3 | `PASOS` (`lifebook-hotel-reserva.tsx`) | la línea de tiempo decía «Señal pagada» **sin condición** |

Y la pregunta «¿está cobrada la señal?»:

| Sitio | Fórmula | `paid` → |
|---|---|---|
| `panel.tsx:356` | `['deposit_paid','paid'].includes(...)` | cobrada |
| `reservas.tsx:327` | `!== 'deposit_paid'` | **sin cobrar** → una reserva **pagada del todo** le salía «sin cobrar» al huésped |

**Arreglo:** `senalCobrada(paymentStatus)` y `estadoRotulo(status, {senalCobrada})` como **puertas únicas** en
el contrato; `pending` pasa a «Por confirmar» —el hecho que se sabe siempre— y el matiz de dinero se afirma
**solo cuando consta**; `RESERVA_ETIQUETA` **retirado**; las tres pantallas usan el contrato; y `PASOS` deja
de afirmar la señal.

**Verificación:** rótulo estado por estado, antes contra después → **1 de 7 cambia** (`pending`) y los otros
6 salen idénticos; `senalCobrada` sobre los 6 estados de pago → solo **`paid`** discrepaba entre las dos
fórmulas antiguas, ahora las dos dan «cobrada». Puertas: `tsc` limpio · trinquete intacto · rutas en orden ·
los 5 ficheros sin mezcla de terminadores.

> **Cambio visible declarado:** en la lista de reservas, `checked_in` pasa de «Dentro» a **«Huésped dentro»**
> y `checked_out` de «Salida hecha» a **«Finalizada»** — se adopta el texto del contrato, que es la fuente.

### 9.6 Lo que sigue en A-cliente

`LH-03` (guardar precio o estancia mínima **reabre los días cerrados** del calendario) es el siguiente
candidato del lado cliente: su pantalla es `lifebook-hotel-calendario.tsx` y el defecto se ve **en el
formulario que escribe** — habría que medir si el daño está en el envío o en el `UPDATE` del servidor antes
de tocarlo. Y `LH-12` (los DTO no se aplican en el panel: un `images` malformado borra las fotos) es de
servidor, pero su parte de cliente —**no mandar un `images` malformado**— sí se puede cerrar aquí.
