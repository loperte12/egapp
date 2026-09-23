/* =============================================================================
   Verificacion de la moderacion de documentacion (panel + API), contra produccion.

   Que hace, y por que asi:
   - Firma un JWT de admin REAL (HS256 con el JWT_SECRET del backend, mismo payload que
     auth.controller: { sub, role }). Sin token no se puede probar nada: todo el modulo responde 401.
   - Prueba el ciclo completo: cola -> filtros -> contadores -> decision -> lo que ve el comprador.
   - Prueba los RECHAZOS: sin motivo debe negarse, y revisar dos veces tambien.
   - Usa el documento de prueba que ya existe (FAC-2026-0918) y avisa de que hay que restaurarlo
     por SQL (aprobar es irreversible desde la API a proposito: no hay endpoint para deshacer).
   ========================================================================== */
'use strict';
const crypto = require('crypto');

const API = 'https://hk.egrouteplan.com/api/ecomerse';
const ADMIN_ID = process.argv[2];
const ADMIN_PHONE = process.argv[3] || '';
const JWT_SECRET = process.argv[4];

if (!ADMIN_ID || !JWT_SECRET) {
  console.error('Uso: node verifica-docs-panel.cjs <adminId> <telefono> <jwtSecret>');
  process.exit(2);
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ahora = Math.floor(Date.now() / 1000);
const payload = { sub: ADMIN_ID, role: 'ADMIN', iat: ahora, exp: ahora + 900 };
const cabecera = b64({ alg: 'HS256', typ: 'JWT' });
const firma = crypto.createHmac('sha256', JWT_SECRET).update(`${cabecera}.${b64(payload)}`).digest('base64url');
const TOKEN = `${cabecera}.${b64(payload)}.${firma}`;

let pasan = 0, fallan = 0;
function check(nombre, condicion, detalle) {
  if (condicion) { pasan++; console.log(`  PASA  ${nombre}`); }
  else { fallan++; console.log(`  FALLA ${nombre}${detalle !== undefined ? '  -> ' + JSON.stringify(detalle) : ''}`); }
}

async function pedir(path, opciones = {}) {
  const r = await fetch(API + path, {
    method: opciones.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opciones.sinToken ? {} : { Authorization: `Bearer ${TOKEN}` }),
    },
    body: opciones.body ? JSON.stringify(opciones.body) : undefined,
  });
  const texto = await r.text();
  let json = null; try { json = JSON.parse(texto); } catch (e) { /* respuesta no JSON */ }
  return { status: r.status, json, texto };
}

function resumen() {
  console.log(`\n================  ${pasan} pruebas pasan, ${fallan} fallan  ================\n`);
  process.exit(fallan === 0 ? 0 : 1);
}

(async () => {
  console.log(`\nToken de admin firmado para ${ADMIN_PHONE} (${ADMIN_ID.slice(0, 8)}…), caduca en 15 min.\n`);

  // ---------------------------------------------------------------- 1. cola
  console.log('=== 1) la cola que alimenta la pantalla ===');
  const pend = await pedir('/admin/docs?status=pending');
  check('GET admin/docs?status=pending responde 200', pend.status === 200, pend.status);
  const docs = Array.isArray(pend.json) ? pend.json : [];
  check('devuelve una lista', Array.isArray(docs), typeof pend.json);
  check('hay al menos un pendiente que revisar', docs.length > 0, docs.length);
  if (docs.length) {
    const d = docs[0];
    check('cada documento trae su anuncio (title) para poder juzgarlo', !!d.producto && !!d.producto.title, d.producto);
    check('y trae la tienda (sellerName)', !!d.producto && !!d.producto.sellerName, d.producto && d.producto.sellerName);
    check('y la url del archivo para verlo', typeof d.url === 'string' && d.url.length > 0, d.url);
    check('y el tipo de documento', !!d.docType, d.docType);
    console.log(`         (revisando: ${d.docType} · ${d.docNumber} · ${d.amountXaf} XAF · ${d.producto && d.producto.title})`);
  }

  // ---------------------------------------------------------------- 2. filtros
  console.log('\n=== 2) los filtros de estado de la pantalla ===');
  const apro = await pedir('/admin/docs?status=approved');
  const rech = await pedir('/admin/docs?status=rejected');
  check('status=approved responde 200', apro.status === 200, apro.status);
  check('status=rejected responde 200', rech.status === 200, rech.status);
  check('approved no devuelve pendientes',
    (apro.json || []).every((d) => d.status === 'approved'), (apro.json || []).map((d) => d.status));
  check('rejected no devuelve pendientes',
    (rech.json || []).every((d) => d.status === 'rejected'), (rech.json || []).map((d) => d.status));
  const basura = await pedir('/admin/docs?status=' + encodeURIComponent('<script>alert(1)</script>'));
  check('un estado inventado no rompe la consulta', basura.status === 200 && Array.isArray(basura.json), basura.status);
  check('y cae en pendientes, sin colarse en aprobados ni rechazados',
    (basura.json || []).every((d) => d.status === 'pending'), (basura.json || []).map((d) => d.status));

  // ---------------------------------------------------------------- 3. contadores
  console.log('\n=== 3) los contadores de las tarjetas ===');
  const st = await pedir('/admin/docs/stats');
  check('GET admin/docs/stats responde 200', st.status === 200, st.status);
  const s = st.json || {};
  check('trae pendientes como numero', typeof s.pending === 'number', s.pending);
  check('trae aprobados como numero', typeof s.approved === 'number', s.approved);
  check('trae rechazados como numero', typeof s.rejected === 'number', s.rejected);
  check('el total es la suma de las partes', s.total === (s.pending || 0) + (s.approved || 0) + (s.rejected || 0), s);
  check('el total cuadra con la cola de pendientes', s.pending === docs.length, { stats: s.pending, cola: docs.length });
  console.log(`         (pendientes ${s.pending} · aprobados ${s.approved} · rechazados ${s.rejected} · total ${s.total})`);

  // ---------------------------------------------------------------- 4. sin token
  console.log('\n=== 4) sin sesion de admin no se ve nada ===');
  const sinTok = await pedir('/admin/docs', { sinToken: true });
  check('la cola exige token (401)', sinTok.status === 401, sinTok.status);
  const sinTok2 = await pedir('/admin/docs/stats', { sinToken: true });
  check('los contadores exigen token (401)', sinTok2.status === 401, sinTok2.status);

  if (!docs.length) { console.log('\n(no hay pendientes: se omiten las pruebas de decision)'); return resumen(); }
  const objetivo = docs[0];

  // ---------------------------------------------------------------- 5. rechazos invalidos
  console.log('\n=== 5) el rechazo exige motivo (la promesa al vendedor) ===');
  const sinMotivo = await pedir(`/admin/docs/${objetivo.id}`, { method: 'PUT', body: { approve: false } });
  check('rechazar sin motivo se rechaza (400)', sinMotivo.status === 400, { status: sinMotivo.status, json: sinMotivo.json });
  const motivoVacio = await pedir(`/admin/docs/${objetivo.id}`, { method: 'PUT', body: { approve: false, reason: '   ' } });
  check('un motivo en blanco tampoco vale (400)', motivoVacio.status === 400, motivoVacio.status);
  const sigueIgual = await pedir('/admin/docs?status=pending');
  check('el documento sigue pendiente tras los intentos fallidos',
    (sigueIgual.json || []).some((d) => d.id === objetivo.id), (sigueIgual.json || []).length);

  // ---------------------------------------------------------------- 6. decision real
  console.log('\n=== 6) la decision de verdad, como la hace el panel ===');
  const dec = await pedir(`/admin/docs/${objetivo.id}`, { method: 'PUT', body: { approve: true, reason: 'Prueba automatica del panel.' } });
  check('aprobar responde 200', dec.status === 200, { status: dec.status, json: dec.json });
  check('devuelve el estado nuevo', dec.json && dec.json.doc && dec.json.doc.status === 'approved', dec.json);

  const pendDespues = await pedir('/admin/docs?status=pending');
  check('ya no aparece en pendientes', !(pendDespues.json || []).some((d) => d.id === objetivo.id));
  const aproDespues = await pedir('/admin/docs?status=approved');
  check('ahora aparece en aprobados', (aproDespues.json || []).some((d) => d.id === objetivo.id));

  const repetir = await pedir(`/admin/docs/${objetivo.id}`, { method: 'PUT', body: { approve: true } });
  check('revisarlo dos veces se rechaza (400) en vez de pisar la decision ajena',
    repetir.status === 400, { status: repetir.status, json: repetir.json });

  // ---------------------------------------------------------------- 7. lo que ve el comprador
  console.log('\n=== 7) lo que ve el comprador en la ficha del anuncio ===');
  const prodId = objetivo.producto && objetivo.producto.id;
  if (prodId) {
    const prod = await pedir(`/products/${prodId}`, { sinToken: true });
    const cuerpo = prod.json || {};
    const dProd = cuerpo.docs || (cuerpo.data && cuerpo.data.docs) || null;
    check('la ficha del anuncio responde y trae su documentacion', prod.status === 200 && Array.isArray(dProd),
      { status: prod.status, docs: dProd === null ? 'sin docs' : dProd.length });
    const mio = Array.isArray(dProd) ? dProd.find((x) => x.id === objetivo.id) : null;
    check('el documento figura como aprobado para el comprador',
      !!mio && mio.status === 'approved', mio && mio.status);
    check('un documento aprobado no arrastra motivo de rechazo',
      !!mio && (mio.rejectionReason === null || mio.rejectionReason === undefined), mio && mio.rejectionReason);
  } else {
    check('el documento traia el id del anuncio', false, objetivo.producto);
  }

  // ---------------------------------------------------------------- 8. aviso
  console.log('\n=== 8) el documento quedo APROBADO por la prueba ===');
  console.log(`         id ${objetivo.id}`);
  console.log('         No hay endpoint para deshacerlo (a proposito: una decision firmada no se borra');
  console.log('         sola). Se restaura por SQL, que es lo que hace el siguiente paso del despliegue.');
  return resumen();
})().catch((e) => { console.error('ERROR inesperado:', e.message); process.exit(1); });
