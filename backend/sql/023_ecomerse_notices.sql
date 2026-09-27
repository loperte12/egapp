-- =============================================================================
-- 023 — LOS DOS CANALES DE AVISOS del comprador del Mercado (Fase 3 del pie)
--
-- QUÉ RESUELVE
-- El destino «Mensajes» del Mercado tiene que enseñar dos canales del sistema
-- (交易通知 *avisos de transacción* y 物流助手 *asistente de logística*) con su
-- contador de no leídos y su «marcar todo leído». Hoy NO existe ninguna tabla de
-- notificaciones en toda la base: lo único que hay es el historial crudo del pedido
-- (`wallet.ecomerse_order_events`, un registro de TRANSICIONES: from_status →
-- to_status) y el envío (`wallet.ecomerse_shipments`).
--
-- POR QUÉ MATERIALIZAR Y NO DERIVAR (decisión §5.a del plan, cerrada el 22-sep)
-- Derivar los avisos de los eventos costaría cero tablas y siempre serían coherentes
-- con el pedido… pero **no saben de «leído»**. Las capturas de referencia tienen
-- contador por canal y «一键已读» (*marcar todo leído*), y eso sin una fila por aviso
-- no se puede pintar: no hay dónde poner la marca. Materializar da las tres cosas
-- (contador, marcar leído, y que el aviso sobreviva a que el pedido cambie) a cambio
-- de una tabla y de mantenerla escrita. Se paga gustoso.
--
-- DE QUIÉN ES EL AVISO
-- `user_id` = **el comprador del pedido**. No lo elige quien llama: se resuelve
-- contra `ecomerse_orders.buyer_id` en la MISMA sentencia que escribe el aviso
-- (ver el servicio). Así no hay que enhebrar el destinatario por los siete sitios
-- que escriben un evento, que es donde se olvidaría.
--
-- Idempotente: se puede aplicar dos veces sin efecto. Sin DML.
-- (El relleno de los avisos HISTÓRICOS va en un script aparte, no aquí: esta casa
--  mantiene las migraciones de esquema sin DML.)
-- =============================================================================

-- ── 1. El aviso ──────────────────────────────────────────────────────────────
create table if not exists wallet.ecomerse_notices (
  id          uuid primary key default gen_random_uuid(),
  /* SIN FK a `mobility.users`, a propósito y por el mismo motivo que
     `ecomerse_favorites.user_id` y `ecomerse_addresses.user_id`: la tabla vive en
     `wallet` y el usuario en `mobility`, y el histórico del Mercado no debe depender
     de que la fila del usuario siga existiendo. */
  user_id     uuid not null,
  /* CON FK y `on delete cascade`, al revés que `user_id`: un aviso ES sobre un
     pedido — si el pedido desapareciera, el aviso no sería un histórico, sería una
     fila hablando de nada. Nullable porque un aviso de cuenta (sin pedido) es
     concebible; hoy todos los que escribe el servicio llevan pedido. */
  order_id    uuid references wallet.ecomerse_orders(id) on delete cascade,
  /* Los dos canales. SÍ se cierran con CHECK, al revés que la ciudad de las
     direcciones, y la diferencia es quién manda en la lista: las ciudades las
     gobierna el DATO (un admin da de alta una zona y aparece sola, sin desplegar),
     mientras que los canales los gobierna el CÓDIGO (un canal nuevo necesita su
     pantalla). Sin el CHECK, un `'transaccion'` mal escrito crearía un tercer canal
     invisible: el error más caro de los dos. */
  channel     varchar(16) not null,
  /* El HECHO que se avisa, no el texto: `order_created`, `order_confirmed`,
     `order_shipped`, `order_delivered`, `order_cancelled`, `order_disputed`,
     `dispute_resolved`, `shipment_assigned`. El rótulo vive en el servicio (un solo
     sitio), y el código permite contar y depurar sin mirar el texto. */
  code        varchar(40) not null,
  title       varchar(120) not null,
  body        varchar(400),
  /* NULL = NO LEÍDO. Es la única marca que hace falta: no hay estado «archivado». */
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

-- ── 2. Lo que NO puede entrar ────────────────────────────────────────────────
alter table wallet.ecomerse_notices drop constraint if exists ec_notice_channel_check;
alter table wallet.ecomerse_notices add constraint ec_notice_channel_check
  check (channel in ('transaction', 'logistics'));
-- `not null` no impide la cadena vacía: un aviso impecablemente mudo es peor que ninguno.
alter table wallet.ecomerse_notices drop constraint if exists ec_notice_text_check;
alter table wallet.ecomerse_notices add constraint ec_notice_text_check
  check (char_length(btrim(code)) > 0 and char_length(btrim(title)) > 0);

-- ── 3. UN aviso por HECHO, y lo impide la base ───────────────────────────────
-- El servicio ya escribe el aviso en la misma sentencia que el evento, así que en el
-- camino normal no hay duplicados. Pero hay un camino que SÍ puede repetir el hecho:
-- resolver dos veces la misma disputa (el endpoint no guarda «ya resuelta»), y ahí el
-- comprador recibiría dos «reclamación resuelta» idénticos. El índice lo hace
-- imposible y el INSERT usa `on conflict do nothing`: el segundo intento no falla,
-- simplemente no añade ruido. (Con `order_id` nulo, Postgres trata cada NULL como
-- distinto, así que un futuro aviso de cuenta no colisiona consigo mismo.)
create unique index if not exists uq_ec_notice_order_code
  on wallet.ecomerse_notices (order_id, code);

-- El orden en que se leen los avisos y, sobre todo, el CONTADOR de no leídos.
-- El índice es PARCIAL (`where read_at is null`) porque el contador es la consulta
-- que más se hace y sólo mira los no leídos: así no crece con el histórico ya leído.
create index if not exists ix_ec_notice_unread
  on wallet.ecomerse_notices (user_id, channel) where read_at is null;

create index if not exists ix_ec_notice_user
  on wallet.ecomerse_notices (user_id, created_at desc);

-- ── 4. Comprobación (informativa) ────────────────────────────────────────────
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema='wallet' and table_name='ecomerse_notices' order by ordinal_position;
--   select indexname, indexdef from pg_indexes
--    where schemaname='wallet' and tablename='ecomerse_notices';
--   -- y los candados, probados de verdad (dentro de una transacción que NO se confirma):
--   begin;
--     insert into wallet.ecomerse_notices (user_id, channel, code, title)
--     values ('<uuid-de-comprador>','transaccion','x','prueba');   -- debe fallar: CHECK de canal
--     insert into wallet.ecomerse_notices (user_id, channel, code, title)
--     values ('<uuid-de-comprador>','transaction','','prueba');    -- debe fallar: CHECK de texto
--   rollback;
--   -- y la unicidad, con un pedido real:
--   begin;
--     insert into wallet.ecomerse_notices (user_id, order_id, channel, code, title)
--     values ('<uuid>','<uuid-pedido>','transaction','order_created','uno'),
--            ('<uuid>','<uuid-pedido>','transaction','order_created','dos');  -- debe dar 23505
--   rollback;
