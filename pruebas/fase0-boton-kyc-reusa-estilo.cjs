/**
 * Fase 0 · ajuste del botón de KYC del monedero: reutiliza el estilo `label` de la pantalla en vez
 * de declarar otro `fontSize` a mano (la guardia de diseño `npm run diseno` lo rechazó, y con razón).
 * Uso: node pruebas/fase0-boton-kyc-reusa-estilo.cjs
 */
const fs = require('fs');
const path = require('path');

const APP = path.resolve(__dirname, '..');
const VIEJO = "<Text style={{ color: colors.primary, fontSize: 13.5, fontWeight: '800' }}>Verificar mi identidad →</Text>";
const NUEVO = "<Text style={[styles.label, { color: colors.primary, textTransform: 'none', letterSpacing: 0 }]}>Verificar mi identidad →</Text>";

let fallos = 0;
for (const n of ['monedero-recargar.tsx', 'monedero-retirar.tsx']) {
  const p = path.join(APP, 'app', n);
  const t = fs.readFileSync(p, 'utf8');
  if (!t.includes(VIEJO)) { console.log(`  SIN ANCLA en ${n}`); fallos++; continue; }
  fs.writeFileSync(p, t.split(VIEJO).join(NUEVO), 'utf8');
  console.log(`  OK ${n}: el botón reutiliza styles.label`);
}
process.exit(fallos ? 1 : 0);
