# WP2 — Tarjetas de ENTREGA y CUPÓN, y el entorno de mensajes: 小红书 vs LifeBook

**Fecha:** 2026-10-24 · **Referencia:** 小红书 9.49.1 (`com.xingin.xhs`), descompilado en
`D:\Tools\rea-analysis` · **WP previo:** `docs/WP1-MENSAJES-XIAOHONGSHU-Y-PLAN.md` (rama
`docs/wp1-mensajes-re-y-plan`).

**Etiquetas de evidencia:** **[APK]** fichero real del descompilado · **[CÓDIGO]** repo de LifeBook ·
**[INFERIDO]** lectura razonada.

---

## 0. Qué se ha construido en esta tanda

1. **`confirmacion-entrega`** — tarjeta nueva, no existía en LifeBook.
   `components/lifebook/tarjetas/TarjetaConfirmacionEntrega.tsx` + registro `'confirmacion-entrega'`.
   Emitida por el servidor al **salir «en camino»** (si el pedido tiene código de contra entrega) y
   al **confirmar la entrega con código**.
2. **Flujo de CUPÓN en el chat** — al reclamar un cupón, el servidor manda la tarjeta `cupon`
   (ya existía el componente, faltaba el flujo) al chat comprador↔tienda.
3. Ambas cosas van en el mismo APK y el mismo paquete de backend que esta campaña.

---

## 1. El entorno de mensajes: qué monta 小红书 y qué tenemos

### 1.1 Cómo despacha 小红书 un mensaje a su tarjeta (cadena de 3 saltos)

**[APK]** El despacho no es "un tipo por tarjeta": es una cadena de tres saltos, verificada sobre el
descompilado:

1. **Tipo de mensaje** — `XYBCIMMessageType` (`contentType` numérico → nombre).
2. **Mapa de despacho** — `defaultTesseractURLMapper` (`XYBCIMMessageType.java:369`) produce la URL
   `xhsdiscover://tesseract?type=luke&bundleId=bcim_chat_<nombre>_<N>`. **El sufijo numérico del
   directorio ES el `contentType`** (verificado 20/20).
3. **Render** — modelo intermedio `TesseractCard` (15 campos, `MessageUIModel.java:1088`) →
   `TesseractViewHolder.q0` (`:226-429`): exige `cardName`, valida `cardType ∈ {luke, native, rn, h5}`
   (soporta `luke` y `native`), inyecta `_dynamicContext` en `data`, reutiliza la instancia si coincide
   `(cardType, cardName)` y registra `card_render_failed` con `rawContentType` + "3001".

**[APK] Cartas SIN actualizar la app:** la config `bcim_chat_luke_card_registry` trae
`LukeCardEntry(contentType, bundleId, minVersionCode, minTemplateVersion, enable)`; filtra por
`enable` y versión semver (`y9c/b.java:111-125`) y las inyecta como `type=luke`. Por eso la referencia
puede añadir una tarjeta nueva sin publicar APK.

**[APK] 55 bundleId `bcim_chat_*` en el mapa, 54 con directorio local**: falta
`bcim_chat_smartbotcompositeoption_80`, que se sirve **remoto**. Eso explica el "54 tarjetas" del
inventario de WP1.

**[APK]** Los datos llegan por un sobre común: `content.data.content.*` (más `property.*` para el
contexto, p. ej. `property.senderType`). Es decir: **un lenguaje de tarjetas**, no un tipo de
mensaje por tarjeta — el patrón que LifeBook ya copió con `cardRef { cardType, payload }` +
`components/lifebook/tarjetas/registro.tsx` + `minAppVersion`.

**[INFERIDO]** El despacho concreto (qué tarjeta para cada hecho) es **dirigido por servidor**; el
orden de pantallas no es determinable offline (ya lo avisaba WP1 §7).

**La diferencia que importa para LifeBook:** nuestro registro vive **en la app**; el de 小红书 puede
**empujarse por servidor** (`luke_card_registry`). El equivalente sería un registro remoto con
`{ cardType, minAppVersion, payload-version }` — el campo `minAppVersion` de `cardRef` ya está
preparado para eso.

### 1.2 Comparación de familias

| Familia 小红书 | Ejemplos [APK] | En LifeBook hoy [CÓDIGO] | Estado |
|---|---|---|---|
| Texto / imagen / vídeo / fichero / enlace | kinds IM + `video_73`, `file_17`, `linkcard_100` | `CHAT_KINDS`: `text,image,post,sale,product,file,location,vote,chain,checkin,ad` | **Cubierto** |
| Ciclo del pedido | `order_3`, `confirmorder_72`, `askconfirmorder_71`, `promptorder_108`, `urgepay_121`, `urgingdelivery_109`, `userconfirmcancelorder_62`, `packagecancel_61` | `pedido` (TarjetaPedido), `pedido-logistico`, `cancelacion`, **`confirmacion-entrega` (nueva)** | **Casi cubierto**; faltan urgencias (`urgepay`, `urgingdelivery`) |
| Dinero / cupones | `coupon_19`, `couponcardv2_222`, `couponclaim_112`, `redpacket_124`, `smallpayment_50`, `usebeforepaidcard_211`, `transferseller_81` | `cupon`, `cupon-compacto`, `cupon-reclamar` (componentes **ya existían**), `cobro`, `enlace-boton` | **Cubierto ahora** (flujo de cupón emitido); faltan sobre/redpacket/transfer |
| Logística | `logisticorder_215`, `logisticagent_223`, `logisticqueuetips_218`, `negotiatedelivery_104` | `pedido-logistico`, `entrega-negociada` | **Parcial** (no hay agente logístico ni cola de reparto) |
| Postventa / disputa | `returnapply_74`, `minorrefund_214`, `aftersalecard_123`, `aftersalestatus_128`, `evidence_220`, `damage_111`, `violateitem_219` | `postventa`, `postventa-estado`, `solicitud-postventa`, `evidencias`, `texto-acciones` | **Parcial** |
| Contenido | `note_92`, `video_73`, `linkcard_100`, `landingpage_103`, `goodsshoppingguide_93` | `nota`, `producto`, `enlace`, `video` | **Cubierto** |
| **Agente / ayuda** | `agentstreamreply_302`, `cswelcomemsg_209`, `richhinttoc_126`, `commonhint_131`, `buttonhint_120`, `sysqueueinfo_82`, `queueguideleave_114`, `queueleave_115`, `queueleavereply_116`, `sysopenchat_38` | `bienvenida` (equivalente a `cswelcomemsg`) y nada más | **Hueco grande** (ver §3) |
| Compuestas | `composite_44`, `compositeoption_45`, `intention_23` | `compuesta` | **Parcial** |

### 1.3 Lo que la referencia trae de "mensajes automáticos" y LifeBook no

**[APK] Contratos exactos** (leídos de los `dsl.json`):

| Paquete | Qué es | Datos que consume |
|---|---|---|
| `agentstreamreply_302` | **respuesta del bot en streaming**: burbuja según `property.senderType`; `subType=='custom'` cambia el bloque | `content.subType`, `content.text` |
| `cswelcomemsg_209` | **bienvenida del servicio de atención**: avatar + mensaje + nombre | `avatarUrl`, `welcomeMessage`, `name` |
| `commonhint_131` | línea de aviso genérica con `elements[]` (type LABEL con color) | `elements[]` |
| `richhinttoc_126` | aviso rico con `elements[]` de tipos `TEXT/LINK/ACTION_LINK/ENTRY_CODE/HTTP_ACTION…` y contexto `chatId/caseId/sellerId` | `elements[]`, `property.*` |
| `buttonhint_120` | **texto con un botón dentro**: `xhsAppContent` con `{id}` sustituido por el label | `xhsAppContent`, `buttons[0].id/label` |
| `sysqueueinfo_82` | **cola de atención humana**: «人工客服排队中», nº en cola, cancelar | `queueCount`, `enableCancel`, `cancel`, `content` |
| `queueguideleave_114` | guía de cola: ir a dejar mensaje / cancelar | `title`, `content`, `queueContent`, `canCancel` |
| `queueleave_115` | **mensaje dejado** (consultas fuera de horario): tipo, pedido, fecha | `content`, `questionName`, `orderId`, `leaveMessageTime` |
| `queueleavereply_116` | **respuesta al mensaje dejado** | los anteriores + `replyContent` |
| `sysopenchat_38` | línea de sistema «se abrió el chat» | `content` |
| `usebeforepaidcard_211` | texto + botón con URL | `title`, `card_content`, `button_content`, `button_url` |

**[APK] Además**, el manifiesto declara `im.quickreply.QuickReplyActivity` (respuestas rápidas del
vendedor) y `im.stickynote.StickyNoteEditActivity` (nota fijada del chat).

**LifeBook hoy:** `bienvenida` (la tarjeta que corresponde a `cswelcomemsg_209`) está registrada pero
**no hay ningún flujo que la emita**; no existe respuesta rápida, ni bot en streaming, ni cola, ni
mensaje dejado. La única "voz" automática son los `system` del servidor y las tarjetas de aviso.

> **Conclusión del entorno:** LifeBook ya tiene el **lenguaje** (cardRef + registro + 34 tarjetas).
> Lo que le falta no es el motor: es la **capa de atención** (bot, respuestas rápidas, cola, mensajes
> fuera de horario) y 2-3 tarjetas del ciclo del pedido.

---

## 2. CUPONES: tres tarjetas en la referencia, tres componentes aquí

### 2.1 Contratos de la referencia [APK]

| Card | Campos del DSL | Semántica |
|---|---|---|
| `coupon_19` | `discount`, `threshold`, `name`, `coupon_type`, `template_subtype`, `item_name`, `start_time`, `end_time`, `url` | cupón del chat; umbral `0` = «无门槛» (sin mínimo); botón según fechas: **已失效 / 未生效 / 去使用** |
| `couponcardv2_222` | `discountType` (1 = descuento, si no `￥`), `couponType` (0 plataforma · 1 tienda · 2 cupón · 3 comprador), `name`, `status` (2 = usado) | cupón compacto con sello de usado/caducado |
| `couponclaim_112` | `title`, `content`, `couponDetail{discountAmountFen, thresholdFen, name, useEndTs, limits}`, `buttons[]` | **oferta de cupón para reclamar**; `limits` son las condiciones; botón = reclamar |

### 2.2 LifeBook [CÓDIGO]

| Componente | Contrato | Correspondencia |
|---|---|---|
| `TarjetaCupon` | `discount`, `threshold`, `name`, `couponType`, `itemName`, `startTime`, `endTime`, `url` | ≡ `coupon_19` (snake→camel) |
| `TarjetaCuponCompacto` | `name`, `couponType`, `discountType`, `discount`, `threshold`, `validoHasta` | ≡ `couponcardv2_222` |
| `TarjetaReclamarCupon` | `title`, `content`, `couponDetail{...}`, `buttons[]` | ≡ `couponclaim_112` |

Los tres componentes **ya estaban alineados a la referencia**; lo que faltaba era el **flujo**.

### 2.3 Lo construido

- Backend (`dist/src/lifebook/commerce.service.js` → `claimCoupon`): al reclamar, manda al chat
  comprador↔tienda la tarjeta `cupon` con `discount` («10 %» o «1.500 XAF»), `threshold`
  («Mínimo … XAF» / «Sin mínimo»), `name`, `couponType`, `itemName` (código), fechas y `url`.
  Va en `try/catch`: el chat no puede tumbar una reclamación.
- La **oferta pública** (`cupon-reclamar`) queda como decisión de producto: hoy no existe un
  "publicar cupón a seguidores"; cuando exista, se emite con la misma tarjeta ya registrada.

---

## 3. CONFIRMACIÓN DE ENTREGA

### 3.1 Qué tiene la referencia [APK]

- `confirmorder_72`: **no es una tarjeta rica** — es una línea centrada gris con
  `content.data.content` y respaldo «[确认订单]» (confirmar pedido). Es el "mensaje de sistema".
- `askconfirmorder_71`: **la tarjeta de verdad**: «请核对订单信息» (revisa la información del pedido)
  con `goods.preview/name/count/total_amt`, `address.desc`, `accountInfoList[]` (cuando
  `logisticsType == 52`), `status.desc/feedback`, y botones **修改** (modificar) y **确认**
  (confirmar), con `isShowButton` gobernando si se pinta el de confirmar.
- `usebeforepaidcard_211`: genérica texto+botón para el paso previo al pago.

### 3.2 Qué tenía LifeBook [CÓDIGO]

- `TarjetaConfirmarPedido` ≡ `askconfirmorder_71` — **existía y estaba registrada como
  `confirmar-pedido`**, pero **sin ningún flujo que la emitiera** (su propio comentario lo dice:
  «PENDIENTE DE CONTRATO: flujo de confirmación de pedido»).
- El cierre real de una entrega contra reembolso es el **código de 4 dígitos**
  (`orders.service.js → confirmDeliveryCode`), que **no tenía tarjeta**: al confirmar se mandaba un
  `pedido-logistico` genérico.

### 3.3 Lo construido

`TarjetaConfirmacionEntrega` (`cardType: 'confirmacion-entrega'`), con la anatomía de
`askconfirmorder_71` y lo propio de LifeBook:

- bloque del **código** en cifra grande + instrucción («enséñaselo al repartidor»);
- artículo (`goods` desde `items[0]`), ticket (`address`), `status.desc` como chip y
  `status.feedback` como explicación;
- botones: **Ver pedido** (contorno) y **Copiar código** (principal) + botones del servidor.

**Emisión (backend):**
- al pasar a **`in_transit`** un pedido **con `delivery_code`** → la tarjeta lleva el código y el
  estado «En camino» (en vez del `pedido-logistico` genérico);
- al **confirmar con código** → tarjeta final: estado «Entregado», sin código (ya usado).
- El resto de avisos siguen igual: si no hay código, `pedido-logistico` como siempre.

**Por qué así y no copiando `askconfirmorder` tal cual:** la referencia no tiene tarjeta para el
código; su "confirmorder" es una línea. Copiar la línea habría dejado al comprador sin sitio donde
leer el código. Se toma la **anatomía** (verificación + estado + botones) y se añade el dato que
LifeBook necesita.

---

## 4. Plan de acción (por tandas, con coste y riesgo)

| Tanda | Qué | Fuente RE | Coste | Riesgo | Verificación |
|---|---|---|---|---|---|
| **T0 (hecho)** | `confirmacion-entrega` + flujo de cupón | `askconfirmorder_71`, `coupon_19` | Bajo | Bajo | pedido con código + cupón reclamado en el móvil |
| **T1** | **Respuestas rápidas del vendedor** (`quickreply`): chips encima del compositor con las frases que la tienda define | `im.quickreply.QuickReplyActivity` [APK] | Medio (tabla + endpoint + UI) | Bajo | enviar una respuesta rápida y verla como texto en el chat |
| **T2** | **Bienvenida y pistas del servicio**: cablear `bienvenida` al abrir chat con tienda y `buttonhint`/`commonhint` (texto + botón inline / línea de aviso) | `cswelcomemsg_209`, `buttonhint_120`, `commonhint_131` | Bajo (componentes listos) | Bajo | abrir chat con tienda y ver la bienvenida; hint con enlace |
| **T3** | **Cola de atención humana**: `sysqueueinfo`, `queueguideleave`, `queueleave`, `queueleavereply` (fuera de horario → dejar mensaje → respuesta) | esos 4 DSL | Alto (requiere modelo de casos/cola en backend) | Medio | dejar mensaje y recibir respuesta |
| **T4** | **Bot en streaming** (`agentstreamreply`): respuesta token a token del asistente que ya existe en `docs/TANDA-M-ASISTENTE-DE-IA.md` | `agentstreamreply_302` | Alto (SSE/WS + estado por mensaje) | Medio-alto | pregunta al bot y ver el texto crecer |
| **T5** | Tarjetas menores del ciclo: `urgepay` (reclamar pago) y `urgingdelivery` (reclamar entrega) | `urgepay_121`, `urgingdelivery_109` | Bajo-medio | Bajo | recordatorio de pago en el chat |
| **T6** | Verificación final: repasar las decisiones abiertas de WP1 §5.1 y los `cardType` sin emisor | WP1 | Bajo | Bajo | tabla confirmada/refutada |

**Regla de la casa que se respeta en todo el plan:** una tanda = un cambio → `tsc` → guardia de
diseño → compilar → instalar → comprobar en el aparato. Nada de mezclar.

---

## 5. Límites de este informe

- La RE de 小红书 es **estática** (DSL y manifiesto). No se ha ejecutado la app: describe lo que el
  cliente **soporta**, no una sesión observada.
- El **orden y parte de la disposición** de algunas tarjetas vienen del servidor (304 ficheros DSL);
  no son determinables offline.
- Los textos japoneses/chinos del DSL se citan **como evidencia**, no como copia: LifeBook escribe
  los suyos.

---

## 6. Validación en el móvil y estado real (24/10/2026)

**Despliegue:** el parche del backend (`dist/src/lifebook/orders.service.js` y `commerce.service.js`)
se subió a COS (`6567-…-1309240014`, `/funciones/api-arbol-cupon.zip`, 86,2 MB) y se activó por
`UpdateFunctionCode` → función `egrouteplan-api` **Active** a las 11:13:31.

**Validado en pantalla** (OPPO PKK110, APK release sin Metro):

| Qué | Resultado |
|---|---|
| `confirmacion-entrega` al salir **en camino** | Tarjeta «Confirma la entrega», chip «En preparación», bloque **Código de entrega 9970**, artículo, feedback y botones «Ver pedido» / «Copiar código» |
| `cupon` al reclamar | Tarjeta con **«15 %»**, «Mínimo 5000 XAF», sello «Cupón de tienda», nombre completo, código y fechas |
| API (recuento de la conversación) | `card/cupon: 1` y `card/confirmacion-entrega: 1` además de las 11 ya validadas |

**Defectos que aparecieron AL validar y se corrigieron** (misma familia que §7.6 del CARD doc:
el contrato no coincidía con lo que se pinta):

1. **Cupón de porcentaje pintaba «XAF 15 %»** — `ImporteCupon` antepone siempre el símbolo. Se
   normaliza en `TarjetaCupon`: porcentaje → cifra + «%» sin símbolo; importe → XAF.
2. **El nombre se comprimía a «Des/cu…»** — compartía fila con el sello en una tarjeta estrecha. El
   sello pasa a su propia línea y el nombre usa todo el ancho.

**Estado real que confirmó la auditoría de código** (dato para el plan):

- `cupon` es el **único** cupón que se emite, y solo al reclamar por primera vez.
  `cupon-compacto` y `cupon-reclamar` están **registrados sin emisor** (hasta T2, ver §6.1).
- El botón **«Usar cupón» no navegaba**: el payload no llevaba destino, así que `destinoDeBoton`
  devolvía `null`. **Arreglado en T2** con destino tipado `shop` → `/lifebook-shop/[id]`.
- `confirmar-pedido` (la tarjeta de `askconfirmorder` de la referencia) sigue **registrada sin
  emisor**; el doc `CARD-tarjeta-generica-en-el-chat.md` aún la da como pendiente (documentación por
  detrás del código).
- `cardMessage` está documentado en el parche pero **no existe en el `dist` desplegado**: los
  emisores reales son `notify`, `publicarEnChat`, `publicarPedido` y `avisarEnChat`.
- El **bot no existe** en el chat: lo automático son avisos del servidor. El «asistente» es una
  pantalla aparte (`app/lifebook-ai.tsx`, tablas `ai_conversations`/`ai_messages`, 4 sugerencias
  iniciales). `bienvenida` estaba registrada y **sin emisor**; la TANDA-N (bot) no está hecha.

### 6.1 · T2 cableado (24/10, tras la auditoría)

Cableado lo que ya existía, sin inventar contratos:

| Qué | Cómo | Resultado |
|---|---|---|
| **Bienvenida al abrir el chat de una tienda** | `ensureChatIntro` en `chatMessages` (una vez por conversación): emite `bienvenida` con nombre de la tienda y saludo | ✅ visto en pantalla: «Hola, soy Hotel Demo Malabo. ¿En qué te ayudo?» |
| **Cupón reclamable en el chat** | el mismo emisor ofrece hasta 2 cupones de importe activos como `cupon-reclamar` (≡ `couponclaim_112`), con botón `reclamar-<código>` | ✅ visto: «Cupón de Hotel Demo Malabo · Descuento de 2000 XAF…» |
| **Botón «Reclamar»** | el chat intercepta `reclamar-*` y llama a `cuponesApi.recoger` (la misma API del checkout) | ✅ alerta «Guardado en tu cuenta: se aplica al pagar.» |
| **«Usar cupón» navegable** | destino tipado nuevo `shop` en `DestinoBoton` + `botonesDelServidor`; el servidor manda `buttonTargetType:'shop'`; el chat navega a `/lifebook-shop/[id]` | ✅ abre la tienda |

**Queda como T2b** (necesita una decisión de producto, no es solo cablear):
`cupon-compacto` (mostrar el cupón aplicado en un pedido) y `confirmar-pedido` (la referencia lo usa
para «revisa los datos antes de confirmar»; en LifeBook el paso equivalente es el `accept` de la
tienda y la confirmación con código, así que emitirlo sin más duplicaría tarjetas e inventaría una
acción de comprador que no existe).

---

## 7. Límites de este informe
- En los informes de los subagentes (si llegan después de este documento) puede haber detalle
  adicional; este documento se apoya en los `dsl.json` leídos directamente.

---

## 8. Alcance completo del clon del chat (inventario T0–T12)

**Por qué existe esta sección:** T1–T6 de §4 no bastaban para un *clon real*. Este es el inventario
completo: cada capacidad de la referencia, qué tenemos, qué falta y en qué tanda cae. La evidencia de
la columna 小红书 sale de `assets/dsl/`, del manifiesto y de WP1 §1.4; la de LifeBook, del código
(rutas y línea citadas arriba en este documento y en los informes de `D:\temp\egapp-validate\re\`).

Leyenda: **✅ hecho** · **🟡 parcial / tipado sin UI** · **❌ falta** · **➕ añadido al plan**

### 8.1 Mensajería y composición

| Capacidad | 小红书 [APK] | LifeBook [CÓDIGO] | Tanda |
|---|---|---|---|
| Texto, foto, vídeo, fichero, enlace | kinds IM + `linkcard_100`/`file_17`/`video_73` | ✅ `CHAT_KINDS` + ramas del chat | — |
| Ubicación / en vivo | `checkin` | ✅ `location`, `checkin`, live location | — |
| Votación, cadena, quedada | `GroupVote*`, `intention` | ✅ kinds `vote`/`chain`/`checkin` | — |
| Anuncio de grupo | `isvoption` | ✅ kind `ad` | — |
| **Menciones @ dentro del chat** | `CommentAt` (评论和@), y @ en grupo | ❌ en el chat; ✅ solo bandeja de menciones (`LbMentionReceived`, «Comentarios y @») | **T7 ➕** |
| **Cita / responder a un mensaje** | hilo por cita (patrón de IM) | ❌ (`replyTo` no existe en `LbMessage`) | **T8 ➕** |
| **Reacciones a MENSAJES** | no verificado en DSL (probable solo en publicaciones) | ❌ | **T8 (opcional) ➕** |
| Emojis / stickers | teclado + stickers propios | ❌ (solo teclado del sistema) | **T9 ➕** |
| **Mensajes de voz** | `im.voiceservice` (llamadas aparte) | ❌ | **T9 ➕** |
| Reenviar | sí | ✅ reenviar 1-a-1; ❌ multiselección | T9 (multi-select) |
| Copiar / borrar | sí | ✅ | — |
| Editar mensaje | sí (IM) | ❌ | T9 (opcional) |
| **Traducción de mensajes** | sí | ❌ | **T10 ➕** |

### 8.2 Estado del chat y ajustes

| Capacidad | 小红书 | LifeBook | Tanda |
|---|---|---|---|
| Recibos de leído | sí | ✅ `readAt` + `chatMarkRead` | — |
| **«Escribiendo…»** | sí | 🟡 `peerIsTyping` tipado en `api/messages.ts` pero **sin UI ni emisión** | **T7 ➕** |
| Fijar conversación arriba | sí | ✅ `chatPrefs` + hoja (📌 Fijar arriba) | — |
| Silenciar | sí (+ `Block merchants`) | ✅ `chatPrefs` mute; ❌ silencio específico de comercio | T11 (block merchants) |
| Borrar historial | 2 niveles (historial / historial+lista) | ✅ `chatClear` (un nivel) | T11 (2º nivel) |
| **Marcar como no leído** | sí | ❌ | **T7 ➕** |
| Buscar en mensajes | sí | ✅ `chatSearch` + «Buscar en el historial» (por tipo) y «en todos mis chats» | — |
| Fondo / tema del chat | `FireworkThemePanelActivity` | 🟡 `bg` + `chatBackgroundOf`; sin panel de temas | T10 (tema) |
| **Nota fijada del chat (sticky)** | `StickyNoteEditActivity` | ❌ (hay pin de conversación, no aviso fijado en el hilo) | **T10 ➕** |
| Bloquear / reportar | sí (+ comerciantes) | ✅ bloquear 1-a-1; ❌ reportar con motivo; ❌ block merchants | T11 |
| Privacidad de mensajes | `PrivacyMessageSettingsActivity` | 🟡 privacidad de perfil; sin ajustes de mensajes | T11 |
| **Capa de desconocidos** | `StrangerMsg*` + ajustes + compositor | ❌ | **T12 ➕** |

### 8.3 Automatización y atención

| Capacidad | 小红书 | LifeBook | Tanda |
|---|---|---|---|
| **Respuestas rápidas del vendedor** | `im.quickreply.QuickReplyActivity` | ❌ | **T1** |
| **Bienvenida del servicio** | `cswelcomemsg_209` | 🟡 tarjeta `bienvenida` registrada, **sin emisor** | **T2** |
| Hints con botón / elementos | `buttonhint_120`, `commonhint_131`, `richhinttoc_126` | 🟡 `texto-acciones`, `enlace-boton`, `compuesta`; ❌ botón inline | **T2** |
| **Bot en streaming** | `agentstreamreply_302` | ❌ en el chat (el «asistente» es pantalla aparte `lifebook-ai.tsx`) | **T4** |
| **Cola humana + mensaje dejado** | `sysqueueinfo_82`, `queueguideleave_114`, `queueleave_115`, `queueleavereply_116` | ❌ | **T3** |

### 8.4 Comercio (ya cubierto en esta campaña)

| Capacidad | 小红书 | LifeBook | Tanda |
|---|---|---|---|
| Tarjetas de pedido | `order_3` | ✅ `pedido` | — |
| Verificación de pedido | `askconfirmorder_71` | 🟡 `confirmar-pedido` registrada sin emisor | T2 |
| Confirmación de entrega con código | (no existe como tarjeta) | ✅ **`confirmacion-entrega` (nueva, T0)** | — |
| Cupones | `coupon_19`, `couponcardv2_222`, `couponclaim_112` | 🟡 `cupon` emitido; `cupon-compacto`/`cupon-reclamar` sin emisor; «Usar cupón» sin destino | T2 |
| Cobro / logística / postventa / reposición | `smallpayment`, `logisticorder`, `aftersalecard`… | ✅ `cobro`, `pedido-logistico`, `postventa*`, `alerta-reposicion` | — |
| Urgencias de pago/entrega | `urgepay_121`, `urgingdelivery_109` | ❌ | **T5** |

### 8.5 Tandas que **se añaden** al plan de §4

| Tanda | Qué incluye | Coste | Dependencias |
|---|---|---|---|
| **T7** | Menciones @ en el chat (picker de miembros, resaltado, «te mencionaron», deep-link al mensaje) · indicador **«escribiendo…»** (endpoint + evento) · **marcar no leído** | Medio | servidor (menciones en `payload`, typing event), app |
| **T8** | **Citar/responder** a un mensaje (swipe + bloque cita en la burbuja) · **reacciones a mensajes** (opcional, si se quiere ir más allá de la referencia) | Medio | `replyTo` en `LbMessage` + payload; reacciones: tabla |
| **T9** | **Stickers/emoji picker** · **mensajes de voz** (grabar, enviar, reproducir) · multiselección para reenviar · editar mensaje | Alto | permisos de audio, almacenamiento, UI nueva |
| **T10** | **Traducción de mensaje** · panel de **temas/fondo** · **nota fijada del chat** (sticky) | Medio | proveedor de traducción (ya hay uno para notas) |
| **T11** | Ajustes: 2º nivel de borrado, **reportar con motivo**, **block merchants**, privacidad de mensajes | Bajo-medio | servidor |
| **T12** | **Capa de desconocidos** (mensajes de quien no sigues, con ajustes y compositor) | Alto | modelo social (seguidores) ya existe |

> **Nota de honestidad:** lo marcado como ❌ en 小红书 (p. ej. reacciones a mensajes) es porque **no
> se ha verificado** en el DSL/manifiesto, no porque se sepa que no existe. Si quieres, la tanda T8
> lo incluye igualmente como añadido propio.

---

## 9. La DIRECCIÓN del pedido: 小红书, LifeBook y la libreta para Guinea Ecuatorial

### 9.1 Lo que hace 小红书 [APK]

| Evidencia | Qué demuestra |
|---|---|
| `bz5/z1.java:17` → `@kd.c(alternate = {"addressListPage"}, value = "address_list_page")` | hay una **página de lista de direcciones** con ruta propia |
| `b56/i.java:9` → `ADDRESS_INVALID(-3000, "地址信息不完善，不支持结算")` | **sin dirección completa no se puede pagar**: el checkout la valida |
| strings `收货地址` (dirección de envío), `地址管理` (gestión de direcciones), `设为默认` (marcar como predeterminada) | **libreta + predeterminada** son parte del producto |
| `com/xingin/entities/AddressV3Bean.java` (`cityName`, `cityNameSpell`, `id`, `name`, `subtitle`, `type`) | selector de **ciudad/región** jerárquico |
| `com/xingin/mp/ipc/v2/action/ChooseAddressAction.java` | **elegir** una dirección guardada desde el checkout |
| `com/xingin/commercial/variantpay/compose/address/OverseasPayAddressView.java` | formulario de dirección **de otro país** (campo país/región), útil como patrón para GE |
| `com/xingin/trade_bcim/ui/page/service/ModifyAddressFailEntry*` | entrada de «la dirección falló / hay que corregirla» |

**Comportamiento que se deduce:** el comprador tiene una **agenda de direcciones**; en el pago
**elige** una (la predeterminada se propone sola), puede **añadir/editar**, y marcar **una como
predeterminada**. Sin dirección completa, el checkout se bloquea con un error explícito.

### 9.2 Lo que ya tiene LifeBook [CÓDIGO]

**En el Mercado (`ecomerse`) SÍ existe la libreta completa** — y es el patrón a reutilizar:

- `api/ecomerse.ts:740-752` → `addresses()`, `createAddress()`, `updateAddress()`,
  `setDefaultAddress()` (ruta propia `/default`, idempotente), `deleteAddress()`.
- `EcomerseAddress` con `isDefault`, etiqueta y texto; `EcomerseAddressInput` para alta/edición.
- Pantallas `app/ecomerse-direcciones.tsx` («Mis direcciones de entrega») y `app/ecomerse-direccion.tsx`.
- **Una sola predeterminada garantizada por la base**: índice único parcial `uq_ec_addr_default`
  (no lo vigila la pantalla; lo cumple quien escribe).
- Los pedidos guardan **copia congelada** del texto (`ecomerse_orders.delivery_address`), así que
  editar la libreta no cambia pedidos históricos.

**En el comercio de LifeBook NO existe:** el checkout pide la dirección **inline** y no la guarda —
`app/lifebook-carrito-checkout.tsx:54-56` (ciudad, zona, referencia), `:227` (validación),
`:265` (`deliveryAddress: {city, zone, reference}`), `:518-545` (formulario). Un pedido nuevo vuelve
a pedirla entera. No hay pantalla de direcciones ni predeterminada en `lifebook`.

### 9.3 Propuesta alineada a Guinea Ecuatorial (sin depender del mapa)

**Campos** (reusando el modelo de `ecomerse`, no inventando otro):

| Campo | Por qué en GE |
|---|---|
| `label` | «Casa», «Trabajo», «Casa de mamá»: el comprador elige por nombre, no por coordenadas |
| `receiver_name` | muchas entregas son **para otra persona** (regalo, familia) |
| `phone` (+240) | el repartidor llama; validar formato GE |
| `province` | Bioko Norte, Bioko Sur, Annobón, Litoral, Centro Sur, Kié-Ntem, Wele-Nzas, Djibloho |
| `municipality` | Malabo, Bata, Ebebiyín, Mongomo, Evinayong, Luba… (lista por provincia) |
| `neighborhood / street` | barrio o calle |
| **`reference` (obligatoria)** | **en GE no hay código postal**: «frente a la farmacia», «portón azul», «junto al mercado» es la dirección real |
| `lat/lng` (nullables) | **el mapa aún está en curso**: se guardan si hay pin, y la dirección funciona sin él |
| `notes` | indicaciones para el repartidor |
| `is_default` | **una sola** por usuario, con índice único parcial (`uq_lb_addr_default`) |

**Flujo:**
1. Checkout: selector de direcciones guardadas; la **predeterminada preseleccionada**; «+ Nueva».
2. El pedido guarda el **snapshot** del texto (como ya hace `ecomerse`) y opcionalmente el `addressId`.
3. `confirmar-pedido` (ya en T2b) muestra la dirección del pedido; más adelante, botón «Cambiar
   dirección» que abre la libreta antes de que la tienda prepare.
4. Mapa: cuando llegue, el pin es **opcional**; si existe, «Ver en el mapa».

### 9.4 Plan T13 (dirección)

| Paso | Qué | Reuso |
|---|---|---|
| 1 | DDL `lifebook.addresses` + índice único parcial de la predeterminada | patrón `uq_ec_addr_default` de `ecomerse` |
| 2 | Endpoints `/lifebook/addresses` (GET/POST/PATCH/DELETE + `/default`) | patrón exacto de `api/ecomerse.ts:740-752` |
| 3 | `createOrder` acepta `deliveryAddressId` y copia el snapshot | ya copia texto hoy (`delivery_address`) |
| 4 | Pantallas `lifebook-direcciones` / `lifebook-direccion` | clonar las de `ecomerse-direcciones`/`ecomerse-direccion` (ya probadas) |
| 5 | Selector en checkout + predeterminada | `lifebook-carrito-checkout.tsx:518-545` |
| 6 | Verificación | crear 2, marcar predeterminada, pedir con ella y ver el texto en el pedido y en `confirmar-pedido` |

**Decisión de producto pendiente (ver preguntas):** ¿una sola agenda para toda la app (LifeBook +
Mercado) o dos libretas por vertical? El código de `ecomerse` sugiere que **unificar** es lo más
barato: mismo modelo, una pantalla, una predeterminada global.

### 9.5 Decisiones tomadas (24/10/2026)

| Pregunta | Decisión |
|---|---|
| ¿Una agenda o dos? | **Dos libretas separadas**: Mercado conserva la suya (`ecomerse`) y LifeBook tendrá la suya (`lifebook.addresses`), con su propia predeterminada. Se **copia el patrón** (índice único parcial, snapshot en el pedido), no la tabla. |
| Campos obligatorios en GE | **Barrio + referencia obligatorios**; provincia y municipio se piden pero **no bloquean** mientras el mapa no exista. |
| ¿Destinatario distinto del titular? | **Sí**: `receiver_name` y `phone` pueden ser de otra persona (regalo/familia); el repartidor llama a ese teléfono. |

**Consecuencia para T13:** tabla propia (no compartida), un `is_default` por usuario de LifeBook,
y en el checkout de LifeBook la predeterminada se propone sola. La pantalla se clona de
`ecomerse-direcciones`/`ecomerse-direccion` (ya probadas), pero apuntando a `/lifebook/addresses`.



---

## 10. T1 — Respuestas rápidas del vendedor (estado y desbloqueo)

**Hecho (código completo, compila y degrada sin romper nada):**

| Pieza | Dónde |
|---|---|
| Tabla (DDL idempotente, dos variantes) | `commerce.service.js` → `asegurarTablaRespuestas()` |
| GET/POST/DELETE `/lifebook/commerce/merchant/quick-replies` | `commerce.service.js` + `commerce.controller.js` |
| API del móvil | `api/commerce.ts` → `respuestasRapidasApi` |
| **Chips sobre el compositor** | `app/lifebook-chat/[id].tsx` (tocar → el texto va al compositor) |
| **Pantalla de gestión** | `app/lifebook-respuestas-rapidas.tsx` (crear/borrar, «Tienda» o «Mía») |
| Acceso | hoja «⋯» → «Respuestas rápidas» |

**Dónde se guarda (decisión final):** el usuario de base del backend **no puede crear tablas**
(comprobado en vivo: `42501 permission denied for schema lifebook`, y lo mismo en `public` y
`wallet`). Por eso las frases se guardan en la bolsa **jsonb** que ya existe para preferencias del
usuario, `mobility.users.status_prefs`, bajo la clave `quickReplies`:

```json
{ "quickReplies": { "shop": [{ "id": "...", "text": "…", "sort": 0 }], "user": [ … ] } }
```

Las frases **de tienda** viven en la fila del **dueño** de la tienda; las **personales**, en la de
cada uno. Es aditivo y no pisa las demás claves (`lb`, `publish_banned_until`, `suspended_until`).
Si algún día se concede `CREATE` al usuario de la app, se puede migrar a su tabla propia sin cambiar
el contrato del móvil.

**Verificado con la API real (12:30):** el vendedor crea una frase de tienda y otra personal y el
GET devuelve las dos con `shopName: "Hotel Demo Malabo"`; el ADMIN crea la suya y la recibe también.
**Pendiente inmediato tras el desbloqueo:** desplegar (la subida a COS está caída por red en este
momento; se reintenta) y validar en el móvil con la cuenta del vendedor: crear una frase «Tienda» y
otra «Mía», verlas como chips y comprobar que tocar una pone el texto en el compositor.
