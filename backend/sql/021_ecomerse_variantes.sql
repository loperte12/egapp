-- =============================================================================
-- 021_ecomerse_variantes.sql — Fase 4 · SKU: los ejes y las combinaciones.
--
-- POR QUÉ EXISTE: en `ecomerse`, el comerciante NO puede decir que su anuncio
-- tiene tallas o colores. Su formulario pide «Talla» y «Color» como TEXTO LIBRE y
-- los mete en `attributes` (jsonb), donde nadie los lee: `attributes` es
-- identidad, no una elección. Consecuencia medida el 20-sep-2026:
--   · el comprador no elige nada — compra la primera combinación de la lista;
--   · no hay existencias POR combinación: «Blanco · M» agotada no se puede
--     expresar, solo un stock único del anuncio;
--   · la ficha no puede enseñar la prenda del color elegido.
-- El otro mercado de la MISMA app (`lifebook`) lleva desde septiembre con el
-- sistema completo y desplegado. Esta migración trae **la misma forma**.
--
-- DECISIÓN DE DISEÑO (opción B, 21-sep-2026): NO se comparten los objetos
-- físicos con `lifebook`, y no por comodidad: `lifebook.product_variants`,
-- `product_option_groups` y `product_option_values` tienen **FK dura a
-- `lifebook.products(id)`**, así que un producto de `ecomerse` no puede ser
-- referenciado sin VOLAR esa FK en un módulo vivo. Se comparte lo que de verdad
-- puede divergir — **las reglas**, en un único módulo de código (`opciones-producto.service.ts`)
-- — y se replica la forma, con un test estructural que compara los dos DDL para
-- que no se separen solos. Detalle: `FASE-4-B-DISENO.md`.
--
-- QUÉ NO HACE: no toca `lifebook` salvo UN índice aditivo (ver el final), no
-- cambia `wallet.ecomerse_products.stock` ni su `status`, y no migra datos: los
-- anuncios vivos siguen sin variantes y se comportan exactamente igual
-- (sin filas en `..._variants`, el camino de hoy es el único camino).
--
-- IDEMPOTENTE: `create table if not exists` + `create index if not exists`.
-- Se puede aplicar dos veces sin efecto.
-- =============================================================================

-- ── 1. Los EJES («Color», «Talla») ───────────────────────────────────────────
create table if not exists wallet.ecomerse_product_option_groups (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references wallet.ecomerse_products(id) on delete cascade,
  code       varchar(30) not null,
  label      varchar(40) not null,
  kind       varchar(10) not null,
  chart_kind varchar(10),
  position   smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- El `code` es la clave de la que cuelga la combinación (`attributes` = {code: valor}):
-- `^[a-z0-9_]{2,30}$` no es cosmética, es lo que hace que el jsonb sea comparable
-- sin sorpresas de mayúsculas o acentos.
alter table wallet.ecomerse_product_option_groups drop constraint if exists ec_option_groups_code_check;
alter table wallet.ecomerse_product_option_groups add constraint ec_option_groups_code_check
  check (code ~ '^[a-z0-9_]{2,30}$');
alter table wallet.ecomerse_product_option_groups drop constraint if exists ec_option_groups_kind_check;
alter table wallet.ecomerse_product_option_groups add constraint ec_option_groups_kind_check
  check (kind in ('color', 'size', 'text'));
alter table wallet.ecomerse_product_option_groups drop constraint if exists ec_option_groups_chart_check;
alter table wallet.ecomerse_product_option_groups add constraint ec_option_groups_chart_check
  check (chart_kind is null or chart_kind in ('top', 'bottom', 'dress', 'shoes', 'accessory', 'other'));

create unique index if not exists uq_ec_option_group_code on wallet.ecomerse_product_option_groups (product_id, code);
create unique index if not exists uq_ec_option_group_pos  on wallet.ecomerse_product_option_groups (product_id, position);
create index        if not exists ix_ec_option_group_product on wallet.ecomerse_product_option_groups (product_id, position);

-- ── 2. Los VALORES de cada eje («Rojo», «M») ─────────────────────────────────
create table if not exists wallet.ecomerse_product_option_values (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references wallet.ecomerse_product_option_groups(id) on delete cascade,
  value      varchar(40) not null,
  label      varchar(60),
  image_url  varchar(400),
  hex        varchar(9),
  position   smallint not null default 0,
  created_at timestamptz not null default now()
);

-- `lower(value)` en el índice: «Rojo» y «rojo» son el MISMO valor. La regla vive
-- también en el validador, pero aquí no se puede esquivar desde ningún camino.
create unique index if not exists uq_ec_option_value     on wallet.ecomerse_product_option_values (group_id, lower(value::text));
create unique index if not exists uq_ec_option_value_pos on wallet.ecomerse_product_option_values (group_id, position);
create index        if not exists ix_ec_option_value_group on wallet.ecomerse_product_option_values (group_id, position);

-- ── 3. Las COMBINACIONES (la fila que el comerciante rellena) ────────────────
create table if not exists wallet.ecomerse_product_variants (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references wallet.ecomerse_products(id) on delete cascade,
  name           varchar(120) not null,
  price_xaf      integer,
  stock_quantity integer not null default 0,
  sku            varchar(60),
  image_url      varchar(400),
  weight_g       integer,
  attributes     jsonb not null default '{}'::jsonb,
  position       integer not null default 0,
  created_at     timestamptz not null default now()
);

-- `price_xaf` NULLABLE a propósito: NULL = hereda el precio del anuncio. Es la
-- regla del editor («Precio o stock vacíos = los del producto») y es lo que
-- permite que el precio por variante sea opcional en la v1 sin tocar el esquema.
alter table wallet.ecomerse_product_variants drop constraint if exists ec_variants_price_check;
alter table wallet.ecomerse_product_variants add constraint ec_variants_price_check
  check (price_xaf is null or price_xaf >= 0);
alter table wallet.ecomerse_product_variants drop constraint if exists ec_variants_stock_check;
alter table wallet.ecomerse_product_variants add constraint ec_variants_stock_check
  check (stock_quantity >= 0);
alter table wallet.ecomerse_product_variants drop constraint if exists ec_variants_weight_check;
alter table wallet.ecomerse_product_variants add constraint ec_variants_weight_check
  check (weight_g is null or weight_g >= 0);

create unique index if not exists uq_ec_variant_name on wallet.ecomerse_product_variants (product_id, name);
create unique index if not exists uq_ec_variant_sku  on wallet.ecomerse_product_variants (product_id, sku) where sku is not null;
create index        if not exists ix_ec_variants_product on wallet.ecomerse_product_variants (product_id, position);

-- ── 4. La combinación NO se puede repetir — y ahora lo impide la base ────────
-- El validador ya lo comprueba (`VARIANT_COMBINATION_DUPLICATED`), pero eso es
-- solo CÓDIGO: el día que un camino nuevo escriba variantes sin pasar por él, la
-- ficha tendría dos veces «Rojo · M» y el selector del comprador elegiría una de
-- las dos al azar. Índice PARCIAL (`attributes <> '{}'`) porque una variante sin
-- ejes —las 25 que ya existen en `lifebook`— sí puede repetir el jsonb vacío.
-- Medido antes de crearlo: 0 productos con combinaciones repetidas (21-sep-2026).
create unique index if not exists uq_ec_variant_combo
  on wallet.ecomerse_product_variants (product_id, attributes) where attributes <> '{}'::jsonb;

-- Y el mismo candado para `lifebook`, que hasta hoy tampoco lo tenía. Es aditivo
-- y no puede romper nada: solo rechaza duplicados, y se ha comprobado que no hay.
-- Si se deja fuera, las dos formas dejan de ser la misma y el test estructural
-- que las compara perdería su sentido.
create unique index if not exists uq_lb_variant_combo
  on lifebook.product_variants (product_id, attributes) where attributes <> '{}'::jsonb;

-- ── 5. Comprobación (informativa) ────────────────────────────────────────────
--   select table_name from information_schema.tables
--    where table_schema = 'wallet' and table_name like 'ecomerse_product_%'
--    order by 1;
