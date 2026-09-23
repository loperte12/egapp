-- ============================================================================
-- 006→ P3 (1ª parte) — EL CÓDIGO DE INVITACIÓN DE UN GRUPO CADUCA
--
-- Copia local EXACTA de lo aplicado en el servidor:
--   /opt/mirror/app/sql/lifebook/20260214_codigo_caduca.sql
-- (comprobado por md5). El proyecto NO tiene sistema de migraciones: estos ficheros
-- escritos a mano SON la fuente de verdad. Ver `docs/ESTADO-SOCIAL-API.md`.
--
-- POR QUÉ: `lifebook.conversations.invite_code` existía desde la Parte 28, pero un
-- código de 6 caracteres de un alfabeto de 32 que NO CADUCA NUNCA y cuyo endpoint solo
-- tiene el límite global (100 peticiones/minuto) se puede sacar a fuerza bruta con
-- paciencia. Y el enlace fijado en un perfil público es exactamente eso: un código
-- eterno publicado. Telegram es el modelo: sus enlaces de invitación llevan
-- `expire_date` y `member_limit`.
--
-- Lo que se añade:
--   · invite_expires_at — cuándo deja de valer (7 días al generarlo).
--   · invite_uses       — cuántas veces se ha usado para entrar.
--   · invite_max_uses   — tope de usos (NULL = sin tope).
--
-- OJO, LO QUE **NO** HACE ESTE FICHERO (y hay que decirlo): el TOPE DE USOS todavía no
-- se aplica. Para contar un uso hay que saber que la entrada fue POR CÓDIGO, y hoy
-- `groupJoin` solo recibe el `convId` (la app resuelve el código con `by-code` y luego
-- entra por id). Las columnas quedan listas para cuando el selector de grupos mande el
-- código al unirse. Y `invite_uses` NO se incrementa en `by-code`: mirar la ficha de un
-- grupo no es usarlo.
--
--   Aplicado:   2026-02-14 (postgres@mirror-postgres)
--   Verificado: pruebas/lb51u-verificar-codigo-caduca.cjs → 23 comprobaciones en 3 fases
--               (código vivo entra · caducado se rechaza · sin fecha se rechaza · se rota
--               al pedirlo · el viejo muere · un miembro no puede sacar códigos).
-- ============================================================================

ALTER TABLE lifebook.conversations
  ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS invite_uses       integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invite_max_uses   integer;

COMMENT ON COLUMN lifebook.conversations.invite_expires_at IS
  'Caducidad del código de invitación (7 días al generarlo). NULL = código anterior al cambio: se trata como caducado y se rota al pedirlo.';
COMMENT ON COLUMN lifebook.conversations.invite_uses IS
  'Cuántas veces se ha usado el código para entrar (todavía no se incrementa: ver cabecera del fichero).';
COMMENT ON COLUMN lifebook.conversations.invite_max_uses IS
  'Tope de usos del código. NULL = sin tope (pendiente de aplicar).';

-- Ningún código eterno vivo: a los que ya existían se les pone caducidad desde ahora.
UPDATE lifebook.conversations
   SET invite_expires_at = now() + interval '7 days'
 WHERE kind = 'group' AND invite_code IS NOT NULL AND invite_expires_at IS NULL;
