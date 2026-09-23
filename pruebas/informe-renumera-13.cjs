/**
 * Arreglo de numeración del informe: al reorganizar §13 quedó un hueco (§13.4 no existía).
 * Se renumeran los epígrafes y su referencia cruzada, en orden inverso para no pisarse.
 * Uso: node pruebas/informe-renumera-13.cjs
 */
const fs = require('fs');
const path = require('path');
const p = path.resolve(__dirname, '../design-audit-report.md');
let t = fs.readFileSync(p, 'utf8');
const antes = t;

for (const [viejo, nuevo] of [['13.8', '13.7'], ['13.7', '13.6'], ['13.6', '13.5'], ['13.5', '13.4']]) {
  t = t.split(`### ${viejo}`).join(`### ${nuevo}`);
  t = t.split(`§${viejo}`).join(`§${nuevo}`);
}

if (t === antes) { console.log('SIN CAMBIOS: ¿ya estaba renumerado?'); process.exit(0); }
fs.writeFileSync(p, t, 'utf8');
const titulos = t.split('\n').filter((l) => /^### 13\./.test(l) || /^## 13\./.test(l));
console.log('Numeración de §13 tras el arreglo:');
for (const l of titulos) console.log('  ' + l);
