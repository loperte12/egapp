// lb60a-verificar-opciones.cjs — OPCIONES DEL PRODUCTO (tanda K: «elegir antes de comprar»).
//
// Comprueba contra la API REAL que:
//   1. el comerciante configura los EJES de su producto (Talla + Color) y sus COMBINACIONES con
//      precio y stock, y todo eso se guarda tal cual;
//   2. cada color lleva la FOTO REAL del producto en ese color (y el servidor NO admite un color
//      sin foto, ni una foto que no sea de ese producto);
//   3. la combinación HEREDA la foto del color: el carrito enseña la prenda del color comprado;
//   4. se lee en PÚBLICO (es lo que necesita el selector que se abre al pulsar Comprar);
//   5. lo que no tiene sentido se rechaza con 400 y SIN tocar lo que ya estaba bien;
//   6. una combinación que no encaja con los ejes no se puede guardar (una talla que no existe no
//      se puede comprar);
//   7. corregir el precio de una combinación NO devuelve la publicación a revisión y NO cambia el
//      identificador de la combinación (el carrito de quien la tenía no se rompe);
//   8. al añadir al carrito, la línea dice la combinación y vale lo que vale ESA combinación;
//   9. nadie toca las opciones de un producto ajeno;
//  10. el ALOJAMIENTO sigue fuera de este camino (se reserva por fechas y huéspedes).
//
// Al terminar borra el producto de prueba, deja el producto de siempre como estaba y vacía el
// carrito del comprador. También retira los ejes del producto que usó para el carrito.
const API = 'https://hk.egrouteplan.com/wallet/api/v1';
const { prepararRed } = require('./red.cjs');

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

const ejeTalla = () => ({ code: 'talla', label: 'Talla', kind: 'size', chartKind: 'top', values: [{ value: 'S' }, { value: 'M' }, { value: 'L' }] });
const ejeColor = (rojo, azul) => ({
  code: 'color', label: 'Color', kind: 'color',
  values: [
    { value: 'Rojo', imageUrl: rojo, hex: '#C0392B' },
    { value: 'Azul', imageUrl: azul, hex: '#2C3E50' },
  ],
});
const combos = (precioL = 12000) => ([
  { name: 'Rojo · S', attributes: { color: 'Rojo', talla: 'S' }, priceXaf: 12000, stockQuantity: 3 },
  { name: 'Rojo · M', attributes: { color: 'Rojo', talla: 'M' }, priceXaf: 12000, stockQuantity: 2 },
  { name: 'Rojo · L', attributes: { color: 'Rojo', talla: 'L' }, priceXaf: precioL, stockQuantity: 0 },
  { name: 'Azul · M', attributes: { color: 'Azul', talla: 'M' }, priceXaf: 13500, stockQuantity: 1 },
]);
const valorDe = (opts, code) => (opts ?? []).find((o) => o.code === code);
const comboDe = (vs, color, talla) => (vs ?? []).find((v) => v?.attributes?.color === color && v?.attributes?.talla === talla);

(async () => {
  console.log(`red: ${await prepararRed()}`);
  const A = await login('+240222000123', 'MiClave123');    // tienda
  const B = await login('+240555000003', '123456');        // comprador
  const ADM = await login('+240999888777', '123456');      // otra tienda
  console.log(`tienda ${A.nombre} · comprador ${B.nombre}`);

  // Dos FOTOS REALES del servidor (dos portadas distintas de productos de la misma tienda) para
  // que cada color tenga la suya: así se comprueba que el color no es una palabra, es una foto.
  const suyos = (await req('GET', '/lifebook/commerce/my/products', A.tok)).b?.items ?? [];
  const fotos = [...new Set(suyos.map((p) => p.coverUrl).filter(Boolean))].slice(0, 2);
  ok(fotos.length === 2, `hay dos fotos reales para los dos colores (${fotos.length})`);
  if (fotos.length < 2) process.exit(1);

  let nuevoId = null;
  const activo = suyos.find((p) => p.status === 'active' && Number(p.variants ?? 0) >= 1);
  let originalVar = null;
  let activoTeniaEjes = false;

  try {
    console.log('\n=== 1. EL COMERCIANTE CONFIGURA LOS EJES AL PUBLICAR (Talla + Color con foto) ===');
    const alta = await req('POST', '/lifebook/commerce/products', A.tok, {
      serviceType: 'physical',
      title: `Prueba opciones ${Math.floor(Math.random() * 900000 + 100000)}`,
      priceMode: 'fixed', priceXaf: 12000, stockMode: 'exact', stockQuantity: 20, condition: 'new',
      originCity: 'Malabo',
      media: fotos.map((url) => ({ url, type: 'image' })),
      options: [ejeTalla(), ejeColor(fotos[0], fotos[1])],
      variants: combos(),
    });
    ok(alta.s === 200 || alta.s === 201, `el producto se publica con sus ejes (HTTP ${alta.s})`, errCode(alta));
    nuevoId = alta.b?.product?.id ?? alta.b?.id ?? null;
    ok(!!nuevoId, `con identificador (${nuevoId})`);
    if (!nuevoId) process.exit(1);

    const ejes = alta.b?.product?.options ?? alta.b?.options ?? [];
    ok(ejes.length === 2, `quedan 2 ejes (${ejes.length})`);
    const talla = valorDe(ejes, 'talla');
    const color = valorDe(ejes, 'color');
    ok(talla?.kind === 'size' && talla?.chartKind === 'top', `la Talla es un eje de tallas con su tabla (${talla?.chartKind})`);
    ok((talla?.values ?? []).map((v) => v.value).join(',') === 'S,M,L', `con sus valores en orden (${(talla?.values ?? []).map((v) => v.value).join(' · ')})`);
    ok(color?.kind === 'color', 'el Color es un eje de color');
    const rojo = (color?.values ?? []).find((v) => v.value === 'Rojo');
    const azul = (color?.values ?? []).find((v) => v.value === 'Azul');
    ok(rojo?.imageUrl === fotos[0], 'el ROJO trae la primera foto real del producto');
    ok(azul?.imageUrl === fotos[1], 'y el AZUL trae OTRA foto real distinta (no la palabra «color»)');
    ok(azul?.imageUrl !== rojo?.imageUrl, 'las dos fotos son distintas');

    const vs = alta.b?.product?.variants ?? [];
    ok(vs.length === 4, `y 4 combinaciones (${vs.length})`);
    const rojoM = comboDe(vs, 'Rojo', 'M');
    const azulM = comboDe(vs, 'Azul', 'M');
    const rojoL = comboDe(vs, 'Rojo', 'L');
    ok(rojoM?.priceXaf === 12000, `cada combinación con su precio (Rojo · M = ${rojoM?.priceXaf})`);
    ok(azulM?.priceXaf === 13500, `y precios distintos por combinación (Azul · M = ${azulM?.priceXaf})`);
    ok(rojoM?.stockQuantity === 2 && rojoL?.stockQuantity === 0, `y su stock (Rojo · M = ${rojoM?.stockQuantity}, Rojo · L = ${rojoL?.stockQuantity} agotada)`);
    ok(rojoM?.imageUrl === fotos[0], 'la combinación ROJA se lleva la foto del color rojo');
    ok(azulM?.imageUrl === fotos[1], 'y la AZUL la del azul');

    console.log('\n=== 2. SE LEE EN PÚBLICO (lo que necesita el selector) ===');
    const publico = await req('GET', `/lifebook/commerce/products/${nuevoId}/options`, null);
    ok(publico.s === 200, `sin sesión se leen los ejes (HTTP ${publico.s})`, errCode(publico));
    ok((publico.b?.options ?? []).length === 2, `con los 2 ejes (${(publico.b?.options ?? []).length})`);
    const colorPub = valorDe(publico.b?.options, 'color');
    ok((colorPub?.values ?? []).some((v) => v.imageUrl === fotos[0]), 'y la foto de cada color viaja al comprador');
    const mio = await req('GET', `/lifebook/commerce/products/${nuevoId}`, A.tok);
    ok((mio.b?.product?.options ?? []).length === 2, 'la ficha trae los ejes');
    ok((mio.b?.product?.variants ?? []).length === 4, 'y las combinaciones, para saber qué está agotado');

    console.log('\n=== 3. LO QUE NO TIENE SENTIDO SE RECHAZA (y no toca lo bueno) ===');
    const sinFoto = await req('PUT', `/lifebook/commerce/products/${nuevoId}/options`, A.tok, {
      options: [ejeTalla(), { code: 'color', label: 'Color', kind: 'color', values: [{ value: 'Rojo' }] }],
    });
    ok(sinFoto.s === 400 && errCode(sinFoto) === 'OPTION_COLOR_PHOTO_REQUIRED', `un color sin foto → 400 ${errCode(sinFoto)}`, sinFoto.s);

    const fotoAjena = await req('PUT', `/lifebook/commerce/products/${nuevoId}/options`, A.tok, {
      options: [ejeTalla(), ejeColor('https://hk.egrouteplan.com/lb-images/covers/no-es-de-este-producto.jpg', fotos[1])],
    });
    ok(fotoAjena.s === 400 && errCode(fotoAjena) === 'OPTION_PHOTO_NOT_IN_PRODUCT', `una foto que no es de este producto → 400 ${errCode(fotoAjena)}`, fotoAjena.s);

    const fotoFuera = await req('PUT', `/lifebook/commerce/products/${nuevoId}/options`, A.tok, {
      options: [ejeColor('https://otro-sitio.example/rojo.jpg', fotos[1])],
    });
    ok(fotoFuera.s === 400 && errCode(fotoFuera) === 'OPTION_PHOTO_NOT_IN_PRODUCT', `una foto de fuera → 400 ${errCode(fotoFuera)}`, fotoFuera.s);

    const sinValores = await req('PUT', `/lifebook/commerce/products/${nuevoId}/options`, A.tok, {
      options: [{ code: 'talla', label: 'Talla', kind: 'size', values: [] }], variants: combos(),
    });
    ok(sinValores.s === 400 && errCode(sinValores) === 'OPTION_EMPTY', `un eje sin valores → 400 ${errCode(sinValores)}`, sinValores.s);

    const cuatro = await req('PUT', `/lifebook/commerce/products/${nuevoId}/options`, A.tok, {
      options: [ejeTalla(), ejeColor(fotos[0], fotos[1]), { code: 'x1', label: 'X1', kind: 'text', values: [{ value: 'a' }] }, { code: 'x2', label: 'X2', kind: 'text', values: [{ value: 'b' }] }],
    });
    ok(cuatro.s === 400 && errCode(cuatro) === 'OPTIONS_LIMIT', `más de 3 ejes → 400 ${errCode(cuatro)}`, cuatro.s);

    const repetido = await req('PUT', `/lifebook/commerce/products/${nuevoId}/options`, A.tok, {
      options: [ejeTalla(), { code: 'talla', label: 'Otra', kind: 'text', values: [{ value: 'a' }] }],
    });
    ok(repetido.s === 400 && errCode(repetido) === 'OPTION_CODE_DUPLICATED', `dos ejes con el mismo código → 400 ${errCode(repetido)}`, repetido.s);

    const tipoMalo = await req('PUT', `/lifebook/commerce/products/${nuevoId}/options`, A.tok, {
      options: [{ code: 'peso', label: 'Peso', kind: 'peso', values: [{ value: '1 kg' }] }],
    });
    ok(tipoMalo.s === 400 && errCode(tipoMalo) === 'OPTION_KIND_INVALID', `un tipo de eje inventado → 400 ${errCode(tipoMalo)}`, tipoMalo.s);

    const valorRepetido = await req('PUT', `/lifebook/commerce/products/${nuevoId}/options`, A.tok, {
      options: [{ code: 'talla', label: 'Talla', kind: 'size', chartKind: 'top', values: [{ value: 'M' }, { value: 'm' }] }],
    });
    ok(valorRepetido.s === 400 && errCode(valorRepetido) === 'OPTION_VALUE_DUPLICATED', `el mismo valor dos veces → 400 ${errCode(valorRepetido)}`, valorRepetido.s);

    const despues = await req('GET', `/lifebook/commerce/products/${nuevoId}/options`, null);
    const colorSigue = valorDe(despues.b?.options, 'color');
    ok((despues.b?.options ?? []).length === 2, `tras los intentos fallidos siguen los 2 ejes buenos (${(despues.b?.options ?? []).length})`);
    ok((colorSigue?.values ?? []).find((v) => v.value === 'Rojo')?.imageUrl === fotos[0], 'y el color rojo sigue con su foto real');

    console.log('\n=== 4. UNA COMBINACIÓN QUE NO ENCAJA NO SE PUEDE GUARDAR ===');
    const sinColor = await req('PUT', `/lifebook/commerce/products/${nuevoId}/options`, A.tok, {
      options: [ejeTalla(), ejeColor(fotos[0], fotos[1])],
      variants: [{ name: 'M', attributes: { talla: 'M' }, priceXaf: 12000, stockQuantity: 1 }],
    });
    ok(sinColor.s === 400 && errCode(sinColor) === 'VARIANT_OPTION_MISSING', `una combinación sin color → 400 ${errCode(sinColor)}`, sinColor.s);

    const colorInexistente = await req('PUT', `/lifebook/commerce/products/${nuevoId}/options`, A.tok, {
      options: [ejeTalla(), ejeColor(fotos[0], fotos[1])],
      variants: [{ name: 'Verde · M', attributes: { color: 'Verde', talla: 'M' }, priceXaf: 12000, stockQuantity: 1 }],
    });
    ok(colorInexistente.s === 400 && errCode(colorInexistente) === 'VARIANT_OPTION_UNKNOWN', `un color que no existe → 400 ${errCode(colorInexistente)}`, colorInexistente.s);

    const tallaFantasma = await req('PUT', `/lifebook/commerce/products/${nuevoId}/options`, A.tok, {
      options: [ejeTalla(), ejeColor(fotos[0], fotos[1])],
      variants: [{ name: 'Rojo · XXL', attributes: { color: 'Rojo', talla: 'XXL' }, priceXaf: 12000, stockQuantity: 1 }],
    });
    ok(tallaFantasma.s === 400 && errCode(tallaFantasma) === 'VARIANT_OPTION_UNKNOWN', `una talla que no está en el eje → 400 ${errCode(tallaFantasma)}`, tallaFantasma.s);

    const comboRepetido = await req('PUT', `/lifebook/commerce/products/${nuevoId}/options`, A.tok, {
      options: [ejeTalla(), ejeColor(fotos[0], fotos[1])],
      variants: [
        { name: 'Rojo · M', attributes: { color: 'Rojo', talla: 'M' }, priceXaf: 12000, stockQuantity: 1 },
        { name: 'Rojo M (otra vez)', attributes: { color: 'rojo', talla: 'm' }, priceXaf: 12000, stockQuantity: 1 },
      ],
    });
    ok(comboRepetido.s === 400 && errCode(comboRepetido) === 'VARIANT_COMBINATION_DUPLICATED', `la misma combinación dos veces → 400 ${errCode(comboRepetido)}`, comboRepetido.s);

    const sinCombos = await req('PUT', `/lifebook/commerce/products/${nuevoId}/options`, A.tok, {
      options: [ejeTalla(), ejeColor(fotos[0], fotos[1])], variants: [],
    });
    ok(sinCombos.s === 400 && errCode(sinCombos) === 'VARIANTS_REQUIRED', `ejes sin combinaciones → 400 ${errCode(sinCombos)}`, sinCombos.s);

    const siguen = await req('GET', `/lifebook/commerce/products/${nuevoId}/options`, null);
    ok((siguen.b?.variants ?? []).length === 4, `las 4 combinaciones buenas siguen intactas (${(siguen.b?.variants ?? []).length})`);

    console.log('\n=== 5. CORREGIR UN PRECIO NO DEVUELVE LA PUBLICACIÓN A REVISIÓN ===');
    const antes = (await req('GET', `/lifebook/commerce/products/${nuevoId}`, A.tok)).b?.product;
    const idRojoL = comboDe(antes?.variants, 'Rojo', 'L')?.id;
    const cambio = await req('PUT', `/lifebook/commerce/products/${nuevoId}/options`, A.tok, {
      options: [ejeTalla(), ejeColor(fotos[0], fotos[1])], variants: combos(11500),
    });
    ok(cambio.s === 200, `se guarda el cambio de precio (HTTP ${cambio.s})`, errCode(cambio));
    const despuesPrecio = (await req('GET', `/lifebook/commerce/products/${nuevoId}`, A.tok)).b?.product;
    ok(despuesPrecio?.status === antes?.status, `el estado NO cambia (sigue «${despuesPrecio?.status}»)`, `antes ${antes?.status}`);
    ok(comboDe(despuesPrecio?.variants, 'Rojo', 'L')?.priceXaf === 11500, `y el precio nuevo está (${comboDe(despuesPrecio?.variants, 'Rojo', 'L')?.priceXaf})`);
    ok(comboDe(despuesPrecio?.variants, 'Rojo', 'L')?.id === idRojoL, 'la combinación conserva su identificador (el carrito de quien la tenía no se rompe)');

    console.log('\n=== 6. AL AÑADIR AL CARRITO, LA LÍNEA DICE LA COMBINACIÓN ELEGIDA ===');
    ok(!!activo, `hay un producto activo de la tienda para el carrito (${activo?.title})`);
    if (activo) {
      const suyo = (await req('GET', `/lifebook/commerce/products/${activo.id}`, A.tok)).b?.product;
      originalVar = (suyo?.variants ?? []).map((v) => ({ name: v.name, priceXaf: v.priceXaf, stockQuantity: v.stockQuantity }));
      activoTeniaEjes = (suyo?.options ?? []).length > 0;
      const foto = (suyo?.media ?? [])[0]?.url;
      const pone = await req('PUT', `/lifebook/commerce/products/${activo.id}/options`, A.tok, {
        options: [ejeColor(foto, foto), { code: 'talla', label: 'Talla', kind: 'size', chartKind: 'top', values: [{ value: 'M' }, { value: 'L' }] }],
        variants: [
          { name: 'Rojo · M', attributes: { color: 'Rojo', talla: 'M' }, priceXaf: 12000, stockQuantity: 4 },
          { name: 'Rojo · L', attributes: { color: 'Rojo', talla: 'L' }, priceXaf: 12500, stockQuantity: 0 },
        ],
      });
      ok(pone.s === 200, `se le ponen ejes al producto activo (HTTP ${pone.s})`, errCode(pone));
      const varM = (pone.b?.variants ?? []).find((v) => v?.attributes?.talla === 'M');
      const anade = await req('POST', '/lifebook/commerce/my/cart', B.tok, { productId: activo.id, variantId: varM?.id, quantity: 2 });
      ok(anade.s === 200 || anade.s === 201, `el comprador añade la «Rojo · M» (HTTP ${anade.s})`, errCode(anade));
      const carrito = (await req('GET', '/lifebook/commerce/my/cart', B.tok)).b;
      const linea = (carrito?.items ?? []).find((i) => i.productId === activo.id);
      ok(linea?.variantName === 'Rojo · M', `la línea del carrito dice la combinación («${linea?.variantName}»)`, JSON.stringify(linea?.variantName));
      ok(linea?.priceXaf === 12000, `y vale lo que vale ESA combinación (${linea?.priceXaf})`);
      ok(linea?.coverUrl === foto, `y enseña la foto del color elegido (${String(linea?.coverUrl).slice(-24)})`);
      await req('DELETE', '/lifebook/commerce/my/cart', B.tok);
      const limpio = (await req('GET', '/lifebook/commerce/my/cart', B.tok)).b;
      ok((limpio?.items ?? []).length === 0, 'el carrito de la prueba queda vacío');
    }

    console.log('\n=== 7. NADIE TOCA LAS OPCIONES DE UN PRODUCTO AJENO ===');
    const ajeno = await req('PUT', `/lifebook/commerce/products/${nuevoId}/options`, ADM.tok, {
      options: [{ code: 'talla', label: 'Talla', kind: 'size', values: [{ value: 'M' }] }],
    });
    ok(ajeno.s === 404, `otra tienda intenta poner ejes → 404 (${ajeno.s})`, errCode(ajeno));

    console.log('\n=== 8. EL ALOJAMIENTO SIGUE FUERA DE ESTE CAMINO ===');
    const hotel = await req('POST', '/lifebook/commerce/products', A.tok, {
      serviceType: 'hotel_room', title: 'Habitación de prueba opciones', priceMode: 'fixed', priceXaf: 30000,
      stockMode: 'exact', stockQuantity: 1, media: fotos.map((url) => ({ url, type: 'image' })),
      options: [ejeTalla()], variants: [{ name: 'M', attributes: { talla: 'M' }, priceXaf: 30000, stockQuantity: 1 }],
    });
    // 409 y no 400: «esa publicación no se puede pedir por aquí» es un CONFLICTO con la regla del
    // alojamiento (se da de alta en el panel del hotel), no una petición mal formada.
    ok(hotel.s === 409 && errCode(hotel) === 'SERVICE_NOT_ORDERABLE', `una habitación no se publica por aquí → 409 ${errCode(hotel)}`, hotel.s);
    ok(String(hotel.b?.error?.message ?? '').includes('panel del hotel'), 'y se explica que se da de alta en el panel del hotel');

  } finally {
    console.log('\n=== LIMPIEZA ===');
    if (nuevoId) {
      const borrado = await req('DELETE', `/lifebook/commerce/products/${nuevoId}`, A.tok);
      ok(borrado.s === 200 || borrado.s === 204, `el producto de prueba se borra (HTTP ${borrado.s})`);
    }
    if (activo) {
      // El producto activo vuelve a como estaba: sin ejes y con su opción de siempre.
      const vuelta = await req('PUT', `/lifebook/commerce/products/${activo.id}/options`, A.tok, {
        options: [], variants: originalVar ?? [],
      });
      ok(vuelta.s === 200, `el producto activo vuelve a quedarse sin ejes (HTTP ${vuelta.s})`);
      ok((vuelta.b?.options ?? []).length === 0, 'y con 0 ejes');
      await req('DELETE', '/lifebook/commerce/my/cart', B.tok);
    }
  }

  console.log(`\n${pass} PASA · ${fail} FALLA`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
