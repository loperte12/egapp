-- =============================================================================
-- 022 — La AGENDA DE DIRECCIONES del comprador del Mercado (Fase 2 del pie)
--
-- QUÉ RESUELVE
-- Hasta hoy el checkout pedía la dirección en un campo de texto libre y la mandaba
-- en `wallet.ecomerse_orders.delivery_address` (text). Eso deja tres cosas sin
-- resolver: el comprador la re-teclea en cada compra, no puede tener más de una, y
-- lo que se guarda es lo que le apetezca escribir (hoy hay un «Mirror E2E» de
-- prueba). Esta tabla es una AGENDA: N direcciones por usuario, una de ellas
-- predeterminada, y el checkout ELIGE en vez de teclear.
--
-- LO QUE **NO** CAMBIA, y es deliberado
-- `ecomerse_orders.delivery_address` se queda como está (text) y la agenda NO se une
-- al pedido por FK. La línea del pedido tiene que quedar CONGELADA: si el comprador
-- edita o borra su dirección después, el pedido tiene que seguir contando dónde se
-- entregó. El pedido copia el texto al comprar y eso ya funciona así.
-- (Misma lección que la Fase 4 del SKU: la línea del pedido se congela.)
--
-- REFERENCIA: `ums_member_receive_address` de macrozheng/mall es una tabla PLANA con
-- bandera de predeterminada. Se copia la FORMA, no el esquema (§6 del plan).
--
-- Idempotente: se puede aplicar dos veces sin efecto. Sin DML.
-- =============================================================================

-- ── 1. La agenda ─────────────────────────────────────────────────────────────
create table if not exists wallet.ecomerse_addresses (
  id          uuid primary key default gen_random_uuid(),
  /* SIN FK a `mobility.users`, a propósito: es el MISMO patrón que
     `wallet.ecomerse_favorites.user_id`, que tampoco la tiene. La tabla vive en
     `wallet` y el usuario en `mobility`, y el histórico del Mercado no debe depender
     de que la fila del usuario siga existiendo. Deuda consciente y dicha: si algún día
     se borra un usuario, quedan sus direcciones; las limpia quien borre al usuario. */
  user_id     uuid not null,
  recipient   varchar(80)  not null,   -- quién recibe («María Nsue»)
  phone       varchar(24)  not null,   -- a qué número llama el agente al llegar
  /* La CIUDAD no se cierra con un CHECK a ('Malabo','Bata'): mañana hay una tercera y
     una migración por eso sería un mal precio. La cierran dos cosas mejores — la app
     la ELIGE de las zonas que existen, y el servicio comprueba contra
     `ecomerse_delivery_zones` que la ciudad tenga reparto activo (y que la zona
     elegida sea de ESA ciudad, que es lo que impide una dirección incoherente). */
  city        varchar(40)  not null,
  /* La zona SÍ lleva FK, y con `on delete set null`: si un admin retira una zona de
     reparto, la dirección no desaparece ni apunta al vacío — se queda sin zona y el
     checkout volverá a preguntarla. Es la diferencia entre degradar y romperse. */
  zone_id     uuid references wallet.ecomerse_delivery_zones(id) on delete set null,
  detail      varchar(240) not null,   -- la calle y cómo llegar
  landmark    varchar(120),            -- «frente al mercado», «portón verde»
  label       varchar(20),             -- Casa · Trabajo · Otro (texto libre; la app sugiere)
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── 2. Lo que NO puede entrar ────────────────────────────────────────────────
-- `not null` no impide la cadena vacía ni la de espacios: sin estos mínimos, un
-- formulario enviado en blanco deja una dirección impecablemente nula por dentro.
alter table wallet.ecomerse_addresses drop constraint if exists ec_addr_recipient_check;
alter table wallet.ecomerse_addresses add constraint ec_addr_recipient_check
  check (char_length(btrim(recipient)) >= 2);
alter table wallet.ecomerse_addresses drop constraint if exists ec_addr_phone_check;
alter table wallet.ecomerse_addresses add constraint ec_addr_phone_check
  check (char_length(btrim(phone)) >= 6);
alter table wallet.ecomerse_addresses drop constraint if exists ec_addr_detail_check;
alter table wallet.ecomerse_addresses add constraint ec_addr_detail_check
  check (char_length(btrim(detail)) >= 5);

-- ── 3. UNA SOLA predeterminada por usuario — y lo impide la base ──────────────
-- La regla vive también en el servicio (que desmarca la anterior al marcar una), pero
-- eso es solo CÓDIGO. El día que un camino nuevo escriba direcciones sin pasar por él,
-- el comprador tendría dos «predeterminadas» y el checkout elegiría una de las dos al
-- azar. Índice ÚNICO PARCIAL: solo cuenta las filas con la bandera puesta, así que las
-- demás pueden ser todas `false` sin límite.
create unique index if not exists uq_ec_addr_default
  on wallet.ecomerse_addresses (user_id) where is_default;

-- El orden de la agenda: la predeterminada primero, y dentro, la más reciente.
-- `is_default desc` en el índice porque es como se lee siempre.
create index if not exists ix_ec_addr_user
  on wallet.ecomerse_addresses (user_id, is_default desc, created_at desc);

-- ── 4. El TOPE de direcciones por usuario NO está aquí, y por qué ────────────
-- Un `check` no puede contar filas de la misma tabla. El tope (20) lo aplica el
-- servicio contando antes de insertar. Se dice en voz alta para que nadie lo busque
-- en la base y concluya que no existe.

-- ── 5. Comprobación (informativa) ────────────────────────────────────────────
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema='wallet' and table_name='ecomerse_addresses' order by ordinal_position;
--   select indexname, indexdef from pg_indexes
--    where schemaname='wallet' and tablename='ecomerse_addresses';
--   -- y el candado, probado de verdad (dentro de una transacción que NO se confirma):
--   begin;
--     insert into wallet.ecomerse_addresses (user_id, recipient, phone, city, detail, is_default)
--     values ('<uuid-de-prueba>','A','+240000000','Malabo','una calle larga', true),
--            ('<uuid-de-prueba>','B','+240000001','Malabo','otra calle larga', true);
--   rollback;   -- debe fallar con 23505 en uq_ec_addr_default
