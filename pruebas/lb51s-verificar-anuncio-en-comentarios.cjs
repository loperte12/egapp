// lb51s-verificar-anuncio-en-comentarios.cjs — verificación END-TO-END de la
// PUBLICIDAD DENTRO DE LOS COMENTARIOS (lo de WeChat) contra la API real.
//
// Comprueba las reglas decididas, con datos de verdad:
//   · con menos de 3 comentarios NO hay anuncio (no se deja hueco);
//   · con 3 o más, el que mira (que NO es el autor) recibe UN anuncio en el campo
//     `ad` de la primera página, con su etiqueta y su destino;
//   · el AUTOR de la publicación NO ve anuncio en su propia casa;
//   · con los comentarios cerrados, tampoco;
//   · al paginar (con cursor) no vuelve a aparecer;
//   · el anuncio NO cuenta como comentario (`total` es el de comentarios);
//   · el anuncio es de la CIUDAD de quien mira;
//   · los contadores de impresión y clic se mueven de verdad (los mismos endpoints
//     que usa el banner del Home).
const API = 'https://hk.egrouteplan.com/wallet/api/v1';
const ADS = 'https://hk.egrouteplan.com/api';

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { __crudo: t.slice(0, 160) }; } };
const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  }));
  if (!r.accessToken) throw new Error(`login ${phone} falló: ${JSON.stringify(r).slice(0, 140)}`);
  const me = await j(await fetch(`${API}/mobility/auth/me`, { headers: { Authorization: `Bearer ${r.accessToken}` } }));
  // OJO: se devuelve el TOKEN en `tok`. Pasar el objeto entero a `req()` manda
  // "Bearer [object Object]" y todo falla con 401 — me pasó al escribir esto.
  return { tok: r.accessToken, id: me.id, nombre: me.fullName, ciudad: me.city };
};
const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
const req = async (method, path, tok, body) => {
  const r = await fetch(`${API}${path}`, { method, headers: H(tok), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { s: r.status, b: await j(r) };
};

let pass = 0, fail = 0;
const ok = (cond, etq, extra = '') => {
  if (cond) { pass++; console.log(`  PASA   ${etq}`); }
  else { fail++; console.log(`  FALLA  ${etq}   ${extra}`); }
};

(async () => {
  const A = await login('+240222000123', 'MiClave123');   // NO será el autor
  const B = await login('+240555000003', '123456');       // autor de la publicación
  console.log(`A (mirón) = ${A.nombre} · ciudad=${A.ciudad ?? '—'}`);
  console.log(`B (autor)  = ${B.nombre}`);

  let postId = null;
  try {
    console.log('\n=== 1. LA PUBLICACIÓN DE B, CON POQUITOS COMENTARIOS ===');
    const pub = await req('POST', '/lifebook/posts', B.tok, {
      body: 'Publicación de prueba (publicidad en comentarios)', title: 'PRUEBA PUBLICIDAD', city: 'Malabo', visibility: 'public',
    });
    postId = pub.b.id ?? pub.b.post?.id;
    ok(!!postId, `publicación creada (${postId})`, `HTTP ${pub.s} ${JSON.stringify(pub.b).slice(0, 160)}`);
    if (!postId) throw new Error('sin publicación no se puede seguir');

    const c1 = await req('POST', `/lifebook/posts/${postId}/comments`, A.tok, { text: 'comentario 1' });
    ok(c1.s === 200 || c1.s === 201, `A comenta (HTTP ${c1.s})`, JSON.stringify(c1.b).slice(0, 120));
    let p = await req('GET', `/lifebook/posts/${postId}/comments?limit=20`, A.tok);
    ok(p.b.total === 1, `con 1 comentario, total=1 (${p.b.total})`);
    ok(p.b.ad === null, `con 1 comentario NO hay anuncio (ad=${JSON.stringify(p.b.ad)})`);

    await req('POST', `/lifebook/posts/${postId}/comments`, B.tok, { text: 'comentario 2' });
    p = await req('GET', `/lifebook/posts/${postId}/comments?limit=20`, A.tok);
    ok(p.b.ad === null, `con 2 comentarios tampoco hay anuncio (ad=${JSON.stringify(p.b.ad)})`);

    console.log('\n=== 2. CON 3 COMENTARIOS, EL QUE MIRA RECIBE UN ANUNCIO ===');
    await req('POST', `/lifebook/posts/${postId}/comments`, A.tok, { text: 'comentario 3' });
    p = await req('GET', `/lifebook/posts/${postId}/comments?limit=20`, A.tok);
    const ad = p.b.ad;
    ok(!!ad, `hay anuncio (${JSON.stringify(ad).slice(0, 130)})`);
    ok(typeof ad?.id === 'string' && typeof ad?.title === 'string', 'el anuncio trae id y título');
    ok(!!(ad?.targetRoute || ad?.externalUrl), `trae a dónde lleva (${ad?.targetRoute ?? ad?.externalUrl})`);
    ok(!Array.isArray(ad?.cities) || ad.cities.length === 0 || ad.cities.includes(A.ciudad ?? 'Malabo'),
      `el anuncio es de la ciudad del que mira (${JSON.stringify(ad?.cities)} vs ${A.ciudad})`);
    ok(typeof ad?.impressions === 'number' && typeof ad?.clicks === 'number', 'trae sus contadores de impresiones y clics');

    console.log('\n=== 3. EL ANUNCIO NO ES UN COMENTARIO ===');
    ok(p.b.total === 3, `total sigue siendo el de comentarios (${p.b.total}, no 4)`);
    ok(p.b.comments.every((c) => c.body && !c.ad), 'la lista `comments` solo trae comentarios');

    console.log('\n=== 4. EL AUTOR NO VE ANUNCIO EN SU PROPIA PUBLICACIÓN ===');
    const pb = await req('GET', `/lifebook/posts/${postId}/comments?limit=20`, B.tok);
    ok(pb.b.ad === null, `para el autor, ad=null (${JSON.stringify(pb.b.ad)})`);
    ok(pb.b.total === 3, 'y sigue viendo los 3 comentarios');

    console.log('\n=== 5. AL PAGINAR NO REAPARECE ===');
    const p1 = await req('GET', `/lifebook/posts/${postId}/comments?limit=2`, A.tok);
    ok(!!p1.b.nextCursor, `la primera página trae cursor (${p1.b.nextCursor})`);
    ok(!!p1.b.ad, 'y en esa primera página SÍ venía el anuncio');
    const p2 = await req('GET', `/lifebook/posts/${postId}/comments?limit=2&cursor=${encodeURIComponent(p1.b.nextCursor)}`, A.tok);
    ok(p2.b.ad === null, `la segunda página NO trae anuncio (ad=${JSON.stringify(p2.b.ad)})`);

    console.log('\n=== 6. CON LOS COMENTARIOS CERRADOS, TAMPOCO ===');
    const cerrar = await req('POST', `/lifebook/posts/${postId}/comments-state`, B.tok, { enabled: false });
    ok(cerrar.s === 200 || cerrar.s === 201, `B cierra los comentarios (HTTP ${cerrar.s})`);
    const pCerrado = await req('GET', `/lifebook/posts/${postId}/comments?limit=20`, A.tok);
    ok(pCerrado.b.ad === null, `sin conversación no hay publicidad (ad=${JSON.stringify(pCerrado.b.ad)})`);
    await req('POST', `/lifebook/posts/${postId}/comments-state`, B.tok, { enabled: true });

    console.log('\n=== 7. LOS CONTADORES SE MUEVEN (los mismos del Home) ===');
    const antes = await j(await fetch(`${ADS}/ads?city=Malabo`));
    const filaAntes = (Array.isArray(antes) ? antes : []).find((x) => x.id === ad.id);
    await fetch(`${ADS}/ads/${ad.id}/impression`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await fetch(`${ADS}/ads/${ad.id}/click`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const despues = await j(await fetch(`${ADS}/ads?city=Malabo`));
    const filaDespues = (Array.isArray(despues) ? despues : []).find((x) => x.id === ad.id);
    ok(!!filaAntes && !!filaDespues, 'el anuncio se puede leer en el listado público');
    ok(filaDespues?.impressions === filaAntes?.impressions + 1,
      `la impresión se cuenta (+1: ${filaAntes?.impressions} → ${filaDespues?.impressions})`);
    ok(filaDespues?.clicks === filaAntes?.clicks + 1,
      `el clic se cuenta (+1: ${filaAntes?.clicks} → ${filaDespues?.clicks})`);
  } finally {
    if (postId) {
      const del = await req('DELETE', `/lifebook/posts/${postId}`, B.tok);
      console.log(`\n=== limpieza: publicación de prueba borrada (HTTP ${del.s}) ===`);
    }
  }

  console.log(`\n================ RESULTADO: ${pass} PASAN, ${fail} FALLAN ================`);
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('ERROR FATAL', e.message); process.exit(1); });
