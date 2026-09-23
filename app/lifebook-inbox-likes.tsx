/**
 * Bandeja · ME GUSTAS Y GUARDADOS (/lifebook-inbox-likes).
 * Quién dio me gusta / guardó tus publicaciones, con opción de AGRADECER por
 * mensaje (abre el chat con el texto ya escrito).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, useTheme, brand, EmptyState, tipografia, radios } from '@egrouteplan/ui-kit';
import { ArrowLeft, Heart, Send, ThumbsUp } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { absUrl } from '../api/config';
import { lifebookChatApi, lifebookInboxApi, type LbLikeReceived, type LbSaveReceived } from '../api/lifebook';
import { lbTimeAgo } from '../constants/lifebook';

export default function InboxLikesScreen() {
  return (
    <AuthGate>
      <LikesContent />
    </AuthGate>
  );
}

const THANKS_TEXT = '¡Gracias por tu me gusta! 😊';

function LikesContent() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'likes' | 'saves'>('likes');
  const [likes, setLikes] = useState<LbLikeReceived[] | null>(null);
  const [saves, setSaves] = useState<LbSaveReceived[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [l, s] = await Promise.all([lifebookInboxApi.likes(), lifebookInboxApi.saves()]);
      setLikes(l); setSaves(s);
      // Parte 16: abrir la bandeja la marca como leída (los iconos se limpian).
      lifebookInboxApi.markRead('likes').catch(() => {});
    } catch { setLikes([]); setSaves([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const thank = async (userId: string) => {
    setBusy(userId);
    try {
      const conv = await lifebookChatApi.open(userId);
      router.push({ pathname: '/lifebook-chat/[id]', params: { id: conv.id, name: conv.other?.fullName ?? 'Chat', peerId: conv.other?.id, draft: THANKS_TEXT } } as never);
    } catch { /* sin chat */ }
    finally { setBusy(null); }
  };

  const rows = tab === 'likes' ? (likes ?? []) : (saves ?? []);
  const loading = tab === 'likes' ? likes === null : saves === null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.topBar, { borderBottomColor: colors.border, paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingVertical: 4 }}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Me gustas y guardados</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 14, paddingVertical: 10 }}>
        {([['likes', 'Me gustas'], ['saves', 'Guardados']] as Array<['likes' | 'saves', string]>).map(([k, label]) => {
          const on = tab === k;
          return (
            <Pressable key={k} onPress={() => setTab(k)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={[styles.tabPill, { backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border }]}>
              <Text style={{ color: on ? brand.white : colors.textSecondary, fontSize: tipografia.body, fontWeight: on ? '900' : '700' }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={rows as Array<LbLikeReceived | LbSaveReceived>}
          keyExtractor={(r) => `${tab}-${r.user.id}-${r.post.id}-${r.at}`}
          contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 20, flexGrow: 1 }}
          ListEmptyComponent={
            <EmptyState
              icono={<Heart size={38} color={alpha(colors.primary, 0.45)} />}
              titulo={tab === 'likes' ? 'Todavía no tienes me gusta' : 'Todavía no has guardado publicaciones'}
              texto={tab === 'likes'
                ? 'Cuando alguien reaccione a tus publicaciones lo verás aquí, y podrás agradecerle por mensaje.'
                : 'Lo que guardes aparecerá aquí, solo para ti.'}
            />
          }
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          renderItem={({ item }) => (
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {absUrl(item.user.avatarUrl) ? (
                  <Image source={{ uri: absUrl(item.user.avatarUrl) }} style={[styles.avatar, { backgroundColor: colors.surface }]} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: alpha(colors.primary, 0.15), alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: colors.primary, fontSize: 18, fontWeight: '900' }}>{(item.user.fullName ?? '?').charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 14.5, fontWeight: '800' }} numberOfLines={1}>
                    {item.user.fullName ?? 'Usuario'}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 1 }}>
                    {tab === 'likes' ? 'le dio me gusta a tu publicación' : 'guardó tu publicación'} · {lbTimeAgo(item.at)}
                  </Text>
                </View>
              </View>

              <Pressable onPress={() => router.push({ pathname: '/lifebook-post/[id]', params: { id: item.post.id } } as never)}
                style={[styles.postRow, { backgroundColor: colors.surface }]}>
                {item.post.thumb ? (
                  <Image source={{ uri: absUrl(item.post.thumb.url) }} style={[styles.thumb, { backgroundColor: colors.card }]} />
                ) : (
                  <View style={[styles.thumb, { backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ fontSize: 15 }}>📝</Text>
                  </View>
                )}
                <Text style={{ flex: 1, color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: '600' }} numberOfLines={2}>
                  {item.post.preview || 'Ver publicación'}
                </Text>
              </Pressable>

              {tab === 'likes' && (
                <Pressable onPress={() => thank(item.user.id)} disabled={busy === item.user.id}
                  style={[styles.actBtn, { backgroundColor: alpha(colors.primary, 0.1) }]}>
                  {busy === item.user.id ? <ActivityIndicator size="small" color={colors.primary} /> : (
                    <>
                      <ThumbsUp size={13} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: '900' }}>Agradecer por mensaje</Text>
                      <Send size={12} color={colors.primary} />
                    </>
                  )}
                </Pressable>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  topTitle: { fontSize: 16.5, fontWeight: '900', flex: 1 },
  tabPill: { borderRadius: radios.full, paddingHorizontal: 14, paddingVertical: 7, borderWidth: 1 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  postRow: { flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 10, padding: 8, marginTop: 10 },
  thumb: { width: 40, height: 40, borderRadius: radios.sm },
  actBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: radios.full, paddingVertical: 8, marginTop: 10 },
});
