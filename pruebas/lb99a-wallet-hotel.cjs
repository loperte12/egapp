// lb99a-wallet-hotel.cjs — EL MONEDERO PAGA LA SEÑAL DEL HOTEL (parche 99).
//
// Camino del dinero de una reserva pagada con el monedero:
//   1) El huésped confirma la SEÑAL con su PIN → el importe queda EN GARANTÍA y el hotel
//      puede confirmar sin esperar comprobantes (payment_status=deposit_paid).
//   2) El huésped ENTRA (check-in) → el hotel cobra la señal en SU monedero.
//   3) Reserva cancelada → la señal VUELVE ÍNTEGRA al huésped.
//   4) No presentado (no-show) → la señal es del hotel (es su compensación; para eso existe).
//
// Fixture: se reutiliza la tienda vacía del conductor de prueba como hotel (is_hotel=true),
// con una habitación y 50 % de señal. Huésped = pasajero de prueba.
const { execSync } = require('node:child_process');

const API = process.env.LB_API ?? 'http://127.0.0.1:3000/api/v1';
const HOST = process.env.LB_HOST ?? 'http://127.0.0.1:3000/api/v1/lifebook/commerce/hotel';
const HUESPED = { phone: '+240555000111', password: 'PruebaKyc2026', pin: '246810' };
const HOTELERO = { phone: '+240555000003', password: '123456' };
const SALDO_INICIAL = 30000;

let fallos = 0;
const comprobar = (ok, texto) => { console.log(`  ${ok ? 'OK  ' : 'FALLO'} ${texto}`); if (!ok) fallos += 1; };
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 220) }; } };
const q = (sql) => {
  const salida = execSync('docker exec -i mirror-postgres psql -U postgres -d egrouteplan -tA', { input: sql, encoding: 'utf8' }).trim();
  return salida.split('\n').map((l) => l.trim()).filter((l) => l && !/^(INSERT|UPDATE|DELETE|SELECT) \d/.test(l))[0] ?? '';
};
const entrar = async ({ phone, password }) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
  if (!r.accessToken) throw new Error(`login ${phone}: ${JSON.stringify(r).slice(0, 150)}`);
  return r.accessToken;
};
const req = async (method, url, tok, body, extra = {}) => {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { s: r.status, b: await j(r) };
};
const saldo = (phone) => {
  const s = q(`SELECT coalesce(w.balance_available,0)||'|'||coalesce(w.balance_escrow,0) FROM wallet.wallets w JOIN mobility.users u ON u.id=w.user_id WHERE u.phone='${phone}'`);
  const [a, e] = s.split('|').map(Number);
  return { available: a, escrow: e };
};
const hoy = () => new Date().toISOString().slice(0, 10);
const manana = () => new Date(Date.now() + 86400000).toISOString().slice(0, 10);

(async () => {
  console.log('\n== 0. FIXTURE (hotel, habitación con 50 % de señal) ==');
  const idHuesped = q(`SELECT id FROM mobility.users WHERE phone='${HUESPED.phone}'`);
  const idHotelero = q(`SELECT id FROM mobility.users WHERE phone='${HOTELERO.phone}'`);
  const shopId = q(`SELECT id FROM lifebook.shops WHERE owner_id='${idHotelero}' LIMIT 1`);
  if (!shopId) { console.log('  FALLO el hotelero de prueba no tiene tienda'); process.exit(1); }
  q(`UPDATE lifebook.shops SET is_hotel = true WHERE id='${shopId}'`);
  // La reserva exige que la habitación esté ACTIVA y que su PRODUCTO enlazado esté activo
  // («ROOM_NOT_AVAILABLE» si no): el producto es la publicación y la habitación su inventario.
  let prodId = q(`SELECT id FROM lifebook.products WHERE shop_id='${shopId}' AND title='Habitación E2E' LIMIT 1`);
  if (!prodId) {
    prodId = q(`INSERT INTO lifebook.products (shop_id, service_type, title, price_xaf, price_mode, stock_mode, stock_quantity, status)
                VALUES ('${shopId}','hotel_room','Habitación E2E',2000,'fixed','unlimited',0,'active') RETURNING id`);
  }
  q(`UPDATE lifebook.products SET status='active', price_xaf=2000 WHERE id='${prodId}'`);
  let roomId = q(`SELECT id FROM lifebook.room_types WHERE shop_id='${shopId}' AND name='Habitación E2E' LIMIT 1`);
  if (!roomId) {
    roomId = q(`INSERT INTO lifebook.room_types (shop_id, name, base_price_xaf, total_units, deposit_percent, hold_minutes, confirmation_hours, cleaning_fee_xaf, taxes_xaf, is_active, product_id)
                VALUES ('${shopId}','Habitación E2E',2000,5,50,120,24,0,0,true,'${prodId}') RETURNING id`);
  }
  q(`UPDATE lifebook.room_types SET base_price_xaf=2000, total_units=5, deposit_percent=50, hold_minutes=120, confirmation_hours=24, is_active=true, product_id='${prodId}' WHERE id='${roomId}'`);
  q(`INSERT INTO lifebook.shop_payment_methods (shop_id, method, status) VALUES ('${shopId}','likebook_wallet','active')
     ON CONFLICT (shop_id, method) DO UPDATE SET status='active'`);
  // Noches limpias para el escenario (por si quedaron de corridas anteriores).
  q(`DELETE FROM lifebook.reservation_nights WHERE reservation_id IN (SELECT id FROM lifebook.reservations WHERE room_type_id='${roomId}')`);
  q(`DELETE FROM lifebook.reservations WHERE room_type_id='${roomId}'`);
  q(`UPDATE wallet.wallets SET balance_available=${SALDO_INICIAL}, balance_escrow=0, version=version+1 WHERE user_id='${idHuesped}'`);
  console.log(`  hotel=${shopId.slice(0, 8)}… habitación=${roomId.slice(0, 8)}… · saldo del huésped a ${SALDO_INICIAL}`);

  const tokH = await entrar(HUESPED);
  const tokD = await entrar(HOTELERO);

  // ── 1) Reserva pagando la señal con el monedero ───────────────────────────
  console.log('\n== 1. RESERVA CON MONEDERO (señal en garantía) ==');
  // Importe de la señal: lo calcula el servidor (50 % de 1 noche × 2.000 = 1.000).
  const SENAL = 1000;
  const antes = saldo(HUESPED.phone);
  const tp = await req('POST', `${API}/auth/payment-token`, tokH, { method: 'PIN', pin: HUESPED.pin, scope: 'ESCROW_LOCK', amount: SENAL });
  comprobar(!!tp.b?.paymentToken, 'el servidor emitió el token de la señal');
  const r1 = await req('POST', `${HOST}/reservations`, tokH, {
    roomTypeId: roomId, checkIn: hoy(), checkOut: manana(), units: 1, guests: 1,
    guestName: 'Huésped E2E', guestPhone: '+240555000111',
    paymentMethod: 'likebook_wallet',
  }, { 'Idempotency-Key': `lb99a-${Date.now()}`, 'X-Payment-Token': tp.b?.paymentToken });
  const res = r1.b?.reservation ?? null;
  console.log(`  reserva → HTTP ${r1.s} ${res?.code ?? JSON.stringify(r1.b).slice(0, 200)}`);
  comprobar(!!res?.id, 'la reserva se creó pagando la señal con el monedero');
  comprobar(Number(res?.depositXaf ?? res?.deposit_xaf ?? 0) === SENAL, `la señal es ${SENAL} (${res?.depositXaf ?? res?.deposit_xaf})`);
  comprobar(String(res?.paymentStatus ?? res?.payment_status) === 'deposit_paid', `el pago queda retenido, no «pending» (${res?.paymentStatus ?? res?.payment_status})`);
  const despues = saldo(HUESPED.phone);
  comprobar(despues.available === antes.available - SENAL, `disponible ${antes.available} → ${despues.available} (−${SENAL})`);
  comprobar(despues.escrow === antes.escrow + SENAL, `en garantía ${antes.escrow} → ${despues.escrow} (+${SENAL})`);
  const enlace = q(`SELECT reference_activity_id FROM wallet.transactions WHERE type='ESCROW_LOCK' AND sender_id='${idHuesped}' ORDER BY created_at DESC LIMIT 1`);
  comprobar(enlace === String(res?.id), 'el cerrojo quedó enlazado a la reserva');

  // ── 2) El hotel confirma y el huésped entra → cobra la señal ──────────────
  console.log('\n== 2. ENTRADA (el hotel cobra la señal en su monedero) ==');
  const dAntes = saldo(HOTELERO.phone);
  const rc = await req('PATCH', `${HOST}/reservations/${res.id}/action`, tokD, { action: 'confirm' });
  comprobar(rc.s < 300, `el hotel confirmó la reserva → HTTP ${rc.s} ${JSON.stringify(rc.b).slice(0, 120)}`);
  const ri = await req('PATCH', `${HOST}/reservations/${res.id}/action`, tokD, { action: 'checkin' });
  comprobar(ri.s < 300, `entrada registrada → HTTP ${ri.s} ${JSON.stringify(ri.b).slice(0, 120)}`);
  const dDespues = saldo(HOTELERO.phone);
  comprobar(dDespues.available === dAntes.available + SENAL, `monedero del hotel ${dAntes.available} → ${dDespues.available} (+${SENAL})`);
  comprobar(saldo(HUESPED.phone).escrow === 0, `la garantía del huésped quedó a 0 (${saldo(HUESPED.phone).escrow})`);
  comprobar(Number(q(`SELECT count(*) FROM wallet.transactions WHERE type='ESCROW_RELEASE' AND reference_activity_id='${res.id}'`)) === 1, 'hay UNA liberación');

  // ── 3) Cancelación → devolución íntegra ───────────────────────────────────
  console.log('\n== 3. CANCELACIÓN (la señal vuelve íntegra) ==');
  const base = saldo(HUESPED.phone);
  const tp2 = await req('POST', `${API}/auth/payment-token`, tokH, { method: 'PIN', pin: HUESPED.pin, scope: 'ESCROW_LOCK', amount: SENAL });
  const r2 = await req('POST', `${HOST}/reservations`, tokH, {
    roomTypeId: roomId, checkIn: hoy(), checkOut: manana(), units: 1, guests: 1,
    guestName: 'Huésped E2E', guestPhone: '+240555000111',
    paymentMethod: 'likebook_wallet',
  }, { 'Idempotency-Key': `lb99a-cancel-${Date.now()}`, 'X-Payment-Token': tp2.b?.paymentToken });
  const res2 = r2.b?.reservation ?? null;
  comprobar(!!res2?.id, `segunda reserva creada (${res2?.code ?? JSON.stringify(r2.b).slice(0, 140)})`);
  comprobar(saldo(HUESPED.phone).escrow === base.escrow + SENAL, 'la segunda reserva volvió a retener la señal');
  const rcan = await req('PATCH', `${HOST}/reservations/${res2.id}/action`, tokH, { action: 'cancel', reason: 'prueba e2e' });
  comprobar(rcan.s < 300, `el huésped canceló → HTTP ${rcan.s} ${JSON.stringify(rcan.b).slice(0, 120)}`);
  const tras = saldo(HUESPED.phone);
  comprobar(tras.escrow === base.escrow, `garantía devuelta (${base.escrow + SENAL} → ${tras.escrow})`);
  comprobar(tras.available === base.available, `disponible intacto (${base.available} → ${tras.available})`);
  comprobar(Number(q(`SELECT count(*) FROM wallet.transactions WHERE type='ESCROW_REFUND' AND reference_activity_id='${res2.id}'`)) === 1, 'hay UNA devolución asentada');

  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS=${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.log(`  FALLO inesperado: ${e.message}`); process.exit(1); });
