// lb105a-cerrojos.cjs — VERIFICA EL ARREGLO DEL HALLAZGO MEDIO 4 (parche 105).
//
// 1. CONTROL: un pedido pagado con monedero deja el cerrojo ENLAZADO.
// 2. Si el enlace se pierde (referencia a NULL: el caso que antes no tenía salida), el barrido de
//    reparación DEVUELVE el importe al comprador.
// 3. La ruta de reparación es SOLO de administración.
const { execSync } = require('node:child_process');

const V1 = process.env.LB_V1 ?? 'http://127.0.0.1:3000/api/v1';
const COMPRADOR = { phone: '+240555000111', password: 'PruebaKyc2026', pin: '246810' };
const VENDEDOR = { phone: '+240555000003' };
const ADMIN = '+240555000999';
const IMPORTE = 1500;
const SALDO_INICIAL = 30000;

let fallos = 0;
const comprobar = (ok, texto) => { console.log(`  ${ok ? 'OK  ' : 'FALLO'} ${texto}`); if (!ok) fallos += 1; };
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };
const q = (sql) => {
  const salida = execSync('docker exec -i mirror-postgres psql -U postgres -d egrouteplan -tA', { input: sql, encoding: 'utf8' }).trim();
  return salida.split('\n').map((l) => l.trim()).filter((l) => l && !/^(INSERT|UPDATE|DELETE|SELECT) \d/.test(l))[0] ?? '';
};
const req = async (method, url, tok, body, extra = {}) => {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}), ...extra },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { s: r.status, b: await j(r) };
};
const entrar = async (phone, password) => {
  const r = await req('POST', V1 + '/mobility/auth/login', null, { phone, password });
  if (!r.b.accessToken) throw new Error('login ' + phone + ': ' + JSON.stringify(r.b).slice(0, 140));
  return r.b.accessToken;
};
const saldo = (phone) => {
  const s = q("SELECT coalesce(w.balance_available,0)||'|'||coalesce(w.balance_escrow,0) FROM wallet.wallets w JOIN mobility.users u ON u.id=w.user_id WHERE u.phone='" + phone + "'");
  const p = s.split('|').map(Number);
  return { available: p[0], escrow: p[1] };
};

(async () => {
  console.log('\n== 0. FIXTURE ==');
  const hash = execSync('node -e \'require("/opt/mirror/app/node_modules/argon2").hash("PruebaKyc2026").then(h=>console.log(h))\'', { encoding: 'utf8' }).trim();
  q("UPDATE mobility.users SET password_hash='" + hash + "' WHERE phone='" + ADMIN + "'");
  const idComprador = q("SELECT id FROM mobility.users WHERE phone='" + COMPRADOR.phone + "'");
  const idVendedor = q("SELECT id FROM mobility.users WHERE phone='" + VENDEDOR.phone + "'");
  const shopId = q("SELECT id FROM lifebook.shops WHERE owner_id='" + idVendedor + "' LIMIT 1");
  const prodId = q("SELECT id FROM lifebook.products WHERE shop_id='" + shopId + "' AND title='Producto E2E Monedero' LIMIT 1");
  if (!prodId) { console.log('  FALLO falta el producto de prueba (ejecuta antes lb97a)'); process.exit(1); }
  q('UPDATE wallet.wallets SET balance_available=' + SALDO_INICIAL + ", balance_escrow=0, version=version+1 WHERE user_id='" + idComprador + "'");
  const tokC = await entrar(COMPRADOR.phone, COMPRADOR.password);
  const tokA = await entrar(ADMIN, 'PruebaKyc2026');
  const rol = JSON.parse(Buffer.from(tokA.split('.')[1], 'base64url').toString()).role;
  comprobar(rol === 'ADMIN', 'la cuenta de administración de prueba trae rol ADMIN (rol=' + rol + ')');

  const comprar = async (sufijo) => {
    const t = await req('POST', V1 + '/auth/payment-token', tokC, { method: 'PIN', pin: COMPRADOR.pin, scope: 'ESCROW_LOCK', amount: IMPORTE });
    return req('POST', V1 + '/lifebook/commerce/orders', tokC,
      { items: [{ productId: prodId, quantity: 1 }], deliveryMode: 'pickup', paymentMethod: 'likebook_wallet' },
      { 'Idempotency-Key': 'lb105a-' + sufijo + '-' + Date.now(), 'X-Payment-Token': t.b?.paymentToken });
  };

  console.log('\n== 1. CONTROL: el cerrojo queda enlazado ==');
  const antes = saldo(COMPRADOR.phone);
  const pedido = await comprar('a');
  const oid = pedido.b?.order?.id;
  comprobar(!!oid, 'pedido creado (' + (oid ? oid.slice(0, 8) + '…' : JSON.stringify(pedido.b).slice(0, 140)) + ')');
  const lockId = q("SELECT id FROM wallet.transactions WHERE type='ESCROW_LOCK' AND reference_activity_id='" + oid + "' LIMIT 1");
  comprobar(!!lockId, 'el cerrojo quedó enlazado al pedido (camino normal)');
  comprobar(saldo(COMPRADOR.phone).escrow === antes.escrow + IMPORTE, 'y el importe está en garantía');

  console.log('\n== 2. EL HUÉRFANO SE REPARA Y EL DINERO VUELVE ==');
  q("UPDATE wallet.transactions SET reference_activity_id = NULL WHERE id='" + lockId + "'");
  comprobar(q("SELECT id FROM wallet.transactions WHERE id='" + lockId + "' AND reference_activity_id IS NOT NULL") === '', 'simulado el enlace perdido (referencia a NULL)');
  const noAdmin = await req('POST', V1 + '/wallet/admin/reconcile-locks?minutos=0', tokC, {});
  comprobar(noAdmin.s === 403 || noAdmin.s === 401, 'un usuario normal NO puede llamar al barrido → HTTP ' + noAdmin.s);
  const barrido = await req('POST', V1 + '/wallet/admin/reconcile-locks?minutos=0', tokA, {});
  console.log('  barrido → HTTP ' + barrido.s + ' ' + JSON.stringify(barrido.b));
  comprobar(barrido.s === 200 && Number(barrido.b?.devueltos ?? 0) >= 1,
    'el barrido devolvió el cerrojo huérfano (los fallos que reporte serán cerrojos viejos de corridas previas, cuyo saldo en garantía ya reinició el fixture)');
  const tras = saldo(COMPRADOR.phone);
  comprobar(tras.escrow === antes.escrow, 'garantía devuelta (' + (antes.escrow + IMPORTE) + ' → ' + tras.escrow + ')');
  comprobar(tras.available === antes.available, 'disponible intacto (' + antes.available + ' → ' + tras.available + ')');

  console.log('\n== 3. EL CAMINO NORMAL SIGUE VIVO ==');
  const p2 = await comprar('b');
  const oid2 = p2.b?.order?.id;
  comprobar(!!oid2 && q("SELECT id FROM wallet.transactions WHERE type='ESCROW_LOCK' AND reference_activity_id='" + oid2 + "' LIMIT 1") !== '',
    'un pedido nuevo vuelve a enlazar su cerrojo sin incidencias');

  console.log('\n' + (fallos === 0 ? 'TODO OK' : 'FALLOS=' + fallos));
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.log('  FALLO inesperado: ' + e.message); process.exit(1); });
