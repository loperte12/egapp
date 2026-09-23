// lb86a-valorar-en-pantalla.cjs — deja un pedido ENTREGADO en la cuenta del móvil para ver (y tocar) la
// pantalla de valoración creada en la TANDA T (T.7).
//
// La cuenta del móvil es la del dueño (comprador). El pedido se entrega desde la API con la sesión de la
// tienda (el móvil no puede hacer de tienda), y así el comprador ve la caja de las estrellas.
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb86a.cjs crear|entregar <id>
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';
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

const PRODUCTO = '074e141b-f618-47c5-9078-acb74e82d467';

(async () => {
  const ADM = await login('+240999888777', '123456');   // la cuenta del móvil
  const TIENDA = await login('+240222000123', 'MiClave123');
  const modo = String(process.argv[2] ?? 'crear').toLowerCase();
  const id = process.argv[3];

  if (modo === 'entregar') {
    for (const accion of ['accept', 'prepare', 'ready', 'deliver']) {
      const r = await req('PATCH', `/lifebook/commerce/orders/${id}/action`, TIENDA, { action: accion });
      console.log(`  ${accion} → HTTP ${r.s} ${r.b?.order?.status ?? r.b?.error?.code ?? ''}`);
    }
    const d = await req('GET', `/lifebook/commerce/orders/${id}`, ADM);
    console.log(`entregado: status=${d.b?.order?.status} · pago=${d.b?.order?.paymentStatus} · valoración=${d.b?.order?.review ? 'ya la tiene' : 'ninguna'}`);
    return;
  }

  const o = await req('POST', '/lifebook/commerce/orders', ADM, {
    items: [{ productId: PRODUCTO, quantity: 1 }],
    deliveryMode: 'pickup', deliveryAddress: {}, paymentMethod: 'in_store',
    note: 'PRUEBA de la valoración (se entrega para poder valorar)',
  }, { 'Idempotency-Key': `lb86a-${Date.now()}` });
  const ped = o.b?.order;
  console.log(`HTTP ${o.s} · pedido ${ped?.code} · id ${ped?.id}`);
  console.log(`  ABRIR:    egrouteplan://lifebook-order/${ped?.id}`);
  console.log(`  ENTREGAR: node /root/lb86a.cjs entregar ${ped?.id}`);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
