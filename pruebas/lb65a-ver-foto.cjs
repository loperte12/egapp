// lb65a-ver-foto.cjs — ¿Cucucul VE la foto? (tanda N, visión con Qwen)
// Se lanza desde el servidor: LB_API=http://127.0.0.1:3000/api/v1 node /root/lb65a.cjs
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

// Una foto REAL del servidor (la portada que usan los productos de prueba).
const FOTO = 'https://hk.egrouteplan.com/lb-images/covers/05193228-dac5-4835-a3ea-8c0ad8b7da17.jpg';

(async () => {
  console.log(`red: ${await prepararRed()}`);
  const B = await login('+240555000003', '123456');
  const conv = (await req('POST', '/lifebook/ai/new', B)).b?.conversation?.id ?? null;

  console.log('\n=== 1. SIN FOTO (que no invente) ===');
  const sinFoto = await req('POST', '/lifebook/ai/chat', B, { message: '¿Qué ves en la foto?', conversationId: conv });
  console.log(`  HTTP ${sinFoto.s} · ${String(sinFoto.b?.reply?.text ?? '').slice(0, 200)}`);

  console.log('\n=== 2. CON FOTO (visión real) ===');
  const conFoto = await req('POST', '/lifebook/ai/chat', B, {
    message: '¿Qué se ve en esta foto? ¿Tienes algo parecido en el catálogo?',
    conversationId: conv,
    imageUrl: FOTO,
  });
  console.log(`  HTTP ${conFoto.s}`);
  console.log(`  ${String(conFoto.b?.reply?.text ?? '').slice(0, 400)}`);
  const t = conFoto.b?.reply?.cards ?? [];
  console.log(`  tarjetas: ${t.map((x) => `${x.tipo}:${x.titulo}`).join(' | ') || '(ninguna)'}`);
  console.log(`\n  quedan hoy: ${conFoto.b?.leftToday}`);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
