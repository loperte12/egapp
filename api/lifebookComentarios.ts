/**
 * Comentarios con PUBLICACIÓN ADJUNTA (una nota, un vídeo, una venta…).
 *
 * Vive en su propio fichero por lo mismo que `api/lifebookPostOps.ts`: `api/lifebook.ts`
 * está en la lista de ficheros que el dueño pidió no tocar, y todo esto es ADITIVO (nada
 * de lo que ya hay cambia). La hoja de comentarios solo importa
 * `comentariosConAdjuntoApi`, así que el día que se junten se puede mover allí sin tocar
 * la pantalla.
 *
 * Cómo funciona en el servidor: el comentario guarda una REFERENCIA a la publicación
 * (nunca una copia) y el servidor devuelve la tarjeta ya resuelta en `ref`.
 *   · Si quien mira NO puede ver la publicación adjunta, `ref` llega `null` a propósito:
 *     ni siquiera viaja el título, para no filtrar nada.
 *   · Si borran la publicación adjunta, el comentario SOBREVIVE como texto y `ref` vuelve
 *     a ser `null` (nada de enlaces rotos).
 *   · Solo se puede adjuntar lo que uno puede ver, y nunca la publicación que se está
 *     comentando (el servidor contesta 400 `CANNOT_ATTACH_SELF`).
 *   · El texto sigue siendo obligatorio aunque se adjunte.
 */
import { http } from './httpClient';
import type { LbCommentItem, LbPostBase } from './lifebook';
import type { HomeAd } from './ads';

/** Miniatura de una publicación (misma forma que en el resto del API). */
export interface LbAdjuntoMiniatura {
  id: string | null;
  url: string;
}

/** La tarjeta de la publicación que lleva dentro un comentario. */
export interface LbAdjuntoRef {
  id: string;
  /** note · video · sale · service · serie · podcast · debate … */
  type: string;
  title: string | null;
  /** Extracto corto para pintar. */
  preview: string;
  thumb: LbAdjuntoMiniatura | null;
  /** Solo en las ventas. */
  priceXaf?: number;
  /**
   * De quién es lo adjunto. Sin esto una cita no se puede rastrear (es lo que WeChat
   * consideró imprescindible al mejorar su «引用»), y además se puede estar adjuntando
   * algo de otra persona: hay que poder verlo.
   */
  author: { id: string; fullName: string | null; avatarUrl: string | null };
}

/**
 * Comentario con la tarjeta del adjunto. Es `LbCommentItem` más un campo: si no hay
 * adjunto (o no se puede ver), `ref` es `null`.
 */
export type LbComentarioConAdjunto = LbCommentItem & { ref?: LbAdjuntoRef | null };

/**
 * Una página de comentarios tal como la devuelve el servidor ahora mismo.
 *
 * `ad` es la **publicidad dentro de los comentarios** (lo de WeChat): el servidor
 * decide si toca y cuál (nunca para el autor, nunca con los comentarios cerrados,
 * nunca en un hilo de menos de 3 comentarios, y segmentada por la ciudad de quien
 * mira). Va en un campo APARTE a propósito: el anuncio **no** es un comentario, así
 * que no cuenta en `total` ni se mezcla con la lista.
 */
export interface LbPaginaComentarios {
  comments: LbComentarioConAdjunto[];
  nextCursor: string | null;
  total: number;
  ad: HomeAd | null;
}

export const comentariosConAdjuntoApi = {
  /**
   * La página de comentarios **con el adjunto y el anuncio**. Es la misma ruta que
   * `lifebookApi.postComments` (que no se toca), pero con el tipo completo.
   */
  pagina: (postId: string, opts: { limit?: number; cursor?: string } = {}) =>
    http.get<LbPaginaComentarios>(
      `/lifebook/posts/${postId}/comments?limit=${opts.limit ?? 30}${opts.cursor ? `&cursor=${encodeURIComponent(opts.cursor)}` : ''}`,
    ),

  /**
   * Comenta (o responde) adjuntando una publicación. El texto sigue siendo obligatorio:
   * así, si algún día borran lo adjunto, el comentario se lee entero.
   */
  addComment: (postId: string, text: string, parentId?: string, attachPostId?: string) =>
    http.post<LbComentarioConAdjunto>(`/lifebook/posts/${postId}/comments`, {
      text,
      ...(parentId ? { parentId } : {}),
      ...(attachPostId ? { attachPostId } : {}),
    }),

  /**
   * MIS publicaciones, para el selector del compositor. Es la misma ruta que usa el chat
   * para compartir una nota, así que no hay dos maneras de listar lo mío.
   */
  misPublicaciones: (userId: string, limit = 20) =>
    http.get<{ posts?: LbPostBase[] }>(`/lifebook/users/${userId}/posts?limit=${limit}`),
};
