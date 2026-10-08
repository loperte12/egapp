// comparar-con-head.cjs — prueba de regresión VISUAL contra el commit HEAD.
//
// Reconstruye la plantilla tal como está en HEAD, renderiza la MISMA pantalla desde
// las dos versiones y compara los PNG píxel a píxel. Sirve para demostrar que una
// refactorización (mover clases, unificar piezas, renombrar) no cambia nada visible:
// el resultado esperado es 0 píxeles distintos.
//
// Uso:  node comparar-con-head.cjs <ID> [ancho] [alto] [escala]
//       node comparar-con-head.cjs IC-2 390 1100 2
//
// Nota: mide contra el último commit. Si acabas de arreglar algo a propósito,
// habrá diferencias — y eso es la prueba de que el arreglo llegó al render.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

function cargarSharp() {
  try {
    return require("sharp");
  } catch (e) { /* sigue */ }
  if (process.env.SHARP_PATH) {
    try {
      return require(process.env.SHARP_PATH);
    } catch (e) { /* sigue */ }
  }
  console.error("Falta el módulo 'sharp'. Arréglalo con:  npm i -D sharp");
  console.error("  o define SHARP_PATH apuntando a la carpeta que lo contiene.");
  process.exit(3);
}
const sharp = cargarSharp();

const DIR = __dirname;
const REPO = path.resolve(DIR, "..", "..");
const RENDER = path.join(DIR, "render-pantalla.cjs");
const TMP = path.join(os.tmpdir(), "comparar-con-head");

const [id = "IC-2", w = "390", h = "1100", esc = "2"] = process.argv.slice(2);

// 1. plantilla e IMÁGENES de HEAD, en binario (sin tocar codificaciones)
fs.mkdirSync(TMP, { recursive: true });
const rel = path.relative(REPO, path.join(DIR, "index.tpl.html")).split(path.sep).join("/");
const relDir = path.dirname(rel);
const tpl = execFileSync("git", ["show", "HEAD:" + rel], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 });
fs.writeFileSync(path.join(TMP, "index.tpl.html"), tpl);
fs.copyFileSync(path.join(DIR, "build-prototipo.cjs"), path.join(TMP, "build-prototipo.cjs"));
// Las imágenes se traen TAMBIÉN de HEAD: copiar las del árbol de trabajo dejaría la
// comparación ciega a cualquier cambio de assets (daría 0 diferencias siempre).
fs.mkdirSync(path.join(TMP, "img"), { recursive: true });
const imgsHead = execFileSync("git", ["ls-tree", "--name-only", `HEAD:${relDir}/img`], {
  cwd: REPO, encoding: "utf8",
}).trim().split("\n").filter(Boolean);
for (const f of imgsHead) {
  const buf = execFileSync("git", ["show", `HEAD:${relDir}/img/${f}`], {
    cwd: REPO, maxBuffer: 128 * 1024 * 1024,
  });
  fs.writeFileSync(path.join(TMP, "img", f), buf);
}
console.log(`(imágenes de HEAD: ${imgsHead.length})`);

// 2. construir esa versión
execFileSync(process.execPath, [path.join(TMP, "build-prototipo.cjs")], { stdio: "ignore" });

// 3. renderizar la misma pantalla desde las dos versiones
const antes = path.join(TMP, "antes.png");
const despues = path.join(TMP, "despues.png");
execFileSync(process.execPath, [RENDER, id, antes, w, h, esc], {
  stdio: "ignore",
  env: { ...process.env, INDEX: path.join(TMP, "index.html") },
});
execFileSync(process.execPath, [RENDER, id, despues, w, h, esc], { stdio: "ignore" });

// 4. comparar píxel a píxel
(async () => {
  const a = await sharp(antes).raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(despues).raw().toBuffer({ resolveWithObject: true });
  if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
    console.log(
      `TAMAÑOS DISTINTOS: ${a.info.width}x${a.info.height} (HEAD) vs ${b.info.width}x${b.info.height} (actual)`
    );
    process.exit(1);
  }
  const ch = a.info.channels;
  const total = a.info.width * a.info.height;
  let distintos = 0, sumaDelta = 0, maxDelta = 0, peor = -1;
  for (let i = 0; i < a.data.length; i += ch) {
    let d = 0;
    for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(a.data[i + k] - b.data[i + k]));
    if (d > 0) {
      distintos++;
      sumaDelta += d;
      if (d > maxDelta) { maxDelta = d; peor = i / ch; }
    }
  }
  const pct = ((distintos / total) * 100).toFixed(4);
  console.log(`${id}: ${a.info.width}x${a.info.height} · ${total} píxeles`);
  console.log(
    `  distintos: ${distintos} (${pct} %) · delta medio ${distintos ? (sumaDelta / distintos).toFixed(1) : 0} · delta máx ${maxDelta}`
  );
  if (peor >= 0) {
    console.log(`  peor píxel en (${peor % a.info.width}, ${Math.floor(peor / a.info.width)})`);
  }
  console.log(distintos === 0 ? "  RESULTADO: idéntico píxel a píxel" : "  RESULTADO: HAY DIFERENCIAS");
  console.log(`  PNG: ${antes}  |  ${despues}`);
  process.exit(distintos === 0 ? 0 : 1);
})();
