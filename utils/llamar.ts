/**
 * Llamar a un vendedor desde cualquier pantalla.
 *
 * POR QUÉ ESTÁ FUERA DE LAS PANTALLAS: la ficha ya tenía su propia copia y la página de tienda
 * necesitaba la misma. Dos copias de un `Linking.openURL('tel:')` no es un drama, pero el número
 * **sí** tiene reglas propias en este país (9 dígitos, prefijo 0 local, 240 internacional) y esas
 * reglas viven en `toGqMsisdn`. Pasarlas por alto en una copia sería abrir el marcador con un
 * número roto; llamándolas desde aquí, no hay copia que se desvíe.
 *
 * No lleva `contactIntent`: eso es un **lead ligado a un anuncio** y solo lo puede registrar la
 * ficha, que es la única que sabe de qué anuncio se trata. La tienda llama y ya.
 */
import { Alert, Linking } from 'react-native';
import { toGqMsisdn } from './phone';

/**
 * Devuelve `true` **solo si se llegó a abrir el marcador**. Importa: la ficha registra el lead
 * (`contactIntent`) cuando el comprador llama, y registrar una llamada que nunca salió —porque el
 * número estaba mal— sería ensuciar la estadística del vendedor con un intento que no existió.
 */
export async function llamarTelefono(phone: string): Promise<boolean> {
  const cc = toGqMsisdn(phone);
  if (!cc) {
    Alert.alert('Llamar', 'Este vendedor no tiene un número válido.');
    return false;
  }
  try {
    await Linking.openURL(`tel:+${cc}`);
    return true;
  } catch {
    Alert.alert('Llamar', 'No se pudo abrir el marcador.');
    return false;
  }
}
