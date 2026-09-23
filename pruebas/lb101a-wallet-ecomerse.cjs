// lb101a-wallet-ecomerse.cjs — EL MONEDERO PAGA EN ECOMERSE (parche 101).
//
// Ecomerse crea UN PEDIDO POR VENDEDOR; con el monedero la compra es de una sola tienda (el token
// de pago va ligado a un importe). Camino del dinero:
//   1) El comprador confirma con PIN → el importe (productos + reparto) queda EN GARANTÍA.
//   2) El vendedor entrega → cobra en SU monedero el importe MENOS el reparto (que queda retenido
//      hasta que exista el módulo de pago al repartidor).
//   3) Pedido cancelado → el importe vuelve ÍNTEGRO al comprador.
const { execSync } = require('node:child_process');

const V1 = process.env.LB_V1 ?? 'http://127.0.0.1:3000/api/v1';
const EC = process.env.LB_EC ?? 'http://127.0.0.1:3000/api';
const COMPRADOR = { phone: '+240555000111', password: 'PruebaKyc2026', pin: '246810' };
const VENDEDOR = { phone: '+240555000003', password: '123456' };
const PRECIO = 4000;
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
  console.log('\n== 0. FIXTURE (vendedor y producto de Ecomerse) ==');
  const idComprador = q(`SELECT id FROM mobility.users WHERE phone='${COMPRADOR.phone}'`);
  const idVendedor = q(`SELECT id FROM mobility.users WHERE phone='${VENDEDOR.phone}'`);
  let sellerId = q(`SELECT id FROM wallet.ecomerse_sellers WHERE user_id='${idVendedor}' LIMIT 1`);
  if (!sellerId) {
    sellerId = q(`INSERT INTO wallet.ecomerse_sellers (id, user_id, business_name, city, status) VALUES (gen_random_uuid(),'${idVendedor}','Vendedor E2E Monedero','Malabo','active') RETURNING id`);
  }
  q(`UPDATE wallet.ecomerse_sellers SET status='active' WHERE id='${sellerId}'`);
  let prodId = q(`SELECT id FROM wallet.ecomerse_products WHERE seller_id='${sellerId}' AND title='Producto E2E Monedero' LIMIT 1`);
  if (!prodId) {
    prodId = q(`INSERT INTO wallet.ecomerse_products (id, seller_id, title, price_xaf, city, stock, status) VALUES (gen_random_uuid(),'${sellerId}','Producto E2E Monedero',${PRECIO},'Malabo',50,'active') RETURNING id`);
  }
  q(`UPDATE wallet.ecomerse_products SET price_xaf=${PRECIO}, stock=50, status='active' WHERE id='${prodId}'`);
  q(`DELETE FROM wallet.ecomerse_orders WHERE seller_id='${sellerId}'`);
  q(`UPDATE wallet.wallets SET balance_available=${SALDO_INICIAL}, balance_escrow=0, version=version+1 WHERE user_id='${idComprador}'`);
  console.log(`  vendedor=${sellerId.slice(0, 8)}… producto=${prodId.slice(0, 8)}… · saldo del comprador a ${SALDO_INICIAL}`);

  const tokC = await entrar(COMPRADOR);
  const tokV = await entrar(VENDEDOR);

  const comprar = async (sufijo) => {
    const tp = await req('POST', `${V1}/auth/payment-token`, tokC, { method: 'PIN', pin: COMPRADOR.pin, scope: 'ESCROW_LOCK', amount: PRECIO });
    return req('POST', `${EC}/ecomerse/orders`, tokC, {
      items: [{ productId: prodId, qty: 1 }],
      paymentMethod: 'likebook_wallet',
      fulfillmentType: 'seller',
      deliveryAddress: 'Malabo, E2E',
      idempotencyKey: `lb101a-${sufijo}-${Date.now()}`,
    }, { 'X-Payment-Token': tp.b?.paymentToken });
  };

  // ── 1) Compra con monedero ────────────────────────────────────────────────
  console.log('\n== 1. COMPRA CON MONEDERO (en garantía) ==');
  const antes = saldo(COMPRADOR.phone);
  const r1 = await comprar('a');
  const o1 = r1.b?.order ?? (r1.b?.orders ?? [])[0] ?? null;
  console.log(`  pedido → HTTP ${r1.s} ${o1?.id ? o1.id.slice(0, 8) + '…' : JSON.stringify(r1.b).slice(0, 200)}`);
  comprobar(!!o1?.id, 'la compra se creó pagando con el monedero');
  const despues = saldo(COMPRADOR.phone);
  comprobar(despues.available === antes.available - PRECIO, `disponible ${antes.available} → ${despues.available} (−${PRECIO})`);
  comprobar(despues.escrow === antes.escrow + PRECIO, `en garantía ${antes.escrow} → ${despues.escrow} (+${PRECIO})`);
  comprobar(q(`SELECT payment_method FROM wallet.ecomerse_orders WHERE id='${o1.id}'`) === 'likebook_wallet', 'el pedido guarda su forma de pago');
  comprobar(q(`SELECT reference_activity_id FROM wallet.transactions WHERE type='ESCROW_LOCK' AND sender_id='${idComprador}' ORDER BY created_at DESC LIMIT 1`) === String(o1.id),
    'el cerrojo quedó enlazado al pedido');

  // ── 2) El vendedor entrega → cobra ────────────────────────────────────────
  console.log('\n== 2. ENTREGA (el vendedor cobra en su monedero) ==');
  const reparto = Number(q(`SELECT logistics_fee_xaf FROM wallet.ecomerse_orders WHERE id='${o1.id}'`));
  const vAntes = saldo(VENDEDOR.phone);
  for (const status of ['confirmed', 'in_transit', 'delivered']) {
    const r = await req('PUT', `${EC}/ecomerse/orders/${o1.id}/status`, tokV, { status, as: 'seller' });
    if (r.s >= 300) console.log(`  ${status} → HTTP ${r.s} ${JSON.stringify(r.b).slice(0, 120)}`);
  }
  comprobar(q(`SELECT status FROM wallet.ecomerse_orders WHERE id='${o1.id}'`) === 'delivered', 'el pedido quedó entregado');
  const vDespues = saldo(VENDEDOR.phone);
  const esperado = PRECIO - reparto;
  comprobar(vDespues.available === vAntes.available + esperado,
    `monedero del vendedor ${vAntes.available} → ${vDespues.available} (+${esperado}; reparto ${reparto} retenido)`);
  comprobar(saldo(COMPRADOR.phone).escrow === antes.escrow, `la garantía del comprador quedó a ${antes.escrow}`);
  comprobar(Number(q(`SELECT count(*) FROM wallet.transactions WHERE type='ESCROW_RELEASE' AND reference_activity_id='${o1.id}'`)) === 1, 'hay UNA liberación');
  const vTras = vDespues.available;
  await req('PUT', `${EC}/ecomerse/orders/${o1.id}/status`, tokV, { status: 'delivered', as: 'seller' });
  comprobar(saldo(VENDEDOR.phone).available === vTras, 'repetir la entrega no vuelve a pagar');

  // ── 3) Cancelación → devolución íntegra ───────────────────────────────────
  console.log('\n== 3. CANCELACIÓN (devolución íntegra) ==');
  const base = saldo(COMPRADOR.phone);
  const r2 = await comprar('cancel');
  const o2 = r2.b?.order ?? (r2.b?.orders ?? [])[0] ?? null;
  comprobar(!!o2?.id, `segunda compra creada (${o2?.id ? o2.id.slice(0, 8) + '…' : JSON.stringify(r2.b).slice(0, 140)})`);
  comprobar(saldo(COMPRADOR.phone).escrow === base.escrow + PRECIO, 'la segunda compra volvió a retener el importe');
  const rcan = await req('POST', `${EC}/ecomerse/orders/${o2.id}/cancel`, tokC, { reason: 'prueba e2e' });
  comprobar(rcan.s < 300, `el comprador canceló → HTTP ${rcan.s} ${JSON.stringify(rcan.b).slice(0, 120)}`);
  const tras = saldo(COMPRADOR.phone);
  comprobar(tras.escrow === base.escrow, `garantía devuelta (${base.escrow + PRECIO} → ${tras.escrow})`);
  comprobar(tras.available === base.available, `disponible intacto (${base.available} → ${tras.available})`);
  comprobar(Number(q(`SELECT count(*) FROM wallet.transactions WHERE type='ESCROW_REFUND' AND reference_activity_id='${o2.id}'`)) === 1, 'hay UNA devolución asentada');

  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS=${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.log(`  FALLO inesperado: ${e.message}`); process.exit(1); });
