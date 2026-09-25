/**
 * SearchHeader — panel de búsqueda tipo DiDi (rediseño 2026-09-04).
 * Patrón capturado en ref-didi-home.png / ref-didi-search.png:
 *   · Fila 1 (origen): punto azul + "{ciudad} · Ubicación actual" clicable
 *     (abre el selector de ciudad) con chevron.
 *   · Campo destino GIGANTE "¿A dónde vas?": NO es un TextInput estático —
 *     es un botón que abre la pantalla de búsqueda /buscar (DiDi: el tap va a
 *     una pantalla de búsqueda con autofoco, atajos y sugerencias).
 * Accesibilidad: cada elemento con rol/etiqueta propios.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { MapPin, ChevronDown, Search, Mic } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { brand, elevation, espaciado, radios, tipografia, peso} from '@egrouteplan/ui-kit';

export default function SearchHeader({
  city,
  cityName,
  onPressCity,
  glass = false,
}: {
  city: string;
  cityName?: string;
  onPressCity: () => void;
  /** Modo glassmorphism: tarjeta "¿A dónde vas?" translúcida (Home social). */
  glass?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const router = useRouter();

  const glassBg = isDark ? 'rgba(35,35,41,0.55)' : 'rgba(255,255,255,0.62)';
  const glassBorder = isDark ? 'rgba(255,255,255,0.20)' : 'rgba(255,255,255,0.85)';
  const glassSurface = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.5)';

  return (
    <View>
      {/* Fila origen — punto verde (origen real dentro de la ciudad), clicable */}
      <Pressable
        onPress={onPressCity}
        accessibilityRole="button"
        accessibilityLabel={`Ubicación actual ${city}, cambiar`}
        style={({ pressed }) => [styles.locationRow, { opacity: pressed ? 0.7 : 1 }]}
      >
        <View style={[styles.originDot, { backgroundColor: brand.success }]} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.locationText, { color: colors.textPrimary }]} numberOfLines={1}>
            {city}
          </Text>
          <Text style={[styles.cityName, { color: colors.textSecondary }]}>
            {cityName ? `En ${cityName} · toca para cambiar de ciudad` : 'Ubicación actual'}
          </Text>
        </View>
        <ChevronDown size={15} color={colors.textSecondary} />
      </Pressable>

      {/* Campo destino — botón que abre /buscar (patrón DiDi / glass) */}
      <Pressable
        onPress={() => router.push({ pathname: '/buscar', params: { city: cityName ?? city } } as never)}
        accessibilityRole="button"
        accessibilityLabel="¿A dónde vas?"
        accessibilityHint="Abre la búsqueda de destino"
        style={({ pressed }) => [
          styles.destBox,
          glass
            ? { backgroundColor: glassBg, borderColor: glassBorder, opacity: pressed ? 0.8 : 1 }
            : { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.85 : 1 },
        ]}
      >
        <View style={[styles.searchIconWrap, glass ? { backgroundColor: glassSurface } : { backgroundColor: alpha(colors.primary, 0.1) }]}>
          <Search size={18} color={colors.primary} />
        </View>
        <Text style={[styles.destText, { color: colors.textPrimary }]}>¿A dónde vas?</Text>
        <View style={[styles.micWrap, glass ? { backgroundColor: glassSurface } : { backgroundColor: colors.surface }]}>
          <Mic size={15} color={colors.textSecondary} />
        </View>
      </Pressable>
    </View>
  );
}

// alpha local (evita import circular si constants/colors cambia): misma impl.
function alpha(hex: string, opacity: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

const styles = StyleSheet.create({
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, paddingVertical: espaciado.e2 },
  originDot: { width: 11, height: 11, borderRadius: 6 },
  locationText: { fontSize: 15, fontWeight: peso.maximo, letterSpacing: 0.1 },
  cityName: { fontSize: tipografia.caption, fontWeight: peso.medio, marginTop: 1 },
  destBox: {
    marginTop: espaciado.e12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.e10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radios.full,
    paddingHorizontal: espaciado.e12,
    paddingVertical: espaciado.e8,
    ...elevation.sm,
  },
  searchIconWrap: { width: 34, height: 34, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center' },
  destText: { flex: 1, fontSize: tipografia.subtitle, fontWeight: peso.fuerte, paddingVertical: espaciado.e4 },
  micWrap: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
