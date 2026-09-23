/**
 * Fase 2 · 21 — La sexta lista: «Mis productos» dentro del formulario de vendedor (ecomerse-seller).
 *
 * Por qué no es un reemplazo directo: la lista es la ÚLTIMA sección de un formulario largo (alta
 * de negocio + publicación de producto + productos rechazados). El ScrollView (L275) no contiene
 * «una lista»: contiene un formulario entero y, al final, la lista. Así que el formulario pasa a
 * ser la CABECERA de la lista y el banner del plan su PIE, con la lista como filas:
 *
 *   data = me.products · renderItem = la fila de producto · ListHeaderComponent = el formulario
 *   ListFooterComponent = el banner del plan
 *
 * Los dos `ScrollView` HORIZONTALES de dentro (categoría y subcategoría) se quedan: React Native
 * desactiva la virtualización al anidar listas de la MISMA dirección, y esos son perpendiculares
 * (además no son listas virtualizadas, son `.map()` normales).
 *
 * Cambio de tipo que hay que hacer a mano: el contenedor guardaba un `ref` para subir arriba al
 * editar un producto (`formRef.current?.scrollTo({ y: 0 })`). Una `FlatList` no tiene `scrollTo`,
 * tiene `scrollToOffset` — si no se cambia, TypeScript lo caza.
 *
 * Uso: node pruebas/fase2-lista-ecomerse-seller.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/ecomerse-seller.tsx');
let t = fs.readFileSync(p, 'utf8');
let fallos = 0;

const A_IMPORT = '  Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,';
const A_REF_TIPO = 'const formRef = useRef<ScrollView>(null);';
const A_REF_USO = 'formRef.current?.scrollTo({ y: 0, animated: true });';
const A_SCROLL = '        <ScrollView ref={formRef} contentContainerStyle={{ padding: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">';
const A_LISTA_INI = '          {/* Mis productos */}\n          {me && me.products.length > 0 && (\n            <>\n              <Text style={[s.sectionTitle, { marginTop: 22 }]}>Mis productos ({me.products.length})</Text>\n              {me.products.map((p) => (\n';
const A_LISTA_FIN = '                  </View>\n                </Pressable>\n              ))}\n            </>\n          )}\n';
const A_BANNER_INI = '          {/* Banner de plan al final (upsell después de haber publicado) */}';
const A_BANNER_FIN = '          </Pressable>\n        </ScrollView>\n';

for (const [nombre, ancla] of Object.entries({
  A_IMPORT, A_REF_TIPO, A_REF_USO, A_SCROLL, A_LISTA_INI, A_LISTA_FIN, A_BANNER_INI, A_BANNER_FIN,
})) {
  if (!t.includes(ancla)) { console.log(`  SIN ANCLA: ${nombre}`); fallos++; }
}
if (fallos) { console.log('\nNo se escribe nada.'); process.exit(1); }

// ── 1) Extraer la fila de producto tal cual (sin retipearla) y reindentarla ───
const iFila = t.indexOf('                <Pressable key={p.id}\n');
const iFilaFin = t.indexOf(A_LISTA_FIN, iFila);
if (iFila < 0 || iFilaFin < 0) { console.log('  SIN ANCLA: fila de producto'); process.exit(1); }
const fila = t.slice(iFila, iFilaFin + '                  </View>\n                </Pressable>\n'.length)
  .split('\n')
  .map((l) => (l.startsWith('    ') ? l.slice(4) : l))
  .join('\n');

// ── 2) El tramo de «Mis productos» pasa a título en la cabecera + renderItem ──
const iIni = t.indexOf(A_LISTA_INI);
const iFin = t.indexOf(A_LISTA_FIN, iIni) + A_LISTA_FIN.length;
t = t.slice(0, iIni) + [
  '          {/* Mis productos: el título va en la cabecera de la lista, las filas son la lista */}',
  '          {me && me.products.length > 0 ? (',
  '            <Text style={[s.sectionTitle, { marginTop: 22 }]}>Mis productos ({me.products.length})</Text>',
  '          ) : null}',
  '            </>',
  '          }',
  '          renderItem={({ item: p }) => (',
  fila,
  '          )}',
  '',
].join('\n') + t.slice(iFin);
console.log('  OK «Mis productos» repartido en cabecera + filas');

// ── 3) El banner del plan pasa a pie de lista ────────────────────────────────
t = t.replace(A_BANNER_INI, '          ListFooterComponent={\n            <>\n' + A_BANNER_INI);
t = t.replace(A_BANNER_FIN, '          </Pressable>\n            </>\n          }\n        />\n');
console.log('  OK banner del plan como pie de lista');

// ── 4) El ScrollView pasa a FlatList ────────────────────────────────────────
t = t.replace(A_SCROLL, [
  '        /*',
  '          LISTA VIRTUALIZADA (auditoría de diseño, D-04/D-21): el formulario es largo y «Mis',
  '          productos» era su última sección, con un .map() que montaba todos los productos.',
  '          Ahora el formulario es la cabecera de la lista y el banner del plan su pie; nada más',
  '          de la pantalla cambia.',
  '        */',
  '        <FlatList',
  '          ref={formRef}',
  '          data={me?.products ?? []}',
  '          keyExtractor={(p) => p.id}',
  '          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}',
  '          showsVerticalScrollIndicator={false}',
  '          keyboardShouldPersistTaps="handled"',
  '          initialNumToRender={8}',
  '          windowSize={7}',
  '          removeClippedSubviews',
  '          ListHeaderComponent={',
  '            <>',
].join('\n'));
console.log('  OK contenedor como FlatList');

// ── 5) El ref cambia de tipo y de método ────────────────────────────────────
t = t.replace(A_REF_TIPO, 'const formRef = useRef<FlatList>(null);');
t = t.replace(A_REF_USO, 'formRef.current?.scrollToOffset({ offset: 0, animated: true });');
console.log('  OK ref de ScrollView a FlatList (scrollToOffset)');

// ── 6) Import de FlatList (ScrollView se queda: los horizontales y el modal lo usan) ──
t = t.replace(A_IMPORT, '  Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,');
console.log('  OK FlatList importado');

fs.writeFileSync(p, t, 'utf8');
console.log('\n«Mis productos» virtualizado');
