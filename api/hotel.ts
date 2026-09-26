/**
 * hotel — cliente API del MÓDULO HOTELERO (Parte 42 del servidor).
 *
 * Rutas (bajo `/wallet/api/v1/lifebook/commerce/hotel`):
 *   PÚBLICAS   search · hotel · rooms · calendar · room
 *   HUÉSPED    reserve (Idempotency-Key obligatoria) · mine · reservation ·
 *              proof · action · confirmDeposit
 *   HOTELERO   myHotel · saveHotel · myRooms · createRoom · updateRoom ·
 *              saveCalendar · dayBook
 *
 * Reglas que el servidor impone y que este cliente respeta:
 *   · **El dinero no viaja**: el total, la señal y el restante los calcula el
 *     servidor. Aquí solo se envían fechas, habitaciones, huéspedes y el % de señal.
 *   · **Idempotency-Key obligatoria al reservar**: un doble toque no crea dos
 *     reservas. La clave es ESTABLE por intento (`reserveKey`), no nueva en cada
 *     pulsación — si se genera nueva en cada toque, la idempotencia no protege.
 */
import { http, httpRequest } from './httpClient';

// ───────────────────────────── tipos ────────────────────────────────────────
export interface HotelSummary {
  id: string;
  name: string;
  city: string | null;
  barrio: string | null;
  region: string | null;
  logoUrl: string | null;
  coverUrl: string | null;
  rating: number;
  ratingCount: number;
  addressReference: string | null;
  lat: number | null;
  lng: number | null;
  verificationLevel?: string;
  isVerified?: boolean;
}

export interface HotelProfile extends HotelSummary {
  shopId: string;
  propertyKind: string | null;
  stars: number | null;
  checkinFrom: string;
  checkinUntil: string;
  checkoutUntil: string;
  receptionOpen24h: boolean;
  amenities: string[];
  houseRules: string | null;
  cancellationPolicy: string | null;
  /** Cómo se entra y dónde está la recepción. Lo escribe el hotelero y lo lee el huésped al llegar
   *  (es lo que sale junto al botón «Cómo llegar» y al taxi desde el aeropuerto). */
  arrivalNote: string | null;
  taxesIncluded: boolean;
  description: string | null;
  isActive?: boolean;
  isHotel?: boolean;
  paymentMethods?: (string | { method: string; status: string; note?: string | null })[];
  roomCount?: number;
}

export interface HotelFx {
  /** País del que reserva (el que se mandó en `?country=`), o `null` si no se reconoce. */
  country: string | null;
  countryLabel: string | null;
  currency: string;
  currencyLabel: string;
  symbol: string;
  /** XAF que vale 1 unidad de esa moneda (ej.: 655,957 para el euro, paridad fija del franco CFA). */
  xafPerUnit: number;
  decimals: number;
  updatedAt: string;
  note: string | null;
  /** La moneda del huésped ES la del cobro (XAF): entonces no hay «≈» que enseñar. */
  esMonedaDelCobro: boolean;
}

/** Dónde está el hotel y cómo se entra. Lo que el huésped necesita al llegar. */
export interface HotelArrival {
  note: string | null;
  lat: number | null;
  lng: number | null;
  addressReference: string | null;
  city: string | null;
}

/** El aeropuerto de la ciudad, con los precios de taxi de referencia de la zona. */
export interface HotelAirport {
  label: string;
  city: string | null;
  lat: number;
  lng: number;
  priceFromXaf: number | null;
  priceToXaf: number | null;
}

export interface HotelRoom {
  id: string;
  shopId: string;
  productId: string | null;
  name: string;
  description: string | null;
  capacity: number;
  beds: { kind: string; count: number }[];
  sizeM2: number | null;
  totalUnits: number;
  basePriceXaf: number;
  weekendPriceXaf: number | null;
  cleaningFeeXaf: number;
  taxesXaf: number;
  minNights: number;
  maxNights: number;
  depositPercent: number;
  holdMinutes: number;
  confirmationHours: number;
  cancellationHours: number;
  images: { url: string }[];
  amenities: string[];
  isActive: boolean;
  productStatus?: string;
  /** El precio de esta habitación en la moneda del huésped (`?country=ES` → euros). Lo calcula el
   *  SERVIDOR: la app no convierte nada por su cuenta, porque dos reglas de conversión acaban
   *  diciendo cosas distintas. `null`/`undefined` = no se sabe el país o no hay tipo de cambio para
   *  él, y entonces NO se pinta nada (nunca un 0 ni una cifra inventada). */
  pricePerNightLocal?: number | null;
  // Solo en la búsqueda con fechas:
  freeUnits?: number | null;
  avgPricePerNightXaf?: number | null;
  subtotalXaf?: number;
  cleaningFeeTotalXaf?: number;
  totalXaf?: number;
  depositPercentQuoted?: number;
  depositXaf?: number;
  remainingXaf?: number;
  nights?: number;
  /** Con fechas: el hotel tiene cerrada alguna de esas noches. */
  closedForDates?: boolean;
  /** Con fechas: la estancia mínima de esas fechas es mayor que las noches pedidas. */
  minNightsForDates?: number;
}

export interface HotelSearchResult {
  hotels: {
    hotel: HotelSummary;
    fromPricePerNightXaf: number;
    /** Con fechas: ese hotel no tiene hueco en TODO el rango pedido. */
    soldOut?: boolean;
    rooms: HotelRoom[];
  }[];
  city: string | null;
  checkIn: string | null;
  checkOut: string | null;
  nights: number;
  guests: number;
  units: number;
  /**
   * Paginación.
   *
   * 🔧 Lo que se encontró al comprobar la respuesta EN CRUDO contra el servidor (y que corrige una
   * conclusión previa equivocada): el servidor devuelve **las cuatro cosas** —`page`, `pageSize`,
   * `hasMore` y `nextCursor`— **salvo cuando no hay ningún hotel candidato**, que hace un
   * `return` temprano y **se deja fuera `page`, `pageSize` y `hasMore`**:
   *
   *   /hotels?city=Malabo            → {…, page:1, pageSize:12, hasMore:false, nextCursor:null}
   *   /hotels?city=Malabo&page=2&…   → {hotels:[], city, checkIn, checkOut, nights, guests, units, nextCursor}
   *                                                                          ↑ sin paginación
   *
   * Por eso van como OPCIONALES: leerlos como si siempre estuvieran haría que `hasMore` fuese
   * `undefined` (falso, y el botón se esconde — funciona de casualidad, no por contrato).
   * Quien los use debe tratar «ausente» como «no hay más».
   */
  page?: number;
  pageSize?: number;
  /** ¿Queda otra página? Ausente = no hay más. */
  hasMore?: boolean;
  nextCursor?: string | null;
}

export interface CalendarDay {
  date: string;
  priceXaf: number;
  basePriceXaf: number;
  weekend: boolean;
  closed: boolean;
  note: string | null;
  minNights: number;
  totalUnits: number;
  usedUnits: number;
  freeUnits: number;
  isToday: boolean;
  available: boolean;
}

export interface RoomCalendar {
  roomTypeId: string;
  name: string;
  totalUnits: number;
  from: string;
  to: string;
  units: number;
  days: CalendarDay[];
  summary: { free: number; closed: number; full: number };
}

export type ReservationStatus =
  | 'hold' | 'pending' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'no_show';
export type PaymentStatus = 'pending' | 'proof_submitted' | 'deposit_paid' | 'paid' | 'refunded' | 'failed';

export interface Reservation {
  id: string;
  code: string;
  status: ReservationStatus;
  /** ¿Sigue ocupando inventario? (una retención vencida ya no). */
  viva: boolean;
  /** Identificador del huésped: solo lo recibe el propio huésped (o la administración). */
  guestId?: string | null;
  /** ¿Puede cancelarse ahora? Lo decide el servidor (estado + ventana de cancelación). */
  canCancel?: boolean;
  cancellationHours?: number;
  role: 'guest' | 'hotel' | 'admin';
  checkIn: string;
  checkOut: string;
  nights: number;
  units: number;
  guests: number;
  roomName: string;
  roomTypeId: string | null;
  pricePerNightXaf: number;
  subtotalXaf: number;
  cleaningFeeXaf: number;
  taxesXaf: number;
  totalXaf: number;
  depositPercent: number;
  depositXaf: number;
  remainingXaf: number;
  paymentMethod: string;
  paymentStatus: PaymentStatus;
  holdExpiresAt: string | null;
  freeCancellationUntil: string | null;
  hotel: HotelSummary | null;
  guest: { id: string; name: string; phone: string | null; email: string | null };
  note: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  depositPaidAt: string | null;
  /** Quién confirmó el cobro de la señal (dueño del hotel o admin). */
  depositConfirmedBy?: string | null;
  /** Referencia con la que se confirmó (nº de transferencia, «visto en cuenta»…). */
  depositProof?: string | null;
  paidAt: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  cancelledAt: string | null;
  checkinFrom?: string | null;
  checkoutUntil?: string | null;
  /** Precio noche a noche (solo en la respuesta de la creación). */
  nightlyPrices?: { date: string; priceXaf: number }[];
}

export interface DayBook {
  date: string;
  staying: Reservation[];
  arrivals: Reservation[];
  departures: Reservation[];
  occupancy: { roomTypeId: string; name: string; totalUnits: number; occupied: number; free: number }[];
}

/** Resumen del día del panel del hotelero (Parte 42-a). */
export interface HotelDashboard {
  shop: { id: string; name: string; isActive: boolean };
  date: string;
  arrivalsToday: number;
  departuresToday: number;
  insideNow: number;
  upcoming: number;
  /** Señal pagada y sin confirmar por el hotel. */
  pendingConfirm: number;
  /** Retenidas SIN pagar: se liberan solas, hay que vigilarlas. */
  unpaidHolds: number;
  /** Reservas con señal pendiente de cobro. */
  depositDue: number;
  occupancy: { roomTypeId: string; name: string; totalUnits: number; occupied: number; free: number }[];
}

export interface CreateReservationInput {
  roomTypeId: string;
  checkIn: string;
  checkOut: string;
  units?: number;
  guests?: number;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  paymentMethod: string;
  /** 0 = pagar todo al llegar. El servidor nunca sube del % del hotel. */
  depositPercent?: number;
  note?: string;
}

// ─────────────────────── clave de idempotencia estable ──────────────────────
/**
 * Clave **estable por intento de reserva**: si el usuario toca dos veces
 * «Confirmar», las dos peticiones llevan la MISMA clave y el servidor devuelve la
 * misma reserva. Se renueva solo cuando cambia lo que se reserva (fechas,
 * habitación, huéspedes), que es cuando de verdad es otra reserva.
 */
const claveActual = { firma: '', key: '' };
export function reserveKey(firma: string): string {
  if (claveActual.firma !== firma || !claveActual.key) {
    claveActual.firma = firma;
    claveActual.key = `hotel-${firma}-${Math.random().toString(36).slice(2, 10)}-${Date.now().toString(36)}`;
  }
  return claveActual.key;
}
/** Fuerza una clave nueva (después de reservar con éxito, o al cancelar el flujo). */
export function resetReserveKey(): void {
  claveActual.firma = '';
  claveActual.key = '';
}

// ───────────────────────────── API ──────────────────────────────────────────
const BASE = '/lifebook/commerce/hotel';

export const hotelApi = {
  // ── público ──
  search(q: {
    city?: string; checkIn?: string; checkOut?: string; guests?: number;
    units?: number; minPrice?: number; maxPrice?: number; limit?: number;
    /** Página (1-based). Se añadió para poder paginar: antes no se mandaba y solo había una. */
    page?: number;
  }) {
    const p = new URLSearchParams();
    if (q.city) p.set('city', q.city);
    if (q.checkIn) p.set('checkIn', q.checkIn);
    if (q.checkOut) p.set('checkOut', q.checkOut);
    if (q.guests) p.set('guests', String(q.guests));
    if (q.units) p.set('units', String(q.units));
    if (q.minPrice !== undefined) p.set('minPrice', String(q.minPrice));
    if (q.maxPrice !== undefined) p.set('maxPrice', String(q.maxPrice));
    if (q.page && q.page > 1) p.set('page', String(q.page));
    p.set('limit', String(q.limit ?? 20));
    return http.get<HotelSearchResult>(`${BASE}/hotels?${p.toString()}`, false);
  },

  /**
   * Ficha del hotel. `country` (ISO-2, ej. 'ES') hace que el servidor añada `fx` y el precio de cada
   * habitación en la moneda de ese país (`pricePerNightLocal`). El precio REAL sigue siendo el XAF: es
   * lo que se cobra, en efectivo, al llegar.
   */
  hotel(shopId: string, country?: string | null) {
    const qs = country ? `?country=${encodeURIComponent(country)}` : '';
    return http.get<{
      hotel: HotelProfile; rooms: HotelRoom[];
      fx: HotelFx | null; arrival: HotelArrival | null; airport: HotelAirport | null;
    }>(`${BASE}/hotels/${shopId}${qs}`, false);
  },

  /**
   * Tipos de cambio de referencia (público) y la moneda que toca para un país.
   * ⚠️ Va declarada antes que `hotels/:id` en el servidor: si no, «fx» entraría por el `:id`.
   */
  fx(country?: string | null) {
    const qs = country ? `?country=${encodeURIComponent(country)}` : '';
    return http.get<{
      monedaDelCobro: string;
      pais: HotelFx | null;
      monedas: Array<{ currency: string; label: string; symbol: string; xafPerUnit: number; decimals: number; updatedAt: string; note: string | null }>;
      /** Los países que se pueden elegir, con su moneda. Se listan PAÍSES porque la conversión es por
       *  país: si la app dedujera el país a partir de la moneda, estaría duplicando la tabla del
       *  servidor y las dos acabarían diciendo cosas distintas. */
      paises: Array<{ code: string; label: string; currency: string; symbol: string }>;
      aviso: string;
    }>(`${BASE}/hotels/fx${qs}`, false);
  },

  roomsOf(shopId: string) {
    return http.get<{ hotel: { id: string; name: string }; rooms: HotelRoom[] }>(`${BASE}/hotels/${shopId}/rooms`, false);
  },

  room(roomTypeId: string) {
    return http.get<{ room: HotelRoom & { hotel: HotelSummary; paymentMethods: string[] } }>(
      `${BASE}/rooms/${roomTypeId}`, false,
    );
  },

  /** Disponibilidad + precio por noche (una fila por noche). */
  calendar(roomTypeId: string, from: string, to: string, units = 1) {
    return http.get<RoomCalendar>(
      `${BASE}/rooms/${roomTypeId}/calendar?from=${from}&to=${to}&units=${units}`, false,
    );
  },

  // ── huésped ──
  /**
   * Reservar. `Idempotency-Key` OBLIGATORIA (el servidor responde 400 sin ella):
   * aquí se pasa la clave estable del intento.
   */
  reserve(input: CreateReservationInput, idempotencyKey: string) {
    return httpRequest<{ reservation: Reservation; nightlyPrices?: { date: string; priceXaf: number }[] }>(
      `${BASE}/reservations`,
      { method: 'POST', body: input, headers: { 'Idempotency-Key': idempotencyKey } },
    );
  },

  mine(side: 'guest' | 'hotel' = 'guest') {
    return http.get<{ side: string; reservations: Reservation[] }>(`${BASE}/reservations/mine?side=${side}`);
  },

  reservation(id: string) {
    return http.get<{ reservation: Reservation }>(`${BASE}/reservations/${id}`);
  },

  /** El huésped envía la referencia de la transferencia. */
  proof(id: string, proof: string) {
    return http.post<{ reservation: Reservation }>(`${BASE}/reservations/${id}/proof`, { proof });
  },

  // ── panel del hotelero (Parte 42-a) ──
  /** Resumen del día en hora de Malabo, con retenciones y ocupación por tipo. */
  dashboard() {
    return http.get<HotelDashboard>(`${BASE}/my/hotel/dashboard`);
  },

  /** Reservas del hotel, lo urgente primero (retenidas → por confirmar → por fecha). */
  shopReservations(q: { status?: string; from?: string; to?: string; limit?: number } = {}) {
    const p = new URLSearchParams();
    if (q.status) p.set('status', q.status);
    if (q.from) p.set('from', q.from);
    if (q.to) p.set('to', q.to);
    p.set('limit', String(q.limit ?? 60));
    return http.get<{ shop: { id: string; name: string }; count: number; reservations: Reservation[] }>(
      `${BASE}/my/hotel/reservations?${p.toString()}`,
    );
  },

  /** Detalle con el teléfono del huésped (para recibirlo). */
  shopReservation(id: string) {
    return httpRequest<{ reservation: Reservation & { guestPhone: string | null; guestEmail: string | null } }>(
      `${BASE}/my/hotel/reservations/${id}`,
    );
  },

  /**
   * Cambiar el estado de una reserva con `{ status, reason }` (la ruta del dueño) o
   * `{ action, reason }` (la que ya estaba desplegada): las dos van al mismo sitio.
   */
  setReservationStatus(id: string, status: string, reason?: string) {
    return httpRequest<{ reservation: Reservation }>(`${BASE}/my/hotel/reservations/${id}/status`, {
      method: 'PATCH',
      body: { status, ...(reason ? { reason } : {}) },
    });
  },

  /** Cancelar (huésped u hotel) — el motivo es obligatorio en el servidor. */
  cancel(id: string, reason: string) {
    return httpRequest<{ reservation: Reservation }>(`${BASE}/reservations/${id}/action`, {
      method: 'PATCH', body: { action: 'cancel', reason },
    });
  },

  /** El hotel confirma el cobro de la señal (o la administración). */
  confirmDeposit(id: string, proof?: string) {
    return http.post<{ reservation: Reservation }>(`${BASE}/reservations/${id}/confirm-deposit`, { proof });
  },

  // ── panel del hotelero ──
  myHotel() {
    return http.get<{ hotel: HotelProfile | null; rooms: HotelRoom[] }>(`${BASE}/my/hotel`);
  },

  saveHotel(dto: Record<string, unknown>) {
    return http.put<{ hotel: HotelProfile }>(`${BASE}/my/hotel`, dto);
  },

  myRooms() {
    return http.get<{ rooms: HotelRoom[] }>(`${BASE}/my/room-types`);
  },

  createRoom(dto: Record<string, unknown>) {
    return http.post<{ room: HotelRoom }>(`${BASE}/my/room-types`, dto);
  },

  updateRoom(id: string, dto: Record<string, unknown>) {
    return http.put<{ room: HotelRoom }>(`${BASE}/my/room-types/${id}`, dto);
  },

  /** Calendario del hotelero: cerrar fechas, precio de temporada, mínimo de noches. */
  saveCalendar(id: string, dto: {
    action?: 'set' | 'clear'; from: string; to: string;
    priceXaf?: number | null; minNights?: number | null; isClosed?: boolean;
    weekdays?: number[]; note?: string;
  }) {
    return http.put<{ saved?: number; cleared?: number; warning?: string | null }>(
      `${BASE}/my/room-types/${id}/calendar`, dto,
    );
  },

  dayBook(shopId: string, date?: string) {
    return http.get<DayBook>(`${BASE}/my/day-book?shopId=${shopId}${date ? `&date=${date}` : ''}`);
  },
};

// RESERVA_ETIQUETA se retiró el 27-sep-2026: era un SEGUNDO mapa de etiquetas de estado,
// con textos distintos para los mismos estados que el del contrato, y los dos afirmaban
// «Señal pagada» aunque no la hubiera. Las etiquetas viven en `@egrouteplan/contracts`
// (`RESERVATION_STATUS_LABELS` y, para el matiz de dinero, `estadoRotulo()`).

export const PAGO_ETIQUETA: Record<PaymentStatus, string> = {
  pending: 'Sin cobrar',
  proof_submitted: 'Comprobante enviado',
  deposit_paid: 'Señal cobrada',
  paid: 'Pagado',
  refunded: 'Devuelto',
  failed: 'Falló',
};

export const METODO_ETIQUETA: Record<string, string> = {
  transfer: 'Transferencia',
  deposit: 'Señal',
  in_store: 'En recepción',
  billing: 'Facturación',
  cash_on_delivery: 'Contra entrega',
  likebook_wallet: 'Monedero',
};
