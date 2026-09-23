// lb52a-verificar-productos-en-nota.cjs — TANDA C: productos DENTRO de una nota.
//
// Comprueba contra la API real lo decidido:
//   · una nota se publica CON productos y se leen en orden (el 1º primero);
//   · solo valen productos ACTIVOS de la tienda del autor: uno ajeno o retirado se ignora
//     (la nota NO se pierde por un id malo);
//   · máximo 9;
//   · el autor puede cambiarlos después (PUT) y otro NO (ni con su propio token);
//   · sin productos, la nota sigue publicándose igual (el vínculo es opcional);
//   · al terminar se BORRA la nota de prueba y los vínculos se van con ella (CASCADE).
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
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { s: r.status, b: await j(r) };
};
const errCode = (r) => r.b?.error?.code ?? r.b?.code ?? '(sin código)';

let pass = 0, fail = 0;
const ok = (c, e, x = '') => { if (c) { pass++; console.log(`  PASA   ${e}`); } else { fail++; console.log(`  FALLA  ${e}   ${x}`); } };

(async () => {
  const A = await login('+240222000123', 'MiClave123');   // tiene tienda con productos
  const ADM = await login('+240999888777', '123456');     // otra tienda (para el caso ajeno)

  const mios = await req('GET', '/lifebook/commerce/my/products', A.tok);
  const activos = (mios.b?.products ?? mios.b?.items ?? []).filter((p) => p.status === 'active');
  const ajenos = (await req('GET', '/lifebook/commerce/my/products', ADM.tok)).b;
  const productoAjeno = (ajenos?.products ?? ajenos?.items ?? []).find((p) => p.status === 'active')?.id;
  console.log(`${A.nombre}: ${activos.length} productos activos · ajeno de prueba: ${productoAjeno ? 'sí' : 'no'}`);
  ok(activos.length >= 2, 'hay al menos 2 productos activos para la nota');

  const dos = activos.slice(0, 2).map((p) => p.id);
  let nota = null;

  try {
    console.log('\n=== 1. UNA NOTA CON PRODUCTOS DENTRO ===');
    const creada = await req('POST', '/lifebook/posts', A.tok, {
      title: `Nota con productos ${Date.now() % 1000000}`,
      body: 'Probando que el producto va DENTRO de la nota: mi rutina de la mañana.',
      city: 'Malabo', visibility: 'public', productIds: dos,
    });
    nota = creada.b?.id ?? creada.b?.post?.id;
    ok(creada.s === 201 || creada.s === 200, `la nota se publica (HTTP ${creada.s})`, JSON.stringify(creada.b).slice(0, 200));
    ok(!!nota, `con su id (${nota})`);

    const dentro = await req('GET', `/lifebook/posts/${nota}/products`, null);
    ok(dentro.s === 200, `se leen sus productos sin sesión (HTTP ${dentro.s})`);
    ok((dentro.b?.products ?? []).length === 2, `hay 2 productos (${dentro.b?.products?.length})`);
    ok(JSON.stringify((dentro.b?.products ?? []).map((p) => p.id)) === JSON.stringify(dos),
      'y salen EN ORDEN (el primero es el primero)');
    const p0 = dentro.b.products[0];
    ok(!!p0?.title && 'priceXaf' in p0, `con lo que la barra necesita: título y precio (${p0?.title} · ${p0?.priceXaf})`);
    ok('coverUrl' in p0 && 'shortDescription' in p0, 'y foto y descripción corta');
    ok(p0?.position === 1, `y su puesto (${p0?.position})`);

    console.log('\n=== 2. UN PRODUCTO AJENO SE IGNORA (la nota no se pierde) ===');
    if (productoAjeno) {
      const mezcla = await req('PUT', `/lifebook/posts/${nota}/products`, A.tok, { productIds: [dos[0], productoAjeno] });
      ok(mezcla.s === 200, `se puede cambiar la lista (HTTP ${mezcla.s})`, JSON.stringify(mezcla.b).slice(0, 160));
      ok((mezcla.b?.products ?? []).length === 1 && mezcla.b.products[0].id === dos[0],
        `solo queda el mío (${mezcla.b?.products?.length}) y el ajeno se ignoró`);
    } else {
      console.log('  (la otra cuenta no tiene productos activos: no se pudo probar)');
    }

    console.log('\n=== 3. OTRO NO PUEDE CAMBIAR LOS PRODUCTOS DE MI NOTA ===');
    const intruso = await req('PUT', `/lifebook/posts/${nota}/products`, ADM.tok, { productIds: [] });
    ok(intruso.s === 403 || intruso.s === 400, `se rechaza (HTTP ${intruso.s} ${errCode(intruso)})`);
    ok(errCode(intruso) === 'NOT_YOUR_POST', `con el código esperado (${errCode(intruso)})`);
    const sigue = await req('GET', `/lifebook/posts/${nota}/products`, null);
    ok((sigue.b?.products ?? []).length === 1, 'y mis productos siguen donde estaban');

    console.log('\n=== 4. MÁS DE 9: SE QUEDAN 9 ===');
    const muchos = activos.slice(0, 12).map((p) => p.id);
    const recortado = await req('PUT', `/lifebook/posts/${nota}/products`, A.tok, { productIds: muchos });
    ok((recortado.b?.products ?? []).length <= 9, `no pasa de 9 (${recortado.b?.products?.length})`);

    console.log('\n=== 5. QUITARLOS DEL TODO ===');
    const vacio = await req('PUT', `/lifebook/posts/${nota}/products`, A.tok, { productIds: [] });
    ok((vacio.b?.products ?? []).length === 0, 'la nota se queda sin productos y sigue existiendo');
    const viva = await req('GET', `/lifebook/posts/${nota}`, A.tok);
    ok(viva.s === 200, `la nota sigue publicada (HTTP ${viva.s})`);

    console.log('\n=== 6. UNA NOTA SIN PRODUCTOS TAMBIÉN SE PUBLICA ===');
    const sinProd = await req('POST', '/lifebook/posts', A.tok, {
      title: `Nota sin productos ${Date.now() % 1000000}`,
      body: 'Sin productos, como antes.', city: 'Malabo', visibility: 'public',
    });
    ok(sinProd.s === 201 || sinProd.s === 200, `se publica igual (HTTP ${sinProd.s})`);
    const idSin = sinProd.b?.id ?? sinProd.b?.post?.id;
    const vacia = await req('GET', `/lifebook/posts/${idSin}/products`, null);
    ok((vacia.b?.products ?? []).length === 0, 'y no tiene productos (lista vacía, no error)');
    await req('DELETE', `/lifebook/posts/${idSin}`, A.tok);
  } finally {
    console.log('\n=== 7. SE BORRA LA NOTA DE PRUEBA (los vínculos se van con ella) ===');
    if (nota) {
      const borrada = await req('DELETE', `/lifebook/posts/${nota}`, A.tok);
      ok(borrada.s === 200 || borrada.s === 204, `nota borrada (HTTP ${borrada.s})`);
      const ya = await req('GET', `/lifebook/posts/${nota}/products`, null);
      ok((ya.b?.products ?? []).length === 0, 'y sus productos ya no están enganchados a nada');
    }
  }

  console.log(`\n=== RESULTADO: ${pass} PASA, ${fail} FALLA ===`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e.message); process.exit(2); });
