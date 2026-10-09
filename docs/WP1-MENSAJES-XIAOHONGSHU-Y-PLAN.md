# WP1 — Mensajes: qué hace 小红书, qué tienes hoy, y plan por tandas

**Foco 1 de la campaña de ingeniería inversa sobre LifeBook.**
Fecha: 2026-10-09 · Referencia: 小红书 9.49.1 (`com.xingin.xhs`, SHA-256 `80b77fa7…f2a6e`)

---

## 0. Cómo leer esto, y de dónde sale cada dato

| Etiqueta | Qué significa |
|---|---|
| **[APK]** | Evidencia primaria del APK de 小红书 descompilado. Nombres de clase, ficheros y cadenas reales |
| **[CÓDIGO]** | Evidencia del repo de LifeBook (`D:\egapp`), con ruta y línea |
| **[INFERENCIA]** | Lectura razonada; no es un hecho observado |
| **[NO VERIFICADO]** | No lo he podido comprobar. **No se usa para decidir** |

**Lo que este documento NO hace:** copiar la interfaz de 小红书. El objetivo es quedarse con los
**patrones** y descartar lo que no encaja con LifeBook.

---

## 1. Lo que hace 小红书 — evidencia de la app real

### 1.1 El reparto de primer nivel: **cinco destinos**

Sacado de los *tiles* de ajustes rápidos que declara la propia aplicación en su manifiesto
(`com.xingin.im.qs.*TileService`) **[APK]**:

| Destino | Qué es |
|---|---|
| `Message` | 私信 — chat privado |
| `Stranger` | 陌生人 — mensajes de quien **no** sigues |
| `GroupSquare` | 群广场 — descubrir grupos |
| `LikeCollect` | 赞和收藏 — me gusta y guardados |
| `CommentAt` | 评论和@ — comentarios y menciones |

**El patrón: social frente a retroalimentación.** Los tres primeros exigen respuesta; los dos
últimos solo informan.

> Este hallazgo **cierra el punto 1 de §5.1** de `docs/ORGANIZACION-LIFEBOOK-XIAOHONGSHU.md`, que
> solo podía apoyarlo en prensa de 2021 y avisaba de que aquel rediseño se había revertido.

### 1.2 Las **54 tarjetas de comercio dentro del chat**

Cada una es un fichero de diseño propio en `assets/dsl/bcim_chat_*` **[APK]**. Es el catálogo
completo de lo que 小红书 mete en una conversación:

| Familia | Tarjetas |
|---|---|
| **Ciclo del pedido** | `order` · `confirmorder` · `askconfirmorder` · `promptorder` · `urgepay` · `urgingdelivery` · `userconfirmcancelorder` · `packagecancel` · `syscanceledqueue` |
| **Dinero** | `coupon` · `couponcardv2` · `couponclaim` · `redpacket` · `smallpayment` · `usebeforepaidcard` · `transferseller` |
| **Logística** | `logisticorder` · `logisticagent` · `logisticqueuetips` · `negotiatedelivery` |
| **Postventa y disputa** | `returnapply` · `minorrefund` · `aftersalecard` · `aftersalestatus` · `damage` · `violateitem` · `evidence` |
| **Relación** | `fan_club` · `inviterating` · `certitem` · `isvoption` |
| **Contenido** | `note` · `video` · `linkcard` · `landingpage` · `file` · `goodsshoppingguide` |
| **Agente y ayuda** | `agentstreamreply` · `cswelcomemsg` · `richhinttoc` · `commonhint` · `buttonhint` |
| **Compuestas** | `composite` · `compositeoption` · `intention` |

**Lección de producto:** no hay *una* tarjeta de producto. Hay **un lenguaje**: cada estado del
pedido tiene su ficha, y la conversación es el hilo donde ocurren. Eso es lo que hace que el chat
sea comercio y no un chat con un enlace pegado.

### 1.3 La barra de opciones del chat

Cadenas reales asociadas a acciones sobre una conversación **[APK]**:

`Chat Settings` · `Clear chat history` · `Clear chat history and delete chat from chat list` ·
`Mark as read` / `Mark as unread` · `Mute` · fijar y desfijar · `Add to Group` ·
`Block` · **`Block merchants`** · `Block and report` · `Report`

Dos detalles que dicen mucho:

- Existe **`Block merchants`** separado de `Block`: el comercio tiene su propio silenciado.
- El borrado tiene **dos niveles**: borrar el historial, o borrarlo *y* sacar la conversación de la lista.

### 1.4 Todo lo que trae el módulo de mensajería

Actividades declaradas en el manifiesto **[APK]** — es la lista de lo que un chat maduro acaba teniendo:

| Capacidad | Evidencia |
|---|---|
| Respuestas rápidas | `im.quickreply.QuickReplyActivity` |
| Notas fijadas en el chat | `im.stickynote.StickyNoteEditActivity` |
| Temas de conversación | `im.firework.FireworkThemePanelActivity` |
| Check-in dentro del chat | `im.checkin.CheckInPostActivity` |
| Llamadas de voz | `im.voiceservice.ChatVoiceCallForegroundService` |
| **Capa de desconocidos** con ajustes y su compositor | `StrangerMsgActivity` · `StrangerMsgSettingActivity` · `StrangerMsgSettingComposeActivity` |
| Administración de grupo | admins (añadir/quitar), `GroupChatMemberActivity`, `GroupChatNameActivity`, anuncios |
| Votaciones de grupo | `GroupVoteHistoryActivity` · `GroupPostVoteActivity` · `GroupVoteDetailActivity` |
| Grupos de fans con aprobación | `FansGroupJoinApproveActivity` · `FansGroupInviteActivity` · `RobotJoinApproveActivity` |
| Chat en vivo dentro del grupo | `GroupChatLiveChatManagerAct` |
| Privacidad de mensajes | `matrix.setting.privacy.message.PrivacyMessageSettingsActivity` |
| Buscar dentro de los mensajes | actividades de búsqueda de `im` |

---

## 2. Lo que tienes hoy en LifeBook — evidencia del código

### 2.1 `app/lifebook-messages.tsx` (454 líneas)

Ya resuelto y **bien pensado** **[CÓDIGO]**:

- **Cabecera sin título** y 5 acciones: buscar en mensajes · crear grupo · descubrir grupos · añadir amigo · escanear (`:106-140`).
- **3 atajos de bandeja con contador** (me gustas/guardados · seguidores · comentarios y @).
- **Filtro `all | unread | chats | groups`** (`:67`) — el reparto chat/grupos **ya está hecho**.
- Filas con avatar, nombre, `lbTimeAgo`, última línea, «Escribiendo…», contexto de publicación y badge de no leídos.
- Pull-to-refresh, estados de carga/error/vacío, refresco al enfocar.
- El **avatar del dueño ya se movió aquí** por petición tuya (`:60-66`).

### 2.2 El contrato de datos ya es rico — `api/messages.ts` (30 KB)

Define tipos para **[CÓDIGO]**:

`LbMessagePostRef` · `LbMessageFileRef` · `LbMessageLocationRef` · `LbMessageVoteRef` ·
`LbMessageJoiner` · `LbMessageChainRef` · `LbMessageCheckinRef` · `LbMessageAdRef` ·
**`LbMessageProductRef`** · `LbMessageOrderItem` · **`LbMessageOrderRef`** · `LbChatAction`

Bandejas: `likes | followers | comments`. Grupos: `LbGroupMember`, `LbGroupMeta`, `LbGroupCreated`.

**Traducción: el backend ya sabe mandar tarjetas de producto y de pedido.** El modelo está.

### 2.3 **El hallazgo: 20 de 34 componentes de mensajería están sin cablear**

Censo por importación sobre 417 ficheros del repo (excluidos `node_modules`, `android`, `.git`, `pruebas`) **[CÓDIGO]**:

**En uso (14):**

| Componente | Ficheros que lo importan |
|---|---|
| `PostCard` | 6 |
| `ReportSheet` | 3 |
| `Chip` | 3 |
| `SelectorDeCupon` · `SelectorDeProductos` · `ProductoCard` · `LocationPickerSheet` | 2 |
| `messaging-sheets` · `GroupCardSheet` · `SeguirViendo` · `CommentsSheet` · `VideoCoverSheet` · `AvatarsSeguidos` · `BotonCucucul` | 1 |

**SIN USO (20) — construidos y nunca conectados:**

```
ChatOptionsSheet      ChatPlusPanel         OrderCardEnChat      OrderSheet
ProductoEnChatSheet   SelectorDeVariante    AdSheet              TarjetaAnuncio
VoteSheet             CheckinSheet          ChainSheet           CreateGroupSheet
GroupManageSheet      ChallengePlazaSheet   AsistenteDeTalla     RuletaVertical
PersonRow             PublicacionTarjeta    ZoomableImage        ViewerControls
```

Verificado: `OrderCardEnChat`, `ChatOptionsSheet`, `ChatPlusPanel`, `ProductoEnChatSheet` y `VoteSheet`
tienen **2 menciones cada uno, ambas dentro de su propio fichero**. `CreateGroupSheet` tiene 4: dos
suyas y dos del reexport de `messaging-sheets.tsx` — **que nadie importa**.

> **Fíjate en qué está huérfano:** la barra de opciones del chat, el panel «+», la tarjeta de pedido
> en el chat, la hoja de producto en el chat y el selector de variante. Es decir, **exactamente lo
> que echas de menos**. No falta construirlo: falta conectarlo.

---

## 3. El hueco real (esto cambia el plan)

LifeBook **no tiene un problema de «no existe»**. Tiene tres huecos distintos, y se arreglan de forma distinta:

| Tipo de hueco | Ejemplo | Coste |
|---|---|---|
| **(a) Construido y huérfano** | los 20 componentes sin importar | **Bajo** — cablear y verificar |
| **(b) Construido y a medias** | «contexto de publicación… hoy llegan vacíos» (`lifebook-messages.tsx:10-11`) | **Medio** — depende del servidor |
| **(c) Genuinamente inexistente** | capa de desconocidos con ajustes propios | **Alto** |

**Consecuencia para el plan:** la primera tanda **no construye nada**. Rescata lo que ya está pagado.

---

## 4. Propuesta adaptada a tu estilo

### 4.1 Reglas que se respetan (las de tu casa)

- Tokens del kit siempre; **nada de hexadecimales sueltos** — la guardia `npm run diseno` no puede subir (`hex 190 · fontSize 3009 · borderRadius 1257`).
- Primitivas existentes: `Sheet`, `EmptyState`, `InlineError`, `Aviso`, `Tactil`, `MasOpciones`, `Precio`, `ScreenHeader`.
- **No se toca** `api/lifebook.ts` ni `components/FloatingFooter.tsx`.
- Una cosa por tanda: cambio → `tsc` → guardia → compilar → instalar → comprobar en el aparato.
- Se dice **lo que no se ha podido verificar**.

### 4.2 Qué se toma de 小红书 y qué no

| Patrón de 小红书 | Decisión para LifeBook |
|---|---|
| Separar social de retroalimentación | **Se toma.** Ya está a medias (3 bandejas + filtro chat/grupos) |
| Barra de opciones del chat | **Se toma**, con menos acciones: silenciar, fijar, borrar historial, bloquear, reportar |
| Tarjetas de comercio en el chat | **Se toma el patrón, no las 54.** LifeBook necesita: pedido, producto, cupón, envío y devolución |
| Capa de desconocidos | **Se toma** (es seguridad de usuario, no adorno) |
| Grupos como destino propio | **Se toma.** Ya existen `/lifebook-groups` y `/lifebook-group-create` |
| 54 tarjetas completas | **No se copia.** Es el catálogo de una empresa de comercio con 10 años |
| Moneda, club de fans, regalos | **Fuera de este WP.** Es monetización, no mensajería |
| Aspecto visual, iconos, tipografía | **No se copia.** Tu kit manda |

---

## 5. Plan de implementación por tandas

Cada tanda es **una cosa**, verificable en el aparato antes de commitear.

### T0 — Diagnóstico y decisión sobre los huérfanos *(sin tocar código de producto)*

- **Qué:** clasificar los 20 componentes sin uso en **rescatar / retirar / dejar en espera**, con motivo escrito.
- **Salida:** una tabla en el informe de diseño.
- **Por qué primero:** planificar construir algo que ya existe es el error más caro que se puede cometer aquí.
- **Verificación:** ninguna en aparato (es análisis).

### T1 — La barra de opciones del chat *(la más barata y la que más se nota)*

- **Qué:** cablear `ChatOptionsSheet` (ya existe) en la pantalla de conversación, con: silenciar · fijar · marcar leído/no leído · borrar historial · borrar y sacar de la lista · bloquear · reportar.
- **Ficheros:** la pantalla de chat + `components/lifebook/ChatOptionsSheet.tsx`.
- **Reutiliza:** `Sheet` del kit, `ReportSheet` (ya en uso).
- **Verificación en aparato:** abrir la hoja, comprobar los ítems con `uiautomator` y que las acciones de borrado piden confirmación.
- **No entra:** acciones que escriban de verdad en el backend del dueño sin su permiso.

### T2 — El panel «+» del chat

- **Qué:** cablear `ChatPlusPanel` (ya existe) con las acciones que el backend ya soporta.
- **Verificación:** abrir/cerrar, foco, botón atrás.

### T3 — Tarjetas de comercio en el chat *(el núcleo del WP)*

- **Qué:** conectar `OrderCardEnChat`, `OrderSheet`, `ProductoEnChatSheet`, `SelectorDeVariante` y `ProductoCard` sobre los tipos que **ya existen** (`LbMessageOrderRef`, `LbMessageProductRef`).
- **Orden interno:** producto → pedido → cupón → envío → devolución. Una tarjeta por sub-tanda.
- **Verificación:** con un pedido real de la cuenta; medir `bounds`.
- **Riesgo alto:** es donde más se puede romper. Va después de T1 y T2, que son baratas y dan confianza.

### T4 — Completar el reparto social / retroalimentación

- **Qué:** (a) grupos como destino, no solo filtro; (b) rellenar el «contexto de publicación» que hoy llega vacío; (c) revisar los 3 atajos de bandeja.
- **Depende de:** el servidor, para (b).

### T5 — Capa de desconocidos

- **Qué:** mensajes de quien no sigues, con ajustes propios (patrón `StrangerMsg*` de 小红书).
- **Depende de:** **backend nuevo**. Es la única pieza de este WP que no se puede hacer solo con la app.

### T6 — Verificación contra la referencia

- **Qué:** repasar cada decisión abierta de §5.1 del documento de organización y marcarla
  confirmada / refutada / sigue sin verificarse.

---

## 6. Lo que NO se copia, dicho por escrito

- La **estética**: colores, tipografía, iconos y espaciados son los tuyos.
- Las **54 tarjetas**: se toman cinco, las que tu comercio necesita.
- El **modelo de negocio** (monedas, club de fans, regalos): fuera de este WP.
- Los **textos**: se escriben en tu tono, no se traducen los suyos.

---

## 7. Método y evidencias

**Comandos reproducibles** (el APK y su descompilado están en `D:\Tools\rea-analysis`):

```powershell
# Reparto de primer nivel y actividades del modulo de mensajeria
Select-String -LiteralPath '<apk>\AndroidManifest.xml' -Pattern 'com\.xingin\.im\.(qs\.[A-Za-z]+TileService|ui\.activity\.)'

# Catalogo de tarjetas de comercio en el chat
Get-ChildItem '<apk>\assets\dsl' -Directory | Where-Object { $_.Name -match '^bcim_chat_' }

# Cadenas de acciones del chat
#   res/values/strings.xml -> mute, pin, clear chat history, block…

# Censo de uso de los componentes de mensajeria de LifeBook
Get-ChildItem 'D:\egapp' -Recurse -File -Include *.tsx,*.ts |
  Where-Object { $_.FullName -notmatch 'node_modules|android|\.git|pruebas' } |
  Select-String -Pattern 'components/lifebook/<Componente>'
```

**Límites que hay que tener presentes:**

- El análisis de 小红书 es **estático**: no se ha ejecutado la app en esta fase. Describe lo que el
  cliente **soporta**, no una sesión observada.
- Parte de esa interfaz es **dirigida por servidor** (304 ficheros DSL lo demuestran). El **orden
  concreto** de algunas pantallas puede venir del servidor y **no ser determinable offline**.
- El censo de componentes es **por importación estática**. Un `require` dinámico no aparecería; en
  React Native es improbable, pero no imposible.
- Alguno de los 20 huérfanos puede ser **trabajo en curso a propósito**. Por eso T0 los clasifica
  contigo antes de tocarlos.
