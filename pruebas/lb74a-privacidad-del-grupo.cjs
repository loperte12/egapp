// lb74a-privacidad-del-grupo.cjs — la última comprobación que faltaba de la tanda P.
//
// Cuando la compra nace en un GRUPO, el servidor publica una tarjeta «social» («✅ Fulano compró …»).
// Esa tarjeta **no puede** llevar la dirección del comprador (ni su nota ni su forma de pago): la
// dirección de casa de nadie es asunto de un grupo. El servidor las pone en `null` cuando
// `social: true`; esto lo comprueba de verdad, no leyendo el código.
//
// Crea un grupo de prueba (con nombre que dice que se puede borrar), hace el pedido dentro y lo cancela.
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb74a.cjs
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';
let prepararRed = async () => 'sin-proxy';
if (!process.env.LB_API) {
  try { ({ prepararRed } = require('./red.cjs')); } catch { /* directo */ }
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
const req = async (method, path, tok, body, extra = {}) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { s: r.status, b: await j(r) };
};

const PRODUCTO = '074e141b-f618-47c5-9078-acb74e82d467';
const SOCIO = 'ec7d4cb7-22d8-4a84-8337-89af276eb55f'; // la tienda (cuenta de pruebas, no el móvil del dueño)

(async () => {
  console.log(`red: ${await prepararRed()}`);
  const B = await login('+240555000003', '123456');

  console.log('\n=== 1. GRUPO DE PRUEBA ===');
  const grupo = await req('POST', '/lifebook/groups', B, {
    title: 'Prueba ticket con dirección (se puede borrar)',
    memberIds: [SOCIO],
  });
  const gid = grupo.b?.group?.id ?? grupo.b?.id;
  comprobar(!!gid, `grupo creado: ${gid} (HTTP ${grupo.s}) ${grupo.b?.error?.message ?? ''}`);
  if (!gid) { console.log('sin grupo: no se puede seguir'); process.exit(1); }

  console.log('\n=== 2. PEDIDO CON REPARTO NACIDO EN EL GRUPO ===');
  const orden = await req('POST', '/lifebook/commerce/orders', B, {
    items: [{ productId: PRODUCTO, quantity: 1 }],
    deliveryMode: 'taxi_moto',
    deliveryAddress: { city: 'Malabo', zone: 'Ela Nguema', reference: 'portón azul, junto al mercado' },
    paymentMethod: 'transfer',
    note: 'llamar al llegar, vivo en el tercero',
    conversationId: gid,
  }, { 'Idempotency-Key': `lb74a-${Date.now()}` });
  comprobar(orden.s === 201 || orden.s === 200, `POST orders → HTTP ${orden.s} ${orden.b?.error?.message ?? ''}`);
  const o = orden.b?.order;
  console.log(`  pedido ${o?.code} · ${o?.deliveryMode} · dirección guardada: ${JSON.stringify(o?.deliveryAddress)}`);

  console.log('\n=== 3. LA TARJETA DEL GRUPO: SIN DATOS PRIVADOS ===');
  const msgs = (await req('GET', `/lifebook/chat/conversations/${gid}/messages?limit=50`, B)).b?.messages ?? [];
  const tarjeta = [...msgs].reverse().find((m) => m.kind === 'order' && m.orderRef?.code === o?.code);
  comprobar(!!tarjeta, `la tarjeta social llega al grupo: "${tarjeta?.body ?? ''}"`);
  if (tarjeta) {
    const r = tarjeta.orderRef;
    console.log('  orderRef de la tarjeta del grupo: ' + JSON.stringify(r));
    comprobar(r.social === true, `va marcada como social: ${r.social}`);
    comprobar(r.deliveryAddress === null || r.deliveryAddress === undefined,
      `NO lleva la dirección: ${JSON.stringify(r.deliveryAddress)}`);
    comprobar(r.note === null || r.note === undefined, `NO lleva la nota: ${JSON.stringify(r.note)}`);
    comprobar(r.paymentMethod === null || r.paymentMethod === undefined,
      `NO lleva la forma de pago: ${JSON.stringify(r.paymentMethod)}`);
    comprobar(r.buyerName === 'BERNARDO LOPERTE', `sí dice quién compró (eso es el aviso social): ${r.buyerName}`);
  }

  console.log('\n=== 4. Y EN EL CHAT CON LA TIENDA SÍ VA TODO ===');
  const conv = await req('POST', '/lifebook/chat/open', B, { userId: SOCIO });
  const suyos = (await req('GET', `/lifebook/chat/conversations/${conv.b?.id}/messages?limit=50`, B)).b?.messages ?? [];
  const enTienda = [...suyos].reverse().find((m) => m.kind === 'order' && m.orderRef?.code === o?.code);
  comprobar(!!enTienda, 'la tarjeta también está en el chat con la tienda');
  if (enTienda) {
    const r = enTienda.orderRef;
    comprobar(r.deliveryAddress?.zone === 'Ela Nguema', `allí SÍ va la dirección: ${JSON.stringify(r.deliveryAddress)}`);
    comprobar(r.paymentMethod === 'transfer', `y la forma de pago: ${r.paymentMethod}`);
    comprobar(!!r.note, `y la nota: ${JSON.stringify(r.note)}`);
  }

  console.log('\n=== 5. LIMPIEZA ===');
  const c = await req('PATCH', `/lifebook/commerce/orders/${o?.id}/action`, B, { action: 'cancel' });
  comprobar(c.s === 200 || c.s === 201, `pedido cancelado → HTTP ${c.s} (${c.b?.order?.status ?? ''})`);

  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
