# AUDITORÍA DEL MONEDERO — 15/09 noche (por pedido del dueño: «creo que está bien construido con base»)

**Veredicto corto: el dueño tiene razón.** El núcleo del dinero está construido de verdad (idempotencia,
doble entrada, límites por riesgo, PIN con bloqueo, escrow con ciclo de vida completo). Los fallos que
hemos visto **no son de arquitectura**: son tres piezas desenchufadas. Nadie rehace nada: se enchufa.

---

## 1. Lo que hay (comprobado en `/opt/mirror/app`, no de memoria)

**Esquema (Prisma, `prisma/schema.prisma`)**
- `Wallet`: **una cuenta por usuario** (`userId @unique`), dos baldes (`balanceAvailable`,
  `balanceEscrow`), `dailyLimit` y **`version`** (concurrency optimista: nadie doblan un saldo a la vez).
- `Transaction`: **`idempotencyKey` UNIQUE** (reintentar no cobra dos veces), tipos `DEPOSIT,
  WITHDRAWAL, ESCROW_LOCK, ESCROW_RELEASE, ESCROW_REFUND, FEE`, estados `PENDING/COMPLETED/FAILED/REVERSED`,
  `referenceActivityId` (la operación de origen queda atada al movimiento) y `metadata` libre.
- `LedgerEntry`: asiento por transacción y balde (`AVAILABLE/ESCROW`, `DEBIT/CREDIT`) con
  **`balanceAfter`** → libro contable auditable.
- `EscrowOrder`: ciclo completo (`AWAITING_PICKUP → IN_TRANSIT_BY_AGENT → INSPECTED_AND_DELIVERED →
  COMPLETED`, más `DISPUTED/CANCELLED/REFUNDED`), transacciones de lock y payout enlazadas,
  **tokens QR de recogida y entrega hasheados y con caducidad**, snapshot del producto y disputa.
- `PaymentAuthorization`: token de pago de **un solo uso** (hash, `scope`, `amountBound`, caducidad, `usedAt`).

**Servicios**
- `wallet.service.ts` (410 líneas): idempotencia por clave; `assertLimits` cruza el límite diario **con
  la política KYC del usuario** (el mínimo de ambos); actualizar saldos incrementa `version`; retiros
  retienen **comisión** (`FeeService`, `hold = importe + fee`) y el error dice cuánto falta.
- `payment-auth.service.ts` (186): PIN con **Argon2id**, **bloqueo 15 min a los 5 fallos**,
  `POST /auth/payment-token` → token monouso; los endpoints de dinero lo consumen con verificación de
  hash, expiración y vínculo exacto de importe/alcance. También WebAuthn (BIOMETRIC).
- `kyc-gate.service.ts` (152): matriz de riesgo real — L0: nada; L1: 20.000/día, saldo máx. 50.000,
  **sin retiradas**; L2: 100k (0-29 años) / 50k (30-59) con retirada. Lee `APPROVED_L2` de
  `kycSubmission` (esquema aparte: `prisma/mobility/schema.prisma`).
- `kyc/`: máquina de estados (`kyc.fsm.ts`), **workers de OCR y AML**, eventos SSE, controlador con
  `submissions`, `submissions/me`, presign de documentos y biometría.

**Rutas vivas verificadas (curl en el propio servidor, :3000)**
- `GET /api/v1/wallet` → **401** (existe, guardada por `JwtAuthGuard + RolesGuard`) ✓
- `GET /api/v1/mobility/kyc/submissions/me` → **404** ✗ (ver defecto 1)
- Nginx: `/wallet/` sirve `/opt/mirror/wallet-app/` (SPA) y `/wallet/api/` **se proxia al mismo
  backend** (`127.0.0.1:3000/api/`) → SPA y app comparten servidor. ✓

## 2. Los tres defectos (todos concretos, ninguno de fondo)

**D1 — La ventanilla KYC está construida pero NUNCA se monta.** `KycController` vive en
`src/mobility/kyc/` y se declara en `KycQueueModule`; pero `mobility.module.ts` solo lista
`controllers: [MobilityController]` y `app.module.ts` importa `MobilityModule` — **nadie importa
`KycQueueModule`**. Por eso el código existe (hasta compiled en `dist` del 7/9) y el servidor responde
404. Ese 404 es lo que mataba la pantalla del monedero en la app. **Arreglo: una importación +
redeploy** (comprobar si KycQueueModule arrastra los workers/cola y si eso conviene montarlo entero o
crear un `KycHttpModule` solo con el controlador).

**D2 — El SPA del monedero habla un contrato de auth que el servidor ya no es.** El bundle del SPA
(`/opt/mirror/wallet-app/assets/*.js`) llama a `/wallet/api/v1/mobility/*` y a `auth/login` mandando
`password` y teléfono **sin `+240`**; el `mobility-auth.controller` actual exige `^\+240\d{9}$` y el
endpoint de pago quiere **`pin` de 6 dígitos** — con `forbidNonWhitelisted`, el extra `password` es
rechazado de plano. De ahí el «property password should not exist / phone must match / pin must match»
que vio el dueño y el «panel de administración» (el SPA se queda en su formulario al no poder entrar).
**Arreglo: alinear el SPA** (login `+240`+password; token de pago con `pin`) **o**, mejor para la
unificación: **que el SPA no tenga login** — la app ya le inyecta el JWT en
`localStorage['malabogo.token']`; el SPA debería aceptar esa sesión (mismo `JwtAuthGuard` le sirve) y
solo pedir PIN para autorizar movimientos.

**D3 — Dos mundos de dinero del mismo dueño, sin puente.** El monedero del usuario (Wallet+ledger,
`v1/wallet`) y la **«Caja» del comercio** (`src/lifebook/orders.service.ts` — `money/balance`, el panel
nativo de T.18) no comparten ledger. Las tarifas de taxi/pedidos **tampoco pasan** por `Transaction`.
Hoy «unificar» no exige rehacer: exige que **todo cobro/pago de la app cree su `Transaction` con su
tipo y su `referenceActivityId`** (ya existen el campo y los tipos) y que la caja del comercio se
modele como `Wallet` de rol comercio (o `WalletAccount` aparte con el mismo ledger).

## 3. Plan de unificación (el primer paso, corregido tras la auditoría)

Mi propuesta de ayer («crear cuenta + ledger») queda **anulada: ya existen**. El primer paso real es:

1. **P0 — Montar la ventanilla KYC (D1).** Sin ella no hay L2 y el `kyc-gate` dejará fuera de juego el
   día que funcione lo de retiradas. Una importación + test `submissions/me` → 401/200.
2. **P0 — Identidad única app↔SPA (D2).** El SPA acepta el JWT inyectado (clave `malabogo.token`);
   fuera login propio. PIN solo para autorizar pagos (ya está: `payment-token` monouso).
3. **P1 — El contrato mínimo, que ya está casi entero:** `GET v1/wallet` (saldo+límite+estado KYC —
   añadir estos dos últimos al JSON si faltan) y `GET v1/wallet/transactions` (historial con tipo y
   referencia). SPA nativo y pantalla «Caja» leen esto.
4. **P1 — Enchufar operaciones al ledger:** taxi y comida crean `Transaction` al pagar; `FEE` al
   cerrar escrow (ya hay `FeeService`); Life Book pedidos/escrow los mueve `escrow.service` — auditar
   que **todo** paso de dinero escriba asiento con `balanceAfter`.
5. **P2 — Caja del comercio sobre el mismo ledger** (wallet de rol comercio + transacciones con
   `referenceActivityId` al pedido) y panel nativo `lifebook-dinero` leyendo `v1/wallet`.
6. **P2 — TLS.** Hoy el token viaja en **http plano** a `106.14.104.146`; el panel nativo lo permite
   solo para esa IP (`network_security_config.xml`, decisión del dueño). **Antes de dinero real: el
   SPA y la API tras https con el dominio.**

## 4. Riesgos/observaciones menores apuntadas en el paseo

- `app/wallet.tsx` está **reconstruido** anoche (T.27): verificar `retryCheck`/`onMessage` al tocar.
- El SPA muestra datos **demo** («María», MBO-0042, iPhone 13) hardcodeados en los bundles — al
  alinear el login habrá que quitar la maqueta o dejarla solo sin sesión.
- `dist` del 7/9 ≠ fuente de hoy: al montar KYC, **rebuild completo y probar rutas en vivo** (como
  los 404/401 de arriba), no fiarse del `.js` en disco.
- Nota de método de T.24 que sigue viva: pantalla nueva = entrar en `RUTAS` + medar pulsando el botón.

---

## Ejecución D1 (15/09, tras la auditoría) — KYC montado

- Respaldo: `app.module.ts.bak-montaje-kyc-20260915`.
- Cambio: import de `KycQueueModule` + entrada en `imports` (`src/http/app.module.ts:18` y `:67`).
- `npm run build` (tsc): limpio. `pm2 restart malabogo-api --update-env`: **online** (301 reinicios;
  único aviso en err-log: AWS SDK pide node≥22, preexistente, no fatal).
- Verificado en vivo: `GET /api/v1/mobility/kyc/submissions/me` → **401** (antes 404; ahora existe y
  pide sesión). `GET /api/v1/wallet` → 401 (intacto). Redis y MinIO containers arriba.
- **Comprobación pendiente en el móvil** (se cayó el adb justo al final): abrir `egrouteplan://wallet`
  con sesión. Esperado: el monedero ya NO muestra el aviso `kycCaido` — o abre con límites L1 o
  redirige a `/kyc` (expediente inexistente → `sub?.status` ≠ APPROVED_L2 → el diseño «lazy auth» del
  fichero). Si redirige a /kyc, esa pantalla (que existe) es ahora la ventanilla real: nombre,
  nacimiento, nacionalidad → documentos (presign a MinIO) → biometría mock → AML worker.
- Ojo para D2: el flujo KYC de la app apunta a `/mobility/kyc/submissions` con JWT de la app — mismo
  `JwtAuthGuard` que el wallet ✓. El SPA sigue con su contrato viejo (D2 pendiente).

**Cierre D1 en el móvil (sesión conectada, tras el reinicio)**: `egrouteplan://wallet` abre y el volcado
muestra el SPA completo (**27 textos**) **SIN el aviso `kycCaido`** → la llamada a `submissions/me`
responde de verdad (gate dictando con datos, no tolerancia de caída). D1: **cerrado**. Pendiente: D2
(SPA sin login propio) y comprobar el camino `/kyc` con una cuenta **sin** expediente (el dueño tiene
L2; falta probar un usuario nuevo para ver la ventanilla funcionando de punta a punta).

**D2 ejecutado y verificado (16/00:14–00:26)**: `app/wallet.tsx` inyecta ahora TAMBIÉN en
`localStorage['unified_token']` (la clave que el SPA lee; su login era `/mobility/auth/login`, la misma
puerta que usa la app — `api/auth.ts` —, así que el JWT de la sesión ES un token unificado válido).
Verificado tocando la tab «Monedero» del SPA dentro del WebView: muestra datos REALES —«SALDO
DISPONENTE 125 XAF · En garantía 0 · Límite diario 100.000 (L2 de la matriz KYC) · Depositado/Retirado
hoy 0/100.000 · Movimientos: aún no hay»—; la maqueta («María», 45.000) solo queda en el inicio. Sin
formulario «Inicia sesión con el admin unificado». Riesgo anotado: el token viaja http a la IP (igual
que antes); espejo HK y origen comparten JWT al menos para lectura del wallet — si algún día divergen
los secretos, el SPA caería a `unified-auth-lost`.

**P1-a ejecutada y superada (16/09 madrugada) — la ventanilla KYC funciona de punta a punta.**
Prueba por API con usuario NUEVO creado en caliente (`+240555000111` / `PruebaKyc2026`, role
PASSENGER; OTP leída del log `[sms:dev]` — `SMS_PROVIDER=console`):
1. `submissions/me` antes → vacío (200). 2. `POST submissions` → `INITIATED` con decisión FSM real
(path NATIONAL_ADULT, target 2, exige liveness, opciones DIP/PASPORT con textos). 3. presign → **PUT
real a MinIO (200)** → complete → `OCR_PENDING` → (worker mock) → `LIVENESS_REQUIRED`. 4. challenge:
el servidor FIRMA el desafío (`sessionSignature`); verify exige además **≥2 timestamps crecientes y
dentro de la ventana** del challenge (kyc.service.ts:255-258) — con eso, `accepted:true`. 5. Resultado
final: **`APPROVED_L2`** con riskScore 0, faceMatch 0.96, liveness 0.98 (proveedores mock de Fase C:
aceptan lo que mandes — al conectar el proveedor real habrá que recalibrar).
Smoke en el móvil con la cuenta ADMIN (ya L2): `egrouteplan://kyc` abre y muestra «Identidad verificada
· Ya puedes usar tu monedero de forma segura · Ir al monedero →» — sin fallos.
**Anotaciones de la prueba (no bloquean):**
- `mobility.users.kycLevel` se pone a 0 en el registro y **nadie lo actualiza tras aprobar** (`auth/me`
  seguirá diciendo 0 para siempre). Nadie crítico lo lee hoy (el wallet y el gate van por el estado de
  la submission), pero es una fuente de verdad deshilachada: o se actualiza en el gate o se quita.
- `wallet.dailyLimit` (columna, default 100.000) ≠ política del gate (L0 → 0). `assertLimits` usa el
  MÍNIMO de ambos, así que el L0 nuevo no puede operar; pero el GET/pantalla enseña «Límite diario
  100.000» que es mentira para él. Al arreglar la caja del SPA: enseñar el límite EFECTIVO (política).
- Falta la prueba en pantalla del camino «usuario SIN L2 abre monedero → /kyc» — requiere cerrar la
  sesión ADMIN en el móvil del dueño; creds de prueba arriba para cuando él quiera hacerla (o creamos
  un segundo usuario limpio sin expediente).

**P1-b (16/00:37–00:50) — resultado parcial, con hallazgo importante:**
1. **Inventario del ledger (real, por código):** escriben apuntes SOLO escrow (lock/release/refund),
   wallet (depósito/retraso) y fee (comisiones). **Taxi NO toca el ledger**: el cobro del viaje es
   efectivo y el dinero entra/sale por ventanilla de AGENTE (CASH_IN/CASH_OUT vía agent.controller).
   Conectar el cierre de viajes al ledger es una DECISIÓN DE PRODUCTO (liquidación + comisión), no un
   bug — queda como P1-c para decidir con el dueño.
2. **Límite efectivo:** `assertLimits` ya usa min(columna, política del gate) — el cálculo es correcto;
   solo el GET/etiqueta enseña la columna cruda (100.000 mentira para L0/L1). Arreglo pequeño pendiente.
3. **https: intento fallido y revertido.** HK sirve `/wallet/` con bundle **byte-idéntico** (mismo md5)
   y token válido (200 en auth/me y wallet), pero allí el SPA aterriza en «Panel de administración»
   mientras en la IP origen muestra el monedero. Misma app, comportamiento distinto por host — la
   apertura https queda BLOQUEADA hasta entenderlo (posible localStorage de sesión admin en HK, que en
   el WebView de origen ya estaba limpio). APK 00:47 restaura la URL que funciona (IP origen, http);
   verificado en el móvil: abre sin panel admin ni formulario de login. El aviso de texto plano sigue
   vigente: es la deuda https real del monedero.

**Límite subido a 1.000.000 XAF diarios (16/01:00, decisión del dueño: «si crees que se puede
subir… está bien»). Cadena real de la verdad, descubierta a palos:**
- El límite EFECTIVO lo fija la matriz de riesgo `riskToWalletLimits()` (kyc.contracts.ts): riesgo<30
  → era 100k, **ahora 1M**. L2_STANDARD (gate) y el default de provisionado (wallet.create) siguen a
  1M también por coherencia. Por **operación** sigue mandando `PER_OPERATION_LIMIT` = 100k: se puede
  mover 1M/día en hasta ~10 operaciones — prudente mantenerlo así.
- La columna `wallet.wallets.daily_limit` existía con default 100000 y un **CHECK oculto
  `wallets_daily_limit_chk (<= 100000)`** (no está en schema.prisma). Relajado a ≤100M como
  cortafuegos de erratas y filas actualizadas a 1M (22). Backups: `*.bak-limite-1m-20260916` en
  kyc-gate/kyc.contracts/wallet.service.
- Etiqueta honesta en GET /wallet: devuelve `min(columna, política)` y el verificado en vivo:
  `dailyLimit: 1000000, depositRemaining: 1000000` (usuario L2 de prueba). OJO: el espejo HK tiene su
  propia BD — si algún día apunta a otra base, repetir el UPDATE allí.

**Chips de «Descubrir grupos» (medición, no suposición):** con el móvil en la mano, fila ciudades
y2=627 == fila categorías y1=627 (pegadas) y el texto de las chips salía con alturas distintas
(17px vs 23px con el mismo fontSize 12) → los FlatList horizontales heredaban `flexGrow` y se
comprimían entre sí. Arreglo en `app/lifebook-groups.tsx`: estilo `chipRow`
{flexGrow:0, flexShrink:0, marginVertical:5}, paddingVertical 10 simétrico en ambas filas, chips con
flexShrink:0. tsc 0 → APK 01:08 instalado. **Verificación visual pendiente: el móvil quedó bloqueado
con clave** — el dueño lo comprueba al abrir (deep link egrouplan://lifebook-groups).

**P1-c — MI PALABRA (decisión de producto recomendada, NO aún implementada):** SÍ, los viajes deben
entrar al ledger, y la casa ya está construida para ello: `ESCROW_LOCK / ESCROW_RELEASE / ESCROW_REFUND
/ FEE` + `referenceActivityId` existen exactamente para esto. Flujo propuesto: al aceptar el pasajero
un viaje con pago por monedero → LOCK del importe estimado (si el saldo/limit no llega, se ofrece
recargar por agente — el canal CASH_IN ya existe); al llegar → RELEASE al conductor menos FEE de
plataforma (comisión referenciada a la actividad, que fee.service ya sabe escribir); desacuerdo →
REFUND. El taxi en efectivo NO debe tocar el ledger (no hay dinero ourougeano que contar). Queda
decidir con el dueño: % de comisión, qué pasa con viajes cancelados, y si el precio se cierra al
aceptar o se estima. Es trabajo de tanda propia (2-3 h con su e2e), no de restos de contexto.

---

## Actualización 17/09 — EL MONEDERO DEL CONDUCTOR: dos builds distintos y un alias de rol

Versión corta de esta tanda (lo anterior que aquí se escribió sobre el gate ADMIN quedó
superado; se deja la explicación correcta bajo estas líneas):

### Qué veía realmente el dueño

1. **`/wallet/` NO era el mismo sitio en cada servidor.** Shanghái sirve en `/wallet/` el
   **monedero de verdad** (build Vite de 215 KB: `index-NcRg_fmp.js`, saldo, PIN,
   recargar/retirar por agente, `malabogo.token`). hk servía en `/wallet/` **una copia del
   panel de administración** (build de 1,3 MB con rutas `/dashboard`, `/users`,
   `/driver-documents`…). Cuando la P1-b probó «el bundle es idéntico» comparó archivos que
   coexisten, no los que cada `index.html` referencia. Por eso el 16/09 «se comportaba
   distinto por host»: **comportaba apps distintas**.
2. **El alias `DRIVER → AGENT` en `RolesGuard` (`src/http/guards.ts`).** Con él, el login
   propio del monedero (`POST /v1/auth/login`, teléfono+PIN) emitía JWTs con `role: AGENT`
   para quien tuviera perfil de agente — y **+240555000003 lo tiene ACTIVE**. El monedero lee
   el rol DEL PAYLOAD del JWT (`atob(payload).role`): si ve `AGENT`, monta la consola del
   agente de caja; si no, la pantalla normal. De ahí «el monedero del conductor es de un
   agente y nunca se muestra como de un conductor».
3. El mismo alias le **cerraba su propio dinero**: `deposits`/`withdrawals`/`cancel` son
   `@Roles('USER')` y el DRIVER aliasado a AGENT recibía 403 — no podía retirar el neto que
   P1-c le liquida. (Y en el panel-admin de hk existía además un `me()` filtrado a `ADMIN`,
   gate de sesión de ESA app, no del monedero.)

### Qué se hizo (todo verificado en vivo sobre hk, que es la URL de la app)

- **hk `/wallet/` sirve ahora el monedero auténtico**: assets `index-NcRg_fmp.js`,
  `index-DOo29u3D.css`, `logo.jpg` copiados de Shanghái a `/opt/mirror/wallet-app/` (nginx ya
  aliasiza `/wallet/` allí y ya proxifica `/wallet/api/` → :3000; no hubo que tocar nginx).
  El `index.html` anterior del panel quedó en `index.html.bak-adminpanel-20260917`. El
  panel-admin sigue en `/admin/` (`/opt/mirror/web-admin`, intacto). Shanghái sigue con su
  copia igual (SSH denegado desde aquí: no hace falta tocarlo).
- **App → `https://hk.egrouteplan.com/wallet/`** (`app/wallet.tsx`): mismo monedero, backend
  bueno (el de P1-c), https con el token ya en claro resuelto. La app inyecta
  `malabogo.token` = JWT mobility (`role: DRIVER`) → el monedero monta la **pantalla normal**
  con el saldo real (7.625 XAF de los nets del e2e).
- **parche 93 (`guards.ts`, desplegado y reiniciado)**: `DRIVER → 'USER'` (dueño de su
  dinero), `PASSENGER → 'USER'` igual. El agente de caja real NO depende del alias: su login
  PIN emite `role: AGENT` directamente (`issueSession`), y la única ruta `@Roles('AGENT')`
  (`agent.controller`) sigue exactamente igual de accesible/inaccesible según cómo entres.
  Efecto: el conductor puede **retirar su neto** (antes 403) y no ve la consola de agente.
  ⚠️ `guards.ts` apareció **truncado a 0 bytes hoy a las 09:05** — ninguna tanda nuestra
  escribe ese archivo (todos nuestros parches tienen un único objetivo y backup `.bak-*`);
  se reconstruyó íntegro desde el `dist/src/http/guards.js` compilado (mismo comportamiento
  más el alias corregido). La copia con la corrección queda en
  `backend/server-patch/parche93-guards/guards.ts`; la vaciada, en
  `/opt/mirror/app/src/http/guards.ts.bak-vacia-20260917`.
- **parche 94 (`wallet.service.ts`)**: `agentId` de `requestDeposit`/`requestWithdrawal`
  llegaba sin validar hasta el INSERT → UUID inexistente = FK 500. Ahora
  `assertActiveAgent()` devuelve 400 `AGENT_NOT_FOUND` antes de tocar nada. (El fixture que
  usaba `uid` como `agentId` se corrigió en lb96a: `agId` = agente ACTIVE real.)
- **e2e**: `lb96a` re-ejecutado tras 93+94 → **TODO OK** (el paso del cupo ya no es soft:
  el depósito desbordando como DRIVER da `DAILY_LIMIT_EXCEEDED` con `used_today` incluyendo
  el neto del viaje, y el depósito justo pasa y se cancela). `lb95a` de regresión →
  **TODO OK** (la liquidación completa no sufrió con el cambio de alias).
- **APK**: compilado e instalado en el Poco F5 (17/09 08:29:56) apuntando ya a hk.

### Lo que NO queda probado en pantalla (le toca al dueño)

- Reabrir Monedero con 003: debe verse el monedero **normal** (saldo 7.625, recargar/retirar
  eligiendo agente) y la consola de agente solo si alguien hace login con PIN teniendo
  perfil ACTIVE. El WebView debe descartar caché antigua: si abriera el panel, matar la app.
- Que un conductor sin perfil de agente pudiera antes hacer `deposits` seguía sin probarse
  hasta hoy: ahora sí lo está (lb96a en vivo).
- **Caducidad a 15 min (limitación del build, mitigada 17/09)**: este monedero no refresca
  tokens (`refreshToken` y el manejo de `401` no existen en el bundle). La app sí los refresca
  en silencio (interceptor 401 del `httpClient`), y desde hoy `app/wallet.tsx` **recarga el
  WebView cuando el JWT cambia** — el monedero queda reinjected con el token vivo. Lo que no
  tiene arreglo desde fuera: si nadie hace ninguna llamada nativa durante >15 min, el token
  caducado sigue sirviendo hasta la siguiente pantalla que sí llame a la API. Un «falla todo»
  con el monedero abierto media hora y sin tocar nada más es esto; cerrar y reabrir lo cura.
- **El login propio del monedero pide el PIN del monedero, NO la contraseña de la app** — el
  error «Credenciales inválidas» del 17/09 era exactamente eso (intento con 123456 en el
  campo de 6 dígitos). Verificado en vivo: `POST /wallet/api/v1/auth/login` con PIN correcto
  (246810, fixture del e2e sobre +240555000003) → 200 con sesión. Ojo: ese login emite rol
  `AGENT` para quien tenga perfil de agente ACTIVE (es el caso de 003, fixture antiguo), así
  que por esa vía STILL verá la consola de agente; la vía normal (abrir desde la app, token
  inyectado con rol DRIVER) muestra el monedero de conductor. Si el dueño quiere que 003 deje
  de ser agente de caja, es quitarle el perfil: `UPDATE wallet.agents SET status='INACTIVE'
  WHERE user_id='33333333-...'` (pendiente de su decisión).

---

## Auditoría severa 17/09 (tarde) — el puente app↔monedero y la verdad del bundle

Motivo: el dueño seguía viendo «vista de agente» entrando desde la app pese al alias corregido.
Se auditaron el bundle servido (`index-NcRg_fmp.js`, 215.156 B) línea a línea, el puente
(`app/wallet.tsx`) y el JWT real inyectado. Conclusión previa confirmada y AMPLIADA:

### 1. Por qué NO era la consola de agente esta vez

El SPA decide la vista con UNA sola lectura: `role = JSON.parse(atob(token.split(".")[1])).role`
sobre `localStorage["malabogo.token"]`; consola agente solo si `role==="AGENT"`. El JWT que
inyecta la app es el de `/mobility/auth/login`, verificado en vivo para +240555000003:
`{role:"DRIVER", ctx:"mobility"}` → **por esa puerta la consola de agente es imposible**.

Lo que el dueño veía es peor y más simple: **la vista normal del monedero es una maqueta de
diseño con datos falsos escritos a fuego**:

| Pantalla | Estado | Detalle |
|---|---|---|
| Home (`Np`) | ❌ MAQUETA | «Hola, **María** 👋», «Tu agente está en camino con tu compra protegida», tarjeta demo fija «Ruta del agente **MBO-0042** · 8 min · 45.000 XAF»; botón **Ayuda → `tel:+8619715853802` / wa.me chino** (bloqueado por la whitelist del WebView) |
| Monedero (`_p`) | ✅ REAL | `GET /wallet` + `/wallet/transactions`; recargar/retirar con PIN→payment-token→`deposits`/`withdrawals`; cancelar operación. Es la ÚNICA pantalla viva |
| Órdenes (`Xp`) | ⚠️ HÍBRIDA | crear orden escrow sí es API real; la lista lee `localStorage["malabogo.escrow"]` (solo la última orden creada EN ESE dispositivo) |
| Perfil (`bp`) | ❌ MAQUETA | «**María Nsue Obiang** · +240 222 123 456» fijos; solo el botón logout es real |
| Consola agente (`qp`) | ✅ REAL (para AGENT) | confirm-cash-in/out con OTP contra `/agent/operations/*` |

El cliente API del bundle está COMPLETO (12 métodos reales); la maqueta es solo de pintado.

### 2. Defectos del puente encontrados (y su estado)

- `postMessage("LOGOUT")` del SPA va en **texto plano**; la app hacía `JSON.parse` → el cierre
  de sesión del monedero nunca llegaba a la app. **Corregido** en `wallet.tsx` (acepta ambas).
- Inyección del JWT antes de cargar contenido: correcta; whitelist de origen: correcta;
  refresh por cambio de token: añadido hoy. Ningún otro agujero.
- El SPA no refresca tokens ni maneja 401 (limitación heredada, mitigada desde la app).

### 3. Veredicto

El dueño tiene razón en las dos cosas: (a) la consola de agente no debería convivir en el
mismo SPA del usuario, y (b) **este monedero WebView es una maqueta, no un producto**. El
backend del monedero (hk) sí es real y está probado (lb95a/lb96a verdes: saldo, depósitos,
retiradas, escrow, tokens de pago). Recomendación registrada: reconstruir la interfaz del
monedero **nativa dentro de la app** (misma API), con lo que además el monedero puede ser
método de pago de los viajes (la liquidación P1-c ya liquida contra escrow del monedero).
Pendiente de decisión del dueño.

**Decisión del dueño (misma tarde): sí, monedero NATIVO** («opción uno… tienes luz verde»),
con la mirada puesta en una posible cooperación con **Muni Dinero** como segundo rail.

---

## Tanda P2 — Monedero nativo en la app (17/09, tarde)

El WebView queda **fuera de todas las entradas**; el monedero es ahora pantalla nativa
contra la misma API ya probada.

### Qué se construyó

| Fichero | Qué es |
|---|---|
| `api/wallet.ts` | Cliente nativo: saldo, movimientos (cursor + filtro), agentes, token de pago PIN, recarga, retirada, cancelar operación. Reutiliza `httpClient` (sesión + refresco 401 silencioso) y `nuevaLlave()` para la Idempotency-Key |
| `app/monedero.tsx` | Saldo disponible + en garantía, cupo de hoy (recarga/retirada restante), acciones Recargar/Retirar, acceso a PIN y últimos 8 movimientos con estado real |
| `app/monedero-movimientos.tsx` | Historial completo: paginación por cursor, filtros (recargas, retiradas, pagos, cobros, reembolsos, comisiones) |
| `app/monedero-recargar.tsx` | Importe → agente (lista REAL) → PIN → operación + **OTP para enseñar al agente**; el saldo entra cuando el agente confirma |
| `app/monedero-retirar.tsx` | Importe → agente → motivo (AML ≥ 10 chars, lo exige el servidor) → PIN → OTP + comisión retenida |
| `app/monedero-pin.tsx` | Alta/cambio del PIN con la contraseña de la cuenta (verificación real del servidor) |
| `components/PinSheet.tsx` | Hoja de PIN reutilizable (mismo patrón que el pago de viajes), con modo «primer uso» que pide la contraseña y crea el PIN |

Entradas cambiadas a `/monedero`: «Monedero» del pie (`app/index.tsx`), cajón de servicios
(`components/ServicesDrawer.tsx`) y «Métodos de pago» de Mis documentos (`app/documents.tsx`).
`app/wallet.tsx` (WebView) queda como respaldo por URL directa, sin mantenimiento.

### Backend — parche 95

`GET /v1/wallet/agents`: agentes de efectivo ACTIVE (`id`, `code`, `zone`, `name`). La
maqueta pedía **teclear el UUID del agente a mano**; sin esta lista el flujo nativo no tenía
selector. Dos consultas + merge porque el rol de `PrismaService` **no tiene grant sobre
`mobility.users`** (frontera de permisos correcta: se respeta, no se amplía). Respaldos:
`wallet.service.ts.bak-agents-20260917`, `wallet.controller.ts.bak-agents-20260917`.
Verificado en vivo con token de conductor: 4 agentes activos (MBO-0042 · Paraíso ·
BERNARDO LOPERTE + 3 de prueba TST-*). Regresión `lb95a` tras el parche: **TODO OK** (75 OK).

### Método de pago

El monedero ya es método de pago de los viajes desde P1-c: cuando el conductor propone
precio, el pasajero ve «Confirmar precio y pagar · X XAF» (bloqueo del fare en el monedero
con PIN, comisión congelada) o «Prefiero pagar en efectivo al llegar». Lo que faltaba era
que el monedero existiera como **pantalla propia de verdad** (entrada «Métodos de pago»),
que es lo que ahora hay.

### Rails (Muni Dinero)

Las pantallas están partidas en «elegir rail → importe → PIN → OTP», con el rail de efectivo
como único implementado. Añadir Muni Dinero es un rail más (y, si su API lo pide, un
endpoint de depósito/retirada paralelo); no hay que rehacer pantallas ni el flujo de PIN.

### Lo que NO queda probado (le toca al dueño)

- Las pantallas nativas en el móvil: saldo real, recarga con agente (OTP), retirada con
  motivo, historial y cambio de PIN. El APK se compiló e instaló (17/09 13:05).
- `tsc` de la app: 0 errores. Backend: `tsc` 0 errores y build limpio en el parche 95.

---

## P2 (continuación, 17/09 tarde-noche) — monedero único, panel de agentes y el pago que falta

### 1. El monedero viejo, retirado

El dueño: «entrando desde la home del monedero sigue con el aspecto anterior… creo que esta
entrada ya no hace falta seguir manteniendo». Comprobado: ninguna pantalla navegaba ya a
`/wallet` (las tres entradas apuntan a `/monedero`), pero **la ruta del WebView seguía
registrada** y era alcanzable por URL directa. Se retiró: `app/wallet.tsx` vive ahora en
`respaldo/wallet-webview-20260917.tsx.txt` (+ `LEEME-wallet-webview.txt` con cómo
restaurarlo). `react-native-webview` ya no se usa en ninguna pantalla de la app.

### 2. Panel de agentes: por qué «seguía sin estado» (y arreglo)

Diagnóstico: el agente **no tenía ni un solo endpoint de lectura**. `agent.controller.ts`
solo tenía POST (`confirm-cash-in`, `confirm-cash-out`, `scan/pickup`, `scan/delivery`), así
que el agente entraba y no había nada que ver. Eso es «sin estado», literalmente.

- **Parche 96 (servidor)**: `GET /v1/agent/me` (perfil por `userId` + cuánto tiene pendiente)
  y `GET /v1/agent/workload` (cola: operaciones de efectivo por confirmar + recados en curso,
  con nombre y teléfono del cliente vía identidad unificada). Autorizados por **identidad**,
  no por rol: el JWT de la app es DRIVER/PASSENGER/ADMIN y **nunca** trae AGENT (el rol de
  agente de caja lo emite el login PIN del monedero). Respaldos
  `wallet.service.ts.bak-agente-panel-20260917`, `agent.controller.ts.bak-agente-panel-20260917`.
- **Panel nativo** `app/agente.tsx`: identidad del agente (MBO-0042 · Paraíso · límite diario),
  trabajo pendiente, efectivo a confirmar con el código que enseña el cliente (reutiliza
  `PinSheet`), y recados con su estado.
- **Escáner QR real** `app/agente-escaner.tsx` (expo-camera, `CameraView`): recogida del
  vendedor y entrega al comprador — el escaneo de entrega es el que libera el dinero al
  vendedor. `CAMERA` añadido a `android.permissions` en `app.json`.
- **Acceso** `core/useSoyAgente.ts` (hook estándar, una sola fuente de verdad) + fila en el
  cajón de servicios **solo si el servidor dice que la cuenta es agente**, con el número de
  tareas pendientes en la etiqueta.
- Verificado en vivo: 003 (+240555000003) ES el agente MBO-0042 y tiene trabajo real de la
  semilla (1 recarga, 1 retirada, 1 recogida, 1 entrega); un pasajero devuelve `agent:null`
  (la fila no aparece). `tsc` 0 errores; APK compilado e instalado 17/09 14:10.

### 3. El pago que falta: el monedero como método de pago de TODOS los servicios

Lo que el dueño pide («que todos los servicios puedan comprar sus mercancías con el monedero y
que la otra parte reciba el efectivo en el suyo») tiene ya medio camino hecho y un bloqueo
localizado en el servidor:

- **La app ya tiene el hueco**: `ecomerse-checkout.tsx` ofrece «Efectivo a la entrega», «Pago
  Billing» y un tercero **deshabilitado: «Eg Pay» (Próximamente)**. Ese es el sitio del monedero.
- **El servidor lo tiene marcado como inactivo en cuatro sitios**, con una nota que ya no es
  cierta: `likebook_wallet: 'coming_soon', // el monedero aún no existe como módulo`
  (`lifebook/commerce.service.ts`, `orders.service.ts`, `reservations.service.ts`,
  `hotel.service.ts` — este último además lo filtra al escribir métodos activos).
- **La pieza de dinero ya existe**: el libro de escrow del monedero (LOCK → RELEASE con comisión
  y reparto al vendedor) está probado por el e2e P1-c. Lo que falta es **conectar el pedido de
  comercio con ese escrow**: crear la orden de comercio con `likebook_wallet` → bloquear el
  importe del comprador → al entregar/confirmar, liberar al vendedor **en su monedero**, con la
  comisión de la plataforma. Los verticales a cubrir: mercado Life Book, comida, hotel y
  ciudad-a-ciudad.

Ese es el siguiente bloque de trabajo; queda escrito aquí para no perderlo.

---

## Parche 97 — EL MONEDERO COMO PASARELA DE PAGO DEL COMERCIO (17/09, noche)

El objetivo del dueño: «que todos los servicios puedan comprar sus mercancías con el monedero y
que la otra parte reciba el efectivo en el suyo». Bloqueo localizado en el servidor: en
`lifebook/commerce.service.ts` el método estaba como `likebook_wallet: 'coming_soon'` con la nota
«el monedero aún no existe como módulo» — verdad cuando se escribió, mentira desde hoy. El
comercio liquidaba en sus propias cuentas (`lifebook.ledger_entries`, liquidación por admin) y el
monedero no participaba en nada.

### Qué se hizo (servidor)

- **`wallet.service.ts` — tres movimientos nuevos**, idempotentes:
  `lockForCommerceOrder` (bloquea el importe del pedido con token PIN scope `ESCROW_LOCK`),
  `linkCommerceLock` (enlaza el cerrojo con el pedido), `releaseCommerceOrder` (al entregar:
  el vendedor cobra su neto EN SU MONEDERO y la comisión queda como `FEE` de plataforma) y
  `refundCommerceOrder` (al cancelar: devolución íntegra al comprador).
- **`lifebook/orders.service.ts`** — enganchado en los cuatro puntos reales del dinero:
  al **crear** (el dinero se retiene ANTES de crear el pedido; si el pedido falla, se devuelve),
  al **entregar** (acción `deliver` y confirmación por código) y al **cancelar/rechazar**.
  La liberación va FUERA de la transacción del pedido (el monedero es otro cliente de BD) y con
  `catch`: si falla, el dinero se queda RETENIDO —dirección segura— y el reintento es idempotente.
- **`orders.controller.ts`** — acepta `X-Payment-Token`.
- **Método activado**: `likebook_wallet: 'active'`. Las tiendas siguen decidiendo si lo aceptan
  (`lifebook.shop_payment_methods`); nada cambia para quien no lo active.

### Verificado: `lb97a-wallet-comercio.cjs` → TODO OK

1. **Compra con monedero**: disponible 30.000 → 28.500 y garantía 0 → 1.500; cerrojo enlazado al
   pedido; el pedido nace `payment_status=paid`.
2. **Entrega**: el vendedor cobra **+1.000 en su monedero** (comisión 500 asentada como `FEE`),
   la garantía del comprador queda a 0, hay **UNA** liberación y repetir la entrega **no** paga dos veces.
3. **Cancelación**: devolución íntegra (garantía 0, disponible intacto, una sola `ESCROW_REFUND`).
4. **Idempotencia**: mismo `Idempotency-Key` → mismo pedido y **sin** bloquear dos veces.
- Regresión `lb95a` (viajes/liquidación) tras el parche: **TODO OK** (75 comprobaciones).

### Dos fallos que cazó el propio e2e (y quedan escritos para no repetirlos)

- **`tx_shape_chk`**: la tabla `wallet.transactions` impone la FORMA de cada asiento —
  `ESCROW_LOCK` con remitente y sin destinatario, `ESCROW_RELEASE`/`ESCROW_REFUND` con ambos,
  `FEE` con remitente. Inventarse la forma da un 23514 y el dinero no se mueve. (El bloqueo
  funcionó a la primera porque su forma se copió del escrow que ya existía; las otras dos no.)
- **Comprobar «¿ya se cobró?» por importe y comprador** confundía la liberación de un pedido
  anterior del mismo comprador por el mismo importe, y la devolución se quedaba sin hacer.
  Ahora se comprueba **por la referencia del pedido**.

### En la app

`app/lifebook-checkout.tsx` (el checkout del mercado Life Book) ya cobra con el monedero: la
forma de pago aparece sola cuando el servidor la da por activa, y al confirmar pide el **PIN**
(hoja reutilizada), emite el token del importe EXACTO y crea el pedido con `X-Payment-Token`.
Muestra el saldo del monedero al elegir esa forma de pago. Con el primer pago, si el usuario
aún no tiene PIN, la misma hoja permite crearlo con la contraseña de la cuenta.
`api/commerce.ts` (`commerceOrdersApi.create`) acepta el token de pago. `tsc` 0 errores.
APK compilado e instalado (17/09 14:30).

### Pendiente (siguiente bloque)

- **Comida** (`food-checkout.tsx`, servicio propio), **hotel** (reservas: el hotel filtra
  `likebook_wallet` al escribir sus formas de pago) y **ciudad-a-ciudad**: mismo trabajo, cada
  uno con su flujo. El de comercio ya está hecho y probado.
- **Ecomerse** (el otro mercado, `/api/ecomerse/*`) va por un backend DISTINTO del de Life Book:
  ahí el hueco es la tarjeta «Eg Pay (pago digital) — Próximamente» del checkout.
- El **reparto** (`a_pagar_reparto`) hoy queda retenido como ingreso de plataforma; su pago al
  repartidor necesita su módulo.

---

## Parche 98 — EL MONEDERO PAGA EN COMIDA RÁPIDA (17/09, noche)

Segundo vertical del objetivo. La comida NO está en Life Book: es su propio módulo
(`src/food/`, rutas `/api/food/*`), con su tabla (`wallet.food_orders`), su desglose
congelado (`food-fees`: comisión de plataforma con mínimo, comisión de reparto, tope del 40 %
y neto del restaurante) y su contabilidad de repartidor. Estaba cerrada con un flag mentiroso:
`flags().escrow` devolvía `false` a fuego.

### Lo que se hizo

- **Servidor**: `likebook_wallet` como forma de pago (flag `FOOD_WALLET_ENABLED`, DTO ampliado);
  el importe se **retiene antes de crear el pedido** y si el pedido no llega a crearse se
  **devuelve**; al **entregar** el restaurante cobra su NETO en su monedero y la comisión de
  plataforma (con la del reparto, que aún no tiene módulo de pago) queda como `FEE`; al
  **cancelar** vuelve todo al cliente. `flags().escrow` ya dice la verdad.
- **App**: `food-checkout.tsx` ofrece **Monedero** junto a efectivo y Billing, con el saldo a la
  vista («no llega» si no alcanza), PIN reutilizando `PinSheet` y `api/food.ts` enviando
  `X-Payment-Token`.
- **Verificado**: `lb98a-wallet-comida.cjs` → **TODO OK**. Comprobado en vivo: garantía
  (+1.500), el restaurante cobra **+900** en su monedero (comisión 25, reparto 575 retenido),
  garantía a 0, **una** liberación, `FEE` asentada, repetir la entrega no paga dos veces,
  cancelación con devolución íntegra y **token de un solo uso** (el segundo intento se rechaza
  con `PAYMENT_TOKEN_INVALID`).
- Regresión **`lb95a`** (viajes) tras el parche: **TODO OK** (75 comprobaciones) y
  **`lb97a`** (comercio) → **TODO OK**.

### Tres tropiezos reales, y lo que enseñan

1. **Frontera de módulos (la API se cayó unos minutos).** `WalletService` vive en el módulo
   raíz y `FoodModule` es otro módulo: inyectarlo sin declararlo allí tumbó el arranque de Nest
   (`Injector.lookupComponentInParentModules`, pm2 en `errored`). Se revirtió, se declaron
   `WalletService`, `PaymentAuthService`, `FeeService` y `KycGateService` en `FoodModule`
   (todos sin estado propio: el dinero está en Postgres) y se volvió a desplegar. Desde
   entonces el script de despliegue **comprueba la salud después del reinicio y se revierte
   solo** si la API no responde 200.
2. **`payment_method` era `varchar(10)`** y `likebook_wallet` tiene 15 → `22001`. Se amplió a
   `varchar(20)`. Ojo: **`ecomerse_orders` y `ecomerse_escrow` siguen en `varchar(10)`** — el
   mismo trabajo las necesitará. (`lifebook.orders` y `reservations` ya tenían su CHECK con
   `likebook_wallet`: el vocabulario estaba previsto.)
3. **`cached plan must not change result type` (`0A000`)**: tras el `ALTER`, las conexiones del
   pool conservaban planes cacheados del tipo viejo y todo `SELECT o.*` fallaba. Se arregla
   reiniciando la API (renueva el pool). Va aquí porque volverá a pasar con cada cambio de tipo.

### Regla de pruebas que sale de hoy

**No lanzar dos e2e del monedero a la vez**: comparten la MISMA cuenta de prueba (el pasajero
`+240555000111`) y sus fixtures se pisan — una corrida dio `FALLOS=1` por eso y al repetirla
sola salió TODO OK.

### Pendiente

**Hotel** (sus reservas filtran `likebook_wallet` al escribir formas de pago), **ciudad-a-ciudad**
y **Ecomerse** (otro backend, `/api/ecomerse/*`, columna de 10 caracteres y la tarjeta «Eg Pay»
deshabilitada en su checkout).

---

## Parche 99 — EL MONEDERO PAGA LA SEÑAL DEL HOTEL (17/09, noche)

Tercer vertical. El hotel no cobra el total: cobra una **SEÑAL** (porcentaje configurable) y el
resto al llegar. Estaba cerrado por dos sitios: el hotel tenía prohibido activar el monedero
(`hotel.service.ts` lo filtraba al guardar su ficha) y el `status` de una reserva con señal nacía
en `hold` = «retenida hasta que llegue la transferencia», que con el dinero ya retenido no tiene
sentido.

### Lo que se hizo

- **Servidor**: con `likebook_wallet` la **señal se retiene** al reservar (token PIN, scope
  `ESCROW_LOCK`, importe calculado por el servidor) y la reserva nace `pending` —el hotel puede
  confirmar sin esperar comprobantes— con `payment_status = deposit_paid`. Al **registrar la
  entrada** el hotel cobra la señal en SU monedero; al **cancelar** vuelve íntegra; en **no
  presentado** se queda el hotel (es su compensación: para eso existe la señal). El **barrido de
  caducadas** incluye ahora las señales del monedero y las DEVUELVE (antes una reserva retenida
  podía quedarse así para siempre, porque el barrido solo miraba las que esperaban transferencia).
  El hotel ya puede activar el monedero como cualquier otra forma de pago.
- **e2e `lb99a` → TODO OK**: señal de 1.000 retenida, reserva `deposit_paid`, hotel confirmó y
  registró entrada → **+1.000 en su monedero** con una sola liberación, y cancelación con
  devolución íntegra. (Hoteles no tiene comisión de plataforma todavía: el hotel cobra la señal
  íntegra; cuando exista, entra en el mismo sitio que en comercio y comida.)

### Un fallo REAL de la app que destapó el e2e (y quedó arreglado)

Al hacer dos reservas seguidas de la misma noche, la segunda fallaba con «ROOM_SOLD_OUT: alguien
acaba de coger esas noches» **con el hotel vacío**: la inserción de noches usaba siempre los
índices de unidad 0..n-1, así que chocaba con la unidad 0 de la primera reserva. Es decir: **un
hotel con 5 habitaciones del mismo tipo no podía aceptar dos reservas para la misma noche**. Ahora
se eligen las unidades LIBRES de cada noche y el `ON CONFLICT` sigue siendo la red contra la
sobreventa real (dos a la vez: el segundo inserta menos filas y se le dice que no).

### Lo que la app NO tiene (hallazgo honesto)

`hotelApi.createReservation` existe en el cliente, pero **ninguna pantalla lo llama**: en la app
se pueden VER y CANCELAR reservas, no crearlas (la reserva se crea desde el panel/servidor). Así
que el pago con monedero del hotel está listo y probado en el servidor, pero **no hay pantalla de
reserva donde ofrecerlo**. Hacer esa pantalla (fechas, habitación, huéspedes, % de señal) es una
pieza de producto aparte, no un cableado de pago.

### Pendiente

**Ciudad-a-ciudad** (intercity) y **Ecomerse** (otro backend, columnas de 10 caracteres y la
tarjeta «Eg Pay» deshabilitada).

---

## Parche 100 — EL MONEDERO PAGA EL BILLETE CIUDAD-A-CIUDAD (17/09, noche)

Cuarto y último vertical de los que nombra el objetivo. Su modelo de dinero es DISTINTO a los
otros tres: el billete lo cobra el conductor (efectivo al abordar o al llegar) y la plataforma le
descuenta su comisión (5 % por defecto, según su plan) creándole una **deuda** en
`billing_commissions`. Con el monedero, esa comisión se descuenta **en origen**.

### Lo que se hizo

- **Servidor**: la reserva acepta `paymentMethod: 'likebook_wallet'` y **retiene el importe** del
  billete (token PIN, scope `ESCROW_LOCK`, importe calculado por el servidor = tarifa × asientos);
  si la reserva no llega a crearse, el dinero vuelve. Cuando el conductor confirma el cobro, cobra
  en SU monedero el importe **menos la comisión** (que queda como `FEE` de plataforma) y **no se le
  crea la deuda** de comisión: ya se la llevó la plataforma del importe retenido. Cancelación o
  tarifa rechazada → devolución íntegra.
- **Lección del DI aplicada ANTES de romper nada**: `IntercityModule` es un módulo aparte, así que
  el monedero y su closure (`WalletService`, `PaymentAuthService`, `FeeService`, `KycGateService`)
  se declararon allí en el MISMO parche. (En comida esto se aprendió tumbando la API.)
- **`ValidationPipe` con `whitelist: true`**: el campo nuevo del DTO se añadió **con decoradores**
  (`@IsOptional() @IsString() @IsIn([...])`) — sin ellos, Nest lo borra en silencio y el método
  nunca llegaría al servicio.
- **e2e `lb100a` → TODO OK**: billete de 5.000 retenido; el conductor cobra **4.750** (250 de
  comisión, asentada como `FEE` y **sin** deuda en `billing_commissions`); cancelación con
  devolución íntegra. (Fixture: las tablas de intercity **no** tienen default de `id` — hay que
  darlo explícito al insertar.)

### Estado del objetivo (3): los cuatro verticales

| Vertical | Servidor | e2e |
|---|---|---|
| Mercado Life Book | ✅ parche 97 | ✅ `lb97a` TODO OK |
| Comida Rápida | ✅ parche 98 | ✅ `lb98a` TODO OK |
| Hotel (señal) | ✅ parche 99 | ✅ `lb99a` TODO OK |
| Ciudad-a-ciudad | ✅ parche 100 | ✅ `lb100a` TODO OK |

### Lo que falta, y es de la APP (hallazgo honesto, otra vez)

`api/intercity.ts` tiene el cliente de reservas, pero **ninguna pantalla lo llama**: igual que en
hotel, en la app se ven y se cancelan reservas, no se crean. Así que en estos dos verticales el
pago con monedero está probado en el servidor pero **no hay pantalla donde ofrecerlo**. Cablearlo
cuando exista la pantalla es el mismo trabajo que en Life Book y comida (menú + PIN + token).

Queda además **Ecomerse** (otro backend, `/api/ecomerse/*`, columnas de 10 caracteres y la
tarjeta «Eg Pay» deshabilitada en su checkout), que NO está entre los cuatro verticales del
objetivo pero es el mismo trabajo.

---

## Parche 101 — EL MONEDERO PAGA EN ECOMERSE (17/09, noche)

Quinto vertical (no estaba entre los cuatro del objetivo, pero es el otro mercado de la app y era
el mismo trabajo). Ecomerse tenía la tarjeta **«Eg Pay (pago digital) · Próximamente»**
DESHABILITADA en su checkout, un escrow «preparado» de F2 nunca activado (`ecomerse_escrow`, con
tokens y modelo propio) y las columnas de 10 caracteres.

### Lo que se hizo

- **Servidor**: `likebook_wallet` como forma de pago (flag `ECOMMERSE_WALLET_ENABLED`, DTO ampliado);
  el importe (productos + reparto) se **retiene** dentro del mismo flujo —el total lo conoce el
  servidor al agrupar la compra— y si algo falla se **devuelve**; al **entregar**, el vendedor cobra
  en su monedero el importe **menos el reparto** (que queda retenido como ingreso de plataforma
  hasta que exista su módulo de pago); al **cancelar**, vuelve íntegro.
- **Columna ampliada** (`payment_method` 10 → 20): el e2e de comida ya había tropezado con esto.
- **App**: el checkout de Ecomerse ya cobra con el monedero — la tarjeta que decía «Próximamente»
  es ahora **Monedero**, con el saldo a la vista («no llega» si no alcanza), PIN reutilizando
  `PinSheet` y `api/ecomerse.ts` enviando `X-Payment-Token`.
- **LIMITACIÓN EXPLÍCITA Y HONESTA**: Ecomerse crea **un pedido por vendedor** y el token de pago
  va ligado a UN importe, así que **con monedero solo se admiten compras de UNA tienda** (el caso
  normal). Con artículos de varias tiendas, el servidor lo dice claro en vez de cobrar a medias.
- **e2e `lb101a` → TODO OK**: compra de 4.000 retenida, el vendedor cobra al entregar, la garantía
  del comprador queda a 0, repetir la entrega no vuelve a pagar y la cancelación devuelve íntegro.

### Un tropiezo de esta ronda (menor, pero anotado)

El parche del servicio falló al insertar la dependencia del monedero en el constructor: el
constructor de `EcomerseService` tiene un `forwardRef(() => BillingService)` anidado y un regex
ingenuo se paraba en el primer paréntesis. Se resolvió insertando con **ancla de texto** y el script
ahora lo dice: cuando un constructor lleva `forwardRef`, no se toca con regex.

### Regresión completa (los cinco e2e, en serie → todos TODO OK)

`lb97a` comercio · `lb98a` comida · `lb99a` hotel · `lb100a` ciudad-a-ciudad · `lb101a` Ecomerse.

### Estado final de «el monedero como pasarela de pago»

| Vertical | Servidor | e2e | Pantalla en la app |
|---|---|---|---|
| Mercado Life Book | ✅ parche 97 | ✅ | ✅ checkout con PIN |
| Comida Rápida | ✅ parche 98 | ✅ | ✅ checkout con PIN |
| Hotel (señal) | ✅ parche 99 | ✅ | ⚠️ no existe pantalla de reserva |
| Ciudad-a-ciudad | ✅ parche 100 | ✅ | ⚠️ no existe pantalla de reserva |
| Ecomerse | ✅ parche 101 | ✅ | ✅ checkout con PIN (una tienda por compra) |

**Lo que NO es un cableado pendiente** (para no confundirlo con deuda técnica): hotel y
ciudad-a-ciudad no tienen pantalla de creación de reservas en la app — es una pieza de producto que
no existe, no un pago a medio conectar. Y el **reparto** (`a_pagar_reparto`, `logistics_fee`,
`rider_fee`) queda en todos los verticales como ingreso de plataforma hasta que exista su módulo de
pago al repartidor.