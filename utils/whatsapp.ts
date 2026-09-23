/**
 * Escribir por WhatsApp a una tienda desde cualquier pantalla.
 *
 * POR QUÉ ESTÁ FUERA DE LAS PANTALLAS, igual que `llamarTelefono` (`utils/llamar.ts`): la ficha ya
 * tenía su propia construcción de la URL y el chat de tienda —Fase 4 del pie— necesita la misma.
 * Y el número tiene reglas propias en este país (9 dígitos, prefijo 0 local, 240 internacional) que
 * viven en `toGqMsisdn`: construyendo la URL a mano en cada pantalla, la que se saltara esas reglas
 * abriría WhatsApp con un número roto y el mensaje se perdería sin que nadie lo supiera.
 *
 * POR QUÉ CONVIVE CON EL CHAT Y NO ES UN RESTO. La decisión cerrada de la Fase 4 (5.b del plan) es
 * que el chat es la puerta PRINCIPAL y WhatsApp el ESCAPE visible: en Guinea Ecuatorial WhatsApp es
 * por donde se cierra el trato, y taparlo para empujar al chat nuevo costaría ventas del vendedor.
 * Por eso el chat lleva el botón al lado, no en vez.
 *
 * DEVUELVE `true` SÓLO SI SE LLEGÓ A ABRIR. Es la misma regla que `llamarTelefono`, y aquí además
 * sirve para no contar como «contacto» algo que no ocurrió.
 */
import { Alert, Linking } from 'react-native';
import { toGqMsisdn } from './phone';

/** El mensaje se pre-rellena con el nombre de la tienda o del anuncio: en WhatsApp, un «hola» suelto
 *  de un número desconocido se ignora. */
export async function whatsappATienda(
  phone: string | null | undefined,
  texto = 'Hola, te escribo desde EG Route Plan.',
): Promise<boolean> {
  const cc = toGqMsisdn(String(phone ?? ''));
  if (!cc) {
    Alert.alert('WhatsApp', 'Esta tienda no tiene un número válido. Usa el chat.');
    return false;
  }
  const url = `https://wa.me/${cc}?text=${encodeURIComponent(texto.slice(0, 400))}`;
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    Alert.alert('WhatsApp', 'No se pudo abrir WhatsApp en este aparato. Usa el chat.');
    return false;
  }
}
