# P1-c · EJECUCIÓN Y VERIFICADO — Liquidación de viajes de taxi al ledger

> Tanda ejecutada el 16–17/09/2026 sobre el diseño aprobado de
> `P1-c-LIQUIDACION-VIAJES.md` (decisiones del dueño CERRADAS: Malabo 20 % con
> tope 1.500, Bata 50 plano, ventana gratis 5 min, cuota 200 o 20 % (la menor),
> 3 faltas/7 días → suspensión, auto-cierre 10 min, plan B no activado).

## 1. Qué se desplegó (servidor `8.218.88.237:/opt/mirror/app`, pm2 `malabogo-api`)

| Pieza | Fichero | Qué hace |
|---|---|---|
| BD | `pruebas/86-liquidacion-viajes.sql` | enums TRIP + TAXI_MALABO/TAXI_BATA, políticas en `wallet.fee_policies` (editables SIN recompilar), columnas de liquidación en `mobility.taxi_requests`, `suspended_until`/`suspension_count` en `mobility.drivers`. Idempotente, ya aplicado. |
| Servicio | `src/services/ride-settlement.service.ts` (nuevo, ~980 l) | lock con PIN (fee CONGELADA en `fee_info`), llegada, settle (RELEASE neto→conductor + FEE→plataforma, ambos contra el ESCROW del pasajero), cancel con ventana/cuota, driver-cancel con strikes y suspensión, disputa + reversión total, vista derivada del ledger y barrido de reconciliación cada 30 s. |
| Controlador | `src/http/ride-settlement.controller.ts` (nuevo) | `v1/rides/:tripId/{lock,cash,arrival,settle,cancel,driver-cancel,dispute,settlement}` + `v1/rides/quote` + `v1/admin/rides/:tripId/dispute/resolve` y `GET v1/admin/rides/disputes`. |
| Parche | `pruebas/parche91-ride-settlement.py` (+`parche91b-fix.py`) | 9 ficheros: token TRIP (payment-auth + dto), `FeeService.applyFee` con `overrideFee` (fee congelada, reparto íntegro a plataforma si no hay política), enums del `schema.prisma` wallet, `city` al crear viaje + suspensión al aceptar + guardas `SETTLEMENT_REQUIRED` en la puerta vieja + `cancelled_by` en todas las salidas + columnas de liquidación en panel/historial, **`POST v1/wallet/pin`** (ver gap §3), alta en `app.module`, códigos HTTP en `error.filter`. Respaldos `.bak-ride-settlement-p1c-20260916` en cada fichero. |

**Decisión de libro (ajuste sobre el doc, misma invariant):** el cierre saca el
dinero del ESCROW del pasajero partido en dos — `RELEASE(neto→conductor)` +
`FEE(comisión→plataforma)`. Así la invariant del diseño §4.4
(ΣRELEASE + ΣFEE == ΣLOCK − ΣREFUND) se cumple viaje a viaje sin que el
conductor anticipe la comisión. La reversión de disputa hace lo inverso: el
conductor devuelve el neto, la plataforma su fee, el pasajero recupera el fare
íntegro.

## 2. Verificado (e2e `pruebas/lb95a-liquidacion-viajes.cjs`, TRES corridas: las dos últimas completas)

Corrido REAL contra `http://127.0.0.1:3000/api/v1` en el servidor — **TODO OK**:

* Happy Malabo 1500 → fee congelada 300 → conductor +1200, plataforma +300; invariant exacta.
* Ventana gratis Bata 500 → devolución íntegra; cero transacciones de cuota.
* Cuota no-show fuera de ventana → 100 al conductor (`min(200, 20 %·500)`), 400 de vuelta.
* 3 cancelaciones de conductor en 7 días → `suspended_until` + `DRIVER_SUSPENDED` al aceptar (y reset para la corrida).
* Disputa tras cierre → admin `REFUND_PASSENGER` → pasajero recupera 2000 íntegros; plataforma y conductor vuelven a su línea; libro del viaje cuadra (lock 2000 / rel 1600 / fee 800 con reversa / refund 1600).
* CASH: `choose-cash` y viaje antiguo completado sin lock → `settlement_kind='CASH'`, CERO transacciones.
* Idempotencia: doble lock y doble settle → `replay:true` sin duplicar el ledger.
* Guardas: sin token → `PAYMENT_TOKEN_INVALID`; importe ≠ → `SCOPE_MISMATCH`; cerrar sin llegada → `NOT_ARRIVED`; puerta vieja de cancelación sobre viaje bloqueado → `SETTLEMENT_REQUIRED`.
* `GET v1/rides/quote`: Malabo 1234 → 246 (suelo del 20 %), Bata 500 → 50 plano.
* CUADRE GLOBAL: Σdeben==Σhaber en todos los viajes, y Δ saldo == Δ libro por parte (pasajero/conductor/plataforma × available/escrow).

## 3. Hueco tapado: el PIN de 6 dígitos no existía para la auth unificada

`ensureProvisioned` heredaba al monedero la CONTRASEÑA de mobility como
`pin_hash`, y `verifyPin` exige 6 dígitos → ningún usuario de la auth unificada
podía emitir un token de pago. Se añadió `POST v1/wallet/pin` (dentro de
parche91): pide la contraseña actual (verificada contra
`mobility.users.password_hash`) o el PIN anterior en cuentas legacy, y escribe
el PIN nuevo. La app lo usa en el primer pago (hoja «¿Primer pago?…»).

## 4. App (cambios hechos y compilados; sin probar en pantalla)

* `api/settlement.ts` (nuevo): `tokenDeViaje`, `fijarPin`, `settlementApi.{view,lock,chooseCash,arrival,settle,cancel,driverCancel,dispute,quote}`.
* `app/taxi.tsx`: ciudad en `createTrip`; en la fase «conductor en camino» la tarjeta de **propuesta de precio con comisión y neto del servidor** → botón «Confirmar precio y pagar» → hoja PIN (alta de PIN la primera vez); chip verde de fare bloqueado con la ventana de 5 min; tarjeta de **LLEGADA** con cierre manual y cuenta atrás del auto-cierre; resumen de liquidación + **Disputar** (7 días) en el viaje cerrado; la cancelación antigua enruta por liquidación cuando hay lock (mensaje de cuota/devolución).
* `app/conductor.tsx`: ciudad y `fee_info` en la oferta — el «ganas» de la tarjeta de aceptar sale de `rides/quote` (con «≈» mientras llega); botón **«He llegado al destino»** → «⏳ Esperando confirmación del pasajero»; el neto real en la tarjeta de viaje; cancelación de emergencia por `driver-cancel` (reembolso + falta, aviso de suspensión); salida de la ruta cuando el pasajero cierra (aviso con el neto cobrado).
* `app/trips-history.tsx`: tarjeta de liquidación por viaje (comisión, neto, cuota de absentismo, quién canceló, estado de la disputa resuelta).
* `tsconfig.json`: excluido `backend/server-patch` (espejo de ficheros del servidor).

Typecheck de la app: **0 errores**. Endpoints nuevos: 401 sin token (vivos).
**APK compilado** (`android\app\build\outputs\apk\release\app-release.apk`,
111 MB, verificado dentro del bundle Hermes: todas las cadenas nuevas de P1-c y
las rutas `/lock /arrival /settle /cash /dispute /driver-cancel /settlement`).

**Hueco tapado en `compilar-apk.ps1`**: la línea de `gradlew` tenía la misma
trampa que el script ya documentaba para `adb` — con `$ErrorActionPreference =
'Stop'`, cualquier aviso NORMAL de stderr de Gradle («Starting a Gradle Daemon»)
mataba el script **aunque el build saliera verde**; además, si el build fallaba
pero existía un APK viejo, el script lo anunciaba como bueno. Ahora la llamada a
Gradle baja la preferencia solo para ella y el script **exige** ver
`BUILD SUCCESSFUL` en la salida. Probado de punta a punta tras el arreglo
(bloqueo → 13 s → APK → liberado, exit 0).

## 5. Qué NO queda verificado (honesto)

* ~~Pendiente del diseño §2.2, línea 68-69~~ → **RESUELTO el 17-09 con el
  dueño**: «contar como ingreso, sin bloquear pagos». Aplicado
  (`parche92-usage-release.py`, backup `.bak-usage-release-20260917`):
  `usageToday('DEPOSIT')` del monedero suma ahora también los
  `ESCROW_RELEASE` COMPLETED recibidos hoy (los netos de viaje y las cuotas de
  absentismo); los `ESCROW_REFUND` NO suman (es dinero propio volviendo).
  Verificado en vivo con `lb96a-limite-diario.cjs` (**TODO OK**): neto 1200 →
  `today.deposited +1200`; cuota +100 sumada; devolución de 400 sin sumar; y
  con `daily_limit` forzado a 100 (muy por debajo del ingreso), liquidar el
  viaje sigue funcionando y el conductor cobra — el cupo solo se nota al
  intentar DEPOSITAR, nunca al pagar. Nota del paso 2: `POST /wallet/deposits`
  es `@Roles('USER')` (diseño preexistente del monedero: la cuenta CONDUCTOR
  no tiene ese endpoint), así que el `DAILY_LIMIT_EXCEEDED` sobre el cupo
  nuevo queda probado por composición — el contador se verificó en vivo y el
  cortocircuitos `assertLimits` es código ya probado por los e2e del monedero.
  Efecto colateral APROBADO por el dueño: el vendedor del escrow comercial
  cuenta igual (mismo principio).

* **La UI en el teléfono**: los flujos nuevos no se han tocado en el Poco F5
  (APK **compilado, no instalado**: el USB cae y el dueño hace las pruebas de
  pantalla; el e2e cubre API+ledger). En el bundle verificado que las pantallas
  nuevas están dentro.
* El auto-cierre por barrido (10 min) y el reembolso zombie (90 min) están
  exercitados SOLO en código/reconciliación, no en vivo con reloj real: el
  e2e fuerza los estados por SQL. El barrido corre en producción (intervalo de
  30 s) y su reparación perezosa se ejercita en cada `GET settlement`.
* La comisión se puede cambiar por BD (`wallet.fee_policies`) sin recompilar —
  probado solo leyendo política existente, no cambiando en caliente.
* WebAuthn como método de pago sigue siendo el TODO del P1-a (no toca P1-c).

## 6. Números para la próxima tanda

Parches: **91, 91b, 92** (92 = cupo diario de ingresos, dueño 17-09), **93** (alias
`DRIVER→USER` en `RolesGuard` + reconstrucción de `guards.ts`, que amaneció truncado a 0
bytes el 17/09 09:05 sin explicación — ver `AUDITORIA-MONEDERO.md`) y **94** (validación
`agentId` ACTIVE → 400 `AGENT_NOT_FOUND` en deposits/withdrawals; respaldos
`guards.ts.bak-vacia-20260917`, `wallet.service.ts.bak-agent-validate-20260917`; copia
local del 93 en `backend/server-patch/parche93-guards/`) y **95** (`GET /v1/wallet/agents`
para el monedero nativo; respaldos `wallet.service.ts.bak-agents-20260917`,
`wallet.controller.ts.bak-agents-20260917`). Tras 93+94: `lb96a` **TODO OK**
con el paso del cupo ya en duro y `lb95a` **TODO OK** de regresión; tras 95, `lb95a`
**TODO OK** otra vez (75 OK). El monedero ya no es el WebView de la maqueta: la app tiene
pantallas NATIVAS (`app/monedero*.tsx` + `api/wallet.ts` + `components/PinSheet.tsx`) —
ver la tanda P2 en `AUDITORIA-MONEDERO.md`. SQL:
**86**. e2e: **lb95a** (liquidación) y **lb96a** (cupo diario). Sello de
respaldos: `ride-settlement-p1c-20260916` y `usage-release-20260917`. Ficheros de prueba de taxi del e2e: pasajero
`+240555000111` (PIN de pago 246810, saldo forzado a 30.000 como fixture),
conductor `+240555000003`, admin de prueba `+240555000999` (creado por SQL con
`original_creator='e2e-lb95a'`). Quedan viajes de prueba en `taxi_requests` y
~14.500 XAF de saldo en el monedero del conductor de prueba (netos acumulados de
las sucesivas corridas del e2e; el escrow restante del fixture «sin token» se
devuelve solo el barrido a los
90 min).
