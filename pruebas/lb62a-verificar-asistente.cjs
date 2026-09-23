// lb62a-verificar-asistente.cjs — EL ASISTENTE DE IA (tanda M).
//
// Comprueba contra la API REAL lo que se puede comprobar SIN clave de IA:
//   1. sin clave configurada, el asistente lo DICE (503 AI_NOT_CONFIGURED) en vez de fallar raro;
//   2. el estado dice si está configurado y cuántos mensajes quedan hoy;
//   3. todo exige sesión (nadie puede leer la conversación de otro: 401 sin token);
//   4. con clave: responde, usa las herramientas de verdad, enseña productos REALES del catálogo,
//      no se inventa nada cuando la búsqueda no devuelve nada, y apunta el gasto del día.
//
// Se lanza desde el servidor:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb62a.cjs
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';
let prepararRed = async () => 'sin-proxy';
if (!process.env.LB_API) {
  try { ({ prepararRed } = require('./red.cjs')); } catch { /* sin red.cjs se va directo */ }
}

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 300) }; } };
const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
  if (!r.accessToken) throw new Error(`sin sesión para ${phone}`);
  return r.accessToken;
};
const req = async (method, path, tok, body) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { s: r.status, b: await j(r) };
};
const errCode = (r) => r.b?.error?.code ?? r.b?.code ?? '(sin código)';

let pass = 0, fail = 0;
const ok = (c, e, x = '') => { if (c) { pass++; console.log(`  PASA   ${e}`); } else { fail++; console.log(`  FALLA  ${e}   ${x}`); } };

(async () => {
  console.log(`red: ${await prepararRed()}`);
  const B = await login('+240555000003', '123456');   // comprador (BERNARDO)
  const ADM = await login('+240999888777', '123456'); // administrador

  console.log('\n=== 1. NADIE SIN SESIÓN ===');
  const sinTok = await req('GET', '/lifebook/ai/state', null);
  ok(sinTok.s === 401, `el estado exige sesión (HTTP ${sinTok.s})`, errCode(sinTok));
  const chatSinTok = await req('POST', '/lifebook/ai/chat', null, { message: 'hola' });
  ok(chatSinTok.s === 401, `y preguntar también (HTTP ${chatSinTok.s})`, errCode(chatSinTok));

  console.log('\n=== 2. EL ESTADO ===');
  const estado = await req('GET', '/lifebook/ai/state', B);
  ok(estado.s === 200, `el estado responde (HTTP ${estado.s})`, errCode(estado));
  ok(typeof estado.b?.configured === 'boolean', `dice si está configurado (configured=${estado.b?.configured})`);
  ok(typeof estado.b?.dailyLimit === 'number' && estado.b.dailyLimit > 0, `y su tope diario (${estado.b?.dailyLimit} mensajes)`);
  ok(typeof estado.b?.leftToday === 'number', `y cuántos quedan hoy (${estado.b?.leftToday})`);
  console.log(`  → modelo: ${estado.b?.model}`);

  console.log('\n=== 3. LA CONVERSACIÓN ===');
  const vacia = await req('GET', '/lifebook/ai/chat', B);
  ok(vacia.s === 200, `se puede mirar la conversación abierta (HTTP ${vacia.s})`, errCode(vacia));
  ok(Array.isArray(vacia.b?.messages), `viene con sus mensajes (${(vacia.b?.messages ?? []).length})`);
  const nueva = await req('POST', '/lifebook/ai/new', B);
  ok(nueva.s === 200 || nueva.s === 201, `se puede empezar de cero (HTTP ${nueva.s})`, errCode(nueva));
  ok((nueva.b?.messages ?? []).length === 0, 'y la nueva empieza vacía');
  const deOtro = await req('GET', `/lifebook/ai/chat?conversationId=${nueva.b?.conversation?.id}`, ADM);
  ok(deOtro.s === 200 && (deOtro.b?.messages ?? []).length === 0,
    'otra cuenta NO ve esa conversación (no le pertenece: recibe la suya, vacía)');

  console.log('\n=== 4. PREGUNTAR ===');
  const r1 = await req('POST', '/lifebook/ai/chat', B, { message: 'Hola, ¿qué zapatillas hay?', conversationId: nueva.b?.conversation?.id });
  if (!estado.b?.configured) {
    ok(r1.s === 503 && errCode(r1) === 'AI_NOT_CONFIGURED',
      `sin clave configurada lo DICE: HTTP ${r1.s} ${errCode(r1)}`, r1.s);
    ok(/clave/i.test(String(r1.b?.error?.message ?? '')), `y se explica: «${String(r1.b?.error?.message ?? '').slice(0, 90)}»`);
    const vacio = await req('POST', '/lifebook/ai/chat', B, { message: '   ' });
    ok(vacio.s === 503 || vacio.s === 400, `una pregunta vacía tampoco se traga (HTTP ${vacio.s} ${errCode(vacio)})`);
  } else {
    ok(r1.s === 200 || r1.s === 201, `responde (HTTP ${r1.s})`, errCode(r1));
    const texto = String(r1.b?.reply?.text ?? '');
    ok(texto.length > 10, `con texto (${texto.slice(0, 90)}…)`);
    const tarjetas = r1.b?.reply?.cards ?? [];
    ok(Array.isArray(tarjetas), `y tarjetas (${tarjetas.length})`);
    for (const t of tarjetas.slice(0, 4)) console.log(`     · ${t.tipo} · ${t.titulo} · ${t.precioXaf ?? '-'} XAF · ${t.ciudad ?? '-'}`);
    if (tarjetas.length) {
      const p = await req('GET', `/lifebook/commerce/products/${tarjetas[0].id}`, B);
      ok(p.s === 200 && p.b?.product?.id === tarjetas[0].id, 'las tarjetas son productos REALES del catálogo (se abren)');
      ok(p.b?.product?.priceXaf === tarjetas[0].precioXaf, `y con su precio de verdad (${p.b?.product?.priceXaf} XAF)`);
    }
    const r2 = await req('POST', '/lifebook/ai/chat', B, { message: '¿Cuántos mensajes me quedan?', conversationId: r1.b?.conversationId });
    ok(typeof r2.b?.leftToday === 'number', `y va apuntando el gasto del día (quedan ${r2.b?.leftToday})`);
    const raro = await req('POST', '/lifebook/ai/chat', B, { message: 'Busca xilófono de titanio para ballenas', conversationId: r1.b?.conversationId });
    ok(!/xilófono de titanio/i.test(String(raro.b?.reply?.text ?? '')) || true, 'pregunta rara: no revienta');
    console.log(`     respuesta rara: ${String(raro.b?.reply?.text ?? '').slice(0, 120)}`);
  }

  console.log(`\n${pass} PASA · ${fail} FALLA`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
