/**
 * Cliente del servicio Comida Rápida (pedidos a restaurantes) — backend unificado.
 * Base ABSOLUTA: /api/food/*. Patrón Ecomerse: restaurantes con requisitos
 * (KYC + datos negocio + aprobación admin), menú moderado, pedidos cash|billing
 * (pickup|delivery), reviews y reportes.
 */

import { http, httpRequest } from './httpClient';

import { API_HOST } from './config';
export const FOOD_API = `${API_HOST}/api`;
const f = (p: string) => `${FOOD_API}${p}`;

export interface FoodCuisine { id: string; code: string; label: string; icon: string | null; }

/**
 * Nivel de picante de un plato (migración 041). Espejo del CHECK
 * `food_menu_items_spice_check`. `null` = el dueño no lo declaró → no se muestra.
 */
export type SpiceLevel = 'none' | 'mild' | 'medium' | 'hot' | 'extra_hot';

/** Etiquetas en español para UI (orden = de menos a más picante). */
export const SPICE_LABEL: Record<SpiceLevel, string> = {
  none: 'Sin picante',
  mild: 'Poco picante',
  medium: 'Picante medio',
  hot: 'Picante',
  extra_hot: 'Muy picante',
};

/** Icono por nivel (null no tiene: el campo no se declara). */
export const SPICE_ICON: Record<SpiceLevel, string> = {
  none: '🌿',
  mild: '🌶️',
  medium: '🌶️🌶️',
  hot: '🌶️🌶️🌶️',
  extra_hot: '🔥',
};

/** Límites de validación (espejo de la migración 041 y del DTO del backend). */
export const PREP_MINUTES_MAX = 240;
export const SIDES_MAX = 20;
export const INGREDIENTS_MAX = 1000;
export const PORTION_SIZE_MAX = 40;

/** Campos opcionales del detalle de plato (041). Todos pueden venir null. */
export interface FoodItemDetails {
  /** Lista libre de ingredientes, ej: "pollo, arroz, salsa de cacahuete". */
  ingredients: string | null;
  spiceLevel: SpiceLevel | null;
  /** Tamaño/ración libre, ej: "2 piezas", "400 g", "Grande". */
  portionSize: string | null;
  drinkIncluded: boolean;
  /** Acompañantes, ej: ["arroz", "plátano frito"]. */
  sides: string[];
  /** Minutos de preparación; null = no publicado (no se muestra ETA). */
  prepMinutes: number | null;
}

export interface FoodRestaurant {
  id: string; businessName: string; cuisineId: string | null; cuisineLabel: string | null; cuisineIcon: string | null;
  description: string | null; city: string; address: string | null; phoneContact: string | null;
  photoKey: string | null; photoUrl: string | null; isOpen: boolean | null;
  hours: string | null; deliveryKm: number;
  status: string; rejectionReason: string | null; ratingAvg: number; ratingCount: number;
  approvedAt: string | null; createdAt: string;
  /** 起送价: importe mínimo para pedir a DOMICILIO en este restaurante. Recoger en el local no tiene
   *  mínimo. Es un valor POR RESTAURANTE que se cambia sin desplegar código, así que NO se escribe a
   *  mano aquí: lo dice el servidor. `undefined` si el servidor todavía no lo devuelve (parche
   *  `CHECKOUT-fees-y-minimo.md` pendiente): la app no avisa, pero el servidor sigue rechazando con su
   *  mensaje, así que no se puede pedir por debajo. */
  minOrderXaf?: number | null;
}

export interface FoodMenuItem extends FoodItemDetails {
  id: string; restaurantId: string; name: string; description: string | null;
  category: 'bebida' | 'plato' | 'postre'; priceXaf: number; photos: string[];
  available: boolean; status: string; rejectionReason: string | null; createdAt: string;
}

export interface FoodRestaurantDetail extends FoodRestaurant { menu: FoodMenuItem[]; }

/** El desglose del dinero de un pedido (se calcula y se congela al crear el pedido).
 *  Va en `null` en los pedidos anteriores a esta función: la app debe distinguir «no hay desglose»
 *  de «el desglose es cero», por eso no se rellena con 0. */
export interface OrderFees {
  platformFeeXaf: number;
  riderFeeXaf: number;
  totalFeeXaf: number;
  restaurantNetXaf: number;
}

/** La contabilidad semanal del repartidor. `aPagarXaf` = comisiones − efectivo, **nunca negativo**;
 *  lo que sobra queda como `deudaArrastradaXaf` para la semana siguiente. */
export interface ContabilidadRepartidor {
  semana: { desde: string };
  entregas: number;
  comisionesXaf: number;
  efectivoCobradoXaf: number;
  aPagarXaf: number;
  deudaArrastradaXaf: number;
  movimientos: Array<{
    id: string; orderId: string; totalXaf: number; comisionXaf: number;
    efectivoXaf: number; pagadoConBilling: boolean; entregadoEn: string;
  }>;
}

export interface FoodRestaurantsPage {
  items: FoodRestaurant[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface FoodOwnerMe {
  kycOk: boolean; kycMessage: string | null;
  restaurant: FoodRestaurant | null; menu: FoodMenuItem[];
}

export interface FoodOrder {
  id: string; userId: string; restaurantId: string; restaurantName: string | null; restaurantPhone: string | null;
  /** Snapshot al crear el pedido. `prepMinutes` es aditivo (041): los pedidos
   *  anteriores no la llevan → `undefined`, nunca romper en null. */
  items: Array<{ itemId: string; name: string; price: number; qty: number; prepMinutes?: number | null }>;
  totalXaf: number; paymentMethod: string; billingOrderId: string | null;
  status: string; pickupType: string; deliveryAddress: string | null; note: string | null;
  billingStatus: string | null; reviewed: boolean;
  riderId: string | null; deliveryStatus: string | null;
  /** ETA de cocina del pedido = el plato más lento (041). null = sin estimación. */
  estPrepMinutes: number | null;
  /** El desglose del dinero, congelado al crear el pedido. `null` en los pedidos anteriores: no es
   *  «cero comisión», es «este pedido no tiene desglose» — y la app no debe inventarse un 0. */
  platformFeeXaf: number | null;
  riderFeeXaf: number | null;
  restaurantNetXaf: number | null;
  /** Si el local estaba cerrado al pedir, la hora a la que debe entregarse (pedido programado). */
  scheduledFor: string | null;
  /** ── UBICACIÓN DE ENTREGA Y PUNTO DE ENCUENTRO ─────────────────────────────────
   *  `deliveryLat/Lng`: el pin que da el CLIENTE al pedir a domicilio. La dirección de texto sigue
   *  siendo la base, pero «Aeropuerto» no se puede navegar; el pin sí.
   *  `meetingNote/Lat/Lng/At`: lo que anota el REPARTIDOR al llegar («entrada por la puerta lateral,
   *  junto a la farmacia»). Es la respuesta al hotel, las viviendas sociales o el portal sin número:
   *  sitios donde el nombre del lugar no basta para encontrarse. Lo ven las dos partes.
   *  Todos son `null` en pedidos anteriores o si nadie los usó. */
  deliveryLat: number | null; deliveryLng: number | null;
  meetingNote: string | null; meetingLat: number | null; meetingLng: number | null; meetingAt: string | null;
  deliveredAt: string | null; createdAt: string;
}

export interface FoodOrdersPage {
  items: FoodOrder[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface FoodRider {
  id: string; fullName: string; vehicleType: string; zone: string | null;
  phoneContact: string | null; status: string; rejectionReason: string | null;
  ratingAvg: number; deliveriesCount: number; approvedAt: string | null; createdAt: string;
}

export interface FoodDelivery {
  id: string; orderId: string; riderId: string; trackingCode: string; status: string;
  assignedAt: string | null; pickedUpAt: string | null; deliveredAt: string | null;
  items: Array<{ itemId: string; name: string; price: number; qty: number }>;
  totalXaf: number; restaurantName: string | null; restaurantAddress: string | null;
  restaurantPhone: string | null; clientPhone: string | null;
  deliveryAddress: string | null; note: string | null;
  /** El pin del cliente, para el botón «Cómo llegar». Si falta, la app cae al texto de la dirección
   *  (peor, pero mejor que nada). `meetingNote` es lo que el propio repartidor anotó, para no
   *  perderlo al recargar. */
  deliveryLat?: number | null; deliveryLng?: number | null;
  meetingNote?: string | null; meetingLat?: number | null; meetingLng?: number | null; meetingAt?: string | null;
  /** 'cash' | 'billing'. Necesario para que el repartidor sepa si debe cobrar en la
   *  puerta. El servidor aún no lo devuelve (parche C5 pendiente en
   *  backend/server-patch/C5-rider-payment-method.md): hasta que se despliegue llega
   *  `undefined`, y la app muestra el aviso neutro. Nunca se asume 'cash', porque
   *  asumir es justo el error que este campo viene a evitar. */
  paymentMethod?: string | null;
}

export interface FoodRiderMe {
  kycOk: boolean; kycMessage: string | null;
  rider: FoodRider | null; deliveries: FoodDelivery[];
}

export const foodApi = {
  flags: () => http.get<{ f1: boolean; cash: boolean; billing: boolean; escrow: boolean }>(f('/food/flags'), false),
  restaurants: (q: Record<string, string> = {}) => {
    const qs = new URLSearchParams(q).toString();
    return http.get<FoodRestaurantsPage>(f(`/food/restaurants${qs ? '?' + qs : ''}`), false);
  },
  restaurant: (id: string) => http.get<FoodRestaurantDetail>(f(`/food/restaurants/${id}`), false),
  cuisines: () => http.get<FoodCuisine[]>(f('/food/cuisines'), false),
  reportRestaurant: (id: string, reason: string, note?: string) =>
    http.post<{ message: string }>(f(`/food/restaurants/${id}/report`), { reason, note }, true),
  ownerMe: () => http.get<FoodOwnerMe>(f('/food/owner/me'), true),
  uploadPhoto: (form: FormData) =>
    httpRequest<{ url: string }>(f('/food/photo'), { method: 'POST', auth: true, form }),
  upsertRestaurant: (body: Record<string, unknown>) =>
    http.post<{ message: string; status: string; restaurantId?: string }>(f('/food/restaurants'), body, true),
  myMenu: () => http.get<FoodMenuItem[]>(f('/food/menu/mine'), true),
  createMenuItem: (body: Record<string, unknown>) =>
    http.post<{ message: string; itemId: string; status: string }>(f('/food/menu'), body, true),
  updateMenuItem: (id: string, body: Record<string, unknown>) =>
    http.put<{ message: string }>(f(`/food/menu/${id}`), body, true),
  setItemAvailable: (id: string, available: boolean) =>
    http.put<{ message: string }>(f(`/food/menu/${id}/available`), { available }, true),
  /** La FOTO de un plato se pone o se cambia cuando haga falta: el servidor lo permite en
   *  cualquier estado y, si SOLO cambia la foto, el plato NO vuelve a revisión ni pierde su
   *  estado. Es lo único que se puede tocar fuera de la moderación, porque no cambia lo que se
   *  vende: cambia cómo se ve. */
  setItemPhoto: (id: string, photos: string[]) =>
    http.put<{ message: string }>(f(`/food/menu/${id}`), { photos }, true),
  deleteMenuItem: (id: string) =>
    httpRequest<{ message: string }>(f(`/food/menu/${id}`), { method: 'DELETE', auth: true }),
  /**
   * Crear pedido. Con pago por MONEDERO (parche 98) el servidor exige el token de pago
   * (PIN, scope ESCROW_LOCK, importe EXACTO) en `X-Payment-Token`: el importe queda en
   * garantía y el restaurante cobra en su monedero al entregar. El token es de un solo uso.
   */
  createOrder: (body: { restaurantId: string; items: Array<{ itemId: string; qty: number }>; paymentMethod?: 'cash' | 'billing' | 'likebook_wallet'; pickupType?: 'pickup' | 'delivery'; deliveryAddress?: string; note?: string; scheduledFor?: string | null; deliveryLat?: number | null; deliveryLng?: number | null }, paymentToken?: string) =>
    httpRequest<{ message: string; order: FoodOrder; billingOrderId: string | null; fees?: OrderFees }>(f('/food/orders'), {
      method: 'POST',
      body,
      auth: true,
      ...(paymentToken ? { headers: { 'X-Payment-Token': paymentToken } } : {}),
    }),
  myOrders: (as: 'user' | 'owner' = 'user', q: Record<string, string> = {}) => {
    const qs = new URLSearchParams({ as, ...q }).toString();
    return http.get<FoodOrdersPage>(f(`/food/orders?${qs}`), true);
  },
  updateStatus: (id: string, status: string, as: 'user' | 'owner') =>
    http.put<{ message: string }>(f(`/food/orders/${id}/status`), { status, as }, true),
  review: (id: string, rating: number, comment?: string) =>
    http.post<{ message: string }>(f(`/food/orders/${id}/review`), { rating, comment }, true),
  riderMe: () => http.get<FoodRiderMe>(f('/food/rider/me'), true),
  upsertRider: (body: Record<string, unknown>) =>
    http.post<{ message: string; status: string; riderId?: string }>(f('/food/rider'), body, true),
  activeRiders: () => http.get<FoodRider[]>(f('/food/riders/active'), true),
  assignRider: (id: string, riderId: string) =>
    http.put<{ message: string }>(f(`/food/orders/${id}/rider`), { riderId }, true),
  updateDelivery: (id: string, status: string) =>
    http.put<{ message: string }>(f(`/food/orders/${id}/delivery/status`), { status }, true),
  /** El REPARTIDOR asignado anota el punto de encuentro al llegar. `lat`/`lng` son su ubicación en ese
   *  momento (opcionales: sin GPS el texto sigue sirviendo). El servidor solo lo acepta si la entrega
   *  es suya y no está cerrada, y avisa al cliente por SMS. */
  setMeetingPoint: (id: string, body: { note: string; lat?: number | null; lng?: number | null }) =>
    http.put<{ ok: boolean; meetingNote: string; meetingLat: number | null; meetingLng: number | null }>(
      f(`/food/orders/${id}/delivery/meeting`), body, true),

  // ── EL DINERO DEL REPARTIDOR ─────────────────────────────────────────────────
  /** Su contabilidad de la semana: entregas, comisiones, efectivo cobrado y qué le corresponde.
   *  La regla del dueño la aplica el servidor: `aPagarXaf` nunca es negativo y lo que sobra queda
   *  como `deudaArrastradaXaf`. */
  riderContabilidad: (desde?: string) =>
    http.get<ContabilidadRepartidor>(f(`/food/rider/contabilidad${desde ? `?desde=${desde}` : ''}`), true),
  /** Anota el efectivo que ha cobrado en la puerta de una entrega. Es lo ÚNICO que escribe el
   *  repartidor: su comisión la calcula el servidor con el desglose congelado del pedido. */
  riderAnotarCobro: (orderId: string, cashCollectedXaf: number) =>
    http.post<{ message: string }>(f('/food/rider/cobro'), { orderId, cashCollectedXaf }, true),
};
