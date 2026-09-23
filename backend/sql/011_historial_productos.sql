-- =============================================================================
-- 011 — MERCADO · HISTORIAL DE PRODUCTOS (tanda F)
--
-- POR QUÉ
-- La especificación del Mercado pide, entre los cinco accesos rápidos del comprador, el
-- «Historial de productos» («viste esto ayer»). En la base solo había `products.views_count`,
-- un contador por producto: NO existía el historial de cada persona. Sin eso no se puede
-- recuperar lo que alguien miró, ni por producto ni por fecha, ni se puede borrar (derecho del
-- usuario a limpiar su rastro).
--
-- QUÉ ES
-- Una fila por PERSONA y PRODUCTO (no por visita): así el historial no crece sin control con
-- cada toque. `times` cuenta las visitas y `viewed_at` es la última, que es lo que ordena la
-- rejilla. `first_seen_at` guarda desde cuándo lo conoce.
--
-- OJO: `ON DELETE CASCADE` en las dos columnas. Si se borra la cuenta o el producto, el rastro
-- se va con ellos; no queda historial huérfano apuntando a algo que ya no existe.
-- =============================================================================

CREATE TABLE IF NOT EXISTS lifebook.product_views (
  user_id       uuid        NOT NULL REFERENCES mobility.users(id)    ON DELETE CASCADE,
  product_id    uuid        NOT NULL REFERENCES lifebook.products(id) ON DELETE CASCADE,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  viewed_at     timestamptz NOT NULL DEFAULT now(),
  times         integer     NOT NULL DEFAULT 1,
  CONSTRAINT product_views_pkey PRIMARY KEY (user_id, product_id),
  CONSTRAINT product_views_times_check CHECK (times > 0)
);

-- La consulta real es «lo que YO he visto, lo último primero»: ese es el índice.
CREATE INDEX IF NOT EXISTS ix_lb_product_views_user
  ON lifebook.product_views (user_id, viewed_at DESC);

COMMENT ON TABLE lifebook.product_views IS
  'Mercado (tanda F): historial de productos vistos por persona. Una fila por persona+producto; '
  '`viewed_at` es la última visita (ordena la rejilla) y `times` cuántas veces lo abrió.';
COMMENT ON COLUMN lifebook.product_views.times IS
  'Cuántas veces ha abierto esa persona la ficha de ese producto (no se cuenta al dueño).';
