-- ============================================================================
-- 010 — TANDA D: el carrito de la compra
--
-- Copia local EXACTA de lo aplicado en el servidor:
--   /opt/mirror/app/sql/lifebook/20260214_carrito.sql
--
-- POR QUÉ: `lifebook.orders` + `lifebook.order_items` YA existían (pedidos con varias líneas,
-- con `shop_id`, `subtotal_xaf`, `total_xaf`) y la caja `/lifebook-checkout` también. Lo que
-- **no existía era el carrito**: 0 tablas con «cart» en el nombre. Sin carrito no se puede
-- «Añadir al carrito» ni juntar dos cosas antes de comprar.
--
-- OJO con el índice único: en SQL los NULL no chocan entre sí, así que un PRIMARY KEY
-- (user_id, product_id, variant_id) dejaría añadir el mismo producto sin variante infinitas
-- veces. Se usa COALESCE para tratar «sin variante» como un valor más.
--
--   Aplicado:   2026-02-14 (postgres@mirror-postgres)
--   Verificado: contra la API real (sumas, cantidades, reglas) y en el Poco F5 (pantalla).
-- ============================================================================

CREATE TABLE IF NOT EXISTS lifebook.cart_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES mobility.users(id)    ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES lifebook.products(id) ON DELETE CASCADE,
  variant_id uuid NULL     REFERENCES lifebook.product_variants(id) ON DELETE SET NULL,
  quantity   smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cart_items_cantidad CHECK (quantity >= 1 AND quantity <= 99)
);

CREATE UNIQUE INDEX IF NOT EXISTS cart_items_una_linea
    ON lifebook.cart_items (user_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE INDEX IF NOT EXISTS cart_items_por_usuario ON lifebook.cart_items (user_id, created_at DESC);

COMMENT ON TABLE lifebook.cart_items IS
  'Carrito de la compra: producto (y variante) que alguien piensa comprar. El pedido se crea al pagar, no aquí.';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mobility_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON lifebook.cart_items TO mobility_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'food_agent') THEN
    GRANT SELECT ON lifebook.cart_items TO food_agent;
  END IF;
END $$;
