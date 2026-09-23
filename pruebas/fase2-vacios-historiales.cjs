/**
 * Fase 2 · 23 — Difusión de `EmptyState` (D-17) e `InlineError` (D-03), tanda 4:
 * los historiales de Life Book y los favoritos del mercado.
 *
 * Cuatro pantallas, cinco vacíos:
 *   · `lifebook-orders.tsx`      — «Aún no has comprado nada.» / «Aún no tienes ventas.» (dos caras)
 *   · `lifebook-guardados.tsx`   — ya tenía título, explicación y SALIDA («Ver el catálogo»): pasa al
 *                                  kit tal cual, sin cambiar la copia
 *   · `lifebook-vistos.tsx`      — hacía DOS trabajos con un solo bloque (ver abajo)
 *   · `ecomerse-favorites.tsx`   — tres pestañas, con emoji de icono
 *
 * EL CASO INTERESANTE ES `lifebook-vistos`: si fallaba la carga, el MISMO bloque decía «No se pudo
 * cargar» y ofrecía **«Ver el catálogo»**. Para un error, esa es la acción equivocada: el catálogo no
 * arregla que la petición haya fallado, y el usuario se queda sin forma de reintentar. Ahora son dos
 * cosas distintas y se ven distintas:
 *   · error  → `InlineError`, que se anuncia al lector de pantalla, vibra y **ofrece reintento**;
 *   · vacío  → `EmptyState`, con su salida al catálogo.
 *
 * Uso: node pruebas/fase2-vacios-historiales.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
let fallos = 0;

const casos = [
  // ── 1) Pedidos de publicaciones (comprar / vender) ─────────────────────────
  {
    archivo: 'app/lifebook-orders.tsx',
    importViejo: "import { alpha, useTheme, brand } from '@egrouteplan/ui-kit';",
    importNuevo: "import { alpha, useTheme, brand, EmptyState } from '@egrouteplan/ui-kit';",
    viejo: [
      '          ListEmptyComponent={',
      '            <View style={{ alignItems: \'center\', justifyContent: \'center\', paddingTop: 80, gap: 8 }}>',
      '              <PackageOpen size={42} color={alpha(colors.primary, 0.45)} />',
      '              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: \'900\' }}>',
      "                {side === 'buyer' ? 'Aún no has comprado nada.' : 'Aún no tienes ventas.'}",
      '              </Text>',
      '              <Text style={{ color: colors.textSecondary, fontSize: 12.5, textAlign: \'center\', paddingHorizontal: 40 }}>',
      "                {side === 'buyer' ? 'Cuando pidas un producto en el feed, aparecerá aquí.' : 'Cuando alguien pida tu producto, aparecerá aquí.'}",
      '              </Text>',
      '            </View>',
      '          }',
    ].join('\n'),
    nuevo: [
      '          ListEmptyComponent={',
      '            <EmptyState',
      '              icono={<PackageOpen size={42} color={alpha(colors.primary, 0.45)} />}',
      "              titulo={side === 'buyer' ? 'Aún no has comprado nada' : 'Aún no tienes ventas'}",
      "              texto={side === 'buyer'",
      "                ? 'Cuando pidas un producto del feed aparecerá aquí, con su estado y lo que puedes hacer.'",
      "                : 'Cuando alguien pida tu producto aparecerá aquí, con su estado y lo que puedes hacer.'}",
      '            />',
      '          }',
    ].join('\n'),
  },

  // ── 2) Guardados: ya estaba bien, pasa al kit sin tocar la copia ───────────
  {
    archivo: 'app/lifebook-guardados.tsx',
    importViejo: "import { alpha, GhostButton, useTheme } from '@egrouteplan/ui-kit';",
    importNuevo: "import { alpha, GhostButton, useTheme, EmptyState } from '@egrouteplan/ui-kit';",
    viejo: [
      '        {items.length === 0 ? (',
      '          <View style={{ alignItems: \'center\', gap: 10, paddingVertical: 30 }}>',
      '            <Heart size={34} color={colors.textSecondary} />',
      '            <Text style={{ color: colors.textPrimary, fontWeight: \'800\' }}>Todavía no has guardado nada</Text>',
      '            <Text style={{ color: colors.textSecondary, fontSize: 12.5, textAlign: \'center\' }}>',
      '              Lo que guardes con el corazón de un producto aparece aquí, sin tener que entrar en tu perfil.',
      '            </Text>',
      '            <View style={{ marginTop: 6 }}>',
      '              <GhostButton title="Ver el catálogo" onPress={() => router.push(\'/lifebook-catalog\' as never)} />',
      '            </View>',
      '          </View>',
      '        ) : (',
    ].join('\n'),
    nuevo: [
      '        {items.length === 0 ? (',
      '          /* Ya tenía título, explicación y salida: solo se pasa al kit (no se toca la copia). */',
      '          <EmptyState',
      '            icono={<Heart size={34} color={colors.textSecondary} />}',
      '            titulo="Todavía no has guardado nada"',
      '            texto="Lo que guardes con el corazón de un producto aparece aquí, sin tener que entrar en tu perfil."',
      '            accionLabel="Ver el catálogo"',
      "            onAccion={() => router.push('/lifebook-catalog' as never)}",
      '          />',
      '        ) : (',
    ].join('\n'),
  },

  // ── 3) Vistos: el error se separa del vacío ────────────────────────────────
  {
    archivo: 'app/lifebook-vistos.tsx',
    importViejo: "import { alpha, GhostButton, useTheme } from '@egrouteplan/ui-kit';",
    importNuevo: "import { alpha, useTheme, EmptyState, InlineError } from '@egrouteplan/ui-kit';",
    viejo: [
      '          ListEmptyComponent={',
      '            <View style={{ alignItems: \'center\', paddingTop: 50, gap: 10 }}>',
      '              <Clock size={38} color={alpha(colors.primary, 0.35)} />',
      '              <Text style={{ color: colors.textPrimary, fontWeight: \'800\' }}>',
      "                {error ? 'No se pudo cargar' : 'Todavía no has mirado nada'}",
      '              </Text>',
      '              <Text style={{ color: colors.textSecondary, fontSize: 12.5, textAlign: \'center\', paddingHorizontal: 40 }}>',
      "                {error ?? 'Cuando abras la ficha de un producto aparecerá aquí, para volver a él sin buscarlo otra vez.'}",
      '              </Text>',
      '              <GhostButton title="Ver el catálogo" onPress={() => irSeguro.libre(\'/lifebook-catalog\')} />',
      '            </View>',
      '          }',
    ].join('\n'),
    nuevo: [
      '          ListEmptyComponent={',
      '            /*',
      '              Aquí había UN bloque haciendo DOS trabajos: si fallaba la carga decía «No se pudo',
      '              cargar» y ofrecía «Ver el catálogo» — la acción equivocada, porque el catálogo no',
      '              arregla que la petición haya fallado y el usuario se quedaba sin reintentar. Ahora',
      '              el error va con `InlineError` (se anuncia, vibra y ofrece reintento) y el vacío con',
      '              `EmptyState`.',
      '            */',
      '            error ? (',
      '              <View style={{ paddingTop: 40, paddingHorizontal: 14 }}>',
      '                <InlineError mensaje={error} onReintentar={() => void cargar()} />',
      '              </View>',
      '            ) : (',
      '              <EmptyState',
      '                icono={<Clock size={38} color={alpha(colors.primary, 0.35)} />}',
      '                titulo="Todavía no has mirado nada"',
      '                texto="Cuando abras la ficha de un producto aparecerá aquí, para volver a él sin buscarlo otra vez."',
      '                accionLabel="Ver el catálogo"',
      "                onAccion={() => irSeguro.libre('/lifebook-catalog')}",
      '              />',
      '            )',
      '          }',
    ].join('\n'),
  },

  // ── 4) Favoritos del mercado (tres pestañas) ───────────────────────────────
  {
    archivo: 'app/ecomerse-favorites.tsx',
    importViejo: "import { useTheme, alpha } from '@egrouteplan/ui-kit';",
    importNuevo: "import { useTheme, alpha, EmptyState } from '@egrouteplan/ui-kit';",
    viejo: [
      '            <View style={{ alignItems: \'center\', paddingTop: 48 }}>',
      '              <Text style={{ fontSize: 36, marginBottom: 8 }}>{tab === \'bought\' ? \'🛒\' : tab === \'special\' ? \'⭐\' : \'💛\'}</Text>',
      '              <Text style={{ fontSize: 14, fontWeight: \'800\', color: colors.textPrimary }}>',
      "                {tab === 'bought' ? 'Todavía no has comprado nada' : tab === 'special' ? 'Sin productos especiales' : 'Sin productos aquí'}",
      '              </Text>',
      '              <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: \'center\', marginTop: 6, paddingHorizontal: 40 }}>',
      "                {tab === 'bought' ? 'Cuando compres en Ecomerse, los productos aparecerán en Comprados.' : 'Toca el ❤️ de un producto para guardarlo aquí.'}",
      '              </Text>',
      '            </View>',
    ].join('\n'),
    nuevo: [
      '            <EmptyState',
      '              icono={<Text style={{ fontSize: 36 }}>{tab === \'bought\' ? \'🛒\' : tab === \'special\' ? \'⭐\' : \'💛\'}</Text>}',
      "              titulo={tab === 'bought' ? 'Todavía no has comprado nada' : tab === 'special' ? 'Sin productos especiales' : 'Sin productos guardados'}",
      "              texto={tab === 'bought'",
      "                ? 'Cuando compres en Ecomerse, los productos aparecerán en Comprados.'",
      "                : tab === 'special'",
      "                  ? 'Aquí salen los productos que las tiendas marcan como especiales.'",
      "                  : 'Toca el ❤️ de un producto para guardarlo aquí.'}",
      '            />',
    ].join('\n'),
  },
];

for (const c of casos) {
  const p = path.join(APP, c.archivo);
  let t = fs.readFileSync(p, 'utf8');
  if (t.includes('<EmptyState')) { console.log(`  YA ESTABA: ${c.archivo}`); continue; }
  if (!t.includes(c.viejo)) { console.log(`  SIN ANCLA: vacío en ${c.archivo}`); fallos++; continue; }
  if (!t.includes(c.importViejo)) { console.log(`  SIN ANCLA: import en ${c.archivo}`); fallos++; continue; }
  t = t.replace(c.viejo, c.nuevo);
  t = t.replace(c.importViejo, c.importNuevo);
  fs.writeFileSync(p, t, 'utf8');
  console.log(`  OK ${c.archivo}`);
}

console.log(fallos ? `\n${fallos} problema(s): revisar a mano` : '\nHistoriales: cinco vacíos al kit (y el error de «vistos», separado)');
process.exit(fallos ? 1 : 0);
