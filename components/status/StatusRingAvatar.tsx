/**
 * StatusRingAvatar — avatar con ANILLO de estado 24h.
 * Si el usuario tiene estado activo, el avatar se rodea de un halo de
 * `ringWidth` px con el degradado del fondo del preset (WeChat pinta el borde
 * con el color del estado). Sin estado → borde blanco liso (sin anillo).
 * Reutilizable en Perfil (88), Home (40) y Detalle (44).
 */

import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { absUrl } from '../../api/config';
import { statusBgColors } from '../../constants/status';
import type { UserStatus } from '../../api/status';
import { brand, peso} from '@egrouteplan/ui-kit';

export default function StatusRingAvatar({
  avatarUrl,
  name,
  status,
  size = 88,
  ringWidth = 4,
  onPress,
  ringStyle,
  defaultRingColor,
}: {
  avatarUrl?: string | null;
  name?: string | null;
  status?: UserStatus | null;
  size?: number;
  ringWidth?: number;
  onPress?: () => void;
  ringStyle?: StyleProp<ViewStyle>;
  /** Color del anillo/borde cuando NO hay estado (blanco por defecto). */
  defaultRingColor?: string;
}) {
  const [c1, c2] = statusBgColors(status?.preset.bg);
  const radius = size / 2;
  const src = avatarUrl ? absUrl(avatarUrl) : null;
  const inner = src
    ? <Image source={{ uri: src }} style={styles.img} />
    : (
      <View style={[styles.fallback, { backgroundColor: 'rgba(0,0,0,0.30)' }]}>
        <Text style={[styles.initial, { fontSize: size * 0.4 }]}>
          {(name ?? 'U').trim().charAt(0).toUpperCase()}
        </Text>
      </View>
    );

  const avatarBody = status ? (
    <View style={{ width: size + ringWidth * 2, height: size + ringWidth * 2, borderRadius: radius + ringWidth, overflow: 'hidden', borderWidth: 0 }}>
      {/* Halo degradado: se pinta como fondo del contenedor y el avatar va dentro
          con un margen = ringWidth → efecto de anillo. */}
      <Svg height="100%" width="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgLinearGradient id={`ring-${status.id}`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={c1} />
            <Stop offset="1" stopColor={c2} />
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#ring-${status.id})`} />
      </Svg>
      <View style={{ position: 'absolute', top: ringWidth, left: ringWidth, width: size, height: size, borderRadius: radius, overflow: 'hidden', backgroundColor: brand.white }}>
        {inner}
      </View>
    </View>
  ) : (
    <View style={{ width: size, height: size, borderRadius: radius, overflow: 'hidden', borderWidth: 2, borderColor: defaultRingColor ?? 'rgba(255,255,255,0.95)' }}>
      {inner}
    </View>
  );

  if (!onPress) return avatarBody;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={status ? `Avatar de ${name ?? 'usuario'} con estado: ${status.preset.emoji} ${status.text || status.preset.label}` : `Avatar de ${name ?? 'usuario'}`}
      style={({ pressed }) => [ringStyle, { opacity: pressed ? 0.85 : 1 }]}
    >
      {avatarBody}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  img: { width: '100%', height: '100%' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  initial: { color: brand.white, fontWeight: peso.titulo },
});
