/**
 * nightMode.ts — Modo noche del MAPA por horario de GUINEA ECUATORIAL.
 *
 * La paleta nocturna (DiDi/Amap) se activa por franja horaria local de Malabo
 * (UTC+1, sin cambio de hora estacional). Calcular la hora en UTC+1 explícito
 * evita depender del huso del dispositivo: un usuario o el dueño probando
 * desde China vería el mapa según la hora real de Guinea Ecuatorial.
 *
 * Franja por defecto: 19:00–05:59 → noche.
 */
export const NIGHT_START_HOUR = 19;
export const NIGHT_END_HOUR = 6; // exclusivo (06:00 → día)

/** Hora actual en Guinea Ecuatorial (UTC+1), 0-23. */
export function gqHour(): number {
  const now = new Date();
  const utcH = now.getUTCHours() + 1; // UTC+1 fijo (África/Malabo sin DST)
  return ((utcH % 24) + 24) % 24;
}

/** true si es de noche en Malabo (19:00–05:59 hora local GQ). */
export function isNightGq(): boolean {
  const h = gqHour();
  return h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR;
}
