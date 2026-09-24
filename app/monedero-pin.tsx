/**
 * MonederoPinScreen — alta/cambio del PIN del monedero (/monedero-pin).
 * El PIN es lo único que autoriza dinero (pagos, recargas, retiradas); para
 * fijarlo o cambiarlo se pide la contraseña de la cuenta (verificación real en
 * el servidor, auth unificada).
 */
import React, { useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, KeyRound } from 'lucide-react-native';
import { espaciado, InlineError, PrimaryButton, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { AuthGate } from '../core/AuthGate';
import { fijarPin } from '../api/settlement';
import { brand } from '@egrouteplan/ui-kit';
import { ir } from '../constants/rutas';

export default function MonederoPinScreen() {
  return (
    <AuthGate>
      <Contenido />
    </AuthGate>
  );
}

function Contenido() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [pwd, setPwd] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  const listo = pwd.length >= 4 && pin.length === 6 && pin2.length === 6;

  const guardar = async () => {
    if (busy || !listo) return;
    if (pin !== pin2) { setErr('Los dos PIN no coinciden.'); return; }
    setBusy(true); setErr(null);
    try {
      await fijarPin(pin, pwd);
      setOk(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo guardar el PIN');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => ir.atras()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>PIN del monedero</Text>
        <View style={{ width: 24 }} />
      </View>

      {ok ? (
        <View style={styles.doneWrap}>
          <View style={[styles.okIcon, { backgroundColor: colors.surface }]}>
            <KeyRound size={26} color={colors.primary} />
          </View>
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.subtitle, fontWeight: '900', textAlign: 'center' }}>
            PIN guardado
          </Text>
          <PrimaryButton title="Volver al monedero" onPress={() => ir.atras()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: espaciado.e16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={[styles.label, { color: colors.textSecondary }]}>Contraseña de tu cuenta</Text>
          <TextInput
            style={[styles.input, { backgroundColor: colors.card, borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="La misma con la que entras en la app"
            placeholderTextColor={colors.textSecondary}
            value={pwd}
            onChangeText={setPwd}
            secureTextEntry
            autoCorrect={false}
            editable={!busy}
            accessibilityLabel="Contraseña de tu cuenta"
          />
          <Text style={[styles.label, { color: colors.textSecondary, marginTop: espaciado.e18 }]}>PIN nuevo (6 dígitos)</Text>
          <TextInput
            style={[styles.pinInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="••••••"
            placeholderTextColor={colors.textSecondary}
            value={pin}
            onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={6}
            editable={!busy}
            accessibilityLabel="PIN nuevo, 6 dígitos"
          />
          <Text style={[styles.label, { color: colors.textSecondary, marginTop: espaciado.e14 }]}>Repite el PIN</Text>
          <TextInput
            style={[styles.pinInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.textPrimary }]}
            placeholder="••••••"
            placeholderTextColor={colors.textSecondary}
            value={pin2}
            onChangeText={(t) => setPin2(t.replace(/\D/g, '').slice(0, 6))}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={6}
            editable={!busy}
            accessibilityLabel="Repite el PIN nuevo"
          />
          {err ? <View style={{ marginTop: espaciado.e10 }}><InlineError mensaje={err} /></View> : null}
          <View style={{ marginTop: espaciado.e24 }}>
            {busy
              ? <ActivityIndicator color={colors.primary} />
              : <PrimaryButton title="Guardar PIN" onPress={() => void guardar()} disabled={!listo} />}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: tipografia.subtitle, fontWeight: '900' },
  label: { fontSize: tipografia.caption, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: espaciado.e8 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e11, fontSize: tipografia.body },
  pinInput: {
    borderWidth: 1, borderRadius: 14, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e11,
    fontSize: 22, letterSpacing: 8, textAlign: 'center',
  },
  doneWrap: { flex: 1, padding: espaciado.e20, justifyContent: 'center', gap: espaciado.e16 },
  okIcon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
});
