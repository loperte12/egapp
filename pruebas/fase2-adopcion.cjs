/**
 * Fase 2 · Adopción de lo construido (construir y no adoptar fue justo el error que denunció la
 * auditoría: `PinPad` existía y no lo usaba nadie).
 *
 *   1. `EmptyState` en la lista de movimientos del monedero.
 *   2. `InlineError` en recargar, retirar y el checkout de comida (en vez de un texto suelto).
 *   3. `mensajeDeError()`: los códigos del servidor dejan de llegar crudos a la pantalla.
 *   4. `expo-image` en `LazyImage` (lo usan alquiler, hoteles e intercity): caché en disco y fundido
 *      propio, en vez de `Image` de React Native sin caché.
 *
 * Uso: node pruebas/fase2-adopcion.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
let fallos = 0;

function rep(rel, from, to, label) {
  const p = path.join(APP, rel);
  if (!fs.existsSync(p)) { console.log(`  FALTA ${rel}`); fallos++; return; }
  const t = fs.readFileSync(p, 'utf8');
  if (!t.includes(from)) { console.log(`  SIN ANCLA: ${label}`); fallos++; return; }
  fs.writeFileSync(p, t.split(from).join(to), 'utf8');
  console.log(`  OK ${label}`);
}

/** Añade una línea de import si no está ya (después del último `from '…';`). */
function addImport(rel, linea) {
  const p = path.join(APP, rel);
  let t = fs.readFileSync(p, 'utf8');
  if (t.includes(linea)) { console.log(`  ya tenía el import en ${rel}`); return; }
  const ms = [...t.matchAll(/from\s+'[^']+';/g)];
  const last = ms[ms.length - 1];
  if (!last) { console.log(`  SIN ANCLA de import en ${rel}`); fallos++; return; }
  const end = last.index + last[0].length;
  const eol = t.indexOf('\n', end);
  const at = eol < 0 ? t.length : eol;
  t = t.slice(0, at) + '\n' + linea + t.slice(at);
  fs.writeFileSync(p, t, 'utf8');
  console.log(`  OK import en ${rel}`);
}

// ── 1 · Estado vacío del monedero ───────────────────────────────────────────────────────────────
const mov = 'app/monedero-movimientos.tsx';
addImport(mov, "import { EmptyState } from '@egrouteplan/ui-kit';");
const tieneRouter = fs.readFileSync(path.join(APP, mov), 'utf8').includes('useRouter');
rep(mov,
  `            {items.length === 0 ? (
              <Text style={{ color: colors.textSecondary, fontSize: 13.5, textAlign: 'center', paddingVertical: 18 }}>
                No hay movimientos de este tipo.
              </Text>`,
  `            {items.length === 0 ? (
              <EmptyState
                compacto
                titulo="Todavía no hay movimientos de este tipo"
                texto="Cuando recargues, pagues o recibas un reembolso, aparecerán aquí con su fecha."
                ${tieneRouter ? "accionLabel=\"Recargar con un agente\"\n                onAccion={() => router.push('/monedero-recargar')}" : ''}
              />`,
  'monedero-movimientos: estado vacío con salida');

// ── 2 · Error en línea en las dos operaciones del monedero ──────────────────────────────────────
for (const [archivo, alt] of [
  ['app/monedero-recargar.tsx', 'No se pudo iniciar la recarga'],
  ['app/monedero-retirar.tsx', 'No se pudo iniciar la retirada'],
]) {
  addImport(archivo, "import { InlineError } from '@egrouteplan/ui-kit';");
  addImport(archivo, "import { mensajeDeError } from '../constants/errores';");
  rep(archivo,
    `const msg = e instanceof Error ? e.message : '${alt}';`,
    `const msg = mensajeDeError(e, '${alt}');`,
    `${path.basename(archivo)}: el mensaje pasa por el mapa de errores`);
  rep(archivo,
    '{formErr && <Text style={{ color: brand.danger, fontSize: 13, marginTop: 10 }}>{formErr}</Text>}',
    '{formErr ? <View style={{ marginTop: 10 }}><InlineError mensaje={formErr} /></View> : null}',
    `${path.basename(archivo)}: error en línea`);
}

// ── 3 · Checkout de comida: error en línea + mensaje humano ─────────────────────────────────────
const fc = 'app/food-checkout.tsx';
addImport(fc, "import { InlineError } from '@egrouteplan/ui-kit';");
addImport(fc, "import { mensajeDeError } from '../constants/errores';");
rep(fc,
  "setSubmitError(e instanceof Error ? e.message : 'No se pudo enviar el pedido. Revisa tu conexión y vuelve a intentarlo.')",
  "setSubmitError(mensajeDeError(e, 'No se pudo enviar el pedido. Revisa tu conexión y vuelve a intentarlo.'))",
  'food-checkout: mensaje humano');
rep(fc,
  `          {submitError ? (
            <View style={[s.errorBox, { backgroundColor: alpha(colors.danger, 0.08) }]}>`,
  `          {submitError ? (
            <View style={{ marginBottom: 12 }}>
              <InlineError mensaje={submitError} />`,
  'food-checkout: error en línea (apertura)');
rep(fc,
  `              </Text>
            </View>
          ) : null}`,
  `            </View>
          ) : null}`,
  'food-checkout: error en línea (cierre)');

// ── 4 · LazyImage con expo-image (caché en disco + fundido propio) ──────────────────────────────
const li = 'components/rental/LazyImage.tsx';
if (!fs.existsSync(path.join(APP, 'node_modules/expo-image'))) {
  console.log('  OJO: expo-image no está instalado; se salta LazyImage');
  fallos++;
} else {
  addImport(li, "import { Image as ExpoImage } from 'expo-image';");
  rep(li,
    `import { ActivityIndicator, Animated, Image, Pressable, StyleSheet, Text, View, type StyleProp, type`,
    `import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, type StyleProp, type`,
    'LazyImage: fuera el Image de React Native');
  rep(li,
    `        <Image
          source={{ uri: thumbUri }}
          style={StyleSheet.absoluteFill}
          resizeMode={resizeMode}
          onLoad={() => setThumbLoaded(true)}
        />`,
    `        <ExpoImage
          source={{ uri: thumbUri }}
          style={StyleSheet.absoluteFill}
          contentFit={resizeMode}
          cachePolicy="memory-disk"
          onLoad={() => setThumbLoaded(true)}
        />`,
    'LazyImage: miniatura con caché de expo-image');
  rep(li,
    `        resizeMode={resizeMode}
        onLoad={() => {
          setMainLoaded(true);
          setThumbLoaded(true);
        }}`,
    `        contentFit={resizeMode}
        cachePolicy="memory-disk"
        onLoad={() => {
          setMainLoaded(true);
          setThumbLoaded(true);
        }}`,
    'LazyImage: imagen principal con caché de disco');
}

console.log(fallos ? `\n${fallos} problema(s)` : '\nAdopción aplicada');
process.exit(fallos ? 1 : 0);
