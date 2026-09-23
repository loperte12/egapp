\pset pager off
\echo '=== ¿CUANTAS NOTAS HAY Y COMO SON? ==='
SELECT count(*) AS total FROM lifebook.posts;
SELECT id, left(coalesce(title,''), 30) AS titulo, city, visibility, status, source_kind, created_at
  FROM lifebook.posts ORDER BY created_at DESC LIMIT 10;

\echo '=== ¿EXISTE MI NOTA? ==='
SELECT count(*) AS mias FROM lifebook.posts WHERE id = 'ba846a40-fd50-4719-997e-1b455e1e5f12';

\echo '=== PRODUCTOS ENGANCHADOS A NOTAS ==='
SELECT post_id, product_id, position FROM lifebook.post_products ORDER BY post_id LIMIT 10;
