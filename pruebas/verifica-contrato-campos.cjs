// Puerta del CONTRATO DE CAMPOS: comprueba que docs/UI-HOTEL-CONTRATO-CAMPOS.md no inventa
// ni un nombre. Es una puerta porque ese documento es el que se le entrega a quien va a
// escribir contra el dato, y un nombre inventado ahí cuesta una tanda entera.
//
// Lo que comprueba, en dos partes:
//   1. TIPOS (siempre): cada interfaz de los bloques ```ts del documento debe existir en
//      api/hotel.ts, y cada campo con la MISMA opcionalidad y el MISMO tipo. Se compara
//      POR INTERFAZ, no en un mapa global: `guests`, `lat` o `checkinFrom` existen en varias
//      interfaces con formas distintas, así que un mapa global da falsos positivos.
//   2. CLAVES JSON (si están las muestras): cada clave de los bloques ```json debe existir en
//      los JSON capturados del servidor. Las muestras son artefactos locales (pruebas/_*);
//      si no están, se avisa y no se falla.
//
// Trampas que esta puerta ya pagó (no volver a caer):
//   · `export type X = 'a' | 'b';` NO tiene llaves -> no se puede partir por `^}`: se comería
//     la interfaz siguiente y la daría por inexistente.
//   · en el documento hay varias declaraciones por LÍNEA (`a: string; b: string;`) -> partir por `;`.
//   · un bloque ```json con dos propiedades sueltas no es JSON válido (fragmento) -> envolver en llaves.
const fs = require('fs');
const path = require('path');
const R = path.join(__dirname, '..') + path.sep;

// Campos que el documento declara NO transcribir (van resumidos con una nota «… + …»)
const OMITIDOS = new Set(['guestId', 'depositConfirmedBy', 'depositProof', 'createdAt', 'updatedAt',
  'depositPaidAt', 'paidAt', 'checkedInAt', 'checkedOutAt', 'cancelledAt', 'reviewId']);

const MUESTRAS = [
  ['_p2-ficha.json', 'la ficha (GET /hotels/:id)'],
  ['_p2-search.json', 'la busqueda (GET /hotels)'],
  ['_ct-calendar.json', 'el calendario (GET /rooms/:id/calendar)'],
  ['_ct-reviews.json', 'las resenas (GET /hotels/:id/reviews)'],
];

const doc = fs.readFileSync(R + 'docs/UI-HOTEL-CONTRATO-CAMPOS.md', 'utf8');
const src = fs.readFileSync(R + 'api/hotel.ts', 'utf8');

const bloques = (txt, len) =>
  [...txt.matchAll(new RegExp('```' + len + '\\n([\\s\\S]*?)```', 'g'))].map((m) => m[1]);

const camposDe = (cuerpo) => {
  const campos = new Map();
  cuerpo.split('\n').forEach((l) => {
    l.replace(/\/\/.*$/, '').split(';').forEach((trozo) => {
      const c = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)(\??):\s*(.+?)\s*$/.exec(trozo);
      if (c) campos.set(c[1], { opt: c[2] === '?', tipo: c[3].replace(/[,;]\s*$/, '').trim() });
    });
  });
  return campos;
};

const interfaces = (txt) => {
  const out = new Map();
  const reI = /^export interface (\w+)[^{]*[{]([\s\S]*?)^}/gm;
  const reT = /^export type (\w+)\s*=\s*([\s\S]*?);/gm;
  let m;
  while ((m = reI.exec(txt))) out.set(m[1], camposDe(m[2]));
  while ((m = reT.exec(txt))) out.set(m[1], { tipoAlias: m[2].replace(/\s+/g, ' ').trim() });
  return out;
};

const srcIf = interfaces(src);
const norm = (t) => t.replace(/\s+/g, ' ').replace(/[,;]\s*$/, '').trim();

let errores = 0, comprobados = 0, omitidos = 0, alias = 0;

console.log('=== TIPOS · por interfaz (documento vs api/hotel.ts) ===');
for (const b of bloques(doc, 'ts')) {
  for (const [nombre, camposDoc] of interfaces(b)) {
    if (camposDoc.tipoAlias !== undefined) {
      const s = srcIf.get(nombre);
      alias++;
      if (!s || s.tipoAlias === undefined) { console.log('  X alias inexistente en el fuente: ' + nombre); errores++; }
      else if (norm(s.tipoAlias) !== norm(camposDoc.tipoAlias)) {
        console.log('  X ' + nombre + ' valores distintos:\n      doc   : ' + camposDoc.tipoAlias + '\n      fuente: ' + s.tipoAlias); errores++;
      } else console.log('  ok ' + nombre + ' (valores)');
      continue;
    }
    const camposSrc = srcIf.get(nombre);
    if (!camposSrc || camposSrc.tipoAlias !== undefined) { console.log('  X interfaz inexistente en el fuente: ' + nombre); errores++; continue; }
    let n = 0;
    for (const [f, d] of camposDoc) {
      n++; comprobados++;
      const s = camposSrc.get(f);
      if (!s) { console.log('  X ' + nombre + '.' + f + ' NO EXISTE en el fuente'); errores++; continue; }
      if (s.opt !== d.opt) { console.log('  X ' + nombre + '.' + f + ' opcionalidad: doc=' + (d.opt ? '?' : 'obligatorio') + ' fuente=' + (s.opt ? '?' : 'obligatorio')); errores++; continue; }
      if (norm(s.tipo) !== norm(d.tipo)) {
        console.log('  X ' + nombre + '.' + f + ' tipo distinto:\n      doc   : ' + d.tipo + '\n      fuente: ' + s.tipo); errores++;
      }
    }
    for (const f of camposSrc.keys()) if (!camposDoc.has(f)) { omitidos++; if (!OMITIDOS.has(f)) console.log('  o ' + nombre + '.' + f + ' no transcrito en el documento'); }
    console.log('  ok ' + nombre + ' (' + n + ' campos)');
  }
}

console.log('');
console.log('=== CLAVES JSON · bloques json del documento vs respuestas medidas ===');
const medidos = new Set();
let faltan = 0;
for (const [f, que] of MUESTRAS) {
  const p = R + 'pruebas/' + f;
  if (!fs.existsSync(p)) { console.log('  aviso: falta la muestra ' + f + ' (' + que + ')'); faltan++; continue; }
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const walk = (x) => {
    if (Array.isArray(x)) return x.forEach(walk);
    if (x && typeof x === 'object') Object.keys(x).forEach((k) => { medidos.add(k); walk(x[k]); });
  };
  walk(j.data || j);
}
const claves = new Set();
for (const b of bloques(doc, 'json')) {
  try {
    const walk = (x) => {
      if (Array.isArray(x)) return x.forEach(walk);
      if (x && typeof x === 'object') Object.keys(x).forEach((k) => { claves.add(k); walk(x[k]); });
    };
    walk(JSON.parse(b));
  } catch (e) { console.log('  X bloque json invalido: ' + e.message); errores++; }
}
let noMedidas = 0;
if (faltan > 0) {
  // Si falta CUALQUIERA de las muestras, no se compara: una clave que vive en la muestra que
  // falta aparecería como «inventada» y el fallo sería de la puerta, no del documento.
  console.log('  (faltan ' + faltan + ' de ' + MUESTRAS.length + ' muestras locales: se omite la comparacion)');
  console.log('  (se regeneran con los curl del apartado 4 del documento)');
} else {
  for (const k of claves) if (!medidos.has(k)) { console.log('  X clave NO medida en el servidor: ' + k); noMedidas++; }
  console.log('  claves del documento: ' + claves.size + ' · no medidas: ' + noMedidas);
}

console.log('');
console.log('campos de tipo comprobados: ' + comprobados + ' · no transcritos: ' + omitidos + ' · valores: ' + alias);
console.log(errores + noMedidas === 0 ? 'CONTRATO: OK — nada inventado' : 'CONTRATO: ' + (errores + noMedidas) + ' problema(s)');
process.exit(errores + noMedidas === 0 ? 0 : 1);
