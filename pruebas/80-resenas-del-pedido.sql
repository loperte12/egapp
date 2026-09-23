-- =============================================================================
-- 80 — RESEÑAS DEL PEDIDO (punto 7 de la §3: valoraciones del vendedor y del producto)
--
-- POR QUÉ: `lifebook.products` y `lifebook.shops` YA tienen `rating` y `rating_count`, y la app los
-- pinta («N ventas» y la nota). Pero **nadie los escribe jamás**: la prueba social más barata que tiene
-- el negocio está muerta, y sin valoraciones un desconocido no compra (§A.7, prioridad 2).
--
-- QUÉ AÑADE: la reseña de un pedido ENTREGADO — una por pedido, la escribe el comprador, con su nota
-- (1 a 5) y un comentario. Al guardarla se mueven la nota de la TIENDA y la de los PRODUCTOS del pedido
-- (media ponderada por `rating_count`, redondeada a 2 decimales).
--
-- Uso:  (se pasa a psql como el resto de migraciones de /pruebas)
-- =============================================================================

CREATE TABLE IF NOT EXISTS lifebook.order_reviews (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- UN pedido, UNA reseña: el índice único evita que un doble toque cuente dos veces.
  order_id    uuid NOT NULL UNIQUE REFERENCES lifebook.orders(id) ON DELETE CASCADE,
  shop_id     uuid REFERENCES lifebook.shops(id),
  buyer_id    uuid NOT NULL REFERENCES mobility.users(id),
  rating      integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_reviews_shop_idx ON lifebook.order_reviews (shop_id, created_at DESC);
CREATE INDEX IF NOT EXISTS order_reviews_buyer_idx ON lifebook.order_reviews (buyer_id, created_at DESC);

COMMENT ON TABLE lifebook.order_reviews IS
  'Valoración del comprador sobre un pedido entregado. Una por pedido (UNIQUE en order_id).';
COMMENT ON COLUMN lifebook.order_reviews.rating IS 'Nota de 1 a 5 (la app la pinta en estrellas).';
COMMENT ON COLUMN lifebook.order_reviews.comment IS 'Comentario libre, recortado a 500 caracteres.';

-- Comprobación
SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'lifebook' AND table_name = 'order_reviews'
 ORDER BY ordinal_position;

SELECT count(*) AS resenas FROM lifebook.order_reviews;
SELECT count(*) AS productos_con_nota FROM lifebook.products WHERE rating_count > 0;
SELECT count(*) AS tiendas_con_nota FROM lifebook.shops WHERE rating_count > 0;
