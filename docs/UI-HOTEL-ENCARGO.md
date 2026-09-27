# ENCARGO — UI DEL MÓDULO DE ALOJAMIENTO (HOTEL)

> **Qué es este documento.** Todo lo que necesita quien vaya a construir o rediseñar las pantallas
> del módulo de hotel de esta app, sin haber visto nunca el proyecto. **Es autosuficiente**: no hace
> falta leer ningún otro documento para empezar. Lo que no esté aquí, se lee en el código (y se dice
> dónde).
>
> **Convención de honestidad** (la del proyecto): lo que va sin marca está **medido**. Lo que va
> marcado `[supuesto]` es deducción y **no se maqueta sin confirmar**. Lo que va marcado `[sin medir]`
> no se ha comprobado y **no se puede afirmar**.

---

## 0. El mensaje de arranque (copiar y pegar)

Si hay que dárselo a otro agente, este párrafo es el que abre la conversación:

> Trabajas sobre la app **Expo/React Native** que está en **`D:\egapp`** (repo git, rama `main`).
> Tu tarea es **rediseñar las pantallas del módulo de ALOJAMIENTO (hotel)**, siguiendo como
> referencia el recorrido de **Meituan** que está fotografiado en
> **`D:\egapp\pruebas\referencia-meituan\`** (`foto-01.jpg` … `foto-30.jpg` en el orden en que el
> dueño del producto las hizo). **Antes de escribir una línea de código**, lee
> **`D:\egapp\docs\UI-HOTEL-ENCARGO.md`** completo: contiene el sistema de diseño obligatorio, el
> contrato de la API, las decisiones ya cerradas que **no se reabren**, las seis puertas de
> verificación y las trampas del entorno. **Los datos de la app son de prueba y no hay que
> arreglarlos; los fallos de código sí.** Trabaja **pantalla por pantalla**, no de golpe.

---

## 1. Qué hay que entregar

**Código dentro del mismo repo**, en las rutas que ya existen (§5), que:

1. **pase las tres puertas locales** (§8.1-§8.3) sin subir ni un número del trinquete de diseño,
2. **compile en release e instale** (`assembleRelease` + instalación verificada **por bytes**),
3. y venga con **una medida en el píxel** de cada cambio, hecha **con el dedo** y no solo mirando una
   captura.

Y un **acta en markdown, en español**, con: lo que se hizo, lo que se midió, **lo que NO se pudo
medir**, y los commits.

**Lo que NO hay que hacer:** tocar el backend, tocar el módulo Mercado, tocar el kit de diseño
(`packages/ui-kit`), ni «arreglar» los datos de prueba.

---

## 2. Las seis reglas que no se negocian

1. **Nada de literales de diseño.** Ni un color hex, ni un `fontSize`, `borderRadius`, `fontWeight`,
   `borderWidth` ni `strokeWidth` escrito a mano. **Todo sale de los tokens del kit** (§4). Hay una
   guardia que lo cuenta y falla si el número sube (§8.2).
2. **Decisión escrita + previsualización antes de implementar.** El dueño del producto lo pidió con
   estas palabras: *«primero decide qué ves y si es posible implementarlo»* y *«usa canvas para
   presentar una previsualización»*. **Implementar sin enseñar antes obliga a rehacerlo.**
3. **Todo cambio visual exige `assembleRelease`.** El JS va **empaquetado dentro del APK**: `expo
   start`, Metro o `assembleDebug` **no prueban nada**, porque cargan el bundle del servidor de
   desarrollo.
4. **La instalación se verifica POR BYTES**, nunca por el mensaje. `adb install` puede imprimir
   `failed to install` **habiendo instalado**. Se compara el tamaño del `base.apk` del teléfono con el
   del APK compilado (§8.4).
5. **Lo interactivo se verifica TOCANDO.** Una captura y un volcado de jerarquía no prueban que un
   botón funcione: un control puede **pintarse perfectamente y no responder a ningún toque** (§8.5).
6. **Los datos son de prueba; el código es real.** Las tiendas, hoteles y usuarios son EJEMPLO
   —«Hotel Demo Malabo», «Tienda Hotel 079171»—. Eso **no** rebaja la exigencia: lo prioritario son
   los **fallos de código** y la **deuda de dinero**.

---

## 3. El proyecto en diez líneas

- **App:** Expo ~53 / React Native, TypeScript, en **`D:\egapp`**. Git: `gitee.com/Bernardo12/egapp.git`,
  rama **`main`**. El dueño del producto **empuja él** los commits.
- **Monorepo ligero:** `packages/ui-kit` (tema, escalas y primitivas), `packages/contracts`,
  `packages/map`. Se importan como `@egrouteplan/ui-kit`.
- **Backend:** NestJS + PostgreSQL, **en un servidor remoto**. La app apunta a
  `https://hk.egrouteplan.com` (`api/config.ts`). **No hay claves de terceros.**
- **Pantallas del hotel:** `app/lifebook-hotel*.tsx` (15 ficheros).
- **Componentes del hotel:** `components/hotel/*.tsx` y `components/HotelResultCard.tsx`.
- **Cliente de la API del hotel:** `api/hotel.ts` (un solo fichero, muy comentado: **leerlo antes de
  tocar nada**).
- **Plan y decisiones vigentes:** `docs/UI-HOTEL-PLAN-MEJORA.md` (el itinerario, con las decisiones
  numeradas D1…D11 y las medidas ya hechas).
- **Guardias:** `pruebas/verifica-diseno.cjs` (trinquete de diseño) y `pruebas/c1-verifica-app.cjs`
  (invariantes del sistema de reseñas).
- **Compilador:** `compilar-apk.ps1` en la raíz, con bloqueo para que dos builds no se pisen.
- **Idioma de los entregables: español.** Comentarios, actas y mensajes de commit, en español.

---

## 4. El sistema de diseño: lo único que se puede usar

**Dos ficheros, y son la ley:** `packages/ui-kit/src/theme/colors.ts` y
`packages/ui-kit/src/theme/escalas.ts`. Si un valor no está ahí, **no se escribe**: se usa el token
más cercano o se pregunta.

### 4.1 Cómo se consume

```tsx
import { alpha, brand, espaciado, peso, radios, tipografia, trazo, trazoIcono, useTheme } from '@egrouteplan/ui-kit';

const { colors } = useTheme();          // colors.text.primary, colors.surface, colors.card, …
```

**Hay modo claro y oscuro** y los dos se miden: el tema está en `useTheme()`, no en constantes.

### 4.2 Tokens verificados

| Familia | Claves |
|---|---|
| `brand` | `primary` `#0066CC` · `primaryPressed` · `secondary` · `success` · `danger` · `warning` `#F59E0B` · `onWarning` · `info` · `onInfo` · `neutral*` · `lifebook*` · `social*` · `servicio*` · `white` |
| `colors` (tema) | `textPrimary` `textSecondary` `background` `surface` `card` `sheet` `border` `overlay` `shadow` + **`colors.text.*`**: `primary` `danger` `success` `secondary` `neutral` `warning` `info` `lifebook` `social` `servicio` |
| `tipografia` | `rotulo 9` `minimo 9.5` `nota 10` `micro 10.5` `caption 12` `body 14` `fino 14.5` `cuerpo 15` `ancho 15.5` `subtitle 16` `anchoFuerte 16.5` `subCabecera 17` `cabecera 18` `cifra 19` `title 20` `cifraGrande 21` `subtitulo 22` `tituloFicha 24` `display 26` `hero 30` … `kpi 38` |
| `peso` | `normal '400'` `medio '500'` `fuerte '700'` `maximo '800'` `titulo '900'` |
| `espaciado` | `e2 … e32` (hay `e2…e14`, `e16`, `e18`, `e20`, `e22`, `e24`, `e26`, `e28`, `e30`, `e32`) — **NO existe `e1` ni `e15`** |
| `radios` | `pista 2` `punta 4` `marca 6` `sm 8` `hermano 9` `chip 10` `nota 11` `md 12` `contacto 13` `campo 14` `lg 16` `panel 18` `tarjeta 20` `panelAncho 22` `marco 24` `hoja 26` `aviso 30` `full 999` |
| `trazo` | `fino 1` `base 1.5` `fuerte 2` `marcado 2.5` `anillo 3` — **para `borderWidth`** |
| `trazoIcono` | `fino 1.8` `base 2` `fuerte 2.2` `acento 2.5` `marcado 3` — **para `strokeWidth` de icono** |
| `altura` | `punto 44` `control 46` `campo 50` `boton 52` |
| `icono` | `micro 12` `sm 16` `md 20` `lg 24` `hero 32` |
| `ilustracion` | `sm 20` `md 36` `lg 56` |
| `elevation` / `elevationDark` | `sm` `md` `lg` |

**Utilidades (con su ruta, para no inventarlas):**

| Función | Fichero |
|---|---|
| `alpha(hex, opacity)` | `packages/ui-kit/src/theme/colors.ts` — translúcidos; **nunca un hex de 8 dígitos a mano** |
| `formateaXAF(valor)` | `packages/ui-kit/src/format/moneda.ts` — el importe dentro de una **frase** |
| `todayIso()` · `addDaysIso(iso, días)` | `utils/datetime.ts` — fechas `YYYY-MM-DD` (ojo con el rango de 92 días, §6.3) |

### 4.3 Las cuatro reglas de estilo que la guardia vigila

1. **El color de texto no es «el color de marca».** En claro, solo cuatro acentos cumplen contraste
   AA como texto: por eso existe `colors.text.*` (variante oscurecida) frente a `brand.*` (relleno).
   **Regla:** relleno → `brand.*`; texto → `colors.text.*`. En oscuro cambia el valor, no el nombre.
2. **`trazo` es para bordes; `trazoIcono` es para iconos.** Confundirlos es el fallo más fácil de
   cometer al pegar bloques.
3. **El precio tiene dos formas y no se eligen a gusto** (primitiva `Precio` en
   `packages/ui-kit/src/primitives/Precio.tsx`, con `tamano` `sm|md|lg|xl` y `forma` `llano|pastilla`):
   - **Figura** — el importe **es** el sujeto de la línea → manda `Precio` (cifra + unidad reducida,
     incapaz de partirse).
   - **Texto corrido** — el importe **va dentro de una frase** → manda `formateaXAF` (cifra y unidad
     con espacio duro) y **no** se mete como componente.
   La guardia **cuenta los precios de figura pintados a mano** (`precioFigura`).
4. **Los iconos son de `lucide-react-native`** y el grosor sale de `trazoIcono`. Ya comprobados
   disponibles: `Wifi Snowflake Tv Droplets Waves Refrigerator Coffee UtensilsCrossed Dumbbell Wine
   Clock Zap WashingMachine ArrowUpDown Dog Accessibility CookingPot BadgeCheck CalendarDays MapPin
   BedDouble Users Ruler Maximize2 Check ChevronRight Building2 Sparkles ShieldCheck`.

### 4.4 La hoja inferior y la cabecera ya existen — no las reinventes

- **Hoja inferior:** `components/lifebook/ui/Sheet.tsx` **y** `packages/ui-kit/src/primitives/Sheet.tsx`.
  Lee la primera antes de escribir otra. Para cerrar una hoja **se toca su fondo** (ver §9).
- **Cabecera de pantalla:** `ScreenHeader` del kit (21 pantallas ya migradas).
- **Estados vacíos / errores:** `EmptyState`, `InlineError`, `Aviso`, `PrimaryButton` del kit.

---

## 5. Los ficheros del hotel (el mapa)

**Pantallas** (`app/`):

| Fichero | Qué es | Estado |
|---|---|---|
| `lifebook-hotel.tsx` | Home del módulo (buscador + lista) | P1 hecho (`783ad75`) |
| `lifebook-hotel-resultados.tsx` | «Ver la lista completa» | P1 hecho |
| `lifebook-hotel-detalle.tsx` | **LA FICHA** (el clic desde la home) | P2 hecho (`13332f8`) |
| `lifebook-hotel-reservar.tsx` | Reservar (aquí se calcula y cobra) | Sin rediseñar |
| `lifebook-hotel-reserva.tsx` | Detalle de una reserva | Sin rediseñar |
| `lifebook-hotel-reservas.tsx` | Mis reservas (huésped) | C-1 tocado |
| `lifebook-hotel-gestion.tsx` · `lifebook-hotel-panel.tsx` | Panel del hotelero | Fuera de alcance |
| `lifebook-hotel-habitacion.tsx` · `lifebook-hotel-habitaciones.tsx` | Habitaciones del hotelero | Fuera de alcance |
| `lifebook-hotel-calendario.tsx` · `lifebook-hotel-fechas.tsx` | Calendario (hotelero / huésped) | Sin rediseñar |
| `lifebook-hotel-perfil.tsx` | Perfil del alojamiento (hotelero) | Fuera de alcance |
| `lifebook-hotel-resena.tsx` · `lifebook-hotel-valoraciones.tsx` | Escribir / leer reseñas | C-1 hecho |

**Componentes** (`components/hotel/`): `HotelRoomCard.tsx` (tarjeta de habitación), `HotelDateRange.tsx`
(barra de fechas + hoja de calendario), `servicios.ts` (diccionario de nombres de servicio),
`HotelCitySheet.tsx`, `HotelGuestsSheet.tsx`, `HotelPriceSheet.tsx`. Y `components/HotelResultCard.tsx`.

**El alcance del encargo es SOLO ALOJAMIENTO.** Vuelos, trenes, entradas y vacaciones están **fuera**
—lo fijó el dueño del producto—.

---

## 6. El dato: contrato de la API

> **El mapeo campo a campo —nombres, tipos, nulabilidad, la muestra real de cada respuesta y los 12
> desajustes medidos entre el TIPO y lo que el servidor manda de verdad— está en
> `docs/UI-HOTEL-CONTRATO-CAMPOS.md`.** Ese fichero es el que se le pasa a quien vaya a escribir
> contra el dato. No se declaran interfaces propias: las de `api/hotel.ts` se importan.

Todo en **`api/hotel.ts`**. Host `https://hk.egrouteplan.com`, base `…/wallet/api/v1`, y el módulo
cuelga de **`/lifebook/commerce/hotel`**.

### 6.1 Las rutas que importan para el rediseño

| Método | Ruta | Qué da |
|---|---|---|
| `hotelApi.search({city, checkIn, checkOut, guests, units, minPrice, maxPrice, limit, page})` | `GET /hotels` | Lista: `{hotels:[{hotel, fromPricePerNightXaf, soldOut?, rooms[]}], city, checkIn, checkOut, nights, guests, units, page?, pageSize?, hasMore?, nextCursor?}` |
| `hotelApi.hotel(shopId, country?)` | `GET /hotels/:id` | **La ficha**: `{hotel: HotelProfile, rooms: HotelRoom[], fx, arrival, airport}` |
| `hotelApi.fx(country?)` | `GET /hotels/fx` | Monedas y países (público) |
| `hotelApi.roomsOf(shopId)` | `GET /hotels/:id/rooms` | Los tipos de habitación |
| `hotelApi.room(roomTypeId)` | `GET /rooms/:id` | Un tipo, con su hotel |
| `hotelApi.calendar(roomTypeId, from, to, units)` | `GET /rooms/:id/calendar` | **Disponibilidad y precio por noche** |
| `hotelApi.reviews(shopId, {limit, offset})` | `GET /hotels/:id/reviews` | **PÚBLICA**, sin sesión |
| `hotelApi.reserve(input, idempotencyKey)` | `POST /reservations` | **`Idempotency-Key` obligatoria** |
| `hotelApi.mine('guest')` · `reservation(id)` | `GET …/reservations/…` | Mis reservas |

### 6.2 Los campos que el rediseño va a querer y que **existen de verdad**

Verificado contra el servidor de prueba (`Hotel Demo Malabo`, 8 tipos de habitación):

- `hotel.isVerified` / `hotel.verificationLevel === 'verified'` — **existía y no se pintaba en
  ninguna pantalla** hasta P2.
- `room.weekendPriceXaf` (22.000 / 32.000 / 32.000 / 34.000 en el hotel de prueba) — **existía y no
  se enseñaba**. `null` = ese tipo no tiene precio de fin de semana: **no se pinta nada**.
- `room.images[]` — **2 de 8** tipos tienen fotos, **6 no tienen ninguna**. El caso «sin foto» es
  normal, hay que diseñarlo, no tratarlo como excepción.
- `room.amenities[]` (`wifi`, `aire`, `tv`, `agua_caliente`, `nevera`) y `hotel.amenities[]`
  (`wifi`, `desayuno`). El diccionario de nombres está en `components/hotel/servicios.ts`.
- `room.sizeM2`, `room.beds[{kind,count}]`, `room.capacity`, `room.minNights`, `room.maxNights`,
  `room.depositPercent`, `room.cleaningFeeXaf`, `room.taxesXaf`, `room.confirmationHours`,
  `room.cancellationHours`.
- `hotel.propertyKind`, `hotel.stars`, `hotel.roomCount`, `hotel.checkinFrom`, `checkinUntil`,
  `checkoutUntil`, `hotel.receptionOpen24h`, `hotel.taxesIncluded`, `hotel.description`,
  `hotel.arrivalNote`, `hotel.houseRules`, `hotel.cancellationPolicy`, `hotel.paymentMethods[]`,
  `hotel.lat/lng`, `hotel.addressReference`, `hotel.barrio/region/city`.
- `airport` — el aeropuerto de la ciudad **con precios de taxi de referencia**
  (`priceFromXaf`/`priceToXaf`). `arrival` — cómo se llega y dónde está la recepción.
- `CalendarDay`: `date priceXaf basePriceXaf weekend closed note minNights totalUnits usedUnits
  freeUnits isToday available`.

### 6.3 Las trampas del servidor (medidas, no supuestas)

1. **`/calendar` cuenta los días INCLUSIVE y acepta 92.** Medido:
   ```
   2026-09-27 → 2026-12-27   HTTP 200   (92 días)
   2026-09-27 → 2026-12-28   HTTP 400   {'code':'RANGE_TOO_LONG','message':'Como máximo 92 días por consulta'}
   ```
   **Pedir «hoy + 92» son 93 días y SIEMPRE falla.** El rango se pide con
   `addDaysIso(todayIso(), MAX_NOCHES - 1)`. Este fallo estuvo meses en pantalla sin que nadie lo
   viera (§9, trampa 2).
2. **La nota del alojamiento se pinta por `ratingPublished`, no por el valor.** Es el **servidor**
   quien decide si hay reseñas suficientes (umbral `REVIEWS_THRESHOLD`, 3 reseñas). Si se deduce en
   el cliente, cambiar el umbral en el servidor deja la app enseñando medias de una sola estancia
   como si fueran la nota del hotel. `ratingPublished` ausente = **no se pinta la cifra**.
   ⚠️ Hasta el 27-sep-2026 ese campo era `lifebook.shops.rating`, **la nota del MERCADO** (valoraba
   lo que se compra, no cómo se duerme). Ya está desacoplado.
3. **El dinero NO viaja.** El total, la señal y el restante los calcula el **servidor**. La app manda
   fechas, habitaciones, huéspedes y el % de señal. **La ficha elige; la reserva cobra.**
4. **`reserve` exige `Idempotency-Key`** (400 sin ella) y la clave debe ser **estable por intento**
   (`reserveKey`), no nueva en cada pulsación — si se genera nueva en cada toque, la idempotencia no
   protege de un doble toque.
5. **Los dos descriptores de confianza viajan y NO significan lo que parecen:**
   - `cancellationHours = 48` son **horas antes de la LLEGADA**, no minutos tras reservar. El
     «cancelación gratis 15 min» de Meituan es **otra política** y no se copia.
   - `confirmationHours = 24` **NO es confirmación inmediata**. Solo se escribe «confirmación
     inmediata» si es **0**.
6. **La paginación de `search` es opcional y miente por omisión.** El servidor devuelve `page`,
   `pageSize`, `hasMore` y `nextCursor`… **salvo cuando no hay ningún hotel candidato**, que hace un
   `return` temprano y **deja fuera los tres primeros**. Quien los use trata «ausente» como «no hay
   más» (`hasMore` ausente → esconder el botón).

### 6.4 Lo que NO existe (no se puede prometer sin tocar backend)

- **`sort`**: el cliente manda `minPrice`, `maxPrice` y `page`, pero **no hay ordenación**. Ordenar
  exige backend.
- **`searchHotels` acepta `amenities` y NO la usa**, y `stars` ni se acepta → **no se puede prometer
  un filtro de instalaciones ni de estrellas** hasta que el servidor lo aplique.
- **`freeUnits` llega `null` fuera de la búsqueda con fechas** → la ficha **no sabe** cuántas quedan.
- **La ficha no sabe el importe de unas fechas concretas** sin pedir el calendario de cada tipo.
- `followersCount` viaja en el JSON pero **no está en el tipo `HotelSummary`** (además, son
  «seguidores», no ventas).
- ⚠️ **En la FICHA `hotel.id` NO existe: llega `hotel.shopId`** (en la LISTA es al revés: `id` sí y
  `shopId` no; **el valor es el mismo**). Como el tipo declara `id` obligatorio, leer `hotel.id` de
  una ficha da `undefined` **sin error de tipos**. Hoy nadie lo hace; quien venga de la lista, sí.

---

## 7. Las decisiones ya cerradas — no se reabren

Están en `docs/UI-HOTEL-PLAN-MEJORA.md`. **El motivo de que no se reabran es que cada una se tomó con
la foto delante o por decisión explícita del dueño del producto.** Si aparece una razón nueva, se
escribe y se discute; no se cambia por gusto.

| # | Decisión | Estado |
|---|---|---|
| D1 | **La home lleva buscador Y lista** (corregida tras ver la foto: el defecto no era la lista, eran ~1.000 px de formulario delante) | Hecho |
| D2 | Habitaciones en **una línea** y sin botón en la tarjeta de la lista | Hecho |
| D3-D7 | Abiertas | **Pendiente de decidir** |
| D8 | **Pestañas en la ficha: `Reservar · Reseñas · El alojamiento`** | **Pendiente** |
| D9 | Barra de fechas arriba + calendario **en una hoja** | Hecho (`13332f8`) |
| D10 | Galería con **dos pestañas: `Alojamiento (n) / Habitaciones (m)`** | **Pendiente** |
| D11 | **Lo primero es la tarjeta de habitación** | Hecho (`13332f8`) |

**Y una decisión de diseño que hay que respetar aunque no esté numerada:** la disponibilidad de la
barra de fechas se **AGREGA** de los tipos activos del alojamiento (`libre` si queda hueco a alguno,
`cerrada` solo si lo están todos, precio = **el más bajo** de los que quedan — el sentido de «desde»).
Se pide **en paralelo y SOLO al abrir la hoja**, nunca al abrir la ficha, con tope de 12 tipos: sin
tope, un alojamiento de 40 dispara 40 peticiones.

---

## 8. Las seis puertas de verificación

### 8.1 Tipos (`tsc`)
```bash
cd /d/egapp && npx tsc --noEmit
```
Debe dar **0 errores**. No basta con que «compile en Metro».

### 8.2 El trinquete de diseño
```bash
cd /d/egapp && npm run diseno      # = node pruebas/verifica-diseno.cjs
```
Compara contra **`.diseno-baseline.json`**. El número **no puede subir**. Estado actual (27-sep-2026),
**este es el listón**:

```
hex 0 · fontSize 0 · borderRadius 0 · fontWeight 0 · borderWidth 5 ·
espaciado 183 · precioFigura 5 · strokeWidth 0
```
**Seis familias a CERO**: si aparece un solo literal de esas seis, la guardia falla. (Ojo: la guardia
mira el árbol de fuentes, no el fichero que acabas de escribir.)

### 8.3 Las invariantes del módulo
```bash
cd /d/egapp && node pruebas/c1-verifica-app.cjs
```
Comprueba que los ficheros del hotel **parseen** (un JSX roto revienta el bundle entero, no una
pantalla) y que se mantengan las decisiones del sistema de reseñas (`publishesRating`,
`Reseñas (${resenas.total})`, el orden sección-después-de-habitaciones, el `fill` del chip…). **Tiene
las rutas escritas a mano dentro**: si añades pantallas nuevas, no las cubre — avísalo, no lo ignores.

### 8.4 Compilar, instalar y verificar por bytes
```powershell
# desde D:\egapp, en PowerShell, con la ventana de tiempo holgada
.\compilar-apk.ps1
```
- El veredicto es la línea **`BUILD SUCCESSFUL` en el texto**, no el código de salida.
- **Verificar la instalación por bytes:**
  ```bash
  RUTA=$(adb shell pm path <paquete> | tr -d '\r' | sed 's/^package://')
  adb shell ls -l "$RUTA"                      # bytes del base.apk EN EL MÓVIL
  stat -c '%s' ruta/local/app-release.apk      # bytes del APK COMPILADO
  ```
  Si coinciden, es el mismo fichero.
- `firstInstallTime` **igual** a `lastUpdateTime` = instalación nueva (sesión perdida).
- Guarda una copia del APK instalado: sirve de referencia la próxima vez.

### 8.5 Medir el píxel **y tocar**
1. **Arranque en frío antes de nada**, y **fuerza el principio del scroll**: la app **conserva la
   posición de scroll** de la visita anterior, así que la segunda medida sale desplazada cientos de
   píxeles y se lee como un cambio de diseño.
   ```bash
   adb shell am force-stop <paquete>
   adb shell am start -n <paquete>/<paquete>.MainActivity -a android.intent.action.VIEW -d '<url>'
   adb shell input swipe 540 800 540 1900 300    # ×2
   ```
2. **Volcado de jerarquía** para las **coordenadas** (`uiautomator dump`): el volcado **agrupa** nodos
   y **no lista todo lo visible**, así que sirve para saber *dónde* está algo, no para decidir *qué*
   hay en pantalla.
   ```bash
   MSYS_NO_PATHCONV=1 adb shell uiautomator dump /sdcard/_u.xml
   MSYS_NO_PATHCONV=1 adb pull /sdcard/_u.xml "D:/egapp/pruebas/_u.xml"    # ruta Windows a propósito
   ```
3. **Captura** para lo que se ve, comprobando el **tamaño** antes de medir (`exec-out screencap -p`
   puede truncar el PNG en silencio: se ha visto **16.768 B** donde cabían **877 KB**).
4. **Y el toque.** Se abre, se toca y se captura **en la misma orden**, y se lee el cambio que el
   toque **debe** producir (un resumen, un estado, el rótulo de un botón). **Un control que no cambia
   tras un toque es un hallazgo.**
5. **Mide «el mismo gesto», y déjalo escrito**: `input swipe 540 800 540 2000 300` es una medida, no
   un adorno. Sin el gesto en el acta, dos medidas no son comparables.

---

## 9. Las trampas ya pagadas (para no volver a pagarlas)

1. **El aislamiento del proceso tapa el USB:** `adb devices` devuelve la lista **vacía** aunque
   Windows tenga el móvil enlazado (`CompatibleIds` = `Class_FF&SubClass_42&Prot_01`,
   `Service = WINUSB`). **No es el cable ni la depuración:** es la forma de ejecutar. Las órdenes
   `adb` tienen que ir **sin aislamiento**. Y el **daemon muere entre invocaciones** → calentar,
   sondear y ejecutar **en una sola**.
2. **Un `catch` que devuelve vacío convierte un error del servidor en una pantalla que parece
   correcta.** El calendario de la ficha pedía 93 días y el servidor acepta 92: **400 siempre**; el
   `catch` lo leía como «este tipo no tiene datos», la lista de días quedaba vacía, cada día dejaba de
   ser seleccionable… **y en pantalla había un calendario perfecto que no respondía a ningún toque.**
   Regla: si una lista puede llegar vacía, la pantalla **tiene que decir que está vacía**; y cuando
   algo «no responde», **la primera sospecha es la petición, no el componente**.
3. **`input keyevent 4` NO cierra una hoja: la cierra Y ADEMÁS navega atrás** (se sale de la
   pantalla). Para cerrar una hoja **se toca su fondo**.
4. **El shell DEL MÓVIL parte la URL en el primer `&`**: la app recibe solo el primer parámetro **sin
   ningún aviso**. La URL va **entrecomillada para el shell del dispositivo**.
5. **El deep link no se sostiene**: minutos después la app ha vuelto a su ruta inicial y el toque cae
   en otra pantalla. **Abrir, capturar y tocar en la misma orden.**
6. **`curl` desde la máquina exige `--noproxy '*'`** y **sin aislamiento**: con el proxy del entorno
   sale `CONNECT tunnel failed, response 502`, que se lee como «el servidor está caído» y no lo está.
7. **El build muere a los 2 minutos** si `TEMP` está en el disco del sistema. Desviar `TEMP`/`TMP` a
   otro disco y **pasar un `timeout` explícito**. Si queda un bloqueo, **comprobar que no hay `java`
   vivo** antes de borrarlo.
8. **Los mensajes de commit van en fichero (`git commit -F`) y SIN acentos graves** (backticks): el
   shell los **ejecuta** y el commit se crea igual, con el texto destrozado.
9. **El framebuffer no está en sRGB** (es Display P3): un color saturado medido **no coincide** con el
   hex del código y eso **no prueba nada**. Se juzga **por diferencia** (el mismo elemento antes y
   después, con el mismo procedimiento) y se incluye siempre un **control gris** de token conocido:
   si ese cuadra, el lector es fiel.
10. **La app no avisa de que un dato no está:** si un campo llega `null`, se pinta la ausencia de
    forma explícita. **Nunca un `0` ni una cifra inventada.**

---

## 10. Lo que hay que devolver

1. **Los commits** en la rama, con mensaje en español y en fichero. **No hace falta empujar**: el
   dueño del producto empuja (falta credencial en esta máquina).
2. **La lista de ficheros** tocados, con **añadidas/borradas** por fichero (no solo nombres).
3. **El APK** compilado, con su **`sha256`**, su **tamaño en bytes** y una copia guardada en
   `pruebas/`. Y el `sha256` del que quedó **instalado en el teléfono**.
4. **Las capturas** de cada cambio en `pruebas/`, con nombres legibles.
5. **El acta en markdown** (`docs/…`), que distinga **tres cosas**:
   - **lo medido** (con el gesto, las coordenadas y el valor),
   - **lo no medido** y por qué,
   - **lo supuesto**.
   Y las decisiones nuevas que hayan hecho falta, con su motivo.
6. **El resultado de las tres puertas locales** (`tsc`, `npm run diseno`, `c1-verifica-app`), pegado
   tal cual: si el trinquete no se movió, hay que poder verlo.

**Definición de terminado, por pantalla:** decisión escrita y previsualización aprobada →
implementado con tokens → tres puertas en verde → `assembleRelease` → instalado y **verificado por
bytes** → **medido con el dedo** → acta. Si falta cualquiera de los siete, la pantalla **no está
terminada**.

---

## 11. El material de referencia que va con este encargo

| Qué | Dónde |
|---|---|
| **Las 30 fotos del recorrido de Meituan**, en orden de uso | `D:\egapp\pruebas\referencia-meituan\foto-01.jpg` … `foto-30.jpg` |
| **8 capturas en vivo** de Meituan, hechas desde el móvil contra la app real | `…\referencia-meituan\vivo-01.png` … `vivo-08-resenas.png` |
| El **itinerario con las decisiones** y las medidas ya hechas | `D:\egapp\docs\UI-HOTEL-PLAN-MEJORA.md` |
| Este encargo | `D:\egapp\docs\UI-HOTEL-ENCARGO.md` |

**Qué foto es cada tramo** (el orden **es** el recorrido: empezó buscando y terminó pagando):

| Tramo | Fotos | Pantallas |
|---|---|---|
| **A — «¿dónde y cuándo?»** | 1-8 | Buscador (ciudad, fechas, ocupación, **un solo botón**) · calendario con precio por noche y mínimo de estancia · hoja de huéspedes · tipos de estancia · búsqueda por categoría y zona |
| **B — «¿cuál de todos?»** | 9-14 | Lista de resultados (foto, nota, cita de reseña, distancia, beneficios, precio) · **orden y filtros como fila de controles con nombre** · radio de distancia con el % de gente que elige cada zona · doble deslizador de precio y estrellas · rail de todos los filtros · mapa con burbujas de precio |
| **C — «¿me quedo aquí?»** | 15-24 | Galería a pantalla completa con pestañas · datos y confianza (nota, reseñas, ranking) · instalaciones **con su regla y su precio** · políticas y precios tachados · reseñas con sub-notas y etiquetas · galería de la habitación |
| **D — «lo reservo»** | 25-30 | Detalle de habitación (planta, m², camas, ventana, humo, desayuno, **加床「no se puede añadir cama」**) · política de la habitación **en tabla de dos columnas por franja horaria** · desglose de promociones y **费用明细** · rellenar pedido con aviso de escasez · pago · **estado del pedido con la hora exacta de cancelación gratis** |

**Y esta es la lista de lo que Meituan resuelve con FORMA, no con dato** —o sea, **lo copiable ya**,
porque no necesita cupones, membresía ni 89 reseñas: buscar es una pantalla y solo una; fecha y
ocupación **en una línea**; **en la tarjeta, la foto manda** (tercio izquierdo, esquinas redondeadas) y
**el nombre no compite con el precio**; **el precio va solo con la cifra** (nunca «por noche · desde»
pegado al nombre); la nota se enseña **con su respaldo**; una **barra de pestañas pegajosa** en la
ficha; escasez y certeza dichas en la tarjeta; **la política deja de ser texto legal y pasa a ser un
dato** (tabla, y en el pedido la hora exacta); los filtros son **una fila de controles con nombre**;
**el mapa lleva el precio dentro**; la ficha **abre con la foto a pantalla completa**.

**Lo que NO se copia** (y por qué): el «gratis 15 min» es **otra política** de cancelación; los
**cupones, membresías y precios tachados** necesitan **datos que aquí no existen**; el **PMS del
hotelero** está fuera de alcance (el detalle está en `docs/UI-HOTEL-PLAN-MEJORA.md` §3 y §4, que
distingue lo que depende de datos inexistentes de lo que se decidió no copiar).

---

## 12. Una advertencia sobre el material de referencia

Las capturas de Meituan traen **datos que aquí no existen** (cupones, `白银会员`, `神券`, `89条`
reseñas, «高于90%同类酒店», precios tachados). **No se maqueta un hueco vacío para que algún día
llegue ese dato**: si no hay dato, la fila **no existe**. Lo que se copia es **la forma**, no la
cantidad de información.

Y al contrario: **hay datos que YA viajan en la respuesta y no se están pintando** (§6.2). Eso es
dinero en la mesa: mirar el contrato **antes** de pedir campos nuevos al backend.
