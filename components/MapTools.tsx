/**
 * MapTools — botones flotantes superiores-derecha sobre el mapa:
 *   · Recentrar en la ciudad activa (label honesto vía `recenterLabel`).
 *   · Escáner / traducción de documentos.
 *
 * Correcciones (auditoría 2026-09-02):
 *  · `recenterLabel` propagable (la Home dice "Centrar en {ciudad}" — sin GPS
 *    no hay "mi ubicación").
 *  · accessibilityHint separado; hitSlop 44px mínimo; ripple nativo Android.
 *  · Sombras solo iOS / elevation solo Android. Sin accessibilityElementsHidden
 *    (eso ocultaría los botones de los lectores).
 */

import React from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LocateFixed, ScanLine, Cross } from 'lucide-react-native';
import { alpha } from '../constants/colors';
import { useTheme } from '../theme/ThemeContext';
import { brand } from '@egrouteplan/ui-kit';

export default function MapTools({ onRecenter, recenterLabel = 'Centrar en mi ubicación', topOffset = 10, onEmergency }: {
  onRecenter: () => void;
  recenterLabel?: string;
  /** Desplazamiento desde la safe-area (la Home social lo baja bajo la portada). */
  topOffset?: number;
  /** Abre el modal de emergencia (botón flotante con cruz médica, sobre el mapa). */
  onEmergency?: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.stack, { top: insets.top + topOffset }]} pointerEvents="box-none">
      {onEmergency && (
        <ToolButton
          label="Emergencia"
          hint="Llama a Policía, Hospital o emergencias"
          onPress={onEmergency}
          colors={colors}
          danger
          icon={<Cross size={22} color={brand.white} strokeWidth={2.6} />}
          testID="map-tools-emergency"
        />
      )}
      <ToolButton
        label={recenterLabel}
        hint="Te centra en tu posición GPS real dentro de Guinea Ecuatorial (o en la ciudad activa)"
        onPress={onRecenter}
        colors={colors}
        icon={<LocateFixed size={20} color={colors.primary} />}
        testID="map-tools-recenter"
      />
      <ToolButton
        label="Escanear documento"
        hint="Abre el escáner para traducir documentos"
        onPress={() => router.push('/scanner' as any)}
        colors={colors}
        icon={<ScanLine size={20} color={colors.primary} />}
        testID="map-tools-scanner"
      />
    </View>
  );
}

function ToolButton({ label, hint, onPress, colors, danger, icon, testID }: {
  label: string;
  hint: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
  danger?: boolean;
  icon: React.ReactNode;
  testID?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      android_ripple={{ color: 'rgba(0,132,255,0.12)', borderless: true, foreground: true, radius: 22 }}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: danger ? colors.danger : colors.card,
          borderColor: danger ? alpha(colors.danger, 0.4) : colors.border,
          opacity: pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        },
      ]}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stack: { position: 'absolute', right: 16, zIndex: 20, gap: 10 },
  button: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    ...Platform.select({
      ios: { shadowColor: '#17171A', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 10 },
      android: { elevation: 4 },
    }),
  },
});
