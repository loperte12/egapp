-- =============================================================================
-- EG Route Plan · mobility — SEED con datos REALES rescatados de la BD antigua.
--   · 3 zonas de public.zones (conservando su UUID; -precios, +radius_km)
--   · Tarifa de paquetería van rescatada de public.cargo_fares
--   · Tarifas de taxi urbano derivadas de los price_* de las zonas antiguas
-- Idempotente (ON CONFLICT DO NOTHING).
-- =============================================================================

BEGIN;

-- Zonas reales (Barrio Semu, Centro Malabo, Aeropuerto).
INSERT INTO mobility.zones (id, name, zone_type, center_lat, center_lng, radius_km) VALUES
    ('47e0ad14-254b-439a-81dc-e450923be23e', 'Barrio Semu',   'inside',  3.7400000, 8.7800000, 1.5),
    ('ac7f565f-3dd1-4d7d-a58c-1254d5c35317', 'Centro Malabo', 'inside',  3.7520000, 8.7740000, 1.2),
    ('93cb6e16-4717-4c7c-89f2-f79e2ac619b5', 'Aeropuerto',    'outside', 3.7550000, 8.7080000, 3.0)
ON CONFLICT (id) DO NOTHING;

-- Tarifas por servicio × zona (XAF). La fila PAQUETE/van/inside es el rescate
-- directo de cargo_fares (base 3.000, banda 0,90–1,10).
INSERT INTO mobility.service_fares
    (service_type, zone_type, vehicle_type, base_fare, per_km_rate, minimum_fare, negotiation_min_pct, negotiation_max_pct) VALUES
    ('TAXI',          'inside',  'car',         750,  150,   500, 0.90, 1.20),
    ('TAXI',          'outside', 'car',        1500,  250,  1000, 0.90, 1.20),
    ('RESERVA_COCHE', 'inside',  'car',        2000,  200,  1500, 0.90, 1.15),
    ('PAQUETE',       'inside',  'motorcycle', 1000,  100,   500, 0.90, 1.20),
    ('PAQUETE',       'inside',  'van',        3000,    0,  2500, 0.90, 1.10),
    ('MUDANZA',       'inside',  'van',       15000,  500, 10000, 0.85, 1.15),
    ('MUDANZA',       'inside',  'truck',     25000,  800, 18000, 0.85, 1.15)
ON CONFLICT DO NOTHING;

COMMIT;
