// lb77a-compare-and-set.cjs — ¿un cambio de estado PISA a otro? (punto 4 de la ACCIÓN INMEDIATA)
//
// El servidor leía el estado del pedido, lo validaba y luego hacía `UPDATE … WHERE id = …` SIN mirar
// el estado. Si dos cambios entran a la vez, los dos pasan. Eso no se puede forzar desde fuera (la
// ventana es de milisegundos), así que aquí se mide su CONSECUENCIA, que sí es observable y grave:
//
//   A) 8 cancelaciones SIMULTÁNEAS del mismo pedido. El stock solo se puede devolver UNA vez.
//      Sin el arreglo, cada cancelación que leyó «created» devuelve su cantidad → stock inflado.
//   B) Carrera mixta: el comprador cancela y la tienda acepta A LA VEZ. Como mucho una puede ganar,
//      y el pedido tiene que acabar en el estado del que ganó (nunca «cancelado y aceptado»).
//
// Si alguna respuesta trae ORDER_CHANGED, la ventana se ha ejercitado de verdad (esa respuesta solo
// puede salir de una lectura que se quedó vieja). Si no sale ninguna, se dice tal cual: la garantía
// queda en la condición del UPDATE, no en una carrera que este test haya pillado.
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb77a.cjs
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';
let prepararRed = async () => 'sin-proxy';
if (!process.env.LB_API) {
  try { ({ prepararRed } = require('./red.cjs')); } catch { /* directo */ }
}

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

const PRODUCTO = '074e141b-f618-47c5-9078-acb74e82d467'; // Camiseta (Hotel Demo Malabo)

/** Stock y ventas del producto, leídos de la propia API (no de la base de datos). */
const ficha = async (tok) => {
  const p = await req('GET', `/lifebook/commerce/products/${PRODUCTO}`, tok);
  const prod = p.b?.product ?? {};
  // OJO: no vale «la primera clave que contenga stock» — `stockMode` va antes que `stockQuantity`.
  const clave = (exactas, re) => exactas.find((k) => k in prod) ?? Object.keys(prod).find((k) => re.test(k));
  const ks = clave(['stockQuantity', 'stock', 'stock_quantity'], /^stock(?!Mode)/i);
  const kv = clave(['salesCount', 'sales_count'], /^sales/i);
  return { stock: ks ? Number(prod[ks]) : null, ventas: kv ? Number(prod[kv]) : null, ks, kv };
};

(async () => {
  console.log(`red: ${await prepararRed()}`);
  const B = await login('+240555000003', '123456');   // comprador de pruebas
  const T = await login('+240222000123', 'MiClave123'); // tienda (Hotel Demo Malabo)

  const inicio = await ficha(B);
  console.log(`al empezar: stock=${inicio.stock} (campo «${inicio.ks}») · ventas=${inicio.ventas} (campo «${inicio.kv}»)`);

  const crear = async (nota) => {
    const r = await req('POST', '/lifebook/commerce/orders', B,
      { items: [{ productId: PRODUCTO, quantity: 1 }], deliveryMode: 'pickup', deliveryAddress: {}, paymentMethod: 'in_store', note: nota },
      { 'Idempotency-Key': `lb77a-${Date.now()}-${Math.random().toString(16).slice(2, 6)}` });
    if (!r.b?.order?.id) throw new Error(`no se pudo crear el pedido: ${JSON.stringify(r.b).slice(0, 200)}`);
    return r.b.order;
  };

  // ── A) 8 cancelaciones simultáneas ────────────────────────────────────────
  console.log('\n=== A. OCHO CANCELACIONES A LA VEZ: EL STOCK SE DEVUELVE UNA SOLA VEZ ===');
  const oa = await crear('PRUEBA de carrera A (8 cancelaciones a la vez)');
  const trasCrear = await ficha(B);
  comprobar(trasCrear.stock === inicio.stock - 1, `al comprar baja 1: ${inicio.stock} → ${trasCrear.stock}`);

  const respuestas = await Promise.all(Array.from({ length: 8 }, () =>
    req('PATCH', `/lifebook/commerce/orders/${oa.id}/action`, B, { action: 'cancel' })));
  const ganadoras = respuestas.filter((r) => r.s === 200 || r.s === 201);
  const codigos = respuestas.map((r) => r.b?.error?.code ?? `HTTP ${r.s}`);
  const cambió = codigos.filter((c) => c === 'ORDER_CHANGED').length;
  console.log(`  respuestas: ${codigos.join(', ')}`);
  comprobar(ganadoras.length === 1, `gana exactamente UNA: ${ganadoras.length} de 8`);
  comprobar(respuestas.every((r) => r.s < 500), 'ninguna se cae con error de servidor (5xx)');
  comprobar(codigos.every((c) => c === `HTTP ${ganadoras[0]?.s}` || c === 'ORDER_CHANGED' || c === 'INVALID_STATE_TRANSITION'),
    'las que pierden dicen por qué (estado cambiado o transición inválida)');
  // La prueba de fondo: si más de una cancelación hubiera pasado, el stock habría subido de más.
  const trasA = await ficha(B);
  comprobar(trasA.stock === inicio.stock, `el stock vuelve EXACTAMENTE al de antes: ${trasA.stock} (esperado ${inicio.stock}; sin el arreglo habría subido a ${inicio.stock + (8 - ganadoras.length)})`);
  comprobar(trasA.ventas === inicio.ventas, `cancelar no suma ventas: ${inicio.ventas} → ${trasA.ventas}`);
  console.log(`  (ORDER_CHANGED de verdad: ${cambió} → ${cambió ? 'la ventana se ha ejercitado' : 'la carrera no llegó a solaparse en este intento'})`);

  // ── B) Carrera mixta: cancelar (comprador) y aceptar (tienda) a la vez ─────
  console.log('\n=== B. EL COMPRADOR CANCELA Y LA TIENDA ACEPTA A LA VEZ: GANA UNO ===');
  const ob = await crear('PRUEBA de carrera B (cancelar contra aceptar)');
  const [cancelar, aceptar] = await Promise.all([
    req('PATCH', `/lifebook/commerce/orders/${ob.id}/action`, B, { action: 'cancel' }),
    req('PATCH', `/lifebook/commerce/orders/${ob.id}/action`, T, { action: 'accept' }),
  ]);
  const okCancelar = cancelar.s === 200 || cancelar.s === 201;
  const okAceptar = aceptar.s === 200 || aceptar.s === 201;
  console.log(`  cancelar → HTTP ${cancelar.s} ${cancelar.b?.error?.code ?? cancelar.b?.order?.status ?? ''}`);
  console.log(`  aceptar  → HTTP ${aceptar.s} ${aceptar.b?.error?.code ?? aceptar.b?.order?.status ?? ''}`);
  comprobar(!(okCancelar && okAceptar), 'las dos NO pueden ganar');
  comprobar(okCancelar || okAceptar, 'una de las dos gana');

  const detalle = await req('GET', `/lifebook/commerce/orders/${ob.id}`, B);
  const estado = detalle.b?.order?.status;
  const esperado = okCancelar ? 'cancelled' : okAceptar ? 'confirmed' : null;
  comprobar(!esperado || estado === esperado, `el pedido acaba en el estado del que ganó: status=${estado} (esperado ${esperado})`);
  const trasB = await ficha(B);
  const stockEsperado = estado === 'cancelled' ? inicio.stock : inicio.stock - 1;
  comprobar(trasB.stock === stockEsperado, `el stock cuadra con el estado final: ${trasB.stock} (esperado ${stockEsperado})`);

  // Limpieza: si ganó «aceptar», el pedido queda confirmado (no cancelado) → se cancela y el stock vuelve.
  if (estado !== 'cancelled') {
    const limpiar = await req('PATCH', `/lifebook/commerce/orders/${ob.id}/action`, B, { action: 'cancel' });
    comprobar(limpiar.s === 200 || limpiar.s === 201, `se cancela el pedido de la carrera B para dejarlo limpio → HTTP ${limpiar.s}`);
    const trasLimpiar = await ficha(B);
    comprobar(trasLimpiar.stock === inicio.stock, `y el stock vuelve al de antes: ${trasLimpiar.stock} (esperado ${inicio.stock})`);
  }

  console.log(`\n  pedidos de este test: ${oa.code} (cancelado) y ${ob.code} (cancelado)`);
  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
