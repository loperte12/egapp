#!/usr/bin/env node
/**
 * Deriva las DOS TANDAS de variables de MasterGo desde el volcado del servidor.
 *
 * POR QUE EXISTE
 * El esquema de variables tiene tres puertas duras y una regla de orden:
 *   1. prohibido crear variables de tamano semantico (间距/, 圆角/, 描边/, 字号/...)
 *   2. la coleccion `语义` SOLO admite PAINT y el nombre debe empezar por `颜色/`
 *   3. el `语义` DEBE `reference` un `基础色板/...` ya existente
 *   4. DOS TANDAS: primero la basica, despues la semantica. Nunca en el mismo envio.
 * Escribir 68 variables a mano es garantizar un nombre mal escrito, y una referencia
 * rota no da error: simplemente no pinta. Este script las deriva y las verifica.
 *
 * SALIDA
 *   pruebas/variables-tanda1-basica.json      (COLOR + NUMBER, collection 基础)
 *   pruebas/variables-tanda2-semantica.json   (PAINT, collection 语义, con reference)
 *
 * PUERTAS (si alguna falla, NO escribe nada)
 *   - cada valor de la tanda 1 existe de verdad en packages/ui-kit/src/theme/colors.ts
 *   - cero valores repetidos dentro de la tanda 1 (dos nombres, un color = una mentira)
 *   - cada `reference` de la tanda 2 apunta a un nombre que existe en la tanda 1
 *   - cero nombres de tamano semantico prohibidos
 *   - cero nombres duplicados dentro de cada tanda
 *   - todos los nombres de la tanda 2 empiezan por `颜色/`
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const SERVER = "C:/Users/nisang12/.mgmcp/resources/library/local-205808662226877/\u65b0\u6587\u4ef6/variable.json";
const KIT = path.join(RAIZ, "packages", "ui-kit", "src", "theme", "colors.ts");
const OUT1 = path.join(__dirname, "variables-tanda1-basica.json");
const OUT2 = path.join(__dirname, "variables-tanda2-semantica.json");

const fallos = [];
const oks = [];

/* ------------------------------------------------------------------ *
 * ARREGLO DECLARADO del basico que miente
 * `基础色板/玫瑰/500` se creo con #ffffff (el blanco), que ya esta en
 * `中性/0`: dos entradas con el mismo valor y un nombre que no corresponde.
 * La familia 玫瑰 es el rosa de "me gusta"; el valor que falta en la paleta
 * es brand.like (#FF2442), que es justo el corazon del favorito de la pantalla.
 * ------------------------------------------------------------------ */
const ARREGLOS = {
  "\u57fa\u7840\u8272\u677f/\u73ab\u7470/500": { valor: "#ff2442", motivo: "brand.like (era #ffffff, el blanco, que ya esta en 中性/0)" },
};

/* ------------------------------------------------------------------ *
 * TANDA 2 — semantica. Solo COLOR. Cada fila: nombre -> [亮色, 暗色],
 * y cada celda es el NOMBRE de un basico de la tanda 1 (no un valor).
 * Salen del kit: lightColors / darkColors de colors.ts.
 * ------------------------------------------------------------------ */
const SEMANTICA = [
  ["\u989c\u8272/\u6587\u672c/\u4e3b\u8981", "\u77f3\u677f/1000", "\u77f3\u677f/100", "textPrimary: #1D2129 claro / #F2F3F5 oscuro"],
  ["\u989c\u8272/\u6587\u672c/\u6b21\u8981", "\u77f3\u677f/600", "\u77f3\u677f/400", "textSecondary: #6B7280 / #A9AEB8"],
  ["\u989c\u8272/\u6587\u672c/\u53cd\u8272", "\u4e2d\u6027/0", "\u4e2d\u6027/0", "white: #FFFFFF en los dos temas"],
  ["\u989c\u8272/\u586b\u5145/\u80cc\u666f", "\u4e2d\u6027/0", "\u77f3\u58a8/950", "background: #FFFFFF / #17171A"],
  ["\u989c\u8272/\u586b\u5145/\u8868\u9762", "\u77f3\u677f/50", "\u77f3\u58a8/900", "surface: #F5F7FA / #1E1E23"],
  ["\u989c\u8272/\u586b\u5145/\u5361\u7247", "\u4e2d\u6027/0", "\u77f3\u58a8/850", "card: #FFFFFF / #232329"],
  ["\u989c\u8272/\u586b\u5145/\u8868\u5355", "\u4e2d\u6027/0", "\u77f3\u58a8/800", "sheet (la hoja sobre la tarjeta): #FFFFFF / #2E3338"],
  ["\u989c\u8272/\u586b\u5145/\u64cd\u4f5c/\u4e3b\u8981", "\u84dd\u8272/600", "\u84dd\u8272/600", "primary como RELLENO: #0066CC en los dos temas"],
  ["\u989c\u8272/\u586b\u5145/\u64cd\u4f5c/\u6309\u4e0b", "\u84dd\u8272/700", "\u84dd\u8272/700", "primaryPressed: #00529E"],
  ["\u989c\u8272/\u6587\u672c/\u64cd\u4f5c/\u4e3b\u8981", "\u84dd\u8272/600", "\u84dd\u8272/400", "primary como TEXTO: #0066CC / #5FA9EE"],
  ["\u989c\u8272/\u586b\u5145/\u72b6\u6001/\u6210\u529f", "\u7eff\u8272/700", "\u7eff\u8272/700", "success como relleno"],
  ["\u989c\u8272/\u6587\u672c/\u72b6\u6001/\u6210\u529f", "\u7eff\u8272/700", "\u7eff\u8272/400", "success como texto"],
  ["\u989c\u8272/\u586b\u5145/\u72b6\u6001/\u5371\u9669", "\u7ea2\u8272/600", "\u7ea2\u8272/600", "danger como relleno"],
  ["\u989c\u8272/\u6587\u672c/\u72b6\u6001/\u5371\u9669", "\u7ea2\u8272/600", "\u7ea2\u8272/400", "danger como texto"],
  ["\u989c\u8272/\u586b\u5145/\u72b6\u6001/\u8b66\u544a", "\u7425\u73c0/500", "\u7425\u73c0/500", "warning como relleno"],
  ["\u989c\u8272/\u6587\u672c/\u72b6\u6001/\u8b66\u544a", "\u7425\u73c0/700", "\u7425\u73c0/400", "warningFuerte claro / warningDark oscuro"],
  ["\u989c\u8272/\u586b\u5145/\u5206\u7c7b/\u6b21\u8981", "\u6a59\u8272/700", "\u6a59\u8272/700", "secondary: clasifica categoria/servicio"],
  ["\u989c\u8272/\u6587\u672c/\u5206\u7c7b/\u6b21\u8981", "\u6a59\u8272/700", "\u6a59\u8272/400", "secondary como texto"],
  ["\u989c\u8272/\u6587\u672c/\u793e\u4ea4/\u559c\u6b22", "\u73ab\u7470/600", "\u73ab\u7470/500", "like: likePressed #E01E39 / like #FF2442"],
  ["\u989c\u8272/\u586b\u5145/\u793e\u4ea4/\u559c\u6b22", "\u73ab\u7470/500", "\u73ab\u7470/500", "like como relleno"],
];

/* ---------------------------------------------------------------- */
if (!fs.existsSync(SERVER)) {
  console.error("FALLA: no existe el volcado del servidor en " + SERVER);
  process.exit(1);
}
const crudo = JSON.parse(fs.readFileSync(SERVER, "utf8"));
const base = Object.values(crudo).map((v) => JSON.parse(JSON.stringify(v)));
oks.push("volcado del servidor leido: " + base.length + " entradas");

// --- arreglos declarados
for (const [nombre, fix] of Object.entries(ARREGLOS)) {
  const v = base.find((x) => x.name === nombre);
  if (!v) { fallos.push("arreglo imposible: no existe la variable " + nombre); continue; }
  const antes = v.mode[0].value;
  if (antes.toLowerCase() === fix.valor) { oks.push("arreglo ya aplicado: " + nombre); continue; }
  v.mode = v.mode.map((m) => ({ ...m, value: fix.valor }));
  oks.push("arreglado " + nombre + ": " + antes + " -> " + fix.valor + "  (" + fix.motivo + ")");
}

// --- puerta: cero valores repetidos en la tanda 1
const porValor = {};
for (const v of base) {
  if (v.type !== "COLOR") continue;
  const k = String(v.mode[0].value).toLowerCase();
  (porValor[k] = porValor[k] || []).push(v.name);
}
const repetidos = Object.entries(porValor).filter(([, n]) => n.length > 1);
if (repetidos.length) {
  for (const [val, nombres] of repetidos) fallos.push("dos nombres con el mismo valor " + val + ": " + nombres.join(" + "));
} else oks.push("cero valores repetidos en la tanda 1");

// --- puerta: cada valor existe de verdad en el kit
const kit = fs.readFileSync(KIT, "utf8").toLowerCase();
const noEnKit = [];
for (const v of base) {
  if (v.type !== "COLOR") continue;
  const hex = String(v.mode[0].value).toLowerCase();
  if (!kit.includes(hex)) noEnKit.push(v.name + " = " + hex);
}
if (noEnKit.length) fallos.push("valores que NO estan en el kit -> " + noEnKit.join(" | "));
else oks.push("los " + base.filter((v) => v.type === "COLOR").length + " colores existen en colors.ts");

// --- puerta: cero nombres de tamano semantico
const PROHIBIDOS = ["\u95f4\u8ddd/", "spacing/", "\u5706\u89d2/", "radius/", "\u63cf\u8fb9/", "border/", "\u5b57\u53f7/"];
const malos = base.filter((v) => PROHIBIDOS.some((p) => v.name.startsWith(p)));
if (malos.length) fallos.push("nombres de tamano semantico prohibidos: " + malos.map((v) => v.name).join(", "));
else oks.push("cero nombres de tamano semantico prohibidos");

// --- puerta: cero nombres duplicados en la tanda 1
const cuenta = {};
for (const v of base) cuenta[v.name] = (cuenta[v.name] || 0) + 1;
const dups = Object.entries(cuenta).filter(([, c]) => c > 1);
if (dups.length) fallos.push("nombres duplicados en la tanda 1: " + dups.map(([n, c]) => n + " x" + c).join(", "));
else oks.push("cero nombres duplicados en la tanda 1");

// --- tanda 2: construir y validar referencias
const nombresBase = new Set(base.map((v) => v.name));
const sem = [];
const refRotas = [];
for (const [nombre, claro, oscuro, nota] of SEMANTICA) {
  for (const ref of [claro, oscuro]) {
    if (!nombresBase.has("\u57fa\u7840\u8272\u677f/" + ref)) refRotas.push(nombre + " -> 基础色板/" + ref);
  }
  sem.push({
    collection: "\u8bed\u4e49",
    type: "PAINT",
    name: nombre,
    mode: [
      { name: "\u4eae\u8272", reference: "\u57fa\u7840\u8272\u677f/" + claro },
      { name: "\u6697\u8272", reference: "\u57fa\u7840\u8272\u677f/" + oscuro },
    ],
    _nota: nota,
  });
}
if (refRotas.length) fallos.push("referencias que no existen en la tanda 1 -> " + refRotas.join(" | "));
else oks.push("las " + SEMANTICA.length + " semanticas referencian nombres existentes (" + SEMANTICA.length * 2 + " referencias)");

const noColor = sem.filter((v) => !v.name.startsWith("\u989c\u8272/"));
if (noColor.length) fallos.push("nombres de 语义 que no empiezan por 颜色/: " + noColor.map((v) => v.name).join(", "));
else oks.push("todos los nombres de la tanda 2 empiezan por 颜色/");

// --- informe
console.log("=== PUERTAS ===");
for (const o of oks) console.log("  [ok]   " + o);
for (const f of fallos) console.log("  [FALLA] " + f);
console.log();

if (fallos.length) {
  console.log(">>> RECHAZADO: no se escribe ningun fichero.");
  process.exit(1);
}

// --- escribir (la semantica va SIN _nota: el servidor no la conoce)
const limpia = sem.map(({ _nota, ...v }) => v);
fs.writeFileSync(OUT1, JSON.stringify({ variables: base }, null, 2), "utf8");
fs.writeFileSync(OUT2, JSON.stringify({ variables: limpia }, null, 2), "utf8");

console.log(">>> APTO");
console.log("tanda 1 (basica)   : " + base.length + " variables -> " + path.relative(RAIZ, OUT1));
console.log("tanda 2 (semantica): " + limpia.length + " variables -> " + path.relative(RAIZ, OUT2));
console.log();
console.log("=== TANDA 2: nombre -> 亮色 / 暗色 ===");
for (const v of sem) {
  console.log("  " + v.name.padEnd(30) + " " + v.mode[0].reference.replace("\u57fa\u7840\u8272\u677f/", "") + " / " + v.mode[1].reference.replace("\u57fa\u7840\u8272\u677f/", ""));
}
