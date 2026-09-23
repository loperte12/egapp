// sonda-concurrencia.cjs — ¿la pelea es por el MISMO producto? (solo mide, y cancela lo que crea)
//
// 8 compras a la vez del mismo producto fallan (7 con HTTP 500 por tiempo de transacción). Esto repite
// el experimento con 8 productos DISTINTOS: si todas salen, el cuello es la fila del producto; si no,
// el problema es de otro sitio.
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/sonda-concurrencia.cjs
const API = process.env.LB_API ?? 'http://127.0.0.1:3000/api/v1';
const TIENDA = 'd8a2ece3-92b4-4959-8412-d26b5d698ade';
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };

(async () => {
  const l = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '+240555000003', password: '123456' }),
  }));
  const tok = l.accessToken;
  const cab = { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` };

  // Ocho productos distintos de la tienda (los que tengan stock exacto y precio).
  const cat = await j(await fetch(`${API}/lifebook/commerce/catalog?shopId=${TIENDA}&limit=30`, { headers: cab }));
  const items = (cat.items ?? []).filter((p) => p.id).slice(0, 8);
  console.log(`productos distintos para la prueba: ${items.length}`);
  if (items.length < 8) { console.log('  (no hay 8 productos: la prueba no sirve)'); process.exit(1); }

  const sello = Date.now();
  const t0 = Date.now();
  const respuestas = await Promise.all(items.map((p, i) =>
    fetch(`${API}/lifebook/commerce/orders`, {
      method: 'POST', headers: { ...cab, 'Idempotency-Key': `sonda-conc-${sello}-${i}` },
      body: JSON.stringify({ items: [{ productId: p.id, quantity: 1 }], deliveryMode: 'pickup', deliveryAddress: {}, paymentMethod: 'in_store', note: 'SONDA de concurrencia (se cancela)' }),
    }).then(async (r) => ({ s: r.status, b: await j(r) }))));

  const ok = respuestas.filter((r) => r.s === 201 || r.s === 200);
  console.log(`8 productos DISTINTOS a la vez → ${ok.length} de 8 en ${Date.now() - t0} ms`);
  console.log(`  números: ${ok.map((r) => r.b?.order?.code).join(' ')}`);
  const mal = respuestas.filter((r) => !(r.s === 201 || r.s === 200));
  if (mal.length) console.log(`  fallos: ${mal.map((r) => `HTTP ${r.s} ${r.b?.error?.code ?? ''}`).join(' · ')}`);

  // Se cancelan todos (devuelven el stock).
  let cancelados = 0;
  for (const r of ok) {
    const c = await fetch(`${API}/lifebook/commerce/orders/${r.b.order.id}/action`, {
      method: 'PATCH', headers: cab, body: JSON.stringify({ action: 'cancel' }),
    });
    if (c.status === 200) cancelados++;
  }
  console.log(`  cancelados: ${cancelados}`);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
