-- =============================================================================
-- Los seguidos de tiendas del Mercado (ecomerse).
--
-- POR QUÉ UNA TABLA NUEVA Y NO LA DE lifebook: el dueño del producto lo dijo claro — **«no debes
-- tomar nada de lifebook»**— y además son dos cosas distintas: allí se siguen TIENDAS de lifebook
-- (`shops`), aquí VENDEDORES de ecomerse (`wallet.ecomerse_sellers`). Compartir la tabla habría atado
-- dos módulos que hoy no se hablan.
--
-- LA FORMA ES LA DE `wallet.ecomerse_favorites` (user_id + cosa, con la pareja como clave primaria):
-- no es una invención, es la convención que este módulo ya usa para «lo que un usuario guarda».
--
-- Idempotente: se puede ejecutar dos veces sin daño.
--   npx prisma db execute --file prisma/sql/ecomerse_seller_follows.sql --schema prisma/schema.prisma
-- =============================================================================

CREATE TABLE IF NOT EXISTS wallet.ecomerse_seller_follows (
  user_id    uuid        NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  seller_id  uuid        NOT NULL REFERENCES wallet.ecomerse_sellers(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, seller_id)
);

-- El `id` de la tienda se pregunta muchas veces («¿la sigo?») y la lista se ordena por fecha.
CREATE INDEX IF NOT EXISTS ecomerse_seller_follows_seller_idx
  ON wallet.ecomerse_seller_follows (seller_id);
CREATE INDEX IF NOT EXISTS ecomerse_seller_follows_user_fecha_idx
  ON wallet.ecomerse_seller_follows (user_id, created_at DESC);
