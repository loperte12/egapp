// lb81a-cobro-en-pantalla.cjs — el cobro marcado por la tienda, visto desde el móvil (TANDA S).
//
// El móvil tiene la sesión del **dueño** (comprador). El botón de «Marcar cobrado» es de la TIENDA, así
// que esa parte la prueba el dueño; lo que se puede medir aquí y ahora es **lo que ve el comprador**:
// que su pedido, después de que la tienda lo marque cobrado, enseñe «Cobrado el …», la nota y el
// enlace del justificante. Se hace por enlace directo, sin tocar la pantalla.
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb81a.cjs crear|cobrar <id>|cancelar <id>
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';
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
/**
 * El justificante TIENE QUE EXISTIR. Aquí estaba el fallo que reportó el dueño: se usaba una URL
 * inventada, y al pulsarla el almacenamiento devolvía su página de error en XML. La buena se saca con
 * `node /root/lb82a.cjs` (sube una imagen de verdad) y se pasa en `LB_JUSTIFICANTE`.
 */
const JUSTIFICANTE = process.env.LB_JUSTIFICANTE ?? '';

(async () => {
  const ADM = await login('+240999888777', '123456');   // la cuenta del móvil (comprador)
  const TIENDA = await login('+240222000123', 'MiClave123');
  const modo = String(process.argv[2] ?? 'crear').toLowerCase();
  const id = process.argv[3];

  if (modo === 'cobrar') {
    const r = await req('POST', `/lifebook/commerce/orders/${id}/mark-paid`, TIENDA,
      { proofUrl: JUSTIFICANTE, note: 'Transferencia BGFI ref. 99123' });
    console.log(`marcar cobrado (tienda) → HTTP ${r.s} · paymentStatus=${r.b?.order?.paymentStatus ?? r.b?.error?.code}`);
    console.log(`  paidAt=${r.b?.order?.paidAt ?? '-'} · justificante=${r.b?.order?.paymentProofUrl ?? '-'}`);
    console.log(`  nota=${r.b?.order?.paymentNote ?? '-'}`);
    return;
  }

  if (modo === 'cancelar') {
    const c = await req('PATCH', `/lifebook/commerce/orders/${id}/action`, ADM, { action: 'cancel' });
    console.log(`cancelar ${id} → HTTP ${c.s} (${c.b?.order?.status ?? c.b?.error?.message ?? ''})`);
    return;
  }

  const o = await req('POST', '/lifebook/commerce/orders', ADM, {
    items: [{ productId: PRODUCTO, quantity: 1 }],
    deliveryMode: 'pickup',
    deliveryAddress: {},
    paymentMethod: 'transfer',
    note: 'PRUEBA del cobro marcado por la tienda',
  }, { 'Idempotency-Key': `lb81a-${Date.now()}` });
  const ped = o.b?.order;
  console.log(`HTTP ${o.s} · pedido ${ped?.code} · id ${ped?.id}`);
  console.log(`  pago: ${ped?.paymentMethod} · paymentStatus: ${ped?.paymentStatus}`);
  console.log(`  ABRIR EN EL MÓVIL: egrouteplan://lifebook-order/${ped?.id}`);
  console.log(`  COBRAR (tienda):   node /root/lb81a.cjs cobrar ${ped?.id}`);
  console.log(`  CANCELAR:          node /root/lb81a.cjs cancelar ${ped?.id}`);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
