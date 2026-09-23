// lb53a-verificar-pedido-en-chat.cjs — MERCADO, TANDA E: EL PEDIDO VIVE EN EL CHAT.
//
// Comprueba contra la API REAL lo que se decidió:
//   1. al crear un pedido se publica su TARJETA (`kind='order'`) en el chat comprador↔tienda;
//   2. si la compra nació en un GRUPO del comprador, se publica ahí con el aviso social
//      «✅ {nombre} compró {producto}» y NO en un grupo ajeno;
//   3. el ESTADO de la tarjeta es el VIVO: la tienda acepta el pedido y el MISMO mensaje,
//      leído otra vez, ya dice «confirmed» (no se quedó congelado en «created»);
//   4. un reintento idempotente NO duplica la tarjeta;
//   5. quien no participa en la conversación no puede leerla;
//   6. el buscador del chat encuentra los pedidos (`?kind=order`).
//
// Al terminar: se CANCELA el pedido (devuelve el stock) y se deshace el grupo de prueba.
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
const req = async (method, path, tok, body, extraHeaders = {}) => {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...extraHeaders },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { s: r.status, b: await j(r) };
};
const errCode = (r) => r.b?.error?.code ?? r.b?.code ?? '(sin código)';

let pass = 0, fail = 0;
const ok = (c, e, x = '') => { if (c) { pass++; console.log(`  PASA   ${e}`); } else { fail++; console.log(`  FALLA  ${e}   ${x}`); } };

/** La última tarjeta DE ESE pedido dentro de una conversación (los avisos de sistema van aparte). */
const tarjetaDe = (mensajes, orderId) =>
  [...(mensajes ?? [])].reverse().find((m) => m.kind === 'order' && m.orderRef?.id === orderId) ?? null;
const cuantasTarjetas = (mensajes, orderId) =>
  (mensajes ?? []).filter((m) => m.kind === 'order' && m.orderRef?.id === orderId).length;
/**
 * El servidor devuelve la lista de conversaciones como ARRAY y la contraparte en `other`
 * (la app la envuelve en `{ conversations }` y la llama `peer`). Leerla mal fue un fallo de esta
 * prueba en la primera pasada: parecía que no había chat con la tienda cuando sí lo había.
 */
const listaDeChats = (b) => (Array.isArray(b) ? b : (b?.conversations ?? []));
const chatDirectoCon = (b, userId) => listaDeChats(b).find((c) => c.kind !== 'group' && c.other?.id === userId) ?? null;

(async () => {
  const B = await login('+240555000003', '123456');       // comprador de prueba
  const A = await login('+240222000123', 'MiClave123');   // dueño de la tienda «Hotel Demo Malabo»
  const ADM = await login('+240999888777', '123456');     // ajeno a la compra
  console.log(`comprador ${B.nombre} · tienda ${A.nombre} · ajeno ${ADM.nombre}`);

  // ── producto y forma de pago reales de esa tienda ─────────────────────────
  // Hay que buscar uno CON PRECIO: los «a consultar» se presupuestan por el chat y el servidor
  // los rechaza con PRICE_ON_REQUEST (comprobado en la primera pasada de esta prueba).
  const mios = await req('GET', '/lifebook/commerce/my/products', A.tok);
  const lista = mios.b?.items ?? mios.b?.products ?? [];
  let ficha = null;
  for (const p of lista.filter((x) => x.status === 'active').slice(0, 12)) {
    const f = (await req('GET', `/lifebook/commerce/products/${p.id}`, B.tok)).b?.product;
    if (typeof f?.priceXaf === 'number' && f.priceXaf > 0 && (f.paymentMethods ?? []).some((m) => m.status === 'active')) {
      ficha = f;
      break;
    }
  }
  ok(!!ficha, `la tienda de ${A.nombre} tiene un producto con precio y pago activo (${lista.length} en total)`);
  if (!ficha) { console.log('\nNo se puede seguir sin un producto pedible.'); process.exit(1); }

  const pago = (ficha.paymentMethods ?? []).find((m) => m.status === 'active');
  const variante = (ficha.variants ?? [])[0] ?? null;
  console.log(`producto «${ficha.title}» · precio ${ficha.priceXaf} XAF · pago ${pago?.method ?? '—'} · variante ${variante?.name ?? '—'}`);
  ok(!!pago, `hay una forma de pago ACTIVA (${pago?.method})`);
  if (!pago) { console.log('\nSin forma de pago activa no se puede pedir.'); process.exit(1); }

  // ── grupo de prueba: el comprador es dueño y la tienda es miembro ─────────
  // Se REUTILIZA si ya existe (el dueño no puede salir del grupo, así que crear uno nuevo en cada
  // pasada iría dejando basura en la lista de chats de las dos cuentas).
  const TITULO = 'Prueba pedido en chat (se puede borrar)';
  const misConvs = listaDeChats((await req('GET', '/lifebook/chat/conversations', B.tok)).b);
  let grupoId = misConvs.find((c) => c.kind === 'group' && String(c.title ?? '').startsWith(TITULO))?.id ?? null;
  if (grupoId) {
    const dentro = (await req('GET', `/lifebook/groups/${grupoId}`, B.tok)).b;
    const estaA = (dentro?.members ?? []).some((m) => m.id === A.id);
    if (!estaA) await req('POST', `/lifebook/groups/${grupoId}/members`, B.tok, { memberIds: [A.id] });
    console.log(`grupo de prueba reutilizado (${grupoId})`);
  } else {
    const grupo = await req('POST', '/lifebook/groups', B.tok, { title: TITULO, memberIds: [A.id] });
    grupoId = grupo.b?.id ?? grupo.b?.group?.id;
    ok(grupo.s === 201 || grupo.s === 200, `se crea el grupo de prueba (HTTP ${grupo.s})`, JSON.stringify(grupo.b).slice(0, 200));
  }
  ok(!!grupoId, `con su id (${grupoId})`);

  const clave = `lb53a-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
  let pedidoId = null;

  try {
    console.log('\n=== 1. EL PEDIDO SE PUBLICA EN EL CHAT DE LA TIENDA ===');
    const creado = await req('POST', '/lifebook/commerce/orders', B.tok, {
      items: [{ productId: ficha.id, variantId: variante?.id ?? null, quantity: 1 }],
      deliveryMode: 'pickup',
      deliveryAddress: {},
      paymentMethod: pago.method,
      conversationId: grupoId,
    }, { 'Idempotency-Key': clave });
    const pedido = creado.b?.order;
    pedidoId = pedido?.id ?? null;
    ok(creado.s === 201 || creado.s === 200, `el pedido se crea (HTTP ${creado.s})`, JSON.stringify(creado.b).slice(0, 250));
    ok(!!pedido?.code, `con su número (${pedido?.code})`);
    ok(pedido?.status === 'created', `y su estado inicial (${pedido?.status})`);

    const convs = (await req('GET', '/lifebook/chat/conversations', B.tok)).b;
    const directa = chatDirectoCon(convs, A.id);
    ok(!!directa, `existe el chat del comprador con la tienda (${directa?.id})`);

    const msgsA = (await req('GET', `/lifebook/chat/conversations/${directa?.id}/messages?limit=30`, B.tok)).b?.messages ?? [];
    const tarjeta = tarjetaDe(msgsA, pedidoId);
    ok(!!tarjeta, 'la tarjeta del pedido está en el chat con la tienda');
    ok(tarjeta?.orderRef?.code === pedido?.code, `con su número (${tarjeta?.orderRef?.code})`);
    ok(tarjeta?.orderRef?.status === 'created', `y el estado del momento (${tarjeta?.orderRef?.status})`);
    ok(tarjeta?.orderRef?.totalXaf === pedido?.totalXaf, `y el total (${tarjeta?.orderRef?.totalXaf} = ${pedido?.totalXaf})`);
    ok((tarjeta?.orderRef?.items ?? []).length === 1, `con 1 artículo (${(tarjeta?.orderRef?.items ?? []).length})`);
    ok(tarjeta?.orderRef?.items?.[0]?.title === ficha.title, `y el nombre del artículo («${tarjeta?.orderRef?.items?.[0]?.title}»)`);
    ok(!!tarjeta?.orderRef?.items?.[0]?.mediaUrl, 'con foto (para que la tarjeta se vea, no un hueco)');
    ok(tarjeta?.orderRef?.deliveryMode === 'pickup', `y la forma de entrega (${tarjeta?.orderRef?.deliveryMode})`);
    ok(tarjeta?.orderRef?.social === false, 'en el chat con la tienda NO es aviso social');
    ok(tarjeta?.body === `🧾 Pedido ${pedido?.code}`, `y el texto de respaldo («${tarjeta?.body}»)`);
    ok(tarjeta?.orderRef?.buyerName === B.nombre, `lleva el nombre de quien compró (${tarjeta?.orderRef?.buyerName})`);

    console.log('\n=== 2. Y EN EL GRUPO, COMO PRUEBA SOCIAL ===');
    const msgsG = (await req('GET', `/lifebook/chat/conversations/${grupoId}/messages?limit=30`, B.tok)).b?.messages ?? [];
    const social = tarjetaDe(msgsG, pedidoId);
    ok(!!social, 'la tarjeta del pedido también está en el grupo');
    ok(social?.orderRef?.social === true, 'y ahí SÍ es aviso social');
    ok(String(social?.body ?? '').startsWith('✅'), `con el visto bueno delante («${String(social?.body).slice(0, 60)}»)`);
    ok(String(social?.body ?? '').includes(B.nombre), 'dice QUIÉN compró');
    ok(String(social?.body ?? '').includes(ficha?.title ?? '@@'), 'y QUÉ compró');
    ok(tarjeta?.orderRef?.shopName === (ficha?.shop?.name ?? null), `la tarjeta dice la tienda (${tarjeta?.orderRef?.shopName})`);

    console.log('\n=== 3. EL ESTADO ES EL VIVO, NO EL DEL DÍA DE LA COMPRA ===');
    const aceptado = await req('PATCH', `/lifebook/commerce/orders/${pedidoId}/action`, A.tok, { action: 'accept' });
    ok(aceptado.s === 200 || aceptado.s === 201, `la tienda acepta el pedido (HTTP ${aceptado.s})`, JSON.stringify(aceptado.b).slice(0, 160));
    const msgsA2 = (await req('GET', `/lifebook/chat/conversations/${directa?.id}/messages?limit=30`, B.tok)).b?.messages ?? [];
    const tarjeta2 = tarjetaDe(msgsA2, pedidoId);
    ok(tarjeta2?.id === tarjeta?.id, 'es EL MISMO mensaje (no se creó otro)');
    ok(tarjeta2?.orderRef?.status === 'confirmed', `y ahora dice el estado de hoy («${tarjeta2?.orderRef?.status}»)`, `antes: ${tarjeta?.orderRef?.status}`);
    ok(cuantasTarjetas(msgsA2, pedidoId) === 1, `sigue habiendo UNA sola tarjeta (${cuantasTarjetas(msgsA2, pedidoId)})`);

    console.log('\n=== 4. REINTENTO IDEMPOTENTE: NO SE DUPLICA ===');
    const bis = await req('POST', '/lifebook/commerce/orders', B.tok, {
      items: [{ productId: ficha.id, variantId: variante?.id ?? null, quantity: 1 }],
      deliveryMode: 'pickup',
      deliveryAddress: {},
      paymentMethod: pago.method,
      conversationId: grupoId,
    }, { 'Idempotency-Key': clave });
    ok(bis.b?.order?.id === pedidoId, 'devuelve EL MISMO pedido', `${bis.b?.order?.id} ≠ ${pedidoId}`);
    const msgsA3 = (await req('GET', `/lifebook/chat/conversations/${directa?.id}/messages?limit=30`, B.tok)).b?.messages ?? [];
    ok(cuantasTarjetas(msgsA3, pedidoId) === 1, `y NO se publicó otra tarjeta (${cuantasTarjetas(msgsA3, pedidoId)})`);

    console.log('\n=== 5. QUIEN NO PARTICIPA NO LEE ESA CONVERSACIÓN ===');
    const ajenoDirecta = await req('GET', `/lifebook/chat/conversations/${directa?.id}/messages`, ADM.tok);
    ok(ajenoDirecta.s === 403 || ajenoDirecta.s === 404, `no puede leer el chat comprador↔tienda (HTTP ${ajenoDirecta.s})`, errCode(ajenoDirecta));
    const ajenoGrupo = await req('GET', `/lifebook/chat/conversations/${grupoId}/messages`, ADM.tok);
    ok(ajenoGrupo.s === 403 || ajenoGrupo.s === 404, `ni el grupo (HTTP ${ajenoGrupo.s})`, errCode(ajenoGrupo));

    console.log('\n=== 6. EL BUSCADOR DEL CHAT ENCUENTRA LOS PEDIDOS ===');
    const buscado = await req('GET', `/lifebook/chat/conversations/${directa?.id}/search?kind=order&limit=20`, B.tok);
    ok(buscado.s === 200, `el buscador acepta el tipo «order» (HTTP ${buscado.s})`, errCode(buscado));
    ok((buscado.b?.messages ?? []).some((m) => m.orderRef?.id === pedidoId), 'y devuelve esta tarjeta');
    ok((buscado.b?.messages ?? []).every((m) => m.kind === 'order'), 'sin colar otros tipos de mensaje');
  } finally {
    // ── limpieza: se cancela el pedido (devuelve stock) y se deshace el grupo ──
    if (pedidoId) {
      const cancelado = await req('PATCH', `/lifebook/commerce/orders/${pedidoId}/action`, B.tok, { action: 'cancel' });
      console.log(`\nlimpieza: pedido cancelado (HTTP ${cancelado.s}, estado ${cancelado.b?.order?.status ?? cancelado.b?.status ?? '?'})`);
    }
    if (grupoId) {
      // El grupo se deja ENTERO y con el título que avisa de que se puede borrar: el dueño no puede
      // salir de su propio grupo (403 comprobado), así que deshacerlo a medias dejaría basura.
      console.log(`limpieza: el grupo de prueba se queda (${grupoId}) — se reutiliza la próxima vez.`);
    }
  }

  console.log(`\n${pass} PASA · ${fail} FALLA`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
