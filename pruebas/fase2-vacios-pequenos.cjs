/**
 * Fase 2 · 23 — Difusión de `EmptyState`: tres vacíos PEQUEÑOS del censo.
 *
 * Los tres se leen enteros y se pueden verificar sin ambigüedad:
 *   · `ecomerse-planes.tsx`   — «Todavía no tienes tienda» + su botón (ya tenía título, por qué y
 *                               salida: pasa al kit conservando la acción como PRIMARIA).
 *   · `food-menu.tsx`         — «Todavía no hay ítems en el menú» (título y por qué, sin acción: es
 *                               una ESPERA, la carta la publica el restaurante; no se inventa botón).
 *   · `alquiler-publicar.tsx` — «Aún no has publicado anuncios.»: una línea suelta dentro de un
 *                               fragmento, sin título ni por qué.
 *
 * Uso: node pruebas/fase2-vacios-pequenos.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
let fallos = 0;

const casos = [
  // ── 1) ecomerse-planes: sin tienda ─────────────────────────────────────────
  {
    archivo: 'app/ecomerse-planes.tsx',
    viejo: [
      "          <Text style={{ fontSize: 36, marginBottom: 8 }}>🏪</Text>",
      "          <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>Todavía no tienes tienda</Text>",
      "          <Text style={{ fontSize: 12.5, color: colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 18 }}>",
      '            Da de alta tu negocio (identidad verificada + aprobación del admin) para publicar y acceder a los planes.',
      '          </Text>',
      "          <Pressable onPress={() => router.push('/ecomerse-seller' as any)} style={{ marginTop: 18, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 22 }}>",
      "            <Text style={{ color: brand.white, fontWeight: '800', fontSize: 13 }}>Abrir mi tienda</Text>",
      '          </Pressable>',
    ].join('\n'),
    nuevo: [
      '          {/* Al kit. La acción se conserva y va PRIMARIA: es LA acción de esta pantalla. */}',
      '          <EmptyState',
      "            icono={<Text style={{ fontSize: 36 }}>🏪</Text>}",
      '            titulo="Todavía no tienes tienda"',
      '            texto="Da de alta tu negocio (identidad verificada + aprobación del admin) para publicar y acceder a los planes."',
      '            accionLabel="Abrir mi tienda"',
      '            accionPrimaria',
      "            onAccion={() => router.push('/ecomerse-seller' as any)}",
      '          />',
    ].join('\n'),
  },

  // ── 2) food-menu: carta vacía (espera, sin botón) ──────────────────────────
  {
    archivo: 'app/food-menu.tsx',
    viejo: [
      '              <View style={s_center.wrap}>',
      "                <Text style={{ fontSize: 40, marginBottom: 10 }}>🍽️</Text>",
      "                <Text style={[s_center.title, { color: colors.textPrimary }]}>Todavía no hay ítems en el menú</Text>",
      "                <Text style={[s_center.sub, { color: colors.textSecondary }]}>",
      '                  Los platos publicados y aprobados aparecerán aquí.',
      '                </Text>',
      '              </View>',
    ].join('\n'),
    nuevo: [
      '              /* Es una ESPERA: la carta la publica el restaurante. Se dice qué la llena y no',
      '                 se inventa un botón (regla de la tanda 2 del informe). */',
      '              <EmptyState',
      "                icono={<Text style={{ fontSize: 40 }}>🍽️</Text>}",
      '                titulo="Todavía no hay ítems en el menú"',
      '                texto="Los platos publicados y aprobados por el restaurante aparecerán aquí, con su precio."',
      '              />',
    ].join('\n'),
  },

  // ── 3) alquiler-publicar: mis anuncios ─────────────────────────────────────
  {
    archivo: 'app/alquiler-publicar.tsx',
    viejo: "              {mine.length === 0 && <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: 30 }}>Aún no has publicado anuncios.</Text>}",
    nuevo: [
      '              {mine.length === 0 && (',
      '                /* Vacío con salida (D-17) con el componente del kit, en su forma compacta:',
      '                   vive dentro de la pantalla de publicar, así que no compite con el formulario. */',
      '                <EmptyState',
      '                  compacto',
      "                  icono={<Text style={{ fontSize: 34 }}>📦</Text>}",
      '                  titulo="Aún no has publicado anuncios"',
      '                  texto="Cuando publiques uno aparecerá aquí, con su estado y sus visitas."',
      '                />',
      '              )}',
    ].join('\n'),
  },
];

for (const c of casos) {
  const p = path.join(APP, c.archivo);
  let t = fs.readFileSync(p, 'utf8');
  if (t.includes('<EmptyState')) { console.log(`  YA ESTABA: ${c.archivo}`); continue; }
  if (!t.includes(c.viejo)) { console.log(`  SIN ANCLA: ${c.archivo}`); fallos++; continue; }
  t = t.replace(c.viejo, c.nuevo);
  t = t.replace(/import \{([^}]*)\} from '@egrouteplan\/ui-kit';/, (m, dentro) => {
    const nombres = dentro.split(',').map((x) => x.trim()).filter(Boolean);
    if (!nombres.includes('EmptyState')) nombres.push('EmptyState');
    return `import { ${nombres.join(', ')} } from '@egrouteplan/ui-kit';`;
  });
  fs.writeFileSync(p, t, 'utf8');
  console.log(`  OK ${c.archivo}`);
}

console.log(fallos ? `\n${fallos} problema(s): revisar a mano` : '\nTres vacíos pequeños al kit');
process.exit(fallos ? 1 : 0);
