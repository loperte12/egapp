/**
 * Life Book — constantes de producto (canales del feed, catálogo de temas,
 * tonos, visibilidad, ciudades). Espejo local de DISEÑO-UX-LIFEBOOK-INICIO §2
 * y DISEÑO-UX-LIFEBOOK-PUBLICAR §3.1 (NOTA).
 */
import {
  Briefcase, CarTaxiFront, Heart, Home, MapPin, MessageSquareText, Music,
  Palette, Sparkles, Sun, Tag, Trophy, Utensils, type LucideIcon,
} from 'lucide-react-native';
import { brand } from '@egrouteplan/ui-kit';

export interface LbChannel {
  id: string;
  label: string;
  /** Color de marca del canal (píldora activa rellena). */
  color: string;
  icon: LucideIcon;
}

/**
 * Canales del feed, en orden.
 *
 * REORGANIZACIÓN (lo que pidió el dueño, con la investigación de Xiaohongshu
 * delante — ver `docs/ORGANIZACION-LIFEBOOK-XIAOHONGSHU.md`):
 *
 *  · Arriba van las tres de siempre pero **con los nombres que se pidieron**:
 *    **Seguidos** (canal `following`, que YA filtraba de verdad por gente que sigues),
 *    **Descubrir** (el antiguo «Para ti», canal `for_you`) y **Ciudad** (el antiguo
 *    «Cerca», canal `nearby`).
 *  · OJO con el nombre: antes había «Para ti» (`for_you`, no filtra) y «Siguiendo»
 *    (`following`, sí filtra). Renombrar «Para ti» a «Seguidos» a secas habría dejado
 *    DOS pestañas que parecen lo mismo y una de ellas mentiría. Por eso «Seguidos» es
 *    el canal que filtra, y el otro pasa a llamarse «Descubrir».
 *  · «Ventas» pasa a llamarse **«Comercio»**, que es como lo pidió el dueño (y el
 *    canal del servidor sigue siendo `sales`).
 *  · Se añaden los cuatro canales de la pestaña de ciudad: `tourism`, `bars`, `party`
 *    y `citywalk`. **Estos cuatro son NUESTROS**, no copiados: ni «City walk», ni
 *    «Bares» ni «Fiesta» aparecen en ninguna fuente sobre Xiaohongshu.
 */
export const LB_CHANNELS: LbChannel[] = [
  // ── Las tres de arriba ──────────────────────────────────────────────────────
  { id: 'following', label: 'Seguidos',    color: brand.primary, icon: Heart },
  { id: 'for_you',   label: 'Descubrir',   color: brand.primary, icon: Sparkles },
  { id: 'nearby',    label: 'Ciudad',      color: brand.primary, icon: MapPin },
  // ── Chips de temas (debajo de las pestañas) ─────────────────────────────────
  { id: 'sales',     label: 'Comercio',    color: '#E0439A', icon: Tag },
  { id: 'debates',   label: 'Debates',     color: brand.secondary, icon: MessageSquareText },
  { id: 'food',      label: 'Comida',      color: brand.secondary, icon: Utensils },
  { id: 'culture',   label: 'Cultura',     color: '#8B5CF6', icon: Palette },
  { id: 'music',     label: 'Música',      color: '#8B5CF6', icon: Music },
  { id: 'sports',    label: 'Deportes',    color: brand.success, icon: Trophy },
  { id: 'today',     label: 'Hoy',         color: brand.primary, icon: Sun },
  { id: 'taxi',      label: 'Taxi',        color: brand.primary, icon: CarTaxiFront },
  { id: 'work',      label: 'Trabajo',     color: brand.secondary, icon: Briefcase },
  { id: 'rental',    label: 'Alquiler',    color: brand.secondary, icon: Home },
  // ── Chips de la pestaña CIUDAD ──────────────────────────────────────────────
  { id: 'citywalk',  label: 'City walk',   color: brand.success, icon: MapPin },
  { id: 'tourism',   label: 'Turismo',     color: brand.success, icon: MapPin },
  { id: 'bars',      label: 'Bares',       color: '#8B5CF6', icon: Utensils },
  { id: 'party',     label: 'Fiesta',      color: '#8B5CF6', icon: Music },
];

/** Las tres pestañas de arriba, en orden. El resto del catálogo son chips. */
export const LB_TABS: string[] = ['following', 'for_you', 'nearby'];

/**
 * LOS CHIPS DE CADA SECCIÓN.
 *
 * Es lo que pidió el dueño: «cuando estás en Seguidos los que muestran abajo serán
 * distintos de los que hayan en Descubrir o ciudad». Y no es solo el dibujo: el chip
 * **filtra DENTRO de la sección** (el backend se amplió para eso en esta misma ronda),
 * de forma que «Comercio» en Seguidos es el comercio **de la gente que sigo**, no el de
 * todos.
 *
 * Cada chip puede llevar:
 *   · `type`       → filtra por tipo de publicación (`sale`, `video`, `debate`…).
 *   · `conCiudad`  → manda la ciudad al servidor. Solo lo hacen los chips de la
 *                    pestaña Ciudad: los de Descubrir se quedan globales, como estaban.
 */
export interface LbChip {
  label: string;
  channel: string;
  type?: string;
  conCiudad?: boolean;
}

export const LB_CHIPS_BY_TAB: Record<string, LbChip[]> = {
  /** SEGUIDOS: lo de la gente que sigo, por tipo. */
  following: [
    { label: 'Todo', channel: 'following' },
    { label: 'Comercio', channel: 'following', type: 'sale' },
    { label: 'Vídeos', channel: 'following', type: 'video' },
    { label: 'Debates', channel: 'following', type: 'debate' },
  ],
  /** DESCUBRIR: los temas de siempre, globales (no se manda la ciudad). */
  for_you: [
    { label: 'Comercio', channel: 'sales' },
    { label: 'Debates', channel: 'debates' },
    { label: 'Comida', channel: 'food' },
    { label: 'Cultura', channel: 'culture' },
    { label: 'Música', channel: 'music' },
    { label: 'Deportes', channel: 'sports' },
    { label: 'Hoy', channel: 'today' },
    { label: 'Taxi', channel: 'taxi' },
    { label: 'Trabajo', channel: 'work' },
    { label: 'Alquiler', channel: 'rental' },
  ],
  /** CIUDAD: dentro de TU ciudad (por eso todos llevan `conCiudad`). */
  nearby: [
    { label: 'Recomendado', channel: 'nearby' },
    { label: 'Comercio', channel: 'nearby', type: 'sale' },
    { label: 'City walk', channel: 'citywalk', conCiudad: true },
    { label: 'Comida', channel: 'food', conCiudad: true },
    { label: 'Turismo', channel: 'tourism', conCiudad: true },
    { label: 'Bares', channel: 'bars', conCiudad: true },
    { label: 'Fiesta', channel: 'party', conCiudad: true },
    { label: 'Cultura', channel: 'culture', conCiudad: true },
  ],
};

/* (aquí vivía `LB_VISIBLES`, la lista temporal de la fila única. Se borró al entrar
   la fila doble: ahora son TRES pestañas arriba —`LB_TABS`— y, debajo, los chips de la
   sección activa —`LB_CHIPS_BY_TAB`—.) */

/**
 * Chips que se enseñan debajo de las pestañas cuando NO estás en la ciudad: los
 * temas, con «Comercio» el primero (es lo que pidió el dueño).
 */
export const LB_TOPIC_CHIPS: string[] = [
  'sales', 'debates', 'food', 'culture', 'music', 'sports', 'today', 'taxi', 'work', 'rental',
];

/**
 * Chips de la pestaña **Ciudad**: la ciudad que hayas elegido y, dentro, esto.
 * «Recomendado» es el canal `nearby` (lo de tu ciudad sin filtrar por tema). Los
 * demás son canales por palabras clave, que hoy NO filtran por ciudad en el servidor
 * (van por texto): queda anotado como pendiente, no se disimula.
 */
export const LB_CITY_CHIPS: string[] = [
  'nearby', 'citywalk', 'food', 'tourism', 'bars', 'party', 'culture',
];

/** Ciudades del selector (DISEÑO-UX-LIFEBOOK-INICIO §1.3). */
/**
 * LAS CIUDADES DE GUINEA ECUATORIAL.
 *
 * Antes eran solo cinco (Malabo, Bata, Ebebiyín, Mongomo, Luba) y **faltaba casi todo el país**:
 * no estaban Acurenam, Evinayong, Aconibe, Mbini, Niefang, Micomeseng, Riaba, Annobón… y hasta la
 * ciudad del propio perfil del usuario (Acurenam) no se podía elegir en la lista. Se completa con
 * las cabeceras de distrito y las localidades con contenido real.
 */
export const LB_CITIES = [
  // Región Insular
  'Malabo', 'Luba', 'Riaba', 'San Antonio de Palé', 'Corisco',
  // Región Continental
  'Bata', 'Mbini', 'Niefang', 'Micomeseng', 'Ebebiyín', 'Mongomo', 'Evinayong', 'Aconibe',
  'Acurenam', 'Nsok', 'Oyala', 'Mengomeyén', 'Bidjabidján', 'Cogo',
] as const;

/**
 * Parte 24 (G2) — etiqueta legible del `kind` que devuelve el geocoder de OSM
 * (`api/geocode.ts`), al compartir una ubicación en el chat.
 */
export const LB_PLACE_KIND_LABEL: Record<string, string> = {
  road: 'Vía', residential: 'Calle', primary: 'Avenida', secondary: 'Avenida',
  tertiary: 'Calle', motorway: 'Autovía', trunk: 'Carretera', unclassified: 'Camino',
  service: 'Acceso', living_street: 'Calle', pedestrian: 'Zona peatonal', path: 'Sendero',
  steps: 'Escaleras', village: 'Poblado', town: 'Localidad', city: 'Ciudad',
  suburb: 'Barrio', neighbourhood: 'Barrio', peak: 'Cumbre', park: 'Parque',
  school: 'Colegio', hospital: 'Hospital', restaurant: 'Restaurante', cafe: 'Cafetería',
  fuel: 'Gasolinera', marketplace: 'Mercado', bus_station: 'Estación de bus',
  beach: 'Playa', hotel: 'Hotel', bank: 'Banco', pharmacy: 'Farmacia', church: 'Iglesia',
};

/**
 * Etiqueta para el chip de categoría de la tarjeta (PostCard v2).
 * Cubre los tres espacios de nombres que pueden llegar en `category`:
 * canales del feed (`food`, `taxi`, `sales`…), tipos de enlace de servicio
 * (`food`, `ecomerse`, `work`…) y tipos de publicación (`sale`, `video`…).
 */
export const LB_CATEGORY_LABEL: Record<string, string> = {
  // canales
  for_you: 'Descubrir', following: 'Seguidos', nearby: 'Ciudad', today: 'Hoy',
  debates: 'Debates', food: 'Comida', taxi: 'Taxi', work: 'Trabajo',
  rental: 'Alquiler', sales: 'Comercio', culture: 'Cultura', music: 'Música', sports: 'Deportes',
  tourism: 'Turismo', bars: 'Bares', party: 'Fiesta', citywalk: 'City walk',
  // tipos de publicación
  note: 'Nota', sale: 'Ventas', service: 'Servicio', debate: 'Debate',
  video: 'Vídeo', podcast: 'Podcast', serie: 'Serie',
  // tipos de enlace de servicio
  ecomerse: 'Tienda', shop: 'Tienda', paquete: 'Paquete', delivery: 'Paquete',
  tickets: 'Entradas', lifebook: 'Life Book',
};

/** Etiqueta legible de una categoría (chip de la tarjeta). */
export function lbCategoryLabel(value: string | null | undefined): string | undefined {
  const key = String(value ?? '').trim();
  if (!key) return undefined;
  return LB_CATEGORY_LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1);
}

/** Catálogo local de temas (PUBLICAR §3.1: hasta 5 + hashtags libres). */
export const LB_TOPIC_CATALOG = [
  'vida', 'familia', 'trabajo', 'estudios', 'salud', 'comida', 'cultura',
  'musica', 'deportes', 'fiestas', 'tradiciones', 'negocios', 'transporte', 'anuncio',
];

export const LB_TONE_OPTIONS = [
  { value: 'info', label: 'Informativo' },
  { value: 'opinion', label: 'Opinión' },
  { value: 'denuncia', label: 'Denuncia' },
  { value: 'humor', label: 'Humor' },
  { value: 'pregunta', label: 'Pregunta' },
] as const;

export const LB_VISIBILITY_OPTIONS = [
  { value: 'public', label: 'Todos', hint: 'Lo ve todo el mundo' },
  { value: 'followers', label: 'Seguidores', hint: 'Solo tus seguidores' },
  { value: 'private', label: 'Solo yo', hint: 'Nadie más lo ve' },
] as const;

export type LbVisibility = 'public' | 'followers' | 'private';

/** Límites (espejo backend + diseño). */
export const LB_NOTE_BODY_MAX = 500;
export const LB_NOTE_TITLE_MAX = 60; // diseño: máx 60 en nota
export const LB_NOTE_MEDIA_MAX = 4;
export const LB_NOTE_TOPICS_MAX = 5;
export const LB_TAG_MAX_LEN = 24;

/** Etiqueta corta por tipo de contenido (tarjetas/badges). */
export function lbTypeLabel(type: string): string {
  switch (type) {
    case 'note': return 'NOTA';
    case 'sale': return 'VENTA';
    case 'service': return 'SERVICIO';
    case 'debate': return 'DEBATE';
    default: return String(type).toUpperCase();
  }
}

/** "hace 5 min" · "hace 3 h" · "ayer" · fecha corta. */
export function lbTimeAgo(iso: string | null | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'ayer';
  if (d < 7) return `hace ${d} días`;
  return new Date(iso).toLocaleDateString('es-GQ', { day: 'numeric', month: 'short' });
}

/** Formatea el precio en XAF (1.500 → "1.500 XAF"). */
export function lbXaf(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return '';
  return `${n.toLocaleString('es-GQ')} XAF`;
}

/** "0:45" · "12:34" · "1:02:03" (duración en segundos). */
export function fmtDur(sec: number | null | undefined): string {
  const s = Math.max(0, Math.floor(Number(sec ?? 0) || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(r).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Metadatos visuales por tipo rico (Parte 4). */
export const RICH_TYPE: Record<string, { emoji: string; label: string; color: string }> = {
  video: { emoji: '🎬', label: 'VIDEO', color: '#7C3AED' },
  podcast: { emoji: '🎙️', label: 'PODCAST', color: '#E0439A' },
  serie: { emoji: '📺', label: 'SERIE', color: brand.secondary },
};

/** Mime/extensiones aceptadas para subir (espejo backend). */
export const MEDIA_KIND_ACCEPT: Record<string, { accept: string[]; maxMb: number; maxSec?: number; label: string }> = {
  image: { accept: ['image/jpeg', 'image/png', 'image/webp'], maxMb: 10, label: 'portada' },
  // `video` = perfil CORTO (el del feed rápido). El largo tiene su propio perfil abajo.
  video: { accept: ['video/mp4', 'video/quicktime', 'video/webm'], maxMb: 120, maxSec: 60, label: 'vídeo' },
  audio: { accept: ['audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav', 'audio/ogg'], maxMb: 60, maxSec: 3600, label: 'audio' },
};

/**
 * PERFILES DE VÍDEO (Parte 50) — espejo exacto del backend:
 *   el servidor tiene `video_short` (60 s / 120 MB) y `video_long` (3000 s = 50 min / 1200 MB),
 *   que salen de `MEDIA_MAX_VIDEO_SHORT_MB`, `MEDIA_MAX_VIDEO_LONG_SEC` y `MEDIA_MAX_VIDEO_LONG_MB`.
 *
 * Por qué DOS perfiles y no uno solo más alto: el corto es el que hace que el feed de Like Book
 * cargue al instante; subir el tope del corto a 50 min estropearía el feed para todos. El largo
 * es una decisión explícita del que publica.
 *
 * ⚠️ El tope REAL lo impone el almacenamiento (MinIO) en la URL firmada, no la app: aquí solo
 * se avisa antes de gastar datos del usuario.
 */
export const LB_VIDEO_PERFILES = {
  short: {
    id: 'short' as const,
    maxSec: 60,
    maxMb: 120,
    label: 'Vídeo corto',
    hint: 'hasta 1 min',
    desc: 'El del feed: se ve al instante.',
  },
  long: {
    id: 'long' as const,
    maxSec: 3000,   // 50 min
    maxMb: 1200,
    label: 'Vídeo largo',
    hint: 'hasta 50 min',
    desc: 'Para clases, reportajes, partidos…',
  },
};
export type LbVideoPerfilId = keyof typeof LB_VIDEO_PERFILES;
export type LbVideoPerfil = (typeof LB_VIDEO_PERFILES)[LbVideoPerfilId];

/** Perfil que corresponde a una duración (por defecto, el corto). */
export function lbPerfilVideo(durSec: number | null | undefined): LbVideoPerfil {
  return Number(durSec ?? 0) > LB_VIDEO_PERFILES.short.maxSec ? LB_VIDEO_PERFILES.long : LB_VIDEO_PERFILES.short;
}

/**
 * Velocidad de subida de REFERENCIA, en MB/s, para poder dar un tiempo ANTES de empezar.
 *
 * Medida en el Poco F5 el 13-sep-2026: **0,21 MB/s**. Es el número PESIMISTA a propósito — esa
 * medición se hizo por el peor camino real (VPN activa y el móvil compartiendo conexión a la
 * vez), y la red del propio móvil declara 0,57 MB/s. Un aviso de tiempo solo sirve si promete
 * de menos y tarda menos; si promete el número optimista, el usuario aprende que la app miente.
 *
 * NO se usa el número del servidor (~0,65 MB/s) porque ese es un techo COMPARTIDO por todos y
 * del mismo orden que la red del móvil: no describe la subida de nadie en particular.
 */
export const LB_SUBIDA_MBPS_REFERENCIA = 0.21;

/**
 * Tiempo de subida estimado en texto ("~45 s" · "~24 min" · "~1,2 h") a partir del peso.
 *
 * Es una ESTIMACIÓN con la velocidad de referencia, no una medida: la barra de progreso sí mide.
 * Sirve para decidir ANTES de gastar datos, que es justo cuando el dato hace falta.
 */
export function lbTiempoSubida(bytes: number | null | undefined): string {
  const mb = Math.max(0, Number(bytes ?? 0) || 0) / (1024 * 1024);
  if (mb <= 0) return '';
  const seg = mb / LB_SUBIDA_MBPS_REFERENCIA;
  // Menos de minuto y medio: en segundos se entiende mejor y no asusta con un "2 min".
  if (seg < 90) return `~${Math.max(10, Math.round(seg / 10) * 10)} s`;
  const min = seg / 60;
  if (min < 60) return `~${Math.round(min)} min`;
  return `~${(min / 60).toFixed(1).replace('.', ',')} h`;
}

/** "12,4 MB" · "1,2 GB" — para avisar del peso antes de subir. */
export function lbPeso(bytes: number | null | undefined): string {
  const n = Math.max(0, Number(bytes ?? 0) || 0);
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  const mb = n / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2).replace('.', ',')} GB` : `${mb.toFixed(mb < 10 ? 1 : 0).replace('.', ',')} MB`;
}

export function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
    'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
    'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/ogg': 'ogg',
  };
  return map[mime] ?? 'bin';
}

/** Motivos de reporte (catálogo oficial, espejo backend). */
export const LB_REPORT_REASONS: Array<{ value: string; label: string }> = [
  { value: 'spam', label: 'Spam o publicidad no deseada' },
  { value: 'fraud', label: 'Fraude o estafa' },
  { value: 'false_content', label: 'Información falsa' },
  { value: 'harassment', label: 'Acoso' },
  { value: 'hate', label: 'Discurso de odio' },
  { value: 'sexual', label: 'Contenido sexual' },
  { value: 'violence', label: 'Violencia' },
  { value: 'personal_info', label: 'Datos personales sin permiso' },
  { value: 'illegal_sale', label: 'Venta ilegal' },
  { value: 'impersonation', label: 'Suplantación de identidad' },
  { value: 'false_emergency', label: 'Emergencia falsa' },
];

/** Etiquetas de visibilidad/privacidad (ajustes + publicar). */
export const LB_VIS_LABEL: Record<string, string> = {
  public: 'Todos', followers: 'Seguidores', private: 'Solo yo', nobody: 'Nadie',
};

/** Grupos de privacidad de Ajustes (clave → si admite "Nadie"). */
export const LB_PRIVACY_KEYS: Array<{ key: string; label: string; nobody: boolean }> = [
  { key: 'posts', label: 'Quién puede ver mis publicaciones', nobody: false },
  { key: 'messages', label: 'Quién puede enviarme mensajes', nobody: true },
  { key: 'location', label: 'Quién puede ver mi ubicación', nobody: true },
  { key: 'comments', label: 'Quién puede comentar', nobody: false },
  { key: 'email', label: 'Quién puede ver mi correo', nobody: true },
];

/** Filas de notificaciones (clave → label). */
export const LB_NOTIF_ROWS: Array<{ key: string; label: string }> = [
  { key: 'likes', label: '❤️ Me gusta' },
  { key: 'comments', label: '💬 Comentarios' },
  { key: 'follows', label: '👥 Nuevos seguidores' },
  { key: 'messages', label: '📩 Mensajes' },
  { key: 'orders', label: '📦 Pedidos' },
  { key: 'debates', label: '🗣️ Debates' },
  { key: 'promotions', label: '🎁 Promociones' },
  { key: 'digest', label: '📋 Resumen diario' },
];
export const LB_ORDER_META: Record<string, { label: string; color: string }> = {
  requested: { label: 'Pedido enviado', color: brand.primary },
  accepted: { label: 'Aceptado', color: brand.success },
  declined: { label: 'Rechazado', color: brand.danger },
  in_transit: { label: 'En camino', color: brand.secondary },
  delivered: { label: 'Entregado', color: brand.success },
  cancelled: { label: 'Cancelado', color: '#86909C' },
  disputed: { label: 'Disputa', color: '#E0439A' },
  // Parte 36: estados del COMERCIO (pedido con líneas, tienda y entrega)
  created: { label: 'Pedido creado', color: brand.primary },
  confirmed: { label: 'Confirmado por la tienda', color: brand.success },
  preparing: { label: 'En preparación', color: brand.secondary },
  ready_pickup: { label: 'Listo para recoger', color: '#7C3AED' },
};

/** Barra de progreso del pedido del comercio (Parte 36). */
export const LB_ORDER_FLOW: { status: string; label: string }[] = [
  { status: 'created', label: 'Recibido' },
  { status: 'confirmed', label: 'Confirmado' },
  { status: 'preparing', label: 'En preparación' },
  { status: 'in_transit', label: 'En camino' },
  { status: 'delivered', label: 'Entregado' },
];

/** Acciones del VENDEDOR según el estado (modelo nuevo del comercio). */
export const LB_SELLER_ORDER_ACTIONS: Record<string, string[]> = {
  created: ['accept', 'decline'],
  confirmed: ['prepare', 'send'],
  preparing: ['send', 'ready'],
  in_transit: ['deliver'],
  ready_pickup: ['deliver'],
};

/** Acciones del COMPRADOR según el estado (modelo nuevo). */
export const LB_COMMERCE_BUYER_ACTIONS: Record<string, string[]> = {
  created: ['cancel'],
  confirmed: ['cancel', 'dispute'],
  preparing: ['cancel', 'dispute'],
  in_transit: ['dispute'],
  ready_pickup: ['dispute'],
  delivered: ['dispute'],
};

/** Etiquetas de las acciones nuevas (las antiguas ya están en LB_ORDER_ACTION_LABEL). */
export const LB_ORDER_ACTION_LABEL_EXTRA: Record<string, string> = {
  prepare: 'En preparación',
  ready: 'Listo para recoger',
};


/** Acciones disponibles según rol y estado (cliente). */
export const LB_ORDER_ACTIONS: Record<string, string[]> = {
  requested: ['accept', 'decline'],
  accepted: ['send'],
  in_transit: ['deliver'],
};
export const LB_ORDER_BUYER_ACTIONS: Record<string, string[]> = {
  requested: ['cancel'],
  accepted: ['cancel', 'dispute'],
  in_transit: ['dispute'],
};
export const LB_ORDER_ACTION_LABEL: Record<string, string> = {
  accept: 'Aceptar pedido', decline: 'Rechazar', send: 'Enviar (en camino)',
  deliver: 'Entregar', cancel: 'Cancelar pedido', dispute: 'Abrir disputa',
};
