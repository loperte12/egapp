/**
 * Fase 2 · Difusión de InlineError (D-03/D-20).
 *
 * Solo se sustituye el patrón EXACTO y seguro: `{error && <Text style={{ color: colors.danger… }}>{error}</Text>}`,
 * donde el texto que se pinta es la misma variable que se comprueba. Cualquier otra forma se deja
 * intacta para revisarla a mano: aquí no se adivina.
 *
 * Uso: node pruebas/fase2-difundir-inline-error.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');

const RE = /\{(\w+) && <Text style=\{\{[^}]*color: (?:colors|brand)\.danger[^}]*\}\}>\{\1\}<\/Text>\}/g;

const ROOTS = ['app', 'components'];
let sitios = 0, archivos = 0;
const tocados = [];

function recorrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (/node_modules|respaldo/.test(p)) continue;
    if (e.isDirectory()) { recorrer(p); continue; }
    if (!/\.tsx$/.test(e.name)) continue;
    let src = fs.readFileSync(p, 'utf8');
    const antes = src;
    let n = 0;
    src = src.replace(RE, (_m, variable) => { n++; return `{${variable} ? <View style={{ marginTop: 10 }}><InlineError mensaje={${variable}} /></View> : null}`; });
    if (!n) continue;

    // import del componente (desde el kit) y de View si hiciera falta
    if (!/import \{[^}]*\bInlineError\b[^}]*\} from '@egrouteplan\/ui-kit'/.test(src)) {
      const m = src.match(/^import \{ ([^}]+) \} from '@egrouteplan\/ui-kit';/m);
      if (m) src = src.replace(m[0], `import { ${m[1]}, InlineError } from '@egrouteplan/ui-kit';`);
      else {
        const ms = [...src.matchAll(/from\s+'[^']+';/g)];
        const last = ms[ms.length - 1];
        const end = last.index + last[0].length;
        const eol = src.indexOf('\n', end);
        const at = eol < 0 ? src.length : eol;
        src = src.slice(0, at) + "\nimport { InlineError } from '@egrouteplan/ui-kit';" + src.slice(at);
      }
    }
    if (src === antes) continue;
    fs.writeFileSync(p, src, 'utf8');
    sitios += n; archivos++;
    tocados.push(`${path.relative(APP, p)} (${n})`);
  }
}
for (const r of ROOTS) {
  const d = path.join(APP, r);
  if (fs.existsSync(d)) recorrer(d);
}
console.log(`  sitios sustituidos: ${sitios} en ${archivos} archivo(s)`);
for (const t of tocados) console.log(`    ${t}`);
