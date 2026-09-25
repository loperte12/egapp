/**
 * EditProfileModal — editor de perfil (nombre + foto de avatar con guardado
 * real PATCH /auth/me). Reutilizable desde Perfil y Editar perfil.
 * 2026-09-09: la galería/cámara usan core/pickImage (sin base64 inline; el
 * botón muestra "Procesando…" con spinner mientras se lee la imagen).
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { X } from 'lucide-react-native';
import { alpha, espaciado, FormField, GhostButton, PrimaryButton, tipografia, useTheme, peso, trazo, radios} from '@egrouteplan/ui-kit';
import { authApi, type MeProfile } from '../api/auth';
import { absUrl } from '../api/config';
import { pickImageFromCamera, pickImageFromLibrary } from '../core/pickImage';

type Picking = 'library' | 'camera' | null;

export default function EditProfileModal({ visible, profile, onClose, onSaved }: {
  visible: boolean;
  profile: MeProfile;
  onClose: () => void;
  onSaved: (p: MeProfile) => void;
}) {
  const { colors } = useTheme();
  const [name, setName] = useState(profile.fullName ?? '');
  const [avatar, setAvatar] = useState<string | null>(null); // nueva foto (dataURL)
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState<Picking>(null);
  const [error, setError] = useState<string | null>(null);

  // Cada vez que se abre con un perfil distinto, sincroniza el formulario.
  useEffect(() => {
    if (visible) {
      setName(profile.fullName ?? '');
      setAvatar(null);
      setError(null);
      setPicking(null);
    }
  }, [visible, profile]);

  const pickFromLibrary = async () => {
    setError(null);
    setPicking('library');
    try {
      const img = await pickImageFromLibrary();
      if (img) { setAvatar(img.dataUrl); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la galería');
    } finally {
      setPicking(null);
    }
  };

  const pickFromCamera = async () => {
    setError(null);
    setPicking('camera');
    try {
      const img = await pickImageFromCamera();
      if (img) { setAvatar(img.dataUrl); }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir la cámara');
    } finally {
      setPicking(null);
    }
  };

  const save = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 3) { setError('El nombre debe tener al menos 3 caracteres'); return; }
    setBusy(true); setError(null);
    try {
      const next = await authApi.updateMe({ fullName: trimmed, ...(avatar ? { avatar } : {}) });
      onSaved(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar. Inténtalo de nuevo');
    } finally {
      setBusy(false);
    }
  };

  const preview = avatar ?? (profile.avatarUrl ? absUrl(profile.avatarUrl) : null);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={[styles.modalCard, { backgroundColor: colors.card }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>Editar perfil</Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Avatar: foto actual o inicial */}
          <View style={styles.avatarEditRow}>
            <View style={[styles.avatarLg, { backgroundColor: alpha(colors.primary, 0.15) }]}>
              {preview ? (
                <Image source={{ uri: preview }} style={styles.avatarLgImg} />
              ) : (
                <Text style={[styles.avatarLgText, { color: colors.primary }]}>
                  {(profile.fullName ?? 'U').trim().charAt(0).toUpperCase() || 'U'}
                </Text>
              )}
            </View>
            <View style={{ flex: 1, gap: espaciado.e8 }}>
              <Pressable
                onPress={pickFromCamera}
                disabled={busy || picking !== null}
                accessibilityRole="button"
                accessibilityLabel="Tomar foto con la cámara"
                style={[styles.pickBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: busy || (picking !== null && picking !== 'camera') ? 0.45 : 1 }]}
              >
                {picking === 'camera'
                  ? <View style={styles.pickBusy}><ActivityIndicator color={colors.primary} size="small" /><Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.maximo }}>Procesando…</Text></View>
                  : <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.maximo }}>📷 Tomar foto</Text>}
              </Pressable>
              <Pressable
                onPress={pickFromLibrary}
                disabled={busy || picking !== null}
                accessibilityRole="button"
                accessibilityLabel="Elegir desde la galería"
                style={[styles.pickBtn, { backgroundColor: colors.surface, borderColor: colors.border, opacity: busy || (picking !== null && picking !== 'library') ? 0.45 : 1 }]}
              >
                {picking === 'library'
                  ? <View style={styles.pickBusy}><ActivityIndicator color={colors.primary} size="small" /><Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.maximo }}>Procesando…</Text></View>
                  : <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.maximo }}>🖼️ Desde galería</Text>}
              </Pressable>
            </View>
          </View>
          <Text style={[styles.avatarHint, { color: colors.textSecondary }]}>
            {avatar ? 'Foto nueva elegida. Guarda para aplicarla.' : 'Tu foto se mostrará en tu perfil.'}
          </Text>

          <FormField
            label="Nombre"
            placeholder="Tu nombre completo"
            value={name}
            onChangeText={setName}
            maxLength={120}
            editable={!busy}
          />

          {error ? <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{error}</Text> : null}

          <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e4 }}>
            <View style={{ flex: 1 }}>
              <GhostButton title="Cancelar" onPress={onClose} disabled={busy} />
            </View>
            <View style={{ flex: 1.4 }}>
              <PrimaryButton title={busy ? 'Guardando…' : 'Guardar cambios'} onPress={save} loading={busy} />
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  modalCard: { borderTopLeftRadius: radios.marco, borderTopRightRadius: radios.marco, padding: espaciado.e20, paddingBottom: espaciado.e30, gap: espaciado.e14 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { fontSize: 17, fontWeight: peso.titulo },
  avatarEditRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e14 },
  avatarLg: { width: 82, height: 82, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarLgImg: { width: '100%', height: '100%' },
  avatarLgText: { fontSize: 32, fontWeight: peso.titulo },
  avatarHint: { fontSize: tipografia.caption, fontWeight: peso.medio },
  pickBtn: { borderRadius: 14, borderWidth: trazo.fino, alignItems: 'center', justifyContent: 'center', paddingVertical: espaciado.e12, minHeight: 44 },
  pickBusy: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 },
});
