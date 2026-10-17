#!/bin/bash
# probar-tarjeta-en-el-servidor.sh — inserta UN mensaje de tarjeta de prueba en el chat de produccion.
#
# COMO SE LANZA:
#   $env:TARJETA_CONV = '<uuid-de-la-conversacion>'
#   & D:\egapp\pruebas\as-servidor.ps1 -Remoto D:\egapp\pruebas\probar-tarjeta-en-el-servidor.sh
#
# POR QUE PIDE LA CONVERSACION EN VEZ DE ELEGIRLA: esto es produccion. Elegir «la mas
# reciente» podria escribir en la conversacion de un cliente. Con el id explicito, la
# persona decide donde prueba y no se toca nada que no se haya elegido.
#
# QUE HACE: un INSERT en lifebook.messages con kind='card'. Nada mas. No toca ninguna
# otra fila, no cambia estados, no despliega codigo.
set -uo pipefail

if [ -z "${TARJETA_CONV:-}" ]; then
  echo "FALTA TARJETA_CONV."
  echo "Primero mira que conversaciones hay:"
  docker exec -i mirror-postgres psql -U postgres -d egrouteplan -A -F '|' -c \
    "select conversation_id, count(*) as mensajes, max(created_at) as ultimo
       from lifebook.messages group by conversation_id order by ultimo desc limit 10;"
  exit 1
fi

echo "== 0. comprobaciones previas =="
docker ps --format '{{.Names}}' | grep -q '^mirror-postgres$' || { echo "NO esta el contenedor mirror-postgres"; exit 1; }
echo "  contenedor: OK"
echo "  conversacion: $TARJETA_CONV"

# El firmante: uno de los dos participantes de ESA conversacion, para que el mensaje
# tenga sentido dentro de ella.
SENDER=$(docker exec -i mirror-postgres psql -U postgres -d egrouteplan -A -t -c \
  "select user_a from lifebook.conversations where id = '$TARJETA_CONV'::uuid;")
SENDER=$(echo "$SENDER" | tr -d '[:space:]')
if [ -z "$SENDER" ]; then echo "Esa conversacion no existe"; exit 1; fi
echo "  firmante: $SENDER"

# Un pedido reciente, para que el boton «Abrir el pedido» tenga destino real.
ORDER_ID=$(docker exec -i mirror-postgres psql -U postgres -d egrouteplan -A -t -c \
  "select id from lifebook.orders order by created_at desc limit 1;")
ORDER_ID=$(echo "$ORDER_ID" | tr -d '[:space:]')
echo "  pedido destino: ${ORDER_ID:-'(ninguno: el boton no navegara)'}"

echo "== 1. insertar la tarjeta de prueba =="
PGPASSWORD=""
docker exec -i mirror-postgres psql -U postgres -d egrouteplan -v ON_ERROR_STOP=1 -A -F '|' <<SQL
INSERT INTO lifebook.messages (conversation_id, sender_id, body, kind, payload)
VALUES (
  '$TARJETA_CONV'::uuid,
  '$SENDER'::uuid,
  'Prueba de tarjeta',
  'card',
  '{
    "cardType": "texto-acciones",
    "data": {
      "title": "Prueba del motor de tarjetas",
      "body": "Si ves esta tarjeta y los botones navegan, el motor de las 54 funciona.",
      "buttons": [
        { "id": "abrir-pedido", "buttonValue": "Abrir el pedido", "buttonTargetType": "order", "buttonTargetId": "${ORDER_ID}" },
        { "id": "ver-producto", "buttonValue": "Ver el producto" }
      ]
    }
  }'::jsonb
)
RETURNING id, created_at;
SQL

echo "== 2. dejar la vista previa de la conversacion al dia =="
docker exec -i mirror-postgres psql -U postgres -d egrouteplan -c \
  "UPDATE lifebook.conversations SET last_message='Prueba de tarjeta', last_message_at=now()
    WHERE id = '$TARJETA_CONV'::uuid;" 2>&1 | tail -1

echo "== 3. comprobar que se guardo como el motor lo lee =="
docker exec -i mirror-postgres psql -U postgres -d egrouteplan -A -F '|' -c \
  "select id, kind, payload->>'cardType' as card_type, left(body,30) as vista_previa
     from lifebook.messages where kind='card' order by created_at desc limit 3;" 2>&1

echo ""
echo "AHORA: abre esa conversacion en el movil. En 4 s (sondeo) debe salir la tarjeta."
echo "PARA BORRARLA:"
echo "  docker exec -i mirror-postgres psql -U postgres -d egrouteplan -c \"DELETE FROM lifebook.messages WHERE body='Prueba de tarjeta';\""
echo "FIN"
