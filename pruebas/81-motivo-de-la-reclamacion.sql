-- =============================================================================
-- 81 — EL MOTIVO DE LA RECLAMACIÓN (segunda mitad del punto 7 de la §3)
--
-- QUÉ PASA HOY: la acción `dispute` pone el pedido en `disputed`… y **no guarda nada**. La tienda ve
-- «Pedido en reclamación» y no sabe qué se le reclama ni qué contestar. En Ecomerse sí existe el motivo
-- (y una ventana de garantía): es un patrón que ya está hecho en casa.
--
-- Uso:  (se pasa a psql como el resto de migraciones de /pruebas)
-- =============================================================================

ALTER TABLE lifebook.orders
  ADD COLUMN IF NOT EXISTS dispute_reason text,
  ADD COLUMN IF NOT EXISTS disputed_at   timestamptz;

COMMENT ON COLUMN lifebook.orders.dispute_reason IS
  'Por qué el comprador abrió la reclamación (mínimo 10 caracteres). Lo escribe él al reclamar.';
COMMENT ON COLUMN lifebook.orders.disputed_at IS
  'Cuándo se abrió la reclamación. Sirve para la ventana de garantía (patrón de Ecomerse).';

SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'lifebook' AND table_name = 'orders'
   AND column_name IN ('dispute_reason', 'disputed_at')
 ORDER BY column_name;

SELECT count(*) AS pedidos_en_disputa, count(dispute_reason) AS con_motivo
  FROM lifebook.orders WHERE status = 'disputed';
