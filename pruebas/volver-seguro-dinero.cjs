/**
 * Sustituye `router.back()` por el botón seguro en las pantallas de DINERO.
 *
 * `router.back()` no hace nada si no hay historial (enlace, notificación, `replace`): el botón
 * parece roto. `Volver` usa `ir.atras()`, que si no puede volver te lleva al inicio.
 * Prueba del dueño en el aparato: «el botón volver atrás en muchos flujos no queda en la vista y
 * algunos no funcionan».
 *
 * Uso: node pruebas/volver-seguro-dinero.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');

const ARCHIVOS = [
  'app/monedero.tsx',
  'app/monedero-recargar.tsx',
  'app/monedero-retirar.tsx',
  'app/monedero-movimientos.tsx',
  'app/monedero-pin.tsx',
  'app/food-checkout.tsx',
  'app/ecomerse-checkout.tsx',
  'app/lifebook-checkout.tsx',
  'app/lifebook-carrito-checkout.tsx',
  'app/billing-status.tsx',
  'app/monedero-*.tsx',
];

let total = 0, tocados = 0;

for (const rel of ARCHIVOS) {
  if (rel.includes('*')) continue;
  const p = path.join(APP, rel);
  if (!fs.existsSync(p)) continue;
  let t = fs.readFileSync(p, 'utf8');
  let n = 0;

  // 1) el botón dibujado a mano: <Tactil onPress={() => router.back()} …><ArrowLeft …/></Tactil>
  const boton = /<Tactil onPress=\{\(\) => router\.back\(\)\}[^>]*>\s*\n\s*<ArrowLeft[^/]*\/>\s*\n\s*<\/Tactil>/g;
  const m = t.match(boton);
  if (m) { t = t.replace(boton, '<Volver />'); n += m.length; }

  // 2) el resto de llamadas directas: se cambian por el ayudante que sí sabe salir
  const restantes = (t.match(/router\.back\(\)/g) || []).length;
  if (restantes) {
    t = t.replace(/router\.back\(\)/g, 'ir.atras()');
    n += restantes;
  }

  if (!n) continue;
  if (t.includes('<Volver />') && !/import \{ Volver \}/.test(t)) {
    const ms = [...t.matchAll(/from\s+'[^']+';/g)];
    const last = ms[ms.length - 1];
    const end = last.index + last[0].length;
    const eol = t.indexOf('\n', end);
    const at = eol < 0 ? t.length : eol;
    const ruta = rel.split('/').length > 2 ? '../../components/Volver' : '../components/Volver';
    t = t.slice(0, at) + `\nimport { Volver } from '${ruta}';` + t.slice(at);
  }
  if (t.includes('ir.atras()') && !/\bir\b[^\n]*from '.*constants\/rutas'/.test(t)) {
    const ms = [...t.matchAll(/from\s+'[^']+';/g)];
    const last = ms[ms.length - 1];
    const end = last.index + last[0].length;
    const eol = t.indexOf('\n', end);
    const at = eol < 0 ? t.length : eol;
    const ruta = rel.split('/').length > 2 ? '../../constants/rutas' : '../constants/rutas';
    t = t.slice(0, at) + `\nimport { ir } from '${ruta}';` + t.slice(at);
  }

  fs.writeFileSync(p, t, 'utf8');
  total += n; tocados++;
  console.log(`  ${rel}: ${n} cambio(s)`);
}

console.log(`\narchivos tocados: ${tocados} · cambios: ${total}`);
