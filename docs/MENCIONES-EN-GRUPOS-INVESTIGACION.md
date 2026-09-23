# Menciones (@) en grupos: cómo lo hace WeChat y qué tenemos nosotros

**Fecha:** 2026-09-14
**Petición del dueño:** «en los grupos no está implementado el ajuste de mención como en WeChat con @. Investiga cómo lo hace».
**Alcance:** (1) cómo funciona el @ en los grupos de WeChat, con fuentes; (2) qué hay hoy en nuestra app, con `ruta:línea` y números reales; (3) plan de implementación.
**Regla de honestidad:** todo dato lleva su clasificación de fuente (`oficial` / `prensa` / `blog` / `no verificado`). Lo que no pude comprobar está en la última sección, no rellenado.

---

## PARTE 1 — CÓMO LO HACE WECHAT

### 1.1 Resumen ejecutivo (lo que hay que copiar)

| Pieza | WeChat | Fuente |
|---|---|---|
| Elegir a quién mencionas | Al teclear `@` aparece una ventana **«选择提醒的人»** (elegir a quién avisar) con la **lista de miembros del grupo**; también se puede mantener pulsado el avatar de alguien en el chat | prensa (电脑报/澎湃, 2021) + blog (爱范儿, 2018) |
| `@所有人` | Existe como opción **dentro de esa misma lista**, en la cabecera. **Solo el dueño del grupo o un administrador** puede usarlo; un miembro normal solo puede menciones individuales | prensa (电脑报, 2021) |
| Antes de 2021 | `@所有人` no existía como tal: se conseguía **publicando un «群公告» (anuncio de grupo)**, y solo el dueño podía | blog (爱范儿, 2018) |
| Qué ve el mencionado | Un aviso literal **«有人@我»** («alguien me mencionó») con **realce rojo**, tanto en la notificación como en la lista de chats | prensa (电脑报, 2021) + blog (爱范儿, 2018) |
| **Grupo silenciado (消息免打扰)** | **El @ SÍ avisa igual.** Esto es el punto clave → ver 1.3 | prensa (河南商报, 2025-10) |
| Desde 2025-10 (gris) | Se puede desactivar por separado el aviso de **«@我»**, **«@所有人»** y **«群公告»** | prensa (河南商报, 2025-10-23) |
| Desde 2026-08 | Se añade **«重点关注»** (hasta 4 miembros cuyo mensaje sí suena) y **«折叠该群聊»** (plegar el grupo al fondo de la lista) | prensa (ZOL 中关村在线, 2026-08-13) |

**La lección de diseño:** en WeChat el @ es la **única puerta que atraviesa el silencio**. Silenciar un grupo silencia el ruido, no las llamadas por nombre. Y solo en 2025-2026 WeChat dio al usuario el interruptor para cerrar también esa puerta (porque la gente se quejaba de que el «免打扰» era «形式上的免打扰», un silencio de mentira).

---

### 1.2 Cómo se elige a la persona y quién puede @todos

**[prensa — 电脑报, «微信安卓内测更新，这个群聊功能等了8年», 2021-04-17]** — WeChat 8.0.3 (Android, beta; luego iOS por «hot update»):

> «首先，当在群聊里手动输入@符号时，聊天界面会出现一个"选择提醒的人"窗口，可以快速选择群成员，也可以选择@所有人»
> («al teclear manualmente el símbolo @ en el chat, aparece una ventana "elegir a quién avisar", donde se puede elegir rápido a un miembro del grupo, y también elegir @所有人»)

> «不是所有的成员都可以在群里@所有人，只有群主或管理员才能在微信群中@所有人，普通群员与以前一样，只能@单个群友»
> («no todos los miembros pueden @所有人: solo el dueño del grupo o los administradores; el miembro normal, igual que antes, solo puede mencionar a un miembro individual»)

Fuentes: <https://www.163.com/dy/article/G7QOH9OM051288MF.html> (电脑报 vía 网易, prensa especializada) · el mismo texto en <https://m.thepaper.cn/newsDetail_forward_12267556> (澎湃新闻, prensa, 2021-04-18).

**[blog — 爱范儿 (ifanr), 2018-04-04]** — versión anterior a 2021, confirma las dos vías de elección y que el `@todos` se lograba solo con el anuncio:

> «在群聊中长按你想@的群友头像，或是在输入框输入「@」符号进入群成员列表选择你想提醒的人»
> («en el grupo, mantén pulsado el avatar del miembro que quieres mencionar, o escribe «@» en el campo de texto para entrar en la lista de miembros y elegir a quién avisar»)

> «不同于 QQ 群聊中管理员和群主都能@所有人，微信没有「管理员」的概念，在微信中@所有人只有群主可以做到»
> («a diferencia de QQ, donde dueño y administradores pueden @所有人, WeChat no tenía el concepto de "administrador"; en WeChat solo el dueño podía @所有人»)

> «打开「聊天信息」页面，选择「群公告」后进行编辑，当点击「发布」群公告后就会提醒所有人啦»
> («abre la página "información del chat", elige "anuncio del grupo" y edítalo; al pulsar "publicar" el anuncio avisa a todos»)

Fuente: <https://www.ifanr.com/minapp/1001585> (blog de producto/tecnología con reputación).

**[blog/UGC, NO fiable — 太平洋科技网 «IT百科», s.f., firmado por usuario]** — <https://g.pconline.com.cn/x/itbk/3585.html> describe un botón **«@所有人» en la página de ajustes del grupo** (arriba de la lista de miembros) y una versión mínima «8.0.50+». Es contenido generado por usuarios y **no está respaldado por ninguna otra fuente ni por Tencent**; lo cito solo como indicio de que el botón también vive en los ajustes del grupo. **Sus otras afirmaciones (límite diario, versión mínima) NO las doy por buenas** → ver Parte 3.

---

### 1.3 El punto más importante: **grupo silenciado + @ = sigue avisando**

Esta es la mecánica que hay que copiar, y la que WeChat tardó años en matizar.

**Estado histórico (hasta 2025-10): el @ atravesaba el silencio.**

**[blog — 爱范儿, 2018-04-04]:**
> «被提醒的人将会收到 [有人@我] 的消息通知。**就算屏蔽了群聊，这个通知依然会显示**»
> («la persona avisada recibe la notificación de mensaje [有人@我]. **Aunque tengas el grupo bloqueado/silenciado, esta notificación sigue apareciendo**»)

**[prensa — 河南商报, 2025-10-23, «不想被@打扰？快来解锁新功能»]:**
> «虽说微信提供"消息免打扰"功能，但如果群内被人@，还是无法屏蔽此类消息»
> («aunque WeChat ofrece "no molestar", si alguien te @ en el grupo, ese tipo de mensaje no se podía bloquear»)

Fuente: <https://newpaper.dahe.cn/hnsb/html/2025-10/23/content_1852_1762879.htm> (prensa: diario 河南商报).

Ese mismo artículo explica el diseño previo: con el grupo silenciado existía **«关注的群成员»** («miembros a los que presto atención», **máximo 4**), y sus mensajes seguían notificando pese al silencio. Es decir, WeChat ya tenía una lista blanca personal dentro del grupo silenciado.

**Novedad 2025-10 (en pruebas graduales / gris):** ese «关注» se sustituye por **«以下消息仍通知»** («los siguientes mensajes sí notifican») con **tres interruptores independientes**: **«@我»**, **«@所有人»**, **«群公告»**.
> «只要把"@我""@所有人"和"群公告"的开关全部关闭，就不会再收到任何群内的消息通知»
> («si apagas los tres interruptores —@我, @所有人, 群公告— ya no recibirás ninguna notificación de ese grupo»)

Fuente: 河南商报, 2025-10-23 (arriba). Nota: el artículo lo describe como **灰度测试** (prueba gradual), no como función universal en esa fecha.

**Novedad 2026-08 (prensa tecnológica):** la optimización se consolida y se describe el estado anterior con esta frase:
> «过去，即便开启群聊免打扰，系统仍会对上述三类内容进行弹窗、震动或铃声提醒，被广泛称为"形式上的免打扰"»
> («antes, incluso con el grupo en no molestar, el sistema seguía haciendo ventana emergente, vibración o tono para esas tres cosas; se lo llamaba "no molestar de mentira"»)
Y añade: **«重点关注»** (hasta **4 miembros** cuyo mensaje sí avisa) y **«折叠该群聊»**.
Fuente: <https://news.zol.com.cn/1231/12314196.html> (ZOL 中关村在线, prensa tecnológica, 2026-08-13).

**Cómo se ve el aviso al mencionado (resumen):**
1. **Notificación** de sistema con el texto **«有人@我»** (con realce rojo, «飘红强提醒») — prensa 2021 + blog 2018.
2. **En la lista de chats**, la conversación muestra ese aviso textual. Que el literal exacto sea `[有人@我]` con corchetes lo afirman el blog 2018 (escrito `[有人@我]`) y la prensa 2021 (escrito «有人@我»); **la captura de pantalla oficial de cómo se pinta en la lista de chats no la he podido ver** → Parte 3.
3. **Con el grupo silenciado**: el aviso sigue llegando (2018, 2021, 2025) **hasta que** el usuario apaga el interruptor «@我» en el ajuste nuevo (2025-10 / 2026-08).

---

### 1.4 El `@nombre` dentro del mensaje: ¿se pinta distinto y es tocable?

- **Se pinta distinto: sí.** Las fuentes hablan de realce visual del resultado del @ («系统将自动识别并高亮提示», «飘红强提醒» en el aviso). El aviso «有人@我» va «con realce rojo» (prensa 2021).
- **Que sea tocable para abrir el perfil de esa persona: NO VERIFICADO.** No lo he encontrado afirmado en ninguna fuente. Es plausible (toca el patrón de WeChat: tocar un avatar abre la ficha), pero **no lo doy por bueno** → Parte 3.

### 1.5 ¿Se puede mencionar a alguien que no está en el grupo? ¿Y en un chat 1 a 1?

- **Mencionar a alguien de fuera del grupo: NO VERIFICADO.** El selector es la **lista de miembros del grupo** (prensa 2021), lo cual *sugiere* que no, pero no he encontrado ninguna fuente que diga explícitamente qué ocurre si escribes `@Nombre` a mano de alguien que no está.
- **@ en un chat 1 a 1: NO VERIFICADO.** Ninguna de las fuentes consultadas describe el @ en un chat individual; todas hablan de «群聊» (chat de grupo). No he podido confirmar si en WeChat escribir `@` en un 1 a 1 abre lista, no hace nada o se envía como texto plano.

### 1.6 Límite de menciones por mensaje / reglas anti-spam

- **Única afirmación encontrada:** la página UGC de pconline dice «同一微信群每天最多使用3次@所有人（含群公告触发），超出后按钮将临时置灰，次日零点自动恢复» («máximo 3 veces al día @所有人 por grupo, incluidos los disparados por anuncio; luego el botón se pone gris y se recupera a medianoche»). **NO VERIFICADO** y con baja credibilidad: es contenido de usuario, sin respaldo, y las otras fuentes (incluida la prensa de 2025-2026, que es detallada) **no mencionan ningún límite numérico**.
- **Lo que sí es una regla real y verificada es la de permisos:** el `@所有人` está restringido a dueño/administradores (prensa 2021). Ese es el verdadero «anti-spam» documentado: no un contador, sino un permiso.
- No he encontrado límite de menciones **individuales** por mensaje.

---

## PARTE 2 — QUÉ TENEMOS HOY EN NUESTRA APP

### 2.0 Verdad corta

**En los mensajes de grupo NO hay menciones en absoluto** (ni en el servidor ni en la app). Lo único que existe es un sistema de menciones **para los comentarios de publicaciones** (Life Book), que ya tiene tabla, detección, endpoints, bandeja y contador. **No hay selector de miembros al escribir `@` en un grupo.** El `@` que se ve en los comentarios **se escribe a mano** (lo pone la app al responder, como prefijo).

### 2.1 ¿Existe la tabla de menciones y con qué columnas? ¿Cuántas filas hoy?

**Sí existe.** `lifebook.mentions` (comprobado con `\d lifebook.mentions` en `mirror-postgres`, BD `egrouteplan`, 2026-09-14):

| Columna | Tipo | Nulo | Notas |
|---|---|---|---|
| `id` | uuid | NOT NULL | PK, `gen_random_uuid()` |
| `user_id` | uuid | NOT NULL | **a quién mencionan** → FK `mobility.users(id)` |
| `actor_id` | uuid | NOT NULL | **quién menciona** → FK `mobility.users(id)` |
| `post_id` | uuid | **NULL** | FK `lifebook.posts(id)` ON DELETE CASCADE |
| `comment_id` | uuid | **NULL** | FK `lifebook.comments(id)` ON DELETE CASCADE |
| `snippet` | varchar(300) | NULL | copia del texto del comentario |
| `read_at` | timestamptz | NULL | marca de leído (NULL = no leída) |
| `created_at` | timestamptz | NOT NULL | `now()` |

Índices / restricciones:
- `mentions_pkey` PRIMARY KEY (`id`)
- `ix_lb_mentions_user` btree (`user_id`, `created_at DESC`)
- `uq_lb_mention_once` **UNIQUE** (`comment_id`, `user_id`)

> **Dato crítico: NO hay ninguna columna `message_id` ni `conversation_id`.** La tabla está atada a `post_id`/`comment_id`. Tal como está, **no puede representar una mención en un mensaje de chat**, y además la clave única `(comment_id, user_id)` no serviría para mensajes.

**Filas HOY (2026-09-14):**
- Total: **21**
- Con `read_at IS NOT NULL` (leídas): **19** → quedan **2 sin leer**
- Última mención registrada: **2026-09-13 12:13:09 UTC**
- Muestra: las 5 últimas tienen `comment_id`, `post_id` y `user_id` no nulos, y `created_at` entre 2026-09-10 y 2026-09-13.

Comandos usados (reproducibles): `SELECT count(*) FROM lifebook.mentions` → `21`; `SELECT count(*) FROM lifebook.mentions WHERE read_at IS NOT NULL` → `19`.

### 2.2 ¿El servidor detecta menciones en los COMENTARIOS? ¿Y en los MENSAJES DE CHAT?

**Comentarios: SÍ, con una implementación frágil.**

`src/lifebook/lifebook.service.ts:3142` — `async comment(userId, postId, body, parentId?, attachPostId?)`:
- `src/lifebook/lifebook.service.ts:3179-3181` — `INSERT INTO lifebook.comments (...) RETURNING id, created_at`
- `src/lifebook/lifebook.service.ts:3183` — `if (text.includes('@')) {`
- `src/lifebook/lifebook.service.ts:3185-3190` — `INSERT INTO lifebook.mentions (user_id, actor_id, post_id, comment_id, snippet) SELECT u.id, ... FROM mobility.users u WHERE u.id <> ${userId}::uuid AND position(lower(u.full_name) in lower(${text})) > 0 ON CONFLICT (comment_id, user_id) DO NOTHING`

Comentario del propio código (`lifebook.service.ts:3182`): «Menciones @Nombre (Parte 7): si el comentario contiene '@', se registra una mención para cada usuario cuyo nombre completo aparezca en el texto.»

**Dos problemas reales de esa implementación (importantes para cuando copiemos el patrón):**
1. **No es «mención», es «substring de nombre completo» sobre TODA la base de usuarios.** `position(lower(u.full_name) in lower(text)) > 0` recorre `mobility.users` entero **sin limitar al grupo, a los seguidores ni a los participantes de la publicación**. Si tu comentario contiene la cadena «ali» en cualquier parte (por ejemplo dentro de «Khalid», «quality» o «salir»), **cualquier usuario llamado «Ali …» recibe una mención**. El `@` solo actúa como interruptor de encendido, no como delimitador.
2. **No exige que el `@` preceda al nombre.** `text.includes('@')` en cualquier posición habilita el escaneo de todo el texto.

Estas 21 filas de hoy son, por tanto, **menciones por coincidencia de texto**, no menciones por selección explícita de una persona. Cualquier función nueva debería hacerlo con **IDs de usuario**, no con nombres.

**Mensajes de chat: NO, no existen.**

- `src/lifebook/lifebook.service.ts:1973` — `async chatSend(userId, convId, input: { body?, kind?, ... })`. Dentro **no hay ninguna lógica de `@`**: solo valida el tipo de mensaje (`CHAT_KINDS`), aplica `allowed_kinds` del grupo, aplica el cierre de grupo (`members_can_speak === false` → `GROUP_MUTED`, `lifebook.service.ts:2003-2008`), y hace `text = String(input.body ?? '').trim().slice(0, 1000)`.
- `grep -n "indexOf('@')\|includes('@')\|mention" src/lifebook/lifebook.service.ts` devuelve **solo** las líneas del sistema de comentarios/bandeja: `2897`, `2898`, `2938`, `3091`, `3097`, `3117`, `3183`, `3185`. **Ninguna dentro de `chatSend`.**
- La tabla de mensajes lo confirma: `\d lifebook.messages` → columnas `id, conversation_id, sender_id, body, read_at, state, created_at, kind, payload`. **No hay ninguna columna de menciones.**
- No hay ningún fichero aparte de detección de menciones: `grep -rn "mentions" src/lifebook/ --include=*.ts` (excluyendo service/controller) **no devuelve nada**.

**Sobre el silenciado (referencia para el punto más importante de WeChat):** existe el dato de mute, pero **no se usa para menciones**.
- `lifebook.group_members.muted boolean NOT NULL DEFAULT false` (columna real, junto a `pinned`, `last_read_at`, `cleared_at`, `role`).
- `api/messages.ts` expone `isMuted` por conversación (`api/messages.ts:88-91`, usado en `app/lifebook-chat/[id].tsx:214`).
- `inboxCounts` **cuenta las menciones sin mirar el mute**: `lifebook.service.ts:2897-2898` hace `SELECT count(*) FROM lifebook.mentions m WHERE m.user_id=... AND m.read_at IS NULL`, sin ningún `JOIN` a `group_members`. (Hoy da igual porque las menciones son de comentarios, no de grupos; pero significa que **el mute no está conectado a las menciones**, que es justo lo que habría que decidir.)

### 2.3 ¿Hay endpoint para leer «mis menciones» y para marcarlas leídas?

**Sí, y están completos para el caso de comentarios.**

Servidor — `src/lifebook/lifebook.controller.ts`:
- `:1071-1074` — `@Get('me/inbox-counts')` → `this.lb.inboxCounts(...)` (devuelve `likes, saves, followers, comments, mentions`)
- `:1107-1111` — `@Get('me/mentions')` → `this.lb.mentionsReceived(actor.userId, { limit })`
- `:1113-1116` — `@Post('me/mentions/read')` → `this.lb.markMentionsRead(actor.userId)`
- `:1122-1126` — `@Post('me/inbox/read')` con `{ kind }` → `this.lb.inboxMarkRead(...)`

Servidor — `src/lifebook/lifebook.service.ts`:
- `:2884` — `async inboxCounts(userId)`; `:2897-2902` cuenta menciones no leídas
- `:2906` — `async inboxMarkRead(userId, kind)`; **`kind='comments'` marca también las menciones** (`:2936-2940`: `UPDATE lifebook.mentions SET read_at = now() WHERE user_id=... AND read_at IS NULL`)
- `:3091` — `async mentionsReceived(userId, opts)` → `SELECT ... FROM lifebook.mentions m LEFT JOIN lifebook.posts p ... JOIN mobility.users u ON u.id = m.actor_id WHERE m.user_id=... ORDER BY m.created_at DESC LIMIT ...` (devuelve `id, snippet, read_at, created_at, user{id,fullName,avatarUrl}, post{...}`)
- `:3117` — `async markMentionsRead(userId)` → `UPDATE lifebook.mentions SET read_at = now()`

App — `api/messages.ts`:
- `:378-389` — `fromMention(x)` convierte la mención en item de bandeja con `action: 'te mencionó'`
- `:548-553` — en `inbox(...)`, bajo `types.includes('comments')` se piden **comentarios y menciones en paralelo** y se mezclan en la misma lista
- `:559-560` — `readMentions: () => lifebookInboxApi.readMentions()` («Marca las menciones como leídas (lo único con marca de leído hoy)» — comentario literal del código)

App — pantallas:
- `app/lifebook-inbox-comments.tsx:29` — dos pestañas: `'comments' | 'mentions'`; `:35` carga ambas; **`:40-41` al abrir la pantalla llama `lifebookInboxApi.markRead('comments')`, que marca comentarios Y menciones como leídas**
- `app/lifebook-inbox-comments.tsx:94` — pestañas visibles «Comentarios» y «Menciones @»
- `app/lifebook-messages.tsx:205` — el badge del atajo «Comentarios y @» es `(counts?.comments ?? 0) + (counts?.mentions ?? 0)`
- `app/lifebook-messages.tsx:80` — `messagesApi.inboxCounts()` alimenta esos contadores
- `app/lifebook-inbox.tsx:34` — la bandeja unificada enruta `comments` a `/lifebook-inbox-comments`

**Conclusión 2.3:** el «leer mis menciones» y el «marcar leídas» **ya existen y funcionan**, pero **solo cubren menciones de comentarios**. No hay ninguna vía para que una mención de chat entre en esa bandeja (la tabla no puede guardarla, y `mentionsReceived` hace `LEFT JOIN lifebook.posts`, que para un chat sería `post = null`).

### 2.4 ¿La app tiene selector de miembros al escribir `@` en un grupo?

**NO.** Es una de las dos ausencias centrales.

- `app/lifebook-chat/[id].tsx` — el resultado de buscar `mention|members|LbGroupMember|groupMembers|@` en todo el fichero son **26 coincidencias y ninguna es un selector de menciones**: la única aparición de `@` es en rutas de import (`:23` `'@egrouteplan/ui-kit'`). No hay estado de menciones, ni lista de sugerencias, ni disparador en el `TextInput`, ni nada que lea un `@` tecleado.
- `app/lifebook-chat/[id].tsx:76-78` — los únicos parámetros de navegación relacionados con miembros son `isGroup` y `members=1` (este último solo para **abrir la hoja de gestión de miembros al crear un grupo**).
- Lo que la app hace hoy con el `@` está **solo en los comentarios y escrito a mano**:
  - `components/lifebook/CommentsSheet.tsx:390` — al responder a alguien, la app **antepone** el prefijo: `const cuerpo = \`@${target.name} ${text}\`;`
  - `components/lifebook/CommentsSheet.tsx:381` — el comentario que lo explica: «el prefijo `@nombre` (como YouTube), que es lo que el servidor guarda como…»
  - `components/lifebook/CommentsSheet.tsx:495` — se pinta `Respondiendo a @{replyTo.name}` (texto, no un chip tocable con identidad)
  - `components/lifebook/CommentsSheet.tsx:15` — cabecera del fichero: «la respuesta se pinta indentada y con «→ @Nombre»»

Es decir: **el `@` de hoy es un prefijo de texto que la app escribe sola al responder, no una mención elegida de una lista.** No hay autocompletado, no hay lista de personas y no hay identidad (solo el nombre como texto).

### 2.5 ¿Los miembros del grupo se pueden listar desde la app?

**Sí, el dato está disponible y hay UI que ya lo usa** — pero **la pantalla del chat lo descarta**.

App — `api/messages.ts`:
- `:656-664` — `export interface LbGroupMember { ... }`
- `:691-736` — `export interface LbGroup { ... membersCount: number; ... members: LbGroupMember[] }` (`:735`)
- `:572-573` — `group: (id: string) => http.get<LbGroup>(\`/lifebook/groups/${id}\`)`
- `:582-586` — `addGroupMembers`, `removeGroupMember`
- `:565-570` — `createGroup(title, memberIds, ...)`
- `:41`, `:76`, `:88-91`, `:425` — las conversaciones traen `members?: number` (solo el **número**)

Servidor — `src/lifebook/lifebook.service.ts:3912` `async groupDetails(userId, convId)`:
- `:3915-3925` — `SELECT gm.user_id, gm.role, gm.joined_at, gm.muted, gm.pinned, u.full_name, u.avatar_url, EXISTS(...follows...) AS i_follow FROM lifebook.group_members gm JOIN mobility.users u ... WHERE gm.conversation_id=${convId} ORDER BY rol (owner, admin, member), gm.joined_at ASC LIMIT 200`
- Devuelve `myRole`, `membersCount`, etc. → endpoint `@Get('groups/:id')` en `lifebook.controller.ts:1185`
- Es decir: **la lista de miembros con rol y avatar ya viaja al cliente, hasta 200, ya ordenada (dueño → admins → miembros)**. Esa consulta es prácticamente el selector de menciones ya hecho.

App — quién lo consume hoy:
- `components/lifebook/GroupManageSheet.tsx:87` — `const g = await messagesApi.group(groupId);`
- `components/lifebook/GroupManageSheet.tsx:205` — `const members = useMemo(() => group?.members ?? [], [group]);`
- `components/lifebook/GroupManageSheet.tsx:209` — ya tiene **buscador por nombre**: `members.filter((m) => (m.fullName ?? '').toLowerCase().includes(q))`
- `components/lifebook/GroupManageSheet.tsx:614-617` — pinta `role` con iconos (Dueño/Administrador/Miembro)
- Se abre desde el chat: `app/lifebook-chat/[id].tsx:1227` (`onOpenMembers`) y `:1352-1359` (`<GroupManageSheet ... initialStep="manage" />`)

**El hueco exacto:** `app/lifebook-chat/[id].tsx:229-256` llama `messagesApi.group(convId)` en el efecto de carga de grupo, pero de la respuesta **solo guarda `myRole`, `announcement`, `membersCanSpeak`, `topic`, `groupId`, `title`, `photoUrl` y `membersCount`** (`:234-248`). **Nunca guarda `g.members`.** Por eso el chat conoce el grupo pero no tiene la lista de personas a mano. Ese es el cambio más barato del plan.

---

## PARTE 3 — PLAN DE IMPLEMENTACIÓN

### Principio rector (lo que hemos aprendido)

1. Las menciones se guardan por **ID de usuario**, nunca por coincidencia de nombre (el bug de `:3188`).
2. El **@ es la puerta que atraviesa el silencio**: con el grupo silenciado, una mención debe seguir avisando. Ese es el comportamiento «como WeChat» que pide el dueño.
3. Cuando un dato sea dudoso (límite diario, `@todos`), se decide **explícitamente** y se documenta, en vez de copiar una afirmación no verificada.
4. **Nada de esto toca el teléfono ni `adb`**; la verificación es por API + SQL + dos cuentas.

### Paso 0 — Arreglar el detector actual de menciones de comentarios (bug real, ya en producción)

- **Qué:** sustituir el escaneo de `mobility.users` por `position(...)` por un delimitador real: exigir que el `@` preceda al nombre (`@` + nombre, con frontera de palabra), y **limitar el universo de candidatos** (autores/participantes de la publicación, o amigos/seguidos), no toda la tabla de usuarios.
- **Dónde:** `src/lifebook/lifebook.service.ts:3183-3190`.
- **Esfuerzo: BAJO** (una consulta y su `WHERE`).
- **Cómo se verificaría:** comentar «hola @Khalid» en una publicación y comprobar en SQL que **solo** se creó la fila de Khalid y **ninguna** de «Ali …»; comentar «esto es quality» sin `@` válido y comprobar que **no se crea ninguna** mención. `SELECT count(*) FROM lifebook.mentions` antes/después (hoy: 21).

### Paso 1 — Esquema: que una mención pueda apuntar a un mensaje de grupo

- **Qué:** nueva tabla `lifebook.message_mentions` (`id`, `user_id`, `actor_id`, `conversation_id`, `message_id`, `read_at`, `created_at`), con `UNIQUE (message_id, user_id)` e índice `(user_id, created_at DESC)`. Alternativa: añadir `message_id`/`conversation_id` a `lifebook.mentions` y relajar la UNIQUE — **peor**, porque ensucia una tabla que hoy es limpia y rompe `mentionsReceived` (hace `LEFT JOIN lifebook.posts`).
- **Recomendado: tabla nueva.** No se toca nada existente, y el contador/bandeja se alimenta de las dos.
- **Esfuerzo: BAJO-MEDIO.**
- **Cómo se verificaría:** `\d lifebook.message_mentions` muestra las columnas y las 2 FK; insertar 1 fila a mano con un `conversation_id` real y comprobar `ON DELETE CASCADE` borrando el mensaje.

### Paso 2 — Servidor: detectar menciones en `chatSend` (solo grupos, por IDs)

- **Qué:** en `chatSend` (`src/lifebook/lifebook.service.ts:1973`), aceptar un campo nuevo `mentions?: string[]` (IDs de usuario). Validar: (a) que el chat es `group`; (b) que **cada ID es miembro** (`lifebook.group_members`); (c) descartar al propio emisor; (d) tope de menciones por mensaje (ver Paso 8). Insertar en `lifebook.message_mentions`.
- **Decisión explícita:** **NO** parsear el `body` en busca de nombres (evita repetir el bug del Paso 0 y evita mencionar a alguien por escribir su nombre).
- **Esfuerzo: MEDIO.**
- **Cómo se verificaría:** `POST /lifebook/chat/conversations/:convId/messages` con `{ body: '@Ana hola', kind: 'text', mentions: ['<uuid-ana>'] }` y luego SQL: `SELECT * FROM lifebook.message_mentions WHERE message_id=...` → 1 fila con el user correcto. Repetir con un `uuid` de alguien **que no está en el grupo** → debe rechazar (o ignorar) y **no** crear fila. Comprobar que en un chat `direct` no se crea nada.

### Paso 3 — Servidor: que las menciones de chat entren en «mis menciones» y en el contador

- **Qué:** extender `mentionsReceived` (`:3091`), `markMentionsRead` (`:3117`), `inboxCounts` (`:2897`) e `inboxMarkRead` (`:2936`) para incluir `message_mentions`. En la respuesta, un item de mención de chat debe traer `conversation` (o `message`) en lugar de `post`, para que la app pueda navegar. Hacer `UNION ALL` en `inboxCounts` y devolver el mismo shape (`{ id, snippet, at, read, user, post|null, conversation|null }`).
- **Esfuerzo: MEDIO.**
- **Cómo se verificaría:** con dos cuentas, A menciona a B en el grupo → B llama `GET /lifebook/me/mentions` y ve el item con `conversation`; `GET /lifebook/me/inbox-counts` sube `mentions` en 1; `POST /lifebook/me/mentions/read` y volver a consultar → el contador vuelve a 0 y `SELECT count(*) FROM lifebook.message_mentions WHERE read_at IS NULL` para B = 0.

### Paso 4 — App: selector de miembros al teclear `@` en un grupo **(el corazón de la petición)**

- **Qué:** en el compositor de `app/lifebook-chat/[id].tsx`, si `peer?.kind === 'group'`, al teclear `@` (y en la posición concreta del cursor) abrir una hoja/lista con los miembros; filtrar según lo que se escriba después del `@`; al elegir uno, insertar un token en el texto y guardar el ID en un estado `mentions`.
- **Reutilizar lo que ya existe:** `messagesApi.group(convId)` (`api/messages.ts:572`) devuelve `members: LbGroupMember[]` (`:735`) y `GroupManageSheet.tsx:209` **ya tiene el filtro por nombre escrito** — se puede extraer a un componente compartido.
- **Cambio previo obligatorio (barato):** en el efecto de grupo de `app/lifebook-chat/[id].tsx:229-256`, guardar también `g.members` en un estado (hoy solo se guarda `membersCount`, `:247`).
- **Esfuerzo: ALTO** (es el paso grande: UI, tokenización del texto, borrado del token, carrusel de miembros, comportamiento sin miembros cargados).
- **Cómo se verificaría:** en un grupo de ≥2 personas, teclear `@` → aparece la lista con los nombres (y el dueño/admin marcados); escribir 3 letras filtra; elegir → el texto queda `@Nombre ` y **el ID** queda en el estado; enviar; SQL: 1 fila en `lifebook.message_mentions` por seleccionado. En un chat 1 a 1, teclear `@` **no** abre nada (paridad con WeChat, dentro de lo no verificado en 1.5 → decisión nuestra).

### Paso 5 — App: pintar el `@nombre` distinto y hacerlo tocable

- **Qué:** en la burbuja (`Bubble` en `app/lifebook-chat/[id].tsx:1380`), renderizar las menciones en color distinto (p. ej. `colors.primary`) y que al tocar abran el perfil con `router.push({ pathname: '/lifebook-user', params: { id } })` — **el mismo patrón ya usado** en `app/lifebook-inbox-comments.tsx:48-49`.
- **Esfuerzo: MEDIO** (requiere dividir el texto del mensaje en segmentos texto/mención).
- **Cómo se verificaría:** enviar un mensaje con una mención y comprobar en pantalla que el nombre sale en otro color y que **tocarlo abre la ficha de esa persona correcta** (no la de otro); un mensaje sin menciones se pinta igual que hoy.

### Paso 6 — App + servidor: el grupo silenciado NO debe tragarse el @ (paridad con WeChat)

- **Qué:** es el punto que el dueño destaca. Con `muted = true` en `group_members`, el **@ debe seguir contando y avisando**. Y, copiando el ajuste nuevo de WeChat (2025-10/2026-08), ofrecer en los ajustes del grupo un interruptor **«@ míos siguen avisando»** (`group_members.notify_mentions boolean NOT NULL DEFAULT true`), por defecto **encendido**.
- **Ojo:** hoy el mute **no está conectado a las menciones** (`inboxCounts` no mira `group_members.muted`, `lifebook.service.ts:2897-2898`). Eso hay que **decidirlo y documentarlo**, no dejarlo implícito.
- **Esfuerzo: MEDIO.**
- **Cómo se verificaría:** silenciar el grupo desde B, A menciona a B → el contador de B sube y B ve el aviso; B apaga «@ míos siguen avisando» → A menciona de nuevo → **no** sube y no hay aviso; volver a encenderlo → vuelve a avisar. SQL: `SELECT muted, notify_mentions FROM lifebook.group_members WHERE ...`.

### Paso 7 — `@todos` solo dueño/administradores

- **Qué:** opción «Todos» en la parte superior del selector (paridad exacta con WeChat, prensa 2021), **visible y usable solo si `myRole === 'owner' || myRole === 'admin'`** — el rol ya está disponible en la pantalla (`app/lifebook-chat/[id].tsx:234`). En el servidor hay que **revalidar el rol** (`groupRole`, ya existe: `lifebook.service.ts:1710`), porque la UI no es una barrera de seguridad: un miembro normal no puede poder dispararlo ni llamando a la API directamente.
- **Esfuerzo: MEDIO.**
- **Cómo se verificaría:** como **dueño**: aparece «Todos», se envía y a los 200 miembros les llega; como **miembro normal**: **no** aparece en la UI **y** una llamada directa a la API con el flag de `@todos` es **rechazada** por el servidor (`403`/error de dominio), comprobado con la cuenta de miembro, no solo mirando la pantalla.

### Paso 8 — Límites anti-abuso (decisión explícita, no copia ciega)

- **Qué:** definir y aplicar **nuestros** límites, porque el único dato de WeChat que encontré (3 por día para `@todos`) **no está verificado** (ver 1.6). Propuesta razonable y justificada: máximo de menciones **individuales** por mensaje (p. ej. 10) y `@todos` como máximo **1 vez por día y por grupo**. El tope de menciones individuales se puede validar en el Paso 2 (donde ya se comprueba la pertenencia al grupo).
- **Esfuerzo: BAJO** si se hace junto al Paso 2; medio si se añade después.
- **Cómo se verificaría:** enviar un mensaje con 11 menciones → rechazado con error claro y **0 filas** insertadas; usar `@todos` dos veces el mismo día → la segunda rechazada; al día siguiente vuelve a permitirse. Se documenta el número elegido y se dice que es **decisión propia, no de WeChat**.

### Orden recomendado y esfuerzo total

`Paso 0` (bajo, arregla un bug que ya está en producción) → `Paso 1` (bajo-medio) → `Paso 2` (medio) → `Paso 3` (medio) → `Paso 4` (alto, es la funcionalidad visible) → `Paso 5` (medio) → `Paso 6` (medio, es el punto que más le importa al dueño) → `Paso 7` (medio) → `Paso 8` (bajo).

Los pasos 1-3 son servidor y se pueden hacer y **probar con SQL/API antes de escribir una línea de UI**. El paso 4 es el que da la funcionalidad; los pasos 5-7 son los que la hacen «como WeChat».

---

## PARTE 4 — LO QUE NO HE PODIDO VERIFICAR

Se lista sin rellenar. Nada de esto se ha inventado en el documento.

1. **Fuente oficial de Tencent.** No he encontrado ni podido abrir ninguna página de un **dominio oficial** (WeChat / Tencent / `kf.qq.com`) que describa las menciones. Todo lo de la Parte 1 es **prensa** (电脑报 vía 网易, 澎湃新闻, 河南商报, ZOL 中关村在线) o **blog** (爱范儿), más una página **UGC** de pconline que descarto como fiable. No hay ningún dato clasificable como `oficial`.
2. **Verificación en el propio WeChat.** No tengo acceso a la app ni a un teléfono (y la tarea prohíbe `adb`). **No he podido comprobar ninguna de estas mecánicas con mis ojos en un dispositivo real**; son lecturas de fuentes.
3. **Captura oficial del aviso en la lista de chats.** Que el literal sea `[有人@我]` con corchetes lo afirman el blog 2018 y la prensa 2021 en prosa, pero **no he visto la captura de pantalla ni una guía oficial** de cómo exactamente se pinta en la lista de chats (¿texto? ¿punto rojo? ¿prefijo?). Solo puedo afirmar que el rótulo «有人@我» existe y que con el grupo silenciado el aviso **seguía llegando**.
4. **Si el `@nombre` dentro del mensaje es tocable** para abrir la ficha de esa persona. No lo he encontrado afirmado en ninguna fuente. Sé que se resalta; lo de tocable **no lo sé**.
5. **Mencionar a alguien que no está en el grupo.** Ninguna fuente lo dice explícitamente. Solo sé que el selector lista miembros del grupo.
6. **El `@` en un chat 1 a 1.** Ninguna fuente lo describe. No sé si WeChat abre lista, no hace nada o lo envía como texto plano.
7. **Límite de menciones / anti-spam.** La única cifra encontrada (3 `@todos` por día) viene de una página UGC sin respaldo y **la contradice el silencio** de la prensa detallada de 2025-2026. **No verificada.** Tampoco he encontrado límite de menciones individuales por mensaje.
8. **Alcance y fechas exactas del despliegue 2025-10/2026-08.** Los artículos describen **灰度测试** (prueba gradual) y «近期推出»; no sé en qué porcentaje de usuarios ni en qué versiones exactas está activo, ni si el ajuste de los tres interruptores llegó a todo el mundo.
9. **Detalles de «重点关注»** (los hasta 4 miembros que sí avisan): es novedad de 2026-08 según una sola fuente de prensa (ZOL) y **no la he podido contrastar** con una segunda.
10. **Datos concretos de nuestra app que no he medido.** No he contado cuántos grupos con ≥2 miembros hay, ni cuántos mensajes de chat contienen un `@` escrito a mano en la BD (no lo he consultado: el encargo limitaba las lecturas y preferí gastarlas en lo que decide el trabajo). Tampoco he revisado si existe algún sistema de **notificaciones push** para el chat: en `src/lifebook/lifebook.service.ts` no aparece nada parecido a push (`grep` de `push|notif` solo devuelve `Array.push` y condiciones SQL), pero **no he auditado el proyecto entero**, así que no puedo asegurar que no lo haya en otro módulo. Esto afecta al Paso 6: si no hay push, «avisar» significa hoy solo **contador + bandeja**, y habría que decirle al dueño qué significa exactamente «que me avise».
11. **El endpoint exacto con el que la app envía un mensaje.** He visto `messagesApi` (`api/messages.ts`) y `chatSend` en el servidor (`:1973`), pero **no he leído la función concreta de `api/messages.ts` que hace el POST del mensaje** (está fuera de los ficheros que se me pidió mirar). El Paso 2 asume que se le puede añadir un campo `mentions` al cuerpo; **eso hay que confirmarlo** antes de estimarlo.
