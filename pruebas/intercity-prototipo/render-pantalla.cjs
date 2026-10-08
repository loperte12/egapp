// render-pantalla.cjs — recorta UNA pantalla de index.html y la renderiza a PNG con Chrome headless.
//
// Uso:
//   node render-pantalla.cjs --list
//   node render-pantalla.cjs IC-1a salida.png [ancho] [alto] [escala]
//
// No depende de playwright/puppeteer: usa el Chrome instalado en modo headless.
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const DIR = __dirname;
const CHROME =
  process.env.CHROME ||
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// --- extrae un bloque <div class="pantalla"> ... </div> equilibrado -------------
function bloques(html) {
  const out = [];
  const marca = '<div class="pantalla">';
  let i = html.indexOf(marca);
  while (i !== -1) {
    let pos = i;
    let nivel = 0;
    let fin = -1;
    const re = /<div\b|<\/div>/g;
    re.lastIndex = i;
    let m;
    while ((m = re.exec(html))) {
      if (m[0] === "</div>") {
        nivel--;
        if (nivel === 0) {
          fin = m.index + m[0].length;
          break;
        }
      } else {
        nivel++;
      }
    }
    if (fin === -1) throw new Error("bloque .pantalla sin cierre equilibrado");
    out.push(html.slice(pos, fin));
    i = html.indexOf(marca, fin);
  }
  return out;
}

// --- id de la pantalla a partir de su .etiqueta --------------------------------
function idDe(bloque) {
  const m = bloque.match(/class="etiqueta"[^>]*>([^<]+)/);
  if (!m) return "(sin-etiqueta)";
  return m[1].trim().split("·")[0].trim();
}

function uso() {
  console.log("Uso: node render-pantalla.cjs --list");
  console.log("     node render-pantalla.cjs <ID> <salida.png> [ancho] [alto] [escala]");
  process.exit(1);
}

const args = process.argv.slice(2);
const html = fs.readFileSync(process.env.INDEX || path.join(DIR, "index.html"), "utf8");
const style = (html.match(/<style>[\s\S]*?<\/style>/) || [""])[0];
if (!style) throw new Error("index.html no tiene <style>");

const pantallas = bloques(html).map((b) => ({ b, id: idDe(b) }));

// envuelve un bloque .pantalla con el CSS del prototipo (+ CSS extra opcional)
function envoltorioBase(bloque, extraCss = "") {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">
${style}
<style>
  body{background:#0b0b0d;padding:0;margin:0}
  .etiqueta{display:none}
  .movil{margin:0}
${extraCss}
</style></head><body>
${bloque}
</body></html>`;
}

if (args[0] === "--list" || args.length === 0) {
  console.log("Pantallas encontradas: " + pantallas.length);
  pantallas.forEach((p, n) => console.log(String(n + 1).padStart(2) + ". " + p.id));
  // aviso: la lista debe cuadrar con las 17 etiquetas de la plantilla
  process.exit(0);
}

// --- modo --medir: layout real de la pantalla, sin adivinar por píxeles --------
if (args[0] === "--medir") {
  const id = args[1];
  const mw = args[2] || "800";
  const mh = args[3] || "600";
  const ms = args[4] || "1";
  const hit = pantallas.find((p) => p.id.toLowerCase() === String(id).toLowerCase());
  if (!hit) {
    console.error("No encuentro la pantalla '" + id + "'");
    process.exit(2);
  }
  const sonda = `<pre id="medidas"></pre><script>
(function(){
  const m = document.querySelector('.movil');
  const r = (el) => { if(!el) return null; const b = el.getBoundingClientRect();
    return {t:Math.round(b.top),b:Math.round(b.bottom),h:Math.round(b.height)}; };
  const out = {
    movil: r(m),
    movilScroll: m ? m.scrollHeight : null,
    desborde: m ? m.scrollHeight - m.clientHeight : null,
    topbar: r(document.querySelector('.topbar')),
    ticker: r(document.querySelector('.ticker')),
    mapa: r(document.querySelector('.portada-mapa')),
    sheet: r(document.querySelector('.sheet')),
    footer: r(document.querySelector('.footer')),
    botones: [...document.querySelectorAll('.sheet .btn')].map(r),
    mcards: [...document.querySelectorAll('.mcard')].map(r),
    tiles: [...document.querySelectorAll('.foto-tile')].map((el) => {
      const b = el.getBoundingClientRect();
      return { w: Math.round(b.width), h: Math.round(b.height), t: Math.round(b.top) };
    }),
    mini: [...document.querySelectorAll('.btn.mini, .contador button')].map(r),
    hijos: m ? [...m.children].map((el) => {
      const b = el.getBoundingClientRect();
      const cls = (el.className || '').toString().split(' ')[0] || el.tagName.toLowerCase();
      return { cls, t: Math.round(b.top), h: Math.round(b.height) };
    }) : [],
  };
  document.getElementById('medidas').textContent = 'MEDIDAS' + JSON.stringify(out) + 'FIN';
})();
</script>`;
  const tmp2 = path.join(os.tmpdir(), "medir-" + id.replace(/[^\w.-]/g, "_") + ".html");
  fs.writeFileSync(tmp2, envoltorioBase(hit.b, "") + sonda, "utf8");
  const dom = execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--dump-dom",
    "--force-device-scale-factor=" + ms,
    `--window-size=${mw},${mh}`,
    "file:///" + tmp2.replace(/\\/g, "/")], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const mm = dom.match(/MEDIDAS(\{[\s\S]*?\})FIN/);
  if (!mm) {
    console.error("no pude leer las medidas");
    process.exit(3);
  }
  console.log(JSON.stringify(JSON.parse(mm[1]), null, 2));
  process.exit(0);
}

const [id, salida, w = "390", h = "844", escala = "2"] = args;
const hit = pantallas.find((p) => p.id.toLowerCase() === id.toLowerCase());
if (!hit) {
  console.error("No encuentro la pantalla '" + id + "'. Disponibles:");
  pantallas.forEach((p) => console.error("  " + p.id));
  process.exit(2);
}

// se oculta la etiqueta superior: aquí solo interesa el móvil
const envoltorio = envoltorioBase(hit.b, process.env.EXTRA_CSS || "");

const tmp = path.join(os.tmpdir(), "render-" + id.replace(/[^\w.-]/g, "_") + ".html");
fs.writeFileSync(tmp, envoltorio, "utf8");

const salidaAbs = path.resolve(salida);
// headless=new recorta ~78 px del alto pedido: se añade holgura para que el móvil
// completo (844) se pinte entero. El PNG sale (h+80) alto, con una franja de fondo.
const altoReal = Number(h) + 80;
execFileSync(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--disable-extensions",
    "--default-background-color=00000000",
    "--force-device-scale-factor=" + escala,
    `--window-size=${w},${altoReal}`,
    `--screenshot=${salidaAbs}`,
    "file:///" + tmp.replace(/\\/g, "/"),
  ],
  { stdio: "inherit" }
);

const kb = (fs.statSync(salidaAbs).size / 1024).toFixed(1);
console.log(`OK ${salidaAbs} (${kb} KB) · pantalla ${hit.id} · ${w}x${h} @${escala}x`);
