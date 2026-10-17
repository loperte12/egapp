/**
 * Nodos de una banda vertical del volcado (para medir piezas sin texto: avatares, círculos, pastillas).
 *
 * Uso: node pruebas/leer-ui-banda.mjs _tao.xml 135 190
 * Densidad 3 px/dp (este teléfono: override 480).
 */
import { readFileSync } from 'node:fs';

const [fichero = '_tao.xml', y1 = '0', y2 = '9999'] = process.argv.slice(2);
const desde = Number(y1);
const hasta = Number(y2);
const DENSIDAD = 3;

const xml = readFileSync(fichero, 'utf8');
const attr = (s, k) => {
  const r = new RegExp(`${k}="([^"]*)"`).exec(s);
  return r ? r[1] : '';
};
const re = /<node\b([^>]*?)\/?>/g;
let m;
let n = 0;
while ((m = re.exec(xml))) {
  const s = m[1];
  const clase = attr(s, 'class').split('.').pop();
  const texto = attr(s, 'text') || attr(s, 'content-desc');
  const g = /\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]/.exec(attr(s, 'bounds'));
  if (!g) continue;
  const [x1, yy1, x2, yy2] = g.slice(1).map(Number);
  const dpY = yy1 / DENSIDAD;
  if (dpY < desde || dpY > hasta) continue;
  n += 1;
  const dp = (v) => +(v / DENSIDAD).toFixed(1);
  console.log(
    `${String(dp(yy1)).padStart(7)}dp y ${String(dp(x1)).padStart(6)}dp x ${String(dp(x2 - x1)).padStart(6)}×${String(dp(yy2 - yy1)).padStart(5)}  ${clase.padEnd(14)} ${texto ? JSON.stringify(texto).slice(0, 60) : ''}`,
  );
}
console.log(`(${n} nodos en la banda ${desde}..${hasta} dp)`);
