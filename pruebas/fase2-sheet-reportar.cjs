/**
 * Fase 2 · 19 — Difusión de `Sheet`, tanda 6: reportar un anuncio (`ecomerse-detail`).
 *
 * Modal de dinero (la ficha de un producto del Mercado) escrito a mano con fondo oscurecido, cierre
 * al tocar fuera y `accessibilityViewIsModal` — todo lo que trae el `Sheet`, que además **anuncia el
 * título como cabecera**. El subtítulo que estaba bajo el título pasa a la prop `subtitle`, y
 * `busy={reportBusy}` conserva lo que ya hacía el original: **no se puede cerrar mientras envía**.
 *
 * Los botones NO se tocan (incluido «Enviar reporte»): su contenido es el mismo.
 *
 * Uso: node pruebas/fase2-sheet-reportar.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/ecomerse-detail.tsx');
let t = fs.readFileSync(p, 'utf8');
let fallos = 0;

const A_HEAD = [
  '      {/* Modal Reportar (funciona en Android e iOS) */}',
  '      <Modal visible={reportOpen} animationType="slide" transparent onRequestClose={() => setReportOpen(false)}>',
  '        <Pressable style={s.modalWrap} onPress={() => setReportOpen(false)} accessibilityViewIsModal>',
  '          <Pressable style={[s.modalCard, { backgroundColor: colors.card }]}>',
  '            <Text style={[s.sectionTitle, { marginBottom: 4 }]}>Reportar anuncio</Text>',
  '            <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, marginBottom: 10 }}>',
  '              Cuéntanos el motivo (fraude, prohibido, estafa…). Lo revisa el equipo de moderación.',
  '            </Text>',
  '',
].join('\n');

const A_TAIL = [
  '            </View>',
  '          </Pressable>',
  '        </Pressable>',
  '      </Modal>',
].join('\n');

for (const [n, a] of Object.entries({ A_HEAD, A_TAIL })) {
  if (!t.includes(a)) { console.log(`  SIN ANCLA: ${n}`); fallos++; }
}
if (fallos) { console.log('\nNo se escribe nada.'); process.exit(1); }

const reindentar = (txt, n) => txt.split('\n').map((l) => {
  let i = 0; while (i < n && l[i] === ' ') i++;
  return l.slice(i);
}).join('\n');

const iHead = t.indexOf(A_HEAD);
const iCuerpo = iHead + A_HEAD.length;
const iTail = t.indexOf(A_TAIL, iCuerpo);
const cuerpo = reindentar(t.slice(iCuerpo, iTail), 4);

t = t.slice(0, iHead) + [
  '      {/*',
  '        Reportar anuncio. Era un `<Modal>` a mano que repetía lo del `Sheet`; con él se hereda el',
  '        fondo, el cierre al tocar fuera, el botón de atrás y el título anunciado como cabecera.',
  '      */}',
  '      <Sheet',
  '        visible={reportOpen}',
  '        position="bottom"',
  '        busy={reportBusy}',
  '        title="Reportar anuncio"',
  '        subtitle="Cuéntanos el motivo (fraude, prohibido, estafa…). Lo revisa el equipo de moderación."',
  '        onClose={() => setReportOpen(false)}',
  '      >',
  cuerpo.replace(/\n+$/, '\n'),
  '            </View>',
  '      </Sheet>',
].join('\n') + t.slice(iTail + A_TAIL.length);
console.log('  OK el modal de reportar usa el Sheet');

// Import: entra Sheet
t = t.replace(/import \{([^}]*)\} from '@egrouteplan\/ui-kit';/, (m, dentro) => {
  const nombres = dentro.split(',').map((x) => x.trim()).filter(Boolean);
  if (!nombres.includes('Sheet')) nombres.push('Sheet');
  return `import { ${nombres.join(', ')} } from '@egrouteplan/ui-kit';`;
});
// `Modal` fuera si ya no se usa
if (!/<Modal/.test(t)) {
  t = t.replace(/import \{([^}]*)\} from 'react-native';/, (m, dentro) => {
    const limpio = dentro.split(',').map((x) => x.trim()).filter((x) => x && x !== 'Modal').join(', ');
    return `import { ${limpio} } from 'react-native';`;
  });
  console.log('  OK Modal fuera del import');
} else {
  console.log('  AVISO: el archivo usa otro <Modal: import intacto');
}
// Estilos muertos
for (const estilo of ['modalWrap', 'modalCard']) {
  if (!new RegExp(`s\\.${estilo}\\b`).test(t)) {
    const re = new RegExp(`\\n\\s*${estilo}: \\{[^}]*\\},`, 'g');
    if (re.test(t)) { t = t.replace(re, ''); console.log(`  OK estilo muerto retirado: ${estilo}`); }
  }
}

fs.writeFileSync(p, t, 'utf8');
console.log('\nReportar un anuncio usa el Sheet del kit');
