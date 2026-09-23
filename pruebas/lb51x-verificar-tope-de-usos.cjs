// lb51x-verificar-tope-de-usos.cjs — P3 (2ª parte): el TOPE DE USOS del enlace de grupo.
//
// Crea un grupo de prueba, lo usa y lo BORRA al terminar (no deja basura).
// Comprueba lo decidido:
//   · el dueño saca un enlace con tope 1 y 1 día: `usesLeft = 1`;
//   · quien entra con el código ve las entradas que quedan;
//   · al entrar, GASTA una entrada (pasa a 0);
//   · con el enlace gastado, NADIE más entra: 400 INVITE_CODE_USED_UP;
//   · el tope acota el ENLACE, no la puerta del grupo: entrar sin código sigue funcionando
//     (igual que Telegram) — se comprueba para que quede escrito, no supuesto;
//   · sacar un enlace con tope 2 ROTA el código (el viejo muere) y reinicia el contador:
//     así nadie «recarga» un enlace ya gastado;
//   · y el tope no lo puede tocar quien no manda en el grupo (403).
const API = 'https://hk.egrouteplan.com/wallet/api/v1';

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };
const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
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
const errCode = (r) => r.b?.error?.code ?? r.b?.code ?? '(sin código)';
const errMsg = (r) => r.b?.error?.message ?? r.b?.message ?? '';

let pass = 0, fail = 0;
const ok = (c, e, x = '') => { if (c) { pass++; console.log(`  PASA   ${e}`); } else { fail++; console.log(`  FALLA  ${e}   ${x}`); } };

(async () => {
  const A = await login('+240222000123', 'MiClave123');   // dueño del grupo de prueba
  const B = await login('+240555000003', '123456');       // quien entra con el enlace
  // El grupo necesita al menos un miembro para poder crearse, y B NO puede serlo (tiene
  // que poder entrar después). Se usa la cuenta de administración como relleno.
  const ADM = await login('+240999888777', '123456');
  console.log(`A (dueño) = ${A.nombre}   B (invitado) = ${B.nombre}   relleno = ${ADM.nombre}`);

  // ── Grupo de prueba ────────────────────────────────────────────────────────
  const creado = await req('POST', '/lifebook/groups', A.tok, {
    title: `Prueba tope ${Date.now() % 1000000}`,
    memberIds: [ADM.id],
    joinMode: 'open',
    visibility: 'public',
    description: 'Grupo temporal para probar el tope de usos del enlace.',
  });
  const G = creado.b?.id ?? creado.b?.group?.id;
  ok(!!G, `grupo de prueba creado (${G})`, JSON.stringify(creado.b).slice(0, 200));
  if (!G) throw new Error('sin grupo de prueba no se puede seguir');

  try {
    console.log('\n=== 1. UN ENLACE CON TOPE 1 Y 1 DÍA ===');
    const inv = await req('GET', `/lifebook/groups/${G}/invite?maxUses=1&days=1`, A.tok);
    ok(inv.s === 200, `el dueño saca el enlace (HTTP ${inv.s})`, JSON.stringify(inv.b).slice(0, 200));
    const code1 = inv.b?.code;
    ok(inv.b?.maxUses === 1, `el tope es 1 (${inv.b?.maxUses})`);
    ok(inv.b?.uses === 0 && inv.b?.usesLeft === 1, `y quedan 1 de 1 entradas (uses=${inv.b?.uses}, left=${inv.b?.usesLeft})`);

    console.log('\n=== 2. QUIEN ENTRA CON EL CÓDIGO VE LAS ENTRADAS QUE QUEDAN ===');
    const ficha = await req('GET', `/lifebook/groups/by-code/${code1}`, B.tok);
    ok(ficha.s === 200, `B resuelve el enlace (HTTP ${ficha.s})`);
    ok(ficha.b?.invite?.usesLeft === 1, `y ve que queda 1 entrada (${ficha.b?.invite?.usesLeft})`);
    ok(ficha.b?.invite?.maxUses === 1, `con el tope (${ficha.b?.invite?.maxUses})`);

    console.log('\n=== 3. ENTRAR GASTA UNA ENTRADA ===');
    const uno = await req('POST', `/lifebook/groups/${G}/join`, B.tok, { code: code1 });
    ok(uno.s === 200 || uno.s === 201, `B entra con el código (HTTP ${uno.s})`, JSON.stringify(uno.b).slice(0, 160));
    ok(uno.b?.joined === true, 'y el servidor dice que ha entrado');
    const despues = await req('GET', `/lifebook/groups/${G}/invite`, A.tok);
    ok(despues.b?.uses === 1, `el contador subió a 1 (${despues.b?.uses})`);
    ok(despues.b?.usesLeft === 0, `y no queda ninguna entrada (${despues.b?.usesLeft})`);

    console.log('\n=== 4. CON EL ENLACE GASTADO, NADIE MÁS ENTRA ===');
    await req('POST', `/lifebook/groups/${G}/leave`, B.tok);
    const fuera = await req('GET', `/lifebook/groups/${G}`, B.tok);
    ok(fuera.b?.myRole == null, `B se ha salido (myRole=${fuera.b?.myRole}) para poder intentarlo otra vez`);
    const dos = await req('POST', `/lifebook/groups/${G}/join`, B.tok, { code: code1 });
    ok(dos.s === 400, `entrar con el enlace gastado se RECHAZA (HTTP ${dos.s})`, JSON.stringify(dos.b).slice(0, 200));
    ok(errCode(dos) === 'INVITE_CODE_USED_UP', `con el código de error esperado (${errCode(dos)})`);
    ok(/no admite a más gente/i.test(errMsg(dos)), `y lo explica («${errMsg(dos)}»)`);

    console.log('\n=== 5. EL TOPE ACOTA EL ENLACE, NO LA PUERTA (se comprueba, no se supone) ===');
    const sinCodigo = await req('POST', `/lifebook/groups/${G}/join`, B.tok, {});
    ok(sinCodigo.b?.joined === true, `entrar SIN código sigue funcionando (igual que Telegram): joined=${sinCodigo.b?.joined}`);
    await req('POST', `/lifebook/groups/${G}/leave`, B.tok);

    console.log('\n=== 6. UN ENLACE NUEVO ROTA EL CÓDIGO Y REINICIA EL CONTADOR ===');
    const dosUsos = await req('GET', `/lifebook/groups/${G}/invite?maxUses=2`, A.tok);
    ok(dosUsos.s === 200 && !!dosUsos.b?.code, `sale un enlace nuevo (${dosUsos.b?.code})`);
    const code2 = dosUsos.b?.code;
    ok(code2 !== code1, `el código es distinto del gastado (${code1} → ${code2})`);
    ok(dosUsos.b?.uses === 0 && dosUsos.b?.usesLeft === 2, `y el contador vuelve a cero: quedan 2 (${dosUsos.b?.usesLeft})`);
    const viejo = await req('GET', `/lifebook/groups/by-code/${code1}`, B.tok);
    ok(viejo.s === 404, `el código viejo ya no existe (HTTP ${viejo.s})`);
    const entra2 = await req('POST', `/lifebook/groups/${G}/join`, B.tok, { code: code2 });
    ok(entra2.b?.joined === true, 'con el nuevo se entra');
    const tras2 = await req('GET', `/lifebook/groups/${G}/invite`, A.tok);
    ok(tras2.b?.usesLeft === 1, `y queda 1 de 2 (${tras2.b?.usesLeft})`);
    await req('POST', `/lifebook/groups/${G}/leave`, B.tok);

    console.log('\n=== 7. EL TOPE NO LO TOCA QUIEN NO MANDA ===');
    const invitado = await req('GET', `/lifebook/groups/${G}/invite?maxUses=99`, B.tok);
    ok(invitado.s === 403, `un miembro cualquiera no puede cambiar el tope (HTTP ${invitado.s} ${errCode(invitado)})`);

    console.log('\n=== 8. SIN TOPE SIGUE SIENDO SIN TOPE ===');
    const sinTope = await req('GET', `/lifebook/groups/${G}/invite?maxUses=null`, A.tok);
    ok(sinTope.s === 200, `se puede pedir un enlace sin tope (HTTP ${sinTope.s})`);
    ok(sinTope.b?.maxUses === null && sinTope.b?.usesLeft === null,
      `y queda sin tope (maxUses=${sinTope.b?.maxUses}, usesLeft=${sinTope.b?.usesLeft})`);
  } finally {
    console.log('\n=== 9. SE BORRA EL GRUPO DE PRUEBA ===');
    const borrado = await req('DELETE', `/lifebook/groups/${G}`, A.tok);
    ok(borrado.s === 200 || borrado.s === 204, `grupo de prueba borrado (HTTP ${borrado.s})`);
  }

  console.log(`\n=== RESULTADO: ${pass} PASA, ${fail} FALLA ===`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e.message); process.exit(2); });
