-- =============================================================================
-- 86 — P1-c LIQUIDACIÓN DE VIAJES DE TAXI AL LEDGER
-- (docs/P1-c-LIQUIDACION-VIAJES.md §3 decisiones cerradas del dueño 16/09/2026)
--
-- Esquema WALLET: scope de payment-token para viajes + políticas de comisión
-- POR CIUDAD en fee_policies (el dueño cambia porcentajes con UPDATE, sin
-- compilar). Esquema MOBILITY: columnas nuevas EN taxi_requests/drivers para
-- el ciclo de liquidación (todas NULL-ables: los viajes viejos no se tocan).
--
-- NO hay tablas nuevas (diseño §2: Transaction + referenceActivityId +
-- LedgerEntry + PaymentAuthorization, con EscrowOrder solo como PATRÓN).
--
-- Idempotente: aplicar con docker exec -i mirror-postgres psql -U postgres -d
-- egrouteplan -f /dev/stdin < /root/86-liquidacion-viajes.sql
-- OJO: ALTER TYPE ... ADD VALUE no puede ir dentro de BEGIN/COMMIT → sin
-- transacción envoltante; cada sentencia va auto-commit.
-- =============================================================================

-- 1) Scope TRIP para el token de pago de un solo uso (confirmación PIN del
--    pasajero sobre el fare pactado). PaymentScope en Prisma: añadir TRIP.
ALTER TYPE wallet.payment_scope ADD VALUE IF NOT EXISTS 'TRIP';

-- 2) Dos tipos de comisión de viaje (taxi por ciudad). Si mañana hay más
--    ciudades, es INSERT de fila + ALTER TYPE, nada en código.
ALTER TYPE wallet.fee_scope ADD VALUE IF NOT EXISTS 'TAXI_MALABO';
ALTER TYPE wallet.fee_scope ADD VALUE IF NOT EXISTS 'TAXI_BATA';

-- 3) Políticas: Malabo 20 % del fare con tope 1.500 XAF; Bata 50 XAF planos.
--    percent Decimal(5,4): 0.2000 = 20 %. El redondeo hacia abajo lo aplica el
--    servicio al congelar la fee en el lock (fee_info); la política manda.
INSERT INTO wallet.fee_policies (id, scope, percent, flat, min_fee, max_fee, active, agent_share_percent, updated_at)
VALUES
  (gen_random_uuid(), 'TAXI_MALABO'::wallet.fee_scope, 0.2000, 0,   0,    1500, true, 0, now()),
  (gen_random_uuid(), 'TAXI_BATA'::wallet.fee_scope,   0,     50,   0,    NULL, true, 0, now())
ON CONFLICT (scope) DO UPDATE
  SET percent = EXCLUDED.percent,
      flat = EXCLUDED.flat,
      min_fee = EXCLUDED.min_fee,
      max_fee = EXCLUDED.max_fee,
      agent_share_percent = 0,
      active = true,
      updated_at = now();

-- 4) taxi_requests: estado de la liquidación, derivable SIEMPRE desde el
--    ledger (transactions con reference_activity_id = viaje); estas columnas
--    son cache de UI + timers de negocio, nunca fuente de verdad del dinero.
ALTER TABLE mobility.taxi_requests
  ADD COLUMN IF NOT EXISTS city              varchar(20),
  ADD COLUMN IF NOT EXISTS settlement_kind   varchar(10),   -- 'WALLET' | 'CASH' (NULL = no pactado aún)
  ADD COLUMN IF NOT EXISTS payment_locked_at timestamptz,   -- momento del ESCROW_LOCK
  ADD COLUMN IF NOT EXISTS fee_info          jsonb,         -- comisión CONGELADA al bloquear: {fare,fee,city,scope,percent,flat,max_fee,frozen_at}
  ADD COLUMN IF NOT EXISTS arrived_at        timestamptz,   -- conductor marcó llegada a destino
  ADD COLUMN IF NOT EXISTS cancelled_by      varchar(10),   -- 'PASSENGER' | 'DRIVER' | 'SYSTEM'
  ADD COLUMN IF NOT EXISTS disputed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS dispute_reason    varchar(300),
  ADD COLUMN IF NOT EXISTS dispute_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS settlement        jsonb;         -- {fare,fee,net,to_driver,to_platform,at,kind} al cerrar (solo pinta, no manda)

-- 5) Barrido del auto-cierre y de zombies bloqueados: índice parcial barato.
CREATE INDEX IF NOT EXISTS ix_taxi_settlement_open
  ON mobility.taxi_requests (updated_at)
  WHERE settlement_kind = 'WALLET'
    AND status IN ('accepted','in_progress','arrived');

-- 6) strikes de conductor (decisiones §3.1/§2.3): suspensión temporal +
--    contador simple. La cuenta de faltas se calcula sobre taxi_requests
--    (cancelled_by='DRIVER' en 7 días); suspended_until es el cortafuegos.
ALTER TABLE mobility.drivers
  ADD COLUMN IF NOT EXISTS suspended_until timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_count int NOT NULL DEFAULT 0;

-- 7) El estado 'arrived' solo vale si la CHECK de status lo permite; se
--    comprueba en el parche (sondea pg_constraint). Si hay CHECK cerrada, el
--    parche la sustituye añadiendo 'arrived' y 'disputed' — NUNCA a ciegas.

-- 8) Permisos del rol de aplicación (mobility_app) — las tablas ya existían;
--    las columnas nuevas heredan permisos, pero lo verificamos en el registro.
--    (sin GRANT aquí: confirmar con has_column_privilege tras aplicar)
