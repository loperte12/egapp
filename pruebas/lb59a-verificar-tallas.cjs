// lb59a-verificar-tallas.cjs — TALLAS Y MEDIDAS (tanda J, puntos 1 y 2).
//
// Comprueba contra la API REAL:
//   1. el comerciante configura la tabla de tallas de SU producto, con MUJER y HOMBRE (varias tablas);
//   2. se lee en público (la mira quien va a comprar) con sus rangos en cm/kg;
//   3. se rechaza lo que no tiene sentido (sexo inválido, un rango al revés, tabla sin tallas);
//   4. otro comerciante NO puede tocar la tabla de un producto ajeno;
//   5. la persona guarda sus medidas de ROPA y de CALZADO por separado (una no obliga a la otra);
//   6. se rechazan medidas imposibles y una categoría que no existe;
//   7. la RECOMENDACIÓN compara con la tabla del producto y dice talla + razón + ajuste;
//   8. si la tienda NO ha configurado tabla, se dice y no se inventa una talla;
//   9. se pueden borrar las medidas (una categoría o todas).
//
// Al terminar deja el producto sin tabla y al comprador sin medidas.
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
  const A = await login('+240222000123', 'MiClave123');    // tienda
  const B = await login('+240555000003', '123456');        // comprador
  const ADM = await login('+240999888777', '123456');      // otra tienda (ajena)
  console.log(`tienda ${A.nombre} · comprador ${B.nombre}`);

  const mios = await req('GET', '/lifebook/commerce/my/products', A.tok);
  const prod = (mios.b?.items ?? []).find((p) => p.status === 'active');
  ok(!!prod, `hay un producto para la prueba (${prod?.title})`);
  if (!prod) process.exit(1);
  const ajenos = (await req('GET', '/lifebook/commerce/my/products', ADM.tok)).b?.items ?? [];
  const prodAjeno = ajenos.find((p) => p.status === 'active');

  const TABLA = {
    charts: [
      {
        gender: 'women', kind: 'top', notes: 'Tabla de mujer (prueba)',
        rows: [
          { sizeLabel: 'S', chestMinCm: 80, chestMaxCm: 86, waistMinCm: 62, waistMaxCm: 68, hipMinCm: 86, hipMaxCm: 92, heightMinCm: 150, heightMaxCm: 165, weightMinKg: 45, weightMaxKg: 55 },
          { sizeLabel: 'M', chestMinCm: 87, chestMaxCm: 93, waistMinCm: 69, waistMaxCm: 75, hipMinCm: 93, hipMaxCm: 99, heightMinCm: 160, heightMaxCm: 175, weightMinKg: 55, weightMaxKg: 68 },
          { sizeLabel: 'L', chestMinCm: 94, chestMaxCm: 101, waistMinCm: 76, waistMaxCm: 83, hipMinCm: 100, hipMaxCm: 107, heightMinCm: 168, heightMaxCm: 182, weightMinKg: 66, weightMaxKg: 80 },
        ],
      },
      {
        gender: 'men', kind: 'top', notes: 'Tabla de hombre (prueba)',
        rows: [
          { sizeLabel: 'M', chestMinCm: 94, chestMaxCm: 100, waistMinCm: 78, waistMaxCm: 84, heightMinCm: 168, heightMaxCm: 178, weightMinKg: 65, weightMaxKg: 78 },
          { sizeLabel: 'L', chestMinCm: 101, chestMaxCm: 108, waistMinCm: 85, waistMaxCm: 92, heightMinCm: 175, heightMaxCm: 185, weightMinKg: 76, weightMaxKg: 90 },
        ],
      },
      {
        gender: 'unisex', kind: 'shoes',
        rows: [{ sizeLabel: '42', footLengthMinCm: 26, footLengthMaxCm: 26, footWidthMinCm: 9, footWidthMaxCm: 10 }],
      },
    ],
  };

  try {
    console.log('\n=== 1. EL COMERCIANTE CONFIGURA SUS TABLAS (MUJER Y HOMBRE) ===');
    const guarda = await req('PUT', `/lifebook/commerce/products/${prod.id}/size-chart`, A.tok, TABLA);
    ok(guarda.s === 200, `se guardan (HTTP ${guarda.s})`, errCode(guarda));
    ok((guarda.b?.charts ?? []).length === 3, `quedan 3 tablas (${(guarda.b?.charts ?? []).length})`);
    const mujeres = (guarda.b?.charts ?? []).find((c) => c.gender === 'women' && c.kind === 'top');
    ok(!!mujeres, 'una es de MUJER');
    ok((mujeres?.rows ?? []).length === 3, `con 3 tallas (${(mujeres?.rows ?? []).length})`);
    const hombres = (guarda.b?.charts ?? []).find((c) => c.gender === 'men' && c.kind === 'top');
    ok(!!hombres, 'y otra de HOMBRE');
    const m = (mujeres?.rows ?? []).find((r) => r.sizeLabel === 'M');
    ok(m?.chestMinCm === 87 && m?.chestMaxCm === 93, `con sus rangos en cm (pecho ${m?.chestMinCm}-${m?.chestMaxCm})`);
    ok(m?.weightMinKg === 55 && m?.weightMaxKg === 68, `y en kg (${m?.weightMinKg}-${m?.weightMaxKg})`);
    const zapatos = (guarda.b?.charts ?? []).find((c) => c.kind === 'shoes');
    ok(zapatos?.rows?.[0]?.footLengthMinCm === 26, `y otra de calzado con el largo del pie (${zapatos?.rows?.[0]?.footLengthMinCm} cm)`);

    console.log('\n=== 2. SE LEE EN PÚBLICO ===');
    const lee = await req('GET', `/lifebook/commerce/products/${prod.id}/size-chart`, B.tok);
    ok(lee.s === 200, `la lee cualquiera que mire el producto (HTTP ${lee.s})`);
    ok((lee.b?.charts ?? []).length === 3, `con sus 3 tablas (${(lee.b?.charts ?? []).length})`);
    const sinSesion = await req('GET', `/lifebook/commerce/products/${prod.id}/size-chart`);
    ok(sinSesion.s === 200, `incluso sin sesión (HTTP ${sinSesion.s})`);

    console.log('\n=== 3. LO QUE NO TIENE SENTIDO SE RECHAZA ===');
    const genero = await req('PUT', `/lifebook/commerce/products/${prod.id}/size-chart`, A.tok, {
      charts: [{ gender: 'niños', kind: 'top', rows: [{ sizeLabel: 'S', chestMinCm: 80, chestMaxCm: 86 }] }],
    });
    ok(genero.s === 400 && errCode(genero) === 'SIZE_CHART_GENDER_INVALID', `sexo inválido (HTTP ${genero.s} ${errCode(genero)})`);
    const alReves = await req('PUT', `/lifebook/commerce/products/${prod.id}/size-chart`, A.tok, {
      charts: [{ gender: 'women', kind: 'top', rows: [{ sizeLabel: 'M', chestMinCm: 93, chestMaxCm: 87 }] }],
    });
    ok(alReves.s === 400 && errCode(alReves) === 'SIZE_RANGE_INVALID', `un rango al revés (HTTP ${alReves.s} ${errCode(alReves)})`);
    const vacia = await req('PUT', `/lifebook/commerce/products/${prod.id}/size-chart`, A.tok, {
      charts: [{ gender: 'women', kind: 'top', rows: [] }],
    });
    ok(vacia.s === 400 && errCode(vacia) === 'SIZE_CHART_EMPTY', `tabla sin tallas (HTTP ${vacia.s} ${errCode(vacia)})`);
    // La tabla buena sigue en pie tras los intentos fallidos
    ok(((await req('GET', `/lifebook/commerce/products/${prod.id}/size-chart`)).b?.charts ?? []).length === 3,
      'y la tabla buena no se ha tocado con los intentos fallidos');

    console.log('\n=== 4. NADIE TOCA LA TABLA DE OTRO ===');
    if (prodAjeno) {
      const intruso = await req('PUT', `/lifebook/commerce/products/${prodAjeno.id}/size-chart`, A.tok, TABLA);
      ok(intruso.s === 400 || intruso.s === 403 || intruso.s === 404, `un producto ajeno se rechaza (HTTP ${intruso.s} ${errCode(intruso)})`);
    } else {
      console.log('  (la otra tienda no tiene productos activos: no se pudo probar)');
    }

    console.log('\n=== 5. MIS MEDIDAS, POR CATEGORÍA INDEPENDIENTE ===');
    const cuerpo = await req('PUT', '/lifebook/commerce/my/measurements', B.tok, {
      category: 'body', gender: 'women', heightCm: 168, weightKg: 60, chestCm: 94, waistCm: 74, hipCm: 99,
    });
    ok(cuerpo.s === 200, `se guardan las de ropa (HTTP ${cuerpo.s})`, errCode(cuerpo));
    ok(cuerpo.b?.body?.chestCm === 94, `con el pecho (${cuerpo.b?.body?.chestCm})`);
    ok(cuerpo.b?.feet === null, 'y SIN medidas de calzado (una no obliga a la otra)');
    const pies = await req('PUT', '/lifebook/commerce/my/measurements', B.tok, { category: 'feet', footLengthCm: 26, footWidthCm: 9 });
    ok(pies.b?.feet?.footLengthCm === 26, `ahora las de calzado (${pies.b?.feet?.footLengthCm} cm)`);
    ok(pies.b?.body?.chestCm === 94, 'y las de ropa siguen ahí');
    const leidas = await req('GET', '/lifebook/commerce/my/measurements', B.tok);
    ok(leidas.b?.body?.heightCm === 168 && leidas.b?.feet?.footLengthCm === 26, 'se leen las dos categorías juntas');

    console.log('\n=== 6. MEDIDAS IMPOSIBLES ===');
    const locura = await req('PUT', '/lifebook/commerce/my/measurements', B.tok, { category: 'body', chestCm: 900 });
    ok(locura.s === 400 && errCode(locura) === 'MEASURE_INVALID', `un pecho de 900 cm se rechaza (HTTP ${locura.s} ${errCode(locura)})`);
    const sinNada = await req('PUT', '/lifebook/commerce/my/measurements', B.tok, { category: 'body' });
    ok(sinNada.s === 400 && errCode(sinNada) === 'MEASURE_REQUIRED', `sin ninguna medida de ropa (${errCode(sinNada)})`);
    const malaCat = await req('PUT', '/lifebook/commerce/my/measurements', B.tok, { category: 'cabeza', heightCm: 170 });
    ok(malaCat.s === 400 && errCode(malaCat) === 'MEASURE_CATEGORY_INVALID', `categoría que no existe (${errCode(malaCat)})`);

    console.log('\n=== 7. LA RECOMENDACIÓN ===');
    const reco = await req('POST', `/lifebook/commerce/products/${prod.id}/size-suggestion`, B.tok, {
      kind: 'top', gender: 'women', heightCm: 168, weightKg: 60, chestCm: 94, waistCm: 74,
    });
    ok(reco.s === 200 || reco.s === 201, `responde (HTTP ${reco.s})`, errCode(reco));
    ok(reco.b?.size === 'L', `recomienda una talla concreta (${reco.b?.size})`, JSON.stringify(reco.b).slice(0, 160));
    ok(['perfecto', 'holgado', 'ajustado'].includes(String(reco.b?.fit)), `con su nivel de ajuste (${reco.b?.fit})`);
    ok(String(reco.b?.reason ?? '').includes('pecho'), `y una razón que se entiende («${String(reco.b?.reason).slice(0, 90)}…»)`);
    ok(reco.b?.chartAvailable === true, 'diciendo que sí había tabla');

    const otraTalla = await req('POST', `/lifebook/commerce/products/${prod.id}/size-suggestion`, B.tok, {
      kind: 'top', gender: 'women', chestCm: 84, heightCm: 158, weightKg: 50,
    });
    ok(otraTalla.b?.size === 'S', `con medidas más pequeñas recomienda otra (${otraTalla.b?.size})`);

    const hombre = await req('POST', `/lifebook/commerce/products/${prod.id}/size-suggestion`, B.tok, {
      kind: 'top', gender: 'men', chestCm: 104, heightCm: 180, weightKg: 82,
    });
    ok(hombre.b?.size === 'L', `y usa la tabla de HOMBRE cuando se pide (${hombre.b?.size})`);

    const sinPecho = await req('POST', `/lifebook/commerce/products/${prod.id}/size-suggestion`, B.tok, { kind: 'top', gender: 'women', heightCm: 168 });
    ok(sinPecho.b?.size === null && String(sinPecho.b?.reason ?? '').includes('pecho'), `sin la medida clave lo dice, no adivina («${String(sinPecho.b?.reason).slice(0, 70)}…»)`);

    console.log('\n=== 8. SIN TABLA CONFIGURADA NO SE INVENTA NADA ===');
    await req('PUT', `/lifebook/commerce/products/${prod.id}/size-chart`, A.tok, { charts: [] });
    const sinTabla = await req('POST', `/lifebook/commerce/products/${prod.id}/size-suggestion`, B.tok, { kind: 'top', gender: 'women', chestCm: 94 });
    ok(sinTabla.b?.size === null, 'no recomienda ninguna talla');
    ok(sinTabla.b?.chartAvailable === false, 'y avisa de que no hay tabla');
    ok(String(sinTabla.b?.reason ?? '').includes('no ha configurado'), `con un motivo honesto («${String(sinTabla.b?.reason).slice(0, 80)}…»)`);

    console.log('\n=== 9. BORRAR MIS MEDIDAS ===');
    const borraPies = await req('DELETE', '/lifebook/commerce/my/measurements?category=feet', B.tok);
    ok(borraPies.s === 200, `se borran las de calzado (HTTP ${borraPies.s})`);
    ok(borraPies.b?.feet === null, 'y quedan vacías');
    ok(borraPies.b?.body?.chestCm === 94, 'mientras las de ropa siguen intactas');
    const borraTodo = await req('DELETE', '/lifebook/commerce/my/measurements', B.tok);
    ok(borraTodo.b?.body === null && borraTodo.b?.feet === null, 'y se pueden borrar todas');
  } finally {
    await req('PUT', `/lifebook/commerce/products/${prod.id}/size-chart`, A.tok, { charts: [] }).catch(() => {});
    await req('DELETE', '/lifebook/commerce/my/measurements', B.tok).catch(() => {});
    console.log('\nlimpieza: producto sin tabla y comprador sin medidas');
  }

  console.log(`\n${pass} PASA · ${fail} FALLA`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
