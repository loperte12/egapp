// sonda-tiempo-compra.cjs — SOLO MIDE: ¿cuánto tarda crear UN pedido?
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/sonda-tiempo.cjs
const API = process.env.LB_API ?? 'http://127.0.0.1:3000/api/v1';
const PRODUCTO = '074e141b-f618-47c5-9078-acb74e82d467';
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };

(async () => {
  const l = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+240555000003', password: '123456' }),
  }));
  const tok = l.accessToken;

  const tiempos = [];
  const ids = [];
  for (let i = 0; i < 3; i++) {
    const t0 = Date.now();
    const r = await j(await fetch(`${API}/lifebook/commerce/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}`, 'Idempotency-Key': `sonda-tiempo-${Date.now()}-${i}` },
      body: JSON.stringify({ items: [{ productId: PRODUCTO, quantity: 1 }], deliveryMode: 'pickup', deliveryAddress: {}, paymentMethod: 'in_store', note: 'SONDA de tiempo (se cancela)' }),
    }));
    const ms = Date.now() - t0;
    tiempos.push(ms);
    if (r?.order?.id) ids.push(r.order.id);
    console.log(`  compra ${i + 1}: ${ms} ms · ${r?.order?.code ?? r?.error?.code ?? 'sin pedido'}`);
  }
  console.log(`\n  de una en una: ${tiempos.join(', ')} ms`);

  // Y ahora 4 a la vez, para ver la cola.
  const t0 = Date.now();
  const varias = await Promise.all(Array.from({ length: 4 }, (_, i) =>
    fetch(`${API}/lifebook/commerce/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}`, 'Idempotency-Key': `sonda-cola-${Date.now()}-${i}` },
      body: JSON.stringify({ items: [{ productId: PRODUCTO, quantity: 1 }], deliveryMode: 'pickup', deliveryAddress: {}, paymentMethod: 'in_store', note: 'SONDA de cola (se cancela)' }),
    }).then(async (r) => ({ s: r.status, b: await j(r) }))));
  console.log(`  4 a la vez: ${Date.now() - t0} ms · ${varias.map((r) => (r.s === 201 ? 'ok' : `HTTP ${r.s} ${r.b?.error?.code ?? ''}`)).join(' · ')}`);

  for (const r of varias) if (r.b?.order?.id) ids.push(r.b.order.id);
  for (const id of ids) {
    await fetch(`${API}/lifebook/commerce/orders/${id}/action`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
      body: JSON.stringify({ action: 'cancel' }),
    });
  }
  console.log(`  (${ids.length} pedidos de la sonda cancelados, stock devuelto)`);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
