/**
 * Fase 2 · 19 — Difusión de `Sheet`, tanda 5: `ReviewModal` de `food-orders` (valorar el pedido).
 *
 * Es el pendiente que quedaba de ese archivo. El modal repetía a mano lo del `Sheet` (fondo, cierre
 * al tocar fuera, `accessibilityViewIsModal`) y **no anunciaba el título como cabecera**; además su
 * propio `card` no tenía tope de altura. El nombre del restaurante, que era un texto bajo el título,
 * pasa al `subtitle` del `Sheet` (que lo anuncia junto a la cabecera).
 *
 * Se conserva TODO el contenido: las cinco estrellas con su estado accesible, el texto de ayuda
 * («Toca las estrellas para puntuar» / «N de 5») y los dos botones con su guardia de ocupado
 * (`busyRef`), que es lo que impide enviar dos valoraciones seguidas.
 *
 * OJO con el comentario: aquí NO va la forma de JSX (llaves con asterisco) porque estamos en el
 * `return` de una función, donde solo cabe una expresión. Es un comentario JS normal. (Es la trampa
 * que ya costó dos intentos con el modal de asignar repartidor, en el sentido contrario.)
 *
 * Uso: node pruebas/fase2-sheet-valorar.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/food-orders.tsx');
let t = fs.readFileSync(p, 'utf8');
let fallos = 0;

const A_HEAD = [
  '    <Modal visible transparent animationType="fade" onRequestClose={onClose}>',
  '      <Pressable style={s_rm.wrap} onPress={onClose} accessibilityViewIsModal>',
  '        <Pressable style={[s_rm.card, { backgroundColor: colors.card }]}>',
  '          <Text style={[s_rm.title, { color: colors.textPrimary }]}>Valorar tu pedido</Text>',
  '          <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 12 }}>{order.restaurantName}</Text>',
  '',
].join('\n');

const A_TAIL = [
  '          </View>',
  '        </Pressable>',
  '      </Pressable>',
  '    </Modal>',
  '  );',
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
  '    /*',
  '      Valorar tu pedido. Era un `<Modal>` a mano que repetía lo del `Sheet` (fondo, cierre al',
  '      tocar fuera, foco atrapado) y no anunciaba el título como cabecera. El nombre del',
  '      restaurante pasa al subtítulo.',
  '    */',
  '    <Sheet',
  '      visible',
  '      position="center"',
  '      busy={busy}',
  '      title="Valorar tu pedido"',
  "      subtitle={order.restaurantName ?? undefined}",
  '      onClose={onClose}',
  '    >',
  cuerpo.replace(/\n+$/, '\n'),
  '          </View>',
  '    </Sheet>',
  '  );',
].join('\n') + t.slice(iTail + A_TAIL.length);
console.log('  OK ReviewModal usa el Sheet');

// Estilos que quedan muertos SOLO dentro del objeto s_rm
const iSrm = t.indexOf('const s_rm = StyleSheet.create({');
if (iSrm > 0) {
  const fin = t.indexOf('});', iSrm) + 3;
  let bloque = t.slice(iSrm, fin);
  for (const clave of ['wrap', 'card', 'title']) {
    if (!new RegExp(`s_rm\\.${clave}\\b`).test(t)) {
      const re = new RegExp(`\\n\\s*${clave}: \\{[^}]*\\},`, 'g');
      if (re.test(bloque)) { bloque = bloque.replace(re, ''); console.log(`  OK estilo muerto retirado: s_rm.${clave}`); }
    }
  }
  t = t.slice(0, iSrm) + bloque + t.slice(fin);
}

fs.writeFileSync(p, t, 'utf8');
console.log('\nValorar el pedido usa el Sheet del kit');
