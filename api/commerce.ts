/**
 * api/commerce.ts — cliente del módulo de COMERCIO de Life Book (Parte 33).
 *
 * Rutas reales (mismo montaje que el resto de Life Book):
 *   https://hk.egrouteplan.com/wallet/api/v1/lifebook/commerce/*
 * El producto/servicio vive en la tienda del usuario autenticado: el servidor
 * saca el dueño del token, así que aquí nunca se manda un `ownerId`.
 */
import { http, httpRequest } from './httpClient';

// ────────────────────────────── tipos ────────────────────────────────────────
export type LbServiceType = 'physical' | 'food' | 'hotel_room' | 'rental' | 'job' | 'local_service';
export type LbPriceMode = 'fixed' | 'from' | 'on_request';
export type LbStockMode = 'exact' | 'approximate' | 'on_request' | 'unlimited';
export type LbCondition = 'new' | 'used' | 'made_to_order';
export type LbProductStatus = 'draft' | 'pending' | 'active' | 'rejected' | 'hidden' | 'sold_out';
export type LbPayMethod = 'cash_on_delivery' | 'billing' | 'likebook_wallet' | 'in_store' | 'deposit' | 'transfer';
export type LbVerificationLevel = 'basic' | 'verified' | 'recommended';

/** Atributo que el formulario debe pintar (viene de la categoría elegida). */
export interface LbCategoryAttribute {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'bool' | 'select';
  options?: string[];
}

export interface LbCategory {
  id: string;
  code: string;
  name: string;
  icon: string | null;
  serviceType: LbServiceType;
  defaultAttributes: LbCategoryAttribute[];
  /**
   * MERCADO (tanda K) — los EJES DE ELECCIÓN que sugiere la categoría (ropa propone Talla + Color;
   * calzado, tallas de zapato; teléfonos, almacenamiento + color…). Igual que `defaultAttributes`,
   * es una sugerencia: el comerciante añade el eje de un toque y luego lo ajusta.
   *
   * OJO: aquí los valores vienen como **texto suelto** (`["XS","S","M"]`), porque es lo que hay
   * guardado en `categories.default_options`; los ejes de un producto ya usan objetos con su foto.
   * El tipo lo dice para que nadie lea `v.value` de una cadena y publique «undefined».
   */
  defaultOptions?: LbOptionSuggestion[];
  children?: LbCategory[];
}

/** Un eje SUGERIDO por la categoría: sus valores pueden venir como texto o ya como objeto. */
export interface LbOptionSuggestion {
  code: string;
  label: string;
  kind: LbOptionKind;
  chartKind?: LbSizeKind | null;
  values?: (string | LbOptionValue)[];
}

/**
 * MERCADO (tanda K) — LOS EJES DE ELECCIÓN DE UN PRODUCTO.
 *
 * Lo que el comprador elige antes de comprar: «Color», «Talla», «Almacenamiento», «Formato»,
 * «Tono», «Medida»… Hasta ahora la ficha solo podía enseñar el `name` de la variante («Talla 42»)
 * y los botones Comprar/Añadir al carrito compraban DIRECTO con la primera que apareciera.
 *
 * En un eje de color, **cada valor lleva su foto real del producto en ese color** (`imageUrl`): el
 * servidor no admite un color sin foto ni una foto que no sea de ese producto. No es un adorno: es
 * la diferencia entre elegir «Rojo» y ver la prenda roja.
 */
export type LbOptionKind = 'color' | 'size' | 'text';

export interface LbOptionValue {
  value: string;
  label?: string | null;
  imageUrl?: string | null;
  hex?: string | null;
}

export interface LbOptionGroup {
  id?: string;
  code: string;
  label: string;
  kind: LbOptionKind;
  /** Solo en los ejes de talla: contra qué tabla se recomienda (top/bottom/dress/shoes/…). */
  chartKind?: LbSizeKind | null;
  values: LbOptionValue[];
}

/** Lo mismo, pero como lo manda la app al publicar o al guardar. */
export type LbOptionGroupInput = LbOptionGroup;

/** Tipo de prenda de una tabla de tallas (el mismo vocabulario que el servidor). */
export type LbSizeKind = 'top' | 'bottom' | 'dress' | 'shoes' | 'accessory' | 'other';
export type LbSizeGender = 'women' | 'men' | 'unisex';

/** Una talla con sus RANGOS en cm/kg (una talla no es un número exacto: es un intervalo). */
export interface LbSizeRow {
  sizeLabel: string;
  chestMinCm?: number | null;
  chestMaxCm?: number | null;
  waistMinCm?: number | null;
  waistMaxCm?: number | null;
  hipMinCm?: number | null;
  hipMaxCm?: number | null;
  heightMinCm?: number | null;
  heightMaxCm?: number | null;
  weightMinKg?: number | null;
  weightMaxKg?: number | null;
  footLengthMinCm?: number | null;
  footLengthMaxCm?: number | null;
  footWidthMinCm?: number | null;
  footWidthMaxCm?: number | null;
}

export interface LbSizeChart {
  gender: LbSizeGender;
  kind: LbSizeKind;
  notes?: string | null;
  rows: LbSizeRow[];
}

export interface LbProductMedia {
  url: string;
  type: 'image' | 'video';
  position: number;
  width?: number;
  height?: number;
}

export interface LbProductVariant {
  id?: string;
  name: string;
  priceXaf: number | null;
  stockQuantity: number;
  sku?: string | null;
  imageUrl?: string | null;
  weightG?: number | null;
  attributes?: Record<string, string | number | boolean>;
}

export interface LbPaymentMethodConfig {
  method: LbPayMethod;
  status: 'active' | 'pending_approval' | 'coming_soon' | 'disabled';
  note?: string | null;
}

export interface LbShippingPolicy {
  id: string;
  name: string;
  originCity: string | null;
  originBarrio?: string | null;
  originRegion: string | null;
  coverage: string[];
  transportModes: string[];
  estimatedTime: string | null;
  costMode: 'fixed' | 'calculated' | 'on_request';
  baseCostXaf: number;
  perKmXaf?: number;
  shipsInternational: boolean;
  internationalNote: string | null;
}

export interface LbShop {
  id: string;
  ownerId: string;
  name: string;
  logoUrl: string | null;
  coverUrl: string | null;
  categoryId: string | null;
  sellerType: 'local' | 'national' | 'international';
  country: string;
  city: string | null;
  barrio: string | null;
  region: 'continental' | 'insular' | 'other' | null;
  addressReference: string | null;
  lat: number | null;
  lng: number | null;
  description: string | null;
  contactMode: string;
  openingHours: Record<string, unknown>;
  verificationLevel: LbVerificationLevel;
  isVerified: boolean;
  rating: number;
  ratingCount: number;
  followersCount: number;
  isActive: boolean;
  ecomerse: boolean;
  createdAt: string;
  paymentMethods: LbPaymentMethodConfig[];
  shippingPolicies: LbShippingPolicy[];
  owner?: { id: string; name: string | null; avatarUrl: string | null; city: string | null };
  following?: boolean;
  followedByMe?: boolean;
  stats?: { products: number; sales: number; services: number; followers: number };
  activeProducts?: number;
  pendingProducts?: number;
}

export interface LbProduct {
  id: string;
  shopId: string;
  categoryId: string | null;
  serviceType: LbServiceType;
  title: string;
  shortDescription: string | null;
  longDescription: string | null;
  priceMode: LbPriceMode;
  priceXaf: number | null;
  oldPriceXaf: number | null;
  currency: string;
  stockMode: LbStockMode;
  stockQuantity: number;
  condition: LbCondition;
  status: LbProductStatus;
  rejectionReason: string | null;
  originCity: string | null;
  originBarrio: string | null;
  originRegion: string | null;
  shipsInternational: boolean;
  media: LbProductMedia[];
  tags: string[];
  rating: number;
  ratingCount: number;
  salesCount: number;
  viewsCount: number;
  savesCount: number;
  createdAt: string;
  publishedAt: string | null;
  variants: LbProductVariant[];
  /**
   * MERCADO (tanda K): los ejes de elección con sus valores (y la foto real de cada color). Vienen
   * en la MISMA lectura que las variantes, que es lo que el selector necesita a la vez para saber
   * qué combinación se puede comprar y cuál está agotada.
   */
  options?: LbOptionGroup[];
  attributes: { key: string; value: string }[];
  shippingPolicy: LbShippingPolicy | null;
  paymentMethods: LbPaymentMethodConfig[];
  shop: {
    id: string;
    ownerId?: string;
    name: string;
    logoUrl: string | null;
    coverUrl?: string | null;
    sellerType: string;
    verificationLevel: LbVerificationLevel;
    isVerified: boolean;
    city: string | null;
    barrio?: string | null;
    region: string | null;
    lat?: number | null;
    lng?: number | null;
    rating: number;
    ratingCount: number;
    followersCount: number;
  };
  isMine: boolean;
  savedByMe: boolean;
  /**
   * MERCADO (tanda G): `true` si esta persona pidió que se le avise cuando vuelva el stock
   * («avísame cuando llegue»). El aviso llega por el chat con la tienda.
   */
  watching?: boolean;
  /**
   * MERCADO (tanda H): cuántas personas esperan que vuelva a haber stock. **Solo llega al dueño**
   * (al comprador no se le enseña: es información de la tienda).
   */
  waitingCount?: number;
}

/** Tarjeta del catálogo (más ligera que la ficha). */
export interface LbProductCard {
  id: string;
  title: string;
  /**
   * El subtítulo que el comerciante escribe al publicar (`products.short_description`). Va
   * en la rejilla del catálogo y en el tab «Productos» del perfil; el texto LARGO no se manda
   * aquí. El servidor ya lo devolvía: solo faltaba en este tipo.
   */
  shortDescription?: string | null;
  /** Moneda del precio (el servidor manda 'XAF' si no hay otra). */
  currency?: string;
  serviceType: LbServiceType;
  priceMode: LbPriceMode;
  priceXaf: number | null;
  oldPriceXaf: number | null;
  condition: LbCondition;
  stockMode: LbStockMode;
  stockQuantity: number;
  coverUrl: string | null;
  media: LbProductMedia[];
  tags: string[];
  rating: number;
  ratingCount: number;
  salesCount: number;
  originCity: string | null;
  originRegion: string | null;
  shipsInternational: boolean;
  createdAt: string;
  shop: {
    id: string;
    name: string;
    logoUrl: string | null;
    city: string | null;
    region: string | null;
    isVerified: boolean;
    verificationLevel: LbVerificationLevel;
    rating: number;
    ratingCount: number;
  };
}

export interface LbProductPage {
  items: LbProductCard[];
  nextCursor: string | null;
  total: number;
}

/** Producto propio en el panel del comerciante (cualquier estado). */
export interface LbMyProductCard {
  id: string;
  title: string;
  serviceType: LbServiceType;
  status: LbProductStatus;
  rejectionReason: string | null;
  priceMode: LbPriceMode;
  priceXaf: number | null;
  coverUrl: string | null;
  stockMode: LbStockMode;
  stockQuantity: number;
  variants: number;
  viewsCount: number;
  savesCount: number;
  salesCount: number;
  /**
   * MERCADO (tanda H): cuánta gente está esperando que vuelva a haber stock. Es el dato que dice
   * si merece la pena reponer; 0 = nadie espera.
   */
  waitingCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LbShopInput {
  name: string;
  categoryId?: string | null;
  sellerType?: 'local' | 'national' | 'international';
  country?: string;
  city?: string;
  barrio?: string;
  region?: 'continental' | 'insular' | 'other';
  addressReference?: string;
  lat?: number;
  lng?: number;
  description?: string;
  logoUrl?: string | null;
  coverUrl?: string | null;
  paymentMethods?: LbPayMethod[];
  shippingPolicy?: {
    name?: string;
    coverage?: string[];
    transportModes?: string[];
    estimatedTime?: string;
    costMode?: 'fixed' | 'calculated' | 'on_request';
    baseCostXaf?: number;
    perKmXaf?: number;
    shipsInternational?: boolean;
    internationalNote?: string;
  } | null;
}

export interface LbProductInput {
  categoryId?: string | null;
  serviceType: LbServiceType;
  title: string;
  shortDescription?: string | null;
  longDescription?: string | null;
  priceMode?: LbPriceMode;
  priceXaf?: number | null;
  oldPriceXaf?: number | null;
  stockMode?: LbStockMode;
  stockQuantity?: number;
  condition?: LbCondition;
  originCity?: string;
  originBarrio?: string;
  originRegion?: 'continental' | 'insular' | 'other';
  shipsInternational?: boolean;
  shippingPolicyId?: string | null;
  media?: { url: string; type?: 'image' | 'video'; width?: number; height?: number }[];
  tags?: string[];
  variants?: LbProductVariant[];
  /**
   * MERCADO (tanda K): los ejes de elección. Si se mandan, cada variante tiene que decir su valor
   * en CADA eje (`variant.attributes = { color: 'Rojo', talla: 'M' }`): una talla que no existe en
   * el eje no se puede guardar (el servidor responde 400 y no escribe nada).
   */
  options?: LbOptionGroupInput[];
  attributes?: { key: string; value: string }[];
}

// ────────────────────────────── cliente ──────────────────────────────────────
const BASE = '/lifebook/commerce';

export const commerceApi = {
  // Público
  categories: () => http.get<{ categories: LbCategory[] }>(`${BASE}/categories`),
  catalog: (opts: {
    q?: string; city?: string; serviceType?: string; categoryId?: string;
    priceMin?: number; priceMax?: number; sort?: 'recent' | 'price_asc' | 'price_desc' | 'rating';
    cursor?: string; limit?: number; shopId?: string;
  } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(opts).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.append(k, String(v));
    });
    const q = qs.toString();
    return http.get<LbProductPage>(`${BASE}/catalog${q ? `?${q}` : ''}`);
  },
  /** Ficha pública (si hay sesión, además dice si es mía y si la guardé). */
  product: (id: string) => http.get<{ product: LbProduct }>(`${BASE}/products/${id}`),
  shop: (id: string) => http.get<{ shop: LbShop }>(`${BASE}/shops/${id}`),
  shopProducts: (id: string, opts: { cursor?: string; limit?: number; serviceType?: string } = {}) => {
    const qs = new URLSearchParams();
    if (opts.cursor) qs.append('cursor', opts.cursor);
    if (opts.limit) qs.append('limit', String(opts.limit));
    if (opts.serviceType) qs.append('serviceType', opts.serviceType);
    const q = qs.toString();
    return http.get<LbProductPage | { items: LbMyProductCard[] }>(`${BASE}/shops/${id}/products${q ? `?${q}` : ''}`);
  },

  // Mi tienda
  myShop: () => http.get<{ shop: LbShop | null }>(`${BASE}/my/shop`),
  createShop: (input: LbShopInput) => http.post<{ shop: LbShop }>(`${BASE}/shops`, input),
  updateShop: (input: Partial<LbShopInput>) => http.patch<{ shop: LbShop }>(`${BASE}/my/shop`, input),

  // Productos
  myProducts: () => http.get<{ items: LbMyProductCard[] }>(`${BASE}/my/products`),
  /**
   * Publicar. Parte 34: acepta la **clave de idempotencia** para que un doble
   * toque o un reintento de red no cree dos productos (el cliente de la app no
   * la mandaba: solo lo hacía el E2E). Se usa `httpRequest` porque `http.post`
   * solo admite `auth`, no cabeceras.
   */
  createProduct: (input: LbProductInput, idemKey?: string) =>
    httpRequest<{ product: LbProduct }>(`${BASE}/products`, {
      method: 'POST',
      body: input,
      ...(idemKey ? { headers: { 'Idempotency-Key': idemKey } } : {}),
    }),
  updateProduct: (id: string, input: Partial<LbProductInput>) =>
    http.put<{ product: LbProduct }>(`${BASE}/products/${id}`, input),

  /**
   * MERCADO (tanda K) — LOS EJES DE UN PRODUCTO.
   *
   * Es PÚBLICO porque lo necesita el selector que se abre al pulsar «Comprar» o «Añadir al
   * carrito»: hasta esta tanda esos dos botones compraban DIRECTO con la primera variante que
   * apareciera (`p.variants?.[0]`) y nadie elegía talla ni color. Devuelve los ejes con la foto de
   * cada color y las combinaciones con su precio y su stock, para saber qué está agotado.
   */
  options: (id: string) =>
    http.get<{ options: LbOptionGroup[]; variants: LbProductVariant[] }>(`${BASE}/products/${id}/options`),
  /**
   * El comerciante guarda los ejes de SU producto y, si los manda, las combinaciones con su precio
   * y su stock. **No devuelve la publicación a revisión** (a diferencia de `updateProduct`):
   * corregir el precio de una talla no puede costar la cola de moderación. Las combinaciones que ya
   * existían se actualizan en su sitio, así que a nadie se le vacía el carrito.
   */
  setOptions: (id: string, input: { options: LbOptionGroupInput[]; variants?: LbProductVariant[] }) =>
    http.put<{ options: LbOptionGroup[]; variants: LbProductVariant[] }>(`${BASE}/products/${id}/options`, input),

  // Tallas y medidas (tanda J)
  /** Las tablas de tallas del producto, con sus rangos en cm/kg (público). */
  sizeChart: (id: string) => http.get<{ charts: LbSizeChart[] }>(`${BASE}/products/${id}/size-chart`),
  /** El comerciante guarda las tablas de SU producto. Se reemplazan enteras. */
  setSizeChart: (id: string, charts: LbSizeChart[]) =>
    http.put<{ charts: LbSizeChart[] }>(`${BASE}/products/${id}/size-chart`, { charts }),
  /**
   * Acciones del vendedor sobre su propio producto. Parte 39: se añade
   * `publish` (enviar a revisión), que es la única forma de volver a publicar
   * algo rechazado o en borrador — el servidor ya no deja autoaprobarse.
   */
  setProductStatus: (id: string, action: 'hide' | 'activate' | 'sold_out' | 'draft' | 'publish') =>
    http.patch<{ id: string; status: LbProductStatus }>(`${BASE}/products/${id}/status`, { action }),
  deleteProduct: (id: string) =>
    httpRequest<{ deleted: boolean; id: string }>(`${BASE}/products/${id}`, { method: 'DELETE' }),

  // Guardados y seguidores
  toggleSave: (id: string) => http.post<{ saved: boolean }>(`${BASE}/products/${id}/save`, {}),
  mySaved: () => http.get<{ items: LbProductCard[] }>(`${BASE}/my/saved`),
  toggleFollow: (shopId: string) => http.post<{ following: boolean }>(`${BASE}/shops/${shopId}/follow`, {}),

  /**
   * MERCADO (tanda F) — HISTORIAL DE PRODUCTOS.
   *
   * Lo que la persona ha mirado, lo último primero, con **la misma tarjeta del catálogo** (el
   * servidor usa la misma función) más `viewedAt`, `times` y `available`. Los que ya no están a la
   * venta vienen con `available: false`: se dicen, no se esconden.
   */
  misVistos: (limit = 40) => http.get<{ items: LbViewedProduct[]; total: number }>(`${BASE}/my/views?limit=${limit}`),
  /**
   * Apuntar que he mirado este producto. Es una llamada PROPIA y con sesión a propósito: la ficha
   * (`GET products/:id`) es pública, así que con el token caducado salía sin identidad y la visita
   * se perdía en silencio (visto en el teléfono: un 401 en `my/cart`, un 200 anónimo en la ficha y
   * la tabla vacía). Con sesión, un 401 dispara el refresco y el reintento que ya existen.
   */
  registrarVista: (id: string) => http.post<{ ok: boolean; registrada: boolean; motivo?: string }>(`${BASE}/products/${id}/view`, {}),
  /** Vaciar mi historial de productos. */
  borrarVistos: () =>
    httpRequest<{ ok: boolean; deleted: number }>(`${BASE}/my/views`, { method: 'DELETE' }),
};

/** Un producto del historial: la tarjeta del catálogo + lo propio del historial. */
export interface LbViewedProduct extends LbProductCard {
  /** Última vez que abrió la ficha. */
  viewedAt: string;
  /** Cuántas veces la ha abierto. */
  times: number;
  /** `false` si ya no está a la venta: la rejilla lo dice y no deja comprarlo. */
  available: boolean;
}

// ────────────────────────────── pedidos ──────────────────────────────────────
export type LbOrderStatus = 'created' | 'confirmed' | 'preparing' | 'in_transit' | 'ready_pickup'
  | 'delivered' | 'cancelled' | 'disputed'
  // estados del modelo antiguo (pedidos de publicaciones) para no romper la lista
  | 'requested' | 'accepted' | 'declined';

export interface LbOrderItem {
  id: string;
  productId: string | null;
  variantId: string | null;
  titleSnapshot: string;
  variantSnapshot: string | null;
  mediaUrl: string | null;
  quantity: number;
  unitPriceXaf: number;
  lineTotalXaf: number;
}

export interface LbOrder {
  id: string;
  code: string;
  status: LbOrderStatus;
  role: 'buyer' | 'seller' | 'admin';
  paymentMethod: LbPayMethod;
  paymentStatus: string;
  deliveryMode: string;
  deliveryAddress: { city?: string; zone?: string; reference?: string; lat?: number; lng?: number };
  deliveryCostXaf: number;
  subtotalXaf: number;
  /** TANDA Q: lo que quitó el cupón (0 si no se usó ninguno). */
  discountXaf: number;
  /** El código del cupón que se aplicó, si hubo. */
  couponCode: string | null;
  totalXaf: number;
  /** 🔒 Solo llega al comprador (es él quien lo entrega al recibir). */
  deliveryCode: string | null;
  note: string | null;
  items: LbOrderItem[];
  shop: { id: string; name: string; logoUrl: string | null; ownerId: string } | null;
  buyer?: { id: string; name: string | null; avatarUrl: string | null };
  createdAt: string;
  updatedAt?: string;
  paidAt?: string | null;
  /**
   * TANDA R (R.5b): con qué se dio por cobrado cuando lo marca la tienda a mano (transferencia,
   * facturación, depósito). El justificante es un enlace a la foto ya subida y la nota lleva la
   * referencia del recibo. Las dos cosas las ven el comprador y la tienda: el rastro es de los dos.
   */
  paymentProofUrl?: string | null;
  paymentNote?: string | null;
  /**
   * TANDA T (T.7): la valoración del pedido, si el comprador ya la escribió. Mueve la nota de la tienda
   * y de los productos del pedido (media ponderada con los votos que ya había).
   */
  review?: { id: string; rating: number; comment: string | null; createdAt: string } | null;
  /**
   * TANDA T (T.7b): la reclamación del comprador, con su motivo y su fecha. Antes se abría sin guardar
   * nada y la tienda no sabía qué se le reclamaba.
   */
  disputeReason?: string | null;
  disputedAt?: string | null;
  deliveredAt?: string | null;
}

/**
 * EL DINERO DE UNA TIENDA (panel del comerciante; decisión del dueño, 18/09/2026).
 *
 * `pendienteXaf` es lo que **ya se le puede pagar**; `enEsperaXaf` es el dinero de pedidos entregados
 * hace menos de 7 días, que espera a que venza la ventana de reclamación del comprador.
 */
export interface LbSaldoTienda {
  shop: { id: string; name: string };
  tiendas: { id: string; name: string }[];
  pedidos: number;
  facturadoXaf: number;
  comisionXaf: number;
  aPagarTotalXaf: number;
  pendienteXaf: number;
  pendientePedidos: number;
  enEsperaXaf: number;
  enEsperaPedidos: number;
  liquidaciones: {
    id: string;
    desde: string | null;
    hasta: string;
    importeXaf: number;
    pedidos: number;
    estado: string;
    pagadoAt: string;
    nota: string | null;
  }[];
}

export interface LbOrderCard {
  id: string;
  code: string;
  status: LbOrderStatus;
  paymentMethod: LbPayMethod | null;
  paymentStatus: string;
  deliveryMode: string | null;
  totalXaf: number;
  deliveryCostXaf: number;
  itemsCount: number;
  title: string;
  mediaUrl: string | null;
  shop: { id: string; name: string; logoUrl: string | null } | null;
  buyer?: { id: string; name: string | null };
  note: string | null;
  createdAt: string;
}

export interface LbCreateOrderInput {
  items: { productId: string; variantId?: string | null; quantity: number }[];
  deliveryMode: string;
  deliveryAddress?: { city?: string; zone?: string; reference?: string; lat?: number; lng?: number };
  paymentMethod: LbPayMethod;
  note?: string;
  /**
   * TANDA Q: el código del cupón que se quiere aplicar. **El descuento lo calcula el servidor** al
   * crear el pedido; aquí solo viaja el código (la app no decide dinero).
   */
  couponCode?: string | null;
  /**
   * MERCADO (tanda E): conversación donde nació la compra. Si es un **grupo** del que el comprador
   * es miembro, el servidor publica ahí la tarjeta del pedido con el aviso social
   * («✅ {nombre} compró {producto}»). El chat con la tienda recibe la tarjeta siempre.
   */
  conversationId?: string;
}

const ORDERS = `${BASE}/orders`;
const MERCHANT = '/lifebook/merchant';

export const commerceOrdersApi = {
  /**
   * Crear pedido. La clave de idempotencia la genera quien llama y es OBLIGATORIA.
   *
   * `paymentToken` (parche 97): con pago por MONEDERO el servidor exige un token de pago
   * (PIN, scope ESCROW_LOCK, importe EXACTO del pedido) en `X-Payment-Token`; se consume
   * al retener el dinero, así que uno robado no sirve dos veces.
   */
  create: (input: LbCreateOrderInput, idemKey: string, paymentToken?: string) =>
    httpRequest<{ order: LbOrder }>(ORDERS, {
      method: 'POST',
      body: input,
      headers: {
        'Idempotency-Key': idemKey,
        ...(paymentToken ? { 'X-Payment-Token': paymentToken } : {}),
      },
    }),
  mine: (side: 'buyer' | 'seller' = 'buyer') =>
    http.get<{ side: string; orders: LbOrderCard[] }>(`${ORDERS}/mine?side=${side}`),
  detail: (id: string) => http.get<{ order: LbOrder }>(`${ORDERS}/${id}`),
  /**
   * Acción sobre el pedido. `reason` solo hace falta para `dispute`: desde la TANDA T (T.7b) el motivo
   * es obligatorio (mínimo 10 letras) porque una reclamación sin motivo no se puede atender.
   */
  action: (id: string, action: 'accept' | 'decline' | 'prepare' | 'send' | 'ready' | 'deliver' | 'cancel' | 'dispute', reason?: string) =>
    http.patch<{ order: LbOrder }>(`${ORDERS}/${id}/action`, reason ? { action, reason } : { action }),
  /** El vendedor confirma la entrega con el código que le da el comprador. */
  confirmCode: (id: string, code: string) =>
    http.post<{ order: LbOrder }>(`${ORDERS}/${id}/confirm-code`, { code }),
  /**
   * «ESCRIBIR A LA TIENDA»: vuelve a poner la **tarjeta de ESE pedido** en el chat comprador↔tienda y
   * devuelve la conversación, para abrirla directamente.
   *
   * POR QUÉ: la tarjeta se publica al crear el pedido, así que en una conversación con varias compras
   * el comerciante no sabía de cuál se le hablaba — y en un pedido anterior a la tarjeta no había
   * ninguna. Lo reportó el dueño.
   */
  publicarTarjeta: (id: string) =>
    http.post<{ ok: boolean; conversationId: string }>(`${ORDERS}/${id}/chat-card`, {}),
  /**
   * «MARCAR COBRADO» (TANDA R, R.5b): la tienda cierra el cobro de lo que se paga **por fuera** —
   * transferencia, facturación, depósito—. Contra entrega y pago en tienda ya se cierran solos al
   * entregar; esto es para lo demás, que si no se quedaba `pending` para siempre y el vendedor no veía
   * esa caja. Solo lo puede llamar la tienda del pedido.
   *
   * El justificante es opcional (puede no haber recibo); se manda el enlace de la foto ya subida.
   */
  marcarCobrado: (id: string, body: { proofUrl?: string | null; note?: string | null }) =>
    http.post<{ order: LbOrder }>(`${ORDERS}/${id}/mark-paid`, body),
  /**
   * «VALORAR» (TANDA T, T.7): el comprador puntúa (1-5) un pedido **entregado**, con un comentario
   * opcional. Una sola vez por pedido: el servidor corta el segundo intento.
   *
   * Es lo que enciende `rating`/`rating_count` de la tienda y de los productos, que existían desde
   * siempre y **no los escribía nadie**.
   */
  valorar: (id: string, body: { rating: number; comment?: string | null }) =>
    http.post<{ order: LbOrder }>(`${ORDERS}/${id}/review`, body),
  /**
   * EL DINERO DE MI TIENDA (panel del comerciante, decisión del dueño 18/09/2026).
   *
   * Devuelve lo facturado, la comisión de la plataforma, lo que hay que pagarle a la tienda y sus
   * liquidaciones. **`pendienteXaf` es lo que ya se le puede pagar** y **`enEsperaXaf` lo que todavía
   * no**: el dinero de los pedidos entregados hace menos de 7 días, porque el comprador aún puede
   * reclamar (ventana de reclamación).
   */
  saldo: (shopId?: string) =>
    http.get<LbSaldoTienda>(`/lifebook/commerce/money/balance${shopId ? `?shopId=${shopId}` : ''}`),
  /**
   * CERRAR EL COSTE DEL REPARTO (decisión del dueño: que el envío entre en el total).
   *
   * Cuando la tienda tiene el envío «a acordar» o «según la distancia», el pedido nace con reparto 0 y
   * ese dinero se movía por fuera y sin rastro. Con esto la tienda lo cierra **antes de entregar**: entra
   * en el total y, al entregar, queda anotado en el libro como `a_pagar_reparto`.
   *
   * El servidor no deja cambiarlo si el pedido ya está cobrado, entregado, cancelado o en reclamación.
   */
  cerrarReparto: (id: string, deliveryCostXaf: number) =>
    http.patch<{ order: LbOrder }>(`${ORDERS}/${id}/delivery-cost`, { deliveryCostXaf }),
};

// ────────────────────────────── cupones ──────────────────────────────────────
/**
 * TANDA Q — EL CUPÓN DE UNA TIENDA.
 *
 * El descuento que se cobra lo decide **siempre el servidor** al crear el pedido. Aquí se calcula
 * solo para ENSEÑARLO antes de pagar, con la misma regla y en una sola función
 * (`descuentoDeCupon`), para que la pantalla y el cobro no puedan decir cosas distintas.
 */
export interface LbCupon {
  id: string;
  code: string;
  title: string;
  /** `percent` (tanto por ciento) o `amount` (XAF). */
  kind: 'percent' | 'amount' | string;
  value: number;
  minSubtotalXaf: number;
  /** De qué tienda es: un cupón solo vale en los pedidos de SU tienda. */
  shopId?: string | null;
  shopName?: string | null;
  /** `false` = no se puede usar ahora mismo; `reason` dice por qué (lo pone el servidor). */
  usable?: boolean;
  reason?: string | null;
  expiresAt?: string | null;
}

/**
 * El descuento de un cupón sobre un subtotal. MISMA REGLA QUE EL SERVIDOR:
 *  · `percent` → se redondea HACIA ABAJO (el céntimo no se lo queda nadie por redondeo),
 *  · `amount` → el valor tal cual,
 *  · y nunca más que la compra: un cupón no puede dejar el pedido en negativo.
 */
export function descuentoDeCupon(c: LbCupon | null | undefined, subtotalXaf: number): number {
  if (!c) return 0;
  const valor = Number(c.value ?? 0) || 0;
  const bruto = String(c.kind) === 'percent' ? Math.floor((subtotalXaf * valor) / 100) : valor;
  return Math.max(0, Math.min(bruto, subtotalXaf));
}

/** ¿Sirve este cupón para ESTA compra? Espejo de lo que comprueba el servidor al cobrar. */
export function cuponAplicable(c: LbCupon, subtotalXaf: number): { ok: boolean; motivo: string | null } {
  if (c.usable === false) return { ok: false, motivo: c.reason ?? 'No se puede usar' };
  const minimo = Number(c.minSubtotalXaf ?? 0) || 0;
  if (minimo > 0 && subtotalXaf < minimo) return { ok: false, motivo: `Desde ${minimo} XAF` };
  if (descuentoDeCupon(c, subtotalXaf) <= 0) return { ok: false, motivo: 'No rebaja nada aquí' };
  return { ok: true, motivo: null };
}

export const cuponesApi = {
  /** MIS cupones recogidos, con el estado real (el servidor ya dice cuáles sirven y por qué no). */
  mios: () => http.get<{ items: LbCupon[] }>('/lifebook/commerce/my/coupons'),
  /** Recoger un cupón por su código: queda en mi cuenta (no en el móvil). */
  recoger: (code: string) =>
    http.post<{ ok: boolean; alreadyHad: boolean; coupon: LbCupon & { mensaje?: string } }>(
      '/lifebook/commerce/coupons/claim', { code },
    ),
};

// ─────────────────── aviso de reposición («avísame cuando llegue») ───────────
/**
 * MERCADO (tanda G) — lo que espera a que vuelva el stock.
 *
 * Se apunta por **variante** cuando el producto tiene opciones: quien espera la «Talla 42» no
 * quiere que le avisen por la «Talla 40». El aviso llega por el chat con la tienda, y solo cuando
 * de verdad hay existencias.
 */
export const avisoStockApi = {
  /** Pedir el aviso. Si ya se puede comprar, el servidor lo dice y NO apunta nada. */
  vigilar: (productId: string, variantId?: string | null) =>
    http.post<{ ok: boolean; watching: boolean; available: boolean; mensaje?: string }>(
      `${BASE}/products/${productId}/interest`,
      { ...(variantId ? { variantId } : {}) },
    ),
  /** Dejar de esperar. */
  dejarDeVigilar: (productId: string) =>
    httpRequest<{ ok: boolean; watching: boolean; quitadas: number }>(
      `${BASE}/products/${productId}/interest`,
      { method: 'DELETE' },
    ),
};

export { ApiError } from './httpClient';

// ─────────────────── tallas: mis medidas y la recomendación ─────────────────
/**
 * MERCADO (tanda J) — LAS MEDIDAS DE LA PERSONA.
 *
 * Por categoría **independiente**: `body` (ropa) y `feet` (calzado). Tener una no obliga a tener la
 * otra. **Nunca salen de la cuenta**: el comerciante solo ve la talla elegida, jamás las medidas.
 */
export type LbMeasureCategory = 'body' | 'feet';

export interface LbMeasurements {
  /**
   * La categoría ya **no hace falta**: desde la tanda L-ter las medidas son un juego único (altura,
   * peso y número de calzado juntos) y el servidor lo guarda entero cuando no se manda categoría.
   * Se sigue aceptando `body`/`feet` por compatibilidad.
   */
  category?: LbMeasureCategory;
  gender?: 'women' | 'men' | null;
  heightCm?: number | null;
  weightKg?: number | null;
  chestCm?: number | null;
  waistCm?: number | null;
  hipCm?: number | null;
  footLengthCm?: number | null;
  footWidthCm?: number | null;
}

export interface LbSizeSuggestion {
  size: string | null;
  fit?: 'ajustado' | 'perfecto' | 'holgado';
  reason: string;
  /** `false` = esa tienda todavía no ha configurado su tabla: no se inventa ninguna talla. */
  chartAvailable: boolean;
  matched?: Record<string, boolean | null>;
}

/**
 * Lo que devuelve el servidor con MIS medidas: **una por categoría**, y `null` si no hay.
 * (`{ body: {...} | null, feet: {...} | null }`.) No es una lista: tener medidas de cuerpo no obliga
 * a tener las del pie, y por eso cada categoría va por su lado.
 */
export interface LbMisMedidas {
  body: LbMeasurements | null;
  feet: LbMeasurements | null;
}

export const tallasApi = {
  /** Mis medidas guardadas (solo las ve su dueño). */
  misMedidas: () => http.get<LbMisMedidas>(`${BASE}/my/measurements`),
  /**
   * Guardar MIS medidas. **Se manda sin categoría** y el servidor lo guarda como un juego único
   * (altura, peso y número de calzado juntos): es lo que pidió el dueño — «van juntos, el guardado
   * será juntos». Basta con una medida para que se guarde.
   */
  guardarMedidas: (input: LbMeasurements) => http.put<LbMisMedidas>(`${BASE}/my/measurements`, input),
  /** Borrar TODAS mis medidas (o las de una categoría antigua, si se dice cuál). */
  borrarMedidas: (category?: LbMeasureCategory) =>
    httpRequest<LbMisMedidas & { ok: boolean; deleted: number }>(
      `${BASE}/my/measurements${category ? `?category=${category}` : ''}`,
      { method: 'DELETE' },
    ),
  /**
   * La recomendación de talla contra la tabla DEL PRODUCTO. Si esa tienda no la ha configurado, el
   * servidor lo dice (`chartAvailable: false`) en vez de inventarse una talla.
   */
  sugerir: (productId: string, input: {
    kind: LbSizeKind; gender: 'women' | 'men';
    heightCm?: number; weightKg?: number; chestCm?: number; waistCm?: number; hipCm?: number;
    footLengthCm?: number;
  }) => http.post<LbSizeSuggestion>(`${BASE}/products/${productId}/size-suggestion`, input),
};

// ───────────────────────── panel de la tienda ────────────────────────────────
/**
 * Resumen de «Mi tienda» (Parte 39). **Todo lo calcula el servidor**:
 *  · el «hoy» es el de **Malabo** (no UTC);
 *  · `money.paidTodayXaf` es dinero **entregado y cobrado**, no facturación
 *    pendiente (`money.pendingCodXaf` va aparte, «por cobrar»).
 */
export interface LbMerchantDashboard {
  shop: {
    id: string;
    name: string;
    logoUrl: string | null;
    coverUrl: string | null;
    city: string | null;
    barrio: string | null;
    region: string | null;
    isActive: boolean;
    verificationLevel: LbVerificationLevel;
    rating: number;
    ratingCount: number;
    followersCount: number;
    createdAt: string;
  } | null;
  alerts: {
    newOrders: number;
    activeOrders: number;
    disputed: number;
    pendingProducts: number;
    rejectedProducts: number;
    outOfStock: number;
    unreadMessages: number;
  } | null;
  orders: { today: number; active: number; delivered: number; cancelled: number; total: number } | null;
  money: { currency: 'XAF'; paidTodayXaf: number; paidMonthXaf: number; pendingCodXaf: number } | null;
  products: {
    total: number; active: number; pending: number; draft: number;
    hidden: number; soldOut: number; rejected: number; outOfStock: number;
  } | null;
  /** Las opiniones todavía no existen como tabla propia: se dice, no se inventa. */
  reviews: { available: boolean; rating: number; ratingCount: number } | null;
  serverDay: string | null;
  serverTime: string | null;
  generatedAt: string;
}

export interface LbQuickEditInput {
  priceXaf?: number | null;
  stockMode?: LbStockMode;
  stockQuantity?: number;
}

export interface LbQuickEditResult {
  id: string;
  title: string;
  status: LbProductStatus;
  priceMode: LbPriceMode;
  priceXaf: number | null;
  stockMode: LbStockMode;
  stockQuantity: number;
  /** El estado no cambió: la publicación sigue viva. */
  statusUnchanged: boolean;
}

/**
 * Panel de la tienda. El servidor saca la tienda del **token**: aquí no se manda
 * ningún `shopId`, así que es imposible administrar la tienda de otro.
 */
export const commerceMerchantApi = {
  dashboard: () => http.get<LbMerchantDashboard>(`${MERCHANT}/dashboard`),
  /** Precio y existencias sin devolver el producto a moderación. */
  quickEdit: (id: string, input: LbQuickEditInput) =>
    http.patch<LbQuickEditResult>(`${MERCHANT}/products/${id}/quick`, input),
};

