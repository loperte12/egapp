-- =============================================================================
-- 78 — INTENTOS DEL CÓDIGO DE ENTREGA (punto 3 de la ACCIÓN INMEDIATA)
--
-- El código de contra entrega son 4 dígitos y se podía probar SIN LÍMITE: 10 000 intentos y la
-- tienda puede marcar «entregado y cobrado» un pedido que el comprador nunca recibió. Aquí se
-- guardan los fallos seguidos y hasta cuándo está bloqueado el intento.
--
-- Uso:  (leer el SQL y pasarlo a psql, como el resto de migraciones de /pruebas)
-- =============================================================================

ALTER TABLE lifebook.orders
  ADD COLUMN IF NOT EXISTS delivery_code_attempts     integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_code_locked_until timestamptz;

COMMENT ON COLUMN lifebook.orders.delivery_code_attempts IS
  'Fallos SEGUIDOS al confirmar el código de contra entrega. Se pone a 0 al entregar.';
COMMENT ON COLUMN lifebook.orders.delivery_code_locked_until IS
  'Hasta cuándo no se admite NINGÚN intento más (ni el correcto). Se pone al llegar a 5 fallos.';

-- Comprobación: que las dos columnas existen y con qué valores arrancan los pedidos ya creados.
SELECT column_name, data_type, column_default, is_nullable
  FROM information_schema.columns
 WHERE table_schema = 'lifebook' AND table_name = 'orders'
   AND column_name IN ('delivery_code_attempts', 'delivery_code_locked_until')
 ORDER BY column_name;

SELECT count(*) AS pedidos_con_intentos, max(delivery_code_attempts) AS max_intentos
  FROM lifebook.orders;
