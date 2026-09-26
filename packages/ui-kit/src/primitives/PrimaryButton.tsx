/**
 * PrimaryButton / GhostButton — sistema de acciones del Design System.
 * Regla: UN SOLO CTA azul por pantalla; acciones secundarias sin relleno.
 */

import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { haptico } from '../feedback/hapticos';
import { altura, espaciado, peso, radios, tipografia } from '../theme/escalas';
import { brand } from '../theme/colors';

type Variant = 'primary' | 'danger' | 'success';

const variantColor = {
  primary: 'primary',
  danger: 'danger',
  success: 'success',
} as const;

export function PrimaryButton({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  accessibilityLabel,
  testID,
  haptic = true,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  loading?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  /** Vibra al pulsar. Se puede apagar donde moleste. */
  haptic?: boolean;
}) {
  const { colors } = useTheme();
  const bg = colors[variantColor[variant]];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={() => { if (haptic) haptico('toque'); onPress(); }}
      disabled={isDisabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: bg,
          opacity: isDisabled ? 0.45 : pressed ? 0.9 : 1,
          transform: [{ scale: pressed && !isDisabled ? 0.98 : 1 }],
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={brand.white} size="small" />
      ) : (
        <Text style={styles.text}>{title}</Text>
      )}
    </Pressable>
  );
}

export function GhostButton({
  title,
  onPress,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [styles.ghost, { opacity: disabled ? 0.4 : pressed ? 0.6 : 1 }]}
    >
      <Text style={[styles.ghostText, { color: colors.text.primary }]}>{title}</Text>
    </Pressable>
  );
}

/**
 * LAS MEDIDAS SALEN DE LAS ESCALAS DEL KIT, no de literales.
 *
 * `altura.boton` (52) es el peldaño que existía **para este botón** y que este botón no usaba: el
 * comentario de la escala decía «es el que ya usa `PrimaryButton.tsx:102`» mientras la línea 102
 * escribía `52` a mano (auditoría del 23/09/2026). Lo mismo `radios.lg` (16), `peso.maximo` (800) y
 * el `paddingVertical` del ghost (12 → `espaciado.e12`): mismo valor, ahora con nombre.
 *
 * UN LITERAL QUE SE QUEDA: `text.fontSize: 15.5`. No tiene peldaño — `tipografia` va de `cuerpo` (15)
 * a `subtitle` (16) — y hay **18 usos más** de 15,5 en la app. Es una decisión de la Fase 3 (declarar
 * el peldaño o bajarlo a 15), no un descuido.
 */
const styles = StyleSheet.create({
  base: {
    height: altura.boton,
    borderRadius: radios.lg,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  text: { color: brand.white, fontSize: 15.5, fontWeight: peso.maximo, letterSpacing: 0.2 },
  ghost: { alignItems: 'center', paddingVertical: espaciado.e12 },
  ghostText: { fontSize: tipografia.body, fontWeight: peso.fuerte },
});
