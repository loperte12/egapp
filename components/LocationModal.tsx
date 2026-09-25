/**
 * LocationModal — selector de ciudad (bottom card) con las ciudades de
 * Guinea Ecuatorial, agrupadas por provincia y con SCROLL (auditoría:
 * 24 filas sin scroll quedaban fuera de pantalla en móviles pequeños).
 * Controlado por la Home (visible / onClose / onSelect).
 *
 * Correcciones (auditoría 2026-09-02):
 *  · ScrollView + secciones por provincia (regresión del borrador evitada).
 *  · Fila como radio con accessibilityState.selected + hint (provincia).
 *  · hitSlop/ripple/testID; paddingBottom con insets (home indicator iOS).
 *  · Sin importantForAccessibility="no-hide-descendants" en el backdrop:
 *    eso ocultaría TODA la tarjeta a los lectores (la tarjeta es su hija).
 */

import React, { useMemo } from 'react';
import { espaciado, radios, tipografia, peso} from '@egrouteplan/ui-kit';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MapPin, X, Check } from 'lucide-react-native';
import { CITIES, type City } from '../constants/data';
import { alpha } from '../constants/colors';
import { useTheme } from '../theme/ThemeContext';

export default function LocationModal({
  visible,
  currentCityId,
  onClose,
  onSelect,
}: {
  visible: boolean;
  currentCityId: string;
  onClose: () => void;
  onSelect: (city: City) => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  // CITIES ya vienen agrupadas por provincia: secciones con su orden.
  const sections = useMemo(() => {
    const out: Array<{ region: string; cities: City[] }> = [];
    for (const city of CITIES) {
      const last = out[out.length - 1];
      if (last && last.region === city.region) last.cities.push(city);
      else out.push({ region: city.region, cities: [city] });
    }
    return out;
  }, []);

  if (sections.length === 0) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
        <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
          <View style={[styles.card, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Elige tu ciudad</Text>
            <Text style={{ color: colors.textSecondary, textAlign: 'center', marginTop: espaciado.e20 }}>No hay ciudades disponibles.</Text>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} accessibilityViewIsModal>
        <Pressable
          style={[styles.card, { backgroundColor: colors.card, paddingBottom: insets.bottom + 24 }]}
          onPress={(e) => e.stopPropagation()}
          accessibilityRole="none"
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.textPrimary }]} accessibilityRole="header">
              Elige tu ciudad
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Cerrar"
              accessibilityHint="Cierra el selector de ciudad"
              testID="location-modal-close"
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
            >
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: '72%' }} showsVerticalScrollIndicator={false}>
            {sections.map((sec) => (
              <View key={sec.region}>
                <Text style={[styles.sectionHeader, { color: colors.textSecondary }]}>{sec.region}</Text>
                {sec.cities.map((city) => {
                  const active = city.id === currentCityId;
                  return (
                    <Pressable
                      key={city.id}
                      onPress={() => { onSelect(city); onClose(); }}
                      testID={`location-modal-city-${city.id}`}
                      accessibilityRole="radio"
                      accessibilityLabel={city.name}
                      accessibilityHint={`Provincia ${sec.region}. Toca para seleccionar`}
                      accessibilityState={{ selected: active }}
                      android_ripple={{ color: alpha(colors.primary, 0.1), borderless: false, foreground: true }}
                      style={({ pressed }) => [
                        styles.row,
                        { backgroundColor: pressed ? alpha(colors.primary, 0.06) : active ? alpha(colors.primary, 0.04) : 'transparent' },
                      ]}
                    >
                      <View style={[styles.pinWrap, { backgroundColor: active ? alpha(colors.primary, 0.15) : alpha(colors.primary, 0.08) }]}>
                        <MapPin size={16} color={active ? colors.primary : colors.textSecondary} />
                      </View>
                      <View style={styles.rowText}>
                        <Text style={[styles.cityName, { color: active ? colors.primary : colors.textPrimary, fontWeight: active ? '800' : '700' }]}>
                          {city.name}
                        </Text>
                      </View>
                      {active && <Check size={18} color={colors.primary} />}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  card: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: espaciado.e20,
    paddingTop: espaciado.e18,
    maxHeight: '85%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espaciado.e10 },
  title: { fontSize: 17, fontWeight: peso.maximo },
  sectionHeader: { fontSize: tipografia.micro, fontWeight: peso.maximo, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: espaciado.e10, marginBottom: espaciado.e2, marginLeft: espaciado.e8 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: espaciado.e11, paddingHorizontal: espaciado.e8, borderRadius: 14, marginBottom: espaciado.e4 },
  pinWrap: { width: 34, height: 34, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, marginLeft: espaciado.e12 },
  cityName: { fontSize: 15 },
});
