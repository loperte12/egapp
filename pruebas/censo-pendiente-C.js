/**
 * Censo de lo que QUEDA de la difusión de C (EmptyState · InlineError · Sheet · Aviso).
 *
 * POR QUÉ EXISTE: el informe da cifras («~65 archivos», «51 modales») que ya han resultado ser
 * aproximadas. Antes de seguir difundiendo hay que saber exactamente qué falta, archivo por archivo,
 * con las líneas — porque el siguiente que venga (o yo en otra sesión) no debería volver a contarlo.
 *
 * No modifica nada: escribe el censo en `.design-audit/pendiente-C.md` y resume por pantalla.
 *
 * Uso: node pruebas/censo-pendiente-C.js
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const ZONAS = ['app', 'components', 'core'];

/** Archivos .tsx bajo las zonas del proyecto. */
function archivos(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!/node_modules|respaldo|\.expo/.test(p)) archivos(p, acc); }
    else if (e.name.endsWith('.tsx')) acc.push(p);
  }
  return acc;
}

const conModal = [];
const conVacioAMano = [];
const conEmptyStateK = [];
const conInlineErrorK = [];

for (const zona of ZONAS) {
  const dir = path.join(APP, zona);
  if (!fs.existsSync(dir)) continue;
  for (const f of archivos(dir)) {
    const rel = path.relative(APP, f).replace(/\\/g, '/');
    const t = fs.readFileSync(f, 'utf8');
    const lineas = t.split('\n');
    if (/<Modal\b/.test(t)) conModal.push(rel);
    if (/from '@egrouteplan\/ui-kit'/.test(t) && /\bEmptyState\b/.test(t)) conEmptyStateK.push(rel);
    if (/from '@egrouteplan\/ui-kit'/.test(t) && /\bInlineError\b/.test(t)) conInlineErrorK.push(rel);

    // Vacío escrito a mano: texto de «no hay nada» en un bloque propio
    const marcas = [];
    lineas.forEach((l, i) => {
      if (/Nada por aquí|No hay nada|Todavía no hay|Todavía no has|Todavía no tienes|Aún no has|Aún no tienes|No hay .* (todavía|aún)|Sin .* todavía/.test(l)
        && !/^\s*(\*|\/\/)/.test(l)) {
        marcas.push(`${rel}:${i + 1}  ${l.trim().slice(0, 96)}`);
      }
    });
    if (marcas.length) conVacioAMano.push(...marcas);
  }
}

const salida = [
  '# Censo de lo que queda de C (difusión del kit)',
  '',
  `Generado por \`pruebas/censo-pendiente-C.js\`. Zonas: ${ZONAS.join(', ')}.`,
  '',
  '## 1. Archivos con su propio `<Modal>` (candidatos a `Sheet`)',
  '',
  `Total: **${conModal.length}** archivos.`,
  '',
  ...conModal.map((f) => `- [ ] ${f}`),
  '',
  '## 2. Vacíos escritos a mano (candidatos a `EmptyState`)',
  '',
  `Total: **${conVacioAMano.length}** sitios.`,
  '',
  ...conVacioAMano.map((f) => `- [ ] ${f}`),
  '',
  '## 3. Ya usan el kit',
  '',
  `- \`EmptyState\`: ${conEmptyStateK.length} archivos → ${conEmptyStateK.join(', ')}`,
  `- \`InlineError\`: ${conInlineErrorK.length} archivos → ${conInlineErrorK.join(', ')}`,
  '',
  '## 4. Recordatorio',
  '',
  '- `Aviso` **no** se difunde a los `Alert` informativos de dinero: es un *toast* que no se puede pulsar.',
  '- Antes de adoptar `EmptyState`, mira si el vacío vive **debajo de un título que ya existe** (un modal, una sección): adoptarlo duplicaría el encabezado.',
  '- `Sheet`: el mejor candidato es el modal que **ya hace a mano** lo que el `Sheet` trae. Y ojo con el tope de altura de la hoja (`maxHeight: 80%`, ya en el kit).',
  '',
].join('\n');

const destino = path.join(APP, '.design-audit', 'pendiente-C.md');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, salida, 'utf8');

console.log(`Censo escrito en .design-audit/pendiente-C.md`);
console.log(`  archivos con <Modal>:        ${conModal.length}`);
console.log(`  vacíos a mano:               ${conVacioAMano.length}`);
console.log(`  ya usan EmptyState del kit:  ${conEmptyStateK.length}`);
console.log(`  ya usan InlineError del kit: ${conInlineErrorK.length}`);
