// Ensambla index.html desde index.tpl.html:
// - Convierte img/*.png a WebP 480px y los incrusta como base64 ({{IMG_*}})
// - Genera un QR decorativo determinista en SVG ({{QR}})
// Uso: NODE_PATH=<workspace>/node_modules node build-prototipo.cjs
const fs = require("fs");
const path = require("path");

// sharp solo hace falta para incrustar las fotos como base64. Si no está instalado
// damos una salida clara en vez de un stack trace.
function cargarSharp() {
  try {
    return require("sharp");
  } catch (e) { /* sigue */ }
  if (process.env.SHARP_PATH) {
    try {
      return require(process.env.SHARP_PATH);
    } catch (e) { /* sigue */ }
  }
  console.error("Falta el módulo 'sharp' (se usa para convertir img/*.png a WebP incrustado).");
  console.error("  Arréglalo con:  npm i -D sharp");
  console.error("  o define SHARP_PATH apuntando a la carpeta que lo contiene.");
  process.exit(3);
}
const sharp = cargarSharp();

const DIR = __dirname;
const plantilla = (process.argv.find((a) => a.startsWith("--plantilla=")) || "").split("=")[1] || "index.tpl.html";
const tpl = fs.readFileSync(path.join(DIR, plantilla), "utf8");

const IMGS = {
  IMG_COCHE: "coche.png",
  IMG_VAN: "van.png",
  IMG_MINIBUS: "minibus.png",
  IMG_CAMION: "camion.png",
  IMG_CONDUCTOR: "conductor.png",
};

// Parcial compartido: el mapa de Intercity lo usan IC-1a y IC-1b (una sola fuente).
const MAPA = `        <svg viewBox="0 0 358 560" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg">
          <rect width="358" height="560" fill="#232328"/>
          <g fill="#2A2A30">
            <path d="M0 40 L120 10 L200 90 L60 150 Z"/>
            <path d="M220 0 L358 60 L358 200 L260 160 Z"/>
            <path d="M0 220 L150 180 L240 300 L40 360 Z"/>
            <path d="M260 260 L358 300 L358 470 L240 430 Z"/>
            <path d="M0 430 L120 410 L180 520 L0 560 Z"/>
          </g>
          <g stroke="#3A3A42" stroke-width="5" fill="none">
            <path d="M-10 180 C 80 170 180 150 370 190"/>
            <path d="M60 -10 C 70 120 50 300 90 570"/>
            <path d="M-10 390 C 120 370 260 390 370 360"/>
            <path d="M280 -10 C 260 150 300 350 270 570"/>
          </g>
          <g stroke="#34343B" stroke-width="2.5" fill="none">
            <path d="M-10 100 L370 130"/><path d="M-10 480 L370 500"/>
            <path d="M170 -10 L190 570"/><path d="M-10 300 L370 270"/>
          </g>
          <path d="M28 120 C 120 150 200 260 210 380 C 216 430 230 470 300 500" stroke="#0066CC" stroke-width="4.5" fill="none" stroke-linecap="round"/>
          <circle cx="28" cy="120" r="9" fill="#0066CC" stroke="#F2F3F5" stroke-width="2.5"/>
          <circle cx="28" cy="120" r="18" fill="rgba(0,102,204,.18)"/>
          <g>
            <circle cx="300" cy="500" r="16" fill="rgba(194,65,12,.22)"/>
            <path d="M300 480 c -9 0 -15 7 -15 15 c 0 11 15 26 15 26 s 15 -15 15 -26 c 0 -8 -6 -15 -15 -15 Z" fill="#C2410C" stroke="#F2F3F5" stroke-width="2"/>
            <circle cx="300" cy="495" r="5" fill="#F2F3F5"/>
          </g>
          <text x="46" y="112" fill="#9AA0A8" font-size="13" font-weight="600" font-family="Segoe UI">Bata · tu recogida</text>
          <text x="238" y="462" fill="#9AA0A8" font-size="13" font-weight="600" font-family="Segoe UI">Cogo</text>
        </svg>`;

async function imgDataUri(file) {
  const buf = await sharp(path.join(DIR, "img", file))
    .resize({ width: 480, withoutEnlargement: true })
    .webp({ quality: 78, alphaQuality: 90 })
    .toBuffer();
  return "data:image/webp;base64," + buf.toString("base64");
}

// QR determinista 25x25: patrones de posición + módulos pseudoaleatorios
function qrSvg() {
  const N = 25, R = 4, Q = 2; // módulos, tamaño px, quiet zone en módulos
  let seed = 20261009;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  const grid = Array.from({ length: N }, () => Array(N).fill(0));
  function finder(r0, c0) {
    for (let r = 0; r < 7; r++) for (let c = 0; c < 7; c++) {
      const edge = r === 0 || r === 6 || c === 0 || c === 6;
      const core = r >= 2 && r <= 4 && c >= 2 && c <= 4;
      grid[r0 + r][c0 + c] = edge || core ? 1 : 0;
    }
  }
  finder(0, 0); finder(0, N - 7); finder(N - 7, 0);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const inFinder = (r < 8 && c < 8) || (r < 8 && c >= N - 8) || (r >= N - 8 && c < 8);
    if (!inFinder && rnd() > 0.52) grid[r][c] = 1;
  }
  let rects = "";
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    if (grid[r][c]) rects += `<rect x="${(c + Q) * R}" y="${(r + Q) * R}" width="${R}" height="${R}"/>`;
  }
  const size = (N + 2 * Q) * R;
  return `<svg width="132" height="132" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges"><g fill="#111318">${rects}</g></svg>`;
}

(async () => {
  // --tema=fichero.css (por defecto tema-actual.css) · --salida=fichero.html (index.html)
  const arg = (n, def) => (process.argv.find((a) => a.startsWith("--" + n + "=")) || "").split("=")[1] || def;
  const temaFichero = arg("tema", "tema-actual.css");
  const salida = arg("salida", "index.html");

  let html = tpl;
  for (const [k, f] of Object.entries(IMGS)) {
    html = html.replaceAll("{{" + k + "}}", await imgDataUri(f));
  }
  html = html.replace(/\{\{QR\}\}/g, qrSvg());
  html = html.replace(/\{\{MAPA\}\}/g, MAPA);
  const tema = fs.readFileSync(path.join(DIR, temaFichero), "utf8");
  html = html.replace(/\{\{TEMA\}\}/g, tema);
  if (/\{\{(IMG|QR|MAPA|TEMA)/.test(html)) throw new Error("quedan placeholders sin sustituir");
  fs.writeFileSync(path.join(DIR, salida), html);
  console.log(
    `OK ${salida} · tema ${temaFichero} · ` +
      (fs.statSync(path.join(DIR, salida)).size / 1024).toFixed(0) + " KB"
  );
})();
