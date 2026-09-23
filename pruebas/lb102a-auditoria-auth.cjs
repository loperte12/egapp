// lb102a-auditoria-auth.cjs — VERIFICACIÓN DE LOS ARREGLOS DE LA AUDITORÍA (parches 102 y 103).
//
// Comprueba, contra el servidor:
//   1. Hallazgo ALTO 1: la vía biométrica del token de pago ya NO emite tokens (antes emitía sin PIN).
//   2. Hallazgo MEDIO 3: un token de dinero SIN importe ya no se emite, y no vale para operar.
//   3. Hallazgo ALTO 2: el login por PIN ya cuenta intentos y bloquea (el contador se mueve de verdad).
//   4. El guard de throttling está REGISTRADO: una ruta sin @Throttle propio corta a las 100/min.
//
// Usa una cuenta DESECHABLE creada por registro para no bloquear las cuentas compartidas del e2e.
const { execSync } = require('node:child_process');

const V1 = process.env.LB_V1 ?? 'http://127.0.0.1:3000/api/v1';
const BUENA = { phone: '+240555000111', password: 'PruebaKyc2026', pin: '246810' };
const BASURA = { phone: '+2405550099' + String(Date.now() % 100).padStart(2, '0'), password: 'PruebaKyc2026', pin: '111111' };

let fallos = 0;
const comprobar = (ok, texto) => { console.log(`  ${ok ? 'OK  ' : 'FALLO'} ${texto}`); if (!ok) fallos += 1; };
const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };
const q = (sql) => {
  const salida = execSync('docker exec -i mirror-postgres psql -U postgres -d egrouteplan -tA', { input: sql, encoding: 'utf8' }).trim();
  return salida.split('\n').map((l) => l.trim()).filter((l) => l && !/^(INSERT|UPDATE|DELETE|SELECT) \d/.test(l))[0] ?? '';
};
const req = async (method, url, tok, body) => {
  const r = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { s: r.status, b: await j(r) };
};
const sesion = async ({ phone, password }) => {
  const r = await req('POST', `${V1}/mobility/auth/login`, null, { phone, password });
  if (!r.b.accessToken) throw new Error(`login ${phone}: ${JSON.stringify(r.b).slice(0, 140)}`);
  return r.b.accessToken;
};

(async () => {
  const tok = await sesion(BUENA);

  console.log('\n== 1. LA VÍA BIOMÉTRICA YA NO EMITE TOKENS (hallazgo alto 1) ==');
  const bio = await req('POST', `${V1}/auth/payment-token`, tok, {
    method: 'BIOMETRIC', webauthnAssertion: {}, scope: 'ESCROW_LOCK', amount: 1000,
  });
  comprobar(bio.s >= 400 && !bio.b?.paymentToken, `method BIOMETRIC rechazado → HTTP ${bio.s} ${JSON.stringify(bio.b).slice(0, 120)}`);
  comprobar(!bio.b?.paymentToken, 'no se devolvió ningún token de pago');
  const bio2 = await req('POST', `${V1}/auth/payment-token`, tok, {
    method: 'BIOMETRIC', webauthnAssertion: { id: 'x', response: { clientDataJSON: 'a' } }, scope: 'WITHDRAWAL', amount: 50000,
  });
  comprobar(bio2.s >= 400 && !bio2.b?.paymentToken, `tampoco con una assertion «completa» → HTTP ${bio2.s}`);

  console.log('\n== 2. EL TOKEN DE DINERO EXIGE IMPORTE (hallazgo medio 3) ==');
  const sinImporte = await req('POST', `${V1}/auth/payment-token`, tok, { method: 'PIN', pin: BUENA.pin, scope: 'ESCROW_LOCK' });
  comprobar(sinImporte.s >= 400 && !sinImporte.b?.paymentToken,
    `token sin importe rechazado → HTTP ${sinImporte.s} ${JSON.stringify(sinImporte.b).slice(0, 140)}`);
  const conImporte = await req('POST', `${V1}/auth/payment-token`, tok, { method: 'PIN', pin: BUENA.pin, scope: 'ESCROW_LOCK', amount: 1000 });
  comprobar(!!conImporte.b?.paymentToken, 'con importe sí se emite (el camino legítimo sigue vivo)');

  console.log('\n== 3. EL LOGIN POR PIN YA TIENE CANDADO (hallazgo alto 2) ==');
  const reg = await req('POST', `${V1}/auth/register`, null, { phone: BASURA.phone, fullName: 'Cuenta desechable auditoría', pin: BASURA.pin });
  const userId = reg.b?.userId;
  console.log(`  cuenta desechable ${BASURA.phone} → HTTP ${reg.s} ${userId ? userId.slice(0, 8) + '…' : JSON.stringify(reg.b).slice(0, 120)}`);
  comprobar(!!userId, 'cuenta de prueba creada (no se toca ninguna cuenta real)');
  const antesContador = q(`SELECT coalesce(pin_attempts,0) FROM wallet.users WHERE id='${userId}'`);
  const intentos = [];
  for (let i = 1; i <= 7; i++) {
    const r = await req('POST', `${V1}/auth/login`, null, { phone: BASURA.phone, pin: '000000' });
    intentos.push(`${i}:${r.s}/${r.b?.error?.code ?? '-'}`);
  }
  console.log(`  intentos fallidos: ${intentos.join(' ')}`);
  const hayCandado = intentos.some((x) => x.includes('PIN_LOCKED') || x.includes('429'));
  comprobar(hayCandado, 'antes del intento nº7 el login ya bloquea (PIN_LOCKED) o corta por tasa (429)');
  const tras = q(`SELECT coalesce(pin_attempts,0)||'|'||coalesce(pin_locked_until::text,'-') FROM wallet.users WHERE id='${userId}'`);
  const [contador, bloqueo] = String(tras).split('|');
  console.log(`  contador de la cuenta: antes=${antesContador} después=${contador} bloqueo=${bloqueo.slice(0, 19)}`);
  comprobar(Number(contador) > Number(antesContador || 0) || bloqueo !== '-',
    'el contador de intentos de la cuenta SÍ se movió por la ruta del login (antes no se tocaba)');
  const correcto = await req('POST', `${V1}/auth/login`, null, { phone: BASURA.phone, pin: BASURA.pin });
  comprobar(!correcto.b?.accessToken,
    `con la cuenta bloqueada ni el PIN correcto da sesión → HTTP ${correcto.s} ${JSON.stringify(correcto.b).slice(0, 120)}`);

  console.log('\n== 4. EL GUARD DE THROTTLING ESTÁ REGISTRADO (hallazgo alto 2) ==');
  // /wallet no lleva @Throttle propio: si corta, es el guard GLOBAL el que actúa.
  let cortes = 0; let ultimo = 0;
  for (let i = 1; i <= 105; i++) {
    const r = await req('GET', `${V1}/wallet`, tok);
    ultimo = r.s;
    if (r.s === 429) { cortes++; }
  }
  comprobar(cortes > 0, `105 peticiones seguidas a una ruta sin @Throttle → ${cortes} cortes 429 (último HTTP ${ultimo})`);

  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS=${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.log(`  FALLO inesperado: ${e.message}`); process.exit(1); });
