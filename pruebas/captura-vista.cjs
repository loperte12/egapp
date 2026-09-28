#!/usr/bin/env node
/**
 * captura-vista.cjs — fotografiar una vista HTML con Chrome headless sin equivocarse de banderas.
 *
 * POR QUE EXISTE
 * ──────────────
 * Chrome headless es el unico medidor de diseno disponible aqui: `agent-browser` no esta instalado y
 * no hay lienzo de MasterGo. Pero tiene dos trampas que ya han costado un error de medida:
 *
 *  1. **Factor de escala del dispositivo.** En esta maquina Chrome saca las capturas a **2x** por
 *     defecto (la pantalla es HiDPI). Una ventana de 880x1000 produce un PNG de 1760x2000. Si ese
 *     fichero se llama «1a1», la medida es mentira: para tener pixeles de verdad hay que pedir
 *     `--force-device-scale-factor=1`. Este script lo pide SIEMPRE y luego **lee la cabecera del PNG**
 *     y avisa si el tamano no cuadra con la ventana.
 *  2. **El usuario de datos.** Chrome no arranca si el `--user-data-dir` esta en uso por otra
 *     instancia sin cerrar, y el perfil por defecto puede traer sesion y extensiones. Se usa uno
 *     desechable y fijo.
 *
 * Ademas headless fotografia **siempre desde el origen de la pagina**: no hay bandera para capturar
 * «a partir de y=1400». Para eso esta `recorta-frame.cjs`, que deja el frame en el origen.
 *
 * USO
 *   node pruebas/captura-vista.cjs <archivo-o-url> <ancho> <alto> <salida.png> [factor]
 *
 *   node pruebas/captura-vista.cjs docs/UI-HOTEL-LISTADO-vista.html 1720 2600 pruebas/_artboard.png
 *   node pruebas/captura-vista.cjs D:/Temp/recorte-frame-resultados.html 390 760 pruebas/_chips.png
 *
 * El quinto argumento sube el factor a proposito (2 da una imagen mas legible para leer texto).
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.resolve(__dirname, '..');

const [destino, ancho, alto, salida, factor = '1'] = process.argv.slice(2);
if (!destino || !ancho || !alto || !salida) {
  console.error('uso: node pruebas/captura-vista.cjs <archivo-o-url> <ancho> <alto> <salida.png> [factor]');
  process.exit(1);
}

const NAVEGADORES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];
const navegador = NAVEGADORES.find((p) => fs.existsSync(p));
if (!navegador) {
  console.error('X no encuentro Chrome ni Edge. Buscados:\n  ' + NAVEGADORES.join('\n  '));
  process.exit(1);
}

/** Un archivo relativo se resuelve desde la raiz del repo; los absolutos y las URLs se dejan igual. */
let url = destino;
if (!/^(https?:|file:)/.test(destino)) {
  const abs = path.isAbsolute(destino) ? destino : path.join(RAIZ, destino);
  if (!fs.existsSync(abs)) {
    console.error('X no existe ' + abs);
    process.exit(1);
  }
  url = 'file:///' + abs.replace(/\\/g, '/');
}

const png = path.isAbsolute(salida) ? salida : path.join(RAIZ, salida);
fs.mkdirSync(path.dirname(png), { recursive: true });

execFileSync(
  navegador,
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--user-data-dir=D:\\_tmp-chrome',
    '--virtual-time-budget=15000',
    '--force-device-scale-factor=' + factor,
    '--window-size=' + ancho + ',' + alto,
    '--screenshot=' + png,
    url,
  ],
  { stdio: ['ignore', 'ignore', 'ignore'] }
);

if (!fs.existsSync(png)) {
  console.error('X Chrome no ha escrito ' + png);
  process.exit(1);
}

/**
 * El tamano real se lee del propio PNG (IHDR, bytes 16..24). No se pregunta a Chrome: si el factor
 * no se aplico, la unica prueba esta en el fichero.
 */
const cab = fs.readFileSync(png).subarray(0, 33);
const w = cab.readUInt32BE(16);
const h = cab.readUInt32BE(20);
const esperadoW = Number(ancho) * Number(factor);
const esperadoH = Number(alto) * Number(factor);
const cuadra = w === esperadoW && h === esperadoH;

console.log(
  path.relative(RAIZ, png).replace(/\\/g, '/') +
    '  ->  ' + w + ' x ' + h + ' px  (' + fs.statSync(png).size + ' B)'
);
console.log(
  'pedido: ' + ancho + ' x ' + alto + ' a factor ' + factor + ' = ' + esperadoW + ' x ' + esperadoH +
    '  ' + (cuadra ? 'OK' : 'X EL TAMANO NO CUADRA')
);
process.exit(cuadra ? 0 : 1);
