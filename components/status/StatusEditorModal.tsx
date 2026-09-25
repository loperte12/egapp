/**
 * StatusEditorModal — publicar / cambiar / quitar el ESTADO 24H.
 * Contenido: selector de preset (emoji+etiqueta, filtrado por roles
 * verificados del usuario) → línea corta (máx 40) → imagen opcional (pickImage
 * con compresión ligera) → visibilidad (Todos/Seguidores/Solo yo) → enlace a
 * servicio (solo roles verificados) → Publicar / Quitar.
 * Nota fija: "Visible durante 24 horas".
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';import { Check, Clock, ImagePlus, Link2, Lock, Globe, Users, Trash2, X } from 'lucide-react-native';
import { alpha, brand, espaciado, radios, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import type { UserStatus } from '../../api/status';
import { STATUS_TEXT_MAX, VISIBILITY_OPTIONS } from '../../constants/status';
import { statusBgColors } from '../../constants/status';
import { useStatusStore } from '../../state/statusStore';
import { pickImagesFromLibrary } from '../../core/pickImage';
import type { StatusPreset } from '../../api/status';

const LINK_LABEL: Record<string, string> = {
  taxi: '🚕 Taxi',
  intercity: '🛣️ Ciudad a Ciudad',
  food: '🍽️ Mi restaurante',
  ecomerse: '🛒 Mi tienda',
  rental: '🏠 Mi anuncio',
  work: '💼 Mi oferta',
  lifebook: '📖 Life Book',
};

export default function StatusEditorModal({
  visible,
  onClose,
  onSaved,
}: {
  visible: boolean;
  onClose: () => void;
  onSaved?: (st: UserStatus) => void;
}) {
  const { colors } = useTheme();
  const { presets, capabilities, status: currentStatus, publish, end, draft, saveDraft, clearDraft } = useStatusStore();

  const [presetCode, setPresetCode] = useState('feeling_good');
  const [text, setText] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'private'>('public');
  const [linkType, setLinkType] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al abrir: restaura borrador (si lo hay) o el estado ACTUAL (si existe) o
  // valores por defecto. Las fotos del borrador se restauran; las del estado
  // actual publicado no se reenvían (solo si el usuario elige otras).
  useEffect(() => {
    if (!visible) return;
    setError(null); setBusy(false);
    if (draft) {
      setPresetCode(draft.presetCode);
      setText(draft.text);
      setVisibility(draft.visibility);
      setPhotos(draft.mediaBase64s ?? []);
      setLinkType(null);
    } else if (currentStatus) {
      setPresetCode(currentStatus.preset.code);
      setText(currentStatus.text);
      setVisibility(currentStatus.visibility);
      setPhotos([]);
      setLinkType(currentStatus.link?.type ?? null);
    } else {
      setText('');
      setVisibility('public');
      setPhotos([]);
      setLinkType(null);
    }
  }, [visible, draft, currentStatus]);

  // Presets permitidos según roles verificados del usuario.
  const allowed = useMemo(() => {
    const v = capabilities?.verified ?? [];
    const base = capabilities?.role ?? 'PASSENGER';
    const myRoles = [base, ...v];
    return presets.filter((p) => {
      const roles = p.roles ?? [];
      if (!roles.length) return true;
      return roles.some((r) => myRoles.includes(r) || r === 'PASSENGER');
    });
  }, [presets, capabilities]);

  const preset = presets.find((p) => p.code === presetCode);
  const [c1] = statusBgColors(preset?.bg ?? 'ocean');

  /** Resuelve plantillas del preset ({ciudad}) con la ciudad del usuario. */
  const labelFor = (p: StatusPreset) => {
    const city = capabilities?.city ?? 'Malabo';
    return String(p.label).replace(/\{ciudad\}/g, city).replace(/\{zona\}/g, city).replace(/\{barrio\}/g, city);
  };

  const MAX_PHOTOS = 4;
  const pickImages = async () => {
    try {
      const remaining = MAX_PHOTOS - photos.length;
      if (remaining <= 0) { Alert.alert('Límite', `Puedes añadir hasta ${MAX_PHOTOS} fotos.`); return; }
      const imgs = await pickImagesFromLibrary(remaining);
      const valid = imgs.filter((img) => img.dataUrl.length <= 4_000_000);
      if (valid.length !== imgs.length) Alert.alert('Imagen grande', 'Alguna foto superaba ~3 MB y se omitió.');
      setPhotos((prev) => [...prev, ...valid.map((i) => i.dataUrl)].slice(0, MAX_PHOTOS));
    } catch {
      Alert.alert('Error', 'No se pudo leer la imagen.');
    }
  };
  const removePhoto = (idx: number) => setPhotos((prev) => prev.filter((_, i) => i !== idx));

  const saveDraftNow = (pc = presetCode, tx = text, vis = visibility) => {
    saveDraft({ presetCode: pc, text: tx, visibility: vis, mediaBase64s: photos }).catch(() => {});
  };

  const doPublish = async () => {
    if (busy) return;
    if (!presetCode) { setError('Elige un estado.'); return; }
    setBusy(true); setError(null);
    try {
      const st = await publish({
        presetCode,
        text: text.trim().slice(0, STATUS_TEXT_MAX) || undefined,
        media: photos.length ? photos : undefined,
        visibility,
        linkType: linkType ?? undefined,
      });
      await clearDraft();
      onSaved?.(st);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar el estado');
      saveDraftNow();
    } finally {
      setBusy(false);
    }
  };

  const doEnd = async () => {
    if (busy) return;
    Alert.alert('Quitar estado', '¿Quitar tu estado? Desaparecerá para todos.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Quitar', style: 'destructive',
        onPress: async () => {
          setBusy(true); setError(null);
          try {
            await end();
            await clearDraft();
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'No se pudo quitar el estado');
          } finally { setBusy(false); }
        },
      },
    ]);
  };

  const showDraftPrompt = () => {
    if (!draft) return;
    Alert.alert('Borrador', 'Tienes un borrador sin publicar. ¿Continuar?', [
      { text: 'Descartar', style: 'destructive', onPress: () => { clearDraft().catch(() => {}); setText(''); setPhotos([]); } },
      { text: 'Continuar', style: 'default' },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.card, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Mi estado 24h</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Cerrar" style={styles.close}>
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
          <View style={styles.noteRow}>
            <Clock size={13} color={colors.textSecondary} />
            <Text style={[styles.note, { color: colors.textSecondary }]}>Visible durante 24 horas</Text>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Vista previa: con fotos → primera imagen COMPLETA (proporción
                real) con la línea; sin fotos → emoji + línea. */}
            {preset && (
              <View style={[styles.previewWrap, { borderColor: alpha(c1, 0.4) }]}>
                {photos[0] ? (
                  <PreviewPhoto uri={photos[0]} />
                ) : null}
                <View style={[styles.preview, { backgroundColor: alpha(c1, 0.10) }]}>
                  {!photos.length ? <Text style={styles.previewEmoji}>{preset.emoji}</Text> : null}
                  <Text style={[styles.previewText, { color: colors.textPrimary }]} numberOfLines={2}>
                    {text.trim() || labelFor(preset)}
                  </Text>
                  {photos.length ? (
                    <Text style={[styles.previewBadge, { color: colors.textSecondary }]}>📷 {photos.length} foto{photos.length > 1 ? 's' : ''} se verá completa</Text>
                  ) : null}
                </View>
              </View>
            )}

            {/* Selector de presets */}
            <Text style={[styles.section, { color: colors.textSecondary }]}>QUÉ ESTÁS HACIENDO</Text>
            <View style={styles.grid}>
              {allowed.map((p) => {
                const active = p.code === presetCode;
                const [a, b] = statusBgColors(p.bg);
                return (
                  <Pressable
                    key={p.code}
                    onPress={() => { setPresetCode(p.code); saveDraftNow(p.code, text, visibility); }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={`${p.emoji} ${labelFor(p)}`}
                    style={[styles.presetCell, { borderColor: active ? colors.primary : colors.border, backgroundColor: colors.surface }]}
                  >
                    <View style={[styles.presetEmojiWrap, { backgroundColor: active ? alpha(a, 0.16) : 'transparent' }]}>
                      <Text style={styles.presetEmoji}>{p.emoji}</Text>
                    </View>
                    <Text style={[styles.presetLabel, { color: active ? colors.primary : colors.textPrimary }]} numberOfLines={2}>{labelFor(p)}</Text>
                    {active && <Check size={12} color={colors.primary} style={styles.presetCheck} />}
                  </Pressable>
                );
              })}
            </View>
            {allowed.length === 0 && (
              <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>No hay estados disponibles para tu perfil.</Text>
            )}

            {/* Línea corta */}
            <Text style={[styles.section, { color: colors.textSecondary }]}>FRASE (OPCIONAL)</Text>
            <TextInput
              value={text}
              onChangeText={(t) => { setText(t); saveDraftNow(presetCode, t, visibility); }}
              maxLength={STATUS_TEXT_MAX}
              placeholder="¿Qué estás haciendo?"
              placeholderTextColor={colors.textSecondary}
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary }]}
            />
            <Text style={[styles.counter, { color: colors.textSecondary }]}>{text.length}/{STATUS_TEXT_MAX}</Text>

            {/* Fotos opcionales (galería hasta 4) */}
            <Text style={[styles.section, { color: colors.textSecondary }]}>FOTOS (HASTA {MAX_PHOTOS}, OPCIONAL)</Text>
            <View style={styles.photoGrid}>
              {photos.map((p, idx) => (
                <View key={`${idx}-${p.slice(0, 12)}`} style={styles.photoCell}>
                  <Image source={{ uri: p }} style={styles.imgThumb} />
                  <Pressable onPress={() => removePhoto(idx)} accessibilityRole="button" accessibilityLabel={`Quitar foto ${idx + 1}`} style={styles.removeImg}>
                    <X size={13} color={brand.white} />
                  </Pressable>
                  {idx === 0 ? <Text style={styles.firstBadge}>1ª</Text> : null}
                </View>
              ))}
              {photos.length < MAX_PHOTOS ? (
                <Pressable onPress={pickImages} accessibilityRole="button" accessibilityLabel="Añadir fotos" style={[styles.addImg, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <ImagePlus size={16} color={colors.textSecondary} />
                  <Text style={[styles.addImgTxt, { color: colors.textSecondary }]}>Añadir {photos.length ? 'más' : 'fotos'}</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Visibilidad */}
            <Text style={[styles.section, { color: colors.textSecondary }]}>QUIÉN LO VE</Text>
            <View style={styles.visWrap}>
              {VISIBILITY_OPTIONS.map((o: { value: 'public' | 'followers' | 'private'; label: string; hint: string }) => {
                const active = visibility === o.value;
                const Icon = o.value === 'public' ? Globe : o.value === 'followers' ? Users : Lock;
                return (
                  <Pressable
                    key={o.value}
                    onPress={() => { setVisibility(o.value); saveDraftNow(presetCode, text, o.value); }}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active }}
                    style={[styles.visRow, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? alpha(colors.primary, 0.07) : colors.surface }]}
                  >
                    <Icon size={16} color={active ? colors.primary : colors.textSecondary} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.visLabel, { color: active ? colors.primary : colors.textPrimary }]}>{o.label}</Text>
                      <Text style={[styles.visHint, { color: colors.textSecondary }]}>{o.hint}</Text>
                    </View>
                    {active && <Check size={14} color={colors.primary} />}
                  </Pressable>
                );
              })}
            </View>

            {/* Enlace a servicio (roles verificados) */}
            {capabilities && (capabilities.verified.length > 0 || capabilities.role === 'DRIVER') && (
              <>
                <Text style={[styles.section, { color: colors.textSecondary }]}>ENLAZAR SERVICIO (OPCIONAL)</Text>
                <View style={styles.linkRow}>
                  <Pressable onPress={() => setLinkType(null)} accessibilityRole="radio" accessibilityState={{ checked: !linkType }} style={[styles.linkChip, { borderColor: !linkType ? colors.primary : colors.border, backgroundColor: !linkType ? alpha(colors.primary, 0.07) : colors.surface }]}>
                    <Text style={[styles.linkTxt, { color: !linkType ? colors.primary : colors.textPrimary }]}>Sin enlace</Text>
                  </Pressable>
                  {capabilities.role === 'DRIVER' && (
                    <Pressable onPress={() => setLinkType('taxi')} accessibilityRole="radio" accessibilityState={{ checked: linkType === 'taxi' }} style={[styles.linkChip, { borderColor: linkType === 'taxi' ? colors.primary : colors.border, backgroundColor: linkType === 'taxi' ? alpha(colors.primary, 0.07) : colors.surface }]}>
                      <Link2 size={13} color={linkType === 'taxi' ? colors.primary : colors.textSecondary} />
                      <Text style={[styles.linkTxt, { color: linkType === 'taxi' ? colors.primary : colors.textPrimary }]}>🚕 Taxi</Text>
                    </Pressable>
                  )}
                  {capabilities.verified.includes('SELLER') && (
                    <Pressable onPress={() => setLinkType('ecomerse')} accessibilityRole="radio" accessibilityState={{ checked: linkType === 'ecomerse' }} style={[styles.linkChip, { borderColor: linkType === 'ecomerse' ? colors.primary : colors.border, backgroundColor: linkType === 'ecomerse' ? alpha(colors.primary, 0.07) : colors.surface }]}>
                      <Text style={[styles.linkTxt, { color: linkType === 'ecomerse' ? colors.primary : colors.textPrimary }]}>🛒 Mi tienda</Text>
                    </Pressable>
                  )}
                  {capabilities.verified.includes('FOOD_OWNER') && (
                    <Pressable onPress={() => setLinkType('food')} accessibilityRole="radio" accessibilityState={{ checked: linkType === 'food' }} style={[styles.linkChip, { borderColor: linkType === 'food' ? colors.primary : colors.border, backgroundColor: linkType === 'food' ? alpha(colors.primary, 0.07) : colors.surface }]}>
                      <Text style={[styles.linkTxt, { color: linkType === 'food' ? colors.primary : colors.textPrimary }]}>🍽️ Restaurante</Text>
                    </Pressable>
                  )}
                  {capabilities.verified.includes('LANDLORD') && (
                    <Pressable onPress={() => setLinkType('rental')} accessibilityRole="radio" accessibilityState={{ checked: linkType === 'rental' }} style={[styles.linkChip, { borderColor: linkType === 'rental' ? colors.primary : colors.border, backgroundColor: linkType === 'rental' ? alpha(colors.primary, 0.07) : colors.surface }]}>
                      <Text style={[styles.linkTxt, { color: linkType === 'rental' ? colors.primary : colors.textPrimary }]}>🏠 Alquiler</Text>
                    </Pressable>
                  )}
                  {capabilities.verified.includes('RECRUITER') && (
                    <Pressable onPress={() => setLinkType('work')} accessibilityRole="radio" accessibilityState={{ checked: linkType === 'work' }} style={[styles.linkChip, { borderColor: linkType === 'work' ? colors.primary : colors.border, backgroundColor: linkType === 'work' ? alpha(colors.primary, 0.07) : colors.surface }]}>
                      <Text style={[styles.linkTxt, { color: linkType === 'work' ? colors.primary : colors.textPrimary }]}>💼 Oferta</Text>
                    </Pressable>
                  )}
                </View>
                <Text style={[styles.linkHint, { color: colors.textSecondary }]}>
                  {linkType ? `Quien lo vea podrá abrir ${LINK_LABEL[linkType] ?? 'el servicio'}.` : 'Tu estado puede abrir un servicio (solo roles verificados).'}
                </Text>
              </>
            )}

            {error && <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>}

            <Pressable
              onPress={doPublish}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Publicar estado"
              style={({ pressed }) => [styles.saveBtn, { backgroundColor: colors.primary, opacity: busy || pressed ? 0.8 : 1 }]}
            >
              {busy ? <ActivityIndicator color={brand.white} size="small" /> : <Text style={styles.saveTxt}>Publicar estado</Text>}
            </Pressable>
            <Pressable
              onPress={doEnd}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Quitar estado"
              style={({ pressed }) => [styles.endBtn, { borderColor: colors.border, opacity: busy || pressed ? 0.7 : 1 }]}
            >
              <Trash2 size={14} color={colors.danger} />
              <Text style={[styles.endTxt, { color: colors.danger }]}>Quitar mi estado actual</Text>
            </Pressable>
            <View style={{ height: 24 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/**
 * PreviewPhoto — foto local del editor a tamaño REAL (sin recortar):
 * mide la proporción con Image.getSize y ajusta la altura al ancho.
 * Máx 420 px; si la imagen es muy alta se usa "contain" (nunca se recorta).
 */
function PreviewPhoto({ uri }: { uri: string }) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [boxW, setBoxW] = useState(0);
  useEffect(() => {
    let alive = true;
    Image.getSize(
      uri,
      (w, h) => { if (alive && w > 0 && h > 0) setNatural({ w, h }); },
      () => { if (alive) setNatural({ w: 4, h: 3 }); }, // fallback 4:3
    );
    return () => { alive = false; };
  }, [uri]);
  const MAX_H = 420;
  let height = natural && boxW > 0 ? Math.max(100, Math.round(boxW * (natural.h / natural.w))) : 220;
  const clamped = height > MAX_H;
  if (clamped) height = MAX_H;
  return (
    <View
      onLayout={(e) => { const w = e.nativeEvent.layout.width; if (w > 0) setBoxW(w); }}
      style={[styles.previewPhotoBox, { height }]}
    >
      {natural ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode={clamped ? 'contain' : 'cover'} />
      ) : (
        <View style={styles.previewPhotoLoading}><ActivityIndicator color="#8E8E93" size="small" /></View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  card: {
    borderTopLeftRadius: 26, borderTopRightRadius: 26,
    paddingHorizontal: espaciado.e18, paddingTop: espaciado.e14, paddingBottom: espaciado.e10,
    maxHeight: '94%', borderTopWidth: 1,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 19, fontWeight: peso.titulo },
  close: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, marginTop: espaciado.e2, marginBottom: espaciado.e10 },
  note: { fontSize: tipografia.caption, fontWeight: peso.medio },
  previewWrap: { borderRadius: 18, borderWidth: 1, overflow: 'hidden', marginBottom: espaciado.e10 },
  preview: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e12,
    padding: espaciado.e12, minHeight: 54,
  },
  previewPhotoBox: { width: '100%', overflow: 'hidden', backgroundColor: 'rgba(0,0,0,0.06)' },
  previewPhotoLoading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  previewEmoji: { fontSize: 26 },
  previewBadge: { fontSize: 10.5, fontWeight: peso.fuerte, marginLeft: 'auto' },
  previewText: { flex: 1, fontSize: 15, fontWeight: peso.maximo },
  section: { fontSize: 10.5, fontWeight: peso.titulo, letterSpacing: 1, marginTop: espaciado.e14, marginBottom: espaciado.e8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 },
  presetCell: {
    width: '31%', borderRadius: 14, borderWidth: 1.5, padding: espaciado.e8, alignItems: 'center',
  },
  presetEmojiWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  presetEmoji: { fontSize: 24 },
  presetLabel: { fontSize: 10.5, fontWeight: peso.maximo, textAlign: 'center', marginTop: espaciado.e4 },
  presetCheck: { position: 'absolute', top: 6, right: 6 },
  emptyHint: { fontSize: tipografia.caption, fontStyle: 'italic' },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e10, fontSize: 15, fontWeight: peso.medio },
  counter: { alignSelf: 'flex-end', fontSize: 10.5, marginTop: espaciado.e3 },
  addImg: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, justifyContent: 'center',
    borderWidth: 1, borderRadius: 14, paddingVertical: espaciado.e12, paddingHorizontal: espaciado.e12,
  },
  addImgTxt: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e10 },
  photoCell: { position: 'relative' },
  imgThumb: { width: 88, height: 88, borderRadius: 14 },
  firstBadge: {
    position: 'absolute', left: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.6)',
    color: brand.white, fontSize: 9, fontWeight: peso.titulo, borderRadius: 6,
    paddingHorizontal: espaciado.e5, paddingVertical: 1, overflow: 'hidden',
  },
  removeImg: {
    position: 'absolute', top: 4, right: 4,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  visWrap: { gap: espaciado.e8 },
  visRow: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e10,
    borderWidth: 1, borderRadius: 14, padding: espaciado.e11,
  },
  visLabel: { fontSize: tipografia.body, fontWeight: peso.maximo },
  visHint: { fontSize: tipografia.micro, marginTop: 1 },
  linkRow: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 },
  linkChip: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e5,
    borderWidth: 1, borderRadius: radios.full, paddingHorizontal: espaciado.e11, paddingVertical: espaciado.e7,
  },
  linkTxt: { fontSize: tipografia.caption, fontWeight: peso.maximo },
  linkHint: { fontSize: tipografia.micro, marginTop: espaciado.e6, fontStyle: 'italic' },
  error: { fontSize: tipografia.caption, marginTop: espaciado.e10, fontWeight: peso.fuerte },
  saveBtn: { borderRadius: radios.lg, paddingVertical: espaciado.e14, alignItems: 'center', justifyContent: 'center', marginTop: espaciado.e16 },
  saveTxt: { color: brand.white, fontSize: 15.5, fontWeight: peso.titulo },
  endBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e6,
    borderRadius: radios.lg, borderWidth: 1, paddingVertical: espaciado.e11, marginTop: espaciado.e10,
  },
  endTxt: { fontSize: tipografia.body, fontWeight: peso.maximo },
});
