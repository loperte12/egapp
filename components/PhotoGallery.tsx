/**
 * PhotoGallery — GALERÍA DE FOTOS con puntos y pestañas opcionales, reutilizable.
 *
 * Se extrae del patrón que ya usa el módulo de alquiler (`alquiler-detalle.tsx`: scroll
 * horizontal con `pagingEnabled`, `onMomentumScrollEnd` y puntos indicadores) para no
 * tener dos galerías distintas en la app. La usan la ficha del hotel y la de la
 * habitación, y las filas de resultados usan la misma imagen (`LazyImage` + `absUrl`).
 *
 * ── PESTAÑAS (D10 · 27-sep-2026) ────────────────────────────────────────────────────────────────
 *
 * Se añade la prop opcional `tabs` para separar las fotos por origen. Cuando se pasa, la galería
 * muestra una barra de pestañas **debajo** del carrusel (los puntos y el contador siguen encima)
 * y cambia las fotos al tocar cada una. El índice activo se reinicia a 0 al cambiar de pestaña.
 *
 * Reglas:
 *   · Si `tabs` tiene **0 pestañas con fotos**, se comporta como galería plana con `photos`.
 *   · Si solo **1 pestaña** tiene fotos, no se pinta la barra (no tiene sentido un selector de uno).
 *   · Si **2+ pestañas** tienen fotos, se pinta la barra y `photos` se ignora.
 *
 * El caso de uso original —la ficha del hotel— separa `coverUrl` (1 foto del alojamiento) de las
 * fotos de cada tipo de habitación. Sin campo nuevo: el origen ya está en el dato.
 *
 * Detalles que importan en el móvil:
 *   · `absUrl` en cada foto: el backend puede devolver rutas internas (`/wallet/...`).
 *   · Puntos con `accessibilityElementsHidden` (un lector de pantalla no necesita «1 de 4»
 *     repetido por cada foto; el contenedor ya lleva la etiqueta).
 *   · Sin fotos: un hueco con el icono y «Sin fotos todavía», nunca un cuadrado roto.
 */
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { alpha, brand, espaciado, tipografia, useTheme, peso, radios, trazo} from '@egrouteplan/ui-kit';
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

/**
 * Una pestaña de la galería: etiqueta + sus fotos. Las URLs se resuelven con `absUrl` y se filtran
 * las vacías, igual que `photos`.
 */
export interface GalleryTab {
  label: string;
  photos: (string | null | undefined)[];
}

export interface PhotoGalleryProps {
  /** URLs de las fotos (se les aplica `absUrl`). Se ignora si `tabs` tiene 2+ con fotos. */
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
  /**
   * Pestañas de la galería. Ver reglas arriba: 0-1 con fotos = galería plana; 2+ = barra visible.
   */
  tabs?: GalleryTab[];
}

/** Resuelve y filtra las URLs de un array de fotos. */
function resolverUrls(photos: (string | null | undefined)[]): string[] {
  return (photos ?? []).map((p) => absUrl(p ?? '')).filter((u): u is string => !!u);
}

export function PhotoGallery({
  photos,
  height,
  emptyLabel = 'Sin fotos todavía',
  emptyIcon = '🛏️',
  overlay,
  width,
  radius = 0,
  tabs,
}: PhotoGalleryProps) {
  const { colors } = useTheme();
  const ventana = useWindowDimensions();
  const [ancho, setAncho] = useState(width ?? ventana.width);
  const [activa, setActiva] = useState(0);
  const scroller = useRef<ScrollView>(null);

  /*
    PESTAÑAS ACTIVAS: solo las que tienen al menos una foto. Si quedan 2+, se pinta la barra.
    Si queda 1 o ninguna, la galería se comporta como si no hubiera pestañas.

    `useMemo` para no recalcular en cada render: las fotos no cambian a cada frame, y resolver
    `absUrl` + filtrar para cada pestaña en cada render es trabajo innecesario.
  */
  const tabsActivas = useMemo(() => {
    if (!tabs || tabs.length === 0) return null;
    const resueltas = tabs
      .map((t) => ({ label: t.label, urls: resolverUrls(t.photos) }))
      .filter((t) => t.urls.length > 0);
    return resueltas.length >= 2 ? resueltas : null;
  }, [tabs]);

  const [tabIdx, setTabIdx] = useState(0);

  // Las URLs que se pintan: las de la pestaña activa si hay tabs, o `photos` si no.
  const urls = tabsActivas ? tabsActivas[tabIdx].urls : resolverUrls(photos);
  const alto = height ?? Math.round((width ?? ventana.width) * 0.62);

  // La barra de pestañas añade ~40 px al alto total del componente.
  const altoTotal = alto + (tabsActivas ? 40 : 0);

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

  /**
   * Cambiar de pestaña: resetea el índice activo y el scroll horizontal. Sin animación en el
   * scroll — el cambio de contenido ya es suficiente feedback visual.
   */
  const cambiarTab = useCallback((idx: number) => {
    setTabIdx(idx);
    setActiva(0);
    scroller.current?.scrollTo({ x: 0, animated: false });
  }, []);

  return (
    <View style={[{ height: altoTotal, position: 'relative' }, radius ? { borderRadius: radius, overflow: 'hidden' } : null]} onLayout={onLayout}>
      <View style={{ height: alto, position: 'relative' }}>
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
              <Text style={{ fontSize: tipografia.heroGrande }}>{emptyIcon}</Text>
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
          <View style={[styles.contador, { backgroundColor: alpha(brand.visor, 0.55) }]}>
            <Text style={styles.contadorTxt}>{activa + 1}/{urls.length}</Text>
          </View>
        ) : null}

        {overlay}
      </View>

      {/* ── BARRA DE PESTAÑAS ────────────────────────────────────────────────────────
          Debajo del carrusel, con fondo del theme. Cada botón muestra `etiqueta (n)` donde n es
          el número de fotos de esa pestaña, para que el huésped sepa qué hay en cada una sin
          tener que tocarla. La pestaña activa usa el color primario; las demás, texto secundario.
      */}
      {tabsActivas ? (
        <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
          {tabsActivas.map((t, idx) => (
            <Pressable
              key={t.label}
              onPress={() => cambiarTab(idx)}
              accessibilityRole="button"
              accessibilityState={{ selected: idx === tabIdx }}
              accessibilityLabel={`${t.label} (${t.urls.length} fotos)`}
              style={[styles.tabBtn, idx === tabIdx ? { borderBottomColor: colors.primary, borderBottomWidth: trazo.fuerte } : null]}
            >
              <Text style={[
                styles.tabTxt,
                { color: idx === tabIdx ? colors.textPrimary : colors.textSecondary, fontWeight: idx === tabIdx ? peso.maximo : peso.medio },
              ]}>
                {t.label} ({t.urls.length})
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dots: { position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', gap: espaciado.e6 },
  dot: { width: 7, height: 7, borderRadius: radios.full },
  dotActive: { width: 18 },
  contador: { position: 'absolute', top: 12, right: 12, borderRadius: radios.chip, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3 },
  contadorTxt: { color: brand.white, fontSize: tipografia.micro, fontWeight: peso.fuerte },
  tabBar: { flexDirection: 'row', height: 40, alignItems: 'center', justifyContent: 'center', gap: espaciado.e16, borderBottomWidth: trazo.fino },
  tabBtn: { paddingVertical: espaciado.e6, borderBottomWidth: trazo.fuerte, borderBottomColor: 'transparent' },
  tabTxt: { fontSize: tipografia.caption },
});
