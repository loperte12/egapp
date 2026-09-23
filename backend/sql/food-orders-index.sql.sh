#!/bin/bash
# food-orders-index.sql.sh — índice por estado en wallet.food_orders (Lote 1, A5).
#
# QUÉ ARREGLA: el panel del dueño filtra por estado (open/delivered/cancelled) en
# cada carga, y el servidor lo resuelve con `o.status IN (...)` en myOrders
# (food.service.ts:293-301). Sin índice eso es un recorrido secuencial completo de
# food_orders. Las tablas hermanas ya indexan por status (030_food.sql:48
# food_restaurants, :115 food_reports); food_orders no.
#
# CUMPLE EL PROTOCOLO DE COEXISTENCIA (§8): solo aditivo, idempotente
# (IF NOT EXISTS), con foto ANTES y control DESPUÉS.
#
# ⚠️ A DIFERENCIA de los otros scripts, este NO lleva BEGIN/COMMIT:
#    CREATE INDEX CONCURRENTLY no puede ejecutarse dentro de un bloque de
#    transacción (PostgreSQL lo rechaza con "cannot run inside a transaction
#    block"). psql en modo autocommit ejecuta cada sentencia por su cuenta, que es
#    justo lo que CONCURRENTLY necesita.
#
#    Se usa CONCURRENTLY a propósito: no bloquea las escrituras, y en una caja con
#    UNA sola aplicación en producción (sin staging, según el protocolo) eso es lo
#    que importa. El coste es que tarda más y que, si se interrumpe, deja un índice
#    INVALID que hay que borrar a mano y reintentar.
set -e
docker exec -i mirror-postgres psql -U postgres -d egrouteplan -v ON_ERROR_STOP=1 <<'SQL'
-- Foto ANTES: volumen actual de la tabla (hoy es de demostración: ~1 pedido).
SELECT 'ANTES: ' || count(*)::text || ' filas en wallet.food_orders'
  FROM wallet.food_orders;

-- Índices existentes ANTES, para ver qué falta.
SELECT 'ANTES: índice ' || indexname
  FROM pg_indexes
 WHERE schemaname = 'wallet' AND tablename = 'food_orders'
 ORDER BY indexname;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_food_orders_status
  ON wallet.food_orders (status, created_at DESC);
SQL

# Control DESPUÉS: el índice existe Y quedó válido. CONCURRENTLY puede dejarlo
# INVALID si se interrumpe; si indisvalid es false hay que borrarlo y reintentar.
#
# OJO (corregido el 2026-09-12 al ejecutarlo): estas líneas estaban como comentario SQL (`--`)
# FUERA del bloque `heredoc`. Bash no entiende `--` y trata la línea como un comando → «command not
# found»; y como el script lleva `set -e`, moría AQUÍ: el índice se creaba bien, pero **el control de
# DESPUÉS no llegaba a ejecutarse** y el script terminaba en error. Los comentarios van con `#`.
docker exec -i mirror-postgres psql -U postgres -d egrouteplan -v ON_ERROR_STOP=1 <<'SQL'
SELECT 'DESPUES: índice ' || indexname || ' presente'
  FROM pg_indexes
 WHERE schemaname = 'wallet' AND indexname = 'idx_food_orders_status';

SELECT CASE WHEN indisvalid
            THEN 'DESPUES: índice VALIDO ✓'
            ELSE 'DESPUES: indice INVALIDO ✗ — DROP INDEX wallet.idx_food_orders_status; y reintentar'
       END AS verificacion
  FROM pg_index
 WHERE indexrelid = 'wallet.idx_food_orders_status'::regclass;
SQL

# NOTA sobre EXPLAIN: NO se usa aquí a propósito. Con ~1 fila en la tabla el
# planificador elegirá SIEMPRE un recorrido secuencial, porque es más barato que
# usar el índice. Un EXPLAIN ahora daría "Seq Scan" y parecería que el índice no
# sirve, cuando en realidad es correcto para este volumen. El índice se justifica
# por el volumen futuro, no por el actual. Para comprobarlo de verdad haría falta
# datos de prueba suficientes (miles de filas) en egrouteplan_staging.
#
# (Estas líneas estaban como comentario SQL `--` DENTRO del heredoc: psql las recibía
#  como sentencia y daba «syntax error at or near #». Mismo fallo que arriba, al revés:
#  el comentario tiene que estar fuera del heredoc y empezar por #.)
echo "food-orders-index: hecho. Revisa la línea DESPUES: índice VALIDO."
