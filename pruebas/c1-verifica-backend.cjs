// Puerta local del backend de C-1 (§15.3 · `hasReview`). NO sustituye al `tsc` del servidor:
// comprueba lo que ese tsc no puede decir — que los ficheros PARSEAN, que no hay backtick dentro de
// un comentario SQL, que el LEFT JOIN de la reseña entra en las DOS consultas del huésped (y en
// ninguna más), y que la paridad de backticks cuadra (la regla del codemod).
const fs = require('fs');
const path = require('path');
const ts = require(path.join('D:/egapp', 'node_modules', 'typescript'));

const DIR = 'D:/egapp/backend/server-src/lifebook';
const ficheros = ['reservations.service.ts', 'hotel.service.ts', 'hotel.controller.ts', 'dto/hotel-reservation.dto.ts'];

let fallos = 0;
const di = (ok, txt) => { console.log(`  ${ok ? 'OK  ' : 'FALLA'} ${txt}`); if (!ok) fallos++; };

console.log('=== 1) SINTAXIS (que los cuatro parseen) ===');
const fuentes = {};
for (const f of ficheros) {
  const src = fs.readFileSync(`${DIR}/${f}`, 'utf8');
  fuentes[f] = src;
  const sf = ts.createSourceFile(f, src, ts.ScriptTarget.ES2020, true);
  const dd = sf.parseDiagnostics || [];
  const detalle = dd.slice(0, 2).map((d) => `linea ${sf.getLineAndCharacterOfPosition(d.start).line + 1}: ${d.messageText}`).join(' | ');
  di(dd.length === 0, `${f}: ${dd.length === 0 ? 'parsea' : dd.length + ' errores -> ' + detalle}`);
}

console.log('\n=== 2) Backtick prohibido dentro de un comentario SQL ===');
const conBacktick = [];
for (const f of ficheros) {
  fuentes[f].split('\n').forEach((l, i) => { if (/^\s*--.*`/.test(l)) conBacktick.push(`${f}:${i + 1}`); });
}
di(conBacktick.length === 0, `comentarios SQL con backtick: ${conBacktick.length} ${conBacktick.join(', ')}`);

console.log('\n=== 3) Paridad de backticks (regla del codemod) ===');
for (const f of ficheros) {
  const n = (fuentes[f].match(/`/g) || []).length;
  di(n % 2 === 0, `${f}: ${n} backticks (${n % 2 === 0 ? 'par' : 'IMPAR'})`);
}

const rs = fuentes['reservations.service.ts'];
const hs = fuentes['hotel.service.ts'];
const cnt = (src, re) => (src.match(re) || []).length;

console.log('\n=== 4) §15.3 · la reseña entra en las DOS consultas del huésped, y solo en ellas ===');
di(cnt(rs, /LEFT JOIN lifebook\.hotel_reviews rv ON rv\.reservation_id = r\.id/g) === 2,
  `LEFT JOIN a hotel_reviews: ${cnt(rs, /LEFT JOIN lifebook\.hotel_reviews rv ON rv\.reservation_id = r\.id/g)} (esperado 2: loadForViewer + myReservations del huesped)`);
di(cnt(rs, /rv\.id AS review_id/g) === 2,
  `columnas review_id seleccionadas: ${cnt(rs, /rv\.id AS review_id/g)} (esperado 2)`);
di(cnt(rs, /reviewId: roles\.esHuesped \? r\.review_id \?\? null : null/g) === 1,
  `reviewId en shape(): ${cnt(rs, /reviewId: roles\.esHuesped \? r\.review_id \?\? null : null/g)} (esperado 1, y solo para el huesped)`);
// El hotel NO lo recibe: si alguien lo suelta para todos, esta linea lo caza.
di(cnt(rs, /reviewId: r\.review_id \?\? null/g) === 0, 'nadie expone reviewId sin la puerta del huesped');

console.log('\n=== 5) Las cuatro operaciones de la resena siguen en su sitio (C-1 backend) ===');
for (const m of ['reviewsOfHotel', 'createReview', 'replyReview', 'deleteReview']) {
  di(cnt(hs, new RegExp(`async ${m}\\(`, 'g')) === 1, `${m} definido una sola vez`);
}
di(cnt(hs, /REVIEWS_THRESHOLD = 3/g) === 1, `REVIEWS_THRESHOLD = 3 declarado una vez: ${cnt(hs, /REVIEWS_THRESHOLD = 3/g)}`);
di(cnt(hs, /notaPublicada\(/g) >= 5, `usos de notaPublicada(: ${cnt(hs, /notaPublicada\(/g)}`);
di(cnt(hs, /ON CONFLICT \(shop_id\) DO UPDATE/g) === 2,
  `ON CONFLICT (shop_id) DO UPDATE: ${cnt(hs, /ON CONFLICT \(shop_id\) DO UPDATE/g)} (esperado 2: el del espejo de resenas + el que ya tenia la ficha del hotel)`);
di(cnt(hs, /includes\('uq_lb_reviews_reserva'\)/g) === 1,
  `el 23505 se atribuye por el nombre de la restriccion en CODIGO: ${cnt(hs, /includes\('uq_lb_reviews_reserva'\)/g)} (la otra mencion es un comentario)`);

console.log(`\n=== RESULTADO: ${fallos === 0 ? 'TODO OK' : fallos + ' COMPROBACIONES FALLIDAS'} ===`);
process.exit(fallos === 0 ? 0 : 1);
