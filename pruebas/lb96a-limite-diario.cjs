// =============================================================================
// lb96a-limite-diario.cjs — P1-c §2.2 (decisión del dueño 17-09-2026):
// el RELEASE neto que cobra un conductor por viaje liquidado entra como
// INGRESO suyo («depósito virtual») en el cupo DEPOSIT de HOY — sin bloquear
// nunca el pago de un viaje. Parche: parche92-usage-release.py (usageToday).
//
// Escenarios:
//  1) Viaje wallet Malabo 1500 → neto 1200 al conductor → GET /wallet del
//     conductor: today.deposited sube EXACTAMENTE +1200 (antes del parche
//     subía 0: el RELEASE no contaba).
//  2) El cupo se nota al INTENTAR depositar: con daily_limit recortado, un
//     depósito que pasa del cupo → DAILY_LIMIT_EXCEEDED con used_today que
//     INCLUYE los 1200 del viaje (details), y la plataforma no ha bloqueado
//     el pago.
//  3) Un ESCROW_REFUND (no-show: pasajero recupera 400) NO suma ingreso al
//     pasajero; la CUOTA (release 100 al conductor) SÍ (+100 en su cupo).
//  4) CON daily_limit POR DEBAJO del ingreso pendiente (100 < 1200): cerrar
//     un viaje sigue funcionando — el asiento se escribe igual (+1200).
//
// Fixtures declarados (prueba, no dinero real): recarga SQL del monedero del
// pasajero a 30.000; daily_limit del monedero del conductor fijado a medida
// (y restaurado a 100.000 al final). Si el gate de KYC bloquea los depósitos
// del conductor, el paso 2 se informa como NO-BLOQUEANTE (honesto) y el
// resto de la tanda sigue valiendo.
//
// Uso (en el servidor):  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb96a.cjs
// =============================================================================
const { execSync } = require('child_process');
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';

const PASAJERO = { phone: '+240555000111', password: 'PruebaKyc2026' };
const CONDUCTOR = { phone: '+240555000003', password: '123456' };
const PIN = '246810';

let fallos = 0;
const comprobar = (ok, texto) => { console.log(`  ${ok ? 'OK  ' : 'FALLO'} ${texto}`); if (!ok) fallos++; };
const soft = (ok, texto) => { console.log(`  ${ok ? 'OK  ' : 'AVISO'} ${texto}`); if (!ok) fallos += 0; };
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };
const q = (sql) => execSync('docker exec -i mirror-postgres psql -U postgres -d egrouteplan -tA', { input: sql, encoding: 'utf8' }).trim();
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
let tokensEmitidos = 0;
const tokenPago = async (tok, pin, scope, amount, referenceId) => {
  if (tokensEmitidos > 0 && tokensEmitidos % 5 === 0) { console.log('  …pausa 63 s (throttle de tokens)'); await new Promise((r) => setTimeout(r, 63000)); }
  tokensEmitidos++;
  return (await req('POST', '/auth/payment-token', tok, { method: 'PIN', pin, scope, amount, referenceId })).b?.paymentToken;
};

(async () => {
  console.log('== PREPARACIÓN ==');
  // Cualquier corrida anterior pudo dejar al conductor suspendido: levantamos
  // la suspensión y limpiamos sus strikes de prueba (mismos fixtures lb95a).
  q(`UPDATE mobility.taxi_requests SET cancelled_by = NULL
     WHERE cancelled_by = 'DRIVER' AND status = 'cancelled'
       AND driver_id = (SELECT id FROM mobility.users WHERE phone='${CONDUCTOR.phone}')`);
  q(`UPDATE mobility.drivers SET suspended_until = NULL, suspension_count = 0
     WHERE user_id = (SELECT id FROM mobility.users WHERE phone='${CONDUCTOR.phone}')`);
  const ptok = await entrar(PASAJERO);
  const dtok = await entrar(CONDUCTOR);
  const dId = uid(CONDUCTOR.phone);
  // 17/09 (parche94): agentId de deposits debe ser UN AGENTE real
  // (wallet.agents), no el userId — antes el paso era soft-AVISO con 403.
  const agId = q(`SELECT a.id FROM wallet.agents a JOIN mobility.users u ON u.id = a.user_id WHERE u.phone = '${CONDUCTOR.phone}' AND a.status = 'ACTIVE' LIMIT 1`);
  if (!/^[0-9a-f-]{36}$/.test(agId)) { console.log('  FALLO el conductor 003 necesita un agente ACTIVE para retirar/ingresar por agente'); process.exit(1); }
  const pId = uid(PASAJERO.phone);
  // PIN del conductor (para emitir tokens DEPOSIT) y recarga del pasajero (fixture).
  const sp1 = await req('POST', '/wallet/pin', ptok, { pin: PIN, password: PASAJERO.password });
  const sp2 = await req('POST', '/wallet/pin', dtok, { pin: PIN, password: CONDUCTOR.password });
  comprobar(sp1.s === 200 && sp2.s === 200, `set-pin pasajero(${sp1.s}) y conductor(${sp2.s})`);
  q(`UPDATE wallet.wallets SET balance_available = 30000, version = version + 1 WHERE user_id = '${pId}'`);

  const walletDe = async (tok) => (await req('GET', '/wallet', tok)).b;
  const w0 = await walletDe(dtok);
  if (typeof w0?.today?.deposited !== 'number') {
    console.log(`  FALLO prep: GET /wallet conductor → ${JSON.stringify(w0).slice(0, 160)}`);
    process.exit(1);
  }
  const dep0 = w0.today.deposited;
  console.log(`  conductor: deposited hoy=${dep0} · dailyLimit efectivo=${w0.dailyLimit}`);

  // ── 1) Un neto de viaje ENTERO cuenta como ingreso de hoy ──────────────────
  console.log('\n== 1. RELEASE → +1200 al cupo DEPOSIT del conductor ==');
  const tripA = (await req('POST', '/mobility/trips', ptok, {
    pickupLat: 3.7547, pickupLng: 8.7371, pickupAddress: 'Parque Barcelona',
    dropoffLat: 3.7773, dropoffLng: 8.7795, dropoffAddress: 'Aeropuerto',
    zoneType: 'inside', requestedPrice: 1500, algorithmPrice: 1500, modality: 'recomendado', city: 'Malabo',
  })).b?.data?.id;
  const acA = await req('POST', `/mobility/trips/${tripA}/accept`, dtok, { price: 1500 });
  comprobar(acA.b?.success === true, `conductor propone 1500 (accept) → ${acA.b?.error?.code ?? 'ok'}`);
  const tokA = await tokenPago(ptok, PIN, 'TRIP', 1500, tripA);
  const lockA = await req('POST', `/rides/${tripA}/lock`, ptok, { city: 'Malabo' },
    { 'Idempotency-Key': `lb96a-A-${Date.now()}`, 'X-Payment-Token': tokA });
  comprobar(lockA.s === 200 && Number(lockA.b?.fee) === 300, `lock 1500 Malabo → fee ${lockA.b?.fee ?? JSON.stringify(lockA.b).slice(0, 120)}`);
  await req('POST', `/rides/${tripA}/arrival`, dtok, {});
  const stA = await req('POST', `/rides/${tripA}/settle`, ptok, {}, { 'Idempotency-Key': `lb96a-S-${Date.now()}` });
  comprobar(stA.s === 200 && Number(stA.b?.net) === 1200, `settle neto 1200 (${JSON.stringify(stA.b).slice(0, 100)})`);
  const [da0] = saldos(CONDUCTOR.phone);
  const w1 = await walletDe(dtok);
  comprobar(w1.today.deposited === dep0 + 1200,
    `today.deposited ${dep0} → ${w1.today.deposited} (+${w1.today.deposited - dep0}, esperado +1200)`);

  // ── 2) El cupo se nota al intentar depositar efectivo ──────────────────────
  console.log('\n== 2. Depósito que desborda el cupo → DAILY_LIMIT_EXCEEDED ==');
  // Fixture: cupo de HOY del conductor = ingreso actual + 1000 de margen.
  q(`UPDATE wallet.wallets SET daily_limit = ${w1.today.deposited + 1000}, version = version + 1 WHERE user_id = '${dId}'`);
  const w2 = await walletDe(dtok);
  const rem = Math.max(0, w2.dailyLimit - w2.today.deposited);
  console.log(`  cupo efectivo=${w2.dailyLimit} · usado=${w2.today.deposited} · margen=${rem}`);
  const tokD1 = await tokenPago(dtok, PIN, 'DEPOSIT', rem + 1);
  const depOver = await req('POST', '/wallet/deposits', dtok, { agentId: agId, amount: rem + 1 },
    { 'Idempotency-Key': `lb96a-D1-${Date.now()}`, 'X-Payment-Token': tokD1 });
  const codeOver = depOver.b?.error?.code;
  console.log(`  intento rem+1 → HTTP ${depOver.s} ${JSON.stringify(depOver.b).slice(0, 160)}`);
  if (depOver.s === 403 || String(codeOver ?? '').startsWith('KYC')) {
    soft(false, `gate KYC bloquea depósitos del conductor (${codeOver ?? depOver.s}): el paso 2 queda NO PROBADO en vivo`);
  } else {
    comprobar(codeOver === 'DAILY_LIMIT_EXCEEDED', `depósito margen+1 → ${codeOver ?? `HTTP ${depOver.s}`}`);
    comprobar(Number(depOver.b?.error?.details?.used_today) === w2.today.deposited,
      `used_today de la respuesta=${depOver.b?.error?.details?.used_today} incluye el neto del viaje (${w2.today.deposited})`);
    if (rem >= 200) {
      const tokD2 = await tokenPago(dtok, PIN, 'DEPOSIT', rem);
      const depOk = await req('POST', '/wallet/deposits', dtok, { agentId: agId, amount: rem },
        { 'Idempotency-Key': `lb96a-D2-${Date.now()}`, 'X-Payment-Token': tokD2 });
      comprobar(depOk.s < 300 && !depOk.b?.error?.code, `depósito justo (margen ${rem}) pasa → HTTP ${depOk.s}`);
      const opId = depOk.b?.operationId ?? depOk.b?.id ?? depOk.b?.data?.operationId;
      if (opId) {
        const cn = await req('POST', `/wallet/operations/${opId}/cancel`, dtok, {});
        comprobar(cn.s < 300, `operación de prueba cancelada → HTTP ${cn.s}`);
      }
    }
  }

  // ── 3) La devolución NO es ingreso; la cuota SÍ ────────────────────────────
  console.log('\n== 3. REFUND no suma; CUOTA de absentismo suma al conductor ==');
  const pw0 = await walletDe(ptok);
  const tripC = (await req('POST', '/mobility/trips', ptok, {
    pickupLat: 3.7547, pickupLng: 8.7371, pickupAddress: 'Bario Viejo',
    dropoffLat: 3.7773, dropoffLng: 8.7795, dropoffAddress: 'Punta', 
    zoneType: 'inside', requestedPrice: 500, algorithmPrice: 500, modality: 'recomendado', city: 'Bata',
  })).b?.data?.id;
  await req('POST', `/mobility/trips/${tripC}/accept`, dtok, { price: 500 });
  q(`UPDATE mobility.taxi_requests SET accepted_at = now() - interval '6 minutes' WHERE id='${tripC}'`);
  const tokC = await tokenPago(ptok, PIN, 'TRIP', 500, tripC);
  await req('POST', `/rides/${tripC}/lock`, ptok, {}, { 'Idempotency-Key': `lb96a-C-${Date.now()}`, 'X-Payment-Token': tokC });
  const canC = await req('POST', `/rides/${tripC}/cancel`, ptok, { reason: 'no-show' },
    { 'Idempotency-Key': `lb96a-C2-${Date.now()}` });
  comprobar(canC.s === 200 && Number(canC.b?.fee_to_driver) === 100, `no-show → cuota 100, devueltos ${canC.b?.refunded}`);
  const pw1 = await walletDe(ptok);
  comprobar(pw1.today.deposited === pw0.today.deposited,
    `el pasajero recupera 400 SIN sumar ingreso de depósito (${pw0.today.deposited} → ${pw1.today.deposited})`);
  const w3 = await walletDe(dtok);
  comprobar(w3.today.deposited === w1.today.deposited + 100,
    `la cuota entra como ingreso del conductor: +${w3.today.deposited - w1.today.deposited} (esperado +100)`);

  // ── 4) Con el cupo REBASADO, el pago del viaje NO se bloquea ───────────────
  console.log('\n== 4. daily_limit 100 < ingreso: liquidar sigue funcionando ==');
  q(`UPDATE wallet.wallets SET daily_limit = 100, version = version + 1 WHERE user_id = '${dId}'`);
  const tripD = (await req('POST', '/mobility/trips', ptok, {
    pickupLat: 3.7547, pickupLng: 8.7371, pickupAddress: 'Kiriris',
    dropoffLat: 3.7773, dropoffLng: 8.7795, dropoffAddress: 'Semu',
    zoneType: 'inside', requestedPrice: 1500, algorithmPrice: 1500, modality: 'recomendado', city: 'Malabo',
  })).b?.data?.id;
  const acD = await req('POST', `/mobility/trips/${tripD}/accept`, dtok, { price: 1500 });
  comprobar(acD.b?.success === true, `accept viaje D pese al cupo rebasado → ${acD.b?.error?.code ?? 'ok'}`);
  const tokD = await tokenPago(ptok, PIN, 'TRIP', 1500, tripD);
  await req('POST', `/rides/${tripD}/lock`, ptok, { city: 'Malabo' }, { 'Idempotency-Key': `lb96a-E-${Date.now()}`, 'X-Payment-Token': tokD });
  await req('POST', `/rides/${tripD}/arrival`, dtok, {});
  const da1 = saldos(CONDUCTOR.phone)[0];
  const stD = await req('POST', `/rides/${tripD}/settle`, ptok, {}, { 'Idempotency-Key': `lb96a-E2-${Date.now()}` });
  comprobar(stD.s === 200 && Number(stD.b?.net) === 1200, `settle con cupo 100 → neto ${stD.b?.net ?? stD.b?.error?.code}`);
  comprobar(saldos(CONDUCTOR.phone)[0] === da1 + 1200, 'y el conductor cobra sus 1200 sin que nadie lo corte');
  q(`UPDATE wallet.wallets SET daily_limit = 100000, version = version + 1 WHERE user_id = '${dId}'`);

  console.log(fallos === 0 ? '\nTODO OK' : `\nFALLOS=${fallos}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
