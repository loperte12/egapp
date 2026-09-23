#!/bin/bash
# food-item-details.sql.sh — DETALLE DE PLATO del módulo Comida Rápida (parte 041).
#
# QUÉ AÑADE: cierra el hueco del requisito «todo lujo de detalle» en el menú.
# `wallet.food_menu_items` solo tenía nombre, descripción, categoría, precio y
# fotos. Ahora lleva además ingredientes, nivel de picante, tamaño/ración,
# bebida incluida, acompañantes y tiempo de preparación. Y el pedido guarda un
# snapshot del ETA de cocina (`est_prep_minutes`) para mostrarlo en seguimiento.
#
# CUMPLE EL PROTOCOLO DE COEXISTENCIA (§8):
#   · SOLO ADITIVO: columnas nuevas con DEFAULT o NULLables. No se renombra ni
#     se cambia el tipo de ninguna columna en uso.
#   · NO cambia el SIGNIFICADO de nada existente: `status`, `available`,
#     `price_xaf`, `photos`, `category` siguen igual. El hotel no depende de
#     ninguna tabla `food_*`, así que sus puertas (§4) no se ven afectadas.
#   · IDEMPOTENTE: `ADD COLUMN IF NOT EXISTS` + `DROP CONSTRAINT IF EXISTS`.
#     Se puede repetir sin miedo.
#   · Foto ANTES y control DESPUÉS, como `lb42e-reparar-publicaciones.sql.sh`.
#
# Los platos ya publicados quedan con estos campos en NULL/false/'[]' y se
# siguen mostrando igual que antes: el frontend los trata como «no declarado».
set -e
docker exec -i mirror-postgres psql -U postgres -d egrouteplan -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

-- Foto ANTES: qué columnas faltan todavía.
SELECT 'ANTES: ' || count(*)::text || ' de 6 columnas de detalle presentes en food_menu_items'
  FROM information_schema.columns
 WHERE table_schema = 'wallet' AND table_name = 'food_menu_items'
   AND column_name IN ('ingredients','spice_level','portion_size',
                       'drink_included','sides','prep_minutes');

-- ---------------------------------------------------------- Menú: detalles
ALTER TABLE wallet.food_menu_items
  ADD COLUMN IF NOT EXISTS ingredients    text,                          -- lista libre
  ADD COLUMN IF NOT EXISTS spice_level    varchar(12),                   -- none|mild|medium|hot|extra_hot
  ADD COLUMN IF NOT EXISTS portion_size   varchar(40),                   -- "2 piezas", "400 g", "Grande"
  ADD COLUMN IF NOT EXISTS drink_included boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sides          jsonb NOT NULL DEFAULT '[]',   -- mismo patrón que `photos`
  ADD COLUMN IF NOT EXISTS prep_minutes   int;                           -- NULL = no publicado

-- CHECKs nombrados (patrón del esquema: <tabla>_<campo>_check).
ALTER TABLE wallet.food_menu_items DROP CONSTRAINT IF EXISTS food_menu_items_spice_check;
ALTER TABLE wallet.food_menu_items
  ADD CONSTRAINT food_menu_items_spice_check
  CHECK (spice_level IS NULL OR spice_level IN ('none','mild','medium','hot','extra_hot'));

ALTER TABLE wallet.food_menu_items DROP CONSTRAINT IF EXISTS food_menu_items_prep_check;
ALTER TABLE wallet.food_menu_items
  ADD CONSTRAINT food_menu_items_prep_check
  CHECK (prep_minutes IS NULL OR (prep_minutes >= 1 AND prep_minutes <= 240));

-- ---------------------------------------------------------- Pedidos: ETA snapshot
ALTER TABLE wallet.food_orders
  ADD COLUMN IF NOT EXISTS est_prep_minutes int;   -- máx. de prep_minutes de los ítems

ALTER TABLE wallet.food_orders DROP CONSTRAINT IF EXISTS food_orders_est_prep_check;
ALTER TABLE wallet.food_orders
  ADD CONSTRAINT food_orders_est_prep_check
  CHECK (est_prep_minutes IS NULL OR (est_prep_minutes >= 1 AND est_prep_minutes <= 240));

-- Índice para el menú por categoría (la consulta del detalle del restaurante
-- ordena por category y filtra por available).
CREATE INDEX IF NOT EXISTS idx_food_menu_restaurant_cat
  ON wallet.food_menu_items (restaurant_id, category, available);

-- NOTA PERMISOS: no se conceden de nuevo. `030_food.sql` ya dio GRANT a nivel de
-- TABLA a `malabogo` sobre food_menu_items y food_orders, y ALTER TABLE ADD
-- COLUMN no revoca privilegios. Se verifica abajo.

COMMIT;

-- Control DESPUÉS: tienen que dar 6, 1 y 3 respectivamente.
SELECT 'DESPUES: ' || count(*)::text || ' de 6 columnas de detalle presentes en food_menu_items'
  FROM information_schema.columns
 WHERE table_schema = 'wallet' AND table_name = 'food_menu_items'
   AND column_name IN ('ingredients','spice_level','portion_size',
                       'drink_included','sides','prep_minutes');

SELECT 'DESPUES: ' || count(*)::text || ' de 1 columna ETA presente en food_orders'
  FROM information_schema.columns
 WHERE table_schema = 'wallet' AND table_name = 'food_orders'
   AND column_name = 'est_prep_minutes';

SELECT 'DESPUES: ' || count(*)::text || ' de 3 CHECKs nuevos en pie'
  FROM pg_constraint
 WHERE conname IN ('food_menu_items_spice_check','food_menu_items_prep_check',
                   'food_orders_est_prep_check');

-- Los GRANT deben seguir en pie tras el ALTER:
SELECT grantee, privilege_type
  FROM information_schema.role_table_grants
 WHERE table_schema = 'wallet' AND table_name = 'food_menu_items'
 ORDER BY grantee, privilege_type;
SQL
echo "food-041: detalle de plato añadido (aditivo e idempotente)."
