/**
 * Life Book — BANDEJA unificada (/lifebook-inbox?tab=likes|followers|comments)
 * Pantalla: LifeBookInbox (estilo Xiaohongshu + datos REALES de la Fase A).
 *
 *  - Pestañas: Me gusta · Guardados / Seguidores / Comentarios y @.
 *  - Tarjetas: avatar del actor con distintivo de tipo, acción, texto del
 *    comentario/mención, hora, miniatura de tu publicación y "Seguir de vuelta"
 *    (llamada real) en seguidores.
 *  - Me gusta: botón "Agradecer" que abre el chat con el mensaje ya escrito.
 *  - Comentarios: marca las menciones como leídas al abrir.
 *  - Enlace al detalle de cada bandeja (recomendados, menciones leídas, etc.).
 */
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, EmptyState, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { ArrowLeft, AtSign, ChevronRight, Heart, UserPlus } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { messagesApi, type LbInboxItem, type LbInboxType } from '../api/messages';
import { lifebookApi, lifebookInboxApi } from '../api/lifebook';
import { lbTimeAgo } from '../constants/lifebook';
import { brand } from '@egrouteplan/ui-kit';

const TABS: { id: LbInboxType; label: string }[] = [
  { id: 'likes', label: 'Me gusta · Guardados' },
  { id: 'followers', label: 'Seguidores' },
  { id: 'comments', label: 'Comentarios y @' },
];

/** Pantalla de detalle de cada bandeja (donde viven recomendados y menciones). */
const DETAIL_ROUTE: Record<LbInboxType, string> = {
  likes: '/lifebook-inbox-likes',
  followers: '/lifebook-inbox-followers',
  comments: '/lifebook-inbox-comments',
};

export default function LifeBookInbox() {
  return (
    <AuthGate>
      <InboxContent />
    </AuthGate>
  );
}

function InboxContent() {
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const initial: LbInboxType = (tab === 'followers' || tab === 'comments') ? tab : 'likes';

  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [active, setActive] = useState<LbInboxType>(initial);
  const [items, setItems] = useState<LbInboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (kind: LbInboxType) => {
    try {
      const page = await messagesApi.inbox([kind]);
      setItems(page.items);
      setError(null);
      // Parte 16: abrir la bandeja la marca como leída (los iconos de Mensajes se limpian).
      lifebookInboxApi.markRead(kind).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la bandeja');
    }
  }, []);

  /**
   * Parte 31 (navegación fluida): al volver a la bandeja NO se vacía la lista.
   * Antes `setItems(null)` borraba todo y mostraba el spinner a pantalla
   * completa en cada foco → parpadeo. Ahora se recarga en segundo plano y la
   * lista (o el spinner, solo la primera vez) se mantiene hasta tener datos.
   */
  useFocusEffect(useCallback(() => { load(active); }, [active, load]));

  const followBack = async (userId: string, itemId: string) => {
    if (!userId || busyId) return;
    setBusyId(itemId);
    try {
      await lifebookApi.follow(userId);
      setItems((prev) => (prev ?? []).map((i) => (i.id === itemId ? { ...i, followedBack: true } : i)));
    } catch { /* silencioso */ }
    finally { setBusyId(null); }
  };

  const thank = async (userId: string) => {
    if (!userId) return;
    try {
      const conv = await messagesApi.open(userId);
      router.push({
        pathname: '/lifebook-chat/[id]',
        params: { id: conv.id, name: conv.peer.name ?? 'Chat', peerId: conv.peer.id, draft: '¡Gracias por tu me gusta! 😊' },
      });
    } catch { /* silencioso */ }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {/* Cabecera */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Volver">
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: 17, flex: 1, marginLeft: espaciado.e10 }}>
          Notificaciones
        </Text>
        <Pressable
          onPress={() => router.push(DETAIL_ROUTE[active] as never)}
          hitSlop={8}
          accessibilityLabel="Ver detalle de la bandeja"
        >
          <ChevronRight size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Pestañas */}
      <View style={styles.tabRow}>
        {TABS.map((t) => {
          const isActive = active === t.id;
          return (
            <Pressable
              key={t.id}
              onPress={() => setActive(t.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              style={[styles.tab, { backgroundColor: isActive ? colors.primary : colors.surface }]}
            >
              <Text numberOfLines={1} style={{ color: isActive ? brand.white : colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Lista */}
      {items === null && !error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: espaciado.e12, padding: espaciado.e24 }}>
          <Text style={{ color: colors.danger, fontSize: tipografia.body, fontWeight: peso.fuerte, textAlign: 'center' }}>{error}</Text>
          <Pressable onPress={() => load(active)} style={{ backgroundColor: colors.surface, borderRadius: radios.full, paddingHorizontal: espaciado.e18, paddingVertical: espaciado.e9 }}>
            <Text style={{ color: colors.primary, fontWeight: peso.maximo }}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items ?? []}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ padding: espaciado.e14, gap: espaciado.e10, flexGrow: 1 }}
          refreshing={false}
          onRefresh={() => load(active)}
          renderItem={({ item }) => (
            <InboxCard
              item={item}
              colors={colors}
              busy={busyId === item.id}
              onOpen={() => {
                if (item.targetPostId) router.push({ pathname: '/lifebook-post/[id]', params: { id: item.targetPostId } });
                else if (item.actor.id) router.push({ pathname: '/lifebook-user', params: { id: item.actor.id } } as never);
              }}
              onFollow={() => followBack(item.actor.id, item.id)}
              onThank={() => thank(item.actor.id)}
            />
          )}
          ListEmptyComponent={
            /*
              Vacío con salida (D-17). Este era el PEOR ejemplo del informe: «Nada por aquí
              todavía» no dice qué es esto, ni por qué está vacío, ni qué hacer. El margen de
              arriba se conserva (36 + los 34 del propio componente ≈ los 70 de antes).
            */
            <View style={{ marginTop: 36 }}>
              <EmptyState
                icono={active === 'likes'
                  ? <Heart size={40} color={colors.textSecondary} />
                  : active === 'followers'
                    ? <UserPlus size={40} color={colors.textSecondary} />
                    : <AtSign size={40} color={colors.textSecondary} />}
                titulo={active === 'likes'
                  ? 'Todavía no tienes me gusta ni guardados'
                  : active === 'followers'
                    ? 'Todavía no tienes seguidores nuevos'
                    : 'Todavía no te han mencionado'}
                texto={active === 'likes'
                  ? 'Cuando alguien reaccione a una publicación tuya o guarde algo tuyo, aparecerá aquí y podrás agradecerle por mensaje.'
                  : active === 'followers'
                    ? 'Aquí verás a quien empiece a seguirte, y podrás seguirle tú también.'
                    : 'Cuando alguien te mencione con @ en un comentario, lo verás aquí.'}
                accionLabel={active === 'likes' ? 'Crear una publicación' : undefined}
                onAccion={active === 'likes' ? () => router.push('/lifebook-compose' as never) : undefined}
              />
            </View>
          }
        />
      )}
    </View>
  );
}

/* ── Tarjeta de notificación ── */
function InboxCard({ item, colors, busy, onOpen, onFollow, onThank }: {
  item: LbInboxItem; colors: any; busy?: boolean;
  onOpen: () => void; onFollow: () => void; onThank: () => void;
}) {
  const icon = item.kind === 'likes'
    ? <Heart size={13} color={brand.white} fill={brand.white} />
    : item.kind === 'followers'
      ? <UserPlus size={13} color={brand.white} />
      : <AtSign size={13} color={brand.white} />;
  const iconBg = item.kind === 'likes' ? brand.like : item.kind === 'followers' ? brand.primary : brand.secondary;

  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.card, { backgroundColor: colors.card, opacity: pressed ? 0.92 : 1 }]}
    >
      <View>
        {item.actor.avatarUrl ? (
          <Image source={{ uri: item.actor.avatarUrl }} style={styles.avatar} />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback, { backgroundColor: alpha(colors.primary, 0.15) }]}>
            <Text style={{ color: colors.primary, fontWeight: peso.maximo }}>
              {(item.actor.name ?? '?').trim().charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        <View style={[styles.kindBadge, { backgroundColor: iconBg }]}>{icon}</View>
      </View>

      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: tipografia.body, lineHeight: 18 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: peso.fuerte }}>{item.actor.name ?? 'Usuario'}</Text>
          <Text style={{ color: colors.textSecondary }}> {item.action}</Text>
        </Text>

        {item.text ? (
          <Text numberOfLines={2} style={{ color: colors.textPrimary, fontSize: tipografia.body, marginTop: espaciado.e3 }}>{item.text}</Text>
        ) : null}

        {item.targetTitle ? (
          <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e3 }}>
            📄 {item.targetTitle}
          </Text>
        ) : null}

        <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e3 }}>{lbTimeAgo(item.createdAt)}</Text>

        <View style={{ flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e8, flexWrap: 'wrap' }}>
          {item.kind === 'followers' && !item.followedBack ? (
            <Pressable
              onPress={onFollow}
              disabled={busy}
              style={[styles.actionBtn, { backgroundColor: colors.primary }]}
            >
              {busy
                ? <ActivityIndicator size="small" color={brand.white} />
                : <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>Seguir de vuelta</Text>}
            </Pressable>
          ) : null}
          {item.kind === 'likes' ? (
            <Pressable onPress={onThank} style={[styles.actionBtn, { backgroundColor: alpha(colors.primary, 0.1) }]}>
              <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>Agradecer por mensaje</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {item.targetCover ? (
        <Image source={{ uri: item.targetCover }} style={styles.targetThumb} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e10 },
  tabRow: { flexDirection: 'row', gap: espaciado.e8, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e8 },
  tab: { borderRadius: radios.full, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, flex: 1, alignItems: 'center' },
  card: { flexDirection: 'row', gap: espaciado.e10, borderRadius: 14, padding: espaciado.e12 },
  avatar: { width: 42, height: 42, borderRadius: radios.full },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  kindBadge: {
    position: 'absolute', bottom: -2, right: -2,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: trazo.fuerte, borderColor: brand.white,
  },
  actionBtn: { borderRadius: radios.full, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e7, minWidth: 96, alignItems: 'center' },
  targetThumb: { width: 44, height: 44, borderRadius: radios.sm },
});
