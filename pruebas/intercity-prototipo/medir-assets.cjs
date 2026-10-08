// medir-assets.cjs — convierte en hechos las hipótesis sobre los PNG de vehículo.
// Para cada imagen mide:
//   - si el fondo es uniforme (anillo exterior: color dominante y % de píxeles que lo cumplen)
//   - si el sujeto TOCA el borde (lo que impediría recortar el fondo por umbral)
//   - si hay patrón de damero (alternancia regular de dos colores claros)
const fs = require("fs");
const path = require("path");

function cargarSharp() {
  try { return require("sharp"); } catch (e) {}
  if (process.env.SHARP_PATH) { try { return require(process.env.SHARP_PATH); } catch (e) {} }
  console.error("Falta sharp"); process.exit(3);
}
const sharp = cargarSharp();
const DIR = __dirname;

const IMGS = ["coche.png", "van.png", "minibus.png", "camion.png"];
const GRIS = 8; // grosor del anillo exterior en px

const dist = (a, b) => Math.abs(a[0]-b[0]) + Math.abs(a[1]-b[1]) + Math.abs(a[2]-b[2]);
const hex = (c) => "#" + c.map(v => v.toString(16).padStart(2, "0")).join("");

(async () => {
  for (const f of IMGS) {
    const p = path.join(DIR, "img", f);
    const meta = await sharp(p).metadata();
    const { data, info } = await sharp(p).raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels, W = info.width, H = info.height;
    const px = (x, y) => { const i = (y*W+x)*ch; return [data[i], data[i+1], data[i+2]]; };

    // --- anillo exterior -----------------------------------------------------
    const anillo = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (x < GRIS || y < GRIS || x >= W-GRIS || y >= H-GRIS) anillo.push(px(x,y));

    // color dominante del anillo, cuantizado a 8 niveles por canal
    const cuenta = new Map();
    for (const c of anillo) {
      const k = c.map(v => Math.round(v/8)*8).join(",");
      cuenta.set(k, (cuenta.get(k) || 0) + 1);
    }
    const [kDom, nDom] = [...cuenta.entries()].sort((a,b) => b[1]-a[1])[0];
    const dom = kDom.split(",").map(Number);
    const cubren = anillo.filter(c => dist(c, dom) <= 24).length / anillo.length;

    // --- ¿el sujeto toca el borde? (píxeles del anillo lejanos al dominante) --
    const intrusos = anillo.filter(c => dist(c, dom) > 90).length / anillo.length;

    // --- ¿damero? alternancia en la fila y=3 ---------------------------------
    const fila = []; for (let x = 0; x < W; x++) fila.push(px(x, 3));
    let cambios = 0, saltos = [];
    for (let x = 1; x < W; x++) if (dist(fila[x], fila[x-1]) > 12) { cambios++; if (saltos.length < 6) saltos.push(x); }
    const periodos = saltos.slice(1).map((v,i) => v - saltos[i]);

    console.log(`${f}  ${W}x${H}  alpha=${!!meta.hasAlpha}  canales=${ch}`);
    console.log(`   anillo ${GRIS}px: dominante ${hex(dom)} cubre ${(cubren*100).toFixed(1)} %  ·  intrusos(>90) ${(intrusos*100).toFixed(2)} %`);
    console.log(`   fila y=3: ${cambios} cambios de color · primeros cortes en x=${saltos.join(",")} · periodos ${periodos.join(",") || "-"}`);
    console.log(`   colores distintos en el anillo: ${cuenta.size}`);
    console.log("");
  }
})();
