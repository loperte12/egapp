/**
 * AuthGate — SIN candado ni PIN.
 * Si no hay sesión, redirige al onboarding (/auth: términos → teléfono → OTP →
 * contraseña, o login). Los servicios quedan libres; solo las pantallas
 * protegidas (Monedero, Perfil) pasan por aquí.
 */

import React, { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTheme } from '@egrouteplan/ui-kit';
import { useSession } from '../state/session';

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const router = useRouter();
  const { isUnlocked, hydrated } = useSession();

  useEffect(() => {
    if (hydrated && !isUnlocked) {
      router.replace('/auth');
    }
  }, [hydrated, isUnlocked, router]);

  if (!hydrated || !isUnlocked) {
    // Mientras hidrata o redirige: pantalla neutra (sin candado).
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
