// lb87a-dinero.cjs — ¿sabe el sistema cuánto le debe a la tienda y cuánto se queda la plataforma?
// (punto 8 de la §3)
//
// Al entregar un pedido se congela su desglose y se escribe el asiento de doble partida. Esto comprueba
// lo que de verdad importa de ese dinero: que la comisión sea la acordada, que el libro **cuadre**, que
// el vendedor pueda ver lo que se le debe, que el comprador NO vea la comisión de la tienda, y que la
// liquidación manual (pago a mano) quede registrada y no se pueda repetir.
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb87a.cjs
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

const PRODUCTO = '074e141b-f618-47c5-9078-acb74e82d467'; // 12 000 XAF
const TIENDA_ID = 'd8a2ece3-92b4-4959-8412-d26b5d698ade'; // Hotel Demo Malabo

(async () => {
  const B = await login('+240555000003', '123456');      // comprador de pruebas
  const T = await login('+240222000123', 'MiClave123');   // la tienda
  const ADM = await login('+240999888777', '123456');     // admin (la plataforma)

  const saldo = async (tok) => (await req('GET', '/lifebook/commerce/money/balance', tok)).b;
  const antes = await saldo(T);
  console.log(`antes: la tienda «${antes?.shop?.name}» tiene ${antes?.pedidos} pedidos asentados · pendiente ${antes?.pendienteXaf} XAF · comisión acumulada ${antes?.comisionXaf} XAF`);

  // ── A) Un pedido entregado deja su dinero asentado ────────────────────────
  console.log('\n=== A. ENTREGAR ASIENTA EL DINERO (12 000 XAF, sin entrega) ===');
  const o = await req('POST', '/lifebook/commerce/orders', B,
    { items: [{ productId: PRODUCTO, quantity: 1 }], deliveryMode: 'pickup', deliveryAddress: {}, paymentMethod: 'in_store', note: 'PRUEBA del dinero (se entrega)' },
    { 'Idempotency-Key': `lb87a-${Date.now()}` });
  const ped = o.b?.order;
  console.log(`  pedido ${ped?.code} · total ${ped?.totalXaf} XAF`);
  comprobar(ped?.fees === undefined, 'el COMPRADOR no ve la comisión de la tienda (no viene en su detalle)');

  for (const accion of ['accept', 'prepare', 'ready', 'deliver']) {
    const r = await req('PATCH', `/lifebook/commerce/orders/${ped.id}/action`, T, { action: accion });
    if (!(r.s === 200 || r.s === 201)) throw new Error(`${accion} falló: HTTP ${r.s} ${r.b?.error?.code}`);
  }

  const detalleTienda = await req('GET', `/lifebook/commerce/orders/${ped.id}`, T);
  const f = detalleTienda.b?.order?.fees;
  comprobar(f?.productosXaf === 12000, `la tienda ve lo que ingresa por el producto: ${f?.productosXaf} XAF`);
  comprobar(f?.comisionXaf === 960, `la comisión es el 8 % (960 XAF): ${f?.comisionXaf}`);
  comprobar(f?.aPagarXaf === 11040, `y lo que va a cobrar la tienda: ${f?.aPagarXaf} XAF`);
  comprobar(f?.topeAplicado === false, `con este importe el tope no entra: topeAplicado=${f?.topeAplicado}`);

  const despues = await saldo(T);
  comprobar(despues.pendienteXaf === antes.pendienteXaf + 11040, `el pendiente sube 11 040: ${antes.pendienteXaf} → ${despues.pendienteXaf}`);
  comprobar(despues.comisionXaf === antes.comisionXaf + 960, `y la comisión acumulada sube 960: ${antes.comisionXaf} → ${despues.comisionXaf}`);
  comprobar(despues.pedidos === antes.pedidos + 1, `con un pedido asentado más: ${antes.pedidos} → ${despues.pedidos}`);

  // ── B) El libro tiene que cuadrar ─────────────────────────────────────────
  console.log('\n=== B. EL LIBRO DE CUENTAS CUADRA ===');
  const resumen = (await req('GET', '/lifebook/commerce/money/summary', ADM)).b;
  comprobar(resumen?.libro?.cuadra === true, `el debe y el haber coinciden: ${resumen?.libro?.debeXaf} = ${resumen?.libro?.haberXaf}`);
  comprobar(resumen?.comisionTotalXaf >= 960, `la plataforma ve su comisión: ${resumen?.comisionTotalXaf} XAF`);
  comprobar(resumen?.pendienteTotalXaf >= 11040, `y lo que debe a las tiendas: ${resumen?.pendienteTotalXaf} XAF`);
  const miTienda = (resumen?.tiendas ?? []).find((t) => t.shopId === TIENDA_ID);
  comprobar(!!miTienda && miTienda.pendienteXaf >= 11040, `con el desglose por tienda: «${miTienda?.nombre}» pendiente ${miTienda?.pendienteXaf} XAF`);

  const comoComprador = await req('GET', '/lifebook/commerce/money/summary', B);
  comprobar(comoComprador.s >= 400 && comoComprador.b?.error?.code === 'NOT_ADMIN', `el comprador no ve la caja de la plataforma → ${comoComprador.b?.error?.code ?? `HTTP ${comoComprador.s}`}`);
  // OJO con esta comprobación (me costó un falso fallo): `GET balance` SIN `shopId` devuelve **las
  // tiendas del que llama** — y el comprador de pruebas resulta que también tiene una tienda, así que
  // responde 200 con la suya, que es lo correcto. Lo que hay que probar es pedir la tienda de OTRO.
  const saldoAjeno = await req('GET', `/lifebook/commerce/money/balance?shopId=${TIENDA_ID}`, B);
  comprobar(saldoAjeno.s >= 400 && saldoAjeno.b?.error?.code === 'NOT_ORDER_PARTICIPANT', `el saldo de una tienda ajena no se puede mirar → ${saldoAjeno.b?.error?.code ?? `HTTP ${saldoAjeno.s}`}`);

  // ── C) La liquidación manual ──────────────────────────────────────────────
  console.log('\n=== C. LIQUIDAR ES PAGAR A MANO, Y QUEDA REGISTRADO ===');
  const comoTienda = await req('POST', '/lifebook/commerce/money/settlements', T, { shopId: TIENDA_ID });
  comprobar(comoTienda.s >= 400 && comoTienda.b?.error?.code === 'NOT_ADMIN', `solo el admin liquida (la tienda no puede pagarse a sí misma) → ${comoTienda.b?.error?.code ?? `HTTP ${comoTienda.s}`}`);

  const liq = await req('POST', '/lifebook/commerce/money/settlements', ADM, { shopId: TIENDA_ID, note: 'Pago de prueba por transferencia' });
  comprobar(liq.s === 200 || liq.s === 201, `el admin liquida → HTTP ${liq.s} ${liq.b?.error?.code ?? ''}`);
  comprobar(liq.b?.settlement?.importeXaf === despues.pendienteXaf, `se liquida TODO el pendiente: ${liq.b?.settlement?.importeXaf} XAF (pendiente era ${despues.pendienteXaf})`);
  comprobar(liq.b?.settlement?.pedidos === despues.pendientePedidos, `y se registra por cuántos pedidos: ${liq.b?.settlement?.pedidos}`);
  comprobar(liq.b?.cuentas?.pendienteXaf === 0, `al quedar liquidado, el pendiente es 0: ${liq.b?.cuentas?.pendienteXaf}`);

  const repetida = await req('POST', '/lifebook/commerce/money/settlements', ADM, { shopId: TIENDA_ID });
  comprobar(repetida.s >= 400 && repetida.b?.error?.code === 'NOTHING_TO_SETTLE', `no se puede liquidar dos veces lo mismo → ${repetida.b?.error?.code ?? `HTTP ${repetida.s}`}`);

  const final = await saldo(T);
  comprobar(final.pendienteXaf === 0, `la tienda ve que ya no le deben nada: pendiente ${final.pendienteXaf}`);
  comprobar((final.liquidaciones ?? []).length >= 1, `y ve la liquidación en su lista: ${JSON.stringify((final.liquidaciones ?? [])[0]?.importeXaf)} XAF`);
  comprobar(final.aPagarTotalXaf === despues.aPagarTotalXaf, `el total facturado no cambia al liquidar: ${final.aPagarTotalXaf} XAF`);

  console.log(`\n  pedido ${ped.code} entregado · liquidación de ${liq.b?.settlement?.importeXaf} XAF · libros y comisiones QUEDAN en la base (se limpian a mano)`);
  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
