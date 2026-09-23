// AS-02b · Extractor de la superficie del backend: rutas, guardas y roles.
// Lee los .controller.ts del espejo local y emite una tabla markdown.
//
// CORREGIDO 18/09/2026 tras un falso hallazgo: la primera version buscaba las
// guardas HACIA ATRAS del decorador de ruta. En este codigo van DESPUES:
//     @Post('jobs')
//     @UseGuards(JwtAuthGuard)
//     @Roles('ADMIN')
//     metodo(...) {
// Aquella version daba "425 rutas sin guardas" y era mentira del instrumento:
// el bucle se paraba al encontrar la firma del metodo ANTERIOR. Ahora se busca
// hacia DELANTE, desde el decorador de ruta hasta el inicio del cuerpo (`{`).
//
// Uso: node pruebas/as-rutas-backend.cjs
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = 'D:\\egapp\\.auditoria-servicios\\backend\\src';
const SALIDA = 'D:\\egapp\\.auditoria-servicios\\as-matriz-rutas.md';

function ficheros(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ficheros(p, acc);
    else if (e.name.endsWith('.controller.ts')) acc.push(p);
  }
  return acc;
}

/** Lista de decoradores (crudos) de una ruta: los que hay entre el decorador
 *  de ruta y la linea donde empieza el cuerpo de su metodo. */
function decoradoresDeRuta(lineas, i) {
  const out = [];
  for (let k = i + 1; k < lineas.length && k <= i + 12; k++) {
    const p = lineas[k];
    if (!/^\s*@/.test(p)) break; // dejo de ser cadena de decoradores
    out.push(p.trim());
    if (/[{(]\s*$/.test(p) && !/^\s*@\w+\(/.test(p)) break;
  }
  return out;
}

const rutas = [];
for (const f of ficheros(RAIZ)) {
  const rel = f.replace('D:\\egapp\\.auditoria-servicios\\backend\\', '').replace(/\\/g, '/');
  const lineas = fs.readFileSync(f, 'utf8').split(/\r?\n/);

  // @Controller('prefijo') con su linea
  const clases = [];
  lineas.forEach((l, i) => {
    const m = /@Controller\(\s*(['"`])([^'"`]*)\1\s*\)/.exec(l);
    if (m) clases.push({ linea: i + 1, prefijo: m[2] });
  });

  // Guardas/roles a nivel de CLASE: desde la linea de la clase hasta el primer decorador de ruta
  lineas.forEach((l, i) => {
    const m = /^\s*@(Get|Post|Put|Patch|Delete)\(\s*(['"`]?)([^'"`)]*)\2\s*\)/.exec(l);
    if (!m) return;
    const verbo = m[1].toUpperCase();
    const sub = (m[3] || '').trim();

    const decoradores = decoradoresDeRuta(lineas, i);
    const txt = decoradores.join(' ');

    const guardas = [];
    const g = /@UseGuards\(([^)]*)\)/.exec(txt);
    if (g) guardas.push(...g[1].split(',').map((s) => s.trim()).filter(Boolean));
    const rr = /@Roles\(([^)]*)\)/.exec(txt);
    const roles = rr ? rr[1].split(',').map((s) => s.trim().replace(/['"`]/g, '')).filter(Boolean) : [];
    const publico = /@Public/.test(txt);
    const throttles = (txt.match(/@Throttle\(/g) || []).length;

    let pref = '';
    for (const c of clases) if (c.linea < i + 1) pref = c.prefijo;

    // clase vigente: la ultima @Controller por encima de esta ruta
    const claseActual = clases.filter((x) => x.linea < i + 1).pop();
    let claseGuardas = [];
    let claseRoles = [];
    if (claseActual) {
      const desde = claseActual.linea;
      // hasta el primer decorador de ruta posterior a la clase
      let hasta = lineas.length;
      for (let k = desde; k < lineas.length; k++) {
        if (/^\s*@(Get|Post|Put|Patch|Delete)\(/.test(lineas[k])) { hasta = k; break; }
      }
      const bloque = lineas.slice(desde, Math.max(hasta, desde)).join(' ');
      const gg = /@UseGuards\(([^)]*)\)/.exec(bloque);
      const r2 = /@Roles\(([^)]*)\)/.exec(bloque);
      claseGuardas = gg ? gg[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
      claseRoles = r2 ? r2[1].split(',').map((s) => s.trim().replace(/['"`]/g, '')).filter(Boolean) : [];
    }

    rutas.push({
      fichero: rel,
      linea: i + 1,
      verbo,
      ruta: '/' + [pref, sub].filter(Boolean).join('/').replace(/^\/+/, ''),
      guardas,
      roles: roles.length ? roles : claseRoles,
      claseGuardas,
      publico,
      throttles,
    });
  });
}

rutas.sort((a, b) => a.fichero.localeCompare(b.fichero) || a.linea - b.linea);

const sinGuardas = rutas.filter((r) => !r.publico && r.guardas.length === 0 && r.claseGuardas.length === 0);
const soloJwt = rutas.filter((r) => {
  const todas = [...r.claseGuardas, ...r.guardas];
  return todas.length > 0 && !todas.includes('RolesGuard');
});
const conRoles = rutas.filter((r) => [...r.claseGuardas, ...r.guardas].includes('RolesGuard'));

const md = [];
md.push('# Matriz de rutas del backend (generada)');
md.push('');
md.push('Generada por `pruebas/as-rutas-backend.cjs` sobre el espejo local del 18/09/2026.');
md.push('Fuente: `/opt/mirror/app/src/**/*.controller.ts` (sha256 del tar: `21378a0d475dedb77aa6bbea03ca910fd40cb05c77a69e00083591c4a3304651`).');
md.push('');
md.push('> **Errata del instrumento.** La primera version de este extractor buscaba las guardas');
md.push('> **hacia atras** del decorador de ruta y produjo «425 de 575 rutas sin guardas». Era falso:');
md.push('> en este codigo las guardas van **despues** (`@Post(...)` → `@UseGuards(...)` → metodo).');
md.push('> Las cifras validas son las de esta version, ya corregida.');
md.push('');
md.push(`- Rutas encontradas: **${rutas.length}**`);
md.push(`- Sin ninguna guarda (ni de metodo ni de clase): **${sinGuardas.length}**`);
md.push(`- Solo ` + '`JwtAuthGuard`' + ` (sesion, sin control de rol): **${soloJwt.length}**`);
md.push(`- Con ` + '`RolesGuard`' + ` (rol comprobado): **${conRoles.length}**`);
md.push('');
md.push('## Rutas SIN ninguna guarda');
md.push('');
md.push('| Verbo | Ruta | Fichero:linea |');
md.push('|---|---|---|');
for (const r of sinGuardas) md.push(`| ${r.verbo} | \`${r.ruta}\` | ${r.fichero}:${r.linea} |`);
md.push('');
md.push('## Rutas con RolesGuard');
md.push('');
md.push('| Verbo | Ruta | Guardas | Roles | Fichero:linea |');
md.push('|---|---|---|---|---|');
for (const r of conRoles) md.push(`| ${r.verbo} | \`${r.ruta}\` | ${[...r.claseGuardas, ...r.guardas].join('+')} | ${r.roles.join(',') || '—'} | ${r.fichero}:${r.linea} |`);
md.push('');
md.push('## Todas las rutas');
md.push('');
md.push('| Verbo | Ruta | Guardas | Roles | Fichero:linea |');
md.push('|---|---|---|---|---|');
for (const r of rutas) {
  const gg = [...r.claseGuardas, ...r.guardas].join('+') || '—';
  md.push(`| ${r.verbo} | \`${r.ruta}\` | ${gg} | ${r.roles.join(',') || '—'} | ${r.fichero}:${r.linea} |`);
}
md.push('');
md.push('## Resumen por fichero');
md.push('');
md.push('| Fichero | Rutas | Sin guardas | Solo JWT | Con rol |');
md.push('|---|---|---|---|---|');
const porFichero = {};
for (const r of rutas) {
  const k = r.fichero;
  porFichero[k] = porFichero[k] || { n: 0, s: 0, j: 0, ro: 0 };
  porFichero[k].n++;
  if (sinGuardas.includes(r)) porFichero[k].s++;
  if (soloJwt.includes(r)) porFichero[k].j++;
  if (conRoles.includes(r)) porFichero[k].ro++;
}
for (const [f, v] of Object.entries(porFichero).sort()) md.push(`| ${f} | ${v.n} | ${v.s} | ${v.j} | ${v.ro} |`);

fs.writeFileSync(SALIDA, md.join('\n'), 'utf8');
console.log(`rutas=${rutas.length} sinGuardas=${sinGuardas.length} soloJwt=${soloJwt.length} conRoles=${conRoles.length}`);
console.log(`escrito ${SALIDA}`);
