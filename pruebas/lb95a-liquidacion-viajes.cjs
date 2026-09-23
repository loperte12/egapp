// =============================================================================
// lb95a-liquidacion-viajes.cjs — P1-c e2e REAL (docs/P1-c-LIQUIDACION-VIAJES.md §4.4)
//
// Cuadra el libro por viaje:  ΣRELEASE + ΣFEE == ΣLOCK − ΣREFUND  (no disputados)
// y por disputa:  los deltas de las tres partes vuelven a 0.
//
// Escenarios:
//   A) HAPPY wallet Malabo: proposta→PIN→lock(1500, fee congelada 300)→in_progress
//      →arrival→settle → conductor +1200, plataforma +300, invariant ✓
//   B) Ventana gratis: lock Bata 500 (fee 50) → cancel <5min → REFUND total
//   C) Cuota no-show: accepted_at desplazado 6 min → cancel → 100 al conductor
//      (min(200, 20 %·500)) + 400 de vuelta; invariant ✓
//   D) Strikes: 3 driver-cancel en 7 días → suspensión → accept → DRIVER_SUSPENDED
//      (y reset para seguir)
//   E) Disputa tras cierre: dispute → DISPUTE_OPEN al cerrar → admin REFUND →
//      pasajero recupera el fare COMPLETO (conductor devuelve neto, plataforma fee)
//   F) CASH: choose-cash → completed por flujo viejo → settlement_kind='CASH',
//      CERO transacciones. Viaje antiguo sin kind al completar → se registra CASH.
//   G) Idempotencia y guardas: doble lock → replay; doble settle → replay; sin
//      token → PAYMENT_TOKEN_INVALID; importe ≠ token → SCOPE_MISMATCH; cerrar
//      antes de arrival → NOT_ARRIVED; cancel vía antigua con lock → SETTLEMENT_REQUIRED.
//
// Datos de prueba (fixtures, se documentan en el registro): recarga SQL del
// monedero del pasajero y desplazamiento de accepted_at. Nada se inventa: ni
// productos, ni saldos que no se declaren.
//
// Uso (en el servidor):  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb95a.cjs
// =============================================================================
const { execSync } = require('child_process');
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';

const PASAJERO = { phone: '+240555000111', password: 'PruebaKyc2026' };   // L2 aprobado (P1-a)
const CONDUCTOR = { phone: '+240555000003', password: '123456' };        // role DRIVER, drivers row (lb93a lo usa)
const ADMIN = { phone: '+240555000999', password: 'AdminKyc2026' };      // creado por este e2e (rol ADMIN)
const PIN = '246810';

let fallos = 0;
const comprobar = (ok, texto) => { console.log(`  ${ok ? 'OK  ' : 'FALLO'} ${texto}`); if (!ok) fallos++; };
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };

const q = (sql) => {
  const out = execSync(
    'docker exec -i mirror-postgres psql -U postgres -d egrouteplan -tA',
    { input: sql, encoding: 'utf8' },
  );
  return out.trim();
};
const num = (s) => Number(String(s).split('|').map((x) => x.trim()).join(' ').split(/\s+/).pop() ?? NaN);
const uid = (phone) => q(`SELECT id FROM mobility.users WHERE phone='${phone}'`);

const entrar = async ({ phone, password }) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
  if (!r.accessToken) throw new Error(`login ${phone}: ${JSON.stringify(r).slice(0, 160)}`);
  return r.accessToken;
};
const req = async (method, path, tok, body, extra = {}) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { s: r.status, b: await j(r) };
};
const saldos = (phone) => {
  const id = uid(phone);
  return q(`SELECT coalesce(balance_available,0), coalesce(balance_escrow,0) FROM wallet.wallets WHERE user_id='${id}'`)
    .split('|').map(Number);
};
const porTrip = (trip) => {
  const r = q(`SELECT coalesce(sum(amount) FILTER (WHERE type='ESCROW_LOCK'),0),
                      coalesce(sum(amount) FILTER (WHERE type='ESCROW_RELEASE'),0),
                      coalesce(sum(amount) FILTER (WHERE type='FEE'),0),
                      coalesce(sum(amount) FILTER (WHERE type='ESCROW_REFUND'),0)
               FROM wallet.transactions WHERE reference_activity_id='${trip}'`);
  const [lock, rel, fee, ref] = r.split('|').map(Number);
  return { lock, rel, fee, ref };
};
const cuadra = (t) => t.rel + t.fee === t.lock - t.ref;
let tokensEmitidos = 0;
const tokenPago = async (tok, scope, amount, referenceId) => {
  // El emisor de tokens va a 5/min (throttle real del servidor): pausa cada 5.
  if (tokensEmitidos > 0 && tokensEmitidos % 5 === 0) { console.log('  …pausa 63 s (throttle de tokens)'); await new Promise((r) => setTimeout(r, 63000)); }
  tokensEmitidos++;
  return (await req('POST', '/auth/payment-token', tok, { method: 'PIN', pin: PIN, scope, amount, referenceId })).b?.paymentToken;
};

let seq = 0;
const nuevoViaje = async (tok, { city, price, pickup = 'Parque Barcelona', dropoff = 'Aeropuerto' }) => {
  const r = await req('POST', '/mobility/trips', tok, {
    pickupLat: 3.7547, pickupLng: 8.7371, pickupAddress: pickup,
    dropoffLat: 3.7773, dropoffLng: 8.7795, dropoffAddress: dropoff,
    zoneType: 'inside', requestedPrice: price, algorithmPrice: price,
    modality: 'recomendado', city,
  });
  if (!r.b?.data?.id) throw new Error(`crear viaje: ${JSON.stringify(r.b).slice(0, 200)}`);
  seq++;
  return r.b.data.id;
};
const aceptar = async (dtok, trip, price) => {
  const r = await req('POST', `/mobility/trips/${trip}/accept`, dtok, { price });
  if (!r.b?.success) throw new Error(`accept: ${JSON.stringify(r.b).slice(0, 200)}`);
  return r.b;
};
const viajeCashRapido = async (ptok, dtok, city, price) => {
  const trip = await nuevoViaje(ptok, { city, price });
  await aceptar(dtok, trip, price);
  return trip;
};

(async () => {
  console.log('== PREPARACIÓN ==');
  // RE-EJECUTABILIDAD: este e2e SIEMBRA strikes (cancelaciones de conductor de
  // prueba). Antes de empezar limpia los de corridas ANTERIORES del mismo
  // usuario de prueba (viajes ya cancelados por él; no toca ningún viaje real)
  // y levanta la suspensión que esos strikes hayan podido causar.
  q(`UPDATE mobility.taxi_requests SET cancelled_by = NULL
     WHERE cancelled_by = 'DRIVER' AND status = 'cancelled'
       AND driver_id = (SELECT id FROM mobility.users WHERE phone='${CONDUCTOR.phone}')`);
  q(`UPDATE mobility.drivers SET suspended_until = NULL, suspension_count = 0
     WHERE user_id = (SELECT id FROM mobility.users WHERE phone='${CONDUCTOR.phone}')`);
  // Admin de prueba (si no existe, se da de alta por SQL con contraseña conocida).
  if (!uid(ADMIN.phone)) {
    const hash = execSync(`node -e "const a=require('/opt/mirror/app/node_modules/argon2');a.hash('${ADMIN.password}',{type:a.argon2id,memoryCost:19456,timeCost:3,parallelism:1}).then(h=>console.log(h))"`, { encoding: 'utf8' }).trim();
    q(`INSERT INTO mobility.users (id, phone, full_name, role, status, password_hash, original_creator, created_at, updated_at)
       VALUES (gen_random_uuid(), '${ADMIN.phone}', 'Admin Prueba P1c', 'ADMIN', 'ACTIVE', '${hash}', 'e2e-lb95a', now(), now())`);
  }
  const ptok = await entrar(PASAJERO);
  const dtok = await entrar(CONDUCTOR);
  const atok = await entrar(ADMIN);
  // PIN de 6 dígitos del pasajero (hoy su pin_hash es la contraseña: no pasaría
  // el formato). setPin pide la contraseña de la auth unificada.
  const sp = await req('POST', '/wallet/pin', ptok, { pin: PIN, password: PASAJERO.password });
  comprobar(sp.s === 200 && sp.b?.ok === true, `set-pin del pasajero → HTTP ${sp.s} ${sp.b?.error?.code ?? ''}`);
  // Fixture de saldo (se declara aquí, no es dinero de verdad): 30.000 XAF.
  q(`UPDATE wallet.wallets SET balance_available = 30000, version = version + 1
     WHERE user_id = '${uid(PASAJERO.phone)}'`);
  const [pAvail0, pEscrow0] = saldos(PASAJERO.phone);
  const [dAvail0, dEscrow0] = saldos(CONDUCTOR.phone);
  const platId = process.env.PLATFORM_ID ?? '00000000-0000-0000-0000-000000000001';
  const [fAvail0, fEscrow0] = q(`SELECT coalesce(balance_available,0), coalesce(balance_escrow,0) FROM wallet.wallets WHERE user_id='${platId}'`).split('|').map(Number);
  const t0 = new Date().toISOString(); // ventana del e2e para el cuadre delta
  console.log(`  saldos iniciales: pasajero ${pAvail0}/${pEscrow0} · conductor ${dAvail0}/${dEscrow0} · plataforma ${fAvail0}/${fEscrow0}`);

  // ── A) HAPPY: Malabo 20 % con tope ─────────────────────────────────────────
  console.log('\n== A. VIAJE WALLET MALABO (1500 → fee 300, neto 1200) ==');
  const tripA = await viajeCashRapido(ptok, dtok, 'Malabo', 1500);
  const viewA0 = await req('GET', `/rides/${tripA}/settlement`, ptok);
  comprobar(viewA0.s === 200 && viewA0.b?.state === 'proposed', `vista: propuesta → ${viewA0.b?.state ?? JSON.stringify(viewA0.b).slice(0, 120)}`);
  const tokA = await tokenPago(ptok, 'TRIP', 1500, tripA);
  const lockA = await req('POST', `/rides/${tripA}/lock`, ptok, { city: 'Malabo' },
    { 'Idempotency-Key': `lb95a-A-${Date.now()}`, 'X-Payment-Token': tokA });
  comprobar(lockA.s === 200 && Number(lockA.b?.fee) === 300 && Number(lockA.b?.net) === 1200,
    `lock con PIN → fee congelada ${lockA.b?.fee}, neto ${lockA.b?.net} ${lockA.b?.error?.code ?? ''}`);
  let [pa, pe] = saldos(PASAJERO.phone);
  comprobar(pa === pAvail0 - 1500 && pe === pEscrow0 + 1500, `escrow del pasajero +1500, disponible −1500 (${pa}/${pe})`);
  await req('PUT', `/mobility/trips/${tripA}/status`, dtok, { status: 'in_progress' });
  const arrA = await req('POST', `/rides/${tripA}/arrival`, dtok, {});
  comprobar(arrA.s === 200 && arrA.b?.status === 'arrived', `conductor marca llegada → ${arrA.b?.status ?? arrA.b?.error?.code}`);
  const stA = await req('POST', `/rides/${tripA}/settle`, ptok, {});
  comprobar(stA.s === 200 && Number(stA.b?.net) === 1200 && Number(stA.b?.fee) === 300,
    `settle → neto ${stA.b?.net} fee ${stA.b?.fee} ${stA.b?.error?.code ?? ''}`);
  let tA = porTrip(tripA);
  comprobar(cuadra(tA), `INVARIANTE A: ΣREL+ΣFEE=${tA.rel + tA.fee} == ΣLOCK−ΣREF=${tA.lock - tA.ref} (lock=${tA.lock})`);
  let [da] = saldos(CONDUCTOR.phone);
  let [fa] = q(`SELECT coalesce(balance_available,0) FROM wallet.wallets WHERE user_id='${platId}'`).split('|').map(Number);
  comprobar(da === dAvail0 + 1200, `conductor cobra NETO +1200 (${dAvail0}→${da})`);
  comprobar(fa === fAvail0 + 300, `plataforma cobra FEE +300 (${fAvail0}→${fa})`);
  [pa, pe] = saldos(PASAJERO.phone);
  comprobar(pe === pEscrow0, `el escrow del pasajero vuelve a su línea tras cerrar (${pe} == base ${pEscrow0})`);
  const histA = await req('GET', '/mobility/trips/history', ptok);
  const itemA = (histA.b?.data?.trips ?? []).find((x) => x.id === tripA);
  comprobar(itemA?.status === 'completed' && itemA?.settlement_kind === 'WALLET' && Number(itemA?.fee_info?.fee) === 300,
    `historial trae la liquidación: kind=${itemA?.settlement_kind} fee=${itemA?.fee_info?.fee}`);
  // La cuota la pone el servidor (política en fee_policies): la app no replica
  // fórmulas. Malabo 20 % con suelo redondeado hacia abajo; Bata plana 50.
  const qMalabo = await req('GET', '/rides/quote?city=Malabo&fare=1234', ptok);
  const qBata = await req('GET', '/rides/quote?city=Bata&fare=500', ptok);
  comprobar(Number(qMalabo.b?.fee) === 246 && Number(qMalabo.b?.net) === 988,
    `quote Malabo 1234 → fee 246 (suelo de 20 %), neto 988 (${qMalabo.b?.fee}/${qMalabo.b?.net})`);
  comprobar(Number(qBata.b?.fee) === 50 && Number(qBata.b?.net) === 450,
    `quote Bata 500 → plana 50, neto 450 (${qBata.b?.fee}/${qBata.b?.net})`);

  // ── B) Ventana gratis (5 min) ──────────────────────────────────────────────
  console.log('\n== B. CANCELACIÓN DENTRO DE VENTANA (Bata, fee 50 no llega a aplicarse) ==');
  const tripB = await viajeCashRapido(ptok, dtok, 'Bata', 500);
  const tokB = await tokenPago(ptok, 'TRIP', 500, tripB);
  const lockB = await req('POST', `/rides/${tripB}/lock`, ptok, {},
    { 'Idempotency-Key': `lb95a-B-${Date.now()}`, 'X-Payment-Token': tokB });
  comprobar(lockB.s === 200 && Number(lockB.b?.fee) === 50, `lock Bata: city del viaje → fee plana 50 (fee=${lockB.b?.fee}) ${lockB.b?.error?.code ?? ''}`);
  const canB = await req('POST', `/rides/${tripB}/cancel`, ptok, { reason: 'apareció otro coche' },
    { 'Idempotency-Key': `lb95a-B2-${Date.now()}` });
  comprobar(canB.s === 200 && Number(canB.b?.refunded) === 500 && Number(canB.b?.fee_to_driver) === 0 && canB.b?.free_window === true,
    `cancelación gratis → refunded ${canB.b?.refunded}, al conductor ${canB.b?.fee_to_driver}`);
  tA = porTrip(tripB);
  comprobar(tA.ref === 500 && cuadra(tA), `INVARIANTE B: refund=${tA.ref} cuadra (${tA.rel}+${tA.fee} == ${tA.lock}-${tA.ref})`);
  [pa, pe] = saldos(PASAJERO.phone);
  comprobar(pe === pEscrow0 && pa === 28500, `tras B el pasajero vuelve a su línea: av=${pa} (esperado 28500) esc=${pe} (base ${pEscrow0})`);

  // ── C) Cuota por no-show fuera de ventana ──────────────────────────────────
  console.log('\n== C. CUOTA NO-SHOW (fare 500 → min(200, 20%)=100 al conductor) ==');
  const tripC = await viajeCashRapido(ptok, dtok, 'Bata', 500);
  q(`UPDATE mobility.taxi_requests SET accepted_at = now() - interval '6 minutes' WHERE id='${tripC}'`);
  const tokC = await tokenPago(ptok, 'TRIP', 500, tripC);
  await req('POST', `/rides/${tripC}/lock`, ptok, {}, { 'Idempotency-Key': `lb95a-C-${Date.now()}`, 'X-Payment-Token': tokC });
  const canC = await req('POST', `/rides/${tripC}/cancel`, ptok, { reason: 'me he perdido' },
    { 'Idempotency-Key': `lb95a-C2-${Date.now()}` });
  comprobar(canC.s === 200 && Number(canC.b?.fee_to_driver) === 100 && Number(canC.b?.refunded) === 400,
    `cuota 100 + reembolso 400 (obtuvo ${canC.b?.fee_to_driver}/${canC.b?.refunded})`);
  const tC = porTrip(tripC);
  comprobar(tC.rel === 100 && tC.ref === 400 && cuadra(tC), `INVARIANTE C: rel=${tC.rel} ref=${tC.ref} lock=${tC.lock} ✓`);

  // ── D) Strikes del conductor ───────────────────────────────────────────────
  console.log('\n== D. STRIKES: 3 cancelaciones del conductor en 7 días → suspensión ==');
  for (let i = 0; i < 3; i++) {
    const trip = await nuevoViaje(ptok, { city: 'Malabo', price: 1000 });
    await aceptar(dtok, trip, 1000);
    const dc = await req('POST', `/rides/${trip}/driver-cancel`, dtok, { reason: 'se me ha averiado' });
    comprobar(dc.s === 200, `conductor cancela el viaje ${i + 1}/3 (strikes=${dc.b?.strikes_7d})`);
    if (i === 2) comprobar(new Date(dc.b?.suspension?.suspended_until).getTime() > Date.now(),
      `y queda suspendido hasta ${dc.b?.suspension?.suspended_until ?? '???'}`);
  }
  const tripS = await nuevoViaje(ptok, { city: 'Malabo', price: 1000 });
  const acS = await req('POST', `/mobility/trips/${tripS}/accept`, dtok, { price: 1000 });
  comprobar(acS.b?.error?.code === 'DRIVER_SUSPENDED', `suspendido: NO puede aceptar → ${acS.b?.error?.code ?? `HTTP ${acS.s}`}`);
  q(`UPDATE mobility.drivers SET suspended_until = NULL, suspension_count = 0
     WHERE user_id = '${uid(CONDUCTOR.phone)}'`);
  q(`DELETE FROM mobility.taxi_requests WHERE id = '${tripS}'`); // sin liquidación: se borra el test

  // ── E) Disputa tras cierre automático/manual → reversión total ─────────────
  console.log('\n== E. DISPUTA TRAS CIERRE (el pasajero recupera el fare COMPLETO) ==');
  const tripE = await viajeCashRapido(ptok, dtok, 'Malabo', 2000);
  const tokE = await tokenPago(ptok, 'TRIP', 2000, tripE);
  await req('POST', `/rides/${tripE}/lock`, ptok, {}, { 'Idempotency-Key': `lb95a-E-${Date.now()}`, 'X-Payment-Token': tokE });
  await req('PUT', `/mobility/trips/${tripE}/status`, dtok, { status: 'in_progress' });
  await req('POST', `/rides/${tripE}/arrival`, dtok, {});
  const stE = await req('POST', `/rides/${tripE}/settle`, ptok, {});
  comprobar(stE.s === 200 && Number(stE.b?.net) === 1600 && Number(stE.b?.fee) === 400,
    `2000 Malabo → neto 1600 fee 400 (${stE.b?.net}/${stE.b?.fee})`);
  const disp = await req('POST', `/rides/${tripE}/dispute`, ptok, { reason: 'No llegué a subir: el viaje no ocurrió' });
  comprobar(disp.s === 200 && disp.b?.disputed === true, `disputa abierta → ${disp.b?.error?.code ?? 'ok'}`);
  const viewE = await req('GET', `/rides/${tripE}/settlement`, ptok);
  comprobar(viewE.b?.state === 'disputed', `vista en disputa (${viewE.b?.state})`);
  const resE = await req('POST', `/admin/rides/${tripE}/dispute/resolve`, atok, { outcome: 'REFUND_PASSENGER', note: 'GPS sin recorrido' },
    { 'Idempotency-Key': `lb95a-E2-${Date.now()}` });
  comprobar(resE.s === 200 && resE.b?.resolved === 'REFUND_PASSENGER', `admin reembolsa → ${resE.b?.resolved ?? JSON.stringify(resE.b).slice(0, 140)}`);
  const tE = porTrip(tripE);
  comprobar(tE.lock === 2000 && tE.rel === 1600 && tE.fee === 800 && tE.ref === 1600,
    `libro de E: lock=${tE.lock} release=${tE.rel} fee(incl. reversa)=${tE.fee} refund=${tE.ref}`);
  // Línea esperada del pasajero aquí: 30000 −1500(A) 0(B) −100(C, le vuelven 400)
  // y en E le salen y vuelven los 2000 íntegros → 28400.
  const deltaP = saldos(PASAJERO.phone)[0];
  comprobar(deltaP === 28400, `al pasajero le vuelve TODO el viaje E (av=${deltaP}, esperado 28400)`);
  const [de_] = saldos(CONDUCTOR.phone);
  const [fe_] = q(`SELECT coalesce(balance_available,0) FROM wallet.wallets WHERE user_id='${platId}'`).split('|').map(Number);
  comprobar(fe_ === fAvail0 + 300, `la plataforma devuelve su fee de E: vuelve a +300 solo por A (${fe_})`);
  comprobar(de_ === dAvail0 + 1200 + 100, `conductor cobra neto A(1200)+cuota C(100) y devuelve E íntegro (${de_})`);

  // ── F) Efectivo: registro sin tocar el ledger ──────────────────────────────
  console.log('\n== F. VIAJES CASH (se registran, cero dinero) ==');
  const tripF = await viajeCashRapido(ptok, dtok, 'Malabo', 800);
  const cashF = await req('POST', `/rides/${tripF}/cash`, ptok, {});
  comprobar(cashF.s === 200 && cashF.b?.kind === 'CASH', `choose-cash → ${cashF.b?.kind ?? cashF.b?.error?.code}`);
  await req('PUT', `/mobility/trips/${tripF}/status`, dtok, { status: 'in_progress' });
  const doneF = await req('PUT', `/mobility/trips/${tripF}/status`, dtok, { status: 'completed', cashConfirmed: true });
  comprobar(doneF.b?.data?.status === 'completed', 'flujo viejo de cash sigue funcionando');
  const tF = porTrip(tripF);
  comprobar(tF.lock === 0 && tF.rel === 0 && tF.fee === 0 && tF.ref === 0, 'CERO transacciones para el viaje cash');
  const [pf_] = saldos(PASAJERO.phone);
  comprobar(pf_ === deltaP, `y el pasajero no se ha movido (${pf_})`);
  // Viaje antiguo sin kind que se completa por la puerta vieja → se registra CASH.
  const tripG = await nuevoViaje(ptok, { city: 'Malabo', price: 900 });
  await aceptar(dtok, tripG, 900);
  await req('PUT', `/mobility/trips/${tripG}/status`, dtok, { status: 'completed', cashConfirmed: true });
  const kindG = q(`SELECT coalesce(settlement_kind,'NULL') FROM mobility.taxi_requests WHERE id='${tripG}'`);
  comprobar(kindG === 'CASH', `completado sin lock → se REGISTRACASH (${kindG})`);

  // ── G) Idempotencia y guardas ──────────────────────────────────────────────
  console.log('\n== G. IDEMPOTENCIA Y GUARDAS ==');
  const tripH = await viajeCashRapido(ptok, dtok, 'Bata', 600);
  const tokH = await tokenPago(ptok, 'TRIP', 600, tripH);
  const l1 = await req('POST', `/rides/${tripH}/lock`, ptok, {}, { 'Idempotency-Key': 'lb95a-H1', 'X-Payment-Token': tokH });
  const tokH2 = await tokenPago(ptok, 'TRIP', 600, tripH);
  const l2 = await req('POST', `/rides/${tripH}/lock`, ptok, {}, { 'Idempotency-Key': 'lb95a-H2', 'X-Payment-Token': tokH2 });
  comprobar(l1.s === 200 && l2.b?.replay === true && l2.b?.lockTransactionId === l1.b?.lockTransactionId, 'doble lock → replay sin duplicar');
  const tH = porTrip(tripH);
  comprobar(tH.lock === 600, `el ledger del viaje H tiene UN solo lock (${tH.lock})`);
  const arrH = await req('POST', `/rides/${tripH}/arrival`, dtok, {});
  comprobar(arrH.s === 200, 'arrival ok en bata');
  const stH1 = await req('POST', `/rides/${tripH}/settle`, ptok, {});
  const stH2 = await req('POST', `/rides/${tripH}/settle`, ptok, {});
  comprobar(stH1.s === 200 && stH2.b?.replay === true, `doble settle → replay (${stH2.b?.replay})`);
  const sinTok = await viajeCashRapido(ptok, dtok, 'Bata', 400);
  const tokX = await tokenPago(ptok, 'TRIP', 400, sinTok);
  const badAmt = await tokenPago(ptok, 'TRIP', 401, sinTok);
  const m1 = await req('POST', `/rides/${sinTok}/lock`, ptok, {}, { 'Idempotency-Key': 'lb95a-X1' });
  const m2 = await req('POST', `/rides/${sinTok}/lock`, ptok, {}, { 'Idempotency-Key': 'lb95a-X2', 'X-Payment-Token': badAmt });
  comprobar(m1.b?.error?.code === 'PAYMENT_TOKEN_INVALID' && m2.b?.error?.code === 'PAYMENT_TOKEN_SCOPE_MISMATCH',
    `sin token → ${m1.b?.error?.code}; importe ≠ → ${m2.b?.error?.code}`);
  await req('POST', `/rides/${sinTok}/lock`, ptok, {}, { 'Idempotency-Key': 'lb95a-X3', 'X-Payment-Token': tokX });
  const oldCancel = await req('POST', `/mobility/trips/${sinTok}/cancel`, ptok, { reason: 'por probar la guarda' });
  comprobar(oldCancel.b?.error?.code === 'SETTLEMENT_REQUIRED', `la puerta vieja de cancel NO puede con un viaje bloqueado → ${oldCancel.b?.error?.code}`);
  const noArr = await viajeCashRapido(ptok, dtok, 'Bata', 300);
  const tokNA = await tokenPago(ptok, 'TRIP', 300, noArr);
  await req('POST', `/rides/${noArr}/lock`, ptok, {}, { 'Idempotency-Key': 'lb95a-NA', 'X-Payment-Token': tokNA });
  const stNA = await req('POST', `/rides/${noArr}/settle`, ptok, {});
  comprobar(stNA.b?.error?.code === 'NOT_ARRIVED', `cerrar sin llegada → ${stNA.b?.error?.code}`);
  const canNA = await req('POST', `/rides/${noArr}/cancel`, ptok, {}, { 'Idempotency-Key': `lb95a-NAC-${Date.now()}` });
  comprobar(canNA.s === 200 && Number(canNA.b?.refunded) === 300, `y se puede cancelar con devolución íntegra (${canNA.b?.refunded})`);

  // ── H) Cuadre GLOBAL final del libro ───────────────────────────────────────
  console.log('\n== H. CUADRE GLOBAL ==');
  const global_ = q(`
    SELECT coalesce(sum(credit),0) - coalesce(sum(debit),0) FROM (
      SELECT CASE WHEN l.direction='CREDIT' THEN l.amount ELSE 0 END AS credit,
             CASE WHEN l.direction='DEBIT'  THEN l.amount ELSE 0 END AS debit
      FROM wallet.ledger_entries l
      JOIN wallet.transactions t ON t.id = l.transaction_id
      WHERE t.reference_activity_id IN ('${tripA}','${tripB}','${tripC}','${tripE}','${tripH}','${sinTok}','${noArr}')
    ) s`);
  comprobar(Number(global_) === 0, `Σdeben == Σhaber en TODOS los viajes liquidados (delta=${global_})`);
  // Cuadre por libro mayor: lo que dice el ledger en esta ventana debe ser
  // exactamente el movimiento del saldo (comparamos DELTAS dentro de t0..ahora
  // para no exigir la historia completa de monederos viejos de prueba).
  const deltaVentana = (who, id, base, bucket) => {
    const s = Number(q(`SELECT coalesce(sum(CASE WHEN l.direction='CREDIT' THEN l.amount ELSE -l.amount END),0)
      FROM wallet.ledger_entries l JOIN wallet.wallets w ON w.id=l.wallet_id
      WHERE w.user_id='${id}' AND l.bucket='${bucket}' AND l.created_at >= '${t0}'::timestamptz`));
    const now = Number(q(`SELECT coalesce(balance_${bucket.toLowerCase()},0) FROM wallet.wallets WHERE user_id='${id}'`));
    comprobar(now - base === s, `${who} ${bucket}: saldo Δ${now - base} == libro Δ${s}`);
  };
  const pId = uid(PASAJERO.phone); const dId = uid(CONDUCTOR.phone);
  deltaVentana('pasajero', pId, pAvail0, 'AVAILABLE');
  deltaVentana('pasajero', pId, pEscrow0, 'ESCROW');
  deltaVentana('conductor', dId, dAvail0, 'AVAILABLE');
  deltaVentana('conductor', dId, dEscrow0, 'ESCROW');
  deltaVentana('plataforma', platId, fAvail0, 'AVAILABLE');
  deltaVentana('plataforma', platId, fEscrow0, 'ESCROW');

  console.log(`\nviajes de prueba: ${seq} · A=${tripA} B=${tripB} C=${tripC} E=${tripE} F=${tripF}`);
  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
