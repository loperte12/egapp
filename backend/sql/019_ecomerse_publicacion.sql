-- =============================================================================
-- 019_ecomerse_publicacion.sql — Tanda 4 de la auditoría de diseño del Mercado.
--
-- POR QUÉ EXISTE: el formulario de publicar tiene seis secciones (las mismas que pide
-- la app de referencia 得物/Dewu) y dos de ellas no tenían dónde guardar nada:
--   · Sección 4 · DOCUMENTACIÓN (certificado de autenticidad, factura de compra,
--     autorización de marca) → no existía ninguna tabla.
--   · Sección 5 · LOGÍSTICA (plazo de preparación y política de devoluciones) →
--     no existían columnas.
-- Hasta ahora la pantalla lo explicaba en vez de fingir campos que no guardaban nada.
--
-- QUÉ NO HACE: no toca datos fiscales ni cuenta de cobro del vendedor (NIF, dirección,
-- IBAN). Eso queda fuera por decisión del dueño y no está aquí.
--
-- PATRÓN: se copia `mobility.driver_documents`, que ya resuelve el mismo problema para
-- los conductores (doc_type + url + status + quién revisó y cuándo). No se inventa otro.
--
-- IDEMPOTENTE: se puede aplicar dos veces sin efecto (IF NOT EXISTS / DROP CONSTRAINT IF EXISTS).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1) PLAZO DE PREPARACIÓN Y DEVOLUCIONES (columnas del anuncio)
-- -----------------------------------------------------------------------------
-- Por qué columnas y no `attributes`: son datos por los que el comprador FILTRA, y un
-- campo dentro de un jsonb no se indexa ni se consulta con comodidad. Lo accesorio
-- (marca, talla, color) sí se quedó en `attributes`.
alter table wallet.ecomerse_products
  add column if not exists handling_hours integer not null default 24,
  add column if not exists returns_accepted boolean not null default false;

-- Plazos admitidos: los tres que se ofrecen en el formulario. Un valor fuera de la lista
-- no debe entrar por la puerta de atrás de un UPDATE.
alter table wallet.ecomerse_products drop constraint if exists ecomerse_products_handling_chk;
alter table wallet.ecomerse_products add constraint ecomerse_products_handling_chk
  check (handling_hours in (24, 48, 72));

comment on column wallet.ecomerse_products.handling_hours is
  'Horas de preparación antes de entregar el pedido (24/48/72). Lo declara el vendedor al publicar.';
comment on column wallet.ecomerse_products.returns_accepted is
  '¿El vendedor acepta devoluciones? Distinto de la garantía de 7 días de la plataforma: esto es lo que ofrece él.';

-- -----------------------------------------------------------------------------
-- 2) DOCUMENTACIÓN DEL PRODUCTO (tabla nueva)
-- -----------------------------------------------------------------------------
-- Se llama ecomerse_product_docs (no `documents`) para que se sepa de qué es.
-- `doc_type` lleva CHECK y no enum: los tipos van a crecer (hoy tres, mañana quizá
-- informe de calidad) y añadir un valor a un CHECK es un ALTER, mientras que un enum
-- obliga a migrarlo y a regenerar el cliente Prisma.
create table if not exists wallet.ecomerse_product_docs (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references wallet.ecomerse_products(id) on delete cascade,
  doc_type        varchar(40) not null,
  url             varchar(500) not null,
  doc_number      varchar(120),
  -- Importe y fecha que el vendedor dice que tiene la factura. Sin esto, una factura
  -- subida no dice nada: lo que la hace útil es poder comprobarla contra el anuncio.
  amount_xaf      bigint,
  issued_on       date,
  status          varchar(20) not null default 'pending',
  -- `reviewed_by` va SIN clave ajena, y no por descuido: el rol de la aplicación (`malabogo`)
  -- NO tiene permiso de lectura sobre `mobility.users` (comprobado: has_table_privilege = f), y
  -- Postgres exige privilegio de referencia sobre la tabla padre para crear la FK. Es el mismo
  -- caso que `mobility.stops.reviewed_by`, que ya es un uuid suelto. La integridad se sostiene
  -- en el código, que solo escribe aquí el id del admin autenticado.
  reviewed_by     uuid,
  reviewed_at     timestamptz,
  rejection_reason varchar(300),
  created_at      timestamptz not null default now(),
  constraint ecomerse_product_docs_type_chk
    check (doc_type in ('factura_compra','certificado_autenticidad','autorizacion_marca')),
  constraint ecomerse_product_docs_status_chk
    check (status in ('pending','approved','rejected'))
);

-- Un documento del mismo tipo dos veces sobre el mismo anuncio no aporta nada y ensucia
-- la revisión del admin.
create unique index if not exists ecomerse_product_docs_unq
  on wallet.ecomerse_product_docs (product_id, doc_type);

-- La cola de moderación busca por estado; el vendedor, por producto.
create index if not exists ecomerse_product_docs_status_idx
  on wallet.ecomerse_product_docs (status, created_at desc);

comment on table wallet.ecomerse_product_docs is
  'Documentación que el vendedor aporta para un anuncio (factura, certificado, autorización). Se revisa a mano, igual que driver_documents.';

-- -----------------------------------------------------------------------------
-- 3) PERMISOS
-- -----------------------------------------------------------------------------
-- El rol de la aplicación es `malabogo` (el mismo que usa el resto del Mercado). Se le dan
-- los mismos permisos que a las demás tablas de ecomerse; sin esto, el servicio no puede
-- ni leerla y el error aparecería en la primera publicación con documento.
grant select, insert, update, delete on wallet.ecomerse_product_docs to malabogo;
grant usage, select on all sequences in schema wallet to malabogo;

-- -----------------------------------------------------------------------------
-- 4) COMPROBACIÓN
-- -----------------------------------------------------------------------------
do $$
declare
  n_cols int;
  n_tabla int;
begin
  select count(*) into n_cols from information_schema.columns
   where table_schema='wallet' and table_name='ecomerse_products'
     and column_name in ('handling_hours','returns_accepted');
  select count(*) into n_tabla from information_schema.tables
   where table_schema='wallet' and table_name='ecomerse_product_docs';
  raise notice '[019] columnas nuevas: % de 2 · tabla de documentos: % de 1', n_cols, n_tabla;
  if n_cols <> 2 or n_tabla <> 1 then
    raise exception '[019] la migración no ha dejado el esquema como debía';
  end if;
end $$;
