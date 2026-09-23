-- =============================================================================
-- 016 — OPCIONES DEL PRODUCTO (tanda K: «elegir antes de comprar»)
--
-- POR QUÉ (lo que se comprobó en la base, no supuesto)
--   · `lifebook.product_variants` YA tenía `image_url`, `sku`, `weight_g` y `attributes jsonb`
--     —y el API ya los devolvía—, pero NADIE los usaba: las 25 variantes que hay son todas
--     «Talla 42», sin imagen, sin sku y con `attributes = {}`.
--   · Lo que faltaba NO era el sitio donde guardar: era **la definición de los ejes**. Nada decía
--     que hubiera un eje «Color» con los valores Rojo/Azul, ni cuál es la foto REAL del producto
--     en cada color. Sin eso, la app solo podía enseñar la palabra «Talla 42», que es justo lo que
--     el dueño rechazó: «no vale sólo poner color, debe verse el producto de la foto real de este
--     color».
--
-- CÓMO ESTÁ PENSADO (el mismo modelo que usan Taobao/Shopify, en pequeño)
--   · `product_option_groups`  → los EJES del producto: «Color», «Talla», «Almacenamiento»,
--     «Formato», «Tono», «Medida»… con su tipo (`color` · `size` · `text`) y su orden.
--   · `product_option_values`  → los valores de cada eje. En un eje de color, **cada valor lleva su
--     FOTO** (`image_url`): es la foto real de la prenda en ese color, no un cuadradito de color.
--     El servidor NO deja guardar un color sin foto.
--   · La COMBINACIÓN vive en la variante que ya existía: `product_variants.attributes` guarda
--     `{"color":"Rojo","talla":"M"}` y su `price_xaf`/`stock_quantity` son los de ESA combinación.
--     Así el carrito, el pedido y el aviso de reposición siguen funcionando sin tocarlos.
--   · `categories.default_options` → los ejes SUGERIDOS por categoría (ropa propone Talla + Color;
--     calzado, tallas de zapato; teléfonos, almacenamiento + color…). Es el mismo mecanismo que ya
--     usaba `default_attributes`: el comerciante no tiene que inventarse la estructura.
--
-- LO QUE NO SE TOCA: ni el carrito, ni los pedidos, ni las reservas. Las opciones son una capa de
-- lectura/escritura sobre `product_variants`, que ya existía.
-- =============================================================================

ALTER TABLE lifebook.categories
  ADD COLUMN IF NOT EXISTS default_options jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS lifebook.product_option_groups (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES lifebook.products(id) ON DELETE CASCADE,
  code       character varying(30) NOT NULL,
  label      character varying(40) NOT NULL,
  kind       character varying(10) NOT NULL,
  -- Solo para los ejes de talla: dice contra QUÉ tabla de tallas se recomienda
  -- (arriba / abajo / vestido / calzado / accesorio / otro). Si es nulo, no hay asistente.
  chart_kind character varying(10),
  position   smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT option_groups_kind_check  CHECK (kind::text = ANY (ARRAY['color','size','text']::text[])),
  CONSTRAINT option_groups_chart_check CHECK (chart_kind IS NULL OR chart_kind::text = ANY (ARRAY['top','bottom','dress','shoes','accessory','other']::text[])),
  -- El código es la CLAVE que va dentro de `product_variants.attributes`: minúsculas y sin adornos.
  CONSTRAINT option_groups_code_check  CHECK (code ~ '^[a-z0-9_]{2,30}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lb_option_group_code
  ON lifebook.product_option_groups (product_id, code);
CREATE UNIQUE INDEX IF NOT EXISTS uq_lb_option_group_pos
  ON lifebook.product_option_groups (product_id, position);
CREATE INDEX IF NOT EXISTS ix_lb_option_group_product
  ON lifebook.product_option_groups (product_id, position);

CREATE TABLE IF NOT EXISTS lifebook.product_option_values (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id   uuid NOT NULL REFERENCES lifebook.product_option_groups(id) ON DELETE CASCADE,
  value      character varying(40) NOT NULL,
  label      character varying(60),
  -- LA FOTO REAL del producto en ese valor (obligatoria en los ejes de color: lo comprueba el
  -- servicio, porque una tabla no puede mirar el `kind` de su grupo padre).
  image_url  character varying(400),
  hex        character varying(9),
  position   smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lb_option_value
  ON lifebook.product_option_values (group_id, lower(value::text));
CREATE UNIQUE INDEX IF NOT EXISTS uq_lb_option_value_pos
  ON lifebook.product_option_values (group_id, position);
CREATE INDEX IF NOT EXISTS ix_lb_option_value_group
  ON lifebook.product_option_values (group_id, position);

COMMENT ON TABLE lifebook.product_option_groups IS
  'Mercado (tanda K): los ejes de elección de un producto (Color, Talla, Almacenamiento, Formato…).';
COMMENT ON TABLE lifebook.product_option_values IS
  'Mercado (tanda K): valores de un eje. En los ejes de color cada valor lleva su FOTO real del producto en ese color.';
COMMENT ON COLUMN lifebook.product_option_groups.chart_kind IS
  'Eje de talla: contra qué tabla del producto se recomienda (top/bottom/dress/shoes/accessory/other).';
COMMENT ON COLUMN lifebook.categories.default_options IS
  'Ejes sugeridos para esa categoría: el comerciante los añade de un toque en el publicador.';

-- -----------------------------------------------------------------------------
-- Ejes sugeridos por categoría (solo se rellenan las que están vacías: es idempotente
-- y no pisa lo que alguien haya ajustado a mano).
-- -----------------------------------------------------------------------------
UPDATE lifebook.categories SET default_options = '[
  {"code":"talla","label":"Talla","kind":"size","chartKind":"top","values":["XS","S","M","L","XL","XXL"]},
  {"code":"color","label":"Color","kind":"color","values":["Negro","Blanco","Azul","Rojo","Verde","Beis"]}
]'::jsonb
WHERE default_options = '[]'::jsonb
  AND name::text = ANY (ARRAY['Ropa mujer','Ropa hombre','Ropa y calzado','Ropa deportiva','Ropa interior','Uniformes','Ropa infantil','Camisas','Chaquetas y abrigos','Pantalones','Bolsos y mochilas','Deportes y ocio','Fitness','Fútbol','Camping y aire libre']::text[]);

UPDATE lifebook.categories SET default_options = '[
  {"code":"talla","label":"Talla (calzado)","kind":"size","chartKind":"shoes","values":["36","37","38","39","40","41","42","43","44","45"]},
  {"code":"color","label":"Color","kind":"color","values":["Negro","Blanco","Marrón","Azul"]}
]'::jsonb
WHERE default_options = '[]'::jsonb
  AND name::text = ANY (ARRAY['Calzado','Zapatos']::text[]);

UPDATE lifebook.categories SET default_options = '[
  {"code":"almacenamiento","label":"Almacenamiento","kind":"text","values":["64 GB","128 GB","256 GB","512 GB","1 TB"]},
  {"code":"color","label":"Color","kind":"color","values":["Negro","Blanco","Azul","Dorado"]}
]'::jsonb
WHERE default_options = '[]'::jsonb
  AND name::text = ANY (ARRAY['Teléfonos y tablets','Ordenadores','Electrónica']::text[]);

UPDATE lifebook.categories SET default_options = '[
  {"code":"formato","label":"Formato","kind":"text","values":["Unidad","1 kg","5 kg","Saco 25 kg","Caja"]}
]'::jsonb
WHERE default_options = '[]'::jsonb
  AND name::text = ANY (ARRAY['Alimentos','Abacería','Frutas y verduras','Supermercados','Materiales de construcción','Farmacias']::text[]);

UPDATE lifebook.categories SET default_options = '[
  {"code":"formato","label":"Formato","kind":"text","values":["33 cl","50 cl","1 L","1,5 L","2 L"]}
]'::jsonb
WHERE default_options = '[]'::jsonb
  AND name::text = 'Bebidas';

UPDATE lifebook.categories SET default_options = '[
  {"code":"tono","label":"Tono","kind":"color","values":["Claro","Medio","Oscuro"]},
  {"code":"formato","label":"Formato","kind":"text","values":["Unidad","Pack 2","Pack 3"]}
]'::jsonb
WHERE default_options = '[]'::jsonb
  AND name::text = 'Maquillaje y belleza';

UPDATE lifebook.categories SET default_options = '[
  {"code":"medida","label":"Medida","kind":"text","values":["Individual","Matrimonio","King"]},
  {"code":"color","label":"Color","kind":"color","values":["Natural","Blanco","Negro","Gris","Marrón"]}
]'::jsonb
WHERE default_options = '[]'::jsonb
  AND name::text = 'Muebles y hogar';

UPDATE lifebook.categories SET default_options = '[
  {"code":"combustible","label":"Combustible","kind":"text","values":["Gasolina","Diésel","Híbrido","Eléctrico"]},
  {"code":"color","label":"Color","kind":"color","values":["Blanco","Negro","Gris","Azul","Rojo"]}
]'::jsonb
WHERE default_options = '[]'::jsonb
  AND name::text = ANY (ARRAY['Coches de segunda mano','Vehículos y piezas']::text[]);
