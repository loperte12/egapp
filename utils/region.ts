/**
 * ¿Desde qué país está reservando el huésped?
 *
 * El precio real del hotel es en XAF (francos) y el pago es en efectivo, pero un huésped que reserva
 * desde España, China o Estados Unidos necesita ver cuánto es en SU moneda para decidir. El servidor
 * hace la conversión; aquí solo se averigua el país.
 *
 * ── POR QUÉ CON TANTO CUIDADO ──────────────────────────────────────────────────
 * No hay `expo-localization` instalado, así que se intenta por `Intl`. En Hermes puede no existir o
 * venir sin datos de región, y un `Intl` que revienta en el arranque dejaría la pantalla del hotel en
 * blanco: por eso todo va en `try` y, si no se puede saber, se devuelve `null` (y la pantalla ofrece
 * elegir la moneda a mano). **Nunca se adivina un país**: enseñar euros a quien paga en francos sería
 * peor que no enseñar nada.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const CLAVE = 'eg.fx.country';

/**
 * País del dispositivo ('ES', 'GQ', 'CN'…) o `null` si no se puede saber.
 * Se mira la configuración regional del sistema (`es-ES` → ES); el idioma solo (`es`) NO sirve: dice
 * el idioma, no el país, y confundirlos mandaría a media África a ver precios en euros.
 */
export function getRegionCode(): string | null {
  try {
    const intl = typeof Intl !== 'undefined' ? Intl : null;
    const loc = intl?.DateTimeFormat?.().resolvedOptions?.().locale ?? null;
    const m = /[-_]([A-Za-z]{2})\b/.exec(String(loc ?? ''));
    return m ? m[1].toUpperCase() : null;
  } catch {
    return null;
  }
}

/** País elegido a mano por el huésped (manda sobre el del sistema). */
export async function getPaisElegido(): Promise<string | null> {
  try {
    const v = await AsyncStorage.getItem(CLAVE);
    return v && /^[A-Z]{2}$/.test(v) ? v : null;
  } catch { return null; }
}

export async function setPaisElegido(code: string | null): Promise<void> {
  try {
    if (code && /^[A-Z]{2}$/.test(code)) await AsyncStorage.setItem(CLAVE, code);
    else await AsyncStorage.removeItem(CLAVE);
  } catch { /* si no se puede guardar, la elección vale para esta pantalla */ }
}

/** El que se debe usar: el elegido a mano o, si no hay, el del sistema. */
export async function getPaisParaPrecios(): Promise<string | null> {
  return (await getPaisElegido()) ?? getRegionCode();
}

/**
 * Formatea una cantidad en la moneda del huésped. Se usa `Intl.NumberFormat` si está disponible (pone
 * los separadores de SU país) y, si no, un formateo simple: nunca se deja sin pintar por un detalle de
 * formato.
 */
export function formatearMoneda(importe: number, currency: string, decimals: number): string {
  try {
    const intl = typeof Intl !== 'undefined' ? Intl : null;
    if (intl?.NumberFormat) {
      return new intl.NumberFormat(undefined, {
        style: 'currency', currency, minimumFractionDigits: decimals, maximumFractionDigits: decimals,
      }).format(importe);
    }
  } catch { /* moneda desconocida para Intl o Hermes sin datos */ }
  return `${importe.toFixed(decimals)} ${currency}`;
}
