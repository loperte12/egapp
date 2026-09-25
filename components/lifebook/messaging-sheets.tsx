/**
 * messaging-sheets — hojas de la cabecera de Mensajes:
 *   · SearchChatsSheet  → buscar entre tus conversaciones (real, en cliente)
 *   · AddFriendSheet    → personas (recomendados + seguidores) con Seguir y
 *                         Mensaje, ambos REALES
 *   · CreateGroupSheet  → vive en `./CreateGroupSheet` (se reexporta aquí para
 *                         no romper los imports antiguos)
 *   · ScanSheet         → escanear documento (/scanner, real) o QR de amigo
 *                         (pendiente: lector + búsqueda por EG-ID)
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { alpha, brand, espaciado, radios, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { Check, FileScan, QrCode, Search, UserPlus } from 'lucide-react-native';
import { lifebookApi, lifebookInboxApi, type LbFollowerItem, type LbSuggestedUser } from '../../api/lifebook';
import { messagesApi, type LbConversation, type LbConversationCard, toConversationCard } from '../../api/messages';
import { lbTimeAgo } from '../../constants/lifebook';
import { Sheet, SheetHeader } from './ui/Sheet';
import { PersonRow } from './PersonRow';
import { formaHoja, formaTirador } from './ui/Sheet';

export { CreateGroupSheet } from './CreateGroupSheet';

/* ── 1. Buscar entre mis chats ── */

export function SearchChatsSheet({ visible, onClose, convos, onPick }: {
  visible: boolean; onClose: () => void; convos: LbConversation[]; onPick: (id: string) => void;
}) {
  const { colors } = useTheme();
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<LbConversationCard[]>([]);

  useEffect(() => {
    const term = q.trim().toLowerCase();
    const cards = convos.map(toConversationCard);
    setRows(term
      ? cards.filter((c) => `${c.name} ${c.lastMessage}`.toLowerCase().includes(term))
      : cards);
  }, [q, convos]);

  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetHeader title="Buscar chat" onClose={onClose} />
      <View style={[styles.searchBox, { backgroundColor: colors.surface }]}>
        <Search size={16} color={colors.textSecondary} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Nombre o mensaje…"
          placeholderTextColor={colors.textSecondary}
          style={{ flex: 1, marginLeft: espaciado.e6, color: colors.textPrimary, fontSize: tipografia.body }}
          autoFocus
        />
      </View>
      <ScrollView style={{ maxHeight: 340 }} keyboardShouldPersistTaps="handled">
        {rows.length === 0 ? (
          <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: espaciado.e20, fontSize: tipografia.body }}>
            {convos.length === 0 ? 'Todavía no tienes conversaciones.' : 'Nada coincide.'}
          </Text>
        ) : rows.map((c) => (
          <Pressable key={c.id} onPress={() => onPick(c.id)} style={({ pressed }) => [{ opacity: pressed ? 0.7 : 1 }]}>
            <PersonRow
              name={c.name}
              avatarUrl={c.avatarUrl}
              subtitle={`${c.lastMessage} · ${c.timeLabel}`}
              actions={c.unreadCount > 0
                ? <View style={[styles.badge, { backgroundColor: colors.danger }]}><Text style={styles.badgeText}>{c.unreadCount > 9 ? '9+' : c.unreadCount}</Text></View>
                : null}
            />
          </Pressable>
        ))}
      </ScrollView>
    </Sheet>
  );
}

/* ── 2. Añadir amigo (seguir / escribir) ── */

export function AddFriendSheet({ visible, onClose, onOpenChat }: {
  visible: boolean; onClose: () => void; onOpenChat: (userId: string, name: string) => void;
}) {
  const { colors } = useTheme();
  const [people, setPeople] = useState<Array<{ id: string; name: string; avatarUrl?: string | null; note?: string; following?: boolean }> | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [suggested, followers] = await Promise.all([
        lifebookInboxApi.suggested().catch(() => [] as LbSuggestedUser[]),
        lifebookInboxApi.followers().catch(() => [] as LbFollowerItem[]),
      ]);
      const seen = new Set<string>();
      const list: Array<{ id: string; name: string; avatarUrl?: string | null; note?: string; following?: boolean }> = [];
      for (const f of followers) {
        if (!f.id || seen.has(f.id)) continue;
        seen.add(f.id);
        list.push({ id: f.id, name: f.fullName?.trim() || 'Usuario', avatarUrl: f.avatarUrl, note: `Te sigue · ${lbTimeAgo(f.at)}`, following: !!f.followedBack });
      }
      for (const s of suggested) {
        if (!s.id || seen.has(s.id)) continue;
        seen.add(s.id);
        list.push({ id: s.id, name: s.fullName?.trim() || 'Usuario', avatarUrl: s.avatarUrl, note: s.reason });
      }
      setPeople(list);
    } catch { setPeople([]); }
  }, []);

  useEffect(() => { if (visible) { setPeople(null); load(); } }, [visible, load]);

  const follow = async (userId: string, i: number) => {
    setBusyId(userId);
    try {
      await lifebookApi.follow(userId);
      setPeople((prev) => (prev ?? []).map((p, idx) => (idx === i ? { ...p, following: true, note: 'Siguiendo' } : p)));
    } catch { /* silencioso */ }
    finally { setBusyId(null); }
  };

  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetHeader title="Añadir amigo" onClose={onClose} />
      <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginBottom: espaciado.e10 }}>
        Personas que te siguen o que publican cerca de ti. Puedes seguirlas o escribirles.
      </Text>
      {people === null ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: espaciado.e20 }} />
      ) : people.length === 0 ? (
        <Text style={{ color: colors.textSecondary, textAlign: 'center', paddingVertical: espaciado.e20, fontSize: tipografia.body }}>
          No hay recomendaciones por ahora.
        </Text>
      ) : (
        <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
          {people.map((p, i) => (
            <PersonRow
              key={p.id}
              name={p.name}
              avatarUrl={p.avatarUrl}
              subtitle={p.note}
              actions={
                <>
                  {!p.following ? (
                    <Pressable
                      onPress={() => follow(p.id, i)}
                      disabled={busyId === p.id}
                      style={[styles.smallBtn, { backgroundColor: colors.primary }]}
                    >
                      {busyId === p.id
                        ? <ActivityIndicator size="small" color={brand.white} />
                        : <><UserPlus size={13} color={brand.white} /><Text style={styles.smallBtnText}>Seguir</Text></>}
                    </Pressable>
                  ) : (
                    <View style={[styles.smallBtn, { backgroundColor: alpha(colors.primary, 0.12) }]}>
                      <Check size={13} color={colors.primary} />
                      <Text style={[styles.smallBtnText, { color: colors.primary }]}>Siguiendo</Text>
                    </View>
                  )}
                  <Pressable
                    onPress={() => { onClose(); onOpenChat(p.id, p.name); }}
                    style={[styles.smallBtn, { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }]}
                  >
                    <Text style={[styles.smallBtnText, { color: colors.textPrimary }]}>Mensaje</Text>
                  </Pressable>
                </>
              }
            />
          ))}
        </ScrollView>
      )}
    </Sheet>
  );
}


/* ── 4. Escanear ── */

export function ScanSheet({ visible, onClose, onDocument, onQr }: {
  visible: boolean; onClose: () => void; onDocument: () => void; onQr: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Sheet visible={visible} onClose={onClose}>
      <SheetHeader title="Escanear" onClose={onClose} />
      <Pressable onPress={() => { onClose(); onDocument(); }} style={[styles.optionRow, { backgroundColor: colors.surface }]}>
        <FileScan size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body }}>Escanear documento</Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>Traducir un documento al español</Text>
        </View>
      </Pressable>
      <Pressable onPress={() => { onClose(); onQr(); }} style={[styles.optionRow, { backgroundColor: colors.surface }]}>
        <QrCode size={18} color={colors.textSecondary} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body }}>Escanear QR de un amigo</Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>Necesita lector de QR y búsqueda por EG-ID (pendiente)</Text>
        </View>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { ...formaHoja },
  handle: { ...formaTirador },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, marginBottom: espaciado.e10 },
  center: { alignItems: 'center', justifyContent: 'center' },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderRadius: radios.full, paddingHorizontal: espaciado.e12, height: 38, marginBottom: espaciado.e10 },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingVertical: espaciado.e10, borderBottomWidth: StyleSheet.hairlineWidth },
  personAvatar: { width: 40, height: 40, borderRadius: 20 },
  badge: { borderRadius: radios.full, minWidth: 18, height: 18, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e5 },
  badgeText: { color: brand.white, fontSize: 10, fontWeight: peso.maximo },
  smallBtn: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, borderRadius: radios.full, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, minWidth: 78, justifyContent: 'center' },
  smallBtnText: { color: brand.white, fontSize: tipografia.caption, fontWeight: peso.maximo },
  check: { width: 24, height: 24, borderRadius: radios.md, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  notice: { borderRadius: radios.md, padding: espaciado.e10, marginBottom: espaciado.e10 },
  titleInput: { borderRadius: radios.md, paddingHorizontal: espaciado.e12, height: 44, fontSize: 14.5, marginBottom: espaciado.e8 },
  primaryBtn: { borderRadius: radios.full, paddingVertical: espaciado.e13, alignItems: 'center', marginTop: espaciado.e12 },
  optionRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, borderRadius: 14, padding: espaciado.e14, marginBottom: espaciado.e8 },
});
