-- =============================================================================
-- 84 — EL MOSTRADOR DE NÚMEROS DE PEDIDO (punto 13 de la §3, corrección)
--
-- POR QUÉ UNA TABLA Y NO UN CANDADO: el primer intento (`parche85`) usaba un candado
-- (`pg_advisory_xact_lock`) DENTRO de la transacción del pedido. Como ese candado no se suelta hasta
-- hacer commit, las compras simultáneas se ponían EN FILA durante toda la creación del pedido, y a
-- partir de la tercera Prisma cortaba la transacción por tiempo (>5 s):
--
--     P2028 — Transaction already closed: A transaction cannot be executed on an expired transaction.
--
-- Con un mostrador, el número se aparta con **una sola frase** (`INSERT … ON CONFLICT DO UPDATE …
-- RETURNING`), que es atómica: la fila se bloquea microsegundos, no la transacción entera. Y como el
-- número queda **escrito**, el siguiente lo ve (con el candado no: dos transacciones cortas habrían
-- leído el mismo `max`).
--
-- La fila se siembra con el número más alto que ya existe ese día, para no chocar con los pedidos que
-- ya hay (el índice `orders_order_no_key` es único).
--
-- Uso:  (se pasa a psql como el resto de migraciones de /pruebas)
-- =============================================================================

CREATE TABLE IF NOT EXISTS lifebook.order_counters (
  day        text PRIMARY KEY,          -- 'YYMMDD', el mismo día que lleva el número del pedido
  ultimo     integer NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE lifebook.order_counters IS
  'Mostrador de números de pedido por día. Se aparta con INSERT … ON CONFLICT DO UPDATE … RETURNING (atómico).';

-- Siembra: cada día que YA tiene pedidos arranca desde su número más alto (si no, el mostrador empezaría
-- en 1 y chocaría con los pedidos existentes contra el índice único).
INSERT INTO lifebook.order_counters (day, ultimo)
SELECT substring(order_no from 4 for 6) AS day,
       max(substring(order_no from '[0-9]+$')::int) AS ultimo
  FROM lifebook.orders
 WHERE order_no ~ '^LB-[0-9]{6}-[0-9]+$'
 GROUP BY 1
    ON CONFLICT (day) DO UPDATE SET ultimo = greatest(lifebook.order_counters.ultimo, excluded.ultimo),
                                    updated_at = now();

SELECT day, ultimo FROM lifebook.order_counters ORDER BY day DESC LIMIT 5;
SELECT count(*) AS dias_sembrados FROM lifebook.order_counters;
