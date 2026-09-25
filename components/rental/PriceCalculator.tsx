/**
 * PriceCalculator — calculadora de coste mensual real (kit rental).
 * Renta + estimaciones de electricidad (por tamaño y personas), agua,
 * internet y generador/apoyo energético. Solo para largo plazo con renta;
 * no aplica a terrenos ni corto plazo exclusivo.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';
import { alpha, brand, espaciado, radios, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import type { RentalProperty } from '../../api/rental';
import { formatXAF, isLandType } from '../../utils/formatHelpers';

const MIN_PEOPLE = 1;
const MAX_PEOPLE = 10;

const UTILITY_ESTIMATES = {
  electricityBase: 15000,
  electricityMedium: 25000,
  electricityLarge: 35000,
  electricityPerExtraPerson: 4000,
  waterBase: 8000,
  waterPerExtraPerson: 2000,
  internet: 25000,
  generatorNormal: 12000,
  generatorHigh: 30000,
  noGeneratorHighSupport: 45000,
  defaultSize: 60,
};

const safeNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampPeople = (value: string): number => {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) return MIN_PEOPLE;
  return Math.min(MAX_PEOPLE, Math.max(MIN_PEOPLE, parsed));
};

const Row = ({ label, value }: { label: string; value: string }) => {
  const { colors } = useTheme();
  return (
    <View style={[rowStyles.row, { borderBottomColor: colors.border }]}>
      <Text style={[rowStyles.label, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[rowStyles.value, { color: colors.textPrimary }]}>{value}</Text>
    </View>
  );
};

export function PriceCalculator({ property, style }: { property: RentalProperty; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const config = UTILITY_ESTIMATES;

  const rent = safeNumber(property?.price?.monthlyRent, 0);
  const isLand = isLandType(property?.type ?? '');
  const isShortTermOnly = property?.rentalType === 'short_term';
  const hasGenerator = Boolean(property?.essentialServices?.generator);
  const initialInternet = Boolean(property?.essentialServices?.internet ?? false);

  const [peopleInput, setPeopleInput] = useState('2');
  const [includeInternet, setIncludeInternet] = useState(initialInternet);
  const [highEnergyUse, setHighEnergyUse] = useState(false);

  const people = clampPeople(peopleInput);

  const estimates = useMemo(() => {
    const size = safeNumber(property?.size ?? property?.landSize, config.defaultSize);

    let electricity = config.electricityBase;
    if (size > 150) electricity = config.electricityLarge;
    else if (size > 100) electricity = config.electricityMedium;
    electricity += (people - 1) * config.electricityPerExtraPerson;

    const water = config.waterBase + (people - 1) * config.waterPerExtraPerson;
    const internet = includeInternet ? config.internet : 0;

    let energySupport = 0;
    if (hasGenerator) energySupport = highEnergyUse ? config.generatorHigh : config.generatorNormal;
    else if (highEnergyUse) energySupport = config.noGeneratorHighSupport;

    return { electricity, water, internet, energySupport, total: rent + electricity + water + internet + energySupport };
  }, [property?.size, property?.landSize, people, includeInternet, highEnergyUse, hasGenerator, rent, config]);

  if (!property || isLand || isShortTermOnly || rent <= 0) return null;

  const handlePeopleChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    setPeopleInput(cleaned.slice(0, 2));
  };

  const s = styles(colors);
  return (
    <View style={[s.container, { borderColor: colors.border }, style]}>
      <Text style={[s.title, { color: colors.textPrimary }]}>Calcula tu coste mensual real</Text>
      <Text style={[s.subtitle, { color: colors.textSecondary }]}>Estimación orientativa para Malabo / Bata</Text>

      {/* Controles */}
      <View style={s.controls}>
        <View style={s.controlRow}>
          <Text style={[s.controlLabel, { color: colors.textPrimary }]}>Personas en la vivienda</Text>
          <TextInput
            style={[s.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.textPrimary }]}
            value={peopleInput}
            onChangeText={handlePeopleChange}
            keyboardType="numeric"
            maxLength={2}
            accessibilityLabel="Número de personas en la vivienda"
          />
        </View>

        <ToggleRow
          label="Incluir Internet"
          value={includeInternet}
          onPress={() => setIncludeInternet((p) => !p)}
          activeText="Sí"
          inactiveText="No"
        />

        <ToggleRow
          label={hasGenerator ? 'Uso frecuente de generador' : 'Apoyo energético por cortes'}
          value={highEnergyUse}
          onPress={() => setHighEnergyUse((p) => !p)}
          activeText="Alto"
          inactiveText="Normal"
        />
      </View>

      {/* Desglose */}
      <View style={[s.breakdown, { backgroundColor: colors.card }]}>
        <Row label="Renta" value={formatXAF(rent)} />
        <Row label="Electricidad (estimada)" value={formatXAF(estimates.electricity)} />
        <Row label="Agua" value={formatXAF(estimates.water)} />
        <Row label="Internet" value={formatXAF(estimates.internet)} />
        <Row
          label={hasGenerator ? 'Generador / combustible' : 'Apoyo energético (estimado)'}
          value={formatXAF(estimates.energySupport)}
        />
        <View style={[s.totalRow, { borderTopColor: colors.border }]}>
          <Text style={[s.totalLabel, { color: colors.textPrimary }]}>Total estimado / mes</Text>
          <Text style={[s.totalValue, { color: colors.primary }]}>{formatXAF(estimates.total)}</Text>
        </View>
      </View>

      <Text style={[s.disclaimer, { color: colors.textSecondary }]}>
        * Los valores de luz, agua e internet son estimaciones medias. Pueden variar según consumo real, zona y tarifas del proveedor.
      </Text>
    </View>
  );
}

function ToggleRow({ label, value, onPress, activeText, inactiveText }: { label: string; value: boolean; onPress: () => void; activeText: string; inactiveText: string }) {
  const { colors } = useTheme();
  return (
    <Pressable style={({ pressed }) => [s2.toggleRow, pressed && { opacity: 0.7 }]} onPress={onPress} accessibilityRole="switch" accessibilityState={{ checked: value }}>
      <Text style={[s2.controlLabel, { color: colors.textPrimary }]}>{label}</Text>
      <View style={[s2.toggle, { backgroundColor: value ? colors.primary : colors.border }]}>
        <Text style={[s2.toggleText, !value && { color: colors.textSecondary }]}>{value ? activeText : inactiveText}</Text>
      </View>
    </Pressable>
  );
}

const s2 = StyleSheet.create({
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: espaciado.e10 },
  controlLabel: { fontSize: tipografia.body, flex: 1, marginRight: espaciado.e12 },
  toggle: { paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e6, borderRadius: 20, minWidth: 64, alignItems: 'center' },
  toggleText: { fontSize: tipografia.body, fontWeight: peso.medio, color: brand.white },
});

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  container: { borderRadius: 14, padding: espaciado.e16, marginBottom: espaciado.e20, borderWidth: 1, backgroundColor: c.surface },
  title: { fontSize: tipografia.subtitle, fontWeight: '700', marginBottom: espaciado.e4 },
  subtitle: { fontSize: tipografia.caption, marginBottom: espaciado.e14 },
  controls: { marginBottom: espaciado.e16 },
  controlRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: espaciado.e12 },
  controlLabel: { fontSize: tipografia.body, flex: 1, marginRight: espaciado.e12 },
  input: { borderWidth: 1, borderRadius: radios.sm, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8, width: 60, textAlign: 'center', fontSize: 15, fontWeight: peso.medio },
  breakdown: { borderRadius: 10, padding: espaciado.e14 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: espaciado.e12, marginTop: espaciado.e4, gap: espaciado.e12, borderTopWidth: 1 },
  totalLabel: { fontSize: 15, fontWeight: '700', flex: 1 },
  totalValue: { fontSize: tipografia.subtitle, fontWeight: '800' },
  disclaimer: { fontSize: tipografia.micro, marginTop: espaciado.e12, lineHeight: 16 },
});

const rowStyles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: espaciado.e8, borderBottomWidth: 1, gap: espaciado.e12 },
  label: { fontSize: tipografia.body, flex: 1 },
  value: { fontSize: tipografia.body, fontWeight: peso.medio },
});
