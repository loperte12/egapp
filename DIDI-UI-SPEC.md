# ESPECIFICACIÓN UI "TODO COMO DIDI" — EG Route Plan (móvil)

> Capturada del cliente DiDi real (com.sdu.didi.psnger) el 2026-09-04 en el
> teléfono del dueño (OnePlus, Android 16). Referencias en capturas
> `ref-didi-home.png`, `ref-didi-search.png`, `ref-didi-rental.png`
> y dumps XML `didi-*.xml` (workspace raíz).
>
> Regla de oro: **menos texto, más aire, un solo objetivo por pantalla,
> todo alcanzable con el pulgar**. DiDi satura solo donde es funcional
> (lista de tarifas) y siempre con una acción dominante al pie.

## 0. APPS DE REFERENCIA (todas capturadas 2026-09-04, permiso del dueño)

| Módulo nuestro | App de referencia | Capturas |
|---|---|---|
| Home / Taxi / Reservar Coche / Intercity / Paquetes / Mudanza | **DiDi** (com.sdu.didi.psnger) | `ref-didi-home.png`, `ref-didi-search.png`, `ref-didi-rental.png`, `ref-didi-express.png`, `ref-didi-moving.png`, `ref-didi-more.png`, dumps `didi-*.xml` |
| **Work** (Buscar Work / work-detail) | **BOSS直聘** (com.hpbr.bosszhipin) | `ref-boss-home.png`, `ref-boss-scroll.png`, `ref-boss-jobdetail.png`, dumps `boss-*.xml` |
| **Conductor-hub / driver-onboarding** | **Uber Driver** (com.ubercab.driver) | `ref-uber-driver.png`, dumps `ref-uber-driver*.xml` |
| **Comida Rápida** (food + restaurante) | **Meituan** (com.sankuai.meituan.takeoutnew) | `ref-meituan-home.png`, `ref-meituan-rest.png` |
| **Mercado / Ecomerse** (catálogo + detalle) | **Taobao** (com.taobao.taobao) | `ref-taobao-home.png` |
| **Mercado segunda mano / Alquiler entre particulares** | **Xianyu** (com.taobao.idlefish) | `ref-xianyu-home.png` |
| **Life Book** (futuro) | **Xiaohongshu** (com.xingin.xhs) | `ref-xhs-home.png` |

El lenguaje de tarjetas/listas/CTAs es común a todas; la home de DiDi es el
patrón maestro de navegación. Work copia la *job card* + detalle de BOSS;
Conductor copia el checklist de onboarding de Uber Driver; Comida copia el
descubrimiento de Meituan (tabs de categorías + tarjetas de restaurante);
Mercado copia el feed de producto de Taobao; Alquiler/segunda-mano copia el
feed de Xianyu con la tarjeta "vendedor · confianza".

---

## 1. HOME — patrón DiDi

Estructura vertical real capturada (de arriba a abajo):

1. **Barra superior mínima**: ciudad actual arriba-izquierda (`桂林` en DiDi /
   `Malabo` para nosotros) + notificaciones/avatar derecha. Fondo translúcido
   sobre el mapa.
2. **Mapa a pantalla completa** detrás de todo (nuestro caso: MapLibre GL JS).
3. **Panel de búsqueda fijo en la parte media-baja** (NO un sheet que oculta el
   mapa):
   - Fila 1: origen — `📍 <ciudad> · Ubicación actual` con chevron (cambiar).
   - Fila 2: **campo gigante "¿A dónde vas?"** (placeholder "输入目的地") →
       al tocarlo abre PANTALLA DE BÚSQUEDA COMPLETA (no un simple input).
4. **Acción dominante**: botón grande inferior tipo DiDi "打车" (Llamar Taxi),
   siempre visible y primario.
5. **Filas horizontales de servicios** (scrolleables) jerarquizadas:
   - Fila 1 (primarios, circulares grandes): Taxi · Ciudad a Ciudad · Conductor ·
     Reservar Coche (4).
   - Fila 2 (secundarios): Comida · Mercado · Alquiler · Work.
   - Fila 3 (bajo demanda, "más servicios"): Mudanza · Paquete · Life Book ·
     Emergencia.
6. **Bottom nav** (Inicio / Taxi / Monedero / Perfil / Emergencia) — ya existe.

### Panel de búsqueda DiDi (comportamiento clave)
- Al tocar destino se abre pantalla nueva con: input grande arriba con foco
  automático + **botón de micrófono / pegado** ("点我说地址", "识图选地址").
- Debajo: chips de atajos (家/Casa · 公司/Oficina · 收藏夹/Favoritos ·
  地图选点/Elegir en mapa).
- Lista "Para ti" (为你推荐) con resultados reales: dirección + subtítulo +
  distancia + botón favorito. Tipeo filtra en vivo (búsqueda server-side).
- Mapa sigue visible en segundo plano con el punto del origen.

### Nuestra adaptación (sin historial real todavía)
- Pantalla `/buscar` (nueva): input destino con foco, chips
  (Mi ubicación · Elegir en mapa · Favoritos), resultados de CITIES +
  sitios conocidos por ciudad (datos estáticos por ahora; después server).
- Al elegir destino → navega a Taxi con `params { destino }` (o al servicio
  que corresponda si el texto nombra Comida/Mercado/Alquiler/Work).

---

## 2. TARJETAS / DENSIDAD — patrón DiDi

- Tarjeta de servicio: **icono circular con fondo suave** (tinte del color del
  servicio) + label de 1 línea, ~13px, centrado. Nada más (DiDi: 打车/顺风车…).
- Lista de tarifas (pantalla de coches): **una fila por opción** con:
  - Izquierda: nombre de la opción (特惠快车 / Comida normal…).
  - Derecha: precio ("一口价¥38.1") + debajo descuento aplicado en verde
    ("已优惠¥2.9").
  - La fila seleccionada se resalta; NUNCA mostrar todas las tarifas en texto
    corrido.
- Texto: títulos 17-20 semibold; cuerpo 14-15; etiquetas 12-13; secundario
  siempre en `textSecondary`.

---

## 3. RESERVAR COCHE — convertir en flujo por pasos (DiDi "预约")

Actualmente: una sola pantalla con origen+destino+calendario completo+fecha
(hora) → saturada, partes no visibles (queja del dueño). Rediseño objetivo:

- **Paso 1 — Ruta**: origen (desde mi ubicación/ciudad) → destino (campo
  gigante) + selector de ciudad. CTA "Continuar".
- **Paso 2 — Coche + horario**: fecha/hora (picker nativo compacto, NO
  calendario de mes entero) → lista de vehículos disponibles con tarifa
  (patrón tarjetas DiDi). CTA "Reservar".
- **Paso 3 — Confirmación**: resumen 1 pantalla (ruta, fecha, vehículo,
  precio, pago) + "Confirmar reserva".
- Barra de progreso 3 puntos arriba (StepHeader ya existe en ui-kit).
- Cada paso es una pantalla navegable (expo-router), con back.

---

## 4. COLOR / TOKENS

Ya definidos en `packages/ui-kit/src/theme/colors.ts` y correctos:
primary `#0066CC` (acción), secondary `#C2410C` (servicios), verde éxito,
rojo SOLO emergencia. Se mantienen. DiDi usa su naranja en CTA de taxi;
nosotros usamos `primary`/`secondary` según servicio (no cambiar marcas).

---

## 5. ORDEN DE FASES (para auditorías del dueño)

1. **Kit compartido**: `DidiSearchField`, `DestinationSheet`/pantalla `/buscar`,
   `ServiceRow` (circular), `FareRow`, `StepDots` reutilizable. (Base ya en
   `components/`: SearchHeader, ServiceGrid, FareQuoteCard — reemplazar o
   adaptar, no duplicar.)
2. **Home DiDi**: mapa de fondo + panel búsqueda grande + CTA taxi + filas de
   servicios + bottom nav (reestructurar `app/index.tsx` + componentes).
   Requiere mapa real en release (ver §6).
3. **Reservar Coche por pasos** (`app/reserva.tsx`).
4. **Extender** a Taxi / Intercity / Buscar Alquiler / Conductor-hub con el
   mismo vocabulario (SearchField, FareRow, pasos).

---

## 6. BLOQUEADOR TÉCNICO: mapa en release

La home muestra "Vista previa sin mapa · el mapa real requiere build de
desarrollo". Ver `packages/map` (WebView + MapLibre GL JS auto-hospedado en
`/maps/`). Para que la home DiDi luzca real en APK release hay que habilitar
el mapa en producción (misma URL `/maps/style-*.json` que en dev) — tarea
técnica de la Fase 2. Verificar tras resolver la prueba de red del dueño
(WiFi), porque el WebView del mapa también consume la red.

## 7. WORK — patrón BOSS直聘 (tarjeta de empleo + detalle)

### Job card (feed, captura `ref-boss-home.png` / `ref-boss-scroll.png`)
Una tarjeta por fila (borde inferior separador, no cajas):
1. **Fila 1**: título del puesto (semibold, 16-17) IZQUIERDA ·
   **salario a la DERECHA en naranja corporativo** (8-15K) / si es por día "300元/天".
2. **Fila 2**: empresa (bold pequeño) + badges empresa (未融资 · 100-499人).
3. **Fila 3**: chips de requisitos (经验不限 · 学历不限 · 日结 · 无需坐班).
4. **Fila 4**: reclutador (avatar circular pequeño + nombre "师书怡 · 招聘者" +
   indicador verde "回复率高" / "今日回复10+次") y ubicación a la derecha
   (桂林 灵川县…).
Tap → detalle.

### Job detail (`ref-boss-jobdetail.png`)
1. Header: título + salario grande naranja + "入职公司: X" + ciudad · zona.
2. Chips de requisitos arriba (经验不限/学历不限) + descripción larga.
3. Bloque reclutador: avatar + nombre + rol "招聘者" + estado respuesta.
4. Sección "职位详情" con párrafos y badges.
5. **CTA inferior fijo y ancho completo**: "立即沟通" (naranja) — en nuestro caso
   "Postularme"/"Contactar".
Nuestra adaptación: `app/work.tsx` (feed) y `app/work-detail.tsx` ya existen —
reescribir su layout con este vocabulario (JobCard, chips, CTA inferior).

## 8. CONDUCTOR — patrón Uber Driver onboarding (`ref-uber-driver.png`)

- Header "Uber · Bienvenido, {nombre}" + estado de progreso
  ("Completa N pasos más para comenzar a generar ganancias").
- **Checklist vertical de onboarding** con estados: foto de perfil,
  licencia, licencia de vehículo, registro, seguro… cada fila con icono de
  estado (pendiente/completado) y CTA "Siguiente paso recomendado".
Nuestra adaptación: `app/conductor-hub.tsx` + `app/driver-onboarding.tsx` —
mismo checklist con pasos de KYC propios (ya hay driver-documents en la web).

## 9. COMIDA — patrón Meituan (`ref-meituan-home.png`, `ref-meituan-rest.png`)

- **Tabs horizontales de categoría** arriba (美食/甜点饮品/超市便利/蔬菜水果…)
  = nuestras categorías de cocina.
- **Fila de ofertas destacadas** horizontal ("品质精选省心价") con cards de
  restaurante: foto + nombre + descuento en naranja + "¥13 低至4.4折".
- **Feed de restaurantes**: foto grande arriba, nombre, badges
  (堂食店/神券商家/4.6分以上), distancia, tiempo de entrega, precio medio.
- Detalle de restaurante (`ref-meituan-rest.png`): menú por secciones con
  carrito flotante abajo — patrón para nuestro `app/food.tsx` + `food-menu.tsx`.

## 10. MERCADO — patrón Taobao (catálogo) + Xianyu (segunda mano/alquiler)

### Taobao (`ref-taobao-home.png`)
- Feed de producto de 2 columnas: foto, título en 3 líneas, precio **¥** grande
  + decimal pequeño, descuento "超级立减10%", "已售80+".
- Tabs superiores de canal (推荐/闪购/国补/飞猪…) = nuestras categorías.

### Xianyu (`ref-xianyu-home.png`) — para Alquiler y segunda mano
- Tabs: 关注/推荐/新发/找服务 + chips de categoría
  (吃喝玩乐/手机数码/上门回收/二手房…).
- **Card de producto usado**: foto, título largo con tags de venta
  (【56cm特惠…】), precio ¥ grande, **"12人想要"** (interés) y abajo el
  **vendedor con badge de confianza** "山野集峰 · 卖家信用极好".
Nuestra adaptación: `app/ecomerse.tsx` (Taobao) y `app/alquiler.tsx` +
`alquiler-detalle.tsx` (Xianyu: foto, precio, propietario con badge).

## 11. PAQUETES / MUDANZA — patrón DiDi (`ref-didi-express.png`, `ref-didi-moving.png`)

### Enviar Paquete / 快送 (`ref-didi-express.png`)
- Pantalla única "envío": **remitente** (ubicación + teléfono) →
  **destinatario** ("填写收件信息") → CTA grande "去下单".
- Chips de tipo de entrega: 送行李/送礼物/送文件/帮取餐/送蛋糕.
- Tabs inferiores: 快送 · 订单 · 我的.

### Mudanza / 搬家 (en `ref-didi-more.png` dentro de grupo 送货)
- Accesible desde grid "más servicios" agrupado: 送货 (送货/快送跑腿/搬家/家政).
Nuestra adaptación: `app/service/paquete` y `app/service/mudanza` (hoy
comingSoon) — crear pantalla de envío tipo 快送 con remitente→destino→CTA.

## 12. PERFIL — patrón multi-rol (`ref-didi-profile*.png`, `ref-boss-profile.png`, `ref-xianyu-profile.png`)

Nuestra pestaña Perfil (`app/profile.tsx`) debe ofrecer **perfiles por rol**
(auditoría del dueño: "ver el tipo de perfil que debemos integrar"). Cada rol
hereda del header común pero muestra sus métricas:

### Encabezado común (todas las apps)
- Nombre/avatar grande arriba + badge de rol bajo el nombre.
- Iconos superiores: mensajes · ajustes.

### Perfil Viajero/Cliente (DiDi 我的)
- Métricas en fila: 里程 km / "más logros".
- **Órdenes** (tabs): Todos · Pendientes · Pagar · Facturas · Atención.
- **Monedero**: saldo · cupones (N tarjetas) · 优惠卡券.
- Seguridad: verificación (real-name), contacto de emergencia.
- Acciones: tarjetas de beneficios (2×1 fila), servicios de propietario.

### Perfil Buscador de empleo (BOSS 我的)
- Rol ("estudiante/egresado") + **在线简历** (estado del CV).
- **Métricas de candidatura**: 沟通过 · 已投简历 · 待面试 · 收藏.
- 常用功能: CV online, CV adjunto, intención laboral, herramientas.
- Bloques de ayuda: test de personalidad, dirección de búsqueda, análisis.

### Perfil Comerciante/Vendedor (Xianyu 我的)
- Nombre + **puntuación de confianza** ("鱼力值 559" / "卖家信用极好").
- Colecciones: 收藏 · histórico · seguidos · cupones.
- **Mis ventas**: publicados · vendidos · comprados · disponibles.

### Nuestra adaptación
`app/profile.tsx` debería detectar el rol activo (state/rolePrefs ya existente
en `state/rolePrefs.ts` con `roleOptionsFor`) y pintar la variante: Viajero
(saldo+viajes), Conductor (ganancias+checklist), Buscador/Reclutador
(postulaciones/vacantes), Vendedor/Arrendador (publicaciones/ventas). Header
común + métricas por rol + "Ajustes" y "Seguridad" abajo.
