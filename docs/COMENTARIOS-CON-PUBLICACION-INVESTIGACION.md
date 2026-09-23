# Meter publicaciones en comentarios (vídeos y posts) — investigación

Fecha: 2026-09-14. Estado: **investigación**, no implementado.
Pregunta: cómo meter publicaciones dentro de comentarios, tanto en el feed de
vídeos como en las publicaciones normales.

---

## 1. Titular: el patrón ya está en producción en el chat

No hay que inventar el modelo. El chat del Life Book **ya comparte publicaciones**
y funciona así (todo verificado en el código y en los datos reales, no supuesto):

| Pieza | Dónde | Cómo |
|---|---|---|
| Guardado | `lifebook.messages` | `kind='post' \| 'sale'` + **`payload jsonb`** con `{"postId": "…"}` + `body` de reserva |
| Dato real | fila de la base | `post \| payload={"postId": "5f1e3d39-…"} \| body=📄 Ok` |
| Resolución | `lifebook.service.ts:1856` | al leer, el servidor devuelve `postRef { id, title, priceXaf, coverUrl }` |
| Contrato app | `api/messages.ts:136` | `LbMessagePostRef { id, title, coverUrl?, priceXaf? }` |
| Selector | `app/lifebook-chat/[id].tsx` | `Modal` → `userPosts(me.id, { limit: 20, type })` → `sharePost(post, kind)` |

**Es una REFERENCIA, no una copia**: el comentario guardaría el `id` de la
publicación y el servidor la resuelve al leer. Eso es exactamente lo que hacen las
plataformas grandes (ver §4) y es lo que ya hacemos aquí.

## 2. Segundo titular: una sola implementación cubre los dos sitios

El feed de vídeos **ya pinta la misma hoja de comentarios** que el detalle:

- `app/lifebook-videos.tsx:114` importa `CommentsSheet` y la abre **en sitio**
  (sin salir del feed inmersivo), con `meId` (`:235`) y `allowComments` (`:251`).
- O sea: lo que se construya en `CommentsSheet` aparece **a la vez** en los vídeos
  y en las publicaciones normales. No hay dos trabajos.

Lo único específico del vídeo es **a dónde lleva tocar la tarjeta**, porque el feed
inmersivo tiene que no romperse:

- publicación normal → `/lifebook-post/<id>`
- vídeo → `/lifebook-videos?startId=<id>` (el feed ya soporta `startId`, `:217`)

## 3. Las dos cosas que se pueden llamar «meter publicaciones en comentarios»

### Opción A · adjuntar/citar una publicación que YA existe ← recomendada primero

**Base de datos: una columna, ninguna tabla nueva.**

```
ALTER TABLE lifebook.comments
  ADD COLUMN attach_post_id uuid REFERENCES lifebook.posts(id) ON DELETE SET NULL;
```

- `ON DELETE SET NULL` y **no** `CASCADE`: si borran lo adjunto, el comentario
  sobrevive como texto. Al revés se perdería lo que escribió la gente, que no es
  culpa de nadie.
- Ojo, no confundir: los comentarios **de** una publicación ya caen por `CASCADE`
  al borrarla (lo hace `deletePost`). Esta clave ajena solo afecta a los
  comentarios de **otros** sitios que la citaban.
- Añadir una columna anulable es instantáneo en Postgres 11+: no reescribe la tabla
  (215 comentarios hoy).

**Servidor** (`src/lifebook/lifebook.service.ts`):

1. `comment(userId, postId, body, parentId?, attachPostId?)`: valida que el id sea
   uuid, que la publicación exista y **que quien comenta pueda verla** (se reutiliza
   el guardián `assertPostVisible` que acabo de añadir en esta misma ronda).
2. Al leer (`comments`, `commentsPage`, `commentReplies`): un `LEFT JOIN` a
   `lifebook.posts` resuelve `ref` con la **misma forma que el chat**
   (`{ id, type, title, preview, thumb, priceXaf? }`) para poder reutilizar la
   tarjeta que ya existe.
3. Texto: permitir comentario **solo con adjunto** (hoy `body` es obligatorio,
   `@Length(1,1000)`), porque la tarjeta ya es contenido.
4. **No avisar** a quien escribió la publicación adjunta. Si adjuntar avisa, se
   convierte en un canal de spam directo: cualquiera podría notificar a cualquiera
   citándole.
5. Límite: **1 adjunto por comentario**. Se puede adjuntar lo propio y lo ajeno.

**Riesgo que hay que resolver sí o sí: la visibilidad del adjunto.**

La publicación adjunta puede ser `private` o `followers`. El resolutor tiene que
**filtrar por visor**: si quien mira no la ve, no se puede enseñar ni el título
(enseñarlo ya sería filtrar información). Si no se ve, la tarjeta desaparece y el
comentario queda como texto.

Y aquí hay un fallo **que ya existe hoy en el chat**, verificado leyendo su código:
la consulta que trae los mensajes une las publicaciones así
(`lifebook.service.ts:1714`)

```sql
LEFT JOIN lifebook.posts p ON m.kind IN ('post','sale') AND p.id = (m.payload->>'postId')::uuid
```

es decir, **sin `p.state`, sin visibilidad y sin bloqueo**. Y el resolutor
(`:1855-1862`) construye `postRef.title` directamente de ese `p.title`. Compartir tu
nota privada en un chat le enseña el título a alguien que no puede abrirla. No lo he
probado en vivo para no dejar basura en una conversación real; está leído en el
código, línea a línea. Si se toca el chat, es el mismo arreglo de una línea.

### Opción B · comentar con contenido NUEVO (vídeo de respuesta, foto en el comentario)

Es lo de TikTok («responder con vídeo») y Douyin. Bastante más caro:

- En TikTok el vídeo de respuesta es una **publicación nueva enlazada al
  comentario**, no un adjunto dentro del comentario.
- En nuestro modelo sería: subir a `media_uploads` → crear en `lifebook.posts` una
  publicación `type='video'` (o `note`) con un `reply_to_comment_id` → pintarla en
  el hilo como tarjeta y también en el feed.
- Toca almacenamiento, cuotas y moderación: se cruza con
  `docs/PLAN-OSS-VOD-CDN-LIVE.md`.
- El usuario ya dijo antes que «comentar con fotos» no está y que queda para otro
  momento.

**Recomendación: A primero, y B solo si A se usa de verdad.**

## 4. Cómo lo hacen otras plataformas

Lo importante no es la lista, es que **todas separan dos cosas distintas**:

### TikTok
Estrenó «responder con vídeo»: la respuesta es **un vídeo nuevo publicado en tu
perfil**, enlazado al comentario, y se consume en el feed normal (no dentro del
hilo); el comentario queda como enlace a ese vídeo.
([The Verge](https://www.theverge.com/22583435/tiktok-reply-video-comments-how-to))
Después amplió los comentarios con **notas de voz, encuestas y carruseles de fotos**
— esos sí viven dentro del comentario.
([andina](https://andina.pe/agencia/noticia-tiktok-renueva-los-comentarios-ahora-puedes-responder-voz-encuestas-y-fotos-1090841.aspx),
[tgcom24](https://www.tgcom24.mediaset.it/tgtech/tiktok-rivoluzione-con-messaggi-vocali-sondaggi-_116190592-202602k.shtml))

→ Patrón: **contenido nuevo y pesado = publicación nueva enlazada**; contenido
ligero (foto, voz) = adjunto dentro del comentario.

### Xiaohongshu (小红书)
Tiene comentarios con imagen y, más reciente, **citar un comentario para publicar
una nota** (`评论还能直接引用发笔记`, versión HarmonyOS) y el **reenvío de notas**
(`上线笔记转发功能`).
([什么值得买](https://post.smzdm.com/p/a26ewvlp/),
[toutiao](https://www.toutiao.com/w/1874526342647879/))

→ Patrón: la cita genera **contenido nuevo que referencia** lo citado.

### Instagram
Comentarios con **GIF** (2023), con **fotos del carrete** respondiendo a un
comentario, y **responder con un Reel**.
([howtogeek](https://www.howtogeek.com/how-to-comment-gif-on-instagram/),
[piunikaweb](https://piunikaweb.com/2023/05/22/instagram-now-lets-you-reply-or-comment-with-gifs-on-posts-heres-how-to-do-it/),
[tecnoandroid](https://www.tecnoandroid.it/news/instagram-ora-puoi-rispondere-ai-commenti-con-le-foto-del-rullino-1919531/),
[gadgetstouseai](https://gadgetstouseai.pages.dev/posts/how-to-reply-to-instagram-comments-with-reels-video/))

→ Patrón: la **foto/GIF sí vive dentro del comentario**; el vídeo de respuesta es
un Reel aparte, como en TikTok.

### X / Twitter
La cita (quote) es una **referencia**: si borran la publicación citada, el tuit con
la cita sigue en pie y el hueco de la cita muestra una **tumba** —«This quoted post
is unavailable» / «Este post citado no está disponible»—. No se guarda una copia del
contenido citado; se muestra que ya no está.
([roboin](https://roboin.io/article/en/2025/10/08/how-to-view-tweets-that-show-this-quoted-post-cannot-be-displayed/),
[tumbas en un cliente alternativo](https://github.com/FxEmbed/FxEmbed/pull/1981))

→ Es la evidencia más directa para nuestra decisión pendiente nº 1: **referencia +
tumba, sin snapshot**.

### Facebook
Desde 2016 se puede **subir un vídeo dentro de un comentario**, en Android, iOS y
web: el vídeo vive en el hilo, no es una publicación nueva.
([The Verge](https://www.theverge.com/2016/6/10/11899894/facebook-video-comment-upload),
[gadgets360](https://www.gadgets360.com/apps/news/facebook-now-lets-you-posts-videos-in-comments-on-android-ios-and-web-847547))

→ Es el caso más caro (contenido nuevo pesado dentro del comentario): almacenamiento,
cuotas y moderación. Coincide con nuestra opción B.

### WeChat (微信)
El **引用** (citar) es una función de primera clase en los chats y recibió mejoras
recientes: «引用 precisa» (cita exacta de un fragmento) y trazabilidad de las
imágenes citadas («一眼溯源», poder ver de dónde sale la imagen citada). En el
**朋友圈** los comentarios admiten **imágenes y 表情包** (stickers), con caché que se
puede limpiar.
([bianews](https://www.bianews.com/news/details?id=218905),
[DoNews](https://www.donews.com/news/detail/4/5948517.html),
[mydrivers](http://m.mydrivers.com/newsview/1061264.html))

→ Dos lecciones: la cita tiene que ser **exacta y rastreable** (saber qué se citó y
de quién), y el contenido ligero (imagen/sticker) sí vive dentro del comentario.

### Douyin (抖音)
Comentarios **con imagen** (图片评论), y el creador puede **activar o desactivar** esa
posibilidad en sus vídeos (los tutoriales hablan de «评论发图权限»). También existe la
respuesta con vídeo, como en TikTok.
([php.cn](https://www.php.cn/faq/2055584.html),
[applejia](http://www.applejia.net/wz/685186.html))
_Aviso: estas fuentes son tutoriales, no documentación oficial de Douyin; el dato del
permiso del creador es consistente entre varias, pero no lo he confirmado en la app._

→ Lección: **quien publica decide** si su contenido admite adjuntos en los
comentarios (nosotros ya tenemos `allow_comments` como precedente).

### YouTube
No he podido verificar que un enlace a un vídeo dentro de un comentario se convierta
en tarjeta con miniatura. Lo que sí está documentado es cómo se comparten enlaces con
la audiencia, no una vista previa enriquecida en los comentarios.
([ayuda de Google](https://support.google.com/youtube/answer/13748639?hl=es-419))

→ **No verificado**: no lo uso como referencia de diseño.

### Patrones que se repiten (y que nos afectan)

1. **Dos caminos separados y nunca mezclados**: *referenciar* algo que ya existe
   (cita, 引用, quote) frente a *meter contenido nuevo* en el comentario (foto, GIF,
   voz, y en Facebook hasta vídeo).
2. Lo referenciado es **el original, no una copia**. Cuando el original desaparece se
   enseña una **tumba** («este post citado no está disponible», X) y no un contenido
   guardado. X es el caso más claro y nos resuelve la decisión pendiente nº 1.
3. El contenido **pesado** (vídeo) casi nunca se reproduce dentro del hilo: o es una
   **publicación nueva enlazada** (TikTok, Reel de Instagram) o un **vídeo subido al
   comentario** (Facebook, el caso más caro).
4. El contenido **ligero** (foto, GIF, sticker, voz) sí vive dentro del comentario.
5. **Quien publica decide**: Douyin permite activar o desactivar los comentarios con
   imagen en sus vídeos. Nosotros ya tenemos ese precedente con `allow_comments`.
6. La cita es un objeto de primera clase y debe ser **exacta y rastreable** (WeChat
   mejoró justo eso: cita precisa y poder ver de dónde sale lo citado). En la tarjeta
   hay que poder ver **de quién es** lo adjunto, no solo el título.

## 5. Cambios exactos de la opción A

| Capa | Fichero | Cambio |
|---|---|---|
| DDL | servidor `sql/lifebook/20260214_comentarios_con_adjunto.sql` + copia local `backend/sql/005_comentarios_con_adjunto.sql` | la columna + la clave ajena (el servidor es la fuente de verdad, como con `004_estado_social.sql`) |
| Servidor | `lifebook.service.ts` | `comment()` acepta `attachPostId`; resuelven `ref` los tres sitios de lectura (`comments`, `commentsPage`, `commentReplies`) **y** la respuesta del POST (`commentAsObject`); `serializeComment` lo incluye |
| Controlador | `lifebook.controller.ts` | `CommentDto.attachPostId?`; `body` pasa a opcional si hay adjunto |
| App API | `api/lifebook.ts` | `LbComment.ref?` y `addComment(postId, texto, parentId?, attachPostId?)` — aditivo, nada se rompe |
| App UI | `components/lifebook/MyPostsPicker.tsx` **(nuevo)** | se extrae el selector que hoy vive dentro de la pantalla del chat |
| App UI | `components/lifebook/CommentsSheet.tsx` | botón «+» en el compositor → selector → tarjeta en `CommentRow` → al tocar, abre la publicación |
| Feed de vídeos | — | **nada**: usa la misma hoja |

## 6. Cómo se verificaría (sin dar nada por bueno)

Suite nueva, con las cuentas de prueba de siempre:

1. Adjuntar en una **publicación normal** y en un **vídeo** → la tarjeta aparece en
   los dos sitios (misma hoja).
2. Comentario **solo con adjunto**, sin texto.
3. **Adjunto privado visto por un tercero**: no debe salir ni el título; el
   comentario se ve como texto.
4. **Adjunto borrado**: el comentario sobrevive y pierde la tarjeta (nada de
   enlaces rotos).
5. Adjuntar algo **que no puedes ver** → error, no se guarda.
6. Quien escribió lo adjunto **no** recibe aviso.
7. Responder a un comentario con adjunto (y que el adjunto no se duplique en el hilo).

## 7. Decisiones que hacen falta antes de tocar código

1. ¿**Snapshot mínimo** (título + miniatura guardados en el comentario) para poder
   decir «publicación eliminada» con contexto, o preferimos que la tarjeta
   simplemente desaparezca? **X ya respondió esto**: muestra una tumba («este post
   citado no está disponible») sin guardar el contenido. Recomiendo lo mismo: el
   `ON DELETE SET NULL` deja el comentario como texto y, si acaso, la app pinta
   «publicación ya no disponible» sin enseñar nada del original.
2. ¿Se puede adjuntar también en una **respuesta**, o solo en comentarios raíz?
3. ¿Se permite adjuntar **la misma publicación** que se está comentando (citar el
   propio post)? En TikTok no tiene sentido; en un post normal es raro pero inocuo.
4. ¿La tarjeta se puede quitar/editar después (`PATCH /comments/:id`)?
5. Orden del hilo: un comentario con tarjeta ocupa más alto. ¿Se queda en el orden
   cronológico normal (recomendado) o se separa?
6. La tarjeta debe poder decir **de quién es** lo adjunto (WeChat mejoró justo eso:
   «cita precisa» y ver de dónde sale). ¿Mostramos autor + tipo + título, o solo
   título y miniatura como hace el chat hoy?
7. ¿Quien publica puede **impedir** que le adjunten en los comentarios (como el
   permiso de Douyin para comentarios con imagen)? Hoy `allow_comments` apaga todos
   los comentarios; un interruptor aparte sería lo de Douyin.

---

## 8. Decisiones tomadas (y ya implementadas en el backend)

Las siete las decidí yo por encargo. Estas son, con el porqué:

1. **Sin snapshot**: la tarjeta desaparece si borran el original (`ON DELETE SET NULL`),
   como X con su tumba. **Y el texto del comentario sigue siendo obligatorio**, así
   que nunca queda una fila vacía ni hace falta guardar copia de nada. Esa es la
   razón de exigir texto: sin él, un comentario «solo con tarjeta» se quedaría mudo
   el día que borren lo adjunto.
2. **Sí en respuestas**: la misma columna sirve y una respuesta suele ser justo
   donde quieres citar algo. Verificado.
3. **No se puede adjuntar la publicación que estás comentando** → 400
   `CANNOT_ATTACH_SELF`. Una tarjeta de sí misma no significa nada.
4. **No se edita el adjunto** en esta versión (`PATCH /comments/:id` sigue editando
   solo el texto). Se puede añadir después sin tocar el esquema.
5. **Orden cronológico normal**: la tarjeta solo hace la fila más alta.
6. **La tarjeta dice de quién es**: `{ id, type, title, preview, thumb, priceXaf?, author }`.
   Es la lección de WeChat (cita precisa y rastreable) y una mejora sobre el chat, que
   hoy solo manda título y miniatura.
7. **Sin interruptor aparte**: adjuntar **no avisa** a quien escribió lo adjunto (si
   avisara, sería un canal de spam directo) y respeta la visibilidad del original. No
   hay nada de lo que proteger, así que no se añade una preferencia nueva.

Reglas extra que decidí al implementar:

- **Solo se adjunta lo que puedes ver** (se reutiliza `assertPostVisible`). Sin esto,
  un comentario en una publicación pública serviría para sacar a la luz el título de
  una publicación privada.
- **La tarjeta se resuelve por visor**: si quien mira no puede ver lo adjunto, no se
  le manda la tarjeta **ni el título**. Era el riesgo real de esta función.
- **Un adjunto por comentario**, y no se avisa a nadie.

### Estado de la implementación

| Parte | Estado |
|---|---|
| DDL (`sql/lifebook/20260214_comentarios_con_adjunto.sql` + copia local) | **hecho y aplicado** |
| Servicio (`lifebook.service.ts`: guardar, validar, resolver por visor) | **hecho** |
| Controlador (`attachPostId` en las dos rutas que crean comentarios) + `CANNOT_ATTACH_SELF` | **hecho** |
| Verificación (`pruebas/lb51r-verificar-comentario-adjunto.cjs`) | **35 comprobaciones, 35 pasan** |
| App (selector de mis publicaciones, tarjeta en el comentario, hoja compartida por vídeos y posts) | **hecho y verificado en el móvil** |

### Verificación en el móvil (Poco F5), midiendo y no mirando

Instalado el APK y recorrido el camino real a mano por `adb` (volcado de la interfaz
y toques), que es la única forma de comprobarlo sin poder ver imágenes:

| Comprobado | Resultado |
|---|---|
| El compositor tiene el botón «Adjuntar una publicación a mi comentario» | sí, junto al campo de texto |
| El selector abre y lista **mis** publicaciones (dibujo, título y tipo) | sí, 8 filas |
| Al elegir aparece el chip «Adjuntando: …» con su aspa para quitarlo | sí |
| Al enviar, el comentario se crea y **la tarjeta se pinta** con la miniatura, el título y **«Nota · de BERNARDO LOPERTE»** | sí |
| Tocar la tarjeta **abre la publicación adjunta** | sí (lleva a la nota) |
| La base guarda la referencia: el comentario creado **desde la app** quedó con `attach_post_id` | sí, comprobado por SQL |
| Eliminar mi comentario desde la app | sí (borrado lógico: la publicación vuelve a 0 comentarios activos) |
| Sin restos: comentarios activos con adjunto en toda la base | **0** |

**Un defecto real que salió de aquí:** la **última fila del selector no se podía
tocar**. El compositor de la hoja se pintaba **por encima** de la parte baja del
selector y se comía el toque: pulsar la última fila no seleccionaba nada y pulsar una
del medio sí. Se arregló con `zIndex` + `elevation` en la capa del selector (en
Android, sin eso, una vista con elevación gana aunque esté antes en el árbol) y se
volvió a medir en el móvil: la última fila ya selecciona.

Lo que cubre la suite, con datos reales: adjuntar una nota y **un vídeo de otra
persona** (con su miniatura y su autor), adjuntar en una respuesta, que un tercero
**no** reciba el título de una publicación privada adjunta, que no se pueda adjuntar
lo que no ves (404) ni la propia publicación (400) ni un id mal formado, que el texto
siga siendo obligatorio, que adjuntar **no genere avisos**, y que al borrar lo
adjunto **el comentario sobreviva con su texto y sin enlace roto**.
