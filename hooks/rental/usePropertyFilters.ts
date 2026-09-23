/**
 * usePropertyFilters — estado de filtros del buscador de alquiler.
 * Gestiona PropertyFilters (kit) con toggles por lista, reset y contador
 * de filtros activos. Ordenación incluida (relevance | price_asc | ...).
 */

import { useMemo, useState } from 'react';
import { DEFAULT_FILTERS, type PropertyFilters } from '../../utils/propertyFilters';

export type SortOrder = 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'biggest';

export function usePropertyFilters(initial: PropertyFilters = DEFAULT_FILTERS) {
  const [filters, setFilters] = useState<PropertyFilters>({ ...initial });
  const [sortBy, setSortBy] = useState<SortOrder>('relevance');

  /** Alterna un id dentro de una lista del filtro (neighborhoods|types|essentialServices|landUse). */
  const toggle = (field: 'neighborhoods' | 'types' | 'essentialServices' | 'landUse', id: string) =>
    setFilters((f) => ({
      ...f,
      [field]: (f[field] as string[]).includes(id)
        ? (f[field] as string[]).filter((x) => x !== id)
        : [...(f[field] as string[]), id],
    }));

  const reset = () => setFilters({ ...DEFAULT_FILTERS });

  const activeCount = useMemo(() => {
    let n = 0;
    if (filters.cityId) n += 1;
    n += filters.neighborhoods.length + filters.types.length + filters.essentialServices.length + (filters.landUse?.length ?? 0);
    if (filters.rentalType) n += 1;
    if (filters.isSocialHousingOnly) n += 1;
    if (filters.hasTerrace) n += 1;
    if (filters.isLand) n += 1;
    if ((filters.minVerificationLevel ?? 0) >= 2) n += 1;
    return n;
  }, [filters]);

  return { filters, setFilters, toggle, reset, activeCount, sortBy, setSortBy };
}
