// lb64a-comprobar-tres.cjs — tres preguntas concretas para ver SI el asistente busca bien.
// Se lanza desde el servidor:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb64a.cjs
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';
let prepararRed = async () => 'sin-proxy';
if (!process.env.LB_API) {
  try { ({ prepararRed } = require('./red.cjs')); } catch { /* directo */ }
}
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };
const login = async (phone, password) => {
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
  console.log(`red: ${await prepararRed()}`);
  const B = await login('+240555000003', '123456');
  const conv = (await req('POST', '/lifebook/ai/new', B)).b?.conversation?.id ?? null;
  const preguntas = [
    'Busco habitación de hotel en Malabo para 2 personas',
    '¿Hay rutas de Malabo a Bata?',
    '¿Qué alquileres hay en total, en cualquier ciudad?',
  ];
  for (const q of preguntas) {
    const r = await req('POST', '/lifebook/ai/chat', B, { message: q, conversationId: conv });
    console.log(`\n«${q}» → HTTP ${r.s}`);
    console.log(`  ${String(r.b?.reply?.text ?? '').replace(/\n/g, ' ').slice(0, 300)}`);
    const t = r.b?.reply?.cards ?? [];
    console.log(`  tarjetas: ${t.map((x) => `${x.tipo}:${x.titulo}`).join(' | ') || '(ninguna)'}`);
  }
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
