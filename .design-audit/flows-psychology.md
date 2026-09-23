# EG Route Plan — Auditoría de flujos UX y psicología del usuario

**Tipo de auditoría:** solo fuente (lectura de código con `grep`/`read`). **No** se ha ejecutado la app, no hay dispositivo ni navegador.
**Fecha:** sesión de auditoría sobre el árbol `D:\egapp`.
**Regla de honestidad:** todo lo que sigue está anclado en `archivo:línea`. Lo que **no** se puede determinar leyendo el código (comportamiento real del backend, qué ve el usuario en pantalla en tiempo de ejecución, si un diálogo del sistema aparece antes o después de un render) se marca explícitamente como **no verificable en fuente**.

**Recuento verificado del alcance**

| Métrica | Valor | Cómo se obtuvo |
|---|---|---|
| Pantallas `.tsx` en `app/` | 114 (incluye `_layout`, `+not-found` y 7 rutas dinámicas `[id].tsx`) | recuento de ficheros |
| Componentes `.tsx` en `components/` | 74 | recuento de ficheros |
| Archivos con lógica `length === 0` | **71** (52 pantallas + 19 componentes) | `Select-String -List` |
| Pantallas detrás de `AuthGate` | **61** | `Select-String '<AuthGate>'` |
| Cliente de API | 40 ficheros en `api/` | listado |

> Nota sobre el encargo: se pedía "103 pantallas" y "unos 68 archivos" con `length === 0`. El recuento real en el árbol auditado es **114** y **71**. La diferencia es de recuento, no de criterio.

---

## 1. MAPA DE NAVEGACIÓN

### 1.0 La portada real no es la portada que parece

El mapa (`app/index.tsx`) **no** es la primera pantalla que ve el usuario. En `app/_layout.tsx` hay un redireccionamiento de arranque:

- `app/_layout.tsx:76-86` — un `setTimeout` de 400 ms que llama a `router.replace('/lifebook')` (`:83`), salvo que la app se haya abierto por enlace (`abrioPorEnlace()`, `:58-68`).
- `app/lifebook.tsx:195-201` — la pantalla de Life Book está envuelta en `<AuthGate>`.
- `core/AuthGate.tsx:19-23` — sin sesión, `router.replace('/auth')`.

**Consecuencia (deducida del código, no ejecutada):** un usuario nuevo abre la app y a los 400 ms aterriza en **«Bienvenido · Términos de uso»**, no en el mapa. El mapa de la Home es una pantalla secundaria a la que se llega desde el dock (`components/FloatingFooter.tsx:25-31`, pestaña central «Inicio»). Esto condiciona **todos** los conteos de pasos de abajo: para un usuario nuevo, «desde la portada» significa «desde la pantalla de términos».

Árbol de flujos principales (nodos = archivos de `app/`, flechas = `router.push`/`replace` verificados):

```
ARRANQUE
└─ (400 ms, _layout.tsx:83) → /lifebook ──AuthGate──► /auth  [TÉRMINOS]
                                   │
        ┌──────────────────────────┴───────────────────────────┐
        │                                                      │
   DOCK INFERIOR (FloatingFooter, solo en 7 pantallas)     SERVICIOS (Home, ServiceGrid)
   ├─ Life Book  → /lifebook                               ├─ Llamar Taxi      → /taxi
   ├─ Llamar Taxi→ /taxi                                   ├─ Ciudad a Ciudad  → /intercity
   ├─ Inicio     → (solo colapsa la hoja, index.tsx:168)   ├─ Ser Conductor    → /conductor-hub
   ├─ Mensajes   → /lifebook-messages                      ├─ Reservar Coche   → /reserva
   └─ Perfil     → /profile                                ├─ Comida Rápida    → /food
                                                           ├─ Mercado          → /ecomerse
                                                           ├─ Buscar Alquiler  → /alquiler
                                                           ├─ Buscar Work      → /work
                                                           ├─ Monedero         → /wallet  ⚠ NO EXISTE
                                                           ├─ Hoteles          → /lifebook-hotel
                                                           ├─ Mudanza/Paquete  → deshabilitados
                                                           └─ Emergencia       → abre modal (no navega)
```

### 1.1 Flujos y número de pasos

Convención: **1 paso = 1 pantalla o 1 confirmación explícita distinta**.

| Flujo | Ruta de pantallas (archivo:línea del salto) | Pasos desde arranque en frío | Pasos desde la Home | Termina en |
|---|---|---|---|---|
| **Alta de cuenta (nuevo)** | Términos `auth.tsx:142-157` → Teléfono `:159-185` → OTP `:187-197` → *(Contraseña `:199-211`, ver defecto 1.2)* | **3 pasos efectivos** (+1 inalcanzable) | — | `router.replace('/')` → Home |
| **Login (cuenta existente)** | `auth.tsx:213-231` (teléfono + contraseña en una pantalla) | 1 paso | 1 paso | Home (por el mismo defecto 1.2) |
| **KYC / verificación de identidad** | `/kyc` `kyc/index.tsx` → `/kyc/capture` `:78-81` → `/kyc/liveness` (`kyc/status.tsx:112-115`) → `/kyc/status` (`kyc/capture.tsx:74`) | **4 pasos… pero sin puerta de entrada** (ver 1.3) | inalcanzable | `/wallet` (ruta inexistente) |
| **Taxi** | Home/dock → `/taxi` → destino (mapa `index.tsx:97-105` o `/buscar`) → modalidad+presupuesto+pasajeros (`taxi.tsx:1585-1733`) → «Confirmar taxi · X XAF» (`:1777`) → búsqueda → precio propuesto por el conductor → **PIN** (`:1900-1946`) → viaje → «Confirmar llegada y cerrar» (`:1486`) → puntuar (`:1760`) | 4 pasos hasta pedir; **8-9** hasta cerrar y puntuar | 3 hasta pedir | `router.replace('/')` (`:1765`) |
| **Comida rápida** | `/food` (`data.ts:34`) → `/food-menu?id=` (`food.tsx:258`) → `/food-checkout?restaurantId=` (`food-menu.tsx:177`) → PIN si monedero (`food-checkout.tsx:543-555`) → `/food-orders` o `/billing-checkout` (`:210-212`) | 4 pasos (+1 si paga con monedero) | 3 | `/food-orders` |
| **Life Book (comprar)** | `/lifebook` → `/lifebook-product/[id]` → `/lifebook-carrito` → `/lifebook-carrito-checkout` → `/lifebook-order/[id]` | 5 | 4 | `/lifebook-order/[id]` |
| **Life Book (publicar/vender)** | `/lifebook-sell` wizard de **6 pasos** (`state/commercePublish.ts:115-122`), **5 si ya tiene tienda abierta** (`:116`); es el único flujo **de publicación** con indicador de progreso (`lifebook-sell.tsx:256-261`) | 6 | 6 | vuelta al feed |
| **Hotel** | `/lifebook-hotel` (ciudad+fechas+huéspedes) → `/lifebook-hotel-resultados` (`lifebook-hotel.tsx:127`) → `/lifebook-hotel-detalle` → `/lifebook-hotel-reservar` (`resultados:126-137`) → transferencia + pegar referencia (`lifebook-hotel-reserva.tsx:318`) → `/lifebook-hotel-reservas` | 5-6 pasos + **pago manual fuera de la app** | 5 | `/lifebook-hotel-reservas` |
| **Monedero (recargar)** | `/monedero` → `/monedero-recargar` (`monedero.tsx:151`) → importe + agente (`:120-163`) → **alta de PIN si es la primera vez** (`:182-194`) → OTP para enseñar al agente (`:102-117`) | 4 pasos + **encuentro físico con el agente** | **0: sin entrada funcional** (ver 1.3) | `/monedero` (back) |
| **Monedero (retirar)** | `/monedero-retirar` (`monedero.tsx:160`) → importe + agente + **motivo AML ≥10 caracteres** (`:171-179`) → PIN → OTP que se da al agente a cambio del efectivo (`:107-123`) | 4 pasos + encuentro físico | 0 | `/monedero` (back) |
| **Conductor (alta)** | `/conductor-hub` → `/driver-onboarding` (`conductor-hub.tsx:127`) → `/conductor` (`conductor.tsx:1118` invita al alta si no está verificado); el asistente **sí** marca progreso por categorías de documentos («Paso N de M») | 2 pantallas + **≥7 fotos** (licencia f/r, DIP, selfie `driver-onboarding.tsx:410`, foto real del coche `:320`, color `:299`), con el recuento exacto fijado por el servidor (`api/driver.ts:66`); progreso en `driver-onboarding.tsx:254-265`. Al ponerse en línea se pide **una segunda selfie** (`conductor.tsx:1306`, `:1131`) | 2 | `/conductor` |
| **Repartidor / restaurante** | `/food` → `/food-rider` o `/food-owner` (`food.tsx:164,167`), con selector de rol previo (`constants/roles.ts:25-29`, `ServiceGrid.tsx:55-65`); KYC incompleto → `/driver-onboarding` (`food-owner.tsx:457-459` **antes** de rellenar, `food-rider.tsx:284-286`) | 2 | 2 (repartidor: 1 formulario, 0 documentos; restaurante: nombre + ciudad) | panel propio |
| **Agente de efectivo** | `/agente` (AuthGate), al que solo se llega desde Perfil → cajón ☰ → «Panel de agente», y esa fila **solo aparece si el servidor confirma perfil ACTIVE** (`ServicesDrawer.tsx:190-198`, `core/useSoyAgente.ts:39`) → `/agente-escaner?orderId=&paso=` (`agente.tsx:220`) | 2 pantallas, 0 formularios, 0 documentos | 2 | panel del agente |

### 1.2 Defecto grave de flujo: el alta de cuenta se corta sola en el paso 3

- `app/auth.tsx:36-39`:
  ```ts
  useEffect(() => {
    if (isAuthenticated) router.replace('/');
  }, [isAuthenticated]);
  ```
- `app/auth.tsx:84-95` (`submitOtp`): al verificar el OTP se llama a `sessionLogin(...)` (`:89`) **y solo después** `setMode('password')` (`:90`).
- `sessionLogin` → `state/session.tsx:159-168` fija el `refreshToken` → `isAuthenticated` pasa a `true` (`:182`).

**Efecto (deducido del código; no ejecutado):** en cuanto el OTP es válido, el efecto de `auth.tsx:36-39` lanza `router.replace('/')` y **la pantalla «Crea tu contraseña» (`auth.tsx:199-211`) queda sustituida antes de poder usarse**. El alta real son 3 pasos y la cuenta se queda **sin contraseña**, aunque la app promete en `auth.tsx:150` que «Tu teléfono será la clave de tu cuenta». Consecuencias en cadena:
- `authApi.setPassword` (`api/auth.ts:107`, llamado solo desde `auth.tsx:102`) no llega a ejecutarse en el alta normal.
- El camino de login (`auth.tsx:110-120`) exige `pwdOk` (≥6 caracteres, `:49`): ese usuario no tiene contraseña que meter.
- La única vía de reentrada documentada es el rebote `PHONE_TAKEN → resendOtp` (`auth.tsx:72-76`), que reintroduce al usuario por OTP. **No hay pantalla de «he olvidado mi contraseña»** en toda la app (0 coincidencias de *olvid* en `app/`).
- `done()` (`auth.tsx:59`, `router.back()`) es código casi muerto: en el alta y en el login, el `replace('/')` del efecto compite con el `back()`.

### 1.3 Callejones sin salida y rutas fantasma (verificados)

| # | Callejón | Evidencia | Qué ve el usuario |
|---|---|---|---|
| 1 | **«Monedero» de la Home lleva a una ruta que no existe.** El chip vive en el bloque «Más servicios» (`components/ServiceGrid.tsx:37-42,160-191`) y apunta a `/wallet` (`constants/data.ts:33`). No existe `app/wallet.tsx` (`glob` de `wallet*` = 0 ficheros). | `constants/data.ts:33`, `ServiceGrid.tsx:53` | La pantalla de respaldo «No pudimos abrir esa pantalla» **y el destino técnico en crudo**: «Destino: /wallet» (`app/ruta-fallida.tsx:36-48`) |
| 2 | **El mapa de rutas declara la ruta fantasma**, así que el guardián **no** la detecta: `constants/rutas.ts:131` `wallet: { ruta: '/wallet' }`. `problemaDeRuta` (`:153-164`) solo comprueba que la ruta esté en el mapa, no que la pantalla exista. | `rutas.ts:131`, `:153-164` | Falsa sensación de seguridad del sistema de navegación |
| 3 | **`/wallet` también está registrada como pantalla del Stack raíz**: `app/_layout.tsx:128` `<Stack.Screen name="wallet" …>`. | `_layout.tsx:128` | Registro de una pantalla inexistente |
| 4 | **El KYC termina en la ruta fantasma**: «Ir al monedero» hace `router.replace('/wallet')`. | `kyc/index.tsx:104`, `kyc/status.tsx:85` | Tras verificar la identidad (4 pasos, fotos y prueba de vida), el usuario acaba en la pantalla de error |
| 5 | **El flujo KYC no tiene puerta de entrada.** No hay **ninguna** navegación a `/kyc` en el código activo: solo `kyc/*` se llama entre sí. | `grep "'/kyc"` → solo `kyc/` y un respaldo (`respaldo/wallet-webview-20260917.tsx.txt:111`) | 4 pantallas huérfanas |
| 6 | **El dinero exige KYC pero no dice dónde hacerlo.** Recargar/retirar detectan `KYC_REQUIRED` y pintan solo texto, sin botón. | `monedero-recargar.tsx:75-80`, `monedero-retirar.tsx:80-85` | «…» en rojo tras haber elegido importe, agente y PIN; sin salida |
| 7 | **Los CTA «Verificar identidad» no llevan al KYC**, llevan al alta de **conductor**. | `ecomerse-seller.tsx:143,283`, `food-owner.tsx:459`, `food-rider.tsx:286` → todos `router.push('/driver-onboarding')` | El vendedor/repartidor recibe un formulario de licencia de conducir, DIP y selfie |
| 8 | **La emergencia está detrás de login.** `/emergencia` está envuelta en `AuthGate`. | `emergencia.tsx:27-32` | Sin cuenta, tocar emergencia lleva a «Términos de uso» antes de poder llamar al 114. *(Mitigación real: el modal `EmergencyModal` de la portada sí es público — `index.tsx:259` — y la rejilla de servicios nunca navega a `/emergencia`, `ServiceGrid.tsx:69`. Es decir: la pantalla de emergencia existe y es inalcanzable e inútil.)* |
| 9 | **`/scanner` es un stub confeso** y se llega a él desde la Home en 2 toques. | `components/MapTools.tsx:55-62` → `app/scanner.tsx:27-30` | «Escáner de documentos … (Implementación con expo-camera + OCR en la siguiente iteración.)» |
| 10 | **El monedero no tiene entrada desde la portada.** El dock ya no tiene pestaña Monedero (`FloatingFooter.tsx:25-31`, y el comentario `:22-24` lo dice: «Monedero fuera, vive en "Más servicios"»), pero ese chip es el roto del punto 1. La rama `if (next === 'monedero')` de la Home es **código muerto**. | `index.tsx:166` vs `FloatingFooter.tsx:25-31` | Solo se entra al monedero por `documents.tsx:114` (documentos del conductor) o por enlaces internos (`monedero.tsx:151,160,172,183`) |
| 11 | **Pantallas de KYC sin salida.** Ni `kyc/capture.tsx` ni `kyc/liveness.tsx` contienen `router.back()`, `ArrowLeft` ni `ir.atras`. | verificado por barrido de los 114 ficheros | En un KYC que además no tiene puerta de entrada: la única salida es el botón físico del sistema |
| 12 | **Estados vacíos que no llevan a ninguna parte** (muro sin acción). | `lifebook-inbox.tsx:169-176` «Nada por aquí todavía» | El usuario no sabe qué es, por qué está vacío ni qué hacer |
| 13 | **Soporte inexistente al que remiten los flujos de dinero.** Las pantallas de dinero mandan a «contacta soporte»… y no hay soporte: tres entradas de Ajustes responden con un `Alert` de «Próximamente». | remiten: `billing-status.tsx:137,145`, `kyc/status.tsx:101` · no existe: `settings.tsx:252-254` | «Contacta soporte para el reembolso» sin canal, teléfono ni chat |
| 14 | **Cámara denegada en el escáner del agente = el dinero no se libera.** No hay entrada manual del código. | `agente-escaner.tsx:37` (permiso), `:49-51` (el paso cierra la entrega), `:92-99` (mensaje + botón) | La app explica bien el permiso («Para leer el código hace falta la cámara», `:96`) pero **no ofrece alternativa**: el recado no se cierra y la entrega no libera el pago |
| 15 | **El alta de conductor se queda en blanco si falla la carga, sin reintento.** | `driver-onboarding.tsx:92-93` (`catch`), `:382` (solo texto del error) | El conductor ve el error al pie, sin documentos y sin botón: hay que salir y volver a entrar |
| 16 | **El panel del agente no tiene puerta de rol.** No hay pantalla que diga «no eres agente»: si el endpoint devuelve vacío en vez de error, se muestra «Sin trabajo pendiente». | `agente.tsx:35` (AuthGate), `:145` (texto del vacío) | Un usuario cualquiera puede interpretar que es agente sin trabajo. *(La entrada al panel sí está condicionada en el menú: `ServicesDrawer.tsx:190-198` con `core/useSoyAgente.ts:39`; el comportamiento del endpoint vacío es **no verificable en fuente**)* |

**Nota de simetría:** el sistema de navegación tiene piezas buenas y hechas a propósito (`constants/rutas.ts`, `ruta-fallida.tsx`, `+not-found.tsx:13`, la protección de enlaces de arranque en `_layout.tsx:58-81`). El problema no es que falte el mecanismo: es que **el mapa de rutas se escribió a mano y contiene una ruta sin pantalla** (`rutas.ts:131`), lo que anula la única comprobación que había.

---

## 2. FRICCIÓN: DÓNDE SE INTERRUMPE AL USUARIO

Ordenado por gravedad en flujos de **DINERO**.

| # | Interrupción | Dónde (archivo:línea) | Momento exacto del flujo | Qué pierde el usuario si abandona |
|---|---|---|---|---|
| F1 | **Autenticación que se lleva por delante el destino.** `AuthGate` hace `router.replace('/auth')`; al autenticarse, `auth.tsx:36-39` hace `router.replace('/')`. | `core/AuthGate.tsx:19-23` + `auth.tsx:36-39` | Al abrir **cualquiera** de las 61 pantallas protegidas sin sesión: monedero, carrito, checkout de Life Book, checkout de hotel, pedidos, panel del hotelero | El intento («quiero ver mi monedero») y el contexto: acaba en el mapa de la Home. En `reserva.tsx:111` y `taxi.tsx:854` se usa `push`, así que la pantalla sigue viva debajo; en el `AuthGate` es un **`replace`**: la pantalla pedida desaparece del stack |
| F2 | **El PIN se pide (y a veces se crea) al final del checkout**, justo antes de pagar. | `monedero-recargar.tsx:182-194`, `monedero-retirar.tsx:203-215`, `food-checkout.tsx:543-555`, `ecomerse-checkout.tsx:445-450`, `lifebook-checkout.tsx:520-529`, `taxi.tsx:1900-1946` | Después de elegir importe, agente, dirección, zona de entrega o presupuesto | Nada se cobra (el token se emite después), pero **nadie se lo dice**: el único texto de la hoja es un botón «Volver» (`components/PinSheet.tsx:87`). El usuario no sabe si cerrar cancela el pedido o no |
| F3 | **Alta de PIN disfrazada de error de PIN.** Si el primer intento falla, el sistema asume «es tu primera vez» y pide **la contraseña de la cuenta** en la misma hoja. | `monedero-recargar.tsx:81-84`, `monedero-retirar.tsx:86-89`, `food-checkout.tsx:218-221`, `ecomerse-checkout.tsx:191-194`, `lifebook-checkout.tsx:232-235`, `taxi.tsx:820-822` | En el primer fallo de PIN (que puede ser simplemente un dígito mal tecleado) | El usuario que ya tenía PIN ve el mensaje «Si es tu primera vez: escribe tu contraseña y elige tu PIN de 6 dígitos» y **puede reescribir su PIN** (`api/settlement.ts:55-59` `fijarPin`), es decir, cambiarlo sin saberlo. Confusión + riesgo de seguridad |
| F4 | **La comisión de retirada se enseña DESPUÉS de confirmar.** El `fee` se guarda al crear la operación y solo se pinta en la pantalla del OTP. | `monedero-retirar.tsx:76` (se recibe) y `:116-120` (se muestra) | Tras elegir importe + agente + motivo + PIN | El usuario confirma sin saber cuánto **neto** va a recibir en efectivo. Es el hueco de transparencia más caro de toda la app |
| F5 | **Justificación AML de mínimo 10 caracteres en medio del flujo.** | `monedero-retirar.tsx:65` (`justOk`), `:171-179` (campo), `:192` (mensaje) | Entre elegir agente y el PIN | El motivo legal aparece como un campo obligatorio sin explicación («Motivo de la retirada», placeholder «Ej.: gastos de la semana»). La razón real (AML) solo existe en el comentario de cabecera (`:4-5`): el usuario lee un capricho de la app |
| F6 | **Datos personales sensibles a mitad de la reserva interurbana.** Tipo y número de documento, dirección de recogida, teléfono, tutor para menores. | `intercity.tsx:314-316` (documento), `:336` (dirección), `:322-323` (tutor) | Después de elegir viaje y tipo de reserva, antes de pagar | Solo dos campos llevan contexto (`:310` para el reparto comprador/viajero, `:320-323` marcan el tutor). Del DNI/pasaporte y del domicilio **no se dice para qué ni quién los ve** (0 textos de finalidad en el archivo) |
| F7 | **Permiso de ubicación al abrir la pantalla del taxi**, no al usar la ubicación. | `taxi.tsx:385-391` (`requestForegroundPermissionsAsync` dentro de un `useEffect` de montaje) | Al entrar en `/taxi` desde el dock o la Home, antes de que el usuario diga nada | Si concede: bien. Si deniega: el origen pasa a ser la ciudad con un aviso (`:383`) — funciona, pero el diálogo salta en la pantalla de mayor tráfico sin contexto previo. Contraste: la Home solo pide permiso al tocar «Ubicarme ahora» (`api/locate.ts:66-80`) y Life Book al cambiar el radio (`lifebook.tsx:282-295`) |
| F8 | **Sesión caducada en silencio.** El `401` irrecuperable borra los tokens sin un solo mensaje. | `api/httpClient.ts:182-185` → `state/session.tsx:93-99` (`onAuthLost`) | En cualquier petición, en medio de cualquier pantalla | El usuario ve una lista vacía o un error genérico y, más tarde, un salto a la pantalla de términos. **Nunca se le dice «tu sesión ha caducado, vuelve a entrar»**. Agravante: al no existir «he olvidado mi contraseña», el camino de vuelta depende del OTP |
| F9 | **El plan de pago corta la publicación.** Al pulsar «Publicar», si la cuota está agotada, se redirige a los planes: **el botón dice «Publicar anuncio» y lleva a otra pantalla**. | `alquiler-publicar.tsx:523`, **`ecomerse-seller.tsx:182-187` con el botón además desactivado por cupo (`:425`)**, `intercity-publish.tsx:181,529,542` (allí el CTA queda muerto: «Límite de plan alcanzado», `:542`); el caso peor: `work-publish.tsx:250-252` avisa en un banner pero **deja el botón activo** (`:362`) y el rechazo llega después de rellenar todo; el cobro del destacado llega **después** de publicar (`:156`) | Al final del formulario largo | 20-40 decisiones escritas y **ningún borrador guardado** en ningún flujo de publicación: el estado del asistente vive en un store zustand sin middleware `persist` (`state/commercePublish.ts:348`; 0 coincidencias de `persist` en el archivo) y 8 de los 9 flujos no avisan al salir. Solo `work-publish.tsx:100-114` avisa («Tienes una oferta a medio completar. Si sales, perderás lo escrito», `:106`), y su opción «Descartar y salir» (`:109`, `style: 'destructive'`) borra todo: avisa pero no protege. El repo **sí** tiene el patrón de borrador real, pero vive en un buscador y no en un formulario de publicación: `alquiler.tsx:44` (`const [draft, setDraft] = useState<PropertyFilters \| null>(null)`) guarda el borrador de los filtros y lo descarta explícitamente con `cancelDraft` (`:61`). El único formulario de alta que protege de verdad los datos escritos es `food-owner.tsx:153-165` (aviso «Tienes cambios sin guardar en tu restaurante», `:159`, con back de Android en `:165`) |
| F10 | **Fricción deliberada en el contacto del trabajo.** Para ver el teléfono del reclutador hay que postularse. | `work-detail.tsx:118-131` | Al tocar «Llamar»/WhatsApp en una oferta | Está **bien explicada** («Para ver el teléfono y escribirle, primero envía tu postulación (gratis)», `:124`): es el mejor ejemplo de fricción con motivo declarado en toda la app |
| F11 | **Comprobante de transferencia tras crear la orden** (monto pagado, referencia, foto). | `billing-checkout.tsx:382-404` | Después de confirmar la compra | Se piden tres datos sin explicar que sirven para casar la transferencia, ni se dice a **quién** se transfiere (`:349` «Paga por transferencia u Orange Money»: sin destinatario ni cuenta) |
| F12 | **Rechazo de precio por platos agotados o mínimo de reparto** — resuelto antes de enviar (bueno). | `food-checkout.tsx:313-322` (platos), `:343-352` (mínimo) | Antes de confirmar | Aquí **no** pierde nada: es el patrón correcto y se cita en §3/§4 como referencia |
| F13 | **El error de validación se pinta al pie de un scroll largo, sin marcar el campo culpable.** | `work-publish.tsx:361`, `alquiler-publicar.tsx:520` | Al pulsar «Publicar» con un formulario de 33 o 20+ controles ya relleno | El usuario lee un texto rojo al final y tiene que **buscar a mano** qué campo falla, en una pantalla que ya no cabe. Contraste: `lifebook-sell.tsx:265` pinta el error junto al paso y `:157` **salta al paso culpable** (`setStep('details')`). El error debería estar en el campo |
| F14 | **Permisos del lado oferta, tratados de forma desigual**: cámara con explicación pero sin salida (escáner del agente), cámara sin justificar (foto del restaurante) y ubicación que nunca se pide (conductor) | `agente-escaner.tsx:92-99`; `food-owner.tsx:211,491`; `api/locate.ts:44-59` (no pide permiso) vs `:66-68` (sí lo pide, y solo se usa en el lado pasajero: `index.tsx:121`, `taxi.tsx:670`) | Al abrir el escáner, al añadir la foto del local y durante todo el viaje del conductor | El agente no cierra el paso ni libera el dinero (`agente-escaner.tsx:49-51`); el conductor **nunca sabe que navega con una posición simulada a 45 km/h** (`conductor.tsx:791-804`). Contraste bueno: el repartidor sí tiene salida («Puedes escribir el punto de encuentro sin ella», `food-rider.tsx:202`) |

---

## 3. ESTADOS VACÍOS Y DE ERROR

Muestra de 15 archivos de los 71 con `length === 0`. Criterio: **ACCIÓN** (dice qué hacer y ofrece un camino), **NEUTRO** (explica la situación, sin CTA), **MURO** (solo niega).

| Archivo | Vacío (archivo:línea) | Texto literal | Tipo | Error con reintento |
|---|---|---|---|---|
| `monedero-movimientos.tsx` | `:113` (texto `:115`) | «No hay movimientos de este tipo.» | MURO | Sí — `:103-109`, botón «Reintentar» `:106-108` |
| `trips-history.tsx` | `:78` (texto `:80`) | «Todavía no tienes viajes registrados.» / «Cuando completes o canceles un taxi aparecerá aquí.» | NEUTRO | Sí — `:66-72` |
| `my-tickets.tsx` | `:61` (texto `:65`) | «No tienes tickets todavía.» / «Reserva un asiento en Ciudad a Ciudad para verlos aquí.» | **ACCIÓN** — CTA «Buscar viajes» `:67` | **No** — error en `:59` sin botón |
| `ecomerse-orders.tsx` | `:182-189` | «Aún no tienes ventas» / «Todavía no has comprado» + «Explora el mercado y compra con garantía si pagas por la app.» | **ACCIÓN** — CTA `:191-193` | Sí — `:165-174` |
| `ecomerse-favorites.tsx` | `:154-161` | «Todavía no has comprado nada» / «Toca el ❤️ de un producto para guardarlo aquí.» | NEUTRO (instrucción exacta) | Sí — `:143-153` |
| `food-orders.tsx` | `:362-371` + variante por filtro `:353-361` | «Aún no recibes pedidos» / «Todavía no has pedido» + «Elige un restaurante y pide para recoger o recibir en casa.» | **ACCIÓN** — `:373-381` y «Ver todos» `:358-360` | Sí — `:344-352` |
| `lifebook-orders.tsx` | `:153-160` | «Aún no has comprado nada.» / «Aún no tienes ventas.» | NEUTRO | **No**: `catch { setOrders([]) }` en `:46` → el fallo de red se disfraza de vacío |
| `lifebook-guardados.tsx` | `:110-115` | «Todavía no has guardado nada» + «Lo que guardes con el corazón de un producto aparece aquí…» | **ACCIÓN** — `:118` «Ver el catálogo» | Parcial: `:75-83` solo ofrece «Volver» |
| `lifebook-inbox.tsx` | `:169-176` | «Nada por aquí todavía» | **MURO** | Sí — `:142-148` |
| `lifebook-vistos.tsx` | `:136-143` | «Todavía no has mirado nada» + «Cuando abras la ficha de un producto aparecerá aquí…» | **ACCIÓN** — `:145` | **No**: el error se pinta dentro del vacío (`:140`, `:143`) y el botón va al catálogo, no reintenta |
| `work-panel.tsx` | `:304-311` (y segundo vacío `:261-270`) | «Todavía no has publicado ninguna oferta» + «Una oferta es lo que ve quien busca trabajo: el puesto, lo que se pide, el salario y la ciudad…» | **ACCIÓN** — `:314` «Publicar una oferta» | Sí — `:158-162` |
| `lifebook-hotel-reservas.tsx` | `:233-236` | «Todavía no has reservado ninguna estancia.» / «Tu hotel no tiene reservas todavía.» | ACCIÓN en huésped (`:239-241`) / NEUTRO en hotelero | Sí — `:197-204` |
| `lifebook-messages.tsx` | `:262-272` | «No tienes mensajes sin leer.» / «Aún no tienes conversaciones» + «Entra en un perfil o una publicación y toca "Mensaje" para empezar a hablar.» | NEUTRO (indica el camino) | Sí — `:235-241` |
| `profile.tsx` | `:444-452` | «Aquí verás lo que guardes» / «Aún no tienes ventas» / «Aún no has publicado nada» | **ACCIÓN** — `:455` «Publicar», `:458` «Vender» | **No**: `catch(() => {})` en `:116` y `.catch(() => setLbPosts([]))` en `:144,:152` |
| `lifebook-catalog.tsx` | `:261-266` | «Todavía no hay nada publicado aquí» + «Abre tu tienda y publica tu primer producto o servicio: es gratis y se hace desde el móvil.» | **ACCIÓN** — `:268-270` | **No**: `catch { … setItems([]) }` en `:76-77` |

**Conclusión del apartado**
- El patrón de **reintento** está resuelto en 11 de 15 (y muy bien en los listados: `food.tsx:223-239` y `:243-246` incluso tiene reintento separado para la paginación).
- El punto débil **sistemático** es el vacío: los mejores explican el estado y dan CTA; los peores nacen de un `catch` que vacía la lista, con lo que **«no hay nada» y «no cargó» son indistinguibles** y no hay forma de reintentar.
- Buenos: `ecomerse-orders.tsx:182-194` (vacío distinto por pestaña + error con reintento), `profile.tsx:444-463` (vacío por pestaña + dos CTA reales), `food-orders.tsx:353-383` (separa «sin pedidos en este estado» de «no hay pedidos»).
- Malos: `lifebook-catalog.tsx:76-77` + `:264`, `lifebook-orders.tsx:46` + `:157`, `lifebook-inbox.tsx:176`, y en el lado oferta `driver-onboarding.tsx:92-93` + `:382` (fallo de carga que deja el alta en blanco, sin reintento) y `agente.tsx:145` («Sin trabajo pendiente» como vacío ambiguo: no distingue «no eres agente» de «no hay tareas»).

---

## 4. PSICOLOGÍA Y CONFIANZA

### 4.1 Lo que sí construye confianza (evidencia literal)

| Señal | Dónde | Texto / dato |
|---|---|---|
| Precio bloqueado y visible antes de confirmar, **con la comisión desglosada** | `taxi.tsx:1420-1429` | «Comisión EG (Malabo) · al conductor X XAF» + botón «Confirmar precio y pagar · X XAF» |
| Ventana de cancelación gratis con cuenta atrás real | `taxi.tsx:1448-1454` | «Tienes N min para cancelarlo sin coste; después, cuota de absentismo.» |
| Contraparte identificada y contactable en el viaje | `taxi.tsx:1506-1556` | Nombre, modelo, placa, foto, botones «📞 Llamar» y «WhatsApp» |
| Cierre con disputa y plazo | `taxi.tsx:1487-1494`, `:1753-1755` | «Sin tu confirmación se cerrará solo en N min… ¿Ha habido un problema? **Disputar**» / «¿Problemas con el viaje? Disputar (hasta 7 días)» |
| Retención real explicada en comida | `food-checkout.tsx:505` | «Confirmas con tu PIN y el importe queda en garantía hasta que recibas el pedido.» |
| Saldo comparado con el importe antes de pagar | `food-checkout.tsx:507-511` | «Tienes X XAF · **no llega**» |
| Cambio de precio del restaurante, con las dos cifras y el plato | `food-checkout.tsx:324-337` | «El restaurante cambió algún precio» + «Plato: X → **Y**» |
| Comisiones explicadas (y a quién se le cobran) | `food-checkout.tsx:388-391` | «El reparto es gratis para ti. Las comisiones de la plataforma y del reparto las paga el restaurante: van incluidas en estos precios, no se te suman.» |
| Pago en efectivo con aviso de ausencia de garantía | `ecomerse-checkout.tsx:326` | «Pagas al agente al recibir. EG Route Plan no retiene el dinero; la garantía de 7 días aplica solo con pago Billing.» |
| Señal / resto y retención de habitación, con desglose completo | `lifebook-hotel-reservar.tsx:531-540`, `:547-548` | «Pagas AHORA (señal 30 %) / Pagas al llegar» + «la habitación queda retenida N minutos mientras pagas la señal. Si no se paga, se libera sola.» |
| Política de cancelación del hotel heredada en el pago | `lifebook-hotel-reservar.tsx:412` | «Cancelación: {room.cancellationPolicy}» |
| Código de entrega con instrucción de seguridad | `lifebook-order/[id].tsx:362,366` | «Lee este código a quien te entregue y paga en efectivo» / «La tienda lo confirma y el pedido queda entregado y cobrado.» |
| Contraparte nombrada y canal de contacto | `lifebook-order/[id].tsx:335,337,660` | «Compra en {tienda}» / «Compra de {comprador}» / «Escribir a la tienda» |
| Instrucción anti-fraude en la retirada | `monedero-retirar.tsx:110-114` | «Da este código al agente **SOLO cuando te entregue el efectivo**» |
| Límite diario visible antes de operar | `monedero.tsx:139-144`, `monedero-recargar.tsx:132-134`, `monedero-retirar.tsx:138-140` | «Hoy puedes recargar X · retirar Y» |

### 4.2 Ausencias de confianza (evidencia literal)

| Hueco | Dónde | Qué falta |
|---|---|---|
| **Comisión de retirada después de decidir** | `monedero-retirar.tsx:116-120` | La tarifa solo se muestra en la pantalla del OTP. Antes de confirmar no hay neto ni comisión |
| **El agente de efectivo no es una persona identificable** | `monedero-recargar.tsx:158-159`, `monedero-retirar.tsx:164-165` | Solo «{nombre} · {código} · {zona}». **Sin teléfono, sin dirección, sin horario, sin distancia**. El usuario debe entregar/recibir efectivo de alguien a quien no puede llamar ni localizar |
| **Precio simulado presentado como precio** | `reserva.tsx:52` y `:94-95` | `estimate(km) = 2000 + 200·km`, y `routeKm` se calcula **a partir de la longitud del texto escrito**: `setRouteKm(Math.round(5 + (t.length % 4) * 2 + (dest.length % 3)))`. Se rotula «Precio estimado por algoritmo» (`:346`) y se mete en el botón «Confirmar · X XAF» (`:421`), con un icono «Seguro» (`:181-182`) que no respalda nada. Este es el hallazgo de confianza más grave de la app: **un precio que no depende de la ruta** |
| **Reservar coche sin contraparte ni política** | `reserva.tsx` (todo el archivo) | No se dice quién conduce, ni quién cobra, ni cuándo, ni qué pasa si nadie acepta el presupuesto (`:355` «Mi presupuesto deseado (opcional)» sin explicar efecto) |
| **Transferencia sin destinatario** | `billing-checkout.tsx:349` | «Paga por transferencia u Orange Money y sube el comprobante.» No se dice **a quién**, a qué cuenta, ni en qué plazo se devuelve si se rechaza |
| **Reembolsos remitidos a un soporte que no existe** | `billing-status.tsx:137,145`, `kyc/status.tsx:101` vs `settings.tsx:252-254` | «contacta soporte para el reembolso» / «Ponte en contacto con soporte» — y Ajustes responde «Próximamente» a Ayuda, FAQ y Contactar soporte |
| **Vendedor sin teléfono y sin garantía en la caja del carrito** | `lifebook-carrito-checkout.tsx` | Total y contraparte correctos, pero **ni una frase** de garantía, retención o reembolso, y el pedido se crea **sin token de pago** (`:223-235` frente al contrato de `api/commerce.ts:658-660`), con «Pago exitoso» anunciado antes de que la tienda confirme (`:267`) |
| **Cargo de tercero no cuantificado** | `intercity.tsx:340` | «⚠️ La agencia cobra un importe por recibirte allí.» Se admite un coste desconocido y se pide decidir sin cifra |
| **Documento y domicilio sin finalidad** | `intercity.tsx:316`, `:336` | Cero explicación de para qué se piden ni quién los ve |
| **Registro visible para el usuario de forma engañosa** | `conductor-hub.tsx:110` | «**0 de 5 completados**» está escrito a mano, y el icono del checklist es siempre un círculo vacío (`:115`): un conductor con el alta ya enviada sigue viendo «0 de 5» |
| **Sin teléfono de hotel ni de tienda en la pantalla de pago** | `lifebook-hotel-reservar.tsx`, `lifebook-checkout.tsx:367` | El contacto se delega al chat «por el chat de Life Book» (`lifebook-checkout.tsx:367,448`) |
| **Identidad verificada anunciada… y luego roto** | `kyc/status.tsx:79-87` | «¡Identidad verificada! Ya tienes acceso completo a tu monedero» → botón que lleva a una pantalla de error (§1.3, punto 4) |
| **El agente de caja no ve ninguna comisión ni su neto** | `api/agent.ts` (sin campos de comisión) frente a `agente.tsx:141,176` | El panel solo muestra importes de la operación y el límite diario de efectivo: quien maneja dinero real no sabe cuánto gana |
| **El hotel tampoco ve comisión ni neto** | `lifebook-hotel-panel.tsx:355-384`; `api/hotel.ts` (sin campos `fee`/`commission`) | Ve total, señal y «al llegar», pero no lo que retiene la plataforma |
| **El neto del conductor tiene un 10 % incrustado como respaldo** | `conductor.tsx:33` (`const COMMISSION = 0.10`), usado en `:845-850`; el prefijo «≈» solo aparece cuando el neto no es exacto (`:1437`) | Si la cuota del servidor no llega, el conductor ve un neto **calculado en el cliente**, que puede no coincidir con el que se liquidará |
| **El conductor navega con una posición simulada sin que se le diga** | `conductor.tsx:791-804` (avance a `SIM_KMH` sobre la polilínea) tras `getGqPositionIfAllowed` devolver `null` (`:774`) | Un movimiento creíble por el mapa que **no es su posición real**, sin aviso en pantalla |

### 4.3 ¿Sabe el usuario cuánto paga, a quién y cuándo?

| Servicio | Cuánto | A quién | Cuándo | Veredicto |
|---|---|---|---|---|
| Taxi | Sí: presupuesto elegido + comisión + neto (`taxi.tsx:1420-1429`), importe en el CTA (`:1777`) | Sí: nombre, placa, foto, teléfono (`:1506-1556`) | Sí: bloqueado con PIN, ventana de cancelación y auto-cierre (`:1442-1456`) | **Completo** |
| Comida | Sí: subtotal, envío, total y comisiones explicadas (`food-checkout.tsx:367-391`), total en el CTA (`:531`) | Restaurante con nombre, tipo, ciudad, horario, dirección (`:291-307`); repartidor solo al final | Sí para monedero (garantía); para Billing, aprobación 2-24 h (`:514-519`) | **Casi completo** |
| Mercado (Ecomerse) | Sí: subtotal + entrega + tarifa de zona, total en el CTA (`ecomerse-checkout.tsx:418-431`) | Vendedor solo por el título del producto; sin teléfono | Solo con Billing/garantía; la garantía de 7 días **no aparece al pagar** | **Parcial** |
| Life Book (carrito) | Sí: subtotal, envío «a acordar», total por tienda y global, importe en el CTA (`lifebook-carrito-checkout.tsx:517-556`) | Tiendas nombradas (`:334-335`); sin teléfono | **No**: ninguna frase de cuándo se cobra, garantía o reembolso | **Parcial, con un hueco de dinero** |
| Hotel | Sí, el mejor: noches × habitaciones, limpieza, tasas, total, señal y resto (`lifebook-hotel-reservar.tsx:531-540`) | Hotel por nombre + política de cancelación (`:412`) | Sí: retención con cuenta atrás y liberación automática (`:547-548`) | **Completo, con pago manual por transferencia** |
| Monedero (recargar) | Sí: importe, límite del día y en el botón «Recargar X XAF» (`monedero-recargar.tsx:133,169`) | **No**: agente sin teléfono ni ubicación | Sí: el saldo se acredita cuando el agente confirma (`:112-114`) | **Parcial** |
| Monedero (retirar) | **No**: la comisión aparece después (`monedero-retirar.tsx:116-120`) | **No**: agente sin contacto | Sí: código al agente a cambio del efectivo (`:110-114`) | **Insuficiente** |
| Reservar coche | El número sí, pero **no es un precio real** (`reserva.tsx:52,94-95`) | No | No | **Insuficiente** |
| Interurbano | Total visible (`intercity.tsx:377`), pero el CTA no lleva cifra (`:388`) y hay un cargo de agencia sin cuantificar (`:340`) | Conductor con nombre y placa; sin teléfono; agencia sin datos | Pago al abordar o al llegar (`:416`); sin garantía ni reembolso en todo el archivo | **Parcial** |
| Planes/Billing | Importe en el resumen (`billing-checkout.tsx:308,328`) pero no en el CTA (`:319`) | **Nadie** | Aprobación 2-24 h; reembolso remitido a soporte inexistente | **Insuficiente** |

**Dónde se piden dinero o datos sin contexto:** `intercity.tsx:314-316` (documento) y `:336` (dirección); `billing-checkout.tsx:386,397` (monto y referencia sin explicar la finalidad); `lifebook-hotel-reservar.tsx:461` (correo «para el comprobante», antes de elegir método de pago); `monedero-retirar.tsx:171-179` (motivo AML); `taxi.tsx:387` (ubicación al abrir la pantalla).

---

## 5. CARGA COGNITIVA: DECISIONES SIMULTÁNEAS

Método: contar controles accionables distintos visibles en el mismo render (chips, radios, botones de opción, campos obligatorios) en la pantalla más cargada de cada flujo. **Decisión** = control que el usuario debe evaluar antes de continuar.

| Pantalla | Decisiones simultáneas | Evidencia |
|---|---|---|
| **Portada / Home** | **~22**: 13 servicios (8 en rejilla + 5 chips de «Más servicios») + 5 pestañas de dock + 3 botones flotantes + selector de ciudad, además del banner publicitario y el buscador | `ServiceGrid.tsx:37-42,142-191`; `FloatingFooter.tsx:25-31`; `MapTools.tsx:36-62`; `index.tsx:201-250` |
| **Taxi (paso de pedido)** | **~26**: 3-4 modalidades + 6 chips de pasajeros + **19 opciones de presupuesto** (17 visibles tras filtrar por ciudad) + destino + confirmar | `taxi.tsx:1585-1646` (modalidades), `:1648-1684` (pasajeros), `:1686-1733` (presupuesto: `budgetOptions` `:771-774`, pasos `:772`), `:1777` |
| **Interurbano (datos del pasajero)** | **~13 campos + chips**: para quién, teléfono comprador, tipo de reserva, asientos, nombre, apellidos, teléfono, nacionalidad, tipo de documento, número de documento, menores, tutor ×2, necesidades especiales, dirección de recogida | `intercity.tsx:288-336` |
| **Publicar en Life Book (`lifebook-sell`, paso «details»)** | **37** (29 chips + 8 inputs): 3 de precio + 4 de stock + 3 de estado + 19 de ciudad | `components/lifebook/publish/StepDetails.tsx:65-67,97-99,115-117,123-125` |
| **Publicar en Life Book (`lifebook-sell`, paso «shop»)** | **33** (29 chips + 4 inputs): 19 ciudades + 3 regiones + 5 formas de pago + 2 de entrega | `components/lifebook/publish/StepShop.tsx:99-101,118,126-133,139-140` |
| **Componer publicación de Life Book** | **41 chips de decisión** (14 temas + 5 tonos + 19 ciudades + 3 visibilidades) **+ hashtag libre + 4 fotos + 2 hojas** (productos, sitio) ≈ 46 controles en un scroll, con **1 solo obligatorio** | `lifebook-compose.tsx:273,313,330,356` (chips), `:216` (fotos), `:296` (hashtag); `:78` (`canSend`) |
| **Publicar oferta de trabajo** | **~33** | `work-publish.tsx:216-217,239,316-317,322-323,328-329,352` |
| **Publicar propiedad (alquiler)** | **~20+** (3 chips + 2 interruptores + grupos dinámicos); **3 obligatorios reales** | `alquiler-publicar.tsx:418,508,516`; `:191,198,199` |
| **Vender en Ecomerse** | **7 obligatorios** + selector de ciudad de **24 opciones** en modal; categorías/subcategorías **no verificable en fuente** (llegan de la API) | `ecomerse-seller.tsx:138,190-199,275`; `constants/data.ts:88-121` |
| **Publicar viaje interurbano** | **19 chips fijos** (7 de días + 8 de asientos + 4 de tipo de vehículo) + 2 filas dinámicas de provincia/distrito | `intercity-publish.tsx:480,498`; `api/intercity.ts:22` |
| **Checkout de comida** | **~10**: recogida/entrega, dirección, ubicación opcional, nota, 3 métodos de pago, líneas con ±/borrar | `food-checkout.tsx:396-513` |
| **Checkout de Life Book (carrito)** | **~9**: dirección, ciudad/barrio, referencia, método de pago por tienda, cupón, total por tienda | `lifebook-carrito-checkout.tsx:315-556` |
| **Búsqueda de hotel** | **~8**: ciudad, entrada, salida, noches, huéspedes, habitaciones, filtro de precio mín./máx. | `lifebook-hotel.tsx:126-152,173`, `lifebook-hotel-resultados.tsx:117-123` |
| **Elegir plan de pago** (trabajo / alquiler) | **3 tarjetas de plan** en `work-planes.tsx:224` · **4** en `alquiler-planes.tsx:263` (con el plan Gratis **solo por soporte**, `:123-130`) | `work-planes.tsx:224,254`; `alquiler-planes.tsx:263,289` |
| **Publicar anuncio de alquiler (interrupciones de plan dentro del formulario)** | **3 puntos de corte en la misma pantalla**: límite de fotos a mitad («Mejora tu plan», `:129`), interruptor de «destacado» **deshabilitado sin plan** (`:509`), y «Mis compras» → `/billing-status` (`:297`) | `alquiler-publicar.tsx:129,297,509` |

### Lectura con las leyes de UX

- **Ley de Hick (el tiempo de decisión crece con el número y la complejidad de opciones).** Está vulnerada en tres sitios por diseño: los **19 presupuestos** del taxi (`taxi.tsx:771-774`), los **41 chips** de `lifebook-compose.tsx:273-356` (con **un solo campo obligatorio** de los 46 controles: `:78`) y los **37** del paso de detalles de `lifebook-sell` (`StepDetails.tsx:65-125`; el paso de tienda suma otros 33, `StepShop.tsx:99-140`). Con 19 opciones de precio, un usuario en la calle no elige: abandona o pulsa al azar. La decisión del dueño que justifica la lista fija (comentario `taxi.tsx:766-768`, «evitar ambigüedades») es razonable **como política de producto**, pero la implementación la convierte en un muro: los pasos van de 300 a 10 000 XAF en 19 saltos desiguales (300, 400, 500 … 9 000, 10 000), sin agrupar y sin opción por defecto destacada. Contraste revelador: el asistente de `lifebook-sell` **sí** reparte su carga en 6 pasos con indicador de progreso (`lifebook-sell.tsx:256-261`) y avanza solo al paso culpable cuando falta algo (`:157`), mientras `lifebook-compose.tsx:161` deja el botón desactivado sin decir qué falta. Fuera de la publicación, el alta de conductor también marca progreso por pasos (`driver-onboarding.tsx:254-265`): el patrón está inventado **dos veces** en el repo y no se aplicó al resto.
- **Ley de Miller (7±2 elementos en memoria de trabajo).** La portada (~22 decisiones) y los checkouts con más de 9 controles superan el límite. La respuesta correcta ya existe en el propio repo: **divulgación progresiva**. El taxi lo hace bien al separar destino → modalidad → presupuesto en bloques (`:1565-1733`); `reserva.tsx` lo hace aún mejor con 3 pasos y puntos de progreso (`:174-178`, `:389-424`). El patrón está inventado; solo falta aplicarlo al presupuesto del taxi y a los formularios de publicación.
- **Ley de Tesler (la complejidad no se destruye, se reparte).** Hoy la complejidad irreducible (comisión por ciudad, mínimo de reparto, zona de entrega, cuota de plan, AML) está **empujada al usuario** en forma de campos y avisos: el motivo AML (`monedero-retirar.tsx:171-179`), el importe y la referencia del comprobante (`billing-checkout.tsx:386-404`), la elección de agente de efectivo (`monedero-recargar.tsx:143-163`). El sistema podría asumirla: deducir el motivo del historial, leer el importe de la orden, asignar el agente más cercano. Sí se asume bien en un punto y merece citarse: `lifebook-carrito-checkout.tsx:117` **se niega a escribir un 0 falso** en el envío (`return null; // a consultar`) y lo publica como «a acordar».
- **Ley de Jakob (los usuarios esperan que el producto funcione como los que ya conocen).** La app la usa a conciencia y la cita: la rejilla de servicios imita DiDi (`ServiceGrid.tsx:2-13`) y el flujo de taxi replica su estructura (presupuesto, PIN de destino, tarjeta del conductor). El problema es que el usuario de DiDi espera además que **lo que se toca, funcione**: aquí «Monedero» lleva a una pantalla de error (§1.3) y eso rompe el modelo mental más rápido de lo que lo construye el resto del diseño.
- **Ley de Peak-End (se recuerda el pico y el final de la experiencia).** Los finales están mal cuidados justo donde hay dinero: el alta termina con un salto inesperado a la Home (`auth.tsx:36-39`); el KYC termina en «No pudimos abrir esa pantalla» (`kyc/status.tsx:85`); la retirada termina mostrando una comisión que el usuario no había visto nunca (`monedero-retirar.tsx:116-120`); el carrito anuncia «Pago exitoso» antes de que la tienda confirme (`lifebook-carrito-checkout.tsx:267`). En el lado bueno, los picos están bien construidos: el OTP de recarga/retirada en tipografía de 40 px (`monedero-recargar.tsx:109`, `monedero-retirar.tsx:113`) y el código de entrega (`lifebook-order/[id].tsx:362`) son exactamente los momentos que hay que hacer memorables.
- **Ley de Fitts (el coste de un objetivo depende de su tamaño y distancia).** Bien resuelta: los botones flotantes del mapa tienen 48×48 con `hitSlop` (`MapTools.tsx:83,102-113`) y el dock es de altura fija con área completa por pestaña (`FloatingFooter.tsx:135-141`). El fallo no es de tamaño sino de existencia: el monedero no tiene objetivo al que apuntar.
- **Ley de Von Restorff (lo distinto se recuerda).** El rojo crítico se reserva para emergencia (`constants/data.ts:44`, `EmergencyModal.tsx`) y para errores; el naranja de servicio se usa de forma consistente en los checkouts (`food-checkout.tsx:49` `ACCENT = '#FF6B35'`). Coherente.

**Recomendaciones concretas (con ley asociada):**
1. Presupuesto del taxi: reducir a 5-6 opciones con una destacada y «otro importe» (Hick + Miller). `taxi.tsx:771-774`.
2. Portada: bajar a 8 accesos primarios y mover el resto a un cajón (Miller). `ServiceGrid.tsx:37-42`.
3. Publicaciones: guardar borrador (el store de `commercePublish.ts:348` no tiene `persist`) y/o partir el wizard de 37 decisiones en 3 pasos con progreso, copiando lo que `lifebook-sell.tsx:256-261` y `driver-onboarding.tsx:254-265` ya hacen bien (Tesler + Hick). Y que el botón diga lo que va a pasar cuando la cuota está agotada (`alquiler-publicar.tsx:523`).
4. Reparar el objetivo «Monedero» (Fitts/Jakob): `constants/data.ts:33` → `/monedero`, y borrar la entrada falsa de `rutas.ts:131`.
5. Cuidar los finales: devolver al usuario a la pantalla que pidió tras autenticarse (Peak-End). `AuthGate.tsx:19-23` + `auth.tsx:36-39`.

---

## 6. TONO Y MICROCOPY

### 6.1 Códigos técnicos y jerga llegando a la interfaz

| Ejemplo literal | Archivo:línea | Problema |
|---|---|---|
| `Estado: {status}` → «Estado: **approved**», «Estado: **pending**» | `driver-profile.tsx:102`, con `status` tipado `'none' \| 'pending' \| 'approved' \| 'rejected'` en `api/driver.ts:9` | Código inglés del backend pintado tal cual al conductor |
| `label: status` en el chip de estado de un movimiento | `monedero.tsx:62` (`map[status] ?? { …, label: status }`) | Un estado nuevo del servidor sale en mayúsculas y en inglés en el monedero |
| `{RESERVA_ETIQUETA[r.status] ?? r.status}` | `lifebook-hotel-reservas.tsx:366` | Lo mismo en el estado de una reserva |
| `{STATUS_LABEL[a.status] ?? a.status}` | `work-publish.tsx:418` | Lo mismo en una oferta de trabajo |
| «**Destino: /wallet**» en la pantalla de error de navegación | `ruta-fallida.tsx:44-48` | La ruta interna, con barra, expuesta al usuario |
| `Error de red (ENOTFOUND): Network request failed` (o `ECONNREFUSED`, `ETIMEDOUT`) | `api/httpClient.ts:150` — el mensaje se construye con `cause` (código nativo) y `raw` (mensaje nativo), y se propaga tal cual porque las pantallas hacen `setError(e.message)`: `monedero.tsx:92`, `ecomerse-orders.tsx:65`, `work-panel.tsx:78`, `taxi.tsx:871`, etc. | El error nativo del sistema operativo acaba en pantalla |
| `No se pudo crear la cuenta: Error de red (ETIMEDOUT): Network request failed` | `auth.tsx:54` (`setError(\`${fallback}: ${e.message}\`)`) | Prefijo humano + sufijo técnico en el alta de cuenta |
| «El **KYC** es obligatorio antes de solicitar el alta como vendedor.» | `ecomerse-seller.tsx:141` | Sigla interna en vez de «verifica tu identidad» |
| `Con esos valores salen 12 combinaciones y el máximo es 10: quita algún color o alguna talla` | `state/commercePublish.ts:298` | Habla de «combinaciones» cuando el usuario piensa en «variantes» |
| «Código ISO de 2 letras (p. ej. GQ, CM, ES)» | `kyc/index.tsx:162` | Norma técnica ISO en un formulario de identidad |
| «Formato: AAAA-MM-DD» / placeholder `AAAA-MM-DD` | `kyc/index.tsx:149`, `edit-profile.tsx:256,518`, `driver-onboarding.tsx:372`, `intercity-publish.tsx:188,483` | Se le pide al usuario escribir una fecha como la escribe un programador, en lugar de un selector de fecha |

### 6.2 Textos que suenan a manual o a relleno

| Ejemplo literal | Archivo:línea | Comentario |
|---|---|---|
| «Apunta la cámara al documento para traducirlo a español. **(Implementación con expo-camera + OCR en la siguiente iteración.)**» | `scanner.tsx:28-29` | Nota de desarrollo dentro de la interfaz |
| «Alcanzaste el límite de tu plan (3 anuncio(s) activo(s)). Mejora tu plan para publicar más.» | `alquiler-publicar.tsx:193` | «anuncio(s)»: plural automático de plantilla, tono de sistema |
| «Toca el nivel activo otra vez para quitarlo.» | `food-owner.tsx:689` | Instrucción de manual para explicar un control poco obvio en vez de rediseñarlo |
| «**Toca el mapa**» (etiqueta flotante) | `work-publish.tsx:467` | Instrucción dentro del propio control |
| «Nada por aquí todavía» | `lifebook-inbox.tsx:176` | Relleno: no dice qué es esa bandeja ni qué hacer |
| «¡Identidad verificada! Ya tienes acceso completo a tu monedero.» | `kyc/status.tsx:82` | Promesa que el botón de al lado incumple (lleva a `/wallet`, inexistente) |
| «Al confirmar crearás tu cuenta.» | `taxi.tsx:1793-1797` | Honesto en el fondo, pero aparece como nota al pie en gris bajo el botón: la creación de cuenta es una consecuencia que el usuario descubre después |
| Botón que dice una cosa y hace otra: «Publicar anuncio» → navega a `/alquiler-planes` | `alquiler-publicar.tsx:523` | El error más caro del apartado: el usuario cree que publica y acaba en la pantalla de precios |
| Botón desactivado sin explicación | `lifebook-compose.tsx:161` (`disabled={!canSend}`, `:78`) | No dice qué falta; contraste con `lifebook-sell.tsx:157,265`, que señala el campo y salta al paso culpable |

### 6.3 Microcopy bueno (para conservar como patrón)

| Ejemplo literal | Archivo:línea | Por qué funciona |
|---|---|---|
| «El restaurante cambió algún precio» + «Plato: 3.000 XAF → **3.500 XAF**» + «Los importes de abajo ya están actualizados.» | `food-checkout.tsx:326-336` | Dice el qué, con las dos cifras, y resuelve la duda siguiente |
| «Para reparto el pedido mínimo es X XAF. Llevas Y XAF. Añade algo más o cambia a recoger en el local.» | `food-checkout.tsx:345-350` | Da la regla, el estado actual y **dos salidas** |
| «Tienes 5.000 XAF · **no llega**» | `food-checkout.tsx:508-510` | Anticipa el fallo antes de intentarlo |
| «Da este código al agente SOLO cuando te entregue el efectivo» | `monedero-retirar.tsx:111` | Instrucción de seguridad en el momento exacto de riesgo |
| Contabilidad del repartidor con lo ganado, lo pendiente y **la deuda en rojo** | `food-rider.tsx:297-326` | El mejor caso del lado oferta: el trabajador ve su dinero sin pedirlo |
| «Precio del algoritmo · **ganas X XAF**» en el propio botón de aceptar el viaje | `conductor.tsx:1437,1448` | La ganancia está en el punto de decisión, no en un informe aparte |
| Panel del hotel con total, señal cobrada y «por cobrar» del día | `lifebook-hotel-panel.tsx:262-264,355-384` | El negocio ve su cobro por reserva |
| «Para ver el teléfono y escribirle, primero envía tu postulación (gratis). El reclutador recibe tu perfil…» | `work-detail.tsx:124` | Fricción deliberada **con motivo declarado** |
| «Si el dinero ha entrado por fuera de la app, márcalo aquí. El comprador recibe el aviso y los dos podéis ver con qué se dio por cobrado.» | `lifebook-order/[id].tsx:578` | Convierte una acción opaca en una decisión trazable para ambas partes |
| «El color «rojo» necesita su foto real del producto en ese color: no vale solo el nombre» | `state/commercePublish.ts:295` | Explica el porqué de una validación en vez de solo bloquear |
| «Cerrado ahora · tu pedido quedará en cola y lo confirmarán cuando abra.» | `food-checkout.tsx:303` | No bloquea y aun así informa |
| «Tienes cambios sin guardar en tu restaurante. ¿Descartarlos?» | `food-owner.tsx:159` | Aviso de pérdida de datos con la pregunta correcta |

### 6.4 Un patrón de tono a corregir

Las **reglas de dinero que protegen al usuario están escritas en comentarios de código, no en pantalla**. Ejemplos: la ventana de cancelación gratis de 5 minutos, la cuota de no-show y el cierre automático a 10 minutos están documentados en `api/settlement.ts:10-17` y solo **parcialmente** se reflejan en la interfaz de taxi (`taxi.tsx:1448-1454`); la obligación AML de la retirada se explica en `monedero-retirar.tsx:4-5` pero en pantalla es un campo llamado «Motivo de la retirada». La app sabe explicarse; el problema es que a veces solo se lo explica al desarrollador.

---

## Puntuación flujos: 5/10

**A favor:** existe una infraestructura de navegación pensada y documentada (`constants/rutas.ts`, `ruta-fallida.tsx`, `+not-found.tsx`), la protección de enlaces de arranque está resuelta (`_layout.tsx:58-81`), el taxi y el hotel tienen flujos completos con estado, cuenta atrás y cierre, y varios listados tienen estados vacíos y de error modélicos (`food.tsx:223-249`, `ecomerse-orders.tsx:165-194`).

**En contra (cada punto verificado en §1 y §2):** el alta de cuenta se corta sola en el OTP y deja cuentas sin contraseña (`auth.tsx:36-39`); el KYC tiene 4 pantallas y **ninguna puerta de entrada**, y termina en una ruta que no existe (`kyc/status.tsx:85`); el monedero **no tiene entrada funcional desde la portada** (`data.ts:33` → `/wallet` inexistente, `rutas.ts:131` lo valida como si existiera); 61 pantallas protegidas **pierden el destino** al autenticarse (`AuthGate.tsx:19-23` + `auth.tsx:36-39`); la emergencia exige cuenta (`emergencia.tsx:27-32`); el escáner es un stub confeso alcanzable en 2 toques (`scanner.tsx:29`); ninguna publicación guarda borrador aunque el propio código lo advierta (`work-publish.tsx:106`).

## Puntuación psicología: 6/10

**A favor:** el taxi muestra importe, comisión, neto, contraparte con teléfono, ventana de cancelación gratuita y vía de disputa (`taxi.tsx:1420-1456`, `:1506-1556`, `:1753-1755`); el hotel desglosa noches, limpieza, tasas, señal y resto, y explica la retención y la liberación automática (`lifebook-hotel-reservar.tsx:531-548`); la comida anticipa cambios de precio con las dos cifras, mínimos de reparto, saldo insuficiente y quién paga las comisiones (`food-checkout.tsx:324-391`); hay instrucciones anti-fraude en el momento exacto de riesgo (`monedero-retirar.tsx:111`, `lifebook-order/[id].tsx:362`).

**En contra:** la comisión de retirada se enseña **después** de confirmar (`monedero-retirar.tsx:116-120`); quien entrega o recibe el efectivo es un nombre sin teléfono ni ubicación (`monedero-recargar.tsx:158-159`); **Reservar Coche presenta como «precio estimado por algoritmo» un número calculado a partir de la longitud del texto** (`reserva.tsx:52,94-95`) bajo un icono «Seguro» (`:181-182`); la transferencia no dice a quién se paga (`billing-checkout.tsx:349`); los reembolsos remiten a un soporte que responde «Próximamente» (`billing-status.tsx:137` vs `settings.tsx:254`); la caja del carrito de Life Book promete «Pago exitoso», no explica ninguna garantía y crea el pedido sin token de pago (`lifebook-carrito-checkout.tsx:223-235,267`).

---

### Anexo — No verificable en fuente

1. **Comportamiento real del backend**: si el escrow retiene de verdad, plazos efectivos de aprobación y reembolso, y qué ocurre con el dinero de una tarifa interurbana rechazada. Lo citado es lo que la **interfaz afirma**.
2. **Orden exacto de los efectos de React** en `auth.tsx:36-39` frente a `setMode('password')` (`:90`) y frente a `done()` (`:59`): el código permite deducir que el paso de contraseña queda inutilizado, pero el fotograma exacto que vería el usuario requiere ejecutar la app.
3. **Si el diálogo de permisos de Android aparece antes o después del primer render** de `/taxi` (`taxi.tsx:387`).
4. **Cómo se comporta el motor de rutas de `expo-router`** ante `router.push('/wallet')` con `_layout.tsx:128` registrando la pantalla: en el árbol se lee que no existe `app/wallet.tsx`, y la pantalla de respaldo `+not-found` está preparada (`+not-found.tsx:13`), pero la resolución final es de ejecución.
5. **Rutas dinámicas** (`lifebook-product/[id]`, `lifebook-post/[id]`, `lifebook-order/[id]`, `lifebook-chat/[id]`, `lifebook-shop/[id]`, `promo/[id]`, `service/[id]`): verificadas por `grep` de navegación, no por lectura completa de cada una.
6. **Retención y notificaciones push**: no existe ninguna petición de permiso de notificaciones en `app/`, `components/` ni `api/` (0 coincidencias de `Notifications.` y de permisos equivalentes). La app resuelve los avisos con sondeo (`hooks/useUnreadChat.ts`, citado en `FloatingFooter.tsx:44-58`). Es una **ausencia verificada en fuente**, pero no se puede saber si hay push nativo configurado fuera de estos directorios.
