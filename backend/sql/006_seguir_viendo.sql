-- =============================================================================
-- Seguir viendo: progreso de reproducción de los vídeos (Life Book)
-- Esquema: lifebook        Fichero: sql/lifebook/20260214_seguir_viendo.sql
--
-- QUE RESUELVE
--   Hoy NO existe ninguna forma de saber por dónde ibas: si sales de un vídeo,
--   empiezas de cero. Con 62 vídeos, 12 series y 36 episodios eso es un agujero de
--   producto, no un detalle. (Lo comprobé buscando `progress|position|resume` en la
--   app: lo único que aparecía era el progreso de SUBIDA.)
--
-- POR QUE UNA TABLA Y NO UN CAMPO EN `posts`
--   El progreso es de la PERSONA, no del vídeo: cada usuario va por donde va. Va en
--   su propia tabla con clave (usuario, vídeo).
--
-- DECISIONES
--   · `ON DELETE CASCADE` contra `posts`: si borran el vídeo, su progreso no sirve
--     para nada y no debe quedarse como basura.
--   · `ON DELETE CASCADE` contra `mobility.users`: si se borra la cuenta, igual.
--   · NO hay columna de «terminado»: se DEDUCE (posición < 90 % de la duración).
--     Menos estado que mantener y no se puede quedar desincronizado.
--   · La fila NO se borra al terminar el vídeo: marca que se vio. Lo que se filtra
--     es la LISTA de «seguir viendo», no la fila.
--
-- COMO APLICARLO (como superusuario)
--   docker exec -i mirror-postgres psql -U postgres -d egrouteplan \
--     -v ON_ERROR_STOP=1 < sql/lifebook/20260214_seguir_viendo.sql
-- =============================================================================

CREATE TABLE IF NOT EXISTS lifebook.watch_progress (
  user_id      uuid        NOT NULL REFERENCES mobility.users(id)      ON DELETE CASCADE,
  post_id      uuid        NOT NULL REFERENCES lifebook.posts(id)      ON DELETE CASCADE,
  position_sec integer     NOT NULL DEFAULT 0,
  duration_sec integer     NOT NULL DEFAULT 0,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT watch_progress_pkey PRIMARY KEY (user_id, post_id)
);

COMMENT ON TABLE lifebook.watch_progress IS
  'Por dónde va cada persona en cada vídeo (seguir viendo). Terminado se deduce: posición >= 90 % de la duración.';

-- La lista de «seguir viendo» se pide por usuario y por lo más reciente.
CREATE INDEX IF NOT EXISTS ix_lb_watch_user
  ON lifebook.watch_progress (user_id, updated_at DESC);

-- Permisos explícitos (el ACL por defecto del esquema ya los daría, pero así el
-- fichero sirve para reconstruir la base desde cero).
GRANT SELECT, INSERT, UPDATE, DELETE ON lifebook.watch_progress TO malabogo;
GRANT SELECT, INSERT, UPDATE, DELETE ON lifebook.watch_progress TO mobility_app;
GRANT SELECT ON lifebook.watch_progress TO food_agent;
