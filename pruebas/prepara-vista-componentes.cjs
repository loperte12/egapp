#!/usr/bin/env node
/**
 * Junta los 10 fragmentos de docs/componentes/*.html en un documento que se puede
 * abrir en el navegador. NO es el payload: esto es solo para MIRAR.
 *
 * El payload de cada componente es su fichero suelto, tal cual, y se valida con
 * pruebas/prepara-componente.cjs antes de enviarlo.
 *
 * Ojo: el fragmento NO lleva Tailwind compilado (usa clases arbitrarias), asi que
 * la vista las resuelve por CDN. Lo que se ve aqui y lo que se ve en el lienzo
 * pueden diferir en detalles de motor; para el pixel manda Chrome, no el lienzo.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const DIR = path.join(RAIZ, "docs", "componentes");
const SALIDA = path.join(RAIZ, "docs", "UI-HOTEL-COMPONENTES-vista.html");

const ORDEN = [
  "topbar",
  "searchfield",
  "filterchip",
  "hotelcard",
  "ratingbadge",
  "pricetag",
  "favoritebutton",
  "emptystate",
  "errorstate",
  "skeletoncard",
];

const TITULO = {
  topbar: "TopBar",
  searchfield: "SearchField",
  filterchip: "FilterChip",
  hotelcard: "HotelCard",
  ratingbadge: "RatingBadge",
  pricetag: "PriceTag",
  favoritebutton: "FavoriteButton",
  emptystate: "EmptyState",
  errorstate: "ErrorState",
  skeletoncard: "SkeletonCard",
};

const NOTA = {
  topbar: "Ubicacion (TEXT). Lleva el buscador dentro, como en la pantalla.",
  searchfield: "Marcador (TEXT). El atomo suelto, por si se usa en otra pantalla.",
  filterchip: "state default/pressed/disabled + Etiqueta + Mostrar icono.",
  hotelcard: "state default/promo/unavailable + 5 TEXT + Con sello.",
  ratingbadge: "state published/unpublished + Nota.",
  pricetag: "state default/promo/unavailable + Importe/Impuestos/PrecioAntes.",
  favoritebutton: "state default/saved/disabled. Sin props: no hay texto.",
  emptystate: "Titulo + Explicacion + Accion.",
  errorstate: "Titulo + Explicacion + Accion.",
  skeletoncard: "Sin props: es el estado de carga.",
};

const cabecera = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>EG Route Plan · Componentes del hotel</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
<style>
  html, body { background: #0F0F12; }
  body { font-family: Inter, system-ui, -apple-system, sans-serif; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  span { white-space: nowrap; }
</style>
</head>
<body>
<div class="flex flex-col justify-start items-start w-[1120px] gap-[28px] p-[32px]">

<div class="flex flex-col justify-start items-start self-stretch gap-[6px]">
  <span class="text-[24px] leading-[30px] font-[800] text-[#F2F3F5] text-left">Componentes del hotel</span>
  <p class="self-stretch text-[14px] leading-[20px] font-[400] text-[#A9AEB8] text-left">Los diez del pliego, en el orden del listado. Cada bloque es el fragmento de <code>docs/componentes/</code> tal cual: lo que se envia al lienzo. Este documento es solo para mirar.</p>
</div>
`;

/** Marcador gris en lugar de la imagen: en un navegador las `{{clave}}` salen
 *  ROTAS y ensucian la revision (ya paso con la vista del listado). */
function marcador(clave, w = 358, h = 201) {
  const txt = String(clave).replace(/[<>&"]/g, "");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
    `<rect width="100%" height="100%" fill="#2E3338"/>` +
    `<text x="50%" y="50%" fill="#A9AEB8" font-family="Inter,sans-serif" font-size="13" text-anchor="middle" dominant-baseline="middle">${txt}</text>` +
    `</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

let cuerpos = "";
let contados = 0;
let imagenes = 0;
const faltan = [];

for (const clave of ORDEN) {
  const fichero = path.join(DIR, clave + ".html");
  if (!fs.existsSync(fichero)) {
    faltan.push(clave);
    continue;
  }
  const html = fs
    .readFileSync(fichero, "utf8")
    .trim()
    .replace(/src="\{\{([^}]*)\}\}"/g, (_m, k) => {
      imagenes++;
      return 'src="' + marcador(k) + '"';
    });
  const nodos = (html.match(/data-name="/g) || []).length;
  const esSet = /data-type="component-set"/.test(html);
  const variantes = (html.match(/data-type="component"/g) || []).length;

  cuerpos += `
<div class="flex flex-col justify-start items-start self-stretch gap-[10px] p-[20px] bg-[#17171A] border-[1px] border-[#FFFFFF]/10 rounded-[16px]">
  <div class="flex flex-row justify-start items-center self-stretch gap-[10px]">
    <span class="text-[15px] leading-[20px] font-[800] text-[#F2F3F5] text-left">${TITULO[clave]}</span>
    <span class="text-[11px] leading-[14px] font-[500] text-[#A9AEB8] text-left">docs/componentes/${clave}.html · ${nodos} nodos · ${esSet ? variantes + " variantes" : "sin variantes"}</span>
  </div>
  <p class="self-stretch text-[12px] leading-[16px] font-[400] text-[#A9AEB8] text-left">${NOTA[clave]}</p>
  <div class="flex flex-row justify-start items-start self-stretch gap-[16px] overflow-hidden">
${html
  .split("\n")
  .map((l) => "    " + l)
  .join("\n")}
  </div>
</div>
`;
  contados++;
}

const pie = `
</div>
</body>
</html>
`;

fs.writeFileSync(SALIDA, cabecera + cuerpos + pie, "utf8");

console.log("componentes incluidos: " + contados + " de " + ORDEN.length);
console.log("imagenes sustituidas por marcador: " + imagenes);
if (faltan.length) console.log("FALTAN: " + faltan.join(", "));
console.log("salida: " + path.relative(RAIZ, SALIDA) + " (" + fs.statSync(SALIDA).size + " B)");
