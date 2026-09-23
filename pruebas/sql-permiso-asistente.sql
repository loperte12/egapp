-- =============================================================================
-- Permiso de SOLO LECTURA para el asistente (tanda M-bis)
--
-- QUÉ PASABA: el asistente intentaba leer los platos de los restaurantes, los alquileres y las rutas
-- entre ciudades y la base le respondía «permission denied» (el usuario de la app, `mobility_app`, no
-- tiene permiso en esas tablas del esquema `wallet`). La conversación se rompía con un error 500.
--
-- QUÉ HACE ESTO: concede SOLO `SELECT` sobre las tres tablas que necesita para contestar. Nada de
-- escritura, nada de otras tablas de `wallet`. Comprobado antes: `mobility_app` ya podía leer
-- `wallet.food_restaurants` y `wallet.jobs`, así que esto no es una excepción nueva, es completar lo
-- que faltaba para los otros tres servicios.
-- =============================================================================

GRANT SELECT ON wallet.food_menu_items TO mobility_app;
GRANT SELECT ON wallet.rental_properties TO mobility_app;
GRANT SELECT ON wallet.intercity_routes TO mobility_app;

-- Comprobación (debe salir todo «t»).
SET ROLE mobility_app;
SELECT 'wallet.food_menu_items' AS tabla, has_table_privilege('wallet.food_menu_items', 'SELECT') AS puedo_leer
UNION ALL SELECT 'wallet.rental_properties', has_table_privilege('wallet.rental_properties', 'SELECT')
UNION ALL SELECT 'wallet.intercity_routes', has_table_privilege('wallet.intercity_routes', 'SELECT');
RESET ROLE;
