/**
 * Operaciones del AUTOR sobre su propia publicación.
 *
 * Vive en su propio fichero a propósito: `api/lifebook.ts` lo está tocando otro agente a la
 * vez y esto no tiene por qué esperar a nadie. La pantalla solo importa
 * `lifebookPostOpsApi`, así que el día que se junten se puede mover allí sin tocar la vista.
 */
import { httpRequest } from './httpClient';

/**
 * Respuesta de `DELETE /lifebook/posts/:id`.
 *
 * El servidor borra también los archivos del almacén del post, así que un vídeo de 900 MB
 * libera el disco de verdad. El cuerpo exacto no se tipa campo a campo a propósito: la
 * pantalla solo necesita saber que la promesa resolvió (si el borrado falla, `httpRequest`
 * lanza y el post sigue ahí).
 */
export interface LbPostBorrado {
  ok?: boolean;
  [k: string]: unknown;
}

export const lifebookPostOpsApi = {
  /**
   * Borra una publicación propia (o cualquiera, si eres ADMIN). Es irreversible: no hay
   * papelera ni «deshacer», y con ella se van sus comentarios y sus archivos.
   */
  borrarPost: (id: string) => httpRequest<LbPostBorrado>(`/lifebook/posts/${id}`, { method: 'DELETE' }),
};
