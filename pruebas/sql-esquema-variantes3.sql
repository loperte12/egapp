-- Sonda 3 (solo lectura): categorias, atributos sugeridos y variantes por producto.
\pset pager off
\echo '=== ESTRUCTURA DE lifebook.categories ==='
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_schema='lifebook' AND table_name='categories' ORDER BY ordinal_position;

\echo '=== CATEGORIAS ==='
SELECT id, parent_id, service_type, name, default_attributes FROM lifebook.categories ORDER BY service_type, parent_id NULLS FIRST, name LIMIT 80;

\echo '=== PRODUCTOS CON CATEGORIA Y VARIANTES ==='
SELECT p.title, p.service_type, c.name AS categoria, count(v.id) AS variantes
  FROM lifebook.products p
  LEFT JOIN lifebook.categories c ON c.id = p.category_id
  LEFT JOIN lifebook.product_variants v ON v.product_id = p.id
 GROUP BY p.id, p.title, p.service_type, c.name
 ORDER BY p.service_type, p.title LIMIT 40;

\echo '=== CUANTOS PRODUCTOS POR TIPO ==='
SELECT service_type, status, count(*) FROM lifebook.products GROUP BY service_type, status ORDER BY service_type, status;
