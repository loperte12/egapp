/**
 * Life Book — USUARIOS BLOQUEADOS (/lifebook-blocks).
 * Lista con desbloqueo inmediato. Entrada: Ajustes → Life Book · Contenido.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, radios, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { ArrowLeft, Ban } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { absUrl } from '../api/config';
import { lifebookBlocksApi, type LbBlockedUser } from '../api/lifebook';
import { lbTimeAgo } from '../constants/lifebook';

export default function LifeBookBlocksScreen() {
  return (
    <AuthGate>
      <BlocksContent />
    </AuthGate>
  );
}

function BlocksContent() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<LbBlockedUser[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setRows(await lifebookBlocksApi.mine()); } catch { setRows([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const unblock = async (id: string) => {
    setBusyId(id);
    try {
      await lifebookBlocksApi.unblock(id);
      setRows((prev) => (prev ?? []).filter((x) => x.id !== id));
    } finally { setBusyId(null); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.topBar, { borderBottomColor: colors.border, paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingVertical: espaciado.e4 }}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Usuarios bloqueados</Text>
        <View style={{ width: 22 }} />
      </View>
      {rows === null ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: espaciado.e14, paddingBottom: insets.bottom + 20, flexGrow: 1 }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 90, gap: espaciado.e8 }}>
              <Ban size={40} color={alpha(colors.primary, 0.4)} />
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.titulo }}>No tienes usuarios bloqueados.</Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', paddingHorizontal: espaciado.e30, lineHeight: 18 }}>
                Cuando bloquees a alguien desde su perfil, aparecerá aquí y no verás su contenido ni te podrá escribir.
              </Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: espaciado.e10 }}>
                {absUrl(item.avatarUrl) ? (
                  <Image source={{ uri: absUrl(item.avatarUrl) }} style={[styles.avatar, { backgroundColor: colors.surface }]} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: alpha(colors.primary, 0.15), alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: colors.primary, fontSize: tipografia.title, fontWeight: peso.titulo }}>{(item.fullName ?? '?').charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.maximo }} numberOfLines={1}>{item.fullName ?? 'Usuario'}</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 1 }}>Bloqueado {lbTimeAgo(item.blockedAt)}</Text>
                </View>
                <Pressable
                  onPress={() => unblock(item.id)}
                  disabled={busyId === item.id}
                  style={[styles.unblockBtn, { backgroundColor: alpha(colors.danger, 0.1) }]}
                >
                  {busyId === item.id ? <ActivityIndicator size="small" color={colors.danger} /> : <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: peso.titulo }}>Desbloquear</Text>}
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingHorizontal: espaciado.e12, paddingBottom: espaciado.e8, borderBottomWidth: StyleSheet.hairlineWidth },
  topTitle: { fontSize: 17, fontWeight: peso.titulo, flex: 1 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: espaciado.e12 },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  unblockBtn: { borderRadius: radios.full, paddingHorizontal: espaciado.e13, paddingVertical: espaciado.e8 },
});
