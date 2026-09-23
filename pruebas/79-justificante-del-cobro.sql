-- =============================================================================
-- 79 — JUSTIFICANTE DEL COBRO (segunda mitad del punto 5 de la ACCIÓN INMEDIATA)
--
-- Contra entrega y pago en tienda ya quedan cobrados al entregar. Los demás métodos (transferencia,
-- facturación, depósito, monedero) los cobra la tienda por fuera, así que necesita poder marcar
-- «cobrado» y dejar con qué se demuestra: el enlace del justificante, una nota con la referencia del
-- recibo, quién lo marcó y cuándo.
--
-- `paid_at` ya existía. Estas tres columnas son las que faltaban.
--
-- Uso:  (se pasa a psql como el resto de migraciones de /pruebas; el SQL va en el cuerpo)
-- =============================================================================

ALTER TABLE lifebook.orders
  ADD COLUMN IF NOT EXISTS payment_proof_url text,
  ADD COLUMN IF NOT EXISTS payment_note      text,
  ADD COLUMN IF NOT EXISTS paid_by           uuid REFERENCES mobility.users(id);

COMMENT ON COLUMN lifebook.orders.payment_proof_url IS
  'Enlace del justificante del cobro (foto del recibo ya subida). Lo pone la tienda al marcar cobrado.';
COMMENT ON COLUMN lifebook.orders.payment_note IS
  'Nota de la tienda al marcar cobrado (p. ej. la referencia de la transferencia). Máx. 300 caracteres.';
COMMENT ON COLUMN lifebook.orders.paid_by IS
  'Quién marcó el pedido como cobrado. Es el rastro para saber a quién preguntar si algo no cuadra.';

-- Comprobación: que las tres columnas están y con qué arrancan los pedidos ya existentes.
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'lifebook' AND table_name = 'orders'
   AND column_name IN ('payment_proof_url', 'payment_note', 'paid_by')
 ORDER BY column_name;

SELECT count(*) AS pedidos, count(paid_by) AS con_paid_by, count(payment_proof_url) AS con_justificante
  FROM lifebook.orders;
