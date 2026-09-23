// lb61a-verificar-medida-que-decide.cjs — QUÉ MEDIDA DECIDE LA TALLA (tanda L-bis/L-ter).
//
// Comprueba contra la API REAL que, después de quitar pecho/cintura/cadera de la pantalla:
//   1. la recomendación funciona con ALTURA y PESO cuando la tabla de la tienda trae esas medidas;
//   2. el PESO se compara de verdad (era el fallo: se leía `weightMinCm`, columna que no existe, y
//      salía siempre «dentro», así que daba los mismos puntos a todas las tallas);
//   3. si la tabla trae pecho, el pecho MANDA (es la medida que mejor predice la talla);
//   4. si la tabla no trae ninguna medida comparable, se dice y no se inventa una talla;
//   5. se pueden GUARDAR las medidas de ropa con solo altura y peso;
//   6. LAS MEDIDAS SON UN JUEGO ÚNICO: altura, peso y número de calzado se guardan de una vez y se
//      leen igual (petición del dueño: «van juntos, el guardado será juntos»).
//
// Al terminar borra el producto de prueba y deja al comprador sin medidas.
//
// Se puede lanzar desde el servidor (API local, sin el proxy del equipo):
//   LB_API=http://127.0.0.1:3000/api/v1 node /root/lb61a-verificar-medida-que-decide.cjs
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';
let prepararRed = async () => 'sin-proxy';
if (!process.env.LB_API) {
  try { ({ prepararRed } = require('./red.cjs')); } catch { /* sin red.cjs se va directo */ }
}

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 300) }; } };
const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
  if (!r.accessToken) throw new Error(`sin sesión para ${phone}`);
  return r.accessToken;
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

/** Tabla SOLO con altura y peso (es lo que el dueño quiere que se pregunte). */
const SOLO_ALTURA_PESO = {
  charts: [{
    gender: 'women', kind: 'top', notes: 'Sin pecho: solo altura y peso',
    rows: [
      { sizeLabel: 'S', heightMinCm: 150, heightMaxCm: 160, weightMinKg: 45, weightMaxKg: 55 },
      { sizeLabel: 'M', heightMinCm: 160, heightMaxCm: 170, weightMinKg: 56, weightMaxKg: 68 },
      { sizeLabel: 'L', heightMinCm: 170, heightMaxCm: 182, weightMinKg: 69, weightMaxKg: 85 },
    ],
  }],
};

/** Tabla con pecho Y altura/peso: el pecho tiene que mandar. */
const CON_PECHO = {
  charts: [{
    gender: 'men', kind: 'top', notes: 'Con pecho y con altura/peso',
    rows: [
      { sizeLabel: 'M', chestMinCm: 94, chestMaxCm: 100, heightMinCm: 150, heightMaxCm: 182, weightMinKg: 45, weightMaxKg: 90 },
      { sizeLabel: 'L', chestMinCm: 101, chestMaxCm: 108, heightMinCm: 150, heightMaxCm: 182, weightMinKg: 45, weightMaxKg: 90 },
    ],
  }],
};

/** Tabla que NO trae ninguna medida comparable (solo cadera, que no entra en «arriba»). */
const SIN_NADA = {
  charts: [{ gender: 'women', kind: 'top', notes: 'Solo cadera', rows: [{ sizeLabel: 'M', hipMinCm: 90, hipMaxCm: 100 }] }],
};

(async () => {
  console.log(`red: ${await prepararRed()}`);
  const A = await login('+240222000123', 'MiClave123');
  const B = await login('+240555000003', '123456');
  const fotos = ['https://hk.egrouteplan.com/lb-images/covers/05193228-dac5-4835-a3ea-8c0ad8b7da17.jpg'];
  let id = null;

  try {
    console.log('\n=== 0. UN PRODUCTO DE PRUEBA ===');
    const alta = await req('POST', '/lifebook/commerce/products', A, {
      serviceType: 'physical', title: `Prueba medida que decide ${Math.floor(Math.random() * 900000 + 100000)}`,
      priceMode: 'fixed', priceXaf: 9000, stockMode: 'exact', stockQuantity: 5, condition: 'new',
      originCity: 'Malabo', media: fotos.map((url) => ({ url, type: 'image' })),
    });
    id = alta.b?.product?.id ?? null;
    ok(!!id, `producto creado (HTTP ${alta.s})`, errCode(alta));
    if (!id) process.exit(1);

    console.log('\n=== 1. LA TABLA SIN PECHO: DECIDEN LA ALTURA Y EL PESO ===');
    const t1 = await req('PUT', `/lifebook/commerce/products/${id}/size-chart`, A, SOLO_ALTURA_PESO);
    ok(t1.s === 200, `se guarda la tabla de altura y peso (HTTP ${t1.s})`, errCode(t1));

    const porAltura = await req('POST', `/lifebook/commerce/products/${id}/size-suggestion`, B, {
      kind: 'top', gender: 'women', heightCm: 165, weightKg: 62,
    });
    ok(porAltura.b?.size === 'M', `altura 165 + peso 62 → talla M (${porAltura.b?.size})`, JSON.stringify(porAltura.b).slice(0, 160));
    ok(/altura de 165/.test(String(porAltura.b?.reason ?? '')), `y lo explica con la ALTURA (${String(porAltura.b?.reason).slice(0, 70)}…)`);
    ok(porAltura.b?.chartAvailable === true, 'con la tabla disponible');

    console.log('\n=== 2. EL PESO SE COMPARA DE VERDAD (era el fallo) ===');
    // Misma altura (cae en M por altura), pero peso de la talla L: si el peso se comparara mal, el
    // resultado sería idéntico al de arriba y no se notaría.
    const porPeso = await req('POST', `/lifebook/commerce/products/${id}/size-suggestion`, B, {
      kind: 'top', gender: 'women', heightCm: 165, weightKg: 80,
    });
    ok(porPeso.b?.size === 'M' || porPeso.b?.size === 'L', `altura 165 + peso 80 → ${porPeso.b?.size}`);
    const soloPeso = await req('POST', `/lifebook/commerce/products/${id}/size-suggestion`, B, {
      kind: 'top', gender: 'women', weightKg: 80,
    });
    ok(soloPeso.b?.size === 'L', `SOLO con el peso 80 → talla L (${soloPeso.b?.size})`, JSON.stringify(soloPeso.b).slice(0, 140));
    ok(/peso de 80 kg/.test(String(soloPeso.b?.reason ?? '')), `y dice que ha decidido el PESO (${String(soloPeso.b?.reason).slice(0, 70)}…)`);
    const soloPesoBajo = await req('POST', `/lifebook/commerce/products/${id}/size-suggestion`, B, {
      kind: 'top', gender: 'women', weightKg: 50,
    });
    ok(soloPesoBajo.b?.size === 'S', `y con el peso 50 → talla S (${soloPesoBajo.b?.size})`);

    console.log('\n=== 3. SI LA TABLA TRAE PECHO, EL PECHO MANDA ===');
    const t2 = await req('PUT', `/lifebook/commerce/products/${id}/size-chart`, A, CON_PECHO);
    ok(t2.s === 200, `se cambia a una tabla con pecho (HTTP ${t2.s})`, errCode(t2));
    // La altura y el peso dados caen en las DOS tallas (a propósito): solo el pecho las separa.
    const pechoM = await req('POST', `/lifebook/commerce/products/${id}/size-suggestion`, B, {
      kind: 'top', gender: 'men', chestCm: 96, heightCm: 175, weightKg: 70,
    });
    ok(pechoM.b?.size === 'M', `pecho 96 con altura y peso iguales para las dos → M (${pechoM.b?.size})`);
    const pechoL = await req('POST', `/lifebook/commerce/products/${id}/size-suggestion`, B, {
      kind: 'top', gender: 'men', chestCm: 105, heightCm: 175, weightKg: 70,
    });
    ok(pechoL.b?.size === 'L', `pecho 105 → L (${pechoL.b?.size})`);
    ok(/pecho de 105/.test(String(pechoL.b?.reason ?? '')), 'y lo explica con el PECHO');
    /**
     * Y si la tabla trae pecho pero el cliente solo da la altura, se usa la ALTURA: es el sentido de
     * la lista por orden — la primera medida que el cliente haya dado y que la tabla sepa leer. Antes
     * esto respondía «nos falta tu pecho» y el asistente se quedaba sin nada que hacer.
     */
    const soloAlturaConPecho = await req('POST', `/lifebook/commerce/products/${id}/size-suggestion`, B, {
      kind: 'top', gender: 'men', heightCm: 160,
    });
    ok(soloAlturaConPecho.b?.size === 'M' && /altura de 160/.test(String(soloAlturaConPecho.b?.reason ?? '')),
      `sin pecho pero con altura → usa la ALTURA y recomienda M (${soloAlturaConPecho.b?.size})`,
      String(soloAlturaConPecho.b?.reason).slice(0, 80));

    console.log('\n=== 4. SI LA TABLA NO SE PUEDE COMPARAR, SE DICE ===');
    const t3 = await req('PUT', `/lifebook/commerce/products/${id}/size-chart`, A, SIN_NADA);
    ok(t3.s === 200, `se guarda una tabla que solo trae cadera (HTTP ${t3.s})`, errCode(t3));
    const sinNada = await req('POST', `/lifebook/commerce/products/${id}/size-suggestion`, B, {
      kind: 'top', gender: 'women', heightCm: 165, weightKg: 62,
    });
    ok(sinNada.b?.size === null, `no se recomienda ninguna talla (${sinNada.b?.size})`);
    ok(/no trae ninguna medida que podamos comparar/i.test(String(sinNada.b?.reason ?? '')),
      `y se dice por qué: «${String(sinNada.b?.reason).slice(0, 80)}…»`);

    console.log('\n=== 5. GUARDAR MIS MEDIDAS SIN PECHO NI CINTURA ===');
    const guarda = await req('PUT', '/lifebook/commerce/my/measurements', B, {
      category: 'body', gender: 'women', heightCm: 165, weightKg: 62,
    });
    ok(guarda.s === 200, `altura y peso se guardan sin pecho/cintura/cadera (HTTP ${guarda.s})`, errCode(guarda));
    ok(guarda.b?.body?.heightCm === 165 && guarda.b?.body?.weightKg === 62, 'y se leen tal cual');
    ok(guarda.b?.body?.chestCm === null, 'sin pecho (no se inventa)');
    const vacio = await req('PUT', '/lifebook/commerce/my/measurements', B, { category: 'body', gender: 'women' });
    ok(vacio.s === 400 && errCode(vacio) === 'MEASURE_REQUIRED', `sin NINGUNA medida → 400 ${errCode(vacio)}`, vacio.s);
    const pies = await req('PUT', '/lifebook/commerce/my/measurements', B, {
      category: 'feet', gender: 'women', footLengthCm: 26, footWidthCm: 9,
    });
    ok(pies.s === 200 && pies.b?.body?.footLengthCm === 26 && pies.b?.body?.heightCm === 165,
      'una escritura vieja SOLO del calzado actualiza el número y NO borra la altura',
      JSON.stringify(pies.b?.body ?? {}).slice(0, 120));

    console.log('\n=== 6. LAS MEDIDAS SON UN JUEGO ÚNICO (altura, peso y número juntos) ===');
    const juntas = await req('PUT', '/lifebook/commerce/my/measurements', B, {
      gender: 'women', heightCm: 168, weightKg: 65, footLengthCm: 26,
    });
    ok(juntas.s === 200, `se guardan de una vez y sin categoría (HTTP ${juntas.s})`, errCode(juntas));
    ok(juntas.b?.body?.heightCm === 168 && juntas.b?.body?.weigthKg === undefined && juntas.b?.body?.weightKg === 65,
      'la altura y el peso quedan en el mismo juego');
    ok(juntas.b?.body?.footLengthCm === 26, `y el número de calzado también (${juntas.b?.body?.footLengthCm} cm)`);
    ok(juntas.b?.feet?.heightCm === 168 && juntas.b?.feet?.footLengthCm === 26,
      'el mismo juego se lee por las dos claves (nada de lo que ya lo leía se rompe)');
    const relee = await req('GET', '/lifebook/commerce/my/measurements', B);
    ok(relee.b?.body?.heightCm === 168 && relee.b?.feet?.heightCm === 168, 'y al releer sigue siendo uno solo');
    const soloCalzado = await req('PUT', '/lifebook/commerce/my/measurements', B, { footLengthCm: 27 });
    ok(soloCalzado.s === 200, `con solo el número también se guarda (HTTP ${soloCalzado.s})`, errCode(soloCalzado));
    const nada = await req('PUT', '/lifebook/commerce/my/measurements', B, { gender: 'women' });
    ok(nada.s === 400 && errCode(nada) === 'MEASURE_REQUIRED', `sin ninguna medida → 400 ${errCode(nada)}`, nada.s);

  } finally {
    console.log('\n=== LIMPIEZA ===');
    if (id) {
      const borrado = await req('DELETE', `/lifebook/commerce/products/${id}`, A);
      ok(borrado.s === 200 || borrado.s === 204, `el producto de prueba se borra (HTTP ${borrado.s})`);
    }
    const limpio = await req('DELETE', '/lifebook/commerce/my/measurements', B);
    ok(limpio.s === 200, `las medidas del comprador se borran (HTTP ${limpio.s})`);
  }

  console.log(`\n${pass} PASA · ${fail} FALLA`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
