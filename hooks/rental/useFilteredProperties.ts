/**
 * useFilteredProperties — aplica applyPropertyFilters + sortProperties
 * (kit) sobre una lista, memoizado. El texto de búsqueda debe venir ya
 * debounced desde el consumidor (ver useDebounce).
 */

import { useMemo } from 'react';
import { applyPropertyFilters, sortProperties, type PropertyFilters } from '../../utils/propertyFilters';
import type { RentalProperty } from '../../api/rental';
import type { SortOrder } from './usePropertyFilters';

export function useFilteredProperties(
  properties: RentalProperty[],
  filters: PropertyFilters,
  searchText: string,
  order: SortOrder,
): RentalProperty[] {
  return useMemo(
    () => sortProperties(applyPropertyFilters(properties, { ...filters, searchText }), order),
    [properties, filters, searchText, order],
  );
}
