#!/usr/bin/env node
/**
 * Puerta de los COMPONENTES de MasterGo (component-generate).
 *
 * Por que existe: el fallo de las tres entregas fantasma de la pantalla fue un
 * COMENTARIO HTML en la primera linea — MasterGo no los ignora, los convierte en
 * capas de texto. Aqui se comprueba ANTES de enviar, no despues.
 *
 * Uso:  node pruebas/prepara-componente.cjs [fichero.html ...]
 *       Sin argumentos: valida todos los docs/componentes/*.html
 * Sale con codigo != 0 si alguna puerta falla. NO escribe nada.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const DIR = path.join(RAIZ, "docs", "componentes");

const argFicheros = process.argv.slice(2);
const ficheros = argFicheros.length
  ? argFicheros
  : fs.existsSync(DIR)
    ? fs.readdirSync(DIR).filter((f) => f.endsWith(".html")).map((f) => path.join(DIR, f))
    : [];

if (!ficheros.length) {
  console.log("No hay componentes que validar en docs/componentes/");
  process.exit(0);
}

let fallosGlobales = 0;

for (const ruta of ficheros) {
  const nombre = path.basename(ruta);
  console.log("=== " + nombre + " ===");
  if (!fs.existsSync(ruta)) {
    console.log("  FALLA  no existe: " + ruta);
    fallosGlobales++;
    continue;
  }
  const html = fs.readFileSync(ruta, "utf8");
  const fallos = [];
  const oks = [];

  // --- Puerta 1: cero comentarios HTML -------------------------------------
  const abre = (html.match(/<!--/g) || []).length;
  const cierra = (html.match(/-->/g) || []).length;
  if (abre || cierra) fallos.push("comentarios HTML: " + abre + " <!-- / " + cierra + " -->  (MasterGo los pinta como capa de texto)");
  else oks.push("cero comentarios HTML");

  // --- Puerta 2: nada de documento, solo fragmento -------------------------
  const prohibidas = ["<!DOCTYPE", "<html", "<head", "<body", "<script", "<style", "```"];
  const vistos = prohibidas.filter((p) => html.includes(p));
  if (vistos.length) fallos.push("etiquetas de documento: " + vistos.join(" "));
  else oks.push("solo fragmento (sin DOCTYPE/html/head/body/script/style)");

  // --- Puerta 3: raiz unica con data-type --------------------------------
  const mRaiz = html.match(/^[ \t]*<div\b[^>]*data-type="(component|component-set)"/);
  if (!mRaiz) fallos.push('la raiz no declara data-type="component" ni "component-set"');
  else {
    oks.push("raiz con data-type=\"" + mRaiz[1] + "\"");
  }
  // "Columna 0" es literal: sin un solo espacio delante. Con [ \t]* delante
  // se cuelan TODOS los <div> indentados y la puerta salta en falso.
  const nRootDivs = (html.match(/^<div\b/gm) || []).length;
  if (nRootDivs !== 1) fallos.push("hay " + nRootDivs + " nodos en la columna 0: la raiz debe ser unica");

  // --- Puerta 4: variantes (solo component-set) ---------------------------
  const esSet = /data-type="component-set"/.test(html);
  if (esSet) {
    const mSet = html.match(/<div\b[^>]*data-type="component-set"[^>]*>/);
    const props = mSet ? mSet[0].match(/data-variant-([a-zA-Z\u4e00-\u9fa5]+)="/g) : null;
    if (props) fallos.push("el propio component-set lleva data-variant-*: solo lo llevan los hijos");

    // Hijos directos de la raiz: buscar en el texto los que estan a 1 nivel.
    const lineas = html.split("\n");
    const hijosDirectos = [];
    let prof = 0;
    for (const ln of lineas) {
      const abre2 = (ln.match(/<div\b/g) || []).length;
      const cierra2 = (ln.match(/<\/div>/g) || []).length;
      if (abre2 && prof === 1) hijosDirectos.push({ ln, esComponente: /data-type="component"/.test(ln) });
      prof += abre2 - cierra2;
    }
    if (!hijosDirectos.length) fallos.push("el component-set no tiene hijos");
    const noComponentes = hijosDirectos.filter((h) => !h.esComponente);
    if (noComponentes.length) fallos.push(noComponentes.length + " hijo(s) directo(s) del set sin data-type=\"component\"");

    const claves = hijosDirectos.map((h) => {
      const m = h.ln.match(/data-variant-([a-zA-Z\u4e00-\u9fa5]+)=/g) || [];
      return m.map((x) => x.replace(/data-variant-|=/g, "")).sort().join(",");
    });
    const distintas = [...new Set(claves)];
    if (distintas.length > 1) fallos.push("variantes con juegos de claves distintos: " + distintas.join(" | "));
    else oks.push("variantes: " + hijosDirectos.length + " (claves: " + distintas[0] + ")");
    if (hijosDirectos.length > 16) fallos.push("variantes " + hijosDirectos.length + " > 16");
    if (claves.length && claves[0].split(",").filter(Boolean).length > 3) fallos.push("dimensiones de variante > 3");

    // idioma de clave y valor
    for (const h of hijosDirectos) {
      const ms = h.ln.match(/data-variant-([a-zA-Z\u4e00-\u9fa5]+)="([^"]*)"/g) || [];
      for (const s of ms) {
        const mm = s.match(/data-variant-([a-zA-Z\u4e00-\u9fa5]+)="([^"]*)"/);
        const claveLatina = /^[a-zA-Z]+$/.test(mm[1]);
        const valorLatino = /^[a-zA-Z0-9 _-]+$/.test(mm[2]);
        if (claveLatina !== valorLatino) fallos.push("clave/valor en idiomas distintos: " + s);
      }
    }
  } else {
    oks.push("componente simple (sin variantes)");
  }

  // --- Puerta 5: data-name en TODOS los nodos -----------------------------
  const nodos = html.match(/<(div|span|p|i|img|section|header|footer|nav|aside)\b[^>]*>/g) || [];
  const sinName = nodos.filter((n) => !/data-name="/.test(n));
  if (sinName.length) fallos.push(sinName.length + " nodo(s) sin data-name: " + sinName.slice(0, 3).join(" ").slice(0, 160));
  else oks.push(nodos.length + " nodos, todos con data-name");

  // --- Puerta 6: cero margin, cero unidades relativas --------------------
  // OJO, dos falsos positivos que ya me mordieron:
  //   (a) /-m/ suelto casa dentro de los nombres de FontAwesome: fa-map,
  //       fa-mug-hot, fa-magnifying-glass... Hay que mirar TOKEN a token.
  //   (b) el "%" de las paradas de un gradiente (linear-gradient(...50%...))
  //       no es una unidad de medida relativa: es CSS legitimo.
  const malas = [];
  for (const m of html.matchAll(/class="([^"]*)"/g)) {
    const clases = m[1];
    for (const t of clases.split(/\s+/)) {
      if (/^-?m[trblxy]?(-\[|-\d|$)/.test(t)) malas.push("margin en: " + t);
    }
    const sinGradiente = clases.replace(/(linear|radial)-gradient\([^)]*\)/g, "GRADIENTE");
    for (const t of sinGradiente.split(/\s+/)) {
      if (/%|vw|vh|\brem\b|\bem\b|calc\(/.test(t)) malas.push("unidad relativa en: " + t);
    }
  }
  if (malas.length) fallos.push("clases prohibidas -> " + malas.slice(0, 3).join(" ; "));
  else oks.push("cero margin, cero unidades relativas");

  // --- Puerta 7: etiquetas balanceadas ------------------------------------
  for (const t of ["div", "span", "p"]) {
    const a = (html.match(new RegExp("<" + t + "\\b", "g")) || []).length;
    const c = (html.match(new RegExp("</" + t + ">", "g")) || []).length;
    if (a !== c) fallos.push("<" + t + "> desequilibrado: " + a + " abiertos / " + c + " cerrados");
  }
  if (!fallos.some((f) => f.includes("desequilibrado"))) oks.push("etiquetas balanceadas");

  // --- Puerta 8: los 5 elementos de texto en span y p ---------------------
  const textos = html.match(/<(span|p)\b[^>]*>/g) || [];
  const incompletos = textos.filter(
    (t) =>
      !/text-\[[^\]]*px\]/.test(t) ||
      !/leading-\[[^\]]*px\]/.test(t) ||
      !/font-\[[^\]]*\]/.test(t) ||
      !/text-\[#[^\]]*\]/.test(t) ||
      !/text-(left|center|right)/.test(t),
  );
  if (incompletos.length) fallos.push(incompletos.length + " span/p sin las 5 propiedades de texto: " + incompletos[0].slice(0, 120));
  else oks.push(textos.length + " textos con las 5 propiedades");

  // --- Puerta 9: los <p> con ancho limitado ------------------------------
  const parrafos = html.match(/<p\b[^>]*>/g) || [];
  const psSueltos = parrafos.filter((t) => !/(flex-1|self-stretch|w-\[|max-w-\[)/.test(t));
  if (psSueltos.length) fallos.push(psSueltos.length + " <p> sin ancho limitado (puede colapsar)");

  // --- Puerta 10: iconos por FontAwesome, no svg a mano -------------------
  if (/<svg|<\/svg>/.test(html)) fallos.push("hay <svg> a mano: usar FontAwesome");

  // --- Informe -----------------------------------------------------------
  for (const o of oks) console.log("  ok     " + o);
  for (const f of fallos) console.log("  FALLA  " + f);
  console.log("  -> " + (fallos.length ? "RECHAZADO (" + fallos.length + ")" : "APTO"));
  console.log("");
  fallosGlobales += fallos.length;
}

console.log(fallosGlobales ? ">>> " + fallosGlobales + " fallo(s) en total: NO enviar." : ">>> Todo apto.");
process.exit(fallosGlobales ? 1 : 0);
