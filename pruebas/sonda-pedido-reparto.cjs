// sonda-pedido-reparto.cjs — crea un pedido CON REPARTO para medir la caja del reparto en pantalla.
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/sonda-reparto.cjs
const API = process.env.LB_API ?? 'http://127.0.0.1:3000/api/v1';
const PRODUCTO = '074e141b-f618-47c5-9078-acb74e82d467';
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };

(async () => {
  const l = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+240555000003', password: '123456' }),
  }));
  const tok = l.accessToken;
  const r = await j(await fetch(`${API}/lifebook/commerce/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}`, 'Idempotency-Key': `sonda-reparto-${Date.now()}` },
    body: JSON.stringify({
      items: [{ productId: PRODUCTO, quantity: 1 }],
      deliveryMode: 'taxi_moto',
      deliveryAddress: { city: 'Malabo', zone: 'Paraíso', reference: 'Portal azul' },
      paymentMethod: 'transfer',
      note: 'SONDA de la caja del reparto (se cancela después)',
    }),
  }));
  const o = r?.order;
  console.log(`HTTP ${r?.code ? '' : ''}pedido ${o?.code} · id ${o?.id}`);
  console.log(`  reparto ${o?.deliveryCostXaf} XAF · total ${o?.totalXaf} XAF · estado ${o?.status} · pago ${o?.paymentStatus}`);
  console.log(`  ABRIR: egrouteplan://lifebook-order/${o?.id}`);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
