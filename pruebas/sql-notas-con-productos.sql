\pset pager off
\echo '=== NOTAS DE LA TIENDA A QUE LLEVAN PRODUCTOS (y salen en el feed) ==='
SELECT pp.post_id, p.title AS nota, p.city, p.created_at,
       (SELECT count(*) FROM jsonb_array_elements(p.media_ids)) AS fotos,
       string_agg(pp.product_id::text, ', ') AS productos
  FROM lifebook.post_products pp
  JOIN lifebook.posts p ON p.id = pp.post_id
 GROUP BY pp.post_id, p.title, p.city, p.created_at, p.media_ids
 ORDER BY p.created_at DESC LIMIT 8;
