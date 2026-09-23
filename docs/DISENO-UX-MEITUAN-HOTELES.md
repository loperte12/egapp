# ESTRUCTURA UX/UI — MEITUAN HOTELES (reservas)

> Documento de referencia para Life Book. Escrito el 2026-09-12.
>
> **Límites de esta fuente, leídos primero:**
> - No se ha inspeccionado la app de Meituan en un dispositivo. Este documento se
>   construye con **fuentes públicas**: documentación oficial de Meituan (marcadas
>   `[MT]`), artículos y análisis de producto (`[3P]`), y estructura genérica de OTA
>   cuando el detalle concreto no está documentado (`[INF]` = inferencia, **no
>   verificada**).
> - Lo que está marcado `[MT]` es fiable. Lo marcado `[INF]` describe **posición y
>   agrupamiento visual probable**, no medido. Antes de maquetar a partir de un
>   `[INF]`, conviene confirmarlo con capturas reales de la app.
> - Meituan **no es una app independiente**: el módulo hotel vive dentro de la app
>   Meituan (paquete `com.sankuai.meituan`, versiones actuales v12.57.203 /
>   v12.58.203) y también en Dianping. Hubo un cliente propio histórico (Android
>   v3.3, iOS v2.3) que ya no es la vía principal; desde el 2024-09-04 hay además
>   mini-programa en Alipay. `[MT]`
>
> **Convención:** cada pantalla se describe como jerarquía de bloques (de arriba a
> abajo), con sus elementos y su función de conversión.

---

## 0. Arquitectura general del módulo

```
App Meituan
├── Home → icono «酒店/民宿»           ← entrada principal
├── Tab inferior «旅行»                ← entrada secundaria
├── Buscador superior → «酒店»          ← entrada por búsqueda
└── [Hotel]
    ├── A. Buscador (destino + fechas)
    ├── B. Lista de resultados  ⇄  B'. Modo mapa
    ├── C. Ficha del hotel (detalle)
    │     └── C1. Lista de tipos de habitación  ← se elige AQUÍ, no en una pantalla aparte
    ├── D. Rellenar pedido (填单页)
    ├── E. Pago
    ├── F. Confirmación / estado del pedido
    └── G. Mis pedidos → detalle de reserva → cancelar / reembolsar

Lado B (otra app: 美团酒店商家版 / PMS web)
    ├── H. Panel del hotelero
    └── I. Gestión de habitaciones y calendario
```

**Decisión estructural clave:** Meituan **no** tiene una pantalla separada de
selección de fechas antes de ver resultados. Las fechas se fijan en el buscador
(A) y se pueden cambiar desde una barra persistente en B y C. `[MT]` para el
buscador; `[INF]` para la barra persistente.

> Life Book sí la tiene: `app/lifebook-hotel-fechas.tsx` existe como pantalla
> intermedia, y el comentario en su cabecera explica por qué — el calendario
> quedó inaccesible bajo la barra de navegación. Es una adaptación legítima a
> expo-router + teclado RN, no un defecto. Ver §10.

---

## A. Buscador

| Elemento | Detalle | Fuente |
|---|---|---|
| Campo **destino** | Acepta ciudad, zona turística (景区), distrito comercial (商圈) o **nombre concreto de hotel**. Placeholder tipo «请输入城市/景区/商圈/酒店名称» | `[MT]` |
| **Check-in / check-out** | Toca el calendario; admite varias noches seguidas; el sistema calcula los días de estancia y bloquea que la salida sea anterior a la llegada | `[MT]` |
| **Ocupación** | Adultos + niños (en la variante web de competidores aparece «1 adulto 0 niños»); Meituan lo gestiona en el rellenado del pedido | `[MT]` / `[3P]` |
| Botón **«查找酒店»** | CTA único y dominante | `[MT]` |
| Localización actual | El destino admite usar la posición GPS en vez de teclear | `[3P]` |

**Nota de conversión:** el destino por **distrito comercial o punto de referencia**
(«cerca de la estación», «cerca del aeropuerto») es lo que permite el filtro de
posición posterior. Sin esa granularidad en el buscador, el filtro de商圈 no
tiene datos. `[MT]`

---

## B. Lista de resultados

### B.1 Barra de filtros y ordenación

Filtros disponibles (todos documentados como estándar del módulo) `[MT]`:

| Grupo | Opciones |
|---|---|
| **Precio** | Rango por noche; **slider arrastrable o entrada manual** de mínimo y máximo |
| **Estrellas** | 3★ a 5★ |
| **Tipo de hotel** | Negocios, vacacional,民宿 (homestay), temático, apartotel |
| **Puntuación** | «4.5 分及以上», «4.8 分及以上» |
| **Instalaciones** | Wi-Fi gratis, parking, piscina, gimnasio, desayuno, agua caliente 24 h, aire acondicionado |
| **Posición y商圈** | Estación de tren, aeropuerto, zona turística, centro, distrito concreto |
| **Distancia** | Rango desde un punto (p. ej. «a menos de 2 km del centro») |
| **Etiquetas de política** | **«免费取消»** (cancelación gratis) es filtro de primer nivel, no solo una etiqueta |

Ordenación `[MT]`: **智能排序** (combina popularidad + precio + puntuación), precio
ascendente, precio descendente, puntuación descendente, distancia ascendente.

### B.2 Modo mapa

Alternativa a la lista: ver los hoteles sobre el mapa con su **posición relativa a
nodos de transporte y atracciones**. `[MT]`

### B.3 Tarjeta de hotel — anatomía

```
┌─────────────────────────────────────────────┐
│ [FOTO]  Nombre del hotel + sufijo de zona   │  ← la foto define el clic
│         ★ 4.8  ·  「etiqueta larga」         │
│         「提前入住」「免费升房」  ← 权益 cortos │
│         📍 distancia · 商圈                  │
│         [性价比分析] ← módulo propio          │
│                          ¥XXX  起 / noche    │  ← precio de entrada (引流价)
└─────────────────────────────────────────────┘
```

**Lo que Meituan documenta explícitamente como palanca de conversión en lista** `[MT]`:

1. **Calidad de la primera foto**: alta resolución, estética, **formato vertical
   3:4**,优先 fachada nocturna o vista completa de la habitación. Evitar fotos
   oscuras, borrosas o **solo del baño**.
2. **Nombre + palabra de localización**: el sufijo del nombre debe indicar el商圈 o
   el punto de referencia, dentro del rango de kilómetros que exige la plataforma.
3. **Puntuación y etiquetas**: la puntuación afecta directamente al tráfico que
   recibe el filtro. 4.9+ es lo óptimo. Las **etiquetas largas** son palabras de
   recomendación que el sistema extrae de las valoraciones de usuarios; las
   **etiquetas cortas del centro de derechos** (提前入住 = check-in anticipado,
   免费升房 = mejora de habitación gratis) se muestran con prioridad.
4. **Listas/rankings y precio de entrada**: aparecer en un榜单 aumenta tráfico; el
   precio mostrado en lista (引流价) es el factor de clic principal.
5. **Módulo de análisis de relación calidad-precio** (性价比分析): añadido tras
   pedir los usuarios poder comparar hoteles de forma直观. Un algoritmo combina
   precio + puntuación + instalaciones y devuelve una referencia de valor. `[3P]`

---

## C. Ficha del hotel (detalle)

### C.1 Secciones

| Bloque | Contenido | Fuente |
|---|---|---|
| **Galería** | Fotos, con acceso a las **subidas por usuarios** (实拍图). Foco recomendado en **tipo de cama, ventana y baño** | `[MT]` |
| **Datos del hotel** | Nombre, dirección, teléfono, estrellas, **fecha de última reforma** (装修时间) | `[MT]` |
| **Instalaciones** | Lista completa de servicios | `[MT]` |
| **Transporte / mapa** | Mapa de交通 y posición relativa | `[MT]` |
| **Valoraciones** | Con peso especial a las de los **últimos 30 días con foto**. Temas que la gente busca: aislamiento acústico, agua caliente, Wi-Fi | `[MT]` |
| **Resumen IA** | «一句话概要» generada por LLM: p. ej. *«instalaciones nuevas, cerca del metro, pero el desayuno tiene cola en horas punta»*. Muestra también **si el hotel ha corregido** lo que un cliente señaló (p. ej. poca variedad de desayuno → el hotel lo mejora y se marca主动) | `[3P]` (2026-04) |
| **Política de cancelación y garantías** | Reglas por tipo de habitación; plan «安心住» (higiene verificada +退改 más flexible) | `[MT]` / `[3P]` |

> **装修时间 (fecha de reforma)** está documentado como factor que afecta a la
> **conversión secundaria** (detalle → pedido). Es un dato barato de pedir al
> hotelero y caro de omitir. `[MT]`

### C.2 Lista de tipos de habitación — el corazón de la ficha

Meituan resuelve la elección de habitación **dentro de la ficha**, no en una
pantalla nueva. Cada tarjeta de habitación lleva `[MT]` / `[3P]`:

```
┌──────────────────────────────────────────────────┐
│ [FOTO]  「浪漫大床房」 ← nombre con palabra de venta │
│         大床 1.8m | 20 m² | 2 adultos              │
│         ✅ desayuno incluido / ❌ sin desayuno      │
│         🪟 con ventana                             │
│         ⚡ 立即确认 (confirmación inmediata)         │
│         🆓 免费取消 hasta hoy 18:00  ← CON HORA     │
│         [etiquetas de房型]                          │
│                                    ¥268  ¥199 起    │
│                                    [在线付] [预订]   │
└──────────────────────────────────────────────────┘
```

Palancas documentadas en detalle → pago `[MT]`:

- **Imágenes de房型 ordenadas por calidad**, mejor foto primero.
- **Nombre del房型 con sufijo de conversión** (转化词): no «大床房» sino
  「浪漫大床房」. Extraer el punto de venta del nombre sube el deseo de reservar.
- **Tipo y tamaño de cama + superficie + política de cancelación**: deben ser
  exactos y transparentes. En temporada baja, **relajar la cancelación** o activar
  **极速退款** (reembolso inmediato) mejora la experiencia y la conversión.
- **Paquetes y derechos**: 非凡产品,套餐团购 (paquetes con extras), 免费升房.
- **Habitaciones reservadas (预留房)** permiten mostrar **「立即确认」**, lo que
  **reduce la ansiedad de espera** del usuario. Es el mecanismo que convierte una
  reserva incierta en una inmediata.
- **Desglose de desayuno**: sin desayuno / desayuno para 1 / para 2 / para 3+ /
  con paquete — cada combinación es **una fila distinta con su precio**, no un
  atributo del房型. `[3P]`

---

## D. Rellenar pedido (填单页)

Campos exigidos `[MT]`:

| Campo | Regla |
|---|---|
| **Nombre del huésped** | Debe coincidir **exactamente** con el documento de identidad. Extranjeros: apellido primero, nombre después, en pinyin |
| **Tipo y número de documento** | 身份证号 obligatorio en el mercado chino |
| **Móvil** | Debe poder recibir SMS (ahí llega la confirmación) |
| **Menores** | Contacto del tutor + **prueba de la relación familiar** |
| **Nº de habitaciones y de huéspedes** | Con límites por pedido según el hotel |
| **Hora estimada de llegada** | Opcional |
| **Peticiones especiales** | Nota libre (cama grande, no fumadores, piso alto…) |

Antes de pagar se muestra el **desglose del pedido**: 房费 (habitación) + 服务费
(servicio) + **优惠抵扣** (descuentos aplicados). `[MT]`

Advertencia documentada: los房型 de **「限时特惠»** (oferta por tiempo limitado)
normalmente **no admiten cambiar fechas ni nombre del huésped**. `[MT]`

---

## E. Pago y confirmación

- **Métodos**: 在线付 (prepago), 到店付 (pago en recepción), garantía con tarjeta
  (congela fondos; se liberan al hacer check-in o se descuenta si no aparece).
  `[MT]`
- **Confirmación**: el pedido **solo es firme cuando lo confirma el proveedor**.
  Las habitaciones con etiqueta **「即时确认」** se confirman en minutos; el resto,
  **normalmente no más de 24 h**. El resultado llega por SMS o correo. `[MT]`
- **Servicio de garantía**: si tras la confirmación el hotel no puede alojar, o al
  llegar a la hora acordada no hay habitación → hotline 24 h **10107888**. `[MT]`
  Y la compensación está tasada `[MT]`:
  - Meituan coordina una habitación **del mismo nivel o superior** y **asume la
    diferencia**, con tope = el precio de la primera noche.
  - Si no puede, reserva en un hotel cercano del mismo nivel y asume la diferencia.

---

## F. Estados del pedido

Códigos de estado del flujo de pedidos de Meituan (API pública de la plataforma)
`[MT]`:

| Código | Estado |
|---|---|
| 1 | Usuario ha enviado el pedido |
| 2 | Pedido enviado al comercio |
| 4 | **Comercio ha confirmado** |
| 8 | Pedido completado |
| 9 | Pedido cancelado |

El comercio confirma llamando a `order/confirm`, y el estado pasa a 4. `[MT]`

> La variante **企业版** (corporativa) usa otra enumeración — 40 «商家已确认»,
> 90 «完成发货», 90/… — porque hereda el modelo de pedidos de la plataforma
> completa, no el de hotel. No mezclarlas. `[MT]`

---

## G. Cancelación y reembolsos — la jerarquía completa

Esta es la parte más detallada de la documentación oficial y la que más confianza
genera antes de pagar `[MT]`:

1. **30 minutos de desistimiento**: cancelación gratuita incondicional dentro de
   los 30 minutos posteriores a la confirmación. **Solo aplica** a productos que
   llevan la etiqueta «30分钟免费取消».
2. **Ventana de cancelación gratis**: los pedidos marcados «免费取消» se pueden
   cancelar自助 con reembolso íntegro dentro del plazo (24 h, 48 h antes de la
   llegada…).
3. **Penalización escalonada** (阶梯扣费): por tramos horarios; el estándar exacto
   lo marca la sección «取消规则» del pedido.
4. **No cancelable**: habitaciones特价 o en promoción pueden marcarse así; cancelar
   fuera de条件 puede costar **la primera noche o el importe completo**.
5. **Causas personales graves**: fallecimiento, hospitalización o fractura del
   huésped o de un **familiar directo** (padres, hijos, cónyuge) → se puede pedir
   la cancelación aportando justificante.
6. **Fuerza mayor**: vuelo cancelado, visado denegado, enfermedad grave repentina,
   desastre natural → devolución del importe o de la diferencia.
7. **Garantía de alojamiento**: la compensación por falta de habitación descrita en §E.

**Regla de UX que se deduce**: la política no es un texto legal al pie, es **una
fecha y una hora concretas** en la tarjeta de la habitación («cancelación gratis
hasta hoy 18:00») y un desglose de penalización **calculado** en el rellenado del
pedido. `[MT]` para el contenido; `[INF]` para la colocación.

---

## H. Valoraciones y sistema de confianza

- **Solo se puede valorar después de consumir** el servicio. `[MT]`
- Filtrado de valoraciones falsas con técnica + revisión humana; un **LLM bloquea
  pedidos simulados (刷单) y valoraciones negativas maliciosas**. `[MT]`
- En 2026-04 Meituan **actualizó el sistema de valoraciones con IA**: resumen de
  una frase, y exposición de **las mejoras que ha hecho el hotel** — el cliente no
  solo ve «cómo se estuvo», sino «en qué está mejorando». `[3P]`
- Dato de contexto citado por Meituan: **el 80 % de los huéspedes lee entre 6 y 12
  valoraciones** antes de reservar (estudio de Cornell). `[3P]`

---

## I. Promociones y cupones `[3P]` — fuente secundaria, sin verificar

Artículos de terceros describen: **签到 diario** con cupones (3 días seguidos →
«满150减20»; 7 días → «满300减50»), **满减 por tramos** (满200减30, 满300减50,
满500减100) y **限时秒杀** con descuentos de 3-5折. Son fuentes de marketing de
WeChat, **no documentación oficial**, y los importes concretos cambian por
campaña. Tratar como «existe un sistema de cupones y campañas temporales», no como
cifras fiables.

---

## J. Lado B — el panel del hotelero (美团酒店商家版 / PMS)

Aquí Meituan **no es una OTA, es un PMS completo**. La app del comerciante abre con
un **工作台** (escritorio) que muestra: datos de经营, mis pedidos, tareas
pendientes, y «ayer: 16 noches ocupadas». Accesos directos: 订单管理, **房态管理**,
产品价格, 获客宝, 推广通, 扫码返利, **评价管理**, 闲置房, 权益中心, 酒店助手. `[3P]`

### J.1 房态管理 — gestión de habitaciones físicas

Seis estados base, **por habitación individual** (no por tipo) `[MT]`:

| Estado | Significado |
|---|---|
| 空净 | Libre y limpia |
| 空脏 | Libre y sucia |
| 住净 | Ocupada, limpia |
| 住脏 | Ocupada, sucia |
| 维修 | En mantenimiento — **exige fecha de inicio, fin y motivo**, y queda en el log |
| 锁房 | Bloqueada: **no cambia el color pero impide la venta**; se desbloquea sola tras la夜审 (cierre nocturno), configurable |

Etiquetas automáticas `[MT]`: 空闲 (días sin ocupación, umbral configurable),
características de la habitación (安静 = silenciosa, 朝南 = orientada al sur),
超时 (si la hora de salida prevista ya pasó → **se marca en rojo**).

### J.2 房态助手 — el panel de operaciones

Tres columnas `[MT]`:

- **Izquierda — filtros**: edificio, planta, estado de habitación, llegadas/salidas
  de hoy, llegadas o salidas en los próximos 9 días, tipo de habitación, **canal**
  (Meituan, Ctrip…), **tipo de cliente** (individual, miembro, empresa, agencia),
  habitación de día completo / por horas / con impago.
- **Centro — lista**: búsqueda por número de habitación o por nombre,
  **lectura de la tarjeta de la cerradura**, etiquetas por fila (cliente
  individual, canal de origen, **cuenta atrás hasta la salida**, impago,
  habitaciones conectadas).
- **Derecha — acciones por lotes**: marcar limpia, marcar sucia, mantenimiento,
  bloquear, reservar, check-in. Además muestra **ocupación real y prevista** y las
  tareas OTA pendientes.

Desde el móvil: **abrir/cerrar habitaciones en cualquier momento** y
**aceptar pedido y reasignar habitación**. `[MT]`

### J.3 Precios, calendario y tipos de habitación

- **房价房量日历** (calendario de precios y disponibilidad): ruta
  `产品管理 → 房价房量日历`. Ahí se hace la **modificación masiva de precios** y se
  consulta el histórico de ajustes por acuerdo. `[MT]`
- **Orden de房型**: en ese mismo calendario, se arrastran para reordenar; tras
  reordenar, al editar precios los房型 se listan **de precio bajo a alto**. `[MT]`
- **Ajuste automático de precio**: `产品管理 → 酒店助手 → 经营助手`. Se filtra por
 房型, fecha de estancia y fecha de ajuste, se ve el histórico, y se puede **salir
  del programa o poner el ajuste a 0** para pararlo. `[MT]`
- **智能加优**: `产品管理 → 营销 → 智能加优`. `[MT]`
- **钟点房 (habitación por horas)**: `销售 → 钟点房房价`. Se eligen房型 concretos o
  todos; se fija el **recargo por hora extra**, la duración (2 h, 3 h) y si el
  precio es **único por房型 o individual**. `[MT]`
- **Alta de房型**: en PC, `信息管理 → 酒店信息 → 房型信息 → 新增房型`, con campos
  obligatorios (**nombre, precio de tarifa, tipo de cama, superficie**) y opcionales
  (descripción de instalaciones, políticas especiales). **Revisión de 1-2 días
  hábiles**. En la app: `功能设置 → 门店及房型 → 新增房型`, con **mínimo 3 fotos
  reales**; si no es la primera alta, **entra en vigor al momento**. `[MT]`
- **Modificar un房型** exige tres condiciones: que la habitación **no esté en
  mantenimiento, no esté ocupada y no esté asignada**. `[MT]`
- **Cambiar de habitación en un pedido**: solo si aún no está asignada
  (未排房). Tres opciones — **mejora gratuita** (se traslada el precio original),
  **precio del nuevo房型** (tarifa del sistema) o **precio personalizado**. `[MT]`
- **Cumplimiento de la información del房型**: está prohibido que el房型 no
  exista, que el nombre incluya vistas o tipo de cama que no correspondan, que
  incluya publicidad o teléfonos, que la cantidad no cuadre, que falten
  instalaciones declaradas, o que superficie/cama/baño privado/ventana/planta/
  capacidad/vistas no coincidan o falten. `[MT]`

### J.4 Escritorio de datos

实时在住 (ocupadas ahora), 预抵 de hoy, 预离 de hoy, con **drill-through a la
lista de reservas**; además ingreso del día, ocupación, **RevPAR** y desglose por
canal. `[MT]`

---

## 10. CONTRASTE CON LIFE BOOK — qué tienes ya y qué falta

Estado medido sobre el código real en `D:\egapp` (2026-09-12), no sobre el plan.

### 10.1 Lo que YA tienes al mismo nivel (o mejor)

| Capacidad | Meituan | Life Book | Evidencia |
|---|---|---|---|
| Flujo buscar → resultados → detalle → reservar → confirmar | ✔ | ✔ | `lifebook-hotel.tsx:31`, `-resultados.tsx:26`, `-detalle.tsx:40`, `-reservar.tsx:39` |
| Precio «desde X/noche» en la tarjeta | ✔ | ✔ | `components/HotelResultCard.tsx:82-88` |
| **Habitaciones listadas en la tarjeta de resultados** (hasta 3, con capacidad, camas, estancia mínima, % de señal, unidades libres) | ✖ — Meituan solo muestra el precio de entrada | ✔ **Mejor que Meituan** | `HotelResultCard.tsx:93-156` |
| Tipos de habitación con **calendario individual por tipo** | Parcial | ✔ | `lifebook-hotel-detalle.tsx:231-322` |
| Desglose de precio «ahora + al llegar» | Parcial | ✔ | `lifebook-hotel-detalle.tsx:277-306` |
| **Depósito/señal configurable** | ✔ (garantía con tarjeta) | ✔ `depositPercent` por habitación + selector 0 % / mitad / máximo | `lifebook-hotel-reservar.tsx:497-517` |
| **Bloqueo temporal de inventario** | ✔ 30 min | ✔ `holdMinutes` / `holdExpiresAt` con cuenta atrás visible | `lifebook-hotel-reservar.tsx:99,546` |
| Confirmación con **código de reserva** | ✔ (por SMS) | ✔ **en pantalla, con desglose y cuenta atrás** | `lifebook-hotel-reservar.tsx:269-356` |
| **Línea de tiempo de estados** | Parcial | ✔ `hold→pending→confirmed→checked_in→checked_out` | `lifebook-hotel-reserva.tsx:46-52` |
| Cancelación **con motivo obligatorio** | ✔ | ✔ (ambos lados) | `lifebook-hotel-reserva.tsx:145-183`, `-panel.tsx:115-145` |
| Chat con el hotel | ✖ en el flujo de reserva | ✔ | `lifebook-hotel-reserva.tsx:294` |
| Mapa en la reserva | ✔ | ✔ MapLibre | `lifebook-hotel-reserva.tsx:417` |
| Panel con métricas del día | ✔ | ✔ llegadas, salidas, dentro, próximas, por confirmar, retenidas sin pagar + ocupación por tipo | `lifebook-hotel-panel.tsx:204-231` |
| Máquina de estados en el panel | ✔ | ✔ confirmar señal / check-in / check-out / cancelar / no-show | `lifebook-hotel-panel.tsx:377-404` |
| Idempotencia al reservar | `[INF]` | ✔ cabecera `Idempotency-Key` | `api/hotel.ts` (reserve) |

### 10.2 Huecos, ordenados por impacto sobre la conversión

**P0 — barato y medible como palanca de conversión**

1. **Filtros de precio y ordenación en la UI de resultados.** La API **ya admite**
   `minPrice`/`maxPrice` (`api/hotel.ts:264`); solo falta exponerlos. Meituan los
   documenta como filtro de primer nivel, igual que el orden por precio, puntuación
   y distancia. Coste: una hoja de filtros en `lifebook-hotel-resultados.tsx`.
2. **Política de cancelación con fecha y hora concretas.** Hoy es **texto plano**
   (`lifebook-hotel-detalle.tsx:212-217`). Meituan la convierte en
   «cancelación gratis hasta hoy 18:00» dentro de la tarjeta de habitación, y en
   penalización **calculada** en el rellenado. Es el factor que más reduce la
   ansiedad antes de pagar.
3. **Etiqueta de confirmación inmediata vs. «el hotel confirma».** Tienes el
   mecanismo (`hold` + `pending` → `confirmed`), falta la **etiqueta** en la tarjeta.
   Meituan documenta que mostrar 立即确认 **reduce la ansiedad de espera**.
4. **Fecha de última reforma del hotel.** Un campo nuevo en el alta del hotelero;
   Meituan lo cita como factor de **conversión secundaria**. Coste mínimo.

**P1 — estructural, desbloquea lo demás**

5. **Sistema de valoraciones.** Tienes los campos `rating`/`ratingCount` pero **no
   hay UI para escribirlas ni para listarlas**. Esto bloquea en cadena: sin
   valoraciones no hay puntuación fiable → no puedes filtrar por «4.5+» → no puedes
   ordenar por puntuación → no tienes etiquetas largas extraídas de reseñas. Es el
   hueco con más dependencias detrás.
6. **Mapa interactivo en resultados.** Ya tienes `packages/map` y MapLibre en uso
   (`lifebook-hotel-reserva.tsx:417`); falta la vista de lista⇄mapa en
   `-resultados.tsx`.
7. **UI del panel del hotelero para inventario.** Los endpoints **ya existen**
   (`myRooms`, `createRoom`, `updateRoom`, `saveCalendar`, `dayBook` en
   `api/hotel.ts`) pero **no hay pantalla** que los use: hoy el hotelero puede
   gestionar reservas entrantes, **pero no precios, calendario ni habitaciones desde
   la app**. Es backend ya pagado sin frontend.

**P2 — cuando haya volumen**

8. Historial de búsquedas / hoteles vistos recientemente.
9. Cupones y campañas temporales.
10. Módulo de relación calidad-precio (性价比).

### 10.3 Lo que **no** recomiendo copiar, y por qué

| Elemento de Meituan | Por qué no |
|---|---|
| **Resumen IA de valoraciones** | Requiere miles de reseñas para tener señal. Con el dato de Cornell (6-12 reseñas leídas), hasta ~50 reseñas por hotel basta con mostrarlas ordenadas por fecha y con foto. La IA añade coste sin beneficio a tu escala. |
| **Módulo 性价比 con algoritmo** | Necesita volumen de precios y puntuaciones por mercado. En Malabo/Bata el número de hoteles es pequeño: el usuario compara a ojo en una lista corta. |
| **PMS completo con 6 estados por habitación física** | Es otro producto. Meituan商家版 gestiona habitaciones **individuales** (limpia/sucia/mantenimiento/bloqueada), cerraduras y夜审. Tú gestionas **tipos de habitación + calendario**, que es lo que necesita un hotel pequeño. Cerrar esa brecha es un proyecto de meses y probablemente no lo necesitas. |
| **钟点房 (habitación por horas)** | Decisión de negocio local, no técnica. Si no es práctica en GQ, no aporta. |
| **身份证号 obligatorio + verificación de documento** | En China es exigencia regulatoria. En GQ la obligación de registro de huéspedes es una **cuestión legal local que debes confirmar**, no algo que se copie. Además choca con tu regla de privacidad de no exponer datos en listados. |
| **Compensación tasada por falta de habitación** | Implica que **la plataforma asume dinero** (diferencia de tarifa, tope primera noche). Es un compromiso financiero, no una pantalla. Solo si hay respaldo económico detrás. |

### 10.4 Pregunta abierta de producto

Meituan separa **dos apps**: la del cliente (OTA) y la del hotelero (PMS). Life Book
tiene ambas dentro de la misma app (`lifebook-hotel-panel.tsx` convive con el flujo
del huésped). Con pocos hoteles esto es eficiente y está bien. Pero si el panel
hotelero crece hacia gestión de inventario (hueco 7), la pantalla va a competir en
complejidad con el flujo del huésped. **Vale la pena decidir ahora** si el panel
sigue dentro de Life Book o se segrega, antes de construirle UI.

---

## FUENTES

**Oficiales de Meituan** `[MT]`
- 美团预订酒店入住流程及注意事项 — flujo, filtros, campos del填单, confirmación, 即时确认
- 美团酒店预购操作攻略 — modo mapa, ordenación, valoraciones de 30 días con foto, pago
- 美团酒店选择标准 — filtros completos, rangos de puntuación, tipos de ordenación, reglas de valoración, IA antispam
- 美团酒店转化率影响因素 — palancas de conversión en lista y en detalle (foto 3:4, 装修时间, 转化词, 预留房 → 立即确认)
- 美团酒店取消订单退款规则申请退款流程 — las 7 reglas de cancelación y reembolso
- 美团酒店管理系统房型管理相关功能 — 6 estados de房态, 锁房, 维修, 钟点房, 换房, condiciones de修改
- 美团酒店商家后台房态助手功能 / 房态助手功能介绍 — las tres columnas, filtros, acciones por lotes, escritorio de datos
- 美团酒店房型管理操作规则 — alta de房型 en PC y app, mínimo 3 fotos, revisión 1-2 días, cumplimiento de la información
- 美团酒店商家后台修改房间价格的位置 — rutas de 房价房量日历, 经营助手, 智能加优
- 美团酒店是否为App — no es app independiente; paquete `com.sankuai.meituan`; mini-programa Alipay 2024-09-04
- 服务保障 (awp.meituan.com) — hotline 10107888 y compensación por falta de habitación
- developer.waimai.meituan.com `order/viewstatus` y `order/confirm` — códigos de estado 1/2/4/8/9
- h5.dianping.com 订单详情查询 — enumeración de la企业版 (no mezclar con la anterior)
- 鸿蒙版美团酒店商家 (东方网, 2026-07-29) — alcance del panel del comerciante

**Secundarias** `[3P]`
- 扬子晚报网 (2026-04-24) — actualización del sistema de valoraciones con IA, «一句话概要», dato de Cornell
- 美团点评平台酒店商家运营攻略 (百度百科) — estructura del工作台
- 应用宝 `com.sankuai.mhotel` — accesos del escritorio del comerciante
- 人人都是产品经理 / 知乎 — análisis de producto del módulo hotel
- npoall.com — campos mostrados en la tarjeta de房型
- Artículos de WeChat sobre cupones (§I) — **no verificados**, solo como indicio

**Inferencias** `[INF]` — colocación visual y agrupamiento no documentados; confirmar
con capturas reales antes de maquetar.
