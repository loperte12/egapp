/**
 * A quién sigo — para la fila de avatares de la pestaña «Seguidos».
 *
 * Vive en su propio fichero, como `lifebookPostOps.ts`, `lifebookComentarios.ts` y
 * `lifebookWatch.ts`, para no tocar `api/lifebook.ts` (que el dueño pidió no tocar) y
 * porque es aditivo. La hoja/pantalla solo importa `seguidosApi`.
 *
 * EL ENDPOINT ES NUEVO: no existía ninguno para listar a quién sigues. Lo que había
 * era `me/new-followers`, que es «quién me sigue A MÍ» — lo contrario. Se añadió en el
 * backend en esta misma ronda.
 */
import { http } from './httpClient';

/** Una persona a la que sigues, con lo mínimo para pintar su avatar. */
export interface LbSeguido {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  city: string | null;
  /**
   * Cuándo publicó por última vez. Se usa para ORDENAR (quien publicó hace poco,
   * primero). `null` = nunca, o solo cosas no públicas.
   *
   * NO es un aviso de «tiene novedad»: eso exigiría estado por (usuario, autor) que no
   * existe en la base, así que no se promete lo que no se puede cumplir.
   */
  lastPostAt: string | null;
}

export const seguidosApi = {
  /** A quién sigo, ordenado por actividad más reciente. */
  lista: (limit = 20) => http.get<LbSeguido[]>(`/lifebook/me/following?limit=${limit}`),
};
