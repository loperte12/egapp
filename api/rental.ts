/**
 * Cliente del servicio Buscar Alquiler (rental) — backend unificado.
 * Base ABSOLUTA: vive en /api/rental/* (como intercity/work).
 * Forma normalizada que consume applyPropertyFilters/sortProperties del kit.
 */

import { http } from './httpClient';

import { API_HOST } from './config';
export const RENTAL_API = `${API_HOST}/api`;
const r = (p: string) => `${RENTAL_API}${p}`;

export interface RentalProperty {
  id: string; title: string; description: string;
  type: string; rentalType: 'long_term' | 'short_term' | 'both'; furnishingLevel: string;
  size: number | null; rooms?: number; bathrooms?: number; floor?: number; landSize: number | null;
  price: {
    monthlyRent: number | null; currency: string; depositMonths: number;
    agencyFee: number | null; agencyFeePayer: string | null;
    pricePerNight: number | null; minNights: number; cleaningFee: number | null;
  };
  location: { cityId: string; cityName: string; neighborhood: string; address: string; coordinates: { latitude: number | null; longitude: number | null } };
  nearbyPOIs: Array<{ type: string; name: string; distanceKm: number }>;
  essentialServices: Record<string, boolean>;
  amenities: Record<string, boolean>;
  photos: Array<{ url: string; thumbnailUrl: string }>;
  videoTourUrl: string | null;
  landlord: {
    id: string; name: string; phone: string; whatsapp: string; photo: string | null;
    rating: number; reviewsCount: number; responseTimeHours: number;
    verificationLevel: number; subscription: string; isAgency: boolean; agencyName: string | null; joinedAt: string;
    type?: string; propertiesCount?: number; listingsCount?: number; memberSince?: string; bio?: string | null;
  };
  availability: { availableFrom: string | null; availableTo: string | null; minStay: number | null; maxStay: number | null };
  isPremium: boolean; isFeatured: boolean; featuredUntil: string | null; isSocialHousing: boolean;
  verificationLevel: number; moderation: { reportedAsFraud: boolean; reportsCount: number };
  publishedAt: string; lastUpdated: string;
  viewsCount: number; favoritesCount: number; contactClicks: number; status: string;
  isFavorite?: boolean; hasContacted?: boolean; searchScore?: number;
}

export interface LandlordMe {
  exists: boolean; id?: string; name?: string; phone?: string; whatsapp?: string | null;
  isAgency?: boolean; agencyName?: string | null; type?: string;
  docType?: string | null; docNumber?: string | null;
  docPhotoUrl?: string | null; status?: string; verificationLevel?: number;
  subscription?: string; subscriptionUntil?: string | null;
  rating?: number; reviewsCount?: number; responseTimeHours?: number;
  propertiesCount?: number; joinedAt?: string; memberSince?: string; bio?: string | null;
}

export interface RentalCatalog {
  propertyTypes: Array<{ id: string; label: string }>;
  rentalTypes: Array<{ id: string; label: string }>;
  furnishingLevels: Array<{ id: string; label: string }>;
  essentialServices: Array<{ id: string; label: string }>;
  amenities: Array<{ id: string; label: string }>;
  poiTypes: Array<{ id: string; label: string; emoji: string }>;
  cities: Array<{ id: string; label: string }>;
  neighborhoods: Array<{ cityId: string; cityName: string; name: string }>;
  priceRange: { min: number; max: number };
}

export interface RentalPlan {
  key: string; name: string; price: number; period: string | null; color: string;
  features: {
    maxProperties: number; maxPhotos: number; featuredSlots: number;
    priorityInSearch: boolean; verifiedBadge: boolean; analytics: boolean;
    canPublishCommercial: boolean; canPublishShortTerm: boolean;
  };
}

export const rentalApi = {
  catalog: () => http.get<RentalCatalog>(r('/rental/catalog'), false),
  plans: () => http.get<RentalPlan[]>(r('/rental/plans'), false),
  properties: (q: Record<string, string> = {}) => {
    const qs = new URLSearchParams(q).toString();
    return http.get<RentalProperty[]>(r(`/rental/properties${qs ? '?' + qs : ''}`), true);
  },
  property: (id: string) => http.get<RentalProperty>(r(`/rental/properties/${id}`), true),
  landlordMe: () => http.get<LandlordMe>(r('/rental/landlord/me'), true),
  landlordById: (id: string) => http.get<{ landlord: LandlordMe; properties: RentalProperty[] }>(r(`/rental/landlords/${id}`), false),
  applyLandlord: (body: Record<string, unknown>) => http.post<{ message: string }>(r('/rental/landlord/apply'), body, true),
  myProperties: () => http.get<{ landlord: LandlordMe | null; properties: RentalProperty[] }>(r('/rental/my-properties'), true),
  publish: (body: Record<string, unknown>) => http.post<{ message: string; property: RentalProperty }>(r('/rental/properties'), body, true),
  update: (id: string, body: Record<string, unknown>) => http.put<{ message: string; property: RentalProperty }>(r(`/rental/properties/${id}`), body, true),
  close: (id: string) => http.put<{ message: string }>(r(`/rental/properties/${id}/close`), {}, true),
  favorite: (id: string) => http.post<{ message: string; favorited: boolean }>(r(`/rental/properties/${id}/favorite`), {}, true),
  contact: (id: string) => http.post<{ message: string; landlord: { name: string; phone: string; whatsapp: string }; contactClicks: number }>(r(`/rental/properties/${id}/contact`), {}, true),
  review: (id: string, body: { rating: number; comment?: string }) => http.post<{ message: string }>(r(`/rental/properties/${id}/review`), body, true),
  report: (id: string, reason?: string, note?: string) => http.post<{ message: string }>(r(`/rental/properties/${id}/report`), { reason, note }, true),
};
