/**
 * Fase 2 · 14 (punto D) — BARRIDO DE ESCALAS, tanda 1: solo los valores que COINCIDEN con la escala.
 *
 * POR QUÉ ASÍ: `escalas.ts` declara `tipografia` (11/12/14/16/20/28), `radios` (8/12/16/999) y
 * `espaciado` (4/8/12/16/24/32), pero **la app no las usaba**: 2.960 `fontSize` y 1.250
 * `borderRadius` escritos a mano.
 *
 * Esta primera tanda sustituye **solo los valores que valen exactamente lo mismo** que el token:
 *
 *   fontSize 11 → tipografia.micro      borderRadius  8 → radios.sm
 *   fontSize 12 → tipografia.caption    borderRadius 12 → radios.md
 *   fontSize 14 → tipografia.body       borderRadius 16 → radios.lg
 *   fontSize 16 → tipografia.subtitle   borderRadius 999 → radios.full
 *   fontSize 20 → tipografia.title
 *   fontSize 28 → tipografia.display
 *
 * O sea: **cero cambio visual** y la deuda baja de golpe. Los fraccionarios (11,5 · 12,5 · 13,5) y el
 * `13` **no se tocan aquí a propósito**: llevarlos a la escala mueve píxeles (13 → 14), y eso se hace
 * por pantallas y mirándolo. Mezclarlo ahora sería esconder un cambio visible dentro de un barrido
 * que parece inocuo.
 *
 * No toca `packages/ui-kit` (ahí vive la escala, y la guardia lo excluye).
 *
 * Uso: node pruebas/fase2-escalas-tanda1.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const ZONAS = ['app', 'components', 'core', 'utils'];

const TIPOGRAFIA = { 11: 'micro', 12: 'caption', 14: 'body', 16: 'subtitle', 20: 'title', 28: 'display' };
const RADIOS = { 8: 'sm', 12: 'md', 16: 'lg', 999: 'full' };

function archivos(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|respaldo|\.expo/.test(p)) archivos(p, acc); }
    else if (/\.(tsx|ts)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

let tocados = 0;
let nFont = 0;
let nRadio = 0;

for (const zona of ZONAS) {
  const dir = path.join(APP, zona);
  if (!fs.existsSync(dir)) continue;
  for (const f of archivos(dir)) {
    let t = fs.readFileSync(f, 'utf8');
    const antes = t;

    t = t.replace(/fontSize:\s*(\d+(?:\.\d+)?)/g, (m, v) =>
      TIPOGRAFIA[v] ? `fontSize: tipografia.${TIPOGRAFIA[v]}` : m);
    t = t.replace(/borderRadius:\s*(\d+(?:\.\d+)?)/g, (m, v) =>
      RADIOS[v] ? `borderRadius: radios.${RADIOS[v]}` : m);

    if (t === antes) continue;

    // Contar lo sustituido
    const cF = (antes.match(/fontSize:\s*(\d+(?:\.\d+)?)/g) || []).filter((s) => TIPOGRAFIA[s.split(/:\s*/)[1]]).length;
    const cR = (antes.match(/borderRadius:\s*(\d+(?:\.\d+)?)/g) || []).filter((s) => RADIOS[s.split(/:\s*/)[1]]).length;
    nFont += cF; nRadio += cR;

    // Import de lo que se ha usado
    const necesita = [];
    if (/tipografia\./.test(t)) necesita.push('tipografia');
    if (/radios\./.test(t)) necesita.push('radios');
    if (necesita.length) {
      const m = t.match(/import \{([^}]*)\} from '@egrouteplan\/ui-kit';/);
      if (m) {
        const nombres = m[1].split(',').map((x) => x.trim()).filter(Boolean);
        for (const n of necesita) if (!nombres.includes(n)) nombres.push(n);
        t = t.replace(m[0], `import { ${nombres.join(', ')} } from '@egrouteplan/ui-kit';`);
      } else {
        // Sin import del kit: se añade tras el primer import del archivo
        t = t.replace(/^(import[^\n]*\n)/m, `$1import { ${necesita.join(', ')} } from '@egrouteplan/ui-kit';\n`);
      }
    }

    fs.writeFileSync(f, t, 'utf8');
    tocados++;
  }
}

console.log(`Archivos tocados: ${tocados}`);
console.log(`  fontSize → tipografia:   ${nFont}`);
console.log(`  borderRadius → radios:   ${nRadio}`);
console.log('\nTanda 1 de escalas aplicada (solo valores idénticos: sin cambio visual)');
