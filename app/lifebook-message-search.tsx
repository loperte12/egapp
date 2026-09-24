/**
 * LifeBookMessageSearchScreen — Parte 30 (Fase 05): BÚSQUEDA GLOBAL DE MENSAJES.
 *
 * Busca en TODOS mis chats a la vez (1 a 1 y grupos donde estoy), con filtros por
 * tipo (fotos, archivos, notas y ventas, ubicación, votaciones, avisos…) y
 * paginación. Cada resultado dice en qué chat está y al tocarlo se abre ese chat.
 *
 * Respeta lo que borré de mi historial, el «compartir historial» del grupo y los
 * bloqueos (lo aplica el servidor).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { ArrowLeft, Image as ImageIcon, MapPin, Megaphone, Paperclip, Search, Vote, X } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { absUrl } from '../api/config';
import { lifebookChatApi } from '../api/lifebook';
import { lbTimeAgo } from '../constants/lifebook';

/** Filtros de tipo (los `kind` reales del servidor). */
const FILTERS: { id: string | null; label: string }[] = [
  { id: null, label: 'Todo' },
  { id: 'image', label: 'Fotos' },
  { id: 'file', label: 'Archivos' },
  { id: 'post', label: 'Notas y ventas' },
  { id: 'location', label: 'Ubicación' },
  { id: 'vote', label: 'Votaciones' },
  { id: 'checkin', label: 'Quedadas' },
  { id: 'system', label: 'Avisos' },
];

type Hit = Awaited<ReturnType<typeof lifebookChatApi.searchAllMessages>>['messages'][number];

export default function LifeBookMessageSearchScreen() {
  return (
    <AuthGate>
      <MessageSearchContent />
    </AuthGate>
  );
}

function MessageSearchContent() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<string | null>(null);
  const [hits, setHits] = useState<Hit[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [buscado, setBuscado] = useState(false);
  const seq = useRef(0);

  const buscar = useCallback(async (texto: string, tipo: string | null, opts: { append?: boolean; cursor?: string | null } = {}) => {
    const mine = ++seq.current;
    if (opts.append) setLoadingMore(true); else setLoading(true);
    try {
      const res = await lifebookChatApi.searchAllMessages({
        q: texto.trim() || undefined,
        kind: tipo ?? undefined,
        before: opts.append ? (opts.cursor ?? undefined) : undefined,
        limit: 30,
      });
      if (mine !== seq.current) return;
      setHits((prev) => (opts.append ? [...prev, ...(res.messages ?? [])] : (res.messages ?? [])));
      setCursor(res.nextCursor ?? null);
      setBuscado(true);
    } catch {
      if (mine === seq.current && !opts.append) setHits([]);
    } finally {
      if (mine === seq.current) { setLoading(false); setLoadingMore(false); }
    }
  }, []);

  // Con texto: retardo de 350 ms. Con solo un filtro: inmediato.
  useEffect(() => {
    const t = setTimeout(() => { void buscar(q, kind); }, q.trim() ? 350 : 0);
    return () => clearTimeout(t);
  }, [q, kind, buscar]);

  const vacio = useMemo(() => buscado && !loading && hits.length === 0, [buscado, loading, hits.length]);

  /** Icono y texto de cada tipo de mensaje. */
  const resumen = (m: Hit) => {
    switch (m.kind) {
      case 'image': return { icon: <ImageIcon size={13} color={colors.primary} />, text: 'Foto' };
      case 'file': return { icon: <Paperclip size={13} color={colors.primary} />, text: m.fileRef?.name ?? 'Archivo' };
      case 'post': return { icon: <Text style={{ fontSize: tipografia.caption }}>📄</Text>, text: m.postRef?.title ?? 'Nota compartida' };
      case 'sale': return { icon: <Text style={{ fontSize: tipografia.caption }}>🏷️</Text>, text: m.postRef?.title ?? 'Venta' };
      case 'location': return { icon: <MapPin size={13} color={colors.primary} />, text: m.locationRef?.label ?? 'Ubicación' };
      case 'vote': return { icon: <Vote size={13} color={colors.primary} />, text: m.voteRef?.question ?? 'Votación' };
      case 'checkin': return { icon: <Text style={{ fontSize: tipografia.caption }}>📅</Text>, text: m.checkinRef?.when ?? 'Quedada' };
      case 'chain': return { icon: <Text style={{ fontSize: tipografia.caption }}>🔗</Text>, text: m.chainRef?.title ?? 'Cadena' };
      case 'ad': return { icon: <Megaphone size={13} color={colors.primary} />, text: m.adRef?.title ?? m.adRef?.text ?? 'Anuncio' };
      default: return { icon: <Text style={{ fontSize: tipografia.caption }}>💬</Text>, text: m.body || 'Mensaje' };
    }
  };

  const abrirChat = (m: Hit) => {
    router.push({
      pathname: '/lifebook-chat/[id]',
      params: { id: m.conversation.id, name: m.conversation.title, isGroup: m.conversation.kind === 'group' ? '1' : '0' },
    } as never);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {/* Cabecera con el buscador */}
      <View style={[styles.header, { backgroundColor: colors.card, borderBottomColor: alpha(colors.border, 0.6) }]}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Volver">
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <View style={[styles.searchBox, { backgroundColor: colors.surface }]}>
          <Search size={16} color={colors.textSecondary} />
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Buscar en todos mis chats…"
            placeholderTextColor={colors.textSecondary}
            autoFocus
            style={{ flex: 1, marginLeft: espaciado.e8, color: colors.textPrimary, fontSize: tipografia.body }}
            accessibilityLabel="Buscar mensajes en todos mis chats"
          />
          {q.length > 0 ? (
            <Pressable onPress={() => setQ('')} hitSlop={8} accessibilityLabel="Borrar la búsqueda">
              <X size={16} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Filtros por tipo */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={FILTERS}
        keyExtractor={(f) => f.id ?? 'todo'}
        contentContainerStyle={{ gap: espaciado.e6, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e10 }}
        renderItem={({ item }) => {
          const activo = kind === item.id;
          return (
            <Pressable
              onPress={() => setKind(item.id)}
              accessibilityLabel={`Filtrar por ${item.label}`}
              style={[styles.chip, {
                backgroundColor: activo ? alpha(colors.primary, 0.14) : colors.surface,
                borderColor: activo ? colors.primary : 'transparent',
              }]}
            >
              <Text style={{ color: activo ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: '700' }}>{item.label}</Text>
            </Pressable>
          );
        }}
      />

      {loading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: espaciado.e30 }} />
      ) : (
        <FlatList
          data={hits}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: espaciado.e14, gap: espaciado.e8, paddingBottom: insets.bottom + 24 }}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (!cursor || loadingMore) return;
            setLoadingMore(true);
            void buscar(q, kind, { append: true, cursor });
          }}
          ListEmptyComponent={
            vacio ? (
              <View style={{ alignItems: 'center', marginTop: 40, gap: espaciado.e6 }}>
                <Search size={24} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, textAlign: 'center' }}>
                  {q.trim() ? `Nada que coincida con «${q.trim()}» en tus chats.` : 'Escribe algo para buscar (o elige un filtro).'}
                </Text>
              </View>
            ) : null
          }
          ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: espaciado.e12 }} /> : null}
          renderItem={({ item }) => {
            const r = resumen(item);
            return (
              <Pressable
                onPress={() => abrirChat(item)}
                accessibilityLabel={`${item.conversation.title}: ${r.text}`}
                style={({ pressed }) => [styles.hit, { backgroundColor: colors.card, opacity: pressed ? 0.85 : 1 }]}
              >
                {item.conversation.photoUrl ? (
                  <Image source={{ uri: absUrl(item.conversation.photoUrl) }} style={styles.hitAvatar} />
                ) : (
                  <View style={[styles.hitAvatar, styles.center, { backgroundColor: alpha(colors.primary, 0.15) }]}>
                    <Text style={{ color: colors.primary, fontWeight: '900', fontSize: tipografia.body }}>
                      {(item.conversation.title || '?').trim().charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body, flex: 1 }} numberOfLines={1}>
                      {item.conversation.title}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro }}>{lbTimeAgo(item.createdAt)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e5, marginTop: espaciado.e3 }}>
                    {r.icon}
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, flex: 1 }} numberOfLines={2}>{r.text}</Text>
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e3 }}>
                    {item.mine ? 'Tú' : (item.sender?.fullName ?? 'Alguien')} · {item.conversation.kind === 'group' ? 'grupo' : 'chat'}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e10, borderBottomWidth: StyleSheet.hairlineWidth },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', borderRadius: radios.md, paddingHorizontal: espaciado.e12, height: 42 },
  chip: { borderRadius: radios.full, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, borderWidth: 1 },
  hit: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, borderRadius: 14, padding: espaciado.e12 },
  hitAvatar: { width: 40, height: 40, borderRadius: radios.md },
  center: { alignItems: 'center', justifyContent: 'center' },
});
