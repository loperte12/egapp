/**
 * formatHelpers — utilidades de formato del kit (rental).
 * formatXAF, getTimeAgo, getPropertyTypeLabel, getWhatsAppUrl,
 * formatDate, formatDateTime, getInitials, formatDistanceKm, normalizePhone.
 */

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** Normaliza un teléfono: quita prefijo, espacios y guiones (solo dígitos). */
export function normalizePhone(phone: string | null | undefined): string {
  return String(phone ?? '').replace(/\D/g, '');
}

/** Fecha completa corta: 12 mar 2026. */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** Fecha y hora: 12 mar 2026, 14:30. */
export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${formatDate(d)}, ${hh}:${mm}`;
}

/** Iniciales para avatares (máx. 2): "Pedro Obiang" → "PO". */
export function getInitials(name: string | null | undefined): string {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

/** Distancia formateada: 1.2 km. */
export function formatDistanceKm(distance: number | string | null | undefined): string {
  const n = typeof distance === 'string' ? parseFloat(distance) : Number(distance ?? NaN);
  if (isNaN(n)) return '';
  if (n < 1) return `${Math.round(n * 1000)} m`;
  return `${n.toFixed(1)} km`;
}

/**
 * Importe en francos CFA. La regla de formato vive ahora en el kit (`format/moneda.ts`) y aquí solo
 * se reexporta con el nombre de siempre para no tocar las decenas de sitios que la importan.
 *
 * POR QUÉ SE MOVIÓ: este fichero formateaba por su cuenta con un espacio NORMAL entre la cifra y la
 * unidad, y un espacio normal es un punto de corte válido: en cualquier caja estrecha el precio se
 * partía en dos líneas («6.500» / «XAF»). Se vio en el carrusel de recomendados del Mercado. La
 * unidad y la cifra son un solo importe, así que van unidas con espacio duro y la regla se escribe
 * una vez.
 *
 * Se importa Y se reexporta: `getWhatsAppUrl` lo usa más abajo, y un `export … from` no trae el
 * nombre al ámbito de este módulo. Reexportar sin importar dejó dos llamadas sin resolver.
 */
import { formateaXAF as formatXAF } from '@egrouteplan/ui-kit';
export { formatXAF };

export function getTimeAgo(date: string | Date | null | undefined): string {
  if (!date) return '';
  const ms = Date.now() - new Date(date).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'ahora';
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `hace ${days} d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `hace ${months} mes${months > 1 ? 'es' : ''}`;
  const years = Math.floor(months / 12);
  return `hace ${years} año${years > 1 ? 's' : ''}`;
}

const TYPE_LABELS: Record<string, { label: string; emoji: string }> = {
  apartment: { label: 'Apartamento', emoji: '🏢' },
  house: { label: 'Casa', emoji: '🏠' },
  room: { label: 'Habitación', emoji: '🚪' },
  villa: { label: 'Villa', emoji: '🏡' },
  studio: { label: 'Estudio', emoji: '🛋️' },
  office: { label: 'Oficina', emoji: '🏢' },
  commercial: { label: 'Local comercial', emoji: '🏬' },
  bar: { label: 'Bar / Terraza', emoji: '🍻' },
  nightclub: { label: 'Discoteca', emoji: '🎵' },
  land_agriculture: { label: 'Terreno agrícola', emoji: '🌱' },
  land_workshop: { label: 'Terreno taller', emoji: '🔧' },
  land_other: { label: 'Otro terreno', emoji: '⛰️' },
};

export function getPropertyTypeLabel(type: string): string {
  return TYPE_LABELS[type]?.label ?? type;
}

export function getPropertyTypeEmoji(type: string): string {
  return TYPE_LABELS[type]?.emoji ?? '🏠';
}

export function isLandType(type: string): boolean {
  return type === 'land_agriculture' || type === 'land_workshop' || type === 'land_other';
}

export function isCommercialSpecial(type: string): boolean {
  return type === 'bar' || type === 'nightclub';
}

/** URL de WhatsApp con mensaje pre-rellenado sobre la propiedad (kit). */
export function getWhatsAppUrl(phone: string | null | undefined, property: { title?: string; location?: { neighborhood?: string; cityName?: string }; price?: { monthlyRent?: number | null; pricePerNight?: number | null; } } | null | undefined): string {
  const p = normalizePhone(phone);
  if (!p) return 'https://wa.me/';
  let msg = 'Hola, vi este anuncio en EG Route Plan';
  if (property?.title) msg += `: ${property.title}`;
  if (property?.location?.neighborhood) msg += ` (${property.location.neighborhood}${property.location.cityName ? ', ' + property.location.cityName : ''})`;
  if (property?.price?.monthlyRent) msg += ` — ${formatXAF(property.price.monthlyRent)}/mes`;
  else if (property?.price?.pricePerNight) msg += ` — ${formatXAF(property.price.pricePerNight)}/noche`;
  return `https://wa.me/${p}?text=${encodeURIComponent(msg)}`;
}
