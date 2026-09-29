// Puerta local de la APP para C-1. NO sustituye a Metro ni al APK: lo que comprueba es lo que esos
// dos callan — que los ficheros PARSEEN (un JSX roto revienta el bundle entero, no una pantalla) y
// que los tokens del sistema de diseño no se hayan escrito a mano.
//
// La lección que la hace falta: al pegar bloques grandes, el error típico no es de tipos, es de
// SINTAXIS (una constante duplicada, una línea unida por un `edit` mal anclado). Eso se ve aquí, en
// dos segundos, y no en un build de cuatro minutos.
const fs = require('fs');
const path = require('path');
const ts = require(path.join('D:/egapp', 'node_modules', 'typescript'));

const ficheros = [
  'api/hotel.ts',
  'components/HotelResultCard.tsx',
  'app/lifebook-hotel-detalle.tsx',
  'app/lifebook-hotel-resena.tsx',
  'app/lifebook-hotel-reservas.tsx',
  'app/lifebook-hotel-valoraciones.tsx',
  'app/lifebook-hotel-gestion.tsx',
];

let fallos = 0;
const di = (ok, txt) => { console.log(`  ${ok ? 'OK  ' : 'FALLA'} ${txt}`); if (!ok) fallos++; };

console.log('=== 1) SINTAXIS (que los siete parseen) ===');
const fuentes = {};
for (const f of ficheros) {
  const src = fs.readFileSync(`D:/egapp/${f}`, 'utf8');
  fuentes[f] = src;
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ES2020, true, ts.ScriptKind.TSX);
  const dd = sf.parseDiagnostics || [];
  const detalle = dd.slice(0, 3).map((d) => `linea ${sf.getLineAndCharacterOfPosition(d.start).line + 1}: ${d.messageText}`).join(' | ');
  di(dd.length === 0, `${f}: ${dd.length === 0 ? 'parsea' : dd.length + ' errores -> ' + detalle}`);
}

console.log('\n=== 2) Paridad de backticks y de llaves ===');
for (const f of ficheros) {
  const bt = (fuentes[f].match(/`/g) || []).length;
  const ab = (fuentes[f].match(/\{/g) || []).length;
  const ce = (fuentes[f].match(/\}/g) || []).length;
  di(bt % 2 === 0, `${f}: ${bt} backticks (${bt % 2 === 0 ? 'par' : 'IMPAR'})`);
  di(ab === ce, `${f}: { ${ab} vs } ${ce} ${ab === ce ? '' : '-> DESCUADRADO'}`);
}

console.log('\n=== 3) Tokens escritos a mano en el codigo NUEVO (familias de la guardia) ===');
const nuevo = ['app/lifebook-hotel-resena.tsx', 'app/lifebook-hotel-valoraciones.tsx'];
for (const f of nuevo) {
  const src = fuentes[f];
  const hex = (src.match(/#[0-9a-fA-F]{3,8}\b/g) || []).filter((h) => h.toUpperCase() !== '#FFFFFF');
  di(hex.length === 0, `${f}: hex fuera de marca blanca: ${hex.join(', ') || 'ninguno'}`);
  // `fontSize:` literal = número; el token siempre es `tipografia.x`.
  const fs2 = (src.match(/fontSize:\s*[0-9]/g) || []).length;
  di(fs2 === 0, `${f}: fontSize literales: ${fs2}`);
  const br = (src.match(/borderRadius:\s*[0-9]/g) || []).length;
  di(br === 0, `${f}: borderRadius literales: ${br}`);
  const bw = (src.match(/borderWidth:\s*[0-9]/g) || []).length;
  di(bw === 0, `${f}: borderWidth literales: ${bw}`);
  const fw = (src.match(/fontWeight:\s*['"]?[0-9]/g) || []).length;
  di(fw === 0, `${f}: fontWeight literales: ${fw}`);
}

console.log('\n=== 4) Lo que C-1 decide, comprobado en el codigo ===');
/** Sin comentarios: nombrar la regla en la prosa no es aplicarla (y al reves: el comentario que
 *  EXPLICA la regla vieja no puede contar como regla vieja). Misma leccion que el acta de A-4. */
const sinComentariosJS = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/[^\n]*/gm, '');
const card = fuentes['components/HotelResultCard.tsx'];
const cardCod = sinComentariosJS(card);
di(/hotel\.ratingPublished[\s\S]{0,120}toFixed\(1\)/.test(cardCod), 'la tarjeta de resultados gatea la cifra por ratingPublished (D6)');
di(!/hotel\.rating\s*\?/.test(cardCod), 'y NO queda la condicion vieja por el valor de rating (D6)');

const det = fuentes['app/lifebook-hotel-detalle.tsx'];
di(/resenas\.publishesRating === true/.test(det), 'la ficha respeta publishesRating del servidor (D2)');
di(/Reseñas \(\$\{resenas\.total\}\)/.test(det), 'la seccion existe y lleva el total');
// D1 reescrita para D8 (28/09): con pestañas ya no hay scrollTo ni yResenas — el toque del chip
// de nota cambia a la pestaña 'resenas'. El ancla es el Pressable del chip ({nota ? (...)}).
di(/\{nota \? \(\s*<Pressable[\s\S]{0,60}setTab\('resenas'\)/.test(det),
  'la nota de la cabecera cambia a la pestana de resenas (D1, reescrita para D8)');
di(/Reseñas\{resenas && resenas\.total > 0/.test(det), 'el boton de la pestana lleva el total (D8)');
di(/useState<'reservar' \| 'resenas' \| 'alojamiento'>\('reservar'\)/.test(det),
  "tres pestanas y la por defecto es 'reservar', donde se decide la compra (D8)");
const iReservar = det.indexOf("onPress={() => setTab('reservar')}");
const iResenas = det.indexOf("onPress={() => setTab('resenas')}");
const iAlojamiento = det.indexOf("onPress={() => setTab('alojamiento')}");
di(iReservar > 0 && iResenas > iReservar && iAlojamiento > iResenas,
  'las pestanas van en orden: Habitaciones -> Resenas -> El alojamiento (D8)');
di(/colors\.text\.warning/.test(det) && /fill=\{nota\.publica \? colors\.text\.warning : 'transparent'\}/.test(det),
  'la estrella usa colors.text.warning y se rellena solo si la nota se publica (D3)');

const res = fuentes['app/lifebook-hotel-reservas.tsx'];
di(/r\.status === 'checked_out'/.test(res) && /r\.reviewId \?/.test(res), 'la puerta de valorar es la estancia terminada y sin reseña (D4)');
di(/hotelApi\.deleteReview/.test(res), 'se puede borrar la propia reseña');
di(/useFocusEffect/.test(res), 'la lista se refresca al volver de valorar');
di(!/dias > 7|7 \* 86|reviewWindow/.test(res), 'la app NO duplica la regla de los 7 dias (la cierra el servidor)');

const val = fuentes['app/lifebook-hotel-valoraciones.tsx'];
di(/hotelApi\.reviews\(id, \{ limit: 50 \}\)/.test(val), 'el panel del hotelero REUSA la ruta publica (D5)');
di(/sinResponder/.test(val) && /respondidas/.test(val), 'las que no tienen respuesta van primero (D5)');
di(/hotelApi\.replyReview/.test(val), 'se responde con la ruta de la respuesta');

console.log('\n=== 5) La ruta nueva esta declarada ===');
di(fs.existsSync('D:/egapp/app/lifebook-hotel-resena.tsx'), 'existe app/lifebook-hotel-resena.tsx');
di(/lifebook-hotel-resena/.test(res), 'y «Mis reservas» navega a ella con la reserva delante');
di(/lifebook-hotel-valoraciones/.test(fuentes['app/lifebook-hotel-gestion.tsx']), 'y el menu del hotelero enlaza las valoraciones');

console.log(`\n=== RESULTADO: ${fallos === 0 ? 'TODO OK' : fallos + ' COMPROBACIONES FALLIDAS'} ===`);
process.exit(fallos === 0 ? 0 : 1);
