/**
 * Fase 2 · 20 — `ecomerse.tsx`: la rama de ERROR pasa al `InlineError` del kit.
 *
 * Era un bloque a mano: 📡 + «Algo salió mal» + el mensaje + un botón «Reintentar» con estilo
 * propio (`s_empty.btnPrimary`). El `InlineError` del kit dice lo mismo y además **se anuncia al
 * lector de pantalla y vibra**, que el bloque a mano no hacía. Es el mismo criterio que en
 * `lifebook-vistos` (informe §17): el vacío y el error son dos cosas distintas y se ven distintas.
 *
 * Se conserva el sentido del texto: «No pudimos cargar el catálogo.» + el mensaje del servidor.
 * El script comprueba los usos ANTES de borrar `s_empty.btnPrimary`: si algo más lo usa, se queda.
 *
 * Uso: node pruebas/fase2-error-ecomerse.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/ecomerse.tsx');
let t = fs.readFileSync(p, 'utf8');
let fallos = 0;

const A_ERROR = [
  '          ) : error ? (',
  '            <View style={{ alignItems: \'center\', paddingTop: 40, paddingHorizontal: 32 }}>',
  '              <Text style={{ fontSize: 38, marginBottom: 8 }}>📡</Text>',
  '              <Text style={{ fontSize: 14, fontWeight: \'800\', color: colors.textPrimary }}>Algo salió mal</Text>',
  '              <Text style={{ fontSize: 12.5, color: colors.textSecondary, textAlign: \'center\', marginTop: 6, lineHeight: 18 }}>{error}</Text>',
  '              <Pressable onPress={load} style={s_empty.btnPrimary}>',
  '                <Text style={{ color: brand.white, fontWeight: \'800\', fontSize: 13 }}>Reintentar</Text>',
  '              </Pressable>',
  '            </View>',
].join('\n');

if (!t.includes(A_ERROR)) { console.log('  SIN ANCLA: rama de error'); fallos++; }
if (fallos) { console.log('\nNo se escribe nada.'); process.exit(1); }

t = t.replace(A_ERROR, [
  '          ) : error ? (',
  '            /*',
  '              El error, con el componente del kit: se anuncia al lector de pantalla, vibra y trae',
  '              su propio reintento. Era un bloque a mano con 📡 y un botón de estilo propio.',
  '            */',
  '            <View style={{ paddingTop: 40, paddingHorizontal: 32 }}>',
  '              <InlineError mensaje={`No pudimos cargar el catálogo. ${error}`} onReintentar={load} />',
  '            </View>',
].join('\n'));
console.log('  OK rama de error con InlineError');

// Import del kit (por patrón)
t = t.replace(/import \{([^}]*)\} from '@egrouteplan\/ui-kit';/, (m, dentro) => {
  const nombres = dentro.split(',').map((x) => x.trim()).filter(Boolean);
  if (!nombres.includes('InlineError')) nombres.push('InlineError');
  return `import { ${nombres.join(', ')} } from '@egrouteplan/ui-kit';`;
});
console.log('  OK import de InlineError');

// Estilo huérfano: solo si ya no lo usa NADIE
if (!/\bs_empty\.btnPrimary\b/.test(t)) {
  const re = /\n\s*btnPrimary: \{[^}]*\},/;
  if (re.test(t)) { t = t.replace(re, ''); console.log('  OK s_empty.btnPrimary retirado (ya no lo usa nadie)'); }
} else {
  console.log('  s_empty.btnPrimary se queda: aún se usa en otro sitio');
}

fs.writeFileSync(p, t, 'utf8');
console.log('\nEl error del catálogo usa el kit');
