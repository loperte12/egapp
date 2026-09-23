// lb80a-justificante-del-cobro.cjs — ¿puede la tienda cerrar el cobro de lo que se paga por fuera?
// (segunda mitad del punto 5 de la ACCIÓN INMEDIATA)
//
// Contra entrega y pago en tienda ya quedan `paid` al entregar. Una transferencia, una facturación o un
// depósito entran por fuera: la tienda tiene que poder marcar «cobrado», con el justificante, y eso
// tiene que quedar con rastro. Lo que se comprueba:
//
//   A) la tienda marca cobrado una transferencia con justificante y nota → `paid` + `paidAt` + las dos
//   B) marcarlo otra vez → rechazado (no se reescribe la fecha del cobro)
//   C) el COMPRADOR intentando marcarlo él → rechazado (solo la tienda)
//   D) un pedido CANCELADO → rechazado (no hay nada que cobrar)
//   E) un justificante que no es un enlace http(s) → rechazado
//   F) sin justificante → se admite (decisión abierta, documentada en el parche) y queda a null
//   G) un pedido de pago en tienda YA cobrado al entregar → rechazado (coherente con el parche 79)
//   H) el comprador VE con qué se dio por cobrado (paidAt, justificante y nota) en su propio detalle
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb80a.cjs
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

const PRODUCTO = '074e141b-f618-47c5-9078-acb74e82d467';
const JUSTIFICANTE = 'https://hk.egrouteplan.com/storage/lb-images/justificante-de-prueba.jpg';
const COSAS = `lb80a-${Date.now()}`;

(async () => {
  const B = await login('+240555000003', '123456');
  const T = await login('+240222000123', 'MiClave123');

  const crear = async (metodo, nota) => {
    const r = await req('POST', '/lifebook/commerce/orders', B,
      { items: [{ productId: PRODUCTO, quantity: 1 }], deliveryMode: 'pickup', deliveryAddress: {}, paymentMethod: metodo, note: nota },
      { 'Idempotency-Key': `${COSAS}-${metodo}-${Math.random().toString(16).slice(2, 8)}` });
    if (!r.b?.order?.id) throw new Error(`no se creó el pedido: ${JSON.stringify(r.b).slice(0, 200)}`);
    return r.b.order;
  };
  const marca = (tok, id, body) => req('POST', `/lifebook/commerce/orders/${id}/mark-paid`, tok, body);
  const detalle = async (tok, id) => (await req('GET', `/lifebook/commerce/orders/${id}`, tok)).b?.order ?? {};
  const cancelar = (tok, id) => req('PATCH', `/lifebook/commerce/orders/${id}/action`, tok, { action: 'cancel' });

  // ── Pedido 1: transferencia ───────────────────────────────────────────────
  const o1 = await crear('transfer', 'PRUEBA del justificante del cobro');
  console.log(`=== PEDIDO 1 (transferencia ${o1.code}) ===`);
  console.log(`  al crear: paymentStatus=${o1.paymentStatus} (pendiente, el dinero entra por fuera)`);

  const c = await marca(B, o1.id, { proofUrl: JUSTIFICANTE });
  comprobar(c.s >= 400 && c.b?.error?.code === 'NOT_ORDER_PARTICIPANT', `C) el COMPRADOR no puede marcarlo → ${c.b?.error?.code ?? `HTTP ${c.s}`}`);

  const e = await marca(T, o1.id, { proofUrl: 'javascript:alert(1)' });
  comprobar(e.s >= 400 && e.b?.error?.code === 'PROOF_URL_INVALID', `E) justificante que no es un enlace → ${e.b?.error?.code ?? `HTTP ${e.s}`}`);

  const a = await marca(T, o1.id, { proofUrl: JUSTIFICANTE, note: 'Transferencia BGFI ref. 99123' });
  const pa = a.b?.order;
  comprobar(a.s === 200 || a.s === 201, `A) la tienda marca cobrado → HTTP ${a.s} ${a.b?.error?.code ?? ''}`);
  comprobar(pa?.paymentStatus === 'paid', `   queda COBRADO: paymentStatus=${pa?.paymentStatus}`);
  comprobar(!!pa?.paidAt, `   con fecha de cobro: paidAt=${pa?.paidAt ?? '(vacío)'}`);
  comprobar(pa?.paymentProofUrl === JUSTIFICANTE, `   y con el justificante guardado: ${pa?.paymentProofUrl ?? '(vacío)'}`);
  comprobar(pa?.paymentNote === 'Transferencia BGFI ref. 99123', `   y la nota: ${pa?.paymentNote ?? '(vacío)'}`);

  const b2 = await marca(T, o1.id, { proofUrl: JUSTIFICANTE, note: 'otra vez' });
  comprobar(b2.s >= 400 && b2.b?.error?.code === 'PAYMENT_ALREADY_PAID', `B) marcarlo otra vez → ${b2.b?.error?.code ?? `HTTP ${b2.s}`}`);

  const h = await detalle(B, o1.id);
  comprobar(h.paymentStatus === 'paid' && h.paymentProofUrl === JUSTIFICANTE && h.paymentNote === 'Transferencia BGFI ref. 99123',
    `H) el COMPRADOR ve el cobro, el justificante y la nota (paymentStatus=${h.paymentStatus})`);

  const lim1 = await cancelar(B, o1.id);
  comprobar(lim1.s === 200 || lim1.s === 201, `   (se cancela el pedido de prueba para devolver el stock → HTTP ${lim1.s})`);

  // ── Pedido 2: sin justificante ────────────────────────────────────────────
  console.log('\n=== PEDIDO 2 (transferencia sin justificante) ===');
  const o2 = await crear('transfer', 'PRUEBA del cobro sin justificante');
  const f = await marca(T, o2.id, { note: 'Cobrado en efectivo, sin recibo' });
  comprobar(f.s === 200 || f.s === 201, `F) sin justificante se admite (decisión abierta) → HTTP ${f.s} ${f.b?.error?.code ?? ''}`);
  comprobar(f.b?.order?.paymentStatus === 'paid', `   y queda cobrado: ${f.b?.order?.paymentStatus}`);
  comprobar(f.b?.order?.paymentProofUrl === null, `   con el justificante a null: ${f.b?.order?.paymentProofUrl}`);
  await cancelar(B, o2.id);

  // ── Pedido 3: pago en tienda ya cobrado al entregar ───────────────────────
  console.log('\n=== PEDIDO 3 (pago en tienda, cobrado al entregar) ===');
  const o3 = await crear('in_store', 'PRUEBA del cobro ya cerrado por la entrega');
  for (const accion of ['accept', 'prepare', 'ready', 'deliver']) {
    await req('PATCH', `/lifebook/commerce/orders/${o3.id}/action`, T, { action: accion });
  }
  const d3 = await detalle(B, o3.id);
  comprobar(d3.status === 'delivered' && d3.paymentStatus === 'paid', `   quedó entregado y cobrado al entregar: ${d3.status}/${d3.paymentStatus}`);
  const g = await marca(T, o3.id, { proofUrl: JUSTIFICANTE });
  comprobar(g.s >= 400 && g.b?.error?.code === 'PAYMENT_ALREADY_PAID', `G) marcarlo a mano después → ${g.b?.error?.code ?? `HTTP ${g.s}`}`);

  // ── Pedido 4: cancelado ───────────────────────────────────────────────────
  console.log('\n=== PEDIDO 4 (cancelado) ===');
  const o4 = await crear('transfer', 'PRUEBA del cobro de un pedido cancelado');
  await cancelar(B, o4.id);
  const d = await marca(T, o4.id, { proofUrl: JUSTIFICANTE });
  comprobar(d.s >= 400 && d.b?.error?.code === 'ORDER_CANCELLED', `D) un pedido cancelado no se cobra → ${d.b?.error?.code ?? `HTTP ${d.s}`}`);

  console.log(`\n  pedidos: ${o1.code} (cobrado y cancelado) · ${o2.code} (cobrado sin justificante, cancelado) · ${o3.code} (entregado) · ${o4.code} (cancelado)`);
  console.log('\n  SQL para ver el rastro (quién marcó y cuándo):');
  console.log(`    SELECT order_no, payment_method, status, payment_status, paid_at, paid_by, payment_proof_url, payment_note FROM lifebook.orders WHERE order_no IN ('${o1.code}','${o2.code}','${o3.code}','${o4.code}');`);
  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
