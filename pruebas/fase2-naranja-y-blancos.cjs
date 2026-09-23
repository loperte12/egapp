/**
 * Fase 2 · El naranja de acción y los blancos escritos a mano.
 *
 *   1. `#FF6B35` (53 usos, 17 archivos) es un naranja que NO es el del kit: el oficial es
 *      `secondary #FF7D00`. Se unifica al token (D-05/D-27).
 *   2. `#FFFFFF` (538 usos) pasa a `brand.white`. Mismo valor exacto: **cero cambio visual**, pero
 *      deja de haber blanco escrito a mano y aparece en el recuento de la guardia de diseño.
 *
 * Lo que NO se hace aquí, a propósito: cambiar a azul los BOTONES que hoy son naranjas. Eso es una
 * decisión de jerarquía visual («azul avanza, naranja clasifica») que el dueño tiene que ver en
 * pantalla; queda propuesta en el informe con la lista de sitios.
 *
 * Uso: node pruebas/fase2-naranja-y-blancos.cjs
 */
const fs = require('fs');
const path = require('path');

const APP = path.resolve(__dirname, '..');
const ROOTS = ['app', 'components', 'core', 'api', 'state', 'utils', 'constants'];

function archivos(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (/node_modules|respaldo|packages[\\/]ui-kit/.test(p)) continue;
    if (e.isDirectory()) archivos(p, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

let naranjas = 0, blancos = 0, imports = 0;
const naranjaEn = new Set();

for (const root of ROOTS) {
  const dir = path.join(APP, root);
  if (!fs.existsSync(dir)) continue;
  for (const f of archivos(dir)) {
    if (path.basename(f) === 'colors.ts') continue;
    let txt = fs.readFileSync(f, 'utf8');
    let n = 0;

    const n1 = (txt.match(/(['"])#FF6B35\1/gi) || []).length;
    if (n1) { txt = txt.replace(/(['"])#FF6B35\1/gi, 'brand.secondary'); n += n1; naranjas += n1; naranjaEn.add(path.basename(f)); }

    const n2 = (txt.match(/(['"])#FFFFFF\1/gi) || []).length;
    if (n2) { txt = txt.replace(/(['"])#FFFFFF\1/gi, 'brand.white'); n += n2; blancos += n2; }

    if (!n) continue;

    // atributos JSX: color=brand.x -> color={brand.x}
    txt = txt.replace(/=\s*(brand\.[A-Za-z]+)(?=[\s/>])/g, '={$1}');

    if (!/import[\s\S]{0,500}?\bbrand\b[\s\S]{0,300}?from/.test(txt)) {
      const m = txt.match(/^import \{ ([^}]+) \} from '@egrouteplan\/ui-kit';/m);
      if (m) txt = txt.replace(m[0], `import { ${m[1]}, brand } from '@egrouteplan/ui-kit';`);
      else {
        const ms = [...txt.matchAll(/from\s+'[^']+';/g)];
        const last = ms[ms.length - 1];
        if (last) {
          const end = last.index + last[0].length;
          const eol = txt.indexOf('\n', end);
          const at = eol < 0 ? txt.length : eol;
          txt = txt.slice(0, at) + "\nimport { brand } from '@egrouteplan/ui-kit';" + txt.slice(at);
        }
      }
      imports++;
    }
    fs.writeFileSync(f, txt, 'utf8');
  }
}

console.log(`naranjas #FF6B35 unificados a brand.secondary: ${naranjas}  (en ${naranjaEn.size} archivos)`);
console.log(`blancos #FFFFFF pasados a brand.white:          ${blancos}`);
console.log(`imports de brand añadidos:                     ${imports}`);
