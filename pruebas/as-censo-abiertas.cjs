// AS-03 · Censo de rutas SIN guarda: une la matriz generada con el cuerpo de cada handler.
// Para cada ruta sin guarda imprime el metodo, la ruta, la linea y el cuerpo (hasta el cierre).
// Uso: node pruebas/as-censo-abiertas.cjs
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = 'D:\\egapp\\.auditoria-servicios\\backend\\src';
const SALIDA = 'D:\\egapp\\.auditoria-servicios\\as-rutas-abiertas.md';

function ficheros(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ficheros(p, acc);
    else if (e.name.endsWith('.controller.ts')) acc.push(p);
  }
  return acc;
}

function decoradoresDeRuta(lineas, i) {
  const out = [];
  for (let k = i + 1; k < lineas.length && k <= i + 12; k++) {
    const p = lineas[k];
    if (!/^\s*@/.test(p)) break;
    out.push(p.trim());
  }
  return out;
}

const abiertas = [];
for (const f of ficheros(RAIZ)) {
  const rel = f.replace('D:\\egapp\\.auditoria-servicios\\backend\\', '').replace(/\\/g, '/');
  const lineas = fs.readFileSync(f, 'utf8').split(/\r?\n/);

  const clases = [];
  lineas.forEach((l, i) => {
    const m = /@Controller\(\s*(['"`])([^'"`]*)\1\s*\)/.exec(l);
    if (m) clases.push({ linea: i + 1, prefijo: m[2] });
  });

  lineas.forEach((l, i) => {
    const m = /^\s*@(Get|Post|Put|Patch|Delete)\(\s*(['"`]?)([^'"`)]*)\2\s*\)/.exec(l);
    if (!m) return;
    const verbo = m[1].toUpperCase();
    const sub = (m[3] || '').trim();
    const deco = decoradoresDeRuta(lineas, i).join(' ');

    const claseActual = clases.filter((x) => x.linea < i + 1).pop();
    let claseDeco = '';
    if (claseActual) {
      let hasta = lineas.length;
      for (let k = claseActual.linea; k < lineas.length; k++) {
        if (/^\s*@(Get|Post|Put|Patch|Delete)\(/.test(lineas[k])) { hasta = k; break; }
      }
      claseDeco = lineas.slice(claseActual.linea, Math.max(hasta, claseActual.linea)).join(' ');
    }

    const tieneGuarda = /@UseGuards\(/.test(deco) || /@UseGuards\(/.test(claseDeco);
    const esPublico = /@Public/.test(deco);
    if (tieneGuarda || esPublico) return;

    let pref = '';
    for (const c of clases) if (c.linea < i + 1) pref = c.prefijo;

    // cuerpo: desde el decorador hasta el cierre del metodo (cuento llaves)
    const cuerpo = [];
    let dentro = false, prof = 0, lineasCuerpo = 0;
    for (let k = i + 1; k < lineas.length && lineasCuerpo < 45; k++) {
      const p = lineas[k];
      cuerpo.push((k + 1) + ': ' + p.trim());
      lineasCuerpo++;
      for (const ch of p) {
        if (ch === '{') { prof++; dentro = true; }
        else if (ch === '}') prof--;
      }
      if (dentro && prof <= 0) break;
    }

    abiertas.push({
      fichero: rel,
      linea: i + 1,
      verbo,
      ruta: '/' + [pref, sub].filter(Boolean).join('/').replace(/^\/+/, ''),
      deco,
      cuerpo,
      tocaDinero: /escrow|wallet|payment|pay\(|charge|refund|fare|price|amount|settle|fee|deposit|withdraw/i.test(cuerpo.join(' ')),
      tocaAdmin: /admin/i.test(sub),
      usuarioDeSesion: /CurrentUser|req\.user|OptionalUser/i.test(cuerpo.join(' ')),
    });
  });
}

abiertas.sort((a, b) => a.fichero.localeCompare(b.fichero) || a.linea - b.linea);

const md = [];
md.push('# Rutas SIN guarda de sesión (censo con cuerpo del handler)');
md.push('');
md.push('Generado por `pruebas/as-censo-abiertas.cjs`. La única guarda GLOBAL del backend es el');
md.push('throttler (`src/http/app.module.ts:122`), así que *sin `@UseGuards`* significa **ruta pública de verdad**,');
md.push('salvo que el propio handler compruebe la identidad por dentro.');
md.push('');
md.push(`- Rutas abiertas: **${abiertas.length}**`);
md.push(`- De ellas, con pinta de tocar dinero/tarifa: **${abiertas.filter((a) => a.tocaDinero).length}**`);
md.push(`- De ellas, bajo un camino ` + '`admin`' + `: **${abiertas.filter((a) => a.tocaAdmin).length}**`);
md.push(`- De ellas, que mencionan al usuario de sesión en el cuerpo: **${abiertas.filter((a) => a.usuarioDeSesion).length}**`);
md.push('');
md.push('## Índice');
md.push('');
md.push('| Verbo | Ruta | Dinero | Admin | Usa sesión | Fichero:linea |');
md.push('|---|---|---|---|---|---|');
for (const a of abiertas) {
  md.push(`| ${a.verbo} | \`${a.ruta}\` | ${a.tocaDinero ? 'sí' : '—'} | ${a.tocaAdmin ? 'sí' : '—'} | ${a.usuarioDeSesion ? 'sí' : '—'} | ${a.fichero}:${a.linea} |`);
}
md.push('');
md.push('## Cuerpo de cada handler');
for (const a of abiertas) {
  md.push('');
  md.push(`### ${a.verbo} \`${a.ruta}\` — ${a.fichero}:${a.linea}`);
  if (a.deco) md.push('Decoradores: `' + a.deco + '`');
  md.push('');
  md.push('```ts');
  md.push(...a.cuerpo);
  md.push('```');
}

fs.writeFileSync(SALIDA, md.join('\n'), 'utf8');
console.log(`abiertas=${abiertas.length} dinero=${abiertas.filter((a) => a.tocaDinero).length} admin=${abiertas.filter((a) => a.tocaAdmin).length}`);
console.log(`escrito ${SALIDA}`);
