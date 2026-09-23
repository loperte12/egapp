/**
 * PinSheet — LA hoja de PIN del monedero (oficial desde la Fase 1 de la auditoría de diseño).
 *
 * POR QUÉ VIVE EN EL KIT: había **tres** implementaciones de PIN en el proyecto — este componente
 * (usado por 6 pantallas), un `PinPad` del kit que no lo usaba nadie y un `PinPadModal` suelto
 * dentro de `conductor.tsx`. Tener tres sitios donde se escribe el PIN significa que un arreglo de
 * bloqueo, de intentos o de mensaje de error no llega a los otros dos. Este es el que se adopta;
 * `PinPad` se retiró.
 *
 * Incluye lo que la auditoría señaló como lo más grave de accesibilidad:
 *   · El campo del PIN tiene nombre y pista (antes solo tenía el marcador «••••••»).
 *   · El error se ANUNCIA: en Android con `accessibilityLiveRegion`, en iOS a mano con
 *     `announceForAccessibility` (que en toda la app eran 0 llamadas).
 *   · El foco queda atrapado en la hoja (`accessibilityViewIsModal`).
 *   · Vibra al confirmar y avisa con una vibración distinta cuando el PIN falla.
 *
 * Uso:
 *   <PinSheet visible={…} title="Recargar 5.000 XAF" subtitle="…"
 *     busy={…} error={…} onClose={…} onConfirm={(pin, pwd) => …} />
 * onConfirm recibe (pin, password?) — password solo llega en modo alta.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, TextInput, View } from 'react-native';
import { PrimaryButton, GhostButton } from './PrimaryButton';
import { useTheme } from '../theme/ThemeContext';
import { brand } from '../theme/colors';
import { haptico } from '../feedback/hapticos';
import { anunciar } from '../feedback/anuncios';

export interface PinSheetProps {
  visible: boolean;
  title: string;
  subtitle?: string;
  busy: boolean;
  error?: string | null;
  /** true = pedir también la contraseña (alta del PIN en el primer uso). */
  needPassword?: boolean;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: (pin: string, password?: string) => void;
}

export function PinSheet({
  visible, title, subtitle, busy, error, needPassword = false,
  confirmLabel = 'Confirmar', onClose, onConfirm,
}: PinSheetProps) {
  const { colors } = useTheme();
  const [pin, setPin] = useState('');
  const [pwd, setPwd] = useState('');

  useEffect(() => {
    if (visible) { setPin(''); setPwd(''); }
  }, [visible]);

  /**
   * El error del PIN tiene que LLEGAR al usuario que usa lector de pantalla.
   * En Android basta `accessibilityLiveRegion`; en iOS hay que anunciarlo a mano, y en toda la
   * app había 0 llamadas a `announceForAccessibility`: no se anunciaba nada.
   */
  useEffect(() => {
    if (!error) return;
    // Antes esto solo se anunciaba en Android: en iOS el error del PIN no llegaba a nadie (D-48).
    anunciar(error);
    haptico('aviso');
  }, [error]);

  const listo = pin.length === 6 && (!needPassword || pwd.length >= 4);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
      <View style={styles.overlay}>
        <View
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
          accessibilityViewIsModal
        >
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: '900', textAlign: 'center' }}>{title}</Text>
          {subtitle ? (
            <Text style={{ color: colors.textSecondary, fontSize: 13.5, textAlign: 'center', marginTop: 4 }}>{subtitle}</Text>
          ) : null}
          {needPassword && (
            <TextInput
              style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary, marginTop: 12 }]}
              placeholder="Contraseña de tu cuenta"
              placeholderTextColor={colors.textSecondary}
              value={pwd}
              onChangeText={setPwd}
              secureTextEntry
              autoCorrect={false}
              editable={!busy}
              accessibilityLabel="Contraseña de tu cuenta"
            />
          )}
          <TextInput
            style={[styles.input, {
              backgroundColor: colors.surface, borderColor: colors.border, color: colors.textPrimary,
              marginTop: needPassword ? 8 : 12, textAlign: 'center', fontSize: 22, letterSpacing: 8,
            }]}
            placeholder="••••••"
            placeholderTextColor={colors.textSecondary}
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={6}
            editable={!busy}
            autoFocus
            accessibilityLabel="PIN del monedero, 6 dígitos"
            accessibilityHint="Se confirma al escribir los seis dígitos"
          />
          {error ? (
            <Text
              accessibilityLiveRegion="assertive"
              accessibilityRole="alert"
              style={{ color: brand.danger, fontSize: 13, textAlign: 'center', marginTop: 8 }}
            >{error}</Text>
          ) : null}
          {busy ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 18 }} accessibilityLabel="Comprobando el PIN" />
          ) : (
            <View style={{ gap: 10, marginTop: 14 }}>
              <PrimaryButton
                title={confirmLabel}
                onPress={() => { haptico('toque'); onConfirm(pin, pwd || undefined); }}
                disabled={!listo}
              />
              <GhostButton title="Volver" onPress={onClose} />
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', padding: 24 },
  card: { borderRadius: 20, borderWidth: 1, padding: 20 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
});
