-- =============================================================================
-- 85 — LA HUELLA DEL PEDIDO EN LA CLAVE DE IDEMPOTENCIA (punto 12 de la §3)
--
-- QUÉ PASA HOY: la clave de idempotencia protege de un doble toque, pero **no se guarda nada del
-- contenido** del pedido. Así que reutilizar la misma clave con OTRO pedido devuelve el pedido anterior
-- **en silencio**: el comprador cree haber comprado una cosa y ha comprado otra.
--
-- Y dentro de la transacción la lectura de la clave **no filtra la caducidad**: una clave caducada (hay
-- 173 de 244) se trata como «pedido en curso», así que un reintento legítimo se queda con un
-- «espera un momento» que nunca termina.
--
-- Esta columna guarda la huella (SHA-256) de lo que se pidió, para poder comparar.
--
-- Uso:  (se pasa a psql como el resto de migraciones de /pruebas)
-- =============================================================================

ALTER TABLE lifebook.idempotency_keys
  ADD COLUMN IF NOT EXISTS request_hash text;

COMMENT ON COLUMN lifebook.idempotency_keys.request_hash IS
  'SHA-256 del contenido del pedido (artículos, entrega, pago, dirección y cupón). NULL en las claves viejas: no se comparan.';

SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'lifebook' AND table_name = 'idempotency_keys'
   AND column_name = 'request_hash';

SELECT count(*) AS claves,
       count(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at <= now()) AS caducadas,
       count(*) FILTER (WHERE request_hash IS NOT NULL) AS con_huella
  FROM lifebook.idempotency_keys;
