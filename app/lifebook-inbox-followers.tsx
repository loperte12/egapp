/**
 * Bandeja · NUEVOS SEGUIDORES + RECOMENDACIONES (/lifebook-inbox-followers).
 * Arriba: quién te ha seguido (con "Seguir de vuelta").
 * Abajo: recomendaciones de la plataforma (regla simple y con motivo visible).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, radios, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { ArrowLeft, Check, UserPlus, Users } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { absUrl } from '../api/config';
import { lifebookApi, lifebookInboxApi, type LbFollowerItem, type LbSuggestedUser } from '../api/lifebook';
import { lbTimeAgo } from '../constants/lifebook';

export default function InboxFollowersScreen() {
  return (
    <AuthGate>
      <FollowersContent />
    </AuthGate>
  );
}

function FollowersContent() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [followers, setFollowers] = useState<LbFollowerItem[] | null>(null);
  const [suggested, setSuggested] = useState<LbSuggestedUser[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [f, s] = await Promise.all([lifebookInboxApi.followers(), lifebookInboxApi.suggested()]);
      setFollowers(f); setSuggested(s);
      // Parte 16: abrir la bandeja la marca como leída.
      lifebookInboxApi.markRead('followers').catch(() => {});
    } catch { setFollowers([]); setSuggested([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const followBack = async (u: LbFollowerItem) => {
    setBusy(u.id);
    const was = u.followedBack;
    setFollowers((prev) => (prev ?? []).map((x) => (x.id === u.id ? { ...x, followedBack: !was } : x)));
    try { await (was ? lifebookApi.unfollow(u.id) : lifebookApi.follow(u.id)); }
    catch { setFollowers((prev) => (prev ?? []).map((x) => (x.id === u.id ? { ...x, followedBack: was } : x))); }
    finally { setBusy(null); }
  };

  const followSuggested = async (u: LbSuggestedUser) => {
    setBusy(u.id);
    try {
      await lifebookApi.follow(u.id);
      setSuggested((prev) => (prev ?? []).filter((x) => x.id !== u.id));
    } catch { /* sigue en la lista */ }
    finally { setBusy(null); }
  };

  const Avatar = ({ url, name, size = 46 }: { url?: string | null; name?: string | null; size?: number }) => (
    absUrl(url) ? (
      <Image source={{ uri: absUrl(url) }} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface }} />
    ) : (
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: alpha(colors.primary, 0.15), alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.primary, fontSize: size * 0.42, fontWeight: peso.titulo }}>{(name ?? '?').charAt(0).toUpperCase()}</Text>
      </View>
    )
  );

  const loading = followers === null || suggested === null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.topBar, { borderBottomColor: colors.border, paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingVertical: espaciado.e4 }}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Nuevos seguidores</Text>
        <View style={{ width: 22 }} />
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={[
            { kind: 'h' as const, title: 'Te han seguido' },
            ...(followers ?? []).map((f) => ({ kind: 'f' as const, f })),
            ...(((followers ?? []).length === 0) ? [{ kind: 'he' as const }] : []),
            { kind: 'h' as const, title: 'Recomendados para ti' },
            ...(suggested ?? []).map((s) => ({ kind: 's' as const, s })),
            ...(((suggested ?? []).length === 0) ? [{ kind: 'se' as const }] : []),
          ]}
          keyExtractor={(row, i) => row.kind === 'f' ? `f-${row.f.id}` : row.kind === 's' ? `s-${row.s.id}` : `${row.kind}-${i}`}
          contentContainerStyle={{ padding: espaciado.e14, paddingBottom: insets.bottom + 20 }}
          renderItem={({ item: row }) => {
            if (row.kind === 'h') {
              return <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{row.title.toUpperCase()}</Text>;
            }
            if (row.kind === 'he') {
              return <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginBottom: espaciado.e6, lineHeight: 18 }}>Todavía no tienes seguidores nuevos.</Text>;
            }
            if (row.kind === 'se') {
              return <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 18 }}>No hay recomendaciones ahora mismo.</Text>;
            }
            if (row.kind === 'f') {
              const u = row.f;
              return (
                <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, flex: 1 }}
                    onPress={() => router.push({ pathname: '/lifebook-user', params: { id: u.id } } as never)}>
                    <Avatar url={u.avatarUrl} name={u.fullName} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.textPrimary, fontSize: 14.5, fontWeight: peso.maximo }} numberOfLines={1}>{u.fullName ?? 'Usuario'}</Text>
                      <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 1 }}>
                        {u.city ? `${u.city} · ` : ''}{u.posts} publicacion{u.posts === 1 ? '' : 'es'} · {lbTimeAgo(u.at)}
                      </Text>
                    </View>
                  </Pressable>
                  <Pressable onPress={() => followBack(u)} disabled={busy === u.id}
                    style={[styles.followBtn, { backgroundColor: u.followedBack ? colors.surface : colors.primary, borderColor: u.followedBack ? colors.border : colors.primary }]}>
                    {busy === u.id ? <ActivityIndicator size="small" color={u.followedBack ? colors.textPrimary : brand.white} /> : (
                      <>
                        {u.followedBack ? <Check size={13} color={colors.textPrimary} /> : <UserPlus size={13} color={brand.white} />}
                        <Text style={{ color: u.followedBack ? colors.textPrimary : brand.white, fontSize: tipografia.caption, fontWeight: peso.titulo }}>
                          {u.followedBack ? 'Siguiendo' : 'Seguir'}
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              );
            }
            const s = row.s;
            return (
              <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, flex: 1 }}
                  onPress={() => router.push({ pathname: '/lifebook-user', params: { id: s.id } } as never)}>
                  <Avatar url={s.avatarUrl} name={s.fullName} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 14.5, fontWeight: peso.maximo }} numberOfLines={1}>{s.fullName ?? 'Usuario'}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 1 }} numberOfLines={1}>{s.reason}</Text>
                  </View>
                </Pressable>
                <Pressable onPress={() => followSuggested(s)} disabled={busy === s.id} style={[styles.followBtn, { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                  {busy === s.id ? <ActivityIndicator size="small" color={brand.white} /> : (
                    <>
                      <UserPlus size={13} color={brand.white} />
                      <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: peso.titulo }}>Seguir</Text>
                    </>
                  )}
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60, gap: espaciado.e8 }}>
              <Users size={36} color={alpha(colors.primary, 0.45)} />
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.titulo }}>Sin novedades de seguidores</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingHorizontal: espaciado.e12, paddingBottom: espaciado.e8, borderBottomWidth: StyleSheet.hairlineWidth },
  topTitle: { fontSize: 16.5, fontWeight: peso.titulo, flex: 1 },
  sectionTitle: { fontSize: tipografia.micro, fontWeight: peso.titulo, letterSpacing: 0.6, marginTop: espaciado.e6, marginBottom: espaciado.e8 },
  card: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: espaciado.e12, marginBottom: espaciado.e8 },
  followBtn: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e5, borderRadius: radios.full, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e8, borderWidth: 1 },
});
