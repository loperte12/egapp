# Auditoría backend — los tres puntos de la ficha (30-sep-2026)

Orden de Bernardo: «los tres puntos deben entrar… primero audita lo que hay en el backend para
integrarlos». Este acta separa lo MEDIDO (código leído) de lo PROPUESTO.

Los tres puntos excluidos de la ficha: **(1) Contactar alojamiento** · **(2) Escribir opinión desde
la ficha** · **(3) Barras de nota por dimensiones**.

---

## Punto 1 — Chat huésped ↔ hotel

### Lo que existe (medido)

El motor de chat es genérico usuario↔usuario y está completo en
`backend/server-src/lifebook/lifebook.controller.ts` (PARTE 5, líneas 846-965):

| Ruta | Qué hace |
| --- | --- |
| `POST /lifebook/chat/open` | Abre (o encuentra) la conversación `direct` con otro usuario. DTO `ChatTargetDto { userId }`. |
| `GET /lifebook/chat/conversations` | Bandeja del usuario (el hotelero ya la usa vía `/ecomerse/chats`). |
| `GET /lifebook/chat/conversations/:id/messages` | Mensajes del hilo, con paginación `before/limit`. |
| `POST /lifebook/chat/conversations/:id/messages` | Enviar (texto, `kind` product/system…). |
| `POST /lifebook/chat/conversations/:id/read` | Marcar leído. |
| `GET /lifebook/chat/unread` | Total de no leídos. |

Que el hotel puede ser parte de un hilo **ya está demostrado**: `commerce.service.ts`
(`avisarEnChat`, líneas 2799-2821) crea conversaciones `direct` entre comprador y el
**dueño de la tienda** y le inserta mensajes; el hotel ES una `lifebook.shops` con `owner_id`
(`hotel.service.ts` lo comprueba con `ownsShop` en `replyReview`).

### Lo que falta (medido)

**Un dato: el `ownerId` del hotel.** `GET /hotels/:shopId` (detalle de la ficha) NO devuelve
ni `ownerId` ni teléfono de contacto (`api/hotel.ts`, `HotelDetail`). Sin ese id, la app no
tiene a quién pasarle a `chat/open`. No hay forma honesta de adivinarlo.

### Camino propuesto (sin inventar nada nuevo)

Una de dos, ambas pequeñas:

- **A. Campo en el detalle** — añadir `ownerId` al SELECT del detalle del hotel
  (`hotel.service.ts`, `hotelDetail`) y exponerlo en `HotelDetail`. La ficha abre
  `POST /lifebook/chat/open { userId: ownerId }` y desde ahí todo el motor existente sirve.
- **B. Endpoint dedicado** — `POST /hotels/:shopId/chat` que resuelva el owner en el servidor
  y devuelva `conversationId`. Un pelín más de código, pero no expone el id del dueño al cliente.

En ambos casos la app reutiliza `api/lifebook.ts` (chat ya tipado: `conversations`, `send`,
`markRead`) y una pantalla de hilo; el hotelero lo recibe en su bandeja actual sin cambios.

---

## Punto 2 — Escribir opinión desde la ficha

### Lo que existe (medido) — SUFICIENTE, no falta backend

- `POST /hotels/:shopId/reviews` (`hotel.service.ts:1488`): exige `reservationId` propio,
  de ese hotel y con `status='checked_out'`; texto opcional; una reseña por estancia
  (`23505` → `REVIEW_EXISTS` 409); espejo de nota en la misma transacción.
- `GET /reservations/mine` devuelve las reservas del huésped con `shopId` y `status`
  (`api/hotel.ts:232`) → la ficha puede descubrir las estancias terminadas de ESE hotel.
- La pantalla de escritura ya existe y es completa: `app/lifebook-hotel-resena.tsx`
  (estrellas del kit, texto opcional 600, reglas del 026, manejo de error).

### El matiz honesto

La ficha la ve cualquiera, pero el permiso es por estancia: el botón solo se activa para
quien tiene una estancia `checked_out` de ese hotel. Plan:

1. Al pulsar «Escribir opinión», la ficha pide `reservations/mine` y filtra
   `status === 'checked_out' && shopId === este`.
2. Una estancia → abre `lifebook-hotel-resena` directamente con esa reserva.
   Varias → selector. Ninguna → no se ofrece (se muestra la regla, no un botón muerto).
3. Si la estancia ya tenía reseña, el servidor responde `REVIEW_EXISTS` y la pantalla ya lo
   pinta — no hace falta prever nada más.

---

## Punto 3 — Barras de nota por dimensiones

### Lo que existe (medido)

`backend/sql/026_hotel_resenas.sql` (leído completo): `lifebook.hotel_reviews` tiene
`rating smallint 1..5` + `body varchar(600)` + `reply/replied_at`. **NO hay columnas de
dimensiones** (limpieza/servicio/ubicación/instalaciones). El espejo
(`hotel_profiles.hotel_rating/hotel_rating_count`) tampoco las agrega.

### Conclusión

Sin migración no hay barras: hoy el servidor no puede dar ese dato porque no existe. Requiere:

1. **Migración `027`** — columnas opcionales (`cleanliness/service/location/facilities
   smallint NULL CHECK 1..5`) en `hotel_reviews`.
2. `createReview` acepta las cuatro (opcionales) y `GET /hotels/:id/reviews` devuelve medias.
3. La app muestra las barras solo cuando el servidor las trae (degradación elegante: sin datos
   no se dibujan barras vacías).

Aplicar migraciones es de Bernardo (la ventana SSH está vetada para el agente).

---

## Resumen de decisión

| Punto | ¿Existe backend? | Coste |
| --- | --- | --- |
| 1 · Chat | Motor sí; falta exponer el destino (owner) | Cambio mínimo (A o B) + pantalla de hilo en la app |
| 2 · Opinión en ficha | Todo existe | Solo app: descubrir la estancia y reutilizar la pantalla actual |
| 3 · Dimensiones | No existe | Migración 027 + service + DTO + app |
