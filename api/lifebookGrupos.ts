/**
 * Enlaces a GRUPOS dentro del perfil (P3).
 *
 * Qué resuelve: el dueño de un grupo quiere poner en su perfil un enlace para que la
 * gente entre al grupo. En Telegram/WeChat eso es un enlace de invitación; aquí el
 * «enlace» es el CÓDIGO del grupo, que ya existía (`GET /lifebook/groups/:id/invite`),
 * pero solo se podía enseñar por WhatsApp copiándolo a mano.
 *
 * Tres cosas, y ninguna toca `api/lifebook.ts` (que el dueño pidió no tocar):
 *   · `misGrupos()`  — mis grupos con MI PAPEL, para el selector del perfil. Solo tiene
 *     sentido ofrecer los que puedo invitar (dueño o administrador): el resto daría 403.
 *   · `codigo(id)`   — el código del grupo, CON SU CADUCIDAD (7 días). El servidor lo
 *     rota al pedirlo si el anterior ya caducó.
 *   · `porCodigo(c)` — la ficha del grupo a partir del código. Es lo que permite pintar
 *     la tarjeta en el perfil Y saber si el enlace sigue vivo: un código caducado
 *     responde 400 «ha caducado», así que la app puede decirlo en vez de mentir.
 */
import { http } from './httpClient';
import type { LbGroupCard } from './lifebook';

/** Un grupo mío, con lo justo para el selector. */
export interface LbMiGrupo {
  id: string;
  title: string;
  photoUrl: string | null;
  members: number;
  myRole: 'owner' | 'admin' | 'member';
}

/** El código de invitación de un grupo. `expiresAt` lo pone el servidor (7 días). */
export interface LbCodigoDeGrupo {
  code: string;
  title: string | null;
  link: string;
  expiresAt: string | null;
  /** Tope de entradas del enlace. `null` = sin tope. */
  maxUses: number | null;
  /** Cuántas veces se ha usado ya. */
  uses: number;
  /** Cuántas quedan. `null` = sin tope. */
  usesLeft: number | null;
}

/** Lo que el servidor añade a la ficha cuando se llega CON el código. */
export interface LbInvitacionDeGrupo {
  expiresAt: string | null;
  maxUses: number | null;
  uses: number;
  usesLeft: number | null;
}

/**
 * La ficha del grupo **más** lo que se sabe del enlace por el que se ha llegado. El tipo
 * `LbGroupCard` vive en `api/lifebook.ts` (que no se toca), así que el extra se declara
 * aquí y se compone.
 */
export type LbGroupCardConEnlace = LbGroupCard & { invite?: LbInvitacionDeGrupo };

/** Forma cruda de `/lifebook/chat/conversations` (solo lo que usamos aquí). */
interface ConversacionCruda {
  id: string;
  kind?: string;
  title?: string;
  photoUrl?: string | null;
  members?: number;
  myRole?: 'owner' | 'admin' | 'member';
}

export const gruposEnlacesApi = {
  /**
   * Mis grupos, con mi papel. Los grupos vienen de la lista de chats (donde ya
   * aparecen todos los míos) y NO se piden uno por uno para saber el papel: el
   * servidor lo manda ahora en cada fila (`myRole`).
   */
  misGrupos: async (): Promise<LbMiGrupo[]> => {
    const todas = await http.get<ConversacionCruda[]>('/lifebook/chat/conversations');
    return (Array.isArray(todas) ? todas : [])
      .filter((c) => c && c.kind === 'group')
      .map((c) => ({
        id: c.id,
        title: (c.title ?? '').trim() || 'Grupo',
        photoUrl: c.photoUrl ?? null,
        members: Number(c.members ?? 0),
        myRole: c.myRole ?? 'member',
      }));
  },

  /**
   * El código de invitación (solo dueño y administradores; si no, el servidor da 403).
   *
   * `opts` fija el **tope de entradas** y los **días** de vida. Ojo con lo que significa:
   * pedir un tope (o unos días) **crea un enlace NUEVO** y el anterior deja de funcionar
   * — es la única forma de que el contador empiece de cero y nadie «recargue» un enlace
   * ya gastado. Sin `opts` se reutiliza el código vivo (y solo se rota si caducó).
   *   · `maxUses: null` → sin tope (para todo el mundo, hasta que caduque).
   */
  codigo: (groupId: string, opts?: { maxUses?: number | null; days?: number }) => {
    const q: string[] = [];
    if (opts?.maxUses !== undefined) q.push(`maxUses=${opts.maxUses === null ? 'null' : opts.maxUses}`);
    if (opts?.days !== undefined) q.push(`days=${opts.days}`);
    return http.get<LbCodigoDeGrupo>(`/lifebook/groups/${groupId}/invite${q.length ? `?${q.join('&')}` : ''}`);
  },

  /**
   * Unirse (o pedir entrar) a un grupo. Es la MISMA ruta que usa `lifebookGroupsApi.join`,
   * pero pasando por aquí se puede mandar el `code` del enlace: el tipo de `api/lifebook.ts`
   * no lo admite y ese fichero no se toca. Mandarlo es lo que gasta una entrada del enlace
   * y lo que hace que su tope se respete de verdad.
   */
  unirse: (groupId: string, input: { answer?: string; note?: string; code?: string } = {}) =>
    http.post<{ joined: boolean; requested: boolean; state: 'pending' | null; group: LbGroupCard }>(
      `/lifebook/groups/${groupId}/join`, input,
    ),

  /**
   * La ficha de un grupo a partir de su código. Lanza error si el código no existe
   * (404) o si ya ha CADUCADO (400): quien pinte la tarjeta debe distinguir «no se
   * pudo leer» de «este enlace ya no sirve».
   */
  porCodigo: (code: string) =>
    http.get<LbGroupCardConEnlace>(`/lifebook/groups/by-code/${encodeURIComponent(code.trim().toUpperCase())}`),
};
