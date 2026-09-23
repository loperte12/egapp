-- ============================================================================
-- 009 — TANDA C: productos DENTRO de las notas
--
-- Copia local EXACTA de lo aplicado en el servidor:
--   /opt/mirror/app/sql/lifebook/20260214_productos_en_notas.sql
--
-- POR QUÉ: en Xiaohongshu el producto no vive solo en el catálogo, vive DENTRO del contenido
-- («mi rutina de mañana» y debajo, la crema que usa). Medido antes de tocar nada: **no existía
-- ningún vínculo** entre una publicación y un producto.
--
-- CASCADE en los DOS lados a propósito: si se borra la nota o el producto, el vínculo se va
-- con ellos. Un vínculo a algo que ya no existe es basura que la app tendría que filtrar en
-- cada lectura.
--
--   Aplicado:   2026-02-14 (postgres@mirror-postgres)
--   Verificado: pruebas/lb52a-verificar-productos-en-nota.cjs → 21 comprobaciones
-- ============================================================================

CREATE TABLE IF NOT EXISTS lifebook.post_products (
  post_id    uuid NOT NULL REFERENCES lifebook.posts(id)    ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES lifebook.products(id) ON DELETE CASCADE,
  position   smallint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, product_id)
);

CREATE INDEX IF NOT EXISTS post_products_por_nota
    ON lifebook.post_products (post_id, position);

COMMENT ON TABLE lifebook.post_products IS
  'Productos enganchados a una nota (el «商品 vinculado» de Xiaohongshu): el producto dentro del contenido, no en un catálogo aparte.';

-- Permisos como el resto del esquema: la app escribe (mobility_app) y el agente de comida lee.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mobility_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON lifebook.post_products TO mobility_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'food_agent') THEN
    GRANT SELECT ON lifebook.post_products TO food_agent;
  END IF;
END $$;
