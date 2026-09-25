/**
 * CORAZÓN — el «me gusta», con latido.
 *
 * DE DÓNDE VIENE
 * Del efecto «pulse-heart» de React Bits (web). Reescrito con Reanimated.
 *
 * QUÉ SUSTITUYE (y por qué es el que más arregla con menos código)
 * El mismo corazón está escrito cinco veces, y **el temporizador del corazón grande está duplicado
 * literalmente** en dos ficheros: `PostCard.tsx:67-72` y `lifebook-videos.tsx:903-910` (el propio
 * código lo admite: «mismo patrón y mismos tiempos que PostCard»). Las cinco superficies:
 *   · `components/lifebook/PostCard.tsx:215-225` (el del pie) y `:229-233` (el gigante del doble toque)
 *   · `app/lifebook-videos.tsx:906-911` y `:1168`
 *   · `components/lifebook/CommentsSheet.tsx:183-193`
 *   · `app/lifebook-post/[id].tsx:936`
 *   · `app/lifebook-ai.tsx:451`
 * Además hay **tres rojos distintos** para el mismo corazón: `alquiler-detalle.tsx:431` usa
 * `brand.danger`, `ecomerse.tsx:218` usa `colors.textPrimary` y `ecomerse-detail.tsx:453` usa
 * `brand.like`. Aquí solo hay uno: `brand.like`, que es el token que existe para esto (`colors.ts:42`).
 *
 * LO QUE NO HACE, A PROPÓSITO
 * No gestiona el estado: quien lo usa decide si está marcado y qué pasa al pulsar. El motivo es que
 * `PostCard` está memoizado a propósito (`PostCard.tsx:41-45`) porque el feed se recarga en silencio;
 * si este componente guardara estado propio, o se desincronizaría del servidor o rompería la memo.
 *
 * ACCESIBILIDAD
 *   · `role="button"` con `state.selected`, que es como ya se hacía bien en `PostCard.tsx:220`.
 *   · El latido **se suma** al relleno y al contador: nunca es la única señal. Con movimiento reducido
 *     el corazón no late, pero sigue rellenándose y el contador sigue cambiando.
 *   · El corazón NO se anuncia con `anunciar()`: el estado ya viaja en `accessibilityState`, y un
 *     anuncio por cada «me gusta» en un feed sería insufrible.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';
import { Heart } from 'lucide-react-native';

import { useTheme } from '../theme/ThemeContext';
import { brand } from '../theme/colors';
import { espaciado, icono as iconoTam, peso, tipografia, trazoIcono} from '../theme/escalas';
import { resorte } from '../theme/movimiento';
import { haptico } from '../feedback/hapticos';
import { useMovimientoReducido } from '../a11y/useMovimientoReducido';

export type CorazonProps = {
  /** Si está marcado. Lo decide quien lo usa. */
  marcado: boolean;
  onPulsar: () => void;
  /** Cuántos «me gusta» hay. Si no se pasa, no se pinta contador. */
  cuenta?: number;
  /** Tamaño del icono. Por defecto el de una fila; para el corazón grande del doble toque, `hero`. */
  tamano?: number;
  /** Vibración al marcar. Por defecto sí. Solo vibra al MARCAR, no al desmarcar. */
  vibracion?: boolean;
  /** Etiqueta accesible. Se construye con el nombre de quien publica cuando se pasa. */
  etiqueta?: string;
};

export function Corazon({
  marcado,
  onPulsar,
  cuenta,
  tamano = iconoTam.md,
  vibracion = true,
  etiqueta,
}: CorazonProps) {
  const { colors } = useTheme();
  const movReducido = useMovimientoReducido();
  const escala = useSharedValue(1);

  const alPulsar = () => {
    /* El latido es un rebote que pasa de largo: sube de más y vuelve. Solo al marcar, porque al
       desmarcar no hay nada que celebrar. */
    if (!marcado && !movReducido) {
      escala.value = withSequence(
        withSpring(1.25, resorte.rebotar),
        withSpring(1, resorte.asentar),
      );
    }
    if (!marcado && vibracion) haptico('toque');
    onPulsar();
  };

  const estilo = useAnimatedStyle(() => ({ transform: [{ scale: escala.value }] }));

  return (
    <Pressable
      onPress={alPulsar}
      /* El área táctil se agranda con hitSlop y no con tamaño, para no descuadrar la fila. */
      hitSlop={espaciado.e8}
      accessibilityRole="button"
      accessibilityState={{ selected: marcado }}
      accessibilityLabel={etiqueta ?? (marcado ? 'Quitar me gusta' : 'Me gusta')}
      style={estilos.caja}
    >
      <Animated.View style={estilo}>
        {/* Dos corazones superpuestos: el de contorno y el relleno. Lucide no interpola `fill`, así
            que el relevo se hace con opacidad. Es más barato que animar el color. */}
        <Heart
          size={tamano}
          color={marcado ? brand.like : colors.textSecondary}
          fill={marcado ? brand.like : 'transparent'}
          strokeWidth={trazoIcono.base}
        />
      </Animated.View>

      {cuenta !== undefined ? (
        <Text
          numberOfLines={1}
          style={[estilos.cuenta, { color: marcado ? brand.like : colors.textSecondary }]}
        >
          {cuenta}
        </Text>
      ) : null}
    </Pressable>
  );
}

const estilos = StyleSheet.create({
  caja: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.e4,
  },
  cuenta: {
    fontSize: tipografia.caption,
    fontWeight: peso.fuerte,
  },
});
