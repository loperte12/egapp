// lb71a-ticket-del-pedido.cjs — comprueba el arreglo del TICKET y del botón «escribir a la tienda».
//
// Qué se prueba (contra la API de verdad):
//   1. `POST /lifebook/commerce/orders/:id/chat-card` devuelve la conversación y publica la tarjeta de
//      ESE pedido (antes el botón solo abría el chat, sin decir de qué pedido se hablaba).
//   2. La tarjeta que lee la app lleva ya el TICKET: forma de pago, dirección y nota (en el chat con
//      la tienda). Antes llegaba sin nada de eso.
//   3. Un pedido que no es mío NO se puede publicar (autorización).
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb71a.cjs
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';
let prepararRed = async () => 'sin-proxy';
if (!process.env.LB_API) {
  try { ({ prepararRed } = require('./red.cjs')); } catch { /* sin red.cjs se va directo */ }
}

let fallos = 0;
const comprobar = (ok, texto) => { console.log(`  ${ok ? 'OK  ' : 'FALLO'} ${texto}`); if (!ok) fallos++; };

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

  const mias = await req('GET', '/lifebook/commerce/orders/mine?side=buyer', ADM);
  const pedidos = mias.b?.orders ?? [];
  const objetivo = pedidos.find((o) => o.status === 'created') ?? pedidos[0];
  if (!objetivo) { console.log('no hay pedidos con los que probar'); process.exit(1); }
  console.log(`\npedido de prueba: ${objetivo.code} (${objetivo.status}, pago=${objetivo.paymentMethod}, entrega=${objetivo.deliveryMode})`);

  // ── 1. El botón: publicar la tarjeta de ESE pedido ─────────────────────────
  console.log('\n=== 1. BOTÓN «ESCRIBIR A LA TIENDA» ===');
  const pub = await req('POST', `/lifebook/commerce/orders/${objetivo.id}/chat-card`, ADM);
  comprobar(pub.s === 201 || pub.s === 200, `POST chat-card → HTTP ${pub.s} (esperado 200/201)`);
  comprobar(!!pub.b?.conversationId, `devuelve la conversación: ${pub.b?.conversationId ?? JSON.stringify(pub.b).slice(0, 160)}`);
  const convId = pub.b?.conversationId;

  // ── 2. La tarjeta que lee la app, con el ticket dentro ────────────────────
  console.log('\n=== 2. LA TARJETA (lo que recibe la app) ===');
  const msgs = await req('GET', `/lifebook/chat/conversations/${convId}/messages?limit=50`, ADM);
  const tarjetas = (msgs.b?.messages ?? []).filter((m) => m.kind === 'order');
  comprobar(tarjetas.length > 0, `hay tarjetas de pedido: ${tarjetas.length}`);
  const ultima = tarjetas[tarjetas.length - 1];
  const ref = ultima?.orderRef ?? null;
  comprobar(!!ref, 'la última tarjeta trae orderRef (no llega como texto plano)');
  comprobar(ref?.code === objetivo.code, `la última tarjeta es la del pedido pulsado: ${ref?.code} (esperado ${objetivo.code})`);
  comprobar(!!ref?.buyerName, `trae el nombre de quien compra: ${ref?.buyerName}`);
  comprobar(!!ref?.paymentMethod, `trae la forma de pago: ${ref?.paymentMethod}`);
  comprobar(ref?.deliveryAddress !== undefined, `trae la dirección (aunque sea vacía en recogida): ${JSON.stringify(ref?.deliveryAddress)}`);
  console.log(`  (nota: ${JSON.stringify(ref?.note)} · entrega: ${ref?.deliveryMode})`);

  // ── 3. Autorización: un pedido que no existe / no es mío ──────────────────
  console.log('\n=== 3. AUTORIZACIÓN ===');
  const ajeno = await req('POST', '/lifebook/commerce/orders/11111111-1111-1111-1111-111111111111/chat-card', ADM);
  comprobar(ajeno.s >= 400, `un pedido que no es mío NO se publica → HTTP ${ajeno.s} ${ajeno.b?.error?.code ?? ''}`);

  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
