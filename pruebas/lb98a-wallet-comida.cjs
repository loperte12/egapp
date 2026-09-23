// lb98a-wallet-comida.cjs — EL MONEDERO PAGA EN COMIDA RÁPIDA (parche 98).
//
// Camino del dinero completo de un pedido de comida pagado con el monedero:
//   1) El cliente confirma con PIN → el importe sale de su saldo y queda EN GARANTÍA.
//   2) El restaurante entrega → su NETO entra en el monedero del dueño; la comisión de
//      plataforma (y la del reparto) quedan asentadas como FEE.
//   3) Pedido cancelado antes de cocinar → el dinero VUELVE ÍNTEGRO al cliente.
//   4) `flags.escrow` dice la verdad (antes era `false` a fuego).
//
// Fixture propio: restaurante + plato del CONDUCTOR de prueba; cliente = PASAJERO de prueba.
const { execSync } = require('node:child_process');

const V1 = process.env.LB_V1 ?? 'http://127.0.0.1:3000/api/v1';      // auth + monedero
const FOOD = process.env.LB_FOOD ?? 'http://127.0.0.1:3000/api';     // comida (/api/food/...)
const CLIENTE = { phone: '+240555000111', password: 'PruebaKyc2026', pin: '246810' };
const DUENO = { phone: '+240555000003', password: '123456' };
const PRECIO = 1500;
const SALDO_INICIAL = 30000;

let fallos = 0;
const comprobar = (ok, texto) => { console.log(`  ${ok ? 'OK  ' : 'FALLO'} ${texto}`); if (!ok) fallos += 1; };
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 220) }; } };
const q = (sql) => {
  const salida = execSync('docker exec -i mirror-postgres psql -U postgres -d egrouteplan -tA', { input: sql, encoding: 'utf8' }).trim();
  return salida.split('\n').map((l) => l.trim()).filter((l) => l && !/^(INSERT|UPDATE|DELETE|SELECT) \d/.test(l))[0] ?? '';
};
const entrar = async ({ phone, password }, base = V1) => {
  const r = await j(await fetch(`${base}/mobility/auth/login`, {
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
  console.log('\n== 0. FIXTURE (restaurante y plato del dueño de prueba) ==');
  const idCliente = q(`SELECT id FROM mobility.users WHERE phone='${CLIENTE.phone}'`);
  const idDueno = q(`SELECT id FROM mobility.users WHERE phone='${DUENO.phone}'`);
  if (!idCliente || !idDueno) { console.log('  FALLO faltan usuarios de prueba'); process.exit(1); }

  let restId = q(`SELECT id FROM wallet.food_restaurants WHERE user_id='${idDueno}' LIMIT 1`);
  if (!restId) {
    restId = q(`INSERT INTO wallet.food_restaurants (user_id, business_name, city, status) VALUES ('${idDueno}','Restaurante E2E Monedero','Malabo','active') RETURNING id`);
  }
  // El servicio solo deja pedir a restaurantes con status='active' («Restaurante no disponible»).
  q(`UPDATE wallet.food_restaurants SET status='active' WHERE id='${restId}'`);
  let itemId = q(`SELECT id FROM wallet.food_menu_items WHERE restaurant_id='${restId}' AND name='Plato E2E Monedero' LIMIT 1`);
  if (!itemId) {
    itemId = q(`INSERT INTO wallet.food_menu_items (restaurant_id, name, price_xaf, status, available) VALUES ('${restId}','Plato E2E Monedero',${PRECIO},'active',true) RETURNING id`);
  }
  q(`UPDATE wallet.food_menu_items SET price_xaf=${PRECIO}, status='active', available=true WHERE id='${itemId}'`);
  q(`UPDATE wallet.wallets SET balance_available=${SALDO_INICIAL}, balance_escrow=0, version=version+1 WHERE user_id='${idCliente}'`);
  console.log(`  restaurante=${restId.slice(0, 8)}… plato=${itemId.slice(0, 8)}… · saldo del cliente forzado a ${SALDO_INICIAL}`);

  const tokC = await entrar(CLIENTE);
  const tokD = await entrar(DUENO);

  console.log('\n== 1. FLAGS ==');
  const fl = await req('GET', `${FOOD}/food/flags`, tokC);
  comprobar(fl.b?.escrow === true, `flags.escrow dice la verdad (${JSON.stringify(fl.b)})`);

  // ── 2) Pedido pagado con el monedero ──────────────────────────────────────
  console.log('\n== 2. PEDIDO CON MONEDERO (importe en garantía) ==');
  const antes = saldo(CLIENTE.phone);
  const tp = await req('POST', `${V1}/auth/payment-token`, tokC, { method: 'PIN', pin: CLIENTE.pin, scope: 'ESCROW_LOCK', amount: PRECIO });
  const token = tp.b?.paymentToken;
  comprobar(!!token, 'el servidor emitió el token de pago del importe exacto');
  const r1 = await req('POST', `${FOOD}/food/orders`, tokC,
    { restaurantId: restId, items: [{ itemId, qty: 1 }], paymentMethod: 'likebook_wallet', pickupType: 'pickup' },
    { 'X-Payment-Token': token });
  const pedido = r1.b?.order?.id ?? r1.b?.order?.order?.id ?? null;
  console.log(`  pedido → HTTP ${r1.s} ${pedido ? pedido.slice(0, 8) + '…' : JSON.stringify(r1.b).slice(0, 200)}`);
  comprobar(!!pedido, 'el pedido de comida se creó pagando con el monedero');
  const despues = saldo(CLIENTE.phone);
  comprobar(despues.available === antes.available - PRECIO, `disponible ${antes.available} → ${despues.available} (−${PRECIO})`);
  comprobar(despues.escrow === antes.escrow + PRECIO, `en garantía ${antes.escrow} → ${despues.escrow} (+${PRECIO})`);
  const metodo = q(`SELECT payment_method FROM wallet.food_orders WHERE id='${pedido}'`);
  comprobar(metodo === 'likebook_wallet', `el pedido guarda su forma de pago (${metodo})`);
  const enlace = q(`SELECT reference_activity_id FROM wallet.transactions WHERE type='ESCROW_LOCK' AND sender_id='${idCliente}' ORDER BY created_at DESC LIMIT 1`);
  comprobar(enlace === pedido, 'el cerrojo quedó enlazado al pedido');

  // ── 3) El restaurante entrega → cobra en su monedero ──────────────────────
  console.log('\n== 3. ENTREGA (el restaurante cobra en su monedero) ==');
  const desglose = q(`SELECT restaurant_net_xaf||'|'||platform_fee_xaf||'|'||rider_fee_xaf FROM wallet.food_orders WHERE id='${pedido}'`).split('|').map(Number);
  const [neto, comision, reparto] = desglose;
  const dAntes = saldo(DUENO.phone);
  for (const status of ['confirmed', 'preparing', 'ready', 'delivered']) {
    const r = await req('PUT', `${FOOD}/food/orders/${pedido}/status`, tokD, { status, as: 'owner' });
    if (r.s >= 300) console.log(`  ${status} → HTTP ${r.s} ${JSON.stringify(r.b).slice(0, 120)}`);
  }
  const est = q(`SELECT status FROM wallet.food_orders WHERE id='${pedido}'`);
  comprobar(est === 'delivered', `el pedido quedó entregado (${est})`);
  const dDespues = saldo(DUENO.phone);
  comprobar(dDespues.available === dAntes.available + neto,
    `monedero del dueño ${dAntes.available} → ${dDespues.available} (+${neto} neto; comisión ${comision}, reparto ${reparto})`);
  comprobar(saldo(CLIENTE.phone).escrow === 0, `la garantía del cliente quedó a 0 (${saldo(CLIENTE.phone).escrow})`);
  comprobar(Number(q(`SELECT count(*) FROM wallet.transactions WHERE type='ESCROW_RELEASE' AND reference_activity_id='${pedido}'`)) === 1, 'hay UNA liberación');
  comprobar(Number(q(`SELECT count(*) FROM wallet.transactions WHERE type='FEE' AND reference_activity_id='${pedido}'`)) === 1, 'la comisión quedó asentada como FEE');
  const dTrasReintento = dDespues.available;
  await req('PUT', `${FOOD}/food/orders/${pedido}/status`, tokD, { status: 'delivered', as: 'owner' });
  comprobar(saldo(DUENO.phone).available === dTrasReintento, 'repetir la entrega no vuelve a pagar al restaurante');

  // ── 4) Cancelación → devolución íntegra ───────────────────────────────────
  console.log('\n== 4. CANCELACIÓN (devolución íntegra) ==');
  const base = saldo(CLIENTE.phone);
  const tp2 = await req('POST', `${V1}/auth/payment-token`, tokC, { method: 'PIN', pin: CLIENTE.pin, scope: 'ESCROW_LOCK', amount: PRECIO });
  const r2 = await req('POST', `${FOOD}/food/orders`, tokC,
    { restaurantId: restId, items: [{ itemId, qty: 1 }], paymentMethod: 'likebook_wallet', pickupType: 'pickup' },
    { 'X-Payment-Token': tp2.b?.paymentToken });
  const pedido2 = r2.b?.order?.id ?? r2.b?.order?.order?.id ?? null;
  comprobar(!!pedido2, `segundo pedido creado (${pedido2 ? pedido2.slice(0, 8) + '…' : JSON.stringify(r2.b).slice(0, 140)})`);
  comprobar(saldo(CLIENTE.phone).escrow === base.escrow + PRECIO, 'el segundo pedido volvió a retener el importe');
  const rc = await req('PUT', `${FOOD}/food/orders/${pedido2}/status`, tokC, { status: 'cancelled', as: 'user' });
  comprobar(rc.s < 300, `el cliente canceló → HTTP ${rc.s} ${JSON.stringify(rc.b).slice(0, 120)}`);
  const tras = saldo(CLIENTE.phone);
  comprobar(tras.escrow === base.escrow, `garantía devuelta (${base.escrow + PRECIO} → ${tras.escrow})`);
  comprobar(tras.available === base.available, `disponible intacto (${base.available} → ${tras.available})`);
  comprobar(Number(q(`SELECT count(*) FROM wallet.transactions WHERE type='ESCROW_REFUND' AND reference_activity_id='${pedido2}'`)) === 1, 'hay UNA devolución asentada');

  // ── 5) El token es de un solo uso ─────────────────────────────────────────
  console.log('\n== 5. EL TOKEN NO SIRVE DOS VECES ==');
  const antes5 = saldo(CLIENTE.phone);
  const r5 = await req('POST', `${FOOD}/food/orders`, tokC,
    { restaurantId: restId, items: [{ itemId, qty: 1 }], paymentMethod: 'likebook_wallet', pickupType: 'pickup' },
    { 'X-Payment-Token': tp2.b?.paymentToken });
  comprobar(r5.s >= 400, `reusar el token se rechaza → HTTP ${r5.s} ${JSON.stringify(r5.b).slice(0, 120)}`);
  comprobar(saldo(CLIENTE.phone).escrow === antes5.escrow, 'y no movió ni un XAF');

  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS=${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.log(`  FALLO inesperado: ${e.message}`); process.exit(1); });
