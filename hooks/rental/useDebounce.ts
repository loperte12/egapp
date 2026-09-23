/**
 * useDebounce — retrasa la propagación de un valor (búsqueda en vivo).
 * Uso: const debounced = useDebounce(query, 300);
 */

import { useEffect, useState } from 'react';

export function useDebounce<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
