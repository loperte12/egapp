# Organización de la pantalla principal y de los mensajes en 小红书 (Xiaohongshu)
### y qué hacemos nosotros en Life Book — investigación + propuesta

**Investigación de producto · 14 de septiembre de 2026**

> Lo pedido: *«investiga cómo tiene montada Xiaohongshu la organización de su pantalla principal y de
> los mensajes, y compárala con lo que tenemos»*, con motivo de la reorganización de la parte de
> arriba del feed de Life Book.
>
> **Regla de este documento, y se cumple en todas sus líneas:** ningún dato de 小红书 está aquí
> porque yo lo recuerde. Cada afirmación lleva **de dónde sale** y **con qué fiabilidad**. Lo que no
> he podido confirmar está en §5, separado, y **no se usa para decidir nada**.
>
> **Nada de este documento se ha verificado abriendo la app real de 小红书.** Todo lo que sé de 小红书
> viene de fuentes públicas escritas (oficiales, prensa y blogs), no de una captura propia. Esa es la
> limitación más importante de todo el trabajo y se repite en §5.

---

## 0. Cómo leer las fuentes de este documento

Cada dato lleva una de estas cuatro etiquetas:

| Etiqueta | Qué significa exactamente |
|---|---|
| **[OFICIAL]** | Publicado por 小红书 / 行吟信息科技 (su web, su tienda de apps, su centro de ayuda) o por Meta/Instagram en el caso de Instagram |
| **[PRENSA]** | Medio de comunicación con redacción: 36氪, 电商派, 每日经济新闻, 壹览商业, DoNews, 新榜, 亿邦动力… |
| **[BLOG]** | Análisis de producto, marketing o SEO de terceros: 人人都是产品经理, 优设 (uisdc), 运营派, cuentas de WeChat de operadores, foros |
| **[NO VERIFICADO]** | No he encontrado fuente. **No se usa para decidir** |

**Aviso importante sobre las fechas.** Casi todo lo que se puede documentar por escrito sobre la
interfaz de 小红书 son **crónicas de cambios** (una app china no publica notas de versión detalladas
en abierto). Por eso §1 va montado como una **línea de tiempo**: casi todas las fuentes describen
**cómo estaba** en un momento concreto, no cómo está hoy. Allí donde no puedo demostrar cuál es el
estado **actual**, lo digo con esas palabras en vez de presentar la foto antigua como si fuera la de
hoy. Esto es especialmente importante porque **el dueño ha pedido copiar algo («la fila de avatares de
关注») que, según las fuentes, nació en un rediseño de 2021 y no puedo confirmar si sigue igual hoy**
(ver §1.1 y §5).

---

## 1. Cómo lo tiene montado 小红书, punto por punto

### 1.0 Línea de tiempo (para no confundir épocas)

Todo lo de §1 se apoya en esta secuencia. Cada hito con su fuente:

| Fecha | Qué pasó | Fuente |
|---|---|---|
| 2019 | POI: las notas pueden llevar enlace a una tienda física | [PRENSA] [电商派, 2024-02-05](https://www.pai.com.cn/238902.html) |
| 2020-08 | Se lanza el «视频号»; la fundadora anuncia la «comunidad 2.0» con más vídeo | [BLOG] [运营派 / 庄俊, 2024](https://www.yunyingpai.com/xhs/899265.html) |
| **2021-11-04** | **Rediseño grande en iOS** (y **revertido** a los pocos días por las quejas): se quitan las pestañas de arriba, aparece la **fila de avatares de «经常浏览的博主» con anillo rojo**, se parte la barra de mensajes en dos, y los números de notificación pasan a punto rojo | [PRENSA] [电商派, 2021-11-04](https://www.pai.com.cn/164811.html) citando a 麋鹿先生Sky · [BLOG] [análisis completo, 人人都是产品经理 / 江流](https://bbs.fcxxh.org/thread-254881-1-362.html) |
| 2022-12-30 | El feed de vídeo se despliega al 100 % | [BLOG] [运营派 / 庄俊](https://www.yunyingpai.com/xhs/899265.html) |
| **2023-01-05** | En la **barra de abajo**, «购物» (compras) es sustituido por **«视频»**, en la **segunda** plaza | [PRENSA] [36氪](https://36kr.com/p/2130033079593984) · [BLOG] [运营派 / 庄俊](https://www.yunyingpai.com/xhs/899265.html) |
| **2024-02-05** | Se añaden **«附近» y «春节» como entradas de primer nivel en la barra de ARRIBA**; «附近» enseña por mapa notas, directos y **grupos** de la zona | [PRENSA] [电商派, 2024-02-05](https://www.pai.com.cn/238902.html) |
| 2024-03-08 | La página de **同城** (misma ciudad) añade un **botón flotante** de mapa: «搜索 ▪ 宝安区»; el mapa marca **景点 y 美食**, con nº de notas por sitio, y enlaza a Baidu Maps | [PRENSA] [电商派, 2024-03-08](https://www.pai.com.cn/240801.html) |
| 2025-05-30 | A/B test del **perfil**: las cifras (关注/粉丝/获赞) **suben junto al avatar**, la bio baja, botón grande de seguir abajo, y un icono nuevo abre un cajón «**关注他的人也关注了**» | [BLOG] [优设 uisdc, 细节猎人](https://www.uisdc.com/hunter/0221468526.html) |
| **2025-08-28** | **«商城» pasa a llamarse «市集»** y la compra **vuelve a ser entrada de primer nivel** en la barra de abajo. La página 市集 tiene **canales fijos arriba**: 市集直播 · 买手橱窗 · 新品首发 | [PRENSA] [DoNews / 连线Insight](https://www.donews.com/article/detail/5093/89519.html) · [PRENSA] [壹览商业](https://www.yilantop.com/article/25635) |
| — | El eslogan pasa de «你的生活指南» a «**你的生活兴趣社区**» | [PRENSA] [DoNews / 连线Insight](https://www.donews.com/article/detail/5093/89519.html) |

**Lección inmediata:** la interfaz de 小红书 cambia mucho y a veces se revierte. **Copiar «la foto»
de un año concreto es un error**: lo que hay que copiar es el **patrón**, y el patrón se mantiene
estable a lo largo de todos los cambios.

---

### 1.1 La pestaña 关注 (Siguiendo) y **la fila de avatares de arriba**

**Respuesta corta: sí existe ese patrón, y la descripción del dueño es casi literal — pero la fuente
que lo describe es de noviembre de 2021, y ese rediseño se revirtió.**

Lo que dice la fuente, **palabra por palabra** ([PRENSA] [电商派, 2021-11-04](https://www.pai.com.cn/164811.html),
que cita a la cuenta de WeChat 麋鹿先生Sky, la que dio la noticia del cambio):

> «顶部 Tab"关注""发现""附近"全部取消；通知与消息分别拆分为"评论"、"点赞"、"收藏、关注"以及系统消息
> 通知"群"、"私信"、"圈子"；**首页顶部新增"经常浏览的博主"模块**。
> 同时，**头像显示红圈的为有更新未读的博主，打开后头像红圈消失，并且头像排序后置，前面只显示未读的头像**；
> "我的频道"功能保留，并新增了"推荐"和"附近"频道。取消首页通知数字提示。»

Traducido, punto por punto, y esto responde **exactamente** a las preguntas del encargo:

| Pregunta del dueño | Lo que dice la fuente |
|---|---|
| ¿Qué es esa fila? | Un módulo en la parte de arriba de la pantalla principal llamado **«经常浏览的博主»** (los blogueros que miras a menudo) |
| ¿Son avatares de gente que sigues? | Sí, con un matiz: la fuente dice «los que **miras a menudo**», no literalmente «todos los que sigues». El análisis de producto lo llama «**经常浏览的博主**» y dice que **enseña las novedades de esos blogueros** ([BLOG] [人人都是产品经理 / 江流](https://bbs.fcxxh.org/thread-254881-1-362.html): «在首页上方用博主头像展示博主内容更新») |
| ¿Anillo cuando hay contenido nuevo? | **Sí — anillo ROJO**: «头像显示红圈的为有更新未读的博主» |
| ¿Qué pasa al tocar uno? | «**打开后头像红圈消失，并且头像排序后置**»: al abrirlo, el anillo desaparece y **ese avatar se reordena al final** de la fila. Es decir: la fila se comporta como una **cola de no leídos**, no como una lista alfabética |
| ¿Solo se ven los no leídos delante? | **Sí**: «**前面只显示未读的头像**» |
| ¿Se puede deslizar? | **No se puede confirmar con esta fuente.** El hecho de que la fila se **reordene** («排序后置») implica que es una lista ordenada y desplazable, pero **no he encontrado ninguna fuente que diga si se desliza en horizontal**. → §5 |
| ¿Aparece también en 发现 (Descubrir)? | **Según esta fuente, no**: el módulo es «首页顶部» cuando la pestaña 关注 se había eliminado. **No verificado** que hoy aparezca o no en 发现 |

**El matiz que más importa, y que el dueño debe saber.** El análisis de producto de aquel cambio
explica **por qué** se hizo, y es lo contrario de lo que parece: 小红书 **quitó peso** a la pestaña de
seguidos, no se lo dio. Dice así ([BLOG] [人人都是产品经理 / 江流, §二.1](https://bbs.fcxxh.org/thread-254881-1-362.html)):

> «给关注页降权，有多种方式，小红书本次改版选择的是取消关注页，给的解决方案是在首页上方用博主头像展示
> 博主内容更新，**这种方案改变了用户查看关注博主的习惯。从而让一些用户表达明显不满意情绪。**»

O sea: la fila de avatares nació como **sustituto empobrecido** de una pestaña de seguidos, y **generó
quejas**. Y el mismo artículo añade que 小红书 «**已经回撤了版本**» (revirtió la versión) ante la
reacción de los usuarios. **Un módulo que se retiró por impopular no es un buen modelo a copiar tal
cual** — lo copiable es la idea de «avatares con anillo de novedad», no el haber quitado la pestaña.

**Sobre si el avatar abre el perfil o filtra el feed:** la fuente describe el efecto sobre la fila
(el anillo desaparece, el avatar se va al final), y el análisis dice que «**必须要点进头像之后，才能
观看其内容**» (hay que entrar en el avatar para ver su contenido). **Lo que no puedo confirmar es la
pantalla de destino**: si abre **el perfil**, o una **vista de novedades de esa persona**. → §5.
**Dato relevante para nosotros:** nuestro backend **sí permite** abrir el perfil de una persona
(`/lifebook/users/:id/profile`) pero **no tiene** ninguna vista de «novedades de una persona».

**Relación con 2020, para no confundir dos cambios distintos.** Hay otro cambio documentado de abril
de 2020, anterior: la página de 关注 pasó a mostrar «**el contenido completo en la propia página**»
en vez de exigir entrar en cada nota, y **en orden no cronológico** ([BLOG] [麋鹿先生Sky](https://mp.weixin.qq.com/s?src=11&timestamp=1789315319&ver=6964&signature=RJy9UwA8l121ReI-fGlogZ9-yCQGmQyfgHam5mlsNfrElFVkaCAlmu90rASZlRDEzxs-3eO452BkpC5GmLQzKxEjJ4iPsk2S8dUhQqbQrkFk5GeQ4sDfT*TyH-5VsTR&new=1)).
Es decir: **la pestaña de seguidos de 小红书 nunca ha sido una lista cronológica pura**, y cuando
existía sí mostraba el feed completo dentro de la pestaña. Otra fuente lo confirma con una queja
([PRENSA] [电商派 2021](https://www.pai.com.cn/164811.html) describe el estado previo como «关注页»
con contenido completo).

---

### 1.2 Las pestañas de arriba del feed: cuáles son y en qué orden

**Aquí es donde las fuentes son más flojas, y hay que decirlo antes de nada.**

Lo único que puedo afirmar con fuente:

1. **En noviembre de 2021** las tres pestañas de arriba eran **关注 · 发现 · 附近**, y en ese rediseño
   **se quitaron las tres**, dejando la principal sin pestañas y con la fila de avatares.
   [PRENSA] [电商派 2021-11-04](https://www.pai.com.cn/164811.html): «顶部 Tab"关注""发现""附近"全部取消».
   El otro análisis de ese mismo cambio las enumera en otro orden — «(发现、关注、同城)» — y llama a
   同城 donde el otro dice 附近: [BLOG] [人人都是产品经理 / 江流](https://bbs.fcxxh.org/thread-254881-1-362.html).
   **O sea: ni los dos relatos del mismo cambio coinciden en el orden ni en el tercer nombre.**
2. Ese rediseño **se revirtió** («已经回撤了版本… 已经更新的用户也会自动退回到之前的版本»), así que
   **las pestañas volvieron**. [BLOG] [idem](https://bbs.fcxxh.org/thread-254881-1-362.html).
3. **En febrero de 2024** existen «**附近**» y «春节» como **entradas de primer nivel en la barra de
   arriba** de la pantalla principal. [PRENSA] [电商派 2024-02-05](https://www.pai.com.cn/238902.html):
   «小红书近日更新 APP，在**顶部栏**新增了"附近"和"春节"两个一级入口».
4. **El «视频» también está arriba**, además de en la barra de abajo: el feed de vídeo a pantalla
   completa se despliega en 2022-12-30 y en 2023-01-05 entra en la barra inferior.
   [BLOG] [运营派 / 庄俊](https://www.yunyingpai.com/xhs/899265.html).
5. En la pestaña **发现**, los canales «**推荐**», «**视频**» y «**直播**» están **fijados en las tres
   primeras posiciones y no se pueden mover** («位置不可移动»). [PRENSA] [壹娱观察, vía
   búsqueda](https://weixin.sogou.com/) — *la cita es de un artículo de WeChat; no he podido abrir su
   URL canónica, ver §5*.

**Lo que NO puedo confirmar (y por tanto no afirmo):**
- **El orden exacto y completo de las pestañas de arriba HOY.** Ni cuántas son, ni si 同城 está arriba
  o dentro de un canal, ni cuál es la que se abre por defecto. → §5.
- **Si se puede deslizar entre ellas.** No he encontrado ninguna fuente que lo diga. → §5.
- **Cuál es la pestaña por defecto.** Hay una fuente de marketing que dice que al abrir la app se
  entra al feed de recomendación («打开小红书首页呈现的就是 feed 流推荐入口(发现页)»,
  [BLOG] [运营大叔, vía búsqueda](https://www.yydashu.com/11110.html)), y el análisis de 2021 razona
  que el rediseño buscaba «concentrar el tráfico en la página de recomendación»
  ([BLOG] [人人都是产品经理](https://bbs.fcxxh.org/thread-254881-1-362.html)). **Dos fuentes de blog,
  ninguna oficial: lo marco como probable, no como confirmado.**

**Lo que sí se puede afirmar con seguridad sobre el DISEÑO (no sobre el orden):** 小红书 usa
**pestañas de texto con indicador**, no píldoras de color, y **canales fijados por el producto** que
el usuario no puede reordenar (al menos los tres primeros de 发现). Nuestro
`app/lifebook.tsx:660-701` ya pinta exactamente ese patrón.

---

### 1.3 La pestaña de la ciudad: 同城 / 附近

Esto sí está bien documentado y es lo más aprovechable del encargo.

**(a) Dónde vive y cómo se entra.** En **febrero de 2024**, 小红书 añadió «**附近**» como **entrada de
primer nivel en la barra de arriba** de la pantalla principal, y la pestaña **同城** quedó como página
hermana con la misma forma ([PRENSA] [电商派 2024-02-05](https://www.pai.com.cn/238902.html)):
«"附近"功能**通过地图的形式**来展示附近吃喝玩乐有关的内容笔记、直播、群聊».

**(b) Cómo se cambia de zona.** No hay un desplegable de lista de ciudades como el nuestro: hay un
**botón flotante sobre el mapa que se llama «搜索 ▪ <tu zona>»** — por ejemplo «搜索 ▪ 宝安区» — y que
**toma el nombre del distrito donde estás por GPS** ([PRENSA] [电商派 2024-03-08](https://www.pai.com.cn/240801.html):

> «当用户在深圳宝安区，打开手机定位，在小红书的同城页面上就能看到一个悬浮按钮——显示"搜索 ▪ 宝安区"，
> 点击即可进入实时地图»

**(c) Qué se enseña dentro.** El mapa marca **景点 y 美食** con el **número de notas** de cada sitio, y
al tocar un punto se ven las notas, los guardados y los check-ins de esa gente, con enlace a Baidu
Maps para navegar ([PRENSA] [idem](https://www.pai.com.cn/240801.html)). La misma fuente añade que en
同城 «**聚合了本地餐厅、玩乐、景点、周边游等内容**» — **cuatro bloques: restaurantes · ocio ·
monumentos · excursiones de alrededor**.

**(d) Y encima, social.** El mapa de 同城 también enseña «**grupos cercanos**» — de comer, de música,
de crianza, de alquiler — y hasta mascotas virtuales de otros usuarios
([PRENSA] [电商派 2024-03-08](https://www.pai.com.cn/240801.html)). Es la mezcla «contenido + mapa +
grupo» que ninguna app occidental tiene.

**(e) LAS CATEGORÍAS DE LA CIUDAD — lo que he podido encontrar.** El encargo pedía la «lista REAL de
categorías». **No existe una lista oficial publicada.** Lo más cerca que he llegado es una crónica de
una prueba real de la función de 团购 local, que describe **los chips fijos de arriba** de la página
附近 en Shanghái:

> «**发现上海附近页的细分置顶处显示拍照地、餐厅、玩乐、景点、…**»
> — [PRENSA] [新榜, «实测小红书本地团购功能»](https://weixin.sogou.com/) *(artículo de WeChat vía
> buscador; no he podido abrir la URL canónica, ver §5)*

Es decir: **拍照地 (sitios para fotos) · 餐厅 (restaurantes) · 玩乐 (ocio) · 景点 (monumentos)** …
con puntos suspensivos: **la lista sigue y no la tengo**. Sumando las dos fuentes de 电商派
(餐厅/玩乐/景点/周边游) el conjunto razonable es ese, pero **no es una lista cerrada ni oficial**.

**Comparación honesta con lo que pide el dueño** («Recomendado · City walk · Comida · Turismo · Bares ·
Fiesta · Cultura»): hay **solapamiento claro en tres** (Comida≈餐厅, Turismo≈景点, y «Recomendado»≈推荐),
**uno dudoso** (Cultura, que en 小红书 es una vertical de contenido pero no aparece en ninguna crónica
de 同城), y **tres que NO aparecen en ninguna fuente de 小红书** (City walk como chip, Bares, Fiesta).
«City walk» **sí es una palabra de 小红书** — la propia plataforma promociona «**City Walk 宝藏城市**»
([PRENSA] [威海晚报, vía búsqueda](https://weixin.sogou.com/)) — pero **como campaña y hashtag, no como
chip de la pestaña de ciudad**. → §5.

---

### 1.4 Las categorías / chips de temas (穿搭, 美食, 彩妆…)

**Respuesta corta y honesta: no he encontrado ninguna lista oficial de los chips de temas del feed, ni
su número, ni si el usuario puede personalizarlos.** Lo que sí está documentado es **cómo se comporta
el mecanismo**:

1. **Existen «canales» (频道) y el usuario tiene «mis canales» (我的频道).** En el rediseño de 2021,
   «"**我的频道**"功能保留，并新增了"**推荐**"和"**附近**"频道»
   ([PRENSA] [电商派 2021-11-04](https://www.pai.com.cn/164811.html)). Es decir: **sí hay una noción de
   canales propios del usuario**, y el producto **añade canales de fábrica** («推荐», «附近»).
2. **Los tres primeros de 发现 están fijados y no se pueden mover**: «推荐» «视频» «直播»
   ([PRENSA] [壹娱观察, vía búsqueda](https://weixin.sogou.com/)). Es decir: **el producto reserva las
   primeras posiciones; el usuario puede tocar el resto.** Esto es lo más cerca que estoy de «se pueden
   personalizar»: **hay posiciones bloqueadas y posiciones libres**, pero **no he encontrado el detalle
   de qué se puede añadir, quitar u ocultar, ni cómo se ordenan las libres** → §5.
3. **No hay ninguna fuente que dé el número de chips.** Ni 13, ni 20, ni «N». → §5.

**Sobre la lista que el dueño ha puesto en el encargo** (穿搭, 美食, 彩妆, 影视, 职场, 情感, 家居,
游戏, 旅行, 健身…): **no he encontrado esa lista como chips de la interfaz, pero sí he encontrado
documentadas las «pistas de contenido» (赛道) de 小红书**, que es la lista con la que de verdad se
trabaja allí. La mejor fuente que he podido abrir es una guía de operadores que enumera **15 verticales
con sus subgéneros** ([BLOG] [零壹电商, 2023-11-18](https://www.2i1i.com/53032.html)):

> 01 美妆 · 02 时尚穿搭 · 03 珠宝配饰 · 04 家居家装 · 05 美食饮品 · 06 母婴早教 · 07 健身减脂 ·
> 08 萌宠动物 · 09 旅行住宿 · 10 知识付费/职场成长 · 11 心理情感 · 12 商业财经 · 13 艺术设计 ·
> 14 科技数码 · 15 摄影拍摄

**Comparación honesta con la lista del dueño**, y es un dato útil:

| Del encargo del dueño | ¿Aparece en la lista de 15 de 小红书? |
|---|---|
| 穿搭 | **Sí** (02 时尚穿搭) |
| 美食 | **Sí** (05 美食饮品) |
| 彩妆 | **Sí** (01 美妆) |
| 家居 | **Sí** (04 家居家装) |
| 健身 | **Sí** (07 健身减脂) |
| 旅行 | **Sí** (09 旅行住宿) |
| 职场 | **Sí** (10 知识付费/职场成长) |
| 情感 | **Sí** (11 心理情感) |
| **影视** | **No aparece** en la lista |
| **游戏** | **No aparece** en la lista |
| — | Y hay **7 verticales que el encargo no menciona**: 珠宝配饰 · 母婴早教 · 萌宠动物 · 商业财经 · 艺术设计 · 科技数码 · 摄影拍摄 |

**Conclusión:** la lista del dueño es **razonable y coincide en 8 de 10**, pero **no es «la lista de
小红书»**: es una mezcla. Y **lo que no he verificado, ni con esta fuente ni con ninguna, es que estas
palabras sean los CHIPS de la barra del feed, en ese orden, y en ese número.** Son **categorías de
contenido** documentadas por el sector, no una captura de la interfaz. → §5.

**Lo que SÍ es un hallazgo firme y nos afecta:** en 小红书 **las categorías no son un filtro que
sustituye al feed** — en la práctica son **el mismo feed con otro sesgo**, y el usuario puede tener
«sus canales». Nuestro `LB_CHANNELS` (`constants/lifebook.ts:20-34`) hace exactamente eso (13 canales,
mismo feed, `channel=` en la API), pero **los tiene todos en UNA sola fila de pestañas con el mismo
peso visual**. Ver §3.

---

### 1.5 La pantalla de 消息 (Mensajes)

**Respuesta corta: 小红书 separa tajantemente lo social (私信/群) de lo que es retroalimentación
(赞/藏/评/@), y lo ha hecho llevándolos a sitios DISTINTOS de la app. Eso es exactamente lo contrario
de lo que tenemos nosotros, que lo tenemos todo dentro de la misma pantalla.**

La fuente central es el análisis del rediseño de 2021, que explica la decisión con lujo de detalle
([BLOG] [人人都是产品经理 / 江流](https://bbs.fcxxh.org/thread-254881-1-362.html)). El «antes» y el
«después»:

| Momento | Contenido de la barra/pantalla de mensajes |
|---|---|
| **Antes de 2021-11** | UNA sola pantalla con **todo mezclado**: 私信 (chat privado) · 群消息 (grupos) · 语音房间 (salas de voz) · 新增关注通知 · 赞和收藏通知 · 评论和@通知 |
| **Después (2021-11)** | **Dos entradas separadas**: <br>**Entrada 1 →** «私信 y 群消息» **se muda a la esquina SUPERIOR IZQUIERDA de la pantalla principal**, ocupando el sitio del botón de publicar <br>**Entrada 2 →** lo que era la barra de mensajes se convierte en **barra de NOTIFICACIONES**: 赞 · 藏 · 评 · @ · 关注 · notificaciones oficiales |

Las palabras exactas de la fuente:

> «**第二，底部消息栏拆分。** 原来是消息栏里包含了**私信，群消息入口，语音房间入口，新增关注通知，赞和收藏
> 通知，评论和@通知**。更改后分成两个入口。
> **入口1：私信和群消息的通知移到首页的左上角**，替换了原来发布瞬间的按钮。
> **入口2：原消息栏变为通知栏**，展示**赞、藏、评、@、关注、官方通知**等内容。»

Y el otro relato del mismo cambio añade el detalle de las pestañas internas
([PRENSA] [电商派 2021-11-04](https://www.pai.com.cn/164811.html)):
«通知与消息分别拆分为"**评论**"、"**点赞**"、"**收藏、关注**"以及系统消息通知"**群**"、"**私信**"、"**圈子**"».
O sea: **notificaciones = 评论 / 点赞 / 收藏·关注** y **social = 群 / 私信 / 圈子 (círculos)**.
Las dos fuentes coinciden en lo esencial: **dos grupos, no uno.**

Y el razonamiento de producto, que es lo que de verdad deberíamos copiar
([BLOG] [idem](https://bbs.fcxxh.org/thread-254881-1-362.html)):

> «在这次改动中，消息类型被归类为了两类，一类是**社交属性**的消息，包括私信、群消息、语音聊天消息，这类消息
> 强调**即时性**…另一类是**非社交属性**的消息，包括，赞、藏、评、@、系统消息、关注消息。这一类消息是**你知道
> 了就行了，不要求及时回应，主要是给你激励反馈的**。当这种反馈一多，你可能就会麻木…当两类消息分离到不同的入口后，
> 你就可能更频繁地查看新私信»

**Traducido a una regla de diseño:** *el chat privado y los grupos son «tengo que responder»; los me
gusta, comentarios y seguidores son «me entero y sigo». Mezclarlos hace que el usuario deje de abrir
la pantalla.* Y el mismo artículo explica el tercer cambio: los **números** de notificación se
sustituyeron por **puntos rojos**, precisamente para que el usuario no se acostumbre a ver «99+» y
deje de mirar. **Ese razonamiento es directamente aplicable a nuestro badge de mensajes.**

**Estado ACTUAL de la pantalla de 消息: [NO VERIFICADO].** Las fuentes describen 2021 y ese cambio se
revirtió parcialmente. **No puedo afirmar cómo está hoy la pantalla de mensajes de 小红书**: ni si
mantiene la separación, ni si el chat vive arriba a la izquierda de la pantalla principal, ni el
nombre exacto de las pestañas de dentro. → §5.

**Un dato OFICIAL, pero de la versión WEB (no de la app).** La web de 小红书
(`https://www.xiaohongshu.com`, leída el 14-sep-2026) tiene en su navegación: **发现 · 直播 · 发布 ·
通知 · 消息**. Es decir, **también en web «通知» y «消息» son dos cosas separadas**
([OFICIAL] [xiaohongshu.com](https://www.xiaohongshu.com)). Es coherente con la separación de la app,
pero **es la web, y no se puede trasladar sin más a la app**; lo dejo como indicio, no como prueba.

---

### 1.6 Las barras: qué hay arriba y qué hay abajo. Y dónde se entra al perfil propio

**Barra de ABAJO (footer).** Documentada por cambios sucesivos, con lo que se puede reconstruir:

| Época | Barra de abajo |
|---|---|
| Hasta 2023-01-05 | **首页 · 购物 · [+] · 消息 · 我** — el «购物» (compras) ocupaba la 2ª plaza |
| Desde 2023-01-05 | **首页 · 视频 · [+] · 消息 · 我** — «购物» es sustituido por «视频» ([PRENSA] [36氪](https://36kr.com/p/2130033079593984); [PRENSA] [电商派](https://www.pai.com.cn/164811.html): «"视频"栏目代替原本的"购物"栏目，**出现在首页第二栏**») |
| Desde 2025-08-28 | **首页 · 市集 · [+] · 消息 · 我** — «商城» pasa a «**市集**», la compra vuelve como primer nivel ([PRENSA] [DoNews / 连线Insight](https://www.donews.com/article/detail/5093/89519.html): «不少小红书用户发现，**底部导航栏的"商城"悄然换成了"市集"**») |

Lo que **se deduce con solidez** de esas tres fuentes: el footer tiene **5 plazas, con el botón de
publicar [+] en el CENTRO**, «首页» a la izquierda del todo y **«消息» y «我» a la derecha**. La única
plaza que ha cambiado de inquilino es la segunda (购物 → 视频 → 市集). **La posición de «消息» y de
«我» nunca ha cambiado en las fuentes que he leído.**
*([NO VERIFICADO] el nombre del primer icono («首页») hoy: es lo que dicen las fuentes de 2021-2023, y
no he encontrado una fuente de 2026 que lo reconfirme.)*

**Barra de ARRIBA.** Aquí las fuentes son mucho peores. Lo único afirmable:

- En **2024-02** la barra de arriba tenía **entradas de primer nivel**, porque «附近» y «春节» se
  añadieron **allí** ([PRENSA] [电商派](https://www.pai.com.cn/238902.html)). Es decir: **arriba hay
  navegación, no solo iconos.**
- En **2021-11** los mensajes privados (私信/群) **se mudaron a la esquina superior IZQUIERDA de la
  pantalla principal** ([BLOG] [人人都是产品经理](https://bbs.fcxxh.org/thread-254881-1-362.html)).
- **El «视频» también está arriba**: el feed de vídeo es un canal de arriba además de la plaza del
  footer ([BLOG] [运营派 / 庄俊](https://www.yunyingpai.com/xhs/899265.html)).

**Dónde se entra al PERFIL PROPIO.** La respuesta documentada es **desde el footer, en «我»** — es
decir, el mismo patrón que nuestro dock (`components/FloatingFooter.tsx:25-31`, pestaña «Perfil»).
Se apoya en dos cosas:

1. La reconstrucción del footer de las tres épocas (arriba): **«我» es una de las 5 plazas y nunca se
   ha movido** ([PRENSA] [36氪](https://36kr.com/p/2130033079593984) · [PRENSA] [DoNews](https://www.donews.com/article/detail/5093/89519.html)).
2. Una **guía oficial de Instagram**, no de 小红书, describe el mismo patrón («Click on your profile
   picture on the **bottom right** of the app») — sirve de contraste, no de prueba
   ([BLOG] [ShareThis](https://sharethis.com/social-media/2022/05/instagram-notifications-101/)).

**Lo que NO puedo confirmar:** si en 小红书 existe **además** un atajo al perfil propio desde la barra
de arriba o desde la pantalla de mensajes. → §5.

---

### 1.7 El perfil propio: qué se ha documentado de su REORGANIZACIÓN

Esto responde a la última parte del encargo del dueño (mover el avatar «junto a los iconos de me gusta,
seguidores y comentarios»), y hay una fuente reciente y concreta: un **A/B test del perfil de 小红书
documentado el 2025-05-30** por 优设 (uisdc), la comunidad de diseño de referencia en China
([BLOG] [优设 · 细节猎人](https://www.uisdc.com/hunter/0221468526.html)). Dice, literalmente:

> «新版则将**关注、粉丝、获赞数据上提至头像下方左侧**，以强化影响力感知。同时，**个人简介被下移**，
> 为行为按钮腾出视觉权重，尤其是**底部大尺寸关注按钮**…新版在底部新增了一个不显眼但极具价值的小 icon，
> 点击后触发抽屉式弹窗，展示「**关注他的人也关注了**」列表，内容包括其他用户头像、昵称、粉丝量及快速关注按钮»

Traducido y aplicado a nuestra pregunta: 小红书 **subió las cifras (siguiendo / seguidores / me gusta)
al lado del avatar**, bajó la bio, agrandó el botón de seguir abajo, y añadió el cajón de «a quien
sigue esta persona también sigue». **Las cifras junto al avatar: sí. El avatar dentro de la pantalla de
mensajes: no aparece en ninguna fuente.**

**La idea concreta del dueño** («mover el avatar del dueño junto a los iconos de me gusta, seguidores y
comentarios **de la pantalla de mensajes**») **no la he encontrado en ninguna fuente sobre 小红书**, y
**tampoco he podido verificar la referencia a Instagram** que el encargo daba por hecha. Lo que sí
puedo decir con precisión:

- **En NUESTRA app ese patrón YA EXISTE, pero en otro sitio**: la pantalla de perfil público
  (`app/lifebook-user.tsx:342-361`) pinta una fila de **cuatro cifras con icono** —
  Publicaciones · Seguidores · **Seguidos** · **Me gusta** — cada una con su `lucide` icono
  (`Bookmark`, `Users`, `Users`, `Heart`). Es decir: **el «avatar junto a me gusta / seguidores /
  comentarios» es, en nuestro código, el bloque de estadísticas del perfil**, no un bloque de mensajes.
- **Instagram**: según las fuentes que he podido abrir ([BLOG]
  [ShareThis](https://sharethis.com/social-media/2022/05/instagram-notifications-101/)), el avatar del
  usuario está **abajo a la derecha** (la pestaña de perfil) y desde ahí se entra a ajustes. **No he
  encontrado ninguna fuente que confirme el avatar arriba a la derecha de la página de actividad.** →
  §5. **Por tanto, no puedo decir que la idea del dueño «se parezca a Instagram»: sencillamente no lo he
  podido comprobar.**

---

## 2. Tabla: lo que pide el dueño · cómo lo hace 小红书 · qué tenemos hoy · qué hay que tocar

**Leyenda de esfuerzo:** **S** ≈ menos de 1 día · **M** ≈ 1-3 días · **L** ≈ más de 3 días o toca
backend.

| # | Lo que pide el dueño | Cómo lo hace 小红书 (fuente) | Qué tenemos hoy (`ruta:línea`) | Qué habría que tocar | Esfuerzo |
|---|---|---|---|---|---|
| 1 | En vez de «Para ti», que ponga **«Seguidos»** | La pestaña se llama **关注**. En 2021 se **eliminó** y el tráfico se concentró en recomendación; el cambio **se revirtió** por las quejas. **[PRENSA]** [电商派 2021-11-04](https://www.pai.com.cn/164811.html) · **[BLOG]** [人人都是产品经理](https://bbs.fcxxh.org/thread-254881-1-362.html) | Canal `for_you` con etiqueta «Para ti» que es **el que se abre por defecto**: `constants/lifebook.ts:21`, `app/lifebook.tsx:210`. El canal `following` («Siguiendo») existe y **filtra de verdad** (verificado contra la API en vivo): `constants/lifebook.ts:22`, `docs/SEGUIDORES-EN-CONTEXTO-INVESTIGACION.md:689` | **Renombrar** «Para ti»→«Seguidos» NO es solo un texto: hoy «Seguidos» y «Siguiendo» **conviven** (el chip de tarjeta dice «Siguiendo», `constants/lifebook.ts:62`) y el canal por defecto es `for_you`. Hay que decidir: (a) ¿`for_you` pasa a llamarse «Seguidos» **y** a filtrar por seguidos? Entonces `for_you` y `following` serían el mismo canal y sobraría uno. (b) ¿Se renombra `following` a «Seguidos» y pasa a ser el primero/por defecto? **Es la opción que reproduce el patrón de 小红书 sin duplicar canales** | **S** (solo etiquetas y orden) si se elige (b); **M** si se cambia además el canal por defecto |
| 2 | Debajo, **los perfiles de las personas que sigues** (fila de avatares) | Módulo «经常浏览的博主» en lo alto de la pantalla principal: **avatares con anillo rojo** si hay novedad; al abrirlo el anillo desaparece y el avatar **se reordena al final**; «solo se ven delante los no leídos». **[PRENSA]** [电商派 2021-11-04](https://www.pai.com.cn/164811.html) · **[BLOG]** [人人都是产品经理](https://bbs.fcxxh.org/thread-254881-1-362.html) | **NO EXISTE.** No hay ninguna fila de avatares en el feed. Y **no hay API de «a quién sigo»**: `api/lifebook.ts` tiene `follow`/`unfollow`/`profile` (`:460-464`) pero **ningún listado de seguidos**. El perfil solo trae el **número** (`api/lifebook.ts:313`, `stats.following`) | **Backend nuevo (ver §4)**: un endpoint de lista de seguidos **con marca de «tiene novedad»**. En la app: un componente de fila horizontal nuevo arriba del feed (`app/lifebook.tsx`, entre `:658` y `:660`), con anillo y estado de leído | **L** (la fila es fácil; **el dato de «novedad» no existe**) |
| 3 | Al lado de «Seguidos», **«Descubrir»** | La pestaña se llama **发现**. En 2021 **se quitó** junto con las otras dos y se revirtió; los canales «推荐/视频/直播» están **fijados en las 3 primeras posiciones y no se mueven** **[PRENSA]** [壹娱观察, vía buscador](https://weixin.sogou.com/) | **NO EXISTE con ese nombre.** Lo que más se le parece es `for_you` («Para ti»), `constants/lifebook.ts:21` — que es justo la que el dueño quiere renombrar a «Seguidos» | Si «Para ti» pasa a ser «Seguidos», **«Descubrir» hay que crearlo**. Y debe ser **el que mezcla** (que es lo que hoy hace `for_you`). Es decir: **`for_you` se queda con el contenido y cambia de nombre a «Descubrir»; `following` se renombra «Seguidos» y se pone primero** → **una sola línea de datos cambia, dos etiquetas y el orden** | **S** |
| 4 | Debajo, **de «Debates» a «Deportes»** como chips de temas | En 小红书 los **canales del feed son el mismo feed con otro sesgo**, y **el usuario tiene «我的频道»** (mis canales), mientras el producto **reserva posiciones fijas** **[PRENSA]** [电商派 2021-11-04](https://www.pai.com.cn/164811.html) · **[PRENSA]** [壹娱观察, vía buscador](https://weixin.sogou.com/) | **Los 9 ya existen**, pero **en la MISMA fila de pestañas** que «Para ti»: `debates, food, taxi, work, rental, sales, culture, music, sports` → `constants/lifebook.ts:25-33`; todos pintados juntos en `app/lifebook.tsx:660-701` | **Separar en dos filas.** Arriba: `Seguidos · Descubrir · Ciudad`. Abajo: los 9 + Comercio, con **estilo chip** (píldora) en vez de pestaña con subrayado, para que se vea que son otra cosa. **Toda la lógica de `channelId` se reutiliza**: `app/lifebook.tsx:210`, `:391-392`, `:451-457` | **S** (es layout; no toca datos) |
| 5 | **«Comercio»**: cuentas de comercio o publicaciones (tiendas, hoteles…) | **«市集»** es **entrada de primer nivel** desde 2025-08-28, con **canales fijos arriba** (市集直播 · 买手橱窗 · 新品首发) y feed de 2 columnas que mezcla directos y notas de producto. **[PRENSA]** [DoNews / 连线Insight](https://www.donews.com/article/detail/5093/89519.html) · **[PRENSA]** [壹览商业](https://www.yilantop.com/article/25635) | Existe el canal **`sales` («Ventas»)** en `constants/lifebook.ts:30`… **pero lo que pide el dueño no es `sales`**: es «tiendas y publicaciones de comercio». Para eso ya hay **API de comercio completa**: `api/ecomerse.ts:88-95` (`/ecomerse/catalog`, `/ecomerse/categories`), `api/commerce.ts:287-298` (catálogo con categorías), y `app/lifebook-store.tsx`, `app/lifebook-catalog.tsx`, `app/lifebook-merchant*.tsx`. Los posts de venta son `type='sale'` (`api/lifebook.ts:57`) y los enlaces de tienda `linkType='ecomerse'` (`api/lifebook.ts:35-40`) | Decidir el modelo: **(a) chip «Comercio» = `channel=sales`** (lo que ya hay, cero backend) o **(b) chip «Comercio» = catálogo de comercio** (cuentas/tiendas, necesita cruzar dos mundos). **Recomiendo (a) con el nombre «Comercio»** y que dentro se enseñen las tiendas: ver §4 | **S** (a) · **M/L** (b) |
| 6 | Al lado de «Descubrir», **la ciudad** que eligió la persona, y **se puede cambiar** | «附近» es **entrada de primer nivel en la barra de ARRIBA** (2024-02); la zona se cambia con un **botón flotante «搜索 ▪ 宝安区»** que toma el nombre de la zona por GPS **[PRENSA]** [电商派 2024-02-05](https://www.pai.com.cn/238902.html) · [2024-03-08](https://www.pai.com.cn/240801.html) | **Ya existe**, y está **arriba a la izquierda**: botón `MapPin` + nombre + `ChevronDown` en `app/lifebook.tsx:554-573`, que abre el modal «Elige ciudad» (`:986-1081`) con las 5 ciudades de `LB_CITIES` (`constants/lifebook.ts:37`) y un atajo «Usar mi ciudad» (`:1059-1078`). La ciudad **se guarda** en el estado y viaja en cada llamada al feed (`app/lifebook.tsx:328-331`) | **Mover** el botón de ciudad: de la barra de arriba (donde compite con Volver/Buscar/Mensajes/Avatar — **5 elementos ya**) a **la fila de pestañas**, al lado de «Descubrir». Es un recorte de la barra de arriba y un añadido a la fila de abajo. **El modal de ciudad no se toca** | **S** |
| 7 | Dentro de la ciudad: **Recomendado · City walk · Comida · Turismo · Bares · Fiesta · Cultura** | **No existe ninguna lista oficial publicada.** La crónica más concreta describe los chips fijos de la página 附近 como **拍照地 · 餐厅 · 玩乐 · 景点 · …** **[PRENSA]** [新榜 «实测小红书本地团购功能», vía buscador](https://weixin.sogou.com/); 同城 «agrega 本地餐厅、玩乐、景点、周边游» **[PRENSA]** [电商派 2024-03-08](https://www.pai.com.cn/240801.html). «City walk» **sí es palabra de 小红书**, pero como **campaña/hashtag**, no como chip | **No existe ningún subchip.** El canal `nearby` («Cerca») es un canal más de la fila única: `constants/lifebook.ts:23`, con su copy de vacío en `app/lifebook.tsx:87-88` | **Backend nuevo si los chips deben filtrar de verdad** (ver §4). Si son solo navegación visual, es **S**. **Ojo:** de los 7 que pide el dueño, **3 (City walk, Bares, Fiesta) no tienen ninguna categoría correspondiente hoy en nuestro backend ni fuente en 小红书** | **M** (visual) · **L** (con filtrado real) |
| 8 | **Mensajes**: separar **chat privado de grupos** | 小红书 **separó lo social (私信/群) de lo que es feedback (赞/藏/评/@)** y los llevó a **entradas distintas de la app** (私信/群 a la **esquina superior izquierda** de la pantalla principal; el resto a una **barra de notificaciones**) **[BLOG]** [人人都是产品经理](https://bbs.fcxxh.org/thread-254881-1-362.html) · **[PRENSA]** [电商派 2021-11-04](https://www.pai.com.cn/164811.html) | **NO se separa nada: van MEZCLADOS en una sola lista.** El backend **sí distingue**: `kind: 'direct' \| 'group'` (`api/messages.ts:34-35`), normalizado en `:88`, y `toConversationCard` produce `isGroup` y `memberCount` (`api/messages.ts:403-425`). La pantalla lo pinta como un **chip 👥 con el nº de miembros** dentro de la misma lista (`app/lifebook-messages.tsx:269-275`) | **Añadir el filtro que el dato ya permite**: hoy solo hay `Todos / No leídos` (`app/lifebook-messages.tsx:130-145`). Añadir **`Todos · Chats · Grupos`** usando `card.isGroup`, que **ya se calcula**. Es un cambio **solo de app** | **S** (el dato ya está) |
| 9 | **Cuentas de notificación (me gusta/seguidores/comentarios)** | Son **la «barra de notificaciones»**, separada del chat: **赞 · 藏 · 评 · @ · 关注 · oficial** **[BLOG]** [人人都是产品经理](https://bbs.fcxxh.org/thread-254881-1-362.html) · **[PRENSA]** [电商派](https://www.pai.com.cn/164811.html) | **Ya está y está bien**: los 3 atajos con contador están arriba de la pantalla de mensajes (`app/lifebook-messages.tsx:105-128`), con las bandejas reales en `/lifebook-inbox` (`app/lifebook-inbox.tsx:24-28`: «Me gusta · Guardados», «Seguidores», «Comentarios y @») y contadores de `/lifebook/me/inbox-counts` (`api/lifebook.ts:983`, `:1009`). **Ojo:** el badge de la barra superior de Life Book **NO cuenta esto**, solo el chat (`hooks/useUnreadChat.ts:22-23,40` → `lifebookChatApi.unread()`) | **Nada que arreglar aquí.** Solo decidir si el badge de la barra superior debe seguir siendo **solo chat** (recomendado: sí) o sumar las 3 bandejas | **—** |
| 10 | **Poner el avatar del dueño junto a los iconos de me gusta/seguidores/comentarios** (en mensajes) | **No lo he encontrado en 小红书.** Lo que sí está documentado (2025-05-30) es que 小红书 **subió las cifras 关注/粉丝/获赞 al lado del avatar** en el **perfil**, bajó la bio y agrandó el botón de seguir **[BLOG]** [优设 uisdc](https://www.uisdc.com/hunter/0221468526.html). **La referencia a Instagram del encargo no la he podido verificar** | **El patrón «avatar + cifras con icono» ya existe en nuestra app, pero en el PERFIL**: `app/lifebook-user.tsx:342-361` (Publicaciones · Seguidores · **Seguidos** · **Me gusta**, cada cifra con su icono). Y en el feed, el avatar del dueño **ya está en la barra superior**, a la derecha (`app/lifebook.tsx:633-657`), además del acceso desde el ☰ (`core/miPerfil.ts:29-33`) | **Recomendación: NO moverlo a mensajes.** La pantalla de mensajes no es donde el usuario busca su perfil, y **duplicaría una puerta que ya existe en dos sitios** — justo lo que `core/miPerfil.ts:1-28` prohíbe por escrito («si cada puerta montara su ruta a mano, el día que se cambie el perfil de sitio una llevaría al nuevo y la otra al viejo»). Si lo que se quiere es **ver tus cifras desde mensajes**, la forma barata es un **renglón de resumen** encima de los 3 atajos | **S** (renglón) · **M** (mover la puerta, y va contra el estándar de la casa) |

---

## 3. Propuesta de organización final para Life Book

### 3.1 Decisión previa que hay que tomar (y no la puedo tomar yo)

El encargo dice «en vez de "Para ti" que ponga **"Seguidos"**» y «al lado de "Seguidos" va
**"Descubrir"**». Pero **ya tenemos un canal que se llama «Siguiendo» y filtra por seguidos**
(`constants/lifebook.ts:22`, verificado contra la API: `docs/SEGUIDORES-EN-CONTEXTO-INVESTIGACION.md:689`).
Si además renombramos «Para ti» a «Seguidos», **tendríamos dos pestañas que dicen lo mismo** y una de
las dos mentiría (porque `for_you` **no** filtra por seguidos: mezcla — `api/lifebook.ts:371`).

**Propuesta: un solo canal de seguidos.** `following` → etiqueta **«Seguidos»** y **primera pestaña**.
`for_you` → etiqueta **«Descubrir»** (sigue mezclando, que es lo que hace bien) y **segunda**.

**Y un aviso importante de producto:** si «Seguidos» pasa a ser **la pestaña por defecto**, estamos
haciendo lo **contrario** de lo que hizo 小红书, que **concentró el tráfico en la página de
recomendación** y **degradó** seguidos ([BLOG] [人人都是产品经理](https://bbs.fcxxh.org/thread-254881-1-362.html)).
En una app que **arranca con pocos usuarios y poco contenido**, abrir en «Seguidos» significa **abrir
en una pantalla vacía** — y ya tenemos el copy para ese caso (`app/lifebook.tsx:85-86`: «Aún no hay
publicaciones de tus seguidos»). **Recomiendo que «Seguidos» sea la primera pestaña por la izquierda
pero que la app abra en «Descubrir»**, que es lo defendible con lo que dice 小红书. Es una decisión del
dueño; queda señalada.

### 3.2 Cómo quedaría la parte de arriba (dibujo en texto)

```
┌──────────────────────────────────────────────────────────────────┐
│  ←      Seguidos    Descubrir    📍 Malabo ▾                     │  ← fila 1: PESTAÑAS PRINCIPALES
│         ▔▔▔▔▔▔▔▔                                                 │     (texto + subrayado, como ahora)
├──────────────────────────────────────────────────────────────────┤
│  🔍            🔔(2)                                   (avatar)   │  ← barra de arriba DELGADA
│                                                                  │     Buscar · Notificaciones(badge) · Mi perfil
├──────────────────────────────────────────────────────────────────┤
│  ╭────╮ ╭────╮ ╭────╮ ╭────╮ ╭────╮ ╭────╮              →        │  ← fila 2: AVATARES DE SEGUIDOS
│  │ ●  │ │    │ │ ●  │ │    │ │ ●  │ │    │                       │     SOLO en la pestaña «Seguidos»
│  ╰────╯ ╰────╯ ╰────╯ ╰────╯ ╰────╯ ╰────╯                       │     ● = anillo: tiene novedad
│   Ana    Luis   Marta  José   Bea    Kike                        │     (se desliza en horizontal)
├──────────────────────────────────────────────────────────────────┤
│  (Debates)(Comida)(Taxi)(Trabajo)(Alquiler)(Ventas)(Comercio)    │  ← fila 3: CHIPS DE TEMAS
│  (Cultura)(Música)(Deportes)…                            →       │     píldoras, NO pestañas
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌─────────┐  ┌─────────┐        ← feed masonry 2 columnas      │
│   │         │  │         │           (igual que hoy)             │
│   └─────────┘  └─────────┘                                       │
│   ┌─────────┐  ┌─────────┐                                       │
└──────────────────────────────────────────────────────────────────┘
       ▶                                (+)   ← los dos FAB, sin cambios
```

**Y cuando se toca la pestaña de la CIUDAD**, la fila 3 **cambia de contenido** (no se añade otra
fila), que es como lo hace 小红书 dentro de 附近:

```
┌──────────────────────────────────────────────────────────────────┐
│  ←      Seguidos    Descubrir    📍 Malabo ▾                     │
├──────────────────────────────────────────────────────────────────┤
│  🔍            🔔(2)                                   (avatar)   │
├──────────────────────────────────────────────────────────────────┤
│  (Recomendado)(City walk)(Comida)(Turismo)(Bares)(Fiesta)        │  ← fila 3 = categorías de la CIUDAD
│  (Cultura)…                                              →       │
├──────────────────────────────────────────────────────────────────┤
│   feed filtrado por ciudad + categoría                           │
└──────────────────────────────────────────────────────────────────┘
```

**Las cuatro reglas de este dibujo, y por qué:**

1. **La fila de avatares va SOLO en «Seguidos», no en «Descubrir».** En 小红书 el módulo de avatares
   nació **como sustituto de la pestaña de seguidos**, y su lógica es de **cola de no leídos**
   (anillo → se abre → el anillo se va → el avatar se va al final —
   [PRENSA] [电商派](https://www.pai.com.cn/164811.html)). Pegarlo en «Descubrir» no tendría sentido:
   ahí no estás mirando a tu gente.
2. **El avatar sigue ARRIBA A LA DERECHA, y no se mueve a mensajes.** Es donde está hoy
   (`app/lifebook.tsx:633-657`), es el patrón que `core/miPerfil.ts:1-28` documenta como estándar de la
   casa, y **no lo he encontrado en 小红书 dentro de mensajes**. Lo que sí se puede añadir, si el dueño
   quiere ver sus cifras desde mensajes, es un **renglón de resumen** (no una puerta nueva):
   `Tu perfil · 12 publicaciones · 34 seguidores · 8 me gusta`.
3. **La ciudad se muda de la barra de arriba a la fila de pestañas.** Hoy la barra de arriba tiene
   **cinco** cosas (Volver, Ciudad, Buscar, Mensajes, Avatar — `app/lifebook.tsx:543-657`) y está
   cargada. Bajarla a la fila de pestañas deja la barra en tres (Volver/Buscar, Notificaciones, Avatar)
   y **coincide con 小红书**, donde la ciudad es **una entrada de navegación de primer nivel**
   ([PRENSA] [电商派 2024-02-05](https://www.pai.com.cn/238902.html)). **El modal de ciudad no se toca**
   (`app/lifebook.tsx:986-1081`), así que el cambio es barato.
4. **Los chips de temas son píldoras, no pestañas.** Es la única forma de que el usuario entienda que
   arriba hay **tres destinos** y abajo **un filtro del feed**. Si los 12 llevan el mismo subrayado, la
   fila de arriba no significa nada.

### 3.3 Cómo quedaría la pantalla de mensajes (dibujo en texto)

```
┌──────────────────────────────────────────────────────────────────┐
│  Mensajes            🔍   ⊞   🧭   👤+   ⛶                       │  ← se QUEDA como está
│  3 sin leer                                                      │     (app/lifebook-messages.tsx:76-103)
├──────────────────────────────────────────────────────────────────┤
│   ❤️ Me gusta   👤+ Seguidores   @ Comentarios                    │  ← se QUEDA: son las NOTIFICACIONES
│      5                 2               17                        │     (app/lifebook-messages.tsx:105-128)
│                          ──────────────────────────────────────  │  ← separador: aquí acaba el «feedback»
│  ( Todos ) ( Chats ) ( Grupos )                                  │  ← NUEVO: separar chat de grupos
│                                                                  │     (el dato `isGroup` YA existe:
│  ╭──╮  Ana                           14:02        ②             │      api/messages.ts:403-425)
│  │  │  ¿Quedamos mañana?                                         │
│  ╰──╯                                                            │
│  ╭──╮  Marta                         13:40                       │
│  │  │  Te mando las fotos                                        │
│  ╰──╯                                                            │
├──────────────────────────────────────────────────────────────────┤
│            [Life Book] [Taxi] [Inicio] [Mensajes] [Perfil]        │  ← dock, sin cambios
└──────────────────────────────────────────────────────────────────┘
```

**Al tocar «Grupos»**, la misma lista pero solo con las conversaciones cuyo `card.isGroup` es `true`
— que hoy se distinguen por un chip 👥 con el número de miembros
(`app/lifebook-messages.tsx:269-275`).

**Lo que NO se toca, y por qué:**

- **No se quitan los 3 atajos de bandeja de arriba.** En 小红书 **existen** (son la «barra de
  notificaciones», separada del chat — [BLOG] [人人都是产品经理](https://bbs.fcxxh.org/thread-254881-1-362.html)),
  y en nuestra app **ya están bien hechos**: iconos con contador, cada uno con su pantalla real
  (`app/lifebook-messages.tsx:105-128` → `app/lifebook-inbox.tsx:24-28`).
- **No se mete el avatar del dueño en esta pantalla** (§2 #10 y §3.2 regla 2).
- **El dock no se toca.** En 小红书 «我» está en el footer y nunca se ha movido de ahí
  ([PRENSA] [36氪](https://36kr.com/p/2130033079593984) · [DoNews](https://www.donews.com/article/detail/5093/89519.html));
  el nuestro ya tiene «Perfil» en la quinta plaza (`components/FloatingFooter.tsx:25-31`).

---

## 4. Qué se puede hacer HOY con el backend y qué necesita backend nuevo

> Todo lo de esta sección sale de **leer el contrato del cliente** (`api/*.ts`) y de la
> **investigación previa verificada contra la API real** que ya está en el repo
> (`docs/SEGUIDORES-EN-CONTEXTO-INVESTIGACION.md`). **No he podido entrar al servidor en esta sesión**
> — no hay clave SSH en esta máquina, solo `known_hosts` — así que **nada de esta sección se ha
> re-verificado hoy**. Ver §5.

### 4.1 Lo que YA soporta el backend (no hay que tocar servidor)

| Lo que se quiere | Cómo se hace hoy | Evidencia |
|---|---|---|
| **Título «Seguidos»** | Es el canal `following`, y **filtra de verdad**: devuelve solo `author.followedByMe: true` | `api/lifebook.ts:370-373`; `docs/SEGUIDORES-EN-CONTEXTO-INVESTIGACION.md:330-358` (código del filtro) y `:689` (**probado en vivo: 200, 4 posts, los 4 de gente seguida**) |
| **Título «Descubrir»** | Es el canal `for_you`, que **mezcla** | `docs/SEGUIDORES-EN-CONTEXTO-INVESTIGACION.md:690` (**probado en vivo: 5 posts, mezcla seguidos y no seguidos**) |
| **«Comercio»** | El canal **`sales`** ya existe en la lista válida del servidor y en la app | `constants/lifebook.ts:30`; lista de canales válidos `['for_you','following','nearby','today','debates','food','taxi','work','rental','sales','culture','music','sports']` en `docs/SEGUIDORES-EN-CONTEXTO-INVESTIGACION.md:332-333` |
| **Separar chats de grupos** | El dato **ya viene**: `kind: 'direct' \| 'group'`, y `toConversationCard` calcula `isGroup` y `memberCount` | `api/messages.ts:34-35`, `:88`, `:403-425` |
| **Separar las notificaciones del chat** | Ya está separado de facto: los 3 atajos y las 3 bandejas | `app/lifebook-messages.tsx:105-128`; `app/lifebook-inbox.tsx:24-28`; `api/lifebook.ts:983`, `:1009-1020` |
| **La ciudad** | `<city>` viaja en cada llamada al feed; el modal ya existe | `app/lifebook.tsx:328-331`, `:986-1081` |
| **Filtrar el feed por tipo de publicación** | El contrato del feed acepta `type`, y la pantalla de explorar ya lo usa con `sale`, `service`, `debate`, `video`… | `api/lifebook.ts:371-373`; `app/lifebook-explore.tsx:34-44` |

**Conclusión de 4.1: el 80 % de lo que pide el dueño son etiquetas, orden y layout. Cero backend.**

### 4.2 Lo que necesita backend NUEVO

| Lo que se quiere | Qué falta exactamente | Por qué no se puede simular |
|---|---|---|
| **La fila de avatares de «Seguidos»** | Un endpoint del tipo `GET /lifebook/me/following` que devuelva **id, nombre y avatar** de a quién sigo. **No existe**: `api/lifebook.ts` tiene `follow`, `unfollow` y `profile` (`:460-464`) pero **ningún listado**, y el perfil solo trae el **número** (`:313`) | **Ojo con una trampa fácil:** `/lifebook/me/new-followers` (`api/lifebook.ts:1012`) **NO sirve** — es «quién me sigue **a mí**», lo contrario. Lo bueno: **la tabla y el índice ya están**. La investigación previa midió `lifebook.follows` con el índice `ix_lb_follows_follower (follower_id, created_at DESC)` y lo dejó escrito: «**El índice que hace falta para «a quién sigo yo» ya está** — consultar los seguidores de un visor es una búsqueda indexada, no un escaneo» (`docs/SEGUIDORES-EN-CONTEXTO-INVESTIGACION.md:320-322`). **No hay que inventar el endpoint a ciegas: hay que comprobar si ya existe una ruta equivalente** (era justo la pregunta abierta que dejó escrita `docs/PLAN-BLOQUES-LIKEBOOK.md:112`) |
| **El ANILLO (quién tiene contenido nuevo)** | Un dato de «tiene novedad desde la última vez que lo miré **a él**» **por persona**. El servidor solo sabe contar no leídos **de chat** (`hooks/useUnreadChat.ts:40` → `lifebookChatApi.unread()`) y **de comentarios/menciones** (`api/lifebook.ts:1019`, `markRead(kind)` con `likes\|followers\|comments`). **No hay nada por autor, ni nada por «última visita a este perfil»** | **Esto es lo caro, no la fila.** Para hacerlo bien hace falta: (a) fecha del último post por autor seguido, (b) **estado por usuario y por autor** («hasta cuándo he visto a Ana»), que hoy **no existe en ningún sitio**. La fila sin anillo es fácil; **la fila sin anillo es solo una lista de contactos** |
| **Chips de la ciudad que de verdad filtren** | Categorías reales asignadas a las publicaciones (no `topics` libres del usuario) y un parámetro de filtro. Hoy las publicaciones llevan `topics`/`tags` (etiquetas **que escribe el autor**, `constants/lifebook.ts:80-84`, máximo 5) y `category`, que **es derivada** del canal o del tipo — no una taxonomía cerrada | Si se filtran por `topics` libres, los chips **estarán casi siempre vacíos**: son 14 temas del catálogo local y el autor elige hasta 5. **«City walk», «Bares» y «Fiesta» no existen hoy como categoría en ningún sitio** de nuestro backend |
| **«Comercio» con cuentas y publicaciones juntas** | Cruzar `lifebook.posts` (tipo `sale`, `linkType='ecomerse'`) con el **catálogo de comercio**, que vive en **otra API**: `api/ecomerse.ts:88-95` (`/ecomerse/catalog`, `/ecomerse/categories`) y `api/commerce.ts:287-298`. Hoy **son dos mundos separados** | Un chip «Comercio» que enseñe **tiendas de verdad** (no notas de venta) necesita o bien una llamada a las dos APIs y una mezcla en el cliente, o bien un canal nuevo del servidor que una ambos. **Recomiendo empezar por el canal `sales` y meter las tiendas dentro** |

### 4.3 Orden aconsejado (de lo barato y seguro a lo caro)

1. **Etiquetas y orden** («Seguidos» / «Descubrir», dos filas, ciudad a la fila de pestañas) — **S**,
   sin backend, sin riesgo.
2. **Chips de temas + Comercio = `sales`** — **S**, sin backend.
3. **Filtro `Todos · Chats · Grupos`** en mensajes — **S**, el dato ya está.
4. **Fila de avatares SIN anillo** (al tocar → perfil, que ya existe) — **M**, necesita el endpoint de
   seguidos. **Es una entrega con valor propio y sin el problema del estado «leído».**
5. **Anillo de novedad** — **L**, necesita tabla de estado por (usuario, autor). **Sin esto, la fila
   es una lista de contactos, no la fila de 小红书.**
6. **Chips de ciudad que filtren** — **L**, necesita taxonomía real. **Mientras tanto: chips que
   naveguen a búsquedas** (ya existe `/lifebook-search` y hasta la fila de «búsquedas relacionadas»
   de `app/lifebook-videos.tsx:1174-1188`), que da el 80 % de la sensación con el 10 % del trabajo.

---

## 5. LO QUE NO HE PODIDO VERIFICAR

**Esto no se usa para decidir nada. Está aquí para que nadie lo dé por bueno sin comprobarlo.**

### 5.1 Lo que no he podido verificar de 小红书

1. **El estado ACTUAL de la interfaz de 小红书.** Todas las fuentes de interfaz son **crónicas de
   cambios** (2019-2025). **No he abierto la app.** Por tanto **no puedo afirmar cómo está hoy**
   ninguna de estas cosas:
   - el número, el nombre y el orden **actuales** de las pestañas de arriba;
   - si se puede **deslizar** entre ellas (ninguna fuente lo dice);
   - cuál es la pestaña por defecto (**dos fuentes de blog sugieren que es la de recomendación; ninguna
     oficial**);
   - si hoy **existe o no** la fila de avatares de 关注, y si está en 关注 o también en 发现. La fuente
     que la describe es de **noviembre de 2021** y **ese rediseño se revirtió**;
   - si el avatar de esa fila abre **el perfil** o una **vista de novedades de esa persona**;
   - el estado actual de la **pantalla de mensajes** (la separación 私信/群 que describo es de 2021, y
     ese cambio se revirtió parcialmente).
2. **La lista REAL y completa de chips de temas del feed.** **No existe ninguna lista oficial
   publicada** que haya podido encontrar. Ni el número, ni el orden, ni el detalle de qué puede el
   usuario añadir, quitar u ocultar. Lo único documentado es que **existen «mis canales» (我的频道) y
   que hay posiciones fijas del producto** («推荐/视频/直播» no se pueden mover). **He encontrado las 15
   «pistas de contenido» (赛道) documentadas por el sector** (§1.4, [BLOG]
   [零壹电商](https://www.2i1i.com/53032.html)), **pero eso son categorías de contenido, NO los chips de
   la interfaz**: no puedo afirmar que esas palabras, en ese orden, sean lo que se ve en la barra.
3. **La lista REAL y completa de categorías de la pestaña de ciudad.** Lo más concreto que he
   encontrado es **拍照地 · 餐厅 · 玩乐 · 景点 · …** (con puntos suspensivos **en la propia fuente**) y,
   por otro lado, **餐厅 · 玩乐 · 景点 · 周边游**. **No es una lista cerrada.** Y en particular:
   **«City walk», «Bares» y «Fiesta» no aparecen como chips de ciudad en NINGUNA fuente.**
   («City walk» sí aparece en 小红书, pero como **campaña y hashtag** — «City Walk 宝藏城市».)
4. **La pestaña de 消息 hoy**: estructura exacta, nombres de las pestañas internas y si el chat sigue
   viviendo en la esquina superior izquierda de la pantalla principal.
5. **La barra de arriba de la app hoy**: qué iconos tiene y en qué orden. Lo único oficial que he
   leído es la navegación de la **web** (发现 · 直播 · 发布 · 通知 · 消息), **que no es la app**.
6. **Si existe un atajo al perfil propio desde la barra de arriba o desde mensajes en 小红书.**
7. **Instagram: el avatar arriba a la derecha de la página de actividad.** **El encargo lo daba por
   hecho y yo no lo he podido confirmar.** Busqué en el centro de ayuda oficial
   (`help.instagram.com`), en el blog de Instagram y en guías de terceros; lo único que encontré es
   que el avatar está **abajo a la derecha** (la pestaña de perfil)
   ([BLOG] [ShareThis](https://sharethis.com/social-media/2022/05/instagram-notifications-101/)).
   **No hay ninguna fuente en este documento que respalde la afirmación «Instagram tiene el avatar
   arriba a la derecha en la página de actividad».**

### 5.2 Limitaciones del método (importante para juzgar este documento)

- **Dos fuentes citadas vía buscador sin URL canónica.** Los artículos de **新榜** (categorías de la
  página 附近) y de **壹娱观察** (las tres posiciones fijas de 发现) los leí **como extracto en el
  buscador Sogou**, y **no pude abrir su URL original** (los buscadores chinos empezaron a pedir
  captcha a mitad de la investigación). **Están marcados como [PRENSA] pero con URL de buscador: quien
  los use, que abra el original antes de citarlos.**
- **Zhihu, Baidu, 360 y Google bloquearon el acceso** desde esta máquina en algún momento; varios
  artículos relevantes (entre ellos los de Zhihu sobre el rediseño) devolvieron **403** y **no se han
  usado**.
- **El centro de ayuda oficial de 小红书 no da texto sin JavaScript.** Las páginas
  `help.xiaohongshu.com` y `creator.xiaohongshu.com/creator/help` devuelven la cáscara vacía. **No he
  podido leer ni una sola página oficial de ayuda de 小红书.**
- **No he verificado nada en el servidor.** La máquina tiene el puerto 22 abierto en `8.218.88.237`
  pero **no hay clave SSH** (solo `known_hosts`), así que **no he podido leer
  `src/lifebook/lifebook.service.ts` hoy**. Todo lo del backend (§4) sale del **contrato del cliente**
  y de **la investigación previa ya verificada contra la API en vivo** que está en este mismo repo
  (`docs/SEGUIDORES-EN-CONTEXTO-INVESTIGACION.md`, que ancla sus líneas al `md5 32fe0d1c…`). **Si ese
  fichero ha cambiado desde entonces, hay que re-comprobarlo.**

### 5.3 Preguntas abiertas que el dueño debe contestar

Son decisiones de producto, no datos que falten:

1. **¿«Seguidos» sustituye a «Siguiendo» o a «Para ti»?** (§3.1) Si sustituye a «Para ti», hay que
   decidir qué pasa con el canal `following` que ya existe y ya funciona.
2. **¿La app abre en «Seguidos» o en «Descubrir»?** (§3.1) Abrir en «Seguidos» es lo contrario de lo
   que hace 小红书 y, con poco contenido, es abrir en una pantalla vacía.
3. **¿La fila de avatares es de TODOS los seguidos o solo de los que tienen novedad?** (§1.1) En 小红书
   es «los que miras a menudo» y solo los no leídos van delante.
4. **¿Los chips de ciudad filtran de verdad o navegan?** (§3.2 / §4.2) Filtrar de verdad necesita
   taxonomía en el backend; navegar a búsqueda se hace ya.
5. **Los 7 chips de ciudad del encargo: ¿son los definitivos?** Tres de ellos (**City walk, Bares,
   Fiesta**) **no tienen hoy ninguna categoría correspondiente en nuestro backend ni fuente en 小红书**.

---

## 6. Fuentes, con su clasificación

| Fuente | Qué es | Etiqueta | Qué se saca de ella |
|---|---|---|---|
| [xiaohongshu.com](https://www.xiaohongshu.com) (leído 14-sep-2026) | Web oficial | **[OFICIAL]** | Navegación de la **web**: 发现 · 直播 · 发布 · 通知 · 消息. **No es la app** |
| [XHS en el App Store de China](https://apps.apple.com/cn/app/id741292507) | Ficha oficial de la tienda | **[OFICIAL]** | Descripción de la app («你的生活兴趣社区»). **No describe la estructura de pestañas** |
| [电商派, «小红书首页改版调整 部分模块消失», 2021-11-04](https://www.pai.com.cn/164811.html) | Prensa, citando a 麋鹿先生Sky | **[PRENSA]** | **La fuente clave de la fila de avatares**: «经常浏览的博主», **anillo rojo**, «**打开后头像红圈消失，并且头像排序后置**», «前面只显示未读的头像», «我的频道» conservado + «推荐» y «附近» añadidos. También: las 3 pestañas canceladas, la partición de mensajes («评论/点赞/收藏·关注» y «群/私信/圈子») |
| [电商派, «小红书新增"附近"一级入口», 2024-02-05](https://www.pai.com.cn/238902.html) | Prensa | **[PRENSA]** | «附近» y «春节» como **entradas de primer nivel en la barra de ARRIBA**; «附近» = mapa de notas, directos y **grupos**; 同城 agrega 餐厅/玩乐/景点/周边游 |
| [电商派, «小红书同城支持地图搜索 融入社交功能», 2024-03-08](https://www.pai.com.cn/240801.html) | Prensa | **[PRENSA]** | El **botón flotante «搜索 ▪ 宝安区»** sobre el mapa; POIs con nº de notas; enlace a Baidu Maps; **grupos cercanos**; mascotas |
| [DoNews / 连线Insight, «"电商"成"市集"», 2025-09-03](https://www.donews.com/article/detail/5093/89519.html) | Prensa | **[PRENSA]** | «**底部导航栏的"商城"悄然换成了"市集"**» (2025-08-28); 市集 vuelve a ser **primer nivel**; canales fijos 市集直播/买手橱窗/新品首发 |
| [壹览商业, «市集上线，小红书味儿的货架电商来了», 2025-09-03](https://www.yilantop.com/article/25635) | Prensa | **[PRENSA]** | «小红书 App 在底部导航新增"市集"页面，**与首页并列成为一级入口**»; feed de 2 columnas; «页面上方还有固定的频道位» |
| [36氪, «视频拿到小红书一级入口»](https://36kr.com/p/2130033079593984) | Prensa | **[PRENSA]** | El «视频» entra como entrada de primer nivel (2023-01) |
| [运营派 / 庄俊, «小红书又又又改版»](https://www.yunyingpai.com/xhs/899265.html) | Blog de marketing | **[BLOG]** | Cronología: 2020-08 视频号 · **2022-12-30 vídeo al 100 %** · **2023-01-05 «购物» → «视频», en la 2ª plaza** |
| [人人都是产品经理 / 江流, «小红书改版的产品逻辑分析和营销预测»](https://bbs.fcxxh.org/thread-254881-1-362.html) | Blog de producto (reposteo) | **[BLOG]** | **El análisis de fondo**: las 3 entradas → 1; «关注页取消，改为首页顶部**经常浏览的博主**模块»; **la partición de mensajes y su porqué** (social vs. feedback); números → puntos rojos; y la confesión de que «**已经回撤了版本**» |
| [优设 uisdc, «关注逻辑重构», 2025-05-30](https://www.uisdc.com/hunter/0221468526.html) | Blog de diseño | **[BLOG]** | A/B test del perfil: cifras **junto al avatar**, bio abajo, botón grande de seguir, cajón «**关注他的人也关注了**» |
| [麋鹿先生Sky (WeChat), «小红书关注页面改版带来的机遇和挑战»](https://mp.weixin.qq.com/s?src=11&timestamp=1789315319&ver=6964&signature=RJy9UwA8l121ReI-fGlogZ9-yCQGmQyfgHam5mlsNfrElFVkaCAlmu90rASZlRDEzxs-3eO452BkpC5GmLQzKxEjJ4iPsk2S8dUhQqbQrkFk5GeQ4sDfT*TyH-5VsTR&new=1) | Blog de operadores (abril 2020) | **[BLOG]** | La página de 关注 pasa a mostrar **el contenido completo dentro de la pestaña** y en **orden no cronológico** |
| 新榜, «实测小红书本地团购功能» | Prensa (leída como extracto) | **[PRENSA]** ⚠️ | «发现上海附近页的**细分置顶处显示拍照地、餐厅、玩乐、景点、…**» — **URL canónica no obtenida** |
| 壹娱观察, «蚕食抖快…» | Prensa (leída como extracto) | **[PRENSA]** ⚠️ | «发现页的"推荐"、"视频"、"直播"三个频道**被固定在前三位，位置不可移动**» — **URL canónica no obtenida** |
| [零壹电商, «小红书适合做什么领域(小红书热门赛道)», 2023-11-18](https://www.2i1i.com/53032.html) | Blog de marketing / e-commerce | **[BLOG]** | Las **15 «pistas de contenido» (赛道)** de 小红书 con sus subgéneros: 美妆 · 时尚穿搭 · 珠宝配饰 · 家居家装 · 美食饮品 · 母婴早教 · 健身减脂 · 萌宠动物 · 旅行住宿 · 知识付费/职场成长 · 心理情感 · 商业财经 · 艺术设计 · 科技数码 · 摄影拍摄 |
| [ShareThis, «Instagram Notifications 101», 2022-05](https://sharethis.com/social-media/2022/05/instagram-notifications-101/) | Blog de marketing | **[BLOG]** | En Instagram el avatar/perfil está **abajo a la derecha**. **No respalda** el «avatar arriba a la derecha en actividad» |
| `docs/SEGUIDORES-EN-CONTEXTO-INVESTIGACION.md` (este repo) | Investigación previa **verificada contra la API en vivo** | **Interna** | Los 13 canales válidos del servidor; `following` filtra de verdad (**probado: 4 posts, los 4 seguidos**); `for_you` mezcla; canal inválido → **400 `CHANNEL_INVALID`**; el índice `ix_lb_follows_follower` **ya existe** |
| `docs/PLAN-BLOQUES-LIKEBOOK.md:107-112` (este repo) | Plan interno | **Interna** | **El bloque B3 es literalmente este encargo** (««Siguiendo»: las personas que siguen arriba»), y dejó escrita la pregunta abierta: «¿`/lifebook/users/:id/following`? **¿ya existe? medirlo antes de inventar el endpoint**» |

---

## 7. Resumen en cinco líneas

1. **La fila de avatares que pide el dueño existe en 小红书 y su descripción es correcta** —avatares con
   **anillo rojo** de novedad que, al abrirse, pierden el anillo y **se van al final de la fila**— pero
   la fuente es de **2021** y **ese rediseño se revirtió**; y nació para **quitar peso** a la pestaña de
   seguidos, no para dárselo.
2. **La separación que el dueño quiere en mensajes (chats vs. grupos) ya la permite nuestro backend**
   (`kind: direct|group`, `isGroup` ya calculado): es **solo un filtro de app**, un día de trabajo.
3. **Casi todo lo demás que pide son etiquetas y layout**: «Seguidos»/«Descubrir» existen ya como
   canales (`following`/`for_you`), «Comercio» existe como canal (`sales`), y la ciudad ya tiene su
   modal. **Cero backend.**
4. **Lo único caro es el ANILLO**: saber *quién tiene contenido nuevo* por persona necesita estado
   (usuario, autor) que **hoy no existe en ninguna tabla ni en ninguna API**. La fila sin anillo es
   barata; **sin anillo es una lista de contactos, no la fila de 小红书.**
5. **Y hay que decirlo claro: la lista REAL de chips de temas de 小红书 y la de categorías de la
   ciudad NO las he podido verificar.** De los 7 chips de ciudad del encargo, **tres (City walk, Bares,
   Fiesta) no aparecen en ninguna fuente sobre 小红书 ni tienen categoría en nuestro backend.**
