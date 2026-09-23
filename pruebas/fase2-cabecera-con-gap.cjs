/**
 * Fase 2 · 21 (corrección de las tandas anteriores) — La cabecera de una lista NO hereda el `gap`.
 *
 * Lo encontró la MEDICIÓN en el aparato, no el typecheck: en el paso de resultados de Ciudad a
 * Ciudad medí las dos líneas de la cabecera y terminaban y empezaban en el MISMO píxel (403 → 403),
 * o sea pegadas. La causa es un detalle de React Native que es fácil pasar por alto:
 *
 *   `ListHeaderComponent={<>{a}{b}</>}` mete los dos elementos en UNA sola celda. El `gap` de
 *   `contentContainerStyle` separa CELDAS, no hijos de una celda, y un fragmento no tiene estilo.
 *   Antes esos elementos eran hijos directos del contenedor con `gap`, así que SÍ estaban separados.
 *
 * Se arregla envolviendo el contenido de la cabecera en un `View` con el MISMO gap que tenía el
 * contenedor original. No se toca ninguna pantalla cuyo contenedor no tuviera gap: ahí no había
 * separación que perder (comprobado archivo por archivo: `ecomerse-seller`, `ecomerse-orders` y
 * `monedero-movimientos` usan `padding` sin `gap`; `trips-history` tiene una sola línea en su
 * cabecera; en `my-tickets` sí había `gap: 12`).
 *
 * Uso: node pruebas/fase2-cabecera-con-gap.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
let fallos = 0;

const NOTA = (gapOrigen) => [
  '            /*',
  '              Un `View` con el hueco del contenedor, y no un fragmento: el `gap` de',
  '              `contentContainerStyle` separa CELDAS, y `ListHeaderComponent` es UNA celda. Con un',
  `              fragmento, todo lo de aquí dentro quedaba pegado (era gap: ${gapOrigen} antes de virtualizar).`,
  '            */',
].join('\n');

const casos = [
  {
    archivo: 'app/intercity.tsx',
    gap: 12,
    estilo: 's.block', // el mismo bloque que tenía el paso de resultados
    abrir: '          ListHeaderComponent={\n            <>\n',
    cerrar: '            </>\n          }\n          ListEmptyComponent={',
    cierreNuevo: '            </View>\n          }\n          ListEmptyComponent={',
  },
  {
    archivo: 'app/lifebook-hotel-reservas.tsx',
    gap: 12,
    estilo: '{ gap: 12 }',
    abrir: '          ListHeaderComponent={\n            <>\n',
    cerrar: '            </>\n          }\n        />\n',
    cierreNuevo: '            </View>\n          }\n        />\n',
  },
  {
    archivo: 'app/lifebook-hotel-panel.tsx',
    gap: 12,
    estilo: '{ gap: 12 }',
    abrir: '          ListHeaderComponent={\n            <>\n',
    cerrar: '            </>\n          }\n          ListEmptyComponent={',
    cierreNuevo: '            </View>\n          }\n          ListEmptyComponent={',
  },
  {
    archivo: 'app/my-tickets.tsx',
    gap: 12,
    estilo: '{ gap: 12 }',
    abrir: '        ListHeaderComponent={\n          <>\n',
    cerrar: '          </>\n        }',
    cierreNuevo: '          </View>\n        }',
  },
];

for (const c of casos) {
  const p = path.join(APP, c.archivo);
  let t = fs.readFileSync(p, 'utf8');
  if (!t.includes(c.abrir) || !t.includes(c.cerrar)) {
    console.log(`  SIN ANCLA: ${c.archivo}`); fallos++; continue;
  }
  // La indentación se toma del propio archivo (no se fija a mano): my-tickets usa un nivel menos.
  const [primera, segunda] = c.abrir.split('\n');
  const sangria = (segunda.match(/^\s*/) || [''])[0];
  const etiqueta = `<View style={${c.estilo}}>`;
  const nota = NOTA(c.gap).split('\n').map((l) => (l ? sangria + l.trim() : l)).join('\n');
  t = t.replace(c.abrir, `${primera}\n${nota}\n${sangria}${etiqueta}\n`);
  t = t.replace(c.cerrar, c.cierreNuevo);
  fs.writeFileSync(p, t, 'utf8');
  console.log(`  OK ${c.archivo}: cabecera envuelta en ${etiqueta} (gap ${c.gap})`);
}

console.log(fallos ? `\n${fallos} problema(s)` : '\nCabeceras con su hueco restaurado');
process.exit(fallos ? 1 : 0);
