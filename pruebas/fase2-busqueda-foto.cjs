/**
 * `ecomerse.tsx` — BÚSQUEDA POR FOTO: dos defectos reales, arreglados.
 *
 * Lo reportó el dueño («creo que ni funciona de lejos») y el código le da la razón:
 *
 *   1. MIENTRAS BUSCA, LA PANTALLA SE CONTRADICE. El encabezado del modo foto dice «Buscando
 *      productos similares…» (L196) y, a la vez, el `ListEmptyComponent` dice «No encontramos
 *      productos similares» (L296), porque esa rama **no mira `imageBusy`**. Lo primero que ve el
 *      usuario tras elegir la foto es un «no hay nada» que además es falso.
 *
 *   2. UN FALLO SE DISFRAZA DE «SIN RESULTADOS». En el `catch` de `searchByPhoto` se hace
 *      `setImageResults([])` + un `Alert`, y `imageActive` sigue activo: si la subida falla (red,
 *      servidor, formato), el usuario lee «No encontramos productos similares. Prueba con otra foto
 *      más nítida» — es decir, **se le culpa a su foto de un fallo que no es suyo**. Es el patrón
 *      que la auditoría persigue (D-03/D-47): el error tiene que decir qué pasó y ofrecer salir.
 *
 * Lo que se hace:
 *   · estado `imageError`: el fallo se guarda y se enseña **en la pantalla** (`InlineError`, con
 *     reintento), no en un `Alert` bloqueante. El `Alert` se retira.
 *   · mientras `imageBusy`: un indicador de carga, no el vacío.
 *   · solo cuando de verdad no hay resultados (ni carga ni error): `EmptyState` del kit con salida.
 *
 * Uso: node pruebas/fase2-busqueda-foto.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/ecomerse.tsx');
let t = fs.readFileSync(p, 'utf8');
let fallos = 0;

// ── 1) Estado del error ─────────────────────────────────────────────────────
const A_ESTADO = '  const [imageActive, setImageActive] = useState(false);';
if (!t.includes(A_ESTADO)) { console.log('  SIN ANCLA: estado imageActive'); fallos++; }
else {
  t = t.replace(A_ESTADO, [
    A_ESTADO,
    '  /* El fallo de la búsqueda por foto se guarda para enseñarlo EN la pantalla: antes se',
    '     convertía en una lista vacía + un Alert, o sea en un «no hay resultados» falso. */',
    '  const [imageError, setImageError] = useState<string | null>(null);',
  ].join('\n'));
  console.log('  OK estado imageError');
}

// ── 2) El catch deja de disfrazar el fallo ──────────────────────────────────
const A_CATCH = [
  '      setImageActive(true);',
  '      setImageBusy(true);',
  '      try {',
  '        const form = new FormData();',
  "        form.append('image', { uri: asset.uri, name: 'foto.jpg', type } as unknown as Blob);",
  '        const r = await ecomerseApi.searchImage(form);',
  '        setImageResults(r.products ?? []);',
  '      } catch (e) {',
  '        setImageResults([]);',
  "        Alert.alert('Búsqueda por foto', e instanceof Error ? e.message : 'No se pudo procesar la imagen. Prueba con otra foto más nítida.');",
  '      } finally {',
  '        setImageBusy(false);',
  '      }',
].join('\n');

if (!t.includes(A_CATCH)) { console.log('  SIN ANCLA: cuerpo de searchByPhoto'); fallos++; }
else {
  t = t.replace(A_CATCH, [
    '      setImageActive(true);',
    '      setImageBusy(true);',
    '      setImageError(null);',
    '      try {',
    '        const form = new FormData();',
    "        form.append('image', { uri: asset.uri, name: 'foto.jpg', type } as unknown as Blob);",
    '        const r = await ecomerseApi.searchImage(form);',
    '        setImageResults(r.products ?? []);',
    '      } catch (e) {',
    '        /*',
    '          NO se convierte en «sin resultados»: se guarda el fallo y se enseña con `InlineError`',
    '          (que además lo anuncia al lector de pantalla). Antes esto era `setImageResults([])` +',
    '          un Alert, y el usuario leía que su foto no servía cuando el problema era otro.',
    '        */',
    '        setImageResults([]);',
    "        setImageError(e instanceof Error && e.message ? e.message : 'No se pudo procesar la imagen. Prueba con otra foto.');",
    '      } finally {',
    '        setImageBusy(false);',
    '      }',
  ].join('\n'));
  console.log('  OK el fallo deja de disfrazarse de «sin resultados»');
}

// ── 3) La rama de la foto: cargando / error / vacío de verdad ────────────────
const A_RAMA = [
  '          imageActive ? (',
  "            <View style={{ alignItems: 'center', paddingTop: 40, paddingHorizontal: 32 }}>",
  "              <Text style={{ fontSize: 38, marginBottom: 8 }}>📷</Text>",
  "              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>No encontramos productos similares</Text>",
  "              <Text style={{ fontSize: 12.5, color: colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 18 }}>",
  '                Prueba con otra foto más nítida, de frente y con buena luz.',
  '              </Text>',
  "              <Pressable onPress={() => setImageActive(false)} style={s_empty.btnGhost}>",
  "                <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>← Volver al catálogo</Text>",
  '              </Pressable>',
  '            </View>',
  '          ) : error ? (',
].join('\n');

if (!t.includes(A_RAMA)) { console.log('  SIN ANCLA: rama del modo foto'); fallos++; }
else {
  t = t.replace(A_RAMA, [
    '          imageActive ? (',
    '            /* Tres estados distintos, y antes eran uno: mientras busca se enseña que busca, si',
    '               falla se dice que falló (con reintento), y solo si de verdad no hay resultados se',
    '               enseña el vacío. El vacío, además, ahora es el del kit. */',
    '            imageBusy ? (',
    "              <View style={{ alignItems: 'center', paddingTop: 48 }}>",
    '                <ActivityIndicator color={colors.primary} />',
    "                <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 10 }}>Buscando productos parecidos…</Text>",
    '              </View>',
    '            ) : imageError ? (',
    "              <View style={{ paddingTop: 40, paddingHorizontal: 32 }}>",
    '                <InlineError mensaje={imageError} onReintentar={() => void searchByPhoto()} etiquetaReintento="Elegir otra foto" />',
    '              </View>',
    '            ) : (',
    '              <EmptyState',
    "                icono={<Text style={{ fontSize: 38 }}>📷</Text>}",
    '                titulo="No encontramos productos parecidos"',
    '                texto="Prueba con otra foto más nítida, de frente y con buena luz, o busca por texto."',
    '                accionLabel="← Volver al catálogo"',
    '                onAccion={() => setImageActive(false)}',
    '              />',
    '            )',
    '          ) : error ? (',
  ].join('\n'));
  console.log('  OK cargando / error / vacío separados');
}

// ── 4) ActivityIndicator, si no estaba ─────────────────────────────────────
if (!/ActivityIndicator/.test(t.split('from \'react-native\'')[0])) {
  t = t.replace(/import \{([^}]*)\} from 'react-native';/, (m, dentro) => {
    const nombres = dentro.split(',').map((x) => x.trim()).filter(Boolean);
    if (!nombres.includes('ActivityIndicator')) nombres.unshift('ActivityIndicator');
    return `import { ${nombres.join(', ')} } from 'react-native';`;
  });
  console.log('  OK ActivityIndicator importado');
}

// ── 5) s_empty.btnGhost: fuera si ya no lo usa nadie ───────────────────────
if (!/\bs_empty\.btnGhost\b/.test(t)) {
  const re = /\n\s*btnGhost: \{[^}]*\},/;
  if (re.test(t)) { t = t.replace(re, ''); console.log('  OK s_empty.btnGhost retirado (ya no lo usa nadie)'); }
  const iS = t.indexOf('const s_empty = StyleSheet.create({');
  if (iS > 0 && /const s_empty = StyleSheet\.create\(\{\s*\}\);/.test(t.slice(iS, iS + 200))) {
    const fin = t.indexOf('});', iS) + 3;
    t = t.slice(0, iS) + t.slice(fin);
    console.log('  OK s_empty retirado entero (quedó vacío)');
  }
}

if (fallos) { console.log(`\n${fallos} problema(s): no se escribe`); process.exit(1); }
fs.writeFileSync(p, t, 'utf8');
console.log('\nLa búsqueda por foto ya distingue buscar / fallar / no haber resultados');
