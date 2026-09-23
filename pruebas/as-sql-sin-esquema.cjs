// AS-04 · Busca consultas SQL que NO califican el esquema.
// Motivo: el backend tiene tres esquemas en la MISMA base (wallet, mobility, lifebook)
// y los tres roles tienen USAGE en los tres. Un nombre sin calificar se resuelve por
// `search_path`, así que una tabla homónima "gana" según el cliente que la ejecute.
// Uso: node pruebas/as-sql-sin-esquema.cjs
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = 'D:\\egapp\\.auditoria-servicios\\backend\\src';
const SALIDA = 'D:\\egapp\\.auditoria-servicios\\as-sql-sin-esquema.md';

function ficheros(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '.backups-services-20260829-123004') ficheros(p, acc); }
    else if (e.name.endsWith('.ts')) acc.push(p);
  }
  return acc;
}

const KW = ['from', 'into', 'update', 'join'];
const CALIF = /^(mobility|lifebook|wallet|pg_[a-z_]+)\./i;
const RESERVADA = /^(select|where|set|values|and|or|on|as|is|not|null|true|false|case|when|then|else|end|order|group|limit|offset|desc|asc|inner|left|right|outer|cross|lateral|returning|conflict|do|nothing|using|distinct|union|all|exists|interval|cast|coalesce|count|sum|max|min|avg|now|date_trunc|jsonb_|json_|generate_series|unnest|dual)$/i;

const hallazgos = [];
for (const f of ficheros(RAIZ)) {
  const rel = f.replace('D:\\egapp\\.auditoria-servicios\\backend\\', '').replace(/\\/g, '/');
  const texto = fs.readFileSync(f, 'utf8');
  const lineas = texto.split(/\r?\n/);

  lineas.forEach((l, i) => {
    // solo lineas con pinta de SQL crudo
    if (!/`|'\s*\+|"(SELECT|INSERT|UPDATE|DELETE)/i.test(l)) return;
    if (!/\b(SELECT|INSERT|UPDATE|DELETE)\b/i.test(l)) return;
    // El nombre debe ir SEGUIDO de un limite: espacio, coma, parentesis, fin,
    // salto, $ (interpolacion) o palabra SQL. Un punto despues significa que es
    // `esquema.tabla` (o una propiedad de objeto) y NO es un identificador suelto.
    const re = /\b(from|into|update|join)\s+([a-z_][a-z0-9_]*)(?=\s|,|\)|$|\$|;|`|\n)/gi;
    let m;
    while ((m = re.exec(l)) !== null) {
      const kw = m[1].toLowerCase();
      const tabla = m[2];
      if (CALIF.test(tabla)) continue;
      if (RESERVADA.test(tabla)) continue;
      hallazgos.push({ fichero: rel, linea: i + 1, kw, tabla, texto: l.trim().slice(0, 150) });
    }
  });
}

// agrupar por tabla
const porTabla = {};
for (const h of hallazgos) {
  porTabla[h.tabla] = porTabla[h.tabla] || [];
  porTabla[h.tabla].push(h);
}

const md = [];
md.push('# SQL que no califica el esquema (generado)');
md.push('');
md.push('El backend vive en **una sola base** (`egrouteplan`) con **tres esquemas**: `wallet`, `mobility` y `lifebook`.');
md.push('Los tres roles (`malabogo`, `mobility_app`, `food_agent`) tienen `USAGE` en los tres esquemas (verificado en producción).');
md.push('Por tanto un identificador **sin calificar** se resuelve por el `search_path` del rol que lo ejecuta: si el nombre');
md.push('existe en dos esquemas, la consulta puede tocar la tabla equivocada **sin dar error**.');
md.push('');
md.push(`- Referencias sin calificar encontradas: **${hallazgos.length}**`);
md.push(`- Tablas distintas implicadas: **${Object.keys(porTabla).length}**`);
md.push('');
md.push('> Ojo: esto es un **censo de patrones**, no una prueba de fallo. Cada caso hay que leerlo en su contexto');
md.push('> (algunos pueden ser alias, CTEs o tablas temporales). Las líneas marcadas como relevantes se citan en el informe.');
md.push('');
md.push('## Por tabla');
md.push('');
md.push('| Tabla | Veces | Ficheros |');
md.push('|---|---|---|');
for (const [t, arr] of Object.entries(porTabla).sort((a, b) => b[1].length - a[1].length)) {
  const fs_ = [...new Set(arr.map((x) => x.fichero))];
  md.push(`| \`${t}\` | ${arr.length} | ${fs_.length === 1 ? fs_[0] : fs_.length + ' ficheros'} |`);
}
md.push('');
md.push('## Detalle');
md.push('');
md.push('| Tabla | Fichero:linea | KW | Línea |');
md.push('|---|---|---|---|');
for (const h of hallazgos.sort((a, b) => a.tabla.localeCompare(b.tabla) || a.fichero.localeCompare(b.fichero))) {
  md.push(`| \`${h.tabla}\` | ${h.fichero}:${h.linea} | ${h.kw.toUpperCase()} | \`${h.texto.replace(/\|/g, '\\|')}\` |`);
}

fs.writeFileSync(SALIDA, md.join('\n'), 'utf8');
console.log(`sinCalificar=${hallazgos.length} tablas=${Object.keys(porTabla).length}`);
console.log('top:', Object.entries(porTabla).sort((a, b) => b[1].length - a[1].length).slice(0, 12).map(([t, a]) => `${t}(${a.length})`).join(' '));
console.log(`escrito ${SALIDA}`);
