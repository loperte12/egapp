# Ficha · v2 · Pantalla semilla + panel de rejilla (categorías)

```
Módulo:            mercado (shell v2)
Rebanada:          pantalla semilla /ecomerse-v2 + sección `v2-categorias` (panel 3 columnas)
Fecha:             2026-10-17
Estado:            en vuelo (código y pruebas hechos; falta verificación en móvil del despliegue)
Flag:              no hace falta: es una pantalla NUEVA, no sustituye nada todavía
Sustituye a:       nada (la retirada de la lista vieja ya se hizo en su propia ficha)
```

## 1 · Evidencia

| # | Qué se observó | Fuente exacta | Tipo |
|---|---|---|---|
| 1 | El panel de 分类 es una rejilla **3 × N**: celda **98,7 × 34,7 dp**, columnas en x 18,3 / 130,7 / 243, hueco horizontal **13,7**, paso vertical **42,3** (hueco **7,6**), primera fila **y=242** | `docs/RE-关注-TIENDAS.md` §3 · volcado `171025-tao-关注-dump-分类.xml` | observado |
| 2 | **分组 usa la misma rejilla** con emoji + rótulo | mismo volcado (`-分组.xml`) | observado |
| 3 | Las categorías del Mercado son **18 departamentos reales** (no una lista de ejemplo) | `ecomerse.service.js:511` · `this.ecomerse.categories()` | observado |
| 4 | Se puede componer **sin tipos nuevos**: existe `Lista` con `COLUMN_COUNT`/`COLUMN_SPACING`/`ROW_SPACING` y celda `Contenedor` + `Texto` | `listaAtributos.ts` (claves medidas) · `rejillaAtributos.ts` | observado |
| 5 | La clave `GRAVITY` del motor es `d35754e84f6522f6` (4 = center) y **no** está en la copia `K` del controlador | `contenedorAtributos.ts:91` · paridad fallida, vista en la prueba | observado |

**Inventario de material**: ✅ `docs/RE-关注-TIENDAS.md` (medidas + volcados) · ✅ dos servidores en el repo ·
✅ oráculo. **No** hace falta captura de red para esta rebanada (es geometría, no contrato de datos).

## 2 · Alcance de AHORA

- **Se entrega**: una ruta nueva `/ecomerse-v2` que pinta, desde el servidor, un panel de categorías de
  **3 columnas** con las 18 categorías reales, y sus **estados** (cargando / error con reintento / vacío).
- **No se entrega**: chips de filtro (`全部`/`上新`/`分类`…), tarjeta de publicación, fila de avatares con
  contador. Son **otras rebanadas** (la primera que necesita tipo nuevo obligará a decidir el esquema 2).
- **Por qué esta primero**: coste de material **0** (ya medido), **no sube el esquema** y estrena el ciclo
  completo del v2 (sección en los dos servidores + pantalla + prueba + despliegue).

## 3 · Costura

- [x] **Contrato** — no cambia: se añade una **ruta** (`v2-categorias`) con un árbol compuesto por tipos
      existentes (compatible, `CONTRATO-UI.md` §3.1). El esquema sigue en **1**.
- [x] **Kit** — no se toca ningún componente: `Contenedor`, `Texto` y `Lista` ya existen.
- [x] **Entrega** — la ruta entra en el **controlador desplegado** y en el **servidor local** (los dos,
      con paridad probada). El despliegue publica el controlador (ya viaja por git).

## 4 · Aceptación (escrita antes)

- **Pruebas**: `test/v2-panel.test.mjs` (4) — paridad local/controlador en oscuro y claro · solo tipos de
  la lista blanca · geometría medida (3 columnas, 34,7, 13,7/7,6) · datos reales sin «Recomendado».
- **Guardias**: `npm run verificar` en verde (tsc = base 5, diseño, lógica, rutas con la ruta nueva,
  oráculo **159**).
- **Móvil**: `/ecomerse-v2` muestra el panel con las categorías en 3 columnas; y **sin red** (modo avión)
  muestra «No se pudo cargar…» con **Reintentar**. Capturas.
- **Despliegue**: la ruta `/api/ecomerse/ui/v2-categorias` responde `{esquema:1, arbol, datos}` en
  producción.

## 4.1 · Verificación (17/10/2026)

| comprobación | resultado |
|---|---|
| \
pm run verificar\ | ✅ verde: tsc 5 = base · diseño · lógica · **rutas 138, mapa al día** · oráculo **159/159** |
| Despliegue | ✅ 6 ficheros versionados y limpios · guardia «vivo» ✓ · subida con etag ✓ · **humo** 200 y esquema 1 ✓ |
| **Ruta en PRODUCCIÓN** | ✅ \GET /api/ecomerse/ui/v2-categorias?tema=oscuro\ → **200** con \esquema:1\ y **18 categorías**; respuesta guardada en \docs/evidencia/171025-v2-panel-produccion.json\ (tardó un poco: SCF sirvió una instancia vieja las primeras peticiones — anotado) |
| **Móvil** | ⏳ **PENDIENTE**: el teléfono no apareció por USB (\db devices\ vacío) al cerrar. **No se afirma probado.** Para cerrarla: \db reverse tcp:8081 tcp:8081\ → abrir \egrouteplan://ecomerse-v2\ → captura; y modo avión para el estado de error |

## 5 · Fuera de alcance

| Qué no se hace | Por qué | Cuándo se revisa |
|---|---|---|
| Navegar de la celda a la categoría | el árbol ya manda `$item.id`, pero el destino es otra pantalla | siguiente rebanada |
| Chips de filtro y estado seleccionado | otra pieza (necesita interacción y estado) | siguiente rebanada |
| Emoji en los grupos | es del panel de 分组; primero el de categorías | cuando toque 分组 |

## 6 · Coste

- **Material**: 0 (medido ya en `RE-关注-TIENDAS.md`).
- **Implementación**: ~150 líneas (dos servidores + pantalla) y 4 pruebas.
- **Verificación**: `npm run verificar` + móvil (normal y sin red) + despliegue con humo.
