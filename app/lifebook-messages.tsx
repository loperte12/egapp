/**
 * Life Book — MENSAJES (/lifebook-messages)
 *
 * Estilo Xiaohongshu con datos REALES (Fase A sobre `api/messages.ts`):
 *  - Cabecera: título + buscar personas (abre la búsqueda).
 *  - 3 atajos de bandeja con contador (me gustas/guardados · seguidores ·
 *    comentarios y @) → pantallas existentes de bandeja.
 *  - Filtro Todos / No leídos.
 *  - Filas de conversación: avatar, nombre, hora (`lbTimeAgo`), última línea,
 *    "Escribiendo…" y contexto de publicación **cuando el servidor los envíe**
 *    (Fase B: hoy llegan vacíos), badge de no leídos.
 *  - Pull-to-refresh, estados de carga/error/vacío y refresco al enfocar.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { AtSign, Compass, Heart, MessageCircle, MessagesSquare, ScanLine, ScrollText, Search, UserPlus } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { messagesApi, toConversationCard, type LbConversation, type LbConversationCard } from '../api/messages';
import type { LbInboxCounts } from '../api/lifebook';
import { authApi } from '../api/auth';
import { absUrl } from '../api/config';
import { destinoMiPerfilLifeBook } from '../core/miPerfil';
import { DOCK_BODY_H } from '../components/FloatingFooter';
import DockFooter from '../components/FloatingFooter';
import { useAppDock } from '../core/useAppDock';
import {
  AddFriendSheet, ScanSheet, SearchChatsSheet,
} from '../components/lifebook/messaging-sheets';
import { ir as irSeguro } from '../constants/rutas';
import { brand } from '@egrouteplan/ui-kit';

export default function LifeBookMessages() {
  return (
    <AuthGate>
      <MessagesContent />
    </AuthGate>
  );
}

function MessagesContent() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigate = useAppDock('mensajes');

  const [convs, setConvs] = useState<LbConversation[] | null>(null);
  const [counts, setCounts] = useState<LbInboxCounts | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Filtro de la lista. Además de leído/no leído, separa **Chats** (1 a 1) de
   * **Grupos**: es lo que pidió el dueño («organizar los mensajes en chat y grupos») y
   * es lo que hace Xiaohongshu, que lleva el chat privado y los grupos por un lado y
   * los avisos (me gusta, comentarios…) por otro. El dato ya venía del backend
   * (`isGroup` en la tarjeta), así que separarlos no cuesta nada.
   */
  /**
   * Quién eres, para el AVATAR de esta pantalla. El dueño pidió moverlo aquí desde la
   * barra de Life Book, junto a los iconos de Me gusta, Seguidores y Comentarios.
   * `null` mientras no se sabe: el botón se pinta igual, con la inicial, así que la
   * puerta al perfil existe siempre aunque el servidor no conteste.
   */
  const [yo, setYo] = useState<{ id: string | null; avatarUrl: string | null; fullName: string | null } | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'chats' | 'groups'>('all');
  const [sheet, setSheet] = useState<null | 'search' | 'group' | 'friend' | 'scan'>(null);

  const load = useCallback(async () => {
    try {
      const page = await messagesApi.conversations();
      setConvs(page.conversations);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los mensajes');
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    messagesApi.inboxCounts().then(setCounts).catch(() => {});
    // El avatar del dueño: la misma llamada que ya se hacía en otras pantallas.
    authApi.me().then((m) => setYo({
      id: m?.id ?? null, avatarUrl: m?.avatarUrl ?? null, fullName: m?.fullName ?? null,
    })).catch(() => {});
  }, [load]));

  const cards: LbConversationCard[] = useMemo(
    () => (convs ?? []).map(toConversationCard).filter((c) => (
      filter === 'unread' ? c.unreadCount > 0
        : filter === 'chats' ? !c.isGroup
          : filter === 'groups' ? c.isGroup
            : true
    )),
    [convs, filter],
  );

  /* `totalUnread` se calculaba solo para el «N sin leer» de la cabecera, que se ha
     quitado (el contador vive en la pestaña del dock). Se borra para no dejar código
     muerto ni un recuento que nadie mira. */

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {/* Cabecera */}
      <View style={styles.header}>
        {/* El título «Mensajes» y su «N sin leer» YA NO ESTÁN, y es a propósito:
            · el título solo gastaba altura en un móvil y la pantalla ya está
              identificada por su pestaña del dock («Mensajes», con su contador);
            · el «N sin leer» no significaba nada sin el título encima, así que se
              va con él. El contador de no leídos sigue en la pestaña del dock, que
              es donde de verdad hace falta.
            La cabecera se queda con las ACCIONES (buscar, crear grupo, descubrir
            grupos, añadir amigo, escanear), que es lo único que hacía falta aquí. */}
        <Pressable
          hitSlop={8}
          accessibilityLabel="Buscar en mis mensajes, contactos y grupos"
          /* ESTABA MAL: apuntaba a `/lifebook-search`, la BÚSQUEDA GENERAL de Life
             Book. Para eso ya está la lupa de la pantalla principal. Aquí lo que se
             busca es DENTRO de los mensajes: mis chats (1 a 1) y mis grupos, con sus
             fotos, archivos, notas… Esa pantalla ya existía
             (`lifebook-message-search`), solo había que apuntar a ella. */
          onPress={() => irSeguro.libre('/lifebook-message-search')}
        >
          <Search size={20} color={colors.textPrimary} />
        </Pressable>
        <Pressable hitSlop={8} accessibilityLabel="Crear grupo" onPress={() => irSeguro.libre('/lifebook-group-create')}>
          <MessagesSquare size={20} color={colors.textPrimary} />
        </Pressable>
        {/* Parte 27 (G3): descubrir grupos públicos y unirse */}
        <Pressable hitSlop={8} accessibilityLabel="Descubrir grupos" onPress={() => irSeguro.libre('/lifebook-groups')}>
          <Compass size={20} color={colors.primary} />
        </Pressable>
        <Pressable hitSlop={8} accessibilityLabel="Añadir amigo" onPress={() => setSheet('friend')}>
          <UserPlus size={20} color={colors.textPrimary} />
        </Pressable>
        <Pressable hitSlop={8} accessibilityLabel="Escanear" onPress={() => setSheet('scan')}>
          <ScanLine size={20} color={colors.textPrimary} />
        </Pressable>
      </View>

      {/* ── 3 bandejas (estilo Xiaohongshu) ── */}
      <View style={styles.inboxRow}>
        {/* ── TU PERFIL ──
            El dueño pidió mover el avatar desde la barra de Life Book a esta pantalla,
            JUNTO a los iconos de Me gusta, Seguidores y Comentarios, que es donde está
            de verdad todo lo tuyo. Lleva al perfil PÚBLICO con el mismo destino que la
            fila del ☰ y que el dock (`core/miPerfil`), para que no puedan separarse. */}
        <Pressable
          onPress={async () => {
            /* El id se pide EN EL MOMENTO si no está: medido, el botón se pintaba pero
               el toque no hacía nada porque `destinoMiPerfilLifeBook` devuelve `null`
               sin id (a propósito, para no navegar a un perfil vacío). Un botón que no
               hace nada es peor que no tenerlo, así que aquí se resuelve solo. */
            let id = yo?.id ?? null;
            if (!id) {
              try { const m = await authApi.me(); id = m?.id ?? null; } catch { /* sin id no se navega */ }
            }
            const destino = destinoMiPerfilLifeBook(id);
            /* Si no se pudo resolver el id (sesión a medias), antes NO pasaba nada: el botón
               parecía roto. Ahora se valida y, si no hay destino, se explica. */
            irSeguro.destino(destino, 'No se pudo leer tu perfil de Life Book.');
          }}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Mi perfil de Life Book"
          style={styles.inboxShortcut}
        >
          {yo?.avatarUrl ? (
            <Image
              source={{ uri: absUrl(yo.avatarUrl) }}
              /* 48 y no 34: es el MISMO tamaño que los iconos de al lado
                 (`styles.inboxIcon` = 48×48), que es lo que se pidió. Medido: con 34
                 se veía pequeño al lado de los otros tres. */
              style={{ width: 48, height: 48, borderRadius: radios.full }}
            />
          ) : (
            <View style={{
              width: 48, height: 48, borderRadius: radios.full,
              backgroundColor: colors.surface,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <Text style={{ color: colors.primary, fontSize: 19, fontWeight: peso.titulo }}>
                {(yo?.fullName?.trim()?.charAt(0) ?? '?').toUpperCase()}
              </Text>
            </View>
          )}
          <Text style={styles.inboxLabel}>Mi perfil</Text>
        </Pressable>

        <InboxShortcut
          icon={<Heart size={20} color={brand.white} fill={brand.white} />}
          bg={brand.like}
          label="Me gusta"
          badge={(counts?.likes ?? 0) + (counts?.saves ?? 0)}
          onPress={() => irSeguro.libre('/lifebook-inbox', { tab: 'likes' })}
        />
        <InboxShortcut
          icon={<UserPlus size={20} color={brand.white} />}
          bg={brand.primary}
          label="Seguidores"
          badge={counts?.followers ?? 0}
          onPress={() => irSeguro.libre('/lifebook-inbox', { tab: 'followers' })}
        />
        <InboxShortcut
          icon={<AtSign size={20} color={brand.white} />}
          bg={brand.secondary}
          label="Comentarios"
          badge={(counts?.comments ?? 0) + (counts?.mentions ?? 0)}
          onPress={() => irSeguro.libre('/lifebook-inbox', { tab: 'comments' })}
        />
      </View>

      {/* Filtro */}
      <View style={styles.filterRow}>
        {(['all', 'unread', 'chats', 'groups'] as const).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            accessibilityRole="tab"
            accessibilityState={{ selected: filter === f }}
            style={[styles.filterChip, { backgroundColor: filter === f ? colors.primary : colors.surface }]}
          >
            <Text style={{ color: filter === f ? brand.white : colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>
              {f === 'all' ? 'Todos' : f === 'unread' ? 'No leídos' : f === 'chats' ? 'Chats' : 'Grupos'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Lista */}
      {convs === null && !error ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : error && !convs ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: espaciado.e12, padding: espaciado.e24 }}>
          <Text style={{ color: colors.danger, fontSize: tipografia.body, fontWeight: peso.fuerte, textAlign: 'center' }}>{error}</Text>
          <Pressable onPress={load} style={{ backgroundColor: colors.surface, borderRadius: radios.full, paddingHorizontal: espaciado.e18, paddingVertical: espaciado.e9 }}>
            <Text style={{ color: colors.primary, fontWeight: peso.maximo }}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={cards}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingBottom: DOCK_BODY_H + insets.bottom + 20, flexGrow: 1 }}
          refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
          ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 76 }} />}
          renderItem={({ item }) => {
            const peerId = convs?.find((c) => c.id === item.id)?.peer.id ?? null;
            return (
              <ConversationRow
                card={item}
                colors={colors}
                onPress={() => irSeguro.libre('/lifebook-chat/[id]', { id: item.id, name: item.name, peerId: peerId ?? undefined })}
                /* Solo en chats 1 a 1: en un grupo no hay «el perfil» de nadie. */
                onPressAvatar={!item.isGroup && peerId ? () => irSeguro.libre('/lifebook-user', { id: peerId }) : undefined}
              />
            );
          }}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 70, gap: espaciado.e8 }}>
              <MessageCircle size={40} color={alpha(colors.primary, 0.45)} />
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.titulo }}>
                {filter === 'unread' ? 'No tienes mensajes sin leer.'
              : filter === 'chats' ? 'No tienes conversaciones de uno a uno.'
                : filter === 'groups' ? 'No estás en ningún grupo todavía.'
                  : 'Aún no tienes conversaciones'}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', paddingHorizontal: 40, lineHeight: 18 }}>
                Entra en un perfil o una publicación y toca "Mensaje" para empezar a hablar.
              </Text>
            </View>
          }
        />
      )}

      <DockFooter active="mensajes" onNavigate={navigate} />

      {/* ── Hojas de la cabecera ── */}
      <SearchChatsSheet
        visible={sheet === 'search'}
        onClose={() => setSheet(null)}
        convos={convs ?? []}
        onPick={(id) => {
          setSheet(null);
          const c = (convs ?? []).find((x) => x.id === id);
          irSeguro.libre('/lifebook-chat/[id]', { id, name: c?.title ?? c?.peer.name ?? '', peerId: c?.peer.id });
        }}
      />
      {/* Crear grupo: pantalla completa `/lifebook-group-create` (flujo nuevo) */}
      <AddFriendSheet
        visible={sheet === 'friend'}
        onClose={() => setSheet(null)}
        onOpenChat={async (userId, name) => {
          try {
            const conv = await messagesApi.open(userId);
            await load();
            irSeguro.libre('/lifebook-chat/[id]', { id: conv.id, name, peerId: userId });
          } catch (e) {
            Alert.alert('Mensaje', e instanceof Error ? e.message : 'No se pudo abrir el chat.');
          }
        }}
      />
      <ScanSheet
        visible={sheet === 'scan'}
        onClose={() => setSheet(null)}
        onDocument={() => irSeguro.libre('/scanner')}
        onQr={() => irSeguro.libre('/lifebook-scan')}
      />
    </View>
  );
}

// ── Atajo de bandeja ──────────────────────────────────────────
function InboxShortcut({ icon, bg, label, badge, onPress }: {
  icon: React.ReactNode; bg: string; label: string; badge: number; onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.inboxShortcut} hitSlop={6} accessibilityLabel={`${label}${badge > 0 ? `, ${badge}` : ''}`}>
      <View style={[styles.inboxIcon, { backgroundColor: bg }]}>
        {icon}
        {badge > 0 ? (
          <View style={styles.inboxBadge}>
            <Text style={{ color: brand.white, fontSize: 9, fontWeight: peso.titulo }}>{badge > 9 ? '9+' : badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.inboxLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

// ── Fila de conversación ──────────────────────────────────────
function ConversationRow({ card, colors, onPress, onPressAvatar }: {
  card: LbConversationCard; colors: any; onPress: () => void;
  /** Tocar el AVATAR lleva al perfil de esa persona (no al chat). En un grupo no
   *  hay un perfil al que ir, así que se queda sin acción. */
  onPressAvatar?: () => void;
}) {
  const isUnread = card.unreadCount > 0;
  const avatar = card.avatarUrl ? (
    <Image source={{ uri: card.avatarUrl }} style={styles.convoAvatar} />
  ) : (
    <View style={[styles.convoAvatar, styles.avatarFallback, { backgroundColor: alpha(colors.primary, 0.15) }]}>
      <Text style={{ color: colors.primary, fontWeight: peso.maximo, fontSize: 15 }}>
        {card.name.trim().charAt(0).toUpperCase()}
      </Text>
    </View>
  );
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.convoRow, { backgroundColor: pressed ? alpha(colors.primary, 0.05) : 'transparent' }]}
    >
      {/* El avatar SE TOCA: lleva al perfil de la persona. Antes toda la fila abría el
          chat y no había forma de ver quién es desde aquí, que es justo lo que se pidió. */}
      {onPressAvatar ? (
        <Pressable
          onPress={onPressAvatar}
          hitSlop={6}
          accessibilityLabel={`Ver el perfil de ${card.name}`}
        >
          {avatar}
        </Pressable>
      ) : avatar}

      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text numberOfLines={1} style={{ color: colors.textPrimary, fontWeight: isUnread ? peso.maximo : peso.medio, fontSize: tipografia.body, flex: 1 }}>
            {card.name}
          </Text>
          {card.isGroup ? (
            <View style={[styles.groupChip, { backgroundColor: alpha(colors.primary, 0.12) }]}>
              <Text style={{ color: colors.primary, fontSize: 10, fontWeight: peso.fuerte }}>
                👥 {card.memberCount ?? 0}
              </Text>
            </View>
          ) : null}
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginLeft: espaciado.e6 }}>{card.timeLabel}</Text>
        </View>

        <Text
          numberOfLines={1}
          style={{
            color: isUnread ? colors.textPrimary : colors.textSecondary,
            fontWeight: isUnread ? peso.medio : peso.normal,
            fontSize: tipografia.body,
            marginTop: espaciado.e2,
          }}
        >
          {card.lastMessage || '…'}
        </Text>

        {/* Fase B: contexto de la publicación que originó el chat */}
        {card.relatedPostTitle ? (
          <Text numberOfLines={1} style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e2 }}>
            📦 {card.relatedPostTitle}
          </Text>
        ) : null}
      </View>

      {isUnread ? (
        <View style={styles.unreadBadge}>
          <Text style={{ color: brand.white, fontSize: 10, fontWeight: peso.maximo }}>
            {card.unreadCount > 99 ? '99+' : card.unreadCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaciado.e16,
    paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e12,
  },
  title: { fontSize: tipografia.title, fontWeight: peso.maximo },
  groupChip: {
    paddingHorizontal: espaciado.e6, paddingVertical: 1, borderRadius: radios.sm, marginLeft: espaciado.e6,
  },
  inboxRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e12,
  },
  inboxShortcut: { alignItems: 'center', gap: espaciado.e4 },
  inboxIcon: {
    width: 48, height: 48, borderRadius: radios.full,
    alignItems: 'center', justifyContent: 'center',
  },
  inboxBadge: {
    position: 'absolute', top: -3, right: -4, backgroundColor: brand.danger,
    borderRadius: radios.hermano, minWidth: 18, height: 18, paddingHorizontal: espaciado.e3,
    alignItems: 'center', justifyContent: 'center', borderWidth: trazo.base, borderColor: brand.white,
  },
  inboxLabel: { fontSize: tipografia.micro, fontWeight: peso.medio, color: '#8A8F99' },
  filterRow: { flexDirection: 'row', gap: espaciado.e8, paddingHorizontal: espaciado.e16, paddingBottom: espaciado.e10 },
  filterChip: { borderRadius: radios.full, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e6 },
  convoRow: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e12,
    paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e12,
  },
  convoAvatar: { width: 50, height: 50, borderRadius: radios.full },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  unreadBadge: {
    backgroundColor: brand.like, borderRadius: radios.full,
    minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: espaciado.e5,
  },
});
