// lb84a-resenas.cjs — ¿se puede valorar un pedido y mueve la nota de verdad? (punto 7 de la §3)
//
// `rating` y `rating_count` existen en `lifebook.products` y en `lifebook.shops`, la app los pinta… y
// nadie los escribía. Esto comprueba la reseña del pedido entregado: permisos, que no se valore lo que
// no ha llegado, que no se vote dos veces, el recorte del comentario y —lo que de verdad importa— que
// la nota sea la **media ponderada** y no «la última que entró».
//
// Deja DOS pedidos entregados (no se pueden cancelar) y la nota de la tienda y del producto movidas: por
// SQL se restauran después, junto al stock y las ventas.
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb84a.cjs
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';

let fallos = 0;
const comprobar = (ok, texto) => { console.log(`  ${ok ? 'OK  ' : 'FALLO'} ${texto}`); if (!ok) fallos++; };

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 300) }; } };
const login = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
  if (!r.accessToken) throw new Error(`sin sesión para ${phone}`);
  return r.accessToken;
};
const req = async (method, path, tok, body, extra = {}) => {
  const r = await fetch(`${API}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...extra },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { s: r.status, b: await j(r) };
};

const PRODUCTO = '074e141b-f618-47c5-9078-acb74e82d467';
/** La nota del producto, leída de la API (que es lo que ve el comprador en la ficha). */
const fichaProducto = async (tok) => {
  const p = await req('GET', `/lifebook/commerce/products/${PRODUCTO}`, tok);
  const prod = p.b?.product ?? {};
  return { rating: prod.rating === null || prod.rating === undefined ? null : Number(prod.rating), votos: Number(prod.ratingCount ?? 0) };
};

(async () => {
  const B = await login('+240555000003', '123456');
  const T = await login('+240222000123', 'MiClave123');

  const crear = async (nota) => {
    const r = await req('POST', '/lifebook/commerce/orders', B,
      { items: [{ productId: PRODUCTO, quantity: 1 }], deliveryMode: 'pickup', deliveryAddress: {}, paymentMethod: 'in_store', note: nota },
      { 'Idempotency-Key': `lb84a-${Date.now()}-${Math.random().toString(16).slice(2, 6)}` });
    if (!r.b?.order?.id) throw new Error(`no se creó el pedido: ${JSON.stringify(r.b).slice(0, 200)}`);
    return r.b.order;
  };
  const entregar = async (o) => {
    for (const accion of ['accept', 'prepare', 'ready', 'deliver']) {
      const r = await req('PATCH', `/lifebook/commerce/orders/${o.id}/action`, T, { action: accion });
      if (!(r.s === 200 || r.s === 201)) throw new Error(`${accion} falló: HTTP ${r.s} ${r.b?.error?.code}`);
    }
  };
  const valorar = (tok, id, rating, comment) => req('POST', `/lifebook/commerce/orders/${id}/review`, tok, { rating, comment });

  const antes = await fichaProducto(B);
  console.log(`producto antes: nota=${antes.rating ?? '(sin nota)'} · votos=${antes.votos}`);

  // ── A) Un pedido SIN entregar no se valora ────────────────────────────────
  console.log('\n=== A. PRIMERO LOS «NO»: sin entregar, el comprador que no es, y notas imposibles ===');
  const o1 = await crear('PRUEBA de reseñas (se entrega)');
  const sinEntregar = await valorar(B, o1.id, 5, 'sin entregar');
  comprobar(sinEntregar.b?.error?.code === 'ORDER_NOT_DELIVERED', `valorar sin entregar → ${sinEntregar.b?.error?.code ?? `HTTP ${sinEntregar.s}`}`);
  const comoTienda = await valorar(T, o1.id, 5, 'la tienda no valora');
  comprobar(comoTienda.b?.error?.code === 'NOT_ORDER_PARTICIPANT', `valorar como TIENDA → ${comoTienda.b?.error?.code ?? `HTTP ${comoTienda.s}`}`);

  await entregar(o1);
  for (const mala of [0, 6, 4.5, 'mucho']) {
    const r = await valorar(B, o1.id, mala, 'nota mala');
    comprobar(r.b?.error?.code === 'RATING_INVALID', `nota «${mala}» → ${r.b?.error?.code ?? `HTTP ${r.s}`}`);
  }

  // ── B) La reseña buena, con un comentario larguísimo ──────────────────────
  console.log('\n=== B. LA RESEÑA BUENA (nota 5 y comentario de 600 caracteres) ===');
  const largo = 'Muy bien. '.repeat(60); // 600 caracteres
  const r1 = await valorar(B, o1.id, 5, largo);
  comprobar(r1.s === 200 || r1.s === 201, `valorar el pedido entregado → HTTP ${r1.s} ${r1.b?.error?.code ?? ''}`);
  const rev1 = r1.b?.order?.review;
  comprobar(rev1?.rating === 5, `la reseña queda con nota 5: ${rev1?.rating}`);
  comprobar((rev1?.comment ?? '').length === 500, `el comentario se recorta a 500 caracteres: ${(rev1?.comment ?? '').length}`);

  const repetida = await valorar(B, o1.id, 1, 'otra vez');
  comprobar(repetida.b?.error?.code === 'REVIEW_ALREADY_DONE', `valorar dos veces → ${repetida.b?.error?.code ?? `HTTP ${repetida.s}`}`);

  const trasUno = await fichaProducto(B);
  comprobar(trasUno.votos === antes.votos + 1, `el producto suma UN voto: ${antes.votos} → ${trasUno.votos}`);
  comprobar(trasUno.rating === 5, `y su nota es 5 (antes ${antes.rating ?? 'sin nota'}): ${trasUno.rating}`);

  // La tienda y el comprador ven la reseña en el detalle.
  const detalleTienda = await req('GET', `/lifebook/commerce/orders/${o1.id}`, T);
  comprobar(detalleTienda.b?.order?.review?.rating === 5, `la TIENDA ve la valoración que le han puesto: ${detalleTienda.b?.order?.review?.rating}`);

  // ── C) Un segundo voto mueve la nota a la MEDIA, no a la última ───────────
  console.log('\n=== C. LA NOTA ES LA MEDIA PONDERADA, NO LA ÚLTIMA ===');
  const o2 = await crear('PRUEBA de reseñas 2 (se entrega)');
  await entregar(o2);
  const r2 = await valorar(B, o2.id, 3, 'Regular');
  comprobar(r2.s === 200 || r2.s === 201, `segunda valoración (nota 3) → HTTP ${r2.s}`);
  const trasDos = await fichaProducto(B);
  comprobar(trasDos.votos === trasUno.votos + 1, `el producto suma otro voto: ${trasUno.votos} → ${trasDos.votos}`);
  comprobar(trasDos.rating === 4, `y la nota es la media (5+3)/2 = 4, no 3: ${trasDos.rating}`);

  console.log(`\n  pedidos: ${o1.code} y ${o2.code} (entregados, no se pueden cancelar)`);
  console.log('\n  SQL para ver el rastro y limpiar:');
  console.log(`    SELECT o.order_no, r.rating, left(r.comment, 40), r.created_at FROM lifebook.order_reviews r JOIN lifebook.orders o ON o.id = r.order_id ORDER BY r.created_at;`);
  console.log(`    SELECT name, rating, rating_count FROM lifebook.shops WHERE id = 'd8a2ece3-92b4-4959-8412-d26b5d698ade';`);
  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
