/**
 * LazyImage — imagen con carga progresiva (kit rental).
 * Ciclo completo: placeholder → thumbnail → full con fade-in.
 * Estados: loading / error (con reintento) / sin imagen (placeholder).
 * Maneja URIs vacías o inválidas sin romper.
 *
 * Opcional (no incluido por defecto): blurhash/thumbhash — se puede añadir
 * pasando `placeholderComponent` (p.ej. un BlurhashView) para el placeholder.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle, type ImageStyle } from 'react-native';
import { brand, espaciado, radios, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { Image as ExpoImage, type ImageContentFit } from 'expo-image';

/** El `Animated.Image` de React Native no entiende `contentFit`: se envuelve el de expo-image. */
const ImagenAnimada = Animated.createAnimatedComponent(ExpoImage);

export function LazyImage({
  source,
  thumbnailSource,
  style,
  resizeMode = 'cover',
  placeholderComponent,
  onError: onErrorProp,
}: {
  source?: { uri?: string | null };
  thumbnailSource?: { uri?: string | null };
  style?: StyleProp<ViewStyle | ImageStyle>;
  resizeMode?: 'cover' | 'contain' | 'stretch';
  placeholderComponent?: React.ReactNode;
  onError?: (error?: Error) => void;
}) {
  const { colors } = useTheme();
  const [mainLoaded, setMainLoaded] = useState(false); // la imagen full terminó
  const [thumbLoaded, setThumbLoaded] = useState(false); // el thumbnail terminó
  const [failed, setFailed] = useState(false); // la full falló
  const [retryKey, setRetryKey] = useState(0);
  const opacity = React.useRef(new Animated.Value(0)).current;

  const mainUri = source?.uri;
  const thumbUri = thumbnailSource?.uri ?? mainUri;
  const hasImage = !!mainUri && mainUri.startsWith('http');

  // Reset al cambiar de fuente
  useEffect(() => {
    setMainLoaded(false);
    setThumbLoaded(false);
    setFailed(false);
    opacity.setValue(0);
  }, [mainUri, retryKey, opacity]);

  // Fade-in suave al cargar la imagen full
  useEffect(() => {
    if (mainLoaded) {
      Animated.timing(opacity, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    }
  }, [mainLoaded, opacity]);

  const handleMainError = useCallback(() => {
    setFailed(true);
    setMainLoaded(false);
    onErrorProp?.(new Error('No se pudo cargar la imagen'));
  }, [onErrorProp]);

  const retry = useCallback(() => {
    setFailed(false);
    setRetryKey((k) => k + 1);
  }, []);

  const s = styles(colors);

  /**
   * expo-image llama «fill» a lo que React Native llama «stretch». Se traduce en un sitio para que
   * las pantallas que ya usaban LazyImage no tengan que cambiar nada.
   */
  const ajuste: ImageContentFit = resizeMode === 'stretch' ? 'fill' : resizeMode;

  // --- Sin imagen o URI inválida → placeholder ---
  if (!hasImage) {
    return (
      <View style={[s.placeholder, style]}>
        {placeholderComponent ?? (
          <View style={s.placeholderInner}>
            <Text style={s.placeholderEmoji}>🖼️</Text>
            <Text style={s.placeholderText}>Sin foto</Text>
          </View>
        )}
      </View>
    );
  }

  // --- Error en la imagen full → mensaje + reintento ---
  if (failed) {
    return (
      <View style={[s.placeholder, style]}>
        <View style={s.placeholderInner}>
          <Text style={s.placeholderEmoji}>⚠️</Text>
          <Text style={s.placeholderText}>No se pudo cargar</Text>
          <Pressable onPress={retry} hitSlop={8} style={s.retryBtn}>
            <Text style={s.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[s.container, style]}>
      {/* Thumbnail (fondo mientras carga la full) */}
      {thumbUri && thumbUri.startsWith('http') && !mainLoaded && (
        <ExpoImage
          source={{ uri: thumbUri }}
          style={StyleSheet.absoluteFill}
          contentFit={ajuste}
          cachePolicy="memory-disk"
          onLoad={() => setThumbLoaded(true)}
        />
      )}

      {/* Imagen principal con fade-in */}
      <ImagenAnimada
        key={retryKey}
        source={{ uri: mainUri }}
        style={[StyleSheet.absoluteFill, { opacity }]}
        contentFit={ajuste}
        cachePolicy="memory-disk"
        onLoad={() => {
          setMainLoaded(true);
          setThumbLoaded(true);
        }}
        onError={handleMainError}
      />

      {/* Indicador de carga (solo si ni thumbnail ni full han cargado) */}
      {!thumbLoaded && !mainLoaded && (
        <View style={[s.loading, { backgroundColor: colors.surface }]}>
          <ActivityIndicator color={colors.primary} size="small" />
        </View>
      )}
    </View>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  container: { position: 'relative', overflow: 'hidden', backgroundColor: c.surface },
  placeholder: { backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  placeholderInner: { alignItems: 'center', justifyContent: 'center', gap: espaciado.e6 },
  placeholderEmoji: { fontSize: tipografia.display },
  placeholderText: { fontSize: tipografia.micro, color: c.textSecondary, fontWeight: peso.medio },
  retryBtn: { marginTop: espaciado.e2, backgroundColor: c.primary, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e6, borderRadius: radios.sm },
  retryText: { color: brand.white, fontSize: tipografia.caption, fontWeight: peso.fuerte },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
