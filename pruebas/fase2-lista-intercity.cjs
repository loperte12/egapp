/**
 * Fase 2 · 21 — La quinta lista: el paso de RESULTADOS de Ciudad a Ciudad (intercity.tsx).
 *
 * Por qué NO es un reemplazo directo (y por qué este script es distinto de los otros cuatro):
 * `intercity.tsx` no tiene «una lista dentro de un formulario»: tiene un ScrollView único (L209)
 * que es una MÁQUINA DE PASOS —search → trips → passenger → confirm → ticket—. La lista de viajes
 * vive dentro del paso «trips». Meter un FlatList ahí dentro sería anidar una lista virtualizada
 * en un ScrollView, y React Native desactiva la virtualización justo en ese caso (aviso
 * «VirtualizedLists should never be nested»). Así que lo que cambia no es el contenedor de la
 * lista: cambia QUIÉN hace el scroll en el paso de resultados.
 *
 *   {step !== 'trips' ? <ScrollView>…pasos de formulario…</ScrollView> : <FlatList …/>}
 *
 * El paso «trips» se mueve al final (junto al cierre del ScrollView) para que el ternario no parta
 * en dos el resto de los pasos. El orden de los pasos, el estado y la navegación NO cambian.
 *
 * Conserva: la cabecera del paso, el vacío, el aspecto de las tarjetas y el espaciado (el bloque
 * tenía `gap: 12`; ahora ese 12 lo pone el contentContainer de la lista, porque cada celda de un
 * VirtualizedList va envuelta en su propio View — comprobado en
 * node_modules/@react-native/virtualized-lists/.../VirtualizedListCellRenderer.js L211-218 —,
 * así que `gap` sí separa celdas).
 *
 * Uso: node pruebas/fase2-lista-intercity.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/intercity.tsx');
let t = fs.readFileSync(p, 'utf8');
let fallos = 0;

// ── Anclas exactas ────────────────────────────────────────────────────────────
const A_IMPORT = "import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';";
const A_SCROLL = '      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">';
const A_TRIPS_START = "        {step === 'trips' && (";
const A_TRIPS_END = '            ))}\n          </View>\n        )}\n';
const A_CARD_START = "              <Pressable key={t.id} onPress={() => pickTrip(t)} accessibilityRole=\"button\"";
const A_CARD_TAIL = '              </Pressable>\n';
const A_CIERRE = '      </ScrollView>\n    </View>\n  );\n}';

for (const [nombre, ancla] of Object.entries({
  A_IMPORT, A_SCROLL, A_TRIPS_START, A_TRIPS_END, A_CARD_START, A_CARD_TAIL, A_CIERRE,
})) {
  if (!t.includes(ancla)) { console.log(`  SIN ANCLA: ${nombre}`); fallos++; }
}
if (t.split(A_TRIPS_START).length - 1 !== 1) { console.log('  ANCLA AMBIGUA: A_TRIPS_START'); fallos++; }
if (fallos) { console.log('\nNo se escribe nada.'); process.exit(1); }

// ── 1) Extraer la tarjeta tal cual está (sin retipearla) y reindentarla −2 ────
const iCard = t.indexOf(A_CARD_START);
const iCardFin = t.indexOf(A_CARD_TAIL, iCard) + A_CARD_TAIL.length;
const tarjeta = t.slice(iCard, iCardFin)
  .split('\n')
  .map((l) => (l.startsWith('  ') ? l.slice(2) : l))
  .join('\n');

// ── 2) Cortar el bloque viejo del paso «trips» ───────────────────────────────
const iTrips = t.indexOf(A_TRIPS_START);
const iTripsFin = t.indexOf(A_TRIPS_END, iTrips) + A_TRIPS_END.length;
// El corte deja una línea en blanco de más a cada lado: se quitan en la junta exacta
// (no con un replace global, que podría caer en otro sitio del archivo).
t = t.slice(0, iTrips).replace(/\n\n$/, '\n') + t.slice(iTripsFin).replace(/^\n/, '');
console.log('  OK bloque viejo del paso trips fuera');

// ── 3) El ScrollView pasa a ser la rama «cualquier paso que no sea trips» ────
t = t.replace(A_SCROLL, "      {step !== 'trips' ? (\n" + A_SCROLL);
console.log('  OK ternario abierto');

// ── 4) El paso «trips» reaparece como FlatList tras el cierre del ScrollView ─
const nuevo = [
  '      ) : (',
  '        /*',
  '          LISTA VIRTUALIZADA (auditoría de diseño, D-04/D-21): antes era un .map() y todos los',
  '          viajes quedaban montados. Aquí el paso de resultados ES la lista; los pasos de',
  '          formulario siguen en el ScrollView, porque anidar listas virtualizadas la desactiva.',
  '        */',
  '        <FlatList',
  '          data={trips}',
  '          keyExtractor={(t) => t.id}',
  '          contentContainerStyle={[s.content, { gap: 12, paddingBottom: insets.bottom + 24 }]}',
  '          showsVerticalScrollIndicator={false}',
  '          keyboardShouldPersistTaps="handled"',
  '          initialNumToRender={10}',
  '          windowSize={7}',
  '          removeClippedSubviews',
  '          ListHeaderComponent={',
  '            <>',
  "              <Text style={s.big}>{trip?.route ? `${trip.route.originDistrict ?? ''} → ${trip.route.destinationDistrict ?? ''}` : 'Viajes disponibles'}</Text>",
  '              <Text style={s.body}>Salida por hora local. Paga en efectivo al abordar (o al llegar).</Text>',
  '            </>',
  '          }',
  '          ListEmptyComponent={',
  "            <Text style={{ color: colors.textSecondary, fontWeight: '700', textAlign: 'center' }}>No hay viajes publicados para esta ruta todavía.</Text>",
  '          }',
  '          renderItem={({ item: t }) => (',
  tarjeta.replace(/\n$/, ''),
  '          )}',
  '        />',
  '      )}',
].join('\n');

t = t.replace(A_CIERRE, '      </ScrollView>\n' + nuevo + '\n    </View>\n  );\n}');
console.log('  OK paso trips como FlatList');

// ── 5) Import de FlatList (ScrollView se queda: la otra rama lo usa) ─────────
t = t.replace(A_IMPORT, "import { FlatList, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';");
console.log('  OK FlatList importado');

fs.writeFileSync(p, t, 'utf8');
console.log('\nPaso de resultados de Ciudad a Ciudad virtualizado');
