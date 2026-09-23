/**
 * ESTADO 24H (v3) — constantes y utilidades de la UI.
 * El catálogo real de presets viene del servidor (/status/presets); aquí viven
 * los DEGRADADOS (bg → colores) y utilidades de formato/copy.
 */

/** Máximo de caracteres de la línea del estado (alineado con el backend). */
export const STATUS_TEXT_MAX = 40;

/** Degradados del estado: clave → [color inicio, color fin]. */
export const STATUS_BGS: Record<string, [string, string]> = {
  ocean: ['#1E6FD9', '#3AA0FF'],
  sky: ['#1291D6', '#7FD4FF'],
  sunset: ['#F2613F', '#FFB25E'],
  mint: ['#0FA98C', '#5FE0BD'],
  grape: ['#7B4BE0', '#C08BFF'],
  berry: ['#E0397B', '#FF8FB2'],
  gold: ['#D99E2B', '#FFE08A'],
  night: ['#2B3A55', '#5A6F94'],
};

/** Resuelve una clave de fondo a colores (default ocean). */
export function statusBgColors(bg?: string | null): [string, string] {
  if (bg && STATUS_BGS[bg]) return STATUS_BGS[bg];
  return STATUS_BGS.ocean;
}

/** Opciones de visibilidad (UI español → valor API). */
export const VISIBILITY_OPTIONS: Array<{
  value: 'public' | 'followers' | 'private';
  label: string;
  hint: string;
}> = [
  { value: 'public', label: 'Todos', hint: 'Lo ve cualquiera' },
  { value: 'followers', label: 'Seguidores', hint: 'Solo quien te sigue' },
  { value: 'private', label: 'Solo yo', hint: 'Solo tú lo verás' },
];

/** Copia de visibilidad legible. */
export const VISIBILITY_LABEL: Record<string, string> = {
  public: 'Público',
  followers: 'Seguidores',
  private: 'Solo yo',
};

/** Formato completo del tiempo restante. */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'expirado';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return '24 h';
  if (h >= 1) return `${h} h${m > 0 ? ` ${m} min` : ''}`;
  if (m >= 1) return `quedan ${m} min`;
  return 'quedan minutos';
}

/** Etiqueta corta para chips. */
export function remainingShort(ms: number): string {
  if (ms <= 0) return '0 h';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 1) return `${h} h`;
  return `${Math.max(1, m)} min`;
}

/** Razones de reporte (UI español → valor API). */
export const REPORT_REASONS: Array<{ value: string; label: string }> = [
  { value: 'spam', label: 'Spam' },
  { value: 'fraud', label: 'Fraude' },
  { value: 'sexual', label: 'Contenido sexual' },
  { value: 'violence', label: 'Violencia' },
  { value: 'impersonation', label: 'Suplantación' },
  { value: 'personal_info', label: 'Información personal' },
  { value: 'false_emergency', label: 'Emergencia falsa' },
  { value: 'illegal', label: 'Contenido ilegal' },
];
