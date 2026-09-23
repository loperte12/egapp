// lb106a-caducidades.cjs — VERIFICA EL ARREGLO DEL HALLAZGO MEDIO 5 (parche 106).
//
// Los tres verticales que podían retener dinero SIN SALIDA ya tienen caducidad con devolución:
//   · comida: pedido atascado en 'preparing'/'ready'
//   · Ecomerse: pedido atascado en 'in_transit'
//   · ciudad-a-ciudad: billete cuyo conductor nunca confirmó el cobro y el viaje ya pasó
// En cada caso: el pedido se cancela, el importe VUELVE al comprador y solo ADMIN puede disparar el
// barrido.
const { execSync } = require('node:child_process');

const V1 = process.env.LB_V1 ?? 'http://127.0.0.1:3000/api/v1';
const FOOD = 'http://127.0.0.1:3000/api';
const EC = 'http://127.0.0.1:3000/api';
const IC = 'http://127.0.0.1:3000/api';
const COMPRADOR = { phone: '+240555000111', password: 'PruebaKyc2026', pin: '246810' };
const VENDEDOR = { phone: '+240555000003' };
const ADMIN = '+240555000999';
const SALDO_INICIAL = 30000;

let fallos = 0;
const comprobar = (ok, t) => { console.log(`  ${ok ? 'OK  ' : 'FALLO'} ${t}`); if (!ok) fallos += 1; };
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };
const q = (sql) => {
  const s = execSync('docker exec -i mirror-postgres psql -U postgres -d egrouteplan -tA', { input: sql, encoding: 'utf8' }).trim();
  return s.split('\n').map((l) => l.trim()).filter((l) => l && !/^(INSERT|UPDATE|DELETE|SELECT) \d/.test(l))[0] ?? '';
};
const req = async (m, url, tok, body, extra = {}) => {
  const r = await fetch(url, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { s: r.status, b: await j(r) };
};
const entrar = async (phone, password) => {
  const r = await req('POST', V1 + '/mobility/auth/login', null, { phone, password });
  if (!r.b.accessToken) throw new Error('login ' + phone);
  return r.b.accessToken;
};
const saldo = (phone) => {
  const s = q("SELECT coalesce(w.balance_available,0)||'|'||coalesce(w.balance_escrow,0) FROM wallet.wallets w JOIN mobility.users u ON u.id=w.user_id WHERE u.phone='" + phone + "'");
  const p = s.split('|').map(Number);
  return { available: p[0], escrow: p[1] };
};
const token = async (tok, amount) => {
  const r = await req('POST', V1 + '/auth/payment-token', tok, { method: 'PIN', pin: COMPRADOR.pin, scope: 'ESCROW_LOCK', amount });
  return r.b?.paymentToken;
};

(async () => {
  const tokC = await entrar(COMPRADOR.phone, COMPRADOR.password);
  const tokA = await entrar(ADMIN, 'PruebaKyc2026');
  const idC = q("SELECT id FROM mobility.users WHERE phone='" + COMPRADOR.phone + "'");
  const idV = q("SELECT id FROM mobility.users WHERE phone='" + VENDEDOR.phone + "'");
  q('UPDATE wallet.wallets SET balance_available=' + SALDO_INICIAL + ", balance_escrow=0, version=version+1 WHERE user_id='" + idC + "'");
  console.log('  sesiones y saldo de prueba listos');

  // ── 1) COMIDA ─────────────────────────────────────────────────────────────
  console.log('\n== 1. COMIDA: pedido atascado en preparación ==');
  const restId = q("SELECT id FROM wallet.food_restaurants WHERE user_id='" + idV + "' LIMIT 1");
  const plato = q("SELECT id FROM wallet.food_menu_items WHERE restaurant_id='" + restId + "' AND name='Plato E2E Monedero' LIMIT 1");
  const antes = saldo(COMPRADOR.phone);
  const t1 = await token(tokC, 1500);
  const ped = await req('POST', FOOD + '/food/orders', tokC,
    { restaurantId: restId, items: [{ itemId: plato, qty: 1 }], paymentMethod: 'likebook_wallet', pickupType: 'pickup' },
    { 'X-Payment-Token': t1 });
  const oid = ped.b?.order?.id;
  comprobar(!!oid, 'pedido de comida creado con monedero (' + (oid ? oid.slice(0, 8) + '…' : JSON.stringify(ped.b).slice(0, 120)) + ')');
  q("UPDATE wallet.food_orders SET status='preparing', updated_at = now() - interval '7 hours' WHERE id='" + oid + "'");
  const noAdmin = await req('POST', FOOD + '/food/admin/expire-stale?horas=6', tokC, {});
  comprobar(noAdmin.s === 403 || noAdmin.s === 401, 'un usuario normal no puede disparar el barrido → HTTP ' + noAdmin.s);
  const bar1 = await req('POST', FOOD + '/food/admin/expire-stale?horas=6&limit=50', tokA, {});
  console.log('  barrido comida → HTTP ' + bar1.s + ' ' + JSON.stringify(bar1.b));
  comprobar(q("SELECT status FROM wallet.food_orders WHERE id='" + oid + "'") === 'cancelled', 'el pedido caducado quedó cancelado');
  comprobar(saldo(COMPRADOR.phone).escrow === antes.escrow && saldo(COMPRADOR.phone).available === antes.available,
    'y el importe VOLVIÓ al comprador (' + antes.available + '/garantía ' + antes.escrow + ')');

  // ── 2) ECOMERSE ───────────────────────────────────────────────────────────
  console.log('\n== 2. ECOMERSE: pedido atascado en tránsito ==');
  const sellerId = q("SELECT id FROM wallet.ecomerse_sellers WHERE user_id='" + idV + "' LIMIT 1");
  const prodEc = q("SELECT id FROM wallet.ecomerse_products WHERE seller_id='" + sellerId + "' AND title='Producto E2E Monedero' LIMIT 1");
  const antes2 = saldo(COMPRADOR.phone);
  const t2 = await token(tokC, 4000);
  const ped2 = await req('POST', EC + '/ecomerse/orders', tokC,
    { items: [{ productId: prodEc, qty: 1 }], paymentMethod: 'likebook_wallet', fulfillmentType: 'seller', deliveryAddress: 'Malabo E2E', idempotencyKey: 'lb106a-ec-' + Date.now() },
    { 'X-Payment-Token': t2 });
  const oid2 = ped2.b?.order?.id ?? (ped2.b?.orders ?? [])[0]?.id;
  comprobar(!!oid2, 'pedido de Ecomerse creado con monedero (' + (oid2 ? oid2.slice(0, 8) + '…' : JSON.stringify(ped2.b).slice(0, 120)) + ')');
  q("UPDATE wallet.ecomerse_orders SET status='in_transit', updated_at = now() - interval '25 hours' WHERE id='" + oid2 + "'");
  const bar2 = await req('POST', EC + '/ecomerse/admin/expire-stale?horas=24&limit=50', tokA, {});
  console.log('  barrido Ecomerse → HTTP ' + bar2.s + ' ' + JSON.stringify(bar2.b));
  comprobar(q("SELECT status FROM wallet.ecomerse_orders WHERE id='" + oid2 + "'") === 'cancelled', 'el pedido en tránsito caducado quedó cancelado');
  comprobar(saldo(COMPRADOR.phone).escrow === antes2.escrow && saldo(COMPRADOR.phone).available === antes2.available,
    'y el importe VOLVIÓ al comprador');

  // ── 3) CIUDAD-A-CIUDAD ────────────────────────────────────────────────────
  console.log('\n== 3. CIUDAD-A-CIUDAD: billete sin confirmar y viaje ya pasado ==');
  const tripId = q("SELECT t.id FROM wallet.intercity_trips t JOIN wallet.intercity_routes r ON r.id=t.route_id WHERE r.origin_city='Malabo E2E' LIMIT 1");
  q("UPDATE wallet.intercity_trips SET status='scheduled', available_seats=4, total_seats=4, departure_time = now() + interval '1 day' WHERE id='" + tripId + "'");
  q("UPDATE wallet.intercity_bookings SET status='cancelled' WHERE trip_id='" + tripId + "'");
  const antes3 = saldo(COMPRADOR.phone);
  const t3 = await token(tokC, 5000);
  const bk = await req('POST', IC + '/intercity/bookings', tokC,
    {
      tripId, seatCount: 1, payOn: 'boarding', paymentMethod: 'likebook_wallet',
      passenger: { firstName: 'Pasajero', lastName: 'E2E', phone: COMPRADOR.phone, nationalityType: 'national', documentType: 'DIP', documentNumber: 'E2E106A' },
    },
    { 'Idempotency-Key': 'lb106a-ic-' + Date.now(), 'X-Payment-Token': t3 });
  const bkId = bk.b?.booking?.id ?? bk.b?.id;
  comprobar(!!bkId, 'billete creado con monedero (' + (bkId ? String(bkId).slice(0, 8) + '…' : JSON.stringify(bk.b).slice(0, 120)) + ')');
  q("UPDATE wallet.intercity_trips SET departure_time = now() - interval '13 hours' WHERE id='" + tripId + "'");
  const asientosAntes = Number(q("SELECT available_seats FROM wallet.intercity_trips WHERE id='" + tripId + "'"));
  const bar3 = await req('POST', IC + '/intercity/admin/expire-stale?horas=12&limit=50', tokA, {});
  console.log('  barrido ciudad-a-ciudad → HTTP ' + bar3.s + ' ' + JSON.stringify(bar3.b));
  comprobar(q("SELECT status FROM wallet.intercity_bookings WHERE id='" + bkId + "'") === 'cancelled', 'el billete caducado quedó cancelado');
  comprobar(Number(q("SELECT available_seats FROM wallet.intercity_trips WHERE id='" + tripId + "'")) > asientosAntes, 'y los asientos volvieron al viaje');
  comprobar(saldo(COMPRADOR.phone).escrow === antes3.escrow && saldo(COMPRADOR.phone).available === antes3.available,
    'y el importe VOLVIÓ al comprador');

  console.log('\n' + (fallos === 0 ? 'TODO OK' : 'FALLOS=' + fallos));
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.log('  FALLO inesperado: ' + e.message); process.exit(1); });
