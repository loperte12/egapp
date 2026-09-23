// lb51t-verificar-seguir-viendo.cjs — verificación END-TO-END del progreso de
// reproducción («seguir viendo») contra la API real.
//
// Comprueba las reglas decididas:
//   · guardar y leer el progreso de un vídeo;
//   · «Seguir viendo» trae el vídeo con su porcentaje;
//   · NO trae lo que apenas se empezó (<5 s) ni lo que ya se terminó (>=90 %);
//   · los valores se acotan (una posición mayor que la duración no se guarda así);
//   · no se puede guardar progreso de algo que no puedes ver, ni de un id mal formado;
//   · borrar el progreso lo saca de la lista y deja el vídeo por el principio.
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
const enLista = (lista, id) => (Array.isArray(lista) ? lista : []).some((x) => x.id === id);

(async () => {
  const A = await login('+240222000123', 'MiClave123');
  const B = await login('+240555000003', '123456');
  console.log(`A = ${A.nombre}   B = ${B.nombre}`);

  console.log('\n=== 1. UN VÍDEO REAL PARA PROBAR ===');
  const suyos = await req('GET', `/lifebook/users/${A.id}/posts?limit=20`, A.tok);
  const video = (suyos.b.posts ?? []).find((p) => p.type === 'video');
  ok(!!video, `hay un vídeo de A (${video?.id})`, JSON.stringify(suyos.b).slice(0, 160));
  if (!video) throw new Error('sin vídeo no se puede probar');
  const V = video.id;

  console.log('\n=== 2. GUARDAR Y LEER EL PROGRESO ===');
  const antes = await req('GET', `/lifebook/watch/${V}`, A.tok);
  ok(antes.s === 200 && antes.b.positionSec === 0, `sin progreso, empieza por 0 (${JSON.stringify(antes.b)})`);

  const guardado = await req('POST', `/lifebook/watch/${V}`, A.tok, { positionSec: 60, durationSec: 600 });
  ok(guardado.s === 200 || guardado.s === 201, `se guarda el progreso (HTTP ${guardado.s})`, JSON.stringify(guardado.b).slice(0, 140));
  const leido = await req('GET', `/lifebook/watch/${V}`, A.tok);
  ok(leido.b.positionSec === 60 && leido.b.durationSec === 600, `se lee lo guardado (${leido.b.positionSec}/${leido.b.durationSec})`);
  ok(!!leido.b.updatedAt, `con marca de tiempo (${leido.b.updatedAt})`);

  console.log('\n=== 3. «SEGUIR VIENDO» LO TRAE CON SU PORCENTAJE ===');
  let lista = await req('GET', '/lifebook/me/continue-watching', A.tok);
  ok(enLista(lista.b, V), `el vídeo está en la lista (${lista.b.length} elemento(s))`);
  const fila = (lista.b ?? []).find((x) => x.id === V);
  ok(fila?.percent === 10, `el porcentaje es el correcto (${fila?.percent} %)`);
  ok(!!fila?.title || !!fila?.thumb, 'la tarjeta trae título o miniatura para pintarla');
  ok(fila?.author?.id === A.id, 'y trae de quién es el vídeo');

  console.log('\n=== 4. LO QUE NO SALE EN LA LISTA ===');
  await req('POST', `/lifebook/watch/${V}`, A.tok, { positionSec: 3, durationSec: 600 });
  lista = await req('GET', '/lifebook/me/continue-watching', A.tok);
  ok(!enLista(lista.b, V), 'un vídeo de 3 segundos NO sale (no cuenta como empezado)');

  await req('POST', `/lifebook/watch/${V}`, A.tok, { positionSec: 580, durationSec: 600 });
  lista = await req('GET', '/lifebook/me/continue-watching', A.tok);
  ok(!enLista(lista.b, V), 'un vídeo al 96 % NO sale (está terminado)');
  const sigueGuardado = await req('GET', `/lifebook/watch/${V}`, A.tok);
  ok(sigueGuardado.b.positionSec === 580, 'pero el progreso sigue guardado (no se borra al terminar)');

  const otraVez = await req('POST', `/lifebook/watch/${V}`, A.tok, { positionSec: 60, durationSec: 600 });
  ok(otraVez.b.positionSec === 60, `volver a guardar es idempotente (${otraVez.b.positionSec})`);
  lista = await req('GET', '/lifebook/me/continue-watching', A.tok);
  ok(enLista(lista.b, V), 'y vuelve a la lista');

  console.log('\n=== 5. LOS VALORES SE ACOTAN ===');
  const loco = await req('POST', `/lifebook/watch/${V}`, A.tok, { positionSec: 999999, durationSec: 600 });
  ok(loco.b.positionSec === 600, `una posición mayor que la duración se acota (${loco.b.positionSec})`);
  const negativo = await req('POST', `/lifebook/watch/${V}`, A.tok, { positionSec: -50, durationSec: 600 });
  ok(negativo.b.positionSec === 0, `una posición negativa se acota a 0 (${negativo.b.positionSec})`);
  const basura = await req('POST', `/lifebook/watch/${V}`, A.tok, { positionSec: 'no soy un número', durationSec: null });
  ok(basura.b.positionSec === 0, `basura en vez de números no revienta (${JSON.stringify(basura.b)})`);

  console.log('\n=== 6. LO QUE NO SE PUEDE HACER ===');
  const malo = await req('POST', '/lifebook/watch/no-es-uuid', A.tok, { positionSec: 10, durationSec: 100 });
  ok(malo.s === 400 && errCode(malo) === 'POST_ID_INVALID', `id mal formado → 400 (${malo.s} ${errCode(malo)})`);
  const noExiste = await req('POST', '/lifebook/watch/00000000-0000-0000-0000-000000000000', A.tok, { positionSec: 10, durationSec: 100 });
  ok(noExiste.s === 404, `vídeo inexistente → 404 (${noExiste.s})`);

  // Una publicación privada de B: A no la ve, así que no puede guardar progreso en ella.
  const privada = await req('POST', '/lifebook/posts', B.tok, { body: 'vídeo privado de prueba', title: 'PRIVADA WATCH', city: 'Malabo', visibility: 'private' });
  const P = privada.b.id ?? privada.b.post?.id;
  ok(!!P, `B publica algo privado (${P})`);
  const ajeno = await req('POST', `/lifebook/watch/${P}`, A.tok, { positionSec: 10, durationSec: 100 });
  ok(ajeno.s === 404, `no se puede guardar progreso de algo que no ves → 404 (${ajeno.s})`);
  await req('DELETE', `/lifebook/posts/${P}`, B.tok);

  console.log('\n=== 7. BORRAR EL PROGRESO ===');
  await req('POST', `/lifebook/watch/${V}`, A.tok, { positionSec: 60, durationSec: 600 });
  const borrado = await req('DELETE', `/lifebook/watch/${V}`, A.tok);
  ok(borrado.s === 200 || borrado.s === 204, `se borra (HTTP ${borrado.s})`);
  const trasBorrar = await req('GET', `/lifebook/watch/${V}`, A.tok);
  ok(trasBorrar.b.positionSec === 0, `el vídeo vuelve a empezar por el principio (${trasBorrar.b.positionSec})`);
  lista = await req('GET', '/lifebook/me/continue-watching', A.tok);
  ok(!enLista(lista.b, V), 'y ya no está en «seguir viendo»');

  console.log('\n=== 8. EL PROGRESO ES DE CADA PERSONA ===');
  await req('POST', `/lifebook/watch/${V}`, A.tok, { positionSec: 120, durationSec: 600 });
  const deB = await req('GET', `/lifebook/watch/${V}`, B.tok);
  ok(deB.b.positionSec === 0, `B no ve el progreso de A (${deB.b.positionSec})`);
  const listaB = await req('GET', '/lifebook/me/continue-watching', B.tok);
  ok(!enLista(listaB.b, V), 'ni le aparece en su lista');
  await req('DELETE', `/lifebook/watch/${V}`, A.tok);
  console.log('\n=== limpieza: progreso de prueba borrado ===');

  console.log(`\n================ RESULTADO: ${pass} PASAN, ${fail} FALLAN ================`);
  process.exitCode = fail === 0 ? 0 : 1;
})().catch((e) => { console.error('ERROR FATAL', e.message); process.exit(1); });
