// hoja-contacto.cjs — renderiza las 17 pantallas y las compone en UNA hoja de contacto
// con etiqueta, más los PNG individuales para poder ampliar.
//
// Uso:  node hoja-contacto.cjs [cols] [ancho-celda]
// Salida: salida/hoja-17.png  y  salida/<ID>.png
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

function cargarSharp() {
  try { return require("sharp"); } catch (e) {}
  if (process.env.SHARP_PATH) { try { return require(process.env.SHARP_PATH); } catch (e) {} }
  console.error("Falta sharp. Arréglalo con: npm i -D sharp"); process.exit(3);
}
const sharp = cargarSharp();

const DIR = __dirname;
const RENDER = path.join(DIR, "render-pantalla.cjs");
const SALIDA = path.join(DIR, "salida");
const TMP = path.join(os.tmpdir(), "hoja-contacto");
const FUERA = "#0b0b0d"; // fondo del envoltorio del render

const COLS = Number(process.argv[2] || 4);
const CELDA = Number(process.argv[3] || 360);
const GAP = 20, PAD = 24, ETIQ = 30, ALTO_RENDER = 1700;

fs.mkdirSync(SALIDA, { recursive: true });
fs.mkdirSync(TMP, { recursive: true });

// IDs y etiquetas en orden de documento (coinciden con --list)
const ids = execFileSync(process.execPath, [RENDER, "--list"], { encoding: "utf8" })
  .split("\n").slice(1).map((l) => l.replace(/^\s*\d+\.\s*/, "").trim()).filter(Boolean);
const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");
const etiquetas = [...html.matchAll(/class="etiqueta">([\s\S]*?)<\/div>/g)]
  .map((m) => m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());

const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16));

async function recortarAlMovil(p) {
  const { data, info } = await sharp(p).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels, W = info.width, H = info.height;
  const fuera = rgb(FUERA);
  let x0 = W, y0 = H, x1 = -1, y1 = -1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * ch;
    const d = Math.abs(data[i] - fuera[0]) + Math.abs(data[i + 1] - fuera[1]) + Math.abs(data[i + 2] - fuera[2]);
    if (d > 12) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return sharp(p).toBuffer();
  return sharp(p).extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }).toBuffer();
}

(async () => {
  const celdas = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    const bruto = path.join(TMP, id + ".png");
    execFileSync(process.execPath, [RENDER, id, bruto, "390", String(ALTO_RENDER), "1"], { stdio: "ignore" });
    const recorte = await recortarAlMovil(bruto);
    // el individual se guarda a tamaño NATIVO (no depende del tamaño de celda de la hoja)
    fs.writeFileSync(path.join(SALIDA, id + ".png"), recorte);
    const final = await sharp(recorte).resize({ width: CELDA }).png().toBuffer();
    const meta = await sharp(final).metadata();
    celdas.push({ id, etiqueta: etiquetas[i] || id, buf: final, h: meta.height });
    console.log(`${id.padEnd(7)} ${meta.width}x${meta.height}  ${(etiquetas[i] || "").slice(0, 62)}`);
  }

  // rejilla: filas de COLS, cada fila con la altura de su celda más alta
  const filas = [];
  for (let i = 0; i < celdas.length; i += COLS) filas.push(celdas.slice(i, i + COLS));
  const anchoHoja = PAD * 2 + COLS * CELDA + (COLS - 1) * GAP;
  const alturas = filas.map((f) => ETIQ + Math.max(...f.map((c) => c.h)));
  const altoHoja = PAD * 2 + alturas.reduce((a, b) => a + b, 0) + (filas.length - 1) * GAP;

  const comp = [];
  let y = PAD;
  filas.forEach((fila, fi) => {
    fila.forEach((c, ci) => {
      const x = PAD + ci * (CELDA + GAP);
      const texto = c.etiqueta.replace(/&/g, "&amp;").replace(/</g, "&lt;").slice(0, 46);
      comp.push({
        input: Buffer.from(
          `<svg width="${CELDA}" height="${ETIQ}" xmlns="http://www.w3.org/2000/svg">
             <text x="0" y="20" font-family="Segoe UI, sans-serif" font-size="15" font-weight="700" fill="#F2F3F5">${c.id}</text>
             <text x="58" y="20" font-family="Segoe UI, sans-serif" font-size="12" fill="#9AA0A8">${texto.replace(/^[^·]*·\s*/, "")}</text>
           </svg>`),
        left: x, top: y,
      });
      comp.push({ input: c.buf, left: x, top: y + ETIQ });
    });
    y += alturas[fi] + GAP;
  });

  const hoja = path.join(SALIDA, "hoja-17.png");
  await sharp({ create: { width: anchoHoja, height: altoHoja, channels: 3, background: "#101014" } })
    .composite(comp).png({ compressionLevel: 9 }).toFile(hoja);
  console.log(`\nHOJA: ${hoja}  (${anchoHoja}x${altoHoja})`);
  console.log(`Individuales en: ${SALIDA}`);
})();
