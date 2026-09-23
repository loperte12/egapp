// lb51z-verificar-tarjeta-de-tienda.cjs — TANDA A: la tarjeta de tienda del perfil.
//
// Comprueba contra la API real lo que la especificación pide y lo que decidimos:
//   1. La tarjeta sale en UNA petición y trae el nombre COMERCIAL, el logo y la puntuación
//      CON `ratingCount` (que es lo que permite NO enseñar estrellas cuando no hay reseñas).
//   2. Los destacados se eligen A MANO, en orden, y como máximo 3.
//   3. Un producto que no es tuyo (o no está activo) NO se puede destacar.
//   4. La descripción corta viaja en la tarjeta (la que pide la rejilla).
//   5. Si la persona no tiene tienda, la respuesta es `shop: null` (sin hueco vacío).
//   6. Al terminar, los destacados quedan como estaban (ninguno).
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
  const ADM = await login('+240999888777', '123456');   // tiene tienda con 25 productos
  const A = await login('+240222000123', 'MiClave123'); // tiene OTRA tienda (para el caso ajeno)
  console.log(`dueño de la tienda = ${ADM.nombre}   otra tienda = ${A.nombre}`);

  const miShop = await req('GET', '/lifebook/commerce/my/shop', ADM.tok);
  const shop = miShop.b?.shop;
  ok(!!shop?.id, `ADMIN tiene tienda (${shop?.name})`);
  const mios = await req('GET', '/lifebook/commerce/my/products', ADM.tok);
  const productos = (mios.b?.products ?? mios.b?.items ?? []);
  const activos = productos.filter((p) => p.status === 'active').map((p) => p.id);
  console.log(`  (${activos.length} productos activos míos)`);
  ok(activos.length >= 4, 'hay al menos 4 productos activos para probar');

  const ajenos = (await req('GET', '/lifebook/commerce/my/products', A.tok)).b;
  const productoAjeno = (ajenos?.products ?? ajenos?.items ?? []).find((p) => p.status === 'active')?.id;

  try {
    console.log('\n=== 1. LA TARJETA LLEGA EN UNA PETICIÓN Y SIN SESIÓN ===');
    const card = await req('GET', `/lifebook/commerce/users/${ADM.id}/shop-card`, null);
    ok(card.s === 200, `es pública: responde sin token (HTTP ${card.s})`, JSON.stringify(card.b).slice(0, 160));
    ok(card.b?.shop?.name === shop.name, `trae el nombre COMERCIAL (${card.b?.shop?.name})`);
    ok('ratingCount' in (card.b?.shop ?? {}), `trae ratingCount (${card.b?.shop?.ratingCount}) — es lo que decide si se pintan estrellas`);
    ok(card.b?.shop?.rating === 0 && card.b?.shop?.ratingCount === 0,
      'y hoy valen 0: la app NO debe pintar puntuación (la especificación lo prohíbe sin reseñas)');
    ok('logoUrl' in (card.b?.shop ?? {}) && 'description' in (card.b?.shop ?? {}), 'trae logo y descripción para la cabecera');

    console.log('\n=== 2. LOS DESTACADOS SE ELIGEN A MANO, EN ORDEN, MÁXIMO 3 ===');
    const tres = activos.slice(0, 3);
    const puesto = await req('PUT', '/lifebook/commerce/my/shop/featured', ADM.tok, { productIds: tres });
    ok(puesto.s === 200, `se guardan los 3 destacados (HTTP ${puesto.s})`, JSON.stringify(puesto.b).slice(0, 200));
    ok((puesto.b?.featured ?? []).length === 3, `la respuesta trae 3 destacados (${puesto.b?.featured?.length})`);
    ok(JSON.stringify((puesto.b?.featured ?? []).map((f) => f.id)) === JSON.stringify(tres),
      'y salen EN EL ORDEN en que los puse (el 1º se ve primero)');

    const card2 = await req('GET', `/lifebook/commerce/users/${ADM.id}/shop-card`, A.tok);
    ok((card2.b?.featured ?? []).length === 3, `otro usuario ve los 3 destacados (${card2.b?.featured?.length})`);
    const f0 = card2.b.featured[0];
    ok(f0?.id === tres[0] && f0?.position === 1, `el primero es el primero, con su puesto (${f0?.position})`);
    ok(!!f0?.title && 'priceXaf' in f0, `trae título y precio para la miniatura (${f0?.title} · ${f0?.priceXaf})`);
    ok('shortDescription' in f0, `y trae la DESCRIPCIÓN CORTA que pide la rejilla («${f0?.shortDescription ?? ''}»)`);
    ok('coverUrl' in f0, 'y la foto de portada');

    console.log('\n=== 3. MÁS DE 3: SE QUEDAN LOS TRES PRIMEROS (no se pierde la petición) ===');
    const cinco = activos.slice(0, 5);
    const recortado = await req('PUT', '/lifebook/commerce/my/shop/featured', ADM.tok, { productIds: cinco });
    ok((recortado.b?.featured ?? []).length === 3, `solo quedan 3 (${recortado.b?.featured?.length})`);
    ok(JSON.stringify((recortado.b?.featured ?? []).map((f) => f.id)) === JSON.stringify(cinco.slice(0, 3)),
      'y son los tres primeros que mandé');

    console.log('\n=== 4. NO SE PUEDE DESTACAR LO QUE NO ES TUYO ===');
    if (productoAjeno) {
      const ajeno = await req('PUT', '/lifebook/commerce/my/shop/featured', ADM.tok, { productIds: [productoAjeno] });
      ok(ajeno.s === 400 && errCode(ajeno) === 'PRODUCT_NOT_MINE',
        `un producto de otra tienda se rechaza (HTTP ${ajeno.s} ${errCode(ajeno)})`, JSON.stringify(ajeno.b).slice(0, 160));
      const sigue = await req('GET', `/lifebook/commerce/users/${ADM.id}/shop-card`, ADM.tok);
      ok((sigue.b?.featured ?? []).length === 3, 'y lo que ya estaba destacado NO se ha perdido');
    } else {
      console.log('  (la otra cuenta no tiene productos activos: no se pudo probar)');
    }

    console.log('\n=== 5. QUIEN NO TIENE TIENDA NO TIENE TARJETA ===');
    // Usuario REAL sin tienda (comprobado en la base: no aparece en lifebook.shops.owner_id).
    // No se usa una cuenta con tienda ni un uuid inventado: así se prueba el caso de verdad.
    const SIN_TIENDA = '30af20a3-3207-4be9-a826-def60c3a3437'; // «Usuario Gating B»
    const sinTienda = await req('GET', `/lifebook/commerce/users/${SIN_TIENDA}/shop-card`, null);
    ok(sinTienda.s === 200 && sinTienda.b?.shop === null,
      `un usuario sin tienda responde shop:null (HTTP ${sinTienda.s}, shop=${JSON.stringify(sinTienda.b?.shop)})`,
      JSON.stringify(sinTienda.b).slice(0, 160));

    console.log('\n=== 6. SIN SESIÓN NO SE PUEDE CAMBIAR NADA ===');
    const sinSesion = await req('PUT', '/lifebook/commerce/my/shop/featured', null, { productIds: [] });
    ok(sinSesion.s === 401, `cambiar destacados sin token se rechaza (HTTP ${sinSesion.s})`);
  } finally {
    console.log('\n=== 7. SE DEJAN LOS DESTACADOS COMO ESTABAN (ninguno) ===');
    const limpio = await req('PUT', '/lifebook/commerce/my/shop/featured', ADM.tok, { productIds: [] });
    ok((limpio.b?.featured ?? []).length === 0, `quedan 0 destacados (${limpio.b?.featured?.length})`);
  }

  console.log(`\n=== RESULTADO: ${pass} PASA, ${fail} FALLA ===`);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e.message); process.exit(2); });
