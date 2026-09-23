/**
 * Fase 0 · 0.4 — anuncio multiplataforma para lectores de pantalla (D-48).
 *   1. El kit exporta `anunciar()`.
 *   2. El PinSheet lo usa (donde estaba la llamada que solo funcionaba en Android).
 *   3. Se limpian los imports que quedan sin uso.
 * Uso: node pruebas/fase0-anuncio-run.cjs
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

rep('packages/ui-kit/src/index.ts',
  "export { haptico, type TipoHaptico } from './feedback/hapticos';",
  "export { haptico, type TipoHaptico } from './feedback/hapticos';\nexport { anunciar } from './feedback/anuncios';",
  'el kit exporta anunciar()');

rep('packages/ui-kit/src/primitives/PinSheet.tsx',
  "import { haptico } from '../feedback/hapticos';",
  "import { haptico } from '../feedback/hapticos';\nimport { anunciar } from '../feedback/anuncios';",
  'PinSheet importa el anuncio del kit');

rep('packages/ui-kit/src/primitives/PinSheet.tsx',
  `  useEffect(() => {
    if (!error) return;
    if (Platform.OS === 'ios') AccessibilityInfo.announceForAccessibility(error);
    haptico('aviso');
  }, [error]);`,
  `  useEffect(() => {
    if (!error) return;
    // Antes esto solo se anunciaba en Android: en iOS el error del PIN no llegaba a nadie (D-48).
    anunciar(error);
    haptico('aviso');
  }, [error]);`,
  'el error del PIN se anuncia en las dos plataformas');

// imports que quedan sin uso tras el cambio
rep('packages/ui-kit/src/primitives/PinSheet.tsx',
  "import { AccessibilityInfo, ActivityIndicator, Modal, Platform, StyleSheet, Text, TextInput, View } from 'react-native';",
  "import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, View } from 'react-native';",
  'quito AccessibilityInfo y Platform del import');

// comprobación: ¿queda alguna referencia a Platform o AccessibilityInfo en el archivo?
const pin = fs.readFileSync(path.join(APP, 'packages/ui-kit/src/primitives/PinSheet.tsx'), 'utf8');
for (const palabra of ['Platform', 'AccessibilityInfo']) {
  if (pin.includes(palabra)) { console.log(`  OJO: sigue habiendo «${palabra}» en PinSheet`); fallos++; }
}

console.log(fallos ? `\n${fallos} problema(s)` : '\n0.4 aplicado');
process.exit(fallos ? 1 : 0);
