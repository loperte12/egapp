/* Sonda: de donde sale exactamente cada importe que pinta la pantalla. */
'use strict';
const fs = require('fs');
const { JSDOM } = require('jsdom');
const codigo = fs.readFileSync('D:\\egapp\\.auditoria-servicios\\web-admin\\ecomerse-docs.js', 'utf8');

const DOC = {
  id: 'd1', docType: 'factura_compra', url: 'https://x/f.png', docNumber: 'FAC-1',
  amountXaf: 6500, issuedOn: '2026-09-01', status: 'pending', createdAt: '2026-09-18T10:00:00Z',
  rejectionReason: null,
  producto: { id: 'p1', title: 'Producto cuota 4', priceXaf: 18500, city: 'Malabo', sellerName: 'Abaceria' },
};

const dom = new JSDOM('<!doctype html><html><body><div id="root"><div>p</div></div></body></html>',
  { url: 'https://h/admin/ecomerse-docs', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window;
w.localStorage.setItem('unified_token', 't');
w.fetch = (u) => {
  const c = /stats/.test(u) ? { pending: 1, approved: 0, rejected: 0, total: 1 } : [DOC];
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(c), text: () => Promise.resolve(JSON.stringify(c)) });
};
w.eval(codigo);

setTimeout(() => {
  const t = w.document.getElementById('ecomerse-docs-root').textContent;
  console.log('--- apariciones de XAF con 40 caracteres antes ---');
  const re = /.{40}XAF/g; let m;
  while ((m = re.exec(t)) !== null) console.log('  [' + m[0].replace(/\s+/g, ' ') + ']');
  console.log('--- lineas que contienen XAF ---');
  t.split('\n').forEach((l) => { if (/XAF/.test(l)) console.log('  <' + l.replace(/\s+/g, ' ') + '>'); });
  console.log('--- formato en este entorno ---');
  console.log('  (6500).toLocaleString("es")  =', (6500).toLocaleString('es'));
  console.log('  (18500).toLocaleString("es") =', (18500).toLocaleString('es'));
  console.log('  Number("6500").toLocaleString("es") =', Number('6500').toLocaleString('es'));
  console.log('  typeof DOC.amountXaf =', typeof DOC.amountXaf, JSON.stringify(DOC.amountXaf));
}, 900);
