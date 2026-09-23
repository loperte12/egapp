\pset pager off
\echo '=== LA NOTA DE PRUEBA ==='
SELECT id, title, city, visibility, status, created_at,
       (SELECT count(*) FROM lifebook.post_products pp WHERE pp.post_id = p.id) AS productos
  FROM lifebook.posts p
 WHERE id = 'ba846a40-fd50-4719-997e-1b455e1e5f12';

\echo '=== LAS ULTIMAS NOTAS PUBLICAS (para ver que la mia no sale y por que) ==='
SELECT id, left(title, 34) AS titulo, city, visibility, status, created_at
  FROM lifebook.posts
 WHERE visibility = 'public'
 ORDER BY created_at DESC LIMIT 12;
