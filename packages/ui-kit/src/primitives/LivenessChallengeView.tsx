/**
 * LivenessChallengeView — UI del desafío de prueba de vida (server-driven).
 * Muestra las acciones devueltas por el backend (BLINK / TURN / READ_DIGITS)
 * con guía animada, progreso de captura y estado final. Sin jerga técnica.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Eye, RotateCcw, Hash, CheckCircle2 } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { alpha } from '../theme/colors';

export type LivenessMethodT = 'BLINK' | 'TURN' | 'READ_DIGITS';

const METHOD_UI: Record<LivenessMethodT, { Icon: any; title: (a: string[]) => string; hint: string }> = {
  BLINK: {
    Icon: Eye,
    title: () => 'Parpadea 2 veces',
    hint: 'Mira a la cámara y parpadea lentamente',
  },
  TURN: {
    Icon: RotateCcw,
    title: (a) => (a.includes('TURN_LEFT') ? 'Gira el rostro a la izquierda y luego a la derecha' : 'Gira el rostro lentamente'),
    hint: 'Mueve la cabeza despacio, sin sacarla del óvalo',
  },
  READ_DIGITS: {
    Icon: Hash,
    title: (a) => `Lee en voz alta: ${a.join(' · ')}`,
    hint: 'Di los números claramente, uno a uno',
  },
};

export function LivenessChallengeView({
  method,
  actions,
  capturing,
  progress, // 0..1
  done,
}: {
  method: LivenessMethodT;
  actions: string[];
  capturing: boolean;
  progress: number;
  done: boolean;
}) {
  const { colors } = useTheme();
  const [pulse, setPulse] = useState(false);
  const ui = METHOD_UI[method] ?? METHOD_UI.BLINK;

  // Pulso de guía mientras dura la captura (animación ligera sin libs nativas).
  useEffect(() => {
    if (!capturing) return;
    const i = setInterval(() => setPulse((p) => !p), 650);
    return () => clearInterval(i);
  }, [capturing]);

  return (
    <View style={styles.wrap}>
      <View
        style={[
          styles.guide,
          {
            borderColor: done ? colors.success : capturing ? colors.secondary : colors.primary,
            backgroundColor: alpha(done ? colors.success : capturing ? colors.secondary : colors.primary, pulse && capturing ? 0.16 : 0.08),
          },
        ]}
      >
        {done ? (
          <CheckCircle2 size={44} color={colors.success} strokeWidth={1.8} />
        ) : (
          <ui.Icon size={44} color={capturing ? colors.secondary : colors.primary} strokeWidth={1.8} />
        )}
      </View>

      <Text style={[styles.title, { color: colors.textPrimary }]}>{ui.title(actions)}</Text>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>{ui.hint}</Text>

      {/* Barra de progreso de captura: naranja en curso, verde al completar */}
      <View style={[styles.track, { backgroundColor: alpha(colors.textSecondary, 0.18) }]}>
        <View
          style={[
            styles.fill,
            {
              backgroundColor: done ? colors.success : colors.secondary,
              width: `${Math.round(progress * 100)}%`,
            },
          ]}
        />
      </View>
      <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
        {done ? 'Captura completada' : capturing ? 'Capturando…' : 'Preparado para capturar'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10, paddingVertical: 6 },
  guide: {
    width: 132, height: 132, borderRadius: 66, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 17, fontWeight: '800', textAlign: 'center' },
  hint: { fontSize: 12.5, textAlign: 'center', lineHeight: 17 },
  track: { width: '88%', height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 6 },
  fill: { height: 8, borderRadius: 4 },
  progressLabel: { fontSize: 11.5, fontWeight: '700' },
});
