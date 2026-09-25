/**
 * VideoCoverSheet — elegir la portada de un vídeo desde uno de sus fotogramas (B2).
 *
 * ── POR QUÉ ───────────────────────────────────────────────────────────────────
 * Antes la portada solo podía venir de la galería o del servidor, que saca SIEMPRE
 * el fotograma del segundo 1. Un vídeo que arranca en negro se publicaba así. Esta
 * hoja ofrece una tira de fotogramas repartidos por el vídeo y se elige uno.
 *
 * ── LÍMITES HONESTOS, no disimulados ──────────────────────────────────────────
 * · Los fotogramas se sacan del archivo LOCAL, antes de subirlo. Si el usuario
 *   cambia de vídeo hay que volver a extraerlos (esta hoja lo hace al abrirse).
 * · Extraer fotogramas cuesta unos segundos en un móvil y puede fallar (codec no
 *   admitido, archivo corrupto). Por eso hay estado de carga, error con mensaje en
 *   español, y el error NO bloquea: se puede cerrar y usar la galería.
 * · No es un scrubber frame-a-frame. Son N fotogramas repartidos (por defecto 6).
 *   Un scrubber exigiría precargar el vídeo entero en memoria; con vídeos de hasta
 *   50 min eso no es viable en un móvil.
 *
 * ── CONVENCIONES DEL PROYECTO ─────────────────────────────────────────────────
 * expo-image para imágenes de contenido (caché memoria+disco), colores desde
 * useTheme(), textos en español directamente (no hay i18n), a11y en los botones.
 */

import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clapperboard, X } from 'lucide-react-native';
import { alpha, brand, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { extraerFrames, type VideoFrame } from '../../core/videoFrames';
import { fmtDur } from '../../constants/lifebook';

export function VideoCoverSheet({
  visible,
  videoUri,
  durSec,
  onClose,
  onPick,
}: {
  visible: boolean;
  /** URI local del vídeo (la que dio el picker). */
  videoUri: string;
  /** Duración en segundos, para repartir los fotogramas. */
  durSec: number;
  onClose: () => void;
  /** Devuelve el fotograma elegido como `{ uri, dataUrl }`, la forma que ya usa
   *  el estado `cover` de la pantalla de publicar. */
  onPick: (cover: { uri: string; dataUrl: string }) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [frames, setFrames] = useState<VideoFrame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);

  // Extraer al abrir. Se cancela con `cancelado` porque extraer fotogramas tarda
  // varios segundos y el usuario puede cerrar la hoja o cambiar de vídeo antes:
  // sin esto se llamaría a `setFrames` sobre una hoja ya desmontada, o se
  // pintarían los fotogramas del VÍDEO ANTERIOR al reabrir.
  //
  // La bandera vive en el propio efecto (no en un `useCallback` aparte): un `let`
  // dentro de una función asíncrona no puede cambiar mientras espera, así que una
  // cancelación declarada ahí no cancelaría nada. Aquí `cancelado` lo fija el
  // cleanup del efecto, que sí corre al desmontar o al cambiar de vídeo.
  useEffect(() => {
    if (!visible || !videoUri) return;
    let cancelado = false;
    // Reset al abrir: si se cambió de vídeo, los fotogramas viejos no valen.
    setLoading(true);
    setError(null);
    setFrames([]);
    setSelected(null);
    void (async () => {
      try {
        const f = await extraerFrames(videoUri, durSec, 6);
        if (cancelado) return;
        setFrames(f);
        setSelected(f.length > 0 ? 0 : null);
      } catch (e) {
        if (cancelado) return;
        setError(e instanceof Error ? e.message : 'No se pudieron extraer los fotogramas.');
      } finally {
        if (!cancelado) setLoading(false);
      }
    })();
    return () => { cancelado = true; };
  }, [visible, videoUri, durSec]);

  const confirmar = () => {
    if (selected === null) return;
    const f = frames[selected];
    if (!f) return;
    onPick({ uri: f.uri, dataUrl: f.dataUrl });
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityViewIsModal>
        <Pressable
          style={[s.card, { backgroundColor: colors.card, paddingBottom: espaciado.e16 + insets.bottom }]}
          onPress={() => undefined}
        >
          <View style={s.head}>
            <Clapperboard size={18} color={colors.primary} />
            <Text style={[s.title, { color: colors.textPrimary }]}>Portada del vídeo</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Cerrar">
              <X size={20} color={colors.textPrimary} />
            </Pressable>
          </View>

          {loading ? (
            <View style={s.center}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[s.hint, { color: colors.textSecondary, marginTop: espaciado.e10 }]}>
                Extrayendo fotogramas del vídeo…
              </Text>
            </View>
          ) : error ? (
            <View style={[s.errorBox, { backgroundColor: alpha(colors.danger, 0.08), borderColor: alpha(colors.danger, 0.25) }]}>
              <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: peso.fuerte, lineHeight: 18 }}>{error}</Text>
            </View>
          ) : frames.length === 0 ? (
            <View style={s.center}>
              <Text style={[s.hint, { color: colors.textSecondary }]}>Sin fotogramas disponibles.</Text>
            </View>
          ) : (
            <>
              <Text style={[s.hint, { color: colors.textSecondary, marginBottom: espaciado.e10 }]}>
                Toca el fotograma que quieres como portada. {frames.length} momentos del vídeo.
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: espaciado.e8, paddingRight: espaciado.e8 }}
              >
                {frames.map((f, i) => {
                  const activo = selected === i;
                  return (
                    <Pressable
                      key={`${f.requestedSec}-${i}`}
                      onPress={() => setSelected(i)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: activo }}
                      accessibilityLabel={`Fotograma del segundo ${fmtDur(Math.round(f.timeSec))}${activo ? ', seleccionado' : ''}`}
                      style={[
                        s.thumbWrap,
                        { borderColor: activo ? colors.primary : 'transparent', borderWidth: activo ? 3 : 0 },
                      ]}
                    >
                      <Image
                        source={{ uri: f.dataUrl }}
                        style={s.thumb}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        transition={120}
                      />
                      <View style={s.thumbTime}>
                        <Text style={s.thumbTimeText}>{fmtDur(Math.round(f.timeSec))}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Vista grande del elegido: permite ver de verdad qué se publica. */}
              {selected !== null && frames[selected] ? (
                <View style={{ alignItems: 'center', marginTop: espaciado.e14 }}>
                  <Image
                    source={{ uri: frames[selected].dataUrl }}
                    style={[s.preview, { borderColor: colors.border }]}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                  />
                </View>
              ) : null}

              <Pressable
                onPress={confirmar}
                disabled={selected === null}
                accessibilityRole="button"
                accessibilityLabel="Usar este fotograma como portada"
                style={[s.confirm, { backgroundColor: colors.primary, opacity: selected === null ? 0.4 : 1 }]}
              >
                <Text style={s.confirmText}>Usar esta portada</Text>
              </Pressable>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  card: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: espaciado.e16, paddingTop: espaciado.e16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, marginBottom: espaciado.e12 },
  title: { flex: 1, fontSize: tipografia.subtitle, fontWeight: peso.maximo },
  center: { alignItems: 'center', paddingVertical: 34 },
  hint: { fontSize: tipografia.caption, lineHeight: 16 },
  errorBox: { borderRadius: 10, borderWidth: trazo.fino, padding: espaciado.e10, marginBottom: espaciado.e8 },
  thumbWrap: { borderRadius: 10, overflow: 'hidden' },
  thumb: { width: 96, height: 128, backgroundColor: 'rgba(0,0,0,0.08)' },
  thumbTime: {
    position: 'absolute', left: 4, bottom: 4, borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.62)', paddingHorizontal: espaciado.e5, paddingVertical: 1,
  },
  thumbTimeText: { color: brand.white, fontSize: tipografia.nota, fontWeight: peso.maximo },
  preview: { width: 170, height: 226, borderRadius: radios.md, borderWidth: trazo.fino, backgroundColor: brand.visor },
  confirm: { borderRadius: radios.md, paddingVertical: espaciado.e13, alignItems: 'center', marginTop: espaciado.e16 },
  confirmText: { color: brand.white, fontSize: tipografia.fino, fontWeight: peso.titulo },
});

export default VideoCoverSheet;
