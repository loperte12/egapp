/**
 * Stub de detalle de oferta promocional (navegación simulada).
 * Recibe /promo/bebidas, /promo/trabajos, /promo/alquileres.
 */

import React from 'react';
import { espaciado, tipografia, peso} from '@egrouteplan/ui-kit';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { PROMOS } from '../../constants/data';
import { alpha } from '../../constants/colors';
import { useTheme } from '../../theme/ThemeContext';

export default function PromoDetailStub() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const promo = PROMOS.find((p) => p.id === id);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 10 }]}>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Volver">
        <ArrowLeft size={22} color={colors.textPrimary} />
      </Pressable>

      <View style={[styles.hero, { backgroundColor: alpha(colors.secondary, 0.12), borderColor: alpha(colors.secondary, 0.35) }]}>
        <Text style={styles.emoji}>{promo?.emoji ?? '🎁'}</Text>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{promo?.title ?? `Oferta ${id}`}</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>{promo?.subtitle}</Text>
      </View>

      <Text style={[styles.note, { color: colors.textSecondary }]}>
        Vista de oferta en construcción: aquí irá el detalle completo con
        comercios asociados, condiciones y canje.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: espaciado.e20 },
  back: { width: 40, height: 40, justifyContent: 'center' },
  hero: { marginTop: espaciado.e12, borderRadius: 20, borderWidth: 1, padding: espaciado.e22, alignItems: 'center' },
  emoji: { fontSize: 46 },
  title: { fontSize: tipografia.title, fontWeight: peso.maximo, marginTop: espaciado.e10, textAlign: 'center' },
  subtitle: { fontSize: tipografia.body, marginTop: espaciado.e6, textAlign: 'center' },
  note: { fontSize: tipografia.caption, lineHeight: 18, marginTop: espaciado.e18, textAlign: 'center' },
});
