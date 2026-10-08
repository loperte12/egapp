// comparar-temas.cjs — comparación antes/después entre el tema actual y el v2.
//
// Uso:
//   node comparar-temas.cjs hoja            -> las dos hojas completas, lado a lado
//   node comparar-temas.cjs par <celda> <ID...>  -> pares [actual | v2] para revisar de cerca
const fs = require("fs");
const path = require("path");
function cargarSharp() {
  try { return require("sharp"); } catch (e) {}
  if (process.env.SHARP_PATH) { try { return require(process.env.SHARP_PATH); } catch (e) {} }
  console.error("Falta sharp"); process.exit(3);
}
const sharp = cargarSharp();
const DIR = __dirname;
const A = path.join(DIR, "salida", "actual");
const V = path.join(DIR, "salida", "v2");

(async () => {
  const modo = process.argv[2] || "hoja";

  if (modo === "hoja") {
    const a = await sharp(path.join(A, "hoja-17.png")).toBuffer();
    const b = await sharp(path.join(V, "hoja-17.png")).toBuffer();
    const ma = await sharp(a).metadata(), mb = await sharp(b).metadata();
    const G = 24, ETIQ = 46;
    const alto = ETIQ + Math.max(ma.height, mb.height) + 20;
    const etiqueta = (x, txt, color) =>
      Buffer.from(`<svg width="600" height="${ETIQ}" xmlns="http://www.w3.org/2000/svg">
        <text x="0" y="32" font-family="Segoe UI, sans-serif" font-size="26" font-weight="700" fill="${color}">${txt}</text>
      </svg>`);
    const salida = path.join(DIR, "salida", "comparacion.png");
    await sharp({ create: { width: ma.width + mb.width + G, height: alto, channels: 3, background: "#0B0D11" } })
      .composite([
        { input: etiqueta(0, "ANTES · tema actual", "#9AA0A8"), left: 0, top: 0 },
        { input: etiqueta(0, "DESPUES · mi tema v2", "#5AA9FF"), left: ma.width + G, top: 0 },
        { input: a, left: 0, top: ETIQ },
        { input: b, left: ma.width + G, top: ETIQ },
      ]).png({ compressionLevel: 9 }).toFile(salida);
    console.log(`COMPARACION: ${salida}  (${ma.width + mb.width + G}x${alto})`);
    return;
  }

  // pares [actual | v2]
  const celda = Number(process.argv[3] || 300);
  const ids = process.argv.slice(4);
  if (!ids.length) { console.error("Faltan IDs"); process.exit(2); }
  const G = 10, ETIQ = 34, PAD = 18, POR_FILA = 3;
  const filas = [];
  for (let i = 0; i < ids.length; i += POR_FILA) filas.push(ids.slice(i, i + POR_FILA));

  const comp = [];
  let y = PAD;
  let anchoMax = 0;
  for (const fila of filas) {
    let x = PAD, altoFila = 0;
    for (const id of fila) {
      const a = await sharp(path.join(A, id + ".png")).resize({ width: celda }).toBuffer();
      const b = await sharp(path.join(V, id + ".png")).resize({ width: celda }).toBuffer();
      const ma = await sharp(a).metadata(), mb = await sharp(b).metadata();
      const rot = Buffer.from(`<svg width="${celda * 2 + G}" height="${ETIQ}" xmlns="http://www.w3.org/2000/svg">
        <text x="0" y="24" font-family="Segoe UI, sans-serif" font-size="17" font-weight="700" fill="#F2F3F5">${id}</text>
        <text x="70" y="24" font-family="Segoe UI, sans-serif" font-size="13" fill="#9AA0A8">antes</text>
        <text x="${celda + G + 8}" y="24" font-family="Segoe UI, sans-serif" font-size="13" fill="#5AA9FF">mi v2</text>
      </svg>`);
      comp.push({ input: rot, left: x, top: y });
      comp.push({ input: a, left: x, top: y + ETIQ });
      comp.push({ input: b, left: x + celda + G, top: y + ETIQ });
      altoFila = Math.max(altoFila, ETIQ + Math.max(ma.height, mb.height));
      x += celda * 2 + G + PAD;
    }
    anchoMax = Math.max(anchoMax, x);
    y += altoFila + PAD;
  }
  const salida = path.join(DIR, "salida", "pares.png");
  await sharp({ create: { width: anchoMax, height: y, channels: 3, background: "#0B0D11" } })
    .composite(comp).png({ compressionLevel: 9 }).toFile(salida);
  console.log(`PARES: ${salida}  (${anchoMax}x${y})`);
})();
