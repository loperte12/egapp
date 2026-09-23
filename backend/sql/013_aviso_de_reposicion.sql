-- =============================================================================
-- 013 — «AVÍSAME CUANDO LLEGUE»: la lista de quien espera stock
--
-- POR QUÉ
-- Un producto agotado terminaba en un botón apagado y «pregúntale a la tienda»: la persona tenía
-- que volver a mirar por su cuenta. La especificación del Mercado quiere que el interés quede
-- apuntado y que se avise al reponer.
--
-- QUÉ ES
-- Una fila por PERSONA y PRODUCTO (y variante, si la tiene): si alguien espera la «Talla 42», no se
-- le avisa cuando llega la «Talla 40». `notified_at` marca cuándo se avisó, para no repetir el aviso
-- en cada cambio de stock.
--
-- CASCADE por los dos lados: si se borra la cuenta o el producto, la espera se va con ellos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS lifebook.product_interest (
  user_id     uuid        NOT NULL REFERENCES mobility.users(id)    ON DELETE CASCADE,
  product_id  uuid        NOT NULL REFERENCES lifebook.products(id) ON DELETE CASCADE,
  variant_id  uuid        REFERENCES lifebook.product_variants(id)  ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);

-- Una sola espera por persona, producto y variante (con variante NULL también).
CREATE UNIQUE INDEX IF NOT EXISTS uq_lb_interest
  ON lifebook.product_interest (user_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- La consulta real es «¿quién espera ESTE producto y todavía no se le ha avisado?».
CREATE INDEX IF NOT EXISTS ix_lb_interest_pendientes
  ON lifebook.product_interest (product_id) WHERE notified_at IS NULL;

COMMENT ON TABLE lifebook.product_interest IS
  'Mercado (tanda G): quien pidió que se le avise cuando un producto o una variante vuelva a tener stock.';
