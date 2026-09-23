/**
 * «Seguir viendo»: por dónde ibas en cada vídeo.
 *
 * Vive en su propio fichero, como `lifebookPostOps.ts` y `lifebookComentarios.ts`, para
 * no tocar `api/lifebook.ts` (que el dueño pidió no tocar) y porque esto es ADITIVO.
 *
 * Antes NO existía nada de esto: comprobado buscando `progress|position|resume` en la
 * app, lo único que aparecía era el progreso de SUBIDA. Con 62 vídeos, 12 series y 36
 * episodios, salir de un vídeo significaba empezar de cero.
 *
 * El servidor deduce lo que está visto: por debajo de 5 s no cuenta como empezado y a
 * partir del 90 % cuenta como terminado (y sale de la lista). No hay que mandarle nada
 * de eso: lo decide él para que no haya dos criterios distintos.
 */
import { http, httpRequest } from './httpClient';

export interface LbProgreso {
  positionSec: number;
  durationSec: number;
  /** `null` si no hay nada guardado. */
  updatedAt: string | null;
}

/** Una tarjeta de «seguir viendo»: el vídeo + por dónde ibas. */
export interface LbSeguirViendo {
  id: string;
  type: string;
  title: string | null;
  preview: string;
  thumb: { id: string | null; url: string } | null;
  author: { id: string; fullName: string | null; avatarUrl: string | null };
  positionSec: number;
  durationSec: number;
  /** 0-100, para la barrita de la tarjeta. */
  percent: number;
  updatedAt: string | null;
}

export const watchApi = {
  /** Guarda por dónde vas. Idempotente; el servidor acota los valores. */
  guardar: (postId: string, positionSec: number, durationSec: number) =>
    http.post<{ ok: boolean; positionSec: number; durationSec: number }>(
      `/lifebook/watch/${postId}`, { positionSec, durationSec },
    ),

  /** Por dónde ibas (para reanudar). Ceros si no hay nada guardado. */
  leer: (postId: string) => http.get<LbProgreso>(`/lifebook/watch/${postId}`),

  /** Quita un vídeo de «seguir viendo» a mano. */
  borrar: (postId: string) =>
    httpRequest<{ ok: boolean }>(`/lifebook/watch/${postId}`, { method: 'DELETE' }),

  /** Los vídeos que dejaste a medias, del más reciente al más antiguo. */
  seguirViendo: (limit = 12) =>
    http.get<LbSeguirViendo[]>(`/lifebook/me/continue-watching?limit=${limit}`),
};
