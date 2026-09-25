/**
 * Stub del escáner/traductor de documentos a español (botón MapTools).
 * La producción usará expo-camera + OCR; aquí queda el punto de entrada.
 */

import React from 'react';
import { espaciado, tipografia, peso} from '@egrouteplan/ui-kit';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ScanLine } from 'lucide-react-native';
import { alpha } from '../constants/colors';
import { useTheme } from '../theme/ThemeContext';

export default function ScannerStub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 10 }]}>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Volver">
        <ArrowLeft size={22} color={colors.textPrimary} />
      </Pressable>
      <View style={[styles.frame, { borderColor: colors.primary, backgroundColor: alpha(colors.primary, 0.06) }]}>
        <ScanLine size={44} color={colors.primary} />
        <Text style={[styles.title, { color: colors.textPrimary }]}>Escáner de documentos</Text>
        <Text style={[styles.note, { color: colors.textSecondary }]}>
          Apunta la cámara al documento para traducirlo a español.
          (Implementación con expo-camera + OCR en la siguiente iteración.)
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: espaciado.e20 },
  back: { width: 40, height: 40, justifyContent: 'center' },
  frame: { marginTop: espaciado.e24, borderRadius: 24, borderWidth: 1.5, borderStyle: 'dashed', padding: espaciado.e30, alignItems: 'center' },
  title: { fontSize: 18, fontWeight: peso.maximo, marginTop: espaciado.e14 },
  note: { fontSize: tipografia.caption, lineHeight: 18, marginTop: espaciado.e8, textAlign: 'center' },
});
