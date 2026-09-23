// lb100a-wallet-intercity.cjs — EL MONEDERO PAGA EL BILLETE CIUDAD-A-CIUDAD (parche 100).
//
// Modelo de este vertical: el billete lo cobra el CONDUCTOR y la plataforma le descuenta su
// comisión (5 % por defecto) como deuda en `billing_commissions`. Con el monedero:
//   1) El comprador confirma con PIN → el importe del billete queda EN GARANTÍA.
//   2) El conductor confirma el cobro (`PUT /bookings/:id/paid`) → cobra en SU monedero el
//      importe MENOS la comisión, que la plataforma se lleva EN ORIGEN (FEE) y por eso NO se
//      le crea deuda.
//   3) Reserva cancelada (o tarifa rechazada) → el importe vuelve ÍNTEGRO al comprador.
const { execSync } = require('node:child_process');

const V1 = process.env.LB_V1 ?? 'http://127.0.0.1:3000/api/v1';
const IC = process.env.LB_IC ?? 'http://127.0.0.1:3000/api';
const COMPRADOR = { phone: '+240555000111', password: 'PruebaKyc2026', pin: '246810' };
const PUBLICADOR = { phone: '+240555000003', password: '123456' };
const PRECIO = 5000;
const SALDO_INICIAL = 30000;

let fallos = 0;
const comprobar = (ok, texto) => { console.log(`  ${ok ? 'OK  ' : 'FALLO'} ${texto}`); if (!ok) fallos += 1; };
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 220) }; } };
const q = (sql) => {
  const salida = execSync('docker exec -i mirror-postgres psql -U postgres -d egrouteplan -tA', { input: sql, encoding: 'utf8' }).trim();
  return salida.split('\n').map((l) => l.trim()).filter((l) => l && !/^(INSERT|UPDATE|DELETE|SELECT) \d/.test(l))[0] ?? '';
};
const entrar = async ({ phone, password }) => {
  const r = await j(await fetch(`${V1}/mobility/auth/login`, {
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

(async () => {
  console.log('\n== 0. FIXTURE (ruta y viaje publicados por el conductor de prueba) ==');
  const idComprador = q(`SELECT id FROM mobility.users WHERE phone='${COMPRADOR.phone}'`);
  const idPub = q(`SELECT id FROM mobility.users WHERE phone='${PUBLICADOR.phone}'`);
  // El publicador puede ser conductor verificado o agente de caja (misma regla que el servicio).
  const driverId = q(`SELECT id FROM mobility.drivers WHERE user_id='${idPub}' AND is_verified = true LIMIT 1`);
  const agentId = driverId ? '' : q(`SELECT a.id FROM wallet.agents a JOIN mobility.users u ON u.id=a.user_id WHERE u.phone='${PUBLICADOR.phone}' AND a.status='ACTIVE' LIMIT 1`);
  const pubType = driverId ? 'driver' : 'agent';
  const pubId = driverId || agentId;
  if (!pubId) { console.log('  FALLO el publicador de prueba no es conductor verificado ni agente'); process.exit(1); }

  let routeId = q(`SELECT id FROM wallet.intercity_routes WHERE origin_city='Malabo E2E' AND destination_city='Bata E2E' LIMIT 1`);
  if (!routeId) {
    // Estas tablas NO tienen default de id (a diferencia del resto): se da explícito.
    routeId = q(`INSERT INTO wallet.intercity_routes (id, origin_city, destination_city, base_price, updated_at)
                 VALUES (gen_random_uuid(),'Malabo E2E','Bata E2E',${PRECIO}, now()) RETURNING id`);
  }
  let tripId = q(`SELECT id FROM wallet.intercity_trips WHERE route_id='${routeId}' AND publisher_id='${pubId}' LIMIT 1`);
  if (!tripId) {
    tripId = q(`INSERT INTO wallet.intercity_trips (id, route_id, publisher_id, publisher_type, price, departure_time, available_seats, total_seats, status, vehicle_type, updated_at)
                VALUES (gen_random_uuid(),'${routeId}','${pubId}','${pubType}',${PRECIO}, now() + interval '1 day', 4, 4, 'scheduled', 'car', now()) RETURNING id`);
  }
  q(`UPDATE wallet.intercity_trips SET status='scheduled', available_seats=4, total_seats=4, price=${PRECIO}, departure_time=now() + interval '1 day' WHERE id='${tripId}'`);
  q(`DELETE FROM wallet.intercity_bookings WHERE trip_id='${tripId}'`);
  q(`UPDATE wallet.wallets SET balance_available=${SALDO_INICIAL}, balance_escrow=0, version=version+1 WHERE user_id='${idComprador}'`);
  console.log(`  viaje=${tripId.slice(0, 8)}… publicador=${pubType} · saldo del comprador a ${SALDO_INICIAL}`);

  const tokC = await entrar(COMPRADOR);
  const tokP = await entrar(PUBLICADOR);

  const reservar = async (sufijo) => {
    const tp = await req('POST', `${V1}/auth/payment-token`, tokC, { method: 'PIN', pin: COMPRADOR.pin, scope: 'ESCROW_LOCK', amount: PRECIO });
    return req('POST', `${IC}/intercity/bookings`, tokC, {
      tripId, seatCount: 1, payOn: 'boarding', paymentMethod: 'likebook_wallet',
      passenger: {
        firstName: 'Pasajero', lastName: 'E2E', phone: COMPRADOR.phone,
        nationalityType: 'national', documentType: 'DIP', documentNumber: 'E2E100A',
      },
    }, { 'Idempotency-Key': `lb100a-${sufijo}-${Date.now()}`, 'X-Payment-Token': tp.b?.paymentToken });
  };

  // ── 1) Reserva pagada con el monedero ─────────────────────────────────────
  console.log('\n== 1. BILLETE CON MONEDERO (importe en garantía) ==');
  const antes = saldo(COMPRADOR.phone);
  const r1 = await reservar('a');
  const b1 = r1.b?.booking ?? r1.b;
  console.log(`  reserva → HTTP ${r1.s} ${b1?.shortCode ?? JSON.stringify(r1.b).slice(0, 180)}`);
  comprobar(!!b1?.id, 'la reserva se creó pagando con el monedero');
  comprobar(String(b1?.paymentMethod) === 'likebook_wallet', `la reserva guarda su forma de pago (${b1?.paymentMethod})`);
  const despues = saldo(COMPRADOR.phone);
  comprobar(despues.available === antes.available - PRECIO, `disponible ${antes.available} → ${despues.available} (−${PRECIO})`);
  comprobar(despues.escrow === antes.escrow + PRECIO, `en garantía ${antes.escrow} → ${despues.escrow} (+${PRECIO})`);
  const enlace = q(`SELECT reference_activity_id FROM wallet.transactions WHERE type='ESCROW_LOCK' AND sender_id='${idComprador}' ORDER BY created_at DESC LIMIT 1`);
  comprobar(enlace === String(b1?.id), 'el cerrojo quedó enlazado a la reserva');

  // ── 2) El conductor confirma el cobro → cobra menos comisión ──────────────
  console.log('\n== 2. COBRO DEL CONDUCTOR (comisión descontada en origen) ==');
  const pAntes = saldo(PUBLICADOR.phone);
  const comisionesAntes = Number(q(`SELECT count(*) FROM wallet.billing_commissions WHERE ref_id='${b1.id}'`));
  const rc = await req('PUT', `${IC}/intercity/bookings/${b1.id}/paid`, tokP, {});
  comprobar(rc.s < 300, `el conductor confirmó el cobro → HTTP ${rc.s} ${JSON.stringify(rc.b).slice(0, 120)}`);
  const pDespues = saldo(PUBLICADOR.phone);
  const recibido = pDespues.available - pAntes.available;
  comprobar(recibido > 0 && recibido < PRECIO, `cobró ${recibido} de ${PRECIO} (la comisión se quedó la plataforma)`);
  comprobar(saldo(COMPRADOR.phone).escrow === antes.escrow, `la garantía del comprador quedó a ${antes.escrow}`);
  comprobar(Number(q(`SELECT count(*) FROM wallet.transactions WHERE type='ESCROW_RELEASE' AND reference_activity_id='${b1.id}'`)) === 1, 'hay UNA liberación');
  comprobar(Number(q(`SELECT count(*) FROM wallet.transactions WHERE type='FEE' AND reference_activity_id='${b1.id}'`)) === 1, 'la comisión quedó asentada como FEE');
  comprobar(Number(q(`SELECT count(*) FROM wallet.billing_commissions WHERE ref_id='${b1.id}'`)) === comisionesAntes,
    'NO se le creó deuda de comisión al conductor (ya se descontó del importe)');

  // ── 3) Cancelación → devolución íntegra ───────────────────────────────────
  console.log('\n== 3. CANCELACIÓN (el billete vuelve íntegro) ==');
  const base = saldo(COMPRADOR.phone);
  const r2 = await reservar('cancel');
  const b2 = r2.b?.booking ?? r2.b;
  comprobar(!!b2?.id, `segunda reserva creada (${b2?.shortCode ?? JSON.stringify(r2.b).slice(0, 140)})`);
  comprobar(saldo(COMPRADOR.phone).escrow === base.escrow + PRECIO, 'la segunda reserva volvió a retener el importe');
  const rcan = await req('PUT', `${IC}/intercity/bookings/${b2.id}/cancel`, tokC, {});
  comprobar(rcan.s < 300, `el comprador canceló → HTTP ${rcan.s} ${JSON.stringify(rcan.b).slice(0, 120)}`);
  const tras = saldo(COMPRADOR.phone);
  comprobar(tras.escrow === base.escrow, `garantía devuelta (${base.escrow + PRECIO} → ${tras.escrow})`);
  comprobar(tras.available === base.available, `disponible intacto (${base.available} → ${tras.available})`);
  comprobar(Number(q(`SELECT count(*) FROM wallet.transactions WHERE type='ESCROW_REFUND' AND reference_activity_id='${b2.id}'`)) === 1, 'hay UNA devolución asentada');

  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS=${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.log(`  FALLO inesperado: ${e.message}`); process.exit(1); });
