-- =============================================================================
-- EG Route Plan · mobility — SEED de identidades unificadas.
-- Estrategia aprobada: mobility.users es la IDENTIDAD MAESTRA de la app.
-- Las personas conservan el MISMO UUID que en wallet.users (el UUID es el
-- enlace directo monedero ↔ movilidad; el teléfono es la clave natural).
--   · María y Juan → pasajeros activos
--   · Francisco   → conductor verificado (drivers.id = agents.id del monedero)
-- Idempotente (ON CONFLICT DO NOTHING).
-- =============================================================================

BEGIN;

INSERT INTO mobility.users (id, phone, full_name, role, status, rating_avg) VALUES
    ('11111111-1111-1111-1111-111111111111', '+240222000001', 'María Nsue Obiang',    'PASSENGER', 'ACTIVE', 5.0),
    ('22222222-2222-2222-2222-222222222222', '+240222000002', 'Juan Esono Mbá',       'PASSENGER', 'ACTIVE', 4.8),
    ('33333333-3333-3333-3333-333333333333', '+240555000003', 'Francisco Ondó Nguema', 'DRIVER',    'ACTIVE', 4.9)
ON CONFLICT (id) DO NOTHING;

INSERT INTO mobility.drivers
    (id, user_id, license_number, vehicle_type, vehicle_plate, vehicle_model, is_verified, rating_avg, rating_count, status)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333',
     'LIC-2024-0042', 'car', 'MBO-0042-B', 'Toyota Corolla 2019', TRUE, 4.9, 312, 'active')
ON CONFLICT (id) DO NOTHING;

COMMIT;
