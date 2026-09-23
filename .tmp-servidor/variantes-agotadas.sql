\pset pager off
SELECT p.title, p.stock_quantity AS stock_producto, count(v.id) AS variantes,
       count(*) FILTER (WHERE v.stock_quantity = 0) AS variantes_agotadas
  FROM lifebook.products p
  JOIN lifebook.product_variants v ON v.product_id = p.id
 WHERE p.status = 'active'
 GROUP BY p.id, p.title, p.stock_quantity
 HAVING count(*) FILTER (WHERE v.stock_quantity = 0) > 0
 ORDER BY p.title
 LIMIT 10;
