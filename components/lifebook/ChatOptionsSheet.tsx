/**
 * ChatOptionsSheet — hoja «⋯» del hilo de chat (Partes 17–18).
 *
 * Menú:
 *   🔍 Buscar en el historial  → apartados por tipo (fotos y vídeos,
 *      documentos, enlaces y audio, transacciones, ubicación, notas,
 *      productos y tiendas, emoticonos)
 *   🔕 No molestar             → `POST /chat/conversations/:id/prefs`
 *   📌 Fijar arriba            → idem
 *   🎨 Fondo del chat          → idem (`background`)
 *   🧹 Borrar historial        → `DELETE /chat/conversations/:id/messages`
 *   🚨 Reclamación por estafa  → `POST /chat/conversations/:id/claim`
 *   🚫 Bloquear a …            → real (solo en chats 1 a 1)
 *   👥 Miembros / ✏️ Editar / 🚪 Salir  (solo grupos) → GroupMembersSheet
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { alpha, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import {
  Eraser, ImageOff, Lock, LogOut, MoreHorizontal, Palette, Pencil, Search, ShieldAlert, UserX, Users, X,
} from 'lucide-react-native';
import { messagesApi, type LbChatSearchKind, type LbMessage } from '../../api/messages';
import { lifebookBlocksApi } from '../../api/lifebook';
import { absUrl } from '../../api/config';
import { lbTimeAgo } from '../../constants/lifebook';
import { CHAT_BACKGROUNDS, CHAT_SEARCH_TABS, type ChatSearchTab } from '../../constants/lifebook-chat';
import { brand } from '@egrouteplan/ui-kit';
import { formaHoja } from './ui/Sheet';

export interface ChatOptionsState {
  muted: boolean;
  pinned: boolean;
  background: string | null;
}

export function ChatOptionsSheet({
  visible, onClose, convId, isGroup, peerId, peerName, state, myRole,
  onChanged, onOpenMembers, onEditGroup, onLeaveGroup,
}: {
  visible: boolean;
  onClose: () => void;
  convId: string;
  isGroup: boolean;
  peerId?: string | null;
  peerName: string;
  state: ChatOptionsState;
  /** Rol en el grupo (`owner` · `admin` · `member`). */
  myRole?: 'owner' | 'admin' | 'member';
  /** Avisa a la pantalla del chat de lo que cambió (fondo, silencio, fijado, borrado). */
  onChanged: (patch: { muted?: boolean; pinned?: boolean; background?: string | null; cleared?: boolean }) => void;
  onOpenMembers?: () => void;
  onEditGroup?: () => void;
  /** Se llama cuando ya salí del grupo (para cerrar el chat). */
  onLeaveGroup?: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [step, setStep] = useState<'menu' | 'history' | 'background' | 'claim'>('menu');
  const [busy, setBusy] = useState<string | null>(null);
  const [tab, setTab] = useState<LbChatSearchKind>('image');
  const [rows, setRows] = useState<LbMessage[] | null>(null);
  const [note, setNote] = useState('');
  const [viewer, setViewer] = useState<string | null>(null);

  // Cada vez que se abre, vuelve al menú principal.
  useEffect(() => { if (visible) { setStep('menu'); setRows(null); setNote(''); } }, [visible]);

  const currentTab = CHAT_SEARCH_TABS.find((t) => t.kind === tab) ?? CHAT_SEARCH_TABS[0];

  const search = useCallback(async (kind: LbChatSearchKind) => {
    setStep('history');
    setTab(kind);
    setRows(null);
    try {
      const res = await messagesApi.searchChat(convId, kind);
      setRows(res.messages ?? []);
    } catch (e) {
      setRows([]);
      Alert.alert('Historial', e instanceof Error ? e.message : 'No se pudo buscar.');
    }
  }, [convId]);

  const toggle = async (key: 'muted' | 'pinned', value: boolean) => {
    setBusy(key);
    try {
      await messagesApi.chatPrefs(convId, { [key]: value } as { muted?: boolean; pinned?: boolean });
      onChanged({ [key]: value });
    } catch (e) {
      Alert.alert('Ajuste', e instanceof Error ? e.message : 'No se pudo guardar.');
    } finally { setBusy(null); }
  };

  const setBackground = async (id: string) => {
    setBusy('bg');
    const value = id === 'default' ? null : id;
    try {
      await messagesApi.chatPrefs(convId, { background: value });
      onChanged({ background: value });
      setStep('menu');
    } catch (e) {
      Alert.alert('Fondo', e instanceof Error ? e.message : 'No se pudo cambiar el fondo.');
    } finally { setBusy(null); }
  };

  const clearHistory = () => {
    Alert.alert(
      'Borrar historial',
      isGroup
        ? 'Se borrará TU historial de este grupo. Los demás miembros conservan el suyo.'
        : 'Se borrará TU historial de este chat. La otra persona conserva el suyo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar',
          style: 'destructive',
          onPress: async () => {
            setBusy('clear');
            try {
              await messagesApi.clearChat(convId);
              onChanged({ cleared: true });
              Alert.alert('Historial borrado', 'Solo se ha borrado para ti.');
            } catch (e) {
              Alert.alert('Historial', e instanceof Error ? e.message : 'No se pudo borrar.');
            } finally { setBusy(null); }
          },
        },
      ],
    );
  };

  const sendClaim = async () => {
    setBusy('claim');
    try {
      const res = await messagesApi.claim(convId, note.trim() || undefined);
      setStep('menu');
      setNote('');
      Alert.alert(
        res.already ? 'Reclamación ya registrada' : 'Reclamación enviada',
        'Moderación revisará esta conversación. Si hubo un pedido, la reclamación queda ligada a él.',
      );
    } catch (e) {
      Alert.alert('Reclamación', e instanceof Error ? e.message : 'No se pudo enviar.');
    } finally { setBusy(null); }
  };

  const leaveGroup = () => {
    Alert.alert('Salir del grupo', 'Dejarás de recibir sus mensajes. Tu historial se borra solo para ti.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Salir',
        style: 'destructive',
        onPress: async () => {
          setBusy('leave');
          try {
            await messagesApi.leaveGroup(convId);
            onClose();
            onLeaveGroup?.();
          } catch (e) {
            Alert.alert('Salir', e instanceof Error ? e.message : 'No se pudo salir del grupo.');
          } finally { setBusy(null); }
        },
      },
    ]);
  };

  const blockPeer = () => {
    if (!peerId) return;
    Alert.alert('Bloquear', `¿Bloquear a ${peerName}? No podrá escribirte ni verás su contenido.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Bloquear',
        style: 'destructive',
        onPress: async () => {
          try {
            await lifebookBlocksApi.block(peerId);
            onClose();
            Alert.alert('Bloqueado', `${peerName} ya no puede escribirte.`);
          } catch (e) {
            Alert.alert('Bloquear', e instanceof Error ? e.message : 'No se pudo bloquear.');
          }
        },
      },
    ]);
  };

  const title = step === 'history' ? 'Buscar en el historial'
    : step === 'background' ? 'Fondo del chat'
      : step === 'claim' ? 'Reclamación por estafa'
        : 'Opciones del chat';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} />

      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.sheetHeader}>
          {step !== 'menu' ? (
            <Pressable onPress={() => setStep('menu')} hitSlop={10} accessibilityLabel="Volver al menú">
              <Text style={{ color: colors.text.primary, fontWeight: peso.maximo, fontSize: tipografia.body }}>‹ Atrás</Text>
            </Pressable>
          ) : null}
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.subCabecera, fontWeight: peso.titulo, flex: 1 }}>{title}</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar"><X size={20} color={colors.textSecondary} /></Pressable>
        </View>

        {/* ── Menú principal ── */}
        {step === 'menu' ? (
          <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} keyboardShouldPersistTaps="handled">
            <Row icon={<Search size={18} color={colors.text.primary} />} label="Buscar en el historial"
              hint="Fotos, documentos, enlaces, notas…" onPress={() => search(tab)} />
            {/* Parte 30 (Fase 05): buscar en TODOS mis chats a la vez */}
            <Row icon={<Search size={18} color={colors.text.secondary} />} label="Buscar en todos mis chats"
              hint="Encuentra un mensaje aunque no recuerdes dónde"
              onPress={() => { onClose(); router.push('/lifebook-message-search' as never); }} />
            <Row icon={<Lock size={18} color={colors.text.primary} />} label="No molestar"
              hint={state.muted ? 'Silenciado' : 'Avisar de cada mensaje'}
              right={<Switch value={state.muted} disabled={busy === 'muted'} onValueChange={(v) => toggle('muted', v)} />} />
            <Row icon={<MoreHorizontal size={18} color={colors.text.primary} />} label="Fijar chat arriba"
              hint={state.pinned ? 'Está arriba en Mensajes' : 'Ordenar por fecha'}
              right={<Switch value={state.pinned} disabled={busy === 'pinned'} onValueChange={(v) => toggle('pinned', v)} />} />
            <Row icon={<Palette size={18} color={colors.text.primary} />} label="Establecer el fondo del chat"
              hint={CHAT_BACKGROUNDS.find((b) => b.id === (state.background ?? 'default'))?.label ?? 'Predeterminado'}
              onPress={() => setStep('background')} />
            <Row icon={<Eraser size={18} color={colors.text.primary} />} label="Borrar el historial de chat"
              hint="Solo para ti" onPress={clearHistory} />
            <Row icon={<ShieldAlert size={18} color={brand.warningPressed} />} label="Reclamaciones en caso de estafa"
              hint="Avisa a moderación de esta conversación" onPress={() => setStep('claim')} />

            {isGroup ? (
              <>
                <Row icon={<Users size={18} color={colors.text.primary} />} label="Miembros del grupo"
                  hint="Añadir, expulsar y ver roles" onPress={() => { onClose(); onOpenMembers?.(); }} />
                {myRole === 'owner' || myRole === 'admin' ? (
                  <Row icon={<Pencil size={18} color={colors.text.primary} />} label="Editar grupo"
                    hint="Nombre, foto y componentes permitidos" onPress={() => { onClose(); onEditGroup?.(); }} />
                ) : null}
                <Row icon={<LogOut size={18} color={colors.text.danger} />} label="Salir del grupo"
                  hint={myRole === 'owner' ? 'Solo elige otro dueño para salir' : 'Dejarás de recibir mensajes'}
                  onPress={myRole === 'owner' ? undefined : leaveGroup}
                  right={busy === 'leave' ? <ActivityIndicator size="small" color={colors.text.danger} /> : undefined}
                  danger />
              </>
            ) : peerId ? (
              <Row icon={<UserX size={18} color={colors.text.danger} />} label={`Bloquear a ${peerName}`}
                hint="No podrá escribirte ni verás su contenido" danger onPress={blockPeer} />
            ) : null}
          </ScrollView>
        ) : null}

        {/* ── Historial por tipo ── */}
        {step === 'history' ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: espaciado.e8, paddingBottom: espaciado.e10 }}>
              {CHAT_SEARCH_TABS.map((t) => {
                const on = t.kind === tab;
                return (
                  <Pressable
                    key={t.kind}
                    onPress={() => search(t.kind)}
                    accessibilityLabel={t.label}
                    style={[styles.chip, { backgroundColor: on ? colors.primary : alpha(colors.primary, 0.1) }]}
                  >
                    <Text style={{ color: on ? brand.white : colors.text.primary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>
                      {t.icon} {t.label}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <HistoryList tab={currentTab} rows={rows} colors={colors} onOpenImage={setViewer} />
          </>
        ) : null}

        {/* ── Fondo del chat ── */}
        {step === 'background' ? (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginBottom: espaciado.e10 }}>
              El fondo es solo para ti: la otra persona no lo ve.
            </Text>
            <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
              {CHAT_BACKGROUNDS.map((b) => {
                const on = (state.background ?? 'default') === b.id;
                return (
                  <Pressable
                    key={b.id}
                    onPress={() => setBackground(b.id)}
                    disabled={busy === 'bg'}
                    accessibilityLabel={`Fondo ${b.label}`}
                    style={[styles.bgRow, { borderColor: on ? colors.primary : alpha(colors.border, 0.6) }]}
                  >
                    <View style={[styles.bgSwatch, { backgroundColor: b.base || colors.surface, borderColor: alpha(colors.border, 0.8) }]}>
                      {b.accent ? <View style={[styles.bgAccent, { backgroundColor: b.accent }]} /> : null}
                    </View>
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: on ? peso.titulo : peso.medio, flex: 1 }}>{b.label}</Text>
                    {on ? <Text style={{ color: colors.text.primary, fontWeight: peso.titulo }}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </>
        ) : null}

        {/* ── Reclamación por estafa ── */}
        {step === 'claim' ? (
          <>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginBottom: espaciado.e10 }}>
              Cuéntale a moderación qué pasó (dinero, pedido, engaño). Si hay un pedido entre
              vosotros, la reclamación se enlaza automáticamente.
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="Ej.: pagué 25.000 XAF por un móvil y no lo envió…"
              placeholderTextColor={colors.textSecondary}
              multiline
              maxLength={300}
              style={[styles.noteInput, { backgroundColor: colors.surface, color: colors.textPrimary }]}
            />
            <Pressable
              onPress={sendClaim}
              disabled={busy === 'claim'}
              accessibilityLabel="Enviar reclamación"
              style={[styles.primaryBtn, { backgroundColor: busy === 'claim' ? alpha(colors.primary, 0.5) : colors.primary }]}
            >
              {busy === 'claim'
                ? <ActivityIndicator size="small" color={brand.white} />
                : <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: tipografia.fino }}>Enviar reclamación</Text>}
            </Pressable>
          </>
        ) : null}
      </View>

      {/* Visor de la foto elegida en el historial */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)} statusBarTranslucent>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' }}
          onPress={() => setViewer(null)} accessibilityLabel="Cerrar foto">
          {viewer ? <Image source={{ uri: viewer }} style={{ width: '92%', height: '70%' }} resizeMode="contain" /> : null}
        </Pressable>
      </Modal>
    </Modal>
  );
}

/* ── Fila del menú ── */
function Row({ icon, label, hint, right, onPress, danger }: {
  icon: React.ReactNode; label: string; hint?: string; right?: React.ReactNode;
  onPress?: () => void; danger?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed && onPress ? alpha(colors.primary, 0.06) : 'transparent' }]}
    >
      <View style={[styles.rowIcon, { backgroundColor: alpha(danger ? colors.danger : colors.primary, 0.12) }]}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: danger ? colors.text.danger : colors.textPrimary, fontSize: tipografia.fino, fontWeight: peso.fuerte }}>{label}</Text>
        {hint ? <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 1 }}>{hint}</Text> : null}
      </View>
      {right ?? null}
    </Pressable>
  );
}

/* ── Lista de resultados del historial ── */
function HistoryList({ tab, rows, colors, onOpenImage }: {
  tab: ChatSearchTab; rows: LbMessage[] | null; colors: any; onOpenImage: (url: string) => void;
}) {
  if (rows === null) return <ActivityIndicator color={colors.text.primary} style={{ marginVertical: espaciado.e24 }} />;
  if (rows.length === 0) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: espaciado.e26, gap: espaciado.e6 }}>
        <ImageOff size={22} color={colors.textSecondary} />
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, textAlign: 'center' }}>{tab.empty}</Text>
        {tab.soon ? (
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center' }}>
            «Por agregar» junto a los componentes de grupo (Fases G2–G4).
          </Text>
        ) : null}
      </View>
    );
  }
  return (
    <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
      {rows.map((m) => {
        const who = m.fromMe ? 'Tú' : (m.author?.name ?? 'Alguien');
        return (
          <Pressable
            key={m.id}
            disabled={!m.imageUrl}
            onPress={() => { if (m.imageUrl) onOpenImage(absUrl(m.imageUrl)); }}
            style={[styles.histRow, { borderBottomColor: alpha(colors.border, 0.5) }]}
          >
            {m.imageUrl ? (
              <Image source={{ uri: absUrl(m.imageUrl) }} style={styles.histThumb} />
            ) : (
              <View style={[styles.histThumb, styles.center, { backgroundColor: alpha(colors.primary, 0.1) }]}>
                <Text style={{ fontSize: tipografia.subtitle }}>{tab.icon}</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.fuerte }} numberOfLines={2}>
                {m.fileRef?.name ?? m.postRef?.title ?? m.text ?? tab.label}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e2 }}>
                {who} · {lbTimeAgo(m.createdAt)}
                {m.postRef?.priceXaf ? ` · ${m.postRef.priceXaf.toLocaleString('fr-FR')} XAF` : ''}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { ...formaHoja, maxHeight: '84%' },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, marginBottom: espaciado.e8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, borderRadius: radios.campo, paddingVertical: espaciado.e9, paddingHorizontal: espaciado.e8 },
  rowIcon: { width: 34, height: 34, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', borderRadius: radios.full, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7 },
  bgRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, borderWidth: trazo.base, borderRadius: radios.campo, padding: espaciado.e10, marginBottom: espaciado.e8 },
  bgSwatch: { width: 40, height: 40, borderRadius: radios.chip, borderWidth: trazo.fino, overflow: 'hidden' },
  bgAccent: { position: 'absolute', right: -10, bottom: -10, width: 34, height: 34, borderRadius: radios.full, opacity: 0.8 },
  noteInput: { borderRadius: radios.campo, minHeight: 96, padding: espaciado.e12, fontSize: tipografia.body, textAlignVertical: 'top' },
  primaryBtn: { borderRadius: radios.full, paddingVertical: espaciado.e13, alignItems: 'center', marginTop: espaciado.e14 },
  histRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingVertical: espaciado.e9, borderBottomWidth: StyleSheet.hairlineWidth },
  histThumb: { width: 46, height: 46, borderRadius: radios.sm },
  center: { alignItems: 'center', justifyContent: 'center' },
});
