/**
 * KycStatusBanner — banner de estado KYC para los SAD PATHS sin bloqueo.
 *   · review  → NARANJA ámbar (revisión manual 24–48 h, no bloquea la app)
 *   · success → VERDE (aprobado)
 *   · error   → ROJO (rechazado — único uso del rojo)
 * Mensajes siempre en lenguaje humano, sin jerga técnica.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Clock, CheckCircle2, AlertTriangle, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { alpha, type ThemeColors } from '../theme/colors';
import { trazoIcono } from '../theme/escalas';

type BannerTone = 'review' | 'success' | 'error';

/**
 * `Exclude<…, 'text'>`: la paleta dejó de ser PLANA con la tanda A2 — `colors.text` es un GRUPO (un
 * objeto de 10 acentos resueltos por tema), no un color. Un índice dinámico sobre `keyof ThemeColors`
 * devolvería `string | AcentoTexto`, y `alpha()` o `color:` no aceptan un objeto. Se excluye la clave
 * del grupo y el mapa sigue leyendo solo colores planos.
 */
const TONE_MAP: Record<BannerTone, { colorKey: Exclude<keyof ThemeColors, 'text'>; Icon: LucideIcon }> = {
  review: { colorKey: 'secondary', Icon: Clock },
  success: { colorKey: 'success', Icon: CheckCircle2 },
  error: { colorKey: 'danger', Icon: AlertTriangle },
};

export function KycStatusBanner({
  tone,
  title,
  message,
  actionLabel,
  onAction,
}: {
  tone: BannerTone;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const { colors } = useTheme();
  const { colorKey, Icon } = TONE_MAP[tone];
  const tint = colors[colorKey];

  return (
    <View
      style={[styles.card, { backgroundColor: alpha(tint, 0.08), borderColor: alpha(tint, 0.35) }]}
      accessibilityLiveRegion="polite"
    >
      <View style={[styles.iconWrap, { backgroundColor: alpha(tint, 0.15) }]}>
        <Icon size={20} color={tint} strokeWidth={trazoIcono.fuerte} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: tint }]}>{title}</Text>
        <Text style={[styles.message, { color: colors.textPrimary }]}>{message}</Text>
        {actionLabel && onAction ? (
          <Pressable onPress={onAction} accessibilityRole="button" accessibilityLabel={actionLabel} hitSlop={8}>
            <Text style={[styles.action, { color: tint }]}>{actionLabel} →</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 1,
    padding: 13,
    gap: 11,
    alignItems: 'flex-start',
  },
  iconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  title: { fontSize: 13.5, fontWeight: '800' },
  message: { fontSize: 12, marginTop: 3, lineHeight: 17 },
  action: { fontSize: 12.5, fontWeight: '800', marginTop: 8 },
});
