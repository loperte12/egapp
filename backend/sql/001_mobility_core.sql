-- =============================================================================
-- EG Route Plan · Backend de movilidad — SCHEMA mobility (núcleo)
-- Rescate reestructurado de egrouteplan.public (ver SALVAGE.md):
--   · timestamptz en TODAS las tablas (antes mezclados)
--   · precios SOLO en service_fares (antes duplicados en zones y cargo_fares)
--   · enums/CHECKs reales en roles, estados y puntuaciones
--   · OTP hasheado (la versión antigua guardaba el código en claro)
--   · trips descartado en favor de service_orders (cargo_orders generalizado)
-- Se aplica dentro de la base egrouteplan (public y wallet intactos).
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS mobility;

-- --------------------------------- ENUMS ------------------------------------

CREATE TYPE mobility.user_role      AS ENUM ('PASSENGER', 'DRIVER', 'ADMIN');
CREATE TYPE mobility.user_status    AS ENUM ('PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED');
CREATE TYPE mobility.zone_type      AS ENUM ('inside', 'outside'); -- compat. con datos antiguos
CREATE TYPE mobility.vehicle_type   AS ENUM ('motorcycle', 'car', 'van', 'truck');
CREATE TYPE mobility.service_type   AS ENUM ('TAXI', 'RESERVA_COCHE', 'PAQUETE', 'MUDANZA', 'ALQUILER');
CREATE TYPE mobility.order_status   AS ENUM ('REQUESTED', 'NEGOTIATING', 'ACCEPTED', 'EN_ROUTE_PICKUP', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'DISPUTED');
CREATE TYPE mobility.payment_method AS ENUM ('cash', 'wallet', 'mobile_money', 'card', 'transfer');
CREATE TYPE mobility.payment_status AS ENUM ('pending', 'authorized', 'paid', 'failed', 'refunded');
CREATE TYPE mobility.doc_status     AS ENUM ('pending', 'approved', 'rejected');

-- --------------------------------- USERS ------------------------------------

CREATE TABLE mobility.users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone           VARCHAR(20) NOT NULL UNIQUE,
    email           VARCHAR(100) UNIQUE,
    password_hash   VARCHAR(255),
    full_name       VARCHAR(120) NOT NULL,
    role            mobility.user_role   NOT NULL DEFAULT 'PASSENGER',
    status          mobility.user_status NOT NULL DEFAULT 'PENDING_VERIFICATION',
    rating_avg      NUMERIC(3,2) NOT NULL DEFAULT 5.0 CHECK (rating_avg BETWEEN 0 AND 5),
    completed_trips INT NOT NULL DEFAULT 0 CHECK (completed_trips >= 0),
    trust_points    INT NOT NULL DEFAULT 0,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- -------------------------------- DRIVERS -----------------------------------

CREATE TABLE mobility.drivers (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES mobility.users(id) ON DELETE RESTRICT,
    license_number  VARCHAR(50),
    license_expiry  DATE,
    vehicle_type    mobility.vehicle_type,
    vehicle_plate   VARCHAR(20),
    vehicle_model   VARCHAR(50),
    is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    rating_avg      NUMERIC(3,2) NOT NULL DEFAULT 0 CHECK (rating_avg BETWEEN 0 AND 5),
    rating_count    INT NOT NULL DEFAULT 0 CHECK (rating_count >= 0),
    status          VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'offline')),
    photo_url       VARCHAR(500),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX drivers_status_idx ON mobility.drivers (status, is_verified);

CREATE TABLE mobility.driver_documents (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id   UUID NOT NULL REFERENCES mobility.drivers(id) ON DELETE CASCADE,
    doc_type    VARCHAR(30) NOT NULL,                    -- license | id_card | vehicle_card | insurance
    doc_number  VARCHAR(50),
    front_url   VARCHAR(500),
    back_url    VARCHAR(500),
    status      mobility.doc_status NOT NULL DEFAULT 'pending',
    reviewed_by UUID REFERENCES mobility.users(id) ON DELETE SET NULL,
    reviewed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX driver_documents_driver_idx ON mobility.driver_documents (driver_id, status);

-- --------------------------------- ZONES ------------------------------------
-- SIN precios: la tarificación vive únicamente en service_fares.

CREATE TABLE mobility.zones (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    zone_type   mobility.zone_type NOT NULL,
    center_lat  NUMERIC(10,7) NOT NULL CHECK (center_lat BETWEEN -90 AND 90),
    center_lng  NUMERIC(10,7) NOT NULL CHECK (center_lng BETWEEN -180 AND 180),
    radius_km   NUMERIC(6,2) NOT NULL DEFAULT 1.5 CHECK (radius_km > 0),
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX zones_type_active_idx ON mobility.zones (zone_type, is_active);

-- ----------------------------- SERVICE_FARES ---------------------------------
-- Unifica zones.price_* y cargo_fares en una sola fuente de tarifas por
-- servicio × zona × vehículo, con banda de negociación validada.

CREATE TABLE mobility.service_fares (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_type        mobility.service_type NOT NULL,
    zone_type           mobility.zone_type NOT NULL,
    vehicle_type        mobility.vehicle_type,             -- NULL = aplica a cualquier vehículo
    base_fare           NUMERIC(10,2) NOT NULL CHECK (base_fare >= 0),
    per_km_rate         NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (per_km_rate >= 0),
    minimum_fare        NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (minimum_fare >= 0),
    negotiation_min_pct NUMERIC(5,2) NOT NULL DEFAULT 0.90 CHECK (negotiation_min_pct > 0 AND negotiation_min_pct <= 1),
    negotiation_max_pct NUMERIC(5,2) NOT NULL DEFAULT 1.10 CHECK (negotiation_max_pct >= 1),
    currency            CHAR(3) NOT NULL DEFAULT 'XAF',
    is_active           BOOLEAN NOT NULL DEFAULT TRUE,
    effective_from      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fares_negotiation_chk CHECK (negotiation_min_pct <= negotiation_max_pct)
);
CREATE INDEX service_fares_lookup_idx
    ON mobility.service_fares (service_type, zone_type, vehicle_type, is_active);

-- ---------------------------- SERVICE_ORDERS ---------------------------------
-- Generaliza cargo_orders (estructura sólida) y absorbe trips (descartado).

CREATE TABLE mobility.service_orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    service_type        mobility.service_type NOT NULL,
    passenger_id        UUID NOT NULL REFERENCES mobility.users(id) ON DELETE RESTRICT,
    driver_id           UUID REFERENCES mobility.drivers(id) ON DELETE SET NULL,
    vehicle_type        mobility.vehicle_type,

    pickup_lat          NUMERIC(10,7) NOT NULL,
    pickup_lng          NUMERIC(10,7) NOT NULL,
    pickup_address      TEXT,
    dropoff_lat         NUMERIC(10,7),
    dropoff_lng         NUMERIC(10,7),
    dropoff_address     TEXT,
    zone_type           mobility.zone_type,

    -- Carga opcional (paquetería / mudanza)
    cargo_description   TEXT,
    weight_kg           NUMERIC(8,2)  CHECK (weight_kg IS NULL OR weight_kg > 0),
    volume_m3           NUMERIC(8,3)  CHECK (volume_m3 IS NULL OR volume_m3 > 0),
    is_fragile          BOOLEAN NOT NULL DEFAULT FALSE,
    requires_assistance BOOLEAN NOT NULL DEFAULT FALSE,
    photos_urls         TEXT[],

    -- Precio y pago
    requested_price     NUMERIC(10,2) CHECK (requested_price IS NULL OR requested_price > 0),
    agreed_price        NUMERIC(10,2) CHECK (agreed_price IS NULL OR agreed_price > 0),
    currency            CHAR(3) NOT NULL DEFAULT 'XAF',
    payment_method      mobility.payment_method,
    payment_status      mobility.payment_status NOT NULL DEFAULT 'pending',

    -- Estado y trazado temporal completo
    status              mobility.order_status NOT NULL DEFAULT 'REQUESTED',
    scheduled_pickup_at TIMESTAMPTZ,
    accepted_at         TIMESTAMPTZ,
    picked_up_at        TIMESTAMPTZ,
    delivered_at        TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    cancelled_at        TIMESTAMPTZ,
    cancellation_reason TEXT,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX orders_passenger_idx ON mobility.service_orders (passenger_id, status, created_at DESC);
CREATE INDEX orders_driver_idx    ON mobility.service_orders (driver_id, status);
CREATE INDEX orders_status_idx    ON mobility.service_orders (status, service_type);

-- -------------------------------- RATINGS ------------------------------------

CREATE TABLE mobility.ratings (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     UUID NOT NULL UNIQUE REFERENCES mobility.service_orders(id) ON DELETE CASCADE, -- 1 rating por orden
    driver_id    UUID NOT NULL REFERENCES mobility.drivers(id) ON DELETE CASCADE,
    passenger_id UUID NOT NULL REFERENCES mobility.users(id) ON DELETE CASCADE,
    score        INT NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment      TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ratings_driver_idx ON mobility.ratings (driver_id, created_at DESC);

-- ------------------------- OTP VERIFICATIONS ---------------------------------
-- La tabla antigua (public.otp_codes) guardaba el código EN CLARO: descartado.
-- Aquí solo vive el hash (mismo criterio que wallet.otp_challenges).

CREATE TABLE mobility.otp_verifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone       VARCHAR(20) NOT NULL,
    purpose     VARCHAR(30) NOT NULL DEFAULT 'registration',
    code_hash   TEXT NOT NULL,
    attempts    INT NOT NULL DEFAULT 0,
    expires_at  TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX otp_verifications_phone_idx ON mobility.otp_verifications (phone, purpose, created_at DESC);

-- --------------------------- updated_at trigger ------------------------------

CREATE OR REPLACE FUNCTION mobility.touch_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_touch   BEFORE UPDATE ON mobility.users          FOR EACH ROW EXECUTE FUNCTION mobility.touch_updated_at();
CREATE TRIGGER trg_drivers_touch BEFORE UPDATE ON mobility.drivers        FOR EACH ROW EXECUTE FUNCTION mobility.touch_updated_at();
CREATE TRIGGER trg_zones_touch   BEFORE UPDATE ON mobility.zones          FOR EACH ROW EXECUTE FUNCTION mobility.touch_updated_at();
CREATE TRIGGER trg_fares_touch   BEFORE UPDATE ON mobility.service_fares  FOR EACH ROW EXECUTE FUNCTION mobility.touch_updated_at();
CREATE TRIGGER trg_orders_touch  BEFORE UPDATE ON mobility.service_orders FOR EACH ROW EXECUTE FUNCTION mobility.touch_updated_at();

COMMIT;
