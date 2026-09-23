/**
 * Detalle de plato (migración 041) — parseo, validación y formato.
 *
 * Espejo del backend `food.dto.ts` (parche 041-A): los mismos límites, para que
 * lo que la pantalla acepta sea exactamente lo que el servidor acepta. Si el
 * dueño escribe algo que aquí pasa pero el servidor rechaza, el usuario pierde
 * el formulario entero — por eso ambos ficheros se mantienen sincronizados.
 *
 * Ingredientes y acompañantes son texto libre en la UI (el dueño no debe
 * aprender sintaxis), pero se normalizan a estructura antes de enviar:
 *   · ingredients → string única (BD es text), separada por comas
 *   · sides       → string[] (BD es jsonb), cada acompañante por separado
 */

import { INGREDIENTS_MAX, PORTION_SIZE_MAX, PREP_MINUTES_MAX, SIDES_MAX, type SpiceLevel } from '../api/food';

/** Separadores aceptados al escribir ingredientes/acompañantes. */
const SEPARATORS = /[,;·\n]/;

/** Quita vacíos, trim y duplicados preservando el orden de aparición. */
function normalizeList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(SEPARATORS)) {
    const v = part.trim().replace(/\s+/g, ' ');
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue; // "arroz, ARROZ" → un solo acompañante
    seen.add(key);
    out.push(v);
  }
  return out;
}

// --- Ingredientes -----------------------------------------------------------

/** Texto libre → string normalizada para guardar (BD: text). '' si vacío. */
export function parseIngredients(raw: string): string {
  return normalizeList(raw).join(', ');
}

/** String de BD → texto para el campo (ya viene normalizada, solo trim). */
export function ingredientsToField(v: string | null | undefined): string {
  return (v ?? '').trim();
}

/** Mensaje de error si excede el máximo; null si es válido (o vacío). */
export function ingredientsError(v: string): string | null {
  return parseIngredients(v).length > INGREDIENTS_MAX
    ? `Demasiado largo: máximo ${INGREDIENTS_MAX} caracteres.`
    : null;
}

// --- Acompañantes -----------------------------------------------------------

/** Texto libre → array para guardar (BD: jsonb). */
export function parseSides(raw: string): string[] {
  return normalizeList(raw).slice(0, SIDES_MAX);
}

/** Array de BD → texto para el campo. */
export function sidesToField(v: string[] | null | undefined): string {
  return Array.isArray(v) ? v.join(', ') : '';
}

/** Mensaje de error si hay demasiados o alguno es muy largo; null si válido. */
export function sidesError(v: string): string | null {
  const list = parseSides(v);
  if (list.length > SIDES_MAX) return `Máximo ${SIDES_MAX} acompañantes.`;
  if (list.some((s) => s.length > 60)) return 'Cada acompañante, máximo 60 caracteres.';
  return null;
}

// --- Tamaño / ración --------------------------------------------------------

export function portionSizeError(v: string): string | null {
  return v.trim().length > PORTION_SIZE_MAX
    ? `Máximo ${PORTION_SIZE_MAX} caracteres.`
    : null;
}

// --- Tiempo de preparación --------------------------------------------------

/** Texto del campo → entero de minutos, o null si vacío/no numérico. */
export function parsePrepMinutes(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

/** Mensaje de error; null si válido o vacío (campo opcional). */
export function prepMinutesError(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const n = parsePrepMinutes(t);
  if (n === null) return 'Pon un número entero de minutos.';
  if (n < 1) return 'Mínimo 1 minuto.';
  if (n > PREP_MINUTES_MAX) return `Máximo ${PREP_MINUTES_MAX} minutos.`;
  return null;
}

// --- Picante ----------------------------------------------------------------

/** Orden de menor a mayor picante (para los chips del formulario). */
export const SPICE_ORDER: SpiceLevel[] = ['none', 'mild', 'medium', 'hot', 'extra_hot'];

/** True si el valor es un nivel de picante conocido (defensa ante datos viejos). */
export function isSpiceLevel(v: unknown): v is SpiceLevel {
  return typeof v === 'string' && (SPICE_ORDER as string[]).includes(v);
}

// --- Formateo para ficha ----------------------------------------------------

/** Resumen de una línea para la tarjeta del menú; null si no hay nada que mostrar.
 *  ⚠ NO incluye `portionSize`: la tarjeta ya lo pinta como chip propio (📏), y
 *  meterlo aquí lo mostraría dos veces. Solo bebida incluida y tiempo de cocina. */
export function itemDetailSummary(item: {
  drinkIncluded?: boolean;
  prepMinutes?: number | null;
}): string | null {
  const parts: string[] = [];
  if (item.drinkIncluded) parts.push('bebida incluida');
  if (typeof item.prepMinutes === 'number' && item.prepMinutes > 0) {
    parts.push(`~${item.prepMinutes} min`);
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}
