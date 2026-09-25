/**
 * Badge — etiqueta genérica del kit (rental), adaptada a TS + useTheme.
 * backgroundColor/textColor configurables; tamaño normal | small.
 */

import React from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { espaciado, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';

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
    paddingHorizontal: espaciado.e8,
    paddingVertical: espaciado.e4,
    borderRadius: 6,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
  },
  badgeSmall: { paddingHorizontal: espaciado.e6, paddingVertical: espaciado.e2, borderRadius: 5 },
  text: { fontSize: tipografia.micro, fontWeight: peso.fuerte, lineHeight: 14 },
  textSmall: { fontSize: 10, lineHeight: 12 },
});
