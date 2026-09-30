# Auditoría del 快搭 v12 — «快搭产物-EGROUTEPLAN-v12»

> 30-sep-2026 · Kai. Fuente: `pruebas/kuaida-v12/` (9 HTML + `tailwind.js`, 691 KB).
> Los ficheros usan Tailwind + JS vanilla con datos embebidos; cada pantalla es autónoma.

## Mapa fichero ↔ app

| HTML | Título | Corresponde a | ¿Estaba en el plan de 15? |
|---|---|---|---|
| `home.html` | Alojamiento · Inicio | `app/lifebook-hotel.tsx` | Sí (ya diseñado en lienzo `3:166`) |
| `results.html` | Alojamiento · Resultados | `app/lifebook-hotel-resultados`* | Sí (lienzo `6:733`) |
| `detail.html` | Detalle · Hotel Bahía de Malabo | `app/lifebook-hotel-detalle`* | Sí |
| `booking.html` | Confirmar reserva | `app/lifebook-hotel-reservar`* | Sí (incluye calendario de fechas) |
| `chat.html` | Chat · Alojamiento | — pantalla NUEVA | No |
| `messages.html` | Mensajes · Alojamiento | — pantalla NUEVA | No |
| `profile.html` | Mi cuenta | — pantalla NUEVA | No |
| `saved.html` | Favoritos · Aloja | — pantalla NUEVA | No |
| `index.html` | Kit de componentes | Especificación (no pantalla) | — |

\* ficheros por crear o reestructurar. **Faltan del flujo huésped:** `fechas` como pantalla
propia (parece embebida en booking), `reserva` (detalle de reserva) y `reservas` (Mis
reservas — el prompt que preparamos no llegó a este set).

## Lo que está BIEN (compatible directo)

- **Paleta clavada en los 9 ficheros:** artboard `#0F0F12`, fondo `#1E1E23`, superficies
  `#17171A`, texto `#F2F3F5`. CTA `#0066CC` y precio `#F08A4B` presentes.
- **Ids y clases semánticos** que mapean a nuestros componentes: `filter-panel`,
  `panel-precio`/`panel-estrellas`/`panel-distancia` (el filtro de precio primero de C-2),
  `empty-state`, `result-list`, `result-count`.
- **Datos de prueba realistas:** Hotel Bahía de Malabo (9 menciones), Hotel Ureca Beach,
  Hotel Aeropuerto Santa Isabel, Hotel Palace Central, Hotel Boutique Casa del Lago.
- **Precios con espacio** vía `fmtXAF` («142 500»), no con punto.
- `results.html` trae los 5 estados y el panel de precio abierto — coherente con el
  diseño de `6:733`.

## Desajustes a corregir AL integrar (no bloquean)

1. **Peligro:** usan `#FF6B6B` (y un `#F58585` suelto en index); nuestro token es
   `#C62828` con texto `#F58585`. → Unificar al traducir.
2. **Moneda:** booking muestra prefijo «XAF 142 500»; la app pinta sufijo «142 500 XAF».
   `fmtXAF` incluye un conversor EUR/USD con `localStorage` que **la app no tiene** → se cae.
3. **Mapa en results** (`map-area`, `map-drawer`): la app no tiene mapa; además aplica la
   normativa de cumplimiento cartográfico. → Decidir.
4. **Estados de reserva:** solo «Confirmada»/«Cancelada»; faltan los matices del contrato
   («Sin pagar (retenida)», «Huésped dentro», «Señal pagada · por confirmar», códigos
   `LBH-AAMMDD-NNNN`).
5. **Imágenes:** apuntan a un CDN generado por 快搭 (`CDN + 'generated-…'`) → en la app se
   sustituyen por las URLs reales del backend.

## Plan de integración propuesto

1. **Flujo core primero** (4 pantallas con fichero en la app): `hotel` → `resultados` →
   `detalle` → `reservar`. Un commit por pantalla, mensajes sin acentos con `-F`.
2. Traducción Tailwind+JS → StyleSheet+React state, reutilizando `@egrouteplan/ui-kit`
   (`TopBar`, `EmptyState`, `PriceTag`, `FilterChip`…) y los tokens existentes.
3. Correcciones de la lista de desajustes aplicadas en la traducción (tokens ganan).
4. `reserva` + `reservas` + `fechas` se diseñan después (completan el flujo).
5. La verificación en APK queda aplazada: primero todo el diseño, luego `assembleRelease`.
