/**
 * Fase 2 · 21 — La SÉPTIMA forma del problema y la más delicada: «listas dentro de listas».
 * app/intercity-publish.tsx — «Mis viajes» publicados y, dentro de cada viaje, sus reservas.
 *
 * Decisiones (y por qué):
 *  1. **El viaje es la FILA y la reserva es CONTENIDO de la fila.** Una reserva no se puede tocar
 *     sin tocar su viaje (aceptar una tarifa, cobrar, cancelar): separarlas en filas distintas
 *     obligaría a repetir el viaje en cada reserva o a dejar acciones huérfanas.
 *  2. **La ruta es la SECCIÓN** (`groups` ya venía agrupado por «origen → destino»), así que el
 *     título con su contador pasa a `renderSectionHeader`.
 *  3. Es una **máquina de dos modos** (`list` / `form`) dentro de un ScrollView, igual que
 *     `intercity.tsx`: el modo «lista» pasa a `SectionList` y el formulario conserva su
 *     `ScrollView` (anidar listas virtualizadas desactiva la virtualización).
 *  4. El banner del plan y el error eran comunes a los dos modos: se extraen a `cabeceraModos`
 *     para no duplicarlos.
 *
 * OJO con el hueco (aprendido a golpes en las tandas anteriores): la cabecera va dentro de un
 * `View style={s.block}` (gap 12), **no** de un fragmento — el `gap` de `contentContainerStyle`
 * separa celdas, y `ListHeaderComponent` es una sola celda.
 *
 * Secciones vacías: `groups` sale de un Map que solo se llena al insertar un viaje, así que hoy no
 * puede haber una sección sin filas; el `.filter` se deja igualmente porque React Native cuenta DOS
 * celdas por sección aunque esté vacía (VirtualizedSectionList.js L178-180) y el fallo sería un
 * «Ruta X · 0 viajes» invisible para el compilador.
 *
 * Uso: node pruebas/fase2-lista-intercity-publish.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/intercity-publish.tsx');
let t = fs.readFileSync(p, 'utf8');
let fallos = 0;

/** Quita hasta `n` espacios iniciales a cada línea (para recolocar un bloque cortado). */
function reindentar(txt, n) {
  return txt.split('\n').map((l) => {
    let i = 0;
    while (i < n && l[i] === ' ') i++;
    return l.slice(i);
  }).join('\n');
}

const A_IMPORT = "import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';";
const A_SCROLL = '        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">';
const A_RETURN = '  return (\n    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>';
const A_PLAN = '              {plan && (';
const A_ERROR = '              {error && <Text style={s.err}>{error}</Text>}\n';
const A_LISTA_INI = "              {mode === 'list' && (";
const A_LISTA_FIN = '                    </View>\n                  ))}\n                </View>\n              )}\n';
const A_H1 = '                  <View style={{ flexDirection: \'row\', justifyContent: \'space-between\', alignItems: \'center\' }}>\n                    <Text style={s.big}>Mis viajes</Text>\n                    <Pressable onPress={() => void load()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Actualizar mis viajes">\n                      <RefreshCw size={18} color={colors.primary} />\n                    </Pressable>\n                  </View>\n';
const A_H2 = '                  {pendingFares > 0 && (\n                    <View style={{ backgroundColor: alpha(colors.secondary, 0.12), borderRadius: 12, padding: 10 }}>\n                      <Text style={{ color: colors.secondary, fontWeight: \'900\', fontSize: 13 }}>🔔 {pendingFares} tarifa(s) propuesta(s) pendiente(s) de tu respuesta</Text>\n                    </View>\n                  )}\n';
const A_VACIO = '                  {trips.length === 0 && <Text style={{ color: colors.textSecondary, fontWeight: \'700\', textAlign: \'center\' }}>Aún no has publicado viajes. Pulsa + para crear uno.</Text>}\n';
const A_TITULO = '                      <Text style={{ color: colors.primary, fontWeight: \'900\', fontSize: 14 }}>\n                        {label} · {list.length} viaje{list.length === 1 ? \'\' : \'s\'}\n                      </Text>\n';
const A_CARD = '                        <View key={t.id} style={[s.card, { borderColor: colors.border }]}>\n';
const A_CARD_FIN = '                        </View>\n                      ))}\n';
const A_CIERRE_SCROLL = '        </ScrollView>\n';

for (const [nombre, ancla] of Object.entries({
  A_IMPORT, A_SCROLL, A_RETURN, A_PLAN, A_ERROR, A_LISTA_INI, A_LISTA_FIN,
  A_H1, A_H2, A_VACIO, A_TITULO, A_CARD, A_CARD_FIN, A_CIERRE_SCROLL,
})) {
  if (!t.includes(ancla)) { console.log(`  SIN ANCLA: ${nombre}`); fallos++; }
}
if (fallos) { console.log('\nNo se escribe nada.'); process.exit(1); }

// ── 1) Extraer las piezas ANTES de cortar nada ───────────────────────────────
const planError = reindentar(t.slice(t.indexOf(A_PLAN), t.indexOf(A_ERROR) + A_ERROR.length), 8).replace(/\n$/, '');
const h1 = reindentar(A_H1, 4).trim();
const h2 = reindentar(A_H2, 4).trim();
// El vacío se usaba con guardia (`{trips.length === 0 && <Text…>}`): en ListEmptyComponent la
// guardia sobra, así que se quita y queda el elemento tal cual (sin reescribirlo a mano).
const vacio = A_VACIO.trim().replace(/^\{trips\.length === 0 && /, '').replace(/\}$/, '');
// La cabecera de sección sale del propio título del grupo: `label` → `section.titulo` y
// `list.length` → `section.data.length`.
const titulo = reindentar(A_TITULO, 10).trim()
  .replace(/list\.length/g, 'section.data.length')
  .replace('{label} ·', '{section.titulo} ·');
// La tarjeta se localiza por su cierre (el `</View>` seguido del cierre del .map) para no tener
// que contar espacios a mano; luego se recorta a su propio cierre.
const iCard = t.indexOf(A_CARD);
const iCierreTarjeta = t.indexOf('</View>\n                      ))}\n', iCard);
if (iCard < 0 || iCierreTarjeta < 0) { console.log('  SIN ANCLA: tarjeta del viaje'); process.exit(1); }
const tarjeta = reindentar(t.slice(iCard, iCierreTarjeta + '</View>\n'.length), 12);

// ── 2) El bloque viejo del modo «lista» se va entero ─────────────────────────
const iIni = t.indexOf(A_LISTA_INI);
const iFin = t.indexOf(A_LISTA_FIN, iIni) + A_LISTA_FIN.length;
t = t.slice(0, iIni).replace(/\n\n$/, '\n') + t.slice(iFin);
console.log('  OK bloque viejo del modo lista fuera');

// ── 3) Banner del plan + error pasan a una constante común a los dos modos ───
const iPlan = t.indexOf(A_PLAN);
const iError = t.indexOf(A_ERROR, iPlan) + A_ERROR.length;
t = t.slice(0, iPlan) + '              {cabeceraModos}\n' + t.slice(iError);
const constante = [
  '  /*',
  '    Banner del plan + error: comunes a los DOS modos. Antes vivían una sola vez dentro del',
  '    ScrollView; ahora el modo «lista» tiene su propio contenedor virtualizado, así que se',
  '    escriben una vez aquí y se usan en los dos.',
  '  */',
  '  const cabeceraModos = (',
  '    <>',
  planError.replace(/\n$/, ''),
  '    </>',
  '  );',
  '',
].join('\n');
t = t.replace(A_RETURN, constante + A_RETURN);
console.log('  OK cabecera común (plan + error) extraída');

// ── 4) El modo «lista» pasa a SectionList y el formulario conserva su ScrollView ──
const lista = [
  "      {mode === 'list' ? (",
  '        /*',
  '          LISTA VIRTUALIZADA (auditoría de diseño, D-04/D-21): la séptima y más delicada de las',
  '          siete. El viaje es la FILA y la reserva es CONTENIDO de la fila (una reserva no se puede',
  '          tocar sin tocar su viaje: aceptar tarifa, cobrar, cancelar); la ruta es la SECCIÓN.',
  '          El modo «formulario» sigue en su ScrollView: anidar listas virtualizadas la desactiva.',
  '        */',
  '        <SectionList',
  '          sections={groups.map(([titulo, data]) => ({ titulo, data })).filter((s) => s.data.length > 0)}',
  '          keyExtractor={(t) => t.id}',
  '          contentContainerStyle={[s.content, { gap: 12, paddingBottom: insets.bottom + 24 }]}',
  '          showsVerticalScrollIndicator={false}',
  '          keyboardShouldPersistTaps="handled"',
  '          stickySectionHeadersEnabled={false}',
  '          initialNumToRender={8}',
  '          windowSize={7}',
  '          removeClippedSubviews',
  '          renderSectionHeader={({ section }) => (',
  '            ' + titulo.replace(/\n/g, '\n            '),
  '          )}',
  '          renderItem={({ item: t }) => (',
  tarjeta.replace(/\n$/, ''),
  '          )}',
  '          ListHeaderComponent={',
  '            /* El `View` con gap, no un fragmento: el gap del contenedor separa celdas, y la',
  '               cabecera es UNA celda. Con un fragmento, todo lo de dentro quedaba pegado. */',
  '            <View style={s.block}>',
  '              {cabeceraModos}',
  '              ' + h1.replace(/\n/g, '\n              '),
  '              ' + h2.replace(/\n/g, '\n              '),
  '            </View>',
  '          }',
  '          ListEmptyComponent={',
  '            ' + vacio,
  '          }',
  '        />',
  '      ) : (',
  A_SCROLL,
].join('\n');
t = t.replace(A_SCROLL, lista);
t = t.replace(A_CIERRE_SCROLL, '        </ScrollView>\n      )}\n');
console.log('  OK modo lista como SectionList (formulario en su ScrollView)');

// ── 5) Import ───────────────────────────────────────────────────────────────
t = t.replace(A_IMPORT, "import { Alert, Image, KeyboardAvoidingView, Platform, SectionList, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';");
console.log('  OK SectionList importado');

fs.writeFileSync(p, t, 'utf8');
console.log('\n«Mis viajes» del conductor virtualizado (sección por ruta, reserva dentro de su viaje)');
