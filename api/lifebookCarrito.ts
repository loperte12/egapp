/**
 * EL CARRITO (tanda D, ampliado a carrito v2).
 *
 * Qué resuelve: en la ficha de un producto solo había UN botón («Reservar»/«Comprar», que lleva
 * a la caja de un producto). La especificación pide **«Añadir al carrito» y «Comprar ahora»**:
 * poder juntar varias cosas y decidir después.
 *
 * El carrito es **UNO SOLO y vive en la cuenta** (tabla `lifebook.cart_items` por usuario): no hay
 * «carrito del grupo» ni «carrito de la tienda», y por eso aparece igual en cualquier móvil.
 *
 * v2 (especificación del carrito):
 *   · el servidor devuelve los productos **agrupados por tienda** (`groups`), que es como se
 *     enseña y como se paga (un pedido por tienda);
 *   · cada línea trae su **estado** (`ok · agotado · no_disponible · eliminado`) y el precio de
 *     cuando se añadió (`addedPriceXaf`) para poder decir «Precio cambió»;
 *   · las operaciones van **por línea** (por su id), porque el mismo producto puede estar dos
 *     veces con variantes distintas.
 *
 * Vive en su propio fichero, como los demás módulos de estas tandas, para no tocar
 * `api/lifebook.ts` ni `api/commerce.ts`.
 */
import { http, httpRequest } from './httpClient';

export type LbEstadoLinea = 'ok' | 'agotado' | 'no_disponible' | 'eliminado';
export type LbFuenteLinea = 'ficha' | 'chat' | 'grupo' | 'live' | 'mercado';

/** Una línea del carrito, con lo que la pantalla necesita para pintarla. */
export interface LbLineaCarrito {
  id: string;
  /** `null` si la tienda borró el producto: la línea sobrevive como recordatorio. */
  productId: string | null;
  variantId: string | null;
  variantName: string | null;
  title: string;
  shortDescription: string | null;
  priceMode: 'fixed' | 'from' | 'on_request';
  /** Precio unitario de HOY (de la variante si la tiene). `null` = a consultar. */
  priceXaf: number | null;
  /** Precio del día en que se añadió: es con lo que se compara «Precio cambió». */
  addedPriceXaf: number | null;
  /** `true` si el precio de hoy no es el de cuando se añadió (se enseña el anterior tachado). */
  priceChanged: boolean;
  /** Precio anterior de la TIENDA (oferta): se tacha si lo hay. */
  oldPriceXaf: number | null;
  currency: string;
  coverUrl: string | null;
  serviceType: string;
  quantity: number;
  /** Tope real de esa línea (stock). 99 = la tienda no declara existencias. */
  maxQuantity: number;
  /** `null` si el precio es «a consultar»: entonces el total no es definitivo. */
  lineTotalXaf: number | null;
  /** `false` = no se puede pagar (y la casilla no responde). */
  available: boolean;
  status: LbEstadoLinea;
  /** El texto que se enseña cuando hay problema («Agotado», «Producto eliminado»…). */
  statusLabel: string | null;
  /** De dónde salió: es lo que permite «Precio del grupo» o «Precio de live». */
  sourceKind: LbFuenteLinea;
  sourceId: string | null;
  sourceLabel: string | null;
  /** `null` si el producto ya no existe (la tienda lo borró). */
  shop: { id: string; name: string; logoUrl: string | null; isVerified: boolean; verificationLevel?: string } | null;
  addedAt: string;
}

/** Un bloque de tienda: así se enseña el carrito y así se paga (un pedido por tienda). */
export interface LbGrupoCarrito {
  shop: { id: string; name: string; logoUrl: string | null; isVerified: boolean; verificationLevel?: string } | null;
  items: LbLineaCarrito[];
  count: number;
  subtotalXaf: number;
  /** Cuántas líneas de este bloque no se pueden pagar. */
  problems: number;
  /** Lo que esa tienda acepta de verdad (la caja del carrito lo necesita por bloque). */
  paymentMethods: { method: string; status: string }[];
  /** Las formas de entrega REALES de esa tienda (+ «recoger en tienda» siempre). */
  deliveryModes: string[];
  /** `false` si la tienda no envía a la zona del comprador (entonces solo hay recogida). */
  shipsToBuyer?: boolean;
  /** La cobertura declarada por la tienda (`same_city`, `national`…). */
  shippingCoverage?: string | null;
  /** El aviso para la pantalla cuando no llega: «Esta tienda solo entrega en Malabo · …». */
  shippingWarning?: string | null;
  /** Cómo se cobra el envío: `fixed` | `calculated` | `on_request` (null si no hay política). */
  deliveryCostMode: string | null;
  /** El coste fijo, si lo hay. */
  deliveryCostXaf: number | null;
}

export interface LbCarrito {
  groups: LbGrupoCarrito[];
  items: LbLineaCarrito[];
  /** Suma de unidades (para el globito del icono). */
  count: number;
  lines: number;
  /** Total de todo lo que tiene precio. */
  totalXaf: number;
  /** Total de lo que SÍ se puede pagar hoy (sin agotados ni eliminados). */
  totalDisponibleXaf: number;
  /** Líneas con algún problema. */
  problems: number;
  /** `true` si hay algo sin precio: el total NO es el definitivo. */
  hasOnRequest: boolean;
  /** Solo lo devuelve la acción en bloque: cuántos se movieron a favoritos. */
  movedToFavorites?: number;
}

export const carritoApi = {
  ver: () => http.get<LbCarrito>('/lifebook/commerce/my/cart'),

  /**
   * Añade o cambia la cantidad. Cantidad 1..99.
   *
   * `sourceKind`/`sourceId`/`sourceLabel` dicen DE DÓNDE se añade (ficha, chat, grupo, live,
   * mercado): es lo que luego permite enseñar «Precio del grupo» o «Precio de live». Añadir desde
   * el chat es **silencioso**: no manda ningún mensaje a la conversación.
   */
  anadir: (productId: string, opts: {
    variantId?: string | null; quantity?: number;
    sourceKind?: LbFuenteLinea; sourceId?: string | null; sourceLabel?: string | null;
  } = {}) =>
    http.post<LbCarrito>('/lifebook/commerce/my/cart', {
      productId,
      ...(opts.variantId ? { variantId: opts.variantId } : {}),
      quantity: opts.quantity ?? 1,
      ...(opts.sourceKind ? { sourceKind: opts.sourceKind } : {}),
      ...(opts.sourceId ? { sourceId: opts.sourceId } : {}),
      ...(opts.sourceLabel ? { sourceLabel: opts.sourceLabel } : {}),
    }),

  /** Cambia la cantidad de una línea (0 = quitarla). Por PRODUCTO: se queda por compatibilidad. */
  cantidad: (productId: string, quantity: number) =>
    httpRequest<LbCarrito>(`/lifebook/commerce/my/cart/${productId}`, { method: 'PATCH', body: { quantity } }),

  quitar: (productId: string) =>
    httpRequest<LbCarrito>(`/lifebook/commerce/my/cart/${productId}`, { method: 'DELETE' }),

  /** Cambia la cantidad y/o la variante de UNA línea (por su id). La cantidad 0 la quita. */
  linea: (lineId: string, patch: { quantity?: number; variantId?: string | null }) =>
    httpRequest<LbCarrito>(`/lifebook/commerce/my/cart/line/${lineId}`, { method: 'PATCH', body: patch }),

  /** Quita UNA línea (por su id). */
  quitarLinea: (lineId: string) =>
    httpRequest<LbCarrito>(`/lifebook/commerce/my/cart/line/${lineId}`, { method: 'DELETE' }),

  /**
   * Modo «Editar»: quitar varias líneas y/o moverlas a favoritos (guardados), en UNA operación.
   * «Mover a favoritos» las guarda en tu lista y las saca del carrito.
   */
  enBloque: (acciones: { remove?: string[]; toFavorites?: string[] }) =>
    http.post<LbCarrito>('/lifebook/commerce/my/cart/bulk', acciones),

  vaciar: () => httpRequest<LbCarrito>('/lifebook/commerce/my/cart', { method: 'DELETE' }),
};
