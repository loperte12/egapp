#!/usr/bin/env node
/**
 * prepara-canvas.cjs — deriva el `code` que se envia al lienzo de MasterGo.
 *
 * POR QUE EXISTE (29-sep-2026, fallo real, coste: tres entregas fantasma)
 * ───────────────────────────────────────────────────────────────────────
 * La pantalla se envio tres veces con `submit_page_to_canvas` y las tres devolvio
 * «设计稿生成已成功完成». En el lienzo, sin embargo, no habia pantalla: habia
 * TRES marcos de escritorio (1478 px) con el rotulo «AI Generating Page» y, dentro,
 * MI COMENTARIO DE CABECERA CONVERTIDO EN TEXTO — hasta el `-->` final pintado
 * como caracter visible.
 *
 * La causa: para el compilador de MasterGo un comentario HTML NO se ignora, se
 * transcribe como capa de texto. Y el comentario era lo PRIMERO del payload, antes
 * del `<main>`. El `<main>` nunca llego a pintarse porque el contenido del envio
 * empezo —y acabo— en el comentario.
 *
 * Comprobado leyendo el nodo con get_selection_node:
 *   data-node-id="3:0"  data-name="AI Generating Page"
 *     span 3:01  -> "` · `data-name` en TODOS los nodos ... "
 *     p    3:18  -> "` = una linea (no pliega) ... -->"
 *
 * La regla del protocolo ya lo decia y no la lei con atencion:
 *   «根节点唯一且优先使用 <main data-name="...">»
 *   «`code` 字段必须且仅包含纯 HTML 根节点片段»
 *
 * QUE HACE
 * ────────
 * Quita TODOS los comentarios HTML (el de cabecera Y los separadores internos) y
 * deja un fragmento puro que empieza en `<main` y termina en `</main>`. Falla en
 * voz alta si algo de eso no se cumple, en vez de entregar basura otra vez.
 *
 * La documentacion NO se pierde: sigue en el fichero fuente (que se lee a mano) y
 * en docs/UI-HOTEL-LISTADO-HANDOFF.md.
 *
 * Uso:  node pruebas/prepara-canvas.cjs
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const FUENTE = path.join(RAIZ, 'docs', 'UI-HOTEL-LISTADO.html');
const SALIDA = path.join(RAIZ, 'docs', 'UI-HOTEL-LISTADO-canvas.html');

const fuente = fs.readFileSync(FUENTE, 'utf8');

// 1. Fuera TODOS los comentarios HTML. Multilinea, no codicioso.
const comentarios = fuente.match(/<!--[\s\S]*?-->/g) || [];
let limpio = fuente.replace(/<!--[\s\S]*?-->/g, '');

// 2. Recortar a la raiz <main> ... </main>. Nada antes, nada despues.
const abreMain = limpio.indexOf('<main');
const cierraMain = limpio.lastIndexOf('</main>');
if (abreMain < 0 || cierraMain < 0) {
  console.error('✗ no encuentro <main> ... </main> en ' + path.relative(RAIZ, FUENTE));
  process.exit(1);
}
const antes = limpio.slice(0, abreMain).trim();
const despues = limpio.slice(cierraMain + '</main>'.length).trim();
const fragmento = limpio.slice(abreMain, cierraMain + '</main>'.length).trim() + '\n';

// 3. Las puertas duras. Si alguna falla, NO se escribe nada.
const fallos = [];
if (antes !== '') fallos.push('queda texto antes de <main>: ' + JSON.stringify(antes.slice(0, 60)));
if (despues !== '') fallos.push('queda texto despues de </main>: ' + JSON.stringify(despues.slice(0, 60)));
if (!fragmento.startsWith('<main')) fallos.push('el fragmento no empieza por <main');
if (!fragmento.trimEnd().endsWith('</main>')) fallos.push('el fragmento no termina en </main>');
for (const prohibido of ['<!--', '-->', '<!DOCTYPE', '<html', '<head', '<body', '<script', 'class="sr-only"']) {
  if (fragmento.includes(prohibido)) fallos.push('el fragmento contiene ' + JSON.stringify(prohibido));
}

if (fallos.length) {
  console.error('✗ NO se escribe nada. El fragmento no cumple el protocolo:');
  for (const f of fallos) console.error('   · ' + f);
  process.exit(1);
}

fs.writeFileSync(SALIDA, fragmento, 'utf8');

// 4. Censo. Los nodos deben cuadrar con la fuente: si bajan, es que se ha comido codigo.
//
// OJO, TRAMPA YA PISADA DOS VECES: el censo se mide sobre `limpio`, NUNCA sobre
// `fuente`. El comentario de cabecera CITA la etiqueta («raíz única `<main>`») y los
// patrones la encuentran dentro del comentario: contar sobre la fuente da 2 raices
// donde hay 1. Es el mismo fallo que en prepara-vista-listado.cjs (alli, `indexOf`).
const nodosFuente = (limpio.match(/data-name="/g) || []).length;
const nodosFragmento = (fragmento.match(/data-name="/g) || []).length;
const mainFuente = (limpio.match(/<main\b/g) || []).length;

console.log('fuente    : ' + path.relative(RAIZ, FUENTE) + '   ' + fuente.split('\n').length + ' lineas');
console.log('comentarios quitados : ' + comentarios.length);
console.log('nodos data-name -> fuente ' + nodosFuente + ' · fragmento ' + nodosFragmento +
  (nodosFuente === nodosFragmento ? '  OK' : '  ✗ DESCUADRAN'));
console.log('<main> en la fuente   : ' + mainFuente + (mainFuente === 1 ? '  OK (raiz unica)' : '  ✗ DEBE SER 1'));
console.log('fragmento  : ' + path.relative(RAIZ, SALIDA) + '   ' + fragmento.length + ' bytes · ' +
  fragmento.split('\n').length + ' lineas');
console.log('primera linea: ' + fragmento.split('\n')[0].slice(0, 78) + '...');
console.log('ultima linea : ' + fragmento.trimEnd().split('\n').pop().trim());

if (nodosFuente !== nodosFragmento || mainFuente !== 1) process.exit(1);
