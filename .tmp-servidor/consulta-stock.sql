\pset pager off
SELECT p.title AS producto, p.stock_mode, p.stock_quantity AS stock_producto, p.status
  FROM lifebook.products p
 WHERE p.id = 'd47de72c-bf3e-4701-9535-e85f6f52d74b'::uuid;

SELECT v.name AS variante, v.stock_quantity AS stock_variante
  FROM lifebook.product_variants v
 WHERE v.product_id = 'd47de72c-bf3e-4701-9535-e85f6f52d74b'::uuid
 ORDER BY v.position, v.name;

SELECT o.order_no, o.status, i.quantity, i.variant_snapshot, o.created_at
  FROM lifebook.orders o
  JOIN lifebook.order_items i ON i.order_id = o.id
 WHERE i.product_id = 'd47de72c-bf3e-4701-9535-e85f6f52d74b'::uuid
 ORDER BY o.created_at DESC
 LIMIT 8;
