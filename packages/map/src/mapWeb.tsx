/**
 * Proveedor de mapa WebView + MapLibre GL JS (funciona en Expo Go y producción).
 * Consume tiles/style/glyphs self-hosted de egrouteplan.com. Sin módulos nativos.
 * Misma API: EgMapView (ref setCamera/fitBounds), EgCamera, EgMarkers,
 * EgUserLocation (config serializada al WebView). Polylines: no-op seguro por ahora.
 */

import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { Coord, MapMarker } from './types';

export interface EgMapViewHandle {
  setCamera: (opts: { centerCoordinate?: Coord; zoomLevel?: number; durationMs?: number }) => void;
  fitBounds: (coords: unknown, opts?: { bottomFrac?: number }) => void;
  /** Cámara de navegación: centro + zoom + rumbo (bearing) + inclinación (pitch). */
  setNavView?: (o: { lng: number; lat: number; zoom: number; bearing?: number; pitch?: number; durationMs?: number; carLng?: number; carLat?: number }) => void;
  /** Modo "coche siempre hacia arriba" (el mapa rota con el movimiento). */
  setHeadingUp?: (up: boolean) => void;
  /** Guía del conductor: NO-OP de limpieza (la línea blanca de predicción fue
   *  cancelada el 2026-09-05: tapaba la ruta y borraba las flechas animadas). */
  setGuide?: (coords: Coord[]) => void;
  /** Modo navegación: 'drive' (conductor, paleta Amap, gestos bloqueados),
   *  'passenger' (pasajero, MISMA paleta Amap pero con pan libre y pitch 0)
   *  o 'normal' (colores claros, gestos libres). */
  setNavMode?: (mode: 'drive' | 'passenger' | 'normal') => void;
  /** PASAJERO: coche en vivo animado (rAF + ease-in-out 2 s DENTRO de la
   *  página). heading: rumbo GPS o calculado entre 2 últimas posiciones
   *  (null → lo deriva la página); stale → gris; follow → cámara 2D sigue. */
  setCarLive?: (o: { lng: number; lat: number; heading?: number | null; stale?: boolean; durationMs?: number; follow?: boolean }) => void;
  /** Quita el coche en vivo y detiene su animación. */
  clearCarLive?: () => void;
  /** CONDUCTOR: cuerda ROJA fina tipo DiDi que une SU coche (lng1,lat1) con la
   *  recogida (lng2,lat2). null → quitarla. Se refresca con cada fix. */
  setRope?: (lng1: number | null, lat1: number | null, lng2: number | null, lat2: number | null) => void;
  /** PASAJERO: ruta REAL por calles del conductor → recogida (DiDi muestra al
   *  pasajero el camino exacto que recorrerá su conductor). vacío → quitarla. */
  setApproach?: (coords: Coord[]) => void;
  /** 'Conductor en camino' (accepted): la ruta azul pasa a GRIS tenue para que
   *  la línea roja del conductor sea la protagonista. false → azul normal. */
  setRouteDim?: (on: boolean) => void;
  /** Modo noche FORZADO por horario de Guinea Ecuatorial (UTC+1): true=fondo
   *  oscuro aunque el dispositivo esté en otro huso. */
  setNight?: (night: boolean) => void;
  /** P3 ZONAS CALIENTES (SIMULACIÓN VISUAL, sin demanda real aún): círculos
   *  rojo/amarillo/azul en el WebView 2D. [] o undefined → limpiar. */
  setHeatZones?: (zones: Array<{ lat: number; lng: number; rM: number; level: 'high' | 'mid' | 'low' }>) => void;
}

const ORIGIN = 'https://hk.egrouteplan.com';
// Página canónica servida por HTTPS real (no HTML inline): MapLibre necesita un
// origen https para operar workers/CORS y descargar los tiles .mvt.
// map-v2: sin caché agresiva (el alias /assets/ es immutable 1 año) y ready por
// polling. El sufijo ?v fuerza a descargar la versión con navCam (bearing/pitch
// para 3D y heading-up) si el WebView tuviera cacheada una página anterior.
const MAP_PAGE_URL = `${ORIGIN}/assets/map-v2.html?v=20260909d`;

/** Ejecuta una llamada JS en la página del mapa (más fiable que postMessage en Android). */
function injectJS(webRef: React.RefObject<WebView | null>, code: string) {
  webRef.current?.injectJavaScript(`(function(){ try { ${code} } catch(e){ if(window.ReactNativeWebView) ReactNativeWebView.postMessage(JSON.stringify({type:'status',s:'js-err:'+e.message})); } })(); true;`);
}

interface PressMeta {
  drag?: boolean;
  kind?: string;
}

interface WebMapProps {
  style?: StyleProp<ViewStyle>;
  onMapPress?: (coord: Coord, meta?: PressMeta) => void;
  /** Alias del mapa nativo (MapBackground usa onPress). */
  onPress?: (coord: Coord, meta?: PressMeta) => void;
  onMapLoaded?: () => void;
  /** El mapa devuelve rumbo/inclinación reales (verificación 3D) y cy: la
   *  fracción (0..1) de la altura de pantalla donde proyecta el coche, para
   *  que el conductor ajuste el look-ahead y lo mantenga en el tercio inferior. */
  onNavState?: (s: { bearing: number; pitch: number; zoom: number; cy?: number }) => void;
  /** Zona sensible detectada cerca del coche (conductor): p. ej. escuela →
   *  la voz avisa "cuidado". kind='school' | name | distM. */
  onHazard?: (h: { kind: string; name: string; distM: number }) => void;
  children?: React.ReactNode;
  rotateEnabled?: boolean;
  pitchEnabled?: boolean;
  compassEnabled?: boolean;
  attributionEnabled?: boolean;
  animationDuration?: number;
}

export const EgMapViewWeb = forwardRef<EgMapViewHandle, WebMapProps>(function EgMapViewWeb(
  { style, onMapPress, onMapLoaded, onNavState, onHazard, children, onPress },
  ref,
) {
  const webRef = useRef<WebView>(null);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const lastMarkersRef = useRef<string | null>(null);
  const lastRouteRef = useRef<string | null>(null);
  // Cámara inicial: solo se envía cuando su VALOR cambia (no en cada re-render
  // del padre). ConductorScreen se re-renderiza cada 250 ms en la simulación;
  // si re-enviáramos setView(Malabo z13) en cada render, cancelaría la easeTo
  // de navCam a medio camino → pitch/bearing congelados (~21°/−18°) y zoom
  // tirando a 13, tal como se observó en el dispositivo.
  const lastInitialCamRef = useRef<string | null>(null);
  const pressRef = useRef(onMapPress ?? onPress);
  pressRef.current = onMapPress ?? onPress;
  const navStateRef = useRef(onNavState);
  navStateRef.current = onNavState;
  const hazardRef = useRef(onHazard);
  hazardRef.current = onHazard;
  const loadedRef = useRef(onMapLoaded);
  loadedRef.current = onMapLoaded;

  const cfg = useMemo(() => {
    let camera: Coord | null = null;
    let zoom = 13;
    let route: Coord[] = [];
    const markers: Array<{ lng: number; lat: number; kind: string; label?: string; drag?: boolean; heading?: number }> = [];
    const walk = (node: React.ReactNode) => {
      if (!React.isValidElement(node)) return;
      const type = (node.type as { name?: string })?.name ?? '';
      const p: any = node.props;
      if (type === 'EgMapCamera') {
        if (Array.isArray(p.centerCoordinate)) { camera = [p.centerCoordinate[0], p.centerCoordinate[1]]; zoom = p.zoomLevel ?? zoom; }
      } else if (type === 'EgMapMarkers') {
        (Array.isArray(p.markers) ? p.markers : []).forEach((m: MapMarker) => {
          if (m && Array.isArray(m.coordinate)) {
            markers.push({ lng: m.coordinate[0], lat: m.coordinate[1], kind: m.kind, label: m.label, drag: m.draggable === true, heading: m.heading });
          }
        });
      } else if (type === 'EgRoutePolyline' && Array.isArray(p.coordinates)) {
        route = p.coordinates.map((c: Coord) => [c[0], c[1]]);
      } else if (Array.isArray(p.children)) {
        p.children.forEach((c: React.ReactNode) => walk(c));
      }
    };
    React.Children.forEach(children, walk);
    return { camera, zoom, markers, route };
  }, [children]);

  useEffect(() => {
    if (!ready || !cfg.camera) return;
    // Una sola vez por valor de cámara inicial (el padre re-renderiza con
    // frecuencia; NO queremos cancelar la cámara de navegación en cada tick).
    const cam = cfg.camera as Coord;
    const sig = `${cam[0].toFixed(6)},${cam[1].toFixed(6)},z${cfg.zoom}`;
    if (lastInitialCamRef.current === sig) return;
    lastInitialCamRef.current = sig;
    injectJS(webRef, `if (typeof setView === 'function') setView(${cam[0]}, ${cam[1]}, ${cfg.zoom}, 600);`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cfg.camera]);

  useEffect(() => {
    if (!ready) return;
    const j = JSON.stringify(cfg.route);
    if (lastRouteRef.current === j) return;
    lastRouteRef.current = j;
    injectJS(webRef, `if (typeof setRoute === 'function') setRoute(${j});`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cfg.route]);

  useEffect(() => {
    if (!ready) return;
    const markers = JSON.stringify(cfg.markers);
    if (lastMarkersRef.current === markers) return; // no re-dibujar pins DOM si no cambian
    lastMarkersRef.current = markers;
    injectJS(webRef, `if (typeof setMarkers === 'function') setMarkers(${markers});`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, cfg.markers]);

  useImperativeHandle(ref, () => ({
    setCamera: ({ centerCoordinate, zoomLevel, durationMs }) => {
      if (centerCoordinate) {
        console.warn(`[map-web] enviar-view ${centerCoordinate[0].toFixed(4)},${centerCoordinate[1].toFixed(4)} z=${zoomLevel ?? 13}`);
        injectJS(webRef, `if (typeof setView === 'function') setView(${centerCoordinate[0]}, ${centerCoordinate[1]}, ${zoomLevel ?? 13}, ${durationMs ?? 600});`);
      }
    },
    fitBounds: (coords, opts?: { bottomFrac?: number }) => {
      const flat: Coord[] = [];
      (Array.isArray(coords) ? coords : []).forEach((c: any) => {
        if (Array.isArray(c) && Array.isArray(c[0])) (c as Coord[]).forEach((p) => flat.push(p));
        else if (Array.isArray(c)) flat.push(c as unknown as Coord);
      });
      if (flat.length) {
        console.warn(`[map-web] enviar-fit ${flat.length} pts`);
        const pts = JSON.stringify(flat);
        const frac = opts?.bottomFrac ?? 0.38;
        injectJS(webRef, `if (typeof fit === 'function') fit(${pts}, {bottomFrac:${frac}});`);
      }
    },
    setNavView: (o) => {
      console.warn(`[map-web] navcam z${o.zoom} b=${o.bearing ?? '-'} p=${o.pitch ?? '-'}`);
      // Prioridad: navCam (bearing/pitch/3D). Si la página cargada aún no lo
      // tiene, setView garantiza que la cámara SIGA al coche (nunca perderlo).
      injectJS(
        webRef,
        `if (typeof navCam === 'function') { navCam(${o.lng}, ${o.lat}, ${o.zoom}, ${o.bearing ?? 'null'}, ${o.pitch ?? 'null'}, ${o.durationMs ?? 800}, ${o.carLng ?? 'null'}, ${o.carLat ?? 'null'}); } else if (typeof setView === 'function') { setView(${o.lng}, ${o.lat}, ${o.zoom}, ${o.durationMs ?? 800}); }`,
      );
    },
    setHeadingUp: (up) => {
      injectJS(webRef, `if (typeof setHeadingUp === 'function') setHeadingUp(${up ? 'true' : 'false'});`);
    },
    setGuide: (coords) => {
      const pts = JSON.stringify(coords || []);
      injectJS(webRef, `if (typeof setGuide === 'function') setGuide(${pts});`);
    },
    setNavMode: (mode) => {
      injectJS(webRef, `if (typeof navMode === 'function') navMode('${mode}');`);
    },
    setCarLive: (o) => {
      if (!Number.isFinite(o.lng) || !Number.isFinite(o.lat)) return;
      const hd = (typeof o.heading === 'number' && Number.isFinite(o.heading)) ? o.heading.toFixed(1) : 'null';
      injectJS(
        webRef,
        `if (typeof setCarLive === 'function') setCarLive(${o.lng}, ${o.lat}, ${hd}, ${o.stale ? 'true' : 'false'}, ${o.durationMs ?? 2000}, ${o.follow === false ? 'false' : 'true'});`,
      );
    },
    clearCarLive: () => {
      injectJS(webRef, `if (typeof clearCarLive === 'function') clearCarLive();`);
    },
    setRope: (lng1, lat1, lng2, lat2) => {
      injectJS(webRef, `if (typeof setRope === 'function') setRope(${lng1 ?? 'null'}, ${lat1 ?? 'null'}, ${lng2 ?? 'null'}, ${lat2 ?? 'null'});`);
    },
    setApproach: (coords) => {
      const pts = JSON.stringify(coords || []);
      injectJS(webRef, `if (typeof setApproach === 'function') setApproach(${pts});`);
    },
    setRouteDim: (on) => {
      injectJS(webRef, `if (typeof setRouteDim === 'function') setRouteDim(${on ? 'true' : 'false'});`);
    },
    setNight: (night) => {
      injectJS(webRef, `if (typeof setNightOverride === 'function') setNightOverride(${night ? 'true' : 'false'});`);
    },
    setHeatZones: (zones) => {
      const j = JSON.stringify(zones || []);
      injectJS(webRef, `if (typeof setHeatZones === 'function') setHeatZones(${j});`);
    },
  }), []);

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let msg: any = null;
    try { msg = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (!msg) return;
    if (msg.type === 'ready') {
      if (!readyRef.current) {
        readyRef.current = true;
        setReady(true);
        loadedRef.current?.();
      }
    } else if (msg.type === 'press') {
      pressRef.current?.([msg.lng, msg.lat]);
    } else if (msg.type === 'press-drag') {
      // Fin del arrastre de un pin (DiDi: sueltas el punto y la ruta se recalcula).
      pressRef.current?.([msg.lng, msg.lat], { drag: true, kind: msg.kind });
    } else if (msg.type === 'status') {
      console.warn(`[map-web] ${msg.s}`);
    } else if (msg.type === 'navstate') {
      navStateRef.current?.({ bearing: Number(msg.bearing), pitch: Number(msg.pitch), zoom: Number(msg.zoom), cy: typeof msg.cy === 'number' ? Number(msg.cy) : undefined });
    } else if (msg.type === 'hazard') {
      hazardRef.current?.({ kind: String(msg.kind ?? 'school'), name: String(msg.name ?? ''), distM: Number(msg.distM) });
    }
  }, []);

  return (
    <View style={[StyleSheet.absoluteFill, style]} pointerEvents="auto">
      <WebView
        ref={webRef}
        source={{ uri: MAP_PAGE_URL }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        onMessage={onMessage}
        style={{ backgroundColor: 'transparent' }}
      />
    </View>
  );
});

export type EgCameraHandle = {
  setCamera: (o: { centerCoordinate?: Coord; zoomLevel?: number; durationMs?: number }) => void;
};

/** Componentes "config": no pintan nada en RN; EgMapViewWeb los lee por nombre. */
export function EgMapCamera(props: { centerCoordinate?: Coord; zoomLevel?: number; [k: string]: unknown }) { return null; }
export function EgMapMarkers(props: { markers?: MapMarker[]; id?: string; [k: string]: unknown }) { return null; }
export function EgMapUserLocation(props: { visible?: boolean; [k: string]: unknown }) { return null; }
/** Línea de ruta (taxi): se serializa desde EgMapViewWeb como GeoJSON. */
export function EgRoutePolyline(props: { coordinates?: Coord[]; [k: string]: unknown }) { return null; }
