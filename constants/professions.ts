/**
 * Catálogo de PROFESIONES del perfil (P8), alineado con el catálogo de
 * Buscar Work: cada profesión pertenece a una categoría de trabajo
 * (constants/work CATEGORIES) para que el perfil preseleccione ofertas afines.
 */

export interface ProfessionOption {
  id: string;
  label: string;        // cómo se muestra en el perfil
  categoryId: string;   // categoría de Buscar Work (constants/work)
}

export const PROFESSIONS: ProfessionOption[] = [
  // Transporte (conductor)
  { id: 'conductor', label: 'Conductor', categoryId: 'transporte' },
  { id: 'taxista', label: 'Taxista', categoryId: 'transporte' },
  { id: 'conductor_pesado', label: 'Conductor de vehículo pesado', categoryId: 'transporte' },
  { id: 'rider', label: 'Repartidor / Rider', categoryId: 'transporte' },
  { id: 'mecanico', label: 'Mecánico', categoryId: 'transporte' },
  // Construcción
  { id: 'albanil', label: 'Albañil', categoryId: 'construccion' },
  { id: 'electricista', label: 'Electricista', categoryId: 'construccion' },
  { id: 'fontanero', label: 'Fontanero', categoryId: 'construccion' },
  { id: 'carpintero', label: 'Carpintero', categoryId: 'construccion' },
  // Petróleo y Gas
  { id: 'operador', label: 'Operador de planta', categoryId: 'petroleo' },
  { id: 'soldador', label: 'Soldador', categoryId: 'petroleo' },
  // Hostelería
  { id: 'chef', label: 'Chef / Cocinero', categoryId: 'hosteleria' },
  { id: 'camarero', label: 'Camarero', categoryId: 'hosteleria' },
  { id: 'recepcionista', label: 'Recepcionista', categoryId: 'hosteleria' },
  // Pesca
  { id: 'pescador', label: 'Pescador', categoryId: 'pesca' },
  // Comercio
  { id: 'vendedor', label: 'Vendedor', categoryId: 'comercio' },
  { id: 'comerciante', label: 'Comerciante', categoryId: 'comercio' },
  { id: 'dependiente', label: 'Dependiente', categoryId: 'comercio' },
  // Doméstico
  { id: 'empleado_hogar', label: 'Empleado del hogar', categoryId: 'domestico' },
  { id: 'cuidador', label: 'Cuidador / Acompañante', categoryId: 'domestico' },
  { id: 'jardinero', label: 'Jardinero', categoryId: 'domestico' },
  // Educación
  { id: 'profesor', label: 'Profesor', categoryId: 'educacion' },
  { id: 'maestro', label: 'Maestro', categoryId: 'educacion' },
  // Sanidad
  { id: 'enfermero', label: 'Enfermero', categoryId: 'salud' },
  { id: 'medico', label: 'Médico', categoryId: 'salud' },
  { id: 'farmaceutico', label: 'Farmacéutico', categoryId: 'salud' },
  // Administración
  { id: 'admin', label: 'Administrativo', categoryId: 'admin' },
  { id: 'contable', label: 'Contable', categoryId: 'admin' },
  { id: 'secretario', label: 'Secretario', categoryId: 'admin' },
  { id: 'gerente', label: 'Gerente', categoryId: 'admin' },
];

/** Resuelve la categoría de Buscar Work de una profesión (para preseleccionar). */
export function workCategoryOf(professionLabel: string | null | undefined): string | null {
  if (!professionLabel) return null;
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const target = norm(professionLabel);
  const found = PROFESSIONS.find((p) => norm(p.label) === target);
  return found?.categoryId ?? null;
}

/** Categorías de Work agrupadas para el selector del perfil (label agrupado). */
export const PROFESSION_GROUPS: Array<{ categoryId: string; categoryLabel: string; items: ProfessionOption[] }> = [
  { categoryId: 'transporte', categoryLabel: 'Transporte', items: PROFESSIONS.filter((p) => p.categoryId === 'transporte') },
  { categoryId: 'construccion', categoryLabel: 'Construcción', items: PROFESSIONS.filter((p) => p.categoryId === 'construccion') },
  { categoryId: 'petroleo', categoryLabel: 'Petróleo y Gas', items: PROFESSIONS.filter((p) => p.categoryId === 'petroleo') },
  { categoryId: 'hosteleria', categoryLabel: 'Hostelería', items: PROFESSIONS.filter((p) => p.categoryId === 'hosteleria') },
  { categoryId: 'pesca', categoryLabel: 'Pesca', items: PROFESSIONS.filter((p) => p.categoryId === 'pesca') },
  { categoryId: 'comercio', categoryLabel: 'Comercio', items: PROFESSIONS.filter((p) => p.categoryId === 'comercio') },
  { categoryId: 'domestico', categoryLabel: 'Doméstico', items: PROFESSIONS.filter((p) => p.categoryId === 'domestico') },
  { categoryId: 'educacion', categoryLabel: 'Educación', items: PROFESSIONS.filter((p) => p.categoryId === 'educacion') },
  { categoryId: 'salud', categoryLabel: 'Sanidad', items: PROFESSIONS.filter((p) => p.categoryId === 'salud') },
  { categoryId: 'admin', categoryLabel: 'Administración', items: PROFESSIONS.filter((p) => p.categoryId === 'admin') },
];
