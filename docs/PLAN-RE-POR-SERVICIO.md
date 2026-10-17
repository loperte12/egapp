# ¿Se puede extraer «todo» con ingeniería inversa? (y qué significa empezar de cero por servicio)

**La pregunta, respondida en una línea**: **no, «todo» no.** Se extrae **todo lo que viaja al cliente**
(pantallas, textos, estados, validaciones, endpoints, formatos, constantes, flags) y **nada de lo que se
queda en el servidor** (precios, comisiones, ranking, riesgo, liquidación, verificación). Lo primero es
mucho más de lo que parece —ya lo hemos hecho—; lo segundo no es un fallo del método: es la frontera.

Y la segunda pregunta: **empezar de cero por SERVICIO sí es sensato con 0 usuarios; empezar de cero por
APP sería tirar la fábrica que acabamos de cerrar.**

---

## 1 · La frontera, con precisión

| qué | ¿está en el artefacto? | cómo se obtiene |
|---|---|---|
| Pantallas, estructura y medidas | **sí** | recursos/assets + volcado de vistas (`uiautomator`) |
| Textos, iconos, enums, estados de UI | **sí** | resources + código descompilado |
| Flujos y estados («pedido creado → aceptado → en camino») | **sí, como comportamiento** | código del cliente + captura de red |
| Contratos de API (rutas, campos, paginación, firma) | **sí** | captura de red (HAR/mitmproxy) + código |
| Constantes: categorías, límites, zonas, plazos | **sí** | assets/JSON + enums |
| Inventario de features y A/B | **sí** | nombres de experimentos, flags, trackers |
| **Precios, descuentos, comisiones, reparto** | **no** | es cálculo del servidor: sólo se **infiere** observando entradas/salidas |
| **Ranking / recomendación** | **no** | servidor |
| **Antifraude, riesgo, KYC** | **no** | servidor (y a menudo humano) |
| **Liquidación, impuestos, contabilidad** | **no** | servidor |
| **Datos** (catálogo, usuarios, pedidos) | **no** | base de datos, no app |
| Features apagadas / planes no publicados | **no** | no viajan |

**Consecuencia práctica**: la RE te da **especificaciones de comportamiento**; no te da **el negocio**.
Las reglas que definen tu producto (cuánto cobras, cómo reparte, qué se permite) **las decides tú**, y
copiarlas de otra app sería a la vez injusto y frágil. Lo que sí se copia con criterio es **lo que el
usuario espera**: cómo se ve, qué pasa al tocar, qué estados hay.

> Nota legal, breve: usar una app como **referencia de comportamiento** y escribir tu propio código y tus
> propios assets es una cosa; reutilizar sus recursos, textos o código es otra. Este plan hace lo primero.

---

## 2 · Las seis fuentes de material (y qué ha dado cada una aquí)

| # | fuente | qué se saca | ejemplo real en este repo |
|---|---|---|---|
| 1 | **Recursos/assets del APK** (plantillas ALIDX/DX, contenedores JSON, strings, i18n) | UI, textos, catálogo de plantillas, estructura de páginas | `taobao/jadx-res/resources/assets` (**270 MB**): 246 plantillas, 6 contenedores, 14 tipos de widget |
| 2 | **Código descompilado** (jadx/smali) | lógica del cliente, enums, validadores, máquinas de estado, endpoints, flags | `tabla-claves.json` (claves reales del motor), estados `fluid_sdk_follow_tab_*`, experimento `139281#分类tab在上新样式放量的副本` |
| 3 | **Captura de red** (HAR/mitmproxy) | contratos de API, paginación, auth/firma, formas de request/response, flujos reales | es lo que **falta** para Taobao (para DiDi sí se hizo: `docs/re-didi/INFORME-07-captura-en-ejecucion.md`) |
| 4 | **Panel web del comerciante** (la otra cara del proceso) | publicar, pedidos, verificación de documento | `myseller.taobao.com` (JS legible; hoy el material es el **instalador**, no el panel) |
| 5 | **Pantalla + volcado de vistas** | UI medida en **dp**, estados, anatomía de tarjetas | `docs/RE-关注-TIENDAS.md`: celda 98,7×34,7 dp; pastilla 57,7×11,7; 21 categorías 7×3 |
| 6 | **Experimentos, flags y trackers** | inventario de features y su estructura A/B | nombres de experimentos medidos en el contenedor del inicio |

**La fuente 3 es la que más lógica de negocio «de verdad» da** (qué manda el servidor, qué campos, qué
reglas visibles), y es justo la que aún no hemos explotado en el Mercado. Para el taxi ya se hizo.

---

## 3 · Lo que ya tenemos de RE, servicio por servicio (medido en disco hoy)

| servicio | app de referencia | material en disco | estado |
|---|---|---|---|
| **Mercado** (compra online) | Taobao | `taobao/` **270 MB**, 246 plantillas, taller `mercado-fase1/` (9 carpetas), oráculo **155 pruebas**, `docs/RE-关注-TIENDAS.md` | **alto** |
| **Taxi** | DiDi | `docs/re-didi/` **23 ficheros** (19 informes: inventario, lógica, ciclo de vida, conductor, motor, pagos, programados…) | **alto** |
| **Interurbano** | (por elegir) | `intercity/` en el taller; **falta inventario con prueba** | medio/bajo |
| **Comida** | Meituan / Eleme | — | **nada** |
| **Hoteles** | Ctrip / Booking | — | **nada** |
| **Red social** | (por elegir: Xiaohongshu / Instagram) | — | **nada** |
| **Mensajería** | WeChat | — | **nada** |
| **Monedero/pagos** | Alipay | `mercado-fase1/ta-pagos` (parcial) | bajo |

>> **Ya está hecho, con prueba en disco**: [INVENTARIO-MATERIAL-V2.md](INVENTARIO-MATERIAL-V2.md) (17/10).
> Incluye el hallazgo del **panel Qianniu en Electron ya extraído** (`taobao-desktop/`: `app.asar` 242 MB,
> 18 MB de JS legible) y los huecos comunes (capturas HAR).

La conclusión de este inventario: **no hay que empezar por los servicios con menos material, sino por los
dos que ya lo tienen** (Mercado y Taxi) para fijar el método con coste bajo, y usar ese molde en el resto.

---

## 4 · «Desde cero por servicio»: qué sí y qué no

Con **0 usuarios y sin publicar**, reescribir **pantallas y flujos** por servicio es barato y sano: no hay
migración, no hay compatibilidad, no hay usuarios a los que romper. Eso es «de cero por servicio» y **sí**.

Lo que **no** hay que rehacer es **la fábrica**, porque ya está pagada y cerrada:
[LEY-DEL-PROYECTO.md](LEY-DEL-PROYECTO.md) (método), [CONTRATO-UI.md](CONTRATO-UI.md) (contrato
versionado + 14 tipos), [KIT-UI.md](KIT-UI.md) (guía + dos lecciones), `npm run verificar` (5 guardias),
despliegue desde git con humo ([PLAN-B-NUCLEO.md](PLAN-B-NUCLEO.md) §costura 3) y el oráculo.

**Modelo recomendado (v2)**:

```
        FÁBRICA (se conserva)                        SERVICIOS (se rehacen, uno a uno)
  contrato · kit · guardias · entrega · oráculo   →   mercado · taxi · comida · …
        shell v2: navegación, sesión, diseño                cada uno desde su SPEC de RE,
        (rama aparte, detrás de flags)                      con ficha, rebanadas y retirada de lo viejo
```

Rehacer la fábrica sería repetir los **cinco choques** documentados en la ley; rehacer las pantallas es
donde está el valor.

---

## 5 · El método por servicio (el que ya funciona)

1. **Inventario de material** con prueba (las 6 fuentes de §2, y qué **no** hay).
2. **3–7 flujos núcleo**, no «todo el servicio». Ejemplos:
   - **Taxi**: pedir · asignar · seguir en mapa · pagar · cancelar · programado.
   - **Mercado**: publicar · buscar/filtrar · ficha · comprar/pagar · entrega · devolver/disputa.
   - **Comida**: menú · carrito · pedido · cocina · reparto · cierre.
   - **Social**: publicar · feed · comentar · mensaje directo · perfil.
   - **Monedero**: recargar · pagar · retirar · movimientos.
3. Por cada flujo, una **ficha** (evidencia, alcance, costura, aceptación, fuera de alcance, coste).
4. Rebanadas con flag, verificación en móvil (2 estados) y **retirada** de lo viejo en el mismo commit.
5. Regla: **extraer para especificar, no para copiar**.

---

## 6 · Estimación honesta (por flujo, con esta fábrica)

| fase | por flujo |
|---|---|
| Material (captura + volcado + lectura) | 0,5–2 días |
| Especificación (ficha + medidas) | 0,5–1 día |
| Implantación (backend + árbol + pantalla) | 2–5 días |
| Verificación (móvil 2 estados + pruebas) | 0,5–1 día |

Un servicio «núcleo» de 5 flujos ≈ **3–6 semanas**. «Todo Taobao» no es un objetivo: son años y no
aporta lo que el usuario nota. **El 20 % de los flujos da el 80 % de la sensación de producto.**

---

## 7 · Lo que necesito de ti para arrancar

1. **Decidir el primer servicio del v2**: recomiendo **Mercado** (material alto, casi cerrado) y en
   paralelo **Taxi** (material ya en disco; 19 informes).
2. Para cada servicio, **cuenta de prueba en la app de referencia** y permiso para **capturar red** en el
   teléfono (la fuente 3, que es la que da contratos y reglas visibles).
3. **Decidir el arranque**: shell v2 en **rama aparte** detrás de flags (recomendado), o seguir en el árbol
   actual creando módulos nuevos. Yo recomiendo lo primero: no rompe nada y se compara en el mismo móvil.
