# INFORME — El flujo de hotel: pantallas, tarjetas e inconsistencias visuales

**28-sep-2026 · Kai** · Responde a tres preguntas concretas. **Lo que está medido y lo que no, va
marcado**: la §0 explica por qué la primera fuente pedida no ha podido usarse.

---

## 0 · El bloqueo, primero: MasterGo no tiene lienzo en línea

Se pidió el análisis **contra los frames de MasterGo**. **No se ha podido hacer, y no por un error de
lectura: no hay lienzo que leer.** La evidencia, en orden:

| Comprobación | Resultado |
|---|---|
| El servidor MCP responde | ✅ `@mastergo/vibe-mcp` **1.0.31** — es la `latest` de npm, sin actualización pendiente |
| El cliente de MasterGo está abierto | ✅ `MasterGo.exe` corriendo (15 procesos en `tasklist`) |
| `get_selection_node` | ❌ **`no online mg canvas`** |
| `get_variables` | ❌ **`no online mg canvas`** |
| `get_library_list` | ❌ **`no online mg canvas`** |
| ¿Hay rastro de uso anterior? | ❌ **no existe `.mastergo/`** en `D:\egapp`, en `D:\Routeplan` ni en el workspace |

**Diagnóstico:** el **proceso** del MCP está vivo y el **cliente** está abierto, pero **ningún fichero
está conectado**. El error `no online mg canvas` significa exactamente eso — no que falte el programa,
sino que falta la **sesión de lienzo**.

**Para desbloquearlo** (según el doc oficial, `mastergo.com/help/ai-features/vibe-mcp.html`): abrir el
fichero de destino en el cliente de escritorio **o** en el web y, **en ese cliente**, ver el estado
**«MCP 服务端启动并已连接»**. Un detalle que confunde: **ver la página de MasterGo en el navegador
interno del agente NO cuenta** — la única señal válida es la que muestra el propio cliente.

**Consecuencia:** no hay ni un solo frame legible → **cero datos de color y de espaciado del fichero de
diseño**. Las tres respuestas que siguen están **medidas sobre el código de `D:\egapp`**, que es la otra
fuente de verdad y la que rige de hecho (toda la reconstrucción de UI de este proyecto se ha hecho
contra el código, con las 30 fotos de Meituan como referencia visual). **No se han inventado cifras de
diseño para rellenar el hueco.**

---

## 1 · ¿Cuántas pantallas cubren el flujo de reserva?

`app/` tiene **15 ficheros `lifebook-hotel*`**. El **flujo de reserva del huésped son 6 pantallas**, y
están todas en el árbol:

| # | Pantalla | Fichero | Qué hace |
|---|---|---|---|
| 1 | **Buscador + lista** | `lifebook-hotel.tsx` | la home del módulo: ciudad, fechas, ocupación y la primera página de resultados (H3) |
| 2 | **Lista completa** | `lifebook-hotel-resultados.tsx` | «ver la lista completa» con el filtro y el orden |
| 3 | **Fechas** | `lifebook-hotel-fechas.tsx` | elegir la estancia a pantalla completa |
| 4 | **Ficha** | `lifebook-hotel-detalle.tsx` | las habitaciones y las reseñas del alojamiento |
| 5 | **Reserva / pago** | `lifebook-hotel-reservar.tsx` | **aquí se cobra**: `depositPercent`, `paymentMethod`, «Señal a pagar AHORA», `holdExpiresAt`, `paymentStatus` |
| 6 | **La reserva hecha** | `lifebook-hotel-reserva.tsx` | el estado del pedido, con los relojes en ISO |

**Las otras dos del huésped no son del flujo**, son posteriores: `lifebook-hotel-reservas.tsx` (mis
reservas) y `lifebook-hotel-resena.tsx` (valorar una estancia terminada).

**Y hay un segundo producto dentro del mismo módulo:** el **panel del hotelero, 7 pantallas** —
`panel` · `gestion` · `habitaciones` · `habitacion` · `perfil` · `calendario` · `valoraciones`. Ese
bloque **no es el flujo de reserva** y está fuera del alcance que se fijó para el rediseño.

> **Respuesta corta: 6 pantallas** (búsqueda → listado → fechas → ficha → pago → reserva hecha), más
> 2 de posventa y 7 del hotelero = 15 ficheros.

---

## 2 · ¿Qué componentes de tarjeta de hotel ya existen?

**Extraídos como componente propio (4 + 1 base):**

| Componente | Fichero | Qué es |
|---|---|---|
| **Tarjeta de resultado** | `components/HotelResultCard.tsx` | la tarjeta del hotel en la lista (hecha en `P1`) |
| **Tarjeta de habitación** | `components/hotel/HotelRoomCard.tsx` | el tipo de habitación: foto, servicios con icono, condiciones, precio y **un** botón (hecha en `P2`) |
| **Barra de fechas** | `components/hotel/HotelDateRange.tsx` | la barra `Llegada/Salida` y su hoja de calendario |
| **Hojas de selección** | `HotelCitySheet` · `HotelGuestsSheet` · `HotelPriceSheet` | ciudad, ocupación y precio |
| *base de las hojas* | `components/lifebook/ui/Sheet.tsx` | la hoja que usan las tres |

**Y tarjetas que existen pero NO están extraídas** —viven dentro de su pantalla—, que es donde está el
trabajo pendiente si se quiere una tarjeta coherente en todo el módulo:

- `Resena` — la tarjeta de una opinión, en `lifebook-hotel-detalle.tsx:632`
- `Tarjeta` — la tarjeta del panel del hotelero, en `lifebook-hotel-panel.tsx:321`
- `EsqueletoTarjeta` y `Sello` — en `lifebook-hotel-habitaciones.tsx:440` y `:398`
- `Linea` — la fila de importe, **duplicada** en `lifebook-hotel-reserva.tsx:442` y `lifebook-hotel-reservar.tsx:590`
- `Paso` y `Campo` — en `lifebook-hotel-reservar.tsx:606` y `:634`
- `Bloque` y `Contador` — duplicados entre `lifebook-hotel-habitacion.tsx` (`:486`, `:505`) y `lifebook-hotel-perfil.tsx` (`:419`, `:435`)

> **Dos duplicados reales** que conviene unificar cuando toque: **`Linea`** y **`Bloque`/`Contador`**.

---

## 3 · Informe de inconsistencias visuales

La fuente es **la guardia de diseño** (`pruebas/verifica-diseno.cjs`), que cuenta **literales escritos a
mano** allí donde existe un token del kit. Estado **hoy**:

```
hex 0 · fontSize 0 · borderRadius 0 · fontWeight 0 · borderWidth 7 ·
espaciado 183 · precioFigura 5 · strokeWidth 0
```

### 3.1 · Lo primero: la guardia está EN ROJO, y el cambio no es de esta tanda

```
FALLO: 2 archivo(s) han empeorado respecto a la base:
  app/lifebook-hotel-detalle.tsx → borderWidth: 0 → 1
  components/PhotoGallery.tsx    → borderWidth: 0 → 1
```

La causa está localizada y es **una línea por fichero**:

```ts
// app/lifebook-hotel-detalle.tsx:719  ·  components/PhotoGallery.tsx:227
tabBtn: { paddingVertical: espaciado.e8, borderBottomWidth: 2, borderBottomColor: 'transparent' },
```

…es decir, un **`2` escrito a mano** donde el propio fichero **ya usa `trazo.fuerte`** tres líneas más
arriba, en el borde de la pestaña activa. **Es el error más repetido de este proyecto**: el token
aparece en el estilo dinámico y el literal se queda en el estático. El arreglo es sustituir el `2` por
`trazo.fuerte` en las dos.

**Y son cambios SIN COMMITEAR** (`git status`: esos dos ficheros, más `docs/Muni-Dinero-propuesta.md` y
`_build-prueba.log`; `mtime` 27-sep **22:39 y 22:45**). No los escribí yo: son la implementación en
curso de **D8** (pestañas) y **D10** (galería por pestañas).

### 3.2 · Lo que las pestañas se han llevado por delante

La misma tanda **rompe dos comprobaciones de C-1** (`pruebas/c1-verifica-app.cjs`, que hoy sale con
**2 fallos**):

```
FALLA  la nota de la cabecera baja a la sección (D1)
FALLA  la sección de reseñas va DESPUÉS de las habitaciones (hab 15414 < res -1)
```

No es un fallo del código nuevo: es que **las pestañas eliminan el mecanismo que D1 usaba**
(`yContenido`/`yResenas`/`scrollTo` ya no tienen sentido cuando las reseñas son otra pestaña). **D1 hay
que reescribirlo, no el código** — pero eso es una decisión, y hoy está sin tomar.

Además, la etiqueta de la primera pestaña en el árbol es **`Habitaciones (8)`**, mientras que la
decisión aprobada (**D8**) decía **`Reservar`**. Es un cambio de una palabra visible: **conviene
confirmarlo o revertirlo a propósito**, no dejarlo pasar.

### 3.3 · El estado real de la deuda, por familias

| Familia | Antes | Hoy | Lectura |
|---|---|---|---|
| `hex` | 189 | **0** | cerrada |
| `fontSize` | 649 | **0** | cerrada |
| `borderRadius` | 688 | **0** | cerrada |
| `fontWeight` | 1.948 | **0** | cerrada |
| `strokeWidth` | 33 | **0** | cerrada |
| **`borderWidth`** | 528 | **7** | **5 por diseño + 2 regresiones de hoy** |
| **`espaciado`** | 5.402 | **183** | la deuda viva más grande |
| **`precioFigura`** | 50 | **5** | 5 archivos, 1 cada uno |

**Seis de ocho familias están a CERO** y las que quedan están acotadas:

- **`espaciado` (183)** es la única cifra grande. Está repartida por toda la app, **no** concentrada en
  el hotel.
- **`precioFigura` (5)** sí es accionable y está localizada: `app/lifebook-carrito.tsx`,
  `app/lifebook-product/[id].tsx`, `app/monedero-movimientos.tsx`, `app/monedero.tsx` y
  `components/lifebook/SelectorDeVariante.tsx` — **una cada uno**, y las cinco deben pasar a `<Precio>`.
  **Ninguna es del hotel.**

### 3.4 · Un punto ciego de la guardia, que conviene saber

El patrón que cuenta `borderWidth` es `(?:border|border(Top|Bottom|Left|Right))Width`. **No cubre
`minWidth`/`maxWidth`/`width`.** Y hay un caso real en el código nuevo:

```ts
tabBtn: { …, minWidth: 80, alignItems: 'center' },
```

Ese `80` **no lo ve nadie**: no es `espaciado` (que solo mira `padding`/`margin`/`gap`) ni `borderWidth`.
**No es deuda declarada** —puede ser una restricción de layout legítima—, pero **es una familia sin
trinquete**: si mañana alguien escribe anchos fijos por toda la app, la guardia no dirá nada.

---

## 4 · Lo que este informe NO dice

- **No hay ni una medición del fichero de diseño de MasterGo.** Colores, espaciados y tamaños **del
  diseño** siguen sin leerse (§0). Lo de §3 es la deuda del **código** frente a los tokens del kit.
- **No se ha revisado la coherencia visual en pantalla** de esta tanda: los cambios de D8/D10 están sin
  commitear, sin compilar y **sin medir en el móvil**.
- **Los dos fallos de `c1-verifica-app`** pueden ser correctos por diseño (con pestañas, D1 cambia de
  forma). **Pero hoy la guardia está roja y nadie ha escrito por qué.** Eso es lo que hay que cerrar.
