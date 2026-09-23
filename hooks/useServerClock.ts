/**
 * useServerClock — reloj estimado del SERVIDOR.
 * El cliente calcula offsetMs = serverTime - Date.now() y lo refresca en cada
 * respuesta; el countdown del estado usa SIEMPRE este reloj, nunca el local,
 * para que cambiar la hora del móvil no alargue ni acorte la validez.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

let cachedOffsetMs = 0;
let lastSyncAt = 0;

/** Calcula el offset con una respuesta HTTP (cabecera Date o cuerpo). */
export function syncServerOffset(headersDate?: string | null, bodyServerTime?: string | number | null) {
  const t = bodyServerTime != null
    ? new Date(String(bodyServerTime)).getTime()
    : headersDate ? new Date(headersDate).getTime() : NaN;
  if (!Number.isNaN(t) && t > 0) {
    cachedOffsetMs = t - Date.now();
    lastSyncAt = Date.now();
  }
  return cachedOffsetMs;
}

export function getServerOffset(): number {
  return cachedOffsetMs;
}

export function nowServer(): number {
  return Date.now() + cachedOffsetMs;
}

/**
 * Hook: devuelve el reloj del servidor actualizado cada `intervalMs`.
 * Se recalibra con syncServerOffset() en cada fetch.
 */
export function useServerClock(intervalMs = 30_000): number {
  const [, setTick] = useState(0);
  const raf = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const loop = () => {
      setTick((t) => t + 1);
      raf.current = setTimeout(loop, intervalMs);
    };
    loop();
    return () => { if (raf.current) clearTimeout(raf.current); };
  }, [intervalMs]);
  return nowServer();
}

/** Formatea ms restantes en "18 h" / "quedan 45 min". */
export function formatRemainingMs(ms: number): string {
  if (ms <= 0) return 'expirado';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 24) return '24 h';
  if (h >= 1) return `${h} h`;
  if (m >= 1) return `quedan ${m} min`;
  return 'quedan minutos';
}
