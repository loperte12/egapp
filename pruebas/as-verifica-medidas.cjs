// AS-19 · Verifica que las medidas citadas en el informe de comparacion existen
// de verdad en los volcados de uiautomator. Sin esto, el informe seria "creo que medi".
// Uso: node pruebas\as-verifica-medidas.cjs
'use strict';
const fs = require('fs');
const D = 'D:\\egapp\\.auditoria-servicios\\';

const leer = (f) => fs.readFileSync(D + f, 'utf8');

// [fichero, texto o etiqueta que debe aparecer, medida "AxB" que debe acompanarla, descripcion]
const casos = [
  ['dump-mercado-home.xml', 'Mercado', null, 'home del Mercado abierta'],
  ['dump-ficha-producto.xml', '6.500 XAF', '984x108', 'precio como texto mas grande de la ficha'],
  ['dump-ficha-producto.xml', 'Garantía EG Route Plan de 7 días', '846x155', 'bloque de garantia en la ficha'],
  ['dump-ficha-producto.xml', 'Nuevo en EG · sin valoraciones todavía', '642x96', 'vendedor nuevo sin senales'],
  ['dump-ficha-producto.xml', 'Añadir al carrito', '326x145', 'accion carrito'],
  ['dump-ficha-producto.xml', 'Comprar por 6.500 XAF', '302x203', 'accion comprar'],
  ['dump-ficha-producto.xml', 'Escribir por WhatsApp', '157x138', 'accion WhatsApp'],
  ['dump-ficha-producto.xml', 'Añadir a favoritos', '121x110', 'accion favorito'],
  ['dump-ficha-producto.xml', '1/1', null, 'una sola foto en el carrusel'],
  ['dump-mercado-home.xml', 'Garantía de 7 días en pedidos por Ecomerse', '1080x96', 'franja de garantia a sangre'],
  ['dump-mercado-home.xml', 'Buscar por foto', '54x54', 'lupa de busqueda por foto'],
  ['dump-mercado-home.xml', 'Ver todas (21)', null, 'contador de categorias'],
  ['dump-inicio-servicios.xml', 'Mercado. Mantén pulsado para cambiar de perfil', '240x281', 'Mercado en la fila secundaria'],
  ['dump-inicio-servicios.xml', 'Comida Rápida. Mantén pulsado para cambiar de perfil', '240x281', 'Comida con el MISMO tamano que Mercado'],
  ['dump-inicio-servicios.xml', 'Llamar Taxi', '240x281', 'primario con el mismo tamano (la jerarquia no se ve)'],
  ['dump-mercado-feed.xml', 'Producto cuota 5', '471x472', 'tarjeta del feed de 2 columnas'],
  ['dump-mercado-feed.xml', 'Añadir Producto cuota 5 al carrito', '211x81', 'boton Anadir de la tarjeta'],
];

let fallos = 0, ok = 0;
for (const [f, texto, medida, desc] of casos) {
  let xml;
  try { xml = leer(f); } catch { console.log(`FALTA FICHERO ${f}`); fallos++; continue; }
  // los nodos son <node ... text="..." ... bounds="[x,y][x,y]">
  const nodos = xml.split('<node').filter((n) => n.includes(texto));
  if (!nodos.length) {
    console.log(`NO ENCONTRADO  "${texto}" en ${f}  (${desc})`);
    fallos++; continue;
  }
  if (!medida) { console.log(`ok  ${f}  "${texto.slice(0, 42)}"  ${desc}`); ok++; continue; }
  const tiene = nodos.some((n) => {
    const b = /bounds="\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]"/.exec(n);
    if (!b) return false;
    const w = Number(b[3]) - Number(b[1]), h = Number(b[4]) - Number(b[2]);
    return `${w}x${h}` === medida;
  });
  if (tiene) { console.log(`ok  ${f}  "${texto.slice(0, 42)}" = ${medida}  ${desc}`); ok++; }
  else {
    const real = nodos.map((n) => { const b = /bounds="\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]"/.exec(n); return b ? `${Number(b[3]) - Number(b[1])}x${Number(b[4]) - Number(b[2])}` : '?'; }).join(', ');
    console.log(`MAL  ${f}  "${texto.slice(0, 42)}"  esperaba ${medida}, hay: ${real}  (${desc})`);
    fallos++;
  }
}
console.log('');
console.log(fallos === 0 ? `TODAS LAS MEDIDAS VERIFICADAS (${ok})` : `MEDIDAS FALLIDAS: ${fallos} de ${casos.length}`);
process.exit(fallos === 0 ? 0 : 1);

