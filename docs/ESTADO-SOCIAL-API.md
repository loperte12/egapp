# Estado 24 h · capa social (me gusta, comentarios, respuestas y avisos)

Backend **terminado y verificado contra la API real**. Fecha: 2026-09-14.
Pendiente solo la parte de app (ver «Lo que falta», al final).

## Qué se construyó

Antes, un estado 24 h no se podía ni like ni comentar (el usuario lo dijo así:
«el estado no se da like, comentar»). Ahora sí, con la forma de datos del Life
Book para que el cliente pueda reutilizar el mismo componente de comentarios.

| Pieza | Dónde |
|---|---|
| Tablas nuevas | `mobility.status_reactions`, `status_comments`, `status_comment_likes`, `status_comment_notices` |
| DDL (fuente de verdad) | `backend/sql/004_estado_social.sql` · en el servidor `sql/mobility/20260214_estado_social.sql` |
| Servicio | `src/mobility/status-social.service.ts` (nuevo, 1 fichero) |
| Rutas | `src/mobility/status.controller.ts` (15 rutas nuevas) |
| Preferencias | `src/mobility/status.service.ts` → `allowComments` (además de `allowReactions`) |
| Errores | `src/http/error.filter.ts` → `STATUS_ID_INVALID`, `COMMENT_ID_INVALID`, `REACTIONS_DISABLED` |
| Prueba | `pruebas/lb51q-verificar-estado-social.cjs` — **99 comprobaciones, 99 pasan** |

## Endpoints (prefijo real `/wallet/api/v1/mobility/status`)

### Me gusta

| Método | Ruta | Devuelve |
|---|---|---|
| POST | `/:id/reaction` `{ reaction? }` | `{ liked, reaction, likeCount, commentCount, likedByMe, reactionsAllowed, commentsAllowed }` |
| DELETE | `/:id/reaction` | lo mismo con `liked: false` |
| GET | `/:id/reactions?limit=` | `{ total, items: [{ at, reaction, mine, user }] }` |

- Idempotente: repetir no duplica. Cambiar de reacción actualiza la existente.
- Códigos válidos: `like` `love` `agree` `thanks` `wow` `concern` `fire`
  (los mismos del Life Book). Cualquier otro valor cae a `like` **sin error**.
- **Se permite el autolike** (igual que en el Life Book) y no genera aviso propio.

### Comentarios y respuestas

| Método | Ruta | Devuelve |
|---|---|---|
| GET | `/:id/comments?limit=&offset=` | `{ comments: [Comentario], total, nextOffset }` (raíces, más antiguo primero) |
| POST | `/:id/comments` `{ body \| text, parentId? }` | el comentario creado (`Comentario`) |
| GET | `comments/:id/replies?limit=&offset=` | `{ parentId, replyTo: { id, fullName }, total, replies: [Comentario] }` |
| DELETE | `comments/:id` | `{ deleted: true, id }` — puede el autor del comentario, el dueño del estado o un **ADMIN** (moderación) |
| POST | `comments/:id/like` | `{ liked: true, likes }` |
| DELETE | `comments/:id/like` | `{ liked: false, likes }` |

`Comentario` — misma forma que `LbComment` del Life Book:

```json
{
  "id": "uuid", "statusId": "uuid", "parentId": null,
  "body": "texto", "createdAt": "2026-09-13T…Z", "editedAt": null,
  "likes": 0, "likedByMe": false, "repliesCount": 0,
  "mine": true,
  "author": { "id": "uuid", "fullName": "Nombre", "avatarUrl": "/wallet/…", "role": "PASSENGER" }
}
```

En las respuestas se añade `replyToName` (nombre del autor del comentario raíz),
igual que en el Life Book.

### Avisos (bandeja del autor)

| Método | Ruta | Devuelve |
|---|---|---|
| GET | `me/inbox-counts` | `{ likes, comments, replies, commentLikes, total }` (sin leer) |
| GET | `me/reactions-received?limit=` | `[{ at, read, reaction, user, status }]` |
| GET | `me/comments-received?limit=` | `[{ id, body, at, read, isReply, user, status }]` |
| GET | `me/replies-received?limit=` | `[{ id, body, at, read, isReply: true, replyTo, user, status }]` |
| GET | `me/comment-likes-received?limit=` | `[{ at, read, comment, user, status }]` |
| POST | `me/inbox/read` `{ kind }` | `{ ok, kind, marked, counts }` |

- `kind`: `likes` · `comments` · `replies` · `commentLikes`.
- `status` es un resumen: `{ id, preset: { code, emoji, label, bg }, text, thumb: { id, url } | null, startedAt, expiresAt }`.
- El estado que devuelven `GET /status/me` y `GET /status/users/:userId` ahora
  incluye `likeCount`, `commentCount`, `likedByMe`, `reactionsAllowed` y
  `commentsAllowed`, para que el visor sepa qué pintar sin otra llamada.

## Códigos de error

| Código | HTTP | Cuándo |
|---|---|---|
| `STATUS_ID_INVALID` | 400 | id de estado mal formado |
| `STATUS_NOT_FOUND` | 404 | no existe, ya caducó, ya se terminó o no lo puedes ver |
| `COMMENT_ID_INVALID` | 400 | id de comentario mal formado (también `parentId`) |
| `COMMENT_NOT_FOUND` | 404 | el comentario (o el padre) no existe o no es de este estado |
| `COMMENT_FORBIDDEN` | 403 | no eres el autor del comentario, ni el del estado, ni ADMIN |
| `COMMENT_REQUIRED` | 400 | comentario vacío |
| `COMMENT_TOO_LONG` | 400 | más de 500 caracteres |
| `TEXT_FORBIDDEN` | 400 | teléfono, correo o enlace en el comentario |
| `REACTIONS_DISABLED` | 400 | el autor apagó las reacciones |
| `COMMENTS_DISABLED` | 400 | el autor apagó los comentarios |
| `USER_BLOCKED` | 403 | hay un bloqueo entre los dos |
| `INBOX_KIND_INVALID` | 400 | bandeja desconocida en `me/inbox/read` |

Regla de la casa respetada: **id mal formado = 400; no existe / no lo ves = 404**
(los dos casos de 404 son el mismo código a propósito, para no revelar si el
estado existe). Y «el autor lo apagó» = 400; 403 se reserva a permisos y
relaciones.

## Decisiones (y por qué)

1. **Los me gusta y los comentarios mueren con el estado**, como se pidió. Ojo:
   la cascada de la base de datos **no bastaba**. Terminar un estado solo lo marca
   `ended` y expirar lo marca `expired`; la fila del estado no se borra nunca (se
   conserva para la moderación: `status_reports` apunta a ella). Comprobado: tras
   terminar un estado seguían sus 3 comentarios y su reacción en la base. Por eso
   hay una **purga explícita** (`purgarInteraccionesDeEstadosInactivos`) que corre
   al arrancar y cada 5 minutos — la misma cadencia que la higiene de fotos que ya
   existía. Es idempotente y no borra nada visible (interactuar con un estado no
   activo ya devuelve 404).
2. **Las respuestas se aplanan a un nivel**: responder a una respuesta cuelga la
   nueva del comentario raíz (como Instagram o YouTube) y avisa a quien se
   respondió de verdad. Así ninguna respuesta puede quedar invisible.
3. **Un aviso por hecho, nunca dos**: si a quien respondes es el autor del estado,
   no se crea aviso de respuesta — ese aviso llega por la fila del comentario
   (bandeja `comments`, con `isReply: true`). Cada aviso se marca leído en su
   bandeja, sin duplicados.
4. **Nadie se avisa a sí mismo**: si interactúas con lo tuyo, la fila nace leída.
5. **Bloqueos**: si cualquiera de los dos bloqueó al otro, no hay reacción ni
   comentario (403). El Life Book **no** lo comprueba en likes ni comentarios;
   aquí sí, porque bloquear a alguien que luego te comenta no sirve de nada.
   (Aviso: `StatusService` todavía no aplica bloqueos al *mostrar* un estado.)
6. **`allow_comments` es nuevo** en las preferencias del autor (junto a
   `allowReactions`, que ya existía). El autor siempre puede interactuar con lo
   suyo; los demás reciben 400 si lo apagó.
7. La **longitud del comentario la valida el servicio**, no el DTO: con
   `@MaxLength` el `ValidationPipe` de Nest contesta con su propio formato de
   error y el cliente recibiría dos formatos distintos para lo mismo.
8. `state` en `status_comments` es espejo del Life Book y hoy siempre vale
   `'active'`; queda para que la moderación pueda retirar un comentario sin
   borrarlo. La edición (`editedAt`) también está preparada pero no hay endpoint.

## Verificación

`node pruebas/lb51q-verificar-estado-social.cjs` → **99 pasan, 0 fallan**, con dos
cuentas reales (`+240222000123` dueña del estado, `+240555000003` interactuando):
reaccionar/cambiar/quitar, comentar, responder, responder a una respuesta,
me gusta en comentarios, las cuatro bandejas, marcar leído, los 11 errores, las
preferencias del autor, los bloqueos, el borrado en cascada del comentario padre y
la desaparición de todo al terminar el estado.

La cascada y la purga se comprobaron además **en la base de datos**, no solo por la
API:

```
antes de la purga : reacciones=1  comentarios=3
después           : reacciones=0  comentarios=0  (y los 52 estados, intactos)
```

## Tres fallos de producción encontrados de paso (y arreglados)

Salió del log del servidor, no de una suposición. Los dos son el mismo error de
fondo: un cast `::uuid` **dentro** de la interpolación de un parámetro, que hace
que Prisma envíe el texto `"<uuid>::uuid"` a una columna uuid.

1. **`GET /lifebook/posts/:id` daba 500 en publicaciones `followers`.**
   Cualquiera que no fuera el autor —incluido un seguidor legítimo— recibía
   «Error interno». Medido en vivo antes del arreglo (500 para el usuario de prueba
   y para el admin que sí le sigue; 200 solo para el autor) y después
   (404 el que no la sigue, 200 quien sí la sigue). O sea: la visibilidad
   `followers` **no funcionaba en absoluto**.
2. **La auditoría de los cambios de estado de un debate fallaba si actuaba un
   administrador** (`lifebook.mod_actions`), devolviendo 500 y dejando la operación
   sin auditar. Prueba en la base: 30 auditorías de debate con `admin_id` nulo (las
   del sistema) y **ninguna** con admin; tras el arreglo, la primera:
   `debate_open | admin=ec6bb87f-…`.

3. **Los comentarios de una publicación no comprobaban la visibilidad de la
   publicación.** Medido en vivo con una nota `private` ajena
   (`pruebas/../probar-comentarios-privados.cjs`): el detalle devolvía 404, pero
   **leer los comentarios devolvía 200 con el comentario privado** y **escribir uno
   nuevo devolvía 201**. La única barrera era no conocer el id. Arreglado con un
   guardián `assertPostVisible` (las mismas reglas que el detalle: activa o tuya,
   sin bloqueo, `private` solo el autor, `followers` exige seguimiento) aplicado a
   `comment`, `comments`, `commentsPage`, `commentReplies`, `commentLike` y
   `commentUnlike` — este último antes **ni comprobaba que el comentario
   existiera**. Verificado después: `SIN FUGA · 7/7`.

Parche: `src/lifebook/lifebook.service.ts`, con copia de seguridad
`lifebook.service.ts.bak-cast-uuid-20260214` (fallos 1 y 2) y
`lifebook.service.ts.bak-visib-coment-20260214` (fallo 3).

## Lo que falta (ronda de app)

1. **Corazón y comentarios en el visor del estado** (`components/status/…`):
   usar `reactionsAllowed` / `commentsAllowed` del propio estado para no pintar un
   botón que el servidor va a rechazar, y `likeCount` / `commentCount` / `likedByMe`.
2. **Comentarios**: reutilizar `CommentsSheet` con un adaptador, o hacer uno
   propio. Campos ya espejados (`likes` · `likedByMe` · `repliesCount` ·
   `replyToName` · `editedAt` · `author`). Diferencia a tener en cuenta: aquí el
   `GET` devuelve siempre `{ comments, total, nextOffset }` (el Life Book devuelve
   un array si no se pide página).
3. **Bandeja de avisos**: los cuatro contadores y sus listas. Decidir dónde se
   muestran sin tocar las pantallas de mensajes (candidato natural: dentro del
   propio estado, «quién ha reaccionado» + «comentarios»).
4. **Lista de quién reaccionó**: `GET /:id/reactions` ya devuelve nombres y avatares.
5. Opcional: interruptor de comentarios en los ajustes del estado (el backend ya
   acepta `allowComments`).

## Cómo desplegar (por si hay que repetirlo)

```bash
cd /opt/mirror/app
python3 parche_estado_social.py        # idempotente, aborta si un ancla no cuadra
npx tsc -p tsconfig.json               # tiene que salir 0
pm2 restart malabogo-api
pm2 logs malabogo-api --nostream --lines 50 | grep -i purgad   # la purga corre al arrancar
```

El DDL se aplica como superusuario (`mobility_app` no tiene `CREATE` en el esquema
`mobility`; el dueño es `postgres`):

```bash
docker exec -i mirror-postgres psql -U postgres -d egrouteplan -v ON_ERROR_STOP=1 \
  < sql/mobility/20260214_estado_social.sql
```
