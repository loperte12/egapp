-- =============================================================================
-- 018 — ME GUSTA EN LAS RESPUESTAS Y CONSEJOS PARA MEJORAR EL ASISTENTE (tanda N)
--
-- QUÉ AÑADE:
--   · `ai_messages.liked`: marcar una respuesta del asistente que te sirvió. Es una señal PRIVADA
--     (no hay contador público): sirve para saber qué respuestas funcionan.
--   · `ai_feedback`: lo que la gente quiera decir para mejorar al asistente (una idea, un fallo, una
--     queja). Con el texto y, si se quiere, a qué respuesta se refiere.
--
-- NADA de esto guarda datos personales de más: el texto es lo que la persona escribe a propósito.
-- =============================================================================

ALTER TABLE lifebook.ai_messages
  ADD COLUMN IF NOT EXISTS liked boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS lifebook.ai_feedback (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES mobility.users(id) ON DELETE CASCADE,
  message_id uuid REFERENCES lifebook.ai_messages(id) ON DELETE SET NULL,
  kind       character varying(12) NOT NULL,
  text       text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_feedback_kind_check CHECK (kind::text = ANY (ARRAY['mejora','fallo','elogio']::text[]))
);

CREATE INDEX IF NOT EXISTS ix_lb_ai_feedback_user ON lifebook.ai_feedback (user_id, created_at DESC);

COMMENT ON COLUMN lifebook.ai_messages.liked IS
  'Mercado (tanda N): «me gusta» del dueño de la conversación a una respuesta del asistente. Señal privada.';
COMMENT ON TABLE lifebook.ai_feedback IS
  'Mercado (tanda N): consejos y quejas para mejorar el asistente (texto que escribe la persona).';
