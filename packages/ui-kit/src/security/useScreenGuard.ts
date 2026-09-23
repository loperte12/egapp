/**
 * useScreenGuard — prevención global de capturas de pantalla.
 *
 * Estándar de seguridad del Design System: cualquier pantalla/primitivo que
 * maneje secretos (PIN, OTP, documentos KYC, saldos) lo activa. Usa
 * `expo-screen-capture` con clave de pila ('egrp-guard'), de modo que varios
 * consumidores puedan anidarse sin pisarse.
 *
 *   · Android: FLAG_SECURE (bloquea capturas y grabación + miniatura en recents).
 *   · iOS:     oculta el contenido en grabación de pantalla; la prevención de
 *              captura estática no existe en iOS — la app debe evitar mostrar
 *              secretos en campos estáticos (regla ya aplicada en el kit).
 */

import { useEffect } from 'react';
import * as ScreenCapture from 'expo-screen-capture';

const GUARD_KEY = 'egrp-guard';

export function useScreenGuard(active = true): void {
  useEffect(() => {
    if (!active) return;
    let mounted = true;

    ScreenCapture.preventScreenCaptureAsync(GUARD_KEY).catch(() => {
      // Módulo no disponible (web/dev): degradación silenciosa, la pantalla sigue funcionando.
    });

    return () => {
      if (mounted) {
        ScreenCapture.allowScreenCaptureAsync(GUARD_KEY).catch(() => {});
      }
      mounted = false;
    };
  }, [active]);
}
