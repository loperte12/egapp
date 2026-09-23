// lb51-prueba-get-post.cjs — GET /lifebook/posts/:id con entradas que NO llevan a ninguna parte.
//
// Dos defectos PREEXISTENTES (los encontró la Parte 50, no los introdujo; quedaron sin arreglar
// porque eran ajenos a aquel trabajo):
//
//   1. Una publicación que NO existe devolvía **200 con el cuerpo vacío**. La app no puede
//      distinguir «no existe» de «no me llegó nada», así que no puede decidir entre «esta
//      publicación se borró» y «algo falló al cargar».
//   2. Un id MAL FORMADO devolvía **500**: `${postId}::uuid` revienta en Postgres con 22P02
//      (`invalid input syntax for type uuid`). Un 500 en una ruta de LECTURA es ruido que tapa
//      fallos de verdad en los logs, y además es culpa de quien llama, no del servidor.
//
// Lo correcto: 404 y 400, con el mismo sobre de error que usa todo el API.
//
// El camino de BORRADO ya lo hacía bien (`deletePost` valida el uuid ANTES de tocar la base y
// lanza `POST_NOT_FOUND`), así que este script exige lo mismo por el camino de LECTURA.
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
  if (!r.cuerpo.accessToken) throw new Error(`login ${phone} falló: ${JSON.stringify(r.cuerpo).slice(0, 140)}`);
  return r.cuerpo.accessToken;
};
const H = (tok) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` });

(async () => {
  const tok = await login('+240222000123', 'MiClave123');
  console.log('INFO sesión lista\n');

  // ── CONTROL POSITIVO: una publicación que SÍ existe ──
  // Sin esto, un «404 para todo» también pasaría las pruebas de abajo. Es la prueba que
  // distingue «arreglado» de «roto de otra manera».
  const feed = await j(await fetch(`${LB}/posts/feed?channel=for_you&limit=1`, { headers: H(tok) }));
  const real = feed.cuerpo?.posts?.[0]?.id;
  if (!real) throw new Error(`no se pudo sacar un id real del feed: ${JSON.stringify(feed.cuerpo).slice(0, 200)}`);
  const rReal = await fetch(`${LB}/posts/${real}`, { headers: H(tok) });
  const cReal = await j(rReal);
  ok('una publicación que EXISTE sigue dando 200 con su id',
    rReal.status === 200 && (cReal.cuerpo?.id === real || cReal.cuerpo?.post?.id === real),
    `(HTTP ${rReal.status} · id ${cReal.cuerpo?.id ?? cReal.cuerpo?.post?.id ?? 'ninguno'})`);

  // ── DEFECTO 1: uuid válido que no existe ──
  const rFantasma = await fetch(`${LB}/posts/11111111-2222-4333-8444-555555555555`, { headers: H(tok) });
  const cFantasma = await j(rFantasma);
  ok('un id válido que NO existe da 404, no 200 con cuerpo vacío',
    rFantasma.status === 404 && cFantasma.cuerpo?.error?.code === 'POST_NOT_FOUND',
    `(HTTP ${rFantasma.status} · code ${cFantasma.cuerpo?.error?.code ?? '—'} · cuerpo ${cFantasma.texto.trim().length} bytes)`);

  // ── DEFECTO 2: id mal formado ──
  const rBasura = await fetch(`${LB}/posts/no-soy-un-uuid`, { headers: H(tok) });
  const cBasura = await j(rBasura);
  ok('un id MAL FORMADO da 400, no 500',
    rBasura.status === 400 && cBasura.cuerpo?.error?.code === 'POST_ID_INVALID',
    `(HTTP ${rBasura.status} · code ${cBasura.cuerpo?.error?.code ?? '—'})`);

  // ── Los dos errores deben llevar el sobre de la casa, que es lo que lee la app ──
  ok('los dos errores llevan { error: { code, message } }',
    !!cFantasma.cuerpo?.error?.code && !!cFantasma.cuerpo?.error?.message
    && !!cBasura.cuerpo?.error?.code && !!cBasura.cuerpo?.error?.message,
    `(fantasma: "${String(cFantasma.cuerpo?.error?.message ?? '').slice(0, 44)}")`);

  // ── Ninguna forma de id basura puede tumbar la ruta ──
  // «da 400» es lo observable; lo que de verdad importa aquí es que NINGUNA variante llegue a
  // lanzar la consulta contra Postgres, porque eso es lo que producía el 22P02 y el 500.
  const idsBasura = ['no-soy-un-uuid', '123', 'null', "1' OR '1'='1", 'NaN'];
  const estados = [];
  for (const malo of idsBasura) {
    const r = await fetch(`${LB}/posts/${encodeURIComponent(malo)}`, { headers: H(tok) });
    estados.push(`${JSON.stringify(malo)}→${r.status}`);
  }
  ok('ninguna forma de id basura produce un 5xx',
    !estados.some((e) => /→5\d\d$/.test(e)),
    `(${estados.join(' · ')})`);

  const fails = out.filter((l) => l.startsWith('FAIL')).length;
  console.log(`\n${out.length - fails}/${out.length} PASS${fails ? ` · ${fails} FAIL` : ''}`);
})().catch((e) => { console.error('PRUEBA ERROR', e); process.exit(1); });
