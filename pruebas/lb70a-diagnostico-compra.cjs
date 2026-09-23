// lb70a-diagnostico-compra.cjs — DIAGNÓSTICO (no arregla nada) del bug de compra que reportó el dueño.
//
// Responde a las tres preguntas del documento PENDIENTE-COMPRA-PAGO-Y-TICKET.md tal y como las ve la
// APP (no la base): qué llega al abrir el chat del pedido con la MISMA llamada que hace el botón
// «escribir a la tienda», y qué formas de pago/entrega ofrece de verdad el comercio.
//
// Uso:  node pruebas/lb70a-diagnostico-compra.cjs
//       (si la red del equipo falla, desde el servidor:
//        LB_API=http://127.0.0.1:3000/api/v1 node /root/lb70a.cjs)
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

  // ── 1. Lo que la app guarda de mis pedidos ─────────────────────────────────
  console.log('\n=== MIS PEDIDOS (comprador) ===');
  const mias = await req('GET', '/lifebook/commerce/orders/mine?side=buyer', ADM);
  const pedidos = mias.b?.orders ?? [];
  pedidos.slice(0, 6).forEach((o) => console.log(`  ${o.code} · ${o.status} · pago=${o.paymentMethod} · entrega=${o.deliveryMode} · ${o.totalXaf} XAF`));

  const primero = pedidos[0];
  if (!primero) { console.log('no hay pedidos: nada que diagnosticar'); return; }

  const det = await req('GET', `/lifebook/commerce/orders/${primero.id}`, ADM);
  const o = det.b?.order;
  console.log(`\n=== DETALLE DE ${primero.code} ===`);
  console.log(`  rol: ${o?.role} · pago: ${o?.paymentMethod} · estado de pago: ${o?.paymentStatus}`);
  console.log(`  entrega: ${o?.deliveryMode} · dirección: ${JSON.stringify(o?.deliveryAddress)}`);
  console.log(`  tienda: ${o?.shop?.name} (${o?.shop?.id}) · dueño: ${o?.shop?.ownerId}`);

  // ── 2. «Escribir a la tienda»: LA MISMA llamada que hace el botón ──────────
  console.log('\n=== BOTÓN «ESCRIBIR A LA TIENDA» (lo que hace hablar()) ===');
  const conv = await req('POST', '/lifebook/chat/open', ADM, { userId: o?.shop?.ownerId });
  console.log(`  POST /lifebook/chat/open → HTTP ${conv.s} · conversación ${conv.b?.id} · con ${conv.b?.peer?.name ?? '?'}`);
  const convId = conv.b?.id;
  if (!convId) { console.log(`  ⚠ sin conversación: ${JSON.stringify(conv.b).slice(0, 200)}`); return; }

  const msgs = await req('GET', `/lifebook/chat/conversations/${convId}/messages?limit=50`, ADM);
  const lista = msgs.b?.messages ?? [];
  const tipos = [...new Set(lista.map((m) => m.kind))];
  console.log(`  GET mensajes → HTTP ${msgs.s} · ${lista.length} mensajes · tipos: ${tipos.join(', ') || '(ninguno)'}`);

  const tarjetas = lista.filter((m) => m.kind === 'order');
  console.log(`  TARJETAS DE PEDIDO que recibe la app: ${tarjetas.length}`);
  for (const t of tarjetas.slice(-3)) {
    console.log(`   · body="${t.body}"`);
    console.log(`     orderRef: ${t.orderRef ? JSON.stringify(t.orderRef) : '❌ NO VIENE (llegaría como texto plano)'}`);
  }

  // ── 3. Formas de pago y entrega que ofrece el comercio ────────────────────
  console.log('\n=== LO QUE OFRECE LA TIENDA ===');
  const carrito = await req('GET', '/lifebook/commerce/my/cart', ADM);
  for (const g of (carrito.b?.groups ?? [])) {
    console.log(`  tienda ${g.shop?.name}: pagos=${JSON.stringify(g.paymentMethods)} · entregas=${JSON.stringify(g.deliveryModes)}`);
  }
  const productoId = o?.items?.[0]?.productId;
  if (productoId) {
    const p = await req('GET', `/lifebook/commerce/products/${productoId}`, ADM);
    const pm = p.b?.product?.paymentMethods ?? [];
    console.log(`  producto ${productoId}: pagos=${JSON.stringify(pm)}`);
    console.log(`  (el PRIMERO de esa lista es el que la caja marca sola: ${pm.find((m) => m.status === 'active')?.method ?? 'ninguno'})`);
  }
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
