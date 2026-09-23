/**
 * Fase 2 · 19 — Difusión de `Sheet`, tanda 3: el selector de ciudad de `ecomerse-seller`.
 *
 * Es un modal de formulario de dinero (la ciudad del negocio y la del producto), escrito a mano con
 * fondo oscurecido, cierre al tocar fuera, `accessibilityViewIsModal` y una cabecera con su propia
 * «X». Todo eso lo trae el `Sheet`, que además anuncia el título como cabecera — lo que este modal
 * no hacía. La «X» desaparece a propósito: el `Sheet` se cierra tocando fuera y con el botón de
 * atrás, que es su contrato y el que ya usa `billing-status`.
 *
 * Se conserva el contenido tal cual (la lista de ciudades con su región) y los estilos que quedan
 * muertos se retiran: la guardia los contaba.
 *
 * Uso: node pruebas/fase2-sheet-ciudad.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/ecomerse-seller.tsx');
let t = fs.readFileSync(p, 'utf8');
let fallos = 0;

const A_HEAD = [
  '      <Modal visible={cityModal !== null} animationType="slide" transparent onRequestClose={() => setCityModal(null)}>',
  '        <Pressable style={s.modalWrap} onPress={() => setCityModal(null)} accessibilityViewIsModal>',
  '          <Pressable style={[s.modalCard, { backgroundColor: colors.card }]}>',
  '            <View style={s.modalHead}>',
  '              <Text style={s.modalTitle}>Elige la ciudad</Text>',
  '              <Pressable onPress={() => setCityModal(null)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar"><X size={20} color={colors.textPrimary} /></Pressable>',
  '            </View>',
  '',
].join('\n');
const A_TAIL = [
  '            </ScrollView>',
  '          </Pressable>',
  '        </Pressable>',
  '      </Modal>',
  '',
].join('\n');
const A_IMPORT = "import { useTheme, alpha, PrimaryButton, GhostButton, FormField, brand } from '@egrouteplan/ui-kit';";

for (const [n, a] of Object.entries({ A_HEAD, A_TAIL, A_IMPORT })) {
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
  '        Selector de ciudad (24 de GQ): era un `<Modal>` a mano con su cabecera y su «X». El `Sheet`',
  '        trae el fondo, el cierre al tocar fuera, el botón de atrás y el título como cabecera.',
  '        OJO: aquí va como `{/* … */}` porque estamos en hijos de JSX (no dentro de `cond && (…)`).',
  '      */}',
  '      <Sheet',
  '        visible={cityModal !== null}',
  '        position="bottom"',
  '        title="Elige la ciudad"',
  '        onClose={() => setCityModal(null)}',
  '      >',
  cuerpo.replace(/\n+$/, '\n'),
  '        </ScrollView>',
  '      </Sheet>',
  '',
].join('\n') + t.slice(iTail + A_TAIL.length);
console.log('  OK el selector de ciudad usa el Sheet');

t = t.replace(A_IMPORT, "import { useTheme, alpha, PrimaryButton, GhostButton, FormField, brand, Sheet } from '@egrouteplan/ui-kit';");
// `Modal` deja de usarse en este archivo
t = t.replace(/import \{([^}]*)\} from 'react-native';/, (m, dentro) => {
  const limpio = dentro.split(',').map((x) => x.trim()).filter((x) => x && x !== 'Modal').join(', ');
  return `import { ${limpio} } from 'react-native';`;
});
// Estilos que quedan muertos
for (const estilo of ['modalWrap', 'modalCard', 'modalHead', 'modalTitle', 'cityItem']) {
  const usos = (t.match(new RegExp(`s\\.${estilo}\\b`, 'g')) || []).length;
  if (usos === 0) {
    const re = new RegExp(`\\n\\s*${estilo}: \\{[^}]*\\},`, 'g');
    if (re.test(t)) { t = t.replace(re, ''); console.log(`  OK estilo muerto retirado: ${estilo}`); }
  }
}

fs.writeFileSync(p, t, 'utf8');
console.log('\nLa ciudad se elige desde el Sheet del kit');
