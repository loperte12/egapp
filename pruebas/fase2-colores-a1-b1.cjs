/**
 * Fase 2 · Decisión del dueño: A1 + B1 (17/09/2026).
 *
 *   A1 — «AZUL AVANZA, NARANJA CLASIFICA»: las constantes ACCENT locales (las que pintaban de
 *        naranja los botones de acción principal en Life Book y comida) pasan al azul de acción.
 *        El naranja se queda para clasificar (categorías, sellos, identidad de servicio).
 *   B1 — CONTRASTE AA: los tokens de color se oscurecen hasta que el texto BLANCO encima llegue a
 *        4,5:1, que es el mínimo de la WCAG para texto normal. Antes: naranja 2,57 · azul 3,66 ·
 *        rojo 3,71 · verde 2,87. Esto cambia el color de marca en toda la app: es lo que se aprobó.
 *
 * Uso: node pruebas/fase2-colores-a1-b1.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
let fallos = 0;

// ── B1 · tokens del kit, oscurecidos hasta cumplir AA con texto blanco ──────────────────────────
const KIT = path.join(APP, 'packages/ui-kit/src/theme/colors.ts');
const TOKENS = {
  "primary: '#0084FF'": "primary: '#0066CC'",              // 3,66 → 5,57
  "primaryPressed: '#006BD6'": "primaryPressed: '#00529E'",
  "secondary: '#FF7D00'": "secondary: '#C2410C'",          // 2,57 → 5,17
  "secondaryPressed: '#E56E00'": "secondaryPressed: '#9A3412'",
  "success: '#27AE60'": "success: '#1E7A45'",              // 2,87 → 5,37
  "successPressed: '#1E8E4E'": "successPressed: '#176035'",
  "danger: '#F53F3F'": "danger: '#C62828'",                // 3,71 → 5,65
  "dangerPressed: '#D93636'": "dangerPressed: '#A31F1F'",
};
let t = fs.readFileSync(KIT, 'utf8');
let n = 0;
for (const [de, a] of Object.entries(TOKENS)) {
  if (!t.includes(de)) { console.log(`  SIN ANCLA en el kit: ${de}`); fallos++; continue; }
  t = t.replace(de, a);
  n++;
}
t = t.replace(
  'export const brand = {',
  `/**
 * DECISIÓN DEL DUEÑO (17/09/2026) — A1 + B1:
 *   · A1: el azul es la ACCIÓN principal; el naranja CLASIFICA (categoría, sello, servicio).
 *   · B1: estos valores están oscurecidos para que el texto BLANCO encima cumpla AA (4,5:1).
 *     Antes el naranja daba 2,57 y el azul 3,66: las etiquetas de los botones no se leían al sol.
 */
export const brand = {`,
);
fs.writeFileSync(KIT, t, 'utf8');
console.log(`  OK kit: ${n}/8 tokens oscurecidos y documentados`);

// ── A1 · las constantes ACCENT locales dejan de ser naranjas ───────────────────────────────────
const ROOTS = ['app', 'components'];
let accent = 0;
function recorrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (/node_modules|respaldo/.test(p)) continue;
    if (e.isDirectory()) { recorrer(p); continue; }
    if (!/\.tsx?$/.test(e.name)) continue;
    let src = fs.readFileSync(p, 'utf8');
    const antes = src;
    src = src.replace(/const ACCENT = brand\.secondary;/g, 'const ACCENT = brand.primary; // A1: la acción avanza en azul');
    if (src !== antes) {
      fs.writeFileSync(p, src, 'utf8');
      accent++;
      console.log(`  OK ACCENT → azul en ${path.relative(APP, p)}`);
    }
  }
}
for (const r of ROOTS) {
  const d = path.join(APP, r);
  if (fs.existsSync(d)) recorrer(d);
}
console.log(`  constantes ACCENT pasadas a azul: ${accent}`);
