\pset pager off
\echo '=== STOCK DE LAS ZAPATILLAS DE PRUEBA (debe estar como al principio) ==='
SELECT v.name AS talla, v.stock_quantity
  FROM lifebook.product_variants v
 WHERE v.product_id = '2c04090c-7a30-46a2-8a12-73bcadf3336a'
 ORDER BY v.name;

\echo '=== PEDIDOS ABIERTOS DE LA CUENTA DEL MOVIL ==='
SELECT o.code, o.status, o.total_xaf, o.created_at
  FROM lifebook.orders o
  JOIN mobility.users u ON u.id = o.buyer_id
 WHERE u.phone = '+240999888777' AND o.status NOT IN ('cancelled', 'delivered')
 ORDER BY o.created_at DESC LIMIT 8;
