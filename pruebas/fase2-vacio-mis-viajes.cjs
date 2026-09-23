/**
 * Fase 2 · 23 — `intercity-publish.tsx`: el vacío de «Mis viajes» al kit.
 *
 * Es un cabo suelto MÍO: cuando convertí este paso en `SectionList` (informe §13.6) moví el aviso
 * de «no hay viajes» a `ListEmptyComponent` **dejándolo como un `Text` pelado**. Ahora usa el
 * componente del kit, como el resto de la app.
 *
 * El texto original ya decía qué pasa y qué hacer («Pulsa + para crear uno»), así que se conserva la
 * idea y se dice mejor: el `+` solo aparece con perfil de conductor aprobado, así que el vacío no
 * debe mandar a pulsar un botón que puede no estar.
 *
 * Uso: node pruebas/fase2-vacio-mis-viajes.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/intercity-publish.tsx');
let t = fs.readFileSync(p, 'utf8');
let fallos = 0;

const VIEJO = '          ListEmptyComponent={\n            <Text style={{ color: colors.textSecondary, fontWeight: \'700\', textAlign: \'center\' }}>Aún no has publicado viajes. Pulsa + para crear uno.</Text>\n          }';
const NUEVO = [
  '          ListEmptyComponent={',
  '            /*',
  '              Vacío con salida (D-17). El aviso viejo mandaba «pulsa + para crear uno», pero el botón',
  '              + solo se dibuja con perfil de conductor aprobado: el vacío no puede mandar a pulsar',
  '              algo que puede no estar ahí. Mejor decir qué lo llena.',
  '            */',
  '            <EmptyState',
  '              compacto',
  '              icono={<Text style={{ fontSize: tipografia.subtitle }}>🚐</Text>}',
  '              titulo="Aún no has publicado viajes"',
  '              texto="Cuando publiques uno aparecerá aquí, con sus asientos libres, su estado y las reservas que reciba."',
  '            />',
  '          }',
].join('\n');

if (!t.includes(VIEJO)) { console.log('  SIN ANCLA: vacío de Mis viajes'); fallos++; }
if (fallos) { console.log('\nNo se escribe nada.'); process.exit(1); }

t = t.replace(VIEJO, NUEVO);
t = t.replace(/import \{([^}]*)\} from '@egrouteplan\/ui-kit';/, (m, dentro) => {
  const nombres = dentro.split(',').map((x) => x.trim()).filter(Boolean);
  for (const n of ['EmptyState', 'tipografia']) if (!nombres.includes(n)) nombres.push(n);
  return `import { ${nombres.join(', ')} } from '@egrouteplan/ui-kit';`;
});

fs.writeFileSync(p, t, 'utf8');
console.log('  OK el vacío de «Mis viajes» usa el kit (y el emoji, con la escala)');
