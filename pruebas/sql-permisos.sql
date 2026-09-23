\pset pager off
\echo '=== ¿CON QUÉ USUARIO ENTRA LA APP? ==='
SELECT current_user;

\echo '=== PERMISOS SOBRE LAS TABLAS DE LOS OTROS SERVICIOS ==='
SELECT table_schema, table_name, privilege_type
  FROM information_schema.role_table_grants
 WHERE grantee = current_user
   AND table_name IN ('food_restaurants', 'food_menu_items', 'rental_properties', 'jobs', 'intercity_routes', 'room_types')
 ORDER BY table_name, privilege_type;

\echo '=== DUEÑO DE ESAS TABLAS ==='
SELECT schemaname, tablename, tableowner
  FROM pg_tables
 WHERE (schemaname = 'wallet' AND tablename IN ('food_restaurants', 'food_menu_items', 'rental_properties', 'jobs', 'intercity_routes'))
    OR (schemaname = 'lifebook' AND tablename = 'room_types');
