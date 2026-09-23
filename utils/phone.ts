/**
 * Utilidades de teléfono para Guinea Ecuatorial.
 * Normaliza un número local a MSISDN internacional (240 + 9 dígitos).
 * No adivina: devuelve null ante formatos raros o extranjeros.
 */
export function toGqMsisdn(phone: string): string | null {
  const d = phone.replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('240')) return d;
  if (d.length === 10 && d.startsWith('0')) return `240${d.slice(1)}`;
  if (d.length === 9) return `240${d}`;
  return null;
}

/** ¿El teléfono parece un número de GQ válido? (para avisar sin bloquear). */
export function looksLikeGqPhone(phone: string): boolean {
  return toGqMsisdn(phone) !== null;
}
