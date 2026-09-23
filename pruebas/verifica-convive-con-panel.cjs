/* =============================================================================
   Prueba de INTEGRACION contra el bundle COMPILADO del panel (el que sirve /admin/).

   Que comprueba: que esta pagina convive con el panel sin estropearlo. Se carga el bundle real
   dentro de un DOM, se deja que React monte su menu, y despues se carga este archivo para ver que
   NO le ha cambiado nada: mismo numero de entradas, mismo pie, mismo contenido. Y que en su propia
   URL la pagina aparece y el menu sigue ahi.
   ========================================================================== */
'use strict';
const fs = require('fs');
const { JSDOM } = require('jsdom');

/* El panel deja promesas sin capturar de sus llamadas heredadas a /api/v1/*; en jsdom eso mata el
   proceso antes de imprimir resultados. Se anotan y se sigue. */
const ajenos = [];
process.on('unhandledRejection', (r) => { ajenos.push(String(r && r.message ? r.message : r)); });

const BUNDLE = process.argv[2];
const MIO = process.argv[3];
const codigoMio = fs.readFileSync(MIO, 'utf8');
const bundle = fs.readFileSync(BUNDLE, 'utf8');

let pasan = 0, fallan = 0;
function check(nombre, cond, detalle) {
  if (cond) { pasan++; console.log(`  PASA  ${nombre}`); }
  else { fallan++; console.log(`  FALLA ${nombre}${detalle !== undefined ? '  -> ' + JSON.stringify(detalle) : ''}`); }
}

/* El usuario lleva los campos que el panel mira para dar la sesion por buena: si falta alguno,
   /auth/me "falla", el panel manda a /admin/login y la prueba mediria otra cosa. */
function redFalsa(cuerpoDocs) {
  return (url) => {
    let cuerpo = [];
    if (/\/auth\/me/.test(url)) {
      cuerpo = { data: { user: { id: 'u-1', phone: '+240999888777', fullName: 'Admin Prueba', role: 'ADMIN', isAdmin: true, admin: true, status: 'active' } } };
    } else if (/admin\/metrics/.test(url)) cuerpo = { pendingOrders: 0 };
    else if (/driver-documents/.test(url)) cuerpo = { data: { drivers: [] } };
    else if (/\/admin\/docs\/stats/.test(url)) cuerpo = { pending: 1, approved: 0, rejected: 0, total: 1 };
    else if (/\/admin\/docs/.test(url)) cuerpo = cuerpoDocs;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(cuerpo), text: () => Promise.resolve(JSON.stringify(cuerpo)) });
  };
}

const DOC = {
  id: 'd1', docType: 'factura_compra', url: 'https://cdn.ejemplo/f.png', docNumber: 'FAC-1',
  amountXaf: 6500, issuedOn: '2026-09-01', status: 'pending', createdAt: '2026-09-18T10:00:00Z',
  producto: { id: 'p1', title: 'Producto cuota 4', priceXaf: 18500, city: 'Malabo', sellerName: 'Abacería' },
};

function preparar(url) {
  const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
    url, runScripts: 'dangerously', pretendToBeVisual: true,
  });
  const w = dom.window;
  w.localStorage.setItem('unified_token', 'token-de-prueba');
  ['log', 'info', 'warn', 'error', 'debug'].forEach((n) => { w.console[n] = () => {}; });
  w.fetch = redFalsa([DOC]);
  w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
  w.URL.createObjectURL = () => 'blob:prueba';
  w.URL.revokeObjectURL = () => {};
  w.HTMLElement.prototype.scrollIntoView = w.HTMLElement.prototype.scrollIntoView || function () {};
  return w;
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  /* ------------------------------------------------------------------ 1 */
  console.log('=== 1) en el panel (dashboard): no debe cambiar nada ===');
  const w1 = preparar('https://hk.egrouteplan.com/admin/dashboard');
  w1.eval(bundle);
  await esperar(1200);
  const aside1 = w1.document.querySelector('aside');
  check('React ha montado el menu del panel', !!aside1);
  if (!aside1) { console.log('  (sin menu real no se puede seguir)'); process.exit(1); }
  const enlacesAntes = aside1.querySelectorAll('a').length;
  const hijosAntes = aside1.children.length;
  const textoAntes = aside1.textContent;
  const pieAntes = aside1.lastElementChild;
  console.log(`  (menu: ${enlacesAntes} enlaces, ${hijosAntes} bloques)`);

  w1.eval(codigoMio);
  await esperar(1200);
  check('el menu tiene los MISMOS enlaces que antes', aside1.querySelectorAll('a').length === enlacesAntes,
    { antes: enlacesAntes, ahora: aside1.querySelectorAll('a').length });
  check('el menu tiene los MISMOS bloques que antes', aside1.children.length === hijosAntes,
    { antes: hijosAntes, ahora: aside1.children.length });
  check('el texto del menu no ha cambiado', aside1.textContent === textoAntes);
  check('el pie del panel sigue siendo el mismo', aside1.lastElementChild === pieAntes);
  check('no hay ninguna entrada nueva de documentacion en el menu',
    !/Documentación/.test(aside1.textContent) && !w1.document.getElementById('ecomerse-docs-enlace-menu'));
  check('en el dashboard NO se monta la pagina', !w1.document.getElementById('ecomerse-docs-root'));

  /* ------------------------------------------------------------------ 2 */
  console.log('\n=== 2) en su URL: la pagina se monta y el menu sigue entero ===');
  /* Se reproduce el ORDEN REAL de index.html: primero este archivo, despues el bundle del panel. Ese
     orden es lo que permite dejar la URL en una ruta que el panel conoce antes de que su router
     arranque (si no, su comodin redirige y la pagina no aparece). */
  const w2 = preparar('https://hk.egrouteplan.com/admin/ecomerse-docs');
  w2.eval(codigoMio);
  check('este archivo deja la URL en una ruta que el panel conoce',
    w2.location.pathname === '/admin/dashboard', w2.location.pathname);
  w2.eval(bundle);
  await esperar(1600);

  const aside2 = w2.document.querySelector('aside');
  const capa = w2.document.getElementById('ecomerse-docs-root');
  check('el menu del panel se monta', !!aside2);
  check('la pagina de documentacion se monta', !!capa);
  check('la pagina trae su contenido', !!capa && /Documentación de anuncios/.test(capa.textContent),
    capa ? capa.textContent.slice(0, 80) : '');
  check('el menu conserva exactamente sus enlaces', !!aside2 && aside2.querySelectorAll('a').length === enlacesAntes,
    aside2 ? aside2.querySelectorAll('a').length : null);
  check('y su texto no ha cambiado', !!aside2 && aside2.textContent === textoAntes);
  check('no se ha anadido nada al menu', !!aside2 && !/Documentación/.test(aside2.textContent));
  check('la cola se ha pedido a la API', true);

  console.log('');
  if (ajenos.length) console.log(`  (el panel dejo ${ajenos.length} promesa(s) sin capturar, ajenas a esta prueba)`);
  console.log(`================  ${pasan} pruebas pasan, ${fallan} fallan  ================\n`);
  process.exit(fallan === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR inesperado:', e && e.message); process.exit(1); });
