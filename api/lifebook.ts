/**
 * lifebook — cliente API del módulo LIFE BOOK (Partes 1-3 backend).
 * Rutas: /lifebook/... sobre el base de httpClient (/wallet/api/v1).
 * Endpoints: posts (nota/venta/servicio/debate), feed por canal, perfil
 * público (users/:id/profile + posts), like/comment/bookmark/follow/report.
 */

import { http, httpRequest } from './httpClient';
import { absUrl } from './config';
import { lbCategoryLabel } from '../constants/lifebook';
import type { LbVisibility } from '../constants/lifebook';

// ---------------- Tipos (espejo del serializador NestJS) ----------------

export interface LbAuthor {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  role?: string | null;
  nameColor?: string | null;
  /** Parte 11: alias corto de `fullName` que ya envía el servidor. */
  name?: string | null;
  /** Parte 11: ¿el visor sigue a este autor? (lo calcula el servidor). */
  followedByMe?: boolean;
}

export interface LbMediaItem {
  id: string;
  url: string;
}

/** Enlace a un servicio real (verificado por rol del autor). */
export interface LbServiceLink {
  /**
   * Tipos reales que envía el servidor: `taxi | food | ecomerse | work |
   * rental | paquete | tickets | lifebook`. Se aceptan además los alias
   * `shop` (= ecomerse) y `delivery` (= paquete) por si llegan de otro cliente.
   */
  type: 'taxi' | 'food' | 'shop' | 'delivery' | 'work' | 'rental'
  | 'ecomerse' | 'paquete' | 'tickets' | 'lifebook' | (string & {});
  /** Puede ser `null`: un enlace `taxi` apunta al servicio, no a un registro. */
  id: string | null;
  /** Ruta de la app ya resuelta por el servidor (p. ej. `/taxi`). */
  route?: string | null;
}

export interface LbStats {
  likes: number;
  comments: number;
  bookmarks?: number;
  likedByMe?: boolean;
  bookmarkedByMe?: boolean;
}

export interface LbPostBase {
  id: string;
  type: 'note' | 'sale' | 'service' | 'debate' | string;
  title: string | null;
  body: string | null;
  city: string;
  barrio: string | null;
  tone: string | null;
  topics?: string[];
  payload: Record<string, unknown>;
  serviceLink: LbServiceLink | null;
  media: LbMediaItem[];
  /** Nº total de fotos del post (la tarjeta solo trae la 1ª). */
  mediaCount?: number;
  /** Parte 11: alias de `topics` tal y como lo envía el servidor. */
  tags?: string[];
  /** Parte 11: alias plano de `stats.bookmarkedByMe`. */
  savedByMe?: boolean;
  /** Nº de guardados de la publicación (Parte 13: lo envía el feed y el detalle). */
  savedCount?: number;
  /** Canal del feed por el que salió la publicación (Parte 13; `null` en for_you). */
  channel?: string | null;
  createdAt: string | null;
  author: LbAuthor;
  stats: LbStats;
}

export interface LbDebateInfo {
  category: string;
  state: string;
  allowProposals: boolean;
  allowVotes: boolean;
  showApproxLoc: boolean;
  problem: string | null;
  /** Parte 14: alias del enunciado (mismo valor que `problem`). */
  question?: string | null;
  context: string | null;
  initialProposal: string | null;
  resolvedSummary: string | null;
  resolvedAt: string | null;
  attentionAt: string | null;
  closedAt: string | null;
  /**
   * Parte 14: **agregado** de los votos de las propuestas
   * (`agree` → sí · `disagree` → no). No es una votación sí/no del debate:
   * el voto real vive en cada propuesta.
   */
  votesYes?: number;
  votesNo?: number;
  myVote?: 'yes' | 'no' | null;
}

export interface LbPostDetail extends LbPostBase {
  visibility: LbVisibility;
  allowComments: boolean;
  debate?: LbDebateInfo | null;
  /** Meta de SERIE (solo type='serie', Parte 4). */
  serie?: { episodesCount: number; seasons: number; totalSeconds: number } | null;
  bookmarks?: number;
}

/** Comentario de una publicación (Parte 14: con `postId`, `likes` y `likedByMe`). */
export interface LbComment {
  id: string;
  /** Publicación a la que pertenece. */
  postId?: string;
  body: string;
  createdAt: string | null;
  /** Nº de «me gusta» del comentario. */
  likes?: number;
  likedByMe?: boolean;
  author: { id: string; fullName: string | null; avatarUrl: string | null; role?: string | null };
  /* ── Parte 23: respuestas y edición ── */
  /** Si es una respuesta, el comentario al que contesta. */
  parentId?: string | null;
  /** Cuántas respuestas tiene (para «Ver N respuestas»). */
  repliesCount?: number;
  /** Fecha de la última edición (para poner «editado»). */
  editedAt?: string | null;
  /** Nombre de la persona a la que responde (en respuestas). */
  replyToName?: string | null;
}

/** Alias antiguo (compatibilidad): el mismo tipo. */
export type LbCommentItem = LbComment;

export interface LbFeedPage {
  posts: LbPostBase[];
  nextCursor: string | null;
}

// ---------------- Modelo de TARJETA (estilo Xiaohongshu) ----------------
/**
 * LbPostCard — forma que consumen la tarjeta (`components/lifebook/PostCard`)
 * y el masonry del feed. NO es lo que devuelve el backend: se deriva de
 * `LbPostBase` con `toPostCard()`, de modo que la tarjeta trabaja con una
 * sola portada (`media`) y campos planos de social.
 */
export interface LbPostCardMedia {
  /** URL absoluta ya resuelta (absUrl). */
  url: string;
  /** Miniatura: el backend aún no genera miniaturas → undefined. */
  thumbnailUrl?: string;
  /** ancho/alto — clave del masonry (3:4 por defecto). */
  aspectRatio?: number;
}

export interface LbPostCardAuthor {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface LbPostCard {
  id: string;
  /** Título ya resuelto (título real o, si no hay, el cuerpo). Nunca vacío. */
  title: string;
  /** Cuerpo de la nota (la tarjeta lo usa cuando la publicación no tiene foto). */
  body?: string;
  type: 'note' | 'video' | 'podcast' | 'serie' | 'sale' | 'debate' | 'service' | string;
  media?: LbPostCardMedia;
  author?: LbPostCardAuthor;
  likesCount: number;
  likedByMe?: boolean;
  commentsCount?: number;
  /** Nº de guardados (detalle: stats.bookmarks · feed: savedCount del servidor). */
  savedCount?: number;
  savedByMe?: boolean;
  city?: string;
  createdAt?: string;
  /* extras que la tarjeta ya pinta */
  mediaCount?: number;
  priceXaf?: number;
  /* ── PostCard v2: acercar la tarjeta a Xiaohongshu + EG Route Plan ── */
  /** Chip superior: canal de origen ('Comida', 'Taxi', 'Ventas'…) o categoría/tipo. */
  category?: string;
  /** Contexto local: 'Malabo · Malabo Centro'. */
  locationLabel?: string;
  /** Primer tema/hashtag de la publicación. */
  topicLabel?: string;
  serviceLink?: LbServiceLink | null;
  durationSec?: number;
  hasVideo?: boolean;
  hasAudio?: boolean;
}

/** Proporción por defecto cuando el post no trae `coverRatio`: 3:4. */
export const LB_CARD_DEFAULT_RATIO = 0.75;

/** Acota la proporción para que una foto extrema no rompa la rejilla. */
export function lbCardRatio(raw: unknown): number {
  const n = Number(raw ?? 0);
  return n > 0 ? Math.min(Math.max(n, 0.6), 1.6) : LB_CARD_DEFAULT_RATIO;
}

/* Helpers de normalización del adaptador (string/número «limpios»). */
function str(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const s = v.trim();
  return s.length > 0 ? s : undefined;
}
function num(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Adapta la respuesta real del backend a la forma de la tarjeta (PostCard v2). */
export function toPostCard(post: LbPostBase): LbPostCard {
  const payload = (post.payload ?? {}) as Record<string, unknown>;

  const coverUrl = str(payload.coverUrl) ? absUrl(payload.coverUrl as string) : '';
  const firstUrl = post.media?.[0]?.url ? absUrl(post.media[0].url) : '';
  const url = coverUrl || firstUrl;

  const priceXaf = num(payload.priceXaf);
  const body = post.body?.trim() ?? '';
  const realTitle = post.title?.trim() ?? '';

  const city = post.city?.trim();
  const barrio = post.barrio?.trim();
  const locationLabel = [city, barrio].filter(Boolean).join(' · ') || undefined;

  const serviceLink = post.serviceLink ?? null;
  // `category`: canal del feed (lo marca el servidor) → categoría de la venta →
  // etiqueta del enlace de servicio → tipo de publicación. Se traduce a etiqueta
  // legible ('food' → 'Comida') para el chip superior.
  const category = lbCategoryLabel(
    str(post.channel)
    ?? str(payload.category)
    ?? serviceLink?.type
    ?? (post.type !== 'note' ? post.type : undefined),
  );

  const savedByMe = post.savedByMe ?? post.stats?.bookmarkedByMe ?? false;
  // En el detalle llega `stats.bookmarks`; en el feed el servidor manda `savedCount`.
  const savedCount = num(post.savedCount) ?? num(post.stats?.bookmarks) ?? 0;
  const durationSec = num(payload.durationSec);

  const hasVideo =
    Boolean(str(payload.videoUrl)) || post.type === 'video' || post.type === 'serie';
  const hasAudio = Boolean(str(payload.audioUrl)) || post.type === 'podcast';

  const topicLabel = str(post.topics?.[0]) ?? str(post.tags?.[0]);

  return {
    id: post.id,
    title: realTitle || body,
    body: body || undefined,
    type: post.type,
    media: url
      // El backend NO genera miniaturas: `thumbnailUrl` reutiliza la URL original
      // (la tarjeta ya cae a `url` cuando no hay miniatura).
      ? { url, thumbnailUrl: url, aspectRatio: lbCardRatio(payload.coverRatio) }
      : undefined,
    author: post.author
      ? {
        id: post.author.id,
        name: post.author.name?.trim() || post.author.fullName?.trim() || 'Usuario',
        avatarUrl: post.author.avatarUrl ? absUrl(post.author.avatarUrl) : undefined,
      }
      : undefined,
    likesCount: post.stats?.likes ?? 0,
    likedByMe: !!post.stats?.likedByMe,
    commentsCount: post.stats?.comments ?? 0,
    savedCount,
    savedByMe,
    city: city || undefined,
    createdAt: post.createdAt ?? undefined,
    mediaCount: post.mediaCount ?? post.media?.length ?? 0,
    priceXaf:
      (post.type === 'sale' || post.type === 'service') && priceXaf !== undefined
        ? priceXaf
        : undefined,
    category,
    locationLabel,
    topicLabel,
    serviceLink,
    durationSec,
    hasVideo,
    hasAudio,
  };
}

export interface LbProfile {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  coverPhotoUrl: string | null;
  bio: string | null;
  nameColor: string | null;
  city: string | null;
  country: string | null;
  profession: string | null;
  school: string | null;
  links: Array<{ label?: string; url?: string } | string>;
  ratingAvg: number | null;
  role: string | null;
  createdAt: string | null;
  stats: { posts: number; followers: number; following: number; likes: number };
  verified: { driver: boolean; food: boolean; seller: boolean; work: boolean; rental: boolean };
  relation: { isSelf: boolean; isFollowing: boolean; isFollower: boolean };
}

export interface LbProfilePosts extends LbFeedPage {}

export interface LbCreateNoteInput {
  body: string;
  title?: string;
  media?: string[]; // dataURLs
  city: string;
  barrio?: string;
  topics?: string[];
  tone?: string;
  visibility?: LbVisibility;
  /** Proporción (ancho/alto) de la 1ª foto para la cascada 3:4. */
  coverRatio?: number;
}

// ---------------- Búsqueda (Parte 9) ----------------

export interface LbSearchPage extends LbFeedPage {
  /** Término normalizado que aplicó el servidor (minúsculas, sin acentos). */
  query: string;
}

export interface LbTrend {
  tag: string;
  count: number;
  /** 5 o más publicaciones en la ventana de 30 días. */
  hot?: boolean;
  /** `topic` = tema declarado por el autor · `word` = palabra frecuente (relleno). */
  source?: 'topic' | 'word';
}

export interface LbTrendsPage {
  city: string | null;
  window: string;
  trends: LbTrend[];
  generatedAt?: string;
}

export interface LbSuggestion {
  text: string;
  type: 'tag' | 'user' | 'general' | string;
}

const qs = (q: Record<string, string | undefined>) => {
  const sp = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => { if (v !== undefined && v !== '') sp.set(k, v); });
  const s = sp.toString();
  return s ? `?${s}` : '';
};

/** `curl`-friendly helpers de cada verbo. DELETE no existe en `http`, se usa httpRequest. */
export const lifebookApi = {
  /** Feed por canal (Parte 3). channel=for_you|following|nearby|today|debates|food|taxi|work|rental|sales|culture|music|sports */
  feed: (channel: string, o: { city?: string; type?: string; cursor?: string; limit?: number } = {}) =>
    http.get<LbFeedPage>(`/lifebook/posts/feed${qs({
      channel, city: o.city, type: o.type, cursor: o.cursor,
      limit: o.limit ? String(o.limit) : undefined,
    })}`),

  /** Feed "Para ti" (alias servidor). */
  forYou: (o: { cursor?: string; limit?: number } = {}) =>
    http.get<LbFeedPage>(`/lifebook/posts/for-you${qs({ cursor: o.cursor, limit: o.limit ? String(o.limit) : undefined })}`),

  /** Búsqueda de publicaciones (Parte 9): texto + filtro de tipo/canal + ciudad. */
  search: (q: string, o: { type?: string; city?: string; cursor?: string; limit?: number } = {}) =>
    http.get<LbSearchPage>(`/lifebook/search${qs({
      q, city: o.city, cursor: o.cursor,
      type: o.type && o.type !== 'all' ? o.type : undefined,
      limit: o.limit ? String(o.limit) : undefined,
    })}`),

  /** Tendencias reales de los últimos 30 días (temas + palabras frecuentes). */
  searchTrends: (o: { city?: string; limit?: number } = {}) =>
    http.get<LbTrendsPage>(`/lifebook/search/trends${qs({ city: o.city, limit: o.limit ? String(o.limit) : undefined })}`),

  /** Sugerencias en vivo (temas y personas) para el término escrito. */
  searchSuggest: (q: string, limit = 8) =>
    http.get<{ suggestions: LbSuggestion[] }>(`/lifebook/search/suggest${qs({ q, limit: String(limit) })}`),

  post: (id: string) => http.get<LbPostDetail>(`/lifebook/posts/${id}`),

  /** Igual que `post()` pero con la forma `{ post }` del contrato del cliente. */
  postDetail: async (id: string) => ({ post: await http.get<LbPostDetail>(`/lifebook/posts/${id}`) }),

  /**
   * Comentarios del post: `GET /posts/:id/comments?limit=&cursor=`.
   * Con `limit`/`cursor` el servidor devuelve `{ comments, nextCursor, total }`
   * (paginación real por `created_at`); sin parámetros devuelve el array.
   */
  postComments: (id: string, opts: { cursor?: string; limit?: number } = {}) =>
    http.get<{ comments: LbCommentItem[]; nextCursor: string | null; total?: number }>(
      `/lifebook/posts/${id}/comments${qs({
        cursor: opts.cursor,
        limit: opts.limit !== undefined ? String(opts.limit) : '20',
      })}`,
    ),

  /** Parte 16: mis guardados (publicaciones que yo marqué). */
  mySaves: (o: { cursor?: string; limit?: number } = {}) =>
    http.get<LbFeedPage>(`/lifebook/me/saves${qs({ cursor: o.cursor, limit: o.limit ? String(o.limit) : undefined })}`),

  /* ── Parte 23: respuestas de un comentario · editar · borrar ── */

  /** Respuestas de un comentario (traen `replyToName`: a quién contestan). */
  commentReplies: (commentId: string, limit = 50) =>
    http.get<{ parentId: string; replyTo: { id: string; fullName: string | null } | null; total: number; replies: LbCommentItem[] }>(
      `/lifebook/comments/${commentId}/replies?limit=${limit}`,
    ),

  /** Edita MI comentario (devuelve el comentario actualizado y `editedAt`). */
  editComment: (commentId: string, text: string) =>
    httpRequest<{ ok: boolean; id: string; body: string; editedAt: string | null }>(
      `/lifebook/comments/${commentId}`, { method: 'PATCH', body: { text } }),

  /** Borra un comentario (el mío, o cualquiera si soy el autor de la publicación). */
  deleteComment: (commentId: string) =>
    httpRequest<{ ok: boolean; commentsLeft: number }>(`/lifebook/comments/${commentId}`, { method: 'DELETE' }),

  /** Relacionadas del detalle (Parte 10): mismo tema, tipo o ciudad. */
  relatedPosts: (id: string, limit = 6) =>
    http.get<LbFeedPage>(`/lifebook/posts/${id}/related?limit=${limit}`),

  like: (id: string) => http.post<{ liked: boolean; reaction: string }>(`/lifebook/posts/${id}/like`, {}),
  unlike: (id: string) => httpRequest<{ liked: boolean }>(`/lifebook/posts/${id}/like`, { method: 'DELETE' }),
  toggleLike: async (id: string, liked: boolean) => (liked ? lifebookApi.unlike(id) : lifebookApi.like(id)),

  comment: (id: string, body: string) => http.post<{ id: string; ok: boolean }>(`/lifebook/posts/${id}/comment`, { body }),
  comments: (id: string) => http.get<LbCommentItem[]>(`/lifebook/posts/${id}/comments`),

  /* ── Parte 14: «me gusta» en comentarios ── */

  likeComment: (commentId: string) =>
    http.post<{ liked: boolean }>(`/lifebook/comments/${commentId}/like`, {}),
  unlikeComment: (commentId: string) =>
    httpRequest<{ liked: boolean }>(`/lifebook/comments/${commentId}/like`, { method: 'DELETE' }),
  toggleCommentLike: (commentId: string, liked: boolean) =>
    (liked ? lifebookApi.unlikeComment(commentId) : lifebookApi.likeComment(commentId)),

  bookmark: (id: string) => http.post<{ bookmarked: boolean }>(`/lifebook/posts/${id}/bookmark`, {}),
  unbookmark: (id: string) => httpRequest<{ bookmarked: boolean }>(`/lifebook/posts/${id}/bookmark`, { method: 'DELETE' }),
  toggleBookmark: async (id: string, bookmarked: boolean) => (bookmarked ? lifebookApi.unbookmark(id) : lifebookApi.bookmark(id)),

  follow: (userId: string) => http.post<{ following: boolean }>(`/lifebook/users/${userId}/follow`, {}),
  unfollow: (userId: string) => httpRequest<{ following: boolean }>(`/lifebook/users/${userId}/follow`, { method: 'DELETE' }),

  /** Perfil público (Parte 3): identidad + contadores + badges + relación. */
  profile: (userId: string) => http.get<LbProfile>(`/lifebook/users/${userId}/profile`),

  /** Publicaciones de un perfil (pestañas: type=note|sale|service|debate). */
  userPosts: (userId: string, o: { type?: string; cursor?: string; limit?: number } = {}) =>
    http.get<LbProfilePosts>(`/lifebook/users/${userId}/posts${qs({
      type: o.type, cursor: o.cursor, limit: o.limit ? String(o.limit) : undefined,
    })}`),

  /** Publicar NOTA (texto + hasta 4 fotos + temas + tono + visibilidad). */
  createNote: (input: LbCreateNoteInput) =>
    http.post<LbPostDetail>('/lifebook/posts', {
      body: input.body,
      ...(input.title?.trim() ? { title: input.title.trim() } : {}),
      ...(input.media?.length ? { media: input.media } : {}),
      city: input.city,
      ...(input.barrio?.trim() ? { barrio: input.barrio.trim() } : {}),
      ...(input.topics?.length ? { topics: input.topics } : {}),
      ...(input.coverRatio ? { coverRatio: input.coverRatio } : {}),
      ...(input.tone ? { tone: input.tone } : {}),
      visibility: input.visibility ?? 'public',
    }),
};

export type { LbVisibility };

// ---------------- Parte 4: video · podcast · serie ----------------

export interface LbEpisode {
  id: string;
  season: number;
  episode: number;
  label: string;
  title: string | null;
  body: string | null;
  videoUrl: string;
  coverUrl: string | null;
  durationSec: number | null;
  allowDownload: boolean;
  createdAt: string | null;
}

export interface LbMediaUploadResult {
  url: string;
  kind: 'image' | 'video' | 'audio';
  bytes: number;
  contentType: string;
}

export interface LbRichMediaInput {
  title?: string;
  body?: string;
  city: string;
  barrio?: string;
  allowComments?: boolean;
  allowDownload?: boolean;
  visibility?: LbVisibility;
}

export interface LbVideoInput extends LbRichMediaInput {
  title: string;
  videoUrl: string;
  coverUrl?: string;
  durationSec: number;
}

export interface LbPodcastInput extends LbRichMediaInput {
  audioUrl: string;
  coverUrl: string;
  durationSec: number;
}

export interface LbSerieInput extends LbRichMediaInput {
  title: string;
  coverUrl?: string;
}

export interface LbEpisodeInput {
  title?: string;
  body?: string;
  videoUrl: string;
  coverUrl?: string;
  durationSec: number;
  season?: number;
  episode?: number;
  allowDownload?: boolean;
}

export const lifebookMediaApi = {
  /** Sube un archivo local (uri RN) por multipart → URL pública en MinIO.
   *  Parte 15: `kind='file'` acepta documentos (pdf, docx, zip…) hasta 25 MB. */
  async uploadFile(kind: 'image' | 'video' | 'audio' | 'file', file: { uri: string; name: string; mimeType: string }): Promise<LbMediaUploadResult> {
    const form = new FormData();
    form.append('file', { uri: file.uri, name: file.name, type: file.mimeType } as unknown as Blob);
    return httpRequest<LbMediaUploadResult>(`/lifebook/media/upload?kind=${kind}`, { method: 'POST', form });
  },

  createVideo: (input: LbVideoInput) =>
    http.post<LbPostDetail>('/lifebook/posts/video', input),

  createPodcast: (input: LbPodcastInput) =>
    http.post<LbPostDetail>('/lifebook/posts/podcast', input),

  createSerie: (input: LbSerieInput) =>
    http.post<LbPostDetail>('/lifebook/posts/serie', input),

  serieEpisodes: (serieId: string) =>
    http.get<LbEpisode[]>(`/lifebook/series/${serieId}/episodes`),

  addEpisode: (serieId: string, input: LbEpisodeInput) =>
    http.post<{ id: string; season: number; episode: number; label: string; ok: boolean }>(`/lifebook/series/${serieId}/episodes`, input),
};

// ---------------- Parte 5: chat · pedidos · tienda ----------------

export interface LbConversation {
  id: string;
  other: { id: string; fullName: string | null; avatarUrl: string | null };
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
  createdAt: string | null;
}

export interface LbMessage {
  id: string;
  senderId: string;
  mine: boolean;
  body: string;
  readAt: string | null;
  createdAt: string | null;
  sender: { id: string; fullName: string | null; avatarUrl: string | null };
}

export interface LbMessagePage {
  messages: LbMessage[];
  nextCursor: string | null;
}

export type LbOrderStatus = 'requested' | 'accepted' | 'declined' | 'in_transit' | 'delivered' | 'cancelled' | 'disputed';

export interface LbOrder {
  id: string;
  orderNo: string;
  postId: string;
  title: string | null;
  priceXaf: number;
  negotiable: boolean;
  message: string | null;
  contactMode: string;
  status: LbOrderStatus;
  createdAt: string | null;
  buyer: { id: string; fullName: string | null; avatarUrl: string | null };
  seller: { id: string; fullName: string | null; avatarUrl: string | null };
  media: LbMediaItem[];
}

export interface LbStorePage {
  store: {
    id: string;
    fullName: string | null;
    avatarUrl: string | null;
    coverPhotoUrl: string | null;
    bio: string | null;
    city: string | null;
    country: string | null;
    ratingAvg: number | null;
    relation: { isSelf: boolean; isFollowing: boolean; isFollower: boolean };
    verified: LbProfile['verified'];
    stats: LbProfile['stats'];
    ecomerse: boolean;
  };
  sales: LbPostBase[];
  nextCursor: string | null;
}

export const lifebookChatApi = {
  conversations: () => http.get<LbConversation[]>('/lifebook/chat/conversations'),
  unread: () => http.get<{ unread: number }>('/lifebook/chat/unread'),
  open: (userId: string) => http.post<LbConversation>('/lifebook/chat/open', { userId }),
  messages: (convId: string, o: { before?: string; limit?: number } = {}) =>
    http.get<LbMessagePage>(`/lifebook/chat/conversations/${convId}/messages${qs({ before: o.before, limit: o.limit ? String(o.limit) : undefined })}`),
  send: (convId: string, body: string) => http.post<{ id: string; ok: boolean }>(`/lifebook/chat/conversations/${convId}/messages`, { body }),

  /**
   * Parte 15: envío con tipo (texto, nota/venta compartida, imagen, archivo).
   * Parte 24 (G2): además `location` (lat/lng/label) y `vote` (question + options).
   * Parte 25 (G2-b): `chain` (title/note/slots) y `checkin` (label/lat/lng/at).
   * Parte 26 (G2-c): `ad` (anuncio de grupo con `priceXaf` y enlace opcional).
   */
  sendRich: (convId: string, input: {
    text?: string; kind?: string; postId?: string; mediaUrl?: string; fileName?: string; fileSize?: number;
    lat?: number; lng?: number; label?: string; question?: string; options?: string[];
    title?: string; note?: string; slots?: number; at?: string;
    priceXaf?: number; linkType?: string; linkId?: string;
  }) =>
    http.post<{
      id: string; conversationId: string; kind: string; body: string; createdAt: string; ok: boolean;
      /** Solo en `kind='ad'`: anuncios que me quedan hoy. */
      adsLeftToday?: number; adsLimitToday?: number;
    }>(
      `/lifebook/chat/conversations/${convId}/messages`,
      {
        body: input.text,
        kind: input.kind,
        postId: input.postId,
        mediaUrl: input.mediaUrl,
        fileName: input.fileName,
        fileSize: input.fileSize,
        lat: input.lat,
        lng: input.lng,
        label: input.label,
        question: input.question,
        options: input.options,
        title: input.title,
        note: input.note,
        slots: input.slots,
        at: input.at,
        priceXaf: input.priceXaf,
        linkType: input.linkType,
        linkId: input.linkId,
      },
    ),

  /** Parte 26 (G2-c): anuncios de grupo que me quedan hoy (límite 15/día). */
  adsLeft: () => http.get<{ limit: number; used: number; left: number }>('/lifebook/me/ads-left'),

  /**
   * Parte 30 (Fase 05): BÚSQUEDA GLOBAL DE MENSAJES en todos mis chats, con
   * filtro por tipo (`kind`) y por chat (`conversationId`), paginando por fecha.
   */
  searchAllMessages: (o: { q?: string; kind?: string; conversationId?: string; before?: string; limit?: number } = {}) =>
    http.get<{
      query: string | null; kind: string | null; total: number; nextCursor: string | null;
      messages: {
        id: string; conversationId: string; mine: boolean; kind: string; body: string; createdAt: string;
        readAt?: string | null;
        sender?: { id: string; fullName: string | null; avatarUrl: string | null };
        postRef?: { id: string; title: string; priceXaf?: number; coverUrl?: string };
        imageUrl?: string;
        fileRef?: { name: string; sizeLabel: string; ext?: string; url?: string };
        locationRef?: { label: string; lat?: number | null; lng?: number | null };
        voteRef?: { question: string; options: string[]; counts?: number[]; myVote?: number | null; total?: number };
        chainRef?: { title: string; note?: string | null; slots?: number | null; joined: number; joinedByMe?: boolean };
        checkinRef?: { at: string | null; when: string; going: number; goingByMe: boolean };
        adRef?: { title: string | null; text: string; priceXaf: number | null; imageUrl: string | null; link: unknown };
        conversation: { id: string; kind: 'direct' | 'group'; title: string; photoUrl: string | null };
      }[];
    }>(`/lifebook/me/messages/search${qs({
      q: o.q, kind: o.kind, conversationId: o.conversationId, before: o.before,
      limit: o.limit ? String(o.limit) : undefined,
    })}`),

  /**
   * Parte 24 (G2): vota en un mensaje de votación. Un voto por persona y
   * mensaje: volver a votar CAMBIA el voto y devuelve los recuentos nuevos.
   */
  vote: (messageId: string, optionIdx: number) =>
    http.post<{ ok: boolean; messageId: string; optionIdx: number; options: string[]; counts: number[]; myVote: number; total: number }>(
      `/lifebook/chat/messages/${messageId}/vote`, { optionIdx }),

  /**
   * Parte 25 (G2-b): me apunto (o me doy de baja con `joined: false`) en una
   * CADENA o una QUEDADA. Devuelve el recuento y quiénes están apuntados.
   */
  join: (messageId: string, joined = true) =>
    http.post<{
      ok: boolean; messageId: string; kind: string; joined: boolean; count: number;
      slots: number | null; members: { id: string; name: string; avatarUrl: string | null }[];
    }>(`/lifebook/chat/messages/${messageId}/join`, { joined }),

  markRead: (convId: string) => http.post<{ ok: boolean }>(`/lifebook/chat/conversations/${convId}/read`, {}),
};

export const lifebookOrdersApi = {
  create: (postId: string, body: { message?: string; priceXaf?: number } = {}) =>
    http.post<{ id: string; orderNo: string; status: string; priceXaf: number; negotiable: boolean }>(`/lifebook/posts/${postId}/order`, body),
  mine: (side: 'buyer' | 'seller') => http.get<LbOrder[]>(`/lifebook/orders?side=${side}`),
  detail: (orderId: string) => http.get<LbOrder>(`/lifebook/orders/${orderId}`),
  action: (orderId: string, action: string) => http.post<{ ok: boolean; status: string }>(`/lifebook/orders/${orderId}/action`, { action }),
};

export const lifebookStoreApi = {
  page: (sellerId: string) => http.get<LbStorePage>(`/lifebook/stores/${sellerId}`),
};

// ---------------- Parte 6: ajustes · bloqueos · reportar · comentarios ----------------

export interface LbSettings {
  publish: { defaultVisibility: 'public' | 'followers' | 'private' };
  privacy: {
    posts: 'public' | 'followers' | 'private';
    messages: 'public' | 'followers' | 'private' | 'nobody';
    location: 'public' | 'followers' | 'nobody';
    comments: 'public' | 'followers' | 'private';
    email: 'public' | 'followers' | 'nobody';
  };
  notifications: {
    likes: boolean; comments: boolean; follows: boolean; messages: boolean;
    orders: boolean; debates: boolean; promotions: boolean; digest: boolean;
  };
  content: { sensitiveFilter: boolean; cities: string[] };
}

export interface LbBlockedUser {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  blockedAt: string | null;
}

export const lifebookSettingsApi = {
  get: () => http.get<LbSettings>('/lifebook/me/settings'),
  patch: (patch: Partial<Record<keyof LbSettings, Partial<Record<string, unknown>>>>) =>
    http.patch<LbSettings>('/lifebook/me/settings', patch),
};

export const lifebookBlocksApi = {
  block: (userId: string) => http.post<{ ok: boolean; blocked: boolean }>(`/lifebook/users/${userId}/block`, {}),
  unblock: (userId: string) => httpRequest<{ ok: boolean; blocked: boolean }>(`/lifebook/users/${userId}/block`, { method: 'DELETE' }),
  mine: () => http.get<LbBlockedUser[]>('/lifebook/me/blocks'),
};

/* ── Parte 27 (G3): DESCUBRIR GRUPOS Y UNIRSE ───────────────────────────── */

export interface LbGroupCardMember {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  role?: 'owner' | 'admin' | 'member';
  joinedAt?: string;
}

/** Ficha pública de un grupo (lo que se ve antes de unirse). */
export interface LbGroupCard {
  id: string;
  title: string;
  photoUrl: string | null;
  city: string | null;
  barrio: string | null;
  category: string | null;
  description: string | null;
  topic: string | null;
  visibility: 'public' | 'private' | 'hidden';
  joinMode: 'open' | 'approval' | 'question';
  /** La pregunta de ingreso (la respuesta NUNCA la manda el servidor). */
  joinQuestion: string | null;
  ownerId: string | null;
  ownerName: string | null;
  ownerAvatarUrl: string | null;
  membersCount: number;
  placeName: string | null;
  createdAt: string | null;
  /** Si ya soy miembro, con qué rol. */
  myRole: 'owner' | 'admin' | 'member' | null;
  /** Estado de mi solicitud para entrar. */
  requestState: 'pending' | 'approved' | 'rejected' | null;
  /** Vista previa de miembros (solo en la ficha). */
  members?: LbGroupCardMember[];
}

export interface LbGroupJoinRequest {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
  city: string | null;
  state: 'pending' | 'approved' | 'rejected';
  answer: string | null;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
}

export const lifebookGroupsApi = {
  /** Descubrimiento: grupos públicos con filtros. */
  list: (o: { city?: string; category?: string; q?: string; cursor?: string; limit?: number } = {}) =>
    http.get<{ groups: LbGroupCard[]; nextCursor: string | null }>(
      `/lifebook/groups${qs({
        city: o.city, category: o.category, q: o.q, cursor: o.cursor,
        limit: o.limit ? String(o.limit) : undefined,
      })}`),
  /** Ficha pública de un grupo. */
  card: (id: string) => http.get<LbGroupCard>(`/lifebook/groups/${id}/card`),
  /** Unirse: entra directo, deja solicitud o valida la pregunta. */
  join: (id: string, input: { answer?: string; note?: string } = {}) =>
    http.post<{ joined: boolean; requested: boolean; state: 'pending' | null; group: LbGroupCard }>(`/lifebook/groups/${id}/join`, input),
  cancelJoin: (id: string) => httpRequest<{ ok: boolean }>(`/lifebook/groups/${id}/join`, { method: 'DELETE' }),
  /** Solicitudes del grupo (dueño y administradores). */
  requests: (id: string) => http.get<{ requests: LbGroupJoinRequest[]; pending: number }>(`/lifebook/groups/${id}/requests`),
  decide: (id: string, userId: string, action: 'approve' | 'reject') =>
    http.post<{ requests: LbGroupJoinRequest[]; pending: number }>(`/lifebook/groups/${id}/requests/${userId}`, { action }),

  /* ── Parte 28 (G4): código de ruta (y QR) ── */

  /** Código de invitación del grupo (dueño y administradores). */
  inviteCode: (id: string) => http.get<{ code: string; title: string | null; link: string }>(`/lifebook/groups/${id}/invite`),
  /** Grupo al que corresponde un código (entrar sin buscador). */
  byCode: (code: string) => http.get<LbGroupCard>(`/lifebook/groups/by-code/${encodeURIComponent(code)}`),

  /**
   * Parte 29 (G4): revisar (o limpiar) los INACTIVOS del grupo. Con `dryRun` solo
   * devuelve a quién quitaría; `days` permite usar otro umbral.
   */
  sweepInactive: (id: string, o: { days?: number; dryRun?: boolean } = {}) =>
    http.post<{
      dryRun: boolean; days: number; removed: number;
      candidates: { userId: string; fullName: string | null; avatarUrl: string | null; lastSeen: string }[];
    }>(`/lifebook/groups/${id}/sweep-inactive`, o),
};

/* ── Parte 28 (G4): UBICACIÓN EN VIVO durante la ruta ───────────────────── */

export interface LbLiveSharer {
  userId: string;
  fullName: string | null;
  avatarUrl: string | null;
  lat: number;
  lng: number;
  label: string | null;
  mine: boolean;
  updatedAt: string;
  startedAt: string;
  expiresAt: string;
  /** Segundos desde la última actualización. */
  ageSec: number;
  /** Minutos que le quedan de compartir. */
  minutesLeft: number;
}

export const lifebookLiveApi = {
  list: (convId: string) => http.get<{ sharing: LbLiveSharer[] }>(`/lifebook/chat/conversations/${convId}/live`),
  start: (convId: string, input: { lat: number; lng: number; label?: string; minutes?: number }) =>
    http.post<{ sharing: LbLiveSharer[] }>(`/lifebook/chat/conversations/${convId}/live`, input),
  update: (convId: string, input: { lat: number; lng: number }) =>
    httpRequest<{ sharing: LbLiveSharer[] }>(`/lifebook/chat/conversations/${convId}/live`, { method: 'PATCH', body: input }),
  stop: (convId: string) =>
    httpRequest<{ sharing: LbLiveSharer[] }>(`/lifebook/chat/conversations/${convId}/live`, { method: 'DELETE' }),
};

/* ── Parte 26 (G2-c): PLAZA DE RETOS ─────────────────────────────────────── */

export interface LbChallengeMember {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  note: string | null;
  joinedAt: string;
}

export interface LbChallenge {
  id: string;
  title: string;
  body: string | null;
  city: string | null;
  prize: string | null;
  coverUrl: string | null;
  author: { id: string; fullName: string | null; avatarUrl: string | null };
  state: 'open' | 'closed';
  endsAt: string | null;
  closedAt: string | null;
  createdAt: string;
  entries: number;
  joinedByMe: boolean;
  mine: boolean;
  /** Ranking: participantes por orden de inscripción. */
  members: LbChallengeMember[];
}

export const lifebookChallengesApi = {
  list: (o: { city?: string; state?: 'open' | 'closed' | 'all'; mine?: boolean; joined?: boolean; limit?: number } = {}) =>
    http.get<{ challenges: LbChallenge[]; total: number }>(
      `/lifebook/challenges${qs({
        city: o.city,
        state: o.state,
        mine: o.mine ? '1' : undefined,
        joined: o.joined ? '1' : undefined,
        limit: o.limit ? String(o.limit) : undefined,
      })}`),
  detail: (id: string) => http.get<LbChallenge>(`/lifebook/challenges/${id}`),
  create: (dto: { title: string; body?: string; city?: string; prize?: string; endsAt?: string; coverUrl?: string }) =>
    http.post<LbChallenge>('/lifebook/challenges', dto),
  join: (id: string, note?: string) => http.post<LbChallenge>(`/lifebook/challenges/${id}/join`, { note }),
  leave: (id: string) => httpRequest<LbChallenge>(`/lifebook/challenges/${id}/join`, { method: 'DELETE' }),
  close: (id: string) => http.post<LbChallenge>(`/lifebook/challenges/${id}/close`, {}),
};

export const lifebookActionsApi = {
  report: (contentId: string, contentType: 'post' | 'comment', reason: string, note?: string) =>
    http.post<{ ok: boolean; quarantined?: boolean }>('/lifebook/report', { contentId, contentType, reason, ...(note?.trim() ? { note: note.trim() } : {}) }),
  commentsState: (postId: string, enabled: boolean) =>
    http.post<{ ok: boolean; allowComments: boolean }>(`/lifebook/posts/${postId}/comments-state`, { enabled }),

  /* ── Acciones con el contrato literal del cliente (rutas reales del servidor) ── */

  /** Me gusta / quitar: `POST /posts/:id/like { liked }`. */
  toggleLike: (postId: string, liked: boolean) =>
    http.post<{ liked: boolean; reaction?: string }>(`/lifebook/posts/${postId}/like`, { liked }),

  /** Guardar / quitar: `POST /posts/:id/save { saved }` (alias de /bookmark). */
  toggleSave: (postId: string, saved: boolean) =>
    http.post<{ bookmarked: boolean }>(`/lifebook/posts/${postId}/save`, { saved }),

  /** Seguir / dejar de seguir: `POST /users/:id/follow { follow }`. */
  toggleFollow: (userId: string, follow: boolean) =>
    http.post<{ following: boolean }>(`/lifebook/users/${userId}/follow`, { follow }),

  /** Comentar: `POST /posts/:id/comments { text, parentId? }` → comentario creado. */
  addComment: (postId: string, text: string, parentId?: string) =>
    http.post<LbCommentItem>(`/lifebook/posts/${postId}/comments`, { text, ...(parentId ? { parentId } : {}) }),

  /**
   * Parte 28 (G4): reportar a una PERSONA (un miembro del grupo, el otro en un
   * 1 a 1). Mismo catálogo de motivos; moderación lo ve como tipo `user`.
   */
  reportUser: (userId: string, reason: string, note?: string) =>
    http.post<{ ok: boolean; reported: string }>(`/lifebook/users/${userId}/report`, { reason, ...(note?.trim() ? { note: note.trim() } : {}) }),
};

// ---------------- Parte 7: bandeja (iconos del header de Mensajes) ----------------

export interface LbInboxCounts { likes: number; saves: number; followers: number; comments: number; mentions: number }

export interface LbPostRef {
  id: string;
  type: string;
  title: string | null;
  preview: string;
  thumb: LbMediaItem | null;
}

export interface LbInboxUser { id: string; fullName: string | null; avatarUrl: string | null; city?: string | null }

export interface LbLikeReceived { at: string; reaction: string; user: LbInboxUser; post: LbPostRef }
export interface LbSaveReceived { at: string; user: LbInboxUser; post: LbPostRef }
export interface LbFollowerItem {
  at: string; id: string; fullName: string | null; avatarUrl: string | null; city: string | null;
  followedBack: boolean; posts: number; verified: { driver: boolean; seller: boolean };
}
export interface LbSuggestedUser {
  id: string; fullName: string | null; avatarUrl: string | null; city: string | null;
  recentPosts: number; verified: { driver: boolean; seller: boolean; food: boolean }; reason: string;
}
export interface LbCommentReceived { id: string; body: string; at: string; user: LbInboxUser; post: LbPostRef }
export interface LbMentionReceived { id: string; snippet: string | null; at: string; read: boolean; user: LbInboxUser; post: LbPostRef | null }

export const lifebookInboxApi = {
  counts: () => http.get<LbInboxCounts>('/lifebook/me/inbox-counts'),
  likes: () => http.get<LbLikeReceived[]>('/lifebook/me/likes-received'),
  saves: () => http.get<LbSaveReceived[]>('/lifebook/me/saves-received'),
  followers: () => http.get<LbFollowerItem[]>('/lifebook/me/new-followers'),
  suggested: () => http.get<LbSuggestedUser[]>('/lifebook/me/suggested-users'),
  comments: () => http.get<LbCommentReceived[]>('/lifebook/me/comments-received'),
  mentions: () => http.get<LbMentionReceived[]>('/lifebook/me/mentions'),
  readMentions: () => http.post<{ ok: boolean }>('/lifebook/me/mentions/read', {}),

  /** Parte 16: marca una bandeja como leída (`likes` · `followers` · `comments`). */
  markRead: (kind: 'likes' | 'followers' | 'comments') =>
    http.post<{ ok: boolean; kind: string }>('/lifebook/me/inbox/read', { kind }),
};

