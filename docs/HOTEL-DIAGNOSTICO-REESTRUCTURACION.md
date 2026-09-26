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
| LH-06 | Alta | Se puede **cancelar DESPUÉS del check-in**: «Devuelto» sin devolución y habitación liberada con el huésped dentro |
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
> contra una foto de hace 9 días.

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
| **Valoraciones: escribir y listar** | **`rating` sale de `shops.rating`** — la nota **de la tienda**, no del hotel. **No hay tabla de reseñas.** | **modelo nuevo** — y **la valoración es la del HOTEL**, decidido (§7/D3). Hay que **desacoplar** `shops.rating` del hotel |
| **Pestañas 亮点 / 设施 / 政策 / 周边** | la ficha es **una sola página** (amenities como chips) | frontend |
| **Galería 封面 / 房间 / 公共区域 / 相册** | `images` (máx 12) **sin clasificar** | modelo + frontend |
| **Política con fecha/hora + penalización calculada** | `cancellation_policy` es **texto libre 600** y `cancellation_hours` un número relativo (0-720, def. 48). Meituan usa **hasta qué hora** y **tramos con tarifa** | **DECIDIDO: `cancellation_hours`, sin tramos** (§7/D4). El modelo de tramos **no se construye**. `cancellation_hours` ya es el dato correcto: solo falta **pintarlo bien** (frontend) y **dejar de duplicar** el texto libre |
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
   Es pintar «cancelación gratuita hasta N horas antes» en la ficha y en la tarjeta. **Cero modelo nuevo.**
5. **Modo mapa** — MapLibre ya está en uso y las coordenadas ya vienen en `arrival`. *(Se construye después de
   publicar, §7/D2 — pero el coste es el mismo de siempre: bajo.)*

### 4.2 Las dos que exigen modelo nuevo de verdad

1. **Valoraciones.** Hoy la nota es la de la tienda (`shops.rating`). Hacer lo de Meituan es: tabla de
   reseñas, permiso de escritura solo para quien se alojó, agregado por hotel, y **UI de leer y escribir**.
   Es el hueco **con más dependencias detrás**: sin reseñas no hay filtro «4.5+», ni ordenación por
   puntuación, ni etiquetas extraídas.
2. **Filtros de tema.** `amenities` es una lista de SERVICIOS. «电竞酒店», «情侣约会», «亲子» son otra
   dimensión. O se añade un campo `themes` con su propio enum, o los filtros de Meituan no se replican.

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
| **D3** | ¿La valoración es de la tienda o del hotel? | **Del hotel** | Hay que **desacoplar `shops.rating`** y crear reseñas propias del hotel → modelo nuevo |
| **D4** | ¿Tramos de cancelación o N horas? | **Por N horas** | **No se construye el modelo de tramos.** `cancellation_hours` (ya existe) es el dato correcto → queda **solo frontend** |
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
4. **`cancellation_policy` (texto libre, 600)**: ¿se retira en favor de `cancellation_hours`, o convive como
   nota del hotelero? Decidido el modelo (D4); **falta decidir si el texto se queda**.
5. **Los filtros de TEMA** (§4.2): con 0 hoteles reales **no urgen**; se reevalúan con el inventario delante.
