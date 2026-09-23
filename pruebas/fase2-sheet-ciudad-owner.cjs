/**
 * Fase 2 · 19 — Difusión de `Sheet`, tanda 4: el selector de ciudad de `food-owner`.
 *
 * Mismo caso que el de `ecomerse-seller` (§19-bis del informe): `<Modal>` a mano con fondo, cierre al
 * tocar fuera, `accessibilityViewIsModal` y una cabecera con su «X» — todo lo que el `Sheet` trae, y
 * sin anunciar el título como cabecera. La lista de ciudades conserva su `maxHeight: 420` (que ya
 * tenía) además del tope del propio `Sheet`, así que aquí la altura está acotada por partida doble.
 *
 * Los imports se ajustan por PATRÓN y no por línea exacta: así el script no depende de cómo esté
 * formateada la lista de imports en cada archivo (que ya me costó un intento fallido).
 *
 * Uso: node pruebas/fase2-sheet-ciudad-owner.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/food-owner.tsx');
let t = fs.readFileSync(p, 'utf8');
let fallos = 0;

const A_REGION = [
  '      {/* Modal de ciudad */}',
  '      <Modal visible={cityModal} animationType="slide" transparent onRequestClose={() => setCityModal(false)}>',
  '        <Pressable style={s.modalWrap} onPress={() => setCityModal(false)} accessibilityViewIsModal>',
  '          <Pressable style={[s.modalCard, { backgroundColor: colors.card }]}>',
  '            <View style={s.modalHead}>',
  '              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>Elige la ciudad</Text>',
  '              <Pressable onPress={() => setCityModal(false)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar">',
  '                <X size={20} color={colors.textPrimary} />',
  '              </Pressable>',
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

if (!t.includes(A_REGION)) { console.log('  SIN ANCLA: cabecera del modal'); fallos++; }
if (!t.includes(A_TAIL)) { console.log('  SIN ANCLA: cierre del modal'); fallos++; }
if (fallos) { console.log('\nNo se escribe nada.'); process.exit(1); }

const reindentar = (txt, n) => txt.split('\n').map((l) => {
  let i = 0; while (i < n && l[i] === ' ') i++;
  return l.slice(i);
}).join('\n');

const iHead = t.indexOf(A_REGION);
const iCuerpo = iHead + A_REGION.length;
const iTail = t.indexOf(A_TAIL, iCuerpo);
// El cuerpo (ScrollView + lista de ciudades) se recoloca dentro del Sheet
const cuerpo = reindentar(t.slice(iCuerpo, iTail + '            </ScrollView>\n'.length), 4);

t = t.slice(0, iHead) + [
  '      {/*',
  '        Selector de ciudad. Era un `<Modal>` a mano con su cabecera y su «X»; el `Sheet` trae el',
  '        fondo, el cierre al tocar fuera, el botón de atrás y el título anunciado como cabecera.',
  '      */}',
  '      <Sheet',
  '        visible={cityModal}',
  '        position="bottom"',
  '        title="Elige la ciudad"',
  '        onClose={() => setCityModal(false)}',
  '      >',
  cuerpo.replace(/\n+$/, '\n'),
  '      </Sheet>',
  '',
].join('\n') + t.slice(iTail + A_TAIL.length);
console.log('  OK el selector de ciudad usa el Sheet');

// Imports por patrón: entra Sheet, sale Modal si ya no se usa
t = t.replace(/import \{([^}]*)\} from '@egrouteplan\/ui-kit';/, (m, dentro) =>
  `import { ${dentro.trim()}, Sheet } from '@egrouteplan/ui-kit';`);
if (!/<Modal/.test(t)) {
  t = t.replace(/import \{([^}]*)\} from 'react-native';/, (m, dentro) => {
    const limpio = dentro.split(',').map((x) => x.trim()).filter((x) => x && x !== 'Modal').join(', ');
    return `import { ${limpio} } from 'react-native';`;
  });
  console.log('  OK Modal fuera del import (ya no se usa)');
} else {
  console.log('  AVISO: el archivo aún usa <Modal en otro sitio: no se toca el import');
}

// Estilos muertos
for (const estilo of ['modalWrap', 'modalCard', 'modalHead', 'modalTitle', 'cityItem']) {
  const usos = (t.match(new RegExp(`s\\.${estilo}\\b`, 'g')) || []).length;
  if (usos === 0) {
    const re = new RegExp(`\\n\\s*${estilo}: \\{[^}]*\\},`, 'g');
    if (re.test(t)) { t = t.replace(re, ''); console.log(`  OK estilo muerto retirado: ${estilo}`); }
  }
}

fs.writeFileSync(p, t, 'utf8');
console.log('\nLa ciudad se elige desde el Sheet del kit (food-owner)');
