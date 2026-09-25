/**
 * OnboardingAuthScreen — flujo de cuenta SIN PIN (EG Route Plan).
 * Modos:
 *   · 'terms'   → aceptar Términos de Uso (primer paso al usar un servicio).
 *   · 'phone'   → introducir teléfono (+240) → registrar (o reenviar OTP).
 *   · 'otp'     → código de verificación por SMS.
 *   · 'password'→ fijar contraseña de la cuenta (vinculada al teléfono).
 *   · 'login'   → entrar con teléfono + contraseña (cuentas existentes).
 * Tras completar → router.back() al servicio que lo solicitó.
 */

import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { espaciado, FormField, GhostButton, OtpInput, PrimaryButton, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { ArrowLeft, ShieldCheck } from 'lucide-react-native';
import { authApi, ApiError } from '../api/auth';
import { useSession } from '../state/session';

const PHONE_RE = /^\+240\d{9}$/;
const PWD_MIN = 6;

type Mode = 'terms' | 'phone' | 'otp' | 'password' | 'login';

export default function OnboardingAuthScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ mode?: string }>();
  const { login: sessionLogin, isAuthenticated } = useSession();

  const [mode, setMode] = useState<Mode>(params.mode === 'login' ? 'login' : 'terms');
  /**
   * true mientras se está CREANDO la cuenta (ya hay sesión, pero falta la contraseña).
   * Sin esta bandera, el efecto de abajo lanzaba `router.replace('/')` en cuanto el OTP era
   * válido y la pantalla «Crea tu contraseña» quedaba sustituida antes de poder usarse: la cuenta
   * se quedaba SIN contraseña (auditoría de diseño, D-34).
   */
  const [creandoCuenta, setCreandoCuenta] = useState(false);

  // Si ya hay sesión, no mostrar el onboarding como pantalla inicial.
  useEffect(() => {
    if (isAuthenticated && !creandoCuenta) router.replace('/');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, creandoCuenta]);
  const [busy, setBusy] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+240');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError] = useState<string | null>(null);

  const phoneOk = PHONE_RE.test(phone);
  const pwdOk = password.length >= PWD_MIN;
  const pwdMatch = password === password2 && pwdOk;

  const fail = (e: unknown, fallback: string) => {
    if (e instanceof ApiError) setError(e.message);
    else if (e instanceof Error) setError(`${fallback}: ${e.message}`);
    else setError(fallback);
    console.error('[auth] error:', e);
  };

  const done = () => router.back();

  // Paso 1: aceptar términos → pedir teléfono
  const acceptTerms = () => { setError(null); setMode('phone'); };

  // Paso 2: teléfono → registrar (o reenviar OTP si ya existe)
  const submitPhone = async () => {
    if (!phoneOk || busy) return;
    setBusy(true); setError(null);
    try {
      await authApi.register(phone, fullName.trim() || undefined);
      setMode('otp');
    } catch (e) {
      const code = e instanceof ApiError ? e.code : '';
      if (code === 'PHONE_TAKEN') {
        // Cuenta existente: reenviar OTP y verificar el mismo flujo.
        try { await authApi.resendOtp(phone); setMode('otp'); }
        catch (e2) { fail(e2, 'No se pudo enviar el código'); }
      } else {
        fail(e, 'No se pudo crear la cuenta');
      }
    } finally { setBusy(false); }
  };

  // Paso 3: OTP → verifica y emite sesión → pedir contraseña
  const submitOtp = async (code: string) => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const tokens = await authApi.verifyPhone(phone, code);
      // La bandera va ANTES de iniciar sesión: el efecto mira `isAuthenticated` en cuanto cambie.
      setCreandoCuenta(true);
      await sessionLogin(tokens.accessToken, tokens.refreshToken, phone);
      setMode('password');
    } catch (e) {
      fail(e, 'Código incorrecto');
      setOtp('');
    } finally { setBusy(false); }
  };

  // Paso 4: fijar contraseña → listo
  const submitPassword = async () => {
    if (!pwdMatch || busy) return;
    setBusy(true); setError(null);
    try {
      await authApi.setPassword(password);
      // Contraseña creada: ahora sí puede redirigir el efecto (y la cuenta queda completa).
      setCreandoCuenta(false);
      done();
    } catch (e) {
      fail(e, 'No se pudo guardar la contraseña');
    } finally { setBusy(false); }
  };

  // Login: teléfono + contraseña
  const submitLogin = async () => {
    if (!phoneOk || !pwdOk || busy) return;
    setBusy(true); setError(null);
    try {
      const tokens = await authApi.login(phone, password);
      await sessionLogin(tokens.accessToken, tokens.refreshToken, phone);
      done();
    } catch (e) {
      fail(e, 'No se pudo iniciar sesión');
    } finally { setBusy(false); }
  };

  const switchToLogin = () => { setError(null); setMode('login'); setPassword(''); };
  const switchToRegister = () => { setError(null); setMode('phone'); setPassword(''); };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onPress={() => (mode === 'terms' ? router.back() : setMode('terms'))} hitSlop={12} style={{ padding: espaciado.e4 }}>
            <ArrowLeft size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            {mode === 'terms' ? 'Bienvenido' : mode === 'login' ? 'Iniciar sesión' : 'Crea tu cuenta'}
          </Text>
          <View style={{ width: 30 }} />
        </View>

        {error ? (
          <Text style={[styles.error, { color: colors.danger }]}>{error}</Text>
        ) : null}

        {mode === 'terms' && (
          <View style={styles.block}>
            <View style={[styles.iconWrap, { backgroundColor: colors.primary + '1A' }]}>
              <ShieldCheck size={40} color={colors.primary} />
            </View>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Términos de uso</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Para usar los servicios de Eg Route Plan necesitas aceptar los términos de uso y la política de privacidad.
              Tu teléfono será la clave de tu cuenta y recibirás un código de verificación por SMS.
            </Text>
            <View style={styles.actions}>
              <GhostButton title="No acepto" onPress={() => router.back()} />
              <PrimaryButton title="Aceptar" onPress={acceptTerms} />
            </View>
          </View>
        )}

        {mode === 'phone' && (
          <View style={styles.block}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Tu número de teléfono</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Es la condición para tener tu cuenta. Te enviaremos un código de verificación por SMS.
            </Text>
            <FormField
              label="Nombre completo (opcional)"
              placeholder="María Nsue Obiang"
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
            />
            <View style={styles.gap} />
            <FormField
              label="Teléfono"
              placeholder="+240222000066"
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/[^0-9+]/g, '').slice(0, 13))}
              keyboardType="phone-pad"
              error={phone.length > 4 && !phoneOk ? 'Formato: +240 seguido de 9 dígitos' : undefined}
            />
            <View style={styles.gap} />
            <PrimaryButton title={busy ? 'Enviando…' : 'Recibir código'} onPress={submitPhone} disabled={!phoneOk || busy} loading={busy} />
            <GhostButton title="¿Ya tienes cuenta? Inicia sesión" onPress={switchToLogin} />
          </View>
        )}

        {mode === 'otp' && (
          <View style={styles.block}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Verifica tu teléfono</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Hemos enviado un código por SMS a {phone}
            </Text>
            <OtpInput value={otp} onChange={(c) => { setOtp(c); if (c.length === 6) submitOtp(c); }} />
            <GhostButton title="Reenviar código" onPress={async () => { try { await authApi.resendOtp(phone); setError(null); } catch (e) { fail(e, 'No se pudo reenviar'); } }} />
            <GhostButton title="← Cambiar teléfono" onPress={() => { setMode('phone'); setOtp(''); }} />
          </View>
        )}

        {mode === 'password' && (
          <View style={styles.block}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Crea tu contraseña</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>
              Vinculada a tu teléfono {phone}. La usarás para entrar en la app.
            </Text>
            <FormField label="Contraseña" placeholder="Mínimo 6 caracteres" value={password} onChangeText={setPassword} secureTextEntry />
            <View style={styles.gap} />
            <FormField label="Repite la contraseña" placeholder="Repite tu contraseña" value={password2} onChangeText={setPassword2} secureTextEntry />
            <View style={styles.gap} />
            <PrimaryButton title={busy ? 'Guardando…' : 'Guardar y continuar'} onPress={submitPassword} disabled={!pwdMatch || busy} loading={busy} />
          </View>
        )}

        {mode === 'login' && (
          <View style={styles.block}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>Iniciar sesión</Text>
            <Text style={[styles.body, { color: colors.textSecondary }]}>Entra con tu teléfono y contraseña.</Text>
            <FormField
              label="Teléfono"
              placeholder="+240222000066"
              value={phone}
              onChangeText={(t) => setPhone(t.replace(/[^0-9+]/g, '').slice(0, 13))}
              keyboardType="phone-pad"
              error={phone.length > 4 && !phoneOk ? 'Formato: +240 seguido de 9 dígitos' : undefined}
            />
            <View style={styles.gap} />
            <FormField label="Contraseña" placeholder="Tu contraseña" value={password} onChangeText={setPassword} secureTextEntry />
            <View style={styles.gap} />
            <PrimaryButton title={busy ? 'Entrando…' : 'Entrar'} onPress={submitLogin} disabled={!phoneOk || !pwdOk || busy} loading={busy} />
            <GhostButton title="¿No tienes cuenta? Crea una" onPress={switchToRegister} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: espaciado.e24, paddingBottom: 48, gap: espaciado.e16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: espaciado.e8 },
  headerTitle: { fontSize: 17, fontWeight: peso.maximo },
  block: { gap: espaciado.e12, alignItems: 'stretch' },
  iconWrap: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: espaciado.e12 },
  title: { fontSize: tipografia.title, fontWeight: peso.maximo, textAlign: 'center' },
  body: { fontSize: tipografia.body, lineHeight: 20, textAlign: 'center', fontWeight: peso.medio },
  actions: { gap: espaciado.e10, marginTop: espaciado.e8 },
  gap: { height: 8 },
  error: { fontSize: tipografia.body, fontWeight: peso.fuerte, textAlign: 'center' },
});
