/**
 * Fase 2 · Difusión de EmptyState (D-17/D-23) — tanda 1: los tres vacíos de las listas ya hechas.
 * Se sustituyen textos sueltos por el componente del kit, que añade ICONO, MOTIVO y ACCIÓN.
 * Uso: node pruebas/fase2-difundir-emptystate.cjs
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
  let src = t.split(from).join(to);
  if (!/import \{[^}]*\bEmptyState\b[^}]*\} from '@egrouteplan\/ui-kit'/.test(src)) {
    const m = src.match(/^import \{ ([^}]+) \} from '@egrouteplan\/ui-kit';/m);
    if (m) src = src.replace(m[0], `import { ${m[1]}, EmptyState } from '@egrouteplan/ui-kit';`);
    else {
      const ms = [...src.matchAll(/from\s+'[^']+';/g)];
      const last = ms[ms.length - 1];
      const end = last.index + last[0].length;
      const eol = src.indexOf('\n', end);
      const at = eol < 0 ? src.length : eol;
      src = src.slice(0, at) + "\nimport { EmptyState } from '@egrouteplan/ui-kit';" + src.slice(at);
    }
  }
  fs.writeFileSync(p, src, 'utf8');
  console.log(`  OK ${label}`);
}

// ── 1 · Mis tickets ────────────────────────────────────────────────────────────────────────────
rep('app/my-tickets.tsx',
  `            <View style={{ gap: 12, alignItems: 'center', paddingTop: 40 }}>
              <Ticket size={40} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontWeight: '700', textAlign: 'center' }}>
                No tienes tickets todavía.{'\\n'}Reserva un asiento en Ciudad a Ciudad para verlos aquí.
              </Text>
              <GhostButton title="Buscar viajes" onPress={() => router.push('/intercity' as any)} />
            </View>`,
  `            <EmptyState
              icono={<Ticket size={40} color={colors.textSecondary} />}
              titulo="Todavía no tienes tickets"
              texto="Cuando reserves un asiento en Ciudad a Ciudad, tu ticket aparecerá aquí con su código para enseñárselo al conductor."
              accionLabel="Buscar viajes"
              onAccion={() => router.push('/intercity' as any)}
            />`,
  'my-tickets: vacío con icono, motivo y acción');

// ── 2 · Pedidos del mercado ────────────────────────────────────────────────────────────────────
rep('app/ecomerse-orders.tsx',
  `            <View style={{ alignItems: 'center', paddingTop: 48 }}>
              <Text style={{ fontSize: 36, marginBottom: 8 }}>📦</Text>
              <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>
                {role === 'seller' ? 'Aún no tienes ventas' : 'Todavía no has comprado'}
              </Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary, textAlign: 'center', marginTop: 6, paddingHorizontal: 40 }}>
                {role === 'seller' ? 'Cuando alguien compre en tu tienda, aparecerá aquí.' : 'Explora el mercado y compra con garantía si pagas por la app.'}
              </Text>
              <Pressable onPress={() => router.push('/ecomerse' as any)} style={{ marginTop: 18, backgroundColor: brand.secondary, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 22 }}>
                <Text style={{ color: brand.white, fontWeight: '800', fontSize: 13 }}>Ir al mercado</Text>
              </Pressable>
            </View>`,
  `            <EmptyState
              icono={<Text style={{ fontSize: 34 }}>📦</Text>}
              titulo={role === 'seller' ? 'Aún no tienes ventas' : 'Todavía no has comprado'}
              texto={role === 'seller'
                ? 'Cuando alguien compre en tu tienda, el pedido aparecerá aquí con su entrega y su cobro.'
                : 'Explora el mercado: si pagas por la app, el dinero queda en garantía hasta que recibas.'}
              accionLabel={role === 'seller' ? 'Ver mis productos' : 'Ir al mercado'}
              onAccion={() => router.push('/ecomerse' as any)}
            />`,
  'ecomerse-orders: vacío con icono, motivo y acción');

// ── 3 · Historial de viajes ────────────────────────────────────────────────────────────────────
rep('app/trips-history.tsx',
  `            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 40 }}>
              Todavía no tienes viajes registrados.{'\\n'}Cuando completes o canceles un taxi aparecerá aquí.
            </Text>`,
  `            <EmptyState
              titulo="Todavía no tienes viajes"
              texto="Cuando completes o canceles un taxi, el viaje aparecerá aquí con su precio, el conductor y la fecha."
              accionLabel="Pedir un taxi"
              onAccion={() => router.push('/taxi' as never)}
            />`,
  'trips-history: vacío con motivo y salida');

console.log(fallos ? `\n${fallos} problema(s)` : '\nEmpytState difundido (tanda 1)');
process.exit(fallos ? 1 : 0);
