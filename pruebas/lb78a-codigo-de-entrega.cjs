// lb78a-codigo-de-entrega.cjs — ¿se puede probar el código de contra entrega sin límite?
// (punto 3 de la ACCIÓN INMEDIATA)
//
// El código son 4 dígitos. Antes se podían probar los 10 000 seguidos: la tienda podía marcar
// «entregado y cobrado» un pedido que el comprador nunca recibió. Lo que se comprueba aquí:
//
//   fase 1  cinco fallos seguidos NO bloquean todavía, y el 5º deja el pedido bloqueado: con el
//           código CORRECTO tiene que responder DELIVERY_CODE_LOCKED y el pedido seguir SIN entregar.
//   fase 2  (con el bloqueo ya caducado por SQL) un fallo más vuelve a bloquear al momento.
//   fase 3  (con el bloqueo caducado otra vez) el código CORRECTO sí entrega, y deja el contador a 0.
//   fase 4  un pedido nuevo, sin fallos previos, se entrega a la primera (que el candado no estorba).
//
// El estado va en /root/lb78a-estado.json para poder mirar la base de datos entre fase y fase.
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb78a.cjs fase1|2|3|4
const fs = require('node:fs');
const API = process.env.LB_API ?? 'http://127.0.0.1:3000/api/v1';
const ESTADO = '/root/lb78a-estado.json';

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
const leer = () => (fs.existsSync(ESTADO) ? JSON.parse(fs.readFileSync(ESTADO, 'utf8')) : {});
const guardar = (o) => fs.writeFileSync(ESTADO, JSON.stringify(o, null, 2));

/** Un código equivocado SEGURO (nunca el bueno), con 4 cifras. */
const malo = (bueno, salto) => {
  const n = (Number(bueno) + salto) % 10000;
  return String(n).padStart(4, '0');
};

const crear = async (B, nota) => {
  const r = await req('POST', '/lifebook/commerce/orders', B,
    { items: [{ productId: PRODUCTO, quantity: 1 }], deliveryMode: 'pickup', deliveryAddress: {}, paymentMethod: 'cash_on_delivery', note: nota },
    { 'Idempotency-Key': `lb78a-${Date.now()}-${Math.random().toString(16).slice(2, 6)}` });
  if (!r.b?.order?.id) throw new Error(`no se creó el pedido: ${JSON.stringify(r.b).slice(0, 200)}`);
  return r.b.order;
};

const confirmar = (T, id, code) => req('POST', `/lifebook/commerce/orders/${id}/confirm-code`, T, { code });
const estado = async (B, id) => (await req('GET', `/lifebook/commerce/orders/${id}`, B)).b?.order ?? {};

(async () => {
  const fase = String(process.argv[2] ?? '').toLowerCase();
  const B = await login('+240555000003', '123456');
  const T = await login('+240222000123', 'MiClave123');
  const st = leer();

  if (fase === 'fase1') {
    console.log('=== FASE 1: cinco fallos seguidos bloquean el intento ===');
    const o = await crear(B, 'PRUEBA del candado del código (se borra el candado por SQL)');
    console.log(`  pedido ${o.code} con código ${o.deliveryCode}`);
    for (let i = 1; i <= 4; i++) {
      const r = await confirmar(T, o.id, malo(o.deliveryCode, i));
      comprobar(r.b?.error?.code === 'DELIVERY_CODE_INVALID', `fallo ${i} → ${r.b?.error?.code ?? `HTTP ${r.s}`}`);
    }
    const quinto = await confirmar(T, o.id, malo(o.deliveryCode, 5));
    comprobar(quinto.b?.error?.code === 'DELIVERY_CODE_INVALID', `fallo 5 → ${quinto.b?.error?.code ?? `HTTP ${quinto.s}`} (este es el que bloquea)`);
    // LO IMPORTANTE: con el código BUENO, estando bloqueado, NO se puede entregar.
    const bueno = await confirmar(T, o.id, o.deliveryCode);
    comprobar(bueno.b?.error?.code === 'DELIVERY_CODE_LOCKED', `el código CORRECTO estando bloqueado → ${bueno.b?.error?.code ?? `HTTP ${bueno.s}`}`);
    const e = await estado(B, o.id);
    comprobar(e.status !== 'delivered', `el pedido NO se ha entregado: status=${e.status}`);
    comprobar(e.paymentStatus !== 'paid', `ni se ha cobrado: paymentStatus=${e.paymentStatus}`);
    guardar({ ...st, pedido1: o.id, code1: o.deliveryCode, codigo1: o.code });
    console.log(`\n  guardado: pedido1=${o.id} (míralo por SQL: intentos y hasta cuándo está bloqueado)`);
  }

  if (fase === 'fase2') {
    console.log('=== FASE 2: con el bloqueo caducado, un fallo más vuelve a bloquear ===');
    comprobar(!!st.pedido1, 'hay pedido de la fase 1');
    const r = await confirmar(T, st.pedido1, malo(st.code1, 7));
    comprobar(r.b?.error?.code === 'DELIVERY_CODE_INVALID', `el fallo se rechaza → ${r.b?.error?.code ?? `HTTP ${r.s}`}`);
    const bueno = await confirmar(T, st.pedido1, st.code1);
    comprobar(bueno.b?.error?.code === 'DELIVERY_CODE_LOCKED', `y vuelve a estar bloqueado (código bueno rechazado) → ${bueno.b?.error?.code ?? `HTTP ${bueno.s}`}`);
  }

  if (fase === 'fase3') {
    console.log('=== FASE 3: caducado el bloqueo, el código correcto SÍ entrega ===');
    const r = await confirmar(T, st.pedido1, st.code1);
    comprobar(r.s === 200 || r.s === 201, `confirmar con el código bueno → HTTP ${r.s} ${r.b?.error?.code ?? r.b?.order?.status ?? ''}`);
    const e = await estado(B, st.pedido1);
    comprobar(e.status === 'delivered', `el pedido queda entregado: status=${e.status}`);
    comprobar(e.paymentStatus === 'paid', `y cobrado: paymentStatus=${e.paymentStatus}`);
  }

  if (fase === 'fase4') {
    console.log('=== FASE 4: un pedido nuevo, sin fallos previos, se entrega a la primera ===');
    const o = await crear(B, 'PRUEBA de entrega limpia con el candado puesto');
    console.log(`  pedido ${o.code} con código ${o.deliveryCode}`);
    const r = await confirmar(T, o.id, o.deliveryCode);
    comprobar(r.s === 200 || r.s === 201, `a la primera → HTTP ${r.s} ${r.b?.error?.code ?? r.b?.order?.status ?? ''}`);
    const e = await estado(B, o.id);
    comprobar(e.status === 'delivered', `entregado: status=${e.status}`);
    guardar({ ...st, pedido2: o.id, codigo2: o.code });
  }

  if (!['fase1', 'fase2', 'fase3', 'fase4'].includes(fase)) {
    console.log('uso: node lb78a.cjs fase1|fase2|fase3|fase4');
    process.exit(1);
  }

  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
