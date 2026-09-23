# Hotel · llegada, taxi desde el aeropuerto y precios en la moneda del huésped

> Para el otro agente. Fecha: 2026-09-12. Aplicado y verificado (servidor 25/25, aparato 9/9).
> **Ojo: cambian los MD5 de tres ficheros de `lifebook`**, que están bajo guardia.

---

## 1. Lo que pidió el dueño, y cómo quedó

1. **En el hotel, lo mismo que en comida rápida**: que el huésped llegue y que las dos partes puedan
   encontrarse cuando la dirección no basta (un hotel grande, viviendas sociales, un portal sin número).
2. **Botón de taxi al llegar al aeropuerto**, «sin complicaciones».
3. **Enseñar el precio de cada habitación en la moneda del país desde el que se reserva**, aunque el pago
   sea en efectivo (en francos).

---

## 2. Base de datos

| Cambio | Para qué |
|---|---|
| `hotel_profiles.arrival_note` (text) | Cómo se entra y dónde está la recepción. Lo escribe el hotelero una vez; lo lee el huésped al llegar. |
| `lifebook.fx_rates` (16 monedas) | Tipos de cambio de **referencia**: `xaf_per_unit`, decimales, `updated_at` y `note`. El euro va con la **paridad fija del franco CFA** (655,957 XAF); el resto son referencias con fecha. |
| `lifebook.fx_countries` (27 países) | Qué moneda toca por país (`ES`→EUR, `CN`→CNY, `GQ`→XAF…). |

⚠️ **Grant necesario**: la app (`malabogo`) no podía leer `public.zones` → **el detalle del hotel devolvía
500** (`permission denied for table zones`, 42501) porque el aeropuerto sale de ahí. Se concedió `SELECT`
a `malabogo` y `mobility_app`. **Ojo con esto al replicar**: la tabla ya existía, así que no salta al
crear nada.

---

## 3. Servidor

- `hotelByShop(shopId, country?)` devuelve ahora, además de `hotel` y `rooms`:
  - `fx`: el tipo de cambio del país (o `null`). Incluye `esMonedaDelCobro` (true cuando el país usa XAF).
  - `rooms[].pricePerNightLocal`: el precio de CADA habitación en la moneda del huésped.
  - `arrival`: `{ note, lat, lng, addressReference, city }` — las coordenadas **ya estaban** en
    `shops.lat/lng`.
  - `airport`: el aeropuerto de esa ciudad, sacado de `public.zones`, con los precios de taxi de
    referencia de la zona (`priceFromXaf`, `priceToXaf`).
- **Ruta nueva (pública)**: `GET …/hotels/fx?country=ES` → `{ monedaDelCobro, pais, monedas[], paises[], aviso }`.
  ⚠️ Va declarada **antes** de `hotels/:id` a propósito: NestJS resuelve por orden y si no, «fx» entraría
  por el `:id` y daría un 400 por UUID inválido.
- `arrivalNote` se guarda por `PUT my/hotel` (DTO + INSERT + ON CONFLICT) y se devuelve en `profileShape`.

### Decisiones que conviene no deshacer

- **La conversión la hace el servidor**, una sola vez y redondeada con los decimales de la tabla. La app
  no convierte nada: dos reglas de conversión acaban diciendo cifras distintas.
- **No se inventa un tipo de cambio**: sin país, sin moneda o sin tasa → `fx = null` y las habitaciones
  salen **sin** `pricePerNightLocal` (ni un 0 ni una cifra aproximada «a ojo»).
- **Cuando el país usa XAF** (`GQ`, `CM`, `GA`, `CG`, `TD`) se dice con `esMonedaDelCobro` y la app **no**
  repite la misma cifra con un «≈».
- La app tiene que seguir diciendo que **el pago es en XAF (francos), en efectivo al llegar**, y que la
  equivalencia es orientativa con su fecha. Fingir un cambio exacto sería engañar al huésped.

---

## 4. App

| Fichero | Qué se hizo |
|---|---|
| `utils/maps.ts` (nuevo) | `abrirMapa(lat, lng, direccion)`: `geo:` en Android / `maps:` en iOS, con caída al navegador. Compartido con comida rápida. |
| `utils/region.ts` (nuevo) | País del dispositivo por `Intl` (con `try`, porque Hermes no lo garantiza), país elegido a mano (persistido) y formateo de moneda. **Nunca adivina un país**: si no se sabe, no se convierte. |
| `api/hotel.ts` | Tipos `HotelFx`, `HotelArrival`, `HotelAirport`, `pricePerNightLocal`, `arrivalNote`; `hotel(shopId, country)`; `fx(country)`. |
| `lifebook-hotel-detalle.tsx` | Botón **«Cómo llegar»**; bloque **«🔑 Al llegar»** con la nota; bloque **«🛫 ¿Llegas al aeropuerto?»** con el precio de referencia y **«Pedir taxi al hotel»**; precio local por habitación («18 000 XAF ≈ ¥214.29») y el aviso del cobro en XAF; **selector de país** con la lista que da el servidor. |
| `lifebook-hotel-perfil.tsx` | Campo **«Al llegar»** para que el hotelero escriba la nota (si no, la función no se puede usar). |
| `taxi.tsx` | Acepta `oLat/oLng/oLabel` para **prefijar el ORIGEN** (antes solo el destino), y **el GPS ya no pisa un origen puesto a propósito** — sin eso, el botón del aeropuerto abría el taxi con «Mi ubicación» y no servía para nada (medido en el móvil). |
| `compilar-apk.ps1` | Dos arreglos: `NODE_ENV=production` (Expo lo exige y el script no lo ponía → el build fallaba) y `adb` con `$ErrorActionPreference='Continue'` (sus avisos van por stderr y con `Stop` abortaban el script *después* de compilar, sin instalar nada). |

---

## 5. Verificación

**Servidor 25/25** (`lb46-prueba-divisas-y-llegada.cjs`) con las suites en verde (puertas del hotel,
e2e-pedidos 49/49, contrato 21/21):

- 16 monedas y 27 países; `ES`→EUR @ 655,957 · `CN`→CNY · `GQ`→XAF con `esMonedaDelCobro` · **país
  desconocido → `null`** (no se inventa).
- Sin país: ninguna habitación lleva precio local y `fx` va en `null`.
- Con país: `18 000 XAF ≈ 27,44 EUR` (la aritmética, verificada contra la tabla) y **el precio XAF no se
  toca** (es el que se cobra).
- Llegada: coordenadas del hotel (3.7523, 8.7742) idénticas a `shops.lat/lng`; aeropuerto con sus precios
  de zona (1 500–3 000 XAF) y su ciudad.
- La nota de llegada: el hotel la guarda por la API y **el huésped la ve** en la ficha pública; la prueba
  deja la nota como estaba.

**Aparato 9/9** (`lb46-ver-hotel.ps1`, texto real por `uiautomator`):

```
Hotel Demo Malabo · Hotel · 3★ · Paraíso · Malabo
📍 Frente al mar, a 5 min del centro      desc=«Cómo llegar a Hotel Demo Malabo»
🔑 Al llegar   «Entrada por la puerta lateral, junto al parking. Recepción en el 2.º piso…»
🛫 ¿Llegas al aeropuerto?   «Pide un taxi Aeropuerto → Hotel Demo Malabo · desde 1 500 XAF hasta 3 000 XAF»
desc=«Pedir un taxi desde el aeropuerto hasta el hotel»
Habitaciones (8)   «18 000 XAF»   «≈ ¥214.29»
«Equivalencia orientativa al cambio del 12 sep. El pago es en XAF (francos), en efectivo al llegar.»
desc=«Elegir el país para ver los precios en su moneda» → lista: Alemania · EUR, Camerún · XOF,
     Chad · XAF, China · CNY, España · EUR, Estados Unidos · USD, Emiratos Árabes Unidos · AED…
```

(El móvil de pruebas tiene la región en China, así que sale en yuanes: es exactamente el
comportamiento pedido — el huésped ve SU moneda y se le dice que paga en francos.)

**La nota de llegada que puse para la prueba se ha borrado**: la ficha queda como estaba.

---

## 6. Las dos incoherencias de los métodos de pago: ARREGLADAS (2026-09-12)

Las encontré al aplicar lo anterior y **están resueltas** (`lb47-parche-pagos.cjs`, prueba 13/13):

- **El `PUT` no entendía lo que el `GET` escribe.** `myHotel` devuelve `paymentMethods` como objetos
  (`{method, status, note}`) y `saveHotelProfile` hacía `String(m).toLowerCase()`: devolver lo leído
  producía «El hotel no puede aceptar «[object object]»». Ahora el `PUT` **acepta las dos formas** (nombre
  u objeto con `method`), y un objeto sin `method` da un mensaje que se entiende.
- **Un método de la TIENDA bloqueaba la ficha del HOTEL.** `shop_payment_methods` es de la tienda (la
  comparte el marketplace) y un hotel no ofrece «contra entrega»; como la validación rechazaba todo lo que
  no estuviera en `HOTEL_METHODS`, la ficha entera (estrellas, horario, nota de llegada) no se podía
  guardar. Ahora la regla distingue tres casos:
  - no es un método de la plataforma («transf») → **400** (no se traga un tecleo);
  - es de la plataforma pero no de hotel (`cash_on_delivery`) → se **ignora**, se devuelve en
    **`ignoredPaymentMethods`** y **no se toca** en la tienda;
  - es un método del hotel → se escribe, como siempre.

**Las dos lecturas siguen siendo distintas A PROPÓSITO** (y ahora está escrito en el código): el hotelero
necesita saber qué está activo (`estado`), y al huésped solo le importa qué se acepta. El `PUT` acepta las
dos, que era lo que rompía.

**Lo que NO se ha hecho**: quitar una forma de pago del hotel sigue sin funcionar desde el panel (el
servidor solo activa; lo único que desactiva es `likebook_wallet`). Hacerlo bien pide decidir si el hotel
puede desactivar métodos **de la tienda**, que es la misma tabla que usa el marketplace. Es una decisión de
producto, no un descuido.

## 7. Hallazgos que NO he tocado

- **`arrival.lat/lng` no se pueden editar desde la app**: el pin del hotel es el de la tienda
  (`shops.lat/lng`). Si el hotelero necesita corregirlo, hoy no tiene pantalla para eso.
- La lista de métodos de la plataforma está **repetida en tres ficheros** (`commerce.service.ts`,
  `orders.service.ts` y ahora `hotel.service.ts`) además del `CHECK` de la base. Sacarla a un módulo
  compartido toca tres módulos ajenos: pendiente y anotado en el código.

## 8. Pendiente

- El taxi se abre **prefijado** (origen aeropuerto, destino hotel) y el huésped elige la modalidad y
  confirma. **No he medido el viaje completo** (crear el viaje, precio final, conductor): eso es del
  módulo de movilidad.
- La conversión **no se aplica a la reserva** (el importe que se congela y se cobra es en XAF, que es lo
  correcto); solo al escaparate de precios. Si el dueño quiere ver la equivalencia también en el paso de
  confirmación, es el mismo `fx` en la reserva.
- Los tipos de cambio son de referencia y **no hay ningún proceso que los actualice**: si se quieren
  frescos, hace falta un trabajo periódico (o conectarlo a un proveedor).

## 9. Hashes (⚠️ guardias)

| Fichero | md5 ahora |
|---|---|
| `src/lifebook/hotel.service.ts` | `a9334d74c699038a01a36d1d4dde2c82` |
| `src/lifebook/hotel.controller.ts` | `90c84c838ef9d931976aeca00723857c` |
| `src/lifebook/dto/hotel-reservation.dto.ts` | `f24ba4b4ff608dc92c061441f50d1371` |
| `src/food/food.service.ts` (sin cambios hoy después de la ubicación) | `cadee18c90e4b457e796cd2674de8f3e` |

Cadena de hoy en `hotel.service.ts`: `1217ec8f…` → `e589f979…` (divisas y llegada) → `5edec0ef…`
(lista de países) → **`a9334d74…`** (métodos de pago).

Copias previas: `/opt/mirror/backups/hotel-service.antes-divisas-2026-09-12T06-17-05`,
`…antes-paises-2026-09-12T06-25-21` y `…antes-pagos-2026-09-12T13-01-27`.

## 10. Herramientas nuevas

```
lb46-hotel-llegada-y-divisas.sql.sh   migración: arrival_note + fx_rates + fx_countries (+ semilla)
lb46-parche-hotel.cjs                 parche de los 3 ficheros de lifebook, con guardias por fragmento
lb46-aplicar-hotel.sh                 migración → parche → build → reinicio → suites → prueba
lb46-prueba-divisas-y-llegada.cjs     la prueba de servidor (25/25)
lb46b-parche-paises.cjs               `paises` en el endpoint de tipos (para el selector de la app)
lb46-grant-zonas.sh                   el GRANT de public.zones (sin él, el detalle del hotel da 500)
lb46-preparar-hotel.cjs / restaurar   dejar/cuarar la nota de llegada para mirar la pantalla en el móvil
lb46-ver-hotel.ps1                    lee la ficha real del hotel con uiautomator (9/9)
lb47-parche-pagos.cjs                 arreglo de las dos incoherencias de los métodos de pago
lb47-aplicar-pagos.sh                 parche → build → reinicio → suites → prueba
lb47-prueba-pagos.cjs                 la prueba de los métodos de pago (13/13)
```
