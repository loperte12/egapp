/**
 * DocumentChoiceTree — árbol de decisión documental 100% SERVER-DRIVEN.
 * Renderiza las `docOptions` que devuelve el backend (contrato KycDocOption);
 * la app NO contiene lógica de qué documento pedir: solo pinta y emite la elección.
 * Tarjeta seleccionada: borde azul primario + check verde éxito.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { FileText, BookOpen, IdCard, GraduationCap, Check, type LucideIcon } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { alpha } from '../theme/colors';

export interface DocOptionItem {
  docType: string;
  sides: string[];
  title: string;
  subtitle: string;
}

const DOC_ICONS: Record<string, LucideIcon> = {
  DIP: IdCard,
  TUTOR_DIP: IdCard,
  PASSPORT: BookOpen,
  RESIDENCE_CARD: FileText,
  SCHOOL_ID: GraduationCap,
};

export function DocumentChoiceTree({
  options,
  selected,
  onSelect,
}: {
  options: DocOptionItem[];
  selected: string | null;
  onSelect: (docType: string) => void;
}) {
  const { colors } = useTheme();

  return (
    <View style={styles.wrap}>
      {options.map((opt) => {
        const Icon = DOC_ICONS[opt.docType] ?? FileText;
        const isSelected = selected === opt.docType;
        return (
          <Pressable
            key={opt.docType}
            onPress={() => onSelect(opt.docType)}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${opt.title}. ${opt.subtitle}`}
            style={({ pressed }) => [
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: isSelected ? colors.primary : colors.border,
                shadowColor: colors.shadow,
                opacity: pressed ? 0.92 : 1,
              },
            ]}
          >
            <View style={[styles.iconWrap, { backgroundColor: alpha(colors.primary, 0.1) }]}>
              <Icon size={22} color={colors.primary} strokeWidth={2} />
            </View>
            <View style={styles.body}>
              <Text style={[styles.title, { color: colors.textPrimary }]}>{opt.title}</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                {opt.subtitle}
                {opt.sides.length > 1 ? ` · ${opt.sides.length} caras` : ''}
              </Text>
            </View>
            <View
              style={[
                styles.check,
                {
                  backgroundColor: isSelected ? colors.success : 'transparent',
                  borderColor: isSelected ? colors.success : colors.border,
                },
              ]}
            >
              {isSelected && <Check size={14} color="#FFFFFF" strokeWidth={3} />}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 14,
    gap: 12,
    elevation: 2,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  iconWrap: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  title: { fontSize: 15, fontWeight: '800' },
  subtitle: { fontSize: 12, marginTop: 2 },
  check: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, alignItems: 'center', justifyContent: 'center',
  },
});
