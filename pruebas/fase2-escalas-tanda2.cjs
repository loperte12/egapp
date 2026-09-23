/**
 * Fase 2 · 14 (punto D) — BARRIDO DE ESCALAS, tanda 2: los valores que SÍ mueven píxeles.
 *
 * La tanda 1 llevó a la escala solo los valores idénticos (cero cambio visual, medido). Esta lleva
 * los que estaban ENTRE dos pasos de la escala, con una política escrita y contada:
 *
 *     11,5 → tipografia.caption (12)     +0,5
 *     12,5 → tipografia.caption (12)     −0,5
 *     13   → tipografia.body    (14)     +1      ← el propio `escalas.ts` dice que el cuerpo de la
 *                                                  app es 14 y que «antes vivía entre 11 y 13 px»
 *     13,5 → tipografia.body    (14)     +0,5
 *
 * POLÍTICA: se redondea al paso más cercano y, en empate, HACIA ARRIBA (texto algo mayor antes que
 * menor: la Fase 1 subió suelos de lectura a propósito). 11,5 empata y sube a 12; 12,5 está más
 * cerca de 12; 13 empata y sube a 14.
 *
 * LO QUE NO SE TOCA, y por qué: el resto de valores del archivo (9, 10, 14,5, 15, 17, 22…) están a
 * más de 1 px de cualquier paso. Llevarlos a la escala sería un rediseño de tamaños, no un barrido:
 * esos van **por pantallas, mirándolos**, y algunos (emojis de 34-40) son excepciones legítimas.
 *
 * El script cuenta cuántos toca de cada valor y **en qué archivos**, para que el dueño sepa dónde
 * mirar en vez de tener que buscar.
 *
 * Uso: node pruebas/fase2-escalas-tanda2.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const ZONAS = ['app', 'components', 'core', 'utils'];

/** valor literal → token de la escala, con el delta que supone. */
const MAPA = [
  ['11.5', 'caption', '+0,5'],
  ['12.5', 'caption', '−0,5'],
  ['13', 'body', '+1'],
  ['13.5', 'body', '+0,5'],
];

function archivos(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|respaldo|\.expo/.test(p)) archivos(p, acc); }
    else if (/\.(tsx|ts)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

const conteo = new Map();      // valor → cuántos
const porArchivo = new Map();  // archivo → cuántos
let tocados = 0;

for (const zona of ZONAS) {
  const dir = path.join(APP, zona);
  if (!fs.existsSync(dir)) continue;
  for (const f of archivos(dir)) {
    let t = fs.readFileSync(f, 'utf8');
    const antes = t;
    let n = 0;

    for (const [literal, token, delta] of MAPA) {
      // `13` exacto, sin confundirlo con 13.5 ni con 130
      const re = new RegExp(`fontSize:\\s*${literal.replace('.', '\\.')}(?!\\d)`, 'g');
      const encontrados = (t.match(re) || []).length;
      if (encontrados) {
        t = t.replace(re, `fontSize: tipografia.${token}`);
        conteo.set(`${literal} → ${token} (${delta})`, (conteo.get(`${literal} → ${token} (${delta})`) || 0) + encontrados);
        n += encontrados;
      }
    }
    if (t === antes) continue;

    const m = t.match(/import \{([^}]*)\} from '@egrouteplan\/ui-kit';/);
    if (m && !/tipografia/.test(m[1])) {
      t = t.replace(m[0], `import { ${m[1].trim()}, tipografia } from '@egrouteplan/ui-kit';`);
    } else if (!m) {
      t = t.replace(/^(import[^\n]*\n)/m, `$1import { tipografia } from '@egrouteplan/ui-kit';\n`);
    }

    fs.writeFileSync(f, t, 'utf8');
    porArchivo.set(path.relative(APP, f).replace(/\\/g, '/'), n);
    tocados++;
  }
}

console.log(`Archivos tocados: ${tocados}\n`);
let total = 0;
for (const [k, v] of [...conteo.entries()].sort((a, b) => b[1] - a[1])) { console.log(`  ${k}: ${v}`); total += v; }
console.log(`\nTotal de textos que cambian de tamaño: ${total}`);

const top = [...porArchivo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log('\nDónde mirar primero (archivos con más cambios):');
for (const [f, n] of top) console.log(`  ${n.toString().padStart(3)}  ${f}`);
