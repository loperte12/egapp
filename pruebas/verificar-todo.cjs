#!/usr/bin/env node
/**
 * verificar-todo.cjs — el comando único de verdad: `npm run verificar`
 * =============================================================================
 *
 * **Por qué existe.** La ley del proyecto (§5) dice que nada se cierra sin las cinco comprobaciones, y
 * hasta hoy cada una se lanzaba a mano — cuando alguien se acordaba. Este es el que las encadena, y el
 * que **el despliegue llama antes de publicar** (si esto falla, no sale nada).
 *
 * Las cinco:
 *   1. `tsc` — sin errores NUEVOS (hay una línea base declarada: los 5 antiguos del proyecto).
 *   2. `npm run diseno` — no hay hexadecimal fuera de los tokens de diseño.
 *   3. `npm run logica` — la lógica pura (liberación, agenda).
 *   4. `npm run rutas` — las rutas declaradas y las pantallas no se han desincronizado.
 *   5. el oráculo (`node --test`) — el contrato, las claves del árbol y la paridad de servidores.
 *
 * **Se decide por código de salida, no por lo que diga el texto.** Parsear la salida de una herramienta
 * es cómo se cuela un falso verde; el código de salida es la señal que las herramientas dan a propósito.
 * (La única excepción es `tsc`, que necesita el **contador** para compararlo con la línea base.)
 *
 * Uso:
 *   node pruebas/verificar-todo.cjs
 *   ORACULO=<carpeta> node pruebas/verificar-todo.cjs
 */
'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const NODE = process.execPath;

/**
 * **La línea base de `tsc`: 5 errores, conocidos y antiguos** (4 en `backend/deploy-vercel/api-index.ts`
 * y 1 en `packages/map/src/mapWeb.tsx`). No se tapan: se cuentan. Si el número **baja**, se baja la
 * base en el mismo commit (así se va limpiando); si **sube**, esto falla.
 */
const BASE_TSC = 5;

/** Dónde vive el oráculo (fuera de este repo: es el taller de fidelidad). */
const ORACULO = process.env.ORACULO
  ?? 'D:\\Users\\nisang12\\AppData\\Local\\Programs\\DeepSeek Harness\\mercado-fase1\\o1-oraculo';

const resultados = [];

/** Ejecuta con la salida EN HEREDADA y decide por código de salida. Lo simple y lo que no miente. */
function correr(nombre, fn) {
  process.stdout.write(`${nombre.padEnd(12)} `);
  try {
    const detalle = fn();
    resultados.push({ nombre, ok: true });
    console.log(`✓ ${detalle ?? ''}`);
    return true;
  } catch (e) {
    resultados.push({ nombre, ok: false });
    console.log(`✗ ${e.message}`);
    return false;
  }
}

let todoBien = true;

// 1 · tsc, contra la línea base
todoBien = correr('tsc', () => {
  let texto = '';
  try {
    texto = execFileSync(NODE, ['node_modules/typescript/bin/tsc', '--noEmit'],
      { cwd: RAIZ, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    texto = String(e.stdout ?? '') + String(e.stderr ?? '');
  }
  const errores = (texto.match(/error TS\d+/g) ?? []).length;
  if (errores > BASE_TSC) {
    const muestra = texto.split(/\r?\n/).filter((l) => l.includes('error TS')).slice(0, 6).join('\n              ');
    throw new Error(`${errores} errores (base ${BASE_TSC}). Nuevos:\n              ${muestra}`);
  }
  if (errores < BASE_TSC) return `${errores} errores (base ${BASE_TSC}) — baja la base en verificar-todo.cjs`;
  return `${errores} = base ${BASE_TSC}`;
}) && todoBien;

// 2..4 · los scripts de la casa, tal cual
for (const [nombre, script] of [['diseño', 'diseno'], ['lógica', 'logica'], ['rutas', 'rutas']]) {
  todoBien = correr(nombre, () => {
    // Sin shell:true: pasar argumentos con shell abierto es una concatenación (y avisa Node).
    const npm = process.platform === 'win32' ? ['cmd.exe', ['/c', `npm run ${script}`]] : ['npm', ['run', script]];
    execFileSync(npm[0], npm[1], { cwd: RAIZ, stdio: 'inherit' });
    return 'verde';
  }) && todoBien;
}

// 5 · el oráculo (sin argumentos: descubre sus `*.test.mjs` en el directorio de trabajo)
todoBien = correr('oráculo', () => {
  if (!fs.existsSync(path.join(ORACULO, 'test'))) throw new Error(`no encuentro el oráculo en ${ORACULO}`);
  execFileSync(NODE, ['--test'], { cwd: ORACULO, stdio: 'inherit' });
  return 'todas pasan';
}) && todoBien;

console.log('');
if (!todoBien) {
  console.log('VERIFICACIÓN FALLIDA. No se publica ni se cierra nada con esto en rojo.');
  process.exit(1);
}
console.log('VERIFICACIÓN EN VERDE: las cinco comprobaciones.');
