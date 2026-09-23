/**
 * Remate de la tanda de intercity-publish: la indentación de los bloques recolocados.
 * Es cosmético, pero el archivo se lee a diario. Se busca por CONTENIDO (no por número de línea,
 * que cambia en cuanto se toca algo) y cada línea se comprueba antes de tocarla.
 * Uso: node pruebas/fase2-lista-intercity-publish-indentacion.cjs
 */
const fs = require('fs');
const path = require('path');
const p = path.resolve(__dirname, '../app/intercity-publish.tsx');
const lineas = fs.readFileSync(p, 'utf8').split('\n');
let fallos = 0;

function indiceDe(texto) {
  const i = lineas.findIndex((l) => l.includes(texto));
  if (i < 0) { console.log(`  SIN ANCLA: «${texto}»`); fallos++; }
  return i;
}

/** Quita `n` espacios iniciales a la línea `i`, comprobando que empieza por `esperado`. */
function desangrar(i, n, esperado) {
  const original = lineas[i];
  const limpia = original.trimStart();
  if (!limpia.startsWith(esperado)) {
    console.log(`  NO CUADRA la línea ${i + 1}: se esperaba «${esperado}» y hay «${limpia.slice(0, 45)}»`);
    fallos++;
    return;
  }
  lineas[i] = original.slice(Math.min(n, original.length - limpia.length));
}

// 1) Cabecera «Mis viajes»: el <View> de la fila y sus 4 líneas hijas
const iH1 = indiceDe('<Text style={s.big}>Mis viajes</Text>');
if (iH1 >= 0) for (let k = 0; k < 5; k++) desangrar(iH1 + k, 14, k === 4 ? '</View>' : '<');

// 2) Aviso de tarifas: su <View> y sus 3 líneas hijas
const iH2 = indiceDe('{pendingFares > 0 && (');
if (iH2 >= 0) for (let k = 1; k <= 4; k++) desangrar(iH2 + k, 14, k === 4 ? ')}' : '<');

// 3) Título de sección: sus dos últimas líneas
const iTit = indiceDe('{section.titulo} · ');
if (iTit >= 0) { desangrar(iTit, 12, '{section.titulo}'); desangrar(iTit + 1, 12, '</Text>'); }

if (fallos) { console.log(`\n${fallos} problema(s): no se escribe`); process.exit(1); }
fs.writeFileSync(p, lineas.join('\n'), 'utf8');
console.log('Indentación rematada');
