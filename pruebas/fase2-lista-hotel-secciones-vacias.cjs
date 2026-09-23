/**
 * Fase 2 · 21 (corrección de la tanda anterior) — Las secciones VACÍAS no deben dibujarse.
 *
 * Lo encontró la comprobación en el aparato, no el typecheck: al abrir «Mis estancias» aparecía
 * «En curso (0)», un título que ANTES no estaba (el viejo componente `Grupo` hacía `return null`
 * cuando la lista venía vacía). La causa está en React Native:
 *
 *   node_modules/@react-native/virtualized-lists/Lists/VirtualizedSectionList.js  L178-180
 *     // Add two for the section header and footer.
 *     itemCount += 2;
 *     itemCount += this.props.getItemCount(section.data);
 *
 * Cuenta DOS celdas por sección pase lo que pase, así que una sección sin filas sigue teniendo
 * cabecera. Se arregla filtrando las secciones vacías, que es exactamente lo que hacía el `return
 * null` de `Grupo`.
 *
 * Uso: node pruebas/fase2-lista-hotel-secciones-vacias.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
let fallos = 0;

const NOTA = [
  '          /*',
  '            Las secciones vacías se filtran a propósito: VirtualizedSectionList cuenta DOS',
  '            celdas por sección aunque no tenga filas (cabecera y pie, ver',
  '            @react-native/virtualized-lists/Lists/VirtualizedSectionList.js L178-180), así que',
  '            sin filtrar saldría un «En curso (0)» que antes NO se veía: el viejo componente',
  '            `Grupo` hacía `return null` cuando la lista venía vacía.',
  '          */',
].join('\n');

const casos = [
  {
    archivo: 'app/lifebook-hotel-reservas.tsx',
    viejo: '          sections={[\n            { titulo: \'En curso\', data: enCurso },\n            { titulo: \'Próximas\', data: futuras },\n            { titulo: \'Historial\', data: pasadas },\n          ]}',
    nuevo: '          sections={[\n            { titulo: \'En curso\', data: enCurso },\n            { titulo: \'Próximas\', data: futuras },\n            { titulo: \'Historial\', data: pasadas },\n          ].filter((s) => s.data.length > 0)}',
  },
  {
    archivo: 'app/lifebook-hotel-panel.tsx',
    viejo: '          sections={[\n            { titulo: \'Requiere tu atención\', data: urgentes },\n            { titulo: \'En casa hoy\', data: enCurso },\n            { titulo: \'Próximas llegadas\', data: futuras },\n            { titulo: \'Historial\', data: historial.slice(0, 20) },\n          ]}',
    nuevo: '          sections={[\n            { titulo: \'Requiere tu atención\', data: urgentes },\n            { titulo: \'En casa hoy\', data: enCurso },\n            { titulo: \'Próximas llegadas\', data: futuras },\n            { titulo: \'Historial\', data: historial.slice(0, 20) },\n          ].filter((s) => s.data.length > 0)}',
  },
];

for (const { archivo, viejo, nuevo } of casos) {
  const p = path.join(APP, archivo);
  let t = fs.readFileSync(p, 'utf8');
  if (!t.includes(viejo)) { console.log(`  SIN ANCLA: ${archivo}`); fallos++; continue; }
  t = t.replace(viejo, NOTA + '\n' + nuevo);
  fs.writeFileSync(p, t, 'utf8');
  console.log(`  OK ${archivo}: secciones vacías filtradas`);
}

console.log(fallos ? `\n${fallos} problema(s)` : '\nSecciones vacías fuera de las dos listas de hotel');
process.exit(fallos ? 1 : 0);
