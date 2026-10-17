/**
 * Leer el volcado de uiautomator y sacar la ESTRUCTURA con números.
 *
 * Densidad de este teléfono: override 480 → **3 px por dp** (1080 px de ancho = 360 dp).
 * Así que cada coordenada del XML se divide por 3 para hablar en dp (que es lo que usa el contrato).
 *
 * Uso: node pruebas/leer-ui-tao.mjs _tao.xml [filtro]
 */
import { readFileSync } from 'node:fs';

const fichero = process.argv[2] ?? '_tao.xml';
const filtro = (process.argv[3] ?? '').toLowerCase();
const DENSIDAD = 3;

const xml = readFileSync(fichero, 'utf8');
const nodos = [];
const re = /<node\b([^>]*?)\/?>/g;
let m;
const attr = (s, k) => {
  const r = new RegExp(`${k}="([^"]*)"`).exec(s);
  return r ? r[1] : '';
};
while ((m = re.exec(xml))) {
  const s = m[1];
  const texto = attr(s, 'text') || attr(s, 'content-desc');
  const clase = attr(s, 'class').split('.').pop();
  const b = attr(s, 'bounds');
  const g = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(b);
  if (!g) continue;
  const [x1, y1, x2, y2] = g.slice(1).map(Number);
  nodos.push({
    texto, clase,
    x: x1, y: y1, w: x2 - x1, h: y2 - y1,
    dp: { x: +(x1 / DENSIDAD).toFixed(1), y: +(y1 / DENSIDAD).toFixed(1), w: +((x2 - x1) / DENSIDAD).toFixed(1), h: +((y2 - y1) / DENSIDAD).toFixed(1) },
  });
}

const conTexto = nodos.filter((n) => n.texto && (!filtro || n.texto.toLowerCase().includes(filtro)));

console.log(`nodos con texto: ${conTexto.length} de ${nodos.length}`);
console.log('');
for (const n of conTexto) {
  const centro = `${Math.round((n.x + n.w / 2))},${Math.round((n.y + n.h / 2))}`;
  console.log(`${String(n.dp.y).padStart(7)}dp  y  ${String(n.dp.x).padStart(6)}dp  x  ${String(n.dp.w).padStart(6)}×${String(n.dp.h).padStart(5)}  ${n.clase.padEnd(14)}  ${JSON.stringify(n.texto).slice(0, 90)}   [tap ${centro}]`);
}

// Y la estructura por bandas (para ver las regiones de la pantalla)
const bandas = new Map();
for (const n of conTexto) {
  const banda = Math.floor(n.dp.y / 60) * 60;
  bandas.set(banda, (bandas.get(banda) ?? 0) + 1);
}
console.log('');
console.log('bandas con texto (dp): ' + [...bandas.entries()].sort((a, b) => a[0] - b[0]).map(([b, c]) => `${b}:${c}`).join(' '));
