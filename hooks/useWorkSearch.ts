/**
 * useWorkSearch — lógica del buscador de Work separada de la UI.
 * Estado (búsqueda/filtros/orden), llamadas SERVER-SIDE con debounce 300 ms,
 * reqId anti-stale, errores/carga/refresco y paginación visible local
 * (reinicia `visibleCount` cuando cambian filtros o búsqueda).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { workApi, WorkFilters, WorkJob } from '../api/work';
import { type SortKey } from '../components/jobs';
import {
  emptyWorkFilters, labelOf, PAGE_SIZE, type WorkFilterState,
} from '../constants/work';

type Field = 'categories' | 'cities' | 'contractTypes' | 'benefits';

export function useWorkSearch() {
  const [jobs, setJobs] = useState<WorkJob[]>([]);
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<WorkFilterState>(emptyWorkFilters());
  const [sortBy, setSortBy] = useState<SortKey>('recent');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const reqId = useRef(0);
  const firstRun = useRef(true);

  // Filtros que SÍ se envían al servidor (nada de rangos fantasma).
  const buildParams = useCallback((): WorkFilters => {
    const p: WorkFilters = {};
    const q = query.trim();
    if (q) p.q = q;
    if (filters.categories.length) p.categories = filters.categories;
    if (filters.cities.length) p.cities = filters.cities;
    if (filters.contractTypes.length) p.contractTypes = filters.contractTypes;
    if (filters.benefits.length) p.benefits = filters.benefits;
    if (filters.salaryBand) { p.salaryMin = filters.salaryBand[0]; p.salaryMax = filters.salaryBand[1]; }
    if (filters.experience > 0) p.experience = filters.experience;
    if (filters.isVerifiedOnly) p.verifiedOnly = true;
    if (filters.isUrgentOnly) p.urgentOnly = true;
    return p;
  }, [query, filters]);

  const paramsKey = JSON.stringify(buildParams());

  const doFetch = useCallback(async (mode: 'initial' | 'refresh') => {
    const id = ++reqId.current;
    if (mode === 'initial') setLoading(true);
    if (mode === 'refresh') setRefreshing(true);
    setError(null);
    try {
      const list = await workApi.jobs(buildParams());
      if (id !== reqId.current) return;
      setJobs(list);
      setLoadedAt(new Date());
    } catch {
      if (id !== reqId.current) return;
      if (mode === 'initial') {
        setError('No pudimos cargar las ofertas. Revisa tu conexión e inténtalo de nuevo.');
        setJobs([]);
      }
      // Refresco fallido: se conserva la lista visible.
    } finally {
      if (id === reqId.current) { setLoading(false); setRefreshing(false); }
    }
  }, [buildParams]);

  // Carga inicial + cambios de búsqueda/filtros (debounce) → se reinicia la
  // paginación visible para no heredar el scroll de la búsqueda anterior.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    if (firstRun.current) {
      firstRun.current = false;
      doFetch('initial');
      return;
    }
    const t = setTimeout(() => doFetch('initial'), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  const refresh = useCallback(() => doFetch('refresh'), [doFetch]);
  const retry = useCallback(() => doFetch('initial'), [doFetch]);

  const toggle = useCallback((field: Field, id: string) => {
    setFilters((f) => ({ ...f, [field]: f[field].includes(id) ? f[field].filter((x) => x !== id) : [...f[field], id] }));
  }, []);

  const setSalaryBand = useCallback((band: [number, number] | null) => {
    setFilters((f) => ({ ...f, salaryBand: band }));
  }, []);

  const setExperience = useCallback((level: number) => {
    setFilters((f) => ({ ...f, experience: f.experience === level ? 0 : level }));
  }, []);

  const setVerified = useCallback((v: boolean) => setFilters((f) => ({ ...f, isVerifiedOnly: v })), []);
  const setUrgent = useCallback((v: boolean) => setFilters((f) => ({ ...f, isUrgentOnly: v })), []);

  const clearFilters = useCallback(() => setFilters(emptyWorkFilters()), []);

  const activeCount = useMemo(
    () => filters.categories.length + filters.cities.length + filters.contractTypes.length + filters.benefits.length
      + (filters.salaryBand ? 1 : 0) + (filters.experience > 0 ? 1 : 0)
      + (filters.isVerifiedOnly ? 1 : 0) + (filters.isUrgentOnly ? 1 : 0),
    [filters],
  );
  const hasAny = activeCount > 0 || query.trim() !== '';

  // Chips de filtros activos con su acción de quitar (label correcto por campo).
  const chips = useMemo(() => {
    const list: Array<{ label: string; remove: () => void }> = [];
    (['categories', 'cities', 'contractTypes', 'benefits'] as const).forEach((field) => {
      filters[field].forEach((id) => list.push({ label: labelOf(field, id), remove: () => toggle(field, id) }));
    });
    if (filters.salaryBand) {
      list.push({ label: `${filters.salaryBand[0].toLocaleString('es')}–${filters.salaryBand[1].toLocaleString('es')} XAF`, remove: () => setSalaryBand(null) });
    }
    return list;
  }, [filters, toggle, setSalaryBand]);

  return {
    jobs, loading, error, refreshing, query, setQuery, sortBy, setSortBy,
    filters, activeCount, hasAny, chips,
    toggle, setSalaryBand, setExperience, setVerified, setUrgent, clearFilters, refresh, retry,
    visibleCount, loadMore: () => setVisibleCount((c) => c + PAGE_SIZE),
    loadedAt,
  };
}
