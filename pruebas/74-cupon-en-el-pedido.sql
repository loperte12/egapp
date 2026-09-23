-- =============================================================================
-- 74 — EL CUPÓN, DENTRO DEL PEDIDO (tanda Q)
--
-- `lifebook.orders` ya tenía `discount_xaf` (nunca se usó), pero no guardaba QUÉ cupón se gastó: sin
-- eso no se puede devolver el cupón cuando la compra se cancela ni decir en el ticket qué descuento
-- se aplicó.
--
-- Uso:  docker exec -i mirror-postgres psql -U postgres -d egrouteplan -f /dev/stdin < 74-...sql
-- =============================================================================
ALTER TABLE lifebook.orders ADD COLUMN IF NOT EXISTS coupon_id uuid;
ALTER TABLE lifebook.orders ADD COLUMN IF NOT EXISTS coupon_code character varying(40);

-- Comprobación de lo que ha quedado (se imprime al aplicar).
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'lifebook' AND table_name = 'orders'
   AND column_name IN ('discount_xaf', 'coupon_id', 'coupon_code')
 ORDER BY column_name;
