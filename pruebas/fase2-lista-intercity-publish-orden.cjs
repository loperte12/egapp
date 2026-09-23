/**
 * Corrección de la tanda anterior (intercity-publish): EL ORDEN DE LAS RAMAS.
 *
 * El script anterior puso el modo «lista» ANTES de los dos avisos de entrada, así que un usuario
 * sin cuenta —o sin alta de conductor— que abriera la pantalla habría visto la lista vacía («Aún
 * no has publicado viajes») en lugar de «Necesitas una cuenta de conductor». El orden original era
 * el correcto y hay que conservarlo: primero los avisos, luego los modos.
 *
 *   {!isAuthenticated || driverOk === false ? <ScrollView>…avisos…</ScrollView>
 *     : mode === 'list' ? <SectionList …/>
 *     : <ScrollView>…formulario…</ScrollView>}
 *
 * Uso: node pruebas/fase2-lista-intercity-publish-orden.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/intercity-publish.tsx');
let t = fs.readFileSync(p, 'utf8');
let fallos = 0;

const A_SCROLL = '        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">';
const A_LISTA_INI = "      {mode === 'list' ? (";
const A_FIN_RAMA = '      ) : (\n';
const A_T1 = A_SCROLL + '\n          {!isAuthenticated ? (';
const A_T2 = '          ) : driverOk === false ? (\n';
const A_T3 = '          ) : (\n            <>\n              {cabeceraModos}\n';
const A_T4 = '            </>\n          )}\n        </ScrollView>\n      )}\n';

for (const [nombre, ancla] of Object.entries({ A_SCROLL, A_LISTA_INI, A_T1, A_T2, A_T3, A_T4 })) {
  if (!t.includes(ancla)) { console.log(`  SIN ANCLA: ${nombre}`); fallos++; }
}
if (fallos) { console.log('\nNo se escribe nada.'); process.exit(1); }

// 1) Sacar la rama de la lista de su sitio actual (antes de los avisos)
const iS = t.indexOf(A_LISTA_INI);
const iSFin = t.indexOf(A_FIN_RAMA, iS) + A_FIN_RAMA.length;
const rama = t.slice(iS, iSFin);
const cuerpo = rama.slice(0, rama.length - A_FIN_RAMA.length); // sin el `) : (`
t = t.slice(0, iS) + t.slice(iSFin);
console.log('  OK rama de la lista extraída');

// 2) Los dos avisos de entrada pasan a ser la PRIMERA condición
t = t.replace(A_T1, [
  '      {!isAuthenticated || driverOk === false ? (',
  '        /*',
  '          Los dos avisos de entrada van PRIMERO, como antes de virtualizar: sin cuenta o sin alta',
  '          de conductor no hay ni lista ni formulario que enseñar.',
  '        */',
  '        ' + A_SCROLL.trim(),
  '          {!isAuthenticated ? (',
].join('\n'));
t = t.replace(A_T2, '          ) : (\n');
console.log('  OK avisos primero');

// 3) Y la lista vuelve, ya detrás de los avisos, con el formulario en su propio ScrollView
t = t.replace(A_T3, [
  '          )}',
  '        </ScrollView>',
  '      ) : mode === \'list\' ? (',
  cuerpo.replace(/\n$/, ''),
  '      ) : (',
  '        ' + A_SCROLL.trim(),
  '              {cabeceraModos}',
  '',
].join('\n'));
console.log('  OK lista detrás de los avisos');

// 4) El cierre del fragmento sobra
t = t.replace(A_T4, '        </ScrollView>\n      )}\n');
console.log('  OK cierre ajustado');

fs.writeFileSync(p, t, 'utf8');
console.log('\nOrden de ramas de «Publicar viaje» corregido');
