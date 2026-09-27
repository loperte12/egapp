# `esquema/` — volcados del esquema REAL de producción

**Esto NO es una migración.** Las migraciones son los `NNN_*.sql` de `../` y se aplican al servidor.
Aquí van **fotos** del esquema tal y como está en producción, que sirven para dos cosas: saber qué hay
de verdad (el esquema de estas tablas no estaba versionado en ninguna parte) y poder comparar contra él
sin abrir una ventana SSH.

## `lifebook-hotel-20260927.sql`

Volcado de las 5 tablas del hotel y su reserva, en producción el **27-sep-2026**:

| Dato | Valor |
|---|---|
| sha256 | `31a5ce295221c225ef9b230a2c2b03a3e72c43ed47582bcfda1d4380af1b431a` |
| bytes | 17799 |
| origen | `mirror-postgres` (PostgreSQL 16.15), base `egrouteplan` |
| comando | `pg_dump -U postgres -d egrouteplan --schema-only --no-owner --no-privileges -t lifebook.hotel_profiles -t lifebook.room_types -t lifebook.room_type_calendar -t lifebook.reservation_nights -t lifebook.reservations` |

Tablas: `hotel_profiles`, `room_types`, `room_type_calendar`, `reservation_nights`, `reservations`.

**El fichero va byte a byte tal y como salió del servidor, sin retocar.** La huella ES su identidad y
es lo que permite demostrar que lo versionado es lo que corre: por eso no lleva cabecera añadida (esta
nota vive aparte) y por eso `backend/sql/**` lleva `-text` en `.gitattributes` — sin ese atributo, con
`core.autocrlf=true`, un clon limpio devolvería el fichero en CRLF y la huella ya no cuadraría.

### Límites, dichos y no disimulados

- **No es autosuficiente.** Las claves ajenas apuntan a `lifebook.shops`, `lifebook.products` y
  `mobility.users`, que NO van en este volcado. Para recrear solo estas 5 tablas hacen falta antes esos
  objetos.
- Lleva `\restrict` / `\unrestrict` (novedad de `pg_dump` 16.15): reinyectarlo exige un `psql` moderno.
- Es una **foto**, no una verdad eterna: si el esquema cambia, se saca otra con otra fecha y se deja la
  anterior. No se edita a mano nunca.

### Por qué importa (27-sep-2026)

Traer los `CHECK` reales cerró la duda que `A-4` había dejado abierta:

- `lb_res_estado` acepta **exactamente siete** estados — `hold`, `pending`, `confirmed`, `checked_in`,
  `checked_out`, `cancelled`, `no_show`. **No existe `expired` ni `release_pending`**: re-semantizar
  `hold_expires_at` en vez de inventar estados no fue una preferencia de diseño, era la única opción
  legal del esquema.
- `ix_lb_res_hold` es un índice parcial sobre `(status, hold_expires_at) WHERE status = 'hold'`: el
  esquema está **diseñado** para vencer retenciones por esa columna, y su comentario lo dice — «al
  vencer, el calendario la libera aunque el barrido no haya pasado».
- `uq_lb_res_idem` es `UNIQUE (guest_id, idempotency_key)`: el nonce de `LH-09` no era cosmético —
  **sin él, un reintento del mismo pago viola el índice único**.
- `room_types` es la tabla de los **tres relojes**: `hold_minutes` (5–120, defecto 20) lo paga el
  huésped, `confirmation_hours` (1–168, defecto 24) lo confirma el hotel —su comentario precisa «una
  reserva **sin señal**»— y `cancellation_hours` (0–720, defecto 48) es el corte de cancelación gratis.
