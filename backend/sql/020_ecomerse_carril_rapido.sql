-- =============================================================================
-- 020_ecomerse_carril_rapido.sql — Zona del comerciante, Fase 1 (los dos carriles).
--
-- POR QUÉ EXISTE: el vendedor no podía PAUSAR ni RETIRAR su propio anuncio. Lo
-- único que había era el CHECK de `status`, que admite
--   draft · pending · active · rejected · sold_out
-- — o sea: la operación diaria del comerciante (pausar mientras repone, retirar
-- lo que ya no vende) no tenía dónde vivir. Los endpoints nuevos
-- (`seller/products/:id/state`) escribirían 'paused' y 'removed' y Postgres los
-- habría rechazado con un 23514 en la cara del usuario.
--
-- LO QUE SÍ ES UN FALLO DE HOY, medido y no supuesto: en la app,
-- `ecomerse-seller.tsx` ya traducía `paused: 'Pausada'` — **una etiqueta que
-- ninguna ruta podía escribir**. Etiqueta muerta: prometía un estado imposible.
--
-- QUÉ NO HACE: no toca `stock` ni los datos del anuncio. Existencias ya se
-- descuentan con la guarda atómica `WHERE … AND stock >= $2` (cierre de la doble
-- venta); esta migración es SOLO vocabulario de estado.
--
-- Por qué no se añade una columna `removed_at`: nadie la leería. La retirada la
-- decide el propio vendedor y la deshace él; guardar el motivo de su propia
-- decisión no le aporta nada. Se añade cuando alguien lo pida.
--
-- IDEMPOTENTE: `drop constraint if exists` + `add constraint`. Se puede aplicar
-- dos veces sin efecto.
-- =============================================================================

alter table wallet.ecomerse_products
  drop constraint if exists ecomerse_products_status_check;

alter table wallet.ecomerse_products
  add constraint ecomerse_products_status_check
  check (status in ('draft', 'pending', 'active', 'rejected', 'sold_out', 'paused', 'removed'));

-- Comprobación (informativa, no falla si sale vacío):
--   select conname, pg_get_constraintdef(oid)
--     from pg_constraint where conname = 'ecomerse_products_status_check';
