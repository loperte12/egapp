/**
 * REPARACIÓN de la tanda 2 de escalas: `tipografia.body.5` → `tipografia.body`.
 *
 * QUÉ PASÓ (error mío, y de los que conviene recordar): el patrón del `13` era
 * `fontSize:\s*13(?!\d)`. El lookahead excluía otro DÍGITO, pero no el PUNTO, así que también
 * capturó el `13.5` y dejó `fontSize: tipografia.body.5` — que no es nada. El `tsc` lo dijo en el
 * acto en ~150 archivos (TS1005 «',' expected»), que es exactamente para lo que está.
 *
 * El arreglo es seguro porque `tipografia.body.5` NO puede existir por otra vía: se produce solo en
 * los sitios donde estaba el `13.5`, y el valor bueno para esos es `tipografia.body` (14), que es lo
 * que la política de la tanda dice.
 *
 * Uso: node pruebas/fase2-escalas-tanda2-repara.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const ZONAS = ['app', 'components', 'core', 'utils'];

function archivos(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|respaldo|\.expo/.test(p)) archivos(p, acc); }
    else if (/\.(tsx|ts)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

let tocados = 0;
let n = 0;
for (const zona of ZONAS) {
  const dir = path.join(APP, zona);
  if (!fs.existsSync(dir)) continue;
  for (const f of archivos(dir)) {
    let t = fs.readFileSync(f, 'utf8');
    const cuantos = (t.match(/tipografia\.body\.5/g) || []).length;
    if (!cuantos) continue;
    t = t.replace(/tipografia\.body\.5/g, 'tipografia.body');
    fs.writeFileSync(f, t, 'utf8');
    tocados++; n += cuantos;
  }
}
console.log(`Reparados ${n} sitios en ${tocados} archivos (tipografia.body.5 → tipografia.body)`);
