// extraer-tema.cjs — saca el bloque <style> de la plantilla a un fichero de tema y
// deja un marcador {{TEMA}} para que el build pueda inyectar uno u otro.
// Se ejecuta UNA vez (la plantilla ya quedó migrada); se conserva como documentación.
const fs = require("fs");
const path = require("path");
const p = path.join(__dirname, "index.tpl.html");
let html = fs.readFileSync(p, "utf8");

const m = html.match(/<style>([\s\S]*?)<\/style>/);
if (!m) {
  console.log("La plantilla ya no tiene <style>: nada que extraer.");
  process.exit(0);
}
fs.writeFileSync(path.join(__dirname, "tema-actual.css"), m[1].replace(/^\n/, ""), "utf8");
html = html.replace(/<style>[\s\S]*?<\/style>/, "<style>\n{{TEMA}}\n</style>");
fs.writeFileSync(p, html, "utf8");
console.log("tema-actual.css escrito (" + (fs.statSync(path.join(__dirname, "tema-actual.css")).size / 1024).toFixed(1) + " KB) y la plantilla usa {{TEMA}}");
