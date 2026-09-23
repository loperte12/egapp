// Se comprueba la geometria con las medidas reales de las pastillas de la app.
// w = ancho (se prueban varias etiquetas), h = alto = fontSize(caption=12) + 2*7 de relleno + 2*1 de borde
const h = 12 * 1.32 + 14 + 2;   // ~31.8 px, altura tipica del texto mas el relleno
const casos = [58, 78, 100, 120, 140]; // "Todo", "Novedades", "Especiales", "Recomendado", "Mejor valorados"
console.log('alto de la pastilla: ' + h.toFixed(1) + ' px');
console.log('');
console.log(' ancho | diametro | hundido | sobra arriba | crece desde | cubre las esquinas?');
let todoBien = true;
for (const w of casos) {
  const R = ((w * w) / 4 + h * h) / (2 * h);
  const D = Math.ceil(2 * R) + 2;
  const delta = Math.ceil(R - Math.sqrt(Math.max(0, R * R - (w * w) / 4))) + 1;
  const creceDesde = D - delta;          // distancia desde el borde inferior del circulo
  const sobraArriba = creceDesde - h;    // cuanto sobresale por encima de la pastilla
  const cubre = creceDesde >= h;          // el arco debe llegar por encima de la pastilla
  if (!cubre) todoBien = false;
  console.log(
    String(w).padStart(6) + ' |' + String(D).padStart(9) + ' |' + String(delta).padStart(8) + ' |' +
    String(sobraArriba).padStart(13) + ' |' + String(creceDesde).padStart(12) + ' |' + (cubre ? '  SI' : '  NO')
  );
}
console.log('');
console.log(todoBien
  ? 'RESULTADO: en todos los anchos el circulo cubre la pastilla entera al llenarse.'
  : 'RESULTADO: HAY UN CASO EN EL QUE NO CUBRE. Hay que revisar la formula.');
