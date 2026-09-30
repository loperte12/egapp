-- =============================================================================
-- 027 — LAS DIMENSIONES DE LA RESEÑA: desglosar el juicio, no duplicarlo
--
-- QUÉ RESUELVE
-- La ficha del hotel (快搭 v12) enseña la nota desglosada en barras — limpieza,
-- servicio, ubicación, instalaciones. La 026 definió la reseña como UNA nota
-- (`rating`) + texto opcional: el servidor no puede dar hoy ese desglose porque
-- el dato no existe. Esta migración añade las cuatro columnas; el servicio las
-- acepta al escribir y calcula las medias al leer. Nada más y nada menos.
--
-- POR QUÉ COLUMNAS OPCIONALES (NULL), Y NO `NOT NULL DEFAULT ...`
-- El desglose es una AMPLIACIÓN del juicio, no su condición: una reseña de solo
-- estrellas sigue siendo una reseña (026 lo decidió para el texto y aquí es lo
-- mismo). Obligar a puntuar cuatro dimensiones sería convertir «¿cómo fue?» en
-- un formulario — y las reseñas viejas (escritas antes de esta migración) no las
-- tienen: un `NOT NULL` obligaría a inventar datos para las filas existentes.
-- La media de cada dimensión se calcula SOLO sobre las reseñas que la traen:
-- `avg()` ignora los NULL, y NULL en el resultado = nadie puntúo esa dimensión.
--
-- POR QUÉ NO UNA TABLA NUEVA (`hotel_review_scores`)
-- Serían cuatro filas por reseña para cuatro números que caben en la propia
-- fila. La tabla de reseñas es pequeña (una por estancia), el acceso es SIEMPRE
-- por reseña o por hotel (agregado), y una tabla aparte añadiría un JOIN para
-- nada. Si algún día se quisieran más dimensiones (10+), la tabla hija sería el
-- remedio siguiente, no el primero.
--
-- POR QUÉ NO ESPEJO PARA LAS MEDIAS DE DIMENSIÓN
-- La 026 copió la media GLOBAL a `hotel_profiles` porque la BÚSQUEDA la lee por
-- tarjeta (coste por fila que la lista no puede pagar, §8.1). El desglose solo
-- se lee en la FICHA (una petición por hotel, no por tarjeta): agregar al vuelo
-- con `avg()` sobre `ix_lb_reviews_shop` es barato y no crea un segundo sitio
-- donde el mismo número se puede quedar viejo. Quien pida el desglose en la
-- lista de hoteles tendrá que justificar el espejo antes de escribirlo.
--
-- EL UMBRAL [D-K] sigue siendo del SERVICIO
-- «No se publica la nota hasta tener 3 reseñas» no va en la base (026, cabecera):
-- el servicio decide con `publishesRating` si enseña las medias, igual que la
-- media global. La base solo guarda.
--
-- Idempotente: se puede aplicar dos veces sin efecto. Sin DML.
-- =============================================================================

-- ── 1. Las cuatro columnas ───────────────────────────────────────────────────
-- `smallint` y CHECK 1..5, igual que `rating` (026): la escala que la app ya
-- usa. Los CHECK llevan nombre estable (`lb_hr_dim_*`) por si algún día hay que
-- citarlos en un error o en una validación de datos.
alter table lifebook.hotel_reviews
  add column if not exists cleanliness smallint,
  add column if not exists service     smallint,
  add column if not exists location    smallint,
  add column if not exists facilities  smallint;

-- Los CHECK en línea se añaden aparte para poder nombrarlos y ser idempotentes
-- (un `add constraint if not exists` no existe en Postgres: se comprueba en el
-- catálogo, como en la 025 hizo la casa con las FK).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lb_hr_dim_clean') then
    alter table lifebook.hotel_reviews
      add constraint lb_hr_dim_clean check (cleanliness between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lb_hr_dim_serv') then
    alter table lifebook.hotel_reviews
      add constraint lb_hr_dim_serv check (service between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lb_hr_dim_loc') then
    alter table lifebook.hotel_reviews
      add constraint lb_hr_dim_loc check (location between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'lb_hr_dim_fac') then
    alter table lifebook.hotel_reviews
      add constraint lb_hr_dim_fac check (facilities between 1 and 5);
  end if;
end $$;
