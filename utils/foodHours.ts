/**
 * Validación de horarios de apertura de restaurantes (espejo del backend
 * food.dto.ts). El badge "Abierto/Cerrado" lo calcula el servidor con la hora
 * de Malabo; para que siempre funcione, el dueño solo puede guardar formatos
 * estructurados:
 *   · turnos "HH:MM-HH:MM" (guiones -, –, —), varios separados por coma o "/"
 *   · tokens: 24/7, 24h, 24 horas, todo el día, abierto 24h, siempre abierto,
 *     cerrado, closed
 */

const HOURS_TOKEN = /^(24\s*\/\s*7|24h|24\s*horas|todo\s*el\s*d[ií]a|abierto\s*24(\s*h(oras)?)?|siempre\s*abierto|cerrado|closed)$/i;
const HOURS_PAIR = /^(\d{1,2}:\d{2})\s*[-–—]\s*(\d{1,2}:\d{2})$/;

function hoursPartOk(t: string): boolean {
  const m = t.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min > 59) return false;
  if (h > 24) return false;
  if (h === 24 && min !== 0) return false;
  return true;
}

/** Devuelve true si el texto es un horario estructurado válido. */
export function foodHoursValid(v: string): boolean {
  const t = v.trim();
  if (!t) return false;
  if (HOURS_TOKEN.test(t)) return true;
  const turns = t.split(/[,/]/).map((p) => p.trim()).filter(Boolean);
  if (turns.length === 0) return false;
  return turns.every((turn) => {
    const m = turn.match(HOURS_PAIR);
    return !!m && hoursPartOk(m[1]) && hoursPartOk(m[2]);
  });
}

export const FOOD_HOURS_HINT =
  'Formato: 10:00-22:00 (turnos separados por coma, ej: 09:00-13:00, 16:00-20:00), 24h, todo el día o cerrado.';

/** Mensaje de error si el horario no es válido; null si es válido (o vacío). */
export function foodHoursError(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  return foodHoursValid(t) ? null : FOOD_HOURS_HINT;
}
