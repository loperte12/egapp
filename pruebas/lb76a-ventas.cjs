// lb76a-ventas.cjs — ¿se suman las ventas al ENTREGAR? (punto 2 de la ACCIÓN INMEDIATA)
//
// Comprueba las DOS vías de entrega, que son excluyentes:
//   A) contra entrega: el vendedor confirma el código de 4 dígitos → `confirmDeliveryCode`
//   B) el resto: el vendedor acepta → prepara → listo → entrega → `orderAction('deliver')`
// En las dos, `lifebook.products.sales_count` del producto tiene que subir exactamente lo comprado.
//
// Deja dos pedidos ENTREGADOS (no se pueden cancelar) y el stock consumido: el stock y el contador se
// restauran después por SQL, a mano, para no dejar datos falsos en el catálogo.
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb76a.cjs
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
    method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { s: r.status, b: await j(r) };
};

const PRODUCTO = '074e141b-f618-47c5-9078-acb74e82d467'; // Camiseta (Hotel Demo Malabo)

const leerVentas = async (tok) => {
  const p = await req('GET', `/lifebook/commerce/products/${PRODUCTO}`, tok);
  const prod = p.b?.product ?? {};
  const clave = Object.keys(prod).find((k) => /sales/i.test(k));
  return { valor: clave ? Number(prod[clave]) : null, clave, bruto: prod };
};

(async () => {
  console.log(`red: ${await prepararRed()}`);
  const B = await login('+240555000003', '123456');
  const TIENDA = await login('+240222000123', 'MiClave123');

  const antes = await leerVentas(B);
  console.log(`ventas al empezar: ${antes.valor} (campo «${antes.clave ?? '¿?'}»)`);
  if (antes.clave === undefined) {
    console.log('  claves del producto: ' + Object.keys(antes.bruto).join(', '));
  }

  const crear = (cuerpo) => req('POST', '/lifebook/commerce/orders', B, cuerpo,
    { 'Idempotency-Key': `lb76a-${Date.now()}-${Math.random().toString(16).slice(2, 6)}` });

  // ── A) Contra entrega: se entrega con el código ────────────────────────────
  console.log('\n=== A. ENTREGA POR CÓDIGO (contra entrega) ===');
  const a = await crear({
    items: [{ productId: PRODUCTO, quantity: 2 }],
    deliveryMode: 'pickup', deliveryAddress: {}, paymentMethod: 'cash_on_delivery',
    note: 'PRUEBA de ventas A (se entrega)',
  });
  const oa = a.b?.order;
  comprobar(!!oa?.deliveryCode, `pedido ${oa?.code} con código ${oa?.deliveryCode}`);
  const conf = await req('POST', `/lifebook/commerce/orders/${oa?.id}/confirm-code`, TIENDA, { code: oa?.deliveryCode });
  comprobar(conf.s === 200 || conf.s === 201, `confirmar el código → HTTP ${conf.s} (${conf.b?.order?.status ?? conf.b?.error?.message ?? ''})`);
  const trasA = await leerVentas(B);
  comprobar(trasA.valor === antes.valor + 2, `ventas ${antes.valor} → ${trasA.valor} (esperado +2)`);
  comprobar(conf.b?.order?.paymentStatus === 'paid', `y queda pagado: ${conf.b?.order?.paymentStatus}`);

  // ── B) El resto: aceptar → preparar → listo → entregar ────────────────────
  console.log('\n=== B. ENTREGA POR EL BOTÓN DEL VENDEDOR (pago en tienda) ===');
  const b = await crear({
    items: [{ productId: PRODUCTO, quantity: 1 }],
    deliveryMode: 'pickup', deliveryAddress: {}, paymentMethod: 'in_store',
    note: 'PRUEBA de ventas B (se entrega)',
  });
  const ob = b.b?.order;
  for (const accion of ['accept', 'prepare', 'ready', 'deliver']) {
    const r = await req('PATCH', `/lifebook/commerce/orders/${ob?.id}/action`, TIENDA, { action: accion });
    console.log(`  ${accion} → HTTP ${r.s} ${r.b?.order?.status ?? r.b?.error?.message ?? ''}`);
  }
  const trasB = await leerVentas(B);
  comprobar(trasB.valor === trasA.valor + 1, `ventas ${trasA.valor} → ${trasB.valor} (esperado +1)`);

  // ── C) Que entregar dos veces no cuente dos veces ─────────────────────────
  console.log('\n=== C. ENTREGAR DOS VECES NO CUENTA DOS VECES ===');
  const repetido = await req('PATCH', `/lifebook/commerce/orders/${ob?.id}/action`, TIENDA, { action: 'deliver' });
  comprobar(repetido.s >= 400, `segunda entrega rechazada → HTTP ${repetido.s} ${repetido.b?.error?.code ?? ''}`);
  const trasC = await leerVentas(B);
  comprobar(trasC.valor === trasB.valor, `las ventas no cambian: ${trasB.valor} → ${trasC.valor}`);

  console.log(`\n  (para limpiar: pedidos ${oa?.code} y ${ob?.code} entregados, ventas = ${trasC.valor})`);
  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
