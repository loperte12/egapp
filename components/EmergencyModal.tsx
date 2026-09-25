/**
 * EmergencyModal — acción rápida de emergencia: marcación directa a
 * Policía / Hospital / Taxi de emergencia (Linking tel:).
 * Todo el componente usa el ROJO crítico (#F53F3F) según la semántica estricta.
 */

import React from 'react';
import { espaciado, radios, tipografia, peso, trazo} from '@egrouteplan/ui-kit';
import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Siren, Phone, X, type LucideIcon } from 'lucide-react-native';
import { EMERGENCY_CONTACTS, type EmergencyContact } from '../constants/data';
import { alpha } from '../constants/colors';
import { useTheme } from '../theme/ThemeContext';

const ICONS: Record<EmergencyContact['id'], LucideIcon> = {
  policia: Siren,
  hospital: Phone,
};

export default function EmergencyModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { colors } = useTheme();

  const dial = (number: string) => {
    Linking.openURL(`tel:${number}`).catch(() => {});
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.backdrop, { backgroundColor: colors.overlay }]}>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          {/* Cabecera crítica */}
          <View style={styles.header}>
            <View style={[styles.sirenWrap, { backgroundColor: alpha(colors.danger, 0.12) }]}>
              <Siren size={22} color={colors.danger} strokeWidth={2.2} />
            </View>
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: colors.danger }]}>Emergencia</Text>
              <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                Marcación directa · disponible 24/7
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Cerrar emergencia">
              <X size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          {/* Contactos de marcación directa */}
          {EMERGENCY_CONTACTS.map((contact) => {
            const Icon = ICONS[contact.id] ?? Phone;
            return (
              <Pressable
                key={contact.id}
                onPress={() => dial(contact.number)}
                accessibilityRole="button"
                accessibilityLabel={`Llamar a ${contact.label}, ${contact.number}`}
                style={({ pressed }) => [
                  styles.contactRow,
                  {
                    backgroundColor: pressed ? alpha(colors.danger, 0.08) : alpha(colors.danger, 0.04),
                    borderColor: alpha(colors.danger, 0.25),
                  },
                ]}
              >
                <View style={[styles.contactIcon, { backgroundColor: alpha(colors.danger, 0.12) }]}>
                  <Icon size={18} color={colors.danger} />
                </View>
                <View style={styles.contactText}>
                  <Text style={[styles.contactLabel, { color: colors.textPrimary }]}>{contact.label}</Text>
                  <Text style={[styles.contactNote, { color: colors.textSecondary }]}>{contact.note}</Text>
                </View>
                <Text style={[styles.contactNumber, { color: colors.danger }]}>{contact.number}</Text>
              </Pressable>
            );
          })}

          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancelar"
            style={({ pressed }) => [styles.cancelBtn, { backgroundColor: colors.surface, opacity: pressed ? 0.8 : 1 }]}
          >
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  card: {
    borderTopLeftRadius: radios.hoja,
    borderTopRightRadius: radios.hoja,
    paddingHorizontal: espaciado.e20,
    paddingTop: espaciado.e20,
    paddingBottom: 34,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: espaciado.e16 },
  sirenWrap: { width: 44, height: 44, borderRadius: radios.lg, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, marginLeft: espaciado.e12 },
  title: { fontSize: 19, fontWeight: peso.maximo },
  subtitle: { fontSize: tipografia.caption, marginTop: espaciado.e2 },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: trazo.fino,
    borderRadius: radios.lg,
    padding: espaciado.e12,
    marginBottom: espaciado.e10,
  },
  contactIcon: { width: 38, height: 38, borderRadius: radios.contacto, alignItems: 'center', justifyContent: 'center' },
  contactText: { flex: 1, marginLeft: espaciado.e12 },
  contactLabel: { fontSize: 14.5, fontWeight: peso.maximo },
  contactNote: { fontSize: tipografia.micro, marginTop: 1 },
  contactNumber: { fontSize: 15, fontWeight: peso.maximo },
  cancelBtn: { marginTop: espaciado.e6, alignItems: 'center', paddingVertical: espaciado.e13, borderRadius: 14 },
  cancelText: { fontSize: tipografia.body, fontWeight: peso.fuerte },
});
