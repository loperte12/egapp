/**
 * PhotoGallery — GALERÍA DE FOTOS con puntos, reutilizable.
 *
 * Se extrae del patrón que ya usa el módulo de alquiler (`alquiler-detalle.tsx`: scroll
 * horizontal con `pagingEnabled`, `onMomentumScrollEnd` y puntos indicadores) para no
 * tener dos galerías distintas en la app. La usan la ficha del hotel y la de la
 * habitación, y las filas de resultados usan la misma imagen (`LazyImage` + `absUrl`).
 *
 * Detalles que importan en el móvil:
 *   · `absUrl` en cada foto: el backend puede devolver rutas internas (`/wallet/...`).
 *   · Puntos con `accessibilityElementsHidden` (un lector de pantalla no necesita «1 de 4»
 *     repetido por cada foto; el contenedor ya lleva la etiqueta).
 *   · Sin fotos: un hueco con el icono y «Sin fotos todavía», nunca un cuadrado roto.
 */
import React, { useCallback, useRef, useState } from 'react';
import {
  LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { alpha, brand, espaciado, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { absUrl } from '../api/config';
import { LazyImage } from './rental/LazyImage';

export function GalleryDots({ total, activeIndex }: { total: number; activeIndex: number }) {
  const { colors } = useTheme();
  if (total <= 1) return null;
  return (
    <View style={styles.dots} accessibilityElementsHidden>
      {Array.from({ length: total }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            { backgroundColor: i === activeIndex ? brand.white : alpha(brand.white, 0.45) },
            i === activeIndex ? styles.dotActive : null,
          ]}
        />
      ))}
    </View>
  );
}

export interface PhotoGalleryProps {
  /** URLs de las fotos (se les aplica `absUrl`). */
  photos: (string | null | undefined)[];
  /** Alto del carrete (por defecto, un 16:10 del ancho). */
  height?: number;
  /** Texto cuando no hay fotos. */
  emptyLabel?: string;
  /** Icono/emoji para el hueco vacío (por defecto, un emoji de cama). */
  emptyIcon?: string;
  /** Contenido superpuesto (botón de volver, insignias, contador…). */
  overlay?: React.ReactNode;
  /** Ancho de una página si no se quiere el ancho de la ventana. */
  width?: number;
  /** Radio de las esquinas (0 = a sangre). */
  radius?: number;
}

export function PhotoGallery({
  photos,
  height,
  emptyLabel = 'Sin fotos todavía',
  emptyIcon = '🛏️',
  overlay,
  width,
  radius = 0,
}: PhotoGalleryProps) {
  const { colors } = useTheme();
  const ventana = useWindowDimensions();
  const [ancho, setAncho] = useState(width ?? ventana.width);
  const [activa, setActiva] = useState(0);
  const scroller = useRef<ScrollView>(null);

  const urls = (photos ?? []).map((p) => absUrl(p ?? '')).filter((u) => !!u);
  const alto = height ?? Math.round((width ?? ventana.width) * 0.62);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0 && w !== ancho) {
      setAncho(w);
      setActiva(0);
      scroller.current?.scrollTo({ x: 0, animated: false });
    }
  }, [ancho]);

  const onScrollEnd = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const w = e.nativeEvent.layoutMeasurement.width || ancho;
    const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, w));
    setActiva(Math.max(0, Math.min(i, urls.length - 1)));
  }, [ancho, urls.length]);

  return (
    <View style={[{ height: alto, position: 'relative' }, radius ? { borderRadius: radius, overflow: 'hidden' } : null]} onLayout={onLayout}>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        accessibilityLabel="Galería de fotos"
      >
        {urls.length === 0 ? (
          <View style={[{ width: ancho, height: alto, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: 36 }}>{emptyIcon}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e6 }}>{emptyLabel}</Text>
          </View>
        ) : (
          urls.map((u, i) => (
            <LazyImage key={`${u}-${i}`} source={{ uri: u }} style={{ width: ancho, height: alto }} />
          ))
        )}
      </ScrollView>

      <GalleryDots total={urls.length} activeIndex={activa} />

      {urls.length > 1 ? (
        <View style={[styles.contador, { backgroundColor: alpha('#000000', 0.55) }]}>
          <Text style={styles.contadorTxt}>{activa + 1}/{urls.length}</Text>
        </View>
      ) : null}

      {overlay}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', gap: espaciado.e6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  dotActive: { width: 18 },
  contador: { position: 'absolute', top: 12, right: 12, borderRadius: 10, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3 },
  contadorTxt: { color: brand.white, fontSize: tipografia.micro, fontWeight: peso.fuerte },
});
