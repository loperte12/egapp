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
  `cupon-compacto` y `cupon-reclamar` están **registrados sin emisor**.
- El botón **«Usar cupón» no navega**: el payload no lleva `buttons`/`orderId`/`productId`, así que
  `destinoDeBoton` devuelve `null` y el botón no hace nada. Es el siguiente arreglo barato.
- `confirmar-pedido` (la tarjeta de `askconfirmorder` de la referencia) sigue **registrada sin
  emisor**; el doc `CARD-tarjeta-generica-en-el-chat.md` aún la da como pendiente (documentación por
  detrás del código).
- `cardMessage` está documentado en el parche pero **no existe en el `dist` desplegado**: los
  emisores reales son `notify`, `publicarEnChat`, `publicarPedido` y `avisarEnChat`.
- El **bot no existe** en el chat: lo automático son avisos del servidor. El «asistente» es una
  pantalla aparte (`app/lifebook-ai.tsx`, tablas `ai_conversations`/`ai_messages`, 4 sugerencias
  iniciales). `bienvenida` está registrada y **sin emisor**; la TANDA-N (bot) no está hecha.

---

## 7. Límites de este informe
- En los informes de los subagentes (si llegan después de este documento) puede haber detalle
  adicional; este documento se apoya en los `dsl.json` leídos directamente.
