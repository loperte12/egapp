# FLUJOS DE REFERENCIA — apps reales (DiDi / BOSS / Uber / Meituan / Taobao / Xianyu)

> Documento vivo. Cada flujo indica: pasos reales observados (dumps XML
> `flow*.xml`, `didi-*.xml`, `boss-*.xml`, `mt-*.xml`, `tb-*.xml`,
> `xianyu-*.xml` en el workspace), screenshots `flow-*.png` / `ref-*.png`,
> y **cómo replicarlo en EG Route Plan** (rutas reales de `app/`).
> Capturas tomadas 2026-09-04 con permiso del dueño, navegando SOLO
> pantallas (sin completar pagos/verificaciones de las cuentas reales).

---

## 1. TAXI — DiDi (flujo principal)

Evidencia: `flow1-taxi-home.xml`, `flow2.xml`, `flow3.xml`, `flow4.xml`,
screenshots `flow-didi-taxi-01..06.png`; dumps `didi-home*.xml`,
`didi-search.xml`; `ref-didi-home.png`, `ref-didi-search.png`.

| # | Paso (DiDi) | Detalle observado | Nuestra réplica |
|---|---|---|---|
| 1 | **Home taxi** | Mapa + origen arriba (pin azul + "从 X 上车") + campo grande "输入目的地" + fila servicios (AI叫车/预约/帮人叫车/接送机) + fila modos (打车/顺风车/代驾/…) | `app/index.tsx` (home DiDi) → "¿A dónde vas?" abre `/buscar` |
| 2 | **Elegir destino** | Pantalla búsqueda: input "请输入终点" con foco + chips (家/公司/收藏夹/地图选点) + "为你推荐" (dirección+distancia+favorito) | `app/buscar.tsx` (creada) — ciudades + región + "Para ti" |
| 3 | **Tarifas** | Lista de modos: fila por opción con precio "一口价¥38.1", descuento verde "已优惠¥2.9", "特价拼车 拼成¥22.8"; multi-selección "已选0/2个" | `app/taxi.tsx` — patrón FareRow (nueva, Fase tarifas) |
| 4 | **CTA llamar** | Botón inferior ancho: precio + "立即打车 ¥38.1"; arriba mini resumen origen→destino | Taxi CTA inferior fijo con precio |
| 5 | **Confirmación/seguridad** | Pide verificación (SMS) antes de llamar | Nuestro auth ya lo hace (sesión) |

### Reglas de UX extraídas
- El mapa NUNCA desaparece: panel inferior se superpone.
- Un solo CTA dominante al pie con el precio.
- La selección de vehículo es lista, no cuadrícula de 8 botones.
- Descuentos SIEMPRE en verde junto al precio.

---

## 2. RESERVA COCHE — DiDi 滴滴租车 / 预约

Evidencia: `didi-rental.xml` (grid de tarifas con selección múltiple),
`ref-didi-rental.png`; `didi-home*.xml` (entrada "预约").

Observado: la reserva NO mete calendario en la misma vista del pedido
inmediato: elige **hora de recogida** en un selector aparte y luego el coche.
Nuestra pantalla actual (`app/reserva.tsx`) junta origen+destino+calendario
completo+fecha en un scroll (queja del dueño: saturada). Réplica objetivo
(especificación §3):
- Paso 1 ruta (origen→destino) → Paso 2 coche+horario (picker compacto) →
  Paso 3 confirmación. Barra de progreso arriba (StepHeader existe en ui-kit).

---

## 3. ENVÍO DE PAQUETES — DiDi 快送

Evidencia: `didi-express.xml`, `ref-didi-express.png`; entrada en `didi-more.xml`.

| # | Paso | Detalle | Réplica |
|---|---|---|---|
| 1 | Tipo de envío | Chips: 送行李/送礼物/送文件/帮取餐/送蛋糕 | `app/service/paquete` (nuevo) chips tipo |
| 2 | Remitente | Ubicación origen + teléfono + "地址簿" | Form origen (mi ubicación/ciudad) |
| 3 | Destinatario | "填写收件信息" + "地址簿" | Form destino + teléfono |
| 4 | CTA | "去下单" ancho | CTA inferior "Continuar" |
| 5 | Tabs | 快送 · 订单 · 我的 | Footer común |

---

## 4. MUDANZA — DiDi (grupo 送货)

Evidencia: `didi-more.xml` (grupo "送货": 送货/快送跑腿/搬家/家政),
`ref-didi-more.png`, `didi-moving.xml` (vacío por verificación).
Réplica: `app/service/mudanza` — flujo similar a paquete (origen, destino,
tamaño/muebles, fecha).

---

## 5. COMIDA — Meituan (restaurantes + pedido)

Evidencia: `mt-foodhome.xml`, `ref-meituan-home.png`, `ref-meituan-rest.png`
(`mt-rest.xml` vacío por verificación).

| # | Paso | Detalle | Réplica |
|---|---|---|---|
| 1 | Home comida | Tabs categoría (美食/甜点饮品/…) + ofertas "品质精选" + feed restaurantes (foto, nombre, ¥13, descuento "低至4.4折", badges 堂食/神券/4.6分) | `app/food.tsx` (rediseño feed Meituan) |
| 2 | Restaurante | Menú secciones + carrito flotante (de `ref-meituan-rest.png`) | `app/food-menu.tsx` + carrito |
| 3 | Checkout | — (no capturado, requiere cuenta) | `app/food-checkout.tsx` (ya existe) |

---

## 6. TRABAJO — BOSS直聘

Evidencia: `boss-home.xml`, `boss-scroll.xml`, `boss-jobdetail.xml`,
`boss-profile.xml`; `ref-boss-home.png`, `ref-boss-scroll.png`,
`ref-boss-jobdetail.png`, `ref-boss-profile.png`.

| # | Paso | Detalle | Réplica |
|---|---|---|---|
| 1 | Feed | Tabs 全职/兼职/实习 + chips (综合/互联网/行业…) + orden (推荐/附近/最新) + **job card**: título izq + salario naranja der; empresa+badges; chips requisitos; reclutador + "回复率高" | `app/work.tsx` (rediseño JobCard) |
| 2 | Detalle | Título+salario grande; "入职公司"; chips; descripción; reclutador; CTA "立即沟通" | `app/work-detail.tsx` |
| 3 | Perfil | Rol + CV + métricas (沟通过/已投简历/待面试/收藏) | `app/profile.tsx` perfil Buscador |

---

## 7. CONDUCTOR — Uber Driver onboarding

Evidencia: `ref-uber-driver.xml` + `ref-uber-driver2.xml`, `ref-uber-driver.png`.

| # | Paso | Detalle | Réplica |
|---|---|---|---|
| 1 | Bienvenida | "Te damos la bienvenida, {nombre}" + "Completa N pasos…" | `app/conductor-hub.tsx` |
| 2 | Checklist | Pasos: foto, licencia, licencia vehículo, registro, seguro — cada uno con estado | `app/driver-onboarding.tsx` |
| 3 | Siguiente paso | CTA "Siguiente paso recomendado" | Paso destacado con CTA |

---

## 8. MERCADO — Taobao (catálogo) + Xianyu (usados)

Evidencia: `tb-home.xml` / `ref-taobao-home.png`; `xianyu-home.xml`,
`xianyu-home2.xml`, `xianyu-profile.xml` / `ref-xianyu-*.png`.

| Flujo | Patrón | Réplica |
|---|---|---|
| Catálogo Taobao | Feed 2 col: foto + título 3 líneas + ¥ grande + "已售80+" + descuento | `app/ecomerse.tsx` |
| Usados Xianyu | Card: foto + título tags + ¥ + "12人想要" + vendedor "卖家信用极好" | `app/alquiler.tsx` / cards |
| Perfil Xianyu | Nombre + 鱼力值 (confianza) + colecciones + mis ventas | perfil Comerciante en `app/profile.tsx` |

---

## 9. LIFE BOOK (futuro) — Xiaohongshu

Evidencia: `xhs-home.xml`, `ref-xhs-home.png`.
Patrón: feed masonry 2 columnas de tarjetas de contenido + bottom nav.
Réplica futura: `app/service/lifebook` cuando se diseñe.

---

## 10. PERFILES POR ROL (transversal)

Evidencia: `didi-profile.xml`/`didi-profile2.xml` (viajero: órdenes/monedero/
seguridad), `boss-profile.xml` (buscador: CV/métricas), `xianyu-profile.xml`
(comerciante: colecciones/ventas). Especificación §12.
Réplica: `app/profile.tsx` con variantes según rol activo
(`state/rolePrefs.ts`): Viajero / Conductor / Buscador / Reclutador /
Comerciante / Arrendador. Header común (avatar+nombre+badge) + métricas por
rol + Ajustes/Seguridad.

---

## NOTA DE CAPTURA
Los pasos finales que requieren cuenta/pago/SMS (confirmar pedido, verificación
de viaje) NO se completaron en las apps reales (respetando las cuentas del
dueño); se documentan hasta el CTA final. Los flujos de EG Route Plan ya
tienen esas pantallas de confirmación implementadas (checkouts, auth), así que
la réplica cubre el 100% del recorrido.
