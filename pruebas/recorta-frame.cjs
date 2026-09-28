#!/usr/bin/env node
/**
 * recorta-frame.cjs — saca UN frame de la vista y lo deja solo, para poder capturarlo a 1:1.
 *
 * POR QUE EXISTE
 * ──────────────
 * El artboard mide 1720 de ancho y mas de 2.000 de alto, pero Chrome headless fotografia **siempre
 * desde el origen de la pagina**: no hay forma de pedirle «captura a partir de y=1400». La trampa es
 * doble: si se captura el artboard entero, la imagen sale tan grande que al leerla el texto no se
 * distingue —y para juzgar si una etiqueta se pliega o si un chip desborda su pildora hay que leer el
 * texto—; y si se captura con ventana pequeña, solo sale la cabecera del artboard.
 *
 * Solucion: extraer el frame del arbol, dejarlo en el origen y capturar una ventana de su tamaño.
 *
 * REGLAS
 *   · No toca ni la fuente ni la vista: solo LEE la vista y escribe en el directorio temporal.
 *   · El recorte **no es un entregable**: es una herramienta de revision. Se puede borrar sin duelo.
 *   · Se ejecuta desde la raiz del repo, despues de generar la vista:
 *         node pruebas/recorta-frame.cjs frame-resultados
 *
 * La cabecera (hasta `</head>`) se **reutiliza literal** de la vista, asi que el recorte hereda
 * Tailwind, FontAwesome, Inter y el `span { white-space: nowrap }`. Si cambia la vista, cambia el
 * recorte: no hay dos sitios donde mantener el CDN.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const VISTA = path.join(RAIZ, 'docs', 'UI-HOTEL-LISTADO-vista.html');

const nombre = process.argv[2];
if (!nombre) {
  console.error('uso: node pruebas/recorta-frame.cjs <data-name del frame>');
  console.error('ej.: node pruebas/recorta-frame.cjs frame-resultados');
  process.exit(1);
}
if (!fs.existsSync(VISTA)) {
  console.error('X no existe ' + VISTA);
  console.error('  lanza antes: node pruebas/prepara-vista-listado.cjs');
  process.exit(1);
}

const vista = fs.readFileSync(VISTA, 'utf8');

const finCabecera = vista.indexOf('</head>');
if (finCabecera === -1) {
  console.error('X la vista no tiene </head>: no parece un documento completo');
  process.exit(1);
}
const cabecera = vista.slice(0, finCabecera + '</head>'.length);

/**
 * El nombre se busca **con la comilla de cierre incluida** (`data-name="chip"` y no `data-name="chip`),
 * porque si no `frame-precio` casaria dentro de `frame-precio-activo`.
 */
const aguja = 'data-name="' + nombre + '"';
const pos = vista.indexOf(aguja);
if (pos === -1) {
  console.error('X no hay ningun nodo con ' + aguja + ' en la vista');
  process.exit(1);
}

const ini = vista.lastIndexOf('<div', pos);
if (ini === -1) {
  console.error('X el nodo no esta en un <div>: el recorte solo sabe de bloques <div>');
  process.exit(1);
}

/**
 * Se equilibran etiquetas contando aperturas y cierres. En esta marca no hay `<div/>` autocerrados, y
 * `<img>` no cuenta porque no es un `div`.
 */
let profundidad = 0;
let fin = -1;
const re = /<div\b|<\/div>/g;
re.lastIndex = ini;
let m;
while ((m = re.exec(vista))) {
  if (m[0] === '</div>') {
    profundidad--;
    if (profundidad === 0) {
      fin = re.lastIndex;
      break;
    }
  } else {
    profundidad++;
  }
}
if (fin === -1) {
  console.error('X etiquetas desequilibradas: el <div> de ' + aguja + ' no cierra');
  process.exit(1);
}

const bloque = vista.slice(ini, fin);
const nodos = (bloque.match(/data-name="/g) || []).length;

const recorte = `${cabecera}
<body>
<!-- RECORTE de ${nombre} — generado por pruebas/recorta-frame.cjs. Herramienta de revision, no es entregable. -->
<style>
  html, body { background: #0F0F12; font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif; }
  body { margin: 0; padding: 0; }
  img { display: block; }
  /* El filo discontinuo marca donde acaba el frame. Sin el, un chip recortado y un chip que cabe
     se parecen demasiado. No forma parte del diseno. */
  .recorte-marco { outline: 1px dashed #3A3A42; }
</style>
<div class="recorte-marco">
${bloque}
</div>
</body>
</html>
`;

const salida = path.join(os.tmpdir(), 'recorte-' + nombre + '.html');
fs.writeFileSync(salida, recorte, 'utf8');

console.log('frame  : ' + nombre + '  (' + nodos + ' nodos con data-name)');
console.log('salida : ' + salida);
console.log('file:///' + salida.replace(/\\/g, '/'));
