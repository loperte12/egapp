/**
 * OtpInput — 6 celdas OTP con auto-avance (input oculto accesible).
 * La celda activa tiene borde azul primario; error en rojo de 1 línea.
 *
 * Uso:
 *   <OtpInput value={code} onChange={setCode} onComplete={verify} error={err} />
 */

import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useScreenGuard } from '../security/useScreenGuard';

export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  error,
  autoFocus = true,
}: {
  value: string;
  onChange: (code: string) => void;
  onComplete?: (code: string) => void;
  length?: number;
  error?: string;
  autoFocus?: boolean;
}) {
  const { colors } = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  // Los códigos OTP también son secretos en pantalla.
  useScreenGuard(true);

  const handleChange = (text: string) => {
    const clean = text.replace(/\D/g, '').slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  };

  return (
    <View>
      <Pressable
        style={styles.cells}
        onPress={() => inputRef.current?.focus()}
        accessibilityLabel={`Código de verificación de ${length} dígitos`}
      >
        {Array.from({ length }).map((_, i) => {
          const digit = value[i] ?? '';
          const isActive = focused && i === Math.min(value.length, length - 1);
          return (
            <View
              key={i}
              style={[
                styles.cell,
                {
                  backgroundColor: colors.surface,
                  borderColor: error
                    ? colors.danger
                    : isActive
                      ? colors.primary
                      : colors.border,
                },
              ]}
            >
              <Text style={[styles.digit, { color: colors.textPrimary }]}>{digit}</Text>
            </View>
          );
        })}
      </Pressable>

      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={length}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={styles.hiddenInput}
        caretHidden
        accessibilityLabel="Introduce el código OTP"
      />

      {error ? (
        <Text style={[styles.error, { color: colors.text.danger }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cells: { flexDirection: 'row', justifyContent: 'center', gap: 10 },
  cell: {
    width: 46,
    height: 54,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digit: { fontSize: 22, fontWeight: '800' },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
  },
  error: { fontSize: 12, fontWeight: '700', marginTop: 10, textAlign: 'center' },
});
