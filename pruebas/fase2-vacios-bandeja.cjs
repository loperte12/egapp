/**
 * Fase 2 · 23 — Difusión de `EmptyState` (D-17), tanda 3: la BANDEJA de Life Book.
 *
 * Es la tanda que el informe pedía por su peor ejemplo: `lifebook-inbox` decía **«Nada por aquí
 * todavía»** — sin decir qué es la pantalla, ni por qué está vacía, ni qué hacer. El informe lo cita
 * como el caso más claro de vacío sin salida, y seguía igual.
 *
 * Cuatro vacíos, en tres pantallas hermanas:
 *   · `lifebook-inbox.tsx`          — uno con TRES variantes (me gusta / seguidores / comentarios y @)
 *   · `lifebook-inbox-likes.tsx`    — uno con dos variantes
 *   · `lifebook-inbox-comments.tsx` — dos (comentarios y menciones)
 *
 * REGLA (la misma de la tanda 2): una pestaña donde el usuario **puede hacer algo** lleva salida; una
 * donde solo puede **esperar** no lleva botón inventado. Aquí «Me gusta · Guardados» es lo único que
 * el usuario provoca —sin publicar no hay nada que reaccionar— así que es el único con acción.
 *
 * `lifebook-inbox-followers.tsx` se revisó y **no se toca a propósito**: sus dos vacíos son de
 * SECCIÓN (van debajo de los títulos «TE HAN SEGUIDO» y «RECOMENDADOS PARA TI»), y `EmptyState`
 * exige título propio, así que adoptarlo duplicaría el encabezado. Mismo criterio que el vacío del
 * modal de repartidores en `food-orders`.
 *
 * Uso: node pruebas/fase2-vacios-bandeja.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
let fallos = 0;

const casos = [
  // ── 1) La bandeja: el peor ejemplo del informe ──────────────────────────────
  {
    archivo: 'app/lifebook-inbox.tsx',
    importViejo: "import { alpha, useTheme } from '@egrouteplan/ui-kit';",
    importNuevo: "import { alpha, useTheme, EmptyState } from '@egrouteplan/ui-kit';",
    viejo: [
      '          ListEmptyComponent={',
      '            <View style={{ alignItems: \'center\', marginTop: 70 }}>',
      "              {active === 'likes'",
      '                ? <Heart size={40} color={alpha(colors.textSecondary, 0.4)} />',
      "                : active === 'followers'",
      '                  ? <UserPlus size={40} color={alpha(colors.textSecondary, 0.4)} />',
      '                  : <AtSign size={40} color={alpha(colors.textSecondary, 0.4)} />}',
      '              <Text style={{ color: colors.textSecondary, marginTop: 12, fontSize: 14 }}>Nada por aquí todavía</Text>',
      '            </View>',
      '          }',
    ].join('\n'),
    nuevo: [
      '          ListEmptyComponent={',
      '            /*',
      '              Vacío con salida (D-17). Este era el PEOR ejemplo del informe: «Nada por aquí',
      '              todavía» no dice qué es esto, ni por qué está vacío, ni qué hacer. El margen de',
      '              arriba se conserva (36 + los 34 del propio componente ≈ los 70 de antes).',
      '            */',
      '            <View style={{ marginTop: 36 }}>',
      '              <EmptyState',
      "                icono={active === 'likes'",
      '                  ? <Heart size={40} color={colors.textSecondary} />',
      "                  : active === 'followers'",
      '                    ? <UserPlus size={40} color={colors.textSecondary} />',
      '                    : <AtSign size={40} color={colors.textSecondary} />}',
      "                titulo={active === 'likes'",
      "                  ? 'Todavía no tienes me gusta ni guardados'",
      "                  : active === 'followers'",
      "                    ? 'Todavía no tienes seguidores nuevos'",
      "                    : 'Todavía no te han mencionado'}",
      "                texto={active === 'likes'",
      "                  ? 'Cuando alguien reaccione a una publicación tuya o guarde algo tuyo, aparecerá aquí y podrás agradecerle por mensaje.'",
      "                  : active === 'followers'",
      "                    ? 'Aquí verás a quien empiece a seguirte, y podrás seguirle tú también.'",
      "                    : 'Cuando alguien te mencione con @ en un comentario, lo verás aquí.'}",
      "                accionLabel={active === 'likes' ? 'Crear una publicación' : undefined}",
      "                onAccion={active === 'likes' ? () => router.push('/lifebook-compose' as never) : undefined}",
      '              />',
      '            </View>',
      '          }',
    ].join('\n'),
  },

  // ── 2) Me gusta y guardados ────────────────────────────────────────────────
  {
    archivo: 'app/lifebook-inbox-likes.tsx',
    importViejo: "import { alpha, useTheme, brand } from '@egrouteplan/ui-kit';",
    importNuevo: "import { alpha, useTheme, brand, EmptyState } from '@egrouteplan/ui-kit';",
    viejo: [
      '          ListEmptyComponent={',
      '            <View style={{ alignItems: \'center\', paddingTop: 80, gap: 8 }}>',
      '              <Heart size={38} color={alpha(colors.primary, 0.45)} />',
      '              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: \'900\' }}>',
      "                {tab === 'likes' ? 'Todavía no tienes me gustas.' : 'Todavía no has guardado publicaciones.'}",
      '              </Text>',
      '              <Text style={{ color: colors.textSecondary, fontSize: 12.5, textAlign: \'center\', paddingHorizontal: 34, lineHeight: 18 }}>',
      "                {tab === 'likes'",
      "                  ? 'Cuando alguien reaccione a tus publicaciones lo verás aquí, y podrás agradecerle por mensaje.'",
      "                  : 'Lo que guardes aparecerá aquí.'}",
      '              </Text>',
      '            </View>',
      '          }',
    ].join('\n'),
    nuevo: [
      '          ListEmptyComponent={',
      '            <EmptyState',
      '              icono={<Heart size={38} color={alpha(colors.primary, 0.45)} />}',
      "              titulo={tab === 'likes' ? 'Todavía no tienes me gusta' : 'Todavía no has guardado publicaciones'}",
      "              texto={tab === 'likes'",
      "                ? 'Cuando alguien reaccione a tus publicaciones lo verás aquí, y podrás agradecerle por mensaje.'",
      "                : 'Lo que guardes aparecerá aquí, solo para ti.'}",
      '            />',
      '          }',
    ].join('\n'),
  },

  // ── 3) Comentarios ─────────────────────────────────────────────────────────
  {
    archivo: 'app/lifebook-inbox-comments.tsx',
    importViejo: "import { alpha, useTheme, brand } from '@egrouteplan/ui-kit';",
    importNuevo: "import { alpha, useTheme, brand, EmptyState } from '@egrouteplan/ui-kit';",
    viejo: [
      '          ListEmptyComponent={',
      '            <View style={{ alignItems: \'center\', paddingTop: 80, gap: 8 }}>',
      '              <MessageSquare size={38} color={alpha(colors.primary, 0.45)} />',
      '              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: \'900\' }}>Todavía no hay comentarios</Text>',
      '              <Text style={{ color: colors.textSecondary, fontSize: 12.5, textAlign: \'center\', paddingHorizontal: 34 }}>',
      '                Los comentarios de otras personas en tus publicaciones aparecerán aquí.',
      '              </Text>',
      '            </View>',
      '          }',
    ].join('\n'),
    nuevo: [
      '          ListEmptyComponent={',
      '            <EmptyState',
      '              icono={<MessageSquare size={38} color={alpha(colors.primary, 0.45)} />}',
      '              titulo="Todavía no hay comentarios"',
      '              texto="Los comentarios de otras personas en tus publicaciones aparecerán aquí, con la opción de responder por mensaje."',
      '            />',
      '          }',
    ].join('\n'),
  },

  // ── 4) Menciones ───────────────────────────────────────────────────────────
  {
    archivo: 'app/lifebook-inbox-comments.tsx',
    importViejo: "import { alpha, useTheme, brand } from '@egrouteplan/ui-kit';",
    importNuevo: "import { alpha, useTheme, brand, EmptyState } from '@egrouteplan/ui-kit';",
    viejo: [
      '          ListEmptyComponent={',
      '            <View style={{ alignItems: \'center\', paddingTop: 80, gap: 8 }}>',
      '              <AtSign size={38} color={alpha(colors.primary, 0.45)} />',
      '              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: \'900\' }}>Sin menciones</Text>',
      '              <Text style={{ color: colors.textSecondary, fontSize: 12.5, textAlign: \'center\', paddingHorizontal: 34 }}>',
      '                Cuando alguien te mencione con @ en un comentario, lo verás aquí.',
      '              </Text>',
      '            </View>',
      '          }',
    ].join('\n'),
    nuevo: [
      '          ListEmptyComponent={',
      '            <EmptyState',
      '              icono={<AtSign size={38} color={alpha(colors.primary, 0.45)} />}',
      '              titulo="Sin menciones"',
      '              texto="Cuando alguien te mencione con @ en un comentario o en una publicación, lo verás aquí."',
      '            />',
      '          }',
    ].join('\n'),
  },
];

for (const c of casos) {
  const p = path.join(APP, c.archivo);
  let t = fs.readFileSync(p, 'utf8');
  if (!t.includes(c.viejo)) { console.log(`  SIN ANCLA: vacío en ${c.archivo}`); fallos++; continue; }
  t = t.replace(c.viejo, c.nuevo);
  if (!t.includes(c.importNuevo)) {
    if (!t.includes(c.importViejo)) { console.log(`  SIN ANCLA: import en ${c.archivo}`); fallos++; continue; }
    t = t.replace(c.importViejo, c.importNuevo);
  }
  fs.writeFileSync(p, t, 'utf8');
  console.log(`  OK ${c.archivo}`);
}

console.log(fallos ? `\n${fallos} problema(s): revisar a mano` : '\nBandeja de Life Book: cuatro vacíos con salida');
process.exit(fallos ? 1 : 0);
