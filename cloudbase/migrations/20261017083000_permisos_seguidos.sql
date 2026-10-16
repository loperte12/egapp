-- =============================================================================
-- LOS PERMISOS DE LA TABLA DE SEGUIDOS, para que la aplicación pueda usarla.
--
-- **Esto no es un detalle: sin ello la tabla existe y la API no la ve.** La creó el rol de
-- administración (cloudbase_postgres_pgdb_dzsevrbk) y el rol de la aplicación
-- (egrouteplan_api) se quedó sin permisos — así que information_schema ni se la mostraba y
-- seguir una tienda contestaba «no está activada en esta base» con la tabla delante.
--
-- Los permisos son **exactamente los de sus tablas hermanas** (ecomerse_favorites,
-- ecomerse_sellers), comprobado en information_schema.role_table_grants: ni más ni menos.
--
-- Y de paso se deja la regla puesta para las próximas tablas del esquema, que es lo que faltaba:
-- ALTER DEFAULT PRIVILEGES.
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON wallet.ecomerse_seller_follows TO egrouteplan_api;

ALTER DEFAULT PRIVILEGES IN SCHEMA wallet
  GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES TO egrouteplan_api;