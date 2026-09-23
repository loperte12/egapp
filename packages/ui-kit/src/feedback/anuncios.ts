/**
 * ANUNCIOS PARA LECTORES DE PANTALLA.
 *
 * POR QUÉ EXISTE: la app tenía 4 anuncios escritos con la llamada que solo funciona en Android, y
 * **cero** que funcionaran en iOS (`announceForAccessibilityWithOptions` no se usaba en ningún
 * sitio). Un aviso que no se anuncia es un aviso que no existe para quien no ve la pantalla.
 *
 * Uso: `anunciar('PIN incorrecto, te quedan 2 intentos')`.
 * En Android basta esta llamada; en iOS hay que usar la variante con opciones.
 */
import { AccessibilityInfo, Platform } from 'react-native';

export function anunciar(mensaje: string): void {
  if (!mensaje) return;
  try {
    const conOpciones = AccessibilityInfo as unknown as {
      announceForAccessibilityWithOptions?: (m: string, o: { queue?: boolean }) => void;
    };
    if (Platform.OS === 'ios' && typeof conOpciones.announceForAccessibilityWithOptions === 'function') {
      // `queue: true` para que no corte el anuncio que esté sonando.
      conOpciones.announceForAccessibilityWithOptions(mensaje, { queue: true });
    } else {
      AccessibilityInfo.announceForAccessibility(mensaje);
    }
  } catch {
    /* Un anuncio que falla no puede romper la pantalla. */
  }
}
