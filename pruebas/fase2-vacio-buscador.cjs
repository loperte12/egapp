/**
 * Fase 2 · 23 — `lifebook-search.tsx`: el vacío de RESULTADOS al kit. (Y uno que NO se toca.)
 *
 * · Sí se convierte el de «Sin resultados»: tenía título y explicación, pero escritos a mano
 *   (15 y 13 px) y con el icono a un alpha elegido a ojo.
 * · NO se convierte el de «Todavía no hay tendencias en tu ciudad»: va **justo debajo del título de
 *   su sección** («Tendencias en {ciudad}»), y `EmptyState` exige título propio, así que adoptarlo
 *   duplicaría el encabezado. Es el mismo criterio que ya se aplicó en `food-orders` y en
 *   `lifebook-inbox-followers`; se escribe aquí para que no parezca un olvido.
 *
 * El texto conserva la consulta del usuario entre comillas, que es información útil.
 *
 * Uso: node pruebas/fase2-vacio-buscador.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/lifebook-search.tsx');
let t = fs.readFileSync(p, 'utf8');
let fallos = 0;

const A_VACIO = [
  '            <View style={styles.center}>',
  '              <Search size={36} color={alpha(colors.textSecondary, 0.3)} />',
  "              <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: 15, marginTop: 12 }}>",
  '                Sin resultados',
  '              </Text>',
  "              <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4, textAlign: 'center', paddingHorizontal: 40 }}>",
  '                No encontramos contenido para "{query}". Intenta con otra palabra.',
  '              </Text>',
  '            </View>',
].join('\n');

if (!t.includes(A_VACIO)) { console.log('  SIN ANCLA: vacío de resultados'); fallos++; }
if (fallos) { console.log('\nNo se escribe nada.'); process.exit(1); }

t = t.replace(A_VACIO, [
  '            /* Vacío del kit. Es una búsqueda sin resultados: se dice qué se buscó y qué hacer. */',
  '            <EmptyState',
  '              compacto',
  '              icono={<Search size={36} color={colors.textSecondary} />}',
  '              titulo="Sin resultados"',
  '              texto={`No encontramos contenido para "${query}". Intenta con otra palabra.`}',
  '            />',
].join('\n'));
console.log('  OK vacío de resultados al kit');

t = t.replace(/import \{([^}]*)\} from '@egrouteplan\/ui-kit';/, (m, dentro) => {
  const nombres = dentro.split(',').map((x) => x.trim()).filter(Boolean);
  if (!nombres.includes('EmptyState')) nombres.push('EmptyState');
  return `import { ${nombres.join(', ')} } from '@egrouteplan/ui-kit';`;
});
console.log('  OK import de EmptyState');

fs.writeFileSync(p, t, 'utf8');
console.log('\nEl buscador de Life Book usa el vacío del kit');
