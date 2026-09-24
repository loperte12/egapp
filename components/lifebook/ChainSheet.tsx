/**
 * ChainSheet — Parte 25 (G2-b): crear una CADENA en el chat.
 *
 * Una cadena es una lista a la que la gente se APUNTA (relevo, compra conjunta,
 * turnos, recogida de algo…). Se puede poner un tope de plazas: cuando está
 * llena, el servidor responde `CHAIN_FULL` y la app lo dice en línea.
 * El mensaje se envía como `kind='chain'`; los apuntados van a
 * `lifebook.message_joins` (uno por persona).
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { Link2, X } from 'lucide-react-native';
import { formaHoja } from './ui/Sheet';

const TITLE_MAX = 80;
const NOTE_MAX = 200;
const SLOTS_MIN = 2;
const SLOTS_MAX = 200;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Crea la cadena (el padre la envía como mensaje `chain`). */
  onSubmit: (c: { title: string; note?: string; slots?: number }) => void;
}

export function ChainSheet({ visible, onClose, onSubmit }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [limited, setLimited] = useState(false);
  const [slots, setSlots] = useState('10');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) { setTitle(''); setNote(''); setLimited(false); setSlots('10'); setError(null); }
  }, [visible]);

  const slotsNum = Number(slots.replace(/[^0-9]/g, ''));
  const slotsOk = !limited || (Number.isInteger(slotsNum) && slotsNum >= SLOTS_MIN && slotsNum <= SLOTS_MAX);
  const canSend = title.trim().length > 0 && slotsOk;

  const submit = () => {
    if (!title.trim()) { setError('Ponle un título a la cadena.'); return; }
    if (!slotsOk) { setError(`El tope de plazas debe estar entre ${SLOTS_MIN} y ${SLOTS_MAX}.`); return; }
    onSubmit({
      title: title.trim().slice(0, TITLE_MAX),
      note: note.trim() ? note.trim().slice(0, NOTE_MAX) : undefined,
      slots: limited ? slotsNum : undefined,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Link2 size={18} color={colors.primary} />
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '900', flex: 1, marginLeft: espaciado.e8 }}>
            Crear cadena
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
            <X size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <TextInput
          value={title}
          onChangeText={(v) => { setTitle(v); setError(null); }}
          placeholder="¿Para qué es la cadena? (p. ej. Compra de arroz)"
          placeholderTextColor={colors.textSecondary}
          maxLength={TITLE_MAX}
          accessibilityLabel="Título de la cadena"
          style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary }]}
        />
        <Text style={{ color: colors.textSecondary, fontSize: 10.5, textAlign: 'right', marginTop: espaciado.e4 }}>
          {title.length}/{TITLE_MAX}
        </Text>

        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="Detalles (opcional)"
          placeholderTextColor={colors.textSecondary}
          maxLength={NOTE_MAX}
          multiline
          accessibilityLabel="Detalles de la cadena"
          style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, minHeight: 60, marginTop: espaciado.e8 }]}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: espaciado.e12, gap: espaciado.e10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontWeight: '800', fontSize: tipografia.body }}>Tope de plazas</Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
              Con tope, la cadena se cierra al llenarse. Sin tope, entran todos.
            </Text>
          </View>
          <Switch value={limited} onValueChange={setLimited} />
        </View>

        {limited ? (
          <TextInput
            value={slots}
            onChangeText={setSlots}
            keyboardType="number-pad"
            maxLength={3}
            accessibilityLabel="Número de plazas"
            style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, marginTop: espaciado.e10, width: 110 }]}
          />
        ) : null}

        {error ? <Text style={{ color: colors.danger, fontSize: tipografia.caption, marginTop: espaciado.e10 }}>{error}</Text> : null}

        <Pressable
          onPress={submit}
          disabled={!canSend}
          accessibilityLabel="Publicar la cadena"
          style={({ pressed }) => [styles.cta, {
            backgroundColor: canSend ? colors.primary : alpha(colors.primary, 0.35),
            opacity: pressed ? 0.85 : 1,
          }]}
        >
          <Text style={{ color: brand.white, fontWeight: '900', fontSize: 15 }}>Publicar cadena</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { ...formaHoja },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: espaciado.e12 },
  input: { borderRadius: radios.md, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10, fontSize: tipografia.body },
  cta: { marginTop: espaciado.e16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingVertical: espaciado.e14 },
});
