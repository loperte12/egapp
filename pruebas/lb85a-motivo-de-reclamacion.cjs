// lb85a-motivo-de-reclamacion.cjs — ¿se puede reclamar sin decir por qué? (punto 7b de la §3)
//
// Antes: la acción `dispute` ponía el pedido en `disputed` y **no guardaba nada**. La tienda veía «Pedido
// en reclamación» sin saber qué se le reclamaba. Ahora el motivo es obligatorio (mínimo 10 letras), se
// guarda con su fecha y viaja en el aviso del chat.
//
// OJO CON LA LIMPIEZA: un pedido en `disputed` **no se puede cancelar** por la API (la acción `cancel`
// solo sale de created/confirmed/preparing), así que el pedido de prueba se queda en ese estado y el
// stock se devuelve por SQL a mano, como en las otras pruebas. Se dice aquí para que nadie lo confunda
// con un pedido de verdad.
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb85a.cjs
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
const MOTIVO = 'El paquete llegó abierto y falta una talla';

(async () => {
  const B = await login('+240555000003', '123456');
  const T = await login('+240222000123', 'MiClave123');

  const o = await req('POST', '/lifebook/commerce/orders', B,
    { items: [{ productId: PRODUCTO, quantity: 1 }], deliveryMode: 'pickup', deliveryAddress: {}, paymentMethod: 'in_store', note: 'PRUEBA del motivo de la reclamación' },
    { 'Idempotency-Key': `lb85a-${Date.now()}` });
  const ped = o.b?.order;
  console.log(`pedido ${ped?.code} (${ped?.id})`);

  // La reclamación solo sale de estos estados: se acepta el pedido para llegar a `confirmed`.
  const aceptar = await req('PATCH', `/lifebook/commerce/orders/${ped.id}/action`, T, { action: 'accept' });
  comprobar(aceptar.s === 200 || aceptar.s === 201, `la tienda acepta (hace falta para poder reclamar) → HTTP ${aceptar.s}`);

  // ── A) Sin motivo y con motivo corto ──────────────────────────────────────
  console.log('\n=== A. SIN MOTIVO NO HAY RECLAMACIÓN ===');
  const sinMotivo = await req('PATCH', `/lifebook/commerce/orders/${ped.id}/action`, B, { action: 'dispute' });
  comprobar(sinMotivo.b?.error?.code === 'DISPUTE_REASON_REQUIRED', `sin motivo → ${sinMotivo.b?.error?.code ?? `HTTP ${sinMotivo.s}`}`);
  const corto = await req('PATCH', `/lifebook/commerce/orders/${ped.id}/action`, B, { action: 'dispute', reason: 'roto' });
  comprobar(corto.b?.error?.code === 'DISPUTE_REASON_REQUIRED', `con motivo de 4 letras → ${corto.b?.error?.code ?? `HTTP ${corto.s}`}`);
  const estadoTrasFallar = await req('GET', `/lifebook/commerce/orders/${ped.id}`, B);
  comprobar(estadoTrasFallar.b?.order?.status === 'confirmed', `y el pedido NO se ha tocado: status=${estadoTrasFallar.b?.order?.status}`);

  // ── B) Con motivo ─────────────────────────────────────────────────────────
  console.log('\n=== B. CON MOTIVO: SE GUARDA, SE AVISA Y LO VEN LOS DOS ===');
  const bien = await req('PATCH', `/lifebook/commerce/orders/${ped.id}/action`, B, { action: 'dispute', reason: MOTIVO });
  const ord = bien.b?.order;
  comprobar(bien.s === 200 || bien.s === 201, `reclamar con motivo → HTTP ${bien.s} ${bien.b?.error?.code ?? ''}`);
  comprobar(ord?.status === 'disputed', `el pedido queda en reclamación: status=${ord?.status}`);
  comprobar(ord?.disputeReason === MOTIVO, `el motivo se guarda entero: «${ord?.disputeReason ?? '(vacío)'}»`);
  comprobar(!!ord?.disputedAt, `y con su fecha: ${ord?.disputedAt ?? '(vacío)'}`);

  const comoTienda = await req('GET', `/lifebook/commerce/orders/${ped.id}`, T);
  comprobar(comoTienda.b?.order?.disputeReason === MOTIVO, `la TIENDA lee el motivo en el pedido (${comoTienda.b?.order?.disputeReason ? 'sí' : 'no'})`);

  // El aviso del chat, con el motivo dentro.
  const conv = await req('POST', '/lifebook/chat/open', T, { userId: comoTienda.b?.order?.buyer?.id });
  const convId = conv.b?.id ?? conv.b?.conversation?.id;
  const msgs = await req('GET', `/lifebook/chat/conversations/${convId}/messages`, T);
  const arr = Array.isArray(msgs.b) ? msgs.b : (msgs.b?.messages ?? []);
  const aviso = arr.map((m) => String(m.body ?? m.text ?? '')).find((t) => /reclamación/i.test(t));
  comprobar(!!aviso && aviso.includes(MOTIVO), `el aviso del chat lleva el motivo: «${aviso ?? '(ninguno)'}»`);

  // ── C) En reclamación, no se sigue con la gestión normal ──────────────────
  console.log('\n=== C. EN RECLAMACIÓN NO SE SIGUE COMO SI NADA ===');
  const preparar = await req('PATCH', `/lifebook/commerce/orders/${ped.id}/action`, T, { action: 'prepare' });
  comprobar(preparar.s >= 400, `la tienda no puede preparar un pedido reclamado → HTTP ${preparar.s} ${preparar.b?.error?.code ?? ''}`);

  console.log(`\n  pedido ${ped.code} queda EN RECLAMACIÓN (no se puede cancelar por la API) → el stock se`);
  console.log('  devuelve por SQL a mano, como en las otras pruebas.');
  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
