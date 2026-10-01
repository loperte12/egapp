// Puerta local de A-3. No sustituye a `tsc` en el servidor: comprueba dos cosas que ESE
// tsc no puede decir — que los tres ficheros PARSEAN (un backtick suelto dentro de un
// $queryRaw cierra el template literal y deja el fichero invalido) y que el parche es el
// que se decidio, contado.
const fs = require('fs');
const path = require('path');
const ts = require(path.join('D:/egapp', 'node_modules', 'typescript'));

const DIR = 'D:/egapp/backend/server-src/lifebook';
const ficheros = ['hotel.service.ts', 'reservations.service.ts', 'hotel-merchant.service.ts'];

let fallos = 0;
const di = (ok, txt) => { console.log(`  ${ok ? 'OK  ' : 'FALLA'} ${txt}`); if (!ok) fallos++; };

console.log('=== 1) SINTAXIS (que los tres parseen) ===');
const fuentes = {};
for (const f of ficheros) {
  const src = fs.readFileSync(`${DIR}/${f}`, 'utf8');
  fuentes[f] = src;
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ES2020, true);
  const dd = sf.parseDiagnostics || [];
  const detalle = dd.slice(0, 2).map((d) => `linea ${sf.getLineAndCharacterOfPosition(d.start).line + 1}: ${d.messageText}`).join(' | ');
  di(dd.length === 0, `${f}: ${dd.length === 0 ? 'parsea' : dd.length + ' errores -> ' + detalle}`);
}

const todo = ficheros.map((f) => fuentes[f]).join('\n');
const cuenta = (re) => (todo.match(re) || []).length;

console.log('\n=== 2) Backtick prohibido dentro de un $queryRaw ===');
const conBacktick = [];
for (const f of ficheros) {
  fuentes[f].split('\n').forEach((l, i) => { if (/^\s*--.*`/.test(l)) conBacktick.push(`${f}:${i + 1}`); });
}
di(conBacktick.length === 0, `comentarios SQL con backtick: ${conBacktick.length} ${conBacktick.join(', ')}`);

console.log('\n=== 3) LH-13 · el corte ya no es una constante en UTC ===');
const sinComentarios = todo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
di(!/T14:00:00Z/.test(sinComentarios), `"T14:00:00Z" en CODIGO: ${(sinComentarios.match(/T14:00:00Z/g) || []).length} (tiene que ser 0)`);
di(/T\$\{hora\}:00\+01:00/.test(fuentes['hotel.service.ts']), 'el corte lleva el desfase +01:00 de Malabo');
const calculan = (todo.match(/new Date\(entrada\.getTime\(\) - horas \* 3_600_000\)/g) || []).length;
di(calculan === 1, `formulas que CALCULAN el corte: ${calculan} (tiene que ser 1: la de hotel.service)`);
di(/return this\.h\.freeCancellationUntil\(r\);/.test(fuentes['reservations.service.ts']), 'reservations delega, no recalcula');
di(/\bpublic\b|\n  freeCancellationUntil\(r: any\)/.test(fuentes['hotel.service.ts']), 'hotel.service expone freeCancellationUntil');

console.log('\n=== 4) LH-06 · la lista de cancelables es UNA ===');
di(/export const CANCELABLES: string\[\] = \['hold', 'pending', 'confirmed'\];/.test(fuentes['reservations.service.ts']), 'CANCELABLES declarada una sola vez');
di(/cancel: CANCELABLES,/.test(fuentes['reservations.service.ts']), 'permitido.cancel la usa');
di(/cancel: CANCELABLES,/.test(fuentes['hotel-merchant.service.ts']), 'DESDE.cancel la usa');
di(/import \{ CANCELABLES, LifebookReservationsService \}/.test(fuentes['hotel-merchant.service.ts']), 'el panel la IMPORTA, no la copia');
di((fuentes['reservations.service.ts'].match(/CANCELABLES\.includes/g) || []).length === 1, 'canCancel la lee');
// Una lista de CANCELACION no puede traer `checked_in`. Se miran SOLO las lineas que
// declaran una lista `cancel:` (las demas menciones —el mapa accion→estado, la lista de
// estados validos de un filtro, un SELECT— tienen las dos palabras y no son la regla).
const listasCancel = [];
for (const f of ficheros) {
  fuentes[f].split('\n').forEach((l, i) => {
    if (/^\s*(\/\/|\*|--)/.test(l)) return;
    if (!/\bcancel\s*:\s*\[/.test(l) && !/cancel:\s*CANCELABLES/.test(l)) return;
    if (/checked_in/.test(l)) listasCancel.push(`${f}:${i + 1} ${l.trim()}`);
  });
}
di(listasCancel.length === 0, `listas de CANCELACION con checked_in: ${listasCancel.length} ${listasCancel.join(' | ')}`);
di(/cancel: CANCELABLES,/.test(fuentes['reservations.service.ts']) && /cancel: CANCELABLES,/.test(fuentes['hotel-merchant.service.ts']),
  'las dos listas de cancelacion son la constante (ninguna escrita a mano)');

console.log('\n=== 5) LH-01 · las dos puertas liquidan por el mismo sitio ===');
const definiciones = (todo.match(/async liquidarMonedero\(/g) || []).length;
di(definiciones === 1, `"async liquidarMonedero" definido ${definiciones} vez (esperado 1)`);
di(/await this\.liquidarMonedero\(r\.id, accion\);/.test(fuentes['reservations.service.ts']), 'la APP (action) liquida por ahi');
di(/await this\.reservas\.liquidarMonedero\(r\.id, accion\);/.test(fuentes['hotel-merchant.service.ts']), 'el PANEL (updateReservationStatus) tambien');
di((todo.match(/liberarSiMonederoHotel\(r\.id\)/g) || []).length === 0, 'ya no hay llamadas sueltas al helper privado');

console.log('\n=== 6) Las consultas traen las dos columnas (1 previa + las nuevas) ===');
const esperado = [
  ['reservations.service.ts', /rt\.cancellation_hours AS cancellation_hours/g, 6],
  ['reservations.service.ts', /hp\.checkin_from AS checkin_from/g, 6],
  ['reservations.service.ts', /LEFT JOIN lifebook\.hotel_profiles hp ON hp\.shop_id = r\.shop_id/g, 6],
  ['hotel-merchant.service.ts', /hp\.checkin_from AS checkin_from/g, 1],
  ['hotel-merchant.service.ts', /LEFT JOIN lifebook\.hotel_profiles hp ON hp\.shop_id = r\.shop_id/g, 2],
];
for (const [f, re, n] of esperado) {
  const c = (fuentes[f].match(re) || []).length;
  di(c === n, `${f}  ${re.source.slice(0, 40)}  ->  ${c} (esperado ${n})`);
}
di(/rt\.cancellation_hours,\n/.test(fuentes['hotel-merchant.service.ts']), 'el detalle del panel pide cancellation_hours');

console.log(`\nRESULTADO: ${fallos === 0 ? 'OK — el parche parsea y es el que se decidio' : `${fallos} comprobacion(es) FALLIDA(S)`}`);
process.exit(fallos === 0 ? 0 : 1);
