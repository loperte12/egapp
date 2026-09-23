/**
 * HÁPTICOS — la app no tenía ninguno.
 *
 * `expo-haptics` no estaba instalado y el único archivo que lo mencionaba lo hacía justo para
 * aclarar que no vibraba (auditoría de diseño, D-14). Se centraliza aquí por dos razones:
 *   1. El día que se cambie de librería, se cambia en un sitio.
 *   2. Ninguna llamada puede tumbar una pantalla: si el dispositivo no tiene motor o el módulo
 *      falla, el pago sigue funcionando igual. Un háptico es un adorno, no un requisito.
 *
 * Uso: `haptico('exito')` al confirmar un cobro, `haptico('aviso')` cuando algo no cuadra.
 */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

export type TipoHaptico = 'toque' | 'exito' | 'aviso' | 'error';

export function haptico(tipo: TipoHaptico = 'toque'): void {
  // En web no hay motor de vibración y en algunos dispositivos va desactivado por el usuario.
  if (Platform.OS === 'web') return;
  try {
    const p =
      tipo === 'exito'
        ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
        : tipo === 'aviso'
          ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
          : tipo === 'error'
            ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
            : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // `notificationAsync` devuelve una promesa: rechazarla en silencio evita un unhandled rejection.
    void p?.catch?.(() => {});
  } catch {
    /* sin motor de vibración o módulo ausente: se ignora a propósito */
  }
}
