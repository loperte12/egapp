/**
 * geoPick — selección compartida de un punto origen/destino entre Buscar y Taxi.
 * (expo-router no permite callbacks fáciles en params de vuelta; un singleton
 * efímero es suficiente: Buscar escribe, Taxi lee al recuperar el foco.)
 */
import { Coord } from '../packages/map';

export type GeoPickMode = 'origen' | 'destino' | 'casa' | 'trabajo' | 'aeropuerto';

export interface GeoPickValue {
  mode: GeoPickMode;
  coord: Coord;
  label: string;
  ts: number;
}

let current: GeoPickValue | null = null;

export function setGeoPick(v: GeoPickValue) {
  current = v;
}

export function takeGeoPick(): GeoPickValue | null {
  const v = current;
  current = null;
  return v;
}
