// lb66a-optimizacion-cucucul.cjs — las 4 mejoras del plan, contra el modelo real.
// Se lanza desde el servidor: LB_API=http://127.0.0.1:3000/api/v1 node /root/lb66a.cjs
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';
let prepararRed = async () => 'sin-proxy';
if (!process.env.LB_API) {
  try { ({ prepararRed } = require('./red.cjs')); } catch { /* directo */ }
}
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };
const login = async (p, w) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: p, password: w }) }));
  return r.accessToken;
};
const req = async (method, path, tok, body) => {
  const r = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { s: r.status, b: await j(r) };
};
let pass = 0, fail = 0;
const ok = (c, e, x = '') => { if (c) { pass++; console.log(`  PASA   ${e}`); } else { fail++; console.log(`  FALLA  ${e}   ${x}`); } };

(async () => {
  console.log(`red: ${await prepararRed()}`);
  const B = await login('+240555000003', '123456');
  const nueva = async () => (await req('POST', '/lifebook/ai/new', B)).b?.conversation?.id ?? null;

  console.log('\n=== 1. ASESOR DE COMPRAS: estilo → look y combo ===');
  let conv = await nueva();
  const look = await req('POST', '/lifebook/ai/chat', B, { message: 'Quiero un look blokecore retro, ¿qué me pongo?', conversationId: conv });
  const t1 = String(look.b?.reply?.text ?? '');
  console.log(`  ${t1.replace(/\n/g, ' ').slice(0, 260)}`);
  ok(look.s === 201, 'responde');
  ok(/combo|conjunto|look|arm/i.test(t1), 'propone armar el look (no solo lista productos)');

  console.log('\n=== 2. SIN RESULTADOS: alternativas, no «no hay nada» ===');
  const raro = await req('POST', '/lifebook/ai/chat', B, { message: '¿Tenéis un xilófono de titanio para ballenas?', conversationId: conv });
  const t2 = String(raro.b?.reply?.text ?? '');
  const cards2 = raro.b?.reply?.cards ?? [];
  console.log(`  ${t2.replace(/\n/g, ' ').slice(0, 220)}`);
  console.log(`  tarjetas: ${cards2.map((x) => x.titulo).join(' | ') || '(ninguna)'}`);
  ok(!/fallo|error técnico|ha fallado/i.test(t2), 'no dice «ha fallado la consulta»');
  ok(/parecid|similar|alternativa|otra opción|mira/i.test(t2) || cards2.length > 0, 'ofrece alternativas o enseña tarjetas reales');

  console.log('\n=== 3. IDIOMA: pregunta en chino, responde en chino ===');
  conv = await nueva();
  const chino = await req('POST', '/lifebook/ai/chat', B, { message: 'Blokecore搭什么鞋好看', conversationId: conv });
  const t3 = String(chino.b?.reply?.text ?? '');
  console.log(`  ${t3.replace(/\n/g, ' ').slice(0, 220)}`);
  const ideogramas = (t3.match(/[\u4e00-\u9fff]/g) ?? []).length;
  ok(ideogramas >= 10, `contesta en CHINO (${ideogramas} ideogramas)`);

  console.log('\n=== 4. MEMORIA DE ESTILO: lo siguiente se evalúa bajo ese paraguas ===');
  const sigue = await req('POST', '/lifebook/ai/chat', B, { message: '¿Y unas zapatillas para ese look?', conversationId: conv });
  const t4 = String(sigue.b?.reply?.text ?? '');
  console.log(`  ${t4.replace(/\n/g, ' ').slice(0, 220)}`);
  ok(/(blokecore|retro|ese look|estilo)/i.test(t4) || (sigue.b?.reply?.cards ?? []).length > 0,
    'mantiene el contexto del estilo (o busca con él)');

  console.log(`\n${pass} PASA · ${fail} FALLA`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
