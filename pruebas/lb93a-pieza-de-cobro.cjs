// lb93a-pieza-de-cobro.cjs — ¿está el hueco hecho para enchufar un cobro real? (punto 9 de la §3)
//
// No hay ninguna pasarela conectada (ni se inventa). Lo que se comprueba es que **la pieza** existe y se
// comporta: qué se puede cobrar hoy, que **el importe lo ponga el pedido** (no quien llama), que el
// comprador no pueda cobrar el pedido de otro, que un proveedor inventado no cuele, y que un **aviso de
// pago suelto (webhook) no toque ningún pedido**.
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb93a.cjs
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';

let fallos = 0;
const comprobar = (ok, texto) => { console.log(`  ${ok ? 'OK  ' : 'FALLO'} ${texto}`); if (!ok) fallos++; };

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };
const entrar = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
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
  const B = await entrar('+240555000003', '123456');
  const T = await entrar('+240222000123', 'MiClave123');

  // ── A) Qué se puede cobrar hoy ────────────────────────────────────────────
  console.log('=== A. QUÉ SE PUEDE COBRAR HOY ===');
  const lista = await req('GET', '/lifebook/commerce/money/payment-providers', B);
  comprobar(lista.s === 200, `la lista sale → HTTP ${lista.s}`);
  const manual = (lista.b?.providers ?? []).find((p) => p.id === 'manual');
  comprobar(!!manual, `está el cobro manual: «${manual?.name ?? '(ninguno)'}»`);
  comprobar(manual?.capabilities?.qr === false && manual?.capabilities?.webhook === false,
    `y dice la verdad de lo que puede: qr=${manual?.capabilities?.qr} webhook=${manual?.capabilities?.webhook}`);
  comprobar(/no hay ninguna pasarela conectada/i.test(String(lista.b?.aviso ?? '')),
    `y avisa de que no hay pasarela: «${String(lista.b?.aviso ?? '').slice(0, 70)}…»`);

  // ── B) Abrir un cobro: el importe lo pone el PEDIDO ───────────────────────
  console.log('\n=== B. ABRIR UN COBRO (el importe sale del pedido) ===');
  const creado = await req('POST', '/lifebook/commerce/orders', B,
    { items: [{ productId: PRODUCTO, quantity: 1 }], deliveryMode: 'pickup', deliveryAddress: {}, paymentMethod: 'transfer', note: 'PRUEBA de la pieza de cobro (se cancela)' },
    { 'Idempotency-Key': `lb93a-${Date.now()}` });
  const ped = creado.b?.order;
  const cargo = await req('POST', '/lifebook/commerce/money/charge', B, { orderId: ped.id, provider: 'manual' });
  comprobar(cargo.s === 201 || cargo.s === 200, `el pedido ${ped.code} abre un cobro → HTTP ${cargo.s} ${cargo.b?.error?.code ?? ''}`);
  comprobar(Number(cargo.b?.amountXaf) === Number(ped.totalXaf), `el importe es el del PEDIDO (${cargo.b?.amountXaf} = ${ped.totalXaf}), no el que diga quien llama`);
  comprobar(String(cargo.b?.charge?.providerRef) === `manual:${ped.code}`, `el cobro manual lleva la referencia del pedido: ${cargo.b?.charge?.providerRef}`);
  comprobar(cargo.b?.charge?.status === 'pending' && !cargo.b?.charge?.payUrl, 'queda pendiente y sin enlace de pago (no hay pasarela)');

  // Y el importe no se puede «sugerir» desde fuera.
  const conImporteFalso = await req('POST', '/lifebook/commerce/money/charge', B, { orderId: ped.id, provider: 'manual', amountXaf: 1 });
  comprobar(Number(conImporteFalso.b?.amountXaf) === Number(ped.totalXaf), `mandar un importe distinto (1 XAF) no cambia nada: ${conImporteFalso.b?.amountXaf}`);

  // ── C) Lo que NO puede pasar ──────────────────────────────────────────────
  console.log('\n=== C. LO QUE NO PUEDE PASAR ===');
  const ajeno = await req('POST', '/lifebook/commerce/money/charge', T, { orderId: ped.id, provider: 'manual' });
  comprobar(ajeno.b?.error?.code === 'NOT_ORDER_PARTICIPANT', `la tienda no abre el cobro del pedido del comprador → ${ajeno.b?.error?.code ?? `HTTP ${ajeno.s}`}`);
  const inventado = await req('POST', '/lifebook/commerce/money/charge', B, { orderId: ped.id, provider: 'maviance' });
  comprobar(inventado.b?.error?.code === 'PAYMENT_PROVIDER_UNKNOWN', `un proveedor no conectado (maviance) no cuela → ${inventado.b?.error?.code ?? `HTTP ${inventado.s}`}`);

  const webhookManual = await req('POST', '/lifebook/commerce/payments/webhook/manual', '', { providerRef: `manual:${ped.code}`, status: 'paid' });
  comprobar(webhookManual.b?.error?.code === 'PAYMENT_NO_WEBHOOK', `el cobro manual no tiene webhook → ${webhookManual.b?.error?.code ?? `HTTP ${webhookManual.s}`}`);
  const webhookInventado = await req('POST', '/lifebook/commerce/payments/webhook/inventado', '', { status: 'paid' });
  comprobar(webhookInventado.b?.error?.code === 'PAYMENT_PROVIDER_UNKNOWN', `un webhook de un proveedor que no existe → ${webhookInventado.b?.error?.code ?? `HTTP ${webhookInventado.s}`}`);
  const trasWebhooks = await req('GET', `/lifebook/commerce/orders/${ped.id}`, B);
  comprobar(trasWebhooks.b?.order?.paymentStatus !== 'paid', `y el pedido NO se ha dado por cobrado con ningún aviso suelto: ${trasWebhooks.b?.order?.paymentStatus}`);

  // ── D) Un pedido ya cobrado no abre otro cobro ────────────────────────────
  console.log('\n=== D. UN PEDIDO YA COBRADO ===');
  await req('POST', `/lifebook/commerce/orders/${ped.id}/mark-paid`, T, { note: 'cobrado por fuera' });
  const yaCobrado = await req('POST', '/lifebook/commerce/money/charge', B, { orderId: ped.id, provider: 'manual' });
  comprobar(yaCobrado.b?.error?.code === 'PAYMENT_ALREADY_PAID', `no se abre un cobro de algo ya cobrado → ${yaCobrado.b?.error?.code ?? `HTTP ${yaCobrado.s}`}`);

  await req('PATCH', `/lifebook/commerce/orders/${ped.id}/action`, B, { action: 'cancel' });
  console.log(`\n  pedido ${ped.code} cancelado (devuelve su stock)`);
  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
