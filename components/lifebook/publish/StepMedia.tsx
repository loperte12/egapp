/**
 * publish/StepMedia.tsx — paso FOTOS (Parte 34).
 *
 * Integra la idea del dueño con las correcciones detectadas:
 *   · usa el pipeline **multipart que ya funciona** (`lifebookMediaApi.uploadFile`,
 *     con permisos y compresión del wrapper `core/pickImage`), no una subida
 *     firmada que aún no existe;
 *   · los archivos se identifican por **url** (antes por `position`, que se
 *     duplicaba y hacía que quitar una borrara dos);
 *   · la vista previa usa la **imagen local** recién elegida, sin volver a bajarla;
 *   · error visible si algo falla (antes había un `catch` vacío).
 */
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Camera, X } from 'lucide-react-native';
import { alpha, brand, espaciado, GhostButton, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { lifebookMediaApi } from '../../../api/lifebook';
import { pickImagesFromLibrary } from '../../../core/pickImage';
import { usePublishStore } from '../../../state/commercePublish';
import { Notice, StepBlock } from './PublishParts';

const MAX = 10;

export default function StepMedia() {
  const { colors } = useTheme();
  const form = usePublishStore((s) => s.form);
  const addMedia = usePublishStore((s) => s.addMedia);
  const removeMedia = usePublishStore((s) => s.removeMedia);
  const [uploading, setUploading] = useState(false);
  const [locals, setLocals] = useState<Record<string, string>>({});

  const pick = async () => {
    if (uploading || form.media.length >= MAX) return;
    try {
      const picked = await pickImagesFromLibrary(MAX - form.media.length);
      if (!picked.length) return;
      setUploading(true);
      for (const img of picked) {
        const up = await lifebookMediaApi.uploadFile('image', {
          uri: img.uri,
          name: `comercio-${Date.now()}.jpg`,
          mimeType: 'image/jpeg',
        });
        if (up?.url) {
          addMedia({ url: up.url, type: 'image' });
          setLocals((prev) => ({ ...prev, [up.url]: img.uri }));
        }
      }
    } catch (e) {
      Alert.alert('Fotos', e instanceof Error ? e.message : 'No se pudieron subir las fotos');
    } finally {
      setUploading(false);
    }
  };

  const obligatoria = form.serviceType === 'physical';

  return (
    <View>
      <StepBlock
        title={`Fotos y vídeo (${form.media.length}/${MAX})`}
        hint={obligatoria
          ? 'La primera foto será la portada. En una venta hace falta al menos una.'
          : 'Opcional en servicios, alojamientos, alquileres y ofertas de trabajo, pero ayuda a que te elijan.'}
      >
        <View style={styles.grid}>
          {form.media.map((m) => (
            <View key={m.url} style={styles.thumb}>
              <Image
                source={locals[m.url] ?? m.url}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={0}
              />
              <Pressable
                onPress={() => removeMedia(m.url)}
                accessibilityLabel="Quitar foto"
                hitSlop={8}
                style={styles.del}
              >
                <X size={13} color={brand.white} />
              </Pressable>
            </View>
          ))}
          {form.media.length < MAX ? (
            <Pressable
              onPress={pick}
              accessibilityLabel="Añadir fotos"
              style={[styles.add, { borderColor: alpha(colors.border, 0.9), backgroundColor: colors.surface }]}
            >
              {uploading ? <ActivityIndicator color={colors.primary} /> : <Camera size={22} color={colors.primary} />}
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e5, textAlign: 'center' }}>
                {uploading ? 'Subiendo…' : 'Añadir'}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </StepBlock>

      {form.media.length > 0 ? (
        <GhostButton title="Añadir más fotos" onPress={pick} disabled={uploading} />
      ) : null}

      {!obligatoria && form.media.length === 0 ? (
        <Notice>Puedes continuar sin fotos, pero las publicaciones con foto reciben muchas más consultas.</Notice>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 },
  thumb: { width: 92, height: 92, borderRadius: radios.md, overflow: 'hidden', backgroundColor: '#eee' },
  del: {
    position: 'absolute', top: 5, right: 5, width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  add: {
    width: 92, height: 92, borderRadius: radios.md, borderWidth: 1.5, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
});
