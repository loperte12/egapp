/**
 * Bandeja · COMENTARIOS Y @ (/lifebook-inbox-comments).
 * Comentarios de otras personas en tus publicaciones + menciones (@Nombre).
 * Al abrir Menciones se marcan como leídas.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, EmptyState, espaciado, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { ArrowLeft, AtSign, MessageSquare } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { absUrl } from '../api/config';
import { lifebookInboxApi, type LbCommentReceived, type LbMentionReceived } from '../api/lifebook';
import { lbTimeAgo } from '../constants/lifebook';

export default function InboxCommentsScreen() {
  return (
    <AuthGate>
      <CommentsContent />
    </AuthGate>
  );
}

function CommentsContent() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'comments' | 'mentions'>('comments');
  const [comments, setComments] = useState<LbCommentReceived[] | null>(null);
  const [mentions, setMentions] = useState<LbMentionReceived[] | null>(null);

  const load = useCallback(async () => {
    try {
      const [c, m] = await Promise.all([lifebookInboxApi.comments(), lifebookInboxApi.mentions()]);
      setComments(c); setMentions(m);
    } catch { setComments([]); setMentions([]); }
  }, []);
  useEffect(() => { load(); }, [load]);
  // Parte 16: abrir la bandeja marca comentarios y menciones como leídos.
  useEffect(() => { lifebookInboxApi.markRead('comments').catch(() => {}); }, [tab]);

  const Row = ({ actor, body, at, postId, thumb, label }: {
    actor: { id: string; fullName: string | null; avatarUrl: string | null };
    body: string; at: string; postId?: string | null; thumb?: { url: string } | null; label: string;
  }) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e10 }}
        onPress={() => router.push({ pathname: '/lifebook-user', params: { id: actor.id } } as never)}>
        {absUrl(actor.avatarUrl) ? (
          <Image source={{ uri: absUrl(actor.avatarUrl) }} style={[styles.avatar, { backgroundColor: colors.surface }]} />
        ) : (
          <View style={[styles.avatar, { backgroundColor: alpha(colors.primary, 0.15), alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ color: colors.primary, fontSize: 18, fontWeight: '900' }}>{(actor.fullName ?? '?').charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 14.5, fontWeight: '800' }} numberOfLines={1}>{actor.fullName ?? 'Usuario'}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 1 }}>{label} · {lbTimeAgo(at)}</Text>
        </View>
      </Pressable>

      <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, marginTop: espaciado.e8, lineHeight: 19 }}>{body}</Text>

      {postId && (
        <Pressable onPress={() => router.push({ pathname: '/lifebook-post/[id]', params: { id: postId } } as never)}
          style={[styles.postRow, { backgroundColor: colors.surface }]}>
          {thumb ? (
            <Image source={{ uri: absUrl(thumb.url) }} style={[styles.thumb, { backgroundColor: colors.card }]} />
          ) : (
            <View style={[styles.thumb, { backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' }]}>
              <Text style={{ fontSize: tipografia.body }}>📝</Text>
            </View>
          )}
          <Text style={{ flex: 1, color: colors.primary, fontSize: tipografia.caption, fontWeight: '800' }}>Ver la publicación</Text>
        </Pressable>
      )}
    </View>
  );

  const loading = tab === 'comments' ? comments === null : mentions === null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.topBar, { borderBottomColor: colors.border, paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingVertical: espaciado.e4 }}>
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Comentarios y @</Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={{ flexDirection: 'row', gap: espaciado.e8, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e10 }}>
        {([['comments', 'Comentarios'], ['mentions', 'Menciones @']] as Array<['comments' | 'mentions', string]>).map(([k, label]) => {
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
      ) : tab === 'comments' ? (
        <FlatList
          data={comments ?? []}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: espaciado.e14, paddingBottom: insets.bottom + 20, flexGrow: 1 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <EmptyState
              icono={<MessageSquare size={38} color={alpha(colors.primary, 0.45)} />}
              titulo="Todavía no hay comentarios"
              texto="Los comentarios de otras personas en tus publicaciones aparecerán aquí, con la opción de responder por mensaje."
            />
          }
          renderItem={({ item }) => (
            <Row actor={item.user} body={item.body} at={item.at} postId={item.post.id} thumb={item.post.thumb} label='comentó tu publicación' />
          )}
        />
      ) : (
        <FlatList
          data={mentions ?? []}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: espaciado.e14, paddingBottom: insets.bottom + 20, flexGrow: 1 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            <EmptyState
              icono={<AtSign size={38} color={alpha(colors.primary, 0.45)} />}
              titulo="Sin menciones"
              texto="Cuando alguien te mencione con @ en un comentario o en una publicación, lo verás aquí."
            />
          }
          renderItem={({ item }) => (
            <Row actor={item.user} body={item.snippet ?? ''} at={item.at} postId={item.post?.id} thumb={item.post?.thumb} label='te mencionó' />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingHorizontal: espaciado.e12, paddingBottom: espaciado.e8, borderBottomWidth: StyleSheet.hairlineWidth },
  topTitle: { fontSize: 16.5, fontWeight: '900', flex: 1 },
  tabPill: { borderRadius: radios.full, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e7, borderWidth: 1 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: espaciado.e12 },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  postRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e9, borderRadius: 10, padding: espaciado.e8, marginTop: espaciado.e10 },
  thumb: { width: 38, height: 38, borderRadius: radios.sm },
});
