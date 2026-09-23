/**
 * Componentes compartidos de Buscar Work (adaptados del kit al stack de la app:
 * expo-router, useTheme, lucide). JobCard v2, SearchBar, SortBar, ResultCount,
 * EmptyState y el aviso anti-estafa.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { BadgeCheck, Briefcase, Search, ShieldCheck, X } from 'lucide-react-native';
import { useTheme, alpha, tipografia, radios } from '@egrouteplan/ui-kit';
import type { WorkJob } from '../api/work';
import { brand } from '@egrouteplan/ui-kit';

export type SortKey = 'recent' | 'salary' | 'distance';

/** Rango salarial compacto estilo BOSS ("8-15K"). */
function salaryShort(job: WorkJob): string {
  const fmtK = (n: number) => {
    if (n >= 1000 && n % 1000 === 0) return `${n / 1000}K`;
    return String(n);
  };
  const lo = fmtK(job.salaryMin);
  const hi = job.salaryMax && job.salaryMax > job.salaryMin ? fmtK(job.salaryMax) : null;
  return hi ? `${lo}–${hi}` : lo;
}

/** Tarjeta de oferta estilo BOSS直聘 (JobCard v3, ref-boss-home/scroll). */
export function WorkJobCard({ job, onPress }: { job: WorkJob; onPress: () => void }) {
  const { colors } = useTheme();
  const daysAgo = job.publishedAt ? Math.floor((Date.now() - new Date(job.publishedAt).getTime()) / 86400000) : 0;
  const recruiterName = job.recruiter?.name;
  const chips = [
    job.city,
    job.contractLabel,
    job.zone || job.location || undefined,
    ...(job.requirements ?? []).slice(0, 1),
  ].filter((c): c is string => !!c && c.length > 0).slice(0, 4);

  return (
    <Pressable onPress={onPress} style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {/* Fila 1: título IZQ + salario naranja DER (patrón BOSS) */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
        <Text style={[s.title, { color: colors.textPrimary }]} numberOfLines={2}>{job.title}</Text>
        <Text style={s.salary} numberOfLines={1}>{salaryShort(job)}</Text>
      </View>

      {/* Fila 2: empresa + verificada */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
        <Text style={[s.company, { color: colors.textSecondary }]} numberOfLines={1}>{job.company}</Text>
        {job.companyVerified && <BadgeCheck size={13} color={brand.success} />}
        {job.isUrgent && (
          <View style={s.urgentBadge}><Text style={s.urgentText}>URGENTE</Text></View>
        )}
      </View>

      {/* Fila 3: chips de requisitos */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
        {chips.map((chip, i) => (
          <View key={`${chip}-${i}`} style={[s.chip, { backgroundColor: alpha(colors.textSecondary, 0.07), borderColor: colors.border }]}>
            <Text style={[s.chipText, { color: colors.textSecondary }]} numberOfLines={1}>{chip}</Text>
          </View>
        ))}
      </View>

      {/* Fila 4: reclutador + antigüedad */}
      <View style={[s.footer, { borderTopColor: colors.border }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[s.avatar, { backgroundColor: job.recruiter?.avatarColor ?? alpha(colors.primary, 0.15) }]}>
            <Text style={[s.avatarText, { color: colors.primary }]}>
              {(recruiterName || job.company || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: '700' }}>
              {recruiterName || 'Empresa'}
              {job.recruiter?.role ? ` · ${job.recruiter.role}` : ''}
            </Text>
            <Text style={{ color: colors.success, fontSize: 10.5, fontWeight: '700' }}>
              {job.applicantsCount > 0 ? `✓ ${job.applicantsCount} candidato${job.applicantsCount === 1 ? '' : 's'}` : 'Reclutando'}
            </Text>
          </View>
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: 10.5, fontWeight: '600' }}>
          {daysAgo === 0 ? 'Hoy' : `Hace ${daysAgo}d`}
        </Text>
      </View>
    </Pressable>
  );
}

export function WorkSearchBar({ value, onChange, placeholder }: { value: string; onChange: (t: string) => void; placeholder?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[s.search, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Search size={18} color={colors.textSecondary} style={{ marginRight: 8 }} />
      <TextInput
        style={[s.searchInput, { color: colors.textPrimary }]}
        value={value}
        onChangeText={onChange}
        placeholder={placeholder || 'Buscar empleo, empresa o ciudad'}
        placeholderTextColor={colors.textSecondary}
        returnKeyType="search"
        autoCorrect={false}
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChange('')} hitSlop={8}><X size={18} color={colors.textSecondary} /></Pressable>
      )}
    </View>
  );
}

export function WorkSortBar({ value, onChange }: { value: SortKey; onChange: (k: SortKey) => void }) {
  const { colors } = useTheme();
  const OPTIONS: Array<{ key: SortKey; label: string }> = [
    { key: 'recent', label: 'Recientes' }, { key: 'salary', label: 'Mejor paga' }, { key: 'distance', label: 'Más cerca' },
  ];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 6 }}>
      {OPTIONS.map((o) => (
        <Pressable key={o.key} onPress={() => onChange(o.key)} style={[s.sortBtn, { backgroundColor: value === o.key ? alpha(colors.primary, 0.15) : 'transparent' }]}>
          <Text style={{ fontSize: tipografia.micro, color: value === o.key ? colors.primary : colors.textSecondary, fontWeight: value === o.key ? '800' : '600' }}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function WorkResultCount({ count, query }: { count: number; query: string }) {
  const { colors } = useTheme();
  return (
    <Text style={{ paddingHorizontal: 16, paddingVertical: 4, fontSize: tipografia.micro, color: colors.textSecondary, fontWeight: '600' }}>
      {query ? `${count} resultados para "${query}"` : `${count} ofertas disponibles`}
    </Text>
  );
}

export function WorkEmptyState({ title, subtitle, actionLabel, onAction }: { title: string; subtitle: string; actionLabel?: string; onAction?: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 60 }}>
      <View style={[s.emptyIcon, { backgroundColor: colors.surface }]}>
        <Briefcase size={38} color={colors.textSecondary} />
      </View>
      <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' }}>{title}</Text>
      <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, textAlign: 'center', marginTop: 6, lineHeight: 18 }}>{subtitle}</Text>
      {actionLabel && onAction && (
        <Pressable onPress={onAction} style={{ marginTop: 16, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: colors.primary, borderRadius: 10 }}>
          <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: '700' }}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Aviso anti-estafa (EG): nunca pagar por un empleo. */
export function WorkSafetyNotice() {
  const { colors } = useTheme();
  return (
    <View style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: alpha(colors.danger, 0.08), borderRadius: 10, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <ShieldCheck size={16} color={colors.danger} />
      <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: '700', flex: 1 }}>
        Empleo seguro: NUNCA pagues por un trabajo. Reporta cualquier oferta sospechosa.
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { marginHorizontal: 16, marginBottom: 10, borderRadius: 14, padding: 13, borderWidth: 1 },
  title: { fontSize: tipografia.subtitle, fontWeight: '800', flex: 1, lineHeight: 20 },
  salary: { fontSize: tipografia.subtitle, fontWeight: '900', color: brand.secondary },
  company: { fontSize: tipografia.body, fontWeight: '600', flexShrink: 1 },
  urgentBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: brand.danger },
  urgentText: { color: brand.white, fontSize: 8.5, fontWeight: '800', letterSpacing: 0.4 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: StyleSheet.hairlineWidth },
  chipText: { fontSize: 10.5, fontWeight: '600' },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: tipografia.body, fontWeight: '900' },
  search: { flexDirection: 'row', alignItems: 'center', borderRadius: radios.md, paddingHorizontal: 12, height: 44, marginHorizontal: 16, marginVertical: 8, borderWidth: 1 },
  searchInput: { flex: 1, fontSize: tipografia.body, padding: 0 },
  sortBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 14 },
  emptyIcon: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
});
