# 关注 · la página de TIENDAS SEGUIDAS (B): lo medido en el Taobao real

**Qué es.** El plano de la pantalla que el dueño del producto describió («avatares con indicadores; 全部,
上新, 分类; 买过, 特别关注, 常逛, 分组»). Hasta hoy no teníamos material de ella
(`ESQUEMA-关注-TAOBAO.md` §3: no está en el APK, la genera el servidor). **Ahora sí**: el 17/10 se
capturó con el teléfono conectado, y no con fotos solamente — **se volcó la jerarquía de vistas**
(`uiautomator`) con textos y coordenadas.

**Método y unidades.** Teléfono con densidad **override 480 → 3 px por dp** (1080×2374 px = **360×791
dp**). Cada cifra de aquí es `px / 3`, sacada de los `.xml` de la evidencia. Lo que viene de la
**foto** y no del volcado se dice explícitamente.

**Evidencia** (en `docs/evidencia/`):

| fichero | qué es |
|---|---|
| `171025-tao-关注-dump-feed.xml` | árbol de vistas de la página, en 全部 |
| `171025-tao-关注-dump-分类.xml` | árbol de vistas con **分类** abierto |
| `171025-tao-关注-dump-分组.xml` | árbol de vistas con **分组** abierto |
| `171025-tao-关注-dump-filtros.xml` | árbol con la fila de filtros desplazada (para 常逛/分组) |
| `171025-tao-关注-B1..B4.png` | capturas de la página (feed, feed, 分类, 分组) |
| `171025-tao-关注-B3-分类-adb.png` · `B4-分组-adb.png` · `B5-filtros-desplazados.png` | capturas hechas por adb |

---

## 1 · Mapa de la pantalla (dp)

| región | y (dp) | alto | qué es |
|---|---|---|---|
| barra de estado | 0–24 | 24 | del sistema |
| **pestañas del feed** | 47–67 | ~20 | `关注`(activa) `推荐` `闪购`(insignia 外卖) `国补` `飞猪` `双11`(imagen) `穿搭` `美食` … desplazable |
| **buscador** | 79–111 | 31 | `扫一扫` 26×26 · campo 190,7×31 · `拍立淘` 23×23 · botón `搜索` 64,3×28,7 |
| **fila 关注店铺** | 140–183 | ~43 | avatares de tiendas con **pastilla de novedades** (ver §2) |
| **fila de filtros** | 207–224 | ~28 | `全部` `上新` `分类▾` `双11` `买过` `特别关注` `常逛` `分组▾` (desplazable) |
| contenido | 242– | — | feed de publicaciones (§4) o **panel de rejilla** (§3) |
| barra inferior | 735–791 | 56 | 首页 · 视频 · 消息 · 购物车 · 我的淘宝, ítems de 72×56 |

**Pestañas del feed**: separación entre centros **40,3 dp**, texto de ~18–20 dp de alto; la activa va en
naranja con subrayado. `双11` es una **imagen** (29,7×29,7), no texto — por eso no aparece como `TextView`.
Es el mismo carril que ya teníamos documentado en `ESQUEMA-关注-TAOBAO.md` §2.1.

---

## 2 · La fila de avatares (lo que preguntabas primero)

Primer ítem: **`关注店铺`** (acción: icono de tienda + rótulo), luego una tienda por ítem.

| pieza | medida | notas |
|---|---|---|
| **círculo del avatar** | **34,3 × 34,3 dp** (103×103 px) | medido en la foto; el dump no expone el `ImageView` con tamaño |
| **pastilla de novedades** | **57,7 × 11,7 dp**, arriba en **y=152 dp** | se superpone al borde inferior del avatar; ancho **variable** (51·57,7·57,7…) |
| **rótulo de la tienda** | 15,7 dp de alto, en **y=167,7** | ancho hasta ~53,7 y **se corta con `…`** (`TAICHIIS…`, `eggplan…`, `NORELI…`) |
| **paso entre ítems** | **60,6 dp** (centros x: 34,7 · 95 · 155,7 · 216,7 · 277 · 337,7) | 6 ítems visibles; la fila **se desplaza** |
| textos de pastilla | `{n}件预上新` · `{n}件新品` | vistos: «13件预上新», «230件新品», «9件预上新», «21件预上新», «19件新品» |

**Lo que esto significa**: la pastilla **no dice el estado del directo** — dice **cuántas novedades** tiene
esa tienda (pre-novedades o novedades), y es **por tienda**, con el número dentro. El rótulo se trunca; el
avatar no lleva aro ni emoji en esta captura (el aro/insignia de directo sí aparece en el **feed**, junto
al autor: primera captura, avatar de 华叔工装 con un icono pequeño de «en directo»).

---

## 3 · Los filtros y el panel de rejilla (分类 y 分组)

**Orden de los filtros**: `全部` · `上新` · `分类▾` · `双11` · `买过` · `特别关注` · `常逛` · `分组▾`.
Texto de 17 dp de alto, fila desplazable; `分类` y `分组` llevan **caret** (▾) porque **abren panel**.

**El panel de 分类** (abierto desde 分类): **21 categorías en una rejilla 7×3**:

| medida | valor |
|---|---|
| celda | **98,7 × 34,7 dp** |
| columnas (x) | **18,3** · **130,7** · **243** |
| hueco horizontal | **13,7 dp** |
| paso vertical | **42,3 dp** → hueco **7,6 dp** |
| primera fila | **y = 242 dp** (justo bajo los filtros); 7 filas → hasta ~530 |
| aspecto | rectángulo redondeado claro, texto centrado, **sin icono** |

Categorías, en orden de lectura: 女装 · 男装 · 鞋靴 · 箱包 · 内衣 · 食品 · 宠物 · 配饰 · 美护 · 运动 ·
健康 · 母婴 · 车品 · 潮玩 · 花艺 · 电子 · 家居 · 家装 · 文娱 · 清洁 · 定制.

**El panel de 分组**: **exactamente la misma rejilla** — mismas celdas, mismas columnas, misma fila
inicial (242 dp) — y cada celda lleva **emoji + rótulo**:

👖 百搭男鞋 · 👔 绅士衣橱 · 🧣 服饰搭配 · 👗 女神衣橱 · 🏃🏻‍♀️ 运动配饰

**Hallazgo**: 分类 y 分组 **no son dos pantallas: son el mismo panel** con contenido distinto (las
categorías del sistema frente a los grupos que crea el usuario). Eso ahorra un widget entero.

---

## 4 · El feed (anatomía de la tarjeta)

Medido con el volcado en la primera tarjeta, y el resto leído de la captura (el volcado **no** expone el
cuerpo del texto: es una vista pintada, sin texto accesible — eso se dice, no se supone):

| pieza | medida / dato |
|---|---|
| avatar del autor | ~34 dp, con **insignia de directo** (aro + icono) en la primera |
| nombre del autor | 57,3 × 19,3 dp en **y=248,3** |
| momento | 47 × 14,3 dp en **y=271,3** («1天前发布», «今天发布») |
| etiqueta **上新** | delante del texto, en verde y menor (foto) |
| cuerpo | 2–3 líneas, con **`…展开`** al final (foto) |
| **rejilla de fotos** | **3 columnas**, ~9 fotos cuadradas con separación pequeña (foto; ~80 dp por foto) |
| pie | «加购1 · 浏览15» a la izquierda; **corazón** y **comentario** a la derecha |
| menú | «⋯» arriba a la derecha de la cabecera |
| insignia de relación | en la 2.ª tarjeta: `｜ 特别关注` junto al momento (nodo a y=712, x=126,3) |

**Y las publicaciones no son tarjetas de producto**: son **posts** de la tienda (texto + fotos). El
producto se toca desde dentro del post. Es una diferencia de modelo, no de estilo: nuestro feed hoy
enseña **tiendas**, y este enseña **lo que publican las tiendas**.

---

## 5 · Los otros filtros (买过 · 特别关注 · 常逛)

Son **chips que filtran el mismo feed**, no secciones distintas (el dueño del producto los describió
como «secciones»; medido, son filtros):

- `买过` — publicaciones de tiendas donde has comprado.
- `特别关注` — las marcadas como especiales; en el feed, la tarjeta lleva el rótulo **`｜特别关注`**.
- `常逛` — las que más visitas.
- `分组` — panel de rejilla con los grupos del usuario (§3).

No hay en la captura una sección aparte de «买过/特别关注/常逛»; lo que hay es **un carril de filtros**.

---

## 6 · Qué falta por medir (declarado)

1. **El cuerpo del post** (tipografías y espaciados exactos del texto): el volcado no lo expone. Se
   podría medir por píxeles de la captura, pero es estimación, no medida del árbol.
2. **El estado vacío y el de error** de esta página (publicaciones nunca vistas / sin red).
3. **Las tiendas sin novedades**: ¿la pastilla desaparece o dice «0»? No está en la captura.
4. **El panel de 分组**: cómo se crea/edita un grupo (solo vemos la rejilla ya creada).
5. **`双11` como pestaña imagen** y otras pestañas-campaña: fuera del alcance del Mercado.

---

## 7 · Lo que esto cambia para la ficha de B

- **Contrato**: hay **piezas nuevas** que hoy no existen: (a) **fila horizontal de avatares con pastilla
  de contador**, (b) **carril de filtros que abre panel**, (c) **panel de rejilla 3×N reutilizable**
  (sirve para 分类 y 分组), (d) **tarjeta de publicación** (texto + rejilla de fotos + acciones). Son
  **tipos nuevos**, o sea **subir el esquema a 2** (`CONTRATO-UI.md` §3.2) — es una decisión, no un
  detalle.
- **Costura del kit**: (a) y (d) son widgets; (b) y (c) pueden ser **un solo** widget «Panel de rejilla»
  con su disparador. Eso reduce el trabajo.
- **Datos**: el servidor de hoy (`/ui/siguiendo`) manda tarjetas de **tienda**, no de **publicación**, y
  no tiene contadores por tienda. La ficha de B necesita **datos nuevos** (publicaciones y contadores),
  que es backend, no sólo árbol.

**Siguiente paso natural**: la ficha de B con **tres rebanadas** — (1) avatares con contador, (2) carril
de filtros + panel de rejilla, (3) tarjeta de publicación — y decidir de una vez si el esquema sube a 2.
