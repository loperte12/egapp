/**
 * DriverLiveMap — seguimiento EN VIVO del conductor para la pantalla del
 * PASAJERO (estilo DiDi): mapa 2D plano (sin pitch ni rotación) con el coche
 * animado suavemente entre posiciones.
 *
 * ── Arquitectura (decidida y aprobada 2026-09-06) ──────────────────────────
 *  · Polling cada 2,5 s a GET /mobility/trips/:id (el endpoint real que ya
 *    devuelve driver_lat/driver_lng/status/driver_updated_at — equivalente al
 *    /viajes/:id/estado del spec). Lógica en `useDriverLiveTrack` (este fichero).
 *  · La INTERPOLACIÓN corre DENTRO de la página del mapa (map-v2.html →
 *    `setCarLive`): bucle requestAnimationFrame con easing EASE-IN-OUT de 2 s
 *    (coincide con el polling) y GEO-LERP sobre círculo máximo (la Tierra es
 *    redonda: no se suma lat/lng linealmente; equivalente a turf.along sin
 *    dependencia de turf). Si un fix nuevo llega ANTES de terminar la
 *    animación, se ENCADENA desde la posición pintada (cero saltos).
 *    ¿Por qué aquí y no RAF en RN? Porque el marcador vive en el WebView:
 *    interpolar en RN obligaría a cruzar el puente ~60 veces/segundo; con un
 *    solo mensaje por fix (cada 2,5 s) el movimiento es idéntico y fluido.
 *  · Rumbo: `driver_heading` del backend si algún día lo envía; hoy se
 *    calcula entre última y penúltima posición recibidas.
 *  · >10 s sin fix nuevo → `lost` (chip "⚠️ Señal perdida") y marcador GRIS.
 *  · status 'completed'/'cancelled' → polling detenido + onEnded + coche limpiado.
 *
 * Uso:
 *  · Integrado en taxi.tsx: `useDriverLiveTrack({ tripId, mapRef, onEnded })`
 *    sobre el mapa que la pantalla ya tiene.
 *  · O standalone: `<DriverLiveMap tripId="…" origin dest routeCoords onEnded />`
 *    (pantalla de rastreo propia con su mapa, pins y chip de señal).
 */

import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import MapBackground from './MapBackground';
import { EgMarkers, EgRoutePolyline, type Coord, type EgMapViewHandle } from '../packages/map';
import { taxiApi } from '../api/taxi';
import { brand, radios, tipografia } from '@egrouteplan/ui-kit';

// ─── Tipos TypeScript (públicos) ────────────────────────────────────────────

/** Estados finales que detienen el tracking. */
export type TripFinalStatus = 'completed' | 'cancelled';

/** Un fix de posición del conductor (coordenadas [lon,lat] del heartbeat). */
export interface DriverLiveFix {
  lng: number;
  lat: number;
  /** Rumbo (grados, 0=norte). null → todavía no se pudo calcular. */
  heading: number | null;
  /** driver_updated_at del backend (timestamp del heartbeat, si viene). */
  serverAt: string | null;
}

/** Estado que expone el hook de tracking. */
export interface DriverLiveState {
  /** status crudo del viaje ('requested'|'accepted'|'in_progress'|…). */
  status: string | null;
  /** Último fix válido recibido (null hasta el primero). */
  fix: DriverLiveFix | null;
  /** true si no llega ningún fix NUEVO hace > staleMs → "Señal perdida". */
  lost: boolean;
}

export interface UseDriverLiveTrackParams {
  /** Viaje a seguir. null → inactivo (limpia marcador y detiene polling). */
  tripId: string | null;
  /** Ref del mapa (EgMapViewHandle) donde vive el coche animado. */
  mapRef: React.RefObject<EgMapViewHandle | null>;
  /** Periodo de polling. 2,5 s por spec (la anim de 2 s lo solapa sin hueco). */
  pollMs?: number;
  /** Segundos sin fix nuevo para declarar "Señal perdida" (spec: 10 s). */
  staleMs?: number;
  /** Duración de cada tramo de animación (spec: 2 s). */
  animMs?: number;
  /** Zoom al que se ENTRA en modo seguimiento (solo el primer fix). */
  followZoom?: number;
  /** Dispara UNA vez al pasar a 'completed' o 'cancelled' (polling ya parado). */
  onEnded?: (s: TripFinalStatus) => void;
}

// ─── Utilidades de rumbo (mismas fórmulas que la página del mapa) ───────────

/** Rumbo en grados (0=norte) de la posición a a la b (plano local, <100 m). */
function bearingDeg(a: Coord, b: Coord): number {
  const r = Math.PI / 180;
  const dLo = (b[0] - a[0]) * Math.cos(((a[1] + b[1]) / 2) * r);
  const dLa = b[1] - a[1];
  return (Math.atan2(dLo, dLa) * 180 / Math.PI + 360) % 360;
}

// ─── Hook: polling + rumbo + señal perdida + parada (todo el "cerebro") ─────

export function useDriverLiveTrack({
  tripId, mapRef, pollMs = 2500, staleMs = 10000, animMs = 2000,
  followZoom = 15.8, onEnded,
}: UseDriverLiveTrackParams): DriverLiveState {
  const [state, setState] = useState<DriverLiveState>({ status: null, fix: null, lost: false });
  // Última y penúltima posición → rumbo (spec 4). Usamos refs para no provocar
  // renders extra; el estado visible solo cambia cuando hay fix nuevo.
  const prevFixRef = useRef<DriverLiveFix | null>(null);
  const lastBeatRef = useRef<number>(0);          // Date.now() del último fix NUEVO visto
  const serverBeatRef = useRef<string | null>(null); // driver_updated_at visto
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  useEffect(() => {
    // Reset total al cambiar de viaje o desconectar el tracking.
    prevFixRef.current = null;
    lastBeatRef.current = 0;
    serverBeatRef.current = null;
    setState({ status: null, fix: null, lost: false });
    if (!tripId) { mapRef.current?.clearCarLive?.(); return; }

    let alive = true;
    let ended = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const stop = () => { if (timer) { clearInterval(timer); timer = null; } };

    const tick = async () => {
      if (ended) return;
      let t: Record<string, any>;
      try {
        t = await taxiApi.getTrip(tripId);
      } catch {
        // Red caída: NO rompemos nada; `lost` se declara solo por tiempo.
        setState((s) => ({ ...s, lost: lastBeatRef.current > 0 && Date.now() - lastBeatRef.current > staleMs }));
        return;
      }
      if (!alive || ended) return;

      const st = String(t?.status ?? '');
      // ── Spec 5b: finalizado/cancelado → DETENER el polling. ──
      if (st === 'completed' || st === 'cancelled') {
        ended = true;
        stop();
        mapRef.current?.clearCarLive?.();
        setState((s) => ({ ...s, status: st, lost: false }));
        onEndedRef.current?.(st);
        return;
      }

      const lng = Number(t?.driver_lng);
      const lat = Number(t?.driver_lat);
      const serverAt = t?.driver_updated_at ? String(t.driver_updated_at) : null;
      if (!Number.isFinite(lng) || !Number.isFinite(lat) || st === 'requested') {
        // Conductor aún sin posición publicada.
        setState((s) => ({ ...s, status: st || s.status }));
        return;
      }

      // ── Fix nuevo: lo detecta un heartbeat nuevo (driver_updated_at) o, si el
      //    backend no lo trae, una posición distinta. Eso marca la "última
      //    actualización" para el contador de Señal perdida (>10 s → gris). ──
      const prev = prevFixRef.current;
      const moved = !prev || Math.abs(prev.lng - lng) + Math.abs(prev.lat - lat) > 1e-7;
      const newBeat = serverAt ? serverAt !== serverBeatRef.current : moved;
      if (newBeat) lastBeatRef.current = Date.now();
      serverBeatRef.current = serverAt;

      // ── Spec 4: rumbo = heading GPS si viene; si no, última↔penúltima. ──
      let heading: number | null =
        (t?.driver_heading != null && Number.isFinite(Number(t.driver_heading))) ? Number(t.driver_heading) : null;
      if (heading == null) {
        if (prev && moved) heading = bearingDeg([prev.lng, prev.lat], [lng, lat]);
        else heading = prev?.heading ?? null; // quieto → conserva el último rumbo
      }

      const fix: DriverLiveFix = { lng, lat, heading, serverAt };
      prevFixRef.current = fix;
      const lost = lastBeatRef.current > 0 && Date.now() - lastBeatRef.current > staleMs;

      // ── Spec 3: animación (rAF + ease-in-out 2 s + encadenado) → página. ──
      // follow SOLO en 'in_progress' (coche en marcha): la cámara lo persigue.
      // Durante 'accepted' (conductor en camino) NO secuestra el mapa: la
      // pantalla del pasajero encuadra coche+recogida con fitBounds.
      mapRef.current?.setCarLive?.({ lng, lat, heading, stale: lost, durationMs: animMs, follow: st === 'in_progress' });
      setState({ status: st, fix, lost });
    };

    tick();
    timer = setInterval(tick, pollMs);
    return () => { alive = false; stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  return state;
}

// ─── Componente funcional completo (mapa + marcador + polling + chip) ───────

export interface DriverLiveMapProps {
  /** Viaje a seguir en vivo (null → sin tracking, solo mapa base). */
  tripId: string | null;
  /** Pin de origen (recogida). */
  origin?: Coord | null;
  /** Pin de destino. */
  destination?: Coord | null;
  /** Ruta restante a dibujar (opcional; p. ej. recogida→destino). */
  routeCoords?: Coord[];
  /** Cámara con la que abre (hasta que llega el primer fix del coche). */
  initialCamera?: { centerCoordinate: Coord; zoomLevel?: number };
  /** Notifica viaje finalizado/cancelado (polling ya detenido por el hook). */
  onEnded?: (s: TripFinalStatus) => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Pantalla/vista de rastreo del pasajero COMPLETA: mapa 2D plano, pins de
 * origen/destino, ruta opcional, coche animado (hook) y banner "Señal perdida".
 */
export function DriverLiveMap({
  tripId, origin, destination, routeCoords, initialCamera, onEnded, style,
}: DriverLiveMapProps) {
  const mapRef = useRef<EgMapViewHandle>(null);
  const live = useDriverLiveTrack({ tripId, mapRef, onEnded });

  return (
    <View style={[StyleSheet.absoluteFill, style]}>
      <MapBackground ref={mapRef} initialCamera={initialCamera}>
        <EgMarkers
          markers={[
            ...(origin ? [{ id: 'o', coordinate: origin, kind: 'origin' as const }] : []),
            ...(destination ? [{ id: 'd', coordinate: destination, kind: 'destination' as const }] : []),
          ]}
        />
        {routeCoords && routeCoords.length >= 2 ? <EgRoutePolyline coordinates={routeCoords} /> : null}
      </MapBackground>

      {/* Spec 5a: sin actualización >10 s → aviso visible (y el coche se pinta
          gris desde el hook, vía setCarLive stale=true). */}
      {live.lost ? (
        <View style={[styles.lostChip, { backgroundColor: 'rgba(31,41,55,0.92)' }]} accessibilityLiveRegion="polite">
          <Text style={styles.lostTxt}>⚠️ Señal perdida — esperando al GPS del conductor…</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  lostChip: {
    position: 'absolute', top: 86, alignSelf: 'center',
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: radios.full,
  },
  lostTxt: { color: brand.white, fontSize: tipografia.caption, fontWeight: '700' },
});

export default DriverLiveMap;
