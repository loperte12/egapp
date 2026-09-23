# Rescate de la base de datos antigua (egrouteplan.public → mobility)

Auditoría de la BD de malabo-mobility y decisión de salvamento. Resultado:
nuevo schema **`mobility`** dentro de la misma base `egrouteplan`
(`public` intacto para la app vieja, `wallet` intacto para el monedero).

## ✅ Rescatado (con reestructuración)

| De (public) | A (mobility) | Qué se conserva / qué se corrige |
|---|---|---|
| `zones` (3 filas reales) | `zones` | Se conservan las 3 zonas con sus UUIDs (Barrio Semu, Centro Malabo, Aeropuerto). Se **eliminan los precios** de la tabla de zonas y se añade `radius_km` + CHECKs de coordenadas |
| `cargo_fares` | `service_fares` | Estructura buena (base, por-km, mínimo, banda de negociación, `effective_from`). Se generaliza por `service_type × zone_type × vehicle_type`. La fila real de van (3.000 XAF, banda 0,90–1,10) migra tal cual |
| `cargo_orders` | `service_orders` | La mejor estructura del esquema viejo: enums completos, `timestamptz`, fotos, flags de carga. Se generaliza a todos los servicios (taxi, coche, paquete, mudanza, alquiler) |
| `drivers` + `driver_documents` | `drivers` + `driver_documents` | Modelo rico de verificación y documentos. Se añaden CHECKs de rating (0–5) y estado |
| `ratings` | `ratings` | Se enlaza a `order_id` UNIQUE (1 rating por orden) y se conserva el CHECK 1–5 |
| Enums (`cargo_status`, `vehicle_type`, `payment_*`) | Enums de `mobility` | Flujo de estados con `NEGOTIATING` y `DISPUTED`, tal cual la lógica de negocio existente |

## ❌ Descartado (y por qué)

| Elemento | Motivo del descarte |
|---|---|
| `trips` | Versión pobre de `cargo_orders`: sin enums, sin `timestamptz`, sin pago. Absorbida por `service_orders` |
| `otp_codes` | **Guardaba el código OTP en texto claro** (fallo grave de seguridad). Reemplazada por `otp_verifications` con `code_hash` |
| Precios en `zones.price_*` | Duplicaban la tarificación de `cargo_fares` → deriva garantizada. Fuente única: `service_fares` |
| Timestamps mixtos | `users`/`drivers`/`trips`/`zones`/`ratings` usaban `timestamp without time zone`; `cargo_*` usaba `timestamptz`. Unificado a `timestamptz` |
| `users.role/status` varchar | Sin CHECK ni enum; además `rating NUMERIC(2,1)` permitía 9,9. Ahora enums + CHECKs |
| `uuid_generate_v4()` en otp_codes | Dependencia uuid-ossp innecesaria; unificado a `gen_random_uuid()` (core) |
| `viajes_completados`, `puntos_confianza` | Contadores denormalizados sin fuente; se conservan como cache documentado |

## Archivos

- `sql/001_mobility_core.sql` — schema mobility completo (7 tablas, 9 enums, índices, triggers).
- `sql/002_mobility_seed.sql` — zonas reales + tarifas iniciales (idempotente).

## Estado de aplicación

Aplicado en producción (contenedor `malabo-postgres`, base `egrouteplan`):
3 zonas y 7 tarifas verificadas. Acceso de solo aplicación: rol `mobility_app`
(credenciales en `/opt/malabogo/mobility-db.env` del servidor).
