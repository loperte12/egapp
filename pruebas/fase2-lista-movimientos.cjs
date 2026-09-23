/**
 * Fase 2 · 21 — El historial de movimientos del monedero pasa a lista VIRTUALIZADA.
 *
 * QUÉ HABÍA: un `ScrollView` con `items.map(...)`. Un ScrollView pinta TODAS las filas de una vez y
 * las mantiene en memoria: con cientos de movimientos, la pantalla que el usuario abre para
 * comprobar que su dinero está donde debe se atasca (auditoría de diseño, D-04).
 *
 * QUÉ HACE: `FlatList`, que recicla las filas que salen de pantalla. Se conservan el aspecto (la
 * tarjeta con borde) y el botón «Cargar más»; y el vacío pasa a `ListEmptyComponent`.
 *
 * Uso: node pruebas/fase2-lista-movimientos.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/monedero-movimientos.tsx');
let t = fs.readFileSync(p, 'utf8');
let fallos = 0;

// 1) FlatList en el import de react-native
const imp = t.match(/^import \{([^}]*)\} from 'react-native';/m);
if (!imp) { console.log('  SIN ANCLA: import de react-native'); process.exit(1); }
if (!/\bFlatList\b/.test(imp[1])) {
  t = t.replace(imp[0], `import {${imp[1].replace(/\s*$/, '')}, FlatList } from 'react-native';`);
  console.log('  OK FlatList importado');
}

// 2) la lista
const viejo = `        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, paddingVertical: 4 }]}>
            {items.length === 0 ? (
              <EmptyState
                compacto
                titulo="Todavía no hay movimientos de este tipo"
                texto="Cuando recargues, pagues o recibas un reembolso, aparecerán aquí con su fecha."
                accionLabel="Recargar con un agente"
                onAccion={() => router.push('/monedero-recargar')}
              />
            ) : items.map((t) => {
              const { label, sign } = txLabel(t);
              return (
                <View key={t.id} style={[styles.txRow, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '700' }}>{label}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                      {new Date(t.createdAt).toLocaleString('es-GQ', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ color: sign === '+' ? brand.successPressed : colors.textPrimary, fontSize: 13.5, fontWeight: '900' }}>
                      {sign}{fmtXaf(Math.abs(Number(t.amount)))}
                    </Text>
                    <TxStatusChip status={t.status} />
                  </View>
                </View>
              );
            })}
          </View>
          {nextCursor && (
            <Tactil onPress={() => void cargarMas()} style={[styles.masBtn, { borderColor: colors.border }]} accessibilityRole="button">
              {cargandoMas
                ? <ActivityIndicator color={colors.primary} size="small" />
                : <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '800' }}>Cargar más</Text>}
            </Tactil>
          )}
        </ScrollView>`;

const nuevo = `        /*
          LISTA VIRTUALIZADA (auditoría de diseño, D-04): antes era un ScrollView con .map(), que
          pinta y mantiene TODAS las filas. Con cientos de movimientos eso atasca justo la pantalla
          donde el usuario comprueba que su dinero está bien.
        */
        <FlatList
          data={items}
          keyExtractor={(t) => t.id}
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, margin: 16, flexGrow: 0 }]}
          contentContainerStyle={{ paddingVertical: 4 }}
          // Recicla lo que sale de pantalla y no monte todo de golpe.
          initialNumToRender={12}
          windowSize={7}
          removeClippedSubviews
          renderItem={({ item: t }) => {
            const { label, sign } = txLabel(t);
            return (
              <View style={[styles.txRow, { borderBottomColor: colors.border }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '700' }}>{label}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 2 }}>
                    {new Date(t.createdAt).toLocaleString('es-GQ', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={{ color: sign === '+' ? brand.successPressed : colors.textPrimary, fontSize: 13.5, fontWeight: '900' }}>
                    {sign}{fmtXaf(Math.abs(Number(t.amount)))}
                  </Text>
                  <TxStatusChip status={t.status} />
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <EmptyState
              compacto
              titulo="Todavía no hay movimientos de este tipo"
              texto="Cuando recargues, pagues o recibas un reembolso, aparecerán aquí con su fecha."
              accionLabel="Recargar con un agente"
              onAccion={() => router.push('/monedero-recargar')}
            />
          }
          ListFooterComponent={
            nextCursor ? (
              <Tactil onPress={() => void cargarMas()} style={[styles.masBtn, { borderColor: colors.border }]} accessibilityRole="button">
                {cargandoMas
                  ? <ActivityIndicator color={colors.primary} size="small" />
                  : <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '800' }}>Cargar más</Text>}
              </Tactil>
            ) : null
          }
        />`;

if (!t.includes(viejo)) { console.log('  SIN ANCLA: el bloque de la lista'); fallos++; }
else { t = t.replace(viejo, nuevo); console.log('  OK la lista es ahora FlatList'); }

// 3) ScrollView deja de usarse en este archivo
if (!/ScrollView/.test(t.replace(/import \{[^}]*\} from 'react-native';/m, ''))) {
  t = t.replace(/, ScrollView/, '');
  console.log('  OK ScrollView fuera del import (ya no se usa)');
}

fs.writeFileSync(p, t, 'utf8');
console.log(fallos ? `\n${fallos} problema(s)` : '\nLista virtualizada');
process.exit(fallos ? 1 : 0);
