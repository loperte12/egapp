/**
 * useUnreadChat — contador de mensajes sin leer, COMPARTIDO entre pantallas.
 *
 * Por qué existe (2026-09-12, B8): el sondeo de no leídos vivía dentro de
 * `lifebook.tsx` (~línea 270). Al querer mostrar el aviso también en el dock
 * inferior —que se pinta en 7 pantallas distintas— ese diseño obligaba a
 * duplicar el `setInterval` en cada una: siete peticiones cada 15 s al mismo
 * endpoint, y siete fuentes de verdad que podían desincronizarse.
 *
 * La solución es caché a nivel de MÓDULO, no de componente: todas las pantallas
 * leen la misma cifra y solo hay un temporizador vivo mientras haya al menos un
 * suscriptor. El estado se comparte por `useSyncExternalStore` para que un cambio
 * re-renderice a todos los suscriptores a la vez.
 *
 * Regla de la casa respetada: si la petición falla, se conserva el valor anterior
 * en vez de ponerlo a 0 — un fallo de red no debe hacer creer que no hay mensajes.
 */

import { useCallback, useEffect, useSyncExternalStore } from 'react';
import { lifebookChatApi } from '../api/lifebook';

/** Intervalo del sondeo. El que ya usaba `lifebook.tsx`; se mantiene. */
const POLL_MS = 15_000;

let unread = 0;
let cargando = false;
let timer: ReturnType<typeof setInterval> | null = null;
let suscriptores = 0;
const oyentes = new Set<() => void>();

function emitir() {
  oyentes.forEach((fn) => fn());
}

/** Una sola petición en vuelo aunque varias pantallas la pidan a la vez. */
async function refrescar(): Promise<void> {
  if (cargando) return;
  cargando = true;
  try {
    const r = await lifebookChatApi.unread();
    const n = Number(r?.unread ?? 0);
    if (Number.isFinite(n) && n >= 0 && n !== unread) {
      unread = n;
      emitir();
    }
  } catch {
    // Silencioso a propósito: el dock no debe parpadear por un fallo de red, y
    // conservar el último valor conocido es mejor que mostrar 0 (falso negativo).
  } finally {
    cargando = false;
  }
}

function suscribir(onChange: () => void): () => void {
  oyentes.add(onChange);
  suscriptores += 1;
  // El primer suscriptor arranca el sondeo; se refresca ya para no esperar 15 s.
  if (suscriptores === 1) {
    void refrescar();
    if (!timer) timer = setInterval(() => { void refrescar(); }, POLL_MS);
  }
  return () => {
    oyentes.delete(onChange);
    suscriptores -= 1;
    // Sin pantallas que lo muestren, se para el temporizador: no tiene sentido
    // sondear en segundo plano si nadie va a pintar el badge.
    if (suscriptores <= 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

function leer(): number {
  return unread;
}

/**
 * Devuelve el número de mensajes sin leer, actualizado cada 15 s mientras la
 * pantalla esté montada.
 *
 * `forzar` re-consulta fuera de ciclo: se usa al SALIR de un chat (leer mensajes
 * debe quitar el badge sin esperar al siguiente tick) y al volver a la app.
 */
export function useUnreadChat(): { unread: number; forzar: () => void } {
  const valor = useSyncExternalStore(suscribir, leer, leer);
  const forzar = useCallback(() => { void refrescar(); }, []);

  // Al recuperar el foco (volver de un chat, desbloquear el móvil) se refresca.
  // `visibilitychange` cubre el caso de la app en segundo plano en web; en
  // nativo el re-mount del hook ya dispara el primer `refrescar()` vía suscribir.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVisible = () => { if (document.visibilityState === 'visible') void refrescar(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  return { unread: valor, forzar };
}
