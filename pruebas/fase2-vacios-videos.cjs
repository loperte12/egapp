/**
 * Fase 2 · 23/20 — `lifebook-videos.tsx`: el vacío y el error pasan al kit, con la variante oscura.
 *
 * ESTA PANTALLA ES UN CASO ESPECIAL, y por eso no se había tocado: fuerza **fondo negro**
 * (`#000000`) y escribe su texto en **blanco** a mano (`brand.white` y `rgba(255,255,255,0.7)`).
 * Los componentes del kit pintan con los colores del TEMA, así que adoptarlos tal cual habría puesto
 * texto oscuro sobre negro — ilegible. Lo correcto no era copiar los colores a mano otra vez, sino
 * darle al kit lo que le faltaba: `sobreOscuro` en `EmptyState` e `InlineError`. Con eso, la pantalla
 * usa los componentes oficiales **sin perder su identidad negra**.
 *
 * Se conserva la copia (el texto del vacío) y el reintento del error, que ahora además **se anuncia
 * al lector de pantalla y vibra** (`InlineError` lo hace, el bloque a mano no).
 *
 * Uso: node pruebas/fase2-vacios-videos.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/lifebook-videos.tsx');
let t = fs.readFileSync(p, 'utf8');
let fallos = 0;

const A_REGION = [
  '      ) : error && posts.length === 0 ? (',
  '        <View style={s.center}>',
  '          <Text style={s.errTitle}>No se pudieron cargar los vídeos</Text>',
  '          <Text style={s.errSub}>{error}</Text>',
  '          <Pressable onPress={() => { didInitialScroll.current = true; void load(\'initial\'); }} style={s.retry}>',
  '            <Text style={s.retryText}>Reintentar</Text>',
  '          </Pressable>',
  '        </View>',
  '      ) : posts.length === 0 ? (',
  '        <View style={s.center}>',
  '          <Text style={{ fontSize: 40, marginBottom: 10 }}>🎬</Text>',
  '          <Text style={s.errTitle}>Todavía no hay vídeos aquí</Text>',
  '          <Text style={s.errSub}>Cuando alguien publique un vídeo en este canal aparecerá en este feed.</Text>',
  '        </View>',
  '      ) : (',
].join('\n');

if (!t.includes(A_REGION)) { console.log('  SIN ANCLA: ramas de error y vacío'); fallos++; }
if (fallos) { console.log('\nNo se escribe nada.'); process.exit(1); }

t = t.replace(A_REGION, [
  '      ) : error && posts.length === 0 ? (',
  '        /*',
  '          La pantalla es NEGRA a propósito y el kit pinta con el tema: `sobreOscuro` evita texto',
  '          oscuro sobre negro. De paso, el error se anuncia al lector de pantalla y vibra.',
  '        */',
  '        <View style={s.center}>',
  '          <InlineError',
  '            sobreOscuro',
  '            mensaje={`No se pudieron cargar los vídeos. ${error}`}',
  '            onReintentar={() => { didInitialScroll.current = true; void load(\'initial\'); }}',
  '          />',
  '        </View>',
  '      ) : posts.length === 0 ? (',
  '        <View style={s.center}>',
  '          <EmptyState',
  '            sobreOscuro',
  '            icono={<Text style={{ fontSize: 40 }}>🎬</Text>}',
  '            titulo="Todavía no hay vídeos aquí"',
  '            texto="Cuando alguien publique un vídeo en este canal aparecerá en este feed."',
  '          />',
  '        </View>',
  '      ) : (',
].join('\n'));
console.log('  OK las dos ramas usan el kit (con sobreOscuro)');

// Imports por patrón: entra lo que falta del kit
t = t.replace(/import \{([^}]*)\} from '@egrouteplan\/ui-kit';/, (m, dentro) => {
  const nombres = dentro.split(',').map((x) => x.trim()).filter(Boolean);
  for (const n of ['EmptyState', 'InlineError']) if (!nombres.includes(n)) nombres.push(n);
  return `import { ${nombres.join(', ')} } from '@egrouteplan/ui-kit';`;
});
console.log('  OK imports del kit');

// Estilos que quedan muertos (solo si ya no se usan en ninguna parte del archivo)
for (const estilo of ['errTitle', 'errSub', 'retry', 'retryText']) {
  const usos = (t.match(new RegExp(`s\\.${estilo}\\b`, 'g')) || []).length;
  if (usos === 0) {
    const re = new RegExp(`\\n\\s*${estilo}: \\{[^}]*\\},`, 'g');
    if (re.test(t)) { t = t.replace(re, ''); console.log(`  OK estilo muerto retirado: ${estilo}`); }
  }
}

fs.writeFileSync(p, t, 'utf8');
console.log('\nEl feed de vídeo usa el kit sin perder su fondo negro');
