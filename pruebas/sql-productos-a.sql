\pset pager off
\echo '=== PRODUCTOS DE LA TIENDA A (+240222000123) CON FOTOS ==='
SELECT p.id, p.title, jsonb_array_length(p.media) AS fotos,
       (SELECT count(*) FROM lifebook.product_variants v WHERE v.product_id = p.id) AS variantes,
       p.status
  FROM lifebook.products p
  JOIN lifebook.shops s ON s.id = p.shop_id
  JOIN mobility.users u ON u.id = s.owner_id
 WHERE u.phone = '+240222000123'
 ORDER BY fotos DESC, p.title LIMIT 10;

\echo '=== UNA FOTO DE EJEMPLO ==='
SELECT p.media -> 0 ->> 'url' AS primera_foto, p.media -> 1 ->> 'url' AS segunda_foto
  FROM lifebook.products p
  JOIN lifebook.shops s ON s.id = p.shop_id
  JOIN mobility.users u ON u.id = s.owner_id
 WHERE u.phone = '+240222000123' AND jsonb_array_length(p.media) >= 2
 LIMIT 3;
