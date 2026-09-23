// AS-16 · Convierte un volcado de uiautomator en algo legible: textos, etiquetas
// accesibles, posiciones y TAMANOS (los bounds son la unica forma de medir sin ver).
// Uso: node pruebas\as-lee-pantalla.cjs <ruta-del-xml> [--solo-pulsables]
'use strict';
const fs = require('fs');

const ruta = process.argv[2];
const soloPulsables = process.argv.includes('--solo-pulsables');
if (!ruta || !fs.existsSync(ruta)) { console.error('Falta la ruta del XML'); process.exit(2); }
const xml = fs.readFileSync(ruta, 'utf8');

const nodos = [];
const re = /<node\b([^>]*?)\/?>/g;
let m;
while ((m = re.exec(xml)) !== null) {
  const at = m[1];
  const g = (k) => { const r = new RegExp(k + '="([^"]*)"').exec(at); return r ? r[1] : ''; };
  const bounds = g('bounds');
  const b = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(bounds);
  if (!b) continue;
  const [, x1, y1, x2, y2] = b.map(Number);
  const texto = g('text');
  const desc = g('content-desc');
  const clase = g('class').split('.').pop();
  nodos.push({
    texto, desc, clase,
    clickable: g('clickable') === 'true',
    scrollable: g('scrollable') === 'true',
    enabled: g('enabled') !== 'false',
    x1, y1, x2, y2, ancho: x2 - x1, alto: y2 - y1,
    cx: Math.round((x1 + x2) / 2), cy: Math.round((y1 + y2) / 2),
  });
}

const utiles = nodos.filter((n) => (n.texto || n.desc) && (soloPulsables ? n.clickable : true));
utiles.sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1);

console.log(`Nodos con texto o etiqueta: ${utiles.length} (de ${nodos.length} nodos en total)`);
console.log(`Pulsables: ${nodos.filter((n) => n.clickable).length}`);
console.log('');

// Agrupar en filas por posicion vertical (tolerancia 12 px)
const filas = [];
for (const n of utiles) {
  let f = filas.find((x) => Math.abs(x.cy - n.cy) <= 12);
  if (!f) { f = { cy: n.cy, items: [] }; filas.push(f); }
  f.items.push(n);
}
filas.sort((a, b) => a.cy - b.cy);

console.log('=== PANTALLA, EN FILAS (de arriba abajo) ===');
for (const f of filas) {
  f.items.sort((a, b) => a.x1 - b.x1);
  const desc = f.items.map((n) => {
    const t = n.desc ? `[a11y:${n.desc}]` : '';
    const txt = n.texto ? `"${n.texto}"` : '';
    const pos = n.clickable ? 'PULSABLE' : '';
    return `${txt}${t} <${pos} ${n.ancho}x${n.alto}px @${n.x1},${n.y1}>`;
  }).join('  |  ');
  console.log(`y=${String(f.cy).padStart(4)}  ${desc}`);
}

// Medir los pulsables mas pequenos (candidatos a fallo de area tactil)
const chicos = nodos.filter((n) => n.clickable && n.ancho > 0 && n.ancho < 44 && n.alto > 0 && n.alto < 44);
if (chicos.length) {
  console.log('');
  console.log(`=== PULSABLES POR DEBAJO DE 44x44 px (${chicos.length}) ===`);
  for (const n of chicos.slice(0, 25)) {
    console.log(`  ${n.ancho}x${n.alto}px  "${n.texto || n.desc}"  @${n.x1},${n.y1}`);
  }
}
