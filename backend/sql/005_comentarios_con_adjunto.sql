-- =============================================================================
-- Comentarios con publicación adjunta (Life Book)
-- Esquema: lifebook       Fichero: sql/lifebook/20260214_comentarios_con_adjunto.sql
--
-- QUE HACE
--   Permite que un comentario (o una respuesta) LLEVE DENTRO una publicación que
--   ya existe: una nota, un vídeo, una venta, un podcast… Se guarda una
--   REFERENCIA, nunca una copia.
--
-- POR QUE REFERENCIA Y NO COPIA
--   Es lo que hacen todas las plataformas grandes. El caso más claro es X: si
--   borran la publicación citada, el tuit con la cita sigue en pie y el hueco
--   muestra «este post citado no está disponible». No se guarda el contenido.
--
-- POR QUE ON DELETE SET NULL Y NO CASCADE
--   Si borran la publicación adjunta, el comentario tiene que SOBREVIVIR: se
--   perdería lo que escribió una persona por algo que no ha hecho ella. Con
--   `SET NULL` el comentario se queda como texto. (Y como el texto del comentario
--   sigue siendo obligatorio, nunca queda una fila vacía.)
--   Ojo, no confundir: los comentarios **de** una publicación ya caen por CASCADE
--   cuando se borra esa publicación; esta clave ajena solo afecta a los
--   comentarios de OTROS sitios que la citaban.
--
-- COMO APLICARLO (como superusuario: los dueños de las tablas son postgres)
--   docker exec -i mirror-postgres psql -U postgres -d egrouteplan \
--     -v ON_ERROR_STOP=1 < sql/lifebook/20260214_comentarios_con_adjunto.sql
--   Es idempotente. Añadir una columna anulable (y un índice parcial) no reescribe
--   la tabla: son 215 comentarios hoy.
-- =============================================================================

ALTER TABLE lifebook.comments
  ADD COLUMN IF NOT EXISTS attach_post_id uuid REFERENCES lifebook.posts(id) ON DELETE SET NULL;

COMMENT ON COLUMN lifebook.comments.attach_post_id IS
  'Publicación adjunta (referencia, no copia). NULL = sin adjunto o el original fue borrado.';

-- Índice parcial: solo interesa buscar los comentarios QUE TIENEN adjunto (para
-- resolver la tarjeta de una página de comentarios).
CREATE INDEX IF NOT EXISTS ix_lb_comments_attach
  ON lifebook.comments (attach_post_id) WHERE attach_post_id IS NOT NULL;
