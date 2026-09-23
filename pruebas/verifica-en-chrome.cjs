/* =============================================================================
   Prueba en NAVEGADOR REAL (Chrome) con sesion de admin valida.

   Que se comprueba, que es lo unico que importa ahora:
     - entrando por /admin/ecomerse-docs con sesion de admin, se ve la pagina;
     - el menu del panel sigue intacto (esta pagina no lo toca);
     - sin sesion no se ve la cola, se pide entrar;
     - la pagina NO se queda en blanco ni cae en la app de pasajeros.

   Cada escenario abre SU PROPIA pestaña y se espera ACTIVAMENTE a que ocurra lo que se mide: los
   plazos fijos hacian que dos ejecuciones dieran resultados distintos.
   ========================================================================== */
'use strict';
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PUERTO = 9300 + Math.floor(Math.random() * 400);
const BASE = 'https://hk.egrouteplan.com';
const RUTA = '/admin/ecomerse-docs';
const ADMIN_ID = process.argv[2];
const JWT_SECRET = process.argv[3];
const PERFIL = path.join(process.env.TEMP, 'chrome-cdp-' + Date.now());

if (!ADMIN_ID || !JWT_SECRET) { console.error('Uso: node verifica-en-chrome.cjs <adminId> <jwtSecret>'); process.exit(2); }

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
    let id = 0;
    const pendientes = new Map();
    ws.addEventListener('message', (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.id && pendientes.has(m.id)) {
        const { resolver, rechazar } = pendientes.get(m.id);
        pendientes.delete(m.id);
        if (m.error) rechazar(new Error(JSON.stringify(m.error))); else resolver(m.result);
      }
    });
    ws.addEventListener('error', () => rej(new Error('ws error')));
    ws.addEventListener('open', () => res({
      enviar(metodo, params) {
        return new Promise((resolver, rechazar) => {
          const mid = ++id;
          pendientes.set(mid, { resolver, rechazar });
          ws.send(JSON.stringify({ id: mid, method: metodo, params: params || {} }));
        });
      },
      cerrar() { try { ws.close(); } catch (e) {} },
    }));
  });
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

const ESTADO = `JSON.stringify({
  ruta: location.pathname,
  alArrancar: (window.__ecomerseDocsArranque||{}).ruta,
  readyStateArranque: (window.__ecomerseDocsArranque||{}).enEjecucion,
  capa: !!document.getElementById('ecomerse-docs-root'),
  aside: !!document.querySelector('aside'),
  menuConTienda: document.querySelector('aside') ? document.querySelector('aside').textContent.includes('Tienda') : false,
  menuConDocumentacion: document.querySelector('aside') ? document.querySelector('aside').textContent.includes('Documentación') : false,
  enlacesEnElMenu: document.querySelectorAll('aside a').length,
  texto: (document.getElementById('ecomerse-docs-root')||{}).textContent ? document.getElementById('ecomerse-docs-root').textContent.slice(0,160) : '',
  appDePasajeros: /Pasar a conductor/.test(document.body.textContent || ''),
  pideEntrar: /Iniciar sesi|Contrase/.test(document.body.textContent || '')
})`;

(async () => {
  console.log('=== arrancando Chrome con depuracion ===');
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${PERFIL}`, '--window-size=1400,900', 'about:blank',
  ], { stdio: 'ignore' });

  let version = null;
  for (let i = 0; i < 50; i++) {
    await esperar(300);
    try { version = await jsonHttp('/json/version'); break; } catch (e) {}
  }
  if (!version) { console.log('  FALLA Chrome no arranco'); chrome.kill(); process.exit(1); }
  console.log('  Chrome: ' + String(version['Browser']));

  /* Chrome nuevo ya no ofrece /json/new por HTTP: la pestaña se abre con Target.createTarget desde
     la conexion de NAVEGADOR de CDP. Se saca su direccion de /json/version. */
  const navegador = await conectar(version.webSocketDebuggerUrl);
  async function nuevaPestana(url) {
    const { targetId } = await navegador.enviar('Target.createTarget', { url });
    await esperar(600);
    const lista = await jsonHttp('/json/list');
    const t = lista.find((x) => x.id === targetId) || lista.find((x) => x.type === 'page' && x.url === url);
    if (!t) throw new Error('no encuentro la pestaña nueva');
    const cdp = await conectar(t.webSocketDebuggerUrl);
    await cdp.enviar('Runtime.enable');
    await cdp.enviar('Page.enable');
    return cdp;
  }
  /* Cerrar de verdad la pestaña: una pestaña del panel que siga abierta puede volver a escribir la
     sesion y estropear la medicion siguiente (pasaba: la prueba "sin sesion" veia sesion). */
  async function cerrarPestana(cdp) {
    try { await cdp.enviar('Page.close'); } catch (e) {}
    try { cdp.cerrar(); } catch (e) {}
    await esperar(800);
  }
  async function evaluar(cdp, expr) {
    const r = await cdp.enviar('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return null;
    return r.result.value;
  }
  async function esperarA(cdp, expr, msMax) {
    const limite = Date.now() + (msMax || 20000);
    while (Date.now() < limite) {
      try { if (await evaluar(cdp, expr) === true) return true; } catch (e) {}
      await esperar(300);
    }
    return false;
  }

  /* ============================================================================
     A) CON sesion de admin: se abre la URL como la escribe un admin en el navegador
     ========================================================================== */
  console.log('\n=== A) /admin/ecomerse-docs con sesion de admin ===');
  /* Primero se deja la sesion guardada en el navegador (es lo que pasa cuando el admin ya ha entrado
     al panel alguna vez). Despues se abre la URL en una pestaña NUEVA, que es el caso real: escribir
     la direccion y pulsar Enter. */
  const S = await nuevaPestana(BASE + '/admin/');
  await esperarA(S, `document.readyState === 'complete'`);
  await evaluar(S, `localStorage.setItem('unified_token', ${JSON.stringify(TOKEN)}); localStorage.setItem('token', ${JSON.stringify(TOKEN)}); 1`);
  const api = await evaluar(S, `fetch('/api/ecomerse/admin/docs/stats',{headers:{Authorization:'Bearer '+localStorage.getItem('unified_token')}}).then(r=>r.status)`);
  check('la API acepta la sesion de admin (200)', api === 200, api);

  const A = await nuevaPestana(BASE + RUTA);
  await esperarA(A, `!!document.getElementById('ecomerse-docs-root')`, 25000);
  const a = JSON.parse(await evaluar(A, ESTADO));
  console.log('  estado: ' + JSON.stringify(a));

  check('el archivo arranco viendo la ruta pedida', a.alArrancar === RUTA, a.alArrancar);
  check('arranco antes de que el panel dibujase (readyState interactive)', a.readyStateArranque === 'interactive', a.readyStateArranque);
  check('la pagina se ha montado', a.capa === true, a.capa);
  check('la pagina trae su contenido', /Documentación de anuncios/.test(a.texto), a.texto);
  check('el menu del panel esta montado al lado', a.aside === true, a.aside);
  check('el menu conserva sus entradas (Tienda)', a.menuConTienda === true);
  check('NO se ha anadido ninguna entrada al menu', a.menuConDocumentacion === false, a.menuConDocumentacion);
  check('la pagina NO se queda en blanco', a.texto.length > 0, a.texto);
  check('NO cae en la app de pasajeros', a.appDePasajeros === false, a.appDePasajeros);

  /* ============================================================================
     B) SIN sesion: se borra la sesion y se abre la URL en una pestaña nueva
     ========================================================================== */
  console.log('\n=== B) la misma URL SIN sesion ===');
  /* Se cierran las pestañas anteriores antes de medir: una pestaña del panel abierta puede reescribir
     la sesion y contaminar la medicion. Despues se borra la sesion y se abre una pestaña nueva. */
  await cerrarPestana(A);
  await cerrarPestana(S);
  const S2 = await nuevaPestana(BASE + '/admin/');
  await esperarA(S2, `document.readyState === 'complete'`);
  await evaluar(S2, `localStorage.clear(); sessionStorage.clear(); 1`);
  const sinSesion = await evaluar(S2, `localStorage.getItem('unified_token')`);
  check('la sesion se ha borrado de verdad', sinSesion === null, sinSesion);
  await cerrarPestana(S2);

  const B = await nuevaPestana(BASE + RUTA);
  await esperarA(B, `document.readyState === 'complete'`, 20000);
  await esperar(4000);
  const b = JSON.parse(await evaluar(B, ESTADO));
  console.log('  estado: ' + JSON.stringify(b));
  check('no se muestra la cola de documentos', b.capa === false, b.capa);
  check('no se cuela la app de pasajeros', b.appDePasajeros === false, b.appDePasajeros);
  check('el panel pide iniciar sesion', b.pideEntrar === true, b.pideEntrar);

  console.log(`\n================  ${pasan} pruebas pasan, ${fallan} fallan  ================\n`);
  try { fs.rmSync(PERFIL, { recursive: true, force: true }); } catch (e) {}
  chrome.kill();
  process.exit(fallan === 0 ? 0 : 1);
})().catch((e) => {
  console.error('ERROR: ' + (e && e.message));
  try { fs.rmSync(PERFIL, { recursive: true, force: true }); } catch (err) {}
  process.exit(1);
});
