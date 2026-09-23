# P3 — Enlace de un GRUPO en el perfil (con caducidad)

> Estado: **hecho y verificado** (servidor + app): **caducidad** y **tope de usos** del
> enlace, y el enlace de grupo en el perfil. Lo único que queda de P3 es la URL web
> `/g/CODE`, que es la parte P4 (dicha abajo con nombre y apellidos).
> Fecha: 2026-02-14 (tope de usos y verificación en el teléfono: 14/09/2026).
> Lo pedido por el dueño: *«enlaces fijados (enlace de grupo con o sin clave de acceso)»*.
> Documentos vecinos: `docs/PERFIL-PUBLICO-Y-ENLACES-FIJADOS.md` (los enlaces fijados),
> `docs/ESTADO-SOCIAL-API.md` (el estado 24 h), `docs/TIENDAS-XIAOHONGSHU-INVESTIGACION.md`.

---

## 1. Qué había antes (medido, no supuesto)

| Pieza | Dónde | Estado antes |
|---|---|---|
| Código de invitación del grupo | `lifebook.conversations.invite_code` | Existía desde la Parte 28 (6 caracteres, alfabeto de 32) |
| Sacarlo | `GET /lifebook/groups/:id/invite` | Solo dueño y administradores (`assertGroupRole(userId, convId, true)`). Si no, **403 `GROUP_FORBIDDEN`** |
| Entrar con él | `GET /lifebook/groups/by-code/:code` | Normaliza a mayúsculas A-Z0-9, mínimo 4 caracteres |
| Verlo en el perfil | — | **No existía nada.** El código solo se podía copiar a mano y mandarlo por WhatsApp |
| Caducidad | — | **No existía.** Cero filas, cero columnas |
| Límite de usos | — | **No existía** |

Datos reales de producción en el momento del cambio:

```
grupos totales ......................... 630
con invite_code ........................   2   (los dos, grupos de prueba)
de esos, con caducidad .................   0
grupos públicos ........................  65
públicos con código ....................   0
solicitudes de ingreso registradas .....   0
modo de entrada: 580 abiertos / 25 aprobación / 25 pregunta
```

## 2. El agujero que había (y por qué se cierra antes de publicar enlaces)

Un código de **6 caracteres** de un alfabeto de 32 que **no caduca nunca** y cuyo
endpoint solo está detrás del límite **global** del servidor (100 peticiones por minuto)
se puede sacar a fuerza bruta con paciencia: son ~10⁹ combinaciones, pero sin caducidad
el atacante tampoco tiene prisa, y `by-code` **devuelve la ficha hasta de un grupo
privado** a quien tenga el código.

Publicar ese código en un **perfil público** (que es justo lo que se pidió) convierte el
agujero en algo peor: un enlace eterno y visible.

Telegram es el modelo de la solución, y aquí se copia su idea, no su código: sus enlaces
de invitación llevan `expire_date` y `member_limit`.

## 3. Lo que se hizo

### 3.1 Base de datos (`sql/lifebook/20260214_codigo_caduca.sql`, copia local `backend/sql/007_codigo_caduca.sql`, md5 idéntico)

```sql
ALTER TABLE lifebook.conversations
  ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_uses       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invite_max_uses   integer;
```

Y, para que **no quede ningún código eterno vivo**, se les puso caducidad a los que ya
existían:

```sql
UPDATE lifebook.conversations
   SET invite_expires_at = now() + interval '7 days'
 WHERE kind='group' AND invite_code IS NOT NULL AND invite_expires_at IS NULL;
```

### 3.2 Servidor (`src/lifebook/lifebook.service.ts`)

* **Al generar** (`groupInviteCode`): el código nace con **7 días** de vida y el contador
  de usos a cero. Se devuelve además `expiresAt`, para que la app pueda avisar.
* **Si el anterior ya caducó, se ROTA** en vez de devolverlo.
* **`NULL` cuenta como caducado** (hay dos sitios: al generar y al entrar). Es la parte
  que más fácil se escapa: un código anterior al cambio tiene la fecha vacía, y si se
  tratara como «sin caducidad» el agujero seguiría abierto **justo para los códigos que
  ya estaban circulando**.
* **Al entrar** (`groupByCode`): un código caducado se rechaza con
  **400 `INVITE_CODE_INVALID`** y el mensaje *«Ese código ha caducado: pide uno nuevo a
  quien te invitó»*.
* La lista de chats (`GET /lifebook/chat/conversations`) ahora devuelve **`myRole`** en
  cada grupo: es lo que permite ofrecer en el editor solo los grupos donde puedo sacar
  código, sin preguntar uno por uno.

### 3.3 App

| Fichero | Qué hace |
|---|---|
| `api/lifebookGrupos.ts` (**nuevo**) | `misGrupos()` (con mi papel), `codigo(id)`, `porCodigo(code)`. Vive aparte para **no tocar `api/lifebook.ts`**, como `lifebookWatch.ts` y `lifebookComentarios.ts` |
| `api/auth.ts` | `ProfileLink.kind` admite `'group'` (documentado: su `value` es el CÓDIGO, no una dirección) |
| `app/edit-profile.tsx` | Botón **«Enlazar uno de mis grupos»** + selector (`ModalGrupo`): solo dueños y administradores, con foto, nombre y nº de miembros. El enlace **nace fijado** si queda sitio (para eso se pidió fijar). También se puede pegar un código a mano eligiendo el tipo «Grupo» |
| `app/lifebook-user.tsx` | Los enlaces `kind:'group'` **no** se pintan como chips: van en **tarjeta** con la foto del grupo, el nombre y «N miembros · toca para entrar». Si el código ya caducó, la tarjeta sale apagada y dice **«Este enlace ya no sirve (ha caducado)»** en vez de mentir |
| `app/lifebook-groups.tsx` | Acepta `?code=XXXX`: al llegar con un código abre la ficha del grupo directamente. Así el enlace del perfil reutiliza **el mismo camino de entrada** que ya existía (unirse / pedir aprobación / responder la pregunta) en vez de tener dos maneras distintas de entrar a un grupo |

Flujo completo: **perfil → tarjeta del grupo → tocar → ficha del grupo → unirse** (o
pedir entrar, o responder la pregunta, según cómo lo tenga puesto el dueño).

## 4. Verificación (contra la API real, no en local)

`pruebas/lb51u-verificar-codigo-caduca.cjs` — **23 comprobaciones, 3 fases, 0 fallos**:

| Fase | Qué demuestra |
|---|---|
| 1 (10) | El dueño saca el código **con fecha futura**; con él se entra al grupo correcto; un miembro cualquiera recibe **403**; código corto = **400**; código inventado = **404** |
| 2 (8) | Con la fecha **caducada** (tocada en la base de datos): entrar da **400 «ha caducado»**; al pedirlo, el dueño recibe uno **NUEVO** (RUY9VK → DCUALQ); el nuevo entra; **el viejo ya no existe (404)** |
| 3 (5) | Con el código **sin fecha** (los anteriores al cambio): tampoco entra (400) y al pedirlo se rota (DCUALQ → 9TN6RV) |

`pruebas/lb51v-verificar-enlace-de-grupo.cjs` — **15 comprobaciones, 0 fallos**: el
código se guarda como enlace `kind:'group'` (el servidor lo conserva con su `pinned`), el
perfil público lo devuelve, **otro usuario** lo resuelve a la ficha del grupo, y al final
se dejan los enlaces del usuario de prueba **como estaban**.

> Nota de método: la fase 2 y la 3 necesitan tocar la base de datos (no hay endpoint para
> caducar un código a mano), así que el mismo fichero se ejecuta tres veces con
> `FASE=1|2|3` y entre medias se cambia la fecha con SQL.

### 4.1 Verificación EN EL TELÉFONO (Poco F5, APK instalada)

Medido con `uiautomator dump` (no «a ojo»), sobre la cuenta con sesión en la app:

| Paso | Lo que se leyó en pantalla |
|---|---|
| Editor → botón nuevo | «Enlazar uno de mis grupos» `[91,762][989,899]` |
| Selector abierto | «Grupo E2E 055962134 v2 — 2 miembros · **eres el dueño**» (solo grupos donde mando: el resto daría 403) |
| Elegir un grupo | Se añade la fila y el contador pasa de `5/8` a **`6/8`** |
| Guardar | El servidor queda con **6 enlaces**, el último `{kind:'group', label:'Grupo E2E 055962134 v2', value:'9TN6RV'}` |
| Perfil público, enlace **con código vivo** | Tarjeta: **«Grupo E2E 055962134 v2» / «2 miembros · toca para entrar»** |
| Perfil público, enlace **con código inventado** (`ABC123`) | Tarjeta apagada: **«📌 Grupo de Malabo» / «Este enlace ya no sirve (ha caducado)»**, y al tocarla **no pasa nada** (se comprobó: la pantalla no cambia) |
| Tocar la tarjeta viva | Se abre **«Ficha del grupo»** (`Ficha del grupo`: título, 2 miembros, Entrada libre, 👑 Organiza…, y «Abrir el chat») — o sea, entra por el mismo camino de siempre |

Los enlaces normales (no de grupo) siguen saliendo como chips («📌 Mi web ↗»,
«📌 EgRoutePlan ↗»): los de grupo **no** se mezclan con ellos.

### 4.2 Dos trampas que costaron tiempo (para no repetirlas)

1. **La cuenta de la app no era la que yo creía.** Durante las pruebas comparé lo que
   mostraba el editor con lo que devolvía el servidor **para otra cuenta** y pareció que
   el guardado «perdía» enlaces. En realidad el guardado estaba perfecto: la app tenía
   sesión de **A** (`Usuario EG Route Plan`) y yo leía los enlaces de **BERNARDO**. Lección:
   antes de comparar, confirmar **de quién** es la sesión (`authApi.me().id`), no fiarse del
   nombre que se ve en pantalla (que puede haberse cambiado en pruebas anteriores).
2. **Las hojas inferiores se mueven entre el volcado y el toque.** Tocar coordenadas
   leídas de un `uiautomator dump` anterior abre otra cosa (llegué a abrir la ficha de otro
   grupo). Lección: volcar y tocar **en el mismo paso**, y comprobar la pantalla después.

### 4.3 Estado de los datos de prueba al terminar

* **BERNARDO** recuperó **su enlace original** (solo el correo) — se cierra así la limpieza
  que quedó pendiente de rondas anteriores. Respaldo: `D:\Temp\eg-status\links-bernardo.json`.
* **A** quedó con 3 enlaces honestos: `Mi web` (fijado), `EgRoutePlan` (fijado) y el enlace
  del **grupo real** con código vivo. Se quitaron los enlaces de prueba y uno que apuntaba
  a un código **inventado** (`ABC123`), que el perfil pintaba como caducado y confundía.


## 5. Lo que **NO** está hecho (dicho claro)

1. **No hay URL web `/g/CODE`.** El enlace que se guarda es el **código**, y la app lo
   lleva a `/lifebook-groups?code=…`. Un enlace `https://hk.egrouteplan.com/g/CODE` (para
   pegarlo fuera de la app) es la parte P4 y no está hecha.
2. **`by-code` sigue enseñando la ficha de un grupo privado** a quien tenga el código.
   Es el comportamiento de un enlace de invitación (Telegram hace lo mismo) y ahora está
   **acotado en el tiempo** (7 días) y en entradas (si el dueño le pone tope), pero
   conviene saberlo: el código, mientras vive, es la llave.
3. **`join_answer` (la respuesta de la pregunta de ingreso) se guarda en claro.** Es un
   hallazgo aparte, sin tocar, y no forma parte de P3.
4. **La tarjeta del perfil no se cachea**: se resuelve al abrir el perfil (una petición
   por enlace de grupo, y en la práctica hay uno).
5. **La tarjeta caducada se anuncia como «tocable»** a los lectores de pantalla aunque al
   tocarla no haga nada (React Native pone `clickable=true` en el nodo del `Pressable`
   deshabilitado). Se comprobó que **no navega**, que es lo importante.
6. **El tope cuenta al ENTRAR, no al pedir entrar.** En un grupo con aprobación, una
   solicitud pendiente no gasta entrada (todavía no es nadie dentro). Es una decisión, no
   un olvido: contarla al aprobar obligaría a tocar el camino de aprobación, que hoy no
   recibe el código. Queda dicho aquí para que nadie lo descubra por sorpresa.
7. **El tope se puede esquivar entrando SIN código** (buscando el grupo). Es deliberado y
   es lo que hace Telegram: el tope acota **el alcance del enlace**, no cierra la puerta
   del grupo. Está comprobado en la prueba (`=== 5. EL TOPE ACOTA EL ENLACE, NO LA PUERTA`).

## 5.bis El TOPE DE USOS (2ª parte de P3) — hecho y verificado

Lo que faltaba en la primera entrega ya está:

| Pieza | Dónde |
|---|---|
| `invite_uses` / `invite_max_uses` se leen y se aplican | `groupJoin` (servicio) |
| El «cargo» de la entrada es **atómico** (`UPDATE … WHERE invite_uses < invite_max_uses RETURNING`) | `groupJoin` |
| El enlace agotado responde **400 `INVITE_CODE_USED_UP`** | `src/http/error.filter.ts` |
| `code` en el cuerpo de unirse | `GroupJoinDto` (sin declararlo, el servidor rechaza el campo con 400) |
| Elegir el tope desde la app | `components/lifebook/GroupManageSheet.tsx` (paso «Código de ruta y QR»): *Sin límite · 1 · 5 · 10 · 50* |
| El invitado ve las entradas que quedan | `components/lifebook/GroupCardSheet.tsx` (`invite.usesLeft`) |
| El código se pasa al unirse | `app/lifebook-groups.tsx` → `GroupCardSheet` → `gruposEnlacesApi.unirse` |

Reglas decididas (y por qué):

* Pedir un tope **crea un enlace NUEVO** y el anterior deja de funcionar: es la única
  forma de que el contador empiece de cero sin poder «recargar» un enlace ya gastado. La
  app lo avisa **antes**, con un diálogo que lo dice con esas palabras.
* `maxUses=null` = sin tope · sin `maxUses` = no se toca el que haya.
* El texto de la hoja que decía *«Sigue valiendo mientras el grupo exista»* era **falso**
  desde que hay caducidad: ahora dice cuándo caduca y cuántas entradas quedan.

Verificación: `pruebas/lb51x-verificar-tope-de-usos.cjs` → **26 comprobaciones, 0 fallos**
(crea un grupo de prueba y **lo borra** al terminar). Cubre: enlace con tope 1 y 1 día ·
entradas restantes visibles para el invitado · entrar gasta la entrada · enlace gastado
rechazado (400) · el tope no cierra la puerta · enlace nuevo rota el código y reinicia el
contador · el viejo muere (404) · un miembro no puede cambiar el tope (403) · sin tope
sigue siendo sin tope.

Y en el teléfono (Poco F5), las **dos caras**:

| Cara | Lo que se leyó en pantalla |
|---|---|
| **Invitado** (enlace agotado) | «Este enlace ya no admite a más gente · caduca el 2026/9/15» y el botón sustituido por un aviso apagado (no deja entrar) |
| **Dueño** | «¿Cuánta gente puede entrar con este enlace?» con *Sin límite · 1 · 5 · 10 · 50*; al elegir 1 y confirmar, el servidor queda con `maxUses: 1, usesLeft: 1`; al volver a *Sin límite*, `maxUses: null` |

> Dos fallos propios que encontró esa prueba y se corrigieron: el **DTO rechazaba `code`**
> (400 «property code should not exist», con lo que el tope no se podía ni contar) y
> `INVITE_CODE_USED_UP` respondía **422** en vez de 400 como el caducado.


## 6. Mapa de ficheros

| Cosa | Sitio |
|---|---|
| DDL (servidor) | `/opt/mirror/app/sql/lifebook/20260214_codigo_caduca.sql` |
| DDL (copia local) | `D:\egapp\backend\sql\007_codigo_caduca.sql` |
| Generar/rotar código + entrar con él | `/opt/mirror/app/src/lifebook/lifebook.service.ts` (`groupInviteCode`, `groupByCode`) |
| Rutas | `/opt/mirror/app/src/lifebook/lifebook.controller.ts` (`groups/:id/invite`, `groups/by-code/:code`) |
| `myRole` en la lista de chats | `/opt/mirror/app/src/lifebook/lifebook.service.ts` (`chatConversations`) |
| API de la app | `D:\egapp\api\lifebookGrupos.ts` |
| Tipo de enlace | `D:\egapp\api\auth.ts` (`ProfileLink.kind`) |
| Editor del perfil | `D:\egapp\app\edit-profile.tsx` (`ModalGrupo`) |
| Tarjeta en el perfil público | `D:\egapp\app\lifebook-user.tsx` |
| Entrada con código por ruta | `D:\egapp\app\lifebook-groups.tsx` |
| Pruebas | `D:\egapp\pruebas\lb51u-verificar-codigo-caduca.cjs`, `lb51v-verificar-enlace-de-grupo.cjs` |
| Copias de seguridad del servidor | `lifebook.service.ts.bak-invite-caduca-20260214` |
