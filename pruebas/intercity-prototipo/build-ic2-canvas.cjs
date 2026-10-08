// Genera el payload del lienzo para IC-2 Resultados (piloto MasterGo).
// - Transcribe la pantalla IC-2 del prototipo (index.tpl.html) al formato del
//   compilador de MasterGo: clases utilitarias + variables de PALETA BASE del
//   lienzo (las semánticas resolvieron en modo claro en el piloto IC-1).
// - Cinco puertas (skill entregar-pagina-mastergo): si una falla, no escribe nada.
// Uso: NODE_PATH=<workspace>/node_modules node build-ic2-canvas.cjs
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const DIR = __dirname;
const OUT = path.join(DIR, "canvas", "IC-2-Resultados-canvas.html");

const IMGS = {
  IMG_COCHE: "coche.png",
  IMG_VAN: "van.png",
  IMG_MINIBUS: "minibus.png",
  IMG_CONDUCTOR: "conductor.png",
};

async function imgDataUri(file) {
  const buf = await sharp(path.join(DIR, "img", file))
    .resize({ width: 480, withoutEnlargement: true })
    .webp({ quality: 78, alphaQuality: 90 })
    .toBuffer();
  return "data:image/webp;base64," + buf.toString("base64");
}

// Paleta base del lienzo 205808662226877 (leída hoy vía get_variables)
const V = {
  bg: "var(基础色板/石墨/900)",      // #1e1e23 — fondo de la app
  card: "var(基础色板/石墨/850)",    // #232329 — tarjetas
  field: "var(基础色板/石墨/800)",   // #2e3338 — campos/bordes
  text: "var(基础色板/石板/100)",    // #f2f3f5 — texto principal
  muted: "var(基础色板/石板/400)",   // #a9aeb8 — texto secundario
  blue: "var(基础色板/蓝色/600)",    // #0066cc — CTA
  blueL: "var(基础色板/蓝色/400)",   // #5fa9ee
  orangeL: "var(基础色板/橙色/400)", // #f08a4b — descuento
  orange: "var(基础色板/橙色/700)",  // #c2410c — precios
  green: "var(基础色板/绿色/400)",   // #45b87a — verificado
  amber: "var(基础色板/琥珀/400)",   // #f5b942 — rating/nuevo
  white: "var(基础色板/中性/0)",
  tileBg: "var(基础色板/中性/100)",  // #fafafa — fondo de la foto del coche
};

const pillOk = "#283935";   // verde 15% sobre tarjeta
const pillPend = "#433a2d"; // ámbar 15% sobre tarjeta
const pillDesc = "#402824"; // naranja 18% sobre tarjeta

function chipSel(t) {
  return `<div data-name="chip-${t}" class="flex flex-row justify-center items-center h-[32px] px-[14px] rounded-[16px] bg-[${V.blue}]"><span data-name="chip-${t}-texto" class="text-[13px] leading-[18px] font-[600] text-[${V.white}] text-center">${t}</span></div>`;
}
function chip(t) {
  return `<div data-name="chip-${t}" class="flex flex-row justify-center items-center h-[32px] px-[14px] rounded-[16px] bg-[${V.field}]"><span data-name="chip-${t}-texto" class="text-[13px] leading-[18px] font-[500] text-[${V.text}] text-center">${t}</span></div>`;
}
function amen(t) {
  return `<div data-name="amen-${t}" class="flex flex-row justify-center items-center h-[20px] px-[7px] rounded-[10px] bg-[${V.field}]"><span data-name="amen-${t}-texto" class="text-[10px] leading-[14px] font-[400] text-[${V.muted}] text-center">${t}</span></div>`;
}
function driverTag(imgData, initials, nombre, rating) {
  const foto = imgData
    ? `<img data-name="driver-foto" src="${imgData}" class="w-[24px] h-[24px] rounded-[12px] object-cover shrink-0" />`
    : `<div data-name="driver-foto" class="flex flex-row justify-center items-center w-[24px] h-[24px] rounded-[12px] bg-[${V.field}]"><span data-name="driver-iniciales" class="text-[10px] leading-[14px] font-[600] text-[${V.muted}] text-center">${initials}</span></div>`;
  return `<div data-name="driver-tag" class="flex flex-row justify-start items-center self-stretch px-[12px] py-[6px] gap-[6px]">${foto}<span data-name="driver-nombre" class="text-[11.5px] leading-[16px] font-[600] text-[${V.text}] text-left">${nombre}</span><span data-name="driver-rating" class="text-[10px] leading-[14px] font-[400] text-[${V.amber}] text-left">★ ${rating}</span></div>`;
}
function mcard({ img, tileH, driver, ruta, meta1, amens, meta2, pie }) {
  return `<div data-name="tarjeta-${ruta}-${driver.nombre}" class="flex flex-col justify-start items-stretch self-stretch bg-[${V.card}] rounded-[16px] overflow-hidden"><div data-name="foto-tile" class="flex flex-row justify-center items-center self-stretch h-[${tileH}px] bg-[${V.tileBg}]"><img data-name="foto-vehiculo" src="${img}" class="w-full h-[${tileH}px] object-cover" /></div>${driver.html}<div data-name="cuerpo" class="flex flex-col justify-start items-stretch self-stretch px-[12px] pb-[12px] gap-[6px]"><p data-name="ruta" class="self-stretch text-[14px] leading-[19px] font-[600] text-[${V.text}] text-left">${ruta}</p><span data-name="meta1" class="text-[11.5px] leading-[16px] font-[400] text-[${V.muted}] text-left">${meta1}</span><div data-name="amens" class="flex flex-row justify-start items-center self-stretch gap-[5px]">${amens}</div><span data-name="meta2" class="text-[11.5px] leading-[16px] font-[400] text-[${V.muted}] text-left">${meta2}</span><div data-name="pie" class="flex flex-row justify-between items-center self-stretch mt-[2px]">${pie}</div></div></div>`;
}

(async () => {
  const img = {};
  for (const [k, f] of Object.entries(IMGS)) img[k] = await imgDataUri(f);

  const dAnastasio = { nombre: "Anastasio M.", rating: "4,8", html: driverTag(img.IMG_CONDUCTOR, "AM", "Anastasio M.", "4,8") };
  const dPedro = { nombre: "Pedro E.", rating: "4,5", html: driverTag(null, "PE", "Pedro E.", "4,5") };
  const dJacoba = { nombre: "Jacoba N.", rating: "4,9", html: driverTag(null, "JN", "Jacoba N.", "4,9") };

  const cardAnastasio = mcard({
    img: img.IMG_MINIBUS, tileH: 110, driver: dAnastasio,
    ruta: "Bata → Cogo", meta1: "vie 9 oct · 06:30 · ~2 h 30",
    amens: amen("💧 Agua gratis") + amen("❄️ A/C") + amen("🐾 Mascotas"),
    meta2: "Hiace 12 plazas · 6 libres",
    pie: `<span data-name="precio" class="text-[16px] leading-[20px] font-[700] text-[${V.orangeL}] text-left">7 000 XAF</span><div data-name="estado-verificado" class="flex flex-row justify-center items-center h-[22px] px-[10px] rounded-[11px] bg-[${pillOk}]"><span data-name="estado-verificado-texto" class="text-[11px] leading-[15px] font-[600] text-[${V.green}] text-center">Verificado</span></div>`,
  });

  const cardPedro = mcard({
    img: img.IMG_COCHE, tileH: 96, driver: dPedro,
    ruta: "Bata → Cogo", meta1: "vie 9 oct · 09:00 · ~2 h",
    amens: amen("❄️ A/C") + amen("📶 WiFi"),
    meta2: "Hilux · 3 libres",
    pie: `<div data-name="pie-precio" class="flex flex-row justify-start items-center gap-[6px]"><span data-name="precio-tachado" class="text-[12px] leading-[16px] font-[400] text-[${V.muted}] text-left line-through">9 000</span><span data-name="precio" class="text-[16px] leading-[20px] font-[700] text-[${V.orangeL}] text-left">7 500 XAF</span></div><div data-name="badge-descuento" class="flex flex-row justify-center items-center h-[22px] px-[8px] rounded-[11px] bg-[${pillDesc}]"><span data-name="badge-descuento-texto" class="text-[11px] leading-[15px] font-[700] text-[${V.orangeL}] text-center">−17%</span></div>`,
  });

  const cardJacoba = mcard({
    img: img.IMG_VAN, tileH: 96, driver: dJacoba,
    ruta: "Bata → Cogo · puerta a puerta", meta1: "vie 9 oct · 11:30 · ~2 h 45",
    amens: amen("💧 Agua gratis"),
    meta2: "Van 8 plazas · 4 libres",
    pie: `<span data-name="precio" class="text-[16px] leading-[20px] font-[700] text-[${V.orangeL}] text-left">9 000 XAF</span><div data-name="estado-nuevo" class="flex flex-row justify-center items-center h-[22px] px-[10px] rounded-[11px] bg-[${pillPend}]"><span data-name="estado-nuevo-texto" class="text-[11px] leading-[15px] font-[600] text-[${V.amber}] text-center">Nuevo</span></div>`,
  });

  const payload = `<main data-name="IC-2 Resultados" class="flex flex-col justify-start items-stretch w-[390px] min-h-[844px] bg-[${V.bg}] overflow-hidden"><div data-name="topbar" class="flex flex-row justify-between items-center self-stretch h-[56px] px-[16px] bg-[${V.bg}] border-b-[1px] border-[${V.field}]"><span data-name="topbar-back" class="text-[24px] leading-[24px] font-[400] text-[${V.text}] text-center">‹</span><span data-name="topbar-titulo" class="text-[17px] leading-[22px] font-[600] text-[${V.text}] text-center">Bata → Cogo</span><div data-name="topbar-avatar" class="flex flex-row justify-center items-center w-[32px] h-[32px] rounded-[32px] bg-[${V.blue}]"><span data-name="topbar-iniciales" class="text-[12px] leading-[16px] font-[600] text-[${V.white}] text-center">BL</span></div></div><div data-name="contenido" class="flex flex-col justify-start items-stretch self-stretch flex-1 p-[16px] gap-[14px]"><div data-name="chips-fecha" class="flex flex-row justify-start items-center self-stretch gap-[8px]">${chipSel("vie 9 oct")}${chip("sáb 10")}${chip("↓ Con descuento")}</div><div data-name="masonry" class="flex flex-row justify-start items-start self-stretch gap-[10px]"><div data-name="columna-1" class="flex flex-col justify-start items-stretch flex-1 gap-[10px]">${cardAnastasio}${cardJacoba}</div><div data-name="columna-2" class="flex flex-col justify-start items-stretch flex-1 gap-[10px]">${cardPedro}</div></div><div data-name="boton-filtrar" class="flex flex-row justify-center items-center self-stretch h-[48px] bg-[${V.field}] rounded-[14px]"><span data-name="boton-filtrar-texto" class="text-[15px] leading-[20px] font-[600] text-[${V.text}] text-center">Filtrar y ordenar</span></div><div data-name="espaciador" class="flex-1"></div></div><div data-name="footer" class="flex flex-row justify-start items-stretch self-stretch h-[56px] bg-[${V.card}] border-t-[1px] border-[${V.field}]"><div data-name="tab-inicio" class="flex flex-col justify-center items-center flex-1 gap-[3px]"><span data-name="tab-inicio-ico" class="text-[17px] leading-[20px] text-center">🏠</span><span data-name="tab-inicio-txt" class="text-[10px] leading-[13px] font-[500] text-[${V.blueL}] text-center">Inicio</span></div><div data-name="tab-reservas" class="flex flex-col justify-center items-center flex-1 gap-[3px]"><span data-name="tab-reservas-ico" class="text-[17px] leading-[20px] text-center">🎫</span><span data-name="tab-reservas-txt" class="text-[10px] leading-[13px] font-[400] text-[${V.muted}] text-center">Reservas</span></div><div data-name="tab-miviaje" class="flex flex-col justify-center items-center flex-1 gap-[3px]"><span data-name="tab-miviaje-ico" class="text-[17px] leading-[20px] text-center">🧭</span><span data-name="tab-miviaje-txt" class="text-[10px] leading-[13px] font-[400] text-[${V.muted}] text-center">Mi viaje</span></div><div data-name="tab-panel" class="flex flex-col justify-center items-center flex-1 gap-[3px]"><span data-name="tab-panel-ico" class="text-[17px] leading-[20px] text-center">▦</span><span data-name="tab-panel-txt" class="text-[10px] leading-[13px] font-[400] text-[${V.muted}] text-center">Panel</span></div><div data-name="tab-perfil" class="flex flex-col justify-center items-center flex-1 gap-[3px]"><span data-name="tab-perfil-ico" class="text-[17px] leading-[20px] text-center">👤</span><span data-name="tab-perfil-txt" class="text-[10px] leading-[13px] font-[400] text-[${V.muted}] text-center">Perfil</span></div></div></main>`;

  // ── Las cinco puertas ──
  const errores = [];
  const t = payload.trim();
  if (!t.startsWith("<main")) errores.push("no empieza por <main");
  if (!t.endsWith("</main>")) errores.push("no acaba en </main>");
  if (t.includes("<!--") || t.includes("-->")) errores.push("contiene comentarios HTML");
  if (/<(!DOCTYPE|html|head|body|script)/i.test(t)) errores.push("contiene DOCTYPE/html/head/body/script");
  const raices = (t.match(/^<main/gm) || []).length;
  if (raices !== 1) errores.push(`raices <main> = ${raices}`);
  if (/\{\{(IMG|QR)/.test(t)) errores.push("quedan placeholders sin sustituir");
  const nodos = (t.match(/data-name=/g) || []).length;
  if (nodos < 60) errores.push(`data-name = ${nodos} (esperadas >= 60)`);
  if (errores.length) {
    console.error("PUERTAS FALLIDAS — no se escribe nada:", errores);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, payload);
  console.log(`OK ${path.basename(OUT)} — ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB, ${nodos} data-name`);
})();
