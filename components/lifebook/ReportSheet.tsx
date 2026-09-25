/**
 * ReportSheet — hoja de REPORTAR contenido de Life Book.
 *
 * API (forma del mock del dueño): `post` + `onClose` + `onReport`.
 * Los motivos son los **11 códigos oficiales** que valida el backend
 * (constants/lifebook.ts → `LB_REPORT_REASONS`): enviar una etiqueta en
 * español daría 400 REASON_INVALID.
 * Incluye BLOQUEAR al autor (llamada real a `/users/:id/block`).
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, radios, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { Flag, ShieldAlert, UserX, X } from 'lucide-react-native';
import { LB_REPORT_REASONS } from '../../constants/lifebook';
import { lifebookBlocksApi, type LbPostCard } from '../../api/lifebook';
import { brand } from '@egrouteplan/ui-kit';
import { formaHoja, formaTirador } from './ui/Sheet';

interface Props {
  /** Publicación objetivo; `null` cierra la hoja. */
  post: LbPostCard | null;
  onClose: () => void;
  /** `reason` es el código oficial (p. ej. 'spam'). */
  onReport?: (postId: string, reason: string) => void | Promise<void>;
  /** Se llama tras bloquear correctamente (para refrescar listas). */
  onBlocked?: (authorId: string) => void;
}

export function ReportSheet({ post, onClose, onReport, onBlocked }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [busy, setBusy] = useState(false);

  const pick = async (reason: string) => {
    if (busy || !post) return;
    setBusy(true);
    try {
      await onReport?.(post.id, reason);
      onClose();
    } finally { setBusy(false); }
  };

  const block = async () => {
    const authorId = post?.author?.id;
    if (!authorId || busy) return;
    setBusy(true);
    try {
      await lifebookBlocksApi.block(authorId);
      onClose();
      Alert.alert('Bloqueado', 'Ya no verás su contenido ni podrá escribirte.');
      onBlocked?.(authorId);
    } catch (e) {
      Alert.alert('Bloquear', e instanceof Error ? e.message : 'No se pudo bloquear.');
    } finally { setBusy(false); }
  };

  return (
    <Modal visible={!!post} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 18 }]}>
        <View style={[styles.handle, { backgroundColor: alpha(colors.textPrimary, 0.2) }]} />
        <View style={styles.header}>
          <Flag size={18} color={colors.textPrimary} />
          <Text style={[styles.title, { color: colors.textPrimary }]}>Reportar publicación</Text>
          <Pressable onPress={onClose} hitSlop={10}><X size={20} color={colors.textSecondary} /></Pressable>
        </View>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginBottom: espaciado.e8, paddingHorizontal: espaciado.e2 }}>
          ¿Por qué quieres reportar esto? Lo revisará el equipo de moderación.
        </Text>
        {busy && <ActivityIndicator color={colors.primary} style={{ marginVertical: espaciado.e6 }} />}

        {LB_REPORT_REASONS.map((r) => (
          <Pressable
            key={r.value}
            onPress={() => pick(r.value)}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? alpha(colors.primary, 0.06) : 'transparent' }]}
          >
            <ShieldAlert size={16} color={colors.textSecondary} />
            <Text style={{ color: colors.textPrimary, fontSize: 14.5, fontWeight: peso.medio }}>{r.label}</Text>
          </Pressable>
        ))}

        {post?.author?.id ? (
          <Pressable
            onPress={block}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [styles.blockBtn, { backgroundColor: pressed ? alpha(brand.like, 0.16) : alpha(brand.like, 0.1) }]}
          >
            <UserX size={16} color={brand.like} />
            <Text style={{ color: brand.like, fontWeight: peso.maximo, fontSize: tipografia.body }}>
              Bloquear a {post.author.name}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { ...formaHoja },
  handle: { ...formaTirador },
  header: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, marginBottom: espaciado.e4 },
  title: { fontSize: 17, fontWeight: peso.titulo, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingVertical: espaciado.e12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(128,128,140,0.15)' },
  blockBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e8, borderRadius: radios.md, padding: espaciado.e14, marginTop: espaciado.e12 },
});
