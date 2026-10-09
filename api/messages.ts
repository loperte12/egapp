/**
 * api/messages.ts — mensajería de Life Book (EG ROUTE PLAN).
 *
 * FACHADA sobre los endpoints reales que ya viven en `api/lifebook.ts`
 * (`lifebookChatApi` / `lifebookInboxApi`): no duplica rutas, solo renombra los
 * campos a la forma del contrato de UI (`peer`, `lastAt`, `unreadCount`,
 * `fromMe`, `text`) y unifica la bandeja.
 *
 * Campos del contrato que el servidor AÚN NO envía (Fase B) y por eso llegan
 * como `undefined`/`false`: `isPinned`, `isMuted`, `peerIsTyping`,
 * `relatedPostId`, `relatedPostTitle`, `LbMessage.kind` distinto de 'text',
 * `postRef`, `status` 'sending'/'delivered'/'failed', `read` en la bandeja
 * (solo las menciones lo tienen) y `nextCursor` (los endpoints no paginan).
 */
import { absUrl } from './config';
import { http, httpRequest } from './httpClient';
import {
  lifebookChatApi, lifebookInboxApi,
  type LbAuthor,
  type LbCommentReceived,
  type LbFollowerItem,
  type LbInboxCounts,
  type LbLikeReceived,
  type LbMentionReceived,
  type LbPostRef,
  type LbSaveReceived,
} from './lifebook';
import { lbTimeAgo } from '../constants/lifebook';

// ── Conversación ──────────────────────────────────────────────

export interface LbConversation {
  id: string;
  /** `direct` (1 a 1) o `group` (Parte 17). */
  kind?: 'direct' | 'group';
  /** Nombre del grupo (solo `kind='group'`). */
  title?: string;
  /** Foto del grupo (solo `kind='group'`). */
  photoUrl?: string | null;
  /** Nº de miembros (solo grupos). */
  members?: number;
  /** Componentes que el dueño permite enviar (solo grupos). */
  allowedKinds?: string[] | null;
  /** Usuario con quien chateas (el servidor lo llama `other`; en grupos, el dueño). */
  peer: LbAuthor;
  lastMessage: string;
  /** ISO (el servidor lo llama `lastMessageAt`). */
  lastAt: string;
  /** 0 = sin badge (el servidor lo llama `unread`). */
  unreadCount: number;
  /** Fase B: fijada arriba (no hay columna todavía). */
  isPinned?: boolean;
  /** Fase B: silenciada. */
  isMuted?: boolean;
  /** Fondo del chat elegido por mí (Parte 17). */
  background?: string | null;
  /** Fase B: requiere estado efímero (hoy el hilo hace polling cada 4 s). */
  peerIsTyping?: boolean;
  /** Fase B: contexto de la publicación que originó el chat. */
  relatedPostId?: string;
  relatedPostTitle?: string;
}

export interface LbConversationPage {
  conversations: LbConversation[];
  /** El servidor devuelve la lista completa: aún no hay cursor. */
  nextCursor: string | null;
}

/** Convierte la respuesta real (`other`/`lastMessageAt`/`unread`) a la forma de UI. */
export function toConversation(c: {
  id: string;
  kind?: string;
  title?: string | null;
  photoUrl?: string | null;
  members?: number;
  allowedKinds?: string[] | null;
  pinned?: boolean;
  muted?: boolean;
  background?: string | null;
  other: { id: string; fullName: string | null; avatarUrl: string | null };
  lastMessage: string | null;
  lastMessageAt: string | null;
  unread: number;
}): LbConversation {
  return {
    id: c.id,
    kind: (c.kind === 'group' ? 'group' : 'direct'),
    title: c.title ?? undefined,
    photoUrl: c.photoUrl ?? null,
    members: c.members,
    allowedKinds: c.allowedKinds ?? null,
    peer: {
      id: c.other?.id ?? '',
      fullName: c.other?.fullName ?? null,
      name: c.other?.fullName ?? null,
      avatarUrl: c.other?.avatarUrl ? absUrl(c.other.avatarUrl) : null,
    },
    lastMessage: c.lastMessage ?? '',
    lastAt: c.lastMessageAt ?? '',
    unreadCount: Number(c.unread ?? 0),
    isPinned: !!c.pinned,
    isMuted: !!c.muted,
    background: c.background ?? null,
  };
}

// ── Mensaje individual ────────────────────────────────────────

/**
 * Tipos de mensaje.
 *
 * HOY el servidor solo produce `text` (la tabla `lifebook.messages` guarda
 * únicamente `body`). El resto está modelado para las siguientes fases:
 *  · Fase B (1 a 1): `post` · `sale` (tarjeta de publicación/venta) · `image` ·
 *    `file` → requieren `messages.kind` + `payload` y subida a MinIO.
 *  · Grupos: `topic` · `location` · `checkin` · `chain` · `vote` · `ad` →
 *    requieren además la entidad GRUPO (hoy las conversaciones son 1 a 1 con
 *    `user_a`/`user_b` y restricción de par único).
 *  · `system`: avisos generados por el servidor.
 */
export type LbMessageKind =
  | 'text'
  | 'image'      // foto enviada o tomada
  | 'post'       // nota compartida
  | 'product'    // TANDA D: tarjeta de PRODUCTO (imagen, nombre, precio y comprar)
  | 'order'      // MERCADO, tanda E: tarjeta de PEDIDO (estado vivo, artículo y total)
  | 'file'       // archivo adjunto
  | 'sale'       // venta personal
  | 'topic'      // tema del grupo
  | 'location'   // mapa del grupo
  | 'checkin'    // check-in / registro diario
  | 'chain'      // cadena del grupo (relevo)
  | 'vote'       // votación del grupo
  | 'ad'         // anuncio del grupo
  /**
   * TARJETA GENÉRICA — un solo tipo para todas las tarjetas de comercio del chat.
   *
   * POR QUÉ UNO Y NO 38. La referencia (小红书 9.49.1) tiene **54 tarjetas** dentro de la
   * conversación —postventa, cupones, logística, devoluciones, regateo, colas, sobres rojos— y sin
   * embargo **no tiene 54 tipos de mensaje**: tiene un motor y 54 fichas de datos. La tarjeta viaja
   * con su nombre y sus datos, y el cliente busca cómo pintarla en un registro.
   *
   * Eso convierte lo que serían 38 tipos nuevos (con 38 migraciones y 38 despliegues) en **uno**.
   * Y una tarjeta nueva pasa a ser un fichero de cliente, no un cambio de servidor.
   *
   * EL RESPALDO ES PARTE DEL DISEÑO, no un extra: si llega un `cardType` que esta versión no
   * conoce, se pinta el aviso de mensaje no soportado y **la conversación sigue funcionando**. Por
   * eso `minAppVersion` viaja en cada tarjeta, como el `min_android_version` de la referencia.
   */
  | 'card'
  | 'system';

export interface LbMessagePostRef {
  id: string;
  title: string;
  coverUrl?: string;
  priceXaf?: number;
  /**
   * PRODUCTO DENTRO DE LA NOTA — el hueco que faltaba frente a la referencia.
   *
   * La tarjeta de nota de 小红书 (`bcim_chat_note_92`) no enseña solo la portada y el título: debajo
   * lleva **la fila del autor** y, separado por una línea, **el producto con su precio original y el
   * rebajado**. Sin eso, una nota compartida en el chat no dice quién la escribió ni qué se vende.
   *
   * Va como **foto del momento**, no como producto vivo (igual que `LbMessageOrderItem`): si la
   * tienda cambia el precio después, la nota sigue contando lo que decía el día que se compartió.
   * El precio vigente es cosa de la tarjeta de producto (`productRef`), no de esta.
   */
  product?: {
    title?: string | null;
    imageUrl?: string | null;
    /** Precio de venta en el momento de compartir. */
    priceXaf?: number | null;
    /** Precio antes de la rebaja. Si viene y es mayor, se enseña tachado. */
    originalPriceXaf?: number | null;
    /** Línea corta del servidor («últimas unidades», «envío gratis»…). */
    note?: string | null;
  } | null;
}

export interface LbMessageFileRef {
  name: string;
  /** "2,4 MB" */
  sizeLabel: string;
  /** pdf, docx… */
  ext?: string;
  /** URL de descarga (cuando exista en MinIO). */
  url?: string;
}

export interface LbMessageLocationRef {
  /** "Mercado de Malabo" */
  label: string;
  lat?: number | null;
  lng?: number | null;
}

export interface LbMessageVoteRef {
  question: string;
  options: string[];
  /** Votos por opción (misma longitud que `options`) y mi voto (Parte 24). */
  counts?: number[];
  myVote?: number | null;
  /** Suma de todos los votos. */
  total?: number;
  closedAt?: string;
}

/** Persona apuntada a una cadena o a una quedada (Parte 25). */
export interface LbMessageJoiner {
  id: string;
  name: string;
  avatarUrl: string | null;
}

export interface LbMessageChainRef {
  /** "Pedido de arroz – 12/10" */
  title: string;
  /** Detalle opcional (qué se compra, condiciones…). */
  note?: string | null;
  /** Plazas disponibles (null = sin tope). */
  slots?: number | null;
  /** Apuntados. */
  joined: number;
  /** ¿Ya me he apuntado? */
  joinedByMe?: boolean;
  /** Quiénes están apuntados (los primeros). */
  members?: LbMessageJoiner[];
}

/** Quedada (Parte 25): sitio + hora + quiénes van. */
export interface LbMessageCheckinRef {
  /** Fecha/hora en ISO. */
  at: string | null;
  /** Etiqueta ya formateada por el servidor ("hoy 18:30", "mañana 09:00"). */
  when: string;
  going: number;
  goingByMe: boolean;
  members?: LbMessageJoiner[];
}

/** Anuncio de grupo (Parte 26): texto, precio, foto y enlace a un servicio. */
export interface LbMessageAdRef {
  title: string | null;
  text: string;
  priceXaf: number | null;
  imageUrl: string | null;
  /** Enlace opcional a un servicio (con su ruta de la app). */
  link: { type: string; id: string | null; route: string | null } | null;
}

/**
 * TANDA D — tarjeta de PRODUCTO dentro del chat. El servidor la resuelve al leer el mensaje, así
 * que el precio es el de hoy y no el del día en que se envió.
 */
export interface LbMessageProductRef {
  id: string;
  title: string;
  priceXaf: number | null;
  currency: string;
  coverUrl: string | null;
  shopId: string | null;
  /** `false` si el producto ya no está a la venta: se dice, no se ofrece comprarlo. */
  available: boolean;
  /** Variante ya elegida por el cliente («Talla: M · Color: Negro»). `null` si no eligió. */
  variantLabel?: string | null;
  /** `true` = es una CONSULTA desde la ficha: se pinta la línea gris que lo avisa. */
  asking?: boolean;
}

/**
 * MERCADO (tanda E) — una línea de la tarjeta de pedido. Es la **foto del momento de la compra**:
 * si la tienda borra el producto, el pedido sigue contando lo que se compró.
 */
export interface LbMessageOrderItem {
  title: string;
  /** Variante elegida («Talla: M · Color: Negro»). */
  variant: string | null;
  mediaUrl: string | null;
  quantity: number;
  lineTotalXaf: number;
}

/**
 * MERCADO (tanda E) — el PEDIDO dentro del chat.
 *
 * El **estado viene del servidor al leer el mensaje** (no del día en que se creó), así que la
 * tarjeta no enseña un estado viejo. `social` es el aviso de grupo: «✅ {quien} compró {producto}».
 */
export interface LbMessageOrderRef {
  id: string;
  code: string;
  status: string;
  totalXaf: number;
  deliveryMode: string | null;
  createdAt: string | null;
  deliveredAt: string | null;
  /** Quién compró (para el aviso social del grupo). */
  buyerName: string | null;
  shopName: string | null;
  /** `true` = mensaje de grupo: se lee como «Fulano compró esto», no como «tu pedido». */
  social: boolean;
  items: LbMessageOrderItem[];
  /**
   * EL TICKET: lo que la tienda necesita para entregar y cobrar. El servidor los manda **solo** en la
   * tarjeta del chat comprador↔tienda; en las de grupo (`social`) vienen en `null` a propósito,
   * porque la dirección y la nota del comprador no son asunto de un grupo.
   */
  paymentMethod?: string | null;
  deliveryAddress?: { city?: string; zone?: string; reference?: string; lat?: number; lng?: number } | null;
  note?: string | null;
  /** TANDA Q: lo que quitó el cupón en esa compra (0 si no se usó ninguno). */
  discountXaf?: number | null;
  couponCode?: string | null;
}

export interface LbMessage {
  id: string;
  conversationId?: string;
  /** El servidor lo llama `mine`. */
  fromMe: boolean;
  kind: LbMessageKind;
  /** Texto del mensaje (el servidor lo llama `body`). */
  text: string;
  createdAt: string;
  /** `sent` al enviar y `read` con `read_at`; el resto es de cliente (Fase B/C). */
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  /** Autor cuando el mensaje no es mío (útil en grupos y en la tarjeta). */
  author?: LbAuthor;
  postRef?: LbMessagePostRef;
  /** TANDA D: tarjeta de producto (kind='product'). */
  productRef?: LbMessageProductRef;
  /** MERCADO, tanda E: tarjeta de pedido (kind='order'). */
  orderRef?: LbMessageOrderRef;
  /** URL de la foto (kind='image'). */
  imageUrl?: string;
  fileRef?: LbMessageFileRef;
  locationRef?: LbMessageLocationRef;
  voteRef?: LbMessageVoteRef;
  chainRef?: LbMessageChainRef;
  /** Parte 25: quedada (sitio + hora + quiénes van). */
  checkinRef?: LbMessageCheckinRef;
  /** Parte 26: anuncio de grupo. */
  adRef?: LbMessageAdRef;
  /** Tarjeta genérica de comercio (`kind='card'`). Sostiene las 54 tarjetas del chat. */
  cardRef?: LbMessageCardRef;
}

/**
 * LA TARJETA GENÉRICA — `kind='card'`.
 *
 * Cómo lo hace la referencia, y por qué se copia así:
 *
 *  · **La tarjeta se identifica por su nombre** (`cardType`). En 小红书 cada tarjeta es un paquete
 *    con nombre (`bcim_chat_coupon_19`) y el cliente la resuelve por ese nombre, igual que un
 *    registro de componentes. Aquí `cardType` usa el nombre corto del negocio: `'cupon'`,
 *    `'postventa'`, `'logistica'`…
 *
 *  · **Cada tarjeta declara su versión** (`version`) y **la versión mínima de app** que la entiende
 *    (`minAppVersion`). Es el `min_android_version` / `min_ios_version` del DSL de la referencia.
 *    Sirve para lo mismo: que un cliente viejo no intente pintar algo que no conoce y se rompa.
 *    Si `minAppVersion` es mayor que la app instalada, se pinta el respaldo aunque el `cardType`
 *    sí se conozca — porque puede haber cambiado la forma de los datos.
 *
 *  · **Los datos van en `payload`**, sin tipar aquí a propósito. El tipo de `payload` lo declara
 *    cada componente de tarjeta (`DatosCupon`, `DatosPostventa`…) y el registro es el que une
 *    `cardType` con su tipo. Tiparlo aquí obligaría a tocar este fichero cada vez que se añade una
 *    tarjeta: exactamente lo que el tipo genérico viene a evitar.
 */
export interface LbMessageCardRef {
  /** Nombre corto de la tarjeta: `'cupon'`, `'postventa'`, `'logistica'`… */
  cardType: string;
  /** Versión de la tarjeta, por si cambia la forma de los datos. */
  version?: string;
  /** Versión mínima de app que sabe pintarla. Si es mayor que la instalada, sale el respaldo. */
  minAppVersion?: string;
  /** Los datos de la tarjeta. Su forma la declara el componente que la pinta. */
  payload?: unknown;
}

/** Acciones del botón "+" del chat (hoja de acciones). */
export type LbChatAction =
  | 'photos' | 'camera' | 'shareNote' | 'file' | 'sale' | 'topic' | 'product'
  | 'groupMap' | 'checkin' | 'chain' | 'vote' | 'groupAd' | 'challengePlaza';

export interface LbMessagePage {
  messages: LbMessage[];
  nextCursor: string | null;
}

/** Campos que el servidor devuelve por mensaje (Parte 15/17). */
export interface LbMessageRaw {
  id: string;
  conversationId?: string;
  mine: boolean;
  body: string;
  kind?: string;
  readAt: string | null;
  createdAt: string | null;
  postRef?: LbMessagePostRef;
  /** TANDA D: tarjeta de producto, ya resuelta por el servidor al leer el mensaje. */
  productRef?: LbMessageProductRef;
  /** MERCADO, tanda E: tarjeta de pedido, con el estado ya resuelto al leer el mensaje. */
  orderRef?: LbMessageOrderRef;
  imageUrl?: string;
  fileRef?: LbMessageFileRef;
  /** Parte 24: punto compartido y votación (ya resueltos por el servidor). */
  locationRef?: LbMessageLocationRef;
  voteRef?: LbMessageVoteRef;
  /** Parte 25: cadena y quedada (con sus apuntados). */
  chainRef?: LbMessageChainRef;
  checkinRef?: LbMessageCheckinRef;
  /** Parte 26: anuncio de grupo. */
  adRef?: LbMessageAdRef;
  /**
   * TARJETA GENÉRICA: el servidor manda el nombre de la tarjeta, su versión y sus datos, y el
   * cliente decide cómo pintarla con el registro de `components/lifebook/tarjetas/registro.tsx`.
   * El `payload` va sin tipar: su forma la declara el componente de cada tarjeta.
   */
  cardRef?: LbMessageCardRef;
  payload?: Record<string, unknown>;
  sender?: { id: string; fullName: string | null; avatarUrl: string | null };
}

export function toMessage(m: LbMessageRaw): LbMessage {
  const kind = (m.kind ?? 'text') as LbMessageKind;
  return {
    id: m.id,
    conversationId: m.conversationId,
    fromMe: !!m.mine,
    kind,
    text: m.body ?? '',
    createdAt: m.createdAt ?? new Date().toISOString(),
    status: m.readAt ? 'read' : 'sent',
    author: m.sender
      ? { id: m.sender.id, fullName: m.sender.fullName, name: m.sender.fullName, avatarUrl: m.sender.avatarUrl ? absUrl(m.sender.avatarUrl) : null }
      : undefined,
    /*
     * La nota compartida. La foto del PRODUCTO DE LA NOTA también se resuelve aquí: el servidor manda
     * la clave relativa, y sin esta línea la miniatura del producto saldría en blanco — el mismo
     * fallo que tuvo la tarjeta de producto en la tanda D, que ya se ha repetido tres veces en este
     * fichero. Cada vez que se añade una foto a un tipo, hay que acordarse de esto.
     */
    postRef: m.postRef
      ? {
        ...m.postRef,
        coverUrl: m.postRef.coverUrl ? absUrl(m.postRef.coverUrl) : m.postRef.coverUrl,
        product: m.postRef.product
          ? {
            ...m.postRef.product,
            imageUrl: m.postRef.product.imageUrl ? absUrl(m.postRef.product.imageUrl) : m.postRef.product.imageUrl,
          }
          : m.postRef.product,
      }
      : m.postRef,
    /* TANDA D: la tarjeta de producto. Sin esta línea el mensaje llegaba como TEXTO
       («🛍 Producto …») y no como tarjeta: comprobado en el teléfono antes de arreglarlo. */
    productRef: m.productRef && m.productRef.coverUrl
      ? { ...m.productRef, coverUrl: absUrl(m.productRef.coverUrl) }
      : m.productRef,
    /* MERCADO (tanda E): la tarjeta del pedido. Si faltara este mapeo, el mensaje llegaría como
       TEXTO plano —exactamente el fallo que tuvo la tarjeta de producto en la tanda D. La foto del
       artículo también se resuelve aquí (el servidor manda la clave relativa). */
    orderRef: m.orderRef
      ? {
        ...m.orderRef,
        items: (m.orderRef.items ?? []).map((i) => ({
          ...i,
          mediaUrl: i.mediaUrl ? absUrl(i.mediaUrl) : null,
        })),
      }
      : undefined,
    imageUrl: m.imageUrl,
    fileRef: m.fileRef,
    locationRef: m.locationRef,
    voteRef: m.voteRef,
    chainRef: m.chainRef,
    checkinRef: m.checkinRef,
    adRef: m.adRef,
    /*
     * TARJETA GENÉRICA. Este mapeo NO es opcional: sin él, el mensaje llegaría como TEXTO plano,
     * que es exactamente el fallo que tuvo la tarjeta de producto en la tanda D —lo dice el
     * comentario de arriba— y el de la tarjeta de pedido en la tanda E. La trampa se repite cada
     * vez que se añade un tipo con datos propios, así que se deja escrito.
     */
    cardRef: m.cardRef,
  };
}

// ── Notificaciones de bandeja ─────────────────────────────────

export type LbInboxType = 'likes' | 'followers' | 'comments';

export interface LbInboxItem {
  id: string;
  kind: LbInboxType;
  /** Quién generó la acción (el servidor lo llama `user`). */
  actor: LbAuthor;
  /** Texto fijo por tipo: "le gustó tu nota" · "te sigue" · "comentó"… */
  action: string;
  /** Texto del comentario o de la mención. */
  text?: string;
  /** Publicación afectada. */
  targetPostId?: string;
  targetTitle?: string;
  targetCover?: string;
  createdAt: string;
  /** Real solo en menciones: likes/guardados/seguidores/comentarios no lo marcan. */
  read: boolean;
  /** Solo en seguidores. */
  followedBack?: boolean;
}

export interface LbInboxPage {
  items: LbInboxItem[];
  /** El servidor devuelve arrays sin cursor: aún no hay paginación. */
  nextCursor: string | null;
}

const actor = (u: { id: string; fullName: string | null; avatarUrl: string | null } | null | undefined): LbAuthor => ({
  id: u?.id ?? '',
  fullName: u?.fullName ?? null,
  name: u?.fullName ?? null,
  avatarUrl: u?.avatarUrl ? absUrl(u.avatarUrl) : null,
});

const target = (p: LbPostRef | null | undefined) => ({
  targetPostId: p?.id,
  targetTitle: p?.title ?? p?.preview ?? undefined,
  targetCover: p?.thumb?.url ? absUrl(p.thumb.url) : undefined,
});

function fromLike(x: LbLikeReceived, kind: LbInboxType): LbInboxItem {
  return {
    id: `${kind}:${x.user?.id}:${x.post?.id}:${x.at}`,
    kind,
    actor: actor(x.user),
    action: kind === 'likes' ? 'le gustó tu nota' : 'guardó tu nota',
    ...target(x.post),
    createdAt: x.at,
    read: false,
  };
}

function fromFollower(x: LbFollowerItem): LbInboxItem {
  return {
    id: `followers:${x.id}:${x.at}`,
    kind: 'followers',
    actor: actor({ id: x.id, fullName: x.fullName, avatarUrl: x.avatarUrl }),
    action: 'te sigue',
    createdAt: x.at,
    read: false,
    followedBack: !!x.followedBack,
  };
}

function fromComment(x: LbCommentReceived): LbInboxItem {
  return {
    id: `comments:${x.id}`,
    kind: 'comments',
    actor: actor(x.user),
    action: 'comentó',
    text: x.body,
    ...target(x.post),
    createdAt: x.at,
    read: false,
  };
}

function fromMention(x: LbMentionReceived): LbInboxItem {
  return {
    id: `comments:${x.id}`,
    kind: 'comments',
    actor: actor(x.user),
    action: 'te mencionó',
    text: x.snippet ?? undefined,
    ...target(x.post),
    createdAt: x.at,
    read: !!x.read,
  };
}

// ── Derivado para UI ──────────────────────────────────────────

export interface LbConversationCard {
  id: string;
  name: string;
  avatarUrl?: string;
  lastMessage: string;
  timeLabel: string;
  unreadCount: number;
  isPinned: boolean;
  isMuted: boolean;
  /** `true` cuando la conversación es un grupo (Parte 17). */
  isGroup: boolean;
  /** Nº de miembros (solo grupos). */
  memberCount?: number;
  relatedPostTitle?: string;
}

export function toConversationCard(c: LbConversation): LbConversationCard {
  // En un grupo el nombre y la foto son los del grupo, no los del dueño:
  // el servidor devuelve en `other` al creador, que no es el título del chat.
  const isGroup = c.kind === 'group';
  return {
    id: c.id,
    name: isGroup
      ? c.title?.trim() || 'Grupo'
      : c.peer.name?.trim() || c.peer.fullName?.trim() || 'Usuario',
    avatarUrl: (isGroup ? c.photoUrl : c.peer.avatarUrl) ?? undefined,
    lastMessage: c.lastMessage,
    timeLabel: lbTimeAgo(c.lastAt),
    unreadCount: c.unreadCount,
    isPinned: !!c.isPinned,
    isMuted: !!c.isMuted,
    isGroup,
    memberCount: isGroup ? c.members : undefined,
    relatedPostTitle: c.relatedPostTitle,
  };
}

// ── API ───────────────────────────────────────────────────────

export const messagesApi = {
  /** Conversaciones con la forma de UI (sin cursor: el servidor no pagina). */
  conversations: async (): Promise<LbConversationPage> => ({
    conversations: (await lifebookChatApi.conversations()).map(toConversation),
    nextCursor: null,
  }),

  /** Total de mensajes sin leer (badge de la barra). */
  unreadTotal: () => lifebookChatApi.unread(),

  /** Abre (o crea) la conversación con alguien. `postId` llegará en la Fase B. */
  open: async (userId: string, postId?: string) => {
    const conv = await lifebookChatApi.open(userId);
    void postId; // Fase B: enviar el contexto de la publicación
    return toConversation(conv);
  },

  messages: async (conversationId: string, o: { before?: string; limit?: number } = {}): Promise<LbMessagePage> => {
    const page = await lifebookChatApi.messages(conversationId, o);
    return { messages: (page.messages ?? []).map((m) => toMessage(m as unknown as LbMessageRaw)), nextCursor: page.nextCursor ?? null };
  },

  /**
   * Envía un mensaje (Parte 15).
   *  · texto: `{ text }`
   *  · compartir publicación: `{ kind: 'post' | 'sale', postId }` (el servidor
   *    resuelve el `postRef` con id, título y precio)
   *  · foto: `{ kind: 'image', mediaUrl }` (subida con `/media/upload?kind=image`)
   *  · archivo: `{ kind: 'file', mediaUrl, fileName, fileSize }`
   *  · ubicación (Parte 24): `{ kind: 'location', lat, lng, label }`
   *  · votación (Parte 24): `{ kind: 'vote', question, options }`
   *  · cadena (Parte 25): `{ kind: 'chain', title, note, slots }`
   *  · quedada (Parte 25): `{ kind: 'checkin', label, lat, lng, at }`
   *  · anuncio (Parte 26): `{ kind: 'ad', title, text, priceXaf?, mediaUrl?, linkType?, linkId? }`
   */
  send: async (
    conversationId: string,
    input: string | {
      text?: string; kind?: LbMessageKind; postId?: string; productId?: string; mediaUrl?: string; fileName?: string; fileSize?: number;
      lat?: number; lng?: number; label?: string; question?: string; options?: string[];
      title?: string; note?: string; slots?: number; at?: string;
      priceXaf?: number; linkType?: string; linkId?: string;
    },
  ): Promise<LbMessage> => {
    const payload = typeof input === 'string' ? { text: input } : input;
    const res = await lifebookChatApi.sendRich(conversationId, payload);
    return {
      id: res.id,
      conversationId,
      fromMe: true,
      kind: (res.kind ?? 'text') as LbMessageKind,
      text: res.body ?? payload.text ?? '',
      createdAt: res.createdAt ?? new Date().toISOString(),
      status: 'sent',
    };
  },

  /**
   * Parte 24 (G2): vota en un mensaje de votación y devuelve el `voteRef`
   * actualizado (recuentos + mi voto) para repintar la burbuja sin recargar.
   */
  vote: async (messageId: string, optionIdx: number): Promise<LbMessageVoteRef> => {
    const res = await lifebookChatApi.vote(messageId, optionIdx);
    return {
      question: '',          // el servidor no repite la pregunta: la conserva la burbuja
      options: res.options ?? [],
      counts: res.counts ?? [],
      myVote: res.myVote ?? optionIdx,
      total: res.total ?? 0,
    };
  },

  /**
   * Parte 25 (G2-b): me apunto (o me doy de baja con `joined: false`) en una
   * cadena o una quedada. Devuelve el recuento y la lista de apuntados.
   */
  join: async (messageId: string, joined = true): Promise<{ joined: boolean; count: number; slots: number | null; members: LbMessageJoiner[] }> => {
    const res = await lifebookChatApi.join(messageId, joined);
    return {
      joined: !!res.joined,
      count: Number(res.count ?? 0),
      slots: res.slots ?? null,
      members: res.members ?? [],
    };
  },

  /**
   * Parte 26 (G2-c): anuncios de grupo que me quedan hoy (el límite es 15 al día
   * por persona y lo aplica el servidor).
   */
  adsLeft: (): Promise<{ limit: number; used: number; left: number }> => lifebookChatApi.adsLeft(),

  markRead: (conversationId: string) => lifebookChatApi.markRead(conversationId),

  /** Contadores de la bandeja (ventana de 7 días). */
  inboxCounts: (): Promise<LbInboxCounts> => lifebookInboxApi.counts(),

  /**
   * Bandeja unificada. Por defecto trae me gustas + guardados, seguidores y
   * comentarios + menciones, todo normalizado a `LbInboxItem`.
   */
  inbox: async (types: LbInboxType[] = ['likes', 'followers', 'comments']): Promise<LbInboxPage> => {
    const items: LbInboxItem[] = [];
    if (types.includes('likes')) {
      const [likes, saves] = await Promise.all([
        lifebookInboxApi.likes().catch(() => [] as LbLikeReceived[]),
        lifebookInboxApi.saves().catch(() => [] as LbSaveReceived[]),
      ]);
      items.push(...likes.map((x) => fromLike(x, 'likes')));
      items.push(...saves.map((x) => fromLike(x as unknown as LbLikeReceived, 'likes')));
    }
    if (types.includes('followers')) {
      const followers = await lifebookInboxApi.followers().catch(() => [] as LbFollowerItem[]);
      items.push(...followers.map(fromFollower));
    }
    if (types.includes('comments')) {
      const [comments, mentions] = await Promise.all([
        lifebookInboxApi.comments().catch(() => [] as LbCommentReceived[]),
        lifebookInboxApi.mentions().catch(() => [] as LbMentionReceived[]),
      ]);
      items.push(...comments.map(fromComment));
      items.push(...mentions.map(fromMention));
    }
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { items, nextCursor: null };
  },

  /** Marca las menciones como leídas (lo único con marca de leído hoy). */
  readMentions: () => lifebookInboxApi.readMentions(),

  /* ── Parte 17 (G1): grupos y ajustes del chat ── */

  /** Crea un grupo (dueño = yo; máx. 200 miembros). */
  createGroup: (title: string, memberIds: string[], meta?: LbGroupMeta) =>
    http.post<LbGroup>('/lifebook/groups', {
      title,
      memberIds,
      ...(meta ?? {}),
    }),

  group: (id: string) => http.get<LbGroup>(`/lifebook/groups/${id}`),

  updateGroup: (id: string, patch: {
    title?: string; photoUrl?: string; allowedKinds?: string[];
    /** Metadatos del grupo (Partes 19–20): también se editan desde aquí. */
    visibility?: 'public' | 'private' | 'hidden'; city?: string; barrio?: string;
    category?: string; description?: string;
  }) => httpRequest<LbGroup>(`/lifebook/groups/${id}`, { method: 'PATCH', body: patch }),

  /** Añade miembros al grupo (con `invitePolicy='all'` puede cualquier miembro). */
  addGroupMembers: (id: string, memberIds: string[]) =>
    http.post<LbGroup>(`/lifebook/groups/${id}/members`, { memberIds }),

  removeGroupMember: (id: string, userId: string) =>
    httpRequest<{ ok: boolean }>(`/lifebook/groups/${id}/members/${userId}`, { method: 'DELETE' }),

  leaveGroup: (id: string) => http.post<{ ok: boolean }>(`/lifebook/groups/${id}/leave`, {}),

  /* ── Parte 22: gestión (estilo Xiaohongshu) ── */

  /** Ajustes del grupo: anuncio, bienvenida, historial, quién habla, quién invita y el tema. */
  groupSettings: (id: string, patch: {
    announcement?: string | null; welcomeMessage?: string | null;
    showHistory?: boolean; membersCanSpeak?: boolean; invitePolicy?: 'all' | 'admins';
    /** Parte 25 (G2-b): tema del grupo (se anuncia en el hilo al cambiarlo). */
    topic?: string | null;
    /** Parte 29 (G4): quitar inactivos y a partir de cuántos días. */
    autoRemoveInactive?: boolean;
    inactiveDays?: number;
  }) => httpRequest<LbGroup>(`/lifebook/groups/${id}/settings`, { method: 'PATCH', body: patch }),

  /** Nombra administrador (solo el dueño). */
  setGroupAdmin: (id: string, userId: string) =>
    http.post<LbGroup>(`/lifebook/groups/${id}/admins`, { userId }),

  /** Quita el rol de administrador (solo el dueño). */
  unsetGroupAdmin: (id: string, userId: string) =>
    httpRequest<LbGroup>(`/lifebook/groups/${id}/admins/${userId}`, { method: 'DELETE' }),

  /** Cede el grupo: el dueño actual pasa a administrador. */
  transferGroup: (id: string, userId: string) =>
    http.post<LbGroup>(`/lifebook/groups/${id}/owner`, { userId }),

  /** Disuelve el grupo (solo el dueño): borra miembros y mensajes. */
  dissolveGroup: (id: string) =>
    httpRequest<{ ok: boolean; dissolved: boolean; messagesRemoved: number }>(
      `/lifebook/groups/${id}`, { method: 'DELETE' }),

  /** No molestar · fijar arriba · fondo del chat. */
  chatPrefs: (conversationId: string, patch: { muted?: boolean; pinned?: boolean; background?: string | null }) =>
    http.post<{ ok: boolean }>(`/lifebook/chat/conversations/${conversationId}/prefs`, patch),

  /** Borra MI historial del chat. */
  clearChat: (conversationId: string) =>
    httpRequest<{ ok: boolean }>(`/lifebook/chat/conversations/${conversationId}/messages`, { method: 'DELETE' }),

  /** Parte 23: borra UN mensaje para todos (el mío; en grupos también dueño/admin). */
  deleteMessage: (conversationId: string, messageId: string) =>
    httpRequest<{ ok: boolean }>(
      `/lifebook/chat/conversations/${conversationId}/messages/${messageId}`, { method: 'DELETE' }),

  /** Busca en el historial por tipo: image · file · post · sale · system · emoji · link. */
  searchChat: (conversationId: string, kind: LbChatSearchKind, limit = 50) =>
    http.get<{ kind: string; total: number; messages: LbMessage[] }>(
      `/lifebook/chat/conversations/${conversationId}/search?kind=${kind}&limit=${limit}`,
    ).then((r) => ({ ...r, messages: (r.messages ?? []).map((m) => toMessage(m as unknown as LbMessageRaw)) })),

  /** Reclamación por estafa (crea un reporte de fraude para moderación). */
  claim: (conversationId: string, note?: string) =>
    http.post<{ ok: boolean; reported: string; contentId: string; already?: boolean }>(
      `/lifebook/chat/conversations/${conversationId}/claim`, { note },
    ),
};

/**
 * Tipos de búsqueda dentro del historial del chat.
 * `location`, `vote`, `chain`, `topic`, `checkin` y `ad` son componentes de
 * grupo (Fases G2–G4): hoy no hay mensajes de ese tipo, así que la búsqueda
 * devuelve una lista vacía.
 */
export type LbChatSearchKind =
  | 'image' | 'file' | 'post' | 'sale' | 'system' | 'order' | 'emoji' | 'link'
  | 'location' | 'vote' | 'chain' | 'topic' | 'checkin' | 'ad';

export interface LbGroupMember {
  id: string;
  fullName: string | null;
  avatarUrl: string | null;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  iFollow: boolean;
}

/** Metadatos opcionales del grupo (fase Xiaohongshu). */
export interface LbGroupMeta {
  city?: string;                 // LB_CITIES
  barrio?: string;
  category?: string;             // 'food' | 'taxi' | 'sales' | 'culture' | …
  description?: string;          // máx. 200
  visibility?: 'public' | 'private' | 'hidden';
  allowedKinds?: string[];       // permisos de mensajes dentro del grupo
  /* ── Parte 21: flujo de crear ruta/grupo ── */
  placeName?: string;            // punto de encuentro (nombre del geocoder)
  placeAddress?: string;         // etiqueta corta del sitio
  placeLon?: number;
  placeLat?: number;
  hidePlace?: boolean;           // ocultar el punto a quien no sea miembro
  joinMode?: 'open' | 'approval' | 'question';
  joinQuestion?: string;
  joinAnswer?: string;           // el servidor NO la devuelve nunca
}

/** Respuesta corta tras crear un grupo. */
export interface LbGroupCreated {
  id: string;
  title: string;
  photoUrl?: string | null;
}

export interface LbGroup {
  id: string;
  kind: 'group';
  title: string;
  photoUrl: string | null;
  ownerId: string;
  membersCount: number;
  myRole: 'owner' | 'admin' | 'member';
  allowedKinds: string[] | null;
  muted: boolean;
  pinned: boolean;
  /** Fondo del chat elegido por mí (Parte 18). */
  background?: string | null;
  /* ── Metadatos del grupo (Parte 19) ── */
  city?: string | null;
  barrio?: string | null;
  category?: string | null;
  description?: string | null;
  visibility?: 'public' | 'private' | 'hidden';
  /* ── Punto de encuentro y condición de ingreso (Parte 21) ── */
  placeName?: string | null;
  placeAddress?: string | null;
  placeLon?: number | null;
  placeLat?: number | null;
  hidePlace?: boolean;
  joinMode?: 'open' | 'approval' | 'question';
  joinQuestion?: string | null;
  /** `true` si hay respuesta guardada (la respuesta no se devuelve nunca). */
  hasJoinAnswer?: boolean;
  /* ── Gestión del grupo (Parte 22, estilo Xiaohongshu) ── */
  announcement?: string | null;
  announcementAt?: string | null;
  welcomeMessage?: string | null;
  showHistory?: boolean;
  membersCanSpeak?: boolean;
  invitePolicy?: 'all' | 'admins';
  adminsCount?: number;
  /** Parte 25 (G2-b): tema del grupo y cuándo se cambió. */
  topic?: string | null;
  topicAt?: string | null;
  /** Parte 29 (G4): quitar inactivos y a partir de cuántos días. */
  autoRemoveInactive?: boolean;
  inactiveDays?: number;
  createdAt: string | null;
  members: LbGroupMember[];
}
