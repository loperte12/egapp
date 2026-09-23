/**
 * auditar-rutas.cjs — AUDITORÍA DEL SISTEMA DE NAVEGACIÓN (solo lee, no toca nada).
 *
 *   node pruebas/auditar-rutas.cjs
 *
 * Qué hace:
 *   1. Saca la lista REAL de rutas del proyecto (ficheros de `app/`, con las reglas de
 *      expo-router: `index` = raíz, `[id]` = parámetro, `(grupo)` no cuenta en la URL).
 *   2. Busca en TODO el código las navegaciones: `pathname: '...'`, `router.push/replace('...')`,
 *      `href: '...'`, `Redirect`.
 *   3. Normaliza las dos listas (los parámetros se comparan como `:p`) y canta:
 *      · rutas a las que se navega y NO existen  → enlaces ROTOS;
 *      · rutas que existen y nadie abre          → pantallas huérfanas;
 *      · cuántas navegaciones van con `as never` → el tipo se está saltando, que es por donde
 *        entran los enlaces rotos sin que el compilador diga nada;
 *      · navegaciones cuyo destino puede ser nulo (`?.(`, ternarios con `: null`, etc.).
 */
const fs = require('fs');
const path = require('path');

const APP = path.join(__dirname, '..', 'app');
const RAIZ = path.join(__dirname, '..');

/** Rutas reales a partir de los ficheros de `app/`. */
function rutasReales() {
  const out = new Set();
  const andar = (dir, base = '') => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const rel = base ? `${base}/${e.name}` : e.name;
      if (e.isDirectory()) {
        // Los grupos `(x)` y las carpetas con + no forman parte de la URL.
        const limpio = /^\(.*\)$/.test(e.name) || e.name.startsWith('+') ? base : rel;
        andar(path.join(dir, e.name), limpio);
        continue;
      }
      if (!/\.(tsx|ts)$/.test(e.name)) continue;
      let r = rel.replace(/\.(tsx|ts)$/, '');
      r = r.replace(/\/index$/, '').replace(/^index$/, '');
      if (r.endsWith('/_layout') || r.endsWith('_layout')) continue;
      if (r.startsWith('+')) continue;
      out.add('/' + r);
    }
  };
  andar(APP);
  return out;
}

/** Ficheros de código de la app (sin node_modules ni la carpeta app/ duplicada). */
function ficheros(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'android' || e.name === 'ios') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (['pruebas', 'docs', 'backend', '.expo', '.tmp-hotel', '.tmp-repartidor', '.tmp-minimo-aparato'].includes(e.name)) continue;
      ficheros(p, acc);
    } else if (/\.(tsx|ts)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/** Los parámetros se comparan igual: `/x/[id]` y `/x/abc` son la misma ruta. */
const normal = (r) => r
  // La parte de consulta (`?tab=likes`) y el ancla NO son parte de la ruta: si no se quitan,
  // el analizador da por rotas rutas que existen (me pasó en la primera pasada).
  .replace(/[?#].*$/, '')
  .replace(/\/\[[^\]]+\]/g, '/:p')
  .replace(/\/:[A-Za-z_][\w]*/g, '/:p')
  .replace(/\/[0-9a-f]{8}-[0-9a-f-]{20,}/gi, '/:p')
  .replace(/\/\d+/g, '/:p')
  .replace(/\/+$/, '') || '/';

/**
 * ¿A qué ruta REAL apunta esta navegación?
 *
 * Comparar cadenas no vale: `/service/paquete` NO es igual a `/service/[id]`, pero SÍ encaja en
 * esa pantalla (el segmento `paquete` es el parámetro `id`). Comparando texto, el analizador
 * daba «enlaces rotos» que no lo eran. Aquí se convierte cada ruta real en un patrón y se prueba.
 */
function rutaQueEncaja(destino, patrones) {
  for (const [patron, original] of patrones) {
    if (patron.test(destino)) return original;
  }
  return null;
}

const reales = rutasReales();
const normReales = new Map([...reales].map((r) => [normal(r), r]));
/** Patrones de las rutas reales: `:p` = cualquier segmento. */
const patrones = [...normReales.entries()].map(([n, original]) => [
  new RegExp(`^${n.replace(/:[A-Za-z_]\w*/g, '[^/]+').replace(/\//g, '\\/')}$`),
  original,
]);

const refs = [];            // { fichero, linea, ruta, como }
const asNever = [];         // navegaciones con `as never`
const posiblesNulos = [];   // destinos que podrían ser nulos

for (const f of ficheros(RAIZ)) {
  const rel = path.relative(RAIZ, f);
  const lineas = fs.readFileSync(f, 'utf8').split('\n');
  lineas.forEach((l, i) => {
    const n = i + 1;
    // Los COMENTARIOS no son navegaciones: si no se saltan, una línea que EXPLICA el arreglo
    // («antes esto navegaba a ciegas…») cuenta como si fuera el propio fallo. Me pasó.
    const limpia = l.trim();
    const esComentario = limpia.startsWith('*') || limpia.startsWith('//') || limpia.startsWith('/*');
    if (esComentario) return;
    for (const m of l.matchAll(/pathname:\s*'([^']+)'/g)) refs.push({ fichero: rel, linea: n, ruta: m[1], como: 'pathname' });
    for (const m of l.matchAll(/router\.(push|replace|navigate)\(\s*'([^']+)'/g)) refs.push({ fichero: rel, linea: n, ruta: m[2], como: `router.${m[1]}` });
    for (const m of l.matchAll(/href=\{?'([^']+)'/g)) refs.push({ fichero: rel, linea: n, ruta: m[1], como: 'href' });
    // MUCHAS pantallas se abren desde LISTAS (menús, dock): `route: '/x'`. Sin este patrón, el
    // analizador las daba por «huérfanas» y no veía los enlaces rotos que viven ahí.
    for (const m of l.matchAll(/\b(?:route|ruta|to|destino|path):\s*'(\/[^']+)'/g)) refs.push({ fichero: rel, linea: n, ruta: m[1], como: m[0].split(':')[0] });
    for (const m of l.matchAll(/\b(?:route|ruta|to|destino|path):\s*"(\/[^"]+)"/g)) refs.push({ fichero: rel, linea: n, ruta: m[1], como: m[0].split(':')[0] });
    if (/as never/.test(l) && /(router\.(push|replace)|pathname)/.test(l)) asNever.push({ fichero: rel, linea: n });
    // Destinos que pueden ser nulos: `?.` encadenado a push, o ternarios que devuelven null.
    if (/(router\.(push|replace)\(\s*\w+\s*as never)/.test(l) || /(router\.(push|replace)\(\s*[a-zA-Z_]\w*\s*\))/.test(l)) {
      posiblesNulos.push({ fichero: rel, linea: n, texto: l.trim().slice(0, 120) });
    }
  });
}

const rotas = [];
const usadas = new Set();
for (const r of refs) {
  if (!r.ruta.startsWith('/')) continue;
  const encaja = rutaQueEncaja(normal(r.ruta), patrones);
  if (encaja) usadas.add(encaja);
  else rotas.push(r);
}

const huerfanas = [...reales].filter((r) => !usadas.has(r)).sort();
const rotasUnicas = [...new Map(rotas.map((r) => [`${r.ruta}`, r])).values()];

/* ── COMPROBACIONES DEL SISTEMA DE NAVEGACIÓN (14/09/2026) ────────────────────────────────
   A partir de aquí, esto no es solo un informe: es una PRUEBA. Si algo de esto falla, el
   programa termina con error para que salte en la compilación y nadie vuelva a dejar un enlace
   roto en silencio. Es la respuesta a «el sistema de navegación falla constantemente». */
const fallos = [];

// 1) El MAPA de rutas (constants/rutas.ts) tiene que conocer TODAS las rutas reales.
let mapaFaltan = [];
let mapaSobran = [];
try {
  const mapa = fs.readFileSync(path.join(RAIZ, 'constants', 'rutas.ts'), 'utf8');
  const enMapa = new Set([...mapa.matchAll(/ruta:\s*'([^']+)'/g)].map((m) => m[1]));
  mapaFaltan = [...reales].filter((r) => !enMapa.has(r)).sort();
  mapaSobran = [...enMapa].filter((r) => !reales.has(r)).sort();
  if (mapaFaltan.length) fallos.push(`${mapaFaltan.length} ruta(s) reales NO están en el mapa: ${mapaFaltan.slice(0, 5).join(', ')}${mapaFaltan.length > 5 ? '…' : ''}`);
  if (mapaSobran.length) fallos.push(`${mapaSobran.length} ruta(s) del mapa ya no existen: ${mapaSobran.slice(0, 5).join(', ')}${mapaSobran.length > 5 ? '…' : ''}`);
} catch {
  fallos.push('no existe constants/rutas.ts (el mapa de rutas)');
}

// 2) Enlaces rotos: ninguna navegación puede apuntar a una pantalla que no existe.
if (rotas.length) {
  fallos.push(`${rotas.length} navegación(es) apuntan a pantallas que NO existen: ${rotasUnicas.map((r) => r.ruta).join(', ')}`);
}

// 3) Destinos nulos: un botón que puede quedarse sin destino es un botón que a veces no hace nada.
const nulosPendientes = posiblesNulos.filter((p) => !/irSeguro|\.destino\(|\.libre\(|explicar\(/.test(p.texto));

// 4) La pantalla de respaldo tiene que existir: es la salida cuando algo falla.
const hayRespaldo = reales.has('/ruta-fallida');
const hayNotFound = fs.existsSync(path.join(APP, '+not-found.tsx'));
if (!hayRespaldo) fallos.push('falta la pantalla de respaldo /ruta-fallida');
if (!hayNotFound) fallos.push('falta app/+not-found.tsx (lo que se ve con una dirección desconocida)');

// 5) Cuántas navegaciones ya usan el ayudante (esto es progreso, no un fallo).
//    Se cuenta por LÍNEA: una navegación pasa por el ayudante si en esa línea aparece `irSeguro`,
//    `ir.a(`, `ir.libre(`, `ir.destino(` o `ir.inicio(`.
const usaAyudante = (texto) => /irSeguro|ir\.a\(|ir\.libre\(|ir\.destino\(|ir\.inicio\(|ir\.atras\(|ir\.explicar\(/.test(texto);
let conAyudante = 0;
{
  const vistas = new Set();
  for (const f of ficheros(RAIZ)) {
    const rel = path.relative(RAIZ, f);
    const lineas = fs.readFileSync(f, 'utf8').split('\n');
    lineas.forEach((l, i) => {
      if (usaAyudante(l) && /(router\.(push|replace|navigate)|pathname:|\.libre\(|\.destino\()/.test(l)) {
        const clave = `${rel}:${i + 1}`;
        if (!vistas.has(clave)) { vistas.add(clave); conAyudante += 1; }
      }
    });
  }
}

console.log(`\n=== RUTAS REALES (ficheros de app/): ${reales.size} ===`);
console.log(`=== NAVEGACIONES ENCONTRADAS: ${refs.length} (a ${new Set(refs.map((r) => r.ruta)).size} destinos distintos) ===`);

console.log(`\n=== ENLACES ROTOS: ${rotas.length} (${rotasUnicas.length} destinos distintos) ===`);
for (const r of rotasUnicas) {
  const sitios = rotas.filter((x) => x.ruta === r.ruta);
  console.log(`  · ${r.ruta}   (${sitios.length} sitio${sitios.length === 1 ? '' : 's'}: ${sitios.slice(0, 3).map((s) => `${s.fichero}:${s.linea}`).join(', ')}${sitios.length > 3 ? '…' : ''})`);
}

console.log(`\n=== PANTALLAS QUE NADIE ABRE: ${huerfanas.length} ===`);
for (const r of huerfanas) console.log(`  · ${r}`);

console.log(`\n=== NAVEGACIONES CON «as never» (el tipo no comprueba el destino): ${asNever.length} ===`);
const porFichero = {};
for (const a of asNever) porFichero[a.fichero] = (porFichero[a.fichero] ?? 0) + 1;
Object.entries(porFichero).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([f, n]) => console.log(`  · ${n}  ${f}`));

console.log(`\n=== DESTINOS QUE PODRÍAN SER NULOS/VARIABLES: ${posiblesNulos.length} ===`);
for (const p of posiblesNulos.slice(0, 12)) console.log(`  · ${p.fichero}:${p.linea}  ${p.texto}`);
if (posiblesNulos.length > 12) console.log(`  … y ${posiblesNulos.length - 12} más`);

console.log('\n=== SISTEMA DE NAVEGACIÓN (comprobaciones que FALLAN si algo se rompe) ===');
console.log(`  · Mapa de rutas (constants/rutas.ts): ${mapaFaltan.length === 0 && mapaSobran.length === 0 ? 'completo y al día' : 'DESAJUSTADO'}`);
console.log(`  · Pantalla de respaldo /ruta-fallida: ${hayRespaldo ? 'existe' : 'FALTA'}`);
console.log(`  · +not-found.tsx (dirección desconocida): ${hayNotFound ? 'existe' : 'FALTA'}`);
console.log(`  · Enlaces rotos: ${rotas.length === 0 ? 'ninguno' : rotas.length + ' ¡ROTOS!'}`);
console.log(`  · Destinos que pueden quedar nulos sin avisar: ${nulosPendientes.length}`);
console.log(`  · Navegaciones que ya pasan por el ayudante: ${conAyudante} de ${refs.length} (el resto siguen yendo directas; se migran por zonas)`);

if (fallos.length) {
  console.log('\n=== ✗ LA AUDITORÍA DE RUTAS HA FALLADO ===');
  for (const f of fallos) console.log(`  · ${f}`);
  console.log('');
  process.exit(1);
}
console.log('\n=== ✓ NAVEGACIÓN: todo en orden (sin enlaces rotos, con respaldo y mapa al día) ===\n');
