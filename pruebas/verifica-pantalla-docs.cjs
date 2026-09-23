/* =============================================================================
   Prueba de la PANTALLA de moderacion de documentacion, con un DOM de verdad (jsdom).

   Por que existe: comprobar la API con curl demuestra que los datos llegan, pero NO que la pantalla
   se dibuje. Aqui se carga el archivo tal cual se sirve en /admin/assets/ecomerse-docs.js dentro de
   un DOM real, se falsean las respuestas de red, y se comprueba:
     - que se dibuja la cola con los datos que da la API;
     - que "Rechazar" SIN motivo no llama a la API (la promesa al vendedor);
     - que "Aprobar" llama al endpoint correcto con el cuerpo correcto;
     - que al salir de la ruta la capa se desmonta y el panel queda limpio;
     - que sin sesion no inventa una lista vacia enganosa, sino que lo dice.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const RUTA = process.argv[2] || 'D:\\egapp\\.auditoria-servicios\\web-admin\\ecomerse-docs.js';
const codigo = fs.readFileSync(RUTA, 'utf8');

let pasan = 0, fallan = 0;
function check(nombre, cond, detalle) {
  if (cond) { pasan++; console.log(`  PASA  ${nombre}`); }
  else { fallan++; console.log(`  FALLA ${nombre}${detalle !== undefined ? '  -> ' + JSON.stringify(detalle) : ''}`); }
}

// --- datos de mentira, con la misma forma que devuelve la API real ---
const DOC = {
  id: '61663cfe-fe6c-4529-a137-26f592127fca',
  docType: 'factura_compra',
  url: 'https://cdn.ejemplo/factura.png',
  docNumber: 'FAC-2026-0918',
  amountXaf: 6500,
  issuedOn: '2026-09-01',
  status: 'pending',
  createdAt: '2026-09-18T10:00:00.000Z',
  rejectionReason: null,
  producto: { id: 'p1', title: 'Producto cuota 4', priceXaf: 18500, city: 'Malabo', sellerName: 'Abacería E2E v3' },
};

function montar(opciones = {}) {
  /* El menu se imita con la MISMA estructura del panel: un <aside> flex-col con una <nav>
     scrollable y un pie (usuario + «Cerrar sesion»). Asi se puede comprobar que el enlace entra
     entre los dos y que no se superpone al pie. */
  const menu =
    '<aside class="w-64 bg-[#0B1220] text-white flex flex-col h-screen sticky top-0">' +
    '<div class="p-6 border-b border-white/10"><h1>EG Route Plan</h1></div>' +
    '<nav class="flex-1 overflow-y-auto py-3 px-3 space-y-4">' +
    '<div><p class="px-3">Modulos</p><div class="space-y-0.5">' +
    '<a href="/admin/ecomerse-admin" data-item="tienda">Tienda</a></div></div></nav>' +
    '<div class="p-4 border-t border-white/10" data-pie="1">' +
    '<button>Cerrar sesion</button></div></aside>';

  const dom = new JSDOM(
    '<!doctype html><html><head></head><body><div id="root"><div>panel</div></div>' + menu + '</body></html>',
    {
      url: opciones.url || 'https://hk.egrouteplan.com/admin/ecomerse-docs',
      runScripts: 'outside-only',
      pretendToBeVisual: true,
    });
  const { window } = dom;
  if (opciones.sinToken) window.localStorage.clear();
  else window.localStorage.setItem('unified_token', 'token-de-prueba');

  const llamadas = [];
  window.fetch = (url, init) => {
    llamadas.push({ url, method: (init && init.method) || 'GET', body: init && init.body });
    let cuerpo = [];
    if (/stats/.test(url)) cuerpo = { pending: 1, approved: 0, rejected: 0, total: 1 };
    else if (/status=pending/.test(url)) cuerpo = [DOC];
    else if (/status=approved/.test(url)) cuerpo = [];
    else if (/status=rejected/.test(url)) cuerpo = [];
    return Promise.resolve({
      ok: true, status: 200,
      json: () => Promise.resolve(cuerpo),
      text: () => Promise.resolve(JSON.stringify(cuerpo)),
    });
  };
  window.eval(codigo);
  return { dom, window, llamadas };
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // ------------------------------------------------------------------ 1
  console.log('=== 1) la pantalla se dibuja con los datos de la API ===');
  const a = montar();
  await esperar(700);   // deja correr el sondeo que espera a que el panel monte
  const raiz = a.window.document.getElementById('ecomerse-docs-root');
  check('crea su capa (ecomerse-docs-root)', !!raiz);
  const texto = raiz ? raiz.textContent : '';
  check('titula la pantalla', /Documentación de anuncios/.test(texto), texto.slice(0, 80));
  check('pide la cola a la API real', a.llamadas.some((l) => /\/admin\/docs\?status=pending/.test(l.url)), a.llamadas.map((l) => l.url));
  check('pide tambien los contadores', a.llamadas.some((l) => /\/admin\/docs\/stats/.test(l.url)), a.llamadas.map((l) => l.url));
  check('pinta el numero de factura', texto.includes('FAC-2026-0918'));
  check('pinta el importe en XAF', texto.includes('6.500 XAF'), texto.match(/[\d.]+ XAF/g));
  check('pinta el anuncio al que pertenece', texto.includes('Producto cuota 4'));
  check('pinta la tienda', texto.includes('Abacería E2E v3'));
  check('pinta el tipo de documento en castellano', texto.includes('Factura de compra'));
  check('muestra las tarjetas de resumen', /Pendientes/.test(texto) && /Aprobados/.test(texto) && /Rechazados/.test(texto));
  check('muestra los filtros con sus cuentas', /Pendientes \(1\)/.test(texto), texto.match(/Pendientes \(\d+\)/g));
  check('ofrece ver el documento', /Ver documento/.test(texto));
  check('ofrece aprobar y rechazar', /Aprobar/.test(texto) && /Rechazar/.test(texto));
  check('avisa de que un rechazo exige motivo', /Un rechazo exige motivo/.test(texto));

  // ------------------------------------------------------------------ 2
  console.log('\n=== 2) "Rechazar" sin motivo NO llama a la API ===');
  const botones = [...a.window.document.querySelectorAll('button')];
  const btnRechazar = botones.find((b) => /Rechazar…/.test(b.textContent));
  check('el boton de rechazar existe', !!btnRechazar);
  btnRechazar.dispatchEvent(new a.window.Event('click'));
  await esperar(60);
  const modal = [...a.window.document.querySelectorAll('textarea')];
  check('abre el cuadro de motivo', modal.length === 1);
  const botonConfirmar = [...a.window.document.querySelectorAll('button')].find((b) => /Rechazar \(el vendedor lo ver/.test(b.textContent));
  check('el cuadro tiene boton de confirmar', !!botonConfirmar);
  const antes = a.llamadas.length;
  botonConfirmar.dispatchEvent(new a.window.Event('click'));
  await esperar(120);
  check('sin escribir motivo no se manda ninguna decision', a.llamadas.length === antes, a.llamadas.slice(antes));
  check('y el cuadro sigue abierto para poder escribirlo', a.window.document.querySelectorAll('textarea').length === 1);

  // ------------------------------------------------------------------ 3
  console.log('\n=== 3) con motivo, la decision va al endpoint correcto ===');
  const ta = a.window.document.querySelector('textarea');
  ta.value = 'La factura no coincide con el importe del anuncio.';
  ta.dispatchEvent(new a.window.Event('input'));
  [...a.window.document.querySelectorAll('button')].find((b) => /Rechazar \(el vendedor lo ver/.test(b.textContent))
    .dispatchEvent(new a.window.Event('click'));
  await esperar(200);
  const envio = a.llamadas.find((l) => l.method === 'PUT');
  check('hace un PUT a /admin/docs/<id>', !!envio && envio.url.endsWith('/admin/docs/' + DOC.id), envio && envio.url);
  check('manda approve:false', !!envio && JSON.parse(envio.body).approve === false, envio && envio.body);
  check('manda el motivo escrito', !!envio && JSON.parse(envio.body).reason === 'La factura no coincide con el importe del anuncio.', envio && envio.body);

  // ------------------------------------------------------------------ 4
  console.log('\n=== 4) "Aprobar" llama con approve:true ===');
  const b = montar();
  await esperar(700);
  const btnAprobar = [...b.window.document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Aprobar');
  check('el boton de aprobar existe en la fila', !!btnAprobar);
  btnAprobar.dispatchEvent(new b.window.Event('click'));
  await esperar(200);
  const envioOk = b.llamadas.find((l) => l.method === 'PUT');
  check('hace PUT con approve:true', !!envioOk && JSON.parse(envioOk.body).approve === true, envioOk && envioOk.body);

  // ------------------------------------------------------------------ 5
  console.log('\n=== 5) al salir de la ruta se desmonta ===');
  const c = montar();
  await esperar(700);
  check('esta montada en su ruta', !!c.window.document.getElementById('ecomerse-docs-root'));
  c.window.history.pushState({}, '', '/admin/ecomerse-admin');
  await esperar(600);   // el sondeo de 250 ms detecta el cambio
  check('al ir a Tienda, la capa desaparece', !c.window.document.getElementById('ecomerse-docs-root'));
  c.window.history.pushState({}, '', '/admin/ecomerse-docs');
  await esperar(600);
  check('y al volver, se vuelve a montar', !!c.window.document.getElementById('ecomerse-docs-root'));

  // ------------------------------------------------------------------ 6
  console.log('\n=== 6) sin sesion no miente con una lista vacia ===');
  const d = montar({ sinToken: true });
  await esperar(700);
  const txtD = (d.window.document.getElementById('ecomerse-docs-root') || { textContent: '' }).textContent;
  check('avisa de que falta la sesion de administrador', /sesión de administrador/.test(txtD), txtD.slice(0, 120));
  check('no dice "nada pendiente" (seria enganoso)', !/Nada pendiente/.test(txtD));
  check('no intenta pedir la cola sin token', !d.llamadas.some((l) => /admin\/docs/.test(l.url)), d.llamadas);

  // ------------------------------------------------------------------ 7
  console.log('\n=== 7) en otra ruta no se monta nada ===');
  const e = montar({ url: 'https://hk.egrouteplan.com/admin/dashboard' });
  await esperar(700);
  check('no aparece la capa en /admin/dashboard', !e.window.document.getElementById('ecomerse-docs-root'));
  check('y no llama a la API', e.llamadas.length === 0, e.llamadas);

  // ------------------------------------------------------------------ 8
  console.log('\n=== 8) no toca el menu del panel (es una pagina, no una entrada de menu) ===');
  const f = montar({ url: 'https://hk.egrouteplan.com/admin/dashboard' });
  await esperar(900);
  const doc = f.window.document;
  const aside = doc.querySelector('aside');
  check('el menu del panel sigue entero', !!aside && doc.querySelectorAll('aside a').length === 1,
    aside ? doc.querySelectorAll('aside a').length : null);
  check('no se ha anadido nada al menu', !doc.getElementById('ecomerse-docs-enlace-menu'));
  check('no se ha metido ningun elemento nuevo en el aside', !!aside && aside.children.length === 3,
    aside ? aside.children.length : null);

  console.log(`\n================  ${pasan} pruebas pasan, ${fallan} fallan  ================\n`);
  process.exit(fallan === 0 ? 0 : 1);
})().catch((e) => { console.error('ERROR inesperado:', e); process.exit(1); });
