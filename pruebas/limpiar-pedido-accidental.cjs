// limpiar-pedido-accidental.cjs — cancela el pedido que crearon los toques automáticos de la prueba.
//
// QUÉ PASÓ: al verificar el asistente de talla en el móvil, un toque automático en la barra inferior
// cayó sobre el botón de comprar del panel y luego otro sobre el de la caja, así que se creó un
// pedido de verdad («LB-260914-0009», Zapatillas 43). Se cancela como lo haría el comprador, para
// devolver el stock.
//
// Se puede lanzar desde el servidor:  LB_API=http://127.0.0.1:3000/api/v1 node /root/limpiar.cjs
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';
let prepararRed = async () => 'sin-proxy';
if (!process.env.LB_API) {
  try { ({ prepararRed } = require('./red.cjs')); } catch { /* sin red.cjs se va directo */ }
}

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 300) }; } };
const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
  if (!r.accessToken) throw new Error(`sin sesión para ${phone}`);
  return r.accessToken;
};
const req = async (method, path, tok, body) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { s: r.status, b: await j(r) };
};

(async () => {
  console.log(`red: ${await prepararRed()}`);
  const ADM = await login('+240999888777', '123456');

  console.log('\n=== MIS PEDIDOS (comprador) ===');
  const mias = await req('GET', '/lifebook/commerce/orders/mine?side=buyer', ADM);
  const pedidos = mias.b?.orders ?? [];
  pedidos.slice(0, 8).forEach((o) => console.log(`  ${o.code} · ${o.status} · ${o.totalXaf} XAF · ${String(o.createdAt).slice(0, 16)}`));

  const abiertos = pedidos.filter((o) => ['pending', 'accepted', 'preparing', 'on_the_way', 'ready', 'created'].includes(String(o.status)));
  console.log(`\nabiertos: ${abiertos.length}`);
  for (const o of abiertos) {
    const c = await req('PATCH', `/lifebook/commerce/orders/${o.id}/action`, ADM, { action: 'cancel' });
    console.log(`  cancelar ${o.code} → HTTP ${c.s} ${c.b?.error?.code ?? c.b?.order?.status ?? ''}`);
  }

  const despues = await req('GET', '/lifebook/commerce/orders/mine?side=buyer', ADM);
  const siguen = (despues.b?.orders ?? []).filter((o) => ['pending', 'accepted', 'preparing', 'on_the_way', 'ready', 'created'].includes(String(o.status)));
  console.log(`\nabiertos después: ${siguen.length}`);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
