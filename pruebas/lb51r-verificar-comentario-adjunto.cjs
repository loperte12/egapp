// lb51r-verificar-comentario-adjunto.cjs — verificación END-TO-END del comentario
// con publicación adjunta (una nota, un vídeo, una venta…) contra la API REAL.
//
// Lo que comprueba, con datos de verdad (nada simulado):
//   · adjuntar en un comentario y en una RESPUESTA, y que la tarjeta llegue con
//     id, tipo, título, miniatura y AUTOR;
//   · adjuntar un VÍDEO que ya existe (el caso del feed de vídeos);
//   · VISIBILIDAD: si quien mira no puede ver la publicación adjunta, no se le
//     manda la tarjeta NI el título (era el riesgo real de esta función);
//   · no se puede adjuntar lo que no ves, ni la publicación que estás comentando,
//     ni un id mal formado;
//   · el texto sigue siendo obligatorio;
//   · adjuntar NO avisa a quien escribió lo adjunto (si avisara, sería spam);
//   · si borran la publicación adjunta, el comentario SOBREVIVE como texto.
//
// Crea sus propios datos y los borra al final pase lo que pase.
const API = 'https://hk.egrouteplan.com/wallet/api/v1';

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { __crudo: t.slice(0, 160) }; } };
const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  }));
  if (!r.accessToken) throw new Error(`login ${phone} falló: ${JSON.stringify(r).slice(0, 140)}`);
  const me = await j(await fetch(`${API}/mobility/auth/me`, { headers: { Authorization: `Bearer ${r.accessToken}` } }));
  return { tok: r.accessToken, id: me.id, nombre: me.fullName };
};
const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });
const req = async (method, path, tok, body) => {
  const r = await fetch(`${API}${path}`, { method, headers: H(tok), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { s: r.status, b: await j(r) };
};
const errCode = (r) => r.b?.error?.code ?? r.b?.code ?? '(sin código)';

let pass = 0, fail = 0;
const ok = (cond, etq, extra = '') => {
  if (cond) { pass++; console.log(`  PASA   ${etq}`); }
  else { fail++; console.log(`  FALLA  ${etq}   ${extra}`); }
};

(async () => {
  const A = await login('+240222000123', 'MiClave123');
  const B = await login('+240555000003', '123456');
  console.log(`A = ${A.nombre}  B = ${B.nombre}`);

  const creados = [];
  const publicar = async (quien, extra) => {
    const r = await req('POST', '/lifebook/posts', quien.tok, {
      body: 'Publicación de prueba (adjuntos en comentarios)', title: 'PRUEBA ADJUNTO', city: 'Malabo', visibility: 'public', ...extra,
    });
    const id = r.b.id ?? r.b.post?.id;
    if (id) creados.push(id);
    return { s: r.s, id, b: r.b };
  };

  try {
    console.log('\n=== 1. PREPARAR: la publicación comentada y la que se adjunta ===');
    const P = await publicar(B);                    // la que se comenta (de B)
    const Q = await publicar(A);                    // la que se adjunta (de A)
    ok(!!P.id && !!Q.id, `dos publicaciones creadas (P=${P.id}, Q=${Q.id})`);

    console.log('\n=== 2. ADJUNTAR EN UN COMENTARIO ===');
    const antesA = (await req('GET', '/lifebook/me/inbox-counts', A.tok)).b;
    const c1 = await req('POST', `/lifebook/posts/${P.id}/comments`, A.tok, { text: 'Mira esto que publiqué', attachPostId: Q.id });
    ok(c1.s === 200 || c1.s === 201, `A comenta con adjunto (HTTP ${c1.s})`, JSON.stringify(c1.b).slice(0, 200));
    ok(c1.b.ref?.id === Q.id, `la respuesta trae la tarjeta del adjunto (${c1.b.ref?.id})`);
    ok(c1.b.ref?.type === 'note', `la tarjeta dice el tipo (${c1.b.ref?.type})`);
    ok(c1.b.ref?.author?.id === A.id, `la tarjeta dice DE QUIÉN es (${c1.b.ref?.author?.fullName})`);
    ok(typeof c1.b.ref?.title === 'string', `la tarjeta trae título ("${c1.b.ref?.title}")`);
    ok('preview' in (c1.b.ref ?? {}), 'la tarjeta trae un extracto para pintar');

    const lista = await req('GET', `/lifebook/posts/${P.id}/comments?limit=20`, A.tok);
    const elMio = (lista.b.comments ?? []).find((c) => c.id === c1.b.id);
    ok(!!elMio, 'el comentario aparece en la lista');
    ok(elMio?.ref?.id === Q.id, `y en la lista también viene la tarjeta (${elMio?.ref?.id})`);
    ok(elMio?.body === 'Mira esto que publiqué', 'el texto del comentario se conserva');

    console.log('\n=== 3. ADJUNTAR UN VÍDEO QUE YA EXISTE (el caso del feed) ===');
    // Los vídeos públicos de las cuentas de prueba los tiene A: se piden a su perfil
    // (el filtro `type` de la ruta no se usa aquí a propósito, se filtra al leer).
    const suyos = await req('GET', `/lifebook/users/${A.id}/posts?limit=20`, B.tok);
    const video = (suyos.b.posts ?? []).find((p) => p.type === 'video');
    ok(!!video, `hay un vídeo público de A para adjuntar (${video?.id})`, JSON.stringify(suyos.b).slice(0, 160));
    if (video) {
      // Lo adjunta B: así se prueba adjuntar una publicación DE OTRA PERSONA.
      const cv = await req('POST', `/lifebook/posts/${P.id}/comments`, B.tok, { text: 'Y este vídeo tuyo', attachPostId: video.id });
      ok(cv.b.ref?.id === video.id, `la tarjeta del vídeo llega (HTTP ${cv.s})`, JSON.stringify(cv.b).slice(0, 200));
      ok(cv.b.ref?.type === 'video', `con su tipo real (${cv.b.ref?.type})`);
      ok(cv.b.ref?.author?.id === A.id, `y con el autor del vídeo, no el de quien comenta (${cv.b.ref?.author?.fullName})`);
      ok(!!cv.b.ref?.thumb?.url, `y con miniatura (${String(cv.b.ref?.thumb?.url).slice(0, 60)})`);
    }

    console.log('\n=== 4. ADJUNTAR EN UNA RESPUESTA ===');
    const resp = await req('POST', `/lifebook/posts/${P.id}/comment`, B.tok, { body: 'Te respondo con la mía', parentId: c1.b.id, attachPostId: P.id === Q.id ? Q.id : Q.id });
    ok(resp.s === 200 || resp.s === 201, `B responde con adjunto (HTTP ${resp.s})`, JSON.stringify(resp.b).slice(0, 160));
    const rama = await req('GET', `/lifebook/comments/${c1.b.id}/replies`, A.tok);
    const miResp = (rama.b.replies ?? [])[0];
    ok(miResp?.ref?.id === Q.id, `la respuesta también lleva tarjeta (${miResp?.ref?.id})`);
    ok(miResp?.replyToName != null, `y sigue diciendo a quién responde (${miResp?.replyToName})`);

    console.log('\n=== 5. VISIBILIDAD (el riesgo de verdad) ===');
    const R = await publicar(A, { visibility: 'private' });   // privada de A
    ok(!!R.id, `A publica una nota PRIVADA (${R.id})`);
    const cPriv = await req('POST', `/lifebook/posts/${P.id}/comments`, A.tok, { text: 'Adjunto algo mío privado', attachPostId: R.id });
    ok(cPriv.b.ref?.id === R.id, 'A (dueña) SÍ ve la tarjeta de su nota privada');
    const listaB = await req('GET', `/lifebook/posts/${P.id}/comments?limit=20`, B.tok);
    const vistoPorB = (listaB.b.comments ?? []).find((c) => c.id === cPriv.b.id);
    ok(!!vistoPorB, 'B ve el comentario (el comentario es de una publicación pública)');
    ok(vistoPorB?.ref === null, `para B la tarjeta va VACÍA (ref=${JSON.stringify(vistoPorB?.ref)})`);
    ok(!JSON.stringify(vistoPorB ?? {}).includes('PRUEBA ADJUNTO'), 'y el título de la nota privada NO se filtra a B');

    console.log('\n=== 6. LO QUE NO SE PUEDE HACER ===');
    const noVeo = await req('POST', `/lifebook/posts/${P.id}/comments`, B.tok, { text: 'intento adjuntar lo que no veo', attachPostId: R.id });
    ok(noVeo.s === 404 && errCode(noVeo) === 'POST_NOT_FOUND', `adjuntar algo que no ves → 404 (${noVeo.s} ${errCode(noVeo)})`);
    const auto = await req('POST', `/lifebook/posts/${P.id}/comments`, B.tok, { text: 'me adjunto a mí misma', attachPostId: P.id });
    ok(auto.s === 400 && errCode(auto) === 'CANNOT_ATTACH_SELF', `adjuntar la publicación que comentas → 400 (${auto.s} ${errCode(auto)})`);
    const malo = await req('POST', `/lifebook/posts/${P.id}/comments`, B.tok, { text: 'id malo', attachPostId: 'no-es-uuid' });
    ok(malo.s === 400 && errCode(malo) === 'POST_ID_INVALID', `id mal formado → 400 (${malo.s} ${errCode(malo)})`);
    const sinTexto = await req('POST', `/lifebook/posts/${P.id}/comments`, B.tok, { text: '   ', attachPostId: Q.id });
    ok(sinTexto.s === 400 && errCode(sinTexto) === 'COMMENT_REQUIRED', `sin texto → 400 (${sinTexto.s} ${errCode(sinTexto)})`);

    console.log('\n=== 7. ADJUNTAR NO AVISA A QUIEN LO ESCRIBIÓ ===');
    // Se comparan los contadores ENTEROS. (La primera versión de esta prueba miraba
    // `total`, que la bandeja del Life Book no devuelve: comparaba `undefined` con
    // `undefined` y pasaba siempre — un falso positivo que se corrigió.)
    const despuesA = (await req('GET', '/lifebook/me/inbox-counts', A.tok)).b;
    ok(JSON.stringify(despuesA) === JSON.stringify(antesA),
      `la bandeja de A no cambia por adjuntar lo suyo (${JSON.stringify(antesA)} → ${JSON.stringify(despuesA)})`);
    ok(typeof antesA?.comments === 'number', 'la bandeja devuelve contadores de verdad (la prueba no compara basura)');

    console.log('\n=== 8. SI BORRAN LA PUBLICACIÓN ADJUNTA, EL COMENTARIO SOBREVIVE ===');
    const del = await req('DELETE', `/lifebook/posts/${Q.id}`, A.tok);
    ok(del.s === 200 || del.s === 204, `A borra la publicación adjunta (HTTP ${del.s})`);
    const lista2 = await req('GET', `/lifebook/posts/${P.id}/comments?limit=20`, B.tok);
    const huerfano = (lista2.b.comments ?? []).find((c) => c.id === c1.b.id);
    ok(!!huerfano, 'el comentario sigue existiendo (no se borró con el original)');
    ok(huerfano?.body === 'Mira esto que publiqué', 'y conserva su texto');
    ok(huerfano?.ref === null, `y se queda sin tarjeta, sin enlace roto (ref=${JSON.stringify(huerfano?.ref)})`);

    console.log('\n=== 9. RELACIÓN CON LOS COMENTARIOS DE SIEMPRE ===');
    const total = await req('GET', `/lifebook/posts/${P.id}/comments?limit=20`, B.tok);
    ok(typeof total.b.total === 'number', `la lista sigue devolviendo total (${total.b.total})`);
    ok(total.b.comments.every((c) => 'ref' in c), 'TODOS los comentarios traen el campo ref (null si no hay adjunto)');
  } finally {
    console.log('\n=== limpieza ===');
    for (const id of creados.reverse()) {
      const r = await req('DELETE', `/lifebook/posts/${id}`, A.tok);
      const rb = await req('DELETE', `/lifebook/posts/${id}`, B.tok);
      console.log(`  borrada ${id}: ${r.s === 200 || r.s === 204 ? 'ok(A)' : ''}${rb.s === 200 || rb.s === 204 ? 'ok(B)' : ''}${r.s >= 400 && rb.s >= 400 ? ` (${r.s}/${rb.s})` : ''}`);
    }
  }

  console.log(`\n================ RESULTADO: ${pass} PASAN, ${fail} FALLAN ================`);
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('ERROR FATAL', e.message); process.exit(1); });
