/**
 * AdSheet — Parte 26 (G2-c): publicar un ANUNCIO en el grupo.
 *
 * Decisión del dueño: **15 anuncios por persona y día** (el servidor lo aplica
 * y responde `AD_LIMIT_REACHED`). La hoja enseña cuántos quedan hoy.
 * El anuncio puede llevar título, texto, precio, foto y un enlace a un servicio
 * (los enlaces con requisito de rol los valida el servidor).
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { ImagePlus, Megaphone, X } from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import { messagesApi } from '../../api/messages';
import { lifebookMediaApi } from '../../api/lifebook';
import { authApi } from '../../api/auth';
import { formaHoja } from './ui/Sheet';

const TITLE_MAX = 60;
const TEXT_MAX = 300;

/** Enlaces de servicio que se pueden adjuntar (el servidor valida el rol). */
const LINKS: { type: string; label: string }[] = [
  { type: 'lifebook', label: 'Mi perfil de Life Book' },
  { type: 'ecomerse', label: 'Mi tienda' },
  { type: 'food', label: 'Mi restaurante' },
  { type: 'work', label: 'Mi oferta de trabajo' },
  { type: 'rental', label: 'Mi alquiler' },
  { type: 'taxi', label: 'Taxi' },
];

export interface LbAdDraft {
  title: string;
  text: string;
  priceXaf?: number;
  mediaUrl?: string;
  linkType?: string;
  /** Id del destino del enlace (mi perfil, mi tienda…). */
  linkId?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Publica el anuncio (el padre lo envía como mensaje `ad`). */
  onSubmit: (a: LbAdDraft) => void;
}

export function AdSheet({ visible, onClose, onSubmit }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [price, setPrice] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [linkType, setLinkType] = useState<string | null>(null);
  /** Mi id: es lo que necesita el enlace «Mi perfil» para abrir algo de verdad. */
  const [myId, setMyId] = useState<string | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setTitle(''); setText(''); setPrice(''); setPhoto(null); setLinkType(null); setError(null);
    // Cuántos anuncios me quedan hoy (el límite es del servidor).
    messagesApi.adsLeft()
      .then((r) => setLeft(Number(r.left)))
      .catch(() => setLeft(null));
    // Mi id (para enlazar mi perfil: `/lifebook-store` sin id no abriría nada).
    authApi.me().then((m) => setMyId(m?.id ?? null)).catch(() => setMyId(null));
  }, [visible]);

  const priceNum = Number(price.replace(/[^0-9]/g, ''));
  const canSend = (title.trim().length > 0 || text.trim().length > 0) && !uploading && left !== 0;

  const pickPhoto = async () => {
    try {
      const perm = await ImagePicker.getMediaLibraryPermissionsAsync().catch(() => null);
      if (perm && perm.granted === false) await ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => null);
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, selectionLimit: 1 });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      setUploading(true);
      const up = await lifebookMediaApi.uploadFile('image', {
        uri: asset.uri,
        name: asset.fileName ?? `anuncio-${Date.now()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
      });
      setPhoto(up.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir la foto.');
    } finally { setUploading(false); }
  };

  const submit = () => {
    if (!title.trim() && !text.trim()) { setError('Escribe el anuncio.'); return; }
    // El enlace «Mi perfil» necesita mi id: sin él la pantalla de destino no
    // tiene nada que abrir (era el fallo de «el enlace no se abre»).
    const linkId = linkType === 'lifebook' ? (myId ?? undefined) : undefined;
    if (linkType === 'lifebook' && !linkId) {
      setError('No pude leer tu perfil para el enlace. Prueba otra vez o quita el enlace.');
      return;
    }
    onSubmit({
      title: title.trim().slice(0, TITLE_MAX),
      text: text.trim().slice(0, TEXT_MAX),
      priceXaf: priceNum > 0 ? priceNum : undefined,
      mediaUrl: photo ?? undefined,
      linkType: linkType ?? undefined,
      linkId,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Megaphone size={18} color={colors.primary} />
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.subCabecera, fontWeight: peso.titulo, flex: 1, marginLeft: espaciado.e8 }}>
            Anuncio del grupo
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
            <X size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginBottom: espaciado.e8 }}>
          {left === null
            ? 'Máximo 15 anuncios por persona y día.'
            : left === 0
              ? 'Ya has publicado tus 15 anuncios de hoy. Vuelve mañana.'
              : `Te quedan ${left} anuncio${left === 1 ? '' : 's'} hoy (máximo 15 al día).`}
        </Text>

        <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
          <TextInput
            value={title}
            onChangeText={(v) => { setTitle(v); setError(null); }}
            placeholder="Título (p. ej. Clases de refuerzo)"
            placeholderTextColor={colors.textSecondary}
            maxLength={TITLE_MAX}
            accessibilityLabel="Título del anuncio"
            style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
          />
          <TextInput
            value={text}
            onChangeText={(v) => { setText(v); setError(null); }}
            placeholder="¿Qué quieres anunciar? Precio, horario, dónde…"
            placeholderTextColor={colors.textSecondary}
            maxLength={TEXT_MAX}
            multiline
            accessibilityLabel="Texto del anuncio"
            style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, minHeight: 80, marginTop: espaciado.e8 }]}
          />
          <View style={{ flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e8, alignItems: 'center' }}>
            <TextInput
              value={price}
              onChangeText={setPrice}
              placeholder="Precio (XAF)"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              maxLength={9}
              accessibilityLabel="Precio del anuncio"
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, flex: 1 }]}
            />
            <Pressable
              onPress={pickPhoto}
              disabled={uploading}
              accessibilityLabel={photo ? 'Cambiar la foto del anuncio' : 'Añadir una foto al anuncio'}
              style={({ pressed }) => [styles.photoBtn, {
                backgroundColor: colors.surface, opacity: pressed || uploading ? 0.75 : 1,
              }]}
            >
              {uploading
                ? <ActivityIndicator size="small" color={colors.primary} />
                : photo
                  ? <Image source={{ uri: photo }} style={styles.thumb} />
                  : <><ImagePlus size={16} color={colors.primary} /><Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.maximo, marginLeft: espaciado.e6 }}>Foto</Text></>}
            </Pressable>
          </View>

          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e12, fontWeight: peso.maximo }}>ENLAZAR UN SERVICIO (OPCIONAL)</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6, marginTop: espaciado.e6 }}>
            {LINKS.map((l) => {
              const active = linkType === l.type;
              return (
                <Pressable
                  key={l.type}
                  onPress={() => setLinkType(active ? null : l.type)}
                  accessibilityLabel={`Enlazar ${l.label}`}
                  style={[styles.chip, {
                    backgroundColor: active ? alpha(colors.primary, 0.14) : colors.surface,
                    borderColor: active ? colors.primary : 'transparent',
                  }]}
                >
                  <Text style={{ color: active ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{l.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {error ? <Text style={{ color: colors.danger, fontSize: tipografia.caption, marginTop: espaciado.e10 }}>{error}</Text> : null}

        <Pressable
          onPress={submit}
          disabled={!canSend}
          accessibilityLabel="Publicar el anuncio"
          style={({ pressed }) => [styles.cta, {
            backgroundColor: canSend ? colors.primary : alpha(colors.primary, 0.35),
            opacity: pressed ? 0.85 : 1,
          }]}
        >
          <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: tipografia.cuerpo }}>Publicar anuncio</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { ...formaHoja },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: espaciado.e8 },
  input: { borderRadius: radios.md, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10, fontSize: tipografia.body },
  photoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderRadius: radios.md, paddingHorizontal: espaciado.e12, height: 42, minWidth: 78,
  },
  thumb: { width: 34, height: 34, borderRadius: radios.sm },
  chip: { borderRadius: radios.full, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e6, borderWidth: trazo.fino },
  cta: { marginTop: espaciado.e16, borderRadius: radios.campo, alignItems: 'center', justifyContent: 'center', paddingVertical: espaciado.e14 },
});
