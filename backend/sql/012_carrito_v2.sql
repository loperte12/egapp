-- =============================================================================
-- 012 — CARRITO v2: la línea del carrito se cuenta a sí misma
--
-- POR QUÉ
-- La especificación del carrito pide tres cosas que hoy NO se pueden cumplir:
--   1. «Precio cambió» — el carrito no guardaba el precio de cuando se añadió, así que no hay con
--      qué comparar el de hoy. Se añade `unit_price_xaf` (la foto del momento).
--   2. «Producto eliminado» — la línea apuntaba al producto con ON DELETE CASCADE: si la tienda
--      borraba el producto, la línea DESAPARECÍA del carrito sin avisar. Ahora el vínculo pasa a
--      ON DELETE SET NULL y la línea guarda su propia foto (`title_snapshot`, `media_snapshot`),
--      así que puede quedarse como recordatorio («Producto eliminado») y no se borra sola.
--   3. «Precio del grupo / de live / con cupón» — de dónde vino la línea. Se guarda
--      `source_kind` + `source_id` + `source_label` (el grupo o el live del que salió).
--
-- OJO: `product_id` pasa a ser NULLABLE (una línea puede sobrevivir a su producto).
-- =============================================================================

ALTER TABLE lifebook.cart_items
  ADD COLUMN IF NOT EXISTS unit_price_xaf  integer,
  ADD COLUMN IF NOT EXISTS title_snapshot  character varying(200),
  ADD COLUMN IF NOT EXISTS media_snapshot  character varying(400),
  ADD COLUMN IF NOT EXISTS source_kind     character varying(12) NOT NULL DEFAULT 'ficha',
  ADD COLUMN IF NOT EXISTS source_id       uuid,
  ADD COLUMN IF NOT EXISTS source_label    character varying(120);

ALTER TABLE lifebook.cart_items
  ADD CONSTRAINT cart_items_source_kind_check
  CHECK (source_kind::text = ANY (ARRAY['ficha','chat','grupo','live','mercado']::text[]));

ALTER TABLE lifebook.cart_items
  ADD CONSTRAINT cart_items_unit_price_check
  CHECK (unit_price_xaf IS NULL OR unit_price_xaf >= 0);

-- De CASCADE a SET NULL: la línea sobrevive para poder decir «Producto eliminado».
ALTER TABLE lifebook.cart_items DROP CONSTRAINT IF EXISTS cart_items_product_id_fkey;
ALTER TABLE lifebook.cart_items ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE lifebook.cart_items
  ADD CONSTRAINT cart_items_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES lifebook.products(id) ON DELETE SET NULL;

-- Las líneas que ya existían se rellenan con la foto de hoy: sin esto, todas parecerían «cambiadas».
UPDATE lifebook.cart_items ci
   SET title_snapshot = p.title,
       media_snapshot = p.media->0->>'url',
       unit_price_xaf = COALESCE(
         (SELECT v.price_xaf FROM lifebook.product_variants v WHERE v.id = ci.variant_id),
         p.price_xaf)
  FROM lifebook.products p
 WHERE p.id = ci.product_id
   AND ci.title_snapshot IS NULL;

COMMENT ON COLUMN lifebook.cart_items.unit_price_xaf IS
  'Precio unitario de cuando se añadió al carrito. Sirve para decir «Precio cambió» y enseñar el anterior tachado.';
COMMENT ON COLUMN lifebook.cart_items.title_snapshot IS
  'Nombre del producto al añadirlo: si la tienda lo borra, la línea sigue contando qué era.';
COMMENT ON COLUMN lifebook.cart_items.source_kind IS
  'De dónde salió: ficha | chat | grupo | live | mercado. Es lo que permite «Precio del grupo» o «Precio de live».';
