// lb72a-cupon-en-la-caja.cjs — el cupón, de punta a punta, contra la API de verdad.
//
// Qué comprueba (tanda Q):
//   1. La tienda tiene un cupón ACTIVO para su tienda (si está pausado, se activa como lo haría ella).
//   2. La persona lo RECOGE por su código y el cupón dice de qué tienda es (`shopId`).
//   3. Al crear el pedido con `couponCode`, el SERVIDOR calcula el descuento: `discountXaf` y
//      `total = subtotal + envío − descuento`.
//   4. El cupón no se puede gastar dos veces (límite por persona).
//   5. Al CANCELAR el pedido, el cupón VUELVE (como vuelve el stock).
//
// Deja los datos como estaban: el pedido de prueba queda cancelado y el cupón devuelto.
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb72a.cjs
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
  if (!r.accessToken) throw new Error(`sin sesión para ${phone}: ${JSON.stringify(r).slice(0, 160)}`);
  return r.accessToken;
};
const req = async (method, path, tok, body, extraHeaders = {}) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { s: r.status, b: await j(r) };
};

const PRODUCTO = '074e141b-f618-47c5-9078-acb74e82d467'; // «Camiseta de prueba (tallas y colores)»

(async () => {
  console.log(`red: ${await prepararRed()}`);
  // El comprador de pruebas (BERNARDO) y no la cuenta del móvil: la prueba crea un pedido de verdad
  // y no tiene por qué quedar en «Mis pedidos» de la cuenta del dueño.
  const COMPRADOR = await login('+240555000003', '123456');

  // ── 1. Un cupón activo de la tienda de ese producto ────────────────────────
  console.log('\n=== 1. EL CUPÓN DE LA TIENDA ===');
  const prod = await req('GET', `/lifebook/commerce/products/${PRODUCTO}`, COMPRADOR);
  const shopId = prod.b?.product?.shop?.id;
  const precio = Number(prod.b?.product?.priceXaf ?? 0);
  comprobar(!!shopId, `producto ${PRODUCTO} → tienda ${shopId} · precio ${precio} XAF`);
  if (!shopId) { console.log('sin tienda: no se puede seguir'); process.exit(1); }

  const TIENDA = await login('+240222000123', 'MiClave123');
  const suyos = await req('GET', '/lifebook/commerce/merchant/coupons', TIENDA);
  const cuponesTienda = suyos.b?.items ?? [];
  let cupon = cuponesTienda.find((c) => c.status === 'active') ?? cuponesTienda[0];
  if (!cupon) { console.log('la tienda no tiene ningún cupón: no hay nada que probar'); process.exit(1); }
  if (cupon.status !== 'active') {
    const on = await req('PATCH', `/lifebook/commerce/merchant/coupons/${cupon.id}`, TIENDA, { status: 'active' });
    cupon = on.b?.coupon ?? cupon;
    console.log(`  (el cupón ${cupon.code} estaba pausado: se ha activado para la prueba)`);
  }
  console.log(`  cupón: ${cupon.code} · ${cupon.title} · ${cupon.kind} ${cupon.value} · mín ${cupon.minSubtotalXaf} XAF · estado ${cupon.status}`);

  // ── 2. Recogerlo ───────────────────────────────────────────────────────────
  console.log('\n=== 2. RECOGER EL CUPÓN ===');
  const rec = await req('POST', '/lifebook/commerce/coupons/claim', COMPRADOR, { code: cupon.code });
  comprobar(rec.s === 201 || rec.s === 200, `POST coupons/claim → HTTP ${rec.s} ${rec.b?.error?.message ?? ''}`);
  comprobar(rec.b?.coupon?.shopId === shopId, `el cupón dice su tienda (shopId): ${rec.b?.coupon?.shopId}`);

  const mios = await req('GET', '/lifebook/commerce/my/coupons', COMPRADOR);
  const mio = (mios.b?.items ?? []).find((c) => c.code === cupon.code);
  comprobar(!!mio, `sale en mis cupones: ${mio ? `${mio.code} · usable=${mio.usable}` : 'NO'}`);
  comprobar(mio?.shopId === shopId, `y con la tienda de este producto: ${mio?.shopId}`);

  // ── 3. El pedido CON cupón ────────────────────────────────────────────────
  console.log('\n=== 3. PEDIR CON EL CUPÓN ===');
  const esperadoDesc = cupon.kind === 'percent'
    ? Math.floor((precio * Number(cupon.value)) / 100)
    : Math.min(Number(cupon.value), precio);
  const crear = async (code) => req('POST', '/lifebook/commerce/orders', COMPRADOR, {
    items: [{ productId: PRODUCTO, quantity: 1 }],
    deliveryMode: 'pickup',
    deliveryAddress: {},
    paymentMethod: 'in_store',
    ...(code ? { couponCode: code } : {}),
  }, { 'Idempotency-Key': `lb72a-${Date.now()}-${code ?? 'sin'}` });

  const conCupon = await crear(cupon.code);
  comprobar(conCupon.s === 201 || conCupon.s === 200, `POST orders con cupón → HTTP ${conCupon.s} ${conCupon.b?.error?.message ?? ''}`);
  const o = conCupon.b?.order;
  comprobar(Number(o?.discountXaf) === esperadoDesc, `descuento aplicado: ${o?.discountXaf} (esperado ${esperadoDesc})`);
  comprobar(Number(o?.totalXaf) === Number(o?.subtotalXaf) + Number(o?.deliveryCostXaf) - Number(o?.discountXaf),
    `total = subtotal + envío − descuento → ${o?.subtotalXaf} + ${o?.deliveryCostXaf} − ${o?.discountXaf} = ${o?.totalXaf}`);
  comprobar(o?.couponCode === cupon.code, `el pedido guarda el código del cupón: ${o?.couponCode}`);
  console.log(`  pedido ${o?.code} · ${o?.status} · total ${o?.totalXaf} XAF`);

  // ── 4. El mismo cupón no vale dos veces ───────────────────────────────────
  console.log('\n=== 4. NO SE GASTA DOS VECES ===');
  const repetido = await crear(cupon.code);
  comprobar(repetido.s >= 400, `repetir el cupón se corta → HTTP ${repetido.s} ${repetido.b?.error?.code ?? ''} ${repetido.b?.error?.message ?? ''}`);

  // ── 5. Cancelar devuelve el cupón ─────────────────────────────────────────
  console.log('\n=== 5. CANCELAR DEVUELVE EL CUPÓN ===');
  const cancel = await req('PATCH', `/lifebook/commerce/orders/${o.id}/action`, COMPRADOR, { action: 'cancel' });
  comprobar(cancel.s === 200 || cancel.s === 201, `cancelar → HTTP ${cancel.s} (${cancel.b?.order?.status ?? ''})`);
  const despues = await req('GET', '/lifebook/commerce/my/coupons', COMPRADOR);
  const mioDespues = (despues.b?.items ?? []).find((c) => c.code === cupon.code);
  comprobar(mioDespues?.usable === true, `el cupón vuelve a estar usable: ${mioDespues?.usable} (${mioDespues?.reason ?? 'sin motivo'})`);
  comprobar(Number(mioDespues?.myUses ?? -1) === 0, `mis usos del cupón vuelven a 0: ${mioDespues?.myUses}`);

  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
