/**
 * Fase 2 · Colapsar las paletas paralelas (auditoría de diseño, D-25).
 *
 * QUÉ HABÍA: por cada significado, una familia entera de colores escritos a mano —
 * 11 verdes de «éxito», 9 rojos de «error», 16 ámbares de «aviso», 10 azules de «información».
 * Cuatro de los ámbares estaban a menos de 3° de matiz entre sí: indistinguibles en pantalla.
 * El kit declara UN token por significado, así que el 77 % de los colores semánticos eran
 * invenciones locales.
 *
 * QUÉ HACE: cada valor de esas familias se sustituye por el token oficial (`brand.*`). Los tokens
 * de marca son idénticos en tema claro y oscuro, así que el modo oscuro no cambia.
 * Los rojos «de corazón» (like) y los violetas sin rol NO se tocan a ciegas: los primeros ya
 * apuntan a `brand.like`, y los violetas se quedan documentados hasta saber qué significan.
 *
 * Uso: node pruebas/fase2-colapsar-paletas.cjs
 */
const fs = require('fs');
const path = require('path');

const APP = path.resolve(__dirname, '..');
const ROOTS = ['app', 'components', 'core', 'api', 'state', 'utils', 'constants'];

/** valor hex → token. Se aplica sin distinguir mayúsculas. */
const MAPA = {
  // VERDES de «éxito» (11 → 1). `#25D366` NO es un verde de éxito: es la marca de WhatsApp.
  '#25D366': 'whatsapp',
  '#10B981': 'success', '#00B26A': 'success', '#2BC26A': 'success', '#16A34A': 'success',
  '#22A55A': 'success', '#059669': 'success', '#ADFADE': 'success', '#3DD68C': 'success',
  '#00A86B': 'success',
  // ROJOS de error (a `danger` los claros; los oscuros van a `dangerText`, que sí cumple AA como texto)
  '#FF6B6B': 'danger', '#FF5A26': 'danger', '#D93B2B': 'danger',
  '#991B1B': 'dangerText',
  // ÁMBARES de aviso (16 → 1, más la variante oscura para texto)
  '#F6B100': 'warning', '#F5B50A': 'warning', '#F5A623': 'warning', '#F5B800': 'warning',
  '#FFB400': 'warning', '#FFD166': 'warning', '#B25E00': 'warning', '#FFB020': 'warning',
  '#F6C026': 'warning', '#F07F13': 'warning', '#F5C518': 'warning',
  '#78350F': 'warningText', '#92400E': 'warningText', '#B45309': 'warningText',
  // AZULES: los que son «acción» al azul de marca; los cyan de «información» al token de info
  '#2563EB': 'primary', '#4FA8FF': 'primary', '#2B6BE4': 'primary', '#0A6CFF': 'primary',
  '#3D8BFF': 'primary',
  '#00C2FF': 'info',
};

/** Se quedan fuera a propósito, con su motivo (quedan documentados en el informe). */
const INTOCABLES = ['#6366F1', '#E0439A', '#8B5CF6', '#B57BFF', '#FF7BAC'];

function archivos(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (/node_modules|respaldo|packages[\\/]ui-kit/.test(p)) continue;
    if (e.isDirectory()) archivos(p, acc);
    else if (/\.tsx?$/.test(e.name)) acc.push(p);
  }
  return acc;
}

let total = 0, tocados = 0, imports = 0;
const porFamilia = { success: 0, whatsapp: 0, danger: 0, dangerText: 0, warning: 0, warningText: 0, primary: 0, info: 0 };

for (const root of ROOTS) {
  const dir = path.join(APP, root);
  if (!fs.existsSync(dir)) continue;
  for (const f of archivos(dir)) {
    if (path.basename(f) === 'colors.ts') continue; // el shim
    let txt = fs.readFileSync(f, 'utf8');
    let n = 0;
    for (const [hex, token] of Object.entries(MAPA)) {
      const pat = new RegExp(`(['"])${hex.replace('#', '#')}\\1`, 'gi');
      const m = txt.match(pat);
      if (m && m.length) {
        txt = txt.replace(pat, `brand.${token}`);
        n += m.length;
        porFamilia[token] += m.length;
      }
    }
    if (!n) continue;
    // atributos JSX: color=brand.x  ->  color={brand.x}
    txt = txt.replace(/=\s*(brand\.[A-Za-z]+)(?=[\s/>])/g, '={$1}');
    // import de `brand` si falta
    if (!/import[\s\S]{0,500}?\bbrand\b[\s\S]{0,300}?from/.test(txt)) {
      const m = txt.match(/^import \{ ([^}]+) \} from '@egrouteplan\/ui-kit';/m);
      if (m) {
        txt = txt.replace(m[0], `import { ${m[1]}, brand } from '@egrouteplan/ui-kit';`);
      } else {
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
    total += n; tocados++;
  }
}

console.log(`archivos con colores colapsados: ${tocados}`);
console.log(`valores sustituidos por tokens:  ${total}`);
console.log(`imports de brand añadidos:       ${imports}`);
console.log('\nreparto por significado:');
for (const [k, v] of Object.entries(porFamilia)) if (v) console.log(`  ${k.padEnd(12)} ${v}`);
console.log(`\nintocables a propósito (sin rol claro): ${INTOCABLES.join(', ')}`);
