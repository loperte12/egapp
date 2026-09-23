// lb56a-verificar-aviso-y-zona.cjs — «AVÍSAME CUANDO LLEGUE» + «NO LLEGA A TU ZONA».
//
// Comprueba contra la API REAL:
//   1. la ficha dice si estoy esperando stock (`watching`);
//   2. `POST products/:id/interest` apunta la espera (por PRODUCTO o por VARIANTE);
//   3. apuntar cuando ya se puede comprar NO apunta nada: se dice que ya está disponible;
//   4. al reponer (el vendedor sube el stock), llega un AVISO por el chat comprador↔tienda;
//   5. el aviso se da UNA vez: no se repite en cada cambio de stock;
//   6. se puede dejar de esperar (`DELETE`);
//   7. el dueño no puede esperar su propio producto;
//   8. ZONA: si la política de la tienda no cubre la ciudad del comprador, el carrito lo dice
//      (`shippingWarning`) y solo ofrece recoger en tienda; si la cubre, ofrece las demás.
//
// Al terminar deja todo como estaba (stock, precio y carrito) y borra las esperas de prueba.
const API = 'https://hk.egrouteplan.com/wallet/api/v1';

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 300) }; } };
const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
  if (!r.accessToken) throw new Error(`sin sesión para ${phone}`);
  const me = await j(await fetch(`${API}/mobility/auth/me`, { headers: { Authorization: `Bearer ${r.accessToken}` } }));
  return { tok: r.accessToken, id: me.id, nombre: me.fullName, ciudad: me.city };
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
  const B = await login('+240555000003', '123456');       // comprador en Malabo
  const A = await login('+240222000123', 'MiClave123');   // tienda «Hotel Demo Malabo»
  console.log(`comprador ${B.nombre} (${B.ciudad}) · tienda ${A.nombre}`);

  // Un producto de la tienda de A con VARIANTE y stock (para agotarlo y reponerlo).
  const mios = await req('GET', '/lifebook/commerce/my/products', A.tok);
  const activos = (mios.b?.items ?? mios.b?.products ?? []).filter((p) => p.status === 'active');
  let ficha = null;
  for (const p of activos.slice(0, 14)) {
    const f = (await req('GET', `/lifebook/commerce/products/${p.id}`, B.tok)).b?.product;
    if (f && typeof f.priceXaf === 'number' && f.priceXaf > 0 && (f.variants ?? []).length > 0 && Number(f.stockQuantity ?? 0) > 0) {
      ficha = f;
      break;
    }
  }
  ok(!!ficha, 'hay un producto con variante y stock para la prueba', `encontrado: ${ficha?.title}`);
  if (!ficha) { console.log('\nNo se puede seguir.'); process.exit(1); }
  const V = ficha.variants[0];
  const stockOriginal = Number(ficha.stockQuantity);
  console.log(`producto «${ficha.title}» · variante «${V.name}» (stock variante ${V.stockQuantity}) · stock producto ${stockOriginal}`);

  let agotado = false;
  try {
    // ─────────────────────────── AVISO DE REPOSICIÓN ────────────────────────
    console.log('\n=== 1. SE AGOTA Y SE PIDE EL AVISO ===');
    // OJO (fallo de esta prueba, ya corregido): el stock se cambia con el endpoint del PANEL
    // (`PATCH /lifebook/merchant/products/:id/quick`), que es el que el comerciante usa a diario y
    // NO devuelve la publicación a moderación. El `PUT /commerce/products/:id` edita el producto
    // entero y lo manda otra vez a revisión: usarlo aquí dejaba el producto en `pending`.
    const aCero = await req('PATCH', `/lifebook/merchant/products/${ficha.id}/quick`, A.tok, { stockQuantity: 0 });
    ok(aCero.s === 200 || aCero.s === 201, `el dueño deja el stock a 0 (HTTP ${aCero.s})`, errCode(aCero));
    agotado = true;
    const sinStock = (await req('GET', `/lifebook/commerce/products/${ficha.id}`, B.tok)).b?.product;
    ok(Number(sinStock?.stockQuantity ?? -1) === 0, `y la ficha lo refleja (stock ${sinStock?.stockQuantity})`);

    const antes = (await req('GET', `/lifebook/commerce/products/${ficha.id}`, B.tok)).b?.product;
    ok(antes?.watching === false, `la ficha dice que NO estoy esperando (${antes?.watching})`);

    const apunta = await req('POST', `/lifebook/commerce/products/${ficha.id}/interest`, B.tok, {});
    ok(apunta.s === 200 || apunta.s === 201, `se pide el aviso (HTTP ${apunta.s})`, errCode(apunta));
    ok(apunta.b?.watching === true, `y queda apuntado (${JSON.stringify(apunta.b)})`);
    const despues = (await req('GET', `/lifebook/commerce/products/${ficha.id}`, B.tok)).b?.product;
    ok(despues?.watching === true, `la ficha ahora dice que SÍ estoy esperando (${despues?.watching})`);
    // La variante «Talla 42» SÍ tiene stock: pedir el aviso de ESA variante no se apunta (no se
    // promete un aviso de algo que ya se puede comprar). Y una variante AGOTADA sí se apunta.
    const Vllena = (ficha.variants ?? []).find((v) => Number(v.stockQuantity ?? 0) > 0);
    const Vcero = (ficha.variants ?? []).find((v) => Number(v.stockQuantity ?? 0) === 0);
    if (Vllena) {
      const conStock = await req('POST', `/lifebook/commerce/products/${ficha.id}/interest`, B.tok, { variantId: Vllena.id });
      ok(conStock.b?.watching === false && conStock.b?.available === true,
        `pedir aviso de una variante CON stock no se apunta (${JSON.stringify(conStock.b).slice(0, 80)})`);
    }
    if (Vcero) {
      const sinStockVar = await req('POST', `/lifebook/commerce/products/${ficha.id}/interest`, B.tok, { variantId: Vcero.id });
      ok(sinStockVar.b?.watching === true, `y una variante AGOTADA sí (${sinStockVar.b?.watching})`);
    } else {
      console.log('  (este producto no tiene ninguna variante agotada: no se prueba ese caso)');
    }

    console.log('\n=== 2. EL DUEÑO NO SE ESPERA A SÍ MISMO ===');
    const mio = await req('POST', `/lifebook/commerce/products/${ficha.id}/interest`, A.tok, {});
    ok(mio.s === 400, `se rechaza con 400 (HTTP ${mio.s})`, errCode(mio));
    ok(errCode(mio) === 'CANNOT_WATCH_OWN', `con su motivo (${errCode(mio)})`);

    console.log('\n=== 3. LA TIENDA REPONE Y LLEGA EL AVISO POR EL CHAT ===');
    const convs = (await req('GET', '/lifebook/chat/conversations', B.tok)).b;
    const lista = Array.isArray(convs) ? convs : (convs?.conversations ?? []);
    const directa = lista.find((c) => c.kind !== 'group' && c.other?.id === A.id);
    ok(!!directa, `existe el chat comprador↔tienda (${directa?.id})`);
    const antesMsgs = (await req('GET', `/lifebook/chat/conversations/${directa?.id}/messages?limit=20`, B.tok)).b?.messages ?? [];
    // Se cuentan los avisos NUEVOS por id: el chat arrastra avisos de pasadas ejecuciones de esta
    // prueba y contar por texto daba números que no significaban nada.
    const idsAntes = new Set(antesMsgs.map((m) => m.id));

    const repone = await req('PATCH', `/lifebook/merchant/products/${ficha.id}/quick`, A.tok, { stockQuantity: stockOriginal });
    ok(repone.s === 200 || repone.s === 201, `la tienda repone (HTTP ${repone.s})`, errCode(repone));
    agotado = false;

    const msgs = (await req('GET', `/lifebook/chat/conversations/${directa?.id}/messages?limit=20`, B.tok)).b?.messages ?? [];
    const avisosNuevos = msgs.filter((m) => !idsAntes.has(m.id) && m.kind === 'system' && String(m.body ?? '').includes('vuelve a estar disponible'));
    ok(avisosNuevos.length >= 1, `llega el aviso nuevo al chat (${avisosNuevos.length})`);
    ok(avisosNuevos.some((m) => String(m.body ?? '').includes(ficha.title)), `y dice el producto («${String(avisosNuevos[0]?.body ?? '').slice(0, 70)}»)`);

    const trasAviso = (await req('GET', `/lifebook/commerce/products/${ficha.id}`, B.tok)).b?.product;
    ok(trasAviso?.watching === false, `y las esperas quedan cerradas (${trasAviso?.watching})`);

    console.log('\n=== 3-bis. LA VARIANTE AGOTADA: SU AVISO LLEVA SU NOMBRE ===');
    if (Vcero) {
      // Reponer ESA variante es editar el producto entero (PUT), y eso devuelve la publicación a
      // revisión: el aviso tiene que salir al APROBARLA, que es cuando de verdad vuelve a venderse.
      const idsAntes2 = new Set(((await req('GET', `/lifebook/chat/conversations/${directa?.id}/messages?limit=20`, B.tok)).b?.messages ?? []).map((m) => m.id));
      const put = await req('PUT', `/lifebook/commerce/products/${ficha.id}`, A.tok, {
        variants: (ficha.variants ?? []).map((v, i) => ({
          id: v.id, name: v.name, priceXaf: v.priceXaf, position: i + 1,
          stockQuantity: v.id === Vcero.id ? 1 : Number(v.stockQuantity ?? 0),
        })),
      });
      ok(put.s === 200 || put.s === 201, `el dueño repone esa variante (HTTP ${put.s})`, errCode(put));
      const estadoTrasPut = (await req('GET', `/lifebook/commerce/products/${ficha.id}`, A.tok)).b?.product?.status;
      ok(estadoTrasPut === 'pending', `y la publicación vuelve a revisión (${estadoTrasPut})`);
      const adm = await login('+240999888777', '123456');
      const aprueba = await req('PATCH', `/lifebook/commerce/admin/products/${ficha.id}`, adm.tok, { action: 'approve' });
      ok(aprueba.s === 200, `un administrador la aprueba (HTTP ${aprueba.s})`, errCode(aprueba));
      const msgsVar = (await req('GET', `/lifebook/chat/conversations/${directa?.id}/messages?limit=20`, B.tok)).b?.messages ?? [];
      const nuevosVar = msgsVar.filter((m) => !idsAntes2.has(m.id) && String(m.body ?? '').includes('vuelve a estar disponible'));
      ok(nuevosVar.length >= 1, `y sale el aviso de la variante (${nuevosVar.length})`);
      ok(nuevosVar.some((m) => String(m.body ?? '').includes(Vcero.name)), `con el NOMBRE de la variante («${String(nuevosVar[0]?.body ?? '').slice(0, 70)}»)`);
      // Se deja la variante como estaba (agotada) y el producto publicado.
      await req('PUT', `/lifebook/commerce/products/${ficha.id}`, A.tok, {
        variants: (ficha.variants ?? []).map((v, i) => ({
          id: v.id, name: v.name, priceXaf: v.priceXaf, position: i + 1,
          stockQuantity: Number(v.stockQuantity ?? 0),
        })),
      });
      await req('PATCH', `/lifebook/commerce/admin/products/${ficha.id}`, adm.tok, { action: 'approve' });
    }

    console.log('\n=== 4. EL AVISO NO SE REPITE ===');
    const idsTrasAviso = new Set(msgs.map((m) => m.id));
    await req('PATCH', `/lifebook/merchant/products/${ficha.id}/quick`, A.tok, { stockQuantity: stockOriginal });
    const msgs2 = (await req('GET', `/lifebook/chat/conversations/${directa?.id}/messages?limit=20`, B.tok)).b?.messages ?? [];
    const repetidos = msgs2.filter((m) => !idsTrasAviso.has(m.id) && String(m.body ?? '').includes('vuelve a estar disponible'));
    ok(repetidos.length === 0, `no se repite el aviso al volver a tocar el stock (${repetidos.length} nuevos)`);

    console.log('\n=== 5. SI YA SE PUEDE COMPRAR, NO SE APUNTA NADA ===');
    const yaEsta = await req('POST', `/lifebook/commerce/products/${ficha.id}/interest`, B.tok, {});
    ok(yaEsta.b?.watching === false && yaEsta.b?.available === true,
      `se dice que ya está disponible (${JSON.stringify(yaEsta.b)})`);
    ok(String(yaEsta.b?.mensaje ?? '').length > 0, `con un mensaje claro («${yaEsta.b?.mensaje}»)`);

    console.log('\n=== 6. DEJAR DE ESPERAR ===');
    await req('PATCH', `/lifebook/merchant/products/${ficha.id}/quick`, A.tok, { stockQuantity: 0 });
    agotado = true;
    await req('POST', `/lifebook/commerce/products/${ficha.id}/interest`, B.tok, {});
    const quitar = await req('DELETE', `/lifebook/commerce/products/${ficha.id}/interest`, B.tok);
    ok(quitar.s === 200, `se puede dejar de esperar (HTTP ${quitar.s})`, errCode(quitar));
    ok(quitar.b?.quitadas >= 1, `y dice cuántas esperas quitó (${quitar.b?.quitadas})`);
    const sinEspera = (await req('GET', `/lifebook/commerce/products/${ficha.id}`, B.tok)).b?.product;
    ok(sinEspera?.watching === false, 'y la ficha deja de decir que espero');
    await req('PATCH', `/lifebook/merchant/products/${ficha.id}/quick`, A.tok, { stockQuantity: stockOriginal });
    agotado = false;

    console.log('\n=== 7. ZONA DE ENVÍO: SE DICE Y SE OFRECE RECOGER ===');
    // La tienda de A entrega SOLO en su ciudad (coverage same_city, Malabo). El comprador B es de
    // Malabo, así que está dentro; y la cuenta del teléfono (Acurenam) está fuera. Se comprueba con
    // los dos: es la misma política leída desde dos sitios.
    await req('DELETE', '/lifebook/commerce/my/cart', B.tok);
    await req('POST', '/lifebook/commerce/my/cart', B.tok, { productId: ficha.id, variantId: V.id, quantity: 1 });
    const cartB = (await req('GET', '/lifebook/commerce/my/cart', B.tok)).b;
    const grupoB = (cartB?.groups ?? [])[0];
    ok(grupoB?.shipsToBuyer === true, `desde Malabo la tienda SÍ llega (${grupoB?.shipsToBuyer})`);
    ok(!grupoB?.shippingWarning, `y no hay aviso (${grupoB?.shippingWarning ?? 'ninguno'})`);
    ok((grupoB?.deliveryModes ?? []).length > 1, `y se ofrecen las entregas de la tienda (${(grupoB?.deliveryModes ?? []).join(', ')})`);
    await req('DELETE', '/lifebook/commerce/my/cart', B.tok);

    const ADM = await login('+240999888777', '123456');   // comprador en Acurenam
    if ((ADM.ciudad ?? '').toLowerCase() !== 'malabo') {
      await req('DELETE', '/lifebook/commerce/my/cart', ADM.tok);
      await req('POST', '/lifebook/commerce/my/cart', ADM.tok, { productId: ficha.id, variantId: V.id, quantity: 1 });
      const cartA = (await req('GET', '/lifebook/commerce/my/cart', ADM.tok)).b;
      const grupoA = (cartA?.groups ?? [])[0];
      ok(grupoA?.shipsToBuyer === false, `desde ${ADM.ciudad} la tienda NO llega (${grupoA?.shipsToBuyer})`);
      ok(!!grupoA?.shippingWarning, `y lo dice («${grupoA?.shippingWarning}»)`);
      ok((grupoA?.deliveryModes ?? []).join(',') === 'pickup', `y solo ofrece recoger en tienda (${(grupoA?.deliveryModes ?? []).join(', ')})`);
      ok((cartA?.items ?? []).every((i) => i.available), 'pero el producto sigue siendo pagable (se puede recoger)');
      await req('DELETE', '/lifebook/commerce/my/cart', ADM.tok);
    } else {
      console.log('  (la cuenta del teléfono está en Malabo: no se puede probar el caso «fuera de zona»)');
    }
  } finally {
    if (agotado) await req('PATCH', `/lifebook/merchant/products/${ficha.id}/quick`, A.tok, { stockQuantity: stockOriginal });
    await req('DELETE', `/lifebook/commerce/products/${ficha.id}/interest`, B.tok).catch(() => {});
    await req('DELETE', '/lifebook/commerce/my/cart', B.tok).catch(() => {});
    console.log('\nlimpieza: stock, avisos y carrito como estaban');
  }

  console.log(`\n${pass} PASA · ${fail} FALLA`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });

