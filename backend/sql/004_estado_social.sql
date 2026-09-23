-- =============================================================================
-- Estados 24 h · capa social: me gusta, comentarios, respuestas y avisos
-- Esquema: mobility        Fichero: sql/mobility/20260214_estado_social.sql
--
-- POR QUE EXISTE ESTE FICHERO
--   El repositorio NO tiene sistema de migraciones (ni prisma/migrations ni una
--   carpeta sql/ previa): las tablas se han creado siempre a mano. Este fichero
--   es la fuente de verdad del DDL para poder reconstruir la base desde cero.
--
-- COMO APLICARLO
--   mobility_app NO tiene CREATE en el esquema mobility (el dueno es postgres),
--   asi que se aplica como superusuario y despues se otorgan permisos:
--     docker exec -i mirror-postgres psql -U postgres -d egrouteplan \
--       -v ON_ERROR_STOP=1 < sql/mobility/20260214_estado_social.sql
--   Es idempotente (IF NOT EXISTS + GRANT), se puede reejecutar sin riesgo.
--
-- DISENO
--   Espeja las tablas equivalentes del Life Book (lifebook.likes,
--   lifebook.comments, lifebook.comment_likes) para que el cliente use la MISMA
--   forma de datos y no haya dos maneras de hacer lo mismo.
--   Diferencias deliberadas frente a ese espejo:
--     · parent_id lleva FK a status_comments(id) ON DELETE CASCADE (lifebook no
--       la tiene): al borrar un comentario raiz desaparecen sus respuestas, sin
--       dejar huerfanos colgando.
--     · status_comment_likes lleva read_at (lifebook no lo tiene) para poder
--       avisar tambien de los "me gusta" en comentarios.
--   Los me gusta y los comentarios MUEREN CON EL ESTADO: toda clave ajena a
--   status_entries es ON DELETE CASCADE (decision del producto).
-- =============================================================================

-- ------------------------------- ME GUSTA ------------------------------------
CREATE TABLE IF NOT EXISTS mobility.status_reactions (
  status_id   uuid        NOT NULL REFERENCES mobility.status_entries(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES mobility.users(id)          ON DELETE CASCADE,
  reaction    varchar(16) NOT NULL DEFAULT 'like',
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz,
  CONSTRAINT status_reactions_pkey PRIMARY KEY (status_id, user_id)
);
COMMENT ON TABLE mobility.status_reactions IS
  'Me gusta de un estado 24 h. Uno por usuario y estado. Muere con el estado.';

-- ------------------------------ COMENTARIOS ----------------------------------
CREATE TABLE IF NOT EXISTS mobility.status_comments (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  status_id   uuid        NOT NULL REFERENCES mobility.status_entries(id)      ON DELETE CASCADE,
  author_id   uuid        NOT NULL REFERENCES mobility.users(id)               ON DELETE CASCADE,
  parent_id   uuid                 REFERENCES mobility.status_comments(id)     ON DELETE CASCADE,
  body        text        NOT NULL,
  state       varchar(16) NOT NULL DEFAULT 'active',
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz,
  edited_at   timestamptz,
  CONSTRAINT status_comments_pkey PRIMARY KEY (id)
);
COMMENT ON TABLE mobility.status_comments IS
  'Comentarios de un estado 24 h. parent_id no nulo = respuesta a otro comentario. Muere con el estado.';

-- --------------------- ME GUSTA EN COMENTARIOS -------------------------------
CREATE TABLE IF NOT EXISTS mobility.status_comment_likes (
  comment_id  uuid        NOT NULL REFERENCES mobility.status_comments(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES mobility.users(id)           ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz,
  CONSTRAINT status_comment_likes_pkey PRIMARY KEY (comment_id, user_id)
);
COMMENT ON TABLE mobility.status_comment_likes IS
  'Me gusta sobre un comentario de estado 24 h (avisos al autor del comentario).';

-- --------------------- AVISOS DE RESPUESTA (por destinatario) ----------------
-- Un comentario puede avisar a DOS personas: al autor del estado (eso lo lleva
-- status_comments.read_at, espejo del Life Book) y al autor del comentario al
-- que se responde. Una sola columna read_at no puede representar el estado de
-- lectura de dos destinatarios distintos, asi que el aviso de respuesta vive en
-- su propia tabla, una fila por destinatario.
CREATE TABLE IF NOT EXISTS mobility.status_comment_notices (
  comment_id  uuid        NOT NULL REFERENCES mobility.status_comments(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES mobility.users(id)           ON DELETE CASCADE,
  reason      varchar(16) NOT NULL DEFAULT 'reply',
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz,
  CONSTRAINT status_comment_notices_pkey PRIMARY KEY (comment_id, user_id)
);
COMMENT ON TABLE mobility.status_comment_notices IS
  'Aviso "alguien respondio a mi comentario". reason=''reply'' es el unico valor hoy; queda abierto a menciones.';

-- -------------------------------- INDICES ------------------------------------
-- Listar quien reacciono / mis reacciones (avisos).
CREATE INDEX IF NOT EXISTS ix_st_reactions_user      ON mobility.status_reactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_st_reactions_status    ON mobility.status_reactions (status_id, created_at DESC);
-- Contar sin leer (avisos) sin recorrer toda la tabla.
CREATE INDEX IF NOT EXISTS ix_st_reactions_unread    ON mobility.status_reactions (status_id) WHERE read_at IS NULL;
-- Hilo de comentarios de un estado y respuestas de un comentario.
CREATE INDEX IF NOT EXISTS ix_st_comments_status     ON mobility.status_comments (status_id, created_at);
CREATE INDEX IF NOT EXISTS ix_st_comments_parent     ON mobility.status_comments (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_st_comments_unread     ON mobility.status_comments (status_id) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_st_comment_likes_user  ON mobility.status_comment_likes (user_id);
CREATE INDEX IF NOT EXISTS ix_st_comment_likes_unread ON mobility.status_comment_likes (comment_id) WHERE read_at IS NULL;
-- Avisos de respuesta: mis avisos y cuantos sin leer.
CREATE INDEX IF NOT EXISTS ix_st_comment_notices_user   ON mobility.status_comment_notices (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_st_comment_notices_unread ON mobility.status_comment_notices (user_id) WHERE read_at IS NULL;

-- -------------------------------- PERMISOS -----------------------------------
-- Espejo exacto de los permisos de mobility.status_entries:
--   mobility_app = arwd (el backend), food_agent = r (auditoria, solo lectura).
GRANT SELECT, INSERT, UPDATE, DELETE ON mobility.status_reactions     TO mobility_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON mobility.status_comments      TO mobility_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON mobility.status_comment_likes   TO mobility_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON mobility.status_comment_notices TO mobility_app;
GRANT SELECT ON mobility.status_reactions     TO food_agent;
GRANT SELECT ON mobility.status_comments      TO food_agent;
GRANT SELECT ON mobility.status_comment_likes   TO food_agent;
GRANT SELECT ON mobility.status_comment_notices TO food_agent;
