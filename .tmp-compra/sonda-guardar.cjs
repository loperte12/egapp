const API = process.env.LB_API ?? 'http://127.0.0.1:3000/api/v1';
const P = '074e141b-f618-47c5-9078-acb74e82d467';
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };
(async () => {
  const l = await j(await fetch(`${API}/mobility/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '+240999888777', password: '123456' }) }));
  const tok = l.accessToken;
  const s = await j(await fetch(`${API}/lifebook/commerce/products/${P}/save`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` } }));
  console.log('guardar →', JSON.stringify(s));
  const m = await j(await fetch(`${API}/lifebook/commerce/my/saved`, { headers: { Authorization: `Bearer ${tok}` } }));
  console.log('guardados ahora:', (m.items ?? []).length, (m.items ?? []).map((x) => x.title).join(' | '));
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
