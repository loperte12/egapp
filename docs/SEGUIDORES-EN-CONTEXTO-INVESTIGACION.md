# Meter a la gente que sigues DENTRO del contenido — investigación

Fecha: 2026-09-14. Estado: **investigación**, no implementado.

Pregunta del dueño: *«Investiga cómo Xiaohongshu o Instagram agrega los perfiles de
las personas que sigues en donde están, si es posible agregarlos en Life Book.»*

Traducido a algo que se pueda decidir: **cómo meten esas plataformas a la gente que
sigues dentro del contenido** (en el feed, en los comentarios, en el perfil, en las
sugerencias) **y no en una lista aparte de seguidores**. Y, sobre todo: si eso se
puede hacer aquí.

Todo lo que dice «verificado» en este documento está comprobado **en nuestro código,
en la base de datos real o contra la API en vivo** de `hk.egrouteplan.com`, no
supuesto. Lo de las plataformas va con URL.

> **Nota de vigencia (2026-09-14, añadida después).** Durante esta investigación
> `src/lifebook/lifebook.service.ts` cambió en el servidor (de 5 000 a 5 146 líneas):
> **fueron los parches de esta misma ronda** — comentarios con publicación adjunta,
> publicidad dentro de los comentarios y «seguir viendo» —, hechos por el agente
> principal con copias `.bak-*`. Comprobado después de todos ellos que las
> conclusiones de este documento siguen siendo ciertas:
> `serializeComment` **sigue sin** `following`/`teSigue` (lo único que se le añadió es
> `ref`, la publicación adjunta); **sigue sin haber** endpoint de «quién dio me gusta»
> (`/likes`, `/reactions`, `/liked-by` → 404); y el filtro de la pestaña «Siguiendo»
> sigue donde estaba. Las tres apariciones de la palabra `following` en ese fichero
> son el **contador** del perfil (`:1141`) y la respuesta de seguir/dejar de seguir
> (`:3613`, `:3618`), no marcas de relación dentro del contenido.
> Los números de línea de este documento son de la versión del `md5`
> `32fe0d1ce4d0f48b2ecc41c092763925`; para tocar código, **busca por método**, no por
> línea.

**Cómo leer las fuentes de las plataformas**, porque no todas valen lo mismo:

- **Oficial** = comunicado o blog de la propia plataforma / prensa que cita el
  anuncio oficial. Es lo único que uso como base.
- **Prensa tecnológica** = The Verge, TechCrunch, CNET, InfoQ… Fiables para «qué se
  lanzó y cuándo», no para «cómo funciona por dentro».
- **Tercero / marketing** = blogs que **infer** el funcionamiento desde fuera. Los
  marco siempre y **no los uso como base de ninguna decisión**.
- **Ingeniería inversa** (solo Xiaohongshu) = documentos de API reversa. Valen como
  pista de qué campos existen, nunca como hecho.

Lo que no he podido verificar con fuente **no se usa para decidir nada** y está
listado entero en §6.

---

## 0. Titular: la pestaña ya existe, lo que falta es la relación DENTRO del contenido

Tres cosas, y las tres son la respuesta a la pregunta:

1. **La pestaña «Siguiendo» del feed existe, está en el backend y filtra de verdad.**
   No es un hueco ni una etiqueta decorativa. Verificado leyendo el filtro
   (`src/lifebook/lifebook.service.ts:868-873`) **y llamando a la API en vivo**:
   con la cuenta de prueba `ec7d4cb7…`, que sigue a `ec6bb87f…`, el canal
   `channel=following` devuelve **4 publicaciones y las 4 con `author.followedByMe: true`**,
   mientras `for_you` devuelve 5 y mezcla autores no seguidos. Cuadra con el SQL:
   ese autor tiene exactamente 4 publicaciones públicas activas. Detalle en §4.
2. **Lo que NO existe es llevar esa relación *dentro* del contenido.** Hoy el visor
   no puede saber, mirando un comentario, quién comenta ni qué relación tiene con él:
   el servidor manda `author{id, fullName, avatarUrl, role}` y nada más
   (`lifebook.service.ts:3418` `serializeComment`). **No hay `following`, no hay
   `teSigue`, no hay `esAutor`.** Comprobado también en vivo sobre un comentario real
   (§4.3).
3. **Los datos para hacerlo ya están todos, y hay señal real que enseñar hoy.**
   `lifebook.follows(follower_id, followee_id, created_at, read_at)`,
   `lifebook.likes(post_id, user_id, reaction)`, `lifebook.comments(author_id)`.
   La consulta que alimentaría «a N personas que sigues les gusta» devuelve **82 me
   gusta distintos repartidos en 77 publicaciones** (86 pares `me gusta × seguidor`).
   O sea: **la línea tendría contenido de verdad hoy**, no saldría vacía.

   **Pero con un aviso que no quiero esconder:** `lifebook.likes` tiene **82 filas en
   total**, así que ese 82 quiere decir que **hoy el 100 % de los me gusta de la base
   cumple la condición**. Eso **no** es un mérito del diseño: es consecuencia de que
   el grafo tiene 3 personas seguidas y son justo las que más publican y likean. Con
   gente real el porcentaje caería a una fracción pequeña. La conclusión honesta es
   «los datos están y la consulta funciona», **no** «el 100 % de los me gusta son
   sociales».

El aviso honesto: **el grafo social es diminuto**. `lifebook.follows` tiene
**4 filas** y **3 usuarios distintos** en cada lado, sobre 11 usuarios en
`mobility.users`. Cualquier función que dependa del grafo se verá pequeña hasta que
entre gente. Eso no quita que sea lo correcto; sí cambia **el orden** de lo que
conviene construir primero (ver §5: lo más barato y lo más útil no es lo que más
depende del grafo).

---

## 1. Tabla de mecanismos: qué hacen ellas y qué tenemos nosotros

Instagram y Xiaohongshu resuelven esto con **nueve** mecanismos distintos. La
columna que decide es la penúltima.

| # | Mecanismo | Cómo se llama en Instagram | En Xiaohongshu | Datos que necesita | ¿Lo tenemos ya? | Esfuerzo |
|---|---|---|---|---|---|---|
| 1 | Feed de **solo** gente que sigues | **Following** (modo cronológico de feed, 2022) | pestaña **关注** | `follows` + posts del autor | **SÍ, completo y verificado en vivo.** Filtro en `lifebook.service.ts:868-873`; canal en `lifebook.controller.ts:592`; pestaña en `constants/lifebook.ts:22` y uso en `app/lifebook.tsx:373` | — (ya está) |
| 2 | «**A N personas que sigues les gusta**» | **Liked by X and others** | *(no verificado)* | `likes(post_id,user_id)` × `follows(follower_id,followee_id)` | **Los datos sí, el endpoint no.** `lifebook.likes` tiene `post_id`,`user_id`; el detalle solo manda contador (`lifebook.service.ts:685`) y **no hay ruta de «quién ha reaccionado»** (3 rutas probadas → 404, §4.4) | **Bajo** |
| 3 | **Quién ha dado me gusta** (lista de avatares) | hoja «Likes» | lista de 赞过 | `likes` con `user_id` + join a `users` | **NO en Life Book.** Pero **SÍ existe el precedente exacto en nuestro propio código**: el estado 24 h tiene `GET /mobility/status/:id/reactions` (`src/mobility/status.controller.ts:257` → `status-social.service.ts:171`), que devuelve `{total, items:[{at,reaction,mine,user}]}`. Copiar esa forma es casi trabajo de copiar y pegar | **Bajo** |
| 4 | «**Seguido por X**» (amigos en común) | **Followed by a, b + N more** | *(no verificado)* | `follows` × 2 (amigos de amigos) | **NO.** `suggestedUsers` (`lifebook.service.ts:3014`) **no usa el grafo en absoluto**: ordena por publicaciones recientes y el motivo es el rol verificado («Conductor verificado», comprobado en vivo) | **Medio** |
| 5 | «**Te sigue**» en el perfil | **Follows you** | *(no verificado)* | `follows` inverso | **El dato SÍ llega y se tira a la basura.** El servidor calcula `relation.isFollower` (`lifebook.service.ts:1120`) y el cliente lo declara (`api/lifebook.ts:315` y `:630`)… y **no se usa en ninguna pantalla**: `app/lifebook-user.tsx:382-391` pinta «Siguiendo/Seguir» y nada más. Grep de `isFollower` en todo el repo: 2 coincidencias, las dos son la declaración del tipo | **Muy bajo** |
| 6 | **Badge de autor** en el comentario | Author | **作者** | `comments.author_id` = `posts.author_id` | **NO, pero es una línea.** `serializeComment` (`lifebook.service.ts:3418`) no lo manda. El hueco visual ya existe: el chip «TÚ» en `components/lifebook/CommentsSheet.tsx:128-132` | **Muy bajo** |
| 7 | **Marca de relación en cada comentario** | *(no verificado)* | *(no verificado)* | `comments.author_id` × `follows` | **NO.** Ninguno de los dos serializadores de comentarios (`:3418`, `:3513`) consulta `follows`. El `role` que sí llega es el rol de plataforma (`PASSENGER`), **no** «autor de la publicación» — verificado en vivo | **Bajo** |
| 8 | **Avisos de nuevos seguidores** | Activity / pestaña de seguidores | **新增关注** | `follows.read_at` | **SÍ, completo.** `newFollowers` (`lifebook.service.ts:2988`) devuelve `read`, `followedBack`, `posts`, `verified`; `inboxCounts` (`:2862`) cuenta los no leídos; `inboxMarkRead` (`:2906`) los marca. Pantalla: `app/lifebook-inbox-followers.tsx`, pestaña en `app/lifebook-inbox.tsx:27` | — (ya está) |
| 9 | **Sugerencias de a quién seguir** | Suggested for you | **你可能认识的人** | grafo + contactos + intereses | **A medias.** El endpoint existe (`lifebook.controller.ts:1088` → `lifebook.service.ts:3014`) y se usa en 5 sitios, pero **el motivo nunca es social** | **Medio** si se quiere motivo social; **cero** para reutilizar lo que hay |

### Los dos mecanismos que ellas tienen y nosotros no tenemos ni de lejos

| Mecanismo | Instagram | Xiaohongshu | Datos | ¿Lo tenemos? | Esfuerzo |
|---|---|---|---|---|---|
| Notas / estados cortos de gente que sigues | **Notes** (2022) | 笔记 cortas | contenido efímero + grafo | **NO** en Life Book (el estado 24 h es de `mobility`, otra tabla y otro servicio) | **Alto** |
| Freno de fatiga / no repetir avisos | marco de ranking de notificaciones (2025) | *(no verificado)* | contadores por tipo y ventana | **Parcial**: `read_at` por fila en `likes`/`follows`/`comments`, pero **no hay límite por ventana ni agrupación** | **Medio** |

---

## 2. Instagram: los hechos, con fuentes

Aquí hay una trampa de nomenclatura que conviene deshacer antes de nada, porque
**son dos cosas distintas con el mismo nombre** y una de las dos murió.

### 2.1 La pestaña de ACTIVIDAD «Following» se retiró en 2019

La pestaña del corazón («Following») enseñaba **lo que hacían las personas que
seguías**: a quién habían empezado a seguir, qué habían likeado, qué habían
comentado. Instagram la **eliminó en octubre de 2019**, con el argumento de que la
usaba poca gente y de que servía para espiar.

- *Instagram's Following tab is going away this week* — **The Verge**:
  <https://www.theverge.com/2019/10/7/20903080/instagram-following-activity-tab-disappearing>
- *Instagram is removing the Following tab to cut down on creepers* — **CNET**:
  <https://www.cnet.com/tech/mobile/instagram-is-removing-the-following-tab-to-cut-down-on-creepers/>
- *Instagram ditches Following tab* — **Digital Trends**:
  <https://www.digitaltrends.com/social-media/instagram-following-tab-removed/>

→ **Es la lección más importante de todo el informe.** No porque la señal social no
funcione, sino porque **un escaparate dedicado a la actividad de los demás se
percibe como vigilancia y se cae**. Instagram conserva esa información, pero
**dentro de la bandeja personal** (quién te ha likeado *a ti*, quién te ha seguido
*a ti*) y **dentro del contenido** (el «liked by»), no en un muro público de la vida
ajena. Nosotros ya estamos en ese lado correcto: nuestro `lifebook-inbox-*` es
personal, no un muro de actividad ajena.

### 2.2 La pestaña «Following» del FEED sí existe (2022)

Lo que sí volvió, en marzo de 2022, fue el **feed cronológico**, con dos modos:
**Following** (solo cuentas que sigues) y **Favorites**. Los anunció Adam Mosseri y
**no pueden ser el modo por defecto** de la app.

- **TechCrunch**: <https://techcrunch.com/2022/03/23/instagram-launches-chronological-and-favorites-feeds-for-all-users-but-they-cant-be-the-default/>
- **The Verge**: <https://www.theverge.com/2022/3/23/22991852/instagram-favorites-following-chronological-feed-return>
- **MacRumors**: <https://www.macrumors.com/2022/03/23/instagram-chronological-feed-option/>

→ Es **exactamente** el canal `following` que ya tenemos. Misma idea, misma
semántica: «de solo gente que sigo, en orden de fecha».

### 2.3 «Liked by X and others» — el social proof dentro del post

Instagram pone bajo cada publicación «Le gusta a **X** y a N personas más». **Qué
nombres elige y en qué orden NO está documentado por Instagram**: las fuentes que lo
explican son de terceros y coinciden en que el orden depende de la **relación con
quien mira** (amigos, gente que sigues) y de la interacción previa, pero es
inferencia, no documentación.

- **socialbuddy** (tercero): <https://socialbuddy.com/order-of-instagram-followers-and-likes-explained/>
- **Vergizmo** (tercero): <https://vergizmo.com/instagram-likes-order/>

→ Lo importante para nosotros es el **patrón**, no el algoritmo: se enseñan **pocos
nombres, elegidos por relación con el visor**, y el resto se resume en un número.

### 2.4 «Te sigue» / «Follows you»

Etiqueta en el perfil que dice si esa persona **te sigue a ti**. Instagram la probó
en 2017 y se desplegó; hoy sigue existiendo en la cabecera del perfil.

- **Mashable**: <https://mashable.com/article/instagram-follows-you-feature>
- **Daily Mail** (del test de 2017): <https://www.dailymail.co.uk/sciencetech/article-4911246/Instagram-tests-new-follows-labels.html>

→ Nosotros **ya calculamos ese dato** (`relation.isFollower`) y **no lo pintamos**.
Es la mejora más barata de todas (§5, propuesta 1).

### 2.5 «Seguido por X» — amigos en común en perfiles y sugerencias

En las sugerencias de cuentas, Instagram justifica el «por qué te lo enseño» con
**amigos en común**: «Followed by a, b y 3 más». Es el mismo mecanismo que el
«conocido en común» de Facebook.

- **The Tab** (explica cómo funciona «Suggested Profiles»): <https://thetab.com/2026/08/18/explaining-how-instagrams-suggested-profiles-works-and-if-its-really-your-secret-stalkers>
- **getlurk** (por qué apareces en sugerencias): <https://getlurk.app/blog/instagram-suggestion-for-you-why-someone-appears>
- **MCNG Marketing** (qué significa «mutual»): <https://mcngmarketing.com/resources/mutual-meaning-instagram>

→ **Esto es lo que a nosotros nos falta de verdad** y es lo que convierte una
sugerencia fría («Conductor verificado») en una sugerencia con confianza («le sigue
BERNARDO, a quien tú sigues»). Hoy nuestro `suggestedUsers` **no toca el grafo**.

### 2.6 Notas (Notes): gente que sigues, en la parte de arriba de la bandeja

Instagram lanzó **Notes** en diciembre de 2022: un texto corto (hasta 60 caracteres)
que aparece **en la parte de arriba de la bandeja de entrada**, y que ves **de la
gente que sigues** (o solo de tus «close friends»).

- **CNET**: <https://www.cnet.com/news/social-media/instagram-adds-notes-tests-candid-stories-and-group-profiles/>
- **Gadgets360**: <https://www.gadgets360.com/apps/news/instagram-update-new-features-group-profiles-collections-candid-stories-3606382>
- **Charlotte Observer** (explicado por un ingeniero de Instagram, citando el blog oficial): <https://www.charlotteobserver.com/news/business/article263419603.html>

→ Es un patrón distinto de los demás: **la gente que sigues ocupa un carril propio
arriba del contenido**, sin mezclarse con él. Caro para nosotros.

### 2.7 Freno de spam y fatiga de avisos: el marco de 2025

En **septiembre de 2025** Meta publicó un **nuevo marco de ranking de notificaciones
en Instagram**, explícitamente para **reducir los avisos repetitivos**. Es un modelo
«consciente de la diversidad» que reparte la cuota de notificaciones entre tipos y
fuentes en vez de mandar la que más puntúa en cada momento.

- Espejo del blog de ingeniería de Meta, *A New Ranking Framework for Better Notification Quality on Instagram*: <https://www.engineering.fyi/article/a-new-ranking-framework-for-better-notification-quality-on-instagram>
- **InfoQ**: <https://www.infoq.com/news/2025/09/instagram-notification-ranking/>
- **Social Media Today**: <https://www.socialmediatoday.com/news/instagram-updates-notification-ranking-avoid-fatigue/759187/>
- **ppc.land**: <https://ppc.land/instagram-deploys-diversity-aware-notification-framework-to-boost-engagement/>
- **36kr** (en chino): <https://m.36kr.com/p/3510177219337348>

→ Aplicado a nosotros: si algún día generamos avisos por relación social,
**el límite no es opcional**. Y ya tenemos la mitad del trabajo hecho: `read_at`
existe en `likes`, `bookmarks`, `comments` y `follows`, y `inboxCounts` ya agrupa
por tipo (`likes`/`saves`/`followers`/`comments`/`mentions`). Lo que **no** hay es
ningún tope por ventana temporal.

---

## 3. Xiaohongshu (小红书): lo que se ha podido y lo que no

**Aviso de honestidad, y es importante: de Xiaohongshu NO he encontrado
documentación oficial.** No hay centro de ayuda indexado, ni blog de ingeniería
público, ni nota de producto. Todo lo que sigue viene de **prensa tecnológica china
y blogs de producto/marketing** (36kr, 人人都是产品经理, 优设, 知乎, 稿定, 运营派),
que son fuentes secundarias y a veces se copian entre sí. Lo que no he podido
confirmar va a §6 y **no lo uso como base de ninguna decisión**.

### 3.1 Las pestañas 关注 (siguiendo) y 发现 (descubrir)

El feed tiene tres carriles: **关注** (siguiendo), **发现** (descubrir) y **附近**
(cerca). El patrón es el mismo de Instagram: 关注 es de cuentas que sigues, 发现 es
algorítmico.

- **优设 / UISDC**, *关注逻辑重构：从「单一决策」到「关系链引导」的信息布局优化* — análisis de producto del rediseño de la zona de 关注 y de cómo la app **usa la cadena de relaciones (关系链) para guiar** la decisión de seguir:
  <https://www.uisdc.com/hunter/0221468526.html>
- **稿定设计**, *小红书的流量机制*: <https://www.gaoding.com/article/1638477796628402176>
- **网易**, comparativa de mecanismos de 小红书 / 视频号 / 抖音: <https://www.163.com/dy/article/IHFR0COH051181GK.html>

→ El titular del artículo de UISDC es literalmente nuestra pregunta: pasar de una
«decisión única» (una lista de seguidos) a **dejar que la cadena de relaciones guíe**
lo que se enseña. Es la misma conclusión que sacamos con Instagram: la relación se
lleva **al contenido**, no a una lista.

### 3.2 你可能认识的人 (personas que quizá conozcas)

Existe, es agresivo, y ha generado rechazo real en China: hay cobertura de prensa
sobre usuarios que consideran **intrusivo** que la app les sugiera al exnovio o a un
excompañero de trabajo.

- **腾讯新闻 / 新闻** — *前男友、旧同事···APP精准推送「可能认识的人」惹争议*:
  <https://view.inews.qq.com/k/20240222A06XMH00>
- **网易** — *社交APP最烦人的功能受关注，网友吐槽：感觉被冒犯*:
  <https://www.163.com/dy/article/IUQ1LAUQ051288MF.html>
- **V2EX** (hilo técnico sobre cómo lo calcula 小红书): <https://global.v2ex.co/t/960798>

→ **Contra-lección directa para Life Book**: el «amigos de amigos» sin control es
percibido como violación de intimidad. En una app de barrio, donde el grafo es
**físicamente** el mismo que el de tus vecinos, esto es más grave, no menos. Si se
hace «seguido por X», conviene (a) no usar la agenda de contactos y (b) dar un
interruptor para no aparecer en sugerencias.

### 3.3 Cómo priorizan el contenido (y el papel del grafo)

Las fuentes de marketing chinas coinciden en un vocabulario de **流量池** (piscina de
tráfico) y **爬坡机制** (mecanismo de subida por rampas): una nota se publica a un
grupo pequeño, y si rinde (interacción) sube a un grupo mayor. El 关注 es una de las
señales de arranque.

- **运营派**, *小红书公布最新推荐算法，采用爬坡机制升级流量池*: <https://www.yunyingpai.com/content/1060596.html>
- **知乎**, *2026 小红书流量算法和推荐机制分析*: <https://zhuanlan.zhihu.com/p/2065500863221724709>

→ **No lo tomo como base de diseño**: son blogs de marketing, no documentación, y
describen el sistema desde fuera. Lo cito solo porque *coincide* con lo de Instagram
(el grafo social es una señal de arranque, no el motor principal) y porque es
exactamente lo que ya hacemos con `suggestedUsers` (ordenar por actividad reciente).

### 3.4 La forma de los datos de un comentario en Xiaohongshu

No hay documentación oficial, pero **sí hay descripciones de la API reversa** que
enseñan **qué campos existen en un comentario de 小红书** — y eso es útil
precisamente porque delata qué guarda la plataforma.

- **阿里云开发者社区**, *小红书笔记评论API简明文档（含 JSON 样例）*: <https://developer.aliyun.com/article/1740796>
- **技术站**, *Python解析小红书（XHS）笔记评论 API，json数据返回参考*: <https://jishuzhan.net/article/2042765520408215553>
- **apifox** (doc de 小红书笔记评论): <https://s.apifox.cn/apidoc/docs-site/4012774/ru/311905107e0>

→ Marca como **fuente NO oficial** (ingeniería inversa). Lo que sí me atrevo a decir:
los objetos de comentario de estas plataformas llevan **identidad del autor y etiquetas
de presentación (`show_tags`)**, que es justo el campo donde vive el «作者». Nuestra
tabla `lifebook.comments` **no tiene nada parecido**: ni una columna de etiqueta, ni
un cálculo de relación. Ver §4.3.

---

## 4. NUESTRO código: lo comprobado, uno por uno

### 4.1 `lifebook.follows` — qué permite ya

| Columna | Tipo | Nulo | Por defecto |
|---|---|---|---|
| `followee_id` | uuid | NO | — |
| `follower_id` | uuid | NO | — |
| `created_at` | timestamptz | NO | `now()` |
| **`read_at`** | timestamptz | **SÍ** | — |

**Sí tiene `read_at`**, o sea que el aviso de «nuevo seguidor» ya está resuelto y se
puede marcar como leído.

- Índices: `follows_pkey` UNIQUE `(followee_id, follower_id)` y
  `ix_lb_follows_follower` `(follower_id, created_at DESC)`.
  **El índice que hace falta para «a quién sigo yo» ya está** — consultar los
  seguidores de un visor es una búsqueda indexada, no un escaneo.
- **Filas: 4.** Usuarios distintos: 3 como `follower`, 3 como `followee`, sobre
  **11 usuarios** en `mobility.users`.
- De las 4, **todas tienen `read_at` puesto** → hoy `inbox-counts.followers` da **0**.

Fuente: `information_schema.columns` y `pg_indexes` de `lifebook` en
`mirror-postgres` (consulta directa, §7).

### 4.2 La pestaña «Siguiendo» — SÍ existe y SÍ filtra

- Canales válidos: `src/lifebook/lifebook.service.ts:92` →
  `['for_you','following','nearby','today','debates','food','taxi','work','rental','sales','culture','music','sports']`.
  Canal desconocido → **400 `CHANNEL_INVALID`** (`:860-862`, probado en vivo).
- El filtro, `src/lifebook/lifebook.service.ts:868-873`:

  ```ts
  if (channel === 'following') {
    args.push(viewerId);
    base.push(`EXISTS(SELECT 1 FROM lifebook.follows f
      WHERE f.followee_id=p.author_id AND f.follower_id=$N::uuid)`);
    base.push(`p.visibility IN ('public','followers')`);   // mi contenido 'followers' entra: ya les sigo
    return this.feedPage(...);
  }
  ```

  Está bien hecho: respeta el bloqueo mutuo y las marcas del visor porque pasa por
  `feedPage` (`:820`), y **no excluye** `visibility='followers'` con el razonamiento
  correcto (si ya le sigo, tengo derecho a verlo).
- Ruta: `src/lifebook/lifebook.controller.ts:592` (`@Get('posts/feed')`, deriva a
  `feedChannel` cuando llega `channel`).
- App: `constants/lifebook.ts:22` (`{ id: 'following', label: 'Siguiendo' }`),
  el feed la llama en `app/lifebook.tsx:373` (`lifebookApi.feed(channelId, …)`), se
  pinta en la barra de canales (`:660-692`) y **se desliza** entre canales (`:451-457`).
  Contrato del cliente: `api/lifebook.ts:370`.

**Conclusión: la pestaña existe, está conectada y filtra de verdad.** No hay nada que
arreglar aquí. Lo verifiqué contra la API real (§7.2).

### 4.3 Los comentarios NO traen ninguna marca de relación

`serializeComment` (`src/lifebook/lifebook.service.ts:3418`) devuelve exactamente:

```
id, postId, parentId, body, createdAt, editedAt, likes, likedByMe,
repliesCount, author{id, fullName, avatarUrl, role}, ref, replyToName?
```

**No hay `following`, no hay `teSigue`, no hay `esAutor`.** Ni en `comments`
(`:3455`), ni en `commentsPage` (`:3513`), ni en `commentReplies` (`:3224`): las tres
consultan `lifebook.comments JOIN mobility.users` y **ninguna consulta a
`lifebook.follows`**.

Ojo con un malentendido fácil: el campo `author.role` que sí llega **NO es «autor de
la publicación»**, es el rol de plataforma (`PASSENGER`, `DRIVER`, `ADMIN`…).
Comprobado en vivo: en un comentario real llega `"role":"PASSENGER"`.

Y en la app, `CommentRow` (`components/lifebook/CommentsSheet.tsx:86-97`) **no recibe
`postAuthorId` ni ninguna relación**: la hoja se abre con
`{visible, onClose, postId, tint, allowComments, meId, title, placeholder, …}`
(`:40-71`), y no hay forma de saber quién es el autor de la publicación desde dentro.
El único chip que existe es el **«TÚ»** propio (`:128-132`), que se decide comparando
`c.author?.id === meId`. → **El sitio donde iría el chip «AUTOR» ya está construido.**

### 4.4 El detalle NO trae quién ha dado me gusta

`getPost` (`src/lifebook/lifebook.service.ts:685`) devuelve `stats` con **contadores**
(`likes`, `comments`, `bookmarks`, `likedByMe`, `bookmarkedByMe`) y, del autor,
`followedByMe` (`:729`). Verificado en vivo, las claves del detalle son:

```
allowComments, author, barrio, body, channel, city, createdAt, id, media, payload,
savedByMe, savedCount, serviceLink, stats, tags, title, tone, topics, type, visibility
```

**No hay `likedBy` ni nada equivalente**, y probé tres rutas plausibles contra la API
real: `GET /posts/:id/likes`, `/reactions`, `/liked-by` → **404 las tres**.

**¿La tabla `lifebook.likes` tiene lo necesario para «a 3 personas que sigues les
gusta»?** **Sí, de sobra**: `post_id | user_id | reaction | created_at | read_at`,
82 filas, con `likes_pkey` UNIQUE `(post_id,user_id)` e `ix_lb_likes_user`
`(user_id, created_at DESC)`. Y no es teoría, la consulta ya devuelve resultados:

```sql
SELECT count(DISTINCT (l.post_id, l.user_id))
  FROM lifebook.likes l
  JOIN lifebook.follows f
    ON f.followee_id = l.user_id AND f.follower_id <> l.user_id;
```

| Medida | Valor |
|---|---|
| Pares (me gusta × seguidor) | **86** |
| **Me gusta distintos** que alguien a quien sigo ha dado | **82** |
| Publicaciones distintas afectadas | **77** |
| Filas totales en `lifebook.likes` | **82** |

→ **«A N personas que sigues les gusta» ya tiene datos reales que enseñar hoy.** Pero
fíjate en la última fila: 82 de 82 significa que, **con este grafo de prueba, el 100 %
de los me gusta cumple la condición**. Es un artefacto del grafo diminuto (3 personas
seguidas que son también las que más publican y likean), **no** una propiedad del
diseño. Con usuarios reales la línea aparecerá en una minoría de publicaciones, y la
app tiene que **no pintar nada** cuando no haya coincidencias (por eso el punto 3 de
la verificación de la propuesta 2).

**Y hay un precedente en casa.** El estado 24 h **ya tiene** exactamente este
endpoint: `GET /mobility/status/:id/reactions` (`src/mobility/status.controller.ts:257`
→ `status-social.service.ts:171`, método `reacciones()`), que devuelve

```json
{ "total": 3, "items": [ { "at": "…", "reaction": "like", "mine": false,
  "user": { "id": "…", "fullName": "…", "avatarUrl": "…", "city": "…" } } ] }
```

El Life Book no lo tiene, pero **la forma ya está escrita y probada en este repo**.

### 4.5 Sugerencias de a quién seguir: existen, pero sin grafo

- Endpoint: `GET /lifebook/me/suggested-users` (`src/lifebook/lifebook.controller.ts:1088`
  → `lifebook.service.ts:3014`). Tipo del cliente: `LbSuggestedUser` (`api/lifebook.ts:1001`).
- **Qué usa**: usuarios no suspendidos, que no sigo y no tengo bloqueados, **con al
  menos una publicación pública**, ordenados por **publicaciones recientes (60 días)**
  y fecha de alta. El `reason` es el rol verificado o la ciudad:
  `Tienda verificada` · `Restaurante verificado` · `Conductor verificado` ·
  `Publica en ${ciudad}` · `Miembro de la comunidad`.
  **Cero uso de `lifebook.follows`.** Comprobado en vivo: la única sugerencia que
  devuelve hoy es `"BERNARDO LOPERTE [Conductor verificado]"`.
- **Dónde se usa ya** (5 sitios): `app/lifebook-inbox-followers.tsx:35` (con la
  bandeja de nuevos seguidores), `app/lifebook-group-create.tsx:128`,
  `components/lifebook/CreateGroupSheet.tsx:72`,
  `components/lifebook/GroupManageSheet.tsx:231` y
  `components/lifebook/messaging-sheets.tsx:90` (al elegir persona para un chat).

→ Reutilizar el endpoint para meter un motivo social es **barato**: es cambiar el
`ORDER BY` y añadir un `reason` calculado, sin tocar el cliente ni las 5 pantallas.

### 4.6 Avisos de nuevos seguidores: sí, y ya funcionan

- `newFollowers` (`src/lifebook/lifebook.service.ts:2988`) → `GET /lifebook/me/new-followers`
  (`lifebook.controller.ts:1082`). Devuelve `{at, read, id, fullName, avatarUrl, city,
  followedBack, posts, verified}`.
- `inboxCounts` (`:2862`) cuenta `follows` con `read_at IS NULL` → `followers`.
- `inboxMarkRead` (`:2906`) → `UPDATE lifebook.follows SET read_at = now()`.
- App: `app/lifebook-inbox-followers.tsx` (pantalla completa con «Te han seguido» +
  «Recomendados para ti») y la pestaña «Seguidores» en `app/lifebook-inbox.tsx:27`.
- **Verificado en vivo**: `/lifebook/me/inbox-counts` →
  `{"likes":3,"saves":1,"followers":0,"comments":17,"mentions":2}` y
  `/lifebook/me/new-followers` → `Administrador EG Route Plan read=true seguidoDeVuelta=true`.

### 4.7 El dato que ya llega y se tira: `isFollower`

- El servidor lo calcula: `lifebook.service.ts:1120`
  (`EXISTS(… followee_id = visor AND follower_id = objetivo) AS is_follower`).
- El cliente lo declara dos veces: `api/lifebook.ts:315` (`LbProfile.relation`) y
  `api/lifebook.ts:630` (`LbStorePage.store.relation`).
- **No se usa en ninguna pantalla.** Grep de `isFollower` en todo `D:\egapp\*.ts*`:
  **2 coincidencias, las dos la declaración del tipo.**
- `app/lifebook-user.tsx:382-391` pinta el botón «Siguiendo / Seguir» y **nada más**;
  el avatar se decide en `:365` con `rel.isSelf` y no hay ninguna marca de «te sigue».

→ Esto es lo que Instagram llama **«Follows you»** y lo tenemos calculado, enviado y
**sin pintar**. Es la mejora más barata del informe.

---

## 5. LO QUE PROPONGO PARA LIFE BOOK

Tres cosas, **en este orden**. El criterio es «lo más barato que más se note», y por
eso la primera **no depende del grafo** (que hoy tiene 4 filas): si lo primero que
construimos necesita masa crítica, no se ve nada y parece que no funciona.

### Propuesta 1 · El chip «AUTOR» en los comentarios (y «Te sigue» en el perfil)

**Qué se ve en pantalla.** En la hoja de comentarios, junto al nombre de quien
comenta, un chip **`AUTOR`** cuando ese comentario lo escribió quien publicó la nota
— exactamente al lado del chip `TÚ` que ya existe. Es el `作者` de Xiaohongshu y el
`Author` de Instagram: resuelve «¿me está contestando el dueño de la nota?», que hoy
es la duda más común al leer un hilo.

**Qué hay que tocar.**

| Capa | Fichero | Cambio |
|---|---|---|
| Servidor | `src/lifebook/lifebook.service.ts` | en `comments` (`:3455`), `commentsPage` (`:3513`) y `commentReplies` (`:3224`), añadir a la consulta `EXISTS(SELECT 1 FROM lifebook.posts p WHERE p.id = c.post_id AND p.author_id = c.author_id) AS is_post_author` |
| Servidor | `lifebook.service.ts:3418` `serializeComment` | devolver `isPostAuthor: !!r.is_post_author` (aditivo: el cliente viejo lo ignora) |
| App API | `api/lifebook.ts:117` `LbComment` | `isPostAuthor?: boolean` |
| App UI | `components/lifebook/CommentsSheet.tsx:128-132` | un chip `AUTOR` en el mismo `flexDirection:'row'` del chip `TÚ`, con `alpha(colors.danger, 0.12)` |

**Cero plomería de props.** El chip se decide con datos que ya vienen en la respuesta,
así que **no hay que pasar `postAuthorId`** ni tocar los dos sitios que abren la hoja
(`app/lifebook-post/[id].tsx:914` y `app/lifebook-videos.tsx:551`). El vídeo y la nota
lo ganan a la vez, que es justo la ventaja que documenta
`docs/COMENTARIOS-CON-PUBLICACION-INVESTIGACION.md` §2.

**De regalo, casi gratis:** el mismo día, pintar **«Te sigue»** en
`app/lifebook-user.tsx` con el `rel.isFollower` que **ya llega y se tira** (§4.7).
Es literalmente un `<Text>` condicional junto al nombre.

**Cómo se verificaría.** Guion `.cjs` contra la API real, con el patrón de
`pruebas/lb51q-verificar-estado-social.cjs` (login con cuentas de prueba):
1. El autor de la publicación comenta en su propia nota → el comentario trae
   `isPostAuthor: true`.
2. Un tercero comenta en esa misma nota → `isPostAuthor: false`.
3. En una **respuesta** del autor, también `true` (los tres sitios de lectura).
4. `GET /users/:otroId/profile` con alguien que me sigue → `relation.isFollower: true`,
   y con alguien que no → `false`.
5. En el móvil: abrir el detalle de una nota con comentarios del autor y comprobar
   en el volcado de la interfaz (`uiautomator dump` por `adb`, como en
   `docs/COMENTARIOS-CON-PUBLICACION-INVESTIGACION.md` §«Verificación en el móvil»)
   que aparece el chip `AUTOR`.

### Propuesta 2 · «A N personas que sigues les gusta» en el detalle

**Qué se ve en pantalla.** Debajo del botón de me gusta del detalle, una línea: los
avatares de **hasta 3** personas a las que sigo a las que les gusta esa publicación,
y el texto «**A 3 personas que sigues les gusta**». Si no hay ninguna, **la línea no
aparece** (nunca un «a 0 personas»). Con datos de hoy esto ya tiene qué enseñar: hay
**86 me gusta** cruzados con el grafo (82 distintos, en 77 publicaciones: §4.4).

**Qué hay que tocar.**

| Capa | Fichero | Cambio |
|---|---|---|
| Servidor | `src/lifebook/lifebook.service.ts` | en `getPost` (`:685`), añadir al bloque de `stats` una consulta a `lifebook.likes l JOIN lifebook.follows f ON f.followee_id = l.user_id AND f.follower_id = $visor` limitada a 3 + un `count(*)` |
| Servidor | `lifebook.service.ts:685` `getPost` | asignar el campo **después** de `serialize`, como ya se hace con `author.followedByMe` en este mismo método (`:739-740`). **No tocar `serialize` (`:5061`)**: es compartido por el feed y el perfil, que no necesitan esta consulta |
| App API | `api/lifebook.ts:107` `LbPostDetail` | `likedByFollowed?: { total: number; users: LbAuthor[] }` |
| App UI | `app/lifebook-post/[id].tsx` (junto al `DetailActionButton` de «Me gusta», `:871-885`) | la línea de avatares + texto |

**Coste de rendimiento:** el `JOIN` usa `ix_lb_follows_follower` (que ya existe) y va
**acotado a 3 filas + un count**, no trae la lista entera. Es una consulta por apertura
de detalle, no por tarjeta del feed.

**Cómo se verificaría.**
1. SQL de control: contar los me gusta cruzados con el grafo **antes** y **después**,
   por publicación, y comprobar que el número que da la API coincide.
2. Que **nunca** aparece el propio visor en la lista (el `l.follower_id <> l.user_id`
   del join, y excluir `l.user_id = visor`).
3. Que con 0 coincidencias el campo llega vacío/`null` y la app **no pinta la línea**.
4. Que **no** se filtran datos de quien tiene el perfil privado ni de un bloqueado:
   reutilizar la comprobación de bloqueo mutuo que ya hace `getPost` (`:700-706`).
5. En el móvil, abrir una publicación con likes de seguidos y leer la línea en el
   volcado de la interfaz.

### Propuesta 3 · Motivo social en las sugerencias («Seguido por X»)

**Qué se ve en pantalla.** En «Recomendados para ti»
(`app/lifebook-inbox-followers.tsx:143`, donde hoy se lee «Conductor verificado»),
cuando haya relación, **cambiar el motivo** por «**Le sigue BERNARDO LOPERTE**» —
el `Followed by X` de Instagram y el 关注的人关注了 de Xiaohongshu. El motivo actual
se queda como respaldo cuando no hay relación: **no se pierde nada**.

**Qué hay que tocar.** Solo el servidor, y en un sitio: `suggestedUsers`
(`lifebook.service.ts:3014`).

1. Añadir un `LEFT JOIN LATERAL` que, para cada candidato, busque **cuántas personas
   que yo sigo le siguen** y **el nombre de una**:
   ```sql
   LEFT JOIN LATERAL (
     SELECT count(*)::int AS n, min(u2.full_name) AS quien
       FROM lifebook.follows f2 JOIN mobility.users u2 ON u2.id = f2.follower_id
      WHERE f2.followee_id = u.id
        AND f2.follower_id IN (SELECT follower_id FROM lifebook.follows WHERE followee_id = $yo)
   ) mut ON true
   ```
2. Cambiar el `ORDER BY` a **`mut.n DESC, recent_posts DESC`** (grafo primero,
   actividad después) — es lo que hace Instagram.
3. Nuevo `reason` con prioridad: `mut.n > 0` →
   `Le sigue ${quien}` (+ `y ${n-1} más` si `n > 1`); si no, **el motivo de hoy**.
   Ni el cliente ni las 5 pantallas que ya lo usan necesitan cambio: `reason` ya es
   texto libre (`api/lifebook.ts:1003`).

**Nota de privacidad, aprendida de §3.2.** En China esta función generó rechazo
justamente por enseñar relaciones no pedidas. Aquí es más delicado, porque el grafo
de Life Book **es** el de tus vecinos. Recomiendo: **no** usar la agenda del teléfono,
**solo** follows dentro de la app, y no enseñar más de un nombre por sugerencia.

**Cómo se verificaría.**
1. Con las cuentas de prueba: montar A→B y A→C, y que **C siga a D** → al pedir
   `/me/suggested-users` como **A**, `D` debe salir con `reason` que empiece por
   «Le sigue B…» y **antes** que candidatos sin relación social.
2. Que un candidato **sin** amigos en común conserve el motivo antiguo
   («Conductor verificado») → no hay regresión.
3. Que **no** se sugiere a quien ya sigo, a mí mismo, ni a un bloqueado (las tres
   condiciones ya existen en `:3025-3030`; comprobar que siguen cumpliéndose con el
   `ORDER BY` nuevo).
4. Que con el grafo actual (4 filas) la pantalla **no se rompe ni sale vacía**: el
   respaldo por actividad debe seguir llenando la lista. Esto es lo que hoy devuelve
   «BERNARDO LOPERTE [Conductor verificado]» y debe seguir devolviéndolo.

### Lo que NO propongo (y por qué)

- **Pestaña de actividad de gente que sigues** (el «Following» de 2019 de Instagram):
  murió por percibirse como vigilancia (§2.1). Nuestro `lifebook-inbox` ya hace lo
  correcto: es **personal** (quién te ha likeado *a ti*), no un muro de la vida ajena.
- **Notas/estados cortos de gente que sigues** (§2.6): caro y exige contenido efímero
  propio. Hay ya un estado 24 h en `mobility`, con su propio servicio
  (`status-social.service.ts`) — integrarlo es un proyecto, no una rebanada.

---

## 6. LO QUE NO HE PODIDO VERIFICAR

Lista explícita. **Nada de esta lista se usa como base de las propuestas de §5.**

1. **Que Instagram limite las menciones sociales a «1 de cada N».** Busqué esto
   expresamente y **no lo he encontrado documentado en ninguna parte**. Lo que sí está
   documentado (§2.7) es el control de **repetición y diversidad en las
   NOTIFICACIONES** (marco de 2025), que es otra cosa. **No verificado.**
2. **Cómo elige Instagram los nombres del «Liked by X and others»**, y si descarta
   algunos a propósito. Solo tengo fuentes de terceros que **infieren** que el orden
   depende de la relación con el visor. **No verificado oficialmente.**
3. **El badge «Author» de Instagram en los comentarios.** No he encontrado
   documentación oficial ni una fuente fiable que lo describa. Lo doy por existente
   por uso de la app, pero **no lo he verificado con fuente**. En cambio el `作者` de
   Xiaohongshu sí es un patrón conocido — y **tampoco lo he podido verificar con
   fuente** (ver punto 5).
4. **Si Instagram marca en el comentario la relación con quien comenta** (por ejemplo
   «te sigue» o «amigo»). **No encontrado, no verificado.**
5. **Casi todo Xiaohongshu (§3) es fuente secundaria.** No hay centro de ayuda oficial
   indexado ni blog de ingeniería público. Concretamente **no he podido verificar con
   fuente**:
   - la etiqueta **`关注的人也在看` / `关注的人也在赞`** (el equivalente al «liked by
     people you follow»), ni siquiera que exista con ese nombre;
   - el distintivo **`朋友`** (amigo) en los comentarios;
   - el distintivo **`作者`** en los comentarios, más allá de saber que el patrón
     existe en la app;
   - el **`铁粉`** (fan leal) y si sustituye o acompaña al de autor;
   - si en los comentarios aparece **`关注` / `已关注`** junto al nombre;
   - el número y los nombres exactos de las pestañas de **消息** (aviso de nuevos
     seguidores);
   - cualquier **límite anti-spam** concreto.
6. **La API reversa de Xiaohongshu** (los documentos de §3.4) es **ingeniería inversa
   de terceros**, no documentación oficial. La uso solo como pista de qué campos
   existen, no como hecho.
7. **No he ejecutado ninguna prueba de escritura** (seguir, dejar de seguir, comentar).
   Todo lo comprobado contra la API en vivo han sido **GET de solo lectura**; los
   datos de `follows` y `likes` son los que ya había. **No he modificado nada** en el
   servidor ni en el backend, como se pidió.
8. **No he medido el rendimiento real** de las consultas propuestas en §5 con volumen:
   hoy `lifebook.follows` tiene 4 filas y `likes` 82, así que cualquier plan de
   ejecución medido aquí **no dice nada** sobre el comportamiento con miles de filas.
   Los índices que hacen falta existen (`ix_lb_follows_follower`, `ix_lb_likes_user`,
   `likes_pkey`), pero eso es una comprobación de esquema, **no** una medición.
9. **No sé qué cambió en `lifebook.service.ts` ni quién lo cambió.** El fichero pasó
   de 5 000 a 5 146 líneas a mitad de la investigación (**no fui yo**: solo he hecho
   lecturas). Repetí todas las llamadas a la API después del cambio y **dieron
   exactamente lo mismo**, así que las conclusiones se sostienen; pero **no he podido
   verificar si la versión nueva está realmente desplegada** en el proceso que atiende
   la API, ni si el cambio afecta a algo de lo aquí tratado. Las líneas del §7.3 están
   ancladas al `md5` del fichero en disco, no a lo desplegado.

---

## 7. Anexo: cómo se ha comprobado (para poder repetirlo)

### 7.1 Base de datos (solo lectura)

`docker exec mirror-postgres psql -U postgres -d egrouteplan` sobre el esquema
`lifebook`. Consultas hechas: `information_schema.columns` de `follows`, `likes` y
`comments`; `pg_indexes` de las tres; `count(*)` de las tres; y el `count(*)` cruzado
`likes × follows` (→ 86 pares / 82 me gusta distintos en 77 publicaciones).

### 7.2 API en vivo (solo GET)

Login `POST /wallet/api/v1/mobility/auth/login` con la cuenta de prueba, y luego:

| Llamada | Resultado |
|---|---|
| `GET /lifebook/posts/feed?channel=following&limit=5` | **HTTP 200, 4 posts, `nextCursor: null`**, todos con `author.followedByMe: true` |
| `GET /lifebook/posts/feed?channel=for_you&limit=5` | HTTP 200, 5 posts, **mezcla** autores seguidos y no seguidos |
| `GET /lifebook/posts/feed?channel=nearby&limit=5` | HTTP 200, 5 posts |
| `GET /lifebook/posts/feed?channel=inventado` | **400 `CHANNEL_INVALID`** — «Canal no válido» |
| `GET /lifebook/posts/:id` (detalle) | 20 claves, **sin lista de quién dio me gusta** |
| `GET /lifebook/posts/:id/comments?limit=5` | claves `author, body, createdAt, editedAt, id, likedByMe, likes, parentId, postId, ref, repliesCount` → **sin marca de relación**; `author.role = "PASSENGER"` |
| `GET /lifebook/posts/:id/likes` · `/reactions` · `/liked-by` | **404 las tres** |
| `GET /lifebook/users/:id/profile` | `relation: {isSelf, isFollowing, isFollower}` presente |
| `GET /lifebook/me/suggested-users?limit=5` | `BERNARDO LOPERTE [Conductor verificado]` → **motivo no social** |
| `GET /lifebook/me/new-followers` | `Administrador EG Route Plan read=true seguidoDeVuelta=true` |
| `GET /lifebook/me/inbox-counts` | `{"likes":3,"saves":1,"followers":0,"comments":17,"mentions":2}` |

**Comprobación cruzada que cierra la pregunta (b):** el SQL dice que la cuenta de
prueba sigue a un autor con **exactamente 4 publicaciones públicas activas**, y la API
con `channel=following` devuelve **exactamente 4**. El filtro hace lo que dice.

**Todas estas llamadas se repitieron al final**, después de detectar que
`lifebook.service.ts` había cambiado en el servidor durante la investigación, y
**dieron lo mismo**: `following` sigue devolviendo 4 publicaciones con los 4 autores
seguidos, el detalle sigue **sin** lista de me gusta, el comentario sigue **sin**
marca de relación y las tres rutas de «quién ha reaccionado» siguen dando **404**.
En esa segunda pasada, además, el perfil de prueba salió con
`relation: {isSelf:false, isFollowing:true, isFollower:true}` — o sea, un caso real
de seguimiento mutuo en el que **`isFollower` llega como `true` y la app no lo pinta**.

### 7.3 Backend: rutas y líneas citadas

> **Aviso sobre las líneas.** `src/lifebook/lifebook.service.ts` **cambió en el
> servidor durante esta investigación**: pasó de 5 000 a 5 146 líneas entre la
> primera lectura y la última, así que **todas las líneas de este documento están
> re-ancladas a la revisión final**, que es la que fija el `md5`
> `32fe0d1ce4d0f48b2ecc41c092763925` (5 146 líneas). El controlador no cambió
> (`md5 a1a3453a85277b4695679ce0085adaba`). Si el fichero vuelve a moverse, **busca
> por nombre de método, no por número de línea**: la tabla de abajo da los dos.

| Fichero | Líneas |
|---|---|
| `src/lifebook/lifebook.service.ts` (md5 `32fe0d1c…`, 5 146 líneas) | `:92` canales · `:820` `feedPage` · `:858-874` `feedChannel` (filtro `following` en `:868-873`) · `:685` `getPost` (`followedByMe` en `:729`, bloqueo en `:700-706`) · `:1120` `is_follower` · `:2862` `inboxCounts` · `:2906` `markRead` · `:2941` `likesReceived` · `:2988` `newFollowers` · `:3014` `suggestedUsers` · `:3418` `serializeComment` · `:3455`/`:3513`/`:3224` lectura de comentarios · `:3606` `follow` · `:5061` `serialize` |
| `src/lifebook/lifebook.controller.ts` (md5 `a1a3453a…`) | `:592` feed · `:639` perfil · `:756` follow · `:1070` likes-received · `:1082` new-followers · `:1088` suggested-users |
| `src/mobility/status.controller.ts` · `status-social.service.ts` | `:257` · `:165-190` — el «quién ha reaccionado» que sirve de plantilla |

**Ninguna de estas líneas se ha tocado.** Lo único que hice en el servidor fueron
lecturas (`grep`, `sed`, `psql` de solo lectura) y llamadas `GET` a la API.
