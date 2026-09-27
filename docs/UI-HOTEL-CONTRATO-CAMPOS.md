# CONTRATO DE CAMPOS — MÓDULO HOTEL (lo que pide el otro agente)

> **Para qué es este fichero:** el otro agente avisó de que «la documentación carece del mapeo
> concreto de campos del backend» y de que iba a «ajustar el `IHotelEncargo` a la respuesta real
> (por ejemplo, pasar de camelCase a guion bajo)». Las dos cosas se resuelven aquí, y una de ellas
> es al revés de como la supone.
>
> **Todo lo que sigue está medido**, no supuesto: los tipos se copian de **`api/hotel.ts`**
> (líneas 23-375) y las respuestas se capturaron del **servidor de PRUEBA** el 27-sep-2026
> (`pruebas/_p2-ficha.json`, `_p2-search.json`, `_ct-calendar.json`, `_ct-reviews.json`).
>
> El hotel de las muestras es `Hotel Demo Malabo` (`shopId d8a2ece3-92b4-4959-8412-d26b5d698ade`),
> 8 tipos de habitación. Es **EJEMPLO**: los datos no son reales, el contrato sí.

---

## 0. Las tres respuestas cortas

1. **El borde de la API es camelCase.** No hay **ni un solo nombre de campo** en guion bajo. Lo que
   va en guion bajo son los **VALORES de enumeración** (`agua_caliente`, `cash_on_delivery`,
   `no_show`…). La conversión que propone el otro agente iría **al revés** de la realidad.
2. **`notes` y `estimatedTime` NO existen en el contrato del hotel.** Y no es que no existan en el
   proyecto: **son del módulo del MERCADO** y se han colado aquí (§6.3). Lo que existe para esas dos
   ideas está en **§6**, con su nombre real.
3. **No hay que declarar ninguna interfaz nueva.** Los tipos ya existen en `api/hotel.ts`
   (**§2**, copiados literales). Se **importan**. Una interfaz propia (`IHotelEncargo` o como se
   llame) sólo sirve para duplicar el contrato y que las dos copias se separen.

---

## 1. La regla de nombres (medida)

| Qué | Estilo | Ejemplos medidos |
|---|---|---|
| **Nombres de campo** | **camelCase** | `basePriceXaf`, `weekendPriceXaf`, `cancellationHours`, `ratingPublished`, `verificationLevel`, `pricePerNightLocal`, `freeCancellationUntil` |
| **Valores de enumeración** | **snake_case** | `agua_caliente`, `cash_on_delivery`, `likebook_wallet`, `proof_submitted`, `checked_out`, `no_show` |
| **Fechas** | ISO-8601, cadena | `2026-09-27` (día) · `2026-09-11T16:27:06.622Z` (instante) |
| **Unidades** | sufijo en el nombre | `Xaf` (franco CFA) · `sizeM2` (m²) · `Hours` · `Minutes` · `Percent` |
| **Booleanos** | `is`/`has` delante, o adjetivo | `isActive`, `isVerified`, `isToday`, `available`, `closed`, `weekend` |

**Los diccionarios que traducen los valores ya existen — no se escriben otros:**

| Qué traduce | Dónde |
|---|---|
| Servicios (`wifi`, `agua_caliente`, `nevera`…) | `components/hotel/servicios.ts` → `ETIQUETA_SERVICIO`, `nombreServicio()` |
| Estado de pago (`proof_submitted`…) | `api/hotel.ts` → `PAGO_ETIQUETA` |
| Forma de pago (`cash_on_delivery`…) | `api/hotel.ts` → `METODO_ETIQUETA` |

---

## 2. Los tipos, literales — **se importan, no se redeclaran**

Copia de `api/hotel.ts`. **Esta es la fuente de verdad del mapeo.**

### 2.1 El resumen (lo que trae una tarjeta de la lista)

```ts
export interface HotelSummary {
  id: string;
  name: string;
  city: string | null;
  barrio: string | null;
  region: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  rating: number;
  ratingCount: number;
  ratingPublished?: boolean;      // ausente = no se puede afirmar nada: NO se pinta la cifra
  addressReference: string | null;
  lat: number | null;
  lng: number | null;
  verificationLevel?: string;
  isVerified?: boolean;
}
```

> ⚠️ **Aquí está el desajuste que más va a morder: `id`.** En `/hotels` (la lista) el objeto trae
> **`id`**; en `/hotels/:id` (la ficha) **no trae `id`: trae `shopId`**. Medido, y el valor es el
> mismo en los dos (`d8a2ece3-…`). Ver **§5**.

### 2.2 El perfil (lo que trae la ficha)

```ts
export interface HotelProfile extends HotelSummary {
  shopId: string;
  propertyKind: string | null;          // 'hotel' | … (medido: 'hotel')
  stars: number | null;                 // medido: 3
  checkinFrom: string;                  // '14:00'
  checkinUntil: string;                 // '22:00'
  checkoutUntil: string;                // '12:00'
  receptionOpen24h: boolean;
  amenities: string[];                  // ['wifi','desayuno']
  houseRules: string | null;
  cancellationPolicy: string | null;
  arrivalNote: string | null;           // cómo se entra y dónde está la recepción
  taxesIncluded: boolean;
  description: string | null;
  isActive?: boolean;
  isHotel?: boolean;
  paymentMethods?: (string | { method: string; status: string; note?: string | null })[];
  roomCount?: number;                   // medido: 8
}
```

### 2.3 La habitación (el tipo — el objeto más rico del módulo)

```ts
export interface HotelRoom {
  id: string;
  shopId: string;
  productId: string | null;
  name: string;
  description: string | null;
  capacity: number;
  beds: { kind: string; count: number }[];
  sizeM2: number | null;
  totalUnits: number;
  basePriceXaf: number;
  weekendPriceXaf: number | null;        // null = ese tipo NO tiene precio de fin de semana
  cleaningFeeXaf: number;
  taxesXaf: number;
  minNights: number;
  maxNights: number;
  depositPercent: number;                // 0 = nada de señal
  holdMinutes: number;                   // los minutos que el servidor retiene la reserva
  confirmationHours: number;             // 0 = confirmación inmediata
  cancellationHours: number;             // horas ANTES DE LA LLEGADA
  images: { url: string }[];
  amenities: string[];
  isActive: boolean;
  productStatus?: string;
  pricePerNightLocal?: number | null;    // sólo con ?country=…; el precio REAL es el Xaf
  // ── sólo en la búsqueda CON fechas ──
  freeUnits?: number | null;
  avgPricePerNightXaf?: number | null;
  subtotalXaf?: number;
  cleaningFeeTotalXaf?: number;
  totalXaf?: number;
  depositPercentQuoted?: number;
  depositXaf?: number;
  remainingXaf?: number;
  nights?: number;
  closedForDates?: boolean;
  minNightsForDates?: number;
}
```

### 2.4 La búsqueda

```ts
export interface HotelSearchResult {
  hotels: {
    hotel: HotelSummary;
    fromPricePerNightXaf: number;
    soldOut?: boolean;                   // con fechas: no hay hueco en TODO el rango
    rooms: HotelRoom[];
  }[];
  city: string | null;
  checkIn: string | null;
  checkOut: string | null;
  nights: number;
  guests: number;
  units: number;
  page?: number;                         // ← los cuatro de paginación son OPCIONALES:
  pageSize?: number;                     //   cuando no hay ningún hotel candidato el servidor
  hasMore?: boolean;                     //   hace un return temprano y NO los manda
  nextCursor?: string | null;            //   ausente = no hay más
}
```

### 2.5 El calendario y las reseñas

```ts
export interface CalendarDay {
  date: string; priceXaf: number; basePriceXaf: number; weekend: boolean;
  closed: boolean; note: string | null; minNights: number;
  totalUnits: number; usedUnits: number; freeUnits: number;
  isToday: boolean; available: boolean;
}

export interface RoomCalendar {
  roomTypeId: string; name: string; totalUnits: number;
  from: string; to: string; units: number;
  days: CalendarDay[];
  summary: { free: number; closed: number; full: number };
}

export interface HotelReview {
  id: string; rating: number; body: string | null;
  reply: string | null; repliedAt: string | null; createdAt: string;
  guest: { id: string; name: string | null; avatarUrl: string | null };
}

export interface HotelReviewsPage {
  total: number;        // el número de reseñas, NO el de la página
  average: number;      // del espejo del servidor, no calculado en la app
  publishesRating: boolean;
  limit: number; offset: number;
  items: HotelReview[];
}
```

### 2.6 El fx y el entorno de llegada

```ts
export interface HotelFx {
  country: string | null; countryLabel: string | null;
  currency: string; currencyLabel: string; symbol: string;
  xafPerUnit: number;      // XAF que vale 1 unidad (655,957 para el euro)
  decimals: number; updatedAt: string; note: string | null;
  esMonedaDelCobro: boolean;
}
export interface HotelArrival {
  note: string | null; lat: number | null; lng: number | null;
  addressReference: string | null; city: string | null;
}
export interface HotelAirport {
  label: string; city: string | null; lat: number; lng: number;
  priceFromXaf: number | null; priceToXaf: number | null;
}
```

### 2.7 La reserva (lo que se manda y lo que se recibe)

```ts
export interface CreateReservationInput {
  roomTypeId: string; checkIn: string; checkOut: string;
  units?: number; guests?: number;
  guestName: string; guestPhone: string; guestEmail?: string;
  paymentMethod: string;
  depositPercent?: number;      // 0 = pagar todo al llegar
  note?: string;
}

export interface Reservation {
  id: string; code: string; status: ReservationStatus; viva: boolean;
  role: 'guest' | 'hotel' | 'admin';
  checkIn: string; checkOut: string; nights: number; units: number; guests: number;
  roomName: string; roomTypeId: string | null;
  pricePerNightXaf: number; subtotalXaf: number; cleaningFeeXaf: number; taxesXaf: number;
  totalXaf: number; depositPercent: number; depositXaf: number; remainingXaf: number;
  paymentMethod: string; paymentStatus: PaymentStatus;
  holdExpiresAt: string | null;            // ← la hora exacta de la retención
  freeCancellationUntil: string | null;    // ← la hora exacta de «cancelar gratis hasta…»
  hotel: HotelSummary | null;
  guest: { id: string; name: string; phone: string | null; email: string | null };
  note: string | null; cancelReason: string | null;
  canCancel?: boolean; cancellationHours?: number;
  checkinFrom?: string | null;           // la hora de llegada DE ESTA reserva
  checkoutUntil?: string | null;         // y la de salida
  reviewId?: string | null;                // null + checked_out = se ofrece «valorar»
  nightlyPrices?: { date: string; priceXaf: number }[];
  // … + marcas de tiempo: createdAt updatedAt depositPaidAt paidAt checkedInAt checkedOutAt cancelledAt
}

export type ReservationStatus =
  | 'hold' | 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
export type PaymentStatus = 'pending' | 'proof_submitted' | 'deposit_paid' | 'paid' | 'refunded' | 'failed';
```

---

## 3. Los parámetros exactos de cada ruta

| Llamada | Parámetros reales | Notas |
|---|---|---|
| `search` | `city` `checkIn` `checkOut` `guests` `units` `minPrice` `maxPrice` `page` `limit` (por defecto **20**) | `page` sólo se manda si es **> 1**. **No hay `sort`** |
| `hotel(shopId, country?)` | `shopId` en la ruta · `country` (ISO-2, ej. `ES`) en la query | `country` hace que lleguen `fx` y `pricePerNightLocal` |
| `fx(country?)` | `country` | Público. Devuelve `{monedaDelCobro, pais, monedas[], paises[], aviso}` |
| `calendar(roomTypeId, from, to, units=1)` | `from` `to` `units` | **`from`/`to` inclusive, máximo 92 días** |
| `reviews(shopId, {limit, offset})` | `limit` (def. **20**, tope del servidor **50**) `offset` | **Pública**, sin sesión |
| `createReview(shopId, dto)` | `{reservationId, rating, body?}` · **POST** | Manda la RESERVA, no el hotel |
| `reserve(input, idempotencyKey)` | cuerpo = `CreateReservationInput` · cabecera **`Idempotency-Key` obligatoria** | Clave **estable por intento** (`reserveKey`) |
| `mine(side)` · `reservation(id)` | `side` = `guest` \| `hotel` | Con sesión |

**La ruta base:** `/wallet/api/v1/lifebook/commerce/hotel` sobre `https://hk.egrouteplan.com`.

---

## 4. La respuesta real (medida el 27-sep-2026)

### 4.1 `GET /hotels/:id` — las claves exactas que llegan

```
raíz  →  hotel · rooms · fx · arrival · airport

hotel →  shopId name logoUrl coverUrl city barrio region lat lng addressReference
         description rating ratingCount ratingPublished followersCount verificationLevel
         isVerified isActive propertyKind stars checkinFrom checkinUntil checkoutUntil
         receptionOpen24h amenities houseRules cancellationPolicy taxesIncluded
         arrivalNote paymentMethods roomCount
```

**`hotel.id` no está. `hotel.shopId` sí.** Y `followersCount` **sí viaja** (medido: `0`) aunque no
esté declarado en el tipo.

### 4.2 `GET /hotels` — las claves exactas

```
raíz           →  hotels city checkIn checkOut nights guests units page pageSize hasMore nextCursor
hotels[]       →  hotel fromPricePerNightXaf soldOut rooms
hotels[].hotel →  id name city barrio region logoUrl coverUrl rating ratingCount
                  ratingPublished addressReference lat lng verificationLevel isVerified
```

⚠️ **La tarjeta NO trae `shopId`, ni `propertyKind`, ni `stars`, ni `roomCount`, ni `amenities`, ni
`checkinFrom`.** Si el diseño quiere estrellas o número de habitaciones **en la lista**, hay que
pedir la ficha — o pedirle el campo al backend. No es que no se pinte: es que **no llega**.

### 4.3 Una habitación entera (muestra literal)

```json
{
  "id": "e0a56105-6986-4759-a58c-23fea95808fd",
  "shopId": "d8a2ece3-92b4-4959-8412-d26b5d698ade",
  "productId": "95f6f773-ca16-4100-95de-c161856883f6",
  "name": "Habitación individual",
  "description": "Habitación de demostración: 1 huésped(es), 14 m².",
  "capacity": 1,
  "beds": [{ "kind": "individual", "count": 1 }],
  "sizeM2": 14,
  "totalUnits": 1,
  "basePriceXaf": 18000,
  "weekendPriceXaf": 22000,
  "cleaningFeeXaf": 5000,
  "taxesXaf": 0,
  "minNights": 1,
  "maxNights": 30,
  "depositPercent": 30,
  "holdMinutes": 20,
  "confirmationHours": 24,
  "cancellationHours": 48,
  "images": [
    { "url": "https://hk.egrouteplan.com/lb-images/covers/05193228-….jpg", "type": "image", "position": 0 },
    { "url": "https://hk.egrouteplan.com/lb-images/covers/22950301-….jpg", "type": "image", "position": 1 },
    { "url": "https://hk.egrouteplan.com/lifebook-media/products/ec7d4cb7-…/94e41b24-….jpg", "type": "image", "position": 2 }
  ],
  "amenities": ["wifi", "aire", "tv", "agua_caliente"],
  "isActive": true,
  "activeReservations": 0,
  "createdAt": "2026-09-11T16:27:06.622Z",
  "updatedAt": "2026-09-11T17:33:09.077Z",
  "productStatus": "active"
}
```

### 4.4 Los 8 tipos del hotel de prueba (medido, uno por línea)

| # | Nombre | unidades | base | finde | fotos | cap. | m² | mín | señal | limpieza |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | Habitación individual | 1 | 18.000 | **22.000** | **3** | 1 | 14 | 1 | 30 % | 5.000 |
| 1 | Habitación doble 208520 | 1 | 25.000 | **32.000** | 0 | 2 | 18 | 1 | 30 % | 5.000 |
| 2 | Habitación doble 554279 | 1 | 25.000 | **32.000** | 0 | 2 | 18 | 1 | 30 % | 5.000 |
| 3 | Habitación panel 204798 | 1 | 26.000 | null | 0 | 2 | null | 1 | 30 % | 0 |
| 4 | Habitación panel 542411 | 1 | 26.000 | null | 0 | 2 | null | 1 | 30 % | 0 |
| 5 | Habitación contrato 206554 | 2 | 28.000 | null | 0 | 3 | null | **2** | 0 % | 1.500 |
| 6 | Habitación contrato 540295 | 2 | 28.000 | null | 0 | 3 | null | **2** | 0 % | 1.500 |
| 7 | Habitación doble | 3 | 28.000 | **34.000** | **3** | 2 | 20 | 1 | 30 % | 5.000 |

Lo que enseña esta tabla, y por eso está: **6 de 8 tipos NO tienen ni una foto** y **4 de 8 no tienen
precio de fin de semana** → los dos huecos son **el caso normal**, no la excepción, y hay que
diseñarlos (§7). `holdMinutes` = 20 y `confirmationHours` = 24 en los ocho; `taxesXaf` = 0.

> Apunte sin cerrar: los nombres de ejemplo llevan **sufijo numérico** (`… 208520`) — es la marca con
> la que se distinguen hoy los datos de EJEMPLO, y encaja con la purga pendiente. **Observado, no
> confirmado como regla del seed.**

### 4.5 `GET /rooms/:id/calendar` — medido (200, 1.546 B)

```
raíz    →  roomTypeId name totalUnits from to units days summary
summary →  { "free": 7, "closed": 0, "full": 0 }
days[0] →  { "date":"2026-09-27", "priceXaf":18000, "basePriceXaf":18000, "weekend":false,
             "closed":false, "note":null, "minNights":1, "totalUnits":1, "usedUnits":0,
             "freeUnits":1, "isToday":true, "available":true }
```

**El tipo y la respuesta coinciden clave a clave.** El rango vale para 92 días inclusive (§5.1 del
encargo: pedir «hoy + 92» son 93 y da **400**).

### 4.6 `GET /hotels/:id/reviews` — medido (200, 79 B: este hotel no tiene reseñas)

```json
{ "total": 0, "average": 0, "publishesRating": false, "limit": 3, "offset": 0, "items": [] }
```

**El tipo y la respuesta coinciden.** `publishesRating: false` es la razón de que la ficha no enseñe
cifra de nota. Con reseñas, `items[]` trae `HotelReview` con su `guest` y el `reply` del hotel.

### 4.7 `fx` llega **`null`** si no se manda `?country=`

Medido: `fx: null`. `arrival` y `airport` sí llegan:

```json
{
  "arrival": { "note": null, "lat": 3.7523, "lng": 8.7742,
               "addressReference": "Frente al mar, a 5 min del centro", "city": "Malabo" },
  "airport": { "label": "Aeropuerto", "city": "Malabo", "lat": 3.765, "lng": 8.715,
               "priceFromXaf": 1500, "priceToXaf": 3000 }
}
```

---

## 5. Donde el TIPO y la RESPUESTA no coinciden

Esto es lo que el otro agente necesita para no tropezar: **el tipo no siempre dice la verdad.**

| # | Campo | El tipo dice | La respuesta trae | Consecuencia |
|---|---|---|---|---|
| 1 | **`hotel.id` en la ficha** | `id: string` **obligatorio** (heredado de `HotelSummary`) | **no llega**; llega **`shopId`** | `hotel.id` es `undefined` **sin error de tipos**. En la lista es al revés: `id` sí, `shopId` no. **El valor es el mismo** (`d8a2ece3-…`) |
| 2 | `hotel.followersCount` | **no declarado** | `0` | Viaja y no está tipado. Son **seguidores**, no ventas |
| 3 | `room.images[]` | `{ url: string }[]` | `{ url, type, position }[]` | El tipo es **más estrecho** que la realidad (leer `url` funciona; `type`/`position` existen) |
| 4 | `room.activeReservations` | **no declarado** | `0` | Ídem. **Es una cifra interna del hotelero**, no del huésped |
| 5 | `room.createdAt` / `updatedAt` | **no declarados** | instantes ISO | Ídem |
| 6 | `room.freeUnits` **sin fechas** | `number \| null` opcional | **`null`** (la clave **sí** viene) | Se distingue de «no viene»: aquí viene y vale `null` |
| 7 | `room.subtotalXaf` / `totalXaf` / `depositXaf`… **sin fechas** | opcionales | **no vienen** (`undefined`) | **Dos ausencias distintas** (`null` vs `undefined`) para el mismo «no hay dato»: hay que tratar las dos |
| 8 | `hotel.paymentMethods` | `(string \| {method,status,note?})[]` | aquí **sólo cadenas** | El tipo admite objetos; medido, cadenas |
| 9 | `fx` / `arrival` / `airport` | `HotelFx \| null`, etc. | `fx` **`null`** sin `country`; los otros, llenos | `null` es normal, no un fallo |
| 10 | `search` paginación | las cuatro opcionales | **no llegan** cuando no hay candidatos | Ausente = no hay más |
| 11 | `hotels[].hotel` (lista) | `HotelSummary` | **sin `propertyKind`/`stars`/`roomCount`/`amenities`/`checkinFrom`** | **La lista no puede enseñar estrellas ni nº de habitaciones** sin pedir la ficha |
| 12 | `Reservation.hotel` | `HotelSummary \| null` | puede ser `null` | Comprobar antes de leer |

**El nº 1 es el único que puede dar un fallo silencioso.** Hoy **nadie** lee `hotel.id` de una ficha
(comprobado: 0 usos), así que **es latente, no está disparando**. Pero quien venga de la lista —donde
sí se lee `id`— va a escribir `hotel.id` por inercia y va a recibir `undefined`.
**Decisión propuesta, no tomada:** que la ficha se identifique siempre por `shopId`, y que el tipo lo
diga (o `id` opcional en el perfil, o el servidor mandando `id`). **No se toca el tipo sin cerrar eso**,
porque cambiarlo arrastra a todo el módulo.

---

## 6. Lo que NO existe — y los dos campos del otro agente

### 6.1 Sus dos campos, traducidos al contrato

| Lo que pidió | Qué existe de verdad |
|---|---|
| **`notes` (备注)** | ⚠️ **Es del módulo del MERCADO, no del hotel** (§6.3). En el hotel: **`hotel.arrivalNote`** — cómo se entra y dónde está la recepción (es lo que sale junto a «Cómo llegar») · **`hotel.houseRules`** — normas · **`hotel.cancellationPolicy`** — política en texto · **`room.description`** · **`CalendarDay.note`** — la nota de ESE día (mínimo de estancia, cierre…) · **`Reservation.note`** — lo que escribe el huésped al reservar |
| **`estimatedTime` (预计时间)** | ⚠️ **También es del mercado** (tiempo estimado de ENVÍO). **En el hotel no existe ningún campo de «tiempo estimado».** Lo más cercano, y lo que sí hay: **`room.holdMinutes`** (20) — los minutos que el servidor **retiene** la reserva antes de soltarla · **`room.confirmationHours`** (24) · **`room.cancellationHours`** (48, **horas antes de la llegada**) · y en la reserva hecha, las dos horas exactas en ISO: **`holdExpiresAt`** y **`freeCancellationUntil`** |

> **Estas dos últimas son la respuesta al «estado del pedido con la hora exacta de cancelación
> gratis» de Meituan** (`foto-30`): no hay que calcular nada en la app — el servidor manda la hora.
> Y **el reloj que paga el huésped es `holdMinutes`**, no `confirmationHours`.

### 6.2 Lo que tampoco existe (no modelar)

- **`sort` / ordenación** — el cliente manda `minPrice`, `maxPrice` y `page`, y nada más.
- **Filtro de instalaciones o de estrellas** — `searchHotels` acepta `amenities` y **la ignora**;
  `stars` ni se acepta.
- **`soldOut` a nivel de tipo de habitación** — existe en el hotel (`hotels[].soldOut`); para el tipo
  se usan `closedForDates` y `minNightsForDates`, y sólo con fechas.
- **Cualquier cifra del importe exacto sin fechas**: la ficha no lo sabe; hay que pedir el calendario.
- **«Antes / ahora»** (precios tachados, descuentos) — no hay campo. **No se maqueta el hueco.**
- **Nota del hotel deducida del cliente** — se pinta por `ratingPublished`, y punto.
- **Datos de ejemplo en pantalla** — los nombres con sufijo numérico son EJEMPLO (§4.4).

### 6.3 De dónde vienen esos dos nombres (y de dónde la idea del guion bajo)

Los dos existen **en este mismo proyecto**, en **otro módulo** — de ahí el cruce:

| Nombre | Dónde vive de verdad | Qué es |
|---|---|---|
| `notes` | **`api/reserva.ts` → `ReservePayload.notes?`** | Las notas del pedido **del MERCADO** (la compra), no de una reserva de hotel |
| `estimatedTime` | **`shippingPolicy.estimatedTime`** (módulo de comercio, `commerce.service.ts`) | El tiempo estimado de **ENVÍO** de una tienda, texto libre de 60 caracteres |

**Y la idea del guion bajo tiene una explicación, no es capricho:** en el servidor, **la base de datos
sí es snake_case** y el servicio **traduce** al borde. Medido en el propio código del comercio:

```
SQL:  estimated_time = …          TS:  estimatedTime: p.estimated_time
SQL:  cost_mode, base_cost_xaf…   TS:  costMode, baseCostXaf…
```

**Regla para la app: ve la API, no la base de datos.** `estimated_time` (columna) llega como
`estimatedTime` (campo). Traducir a guion bajo en el cliente sería inventarse una capa que no existe
—y las columnas del hotel que ya conocemos (`basePriceXaf`, `cancellationHours`) no están ahí por
casualidad.

---

## 7. Cómo debe consumirlo el otro agente (5 reglas)

1. **`import type { HotelProfile, HotelRoom, HotelSummary, HotelSearchResult, CalendarDay,
   RoomCalendar, HotelReview, HotelReviewsPage, Reservation, CreateReservationInput }
   from '…/api/hotel'`.** No se declara ningún tipo propio de estos.
2. **En la ficha se identifica por `shopId`; en la lista, por `id`.** No mezclarlos (§5, nº 1).
3. **Los tres «no hay dato» se tratan distinto y los tres se pintan como ausencia, nunca como `0`:
   campo ausente · campo `null` · cifra `0` que sí es un dato real.** `weekendPriceXaf: null` → no se
   pinta la fila del fin de semana; `freeUnits: null` → no se promete disponibilidad; `taxesXaf: 0` →
   **eso sí se puede decir** («sin tasas»).
4. **El dinero no se calcula**: precio por noche lo da el servidor (ficha y calendario); el importe de
   la estancia lo da el calendario o la reserva. **La ficha elige; la reserva cobra.**
5. **Antes de pedirle un campo nuevo al backend, mirar §4: hay 12 desajustes medidos y varios son
   datos que ya viajan** (fin de semana, fotos por tipo, verificado, seguidores). Pedir antes de leer
   es gastar dos veces.

---

## 8. Cómo se comprueba que este documento no inventa nada

```bash
cd /d/egapp && node pruebas/verifica-contrato-campos.cjs
```

**Qué hace la puerta:** recorre los bloques de este documento y falla si un campo no existe en
`api/hotel.ts`, si su opcionalidad no coincide, o si su tipo no coincide — comparando **interfaz por
interfaz** (un mapa global de nombres da falsos positivos: `guests`, `lat` y `checkinFrom` existen en
varias interfaces con formas distintas). Con las muestras locales presentes, comprueba además que cada
clave de los bloques JSON existe de verdad en la respuesta del servidor.

**Resultado del 27-sep-2026:** `192 campos de tipo comprobados · 47 claves JSON · 0 inventados`.

**Para regenerar las muestras** (servidor de PRUEBA, desde la máquina, sin aislamiento):

```bash
B=https://hk.egrouteplan.com/wallet/api/v1/lifebook/commerce/hotel
curl -s --noproxy '*' "$B/hotels/d8a2ece3-92b4-4959-8412-d26b5d698ade" -o pruebas/_p2-ficha.json
curl -s --noproxy '*' "$B/hotels?city=Malabo" -o pruebas/_p2-search.json
curl -s --noproxy '*' "$B/rooms/e0a56105-6986-4759-a58c-23fea95808fd/calendar?from=2026-09-27&to=2026-10-03&units=1" -o pruebas/_ct-calendar.json
curl -s --noproxy '*' "$B/hotels/d8a2ece3-92b4-4959-8412-d26b5d698ade/reviews?limit=3" -o pruebas/_ct-reviews.json
```

---

**Y lo que sigue sin poder prometerse:** un filtro que ordene, una estrella en la lista o un precio
tachado **necesitan backend**. Lo demás —tarjeta con foto, franja de fechas, tabla de servicios,
calendario con precio por noche, escaparate de reseñas— **se puede hacer ya, con estos campos.**
