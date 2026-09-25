/**
 * AlquilerScreen — Buscar Alquiler. Vista BUSCADOR v2.
 * Auditoría aplicada:
 *  · Error de red ≠ "no hay anuncios": estado de error dedicado con Reintentar
 *    y banner no intrusivo si hay datos previos y el refresco falla.
 *  · Modal de filtros con BORRADOR local: "Aplicar"/"Cancelar" de verdad
 *    (los chips no aplican en vivo) y "Limpiar" sobre el borrador.
 *  · SafeArea (insets.top/bottom), a11y completa (role/label/state),
 *    chips de filtro extraídos con key estable, chips activos para
 *    rentalType y minVerificationLevel, colores del tema en el aviso.
 *  · Catálogo en carga → spinner dentro del modal. Filtrado client-side
 *    (migración server-side anotada como mejora futura >200 anuncios).
 * Ruta: /alquiler
 */

import React, { useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, SlidersHorizontal, Check, X, ShieldAlert, MapPin, RefreshCw, WifiOff } from 'lucide-react-native';
import { alpha, brand, espaciado, GhostButton, PrimaryButton, radios, ScreenHeader, Tactil, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { PropertyCard } from '../components/rental/PropertyCard';
import { usePropertySearch } from '../hooks/rental/usePropertySearch';
import type { SortOrder } from '../hooks/rental/usePropertyFilters';
import { DEFAULT_FILTERS, type PropertyFilters } from '../utils/propertyFilters';

const SORT_LABELS: Record<SortOrder, string> = { relevance: 'Relevancia', price_asc: 'Menor precio', price_desc: 'Mayor precio', newest: 'Más recientes', biggest: 'Más grandes' };
type RentalTypeId = NonNullable<PropertyFilters['rentalType']>;
const asRentalType = (id: string) => id as RentalTypeId;

export default function AlquilerScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const {
    catalog, loading, error,
    query, setQuery, filters, setFilters, toggle, reset, activeCount,
    sortBy, setSortBy, filtered, visibleCount, loadMore,
    onRefresh, refreshing, reload, properties,
  } = usePropertySearch();

  const [filterVisible, setFilterVisible] = useState(false);
  const [draft, setDraft] = useState<PropertyFilters | null>(null);

  const s = styles(colors);
  const cityLabel = (id: string) => catalog?.cities.find((c) => c.id === id)?.label ?? id;
  const typeLabel = (id: string) => catalog?.propertyTypes.find((x) => x.id === id)?.label ?? id;
  const serviceLabel = (id: string) => catalog?.essentialServices.find((x) => x.id === id)?.label ?? id;
  const rentalTypeLabel = (id: string) => catalog?.rentalTypes.find((x) => x.id === id)?.label ?? id;

  /** Abre el modal copiando el estado aplicado como borrador. */
  const openFilters = () => {
    setDraft({ ...filters });
    setFilterVisible(true);
  };
  const applyDraft = () => {
    if (draft) setFilters(draft);
    setFilterVisible(false);
  };
  const cancelDraft = () => { setDraft(null); setFilterVisible(false); };
  const clearDraft = () => setDraft({ ...DEFAULT_FILTERS });

  const toggleDraft = (field: 'neighborhoods' | 'types' | 'essentialServices', id: string) =>
    setDraft((d) => (d ? { ...d, [field]: d[field].includes(id) ? d[field].filter((x) => x !== id) : [...d[field], id] } : d));

  const anyResult = filtered.length > 0;
  const hasSearchOrFilters = activeCount > 0 || query.trim().length > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {/* Cabecera del kit desde el 24/09/2026 (unificación de las 21 cabeceras).
          `lineasTitulo={2}` porque «Alquileres en Guinea Ecuatorial» son 31 caracteres y el ancho
          útil del título es 280 dp (~22,9 caracteres a `subCabecera`): en una línea se corta. */}
      <ScreenHeader
        titulo="Alquileres en Guinea Ecuatorial"
        subtitulo={`${filtered.length} anuncios`}
        alVolver={() => router.back()}
        lineasTitulo={2}
        accion={
          <Tactil onPress={() => router.push('/alquiler-publicar' as never)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Publicar propiedad">
            <Plus size={22} color={colors.primary} />
          </Tactil>
        }
      />

      {/* Buscador + botón filtros */}
      <View style={{ paddingHorizontal: espaciado.e16, gap: espaciado.e8, marginBottom: espaciado.e6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 10, paddingHorizontal: espaciado.e12, borderWidth: 1, borderColor: colors.border }}>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Buscar por título, barrio o dirección…"
              placeholderTextColor={colors.textSecondary}
              accessibilityLabel="Buscar alquileres"
              style={{ flex: 1, paddingVertical: espaciado.e10, fontSize: tipografia.body, color: colors.textPrimary }}
            />
          </View>
          <Pressable
            onPress={openFilters}
            accessibilityRole="button"
            accessibilityLabel={activeCount ? `Filtros aplicados (${activeCount})` : 'Abrir filtros'}
            accessibilityState={{ selected: activeCount > 0 }}
            style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e5, backgroundColor: activeCount ? colors.primary : colors.surface, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10, borderRadius: 10, borderWidth: 1, borderColor: activeCount ? colors.primary : colors.border, opacity: pressed ? 0.85 : 1 }]}
          >
            <SlidersHorizontal size={15} color={activeCount ? brand.white : colors.textPrimary} />
            {activeCount > 0 && <Text style={{ fontSize: tipografia.caption, fontWeight: '700', color: brand.white }}>{activeCount}</Text>}
          </Pressable>
        </View>
        {/* Orden */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espaciado.e6 }} accessibilityLabel="Ordenar resultados">
          {Object.entries(SORT_LABELS).map(([k, label]) => (
            <Pressable
              key={k}
              onPress={() => setSortBy(k as SortOrder)}
              accessibilityRole="button"
              accessibilityLabel={`Ordenar por ${label}`}
              accessibilityState={{ selected: sortBy === k }}
              style={({ pressed }) => [{ paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e6, borderRadius: radios.lg, backgroundColor: sortBy === k ? colors.primary : colors.surface, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={{ fontSize: tipografia.caption, fontWeight: '700', color: sortBy === k ? brand.white : colors.textSecondary }}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* Aviso anti-estafa (tokens del tema) */}
      <View style={{ marginHorizontal: espaciado.e16, marginBottom: espaciado.e8, flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, backgroundColor: alpha(colors.danger, 0.08), paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10, borderRadius: 10 }}>
        <ShieldAlert size={16} color={colors.danger} />
        <Text style={{ flex: 1, fontSize: tipografia.caption, color: colors.danger, fontWeight: peso.medio, lineHeight: 16 }}>
          No pagues por adelantado ni envíes DNI antes de ver el inmueble. Denuncia anuncios sospechosos.
        </Text>
      </View>

      {/* Banner de datos desactualizados (refresco fallido con datos previos) */}
      {!loading && error && anyResult && (
        <View style={{ marginHorizontal: espaciado.e16, marginBottom: espaciado.e8, flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, backgroundColor: alpha(colors.danger, 0.07), paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8, borderRadius: 10 }}>
          <WifiOff size={14} color={colors.danger} />
          <Text style={{ flex: 1, fontSize: tipografia.micro, color: colors.danger, fontWeight: peso.medio }}>No se pudo actualizar: mostrando datos anteriores.</Text>
          <Pressable onPress={() => void reload()} accessibilityRole="button" accessibilityLabel="Reintentar actualizar" hitSlop={8}>
            <Text style={{ fontSize: tipografia.micro, color: colors.danger, fontWeight: '800' }}>Reintentar</Text>
          </Pressable>
        </View>
      )}

      {/* Chips de filtros activos */}
      {activeCount > 0 && (
        <View style={{ paddingHorizontal: espaciado.e16, paddingBottom: espaciado.e6 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {filters.cityId ? <ActiveChip label={`📍 ${cityLabel(filters.cityId)}`} onRemove={() => setFilters((f) => ({ ...f, cityId: undefined }))} /> : null}
            {filters.rentalType ? <ActiveChip label={rentalTypeLabel(filters.rentalType)} onRemove={() => setFilters((f) => ({ ...f, rentalType: undefined }))} /> : null}
            {filters.neighborhoods.map((n) => <ActiveChip key={n} label={n} onRemove={() => toggle('neighborhoods', n)} />)}
            {filters.types.map((t) => <ActiveChip key={t} label={typeLabel(t)} onRemove={() => toggle('types', t)} />)}
            {filters.essentialServices.map((e) => <ActiveChip key={e} label={serviceLabel(e)} onRemove={() => toggle('essentialServices', e)} />)}
            {filters.isSocialHousingOnly ? <ActiveChip label="Vivienda social" onRemove={() => setFilters((f) => ({ ...f, isSocialHousingOnly: false }))} /> : null}
            {filters.hasTerrace ? <ActiveChip label="Con terraza" onRemove={() => setFilters((f) => ({ ...f, hasTerrace: false }))} /> : null}
            {filters.isLand ? <ActiveChip label="Terrenos" onRemove={() => setFilters((f) => ({ ...f, isLand: false, landUse: [] }))} /> : null}
            {(filters.minVerificationLevel ?? 0) >= 2 ? <ActiveChip label="Solo verificados" onRemove={() => setFilters((f) => ({ ...f, minVerificationLevel: undefined }))} /> : null}
          </ScrollView>
        </View>
      )}

      <FlatList
        data={filtered.slice(0, visibleCount)}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingHorizontal: espaciado.e16, paddingBottom: insets.bottom + 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
        renderItem={({ item }) => (
          <PropertyCard
            property={item}
            onPress={() => router.push({ pathname: '/alquiler-detalle', params: { id: item.id } } as never)}
            onViewLandlord={(l) => router.push({ pathname: '/landlord-profile', params: { landlordId: l.id ?? '' } } as never)}
          />
        )}
        ListEmptyComponent={
          loading && properties.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 60 }}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={{ marginTop: espaciado.e12, color: colors.textSecondary, fontWeight: '700' }}>Cargando alquileres…</Text>
            </View>
          ) : !loading && error && properties.length === 0 ? (
            <View style={{ alignItems: 'center', marginTop: 50, paddingHorizontal: espaciado.e30 }}>
              <View style={[s.errIcon, { backgroundColor: alpha(colors.danger, 0.1) }]}><WifiOff size={28} color={colors.danger} /></View>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' }}>No pudimos cargar los alquileres</Text>
              <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, textAlign: 'center', marginTop: espaciado.e6, marginBottom: espaciado.e14 }}>{error}</Text>
              <Pressable
                onPress={() => void reload()}
                accessibilityRole="button" accessibilityLabel="Reintentar cargar alquileres"
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e10, borderRadius: 10, backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
              >
                <RefreshCw size={15} color={brand.white} /><Text style={{ color: brand.white, fontWeight: '800', fontSize: tipografia.body, marginLeft: espaciado.e6 }}>Reintentar</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ alignItems: 'center', marginTop: 50, paddingHorizontal: espaciado.e30 }}>
              <View style={[s.errIcon, { backgroundColor: colors.surface }]}><MapPin size={30} color={colors.textSecondary} /></View>
              <Text style={{ fontSize: 15, fontWeight: '800', color: colors.textPrimary, textAlign: 'center' }}>
                {hasSearchOrFilters ? 'Sin resultados con estos filtros' : 'Aún no hay alquileres publicados'}
              </Text>
              <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, textAlign: 'center', marginTop: espaciado.e6, lineHeight: 18 }}>
                {hasSearchOrFilters ? 'Prueba a quitar filtros o cambiar la búsqueda.' : 'Vuelve más tarde; publicamos nuevos anuncios cada día.'}
              </Text>
              {hasSearchOrFilters && <View style={{ marginTop: espaciado.e14 }}><GhostButton title="Limpiar filtros" onPress={reset} /></View>}
            </View>
          )
        }
        ListFooterComponent={
          visibleCount < filtered.length ? (
            <Pressable
              onPress={loadMore}
              accessibilityRole="button" accessibilityLabel="Cargar más anuncios"
              style={({ pressed }) => [{ paddingVertical: espaciado.e14, borderRadius: 10, backgroundColor: colors.surface, alignItems: 'center', opacity: pressed ? 0.7 : 1 }]}
            >
              <Text style={{ fontSize: tipografia.caption, color: colors.primary, fontWeight: '700' }}>Cargar más anuncios</Text>
            </Pressable>
          ) : null
        }
      />

      {/* Modal de filtros (borrador local + Aplicar/Cancelar) */}
      <Modal visible={filterVisible} transparent animationType="slide" onRequestClose={cancelDraft}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%', padding: espaciado.e20, paddingBottom: Math.max(insets.bottom, 16) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: espaciado.e12 }}>
              <Text style={{ fontSize: 17, fontWeight: '800', color: colors.textPrimary }}>Filtros</Text>
              <Pressable onPress={cancelDraft} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cerrar filtros">
                <X size={22} color={colors.textPrimary} />
              </Pressable>
            </View>

            {loading && !catalog ? (
              <View style={{ alignItems: 'center', paddingVertical: 50 }}>
                <ActivityIndicator color={colors.primary} />
                <Text style={{ marginTop: espaciado.e10, color: colors.textSecondary, fontSize: tipografia.caption }}>Cargando catálogo…</Text>
              </View>
            ) : draft ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={s.fLabel}>Ciudad</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {(catalog?.cities ?? []).map((c) => (
                    <FilterChip key={c.id} label={c.label} selected={draft.cityId === c.id} onPress={() => setDraft((d) => (d ? { ...d, cityId: d.cityId === c.id ? undefined : c.id } : d))} />
                  ))}
                </View>

                <Text style={s.fLabel}>Tipo de propiedad</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {(catalog?.propertyTypes ?? []).map((t) => (
                    <FilterChip key={t.id} label={t.label} selected={draft.types.includes(t.id)} onPress={() => toggleDraft('types', t.id)} />
                  ))}
                </View>

                <Text style={s.fLabel}>Tipo de alquiler</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {(catalog?.rentalTypes ?? []).map((t) => (
                    <FilterChip key={t.id} label={t.label} selected={draft.rentalType === asRentalType(t.id)} onPress={() => setDraft((d) => (d ? { ...d, rentalType: d.rentalType === asRentalType(t.id) ? undefined : asRentalType(t.id) } : d))} />
                  ))}
                </View>

                <Text style={s.fLabel}>Barrio</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {(catalog?.neighborhoods ?? []).filter((n) => !draft.cityId || n.cityId === draft.cityId).map((n) => (
                    <FilterChip key={`${n.cityId}:${n.name}`} label={n.name} selected={draft.neighborhoods.includes(n.name)} onPress={() => toggleDraft('neighborhoods', n.name)} />
                  ))}
                </View>

                <Text style={s.fLabel}>Servicios esenciales</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
                  {(catalog?.essentialServices ?? []).map((e) => (
                    <FilterChip key={e.id} label={e.label} selected={draft.essentialServices.includes(e.id)} onPress={() => toggleDraft('essentialServices', e.id)} />
                  ))}
                </View>

                <Text style={s.fLabel}>Otras opciones</Text>
                <View style={{ gap: espaciado.e10, marginBottom: espaciado.e12 }}>
                  <SwitchRow label="Solo vivienda social" value={draft.isSocialHousingOnly} onChange={(v) => setDraft((d) => (d ? { ...d, isSocialHousingOnly: v } : d))} />
                  <SwitchRow label="Con terraza" value={draft.hasTerrace ?? false} onChange={(v) => setDraft((d) => (d ? { ...d, hasTerrace: v } : d))} />
                  <SwitchRow label="Solo terrenos" value={draft.isLand ?? false} onChange={(v) => setDraft((d) => (d ? { ...d, isLand: v, landUse: v ? d.landUse : [] } : d))} />
                  <SwitchRow label="Solo verificados (nivel 2+)" value={(draft.minVerificationLevel ?? 0) >= 2} onChange={(v) => setDraft((d) => (d ? { ...d, minVerificationLevel: v ? 2 : undefined } : d))} />
                </View>
              </ScrollView>
            ) : null}

            <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e12 }}>
              <View style={{ flex: 1 }}><GhostButton title="Cancelar" onPress={cancelDraft} /></View>
              <View style={{ flex: 1 }}><GhostButton title="Limpiar" onPress={clearDraft} /></View>
              <View style={{ flex: 1.4 }}><PrimaryButton title="Aplicar" onPress={applyDraft} /></View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Chip de filtro con key estable y a11y (rol/estado/label). */
function FilterChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, borderRadius: 20, marginRight: espaciado.e8, marginBottom: espaciado.e8, backgroundColor: selected ? colors.primary : colors.surface, borderWidth: 1, borderColor: selected ? colors.primary : colors.border, opacity: pressed ? 0.85 : 1 }]}
    >
      <Text style={{ fontSize: tipografia.caption, color: selected ? brand.white : colors.textPrimary, fontWeight: selected ? '700' : '500' }}>{label}</Text>
      {selected && <Check size={12} color={brand.white} style={{ marginLeft: espaciado.e4 }} />}
    </Pressable>
  );
}

function ActiveChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onRemove}
      accessibilityRole="button"
      accessibilityLabel={`Quitar filtro: ${label}`}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e5, borderRadius: 14, borderWidth: 1, borderColor: colors.primary, marginRight: espaciado.e6, opacity: pressed ? 0.7 : 1 }]}
    >
      <Text style={{ fontSize: tipografia.micro, color: colors.primary, fontWeight: peso.medio }}>{label}</Text>
      <X size={12} color={colors.primary} style={{ marginLeft: espaciado.e4 }} />
    </Pressable>
  );
}

function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
      <Text style={{ fontSize: tipografia.body, color: colors.textPrimary, fontWeight: peso.medio }}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: colors.primary, false: colors.border }}
        accessibilityRole="switch"
        accessibilityLabel={label}
        accessibilityState={{ checked: value }}
      />
    </View>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  fLabel: { fontSize: tipografia.caption, fontWeight: '800', color: c.textPrimary, marginTop: espaciado.e14, marginBottom: espaciado.e8 },
  errIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: espaciado.e14 },
});
