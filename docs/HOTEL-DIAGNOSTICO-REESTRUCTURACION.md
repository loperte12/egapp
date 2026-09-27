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
| **LH-01** | **Crítica** | **El panel del hotelero no mueve el monedero.** Registra entrada/cancelación por `hotel-merchant.service` sin `ESCROW_RELEASE`/`ESCROW_REFUND`: **el hotel nunca cobra y el huésped nunca recupera**. Y la MISMA estancia se comporta distinto según la pantalla (`lifebook-hotel-reservas.tsx` sí devuelve; el panel no). **CERRADA en servidor** el 27-sep (§10): las dos puertas liquidan por el mismo sitio. |
| LH-02 | Alta | «Confirmar reserva» sin cobrar la señal deja la reserva atascada sin salida |
| LH-03 | Alta | Guardar precio o estancia mínima **REABRE los días cerrados** del calendario |
| LH-04 | Alta | El precio cambia según la pantalla y el cobro usa la noche **MÁS CARA** |
| LH-05 | Alta | El método «Monedero» es **inalcanzable** desde la app: toda reserva con él responde 400 |
| LH-06 | Alta | Se puede **cancelar DESPUÉS del check-in**: «Devuelto» sin devolución y habitación liberada con el huésped dentro. **La regla estaba escrita CUATRO veces, y la que mandaba no era la del contrato** (§9.1). **HECHA entera**: cliente (`egapp 0d30e35`) y servidor (§10), donde las cuatro copias pasan a una sola lista `CANCELABLES` |
| LH-07 | Media | La señal pagada con monedero caduca en `hold_minutes` (20 min) aunque el hotel tenga 24 h |
| LH-08 | Media | Una reserva `pending` con retención vencida ocupa inventario y sigue «viva» para siempre |
| LH-09 | Media | Reintentar con la misma `Idempotency-Key` reaprovecha un cerrojo **ya devuelto**: el hotel no cobra |
| LH-10 | Media | Si la liberación al hotel falla, no hay reintento ni cola: la señal se queda en garantía |
| LH-11 | Baja | `pending` significa dos cosas y la app lo rotula «Señal pagada · por confirmar» aunque no haya señal |
| LH-12 | Baja | Los DTO no se aplican en el panel: un `images` malformado **borra las fotos** |

**Y dos más que nacieron DESPUÉS, al medir** (no estaban en el censo de 12): **`LH-13`** — el corte de la
cancelación gratuita con la hora incrustada a `14:00` y en UTC (§9.5 → cerrada en §10) — y **`LH-14`** — el
rótulo de cancelación gratuita nunca aparecía en las listas porque las consultas no traían sus columnas
(§10.5 → cerrada en §10).

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

**Migración `026_hotel_resenas.sql`** (una tabla, siguiendo la numeración de `backend/sql/`):

> **CORRECCIÓN de numeración (27-sep):** esta sección decía `021_hotel_resenas.sql`, y `021` **ya está
> tomado** por `021_ecomerse_variantes.sql` (el repo llega hasta `025_ecomerse_store_follows.sql`).
> El hueco real es **`026`**. Se corrige aquí y en §8.4; el número no era una decisión, era un choque.

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
- Y queda **una migración por escribir** (`026_hotel_resenas.sql`; §8.1 la numeró `021` y `021` ya estaba
  tomado por el ecomerse) más el volcado del esquema del hotel (trabajo B) — **hecho desde `B-2`**: el
  esquema está versionado en `backend/sql/esquema/lifebook-hotel-20260927.sql`, y `B-7` comprobó que no
  se ha movido (huella normalizada `415fb5d2…`, §13.5).

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

---

## 10. Trabajo A en el SERVIDOR — acta de `A-3` (27-sep-2026)

La ventana se abrió (07:02 del servidor) y se usó. Tres hallazgos cerrados, uno nuevo que apareció al
hacerlos y también cerrado, y **un cambio de fondo que no estaba en el plan**: el código del hotel entra en
el repositorio. A partir de aquí, lo de A-servidor es código revisable y no un parche sobre una foto.

### 10.1 Qué se desplegó

| Fichero (`/opt/mirror/app/src/lifebook/`) | Antes (17-sep) | Después | Qué cambió |
|---|---|---|---|
| `hotel.service.ts` | `3c38d2a1…` | `a85382a5…` | `freeCancellationUntil()` pública que usa `checkin_from`; el `shape` la llama |
| `reservations.service.ts` | `989f5c0b…` | `3b240dc4…` | `CANCELABLES`; `canCancel` y `permitido.cancel`; `liquidarMonedero` público; 5 consultas completadas |
| `hotel-merchant.service.ts` | `77523f2b…` | `22e81890…` | `DESDE.cancel` importa la lista; **llama a `liquidarMonedero`**; 2 consultas completadas |

Las tres huellas «antes» son **exactamente** las que el recon del 27-sep midió en el servidor (§9.3): prueba
de que el servidor seguía siendo la copia del 17-sep cuando se escribió encima. Sello de respaldo:
`20260927-070244` — con él se vuelve atrás fichero a fichero.

### 10.2 Primero, el código al repositorio (`egapp 552d9c6`)

El módulo del hotel **no estaba versionado**: vivía en el servidor y en la copia congelada, que está ignorada
por git. Sin ese paso el parche no tenía diff ni vuelta atrás. Se bajaron los tres ficheros tocados a
`backend/server-src/lifebook/` **en un commit que no cambia una línea**, así que `git show 2b77ffd` es el
parche entero, revisable.

> Son 3 de los 9 ficheros del módulo. Los otros seis siguen sin versionar: **eso es B, y no se da por hecho.**

### 10.3 `.gitattributes` (`egapp 5b8800e`) — la huella que git rompía sola

Al commitear el baseline, git avisó: *«LF will be replaced by CRLF the next time Git touches it»*. Con
`core.autocrlf=true` y sin `.gitattributes`, el siguiente checkout habría dejado los tres ficheros en CRLF —
y entonces **la huella deja de cuadrar y el generador de despliegue aborta**. Es una pérdida silenciosa: no
falla nada, simplemente lo que se revisa deja de ser lo que se despliega.

Se añade `backend/server-src/** -text` (**solo esa ruta**: en el resto del árbol los terminadores se mezclan
a propósito y normalizarlos sería un diff de miles de líneas). Verificado, no declarado: se borra el fichero,
se hace `git checkout --` y la huella vuelve **idéntica**.

### 10.4 El parche (`egapp 2b77ffd`)

**Las cuatro listas de cancelación pasan a una.** `CANCELABLES = ['hold','pending','confirmed']` nace en
`reservations.service`, `permitido.cancel` y `canCancel` la leen, y **el panel la importa** en vez de copiarla.
Y —esto es lo que importaba— **la que mandaba no era la del contrato**: el cliente ofrecía lo que el servidor
permitía. Ahora, con el huésped dentro (`checked_in`) la acción «cancelar» no existe **ni se permite**.

**`liquidarMonedero(reservationId, accion)`, público, y las dos puertas lo llaman.** La app (`action`) y el
panel (`updateReservationStatus`) liquidan por el mismo sitio, fuera de la transacción del estado, como ya
hacían el mercado, la comida y ciudad-a-ciudad. `releaseCommerceOrder`/`refundCommerceOrder` son idempotentes
por `idempotencyKey` (`lb-release:` / `lb-refund:`), así que pasar por las dos puertas no cobra dos veces.

**`LH-13` — el corte es el del hotel.** Una sola definición, en `hotel.service`, con
`hotel_profiles.checkin_from` y desfase **`+01:00`**. Los dos errores que se sumaban: `14:00` fijo aunque el
hotel declare otra hora, y `Z` (UTC) cuando Malabo es UTC+1 → **el corte caía a las 15:00 locales**. La hora
decide si una cancelación entra gratis o se come la señal.

### 10.5 `LH-14` (nueva, y cerrada en la misma tanda)

Medido al hacer `LH-13`: la app **sí** pinta «Cancelación gratuita hasta el X» en las listas
(`reservas.tsx:413`, `panel.tsx:413`), pero **las consultas de esas listas no pedían `cancellation_hours` ni
`checkin_from`** → el campo salía `null` y el rótulo **no aparecía nunca**. Solo se veía en el detalle, que sí
las traía. Se completan las 5 consultas de `reservations.service` (lista del huésped, lista del hotel y las 3
del cuaderno del día) y las 2 del panel. **Se arregla de paso algo que nunca funcionó**, no solo lo que se
rompió.

### 10.6 `LH-01`: el daño medido hoy es **CERO**, y por qué eso no lo hace menor

Medido antes de tocar nada, con el monedero del hotel (2 reservas con señal pagada por monedero):

| debería estar cobrada | sin liberar | canceladas | sin devolver |
|---|---|---|---|
| 1 | **0** | 1 | **0** |

Es decir: **hoy no hay ni un franco varado**. Las dos pasaron por la app —que sí liquidaba—, no por el panel.
El fallo es **latente**: el mecanismo está roto y no se ha ejercitado porque nadie ha marcado una entrada
desde el panel con una reserva de monedero. Lo que esto corrige no es una pérdida, es **el día que se
ejercite**: el panel es precisamente la pantalla que usará el hotelero.

> Y el corolario incómodo, que ya estaba en §7.1: **no haberlo notado es la consecuencia de que todo sea de
> prueba, no la prueba de que importe menos.** El primer hotel real que use el monedero desde el panel habría
> visto «entrada registrada» y ningún dinero.

### 10.7 La cadena de verificación: seis puertas

| # | Puerta | Qué demostró |
|---|---|---|
| 1 | **Guion verificado sin servidor** (`as-verifica-despliegue.py`) | los 3 bloques base64 decodifican y sus huellas coinciden: **0 sin cuadrar**, `crlf=0` |
| 2 | **Puerta local** (`_a3-verifica-local.cjs`) | los 3 ficheros **parsean** y 21 comprobaciones contadas: el parche es el que se decidió |
| 3 | **Preflight en el servidor** (solo lectura) | las 13 columnas existen; **el JOIN nuevo ejecutado de verdad** devolvió filas reales; y la medida del daño de `LH-01` |
| 4 | **`tsc` en el servidor** | **`tsc OK`** — la puerta semántica; si falla, restaura los `.bak` y **no reinicia** |
| 5 | **Las 9 consultas EJECUTADAS** | extraídas del fichero desplegado (no transcritas) y corridas contra la base: **`rc=0`, cero errores** |
| 6 | **Rutas reales** | `/search` y `/hotels` → **200**; `/reservations/mine`, `/my/day-book`, `/my/hotel/reservations`, `/my/hotel/dashboard`, `/my/room-types` → **401** (existen y piden sesión). Ningún 404, ningún 500 |

`pm2`: **online**, `unstable restarts 0`. La 5.ª es la que importa: **`tsc` demuestra que el TypeScript
compila, no que el SQL sea válido** — un nombre de columna mal escrito dentro de un `$queryRaw` no lo ve nadie
hasta que la pantalla devuelve 500 en caliente.

### 10.8 El comentario que citaba un método que no existe (`egapp 5d70f2e`)

En el comentario de `liquidarMonedero` escribí «la app (`setStatus`)». El método se llama **`action`**. Se
corrige **en el fichero y en el servidor** (segundo despliegue, un fichero, `tsc OK`, `unstable restarts 0`).
Un comentario que nombra un método inexistente es una mentira dentro del artefacto: el siguiente que busque
`setStatus` no lo encuentra y deja de fiarse del comentario. Los demás métodos citados se comprobaron uno a
uno contra el código.

### 10.9 Dos trampas nuevas

1. **Un backtick dentro de un comentario SQL de un `$queryRaw` cierra el template literal.** Escribí
   `` -- Faltaba: `cancellation_hours` … `` dentro de la consulta y el fichero **dejó de parsear**
   (`':' expected`). Lo cazó la puerta local, **no `tsc`** — porque `tsc` en el servidor habría fallado
   *después* de subir el fichero. Los backticks se retiraron de los 5 comentarios afectados.
2. **Los comentarios `--` dentro de `$queryRaw` son seguros** (ya se usaban: «Lo urgente primero…»). El
   problema no es el comentario, es el backtick.

### 10.10 Estado de los hallazgos tras `A-3`

| # | Sev. | Estado |
|---|---|---|
| `LH-01` | Crítica | **CERRADA** (servidor) |
| `LH-02` | Alta | abierta — servidor |
| `LH-03` | Alta | abierta — cliente (`lifebook-hotel-calendario.tsx`), §9.6 |
| `LH-04` | Alta | abierta y **es del servidor**: el cliente reproduce a propósito el `Math.max` del `quote()` (§9.4) |
| `LH-05` | Alta | abierta — servidor (el método «Monedero» inalcanzable: 400) |
| `LH-06` | Alta | **CERRADA** (cliente + servidor) |
| `LH-07` | Media | abierta — servidor (el reloj de `hold_minutes`) |
| `LH-08` | Media | abierta — servidor |
| `LH-09` | Media | abierta — servidor |
| `LH-10` | Media | abierta **y ahora más visible**: `liquidarMonedero` deja un `warn` si falla, sin reintento ni cola |
| `LH-11` | Baja | **CERRADA** (`egapp 56699d6`) |
| `LH-12` | Baja | abierta — servidor (DTO del panel) |
| `LH-13` | **nueva** | **CERRADA** |
| `LH-14` | **nueva** | **CERRADA** |

### 10.11 Una consecuencia que hay que decir en voz alta

Al quitar `cancel` de `checked_in`, **una salida anticipada con acuerdo de devolución se queda sin camino**:
la única salida con el huésped dentro es `checkout` (acción del hotel, sin devolución). Es lo decidido en
§8.2 y es más honesto que lo que había —que **prometía** la devolución y no la hacía—, pero conviene saber
que el camino no existe: si algún día hace falta, es una función nueva («salida anticipada»), no un
`cancel` que vuelva por la puerta de atrás.

**Lo que queda de A-servidor:** `LH-02`, `LH-05`, `LH-07`→`LH-10` y `LH-12`, todos ya localizados por
fichero. Y **B**: el esquema de las 5 tablas sigue sin versionar, y es lo que habilita versionar y purgar los
ejemplos. La puerta del servidor **se abre y se cierra**: cada uno de estos es una ventana.

## 11. Trabajo A en el SERVIDOR — acta de `A-4` (27-sep-2026)

Los siete hallazgos que quedaban de A-servidor, en la misma ventana de la mañana. `A-4` no añade pantallas:
**cambia cuándo y por qué se mueve el dinero**, y quita de encima al hotelero las reservas zombis.

### 11.1 Qué se desplegó

| Fichero (`/opt/mirror/app/src/lifebook/`) | Antes (`A-3`) | Después (`A-4`) | Qué cambió |
|---|---|---|---|
| `hotel.service.ts` | `a85382a5…` | `5b929c07…` | `plazoVencido()` y `ocupaInventario()` públicas; `ESTADOS_QUE_OCUPAN`; 2 consultas de ocupación; `images()` rechaza lo que no es lista; `ORDER BY method` |
| `reservations.service.ts` | `3b240dc4…` | `a601d0fa…` | los tres relojes; la guarda de `confirm`; el `nonce` del cerrojo; `@Cron` del barrido; la marca `paid_at`; `reconciliarMonedero()` |
| `hotel-merchant.service.ts` | `22e81890…` | `826c91c5…` | importa la lista y la regla en vez de copiarlas; la guarda de `confirm` en el panel; el `warn` con nombre |

Sello de respaldo: **`20260927-080224`**. Las tres huellas «antes» son **exactamente** las que dejó `A-3`
(§10.1) — y eso no se supone: el propio guion lo comprueba en su paso 0 y **aborta sin escribir** si no es así.

### 11.2 La decisión que atraviesa toda la tanda: **no se inventan estados**

El esquema **no está versionado** y sus `CHECK` no se pueden leer desde aquí, así que añadir `expired` o
`release_pending` a una columna ya desplegada es una apuesta a ciegas: si el `CHECK` no los admite, el
`UPDATE` falla **en caliente**. Se re-semantizan columnas que ya existen:

- **`hold_expires_at`** = «cuándo vence lo que se está esperando». El `INSERT` la pone a `NULL::timestamptz` y
  una `UPDATE` inmediata en la misma transacción la rellena.
- **`paid_at`** = «el hotel ya cobró». Ya existía, la ficha del hotel ya la exponía como `paidAt`, y la
  entrada (`checked_in`) ya la escribía. Es la marca que `LH-10` necesitaba y no había que crear nada.

El preflight midió que las **15 columnas** que el parche escribe y lee existen (**0 faltan**), y que
**ninguna es nueva**: `cancel_reason`, `cancelled_at`, `paid_at` y `deposit_paid_at` ya las escribía el código
desplegado. El riesgo, por tanto, no viene de la forma de la tabla.

### 11.3 `LH-07` — se esperaba con el reloj equivocado

El vencimiento se calculaba **siempre** con `hold_minutes` (20 min por defecto). Pero hay **tres relojes** y
no son intercambiables (§7): `hold_minutes` es lo que tarda el **huésped** en pagar la señal;
`confirmation_hours` es lo que tarda el **hotel** en confirmar; `cancellation_hours` es hasta cuándo se
cancela gratis.

Con el monedero **no se espera dinero del huésped**: el dinero ya está retenido y lo que se espera es al
hotel. Usar el reloj del huésped daba **20 minutos para que el hotel confirmara**, y al vencer el barrido
liberaba una reserva que el hotel todavía estaba mirando. Ahora el plazo se elige por **lo que de verdad
falta**: `confirmation_hours` cuando paga el monedero, `hold_minutes` (o `TRANSFER_HOLD_HOURS`) cuando falta
dinero.

### 11.4 `LH-08` — la regla estaba escrita **once** veces, y media docena mal

«Qué ocupa inventario» estaba escrito **6 veces en SQL y 5 en JavaScript**, y **media docena de las copias
solo miraba el estado**: `status IN ('hold','pending')`, sin mirar si el plazo ya había vencido. Efecto: una
retención caducada **seguía ocupando la habitación para siempre** — nada la barría y nadie la miraba.

- Nace `plazoVencido(status, holdExpiresAt)` y, sobre ella, `ocupaInventario(...)`, con `ESTADOS_QUE_OCUPAN`
  como **lista única**. Se borra la lista local que cada servicio tenía.
- Las consultas de ocupación (2 en `hotel.service`, 2 en `reservations.service` y 1 en el panel) pasan a
  `status NOT IN ('hold','pending') OR hold_expires_at IS NULL OR hold_expires_at > now()`.
- **Y se barre solo**: `@Cron('*/15 * * * *')`, con `try/catch` — un barrido que revienta no puede tumbar el
  proceso. `@nestjs/schedule` ya era dependencia y `ScheduleModule.forRoot()` ya estaba registrado: el
  preflight lo comprobó **antes** de escribir (está en `node_modules` y en el compilado).

`expireStale` deja además de filtrar por `payment_status`: ese filtro dejaba fuera **justo un caso** —la
reserva por transferencia con la señal ya cobrada y el hotel sin confirmar— que no barría nadie y, con la
regla nueva, tampoco ocupaba. Quedaba en el limbo: invisible, sin poder confirmarse y sin cancelar. Y su
motivo distingue **qué** se esperaba: «Sin pagar la señal a tiempo» o «El hotel no confirmó dentro de su
plazo».

**El daño medido antes de tocar nada** (`hold`/`pending` con el plazo vencido):

| reserva | estado | pago | método | señal | venció |
|---|---|---|---|---|---|
| `LBH-260913-0005` | `hold` | `pending` | transferencia | 7.800 XAF | **12 días 17 h antes** |
| `LBH-260917-0005` | `hold` | `pending` | transferencia | 11.100 XAF | 18-sep |

Dos habitaciones bloqueadas por transferencias que nunca llegaron —una desde el 14-sep—: exactamente lo que
el barrido venía a limpiar.

### 11.5 `LH-02` y `LH-09`

**`LH-02`**: `confirm` pasaba de `hold` a `confirmed` **sin mirar el dinero**. Si el hotel confirmaba sin que
la señal estuviera pagada, la reserva quedaba en firme con `deposit_xaf` por cobrar y sin nada que la
retuviera: la habitación bloqueada gratis y el hotel viendo «Confirmada» sin haber cobrado. Ahora `confirm`
exige `payment_status IN ('deposit_paid','paid')` cuando la señal es mayor que cero, y **en las dos
puertas** — la app (`action`) y el panel (`updateReservationStatus`, más `confirmDepositForShop`). El daño
hoy: **11 confirmadas con señal, 0 sin cobrar** → es un agujero **latente**, no una pérdida.

**`LH-09`**: la clave del cerrojo era `lb-hotel:<clave>`. `lockForCommerceOrder` **devuelve el cerrojo
antiguo** en un reintento —correcto, para no cobrar dos veces— pero si ese cerrojo **ya se había liberado o
devuelto**, el reintento con la misma clave del cliente recibía un cerrojo **muerto**. Ahora la clave lleva
un nonce por intento: `lb-hotel:<clave>:<nonce>`. Antes de tocarlo se comprobó que `lb-hotel:` es **interno**:
ni el servidor, ni la app, ni el móvil leen su valor.

### 11.6 `LH-10` — una liberación fallida ya no se pierde

Antes: si `releaseCommerceOrder` fallaba, quedaba **una línea de `warn`** en un log que se rota. Ni marca ni
reintento, y el dinero del huésped en garantía para siempre. Ahora:

- al liberar **bien** se escribe `paid_at = COALESCE(paid_at, now())` — la marca de «liquidada»;
- el `catch` pasa a **`LIQUIDACION_PENDIENTE …`**, greppable, en los dos servicios;
- nace `reconciliarMonedero(limit = 25)`, **público**, que relee las dos formas de quedar colgado —
  `paid_at IS NULL AND status IN ('checked_in','no_show')` y
  `status IN ('cancelled','expired') AND payment_status IN ('deposit_paid','refunded')`— acotado a
  `updated_at > now() - interval '48 hours'`. Lo llama el propio barrido, y es **idempotente** por
  `idempotencyKey`: reintentar no mueve un franco de más.

Medido en el servidor: **1 estancia `checked_in` con `paid_at` vacío** (`LBH-260917-0003`, señal 1.000 XAF,
con `lock=1` y `liberado=1`): el dinero **sí** se liberó, lo que faltaba era la marca. Es justo la reserva
que la reconciliación recupera sin mover dinero.

**No cubre la causa raíz** — el `ensureProvisioned` del monedero del vendedor vive en `wallet.service` /
`kyc-gate.service`, compartidos y fuera de esta tanda—: queda anotado, no cerrado.

### 11.7 Las dos mitades que **no** entraban: `LH-12` y `LH-05`

- **`LH-12`**: `images()` hacía `Array.isArray(v) ? v : []` → un cuerpo mal formado se leía como «lista
  vacía», o sea **«borra las fotos»**, en silencio. Ahora lo que no es lista se **rechaza**
  (`IMAGE_INVALID`) y **ausente sigue significando «no se toca»**. La otra mitad (los DTO del `controller`)
  **no entra**: `hotel.controller.ts` no está versionado en el repo.
- **`LH-05`**: la consulta de métodos del tipo de habitación no llevaba `ORDER BY`, así que **el método que
  la app preselecciona lo decidía el plan de ejecución** — y podía salir «Monedero» ya marcado, que es justo
  el que la app todavía no sabe completar. `ORDER BY method` lo hace reproducible (las 3 consultas de
  métodos ordenan ya; en `A-3` eran 2). La otra mitad —que la app mande `X-Payment-Token`— es del cliente;
  el servidor **ya lo acepta**, así que el orden servidor-primero / app-después se sostiene.

Y un dato que cierra la duda de `LH-05` por el lado del **dato**, no del código: el método «monedero» está
**`active` en 3 tiendas** (incluidos `Hotel Demo Malabo` y `Tienda Hotel 079171`). El hotel **sí** lo ofrece;
lo que falta es el cliente.

### 11.8 La medición que estaba pendiente desde `A-3`: **la escritura SÍ sobrevive**

`LH-07` y `LH-08` solo sirven de algo si `hold_expires_at` llega a escribirse. El `INSERT` la pone a
`NULL::timestamptz` y una `UPDATE` inmediata la rellena; si el servidor tuviera un build anterior a esa
`UPDATE`, **todas** las retenciones nacerían sin plazo y los dos hallazgos serían **latentes**, no arreglados.

Medido: **2 retenciones, 2 con plazo, 0 sin plazo** — y las dos ya vencidas. La escritura sobrevive, el
barrido tiene por dónde barrer, y **el daño es real y visible** (§11.4), no teórico.

### 11.9 La cadena de verificación

| # | Puerta | Qué demostró |
|---|---|---|
| 1 | **Auditoría del paquete SIN conectarse** (`_a4-audita-local.sh` + `_a4-audita-local.cjs`) | `bash -n` de las 6 piezas; **0 bytes CR**; los 3 bloques base64 decodifican **a la huella que el guion afirma** y al fichero del repo; la guarda de partida lleva las 3 huellas de `A-3`; **los 17 «esperado» re-medidos** contra el fichero; 2 `UPDATE` y `BEGIN/ROLLBACK`; ni un `rm` |
| 2 | **Guarda de partida en el servidor** | los 3 ficheros eran **el `A-3` desplegado** (3 de 3) |
| 3 | **Preflight (lectura)** | 15 columnas, **0 faltan**; la medida del daño de `LH-08`, `LH-02` y `LH-10`; el cron tiene su dependencia; el método «monedero» está `active` en 3 tiendas |
| 4 | **`tsc` en el servidor** | **`tsc OK`** — si falla, restaura los `.bak` y **no reinicia** |
| 5 | **Huellas desplegadas** | las 3 **exactamente** las del `A-4`, y `dist/src/` recompilado |
| 6 | **Las 13 consultas EJECUTADAS** | extraídas del fichero desplegado (no transcritas), con los parámetros por literales, dentro de `BEGIN`/`ROLLBACK`: **13 de 13, 0 errores** |
| 7 | **Las rutas reales** | `/hotels` y `/search` → **200**; `/reservations/mine`, `/my/hotel`, `/my/day-book` → **401** (existen y piden sesión). Ningún 500 |

`pm2`: **online**, `uptime 2m`, `unstable restarts 0` — el `@Cron` nuevo no rompe el arranque. Y en el log
de errores solo hay entradas **viejas** (22–23 sep), ninguna de hoy.

### 11.10 Tropezones y trampas nuevas

1. **Un nombre de variable con guion no es una asignación: es un comando.** El guion guardaba la huella de
   partida en `hotel-merchant_service_ts_AHORA=…` (derivado del nombre del fichero). Bash responde `command
   not found` y dos líneas después `set -u` mata el guion con `unbound variable`. **`bash -n` lo daba por
   bueno**: para el parser es una orden bien formada. Se cambió a `A4_ANTES_1/2/3` y la auditoría local
   ahora **exige que toda asignación sea un identificador válido**.
   Lo que salvó la ventana: **la guarda iba antes de la primera escritura**, así que abortó sin tocar un
   byte. Costó **un intento**, no un despliegue a medias.
2. **`\`` dentro de comillas simples no es un backtick: es backslash + backtick.** Un `grep -cF 'ORDER BY
   method\`;'` buscaba un backslash que no existe y devolvió **0** — que se lee como «el código desplegado no
   tiene el arreglo». La comprobación (la 3.ª de este acto, la única con el correcto) dio **3 de 3**. La
   auditoría ahora prohíbe el patrón: un **0 falso** en una afirmación es un fallo del verificador, no del
   código.
3. **Una tabla de otro esquema falla en caliente.** El preflight consultaba `mobility.shops`, que **no
   existe** (`relation "mobility.shops" does not exist`): las tiendas viven en **`lifebook.shops`**. No rompía
   nada —el preflight solo lee— pero el dato salía por la mitad. La auditoría ahora avisa de las tablas del
   preflight que el módulo **no** usa.
4. **Las rutas de la API llevan prefijo, y el prefijo no es el que parece.** El controlador es
   `@Controller('v1/lifebook/commerce/hotel')` y nginx lo sirve bajo **`/wallet`**. Con la ruta corta
   (`/api/lifebook/hotel/…`) la comprobación dio **404** y parecía la app rota. Las cinco rutas reales
   responden 200/401/200.
5. **Y una que ahorra ventanas: la web no está racionada, el SSH sí.** Las rutas se comprobaron por **HTTP
   desde aquí**, sin gastar la puerta. Lo racionado (`fail2ban`) es el SSH; el `curl` no toca ese contador.
6. **Un guion de despliegue tiene que funcionar al SEGUNDO intento** (recogido en el skill, fallo 52): el
   sello del respaldo se **reutiliza** (`/tmp/a4-sello.txt`) porque un sello nuevo con `cp -n` respalda el
   fichero ya parcheado y deja el respaldo bueno a salvo por casualidad; y si la huella no cuadra al
   escribir, **restaura los tres** y no reinicia en vez de dejar un fichero truncado.

### 11.11 Estado de los hallazgos tras `A-4`

| # | Sev. | Estado |
|---|---|---|
| `LH-01` | Crítica | **CERRADA** (`A-3`) |
| `LH-02` | Alta | **CERRADA** (las dos puertas) |
| `LH-03` | Alta | abierta — cliente (`lifebook-hotel-calendario.tsx`), §9.6 |
| `LH-04` | Alta | abierta — servidor (el `Math.max` del `quote()`, §9.4) |
| `LH-05` | Alta | **mitad cerrada** — servidor (`ORDER BY method`); falta el cliente (`X-Payment-Token`) |
| `LH-06` | Alta | **CERRADA** (`A-3`) |
| `LH-07` | Media | **CERRADA** |
| `LH-08` | Media | **CERRADA** (+ barrido automático cada 15 min) |
| `LH-09` | Media | **CERRADA** |
| `LH-10` | Media | **CERRADA** salvo la causa raíz (el `ensureProvisioned` compartido, anotado) |
| `LH-11` | Baja | **CERRADA** (`A-2`) |
| `LH-12` | Baja | **mitad cerrada** — servidor (`images()`); falta versionar el `controller` |
| `LH-13` | nueva | **CERRADA** (`A-3`) |
| `LH-14` | nueva | **CERRADA** (`A-3`) |

### 11.12 Lo que queda, y qué se espera ver

1. **El barrido de las 08:15** — **CONFIRMADO** en el log y en la base: §11.13.
2. **`LH-05` (mitad del cliente)**: la app tiene que mandar `X-Payment-Token` (necesita PIN). El servidor ya
   lo acepta y el método está `active` en 3 tiendas: el dato está listo, falta el cliente.
3. **`LH-12` (mitad del `controller`)**: exige **versionar `hotel.controller.ts`**, que es B.
4. **`LH-10` (causa raíz)**: `wallet.service` / `kyc-gate.service`, fuera del módulo del hotel.
5. **`LH-04` y `LH-03`**, y **`B`**: versionar el esquema de las 5 tablas y **poder purgar los ejemplos**.

### 11.13 El barrido corrió (08:15), y qué es lo que **no** alcanza

Primer tick del `@Cron` tras el reinicio, leído en el log de pm2:

```
[Nest] 887323 - 09/27/2026, 8:15:00 AM   LOG [LifebookReservations] barrido de hotel: 2 reserva(s) sin pagar liberadas
```

Y en la base, las dos de §11.4:

| reserva | estado | `cancel_reason` | cancelada |
|---|---|---|---|
| `LBH-260913-0005` | `cancelled` | Sin pagar la señal a tiempo | 08:15:00 |
| `LBH-260917-0005` | `cancelled` | Sin pagar la señal a tiempo | 08:15:00 |

`candidatas_que_quedan = 0`. **`LH-08` no es «el código lo hace»: es el barrido haciéndolo solo.**

**Pero hay algo que hay que decir, porque se midió y no sale bien del todo.** La estancia
`LBH-260917-0003` (`checked_in`, `paid_at` vacío) **no** quedó marcada. La razón, medida y no supuesta:

```
 LBH-260917-0003 | checked_in | paid_at: (vacío) | updated_at: 2026-09-17 08:52:55+00
                 | antigüedad: 9 días 15:26 | fuera_de_la_ventana: t
```

`reconciliarMonedero` acota a **`updated_at > now() - interval '48 hours'`** — a propósito, para que el
barrido no barra media tabla cada 15 minutos. La fila tiene **9 días** y queda fuera. Dentro de la ventana
hay **0 y 0**; fuera quedan **3** en la red de «liberar» y **38** en la de «devolver».

Y esas cifras, tal cual, **asustan sin motivo**, así que se separan (el mismo día, con consultas de lectura):

| red | lo que son de verdad |
|---|---|
| «devolver»: 38 | **las 38 ya están devueltas** (`refunded` es el estado que se escribe *después* de que el monedero contesta: 37 transferencia + 1 monedero). Canceladas con `deposit_paid` —o sea, señal cobrada y **sin** devolver—: **0** |
| «liberar»: 3 | dos son de **transferencia** (el `paid_at` de liberación no aplica: solo el monedero retiene) y la tercera es `LBH-260917-0003`, que **ya tiene su `ESCROW_RELEASE`** (`liberado = 1`) |

El resumen que se puede citar:

| canceladas sin devolver | estancias sin liberar | solo falta la **marca** |
|---|---|---|
| **0** | **0** | **1** |

Es decir: **fuera de la ventana no hay ni un franco varado** — lo que falta es una **marca** en una fila
vieja. La consecuencia honesta: `LH-10` **cubre de ahora en adelante**, y el pasado anterior a la ventana
**no lo repara nadie** (la fila se quedará sin `paid_at` hasta que alguien corra un pase sin ventana). No es
dinero, es trazabilidad: el día que alguien audite «¿este hotel cobró?» sin la marca, tendrá que mirar las
transacciones. Queda con nombre: **un pase único de `reconciliarMonedero` sin la ventana de 48 h**, que es
una tarea de C (o de la limpieza de ejemplos de B), no de A.

---

# 12 · Acta de `B-2` / `B-3` — el esquema y el módulo, al repo (27-sep-2026)

## 12.1 La ventana: una, de solo lectura, y a la primera

Un solo comando (`bash _remoto.sh _b2-trae.sh`), **42 segundos**, `exit=0`. El guion **no escribe** en la
base ni en `/opt/mirror`: solo `SELECT`, `pg_dump --schema-only` y lecturas; lo único que crea es
`/tmp/b2-ddl.sql` y lo borra. Si hubiera muerto a la mitad, el daño habría sido **cero** — por eso pudo ir
en ventana sin ceremonia.

**Lo primero que hizo fue desconfiar:** antes de traer nada, comprobó que el servidor sigue siendo el que se
parcheó en `A-4`. Las **tres huellas cuadran** (las tres columnas dicen `CUADRA`), así que versionar encima
es legítimo y no una suposición:

```
hotel.service.ts             5b929c0708c39fb9  CUADRA
reservations.service.ts      a601d0fa600c38f4  CUADRA
hotel-merchant.service.ts    826c91c54be0265a  CUADRA
```

## 12.2 El esquema, versionado por primera vez (`B-2`)

`backend/sql/esquema/lifebook-hotel-20260927.sql` — **`31a5ce29…431a`**, 17.799 B, `pg_dump --schema-only`
con el comando exacto en su README. **No es una migración: es una foto**, y va byte a byte sin retocar
porque la huella ES su identidad.

**Lo que trajo, y que `A-4` no pudo tener cuando escribió el parche:**

| Medido en el esquema real | Consecuencia |
|---|---|
| `lb_res_estado` acepta **siete** estados: `hold`, `pending`, `confirmed`, `checked_in`, `checked_out`, `cancelled`, `no_show` | **No hay `expired` ni `release_pending`.** Re-semantizar `hold_expires_at` no fue preferencia: era la **única opción legal** |
| `ix_lb_res_hold` = índice parcial `(status, hold_expires_at) WHERE status='hold'` | El esquema está **diseñado** para vencer retenciones por esa columna. Y el comentario de la columna lo dice: «al vencer, el calendario la libera aunque el barrido no haya pasado» — literalmente lo que hacen las dos consultas de ocupación de `A-4` |
| `uq_lb_res_idem` = `UNIQUE (guest_id, idempotency_key)` | El nonce de `LH-09` **no era cosmético**: sin él, un reintento del mismo pago **viola el índice único** |
| `lb_res_pago_est` incluye `refunded` · `lb_res_pago` incluye `likebook_wallet` | Lo que `A-4` escribe es **legal** en el esquema; `LH-05` (monedero) tiene su método aceptado |
| `room_types`: `hold_minutes` 5–120 (def. 20) · `confirmation_hours` 1–168 (def. 24) · `cancellation_hours` 0–720 (def. 48) | Los **tres relojes** confirmados, con sus techos, y con el matiz que faltaba: `confirmation_hours` es «una reserva **sin señal**» |

No hay **ni un tipo `enum`** en el esquema `lifebook` (`0 rows`): todo son `varchar` + `CHECK`. Eso cierra
el círculo: añadir un estado no es «declararlo», es **alterar un `CHECK`** — y con el esquema sin versionar
era imposible saber si se podía.

## 12.3 El módulo del hotel: completo, y la cifra del dossier corregida

El dossier decía «son 3 de los 9 ficheros». **Medido, la cifra no se sostiene en ninguna de sus dos
lecturas**, así que se retira por escrito:

| Lectura | Realidad medida |
|---|---|
| El **módulo del hotel** | son **6** ficheros: 3 *service* + 2 *controller* + 1 *dto*. El repo tenía 3 → faltaban **3**, no 6 |
| **`src/lifebook/` entero** | **22 ficheros de código** (914 KB), más **113 respaldos `.bak`** (12 MB) |

Versionados los tres que faltaban, verificados byte a byte y con la huella declarada al lado:

```
hotel.controller.ts            11887 B  9c812ca3f422ccad
hotel-merchant.controller.ts    6197 B  fee2272ab861e121
dto/hotel-reservation.dto.ts    5660 B  83505cb14d40c50e
```

Y —esto es lo que hace que la palabra «verificado» signifique algo— **los 3 que ya estaban se re-verificaron
CONTRA el servidor en la misma pasada**: 71.421 / 64.124 / 29.892 B, las huellas de `A-4`. Lo versionado es
lo desplegado, no una copia parecida.

Los `*.bak-*` **no se versionan** (113 ficheros, 12 MB): son respaldos, se excluyen por patrón, igual que
los `_respaldo-*`.

## 12.4 Un defecto de transporte, cazado por la aritmética

Un bloque llegó con el base64 **corrupto**, y el extractor **se negó a escribirlo** — que es exactamente lo
que tiene que hacer.

La causa: por el canal SSH, **el stdout del guion va en bloque y el stderr de `psql` sin buffer**, y se
intercalan. El error de la consulta `6b` (`column "name" does not exist`) apareció **dentro** del payload de
la sección 3, partiendo una línea en dos.

Lo que convierte esto en un hallazgo y no en una pérdida:

```
fragmento A (16372) + fragmento B (72384) = 88756 chars
88756 = longitud base64 de un fichero de 66567 B  ✓
decodificado: 66567 B, sha256 49969af1ab5d0784…992668 = el declarado en su propio @INICIO  ✓
```

**El error ocupaba 36 chars (35 + el salto) y la cuenta cuadra al byte.** El registro bruto se conserva
(`_b2-registro-bruto.txt`) y el reparado lleva la nota con el texto reubicado, sin borrar nada.

## 12.5 Lo que **no** quedó cerrado: el censo de ejemplos

La consulta `6b` —«¿cuántos nombres parecen de prueba?»— **murió entera**: `lifebook.products` no tiene
columna `name`, así que el `UNION` completo falló y **no hay ni un recuento**. Es un defecto de mi guion,
no del servidor, y se dice aquí en vez de disimularlo.

Lo que **sí** se sabe del marcado de ejemplos, y es más de lo que había:

- **No existe bandera.** `0 filas` al buscar columnas con `is_test`/`prueba`/`ejemplo`/`seed`/`dummy`… en
  los cinco esquemas (`lifebook`, `wallet`, `mobility`, `ecomerse`, `public`).
- **La única señal es el nombre**, y en `lifebook.shops` cuadra **exactamente uno**: **`Hotel Demo Malabo`**
  (creada el 11-sep). Coherente con `hotel_profiles = 1` fila.
- Colocación de las 5 tablas: `hotel_profiles` 1 · `room_types` 43 · `room_type_calendar` 0 ·
  `reservation_nights` 17 · `reservations` 90.

O sea: **«purgar los ejemplos» sigue abierto**, ahora con el censo a medias y con la razón escrita. Falta
repetir `6b` con la columna correcta de `products` — se hace en la próxima ventana que se abra por otro
motivo, no en una propia.

> **CERRADO el 27-sep por `B-7` → §13.** El censo se repitió **sin necesidad de columnas**
> (`to_jsonb` + límites de palabra) y la decisión de mecanismo está en §13.3: seed versionado con ids
> deterministas + purga por esos ids. Lo que este epígrafe decía «a medias» está completo en §13.2.

## 12.6 Estado de `B` y lo que deja abierto

**Hecho:** `B-1` (5 migraciones + `.gitattributes`) · **`B-2`** (esquema) · **`B-3`** (módulo del hotel).

**Abierto, con nombre:**

1. **~~Purgar los ejemplos~~ → CERRADO en §13** (`B-7`, 27-sep): censo medido y mecanismo decidido
   (seed versionado con ids deterministas + purga por esos ids). Falta escribirlos y ejecutarla.
2. **~~Los 16 ficheros de código que quedan sin versionar~~ → CERRADO en §13.4** (`B-4`, commit
   `6a8e481`): los 22 del módulo están en el repo. Era prerrequisito de la tanda C, no un extra.
3. **`LH-05` mitad app** (cabecera `X-Payment-Token`, exige PIN) · **`LH-12` mitad controlador** ·
   **`LH-10` causa raíz** en `wallet.service`/`kyc-gate.service`.
4. **El pase de `reconciliarMonedero` sin la ventana de 48 h** (§11.13).
5. **Los 5 commits** de `B` sin subir (los sube Bernardo: desde aquí falta credencial, no red).

## 12.7 Trampas nuevas (§12.4)

- **Mezclar un payload grande en stdout con errores de `psql` en stderr, por un solo canal SSH, los
  intercala.** El stdout va en bloque, el stderr sin buffer. Mitigación: el payload **al final**, o
  mandarlo a fichero, o separar los errores de la sección que los produce.
- **Corregir la cifra no basta: hay que RETIRARLA por escrito.** El «3 de los 9» queda dicho aquí como
  retirado, y con las dos cifras medidas en su lugar, porque sobre él se habría construido un plan.

---

# 13 · Acta de `B-7` — el censo de ejemplos y los 16 ficheros (27-sep-2026)

Cierra los dos puntos que §12.6 dejaba abiertos con nombre: el censo de ejemplos (1) y los 16 ficheros
sin versionar (2). Los dos, con medición; ninguno con opinión.

## 13.1 La ventana: dos intentos, y la trampa que el primero destapó

El primer intento acabó **`exit=0` limpio, con 12.414 bytes de registro, cortado justo después de la
primera llamada a `docker`, y stderr vacío**. No hay mensaje de error que leer: ese es el problema.

- **Diagnóstico (medido, no supuesto):** dentro de un guion que se alimenta por stdin
  (`ssh … 'bash -s' < guion.sh`), un `docker exec -i` **puede comerse el resto del guion**: su lectura
  de stdin corre una carrera con la lectura de `bash`. Al llegar a EOF, `bash` salió 0 sin avisar — de
  ahí el `exit=0` con la mitad del trabajo sin hacer.
- **Cura:** negarle el stdin a docker en **todas** sus llamadas (`< /dev/null`): 5 de `psql` y 1 de
  `pg_dump`. Segundo intento: **1.029.513 bytes, completo hasta la última línea**, a la primera.
- **Por qué es peor que la trampa de §12.4:** aquella rompía el payload y se veía en la aritmética.
  Esta **no rompe nada visible** y sale con éxito. Solo la longitud del registro delata que falta algo.
  En `TRAMPAS-ENTORNO` queda como regla: **guion por stdin ⇒ docker con `< /dev/null`, sin excepción.**

## 13.2 El censo, arreglado y medido

El arreglo de la consulta `6b` no es «poner la columna correcta de `products`»: es **dejar de necesitar
columnas**. El censo ahora compara contra `to_jsonb(t)::text` — la fila entera, cualquier tabla — con
límites de palabra `\m…\M` para que un `e2e` dentro de un uuid **no** cuadre (los uuid son hexadecimales;
`E2E` podría formarse, pero entre dígitos hexadecimales los límites de palabra lo matan). Antes, el
inventario de tablas sale de `pg_stat_user_tables`: **206 tablas en los cinco esquemas**, con filas, sin
adivinar ni un nombre.

| Tabla | Filas | Parecen prueba |
|---|---:|---:|
| `lifebook.shops` | 3 | **1** |
| `lifebook.products` | 120 | **120** |
| `lifebook.room_types` | 43 | **16** |
| `lifebook.hotel_profiles` | 1 | 0 |
| `lifebook.reservations` | 90 | **48** |
| `lifebook.reservation_nights` | 17 | 0 |
| `lifebook.room_type_calendar` | 0 | 0 |
| `lifebook.post_products` | 10 | 0 |
| `mobility.users` | 17 | **5** |
| `wallet.ecomerse_products` | 12 | **12** |

Y por **nombre**, en las dos columnas verificadas (shops `name`; products `title`, que está en
`commerce.service.ts:816`): `shops` → **1** (`Hotel Demo Malabo`, creada el 11-sep); `products` → **4**
(dos «de prueba» del 14-sep, `Producto E2E Monedero` y `Habitación E2E` del 17-sep).

**La advertencia honesta que este censo lleva pegada:** `to_jsonb` también mira **dentro** de los valores
`jsonb` — URLs de imágenes, etiquetas —. Por eso `products` da **120 de 120**: es una cota superior, no
una verdad fila a fila. No hace falta resolverla para decidir, porque la decisión de §13.3 no depende de
eso; pero **ninguna cifra de esta tabla se puede usar como «cuántas filas se borran»**.

## 13.3 La respuesta a §7.2-3: ni bandera ni disciplina de nombres

Lo medido manda sobre las dos opciones que había sobre la mesa:

- **Una bandera por fila sería peso muerto hoy**: en las tablas del mercado el ejemplo **es** el 100 %
  (3 de 3 tiendas, 120 de 120 productos). Una bandera que vale `true` en todas las filas no distingue nada.
- **La disciplina de nombres ya está medida y no alcanza**: 4 de 120 productos delatan por nombre. El
  otro 116 no tiene ninguna señal — y `is_room_type`/`Hotel Demo Malabo` prueban que los ejemplos se
  crearon sin convención de nomenclatura.

**La decisión:** el mecanismo de «purgar los ejemplos» es un **seed versionado con ids deterministas** más
una **purga que borra exactamente los ids que ese seed insertó**. Hoy la purga es un **reset** (todo es
ejemplo); el día que entren datos reales, la misma lista de ids del seed hace la purga **quirúrgica**, sin
columna nueva, sin migración y sin depender del idioma de los nombres. Los ids van en el propio fichero
del seed: la identidad del ejemplo **es** la fila que el seed declara, no un texto que aparece en su título.

Lo que esto **no** hace: no borra nada todavía. La purga se ejecuta en ventana, con `pg_dump -Fc` fresco
verificado delante (regla de §11), y después de que el seed exista y esté versionado — si se borra antes
de que el seed exista, no hay forma de recargar.

## 13.4 Los 16 ficheros, versionados (`B-4`)

Los trajo la ventana en base64 con su `sha256` al lado; el extractor (`_b2-extrae.py`, sin cambiar una
línea) verificó los **22 ficheros del módulo**: **16 escritos, 6 ya versionados comprobados contra el
servidor, 0 errores**. Commit **`6a8e481`**: 14.470 líneas.

| Fichero | Bytes | | Fichero | Bytes |
|---|---:|---|---|---:|
| `lifebook.service.ts` | 304.440 | | `orders.controller.ts` | 3.947 |
| `commerce.service.ts` | 156.601 | | `payments.service.ts` | 10.098 |
| `orders.service.ts` | 81.928 | | `orders-fees.ts` | 6.725 |
| `ai.service.ts` | 57.932 | | `commerce.controller.ts` | 15.350 |
| `lifebook.controller.ts` | 58.826 | | `merchant.service.ts` | 14.002 |
| `media.service.ts` | 25.934 | | `ai.controller.ts` | 3.526 |
| `payments.controller.ts` | 1.975 | | `orders-money.controller.ts` | 2.247 |
| `media.controller.ts` | 2.191 | | `merchant.controller.ts` | 1.531 |

**Por qué esto no es ampliar el alcance:** el mapper de la tarjeta del hotel lee `shops.rating` en
`commerce.service.ts` (líneas **322**, **813**, **1546** y **1576-1603**) — es el desacople que §8.1
exige como «(1) el mapper». Ese fichero **no estaba en el repo**. Sin él, la tanda C no se puede ni
planear: se estaría editando a ciegas un fichero del que el repo no tiene copia.

**El espejo de septiembre sigue siendo válido, con una excepción medida:** los 16 comparados contra
`.auditoria-servicios/backend/src/lifebook/` dan **15 idénticos byte a byte**. El que difiere es
`lifebook.service.ts`, y la diferencia es **exactamente el arreglo conocido de la política del bucket**
(aplicarla siempre, no solo al crear): dos trozos, cero sorpresas. Las citas de línea del espejo valen
para los 15; para `lifebook.service.ts` hay que citar sobre la copia del repo.

## 13.5 El DDL otra vez: la huella cambió y el esquema NO se movió

El volcado de B-7 dio **17.799 bytes —los mismos que B-2— con otra huella**. La razón está en las líneas
5 y 474: `pg_dump` 16.15 mete un `\restrict` con **semilla aleatoria en cada tirada**, así que **un
volcado crudo no es reproducible byte a byte**, y comparar huellas crudas de `pg_dump` **miente**.

Quitadas las dos líneas `\restrict`/`\unrestrict`, los volcados de B-2 y B-7 son **idénticos**. Huella
normalizada: `415fb5d2c1988cf8418df146d33d7c35408f25fd603b512759d373fc87ce4fb8`. Regla que queda: **los
`pg_dump` se comparan normalizados, o la comparación no vale nada.** Para la migración `026` esto importa:
el esquema sobre el que se escribe es el mismo que se versionó en B-2.

## 13.6 Estado de `B` tras esta tanda

**Cerrado:** el censo de ejemplos (§13.2, con decisión de mecanismo en §13.3) · los 16 ficheros (§13.4).
**El repo ya versiona 22 de 22 del módulo** y el esquema completo del hotel.

**Queda abierto, con nombre:**

1. **Escribir el seed y la purga** (§13.3) y ejecutar la purga en ventana — nada se ha borrado.
2. **`LH-05` mitad app** (cabecera `X-Payment-Token`, exige PIN) · **`LH-12` mitad controlador** ·
   **`LH-10` causa raíz** en `wallet.service`/`kyc-gate.service`.
3. **El pase de `reconciliarMonedero` sin la ventana de 48 h** (§11.13).
4. **4 commits** de `B` sin subir (`dc14bc6`, `c473eb1`, `922a479`, `6a8e481`) — los sube Bernardo.

---

# 14 · Trabajo C — lo que decide la compra, antes de publicar (27-sep-2026)

§4 definió C como el mapa de brecha frente a Meituan. Esta tanda es **la mitad que tiene que estar
antes de publicar**, y el reparto frontend/backend de cada pieza está **medido, no repartido a ojo**.
Las cinco piezas, en el orden en que se tocan:

## 14.1 C-1 · La confianza: reseñas propias (backend + app)

**La pieza más larga y la que desbloquea las demás.** El modelo está decidido (§8.1) y la migración
**ya está escrita**: `backend/sql/026_hotel_resenas.sql` — tabla `lifebook.hotel_reviews` (una por
estancia, `uq_lb_reviews_reserva`), FK a `reservations`/`shops`/`users` con `cascade` como la familia,
y **el espejo** `hotel_profiles.hotel_rating` + `hotel_rating_count`, que la búsqueda lee y por el que
ordena. Aplicarla necesita ventana; el resto se puede escribir mientras tanto.

Lo que falta por construir, medido sobre lo que hay:

- **Rutas: no existe ni una.** `hotel.controller.ts` tiene **23 rutas** (medidas) y ninguna es de
  reseñas: `hotels`, `search`, `fx`, `hotels/:id`, `rooms/:roomTypeId…`, `reservations…`, `my/hotel`,
  `my/room-types`, `my/day-book`, `admin/expire-stale`. Hacen falta: listar las de un hotel (pública),
  escribir (el autor de una estancia `checked_out`), responder (el hotelero) y borrar (el autor, dentro
  de 7 días; el administrador, siempre).
- **El desacople de `shops.rating`, en el sitio medido:** `commerce.service.ts` líneas **322**, **813**,
  **1546** y **1576-1603** — el mapper de la tarjeta y el de la tienda. La ficha debe enseñar
  «4,6 · 38 reseñas» del espejo, no el número de la tienda; y el filtro «4,5+» y la ordenación, cuando
  se construyan (C-4), **van sobre el espejo**, no sobre `shops`.
- **En la app:** la ficha (`lifebook-hotel-detalle.tsx`, 547 líneas) no tiene sección de reseñas ni
  hay pantalla para escribirlas.

## 14.2 C-2 · La búsqueda por filtros: lo que se promete y no se entrega

**Hallazgo nuevo de esta tanda, medido:** `searchHotels` **acepta `amenities` y no la usa**. Está en la
firma (`hotel.service.ts:1154`) y en el DTO, y la consulta `WHERE` solo filtra ciudad, estado y
`is_hotel` — ni una mención a `amenities` en las **267 líneas del método** (1071→1337). El parámetro
existe para que el cliente crea que filtra. Y **`stars` ni siquiera se acepta**: `hotel_profiles.stars`
existe (1–5, con su CHECK) y no hay manera de pedir «4 estrellas o más».

- **Backend:** aplicar `amenities` (jsonb, comparación de contención) y aceptar `stars` (mínimo), los dos
  sobre `hotel_profiles`. Más el filtro de nota mínima y la ordenación por nota **sobre el espejo** de C-1.
- **Por ubicación del usuario:** `shops.lat/lng` existen; la búsqueda no recibe coordenadas. Es la pieza
  con decisión pendiente — distancia en km con filtro de radio (haversine en SQL) o solo orden por
  cercanía. Se decide antes de construirla, no dentro.
- **En la app:** `lifebook-hotel-resultados.tsx` (354 líneas) y el buscador (`lifebook-hotel.tsx`).

## 14.3 C-3 · El desglose del precio — VERIFICADO, no hay que construirlo

Escrito primero como pendiente y **retirado al medirlo**, como ya pasó con la política de cancelación
(§8.2). El desglose **existe y está en las dos orillas**:

- **El servidor lo calcula y nunca recibe dinero del cliente:** los precios noche a noche salen del
  calendario → fin de semana → base (`reservations.service.ts:225-237`), toma el **mayor** como
  instantánea prudente, y `quote()` (`hotel.service.ts:1338`) devuelve subtotal, limpieza, tasas,
  total, señal y resto. Además **ya viaja el desglose por noche**: `nightlyPrices`
  (`api/hotel.ts:256`, `:398`).
- **La app lo pinta:** la reserva (`lifebook-hotel-reserva.tsx:328-330`) y la pre-reserva
  (`lifebook-hotel-reservar.tsx:531`), cuya estimación **reproduce la regla del servidor a mano**
  (`Math.max(...noches)`, línea 199, con el comentario que lo dice).

Lo que queda aquí no es construir, es **vigilar que las dos orillas no diverjan**: hoy la igualdad
depende de que el código de la app copie a mano la regla del servidor. Si algún día cambia una de las
dos (por ejemplo, para C-2 con precios de temporada), la otra se queda vieja **sin que nadie se entere**.
El remedio natural es que el servidor mande el desglose ya calculado en la respuesta de disponibilidad
— decisión que se toma al tocar C-2, no antes.

## 14.4 C-4 · La etiqueta de confirmación inmediata (solo app)

`confirmation_hours = 0` significa «confirma al instante» (§8.3) y el dato ya viaja. Falta pintarlo en
la tarjeta de resultados y en la ficha, con el mismo reloj que el panel del hotelero. Es la pieza más
corta de la tanda y no toca servidor.

## 14.5 C-5 · La ficha (el conjunto, no una pieza)

`lifebook-hotel-detalle.tsx` concentra hoy lo que hay. C-1, C-3 y C-4 le añaden reseñas, desglose y
etiqueta; C-5 es revisar el **conjunto** con la regla del dossier: lo que decide una reserva — fotos,
habitaciones, precio con desglose, política con fecha y hora, nota con reseñas — visible sin scroll
infinito ni saltos. Antes de implementar: **decisión y previsualización**, como pide Bernardo.

## 14.6 El orden y lo que cada paso necesita

| Paso | Necesita | Ventana |
|---|---|---|
| C-1 (reseñas) | migración `026` + servicio + rutas + app | sí, para aplicar `026` y desplegar |
| C-2 (filtros) | el espejo de C-1 para nota mínima/orden | sí, para desplegar |
| ~~C-3 (desglose)~~ | **nada: verificado hecho** (§14.3) | — |
| C-4 (etiqueta) | solo app | no, pero sí `assembleRelease` para verificarla |
| C-5 (ficha) | las anteriores | la verificación es en el móvil |

**Lo que NO es C:** el desglose del precio (verificado en §14.3), purgar los ejemplos (cerrado como
mecanismo en §13.3; falta escribir el seed) y el resto de deudas de B (§13.6). C no empieza borrando
nada: empieza por la migración `026`, que ya está escrita y revisada contra el esquema medido.


