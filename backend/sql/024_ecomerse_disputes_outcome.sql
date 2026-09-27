-- =============================================================================
-- 024 — EL VEREDICTO de una reclamación, guardado en su propia fila (Fase 5 del pie)
--
-- QUÉ RESUELVE
-- El destino «Perfil» del Mercado tiene que enseñar 退款售后 (*reembolsos y
-- posventa*): la lista de las reclamaciones del comprador y su ficha, con el
-- estado en tres valores —待处理 / 成功 / 失败—. Hoy la tabla de reclamaciones
-- (`wallet.ecomerse_disputes`) guarda el MOTIVO y si está abierta o resuelta,
-- pero **no guarda el veredicto**: no hay ninguna columna que diga si el dinero
-- volvió al comprador o si la razón se le dio al vendedor.
--
-- POR QUÉ MATERIALIZAR Y NO DERIVAR (mismo criterio que la Fase 3, §5.a)
-- Parecía derivable de `ecomerse_order_events`: al resolver, el pedido pasa a
-- `cancelled` (hubo reembolso) o se queda en `delivered` (a favor del vendedor).
-- **Es demostrablemente incorrecto**, y no por teoría: en la base hay un pedido
-- con DIEZ reclamaciones y DIEZ eventos de resolución, y los eventos **no llevan
-- `dispute_id`**. Cuando un pedido tiene una sola reclamación, el evento dice el
-- veredicto; cuando tiene varias, no hay forma de saber cuál es cuál. Derivar
-- funcionaría en la demo y mentiría en cuanto un comprador reclamara dos veces
-- por el mismo pedido — que es justo lo que ya ha pasado aquí.
--
-- QUÉ SE AÑADE, Y POR QUÉ ASÍ
-- Una sola columna, `outcome`, con TRES valores cerrados por CHECK:
--   · `pending`   — abierta, el administrador no ha decidido (待处理);
--   · `refunded`  — se falló a favor del comprador y el pedido se canceló (成功);
--   · `rejected`  — se falló a favor del vendedor y el pedido siguió entregado (失败).
--
-- NO se añade una columna de IMPORTE. El reembolso de hoy es binario —el
-- administrador elige «reembolso sí / no» y el pedido o se cancela o no—, así que
-- el importe devuelto ES el total del pedido y vive ya en `ecomerse_orders.total_xaf`.
-- Copiarlo aquí sería un segundo sitio donde el mismo número puede discrepar del
-- primero. El día que el reembolso sea PARCIAL, esta columna hará falta; hoy no.
--
-- NULLABLE, y a propósito. `null` significa «no consta» — una reclamación de antes
-- de esta migración cuya resolución no se puede atribuir con certeza. La app lo
-- pinta como «en revisión», que es lo honesto: no inventa un veredicto. Donde SÍ
-- se puede deducir sin ambigüedad (todas las resoluciones de un pedido con el
-- MISMO fallo), el relleno lo escribe; eso va en script aparte, no aquí: esta casa
-- mantiene las migraciones de esquema **sin DML**.
--
-- Idempotente: se puede aplicar dos veces sin efecto.
-- =============================================================================

-- ── 1. El veredicto ──────────────────────────────────────────────────────────
alter table wallet.ecomerse_disputes
  add column if not exists outcome varchar(16);

-- ── 2. Los tres valores, cerrados por la base ────────────────────────────────
-- Sin el CHECK, un `'refund'` mal escrito (en vez de `'refunded'`) crearía una
-- reclamación con un estado que ninguna pantalla sabe pintar —y que además
-- contaría como «en revisión» para siempre—. El estado lo gobierna el CÓDIGO
-- (un valor nuevo necesita su rótulo en el servicio), así que se cierra aquí.
alter table wallet.ecomerse_disputes drop constraint if exists ec_dispute_outcome_check;
alter table wallet.ecomerse_disputes add constraint ec_dispute_outcome_check
  check (outcome is null or outcome in ('pending', 'refunded', 'rejected'));

-- ── 3. Coherencia con el ciclo de vida ───────────────────────────────────────
-- Una reclamación sin resolver NO puede tener veredicto: estaría diciendo a la
-- vez «en curso» y «fallada». Y al revés: `status='resolved'` con `outcome` nulo
-- es legítimo sólo para el histórico (ver arriba), no para una fila nueva. El
-- candado cierra la primera mitad —la que el código nuevo no puede producir— y
-- deja la segunda al criterio del relleno, que es quien sabe de fechas.
alter table wallet.ecomerse_disputes drop constraint if exists ec_dispute_outcome_open_check;
alter table wallet.ecomerse_disputes add constraint ec_dispute_outcome_open_check
  check (status <> 'open' or outcome is null or outcome = 'pending');

-- ── 4. El índice que usan las dos pantallas ──────────────────────────────────
-- La lista del comprador filtra por `opened_by` y ordena por fecha; las pestañas
-- filtran además por `outcome`. Un índice por (reclamante, fecha) sirve a la
-- lista; el de `outcome` no hace falta de momento porque la lista del comprador
-- es corta (las reclamaciones de una persona, no las de todos). Se añadirá el día
-- que la consulta lo pida, no antes.
create index if not exists ix_ec_dispute_opened_by
  on wallet.ecomerse_disputes (opened_by, created_at desc);

-- ── 5. Comprobación (informativa) ────────────────────────────────────────────
--   select column_name, data_type, is_nullable from information_schema.columns
--    where table_schema='wallet' and table_name='ecomerse_disputes'
--    order by ordinal_position;
--   -- y los candados, probados de verdad (dentro de una transacción que NO se confirma):
--   begin;
--     update wallet.ecomerse_disputes set outcome='refund' where id='<uuid>';   -- debe fallar: CHECK de valores
--     update wallet.ecomerse_disputes set outcome='refunded'
--      where status='open';                                                      -- debe fallar: open + veredicto
--   rollback;
