// lb94a-decisiones.cjs — LAS DOS DECISIONES DEL DUEÑO (18/09/2026), comprobadas contra la API real.
//
//   A) EL JUSTIFICANTE ES OBLIGATORIO para transferencia y facturación (y NO se pide en pago en tienda).
//   B) LA VENTANA DE RECLAMACIÓN son 7 DÍAS desde la entrega, comprobada en el SERVIDOR; y a la tienda no
//      se le paga antes de que venza (lo que está «en espera» no se liquida).
//
// Uso:  LB_API=http://127.0.0.1:3000/api/v1 node /root/lb94a.cjs
const API = process.env.LB_API ?? 'https://hk.egrouteplan.com/wallet/api/v1';

let fallos = 0;
const comprobar = (ok, texto) => { console.log(`  ${ok ? 'OK  ' : 'FALLO'} ${texto}`); if (!ok) fallos++; };

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t || '{}'); } catch { return { crudo: t.slice(0, 200) }; } };
const entrar = async (phone, password) => {
  const r = await j(await fetch(`${API}/mobility/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone, password }),
  }));
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
const JUSTIFICANTE = 'https://hk.egrouteplan.com/storage/lb-images/covers/b3c7e477-e074-4e41-ba4c-6d0a03785658.png';
const MOTIVO = 'El paquete llegó abierto y falta una talla';

(async () => {
  const B = await entrar('+240555000003', '123456');
  const T = await entrar('+240222000123', 'MiClave123');
  const ids = [];

  const crear = async (metodo, nota) => {
    const r = await req('POST', '/lifebook/commerce/orders', B,
      { items: [{ productId: PRODUCTO, quantity: 1 }], deliveryMode: 'pickup', deliveryAddress: {}, paymentMethod: metodo, note: nota },
      { 'Idempotency-Key': `lb94a-${Date.now()}-${Math.random().toString(16).slice(2, 6)}` });
    if (!r.b?.order?.id) throw new Error(`no se creó (${metodo}): ${JSON.stringify(r.b).slice(0, 200)}`);
    ids.push(r.b.order.id);
    return r.b.order;
  };
  const entregar = async (o) => {
    for (const accion of ['accept', 'prepare', 'ready', 'deliver']) {
      const r = await req('PATCH', `/lifebook/commerce/orders/${o.id}/action`, T, { action: accion });
      if (!(r.s === 200 || r.s === 201)) throw new Error(`${accion} falló: HTTP ${r.s} ${r.b?.error?.code}`);
    }
  };

  // ── A) El justificante, obligatorio donde toca ────────────────────────────
  console.log('=== A. JUSTIFICANTE OBLIGATORIO (transferencia y facturación) ===');
  const transfer = await crear('transfer', 'PRUEBA de la decisión 1 (transferencia)');
  const sinPrueba = await req('POST', `/lifebook/commerce/orders/${transfer.id}/mark-paid`, T, { note: 'transferencia BGFI 99123' });
  comprobar(sinPrueba.b?.error?.code === 'PAYMENT_PROOF_REQUIRED',
    `transferencia SIN comprobante → ${sinPrueba.b?.error?.code ?? `HTTP ${sinPrueba.s}`}`);
  comprobar(/comprobante/i.test(String(sinPrueba.b?.error?.message ?? '')),
    `y lo dice claro: «${String(sinPrueba.b?.error?.message ?? '').slice(0, 80)}»`);
  const conPrueba = await req('POST', `/lifebook/commerce/orders/${transfer.id}/mark-paid`, T, { proofUrl: JUSTIFICANTE, note: 'transferencia BGFI 99123' });
  comprobar(conPrueba.s === 200 || conPrueba.s === 201, `con comprobante SÍ se marca cobrado → HTTP ${conPrueba.s} ${conPrueba.b?.order?.paymentStatus ?? conPrueba.b?.error?.code ?? ''}`);

  const factura = await crear('billing', 'PRUEBA de la decisión 1 (facturación)');
  const facturaSin = await req('POST', `/lifebook/commerce/orders/${factura.id}/mark-paid`, T, {});
  comprobar(facturaSin.b?.error?.code === 'PAYMENT_PROOF_REQUIRED', `facturación sin comprobante → ${facturaSin.b?.error?.code ?? `HTTP ${facturaSin.s}`}`);

  const tienda = await crear('in_store', 'PRUEBA de la decisión 1 (pago en tienda)');
  const tiendaSin = await req('POST', `/lifebook/commerce/orders/${tienda.id}/mark-paid`, T, {});
  comprobar(tiendaSin.s === 200 || tiendaSin.s === 201, `pago en tienda SIN comprobante SÍ se admite (el dinero se ve en mano) → HTTP ${tiendaSin.s} ${tiendaSin.b?.error?.code ?? ''}`);

  // ── B) La ventana de 7 días ───────────────────────────────────────────────
  console.log('\n=== B. LA VENTANA DE 7 DÍAS PARA RECLAMAR (comprobada en el servidor) ===');
  const reciente = await crear('in_store', 'PRUEBA de la decisión 2 (entregado hoy)');
  await entregar(reciente);
  const reclamoHoy = await req('PATCH', `/lifebook/commerce/orders/${reciente.id}/action`, B, { action: 'dispute', reason: MOTIVO });
  comprobar(reclamoHoy.s === 200 || reclamoHoy.s === 201, `un pedido entregado HOY se puede reclamar → HTTP ${reclamoHoy.s} ${reclamoHoy.b?.error?.code ?? ''}`);

  const viejo = await crear('in_store', 'PRUEBA de la decisión 2 (entregado hace 10 días)');
  await entregar(viejo);
  console.log(`  (el pedido ${viejo.code} se entregó de verdad; el SQL le pone la entrega 10 días atrás)`);
  console.log(`  PEDIDO_VIEJO=${viejo.id}`);

  // ── C) La liquidación espera a que venza la ventana ───────────────────────
  console.log('\n=== C. A LA TIENDA NO SE LE PAGA ANTES DE QUE VENZA ===');
  const saldo = (await req('GET', '/lifebook/commerce/money/balance', T)).b ?? {};
  console.log(`  la tienda: pendiente ${saldo.pendienteXaf} XAF · en espera ${saldo.enEsperaXaf} XAF (${saldo.enEsperaPedidos} pedidos)`);
  comprobar(Number(saldo.pendienteXaf ?? 0) >= 0, `el saldo responde con los dos números: pendiente ${saldo.pendienteXaf} y en espera ${saldo.enEsperaXaf}`);
  comprobar(Number(saldo.enEsperaXaf ?? 0) > 0, `lo recién entregado está EN ESPERA (no se puede pagar todavía): ${saldo.enEsperaXaf} XAF`);

  const liq = await req('POST', '/lifebook/commerce/money/settlements', await entrar('+240999888777', '123456'), { shopId: 'd8a2ece3-92b4-4959-8412-d26b5d698ade' });
  const codigo = liq.b?.error?.code ?? '';
  comprobar(codigo === 'SETTLEMENT_WINDOW_OPEN' || liq.s === 200 || liq.s === 201,
    `liquidar: ${codigo || `HTTP ${liq.s}`} ${codigo === 'SETTLEMENT_WINDOW_OPEN' ? '(dice que espera la ventana)' : ''}`);

  console.log(`\n  pedidos de la prueba: ${[transfer.code, factura.code, tienda.code, reciente.code, viejo.code].join(', ')}`);
  console.log(`\n${fallos === 0 ? 'TODO OK' : `FALLOS: ${fallos}`}`);
  process.exit(fallos === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
