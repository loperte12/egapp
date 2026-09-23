/**
 * LA TARJETA DE LA TIENDA EN EL PERFIL (tanda A del plan aprobado).
 *
 * Qué resuelve: cuando alguien entra al perfil de una cuenta con tienda, entre la bio y los
 * botones aparece un escaparate rápido con el nombre COMERCIAL de la tienda, su puntuación
 * (solo si tiene reseñas) y hasta 3 productos destacados elegidos a mano por el comerciante,
 * con el precio encima de la foto. Tocar uno NO abre la ficha del producto: abre la tienda
 * posicionada en ese producto (es un atajo, no un destino final).
 *
 * Vive en su propio fichero, como `lifebookGrupos.ts` y `lifebookWatch.ts`, para no tocar
 * `api/lifebook.ts` (que el dueño pidió no tocar) ni `api/commerce.ts`.
 */
import { http, httpRequest } from './httpClient';
import type { LbPriceMode, LbProductCard } from './commerce';

/** Datos de la tienda para la cabecera de la tarjeta. */
export interface LbTiendaDelPerfil {
  id: string;
  ownerId: string;
  /** El nombre COMERCIAL, que no es el nombre del usuario. */
  name: string;
  logoUrl: string | null;
  coverUrl: string | null;
  description: string | null;
  city: string | null;
  isVerified: boolean;
  rating: number;
  /**
   * OJO: es el campo que decide si se enseñan estrellas. Sin reseñas (`ratingCount === 0`)
   * NO se pinta puntuación — la especificación lo prohíbe expresamente («no pone 0 estrellas
   * ni un placeholder»). El servidor manda `rating` de todas formas porque una tienda puede
   * tener media histórica; quien decide es este contador.
   */
  ratingCount: number;
  followersCount: number;
}

/** Un producto destacado (lo justo para la miniatura con el precio encima). */
export interface LbDestacado {
  id: string;
  title: string;
  shortDescription: string | null;
  /** Igual que en la ficha y el catálogo: `fixed` (precio), `from` (desde) o `on_request`. */
  priceMode: LbPriceMode;
  priceXaf: number | null;
  oldPriceXaf: number | null;
  currency: string;
  coverUrl: string | null;
  salesCount: number;
  rating: number;
  ratingCount: number;
  /** 1, 2 o 3: el orden que eligió el comerciante. */
  position: number;
}

export interface LbTarjetaDeTienda {
  /** `null` si esa persona no tiene tienda activa: entonces NO hay tarjeta ni hueco. */
  shop: LbTiendaDelPerfil | null;
  featured: LbDestacado[];
}

export const tiendaApi = {
  /** La tarjeta completa en UNA petición. Es pública (se mira el perfil de cualquiera). */
  tarjeta: (userId: string) =>
    http.get<LbTarjetaDeTienda>(`/lifebook/commerce/users/${userId}/shop-card`),

  /**
   * Las categorías que ESA tienda usa de verdad, con cuántos productos hay en cada una.
   * Se piden a la tienda y no a la plataforma: las 193 categorías generales no sirven para
   * una fila de chips (y un chip que lleva a una rejilla vacía es una trampa).
   * «Todo» NO viene de aquí: lo pone la pantalla con `total`.
   */
  categorias: (shopId: string) =>
    http.get<{ total: number; categories: { id: string; name: string; icon: string | null; count: number }[] }>(
      `/lifebook/commerce/shops/${shopId}/categories`,
    ),

  /** Los productos de la tienda, filtrados por categoría y paginados. */
  productos: (shopId: string, opts: { categoryId?: string | null; cursor?: string | null; limit?: number } = {}) => {
    const q: string[] = [`limit=${opts.limit ?? 30}`];
    if (opts.categoryId) q.push(`categoryId=${opts.categoryId}`);
    if (opts.cursor) q.push(`cursor=${encodeURIComponent(opts.cursor)}`);
    return http.get<{ items: LbProductCard[]; nextCursor: string | null; total: number }>(
      `/lifebook/commerce/shops/${shopId}/products?${q.join('&')}`,
    );
  },

  /**
   * «Colección»: los productos que YO he guardado. Solo tiene sentido en el perfil propio
   * (en el de otro haría falta decidir si sus guardados son públicos, y eso es una decisión
   * de privacidad, no de diseño: por eso el tab solo sale en mi perfil).
   */
  guardados: () => http.get<{ items: LbProductCard[] }>('/lifebook/commerce/my/saved'),

  /**
   * Elegir los destacados (solo el dueño; la tienda sale de la sesión, no del cuerpo).
   * Los ids van EN ORDEN: el primero se ve primero. Máximo 3; lo que no venga, se apaga.
   */
  destacar: (productIds: string[]) =>
    httpRequest<LbTarjetaDeTienda>('/lifebook/commerce/my/shop/featured', {
      method: 'PUT',
      body: { productIds },
    }),
};
