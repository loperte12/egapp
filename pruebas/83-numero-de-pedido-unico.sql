-- =============================================================================
-- 83 — EL NÚMERO DE PEDIDO ÚNICO: COMPROBACIÓN (punto 13 de la §3)
--
-- Este fichero NO crea nada, y es a propósito: el índice único **ya existía**. El documento de la §3
-- decía «`order_no` único — `count(*) + 1`, **sin índice único**» y eso es **falso**: aquí queda la
-- prueba, para que nadie vuelva a auditar lo mismo. Lo que sí estaba mal era el CÁLCULO del número
-- (ver `parche85`), cuyo síntoma no era un número repetido sino una **compra perdida**.
--
-- Uso:  (se pasa a psql como el resto; solo lee)
-- =============================================================================

-- 1 · ¿Existe el índice único? Tiene que salir UNIQUE.
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'lifebook' AND tablename = 'orders' AND indexname = 'orders_order_no_key';

-- 2 · ¿Hay números repetidos? Tiene que salir 0 filas.
SELECT order_no, count(*) AS veces
  FROM lifebook.orders GROUP BY order_no HAVING count(*) > 1;

-- 3 · Y una foto del estado: pedidos y números distintos (deben coincidir).
SELECT count(*) AS pedidos, count(DISTINCT order_no) AS numeros_distintos,
       max(order_no) AS ultimo_numero FROM lifebook.orders;
