# UI DEL HOTEL — REFERENCIA MEDIDA (Meituan) Y PLAN DE MEJORA

> Escrito el **2026-09-27**. Insumo de este documento:
> - **30 capturas del usuario** de su propio recorrido en Meituan, en orden de uso
>   (`C:\Users\nisang12\.workbuddy\blobs\`, 26-sep 23:10:43 → 23:10:50).
> - **8 capturas en vivo** hechas desde el móvil contra la app real
>   (`pruebas/_mt-01…_mt-08`), más el volcado de jerarquía `pruebas/_mt_u1.xml`.
> - El **estado actual** de la app, medido en capturas (`pruebas/_c1-01…_c1-05`) y leído
>   en el código (`app/lifebook-hotel*.tsx`, `components/HotelResultCard.tsx`).
>
> **Relación con `DISENO-UX-MEITUAN-HOTELES.md` (12-sep):** aquel documento se construyó
> **sin dispositivo**, con fuentes públicas, y por eso casi todo lo visual está marcado
> `[INF]` y lo dice en su cabecera. **No se borra ni se reescribe**: sigue siendo la
> referencia buena para lo que Meituan documenta por escrito (reglas de cancelación,
> estados del pedido, PMS del hotelero). Este documento lo **corrige donde ahora hay
> medida** y aporta lo que allí no podía haber: cómo se ve de verdad cada pantalla.
>
> **Convención de honestidad de este doc:** lo que va sin marca está **medido en captura**.
> Lo que va marcado `[?]` es **inferencia mía** y no debe maquetarse sin confirmar. Lo que
> va marcado `[NO]` es algo que **no** se ha podido comprobar todavía.

---

## 0. Método: cómo se va a trabajar esto

El usuario lo dijo así: **«iremos diseñando pantalla por pantalla»**. Por tanto:

1. **Las fotos se numeran por orden de marca de tiempo** (1 = la primera que hizo,
   30 = la última). Ese orden **es** el recorrido: empezó buscando y terminó pagando.
2. El recorrido está agrupado en **cuatro tramos** (§1). Cada tramo es un trabajo.
3. **Cada pantalla se diseña con SUS fotos delante**, otra vez, en el momento de
   diseñarla — no de memoria. Este documento es el **itinerario y las decisiones**,
   no la especificación de píxeles de las 8 pantallas.
4. **Ninguna pantalla se implementa sin decisión escrita y previsualización aprobada.**
   Regla vigente del proyecto, pedida por el usuario dos veces.

---

## 1. El recorrido de Meituan, tal como lo enseña el dueño del producto

Las 30 fotos, agrupadas por lo que el usuario estaba **decidiendo** en cada momento.

### Tramo A — «¿dónde y cuándo?» (fotos 1-8)

| # | Pantalla | Lo que resuelve |
|---|---|---|
| 1-2 | **Buscador de hotel** (entrada del módulo) | Ciudad, fechas y ocupación; un solo botón |
| 3-4 | **Calendario** de fechas | Llegada y salida con precio por noche y mínimo de estancia |
| 5 | **Selector de huéspedes/habitaciones** | Hoja inferior con contadores |
| 6 | **Tipos de estancia** | 国内 / 民宿 / 钟点房 / 短租 / 海外 |
| 7-8 | **Búsqueda por categoría y por zona** | Puntos de interés, 商圈, listas |

### Tramo B — «¿cuál de todos?» (fotos 9-14)

| # | Pantalla | Lo que resuelve |
|---|---|---|
| 9-10 | **Lista de resultados** | Tarjetas con foto, nota, cita de reseña, distancia, beneficios y precio |
| 11 | **Orden y filtros rápidos** | Fila de controles con nombre, no botones sueltos |
| 12 | **Panel de distancia** | Radio en km **con el % de gente que elige cada zona** |
| 13 | **Panel de precio y estrellas** | Doble deslizador de precio + clase del hotel |
| 14 | **Rail de todos los filtros** | Tipo, tema, facilidades — con recuento |
| — | **Mapa con burbujas de precio** | `共35家酒店，展示前18家`: el precio vive en el mapa |

### Tramo C — «¿me quedo aquí?» (fotos 15-24)

| # | Pantalla | Lo que resuelve |
|---|---|---|
| 15-16 | **Ficha — galería** | Foto a pantalla completa + pestañas 封面/房间/公共区域/相册 |
| 17 | **Ficha — datos y confianza** | Nota + nº de reseñas + cita, distancia a pie, ranking, ventas, 最新预订 |
| 18 | **Ficha — 亮点·设施** | Instalaciones **con su regla** (parking, traslados) y su precio |
| 19-20 | **Ficha — 政策 y 价格说明** | Edad admitida, depósito, **precios tachados** |
| 21-22 | **Ficha — 评价** | 4 sub-notas, etiquetas con recuento, «高于90%同类酒店», **消费后评价** con fecha de estancia |
| 23-24 | **Galería de la habitación** | Fotos reales del tipo, subidas por usuarios |

### Tramo D — «lo reservo» (fotos 25-30) — **verificado uno a uno en esta sesión**

| # | Pantalla | Lo que se ve (literal) |
|---|---|---|
| 25 | **Detalle de habitación** | `高级电竞双人间[小度智控]` · planta `5-9层` · `20-25m²` · `WiFi免费` · `有线宽带免费` · `可开窗/窗户位于走廊/窗外有遮挡` · `可吸烟` · `2人` · `2张单人床1.2米` · `加床：该房型不可加床` · `无早餐` · `房型设施详情 ⌄` — y debajo **入住礼赠** (`1项 LOL全英雄特权…`), **白银会员** (`住就送`: 70元券包, 积分奖励, 会员折扣), y **政策** |
| 26 | **Política de la habitación** | `立即确认` · `预订说明` (factura y **teléfono del hotel**) · `商家取消政策` **en tabla de dos columnas por franja horaria** (`预订成功15分钟内` 免费取消 / `15分钟后` 不可取消) · `儿童政策、使用规则、房型说明 ⌄` |
| 27 | **促销 y 费用明细** | `促销优惠` (夏日特惠 −183, 酒店神券 −43, 暖春特惠) y **`费用明细`**: 房费 `¥604.59` → `-¥183` → `-¥182` → `-¥31` → `-¥43` = **`¥166`**, con la nota de que el cupón «puede inflarse» |
| 28 | **Rellenar pedido** | Aviso de escasez (`客房紧张 该客房仅剩最后1间，马上下单以免错失!`), resumen de estancia, **`入住信息`** (1间, 姓名, móvil, `预计到店 09月26日 23:00前` con la advertencia `房间将整晚保留`), **`可享优惠`** (`减¥439` desglosado en 神券/促销活动/抵用券), `住就送`, `连订更优惠` |
| 29 | **Pago** | `其他支付` (WeChat/Alipay/Nube) vs `美团支付` (**−5** por añadir tarjeta), `酒店开票`, y **`购买须知`**: reglas de reembolso, aviso de que el pedido **solo existe cuando el proveedor confirma**, los dos contratos (`《美团酒店预订条款》` y `《个人信息授权声明》`), y el sello `美团酒店·服务保障` (入住保障 / 退订保障 / 专业客服) |
| 30 | **Estado del pedido — `待付款`** | Aviso de autocancelación (`29:23后订单将会自动取消`), **`取消规则` con la hora exacta** (`预订成功后，9月26日22:52前 免费取消`), promesa de cancelación irreversible (`9月26日22:52后 不可取消`), importe, hotel con dirección y `复制`, botones `打车` / `地图`, detalle de la habitación, **`住 9月26日(今天) 14:00后` / `离 9月27日(明天) 12:00前`**, y tres acciones: `删除订单` / `取消订单` / **`去支付 ¥165.59`** |

---

## 2. Lo que Meituan resuelve **con forma, no con dato** — y por eso se puede copiar ya

Estas once cosas no necesitan cupones, ni membresía, ni 89 reseñas. Son **decisiones de
composición**. Son las que explican por qué la pantalla de Meituan se entiende y la
nuestra no.

1. **Buscar es una pantalla, y solo una.** Destino, fechas, ocupación y **un botón**.
   Nada más. La lista de resultados es *otra* pantalla.
2. **La fecha y la ocupación se leen en UNA línea**: `09.27住 — 09.28离 · 共1晚 › · 1间·1成人 ›`.
   Las tres cosas que deciden el precio, en un renglón, tocables por separado.
3. **En la tarjeta, la foto manda.** Ocupa el tercio izquierdo entero, con esquinas
   redondeadas, y **el nombre no compite con el precio**: el nombre va arriba a la
   izquierda, el precio abajo a la derecha, y no se pisan.
4. **El precio va solo con la cifra**: `¥86` tachado, `¥62` grande, `起` pequeño, `神券最高能至100↑`
   debajo. Nunca «por noche · desde» pegado al nombre.
5. **La nota se enseña con su respaldo**: `4.7 棒` + `89条` + **la cita literal de una
   reseña** entrecomillada. Una nota sin reseñas no se pinta (igual que ya hacemos).
6. **Una barra de pestañas pegajosa** en la ficha: `预订 | 评价(89) | 设施 | 周边`. El
   usuario sabe dónde está y puede saltar sin volver arriba.
7. **Escasez y certeza, dichas en la tarjeta**: `仅剩最后1间`, `确认较快`, `30分钟内可免费取消`.
   Tres frases cortas que responden las tres preguntas que frenan la reserva.
8. **La política deja de ser texto legal y pasa a ser un dato**: `预订成功15分钟内` / `15分钟后`
   **en tabla**, y en el pedido la **hora exacta** (`22:52前 免费取消`).
9. **Los filtros son una fila de controles con nombre**: `附近5公里内 ⌄ | 智能排序 ⌄ | 价格·星级 ⌄ | 筛选 ⇅`.
   No un chip «Precio» que no dice qué hace ni cuántos resultados quedan.
10. **El mapa lleva el precio dentro**: burbujas con la cifra, y dice cuántos hoteles hay
    y cuántos se están mostrando.
11. **La ficha abre con la foto a pantalla completa** y las pestañas de galería encima
    (`封面 | 房间 | 公共区域 | 相册`). No con una cabecera de texto.

---

## 3. Lo que depende de **datos que hoy no existen** (y qué haría falta)

Decir esto es tan importante como lo anterior: **copiar el continente sin el contenido
produce una pantalla vacía y peor que la actual.**

| Elemento de Meituan | Qué falta en la app | ¿Es asumible? |
|---|---|---|
| `4.7 棒` + `89条` + sub-notas (位置/设施/服务/卫生) + etiquetas con recuento | **Reseñas.** Hoy el backend las escribe y la app ya las lee, pero el hotel de prueba tiene **0** reseñas. Sin reseñas, `nota` es `null` **por diseño** y el bloque no se pinta. | Sí: la UI ya está; falta el dato. Y el hotelero ya tiene pantalla para **responder** (`lifebook-hotel-valoraciones.tsx`). |
| Galería por zonas (`封面/房间/公共区域/相册`) | **Fotos por zona.** El hotelero **ya puede subir fotos por tipo de habitación** (`lifebook-hotel-habitacion.tsx`, por el camino de `uploadImageReal`). **No** hay campo de «zona» ni de foto de fachada/común. | Sí, es un campo nuevo barato. **Decisión pendiente** (§7). |
| `消费后评价` + `2026/03入住` | La reseña ya nace de una reserva `checked_out` + el backend ya devuelve `reviewId`: **el vínculo existe**. Falta enseñar la **fecha de estancia** en la reseña. | Sí, barato. |
| Fotos **dentro** de la reseña | La app **sí sabe subir imágenes** (Parte 41). La reseña no las admite hoy. | Sí, pero es un cambio de esquema. `[?]` no urgente. |
| Cupones (`神券`, `-43`), membresía (`白银会员`), `减¥439`, `团队团购`, `排名/人气榜` | **No existe el modelo de dinero promocional.** No es una pantalla: es contabilidad. | **No.** Fuera de alcance. |
| `打车` / `地图` desde el pedido | Mapa sí (MapLibre ya está en uso). Taxi no. | Parcial. |
| `钟点房` (habitación por horas) | No existe el concepto. | **Decisión de negocio local**, no técnica. |

---

## 4. Lo que **no** se copia (y por qué) — se mantiene lo razonado el 12-sep

| Elemento | Por qué no |
|---|---|
| **身份证号 obligatorio** y verificación de documento | Es exigencia regulatoria **china**. En Guinea Ecuatorial es una cuestión legal local **por confirmar**, y además choca con la regla de no exponer datos personales en listados. |
| **Compensación tasada** por falta de habitación (Meituan paga la diferencia, tope = primera noche) | Es un **compromiso financiero de la plataforma**, no una pantalla. |
| **Módulo 性价比** con algoritmo y **resumen IA de reseñas** | Necesitan volumen (cientos de hoteles / miles de reseñas) para tener señal. Con una lista corta, el usuario compara a ojo y las reseñas ordenadas por fecha bastan. |
| **PMS completo** con 6 estados por habitación física, cerraduras y 夜审 | Es otro producto. Gestionamos **tipos de habitación + calendario**, que es lo que necesita un hotel pequeño. |
| **Precios tachados y `-439`** | No hay modelo de descuento. Un tachado sin descuento real es publicidad engañosa. |

---

## 5. La brecha medida: lo que hay hoy, y por qué se ve así

Capturas del estado actual: `_c1-01-arranque.png`, `_c1-02-resultados.png`,
`_c1-03-ficha.png`, `_c1-04-ficha-cabecera.png`, `_c1-05-ficha-final.png`.

### 5.1 El diagnóstico en tres frases

1. **La entrada hace dos trabajos a la vez.** `app/lifebook-hotel.tsx` es el buscador
   **y** la lista: `DÓNDE` (input + 7 chips de ciudad) → `CUÁNDO` (dos cajas Entrada/Salida
   + contador de noches + botón «Elegir las fechas y los días») → `QUIÉN Y CUÁNTAS
   HABITACIONES` (dos contadores) → estado → botón «Ver la lista de resultados» → **y
   debajo, la lista**. Citando las líneas: `lifebook-hotel.tsx:200-388` es el
   `ListHeaderComponent` — es decir, **el formulario entero vive dentro de la cabecera de
   la lista de resultados**.
2. **Cada hotel arrastra sus habitaciones con su propio botón azul.** En `_c1-01` se ven
   dos hoteles y **cinco botones «Ver fechas»**. La tarjeta de un hotel contiene hasta tres
   filas de habitación, cada una con precio y botón (`HotelResultCard`), así que la lista
   tiene decenas de zonas tocables compitiendo y crece sin fin. El nombre, además, se corta
   (`Tienda Hotel 07…`, `Hotel Demo Ma…`) porque el bloque de precio le come el ancho.
3. **La ficha mete el calendario dentro de cada tipo de habitación — y la habitación no
   tiene pantalla.** Medido en `app/lifebook-hotel-detalle.tsx`: la tarjeta de habitación
   es un **acordeón** — `:465` `onPress={() => setAbierta(esAbierta ? null : r.id)}` — y
   al abrirse pinta dentro de la misma tarjeta el **`CalendarPicker`** (`:504`), el
   **desglose del precio** (`:518`) y el **botón de reservar** (`:548`). No navega: se
   despliega. En `_c1-03` y `_c1-05` se ve el resultado: la habitación es una **tarjeta de
   texto** (`3 huésped(es) · 1 queen · 2 iguales`, y las condiciones como un párrafo
   seguido), con el precio arriba a la derecha y la equivalencia de moneda debajo. Con
   tres habitaciones abiertas hay **tres calendarios dentro de la ficha**.

### 5.2 Tabla de brecha, elemento por elemento

| Elemento de la referencia | Hoy en la app | Gravedad |
|---|---|---|
| Buscador = **3 filas y un botón** | Formulario de 3 **bloques** con etiquetas `DÓNDE` / `CUÁNDO` / `QUIÉN Y CUÁNTAS HABITACIONES`, cada uno en su marco, **dentro** de la lista | **Crítica** |
| La **home** lleva buscador **y** lista debajo (foto 1) | Cierto — pero el formulario ocupa ~1.000 px antes de la primera tarjeta, así que no se parece a la referencia. **Corrige D1** (§10.2) | **Alta** |
| Tarjeta: foto manda, nombre sin pisarse con el precio | Foto solo en algunos hoteles; nombre truncado; `2.000 XAF` + `por noche · desde` en dos renglones a la derecha | **Alta** |
| Una habitación se elige **dentro** de la ficha | Se elige en la lista (botón azul por habitación) | **Alta** (ver decisión D2) |
| Fila de orden y filtros | Un chip `Precio` sin función visible y `2 alojamiento(s)` en texto plano | **Alta** |
| Nota con respaldo (cifra + nº + cita) | Existe el chip (`lifebook-hotel-detalle.tsx`) y la tarjeta ya se gatea por `ratingPublished`; **falta en la lista** | Media |
| Fecha/ocupación en una línea | Dos cajas + contador + botón aparte | Media |
| Barra de pestañas pegajosa en la ficha | No hay | Media |
| Política como **fecha y hora** concretas | Hoy es texto plano en la ficha | Media |
| Fotos por zona en la ficha | No hay | Media (necesita campo) |
| Mapa con precios en resultados | No hay vista de mapa en resultados (sí hay MapLibre en la reserva) | Baja |
| Estados de escasez (`仅剩最后1间`) | No hay | Baja `[?]` |

---

## 6. El plan, pantalla por pantalla

**Alcance de esta fase: el flujo del huésped, de la entrada a la reserva cerrada**
(es lo que pidió el usuario: «desde el inicio hasta reservar una habitación»). El panel
del hotelero (7 pantallas) va después y **no se toca** ahora.

| # | Pantalla | Fichero hoy | Decisión propuesta | Datos nuevos |
|---|---|---|---|---|
| **P1** | **Entrada / buscador de alojamiento** | `app/lifebook-hotel.tsx` (26 KB) | Destino (1 línea) + fechas/ocupación (**1 línea**) + **un CTA**. La lista **sale** de esta pantalla. Al buscar, el buscador se colapsa a barra resumen. | Ninguno |
| **P2** | **Resultados (lista + orden + filtros)** | `app/lifebook-hotel-resultados.tsx` | Es *la* pantalla de lista: fila de controles (`Orden · Precio · Estrellas · Filtros`), y la tarjeta con la foto mandando. **Leído en `api/hotel.ts:403-419`:** el cliente **sí** manda `minPrice`/`maxPrice` (y `page`) — el filtro de precio se puede hacer **ya**; **no** existe `sort`: **ordenar exige tocar el backend**, así que la fila de controles sale en P2 **sin el control de orden** o con el orden hecho en el cliente sobre la página recibida. | Ninguno para el precio; backend para el orden |
| **P3** | **Tarjeta de resultado** | `components/HotelResultCard.tsx` | Foto a la izquierda, nombre a 2 líneas, nota con respaldo, 1-2 etiquetas, **un** precio «desde». Las habitaciones se reducen a **una línea** informativa, sin botón (ver D2). | Ninguno |
| **P4** | **Fechas de la estancia** | `app/lifebook-hotel-fechas.tsx` | Ya funciona y está razonada (el calendario tuvo que salir del buscador porque las celdas caían bajo la barra del sistema: y≈2260 de 2374). Se repasa, no se rehace. | Ninguno |
| **P5** | **Ficha del alojamiento** | `app/lifebook-hotel-detalle.tsx` (42 KB) | Cabecera con foto grande; **barra de pestañas pegajosa** (`Habitaciones · Opiniones · Servicios · Entorno`); fuera el calendario de dentro de cada habitación (se toca la habitación → P6). | Fotos por zona |
| **P6** | **La habitación — pantalla propia (NUEVA)** | **no existe**: hoy es un acordeón (`lifebook-hotel-detalle.tsx:465`) | La habitación deja de desplegarse dentro de la ficha y **navega**: fotos, datos en filas, instalaciones, precio de entre semana **y de fin de semana**, y las condiciones (cancelación, confirmación, señal, bloqueo). **Todo con campos que ya existen** — ver §6.1. | **Ninguno** |
| **P7** | **Rellenar el pedido** | `lifebook-hotel-reservar.tsx` (35 KB) | Se repasa tras P6: el desglose ya existe; el orden de la información (quién, cuándo llega, cuánto ahora y cuánto al llegar) es lo que se alinea. | Ninguno |
| **P8** | **Confirmación del pedido** | dentro de `reservar` (`269-356`) | Ya tiene código, desglose y cuenta atrás. Se repasa el orden (primero qué ha pasado, luego cuánto, luego qué hacer). | Ninguno |
| **P9** | **Mis reservas y estado** | `-reservas.tsx`, `-reserva.tsx` | Ya con línea de tiempo, mapa, chat y cancelar con motivo. Se alinea el lenguaje con P6. | Ninguno |
| **P10** | **Valorar la estancia** | `lifebook-hotel-resena.tsx` | C-1 la dejó hecha y medida. **No se toca.** | Fecha de estancia en la reseña |

**Orden de ejecución:** P1 → P3 → P2 → P5 → **P6** … Cada una termina **en el móvil**, no
en el `tsc`.

### 6.1 P6 con detalle: la pantalla de la habitación (lo primero que pidió ver el usuario)

El usuario, ante las decisiones D1/D2/D3, respondió: **«primero preséntame cómo se ve una
habitación al hacer clic en ella»**. Y la respuesta tiene un hallazgo detrás:

> **Hoy, al tocar una habitación, no ocurre ninguna navegación.** Se despliega. Y los datos
> de la habitación se enseñan **en prosa**, no en filas.

**Decisión propuesta (P6-bis): la habitación gana pantalla propia.** Fichero nuevo, ruta
plana con prefijo, p. ej. `app/lifebook-hotel-tipo.tsx` (el **tipo de habitación** del
huésped — no confundir con `lifebook-hotel-habitacion.tsx`, que es el alta del **hotelero**).
La tarjeta de la ficha deja de ser un acordeón: pasa a ser **una fila compacta con foto,
nombre, dos datos y precio**, y **navega**.

**Lo que se enseña, y de dónde sale cada cosa — `api/hotel.ts:117-160`, leído:**

| Bloque de la pantalla | Campo real | ¿Existe? |
|---|---|---|
| Fotos (grande + tira de miniaturas) | `images: { url }[]` | **Sí** — el hotelero ya las sube |
| Capacidad | `capacity` | Sí |
| Camas | `beds: { kind, count }[]` | Sí |
| Superficie | `sizeM2` (puede ser `null` → no se pinta la fila) | Sí |
| Instalaciones | `amenities: string[]` | Sí |
| **Precio entre semana** | `basePriceXaf` | Sí |
| **Precio de viernes y sábado** | `weekendPriceXaf` | **Sí — y hoy no se enseña en ninguna pantalla** |
| Limpieza y tasas | `cleaningFeeXaf`, `taxesXaf` | Sí (ya se usan en el desglose de la ficha) |
| Estancia mínima / máxima | `minNights`, `maxNights` | Sí |
| Cancelación gratis | `cancellationHours` | Sí (hoy, en prosa) |
| El hotel confirma | `confirmationHours` | Sí (hoy, en prosa) |
| Señal | `depositPercent` | Sí |
| Reserva guardada | `holdMinutes` | Sí |
| Descripción | `description` | Sí |

**Conclusión importante: esta pantalla NO necesita ningún campo nuevo en el servidor.** Se
construye entera con lo que la API ya devuelve. Es, por tanto, el mejor candidato a primer
trabajo de código después de P1.

**Dos matices que no se pueden maquillar:**

1. `cancellationHours` es un **número de horas**, no una hora del día. Para escribir
   «cancelación gratis hasta el 12 oct, 18:00» hay que **decidir el punto de referencia**
   (¿la hora de entrada del hotel? ¿las 00:00 de la llegada?). Mi propuesta prudente para
   la primera versión: **decir la antelación con exactitud** («hasta 48 h antes de la
   entrada») y **añadir la fecha calculada** solo si el punto de referencia se cierra con
   el hotelero. Nunca inventar una hora.
2. Meituan usa `仅剩最后1间` (queda 1). Aquí el equivalente honesto es `totalUnits` y
   `freeUnits` con fechas: **«2 de 3 libres para estas noches»**, que es un dato, no presión.


---

## 7. Las decisiones que hacen falta

> **Estado a 27-sep, por la tarde.** D1, D2 y D3 quedaron sin contestar en su momento —el usuario
> pidió **ver antes la pantalla de la habitación**— y de ahí nació D6.
>
> **Resueltas con la foto 1 delante** (las cinco, aprobadas por el usuario):
> **D1** — **corregida**, y esta vez con la foto como prueba: la home **conserva** la lista (§10.2);
> **D2 = (b)** — las habitaciones se resumen a **una línea**, sin botón;
> **H1** — el destino es un **selector de ciudades**, no un campo de texto;
> **H2** — la fila de controles lleva **`Cerca de mí` + `Precio`** (y nada más, porque nada más tiene dato);
> **H3** — **home con lista**, y `/lifebook-hotel-resultados` pasa a «ver la lista completa».
>
> **Implementadas** en `783ad75` (7 ficheros, +752/−496) — el detalle, en §10.4.
> **Siguen abiertas:** D3, D4, D5, D6 y D7.

**D1 — ¿La lista vive en la entrada o en su propia pantalla?** *(corregida el 27-sep con la
foto 1 delante — ver §10.2)*
Este documento afirmaba «Meituan hace eso [separar]». **La foto 1 lo desmiente**: la home
de Meituan lleva buscador **y** lista debajo, con su fila de filtros en medio. El defecto de
la app no es tener lista en la entrada: es tener **un formulario de ~1.000 px delante**.
Propuesta corregida: la home **conserva** la lista, el buscador se compacta a **3 filas +
un CTA**, y `/lifebook-hotel-resultados` pasa a ser «ver todos» (o se retira del flujo).

**D2 — ¿Qué pasa con las habitaciones dentro de la tarjeta de la lista?**
El documento del 12-sep lo apuntó como *«mejor que Meituan»*, y no lo discuto: el dato es
útil. El problema es **la forma** — tres filas tocables con botón azul dentro de cada
hotel. Tres opciones:
- **(a)** Quitarlas y dejarlas solo en la ficha. Es lo que hace Meituan. La lista queda
  corta y legible; se pierde ver el precio de la más barata sin abrir.
- **(b) Recomendada:** dejarlas como **una línea de texto**, sin botón: `3 tipos · desde
  18.000 XAF · 2 libres`. Se conserva la información (que es la ventaja frente a Meituan)
  y desaparecen cinco botones por pantalla.
- **(c)** Dejarlo como está. **No lo recomiendo**: es la causa nº 1 de que la pantalla se
  vea como un formulario.

**D3 — ¿La entrada enseña lista sin fechas?**
Hoy sí (`_c1-02`: «Sin fechas: elige días para ver el p…» + `2 alojamiento(s)`).
Propuesta: **no**. Sin fechas, la pantalla es el buscador y nada más; el precio depende de
las fechas, y enseñar una lista sin precio es enseñar una lista que no sirve.

**D4 — ¿Hace falta el grupo de pestañas de la ficha?**
Propuesta: sí, con **4** (`Habitaciones · Opiniones · Servicios · Entorno`) — Meituan tiene
esas cuatro más `预订`. Sin datos de «entorno» (distancia a puntos de interés) habría que
alimentarla o quitar `Entorno`.

**D5 — ¿La opinión enseña la fecha de estancia?**
Propuesta: sí (`消费后评价` + `2026/03入住`). El vínculo reserva→reseña **ya existe**
(`reviewId`), así que es barato y es lo que convierte una opinión en creíble.

**D6 — ¿La habitación gana pantalla propia, o se queda desplegándose en la ficha?**
Propuesta: **pantalla propia** (§6.1). Es lo que pidió ver el usuario, sale **sin campos
nuevos**, y es lo único que quita de la ficha los calendarios anidados. La alternativa
—dejar el acordeón pero con los datos en filas— arregla la mitad del problema: tres
habitaciones abiertas siguen siendo tres calendarios.

**D7 — La hora exacta de la cancelación gratis.**
`cancellationHours` son horas, no una hora del día. Decidir el punto de referencia antes de
escribir «hasta el 12 oct, 18:00». Mientras no se decida: **antelación exacta** («48 h antes
de la entrada»), nunca una hora inventada.

---

## 8. Cómo se verifica esto (reglas ya vigentes, no nuevas)

- El JS va **dentro del APK**: todo cambio visual exige `assembleRelease` (`assembleDebug`
  no prueba nada), instalar y **medir en el móvil**.
- La instalación se verifica **por bytes**, no por el mensaje.
- El color se comprueba **por diferencia** contra un **control gris de token conocido en el
  mismo fotograma** — el framebuffer no está en sRGB (Display P3), así que comparar contra
  el hex del código da fallo falso.
- `exec-out screencap -p` **puede truncar el PNG en silencio**: comprobar tamaño antes de medir.
- Antes de comparar ningún `mtime`: **commit**.
- **Trinquete** que no puede empeorar: `hex 0 · fontSize 0 · borderRadius 0 · fontWeight 0 ·
  borderWidth 5 · espaciado 183 · precioFigura 5 · strokeWidth 0`.
- **El GPS solo vive dentro de Guinea Ecuatorial.** `api/locate.ts:18-20` (`isInsideGq`)
  devuelve `null` si el aparato está fuera del bbox del país — es regla de negocio, no un
  fallo. Cualquier control de «cerca de mí» **no se puede medir desde Guilin**: se verifica
  con el origen puesto a mano o con el estado deshabilitado y su explicación.

---

## 10. La HOME, bloque a bloque — foto 1 del recorrido

`D:\wechat\…\c574a576…jpg` (la foto que envió el dueño del producto). Instrucción de
alcance que la acompaña, literal: **«ignora los otros servicios que aparecen en el header
como vuelos y otros, sólo los de hoteles»**. Se lee, por tanto, como pantalla **de
alojamiento**, y se descartan los tres accesos hermanos (`机票火车票` vuelos y tren,
`景点游玩` entradas, `旅游度假` vacaciones).

### 10.1 La pantalla, bloque a bloque

| # | Bloque de la foto | Contenido | ¿Tiene dato en la app? |
|---|---|---|---|
| 0 | Cabecera azul con el título | `酒店旅行` + icono | Sí — hoy `Alojamiento` + `Mis reservas` |
| 1 | Servicios hermanos | `酒店民宿 · 机票火车票 · 景点游玩 · 旅游度假` | **NO** — **fuera de alcance por instrucción expresa** |
| 2 | Tipo de alojamiento | `国内 · 民宿 · 钟点房 · 短租 · 海外` | **NO.** `HotelSummary` (`api/hotel.ts:23-58`) no trae tipo; `propertyKind` solo está en el perfil (ficha) |
| 3 | **Destino** | ciudad + lupa (`位置/品牌/酒店`) + GPS | **Sí, con matiz**: la API filtra por `city` **exacta**; la lista real de ciudades está en `constants/lifebook.ts:154-157` (~30). El GPS existe (`api/locate.ts`) |
| 4 | **Fecha y ocupación en UNA línea** | `09.26 住 — 09.27 离 · 共1晚 · 1间·1成人`, cada trozo con chevron | **Sí** — hoy son **dos cajas + contador de noches + aviso + botón**, repartidos en `lifebook-hotel.tsx:224-317` |
| 5 | **Un botón** | `找酒店` | **No existe.** Hoy la búsqueda se dispara sola (`useEffect`, `:94`) y el único botón es `Ver la lista de resultados` (`:365`) |
| 6 | Tira promocional | `学生专享…每周四抽免房券` | **NO** — no hay promociones. Sustituible por una frase de confianza **real** (pago al llegar · señal) |
| 7 | Tres accesos grandes | `特价酒店 · 酒店团购 · 周末去哪` | **NO** — no hay ofertas ni cupones |
| 8 | Fila de orden y filtros | `附近5公里内 · 智能排序 · 价格·星级 · 筛选` | **A medias**: precio **sí** (`minPrice`/`maxPrice`); «cerca» **sí** en cliente (`lat`/`lng` en `HotelSummary`); orden **no** (`sort` no existe); estrellas **no** en la lista |
| 9 | Tarjeta de hotel | foto + nombre + `经济型` + `4.7 棒` + cita + `距您直线1.1公里` + servicios + ranking + `¥86` `¥62起` + chip `神券` | **A medias**: foto, nombre, ciudad y distancia sí; `经济型` no; nota solo si `ratingPublished`; cita, ranking y cupón **no** |
| 10 | Barra inferior de 5 | `酒店旅行 · 收藏/浏览 · 旅行助手 · 行程/订单 · 我的` | Fuera de alcance (navegación global) |

### 10.2 Lo que la foto **corrige** de este documento

1. **D1 estaba mal.** «Meituan separa el buscador de la lista» es falso: la foto 1 muestra
   la lista **en la misma pantalla**, debajo del buscador y de su fila de filtros.
2. **La fecha y la ocupación no son tres bloques.** En la referencia son **una línea de
   tres trozos** con chevrones; en la app son dos cajas, un contador, un aviso y un botón.
3. **Buscar es un acto, no un efecto.** Al dispararse sola (`useEffect`), el usuario no sabe
   cuándo ha buscado ni qué se recargó.

### 10.3 La propuesta para la home (estructura de Meituan, tokens del kit)

- **Panel de búsqueda: una tarjeta, 3 filas.**
  · fila 1 **destino** — abre una hoja con la lista real de ciudades (`constants/lifebook.ts`)
    y «Todas»; nada de texto libre, porque la API filtra por `city` **exacta**;
  · fila 2 **una línea**: `26 sep 住 — 27 sep 离 | 1 noche | 1 hab · 2 huésp.`, cada trozo
    abre su hoja (fechas / ocupación);
  · fila 3 **CTA único**: `Buscar alojamiento`.
- **Fila de filtros** con lo que existe de verdad: `Cerca de mí` (distancia calculada en
  cliente sobre la página recibida) y `Precio` (`minPrice`/`maxPrice` → API). **No** se
  pintan estrellas ni orden por nota: no hay dato.
- **La lista, debajo** — como la foto 1. `/lifebook-hotel-resultados` no desaparece: pasa a
  ser «ver todos».
- **La tarjeta** (P3): foto mandando, nombre a dos líneas, ciudad + distancia, nota **solo si
  `ratingPublished`**, un precio «desde» y **una línea** de habitaciones (D2-b).

### 10.4 Lo implementado en `783ad75` (P1 de la home)

**Verificado antes de tocar código** — las cuatro redes, en este orden:

| Red | Resultado |
|---|---|
| `tsc -p tsconfig.json` | **0 errores** |
| `pruebas/verifica-diseno.cjs` | trinquete **idéntico**: `hex 0 · fontSize 0 · borderRadius 0 · fontWeight 0 · borderWidth 5 · espaciado 183 · precioFigura 5 · strokeWidth 0` |
| `pruebas/c1-verifica-app.cjs` | **TODO OK** |
| Revisión de los dos llamadores de la tarjeta | 2 reales (`lifebook-hotel.tsx`, `-resultados.tsx`); el resto son `_respaldo-*` |

**Qué ficheros, y qué cambia en cada uno**

| Fichero | Estado | Qué hace |
|---|---|---|
| `app/lifebook-hotel.tsx` | **reescrito** | El buscador: una tarjeta con **3 filas** (destino · llegada/salida/noches/hab-huésp en **una línea de 4 celdas** · **un botón**) y la **fila de controles** (`Cerca de mí`, `Precio`). La lista se queda debajo. |
| `components/HotelResultCard.tsx` | **reescrito** | Fuera las filas de habitación con su botón. Foto **92 → 104 px**, nombre a 2 líneas, `barrio · ciudad · distancia`, chip de nota **solo si `ratingPublished`**, **una línea** de habitaciones y **un** precio «desde». La tarjeta entera es el botón que abre la ficha. |
| `components/hotel/HotelCitySheet.tsx` | **nuevo** | La hoja de ciudades, leída de `constants/lifebook.ts` (`LB_CITIES`). Cierra el agujero del texto libre. |
| `components/hotel/HotelGuestsSheet.tsx` | **nuevo** | Los dos contadores, que salen del formulario y pasan a una hoja. |
| `components/hotel/HotelPriceSheet.tsx` | **nuevo** | `minPrice`/`maxPrice` con `FormField` + `PrimaryButton` + `GhostButton` del kit (el patrón que ya estaba probado en `-resultados.tsx`). |
| `utils/distancia.ts` | **nuevo** | `havKm` + `etiquetaDistancia`. |
| `app/lifebook-hotel-resultados.tsx` | tocado | Se adapta a la tarjeta sin `onReservar`. |

**Dos decisiones de ejecución que conviene no volver a discutir**

1. **La búsqueda dejó de dispararse sola al tocar cualquier criterio.** Se busca al entrar, al
   cambiar las **fechas** (que es lo que mueve el precio) y al pulsar el botón. Antes, tocar un chip
   recargaba la lista sin que el usuario hubiera pedido nada.
2. **`havKm` se escribe una vez, pero `taxi.tsx` conserva la suya.** Migrarla toca la pantalla del
   conductor y tiene su propia verificación: es **deuda declarada**, no un olvido.

**Lo que la guardia de C-1 obligó a corregir.** Después de reescribir la tarjeta, `c1-verifica-app.cjs`
**falló** en «la tarjeta gatea la cifra por `ratingPublished`»: la guardia exige que la condición y el
`toFixed(1)` estén a menos de 120 caracteres, y al pasar la nota a JSX anidado se separaban. En vez de
**ablandar la guardia**, se extrajo la nota a una variable `const nota = hotel.ratingPublished ? …`.
La puerta sigue donde estaba, la comprobación sigue midiendo lo mismo y el JSX queda más corto.

### 10.5 Lo medido en el móvil (27-sep, 20:01)

**APK:** `BUILD SUCCESSFUL in 2m 44s` · **116.852.653 B** · sha256
`de6ac24294c41f8e84f4f0c49aa8298053f7e0132badcd95327118629da69037`.

**Instalación verificada por BYTES** (no por el mensaje): el `base.apk` del dispositivo da el **mismo
sha256** y los **mismos 116.852.653 B**. Lo que se mide es lo que se compiló.

**Un matiz que no se maquilla:** `firstInstallTime` = `lastUpdateTime` = `2026-09-27 19:55:48` ⇒ fue
una instalación **fresca**, no una actualización en sitio (en C-1 sí diferían). Aun así **la sesión se
conservó**: la app abrió directamente en el alojamiento, sin pasar por el acceso.

| Qué | Medido en el píxel |
|---|---|
| Panel de búsqueda | destino `y=386-456` · celdas `y=525-649` · CTA `Buscar alojamiento` `y=718-785` |
| Controles | `Cerca de mí` y `Precio` en `y=936-993` |
| **Primera tarjeta** | `y=1413` (el nombre, `y=1413-1547`) |
| Botones «Ver fechas» | **CERO** en el volcado — desaparecieron los cinco de `_c1-01` |
| Tarjeta | nombre **entero** (`Hotel Demo Malabo ✓`, `Tienda Hotel 079171`), `Paraíso · Malabo`, `7 tipos de habitación`, un precio `25.000 XAF · por noche · desde` |
| Chip de nota | **no sale** — correcto: `ratingPublished` es falso con 0 reseñas |
| Hoja de ciudades | `¿Dónde buscas?` con `Malabo`, `Bata`, `Luba`, `Riaba`, `Mbini`, `Corisco`, `San Antonio de Palé`… |
| Hoja de precio | `Desde (XAF)` · `Hasta (XAF)` · `Aplicar` · la nota de «antes de limpieza y tasas» |
| Tarjeta → ficha | funciona: abre el alojamiento con `Habitaciones (1)`, horario y formas de pago |

**Y una predicción que se cumplió, medida.** Al tocar `Cerca de mí` **desde Guilin**, la pantalla
responde, palabra por palabra, lo que §8 y §10.6 anunciaban:

> «No he podido situarte. La ubicación sólo funciona dentro de Guinea Ecuatorial; puedes elegir una
> ciudad y buscar igual.»

El control **no se queda encendido** mintiendo y la lista no se rompe. Es exactamente el
comportamiento que `isInsideGq` (`api/locate.ts:18-20`) obliga, y confirma que **«cerca de mí» no se
puede medir de verdad desde aquí**: sólo su estado deshabilitado.

**Lo que NO se ha medido, y por qué:**
- **`Cerca de mí` funcionando** (orden por distancia y `a 1,1 km` en la tarjeta): imposible desde China
  por el bbox del país. Se medirá donde haya posición, o con el origen puesto a mano.
- **El filtro de precio aplicado** (pulsar `Aplicar` con un rango y ver la lista cambiar): la hoja se
  abrió y se capturó, pero no se aplicó un rango en esta sesión. El camino contra el servidor ya estaba
  probado en `/lifebook-hotel-resultados`.
- **La comparación de altura contra el APK anterior**: la lista empieza en `y≈1413`, pero **no hay una
  medida del «antes»** con el mismo método, así que no se afirma cuánto se ganó. Lo que sí está medido
  es lo que hay delante de la primera tarjeta: los controles (`y=936`), el contador de resultados
  (`y=1067`) y el botón `Ver la lista completa` (`y=1241-1308`) — **ese botón es el candidato evidente
  a desaparecer** en la próxima pasada, porque la lista ya está justo debajo y se come ~250 px.

### 10.6 Dos trampas que esta pantalla destapa

1. **«Cerca de mí» no se puede probar desde Guilin** (§8): `isInsideGq` devuelve `null` fuera
   del país. Se mide con el origen puesto a mano, o midiendo el estado deshabilitado.
2. **El campo de ciudad de hoy acepta texto libre y la API no.**
   `lifebook-hotel.tsx:205-214` manda lo tecleado tal cual como `city`; «Malab» no devuelve
   nada. El selector de la propuesta elimina el problema de raíz.

---

## 9. Lo que este documento **no** afirma

- **No** se ha medido el tramo B completo foto a foto en esta sesión (orden, filtros y
  mapa): su detalle se re-verificará con las fotos 11-14 delante **cuando se diseñe P2**.
- **No** se ha comprobado si la API de búsqueda admite ordenación (`sort`). Se sabe que
  admite `minPrice`/`maxPrice`; para lo demás, **leer `api/hotel.ts` antes de prometerlo**.
- **No** hay medida de las pantallas del hotelero en este documento: están fuera de alcance.
- Dos cosas de la API que se han **leído** en esta sesión y que acotan el plan:
  el cliente manda `minPrice`/`maxPrice`/`page` (`api/hotel.ts:403-419`) pero **no existe
  `sort`** — ordenar exige backend. Y el hallazgo ya anotado en la fase C sigue en pie:
  `searchHotels` **acepta `amenities` y no la usa**, y `stars` ni se acepta, así que
  **no se puede prometer un filtro de instalaciones** hasta que el servidor lo aplique.
