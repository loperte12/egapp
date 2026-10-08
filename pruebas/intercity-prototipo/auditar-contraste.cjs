// auditar-contraste.cjs — ratios WCAG 2.x de los pares de color del prototipo.
// Lee las variables de :root en index.html y evalúa una lista declarada de pares.
//
// Uso:  node auditar-contraste.cjs
// Como módulo: const { auditar } = require("./auditar-contraste.cjs"); auditar() -> {filas, fallos}
const fs = require("fs");
const path = require("path");

const toRgb = (h) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16));
const lum = (hex) => {
  const c = toRgb(hex)
    .map((v) => v / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

// [fondo, primer plano, tamaño px, etiqueta]
// AA: 4.5:1 texto normal · 3:1 texto grande (>=24px)
const PARES = [
  ["--bg", "--faint", 10, "pie: pestaña inactiva"],
  ["--card", "--faint", 10, "pie: inactiva sobre tarjeta"],
  ["--card", "--link", 10, "pie: PESTAÑA ACTIVA"],
  ["--field", "--faint", 13, "chip desactivado / placeholder"],
  ["--bg", "--faint", 12, "campo secundario"],
  ["--bg", "--price-text", 15, "precio (dato clave)"],
  ["--bg", "--muted", 12, "texto secundario .nota/.rotulo"],
  ["--field", "--link", 11, "enlace «Cambiar»"],
  ["--primary", "#FFFFFF", 16, "botón primario"],
  ["--bg", "--text", 15, "texto principal"],
  ["--bg", "--desc", 13, "día con descuento"],
  ["--field", "--muted", 11, ".mapa-tag"],
  ["--card", "--ok-text", 11, "sello «Verificado» sobre foto"],
  ["--card", "--desc", 12, "badge de descuento"],
  ["--bg", "--ok-text", 12, "verde sobre fondo"],
];

function auditar(raiz, fichero) {
  const html = fs.readFileSync(path.join(raiz || __dirname, fichero || process.env.INDEX || "index.html"), "utf8");
  const root = (html.match(/:root\{([\s\S]*?)\}/) || [])[1] || "";
  const vars = {};
  for (const m of root.matchAll(/--([\w-]+)\s*:\s*(#[0-9A-Fa-f]{6})/g)) {
    vars["--" + m[1]] = m[2].toUpperCase();
  }
  const get = (k) => (k.startsWith("#") ? k.toUpperCase() : vars[k]);

  const filas = [];
  let fallos = 0;
  for (const [f, t, px, etiqueta] of PARES) {
    const bg = get(f), fg = get(t);
    if (!bg || !fg) {
      filas.push({ etiqueta, error: "falta " + (!bg ? f : t) });
      continue;
    }
    const min = px >= 24 ? 3 : 4.5;
    const r = ratio(bg, fg);
    const ok = r >= min;
    if (!ok) fallos++;
    filas.push({ etiqueta, ratio: r, min, ok, px, fg, bg });
  }
  return { filas, fallos };
}

if (require.main === module) {
  const { filas, fallos } = auditar(__dirname);
  console.log("%s  %s  %s  %s", "ratio".padEnd(6), "AA".padEnd(5), "px".padEnd(4), "elemento");
  console.log("-".repeat(72));
  for (const f of filas) {
    if (f.error) { console.log("  ??   s/d   " + f.etiqueta + " (" + f.error + ")"); continue; }
    console.log(
      "%s  %s  %s  %s",
      f.ratio.toFixed(2).padStart(5),
      (f.ok ? "OK" : "FALLA").padEnd(5),
      String(f.px).padEnd(4),
      f.etiqueta + "  (" + f.fg + " sobre " + f.bg + ", min " + f.min + ")"
    );
  }
  console.log("-".repeat(72));
  console.log(fallos + " de " + filas.length + " pares por debajo de WCAG AA");
  process.exit(fallos ? 1 : 0);
}

module.exports = { auditar, ratio, PARES };
