// egrouteplan-app/app/work.tsx
/**
 * WorkScreen — Buscar Work (bolsa de empleo). Vista BUSCADOR (SOLO UI).
 *
 * La lógica vive en `hooks/useWorkSearch` (estado, filtros server-side con
 * debounce, errores/carga, paginación visible) y el catálogo/constantes en
 * `constants/work.ts` + orden en `utils/workSort.ts`.
 *
 * Auditoría senior (2026-09-02, v3):
 *  · Filtros/búsqueda SERVER-SIDE; `visibleCount` se reinicia al cambiar
 *    filtros/búsqueda (no se hereda el scroll de otra búsqueda).
 *  · Experiencia y bandas salariales como CONSTANTES (EXPERIENCE_LEVELS,
 *    SALARY_BANDS) con rangos correctos (sin banda = sin filtro).
 *  · a11y en chips/switch/FAB/back/cargar-más; errores y carga visibles.
 *  · Layout: FAB y modal con safe-area (insets) — sin solapamientos.
 * Ruta: /work
 */

import React, { useEffect, useMemo } from 'react';
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Plus, Crown, SlidersHorizontal, Check, X } from 'lucide-react-native';
import { espaciado, GhostButton, PrimaryButton, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { useWorkSearch } from '../hooks/useWorkSearch';
import { sortJobs } from '../utils/workSort';
import { getTimeAgo } from '../utils/formatHelpers';
import {
  CATEGORIES, CATEGORY_LABELS, CITIES, CITY_LABELS, CONTRACTS, CONTRACT_LABELS,
  BENEFITS, BENEFIT_LABELS, SALARY_BANDS, EXPERIENCE_LEVELS, PAGE_SIZE,
} from '../constants/work';
import { WorkJobCard, WorkSearchBar, WorkSortBar, WorkResultCount, WorkEmptyState, WorkSafetyNotice } from '../components/jobs';
import { authApi } from '../api/auth';
import { workCategoryOf } from '../constants/professions';
import { brand } from '@egrouteplan/ui-kit';

export default function WorkScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const {
    jobs, loading, error, refreshing, query, setQuery, sortBy, setSortBy,
    filters, activeCount, hasAny, chips,
    toggle, setSalaryBand, setExperience, setVerified, setUrgent, clearFilters, refresh, retry,
    visibleCount, loadMore, loadedAt,
  } = useWorkSearch();

  const [filterVisible, setFilterVisible] = React.useState(false);

  // P8 — Profesión del perfil → preselecciona la categoría de Buscar Work.
  useEffect(() => {
    let alive = true;
    authApi.me()
      .then((p) => {
        if (!alive || !p?.profession) return;
        const cat = workCategoryOf(p.profession);
        if (cat) toggle('categories', cat);
      })
      .catch(() => {});
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sorted = useMemo(() => sortJobs(jobs, sortBy), [jobs, sortBy]);
  const shown = sorted.slice(0, visibleCount);

  const chip = (label: string, selected: boolean, onPress: () => void) => (
    <Pressable key={label} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}
      accessibilityLabel={label} accessibilityHint={selected ? 'Toca para quitar' : 'Toca para elegir'}
      style={[s_chip.base, { backgroundColor: selected ? colors.primary : colors.surface, borderColor: selected ? colors.primary : colors.border }]}>
      <Text style={{ fontSize: tipografia.caption, color: selected ? brand.white : colors.textPrimary, fontWeight: selected ? '700' : '500' }}>{label}</Text>
      {selected && <Check size={12} color={brand.white} style={{ marginLeft: espaciado.e4 }} />}
    </Pressable>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver"
          accessibilityHint="Vuelve a la pantalla anterior">
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 17, fontWeight: '800', color: colors.textPrimary }}>Empleos en Guinea Ecuatorial</Text>
          <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>
            {loading ? 'Cargando…' : `${jobs.length} ofertas${loadedAt ? ` · ${getTimeAgo(loadedAt.toISOString())}` : ''}`}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e12 }}>
          <Pressable onPress={() => router.push('/work-planes' as any)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Mejorar plan">
            <Crown size={20} color={colors.primary} />
          </Pressable>
          <Pressable onPress={() => router.push('/work-publish' as any)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Publicar oferta">
            <Plus size={22} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      <WorkSearchBar value={query} onChange={setQuery} />
      <WorkSortBar value={sortBy} onChange={setSortBy} />
      <WorkSafetyNotice />

      {/* Filtros activos */}
      {chips.length > 0 && (
        <View style={{ paddingHorizontal: espaciado.e16, paddingBottom: espaciado.e6 }}>
          <Text style={{ fontSize: tipografia.micro, fontWeight: '700', color: colors.primary, marginBottom: espaciado.e6 }}>Filtros activos ({chips.length})</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {chips.map((c, i) => (
              <Pressable key={`${c.label}-${i}`} onPress={c.remove} accessibilityRole="button" accessibilityLabel={`Quitar filtro ${c.label}`}
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e5, borderRadius: 14, borderWidth: 1, borderColor: colors.primary, marginRight: espaciado.e6 }}>
                <Text style={{ fontSize: tipografia.micro, color: colors.primary, fontWeight: '600' }}>{c.label}</Text>
                <X size={12} color={colors.primary} style={{ marginLeft: espaciado.e4 }} />
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={shown}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <WorkJobCard job={item} onPress={() => router.push({ pathname: '/work-detail', params: { id: item.id } } as any)} />}
        ListHeaderComponent={!loading && shown.length > 0 ? <WorkResultCount count={shown.length} query={query.trim().toLowerCase()} /> : null}
        ListEmptyComponent={
          loading ? (
            <View style={{ padding: espaciado.e16, gap: espaciado.e10, marginTop: espaciado.e8 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ height: 96, borderRadius: radios.md, backgroundColor: colors.border, width: i === 1 ? '92%' : '100%' }} />
              ))}
            </View>
          ) : error ? (
            <View style={{ alignItems: 'center', paddingTop: 40, paddingHorizontal: espaciado.e32 }}>
              <Text style={{ fontSize: 38, marginBottom: espaciado.e8 }}>📡</Text>
              <Text style={{ fontSize: tipografia.body, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' }}>Algo salió mal</Text>
              <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, textAlign: 'center', marginTop: espaciado.e6, lineHeight: 18 }}>{error}</Text>
              <Pressable onPress={retry} accessibilityRole="button" accessibilityLabel="Reintentar" style={styles.retryBtn}>
                <Text style={{ color: brand.white, fontWeight: '800', fontSize: tipografia.body }}>Reintentar</Text>
              </Pressable>
            </View>
          ) : (
            <WorkEmptyState
              title={hasAny ? 'Sin resultados con estos filtros' : 'Aún no hay ofertas publicadas'}
              subtitle={hasAny ? 'Prueba a ampliar el rango, cambiar la ciudad o quitar filtros.' : 'Vuelve más tarde; publicamos nuevas ofertas cada día.'}
              actionLabel={activeCount ? 'Limpiar filtros' : undefined}
              onAction={activeCount ? clearFilters : undefined}
            />
          )
        }
        ListFooterComponent={
          !loading && !error && shown.length > 0 && visibleCount < sorted.length ? (
            <Pressable onPress={loadMore} accessibilityRole="button" accessibilityLabel="Cargar más ofertas"
              style={{ paddingVertical: espaciado.e14, marginHorizontal: espaciado.e16, marginTop: espaciado.e8, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center' }}>
              <Text style={{ fontSize: tipografia.caption, color: colors.primary, fontWeight: '700' }}>Cargar más ofertas</Text>
            </Pressable>
          ) : !loading && !error && sorted.length > PAGE_SIZE && visibleCount >= sorted.length ? (
            <Text style={{ textAlign: 'center', fontSize: tipografia.micro, color: colors.textSecondary, paddingVertical: espaciado.e18 }}>Has visto todas las ofertas 🎉</Text>
          ) : null
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        contentContainerStyle={{ paddingBottom: 110 + insets.bottom, flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      />

      {/* FAB filtros (sobre la safe-area inferior, sin tapar el último ítem) */}
      <Pressable onPress={() => setFilterVisible(true)} accessibilityRole="button" accessibilityLabel="Abrir filtros" accessibilityHint="Filtros de categoría, ciudad, salario y más"
        style={[styles.filterFab, { backgroundColor: colors.primary, bottom: insets.bottom + 16 }]}>
        <SlidersHorizontal size={18} color={brand.white} />
        {activeCount > 0 && (
          <View style={styles.filterBadge}><Text style={{ color: brand.white, fontSize: 10, fontWeight: '800' }}>{activeCount}</Text></View>
        )}
      </Pressable>

      {/* Modal de filtros (safe-area inferior) */}
      <Modal visible={filterVisible} transparent animationType="slide" onRequestClose={() => setFilterVisible(false)}>
        <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', paddingBottom: insets.bottom + 12 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: 'center', marginTop: espaciado.e8, marginBottom: espaciado.e12 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: espaciado.e16, paddingBottom: espaciado.e12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Pressable onPress={() => setFilterVisible(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar filtros"><X size={22} color={colors.textPrimary} /></Pressable>
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.textPrimary }}>Filtros avanzados</Text>
              <View style={{ minWidth: 22 }}>{activeCount > 0 && <View style={styles.filterBadge}><Text style={{ color: brand.white, fontSize: tipografia.micro, fontWeight: '700' }}>{activeCount}</Text></View>}</View>
            </View>
            <ScrollView style={{ maxHeight: '76%' }} showsVerticalScrollIndicator={false}>
              <Section title="Categoría profesional" subtitle="Selecciona uno o varios sectores">{CATEGORIES.map((id) => chip(CATEGORY_LABELS[id], filters.categories.includes(id), () => toggle('categories', id)))}</Section>
              <Section title="Ciudad / Región" subtitle="Región Continental e Insular">{CITIES.map((id) => chip(CITY_LABELS[id], filters.cities.includes(id), () => toggle('cities', id)))}</Section>
              <Section title="Tipo de contrato">{CONTRACTS.map((id) => chip(CONTRACT_LABELS[id], filters.contractTypes.includes(id), () => toggle('contractTypes', id)))}</Section>
              <Section title="Salario (XAF/mes)">
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {SALARY_BANDS.map(([lo, hi]) => {
                    const active = !!filters.salaryBand && filters.salaryBand[0] === lo && filters.salaryBand[1] === hi;
                    return (
                      <Pressable key={`${lo}-${hi}`} onPress={() => setSalaryBand(active ? null : [lo, hi])} accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        style={[s_chip.base, { backgroundColor: active ? colors.primary : colors.surface, borderColor: active ? colors.primary : colors.border }]}>
                        <Text style={{ fontSize: tipografia.caption, color: active ? brand.white : colors.textPrimary, fontWeight: '600' }}>{lo.toLocaleString('es')} – {hi.toLocaleString('es')}</Text>
                      </Pressable>
                    );
                  })}
                  <Pressable onPress={() => setSalaryBand(null)} accessibilityRole="button" accessibilityState={{ selected: !filters.salaryBand }}
                    style={[s_chip.base, { backgroundColor: !filters.salaryBand ? colors.primary : colors.surface, borderColor: colors.border }]}>
                    <Text style={{ fontSize: tipografia.caption, color: !filters.salaryBand ? brand.white : colors.textPrimary, fontWeight: '600' }}>Todos</Text>
                  </Pressable>
                </View>
              </Section>
              <Section title="Experiencia mínima">
                {EXPERIENCE_LEVELS.map(([v, l]) => chip(l, filters.experience === v, () => setExperience(v)))}
              </Section>
              <Section title="Beneficios incluidos">{BENEFITS.map((id) => chip(BENEFIT_LABELS[id], filters.benefits.includes(id), () => toggle('benefits', id)))}</Section>
              <Section title="Preferencias">
                <ToggleRow label="Solo empresas verificadas" sub="Empresas con identidad confirmada" value={filters.isVerifiedOnly} onChange={(v) => setVerified(v)} />
                <ToggleRow label="Solo ofertas urgentes" sub="Contratación inmediata" value={filters.isUrgentOnly} onChange={(v) => setUrgent(v)} />
              </Section>
            </ScrollView>
            <View style={{ flexDirection: 'row', paddingHorizontal: espaciado.e16, paddingTop: espaciado.e12, gap: espaciado.e10 }}>
              <GhostButton title="Limpiar" onPress={clearFilters} />
              <View style={{ flex: 1 }}><PrimaryButton title="Ver resultados" onPress={() => setFilterVisible(false)} /></View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
      <Text style={{ fontSize: tipografia.body, fontWeight: '700', color: colors.textPrimary }}>{title}</Text>
      {subtitle && <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2 }}>{subtitle}</Text>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: espaciado.e10 }}>{children}</View>
    </View>
  );
}

function ToggleRow({ label, sub, value, onChange }: { label: string; sub: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: espaciado.e10, borderBottomWidth: 1, borderBottomColor: colors.surface }}>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: tipografia.body, fontWeight: '600', color: colors.textPrimary }}>{label}</Text>
        <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2 }}>{sub}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ false: colors.border, true: colors.primary }} thumbColor={brand.white} accessibilityLabel={label} />
    </View>
  );
}

const s_chip = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, borderRadius: 20, marginRight: espaciado.e8, marginBottom: espaciado.e8, borderWidth: 1 },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e8 },
  filterFab: { position: 'absolute', right: 16, width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', elevation: 6 },
  filterBadge: { position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: brand.danger, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e4 },
  retryBtn: { marginTop: espaciado.e18, backgroundColor: brand.secondary, paddingHorizontal: espaciado.e24, paddingVertical: espaciado.e11, borderRadius: 22 },
});
