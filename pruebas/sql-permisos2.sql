\pset pager off
-- Se prueba COMO EL USUARIO DE LA APP, que es lo que de verdad importa.
SET ROLE malabogo;

\echo '=== QUIEN SOY ==='
SELECT current_user;

\echo '=== ¿PUEDO LEER LAS TABLAS DE LOS OTROS SERVICIOS? ==='
SELECT 'wallet.food_restaurants' AS tabla, has_table_privilege('wallet.food_restaurants', 'SELECT') AS puedo_leer
UNION ALL SELECT 'wallet.food_menu_items', has_table_privilege('wallet.food_menu_items', 'SELECT')
UNION ALL SELECT 'wallet.rental_properties', has_table_privilege('wallet.rental_properties', 'SELECT')
UNION ALL SELECT 'wallet.jobs', has_table_privilege('wallet.jobs', 'SELECT')
UNION ALL SELECT 'wallet.intercity_routes', has_table_privilege('wallet.intercity_routes', 'SELECT')
UNION ALL SELECT 'lifebook.room_types', has_table_privilege('lifebook.room_types', 'SELECT')
UNION ALL SELECT 'lifebook.products', has_table_privilege('lifebook.products', 'SELECT');

\echo '=== PRUEBA REAL DE LECTURA ==='
SELECT count(*) AS platos FROM wallet.food_menu_items;
SELECT count(*) AS alquileres FROM wallet.rental_properties;
SELECT count(*) AS ofertas FROM wallet.jobs;
SELECT count(*) AS rutas FROM wallet.intercity_routes;
SELECT count(*) AS habitaciones FROM lifebook.room_types;
