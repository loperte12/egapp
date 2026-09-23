\pset pager off
-- ¿Existe algo de medidas corporales o tablas de tallas?
SELECT table_schema, table_name
  FROM information_schema.tables
 WHERE table_schema IN ('lifebook','mobility')
   AND (table_name ILIKE '%size%' OR table_name ILIKE '%talla%' OR table_name ILIKE '%measure%'
        OR table_name ILIKE '%fit%' OR table_name ILIKE '%chart%');

SELECT column_name FROM information_schema.columns
 WHERE table_schema = 'mobility' AND table_name = 'users'
   AND (column_name ILIKE '%size%' OR column_name ILIKE '%height%' OR column_name ILIKE '%weight%'
        OR column_name ILIKE '%measure%' OR column_name ILIKE '%shoe%' OR column_name ILIKE '%chest%');

-- ¿Las variantes guardan atributos con nombre de talla?
SELECT DISTINCT jsonb_object_keys(attributes) AS clave_atributo
  FROM lifebook.product_variants
 WHERE attributes <> '{}'::jsonb
 LIMIT 20;
