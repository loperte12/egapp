\pset pager off
\echo '=== ALQUILERES POR CIUDAD (lo que hay de verdad) ==='
SELECT city_name, count(*) FILTER (WHERE status = 'active') AS activos, count(*) AS total
  FROM wallet.rental_properties GROUP BY city_name ORDER BY total DESC LIMIT 8;

\echo '=== RUTAS ENTRE CIUDADES ==='
SELECT origin_city, destination_city, base_price, is_active FROM wallet.intercity_routes ORDER BY origin_city LIMIT 8;

\echo '=== HABITACIONES ACTIVAS Y SU CIUDAD ==='
SELECT rt.name, rt.capacity, rt.base_price_xaf, s.city, s.name AS hotel, s.is_active AS hotel_activo
  FROM lifebook.room_types rt JOIN lifebook.shops s ON s.id = rt.shop_id
 WHERE rt.is_active ORDER BY s.city, rt.base_price_xaf LIMIT 12;

\echo '=== OFERTAS DE TRABAJO ACTIVAS ==='
SELECT title, company, city, status FROM wallet.jobs ORDER BY published_at DESC NULLS LAST LIMIT 6;
