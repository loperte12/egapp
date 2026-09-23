// lb73a-ticket-con-direccion.cjs — cierra los dos cabos sueltos de la tanda P.
//
// 1. TICKET CON REPARTO: un pedido con `taxi_moto` + dirección. La tarjeta del chat comprador↔tienda
//    tiene que llevar la DIRECCIÓN, la forma de pago, el nombre y el descuento del cupón. (Con pedidos
//    de recogida la dirección va vacía, así que ese camino no se había visto nunca.)
// 2. PRIVACIDAD EN GRUPOS: si la compra nace en un GRUPO, la tarjeta del grupo **no** puede llevar la
//    dirección ni la nota del comprador (el servidor las pone en `null` cuando `social: true`).
//
// Deja los datos como estaban: los pedidos de prueba se cancelan (stock restaurado y cupón devuelto).
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb73a.cjs
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

const PRODUCTO = '074e141b-f618-47c5-9078-acb74e82d467'; // Camiseta de prueba (Hotel Demo Malabo)
const CUPON = 'PRUEBA135085';

(async () => {
  console.log(`red: ${await prepararRed()}`);
  const B = await login('+240555000003', '123456');          // comprador de pruebas
  const TIENDA = await login('+240222000123', 'MiClave123'); // dueño de la tienda

  const prod = await req('GET', `/lifebook/commerce/products/${PRODUCTO}`, B);
  const precio = Number(prod.b?.product?.priceXaf ?? 0);
  const dueno = prod.b?.product?.shop?.ownerId;
  console.log(`producto ${PRODUCTO} · ${precio} XAF · tienda de ${dueno}`);

  // Recoger el cupón (si ya lo tenía, el servidor lo dice y no pasa nada).
  await req('POST', '/lifebook/commerce/coupons/claim', B, { code: CUPON });

  const crear = (cuerpo) => req('POST', '/lifebook/commerce/orders', B, cuerpo,
    { 'Idempotency-Key': `lb73a-${Date.now()}-${Math.random().toString(16).slice(2, 8)}` });

  // ── 1. Pedido de REPARTO con cupón y contra entrega ────────────────────────
  console.log('\n=== 1. PEDIDO DE REPARTO (taxi_moto + dirección + cupón) ===');
  const conReparto = await crear({
    items: [{ productId: PRODUCTO, quantity: 1 }],
    deliveryMode: 'taxi_moto',
    deliveryAddress: { city: 'Malabo', zone: 'Ela Nguema', reference: 'portón azul, junto al mercado' },
    paymentMethod: 'cash_on_delivery',
    note: 'llamar al llegar',
    couponCode: CUPON,
  });
  comprobar(conReparto.s === 201 || conReparto.s === 200, `POST orders → HTTP ${conReparto.s} ${conReparto.b?.error?.message ?? ''}`);
  const o = conReparto.b?.order;
  console.log(`  pedido ${o?.code} · entrega ${o?.deliveryMode} · envío ${o?.deliveryCostXaf} · descuento ${o?.discountXaf} · total ${o?.totalXaf}`);
  comprobar(Number(o?.deliveryCostXaf) === 1500, `el envío es el fijo de la tienda (1.500 XAF): ${o?.deliveryCostXaf}`);
  comprobar(Number(o?.totalXaf) === Number(o?.subtotalXaf) + 1500 - Number(o?.discountXaf),
    `total = subtotal + envío − cupón → ${o?.subtotalXaf} + 1500 − ${o?.discountXaf} = ${o?.totalXaf}`);
  comprobar(!!o?.deliveryCode, `con contra entrega sale código de entrega: ${o?.deliveryCode}`);

  // La tarjeta que ve la TIENDA (mismo mensaje para comprador y tienda).
  console.log('\n=== 2. LA TARJETA DEL CHAT CON LA TIENDA (lo que yo cambié) ===');
  const conv = await req('POST', '/lifebook/chat/open', B, { userId: dueno });
  const convId = conv.b?.id;
  const msgs = await req('GET', `/lifebook/chat/conversations/${convId}/messages?limit=50`, B);
  const tarjetas = (msgs.b?.messages ?? []).filter((m) => m.kind === 'order');
  const suya = tarjetas.reverse().find((m) => m.orderRef?.code === o?.code);
  comprobar(!!suya, `la tarjeta de ${o?.code} está en el chat de la tienda`);
  const ref = suya?.orderRef ?? {};
  comprobar(ref.deliveryMode === 'taxi_moto', `dice la forma de entrega: ${ref.deliveryMode}`);
  comprobar(ref.deliveryAddress?.zone === 'Ela Nguema' && ref.deliveryAddress?.city === 'Malabo',
    `LLEVÁ LA DIRECCIÓN: ${JSON.stringify(ref.deliveryAddress)}`);
  comprobar(ref.paymentMethod === 'cash_on_delivery', `dice cómo se paga: ${ref.paymentMethod}`);
  comprobar(!!ref.buyerName, `dice quién compra: ${ref.buyerName}`);
  comprobar(Number(ref.discountXaf) === Number(o?.discountXaf) && Number(ref.discountXaf) > 0,
    `dice el descuento del cupón: ${ref.discountXaf}`);

  // ── 3. La misma compra nacida en un GRUPO: sin dirección ───────────────────
  console.log('\n=== 3. PRIVACIDAD: tarjeta de GRUPO sin dirección ===');
  const convs = await req('GET', '/lifebook/chat/conversations', B);
  const grupo = (convs.b?.conversations ?? []).find((c) => c.kind === 'group');
  if (!grupo) {
    console.log('  (no hay ningún grupo de B: comprobación omitida)');
  } else {
    console.log(`  grupo de prueba: «${grupo.title}»`);
    const enGrupo = await crear({
      items: [{ productId: PRODUCTO, quantity: 1 }],
      deliveryMode: 'taxi_moto',
      deliveryAddress: { city: 'Malabo', zone: 'Ela Nguema', reference: 'portón azul' },
      paymentMethod: 'in_store',
      conversationId: grupo.id,
    });
    comprobar(enGrupo.s === 201 || enGrupo.s === 200, `POST orders en grupo → HTTP ${enGrupo.s} ${enGrupo.b?.error?.message ?? ''}`);
    const g = (await req('GET', `/lifebook/chat/conversations/${grupo.id}/messages?limit=50`, B)).b?.messages ?? [];
    const tarjetaGrupo = [...g].reverse().find((m) => m.kind === 'order' && m.orderRef?.code === enGrupo.b?.order?.code);
    comprobar(!!tarjetaGrupo, `la tarjeta llega al grupo (${enGrupo.b?.order?.code})`);
    if (tarjetaGrupo) {
      const rg = tarjetaGrupo.orderRef;
      comprobar(rg.social === true, `va marcada como social: ${rg.social}`);
      comprobar(rg.deliveryAddress === null || rg.deliveryAddress === undefined,
        `NO lleva la dirección del comprador: ${JSON.stringify(rg.deliveryAddress)}`);
      comprobar(rg.note === null || rg.note === undefined, `NO lleva la nota: ${JSON.stringify(rg.note)}`);
      comprobar(rg.paymentMethod === null || rg.paymentMethod === undefined, `NO lleva la forma de pago: ${JSON.stringify(rg.paymentMethod)}`);
      comprobar(rg.buyerName === 'BERNARDO LOPERTE', `sí dice quién compró (eso es el aviso social): ${rg.buyerName}`);
    }
    // Cancelar el del grupo también (devuelve el stock).
    const c2 = await req('PATCH', `/lifebook/commerce/orders/${enGrupo.b?.order?.id}/action`, B, { action: 'cancel' });
    console.log(`  (pedido del grupo cancelado: HTTP ${c2.s})`);
  }

  // ── 4. Limpieza: cancelar el de reparto ───────────────────────────────────
  console.log('\n=== 4. LIMPIEZA ===');
  const c1 = await req('PATCH', `/lifebook/commerce/orders/${o?.id}/action`, B, { action: 'cancel' });
  comprobar(c1.s === 200 || c1.s === 201, `cancelado ${o?.code} → HTTP ${c1.s} (${c1.b?.order?.status ?? ''})`);
  const mios = await req('GET', '/lifebook/commerce/my/coupons', B);
  const mio = (mios.b?.items ?? []).find((c) => c.code === CUPON);
  comprobar(mio?.usable === true, `el cupón vuelve a estar usable: ${mio?.usable} (${mio?.reason ?? 'sin motivo'})`);

  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
