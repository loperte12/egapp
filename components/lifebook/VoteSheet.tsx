/**
 * VoteSheet — Parte 24 (G2): crear una VOTACIÓN en el chat.
 *
 * Pregunta (hasta 120 caracteres) y de 2 a 6 opciones. Los límites son los
 * mismos que valida el servidor (`VOTE_QUESTION_REQUIRED`,
 * `VOTE_OPTIONS_INVALID`), así que el aviso sale en línea sin ir y volver.
 * El mensaje se envía como `kind='vote'` y los votos van a
 * `lifebook.message_votes` (uno por persona: volver a votar cambia el voto).
 */
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, useTheme, brand, tipografia, radios } from '@egrouteplan/ui-kit';
import { Plus, Trash2, Vote, X } from 'lucide-react-native';
import { formaHoja } from './ui/Sheet';

const QUESTION_MAX = 120;
const OPTION_MAX = 40;
const OPTIONS_MIN = 2;
const OPTIONS_MAX = 6;

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Crea la votación (el padre la envía como mensaje `vote`). */
  onSubmit: (v: { question: string; options: string[] }) => void;
}

export function VoteSheet({ visible, onClose, onSubmit }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) { setQuestion(''); setOptions(['', '']); setError(null); }
  }, [visible]);

  const filled = options.map((o) => o.trim()).filter((o) => !!o);
  const canSend = question.trim().length > 0 && filled.length >= OPTIONS_MIN;

  const setOption = (i: number, v: string) => {
    setOptions((prev) => prev.map((o, idx) => (idx === i ? v : o)));
    setError(null);
  };
  const addOption = () => {
    if (options.length >= OPTIONS_MAX) return;
    setOptions((prev) => [...prev, '']);
  };
  const removeOption = (i: number) => {
    if (options.length <= OPTIONS_MIN) return;
    setOptions((prev) => prev.filter((_, idx) => idx !== i));
  };

  const submit = () => {
    if (!question.trim()) { setError('Escribe la pregunta de la votación.'); return; }
    if (filled.length < OPTIONS_MIN) { setError(`La votación necesita al menos ${OPTIONS_MIN} opciones.`); return; }
    onSubmit({ question: question.trim().slice(0, QUESTION_MAX), options: filled.slice(0, OPTIONS_MAX) });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} />
      <View style={[styles.sheet, { backgroundColor: colors.card, paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.header}>
          <Vote size={18} color={colors.primary} />
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '900', flex: 1, marginLeft: 8 }}>
            Crear votación
          </Text>
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Cerrar">
            <X size={20} color={colors.textSecondary} />
          </Pressable>
        </View>

        <TextInput
          value={question}
          onChangeText={(v) => { setQuestion(v); setError(null); }}
          placeholder="¿Qué quieres preguntar?"
          placeholderTextColor={colors.textSecondary}
          maxLength={QUESTION_MAX}
          multiline
          accessibilityLabel="Pregunta de la votación"
          style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, minHeight: 46 }]}
        />
        <Text style={{ color: colors.textSecondary, fontSize: 10.5, textAlign: 'right', marginTop: 4 }}>
          {question.length}/{QUESTION_MAX}
        </Text>

        <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
          {options.map((o, i) => (
            <View key={`opt-${i}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <TextInput
                value={o}
                onChangeText={(v) => setOption(i, v.slice(0, OPTION_MAX))}
                placeholder={`Opción ${i + 1}`}
                placeholderTextColor={colors.textSecondary}
                maxLength={OPTION_MAX}
                accessibilityLabel={`Opción ${i + 1}`}
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, flex: 1 }]}
              />
              {options.length > OPTIONS_MIN ? (
                <Pressable onPress={() => removeOption(i)} hitSlop={8} accessibilityLabel={`Quitar la opción ${i + 1}`}>
                  <Trash2 size={18} color={colors.textSecondary} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </ScrollView>

        {options.length < OPTIONS_MAX ? (
          <Pressable
            onPress={addOption}
            accessibilityLabel="Añadir opción"
            style={({ pressed }) => [styles.addRow, { borderColor: alpha(colors.border, 0.9), opacity: pressed ? 0.7 : 1 }]}
          >
            <Plus size={16} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '800', fontSize: tipografia.body, marginLeft: 6 }}>
              Añadir opción ({options.length}/{OPTIONS_MAX})
            </Text>
          </Pressable>
        ) : (
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 10 }}>
            Máximo {OPTIONS_MAX} opciones.
          </Text>
        )}

        {error ? <Text style={{ color: colors.danger, fontSize: tipografia.caption, marginTop: 10 }}>{error}</Text> : null}

        <Pressable
          onPress={submit}
          disabled={!canSend}
          accessibilityLabel="Publicar la votación"
          style={({ pressed }) => [styles.cta, {
            backgroundColor: canSend ? colors.primary : alpha(colors.primary, 0.35),
            opacity: pressed ? 0.85 : 1,
          }]}
        >
          <Text style={{ color: brand.white, fontWeight: '900', fontSize: 15 }}>Publicar votación</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { ...formaHoja },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  input: { borderRadius: radios.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: tipografia.body },
  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderRadius: radios.md, paddingVertical: 10, marginTop: 12 },
  cta: { marginTop: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
});
