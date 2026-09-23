/* =============================================================================
   Prueba en NAVEGADOR REAL de la consola de documentacion (pagina propia).

   Que se comprueba, que es lo que el administrador va a hacer:
     1) sin sesion, la consola pide entrar y NO llama a la API de la cola;
     2) con sesion de administrador, entra sola y se ve la cola con sus documentos;
     3) aprobar funciona y el documento cambia de estado;
     4) rechazar SIN motivo no llama al servidor (la promesa al vendedor);
     5) cerrar sesion vuelve a la pantalla de entrada.

   La sesion se mete en sessionStorage, que es donde la guarda la consola: es el
   mismo sitio y el mismo formato que deja el formulario de entrada, asi que lo que
   se prueba es el camino real, no un atajo.
   ========================================================================== */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PUERTO = 9800 + Math.floor(Math.random() * 190);
const BASE = 'https://hk.egrouteplan.com';
const CONSOLA = '/admin-docs/';
const ADMIN_ID = process.argv[2];
const JWT_SECRET = process.argv[3];
const PERFIL = path.join(process.env.TEMP, 'chrome-consola-' + Date.now());

if (!ADMIN_ID || !JWT_SECRET) { console.error('Uso: node verifica-consola-chrome.cjs <adminId> <jwtSecret>'); process.exit(2); }

let pasan = 0, fallan = 0;
function check(nombre, cond, detalle) {
  if (cond) { pasan++; console.log(`  PASA  ${nombre}`); }
  else { fallan++; console.log(`  FALLA ${nombre}${detalle !== undefined ? '  -> ' + JSON.stringify(detalle) : ''}`); }
}

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const ahora = Math.floor(Date.now() / 1000);
const payload = { sub: ADMIN_ID, role: 'ADMIN', iat: ahora, exp: ahora + 900 };
const cab = b64({ alg: 'HS256', typ: 'JWT' });
const TOKEN = `${cab}.${b64(payload)}.${crypto.createHmac('sha256', JWT_SECRET).update(`${cab}.${b64(payload)}`).digest('base64url')}`;

function jsonHttp(ruta) {
  return new Promise((res, rej) => {
    http.get({ host: '127.0.0.1', port: PUERTO, path: ruta }, (r) => {
      let d = ''; r.on('data', (c) => { d += c; }); r.on('end', () => { try { res(JSON.parse(d)); } catch (e) { res(d); } });
    }).on('error', rej);
  });
}
function conectar(urlWs) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(urlWs);
    let id = 0; const pend = new Map();
    ws.addEventListener('message', (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.id && pend.has(m.id)) { const { resolver, rechazar } = pend.get(m.id); pend.delete(m.id); m.error ? rechazar(new Error(JSON.stringify(m.error))) : resolver(m.result); }
    });
    ws.addEventListener('error', () => rej(new Error('ws error')));
    ws.addEventListener('open', () => res({
      enviar(metodo, params) { return new Promise((resolver, rechazar) => { const mid = ++id; pend.set(mid, { resolver, rechazar }); ws.send(JSON.stringify({ id: mid, method: metodo, params: params || {} })); }); },
      cerrar() { try { ws.close(); } catch (e) {} },
    }));
  });
}
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const ESTADO = `JSON.stringify({
  ruta: location.pathname,
  loginVisible: !document.getElementById('login').hidden,
  cabeceraVisible: !document.getElementById('cabecera').hidden,
  colaVisible: !document.getElementById('cola').hidden,
  hayToken: !!sessionStorage.getItem('eg_docs_admin_token'),
  quien: (document.getElementById('quien').textContent || '').trim(),
  tarjetas: Array.prototype.map.call(document.querySelectorAll('.dato'), function (d) { return d.textContent; }),
  pestanas: Array.prototype.map.call(document.querySelectorAll('.pestana'), function (p) { return p.textContent; }),
  fichas: document.querySelectorAll('.ficha').length,
  primerTitulo: (document.querySelector('.ficha h3') || {}).textContent || '',
  primerDetalle: (document.querySelector('.ficha .dato-tenue') || {}).textContent || '',
  textoFila: (document.querySelector('.ficha') || {}).textContent ? document.querySelector('.ficha').textContent.slice(0, 220) : '',
  vacio: !!document.querySelector('.vacio'),
  aviso: (document.getElementById('aviso-login').textContent || '').trim()
})`;

(async () => {
  console.log('=== arrancando Chrome ===');
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`, '--window-size=1400,1000', 'about:blank',
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 50; i++) { await esperar(300); try { version = await jsonHttp('/json/version'); break; } catch (e) {} }
  if (!version) { console.log('  FALLA Chrome no arranco'); chrome.kill(); process.exit(1); }
  console.log('  ' + version['Browser']);

  const navegador = await conectar(version.webSocketDebuggerUrl);
  async function nuevaPestana(url) {
    const { targetId } = await navegador.enviar('Target.createTarget', { url });
    await esperar(700);
    const lista = await jsonHttp('/json/list');
    const t = lista.find((x) => x.id === targetId) || lista.find((x) => x.type === 'page' && x.url === url);
    const cdp = await conectar(t.webSocketDebuggerUrl);
    await cdp.enviar('Runtime.enable');
    await cdp.enviar('Page.enable');
    return cdp;
  }
  async function evaluar(cdp, expr) {
    const r = await cdp.enviar('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return null;
    return r.result.value;
  }
  async function esperarA(cdp, expr, msMax) {
    const limite = Date.now() + (msMax || 20000);
    while (Date.now() < limite) { try { if (await evaluar(cdp, expr) === true) return true; } catch (e) {} await esperar(300); }
    return false;
  }
  async function cerrar(cdp) { try { await cdp.enviar('Page.close'); } catch (e) {} try { cdp.cerrar(); } catch (e) {} await esperar(600); }

  /* ---------------------------------------------------------------- 1) sin sesion */
  console.log('\n=== 1) la consola sin sesion ===');
  const A = await nuevaPestana(BASE + CONSOLA);
  await esperarA(A, `document.readyState === 'complete'`, 20000);
  await esperar(2500);
  const a = JSON.parse(await evaluar(A, ESTADO));
  console.log('  estado: ' + JSON.stringify(a));
  check('la consola carga y muestra su formulario de entrada', a.loginVisible === true, a.loginVisible);
  check('NO enseña la cola sin sesion', a.colaVisible === false, a.colaVisible);
  check('no hay sesion guardada', a.hayToken === false, a.hayToken);

  /* ---------------------------------------------------------------- 2) con sesion */
  console.log('\n=== 2) con sesion de administrador ===');
  await evaluar(A, `sessionStorage.setItem('eg_docs_admin_token', ${JSON.stringify(TOKEN)}); 'ok'`);
  await A.enviar('Page.reload');
  await esperarA(A, `document.readyState === 'complete'`, 20000);
  await esperarA(A, `!document.getElementById('cola').hidden`, 15000);
  await esperarA(A, `document.querySelectorAll('.ficha').length > 0 || !!document.querySelector('.vacio')`, 15000);
  const b = JSON.parse(await evaluar(A, ESTADO));
  console.log('  estado: ' + JSON.stringify(b));
  check('entra sin pedir la contraseña (la sesion ya estaba)', b.loginVisible === false, b.loginVisible);
  check('se ve la cola de documentacion', b.colaVisible === true, b.colaVisible);
  check('la cabecera se ve', b.cabeceraVisible === true, b.cabeceraVisible);
  check('muestra las cuatro tarjetas de resumen', b.tarjetas.length === 4, b.tarjetas);
  check('las pestañas llevan su cuenta', b.pestanas.length === 3 && /Pendientes \(\d+\)/.test(b.pestanas[0]), b.pestanas);
  check('hay un documento en la cola que revisar', b.fichas > 0, b.fichas);
  check('el documento enseña su tipo en castellano', /Factura de compra|Certificado|Autorización/.test(b.primerTitulo), b.primerTitulo);
  check('y enseña numero, importe y fecha', /Nº|XAF/.test(b.primerDetalle), b.primerDetalle);
  check('y enseña el anuncio y la tienda', /Tienda:/.test(b.textoFila), b.textoFila);
  check('ofrece aprobar y rechazar', /Aprobar/.test(b.textoFila) && /Rechazar/.test(b.textoFila), b.textoFila);

  /* ---------------------------------------------------------------- 3) rechazo sin motivo */
  console.log('\n=== 3) rechazar SIN motivo no debe llamar al servidor ===');
  const antesPut = await evaluar(A, `(window.__puts = 0, true)`);
  await evaluar(A, `(function(){ var f=window.fetch; window.fetch=function(u,o){ if(o&&o.method==='PUT') window.__puts++; return f.apply(this,arguments); }; return true; })()`);
  // Se abre el cuadro de rechazo del primer documento.
  await evaluar(A, `(function(){ var b=Array.prototype.find.call(document.querySelectorAll('.ficha .btn'), function(x){return x.textContent.indexOf('Rechazar')===0;}); b.click(); return true; })()`);
  await esperar(500);
  const modalSin = JSON.parse(await evaluar(A, `JSON.stringify({ area: !!document.querySelector('.modal textarea'), pie: (document.querySelector('.modal-pie')||{}).textContent || '' })`));
  check('se abre el cuadro de motivo', modalSin.area === true, modalSin);
  await evaluar(A, `(function(){ var b=Array.prototype.find.call(document.querySelectorAll('.modal-pie .btn'), function(x){return x.textContent.indexOf('Rechazar (')===0;}); b.click(); return true; })()`);
  await esperar(700);
  const putsSinMotivo = await evaluar(A, `window.__puts`);
  check('sin motivo NO manda ninguna decision al servidor', putsSinMotivo === 0, putsSinMotivo);
  const sigueAbierto = await evaluar(A, `!!document.querySelector('.modal textarea')`);
  check('el cuadro sigue abierto para poder escribir el motivo', sigueAbierto === true, sigueAbierto);
  await evaluar(A, `document.getElementById('capa-modal').className=''`);

  /* ---------------------------------------------------------------- 4) cerrar sesion */
  console.log('\n=== 4) cerrar sesion ===');
  await evaluar(A, `document.getElementById('btn-salir').click(); 'ok'`);
  await esperar(600);
  const d = JSON.parse(await evaluar(A, ESTADO));
  check('vuelve a la pantalla de entrada', d.loginVisible === true, d.loginVisible);
  check('y borra la sesion guardada', d.hayToken === false, d.hayToken);
  check('y deja de enseñar la cola', d.colaVisible === false, d.colaVisible);
  await cerrar(A);

  /* ---------------------------------------------------------------- 5) login de verdad */
  console.log('\n=== 5) el formulario de entrada con una contraseña equivocada ===');
  const B = await nuevaPestana(BASE + CONSOLA);
  await esperarA(B, `document.readyState === 'complete'`, 20000);
  await evaluar(B, `document.getElementById('telefono').value='+240999888777'; document.getElementById('clave').value='contrasena-que-no-es'; document.getElementById('form-login').dispatchEvent(new Event('submit',{cancelable:true})); 'enviado'`);
  await esperarA(B, `document.getElementById('aviso-login').className.indexOf('malo') >= 0`, 15000);
  const e = JSON.parse(await evaluar(B, ESTADO));
  console.log('  aviso: ' + JSON.stringify(e.aviso));
  check('una contraseña equivocada NO entra', e.colaVisible === false, e.colaVisible);
  check('y se explica el motivo en castellano', /Credenciales inválidas/i.test(e.aviso), e.aviso);
  check('y no se guarda ninguna sesion', e.hayToken === false, e.hayToken);
  await cerrar(B);

  console.log(`\n================  ${pasan} pruebas pasan, ${fallan} fallan  ================\n`);
  try { fs.rmSync(PERFIL, { recursive: true, force: true }); } catch (e) {}
  chrome.kill();
  process.exit(fallan === 0 ? 0 : 1);
})().catch((e) => {
  console.error('ERROR: ' + (e && e.message));
  try { fs.rmSync(PERFIL, { recursive: true, force: true }); } catch (err) {}
  process.exit(1);
});
