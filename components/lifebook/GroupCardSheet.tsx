/**
 * GroupCardSheet — Parte 27 (Fase G3): la FICHA de un grupo antes de entrar.
 *
 * Enseña lo que hace falta para decidir (foto, nombre, ciudad/categoría,
 * descripción, tema, cuántos son, quiénes están y el organizador) y el botón
 * para unirse, que se comporta según la condición de ingreso:
 *  · `open`     → «Unirse» entra al momento.
 *  · `approval` → deja una **solicitud** («Solicitud enviada · esperando»).
 *  · `question` → pide la respuesta a la pregunta del organizador.
 * Si ya soy miembro, el botón abre el chat.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, radios, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { Check, Clock, LogIn, ShieldQuestion, Users, X } from 'lucide-react-native';
import { absUrl } from '../../api/config';
import { lifebookGroupsApi, type LbGroupCard } from '../../api/lifebook';
import type { LbGroupCardConEnlace } from '../../api/lifebookGrupos';
import { gruposEnlacesApi } from '../../api/lifebookGrupos';
import { formaHoja } from './ui/Sheet';

interface Props {
  visible: boolean;
  group: LbGroupCard | null;
  onClose: () => void;
  /** Me he unido (o ya era miembro) → abrir el chat. */
  onJoined: (groupId: string) => void;
  /** La solicitud cambió (para refrescar la lista). */
  onChanged?: () => void;
  /**
   * El CÓDIGO del enlace por el que se ha llegado aquí, si se ha llegado por uno (el del
   * perfil, el QR, o uno que te hayan pasado). Se manda al unirse para que el servidor
   * gaste una de las entradas del enlace y respete su tope. Si se entra desde la lista de
   * Descubrir grupos, no hay código y no se gasta nada.
   */
  code?: string;
}

export function GroupCardSheet({ visible, group, onClose, onJoined, onChanged, code }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [answer, setAnswer] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pedido, setPedido] = useState(false);

  React.useEffect(() => {
    if (!visible) return;
    setAnswer(''); setNote(''); setError(null); setPedido(false);
  }, [visible, group?.id]);

  if (!group) return null;

  const soyMiembro = !!group.myRole;
  const pendiente = pedido || group.requestState === 'pending';
  const rechazado = group.requestState === 'rejected';

  /**
   * Lo que se sabe del ENLACE por el que se ha llegado (`invite` viene del servidor solo
   * cuando se ha resuelto un código). Con el enlace GASTADO no se deja entrar desde aquí:
   * el servidor lo rechazaría igual (400) y, si la app lo intentara sin el código, estaría
   * saltándose a la espalda del dueño el tope que él puso.
   */
  const invitacion = (group as LbGroupCardConEnlace).invite;
  const enlaceAgotado = !!code && !!invitacion && invitacion.usesLeft === 0;

  const unirse = async (withAnswer: boolean) => {
    setError(null);
    setBusy(true);
    try {
      const extra = withAnswer ? { answer: answer.trim() || undefined, note: note.trim() || undefined } : {};
      // `gruposEnlacesApi.unirse` es la misma ruta que `lifebookGroupsApi.join`, pero
      // admite el `code` (el tipo de `api/lifebook.ts` no, y ese fichero no se toca).
      const res = code
        ? await gruposEnlacesApi.unirse(group.id, { ...extra, code })
        : await lifebookGroupsApi.join(group.id, extra);
      if (res.joined) { onJoined(group.id); onClose(); return; }
      setPedido(true);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la solicitud.');
    } finally { setBusy(false); }
  };

  const cancelar = async () => {
    setBusy(true);
    try {
      await lifebookGroupsApi.cancelJoin(group.id);
      setPedido(false);
      onChanged?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cancelar.');
    } finally { setBusy(false); }
  };

  const etiquetaIngreso = group.joinMode === 'open'
    ? 'Entrada libre'
    : group.joinMode === 'approval' ? 'Con aprobación del organizador' : 'Pregunta de ingreso';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: peso.titulo, flex: 1 }}>Ficha del grupo</Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
            <X size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView style={{ maxHeight: 460 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', gap: espaciado.e12, alignItems: 'center' }}>
            {group.photoUrl ? (
              <Image source={{ uri: absUrl(group.photoUrl) }} style={styles.photo} />
            ) : (
              <View style={[styles.photo, styles.center, { backgroundColor: alpha(colors.primary, 0.15) }]}>
                <Text style={{ color: colors.primary, fontWeight: peso.titulo, fontSize: tipografia.title }}>
                  {(group.title || '?').trim().charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.subtitle }} numberOfLines={2}>{group.title}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, marginTop: espaciado.e4 }}>
                <Users size={13} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{group.membersCount} miembros</Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>
                {[group.city, group.barrio, group.category].filter(Boolean).join(' · ') || 'Sin ubicación'}
              </Text>
            </View>
          </View>

          {group.topic ? (
            <View style={[styles.chipRow, { backgroundColor: alpha(colors.primary, 0.08), marginTop: espaciado.e12 }]}>
              <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>📌 {group.topic}</Text>
            </View>
          ) : null}

          {group.description ? (
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, lineHeight: 19, marginTop: espaciado.e12 }}>{group.description}</Text>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, marginTop: espaciado.e12 }}>
            {group.joinMode === 'open'
              ? <LogIn size={14} color={colors.textSecondary} />
              : group.joinMode === 'approval' ? <Clock size={14} color={colors.textSecondary} /> : <ShieldQuestion size={14} color={colors.textSecondary} />}
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{etiquetaIngreso}</Text>
          </View>

          {/* Entradas del enlace: solo se sabe cuando se ha llegado CON un código. Si el
              enlace tiene tope se dice cuántas quedan; si no tiene, no se dice nada (no
              hay nada que contar). */}
          {invitacion && invitacion.usesLeft !== null ? (
            <Text style={{ color: invitacion.usesLeft === 0 ? colors.danger : colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e6 }}>
              {invitacion.usesLeft === 0
                ? 'Este enlace ya no admite a más gente'
                : `Quedan ${invitacion.usesLeft} entrada${invitacion.usesLeft === 1 ? '' : 's'} por este enlace`}
              {invitacion.expiresAt ? ` · caduca el ${new Date(invitacion.expiresAt).toLocaleDateString()}` : ''}
            </Text>
          ) : null}

          {group.placeName ? (
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e6 }}>📍 Punto de encuentro: {group.placeName}</Text>
          ) : null}

          {group.ownerName ? (
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e6 }}>👑 Organiza {group.ownerName}</Text>
          ) : null}

          {(group.members ?? []).length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6, marginTop: espaciado.e12 }}>
              {(group.members ?? []).map((m) => (
                <View key={m.id} style={[styles.memberChip, { backgroundColor: colors.surface }]}>
                  {m.avatarUrl ? (
                    <Image source={{ uri: absUrl(m.avatarUrl) }} style={styles.memberAvatar} />
                  ) : (
                    <View style={[styles.memberAvatar, { backgroundColor: alpha(colors.primary, 0.18) }]} />
                  )}
                  <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte }} numberOfLines={1}>
                    {(m.fullName ?? 'Usuario').split(' ')[0]}{m.role === 'owner' ? ' 👑' : ''}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* Pregunta de ingreso */}
          {!soyMiembro && group.joinMode === 'question' && group.joinQuestion && !pendiente ? (
            <View style={{ marginTop: espaciado.e14 }}>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>PREGUNTA DEL ORGANIZADOR</Text>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, marginTop: espaciado.e4 }}>{group.joinQuestion}</Text>
              <TextInput
                value={answer}
                onChangeText={(v) => { setAnswer(v); setError(null); }}
                placeholder="Tu respuesta"
                placeholderTextColor={colors.textSecondary}
                maxLength={200}
                accessibilityLabel="Respuesta a la pregunta de ingreso"
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, marginTop: espaciado.e8 }]}
              />
            </View>
          ) : null}

          {!soyMiembro && pendiente ? (
            <View style={[styles.stateBox, { backgroundColor: alpha(colors.secondary, 0.10), borderColor: alpha(colors.secondary, 0.3) }]}>
              <Clock size={16} color={colors.secondary} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body }}>Solicitud enviada</Text>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
                  El organizador la revisará y te avisará cuando te acepte.
                </Text>
              </View>
            </View>
          ) : null}

          {!soyMiembro && rechazado && !pendiente ? (
            <View style={[styles.stateBox, { backgroundColor: alpha(colors.danger, 0.08), borderColor: alpha(colors.danger, 0.3) }]}>
              <X size={16} color={colors.danger} />
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.caption, flex: 1 }}>
                El organizador no aceptó tu solicitud. Puedes volver a intentarlo.
              </Text>
            </View>
          ) : null}

          {error ? <Text style={{ color: colors.danger, fontSize: tipografia.caption, marginTop: espaciado.e10 }}>{error}</Text> : null}
        </ScrollView>

        {/* Botón según el estado */}
        {soyMiembro ? (
          <Pressable
            onPress={() => { onJoined(group.id); onClose(); }}
            accessibilityLabel={`Abrir el chat de ${group.title}`}
            style={[styles.cta, { backgroundColor: colors.primary }]}
          >
            <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: 15 }}>Abrir el chat</Text>
          </Pressable>
        ) : enlaceAgotado && !pendiente ? (
          /* El enlace ya ha dado todas las entradas que el dueño permitió. Se dice claro y
             no se deja entrar desde aquí: es lo mismo que hace el servidor. */
          <View
            accessibilityLabel="Este enlace ya no admite a más gente"
            style={[styles.cta, { backgroundColor: alpha(colors.textSecondary, 0.12) }]}
          >
            <Text style={{ color: colors.textSecondary, fontWeight: peso.titulo, fontSize: tipografia.body, textAlign: 'center' }}>
              Este enlace ya no admite a más gente
            </Text>
          </View>
        ) : pendiente ? (
          <Pressable onPress={cancelar} disabled={busy} accessibilityLabel="Cancelar mi solicitud"
            style={[styles.cta, { backgroundColor: alpha(colors.textSecondary, 0.12) }]}>
            {busy ? <ActivityIndicator size="small" color={colors.textSecondary} /> : (
              <Text style={{ color: colors.textSecondary, fontWeight: peso.titulo, fontSize: tipografia.body }}>Cancelar la solicitud</Text>
            )}
          </Pressable>
        ) : group.joinMode === 'question' && group.joinQuestion ? (
          <Pressable onPress={() => unirse(true)} disabled={busy} accessibilityLabel="Enviar mi respuesta y unirme"
            style={[styles.cta, { backgroundColor: colors.primary }]}>
            {busy ? <ActivityIndicator size="small" color={brand.white} /> : (
              <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: 15 }}>Enviar respuesta y unirme</Text>
            )}
          </Pressable>
        ) : (
          <Pressable onPress={() => unirse(false)} disabled={busy} accessibilityLabel={`Unirme a ${group.title}`}
            style={[styles.cta, { backgroundColor: colors.primary }]}>
            {busy ? <ActivityIndicator size="small" color={brand.white} /> : (
              <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: 15 }}>
                {group.joinMode === 'approval' ? 'Pedir entrar' : 'Unirme'}
              </Text>
            )}
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

/** Marca de «ya dentro» reutilizable (la usa la lista de descubrimiento). */
export function JoinedBadge({ colors, label }: { colors: any; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 }}>
      <Check size={13} color={colors.primary} />
      <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { ...formaHoja },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: espaciado.e10 },
  photo: { width: 56, height: 56, borderRadius: 14 },
  center: { alignItems: 'center', justifyContent: 'center' },
  chipRow: { borderRadius: 10, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e8 },
  input: { borderRadius: radios.md, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10, fontSize: tipografia.body },
  memberChip: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, borderRadius: radios.full, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e4 },
  memberAvatar: { width: 18, height: 18, borderRadius: 9 },
  stateBox: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, borderWidth: 1, borderRadius: radios.md, padding: espaciado.e10, marginTop: espaciado.e12 },
  cta: { marginTop: espaciado.e14, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingVertical: espaciado.e14 },
});
