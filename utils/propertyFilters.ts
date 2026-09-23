/**
 * propertyFilters — filtros y ordenación en cliente (adaptación del kit).
 * Consume la forma normalizada del backend (RentalProperty).
 */

import type { RentalProperty } from '../api/rental';
import { isLandType } from './formatHelpers';

export interface PropertyFilters {
  searchText?: string;
  cityId?: string;
  neighborhoods: string[];
  rentalType?: 'long_term' | 'short_term' | 'both';
  priceRange: { min: number; max: number };
  types: string[];
  rooms: { min: number; max: number };
  essentialServices: string[];
  isSocialHousingOnly: boolean;
  minVerificationLevel?: number;
  acceptsShortTerm: boolean;
  acceptsLongTerm: boolean;
  hasTerrace?: boolean;
  isLand?: boolean;
  landUse?: ('agriculture' | 'workshop' | 'other')[];
}

export const DEFAULT_FILTERS: PropertyFilters = {
  neighborhoods: [],
  priceRange: { min: 0, max: 2000000 },
  types: [],
  rooms: { min: 0, max: 15 },
  essentialServices: [],
  isSocialHousingOnly: false,
  acceptsShortTerm: true,
  acceptsLongTerm: true,
  hasTerrace: false,
  isLand: false,
  landUse: [],
};

export function applyPropertyFilters(properties: RentalProperty[], filters: PropertyFilters): RentalProperty[] {
  return properties.filter((p) => {
    if (filters.searchText) {
      const text = filters.searchText.toLowerCase();
      const matches =
        p.title.toLowerCase().includes(text) ||
        p.description.toLowerCase().includes(text) ||
        p.location.neighborhood.toLowerCase().includes(text) ||
        p.location.address.toLowerCase().includes(text);
      if (!matches) return false;
    }

    if (filters.cityId && p.location.cityId !== filters.cityId) return false;

    if (filters.neighborhoods.length > 0 && !filters.neighborhoods.includes(p.location.neighborhood)) return false;

    if (filters.rentalType && p.rentalType !== 'both' && p.rentalType !== filters.rentalType) return false;

    if (!filters.acceptsShortTerm && p.rentalType === 'short_term') return false;
    if (!filters.acceptsLongTerm && p.rentalType === 'long_term') return false;

    const priceToCompare =
      p.rentalType === 'short_term' && p.price.pricePerNight ? p.price.pricePerNight * 30 : p.price.monthlyRent ?? 0;
    if (priceToCompare < filters.priceRange.min || priceToCompare > filters.priceRange.max) return false;

    if (filters.types.length > 0 && !filters.types.includes(p.type)) return false;

    if (p.rooms !== undefined && (p.rooms < filters.rooms.min || p.rooms > filters.rooms.max)) return false;

    if (filters.isSocialHousingOnly && !p.isSocialHousing) return false;

    if (filters.minVerificationLevel && p.verificationLevel < filters.minVerificationLevel) return false;

    for (const service of filters.essentialServices) {
      if (!p.essentialServices[service]) return false;
    }

    if (filters.hasTerrace && !p.amenities.terrace) return false;

    if (filters.isLand && !isLandType(p.type)) return false;

    if (filters.landUse && filters.landUse.length > 0) {
      const matches = filters.landUse.some((use) => {
        if (use === 'agriculture') return p.type === 'land_agriculture';
        if (use === 'workshop') return p.type === 'land_workshop';
        if (use === 'other') return p.type === 'land_other';
        return false;
      });
      if (!matches) return false;
    }

    return true;
  });
}

function searchScore(p: RentalProperty): number {
  return p.searchScore ?? 0;
}

export function sortProperties(
  properties: RentalProperty[],
  order: 'relevance' | 'price_asc' | 'price_desc' | 'newest' | 'biggest',
): RentalProperty[] {
  const sorted = [...properties];
  switch (order) {
    case 'relevance':
      return sorted.sort((a, b) => searchScore(b) - searchScore(a));
    case 'price_asc':
      return sorted.sort((a, b) => (a.price.monthlyRent ?? 0) - (b.price.monthlyRent ?? 0));
    case 'price_desc':
      return sorted.sort((a, b) => (b.price.monthlyRent ?? 0) - (a.price.monthlyRent ?? 0));
    case 'newest':
      return sorted.sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime());
    case 'biggest':
      return sorted.sort((a, b) => ((b.landSize ?? b.size ?? 0) - (a.landSize ?? a.size ?? 0)));
    default:
      return sorted;
  }
}
