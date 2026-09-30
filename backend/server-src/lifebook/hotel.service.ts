// =============================================================================
// lb42-hotel.service.ts — PARTE 42 · MÓDULO HOTELERO (ficha, habitaciones, calendario)
//
// Rutas (bajo `/v1/lifebook/commerce/hotel`, el mismo montaje de Life Book —
// no hace falta tocar nginx):
//   PÚBLICO   GET  hotels · GET hotels/:id · GET hotels/:shopId/rooms
//             GET  rooms/:roomTypeId · GET rooms/:roomTypeId/calendar
//   HOTELERO  GET/PUT hotel/profile · GET/POST room-types · PUT/PATCH room-types/:id
//             PUT  room-types/:id/calendar
//
// Lo que resuelve (evaluación de las entregas 51-57 del dueño):
//   · El hotel es una `lifebook.shops` y el tipo de habitación se ancla a su
//     publicación `hotel_room` → hereda moderación, catálogo, fotos verificadas
//     (Parte 41), medios de pago de la tienda y seguidores. Nada de eso se repite.
//   · 🔒 Inventario de verdad: `total_units` por tipo y la tabla de noches
//     (Parte 42, `reservation_nights`) es la ÚNICA verdad de la ocupación.
//   · El CALENDARIO tiene excepciones por fecha: cerrar, precio de temporada y
//     estancia mínima (`room_type_calendar`), y la disponibilidad se resuelve en
//     UNA consulta con GROUP BY (antes: una consulta por noche).
//   · Las fotos se validan contra `media_uploads`: se sube por la Parte 41.
// =============================================================================
import { Injectable, Logger } from '@nestjs/common';
import { DomainError } from '../services/payment-auth.service';
import { MobilityPrismaService } from '../mobility/mobility-prisma.service';

/** Máximo de noches que se pueden pedir de una vez (tope de calendario). */
export const MAX_RANGE_NIGHTS = 92;
/** Ventana de calendario que devuelve la ficha del hotel. */
export const DETAIL_CALENDAR_DAYS = 60;

/**
 * El umbral [D-K] de la CONFIANZA (C-1, §8.1): por debajo de tres reseñas propias, la ficha
 * enseña las reseñas **sin cifra**. Una nota media de una sola estancia no es una nota, es una
 * opinión — y publicarla como si fuera la del hotel es la misma mentira que enseñar `shops.rating`.
 *
 * Vive aquí y no en la base a propósito (026, cabecera): cambiarlo no es una migración.
 * El servicio lo traduce a `ratingPublished` en cada sitio donde sale una nota de hotel, para que
 * la app no tenga que copiar el número: una sola regla, en un solo sitio.
 */
export const REVIEWS_THRESHOLD = 3;
/**
 * Días que el AUTOR tiene para borrar su reseña. Pasado el plazo solo el administrador puede:
 * una reseña que se puede reescribir siempre no es un registro, es un borrador.
 */
export const REVIEWS_DELETE_DAYS = 7;

/** ¿Se publica la cifra de la nota? La regla [D-K], en una función (la usan tres sitios). */
export function notaPublicada(count: unknown, umbral: number = REVIEWS_THRESHOLD): boolean {
  return Number(count ?? 0) >= umbral;
}

/**
 * 🔒 LA REGLA DEL PLAZO DE UNA RESERVA, EN UN SOLO SITIO (`A-4`, LH-08).
 *
 * Una reserva ocupa inventario **mientras su plazo siga vivo**. `hold_expires_at` significa una
 * cosa sola: *para cuándo se espera el siguiente hecho que la mantiene viva* — que llegue la
 * transferencia (`hold`) o que el hotel confirme (`pending`). Cuando el plazo pasa, la reserva
 * deja de ocupar la habitación **y** deja de poder confirmarse: son la misma regla, y por eso
 * se leen del mismo sitio.
 *
 * Estaba escrita **a mano en seis sitios** (cinco consultas de ocupación y una forma de salida) y
 * **cinco guardas en JavaScript**, y la mitad de las copias solo miraban `hold` — así que una
 * reserva `pending` con el plazo cumplido bloqueaba la habitación para siempre y el hotel veía
 * «sin disponibilidad» en fechas libres (LH-08). El número de sitios donde vive una regla es el
 * número de sitios donde se puede escribir mal (fallo 48 de `codemod-seguro`).
 *
 * Solo `hold` y `pending` caducan: `confirmed` y `checked_in` son servicio en curso y **no** se
 * sueltan porque haya vencido una fecha. Generalizar esto a todos los estados sería vender dos
 * veces la misma habitación.
 */
export function plazoVencido(status: unknown, holdExpiresAt: unknown, ahora: number = Date.now()): boolean {
  const s = String(status);
  if (s !== 'hold' && s !== 'pending') return false;
  if (!holdExpiresAt) return false;
  const t = new Date(holdExpiresAt as string | number | Date).getTime();
  return Number.isFinite(t) && t <= ahora;
}

/** Estados de reserva que OCUPAN inventario. La lista única (antes estaba escrita tres veces). */
export const ESTADOS_QUE_OCUPAN = ['hold', 'pending', 'confirmed', 'checked_in'] as const;

/** ¿Esta reserva sigue ocupando la habitación? (= su estado ocupa y su plazo no venció). */
export function ocupaInventario(status: unknown, holdExpiresAt: unknown, ahora: number = Date.now()): boolean {
  if (!(ESTADOS_QUE_OCUPAN as readonly string[]).includes(String(status))) return false;
  return !plazoVencido(status, holdExpiresAt, ahora);
}

const PROPERTY_KINDS = ['hotel', 'hostal', 'guest_house', 'apartahotel', 'resort', 'motel'] as const;
/** Métodos de pago que un hotel puede aceptar (los de la tienda, ya validados en BD). */
const HOTEL_METHODS = ['transfer', 'deposit', 'in_store', 'billing', 'likebook_wallet'] as const;
/**
 * TODOS los métodos de la plataforma: los mismos que acepta el marketplace y los que valida el
 * `CHECK` de `lifebook.shop_payment_methods`. Un hotel ofrece todos MENOS «contra entrega»
 * (`HOTEL_METHODS`), y esa diferencia es la que permite distinguir «esto no es mío» de «esto está
 * mal escrito» al guardar la ficha. ⚠️ Si cambia en `commerce.service.ts` o `orders.service.ts`,
 * cambia aquí también (las tres copias deberían ser un módulo compartido: pendiente).
 */
const PLATFORM_METHODS = ['cash_on_delivery', 'billing', 'likebook_wallet', 'in_store', 'deposit', 'transfer'] as const;
const AMENITIES = [
  'wifi', 'desayuno', 'aire', 'piscina', 'parking', 'restaurante', 'bar', 'gimnasio',
  'recepcion_24h', 'agua_caliente', 'generador', 'lavanderia', 'tv', 'terraza', 'ascensor',
  'admite_mascotas', 'adaptado', 'cocina', 'nevera', 'caja_fuerte', 'seguridad',
] as const;
const AMENITIES_MAX = 20;
const IMAGES_MAX = 12;
const BEDS_MAX = 8;

export interface RoomTypeInput {
  name?: string;
  description?: string;
  capacity?: number;
  beds?: { kind?: string; count?: number }[];
  sizeM2?: number | null;
  totalUnits?: number;
  basePriceXaf?: number;
  weekendPriceXaf?: number | null;
  cleaningFeeXaf?: number;
  taxesXaf?: number;
  minNights?: number;
  maxNights?: number;
  depositPercent?: number;
  holdMinutes?: number;
  confirmationHours?: number;
  cancellationHours?: number;
  images?: string[];
  amenities?: string[];
  isActive?: boolean;
}

@Injectable()
export class LifebookHotelService {
  private readonly log = new Logger('LifebookHotel');

  constructor(public readonly db: MobilityPrismaService) {}

  // ───────────────────────────── utilidades ─────────────────────────────────
  uuid(v: unknown, field = 'Identificador'): string {
    const s = String(v ?? '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
      throw new DomainError('ID_INVALID', `${field} no válido`);
    }
    return s;
  }

  clean(v: unknown, max: number): string {
    return String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  /** Texto obligatorio. */
  text(v: unknown, max: number, field: string): string {
    const s = String(v ?? '').trim().slice(0, max);
    if (!s) throw new DomainError('FIELD_REQUIRED', `${field} es obligatorio`);
    return s;
  }

  /** Uno de los valores permitidos (o el de por defecto si no llega nada). */
  one(value: unknown, allowed: readonly string[], fallback: string, code: string, msg: string): string {
    const v = String(value ?? '').trim().toLowerCase();
    if (!v) return fallback;
    if (!allowed.includes(v)) throw new DomainError(code, msg);
    return v;
  }

  /** Entero dentro de un rango. `null` si no llega nada (para los opcionales). */
  int(v: unknown, min: number, max: number, field: string, fallback: number | null = null): number | null {
    if (v === undefined || v === null || v === '') return fallback;
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) {
      throw new DomainError('NUMBER_INVALID', `${field}: número entero entre ${min} y ${max}`);
    }
    return n;
  }

  /** Fecha YYYY-MM-DD estricta (sin `Invalid Date` colándose). */
  date(v: unknown, field: string): string {
    const s = String(v ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      throw new DomainError('DATE_INVALID', `${field}: usa el formato AAAA-MM-DD`);
    }
    const d = new Date(`${s}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) {
      throw new DomainError('DATE_INVALID', `${field}: esa fecha no existe`);
    }
    return s;
  }

  /** Hoy en hora de Malabo (UTC+1), como YYYY-MM-DD. */
  todayMalabo(now = new Date()): string {
    return new Date(now.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  /**
   * Una columna `DATE` llega al driver como objeto `Date` (y `String(fecha)` daría
   * «Fri Sep 11», no `YYYY-MM-DD`): aquí se normaliza siempre a texto ISO, en hora
   * de Malabo, para que el calendario y las reservas hablen el mismo idioma.
   */
  fecha(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) {
      if (Number.isNaN(v.getTime())) return null;
      return new Date(v.getTime() + 60 * 60 * 1000).toISOString().slice(0, 10);
    }
    return String(v).slice(0, 10);
  }

  /** Suma días a una fecha YYYY-MM-DD. */
  addDays(dateStr: string, days: number): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  /** Noches entre dos fechas (check-out exclusivo). */
  nightsBetween(checkIn: string, checkOut: string): number {
    const a = Date.parse(`${checkIn}T00:00:00Z`);
    const b = Date.parse(`${checkOut}T00:00:00Z`);
    return Math.round((b - a) / 86_400_000);
  }

  /** Lista de noches [checkIn, checkOut) como YYYY-MM-DD. */
  nightsList(checkIn: string, checkOut: string): string[] {
    const out: string[] = [];
    const n = this.nightsBetween(checkIn, checkOut);
    for (let i = 0; i < n; i++) out.push(this.addDays(checkIn, i));
    return out;
  }

  /** La tienda del usuario (o error explicado). */
  async shopOf(userId: string): Promise<any> {
    const rows: any[] = await this.db.$queryRaw`
      SELECT * FROM lifebook.shops WHERE owner_id = ${userId}::uuid LIMIT 1`;
    return rows[0] ?? null;
  }

  /** ¿El usuario es el dueño de la tienda? (para las puertas del hotel). */
  async ownsShop(userId: string, shopId: string): Promise<boolean> {
    const rows: any[] = await this.db.$queryRaw`
      SELECT 1 FROM lifebook.shops WHERE id = ${shopId}::uuid AND owner_id = ${userId}::uuid LIMIT 1`;
    return !!rows[0];
  }

  async isAdmin(userId: string): Promise<boolean> {
    const rows: any[] = await this.db.$queryRaw`
      SELECT 1 FROM mobility.users WHERE id = ${userId}::uuid AND role = 'ADMIN' LIMIT 1`;
    return !!rows[0];
  }

  // ─────────────────────────── ficha del hotel ──────────────────────────────
  /** La tienda tiene que estar marcada como alojamiento (se marca al perfilarla). */
  private async requireHotelShop(userId: string): Promise<any> {
    const shop = await this.shopOf(userId);
    if (!shop) throw new DomainError('SHOP_REQUIRED', 'Crea tu tienda antes de configurar el hotel');
    if (!shop.is_active) throw new DomainError('SHOP_INACTIVE', 'Tu tienda está desactivada');
    return shop;
  }

  /**
   * Tipo de cambio de REFERENCIA del país desde el que se reserva.
   *
   * Devuelve `null` si no hay país, si no tiene moneda asignada o si la moneda no tiene tipo:
   * **entonces no se convierte nada**. Inventar un cambio sería mentirle al huésped sobre lo que va a
   * pagar, y el precio de verdad es el XAF (el cobro es en efectivo en francos).
   */
  private async fxDePais(countryRaw?: string | null) {
    const cc = String(countryRaw ?? '').trim().toUpperCase();
    if (!/^[A-Z]{2}$/.test(cc)) return null;
    const rows: any[] = await this.db.$queryRaw`
      SELECT c.country_code, c.currency, c.label AS country_label,
             r.label, r.symbol, r.xaf_per_unit, r.decimals, r.updated_at, r.note
        FROM lifebook.fx_countries c
        JOIN lifebook.fx_rates r ON r.currency = c.currency
       WHERE c.country_code = ${cc} LIMIT 1`;
    const r = rows[0];
    if (!r) return null;
    return {
      country: r.country_code, countryLabel: r.country_label,
      currency: String(r.currency).trim(), currencyLabel: r.label, symbol: r.symbol,
      xafPerUnit: Number(r.xaf_per_unit), decimals: Number(r.decimals),
      updatedAt: r.updated_at, note: r.note ?? null,
      // El cobro es en XAF: si el país usa XAF no hay nada que convertir y la app no pinta un «≈».
      esMonedaDelCobro: String(r.currency).trim() === 'XAF',
    };
  }

  /** Convierte XAF a la moneda del huésped, con los decimales que declara la tabla de tipos. */
  private enMoneda(xaf: number, fx: any): number | null {
    if (!fx || !fx.xafPerUnit) return null;
    const v = Number(xaf) / Number(fx.xafPerUnit);
    if (!Number.isFinite(v)) return null;
    const f = Math.pow(10, Number(fx.decimals ?? 2));
    return Math.round(v * f) / f;
  }

  /**
   * Punto de llegada de la ciudad, para el botón de taxi del aeropuerto.
   * Sale de `public.zones` (la zona «Aeropuerto» de cada ciudad), con sus precios de referencia: así
   * el huésped sabe qué esperar ANTES de pedir el taxi y la app no lleva coordenadas escritas a mano.
   */
  private async aeropuertoDe(ciudad?: string | null) {
    const c = this.clean(ciudad, 60);
    const rows: any[] = await this.db.$queryRaw`
      SELECT name, city, center_lat, center_lng, price_low, price_high
        FROM public.zones
       WHERE is_active AND name ILIKE '%aeropuerto%'
         AND (${c}::text = '' OR city ILIKE ${'%' + c + '%'})
       ORDER BY city LIMIT 1`;
    const z = rows[0];
    if (!z || z.center_lat === null || z.center_lng === null) return null;
    return {
      label: z.name, city: z.city, lat: Number(z.center_lat), lng: Number(z.center_lng),
      priceFromXaf: z.price_low === null ? null : Number(z.price_low),
      priceToXaf: z.price_high === null ? null : Number(z.price_high),
    };
  }

  /** Tipos de cambio disponibles (PÚBLICO): la app elige con qué moneda enseñar los precios. */
  async fxDisponibles(countryRaw?: string | null) {
    const filas: any[] = await this.db.$queryRaw`
      SELECT r.currency, r.label, r.symbol, r.xaf_per_unit, r.decimals, r.updated_at, r.note
        FROM lifebook.fx_rates r ORDER BY r.xaf_per_unit DESC`;
    // La lista para que el huésped elija: PAÍSES con su moneda. Se devuelven países y no monedas
    // porque la conversión es POR PAÍS; si la app tuviera que deducir el país a partir de la moneda,
    // estaría duplicando esta tabla y las dos acabarían diciendo cosas distintas.
    // (Tipado explícito: `$queryRaw` devuelve `unknown` y sin esto el build no compila — me pasó.)
    const paises: any[] = await this.db.$queryRaw`
      SELECT c.country_code, c.label, c.currency, r.symbol
        FROM lifebook.fx_countries c
        JOIN lifebook.fx_rates r ON r.currency = c.currency
       ORDER BY c.label`;
    return {
      monedaDelCobro: 'XAF',
      pais: await this.fxDePais(countryRaw),
      monedas: filas.map((r) => ({
        currency: String(r.currency).trim(), label: r.label, symbol: r.symbol,
        xafPerUnit: Number(r.xaf_per_unit), decimals: Number(r.decimals),
        updatedAt: r.updated_at, note: r.note ?? null,
      })),
      aviso: 'Precios de referencia: el cobro es en XAF (francos) al llegar al hotel.',
      paises: paises.map((p) => ({
        code: p.country_code, label: p.label, currency: String(p.currency).trim(), symbol: p.symbol,
      })),
    };
  }

  private profileShape(p: any, shop: any, extras: Record<string, unknown> = {}) {
    return {
      shopId: shop.id,
      name: shop.name,
      logoUrl: shop.logo_url,
      coverUrl: shop.cover_url,
      city: shop.city,
      barrio: shop.barrio,
      region: shop.region,
      lat: shop.lat,
      lng: shop.lng,
      addressReference: shop.address_reference,
      description: shop.description,
      // LA NOTA DEL ALOJAMIENTO, NO LA DE LA TIENDA (C-1 · 026 · §8.1). Antes salía `shops.rating`:
      // la nota del mercado, que valora lo que se compra, no cómo se duerme. Ahora sale el espejo
      // de las reseñas propias (`hotel_reviews`), que el servicio recalcula en la misma transacción
      // del alta y del borrado. Sin ficha de hotel no hay espejo: «0 con 0», y el umbral lo oculta.
      rating: Number(p?.hotel_rating ?? 0),
      ratingCount: Number(p?.hotel_rating_count ?? 0),
      /** [D-K]: por debajo de tres reseñas la ficha enseña las reseñas SIN cifra. */
      ratingPublished: notaPublicada(p?.hotel_rating_count),
      followersCount: Number(shop.followers_count ?? 0),
      verificationLevel: shop.verification_level,
      isVerified: !!shop.is_verified,
      isActive: !!shop.is_active,
      propertyKind: p?.property_kind ?? null,
      stars: p?.stars ?? null,
      checkinFrom: p?.checkin_from ?? '14:00',
      checkinUntil: p?.checkin_until ?? '22:00',
      checkoutUntil: p?.checkout_until ?? '12:00',
      receptionOpen24h: !!p?.reception_open_24h,
      amenities: p?.amenities ?? [],
      houseRules: p?.house_rules ?? null,
      cancellationPolicy: p?.cancellation_policy ?? null,
      taxesIncluded: p?.taxes_included ?? true,
      // Cómo entrar y dónde está la recepción. Una dirección no dice dónde se entra, y el huésped
      // que llega de un taxi a un sitio que no conoce es justo quien más lo necesita.
      arrivalNote: p?.arrival_note ?? null,
      ...extras,
    };
  }

  /** Ficha pública del hotel + sus tipos de habitación. */
  async hotelByShop(shopIdRaw: string, countryRaw?: string | null) {
    const shopId = this.uuid(shopIdRaw, 'Hotel');
    const shops: any[] = await this.db.$queryRaw`
      SELECT * FROM lifebook.shops WHERE id = ${shopId}::uuid LIMIT 1`;
    const shop = shops[0];
    // Sin hotel no se filtra si existe: ni el borrador de un hotelero se enseña.
    if (!shop || !shop.is_hotel || !shop.is_active) {
      throw new DomainError('HOTEL_NOT_FOUND', 'Ese alojamiento no existe o no está disponible');
    }
    const prof: any[] = await this.db.$queryRaw`
      SELECT * FROM lifebook.hotel_profiles WHERE shop_id = ${shopId}::uuid LIMIT 1`;
    const rooms = await this.roomTypesOfShop(shopId, { onlyActive: true });
    const pay: any[] = await this.db.$queryRaw`
      SELECT method, status, note FROM lifebook.shop_payment_methods
       WHERE shop_id = ${shopId}::uuid AND status = 'active' ORDER BY method`;
    // La moneda del huésped y el aeropuerto de la ciudad. Los dos pueden venir en null y la app
    // tiene que saber vivir sin ellos (pedidos anteriores, ciudades sin zona de aeropuerto).
    const fx = await this.fxDePais(countryRaw ?? null);
    const airport = await this.aeropuertoDe(shop.city);
    return {
      hotel: this.profileShape(prof[0] ?? null, shop, {
        paymentMethods: pay.map((m) => m.method),
        roomCount: rooms.length,
      }),
      // El dueño de la tienda, para que la ficha pueda abrir el chat huésped↔alojamiento con el
      // motor existente (`POST /lifebook/chat/open { userId }`). Sin dueño (no debería pasar en
      // un hotel activo) la app no ofrece el botón en vez de fallar al pulsarlo.
      ownerId: shop.owner_id === null || shop.owner_id === undefined ? null : String(shop.owner_id),
      // Cada habitación con su precio REAL en XAF y, si se sabe el país del huésped, su equivalente
      // en la moneda de ese país. `pricePerNightLocal` en null = no hay tipo de cambio para ese país
      // (la app no pinta nada en vez de inventarse una cifra).
      rooms: fx ? rooms.map((r: any) => ({ ...r, pricePerNightLocal: this.enMoneda(Number(r.basePriceXaf), fx) })) : rooms,
      fx,
      // Lo que el huésped necesita AL LLEGAR: cómo se entra y dónde está la recepción, con las
      // coordenadas del hotel (que ya estaban en `shops.lat/lng`) para el botón «Cómo llegar».
      arrival: {
        note: prof[0]?.arrival_note ?? null,
        lat: shop.lat === null || shop.lat === undefined ? null : Number(shop.lat),
        lng: shop.lng === null || shop.lng === undefined ? null : Number(shop.lng),
        addressReference: shop.address_reference ?? null,
        city: shop.city ?? null,
      },
      // El aeropuerto de esa ciudad, para el botón «Pedir taxi» sin que el huésped escriba nada.
      airport,
    };
  }

  /**
   * Alta/actualización de la ficha del hotel. Marca la tienda como alojamiento y
   * valida que los métodos de pago que pide estén ACTIVOS en la tienda (no se
   * inventa una tabla de pagos del hotel: se usa la que ya existe).
   */
  async saveHotelProfile(userId: string, dto: any) {
    const shop = await this.requireHotelShop(userId);
    const kind = this.one(dto?.propertyKind, PROPERTY_KINDS, 'hotel', 'PROPERTY_KIND_INVALID', 'Tipo de alojamiento no válido');
    const stars = this.int(dto?.stars, 1, 5, 'Estrellas', null);
    const hhmm = (v: unknown, field: string, fallback: string) => {
      const s = String(v ?? '').trim() || fallback;
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw new DomainError('TIME_INVALID', `${field}: usa HH:MM (24 h)`);
      return s;
    };
    const checkinFrom = hhmm(dto?.checkinFrom, 'Entrada desde', '14:00');
    const checkinUntil = hhmm(dto?.checkinUntil, 'Entrada hasta', '22:00');
    const checkoutUntil = hhmm(dto?.checkoutUntil, 'Salida hasta', '12:00');
    const amenities = this.amenities(dto?.amenities);

    // ── MÉTODOS DE PAGO ──────────────────────────────────────────────────────────
    // El `PUT` acepta lo que devuelve el `GET`: `myHotel` manda objetos (`{method, status, note}`)
    // porque el hotelero necesita saber qué está activo, y antes esto hacía `String(m)` sobre el
    // objeto → «[object object]» y un 400 que no explicaba nada. Se aceptan las dos formas.
    const normalizarMetodo = (m: unknown): string => {
      if (typeof m === 'string') return m.trim().toLowerCase();
      if (m && typeof m === 'object' && 'method' in (m as Record<string, unknown>)) {
        return String((m as { method: unknown }).method ?? '').trim().toLowerCase();
      }
      throw new DomainError('PAYMENT_METHOD_INVALID', 'Cada forma de pago tiene que ser su nombre ("transfer") o un objeto con "method".');
    };
    const pedidos: string[] | null = Array.isArray(dto?.paymentMethods)
      ? Array.from(new Set(dto.paymentMethods.map(normalizarMetodo).filter((m: string) => m !== '')))
      : null;
    // Lo que el hotel no gestiona se devuelve, para que la app pueda decirlo: nada en silencio.
    let ignorados: string[] = [];
    let aEscribir: string[] | null = null;
    if (pedidos) {
      if (!pedidos.length) throw new DomainError('PAYMENT_METHOD_REQUIRED', 'Elige al menos una forma de pago');
      // 1) ¿Es un método de la plataforma? Si no, es una errata y se rechaza (no se traga).
      const desconocidos = pedidos.filter((m: string) => !(PLATFORM_METHODS as readonly string[]).includes(m));
      if (desconocidos.length) {
        throw new DomainError('PAYMENT_METHOD_INVALID', `Forma de pago desconocida: ${desconocidos.map((m: string) => `«${m}»`).join(', ')}`);
      }
      // 2) De los válidos, los que un hotel NO ofrece son de la tienda (contra entrega): se ignoran
      //    y se dejan como están. Antes esto tiraba la petición entera y la ficha no se guardaba.
      ignorados = pedidos.filter((m: string) => !(HOTEL_METHODS as readonly string[]).includes(m));
      aEscribir = pedidos.filter((m: string) => (HOTEL_METHODS as readonly string[]).includes(m));
      if (ignorados.length) {
        this.log.warn(`ficha hotelera: se ignoran métodos que no son de hotel (${ignorados.join(", ")}); la tienda no se toca`);
      }
    }

    const profile = await this.db.$transaction(async (tx: any) => {
      // La tienda pasa a ser alojamiento (y con categoría hotelera si no tiene).
      await tx.$executeRaw`
        UPDATE lifebook.shops
           SET is_hotel = true, updated_at = now(),
               city = COALESCE(city, ${this.clean(dto?.city, 60) || null}),
               barrio = COALESCE(barrio, ${this.clean(dto?.barrio, 60) || null})
         WHERE id = ${shop.id}::uuid`;

      // Solo los métodos DEL HOTEL. Los de la tienda que un hotel no ofrece (contra entrega) se
      // quedan como están: no son suyos, y hasta hoy impedían guardar la ficha entera.
      if (aEscribir && aEscribir.length) {
        // 17/09 (parche 99): el monedero YA es una forma de pago real (señal retenida
        // con PIN y cobrada al entrar), así que el hotel puede activarlo como cualquier otra.
        const activos = aEscribir;
        await tx.$executeRaw`
          UPDATE lifebook.shop_payment_methods SET status = 'disabled'
           WHERE shop_id = ${shop.id}::uuid AND method = ANY(${aEscribir}::varchar[])`;
        for (const m of activos) {
          await tx.$executeRaw`
            INSERT INTO lifebook.shop_payment_methods (shop_id, method, status)
            VALUES (${shop.id}::uuid, ${m}, 'active')
            ON CONFLICT (shop_id, method) DO UPDATE SET status = 'active'`;
        }
      }

      const rows: any[] = await tx.$queryRaw`
        INSERT INTO lifebook.hotel_profiles
          (shop_id, property_kind, stars, checkin_from, checkin_until, checkout_until,
           reception_open_24h, amenities, house_rules, cancellation_policy, taxes_included, arrival_note, updated_at)
        VALUES
          (${shop.id}::uuid, ${kind}, ${stars}, ${checkinFrom}, ${checkinUntil}, ${checkoutUntil},
           ${!!dto?.receptionOpen24h}, ${JSON.stringify(amenities)}::jsonb,
           ${this.clean(dto?.houseRules, 600) || null}, ${this.clean(dto?.cancellationPolicy, 600) || null},
           ${dto?.taxesIncluded !== false}, ${this.clean(dto?.arrivalNote, 600) || null}, now())
        ON CONFLICT (shop_id) DO UPDATE SET
          property_kind = EXCLUDED.property_kind, stars = EXCLUDED.stars,
          checkin_from = EXCLUDED.checkin_from, checkin_until = EXCLUDED.checkin_until,
          checkout_until = EXCLUDED.checkout_until, reception_open_24h = EXCLUDED.reception_open_24h,
          amenities = EXCLUDED.amenities, house_rules = EXCLUDED.house_rules,
          cancellation_policy = EXCLUDED.cancellation_policy, taxes_included = EXCLUDED.taxes_included,
          arrival_note = EXCLUDED.arrival_note,
          updated_at = now()
        RETURNING *`;
      return rows[0];
    });

    const fresca: any[] = await this.db.$queryRaw`
      SELECT * FROM lifebook.shops WHERE id = ${shop.id}::uuid LIMIT 1`;
    this.log.log(`ficha hotelera de «${fresca[0].name}» guardada (${kind})`);
    // `ignoredPaymentMethods`: lo que llegó y no es del hotel (contra entrega). Se devuelve para que
    // la app pueda avisar en vez de que el hotelero se quede sin saber por qué no aparece.
    return { hotel: this.profileShape(profile, fresca[0]), ignoredPaymentMethods: ignorados };
  }

  /** Mi ficha + mis habitaciones (panel del hotelero). */
  async myHotel(userId: string) {
    const shop = await this.shopOf(userId);
    if (!shop) return { hotel: null, rooms: [] };
    const prof: any[] = await this.db.$queryRaw`
      SELECT * FROM lifebook.hotel_profiles WHERE shop_id = ${shop.id}::uuid LIMIT 1`;
    const rooms = shop.is_hotel ? await this.roomTypesOfShop(shop.id) : [];
    const pay: any[] = await this.db.$queryRaw`
      SELECT method, status, note FROM lifebook.shop_payment_methods WHERE shop_id = ${shop.id}::uuid ORDER BY method`;
    return {
      hotel: this.profileShape(prof[0] ?? null, shop, {
        isHotel: !!shop.is_hotel,
        // Aquí van OBJETOS (y en la ficha pública, nombres) a propósito: el hotelero necesita saber
        // qué está activo y qué no; al huésped solo le importa qué se acepta. El `PUT` acepta las dos
        // formas, así que devolver esto tal cual ya no rompe nada.
        paymentMethods: pay.map((m) => ({ method: m.method, status: m.status, note: m.note })),
      }),
      rooms,
    };
  }

  // ─────────────────────────── tipos de habitación ──────────────────────────
  private amenities(v: unknown): string[] {
    const raw = Array.isArray(v) ? v : [];
    const out: string[] = [];
    for (const a of raw) {
      const s = this.clean(a, 32).toLowerCase();
      if (!s) continue;
      if (!(AMENITIES as readonly string[]).includes(s)) {
        throw new DomainError('AMENITY_INVALID', `Servicio desconocido: «${s}»`);
      }
      if (!out.includes(s)) out.push(s);
    }
    if (out.length > AMENITIES_MAX) throw new DomainError('AMENITIES_LIMIT', `Como máximo ${AMENITIES_MAX} servicios`);
    return out;
  }

  /**
   * Fotos del tipo de habitación. 🔒 Se validan contra `media_uploads`: cada URL
   * tiene que ser de un objeto que ESE usuario subió y cerró por la Parte 41 (así
   * la ficha no puede enlazar a un dominio ajeno ni a un fichero que no existe).
   */
  async images(userId: string, v: unknown): Promise<string[]> {
    // 🔒 LH-12: un `images` que no sea lista NO se interpreta como «sin fotos».
    // Antes se devolvía `[]` —que es *truthy*— y el servicio escribía `images = '[]'`:
    // un cuerpo fuera de contrato borraba TODAS las fotos de la habitación sin un solo
    // error. Ausente = no se toca (`create`: sin fotos · `update`: se conservan);
    // presente y malformado = 400 explicado. La lista VACÍA sigue siendo legítima: el
    // hotelero quitó sus fotos y eso se respeta.
    if (v !== undefined && !Array.isArray(v)) {
      throw new DomainError('IMAGE_INVALID', 'Las fotos tienen que venir como lista de enlaces');
    }
    const raw = Array.isArray(v) ? v : [];
    if (raw.length > IMAGES_MAX) throw new DomainError('IMAGES_LIMIT', `Como máximo ${IMAGES_MAX} fotos`);
    const urls = raw.map((u) => String(u ?? '').trim()).filter(Boolean);
    if (!urls.length) return [];
    const keys: string[] = [];
    for (const u of urls) {
      const m = u.match(/\/(?:lb-images|lifebook-media|lb-videos)\/(.+)$/);
      if (!m) throw new DomainError('IMAGE_INVALID', 'Cada foto tiene que subirse desde la app (no se admiten enlaces externos)');
      keys.push(m[1]);
    }
    const rows: any[] = await this.db.$queryRaw`
      SELECT object_key FROM lifebook.media_uploads
       WHERE user_id = ${userId}::uuid AND object_key = ANY(${keys}::text[])
         AND status IN ('ready','used')`;
    const ok = new Set(rows.map((r) => r.object_key));
    const faltan = keys.filter((k) => !ok.has(k));
    if (faltan.length) {
      throw new DomainError('IMAGE_NOT_READY', 'Alguna foto no está terminada de subir: vuelve a intentarlo');
    }
    // Se normaliza a la forma que ya usa `lifebook.products.media`.
    return urls.map((url, i) => ({ url, type: 'image', position: i })) as unknown as string[];
  }

  private beds(v: unknown): { kind: string; count: number }[] {
    const raw = Array.isArray(v) ? v : [];
    if (raw.length > BEDS_MAX) throw new DomainError('BEDS_LIMIT', `Como máximo ${BEDS_MAX} camas`);
    const out: { kind: string; count: number }[] = [];
    for (const b of raw) {
      const kind = this.clean(b?.kind, 24).toLowerCase() || 'doble';
      const count = Number(b?.count ?? 1);
      if (!Number.isInteger(count) || count < 1 || count > 20) {
        throw new DomainError('BEDS_INVALID', 'Cada cama necesita una cantidad entre 1 y 20');
      }
      out.push({ kind, count });
    }
    return out;
  }

  /** Campos del tipo de habitación, validados (alta y edición comparten reglas). */
  private roomFields(dto: RoomTypeInput, opts: { partial?: boolean } = {}) {
    const p = opts.partial === true;
    const f: Record<string, unknown> = {};
    const has = (k: keyof RoomTypeInput) => dto?.[k] !== undefined;

    if (!p || has('name')) {
      const name = this.clean(dto?.name, 120);
      if (name.length < 3) throw new DomainError('ROOM_NAME_REQUIRED', 'El nombre de la habitación necesita al menos 3 letras');
      f.name = name;
    }
    if (!p || has('description')) f.description = this.clean(dto?.description, 2000) || null;
    if (!p || has('capacity')) f.capacity = this.int(dto?.capacity, 1, 30, 'Capacidad', 2);
    if (!p || has('beds')) f.beds = JSON.stringify(this.beds(dto?.beds));
    if (!p || has('sizeM2')) f.sizeM2 = this.int(dto?.sizeM2, 4, 2000, 'Superficie', null);
    if (!p || has('totalUnits')) f.totalUnits = this.int(dto?.totalUnits, 1, 200, 'Habitaciones de este tipo', 1);
    if (!p || has('basePriceXaf')) {
      const base = this.int(dto?.basePriceXaf, 1, 100_000_000, 'Precio por noche', null);
      if (base === null) throw new DomainError('PRICE_REQUIRED', 'Indica el precio por noche (XAF)');
      f.basePriceXaf = base;
    }
    if (!p || has('weekendPriceXaf')) f.weekendPriceXaf = this.int(dto?.weekendPriceXaf, 1, 100_000_000, 'Precio de fin de semana', null);
    if (!p || has('cleaningFeeXaf')) f.cleaningFeeXaf = this.int(dto?.cleaningFeeXaf, 0, 10_000_000, 'Limpieza', 0);
    if (!p || has('taxesXaf')) f.taxesXaf = this.int(dto?.taxesXaf, 0, 10_000_000, 'Tasas', 0);
    if (!p || has('minNights')) f.minNights = this.int(dto?.minNights, 1, 90, 'Estancia mínima', 1);
    if (!p || has('maxNights')) f.maxNights = this.int(dto?.maxNights, 1, 365, 'Estancia máxima', 30);
    if (f.minNights !== undefined && f.maxNights !== undefined && Number(f.maxNights) < Number(f.minNights)) {
      throw new DomainError('NIGHTS_RANGE_INVALID', 'La estancia máxima no puede ser menor que la mínima');
    }
    if (!p || has('depositPercent')) f.depositPercent = this.int(dto?.depositPercent, 0, 100, 'Señal (%)', 30);
    if (!p || has('holdMinutes')) f.holdMinutes = this.int(dto?.holdMinutes, 5, 120, 'Retención (min)', 20);
    if (!p || has('confirmationHours')) f.confirmationHours = this.int(dto?.confirmationHours, 1, 168, 'Horas para confirmar', 24);
    if (!p || has('cancellationHours')) f.cancellationHours = this.int(dto?.cancellationHours, 0, 720, 'Horas de cancelación gratis', 48);
    if (!p || has('amenities')) f.amenities = JSON.stringify(this.amenities(dto?.amenities));
    if (!p || has('isActive')) f.isActive = dto?.isActive !== false;
    return f;
  }

  /**
   * Crea un tipo de habitación: publicación (`hotel_room`) + tipo con inventario,
   * TODO en una transacción. Nace `pending` (moderación, como el resto de Life Book)
   * pero el hotelero puede seguir configurando su calendario.
   */
  async createRoomType(userId: string, dto: RoomTypeInput, images: string[]) {
    const shop = await this.requireHotelShop(userId);
    const f = this.roomFields(dto);
    const dup: any[] = await this.db.$queryRaw`
      SELECT 1 FROM lifebook.room_types
       WHERE shop_id = ${shop.id}::uuid AND lower(name) = lower(${f.name}) LIMIT 1`;
    if (dup[0]) throw new DomainError('ROOM_NAME_TAKEN', `Ya tienes un tipo de habitación llamado «${f.name}»`);

    const created = await this.db.$transaction(async (tx: any) => {
      // 1) La publicación del catálogo (es la que ve el comprador y modera el admin).
      const prod: any[] = await tx.$queryRaw`
        INSERT INTO lifebook.products
          (shop_id, service_type, title, short_description, long_description, price_mode, price_xaf,
           stock_mode, stock_quantity, status, origin_city, origin_barrio, origin_region, media, is_room_type)
        VALUES
          (${shop.id}::uuid, 'hotel_room', ${f.name}, ${`Habitación en ${shop.name}`},
           ${f.description ?? null}, 'fixed', ${f.basePriceXaf}, 'exact', ${f.totalUnits},
           'pending', ${shop.city}, ${shop.barrio}, ${shop.region},
           ${JSON.stringify(images)}::jsonb, true)
        RETURNING id`;
      const productId = prod[0].id as string;

      // 2) El tipo de habitación (inventario, señal, retención, calendario propio).
      const rows: any[] = await tx.$queryRaw`
        INSERT INTO lifebook.room_types
          (shop_id, product_id, name, description, capacity, beds, size_m2, total_units,
           base_price_xaf, weekend_price_xaf, cleaning_fee_xaf, taxes_xaf, min_nights, max_nights,
           deposit_percent, hold_minutes, confirmation_hours, cancellation_hours, images, amenities, is_active)
        VALUES
          (${shop.id}::uuid, ${productId}::uuid, ${f.name}, ${f.description ?? null}, ${f.capacity},
           ${f.beds}::jsonb, ${f.sizeM2}, ${f.totalUnits}, ${f.basePriceXaf}, ${f.weekendPriceXaf},
           ${f.cleaningFeeXaf}, ${f.taxesXaf}, ${f.minNights}, ${f.maxNights},
           ${f.depositPercent}, ${f.holdMinutes}, ${f.confirmationHours}, ${f.cancellationHours},
           ${JSON.stringify(images)}::jsonb, ${f.amenities}::jsonb, ${f.isActive})
        RETURNING *`;
      return rows[0];
    });

    // La tienda pasa a ser alojamiento en cuanto tiene su primer tipo de habitación.
    await this.db.$executeRaw`UPDATE lifebook.shops SET is_hotel = true, updated_at = now() WHERE id = ${shop.id}::uuid`;
    this.log.log(`tipo de habitación «${created.name}» creado en «${shop.name}»`);
    return { room: this.roomShape(created, { shopName: shop.name, productStatus: 'pending' }) };
  }

  /** Edita un tipo de habitación (solo el dueño). */
  async updateRoomType(userId: string, roomTypeIdRaw: string, dto: RoomTypeInput, images?: string[]) {
    const roomTypeId = this.uuid(roomTypeIdRaw, 'Tipo de habitación');
    const rt = await this.roomTypeOwned(userId, roomTypeId);
    const f = this.roomFields(dto, { partial: true });
    const sets: string[] = [];
    const vals: unknown[] = [];
    const col: Record<string, string> = {
      name: 'name', description: 'description', capacity: 'capacity', beds: 'beds', sizeM2: 'size_m2',
      totalUnits: 'total_units', basePriceXaf: 'base_price_xaf', weekendPriceXaf: 'weekend_price_xaf',
      cleaningFeeXaf: 'cleaning_fee_xaf', taxesXaf: 'taxes_xaf', minNights: 'min_nights',
      maxNights: 'max_nights', depositPercent: 'deposit_percent', holdMinutes: 'hold_minutes',
      confirmationHours: 'confirmation_hours', cancellationHours: 'cancellation_hours',
      amenities: 'amenities', isActive: 'is_active',
    };
    // 🔒 Las columnas `jsonb` necesitan su conversión EXPLÍCITA.
    //
    // `roomFields` devuelve `beds` y `amenities` ya serializados como TEXTO (`JSON.stringify`),
    // y esto va por `$executeRawUnsafe`, que los manda como texto. Sin el `::jsonb` Postgres
    // responde 42804 («column "beds" is of type jsonb but expression is of type text») y
    // **editar una habitación devolvía un 500** — justo lo que la pantalla de edición
    // necesita mandar. El alta no lo sufría porque su INSERT sí lleva el `::jsonb`; y el
    // E2E tampoco lo cazó porque solo editaba `isActive`. Lo destapó el contrato de las
    // pantallas nuevas (`lb42f-contrato-panel.cjs`).
    const JSONB_COLS = new Set(['beds', 'amenities']);
    for (const [k, v] of Object.entries(f)) {
      sets.push(`${col[k]} = $${sets.length + 1}${JSONB_COLS.has(k) ? '::jsonb' : ''}`);
      vals.push(v);
    }

    // 🔒 No se puede BAJAR el inventario por debajo de lo ya reservado: sería
    // vender habitaciones que ya tienen huésped dentro.
    if (f.totalUnits !== undefined && Number(f.totalUnits) < Number(rt.total_units)) {
      const ocupadas: any[] = await this.db.$queryRaw`
        SELECT COALESCE(MAX(n), 0)::int AS max_ocupadas FROM (
          SELECT night, count(*)::int AS n
            FROM lifebook.reservation_nights
           WHERE room_type_id = ${roomTypeId}::uuid AND night >= CURRENT_DATE
           GROUP BY night) t`;
      if (Number(ocupadas[0]?.max_ocupadas ?? 0) > Number(f.totalUnits)) {
        throw new DomainError('UNITS_BELOW_BOOKED', 'No puedes dejar menos habitaciones que las ya reservadas en esas fechas');
      }
    }
    if (f.minNights !== undefined || f.maxNights !== undefined) {
      const min = Number(f.minNights ?? rt.min_nights);
      const max = Number(f.maxNights ?? rt.max_nights);
      if (max < min) throw new DomainError('NIGHTS_RANGE_INVALID', 'La estancia máxima no puede ser menor que la mínima');
    }

    if (sets.length) {
      await this.db.$executeRawUnsafe(
        `UPDATE lifebook.room_types SET ${sets.join(', ')}, updated_at = now() WHERE id = $${sets.length + 1}::uuid`,
        ...vals, roomTypeId,
      );
    }
    if (images) {
      await this.db.$executeRaw`
        UPDATE lifebook.room_types SET images = ${JSON.stringify(images)}::jsonb, updated_at = now()
         WHERE id = ${roomTypeId}::uuid`;
    }
    // La publicación del catálogo sigue al tipo (título, precio, inventario, fotos) y —lo que
    // FALTABA— también su PUBLICACIÓN.
    //
    // 🔒 El defecto: desactivar una habitación en el panel dejaba su publicación `status='active'`,
    // así que seguía saliendo en el catálogo de Life Book (y se podía pedir por el flujo de
    // pedidos) mientras el hotelero creía haberla apagado. Medido: «Habitación app 290671» tenía
    // `room_types.is_active=false` y era **el primer resultado** del catálogo.
    //
    // Se reutiliza el vocabulario que el catálogo ya tiene (`hidden` = oculto por el dueño,
    // `active` = publicado) en vez de inventar un estado nuevo. Y al VOLVER a activarla se
    // respeta la moderación: si nunca pasó por revisión (`published_at IS NULL`) NO se publica
    // sola — si no, desactivar y reactivar sería una forma de saltarse al administrador.
    if (rt.product_id) {
      const news: any[] = await this.db.$queryRaw`SELECT * FROM lifebook.room_types WHERE id = ${roomTypeId}::uuid`;
      const n = news[0];
      const activa = f.isActive === undefined ? null : Boolean(f.isActive);
      await this.db.$executeRaw`
        UPDATE lifebook.products
           SET title = ${n.name}, long_description = ${n.description}, price_xaf = ${n.base_price_xaf},
               stock_quantity = ${n.total_units},
               media = CASE WHEN ${images ? JSON.stringify(images) : null}::jsonb IS NULL
                            THEN media ELSE ${JSON.stringify(images ?? [])}::jsonb END,
               status = CASE
                 WHEN ${activa}::boolean IS NULL THEN status
                 WHEN ${activa}::boolean = false AND status IN ('active', 'sold_out') THEN 'hidden'
                 WHEN ${activa}::boolean = true AND status = 'hidden' AND published_at IS NOT NULL THEN 'active'
                 ELSE status END,
               updated_at = now()
         WHERE id = ${n.product_id}::uuid`;
    }
    const fresca: any[] = await this.db.$queryRaw`SELECT * FROM lifebook.room_types WHERE id = ${roomTypeId}::uuid`;
    return { room: this.roomShape(fresca[0], { productStatus: rt.product_status }) };
  }

  /** Mis tipos de habitación (panel). */
  async myRoomTypes(userId: string) {
    const shop = await this.shopOf(userId);
    if (!shop) return { rooms: [] };
    return { rooms: await this.roomTypesOfShop(shop.id) };
  }

  /** Tipos de habitación de una tienda (público: solo activos y de hotel abierto). */
  async roomTypesPublic(shopIdRaw: string) {
    const shopId = this.uuid(shopIdRaw, 'Hotel');
    const shops: any[] = await this.db.$queryRaw`
      SELECT id, name, is_hotel, is_active FROM lifebook.shops WHERE id = ${shopId}::uuid LIMIT 1`;
    if (!shops[0] || !shops[0].is_hotel || !shops[0].is_active) {
      throw new DomainError('HOTEL_NOT_FOUND', 'Ese alojamiento no existe o no está disponible');
    }
    return { hotel: { id: shops[0].id, name: shops[0].name }, rooms: await this.roomTypesOfShop(shopId, { onlyActive: true }) };
  }

  /** Fichas de habitación de una tienda (con el estado de su publicación). */
  private async roomTypesOfShop(shopId: string, opts: { onlyActive?: boolean } = {}) {
    const rows: any[] = await this.db.$queryRaw`
      SELECT rt.*, p.status AS product_status, p.media AS product_media,
             (SELECT count(*)::int FROM lifebook.reservations r
               WHERE r.room_type_id = rt.id AND r.status IN ('hold','pending','confirmed','checked_in')) AS activas
        FROM lifebook.room_types rt
        LEFT JOIN lifebook.products p ON p.id = rt.product_id
       WHERE rt.shop_id = ${shopId}::uuid
       ORDER BY rt.base_price_xaf, rt.name`;
    return rows
      .filter((r) => !opts.onlyActive || (r.is_active && r.product_status === 'active'))
      .map((r) => this.roomShape(r, { productStatus: r.product_status }));
  }

  /** Ficha pública de un tipo de habitación. */
  async roomType(roomTypeIdRaw: string): Promise<{ room: any }> {
    const roomTypeId = this.uuid(roomTypeIdRaw, 'Habitación');
    const rows: any[] = await this.db.$queryRaw`
      SELECT rt.*, p.status AS product_status, s.name AS shop_name, s.city, s.barrio, s.region,
             s.is_hotel, s.is_active AS shop_active, s.rating AS shop_rating, s.rating_count,
             s.logo_url, s.lat, s.lng
        FROM lifebook.room_types rt
        JOIN lifebook.shops s ON s.id = rt.shop_id
        LEFT JOIN lifebook.products p ON p.id = rt.product_id
       WHERE rt.id = ${roomTypeId}::uuid LIMIT 1`;
    const r = rows[0];
    if (!r || !r.is_hotel || !r.shop_active || !r.is_active || r.product_status !== 'active') {
      throw new DomainError('ROOM_NOT_FOUND', 'Esa habitación no existe o no está disponible');
    }
    // LH-05: sin `ORDER BY`, el método que la app preselecciona lo decidía el plan de
    // ejecución — y podía salir «Monedero» ya marcado, que es justo el que la app todavía
    // no sabe completar (le falta mandar el `X-Payment-Token`). Con el orden explícito la
    // preselección es estable y reproducible; la mitad que falta de LH-05 es del cliente.
    const pay: any[] = await this.db.$queryRaw`
      SELECT method FROM lifebook.shop_payment_methods
       WHERE shop_id = ${r.shop_id}::uuid AND status = 'active'
       ORDER BY method`;
    return {
      room: this.roomShape(r, {
        productStatus: r.product_status,
        hotel: { id: r.shop_id, name: r.shop_name, city: r.city, barrio: r.barrio, logoUrl: r.logo_url, lat: r.lat, lng: r.lng },
        paymentMethods: pay.map((m) => m.method),
      }),
    };
  }

  /** Tipo de habitación del que el usuario es dueño (o error). */
  async roomTypeOwned(userId: string, roomTypeId: string): Promise<any> {
    const rows: any[] = await this.db.$queryRaw`
      SELECT rt.*, p.status AS product_status
        FROM lifebook.room_types rt
        JOIN lifebook.shops s ON s.id = rt.shop_id
        LEFT JOIN lifebook.products p ON p.id = rt.product_id
       WHERE rt.id = ${roomTypeId}::uuid AND s.owner_id = ${userId}::uuid LIMIT 1`;
    if (!rows[0]) throw new DomainError('ROOM_NOT_YOURS', 'Esa habitación no es de tu hotel');
    return rows[0];
  }

  /**
   * Forma canónica de una reserva para el panel del hotel (la usan los DOS
   * servicios: el de reservas y el del comerciante). Vive aquí para que no haya dos
   * serializadores que se desincronicen — que es exactamente lo que pasaba cuando el
   * listado del dueño devolvía una forma y el detalle devolvía la fila cruda.
   *
   * 🔒 Sin `guestId`: el panel necesita el NOMBRE del huésped (para recibirlo y para el
   * chat), no su identificador. El teléfono solo lo añade el DETALLE.
   */
  hotelReservationShape(r: any, extra: Record<string, unknown> = {}) {
    // La regla del plazo, importada: la misma que usan `action`, el panel y el SQL (LH-08).
    const viva = ocupaInventario(r.status, r.hold_expires_at);
    const cancelaHasta = this.freeCancellationUntil(r);
    return {
      id: r.id,
      code: r.code,
      status: r.status,
      viva,
      role: 'hotel',
      roomName: r.room_name_snapshot ?? r.room_type_name ?? r.room_name ?? 'Habitación',
      guest: {
        name: r.guest_name ?? 'Huésped',
        avatarUrl: r.guest_avatar ?? null,
        // El teléfono solo va si el llamante lo ha pedido (detalle, no listado).
        phone: r.guest_phone ?? null,
      },
      checkIn: this.fecha(r.check_in),
      checkOut: this.fecha(r.check_out),
      nights: Number(r.nights),
      units: Number(r.units),
      guests: Number(r.guests),
      pricePerNightXaf: Number(r.price_per_night_xaf),
      subtotalXaf: Number(r.subtotal_xaf ?? 0),
      cleaningFeeXaf: Number(r.cleaning_fee_xaf ?? 0),
      taxesXaf: Number(r.taxes_xaf ?? 0),
      totalXaf: Number(r.total_xaf),
      depositPercent: Number(r.deposit_percent),
      depositXaf: Number(r.deposit_xaf),
      remainingXaf: Number(r.remaining_xaf),
      paymentMethod: r.payment_method,
      paymentStatus: r.payment_status,
      holdExpiresAt: r.hold_expires_at ?? null,
      freeCancellationUntil: cancelaHasta,
      depositPaidAt: r.deposit_paid_at ?? null,
      paidAt: r.paid_at ?? null,
      depositConfirmedBy: r.deposit_confirmed_by ?? null,
      depositProof: r.deposit_proof ?? null,
      checkedInAt: r.checked_in_at ?? null,
      checkedOutAt: r.checked_out_at ?? null,
      cancelledAt: r.cancelled_at ?? null,
      cancelReason: r.cancel_reason ?? null,
      note: r.note ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      ...extra,
    };
  }

  /**
   * Hasta cuándo se puede cancelar sin coste: `entrada + checkin_from − cancellation_hours`.
   *
   * 🔒 LA HORA ES LA DEL HOTEL, y antes no lo era (LH-13). El cálculo era
   * `new Date(`${fecha}T14:00:00Z`)`, con dos errores que se sumaban:
   *
   *   · `14:00` **fijo**, aunque el hotel declare otra hora de entrada en su ficha
   *     (`hotel_profiles.checkin_from`), que es justo la que el huésped ve;
   *   · en `Z` (UTC), cuando **Malabo es UTC+1**: el corte caía a las **15:00** locales,
   *     una hora tarde. Esa hora decide si una cancelación entra gratis o se come la señal.
   *
   * `checkin_from` llega como `HH:MM` (el DTO lo limita a 5 caracteres); si viniera
   * `HH:MM:SS`, un `9:00` sin cero o basura, se normaliza y, si no hay nada legible, se
   * cae al **mismo** `14:00` que usan el formulario del hotel y el DTO.
   *
   * Una sola definición: la usan la ficha del huésped, su detalle y el panel del hotelero.
   */
  freeCancellationUntil(r: any): string | null {
    const horas = Number(r.cancellation_hours ?? 0);
    if (!horas || !r.check_in) return null;
    const dia = this.fecha(r.check_in);
    if (!dia) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(String(r.checkin_from ?? '').trim());
    const hora = m ? `${m[1].padStart(2, '0')}:${m[2]}` : '14:00';
    // Malabo es UTC+1 todo el año (no hay horario de verano): el corte se fija con ese
    // desfase explícito, nunca con `Z`.
    const entrada = new Date(`${dia}T${hora}:00+01:00`);
    if (Number.isNaN(entrada.getTime())) return null;
    return new Date(entrada.getTime() - horas * 3_600_000).toISOString();
  }

  private roomShape(r: any, extra: Record<string, unknown> = {}) {
    return {
      id: r.id,
      shopId: r.shop_id,
      productId: r.product_id,
      name: r.name,
      description: r.description,
      capacity: Number(r.capacity),
      beds: r.beds ?? [],
      sizeM2: r.size_m2,
      totalUnits: Number(r.total_units),
      basePriceXaf: Number(r.base_price_xaf),
      weekendPriceXaf: r.weekend_price_xaf === null ? null : Number(r.weekend_price_xaf),
      cleaningFeeXaf: Number(r.cleaning_fee_xaf ?? 0),
      taxesXaf: Number(r.taxes_xaf ?? 0),
      minNights: Number(r.min_nights),
      maxNights: Number(r.max_nights),
      depositPercent: Number(r.deposit_percent),
      holdMinutes: Number(r.hold_minutes),
      confirmationHours: Number(r.confirmation_hours),
      cancellationHours: Number(r.cancellation_hours),
      images: r.images ?? [],
      amenities: r.amenities ?? [],
      isActive: !!r.is_active,
      activeReservations: r.activas === undefined ? undefined : Number(r.activas),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      ...extra,
    };
  }

  // ─────────────────────────── calendario del hotelero ──────────────────────
  /**
   * Guarda excepciones de calendario (cerrar fechas, precio de temporada,
   * estancia mínima). Se envía un rango y los días concretos.
   */
  async saveCalendar(userId: string, roomTypeIdRaw: string, dto: any) {
    const roomTypeId = this.uuid(roomTypeIdRaw, 'Habitación');
    await this.roomTypeOwned(userId, roomTypeId);
    const desde = this.date(dto?.from, 'Desde');
    const hasta = this.date(dto?.to, 'Hasta');
    if (hasta < desde) throw new DomainError('DATE_RANGE_INVALID', 'La fecha final no puede ser anterior a la inicial');
    const dias = this.nightsBetween(desde, this.addDays(hasta, 1));
    if (dias > MAX_RANGE_NIGHTS) throw new DomainError('RANGE_TOO_LONG', `Como máximo ${MAX_RANGE_NIGHTS} días por operación`);

    const accion = this.one(dto?.action, ['set', 'clear'], 'set', 'CALENDAR_ACTION_INVALID', 'Acción de calendario no válida');
    const diasSemana: number[] | null = Array.isArray(dto?.weekdays)
      ? dto.weekdays.map((d: unknown) => this.int(d, 0, 6, 'Día de la semana'))
          .filter((v: number | null): v is number => v !== null)
      : null;
    const fechas = this.nightsList(desde, this.addDays(hasta, 1)).filter((f) => {
      if (!diasSemana || !diasSemana.length) return true;
      const dow = new Date(`${f}T00:00:00Z`).getUTCDay();
      return diasSemana.includes(dow);
    });
    if (!fechas.length) throw new DomainError('CALENDAR_EMPTY', 'Ese rango no incluye ningún día laborable de los elegidos');

    if (accion === 'clear') {
      const borrados: number = await this.db.$executeRaw`
        DELETE FROM lifebook.room_type_calendar
         WHERE room_type_id = ${roomTypeId}::uuid AND date = ANY(${fechas}::date[])`;
      return { cleared: borrados, from: desde, to: hasta };
    }

    const price = this.int(dto?.priceXaf, 1, 100_000_000, 'Precio de temporada', null);
    const minNights = this.int(dto?.minNights, 1, 90, 'Estancia mínima', null);
    const isClosed = dto?.isClosed === true;
    if (price === null && minNights === null && !isClosed) {
      throw new DomainError('CALENDAR_NOTHING', 'Indica precio, estancia mínima o cierre de fechas');
    }
    const note = this.clean(dto?.note, 120) || null;

    await this.db.$transaction(async (tx: any) => {
      for (const fecha of fechas) {
        await tx.$executeRaw`
          INSERT INTO lifebook.room_type_calendar (room_type_id, date, price_xaf, min_nights, is_closed, note, updated_at)
          VALUES (${roomTypeId}::uuid, ${fecha}::date, ${price}, ${minNights}, ${isClosed}, ${note}, now())
          ON CONFLICT (room_type_id, date) DO UPDATE SET
            price_xaf = COALESCE(EXCLUDED.price_xaf, lifebook.room_type_calendar.price_xaf),
            min_nights = COALESCE(EXCLUDED.min_nights, lifebook.room_type_calendar.min_nights),
            is_closed = EXCLUDED.is_closed,
            note = COALESCE(EXCLUDED.note, lifebook.room_type_calendar.note),
            updated_at = now()`;
      }
    });
    // Si se cierra un día con reservas vivas, se avisa (no se cancela nada solo).
    let aviso: string | null = null;
    if (isClosed) {
      const chocan: any[] = await this.db.$queryRaw`
        SELECT count(*)::int AS n FROM lifebook.reservation_nights rn
          JOIN lifebook.reservations r ON r.id = rn.reservation_id
         WHERE rn.room_type_id = ${roomTypeId}::uuid AND rn.night = ANY(${fechas}::date[])
           AND r.status IN ('hold','pending','confirmed','checked_in')`;
      if (Number(chocan[0]?.n ?? 0) > 0) {
        aviso = `Ojo: hay ${Number(chocan[0].n)} noche(s) ya reservadas en esas fechas. Las reservas existentes se mantienen.`;
      }
    }
    return { saved: fechas.length, from: desde, to: hasta, closed: isClosed, priceXaf: price, minNights, warning: aviso };
  }

  /** Calendario de un tipo de habitación: una fila por noche del rango pedido. */
  async calendar(roomTypeIdRaw: string, fromRaw?: string, toRaw?: string, unitsRaw?: string) {
    const roomTypeId = this.uuid(roomTypeIdRaw, 'Habitación');
    const rtRows: any[] = await this.db.$queryRaw`
      SELECT rt.*, s.is_active AS shop_active, s.is_hotel, p.status AS product_status
        FROM lifebook.room_types rt
        JOIN lifebook.shops s ON s.id = rt.shop_id
        LEFT JOIN lifebook.products p ON p.id = rt.product_id
       WHERE rt.id = ${roomTypeId}::uuid LIMIT 1`;
    const rt = rtRows[0];
    if (!rt || !rt.is_hotel || !rt.shop_active || !rt.is_active || rt.product_status !== 'active') {
      throw new DomainError('ROOM_NOT_FOUND', 'Esa habitación no existe o no está disponible');
    }
    const hoy = this.todayMalabo();
    const from = fromRaw ? this.date(fromRaw, 'Desde') : hoy;
    const to = toRaw ? this.date(toRaw, 'Hasta') : this.addDays(from, DETAIL_CALENDAR_DAYS - 1);
    if (to < from) throw new DomainError('DATE_RANGE_INVALID', 'La fecha final no puede ser anterior a la inicial');
    const span = this.nightsBetween(from, this.addDays(to, 1));
    if (span > MAX_RANGE_NIGHTS) throw new DomainError('RANGE_TOO_LONG', `Como máximo ${MAX_RANGE_NIGHTS} días por consulta`);
    const units = this.int(unitsRaw, 1, 50, 'Habitaciones', 1) as number;
    const days = await this.availabilityFor(rt, from, to, units);
    return {
      roomTypeId,
      name: rt.name,
      totalUnits: Number(rt.total_units),
      from,
      to,
      units,
      days,
      summary: {
        free: days.filter((d) => d.available).length,
        closed: days.filter((d) => d.closed).length,
        full: days.filter((d) => !d.closed && !d.available).length,
      },
    };
  }

  /**
   * 🔒 Disponibilidad por noche en UNA consulta (GROUP BY) — la tabla de noches
   * es la única verdad, y las retenciones VENCIDAS cuentan como libres aunque el
   * barrido todavía no las haya cancelado.
   */
  async availabilityFor(rt: any, from: string, to: string, units: number) {
    const roomTypeId = rt.id as string;
    const total = Number(rt.total_units);
    const occ: any[] = await this.db.$queryRaw`
      SELECT rn.night::text AS night, count(*)::int AS usadas
        FROM lifebook.reservation_nights rn
        JOIN lifebook.reservations r ON r.id = rn.reservation_id
       WHERE rn.room_type_id = ${roomTypeId}::uuid
         AND rn.night BETWEEN ${from}::date AND ${to}::date
         AND r.status IN ('hold','pending','confirmed','checked_in')
         -- Ocupa mientras su plazo siga vivo: la regla de plazoVencido() (LH-08).
         AND (r.status NOT IN ('hold','pending') OR r.hold_expires_at IS NULL OR r.hold_expires_at > now())
       GROUP BY rn.night`;
    const usadas = new Map<string, number>(occ.map((o) => [o.night, Number(o.usadas)]));
    const cal: any[] = await this.db.$queryRaw`
      SELECT date::text AS date, price_xaf, min_nights, is_closed, note
        FROM lifebook.room_type_calendar
       WHERE room_type_id = ${roomTypeId}::uuid AND date BETWEEN ${from}::date AND ${to}::date`;
    const porFecha = new Map<string, any>(cal.map((c) => [c.date, c]));
    const weekend = rt.weekend_price_xaf === null || rt.weekend_price_xaf === undefined
      ? null : Number(rt.weekend_price_xaf);

    const out: any[] = [];
    for (const night of this.nightsList(from, this.addDays(to, 1))) {
      const u = usadas.get(night) ?? 0;
      const c = porFecha.get(night);
      const libre = Math.max(0, total - u);
      const dow = new Date(`${night}T00:00:00Z`).getUTCDay(); // 5 = viernes, 6 = sábado
      // El precio de temporada manda; si no, el de fin de semana (viernes y sábado,
      // que son las noches que se pagan más caras).
      const precio = c?.price_xaf != null
        ? Number(c.price_xaf)
        : (weekend !== null && (dow === 5 || dow === 6) ? weekend : Number(rt.base_price_xaf));
      out.push({
        date: night,
        priceXaf: precio,
        basePriceXaf: Number(rt.base_price_xaf),
        weekend: dow === 5 || dow === 6,
        closed: !!c?.is_closed,
        note: c?.note ?? null,
        minNights: Number(c?.min_nights ?? rt.min_nights),
        totalUnits: total,
        usedUnits: u,
        freeUnits: libre,
        isToday: night === this.todayMalabo(),
        // La noche está libre si no está cerrada y quedan unidades suficientes.
        available: !c?.is_closed && libre >= units,
      });
    }
    return out;
  }

  // ───────────────────────────── búsqueda ───────────────────────────────────
  /**
   * Buscar hoteles por ciudad y fechas. Devuelve el precio MÍNIMO real del rango
   * (con temporada y fin de semana) y las habitaciones con disponibilidad.
   *
   * Si no hay fechas, es un listado por ciudad (sin disponibilidad): así el
   * buscador sirve para explorar y para reservar.
   */
  async searchHotels(q: {
    city?: string; checkIn?: string; checkOut?: string; guests?: string | number;
    units?: string | number; minPrice?: string | number; maxPrice?: string | number;
    cursor?: string; limit?: string | number; page?: string | number; pageSize?: string | number;
    amenities?: string;
  }) {
    const city = this.clean(q.city, 60);
    const guests = this.int(q.guests, 1, 50, 'Huéspedes', 1) as number;
    const units = this.int(q.units, 1, 20, 'Habitaciones', 1) as number;
    // Paginación: el dueño pedía page/pageSize y la app publicada manda `limit`.
    // Se admiten las dos, con el mismo tope, en vez de elegir una y romper la otra.
    const page = this.int(q.page, 1, 10_000, 'Página', 1) as number;
    const pedido = q.pageSize ?? q.limit;
    const pageSize = Math.min(Math.max(this.int(pedido, 1, 40, 'Tamaño de página', 12) as number, 1), 40);
    const limit = pageSize;
    const minPrice = this.int(q.minPrice, 0, 100_000_000, 'Precio mínimo', null);
    const maxPrice = this.int(q.maxPrice, 0, 100_000_000, 'Precio máximo', null);
    if (minPrice !== null && maxPrice !== null && maxPrice < minPrice) {
      throw new DomainError('PRICE_RANGE_INVALID', 'El precio máximo no puede ser menor que el mínimo');
    }
    let checkIn: string | null = null;
    let checkOut: string | null = null;
    let nights = 0;
    if (q.checkIn || q.checkOut) {
      if (!q.checkIn || !q.checkOut) throw new DomainError('DATES_REQUIRED', 'Indica entrada y salida');
      checkIn = this.date(q.checkIn, 'Entrada');
      checkOut = this.date(q.checkOut, 'Salida');
      nights = this.nightsBetween(checkIn, checkOut);
      if (nights < 1) throw new DomainError('DATE_RANGE_INVALID', 'La salida tiene que ser posterior a la entrada');
      if (nights > MAX_RANGE_NIGHTS) throw new DomainError('RANGE_TOO_LONG', `Como máximo ${MAX_RANGE_NIGHTS} noches por reserva`);
      const hoy = this.todayMalabo();
      if (checkIn < hoy) throw new DomainError('DATE_IN_PAST', 'La fecha de entrada ya pasó');
    }

    // 1) Hoteles candidatos: abiertos, con al menos una habitación activa publicada.
    // El `LEFT JOIN` trae el ESPEJO de la nota (C-1): la tarjeta del resultado enseña la nota del
    // alojamiento, no `shops.rating`. El `ORDER BY` sigue sobre `s.rating` — la decisión de ordenar
    // por el espejo es de C-2 (dossier §14.1), y cambiarlo cuando todavía no hay reseñas dejaría
    // todos los hoteles empatados a cero. Queda anotado en el acta como el único sitio sin desacoplar.
    const hoteles: any[] = await this.db.$queryRaw`
      SELECT DISTINCT s.*, hp.hotel_rating, hp.hotel_rating_count
        FROM lifebook.shops s
        LEFT JOIN lifebook.hotel_profiles hp ON hp.shop_id = s.id
        JOIN lifebook.room_types rt ON rt.shop_id = s.id AND rt.is_active
        JOIN lifebook.products p ON p.id = rt.product_id AND p.status = 'active'
       WHERE s.is_hotel AND s.is_active
         AND (${city}::text = '' OR s.city ILIKE ${'%' + city + '%'})
       ORDER BY s.is_hotel DESC, s.rating DESC, s.created_at DESC
       LIMIT ${limit} OFFSET ${(page - 1) * pageSize}`;

    if (!hoteles.length) {
      return { hotels: [], city: city || null, checkIn, checkOut, nights, guests, units, nextCursor: null };
    }
    const shopIds = hoteles.map((h) => h.id);

    // 2) Habitaciones de esos hoteles (PÚBLICAS: activas y aprobadas), en una consulta.
    const rooms: any[] = await this.db.$queryRaw`
      SELECT rt.* FROM lifebook.room_types rt
        JOIN lifebook.products p ON p.id = rt.product_id AND p.status = 'active'
       WHERE rt.shop_id = ANY(${shopIds}::uuid[]) AND rt.is_active
       ORDER BY rt.base_price_xaf`;

    // 3) Calendario y ocupación del rango, en dos consultas para TODOS los hoteles.
    const roomIds = rooms.map((r) => r.id);
    let calPorRoom = new Map<string, Map<string, any>>();
    let usadasPorRoom = new Map<string, Map<string, number>>();
    if (checkIn && checkOut && roomIds.length) {
      const cal: any[] = await this.db.$queryRaw`
        SELECT room_type_id, date::text AS date, price_xaf, min_nights, is_closed
          FROM lifebook.room_type_calendar
         WHERE room_type_id = ANY(${roomIds}::uuid[]) AND date BETWEEN ${checkIn}::date AND ${this.addDays(checkOut, -1)}::date`;
      calPorRoom = new Map();
      for (const c of cal) {
        if (!calPorRoom.has(c.room_type_id)) calPorRoom.set(c.room_type_id, new Map());
        calPorRoom.get(c.room_type_id)!.set(c.date, c);
      }
      const occ: any[] = await this.db.$queryRaw`
        SELECT rn.room_type_id, rn.night::text AS night, count(*)::int AS usadas
          FROM lifebook.reservation_nights rn
          JOIN lifebook.reservations r ON r.id = rn.reservation_id
         WHERE rn.room_type_id = ANY(${roomIds}::uuid[])
           AND rn.night BETWEEN ${checkIn}::date AND ${this.addDays(checkOut, -1)}::date
           AND r.status IN ('hold','pending','confirmed','checked_in')
           -- Ocupa mientras su plazo siga vivo: la regla de plazoVencido() (LH-08).
           AND (r.status NOT IN ('hold','pending') OR r.hold_expires_at IS NULL OR r.hold_expires_at > now())
         GROUP BY rn.room_type_id, rn.night`;
      usadasPorRoom = new Map();
      for (const o of occ) {
        if (!usadasPorRoom.has(o.room_type_id)) usadasPorRoom.set(o.room_type_id, new Map());
        usadasPorRoom.get(o.room_type_id)!.set(o.night, Number(o.usadas));
      }
    }

    // 4) Se decide hotel por hotel con las habitaciones que caben y están libres.
    const salida: any[] = [];
    for (const h of hoteles) {
      const suyas = rooms.filter((r) => r.shop_id === h.id);
      const disponibles: any[] = [];
      for (const r of suyas) {
        if (guests > Number(r.capacity) * units) continue; // no caben
        let precioNoche = Number(r.base_price_xaf);
        let libre = Number(r.total_units);
        let minNights = Number(r.min_nights);
        if (checkIn && checkOut) {
          const noches = this.nightsList(checkIn, checkOut);
          const cal = calPorRoom.get(r.id) ?? new Map();
          const usadas = usadasPorRoom.get(r.id) ?? new Map();
          let cerrada = false;
          let min = Number(r.min_nights);
          const precios: number[] = [];
          for (const n of noches) {
            const c = cal.get(n);
            if (c?.is_closed) { cerrada = true; break; }
            if (c?.min_nights) min = Math.max(min, Number(c.min_nights));
            const dow = new Date(`${n}T00:00:00Z`).getUTCDay();
            const p = c?.price_xaf != null
              ? Number(c.price_xaf)
              : (r.weekend_price_xaf !== null && r.weekend_price_xaf !== undefined && (dow === 5 || dow === 6)
                  ? Number(r.weekend_price_xaf) : Number(r.base_price_xaf));
            precios.push(p);
            libre = Math.min(libre, Number(r.total_units) - (usadas.get(n) ?? 0));
          }
          // Sin fechas no se filtra. Con fechas: la habitación agotada o cerrada
          // se queda en la lista con `freeUnits: 0`, para que el buscador diga
          // «sin disponibilidad» en vez de hacer desaparecer la habitación.
          if (cerrada) {
            disponibles.push({
              ...this.roomShape(r),
              freeUnits: 0, avgPricePerNightXaf: Math.round(precios.reduce((a, b) => a + b, 0) / Math.max(1, precios.length)),
              closedForDates: true,
            });
            continue;
          }
          if (nights < min) {
            disponibles.push({ ...this.roomShape(r), freeUnits: libre, minNightsForDates: min });
            continue;
          }
          precioNoche = Math.round(precios.reduce((a, b) => a + b, 0) / precios.length);
        }
        const total = checkIn && checkOut
          ? this.quote({
              basePriceNight: precioNoche, nights: this.nightsBetween(checkIn, checkOut), units,
              cleaningFeeXaf: Number(r.cleaning_fee_xaf ?? 0), taxesXaf: Number(r.taxes_xaf ?? 0),
              depositPercent: Number(r.deposit_percent),
            })
          : null;
        disponibles.push({
          ...this.roomShape(r),
          freeUnits: checkIn && checkOut ? libre : null,
          avgPricePerNightXaf: checkIn && checkOut ? precioNoche : null,
          ...(total ?? {}),
        });
      }
      if (!disponibles.length) continue;
      // Primero lo que SÍ se puede reservar (y más barato), y al final lo agotado.
      disponibles.sort((a, b) => {
        const libreA = (a.freeUnits ?? Number.MAX_SAFE_INTEGER) >= units ? 0 : 1;
        const libreB = (b.freeUnits ?? Number.MAX_SAFE_INTEGER) >= units ? 0 : 1;
        return libreA - libreB || (a.totalXaf ?? a.basePriceXaf) - (b.totalXaf ?? b.basePriceXaf);
      });
      // Filtro de precio (sobre el total del rango, o sobre la noche si no hay fechas).
      const precioRef = disponibles[0].totalXaf ?? disponibles[0].basePriceXaf;
      if (minPrice !== null && precioRef < minPrice) continue;
      if (maxPrice !== null && precioRef > maxPrice) continue;
      // Una habitación cerrada o llena NO desaparece del resultado: se marca como
      // agotada y el buscador lo dice («sin disponibilidad»), que es más honesto
      // que hacer desaparecer el hotel y dejar al huésped sin saber por qué.
      const libres = checkIn && checkOut
        ? disponibles.filter((r) => (r.freeUnits ?? 0) >= units).length
        : disponibles.length;
      salida.push({
        hotel: {
          id: h.id, name: h.name, city: h.city, barrio: h.barrio, region: h.region,
          logoUrl: h.logo_url, coverUrl: h.cover_url,
          // La nota del ALOJAMIENTO (espejo de las reseñas propias), no la de la tienda: ver 026.
          rating: Number(h.hotel_rating ?? 0),
          ratingCount: Number(h.hotel_rating_count ?? 0),
          /** [D-K]: sin tres reseñas, la tarjeta no enseña cifra (la app solo pinta si es `true`). */
          ratingPublished: notaPublicada(h.hotel_rating_count),
          addressReference: h.address_reference,
          lat: h.lat, lng: h.lng, verificationLevel: h.verification_level, isVerified: !!h.is_verified,
        },
        fromPricePerNightXaf: disponibles[0].avgPricePerNightXaf ?? disponibles[0].basePriceXaf,
        // `soldOut` con fechas: ese hotel no tiene hueco en TODO el rango pedido.
        soldOut: !!checkIn && !!checkOut && libres === 0,
        rooms: disponibles.slice(0, 8),
      });
    }
    return {
      hotels: salida, city: city || null, checkIn, checkOut, nights, guests, units,
      // Paginación explícita (el dueño pedía page/pageSize): página, tamaño y si hay más.
      page,
      pageSize,
      hasMore: salida.length >= pageSize,
      nextCursor: salida.length >= pageSize ? String(page + 1) : null,
    };
  }

  // ───────────────────────────── presupuesto ────────────────────────────────
  /**
   * Cuenta TOTAL y SEÑAL en el servidor (el cliente no manda dinero nunca):
   * noches × unidades × precio + limpieza + tasas, y el % de señal del tipo.
   */
  quote(o: {
    basePriceNight: number; nights: number; units: number;
    cleaningFeeXaf?: number; taxesXaf?: number; depositPercent?: number;
  }) {
    const noches = Math.max(0, Math.floor(o.nights));
    const unidades = Math.max(1, Math.floor(o.units));
    const subtotal = o.basePriceNight * noches * unidades;
    const limpieza = Math.max(0, Math.floor(o.cleaningFeeXaf ?? 0)) * unidades;
    const tasas = Math.max(0, Math.floor(o.taxesXaf ?? 0)) * unidades;
    const total = subtotal + limpieza + tasas;
    const pct = Math.min(100, Math.max(0, Math.floor(o.depositPercent ?? 0)));
    const senal = Math.round((total * pct) / 100);
    return {
      nights: noches,
      units: unidades,
      subtotalXaf: subtotal,
      cleaningFeeXaf: limpieza,
      taxesXaf: tasas,
      totalXaf: total,
      depositPercent: pct,
      depositXaf: senal,
      remainingXaf: total - senal,
    };
  }

  // ═══════════════════════ LAS RESEÑAS DEL HOTEL (C-1) ═══════════════════════
  /**
   * La nota del ALOJAMIENTO (026 · §8.1). El permiso de escribir no es la compra: es la ESTANCIA
   * (`checked_out`). Quien no durmió no valora, y quien durmió valora una vez — el `unique` de
   * `reservation_id` lo garantiza aunque dos toques lleguen a la vez, así que el servicio no
   * comprueba nada antes de insertar: intenta y traduce el 23505.
   *
   * El ESPEJO (`hotel_profiles.hotel_rating` / `hotel_rating_count`) se recalcula aquí, en la MISMA
   * transacción del alta y del borrado. No hay trigger: la obligación es del servicio (026, cabecera).
   */
  private async reflejarNotas(tx: any, shopId: string) {
    const filas: any[] = await tx.$queryRaw`
      SELECT coalesce(avg(rating), 0) AS media, count(*)::int AS total
        FROM lifebook.hotel_reviews WHERE shop_id = ${shopId}::uuid`;
    const media = Number(filas[0]?.media ?? 0);
    const total = Number(filas[0]?.total ?? 0);
    // `INSERT ... ON CONFLICT` y no un `UPDATE`: un hotel puede tener habitaciones y reservas sin
    // ficha creada (marcar `is_hotel` al publicar la primera habitación no crea `hotel_profiles`),
    // y un `UPDATE` sobre cero filas dejaría el espejo sin escribir y sin avisar.
    await tx.$executeRaw`
      INSERT INTO lifebook.hotel_profiles (shop_id, hotel_rating, hotel_rating_count)
      VALUES (${shopId}::uuid, ${media}, ${total})
      ON CONFLICT (shop_id) DO UPDATE
         SET hotel_rating = EXCLUDED.hotel_rating,
             hotel_rating_count = EXCLUDED.hotel_rating_count,
             updated_at = now()`;
    return { media, total };
  }

  /**
   * Las reseñas de un hotel — PÚBLICO: es lo que el huésped lee antes de reservar (y lo que la
   * ficha pinta). Devuelve `total` aunque la lista venga recortada, como manda la casa.
   *
   * `average`/`publishesRating` salen del ESPEJO, no de una media calculada aquí: si se calcularan
   * en cada sitio, la cifra de la ficha y la de la lista podrían no coincidir nunca más.
   */
  async reviewsOfHotel(shopIdRaw: string, q: { limit?: unknown; offset?: unknown } = {}) {
    const shopId = this.uuid(shopIdRaw, 'Hotel');
    const limit = this.int(q.limit, 1, 50, 'Límite', 20) as number;
    const offset = this.int(q.offset, 0, 10_000, 'Desplazamiento', 0) as number;

    const shops: any[] = await this.db.$queryRaw`
      SELECT s.id, hp.hotel_rating, hp.hotel_rating_count
        FROM lifebook.shops s
        LEFT JOIN lifebook.hotel_profiles hp ON hp.shop_id = s.id
       WHERE s.id = ${shopId}::uuid AND s.is_hotel LIMIT 1`;
    if (!shops[0]) throw new DomainError('HOTEL_NOT_FOUND', 'Ese alojamiento no existe');

    const items: any[] = await this.db.$queryRaw`
      SELECT r.id, r.rating, r.body, r.reply, r.replied_at, r.created_at,
             u.id AS guest_id, u.full_name AS guest_name, u.avatar_url AS guest_avatar
        FROM lifebook.hotel_reviews r
        JOIN mobility.users u ON u.id = r.guest_id
       WHERE r.shop_id = ${shopId}::uuid
       ORDER BY r.created_at DESC
       LIMIT ${limit} OFFSET ${offset}`;

    // Medias por dimensión (027), calculadas AL VUELO y sin espejo: el desglose solo se lee en la
    // ficha (una petición por hotel), no en la búsqueda por tarjeta, así que el coste es barato y
    // no se crea un segundo sitio donde el número se puede quedar viejo (cabecera de la 027).
    // `avg()` ignora los NULL: nulo = nadie puntúó esa dimensión, no «cero».
    const dim: any[] = await this.db.$queryRaw`
      SELECT avg(cleanliness)::numeric(3,2) AS clean_avg, count(cleanliness) AS clean_n,
             avg(service)::numeric(3,2)     AS serv_avg,  count(service)     AS serv_n,
             avg(location)::numeric(3,2)    AS loc_avg,   count(location)    AS loc_n,
             avg(facilities)::numeric(3,2)  AS fac_avg,   count(facilities)  AS fac_n
        FROM lifebook.hotel_reviews
       WHERE shop_id = ${shopId}::uuid`;
    const d = dim[0] ?? {};

    return {
      total: Number(shops[0].hotel_rating_count ?? 0),
      average: Number(shops[0].hotel_rating ?? 0),
      /** [D-K]: por debajo de tres reseñas, la ficha las enseña SIN cifra. */
      publishesRating: notaPublicada(shops[0].hotel_rating_count),
      // Cada dimensión lleva su `count`: la app distingue «nadie puntúó esto» de una media real,
      // y decide enseñarla (regla del servicio, como la global).
      dimensions: {
        cleanliness: { average: d.clean_avg === null ? null : Number(d.clean_avg), count: Number(d.clean_n ?? 0) },
        service: { average: d.serv_avg === null ? null : Number(d.serv_avg), count: Number(d.serv_n ?? 0) },
        location: { average: d.loc_avg === null ? null : Number(d.loc_avg), count: Number(d.loc_n ?? 0) },
        facilities: { average: d.fac_avg === null ? null : Number(d.fac_avg), count: Number(d.fac_n ?? 0) },
      },
      limit,
      offset,
      items: items.map((r) => ({
        id: r.id,
        rating: Number(r.rating),
        body: r.body ?? null,
        reply: r.reply ?? null,
        repliedAt: r.replied_at ?? null,
        createdAt: r.created_at,
        guest: { id: r.guest_id, name: r.guest_name ?? null, avatarUrl: r.guest_avatar ?? null },
      })),
    };
  }

  /**
   * Escribir la reseña de UNA estancia. Tres puertas, en este orden:
   *   1. la reserva existe y es TUYA (`guest_id` = quien pide) — si no, no existe para ti;
   *   2. esa reserva es de ESTE hotel (el `shopId` de la ruta no es decorativo);
   *   3. la estancia ya TERMINÓ (`checked_out`): valorar una estancia en curso es valorar una promesa.
   * Después, el `unique` de la base cierra la cuarta: una reseña por estancia, para siempre.
   */
  async createReview(userId: string, shopIdRaw: string, dto: { reservationId?: unknown; rating?: unknown; body?: unknown; cleanliness?: unknown; service?: unknown; location?: unknown; facilities?: unknown }) {
    const shopId = this.uuid(shopIdRaw, 'Hotel');
    const reservationId = this.uuid(dto.reservationId, 'Reserva');
    const rating = this.int(dto.rating, 1, 5, 'Nota') as number;
    // El texto es OPCIONAL: una reseña de solo estrellas es una reseña (026). Se limpia, no se exige.
    const texto = dto.body === undefined || dto.body === null || String(dto.body).trim() === ''
      ? null
      : this.clean(dto.body, 600);
    // Las dimensiones (027) son OPCIONALES igual que el texto: el desglose amplía el juicio, no lo
    // condiciona. Cada campo valida su escala y su nombre en el error — «Limpieza», no «campo».
    const dimension = (v: unknown, etiqueta: string): number | null =>
      v === undefined || v === null ? null : (this.int(v, 1, 5, etiqueta) as number);
    const limpieza = dimension(dto.cleanliness, 'Limpieza');
    const servicio = dimension(dto.service, 'Servicio');
    const ubicacion = dimension(dto.location, 'Ubicación');
    const instalaciones = dimension(dto.facilities, 'Instalaciones');

    const estancias: any[] = await this.db.$queryRaw`
      SELECT id, shop_id, status FROM lifebook.reservations
       WHERE id = ${reservationId}::uuid AND guest_id = ${userId}::uuid LIMIT 1`;
    const estancia = estancias[0];
    // Un solo código para «no existe», «no es tuya» y «no es de este hotel»: el mensaje explica
    // cuál de las tres es, pero la puerta responde lo mismo a las tres (no se confirma lo ajeno).
    if (!estancia) throw new DomainError('RESERVATION_NOT_FOUND', 'Esa reserva no existe o no es tuya');
    if (String(estancia.shop_id) !== shopId) {
      throw new DomainError('RESERVATION_NOT_FOUND', 'Esa reserva no es de este alojamiento');
    }
    if (String(estancia.status) !== 'checked_out') {
      throw new DomainError('STAY_NOT_FINISHED', 'Solo se valora una estancia terminada (con la salida hecha)');
    }

    try {
      return await this.db.$transaction(async (tx: any) => {
        const filas: any[] = await tx.$queryRaw`
          INSERT INTO lifebook.hotel_reviews (reservation_id, shop_id, guest_id, rating, body, cleanliness, service, location, facilities)
          VALUES (${reservationId}::uuid, ${shopId}::uuid, ${userId}::uuid, ${rating}, ${texto},
                  ${limpieza}, ${servicio}, ${ubicacion}, ${instalaciones})
          RETURNING id, rating, body, cleanliness, service, location, facilities, created_at`;
        const espejo = await this.reflejarNotas(tx, shopId);
        return {
          review: {
            id: filas[0].id,
            rating: Number(filas[0].rating),
            body: filas[0].body ?? null,
            // Lo escrito se devuelve tal cual: la pantalla de confirmación puede enseñar el
            // desglose sin segunda petición. null = esa dimensión no se puntúó.
            cleanliness: filas[0].cleanliness === null ? null : Number(filas[0].cleanliness),
            service: filas[0].service === null ? null : Number(filas[0].service),
            location: filas[0].location === null ? null : Number(filas[0].location),
            facilities: filas[0].facilities === null ? null : Number(filas[0].facilities),
            reply: null,
            repliedAt: null,
            createdAt: filas[0].created_at,
          },
          hotelRating: espejo.media,
          hotelRatingCount: espejo.total,
          ratingPublished: notaPublicada(espejo.total),
        };
      });
    } catch (e: any) {
      // 23505 = `uq_lb_reviews_reserva`: dos reseñas de la misma estancia. No es un fallo del
      // cliente por enviar mal los datos: es la regla haciendo su trabajo, y se traduce a 409.
      //
      // El código se busca en los DOS sitios donde Prisma lo deja: `$queryRaw` envuelve el error
      // del driver (`P2010`) y el 23505 de Postgres queda en `meta.code`; si alguna versión lo
      // dejara arriba, `e.code` lo trae. El nombre de la restricción es el último recurso — y el
      // que no depende de la versión de Prisma.
      const codigo = String(e?.code ?? '') === '23505' || String(e?.meta?.code ?? '') === '23505';
      if (codigo || String(e?.message ?? '').includes('uq_lb_reviews_reserva')) {
        throw new DomainError('REVIEW_EXISTS', 'Ya escribiste la reseña de esta estancia');
      }
      throw e;
    }
  }

  /**
   * La respuesta del HOTEL a una reseña (responde, no borra). Solo el dueño de la tienda de esa
   * reseña. Si la reseña no es de una tienda suya se responde igual que si no existiera: entre
   * vendedores no se confirma la existencia de lo ajeno (404, no 403).
   */
  async replyReview(userId: string, reviewIdRaw: string, replyRaw: unknown) {
    const id = this.uuid(reviewIdRaw, 'Reseña');
    const texto = this.text(replyRaw, 600, 'La respuesta');
    const filas: any[] = await this.db.$queryRaw`
      SELECT id, shop_id FROM lifebook.hotel_reviews WHERE id = ${id}::uuid LIMIT 1`;
    const resena = filas[0];
    if (!resena || !(await this.ownsShop(userId, String(resena.shop_id)))) {
      throw new DomainError('REVIEW_NOT_FOUND', 'La reseña no existe');
    }
    await this.db.$executeRaw`
      UPDATE lifebook.hotel_reviews SET reply = ${texto}, replied_at = now()
       WHERE id = ${id}::uuid`;
    return { id, reply: texto, repliedAt: new Date().toISOString() };
  }

  /**
   * Borrar una reseña: el AUTOR dentro de los 7 días, el ADMINISTRADOR siempre (§8.1). El borrado
   * es FÍSICO a propósito — una baja lógica dejaría el `unique` de `reservation_id` ocupado y el
   * huésped no podría reescribir su nota dentro del plazo (026, cabecera).
   */
  async deleteReview(userId: string, reviewIdRaw: string) {
    const id = this.uuid(reviewIdRaw, 'Reseña');
    const filas: any[] = await this.db.$queryRaw`
      SELECT id, shop_id, guest_id, created_at FROM lifebook.hotel_reviews WHERE id = ${id}::uuid LIMIT 1`;
    const resena = filas[0];
    const esAutor = !!resena && String(resena.guest_id) === userId;
    const esAdmin = !esAutor && (await this.isAdmin(userId));
    if (!resena || (!esAutor && !esAdmin)) throw new DomainError('REVIEW_NOT_FOUND', 'La reseña no existe');
    if (esAutor && !esAdmin) {
      const dias = (Date.now() - new Date(resena.created_at).getTime()) / 86_400_000;
      if (dias > REVIEWS_DELETE_DAYS) {
        throw new DomainError('REVIEW_WINDOW_CLOSED', `Tu reseña se puede borrar durante ${REVIEWS_DELETE_DAYS} días; ese plazo ya pasó`);
      }
    }
    const espejo = await this.db.$transaction(async (tx: any) => {
      await tx.$executeRaw`DELETE FROM lifebook.hotel_reviews WHERE id = ${id}::uuid`;
      return this.reflejarNotas(tx, String(resena.shop_id));
    });
    return {
      ok: true,
      hotelRating: espejo.media,
      hotelRatingCount: espejo.total,
      ratingPublished: notaPublicada(espejo.total),
    };
  }
}
