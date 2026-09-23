/**
 * Badge — etiqueta genérica del kit (rental), adaptada a TS + useTheme.
 * backgroundColor/textColor configurables; tamaño normal | small.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, tipografia } from '@egrouteplan/ui-kit';

export function Badge({
  label,
  backgroundColor,
  textColor,
  size = 'normal',
  style,
  accessibilityLabel,
}: {
  label: string;
  backgroundColor?: string;
  textColor?: string;
  size?: 'normal' | 'small';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const isSmall = size === 'small';
  return (
    <View
      style={[
        styles.badge,
        { backgroundColor: backgroundColor ?? colors.surface },
        isSmall && styles.badgeSmall,
        style,
      ]}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel || label}
    >
      <Text
        style={[
          styles.text,
          { color: textColor ?? colors.textPrimary },
          isSmall && styles.textSmall,
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeSmall: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  text: { fontSize: tipografia.micro, fontWeight: '700', lineHeight: 14 },
  textSmall: { fontSize: 10, lineHeight: 12 },
});
