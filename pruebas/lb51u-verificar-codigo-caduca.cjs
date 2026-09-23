// lb51u-verificar-codigo-caduca.cjs — P3 (1ª parte): el código de invitación CADUCA.
//
// Qué se comprueba contra la API real (grupo «Grupo E2E 055962134 v2», A = dueño, B = miembro):
//   FASE 1 · el dueño saca un código, con fecha de caducidad futura; con ese código se entra
//            al grupo; un miembro cualquiera NO puede sacar códigos; código mal formado = 400;
//            código inventado = 404.
//   FASE 2 · con el código CADUCADO (fecha pasada, tocada en la base de datos): entrar da 400
//            «caducado»; el dueño vuelve a pedirlo y se ROTA (código nuevo ≠ viejo); el nuevo
//            entra; el viejo ya no existe (404).
//   FASE 3 · con el código SIN FECHA (como los que existían antes del cambio): entrar da 400,
//            y al pedirlo se rota igual.
//
// Uso:  FASE=1 node lb51u-verificar-codigo-caduca.cjs
//       FASE=2 CODIGO=XXXXXX node ...
//       FASE=3 CODIGO=YYYYYY node ...
const API = 'https://hk.egrouteplan.com/wallet/api/v1';
const G = '970bfc70-d25e-4861-8859-8e25e183c908'; // A es dueño, B es miembro
const FASE = process.env.FASE || '1';
const CODIGO = process.env.CODIGO || '';

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
const errCode = (r) => r.b?.error?.code ?? r.b?.code ?? '(sin código)';
const errMsg = (r) => r.b?.error?.message ?? r.b?.message ?? '';

let pass = 0, fail = 0;
const ok = (cond, etq, extra = '') => {
  if (cond) { pass++; console.log(`  PASA   ${etq}`); }
  else { fail++; console.log(`  FALLA  ${etq}   ${extra}`); }
};

(async () => {
  const A = await login('+240222000123', 'MiClave123');
  const B = await login('+240555000003', '123456');
  console.log(`A (dueño) = ${A.nombre}   B (miembro) = ${B.nombre}   FASE ${FASE}`);

  const sacar = () => req('GET', `/lifebook/groups/${G}/invite`, A.tok);
  const porCodigo = (codigo, quien = B) => req('GET', `/lifebook/groups/by-code/${codigo}`, quien.tok);

  if (FASE === '1') {
    console.log('\n=== 1. EL DUEÑO SACA UN CÓDIGO, CON CADUCIDAD ===');
    const inv = await sacar();
    ok(inv.s === 200, `el dueño saca el código (HTTP ${inv.s})`, JSON.stringify(inv.b).slice(0, 200));
    const code = inv.b?.code;
    ok(typeof code === 'string' && code.length >= 4, `el código tiene forma válida (${code})`);
    ok(!!inv.b?.expiresAt, `ahora viene CON fecha de caducidad (${inv.b?.expiresAt})`);
    ok(!!inv.b?.expiresAt && new Date(inv.b.expiresAt).getTime() > Date.now(),
      'y esa fecha está en el futuro (el código sirve hoy)');
    ok(inv.b?.link === `egrouteplan://group/${code}`, `el enlace usa el código (${inv.b?.link})`);

    console.log('\n=== 2. CON EL CÓDIGO SE ENTRA AL GRUPO ===');
    const entra = await porCodigo(code);
    ok(entra.s === 200, `el miembro entra con el código (HTTP ${entra.s})`, JSON.stringify(entra.b).slice(0, 200));
    ok(entra.b?.id === G, `y es el grupo correcto (${entra.b?.id})`);

    console.log('\n=== 3. PERMISOS Y CÓDIGOS BASURA ===');
    const miembro = await req('GET', `/lifebook/groups/${G}/invite`, B.tok);
    ok(miembro.s === 403, `un MIEMBRO no puede sacar códigos (HTTP ${miembro.s} ${errCode(miembro)})`);
    const corto = await porCodigo('AB');
    ok(corto.s === 400, `código demasiado corto = 400 (HTTP ${corto.s} ${errCode(corto)})`);
    const inventado = await porCodigo('ZZZZZZ');
    ok(inventado.s === 404, `código inventado = 404 (HTTP ${inventado.s} ${errCode(inventado)})`);

    console.log(`\n>>> CODE1=${code}`);
  }

  if (FASE === '2') {
    console.log(`\n=== 4. CÓDIGO CADUCADO (fecha pasada en la base de datos) = ${CODIGO} ===`);
    const caduco = await porCodigo(CODIGO);
    ok(caduco.s === 400, `entrar con el código caducado se RECHAZA (HTTP ${caduco.s})`, JSON.stringify(caduco.b).slice(0, 200));
    ok(errCode(caduco) === 'INVITE_CODE_INVALID', `con el código de error esperado (${errCode(caduco)})`);
    ok(/caduc/i.test(errMsg(caduco)), `y el mensaje lo dice claro («${errMsg(caduco)}»)`);

    console.log('\n=== 5. EL DUEÑO LO PIDE OTRA VEZ: SE ROTA ===');
    const inv = await sacar();
    ok(inv.s === 200, `vuelve a sacar código (HTTP ${inv.s})`);
    const code2 = inv.b?.code;
    ok(!!code2 && code2 !== CODIGO, `el código es NUEVO, no el caducado (${CODIGO} → ${code2})`);
    ok(!!inv.b?.expiresAt && new Date(inv.b.expiresAt).getTime() > Date.now(), `el nuevo nace con fecha futura (${inv.b?.expiresAt})`);

    console.log('\n=== 6. EL NUEVO SIRVE Y EL VIEJO YA NO ===');
    const entra = await porCodigo(code2);
    ok(entra.s === 200 && entra.b?.id === G, `con el nuevo se entra (HTTP ${entra.s})`, JSON.stringify(entra.b).slice(0, 160));
    const viejo = await porCodigo(CODIGO);
    ok(viejo.s === 404, `con el viejo ya NO (HTTP ${viejo.s} ${errCode(viejo)})`);

    console.log(`\n>>> CODE2=${code2}`);
  }

  if (FASE === '3') {
    console.log(`\n=== 7. CÓDIGO SIN FECHA (los anteriores al cambio) = ${CODIGO} ===`);
    const sinFecha = await porCodigo(CODIGO);
    ok(sinFecha.s === 400, `sin fecha tampoco entra (HTTP ${sinFecha.s} ${errCode(sinFecha)})`, JSON.stringify(sinFecha.b).slice(0, 200));
    ok(/caduc/i.test(errMsg(sinFecha)), `y se explica igual («${errMsg(sinFecha)}»)`);

    const inv = await sacar();
    const code3 = inv.b?.code;
    ok(inv.s === 200 && !!code3 && code3 !== CODIGO, `al pedirlo se rota (${CODIGO} → ${code3})`);
    ok(!!inv.b?.expiresAt && new Date(inv.b.expiresAt).getTime() > Date.now(), `el rotado nace con fecha futura (${inv.b?.expiresAt})`);
    const entra = await porCodigo(code3);
    ok(entra.s === 200 && entra.b?.id === G, `y con el rotado se entra (HTTP ${entra.s})`);

    console.log(`\n>>> CODE3=${code3}  (queda uno válido en el grupo)`);
  }

  console.log(`\n=== RESULTADO FASE ${FASE}: ${pass} PASA, ${fail} FALLA ===`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e.message); process.exit(2); });
