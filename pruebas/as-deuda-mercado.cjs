// AS-18 · Deuda de diseno del modulo del Mercado, segun la base de la guardia.
// Uso: node pruebas\as-deuda-mercado.cjs
'use strict';
const fs = require('fs');
const b = JSON.parse(fs.readFileSync('D:\\egapp\\.diseno-baseline.json', 'utf8'));
const total = b.total;
const porArchivo = b.porArchivo || b.porFichero || {};

console.log('=== DEUDA TOTAL DEL PROYECTO ===');
console.log(`hex: ${total.hex} · fontSize: ${total.fontSize} · borderRadius: ${total.borderRadius}`);
console.log('');

const claves = Object.keys(porArchivo).filter((k) => /ecomerse|mercado/i.test(k));
console.log('=== FICHEROS DEL MERCADO EN LA BASE ===');
let suma = { hex: 0, fontSize: 0, borderRadius: 0 };
for (const k of claves.sort()) {
  const v = porArchivo[k];
  console.log(`${k.padEnd(38)} hex ${String(v.hex).padStart(3)} · fontSize ${String(v.fontSize).padStart(3)} · borderRadius ${String(v.borderRadius).padStart(3)}`);
  suma.hex += v.hex; suma.fontSize += v.fontSize; suma.borderRadius += v.borderRadius;
}
console.log('');
console.log(`SUMA del Mercado: hex ${suma.hex} · fontSize ${suma.fontSize} · borderRadius ${suma.borderRadius}`);
const pct = (a, t) => t ? ((a / t) * 100).toFixed(1) + '%' : '—';
console.log(`Cuota del total:  hex ${pct(suma.hex, total.hex)} · fontSize ${pct(suma.fontSize, total.fontSize)} · borderRadius ${pct(suma.borderRadius, total.borderRadius)}`);
console.log('');

// Ranking: los 12 ficheros con mas deuda de fontSize
const orden = Object.entries(porArchivo).sort((a, b2) => b2[1].fontSize - a[1].fontSize).slice(0, 12);
console.log('=== LOS 12 FICHEROS CON MAS fontSize CRUDO ===');
for (const [k, v] of orden) console.log(`  ${String(v.fontSize).padStart(4)}  ${k}`);
