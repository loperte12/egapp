/**
 * components/lifebook/Chip.tsx — chip reutilizable (Parte 34).
 *
 * Nace al integrar el asistente de publicación: las opciones (tipo, categoría,
 * cobertura, transporte, existencias…) se pintaban con `GhostButton`, que **no
 * acepta `label`/`icon`/`style`**, así que salían vacías y sin marcar la opción
 * elegida. Este chip usa `Pressable`, los tokens reales del tema y accesibilidad.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { alpha, espaciado, radios, useTheme } from '@egrouteplan/ui-kit';

export function Chip({ label, active, onPress, icon, disabled, compact }: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
  compact?: boolean;
}) {
  const { colors } = useTheme();
  const border = active ? colors.primary : alpha(colors.border, 0.8);
  const bg = active ? alpha(colors.primary, 0.12) : colors.surface;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        compact ? styles.chipCompact : styles.chip,
        { borderColor: border, backgroundColor: bg, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {active ? <Check size={12} color={colors.primary} /> : icon}
      <Text
        numberOfLines={1}
        style={{
          color: active ? colors.primary : colors.textPrimary,
          fontSize: compact ? 11.5 : 12.5,
          fontWeight: '700',
          marginLeft: active || icon ? 5 : 0,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** Fila de chips que se envuelve sola (para listas de opciones). */
export function ChipRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderRadius: radios.full, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8,
  },
  chipCompact: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderRadius: radios.full, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e5,
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e7 },
});
