/**
 * biometric — wrapper sobre expo-local-authentication.
 * Biometría LOCAL (FaceID/huella): NO enrola nada en el servidor.
 * Se usa como cerradura del refresh_token que ya está en SecureStore:
 * el usuario demuestra identidad del dispositivo y, si pasa, la app
 * canjea el refresh por un access token nuevo (ver SessionProvider).
 */

import * as LocalAuthentication from 'expo-local-authentication';

export interface BiometricAvailability {
  available: boolean;
  enrolled: boolean;
}

export async function biometricAvailable(): Promise<BiometricAvailability> {
  const [available, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return { available: !!available, enrolled: !!enrolled };
}

/** Pide biometría. Devuelve true si el usuario se autenticó. */
export async function biometricVerify(reason: string): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      fallbackLabel: 'Usar PIN',
      cancelLabel: 'Cancelar',
    });
    return !!res.success;
  } catch {
    return false;
  }
}
