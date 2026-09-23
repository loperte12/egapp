/**
 * Catálogo y utilidades del servicio WORK (bolsa de empleo) — separado de la UI.
 * Labels, listas, bandas salariales y niveles de experiencia en un solo sitio.
 */

export const CATEGORIES = ['transporte', 'construccion', 'petroleo', 'hosteleria', 'pesca', 'comercio', 'domestico', 'educacion', 'salud', 'admin'] as const;
export const CATEGORY_LABELS: Record<string, string> = {
  transporte: 'Transporte', construccion: 'Construcción', petroleo: 'Petróleo y Gas', hosteleria: 'Hostelería',
  pesca: 'Pesca', comercio: 'Comercio', domestico: 'Doméstico', educacion: 'Educación', salud: 'Sanidad', admin: 'Administración',
};

export const CITIES = ['malabo', 'bata', 'ebebiyin', 'mongomo', 'luba', 'evinayong', 'anisoc', 'rebola'] as const;
export const CITY_LABELS: Record<string, string> = {
  malabo: 'Malabo', bata: 'Bata', ebebiyin: 'Ebebiyín', mongomo: 'Mongomo',
  luba: 'Luba', evinayong: 'Evinayong', anisoc: 'Añisoc', rebola: 'Rebola',
};

export const CONTRACTS = ['completo', 'parcial', 'temporal', 'practicas', 'freelance'] as const;
export const CONTRACT_LABELS: Record<string, string> = {
  completo: 'Tiempo Completo', parcial: 'Tiempo Parcial', temporal: 'Temporal / Obra', practicas: 'Prácticas', freelance: 'Autónomo',
};

export const BENEFITS = ['seguro', 'transporte', 'comedor', 'vivienda', 'bonificacion', 'vehiculo', 'combustible', 'formacion'] as const;
export const BENEFIT_LABELS: Record<string, string> = {
  seguro: 'Seguro médico', transporte: 'Transporte empresa', comedor: 'Comedor', vivienda: 'Vivienda',
  bonificacion: 'Bonificaciones', vehiculo: 'Vehículo de trabajo', combustible: 'Combustible', formacion: 'Formación',
};

/** Bandas salariales mensuales (XAF) ofrecidas en el filtro. */
export const SALARY_BANDS: ReadonlyArray<readonly [number, number]> = [
  [50_000, 150_000], [150_000, 300_000], [300_000, 500_000], [500_000, 1_000_000],
];

/** Niveles de experiencia mínima (valor numérico de la oferta). */
export const EXPERIENCE_LEVELS: ReadonlyArray<readonly [number, string]> = [
  [0, 'Sin experiencia'], [1, 'Menos de 1 año'], [2, '1-3 años'], [3, '3-5 años'], [4, 'Más de 5 años'],
];

export const PAGE_SIZE = 10;

export interface WorkFilterState {
  categories: string[];
  cities: string[];
  contractTypes: string[];
  benefits: string[];
  salaryBand: [number, number] | null;
  experience: number;
  isVerifiedOnly: boolean;
  isUrgentOnly: boolean;
}

export const emptyWorkFilters = (): WorkFilterState => ({
  categories: [], cities: [], contractTypes: [], benefits: [],
  salaryBand: null, experience: 0, isVerifiedOnly: false, isUrgentOnly: false,
});

export function labelOf(field: 'categories' | 'cities' | 'contractTypes' | 'benefits', id: string): string {
  const map = field === 'categories' ? CATEGORY_LABELS : field === 'cities' ? CITY_LABELS : field === 'contractTypes' ? CONTRACT_LABELS : BENEFIT_LABELS;
  return map[id] || id;
}
