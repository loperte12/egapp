/**
 * SOPORTE — el único sitio donde vive el contacto real.
 *
 * POR QUÉ EXISTE: la app remitía a «contacta soporte» en tres pantallas de dinero (reembolsos y
 * KYC) y en Ajustes los cuatro enlaces respondían «Próximamente». Es decir: prometía un canal que
 * no existía. Auditoría de diseño, D-37.
 *
 * REGLA: si mañana cambia el teléfono o el correo, se cambia AQUÍ y cambia en toda la app.
 * Nada de números repartidos por las pantallas.
 *
 * Datos facilitados por el dueño del producto (17/09/2026).
 */
import { Linking } from 'react-native';

export const SOPORTE = {
  /** Correo de soporte. */
  email: 'egrouteplan@gmail.com',
  /** Teléfono de soporte, tal y como lo dio el dueño (incluye prefijo internacional). */
  telefono: '+8615504426087',
  /** El mismo número sin «+» ni espacios, que es lo que espera el enlace de WhatsApp. */
  whatsapp: '8615504426087',
} as const;

/** Abre el correo con el asunto ya puesto. Devuelve false si el móvil no tiene ninguna app de correo. */
export async function escribirASoporte(asunto = 'Ayuda con EG Route Plan', cuerpo = ''): Promise<boolean> {
  const url = `mailto:${SOPORTE.email}?subject=${encodeURIComponent(asunto)}${cuerpo ? `&body=${encodeURIComponent(cuerpo)}` : ''}`;
  return abrir(url);
}

/** Abre WhatsApp con el número de soporte y el mensaje ya escrito. */
export async function whatsappSoporte(mensaje = 'Hola, necesito ayuda con EG Route Plan.'): Promise<boolean> {
  const url = `https://wa.me/${SOPORTE.whatsapp}?text=${encodeURIComponent(mensaje)}`;
  return abrir(url);
}

/** Llama al teléfono de soporte. */
export async function llamarASoporte(): Promise<boolean> {
  return abrir(`tel:${SOPORTE.telefono}`);
}

/**
 * Abre un enlace EXTERNO sin poder tumbar la pantalla: si no hay app que lo atienda, se devuelve
 * false y quien llama decide qué decir. En una pantalla de dinero, un enlace roto no puede ser un
 * error silencioso.
 */
async function abrir(url: string): Promise<boolean> {
  try {
    await Linking.openURL(url);
    return true;
  } catch {
    return false;
  }
}
