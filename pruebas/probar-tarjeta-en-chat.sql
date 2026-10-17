-- ─────────────────────────────────────────────────────────────────────────────
-- MENSAJE DE PRUEBA CON UNA TARJETA — para verificar el motor en el móvil
-- ─────────────────────────────────────────────────────────────────────────────
--
-- QUÉ HACE: inserta UN mensaje de tipo `card` en una conversación que ya existe. La app lo
-- recogerá en el siguiente sondeo (4 s) y lo pintará con el motor de las 54 tarjetas.
--
-- POR QUÉ ESTE SQL Y NO UNA PANTALLA DE PRUEBA: verificar el motor sin desplegar el servidor
-- exige datos. Un mensaje en la base es el dato más pequeño posible, y se borra con un DELETE.
--
-- ⚠️  SE EJECUTA EN LA BASE DE PRODUCCIÓN. Es un mensaje de prueba en tu propia conversación,
--     y abajo tienes el DELETE para quitarlo. No toca ninguna otra fila.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 1 · encontrar una conversación y un pedido
-- ─────────────────────────────────────────────────────────────────────────────

-- Una conversación reciente (copia el `id`):
SELECT id, kind, user_a, user_b, last_message, last_message_at
  FROM lifebook.conversations
 ORDER BY last_message_at DESC NULLS LAST
 LIMIT 5;

-- Un pedido reciente para que el botón «Abrir el pedido» tenga a dónde ir (copia el `id`):
SELECT id, order_no, status
  FROM lifebook.orders
 ORDER BY created_at DESC
 LIMIT 5;

-- Un producto para el segundo botón (opcional):
SELECT id, title
  FROM lifebook.products
 WHERE status = 'active'
 LIMIT 3;


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 2 · insertar el mensaje de prueba
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Sustituye los tres marcadores:
--   <CONV_ID>    · id de la conversación del paso 1
--   <SENDER_ID>  · quién firma el mensaje: usa el `user_a` o `user_b` de esa conversación
--   <ORDER_ID>   · id de un pedido del paso 1
--
-- El `payload` es EXACTAMENTE la forma que lee `serializeMessage` en el servidor:
--   { cardType, data }
-- y `data` es lo que recibe el componente `texto-acciones` del registro.
--
-- Los botones llevan `buttonTargetType` + `buttonTargetId`: es el «destino viaja con el botón»
-- que se implementó. Si el botón navega, está probado todo: motor, botones y destino.

INSERT INTO lifebook.messages (conversation_id, sender_id, body, kind, payload)
VALUES (
  '<CONV_ID>'::uuid,
  '<SENDER_ID>'::uuid,
  'Prueba de tarjeta',   -- esto es lo que se ve en la lista de conversaciones
  'card',
  '{
    "cardType": "texto-acciones",
    "data": {
      "title": "Prueba del motor de tarjetas",
      "body": "Si ves esta tarjeta y los botones navegan, el motor de las 54 funciona.",
      "buttons": [
        { "id": "abrir-pedido", "buttonValue": "Abrir el pedido", "buttonTargetType": "order", "buttonTargetId": "<ORDER_ID>" },
        { "id": "ver-producto", "buttonValue": "Ver el producto" }
      ]
    }
  }'::jsonb
)
RETURNING id, kind, created_at;


-- ─────────────────────────────────────────────────────────────────────────────
-- PASO 3 · qué deberías ver en el móvil
-- ─────────────────────────────────────────────────────────────────────────────
--
--  1. Abre la conversación elegida. En 4 s aparece una tarjeta con:
--       · titular «Prueba del motor de tarjetas»
--       · el cuerpo gris
--       · DOS botones en píldora
--  2. Pulsa «Abrir el pedido»  → navega a la ficha de ESE pedido.
--     Eso prueba: motor + botones + destino tipado.
--  3. Pulsa «Ver el producto»  → NO navega (no le di destino): es lo correcto.
--     Eso prueba que un botón sin destino no manda a ningún sitio.
--  4. Vuelve a la lista de conversaciones: la vista previa dice «Prueba de tarjeta».
--     Eso prueba que el `body` sigue sirviendo de vista previa.


-- ─────────────────────────────────────────────────────────────────────────────
-- LIMPIEZA
-- ─────────────────────────────────────────────────────────────────────────────

DELETE FROM lifebook.messages WHERE body = 'Prueba de tarjeta';


-- ─────────────────────────────────────────────────────────────────────────────
-- SI ALGO NO SALE
-- ─────────────────────────────────────────────────────────────────────────────
--
-- · La tarjeta NO aparece:
--     ¿la app está en la conversación y con sondeo activo? ¿la conversación es la correcta?
--
-- · Aparece el aviso de «mensaje no soportado»:
--     el `cardType` no está en el registro, o pide una `minAppVersion` mayor que la app.
--     Con este SQL no debería pasar: `texto-acciones` está registrado desde la campaña.
--
-- · La tarjeta se pinta pero los botones no hacen nada:
--     revisa que `buttonTargetType` sea exactamente `order` (o `product`), y que el id sea un UUID
--     real de la tabla. El cliente lo resuelve en `destinoDeBoton`, y si no encuentra destino,
--     NO navega a propósito.
