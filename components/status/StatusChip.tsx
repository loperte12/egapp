/**
 * StatusChip — píldora del ESTADO 24H (v3, sobria).
 * Muestra: punto/anillo de color del preset + emoji + línea corta + reloj con
 * el tiempo restante (countdown con reloj de servidor). Fondo neutro ligero
 * con borde; el color del preset solo como acento (NO tarjetas de degradado
 * gigantes).
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Clock } from 'lucide-react-native';
import { useTheme } from '../../theme/ThemeContext';
import { statusBgColors, remainingShort } from '../../constants/status';
import { useServerClock, formatRemainingMs } from '../../hooks/useServerClock';
import type { UserStatus } from '../../api/status';
import { brand, tipografia, radios } from '@egrouteplan/ui-kit';

export default function StatusChip({
  status,
  onPress,
  compact,
  foreground,
  onExpired,
}: {
  status: UserStatus;
  onPress?: () => void;
  /** compact: versión minúscula (Home / listas). */
  compact?: boolean;
  /** Color del texto cuando el chip va sobre una portada/imagen. */
  foreground?: string;
  /** Se llama cuando el countdown llega a 0 (el padre decide ocultar). */
  onExpired?: () => void;
}) {
  const { colors } = useTheme();
  const nowS = useServerClock(30_000); // tick cada 30 s con reloj del servidor
  const expiresMs = status.expiresAt ? new Date(status.expiresAt).getTime() : 0;
  const remainingMs = expiresMs ? Math.max(0, expiresMs - (nowS)) : 0;

  React.useEffect(() => {
    if (remainingMs <= 0 && expiresMs && onExpired) {
      const t = setTimeout(onExpired, 400);
      return () => clearTimeout(t);
    }
  }, [remainingMs, expiresMs, onExpired]);

  const [c1, c2] = statusBgColors(status.preset.bg);
  const label = status.text || status.preset.label || 'Estado';
  const remaining = status.remainingSeconds != null && status.remainingSeconds <= 0
    ? '—'
    : remainingShort(remainingMs);

  const chip = (
    <View
      style={[
        styles.chip,
        compact && styles.chipCompact,
        { backgroundColor: compact ? 'rgba(255,255,255,0.16)' : colors.surface, borderColor: 'rgba(255,255,255,0.28)' },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: c1 }]} />
      <Text style={[styles.emoji, compact && styles.emojiCompact]}>{status.preset.emoji}</Text>
      <Text style={[styles.text, compact && styles.textCompact, { color: foreground ?? (compact ? brand.white : colors.textPrimary) }]} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.timeRow}>
        <Clock size={compact ? 9 : 10} color={foreground ?? (compact ? 'rgba(255,255,255,0.9)' : colors.textSecondary)} />
        <Text style={[styles.time, compact && styles.timeCompact, { color: foreground ?? (compact ? 'rgba(255,255,255,0.95)' : colors.textSecondary) }]}>
          {remaining}
        </Text>
      </View>
    </View>
  );

  if (!onPress) return chip;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Estado: ${status.preset.emoji} ${label}. Quedan ${formatRemainingMs(remainingMs)}. Toca para ver`}
      style={({ pressed }) => ({ alignSelf: 'flex-start', opacity: pressed ? 0.85 : 1 })}
    >
      {chip}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    alignSelf: 'flex-start',
    borderRadius: radios.full,
    borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 5,
    marginTop: 4,
  },
  chipCompact: { paddingHorizontal: 8, paddingVertical: 2.5, marginTop: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  emoji: { fontSize: tipografia.body },
  emojiCompact: { fontSize: 10 },
  text: { fontSize: tipografia.caption, fontWeight: '800', maxWidth: 180 },
  textCompact: { fontSize: 10.5, maxWidth: 140 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 2 },
  time: { fontSize: 10, fontWeight: '700' },
  timeCompact: { fontSize: 8.5 },
});
