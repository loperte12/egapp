// proponer-contraste.cjs — para cada par que falla, busca el color MÁS CERCANO
// (mismo tono y saturación, solo sube/baja la luminosidad) que alcanza el mínimo AA.
// Uso: node proponer-contraste.cjs
const fs = require("fs");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const root = (html.match(/:root\{([\s\S]*?)\}/) || [])[1] || "";
const vars = {};
for (const m of root.matchAll(/--([\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})/g)) vars["--" + m[1]] = m[2].toUpperCase();

const toRgb = (h) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16));
const lum = (hex) => {
  const c = toRgb(hex).map((v) => v / 255).map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  const l = (mx + mn) / 2;
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return [h, s, l];
}
function hslToRgb([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let p = [0, 0, 0];
  if (h < 60) p = [c, x, 0]; else if (h < 120) p = [x, c, 0]; else if (h < 180) p = [0, c, x];
  else if (h < 240) p = [0, x, c]; else if (h < 300) p = [x, 0, c]; else p = [c, 0, x];
  return p.map((v) => Math.round((v + m) * 255));
}
const hex = (rgb) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();

const PARES = [
  ["--bg", "--faint", 12, "texto atenuado"],
  ["--card", "--faint", 10, "footer inactivo"],
  ["--card", "--primary", 10, "footer activo + enlaces"],
  ["--field", "--faint", 13, "chip.off"],
  ["--bg", "--price", 15, "precio (dato clave)"],
  ["--card", "--ok", 11, "etiqueta Verificado (verde)"],
];

console.log("par (fondo / texto)          actual   mín  propuesta   nuevo");
console.log("-".repeat(78));
for (const [f, t, px, etiqueta] of PARES) {
  const bg = vars[f], fg = vars[t];
  if (!bg || !fg) { console.log("  falta variable para " + etiqueta); continue; }
  const min = px >= 24 ? 3 : 4.5;
  const actual = ratio(fg, bg);
  if (actual >= min) { console.log(`${etiqueta.padEnd(26)} ${actual.toFixed(2).padStart(6)}  ya cumple`); continue; }
  const [h, s, l0] = rgbToHsl(toRgb(fg));
  const subir = lum(bg) < lum(fg); // fondo oscuro -> aclarar el texto
  let prop = null;
  for (let i = 1; i <= 1000; i++) {
    const l = subir ? Math.min(1, l0 + i * 0.001) : Math.max(0, l0 - i * 0.001);
    const cand = hex(hslToRgb([h, s, l]));
    if (ratio(cand, bg) >= min) { prop = cand; break; }
    if (l === 0 || l === 1) break;
  }
  if (!prop) { console.log(`${etiqueta.padEnd(26)} ${actual.toFixed(2).padStart(6)}  sin solución en HSL`); continue; }
  console.log(
    `${etiqueta.padEnd(26)} ${actual.toFixed(2).padStart(6)} ${String(min).padStart(4)}  ${fg} →  ${prop} (${ratio(prop, bg).toFixed(2)})`
  );
}
console.log("-".repeat(78));
console.log("Nota: mantiene tono y saturación; solo mueve luminosidad lo justo.");
