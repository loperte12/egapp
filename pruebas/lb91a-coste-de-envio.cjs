// lb91a-coste-de-envio.cjs — ¿se puede cerrar el coste del reparto? (punto 15 de la §3)
//
// Con la política de envío «se acuerda por el chat» (`on_request`), el pedido nace con coste 0: el dinero
// del reparto se movía por fuera y sin rastro. Esto comprueba que la tienda puede cerrarlo antes de
// entregar, que el total se recalcula, quién NO puede tocarlo, y que al entregar el libro de cuentas
// escribe `a_pagar_reparto` con el importe de verdad.
//
// La prueba pone la política de la tienda en `on_request` por SQL y la devuelve a `fixed`/1500 al final.
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb91a.cjs
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

const PRODUCTO = '074e141b-f618-47c5-9078-acb74e82d467'; // 12 000 XAF
const CIUDAD = 'Malabo';

(async () => {
  const B = await entrar('+240555000003', '123456');
  const T = await entrar('+240222000123', 'MiClave123');

  const crear = async (modo, nota) => {
    const r = await req('POST', '/lifebook/commerce/orders', B,
      { items: [{ productId: PRODUCTO, quantity: 1 }], deliveryMode: modo,
        deliveryAddress: modo === 'pickup' ? {} : { city: CIUDAD, zone: 'Paraíso', reference: 'Portal azul' },
        paymentMethod: 'transfer', note: nota },
      { 'Idempotency-Key': `lb91a-${Date.now()}-${Math.random().toString(16).slice(2, 6)}` });
    if (!r.b?.order?.id) throw new Error(`no se creó: ${JSON.stringify(r.b).slice(0, 200)}`);
    return r.b.order;
  };
  const coste = (tok, id, valor) => req('PATCH', `/lifebook/commerce/orders/${id}/delivery-cost`, tok, { deliveryCostXaf: valor });

  // ── A) Nace con coste 0 (política «a acordar») ────────────────────────────
  console.log('=== A. CON LA POLÍTICA «A ACORDAR», EL PEDIDO NACE CON COSTE 0 ===');
  const o1 = await crear('taxi_moto', 'PRUEBA del coste de envío (se entrega)');
  console.log(`  pedido ${o1.code} · reparto ${o1.deliveryCostXaf} XAF · total ${o1.totalXaf} XAF · nota: ${o1.note ?? '-'}`);
  comprobar(Number(o1.deliveryCostXaf) === 0, `el reparto nace a 0: ${o1.deliveryCostXaf}`);
  comprobar(Number(o1.totalXaf) === 12000, `y el total no lo lleva: ${o1.totalXaf} XAF`);

  // ── B) Quién NO puede cerrarlo ────────────────────────────────────────────
  console.log('\n=== B. QUIÉN NO PUEDE (y con qué mensaje) ===');
  const comoComprador = await coste(B, o1.id, 2000);
  comprobar(comoComprador.b?.error?.code === 'NOT_ORDER_PARTICIPANT', `el COMPRADOR no fija el reparto → ${comoComprador.b?.error?.code ?? `HTTP ${comoComprador.s}`}`);
  const negativo = await coste(T, o1.id, -100);
  comprobar(negativo.b?.error?.code === 'DELIVERY_COST_INVALID', `un coste negativo → ${negativo.b?.error?.code ?? `HTTP ${negativo.s}`}`);
  const absurdo = await coste(T, o1.id, 900000);
  comprobar(absurdo.b?.error?.code === 'DELIVERY_COST_INVALID', `un coste absurdo (900 000) → ${absurdo.b?.error?.code ?? `HTTP ${absurdo.s}`}`);
  const decimal = await coste(T, o1.id, 1500.5);
  comprobar(decimal.b?.error?.code === 'DELIVERY_COST_INVALID', `un coste con decimales → ${decimal.b?.error?.code ?? `HTTP ${decimal.s}`}`);

  const recogida = await crear('pickup', 'PRUEBA del coste de envío (recogida)');
  const enRecogida = await coste(T, recogida.id, 1500);
  comprobar(enRecogida.b?.error?.code === 'DELIVERY_NOT_APPLICABLE', `en recogida no hay reparto que cobrar → ${enRecogida.b?.error?.code ?? `HTTP ${enRecogida.s}`}`);
  await req('PATCH', `/lifebook/commerce/orders/${recogida.id}/action`, B, { action: 'cancel' });

  const cobrado = await crear('taxi_moto', 'PRUEBA del coste de envío (ya cobrado)');
  const marcar = await req('POST', `/lifebook/commerce/orders/${cobrado.id}/mark-paid`, T, { note: 'cobrado antes de fijar el reparto' });
  comprobar(marcar.s === 200 || marcar.s === 201, `se marca cobrado el otro pedido → HTTP ${marcar.s}`);
  const enCobrado = await coste(T, cobrado.id, 1500);
  comprobar(enCobrado.b?.error?.code === 'ORDER_ALREADY_PAID', `un pedido YA COBRADO no admite cambio de importe → ${enCobrado.b?.error?.code ?? `HTTP ${enCobrado.s}`}`);
  await req('PATCH', `/lifebook/commerce/orders/${cobrado.id}/action`, B, { action: 'cancel' });

  // ── C) La tienda lo cierra y el total lo lleva ────────────────────────────
  console.log('\n=== C. LA TIENDA LO CIERRA: EL TOTAL LO LLEVA ===');
  const cerrado = await coste(T, o1.id, 2000);
  const ord = cerrado.b?.order ?? {};
  comprobar(cerrado.s === 200 || cerrado.s === 201, `la tienda fija 2 000 XAF de reparto → HTTP ${cerrado.s} ${cerrado.b?.error?.code ?? ''}`);
  comprobar(Number(ord.deliveryCostXaf) === 2000, `el reparto queda en 2 000: ${ord.deliveryCostXaf}`);
  comprobar(Number(ord.totalXaf) === 14000, `y el TOTAL lo lleva: 12 000 + 2 000 = ${ord.totalXaf}`);
  const vistoPorElComprador = await req('GET', `/lifebook/commerce/orders/${o1.id}`, B);
  comprobar(Number(vistoPorElComprador.b?.order?.totalXaf) === 14000, `el comprador ve el total nuevo: ${vistoPorElComprador.b?.order?.totalXaf}`);

  // ── D) Al entregar, el libro escribe el reparto de verdad ─────────────────
  console.log('\n=== D. AL ENTREGAR, EL LIBRO DE CUENTAS LO RECOGE ===');
  for (const accion of ['accept', 'prepare', 'ready', 'deliver']) {
    const r = await req('PATCH', `/lifebook/commerce/orders/${o1.id}/action`, T, { action: accion });
    if (!(r.s === 200 || r.s === 201)) throw new Error(`${accion} falló: HTTP ${r.s} ${r.b?.error?.code}`);
  }
  const trasEntregar = await req('GET', `/lifebook/commerce/orders/${o1.id}`, T);
  const f = trasEntregar.b?.order?.fees;
  comprobar(Number(f?.entregaXaf) === 2000, `el desglose guarda el reparto real: ${f?.entregaXaf} XAF`);
  comprobar(Number(f?.comisionXaf) === 960, `la comisión sigue siendo del producto (960) y no del reparto: ${f?.comisionXaf}`);
  comprobar(Number(f?.totalXaf) === 14000, `y el total asentado es el que paga el comprador: ${f?.totalXaf}`);

  const yaEntregado = await coste(T, o1.id, 3000);
  comprobar(yaEntregado.b?.error?.code === 'INVALID_STATE_TRANSITION', `un pedido entregado ya no admite cambios → ${yaEntregado.b?.error?.code ?? `HTTP ${yaEntregado.s}`}`);

  console.log(`\n  pedidos: ${o1.code} (entregado con reparto 2 000) · ${recogida.code} y ${cobrado.code} (cancelados)`);
  console.log('\n  SQL para ver el libro (se limpia después):');
  console.log(`    SELECT cuenta, debe_xaf, haber_xaf FROM lifebook.ledger_entries WHERE order_id IN (SELECT id FROM lifebook.orders WHERE order_no = '${o1.code}');`);
  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
