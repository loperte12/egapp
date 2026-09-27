-- =============================================================================
-- 025 — LAS TIENDAS QUE SIGUE el comprador del Mercado (Fase 6 del pie)
--
-- QUÉ RESUELVE
-- El destino «Perfil» del Mercado tiene una fila, 店铺关注 (*tiendas que sigo*),
-- que la Fase 1 dejó encendida de mentira: su nota dice hoy «Todavía no se puede
-- seguir una tienda del Mercado.» y no lleva a ninguna parte. No es un olvido de
-- entonces: era la verdad. Seguir una tienda no tenía dónde guardarse, así que no
-- se podía seguir ninguna. Esta tabla es ese sitio.
--
-- POR QUÉ UNA TABLA Y NO UNA BANDERA EN `ecomerse_sellers`
-- Una bandera por tienda («seguida por N») no puede decir QUÉ comprador la sigue,
-- y la lista del comprador necesita lo contrario: sus tiendas. La relación es de
-- N a N y el sitio natural de una N a N es una tabla con las dos claves.
--
-- QUÉ SE AÑADE, Y POR QUÉ ASÍ
--   · `user_id` — quién sigue. SIN FK **a propósito**: es el MISMO patrón (y el
--     mismo motivo) que `wallet.ecomerse_favorites.user_id` y
--     `wallet.ecomerse_addresses.user_id`. La tabla vive en `wallet` y el usuario
--     en `mobility`; el histórico del Mercado no debe depender de que la fila del
--     usuario siga existiendo. Deuda consciente y dicha: si algún día se borra un
--     usuario, quedan sus seguimientos; los limpia quien borre al usuario.
--   · `seller_id` — a quién sigue. **SÍ lleva FK, y con `on delete cascade`**, y la
--     diferencia con la línea de arriba es el motivo, no el capricho: la tienda vive
--     en la MISMA base y el MISMO esquema (`wallet.ecomerse_sellers`), así que la FK
--     se puede escribir y además es lo correcto — un seguimiento a una tienda que ya
--     no existe no es historia, es basura. Lo que NO se hace es seguir la baja
--     lógica: `status='disabled'` es una tienda que existe y está apagada, y su
--     fila de seguimiento se queda (el comprador la sigue si vuelve; lo que hace la
--     lista es no enseñarla mientras está apagada — ver el servicio).
--   · `created_at` — desde cuándo. Es el orden de la lista (la más reciente
--     arriba), igual que en favoritos.
--
-- LA CLAVE PRIMARIA ES LA REGLA, y no hace falta una segunda
-- `primary key (user_id, seller_id)` impide por sí sola seguir dos veces la misma
-- tienda: no es un índice para ir rápido, es la restricción que hace que el
-- «toggle» del servicio pueda ser un INSERT/DELETE sin comprobar nada más. Si esa
-- clave no estuviera, dos toques seguidos en un botón lento dejarían dos filas y la
-- lista enseñaría la misma tienda dos veces.
--
-- EL ÚNICO ÍNDICE DE MÁS, y por qué
-- La clave primaria ya sirve la consulta «mis tiendas» (empieza por `user_id`), así
-- que no se añade ningún índice por ese lado. El que falta es el del OTRO lado:
-- contar cuántos seguidores tiene una tienda lee por `seller_id`, y eso la PK no lo
-- cubre. Hoy el dato es pequeño; el índice se pone ahora porque añadirlo después,
-- con la tabla ya llena, cuesta más que escribirlo hoy en una línea.
--
-- QUÉ **NO** TRAE ESTA MIGRACIÓN, dicho para que nadie lo busque
--   · **Ni aviso ni notificación al vendedor.** Seguir no genera evento, así que no
--     hay `ecomerse_notices` que escribir: la Fase 3 materializó los avisos que
--     acompañan a un hecho del pedido, y esto no es un hecho del pedido. El
--     vendedor verá el número de seguidores el día que su zona lo enseñe.
--   · **Ni contador desnormalizado en la tienda.** El número se cuenta con un
--     `count(*)`; copiarlo en una columna de `ecomerse_sellers` sería un segundo
--     sitio donde el mismo número se puede quedar viejo.
--   · **Ni DML.** Esta casa mantiene las migraciones de esquema sin datos. El
--     relleno de prueba va en script aparte, si hace falta.
--
-- Idempotente: se puede aplicar dos veces sin efecto.
-- =============================================================================

-- ── 1. La tabla ──────────────────────────────────────────────────────────────
create table if not exists wallet.ecomerse_store_follows (
  /* Sin FK: el usuario vive en `mobility`, no en `wallet`. Ver la cabecera. */
  user_id     uuid        not null,
  /* Con FK y `cascade`: la tienda vive en este mismo esquema. Ver la cabecera.
     `on delete cascade` y no `set null` porque una fila de seguimiento sin tienda
     no significa nada: no es un dato al que le falte un detalle, es un dato sin
     sujeto. (Al revés que `addresses.zone_id`, donde `set null` SÍ tenía sentido:
     una dirección sin zona sigue siendo una dirección.) */
  seller_id   uuid        not null references wallet.ecomerse_sellers(id) on delete cascade,
  created_at  timestamptz not null default now(),
  /* LA REGLA, no un atajo: impide seguir dos veces la misma tienda. */
  constraint pk_ec_store_follow primary key (user_id, seller_id)
);

-- ── 2. El índice del otro lado ───────────────────────────────────────────────
-- «¿Cuántos siguen esta tienda?» lee por `seller_id`, y la clave primaria empieza
-- por `user_id`, así que no lo cubre. El de «mis tiendas» no hace falta: la PK ya
-- empieza por `user_id`, y añadir otro sería un índice que nunca se elige.
create index if not exists ix_ec_store_follow_seller
  on wallet.ecomerse_store_follows (seller_id);

-- ── 3. Comprobación (informativa) ────────────────────────────────────────────
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema='wallet' and table_name='ecomerse_store_follows' order by ordinal_position;
--   select indexname, indexdef from pg_indexes
--    where schemaname='wallet' and tablename='ecomerse_store_follows';
--   -- y los dos candados, probados de verdad (dentro de una transacción que NO se confirma):
--   begin;
--     -- (a) seguir DOS VECES la misma tienda: debe fallar con 23505 en pk_ec_store_follow;
--     insert into wallet.ecomerse_store_follows (user_id, seller_id)
--     values ('<uuid-de-usuario>', (select id from wallet.ecomerse_sellers limit 1)),
--            ('<uuid-de-usuario>', (select id from wallet.ecomerse_sellers limit 1));
--   rollback;
--   begin;
--     -- (b) seguir una tienda que no existe: debe fallar con 23503 (la FK);
--     insert into wallet.ecomerse_store_follows (user_id, seller_id)
--     values ('<uuid-de-usuario>', '00000000-0000-0000-0000-000000000000');
--   rollback;
--   begin;
--     -- (c) un usuario que no existe en `mobility.users` SÍ debe pasar: es la
--     --     ausencia deliberada de FK la que lo permite, no un descuido;
--     insert into wallet.ecomerse_store_follows (user_id, seller_id)
--     values ('00000000-0000-0000-0000-000000000001', (select id from wallet.ecomerse_sellers limit 1));
--   rollback;
