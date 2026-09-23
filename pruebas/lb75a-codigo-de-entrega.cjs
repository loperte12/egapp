// lb75a-codigo-de-entrega.cjs — ¿el comprador VE su código de entrega en el detalle del pedido?
//
// Sale del §1.1 de ACCION-INMEDIATA-PARA-EL-OTRO-AGENTE.md: se dijo que el detalle del pedido estaba
// «en blanco». Comprobado: NO lo está (29 textos en el árbol, geometría sana). Lo que faltaba de verdad
// era comprobar la CAJA DEL CÓDIGO, que solo aparece con pago **contra entrega**.
//
// Crea un pedido de prueba con contra entrega **en la cuenta del móvil** (es la única forma de abrir su
// pantalla), deja el id para medirlo, y NO lo cancela: lo cancela el paso siguiente, ya con la medida
// hecha. Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb75a.cjs crear|cancelar <id>
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';
let prepararRed = async () => 'sin-proxy';
if (!process.env.LB_API) {
  try { ({ prepararRed } = require('./red.cjs')); } catch { /* directo */ }
}
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 300) }; } };
const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
  if (!r.accessToken) throw new Error(`sin sesión para ${phone}`);
  return r.accessToken;
};
const req = async (method, path, tok, body, extra = {}) => {
  const r = await fetch(`${API}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { s: r.status, b: await j(r) };
};

const PRODUCTO = '074e141b-f618-47c5-9078-acb74e82d467'; // Camiseta (Hotel Demo Malabo)

(async () => {
  console.log(`red: ${await prepararRed()}`);
  const ADM = await login('+240999888777', '123456');  // la cuenta del móvil
  const modo = process.argv[2] ?? 'crear';

  if (modo === 'cancelar') {
    const id = process.argv[3];
    const c = await req('PATCH', `/lifebook/commerce/orders/${id}/action`, ADM, { action: 'cancel' });
    console.log(`cancelar ${id} → HTTP ${c.s} (${c.b?.order?.status ?? c.b?.error?.message ?? ''})`);
    return;
  }

  const o = await req('POST', '/lifebook/commerce/orders', ADM, {
    items: [{ productId: PRODUCTO, quantity: 1 }],
    deliveryMode: 'pickup',
    deliveryAddress: {},
    paymentMethod: 'cash_on_delivery',
    note: 'PRUEBA del código de entrega (se cancela)',
  }, { 'Idempotency-Key': `lb75a-${Date.now()}` });
  const ped = o.b?.order;
  console.log(`HTTP ${o.s} · pedido ${ped?.code} · id ${ped?.id}`);
  console.log(`  pago: ${ped?.paymentMethod} · código de entrega: ${ped?.deliveryCode}`);
  console.log(`  ABRIR EN EL MÓVIL: egrouteplan://lifebook-order/${ped?.id}`);
  console.log(`  CANCELAR DESPUÉS: node /root/lb75a.cjs cancelar ${ped?.id}`);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
