\pset pager off
\echo '=== COLUMNAS DE LAS TABLAS DE LOS OTROS SERVICIOS ==='
SELECT table_name, string_agg(column_name, ', ' ORDER BY ordinal_position) AS columnas
  FROM information_schema.columns
 WHERE table_schema = 'wallet'
   AND table_name IN ('food_restaurants', 'food_menu_items', 'rental_properties', 'jobs',
                      'intercity_routes', 'intercity_trips', 'rental_neighborhoods')
 GROUP BY table_name ORDER BY table_name;
