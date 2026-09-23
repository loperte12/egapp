/**
 * datetime — fechas de calendario sin dependencias y SIN sustos de zona horaria.
 *
 * Todo el módulo hotelero habla en **fechas ISO `YYYY-MM-DD`** (día natural, hora
 * de Malabo). Aquí nunca se usa `new Date('2026-10-11')` para calcular: esa forma
 * se interpreta como UTC y, al restar un día en un huso negativo, devuelve el día
 * anterior. En su lugar se construye siempre con `Date.UTC(...)` y se lee con los
 * getters UTC, que es aritmética de calendario pura.
 *
 * Motivo por el que existe este fichero: el módulo hotelero necesita **navegar
 * meses, pintar la rejilla y sumar noches** — y la app no tiene ninguna librería de
 * fechas instalada (verificado). En vez de añadir una dependencia al APK, aquí está
 * lo poco que hace falta, con pruebas mentales sencillas y sin estado.
 */

/** Días de la semana empezando en lunes (convención europea/Malabo). */
export const DOW_SHORT = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;
export const DOW_LONG = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'] as const;
export const MONTH_LONG = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const;

/** `YYYY-MM-DD` de un `Date` en hora de Malabo (UTC+1, sin horario de verano). */
export function isoOf(d: Date): string {
  return new Date(d.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Hoy (hora de Malabo) como `YYYY-MM-DD`. */
export function todayIso(): string {
  return isoOf(new Date());
}

/** Convierte `YYYY-MM-DD` en un `Date` en UTC (aritmética segura). */
export function parseIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map((n) => Number(n));
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/** Suma (o resta) días a una fecha ISO. */
export function addDaysIso(iso: string, days: number): string {
  const d = parseIso(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Noches entre dos fechas ISO (la salida no cuenta). */
export function nightsBetween(checkIn: string, checkOut: string): number {
  return Math.round((parseIso(checkOut).getTime() - parseIso(checkIn).getTime()) / 86_400_000);
}

/** Lista de noches `[checkIn, checkOut)` en ISO. */
export function nightsList(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  const n = nightsBetween(checkIn, checkOut);
  for (let i = 0; i < n; i++) out.push(addDaysIso(checkIn, i));
  return out;
}

/** ¿`iso` está dentro de `[desde, hasta]` (ambos inclusive)? */
export function isBetween(iso: string, desde: string, hasta: string): boolean {
  return iso >= desde && iso <= hasta;
}

/** Día de la semana con lunes = 0 … domingo = 6 (para pintar la rejilla). */
export function dowMondayFirst(iso: string): number {
  return (parseIso(iso).getUTCDay() + 6) % 7;
}

/** ¿Es viernes o sábado? (noches de fin de semana, las que suelen costar más). */
export function isWeekendNight(iso: string): boolean {
  const d = parseIso(iso).getUTCDay();
  return d === 5 || d === 6;
}

/** Etiqueta corta y humana: «11 oct», «11 oct 2026». */
export function shortDate(iso: string, withYear = false): string {
  const d = parseIso(iso);
  /**
   * UNA FECHA QUE NO SE PUEDE LEER NO PUEDE TUMBAR LA APP.
   *
   * Lo que pasó (15/09, visto en el móvil): la tarjeta del pedido dentro del chat llamaba a
   * `shortDate(deliveredAt)` con un valor que no era una fecha; `parseIso` devolvía un `Invalid Date`,
   * `MONTH_LONG[NaN]` era `undefined` y el `.slice(0, 3)` de abajo reventaba con
   * «Cannot read property 'slice' of undefined»… y el error subía hasta dejar la app SIN ARRANCAR.
   * Se devuelve vacío: es honesto (no se enseña una fecha inventada) y no se lleva la app por delante.
   */
  if (Number.isNaN(d.getTime())) return '';
  const mes = MONTH_LONG[d.getUTCMonth()].slice(0, 3);
  return `${d.getUTCDate()} ${mes}${withYear ? ` ${d.getUTCFullYear()}` : ''}`;
}

/** Etiqueta larga: «viernes 11 de octubre». */
export function longDate(iso: string): string {
  const d = parseIso(iso);
  // El mismo blindaje que `shortDate`: sin fecha legible, ni se inventa ni revienta.
  if (Number.isNaN(d.getTime())) return '';
  return `${DOW_LONG[dowMondayFirst(iso)]} ${d.getUTCDate()} de ${MONTH_LONG[d.getUTCMonth()]}`;
}

/** Mes legible: «octubre 2026». */
export function monthLabel(year: number, month0: number): string {
  return `${MONTH_LONG[((month0 % 12) + 12) % 12]} ${year}`;
}

/**
 * Rejilla del mes: array de 42 celdas (6 semanas × 7 días) empezando en lunes.
 * Las celdas fuera del mes van con `inMonth: false` (se pintan apagadas, así el
 * calendario no «salta» de alto al cambiar de mes).
 */
export function monthGrid(year: number, month0: number): { iso: string; day: number; inMonth: boolean }[] {
  const first = new Date(Date.UTC(year, month0, 1));
  const offset = (first.getUTCDay() + 6) % 7; // lunes = 0
  const start = new Date(Date.UTC(year, month0, 1 - offset));
  const celdas: { iso: string; day: number; inMonth: boolean }[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start.getTime());
    d.setUTCDate(start.getUTCDate() + i);
    celdas.push({
      iso: d.toISOString().slice(0, 10),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === (((month0 % 12) + 12) % 12) && d.getUTCFullYear() === year,
    });
  }
  return celdas;
}

/** Mes anterior / siguiente (con el año correcto). */
export function shiftMonth(year: number, month0: number, delta: number): { year: number; month0: number } {
  const d = new Date(Date.UTC(year, month0 + delta, 1));
  return { year: d.getUTCFullYear(), month0: d.getUTCMonth() };
}

/** Índice de posición entre dos meses (para bloquear el pasado). */
export function monthIndex(year: number, month0: number): number {
  return year * 12 + month0;
}

/** Precio en XAF con separador de miles (formato del proyecto: 25 000 XAF). */
export function xaf(n: number | null | undefined): string {
  const v = Math.round(Number(n ?? 0));
  return `${v.toLocaleString('fr-FR').replace(/\u202f|\u00a0/g, ' ')} XAF`;
}

/** Contador hacia atrás legible para la retención: «19 min 04 s». */
export function countdown(untilIso: string | null | undefined, now = Date.now()): string | null {
  if (!untilIso) return null;
  const ms = new Date(untilIso).getTime() - now;
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return '0 min';
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const seg = totalSec % 60;
  if (min >= 60) {
    const h = Math.floor(min / 60);
    return `${h} h ${String(min % 60).padStart(2, '0')} min`;
  }
  return `${min} min ${String(seg).padStart(2, '0')} s`;
}
