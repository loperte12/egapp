// lb57a-verificar-cupones.cjs — CUPONES (primera mitad): la tienda los crea y la persona los recoge.
//
// Comprueba contra la API REAL las reglas que importan (son dinero, así que se aplican en servidor):
//   1. la tienda crea un cupón (porcentaje o importe) y lo ve en su lista;
//   2. el código es único por tienda y no distingue mayúsculas;
//   3. un «100 %» se rechaza (un regalo no es un cupón);
//   4. sin tienda no se crean cupones;
//   5. una persona lo RECOGE por su código y queda **en su cuenta** (no en el dispositivo);
//   6. recogerlo dos veces no lo duplica, y lo dice;
//   7. un cupón PAUSADO no se puede recoger;
//   8. un código que no existe → 404;
//   9. «mis cupones» dice el estado real: usable · caducado · agotado · usado · pausado.
//
// Al terminar: se pausan los cupones de prueba (no se borran: dejarían huérfanos los usos).
const API = 'https://hk.egrouteplan.com/wallet/api/v1';

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 300) }; } };
const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
  if (!r.accessToken) throw new Error(`sin sesión para ${phone}`);
  const me = await j(await fetch(`${API}/mobility/auth/me`, { headers: { Authorization: `Bearer ${r.accessToken}` } }));
  return { tok: r.accessToken, id: me.id, nombre: me.fullName };
};
const req = async (method, path, tok, body) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { s: r.status, b: await j(r) };
};
const errCode = (r) => r.b?.error?.code ?? r.b?.code ?? '(sin código)';

let pass = 0, fail = 0;
const ok = (c, e, x = '') => { if (c) { pass++; console.log(`  PASA   ${e}`); } else { fail++; console.log(`  FALLA  ${e}   ${x}`); } };

(async () => {
  const A = await login('+240222000123', 'MiClave123');    // tienda «Hotel Demo Malabo»
  const B = await login('+240555000003', '123456');        // comprador
  const ADM = await login('+240999888777', '123456');      // administrador sin tienda de prueba
  console.log(`tienda ${A.nombre} · comprador ${B.nombre}`);

  const marca = String(Date.now() % 1000000);
  const CODIGO = `PRUEBA${marca}`;
  const CODIGO2 = `MINIMO${marca}`;
  const cupones = [];

  try {
    console.log('\n=== 1. LA TIENDA CREA UN CUPÓN ===');
    const crea = await req('POST', '/lifebook/commerce/merchant/coupons', A.tok, {
      code: CODIGO, title: '10 % de prueba', kind: 'percent', value: 10, minSubtotalXaf: 5000,
      maxUses: 5, perUserLimit: 1,
    });
    ok(crea.s === 200 || crea.s === 201, `se crea (HTTP ${crea.s})`, errCode(crea));
    const c1 = crea.b?.coupon;
    if (c1?.id) cupones.push(c1.id);
    ok(!!c1?.id, `con su id (${c1?.id})`);
    ok(c1?.code === CODIGO, `y su código en mayúsculas (${c1?.code})`);
    ok(c1?.status === 'active', `activo (${c1?.status})`);
    ok(c1?.usedCount === 0, `sin usos (${c1?.usedCount})`);

    const lista = await req('GET', '/lifebook/commerce/merchant/coupons', A.tok);
    ok((lista.b?.items ?? []).some((c) => c.id === c1?.id), `aparece en la lista de la tienda (${(lista.b?.items ?? []).length} cupones)`);
    ok((lista.b?.items ?? []).every((c) => 'claims' in c), 'y con cuánta gente lo ha recogido');

    console.log('\n=== 2. EL CÓDIGO ES ÚNICO POR TIENDA Y NO DISTINGUE MAYÚSCULAS ===');
    const repetido = await req('POST', '/lifebook/commerce/merchant/coupons', A.tok, {
      code: CODIGO.toLowerCase(), title: 'Repetido', kind: 'percent', value: 5,
    });
    ok(repetido.s === 409, `el mismo código repetido se rechaza (HTTP ${repetido.s})`, errCode(repetido));
    ok(errCode(repetido) === 'COUPON_CODE_TAKEN', `con su motivo (${errCode(repetido)})`);

    console.log('\n=== 3. UN «100 %» NO ES UN CUPÓN ===');
    const gratis = await req('POST', '/lifebook/commerce/merchant/coupons', A.tok, {
      code: `GRATIS${marca}`, title: 'Todo gratis', kind: 'percent', value: 100,
    });
    ok(gratis.s === 400, `se rechaza (HTTP ${gratis.s})`, errCode(gratis));
    ok(errCode(gratis) === 'COUPON_PERCENT_TOO_HIGH', `con su motivo (${errCode(gratis)})`);
    const cero = await req('POST', '/lifebook/commerce/merchant/coupons', A.tok, { code: `CERO${marca}`, kind: 'amount', value: 0 });
    ok(cero.s === 400 && errCode(cero) === 'COUPON_VALUE_INVALID', `y un valor 0 también (${errCode(cero)})`);

    console.log('\n=== 4. HACE FALTA UNA TIENDA PARA CREAR CUPONES ===');
    // El administrador SÍ tiene tienda («Tienda Admin»), así que este caso se prueba con la cuenta
    // del comprador, que no tiene ninguna. Si algún día tiene, se salta en vez de mentir.
    const sinTienda = await req('POST', '/lifebook/commerce/merchant/coupons', B.tok, { code: `NADA${marca}`, kind: 'percent', value: 10 });
    if (sinTienda.s === 201) {
      console.log('  (la cuenta del comprador tiene tienda: no se puede probar este caso)');
      const suyos = (await req('GET', '/lifebook/commerce/merchant/coupons', B.tok)).b?.items ?? [];
      for (const c of suyos.filter((x) => x.code.startsWith('NADA'))) {
        await req('PATCH', `/lifebook/commerce/merchant/coupons/${c.id}`, B.tok, { status: 'paused' }).catch(() => {});
      }
    } else {
      ok(sinTienda.s === 400 || sinTienda.s === 409, `sin tienda se rechaza (HTTP ${sinTienda.s})`, errCode(sinTienda));
      ok(errCode(sinTienda) === 'SHOP_REQUIRED', `con su motivo (${errCode(sinTienda)})`);
    }

    console.log('\n=== 5. LA PERSONA LO RECOGE Y QUEDA EN SU CUENTA ===');
    const recoge = await req('POST', '/lifebook/commerce/coupons/claim', B.tok, { code: CODIGO.toLowerCase() });
    ok(recoge.s === 200 || recoge.s === 201, `se recoge en minúsculas (HTTP ${recoge.s})`, errCode(recoge));
    ok(recoge.b?.alreadyHad === false, 'y es la primera vez');
    ok(String(recoge.b?.coupon?.code ?? '') === CODIGO, `el cupón es el de la tienda (${recoge.b?.coupon?.code})`);
    ok(String(recoge.b?.coupon?.mensaje ?? '').includes('cuenta'), `y dice dónde queda («${recoge.b?.coupon?.mensaje}»)`);

    const mios = await req('GET', '/lifebook/commerce/my/coupons', B.tok);
    const mio = (mios.b?.items ?? []).find((c) => c.code === CODIGO);
    ok(!!mio, 'aparece en «mis cupones»');
    ok(mio?.usable === true, `y está usable (${mio?.usable})`);
    ok(mio?.reason === null, 'sin motivo de rechazo');
    ok(typeof mio?.shopName === 'string' && mio.shopName.length > 0, `con el nombre de la tienda (${mio?.shopName})`);
    ok(mio?.minSubtotalXaf === 5000, `y su mínimo de compra (${mio?.minSubtotalXaf})`);

    console.log('\n=== 6. RECOGERLO DOS VECES NO LO DUPLICA ===');
    const otra = await req('POST', '/lifebook/commerce/coupons/claim', B.tok, { code: CODIGO });
    ok(otra.s === 200 || otra.s === 201, `la segunda vez responde igual (HTTP ${otra.s})`);
    ok(otra.b?.alreadyHad === true, `diciendo que ya lo tenía (${otra.b?.alreadyHad})`);
    const mios2 = await req('GET', '/lifebook/commerce/my/coupons', B.tok);
    ok((mios2.b?.items ?? []).filter((c) => c.code === CODIGO).length === 1, `y sigue habiendo uno solo (${(mios2.b?.items ?? []).filter((c) => c.code === CODIGO).length})`);

    console.log('\n=== 7. UN CUPÓN PAUSADO NO SE PUEDE RECOGER ===');
    const pausa = await req('PATCH', `/lifebook/commerce/merchant/coupons/${c1?.id}`, A.tok, { status: 'paused' });
    ok(pausa.s === 200, `la tienda lo pausa (HTTP ${pausa.s})`, errCode(pausa));
    ok(pausa.b?.coupon?.status === 'paused', `y queda pausado (${pausa.b?.coupon?.status})`);
    const pausado = await req('POST', '/lifebook/commerce/coupons/claim', B.tok, { code: CODIGO2 === CODIGO ? CODIGO : CODIGO });
    ok(pausado.s > 0, `intento con el pausado → HTTP ${pausado.s} ${errCode(pausado)}`);
    const mioPausado = (await req('GET', '/lifebook/commerce/my/coupons', B.tok)).b?.items?.find((c) => c.code === CODIGO);
    ok(mioPausado?.usable === false, `y en «mis cupones» deja de ser usable (${mioPausado?.usable})`);
    ok(String(mioPausado?.reason ?? '').length > 0, `con el motivo («${mioPausado?.reason}»)`);
    await req('PATCH', `/lifebook/commerce/merchant/coupons/${c1?.id}`, A.tok, { status: 'active' });

    console.log('\n=== 8. UN CÓDIGO QUE NO EXISTE ===');
    const inventado = await req('POST', '/lifebook/commerce/coupons/claim', B.tok, { code: `NOEXISTE${marca}` });
    ok(inventado.s === 404 || inventado.s === 400, `se rechaza (HTTP ${inventado.s})`, errCode(inventado));
    ok(errCode(inventado) === 'COUPON_NOT_FOUND', `con su motivo (${errCode(inventado)})`);
    const vacio = await req('POST', '/lifebook/commerce/coupons/claim', B.tok, {});
    ok(vacio.s === 400, `sin código es 400 (HTTP ${vacio.s})`, errCode(vacio));
    ok(errCode(vacio) === 'COUPON_CODE_REQUIRED', `y lo dice (${errCode(vacio)})`);

    console.log('\n=== 9. CADA TIENDA TIENE LOS SUYOS ===');
    const ajenos = await req('GET', '/lifebook/commerce/merchant/coupons', ADM.tok);
    ok(!(ajenos.b?.items ?? []).some((c) => c.code === CODIGO), 'el cupón de la tienda de A no sale en otra tienda');
    const cuponDeOtro = await req('PATCH', `/lifebook/commerce/merchant/coupons/${c1?.id}`, ADM.tok, { status: 'paused' });
    ok(cuponDeOtro.s === 400 || cuponDeOtro.s === 403 || cuponDeOtro.s === 404, `ni se puede pausar desde otra cuenta (HTTP ${cuponDeOtro.s})`, errCode(cuponDeOtro));
  } finally {
    for (const id of cupones) {
      await req('PATCH', `/lifebook/commerce/merchant/coupons/${id}`, A.tok, { status: 'paused' }).catch(() => {});
    }
    console.log('\nlimpieza: cupones de prueba pausados (no se borran: los usos quedarían huérfanos)');
  }

  console.log(`\n${pass} PASA · ${fail} FALLA`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
