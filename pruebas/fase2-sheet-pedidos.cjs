/**
 * Fase 2 · 19 — Difusión de `Sheet`: el modal de acciones del pedido (ecomerse-orders).
 *
 * El informe pide empezar por los modales de DINERO, y este es uno: cancelar un pedido, abrir una
 * disputa o valorar una compra. Lo que lo hace el candidato ideal es que **ya hacía a mano todo lo
 * que el `Sheet` del kit trae**:
 *   · cerrar al tocar fuera (un `<Pressable>` a pantalla completa),
 *   · respetar el botón de atrás (`onRequestClose`),
 *   · `accessibilityViewIsModal` para atrapar el foco,
 *   · y no cerrarse mientras trabaja (guardia con `modalBusyRef`).
 * Pero lo hacía a su manera, que es justo lo que la auditoría llama «no había un sitio único donde
 * arreglar la accesibilidad de los diálogos»: con el `Sheet` ese comportamiento se hereda.
 *
 * Se conserva TODO el contenido (las estrellas, el campo de motivo y los dos botones) tal cual, y el
 * título y el subtítulo pasan a las props del `Sheet` (que los anuncia como cabecera). Los estilos
 * `modalWrap` y `modalCard` quedan muertos y se retiran: la guardia los contaba.
 *
 * Uso: node pruebas/fase2-sheet-pedidos.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/ecomerse-orders.tsx');
let t = fs.readFileSync(p, 'utf8');
let fallos = 0;

const A_HEAD = '      {/* Modal Cancelar / Disputa / Valorar */}';
const A_BODY = '            {modal === \'review\' ? (';
const A_TAIL = '            </View>\n          </View>\n        </Pressable>\n      </Modal>\n';
const A_IMPORT = "import { useTheme, alpha, GhostButton, EmptyState } from '@egrouteplan/ui-kit';";
const A_STYLES = "  modalWrap: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },\n  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },\n";

for (const [n, a] of Object.entries({ A_HEAD, A_BODY, A_TAIL, A_IMPORT, A_STYLES })) {
  if (!t.includes(a)) { console.log(`  SIN ANCLA: ${n}`); fallos++; }
}
if (fallos) { console.log('\nNo se escribe nada.'); process.exit(1); }

/** Quita hasta `n` espacios iniciales a cada línea. */
const reindentar = (txt, n) => txt.split('\n').map((l) => {
  let i = 0; while (i < n && l[i] === ' ') i++;
  return l.slice(i);
}).join('\n');

const iHead = t.indexOf(A_HEAD);
const iCuerpo = t.indexOf(A_BODY);
const iTail = t.indexOf(A_TAIL);
const cuerpo = reindentar(t.slice(iCuerpo, iTail), 4);

const nuevo = [
  '      {/*',
  '        Cancelar / Disputa / Valorar. Era un `<Modal>` escrito a mano que ya hacía justo lo que',
  '        hace el `Sheet` del kit —cerrar al tocar fuera, respetar el botón de atrás, atrapar el',
  '        foco y NO cerrarse mientras trabaja—, pero a su manera. Con el `Sheet` se hereda.',
  '      */}',
  '      <Sheet',
  '        visible={modal !== null}',
  '        position="bottom"',
  '        busy={modalBusy}',
  "        title={modal === 'cancel' ? 'Cancelar pedido' : modal === 'dispute' ? 'Abrir disputa' : 'Valorar compra'}",
  "        subtitle={modal === 'cancel'",
  "          ? `El stock se restaura.${modalOrder?.paymentMethod === 'billing' ? ' Si pagaste por Billing, el admin revisará el reembolso.' : ''}`",
  "          : modal === 'dispute' ? 'Describe el problema (mínimo 10 caracteres).' : '¿Cómo fue tu experiencia?'}",
  '        onClose={() => setModal(null)}',
  '      >',
  cuerpo,
  '            </View>',
  '      </Sheet>',
  '',
].join('\n');

t = t.slice(0, iHead) + nuevo + t.slice(iTail + A_TAIL.length);
t = t.replace(A_STYLES, '');
t = t.replace(A_IMPORT, "import { useTheme, alpha, GhostButton, EmptyState, Sheet } from '@egrouteplan/ui-kit';");
// `Modal` de react-native deja de usarse en este archivo
t = t.replace(/import \{([^}]*)\} from 'react-native';/, (m, dentro) => {
  const limpio = dentro.split(',').map((x) => x.trim()).filter((x) => x && x !== 'Modal').join(', ');
  return `import { ${limpio} } from 'react-native';`;
});
console.log('  OK modal sustituido por Sheet (título y subtítulo como props)');

fs.writeFileSync(p, t, 'utf8');
console.log('\nEl modal de acciones del pedido usa el Sheet del kit');
