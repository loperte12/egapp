/**
 * Fase 2 · 21 — Las reservas del hotel pasan a lista virtualizada POR SECCIONES (D-04/D-21).
 *
 * Contexto (esto corrige a RELEVO.md §5-B y al informe §11-bis): se creía que el `reservas.map`
 * de estas dos pantallas estaba FUERA del ScrollView, «en otro contenedor». NO es así: las líneas
 * 291/303 son la DEFINICIÓN del componente `Grupo`, y `Grupo` SE INVOCA DESDE DENTRO del
 * ScrollView (reservas: tres secciones; panel: cuatro). Se leyó la línea del `.map()` sin mirar
 * quién lo llama: una ancla de grep señala una línea, no distingue uso de definición.
 *
 * Por eso el instrumento correcto es `SectionList`, no `FlatList`:
 *   · la sección es el grupo («En curso», «Próximas», «Historial»…),
 *   · la fila es la reserva (la `Tarjeta` que ya existía),
 *   · el título de sección pasa a `renderSectionHeader` (mismo `styles.seccion`, mismo contador),
 *   · la cabecera de pantalla (aviso, error, ocupación, la puerta a «Gestión», el resumen del día)
 *     va a `ListHeaderComponent`,
 *   · el vacío, a `ListEmptyComponent`.
 *
 * Se conserva el aspecto: mismo `contentContainerStyle` (padding 14, el inset abajo y `gap: 12`
 * — las celdas de una lista virtualizada van envueltas en su propio View, así que `gap` separa).
 * `stickySectionHeadersEnabled={false}` a propósito: los títulos nunca fueron pegajosos.
 *
 * Uso: node pruebas/fase2-lista-hotel.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
let fallos = 0;

const A_SCROLL = [
  '        <ScrollView',
  '          contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 30, gap: 12 }}',
  '          refreshControl={',
  '            <RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); void cargar(true); }} tintColor={colors.primary} />',
  '          }',
  '        >',
].join('\n');

const A_IMPORT = 'RefreshControl, ScrollView, StyleSheet';

const COMENTARIO = [
  '        /*',
  '          LISTA VIRTUALIZADA POR SECCIONES (auditoría de diseño, D-04/D-21): antes era un',
  '          ScrollView con un bloque «Grupo» por sección y cada bloque con su .map(), así que',
  '          TODAS las reservas quedaban montadas. Aquí la sección es el grupo y la fila es la',
  '          reserva. `stickySectionHeadersEnabled` en false a propósito: los títulos nunca',
  '          fueron pegajosos. El hueco lo pone el `gap: 12` del contenedor.',
  '        */',
].join('\n');

/** Corta una función completa `function <nombre>({ … }) { … }` del archivo. */
function cortarFuncion(t, nombre) {
  const i = t.indexOf(`function ${nombre}({`);
  if (i < 0) return null;
  const iFin = t.indexOf('\n}\n', i);
  if (iFin < 0) return null;
  let fin = iFin + 3;
  if (t[fin] === '\n') fin++; // la línea en blanco que la separaba de la siguiente función
  return { i, fin };
}

function procesar(archivo, cfg) {
  const p = path.join(APP, archivo);
  let t = fs.readFileSync(p, 'utf8');

  for (const [nombre, ancla] of Object.entries({ A_SCROLL, A_IMPORT })) {
    if (!t.includes(ancla)) { console.log(`  SIN ANCLA: ${nombre} en ${archivo}`); fallos++; return; }
  }
  for (const [nombre, ancla] of Object.entries({ regionInicio: cfg.regionInicio, regionFin: cfg.regionFin })) {
    if (!t.includes(ancla)) { console.log(`  SIN ANCLA: ${nombre} en ${archivo}`); fallos++; return; }
  }
  for (const [viejo] of cfg.parches || []) {
    if (!t.includes(viejo)) { console.log(`  SIN ANCLA: parche en ${archivo}: ${viejo.slice(0, 40)}…`); fallos++; return; }
  }

  // 1) El ScrollView pasa a SectionList; su cabecera empieza aquí (ListHeaderComponent={<>)
  t = t.replace(A_SCROLL, [
    COMENTARIO,
    '        <SectionList',
    '          sections={[',
    ...cfg.secciones.map(([titulo, dato]) => `            { titulo: '${titulo}', data: ${dato} },`),
    '          ]}',
    '          keyExtractor={(r) => r.id}',
    '          contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 30, gap: 12 }}',
    '          stickySectionHeadersEnabled={false}',
    '          refreshControl={',
    '            <RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); void cargar(true); }} tintColor={colors.primary} />',
    '          }',
    '          renderSectionHeader={({ section }) => (',
    '            <Text style={[styles.seccion, { color: colors.textPrimary }]}>{section.titulo} ({section.data.length})</Text>',
    '          )}',
    cfg.renderItem,
    '          ListHeaderComponent={',
    '            <>',
  ].join('\n'));
  console.log(`  OK ${archivo}: SectionList con la cabecera abierta`);

  // 2) El tramo de las llamadas a <Grupo …> (y lo que queda del ScrollView) se sustituye
  //    por el cierre de la cabecera, el vacío y el cierre de la lista. Un solo corte.
  const iIni = t.indexOf(cfg.regionInicio);
  const iFin = t.indexOf(cfg.regionFin, iIni) + cfg.regionFin.length;
  t = t.slice(0, iIni) + cfg.regionReemplazo + '\n' + t.slice(iFin);
  console.log(`  OK ${archivo}: grupos fuera, cabecera cerrada`);

  // 3) Parches puntuales (el panel necesita recolocar su vacío)
  for (const [viejo, nuevo] of cfg.parches || []) { t = t.replace(viejo, nuevo); }
  if (cfg.parches) console.log(`  OK ${archivo}: ${cfg.parches.length} parche(s)`);

  // 4) El import: entra SectionList, sale ScrollView si ya no se usa
  t = t.replace(A_IMPORT, 'RefreshControl, SectionList, StyleSheet');
  if (/<ScrollView/.test(t)) { console.log(`  AVISO: ${archivo} aún usa <ScrollView>`); }
  else { t = t.replace(/, ScrollView,/, ','); console.log(`  OK ${archivo}: import actualizado`); }

  // 5) La función Grupo queda muerta
  const c = cortarFuncion(t, 'Grupo');
  if (!c) { console.log(`  SIN ANCLA: función Grupo en ${archivo}`); fallos++; return; }
  t = t.slice(0, c.i) + t.slice(c.fin);
  console.log(`  OK ${archivo}: función Grupo retirada (código muerto)`);

  fs.writeFileSync(p, t, 'utf8');
}

// ── 1) Reservas: tres secciones. El vacío vive ARRIBA, dentro de la cabecera y con su propio
//       guardia (`reservas.length === 0 && !error`), así que no hay que moverlo.
procesar('app/lifebook-hotel-reservas.tsx', {
  secciones: [['En curso', 'enCurso'], ['Próximas', 'futuras'], ['Historial', 'pasadas']],
  renderItem: [
    '          renderItem={({ item: r }) => (',
    '            <Tarjeta',
    '              r={r}',
    '              lado={lado}',
    '              onCancelar={cancelar}',
    '              onConfirmarSenal={confirmarSenal}',
    "              onAbrir={(x) => router.push({ pathname: '/lifebook-hotel-reserva', params: { id: x.id } } as never)}",
    '            />',
    '          )}',
  ].join('\n'),
  regionInicio: '          <Grupo\n            titulo="En curso"',
  regionFin: '        </ScrollView>\n',
  regionReemplazo: ['            </>', '          }', '        />'].join('\n'),
});

// ── 2) Panel: cuatro secciones. El vacío está ABAJO: se recoloca dentro de ListEmptyComponent.
procesar('app/lifebook-hotel-panel.tsx', {
  secciones: [
    ['Requiere tu atención', 'urgentes'],
    ['En casa hoy', 'enCurso'],
    ['Próximas llegadas', 'futuras'],
    ['Historial', 'historial.slice(0, 20)'],
  ],
  renderItem: [
    '          renderItem={({ item: r }) => (',
    '            <Tarjeta key={r.id} r={r} ocupado={ocupado === r.id} onAccion={hacer} onSenal={confirmarSenal} />',
    '          )}',
  ].join('\n'),
  regionInicio: '          <Grupo titulo="Requiere tu atención"',
  regionFin: '          {!reservas.length && !error ? (\n',
  regionReemplazo: ['            </>', '          }', '          ListEmptyComponent={', '            !error ? ('].join('\n'),
  parches: [
    // El guardia del vacío ya lo consume el corte de la región (era el final de la región),
    // así que aquí solo queda convertir el </ScrollView> en el cierre de la lista.
    ['          ) : null}\n        </ScrollView>\n', '            ) : null}\n        />\n'],
  ],
});

console.log(fallos ? `\n${fallos} problema(s): revisar a mano` : '\nReservas de hotel virtualizadas por secciones');
process.exit(fallos ? 1 : 0);
