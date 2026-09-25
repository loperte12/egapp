/**
 * StatusScreen — "Mi estado 24h" (/status).
 * Pantalla única para: ver/abrir el estado actual, publicar/cambiar/quitar
 * (editor), y AJUSTES del estado (visibilidad por defecto, reacciones,
 * búsqueda, tienda, notificaciones). Accesible desde el ☰, /edit-profile
 * y Ajustes → "Estado 24h".
 */

import React, { useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Bell, Clock, Eye, Globe, Heart, Lock, Plus, Search, Store, Users,
} from 'lucide-react-native';
import { alpha, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { AuthGate } from '../core/AuthGate';
import { useStatusStore } from '../state/statusStore';
import StatusRingAvatar from '../components/status/StatusRingAvatar';
import StatusChip from '../components/status/StatusChip';
import StatusEditorModal from '../components/status/StatusEditorModal';
import StatusDetailModal from '../components/status/StatusDetailModal';
import { VISIBILITY_OPTIONS } from '../constants/status';
import { useSession } from '../state/session';
import { authApi, type MeProfile } from '../api/auth';
import { useEffect } from 'react';

export default function StatusScreen() {
  return (
    <AuthGate>
      <StatusContent />
    </AuthGate>
  );
}

function StatusContent() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useSession();
  const {
    status, prefs, loading, error, refresh,
    updatePrefs, localExpire, publish, end, saveDraft, clearDraft, draft,
  } = useStatusStore();
  const [editorOpen, setEditorOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [profile, setProfile] = useState<MeProfile | null>(null);

  useEffect(() => { if (isAuthenticated) { refresh(); authApi.me().then(setProfile).catch(() => {}); } }, [isAuthenticated, refresh]);
  useEffect(() => { if (draft) setEditorOpen(true); }, [draft]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityLabel="Volver">
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Mi estado 24h</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 28 }} showsVerticalScrollIndicator={false}>
        {loading && !status ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : error && !status ? (
          <View style={styles.center}>
            <Text style={{ color: colors.danger, fontSize: tipografia.body, fontWeight: peso.fuerte }}>No se pudo cargar tu estado.</Text>
            <Pressable onPress={refresh} style={[styles.retry, { backgroundColor: colors.surface }]}>
              <Text style={{ color: colors.primary, fontWeight: peso.maximo }}>Reintentar</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Estado actual */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={styles.groupTitle}>ESTADO ACTUAL</Text>
              {status ? (
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e12 }}>
                    <StatusRingAvatar
                      avatarUrl={profile?.avatarUrl ?? null}
                      name={profile?.fullName}
                      status={status}
                      size={52}
                      ringWidth={3}
                    />
                    <View style={{ flex: 1 }}>
                      <StatusChip status={status} onPress={() => setDetailOpen(true)} onExpired={refresh} />
                      <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e4 }}>
                        Expira automáticamente en 24 h · visibilidad: {status.visibility === 'public' ? 'Todos' : status.visibility === 'followers' ? 'Seguidores' : 'Solo yo'}
                      </Text>
                    </View>
                  </View>
                  <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e14 }}>
                    <Pressable onPress={() => setEditorOpen(true)} style={[styles.actionBtn, { backgroundColor: colors.surface }]}>
                      <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body }}>Cambiar estado</Text>
                    </Pressable>
                    <Pressable onPress={() => { end().then(() => localExpire()).catch(() => {}); }} style={[styles.actionBtn, { backgroundColor: alpha(colors.danger, 0.08) }]}>
                      <Text style={{ color: colors.danger, fontWeight: peso.maximo, fontSize: tipografia.body }}>Finalizar</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <Pressable onPress={() => setEditorOpen(true)} style={[styles.addStatus, { backgroundColor: alpha(colors.primary, 0.08), borderColor: alpha(colors.primary, 0.4) }]}>
                  <View style={[styles.addIcon, { backgroundColor: alpha(colors.primary, 0.16) }]}>
                    <Plus size={20} color={colors.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.titulo }}>Agregar estado 24h</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 1 }}>Comparte qué estás haciendo · dura 24 horas</Text>
                  </View>
                </Pressable>
              )}
            </View>

            {/* Ajustes de estado */}
            <Text style={styles.groupTitle}>AJUSTES DE ESTADO</Text>
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              {/* Visibilidad por defecto */}
              <Text style={[styles.subLabel, { color: colors.textSecondary }]}>VISIBILIDAD POR DEFECTO</Text>
              <View style={styles.visRowWrap}>
                {VISIBILITY_OPTIONS.map((o) => {
                  const active = prefs?.defaultVisibility === o.value;
                  const Icon = o.value === 'public' ? Globe : o.value === 'followers' ? Users : Lock;
                  return (
                    <Pressable
                      key={o.value}
                      onPress={() => updatePrefs({ defaultVisibility: o.value }).catch(() => {})}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      style={[styles.visChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? alpha(colors.primary, 0.08) : colors.surface }]}
                    >
                      <Icon size={13} color={active ? colors.primary : colors.textSecondary} />
                      <Text style={{ color: active ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>{o.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <PrefRow icon={Search} label="Mostrar en búsqueda" hint="Aparecer al buscar personas/negocios" value={prefs?.showInSearch !== false} onChange={(v) => updatePrefs({ showInSearch: v }).catch(() => {})} colors={colors} />
              <PrefRow icon={Store} label="Mostrar en mi tienda" hint="Solo si eres vendedor o restaurante" value={prefs?.showInStore !== false} onChange={(v) => updatePrefs({ showInStore: v }).catch(() => {})} colors={colors} />
              <PrefRow icon={Heart} label="Permitir reacciones" hint="Que otros reaccionen a tu estado" value={prefs?.allowReactions !== false} onChange={(v) => updatePrefs({ allowReactions: v }).catch(() => {})} colors={colors} />
              <PrefRow icon={Bell} label="Notificaciones de estado" hint="Avisos al expirar o reaccionar" value={prefs?.notifications !== false} onChange={(v) => updatePrefs({ notifications: v }).catch(() => {})} colors={colors} last />
            </View>

            <View style={[styles.infoBox, { backgroundColor: colors.surface }]}>
              <Clock size={14} color={colors.textSecondary} />
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, flex: 1 }}>
                Tu estado desaparece solo a las 24 horas. Puedes finalizarlo antes cuando quieras.
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <StatusEditorModal visible={editorOpen} onClose={() => setEditorOpen(false)} onSaved={() => refresh()} />
      {status && (
        <StatusDetailModal visible={detailOpen} status={status} isMine onClose={() => setDetailOpen(false)} onEnded={() => { localExpire(); }} />
      )}
    </View>
  );
}

function PrefRow({
  icon: Icon, label, hint, value, onChange, colors, last,
}: {
  icon: any; label: string; hint: string; value: boolean; onChange: (v: boolean) => void;
  colors: any; last?: boolean;
}) {
  return (
    <View style={[styles.prefRow, { borderBottomWidth: last ? 0 : 1, borderBottomColor: colors.border }]}>
      <View style={[styles.prefIcon, { backgroundColor: alpha(colors.primary, 0.08) }]}>
        <Icon size={15} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>{label}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: 1 }}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary }} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e12, borderBottomWidth: trazo.fino,
  },
  topTitle: { fontSize: 17, fontWeight: peso.titulo },
  center: { alignItems: 'center', paddingVertical: 60, gap: espaciado.e14 },
  retry: { borderRadius: radios.md, paddingHorizontal: espaciado.e22, paddingVertical: espaciado.e10 },
  card: { marginHorizontal: espaciado.e16, borderRadius: radios.panel, borderWidth: trazo.fino, padding: espaciado.e14 },
  groupTitle: {
    fontSize: tipografia.micro, fontWeight: peso.titulo, letterSpacing: 1, color: '#8E8E93',
    textTransform: 'uppercase', marginTop: espaciado.e18, marginBottom: espaciado.e6, marginHorizontal: espaciado.e18,
  },
  actionBtn: { flex: 1, alignItems: 'center', borderRadius: radios.md, paddingVertical: espaciado.e11 },
  addStatus: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e12,
    borderRadius: radios.lg, borderWidth: trazo.base, padding: espaciado.e14,
  },
  addIcon: { width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  subLabel: { fontSize: 10, fontWeight: peso.titulo, letterSpacing: 0.8, marginBottom: espaciado.e8 },
  visRowWrap: { flexDirection: 'row', gap: espaciado.e8, marginBottom: espaciado.e14 },
  visChip: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e6,
    borderWidth: trazo.fino, borderRadius: radios.full, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8,
  },
  prefRow: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingVertical: espaciado.e10,
  },
  prefIcon: { width: 32, height: 32, borderRadius: radios.hermano, alignItems: 'center', justifyContent: 'center' },
  infoBox: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, margin: espaciado.e16, borderRadius: 14, padding: espaciado.e12 },
});
