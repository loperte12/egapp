// sonda-ventana.cjs — con el pedido ya entregado hace 10 días (lo pone el SQL): ¿rechaza la reclamación?
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/sonda-ventana.cjs <id-del-pedido-viejo>
const API = process.env.LB_API ?? 'http://127.0.0.1:3000/api/v1';
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };
const entrar = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
  return r.accessToken;
};
const req = async (method, path, tok, body) => {
  const r = await fetch(`${API}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { s: r.status, b: await j(r) };
};

(async () => {
  const id = String(process.argv[2] ?? '').trim();
  const B = await entrar('+240555000003', '123456');
  const T = await entrar('+240222000123', 'MiClave123');

  const detalle = await req('GET', `/lifebook/commerce/orders/${id}`, B);
  console.log(`pedido ${detalle.b?.order?.code} · estado ${detalle.b?.order?.status} · entregado el ${detalle.b?.order?.deliveredAt ?? '(sin fecha)'}`);

  const r = await req('PATCH', `/lifebook/commerce/orders/${id}/action`, B, { action: 'dispute', reason: 'Reclamo pasados los 7 días' });
  console.log(`reclamar un pedido entregado hace 10 días → HTTP ${r.s} · ${r.b?.error?.code ?? r.b?.order?.status ?? ''}`);
  console.log(`  mensaje: «${r.b?.error?.message ?? ''}»`);

  const saldo = (await req('GET', '/lifebook/commerce/money/balance', T)).b ?? {};
  console.log(`saldo de la tienda: pendiente ${saldo.pendienteXaf} XAF · en espera ${saldo.enEsperaXaf} XAF (${saldo.enEsperaPedidos} pedidos)`);
  console.log(`  → el dinero de ese pedido ya se puede pagar: ${Number(saldo.pendienteXaf ?? 0) > 0 ? 'SÍ' : 'NO'}`);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
