/**
 * Preferencia de perfil por servicio (RoleGate): se recuerda en el dispositivo
 * con AsyncStorage para que la próxima entrada vaya directa.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const keyOf = (serviceId: string) => `eg-role:${serviceId}`;

export async function getSavedRole(serviceId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(keyOf(serviceId));
  } catch {
    return null;
  }
}

export async function saveRole(serviceId: string, roleId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(keyOf(serviceId), roleId);
  } catch { /* sin persistencia: el flujo sigue */ }
}
