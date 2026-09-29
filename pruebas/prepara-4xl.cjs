#!/usr/bin/env node
/**
 * prepara-4xl.cjs — crea la variable que falta de la escala `规范尺寸`.
 *
 * POR QUE EXISTE: el esquema de MasterGo admite OCHO nombres de tamano — xs / sm / md / lg /
 * xl / 2xl / 3xl / 4xl — y el lienzo tiene SIETE. Falta `规范尺寸/4xl`. La escala esta, por
 * tanto, cortada: el peldaño mas grande que un componente puede pedir hoy es 3xl.
 *
 * POR QUE UN SCRIPT Y NO UN JSON A MANO: el valor del peldaño nuevo no es una opinion, se
 * DERIVA de la progresion que ya esta en el lienzo (4 · 8 · 12 · 16 · 20 · 24 · 32). Y como en
 * las otras puertas del proyecto, si algo no cuadra **falla en voz alta y no escribe nada**.
 *
 * LA PROGRESION, medida sobre el volcado (no supuesta):
 *     4 -> 8 -> 12 -> 16 -> 20 -> 24      pasos de +4
 *    24 -> 32                            paso de +8
 * El ultimo paso doblado es el que dice que la escala **deja de ser aditiva** al llegar a 3xl;
 * el siguiente escalon coherente es 32 + 8 = 40, que ademas es un valor REAL en uso (la propia
 * `escalas.ts` lo lista entre los anchos de contenedor grandes: 26, 28, 30, 40, 48, 60).
 *
 * Uso:  node pruebas/prepara-4xl.cjs          (valida y escribe pruebas/variables-4xl.json)
 * Sale con codigo != 0 y NO escribe si alguna puerta falla.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");
const SALIDA = path.join(RAIZ, "pruebas", "variables-4xl.json");

/** Los ocho nombres del esquema, en orden. El lienzo debe tener los siete primeros. */
const ESQUEMA = ["xs", "sm", "md", "lg", "xl", "2xl", "3xl", "4xl"];
const PREFIJO = "规范尺寸/";
const NUEVO = "4xl";

const fallos = [];
const oks = [];

// --- Localizar el volcado del servidor (el nombre de carpeta lleva CJK) ------
const WS = "C:/Users/nisang12/.mgmcp/resources/library";
const docDirs = fs.existsSync(WS)
  ? fs.readdirSync(WS).filter((d) => /^local-/.test(d) && fs.existsSync(path.join(WS, d)))
  : [];
let volcado = null;
let rutaVolcado = null;
for (const d of docDirs) {
  const dentro = fs.readdirSync(path.join(WS, d));
  for (const sub of dentro) {
    const v = path.join(WS, d, sub, "variable.json");
    if (fs.existsSync(v)) { volcado = JSON.parse(fs.readFileSync(v, "utf8")); rutaVolcado = v; }
  }
}

if (!volcado) {
  fallos.push("no encuentro ningun variable.json en " + WS + " (¿get_variables sin ejecutar?)");
} else {
  const vs = Array.isArray(volcado) ? volcado : Object.values(volcado);
  const dim = vs.filter((v) => String(v.name).startsWith(PREFIJO));

  // --- Puerta 1: el esquema esta cortado y le falta EXACTAMENTE uno ---------
  const nombres = dim.map((v) => v.name.slice(PREFIJO.length));
  const faltan = ESQUEMA.filter((n) => !nombres.includes(n));
  if (faltan.length !== 1) {
    fallos.push(
      "se esperaba que faltase exactamente 1 nombre de " + ESQUEMA.length +
      "; faltan " + faltan.length + ": " + (faltan.join(", ") || "(ninguno)"),
    );
  } else if (faltan[0] !== NUEVO) {
    fallos.push("el nombre que falta es " + faltan[0] + ", no " + NUEVO + ": no decidir en silencio");
  } else {
    oks.push("el esquema tiene " + nombres.length + " de " + ESQUEMA.length + " y el que falta es " + NUEVO);
  }

  // --- Puerta 2: sobran nombres fuera del esquema --------------------------
  const intrusos = nombres.filter((n) => !ESQUEMA.includes(n));
  if (intrusos.length) fallos.push("hay nombres de tamano fuera del esquema: " + intrusos.join(", "));
  else oks.push("cero nombres fuera del esquema (los " + nombres.length + " son legitimos)");

  // --- Puerta 3: la progresion es la que creo -------------------------------
  const pares = ESQUEMA.slice(0, 7)
    .map((n) => ({ n, v: dim.find((v) => v.name === PREFIJO + n) }))
    .filter((x) => x.v)
    .map((x) => [x.n, Number(x.v.mode[0].value)]);
  const valores = pares.map(([, v]) => v);
  const aditivos = valores.slice(1, -1).map((v, i) => v - valores[i]);
  const ultimo = valores[valores.length - 1] - valores[valores.length - 2];
  oks.push("progresion leida del lienzo: " + pares.map(([n, v]) => n + "=" + v).join(" · "));
  if (!aditivos.every((d) => d === 4)) {
    fallos.push("los pasos de xs a 2xl no son todos +4: " + aditivos.join(", "));
  } else if (ultimo !== 8) {
    fallos.push("el ultimo paso (2xl->3xl) es " + ultimo + ", no +8: la derivacion del nuevo valor no vale");
  } else {
    oks.push("pasos +4 hasta 2xl y el ultimo +8 (24->32) -> el siguiente es 32+8");
  }

  // --- Puerta 4: el valor derivado no esta ya en uso -----------------------
  const DERIVADO = valores[valores.length - 1] + ultimo;
  if (valores.includes(DERIVADO)) fallos.push("el valor derivado " + DERIVADO + " ya existe en la escala");
  else if (DERIVADO % 4 !== 0) fallos.push("el valor derivado " + DERIVADO + " no es multiplo de 4");
  else oks.push("valor derivado para " + NUEVO + ": " + DERIVADO + " (no repetido, multiplo de 4)");

  // --- Payload ------------------------------------------------------------
  if (fallos.length) {
    console.log("PUERTAS:");
    for (const o of oks) console.log("  ok     " + o);
    for (const f of fallos) console.log("  FALLA  " + f);
    console.log("\n>>> NO se escribe nada.");
    process.exit(1);
  }

  const payload = {
    variables: [
      {
        collection: "基础",
        name: PREFIJO + NUEVO,
        type: "NUMBER",
        mode: [{ name: "默认", value: DERIVADO }],
      },
    ],
  };

  // --- Puerta 5: el payload no lleva id (si lo llevara, actualizaria en vez
  //     de crear; y un id inventado apuntaria a otra variable) --------------
  const e = payload.variables[0];
  if ("id" in e) fallos.push("el payload lleva id: crearia o pisaria otra variable");
  if (e.collection !== "基础") fallos.push("coleccion distinta de 基础: " + e.collection);
  if (e.type !== "NUMBER") fallos.push("tipo distinto de NUMBER: " + e.type);
  if (e.mode.length !== 1) fallos.push("modos " + e.mode.length + " != 1");
  if (typeof e.mode[0].value !== "number") fallos.push("el valor no es numerico");
  if ("reference" in e.mode[0]) fallos.push("un tamano no referencia a nadie: debe llevar valor literal");

  if (fallos.length) {
    console.log("PUERTAS:");
    for (const o of oks) console.log("  ok     " + o);
    for (const f of fallos) console.log("  FALLA  " + f);
    console.log("\n>>> NO se escribe nada.");
    process.exit(1);
  }
  oks.push("payload: 1 entrada, sin id, coleccion 基础, tipo NUMBER, 1 modo, valor numerico");

  fs.writeFileSync(SALIDA, JSON.stringify(payload, null, 2) + "\n", "utf8");
  oks.push("escrito " + path.relative(RAIZ, SALIDA).replace(/\\/g, "/"));
}

console.log("PUERTAS:");
for (const o of oks) console.log("  ok     " + o);
for (const f of fallos) console.log("  FALLA  " + f);
if (!fallos.length) {
  console.log("\n>>> APTO. Volcado de origen: " + rutaVolcado);
  console.log(">>> Siguiente: agent_update_variables con pruebas/variables-4xl.json");
}
process.exit(fallos.length ? 1 : 0);
