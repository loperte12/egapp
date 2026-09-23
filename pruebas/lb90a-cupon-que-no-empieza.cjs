// lb90a-cupon-que-no-empieza.cjs — ¿se puede recoger un cupón que todavía no vale? (punto 14 de la §3)
//
// Se prueban dos cupones de la tienda de pruebas: uno que empieza MAÑANA (no se puede recoger) y otro
// que ya vale (se recoge sin problema). Los crea y los borra la propia prueba por SQL a través del
// servidor: el cupón futuro se inserta con `starts_at` mañana y se limpia al final.
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb90a.cjs <CODIGO_DEL_CUPON_FUTURO>
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';

let fallos = 0;
const comprobar = (ok, texto) => { console.log(`  ${ok ? 'OK  ' : 'FALLO'} ${texto}`); if (!ok) fallos++; };

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };
const entrar = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
  return r.accessToken;
};
const req = async (method, path, tok, body) => {
  const r = await fetch(`${API}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { s: r.status, b: await j(r) };
};

(async () => {
  const FUTURO = String(process.argv[2] ?? '').trim().toUpperCase();
  if (!FUTURO) { console.log('falta el código del cupón futuro'); process.exit(1); }
  const B = await entrar('+240555000003', '123456');
  console.log(`cupón que empieza mañana: «${FUTURO}» (lo crea el SQL antes de esta prueba)`);

  // ── A) Recogerlo antes de tiempo ──────────────────────────────────────────
  console.log('\n=== A. RECOGER UN CUPÓN QUE EMPIEZA MAÑANA ===');
  const antesDeTiempo = await req('POST', '/lifebook/commerce/coupons/claim', B, { code: FUTURO });
  comprobar(antesDeTiempo.s >= 400 && antesDeTiempo.b?.error?.code === 'COUPON_NOT_STARTED',
    `se rechaza con el motivo exacto → ${antesDeTiempo.b?.error?.code ?? `HTTP ${antesDeTiempo.s}`}`);
  comprobar(/empieza el/i.test(String(antesDeTiempo.b?.error?.message ?? '')),
    `y el mensaje dice cuándo vale: «${antesDeTiempo.b?.error?.message ?? ''}»`);
  const misCupones = await req('GET', '/lifebook/commerce/my/coupons', B);
  const lista = misCupones.b?.items ?? misCupones.b?.coupons ?? [];
  comprobar(!lista.some((c) => String(c.code).toUpperCase() === FUTURO),
    `NO queda guardado en la cuenta del comprador (tiene ${lista.length} cupones suyos)`);

  // ── B) Un cupón que ya vale se recoge ─────────────────────────────────────
  console.log('\n=== B. UN CUPÓN QUE YA VALE SE RECOGE ===');
  const yaVale = await req('POST', '/lifebook/commerce/coupons/claim', B, { code: 'PRUEBA135085' });
  comprobar(yaVale.s === 200 || yaVale.s === 201, `el cupón que ya vale se recoge → HTTP ${yaVale.s} ${yaVale.b?.error?.code ?? ''}`);

  console.log(`\n  (el cupón ${FUTURO} se borra por SQL al terminar)`);
  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });

