-- =============================================================================
-- 014 — CUPONES (tanda H2)
--
-- POR QUÉ
-- Es la pieza que faltaba del carrito: la especificación pide fila de cupón, hoja de
-- «aplicables / no aplicables (con el motivo)», descuento en el desglose y «Con cupón» en la línea.
-- No existía NADA: ni tabla, ni pantalla. Y toca dinero, así que las reglas van en el SERVIDOR:
-- la app no calcula descuentos, solo los enseña.
--
-- CÓMO ESTÁ PENSADO
--   · `coupons`      → el cupón que crea la TIENDA (porcentaje o importe, mínimo de compra, tope de
--                      usos totales, tope por persona, vigencia).
--   · `coupon_claims`→ el cupón «recogido» por una persona (los que se cogen en el chat quedan
--                      vinculados a la cuenta, como pide la especificación).
--   · `order_coupons`→ qué cupón se usó en cada pedido y cuánto descontó: sin esto no se puede
--                      auditar ni contar los usos sin riesgo de contar dos veces.
--   · `orders.discount_xaf` → el descuento queda EN el pedido (subtotal − descuento + envío = total).
-- =============================================================================

CREATE TABLE IF NOT EXISTS lifebook.coupons (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id          uuid NOT NULL REFERENCES lifebook.shops(id) ON DELETE CASCADE,
  code             character varying(20) NOT NULL,
  title            character varying(80) NOT NULL,
  kind             character varying(10) NOT NULL,
  value            integer NOT NULL,
  min_subtotal_xaf integer NOT NULL DEFAULT 0,
  max_uses         integer,
  used_count       integer NOT NULL DEFAULT 0,
  per_user_limit   integer NOT NULL DEFAULT 1,
  starts_at        timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz,
  status           character varying(10) NOT NULL DEFAULT 'active',
  created_by       uuid REFERENCES mobility.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupons_kind_check CHECK (kind::text = ANY (ARRAY['percent','amount']::text[])),
  CONSTRAINT coupons_status_check CHECK (status::text = ANY (ARRAY['active','paused']::text[])),
  CONSTRAINT coupons_value_check CHECK (value > 0),
  -- Un porcentaje del 90 % como máximo: un «100 %» en manos de cualquiera es un regalo, no un cupón.
  CONSTRAINT coupons_percent_max CHECK (kind::text <> 'percent' OR value <= 90),
  CONSTRAINT coupons_min_check CHECK (min_subtotal_xaf >= 0),
  CONSTRAINT coupons_uses_check CHECK (max_uses IS NULL OR max_uses > 0),
  CONSTRAINT coupons_per_user_check CHECK (per_user_limit > 0),
  CONSTRAINT coupons_used_check CHECK (used_count >= 0)
);

-- El código es único POR TIENDA (cada tienda tiene los suyos) y sin distinguir mayúsculas.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lb_coupon_code
  ON lifebook.coupons (shop_id, upper(code::text));

CREATE INDEX IF NOT EXISTS ix_lb_coupons_shop ON lifebook.coupons (shop_id, status);

CREATE TABLE IF NOT EXISTS lifebook.coupon_claims (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id    uuid NOT NULL REFERENCES lifebook.coupons(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES mobility.users(id) ON DELETE CASCADE,
  claimed_at   timestamptz NOT NULL DEFAULT now(),
  used_count   integer NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  CONSTRAINT coupon_claims_used_check CHECK (used_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lb_coupon_claim
  ON lifebook.coupon_claims (coupon_id, user_id);

CREATE TABLE IF NOT EXISTS lifebook.order_coupons (
  order_id     uuid PRIMARY KEY REFERENCES lifebook.orders(id) ON DELETE CASCADE,
  coupon_id    uuid NOT NULL REFERENCES lifebook.coupons(id) ON DELETE RESTRICT,
  user_id      uuid NOT NULL REFERENCES mobility.users(id) ON DELETE CASCADE,
  discount_xaf integer NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_coupons_discount_check CHECK (discount_xaf >= 0)
);

-- El descuento vive EN el pedido: subtotal − descuento + envío = total.
ALTER TABLE lifebook.orders
  ADD COLUMN IF NOT EXISTS discount_xaf integer NOT NULL DEFAULT 0;

ALTER TABLE lifebook.orders
  ADD CONSTRAINT orders_discount_check CHECK (discount_xaf >= 0);

COMMENT ON TABLE lifebook.coupons IS
  'Mercado (tanda H2): cupones que crea cada tienda. Las reglas (mínimo, usos, vigencia) las aplica el servidor.';
COMMENT ON TABLE lifebook.coupon_claims IS
  'Cupones recogidos por una persona: los que se cogen en el chat quedan vinculados a su cuenta.';
COMMENT ON TABLE lifebook.order_coupons IS
  'Qué cupón se usó en cada pedido y cuánto descontó: es lo que permite contar los usos sin duplicar.';
COMMENT ON COLUMN lifebook.orders.discount_xaf IS
  'Descuento por cupón aplicado al pedido (0 si no llevaba).';
