/**
 * Stub de detalle de servicio (navegación simulada).
 * Recibe /service/taxi, /service/paquete, /service/buscar?q=…, etc.
 * Listo para conectar con el backend mobility (schema mobility).
 */

import React from 'react';
import { espaciado, tipografia, peso, trazo, radios} from '@egrouteplan/ui-kit';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { SERVICES } from '../../constants/data';
import { useTheme } from '../../theme/ThemeContext';

export default function ServiceDetailStub() {
  const { id, q } = useLocalSearchParams<{ id: string; q?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const service = SERVICES.find((s) => s.id === id);
  const title = service?.label ?? (id === 'buscar' ? 'Buscar destino' : `Servicio ${id}`);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 10 }]}>
      <Pressable onPress={() => router.back()} style={styles.back} accessibilityLabel="Volver">
        <ArrowLeft size={22} color={colors.textPrimary} />
      </Pressable>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      {!!q && (
        <Text style={[styles.query, { color: colors.textSecondary }]}>Destino: “{q}”</Text>
      )}
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.cardText, { color: colors.textSecondary }]}>
          Vista de detalle en construcción. Aquí irá el flujo de “{title}”
          conectado al backend de movilidad (schema mobility, tabla service_orders).
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: espaciado.e20 },
  back: { width: 40, height: 40, justifyContent: 'center' },
  title: { fontSize: tipografia.tituloFicha, fontWeight: peso.maximo, marginTop: espaciado.e8 },
  query: { fontSize: tipografia.body, marginTop: espaciado.e4 },
  card: { marginTop: espaciado.e20, borderRadius: radios.panel, borderWidth: trazo.fino, padding: espaciado.e18 },
  cardText: { fontSize: tipografia.body, lineHeight: 19 },
});
