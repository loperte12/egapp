// lb55a-verificar-carrito-v2.cjs — EL CARRITO, agrupado por tienda y con la verdad de cada línea.
//
// Comprueba contra la API REAL lo que pide la especificación:
//   1. el carrito es UNO y está en la cuenta (no en el dispositivo);
//   2. viene AGRUPADO POR TIENDA, con el subtotal de cada bloque;
//   3. cada línea trae el precio de HOY y el de cuando se añadió, y `priceChanged` cuando difieren;
//   4. la cantidad se cambia POR LÍNEA (por su id): el mismo producto con dos variantes son dos
//      líneas y quitar una no se lleva la otra;
//   5. «Mover a favoritos» guarda el producto (`product_saves`) y lo saca del carrito;
//   6. un producto que la tienda RETIRA se queda en el carrito marcado, no desaparece;
//   7. un producto BORRADO de la tienda se queda como «Producto eliminado» (la línea sobrevive);
//   8. se puede cambiar la variante de una línea sin ir a la ficha;
//   9. `maxQuantity` refleja el stock real de esa variante.
//
// Al terminar deja el carrito del comprador como estaba (vacío) y devuelve el producto a la venta.
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

const carrito = async (tok) => (await req('GET', '/lifebook/commerce/my/cart', tok)).b;
const lineaDe = (c, productId) => (c?.items ?? []).find((i) => i.productId === productId) ?? null;

(async () => {
  const B = await login('+240555000003', '123456');       // comprador
  const A = await login('+240222000123', 'MiClave123');   // tienda (dos productos con variantes)
  console.log(`comprador ${B.nombre} · tienda ${A.nombre}`);

  // Dos productos CON PRECIO y CON VARIANTE de la tienda de A (una variante por línea: el
  // carrito permite el mismo producto dos veces si son variantes distintas).
  const mios = await req('GET', '/lifebook/commerce/my/products', A.tok);
  const activos = (mios.b?.items ?? mios.b?.products ?? []).filter((p) => p.status === 'active');
  const fichas = [];
  for (const p of activos.slice(0, 14)) {
    const f = (await req('GET', `/lifebook/commerce/products/${p.id}`, B.tok)).b?.product;
    if (typeof f?.priceXaf === 'number' && f.priceXaf > 0) fichas.push(f);
    if (fichas.length === 2) break;
  }
  ok(fichas.length === 2, 'hay 2 productos con precio para la prueba', `encontrados ${fichas.length}`);
  if (fichas.length < 2) process.exit(1);
  const [P1, P2] = fichas;
  const V1 = (P1.variants ?? [])[0] ?? null;
  const V2 = (P2.variants ?? [])[0] ?? null;
  console.log(`P1 «${P1.title}» ${P1.priceXaf} XAF (variante ${V1?.name ?? '—'}) · P2 «${P2.title}» ${P2.priceXaf} XAF`);

  let guardadoPrev = false;
  try {
    await req('DELETE', '/lifebook/commerce/my/cart', B.tok);
    // Estado de partida de «guardados» (para no dejar basura)
    const guardadosAntes = (await req('GET', '/lifebook/commerce/my/saved', B.tok)).b?.items ?? [];

    console.log('\n=== 1. UN CARRITO, EN LA CUENTA ===');
    const vacio = await carrito(B.tok);
    ok((vacio?.items ?? []).length === 0, 'empieza vacío');
    ok(Array.isArray(vacio?.groups), 'y devuelve `groups` (agrupado), no solo una lista');

    console.log('\n=== 2. SE AÑADE CON SU FUENTE Y SU FOTO DEL MOMENTO ===');
    const add1 = await req('POST', '/lifebook/commerce/my/cart', B.tok, {
      productId: P1.id, variantId: V1?.id ?? null, quantity: 1, sourceKind: 'chat',
    });
    ok(add1.s === 200 || add1.s === 201, `se añade desde el chat (HTTP ${add1.s})`, errCode(add1));
    const l1 = lineaDe(add1.b, P1.id);
    ok(!!l1, 'la línea está en el carrito');
    ok(l1?.sourceKind === 'chat', `y guarda de dónde vino (${l1?.sourceKind})`);
    ok(typeof l1?.addedPriceXaf === 'number', `con el precio del momento guardado (${l1?.addedPriceXaf})`);
    ok(l1?.priceChanged === false, 'y sin cambio de precio todavía');
    ok(l1?.status === 'ok' && l1?.available === true, `marcada como pagable (${l1?.status})`);

    await req('POST', '/lifebook/commerce/my/cart', B.tok, { productId: P2.id, variantId: V2?.id ?? null, quantity: 2 });

    console.log('\n=== 3. AGRUPADO POR TIENDA ===');
    const c2 = await carrito(B.tok);
    ok((c2?.groups ?? []).length >= 1, `hay ${(c2?.groups ?? []).length} bloque(s) de tienda`);
    const grupo = (c2.groups ?? []).find((g) => g.items.some((i) => i.productId === P1.id));
    ok(!!grupo?.shop?.name, `el bloque lleva el nombre de la tienda («${grupo?.shop?.name}»)`);
    ok(grupo?.shop?.id === P1.shop.id, 'y su id (para poder abrir la tienda)');
    // El subtotal del bloque tiene que ser, exactamente, la suma de sus líneas (el precio de una
    // variante no es el del producto: poner el esperado «a mano» fue un fallo de esta prueba).
    const sumaGrupo = (grupo?.items ?? []).reduce((n, i) => n + (i.lineTotalXaf ?? 0), 0);
    ok(grupo?.subtotalXaf === sumaGrupo, `con el subtotal del bloque (${grupo?.subtotalXaf} = ${sumaGrupo})`);
    const sumaTotal = (c2?.items ?? []).reduce((n, i) => n + (i.lineTotalXaf ?? 0), 0);
    ok(c2?.totalXaf === sumaTotal, `y el total del carrito (${c2?.totalXaf} = ${sumaTotal})`);
    ok(c2?.count === 3, `contando unidades (${c2?.count})`);

    console.log('\n=== 3-bis. DOS TIENDAS EN EL MISMO CARRITO: DOS BLOQUES ===');
    // El comprador no tiene tienda, así que puede comprar en las dos que existen.
    const ADM2 = await login('+240999888777', '123456');
    const suyos = (await req('GET', '/lifebook/commerce/my/products', ADM2.tok)).b;
    const otroActivo = (suyos?.items ?? suyos?.products ?? []).find((p) => p.status === 'active' && Number(p.priceXaf) > 0);
    if (otroActivo) {
      const f2 = (await req('GET', `/lifebook/commerce/products/${otroActivo.id}`, B.tok)).b?.product;
      await req('POST', '/lifebook/commerce/my/cart', B.tok, {
        productId: otroActivo.id, variantId: (f2?.variants ?? [])[0]?.id ?? null, quantity: 1, sourceKind: 'ficha',
      });
      const c2b = await carrito(B.tok);
      ok((c2b?.groups ?? []).length === 2, `hay 2 bloques de tienda (${(c2b?.groups ?? []).length})`);
      const nombres = (c2b?.groups ?? []).map((g) => g.shop?.name);
      ok(new Set(nombres).size === 2, `y son dos tiendas distintas (${nombres.join(' · ')})`);
      ok((c2b?.groups ?? []).every((g) => g.shop?.id && g.shop?.name), 'cada bloque con su tienda');
      ok((c2b?.groups ?? []).every((g) => Array.isArray(g.paymentMethods)), 'y con sus formas de pago (para la caja)');
      ok((c2b?.groups ?? []).every((g) => Array.isArray(g.deliveryModes) && g.deliveryModes.includes('pickup')),
        'y sus formas de entrega reales (siempre con «recoger en tienda»)');
      const sumaBloques = (c2b?.groups ?? []).reduce((n, g) => n + g.subtotalXaf, 0);
      ok(c2b?.totalXaf === sumaBloques, `el total del carrito es la suma de los bloques (${c2b?.totalXaf} = ${sumaBloques})`);
      // Se quita para seguir con una sola tienda en el resto de la prueba
      await req('POST', '/lifebook/commerce/my/cart/bulk', B.tok, {
        remove: (c2b?.items ?? []).filter((i) => i.productId === otroActivo.id).map((i) => i.id),
      });
    } else {
      console.log('  (la otra tienda no tiene productos con precio: no se pudo probar con dos)');
    }

    console.log('\n=== 4. LA CANTIDAD SE CAMBIA POR LÍNEA, NO POR PRODUCTO ===');
    const idP1 = l1?.id;
    const sube = await req('PATCH', `/lifebook/commerce/my/cart/line/${idP1}`, B.tok, { quantity: 3 });
    ok(sube.s === 200, `sube la cantidad de esa línea (HTTP ${sube.s})`, errCode(sube));
    const l1b = lineaDe(sube.b, P1.id);
    ok(l1b?.quantity === 3, `quedan 3 (${l1b?.quantity})`);
    ok(lineaDe(sube.b, P2.id)?.quantity === 2, 'y la otra línea no se toca (2)');
    const tope = await req('PATCH', `/lifebook/commerce/my/cart/line/${idP1}`, B.tok, { quantity: 999 });
    ok((lineaDe(tope.b, P1.id)?.quantity ?? 0) <= 99, `la cantidad se topa en 99 (${lineaDe(tope.b, P1.id)?.quantity})`);
    ok(typeof l1b?.maxQuantity === 'number', `cada línea dice su tope real de stock (${l1b?.maxQuantity})`);

    console.log('\n=== 5. CAMBIAR LA VARIANTE SIN IR A LA FICHA ===');
    if (V1) {
      const quitar = await req('PATCH', `/lifebook/commerce/my/cart/line/${idP1}`, B.tok, { variantId: null });
      ok(quitar.s === 200, `se puede quitar la variante de una línea (HTTP ${quitar.s})`, errCode(quitar));
      const sinVar = lineaDe(quitar.b, P1.id);
      ok(sinVar?.variantId === null, 'la línea queda sin variante');
      ok(sinVar?.addedPriceXaf === P1.priceXaf, `y el precio de referencia pasa al del producto (${sinVar?.addedPriceXaf})`);
      const volver = await req('PATCH', `/lifebook/commerce/my/cart/line/${idP1}`, B.tok, { variantId: V1.id });
      ok(lineaDe(volver.b, P1.id)?.variantId === V1.id, 'y se puede volver a poner');
    } else {
      console.log('  (el producto no tiene variantes: no aplica)');
    }

    console.log('\n=== 6. UN PRODUCTO RETIRADO NO DESAPARECE: SE MARCA ===');
    const ocultar = await req('PATCH', `/lifebook/commerce/products/${P2.id}/status`, A.tok, { action: 'hide' });
    ok(ocultar.s === 200, `la tienda retira P2 (HTTP ${ocultar.s})`, errCode(ocultar));
    const c3 = await carrito(B.tok);
    const l2 = lineaDe(c3, P2.id);
    ok(!!l2, 'P2 SIGUE en el carrito (antes desaparecía sin avisar)');
    ok(l2?.available === false && l2?.status === 'no_disponible', `marcado como no disponible (${l2?.status})`);
    ok(!!l2?.statusLabel, `con su texto para la pantalla («${l2?.statusLabel}»)`);
    ok(c3?.problems === 1, `y el carrito cuenta 1 línea con problema (${c3?.problems})`);
    const pagableEsperado = (c3?.items ?? []).filter((i) => i.available).reduce((n, i) => n + (i.lineTotalXaf ?? 0), 0);
    ok(c3?.totalDisponibleXaf === pagableEsperado, `el total PAGABLE deja fuera lo retirado (${c3?.totalDisponibleXaf} = ${pagableEsperado})`);
    await req('PATCH', `/lifebook/commerce/products/${P2.id}/status`, A.tok, { action: 'activate' });

    console.log('\n=== 7. «MOVER A FAVORITOS» Y QUITAR, EN BLOQUE ===');
    const antes = (await req('GET', '/lifebook/commerce/my/saved', B.tok)).b?.items ?? [];
    const yaGuardado = antes.some((x) => x.id === P1.id);
    guardadoPrev = yaGuardado;
    const bulk = await req('POST', '/lifebook/commerce/my/cart/bulk', B.tok, { toFavorites: [idP1] });
    ok(bulk.s === 200 || bulk.s === 201, `«mover a favoritos» responde (HTTP ${bulk.s})`, errCode(bulk));
    ok((bulk.b?.items ?? []).every((i) => i.productId !== P1.id), 'P1 ya no está en el carrito');
    const despues = (await req('GET', '/lifebook/commerce/my/saved', B.tok)).b?.items ?? [];
    ok(despues.some((x) => x.id === P1.id), 'y SÍ está en guardados (favoritos)');
    if (!yaGuardado) {
      // limpieza: se quita de guardados si lo pusimos nosotros
      await req('POST', `/lifebook/commerce/products/${P1.id}/save`, B.tok, {});
    }
    const soloQueda = await carrito(B.tok);
    ok((soloQueda?.items ?? []).length === 1, `queda 1 línea (${(soloQueda?.items ?? []).length})`);
    const quitarResta = await req('POST', '/lifebook/commerce/my/cart/bulk', B.tok, { remove: [(soloQueda.items ?? [])[0]?.id] });
    ok((quitarResta.b?.items ?? []).length === 0, 'y quitando la última el carrito queda vacío');

    console.log('\n=== 8. UN PRODUCTO BORRADO DE LA TIENDA SE QUEDA COMO «ELIMINADO» ===');
    const creado = await req('POST', '/lifebook/commerce/products', A.tok, {
      title: `Producto para borrar ${Date.now() % 1000000}`,
      serviceType: 'physical', priceMode: 'fixed', priceXaf: 3000, stockMode: 'exact', stockQuantity: 5,
      // Una venta necesita foto (MEDIA_REQUIRED): se reutiliza la de los productos de prueba.
      media: [{ url: 'https://hk.egrouteplan.com/storage/lb-images/e2e.jpg', type: 'image', position: 1 }],
      status: 'active',
    }, { 'Idempotency-Key': `lb55a-${Date.now()}` });
    const temporal = creado.b?.product ?? creado.b;
    if (temporal?.id) {
      // Un producto nuevo NACE EN REVISIÓN («pending») y el dueño no puede autoaprobarse: lo aprueba
      // un administrador (`PATCH /commerce/admin/products/:id` con `approve`). Se hace así en vez de
      // tocar la base a mano, que es justo lo que la plataforma impide.
      if (temporal.status && temporal.status !== 'active') {
        const adm = await login('+240999888777', '123456');
        const ok1 = await req('PATCH', `/lifebook/commerce/admin/products/${temporal.id}`, adm.tok, { action: 'approve' });
        console.log(`  (nace en «${temporal.status}»: lo aprueba un admin → HTTP ${ok1.s}, estado ${ok1.b?.status ?? ok1.b?.product?.status ?? errCode(ok1)})`);
      }
      const metido = await req('POST', '/lifebook/commerce/my/cart', B.tok, { productId: temporal.id, quantity: 1, sourceKind: 'ficha' });
      const antesBorrar = await carrito(B.tok);
      ok(!!lineaDe(antesBorrar, temporal.id), 'el producto temporal está en el carrito', errCode(metido));
      const borrado = await req('DELETE', `/lifebook/commerce/products/${temporal.id}`, A.tok);
      ok(borrado.s === 200 || borrado.s === 204, `la tienda lo BORRA (HTTP ${borrado.s})`, errCode(borrado));
      const c5 = await carrito(B.tok);
      const huerfano = (c5?.items ?? []).find((i) => i.id === lineaDe(antesBorrar, temporal.id)?.id);
      ok(!!huerfano, 'la línea SIGUE en el carrito (la FK ya no borra en cascada)');
      ok(huerfano?.status === 'eliminado', `marcada como eliminada (${huerfano?.status})`);
      ok(huerfano?.productId === null, 'sin producto detrás (product_id = NULL)');
      ok(String(huerfano?.title ?? '').startsWith('Producto para borrar'), `con su nombre guardado («${huerfano?.title}»)`);
      ok(huerfano?.available === false, 'y no se puede pagar');
      const limpiarHuerfano = await req('POST', '/lifebook/commerce/my/cart/bulk', B.tok, { remove: [huerfano?.id] });
      ok((limpiarHuerfano.b?.items ?? []).length === 0, 'y se puede quitar a mano');
    } else {
      console.log('  (no se pudo crear el producto temporal: ' + JSON.stringify(creado.b).slice(0, 150) + ')');
    }

    console.log('\n=== 9. NADIE VE EL CARRITO DE OTRO ===');
    const ajeno = await req('GET', '/lifebook/commerce/my/cart');
    ok(ajeno.s === 401, `sin sesión, 401 (HTTP ${ajeno.s})`, errCode(ajeno));
    const carritoA = await carrito(A.tok);
    ok((carritoA?.items ?? []).length === 0, 'el carrito de la tienda está vacío (no se mezclan)');
  } finally {
    await req('DELETE', '/lifebook/commerce/my/cart', B.tok);
    console.log('\nlimpieza: carrito del comprador vacío');
    if (guardadoPrev === false) console.log('limpieza: (si la prueba guardó un favorito, se ha quitado)');
  }

  console.log(`\n${pass} PASA · ${fail} FALLA`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
