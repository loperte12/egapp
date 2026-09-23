-- =============================================================================
-- 017 — EL ASISTENTE DE IA (tanda M)
--
-- QUÉ ES: un chat dentro de Life Book que RECOMIENDA cosas reales del catálogo (con sus datos
-- sacados de la base, nunca inventados) y explica cómo se usa la app.
--
-- POR QUÉ SE GUARDA LA CONVERSACIÓN: el dueño quiere un asistente, no una caja de texto que se
-- vacía al cerrar la pantalla. Con las conversaciones en la base, el chat se puede cerrar y volver,
-- y el asistente recuerda lo que habíais hablado.
--
-- NADA DE DATOS PERSONALES EN EL PROMPT: lo que se manda al modelo son las preguntas y los datos
-- PÚBLICOS del catálogo (título, precio, ciudad, tienda). Ni teléfonos, ni correos, ni direcciones,
-- ni medidas corporales. Y queda anotado el GASTO (mensajes y tokens por persona y día) para poder
-- poner un tope: una IA sin tope es una factura sin tope.
-- =============================================================================

CREATE TABLE IF NOT EXISTS lifebook.ai_conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES mobility.users(id) ON DELETE CASCADE,
  title      character varying(120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_lb_ai_conv_user
  ON lifebook.ai_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS lifebook.ai_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES lifebook.ai_conversations(id) ON DELETE CASCADE,
  role            character varying(10) NOT NULL,
  content         text,
  -- Lo que el asistente ENSEÑA además del texto: productos y tiendas reales (con su id, para poder
  -- abrirlos). Se guarda para que al reabrir el chat sigan ahí.
  payload         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_messages_role_check CHECK (role::text = ANY (ARRAY['user','assistant']::text[]))
);

CREATE INDEX IF NOT EXISTS ix_lb_ai_msg_conv
  ON lifebook.ai_messages (conversation_id, created_at);

-- El gasto, por persona y día: es lo que permite cortar antes de que la factura se descontrole.
CREATE TABLE IF NOT EXISTS lifebook.ai_usage (
  user_id    uuid NOT NULL REFERENCES mobility.users(id) ON DELETE CASCADE,
  day        date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  messages   integer NOT NULL DEFAULT 0,
  tokens     integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ai_usage_pkey PRIMARY KEY (user_id, day)
);

COMMENT ON TABLE lifebook.ai_conversations IS
  'Mercado (tanda M): conversaciones con el asistente de IA. Se guardan para poder cerrar el chat y volver.';
COMMENT ON TABLE lifebook.ai_messages IS
  'Mercado (tanda M): mensajes del asistente. `payload` lleva los productos y tiendas REALES que enseñó.';
COMMENT ON TABLE lifebook.ai_usage IS
  'Mercado (tanda M): mensajes y tokens por persona y día, para poder poner un tope de gasto.';
