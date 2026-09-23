/**
 * usePropertySearch — orquesta el buscador completo de alquiler:
 * carga (lista + catálogo), refresh, debounce de la búsqueda, filtros,
 * ordenación y paginación por lotes (visibleCount). Compone los hooks
 * del módulo: useDebounce + usePropertyFilters + useFilteredProperties.
 */

import { useCallback, useEffect, useState } from 'react';
import { rentalApi, type RentalCatalog, type RentalProperty } from '../../api/rental';
import { useDebounce } from './useDebounce';
import { usePropertyFilters } from './usePropertyFilters';
import { useFilteredProperties } from './useFilteredProperties';

const PAGE_SIZE = 10;

export function usePropertySearch() {
  const { filters, setFilters, toggle, reset, activeCount, sortBy, setSortBy } = usePropertyFilters();

  const [properties, setProperties] = useState<RentalProperty[]>([]);
  const [catalog, setCatalog] = useState<RentalCatalog | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = useCallback(async () => {
    try {
      const [list, cat] = await Promise.all([rentalApi.properties(), rentalApi.catalog()]);
      setProperties(list);
      setCatalog(cat);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const debouncedQuery = useDebounce(query.trim().toLowerCase(), 300);
  const filtered = useFilteredProperties(properties, filters, debouncedQuery, sortBy);

  const onRefresh = useCallback(() => { setRefreshing(true); load(); }, [load]);

  const loadMore = useCallback(() => setVisibleCount((c) => c + PAGE_SIZE), []);
  const resetVisible = useCallback(() => setVisibleCount(PAGE_SIZE), []);

  return {
    // datos
    properties, catalog, loading, refreshing, error,
    // búsqueda y filtros
    query, setQuery, debouncedQuery, filters, setFilters, toggle, reset, activeCount,
    // orden y paginación
    sortBy, setSortBy, filtered, visibleCount, loadMore, resetVisible,
    // acciones
    onRefresh, reload: load,
  };
}
