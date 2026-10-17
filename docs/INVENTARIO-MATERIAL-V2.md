# Inventario de material del v2 (servicio por servicio)

**Qué es.** El paso 1 de [PLAN-RE-POR-SERVICIO.md](PLAN-RE-POR-SERVICIO.md) §5: **qué material hay de
verdad**, con prueba, antes de aprobar ningún flujo. Todo lo de aquí está contado en disco el 17/10/2026;
lo que no está, se dice.

**Conclusión de un vistazo**: hay material **fuerte** para dos servicios (Mercado y Taxi), **parcial** para
interurbano/pagos, y **nada** para comida, hoteles, red social y mensajería. Y hay **un hueco común a
todos: capturas de red (HAR)**.

---

## 1 · MERCADO (compra online) — material **alto**

| # | fuente | estado | prueba / ruta |
|---|---|---|---|
| 1 | **Recursos del APK** (plantillas, contenedores, strings) | ✅ **fuerte** | `taobao/` **270 MB**; **246 plantillas** con firma `ALIDX` (todas en `assets/template/`); **6 contenedores** `container_*.json`; `strings.xml` de 492 KB con estados de UI |
| 2 | **Código descompilado** | ⚠️ **parcial** | `taobao/jadx-res/sources/` está **vacío** (0 ficheros): se descompilaron **recursos**, no Java. Lo de nivel código viene de extracciones anteriores (`mercado-fase1/re-d/tabla-claves.json`, claves del motor) |
| 3 | **Captura de red (HAR)** | ❌ **no hay** | no existe ningún `.har` en el taller. Es el hueco grande: sin esto no hay contratos de API |
| 4 | **Panel del comerciante** | ✅ **fuerte (¡sorpresa!)** | `taobao-desktop/`: `app.asar` de **242 MB** + **18 MB de JS extraído** (39 ficheros) + un `taobao-mcp` + `decoded-strings.txt` (265 KB). Es **Electron**, o sea **JS legible**. La web `myseller.taobao.com` sigue siendo la otra vía |
| 5 | **Pantalla + volcado de vistas** | ✅ **fuerte** | `docs/RE-关注-TIENDAS.md` (medido en dp: celda 98,7×34,7; pastilla 57,7×11,7; 21 categorías 7×3…), con 4 `.xml` y 7 capturas en `docs/evidencia/` |
| 6 | **Experimentos y flags** | ✅ | nombres medidos: `139281#分类tab在上新样式放量的副本`, `businessType: subscribe/recommend/campaign/dxContainer` |

**Máquina ya construida** (no es material de RE, pero cuenta para el coste): contrato versionado + kit + oráculo de **155 pruebas** + `npm run verificar` + despliegue con humo.

**Flujos núcleo y cobertura**

| flujo | material | falta |
|---|---|---|
| 关注 (feed) | ✅ medido (A y B) | datos nuevos en el servidor (posts y contadores) |
| tienda / ficha de producto | 🟡 plantillas + pantalla | HAR de la respuesta real (campos, precios, variantes) |
| buscar / filtrar | 🟡 plantillas + volcado | HAR de la búsqueda (filtros, orden, paginación) |
| compra / pago | 🟡 pantallas | HAR del checkout y de los estados del pedido |
| entrega / seguimiento | ❌ | HAR + estados |
| devolución / disputa | ❌ | HAR + estados |
| **publicar producto (comerciante)** | 🟡 panel Electron extraído | captura de la **sesión** del panel (login real) |

---

## 2 · TAXI (movilidad) — material **alto**

| # | fuente | estado | prueba / ruta |
|---|---|---|---|
| 1 | **Recursos de los APK** | 🟡 | informe 01 dice tener **dos APK** (pasajero y conductor) con hash; **presencia en disco a verificar** antes de contar con ella |
| 2 | **Código descompilado** | ✅ **fuerte** | `docs/re-didi/` **23 ficheros / ~180 KB**: `INFORME-02 logica-de-negocio`, `03 modelo y ciclo de vida`, `05 conductor`, `06 UI conductor`, `08 motor sin cuenta`, `09 motor reconstruido` |
| 3 | **Captura de red (HAR)** | ❌ | no hay `.har`; `INFORME-07 captura-en-ejecucion` es observación de ejecución, no contratos de API |
| 4 | **Panel** | — | no aplica (es app de pasajero/conductor) |
| 5 | **Pantalla + volcado** | ✅ | `INFORME-18 pantalla-del-conductor`, `INFORME-04 cierre-pasajero`, `INFORME-16 los-tres-puntos`, `19 tingdan y nota de voz` |
| 6 | **Flags / experimentos** | 🟡 | parcial en los informes |

**Flujos núcleo y cobertura**

| flujo | material | falta |
|---|---|---|
| pedir (origen/destino, estimación) | ✅ informes 01–03 | HAR de tarifas y estimación |
| asignar / aceptar (conductor) | ✅ informes 05, 08, 09 | HAR del despacho |
| seguir en mapa | ✅ informe 10 (AMap + motor) | — |
| **programado** (reserva retenida, liberación) | ✅ **muy cubierto**: informes **11, 12, 13, 15** | HAR de la reserva |
| cobro / cierre del pasajero | ✅ informe 04, 17 | HAR del pago |
| conductor: escucha, rueda, llegada | ✅ informes 14, 18 | HAR del estado del conductor |
| nota de voz / «tingdan» | ✅ informe 19 | — |

**Lo mejor de este servicio**: los flujos de **programado y reserva retenida** están documentados con
detalle (informes 11–15), que es justo lo que un clon suele hacer mal.

---

## 3 · El resto (para que no haya sorpresas)

| servicio | material | estado |
|---|---|---|
| Interurbano | `intercity/` (4 ficheros) en el taller | **insuficiente**; falta inventario con prueba |
| Pagos / monedero | `mercado-fase1/ta-pagos` (parcial) | **bajo** |
| Comida | — | **nada** |
| Hoteles | — | **nada** |
| Red social | — | **nada** |
| Mensajería | — | **nada** |

---

## 4 · Los huecos que hay que cerrar (y son los mismos en todos)

1. **Capturas de red (HAR/mitmproxy)** por flujo. Sin esto no hay contratos: sólo pantallas y código.
   Es la fuente 3 de `PLAN-RE-POR-SERVICIO.md`, y **la que más lógica visible da**.
2. **Sesión real en el panel** (`myseller.taobao.com`) para el lado comerciante: publicar, pedidos,
   **verificación de documento**. El panel Electron ya está extraído; falta la sesión.
3. **Descompilar fuentes** del APK de Taobao (`jadx` completo) si se necesita lógica de cliente fina; hoy
   sólo hay recursos.
4. **APK de DiDi en disco**: verificar y anotar hash antes de aprobar flujos que dependan de código.

---

## 5 · Qué se puede aprobar HOY sin más material

| servicio | flujo propuesto | por qué | coste de material |
|---|---|---|---|
| **Mercado** | **关注-B** (avatares con contador, filtros, panel de rejilla, tarjeta de post) | ya está **medido en dp** y con volcados; el diseño es claro | **0** |
| **Taxi** | **programado** (pedir/programar, reserva, liberación) | informes 11–15 lo documentan; es el flujo que más se falla | bajo (leer y fichar) |
| Mercado | publicar producto (comerciante) | panel Electron extraído | **captura de sesión** |
| cualquiera | cualquier flujo de pago | hoy sólo pantallas | **HAR** |

---

## 6 · Decisión que toca ahora

1. **Rama**: shell v2 en rama aparte detrás de flags (recomendado) o módulos nuevos en el árbol actual.
2. **Primer flujo**: **Mercado · 关注-B** (material 0) o **Taxi · programado** (material bajo).
3. **Capturas**: cuenta de prueba en Taobao y permiso para HAR en el teléfono; sesión en `myseller`.
4. Cuando estén las capturas, se rellena este inventario con los contratos y **cada flujo pasa a ficha**.
