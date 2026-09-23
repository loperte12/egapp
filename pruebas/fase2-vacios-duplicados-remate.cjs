/**
 * Remate de la migración de los vacíos duplicados: imports y estilos muertos.
 * (`food.tsx` y `ecomerse.tsx` definían su propio `EmptyState`, así que no lo importaban.)
 * Uso: node pruebas/fase2-vacios-duplicados-remate.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
let fallos = 0;

const casos = [
  { archivo: 'app/food.tsx', borrarSEmptyCompleto: true },
  { archivo: 'app/ecomerse.tsx', borrarSEmptyCompleto: false },
];

for (const c of casos) {
  const p = path.join(APP, c.archivo);
  let t = fs.readFileSync(p, 'utf8');

  // 1) Import del kit: añadir EmptyState si no está
  if (!/\bEmptyState\b[^}]*\} from '@egrouteplan\/ui-kit'/.test(t)) {
    const m = t.match(/import \{([^}]*)\} from '@egrouteplan\/ui-kit';/);
    if (!m) { console.log(`  SIN ANCLA: import del kit en ${c.archivo}`); fallos++; continue; }
    const nombres = m[1].split(',').map((x) => x.trim()).filter(Boolean);
    if (!nombres.includes('EmptyState')) nombres.push('EmptyState');
    t = t.replace(m[0], `import { ${nombres.join(', ')} } from '@egrouteplan/ui-kit';`);
    console.log(`  OK import en ${c.archivo}`);
  }

  // 2) Estilos del vacío viejo
  const iS = t.indexOf('const s_empty = StyleSheet.create({');
  if (iS > 0) {
    const fin = t.indexOf('});', iS) + 3;
    if (c.borrarSEmptyCompleto && !/\bs_empty\./.test(t)) {
      t = t.slice(0, iS) + t.slice(fin);
      console.log(`  OK s_empty retirado entero en ${c.archivo}`);
    } else if (!/\bs_empty\.btnGhost\b/.test(t)) {
      let bloque = t.slice(iS, fin);
      const re = /\n\s*btnGhost: \{[^}]*\},/;
      if (re.test(bloque)) {
        bloque = bloque.replace(re, '');
        t = t.slice(0, iS) + bloque + t.slice(fin);
        console.log(`  OK s_empty.btnGhost retirado en ${c.archivo} (btnPrimary sigue: lo usa la rama de error)`);
      }
    }
  }

  fs.writeFileSync(p, t, 'utf8');
}

console.log(fallos ? `\n${fallos} problema(s)` : '\nRemate hecho');
process.exit(fallos ? 1 : 0);
