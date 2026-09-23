/**
 * PRODUCTOS DENTRO DE UNA NOTA (tanda C del plan aprobado).
 *
 * Qué resuelve: en Xiaohongshu el producto no vive solo en el catálogo, vive DENTRO del
 * contenido («mi rutina de mañana» y debajo, la crema que usa). Aquí no existía ningún vínculo
 * entre una publicación y un producto.
 *
 * Vive en su propio fichero, como `lifebookTienda.ts` y `lifebookWatch.ts`, para no tocar
 * `api/lifebook.ts` (que el dueño pidió no tocar). La publicación de la nota se hace por aquí
 * porque el `createNote` de ese fichero no admite `productIds`.
 */
import { http, httpRequest } from './httpClient';
import type { LbProductCard } from './commerce';
import type { LbCreateNoteInput, LbPostDetail, LbVideoInput } from './lifebook';

/** Un producto enganchado a una nota (lo justo para la barra o el sticker). */
export interface LbProductoEnNota {
  id: string;
  title: string;
  shortDescription: string | null;
  priceMode: 'fixed' | 'from' | 'on_request';
  priceXaf: number | null;
  oldPriceXaf: number | null;
  currency: string;
  coverUrl: string | null;
  salesCount: number;
  /** 1, 2, 3… el orden que eligió el autor. */
  position: number;
}

/** El tope que aplica el servidor (la especificación recomienda no pasar de 6-9). */
export const MAX_PRODUCTOS_POR_NOTA = 9;

export const productosEnNotaApi = {
  /** Los productos de una nota. La ruta es pública, como la nota. */
  deNota: (postId: string) =>
    http.get<{ products: LbProductoEnNota[] }>(`/lifebook/posts/${postId}/products`),

  /** Cambiarlos después de publicar (solo el autor). */
  guardar: (postId: string, productIds: string[]) =>
    httpRequest<{ products: LbProductoEnNota[] }>(`/lifebook/posts/${postId}/products`, {
      method: 'PUT',
      body: { productIds },
    }),

  /** Mis productos activos, para el selector del compositor. */
  misProductos: () => http.get<{ items: LbProductCard[] }>('/lifebook/commerce/my/products'),

  /**
   * TANDA D — mandar una TARJETA DE PRODUCTO a un chat.
   *
   * Es la misma ruta que usa la app para enviar mensajes (`POST /lifebook/chat/conversations/:id/messages`),
   * pero pasando por aquí se puede mandar `productId`: el `sendRich` de `api/lifebook.ts` (que no
   * se toca) solo reenvía unos campos fijos y el producto se perdería por el camino — comprobado:
   * el servidor respondía «Producto no válido» porque le llegaba el id vacío.
   */
  enviarAlChat: (
    conversationId: string,
    productId: string,
    opts: {
      /** Variante ya elegida por el cliente: la tarjeta la enseña («Talla: M · Color: Negro»). */
      variantLabel?: string | null;
      /** `true` cuando se manda al consultar desde la ficha del producto. */
      asking?: boolean;
    } = {},
  ) =>
    http.post<{ id: string; conversationId: string; kind: string; body?: string; createdAt?: string }>(
      `/lifebook/chat/conversations/${conversationId}/messages`,
      {
        kind: 'product',
        productId,
        ...(opts.variantLabel ? { productVariant: String(opts.variantLabel).slice(0, 80) } : {}),
        ...(opts.asking ? { productAsking: true } : {}),
      },
    ),

  /**
   * Publicar una nota CON productos dentro. Es la misma ruta que `lifebookApi.createNote`
   * (`POST /lifebook/posts`) con el campo `productIds` que aquel tipo no admite.
   */
  publicarNota: (input: LbCreateNoteInput & {
    productIds?: string[];
    /** TANDA I: el SITIO de la nota (POI). Sin sitio no puede salir en «cerca de mí». */
    placeName?: string; placeLat?: number; placeLng?: number;
  }) =>
    http.post<LbPostDetail>('/lifebook/posts', {
      body: input.body,
      ...(input.title?.trim() ? { title: input.title.trim() } : {}),
      ...(input.media?.length ? { media: input.media } : {}),
      city: input.city,
      ...(input.barrio?.trim() ? { barrio: input.barrio.trim() } : {}),
      ...(input.topics?.length ? { topics: input.topics } : {}),
      ...(input.coverRatio ? { coverRatio: input.coverRatio } : {}),
      ...(input.tone ? { tone: input.tone } : {}),
      ...(input.productIds?.length ? { productIds: input.productIds.slice(0, MAX_PRODUCTOS_POR_NOTA) } : {}),
      /* TANDA I: el sitio exacto (nombre + coordenadas). El servidor lo comprueba y, si las
         coordenadas no son válidas, no guarda nada: mejor sin POI que con uno falso. */
      ...(input.placeName?.trim() && Number.isFinite(input.placeLat) && Number.isFinite(input.placeLng)
        ? { placeName: input.placeName.trim().slice(0, 120), placeLat: input.placeLat, placeLng: input.placeLng }
        : {}),
      visibility: input.visibility ?? 'public',
    }),

  /**
   * TANDA C (bis) — publicar un VÍDEO con productos dentro.
   *
   * Misma ruta que `lifebookMediaApi.createVideo` (`POST /lifebook/posts/video`), pero con
   * `productIds`: el `createVideo` de `api/lifebook.ts` (que el dueño pidió no tocar) no acepta ese
   * campo, así que un vídeo solo podía llevar productos **por API**. El servidor ya lo soporta desde
   * la tanda C (`linkProducts`: solo productos activos de mi tienda, máximo 9).
   */
  publicarVideo: (input: LbVideoInput & { productIds?: string[] }) =>
    http.post<LbPostDetail>('/lifebook/posts/video', {
      ...input,
      ...(input.productIds?.length ? { productIds: input.productIds.slice(0, MAX_PRODUCTOS_POR_NOTA) } : {}),
    }),
};
