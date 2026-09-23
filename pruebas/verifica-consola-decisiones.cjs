/* =============================================================================
   Prueba en NAVEGADOR REAL de las DECISIONES de la consola: aprobar y rechazar.

   Se pulsa de verdad, con el raton de Chrome, sobre los botones de la consola, y despues se
   comprueba el estado que queda en el servidor. Es la unica forma de saber que el ciclo entero
   funciona: que la pantalla llama al endpoint correcto, con el cuerpo correcto, y que el servidor
   lo acepta.
   ========================================================================== */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PUERTO = 9600 + Math.floor(Math.random() * 190);
const BASE = 'https://hk.egrouteplan.com';
const CONSOLA = '/admin-docs/';
const ADMIN_ID = process.argv[2];
const JWT_SECRET = process.argv[3];
const PERFIL = path.join(process.env.TEMP, 'chrome-decisiones-' + Date.now());

if (!ADMIN_ID || !JWT_SECRET) { console.error('Uso: node verifica-consola-decisiones.cjs <adminId> <jwtSecret>'); process.exit(2); }

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

(async () => {
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`, '--window-size=1400,1000', 'about:blank',
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 120; i++) { await esperar(400); try { version = await jsonHttp('/json/version'); break; } catch (e) {} }
  if (!version) { console.log('  FALLA Chrome no arranco'); chrome.kill(); process.exit(1); }

  const navegador = await conectar(version.webSocketDebuggerUrl);
  const { targetId } = await navegador.enviar('Target.createTarget', { url: BASE + CONSOLA });
  await esperar(900);
  const lista = await jsonHttp('/json/list');
  const t = lista.find((x) => x.id === targetId) || lista.find((x) => x.type === 'page');
  const cdp = await conectar(t.webSocketDebuggerUrl);
  await cdp.enviar('Runtime.enable');
  await cdp.enviar('Page.enable');

  async function evaluar(expr) {
    const r = await cdp.enviar('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return null;
    return r.result.value;
  }
  async function esperarA(expr, msMax) {
    const limite = Date.now() + (msMax || 20000);
    while (Date.now() < limite) { try { if (await evaluar(expr) === true) return true; } catch (e) {} await esperar(300); }
    return false;
  }
  /* Pulsar con el raton de verdad, no con un .click() de JavaScript: es lo que hace el administrador.
     El selector incluye las pestañas de estado (que al principio faltaban, y por eso la prueba no
     cambiaba de pestaña) y admite limitar la busqueda a UNA ficha concreta: pulsar el primer
     «Rechazar…» de la pagina hacia que la decision cayera en un documento distinto del que se queria
     medir, y la prueba lo acusaba como si fuera un fallo de la consola. */
  async function pulsar(textoBoton, dentroDeFichaCon) {
    const caja = await evaluar(`(function(){
      var ambito = document;
      if (${JSON.stringify(dentroDeFichaCon || null)}) {
        ambito = Array.prototype.find.call(document.querySelectorAll('.ficha'), function(x){ return x.textContent.indexOf(${JSON.stringify(dentroDeFichaCon || '')}) >= 0; }) || document;
      }
      var b = Array.prototype.find.call(ambito.querySelectorAll('.ficha .btn, .modal-pie .btn, .pestana'), function(x){ return x.textContent.trim().indexOf(${JSON.stringify(textoBoton)}) === 0; });
      if (!b) return 'null';
      var r = b.getBoundingClientRect();
      return JSON.stringify({ x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), texto: b.textContent.trim() });
    })()`);
    if (!caja || caja === 'null') return null;
    const c = JSON.parse(caja);
    await cdp.enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y, button: 'none', clickCount: 0 });
    await cdp.enviar('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    await cdp.enviar('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    return c;
  }
  const filas = `JSON.stringify(Array.prototype.map.call(document.querySelectorAll('.ficha'), function(f){ return { titulo: f.querySelector('h3').textContent, detalle: f.querySelector('.dato-tenue').textContent, estado: (f.querySelector('.chapa')||{}).textContent||'', motivo: (f.querySelector('.motivo')||{}).textContent||'' }; }))`;

  await esperarA(`document.readyState === 'complete'`, 20000);
  await evaluar(`sessionStorage.setItem('eg_docs_admin_token', ${JSON.stringify(TOKEN)}); 'ok'`);
  await cdp.enviar('Page.reload');
  await esperarA(`document.readyState === 'complete'`, 20000);
  await esperarA(`document.querySelectorAll('.ficha').length >= 2`, 20000);
  await esperar(600);

  console.log('\n=== 1) la cola con los documentos de prueba ===');
  let f = JSON.parse(await evaluar(filas));
  console.log('  filas: ' + JSON.stringify(f));
  /* Se cuentan las que hay, no las que yo esperaba: el documento de siempre tambien esta pendiente,
     y dar por hecho un numero fijo fue lo que hizo fallar esta prueba antes. */
  const cuantas = f.length;
  check('se ven los documentos pendientes', cuantas >= 3, cuantas);
  check('todos salen como pendientes', f.every((x) => /Pendiente/.test(x.estado)), f.map((x) => x.estado));
  check('se ve el numero de cada uno de los de prueba',
    f.some((x) => /CERT-PRUEBA-APROBAR/.test(x.detalle)) && f.some((x) => /AUT-PRUEBA-RECHAZAR/.test(x.detalle)),
    f.map((x) => x.detalle));

  console.log('\n=== 2) se APRUEBA el certificado (clic real de raton) ===');
  /* Se aprueba el que esta en la misma ficha que el numero CERT-PRUEBA-APROBAR. */
  const objetivo = await evaluar(`(function(){
    var f = Array.prototype.find.call(document.querySelectorAll('.ficha'), function(x){ return x.textContent.indexOf('CERT-PRUEBA-APROBAR') >= 0; });
    if (!f) return 'null';
    var b = Array.prototype.find.call(f.querySelectorAll('.btn'), function(x){ return x.textContent.trim() === 'Aprobar'; });
    if (!b) return 'null';
    var r = b.getBoundingClientRect();
    return JSON.stringify({ x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
  })()`);
  check('la ficha del certificado tiene su boton de aprobar', !!objetivo && objetivo !== 'null', objetivo);
  if (objetivo && objetivo !== 'null') {
    const c = JSON.parse(objetivo);
    await cdp.enviar('Input.dispatchMouseEvent', { type: 'mouseMoved', x: c.x, y: c.y, button: 'none', clickCount: 0 });
    await cdp.enviar('Input.dispatchMouseEvent', { type: 'mousePressed', x: c.x, y: c.y, button: 'left', clickCount: 1 });
    await cdp.enviar('Input.dispatchMouseEvent', { type: 'mouseReleased', x: c.x, y: c.y, button: 'left', clickCount: 1 });
  }
  /* Se espera ACTIVAMENTE a que la fila desaparezca: leer antes de tiempo fue el error de la version
     anterior de esta prueba. */
  await esperarA(`document.querySelectorAll('.ficha').length === ${cuantas - 1}`, 20000);
  const trasAprobar = JSON.parse(await evaluar(`JSON.stringify({ fichas: document.querySelectorAll('.ficha').length, tarjetas: Array.prototype.map.call(document.querySelectorAll('.dato'), function(d){ return d.textContent; }) })`));
  console.log('  tras aprobar: fichas=' + trasAprobar.fichas + ' tarjetas=' + JSON.stringify(trasAprobar.tarjetas));
  check('el certificado desaparece de pendientes', trasAprobar.fichas === cuantas - 1, trasAprobar.fichas);
  check('las tarjetas se actualizan', /Aprobados1/.test(trasAprobar.tarjetas.join('')), trasAprobar.tarjetas);

  console.log('\n=== 3) se RECHAZA la autorizacion, escribiendo el motivo ===');
  const abre = await pulsar('Rechazar', 'AUT-PRUEBA-RECHAZAR');
  check('se abre el cuadro de motivo en la ficha correcta', !!abre, abre);
  await esperar(400);
  await evaluar(`(function(){ var a=document.querySelector('.modal textarea'); a.value='La autorizacion no lleva el sello de la marca ni la fecha de validez.'; return 'escrito'; })()`);
  const confirma = await pulsar('Rechazar (');
  check('se pulsa confirmar', !!confirma, confirma);
  await esperarA(`document.querySelectorAll('.ficha').length === ${cuantas - 2}`, 20000);
  const trasRechazar = JSON.parse(await evaluar(`JSON.stringify({ fichas: document.querySelectorAll('.ficha').length, tarjetas: Array.prototype.map.call(document.querySelectorAll('.dato'), function(d){ return d.textContent; }) })`));
  console.log('  tras rechazar: fichas=' + trasRechazar.fichas + ' tarjetas=' + JSON.stringify(trasRechazar.tarjetas));
  check('la autorizacion desaparece de pendientes', trasRechazar.fichas === cuantas - 2, trasRechazar.fichas);
  check('las tarjetas lo reflejan', /Rechazados1/.test(trasRechazar.tarjetas.join('')), trasRechazar.tarjetas);

  console.log('\n=== 4) la pestaña de rechazados enseña el motivo ===');
  await pulsar('Rechazados');
  await esperarA(`(function(){ var p=document.querySelector('.pestana.activa'); return !!p && p.textContent.indexOf('Rechazados') === 0; })()`, 10000);
  await esperarA(`document.querySelectorAll('.ficha').length === 1 && /AUT-PRUEBA-RECHAZAR/.test(document.querySelector('.ficha').textContent)`, 20000);
  await esperar(500);
  const rech = JSON.parse(await evaluar(filas));
  console.log('  filas: ' + JSON.stringify(rech));
  check('el documento rechazado aparece en su pestaña', rech.length === 1 && /AUT-PRUEBA-RECHAZAR/.test(rech[0].detalle), rech);
  check('sale marcado como rechazado', /Rechazado/.test(rech[0].estado), rech[0].estado);
  check('y se lee el motivo que escribimos', /sello de la marca/.test(rech[0].motivo), rech[0].motivo);
  check('un documento ya revisado no ofrece aprobar ni rechazar', !/Aprobar/.test(await evaluar(`document.querySelector('.ficha').textContent`)));

  console.log(`\n================  ${pasan} pruebas pasan, ${fallan} fallan  ================\n`);
  try { fs.rmSync(PERFIL, { recursive: true, force: true }); } catch (e) {}
  chrome.kill();
  process.exit(fallan === 0 ? 0 : 1);
})().catch((e) => {
  console.error('ERROR: ' + (e && e.message));
  try { fs.rmSync(PERFIL, { recursive: true, force: true }); } catch (err) {}
  process.exit(1);
});
