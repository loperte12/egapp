# 关注 en Taobao: qué dice el material que tenemos, y qué NO dice

**Para qué es este documento.** Antes de tocar nada, el dueño del producto pidió el esquema real de la
sección de Seguidos (关注) «basándome en el material de ingeniería inversa que ya tenemos». Este
documento hace eso, **con la cita de dónde sale cada cosa** — y dice **lo que el material no tiene**,
que es la mitad de la respuesta y la parte que evita inventar.

**Fecha**: 17/10/2026 · **Material**: APK de Taobao desempaquetado en
`D:\Users\nisang12\AppData\Local\Programs\DeepSeek Harness\taobao\` (72,7 MB de `base.apk`), más el
taller `mercado-fase1\`.

---

## 1 · El hallazgo que cambia el trabajo

**En Taobao hay DOS cosas distintas que se llaman «关注», y el material solo tiene una.**

| | qué es | qué la sirve | ¿la tenemos? |
|---|---|---|---|
| **A · 关注 del INICIO** (`businessType: subscribe`) | el **feed** de lo que publican los que sigues: directos, vídeos, novedades | motor **Fluid/Dinamic** (pantalla generada por el servidor) | ✅ **sí** — es la que cloné |
| **B · la página de TIENDAS SEGUIDAS** (la que tú describes: 全部 · 上新 · 分类 + 买过 · 特别关注 · 常逛) | la **lista de comerciantes** con sus avatares, pestañas y grupos | **servidor** (no hay contenedor en el APK) | ❌ **no** |

Y la diferencia no es un matiz: **A es un feed de contenido**; **B es una agenda de comerciantes**.
Lo que hay hoy en la app es A. Lo que tú describías —avatares con indicadores, pestañas 全部/上新/分类,
secciones 买过/特别关注/常逛— es **B**, y **B no está en el material**.

---

## 2 · Lo que SÍ está evidenciado (para A, y vale para entender el sistema)

### 2.1 · La barra de pestañas del inicio, tal cual viene del APK

De `jadx-res\resources\assets\awesome\container_newface_home_main.json`, que es la **página del inicio**
que el APK trae en disco (no una captura: el fichero que la app usa):

| texto | tabId | businessType | qué significa |
|---|---|---|---|
| **关注** | `subscribe` | `subscribe` | **el feed de seguidos** ← el que cloné |
| **推荐** | `recommend` | `recommend` | el feed recomendado |
| 闪购 · 国补 · 年货节 · 飞猪 | `eleme` · `zhengfubutie` · `1000000100087401527` · `fliggy` | `campaign` | **campañas** (pestañas de anuncio) |
| 穿搭 · 居家 · 美食 · 数码 · 新品 · 运动 | `pindao_0005` · `pindao_0002` · … · `newArrival` | `dxContainer` | **canales de categoría** (contenedores DX/Dinamic) |

**Lo que esto enseña sobre el diseño del sistema** (y es la lección de arquitectura, no un detalle):
- El carril de pestañas **no tiene un tipo de pestaña**: tiene **cuatro** (`recommend`, `subscribe`,
  `campaign`, `dxContainer`), y cada una se sirve de su manera.
- **La pestaña no filtra el contenido: elige la FUENTE del contenido.** Eso mismo lo apliqué en
  Mercado con los dos carriles (feed de tablas + categorías), pero aquí se ve el modelo completo.

### 2.2 · Los estados de la pestaña de Seguidos (evidencia exacta)

De `res\values\strings.xml` — recursos **`fluid_sdk_follow_tab_*`**, que son los textos de reserva del
motor Fluid para esa pestaña:

| recurso | texto real | cuándo |
|---|---|---|
| `fluid_sdk_follow_tab_no_login` / `_tips` | 您还未登录 / 登录帐号，看你关注的精彩内容 | sin sesión |
| `fluid_sdk_follow_tab_no_content` / `_tips` | 没有新的关注作品 / 快去关注些新朋友吧 | **sin novedad** |
| `fluid_sdk_follow_tab_network_error` + `_refresh` / `_report` / `_tips` | 页面加载失败 + 刷新 + 报错 + 别紧张，试试看刷新界面～ | error de red |
| `fluid_sdk_follow_tab_content_deleted` | 此内容已被删除 | contenido borrado |

**Lo que enseña**: la pestaña de 关注 distingue **cuatro estados**, no dos: **sin sesión ≠ sin novedad
≠ error ≠ contenido borrado**. En Mercado hoy tenemos «vacío» y «sin red»; faltan **sin sesión** (que se
sirve como «login para ver tus seguidos») y **contenido borrado**.

### 2.3 · Los otros dos contenedores del inicio

- `container_newface_home_sub.json` → **`Page_Home`**: la pantalla de **canales** (iconos en **doble
  fila**, `iconVersion: doubleRowNew`, `cornerRadius: 6`, `defaultCardWidth: 175.5`, indicador
  `#FF6D2A`, fondo `#FFFFFF`, texto `#333333`, `emptyTitle: 这里空无一物，快来添加你喜欢的频道吧～`).
  **No es la página de seguidos**: es «mis canales».
- `container_recommend_my_taobao.json` → **Mi Taobao** (`recommend_my_taobao`), 10 secciones que **el
  servidor rellena** (en el APK vienen vacías, sin nombre).

### 2.4 · Y la única pista de la página de tiendas seguidas (B)

En el contenedor del inicio aparece un **nombre de experimento A/B**:
`「139281#分类tab在上新样式放量的副本」` → «*la copia del experimento que suelta la pestaña 分类 con el
estilo de 上新* ».

**Eso confirma** que la página de tiendas seguidas tiene, al menos, **pestaña 分类** y una **vista 上新**
(y que se prueban por separado). **Y no confirma nada más**: ni el orden, ni el contenido, ni cómo son
los avatares. Es una pista, no un plano.

---

## 3 · Lo que el material NO tiene (y por qué no lo puedo dibujar)

Búsqueda sobre **todo** el material (APK + assets + recursos + taller), por texto exacto:

| texto pedido | apariciones | dónde |
|---|---|---|
| **特别关注** | **0** | — |
| **我的关注** · **店铺关注** · **关注的店铺** | **0** | — |
| **买过** (como pestaña) | 1, y **no es eso**: `你还没有购买过任何宝贝哦` (mensaje de historial de compras) | `strings.xml` |
| **分组** | 9, y **no son de Seguidos**: 移入分组 · 移出分组 · 请至少选择一个宝贝才能创建分组 · 店铺/分组下没有商品哦 | `strings.xml` → **es la agrupación de 收藏 (favoritos)** |
| **常逛** | 1: `mtb_generalsettings_default.json` (ajustes de Mi Taobao) | — |
| **全部** · **上新** · **分类** | sí, pero genéricos (menús, canales, ajustes) | varios |

**Y el motivo de fondo, que es lo importante**: de los **6 contenedores de página** que el APK trae
(`newface_home_main`, `newface_home_sub`, `recommend_multi_channel`, `recommend_my_taobao`,
`recommend_orderlist_catapult_main`, `newface_home_intl`), **ninguno es la página de tiendas seguidas**.
Esa pantalla la **genera el servidor** (Dinamic/Fluid) y **no viaja en el APK**. Los textos que la
nombran tampoco están en el APK por la misma razón: los manda el servidor.

> **17/10/2026 — esto ya no es cierto.** Con el **teléfono conectado** se volcó la jerarquía de vistas de
> la página real (`uiautomator`) y se capturaron sus estados. El plano de **B**, con medidas en dp, está
> en **[RE-关注-TIENDAS.md](RE-关注-TIENDAS.md)**: avatares con pastilla de contador, carril de filtros,
> panel de rejilla compartido por 分类 y 分组, y anatomía de la tarjeta de publicación.
> Lo que sigue valiendo es que **no está en el APK** (la genera el servidor): el material de B es
> **captura en ejecución**, no artefacto.
**Conclusión, dicha sin rodeos**: con el material actual **se puede** documentar el feed de 关注 (A) y
los estados de su pestaña; **no se puede** documentar la página de tiendas seguidas (B). Dibujarla ahora
sería inventarla, y eso es peor que decir que falta.

---

## 4 · Lo que hace falta para tener el plano de verdad (B)

Cualquiera de estas tres, por orden de calidad de evidencia:

1. **Una captura de red de la app abriendo 关注** (HAR o mitmproxy). Es **la mejor**: las respuestas del
   servidor traen el árbol completo (pestañas, secciones, tarjetas y textos) y se puede leer como el
   contrato que ya usamos. Existe la herramienta para analizarla **sin** volver a navegar
   (`inspect_web_network_capture`).
2. **Capturas de pantalla de la página**, en sus estados: con seguidas, sin seguidas, con 上新, en 分类,
   y con las secciones 买过/特别关注/常逛 si aparecen. De ahí se saca layout, jerarquía y microcopy, que
   es la mitad de lo que pides (los avatares con sus indicadores, sobre todo).
3. **El panel del comerciante** (Qianniu) da la cara **del otro lado** del mismo proceso: qué ve el
   comerciante cuando alguien le sigue, y qué documentos/estados gestiona. No sustituye a (1) ni a (2).

**Lo que NO hace falta**: seguir suponiendo. Con (1) o (2) puedo entregar el mismo tipo de esquema que
ya tenemos para el feed (medidas incluidas), y entonces sí, corregir la sección.

---

## 5 · Resumen para decidir

- **A (feed de 关注)** — clonado y funcionando; su barra, sus estados y sus tarjetas están documentados
  con evidencia (§2). Le faltan dos estados: **sin sesión** y **contenido borrado**.
- **B (tiendas seguidas)** — **no está en el material**. La pista del experimento dice que tiene
  pestaña **分类** con estilo **上新**, y nada más.
- La diferencia que tú ves es real y ahora está localizada: **no es que la sección esté mal hecha; es
  que es otra sección** (A en vez de B).

**Petición concreta**: una captura de red o de pantalla de la página de tiendas seguidas de Taobao. Con
eso entrego el plano de B con el mismo detalle que el de A, y solo después se implementa.
