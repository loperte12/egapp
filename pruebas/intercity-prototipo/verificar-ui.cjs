// verificar-ui.cjs — red de seguridad del prototipo de Intercity.
//
// Comprueba, en UNA pasada de Chrome headless sobre index.html:
//   1. que ningún marco .movil desborde por abajo (contenido cortado),
//   2. que no haya desborde horizontal,
//   3. que ningún contenedor con overflow:hidden esté recortando contenido,
//   4. que los marcos fijos midan 844 px.
// Y después los ratios de contraste WCAG AA (auditar-contraste.cjs).
//
// Uso: node verificar-ui.cjs     → sale con código ≠ 0 si algo falla
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");
const { auditar } = require("./auditar-contraste.cjs");

const DIR = __dirname;
const CHROME =
  process.env.CHROME || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const ALTO_MOVIL = 844;

// --- frescura del build -------------------------------------------------------
const tTpl = fs.statSync(path.join(DIR, "index.tpl.html")).mtimeMs;
const tIdx = fs.statSync(path.join(DIR, "index.html")).mtimeMs;
const avisos = [];
if (tIdx < tTpl) {
  avisos.push(
    "index.html es más antiguo que index.tpl.html: recompila con `node build-prototipo.cjs`"
  );
}

// --- sonda de layout ----------------------------------------------------------
const html = fs.readFileSync(path.join(DIR, "index.html"), "utf8");

const SONDA = `<pre id="ui-audit"></pre>
<script>
(function(){
  const clase = (el) => (el.className || '').toString().trim().split(/\\s+/)[0] || el.tagName.toLowerCase();
  const res = [];
  document.querySelectorAll('.pantalla').forEach(function(p, i){
    const et = p.querySelector('.etiqueta');
    const id = et ? et.textContent.trim().split('·')[0].trim() : ('?' + i);
    const m = p.querySelector('.movil');
    if (!m) { res.push({ id: id, error: 'sin .movil' }); return; }
    const r = m.getBoundingClientRect();
    const recortes = [];
    m.querySelectorAll('*').forEach(function(el){
      if (el === m) return;
      if (el.closest('.ticker') || el.closest('.cal-drawer')) return; // recortan a propósito
      const cs = getComputedStyle(el);
      if (cs.overflowY !== 'hidden') return;
      const d = el.scrollHeight - el.clientHeight;
      if (d > 2) recortes.push(clase(el) + ' +' + d + 'px');
    });
    res.push({
      id: id,
      larga: m.classList.contains('larga'),
      alto: Math.round(r.height),
      desbordeV: m.scrollHeight - m.clientHeight,
      desbordeH: m.scrollWidth - m.clientWidth,
      recortes: recortes.slice(0, 4),
      nRecortes: recortes.length
    });
    // objetivos táctiles: WCAG 2.5.8 (AA) exige >= 24x24 CSS px
    const objetivos = m.querySelectorAll('button, a[href], [role="button"], .btn');
    let bajo24 = [], bajo44 = 0, bajo44lista = [];
    objetivos.forEach(function(el){
      const b = el.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) return;
      const w = Math.round(b.width), h = Math.round(b.height);
      const desc = w + 'x' + h + ' «' + (el.textContent || '').trim().slice(0, 22) + '»';
      if (w < 24 || h < 24) bajo24.push(clase(el) + ' ' + desc);
      else if (w < 44 || h < 44) { bajo44++; if (bajo44lista.length < 4) bajo44lista.push(desc); }
    });
    res[res.length - 1].bajo24 = bajo24;
    res[res.length - 1].bajo44 = bajo44;
    res[res.length - 1].bajo44lista = bajo44lista;
    // navegación inferior: todas las pantallas la llevan, salvo los escalones del
    // funnel de reserva, que la omiten a propósito y lo declaran con .sin-nav
    const ft = m.querySelector('.footer');
    res[res.length - 1].nav = ft
      ? { tabs: ft.querySelectorAll('.ftab').length, sel: ft.querySelectorAll('.ftab.sel').length }
      : null;
    res[res.length - 1].sinNav = m.classList.contains('sin-nav');
  });
  document.getElementById('ui-audit').textContent = 'UIAUDIT' + JSON.stringify(res) + 'FIN';
})();
</script>`;

const tmp = path.join(os.tmpdir(), "verificar-ui.html");
fs.writeFileSync(tmp, html.replace("</body>", SONDA + "\n</body>"), "utf8");

const dom = execFileSync(
  CHROME,
  ["--headless=new", "--disable-gpu", "--dump-dom", "--window-size=1600,1400",
   "file:///" + tmp.replace(/\\/g, "/")],
  { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 }
);

const m = dom.match(/UIAUDIT(\[[\s\S]*?\])FIN/);
if (!m) {
  console.error("No pude leer la sonda de layout (¿Chrome falló o la página no cargó?)");
  process.exit(2);
}
const pantallas = JSON.parse(m[1]);

// --- evaluación ---------------------------------------------------------------
let fallos = 0;
console.log("PANTALLA   ALTO   DESB.V  DESB.H  RECORTES  <24px  <44px  VEREDICTO");
console.log("-".repeat(84));
for (const p of pantallas) {
  if (p.error) {
    console.log(`${p.id.padEnd(10)} —      ${p.error}`);
    fallos++;
    continue;
  }
  const problemas = [];
  if (p.desbordeV > 0) problemas.push("desborda " + p.desbordeV + "px por abajo");
  if (p.desbordeH > 0) problemas.push("desborda " + p.desbordeH + "px a lo ancho");
  if (p.nRecortes) problemas.push("recorta: " + p.recortes.join(", "));
  if (p.bajo24.length) problemas.push("objetivo táctil <24px: " + p.bajo24.join(", "));
  if (p.nav && p.sinNav) problemas.push("declara .sin-nav pero lleva navegación inferior");
  else if (!p.nav && !p.sinNav) problemas.push("sin navegación inferior (y sin declarar .sin-nav)");
  else if (p.nav && p.nav.tabs !== 5) problemas.push("nav con " + p.nav.tabs + " pestañas (deben ser 5)");
  else if (p.nav && p.nav.sel !== 1) problemas.push("nav con " + p.nav.sel + " pestañas activas (debe ser 1)");
  if (!p.larga && p.alto !== ALTO_MOVIL) problemas.push("marco fijo de " + p.alto + "px");
  const ok = problemas.length === 0;
  if (!ok) fallos++;
  console.log(
    "%s %s %s %s %s %s %s  %s",
    p.id.padEnd(10),
    String(p.alto).padStart(4),
    String(p.desbordeV).padStart(7),
    String(p.desbordeH).padStart(7),
    String(p.nRecortes).padStart(8),
    String(p.bajo24.length).padStart(5),
    String(p.bajo44).padStart(6),
    ok ? "OK" : "FALLA → " + problemas.join(" · ")
  );
}
console.log("-".repeat(84));
console.log(pantallas.length + " pantallas · " + fallos + " con problemas");
const totalBajo44 = pantallas.reduce((a, p) => a + (p.bajo44 || 0), 0);
console.log(
  "INFO: " + totalBajo44 + " objetivos entre 24 y 44 px (pasan AA; por debajo del ideal táctil de 44)"
);
for (const p of pantallas) {
  if (p.bajo44) {
    console.log("        " + p.id.padEnd(7) + p.bajo44 + ": " + (p.bajo44lista || []).join(" · "));
  }
}

// --- contraste ----------------------------------------------------------------
console.log("");
const { filas, fallos: fallosContraste } = auditar(DIR);
console.log("CONTRASTE WCAG AA");
console.log("-".repeat(64));
for (const f of filas) {
  if (f.error) { console.log("  ??  " + f.etiqueta); continue; }
  console.log(
    "%s  %s  %s",
    f.ratio.toFixed(2).padStart(5),
    (f.ok ? "OK" : "FALLA").padEnd(5),
    f.etiqueta
  );
}
console.log("-".repeat(64));
console.log(fallosContraste + " de " + filas.length + " pares por debajo de AA");

// --- resumen ------------------------------------------------------------------
if (avisos.length) {
  console.log("");
  avisos.forEach((a) => console.log("AVISO: " + a));
}
console.log("");
const total = fallos + fallosContraste;
console.log(total === 0 ? "VERIFICACIÓN UI: TODO OK" : "VERIFICACIÓN UI: " + total + " FALLOS");
process.exit(total === 0 ? 0 : 1);
