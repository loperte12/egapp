/**
 * LocationBadge — badge fijo superior-izquierda con pin + ciudad actual.
 * onPress abre el LocationModal (gestionado por la Home).
 *
 * Correcciones (auditoría 2026-09-02):
 *  · Fallback si `city` llega vacío ("Seleccionar ciudad", en gris/italica).
 *  · `accessibilityHint` separado; hitSlop generoso; ripple nativo Android.
 *  · Sombras solo iOS / elevation solo Android (sin warnings cross-platform).
 *  · maxWidth 140 + ellipsizeMode para nombres largos ("San Antonio de Palé").
 */

import React from 'react';
import { radios, tipografia } from '@egrouteplan/ui-kit';
import { Platform, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin, ChevronDown } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';

export default function LocationBadge({ city, onPress, testID }: {
  city: string;
  onPress: () => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const displayCity = city?.trim() || 'Seleccionar ciudad';
  const isPlaceholder = !city?.trim();

  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Ubicación actual: ${displayCity}`}
      accessibilityHint="Toca para cambiar de ciudad"
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      android_ripple={{ color: 'rgba(0,132,255,0.12)', borderless: true, foreground: true }}
      style={({ pressed }) => [
        styles.badge,
        {
          top: insets.top + 10,
          backgroundColor: colors.card,
          borderColor: colors.border,
          shadowColor: colors.shadow,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
      ]}
    >
      <MapPin size={15} color={isPlaceholder ? colors.textSecondary : colors.primary} />
      <Text
        style={[
          styles.label,
          { color: isPlaceholder ? colors.textSecondary : colors.textPrimary, fontStyle: isPlaceholder ? 'italic' : 'normal' },
        ]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {displayCity}
      </Text>
      <ChevronDown size={14} color={colors.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    left: 16,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radios.full,
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: { shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10 },
      android: { elevation: 4 },
    }),
  },
  label: { fontSize: tipografia.caption, fontWeight: '700', maxWidth: 230, letterSpacing: -0.2 },
});
