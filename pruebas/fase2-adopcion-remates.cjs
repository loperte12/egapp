/**
 * Fase 2 · Remates de la adopción: `expo-image` (tipo de ajuste y componente animado) y el
 * error del checkout de comida, que tenía otro texto del que supuse.
 * Uso: node pruebas/fase2-adopcion-remates.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
let fallos = 0;

function rep(rel, from, to, label) {
  const p = path.join(APP, rel);
  const t = fs.readFileSync(p, 'utf8');
  if (!t.includes(from)) { console.log(`  SIN ANCLA: ${label}`); fallos++; return; }
  fs.writeFileSync(p, t.split(from).join(to), 'utf8');
  console.log(`  OK ${label}`);
}

// ── LazyImage: expo-image no acepta 'stretch' (se llama 'fill') y Animated.Image es de RN ──────
const LI = 'components/rental/LazyImage.tsx';
rep(LI,
  "import { Image as ExpoImage } from 'expo-image';",
  "import { Image as ExpoImage, type ImageContentFit } from 'expo-image';\n\n/** El `Animated.Image` de React Native no entiende `contentFit`: se envuelve el de expo-image. */\nconst ImagenAnimada = Animated.createAnimatedComponent(ExpoImage);",
  'LazyImage: import con tipo y componente animado');
rep(LI,
  "  resizeMode = 'cover',",
  "  resizeMode = 'cover',",
  'LazyImage: (sin cambio en la prop)');
rep(LI,
  '  const s = styles(colors);',
  `  const s = styles(colors);

  /**
   * expo-image llama «fill» a lo que React Native llama «stretch». Se traduce en un sitio para que
   * las pantallas que ya usaban LazyImage no tengan que cambiar nada.
   */
  const ajuste: ImageContentFit = resizeMode === 'stretch' ? 'fill' : resizeMode;`,
  'LazyImage: traducción de resizeMode a contentFit');
rep(LI, '          contentFit={resizeMode}', '          contentFit={ajuste}', 'LazyImage: miniatura usa el ajuste traducido');
rep(LI, `      <Animated.Image
        key={retryKey}`, `      <ImagenAnimada
        key={retryKey}`, 'LazyImage: la imagen principal usa el componente animado de expo-image');
rep(LI, '        contentFit={resizeMode}', '        contentFit={ajuste}', 'LazyImage: imagen principal usa el ajuste traducido');

// ── food-checkout: el mensaje real y su bloque de error ────────────────────────────────────────
const FC = 'app/food-checkout.tsx';
rep(FC,
  "setSubmitError(e instanceof Error ? e.message : 'No se pudo enviar el pedido. Revisa tu conexión e inténtalo de nuevo.');",
  "setSubmitError(mensajeDeError(e, 'No se pudo enviar el pedido. Revisa tu conexión e inténtalo de nuevo.'));",
  'food-checkout: mensaje humano');
rep(FC,
  `              {submitError ? (
                <View style={[s.errorBox, { backgroundColor: alpha(colors.danger, 0.08) }]}>
                  <Text style={{ color: colors.danger, fontSize: 13, fontWeight: '700', lineHeight: 16 }}>{submitError}</Text>
                </View>
              ) : null}`,
  `              {submitError ? (
                <View style={{ marginBottom: 12 }}>
                  {/* Error EN LA PANTALLA, no encima: el usuario no pierde lo que estaba haciendo. */}
                  <InlineError mensaje={submitError} />
                </View>
              ) : null}`,
  'food-checkout: error en línea');

console.log(fallos ? `\n${fallos} problema(s)` : '\nRemates aplicados');
process.exit(fallos ? 1 : 0);
