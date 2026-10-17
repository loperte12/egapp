# Ficha · v2 · Carril de filtros (pastillas) + panel al elegir 分类

```
Módulo:            mercado (shell v2)
Rebanada:          fila de filtros con selección; `?activa=categorias` compone el panel
Fecha:             2026-10-17
Estado:            código y pruebas hechos; falta el móvil (sin dispositivo) y el humo en producción
Flag:              no hace falta (pantalla nueva del v2)
Sustituye a:       nada
```

## 1 · Evidencia

| # | Qué se observó | Fuente exacta | Tipo |
|---|---|---|---|
| 1 | La pastilla mide **50 × 28,7 dp** con el texto (24,7) dentro ⇒ alto **28,7** y relleno horizontal **12,6** | `docs/evidencia/171025-tao-关注-dump-feed.xml` (nodo `FrameLayout` en y=201,7) | medido |
| 2 | El hueco entre pastillas es **≈5,7 dp** (centros de texto a 55,7 con pastillas de 50) | mismo volcado, textos de 全部/上新 | derivado de lo medido |
| 3 | La fila es **desplazable** y lleva: 全部 · 上新 · 分类▾ · 双11 · 买过 · 特别关注 · 常逛 · 分组▾ | `RE-关注-TIENDAS.md` §3 + volcado con filtros desplazados | observado |
| 4 | 买过 / 特别关注 / 常逛 / 分组 **no existen en el Mercado** | `ecomerse.service.js` · `consultaDeCatalogo` (sólo departamento/familia/buscar/orden) | observado |
| 5 | El radio de la pastilla y el color de selección **no están** en el volcado | — | **ausente** |

**Decisiones declaradas** (porque la evidencia no las trae): radio **8**; color de selección =
**naranja de marca con texto blanco** (Taobao usa naranja suave con texto naranja; no se copia su color
exacto, y así no hay dos naranjas distintos en la app).

## 2 · Alcance de AHORA

- **Se entrega**: la fila de filtros con **sólo los filtros que el producto tiene de verdad** (`全部`,
  `分类▾`); la **selección** se ve; **elegir 分类 compone el panel de rejilla en el mismo árbol** (cosa
  del servidor, no de la pantalla); tocar otra pastilla vuelve a pedir la sección.
- **No se entrega**: 买过 / 特别关注 / 常逛 / 分组 (no existen en nuestro producto: pintarlas sería
  mentira), ni `上新` (el catálogo no tiene orden «novedades» todavía).

## 3 · Costura

- [x] **Contrato** — **no cambia el esquema** (sigue en 1): `Scroll` + `Contenedor` + `Texto` + `Lista`.
      Se añade **una ruta** (`v2-filtros`) con el patrón `?activa=` que ya usa la barra de categorías.
- [x] **Kit** — no se toca ningún componente.
- [x] **Entrega** — el árbol va en los **dos** servidores (local y controlador) con paridad probada.

## 4 · Aceptación

- **Pruebas** (`test/v2-filtros.test.mjs`, 5): paridad local/controlador en `activa=''` y `'categorias'`,
  oscuro y claro · sólo tipos de la lista blanca · geometría medida (28,7 / 12,6 / 5,7) · la pastilla
  elegida resaltada y el panel **sólo** con `分类` · datos con ids `todos`/`categorias`.
- **Guardias**: `npm run verificar` verde (oráculo **164**).
- **Móvil**: `/ecomerse-v2` muestra la fila; tocar **分类** hace aparecer el panel; captura. Estado de
  error: sin red, «No se pudo cargar…» con Reintentar.
- **Producción**: `GET /api/ecomerse/ui/v2-filtros?activa=categorias` → 200 con la fila **y** el panel.

## 5 · Fuera de alcance

| Qué no se hace | Por qué | Cuándo se revisa |
|---|---|---|
| Filtros 买过/特别关注/常逛/分组 | no existen en el producto; sería UI mentira | cuando existan esas features |
| `上新` | el catálogo no tiene orden «novedades» | cuando el backend lo exponga |
| Navegación de la pastilla a un listado filtrado | el filtro hoy sólo abre el panel | siguiente rebanada |

## 6 · Coste

Material **0** (medido) · implementación ~120 líneas (dos servidores + pantalla) · 5 pruebas ·
verificación: guardias + producción + móvil.
