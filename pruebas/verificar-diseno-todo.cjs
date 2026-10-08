// verificar-diseno-todo.cjs — ejecuta las dos comprobaciones de diseño y agrega el resultado.
//
//   1. pruebas/verifica-diseno.cjs  → deuda de diseño en app/ (hex, tamaños y espaciados a mano)
//   2. pruebas/intercity-prototipo/verificar-ui.cjs → las 17 pantallas + contraste WCAG AA
//
// Uso: node pruebas/verificar-diseno-todo.cjs   (o `npm run diseno`)
const path = require("path");
const { spawnSync } = require("child_process");

const RAIZ = path.resolve(__dirname, "..");

const PASOS = [
  ["deuda de diseño en app/  (valores a mano en vez de tokens)", "pruebas/verifica-diseno.cjs"],
  ["UI del prototipo Intercity  (17 pantallas + contraste AA)", "pruebas/intercity-prototipo/verificar-ui.cjs"],
];

let enRojo = 0;
for (const [nombre, script] of PASOS) {
  console.log("\n" + "=".repeat(70));
  console.log("== " + nombre);
  console.log("=".repeat(70));
  const r = spawnSync(process.execPath, [script], { cwd: RAIZ, stdio: "inherit" });
  if (r.error) {
    console.log("→ no se pudo ejecutar: " + r.error.message);
    enRojo++;
  } else if (r.status !== 0) {
    enRojo++;
    console.log("→ FALLA: " + nombre);
  } else {
    console.log("→ OK: " + nombre);
  }
}

console.log("\n" + "=".repeat(70));
console.log(
  enRojo === 0
    ? "DISEÑO: todo en verde"
    : "DISEÑO: " + enRojo + " de " + PASOS.length + " comprobaciones en rojo"
);
process.exit(enRojo ? 1 : 0);
