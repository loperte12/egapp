-- =============================================================================
-- 026 — LAS RESEÑAS DEL HOTEL: la nota del ALOJAMIENTO, no la del mercado
--
-- QUÉ RESUELVE
-- La ficha del hotel hereda hoy su nota de `shops.rating` — la nota de la TIENDA,
-- que valora lo que se compra, no cómo se duerme. Si un hotel vende además como
-- tienda, esa columna mezcla dos juicios distintos en un solo número, y ninguno de
-- los dos dice la verdad que el huésped necesita antes de reservar. El dossier lo
-- tiene decidido (§8.1): la nota del hotel se calcula de reseñas PROPIAS, una por
-- estancia, y `shops.rating` no se toca — sigue siendo la nota del mercado.
--
-- POR QUÉ UNA TABLA NUEVA Y NO UNA COLUMNA EN `shops`
-- Mismo motivo que §8.1 dio para el modelo: no es una segunda nota del mismo
-- juicio, es OTRO juicio. Mezclarlo en la misma fila es lo que hoy pasa y lo que
-- hay que deshacer. Además el permiso de escribir es la RESERVA, no la compra:
-- una estancia (`checked_out`) es lo que da derecho, y eso vive en
-- `lifebook.reservations`, no en el carrito.
--
-- QUÉ SE AÑADE, Y POR QUÉ ASÍ
--   · `reservation_id` UNIQUE — LA REGLA, no una comprobación: una reseña por
--     estancia. El `unique` es lo que lo garantiza aunque dos peticiones corran a
--     la vez; el servicio no necesita comprobar nada antes de insertar.
--   · `shop_id` — con FK y `on delete cascade`, como las cinco tablas del hotel
--     (`hotel_profiles`, `room_types`): la reseña vive en el MISMO esquema que la
--     tienda, y una reseña de una tienda borrada no es historia, es basura.
--   · `reservation_id` — con FK y `cascade`, igual que `reservation_nights`: la
--     reseña EXISTE porque existe la estancia. Borrarla a mano (purga de ejemplos,
--     §13.3) lleva la reseña consigo, que es justo lo que se quiere.
--   · `guest_id` — con FK y `cascade`, igual que `reservations.guest_id`, que es
--     la misma referencia al mismo sitio. La familia `lifebook` SÍ escribe la FK a
--     `mobility.users` (a diferencia de `wallet.ecomerse_store_follows`, que la
--     omite porque vive en otro esquema): aquí el esquema es `lifebook`, el mismo
--     que `reservations`, así que se escribe y además es lo correcto.
--   · `rating smallint 1..5` — la escala que la app ya usa (`stars`). El CHECK
--     impide un 0 o un 6 aunque el servicio se equivoque.
--   · `body varchar(600)` — el tope de este módulo (`house_rules`,
--     `cancellation_policy`): no se inventa otro. NULO es válido: una reseña de
--     solo estrellas es una reseña.
--   · `reply` + `replied_at` — la respuesta del hotel. Puede llegar después del
--     alta, por eso lleva su propio instante y no comparte `created_at`.
--
-- QUÉ **NO** TRAE ESTA MIGRACIÓN, dicho para que nadie lo busque
--   · **Ni `updated_at`.** La reseña es inmutable en su nota (§8.1): no se edita.
--     Para cambiarla se borra y se vuelve a escribir dentro del plazo de 7 días —
--     y eso solo funciona si el borrado es FÍSICO: una columna de borrado lógico
--     dejaría el `unique` ocupado y haría imposible reescribir. El borrado es
--     duro, y es decisión del modelo, no descuido.
--   · **Ni moderación previa.** No hay `status` ni `published_at`: publicar no
--     pasa por revisión (§8.1). El control es la respuesta del hotel y el borrado
--     del administrador.
--   · **Ni columna de «nota media» en esta tabla** — la nota agregada vive en
--     `hotel_profiles.hotel_rating` (abajo), no aquí.
--
-- LAS COLUMNAS ESPEJO, y por qué aquí SÍ y en 025 NO
-- `ecomerse_store_follows` (025) rechazó copiar el número de seguidores en la
-- tienda: se cuenta con un `count(*)` y copiarlo era un segundo sitio donde el
-- mismo número se puede quedar viejo. Aquí la diferencia es el MOTIVO, no el
-- capricho (§8.1): la búsqueda de hoteles **ordena** por nota y pinta una tarjeta
-- por hotel — agregar con una subconsulta por tarjeta, en cada búsqueda, es el
-- coste que la lista no puede pagar. Espejo: `hotel_profiles.hotel_rating`
-- (numeric(3,2), la nota) y `hotel_profiles.hotel_rating_count` (int, cuántas).
-- **La obligación de mantenerlas es del servicio, en la MISMA transacción del alta
-- y del borrado** — exactamente lo que §8.1 dice. No hay trigger: sería el primero
-- de la familia del hotel, y la lógica escondida en la base es más difícil de
-- auditar que la del servicio. Si el espejo se queda viejo alguna vez, el trigger
-- es el remedio siguiente, no el primero.
--   · El umbral [D-K] («no se publica la nota hasta tener 3 reseñas») NO va en la
--     base: es una constante del servicio. Si se quiere cambiar, no es migración.
--   · Por eso el espejo lleva `default 0` y `not null`: un hotel sin reseñas es
--     «0 con 0 reseñas», y el umbral del servicio decide que eso no se enseña.
--
-- Idempotente: se puede aplicar dos veces sin efecto. Sin DML: esta casa mantiene
-- las migraciones de esquema sin datos.
-- =============================================================================

-- ── 1. La tabla ──────────────────────────────────────────────────────────────
create table if not exists lifebook.hotel_reviews (
  /* La PK de la familia (`reservations`, `room_types`): id con defecto generado
     por la base. §8.1 la exige y sin ella la tabla no tendría clave primaria —
     solo el unique de abajo, que no es una PK. */
  id             uuid        not null default gen_random_uuid(),
  /* El permiso de escribir ES la fila de la reserva: quien hizo una estancia
     `checked_out` (comprueba el servicio, no la base). */
  reservation_id uuid        not null references lifebook.reservations(id) on delete cascade,
  /* Con FK y `cascade`: la tienda vive en este mismo esquema. Ver la cabecera. */
  shop_id        uuid        not null references lifebook.shops(id) on delete cascade,
  /* Misma referencia y mismo comportamiento que `reservations.guest_id`. */
  guest_id       uuid        not null references mobility.users(id) on delete cascade,
  /* La escala que la app ya usa. El candado va abajo, con nombre estable
     (`lb_hr_rating`), porque la comprobación (b) lo cita: un CHECK en línea
     además lo duplicaría. */
  rating         smallint    not null,
  /* El tope de este módulo (600), y no otro. Nulo = reseña de solo estrellas. */
  body           varchar(600),
  /* La respuesta del hotelero: responde, no borra [D-K]. */
  reply          varchar(600),
  replied_at     timestamptz,
  created_at     timestamptz not null default now(),

  /* LA REGLA: una reseña por estancia. Sin ella, dos toques en un botón lento
     dejan dos notas de la misma noche. */
  constraint uq_lb_reviews_reserva unique (reservation_id),
  constraint lb_hr_rating check (rating between 1 and 5),
  /* Nombre por defecto de la familia (`reservations_pkey`, `room_types_pkey`). */
  constraint hotel_reviews_pkey primary key (id)
);

-- ── 2. El índice de la ficha (y del espejo) ──────────────────────────────────
-- La ficha lista las reseñas del hotel de la más reciente abajo o arriba, y el
-- servicio recalcula el espejo por tienda al alta y al borrado: las dos cosas leen
-- por `shop_id`. La clave única empieza por `reservation_id`, así que no lo cubre.
create index if not exists ix_lb_reviews_shop
  on lifebook.hotel_reviews (shop_id, created_at desc);

-- ── 3. El espejo en `hotel_profiles` (§8.1) ─────────────────────────────────
-- Las dos columnas que la búsqueda lee y por las que ordena. `not null default 0`
-- para que un hotel sin reseñas sea «0 con 0» y no un nulo que el mapper tenga que
-- interpretar. Quién las actualiza: el servicio, en la misma transacción (cabecera).
alter table lifebook.hotel_profiles
  add column if not exists hotel_rating        numeric(3,2) not null default 0,
  add column if not exists hotel_rating_count  integer      not null default 0;

comment on column lifebook.hotel_profiles.hotel_rating is
  'Nota del ALOJAMIENTO, espejo de la media de lifebook.hotel_reviews. La de la tienda es shops.rating y no se toca. Lo actualiza el servicio en la misma transacción del alta y del borrado (§8.1).';
comment on column lifebook.hotel_profiles.hotel_rating_count is
  'Cuántas reseñas del hotel hay. Junto a hotel_rating sirve al umbral [D-K]: por debajo de 3, la ficha enseña las reseñas sin cifra.';

-- ── 4. Comprobación (informativa) ────────────────────────────────────────────
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema='lifebook' and table_name='hotel_reviews' order by ordinal_position;
--   select indexname, indexdef from pg_indexes
--    where schemaname='lifebook' and tablename in ('hotel_reviews','hotel_profiles');
--   -- y los tres candados, probados de verdad (dentro de una transacción que NO se confirma):
--   begin;
--     -- (a) DOS reseñas de la MISMA estancia: debe fallar con 23505 en uq_lb_reviews_reserva;
--     insert into lifebook.hotel_reviews (reservation_id, shop_id, guest_id, rating)
--     select id, shop_id, guest_id, 5 from lifebook.reservations limit 1;
--     insert into lifebook.hotel_reviews (reservation_id, shop_id, guest_id, rating)
--     select id, shop_id, guest_id, 5 from lifebook.reservations limit 1;
--   rollback;
--   begin;
--     -- (b) una nota 0 o una 6: debe fallar con 23514 en lb_hr_rating;
--     insert into lifebook.hotel_reviews (reservation_id, shop_id, guest_id, rating)
--     select id, shop_id, guest_id, 6 from lifebook.reservations limit 1;
--   rollback;
--   begin;
--     -- (c) una estancia que no existe: debe fallar con 23503 (la FK);
--     insert into lifebook.hotel_reviews (reservation_id, shop_id, guest_id, rating)
--     values ('00000000-0000-0000-0000-000000000000',
--             (select shop_id from lifebook.reservations limit 1),
--             (select guest_id from lifebook.reservations limit 1), 5);
--   rollback;
--   -- (d) el espejo: la media y el conteo contra la tabla, sin reseñas aún:
--   --   select hotel_rating, hotel_rating_count from lifebook.hotel_profiles;
