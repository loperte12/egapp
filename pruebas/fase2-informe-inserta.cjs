/**
 * Inserta la sección de la Fase 2 en el informe y marca el 0.7 como hecho.
 * Uso: node pruebas/fase2-informe-inserta.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const informe = path.join(APP, 'design-audit-report.md');
const seccion = fs.readFileSync(path.join(__dirname, 'fase2-seccion.md'), 'utf8');

let t = fs.readFileSync(informe, 'utf8');
let fallos = 0;

// 1) el 0.7 ya es real
const viejo07 = '| 0.7 | ⏳ **ESPERA TU DATO**';
const i07 = t.indexOf(viejo07);
if (i07 < 0) { console.log('  SIN ANCLA: fila 0.7'); fallos++; }
else {
  const fin = t.indexOf('\n', i07);
  const nueva = [
    '| 0.7 | ✅ **HECHO** — Fuente única en `constants/soporte.ts` (`egrouteplan@gmail.com` · **+8615504426087**).',
    'Ajustes ya **no** dice «Próximamente»: cuatro filas que abren WhatsApp, escriben un correo, llaman o reportan un problema.',
    'Y los tres avisos de dinero que remitían a un soporte inexistente (`billing-status` ×3, `kyc/status`) llevan ya el contacto',
    'y un botón para pedir el reembolso por WhatsApp. *(Ojo: el número facilitado es **+86**, China; si querías el de Guinea Ecuatorial,',
    'se cambia en ese único archivo.)* | D-37 |',
  ].join(' ');
  t = t.slice(0, i07) + nueva + t.slice(fin);
  console.log('  OK fila 0.7 actualizada');
}

// 2) la sección de Fase 2 antes del capítulo del APK
const ancla = '## 12. La reconstrucción del APK';
const i = t.indexOf(ancla);
if (i < 0) { console.log('  SIN ANCLA: capítulo 12'); fallos++; }
else if (t.includes('## 11-bis. Estado de ejecución de la Fase 2')) {
  console.log('  la sección ya estaba');
} else {
  t = t.slice(0, i) + seccion + '---\n\n' + t.slice(i);
  console.log('  OK sección 11-bis insertada');
}

fs.writeFileSync(informe, t, 'utf8');
console.log(fallos ? `\n${fallos} problema(s)` : '\nInforme actualizado');
process.exit(fallos ? 1 : 0);
