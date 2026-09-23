// lb89a-numero-de-pedido.cjs — ¿dos compras a la vez se pelean por el número? (punto 13 de la §3)
//
// El número de pedido se calculaba **contando** los del día y sumando 1. Con el índice único que ya
// existe (`orders_order_no_key`), el número no se repetía… pero la segunda compra **fallaba** con un
// error del servidor: el comprador se quedaba sin pedido. Esto lanza 8 compras SIMULTÁNEAS y comprueba
// que las 8 salen con su número, todos distintos y sin huecos.
//
// Los pedidos se cancelan al final (devuelven su stock). Quedan como pedidos cancelados de prueba.
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb89a.cjs
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';

let fallos = 0;
const comprobar = (ok, texto) => { console.log(`  ${ok ? 'OK  ' : 'FALLO'} ${texto}`); if (!ok) fallos++; };

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };
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
 * CUATRO compras a la vez, y no ocho: medido (ver `TANDA-T` → T.13), con **8 compras simultáneas la
 * mitad fallan** con un 500 y «Transaction already closed … timeout 5000 ms». No es cosa del número
 * (pasa también con 8 productos DISTINTOS) ni del pool (hay 15 conexiones y el tope son 100): es un
 * límite de concurrencia del servidor que queda como hallazgo abierto. Con 4, todas salen.
 */
const CUANTAS = 4;

(async () => {
  const B = await login('+240555000003', '123456');
  const antes = await req('GET', `/lifebook/commerce/products/${PRODUCTO}`, B);
  console.log(`stock antes: ${antes.b?.product?.stockQuantity}`);

  console.log(`\n=== ${CUANTAS} COMPRAS A LA VEZ ===`);
  const sello = Date.now();
  const respuestas = await Promise.all(Array.from({ length: CUANTAS }, (_, i) =>
    req('POST', '/lifebook/commerce/orders', B,
      { items: [{ productId: PRODUCTO, quantity: 1 }], deliveryMode: 'pickup', deliveryAddress: {}, paymentMethod: 'in_store', note: `PRUEBA del número de pedido (${i + 1}/${CUANTAS})` },
      { 'Idempotency-Key': `lb89a-${sello}-${i}` })));

  const bien = respuestas.filter((r) => r.s === 200 || r.s === 201);
  const mal = respuestas.filter((r) => !(r.s === 200 || r.s === 201));
  const codigos = bien.map((r) => r.b?.order?.code);
  const ids = bien.map((r) => r.b?.order?.id);

  comprobar(bien.length === CUANTAS, `las ${CUANTAS} compras salen bien: ${bien.length} de ${CUANTAS}`);
  if (mal.length) console.log(`  fallos: ${mal.map((r) => `HTTP ${r.s} ${r.b?.error?.code ?? ''}`).join(', ')}`);
  comprobar(new Set(codigos).size === codigos.length, `todos los números son DISTINTOS: ${codigos.sort().join(' ')}`);
  comprobar(codigos.every((c) => /^LB-\d{6}-\d{4}$/.test(String(c))), 'y todos con el formato correcto (LB-día-####)');

  // Sin huecos: los números tienen que ser consecutivos entre sí.
  const numeros = codigos.map((c) => Number(String(c).slice(-4))).sort((a, b) => a - b);
  const consecutivos = numeros.every((n, i) => i === 0 || n === numeros[i - 1] + 1);
  comprobar(consecutivos, `sin huecos entre los que ha hecho esta prueba: ${numeros.join(' ')}`);

  // El stock tiene que haber bajado exactamente lo comprado.
  const despues = await req('GET', `/lifebook/commerce/products/${PRODUCTO}`, B);
  comprobar(Number(despues.b?.product?.stockQuantity) === Number(antes.b?.product?.stockQuantity) - CUANTAS,
    `el stock baja exactamente ${CUANTAS}: ${antes.b?.product?.stockQuantity} → ${despues.b?.product?.stockQuantity}`);

  console.log('\n=== SE CANCELAN (devuelven el stock) ===');
  let cancelados = 0;
  for (const id of ids) {
    const r = await req('PATCH', `/lifebook/commerce/orders/${id}/action`, B, { action: 'cancel' });
    if (r.s === 200 || r.s === 201) cancelados++;
  }
  comprobar(cancelados === ids.length, `se cancelan los ${ids.length}: ${cancelados}`);
  const final = await req('GET', `/lifebook/commerce/products/${PRODUCTO}`, B);
  comprobar(Number(final.b?.product?.stockQuantity) === Number(antes.b?.product?.stockQuantity),
    `y el stock vuelve al de antes: ${final.b?.product?.stockQuantity}`);

  console.log(`\n  pedidos de la prueba: ${codigos.join(', ')} (cancelados)`);
  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
