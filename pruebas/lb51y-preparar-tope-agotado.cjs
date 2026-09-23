// lb51y-preparar-tope-agotado.cjs — deja un grupo de prueba con el enlace AGOTADO para
// poder verlo en el teléfono (la app va con la cuenta A, que NO es miembro de él).
//
// Deja impreso el CÓDIGO para abrirlo desde el teléfono con:
//   adb shell am start -a android.intent.action.VIEW -d "egrouteplan://lifebook-groups?code=CODIGO"
//
// Y para borrar el grupo después:  node pruebas/lb51y-preparar-tope-agotado.cjs --borrar <id>
const API = 'https://hk.egrouteplan.com/wallet/api/v1';

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };
const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
  const me = await j(await fetch(`${API}/mobility/auth/me`, { headers: { Authorization: `Bearer ${r.accessToken}` } }));
  return { tok: r.accessToken, id: me.id, nombre: me.fullName };
};
const req = async (method, path, tok, body) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { s: r.status, b: await j(r) };
};

(async () => {
  const A = await login('+240222000123', 'MiClave123');      // la sesión del teléfono
  const B = await login('+240555000003', '123456');          // quien gasta la única entrada
  const ADM = await login('+240999888777', '123456');        // dueño del grupo de prueba

  // --borrar <id>: limpieza
  const iBorrar = process.argv.indexOf('--borrar');
  if (iBorrar > 0) {
    const id = process.argv[iBorrar + 1];
    const r = await req('DELETE', `/lifebook/groups/${id}`, ADM.tok);
    console.log('borrado', id, 'HTTP', r.s);
    return;
  }

  const creado = await req('POST', '/lifebook/groups', ADM.tok, {
    title: `Tope agotado ${Date.now() % 1000000}`,
    memberIds: [A.id],           // A entra para que el grupo se pueda crear…
    joinMode: 'open',
    visibility: 'public',
    description: 'Grupo temporal: el enlace se gasta y A lo abre desde el teléfono.',
  });
  const G = creado.b?.id ?? creado.b?.group?.id;
  if (!G) throw new Error('no se pudo crear: ' + JSON.stringify(creado.b).slice(0, 200));

  // …y A se sale, para que en el teléfono NO sea miembro y vea la ficha como un invitado.
  await req('POST', `/lifebook/groups/${G}/leave`, A.tok);
  const yo = await req('GET', `/lifebook/groups/${G}`, A.tok);
  console.log('A es miembro?', yo.b?.myRole ?? '(no)');

  const inv = await req('GET', `/lifebook/groups/${G}/invite?maxUses=1&days=1`, ADM.tok);
  const code = inv.b?.code;
  console.log('código con tope 1:', code, '· quedan', inv.b?.usesLeft);

  // B gasta la única entrada entrando CON el código.
  const entra = await req('POST', `/lifebook/groups/${G}/join`, B.tok, { code });
  console.log('B entra con el código:', entra.s, JSON.stringify(entra.b).slice(0, 120));
  const tras = await req('GET', `/lifebook/groups/${G}/invite`, ADM.tok);
  console.log('quedan después:', tras.b?.usesLeft);

  console.log('\nGRUPO=' + G);
  console.log('CODIGO=' + code);
  console.log(`\nabrir en el teléfono:\n  adb shell am start -a android.intent.action.VIEW -d "egrouteplan://lifebook-groups?code=${code}"`);
})().catch((e) => { console.error('ERROR', e.message); process.exit(2); });
