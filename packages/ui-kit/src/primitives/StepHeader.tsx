/**
 * StepHeader — cabecera de paso con barra de progreso segmentada azul.
 * Visible en TODAS las pantallas de flujos guiados (auth, KYC, recovery).
 * Título ≤ 5 palabras + subtítulo de 1 línea (regla DiDi).
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { alpha } from '../theme/colors';

export type StepState = 'normal' | 'review' | 'error';

export function StepHeader({
  step,
  total,
  title,
  subtitle,
  state = 'normal',
}: {
  step: number;      // 1-based
  total: number;
  title: string;
  subtitle?: string;
  /** Estado del paso ACTUAL (server-driven): normal=azul, review=ámbar, error=rojo. */
  state?: StepState;
}) {
  const { colors } = useTheme();
  const currentColor =
    state === 'review' ? colors.secondary : state === 'error' ? colors.danger : colors.primary;

  return (
    <View style={styles.wrap}>
      {/* Barra de progreso: pasados en VERDE éxito, actual por estado, pendientes gris */}
      <View style={styles.bar} accessibilityLabel={`Paso ${step} de ${total}`}>
        {Array.from({ length: total }).map((_, i) => {
          const isPast = i < step - 1;
          const isCurrent = i === step - 1;
          return (
            <View
              key={i}
              style={[
                styles.segment,
                {
                  backgroundColor: isPast
                    ? colors.success
                    : isCurrent
                      ? currentColor
                      : alpha(colors.textSecondary, 0.2),
                },
              ]}
            />
          );
        })}
      </View>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={2}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  bar: { flexDirection: 'row', gap: 6, marginBottom: 16 },
  segment: { flex: 1, height: 4, borderRadius: 2 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  subtitle: { fontSize: 13, marginTop: 6, lineHeight: 18 },
});
