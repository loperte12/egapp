// lb51n-prueba-responder-comentario.cjs — ¿una RESPUESTA se guarda como respuesta o como
// comentario suelto?
//
// SÍNTOMA reportado por el dueño: al responder a un comentario, en vez de quedar como
// respuesta a esa persona, aparece como un comentario propio nuevo.
//
// La app manda `POST /lifebook/posts/:id/comments { text, parentId }` (está en
// `api/lifebook.ts:970` y lo llama `CommentsSheet.submitReply`). Si el servidor ignora
// `parentId`, la respuesta nace como comentario de primer nivel y el síntoma es exactamente
// el descrito.
//
// Este script lo distingue por API, sin tocar el servidor:
//   1. crea un comentario raíz;
//   2. crea una RESPUESTA a ese raíz (con parentId);
//   3. mira si la respuesta sale en la lista de comentarios RAÍZ  → parentId ignorado;
//   4. mira si sale en /comments/:id/replies                       → parentId respetado.
// Y limpia lo que crea.
const API = 'https://hk.egrouteplan.com/wallet/api/v1';
const LB = `${API}/lifebook`;

const j = async (r) => {
  const t = await r.text();
  try { return { cuerpo: JSON.parse(t || '{}'), texto: t }; }
  catch { return { cuerpo: { crudo: t.slice(0, 200) }, texto: t }; }
};
const out = [];
const ok = (n, cond, extra = '') => {
  const l = `${cond ? 'PASS' : 'FAIL'} ${n}${extra ? ` ${extra}` : ''}`;
  out.push(l); console.log(l); if (!cond) process.exitCode = 1;
};
const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  }));
  if (!r.cuerpo.accessToken) throw new Error(`login falló: ${JSON.stringify(r.cuerpo).slice(0, 140)}`);
  return r.cuerpo.accessToken;
};
const H = (tok) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` });

(async () => {
  const tok = await login('+240222000123', 'MiClave123');
  const marca = Date.now().toString().slice(-6);

  // Un post que exista y tenga los comentarios abiertos.
  const feed = await j(await fetch(`${LB}/posts/feed?channel=for_you&limit=40`, { headers: H(tok) }));
  const post = (feed.cuerpo.posts || []).find((p) => Number(p.stats?.comments) > 0) || (feed.cuerpo.posts || [])[0];
  if (!post) throw new Error('no hay publicaciones en el feed');
  console.log(`INFO publicación ${post.id} ("${String(post.title ?? '').slice(0, 20)}")\n`);

  const crear = async (text, parentId) => {
    const r = await j(await fetch(`${LB}/posts/${post.id}/comments`, {
      method: 'POST', headers: H(tok),
      body: JSON.stringify(parentId ? { text, parentId } : { text }),
    }));
    return { status: r.cuerpo?.id ? 200 : 'SIN ID', id: r.cuerpo?.id ?? null, cuerpo: r.cuerpo };
  };

  const raizTxt = `RAIZ ${marca}`;
  const respTxt = `RESPUESTA ${marca}`;

  const raiz = await crear(raizTxt, null);
  ok('1. se puede crear un comentario raíz', !!raiz.id, `(id=${raiz.id ?? JSON.stringify(raiz.cuerpo).slice(0, 90)})`);
  if (!raiz.id) { console.log('\nNo se puede seguir sin el raíz.'); return; }

  const resp = await crear(respTxt, raiz.id);
  ok('2. el servidor ACEPTA crear una respuesta con parentId', !!resp.id,
    `(id=${resp.id ?? JSON.stringify(resp.cuerpo).slice(0, 90)})`);

  // ── ¿Dónde acabó la respuesta? ──
  const planos = await j(await fetch(`${LB}/posts/${post.id}/comments?limit=60`, { headers: H(tok) }));
  const lista = planos.cuerpo.comments ?? planos.cuerpo ?? [];
  const raices = Array.isArray(lista) ? lista : [];
  const respComoRaiz = raices.find((c) => c.body === respTxt || c.text === respTxt);
  ok('3. la respuesta NO aparece como comentario de primer nivel', !respComoRaiz,
    respComoRaiz ? `(SALE COMO RAÍZ: id=${respComoRaiz.id} parentId=${respComoRaiz.parentId ?? '—'})` : '(bien)');

  const hijas = await j(await fetch(`${LB}/comments/${raiz.id}/replies?limit=50`, { headers: H(tok) }));
  const listaHijas = hijas.cuerpo.replies ?? hijas.cuerpo ?? [];
  const enHijas = (Array.isArray(listaHijas) ? listaHijas : []).find((c) => c.body === respTxt || c.text === respTxt);
  ok('4. la respuesta SÍ aparece colgando del comentario al que responde', !!enHijas,
    enHijas ? '(bien)' : `(total=${hijas.cuerpo.total ?? '—'}, no está)`);

  if (respComoRaiz && !enHijas) {
    console.log('\n>>> DIAGNÓSTICO: el servidor IGNORA `parentId` — la respuesta se guarda como');
    console.log('>>> comentario suelto. Es exactamente el síntoma reportado.');
  } else if (respComoRaiz && enHijas) {
    console.log('\n>>> DIAGNÓSTICO: se guarda bien, pero la lista de primer nivel NO filtra las');
    console.log('>>> respuestas, así que se pintan también como comentarios sueltos.');
  } else if (!respComoRaiz && enHijas) {
    console.log('\n>>> El API se comporta BIEN: el fallo estaría en cómo lo pinta la app.');
  }

  // ── Limpieza ──
  if (resp.id) await fetch(`${LB}/comments/${resp.id}`, { method: 'DELETE', headers: H(tok) });
  await fetch(`${LB}/comments/${raiz.id}`, { method: 'DELETE', headers: H(tok) });
  console.log('\nINFO limpieza hecha (los dos comentarios de prueba borrados)');

  const fails = out.filter((l) => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - fails}/${out.length} PASS${fails ? ` · ${fails} FAIL` : ''}`);
})().catch((e) => { console.error('PRUEBA ERROR', e); process.exit(1); });
