/**
 * Mueve el bloque de Sheet/Aviso DENTRO del View raíz de billing-status.
 * Uso: node pruebas/fase2-coloca-billing2.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/billing-status.tsx');
let t = fs.readFileSync(p, 'utf8');

const inicio = t.indexOf('      {/* Confirmación en HOJA (antes: modal del sistema) */}');
if (inicio < 0) { console.log('  no encuentro el bloque'); process.exit(1); }
const marcaFin = '      ) : null}';
const fin = t.indexOf(marcaFin, inicio);
const finReal = t.indexOf('\n', fin) + 1;
const BLOQUE = t.slice(inicio, finReal);
t = t.slice(0, inicio) + t.slice(finReal);

// el cierre del View raíz que había JUSTO antes del bloque
const raiz = t.lastIndexOf('    </View>\n', inicio);
if (raiz < 0) { console.log('  no encuentro el cierre del View raíz'); process.exit(1); }
t = t.slice(0, raiz) + BLOQUE + t.slice(raiz);
fs.writeFileSync(p, t, 'utf8');
console.log('  bloque movido dentro del View raíz');
