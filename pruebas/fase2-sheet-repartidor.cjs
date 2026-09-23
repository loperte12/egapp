/**
 * Fase 2 · 19 — Difusión de `Sheet`, tanda 2: asignar repartidor (food-orders).
 *
 * Este modal es de dinero y de operación diaria del restaurante: elige quién lleva el pedido. Estaba
 * escrito a mano con el fondo oscurecido, el cierre al tocar fuera y `accessibilityViewIsModal`, o
 * sea que repetía lo que el `Sheet` ya trae — y sin anunciar el título como cabecera.
 *
 * Se conserva TODO el contenido: el estado de carga, el vacío, la lista de repartidores (que lleva su
 * propio `marginBottom`, así que se envuelve en un `View` para que el `gap` del `Sheet` no lo doble) y
 * el enlace «Cancelar».
 *
 * `food-orders` tiene un SEGUNDO modal (`ReviewModal`, con `animationType="fade"`): se queda como
 * está a propósito. Va en la próxima tanda, para poder verificar una cosa cada vez.
 *
 * Uso: node pruebas/fase2-sheet-repartidor.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/food-orders.tsx');
let t = fs.readFileSync(p, 'utf8');
let fallos = 0;

const A_HEAD = [
  '        <Modal visible transparent animationType="slide" onRequestClose={() => setAssignOrder(null)}>',
  '          <Pressable style={s.modalWrap} onPress={() => setAssignOrder(null)} accessibilityViewIsModal>',
  '            <Pressable style={[s.modalCard, { backgroundColor: colors.card }]}>',
  '              <Text style={[s.modalTitle, { color: colors.textPrimary }]}>Asignar repartidor</Text>',
  '              <Text style={{ fontSize: 11.5, color: colors.textSecondary, marginBottom: 10 }}>',
  '                {assignOrder.restaurantName} · {formatXAF(assignOrder.totalXaf)} · a domicilio',
  '              </Text>',
  '',
].join('\n');
const A_CANCELAR = [
  '              <Pressable onPress={() => setAssignOrder(null)} accessibilityRole="button" style={{ alignSelf: \'center\', paddingVertical: 10 }}>',
  '                <Text style={{ color: colors.textSecondary, fontWeight: \'700\', fontSize: 13 }}>Cancelar</Text>',
  '              </Pressable>',
  '            </Pressable>',
  '          </Pressable>',
  '        </Modal>',
  '',
].join('\n');
const A_IMPORT = "import { useTheme, alpha, GhostButton } from '@egrouteplan/ui-kit';";

for (const [n, a] of Object.entries({ A_HEAD, A_CANCELAR, A_IMPORT })) {
  if (!t.includes(a)) { console.log(`  SIN ANCLA: ${n}`); fallos++; }
}
if (fallos) { console.log('\nNo se escribe nada.'); process.exit(1); }

const reindentar = (txt, n) => txt.split('\n').map((l) => {
  let i = 0; while (i < n && l[i] === ' ') i++;
  return l.slice(i);
}).join('\n');

const iHead = t.indexOf(A_HEAD);
const iFinHead = iHead + A_HEAD.length;
const iCancelar = t.indexOf(A_CANCELAR, iFinHead);
// El cuerpo (carga / vacío / lista de repartidores) se recoloca dentro del Sheet
const cuerpo = reindentar(t.slice(iFinHead, iCancelar), 6).replace(/\n+$/, '\n');

const nuevo = [
  '        /*',
  '          Era un `<Modal>` a mano que repetía lo del `Sheet` (fondo, cierre al tocar fuera, foco',
  '          atrapado) y además no anunciaba el título como cabecera. El contenido es el mismo.',
  '          OJO: va como comentario JS normal, NO como `{/* … */}`: esto vive dentro de',
  '          `{assignOrder && ( … )}`, donde solo cabe UNA expresión.',
  '        */',
  '        <Sheet',
  '          visible',
  '          position="bottom"',
  '          title="Asignar repartidor"',
  '          subtitle={`${assignOrder.restaurantName} · ${formatXAF(assignOrder.totalXaf)} · a domicilio`}',
  '          onClose={() => setAssignOrder(null)}',
  '        >',
  '          {/* La lista lleva su propio marginBottom: se envuelve para que el gap del Sheet no lo doble. */}',
  '          <View>',
  cuerpo,
  '          </View>',
  '          <Pressable onPress={() => setAssignOrder(null)} accessibilityRole="button" style={{ alignSelf: \'center\', paddingVertical: 10 }}>',
  '            <Text style={{ color: colors.textSecondary, fontWeight: \'700\', fontSize: 13 }}>Cancelar</Text>',
  '          </Pressable>',
  '        </Sheet>',
  '',
].join('\n');

t = t.slice(0, iHead) + nuevo + t.slice(iCancelar + A_CANCELAR.length);
t = t.replace(A_IMPORT, "import { useTheme, alpha, GhostButton, Sheet } from '@egrouteplan/ui-kit';");
fs.writeFileSync(p, t, 'utf8');
console.log('  OK el modal de asignar repartidor usa el Sheet');

console.log('\nRepartidor asignado desde el Sheet del kit');
