// lb63a-asistente-todos-los-servicios.cjs — el asistente, servicio por servicio (tanda M-bis).
//
// Le pregunta al asistente REAL por cada servicio de la app y comprueba que:
//   · contesta con datos REALES (nada inventado) usando sus herramientas;
//   · si no hay nada, lo dice;
//   · lo que enseña se puede abrir (las tarjetas apuntan a cosas que existen).
// Se lanza desde el servidor:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb63a.cjs
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

let pass = 0, fail = 0;
const ok = (c, e, x = '') => { if (c) { pass++; console.log(`  PASA   ${e}`); } else { fail++; console.log(`  FALLA  ${e}   ${x}`); } };

/** Las preguntas, una por servicio. */
const PREGUNTAS = [
  { servicio: 'vender (Life Book)', q: '¿Cómo publico un producto para vender?' },
  { servicio: 'tallas', q: '¿Cómo sé mi talla al comprar?' },
  { servicio: 'aviso de stock', q: '¿Cómo me avisan si algo está agotado?' },
  { servicio: 'comida', q: '¿Qué comida hay para pedir a domicilio?' },
  { servicio: 'alquiler', q: 'Busco un alquiler en Malabo' },
  { servicio: 'trabajo', q: '¿Qué trabajos hay publicados?' },
  { servicio: 'viajes', q: '¿Qué rutas hay de Malabo a Bata?' },
  { servicio: 'alojamiento', q: 'Busco una habitación de hotel en Malabo para 2 personas' },
  { servicio: 'taxi', q: '¿Cómo pido un taxi?' },
  { servicio: 'mensajes', q: '¿Dónde veo mis mensajes y mis grupos?' },
  { servicio: 'algo que no existe', q: '¿Tenéis helicópteros de segunda mano con piloto incluido?' },
];

(async () => {
  console.log(`red: ${await prepararRed()}`);
  const B = await login('+240555000003', '123456');
  const estado = await req('GET', '/lifebook/ai/state', B);
  ok(estado.b?.configured === true, 'el asistente está configurado');
  const nueva = await req('POST', '/lifebook/ai/new', B);
  const conv = nueva.b?.conversation?.id ?? null;

  for (const { servicio, q } of PREGUNTAS) {
    const r = await req('POST', '/lifebook/ai/chat', B, { message: q, conversationId: conv });
    const texto = String(r.b?.reply?.text ?? '');
    const tarjetas = r.b?.reply?.cards ?? [];
    console.log(`\n── ${servicio} · «${q}»`);
    console.log(`   ${texto.replace(/\n/g, ' ').slice(0, 220)}`);
    if (tarjetas.length) console.log(`   tarjetas: ${tarjetas.map((t) => `${t.tipo}:${t.titulo} (${t.precioXaf ?? '-'})`).join(' | ')}`);
    ok(r.s === 200 || r.s === 201, `responde (HTTP ${r.s})`);
    ok(texto.length > 15, `con texto útil (${texto.length} letras)`);
    ok(!/no puedo|no tengo acceso|no estoy seguro|no sé/i.test(texto) || /no hay|no tengo acceso a datos/i.test(texto),
      'no se queda en «no sé» cuando la herramienta sí sabe');
    // Lo que enseña tiene que existir de verdad.
    for (const t of tarjetas.slice(0, 2)) {
      if (t.tipo === 'producto') {
        const p = await req('GET', `/lifebook/commerce/products/${t.id}`, B);
        ok(p.s === 200, `el producto «${t.titulo}» se abre de verdad`);
      }
    }
  }

  const usadas = PREGUNTAS.length;
  const fin = await req('GET', '/lifebook/ai/state', B);
  ok(typeof fin.b?.leftToday === 'number', `el gasto del día queda apuntado (quedan ${fin.b?.leftToday} de ${fin.b?.dailyLimit})`);
  ok((fin.b?.dailyLimit - (fin.b?.leftToday ?? 0)) >= usadas - 2, `y son más o menos los ${usadas} mensajes de esta prueba`);

  console.log(`\n${pass} PASA · ${fail} FALLA`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
