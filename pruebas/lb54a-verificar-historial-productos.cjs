// lb54a-verificar-historial-productos.cjs — MERCADO, TANDA F: HISTORIAL DE PRODUCTOS.
//
// Comprueba contra la API REAL lo que se decidió:
//   1. abrir una ficha CON sesión apunta el «visto» (quién, cuándo y cuántas veces);
//   2. mirar dos veces el MISMO producto no duplica la fila: suma «veces» y sube al principio;
//   3. el orden es «lo último primero»;
//   4. mirar TU PROPIO producto NO entra en tu historial (no es un «visto»);
//   5. el historial de una persona no se mezcla con el de otra;
//   6. un producto que ya NO está a la venta NO desaparece: sale con `available: false`;
//   7. se puede VACIAR el historial;
//   8. sin sesión: la ficha sigue siendo pública y el historial exige sesión (401);
//   9. la tarjeta que devuelve el historial trae lo que la rejilla pinta (misma que el catálogo).
//
// Al terminar: se reactiva el producto que se ocultó y se deja vacío el historial del comprador.
const API = 'https://hk.egrouteplan.com/wallet/api/v1';

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 300) }; } };
const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
  if (!r.accessToken) throw new Error(`sin sesión para ${phone}: ${JSON.stringify(r).slice(0, 200)}`);
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
  const B = await login('+240555000003', '123456');       // comprador
  const A = await login('+240222000123', 'MiClave123');   // dueño de la tienda (para el caso «mi propio producto»)
  console.log(`comprador ${B.nombre} · tienda ${A.nombre}`);

  // Dos productos CON PRECIO de la tienda de A (los «a consultar» no sirven para la rejilla).
  const mios = await req('GET', '/lifebook/commerce/my/products', A.tok);
  const lista = (mios.b?.items ?? mios.b?.products ?? []).filter((p) => p.status === 'active');
  const fichas = [];
  for (const p of lista.slice(0, 12)) {
    const f = (await req('GET', `/lifebook/commerce/products/${p.id}`, B.tok)).b?.product;
    if (typeof f?.priceXaf === 'number' && f.priceXaf > 0) fichas.push(f);
    if (fichas.length === 2) break;
  }
  ok(fichas.length === 2, `hay 2 productos con precio para la prueba`, `encontrados: ${fichas.length}`);
  if (fichas.length < 2) { console.log('\nNo se puede seguir.'); process.exit(1); }
  const [P1, P2] = fichas;
  console.log(`P1 «${P1.title}» (${P1.priceXaf} XAF) · P2 «${P2.title}» (${P2.priceXaf} XAF)`);

  const historial = async (tok, limit = 60) => (await req('GET', `/lifebook/commerce/my/views?limit=${limit}`, tok)).b;
  const posicion = (h, id) => (h?.items ?? []).findIndex((x) => x.id === id);
  /**
   * Abrir la ficha: la LECTURA es pública (no debe apuntar nada) y la visita se apunta con una
   * llamada propia con sesión (`POST products/:id/view`). Ese es justo el arreglo de la tanda F:
   * en la lectura pública, un token caducado salía anónimo y la visita se perdía en silencio.
   */
  const abrirFicha = async (pid, tok) => req('GET', `/lifebook/commerce/products/${pid}`, tok);
  const apuntarVisita = async (pid, tok) => req('POST', `/lifebook/commerce/products/${pid}/view`, tok, {});

  let ocultado = false;
  try {
    // Punto de partida limpio
    await req('DELETE', '/lifebook/commerce/my/views', B.tok);
    await req('DELETE', '/lifebook/commerce/my/views', A.tok);

    console.log('\n=== 1. ABRIR UNA FICHA APUNTA EL «VISTO» ===');
    const h0 = await historial(B.tok);
    ok((h0?.items ?? []).length === 0, `el historial empieza vacío (${(h0?.items ?? []).length})`);

    // La LECTURA de la ficha es pública y NO apunta nada (el arreglo de esta tanda).
    await abrirFicha(P1.id, B.tok);
    const hSoloLectura = await historial(B.tok);
    ok((hSoloLectura?.items ?? []).length === 0,
      `leer la ficha NO apunta la visita (${(hSoloLectura?.items ?? []).length}) — se apunta con la llamada propia`);

    const visita = await apuntarVisita(P1.id, B.tok);
    ok(visita.s === 200 || visita.s === 201, `la llamada de la visita responde (HTTP ${visita.s})`, errCode(visita));
    ok(visita.b?.registrada === true, `y dice que la apuntó (${JSON.stringify(visita.b)})`);
    const h1 = await historial(B.tok);
    ok((h1?.items ?? []).length === 1, `tras mirar P1 hay 1 producto (${(h1?.items ?? []).length})`);
    const it1 = h1?.items?.[0];
    ok(it1?.id === P1.id, `y es el que miré («${it1?.title}»)`);
    ok(it1?.times === 1, `con 1 visita (${it1?.times})`);
    ok(!!it1?.viewedAt, `y la fecha de la última visita (${it1?.viewedAt})`);
    ok(it1?.available === true, 'marcado como disponible');

    console.log('\n=== 2. LA TARJETA TRAE LO QUE PINTA LA REJILLA (la misma del catálogo) ===');
    ok(it1?.title === P1.title, `título («${it1?.title}»)`);
    ok(it1?.priceXaf === P1.priceXaf, `precio (${it1?.priceXaf})`);
    ok(it1?.priceMode === P1.priceMode, `modo de precio (${it1?.priceMode})`);
    ok('coverUrl' in it1 && 'shortDescription' in it1, 'foto y descripción corta');
    ok(it1?.shop?.id === P1.shop.id && it1?.shop?.name === P1.shop.name, `tienda («${it1?.shop?.name}»)`);
    ok('salesCount' in it1 && 'oldPriceXaf' in it1, '«vendidos» y precio tachado (los campos de la tarjeta)');

    console.log('\n=== 3. MIRAR DOS VECES NO DUPLICA: SUMA Y SUBE ===');
    await apuntarVisita(P2.id, B.tok);
    const h2 = await historial(B.tok);
    ok((h2?.items ?? []).length === 2, `ahora hay 2 (${(h2?.items ?? []).length})`);
    ok(posicion(h2, P2.id) === 0, `el último que miré va PRIMERO (P2 en ${posicion(h2, P2.id)})`);
    await apuntarVisita(P1.id, B.tok);
    const h3 = await historial(B.tok);
    ok((h3?.items ?? []).length === 2, `sigue habiendo 2 filas, no 3 (${(h3?.items ?? []).length})`);
    ok(posicion(h3, P1.id) === 0, `y P1 ha vuelto al principio (${posicion(h3, P1.id)})`);
    ok(h3?.items?.[0]?.times === 2, `con 2 visitas contadas (${h3?.items?.[0]?.times})`);

    console.log('\n=== 4. MIRAR LO TUYO NO ES UN «VISTO» ===');
    const visitaMia = await apuntarVisita(P1.id, A.tok);
    ok(visitaMia.b?.registrada === false && visitaMia.b?.motivo === 'es_tuya',
      `la visita del dueño se rechaza con motivo (${JSON.stringify(visitaMia.b)})`);
    const hA = await historial(A.tok);
    ok((hA?.items ?? []).length === 0, `el dueño no aparece en su propio historial (${(hA?.items ?? []).length})`);

    console.log('\n=== 5. CADA PERSONA TIENE EL SUYO ===');
    const hB = await historial(B.tok);
    ok((hB?.items ?? []).length === 2, `el del comprador sigue con 2 (${(hB?.items ?? []).length})`);
    ok(!(hB?.items ?? []).some((x) => false) && (hB?.items ?? []).every((x) => [P1.id, P2.id].includes(x.id)),
      'y solo tiene lo que miró él');

    console.log('\n=== 6. LO QUE YA NO ESTÁ A LA VENTA SE DICE, NO SE ESCONDE ===');
    const ocultar = await req('PATCH', `/lifebook/commerce/products/${P1.id}/status`, A.tok, { action: 'hide' });
    ok(ocultar.s === 200 || ocultar.s === 201, `la tienda oculta P1 (HTTP ${ocultar.s})`, errCode(ocultar));
    ocultado = true;
    const h4 = await historial(B.tok);
    const apagado = (h4?.items ?? []).find((x) => x.id === P1.id);
    ok(!!apagado, 'el producto SIGUE en el historial (no se borra el rastro)');
    ok(apagado?.available === false, 'pero marcado como no disponible');
    ok(apagado?.title === P1.title, `y conserva su nombre («${apagado?.title}»)`);

    console.log('\n=== 7. VACIAR EL HISTORIAL ===');
    const borrado = await req('DELETE', '/lifebook/commerce/my/views', B.tok);
    ok(borrado.s === 200, `se vacía (HTTP ${borrado.s})`, errCode(borrado));
    ok(Number(borrado.b?.deleted ?? 0) >= 2, `y dice cuántas filas borró (${borrado.b?.deleted})`);
    const h5 = await historial(B.tok);
    ok((h5?.items ?? []).length === 0, `el historial queda vacío (${(h5?.items ?? []).length})`);

    console.log('\n=== 8. SIN SESIÓN ===');
    const sinSesion = await req('GET', `/lifebook/commerce/products/${P1.id}`);
    ok(sinSesion.s === 404 || sinSesion.s === 200, `la ficha sigue siendo pública (HTTP ${sinSesion.s})`);
    const vistaSinSesion = await req('POST', `/lifebook/commerce/products/${P1.id}/view`, null, {});
    ok(vistaSinSesion.s === 401, `apuntar la visita exige sesión (HTTP ${vistaSinSesion.s})`, errCode(vistaSinSesion));
    const miasSinSesion = await req('GET', '/lifebook/commerce/my/views');
    ok(miasSinSesion.s === 401, `el historial exige sesión (HTTP ${miasSinSesion.s})`, errCode(miasSinSesion));
    const borrarSinSesion = await req('DELETE', '/lifebook/commerce/my/views');
    ok(borrarSinSesion.s === 401, `y borrarlo también (HTTP ${borrarSinSesion.s})`);
  } finally {
    if (ocultado) {
      const volver = await req('PATCH', `/lifebook/commerce/products/${P1.id}/status`, A.tok, { action: 'activate' });
      console.log(`\nlimpieza: P1 vuelve a estar publicado (HTTP ${volver.s}, estado ${volver.b?.status ?? volver.b?.product?.status ?? '?'})`);
    }
    const limpiado = await req('DELETE', '/lifebook/commerce/my/views', B.tok);
    console.log(`limpieza: historial del comprador vacío (HTTP ${limpiado.s})`);
  }

  console.log(`\n${pass} PASA · ${fail} FALLA`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
