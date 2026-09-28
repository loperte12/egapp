#!/usr/bin/env node
/**
 * prepara-vista-listado.cjs — de la fuente que entiende MasterGo a algo que se ve en un navegador.
 *
 * POR QUÉ EXISTE
 * ──────────────
 * `docs/UI-HOTEL-LISTADO.html` cumple el protocolo `page-generate` de MasterGo: es **solo el nodo
 * raíz** (un `<main>` y dentro todo), con clases Tailwind **escritas pero sin compilar**, porque quien
 * las compila es el lienzo de MasterGo. Ese fichero es **el payload de `submit_page_to_canvas`**.
 *
 * Abierto directamente en un navegador, ese HTML se ve **sin estilos**: no lleva Tailwind ni hay nada
 * que lo compile. De ahí este generador: envuelve la misma marca en un documento completo con Tailwind
 * y FontAwesome desde CDN, y escribe `docs/UI-HOTEL-LISTADO-vista.html`.
 *
 * REGLAS
 *   · La fuente NO se toca. El .html sigue siendo el payload limpio.
 *   · La vista es **derivada**: se regenera, no se edita a mano. Si cambias la fuente, relanzas esto.
 *   · Se ejecuta desde la raíz del repo:
 *         node pruebas/prepara-vista-listado.cjs
 *
 * NOTA sobre el CDN: la vista necesita internet para las clases y los iconos. Es una **herramienta de
 * revisión**, no un entregable de producción.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const FUENTE = path.join(RAIZ, 'docs', 'UI-HOTEL-LISTADO.html');
const VISTA = path.join(RAIZ, 'docs', 'UI-HOTEL-LISTADO-vista.html');

if (!fs.existsSync(FUENTE)) {
  console.error('X no existe ' + FUENTE);
  process.exit(1);
}

const fuente = fs.readFileSync(FUENTE, 'utf8');

// El payload debe tener UN solo nodo raiz: se comprueba antes de envolver nada.
const raices = (fuente.match(/^<main\b/gm) || []).length;
if (raices !== 1) {
  console.error('X la fuente debe tener exactamente un <main> como raiz; encontrados: ' + raices);
  process.exit(1);
}

/**
 * Se quitan los comentarios de CABECERA antes de extraer la marca.
 *
 * Trampa ya pagada: buscar `<main` a pelo con `indexOf('<main')` NO vale, porque la cabecera de la
 * fuente **cita** la etiqueta («raiz unica `<main>` con `data-name`»). El primer `<main` que aparecia
 * estaba DENTRO del comentario, asi que la vista empezaba a media cabecera y el texto del comentario
 * se veia en pantalla. Se limpia por posicion —solo los comentarios del principio— y despues se busca.
 */
const sinCabecera = fuente.replace(/^\s*(?:<!--[\s\S]*?-->\s*)+/, '');
const marca = sinCabecera.slice(sinCabecera.indexOf('<main'));
if (!marca.startsWith('<main')) {
  console.error('X no se ha podido aislar el nodo raiz tras limpiar la cabecera');
  process.exit(1);
}

/**
 * Las imagenes del payload son `src="{{clave en ingles}}"`: es el marcador con el que MasterGo pide
 * un relleno de imagen. En un navegador eso es una **imagen rota**, y una imagen rota ensucia la
 * revision: se acaba mirando el iconito gris en vez del encuadre. Aqui se sustituyen SOLO en la
 * derivada por un marcador gris con la clave escrita, para poder juzgar el layout.
 *
 * Ojo: el `w-[358px] h-[201px]` de la clase sigue mandando el tamano; el SVG es solo el relleno.
 */
const conMarcador = marca.replace(/src="\{\{([^}"]+)\}\}"/g, (_todo, clave) => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="358" height="201">' +
    '<rect width="100%" height="100%" fill="#1E1E23"/>' +
    '<text x="50%" y="50%" fill="#5A6070" font-family="Inter, sans-serif" font-size="13" ' +
    'text-anchor="middle" dominant-baseline="middle">' +
    clave +
    '</text></svg>';
  return 'src="data:image/svg+xml;utf8,' + encodeURIComponent(svg) + '"';
});

const vista = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1720" />
<title>EG Route Plan · Listado de hoteles — vista previa</title>

<!-- La vista necesita internet: Tailwind compila estas clases y FontAwesome trae los iconos. -->
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" />

<!-- La tipografia base del kit. En la app es la del sistema; aqui Inter es lo mas parecido. -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;800;900&display=swap" rel="stylesheet" />

<style>
  /* Solo lo que Tailwind no puede saber: la fuente base y quitar el scroll horizontal molesto. */
  html, body { background: #0F0F12; font-family: Inter, system-ui, -apple-system, "Segoe UI", sans-serif; }
  body { margin: 0; padding: 0; overflow-x: auto; }
  img { display: block; }

  /* El protocolo de MasterGo dice que un <span> es **auto-ancho y NUNCA pliega**; el lienzo lo respeta
     de serie, pero un navegador no. Sin esta regla, una etiqueta larga dentro de una fila Flex se
     parte en dos lineas y desborda su pildora (pasó con «hasta 25.000 XAF» y con «Precio ↑»). */
  span { white-space: nowrap; }
</style>
</head>
<body>
<!-- GENERADO por pruebas/prepara-vista-listado.cjs desde docs/UI-HOTEL-LISTADO.html — no editar a mano -->
${conMarcador}
</body>
</html>
`;

fs.writeFileSync(VISTA, vista, 'utf8');

// Comprobacion de que la derivada esta completa: los mismos nodos con nombre que la fuente.
const cuenta = (t, re) => (t.match(re) || []).length;
const dnFuente = cuenta(fuente, /data-name="/g);
const dnVista = cuenta(vista, /data-name="/g);
const iguales = dnFuente === dnVista;

console.log('fuente : docs/UI-HOTEL-LISTADO.html        ' + fuente.split('\n').length + ' lineas');
console.log('vista  : docs/UI-HOTEL-LISTADO-vista.html  ' + vista.split('\n').length + ' lineas');
console.log('nodos con data-name -> fuente ' + dnFuente + ' · vista ' + dnVista + '  ' + (iguales ? 'OK' : 'X NO COINCIDEN'));
console.log('imagenes {{clave}} -> marcador gris (solo en la vista): ' +
  (marca.match(/src="\{\{[^}"]+\}\}"/g) || []).length);
process.exit(iguales ? 0 : 1);
