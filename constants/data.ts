/**
 * Datos estáticos de la Home — servicios, promos, contactos de emergencia
 * y ciudades de Guinea Ecuatorial. Las rutas apuntan a PANTALLAS REALES;
 * los servicios sin producto aún se marcan `comingSoon` (celda deshabilitada
 * "Próximamente", nunca un stub).
 */

import type { LucideIcon } from 'lucide-react-native';
import {
  CarTaxiFront, Car, Package, KeyRound, Truck, Siren, Briefcase, Users, Route, UserRound,
  Utensils, ShoppingCart, Store, Wallet, BedDouble,
} from 'lucide-react-native';

// ---------------------------------------------------------------- Servicios

export type ServiceTone = 'service' | 'emergency';

export interface ServiceItem {
  id: string;
  label: string;
  icon: LucideIcon;
  tone: ServiceTone; // 'service' → naranja secundario · 'emergency' → rojo crítico
  route: string;     // ruta real (emergencia abre modal, no ruta)
  /** Sin producto aún: la celda se muestra deshabilitada ("Próximamente"). */
  comingSoon?: boolean;
}

export const SERVICES: ServiceItem[] = [
  { id: 'taxi',      label: 'Llamar Taxi',     icon: CarTaxiFront, tone: 'service', route: '/taxi' },
  { id: 'intercity', label: 'Ciudad a Ciudad', icon: Route,        tone: 'service', route: '/intercity' },
  { id: 'conductor', label: 'Ser Conductor',   icon: UserRound,    tone: 'service', route: '/conductor-hub' },
  { id: 'reservar',  label: 'Reservar Coche',  icon: Car,          tone: 'service', route: '/reserva' },
  { id: 'monedero',  label: 'Monedero',        icon: Wallet,       tone: 'service', route: '/monedero' },
  { id: 'food',      label: 'Comida Rápida',   icon: Utensils,     tone: 'service', route: '/food' },
  { id: 'ecomerse',  label: 'Mercado',         icon: ShoppingCart, tone: 'service', route: '/ecomerse' },
  /* «Mi tienda» es la puerta del COMERCIANTE, contigua a Mercado a propósito: son las dos caras del
     mismo mercado y el vendedor no tiene que buscarla en un menú. Lleva a la zona (`/tienda`), que
     es un modo aparte con barra propia — antes la venta era un desvío dentro de Mercado (ver
     `constants/roles.ts`). El rótulo es el que la pantalla ya usa en su cabecera. */
  { id: 'tienda',    label: 'Mi tienda',       icon: Store,        tone: 'service', route: '/tienda' },
  { id: 'alquiler',  label: 'Buscar Alquiler', icon: KeyRound,     tone: 'service', route: '/alquiler' },
  // Módulo hotelero: reservas por noches, con calendario de disponibilidad y pago
  // parcial (señal ahora + resto al llegar).
  { id: 'hotel',     label: 'Hoteles',         icon: BedDouble,    tone: 'service', route: '/lifebook-hotel' },
  { id: 'work',      label: 'Buscar Work',     icon: Briefcase,    tone: 'service', route: '/work' },
  { id: 'mudanza',   label: 'Mudanza',         icon: Truck,        tone: 'service', route: '/service/mudanza', comingSoon: true },
  { id: 'paquete',   label: 'Enviar Paquete',  icon: Package,      tone: 'service', route: '/service/paquete', comingSoon: true },
  { id: 'lifebook',  label: 'Life Book',       icon: Users,        tone: 'service', route: '/lifebook' },
  { id: 'emergencia',label: 'Emergencia',      icon: Siren,        tone: 'emergency', route: '/emergencia' },
];

// ------------------------------------------------------------------ Promos

export interface Promo {
  id: string;
  title: string;
  subtitle: string;
  cta: string;
  emoji: string;
  /** Destino REAL del banner (nunca un stub). */
  route: string;
}

export const PROMOS: Promo[] = [
  { id: 'comida',    title: 'Comida Rápida',            subtitle: 'Pide y recoge o recibe en casa', cta: 'Pedir ahora',  emoji: '🍔', route: '/food' },
  { id: 'mercado',   title: 'Mercado',                  subtitle: 'Móviles, ropa y más de tu ciudad', cta: 'Ver ofertas', emoji: '🛍️', route: '/ecomerse' },
  { id: 'trabajos',  title: 'Buscar Work',              subtitle: 'Nuevas vacantes esta semana',    cta: 'Postularme',  emoji: '💼', route: '/work' },
  { id: 'alquileres', title: 'Buscar Alquiler',         subtitle: 'Casas y locales en tu ciudad',   cta: 'Explorar',    emoji: '🏠', route: '/alquiler' },
];

// -------------------------------------------------------------- Emergencia

export interface EmergencyContact {
  id: string;
  label: string;
  number: string;   // marcación directa con Linking tel:
  note: string;
}

export const EMERGENCY_CONTACTS: EmergencyContact[] = [
  { id: 'policia',  label: 'Policía Nacional',      number: '114', note: 'Emergencias de seguridad' },
  { id: 'hospital', label: 'Hospital / Ambulancia', number: '116', note: 'Emergencias médicas' },
];

// ---------------------------------------------------------------- Ciudades

export interface City {
  id: string;
  name: string;
  region: string;
}

export const CITIES: City[] = [
  // Bioko Norte
  { id: 'malabo',  name: 'Malabo',   region: 'Bioko Norte' },
  { id: 'rebola',  name: 'Rebola',   region: 'Bioko Norte' },
  { id: 'baney',   name: 'Baney',    region: 'Bioko Norte' },
  // Bioko Sur
  { id: 'luba',    name: 'Luba',     region: 'Bioko Sur' },
  { id: 'riaba',   name: 'Riaba',    region: 'Bioko Sur' },
  // Annobón
  { id: 'pale',    name: 'San Antonio de Palé', region: 'Annobón' },
  // Litoral (Río Muni)
  { id: 'bata',    name: 'Bata',     region: 'Litoral' },
  { id: 'cogo',    name: 'Cogo',     region: 'Litoral' },
  { id: 'mbini',   name: 'Mbini',    region: 'Litoral' },
  { id: 'machinda', name: 'Machinda', region: 'Litoral' },
  { id: 'bitica',  name: 'Bitica',   region: 'Litoral' },
  { id: 'corisco', name: 'Corisco',  region: 'Litoral' },
  // Kié-Ntem
  { id: 'ebebia',  name: 'Ebebiyín', region: 'Kié-Ntem' },
  { id: 'nsang',   name: 'Nsang',    region: 'Kié-Ntem' },
  { id: 'micomeseng', name: 'Micomeseng', region: 'Kié-Ntem' },
  // Centro Sur
  { id: 'evinayong', name: 'Evinayong', region: 'Centro Sur' },
  { id: 'niefang',   name: 'Niefang',   region: 'Centro Sur' },
  { id: 'aconibe',   name: 'Aconibe',   region: 'Centro Sur' },
  { id: 'acurenam',  name: 'Acurenam',  region: 'Centro Sur' },
  // Wele-Nzas
  { id: 'mongomo', name: 'Mongomo',  region: 'Wele-Nzas' },
  { id: 'anisok',  name: 'Añisok',   region: 'Wele-Nzas' },
  { id: 'nsok',    name: 'Nsok',     region: 'Wele-Nzas' },
  { id: 'ayene',   name: 'Ayene',    region: 'Wele-Nzas' },
  // Djibloho
  { id: 'paz',     name: 'Ciudad de la Paz', region: 'Djibloho' },
];

/**
 * Región inicial del mapa — migrada a constants/geo.ts (formato [lon, lat]).
 * Ver MALABO_CENTER y MALABO_ZOOM en constants/geo.ts.
 */
