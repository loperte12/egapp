/**
 * Tactil — `Pressable` con respuesta al toque por defecto.
 *
 * POR QUÉ EXISTE: en la app solo 156 de 1.163 `Pressable` cambiaban algo al pulsarse.
 * Tocar y no ver nada durante 200 ms se interpreta como «no ha cogido el toque» y el usuario
 * vuelve a pulsar. En una app con dinero, ese es justo el gesto que no queremos provocar.
 *
 * `PrimaryButton` y `GhostButton` del kit ya lo hacían bien; esto es para los controles que cada
 * pantalla escribe a mano.
 *
 * Uso normal:
 *   <Tactil onPress={…} style={styles.row} accessibilityRole="button" accessibilityLabel="…">…</Tactil>
 *
 * Si la pantalla ya tiene su propio estilo de pulsado, se pasa como función y se respeta:
 *   <Tactil style={({ pressed }) => [styles.row, pressed && { backgroundColor: … }]}>…</Tactil>
 */
import React, { type ReactNode } from 'react';
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

export interface TactilProps extends Omit<PressableProps, 'style' | 'children'> {
  style?: StyleProp<ViewStyle> | ((estado: { pressed: boolean }) => StyleProp<ViewStyle>);
  /** Opacidad mientras se mantiene pulsado. 0,6 por defecto: se nota sin marear. */
  pressedOpacity?: number;
  children?: ReactNode;
}

export function Tactil({ style, pressedOpacity = 0.6, children, ...resto }: TactilProps) {
  return (
    <Pressable
      {...resto}
      style={(estado) => [
        typeof style === 'function' ? style(estado) : style,
        estado.pressed ? { opacity: pressedOpacity } : null,
      ]}
    >
      {children}
    </Pressable>
  );
}
