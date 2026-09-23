-- =============================================================================
-- 015 — TALLAS Y MEDIDAS (tanda J)
--
-- QUÉ FALTABA (verificado con consultas, no supuesto)
--   · 0 tablas de tallas o medidas en todo el esquema.
--   · 0 columnas de medidas en el perfil (`mobility.users`).
--   · Las variantes solo tienen un `name` («Talla 42»): nada con lo que comparar.
-- Por eso un asistente de talla hoy no podría recomendar nada sin inventárselo. La regla del dueño
-- es clara: «la recomendación se calcula comparando las medidas del cliente contra la tabla de
-- medidas DEL PRODUCTO que el comerciante configuró». Primero hay que poder configurarla.
--
-- CÓMO ESTÁ PENSADO
--   · `product_size_charts` → la tabla de un producto, POR SEXO y TIPO: mujer/hombre/unisex y
--     parte de arriba / de abajo / vestido / calzado / accesorio. Un producto puede tener varias
--     (una de mujer y otra de hombre, por ejemplo).
--   · `product_size_rows` → cada talla (S, M, L, 42…) con sus RANGOS en cm/kg. Los rangos son
--     min/max porque una talla no es un número exacto: es un intervalo.
--   · `user_measurements` → las medidas de la PERSONA, por categoría **independiente** (cuerpo /
--     pie), como pidió el dueño: «tener medidas de cuerpo no obliga a tener medidas de pie».
--
-- NADA de esto se enseña al comerciante: él configura la tabla; las medidas del comprador se
-- quedan en su cuenta (regla del dueño) y lo único que viaja en un pedido es la talla elegida.
-- =============================================================================

CREATE TABLE IF NOT EXISTS lifebook.product_size_charts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES lifebook.products(id) ON DELETE CASCADE,
  gender     character varying(8) NOT NULL,
  kind       character varying(10) NOT NULL,
  notes      character varying(200),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT size_charts_gender_check CHECK (gender::text = ANY (ARRAY['women','men','unisex']::text[])),
  CONSTRAINT size_charts_kind_check CHECK (kind::text = ANY (ARRAY['top','bottom','dress','shoes','accessory','other']::text[]))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lb_size_chart
  ON lifebook.product_size_charts (product_id, gender, kind);

CREATE TABLE IF NOT EXISTS lifebook.product_size_rows (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chart_id          uuid NOT NULL REFERENCES lifebook.product_size_charts(id) ON DELETE CASCADE,
  size_label        character varying(20) NOT NULL,
  position          smallint NOT NULL DEFAULT 0,
  chest_min_cm      smallint,
  chest_max_cm      smallint,
  waist_min_cm      smallint,
  waist_max_cm      smallint,
  hip_min_cm        smallint,
  hip_max_cm        smallint,
  height_min_cm     smallint,
  height_max_cm     smallint,
  weight_min_kg     smallint,
  weight_max_kg     smallint,
  foot_length_min_cm smallint,
  foot_length_max_cm smallint,
  foot_width_min_cm  smallint,
  foot_width_max_cm  smallint,
  -- Un rango no puede ir al revés (sería una tabla que miente).
  CONSTRAINT size_rows_chest_check  CHECK (chest_min_cm  IS NULL OR chest_max_cm  IS NULL OR chest_min_cm  <= chest_max_cm),
  CONSTRAINT size_rows_waist_check  CHECK (waist_min_cm  IS NULL OR waist_max_cm  IS NULL OR waist_min_cm  <= waist_max_cm),
  CONSTRAINT size_rows_hip_check    CHECK (hip_min_cm    IS NULL OR hip_max_cm    IS NULL OR hip_min_cm    <= hip_max_cm),
  CONSTRAINT size_rows_height_check CHECK (height_min_cm IS NULL OR height_max_cm IS NULL OR height_min_cm <= height_max_cm),
  CONSTRAINT size_rows_weight_check CHECK (weight_min_kg IS NULL OR weight_max_kg IS NULL OR weight_min_kg <= weight_max_kg),
  CONSTRAINT size_rows_foot_check   CHECK (foot_length_min_cm IS NULL OR foot_length_max_cm IS NULL OR foot_length_min_cm <= foot_length_max_cm),
  CONSTRAINT size_rows_valores_check CHECK (
    coalesce(chest_min_cm, 1) > 0 AND coalesce(waist_min_cm, 1) > 0 AND coalesce(hip_min_cm, 1) > 0
    AND coalesce(height_min_cm, 1) > 0 AND coalesce(weight_min_kg, 1) > 0 AND coalesce(foot_length_min_cm, 1) > 0)
);

CREATE INDEX IF NOT EXISTS ix_lb_size_rows_chart ON lifebook.product_size_rows (chart_id, position);

CREATE TABLE IF NOT EXISTS lifebook.user_measurements (
  user_id        uuid NOT NULL REFERENCES mobility.users(id) ON DELETE CASCADE,
  category       character varying(8) NOT NULL,
  gender         character varying(8),
  height_cm      smallint,
  weight_kg      smallint,
  chest_cm       smallint,
  waist_cm       smallint,
  hip_cm         smallint,
  foot_length_cm smallint,
  foot_width_cm  smallint,
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_measurements_pkey PRIMARY KEY (user_id, category),
  CONSTRAINT user_measurements_cat_check CHECK (category::text = ANY (ARRAY['body','feet']::text[])),
  CONSTRAINT user_measurements_gender_check CHECK (gender IS NULL OR gender::text = ANY (ARRAY['women','men']::text[])),
  -- Rangos humanos: si un número se sale de aquí, es un error de teclado, no una persona.
  CONSTRAINT user_measurements_rango_check CHECK (
    (height_cm      IS NULL OR height_cm      BETWEEN 90 AND 250)
    AND (weight_kg  IS NULL OR weight_kg      BETWEEN 20 AND 300)
    AND (chest_cm   IS NULL OR chest_cm       BETWEEN 40 AND 200)
    AND (waist_cm   IS NULL OR waist_cm       BETWEEN 40 AND 200)
    AND (hip_cm     IS NULL OR hip_cm         BETWEEN 40 AND 200)
    AND (foot_length_cm IS NULL OR foot_length_cm BETWEEN 12 AND 40)
    AND (foot_width_cm  IS NULL OR foot_width_cm  BETWEEN 5 AND 20))
);

COMMENT ON TABLE lifebook.product_size_charts IS
  'Mercado (tanda J): la tabla de tallas de un producto, por sexo (mujer/hombre/unisex) y tipo (arriba/abajo/vestido/calzado/accesorio).';
COMMENT ON TABLE lifebook.product_size_rows IS
  'Cada talla de una tabla con sus RANGOS en cm/kg. Los rangos son intervalos: una talla M no es un número exacto.';
COMMENT ON TABLE lifebook.user_measurements IS
  'Medidas de la persona, por categoría INDEPENDIENTE (cuerpo / pie). No se comparten con el comerciante: él solo ve la talla elegida.';
