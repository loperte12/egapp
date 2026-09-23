-- Sonda de esquema (solo lectura): variantes, opciones, hoteles y categorías.
\pset pager off
\echo '=== VARIANTES Y OPCIONES ==='
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'lifebook'
   AND (table_name LIKE '%variant%' OR table_name LIKE '%option%' OR table_name LIKE '%size%')
 ORDER BY table_name, ordinal_position;

\echo '=== HOTELES / RESERVAS ==='
SELECT table_name, column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'lifebook'
   AND (table_name LIKE '%hotel%' OR table_name LIKE '%room%' OR table_name LIKE '%reservation%' OR table_name LIKE '%night%')
 ORDER BY table_name, ordinal_position;

\echo '=== CUANTAS VARIANTES HAY HOY ==='
SELECT count(*) AS variantes, count(DISTINCT product_id) AS productos FROM lifebook.product_variants;

\echo '=== EJEMPLOS DE NOMBRES DE VARIANTE ==='
SELECT v.name, count(*) AS cuantas FROM lifebook.product_variants v GROUP BY v.name ORDER BY cuantas DESC LIMIT 25;

\echo '=== CATEGORIAS CON ATRIBUTOS SUGERIDOS ==='
SELECT id, service_type, name, default_attributes
  FROM lifebook.product_categories
 ORDER BY service_type, name LIMIT 60;
