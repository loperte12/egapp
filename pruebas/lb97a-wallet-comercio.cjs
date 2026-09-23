// lb97a-wallet-comercio.cjs — EL MONEDERO COMO PASARELA DE PAGO DEL COMERCIO (parche 97).
//
// Comprueba el camino del dinero COMPLETO de una compra pagada con el monedero:
//   1) El comprador confirma con PIN → el importe sale de su saldo y queda EN GARANTÍA.
//   2) El vendedor entrega → el importe sale de la garantía y ENTRA en el monedero del
//      vendedor (neto), con la comisión de la plataforma asentada como FEE.
//   3) Pedido cancelado → el dinero VUELVE ÍNTEGRO al comprador.
//   4) Reintento con la misma Idempotency-Key → mismo pedido, sin bloquear dos veces.
//
// Fixture propio (no toca datos reales): tienda + producto del CONDUCTOR de prueba y
// método likebook_wallet activo en esa tienda. El comprador es el PASAJERO de prueba.
const { execSync } = require('node:child_process');

const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';
const COMPRADOR = { phone: '+240555000111', password: 'PruebaKyc2026', pin: '246810' };
const VENDEDOR = { phone: '+240555000003', password: '123456' };
const PRECIO = 1500;
const SALDO_INICIAL = 30000;

let fallos = 0;
const comprobar = (ok, texto) => { console.log(`  ${ok ? 'OK  ' : 'FALLO'} ${texto}`); if (!ok) fallos += 1; };
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 220) }; } };
// psql -tA imprime el resultado Y la etiqueta del comando («INSERT 0 1»): nos quedamos
// con la primera línea, que es el dato (un `INSERT ... RETURNING` devolvía las dos).
const q = (sql) => {
  const salida = execSync('docker exec -i mirror-postgres psql -U postgres -d egrouteplan -tA', { input: sql, encoding: 'utf8' }).trim();
  return salida.split('\n').map((l) => l.trim()).filter((l) => l && !/^(INSERT|UPDATE|DELETE|SELECT) \d/.test(l))[0] ?? '';
};

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
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { s: r.status, b: await j(r) };
};
const saldo = (phone) => {
  const s = q(`SELECT coalesce(w.balance_available,0)||'|'||coalesce(w.balance_escrow,0) FROM wallet.wallets w JOIN mobility.users u ON u.id=w.user_id WHERE u.phone='${phone}'`);
  const [a, e] = s.split('|').map(Number);
  return { available: a, escrow: e };
};
const tokenPago = async (tok, scope, amount) => {
  const r = await req('POST', '/auth/payment-token', tok, { method: 'PIN', pin: COMPRADOR.pin, scope, amount });
  if (!r.b?.paymentToken) throw new Error(`payment-token ${scope}: ${JSON.stringify(r.b).slice(0, 160)}`);
  return r.b.paymentToken;
};
const idPedido = (b) => b?.order?.id ?? b?.id ?? null;

(async () => {
  console.log('\n== 0. FIXTURE (tienda y producto del vendedor de prueba) ==');
  const idComprador = q(`SELECT id FROM mobility.users WHERE phone='${COMPRADOR.phone}'`);
  const idVendedor = q(`SELECT id FROM mobility.users WHERE phone='${VENDEDOR.phone}'`);
  if (!idComprador || !idVendedor) { console.log('  FALLO no encuentro los usuarios de prueba'); process.exit(1); }

  // Una tienda por dueño (uq_lb_shops_owner): el vendedor de prueba ya tiene la suya
  // —«Tienda Hotel 079171», con 0 productos y 0 pedidos—, así que el escenario se monta
  // dentro de ella sin ensuciar ninguna tienda real.
  let shopId = q(`SELECT id FROM lifebook.shops WHERE owner_id='${idVendedor}' LIMIT 1`);
  if (!shopId) {
    shopId = q(`INSERT INTO lifebook.shops (owner_id, name, city, is_active) VALUES ('${idVendedor}','Tienda E2E Monedero','Malabo',true) RETURNING id`);
  }
  let prodId = q(`SELECT id FROM lifebook.products WHERE shop_id='${shopId}' AND title='Producto E2E Monedero' LIMIT 1`);
  if (!prodId) {
    prodId = q(`INSERT INTO lifebook.products (shop_id, service_type, title, price_xaf, price_mode, stock_mode, stock_quantity, status)
                VALUES ('${shopId}','physical','Producto E2E Monedero',${PRECIO},'fixed','exact',50,'active') RETURNING id`);
  }
  q(`UPDATE lifebook.products SET status='active', stock_quantity=50, price_xaf=${PRECIO} WHERE id='${prodId}'`);
  q(`INSERT INTO lifebook.shop_payment_methods (shop_id, method, status) VALUES ('${shopId}','likebook_wallet','active')
     ON CONFLICT (shop_id, method) DO UPDATE SET status='active'`);
  q(`UPDATE wallet.wallets SET balance_available=${SALDO_INICIAL}, balance_escrow=0, version=version+1 WHERE user_id='${idComprador}'`);
  console.log(`  tienda=${shopId.slice(0, 8)}… producto=${prodId.slice(0, 8)}… · saldo del comprador forzado a ${SALDO_INICIAL}`);

  const tokC = await entrar(COMPRADOR);
  const tokV = await entrar(VENDEDOR);

  // ── 1) Compra con monedero ────────────────────────────────────────────────
  console.log('\n== 1. COMPRA CON MONEDERO (el importe queda en garantía) ==');
  const antes = saldo(COMPRADOR.phone);
  const tok = await tokenPago(tokC, 'ESCROW_LOCK', PRECIO);
  const r1 = await req('POST', '/lifebook/commerce/orders', tokC,
    { items: [{ productId: prodId, quantity: 1 }], deliveryMode: 'pickup', paymentMethod: 'likebook_wallet' },
    { 'Idempotency-Key': `lb97a-${Date.now()}`, 'X-Payment-Token': tok });
  const o1 = idPedido(r1.b);
  console.log(`  pedido → HTTP ${r1.s} ${o1 ? o1.slice(0, 8) + '…' : JSON.stringify(r1.b).slice(0, 180)}`);
  comprobar(!!o1, 'el pedido se creó pagando con el monedero');
  const despues = saldo(COMPRADOR.phone);
  comprobar(despues.available === antes.available - PRECIO, `saldo disponible ${antes.available} → ${despues.available} (−${PRECIO})`);
  comprobar(despues.escrow === antes.escrow + PRECIO, `en garantía ${antes.escrow} → ${despues.escrow} (+${PRECIO})`);
  const lockRef = q(`SELECT reference_activity_id FROM wallet.transactions WHERE type='ESCROW_LOCK' AND sender_id='${idComprador}' ORDER BY created_at DESC LIMIT 1`);
  comprobar(lockRef === o1, 'el cerrojo quedó enlazado al pedido (para poder liberarlo o devolverlo)');
  const estadoPago = q(`SELECT payment_status FROM lifebook.orders WHERE id='${o1}'`);
  comprobar(estadoPago === 'paid', `el pedido nace con el dinero retenido (payment_status=${estadoPago})`);

  // ── 2) Entrega → el vendedor cobra en SU monedero ─────────────────────────
  console.log('\n== 2. ENTREGA (el vendedor cobra en su monedero) ==');
  const vAntes = saldo(VENDEDOR.phone);
  for (const action of ['accept', 'prepare', 'send', 'deliver']) {
    const r = await req('PATCH', `/lifebook/commerce/orders/${o1}/action`, tokV, { action });
    if (r.s >= 300) { console.log(`  acción ${action} → HTTP ${r.s} ${JSON.stringify(r.b).slice(0, 140)}`); }
  }
  const est = q(`SELECT status FROM lifebook.orders WHERE id='${o1}'`);
  comprobar(est === 'delivered', `el pedido quedó entregado (${est})`);
  const fees = q(`SELECT comision_xaf||'|'||a_pagar_tienda_xaf||'|'||entrega_xaf FROM lifebook.order_fees WHERE order_id='${o1}'`).split('|').map(Number);
  const [comision, aPagarTienda, entrega] = fees;
  const vDespues = saldo(VENDEDOR.phone);
  comprobar(vDespues.available === vAntes.available + aPagarTienda,
    `monedero del vendedor ${vAntes.available} → ${vDespues.available} (+${aPagarTienda} neto; comisión ${comision}, reparto ${entrega})`);
  const escrowDespues = saldo(COMPRADOR.phone).escrow;
  comprobar(escrowDespues === 0, `la garantía del comprador quedó a 0 (${escrowDespues})`);
  const rel = q(`SELECT count(*) FROM wallet.transactions WHERE type='ESCROW_RELEASE' AND reference_activity_id='${o1}'`);
  comprobar(Number(rel) === 1, 'hay UNA liberación (ni cero ni dos)');
  const feeTx = q(`SELECT count(*) FROM wallet.transactions WHERE type='FEE' AND reference_activity_id='${o1}'`);
  comprobar(Number(feeTx) === 1, 'la comisión de la plataforma quedó asentada como FEE');

  // Reintento de la entrega: no puede pagar dos veces.
  const vTrasReintento = vDespues.available;
  await req('PATCH', `/lifebook/commerce/orders/${o1}/action`, tokV, { action: 'deliver' });
  comprobar(saldo(VENDEDOR.phone).available === vTrasReintento, 'repetir la entrega no vuelve a pagar al vendedor');

  // ── 3) Cancelación → devolución íntegra ───────────────────────────────────
  console.log('\n== 3. CANCELACIÓN (el dinero vuelve íntegro) ==');
  const base = saldo(COMPRADOR.phone);
  const tok2 = await tokenPago(tokC, 'ESCROW_LOCK', PRECIO);
  const r2 = await req('POST', '/lifebook/commerce/orders', tokC,
    { items: [{ productId: prodId, quantity: 1 }], deliveryMode: 'pickup', paymentMethod: 'likebook_wallet' },
    { 'Idempotency-Key': `lb97a-cancel-${Date.now()}`, 'X-Payment-Token': tok2 });
  const o2 = idPedido(r2.b);
  comprobar(!!o2, `segundo pedido creado (${o2 ? o2.slice(0, 8) + '…' : JSON.stringify(r2.b).slice(0, 140)})`);
  comprobar(saldo(COMPRADOR.phone).escrow === base.escrow + PRECIO, 'el segundo pedido volvió a retener el importe');
  const rc = await req('PATCH', `/lifebook/commerce/orders/${o2}/action`, tokC, { action: 'cancel' });
  comprobar(rc.s < 300, `el comprador canceló → HTTP ${rc.s}`);
  const tras = saldo(COMPRADOR.phone);
  comprobar(tras.escrow === base.escrow, `garantía devuelta (${base.escrow + PRECIO} → ${tras.escrow})`);
  comprobar(tras.available === base.available, `saldo disponible intacto (${base.available} → ${tras.available})`);
  const ref = q(`SELECT count(*) FROM wallet.transactions WHERE type='ESCROW_REFUND' AND reference_activity_id='${o2}'`);
  comprobar(Number(ref) === 1, 'hay UNA devolución asentada');

  // ── 4) Idempotencia de la compra ──────────────────────────────────────────
  console.log('\n== 4. REINTENTO CON LA MISMA CLAVE (no bloquea dos veces) ==');
  const clave = `lb97a-idem-${Date.now()}`;
  const b4 = saldo(COMPRADOR.phone);
  const t4a = await tokenPago(tokC, 'ESCROW_LOCK', PRECIO);
  const r4a = await req('POST', '/lifebook/commerce/orders', tokC,
    { items: [{ productId: prodId, quantity: 1 }], deliveryMode: 'pickup', paymentMethod: 'likebook_wallet' },
    { 'Idempotency-Key': clave, 'X-Payment-Token': t4a });
  const o4 = idPedido(r4a.b);
  const trasA = saldo(COMPRADOR.phone);
  const t4b = await tokenPago(tokC, 'ESCROW_LOCK', PRECIO);
  const r4b = await req('POST', '/lifebook/commerce/orders', tokC,
    { items: [{ productId: prodId, quantity: 1 }], deliveryMode: 'pickup', paymentMethod: 'likebook_wallet' },
    { 'Idempotency-Key': clave, 'X-Payment-Token': t4b });
  const o4b = idPedido(r4b.b);
  const trasB = saldo(COMPRADOR.phone);
  comprobar(o4 && o4 === o4b, 'el reintento devuelve EL MISMO pedido');
  comprobar(trasB.escrow === trasA.escrow, `el reintento no volvió a retener (garantía ${trasA.escrow} → ${trasB.escrow})`);
  comprobar(trasA.escrow === b4.escrow + PRECIO, 'el primer intento sí retuvo el importe una sola vez');

  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS=${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.log(`  FALLO inesperado: ${e.message}`); process.exit(1); });
