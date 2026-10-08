// recortar-fondo.cjs — quita el fondo incrustado de los PNG de vehículo (alfa real).
//
// Método en dos átomos:
//   1. Inundación (flood fill) DESDE EL BORDE con la paleta de fondo medida en el anillo.
//      Nunca umbral global: así el techo blanco del minibús sobre fondo blanco sobrevive
//      (no está conectado al borde).
//   2. De lo que queda, se conserva SOLO la componente conexa mayor (el vehículo) y se
//      hacen transparentes las islas: son fondos encerrados (huecos entre ruedas,
//      ventanillas) y motas de compresión que la inundación no alcanza.
//
// Uso:
//   node recortar-fondo.cjs --dry-run         mide y NO escribe nada
//   node recortar-fondo.cjs                   escribe img/*.png (con copia .bak-fondo)
// Opciones: --tol=N (tolerancia |dr|+|dg|+|db|, por defecto 30)
const fs = require("fs");
const path = require("path");

function cargarSharp() {
  try { return require("sharp"); } catch (e) {}
  if (process.env.SHARP_PATH) { try { return require(process.env.SHARP_PATH); } catch (e) {} }
  console.error("Falta sharp. Arréglalo con: npm i -D sharp"); process.exit(3);
}
const sharp = cargarSharp();

const DIR = __dirname;
const IMGS = ["coche.png", "van.png", "minibus.png", "camion.png"];
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const TOL = Number((args.find((a) => a.startsWith("--tol=")) || "--tol=30").split("=")[1]);
// Carpeta de previsualización: si se indica, NO se sobrescriben los originales.
const SALIDA = (args.find((a) => a.startsWith("--salida=")) || "").split("=")[1] || "";
// Una isla mayor que esto no es una mota: es un trozo del vehículo y se conserva.
const UMBRAL_ISLA = 0.002;
// Permite procesar solo algunas imágenes: --solo=coche.png,minibus.png
const SOLO = ((args.find((a) => a.startsWith("--solo=")) || "").split("=")[1] || "")
  .split(",").map((s) => s.trim()).filter(Boolean);

const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
const hex = (c) => "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");

function paletaFondo(anillo) {
  const cuenta = new Map();
  for (const c of anillo) {
    const k = c.map((v) => Math.round(v / 8) * 8).join(",");
    const e = cuenta.get(k) || { n: 0, sum: [0, 0, 0] };
    e.n++; for (let i = 0; i < 3; i++) e.sum[i] += c[i];
    cuenta.set(k, e);
  }
  return [...cuenta.values()]
    .filter((e) => e.n / anillo.length >= 0.02)
    .sort((a, b) => b.n - a.n).slice(0, 4)
    .map((e) => e.sum.map((v) => Math.round(v / e.n)));
}

(async () => {
  const resumen = [];
  for (const f of IMGS) {
    if (SOLO.length && !SOLO.includes(f)) continue;
    const p = path.join(DIR, "img", f);
    const { data, info } = await sharp(p).raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels, W = info.width, H = info.height;
    const px = (x, y) => { const i = (y * W + x) * ch; return [data[i], data[i + 1], data[i + 2]]; };

    const anillo = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
      if (x < 4 || y < 4 || x >= W - 4 || y >= H - 4) anillo.push(px(x, y));
    const paleta = paletaFondo(anillo);
    const esFondo = (c) => paleta.some((q) => dist(c, q) <= TOL);

    // --- átomo 1: inundación desde el borde -----------------------------------
    const trans = new Uint8Array(W * H);
    const cola = [];
    const mete = (x, y) => { const k = y * W + x; if (!trans[k] && esFondo(px(x, y))) { trans[k] = 1; cola.push(k); } };
    for (let x = 0; x < W; x++) { mete(x, 0); mete(x, H - 1); }
    for (let y = 0; y < H; y++) { mete(0, y); mete(W - 1, y); }
    for (let i = 0; i < cola.length; i++) {
      const k = cola[i], x = k % W, y = (k - x) / W;
      if (x > 0) mete(x - 1, y); if (x < W - 1) mete(x + 1, y);
      if (y > 0) mete(x, y - 1); if (y < H - 1) mete(x, y + 1);
    }

    // --- átomo 2: componentes conexas de lo que queda --------------------------
    const comp = new Int32Array(W * H).fill(-1);
    const tam = [];
    const caja = [];
    for (let i0 = 0; i0 < W * H; i0++) {
      if (trans[i0] || comp[i0] !== -1) continue;
      const id = tam.length;
      let n = 0, ax0 = W, ay0 = H, ax1 = -1, ay1 = -1;
      const c2 = [i0]; comp[i0] = id;
      for (let j = 0; j < c2.length; j++) {
        const k = c2[j], x = k % W, y = (k - x) / W;
        n++;
        if (x < ax0) ax0 = x; if (x > ax1) ax1 = x; if (y < ay0) ay0 = y; if (y > ay1) ay1 = y;
        const vec = [];
        if (x > 0) vec.push(k - 1); if (x < W - 1) vec.push(k + 1);
        if (y > 0) vec.push(k - W); if (y < H - 1) vec.push(k + W);
        for (const v of vec) if (!trans[v] && comp[v] === -1) { comp[v] = id; c2.push(v); }
      }
      tam.push(n); caja.push([ax0, ay0, ax1, ay1]);
    }
    let mayor = 0;
    for (let i = 1; i < tam.length; i++) if (tam[i] > tam[mayor]) mayor = i;
    const islas = tam.length - 1;
    const pxIslas = tam.reduce((s, v, i) => (i === mayor ? s : s + v), 0);
    const candidatos = tam.reduce((s, v) => s + v, 0);

    // --- censo final y borde (franja de mezcla junto a la transparencia) -------
    const [bx0, by0, bx1, by1] = caja[mayor];
    let franja = 0, perimetro = 0;
    for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
      const k = y * W + x;
      if (comp[k] !== mayor) continue;
      let toca = false;
      for (let dy = -1; dy <= 1 && !toca; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (comp[ny * W + nx] !== mayor) { toca = true; break; }
      }
      if (!toca) continue;
      perimetro++;
      if (Math.min(...paleta.map((q) => dist(px(x, y), q))) <= TOL * 2) franja++;
    }

    const noFondo = comp.reduce((s, v, i) => s + (v === mayor ? 0 : 1), 0); // informativo
    const pctTrans = (trans.reduce((s, v) => s + v, 0) + pxIslas) / (W * H) * 100;
    const pctIslas = candidatos ? pxIslas / candidatos * 100 : 0;
    // Regla corregida: se descartan las islas PEQUEÑAS (motas de compresión y fondos
    // encerrados diminutos). Una isla grande es un trozo del vehículo y se conserva.
    const lim = W * H * UMBRAL_ISLA;
    const conservadas = tam.filter((n, i) => i !== mayor && n >= lim);
    const descartadas = tam.filter((n, i) => i !== mayor && n < lim);
    const pxDescartadas = descartadas.reduce((s, n) => s + n, 0);
    const pxConservadas = conservadas.reduce((s, n) => s + n, 0);
    const opaco = (k) => comp[k] === mayor || (comp[k] >= 0 && tam[comp[k]] >= lim);
    // diagnóstico: ¿alguna isla es un trozo del vehículo, o son motas?
    const orden = tam.map((n, i) => ({ n, i })).filter((o) => o.i !== mayor).sort((a, b) => b.n - a.n);
    const mayorIsla = orden.length ? orden[0] : { n: 0 };
    const apto = pxDescartadas / (W * H) < 0.01 && tam[mayor] / (W * H) > 0.05;

    console.log(`${f}  tol=${TOL}`);
    console.log(`   fondo: ${paleta.map(hex).join(" + ")}`);
    console.log(`   caja del vehiculo x[${bx0}..${bx1}] y[${by0}..${by1}]  (${(tam[mayor] / (W * H) * 100).toFixed(1)} % del lienzo)`);
    console.log(`   islas: ${islas} · la mayor ${mayorIsla.n} px (${(mayorIsla.n / (W * H) * 100).toFixed(3)} %)`);
    console.log(`     conservadas (>=${(lim / 1000).toFixed(0)}k px): ${conservadas.length} = ${(pxConservadas / (W * H) * 100).toFixed(2)} % del lienzo`);
    console.log(`     descartadas (motas):  ${descartadas.length} = ${(pxDescartadas / (W * H) * 100).toFixed(2)} % del lienzo`);
    console.log(`   transparente total: ${pctTrans.toFixed(1)} % del lienzo`);
    console.log(`   → ${apto ? "APTO" : "NO APTO"}`);
    console.log("");

    resumen.push({ f, apto });

    if (!DRY && apto) {
      const out = Buffer.alloc(W * H * 4);
      for (let i = 0, k = 0; i < W * H; i++, k += 4) {
        out[k] = data[i * ch]; out[k + 1] = data[i * ch + 1]; out[k + 2] = data[i * ch + 2];
        out[k + 3] = opaco(i) ? 255 : 0;
      }
      const buf = await sharp(out, { raw: { width: W, height: H, channels: 4 } })
        .png({ compressionLevel: 9 }).toBuffer();
      if (SALIDA) {
        fs.mkdirSync(SALIDA, { recursive: true });
        fs.writeFileSync(path.join(SALIDA, f), buf);
        console.log(`   PREVISUALIZADO en ${path.join(SALIDA, f)} (original intacto)`);
      } else {
        const bak = p + ".bak-fondo";
        if (!fs.existsSync(bak)) fs.copyFileSync(p, bak);
        fs.writeFileSync(p, buf);
        console.log(`   ESCRITO ${f} (copia: ${path.basename(bak)})`);
      }
    }
  }
  console.log(DRY ? "DRY-RUN: no se ha escrito nada." : "Escritura terminada.");
  const malos = resumen.filter((r) => !r.apto);
  console.log(malos.length ? "NO aptos: " + malos.map((m) => m.f).join(", ") : "Los 4 pasan las puertas.");
})();
