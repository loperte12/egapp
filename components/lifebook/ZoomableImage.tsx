/**
 * ZoomableImage — imagen de un visor a pantalla completa con gestos reales:
 *   · pinza (2 dedos) para ampliar hasta 4×
 *   · doble toque para ampliar al punto tocado / volver a encajar
 *   · arrastre con un dedo mientras está ampliada (con topes: la imagen nunca
 *     se va fuera de la pantalla)
 *   · un toque (sin zoom) avisa al padre (normalmente: cerrar el visor)
 *
 * `resetKey` vuelve a encajar la imagen cuando cambia (p. ej. al pasar de foto
 * en el visor). Los gestos van en el hilo de UI (reanimated), así que el
 * desplazamiento no depende del puente de JS.
 *
 * ── Parte 32 (zoom real y sin parpadeos) ────────────────────────────────────
 *  1. `blockScrollRef`: cuando la imagen vive dentro de un pase de páginas
 *     (FlatList horizontal), la PINZA se declara `blocksExternalGesture` sobre
 *     esa lista. Sin esto el scroll nativo se quedaba el toque y la pinza casi
 *     nunca llegaba a activarse → «no deja hacer zoom».
 *  2. La imagen usa **expo-image** con caché memoria+disco y `transition={0}`:
 *     al abrir el visor, cerrarlo o pasar de foto ya no hay destello blanco.
 *  3. API imperativa (`ref`): `zoomIn()`, `zoomOut()`, `fit()`. Los visores
 *     pintan botones − / + / encajar, así el zoom funciona aunque el gesto no
 *     salga en algún móvil concreto.
 */
import React, { forwardRef, useEffect, useImperativeHandle, type RefObject } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS, useAnimatedStyle, useSharedValue, withTiming,
} from 'react-native-reanimated';

const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.4;
/** Cuánto amplía/reduce cada toque de los botones − / +. */
const STEP = 1.6;

export interface ZoomableImageHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
}

interface Props {
  uri: string;
  width: number;
  height: number;
  /** Al cambiar (índice de la página), la imagen vuelve a encajar. */
  resetKey?: unknown;
  /** `true` mientras está ampliada (el visor desactiva el pase de página). */
  onZoomChange?: (zoomed: boolean) => void;
  /** Un toque sin zoom (normalmente cerrar el visor). */
  onSingleTap?: () => void;
  /**
   * Lista/pase de páginas que debe CEDER ante la pinza (Parte 32). Es lo que
   * hacía que el zoom no funcionara dentro del visor de publicaciones.
   */
  blockScrollRef?: RefObject<any>;
}

function clampJS(v: number, limit: number): number {
  return Math.min(Math.max(v, -limit), limit);
}

export const ZoomableImage = forwardRef<ZoomableImageHandle, Props>(function ZoomableImage(
  { uri, width, height, resetKey, onZoomChange, onSingleTap, blockScrollRef },
  ref,
) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const notify = (zoomed: boolean) => { onZoomChange?.(zoomed); };
  const single = () => { onSingleTap?.(); };

  const fitToScreen = () => {
    scale.value = withTiming(1);
    tx.value = withTiming(0);
    ty.value = withTiming(0);
    savedScale.value = 1;
    savedTx.value = 0;
    savedTy.value = 0;
    notify(false);
  };

  /** Amplía (factor > 1) o reduce (factor < 1) desde los botones del visor. */
  const zoomBy = (factor: number) => {
    const next = Math.min(Math.max(scale.value * factor, 1), MAX_SCALE);
    const mx = ((next - 1) * width) / 2;
    const my = ((next - 1) * height) / 2;
    const nx = clampJS(tx.value, mx);
    const ny = clampJS(ty.value, my);
    scale.value = withTiming(next);
    tx.value = withTiming(nx);
    ty.value = withTiming(ny);
    savedScale.value = next;
    savedTx.value = nx;
    savedTy.value = ny;
    notify(next > 1.02);
  };

  useImperativeHandle(ref, () => ({
    zoomIn: () => zoomBy(STEP),
    zoomOut: () => (scale.value <= 1.02 ? fitToScreen() : zoomBy(1 / STEP)),
    fit: fitToScreen,
  }));

  // Vuelve a encajar al cambiar de página.
  useEffect(() => {
    scale.value = 1; savedScale.value = 1;
    tx.value = 0; ty.value = 0; savedTx.value = 0; savedTy.value = 0;
    onZoomChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      'worklet';
      const next = savedScale.value * e.scale;
      scale.value = Math.min(Math.max(next, 1), MAX_SCALE);
    })
    .onEnd(() => {
      'worklet';
      if (scale.value <= 1.02) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedScale.value = 1;
        savedTx.value = 0;
        savedTy.value = 0;
        runOnJS(notify)(false);
        return;
      }
      // Topes: la imagen no puede salirse de la pantalla.
      const mx = ((scale.value - 1) * width) / 2;
      const my = ((scale.value - 1) * height) / 2;
      const nx = Math.min(Math.max(tx.value, -mx), mx);
      const ny = Math.min(Math.max(ty.value, -my), my);
      tx.value = withTiming(nx);
      ty.value = withTiming(ny);
      savedScale.value = scale.value;
      savedTx.value = nx;
      savedTy.value = ny;
      runOnJS(notify)(true);
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      'worklet';
      if (scale.value <= 1) return; // sin zoom, el arrastre es del pase de página
      const mx = ((scale.value - 1) * width) / 2;
      const my = ((scale.value - 1) * height) / 2;
      tx.value = Math.min(Math.max(savedTx.value + e.translationX, -mx), mx);
      ty.value = Math.min(Math.max(savedTy.value + e.translationY, -my), my);
    })
    .onEnd(() => {
      'worklet';
      savedTx.value = tx.value;
      savedTy.value = ty.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(260)
    .maxDelay(220)
    .onEnd((e) => {
      'worklet';
      if (scale.value > 1) {
        scale.value = withTiming(1);
        tx.value = withTiming(0);
        ty.value = withTiming(0);
        savedScale.value = 1;
        savedTx.value = 0;
        savedTy.value = 0;
        runOnJS(notify)(false);
        return;
      }
      scale.value = withTiming(DOUBLE_TAP_SCALE);
      savedScale.value = DOUBLE_TAP_SCALE;
      // Centra el zoom en el punto tocado.
      const mx = ((DOUBLE_TAP_SCALE - 1) * width) / 2;
      const my = ((DOUBLE_TAP_SCALE - 1) * height) / 2;
      const nextX = Math.min(Math.max((width / 2 - e.x) * (DOUBLE_TAP_SCALE - 1), -mx), mx);
      const nextY = Math.min(Math.max((height / 2 - e.y) * (DOUBLE_TAP_SCALE - 1), -my), my);
      tx.value = withTiming(nextX);
      ty.value = withTiming(nextY);
      savedTx.value = nextX;
      savedTy.value = nextY;
      runOnJS(notify)(true);
    });

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(220)
    .onEnd(() => {
      'worklet';
      if (scale.value <= 1) runOnJS(single)();
    });

  const taps = Gesture.Exclusive(doubleTap, singleTap);
  const composed = Gesture.Simultaneous(pinch, pan, taps);

  // Parte 32: la pinza MANDA sobre el pase de páginas (era el bug del zoom).
  if (blockScrollRef?.current) {
    pinch.blocksExternalGesture(blockScrollRef);
  }

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <View style={[styles.root, { width, height }]}>
        <Animated.View style={style}>
          <Image
            source={uri}
            style={{ width, height }}
            contentFit="contain"
            cachePolicy="memory-disk"
            recyclingKey={uri}
            transition={0}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  root: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
