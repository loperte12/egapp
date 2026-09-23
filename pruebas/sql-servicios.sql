\pset pager off
\echo '=== TABLAS DE LOS OTROS SERVICIOS ==='
SELECT table_schema, table_name
  FROM information_schema.tables
 WHERE table_schema IN ('lifebook', 'public', 'mobility', 'wallet')
   AND (table_name ILIKE '%food%' OR table_name ILIKE '%restaurant%' OR table_name ILIKE '%menu%'
        OR table_name ILIKE '%rental%' OR table_name ILIKE '%alquil%' OR table_name ILIKE '%rent%'
        OR table_name ILIKE '%job%' OR table_name ILIKE '%work%' OR table_name ILIKE '%offer%'
        OR table_name ILIKE '%intercity%' OR table_name ILIKE '%trip%' OR table_name ILIKE '%ride%'
        OR table_name ILIKE '%booking%' OR table_name ILIKE '%plan%')
 ORDER BY table_schema, table_name LIMIT 40;

\echo '=== CUANTAS FILAS TIENEN LAS CLAVE ==='
SELECT 'lifebook.room_types' AS t, count(*) FROM lifebook.room_types
UNION ALL SELECT 'lifebook.shops', count(*) FROM lifebook.shops
UNION ALL SELECT 'lifebook.products', count(*) FROM lifebook.products
UNION ALL SELECT 'lifebook.posts', count(*) FROM lifebook.posts;
