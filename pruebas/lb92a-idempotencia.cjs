// lb92a-idempotencia.cjs — ¿protege la clave de idempotencia de verdad? (punto 12 de la §3)
//
// Tres casos, los tres con la MISMA clave:
//   A) mismo contenido  → devuelve el MISMO pedido y no crea otro (replay, como debe ser)
//   B) contenido DISTINTO → se corta con IDEMPOTENCY_KEY_REUSED (antes devolvía el pedido viejo EN SILENCIO)
//   C) clave CADUCADA → se recicla y el reintento crea el pedido (antes: «ya se está creando» para siempre)
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb92a.cjs <clave-caducada-por-SQL>
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
const cuerpo = (cantidad) => ({
  items: [{ productId: PRODUCTO, quantity: cantidad }],
  deliveryMode: 'pickup', deliveryAddress: {}, paymentMethod: 'in_store',
  note: 'PRUEBA de idempotencia (se cancela)',
});

(async () => {
  const B = await entrar('+240555000003', '123456');
  const CLAVE = `lb92a-${Date.now()}`;
  const CADUCADA = String(process.argv[2] ?? '').trim();
  const crear = (cantidad, clave) => req('POST', '/lifebook/commerce/orders', B, cuerpo(cantidad), { 'Idempotency-Key': clave });

  const stockAntes = Number((await req('GET', `/lifebook/commerce/products/${PRODUCTO}`, B)).b?.product?.stockQuantity);
  const ids = [];

  // ── A) Mismo contenido ────────────────────────────────────────────────────
  console.log('=== A. MISMA CLAVE Y MISMO CONTENIDO ===');
  const a1 = await crear(1, CLAVE);
  comprobar(a1.s === 201 || a1.s === 200, `la primera compra sale → HTTP ${a1.s} ${a1.b?.order?.code ?? ''}`);
  const a2 = await crear(1, CLAVE);
  comprobar(a2.s === 201 || a2.s === 200, `el reintento sale → HTTP ${a2.s}`);
  comprobar(a2.b?.order?.id === a1.b?.order?.id, `y devuelve EL MISMO pedido (${a1.b?.order?.code}) en vez de crear otro`);
  if (a1.b?.order?.id) ids.push(a1.b.order.id);

  // ── B) Contenido distinto con la misma clave ──────────────────────────────
  console.log('\n=== B. MISMA CLAVE Y CONTENIDO DISTINTO ===');
  const b1 = await crear(2, CLAVE);
  comprobar(b1.s >= 400 && b1.b?.error?.code === 'IDEMPOTENCY_KEY_REUSED',
    `se corta con el motivo exacto → ${b1.b?.error?.code ?? `HTTP ${b1.s}`} (antes devolvía el pedido viejo en silencio)`);
  comprobar(!b1.b?.order, 'y NO devuelve ningún pedido (no se puede confundir con el anterior)');

  const stockTrasB = Number((await req('GET', `/lifebook/commerce/products/${PRODUCTO}`, B)).b?.product?.stockQuantity);
  comprobar(stockTrasB === stockAntes - 1, `no se ha tocado el stock con el intento rechazado: ${stockAntes} → ${stockTrasB}`);

  // ── C) Clave caducada ─────────────────────────────────────────────────────
  console.log('\n=== C. CLAVE CADUCADA (la caduca el SQL antes de esta prueba) ===');
  if (!CADUCADA) {
    console.log('  (sin clave caducada: se salta este caso)');
  } else {
    const c1 = await crear(1, CADUCADA);
    comprobar(c1.s === 201 || c1.s === 200, `con la clave caducada se CREA el pedido → HTTP ${c1.s} ${c1.b?.error?.code ?? c1.b?.order?.code ?? ''}`);
    comprobar(c1.b?.error?.code !== 'IDEMPOTENCY_IN_PROGRESS', 'no se queda en «ese pedido ya se está creando» para siempre');
    if (c1.b?.order?.id) ids.push(c1.b.order.id);
  }

  // Limpieza: se cancelan los pedidos creados (devuelven el stock).
  let cancelados = 0;
  for (const id of ids) {
    const r = await req('PATCH', `/lifebook/commerce/orders/${id}/action`, B, { action: 'cancel' });
    if (r.s === 200 || r.s === 201) cancelados++;
  }
  const stockFinal = Number((await req('GET', `/lifebook/commerce/products/${PRODUCTO}`, B)).b?.product?.stockQuantity);
  comprobar(stockFinal === stockAntes, `el stock vuelve al de antes: ${stockAntes} → ${stockFinal} (${cancelados} pedidos cancelados)`);

  console.log(`\n  clave usada: ${CLAVE} · clave caducada: ${CADUCADA || '(ninguna)'}`);
  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
