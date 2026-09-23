/**
 * Fase 2 · 21 — El historial de VIAJES pasa a lista virtualizada (D-04/D-21).
 * Es la tercera de las siete. Se conserva el contador, el vacío y el aspecto de las tarjetas.
 * Uso: node pruebas/fase2-lista-viajes.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
const p = path.join(APP, 'app/trips-history.tsx');
let t = fs.readFileSync(p, 'utf8');
let fallos = 0;

// 1) apertura: ScrollView + contador + vacío + arranque del map → FlatList con cabeceras
const viejoApertura = `        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          <Text style={{ fontSize: 12.5, color: colors.textSecondary, fontWeight: '600', marginBottom: 6 }}>
            {asDriver ? 'Como CONDUCTOR' : 'Como PASAJERO'} · {trips.length} viaje{trips.length === 1 ? '' : 's'}
          </Text>
          {trips.length === 0 && (
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 40 }}>
              Todavía no tienes viajes registrados.{'\\n'}Cuando completes o canceles un taxi aparecerá aquí.
            </Text>
          )}
          {trips.map((t) => {
            const done = t.status === 'completed';
            return (
              <View key={t.id} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>`;

const nuevaApertura = `        {/*
          LISTA VIRTUALIZADA (auditoría de diseño, D-04/D-21): antes un ScrollView con .map(), que
          mantiene TODOS los viajes en memoria. Es el historial que más crece.
        */}
        <FlatList
          data={trips}
          keyExtractor={(t) => t.id}
          contentContainerStyle={s.content}
          showsVerticalScrollIndicator={false}
          initialNumToRender={10}
          windowSize={7}
          removeClippedSubviews
          ListHeaderComponent={
            <Text style={{ fontSize: 12.5, color: colors.textSecondary, fontWeight: '600', marginBottom: 6 }}>
              {asDriver ? 'Como CONDUCTOR' : 'Como PASAJERO'} · {trips.length} viaje{trips.length === 1 ? '' : 's'}
            </Text>
          }
          ListEmptyComponent={
            <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: 'center', marginTop: 40 }}>
              Todavía no tienes viajes registrados.{'\\n'}Cuando completes o canceles un taxi aparecerá aquí.
            </Text>
          }
          renderItem={({ item: t }) => {
            const done = t.status === 'completed';
            return (
              <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>`;

if (!t.includes(viejoApertura)) { console.log('  SIN ANCLA: apertura'); fallos++; }
else { t = t.replace(viejoApertura, nuevaApertura); console.log('  OK apertura (FlatList con cabeceras)'); }

// 2) cierre: el último `})}` antes de `</ScrollView>` → cierre de renderItem + FlatList
const iScroll = t.indexOf('</ScrollView>');
if (iScroll < 0) { console.log('  SIN ANCLA: </ScrollView>'); fallos++; }
else {
  const iCierre = t.lastIndexOf('})}', iScroll);
  if (iCierre < 0) { console.log('  SIN ANCLA: cierre del map'); fallos++; }
  else {
    t = t.slice(0, iCierre) + '}}\n        />' + t.slice(iScroll + '</ScrollView>'.length);
    console.log('  OK cierre (renderItem + FlatList)');
  }
}

// 3) FlatList al import; ScrollView fuera si ya no se usa
const imp = t.match(/import \{([^}]*)\} from 'react-native';/);
if (imp && !/FlatList/.test(imp[1])) {
  t = t.replace(imp[0], `import {${imp[1].replace(/\s*$/, '')}, FlatList } from 'react-native';`);
  console.log('  OK FlatList importado');
}
if (!/ScrollView/.test(t.replace(/import \{[^}]*\} from 'react-native';/, ''))) {
  t = t.replace(/, ScrollView/, '');
  console.log('  OK ScrollView fuera del import');
}

fs.writeFileSync(p, t, 'utf8');
console.log(fallos ? `\n${fallos} problema(s)` : '\nLista de viajes virtualizada');
process.exit(fallos ? 1 : 0);
