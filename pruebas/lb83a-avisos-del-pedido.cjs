// lb83a-avisos-del-pedido.cjs — ¿avisa el pedido de sus cambios? (punto 6 de la §3)
//
// El punto 6 son «avisos de estado del pedido (push + chat)». El **push** no se puede montar sin cuentas
// del dueño (no hay `expo-notifications` instalado, ni proyecto EAS, ni `google-services.json`: medido).
// La mitad del **chat** sí existe —`orderAction` llama a `notify()`— y esto la comprueba de verdad:
// que al cambiar el estado le llegue un mensaje al otro con el aviso correcto.
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb83a.cjs
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

/**
 * La conversación con una persona, por la MISMA ruta que usa la app: `POST /lifebook/chat/open`.
 *
 * OJO (me costó dos falsos fallos): `GET /lifebook/chat/conversations` devuelve un **array pelado** y
 * además el comprador de pruebas tiene **102 conversaciones**, así que buscar el aviso «en las primeras»
 * no encuentra nada aunque el aviso exista (en la base de datos estaba, con su `kind='system'`).
 * Abriendo la conversación por su interlocutor no hay duda de dónde mirar.
 */
const abrirConversacion = async (tok, peerId) => {
  const r = await req('POST', '/lifebook/chat/open', tok, { userId: peerId });
  const id = r.b?.id ?? r.b?.conversation?.id;
  if (!id) throw new Error(`no se pudo abrir la conversación: ${JSON.stringify(r.b).slice(0, 200)}`);
  return id;
};
const mensajesDe = async (tok, convId) => {
  const r = await req('GET', `/lifebook/chat/conversations/${convId}/messages`, tok);
  const arr = Array.isArray(r.b) ? r.b : (r.b?.messages ?? []);
  return arr.map((m) => String(m.body ?? m.text ?? ''));
};
/**
 * Cuántas veces aparece un aviso. Se CUENTA en vez de mirar «los últimos» porque la lista de mensajes
 * viene **del más nuevo al más viejo** (el chat carga la última página): cortar por el final devolvía
 * los mensajes viejos y parecía que no había aviso. Contando, el orden da igual.
 */
const cuantos = (arr, re) => arr.filter((t) => re.test(t)).length;

(async () => {
  const B = await login('+240555000003', '123456');
  const T = await login('+240222000123', 'MiClave123');

  const o = await req('POST', '/lifebook/commerce/orders', B, {
    items: [{ productId: PRODUCTO, quantity: 1 }], deliveryMode: 'pickup', deliveryAddress: {},
    paymentMethod: 'in_store', note: 'PRUEBA de los avisos (se cancela)',
  }, { 'Idempotency-Key': `lb83a-${Date.now()}` });
  const ped = o.b?.order;
  console.log(`pedido ${ped?.code} (${ped?.id}) creado por el comprador`);

  // La conversación comprador↔tienda: se abre por su interlocutor, como hace la app.
  const detalle = await req('GET', `/lifebook/commerce/orders/${ped.id}`, B);
  const duenioTienda = detalle.b?.order?.shop?.ownerId;
  comprobar(!!duenioTienda, `la tienda del pedido es «${detalle.b?.order?.shop?.name ?? '?'}»`);
  const convComprador = await abrirConversacion(B, duenioTienda);
  const convTienda = await abrirConversacion(T, (await req('GET', `/lifebook/commerce/orders/${ped.id}`, T)).b?.order?.buyer?.id);
  const antesComprador = await mensajesDe(B, convComprador);
  const antesTienda = await mensajesDe(T, convTienda);
  console.log(`  antes: ${antesComprador.length} mensajes los del comprador · ${antesTienda.length} los de la tienda`);

  // El vendedor acepta: tiene que avisarse al COMPRADOR.
  const aceptar = await req('PATCH', `/lifebook/commerce/orders/${ped.id}/action`, T, { action: 'accept' });
  comprobar(aceptar.s === 200 || aceptar.s === 201, `la tienda acepta → HTTP ${aceptar.s}`);

  const delComprador = await mensajesDe(B, convComprador);
  comprobar(cuantos(delComprador, /aceptó tu pedido/i) > cuantos(antesComprador, /aceptó tu pedido/i),
    `el COMPRADOR recibe el aviso «La tienda aceptó tu pedido» (${cuantos(antesComprador, /aceptó tu pedido/i)} → ${cuantos(delComprador, /aceptó tu pedido/i)})`);

  // Y al preparar, otro aviso.
  const preparar = await req('PATCH', `/lifebook/commerce/orders/${ped.id}/action`, T, { action: 'prepare' });
  comprobar(preparar.s === 200 || preparar.s === 201, `la tienda prepara el pedido → HTTP ${preparar.s}`);
  const delComprador2 = await mensajesDe(B, convComprador);
  comprobar(cuantos(delComprador2, /preparación/i) > cuantos(delComprador, /preparación/i),
    `y el de «Tu pedido está en preparación» (${cuantos(delComprador, /preparación/i)} → ${cuantos(delComprador2, /preparación/i)})`);

  // Cancelar avisa a la TIENDA.
  const cancelar = await req('PATCH', `/lifebook/commerce/orders/${ped.id}/action`, B, { action: 'cancel' });
  comprobar(cancelar.s === 200 || cancelar.s === 201, `el comprador cancela → HTTP ${cancelar.s}`);
  const deLaTienda = await mensajesDe(T, convTienda);
  comprobar(cuantos(deLaTienda, /canceló el pedido/i) > cuantos(antesTienda, /canceló el pedido/i),
    `la TIENDA recibe el aviso «El comprador canceló el pedido» (${cuantos(antesTienda, /canceló el pedido/i)} → ${cuantos(deLaTienda, /canceló el pedido/i)})`);

  console.log(`\n  (el pedido ${ped.code} queda cancelado y devuelve su stock)`);
  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
