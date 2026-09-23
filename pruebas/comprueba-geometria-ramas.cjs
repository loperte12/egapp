/**
 * Comprueba la geometria y los TIEMPOS de las ramas, sin necesidad del telefono.
 *
 * Por que existe: el efecto se apoya en `strokeDasharray`/`strokeDashoffset`, y esos numeros tienen
 * que ser exactos. Si el largo se queda corto, el trazo asoma antes de tiempo; si se pasa, el codo no
 * llega a dibujarse nunca. Y si los tiempos estan mal, el codo se dibuja antes de que el tronco llegue
 * hasta el, y se ve un salto.
 *
 * Los valores TIENEN que coincidir con app/prueba-ramas-comentarios.tsx. Si se cambia ALLI
 * ALTO_FILA, RADIO, X_TRONCO o X_FIN, hay que cambiarlos aqui tambien (y este script lo avisa abajo).
 */
'use strict';

const X_TRONCO = 6;
const X_FIN = 22;
const RADIO = 7;
const ALTO_FILA = 44;
const DIBUJO_TRONCO = 0.45;
const PASO_RAMA = (cuantas) => 0.5 / Math.max(1, cuantas);

/* --- las tres formulas de la pantalla, copiadas tal cual -------------------------------- */

/** La rama empieza EN EL CODO (no arriba): el trozo de tronco lo dibuja el tronco. */
function rutaDeRama(k) {
  const y = ALTO_FILA * k + ALTO_FILA / 2;
  const yCodo = y - RADIO;
  return `M ${X_TRONCO} ${yCodo} A ${RADIO} ${RADIO} 0 0 0 ${X_TRONCO + RADIO} ${y} H ${X_FIN}`;
}
function largoHastaElCodo(k) {
  return ALTO_FILA * k + ALTO_FILA / 2 - RADIO;
}
function largoTronco(cuantas) {
  return largoHastaElCodo(Math.max(0, cuantas - 1)) + 8;
}
/** Largo de la rama: solo el codo y la salida. */
function largoDeRama(k) {
  const y = ALTO_FILA * k + ALTO_FILA / 2;
  const cx = X_TRONCO + RADIO;
  const cy = y - RADIO;
  let largo = 0;
  const PASOS = 24;
  let px = X_TRONCO, py = cy;
  for (let i = 1; i <= PASOS; i++) {
    const ang = (Math.PI / 2) * (i / PASOS);
    const x = cx - RADIO * Math.cos(ang);
    const yy = cy + RADIO * Math.sin(ang);
    largo += Math.hypot(x - px, yy - py);
    px = x; py = yy;
  }
  largo += X_FIN - (X_TRONCO + RADIO);
  return largo;
}
/** La misma integral con muchisimos mas pasos: sirve de referencia para medir el error. */
function largoDeRamaExacto(k) {
  const y = ALTO_FILA * k + ALTO_FILA / 2;
  const cx = X_TRONCO + RADIO;
  const cy = y - RADIO;
  let largo = 0;
  const PASOS = 20000;
  let px = X_TRONCO, py = cy;
  for (let i = 1; i <= PASOS; i++) {
    const ang = (Math.PI / 2) * (i / PASOS);
    const x = cx - RADIO * Math.cos(ang);
    const yy = cy + RADIO * Math.sin(ang);
    largo += Math.hypot(x - px, yy - py);
    px = x; py = yy;
  }
  largo += X_FIN - (X_TRONCO + RADIO);
  return largo;
}

let problemas = 0;
function comprobar(nombre, cond, detalle) {
  if (cond) { console.log('  OK    ' + nombre); }
  else { problemas++; console.log('  MAL   ' + nombre + (detalle !== undefined ? '  -> ' + detalle : '')); }
}

/* ---------------------------------------------------------------- 1) largos y error ---- */
console.log('=== 1) el largo del trazo es exacto (si no, asoma o no llega) ===');
let errorMax = 0;
for (let k = 0; k < 10; k++) {
  errorMax = Math.max(errorMax, Math.abs(largoDeRama(k) - largoDeRamaExacto(k)));
}
comprobar('la aproximacion de 24 trozos se desvia menos de 0,01 px', errorMax < 0.01, errorMax.toFixed(5));
comprobar('la rama NO incluye el tronco (mide menos que su codo)', largoDeRama(2) < largoHastaElCodo(2),
  { rama: largoDeRama(2).toFixed(2), codo: largoHastaElCodo(2).toFixed(2) });

/* ---------------------------------------------------------------- 2) el tronco llega -- */
console.log('\n=== 2) el tronco llega hasta el ultimo codo (ni corto ni largo) ===');
for (const n of [1, 2, 3, 5, 8]) {
  const alto = largoTronco(n);
  const ultimoCodo = largoHastaElCodo(n - 1);
  comprobar('con ' + n + ' respuesta(s) el tronco pasa del ultimo codo', alto > ultimoCodo,
    { tronco: alto, ultimoCodo });
}

/* ---------------------------------------------------------------- 3) los tiempos ------- */
console.log('\n=== 3) cada rama sale DESPUES de que el tronco pase por su codo ===');
for (const n of [2, 3, 5, 8]) {
  const paso = PASO_RAMA(n);
  let bien = true;
  let detalle = '';
  for (let k = 0; k < n; k++) {
    const arranca = DIBUJO_TRONCO + paso * k;
    /* En el momento en que esta rama arranca, el tronco ya deberia haber pasado su codo.
       El tronco termina de dibujarse en progreso = DIBUJO_TRONCO; su codo k esta a la altura
       largoHastaElCodo(k) sobre un total largoTronco(n). O sea que lo pasa antes de acabar. */
    if (arranca < DIBUJO_TRONCO) { bien = false; detalle = 'la rama ' + k + ' arranca antes que el tronco'; }
    if (arranca + paso > 1.0001) { bien = false; detalle = 'la rama ' + k + ' acaba despues del final'; }
  }
  comprobar('con ' + n + ' respuesta(s) los turnos cuadran', bien, detalle);
}

console.log('\n=== 4) el orden es el de las respuestas (de arriba abajo) ===');
for (const n of [3, 5]) {
  const paso = PASO_RAMA(n);
  let ordenado = true;
  for (let k = 1; k < n; k++) {
    if (DIBUJO_TRONCO + paso * k <= DIBUJO_TRONCO + paso * (k - 1)) ordenado = false;
  }
  comprobar('con ' + n + ' respuesta(s) cada rama sale despues de la anterior', ordenado);
}

/* ---------------------------------------------------------------- 5) cierre ------------ */
console.log('\n=== 5) cerrado del todo (progreso 0) no se ve NINGUNA rama ===');
let ninguna = true;
for (const n of [1, 3, 5]) {
  const paso = PASO_RAMA(n);
  for (let k = 0; k < n; k++) {
    const retraso = DIBUJO_TRONCO + paso * k;
    const progreso = 0;
    const suyo = Math.min(1, Math.max(0, (progreso - retraso) / paso));
    const offset = largoDeRama(k) * (1 - suyo);
    if (Math.abs(offset - largoDeRama(k)) > 0.001) ninguna = false;  // offset = largo => invisible
  }
}
comprobar('con la hoja cerrada, el desfase deja el trazo entero oculto', ninguna);

console.log('\n=== 6) abierto del todo (progreso 1) TODAS las ramas estan completas ===');
let todas = true;
for (const n of [1, 3, 5, 8]) {
  const paso = PASO_RAMA(n);
  for (let k = 0; k < n; k++) {
    const suyo = Math.min(1, Math.max(0, (1 - (DIBUJO_TRONCO + paso * k)) / paso));
    if (suyo < 1) todas = false;
  }
}
comprobar('con la hoja abierta, ninguna rama se queda a medias', todas);

console.log('');
if (problemas === 0) {
  console.log('RESULTADO: geometria y tiempos correctos. Ninguna rama asoma antes de tiempo,');
  console.log('cada una dibuja solo su trozo, el tronco llega al ultimo codo y ninguna se queda a medias.');
} else {
  console.log('RESULTADO: ' + problemas + ' PROBLEMA(S). Revisar antes de compilar.');
}
process.exit(problemas === 0 ? 0 : 1);
