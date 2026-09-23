/**
 * Coloca el bloque de Sheet/Aviso en el COMPONENTE PRINCIPAL de billing-status.
 *   · El primer `}` a columna 0 después de la declaración es el cierre del componente.
 *   · Los componentes auxiliares (SkeletonHeader, tarjetas…) están después y no se tocan.
 * Uso: node pruebas/fase2-coloca-billing.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/billing-status.tsx');
let t = fs.readFileSync(p, 'utf8');

// 1) quitar el bloque mal colocado
const inicio = t.indexOf('      {/* Confirmación en HOJA (antes: modal del sistema) */}');
if (inicio < 0) { console.log('  no encuentro el bloque mal colocado'); process.exit(1); }
const marcaFin = '      ) : null}';
const fin = t.indexOf(marcaFin, inicio);
if (fin < 0) { console.log('  no encuentro el final del bloque'); process.exit(1); }
const finReal = t.indexOf('\n', fin) + 1;
const BLOQUE = t.slice(inicio, finReal);
t = t.slice(0, inicio) + t.slice(finReal);
console.log('  bloque mal colocado retirado');

// 2) el cierre del componente principal
const firma = /export default function[^{]*\{/.exec(t);
if (!firma) { console.log('  no encuentro el componente principal'); process.exit(1); }
const desde = firma.index + firma[0].length;
const cierre = t.indexOf('\n}', desde);
if (cierre < 0) { console.log('  no encuentro el cierre del componente'); process.exit(1); }
const paren = t.lastIndexOf('\n  );', cierre);
if (paren < desde) { console.log('  no encuentro el `);` de cierre'); process.exit(1); }

// 3) insertar antes de ese cierre
t = t.slice(0, paren) + '\n' + BLOQUE + t.slice(paren);
fs.writeFileSync(p, t, 'utf8');
console.log('  bloque colocado dentro del componente principal');
