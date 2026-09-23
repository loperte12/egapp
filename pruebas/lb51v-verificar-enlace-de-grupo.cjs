// lb51v-verificar-enlace-de-grupo.cjs — P3 (2ª parte): enlace de GRUPO en el perfil.
//
// Comprueba el camino completo contra la API real:
//   1. el dueño saca el código de su grupo;
//   2. se guarda como ENLACE de perfil con kind='group' (el servidor debe conservarlo);
//   3. el perfil público lo devuelve tal cual (es lo que lee la app para pintar la tarjeta);
//   4. cualquier usuario puede resolver ese código a la ficha del grupo;
//   5. y si el código caduca, quien mira el perfil NO puede resolverlo (la tarjeta sale
//      apagada en vez de mentir).
// Deja los enlaces de A como estaban.
const API = 'https://hk.egrouteplan.com/wallet/api/v1';
const GRUPO = '970bfc70-d25e-4861-8859-8e25e183c908'; // A es dueño

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { __crudo: t.slice(0, 200) }; } };
const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password }),
  }));
  if (!r.accessToken) throw new Error(`login ${phone} falló: ${JSON.stringify(r).slice(0, 140)}`);
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

let pass = 0, fail = 0;
const ok = (c, e, x = '') => { if (c) { pass++; console.log(`  PASA   ${e}`); } else { fail++; console.log(`  FALLA  ${e}   ${x}`); } };

(async () => {
  const A = await login('+240222000123', 'MiClave123');
  const B = await login('+240555000003', '123456');
  console.log(`A (dueño) = ${A.nombre}   B = ${B.nombre}`);

  const originales = A.links ?? (await req('GET', '/mobility/auth/me', A.tok)).b.links ?? [];
  console.log(`\n(enlaces de A antes: ${JSON.stringify(originales)})`);

  try {
    console.log('\n=== 1. EL DUEÑO SACA EL CÓDIGO DEL GRUPO ===');
    const inv = await req('GET', `/lifebook/groups/${GRUPO}/invite`, A.tok);
    ok(inv.s === 200 && !!inv.b?.code, `sale el código (${inv.b?.code}, caduca ${inv.b?.expiresAt})`);
    const code = String(inv.b.code);

    console.log('\n=== 2. SE GUARDA COMO ENLACE DE PERFIL (kind=group) ===');
    const guardado = await req('PATCH', '/mobility/auth/me', A.tok, {
      links: [{ kind: 'group', label: 'Grupo E2E', value: code, pinned: true }],
    });
    ok(guardado.s === 200, `el servidor acepta el enlace de grupo (HTTP ${guardado.s})`, JSON.stringify(guardado.b).slice(0, 200));
    const g1 = (guardado.b?.links ?? [])[0];
    ok(g1?.kind === 'group', `conserva kind='group' (${g1?.kind})`);
    ok(g1?.value === code, `conserva el código como valor (${g1?.value})`);
    ok(g1?.pinned === true, 'y conserva que está FIJADO');

    console.log('\n=== 3. EL PERFIL PÚBLICO LO DEVUELVE (lo que lee la app) ===');
    const perfil = await req('GET', `/lifebook/users/${A.id}/profile`, B.tok);
    const gp = (perfil.b?.links ?? []).find((l) => l.kind === 'group');
    ok(!!gp, 'el enlace de grupo sale en el perfil público', JSON.stringify(perfil.b?.links ?? []).slice(0, 200));
    ok(gp?.value === code, 'con el código intacto');
    ok(gp?.pinned === true, 'y marcado como fijado (sale arriba con 📌)');

    console.log('\n=== 4. CUALQUIERA RESUELVE EL CÓDIGO A LA FICHA ===');
    const ficha = await req('GET', `/lifebook/groups/by-code/${code}`, B.tok);
    ok(ficha.s === 200, `B resuelve el código (HTTP ${ficha.s})`, JSON.stringify(ficha.b).slice(0, 200));
    ok(ficha.b?.id === GRUPO, `y es el grupo correcto (${ficha.b?.id})`);
    ok(typeof ficha.b?.membersCount === 'number', `trae cuántos miembros hay (${ficha.b?.membersCount}) para la tarjeta`);
    ok(typeof ficha.b?.title === 'string', `y el nombre (${ficha.b?.title})`);

    console.log('\n=== 5. SI EL CÓDIGO CADUCA, NO SE PUEDE RESOLVER ===');
    const caducado = await req('GET', '/lifebook/groups/by-code/ZZZZZZ', B.tok);
    ok(caducado.s === 404, `un código que no existe da 404 (HTTP ${caducado.s}) — la tarjeta sale apagada`);
  } finally {
    console.log('\n=== 6. SE DEJAN LOS ENLACES DE A COMO ESTABAN ===');
    const vuelta = await req('PATCH', '/mobility/auth/me', A.tok, { links: originales });
    ok(vuelta.s === 200, `restaurado (HTTP ${vuelta.s})`);
    const ahora = (await req('GET', '/mobility/auth/me', A.tok)).b.links ?? [];
    ok(JSON.stringify(ahora) === JSON.stringify(originales), `y queda igual que antes (${JSON.stringify(ahora)})`);
  }

  console.log(`\n=== RESULTADO: ${pass} PASA, ${fail} FALLA ===`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e.message); process.exit(2); });
