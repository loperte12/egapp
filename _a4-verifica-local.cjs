// Puerta local de A-4. NO sustituye a `tsc` en el servidor (que es el que compila de verdad):
// comprueba lo que ESE tsc no puede decir — que los tres ficheros PARSEAN, que no hay un backtick
// dentro de un template literal, y que el censo de la regla del plazo es el que se decidió.
//
// La lección del fallo 48 manda aquí: una regla se censa por su EFECTO. Da igual cómo se llame la
// función; lo que se cuenta es cuántos sitios pueden equivocarse a mano.
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
const cnt = (re) => (todo.match(re) || []).length;
const cntEn = (f, re) => (fuentes[f].match(re) || []).length;

console.log('\n=== 2) Backtick prohibido dentro de un comentario SQL ===');
const conBacktick = [];
for (const f of ficheros) {
  fuentes[f].split('\n').forEach((l, i) => { if (/^\s*--.*`/.test(l)) conBacktick.push(`${f}:${i + 1}`); });
}
di(conBacktick.length === 0, `comentarios SQL con backtick: ${conBacktick.length} ${conBacktick.join(', ')}`);

console.log('\n=== 3) LH-08 · LA REGLA DEL PLAZO (censo por EFECTO) ===');
// Los sitios, contados a mano UNA vez y comprobados por el guion: 3 con el alias `r`
// (disponibilidad, búsqueda y la creación) + 2 con el alias `r2` (el día del hotelero y el panel).
di(cnt(/\(r\.status NOT IN \('hold','pending'\) OR r\.hold_expires_at IS NULL OR r\.hold_expires_at > now\(\)\)/g) === 3,
  `SQL con la regla nueva y alias r: ${cnt(/\(r\.status NOT IN \('hold','pending'\) OR r\.hold_expires_at IS NULL OR r\.hold_expires_at > now\(\)\)/g)} (esperado 3)`);
di(cnt(/\(r2\.status NOT IN \('hold','pending'\) OR r2\.hold_expires_at IS NULL OR r2\.hold_expires_at > now\(\)\)/g) === 2,
  `SQL con la regla nueva y alias r2: ${cnt(/\(r2\.status NOT IN \('hold','pending'\) OR r2\.hold_expires_at IS NULL OR r2\.hold_expires_at > now\(\)\)/g)} (esperado 2)`);
di(cnt(/status <> 'hold' OR/g) === 0, `restos de la regla vieja (solo miraba hold): ${cnt(/status <> 'hold' OR/g)} (tiene que ser 0)`);
di(cnt(/new Date\(r\.hold_expires_at\)\.getTime\(\) <= Date\.now\(\)/g) === 0,
  `guardas escritas a mano con la fecha: ${cnt(/new Date\(r\.hold_expires_at\)\.getTime\(\) <= Date\.now\(\)/g)} (tiene que ser 0)`);
// Los recuentos se hacen SIN comentarios —ni de JavaScript ni de SQL—: nombrar la regla en un
// comentario no es aplicarla. (Los `--` viven dentro de los templates de $queryRaw, así que
// tampoco los quita el stripper de JS.)
const codigo = ficheros.map((f) => fuentes[f]
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/[^\n]*/g, '')
  .replace(/^\s*--[^\n]*/gm, '')).join('\n');
const cntCod = (re) => (codigo.match(re) || []).length;
di(cntCod(/plazoVencido\(/g) === 6, `llamadas a plazoVencido( en CODIGO: ${cntCod(/plazoVencido\(/g)} (1 definicion + 1 dentro de ocupaInventario + 4 guardas)`);
di(cntEn('hotel.service.ts', /export function plazoVencido\(/g) === 1, 'plazoVencido se DEFINE una sola vez');
di(cntEn('hotel.service.ts', /export const ESTADOS_QUE_OCUPAN/g) === 1, 'la lista de estados que ocupan se declara una sola vez');
di(cnt(/ocupaInventario\(/g) === 2, `menciones de ocupaInventario(: ${cnt(/ocupaInventario\(/g)} (definicion + la forma de la reserva)`);
di(cnt(/\['hold', 'pending', 'confirmed', 'checked_in'\]/g) === 1,
  `listas de ocupacion escritas a mano: ${cnt(/\['hold', 'pending', 'confirmed', 'checked_in'\]/g)} (tiene que ser 1: la de hotel.service)`);
di(cnt(/import \{ ESTADOS_QUE_OCUPAN, LifebookHotelService, plazoVencido \}/g) === 1, 'el panel IMPORTA la lista y la regla');
di(cnt(/const OCUPAN = \[\.\.\.ESTADOS_QUE_OCUPAN\];/g) === 1, 'el panel deriva su OCUPAN de la lista unica');
di(cnt(/@Cron\('\*\/15 \* \* \* \*'\)/g) === 1, `barrido programado: ${cnt(/@Cron\(/g)} @Cron en el modulo (esperado 1)`);

console.log('\n=== 4) LH-07 · el reloj: se espera a lo que de verdad falta ===');
di(/const esperaDinero = haySenal && method !== 'likebook_wallet';/.test(fuentes['reservations.service.ts']),
  'con el monedero NO se espera dinero (se espera la confirmacion del hotel)');
di(/Number\(rt\.confirmation_hours \?\? 24\) \* 60/.test(fuentes['reservations.service.ts']), 'el plazo del hotel se mide en minutos igual que el de la transferencia');
di(cnt(/const holdExpires = `now\(\) \+ interval '\$\{holdMin\} minutes'`;/g) === 1, 'una sola formula de caducidad');
di(cnt(/El hotel no confirmó dentro de su plazo/g) === 1, 'el motivo del barrido distingue QUÉ se esperaba');
di(/\(payment_status IN \('pending','proof_submitted'\)\n\s+-- Parche 99/.test(fuentes['reservations.service.ts']) === false,
  'el barrido ya no filtra por payment_status (no deja reservas en el limbo)');

console.log('\n=== 5) LH-02 · confirmar exige dinero, en las DOS puertas ===');
di(cntEn('reservations.service.ts', /accion === 'confirm' && Number\(r\.deposit_xaf\) > 0/g) === 1, 'la app: confirm exige la senal');
di(cntEn('hotel-merchant.service.ts', /accion === 'confirm' && Number\(r\.deposit_xaf\) > 0/g) === 1, 'el panel: confirm exige la senal');
di(cntCod(/!\['deposit_paid', 'paid'\]\.includes\(String\(r\.payment_status\)\)/g) === 2, 'las dos puertas usan la misma condicion');

console.log('\n=== 6) LH-09 · el cerrojo no se reutiliza ===');
di(cnt(/idempotencyKey: `lb-hotel:\$\{key\}:\$\{intento\}`/g) === 1, 'la clave del cerrojo lleva el nonce del intento');
di(cnt(/lb-hotel:\$\{key\}`/g) === 0, 'no queda la clave vieja sin nonce');

console.log('\n=== 7) LH-10 · la liberacion deja marca y se reintenta ===');
di(cnt(/paid_at = COALESCE\(paid_at, now\(\)\)/g) === 1, 'al liberar se escribe la marca `paid_at`');
di(cnt(/async reconciliarMonedero\(limit = 25\)/g) === 1, 'existe el reintento');
di(cnt(/await this\.reconciliarMonedero\(\);/g) === 1, 'y lo llama el barrido');
di(cntCod(/LIQUIDACION_PENDIENTE/g) === 2, 'los dos fallos de liquidacion quedan marcados en el log');
di(/AND paid_at IS NULL AND status IN \('checked_in', 'no_show'\)/.test(fuentes['reservations.service.ts']),
  'la liberacion pendiente se localiza por `paid_at` vacio (sin valor nuevo de payment_status)');

console.log('\n=== 8) LH-12 · un cuerpo invalido no borra las fotos ===');
di(/if \(v !== undefined && !Array\.isArray\(v\)\) \{\n\s+throw new DomainError\('IMAGE_INVALID'/.test(fuentes['hotel.service.ts']),
  'images() rechaza lo que no es lista (ausente sigue significando «no se toca»)');

console.log('\n=== 9) LH-05 · la preseleccion es reproducible ===');
di(/SELECT method FROM lifebook\.shop_payment_methods\n\s+WHERE shop_id = \$\{r\.shop_id\}::uuid AND status = 'active'\n\s+ORDER BY method/.test(fuentes['hotel.service.ts']),
  'la consulta de metodos lleva ORDER BY');

console.log(`\n=== RESULTADO: ${fallos === 0 ? 'TODO OK' : fallos + ' COMPROBACIONES FALLIDAS'} ===`);
process.exit(fallos === 0 ? 0 : 1);
