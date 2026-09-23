-- Sonda 2 (solo lectura)
\pset pager off
\echo '=== TABLAS lifebook ==='
SELECT table_name FROM information_schema.tables WHERE table_schema = 'lifebook' ORDER BY table_name;

\echo '=== CATEGORIAS (nombre real de la tabla) ==='
SELECT table_name FROM information_schema.tables WHERE table_schema = 'lifebook' AND table_name LIKE '%categor%';

\echo '=== VARIANTES: uso real de columnas nuevas ==='
SELECT count(*) AS total,
       count(image_url) AS con_imagen,
       count(sku) AS con_sku,
       count(attributes) AS con_attributes,
       count(weight_g) AS con_peso
  FROM lifebook.product_variants;

\echo '=== EJEMPLO DE VARIANTE CRUDA ==='
SELECT * FROM lifebook.product_variants LIMIT 2;

\echo '=== PRODUCTOS CON VARIANTES Y SU TIPO ==='
SELECT p.service_type, p.title, p.status, count(v.id) AS variantes
  FROM lifebook.products p JOIN lifebook.product_variants v ON v.product_id = p.id
 GROUP BY p.id, p.service_type, p.title, p.status ORDER BY p.service_type, p.title LIMIT 30;

\echo '=== HABITACIONES Y SU PRODUCTO ==='
SELECT rt.name, rt.capacity, rt.base_price_xaf, rt.is_active, rt.product_id, p.title, p.shop_id
  FROM lifebook.room_types rt LEFT JOIN lifebook.products p ON p.id = rt.product_id
 ORDER BY rt.name LIMIT 30;
