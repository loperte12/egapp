-- =============================================================================
-- 82 — EL DINERO DEL COMERCIO: COMISIÓN CONGELADA, LIBRO DE CUENTAS Y LIQUIDACIONES
--      (punto 8 de la §3)
--
-- POR QUÉ: hoy una venta no deja rastro de dinero. `payment_status = 'paid'` dice que se cobró, pero
-- **cuánto se queda la plataforma y cuánto hay que pagarle a la tienda** no está en ningún sitio: sin
-- eso no hay comisión que cobrar, no hay panel del vendedor y no hay nada que conciliar.
--
-- LAS CUATRO TABLAS (y para qué es cada una):
--  1. `commerce_fee_config` — el porcentaje y el mínimo, **en la base** para poder cambiarlos sin
--     desplegar. Una fila con `shop_id NULL` es la config general; una con `shop_id` manda para esa tienda.
--  2. `order_fees` — el desglose **CONGELADO** de cada pedido entregado. Se congela a propósito: si
--     mañana sube el porcentaje, la historia no se reescribe. Es la regla que ya usa Comida.
--  3. `ledger_entries` — el **libro de cuentas de doble partida**. Cada entrega escribe sus líneas
--     (caja al debe; a pagar a la tienda, comisión de la plataforma y reparto al haber) y la suma de
--     debe y haber **cuadra siempre** — es lo que se puede comprobar, y se comprueba en las pruebas.
--  4. `settlements` — las **liquidaciones manuales**: cuándo se le pagó a una tienda, cuánto y por qué
--     pedidos. Pagar a mano al principio es la decisión; esto es su registro.
--
-- Uso:  (se pasa a psql como el resto de migraciones de /pruebas)
-- =============================================================================

-- ── 1 · La configuración de comisión ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lifebook.commerce_fee_config (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  /** NULL = configuración general; con valor = solo para esa tienda. */
  shop_id           uuid REFERENCES lifebook.shops(id) ON DELETE CASCADE,
  platform_percent  numeric(5,2) NOT NULL DEFAULT 8,
  platform_min_xaf  integer      NOT NULL DEFAULT 500,
  max_total_percent numeric(5,2) NOT NULL DEFAULT 40,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS commerce_fee_config_general_idx
  ON lifebook.commerce_fee_config ((shop_id IS NULL)) WHERE shop_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS commerce_fee_config_shop_idx
  ON lifebook.commerce_fee_config (shop_id) WHERE shop_id IS NOT NULL;

INSERT INTO lifebook.commerce_fee_config (shop_id, platform_percent, platform_min_xaf, max_total_percent)
SELECT NULL, 8, 500, 40
 WHERE NOT EXISTS (SELECT 1 FROM lifebook.commerce_fee_config WHERE shop_id IS NULL);

COMMENT ON TABLE lifebook.commerce_fee_config IS
  'Comisión del comercio: 8 % con mínimo de 500 XAF y tope del 40 % (decisión del dueño, como Comida).';

-- ── 2 · El desglose CONGELADO de cada pedido ────────────────────────────────
CREATE TABLE IF NOT EXISTS lifebook.order_fees (
  order_id          uuid PRIMARY KEY REFERENCES lifebook.orders(id) ON DELETE CASCADE,
  shop_id           uuid REFERENCES lifebook.shops(id),
  productos_xaf     integer NOT NULL,
  entrega_xaf       integer NOT NULL DEFAULT 0,
  total_xaf         integer NOT NULL,
  comision_xaf      integer NOT NULL,
  a_pagar_tienda_xaf integer NOT NULL,
  tope_aplicado     boolean NOT NULL DEFAULT false,
  platform_percent  numeric(5,2),
  platform_min_xaf  integer,
  computed_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_fees_shop_idx ON lifebook.order_fees (shop_id, computed_at DESC);

COMMENT ON TABLE lifebook.order_fees IS
  'Lo que deja cada pedido entregado: comisión de la plataforma y lo que hay que pagarle a la tienda. CONGELADO al entregar.';

-- ── 3 · El libro de cuentas (doble partida) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS lifebook.ledger_entries (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid REFERENCES lifebook.orders(id) ON DELETE CASCADE,
  /** caja · a_pagar_tienda · comision_plataforma · a_pagar_reparto (y lo que venga después). */
  cuenta      text NOT NULL,
  debe_xaf    integer NOT NULL DEFAULT 0,
  haber_xaf   integer NOT NULL DEFAULT 0,
  memo        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (debe_xaf >= 0 AND haber_xaf >= 0),
  CHECK (debe_xaf > 0 OR haber_xaf > 0)
);

CREATE INDEX IF NOT EXISTS ledger_entries_order_idx  ON lifebook.ledger_entries (order_id);
CREATE INDEX IF NOT EXISTS ledger_entries_cuenta_idx ON lifebook.ledger_entries (cuenta, created_at DESC);

COMMENT ON TABLE lifebook.ledger_entries IS
  'Libro de cuentas de doble partida: en cada pedido entregado, suma(debe) = suma(haber). Se comprueba en las pruebas.';

-- ── 4 · Las liquidaciones manuales ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS lifebook.settlements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id      uuid NOT NULL REFERENCES lifebook.shops(id) ON DELETE CASCADE,
  desde        timestamptz,
  hasta        timestamptz NOT NULL DEFAULT now(),
  importe_xaf  integer NOT NULL,
  pedidos      integer NOT NULL DEFAULT 0,
  estado       text NOT NULL DEFAULT 'paid',
  pagado_at    timestamptz NOT NULL DEFAULT now(),
  nota         text,
  creado_por   uuid REFERENCES mobility.users(id),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS settlements_shop_idx ON lifebook.settlements (shop_id, pagado_at DESC);

COMMENT ON TABLE lifebook.settlements IS
  'Liquidación manual a una tienda: cuánto se le pagó y por qué pedidos (los entregados desde la anterior).';

-- Comprobación
SELECT table_name FROM information_schema.tables
 WHERE table_schema = 'lifebook'
   AND table_name IN ('commerce_fee_config','order_fees','ledger_entries','settlements')
 ORDER BY table_name;

SELECT shop_id, platform_percent, platform_min_xaf, max_total_percent FROM lifebook.commerce_fee_config;
SELECT count(*) AS pedidos_con_comision FROM lifebook.order_fees;
SELECT count(*) AS lineas_de_libro FROM lifebook.ledger_entries;
SELECT count(*) AS liquidaciones FROM lifebook.settlements;
