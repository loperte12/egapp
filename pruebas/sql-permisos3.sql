\pset pager off
-- La app entra con OTRO usuario (mobility_app): aquí se mira lo que PUEDE leer de verdad.
SET ROLE mobility_app;

SELECT current_user;
SELECT 'wallet.food_restaurants' AS tabla, has_table_privilege('wallet.food_restaurants', 'SELECT') AS puedo_leer
UNION ALL SELECT 'wallet.food_menu_items', has_table_privilege('wallet.food_menu_items', 'SELECT')
UNION ALL SELECT 'wallet.rental_properties', has_table_privilege('wallet.rental_properties', 'SELECT')
UNION ALL SELECT 'wallet.jobs', has_table_privilege('wallet.jobs', 'SELECT')
UNION ALL SELECT 'wallet.intercity_routes', has_table_privilege('wallet.intercity_routes', 'SELECT')
UNION ALL SELECT 'lifebook.room_types', has_table_privilege('lifebook.room_types', 'SELECT')
UNION ALL SELECT 'lifebook.products', has_table_privilege('lifebook.products', 'SELECT');
