/**
 * Corrección del arreglo anterior: la renumeración se encadenó (13.8→13.7, y luego 13.7→13.6
 * renombró también el que acababa de quedar 13.7), así que los cuatro epígrafes quedaron en 13.4.
 * Aquí se numeran POR ORDEN DE APARICIÓN, que es lo que no se puede equivocar.
 * Uso: node pruebas/informe-renumera-13-fix.cjs
 */
const fs = require('fs');
const path = require('path');
const p = path.resolve(__dirname, '../design-audit-report.md');
let t = fs.readFileSync(p, 'utf8');

const titulos = t.split('\n').filter((l) => /^### 13\.4 /.test(l));
if (titulos.length < 4) { console.log(`Solo ${titulos.length} epígrafes «### 13.4»: nada que renumerar`); process.exit(0); }

let n = 4;
t = t
  .split('\n')
  .map((l) => {
    if (/^### 13\.4 /.test(l)) { const nuevo = l.replace('### 13.4 ', `### 13.${n} `); n++; return nuevo; }
    return l;
  })
  .join('\n');

fs.writeFileSync(p, t, 'utf8');

console.log('Numeración de §13:');
for (const l of t.split('\n').filter((x) => /^### 13\./.test(x) || /^## 13\./.test(x))) console.log('  ' + l);
console.log('\nReferencias cruzadas:');
for (const m of t.match(/§13\.\d/g) || []) console.log('  ' + m);
