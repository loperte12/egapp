-- ============================================================================
-- 008 — TANDA A: los 3 productos DESTACADOS de la tarjeta de la tienda en el perfil
--
-- Copia local EXACTA de lo aplicado en el servidor:
--   /opt/mirror/app/sql/lifebook/20260214_destacados.sql
-- (El proyecto no tiene migraciones: estos ficheros escritos a mano SON la fuente de verdad.)
--
-- POR QUÉ: la especificación del perfil (Xiaohongshu) pide que el comerciante elija A MANO
-- los 3 productos que se ven en la tarjeta de su tienda. Medido antes de tocar nada: no
-- existía NINGUNA columna de destacado ni de orden en `shops` ni en `products`
-- (búsqueda por featured|destac|highlight|position|sort → 0 filas), así que esa elección no
-- se podía guardar de ninguna manera.
--
-- Se eligió una COLUMNA y no una tabla nueva: son 3 puestos por tienda y la posición ya
-- dice el orden. Una tabla aparte añadiría una consulta más sin resolver nada.
--
--   Aplicado:   2026-02-14 (postgres@mirror-postgres)
--   Verificado: pruebas/lb51z-verificar-tarjeta-de-tienda.cjs → 22 comprobaciones
--               (elegir 3 en orden · más de 3 se recortan · un producto ajeno se rechaza ·
--                sin sesión no se cambia · sin tienda la tarjeta es `shop: null`).
-- ============================================================================

ALTER TABLE lifebook.products
  ADD COLUMN IF NOT EXISTS featured_position smallint;

-- El rango se comprueba en la base, no solo en el código: son TRES puestos.
ALTER TABLE lifebook.products DROP CONSTRAINT IF EXISTS products_featured_rango;
ALTER TABLE lifebook.products
  ADD CONSTRAINT products_featured_rango
  CHECK (featured_position IS NULL OR (featured_position >= 1 AND featured_position <= 3));

-- Una posición por tienda: no puede haber dos «destacado 1».
DROP INDEX IF EXISTS lifebook.products_featured_por_tienda;
CREATE UNIQUE INDEX products_featured_por_tienda
    ON lifebook.products (shop_id, featured_position)
 WHERE featured_position IS NOT NULL;

COMMENT ON COLUMN lifebook.products.featured_position IS
  'Puesto entre los 3 productos DESTACADOS de la tarjeta de la tienda en el perfil (1-3). NULL = no destacado.';

-- OJO: NO se añadió columna de «descripción corta» porque ya existía
-- (`products.short_description`, junto a `long_description`). Lo que faltaba era MANDARLA en
-- las tarjetas del catálogo: eso es código, no base de datos.
