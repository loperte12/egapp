# P1-c — Liquidación de viajes de taxi al ledger

**Fecha:** 16/09/2026 · **Estado:** DISEÑO (pendiente de OK del dueño para implementar)
**Parámetros puestos por el dueño:** 20% por viaje en Malabo · ~50 XAF fijo por viaje en Bata ·
**el precio se acuerda entre taxista y pasajero ANTES de iniciar el viaje** · política de
cancelación: imitar a DiDi.

> Honestidad metodológica: el buscador web de esta sesión se quedó sin créditos, así que el
> apartado DiDi está construido con sus políticas públicas conocidas (LatAm), no verificado hoy en
> vivo. Requiere contraste cuando vuelva la herramienta. No es doctrina: es criterio de diseño.

## 1) Cómo lo hace DiDi (lo relevante para nosotros)

1. **Precio cerrado antes de subirse (upfront fare).** DiDi calcula y muestra el precio final ANTES
   de confirmar el viaje (ruta + tráfico + tarifa dinámica). El pasajero acepta un número, no un
   "aproximado": la disputa sobre cuánto se paga muere antes de nacer. *Nuestra variante:* el
   número no lo pone un algoritmo sino el taxista (proposta) y lo acepta el pasajero — el efecto
   jurídico es el mismo: **precio pactado pre-viaje**.
2. **La comisión se descuenta al conductor en el momento del cobro**, nunca al pasajero en el
   precio: el pasajero paga el precio pactado; el conductor ve en su app "X cobrado, te liquidamos
   X − 20%". DiDi cobra entre ~15% y ~25% según ciudad/promo; en mercados pequeños o zonas baratas
   usa **tarifa plana o mixta** (un fijo + porcentaje) porque el 20% de 250 XAF no sostiene nada.
   *Nuestro caso encaja:* 20% en Malabo (viajes más caros), plano 50 XAF en Bata (viajes cortos).
3. **Cancelación (pasajero):** ventana gratuita tras asignar conductor (≈5 min); si cancela tarde
   o no se presenta y el conductor ya llegó y esperó (≈3–5 min), **cuota de cancelación** pequeña
   que va casi íntegra al conductor (compensa su tiempo) — en DiDi suele rondar el equivalente a
   1–2 km de trayecto, con tope. El viaje nunca cancelado **no se cobra**.
4. **Cancelación (conductor):** el pasajero no paga nada; el conductor acumula "strikes" (pena de
   suspensión temporal a las N faltas en 7 días). Si el viaje ya estaba en curso, reembolso total.
5. **Viajes en efectivo (clave para GQ):** donde el viaje se paga en mano, DiDi **liquida la
   comisión contra la cuenta del conductor** (saldo acumulado; si no paga, se suspende la cuenta
   hasta saldar). Es decir: la comisión NO depende de que el dinero pase por el monedero del
   pasajero — depende de registrar el viaje y debitar al taxista.
6. **Disputas:** "no subí" / "el conductor terminó antes" → se investigan con el recorrido GPS;
   procede reembolso y el pasajero recupera su cupo diario. Soporte con botón, sin juzgado.

## 2) Diseño para EG Route Plan (mapeado a lo YA construido)

Todo lo que sigue usa las tablas existentes — **sin migración nueva**: `Transaction`
(ESCROW_LOCK / ESCROW_RELEASE / ESCROW_REFUND / FEE), `referenceActivityId` (el viaje),
`LedgerEntry` (buckets), `PaymentAuthorization` (confirmación PIN de una sola vez), y el
`EscrowOrder` como patrón de máquina de estados.

### 2.1 Precio pactado
- El conductor, al aceptar la solicitud, fija **`fare`** (XAF, tope razonable por ciudad:
  500–15.000). El pasajero recibe proposta → **confirma con PIN** (`PaymentAuthorization`,
  scope TRIP, amount = fare) → ahí nace el `ESCROW_LOCK`.
- Viaje **en efectivo**: no hay lock (no hay dinero ourougeano que contar); el viaje se registra
  igual con `settlement = CASH` y la comisión se acumula al conductor (§2.4 plan B).
- Mientras no se pacte, el pasajero puede cancelar libremente (no hay lock).

### 2.2 Ciclo de vida (wallet)
```
PROPUEST ──(pasajero confirma PIN)──> LOCKED(fare)          [ESCROW_LOCK]
LOCKED ──(conductor llega a destino + pasajero confirma o auto 10 min)──> SETTLED
   SETTLED: RELEASE(fare − fee → conductor)  +  FEE(fee → plataforma)   [referencia = viaje]
LOCKED ──(pasajero cancela fuera de ventana)──> CANCELLED
   CANCELLED: RELEASE(cuota_cancelación → conductor) + REFUND(fare − cuota → pasajero)
LOCKED ──(conductor cancela / no-show conductor)──> ABORTED
   ABORTED: REFUND(fare completo) + strike conductor
SETTLED o LOCKED ──(disputa "no subí")──> DISPUTED → reembolso total al pasajero (soporte/robot
   con GPS) y la fee se reversa si ya se liberó
```
- **fee(Malabo) = 20% del fare**, redondeada hacia abajo, tope `FEE_MAX` (config) por viaje para
  no estranglear trayectos largos. **fee(Bata) = 50 XAF fijo.** Ambas en tabla/config por ciudad
  (`fee_kind = PERCENT | FLAT`, valor) — **nada hardcodeado en el servicio**, para que el dueño
  cambie porcentajes sin compilar.
- El límite diario del gate aplica sobre lo de siempre: el LOCK no descuenta cupo; el RELEASE al
  conductor **sí** entra como ingreso suyo (depósito virtual neto de fee).

### 2.3 Cancelación (adaptación DiDi, cifras para GQ)
- Ventana gratis pasajero: **5 min** desde asignación o antes de que el conductor marque "en
  camino→llegada".
- Cuota por no-show pasajero: **300 XAF Malabo / 200 XAF Bata** (o 20% del fare, el MENOR —
  nunca una cuota que supere el propio viaje). Va al conductor; si el lock tenía menos que la
  cuota, se libera todo al conductor y el saldo queda a cero (sin deudas).
- Conductor cancela tras aceptar: pasajero **nunca paga nada**; 3 cancelaciones/7 días → cuenta
  de conductor suspendida 24 h (reincidente: 7 días).
- El viaje no iniciado jamás se cobra. (Doctrina DiDi/uber: no subiste, no pagas.)

### 2.4 Comisión en viajes de efectivo (plan B — decidir si fase 2)
Como DiDi en mercados cash: el viaje CASH genera un **habre pendiente del conductor**
(`fee_owed` en su wallet, columna o tabla menor) y el conductor lo salda con CASH_IN al agente o
retraso de su saldo; impago acumulado > umbral → suspensión. **Recomendación: NO activar aún** —
primero que funcione el 100% del flujo wallet; los viajes cash quedan registrados (para métricas
y para poder aplicar esto después) pero sin deuda.

## 3) Decisiones del dueño — CERRADAS 16/09/2026 (implementar tal cual)
1. Ventana gratis de cancelación: **5 min**. Cuota por no-show: **200 XAF** (cualquier ciudad;
   sigue la regla «o 20% del fare, la MENOR»; va al conductor).
2. **Sí al cierre automático** del viaje a los **10 min** de marcada la llegada, **con botón de
   disputa** visible para el pasajero (y disputa fácil también tras cierre automático).
3. Tope de comisión: **FEE_MAX = 1.500 XAF** por viaje.
4. Plan B (comisión en viajes cash): **NO — fase 2**. Toda la energía en el flujo monedero.
**Comisiones confirmadas: Malabo 20% del fare (tope 1.500) · Bata 50 XAF plano.**

> Estado: DISEÑO APROBADO — pendiente de implementación (plan §4). Próxima tanda: servicio
> `ride-settlement` + config de fee por ciudad + endpoints + e2e con usuarios de prueba.

## 4) Plan de implementación (tanda propia, ~2–3 h)
1. `fare-config` por ciudad (tabla `city_fee_config` o JSON en config — mínimo viable: env).
2. Servicio `ride-settlement` replicando el patrón de `escrow.service` (lock/release/refund/fee
   ya probados) + estados, idempotencia (`idempotencyKey` por evento), `referenceActivityId`.
3. Endpoints: proposta/aceptación del pasajero (PIN → PaymentAuthorization scope TRIP), llegada
   (conductor), confirmación/auto (pasajero), cancelaciones con quién/cuándo.
4. e2e con los usuarios de prueba (+240555000111 como pasajero, crear conductor de prueba) —
   ledger cuadrado al final: ΣRELEASE + ΣFEE == ΣLOCK−ΣREFUND por viaje.
5. App: pantalla "propuesta de precio" en booking y detalle de liquidación en historial.
