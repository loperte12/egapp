/**
 * CheckinSheet — Parte 25 (G2-b): elige CUÁNDO es la QUEDADA.
 *
 * El lugar ya viene elegido: el chat abre primero `LocationPickerSheet` (mi
 * ubicación por GPS o el buscador real de calles y sitios) y, al elegir el
 * punto, abre esta hoja para la hora. Se hace en dos pasos y con una sola hoja
 * visible a la vez a propósito: dos modales anidados se comportan mal en Android.
 *
 * Atajos (en 1 hora · en 2 horas · esta tarde 18:00 · mañana 09:00) u hora
 * escrita a mano. El mensaje se envía como `kind='checkin'` con `at` en ISO y el
 * servidor lo etiqueta en hora de Malabo («hoy 18:30»); los que van se apuntan
 * con `POST /chat/messages/:id/join`.
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, radios, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { CalendarCheck, Clock, X } from 'lucide-react-native';
import type { LbPickedLocation } from './LocationPickerSheet';
import { formaHoja } from './ui/Sheet';

export interface LbCheckinDraft {
  label: string;
  lat: number;
  lng: number;
  at: string;
}

interface Props {
  visible: boolean;
  /** Lugar ya elegido (paso anterior). */
  place: LbPickedLocation | null;
  onClose: () => void;
  /** Crea la quedada (el padre la envía como mensaje `checkin`). */
  onSubmit: (c: LbCheckinDraft) => void;
}

/** Fecha a N horas (y minutos) de ahora. */
function atOffset(hours: number, minutes = 0): Date {
  return new Date(Date.now() + hours * 3600 * 1000 + minutes * 60 * 1000);
}

/** "HH:MM" → la próxima vez que sean esas horas (hoy o mañana si ya pasó). */
function atClock(hhmm: string): Date | null {
  const m = /^(\d{1,2})\s*[:.h]?\s*(\d{2})?$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2] ?? '0');
  if (!Number.isInteger(h) || h > 23 || !Number.isInteger(min) || min > 59) return null;
  const d = new Date();
  d.setHours(h, min, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

export function CheckinSheet({ visible, place, onClose, onSubmit }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) { setCustom(''); setError(null); }
  }, [visible]);

  const opciones = [
    { label: 'En 1 hora', at: atOffset(1), icon: '⏱️' },
    { label: 'En 2 horas', at: atOffset(2), icon: '⏱️' },
    { label: 'Esta tarde', at: atClock('18:00') },
    { label: 'Mañana por la mañana', at: atClock('09:00') },
  ].filter((o) => !!o.at) as { label: string; at: Date; icon?: string }[];

  const crear = (at: Date) => {
    if (!place) { setError('Falta el lugar de la quedada.'); return; }
    onSubmit({ label: place.label, lat: place.lat, lng: place.lng, at: at.toISOString() });
  };

  const usarHoraEscrita = () => {
    const d = atClock(custom);
    if (!d) { setError('Escribe la hora así: 18:30.'); return; }
    crear(d);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <CalendarCheck size={18} color={colors.primary} />
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: peso.titulo, flex: 1, marginLeft: espaciado.e8 }}>
            ¿Cuándo es la quedada?
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
            <X size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <View style={[styles.placeRow, { backgroundColor: alpha(colors.primary, 0.08), borderColor: alpha(colors.primary, 0.28) }]}>
          <Text style={{ fontSize: 18 }}>📍</Text>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body }}>
              {place?.label ?? 'Sin lugar'}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
              {place ? `${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}` : 'Vuelve a empezar la quedada.'}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, marginTop: espaciado.e14 }}>
          <Clock size={15} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>HORA</Text>
        </View>

        <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
          {opciones.map((o) => (
            <Pressable
              key={o.label}
              onPress={() => crear(o.at)}
              accessibilityLabel={`Quedada ${o.label}`}
              style={({ pressed }) => [styles.opt, { backgroundColor: colors.surface, opacity: pressed ? 0.75 : 1 }]}
            >
              <Text style={{ fontSize: tipografia.subtitle }}>{o.icon ?? '📅'}</Text>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.fuerte, flex: 1 }}>
                {o.at.toLocaleString('es-GQ', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{o.label}</Text>
            </Pressable>
          ))}

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, marginTop: espaciado.e8 }}>
            <TextInput
              value={custom}
              onChangeText={(v) => { setCustom(v); setError(null); }}
              placeholder="Otra hora: 18:30"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              accessibilityLabel="Escribir la hora de la quedada"
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, flex: 1 }]}
            />
            <Pressable
              onPress={usarHoraEscrita}
              accessibilityLabel="Crear la quedada con esa hora"
              style={({ pressed }) => [styles.smallCta, { backgroundColor: alpha(colors.primary, 0.14), opacity: pressed ? 0.8 : 1 }]}
            >
              <Text style={{ color: colors.primary, fontWeight: peso.titulo, fontSize: tipografia.body }}>Usar</Text>
            </Pressable>
          </View>
        </ScrollView>

        {error ? <Text style={{ color: colors.danger, fontSize: tipografia.caption, marginTop: espaciado.e10 }}>{error}</Text> : null}
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e10 }}>
          En el mensaje, quien quiera ir pulsa «Voy» (tú también cuentas).
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { ...formaHoja },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: espaciado.e12 },
  placeRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, borderWidth: 1, borderRadius: 14, padding: espaciado.e12 },
  opt: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, borderRadius: radios.md, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e12, marginTop: espaciado.e8 },
  input: { borderRadius: radios.md, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10, fontSize: tipografia.body },
  smallCta: { borderRadius: radios.md, paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e11 },
});
