#!/usr/bin/env node
/**
 * migrar-componentes-a-var.cjs — los 10 componentes del listado pasan de `#HEX` a `var(...)`.
 *
 * POR QUE EXISTE: los componentes se entregaron al lienzo con los `#HEX` del kit porque la capa
 * de variables del fichero estaba rota (68 entradas, 13 nombres duplicados). Esa capa ya esta
 * sana (69 variables, 0 duplicados, verificada leyendo el volcado). Ahora el `#HEX` a mano es
 * deuda: cambiar un color del kit no repinta el componente.
 *
 * ── LA DECISION DE DISENO, que no es un detalle ─────────────────────────────────────────────
 *
 * El mapa `#HEX -> variable` NO es unico: el MISMO hex significa cosas distintas segun el sitio.
 * `#ff2442` es `颜色/文本/社交/喜欢` en un texto y `颜色/填充/社交/喜欢` en un relleno. Se
 * resuelve por ROL —que es el fallo 22/39 del skill `codemod-seguro`: el valor no basta, manda el
 * sitio—, y medido antes de escribirlo:
 *
 *     rol 文本    -> 9 entradas, 0 colisiones
 *     rol 填充   -> 11 entradas, 0 colisiones
 *
 * Cero colisiones dentro de cada rol es lo que hace la sustitucion determinista. Si alguna vez
 * deja de serlo, la puerta 2 aborta en vez de elegir una al azar.
 *
 *     bg-[#HEX]      -> bg-[var(颜色/填充/...)]        (11 destinos)
 *     text-[#HEX]    -> text-[var(颜色/文本/...)]      (9 destinos)
 *     border-[#HEX]  -> border-[var(基础色板/...)]     (no hay semantica de borde: 描边 prohibido)
 *     rounded/gap/p/h/w-[Npx] -> var(规范尺寸/<档位>)   solo si N esta en la escala
 *
 * ── LO QUE NO SE MIGRA, y por que (cada exclusion es un numero contado, no una categoria) ──
 *
 *   · **HEX con alfa** (`border-[#FFFFFF]/10`): un alfa no puede referenciar un color solido.
 *   · **Tamanos de letra** (`text-[13px]`): el esquema NO tiene variables de tipografia (no hay
 *     tipo de fuente ni `字号`, que esta prohibido). Y `text-[...]` es ambiguo —color o tamano—,
 *     asi que se distinguen por el `#`.
 *   · **Tamanos fuera de la escala** (`h-[36px]`): `规范尺寸` solo tiene ocho peldaños.
 *
 * ── MODO, y el riesgo que se declara ────────────────────────────────────────────────────────
 *
 * Las semanticas tienen DOS modos (`亮色`/`暗色`) y estos componentes son OSCUROS: el valor
 * correcto es el de `暗色`. Que modo resuelve el servidor al importar NO esta medido, y si
 * resolviera `亮色` la pantalla se pintaria clara. Por eso existe `--basica`, que migra a
 * `基础色板/...` (un solo valor, sin modos) y no depende de esa pregunta.
 *
 * Uso:
 *   node pruebas/migrar-componentes-a-var.cjs            -> SIMULACION (no escribe nada)
 *   node pruebas/migrar-componentes-a-var.cjs --aplicar  -> escribe docs/componentes-var/
 *   node pruebas/migrar-componentes-a-var.cjs --basica   -> a `基础色板/...` en vez de semantica
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const ORIGEN = path.join(RAIZ, "docs", "componentes");
const DESTINO = path.join(RAIZ, "docs", "componentes-var");

const args = new Set(process.argv.slice(2));
const APLICAR = args.has("--aplicar");
const USAR_BASICA = args.has("--basica");

const fallos = [];
const oks = [];

/* ── 1. La capa de variables: se LEE del volcado, no se escribe a mano (fallos 5 y 21) ── */
const WS = "C:/Users/nisang12/.mgmcp/resources/library";
let variables = null;
for (const d of fs.existsSync(WS) ? fs.readdirSync(WS).filter((x) => /^local-/.test(x)) : []) {
  const dentro = path.join(WS, d);
  if (!fs.existsSync(dentro)) continue;
  for (const sub of fs.readdirSync(dentro)) {
    const v = path.join(dentro, sub, "variable.json");
    if (fs.existsSync(v)) variables = JSON.parse(fs.readFileSync(v, "utf8"));
  }
}
if (!variables) {
  console.error("FALLA  no encuentro variable.json: ¿get_variables sin ejecutar?");
  process.exit(1);
}
const vs = Array.isArray(variables) ? variables : Object.values(variables);

/** nombre de variable -> valor de la posicion 0 (la unica que vale; el resto es ruido). */
const valorDe = {};
for (const v of vs) valorDe[v.name] = v.mode[0].value;

/** hex (SIN `#`, para que la clave y la busqueda hablen igual) -> nombres de la paleta basica. */
const basicaPorHex = {};
for (const [n, val] of Object.entries(valorDe)) {
  if (!n.startsWith("基础色板/")) continue;
  const h = String(val).toLowerCase().replace(/^#/, "");
  (basicaPorHex[h] = basicaPorHex[h] || []).push(n);
}

/** hex -> nombre semantico, POR ROL, resolviendo la referencia de su modo 暗色. */
function semanticaPorRol(rol) {
  const m = {};
  for (const v of vs) {
    if (v.collection !== "语义" || !v.name.startsWith("颜色/" + rol + "/")) continue;
    const modo = (v.mode || []).find((x) => x.name === "暗色");
    if (!modo || !modo.reference) continue;
    const h = String(valorDe[modo.reference] ?? "").toLowerCase().replace(/^#/, "");
    if (!h) continue;
    (m[h] = m[h] || []).push(v.name);
  }
  return m;
}
const SEM_TEXTO = semanticaPorRol("文本");
const SEM_RELLENO = semanticaPorRol("填充");

/** Escala 规范尺寸: valor -> nombre del peldaño. Derivada del volcado, no escrita a mano. */
const ESCALA = {};
for (const [n, val] of Object.entries(valorDe)) {
  if (n.startsWith("规范尺寸/")) ESCALA[Number(val)] = n;
}

oks.push("capa de variables leida: " + vs.length + " variables, escala " +
  Object.entries(ESCALA).map(([v, n]) => n.split("/")[1] + "=" + v).join(" "));
oks.push("mapa por rol — texto: " + Object.keys(SEM_TEXTO).length +
  " · relleno: " + Object.keys(SEM_RELLENO).length +
  " · paleta basica: " + Object.keys(basicaPorHex).length);

/* ── 2. Resolver un color: devuelve el nombre curado o null si no hay destino ── */
function destinoColor(hex, rol) {
  const h = hex.toLowerCase().replace(/^#/, "");
  if (!USAR_BASICA) {
    const tabla = rol === "text" ? SEM_TEXTO : rol === "bg" ? SEM_RELLENO : null;
    if (tabla && tabla[h]) {
      if (tabla[h].length === 1) return tabla[h][0];
      fallos.push("COLISION en el rol " + rol + " para " + h + ": " + tabla[h].join(" | "));
      return null;
    }
  }
  if (basicaPorHex[h] && basicaPorHex[h].length === 1) return basicaPorHex[h][0];
  return null;
}

/* ── 3. El codemod ── */
const COLOR = /(\b(?:bg|text|border)-)\[#([0-9a-fA-F]{3,8})\]/g;
const MEDIDA = /(\b(?:rounded|gap|p|px|py|pt|pb|pl|pr|h|w|size|min-w|max-w|min-h|max-h|top|bottom|left|right)-)\[(\d+(?:\.\d+)?)px\]/g;

const ficheros = fs.readdirSync(ORIGEN).filter((f) => f.endsWith(".html")).sort();
const informe = [];
let totColor = 0, totMedida = 0, totAlfa = 0, totFueraEscala = 0, totLetra = 0;

for (const nombre of ficheros) {
  const bruto = fs.readFileSync(path.join(ORIGEN, nombre));
  // Finales de linea: se EXIGE uniformidad y se restaura el original (fallos 2 y 38).
  const crlf = (bruto.toString("binary").match(/\r\n/g) || []).length;
  const lf = (bruto.toString("binary").match(/\n/g) || []).length - crlf;
  if (crlf && lf) fallos.push(nombre + ": finales de linea MIXTOS (" + crlf + " CRLF + " + lf + " LF)");
  const eol = crlf > lf ? "\r\n" : "\n";
  let txt = bruto.toString("utf8").replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const antes = {
    nodos: (txt.match(/data-name="/g) || []).length,
    hex: (txt.match(/#[0-9a-fA-F]{6}\b/g) || []).length,
  };

  const detalle = { color: 0, medida: 0, alfa: 0, fueraEscala: 0, letra: 0, noMapeado: [] };

  // Colores. El `(?!\/)` no basta: hay que mirar el caracter siguiente al `]`.
  txt = txt.replace(COLOR, (todo, prefijo, hex, offset) => {
    const sig = txt[offset + todo.length];
    if (sig === "/") { detalle.alfa++; return todo; }
    if (![3, 4, 6, 8].includes(hex.length)) { detalle.noMapeado.push(todo); return todo; }
    const rol = prefijo.startsWith("bg") ? "bg" : prefijo.startsWith("text") ? "text" : "border";
    const destino = destinoColor(hex, rol);
    if (!destino) { detalle.noMapeado.push(todo); return todo; }
    detalle.color++;
    return prefijo + "[var(" + destino + ")]";
  });

  // Tamanos que caen en la escala.
  txt = txt.replace(MEDIDA, (todo, prefijo, num) => {
    const v = Number(num);
    if (!ESCALA[v]) { detalle.fueraEscala++; return todo; }
    detalle.medida++;
    return prefijo + "[var(" + ESCALA[v] + ")]";
  });

  // Tamanos de letra + line-height: no hay variables de tipografia. Se cuentan, no se tocan.
  detalle.letra = (txt.match(/text-\[\d/g) || []).length;

  const despues = {
    nodos: (txt.match(/data-name="/g) || []).length,
    hex: (txt.match(/#[0-9a-fA-F]{6}\b/g) || []).length,
  };

  // --- Puertas por fichero ---
  if (despues.nodos !== antes.nodos) fallos.push(nombre + ": los nodos data-name cambiaron " + antes.nodos + " -> " + despues.nodos);
  if (detalle.noMapeado.length) fallos.push(nombre + ": " + detalle.noMapeado.length + " color(es) sin destino: " + [...new Set(detalle.noMapeado)].slice(0, 5).join(" "));
  if (/<!--|-->/.test(txt)) fallos.push(nombre + ": comentario HTML en la salida (MasterGo los pinta)");
  for (const t of ["div", "span", "p"]) {
    const a = (txt.match(new RegExp("<" + t + "\\b", "g")) || []).length;
    const c = (txt.match(new RegExp("</" + t + ">", "g")) || []).length;
    if (a !== c) fallos.push(nombre + ": <" + t + "> desequilibrado " + a + "/" + c);
  }
  // Y la puerta que importa: no puede quedar ni un HEX plano de los migrables.
  const sinColar = [];
  for (const m of txt.matchAll(COLOR)) {
    if (txt[m.index + m[0].length] === "/") continue;
    sinColar.push(m[0]);
  }
  if (sinColar.length) fallos.push(nombre + ": quedan " + sinColar.length + " HEX planos sin migrar: " + [...new Set(sinColar)].slice(0, 5).join(" "));

  informe.push({ nombre, detalle, antes, despues });
  totColor += detalle.color; totMedida += detalle.medida; totAlfa += detalle.alfa;
  totFueraEscala += detalle.fueraEscala; totLetra += detalle.letra;

  if (APLICAR) {
    fs.mkdirSync(DESTINO, { recursive: true });
    fs.writeFileSync(path.join(DESTINO, nombre), txt.replace(/\n/g, eol), "utf8");
  }
}

/* ── 4. Informe ── */
console.log("MODO: " + (USAR_BASICA ? "基础色板 (basica, un solo valor)" : "颜色/... (semantica, modo 暗色)") +
  " · " + (APLICAR ? "APLICANDO" : "SIMULACION (no escribe nada)"));
console.log("");
for (const f of informe) {
  const d = f.detalle;
  console.log("  " + f.nombre.padEnd(20) +
    " color " + String(d.color).padStart(2) +
    " · medida " + String(d.medida).padStart(2) +
    " · alfa(sin tocar) " + String(d.alfa).padStart(2) +
    " · tamano fuera de escala " + String(d.fueraEscala).padStart(2) +
    " · letra(sin tocar) " + String(d.letra).padStart(2) +
    "   [hex " + f.antes.hex + " -> " + f.despues.hex + "]");
}
console.log("");
console.log("TOTAL — colores " + totColor + " · medidas " + totMedida +
  " · alfa sin tocar " + totAlfa + " · fuera de escala " + totFueraEscala + " · tamano de letra sin tocar " + totLetra);

console.log("\nPUERTAS:");
for (const o of oks) console.log("  ok     " + o);
for (const f of fallos) console.log("  FALLA  " + f);
if (!fallos.length) console.log("  ok     " + ficheros.length + " ficheros: nodos intactos, cero HEX migrable sin migrar, etiquetas balanceadas");
console.log("");
if (fallos.length) { console.log(">>> RECHAZADO: NO se escribe nada."); process.exit(1); }
console.log(APLICAR ? ">>> ESCRITO en docs/componentes-var/hotelcard.html" : ">>> APTO. Para escribir: --aplicar");
