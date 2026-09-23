/**
 * Fase 2 · 23 — Los dos `EmptyState` DUPLICADOS dentro de la app (`food.tsx` y `ecomerse.tsx`).
 *
 * Es el caso más claro del problema que la auditoría llama «el coste de no tener un patrón»: el kit
 * hizo un `EmptyState`, y estos dos archivos **definían el suyo** con otra API
 * (`title` / `subtitle` / `emoji` / `action: { label, kind, onPress }`). O sea, tres formas de hacer
 * lo mismo en el mismo producto. Aquí se borran las dos locales y se usa la del kit.
 *
 * Para que la adopción no EMPEORE nada, el kit necesitaba dos cosas que estos vacíos ya hacían a mano
 * y que se le han añadido antes de migrar:
 *   · `sobreOscuro`  (ya estaba, de la tanda del feed de vídeo)
 *   · `accionPrimaria` — el botón relleno cuando la acción del vacío es LA acción de la pantalla
 *     («Registra tu restaurante», «Publicar mi primer producto»). Sin él, todo habría quedado con
 *     contorno y la acción principal habría perdido peso.
 *
 * `ecomerse.tsx` conserva su `s_empty.btnPrimary` porque **su rama de ERROR** aún lo usa: convertir
 * ese error a `InlineError` es la tanda siguiente (queda anotado, no a medias).
 *
 * Uso: node pruebas/fase2-vacios-duplicados.cjs
 */
const fs = require('fs');
const path = require('path');
const APP = path.resolve(__dirname, '..');
let fallos = 0;

// ── food.tsx ────────────────────────────────────────────────────────────────
{
  const p = path.join(APP, 'app/food.tsx');
  let t = fs.readFileSync(p, 'utf8');

  const A_USO = [
    '        ListEmptyComponent={',
    '          error ? (',
    '            <EmptyState title="Algo salió mal" subtitle={error} emoji="📡"',
    '              action={{ label: \'Reintentar\', kind: \'primary\', onPress: loadFirst }} />',
    '          ) : loading ? null : (',
    '            <EmptyState',
    '              emoji="🍽️"',
    '              title={hasFilters ? \'Sin resultados con estos filtros\' : \'Todavía no hay restaurantes\'}',
    '              subtitle={hasFilters',
    '                ? \'Prueba a quitar filtros o buscar en otra ciudad.\'',
    '                : \'Sé el primero en tu zona: identidad verificada y aprobación del administrador.\'}',
    '              action={hasFilters',
    '                ? { label: \'Quitar filtros\', kind: \'ghost\', onPress: () => { setCuisine(\'\'); setCity(\'\'); setQ(\'\'); } }',
    '                : { label: \'Registra tu restaurante\', kind: \'primary\', onPress: () => router.push(\'/food-owner\' as any) }}',
    '            />',
    '          )',
    '        }',
  ].join('\n');

  const A_DEF = [
    '',
    'function EmptyState({ title, subtitle, emoji, action }: {',
    '  title: string; subtitle: string; emoji: string;',
    '  action?: { label: string; kind: \'primary\' | \'ghost\'; onPress: () => void };',
    '}) {',
    '  const { colors } = useTheme();',
    '  return (',
    '    <View style={s_empty.wrap}>',
    '      <Text style={{ fontSize: 40, marginBottom: 10 }}>{emoji}</Text>',
    '      <Text style={[s_empty.title, { color: colors.textPrimary }]}>{title}</Text>',
    '      <Text style={[s_empty.sub, { color: colors.textSecondary }]}>{subtitle}</Text>',
    '      {action && (',
    '        <Pressable onPress={action.onPress} accessibilityRole="button" accessibilityLabel={action.label}',
    '          style={action.kind === \'primary\' ? s_empty.btnPrimary : s_empty.btnGhost}>',
    '          <Text style={action.kind === \'primary\' ? s_empty.btnPrimaryText : [s_empty.btnGhostText, { color: colors.primary }]}>',
    '            {action.label}',
    '          </Text>',
    '        </Pressable>',
    '      )}',
    '    </View>',
    '  );',
    '}',
    '',
  ].join('\n');

  if (!t.includes(A_USO)) { console.log('  SIN ANCLA: usos del vacío en food.tsx'); fallos++; }
  else if (!t.includes(A_DEF)) { console.log('  SIN ANCLA: definición local en food.tsx'); fallos++; }
  else {
    t = t.replace(A_USO, [
      '        ListEmptyComponent={',
      '          error ? (',
      '            <EmptyState',
      '              icono={<Text style={{ fontSize: 40 }}>📡</Text>}',
      '              titulo="Algo salió mal"',
      '              texto={error}',
      '              accionLabel="Reintentar"',
      '              onAccion={loadFirst}',
      '              accionPrimaria',
      '            />',
      '          ) : loading ? null : (',
      '            <EmptyState',
      '              icono={<Text style={{ fontSize: 40 }}>🍽️</Text>}',
      '              titulo={hasFilters ? \'Sin resultados con estos filtros\' : \'Todavía no hay restaurantes\'}',
      '              texto={hasFilters',
      '                ? \'Prueba a quitar filtros o buscar en otra ciudad.\'',
      '                : \'Sé el primero en tu zona: identidad verificada y aprobación del administrador.\'}',
      '              accionLabel={hasFilters ? \'Quitar filtros\' : \'Registra tu restaurante\'}',
      '              accionPrimaria={!hasFilters}',
      '              onAccion={hasFilters',
      '                ? () => { setCuisine(\'\'); setCity(\'\'); setQ(\'\'); }',
      '                : () => router.push(\'/food-owner\' as any)}',
      '            />',
      '          )',
      '        }',
    ].join('\n'));
    t = t.replace(A_DEF, '\n');
    console.log('  OK food.tsx: dos vacíos al kit y definición local retirada');
    fs.writeFileSync(p, t, 'utf8');
  }
}

// ── ecomerse.tsx ────────────────────────────────────────────────────────────
{
  const p = path.join(APP, 'app/ecomerse.tsx');
  let t = fs.readFileSync(p, 'utf8');

  const A_USO = [
    '            <EmptyState',
    '              hasFilters={!!categoryFilter || !!subcategoryFilter || !!cityFilter || !!query.trim()}',
    '              onClear={() => { setCategoryFilter(\'\'); setSubcategoryFilter(\'\'); setCityFilter(\'\'); setQuery(\'\'); }}',
    '              onSell={() => router.push(\'/ecomerse-seller\' as any)}',
    '            />',
  ].join('\n');

  const A_DEF = [
    'function EmptyState({ hasFilters, onClear, onSell }: { hasFilters: boolean; onClear: () => void; onSell: () => void }) {',
    '  const { colors } = useTheme();',
    '  return (',
    '    <View style={{ alignItems: \'center\', paddingTop: 48, paddingHorizontal: 32 }}>',
    '      <Text style={{ fontSize: 40, marginBottom: 10 }}>🛍️</Text>',
    '      <Text style={{ fontSize: 15, fontWeight: \'800\', color: colors.textPrimary }}>{hasFilters ? \'Sin resultados con estos filtros\' : \'Todavía no hay productos\'}</Text>',
    '      <Text style={{ fontSize: 12.5, color: colors.textSecondary, textAlign: \'center\', marginTop: 6, lineHeight: 18 }}>',
    '        {hasFilters ? \'Prueba a quitar filtros o buscar en otra ciudad.\' : \'Sé el primero en publicar: identidad verificada + aprobación del administrador.\'}',
    '      </Text>',
    '      {hasFilters ? (',
    '        <Pressable onPress={onClear} style={s_empty.btnGhost}>',
    '          <Text style={{ color: colors.primary, fontWeight: \'800\', fontSize: 13 }}>Quitar filtros</Text>',
    '        </Pressable>',
    '      ) : (',
    '        <Pressable onPress={onSell} style={s_empty.btnPrimary}>',
    '          <Text style={{ color: brand.white, fontWeight: \'800\', fontSize: 13 }}>Publicar mi primer producto</Text>',
    '        </Pressable>',
    '      )}',
    '    </View>',
    '  );',
    '}',
  ].join('\n');

  if (!t.includes(A_USO)) { console.log('  SIN ANCLA: uso del vacío en ecomerse.tsx'); fallos++; }
  else if (!t.includes(A_DEF)) { console.log('  SIN ANCLA: definición local en ecomerse.tsx'); fallos++; }
  else {
    t = t.replace(A_USO, [
      '            /* El vacío del kit. Antes este archivo definía el suyo: tres formas de hacer lo',
      '               mismo en el mismo producto. Las dos caras van en un solo objeto para no repetir',
      '               cinco veces la condición de «hay filtros». */',
      '            <EmptyState',
      '              icono={<Text style={{ fontSize: 40 }}>🛍️</Text>}',
      '              {...((!!categoryFilter || !!subcategoryFilter || !!cityFilter || !!query.trim())',
      '                ? {',
      '                    titulo: \'Sin resultados con estos filtros\',',
      '                    texto: \'Prueba a quitar filtros o buscar en otra ciudad.\',',
      '                    accionLabel: \'Quitar filtros\',',
      '                    onAccion: () => { setCategoryFilter(\'\'); setSubcategoryFilter(\'\'); setCityFilter(\'\'); setQuery(\'\'); },',
      '                  }',
      '                : {',
      '                    titulo: \'Todavía no hay productos\',',
      '                    texto: \'Sé el primero en publicar: identidad verificada + aprobación del administrador.\',',
      '                    accionLabel: \'Publicar mi primer producto\',',
      '                    accionPrimaria: true,',
      '                    onAccion: () => router.push(\'/ecomerse-seller\' as any),',
      '                  })}',
      '            />',
    ].join('\n'));
    t = t.replace(A_DEF, '');
    console.log('  OK ecomerse.tsx: vacío al kit y definición local retirada');
    fs.writeFileSync(p, t, 'utf8');
  }
}

console.log(fallos ? `\n${fallos} problema(s): revisar a mano` : '\nLos dos vacíos duplicados usan el del kit');
process.exit(fallos ? 1 : 0);
