/**
 * Fase 2 · 21 — Los pedidos del mercado pasan a lista virtualizada (D-04/D-21). Cuarta de siete.
 * El error, los esqueletos de carga y el vacío pasan a las cabeceras de la lista; la tarjeta del
 * pedido, a `renderItem`. El cuerpo de la tarjeta no se toca.
 * Uso: node pruebas/fase2-lista-pedidos.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/ecomerse-orders.tsx');
let t = fs.readFileSync(p, 'utf8');
let fallos = 0;

const iScroll = t.indexOf('      <ScrollView');
const iMap = t.indexOf('        {orders.map((o) => {');
if (iScroll < 0 || iMap < 0) { console.log('  SIN ANCLA: apertura'); process.exit(1); }
const apertura = t.slice(iScroll, iMap + '        {orders.map((o) => {'.length);

const nueva = `      {/*
        LISTA VIRTUALIZADA (auditoría de diseño, D-04/D-21): antes un ScrollView con .map(), que
        pinta y mantiene TODOS los pedidos en memoria. Un vendedor con historial largo se quedaba
        con la pantalla atascada.
      */}
      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
        ListHeaderComponent={
          <>
            {error && (
              <View style={{ alignItems: 'center', paddingVertical: 40, paddingHorizontal: 32 }}>
                <Text style={{ fontSize: 36, marginBottom: 8 }}>📡</Text>
                <Text style={{ fontSize: 14, fontWeight: '800', color: colors.textPrimary }}>Algo salió mal</Text>
                <Text style={{ fontSize: 12.5, color: colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 18 }}>{error}</Text>
                <Pressable onPress={load} style={{ marginTop: 18, backgroundColor: colors.primary, paddingHorizontal: 20, paddingVertical: 11, borderRadius: 22 }}>
                  <Text style={{ color: brand.white, fontWeight: '800', fontSize: 13 }}>Reintentar</Text>
                </Pressable>
              </View>
            )}

            {!error && loading && orders.length === 0 && (
              <View style={{ gap: 12 }}>
                {[0, 1].map((i) => <View key={i} style={{ height: 140, borderRadius: 14, backgroundColor: colors.border, opacity: 0.5 }} />)}
              </View>
            )}
          </>
        }
        ListEmptyComponent={
          !error && !loading ? (
            <View style={{ alignItems: 'center', paddingTop: 48 }}>
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
            </View>
          ) : null
        }
        renderItem={({ item: o }) => {`;

t = t.slice(0, iScroll) + nueva + t.slice(iScroll + apertura.length);
console.log('  OK apertura (FlatList con cabeceras y renderItem)');

// cierre
const cola = `        })}
      </ScrollView>`;
if (!t.includes(cola)) { console.log('  SIN ANCLA: cierre'); fallos++; }
else {
  t = t.replace(cola, `        }}
      />`);
  console.log('  OK cierre (renderItem + FlatList)');
}

// imports: FlatList y RefreshControl ya vienen del mismo import de react-native
const imp = t.match(/import \{[\s\S]{0,200}?\} from 'react-native';/);
if (imp && !/FlatList/.test(imp[0])) {
  t = t.replace(imp[0], imp[0].replace('{', '{\n  FlatList,'));
  console.log('  OK FlatList importado');
}
if (!/ScrollView/.test(t.replace(/import \{[\s\S]{0,200}?\} from 'react-native';/, ''))) {
  t = t.replace(/\n\s*ScrollView,/, '');
  console.log('  OK ScrollView fuera del import');
}

fs.writeFileSync(p, t, 'utf8');
console.log(fallos ? `\n${fallos} problema(s)` : '\nPedidos virtualizados');
process.exit(fallos ? 1 : 0);
