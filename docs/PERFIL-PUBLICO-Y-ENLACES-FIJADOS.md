# Perfil público de Life Book y enlaces fijados

**Fecha:** 2026-02-16 (investigación puntual, sin modificar código)
**Objetivo:** llevar el estilo del **perfil de cuenta** al **perfil público** de Life Book y permitir que cada persona **fije enlaces** (por ejemplo el enlace de un grupo suyo, con clave o sin ella, o el enlace de un influencer).

**Alcance de lo verificado:** servidor `/opt/mirror/app` (grep + BD `egrouteplan`), app `D:\egapp` (lectura concreta de ficheros), y búsquedas web.
**No se ha modificado ningún fichero salvo este documento.**

---

## PARTE 1 — CÓMO LO HACEN OTRAS PLATAFORMAS

> **Advertencia sobre la evidencia:** las búsquedas devolvieron **títulos y URLs**, no el cuerpo de las páginas. Donde solo tengo el titular lo digo explícitamente (`nivel de evidencia: titular`). No he rellenado nada con lo que "suele decirse".

### 1.1 Instagram — «enlace en la biografía»

| Punto | Qué se sabe | Fuente y tipo |
|---|---|---|
| Cuántos enlaces | Hasta **5 enlaces** en la bio, gestionados **desde la propia app** (antes había uno solo y se usaban agregadores tipo Linktree) | [TechCrunch, 18-abr-2023](https://techcrunch.com/2023/04/18/instagram-takes-on-linktree-and-others-with-support-for-up-to-5-links-in-bio/) — **prensa**. Titular explícito: *"support for up to 5 'links in bio'"*. Corroborado por [PCMag](https://uk.pcmag.com/social-media/146489/instagram-finally-adds-official-support-for-multiple-bio-links-how-to-use-it) — prensa |
| Cómo se añaden | Editar perfil → sección de enlaces → añadir/editar/reordenar/quitar | [SocialBee](https://socialbee.com/blog/how-to-add-a-link-to-instagram-bio/) — **blog**. [Planoly](https://www.planoly.com/blog/links-for-instagram-bio) — **blog** |
| ¿Hace falta verificado o cuenta profesional? | **No para los 5 enlaces**: el despliegue de 2023 se anunció para todas las cuentas. **Sí existe una restricción de cuenta** para poner *un* enlace en la bio en ciertos casos (cuentas nuevas o sin actividad): hay guías dedicadas a *"why some accounts cannot add a link in the Instagram bio"* | [Sozee](https://www.sozee.ai/resources/add-link-in-bio-instagram/) — **blog**. *No he podido confirmar la regla exacta con fuente oficial.* |
| ¿Hay algo de «fijar»? | **No en el sentido de fijar enlaces.** Lo que Instagram llama *destacadas* (Stories highlights) son **colecciones de historias** que se fijan arriba del perfil, no enlaces. Los enlaces de bio se **reordenan** pero no se "fijan" con etiqueta | [Later Help — *Link in Bio vs Instagram Product Tags*](https://help.later.com/hc/en-us/articles/360043255213-The-Difference-Between-Link-in-Bio-and-Instagram-Product-Tags) — **blog/help de tercero** |
| Fuente oficial | **No encontrada.** Las búsquedas dirigidas a `help.instagram.com` no devolvieron ninguna página oficial indexada sobre "varios enlaces en la bio" | — |

**Lección para nosotros:** el patrón de Instagram es «una lista corta y ordenada de enlaces», editable por el dueño, sin concepto de "fijado" y sin requisito de verificación. Es exactamente lo que ya tenemos a medias.

### 1.2 Xiaohongshu (小红书) — notas fijadas (置顶) y grupos

**Confirmo el hallazgo de investigaciones anteriores de este proyecto: de 小红书 prácticamente NO hay documentación oficial indexada.** Todo lo que aparece son granjas de tutoriales y Zhihu.

| Punto | Qué se sabe | Fuente y tipo |
|---|---|---|
| **Notas fijadas (置顶)** | En el perfil se pueden **fijar notas propias** para que aparezcan en primer lugar. El número que se repite en los tutoriales es **hasta 3 notas fijadas** | [php.cn](https://m.php.cn/faq/2097766.html), [17golang](https://m.17golang.com/article/516907.html), [mizhijia](https://www.mizhijia.net/wz/798169.html), [Zhihu](https://www.zhihu.com/question/381506742/answer/2786481419) — **blogs/foro, calidad baja**. Nivel de evidencia: titular + consenso entre tutoriales. **No verificado con fuente oficial.** |
| **Grupos de fans / 群聊** | Se puede crear un grupo y acceder a él desde el perfil; los tutoriales lo tratan como función de creador orientada a "私域" (tráfico propio) | [php.cn — 群聊功能](https://m.php.cn/faq/2019243.html), [php.cn — 群聊使用方法](https://m.php.cn/faq/2290567.html), [17golang](https://m.17golang.com/article/584041.html) — **blogs, calidad baja** |
| **Enlaces** | Aparecen menciones a *"私域引流"* (llevar tráfico fuera de la plataforma) y a **cómo hacerlo sin infringir normas** — lo que implica que 小红书 **restringe activamente** poner enlaces/enviar gente fuera | [Zhihu 1](https://www.zhihu.com/question/2113161563/answer/1909998473023059554), [Zhihu 2](https://www.zhihu.com/question/471821626/answer/3235836498) — **foro** |
| **Qué partes del perfil son configurables** | **NO ENCONTRADO con fiabilidad.** Solo hay referencias genéricas a "ajustes del perfil" sin listado de campos. No lo relleno. | — |

**Lo que NO he encontrado de 小红书 (dicho claramente):**
- Ninguna página de **ayuda oficial** (`xiaohongshu.com` / centro de ayuda) sobre notas fijadas, grupos de fans o enlaces en el perfil.
- **Ninguna cifra oficial** del límite de notas fijadas (el "3" viene de tutoriales, no de la plataforma).
- **Ninguna información oficial** sobre si el grupo tiene clave de acceso, aprobación del dueño, caducidad o aforo.
- **Ningún listado** de qué campos del perfil son configurables.

### 1.3 WeChat — invitar a un grupo (群二维码 / 群邀请链接)

| Punto | Qué se sabe | Fuente y tipo |
|---|---|---|
| **Caducidad del 群二维码** | La regla que repiten todas las guías: el QR de grupo **caduca a los 7 días**, y hay que **generarlo de nuevo** para volver a invitar | [17golang — 使用规则详解](https://m.17golang.com/article/391604.html), [php.cn](https://m.php.cn/faq/1605117.html), [百家号](https://baijiahao.baidu.com/s?id=1749737038934549119) — **blogs/agregador**. Nivel: consenso de titulares, **sin fuente oficial de Tencent** |
| **¿Tiene clave de acceso?** | **NO ENCONTRADO.** No aparece ningún mecanismo de contraseña para entrar a un grupo de WeChat. El control es por **QR / invitación de un miembro** | — |
| **¿El dueño aprueba la entrada?** | Existe el ajuste **群聊邀请确认** (confirmación de invitación): cuando está activo, entrar requiere que el dueño/administrador confirme. Mencionado en guías de administración, **sin página oficial localizada** | Referencias indirectas en las mismas guías anteriores. **Nivel de evidencia: bajo.** |
| **Límite de personas** | WeChat tiene límites por grupo; las guías mencionan **500** como techo de grupo normal (y **200** para grupos de empresa/WeCom). **No he encontrado confirmación oficial de estos números** | [zeelive — 微信群加人限制](https://www.zeelive.com.tw/a/%e5%be%ae%e4%bf%a1%e7%be%a4%e5%8a%a0%e4%ba%ba%e9%99%90%e5%88%b6.html) — **blog**. **Nivel: bajo, no verificado** |
| **Enlace de invitación** | WeChat usa QR + invitación por miembro; **no hay un enlace web reutilizable del tipo `t.me/+hash`** | Derivado de las guías anteriores |

**Lección para nosotros:** el modelo WeChat (QR que caduca + aprobación del dueño) es el más parecido a lo que ya tenemos. Nuestro `invite_code` no caduca (mejor) y ya tiene aprobación y pregunta.

### 1.4 Telegram — enlaces de invitación (`t.me/+hash`) → **el ejemplo mejor documentado**

| Punto | Qué se sabe | Fuente y tipo |
|---|---|---|
| **Formato** | Enlace de invitación con hash: `t.me/+<hash>`, distinto del enlace público `t.me/<nombre>`. El hash es secreto y **revocable** | [docs.python-telegram-bot — ChatInviteLink](https://docs.python-telegram-bot.org/en/v20.1/telegram.chatinvitelink.html) — **documentación de API (semi-oficial: refleja los campos del Bot API de Telegram)** |
| **Con o sin aprobación de administradores** | Campo **`creates_join_request`** / **`request_needs_approval`**: al crear el enlace se decide si quien entra **entra directo** o **genera una solicitud** que un admin debe aprobar. Es la misma URL, cambia una bandera | Igual que arriba — **documentación de API** |
| **Caducidad** | Campo **`expire_date`**: el enlace puede tener fecha de caducidad (o ser permanente) | Igual que arriba — **documentación de API** |
| **Límite de usos** | Campo **`member_limit`**: número máximo de miembros que pueden entrar con ese enlace concreto | Igual que arriba — **documentación de API** |
| **Enlaces por administrador / métricas** | Cada admin puede tener **su propio enlace** con su propio límite, para medir de dónde viene la gente | [statiko.io](https://statiko.io/blog/telegram-invite-link), [kunfupay](https://kunfupay.com/en/blog/enlaces-invitacion-grupo-telegram-2026) — **blogs**, coherentes con los campos de la API |
| **Por qué los enlaces dejan de funcionar** | Casos documentados: enlace caducado, límite de miembros agotado, enlace revocado, grupo convertido en privado o **solicitud pendiente de aprobación** (el usuario cree que falló y no es así) | [CRMChat](https://crmchat.ai/blog/telegram-group-invite-links-expire-before-joining) — **blog**. Muy útil: es exactamente la confusión que hay que evitar en la UI |

### 1.5 Cómo evitan el spam y la venta de accesos

| Mecanismo | Detalle | Fuente y tipo |
|---|---|---|
| **Límite de miembros por enlace** | `member_limit` en Telegram: un enlace difundido públicamente se agota solo | docs de API (arriba) |
| **Aprobación obligatoria** | `creates_join_request`: el spammer entra a una cola, no al grupo | docs de API (arriba) |
| **Caducidad** | `expire_date`: un enlace filtrado deja de servir | docs de API (arriba) |
| **Botones anti-spam y captcha** | En Telegram la moderación de spam se hace con **bots** que exigen captcha/pulsación antes de permitir escribir; también ajustes de **"quién puede añadir miembros"** | [collony — Anti-Spam Checklist](https://www.collony.ai/blog/telegram-anti-spam-settings), [collony — Block Spam Links](https://www.collony.ai/blog/block-spam-links-telegram), [telegram-bot.app](https://telegram-bot.app/learning-centre/link-remover-bot-telegram/) — **blogs** |
| **Límites de la plataforma al entrar** | Telegram bloquea tras **demasiados intentos de entrar** a grupos en poco tiempo (protección anti-abuso del lado del usuario, no del grupo) | [Tuexpertoapps](https://www.tuexpertoapps.com/2024/02/18/telegram-no-me-deja-entrar-a-un-grupo-demasiados-intentos/) — **blog** |
| **Política contra venta de accesos** | La FAQ oficial de Telegram sobre spam trata el reporte y el bloqueo; **no he localizado un artículo oficial que hable específicamente de "venta de accesos a grupos"**. Lo que sí es oficial es que el spam se combate con **límites + reportes + restricciones** | [Telegram F.A.Q. — Spam (espejo)](https://telegramapp.github.io/faq_spam), [Telegram F.A.Q. — Channels (espejo)](https://telegramapp.github.io/faq_channels) — **espejo no oficial de la FAQ oficial**. Nivel: medio |

**Resumen de la Parte 1 — el patrón que hay que copiar:**
1. Lista corta de enlaces en el perfil, editable por el dueño (Instagram: 5).
2. Un enlace de grupo **no es una URL normal**: es un **token**, y ese token lleva **tres banderas independientes**: *entra directo / requiere aprobación*, *caduca o no*, *límite de usos* (Telegram).
3. El «fijado» en el perfil existe como **notas fijadas** (小红书) y como **destacadas** (Instagram), pero **no como "enlaces fijados"** en ninguna de las plataformas consultadas → **nuestra idea de fijar enlaces es un diferenciador, no una copia.**

---

## PARTE 2 — QUÉ TENEMOS HOY (rutas y números reales)

### 2.1 Perfil público vs. perfil de cuenta: diferencias concretas

**Perfil público** = `app/lifebook-user.tsx` (ruta `/lifebook-user?id=…`, 551 líneas).

Secciones, en orden (`app/lifebook-user.tsx:257-483`):

| # | Sección | Línea |
|---|---|---|
| 1 | Portada de **altura fija 208** con degradado azul de reserva | `lifebook-user.tsx:266-290` |
| 2 | Barra flotante: `←` · **`✎` solo si es mi perfil** · **`⋯` solo si es ajeno** (menú con *Bloquear / Usuarios bloqueados*) | `:240-255`, `:486-507` |
| 3 | Avatar 80 con anillo de estado 24 h (`StatusRingAvatar`, abre el estado si existe) | `:299-307` |
| 4 | Nombre con `nameColor` + `BadgeCheck` azul | `:310-313` |
| 5 | `profesión · escuela` y `país · ciudad` (texto **no pulsable**) | `:315-325` |
| 6 | **Chips de rol verificado** (Conductor / Tienda / Restaurante / Contratante / Anfitrión) | `:38-44`, `:326-338` |
| 7 | Stats de 4 columnas: **Publicaciones · Seguidores · Seguidos · Me gusta** | `:343-361` |
| 8 | Botones: propio → `Editar perfil`, `📦 Pedidos`, `💬 Mensajes`; ajeno → `Seguir/Siguiendo` + `💬 Mensaje`; y `🛍 Ver tienda` si es vendedor | `:365-404` |
| 9 | Bio | `:408-412` |
| 10 | Valoración con estrella (`ratingAvg`) | `:413-419` |
| 11 | **Chips de enlaces** | `:420-434` |
| 12 | Pestañas Notas · Videos · Podcasts · Series · Ventas · Todo | `:437-461` |
| 13 | Rejilla de 2 columnas de publicaciones | `:467` |

**Perfil de cuenta** = `app/profile.tsx` (978 líneas). El "estilo propio" que el dueño quiere llevar:

| # | Sección | Línea |
|---|---|---|
| 1 | Portada **edge-to-edge que crece** hasta el título (no altura fija) con doble scrim | `profile.tsx:205-225` |
| 2 | Cápsula **`✎ Editar perfil`** + botón **`☰` menú de servicios**, sobre la portada, arriba a la izquierda | `:228-246` |
| 3 | Identidad **dentro** de la portada: avatar 88 con anillo de estado | `:249-258` |
| 4 | **`EG-ID` + mini-QR**, y al tocarlo abre el modal de QR | `:274-277` |
| 5 | **Ubicación pulsable** → selector internacional país/ciudad | `:279-283` |
| 6 | **Chip de estado 24 h** o botón `+ Agregar estado 24h` | `:286-303` |
| 7 | Stats: Seguidores · Seguidos · Me gusta · **Valoración ★** | `:308-316` |
| 8 | Bio (máx. 3 líneas) dentro de la portada | `:319-321` |
| 9 | **`linksArea`**: chip de **OCUPACIÓN** primero + chips de enlaces **con icono por tipo y PULSABLES** (`Linking.openURL`, `mailto:`, `tel:`) | `:325-353`, estilos `:920-923` |
| 10 | Cuerpo: viaje en curso, accesos rápidos (Publicar / Vender), rejilla 2 columnas | `:360-460` |

**Diferencias concretas (público ← lo que le falta respecto al de cuenta):**

| Elemento del perfil de cuenta | ¿Está en el público? | Evidencia |
|---|---|---|
| `EG-ID` + mini-QR (`profile.tsx:274-277`) | **NO** | `lifebook-user.tsx` no menciona `egId` ni `QrCode` |
| Ubicación **pulsable** (`profile.tsx:279`) | **NO**, es texto plano | `lifebook-user.tsx:318-325` |
| Chip de estado 24 h explícito | **NO**: el estado solo se abre tocando el **anillo del avatar** | `lifebook-user.tsx:299-307` |
| Valoración **como stat** en la fila de 4 | **NO**: va aparte, con estrella | `lifebook-user.tsx:413-419` |
| Chips de enlaces **con icono** | **NO**: chips planos de texto | `lifebook-user.tsx:426-431` |
| Chips de enlaces **pulsables** | **NO** | `lifebook-user.tsx:426-431` usa `<View><Text>`, sin `Pressable` ni `Linking` |
| Portada que crece | **NO**: altura fija 208 | `lifebook-user.tsx:266` |
| Menú `☰` de servicios | **NO** | `lifebook-user.tsx:240-255` |
| Badges de rol verificado | **SÍ en público, NO en cuenta** | `lifebook-user.tsx:326-338` |
| Pestañas + rejilla de contenido | **SÍ en público, NO en cuenta** (cuenta usa rejilla propia) | `lifebook-user.tsx:437-467` |

> **BUG REAL Y CONCRETO (el más importante de la Parte 2).** Los enlaces se **guardan** como `{kind, label, value}` (`/opt/mirror/app/src/mobility/mobility-auth.service.ts:236-247`) y en la cuenta se pintan bien (`profile.tsx:339`, usa `l.value`). Pero el perfil público los lee como si el campo fuera `url`:
> - `app/lifebook-user.tsx:424` → `const url = typeof l === 'string' ? l : (l?.url ?? '');`
> - `app/api/lifebook.ts:309` declara el tipo mal: `links: Array<{ label?: string; url?: string } | string>;`
>
> Resultado: `url` siempre es `''`, el `↗` nunca sale, y **el enlace no es pulsable**. Hoy los enlaces en el perfil público son **decorativos**. El servidor sí devuelve los datos correctos (`lifebook.service.ts:1155`).

### 2.2 Los `links` y `widgets` de `mobility.users` — números reales

**Estructura y edición (servidor):**
- Columnas leídas en `mobility-auth.service.ts:123` (`name_color, widgets, links, created_at`) y devueltas en `:147-148` (`widgets` se fusiona con `DEFAULT_WIDGETS`; `links` se fuerza a array).
- Se **escriben** en el mismo servicio: `widgets` en `:229-234` y `links` en `:236-247`, con el saneado:
  - `widgets`: merge sobre `DEFAULT_WIDGETS`.
  - `links`: filtra vacíos, **`.slice(0, 12)`**, y trunca `kind` a 16, `label` a 80, `value` a **500** caracteres.
- `DEFAULT_WIDGETS` (`mobility-auth.service.ts:26-32`):
  `lifebookPublic: true`, `showStats: true`, `showStore: false`, `showContact: true`, `showQR: true`.

**Datos reales en la BD (consultados ahora mismo):**

| Consulta | Resultado |
|---|---|
| Usuarios totales en `mobility.users` | **11** |
| Usuarios con `links` no vacío | **1** (y ese único array tiene **1 elemento**) |
| Usuarios con `widgets` relleno | **3** |
| Usuarios con `bio` no vacía | **1** |
| `SELECT widgets->>'lifebookPublic'='true'` | **3** |
| Contenido real de los `links` | `[{"kind": "email", "label": "EgRoutePlan", "value": "egrouteplan@gmail.com"}]` |
| Contenido real de los `widgets` | `{"showQR": true, "showStats": true, "showStore": false, "showContact": true, "lifebookPublic": true}` |

**¿Se usan? ¿Desde dónde se editan? ¿Se pintan?**

- **Se editan SÍ**, desde `app/edit-profile.tsx`:
  - Toggles de widgets: `edit-profile.tsx:78-84` (etiquetas: *Life Book público*, *Mostrar estadísticas*, *Mostrar tienda*, *Permitir contacto*, *Mostrar código QR*) y `:575-584` (los `Switch`).
  - Enlaces: `edit-profile.tsx:70-75` (`LINK_KINDS` = Enlace / Correo / Teléfono / Social), UI en `:587-629` con contador **`{links.length}/8`** (`:597`) y el texto *"se mostrarán en tu perfil público (máx. 8)"* (`:602`).
  - Se envían en el guardado: `edit-profile.tsx:272-273`.
  - Tipos y `DEFAULT_WIDGETS` del cliente: `app/api/auth.ts:38-52`, `:71-82`, `:107-108`.
- **Se pintan SÍ**, pero solo los `links`:
  - Perfil de cuenta: `app/profile.tsx:336-352` (**pulsables**, con icono).
  - Perfil público: `app/lifebook-user.tsx:420-434` (**no pulsables**, bug de `url` vs `value`).
- **Los `widgets` NO se usan en NINGÚN sitio.** Comprobado con grep:
  - En el servidor las 5 claves aparecen **solo** en la declaración `DEFAULT_WIDGETS` (`mobility-auth.service.ts:27-31`) y en las copias `.bak`. **Ningún** endpoint, consulta ni condición las lee.
  - En la app, `showStats` / `showStore` / `showContact` / `showQR` / `lifebookPublic` aparecen **solo** en `edit-profile.tsx:79-83` (las etiquetas de los interruptores).
  - **Conclusión: los 5 interruptores son decorativos.** `lifebookPublic: true` en 3 usuarios no hace que nadie sea público ni deje de serlo; no hay ninguna puerta que los lea. Se guardan y se olvidan.
  - **Incoherencia añadida:** el límite de enlaces es **8 en la UI** (`edit-profile.tsx:597,602,724`) y **12 en el servidor** (`mobility-auth.service.ts:239`). Elegir uno.

### 2.3 Los grupos: cómo se entra hoy, y `INVITE_CODE`

**Búsqueda de `INVITE_CODE` (hecha, con resultados):**

| Constante / uso | Ruta:línea |
|---|---|
| `INVITE_CODE_LEN = 6` | `src/lifebook/lifebook.service.ts:232` |
| `INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'` (32 caracteres, sin `I`, `O`, `0`, `1`) | `:233` |
| Error `INVITE_CODE_INVALID` → HTTP 400 | `src/http/error.filter.ts:66` |
| `INVITE_CODE_NOT_FOUND` → HTTP 404 | `:67` |
| `INVITE_CODE_ERROR` → HTTP 400 | `:68` |

**Cómo se entra hoy a un grupo — hay 3 vías:**

1. **Lista/buscador de grupos.** `app/lifebook-groups.tsx` lista grupos (foto, título, nº de miembros, `ciudad · categoría`, descripción) y muestra la condición de entrada como etiqueta (`lifebook-groups.tsx:267-271`):
   - `open` → *"Entrada libre"*
   - `approval` → 🔒 *"Pide entrar"*
   - `question` → 🛡 *"Responde para entrar"*
   Al tocar se abre `GroupCardSheet` (`app/components/lifebook/GroupCardSheet.tsx`), que pide **respuesta** (si es `question`) y/o **nota**, y llama a `lifebookGroupsApi.join()` (`GroupCardSheet.tsx:33`, `:47-54`, `:155-160`, `:211-223`).
2. **Código de ruta (6 caracteres).** Modal *"Tengo un código de ruta"* en `app/lifebook-groups.tsx:293-327`, que llama a `lifebookGroupsApi.byCode(limpio)` (`lifebook-groups.tsx:73`) → `GET /lifebook/groups/by-code/:code`.
3. **Deep link de app.** `groupInviteCode()` devuelve `link: 'egrouteplan://group/${code}'` (`lifebook.service.ts:4655`). El esquema `egrouteplan` **está registrado** (`app.json:5`), pero es un esquema **de app**: no se puede abrir desde WhatsApp, web ni un navegador de escritorio. **No hay URL web pública de grupo.**

**¿Existe algo parecido a un enlace con clave o aprobación? SÍ, y está bastante completo:**

| Pieza | Servidor | Cliente |
|---|---|---|
| **Modos de entrada** `open` / `approval` / `question` (columna `join_mode`) | `lifebook.service.ts:3816-3822` (`GROUP_JOIN_MODES`), validación `assertJoinMeta` `:3834-3836` (si es `question` exige pregunta **y** respuesta) | Selector en `app/lifebook-group-create.tsx:105`, `:119`, `:209-211`, `:476-482`, `:552`; etiquetas en `GroupCardSheet.tsx:74-76` |
| **CLAVE DE ACCESO real** = modo `question`: se guarda `join_answer` y al unirse se compara | `groupJoin()` `lifebook.service.ts:4823-4830`: `if (g.joinMode === 'question' && g.joinQuestion)` → lee `join_answer`, normaliza con `normAnswer()` (`:4810-4812`) y **si coincide entra directo**; si no, la respuesta queda como **solicitud pendiente**. *Ojo:* si el grupo en modo `question` **no tiene** `join_answer` guardada, `:4829` hace `entraDirecto = true` — se comporta como abierto | `GroupCardSheet.tsx:155-160`, `:211-223` |
| **Aprobación del dueño** = modo `approval` (o pregunta fallada) → cola de solicitudes | `groupJoin()` `:4850-4860` inserta en `lifebook.group_join_requests` (`state='pending'`); `groupRequests()` `:4868-4887`; `groupRequestDecide()` `:4896` con `approve`/`reject` | `GroupManageSheet.tsx:130-139` (`lifebookGroupsApi.decide`), `app/api/lifebook.ts:851-853` |
| **Aforo** | **200 miembros** — `groupJoin()` `:4820` (`GROUP_FULL`) y `groupRequestDecide()` `:4907` | — |
| **Código de invitación** | `groupInviteCode()` `:4635-4656`: se genera **perezosamente** la primera vez (8 reintentos por colisión), se guarda en `conversations.invite_code` y se devuelve `{code, title, link}` | `GroupManageSheet.tsx:145-161` (**solo dueño/admins**, `assertGroupRole(..., true)`), copia al portapapeles con el texto *"Únete a mi grupo en EG Route Plan con el código XXXX"* |
| **Quién puede añadir miembros** | `invite_policy` = `'all'` \| `'admins'` (`lifebook.service.ts:3959`, `:4029`, `:4141-4143`) | `app/api/lifebook.ts` |
| **Quitar inactivos** | `sweepInactive` (con `dryRun`) | `GroupManageSheet.tsx:167-203` |

**Números reales de grupos (BD, ahora):**

| Consulta | Resultado |
|---|---|
| Grupos totales (`kind='group'`) | **630** |
| Con `invite_code` generado | **2** |
| Por `join_mode` | `open`: **580** · `approval`: **25** · `question`: **25** |
| Grupos con `visibility='public'` | **65** |
| Grupos públicos **con** `invite_code` | **0** |
| Filas en `lifebook.group_join_requests` | **0** |

> **Lectura de estos números:** el mecanismo de aprobación y de pregunta **existe y está cableado de punta a punta**, pero **nadie lo ha usado todavía** (0 solicitudes) y **el código de invitación solo se ha generado en 2 grupos de 630**. Además **ningún grupo público tiene código**, así que hoy **no existe ni un solo "enlace de grupo" que se pueda fijar**. La función está construida y sin estrenar.

### 2.4 ¿Se puede editar el perfil (bio, enlaces) desde la app? ¿Qué endpoint?

**Sí.** Un único endpoint de actualización sirve para todo (P7/P8):

- Cliente: `app/api/auth.ts:107-108` → `authApi.updateProfile(...)`; payload `UpdateProfilePayload` en `app/api/auth.ts:38-52` (`bio`, `widgets`, `links`, portada, género, fecha, país/ciudad, profesión, escuela, `originalCreator`, `nameColor`).
- Servidor: `mobility-auth.service.ts:195-250` — un solo update que acepta:
  - avatar/portada como dataURL → `saveUserPhoto()` (`:252+`),
  - campos escalares con **truncados por campo**: `bio` **3000**, `gender` 24, `birthDate` 10, `country` 90, `countryCode` 8, `city` 90, `profession` 120, `school` 150, `originalCreator` (enum validado), `nameColor` (validado con regex `^#[0-9A-Fa-f]{6}$`),
  - `widgets` (`:229-234`),
  - `links` (`:236-247`), máximo **12**.
- Pantalla: `app/edit-profile.tsx` (1297 líneas) — `save()` en `:236-273`, con vista previa *"Así te ven los demás"* (`:651-664`).
- **El perfil público NO tiene endpoint propio de edición**: `app/lifebook.ts:464` solo expone `GET /lifebook/users/:userId/profile` (lectura), servido por `lifebook.service.ts:1118-1168`, que **lee `mobility.users.links`** en `:1121` y los devuelve en `:1155` con `.slice(0, 10)`. **Ojo: otro límite distinto — 8 en la UI, 12 al guardar, 10 al mostrar.**

---

## PARTE 3 — PROPUESTA CONCRETA

### 3.0 Principio de diseño

No hay que inventar casi nada nuevo: **lo que falta es cablear lo que ya existe**. Los tres hallazgos que gobiernan la propuesta:

1. Los **enlaces ya llegan al perfil público** (`lifebook.service.ts:1155`) — solo hay que **hacerlos pulsables** y arreglar `url`→`value`.
2. Los grupos **ya tienen** `open` / `approval` / `question` (clave) + aforo 200 + `invite_code` (`lifebook.service.ts:4823-4860`, `:4635-4656`) — el "enlace con o sin clave" **ya está construido en el servidor**.
3. El «fijado» **no existe en ninguna plataforma como "enlaces fijados"** (Instagram solo reordena; 小红书 fija *notas*). Es un diferenciador y hay que diseñarlo nosotros: una **bandera `pinned`** dentro del array `links`, sin cambiar el esquema.

### 3.1 Qué llevar del perfil de cuenta al público (estilo)

| # | Llevar | De | A | Esfuerzo |
|---|---|---|---|---|
| A1 | **Portada que crece** en vez de altura fija 208 | `profile.tsx:205-225` | `lifebook-user.tsx:266` | **S** |
| A2 | **`EG-ID` + mini-QR pulsable** (el QR ya tiene modal en la cuenta) | `profile.tsx:274-277` | cabecera del público, bajo el nombre | **S–M** |
| A3 | **Ubicación pulsable** (hoy es texto muerto) | `profile.tsx:279-283` | `lifebook-user.tsx:318-325` | **S** |
| A4 | **Chip de estado 24 h** explícito (hoy solo el anillo del avatar) | `profile.tsx:286-303` | `lifebook-user.tsx:299-307` | **S** |
| A5 | **Valoración como stat** en la fila de 4 (hoy va suelta) | `profile.tsx:312-315` | `lifebook-user.tsx:343-361` | **XS** |
| A6 | **Chips de enlaces con icono por tipo** (`Mail`/`Phone`/`Globe`/`Link2`) | `profile.tsx:337-351` | `lifebook-user.tsx:426-431` | **XS** |
| A7 | **Chips de enlaces pulsables** (`Linking.openURL`, `mailto:`, `tel:`) | `profile.tsx:339-343` | `lifebook-user.tsx:420-434` | **XS** |
| A8 | Menú `☰` de servicios | `profile.tsx:238-245` | barra flotante del público | **M** |
| A9 | **Mantener** badges de rol verificado, pestañas y rejilla (el público tiene más que la cuenta aquí) | — | — | — |

> A6+A7 juntos son **el arreglo del bug** de `url`/`value`: hay que (a) corregir `app/api/lifebook.ts:309` a `{ kind?: string; label?: string; value?: string }`, (b) `lifebook-user.tsx:424` a `l?.value`, (c) envolver en `Pressable` con el mismo `target` que ya calcula la cuenta. **Es el cambio con mejor relación valor/esfuerzo de todo el documento.**

### 3.2 Cómo se fijarían los enlaces

**Modelo de datos (retrocompatible — no rompe nada):** añadir a cada elemento del array `links` dos campos opcionales. Los arrays ya guardados (1 usuario, 1 elemento) siguen funcionando porque el servidor ya sanea campo a campo en `mobility-auth.service.ts:236-247`.

```jsonc
{
  "kind": "link",              // link | email | phone | social | group  ← 'group' es NUEVO
  "label": "Grupo de vecinos", // 80 car.
  "value": "https://…",        // 500 car. · si kind='group' → el CÓDIGO (6 car.), no una URL
  "pinned": true,              // ← NUEVO. Máx. 3 fijados por persona
  "order": 0                   // ← opcional, para reordenar fijados
}
```

**Reglas:**
- **Máx. 3 fijados** por persona (se fijan los que quieras de los 8). Los fijados salen **en un bloque propio, arriba, justo debajo de los botones de acción y antes de la bio**; el resto siguen como chips.
- Un fijado se pinta **más grande**, tipo tarjeta, con icono, título y subtítulo.
- **Un solo límite de enlaces para todo el sistema: 8.** Hoy hay tres (8 UI / 12 servidor / 10 perfil). Unificarlos en el servidor y hacer que la UI y `userProfile()` respeten el mismo número.

**El enlace de grupo (el caso que pidió el dueño):**
- Nuevo `kind: 'group'` cuyo `value` es el **`invite_code`** del grupo (no una URL).
- Al añadirlo desde `edit-profile.tsx`, en vez de escribir una URL, la persona **elige uno de sus grupos** (los que organiza o administra) de una lista; el cliente pide `lifebookGroupsApi.inviteCode(id)` (`app/api/lifebook.ts:858`), que **ya genera el código si no existe** (`lifebook.service.ts:4639-4651`) y **ya valida que sea dueño/admin** (`assertGroupRole(..., true)`).
- En el perfil público, ese fijado se resuelve con un endpoint **nuevo y ligero**:
  `GET /lifebook/links/resolve/:code` → `{ id, title, photoUrl, membersCount, joinMode, joinQuestion, requiresAnswer, visibility }`
  (reutiliza `groupByCode()` de `lifebook.service.ts:4657-4666`, que **ya existe**).
- Se pinta como **tarjeta**: foto + título + `N miembros` + etiqueta de entrada (*"Entrada libre"* / *"Pide entrar"* / *"Responde para entrar"*, reutilizando los textos de `lifebook-groups.tsx:267-271`) + botón **`Entrar`**.
- Al pulsar `Entrar`: se navega a la ficha del grupo y se usa **`groupJoin()` tal cual** (`lifebook.service.ts:4816-4860`). Ahí está ya resuelto todo:
  - `open` → **entra sin clave**;
  - `question` → se pide la **respuesta = clave de acceso**, comparada normalizada (`:4824-4830`);
  - `approval` → **queda pendiente de que el dueño apruebe** (`:4850-4860`), y el dueño lo ve en `GroupManageSheet` (`:130-139`).
- **Con clave o sin ella, por tanto, no requiere backend nuevo de seguridad: es la bandera `join_mode` del propio grupo.** La persona que fija el enlace elige el modo al crear/editar el grupo (`lifebook-group-create.tsx:476-482`), y el fijado solo lo muestra.

**Por pasos:**

| Paso | Qué | Ficheros | Esfuerzo |
|---|---|---|---|
| **P1** | ~~Arreglar el bug~~ **Arreglar los enlaces**: tipo `{kind,label,value}` en `api/lifebook.ts:309`, leer `l?.value` y envolver en `Pressable`+`Linking` en `lifebook-user.tsx:420-434`. Unificar límite a 8 | `app/api/lifebook.ts`, `app/lifebook-user.tsx`, `mobility-auth.service.ts`, `lifebook.service.ts` | **XS (medio día)** |
| **P2** | **Fijado**: `pinned` en el saneado de `links` (máx. 3), UI de "📌 Fijar" y reordenar en `edit-profile.tsx`, bloque de fijados en el perfil público | `mobility-auth.service.ts:236-247`, `edit-profile.tsx:587-629`, `lifebook-user.tsx` | **S–M (2-3 días)** |
| **P3** | **Enlace de grupo**: `kind: 'group'`, selector de grupos en `edit-profile.tsx` usando `inviteCode()`, endpoint `GET /lifebook/links/resolve/:code`, tarjeta con etiqueta de entrada en el perfil público | `lifebook.controller.ts`, `lifebook.service.ts:4657`, `edit-profile.tsx`, `lifebook-user.tsx` | **M (4-5 días)** |
| **P4** | **URL web del grupo** (sustituir `egrouteplan://group/CODE`): landing `https://…/g/CODE` que ofrezca *abrir en la app* o *descargar*. Hoy `link` es un esquema de app (`lifebook.service.ts:4655`, `app.json:5`) inservible fuera del teléfono | backend + landing | **M–L (1 semana)** |
| **P5** | **Estilo del perfil de cuenta → público**: A1–A8 de la tabla 3.1 | `app/profile.tsx` (como fuente), `app/lifebook-user.tsx` | **M (3-4 días)** |
| **P6** | **Hacer que los `widgets` sirvan o quitarlos.** Recomendación: que `lifebookPublic` sea de verdad una puerta (si es `false`, `userProfile()` devuelve 403 para no-seguidores) y `showStats` oculte la fila de stats. Hoy son 5 interruptores muertos (`mobility-auth.service.ts:27-31`, `edit-profile.tsx:79-83`) | `lifebook.service.ts:1144-1167`, `mobility-auth.service.ts` | **S (1-2 días)** |

**Total estimado: ~3 semanas de una persona** para P1–P6; **P1+P2 solos (≈3-4 días)** ya dan al dueño lo que pidió para enlaces propios, sin tocar grupos.

### 3.3 Anti-spam y venta de accesos (lo que Telegram hace y nosotros podemos copiar)

Aplicado a lo que ya tenemos:

| Riesgo | Mecanismo a usar | Ya existe |
|---|---|---|
| El código de 6 caracteres se difunde y entra gente a saco | **Aforo 200** (`lifebook.service.ts:4820`) | ✅ |
| Quiero controlar quién entra | **`join_mode = approval`** con cola de solicitudes | ✅ (`:4850-4860`, `:4896`) |
| Quiero una clave sin aprobar a mano | **`join_mode = question`** (la clave es la respuesta, comparada normalizada) | ✅ (`:4824-4830`) |
| El enlace se filtra | **`invite_code` regenerable** (hoy la lógica solo lo genera si no existe; habría que añadir "regenerar" y revocar el anterior) | ⚠️ **parcial** |
| Caducidad / límite de usos | **NO existe**: `invite_code` es permanente y sin `expire_date` ni `member_limit` (a diferencia de Telegram) | ❌ **a construir (P7, `M`)** |
| Fuerza bruta del código | Throttler global: **100 req/60 s** (`src/http/app.module.ts:51`). **No hay `@Throttle` específico en `groups/by-code/:code`** (solo lo hay en auth: `auth.controller.ts:54,65,80`, `mobility-auth.controller.ts:99-136`). 6 caracteres de 32 → 32⁶ ≈ 1,07·10⁹ combinaciones, así que a 100/min por IP es inviable, pero conviene un `@Throttle` más estricto (p. ej. 10/min) por higiene | ⚠️ **mejorable** |
| Enseñar el grupo en un perfil sin permiso | `groupByCode()` (`:4657-4666`) devuelve la ficha de **cualquier** grupo con ese código, sea `public` o `private` | ⚠️ **a revisar** |

**Reglas de producto que recomiendo, copiando a Telegram:**
1. **El `invite_code` no debe mostrarse en el perfil como texto plano**, sino como el **token** que abre la tarjeta. Así el visitante no ve el código para reenviarlo a 500 personas.
2. Añadir al crear/editar el fijado: **caducidad** (nunca / 7 días / 30 días) y **límite de usos**, siguiendo la estructura de Telegram (`expire_date`, `member_limit`). Es lo que evita que un enlace del perfil se convierta en la puerta de entrada del spam.
3. **Etiqueta de entrada visible** en la tarjeta (`Entrada libre` / `Pide entrar` / `Responde para entrar`): evita el problema que documenta CRMChat, donde la gente cree que el enlace "falló" cuando en realidad **espera aprobación**.
4. **Nunca un enlace de grupo en perfiles que no administres**: validar en el servidor que quien fija un grupo sea **owner o admin** — `assertGroupRole(userId, convId, true)` ya lo hace (`lifebook.service.ts:4636`).

---

## 4. LO QUE NO HE PODIDO VERIFICAR

**De las plataformas (Parte 1):**
1. **Instagram:** no he encontrado **ninguna página oficial** (`help.instagram.com`) sobre los 5 enlaces de la bio. El dato viene de prensa (TechCrunch, PCMag) y blogs. **No he verificado** si el límite sigue siendo 5 hoy, ni con qué criterio exacto una cuenta no puede poner enlace.
2. **小红书:** no hay **nada oficial** indexado. En particular **no he podido verificar**: el número de notas fijadas (el "3" es consenso de tutoriales), si el grupo de fans tiene clave/aprobación/aforo, ni **el listado de qué partes del perfil son configurables** (no lo he encontrado en absoluto, no lo relleno).
3. **WeChat:** los "7 días" del QR, el ajuste **群聊邀请确认** y los límites de miembros (**500** / **200**) provienen de blogs y agregadores. **No he localizado la página oficial de Tencent** que los confirme. **No he encontrado ninguna clave de acceso por contraseña** en grupos de WeChat: el control parece ser solo QR + invitación + confirmación.
4. **Telegram:** los campos `expire_date`, `member_limit`, `creates_join_request`/`request_needs_approval` los he dado por buenos a partir de la **documentación de la librería** (que refleja el Bot API), **no he abierto telegram.org directamente**. Los espejos de la FAQ (`telegramapp.github.io`) **no son la fuente oficial**.
5. **Venta de accesos como tal:** **no he encontrado ninguna política oficial específica** sobre vender entradas a grupos. Lo verificado es el conjunto de mecanismos anti-spam (límites, reportes, bots), no una norma que prohíba cobrar por el acceso.

**De nuestra app (Parte 2):**
6. **Cuerpo de las páginas web:** las búsquedas devolvieron títulos y URLs, no el texto. Donde solo tenía el titular, lo he marcado.
7. **`links` y `widgets` en la app:** he verificado el **flujo de escritura y de lectura** por grep y lectura. **No he ejecutado la app ni ninguna petición HTTP real** (no he usado `adb` ni el teléfono, como se pidió), así que **no he comprobado en pantalla** el comportamiento del perfil público ni el del modal *"Tengo un código de ruta"*. El bug `url`/`value` lo afirmo por lectura de código: `edit-profile.tsx` guarda `value` (`:273`) y `lifebook-user.tsx:424` lee `l?.url`.
8. **Nº exacto de usuarios que ven el perfil público:** solo sé que `widgets.lifebookPublic` es `true` en **3** usuarios, y que ese valor **no lo lee nadie**. **No he podido determinar cuántos perfiles son realmente visitables**, porque no existe tal condición en el código.
9. **Esquema de URL pública:** **no he verificado** si existe un dominio web de EG Route Plan que pueda servir la landing `/g/CODE` de P4 (no lo he buscado). `app.json:5` solo confirma el esquema de app `egrouteplan`.
10. **Números de grupos:** **630 / 2 / 25 / 25 / 580 / 65 / 0** son de la BD `egrouteplan` **ahora mismo**. Si esa base es de producción o de un entorno de pruebas, **no lo he comprobado**.
11. **`join_answer` en claro:** he visto que se guarda en `lifebook.conversations.join_answer` y se compara con `normAnswer()`. **No he verificado si está hasheada** — por lo que leí, se guarda y compara en claro (comparación normalizada de texto), lo cual es aceptable para una clave de acceso a un grupo, pero **conviene confirmarlo** antes de llamarlo "clave segura".
12. **Rendimiento de la propuesta:** **no he medido** el coste del endpoint `GET /lifebook/links/resolve/:code` ni el impacto de pintar tarjetas de grupo en `ListHeaderComponent`, que se re-renderiza con el perfil.

---

## Anexo — Índice de evidencias de código

| Afirmación | Ruta:línea |
|---|---|
| `DEFAULT_WIDGETS` (5 widgets) | `/opt/mirror/app/src/mobility/mobility-auth.service.ts:26-32` |
| `widgets` y `links` se leen y se devuelven | `mobility-auth.service.ts:123`, `:147-148` |
| `widgets` se escribe (merge) | `mobility-auth.service.ts:229-234` |
| `links` se escribe (máx. 12, truncados) | `mobility-auth.service.ts:236-247` |
| `bio` máx. 3000, `nameColor` con regex | `mobility-auth.service.ts:203`, `:214-217` |
| El perfil público lee `mobility.users.links` | `/opt/mirror/app/src/lifebook/lifebook.service.ts:1121`, `:1143`, `:1155` (`.slice(0,10)`) |
| Endpoint público de perfil (solo lectura) | `src/lifebook/lifebook.controller.ts:639-642` · `app/api/lifebook.ts:464` |
| `INVITE_CODE_LEN=6`, alfabeto de 32 | `src/lifebook/lifebook.service.ts:232-233` |
| Códigos de error `INVITE_CODE_*` | `src/http/error.filter.ts:66-68` |
| `groupInviteCode()` → `{code,title,link:'egrouteplan://group/X'}` | `src/lifebook/lifebook.service.ts:4635-4656` |
| `groupByCode()` | `src/lifebook/lifebook.service.ts:4657-4666` |
| `groupJoin()`: modos, pregunta, aforo 200, solicitud | `src/lifebook/lifebook.service.ts:4816-4860` |
| `groupRequests()` / `groupRequestDecide()` | `src/lifebook/lifebook.service.ts:4868-4887`, `:4896` |
| `join_mode` / `join_question` / `join_answer` (validación) | `src/lifebook/lifebook.service.ts:3816-3822`, `:3834-3836` |
| `invite_policy` (`all`/`admins`) | `src/lifebook/lifebook.service.ts:3959`, `:4029`, `:4141-4143` |
| Endpoints de grupos | `src/lifebook/lifebook.controller.ts:1159-1330` |
| Throttler global 100/60 s | `src/http/app.module.ts:51` |
| `@Throttle` (solo auth, **no** en grupos) | `src/http/auth.controller.ts:54,65,80` · `src/mobility/mobility-auth.controller.ts:99-136` |
| Perfil público: secciones y líneas | `D:\egapp\app\lifebook-user.tsx:240-483` |
| Perfil público: enlaces **no pulsables** y bug `url` | `D:\egapp\app\lifebook-user.tsx:420-434` (línea 424) |
| Tipo `LbProfile.links` incorrecto | `D:\egapp\api\lifebook.ts:309` |
| Perfil de cuenta: estilo "propio" | `D:\egapp\app\profile.tsx:205-353` |
| Perfil de cuenta: enlaces **pulsables** con icono | `D:\egapp\app\profile.tsx:336-352` |
| Editor: `LINK_KINDS`, toggles de widgets, contador 8 | `D:\egapp\app\edit-profile.tsx:70-75`, `:78-84`, `:587-629` |
| Editor: payload `widgets` + `links` | `D:\egapp\app\edit-profile.tsx:272-273` |
| Tipos de perfil del cliente | `D:\egapp\api\auth.ts:38-52`, `:71-82`, `:107-108` |
| API de grupos del cliente (join, requests, inviteCode, byCode) | `D:\egapp\api\lifebook.ts:839-870` |
| Entrar con código (modal "Tengo un código de ruta") | `D:\egapp\app\lifebook-groups.tsx:73`, `:293-327` |
| Etiquetas de modo de entrada en la lista | `D:\egapp\app\lifebook-groups.tsx:267-271` |
| `GroupCardSheet`: respuesta/pregunta/nota | `D:\egapp\components\lifebook\GroupCardSheet.tsx:33`, `:47-54`, `:74-76`, `:155-160`, `:211-223` |
| `GroupManageSheet`: código, copiar, aprobar, inactivos | `D:\egapp\components\lifebook\GroupManageSheet.tsx:130-203` |
| Esquema de app `egrouteplan` | `D:\egapp\app.json:5` |

---

## Enlaces de grupo (P3)

El caso que se pidió fijar —«el enlace de mi grupo»— tiene su propio documento, porque
trae caducidad y su propia verificación: **`docs/ENLACE-DE-GRUPO-EN-EL-PERFIL.md`**.

Resumen de lo que cambia respecto a lo de arriba:

* Un enlace de tipo `group` **no es una dirección**: su `value` es el **CÓDIGO** del
  grupo (6 caracteres), y el código **caduca a los 7 días** (antes no caducaba nunca, y
  un código eterno publicado en un perfil es un agujero).
* En el editor se elige con un selector (**solo grupos donde soy dueño o administrador**,
  que son los únicos que pueden sacar código); nace **fijado** si queda sitio de los 3.
* En el perfil público **no se pinta como chip**: va en **tarjeta** con la foto del grupo,
  el nombre y «N miembros · toca para entrar». Si el código caducó, la tarjeta sale
  apagada y lo dice en vez de llevar a un grupo que ya no existe.

