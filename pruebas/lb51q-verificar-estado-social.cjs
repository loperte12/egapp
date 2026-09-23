// lb51q-verificar-estado-social.cjs — verificación END-TO-END de la capa social del
// estado 24 h (me gusta, comentarios, respuestas y avisos) contra la API REAL.
//
// Qué hace: dos cuentas de prueba (A = dueña del estado, B = quien interactúa) y
// recorre el ciclo completo: reaccionar, comentar, responder, dar me gusta a un
// comentario, los avisos de cada uno, los errores (400/403/404), las preferencias
// del autor (allow_reactions / allow_comments), los bloqueos y la CASCADA al
// terminar el estado.
//
// Al final escribe el id del estado en un fichero para poder comprobar en la base
// de datos que las filas se borraron de verdad (no solo que se oculten).
const fs = require('fs');
const API = 'https://hk.egrouteplan.com/wallet/api/v1';
const RUTA_ID = 'D:\\Temp\\eg-status\\ultimo-estado.txt';

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { __crudo: t.slice(0, 200) }; } };
const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  }));
  if (!r.accessToken) throw new Error(`login ${phone} falló: ${JSON.stringify(r).slice(0, 160)}`);
  return { tok: r.accessToken, id: r.user?.id ?? r.id ?? null, nombre: r.user?.fullName ?? r.fullName ?? null };
};
const H = (t) => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${t}` });

let pass = 0, fail = 0;
const ok = (cond, etq, extra = '') => {
  if (cond) { pass++; console.log(`  PASA   ${etq}`); }
  else { fail++; console.log(`  FALLA  ${etq}   ${extra}`); }
};
const req = async (method, path, tok, body) => {
  const r = await fetch(`${API}${path}`, {
    method, headers: H(tok),
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { s: r.status, b: await j(r) };
};
const errCode = (r) => r.b?.error?.code ?? r.b?.code ?? '(sin código)';

(async () => {
  console.log('=== 1. ENTRAR CON LAS DOS CUENTAS ===');
  const A = await login('+240222000123', 'MiClave123');   // dueña del estado
  const B = await login('+240555000003', '123456');       // quien interactúa
  const meA = await req('GET', '/mobility/auth/me', A.tok);
  const meB = await req('GET', '/mobility/auth/me', B.tok);
  A.id = meA.b.id; A.nombre = meA.b.fullName;
  B.id = meB.b.id; B.nombre = meB.b.fullName;
  console.log(`  A (dueña)      = ${A.nombre}  ${A.id}`);
  console.log(`  B (interactúa) = ${B.nombre}  ${B.id}`);
  ok(!!A.id && !!B.id, 'las dos sesiones tienen id');

  console.log('\n=== 2. PUBLICAR EL ESTADO DE A ===');
  const pre = await req('GET', '/mobility/status/presets', A.tok);
  const presets = Array.isArray(pre.b) ? pre.b : (pre.b.presets ?? []);
  ok(presets.length > 0, `hay presets (${presets.length})`);
  const presetCode = String(presets[0].code ?? presets[0].id);
  const pub = await req('POST', '/mobility/status/me', A.tok, {
    presetCode, text: 'Estado de prueba (capa social)', visibility: 'public',
  });
  ok(pub.s === 200 || pub.s === 201, `estado publicado (HTTP ${pub.s})`, JSON.stringify(pub.b).slice(0, 200));
  const S = pub.b.id ?? pub.b.status?.id;
  ok(!!S, `id del estado = ${S}`);
  if (!S) throw new Error('sin estado no se puede seguir');
  fs.writeFileSync(RUTA_ID, S, 'utf8');

  console.log('\n=== 3. EL ESTADO NACE SIN INTERACCIONES ===');
  const miEstado = await req('GET', '/mobility/status/me', A.tok);
  const st = miEstado.b.status;
  ok(!!st, 'GET /status/me devuelve el estado');
  ok(st.likeCount === 0 && st.commentCount === 0, `contadores en cero (like=${st.likeCount} comment=${st.commentCount})`);
  ok(st.likedByMe === false, 'likedByMe=false para el propio autor');
  ok(st.reactionsAllowed === true && st.commentsAllowed === true, 'el autor permite reacciones y comentarios');

  const verB = await req('GET', `/mobility/status/users/${A.id}`, B.tok);
  ok(verB.b.status?.id === S, 'B ve el estado de A');
  ok(typeof verB.b.status?.likeCount === 'number', 'el estado que ve B también trae contadores');

  console.log('\n=== 4. ME GUSTA ===');
  const r1 = await req('POST', `/mobility/status/${S}/reaction`, B.tok, {});
  ok(r1.s === 200 || r1.s === 201, `B reacciona (HTTP ${r1.s})`, JSON.stringify(r1.b).slice(0, 160));
  ok(r1.b.liked === true && r1.b.likeCount === 1, `liked=true y likeCount=1 (${JSON.stringify(r1.b).slice(0, 90)})`);
  ok(r1.b.likedByMe === true, 'para B, likedByMe=true');

  const r2 = await req('POST', `/mobility/status/${S}/reaction`, B.tok, { reaction: 'love' });
  ok(r2.b.likeCount === 1 && r2.b.reaction === 'love', `reaccionar otra vez NO duplica (likeCount=${r2.b.likeCount}, reaction=${r2.b.reaction})`);

  const r3 = await req('POST', `/mobility/status/${S}/reaction`, B.tok, { reaction: 'inventada' });
  ok(r3.b.reaction === 'like' && (r3.s === 200 || r3.s === 201), `reacción desconocida cae a 'like' (${r3.b.reaction}, HTTP ${r3.s})`);

  const verA = await req('GET', '/mobility/status/me', A.tok);
  ok(verA.b.status.likeCount === 1, `A ve 1 me gusta (${verA.b.status.likeCount})`);
  ok(verA.b.status.likedByMe === false, 'A NO aparece como si se hubiera dado me gusta a sí misma');

  const lista = await req('GET', `/mobility/status/${S}/reactions`, A.tok);
  ok(lista.b.total === 1 && lista.b.items?.[0]?.user?.id === B.id, `la lista de reacciones trae a B (${JSON.stringify(lista.b).slice(0, 140)})`);
  ok(lista.b.items?.[0]?.reaction === 'like', 'la reacción guardada es la última (like)');

  console.log('\n=== 5. AVISOS DE ME GUSTA (bandeja de A) ===');
  const c1 = await req('GET', '/mobility/status/me/inbox-counts', A.tok);
  ok(c1.b.likes === 1 && c1.b.total === 1, `A tiene 1 aviso de me gusta (${JSON.stringify(c1.b)})`);
  const rec1 = await req('GET', '/mobility/status/me/reactions-received', A.tok);
  ok(Array.isArray(rec1.b) && rec1.b.length === 1, `me/reactions-received trae 1 (${rec1.b.length})`);
  ok(rec1.b[0]?.user?.id === B.id && rec1.b[0]?.read === false, 'el aviso es de B y está sin leer');
  ok(rec1.b[0]?.status?.id === S && !!rec1.b[0]?.status?.preset?.code, 'el aviso incluye el resumen del estado');
  const c1b = await req('GET', '/mobility/status/me/inbox-counts', B.tok);
  ok(c1b.b.total === 0, `B no tiene avisos (no se avisa a uno mismo) (${JSON.stringify(c1b.b)})`);
  const leido = await req('POST', '/mobility/status/me/inbox/read', A.tok, { kind: 'likes' });
  ok(leido.b.ok === true && leido.b.marked === 1, `marcar leídos: marked=1 (${JSON.stringify(leido.b).slice(0, 90)})`);
  ok(leido.b.counts?.likes === 0, 'tras marcarlo, el contador queda a 0');
  const malKind = await req('POST', '/mobility/status/me/inbox/read', A.tok, { kind: 'loquesea' });
  ok(malKind.s === 400 && errCode(malKind) === 'INBOX_KIND_INVALID', `bandeja inválida → 400 INBOX_KIND_INVALID (${malKind.s} ${errCode(malKind)})`);

  console.log('\n=== 6. COMENTARIOS ===');
  const cmt = await req('POST', `/mobility/status/${S}/comments`, B.tok, { body: 'Qué buen estado, B escribiendo' });
  ok(cmt.s === 200 || cmt.s === 201, `B comenta (HTTP ${cmt.s})`, JSON.stringify(cmt.b).slice(0, 180));
  const C1 = cmt.b.id;
  ok(!!C1, `id del comentario = ${C1}`);
  ok(cmt.b.author?.id === B.id && cmt.b.mine === true, 'el comentario creado trae autor B y mine=true');
  ok(cmt.b.likes === 0 && cmt.b.repliesCount === 0 && cmt.b.likedByMe === false, 'el comentario nace sin me gusta ni respuestas');
  ok(cmt.b.editedAt === null || cmt.b.editedAt === undefined, 'editedAt va vacío (no hay edición)');

  const alias = await req('POST', `/mobility/status/${S}/comments`, B.tok, { text: 'Comentario con el alias text' });
  ok(alias.s === 200 || alias.s === 201, `el alias "text" también funciona (HTTP ${alias.s})`);
  const C2 = alias.b.id;

  const listaC = await req('GET', `/mobility/status/${S}/comments`, A.tok);
  ok(listaC.b.total === 2 && listaC.b.comments?.length === 2, `A ve 2 comentarios (${JSON.stringify(listaC.b).slice(0, 120)})`);
  ok(listaC.b.comments?.[0]?.createdAt <= listaC.b.comments?.[1]?.createdAt, 'los comentarios van del más antiguo al más nuevo');
  ok(listaC.b.comments?.[0]?.author?.fullName === B.nombre, 'el comentario trae el nombre del autor');
  ok(listaC.b.comments?.[0]?.mine === false, 'para A, los comentarios de B NO son suyos (mine=false)');
  ok(listaC.b.nextOffset === null, 'sin más páginas: nextOffset=null');

  const c2 = await req('GET', '/mobility/status/me/inbox-counts', A.tok);
  ok(c2.b.comments === 2, `A tiene 2 avisos de comentario (${c2.b.comments})`);
  const recC = await req('GET', '/mobility/status/me/comments-received', A.tok);
  ok(Array.isArray(recC.b) && recC.b.length === 2, `me/comments-received trae 2 (${recC.b.length})`);
  ok(recC.b[0]?.isReply === false && recC.b[0]?.user?.id === B.id, 'el comentario recibido no es respuesta y es de B');
  ok(recC.b[0]?.status?.id === S, 'el comentario recibido apunta al estado');
  const recCB = await req('GET', '/mobility/status/me/comments-received', B.tok);
  ok(recCB.b.length === 0, 'B no recibe sus propios comentarios como aviso');

  console.log('\n=== 7. RESPUESTAS A UN COMENTARIO ===');
  const resp = await req('POST', `/mobility/status/${S}/comments`, A.tok, { body: 'Gracias por comentar', parentId: C1 });
  ok(resp.s === 200 || resp.s === 201, `A responde al comentario de B (HTTP ${resp.s})`, JSON.stringify(resp.b).slice(0, 180));
  const R1 = resp.b.id;
  ok(resp.b.parentId === C1, `la respuesta cuelga del comentario raíz (parentId=${resp.b.parentId})`);

  const rama = await req('GET', `/mobility/status/comments/${C1}/replies`, B.tok);
  ok(rama.b.total === 1 && rama.b.replies?.[0]?.id === R1, `B ve 1 respuesta (${JSON.stringify(rama.b).slice(0, 140)})`);
  ok(rama.b.replyTo?.id === B.id, 'replyTo apunta a quien escribió el comentario raíz (B)');
  ok(rama.b.replies?.[0]?.replyToName === B.nombre, `la respuesta trae replyToName = ${rama.b.replies?.[0]?.replyToName}`);

  const listaC2 = await req('GET', `/mobility/status/${S}/comments`, A.tok);
  const raizC1 = listaC2.b.comments.find((c) => c.id === C1);
  ok(raizC1?.repliesCount === 1, `el comentario raíz cuenta 1 respuesta (${raizC1?.repliesCount})`);

  const cB = await req('GET', '/mobility/status/me/inbox-counts', B.tok);
  ok(cB.b.replies === 1, `B recibe el aviso de RESPUESTA (replies=${cB.b.replies})`);
  const recR = await req('GET', '/mobility/status/me/replies-received', B.tok);
  ok(recR.b.length === 1 && recR.b[0]?.isReply === true, `me/replies-received trae 1 (${recR.b.length})`);
  ok(recR.b[0]?.user?.id === A.id && recR.b[0]?.replyTo?.body?.includes('B escribiendo'), 'la respuesta es de A y cita mi comentario');
  const cA = await req('GET', '/mobility/status/me/inbox-counts', A.tok);
  ok(cA.b.replies === 0, `A NO se autoavisa de su propia respuesta (replies=${cA.b.replies})`);
  await req('POST', '/mobility/status/me/inbox/read', B.tok, { kind: 'replies' });

  console.log('\n=== 8. RESPONDER A UNA RESPUESTA (se aplana a un nivel) ===');
  const resp2 = await req('POST', `/mobility/status/${S}/comments`, B.tok, { body: 'Y yo te respondo a ti', parentId: R1 });
  ok(resp2.s === 200 || resp2.s === 201, `B responde a la respuesta de A (HTTP ${resp2.s})`, JSON.stringify(resp2.b).slice(0, 180));
  ok(resp2.b.parentId === C1, `NO se anida: cuelga de la raíz (parentId=${resp2.b.parentId}, respuesta a ${R1})`);
  const rama2 = await req('GET', `/mobility/status/comments/${C1}/replies`, A.tok);
  ok(rama2.b.total === 2, `la raíz ya tiene 2 respuestas (${rama2.b.total}) — ninguna queda invisible`);
  const cA2 = await req('GET', '/mobility/status/me/inbox-counts', A.tok);
  // A es el autor del estado Y la persona respondida: recibe UN aviso, no dos.
  // Llega por la bandeja `comments` (la fila del comentario) y no por `replies`.
  ok(cA2.b.replies === 0, `sin aviso duplicado en 'replies' (replies=${cA2.b.replies})`);
  ok(cA2.b.comments === 3, `el aviso llega por 'comments' (comments=${cA2.b.comments}: 2 comentarios + 1 respuesta)`);
  const recCA = await req('GET', '/mobility/status/me/comments-received', A.tok);
  ok(recCA.b.some((x) => x.id === resp2.b.id && x.isReply === true), 'la respuesta aparece en comments-received marcada isReply=true');

  console.log('\n=== 9. ME GUSTA EN UN COMENTARIO ===');
  const gl = await req('POST', `/mobility/status/comments/${R1}/like`, B.tok, {});
  ok(gl.b.liked === true && gl.b.likes === 1, `B da me gusta a la respuesta de A (${JSON.stringify(gl.b)})`);
  const cA3 = await req('GET', '/mobility/status/me/inbox-counts', A.tok);
  ok(cA3.b.commentLikes === 1, `A recibe aviso de me gusta en su comentario (commentLikes=${cA3.b.commentLikes})`);
  const recCL = await req('GET', '/mobility/status/me/comment-likes-received', A.tok);
  ok(recCL.b.length === 1 && recCL.b[0]?.user?.id === B.id, `me/comment-likes-received trae 1 de B (${recCL.b.length})`);
  ok(recCL.b[0]?.comment?.id === R1, 'el aviso apunta al comentario correcto');
  const listaC3 = await req('GET', `/mobility/status/comments/${C1}/replies`, B.tok);
  const r1vista = listaC3.b.replies.find((c) => c.id === R1);
  ok(r1vista?.likes === 1 && r1vista?.likedByMe === true, 'la respuesta muestra likes=1 y likedByMe=true para B');
  const ug = await req('DELETE', `/mobility/status/comments/${R1}/like`, B.tok);
  ok(ug.b.liked === false && ug.b.likes === 0, `quitar el me gusta (${JSON.stringify(ug.b)})`);
  const cA4 = await req('GET', '/mobility/status/me/inbox-counts', A.tok);
  ok(cA4.b.commentLikes === 0, 'el aviso desaparece al quitar el me gusta');

  console.log('\n=== 10. ERRORES: ids, textos y permisos ===');
  const malo = await req('GET', '/mobility/status/no-es-uuid/comments', A.tok);
  ok(malo.s === 400 && errCode(malo) === 'STATUS_ID_INVALID', `estado con id inválido → 400 (${malo.s} ${errCode(malo)})`);
  const noExiste = await req('GET', '/mobility/status/00000000-0000-0000-0000-000000000000/comments', A.tok);
  ok(noExiste.s === 404 && errCode(noExiste) === 'STATUS_NOT_FOUND', `estado inexistente → 404 (${noExiste.s} ${errCode(noExiste)})`);
  const maloR = await req('POST', '/mobility/status/no-es-uuid/reaction', B.tok, {});
  ok(maloR.s === 400 && errCode(maloR) === 'STATUS_ID_INVALID', `reaccionar a id inválido → 400 (${maloR.s} ${errCode(maloR)})`);
  const maloC = await req('GET', '/mobility/status/comments/no-es-uuid/replies', A.tok);
  ok(maloC.s === 400 && errCode(maloC) === 'COMMENT_ID_INVALID', `comentario con id inválido → 400 (${maloC.s} ${errCode(maloC)})`);
  const sinCuerpo = await req('POST', `/mobility/status/${S}/comments`, B.tok, { body: '   ' });
  ok(sinCuerpo.s === 400 && errCode(sinCuerpo) === 'COMMENT_REQUIRED', `comentario vacío → 400 (${sinCuerpo.s} ${errCode(sinCuerpo)})`);
  const largo = await req('POST', `/mobility/status/${S}/comments`, B.tok, { body: 'x'.repeat(501) });
  ok(largo.s === 400 && errCode(largo) === 'COMMENT_TOO_LONG', `comentario de 501 caracteres → 400 (${largo.s} ${errCode(largo)})`);
  const spam = await req('POST', `/mobility/status/${S}/comments`, B.tok, { body: 'llámame al +240555000003' });
  ok(spam.s === 400 && errCode(spam) === 'TEXT_FORBIDDEN', `teléfono en el comentario → 400 (${spam.s} ${errCode(spam)})`);
  const padreFalso = await req('POST', `/mobility/status/${S}/comments`, B.tok, { body: 'respuesta a nada', parentId: '00000000-0000-0000-0000-000000000000' });
  ok(padreFalso.s === 404 && errCode(padreFalso) === 'COMMENT_NOT_FOUND', `responder a un comentario inexistente → 404 (${padreFalso.s} ${errCode(padreFalso)})`);
  const padreMalo = await req('POST', `/mobility/status/${S}/comments`, B.tok, { body: 'respuesta a basura', parentId: 'no-es-uuid' });
  ok(padreMalo.s === 400 && errCode(padreMalo) === 'COMMENT_ID_INVALID', `responder con un parentId mal formado → 400 (${padreMalo.s} ${errCode(padreMalo)})`);
  const borrarAjeno = await req('DELETE', `/mobility/status/comments/${R1}`, B.tok);
  ok(borrarAjeno.s === 403 && errCode(borrarAjeno) === 'COMMENT_FORBIDDEN', `B no puede borrar el comentario de A → 403 (${borrarAjeno.s} ${errCode(borrarAjeno)})`);

  // Comentario de OTRO estado: responder con un padre que no es de este estado.
  const pubB = await req('POST', '/mobility/status/me', B.tok, { presetCode, text: 'Estado de B', visibility: 'public' });
  const SB = pubB.b.id ?? pubB.b.status?.id;
  ok(!!SB, `B publica su propio estado (${SB})`);
  const cruzado = await req('POST', `/mobility/status/${SB}/comments`, A.tok, { body: 'respuesta cruzada', parentId: C1 });
  ok(cruzado.s === 404 && errCode(cruzado) === 'COMMENT_NOT_FOUND', `responder con un comentario de OTRO estado → 404 (${cruzado.s} ${errCode(cruzado)})`);

  console.log('\n=== 11. PREFERENCIAS DEL AUTOR (allow_reactions / allow_comments) ===');
  const prefs0 = await req('GET', '/mobility/status/prefs', A.tok);
  ok(prefs0.b.allowComments === true, `GET prefs ya devuelve allowComments (${prefs0.b.allowComments})`);
  await req('PATCH', '/mobility/status/prefs', A.tok, { allowReactions: false });
  const sinReac = await req('POST', `/mobility/status/${S}/reaction`, B.tok, {});
  ok(sinReac.s === 400 && errCode(sinReac) === 'REACTIONS_DISABLED', `con las reacciones apagadas → 400 REACTIONS_DISABLED (${sinReac.s} ${errCode(sinReac)})`);
  const veSinReac = await req('GET', `/mobility/status/users/${A.id}`, B.tok);
  ok(veSinReac.b.status?.reactionsAllowed === false, 'el visor sabe que las reacciones están apagadas');
  const comentaIgual = await req('POST', `/mobility/status/${S}/comments`, B.tok, { body: 'comentar sigue permitido' });
  ok(comentaIgual.s === 200 || comentaIgual.s === 201, `apagar reacciones NO apaga los comentarios (HTTP ${comentaIgual.s})`);
  await req('PATCH', '/mobility/status/prefs', A.tok, { allowReactions: true, allowComments: false });
  const sinCom = await req('POST', `/mobility/status/${S}/comments`, B.tok, { body: 'esto no debería entrar' });
  ok(sinCom.s === 400 && errCode(sinCom) === 'COMMENTS_DISABLED', `con los comentarios apagados → 400 COMMENTS_DISABLED (${sinCom.s} ${errCode(sinCom)})`);
  const reaccionaIgual = await req('POST', `/mobility/status/${S}/reaction`, B.tok, {});
  ok(reaccionaIgual.s === 200 || reaccionaIgual.s === 201, `apagar comentarios NO apaga las reacciones (HTTP ${reaccionaIgual.s})`);
  const comentaAutor = await req('POST', `/mobility/status/${S}/comments`, A.tok, { body: 'la dueña sí puede escribir en lo suyo' });
  ok(comentaAutor.s === 200 || comentaAutor.s === 201, `el autor siempre puede comentar (HTTP ${comentaAutor.s})`);
  const prefs1 = await req('PATCH', '/mobility/status/prefs', A.tok, { allowReactions: true, allowComments: true });
  ok(prefs1.b.allowComments === true && prefs1.b.allowReactions === true, 'preferencias restauradas');

  console.log('\n=== 12. BLOQUEOS ===');
  const bloq = await req('POST', `/lifebook/users/${B.id}/block`, A.tok, {});
  ok(bloq.s === 200 || bloq.s === 201, `A bloquea a B (HTTP ${bloq.s})`, JSON.stringify(bloq.b).slice(0, 120));
  const reacBloq = await req('POST', `/mobility/status/${S}/reaction`, B.tok, {});
  ok(reacBloq.s === 403 && errCode(reacBloq) === 'USER_BLOCKED', `B bloqueado no puede reaccionar → 403 (${reacBloq.s} ${errCode(reacBloq)})`);
  const comBloq = await req('POST', `/mobility/status/${S}/comments`, B.tok, { body: 'bloqueado' });
  ok(comBloq.s === 403 && errCode(comBloq) === 'USER_BLOCKED', `B bloqueado no puede comentar → 403 (${comBloq.s} ${errCode(comBloq)})`);
  const desbloq = await req('DELETE', `/lifebook/users/${B.id}/block`, A.tok);
  ok(desbloq.s === 200 || desbloq.s === 204, `A desbloquea a B (HTTP ${desbloq.s})`);
  const reacOk = await req('POST', `/mobility/status/${S}/reaction`, B.tok, {});
  ok(reacOk.s === 200 || reacOk.s === 201, `tras desbloquear, B vuelve a poder reaccionar (HTTP ${reacOk.s})`);

  console.log('\n=== 13. BORRAR COMENTARIOS (y que se lleve las respuestas) ===');
  const borrado = await req('DELETE', `/mobility/status/comments/${C1}`, A.tok);
  ok(borrado.b.deleted === true, `la dueña borra el comentario de B (${JSON.stringify(borrado.b)})`);
  const rama3 = await req('GET', `/mobility/status/comments/${C1}/replies`, A.tok);
  ok(rama3.s === 404, `sus 2 respuestas desaparecieron con él (HTTP ${rama3.s})`);
  const listaC4 = await req('GET', `/mobility/status/${S}/comments`, A.tok);
  ok(!listaC4.b.comments.some((c) => c.id === C1), 'el comentario ya no está en la lista');

  console.log('\n=== 13b. MODERACIÓN: UN ADMIN BORRA UN COMENTARIO AJENO ===');
  const ADMIN = await login('+240999888777', '123456');
  const meAdmin = await req('GET', '/mobility/auth/me', ADMIN.tok);
  ADMIN.id = meAdmin.b.id; ADMIN.nombre = meAdmin.b.fullName;
  console.log(`  admin = ${ADMIN.nombre}  ${ADMIN.id}  rol=${meAdmin.b.role ?? '—'}`);
  ok(!!ADMIN.id && ADMIN.id !== A.id && ADMIN.id !== B.id, 'el admin es una tercera cuenta distinta');
  const suyoA = await req('POST', `/mobility/status/${S}/comments`, A.tok, { body: 'comentario de la dueña para moderar' });
  ok(suyoA.s === 200 || suyoA.s === 201, `la dueña escribe un comentario (HTTP ${suyoA.s})`);
  const adminBorra = await req('DELETE', `/mobility/status/comments/${suyoA.b.id}`, ADMIN.tok);
  ok(adminBorra.b.deleted === true, `un moderador borra un comentario ajeno (${JSON.stringify(adminBorra.b).slice(0, 100)})`);
  const listaTrasAdmin = await req('GET', `/mobility/status/${S}/comments`, A.tok);
  ok(!listaTrasAdmin.b.comments.some((c) => c.id === suyoA.b.id), 'el comentario borrado por el moderador ya no está');

  console.log('\n=== 14. CASCADA: EL ESTADO SE LLEVA TODO ===');
  const antes = await req('GET', `/mobility/status/${S}/comments`, A.tok);
  ok(antes.b.total > 0, `antes de terminar quedan ${antes.b.total} comentarios y ${(await req('GET', `/mobility/status/${S}/reactions`, A.tok)).b.total} reacciones`);
  const fin = await req('POST', '/mobility/status/me/end', A.tok, {});
  ok(fin.s === 200 || fin.s === 201, `A termina su estado (HTTP ${fin.s})`);
  const trasCom = await req('GET', `/mobility/status/${S}/comments`, A.tok);
  ok(trasCom.s === 404 && errCode(trasCom) === 'STATUS_NOT_FOUND', `los comentarios del estado terminado → 404 (${trasCom.s} ${errCode(trasCom)})`);
  const trasReac = await req('POST', `/mobility/status/${S}/reaction`, B.tok, {});
  ok(trasReac.s === 404, `ya no se puede reaccionar a un estado terminado (HTTP ${trasReac.s})`);
  const finB = await req('POST', '/mobility/status/me/end', B.tok, {});
  ok(finB.s === 200 || finB.s === 201, 'el estado de B también se termina (limpieza)');

  console.log(`\n================ RESULTADO: ${pass} PASAN, ${fail} FALLAN ================`);
  console.log(`id del estado de prueba (para comprobar la cascada en la BD): ${S}`);
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('ERROR FATAL', e.message); process.exit(1); });
