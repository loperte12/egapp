// lb79a-pago-cerrado.cjs — ¿un pedido entregado queda cobrado? (punto 5 de la ACCIÓN INMEDIATA)
//
// Decisión del dueño (15/09/2026): los métodos que SE PAGAN AL RECOGER —contra entrega y pago en
// tienda— se dan por cobrados al entregar. Los demás NO: puede que el dinero no esté cobrado y darlo
// por cobrado sería inventarse un ingreso.
//
//   A) pago en tienda  → entregado tiene que quedar `paid` (antes se quedaba `pending` para siempre)
//   B) transferencia   → entregado tiene que seguir `pending` (el parche no se pasa de listo)
//   C) contra entrega  → entregado con el CÓDIGO del comprador tiene que quedar `paid` (no romper lo
//                        que ya funcionaba)
//
// Deja tres pedidos ENTREGADOS (no se pueden cancelar). El stock y el contador de ventas se restauran
// después por SQL, como en las otras pruebas. `paid_at` se mira en la base de datos (la API no lo
// publica): lo imprime el SQL de la comprobación.
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb79a.cjs
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';

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
const B = () => login('+240555000003', '123456');        // comprador de pruebas
const T = () => login('+240222000123', 'MiClave123');    // tienda (Hotel Demo Malabo)

(async () => {
  const comprador = await B();
  const tienda = await T();

  const crear = async (metodo, nota) => {
    const r = await req('POST', '/lifebook/commerce/orders', comprador,
      { items: [{ productId: PRODUCTO, quantity: 1 }], deliveryMode: 'pickup', deliveryAddress: {}, paymentMethod: metodo, note: nota },
      { 'Idempotency-Key': `lb79a-${metodo}-${Date.now()}` });
    if (!r.b?.order?.id) throw new Error(`no se creó el pedido (${metodo}): ${JSON.stringify(r.b).slice(0, 200)}`);
    return r.b.order;
  };
  const entregar = async (o) => {
    for (const accion of ['accept', 'prepare', 'ready', 'deliver']) {
      const r = await req('PATCH', `/lifebook/commerce/orders/${o.id}/action`, tienda, { action: accion });
      if (!(r.s === 200 || r.s === 201)) throw new Error(`${accion} falló: HTTP ${r.s} ${r.b?.error?.code}`);
    }
    return (await req('GET', `/lifebook/commerce/orders/${o.id}`, comprador)).b?.order;
  };

  // ── A) Pago en tienda ─────────────────────────────────────────────────────
  console.log('=== A. PAGO EN TIENDA: al entregar queda COBRADO ===');
  const oa = await crear('in_store', 'PRUEBA del pago en tienda (se entrega)');
  console.log(`  pedido ${oa.code} · al crear: paymentStatus=${oa.paymentStatus}`);
  comprobar(oa.paymentStatus === 'pending', `al crear está pendiente: ${oa.paymentStatus}`);
  const ea = await entregar(oa);
  comprobar(ea?.status === 'delivered', `queda entregado: status=${ea?.status}`);
  comprobar(ea?.paymentStatus === 'paid', `y COBRADO: paymentStatus=${ea?.paymentStatus} (antes se quedaba «pending» para siempre)`);

  // ── B) Transferencia ──────────────────────────────────────────────────────
  console.log('\n=== B. TRANSFERENCIA: entregar NO lo da por cobrado ===');
  const ob = await crear('transfer', 'PRUEBA de la transferencia (se entrega)');
  const eb = await entregar(ob);
  comprobar(eb?.status === 'delivered', `queda entregado: status=${eb?.status}`);
  comprobar(eb?.paymentStatus === 'pending', `pero sigue PENDIENTE: paymentStatus=${eb?.paymentStatus} (el parche no se pasa de listo)`);

  // ── C) Contra entrega, con el código ──────────────────────────────────────
  console.log('\n=== C. CONTRA ENTREGA: entregado con el código queda COBRADO ===');
  const oc = await crear('cash_on_delivery', 'PRUEBA del contra entrega (se entrega)');
  console.log(`  pedido ${oc.code} con código ${oc.deliveryCode}`);
  const conf = await req('POST', `/lifebook/commerce/orders/${oc.id}/confirm-code`, tienda, { code: oc.deliveryCode });
  comprobar(conf.s === 200 || conf.s === 201, `se entrega con el código → HTTP ${conf.s}`);
  const ec = (await req('GET', `/lifebook/commerce/orders/${oc.id}`, comprador)).b?.order;
  comprobar(ec?.status === 'delivered', `entregado: status=${ec?.status}`);
  comprobar(ec?.paymentStatus === 'paid', `y cobrado: paymentStatus=${ec?.paymentStatus}`);

  console.log(`\n  pedidos: ${oa.code} (pago en tienda), ${ob.code} (transferencia), ${oc.code} (contra entrega)`);
  console.log('\n  SQL para mirar paid_at y limpiar:');
  console.log(`    SELECT order_no, payment_method, status, payment_status, paid_at FROM lifebook.orders WHERE order_no IN ('${oa.code}','${ob.code}','${oc.code}');`);
  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
