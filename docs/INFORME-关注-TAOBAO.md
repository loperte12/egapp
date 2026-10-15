# CÓMO ESTÁ CONSTRUIDA LA SECCIÓN 关注 DE TAOBAO

**Fecha**: 16/10/2026 · **Fuente**: la app de Taobao decodificada, `jadx-res/resources/assets/template/live_channel_flexalocal/taolive_channel_follow_*`
**Volcado crudo**: [`evidencia/161025-como-esta-construida-关注-taoBao.txt`](./evidencia/161025-como-esta-construida-关注-taoBao.txt)
**Script**: `mercado-fase1/re-e-categorias/seguir-construccion.mjs`
**Clon**: `components/ecomerse/seguirVariantes.ts` (las variantes) + `arbolDeSiguiendo` en los dos servidores

---

## 0 · Lo primero: qué es 关注

**No es una lista de tiendas: es el feed de DIRECTO de los que sigues.** Lo dicen las siete plantillas
(`taolive_channel_follow_*`), sus textos (`预告` · `回放` · `预约` · `已关注` · `基于你的关注推荐`) y sus
acciones (`TBLFollow`, el MTOP de suscripción, `preplayback_*`, `tblive_*`). Nuestra primera versión
—una lista de tiendas con su foto y sus seguidores— **era otra cosa**; esto la sustituye.

Las plantillas son **ALIDX** (binario compilado): el binario no se lee, pero **sus literales sí** —el
formato guarda, en orden, los nombres de componente, las claves de estilo y de datos, los colores y los
textos—. Extraerlos en orden es lo que enseña con qué está hecha cada variante.

---

## 1 · Las siete plantillas, una por una

### `taolive_channel_follow_common_title_card` · v15 · 690 B
La **tarjeta de título** de la sección. Un solo dato: `cardInfo.cardTitle`. Colores `#1C222E`,
`#F3F6F8`, `#11192D`.

### `taolive_channel_follow_live_card` · v112 · **29 267 B** — la grande
Es la tarjeta de directo **y todas sus variantes**, porque el motor lee `cardData[0]` y cambia:

| dato que mira | qué enseña |
|---|---|
| `liveInfo.roomStatus`, `streamStatus`, `feedType` | **en directo** (`visible`/`gone`/`invisible`) |
| `liveInfo.replayExpire` | **回放 — repetición** |
| `liveInfo.topIcon.{title,frontPicUrl}` | **预告 — el aviso del próximo** |
| `newPreLiveInfo` + `liveInfo.userSubscribe` | **预约 / 已预约** (la suscripción al estreno) |
| `liveInfo.recommendInfo.{title,type,picUrl}` | **基于你的关注推荐** (la recomendación dentro del feed) |
| `bigVenueAtmosphereInfo.{title,titleColor,preIcon,benefitText,benefitTextColor,backgroundColor}` | la capa de **atmósfera/oferta** |
| `atmosphereInfoMap.liveMidAtmo.benefitInfos[0]` | el **beneficio** a mitad de directo |
| `accountInfo.{accountName,accountId,accountHeadPic,follow}` | la **fila del creador** y el **botón de seguir** |
| `isSjsdCard`, `isFollowInsert` | la tarjeta **grande** del feed |

**Medidas y colores del fichero**: `pad`, `windowWidth`, **`175.58`** (ancho de tarjeta),
`match_parent`, `match_content`, `roundRect`, `centerCrop`, `#0E1119` `#FFFFFF` `#F3F6F8` `#FFF0F0`
`#FF000A` `#CD9858` `#FF3A74` `#FF3333` `#CACFD7` `#50607A` `#99338FFF` `#338FFF`.

**El vídeo**: `live_card_playerview` + `cardData[0].liveInfo.coverImg` — la tarjeta **lleva un
reproductor dentro**.

**El botón de seguir, con sus estados y su animación**: `channel_follow_guide_follow` /
`channel_follow_guide_followed` (关注 / 已关注), `followBorderAnimal` + `bindingXBuildConfig`
(`opacity: t<5000 ? 1 : 0.01` — el borde se apaga a los 5 s), `setFollowAniamlStatus`,
`followAnchorEvent`, `followClickUT`.

**Las acciones reales** (esto es lo que hay que clonar, no el dibujo):
- `{"api":"TBLFollow","params":{"isFollow":…,"accountId":…,"sourcePage":"Page_TaobaoLive"}}`
- `{"api":"toast","params":{"duration":"2000","type":"tips"}}` con los cuatro textos: **关注成功 ·
  关注失败 · 预约成功 · 预约失败**
- `{"api":"MTOP","api":"mtop.taobao.alimp.bentley.subscribe.center.action.binding"}` — la suscripción
- `{"api":"abilityHub","api":"refreshTemplate","params":{"userId":"channel_follow_guide_follow"}}` —
  refrescar SOLO esta tarjeta tras seguir
- `engineStorageSet` con `channel_follow_guide_followed` / `channel_follow_new_subscribe_result` — el
  estado se recuerda
- `{"api":"ut","api":"commitEvent","action":"click|componentExposure"}` — la medida
- `tblvSyncTask` en `onCardTap` — abrir el directo

### `taolive_channel_follow_new_empty_card` · v1 · 1 793 B
**Una sola plantilla para DOS estados**: la ilustración (PNG de **420×300**) + `title` + `tipsKpi`, y
dentro **`isNetError`** → error de red, con `netErrorRefreshY`. El botón es **刷新** (refrescar) y
llama a `tblvSyncTask`.

### `taolive_channel_follow_preplayback_foldmenu` · v1 · 4 330 B
El **ajuste de reproducción automática, plegable**: `unfold`, `channel_follow_preplayback_fold_states`,
`foldStates`, `buttonStatus`, `followUpdateFoldStates`, `close`, `open`, dos iconos de 24×24
(plegar/desplegar) y `engineStorageSet` con `fold` / `unfold` + `refreshTemplate`.

### `taolive_channel_follow_preplayback_loadmore` · v1 · 893 B
**点击加载更多** — toca para cargar más → `tblvSyncTask`, `preliveLoadMore`, `uniqueId`.

### `taolive_channel_follow_recommend_title` · v1 · 471 B
El **título de la sección de recomendados**: `description`.

### `taolive_channel_follow_sjsdbigfeed_card_2026` · v1 · 9 182 B
La **tarjeta grande del feed 2026**: portada (`live_card_playerview` + `coverImg`), **avatar del
creador** (`accountInfo.accountHeadPic` + `accountName`), `toBottom`, `#E611192DD`, `#0011192D`,
atmósfera, y `onCardTap`. **No lleva botón de seguir**: es la del feed, no la de un seguido.

---

## 2 · Lo clonado, variante por variante

El mecanismo es el mismo de Taobao: **una plantilla por variante y la variante la elige el dato**.
Aquí el «dato» es `$tarjetas`, y su `tipo` decide la plantilla (`ext:plantilla` del elemento, que el
cliente ya sabía elegir por elemento desde la rejilla heterogénea).

| Taobao | clon | cuándo |
|---|---|---|
| `preplayback_foldmenu` | `seguir_autoplay` | siempre que hay feed (es un ajuste, no una tarjeta) |
| `common_title_card` | `seguir_titulo` | `tipo: titulo` |
| `live_card` (directo) | `seguir_en_vivo` | `tipo: en_vivo` |
| `live_card` (`replayExpire`) | `seguir_repeticion` | `tipo: repeticion` |
| `live_card` (`newPreLiveInfo`) | `seguir_anuncio` | `tipo: anuncio` |
| `recommend_title` | `seguir_titulo_recomendado` | `tipo: titulo_recomendado` |
| `live_card` (`recommendInfo`) | `seguir_recomendado` | `tipo: recomendado` |
| `sjsdbigfeed_card_2026` | `seguir_grande` | `tipo: grande` |
| `preplayback_loadmore` | `seguir_cargar_mas` | `tipo: cargar_mas` |
| `new_empty_card` | `seguir_vacio` | `tipo: vacio` **Y** `tipo: sin_red` |

**Las acciones del clon**, con el nombre de la de Taobao al lado: `ext:seguir` (`TBLFollow`),
`ext:avisar` (el MTOP de suscripción), `ext:reproducir` (abrir el directo — `tblvSyncTask`),
`ext:plegar` (`preplayback_foldmenu`), `ext:cargarmas` (`preplayback_loadmore`), `ext:refrescar`
(「刷新」 de la tarjeta de vacío). **Todas declaradas en el vocabulario del cliente.**

---

## 3 · Lo que NO se puede clonar todavía, y por qué se dice

1. **El vídeo.** La tarjeta de Taobao lleva un `live_card_playerview` **dentro**. Nuestro contrato no
   tiene widget de vídeo, así que la tarjeta manda **la portada y el botón de reproducir**
   (`ext:reproducir`), que dice qué haría. **Un reproductor de mentira sería peor que un botón.**
2. **La animación del borde.** `followBorderAnimal` es un `bindingX` (una animación nativa por
   expresión). Nuestro contrato no lleva animaciones; el estado del botón sí se clona.
3. **El dato.** El feed real llega por MTOP (`cardData[0]` con `liveInfo`, `accountInfo`,
   `newPreLiveInfo`…). Nuestro API **no tiene** el endpoint de seguidos (ver §24 del relevo), así que
   hoy la sección enseña su **variante de vacío** — que es una variante real de Taobao, no un hueco.
