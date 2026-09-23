// =============================================================================
// LifebookService — LIFE BOOK Partes 1+2+3+4 (backend).
// Contenido unificado en lifebook.posts: note | sale | service | debate |
// video | podcast | serie.
// Interacciones: like, comment (1 nivel), follow, bookmark, report (moderación).
// Parte 2: venta y servicio con payload propio; DEBATE con propuestas votadas y
// estados auditados; enlaces a servicios reales verificados por rol (service_link).
// Parte 3: feed por CANALES (for_you | following | nearby | today | debates |
// food | taxi | work | rental | sales | culture | music | sports) y PERFIL
// PÚBLICO (GET users/:id/profile con contadores, badges de rol verificado y
// relación; GET users/:id/posts con visibilidad).
// Parte 4: VIDEO corto (≤60 s) + PODCAST (audio + portada) + SERIE (episodios
// por temporadas en lifebook.series_episodes). El archivo se sube por
// multipart a MinIO (lb-videos | lb-audio | lb-images) y la publicación guarda
// las URLs en payload (videoUrl/audioUrl/coverUrl/durationSec/permisos).
// Todo en español, autor = JWT mobility.
//
// Reglas clave:
//  · Publicar exige sesión y estado ACTIVE del usuario.
//  · Visibilidad public|followers|private; followers exige relación follow.
//  · 1 like / 1 follow / 1 bookmark por usuario (PK compuesta).
//  · 1 reporte por (content, reporter).
//  · Venta: precio numérico XAF; contacto inapp|phone|whatsapp (+240).
//  · Debate: 1 propuesta por usuario se permite (varias), 1 voto por propuesta
//    (UPSERT), estados solo del autor (o moderador) y auditados.
//  · service_link verificado por rol del autor (taxi→driver, food→restaurante,
//    ecomerse→tienda, work→reclutador, rental→anfitrión; lifebook libre).
//  · Canales temáticos: buscan SINÓNIMOS normalizados (minúsculas, sin acentos)
//    como tokens en título/body/serviceType/category/topics, o service_link exacto.
//  · Media (Parte 4): vídeo ≤60 s / audio ≤60 min; portada obligatoria en
//    podcast; 1 episodio = (serie, temporada, número) único.
//  · Parte 24 (G2): mensajes de UBICACIÓN (`kind='location'` con lat/lng/label
//    en el jsonb `payload`) y de VOTACIÓN (`kind='vote'` con pregunta y 2–6
//    opciones). Los votos viven en `lifebook.message_votes` (PK mensaje+usuario,
//    así que votar otra vez CAMBIA el voto) y viajan en `voteRef` con los
//    recuentos ya resueltos en una sola consulta por página.
// =============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { Client as MinioClient } from 'minio';
import { MobilityPrismaService } from '../mobility/mobility-prisma.service';
import { AdsService } from '../ads/ads.service';
import { DomainError } from '../services/payment-auth.service';

const USER_PHOTO_BASE = '/wallet/api/v1/mobility/user/photo';
const REPORT_REASONS = ['spam', 'fraud', 'false_content', 'harassment', 'hate', 'sexual', 'violence', 'personal_info', 'illegal_sale', 'impersonation', 'false_emergency'] as const;
const POST_TEXT_MAX = 500;
/** A partir de cuántos comentarios se enseña publicidad en el hilo (ver `commentsPage`). */
const ANUNCIO_MIN_COMENTARIOS = 3;
/** «Seguir viendo»: por debajo de esto no cuenta como empezado, y por encima del
 *  90 % cuenta como terminado (y sale de la lista). Se DEDUCE, no se guarda. */
const VISTO_MIN_SEGUNDOS = 5;
const VISTO_FRACCION_FINAL = 0.9;
const TITLE_MAX = 90;
const MEDIA_MAX_NOTE = 4;
const MEDIA_MAX_SALE = 6;
const DEBATE_CATEGORIES = ['transporte', 'seguridad', 'empleo', 'educacion', 'salud', 'agua', 'comercio', 'juventud', 'mujer', 'cultura', 'medio'] as const;
const DEBATE_STATES = ['open', 'discussing', 'proposals', 'community_resolved', 'attention', 'closed'] as const;
const SALE_CONDITIONS = ['nuevo', 'como_nuevo', 'usado', 'piezas'] as const;
const LINK_TYPES = ['taxi', 'food', 'ecomerse', 'work', 'rental', 'paquete', 'tickets', 'lifebook'] as const;

/**
 * Recorre un payload y apunta TODA url que encuentre (cadenas y arrays anidados).
 *
 * Se recorre el objeto entero en vez de leer una lista de claves (`videoUrl`, `coverUrl`,
 * `media`…) a propósito: los payloads de Life Book son jsonb y cada tipo guarda lo suyo
 * (nota `media[]`, venta `media[]`, vídeo `videoUrl`+`coverUrl`, podcast `audioUrl`, serie
 * `coverUrl`…). Con una lista de claves, el día que alguien añada `posterUrl` esa imagen se
 * queda en el almacén para siempre y nadie se entera. Recorriendo, un campo nuevo ya sale
 * borrado sin tocar esto.
 *
 * De filtrar cuáles son NUESTRAS se encarga `claveDeAlmacen`: aquí sólo se recogen.
 */
function recolectarUrls(valor: unknown, salida: Set<string>, profundidad = 0): void {
  if (profundidad > 6 || valor === null || valor === undefined) return;
  if (typeof valor === 'string') {
    if (/^https?:\/\//i.test(valor)) salida.add(valor);
    return;
  }
  if (Array.isArray(valor)) {
    for (const v of valor) recolectarUrls(v, salida, profundidad + 1);
    return;
  }
  if (typeof valor === 'object') {
    for (const v of Object.values(valor as Record<string, unknown>)) recolectarUrls(v, salida, profundidad + 1);
  }
}

// Canales del feed (DISEÑO-UX-LIFEBOOK-INICIO §2: 13 chips en orden fijo).
const FEED_CHANNELS = ['for_you', 'following', 'nearby', 'today', 'debates', 'food', 'taxi', 'work', 'rental', 'sales', 'culture', 'music', 'sports', 'tourism', 'bars', 'party', 'citywalk'] as const;
// Sinónimos (normalizados: minúsculas, sin acentos) por canal temático. Se
// comparan como TOKENS del texto (título/body/serviceType/category/topics).
const CHANNEL_WORDS: Record<string, { link?: string; words: string[] }> = {
  food: { link: 'food', words: ['comida', 'restaurante', 'restaurantes', 'cocina', 'catering', 'chef', 'cocinero', 'reposteria', 'bar', 'cafeteria', 'fonda', 'marisqueria', 'carnes', 'pollo', 'pescado', 'delivery'] },
  taxi: { link: 'taxi', words: ['taxi', 'transporte', 'chofer', 'conductor', 'viaje', 'viajes', 'mototaxi', 'moto', 'repartidor', 'ruta'] },
  work: { link: 'work', words: ['trabajo', 'empleo', 'empleos', 'contratacion', 'clases', 'profesor', 'oficio', 'limpieza', 'cuidado', 'camarero', 'vendedor', 'carpintero', 'electricista', 'fontanero', 'soldador'] },
  rental: { link: 'rental', words: ['alquiler', 'alquilo', 'renta', 'arriendo', 'habitacion', 'habitaciones', 'piso', 'apartamento', 'casa', 'local', 'oficina', 'solar'] },
  culture: { words: ['cultura', 'arte', 'artesania', 'tradicion', 'tradiciones', 'fiesta', 'fiestas', 'historia', 'feria', 'ferias', 'folklore', 'idioma', 'gastronomia'] },
  music: { words: ['musica', 'cancion', 'canciones', 'concierto', 'conciertos', 'cantante', 'baile', 'bailes', 'danza', 'dj', 'coro'] },
  sports: { words: ['deporte', 'deportes', 'futbol', 'baloncesto', 'natacion', 'atletismo', 'boxeo', 'voleibol', 'tenis', 'ciclismo', 'liga', 'partido'] },
  // Las CUATRO de abajo son nuestras, no copiadas de Xiaohongshu (ni «City walk» ni
  // «Bares» ni «Fiesta» aparecen en ninguna fuente suya). El dueño las pidió para la
  // pestaña de la ciudad y son canales por palabras del texto de la publicación.
  // OJO: las palabras van SIN ACENTOS, que es como las normaliza el motor de arriba.
  tourism: { words: ['turismo', 'turista', 'viaje', 'viajes', 'playa', 'hotel', 'hoteles', 'excursion', 'monumento', 'museo', 'visita', 'guia', 'cascada', 'resort'] },
  bars: { words: ['bar', 'bares', 'discoteca', 'discotecas', 'copas', 'cerveza', 'coctel', 'terraza', 'pub', 'karaoke', 'vinoteca'] },
  party: { words: ['fiesta', 'fiestas', 'concierto', 'conciertos', 'festival', 'cumpleanos', 'celebracion', 'verbena', 'dj', 'after'] },
  citywalk: { words: ['paseo', 'caminata', 'ruta', 'rutas', 'caminar', 'citywalk', 'recorrido', 'senderismo', 'barrio', 'esquina'] },
};

// ---------------- Parte 11: alias de contrato para el cliente ----------------
// Ruta de la app para cada enlace de servicio: la calcula el servidor para que
// el cliente no duplique el mapa (el mismo que usa el Estado 24h).
const SERVICE_LINK_ROUTES: Record<string, string> = {
  taxi: '/taxi',
  food: '/food',
  ecomerse: '/ecomerse',
  work: '/work',
  rental: '/alquiler',
  lifebook: '/lifebook-store',
};

// ---------------- Parte 9: búsqueda ----------------
// Tipos de publicación aceptados como filtro de búsqueda.
const SEARCH_TYPES = ['note', 'sale', 'service', 'debate', 'video', 'podcast', 'serie'] as const;
// Palabras vacías para el relleno por frecuencia de las TENDENCIAS.
const SEARCH_STOPWORDS = [
  'para', 'como', 'este', 'esta', 'esto', 'estos', 'estas', 'con', 'los', 'las', 'del', 'que',
  'por', 'una', 'uno', 'unos', 'unas', 'muy', 'mas', 'pero', 'sin', 'sobre', 'entre', 'cuando',
  'donde', 'todo', 'toda', 'todos', 'todas', 'hay', 'hoy', 'ayer', 'hacer', 'hace', 'desde',
  'hasta', 'tambien', 'solo', 'cada', 'otro', 'otra', 'otros', 'otras', 'nos', 'les', 'nuestro',
  'nuestra', 'tiene', 'tengo', 'aqui', 'alli', 'porque', 'vende', 'vendo', 'mira', 'hola',
  'gracias', 'buenos', 'buenas', 'dias', 'tarde', 'noche', 'lifebook', 'nota', 'notas', 'e2e',
];

// ---------------- Parte 4: media (MinIO) ----------------
// Parte 15 (Fase B): se añade `file` para adjuntos del chat.
const MEDIA_KINDS = ['image', 'video', 'audio', 'file'] as const;
const LB_MEDIA_MIMES: Record<string, Record<string, string>> = {
  image: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
  video: { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' },
  audio: { 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/ogg': 'ogg' },
  file: {
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/zip': 'zip',
    'application/x-rar-compressed': 'rar',
    'application/vnd.rar': 'rar',
  },
};
const LB_MEDIA_MAX: Record<string, number> = { image: 10, video: 120, audio: 60, file: 25 }; // MB
// Parte 41: el vídeo admite hasta 60 MINUTOS (cortos tipo tiktok, series,
// documentales y conciertos). La duración se comprueba en el ARCHIVO con
// ffprobe al cerrar la subida, así que el tope no depende de lo que declare
// el cliente. Los tipos con tope más corto se limitan en el flujo que los crea.
const VIDEO_SEC_MAX = 3600; // 60 min
const AUDIO_SEC_MAX = 3600;
const EP_SEASON_MAX = 50;
const LB_STORAGE_BUCKETS: Record<string, string> = { image: 'lb-images', video: 'lb-videos', audio: 'lb-audio', file: 'lb-files' };

/**
 * Parte 15 (Fase B): tipos de mensaje que el cliente puede enviar.
 * Parte 24 (G2): se añaden `location` (punto y mapa) y `vote` (votación).
 * Parte 25 (G2-b): se añaden `chain` (cadena con apuntados) y `checkin` (quedada).
 * Parte 26 (G2-c): se añade `ad` (anuncio de grupo, con límite diario).
 */
const CHAT_KINDS = ['text', 'image', 'post', 'sale', 'product', 'file', 'location', 'vote', 'chain', 'checkin', 'ad'] as const;

/**
 * Parte 25 (G2-b): tipos a los que uno se puede APUNTAR. Comparten la tabla
 * `lifebook.message_joins` y el mismo endpoint `POST /chat/messages/:id/join`.
 */
const JOIN_KINDS = ['chain', 'checkin'] as const;

/** Parte 24 (G2): límites de la ubicación y de la votación. */
const LOCATION_LABEL_MAX = 120;
const VOTE_QUESTION_MAX = 120;
const VOTE_OPTIONS_MIN = 2;
const VOTE_OPTIONS_MAX = 6;
const VOTE_OPTION_CHARS = 40;

/**
 * Parte 26 (G2-c): ANUNCIO de grupo. Decisión del dueño (Parte 15): **15 anuncios
 * por persona y día**, así que un grupo no se convierte en un tablón de spam.
 * El día se cuenta en hora de Malabo (UTC+1), que es la del usuario.
 */
const AD_DAILY_LIMIT = 15;
const AD_TEXT_MAX = 300;
const AD_TITLE_MAX = 60;

/** Parte 26 (G2-c): límites de la PLAZA DE RETOS. */
const CHALLENGE_TITLE_MAX = 80;
const CHALLENGE_BODY_MAX = 400;
const CHALLENGE_PRIZE_MAX = 120;
const CHALLENGE_NOTE_MAX = 200;
/** Participantes que se devuelven con nombre en la lista (el resto, contados). */
const CHALLENGE_MEMBERS_MAX = 20;

/**
 * Parte 27 (G3): DESCUBRIR GRUPOS Y UNIRSE.
 *  · `open`     → cualquiera entra al momento.
 *  · `approval` → queda una solicitud que decide el organizador.
 *  · `question` → si la respuesta coincide (sin acentos ni mayúsculas) entra; si
 *                 no, queda como solicitud para que decida el organizador.
 */
const JOIN_ANSWER_MAX = 200;
const JOIN_NOTE_MAX = 200;
/** Grupos por página en el descubrimiento. */
const GROUP_LIST_MAX = 30;
/** Miembros que se devuelven con nombre en la ficha pública del grupo. */
const GROUP_CARD_MEMBERS_MAX = 8;

/**
 * Parte 28 (G4): UBICACIÓN EN VIVO durante la ruta y CÓDIGO de invitación.
 *  · La ubicación en vivo caduca sola (`expires_at`) y se refresca al mover.
 *  · El código evita el buscador: 6 caracteres sin letras que se confunden
 *    (I, O, 0, 1) para poder dictarlo o meterlo a mano.
 */
const LIVE_MINUTES_MIN = 5;
const LIVE_MINUTES_MAX = 480;              // 8 h como máximo
const LIVE_LABEL_MAX = 120;
const LIVE_STALE_SEC = 120;                // sin refrescar 2 min → se considera parada
const INVITE_CODE_LEN = 6;
const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Parte 25 (G2-b): límites de la cadena y del tema del grupo. */
const CHAIN_TITLE_MAX = 80;
const CHAIN_NOTE_MAX = 200;
const CHAIN_SLOTS_MIN = 2;
const CHAIN_SLOTS_MAX = 200;
const TOPIC_MAX = 60;
/** Cuántos apuntados se devuelven con nombre y foto. */
const JOIN_MEMBERS_MAX = 20;

/**
 * Parte 20 (versión del dueño): componentes permitidos por defecto en un grupo.
 * Incluye los de grupo (`location`, `checkin`, `chain`, `vote`, `ad`): las Partes
 * 24–25 ya tienen `location`, `vote`, `chain` y `checkin` de verdad; `ad`
 * llegará con la siguiente parte.
 */
const DEFAULT_KINDS = ['text', 'image', 'post', 'sale', 'product', 'order', 'file', 'location', 'checkin', 'chain', 'vote', 'ad'];

/** Parte 19: metadatos del grupo (los mismos que usa la app). */
const LB_CITIES = ['Malabo', 'Bata', 'Ebebiyín', 'Mongomo', 'Luba'] as const;
const GROUP_CATEGORIES = ['food', 'taxi', 'sales', 'culture', 'work', 'rental', 'sports', 'music'] as const;
const GROUP_VISIBILITIES = ['public', 'private', 'hidden'] as const;

/** Parte 21: condición de ingreso al grupo (diseño del dueño). */
const GROUP_JOIN_MODES = ['open', 'approval', 'question'] as const;

/** Parte 25 (G2-b): etiqueta de una quedada en hora de Malabo (UTC+1, sin DST). */
function malaboWhenLabel(when: Date): string {
  const OFFSET_MS = 60 * 60 * 1000; // UTC+1
  const local = new Date(when.getTime() + OFFSET_MS);
  const now = new Date(Date.now() + OFFSET_MS);
  const day = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
  const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  if (day(local) === day(now)) return `hoy ${hh}:${mm}`;
  if (day(local) === day(tomorrow)) return `mañana ${hh}:${mm}`;
  const dd = String(local.getUTCDate()).padStart(2, '0');
  const mo = String(local.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mo} ${hh}:${mm}`;
}

/** Etiqueta legible del tamaño de un archivo ("2,4 MB"). */
function humanSize(bytes: unknown): string {
  const n = Number(bytes ?? 0);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.', ',')} KB`;
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

@Injectable()
export class LifebookService {
  private redis: Redis | null = null;
  private redisOk = false;

  constructor(
    private readonly db: MobilityPrismaService,
    private readonly ads: AdsService,
  ) {
    try {
      this.redis = new Redis({
        host: process.env.REDIS_HOST ?? '127.0.0.1',
        port: Number(process.env.REDIS_PORT ?? 6379),
        password: process.env.REDIS_PASSWORD || undefined,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 1500,
        enableOfflineQueue: false,
      });
      this.redis.on('error', () => { this.redisOk = false; });
      this.redis.connect().then(() => { this.redisOk = true; }).catch(() => { this.redisOk = false; });
    } catch {
      this.redis = null;
      this.redisOk = false;
    }
    // Parte 29 (G4): barrido periódico de INACTIVOS en los grupos que lo tengan
    // activado. Es un temporizador ligero (no toca nada si nadie lo activa).
    try {
      const cada = Number(process.env.LB_INACTIVE_SWEEP_MS ?? 6 * 60 * 60 * 1000);
      const t = setInterval(() => { void this.sweepInactiveAll(); }, Number.isFinite(cada) && cada >= 60000 ? cada : 6 * 60 * 60 * 1000);
      // No bloquea el cierre del proceso (Node).
      if (typeof (t as any).unref === 'function') (t as any).unref();
    } catch { /* sin temporizador: queda el botón «Revisar ahora» */ }
  }

  // =========================================================================
  // HELPERS DE MEDIA / CONTENIDO
  // =========================================================================
  private async savePhotos(userId: string, mediaList: string[], max: number, purpose = 'lifebook'): Promise<string[]> {
    const ids: string[] = [];
    for (const raw of (Array.isArray(mediaList) ? mediaList : []).slice(0, max)) {
      const b64 = String(raw).includes(',') ? String(raw).split(',')[1] : String(raw);
      if (b64 && b64.trim().length >= 100) {
        const id = randomUUID();
        await this.db.$queryRaw`
          INSERT INTO mobility.user_photos (id, user_id, purpose, image_b64)
          VALUES (${id}::uuid, ${userId}::uuid, ${purpose}, ${b64.trim()})`;
        ids.push(id);
      }
    }
    return ids;
  }

  private cleanText(value: unknown, max: number): string {
    return String(value ?? '').trim().slice(0, max);
  }

  private cleanCity(value: unknown): string {
    const city = String(value ?? '').trim().slice(0, 90);
    if (!city) throw new DomainError('CITY_REQUIRED', 'Indica la ciudad');
    return city;
  }

  /** Parte 26 (G2-c): ciudad OPCIONAL (un reto puede no tener ciudad). */
  private optionalCity(value: unknown): string | null {
    return String(value ?? '').trim().slice(0, 40) || null;
  }

  private visibilityOf(value: unknown): string {
    return ['public', 'followers', 'private'].includes(String(value ?? '')) ? String(value) : 'public';
  }

  private assertNoContacts(text: string) {
    if (/(\+240\d{7,9}|[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|wa\.me|whatsapp\.com)/i.test(text)) {
      throw new DomainError('TEXT_FORBIDDEN', 'El texto no puede incluir teléfonos, correos ni enlaces');
    }
  }

  // =========================================================================
  // PUBLICAR NOTA (Parte 1)
  // =========================================================================
  async createNote(userId: string, dto: {
    body: string; title?: string; media?: string[]; city: string; barrio?: string;
    topics?: string[]; tone?: string; visibility?: string; coverRatio?: number;
    linkType?: string; linkId?: string;
    /** TANDA C: productos de MI tienda que van dentro de la nota. */
    productIds?: string[];
    /** TANDA I: el SITIO exacto de la nota (POI). Sin esto no puede salir en «cerca de mí». */
    placeName?: string; placeLat?: number; placeLng?: number;
  }) {
    await this.assertCanPost(userId);
    const body = this.cleanText(dto.body, POST_TEXT_MAX);
    if (!body) throw new DomainError('BODY_REQUIRED', 'Escribe una descripción');
    this.assertNoContacts(body);
    const mediaIds = await this.savePhotos(userId, dto.media ?? [], MEDIA_MAX_NOTE);
    const visibility = this.visibilityOf(dto.visibility);
    const serviceLink = await this.resolveLink(userId, dto.linkType, dto.linkId);
    const tone = ['info', 'opinion', 'denuncia', 'humor', 'pregunta'].includes(String(dto.tone ?? '')) ? String(dto.tone) : null;
    const row: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.posts
             (author_id, type, title, body, city, barrio, tone, media_ids,
              payload, visibility, service_link)
      VALUES (${userId}::uuid, 'note', ${this.cleanText(dto.title, TITLE_MAX) || null}, ${body},
              ${this.cleanCity(dto.city)}, ${this.cleanText(dto.barrio, 90) || null},
              ${tone},
              ${JSON.stringify(mediaIds)}::jsonb,
              ${JSON.stringify({
                topics: (dto.topics ?? []).slice(0, 5),
                coverRatio: Number(dto.coverRatio) > 0 ? Number(dto.coverRatio) : undefined,
                /* TANDA I: el sitio de la nota. Es lo que permite «qué hay cerca»: sin coordenadas,
                   una distancia calculada sería inventada. */
                ...(this.sitioDe(dto.placeName, dto.placeLat, dto.placeLng) ?? {}),
              })}::jsonb,
              ${visibility}, ${JSON.stringify(serviceLink ?? null)}::jsonb)
      RETURNING id`;
    const id = row[0]?.id;
    // TANDA C: los productos van DENTRO de la nota (antes de los hashtags al pintarla).
    await this.linkProducts(userId, String(id), dto.productIds);
    await this.invalidateFeed(this.cleanCity(dto.city));
    return this.getPost(id, userId);
  }

  /**
   * TANDA I — EL SITIO DE LA NOTA (POI).
   *
   * Una nota sin sitio exacto no puede salir en «cerca de mí» ni en «toda la ciudad»: no se sabe
   * dónde está. Se guarda el nombre del lugar y sus coordenadas; si las coordenadas no son válidas
   * NO se guarda el sitio (mejor sin POI que con uno falso, que pondría la nota en un mapa donde no
   * está).
   */
  private sitioDe(name: unknown, lat: unknown, lng: unknown): { placeName: string; lat: number; lng: number } | null {
    const n = this.cleanText(name, 120);
    const la = Number(lat);
    const ln = Number(lng);
    if (!n || !Number.isFinite(la) || !Number.isFinite(ln)) return null;
    if (Math.abs(la) > 90 || Math.abs(ln) > 180) return null;
    if (la === 0 && ln === 0) return null; // «0,0» es el mar: casi siempre es un dato que falta
    return { placeName: n, lat: la, lng: ln };
  }

  /** El radio que pide la app: «附近» (~1 km), «3km», o nada para TODA la ciudad. */
  private geoDe(q: { lat?: string | number; lng?: string | number; radiusKm?: string | number }): { lat: number; lng: number; radiusKm: number | null } | null {
    if (q?.lat === undefined || q?.lng === undefined || q?.lat === '' || q?.lng === '') return null;
    const lat = Number(q.lat);
    const lng = Number(q.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    const r = q?.radiusKm === undefined || q?.radiusKm === '' ? null : Number(q.radiusKm);
    return { lat, lng, radiusKm: r !== null && Number.isFinite(r) && r > 0 ? r : null };
  }

  /** `since=1h|24h|7d|30d` → el intervalo de Postgres (o null si no se pide). */
  private sinceDe(since: unknown): string | null {
    switch (String(since ?? '').trim().toLowerCase()) {
      case '1h': return '1 hour';
      case '24h': return '24 hours';
      case '7d': return '7 days';
      case '30d': return '30 days';
      default: return null;
    }
  }

  /**
   * TANDA C — enganchar productos a una nota.
   *
   * Reglas (y el porqué):
   *   · Solo productos **activos de la tienda del autor**: no se puede vender lo de otro, y
   *     anunciar algo retirado sería mandar al visitante a una ficha muerta.
   *   · **Máximo 9**: la especificación recomienda no pasar de 6-9 para no saturar la nota.
   *   · Se **reemplazan** los que hubiera: la nota manda la lista completa y así no hay que
   *     borrar de uno en uno. Sin lista (o vacía) se quitan todos.
   *   · Un id que no existe o no es tuyo NO tumba la publicación entera (ya está creada): se
   *     ignoran los que no valgan, que es más útil que perder la nota por un id mal copiado.
   */
  private async linkProducts(userId: string, postId: string, ids: unknown) {
    const lista = [...new Set((Array.isArray(ids) ? ids : []).map((x) => String(x)))].slice(0, 9);

    await this.db.$executeRaw`
      DELETE FROM lifebook.post_products WHERE post_id = ${postId}::uuid`;
    if (!lista.length) return;

    const mios: any[] = await this.db.$queryRaw`
      SELECT p.id::text AS id
        FROM lifebook.products p
        JOIN lifebook.shops s ON s.id = p.shop_id
       WHERE s.owner_id = ${userId}::uuid AND p.status = 'active'`;
    const validos = new Set(mios.map((r) => String(r.id)));
    const buenos = lista.filter((id) => validos.has(id));

    for (let i = 0; i < buenos.length; i++) {
      await this.db.$executeRaw`
        INSERT INTO lifebook.post_products (post_id, product_id, position)
        VALUES (${postId}::uuid, ${buenos[i]}::uuid, ${i + 1}::smallint)
        ON CONFLICT DO NOTHING`;
    }
  }

  /** TANDA C — los productos de una nota, listos para pintar. Público. */
  async postProducts(postId: string) {
    // El id tiene que ser un uuid: si no lo es se devuelve vacío en vez de reventar (la ruta
    // es pública y cualquiera puede escribir cualquier cosa en la URL).
    const pid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(postId))
      ? String(postId) : null;
    if (!pid) return { products: [] };
    const filas: any[] = await this.db.$queryRaw`
      SELECT p.id, p.title, p.short_description, p.price_mode, p.price_xaf, p.old_price_xaf,
             p.media, p.sales_count, p.currency, pp.position
        FROM lifebook.post_products pp
        JOIN lifebook.products p ON p.id = pp.product_id
       WHERE pp.post_id = ${pid}::uuid AND p.status = 'active'
       ORDER BY pp.position`;
    return {
      products: filas.map((p) => ({
        id: p.id,
        title: p.title,
        shortDescription: p.short_description ?? null,
        priceMode: p.price_mode,
        priceXaf: p.price_xaf === null ? null : Number(p.price_xaf),
        oldPriceXaf: p.old_price_xaf === null ? null : Number(p.old_price_xaf),
        currency: String(p.currency ?? 'XAF').trim(),
        coverUrl: (Array.isArray(p.media) ? p.media : [])[0]?.url ?? null,
        salesCount: Number(p.sales_count ?? 0),
        position: Number(p.position),
      })),
    };
  }

  /** TANDA C — cambiarlos después, sin reeditar la nota (solo el autor). */
  async setPostProducts(userId: string, postId: string, ids: unknown) {
    const autor: any[] = await this.db.$queryRaw`
      SELECT author_id FROM lifebook.posts WHERE id = ${postId}::uuid LIMIT 1`;
    if (!autor[0]) throw new DomainError('POST_NOT_FOUND', 'La publicación no existe');
    if (String(autor[0].author_id) !== userId) {
      throw new DomainError('NOT_YOUR_POST', 'Solo quien publicó la nota puede cambiar sus productos');
    }
    await this.linkProducts(userId, postId, ids);
    return this.postProducts(postId);
  }

  // =========================================================================
  // PUBLICAR VENTA (Parte 2)
  // =========================================================================
  async createSale(userId: string, dto: {
    title: string; body?: string; media?: string[]; city: string; barrio?: string;
    priceXaf: number; negotiable?: boolean; condition?: string;
    category?: string; delivery?: string[]; paymentMethods?: string[];
    contactMode?: string; linkType?: string; linkId?: string;
  }) {
    await this.assertCanPost(userId);
    const title = this.cleanText(dto.title, TITLE_MAX);
    if (title.length < 3) throw new DomainError('TITLE_TOO_SHORT', 'El nombre del producto debe tener al menos 3 caracteres');
    const body = this.cleanText(dto.body, POST_TEXT_MAX);
    this.assertNoContacts(body || title);
    const mediaIds = await this.savePhotos(userId, dto.media ?? [], MEDIA_MAX_SALE);
    if (!mediaIds.length) throw new DomainError('PHOTO_REQUIRED', 'Añade al menos una foto del producto');
    const price = Number(dto.priceXaf);
    if (!Number.isFinite(price) || price < 0) throw new DomainError('PRICE_INVALID', 'Escribe un precio válido');
    const conditions: string[] = [...SALE_CONDITIONS];
    const condition = conditions.includes(String(dto.condition ?? '')) ? String(dto.condition) : 'usado';
    const contactMode = ['inapp', 'phone', 'whatsapp'].includes(String(dto.contactMode ?? '')) ? String(dto.contactMode) : 'inapp';
    const serviceLink = await this.resolveLink(userId, dto.linkType, dto.linkId);
    const payload = {
      priceXaf: Math.round(price),
      negotiable: !!dto.negotiable,
      condition,
      category: this.cleanText(dto.category, 40) || 'otro',
      delivery: (dto.delivery ?? []).map((d) => this.cleanText(d, 40)).filter(Boolean).slice(0, 5),
      paymentMethods: (dto.paymentMethods ?? []).map((p) => this.cleanText(p, 40)).filter(Boolean).slice(0, 5),
      contactMode,
    };
    const row: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.posts
             (author_id, type, title, body, city, barrio, media_ids, payload, visibility, service_link)
      VALUES (${userId}::uuid, 'sale', ${title}, ${body || null},
              ${this.cleanCity(dto.city)}, ${this.cleanText(dto.barrio, 90) || null},
              ${JSON.stringify(mediaIds)}::jsonb, ${JSON.stringify(payload)}::jsonb,
              'public', ${JSON.stringify(serviceLink ?? null)}::jsonb)
      RETURNING id`;
    const id = row[0]?.id;
    await this.invalidateFeed(this.cleanCity(dto.city));
    return this.getPost(id, userId);
  }

  // =========================================================================
  // PUBLICAR SERVICIO (Parte 2)
  // =========================================================================
  async createService(userId: string, dto: {
    body: string; city: string; barrio?: string;
    serviceType?: string; priceXaf?: number; unit?: string;
    availability?: string[]; contactMode?: string;
    linkType?: string; linkId?: string;
  }) {
    await this.assertCanPost(userId);
    const body = this.cleanText(dto.body, POST_TEXT_MAX);
    if (!body) throw new DomainError('BODY_REQUIRED', 'Escribe una descripción del servicio');
    this.assertNoContacts(body);
    const unit = ['por_hora', 'por_servicio', 'negociable'].includes(String(dto.unit ?? '')) ? String(dto.unit) : 'por_servicio';
    let price: number | null = null;
    if (dto.priceXaf !== undefined && dto.priceXaf !== null) {
      price = Number(dto.priceXaf);
      if (!Number.isFinite(price) || price < 0) throw new DomainError('PRICE_INVALID', 'Escribe un precio válido');
      price = Math.round(price);
    }
    const contactMode = ['inapp', 'phone', 'whatsapp'].includes(String(dto.contactMode ?? '')) ? String(dto.contactMode) : 'inapp';
    const serviceLink = await this.resolveLink(userId, dto.linkType, dto.linkId);
    const payload = {
      serviceType: this.cleanText(dto.serviceType, 40) || 'otro',
      priceXaf: price,
      unit,
      availability: (dto.availability ?? []).map((a) => this.cleanText(a, 40)).filter(Boolean).slice(0, 5),
      contactMode,
    };
    const row: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.posts
             (author_id, type, body, city, barrio, media_ids, payload, visibility, service_link)
      VALUES (${userId}::uuid, 'service', ${body},
              ${this.cleanCity(dto.city)}, ${this.cleanText(dto.barrio, 90) || null},
              '[]'::jsonb, ${JSON.stringify(payload)}::jsonb,
              'public', ${JSON.stringify(serviceLink ?? null)}::jsonb)
      RETURNING id`;
    const id = row[0]?.id;
    await this.invalidateFeed(this.cleanCity(dto.city));
    return this.getPost(id, userId);
  }

  // =========================================================================
  // DEBATE (Parte 2): crear + propuestas + votos + estados
  // =========================================================================
  async createDebate(userId: string, dto: {
    title: string; body?: string; city: string; barrio?: string;
    category: string; problem?: string; context?: string; initialProposal?: string;
    allowProposals?: boolean; allowVotes?: boolean; showApproxLoc?: boolean;
    media?: string[];
  }) {
    await this.assertCanPost(userId);
    const title = this.cleanText(dto.title, TITLE_MAX);
    if (title.length < 5) throw new DomainError('TITLE_TOO_SHORT', 'Describe el problema con más detalle (mínimo 5 caracteres)');
    const category = String(dto.category ?? '').toLowerCase().replace(/[^a-z]/g, '');
    if (!(DEBATE_CATEGORIES as readonly string[]).includes(category)) {
      throw new DomainError('CATEGORY_INVALID', 'Elige una categoría de debate válida');
    }
    const body = this.cleanText(dto.body, POST_TEXT_MAX);
    this.assertNoContacts(body || title);
    const mediaIds = await this.savePhotos(userId, dto.media ?? [], MEDIA_MAX_NOTE);
    const row: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.posts
             (author_id, type, title, body, city, barrio, media_ids, payload, visibility)
      VALUES (${userId}::uuid, 'debate', ${title}, ${body || null},
              ${this.cleanCity(dto.city)}, ${this.cleanText(dto.barrio, 90) || null},
              ${JSON.stringify(mediaIds)}::jsonb, '{}'::jsonb, 'public')
      RETURNING id`;
    const postId = row[0]?.id;
    await this.db.$queryRaw`
      INSERT INTO lifebook.debates (post_id, category, state, allow_proposals, allow_votes, show_approx_loc,
                                    problem, context, initial_proposal)
      VALUES (${postId}::uuid, ${category}, 'open',
              ${dto.allowProposals !== false}, ${dto.allowVotes !== false}, ${!!dto.showApproxLoc},
              ${this.cleanText(dto.problem, 2000) || null},
              ${this.cleanText(dto.context, 2000) || null},
              ${this.cleanText(dto.initialProposal, 2000) || null})`;
    await this.invalidateFeed(this.cleanCity(dto.city));
    return this.getPost(postId, userId);
  }

  /** Propuestas de un debate (con conteos de votos y mi voto). */
  async debateProposals(debateId: string, viewerId?: string) {
    const vid = viewerId || '00000000-0000-0000-0000-000000000000';
    const rows: any[] = await this.db.$queryRaw`
      SELECT pr.id, pr.debate_id, pr.author_id, pr.body, pr.who_should_act, pr.created_at,
             u.full_name, u.avatar_url,
             (SELECT count(*)::int FROM lifebook.proposal_votes v WHERE v.proposal_id=pr.id AND v.vote='agree') AS agree,
             (SELECT count(*)::int FROM lifebook.proposal_votes v WHERE v.proposal_id=pr.id AND v.vote='help') AS help,
             (SELECT count(*)::int FROM lifebook.proposal_votes v WHERE v.proposal_id=pr.id AND v.vote='disagree') AS disagree,
             (SELECT v.vote FROM lifebook.proposal_votes v WHERE v.proposal_id=pr.id AND v.user_id=${vid}::uuid) AS my_vote
      FROM lifebook.proposals pr
      JOIN mobility.users u ON u.id = pr.author_id
      WHERE pr.debate_id = ${debateId}::uuid
      ORDER BY (SELECT count(*)::int FROM lifebook.proposal_votes v WHERE v.proposal_id=pr.id) DESC, pr.created_at ASC
      LIMIT 100`;
    return rows.map((r) => ({
      id: r.id,
      body: r.body,
      whoShouldAct: r.who_should_act,
      createdAt: String(r.created_at),
      author: { id: r.author_id, fullName: r.full_name, avatarUrl: r.avatar_url },
      votes: { agree: Number(r.agree), help: Number(r.help), disagree: Number(r.disagree), myVote: r.my_vote ?? null },
    }));
  }

  /** Añade una propuesta de solución a un debate abierto. */
  async addProposal(userId: string, debateId: string, body: string, whoShouldAct?: string) {
    const debate: any[] = await this.db.$queryRaw`
      SELECT d.state, d.allow_proposals FROM lifebook.debates d
      JOIN lifebook.posts p ON p.id = d.post_id
      WHERE d.post_id=${debateId}::uuid AND p.state='active'`;
    if (!debate[0]) throw new DomainError('DEBATE_NOT_FOUND', 'Debate no encontrado');
    if (!debate[0].allow_proposals) throw new DomainError('PROPOSALS_DISABLED', 'Este debate no acepta propuestas');
    if (debate[0].state === 'closed') throw new DomainError('DEBATE_CLOSED', 'El debate está cerrado');
    if (!['open', 'discussing', 'proposals'].includes(debate[0].state)) {
      throw new DomainError('DEBATE_CLOSED', 'El debate ya no acepta propuestas');
    }
    const text = this.cleanText(body, 300);
    if (text.length < 3) throw new DomainError('PROPOSAL_REQUIRED', 'Escribe tu propuesta');
    this.assertNoContacts(text);
    const row: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.proposals (debate_id, author_id, body, who_should_act)
      VALUES (${debateId}::uuid, ${userId}::uuid, ${text},
              ${['Vecinos','Ayuntamiento','Empresa','EG Route Plan','ONG','Otro'].includes(String(whoShouldAct)) ? String(whoShouldAct) : null})
      RETURNING id, created_at`;
    // open → discussing automático (primera propuesta/comentario ya lo movería; aquí: proposals si llega a 3+).
    const count: any[] = await this.db.$queryRaw`
      SELECT count(*)::int AS n FROM lifebook.proposals WHERE debate_id=${debateId}::uuid`;
    if (debate[0].state === 'open') {
      await this.db.$queryRaw`UPDATE lifebook.debates SET state='discussing' WHERE post_id=${debateId}::uuid AND state='open'`;
    }
    if ((count[0]?.n ?? 0) >= 3 && ['open', 'discussing'].includes(debate[0].state)) {
      await this.db.$queryRaw`UPDATE lifebook.debates SET state='proposals' WHERE post_id=${debateId}::uuid AND state IN ('open','discussing')`;
    }
    return { id: row[0]?.id, ok: true };
  }

  /** Vota una propuesta (agree|help|disagree); 1 voto por usuario (UPSERT). */
  async voteProposal(userId: string, proposalId: string, vote: string) {
    const prop: any[] = await this.db.$queryRaw`
      SELECT d.state, d.allow_votes FROM lifebook.proposals pr
      JOIN lifebook.debates d ON d.post_id = pr.debate_id
      WHERE pr.id=${proposalId}::uuid`;
    if (!prop[0]) throw new DomainError('PROPOSAL_NOT_FOUND', 'Propuesta no encontrada');
    if (!prop[0].allow_votes) throw new DomainError('VOTES_DISABLED', 'Este debate no permite votos');
    if (prop[0].state === 'closed') throw new DomainError('DEBATE_CLOSED', 'El debate está cerrado');
    const v = ['agree', 'help', 'disagree'].includes(String(vote)) ? String(vote) : 'agree';
    await this.db.$queryRaw`
      INSERT INTO lifebook.proposal_votes (proposal_id, user_id, vote)
      VALUES (${proposalId}::uuid, ${userId}::uuid, ${v})
      ON CONFLICT (proposal_id, user_id)
      DO UPDATE SET vote = EXCLUDED.vote, updated_at = now()`;
    return { ok: true, vote: v };
  }

  /** Transición de estado del debate (autor o ADMIN). Auditada en mod_actions. */
  async setDebateState(actorId: string, actorRole: string, debateId: string, dto: {
    state: string; summary?: string;
  }) {
    const debate: any[] = await this.db.$queryRaw`
      SELECT d.*, p.author_id FROM lifebook.debates d
      JOIN lifebook.posts p ON p.id = d.post_id
      WHERE d.post_id=${debateId}::uuid`;
    if (!debate[0]) throw new DomainError('DEBATE_NOT_FOUND', 'Debate no encontrado');
    const isAuthor = debate[0].author_id === actorId;
    const isAdmin = actorRole === 'ADMIN';
    if (!isAuthor && !isAdmin) throw new DomainError('NOT_DEBATE_AUTHOR', 'Solo el autor puede cambiar el estado');
    const next = String(dto.state ?? '');
    if (!(DEBATE_STATES as readonly string[]).includes(next)) throw new DomainError('STATE_INVALID', 'Estado no válido');

    if (next === 'community_resolved') {
      const summary = this.cleanText(dto.summary, 500);
      if (!summary) throw new DomainError('SUMMARY_REQUIRED', 'Cuéntanos cómo se resolvió');
      await this.db.$queryRaw`
        UPDATE lifebook.debates SET state='community_resolved', resolved_summary=${summary},
               resolved_by=${actorId}::uuid, resolved_at=now(), closed_at=now()
        WHERE post_id=${debateId}::uuid`;
    } else if (next === 'attention') {
      await this.db.$queryRaw`
        UPDATE lifebook.debates SET state='attention', attention_at=now()
        WHERE post_id=${debateId}::uuid`;
    } else if (next === 'closed') {
      await this.db.$queryRaw`
        UPDATE lifebook.debates SET state='closed', closed_by=${actorId}::uuid, closed_at=now()
        WHERE post_id=${debateId}::uuid`;
    } else if (next === 'open' || next === 'discussing' || next === 'proposals') {
      await this.db.$queryRaw`
        UPDATE lifebook.debates SET state=${next}, resolved_summary=NULL
        WHERE post_id=${debateId}::uuid`;
    } else {
      throw new DomainError('STATE_INVALID', 'Estado no válido');
    }
    // Auditoría (content_id = debateId; action = 'debate_' + estado).
    // Aquí hubo un fallo real: `admin_id` se escribía como
    // `${isAdmin ? actorId + '::uuid' : null}`, con el cast DENTRO de la
    // interpolación, así que Prisma enviaba el texto "<uuid>::uuid" a una columna
    // uuid (22P02). Cuando actuaba un ADMINISTRADOR la auditoría fallaba y la
    // operación devolvía 500; cuando actuaba el sistema (`null`) sí funcionaba.
    // Por eso había 30 auditorías de debate con admin_id nulo y ninguna con admin.
    await this.db.$queryRaw`
      INSERT INTO lifebook.mod_actions (content_id, target_user_id, admin_id, action, reason, reason_text)
      VALUES (${debateId}::uuid, ${debate[0].author_id}::uuid,
              ${isAdmin ? actorId : null}::uuid,
              ${'debate_' + next}, 'debate_state', ${this.cleanText(dto.summary, 300) || null})`;
    return { ok: true, state: next };
  }

  // =========================================================================
  // ENLACES A SERVICIOS REALES (verificados por rol del autor)
  // =========================================================================
  /** Valida y normaliza service_link según el rol verificado del autor. */
  private async resolveLink(userId: string, linkType?: string, linkId?: string) {
    if (!linkType) return null;
    if (!(LINK_TYPES as readonly string[]).includes(linkType)) {
      throw new DomainError('LINK_TYPE_INVALID', 'Tipo de enlace no válido');
    }
    if (linkId && !/^[A-Za-z0-9-]{1,80}$/.test(String(linkId))) {
      throw new DomainError('LINK_ID_INVALID', 'Enlace no válido');
    }
    // lifebook (perfil/publicación propia) y tickets: sin requisito extra.
    if (linkType === 'lifebook' || linkType === 'tickets' || linkType === 'paquete') {
      return { type: linkType, id: linkId ? String(linkId).slice(0, 80) : null };
    }
    if (linkType === 'taxi') {
      const d: any[] = await this.db.$queryRaw`
        SELECT 1 FROM mobility.drivers WHERE user_id=${userId}::uuid AND status IN ('active','offline') LIMIT 1`;
      if (!d[0]) throw new DomainError('ROLE_NOT_VERIFIED', 'Para enlazar taxi necesitas ser conductor verificado');
      return { type: 'taxi', id: null };
    }
    if (linkType === 'food') {
      const r: any[] = await this.db.$queryRaw`
        SELECT 1 FROM wallet.food_restaurants WHERE user_id=${userId}::uuid AND status='active' LIMIT 1`;
      if (!r[0]) throw new DomainError('ROLE_NOT_VERIFIED', 'Para enlazar comida necesitas un restaurante verificado');
    } else if (linkType === 'ecomerse') {
      const r: any[] = await this.db.$queryRaw`
        SELECT 1 FROM wallet.ecomerse_sellers WHERE user_id=${userId}::uuid AND status='active' LIMIT 1`;
      if (!r[0]) throw new DomainError('ROLE_NOT_VERIFIED', 'Para enlazar tu tienda necesitas una tienda verificada');
    } else if (linkType === 'work') {
      const r: any[] = await this.db.$queryRaw`
        SELECT 1 FROM wallet.jobs WHERE publisher_id=${userId}::uuid LIMIT 1`;
      if (!r[0]) throw new DomainError('ROLE_NOT_VERIFIED', 'Para enlazar una oferta necesitas ser contratista/empresa');
    } else if (linkType === 'rental') {
      const r: any[] = await this.db.$queryRaw`
        SELECT 1 FROM wallet.rental_landlords WHERE user_id=${userId}::uuid AND status='active' LIMIT 1`;
      if (!r[0]) throw new DomainError('ROLE_NOT_VERIFIED', 'Para enlazar un anuncio necesitas ser anfitrión verificado');
    }
    return { type: linkType, id: linkId ? String(linkId).slice(0, 80) : null };
  }

  // =========================================================================
  // LECTURA / FEED
  // =========================================================================
  /** Detalle de un post para un visor (aplica visibilidad y moderación). */
  async getPost(postId: string, viewerId?: string) {
    const base: any[] = await this.db.$queryRaw`
      SELECT p.id, p.author_id, p.type, p.title, p.body, p.city, p.barrio,
             p.tone, p.media_ids, p.payload, p.service_link, p.visibility, p.state,
             p.allow_comments, p.created_at, p.updated_at,
             u.full_name, u.avatar_url, u.role, u.name_color
      FROM lifebook.posts p
      JOIN mobility.users u ON u.id = p.author_id
      WHERE p.id = ${postId}::uuid`;
    if (!base[0]) return null;
    const row = base[0];

    const isAuthor = !!viewerId && viewerId === row.author_id;
    if (row.state !== 'active' && !isAuthor) return null;
    if (viewerId && !isAuthor) {
      // Parte 6: bloqueos mutuos ocultan el contenido.
      const b: any[] = await this.db.$queryRaw`
        SELECT 1 FROM lifebook.blocks
        WHERE (blocker_id=${row.author_id}::uuid AND blocked_id=${viewerId}::uuid)
           OR (blocker_id=${viewerId}::uuid AND blocked_id=${row.author_id}::uuid)
        LIMIT 1`;
      if (b[0]) return null;
    }
    if (row.visibility === 'private' && !isAuthor) return null;
    if (row.visibility === 'followers' && !isAuthor) {
      // El cast va FUERA de la interpolación. Con `viewerId + '::uuid'` dentro,
      // Prisma manda el TEXTO "<uuid>::uuid" y Postgres falla con
      // «operator does not exist: uuid = text»: cualquiera que no fuera el autor
      // recibía un 500 al abrir una publicación de visibilidad `followers`,
      // incluido un seguidor legítimo. Si `viewerId` es nulo, `NULL::uuid` no
      // coincide con nada y la publicación simplemente no se muestra.
      const f: any[] = await this.db.$queryRaw`
        SELECT 1 FROM lifebook.follows
        WHERE followee_id=${row.author_id}::uuid AND follower_id=${viewerId}::uuid LIMIT 1`;
      if (!f[0]) return null;
    }

    const stats: any[] = await this.db.$queryRaw`
      SELECT
        (SELECT count(*)::int FROM lifebook.likes l WHERE l.post_id=p.id) AS likes,
        (SELECT count(*)::int FROM lifebook.comments c WHERE c.post_id=p.id AND c.state='active') AS comments,
        (SELECT count(*)::int FROM lifebook.bookmarks b WHERE b.post_id=p.id) AS bookmarks,
        EXISTS(SELECT 1 FROM lifebook.likes l2 WHERE l2.post_id=p.id AND l2.user_id=${viewerId ? viewerId : '00000000-0000-0000-0000-000000000000'}::uuid) AS liked,
        EXISTS(SELECT 1 FROM lifebook.bookmarks b2 WHERE b2.post_id=p.id AND b2.user_id=${viewerId ? viewerId : '00000000-0000-0000-0000-000000000000'}::uuid) AS bookmarked,
        EXISTS(SELECT 1 FROM lifebook.follows f4 WHERE f4.followee_id=p.author_id AND f4.follower_id=${viewerId ? viewerId : '00000000-0000-0000-0000-000000000000'}::uuid) AS followed_by_me
      FROM lifebook.posts p WHERE p.id=${postId}::uuid`;
    const s = stats[0];
    const out = this.serialize(row, {
      likes: Number(s?.likes ?? 0),
      comments: Number(s?.comments ?? 0),
      bookmarks: Number(s?.bookmarks ?? 0),
      likedByMe: !!s?.liked,
      bookmarkedByMe: !!s?.bookmarked,
    });
    // Parte 11: `followedByMe` sale de la consulta de stats (no de la fila del post).
    if (out && (out as any).author) (out as any).author.followedByMe = !!s?.followed_by_me;
    // Adjunta datos del debate si es tipo debate.
    if (row.type === 'debate') {
      const d: any[] = await this.db.$queryRaw`
        SELECT category, state, allow_proposals, allow_votes, show_approx_loc,
               problem, context, initial_proposal, resolved_summary,
               resolved_at, attention_at, closed_at
        FROM lifebook.debates WHERE post_id=${postId}::uuid`;
      if (d[0]) {
        // Parte 14: agregado sí/no sobre los votos REALES de las propuestas
        // (agree → sí · disagree → no · help no cuenta). No hay votación a
        // nivel de debate: esto es un resumen, y `question` es alias de `problem`.
        const votes: any[] = await this.db.$queryRaw`
          SELECT
            (SELECT count(*)::int FROM lifebook.proposal_votes v
               JOIN lifebook.proposals pr ON pr.id = v.proposal_id
              WHERE pr.debate_id = ${postId}::uuid AND v.vote = 'agree') AS yes,
            (SELECT count(*)::int FROM lifebook.proposal_votes v
               JOIN lifebook.proposals pr ON pr.id = v.proposal_id
              WHERE pr.debate_id = ${postId}::uuid AND v.vote = 'disagree') AS no,
            (SELECT v.vote FROM lifebook.proposal_votes v
               JOIN lifebook.proposals pr ON pr.id = v.proposal_id
              WHERE pr.debate_id = ${postId}::uuid
                AND v.user_id = ${(viewerId || '00000000-0000-0000-0000-000000000000')}::uuid
              LIMIT 1) AS my_vote`;
        const vv = votes[0] ?? {};
        (out as any).debate = {
          category: d[0].category,
          state: d[0].state,
          allowProposals: !!d[0].allow_proposals,
          allowVotes: !!d[0].allow_votes,
          showApproxLoc: !!d[0].show_approx_loc,
          problem: d[0].problem ?? null,
          /** Alias del enunciado del debate. */
          question: d[0].problem ?? null,
          context: d[0].context ?? null,
          initialProposal: d[0].initial_proposal ?? null,
          resolvedSummary: d[0].resolved_summary ?? null,
          resolvedAt: d[0].resolved_at ? String(d[0].resolved_at) : null,
          attentionAt: d[0].attention_at ? String(d[0].attention_at) : null,
          closedAt: d[0].closed_at ? String(d[0].closed_at) : null,
          votesYes: Number(vv.yes ?? 0),
          votesNo: Number(vv.no ?? 0),
          myVote: vv.my_vote === 'agree' ? 'yes' : vv.my_vote === 'disagree' ? 'no' : null,
        };
      }
    }
    if (row.type === 'serie') {
      const s: any[] = await this.db.$queryRaw`
        SELECT count(*)::int AS episodes, count(DISTINCT season)::int AS seasons,
               COALESCE(SUM(duration_sec), 0)::int AS total_sec
        FROM lifebook.series_episodes WHERE serie_id=${postId}::uuid AND state='active'`;
      (out as any).serie = s[0]
        ? { episodesCount: Number(s[0].episodes), seasons: Number(s[0].seasons), totalSeconds: Number(s[0].total_sec) }
        : { episodesCount: 0, seasons: 0, totalSeconds: 0 };
    }
    return out;
  }

  /** Feed por ciudad (keyset por created_at); filtra por type si llega.
   *  Parte 6: delega en feedPage (aplican bloqueos mutuos y marcas del visor). */
  async feedCity(city: string, opts: { cursor?: string; limit?: number; viewerId?: string; type?: string }) {
    const args: unknown[] = [city];
    let conds = `p.city = $1 AND p.state='active' AND p.visibility='public'`;
    if (opts.type) { args.push(opts.type); conds += ` AND p.type = $${args.length}`; }
    return this.feedPage(conds, args, { cursor: opts.cursor, limit: opts.limit, viewerId: opts.viewerId });
  }

  /**
   * Feed "Para ti" (ciudad del perfil + nacional, simples).
   *
   * 🔴 Lo que estaba pasando: el comentario prometía «ciudad del perfil + nacional», pero el código
   * solo filtraba `p.city = <mi ciudad>`. La cuenta del teléfono tiene ciudad **«Acurenam»**, donde
   * no hay ni una publicación, así que «Para ti» devolvía **0 publicaciones** (Malabo 774, Bata 161,
   * Luba 2, Acurenam 0) y el feed de VÍDEOS salía en blanco aunque hubiera 29 vídeos públicos.
   *
   * Ahora, si mi ciudad no tiene nada público, «Para ti» sigue con lo NACIONAL. La decisión se toma
   * UNA vez, al empezar a paginar, para que el cursor por fecha siga siendo válido: no se cambia de
   * feed a mitad de página (eso sí que se saltaría publicaciones).
   */
  async feedForYou(userId: string, opts: { cursor?: string; limit?: number; type?: string }) {
    const u: any[] = await this.db.$queryRaw`SELECT city FROM mobility.users WHERE id=${userId}::uuid`;
    const city = String(u[0]?.city ?? '').trim() || 'Malabo';
    const args: unknown[] = [city];
    let cond = `p.city = $1 AND p.state = 'active' AND p.visibility = 'public'`;
    if (opts.type) { args.push(opts.type); cond += ` AND p.type = $${args.length}`; }
    const hay: any[] = await this.db.$queryRawUnsafe(`SELECT 1 FROM lifebook.posts p WHERE ${cond} LIMIT 1`, ...args);
    if (hay[0]) return this.feedCity(city, { ...opts, viewerId: userId });
    return this.feedNational({ ...opts, viewerId: userId });
  }

  /** Feed NACIONAL: lo público de cualquier ciudad (el «+ nacional» que promete «Para ti»). */
  async feedNational(opts: { cursor?: string; limit?: number; viewerId?: string; type?: string }) {
    const args: unknown[] = [];
    let conds = `p.state='active' AND p.visibility='public'`;
    if (opts.type) { args.push(opts.type); conds += ` AND p.type = $${args.length}`; }
    return this.feedPage(conds, args, { cursor: opts.cursor, limit: opts.limit, viewerId: opts.viewerId });
  }

  // =========================================================================
  // PARTE 3 — FEED POR CANALES + PERFIL PÚBLICO
  // =========================================================================

  /** Ejecutor común de páginas de feed (keyset por created_at DESC, límites y marca liked/bookmarked del visor). */
  private async feedPage(whereSql: string, args: unknown[], opts: {
    cursor?: string; limit?: number; viewerId?: string; channel?: string | null;
    /** TANDA I: la expresión de distancia (SQL) para pintarla y ordenar por ella. */
    distExpr?: string | null;
    sort?: string | null;
    /** Órdenes que no son por fecha: el cursor por fecha no aplica. */
    sinCursor?: boolean;
  }) {
    const limit = Math.min(Math.max(Number(opts.limit ?? 15) || 15, 1), 40);
    const cursorIdx = args.length + 1;
    const orderCursor = opts.cursor && !opts.sinCursor ? `AND p.created_at < $${cursorIdx}::timestamptz` : '';
    if (opts.cursor) args.push(opts.cursor);
    args.push(opts.viewerId ?? null);
    const vidIdx = args.length;
    // Parte 6: bloqueos mutuos (yo bloqueo al autor o el autor me bloquea a mí).
    const blockCond = opts.viewerId
      ? ` AND NOT EXISTS (SELECT 1 FROM lifebook.blocks bb
           WHERE (bb.blocker_id = p.author_id AND bb.blocked_id = $${vidIdx}::uuid)
              OR (bb.blocker_id = $${vidIdx}::uuid AND bb.blocked_id = p.author_id))`
      : '';
    const rows: any[] = await this.db.$queryRawUnsafe(`
      SELECT p.id, p.author_id, p.type, p.title, p.body, p.city, p.barrio,
             p.tone, p.media_ids, jsonb_array_length(p.media_ids) AS media_count, p.payload, p.service_link, p.visibility, p.state, p.created_at,
             ${opts.distExpr ? `${opts.distExpr} AS distance_km` : 'NULL::float8 AS distance_km'},
             to_char(p.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_cursor,
             u.full_name, u.avatar_url, u.role, u.name_color,
             (SELECT count(*)::int FROM lifebook.likes l WHERE l.post_id=p.id) AS likes,
             (SELECT count(*)::int FROM lifebook.comments c WHERE c.post_id=p.id AND c.state='active') AS comments,
             (SELECT count(*)::int FROM lifebook.bookmarks bm WHERE bm.post_id=p.id) AS saves,
             EXISTS(SELECT 1 FROM lifebook.likes l2 WHERE l2.post_id=p.id AND l2.user_id=$${vidIdx}::uuid) AS liked,
             EXISTS(SELECT 1 FROM lifebook.bookmarks b2 WHERE b2.post_id=p.id AND b2.user_id=$${vidIdx}::uuid) AS bookmarked,
             EXISTS(SELECT 1 FROM lifebook.follows f3 WHERE f3.followee_id=p.author_id AND f3.follower_id=$${vidIdx}::uuid) AS followed_by_me
      FROM lifebook.posts p
      JOIN mobility.users u ON u.id = p.author_id
      WHERE ${whereSql}${blockCond} ${orderCursor}
      ORDER BY ${opts.sort === 'distance' && opts.distExpr
        ? 'distance_km ASC NULLS LAST'
        : opts.sort === 'hot'
          ? `(SELECT count(*) FROM lifebook.likes l WHERE l.post_id = p.id)
             + (SELECT count(*) FROM lifebook.comments c WHERE c.post_id = p.id AND c.state = 'active')
             + (SELECT count(*) FROM lifebook.bookmarks bm WHERE bm.post_id = p.id) DESC, p.created_at DESC`
          : 'p.created_at DESC'}
      LIMIT ${limit + 1}`,
      ...args);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    // Cursor con precisión de microsegundos (el Date de JS truncaría a ms y
    // volvería a traer la última fila de la página anterior).
    return { posts: page.map((r) => this.serializeFeed(r, { channel: opts.channel ?? null })), nextCursor: hasMore && page.length ? String(page[page.length - 1].created_cursor) : null };
  }

  /** Feed por canal (Parte 3). Canal desconocido → 400 CHANNEL_INVALID. */
  async feedChannel(viewerId: string, q: {
    channel?: string; city?: string; type?: string; cursor?: string; limit?: number;
    /** TANDA I: mi posición y el radio («附近» ≈ 1 km, «3km», o nada = toda la ciudad). */
    lat?: string | number; lng?: string | number; radiusKm?: string | number;
    /** `distance` (más cerca primero) · `hot` (más interacción) · por defecto, lo más nuevo. */
    sort?: string;
    /** `1h` · `24h` · `7d` · `30d`. */
    since?: string;
  }) {
    const channel = String(q.channel ?? '').trim() || 'for_you';
    if (!(FEED_CHANNELS as readonly string[]).includes(channel)) {
      throw new DomainError('CHANNEL_INVALID', 'Canal no válido');
    }
    if (channel === 'for_you') return this.feedForYou(viewerId, { cursor: q.cursor, limit: q.limit, type: q.type });
    const city = String(q.city ?? '').trim() || 'Malabo';
    const args: unknown[] = [];
    const base: string[] = [`p.state='active'`];

    if (channel === 'following') {
      // Solo cuentas que sigo; su contenido 'followers' entra porque ya les sigo.
      args.push(viewerId);
      base.push(`EXISTS(SELECT 1 FROM lifebook.follows f WHERE f.followee_id=p.author_id AND f.follower_id=$${args.length}::uuid)`);
      base.push(`p.visibility IN ('public','followers')`);
      // El CHIP de esta sección puede pedir un tipo: «Comercio» dentro de Seguidos es
      // el comercio DE LA GENTE QUE SIGO (type='sale'), no el comercio de todos.
      if (q.type) { args.push(String(q.type).slice(0, 16)); base.push(`p.type=$${args.length}`); }
      return this.feedPage(base.join(' AND '), args, { cursor: q.cursor, limit: q.limit, viewerId, channel });
    }

    base.push(`p.visibility='public'`);
    if (channel === 'nearby') {
      args.push(city);
      base.push(`p.city=$${args.length}`);
      // «Comercio» dentro de Ciudad = las ventas DE MI CIUDAD.
      if (q.type) { args.push(String(q.type).slice(0, 16)); base.push(`p.type=$${args.length}`); }

      /**
       * TANDA I — «CERCA DE MÍ» Y «TODA LA CIUDAD».
       *
       * Si la app manda mi posición, se calcula la distancia REAL (círculo máximo) y, si además
       * manda un radio, se queda con lo que está dentro. Las notas SIN coordenadas quedan fuera
       * cuando se pide un radio: no se puede prometer una distancia que no se sabe. En «toda la
       * ciudad» (sin radio) sí salen todas las de la ciudad, con o sin sitio.
       */
      const geo = this.geoDe(q);
      let distExpr: string | null = null;
      if (geo) {
        args.push(geo.lat);
        const iLat = args.length;
        args.push(geo.lng);
        const iLng = args.length;
        // Se comprueba el formato antes de convertir: un `payload` raro no puede tumbar el feed.
        base.push(`(p.payload->>'lat') ~ '^-?[0-9.]+$' AND (p.payload->>'lng') ~ '^-?[0-9.]+$'`);
        distExpr = `(6371 * acos(LEAST(1, GREATEST(-1,
            cos(radians($${iLat}::float8)) * cos(radians((p.payload->>'lat')::float8)) *
            cos(radians((p.payload->>'lng')::float8) - radians($${iLng}::float8)) +
            sin(radians($${iLat}::float8)) * sin(radians((p.payload->>'lat')::float8))))))`;
        if (geo.radiusKm !== null) {
          args.push(geo.radiusKm);
          base.push(`${distExpr} <= $${args.length}`);
        }
      }
      const since = this.sinceDe(q.since);
      if (since) base.push(`p.created_at > now() - interval '${since}'`);
      return this.feedPage(base.join(' AND '), args, {
        cursor: q.cursor, limit: q.limit, viewerId, channel,
        distExpr, sort: q.sort ?? null,
        /** Con orden por distancia o por interacción el cursor por fecha no vale: no se pagina. */
        sinCursor: (q.sort === 'distance' && !!distExpr) || q.sort === 'hot',
      });
    } else if (channel === 'today') {
      base.push(`p.created_at > now() - interval '24 hours'`);
      if (q.city) { args.push(city); base.push(`p.city=$${args.length}`); }
      if (q.type) { args.push(String(q.type).slice(0, 16)); base.push(`p.type=$${args.length}`); }
    } else if (channel === 'debates' || channel === 'sales') {
      args.push(channel === 'debates' ? 'debate' : 'sale');
      base.push(`p.type=$${args.length}`);
      if (q.city) { args.push(city); base.push(`p.city=$${args.length}`); }
      if (q.type) { args.push(String(q.type).slice(0, 16)); base.push(`p.type=$${args.length}`); }
    } else if (CHANNEL_WORDS[channel]) {
      const cfg = CHANNEL_WORDS[channel];
      // OJO — la ciudad NO se aplica aquí, y es a propósito.
      // Se probó a aplicarla «solo si el cliente la manda», pero la app SIEMPRE la
      // manda (la necesita para `nearby`), así que en la práctica los chips de
      // DESCUBRIR (Cultura, Música, Deportes…) se volvieron de una sola ciudad:
      // Cultura pasó de 10 publicaciones a 2. Eso es una regresión, no una mejora.
      // Los chips de la pestaña Ciudad podrán filtrar por ciudad cuando el cliente
      // sepa pedirlo SOLO para esos chips (llega con la fila de chips por sección);
      // hasta entonces, los canales por palabras se quedan globales, como estaban.
      args.push(cfg.words.join(','));
      const kw = `
        EXISTS (SELECT 1 FROM regexp_split_to_table(
                 translate(regexp_replace(lower(concat_ws(' ',
                   coalesce(p.title,''), coalesce(p.body,''),
                   coalesce(p.payload->>'serviceType',''),
                   coalesce(p.payload->>'category',''),
                   (SELECT string_agg(x,' ') FROM jsonb_array_elements_text(coalesce(p.payload->'topics','[]'::jsonb)) x)
                 )), '[^a-z0-9 áéíóúüñ]', '', 'g'), 'áéíóúüñ', 'aeiouun'), ' +') t
        WHERE t <> '' AND t = ANY(string_to_array($${args.length}, ',')))`;
      if (cfg.link) {
        args.push(cfg.link);
        base.push(`(${kw} OR p.service_link->>'type' = $${args.length})`);
      } else {
        base.push(kw);
      }
      if (q.city) { args.push(city); base.push(`p.city=$${args.length}`); }
      if (q.type) { args.push(String(q.type).slice(0, 16)); base.push(`p.type=$${args.length}`); }
    }
    return this.feedPage(base.join(' AND '), args, { cursor: q.cursor, limit: q.limit, viewerId, channel });
  }

  // =========================================================================
  // PARTE 9 — BÚSQUEDA (publicaciones por texto, tendencias y sugerencias)
  // =========================================================================

  /** Normaliza un término: minúsculas, sin acentos y sin signos. */
  private normTerm(value: unknown, max = 60): string {
    return String(value ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, max);
  }

  /** Texto buscable de un post: título, cuerpo, barrio, ciudad, tipo/categoría, temas y autor. */
  private static readonly SEARCH_HAYSTACK = `translate(lower(concat_ws(' ',
      coalesce(p.title,''), coalesce(p.body,''), coalesce(p.barrio,''), coalesce(p.city,''),
      coalesce(p.payload->>'serviceType',''), coalesce(p.payload->>'category',''),
      (SELECT string_agg(x,' ') FROM jsonb_array_elements_text(coalesce(p.payload->'topics','[]'::jsonb)) x),
      u.full_name)), 'áéíóúüñ', 'aeiouun')`;

  /** Condición por canal temático (mismos sinónimos por token que usa el feed). */
  private channelWordsCondition(channel: string, args: unknown[]): string | null {
    const cfg = CHANNEL_WORDS[channel];
    if (!cfg) return null;
    args.push(cfg.words.join(','));
    const kw = `
        EXISTS (SELECT 1 FROM regexp_split_to_table(
                 translate(regexp_replace(lower(concat_ws(' ',
                   coalesce(p.title,''), coalesce(p.body,''),
                   coalesce(p.payload->>'serviceType',''),
                   coalesce(p.payload->>'category',''),
                   (SELECT string_agg(x,' ') FROM jsonb_array_elements_text(coalesce(p.payload->'topics','[]'::jsonb)) x)
                 )), '[^a-z0-9 áéíóúüñ]', '', 'g'), 'áéíóúüñ', 'aeiouun'), ' +') t
        WHERE t <> '' AND t = ANY(string_to_array($${args.length}, ',')))`;
    if (!cfg.link) return kw;
    args.push(cfg.link);
    return `(${kw} OR p.service_link->>'type' = $${args.length})`;
  }

  /**
   * Búsqueda de publicaciones (Parte 9). Solo contenido público y activo, con
   * los mismos filtros de bloqueo/marca del visor que el feed. Todas las
   * palabras del término deben aparecer (AND). Término corto → página vacía.
   */
  async search(viewerId: string, q: { q?: string; type?: string; city?: string; cursor?: string; limit?: number }) {
    const term = this.normTerm(q.q, 60);
    if (term.length < 2) return { posts: [], nextCursor: null, query: term };
    const args: unknown[] = [];
    const base: string[] = [`p.state='active'`, `p.visibility='public'`];
    for (const token of term.split(' ').filter(Boolean).slice(0, 6)) {
      args.push(`%${token}%`);
      base.push(`${LifebookService.SEARCH_HAYSTACK} LIKE $${args.length}`);
    }
    const filter = String(q.type ?? '').trim();
    if (filter && filter !== 'all') {
      if ((SEARCH_TYPES as readonly string[]).includes(filter)) {
        args.push(filter);
        base.push(`p.type=$${args.length}`);
      } else {
        const cond = this.channelWordsCondition(filter, args);
        if (!cond) throw new DomainError('SEARCH_FILTER_INVALID', 'Filtro de búsqueda no válido');
        base.push(cond);
      }
    }
    const city = String(q.city ?? '').trim();
    if (city) { args.push(city.slice(0, 90)); base.push(`p.city=$${args.length}`); }
    const page = await this.feedPage(base.join(' AND '), args, { cursor: q.cursor, limit: q.limit, viewerId });
    return { ...page, query: term };
  }

  /**
   * Tendencias REALES de los últimos 30 días: temas (topics) por número de
   * publicaciones y, si faltan, palabras frecuentes de títulos/cuerpos.
   * `hot` = 5 o más publicaciones en la ventana.
   */
  async searchTrends(q: { city?: string; limit?: number } = {}) {
    const city = String(q.city ?? '').trim();
    const limit = Math.min(Math.max(Number(q.limit ?? 10) || 10, 1), 20);
    const args: unknown[] = [];
    let cityCond = '';
    if (city) { args.push(city.slice(0, 90)); cityCond = ` AND p.city=$${args.length}`; }
    const tags: any[] = await this.db.$queryRawUnsafe(`
      SELECT t.tag AS tag, count(*)::int AS n
      FROM lifebook.posts p, jsonb_array_elements_text(coalesce(p.payload->'topics','[]'::jsonb)) t(tag)
      WHERE p.state='active' AND p.visibility='public'
        AND p.created_at > now() - interval '30 days'${cityCond}
        AND length(t.tag) BETWEEN 3 AND 30
      GROUP BY t.tag ORDER BY n DESC, t.tag ASC LIMIT ${limit}`, ...args);
    const out: Array<{ tag: string; count: number; hot: boolean; source: 'topic' | 'word' }> =
      tags.map((t) => ({ tag: String(t.tag), count: Number(t.n ?? 0), hot: Number(t.n ?? 0) >= 5, source: 'topic' as const }));
    if (out.length < limit) {
      const seen = new Set(out.map((t) => t.tag.toLowerCase()));
      args.push(SEARCH_STOPWORDS.join(','));
      const words: any[] = await this.db.$queryRawUnsafe(`
        SELECT w, count(*)::int AS n FROM (
          SELECT regexp_split_to_table(
                   translate(lower(concat_ws(' ', coalesce(p.title,''), coalesce(p.body,''))), 'áéíóúüñ', 'aeiouun'),
                   '[^a-z0-9]+') AS w
          FROM lifebook.posts p
          WHERE p.state='active' AND p.visibility='public'
            AND p.created_at > now() - interval '30 days'${cityCond}
        ) s
        WHERE length(w) >= 4 AND w <> ALL(string_to_array($${args.length}, ','))
        GROUP BY w ORDER BY n DESC, w ASC LIMIT ${limit}`, ...args);
      for (const w of words) {
        const tag = String(w.w ?? '');
        if (!tag || seen.has(tag.toLowerCase())) continue;
        seen.add(tag.toLowerCase());
        out.push({ tag, count: Number(w.n ?? 0), hot: false, source: 'word' });
        if (out.length >= limit) break;
      }
    }
    return { city: city || null, window: '30d', trends: out, generatedAt: new Date().toISOString() };
  }

  /** Sugerencias en vivo: temas (topics) que contienen el término + nombres de usuarios. */
  async searchSuggest(q: { q?: string; limit?: number } = {}) {
    const term = this.normTerm(q.q, 40);
    if (term.length < 2) return { suggestions: [] as Array<{ text: string; type: string }> };
    const limit = Math.min(Math.max(Number(q.limit ?? 8) || 8, 1), 12);
    const like = `%${term}%`;
    const tags: any[] = await this.db.$queryRawUnsafe(`
      SELECT t.tag AS text, count(*)::int AS n
      FROM lifebook.posts p, jsonb_array_elements_text(coalesce(p.payload->'topics','[]'::jsonb)) t(tag)
      WHERE p.state='active' AND p.visibility='public'
        AND p.created_at > now() - interval '180 days'
        AND translate(lower(t.tag), 'áéíóúüñ', 'aeiouun') LIKE $1
      GROUP BY t.tag ORDER BY n DESC, t.tag ASC LIMIT 5`, like);
    const users: any[] = await this.db.$queryRawUnsafe(`
      SELECT full_name AS text FROM mobility.users
      WHERE status='ACTIVE' AND length(coalesce(full_name,'')) >= 3
        AND translate(lower(full_name), 'áéíóúüñ', 'aeiouun') LIKE $1
      ORDER BY full_name ASC LIMIT 4`, like);
    const suggestions: Array<{ text: string; type: string }> = [
      ...tags.map((t) => ({ text: String(t.text), type: 'tag' })),
      ...users.map((u) => ({ text: String(u.text), type: 'user' })),
    ];
    const literal = String(q.q ?? '').trim();
    if (literal && suggestions.length < limit) suggestions.push({ text: literal, type: 'general' });
    return { suggestions: suggestions.slice(0, limit) };
  }

  // =========================================================================
  // PARTE 10 — PUBLICACIONES RELACIONADAS ("Descubrir más" del detalle)
  // =========================================================================

  /**
   * Relacionadas de una publicación: mismo tema (topics), mismo tipo o misma
   * ciudad, siempre públicas, activas y sin la propia publicación. Reutiliza
   * `feedPage` (bloqueos mutuos + marcas del visor + orden por fecha).
   */
  async relatedPosts(postId: string, viewerId: string, opts: { limit?: number } = {}) {
    const rows: any[] = await this.db.$queryRawUnsafe(
      `SELECT p.type, p.city, p.payload->'topics' AS topics
       FROM lifebook.posts p WHERE p.id = $1::uuid`, postId);
    if (!rows[0]) throw new DomainError('POST_NOT_FOUND', 'Publicación no encontrada');
    const type = String(rows[0].type ?? '');
    const city = String(rows[0].city ?? '');
    const rawTopics: unknown[] = Array.isArray(rows[0].topics) ? rows[0].topics : [];
    const topics: string[] = rawTopics
      .map((t) => String(t))
      .filter((t) => t.length >= 3)
      .slice(0, 4);
    const args: unknown[] = [postId];
    const where: string[] = [`p.state='active'`, `p.visibility='public'`, `p.id <> $1::uuid`];
    const affinity: string[] = [];
    if (topics.length) {
      args.push(topics.join(','));
      affinity.push(`EXISTS (SELECT 1 FROM jsonb_array_elements_text(coalesce(p.payload->'topics','[]'::jsonb)) t
        WHERE t = ANY(string_to_array($${args.length}, ',')))`);
    }
    if (type) { args.push(type); affinity.push(`p.type=$${args.length}`); }
    if (city) { args.push(city); affinity.push(`p.city=$${args.length}`); }
    if (affinity.length) where.push(`(${affinity.join(' OR ')})`);
    const page = await this.feedPage(where.join(' AND '), args, {
      limit: opts.limit ?? 6, viewerId,
    });
    return page;
  }

  /** Perfil público de un usuario: identidad + contadores + rol verificado + relación. */
  async userProfile(targetId: string, viewerId?: string) {
    const rows: any[] = await this.db.$queryRaw`
      SELECT id, full_name, avatar_url, cover_photo_url, name_color, bio,
             city, country, profession, school, links, rating_avg, role, created_at
      FROM mobility.users WHERE id=${targetId}::uuid`;
    if (!rows[0]) throw new DomainError('PROFILE_NOT_FOUND', 'Usuario no encontrado');
    const u = rows[0];
    const vid = viewerId || '00000000-0000-0000-0000-000000000000';
    const st: any[] = await this.db.$queryRaw`
      SELECT
        (SELECT count(*)::int FROM lifebook.posts p
          WHERE p.author_id=${targetId}::uuid AND p.state='active'
            AND (p.visibility IN ('public','followers') OR p.author_id=${vid}::uuid)) AS posts,
        (SELECT count(*)::int FROM lifebook.follows f WHERE f.followee_id=${targetId}::uuid) AS followers,
        (SELECT count(*)::int FROM lifebook.follows f WHERE f.follower_id=${targetId}::uuid) AS following,
        (SELECT count(*)::int FROM lifebook.likes l JOIN lifebook.posts p ON p.id=l.post_id
           WHERE p.author_id=${targetId}::uuid AND p.state='active') AS likes,
        EXISTS(SELECT 1 FROM mobility.drivers d WHERE d.user_id=${targetId}::uuid AND d.status IN ('active','offline')) AS is_driver,
        EXISTS(SELECT 1 FROM wallet.food_restaurants r WHERE r.user_id=${targetId}::uuid AND r.status='active') AS is_food,
        EXISTS(SELECT 1 FROM wallet.ecomerse_sellers s WHERE s.user_id=${targetId}::uuid AND s.status='active') AS is_seller,
        EXISTS(SELECT 1 FROM wallet.rental_landlords l WHERE l.user_id=${targetId}::uuid AND l.status='active') AS is_rental,
        EXISTS(SELECT 1 FROM wallet.jobs j WHERE j.publisher_id=${targetId}::uuid) AS is_work,
        EXISTS(SELECT 1 FROM lifebook.follows f WHERE f.followee_id=${targetId}::uuid AND f.follower_id=${vid}::uuid) AS is_following,
        EXISTS(SELECT 1 FROM lifebook.follows f WHERE f.followee_id=${vid}::uuid AND f.follower_id=${targetId}::uuid) AS is_follower`;
    const s: any = st[0] ?? {};
    const links = u.links;
    return {
      id: u.id,
      fullName: u.full_name,
      avatarUrl: u.avatar_url,
      coverPhotoUrl: u.cover_photo_url,
      bio: u.bio ?? null,
      nameColor: u.name_color ?? '',
      city: u.city ?? null,
      country: u.country ?? null,
      profession: u.profession ?? null,
      school: u.school ?? null,
      links: Array.isArray(links) ? links.slice(0, 10) : (links && typeof links === 'object' ? Object.values(links).slice(0, 10) : []),
      ratingAvg: u.rating_avg != null ? Number(u.rating_avg) : null,
      role: u.role,
      createdAt: u.created_at ? String(u.created_at) : null,
      stats: {
        posts: Number(s.posts ?? 0),
        followers: Number(s.followers ?? 0),
        following: Number(s.following ?? 0),
        likes: Number(s.likes ?? 0),
      },
      verified: { driver: !!s.is_driver, food: !!s.is_food, seller: !!s.is_seller, work: !!s.is_work, rental: !!s.is_rental },
      relation: { isSelf: !!viewerId && viewerId === targetId, isFollowing: !!s.is_following, isFollower: !!s.is_follower },
    };
  }

  /** Publicaciones de un usuario visibles para el visor (pestañas del perfil). */
  async userPosts(targetId: string, viewerId?: string, opts: { type?: string; cursor?: string; limit?: number } = {}) {
    const args: unknown[] = [targetId, viewerId || '00000000-0000-0000-0000-000000000000'];
    let whereSql = `p.author_id=$1::uuid AND p.state='active' AND (p.visibility='public' OR $1::uuid=$2::uuid OR
       (p.visibility='followers' AND EXISTS(SELECT 1 FROM lifebook.follows f
          WHERE f.followee_id=p.author_id AND f.follower_id=$2::uuid)))`;
    if (opts.type) { args.push(String(opts.type).slice(0, 16)); whereSql += ` AND p.type=$${args.length}`; }
    return this.feedPage(whereSql, args, { cursor: opts.cursor, limit: opts.limit, viewerId });
  }

  // =========================================================================
  // PARTE 4 — VIDEO · PODCAST · SERIE (+ subida de media a MinIO)
  // =========================================================================

  private minio: MinioClient | null = null;
  private minioOk = false;
  private minioBuckets = new Set<string>();

  /** Cliente MinIO perezoso (mismo patrón que food/ecomerse/rental). */
  private minioClient(): MinioClient {
    if (!this.minio) {
      // ⚠️ .env con saltos de línea CRLF: pm2 inyecta las variables con un
      // '\r' final (byte 13) → minio-js rompe la firma ("Invalid character in
      // header content [authorization]"). Se recortan las claves SIEMPRE.
      const rawEp = String(process.env.MINIO_ENDPOINT || 'http://127.0.0.1:9000').trim();
      const ep = new URL(rawEp);
      this.minio = new MinioClient({
        endPoint: ep.hostname,
        port: Number(ep.port || (ep.protocol === 'https:' ? 443 : 80)),
        useSSL: ep.protocol === 'https:',
        accessKey: String(process.env.MINIO_ACCESS_KEY || 'minioadmin').trim(),
        secretKey: String(process.env.MINIO_SECRET_KEY || 'minioadmin').trim(),
      });
    }
    return this.minio;
  }

  private async ensureLbBucket(bucket: string): Promise<void> {
    if (this.minioBuckets.has(bucket)) return;
    const client = this.minioClient();
    try {
      const exists = await client.bucketExists(bucket);
      if (!exists) {
        await client.makeBucket(bucket);
        await client.setBucketPolicy(bucket, JSON.stringify({
          Version: '2012-10-17',
          Statement: [{
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucket}/*`],
          }],
        }));
      }
      this.minioBuckets.add(bucket);
    } catch (e) {
      Logger.warn(`ensureLbBucket ${bucket}: ${(e as Error).message}`, 'Lifebook');
    }
  }

  private isHttpUrl(v: unknown): boolean {
    return typeof v === 'string' && /^https?:\/\/[^\s]{5,500}$/.test(v);
  }

  /** Sube un archivo multipart (buffer) a MinIO según kind. Devuelve la URL pública. */
  async uploadMedia(file: { originalname?: string; mimetype?: string; buffer?: Buffer; size?: number }, kind: string) {
    const k = String(kind ?? '').trim().toLowerCase();
    if (!(MEDIA_KINDS as readonly string[]).includes(k)) {
      throw new DomainError('KIND_INVALID', 'Tipo de media no válido (image | video | audio)');
    }
    const buf = file?.buffer;
    if (!buf || buf.length < 20) throw new DomainError('MEDIA_REQUIRED', 'Falta el archivo');
    const sizeMb = buf.length / (1024 * 1024);
    if (sizeMb > LB_MEDIA_MAX[k]) throw new DomainError('MEDIA_TOO_LARGE', `El archivo supera el máximo (${LB_MEDIA_MAX[k]} MB)`);
    const mime = String(file?.mimetype ?? '').toLowerCase();
    const ext = LB_MEDIA_MIMES[k][mime];
    if (!ext) throw new DomainError('MEDIA_TYPE_INVALID', 'Formato de archivo no permitido');
    const bucket = LB_STORAGE_BUCKETS[k];
    const key = `${k === 'image' ? 'covers' : 'files'}/${randomUUID()}.${ext}`;
    await this.ensureLbBucket(bucket);
    try {
      await this.minioClient().putObject(bucket, key, buf, buf.length, {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=86400',
      });
    } catch (e) {
      throw new DomainError('UPLOAD_FAILED', 'No se pudo guardar el archivo: ' + ((e as Error).message ?? '').slice(0, 120));
    }
    const publicBase = process.env.MINIO_PUBLIC_BASE || 'https://hk.egrouteplan.com/storage';
    return { url: `${publicBase}/${bucket}/${key}`, kind: k, bytes: buf.length, contentType: mime };
  }

  /** Valida la URL devuelta por uploadMedia (o una previa) + duración y permisos. */
  private mediaFields(dto: { url?: string; durationSec?: number; allowComments?: boolean; allowDownload?: boolean }, capSec: number, needUrl: boolean) {
    if (needUrl && !this.isHttpUrl(dto.url)) throw new DomainError('MEDIA_REQUIRED', 'Sube primero el archivo de media');
    const dur = Number(dto.durationSec ?? 0);
    if (!Number.isInteger(dur) || dur < 1 || dur > capSec) {
      throw new DomainError('DURATION_INVALID', `La duración debe estar entre 1 y ${capSec} segundos`);
    }
    return { dur, allowComments: dto.allowComments !== false, allowDownload: !!dto.allowDownload };
  }

  // ---------------- VIDEO CORTO (≤60 s) ----------------
  async createVideo(userId: string, dto: {
    title: string; body?: string; city: string; barrio?: string;
    videoUrl?: string; coverUrl?: string; durationSec?: number;
    allowComments?: boolean; allowDownload?: boolean; visibility?: string;
    /** TANDA C: productos de MI tienda que van dentro del vídeo (el sticker). */
    productIds?: string[];
  }) {
    await this.assertCanPost(userId);
    const title = this.cleanText(dto.title, TITLE_MAX);
    if (title.length < 3) throw new DomainError('TITLE_TOO_SHORT', 'El título debe tener al menos 3 caracteres');
    this.assertNoContacts(title + ' ' + this.cleanText(dto.body, POST_TEXT_MAX));
    const { dur, allowComments, allowDownload } = this.mediaFields({ url: dto.videoUrl, durationSec: dto.durationSec, allowComments: dto.allowComments, allowDownload: dto.allowDownload }, VIDEO_SEC_MAX, true);
    const coverUrl = this.isHttpUrl(dto.coverUrl) ? String(dto.coverUrl) : null;
    const payload = {
      videoUrl: String(dto.videoUrl), durationSec: dur,
      coverUrl, allowComments, allowDownload,
    };
    const row: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.posts (author_id, type, title, body, city, barrio, media_ids, payload, visibility)
      VALUES (${userId}::uuid, 'video', ${title}, ${this.cleanText(dto.body, POST_TEXT_MAX) || null},
              ${this.cleanCity(dto.city)}, ${this.cleanText(dto.barrio, 90) || null},
              '[]'::jsonb, ${JSON.stringify(payload)}::jsonb, ${this.visibilityOf(dto.visibility)})
      RETURNING id`;
    // TANDA C: los productos que van DENTRO del vídeo (se pintan como sticker encima).
    await this.linkProducts(userId, String(row[0]?.id), dto.productIds);
    await this.invalidateFeed(this.cleanCity(dto.city));
    return this.getPost(row[0]?.id, userId);
  }

  // ---------------- PODCAST (audio + portada obligatoria) ----------------
  async createPodcast(userId: string, dto: {
    title?: string; body?: string; city: string; barrio?: string;
    audioUrl?: string; coverUrl?: string; durationSec?: number;
    allowComments?: boolean; allowDownload?: boolean; visibility?: string;
  }) {
    await this.assertCanPost(userId);
    const { dur, allowComments, allowDownload } = this.mediaFields({ url: dto.audioUrl, durationSec: dto.durationSec, allowComments: dto.allowComments, allowDownload: dto.allowDownload }, AUDIO_SEC_MAX, true);
    if (!this.isHttpUrl(dto.coverUrl)) throw new DomainError('COVER_REQUIRED', 'El podcast necesita una portada (imagen 1:1)');
    this.assertNoContacts(this.cleanText(dto.body, POST_TEXT_MAX));
    const payload = {
      audioUrl: String(dto.audioUrl), coverUrl: String(dto.coverUrl), durationSec: dur,
      allowComments, allowDownload,
    };
    const row: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.posts (author_id, type, title, body, city, barrio, media_ids, payload, visibility)
      VALUES (${userId}::uuid, 'podcast', ${this.cleanText(dto.title, TITLE_MAX) || null},
              ${this.cleanText(dto.body, POST_TEXT_MAX) || null},
              ${this.cleanCity(dto.city)}, ${this.cleanText(dto.barrio, 90) || null},
              '[]'::jsonb, ${JSON.stringify(payload)}::jsonb, ${this.visibilityOf(dto.visibility)})
      RETURNING id`;
    await this.invalidateFeed(this.cleanCity(dto.city));
    return this.getPost(row[0]?.id, userId);
  }

  // ---------------- SERIE (post + episodios) ----------------
  async createSerie(userId: string, dto: {
    title: string; body?: string; city: string; barrio?: string;
    coverUrl?: string; allowComments?: boolean; visibility?: string;
  }) {
    await this.assertCanPost(userId);
    const title = this.cleanText(dto.title, TITLE_MAX);
    if (title.length < 3) throw new DomainError('TITLE_TOO_SHORT', 'El título de la serie debe tener al menos 3 caracteres');
    this.assertNoContacts(title + ' ' + this.cleanText(dto.body, POST_TEXT_MAX));
    const coverUrl = this.isHttpUrl(dto.coverUrl) ? String(dto.coverUrl) : null;
    const payload = { coverUrl, allowComments: dto.allowComments !== false };
    const row: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.posts (author_id, type, title, body, city, barrio, media_ids, payload, visibility)
      VALUES (${userId}::uuid, 'serie', ${title}, ${this.cleanText(dto.body, POST_TEXT_MAX) || null},
              ${this.cleanCity(dto.city)}, ${this.cleanText(dto.barrio, 90) || null},
              '[]'::jsonb, ${JSON.stringify(payload)}::jsonb, ${this.visibilityOf(dto.visibility)})
      RETURNING id`;
    await this.invalidateFeed(this.cleanCity(dto.city));
    return this.getPost(row[0]?.id, userId);
  }

  /** Episodios de una serie (orden temporada, número). */
  async serieEpisodes(serieId: string, viewerId?: string) {
    const serie: any[] = await this.db.$queryRaw`
      SELECT 1 FROM lifebook.posts WHERE id=${serieId}::uuid AND type='serie' AND state='active'`;
    if (!serie[0]) throw new DomainError('SERIE_NOT_FOUND', 'Serie no encontrada');
    const rows: any[] = await this.db.$queryRaw`
      SELECT id, season, episode, title, body, video_url, cover_url, duration_sec,
             allow_download, created_at
      FROM lifebook.series_episodes
      WHERE serie_id=${serieId}::uuid AND state='active'
      ORDER BY season ASC, episode ASC
      LIMIT 500`;
    return rows.map((r) => ({
      id: r.id,
      season: Number(r.season),
      episode: Number(r.episode),
      label: `S${r.season}E${r.episode}`,
      title: r.title ?? null,
      body: r.body ?? null,
      videoUrl: r.video_url,
      coverUrl: r.cover_url ?? null,
      durationSec: r.duration_sec != null ? Number(r.duration_sec) : null,
      allowDownload: !!r.allow_download,
      createdAt: String(r.created_at),
    }));
  }

  /** Añade un episodio (número automático si no se indica). */
  async addSerieEpisode(userId: string, serieId: string, dto: {
    title?: string; body?: string; videoUrl?: string; coverUrl?: string;
    durationSec?: number; season?: number; episode?: number; allowDownload?: boolean;
  }) {
    const serie: any[] = await this.db.$queryRaw`
      SELECT p.author_id FROM lifebook.posts p
      WHERE p.id=${serieId}::uuid AND p.type='serie' AND p.state='active'`;
    if (!serie[0]) throw new DomainError('SERIE_NOT_FOUND', 'Serie no encontrada');
    if (serie[0].author_id !== userId) throw new DomainError('NOT_SERIE_AUTHOR', 'Solo el autor de la serie añade episodios');
    const season = Number(dto.season ?? 1);
    if (!Number.isInteger(season) || season < 1 || season > EP_SEASON_MAX) {
      throw new DomainError('EPISODE_INVALID', `Temporada entre 1 y ${EP_SEASON_MAX}`);
    }
    const { dur } = this.mediaFields({ url: dto.videoUrl, durationSec: dto.durationSec }, AUDIO_SEC_MAX, true);
    const coverUrl = this.isHttpUrl(dto.coverUrl) ? String(dto.coverUrl) : null;
    this.assertNoContacts(this.cleanText(dto.body, 500) + ' ' + this.cleanText(dto.title, 120));
    let number = Number(dto.episode ?? 0);
    if (dto.episode !== undefined && dto.episode !== null) {
      if (!Number.isInteger(number) || number < 1) throw new DomainError('EPISODE_INVALID', 'Número de episodio no válido');
      const dup: any[] = await this.db.$queryRaw`
        SELECT 1 FROM lifebook.series_episodes
        WHERE serie_id=${serieId}::uuid AND season=${season} AND episode=${number}`;
      if (dup[0]) throw new DomainError('EPISODE_EXISTS', `La serie ya tiene el episodio S${season}E${number}`);
    } else {
      const last: any[] = await this.db.$queryRaw`
        SELECT COALESCE(MAX(episode), 0) + 1 AS next FROM lifebook.series_episodes
        WHERE serie_id=${serieId}::uuid AND season=${season}`;
      number = Number(last[0]?.next ?? 1);
    }
    const row: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.series_episodes
             (serie_id, season, episode, title, body, video_url, cover_url, duration_sec, allow_download)
      VALUES (${serieId}::uuid, ${season}, ${number},
              ${this.cleanText(dto.title, 120) || null}, ${this.cleanText(dto.body, 500) || null},
              ${String(dto.videoUrl)}, ${coverUrl}, ${dur}, ${!!dto.allowDownload})
      RETURNING id`;
    return { id: row[0]?.id, season, episode: number, label: `S${season}E${number}`, ok: true };
  }

  // =========================================================================
  // PARTE 50-b — BORRAR UNA PUBLICACIÓN PROPIA (y los archivos que sólo ella usaba)
  // =========================================================================
  /**
   * Borra una publicación del autor (o cualquiera si quien pide es ADMIN) **y los archivos
   * que sólo ella estaba usando**.
   *
   * ── POR QUÉ HACÍA FALTA ────────────────────────────────────────────────────
   * Hasta aquí se podían borrar me gusta, comentarios, guardados, bloqueos… pero **no lo que
   * uno publica**. Con los vídeos de siempre (60 s / 120 MB) era una molestia; con el vídeo
   * largo de la Parte 50 (hasta 1200 MB) es un agujero: quien publica 900 MB por error no
   * tenía NINGUNA forma de recuperar ese espacio, y el disco de la máquina tiene 29 GB libres.
   *
   * ── TRES PRECAUCIONES, PORQUE BORRAR NO SE DESHACE ─────────────────────────
   *  1. **Autor o ADMIN, y nadie más.** Se compara contra `author_id` de la fila, no contra
   *     nada que venga del cliente. Un `userId` de otro da 403, no 404, para no mentir.
   *  2. **Un archivo sólo se borra si NINGUNA otra publicación lo usa.** La app sube un
   *     archivo nuevo por publicación, pero eso es una costumbre, no una garantía: si dos
   *     publicaciones comparten portada, borrar una dejaría la otra rota. Si está compartido,
   *     se deja en el almacén y se cuenta en la respuesta (`archivosCompartidos`). Es
   *     deliberadamente conservador: dejar un archivo de más se arregla, uno de menos no.
   *  3. **Las filas de `media_uploads` también se van.** Son las que cuentan en la cuota
   *     diaria (`MAX_PER_DAY`, `MAX_PENDING_BYTES`): sin borrarlas, borrar la publicación no
   *     le devolvería la cuota al usuario.
   *
   * Los hijos (comentarios, me gusta, guardados, pedidos, menciones, debates) caen solos por
   * `ON DELETE CASCADE`, así que no hay que recorrerlos uno a uno. Los episodios de una serie
   * también caen… por eso sus vídeos se leen ANTES de borrar: después ya no habría forma de
   * saber qué archivos eran.
   */
  async deletePost(userId: string, postId: string, actorRole = 'PASSENGER') {
    // El id se valida ANTES de tocar la base: si no es un uuid, Postgres contesta `22P02`
    // y eso sale como 500. Un id mal formado lo mandó quien llama, así que es 400. Mismo
    // patrón que `chatSend` con `postId`.
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(postId ?? '').trim())) {
      throw new DomainError('POST_ID_INVALID', 'Publicación no válida');
    }
    const rows: any[] = await this.db.$queryRaw`
      SELECT id, author_id, type, payload FROM lifebook.posts WHERE id=${postId}::uuid`;
    const post = rows[0];
    if (!post) throw new DomainError('POST_NOT_FOUND', 'Esa publicación no existe o ya no está');
    if (post.author_id !== userId && actorRole !== 'ADMIN') {
      throw new DomainError('POST_FORBIDDEN', 'Esta publicación no es tuya');
    }

    // 1) Todas las urls que menciona el payload (y las de los episodios, si es una serie).
    const urls = new Set<string>();
    recolectarUrls(post.payload, urls);
    // `series_episodes` NO tiene jsonb `payload`: guarda las url en columnas propias
    // (`video_url`, `cover_url`). Pedir `payload` aquí reventaba con 42703 y dejaba el
    // borrado entero en 500 sin borrar ni un archivo.
    const eps: any[] = await this.db.$queryRaw`
      SELECT id, video_url, cover_url FROM lifebook.series_episodes WHERE serie_id=${postId}::uuid`;
    for (const e of eps) {
      for (const u of [e.video_url, e.cover_url]) {
        if (typeof u === 'string' && /^https?:\/\//i.test(u)) urls.add(u);
      }
    }

    let archivosBorrados = 0;
    let bytesLiberados = 0;
    const compartidos: string[] = [];

    for (const url of urls) {
      const par = this.claveDeAlmacen(url);
      if (!par) continue; // url de fuera (otro proveedor): no es nuestra, no se toca

      // 2) ¿La usa otra publicación o el episodio de otra serie? Los comodines de LIKE se
      //    escapan: una clave con `_` haría de comodín y podría dar un falso «compartido».
      const patron = `%${par.key.replace(/([\\%_])/g, '\\$1')}%`;
      const otros: any[] = await this.db.$queryRaw`
        SELECT 1 AS x FROM lifebook.posts
          WHERE id <> ${postId}::uuid AND payload::text LIKE ${patron}
        UNION ALL
        SELECT 1 AS x FROM lifebook.series_episodes
          WHERE serie_id <> ${postId}::uuid
            AND (video_url LIKE ${patron} OR cover_url LIKE ${patron})
        LIMIT 1`;
      if (otros.length) { compartidos.push(par.key); continue; }

      try {
        const st = await this.minioClient().statObject(par.bucket, par.key);
        bytesLiberados += Number(st.size ?? 0);
      } catch { /* ya no está en el almacén: se sigue, hay que borrar la fila igual */ }
      try {
        await this.minioClient().removeObject(par.bucket, par.key);
        archivosBorrados++;
      } catch (e) {
        // No se aborta por un archivo: la publicación se borra igual, y si el objeto se
        // queda, `purge-orphans` lo encuentra (la fila de la subida ya no existirá y el
        // objeto estará fuera de toda publicación). Se deja dicho en el log.
        Logger.warn(`deletePost: no se pudo borrar ${par.bucket}/${par.key}: ${(e as Error).message}`, 'Lifebook');
      }
      // 2-bis) El PÓSTER. Lo genera el servidor al cerrar la subida y vive en la fila de la
      // subida (`poster_key`), NO en el payload de la publicación: recorriendo el payload no
      // se encuentra nunca, así que sin borrarlo aquí se queda en el almacén para siempre
      // (ninguna publicación lo menciona y nada más lo alcanza).
      // No se comprueba si está compartido porque no puede estarlo: su clave deriva de la
      // del vídeo (`<clave>.poster.jpg`), y si el vídeo estuviera compartido el bucle ya
      // habría salido en el `continue` de arriba.
      const fila: any[] = await this.db.$queryRaw`
        SELECT poster_key FROM lifebook.media_uploads WHERE object_key = ${par.key} LIMIT 1`;
      const posterKey = fila[0]?.poster_key ? String(fila[0].poster_key) : null;
      if (posterKey) {
        try {
          const st = await this.minioClient().statObject(par.bucket, posterKey);
          bytesLiberados += Number(st.size ?? 0);
        } catch { /* ya no está */ }
        try {
          await this.minioClient().removeObject(par.bucket, posterKey);
          archivosBorrados++;
        } catch (e) {
          Logger.warn(`deletePost: no se pudo borrar el póster ${par.bucket}/${posterKey}: ${(e as Error).message}`, 'Lifebook');
        }
      }

      // 3) La cuota: la fila de la subida se va con el archivo.
      await this.db.$executeRaw`DELETE FROM lifebook.media_uploads WHERE object_key=${par.key}`;
    }

    await this.db.$executeRaw`DELETE FROM lifebook.posts WHERE id=${postId}::uuid`;
    Logger.log(
      `deletePost ${postId} (${post.type}) por ${userId}${actorRole === 'ADMIN' ? ' [ADMIN]' : ''}: `
      + `${archivosBorrados} archivo(s), ${(bytesLiberados / 1048576).toFixed(1)} MB libres`
      + `${compartidos.length ? `, ${compartidos.length} compartido(s) y por tanto conservado(s)` : ''}`,
      'Lifebook',
    );

    return {
      ok: true,
      deleted: true,
      id: postId,
      type: post.type,
      archivosBorrados,
      bytesLiberados,
      /** Archivos que se han CONSERVADO porque otra publicación también los usa. */
      archivosCompartidos: compartidos.length,
    };
  }

  /**
   * De una url pública del almacén saca bucket y clave. `null` si la url no es nuestra.
   *
   * Las claves son `…/storage/<bucket>/<carpeta>/<fichero>`, y hay DOS esquemas conviviendo:
   * el viejo (`lb-videos`, `lb-images`, `lb-audio`) y el de la subida firmada
   * (`lifebook-media`). Por eso no se compara contra una lista de buckets: se toma el primer
   * segmento como bucket. La validación de la clave es lo que evita que una url construida a
   * mano (`…/storage/lifebook-media/../../otro-bucket/x`) saque al borrado de su carpeta.
   */
  private claveDeAlmacen(url: string): { bucket: string; key: string } | null {
    const base = String(process.env.MINIO_PUBLIC_BASE || 'https://hk.egrouteplan.com/storage').replace(/\/+$/, '');
    if (!url.startsWith(`${base}/`)) return null;
    const resto = url.slice(base.length + 1);
    const corte = resto.indexOf('/');
    if (corte <= 0) return null;
    const bucket = resto.slice(0, corte);
    const key = resto.slice(corte + 1);
    if (!key || key.includes('..') || !/^[A-Za-z0-9._/-]+$/.test(key)) return null;
    if (!/^[A-Za-z0-9._-]+$/.test(bucket)) return null;
    return { bucket, key };
  }

  // =========================================================================
  // PARTE 5 — CHAT 1:1 · PEDIDOS · TIENDA · MODERACIÓN
  // =========================================================================

  // ---------------- CHAT ----------------
  private otherOf(conv: any, me: string): string {
    return String(conv.user_a === me ? conv.user_b : conv.user_a);
  }

  /** Mis conversaciones: 1:1 + GRUPOS (Parte 17), con fijados arriba. */
  async chatConversations(userId: string) {
    const direct: any[] = await this.db.$queryRaw`
      SELECT c.id, c.user_a, c.user_b, c.last_message, c.last_message_at,
             c.unread_a, c.unread_b, c.created_at, c.pinned_a, c.pinned_b, c.muted_a, c.muted_b,
             c.bg_a, c.bg_b,
             u.id AS other_id, u.full_name AS other_name, u.avatar_url AS other_avatar
      FROM lifebook.conversations c
      JOIN mobility.users u ON u.id = CASE WHEN c.user_a = ${userId}::uuid THEN c.user_b ELSE c.user_a END
      WHERE (c.user_a = ${userId}::uuid OR c.user_b = ${userId}::uuid) AND c.kind = 'direct'
      ORDER BY c.last_message_at DESC NULLS LAST
      LIMIT 100`;
    const groups: any[] = await this.db.$queryRaw`
      SELECT c.id, c.title, c.photo_id, c.owner_id, c.kind, c.allowed_kinds,
             c.last_message, c.last_message_at, c.created_at,
             gm.role AS my_role,
             gm.pinned, gm.muted, gm.last_read_at, gm.bg, gm.cleared_at,
             u.full_name AS owner_name, u.avatar_url AS owner_avatar,
             (SELECT count(*)::int FROM lifebook.group_members x WHERE x.conversation_id = c.id) AS members,
             (SELECT count(*)::int FROM lifebook.messages m
               WHERE m.conversation_id = c.id AND m.state='active'
                 AND (gm.last_read_at IS NULL OR m.created_at > gm.last_read_at)
                 AND (gm.cleared_at IS NULL OR m.created_at > gm.cleared_at)
                 AND m.sender_id <> ${userId}::uuid) AS unread
      FROM lifebook.conversations c
      JOIN lifebook.group_members gm ON gm.conversation_id = c.id AND gm.user_id = ${userId}::uuid
      LEFT JOIN mobility.users u ON u.id = c.owner_id
      WHERE c.kind = 'group'
      ORDER BY gm.pinned DESC, c.last_message_at DESC NULLS LAST
      LIMIT 100`;
    const directOut = direct.map((r) => {
      const meIsA = r.user_a === userId;
      return {
        id: r.id,
        kind: 'direct' as const,
        other: { id: r.other_id, fullName: r.other_name, avatarUrl: r.other_avatar },
        lastMessage: r.last_message ?? null,
        lastMessageAt: r.last_message_at ? String(r.last_message_at) : null,
        unread: Number(meIsA ? r.unread_a : r.unread_b),
        pinned: !!r[meIsA ? 'pinned_a' : 'pinned_b'],
        muted: !!r[meIsA ? 'muted_a' : 'muted_b'],
        background: (meIsA ? r.bg_a : r.bg_b) ?? null,
        createdAt: String(r.created_at),
      };
    });
    const groupOut = groups.map((r) => ({
      id: r.id,
      kind: 'group' as const,
      other: { id: r.owner_id, fullName: r.owner_name, avatarUrl: r.owner_avatar },
      title: r.title ?? 'Grupo',
      photoUrl: r.photo_id ? `${USER_PHOTO_BASE}/${r.photo_id}` : null,
      members: Number(r.members ?? 0),
      allowedKinds: Array.isArray(r.allowed_kinds) ? r.allowed_kinds : null,
      // Mi papel en el grupo: el perfil lo usa para saber si puedo sacar el código
      // de invitación (dueño o administrador) sin tener que preguntar grupo por grupo.
      myRole: r.my_role ?? (r.owner_id === userId ? 'owner' : 'member'),
      lastMessage: r.last_message ?? null,
      lastMessageAt: r.last_message_at ? String(r.last_message_at) : null,
      unread: Number(r.unread ?? 0),
      pinned: !!r.pinned,
      muted: !!r.muted,
      background: r.bg ?? null,
      createdAt: String(r.created_at),
    }));
    // Fijados primero; luego por fecha.
    return [...directOut, ...groupOut].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return String(b.lastMessageAt ?? '').localeCompare(String(a.lastMessageAt ?? ''));
    });
  }

  /** Abre (o crea) la conversación 1:1 con otro usuario. */
  async chatOpen(userId: string, otherId: string) {
    if (userId === otherId) throw new DomainError('CANNOT_CHAT_SELF', 'No puedes escribirte a ti mismo');
    const u: any[] = await this.db.$queryRaw`SELECT 1 FROM mobility.users WHERE id=${otherId}::uuid`;
    if (!u[0]) throw new DomainError('USER_NOT_FOUND', 'Usuario no encontrado');
    await this.assertNotBlocked(userId, otherId, 'No puedes escribir a este usuario');
    await this.db.$queryRaw`
      INSERT INTO lifebook.conversations (user_a, user_b)
      VALUES (LEAST(${userId}::uuid, ${otherId}::uuid), GREATEST(${userId}::uuid, ${otherId}::uuid))
      ON CONFLICT DO NOTHING`;
    const rows: any[] = await this.db.$queryRaw`
      SELECT c.*, u.full_name, u.avatar_url
      FROM lifebook.conversations c
      JOIN mobility.users u ON u.id = ${otherId}::uuid
      WHERE (c.user_a = ${userId}::uuid AND c.user_b = ${otherId}::uuid)
         OR (c.user_a = ${otherId}::uuid AND c.user_b = ${userId}::uuid)
      LIMIT 1`;
    const c = rows[0];
    if (!c) throw new DomainError('CONV_NOT_FOUND', 'No se pudo crear la conversación');
    return {
      id: c.id,
      other: { id: otherId, fullName: c.full_name, avatarUrl: c.avatar_url },
      unread: 0,
    };
  }

  /**
   * Comprueba que participo en la conversación (1:1 o GRUPO, Parte 17).
   * En grupos la pertenencia vive en `group_members`.
   */
  private async assertConvMember(userId: string, convId: string) {
    const rows: any[] = await this.db.$queryRaw`
      SELECT c.*, u.full_name, u.avatar_url FROM lifebook.conversations c
      LEFT JOIN mobility.users u ON u.id = CASE WHEN c.user_a = ${userId}::uuid THEN c.user_b ELSE c.user_a END
      WHERE c.id = ${convId}::uuid AND (c.user_a = ${userId}::uuid OR c.user_b = ${userId}::uuid)
      LIMIT 1`;
    if (rows[0]) {
      await this.assertNotBlocked(userId, rows[0].user_a === userId ? rows[0].user_b : rows[0].user_a, 'No puedes escribir a este usuario');
      return rows[0];
    }
    const g: any[] = await this.db.$queryRaw`
      SELECT c.*, gm.cleared_at AS gm_cleared_at, gm.bg AS gm_bg,
             gm.muted AS gm_muted, gm.pinned AS gm_pinned, gm.role AS gm_role,
             u.full_name, u.avatar_url FROM lifebook.conversations c
      JOIN lifebook.group_members gm ON gm.conversation_id = c.id AND gm.user_id = ${userId}::uuid
      LEFT JOIN mobility.users u ON u.id = c.owner_id
      WHERE c.id = ${convId}::uuid AND c.kind = 'group'
      LIMIT 1`;
    if (!g[0]) {
      // Distinguimos «no existe» (grupo disuelto) de «no participas».
      const existe: any[] = await this.db.$queryRaw`
        SELECT kind FROM lifebook.conversations WHERE id = ${convId}::uuid LIMIT 1`;
      if (!existe[0]) throw new DomainError('GROUP_NOT_FOUND', 'Este grupo ya no existe');
      throw new DomainError('CHAT_NOT_PARTICIPANT', 'No participas en esta conversación');
    }
    return g[0];
  }

  /** Rol en el grupo (`owner` · `admin` · `member`) o null si no soy miembro. */
  private async groupRole(userId: string, convId: string): Promise<string | null> {
    const rows: any[] = await this.db.$queryRaw`
      SELECT role FROM lifebook.group_members
      WHERE conversation_id=${convId}::uuid AND user_id=${userId}::uuid LIMIT 1`;
    return rows[0]?.role ? String(rows[0].role) : null;
  }

  /** Mensajes de una conversación (página ASC; cursor = created_at más antiguo). */
  async chatMessages(userId: string, convId: string, opts: { before?: string; limit?: number } = {}) {
    const conv = await this.assertConvMember(userId, convId);
    const limit = Math.min(Math.max(Number(opts.limit ?? 30) || 30, 1), 100);
    const args: unknown[] = [convId];
    let conds = `m.conversation_id=$1::uuid AND m.state='active'`;
    // Parte 17/18: si borré el historial, solo veo lo posterior (1:1 y grupos).
    const cleared = conv.kind === 'group'
      ? conv.gm_cleared_at
      : (conv.user_a === userId ? conv.cleared_a : conv.cleared_b);
    if (cleared) { args.push(cleared); conds += ` AND m.created_at > $${args.length}::timestamptz`; }
    // Parte 22: si el grupo no comparte historial, un miembro solo ve lo que
    // llegó desde que entró (el dueño y los admins lo ven todo).
    if (conv.kind === 'group' && conv.show_history === false
        && conv.gm_role !== 'owner' && conv.gm_role !== 'admin') {
      const joined: any[] = await this.db.$queryRaw`
        SELECT joined_at FROM lifebook.group_members
         WHERE conversation_id=${convId}::uuid AND user_id=${userId}::uuid LIMIT 1`;
      const since = joined[0]?.joined_at;
      if (since) { args.push(since); conds += ` AND m.created_at >= $${args.length}::timestamptz`; }
    }
    if (opts.before) { args.push(opts.before); conds += ` AND m.created_at < $${args.length}::timestamptz`; }
    args.push(limit);
    const rows: any[] = await this.db.$queryRawUnsafe(`
      SELECT m.id, m.conversation_id, m.sender_id, m.body, m.read_at, m.created_at, m.kind, m.payload,
             u.full_name, u.avatar_url,
             p.title AS post_title, p.type AS post_type, p.payload->>'priceXaf' AS post_price,
             p.media_ids AS post_media,
             pr.title AS prod_title, pr.price_xaf AS prod_price, pr.media AS prod_media,
             pr.shop_id AS prod_shop, pr.status AS prod_status,
             o.order_no AS ord_no, o.status AS ord_status, o.total_xaf AS ord_total,
             o.delivery_mode AS ord_delivery, o.delivered_at AS ord_delivered
      FROM lifebook.messages m
      JOIN mobility.users u ON u.id = m.sender_id
      LEFT JOIN lifebook.posts p ON m.kind IN ('post','sale') AND p.id = (m.payload->>'postId')::uuid
      LEFT JOIN lifebook.products pr ON m.kind = 'product' AND pr.id = (m.payload->>'productId')::uuid
      LEFT JOIN lifebook.orders o ON m.kind = 'order'
        AND o.id = CASE WHEN (m.payload->>'orderId') ~ '^[0-9a-f-]{36}$'
                        THEN (m.payload->>'orderId')::uuid ELSE NULL END
      WHERE ${conds}
      ORDER BY m.created_at DESC
      LIMIT $${args.length}`, ...args);
    const hasMore = rows.length === limit;
    const page = rows.slice(0, limit).reverse(); // ASC para la UI
    // Parte 24/25: votos y apuntados de la página, en una consulta cada uno.
    const votes = await this.voteStats(page, userId);
    const joins = await this.joinStats(page, userId);
    return {
      messages: page.map((m) => this.serializeMessage(m, userId, votes, joins)),
      // El cursor apunta al mensaje MÁS ANTIGUO de la página (fetch older).
      nextCursor: hasMore ? page[0]?.created_at : null,
    };
  }

  /**
   * Parte 26 (G2-c): anuncios que YO he publicado hoy (día de Malabo, UTC+1).
   * Es la base del límite de 15 al día por persona.
   */
  private async adsSentToday(userId: string): Promise<number> {
    const rows: any[] = await this.db.$queryRaw`
      SELECT count(*)::int AS n FROM lifebook.messages
       WHERE sender_id = ${userId}::uuid AND kind = 'ad' AND state = 'active'
         AND created_at >= date_trunc('day', now() AT TIME ZONE 'Africa/Malabo') AT TIME ZONE 'Africa/Malabo'`;
    return Number(rows[0]?.n ?? 0);
  }

  /** Parte 26: cuántos anuncios me quedan hoy (para avisarlo en la hoja). */
  async adsLeftToday(userId: string) {
    const used = await this.adsSentToday(userId);
    return { limit: AD_DAILY_LIMIT, used, left: Math.max(0, AD_DAILY_LIMIT - used) };
  }

  /**
   * Parte 25 (G2-b): apuntados de las cadenas y quedadas de una página.
   * Devuelve `Map<messageId, { count, joinedByMe, members }>` con una sola
   * consulta (más la de los nombres), sin N+1.
   */
  private async joinStats(rows: any[], viewerId: string) {
    const out = new Map<string, { count: number; joinedByMe: boolean; members: { id: string; name: string; avatarUrl: string | null }[] }>();
    const ids = rows.filter((m) => (JOIN_KINDS as readonly string[]).includes(String(m?.kind))).map((m) => String(m.id));
    if (ids.length === 0) return out;
    const ph = ids.map((_, i) => `$${i + 1}::uuid`).join(', ');
    const counts: any[] = await this.db.$queryRawUnsafe(
      `SELECT message_id, count(*)::int AS n FROM lifebook.message_joins
        WHERE message_id IN (${ph})
        GROUP BY message_id`, ...ids);
    const people: any[] = await this.db.$queryRawUnsafe(
      `SELECT j.message_id, j.user_id, u.full_name, u.avatar_url, j.created_at,
              (j.user_id = $${ids.length + 1}::uuid) AS mine
         FROM lifebook.message_joins j
         JOIN mobility.users u ON u.id = j.user_id
        WHERE j.message_id IN (${ph})
        ORDER BY j.created_at ASC`, ...ids, viewerId);
    for (const c of counts) {
      out.set(String(c.message_id), { count: Number(c.n ?? 0), joinedByMe: false, members: [] });
    }
    for (const p of people) {
      const key = String(p.message_id);
      const st = out.get(key) ?? { count: 0, joinedByMe: false, members: [] };
      if (p.mine === true) st.joinedByMe = true;
      if (st.members.length < JOIN_MEMBERS_MAX) {
        // El avatar va CRUDO (como en el resto del API): la app lo absolutiza
        // con `absUrl`. Antes se le añadía aquí el prefijo y salía duplicado.
        st.members.push({
          id: String(p.user_id),
          name: String(p.full_name ?? 'Usuario'),
          avatarUrl: p.avatar_url ? String(p.avatar_url) : null,
        });
      }
      out.set(key, st);
    }
    return out;
  }

  /**
   * Parte 24 (G2): recuentos de los mensajes de votación de una página.
   * Devuelve `Map<messageId, { counts, myVote, total }>` con una sola consulta
   * agrupada (y otra para MI voto), sin N+1.
   */
  private async voteStats(rows: any[], viewerId: string) {
    const out = new Map<string, { counts: number[]; myVote: number | null; total: number }>();
    const ids = rows.filter((m) => String(m?.kind) === 'vote').map((m) => String(m.id));
    if (ids.length === 0) return out;
    // Lista de parámetros explícita (sin arrays en el driver).
    const ph = ids.map((_, i) => `$${i + 1}::uuid`).join(', ');
    const counts: any[] = await this.db.$queryRawUnsafe(
      `SELECT message_id, option_idx, count(*)::int AS n
         FROM lifebook.message_votes
        WHERE message_id IN (${ph})
        GROUP BY message_id, option_idx`, ...ids);
    const mine: any[] = await this.db.$queryRawUnsafe(
      `SELECT message_id, option_idx FROM lifebook.message_votes
        WHERE message_id IN (${ph}) AND user_id = $${ids.length + 1}::uuid`, ...ids, viewerId);
    for (const c of counts) {
      const key = String(c.message_id);
      const idx = Number(c.option_idx);
      const st = out.get(key) ?? { counts: [], myVote: null, total: 0 };
      if (!Number.isInteger(idx) || idx < 0 || idx > 50) continue;
      while (st.counts.length <= idx) st.counts.push(0);
      st.counts[idx] = Number(c.n ?? 0);
      st.total += Number(c.n ?? 0);
      out.set(key, st);
    }
    for (const v of mine) {
      const key = String(v.message_id);
      const st = out.get(key) ?? { counts: [], myVote: null, total: 0 };
      st.myVote = Number(v.option_idx);
      out.set(key, st);
    }
    return out;
  }

  /**
   * Parte 15: serializa un mensaje con `kind`, `payload` y las referencias ya
   * resueltas. Parte 24: añade `locationRef` (lat/lng/label) y `voteRef`
   * (pregunta, opciones, recuentos y mi voto). Parte 25: añade `chainRef`
   * (cadena con apuntados) y `checkinRef` (quedada con hora y apuntados).
   * Los recuentos llegan ya calculados en `votes`/`joins` para no hacer una
   * consulta por mensaje.
   */
  private serializeMessage(
    m: any, viewerId: string,
    votes?: Map<string, { counts: number[]; myVote: number | null; total: number }>,
    joins?: Map<string, { count: number; joinedByMe: boolean; members: { id: string; name: string; avatarUrl: string | null }[] }>,
  ) {
    const payload = (m.payload ?? {}) as Record<string, unknown>;
    const kind = String(m.kind ?? 'text');
    const out: any = {
      id: m.id,
      conversationId: m.conversation_id,
      senderId: m.sender_id,
      mine: m.sender_id === viewerId,
      kind,
      body: m.body,
      readAt: m.read_at ? String(m.read_at) : null,
      createdAt: String(m.created_at),
      sender: { id: m.sender_id, fullName: m.full_name, avatarUrl: m.avatar_url },
    };
    if (kind === 'post' || kind === 'sale') {
      const mediaIds = Array.isArray(m.post_media) ? m.post_media : [];
      out.postRef = {
        id: String(payload.postId ?? ''),
        title: m.post_title ?? '',
        priceXaf: Number(m.post_price ?? 0) || undefined,
        coverUrl: mediaIds[0] ? `${USER_PHOTO_BASE}/${mediaIds[0]}` : undefined,
      };
    } else if (kind === 'product') {
      /**
       * TANDA D: tarjeta de PRODUCTO dentro del chat. Se devuelve lo que la tarjeta necesita
       * (foto, nombre, precio y tienda). Si el producto ya no está activo se avisa con
       * `available: false`: el mensaje sigue en el historial (borrarlo sería reescribir la
       * conversación) pero la app no ofrece comprarlo.
       */
      const media = Array.isArray(m.prod_media) ? m.prod_media : [];
      out.productRef = {
        id: String(payload.productId ?? ''),
        title: m.prod_title ?? '',
        priceXaf: m.prod_price === null || m.prod_price === undefined ? null : Number(m.prod_price),
        currency: 'XAF',
        coverUrl: media[0]?.url ? String(media[0].url) : null,
        shopId: m.prod_shop ? String(m.prod_shop) : null,
        available: m.prod_title !== null && m.prod_title !== undefined && String(m.prod_status) === 'active',
        /** Lo que el cliente ya había elegido en la ficha («Talla: M · Color: Negro»). */
        variantLabel: typeof payload.productVariant === 'string' ? payload.productVariant : null,
        /** `true` = es una consulta: la app pinta la línea gris que lo avisa. */
        asking: payload.productAsking === true,
      };
    } else if (kind === 'order') {
      /**
       * MERCADO (tanda E) — TARJETA DE PEDIDO.
       *
       * El ESTADO sale del JOIN con `lifebook.orders` (`ord_status`), NO del payload: así el mensaje
       * enseña el estado VIVO aunque se escribiera hace una semana (mismo criterio que el precio de
       * la tarjeta de producto, que se resuelve al leer). El artículo (título, variante, foto,
       * cantidad) sí es la foto del momento de la compra, que es la verdad histórica del pedido:
       * si el producto se borra, el pedido sigue contando qué se compró.
       */
      const items = Array.isArray(payload.items) ? (payload.items as any[]) : [];
      const vivo = m.ord_no !== null && m.ord_no !== undefined;
      out.orderRef = {
        id: String(payload.orderId ?? ''),
        code: vivo ? String(m.ord_no) : String(payload.code ?? ''),
        status: vivo ? String(m.ord_status ?? 'created') : String(payload.status ?? 'created'),
        totalXaf: Number(vivo ? m.ord_total : payload.totalXaf) || 0,
        deliveryMode: vivo && m.ord_delivery ? String(m.ord_delivery) : (payload.deliveryMode ? String(payload.deliveryMode) : null),
        createdAt: m.created_at ? String(m.created_at) : null,
        deliveredAt: vivo && m.ord_delivered ? String(m.ord_delivered) : null,
        buyerName: payload.buyerName ? String(payload.buyerName) : null,
        shopName: payload.shopName ? String(payload.shopName) : null,
        social: payload.social === true,
        /**
         * EL TICKET (lo que pidió el dueño): forma de pago y dónde/cómo se entrega, además del
         * nombre que ya venía. En las tarjetas de GRUPO (`social`) van en `null` a propósito: la
         * dirección y la nota del comprador no tienen por qué verlas un grupo.
         */
        paymentMethod: payload.social === true ? null : (payload.paymentMethod ? String(payload.paymentMethod) : null),
        /** Lo que quitó el cupón (0 si no hubo), solo en la tarjeta del chat con la tienda. */
        discountXaf: payload.social === true ? null : (Number(payload.discountXaf ?? 0) || 0),
        couponCode: payload.social === true ? null : (payload.couponCode ? String(payload.couponCode) : null),
        deliveryAddress: payload.social === true ? null : (payload.deliveryAddress ?? null),
        note: payload.social === true ? null : (payload.note ? String(payload.note) : null),
        items: items.slice(0, 20).map((i) => ({
          title: String(i?.title ?? ''),
          variant: i?.variant ? String(i.variant) : null,
          mediaUrl: i?.mediaUrl ? String(i.mediaUrl) : null,
          quantity: Number(i?.quantity ?? 1) || 1,
          lineTotalXaf: Number(i?.lineTotalXaf ?? 0) || 0,
        })),
      };
    } else if (kind === 'image') {
      out.imageUrl = typeof payload.url === 'string' ? payload.url : '';
    } else if (kind === 'file') {
      out.fileRef = {
        name: String(payload.name ?? 'archivo'),
        sizeLabel: humanSize(payload.size),
        ext: payload.ext ? String(payload.ext) : undefined,
        url: typeof payload.url === 'string' ? payload.url : '',
      };
    } else if (kind === 'location') {
      // Parte 24: punto compartido (con etiqueta legible del lugar).
      out.locationRef = {
        label: String(payload.label ?? ''),
        lat: Number.isFinite(Number(payload.lat)) ? Number(payload.lat) : null,
        lng: Number.isFinite(Number(payload.lng)) ? Number(payload.lng) : null,
      };
    } else if (kind === 'checkin') {
      // Parte 25: quedada = sitio + hora + apuntados (lleva también locationRef
      // para que el mapa y el taxi funcionen igual que con una ubicación).
      const j = joins?.get(String(m.id));
      out.locationRef = {
        label: String(payload.label ?? ''),
        lat: Number.isFinite(Number(payload.lat)) ? Number(payload.lat) : null,
        lng: Number.isFinite(Number(payload.lng)) ? Number(payload.lng) : null,
      };
      out.checkinRef = {
        at: payload.at ? String(payload.at) : null,
        when: payload.at ? malaboWhenLabel(new Date(String(payload.at))) : '',
        going: Number(j?.count ?? 0),
        goingByMe: !!j?.joinedByMe,
        members: j?.members ?? [],
      };
    } else if (kind === 'chain') {
      // Parte 25: cadena con apuntados (y tope opcional de plazas).
      const j = joins?.get(String(m.id));
      const slots = Number(payload.slots);
      out.chainRef = {
        title: String(payload.title ?? ''),
        note: payload.note ? String(payload.note) : null,
        slots: Number.isFinite(slots) && slots > 0 ? slots : null,
        joined: Number(j?.count ?? 0),
        joinedByMe: !!j?.joinedByMe,
        members: j?.members ?? [],
      };
    } else if (kind === 'vote') {
      // Parte 24: votación con recuentos reales y mi voto.
      const options = Array.isArray(payload.options) ? (payload.options as unknown[]).map((o) => String(o)) : [];
      const st = votes?.get(String(m.id));
      out.voteRef = {
        question: String(payload.question ?? ''),
        options,
        counts: options.map((_, i) => Number(st?.counts?.[i] ?? 0) || 0),
        myVote: st?.myVote ?? null,
        total: Number(st?.total ?? 0) || 0,
      };
    } else if (kind === 'ad') {
      // Parte 26 (G2-c): anuncio de grupo (texto, precio, foto y enlace opcional).
      out.adRef = {
        title: payload.title ? String(payload.title) : null,
        text: String(payload.text ?? ''),
        priceXaf: Number.isFinite(Number(payload.priceXaf)) && Number(payload.priceXaf) > 0
          ? Number(payload.priceXaf) : null,
        imageUrl: payload.imageUrl ? String(payload.imageUrl) : null,
        link: this.serviceLinkOut(payload.link),
      };
    }
    return out;
  }

  /**
   * Envía un mensaje (Parte 15). `kind`: text | image | post | sale | file |
   * location (Parte 24) | vote (Parte 24) | chain (Parte 25) | checkin (Parte 25).
   *  · post/sale → `postId` y el servidor resuelve el `postRef` (id, title, priceXaf).
   *  · image/file → `mediaUrl` ya subida con `/media/upload`.
   *  · location → `lat`, `lng` y `label` (el texto del mensaje es «📍 etiqueta»).
   *  · vote → `question` y `options` (2–6); los votos van a `lifebook.message_votes`.
   *  · chain → `title`, `note?` y `slots?`; los apuntados van a `lifebook.message_joins`.
   *  · checkin → `label`, `lat`, `lng` y `at` (fecha/hora); se apunta con el mismo `/join`.
   * `system` solo lo genera el servidor (avisos de pedidos y de grupo).
   */
  async chatSend(userId: string, convId: string, input: {
    body?: string; kind?: string; postId?: string; productId?: string;
    productVariant?: string; productAsking?: boolean;
    mediaUrl?: string; fileName?: string; fileSize?: number;
    lat?: number; lng?: number; label?: string; question?: string; options?: unknown;
    title?: string; note?: string; slots?: number; at?: string;
    priceXaf?: number; linkType?: string; linkId?: string;
  }) {
    const conv = await this.assertConvMember(userId, convId);
    const kind = String(input?.kind ?? 'text').trim() || 'text';
    if (!(CHAT_KINDS as readonly string[]).includes(kind)) {
      throw new DomainError('CHAT_KIND_INVALID', 'Tipo de mensaje no válido');
    }
    // Parte 17: en grupos el dueño/admin decide qué componentes se pueden enviar.
    const isGroup = conv.kind === 'group';
    if (isGroup) {
      const allowed = Array.isArray(conv.allowed_kinds) ? (conv.allowed_kinds as string[]) : null;
      if (allowed && allowed.length > 0 && !allowed.includes(kind)) {
        throw new DomainError('KIND_NOT_ALLOWED', 'El administrador del grupo no permite ese tipo de mensaje');
      }
      // Parte 22: si el dueño cerró el grupo, solo hablan dueño y admins.
      if (conv.members_can_speak === false) {
        const role = conv.gm_role ?? await this.groupRole(userId, convId);
        if (role !== 'owner' && role !== 'admin') {
          throw new DomainError('GROUP_MUTED', 'Solo el organizador y los administradores pueden escribir en este grupo');
        }
      }
    }
    let text = '';
    const payload: Record<string, unknown> = {};

    if (kind === 'text') {
      text = String(input.body ?? '').trim().slice(0, 1000);
      if (!text) throw new DomainError('MESSAGE_REQUIRED', 'Escribe un mensaje');
    } else if (kind === 'product') {
      /**
       * TANDA D — TARJETA DE PRODUCTO DENTRO DEL CHAT.
       *
       * Es lo que la especificación llama «mensaje de producto»: no un enlace (que te saca del
       * contexto) sino una tarjeta con imagen, nombre, precio y botón de compra. Se guarda solo
       * el id en el payload; el resto de los datos los resuelve el JOIN al leer los mensajes, así
       * que si el comerciante cambia el precio, la tarjeta enseña el precio de HOY y no el de
       * cuando se envió (que es lo honesto: el mensaje no es un contrato).
       */
      const productId = String(input.productId ?? '').trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId)) {
        throw new DomainError('PRODUCT_ID_INVALID', 'Producto no válido');
      }
      const pr: any[] = await this.db.$queryRaw`
        SELECT id, title, status FROM lifebook.products WHERE id = ${productId}::uuid LIMIT 1`;
      if (!pr[0]) throw new DomainError('PRODUCT_NOT_FOUND', 'Ese producto no existe');
      if (pr[0].status !== 'active') throw new DomainError('PRODUCT_NOT_ACTIVE', 'Ese producto ya no está a la venta');
      payload.productId = productId;
      // GUÍA DEL DUEÑO: la tarjeta lleva la variante ya elegida por el cliente y la marca de
      // «está consultando», para que el comerciante sepa qué le preguntan SIN que el cliente
      // tenga que escribir nada (antes se mandaba un borrador de texto pidiendo describirlo).
      const variante = this.cleanText(input.productVariant, 80);
      if (variante) payload.productVariant = variante;
      if (input.productAsking === true) payload.productAsking = true;
      text = input.productAsking === true
        ? `🛍 Consulta sobre ${String(pr[0].title ?? 'un producto')}`
        : `🛍 ${String(pr[0].title ?? 'Producto')}`;
    } else if (kind === 'post' || kind === 'sale') {
      const postId = String(input.postId ?? '').trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(postId)) {
        throw new DomainError('POST_ID_INVALID', 'Publicación no válida');
      }
      const p: any[] = await this.db.$queryRaw`
        SELECT p.id, p.type, p.title, p.body, p.state, p.visibility, p.author_id, p.payload
        FROM lifebook.posts p WHERE p.id=${postId}::uuid`;
      if (!p[0] || p[0].state !== 'active') throw new DomainError('POST_NOT_FOUND', 'Publicación no encontrada');
      if (p[0].visibility === 'private' && p[0].author_id !== userId) {
        throw new DomainError('POST_HIDDEN', 'Esa publicación es privada');
      }
      payload.postId = postId;
      const title = String(p[0].title ?? p[0].body ?? '').slice(0, 80) || 'Publicación';
      const price = Number(p[0].payload?.priceXaf ?? 0) || 0;
      text = kind === 'sale'
        ? `🏷️ ${title}${price ? ` · ${price.toLocaleString('es-GQ')} XAF` : ''}`
        : `📄 ${title}`;
    } else if (kind === 'image') {
      const url = String(input.mediaUrl ?? '').trim();
      if (!this.isHttpUrl(url)) throw new DomainError('MEDIA_REQUIRED', 'Sube primero la foto');
      payload.url = url;
      text = '📷 Foto';
    } else if (kind === 'file') {
      const url = String(input.mediaUrl ?? '').trim();
      if (!this.isHttpUrl(url)) throw new DomainError('MEDIA_REQUIRED', 'Sube primero el archivo');
      const name = String(input.fileName ?? 'archivo').replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 120) || 'archivo';
      const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase().slice(0, 6) : undefined;
      payload.url = url;
      payload.name = name;
      payload.size = Math.max(0, Math.round(Number(input.fileSize ?? 0) || 0));
      payload.ext = ext;
      text = `📎 ${name}`;
    } else if (kind === 'location') {
      // Parte 24 (G2): punto compartido. La etiqueta es lo que se ve en el hilo
      // y en la lista de chats; las coordenadas abren el mapa con el pin.
      const label = this.cleanText(input.label, LOCATION_LABEL_MAX);
      const lat = Number(input.lat);
      const lng = Number(input.lng);
      if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)
          || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new DomainError('LOCATION_REQUIRED', 'Elige un punto con su nombre para compartirlo');
      }
      payload.lat = Number(lat.toFixed(6));
      payload.lng = Number(lng.toFixed(6));
      payload.label = label;
      text = `📍 ${label}`;
    } else if (kind === 'vote') {
      // Parte 24 (G2): votación de 2 a 6 opciones (los votos van aparte).
      const question = this.cleanText(input.question, VOTE_QUESTION_MAX);
      if (!question) throw new DomainError('VOTE_QUESTION_REQUIRED', 'Escribe la pregunta de la votación');
      const raw = Array.isArray(input.options) ? input.options : [];
      const options = raw
        .map((o) => this.cleanText(o, VOTE_OPTION_CHARS))
        .filter((o) => !!o)
        .slice(0, VOTE_OPTIONS_MAX);
      if (options.length < VOTE_OPTIONS_MIN) {
        throw new DomainError('VOTE_OPTIONS_INVALID', `La votación necesita entre ${VOTE_OPTIONS_MIN} y ${VOTE_OPTIONS_MAX} opciones`);
      }
      payload.question = question;
      payload.options = options;
      text = `🗳️ ${question}`;
    } else if (kind === 'chain') {
      // Parte 25 (G2-b): CADENA — una lista a la que la gente se apunta (relevo,
      // compra conjunta, turnos…). `slots` es opcional: sin él no hay tope.
      const title = this.cleanText(input.title, CHAIN_TITLE_MAX);
      if (!title) throw new DomainError('CHAIN_TITLE_REQUIRED', 'Ponle un título a la cadena');
      const note = this.cleanText(input.note, CHAIN_NOTE_MAX);
      const slotsNum = Number(input.slots);
      const slots = Number.isFinite(slotsNum) && slotsNum >= CHAIN_SLOTS_MIN
        ? Math.min(Math.round(slotsNum), CHAIN_SLOTS_MAX)
        : null;
      payload.title = title;
      if (note) payload.note = note;
      if (slots) payload.slots = slots;
      text = `🔗 ${title}`;
    } else if (kind === 'checkin') {
      // Parte 25 (G2-b): QUEDADA — un sitio y una hora a la que la gente se
      // apunta. Se valida igual que la ubicación y además la fecha.
      const label = this.cleanText(input.label, LOCATION_LABEL_MAX);
      const lat = Number(input.lat);
      const lng = Number(input.lng);
      if (!label || !Number.isFinite(lat) || !Number.isFinite(lng)
          || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        throw new DomainError('CHECKIN_REQUIRED', 'Elige el lugar de la quedada para compartirla');
      }
      const when = input.at ? new Date(String(input.at)) : null;
      if (!when || Number.isNaN(when.getTime())) {
        throw new DomainError('CHECKIN_REQUIRED', 'Elige la fecha y la hora de la quedada');
      }
      payload.lat = Number(lat.toFixed(6));
      payload.lng = Number(lng.toFixed(6));
      payload.label = label;
      payload.at = when.toISOString();
      text = `📅 Quedada · ${label} · ${malaboWhenLabel(when)}`;
    } else if (kind === 'ad') {
      // Parte 26 (G2-c): ANUNCIO del grupo. Solo en grupos (en un 1 a 1 no tiene
      // sentido y no lo ofrece la app) y con el límite del dueño: 15 al día.
      if (!isGroup) throw new DomainError('AD_ONLY_IN_GROUPS', 'Los anuncios son de grupo');
      const used = await this.adsSentToday(userId);
      if (used >= AD_DAILY_LIMIT) {
        throw new DomainError('AD_LIMIT_REACHED', `Ya has publicado tus ${AD_DAILY_LIMIT} anuncios de hoy`);
      }
      const title = this.cleanText(input.title, AD_TITLE_MAX);
      const body = this.cleanText(input.body, AD_TEXT_MAX);
      if (!title && !body) throw new DomainError('AD_TEXT_REQUIRED', 'Escribe el anuncio');
      const price = Number(input.priceXaf);
      if (Number.isFinite(price) && price > 0) {
        payload.priceXaf = Math.min(Math.round(price), 100_000_000);
      }
      const imageUrl = String(input.mediaUrl ?? '').trim();
      if (imageUrl) {
        if (!this.isHttpUrl(imageUrl)) throw new DomainError('MEDIA_REQUIRED', 'Sube primero la foto del anuncio');
        payload.imageUrl = imageUrl;
      }
      // Enlace opcional a un servicio (se valida por rol, como en las notas).
      const link = await this.resolveLink(userId, input.linkType, input.linkId);
      if (link) {
        // `lifebook` es un PERFIL: si no llega id, se enlaza el de quien anuncia
        // (así el botón siempre abre algo y no una pantalla vacía).
        if (link.type === 'lifebook' && !link.id) link.id = userId;
        payload.link = link;
      }
      if (title) payload.title = title;
      payload.text = body || title;
      text = `📣 ${title || body}`.slice(0, 300);
    }

    const preview = text.slice(0, 300);
    const row: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.messages (conversation_id, sender_id, body, kind, payload)
      VALUES (${convId}::uuid, ${userId}::uuid, ${preview}, ${kind}, ${JSON.stringify(payload)}::jsonb)
      RETURNING id, created_at, body, kind, payload`;
    const meIsA = conv.user_a === userId;
    if (isGroup) {
      // En grupos el no leído se calcula con `last_read_at` de cada miembro.
      await this.db.$queryRaw`
        UPDATE lifebook.conversations
        SET last_message=${preview}, last_message_at=now()
        WHERE id=${convId}::uuid`;
      await this.db.$queryRaw`
        UPDATE lifebook.group_members SET last_read_at = now()
        WHERE conversation_id=${convId}::uuid AND user_id=${userId}::uuid`;
    } else {
      await this.db.$queryRaw`
        UPDATE lifebook.conversations
        SET last_message=${preview}, last_message_at=now(),
            unread_a = unread_a + CASE WHEN ${!meIsA} THEN 1 ELSE 0 END,
            unread_b = unread_b + CASE WHEN ${meIsA} THEN 1 ELSE 0 END
        WHERE id=${convId}::uuid`;
    }
    const r = row[0];
    // Parte 25: quien crea la QUEDADA ya cuenta como que va (es el organizador);
    // así el mensaje no sale con «0 personas van» recién creado.
    if (kind === 'checkin' && r?.id) {
      await this.db.$queryRaw`
        INSERT INTO lifebook.message_joins (message_id, user_id)
        VALUES (${String(r.id)}::uuid, ${userId}::uuid)
        ON CONFLICT (message_id, user_id) DO NOTHING`;
    }
    // Parte 26: al publicar un anuncio se dice cuántos quedan hoy.
    const adLeft = kind === 'ad' ? await this.adsLeftToday(userId) : null;
    return {
      id: r?.id, conversationId: convId, kind, body: r?.body,
      createdAt: r?.created_at ? String(r.created_at) : new Date().toISOString(), ok: true,
      ...(adLeft ? { adsLeftToday: adLeft.left, adsLimitToday: adLeft.limit } : {}),
    };
  }

  /**
   * Parte 25 (G2-b): me apunto (o me doy de baja) en una CADENA o una QUEDADA.
   *
   * Un apunte por persona y mensaje (PK `message_id + user_id`). Si la cadena
   * tiene tope de plazas y ya está llena → `CHAIN_FULL` (400). Devuelve el
   * recuento y la lista de apuntados para repintar la burbuja sin recargar.
   * Códigos: `MESSAGE_NOT_JOINABLE` (400) · `MESSAGE_NOT_FOUND` (404) ·
   * `CHAT_NOT_PARTICIPANT` (403).
   */
  async chatJoin(userId: string, messageId: string, joined?: unknown) {
    const id = String(messageId ?? '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new DomainError('MESSAGE_NOT_FOUND', 'Mensaje no encontrado');
    }
    const rows: any[] = await this.db.$queryRaw`
      SELECT id, conversation_id, kind, payload, state FROM lifebook.messages
       WHERE id = ${id}::uuid LIMIT 1`;
    const msg = rows[0];
    if (!msg || String(msg.state) !== 'active') {
      throw new DomainError('MESSAGE_NOT_FOUND', 'Mensaje no encontrado');
    }
    if (!(JOIN_KINDS as readonly string[]).includes(String(msg.kind))) {
      throw new DomainError('MESSAGE_NOT_JOINABLE', 'A ese mensaje no se puede uno apuntar');
    }
    await this.assertConvMember(userId, String(msg.conversation_id));
    const want = joined === undefined ? true : !!joined;
    if (want) {
      const slots = Number(msg.payload?.slots);
      if (Number.isFinite(slots) && slots > 0) {
        const c: any[] = await this.db.$queryRaw`
          SELECT count(*)::int AS n FROM lifebook.message_joins WHERE message_id=${id}::uuid`;
        const current = Number(c[0]?.n ?? 0);
        const mine: any[] = await this.db.$queryRaw`
          SELECT 1 AS x FROM lifebook.message_joins
           WHERE message_id=${id}::uuid AND user_id=${userId}::uuid LIMIT 1`;
        if (current >= slots && mine.length === 0) {
          throw new DomainError('CHAIN_FULL', 'La cadena ya está completa');
        }
      }
      await this.db.$queryRaw`
        INSERT INTO lifebook.message_joins (message_id, user_id)
        VALUES (${id}::uuid, ${userId}::uuid)
        ON CONFLICT (message_id, user_id) DO NOTHING`;
    } else {
      await this.db.$queryRaw`
        DELETE FROM lifebook.message_joins
         WHERE message_id=${id}::uuid AND user_id=${userId}::uuid`;
    }
    const stats = await this.joinStats([{ id, kind: String(msg.kind) }], userId);
    const st = stats.get(id) ?? { count: 0, joinedByMe: false, members: [] };
    return {
      ok: true,
      messageId: id,
      kind: String(msg.kind),
      joined: st.joinedByMe,
      count: st.count,
      slots: Number.isFinite(Number(msg.payload?.slots)) && Number(msg.payload?.slots) > 0
        ? Number(msg.payload.slots) : null,
      members: st.members,
    };
  }

  /**
   * Parte 24 (G2): vota en un mensaje de votación.
   *
   * Un voto por persona y mensaje (PK `message_id + user_id`): volver a votar
   * CAMBIA el voto (UPSERT), no lo suma. Devuelve los recuentos actualizados
   * para que la burbuja se pinte sin recargar el hilo.
   * Códigos: `VOTE_OPTION_INVALID` (400) · `MESSAGE_NOT_FOUND` (404) ·
   * `CHAT_NOT_PARTICIPANT` (403).
   */
  async chatVote(userId: string, messageId: string, optionIdx: unknown) {
    const id = String(messageId ?? '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new DomainError('MESSAGE_NOT_FOUND', 'Mensaje no encontrado');
    }
    const rows: any[] = await this.db.$queryRaw`
      SELECT id, conversation_id, kind, payload, state FROM lifebook.messages
       WHERE id = ${id}::uuid LIMIT 1`;
    const msg = rows[0];
    if (!msg || String(msg.state) !== 'active' || String(msg.kind) !== 'vote') {
      throw new DomainError('MESSAGE_NOT_FOUND', 'Ese mensaje no es una votación activa');
    }
    // 403 si no participo (y 403 USER_BLOCKED si hay bloqueo entre las partes).
    await this.assertConvMember(userId, String(msg.conversation_id));
    const options = Array.isArray(msg.payload?.options) ? (msg.payload.options as unknown[]).map((o) => String(o)) : [];
    const idx = Number(optionIdx);
    if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) {
      throw new DomainError('VOTE_OPTION_INVALID', 'Esa opción de la votación no existe');
    }
    await this.db.$queryRaw`
      INSERT INTO lifebook.message_votes (message_id, user_id, option_idx)
      VALUES (${id}::uuid, ${userId}::uuid, ${idx})
      ON CONFLICT (message_id, user_id)
      DO UPDATE SET option_idx = EXCLUDED.option_idx, created_at = now()`;
    const stats = await this.voteStats([{ id, kind: 'vote' }], userId);
    const st = stats.get(id) ?? { counts: [] as number[], myVote: null as number | null, total: 0 };
    return {
      ok: true,
      messageId: id,
      optionIdx: idx,
      options,
      counts: options.map((_, i) => Number(st.counts[i] ?? 0) || 0),
      myVote: st.myVote ?? idx,
      total: st.total,
    };
  }

  /**
   * Parte 15: mensaje de SISTEMA en la conversación entre dos usuarios (avisos
   * de pedidos). Si no existe conversación, no se crea nada.
   */
  private async systemMessage(fromId: string, toId: string, text: string, payload: Record<string, unknown> = {}) {
    const conv: any[] = await this.db.$queryRaw`
      SELECT id, user_a, user_b FROM lifebook.conversations
      WHERE (user_a=${fromId}::uuid AND user_b=${toId}::uuid)
         OR (user_a=${toId}::uuid AND user_b=${fromId}::uuid)
      LIMIT 1`;
    if (!conv[0]) return null;
    const c = conv[0];
    const meIsA = c.user_a === fromId;
    const preview = text.slice(0, 300);
    await this.db.$queryRaw`
      INSERT INTO lifebook.messages (conversation_id, sender_id, body, kind, payload)
      VALUES (${c.id}::uuid, ${fromId}::uuid, ${preview}, 'system', ${JSON.stringify(payload)}::jsonb)`;
    await this.db.$queryRaw`
      UPDATE lifebook.conversations
      SET last_message=${preview}, last_message_at=now(),
          unread_a = unread_a + CASE WHEN ${!meIsA} THEN 1 ELSE 0 END,
          unread_b = unread_b + CASE WHEN ${meIsA} THEN 1 ELSE 0 END
      WHERE id=${c.id}::uuid`;
    return c.id;
  }

  /** Marca la conversación como leída por mí (mensajes del otro). */
  async chatMarkRead(userId: string, convId: string) {
    const conv = await this.assertConvMember(userId, convId);
    if (conv.kind === 'group') {
      await this.db.$queryRaw`
        UPDATE lifebook.group_members SET last_read_at = now()
        WHERE conversation_id=${convId}::uuid AND user_id=${userId}::uuid`;
      return { ok: true };
    }
    const meIsA = conv.user_a === userId;
    await this.db.$queryRaw`
      UPDATE lifebook.messages SET read_at = now()
      WHERE conversation_id=${convId}::uuid AND sender_id <> ${userId}::uuid AND read_at IS NULL`;
    await this.db.$queryRawUnsafe(
      meIsA
        ? `UPDATE lifebook.conversations SET unread_a=0 WHERE id=$1::uuid`
        : `UPDATE lifebook.conversations SET unread_b=0 WHERE id=$1::uuid`,
      convId);
    return { ok: true };
  }

  /** Total de mensajes no leídos del usuario. */
  async chatUnreadTotal(userId: string) {
    const rows: any[] = await this.db.$queryRaw`
      SELECT COALESCE(SUM(CASE WHEN user_a=${userId}::uuid THEN unread_a ELSE unread_b END), 0)::int AS n
      FROM lifebook.conversations WHERE user_a=${userId}::uuid OR user_b=${userId}::uuid`;
    return { unread: Number(rows[0]?.n ?? 0) };
  }

  // ---------------- PEDIDOS (lb-orders) ----------------
  /** Crea un pedido sobre una venta (contraoferta solo si negociable). */
  async createOrder(buyerId: string, dto: { postId: string; message?: string; priceXaf?: number }) {
    const post: any[] = await this.db.$queryRaw`
      SELECT p.id, p.author_id, p.type, p.title, p.payload, p.state FROM lifebook.posts p
      WHERE p.id=${dto.postId}::uuid`;
    if (!post[0]) throw new DomainError('POST_NOT_FOUND', 'Publicación no encontrada');
    if (post[0].state !== 'active') throw new DomainError('POST_NOT_FOUND', 'Esta venta ya no está activa');
    if (post[0].type !== 'sale') throw new DomainError('ORDER_NOT_FOR_SALE', 'Solo puedes pedir productos en venta');
    if (post[0].author_id === buyerId) throw new DomainError('CANNOT_ORDER_OWN', 'No puedes pedirte tu propio producto');
    const dup: any[] = await this.db.$queryRaw`
      SELECT 1 FROM lifebook.orders
      WHERE buyer_id=${buyerId}::uuid AND post_id=${dto.postId}::uuid
        AND status IN ('requested','accepted','in_transit','disputed')`;
    if (dup[0]) throw new DomainError('ORDER_EXISTS', 'Ya tienes un pedido activo para este producto');
    const payload = post[0].payload ?? {};
    const basePrice = Math.round(Number(payload.priceXaf ?? 0) || 0);
    const negotiable = !!payload.negotiable;
    let price = basePrice;
    const offered = dto.priceXaf !== undefined && dto.priceXaf !== null ? Math.round(Number(dto.priceXaf)) : null;
    if (offered !== null) {
      if (!Number.isFinite(offered) || offered < 0) throw new DomainError('PRICE_INVALID', 'Precio no válido');
      if (!negotiable && offered !== basePrice) throw new DomainError('PRICE_NOT_ACCEPTED', 'Este producto no es negociable');
      price = offered;
    }
    const no = 'LB-' + randomUUID().replace(/[^A-Z0-9]/gi, '').slice(0, 6).toUpperCase();
    const row: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.orders (order_no, post_id, buyer_id, seller_id, title, price_xaf, negotiable, message, contact_mode)
      VALUES (${no}, ${dto.postId}::uuid, ${buyerId}::uuid, ${post[0].author_id}::uuid,
              ${String(post[0].title ?? '').slice(0, 90) || null}, ${price}, ${negotiable},
              ${String(dto.message ?? '').trim().slice(0, 300) || null},
              ${String(payload.contactMode ?? 'inapp').slice(0, 12)})
      RETURNING id, order_no, status`;
    return {
      id: row[0]?.id, orderNo: row[0]?.order_no, status: row[0]?.status,
      priceXaf: price, negotiable,
    };
  }

  private async orderBase(orderId: string) {
    const rows: any[] = await this.db.$queryRaw`
      SELECT o.*, p.media_ids,
             b.full_name AS buyer_name, b.avatar_url AS buyer_avatar,
             s.full_name AS seller_name, s.avatar_url AS seller_avatar
      FROM lifebook.orders o
      JOIN lifebook.posts p ON p.id = o.post_id
      JOIN mobility.users b ON b.id = o.buyer_id
      JOIN mobility.users s ON s.id = o.seller_id
      WHERE o.id=${orderId}::uuid LIMIT 1`;
    return rows[0] ?? null;
  }

  private serializeOrder(o: any) {
    const mediaIds = Array.isArray(o.media_ids) ? o.media_ids : [];
    return {
      id: o.id,
      orderNo: o.order_no,
      postId: o.post_id,
      title: o.title,
      priceXaf: Number(o.price_xaf),
      negotiable: !!o.negotiable,
      message: o.message ?? null,
      contactMode: o.contact_mode,
      status: o.status,
      createdAt: String(o.created_at),
      buyer: { id: o.buyer_id, fullName: o.buyer_name, avatarUrl: o.buyer_avatar },
      seller: { id: o.seller_id, fullName: o.seller_name, avatarUrl: o.seller_avatar },
      media: mediaIds.slice(0, 1).map((id: string) => ({ id, url: `${USER_PHOTO_BASE}/${id}` })),
    };
  }

  /** Mis pedidos: side=buyer (compras) | seller (ventas). */
  async listOrders(userId: string, side: 'buyer' | 'seller') {
    const rows: any[] = await this.db.$queryRawUnsafe(
      side === 'seller'
        ? `SELECT o.*, p.media_ids, b.full_name AS buyer_name, b.avatar_url AS buyer_avatar,
                  s.full_name AS seller_name, s.avatar_url AS seller_avatar
           FROM lifebook.orders o
           JOIN lifebook.posts p ON p.id = o.post_id
           JOIN mobility.users b ON b.id = o.buyer_id
           JOIN mobility.users s ON s.id = o.seller_id
           WHERE o.seller_id = $1::uuid
           ORDER BY o.created_at DESC LIMIT 200`
        : `SELECT o.*, p.media_ids, b.full_name AS buyer_name, b.avatar_url AS buyer_avatar,
                  s.full_name AS seller_name, s.avatar_url AS seller_avatar
           FROM lifebook.orders o
           JOIN lifebook.posts p ON p.id = o.post_id
           JOIN mobility.users b ON b.id = o.buyer_id
           JOIN mobility.users s ON s.id = o.seller_id
           WHERE o.buyer_id = $1::uuid
           ORDER BY o.created_at DESC LIMIT 200`,
      userId);
    return rows.map((o) => this.serializeOrder(o));
  }

  /** Detalle de un pedido (solo comprador o vendedor). */
  async orderDetail(userId: string, orderId: string) {
    const o = await this.orderBase(orderId);
    if (!o) throw new DomainError('ORDER_NOT_FOUND', 'Pedido no encontrado');
    if (o.buyer_id !== userId && o.seller_id !== userId) throw new DomainError('ORDER_NOT_YOURS', 'Este pedido no es tuyo');
    return this.serializeOrder(o);
  }

  /** Acción sobre un pedido según el rol (comprador o vendedor). */
  async orderAction(userId: string, orderId: string, dto: { action: string }) {
    const o = await this.orderBase(orderId);
    if (!o) throw new DomainError('ORDER_NOT_FOUND', 'Pedido no encontrado');
    const isBuyer = o.buyer_id === userId;
    const isSeller = o.seller_id === userId;
    if (!isBuyer && !isSeller) throw new DomainError('ORDER_NOT_YOURS', 'Este pedido no es tuyo');
    const action = String(dto.action ?? '');
    const cur = String(o.status);
    const ACTIVE = ['requested', 'accepted', 'in_transit'];
    let next: string | null = null;
    if (isBuyer) {
      if (action === 'cancel' && ACTIVE.includes(cur)) next = 'cancelled';
      else if (action === 'dispute' && ACTIVE.includes(cur)) next = 'disputed';
      else if (action === 'complete' && cur === 'delivered') next = 'delivered'; // no-op confirmación
    } else if (isSeller) {
      if (action === 'accept' && cur === 'requested') next = 'accepted';
      else if (action === 'decline' && cur === 'requested') next = 'declined';
      else if (action === 'send' && cur === 'accepted') next = 'in_transit';
      else if (action === 'deliver' && cur === 'in_transit') next = 'delivered';
    }
    if (!next) throw new DomainError('ORDER_STATE_INVALID', 'Acción no permitida para el estado actual');
    await this.db.$queryRaw`
      UPDATE lifebook.orders SET status=${next}, updated_at=now() WHERE id=${orderId}::uuid`;
    // Parte 15: aviso de SISTEMA en el chat comprador↔vendedor (si existe).
    const ORDER_SYSTEM: Record<string, string> = {
      accepted: '✅ El vendedor aceptó tu pedido',
      declined: '❌ El vendedor rechazó tu pedido',
      in_transit: '🚚 El pedido está en camino',
      delivered: '📦 El pedido se marcó como entregado',
      cancelled: '🚫 El pedido se canceló',
      disputed: '⚠️ El pedido quedó en disputa',
    };
    const aviso = ORDER_SYSTEM[next];
    if (aviso) {
      const otherId = isBuyer ? o.seller_id : o.buyer_id;
      await this.systemMessage(userId, otherId, aviso, { orderId, orderNo: o.order_no, status: next })
        .catch(() => null);
    }
    return { ok: true, status: next };
  }

  // ---------------- TIENDA (página pública de un vendedor) ----------------
  /** Página de tienda: perfil + ventas activas + badge ecomerse. */
  async storeProfile(viewerId: string, sellerId: string) {
    const profile = await this.userProfile(sellerId, viewerId);
    const sales = await this.userPosts(sellerId, viewerId, { type: 'sale', limit: 60 });
    return {
      store: {
        id: profile.id,
        fullName: profile.fullName,
        avatarUrl: profile.avatarUrl,
        coverPhotoUrl: profile.coverPhotoUrl,
        bio: profile.bio,
        city: profile.city,
        country: profile.country,
        ratingAvg: profile.ratingAvg,
        relation: profile.relation,
        verified: profile.verified,
        stats: profile.stats,
        ecomerse: profile.verified.seller,
      },
      sales: sales.posts,
      nextCursor: sales.nextCursor,
    };
  }

  // ---------------- MODERACIÓN (cola + decisiones + apelaciones) ----------------
  private async reportRow(reportId: string) {
    const rows: any[] = await this.db.$queryRaw`
      SELECT r.*, p.author_id AS post_author, c.author_id AS comment_author,
             u.full_name AS reporter_name
      FROM lifebook.reports r
      LEFT JOIN lifebook.posts p ON p.id = r.content_id AND r.content_type='post'
      LEFT JOIN lifebook.comments c ON c.id = r.content_id AND r.content_type='comment'
      JOIN mobility.users u ON u.id = r.reporter_id
      WHERE r.id=${reportId}::uuid LIMIT 1`;
    return rows[0] ?? null;
  }

  /** Cola de moderación con filtros (ADMIN). */
  async modQueue(opts: { state?: string; reason?: string; contentType?: string; limit?: number }) {
    const limit = Math.min(Math.max(Number(opts.limit ?? 30) || 30, 1), 100);
    // Parte 16: por defecto la cola muestra solo lo ABIERTO (antes mezclaba ya decididos).
    const state = String(opts.state ?? 'open').trim() || 'open';
    const conds: string[] = [];
    const args: unknown[] = [];
    if (state !== 'all') { args.push(state); conds.push(`r.state = $${args.length}`); }
    if (opts.reason) { args.push(opts.reason); conds.push(`r.reason = $${args.length}`); }
    if (opts.contentType) { args.push(opts.contentType); conds.push(`r.content_type = $${args.length}`); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    args.push(limit);
    const rows: any[] = await this.db.$queryRawUnsafe(`
      SELECT r.id, r.content_id, r.content_type, r.reason, r.note, r.state, r.created_at,
             ru.full_name AS reporter_name,
             COALESCE(p.author_id, c.author_id) AS content_author_id,
             COALESCE(p.title, p.body, c.body) AS preview,
             (SELECT count(*)::int FROM lifebook.reports r2
               WHERE r2.content_id = r.content_id AND r2.created_at > now() - interval '1 hour') AS reports_1h
      FROM lifebook.reports r
      JOIN mobility.users ru ON ru.id = r.reporter_id
      LEFT JOIN lifebook.posts p ON p.id = r.content_id AND r.content_type='post'
      LEFT JOIN lifebook.comments c ON c.id = r.content_id AND r.content_type='comment'
      ${where}
      ORDER BY r.created_at ASC
      LIMIT $${args.length}`, ...args);
    return rows.map((r) => ({
      id: r.id, contentId: r.content_id, contentType: r.content_type,
      reason: r.reason, note: r.note ?? null, state: r.state,
      createdAt: String(r.created_at), reporterName: r.reporter_name,
      contentAuthorId: r.content_author_id ?? null, preview: r.preview ?? null,
      reports1h: Number(r.reports_1h ?? 0),
    }));
  }

  /** Detalle de reporte para el moderador: contenido + autor + historial. */
  async modReportDetail(reportId: string) {
    const r = await this.reportRow(reportId);
    if (!r) throw new DomainError('REPORT_NOT_FOUND', 'Reporte no encontrado');
    const authorId = r.content_type === 'post' ? r.post_author : r.comment_author;
    const author: any[] = await this.db.$queryRaw`
      SELECT id, full_name, avatar_url, status, city, created_at
      FROM mobility.users WHERE id=${authorId}::uuid`;
    const history: any[] = await this.db.$queryRaw`
      SELECT content_id, action, reason, reason_text, created_at
      FROM lifebook.mod_actions
      WHERE target_user_id=${authorId}::uuid
      ORDER BY created_at DESC LIMIT 10`;
    const content: any[] = await this.db.$queryRawUnsafe(
      r.content_type === 'post'
        ? `SELECT id, type, title, body, state, visibility, city, created_at FROM lifebook.posts WHERE id=$1::uuid`
        : `SELECT id, body, state, created_at FROM lifebook.comments WHERE id=$1::uuid`,
      r.content_id);
    return {
      report: {
        id: r.id, contentType: r.content_type, reason: r.reason, note: r.note ?? null,
        state: r.state, createdAt: String(r.created_at), reporterName: r.reporter_name,
      },
      content: content[0] ?? null,
      author: author[0] ?? null,
      history: history.map((h) => ({
        action: h.action, reason: h.reason ?? null, reasonText: h.reason_text ?? null,
        createdAt: String(h.created_at),
      })),
    };
  }

  private async audit(adminId: string | null, contentId: string | null, targetUserId: string | null, action: string, reason: string | null, text?: string | null) {
    await this.db.$queryRaw`
      INSERT INTO lifebook.mod_actions (content_id, target_user_id, admin_id, action, reason, reason_text)
      VALUES (${contentId}::uuid, ${targetUserId}::uuid, ${adminId}::uuid, ${action}, ${reason}, ${String(text ?? '').slice(0, 300) || null})`;
  }

  private async markReportDecided(reportId: string) {
    await this.db.$queryRaw`
      UPDATE lifebook.reports SET state='decided', updated_at=now()
      WHERE id=${reportId}::uuid AND state <> 'decided'`;
  }

  /** Decisión del moderador (ADMIN). Ver DISEÑO MODERACIÓN §6. */
  async modDecision(adminId: string, reportId: string, dto: { action: string; days?: number; note?: string }) {
    const r = await this.reportRow(reportId);
    if (!r) throw new DomainError('REPORT_NOT_FOUND', 'Reporte no encontrado');
    if (r.state === 'decided') throw new DomainError('REPORT_DECIDED', 'Este reporte ya fue resuelto');
    const action = String(dto.action ?? '');
    const note = String(dto.note ?? '').trim().slice(0, 300) || null;
    const authorId = r.content_type === 'post' ? r.post_author : r.comment_author;
    const isPost = r.content_type === 'post';
    const reason = r.reason || 'comunidad';

    if (action === 'keep') {
      await this.markReportDecided(reportId);
      await this.audit(adminId, r.content_id, authorId, 'report_keep', reason, note);
      return { ok: true, action: 'keep' };
    }
    if (action === 'hide' || action === 'remove' || action === 'restore') {
      const state = action === 'hide' ? (isPost ? 'quarantined' : 'hidden') : action === 'remove' ? 'removed' : 'active';
      if (isPost) {
        await this.db.$queryRaw`
          UPDATE lifebook.posts SET state=${state}, updated_at=now() WHERE id=${r.content_id}::uuid`;
      } else {
        await this.db.$queryRaw`
          UPDATE lifebook.comments SET state=${state} WHERE id=${r.content_id}::uuid`;
      }
      await this.markReportDecided(reportId);
      await this.audit(adminId, r.content_id, authorId, action === 'restore' ? 'content_restored' : action === 'hide' ? 'content_hidden' : 'content_removed', reason, note);
      return { ok: true, action };
    }
    if (action === 'warn') {
      await this.markReportDecided(reportId);
      await this.audit(adminId, null, authorId, 'user_warned', reason, note);
      return { ok: true, action: 'warn' };
    }
    if (action === 'ban_publish') {
      const days = Math.min(Math.max(Number(dto.days ?? 3) || 3, 1), 365);
      const until = new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
      await this.db.$queryRaw`
        UPDATE mobility.users SET status_prefs = jsonb_set(
          coalesce(status_prefs, '{}'::jsonb), '{publish_banned_until}', to_jsonb(${until}::text))
        WHERE id=${authorId}::uuid`;
      await this.markReportDecided(reportId);
      await this.audit(adminId, null, authorId, 'publish_banned', reason, `publicar hasta ${until}` + (note ? ` · ${note}` : ''));
      return { ok: true, action: 'ban_publish', until };
    }
    if (action === 'suspend_account' || action === 'ban_account') {
      const days = action === 'suspend_account' ? Math.min(Math.max(Number(dto.days ?? 7) || 7, 1), 365) : 36500;
      const until = new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
      await this.db.$queryRaw`
        UPDATE mobility.users SET status='SUSPENDED',
          status_prefs = jsonb_set(jsonb_set(coalesce(status_prefs, '{}'::jsonb),
            '{suspended_until}', to_jsonb(${until}::text)), '{publish_banned_until}', 'null'::jsonb)
        WHERE id=${authorId}::uuid AND status <> 'SUSPENDED'`;
      await this.markReportDecided(reportId);
      await this.audit(adminId, null, authorId, action === 'ban_account' ? 'account_banned' : 'account_suspended', reason, `hasta ${until}` + (note ? ` · ${note}` : ''));
      return { ok: true, action, until };
    }
    throw new DomainError('ACTION_INVALID', 'Acción no válida');
  }

  /** Apelación del AUTOR del contenido reportado. */
  async appealReport(userId: string, reportId: string, dto: { note?: string }) {
    const r = await this.reportRow(reportId);
    if (!r) throw new DomainError('REPORT_NOT_FOUND', 'Reporte no encontrado');
    const authorId = r.content_type === 'post' ? r.post_author : r.comment_author;
    if (!authorId || authorId !== userId) throw new DomainError('NOT_CONTENT_AUTHOR', 'Solo el autor del contenido puede apelar');
    if (r.state !== 'decided') throw new DomainError('REPORT_OPEN', 'Este reporte aún está en revisión');
    const note = String(dto.note ?? '').trim().slice(0, 300) || null;
    await this.db.$queryRaw`
      UPDATE lifebook.reports SET state='appealed', appeal_note=${note}, appealed_at=now()
      WHERE id=${reportId}::uuid AND state='decided'`;
    await this.audit(null, r.content_id, authorId, 'appeal_filed', r.reason, note);
    return { ok: true };
  }

  /** Acciones de moderación SOBRE UN USUARIO sin pasar por un reporte (lift). */
  async modUserAction(adminId: string, userId: string, dto: { action: string }) {
    const u: any[] = await this.db.$queryRaw`SELECT 1 FROM mobility.users WHERE id=${userId}::uuid`;
    if (!u[0]) throw new DomainError('USER_NOT_FOUND', 'Usuario no encontrado');
    const action = String(dto.action ?? '');
    if (action === 'lift_publish') {
      await this.db.$queryRaw`
        UPDATE mobility.users SET status_prefs = status_prefs - 'publish_banned_until'
        WHERE id=${userId}::uuid`;
      await this.audit(adminId, null, userId, 'publish_banned_lifted', null, null);
      return { ok: true, action };
    }
    if (action === 'unsuspend') {
      await this.db.$queryRaw`
        UPDATE mobility.users SET status='ACTIVE',
          status_prefs = status_prefs - 'suspended_until' - 'publish_banned_until'
        WHERE id=${userId}::uuid AND status='SUSPENDED'`;
      await this.audit(adminId, null, userId, 'account_unsuspended', null, null);
      return { ok: true, action };
    }
    throw new DomainError('ACTION_INVALID', 'Acción no válida');
  }

  // =========================================================================
  // PARTE 6 — AJUSTES DE LIFE BOOK · BLOQUEOS
  // =========================================================================

  private readonly LB_SETTINGS_DEFAULTS = {
    publish: { defaultVisibility: 'public' },
    privacy: {
      posts: 'public', messages: 'public', location: 'nobody',
      comments: 'public', email: 'nobody',
    },
    notifications: {
      likes: true, comments: true, follows: true, messages: true,
      orders: true, debates: true, promotions: false, digest: false,
    },
    content: { sensitiveFilter: true, cities: ['Malabo'] },
  };

  private readonly LB_SETTING_RULES: Record<string, Record<string, { kind: 'enum' | 'bool' | 'cities'; values?: string[] }>> = {
    publish: {
      defaultVisibility: { kind: 'enum', values: ['public', 'followers', 'private'] },
    },
    privacy: {
      posts: { kind: 'enum', values: ['public', 'followers', 'private'] },
      messages: { kind: 'enum', values: ['public', 'followers', 'private', 'nobody'] },
      location: { kind: 'enum', values: ['public', 'followers', 'nobody'] },
      comments: { kind: 'enum', values: ['public', 'followers', 'private'] },
      email: { kind: 'enum', values: ['public', 'followers', 'nobody'] },
    },
    notifications: {
      likes: { kind: 'bool' }, comments: { kind: 'bool' }, follows: { kind: 'bool' },
      messages: { kind: 'bool' }, orders: { kind: 'bool' }, debates: { kind: 'bool' },
      promotions: { kind: 'bool' }, digest: { kind: 'bool' },
    },
    content: {
      sensitiveFilter: { kind: 'bool' },
      cities: { kind: 'cities' },
    },
  };

  /** Lee los ajustes de Life Book de la cuenta (fusionados con los defaults). */
  async lbSettings(userId: string) {
    const rows: any[] = await this.db.$queryRaw`
      SELECT status_prefs->'lb' AS lb FROM mobility.users WHERE id=${userId}::uuid`;
    const raw = (rows[0]?.lb ?? {}) as Record<string, Record<string, unknown>>;
    const out: Record<string, Record<string, unknown>> = {};
    for (const [group, defaults] of Object.entries(this.LB_SETTINGS_DEFAULTS)) {
      out[group] = { ...defaults, ...(raw[group] ?? {}) };
    }
    return out;
  }

  /** Actualiza (merge parcial validado) los ajustes de Life Book. */
  async updateLbSettings(userId: string, patch: Record<string, Record<string, unknown>>) {
    const current = await this.lbSettings(userId);
    for (const [group, keys] of Object.entries(patch ?? {})) {
      const rules = this.LB_SETTING_RULES[group];
      if (!rules) throw new DomainError('SETTING_INVALID', 'Grupo de ajuste no válido');
      if (!keys || typeof keys !== 'object') throw new DomainError('SETTING_INVALID', 'Formato de ajuste no válido');
      for (const [key, value] of Object.entries(keys)) {
        const rule = rules[key];
        if (!rule) throw new DomainError('SETTING_INVALID', `Ajuste no válido: ${key}`);
        if (rule.kind === 'enum') {
          if (!rule.values!.includes(String(value))) throw new DomainError('SETTING_INVALID', `Valor no válido para ${key}`);
          current[group][key] = String(value);
        } else if (rule.kind === 'bool') {
          if (typeof value !== 'boolean') throw new DomainError('SETTING_INVALID', `Valor no válido para ${key}`);
          current[group][key] = value;
        } else if (rule.kind === 'cities') {
          if (!Array.isArray(value) || value.some((c) => typeof c !== 'string' || c.length > 90)) {
            throw new DomainError('SETTING_INVALID', 'Ciudades no válidas');
          }
          current[group][key] = (value as string[]).slice(0, 10).map((c) => c.trim()).filter(Boolean);
        }
      }
    }
    await this.db.$queryRaw`
      UPDATE mobility.users SET status_prefs = jsonb_set(
        coalesce(status_prefs, '{}'::jsonb), '{lb}', ${JSON.stringify(current)}::jsonb)
      WHERE id=${userId}::uuid`;
    return current;
  }

  /** Lanza 403 si actor y otro usuario están bloqueados en cualquier dirección. */
  /**
   * Comprueba que quien mira PUEDE ver la publicación antes de tocar sus
   * comentarios, con las MISMAS reglas que `getPost`: existe y está activa (o es
   * suya), no hay bloqueo en ningún sentido, `private` solo la ve el autor y
   * `followers` exige seguimiento.
   *
   * POR QUÉ EXISTE: los comentarios no comprobaban nada de esto. Medido en vivo
   * con una nota privada ajena: 404 al abrir la publicación, pero 200 al LEER sus
   * comentarios y 201 al ESCRIBIR uno nuevo. La única barrera era no conocer el id.
   *
   * Todos los casos lanzan el MISMO error que «no existe»: no se revela si la
   * publicación existe.
   */
  private async assertPostVisible(postId: string, viewerId?: string | null) {
    const oculto = () => new DomainError('POST_NOT_FOUND', 'Publicación no encontrada');
    const rows: any[] = await this.db.$queryRaw`
      SELECT id, author_id, visibility, state, allow_comments FROM lifebook.posts WHERE id=${postId}::uuid`;
    const p = rows[0];
    if (!p) throw oculto();
    const isAuthor = !!viewerId && viewerId === p.author_id;
    if (p.state !== 'active' && !isAuthor) throw oculto();
    if (isAuthor) return p;
    if (viewerId) {
      const b: any[] = await this.db.$queryRaw`
        SELECT 1 FROM lifebook.blocks
        WHERE (blocker_id=${p.author_id}::uuid AND blocked_id=${viewerId}::uuid)
           OR (blocker_id=${viewerId}::uuid AND blocked_id=${p.author_id}::uuid)
        LIMIT 1`;
      if (b[0]) throw oculto();
    }
    if (p.visibility === 'private') throw oculto();
    if (p.visibility === 'followers') {
      const f: any[] = viewerId
        ? await this.db.$queryRaw`
            SELECT 1 FROM lifebook.follows
            WHERE followee_id=${p.author_id}::uuid AND follower_id=${viewerId}::uuid LIMIT 1`
        : [];
      if (!f[0]) throw oculto();
    }
    return p;
  }

  /** Lo mismo, pero partiendo de un comentario (para reaccionar a él). */
  private async assertCommentVisible(commentId: string, viewerId?: string | null) {
    const rows: any[] = await this.db.$queryRaw`
      SELECT post_id FROM lifebook.comments WHERE id=${commentId}::uuid AND state='active'`;
    if (!rows[0]) throw new DomainError('COMMENT_NOT_FOUND', 'Comentario no encontrado');
    await this.assertPostVisible(rows[0].post_id, viewerId);
    return rows[0].post_id as string;
  }

  private async assertNotBlocked(actorId: string, otherId: string, message: string) {
    const b: any[] = await this.db.$queryRaw`
      SELECT 1 FROM lifebook.blocks
      WHERE (blocker_id=${actorId}::uuid AND blocked_id=${otherId}::uuid)
         OR (blocker_id=${otherId}::uuid AND blocked_id=${actorId}::uuid)
      LIMIT 1`;
    if (b[0]) throw new DomainError('USER_BLOCKED', message);
  }

  /** Bloquea a un usuario (mutuo: ninguno verá contenido ni podrá escribirse). */
  async blockUser(userId: string, targetId: string) {
    if (userId === targetId) throw new DomainError('CANNOT_BLOCK_SELF', 'No puedes bloquearte a ti mismo');
    const u: any[] = await this.db.$queryRaw`SELECT 1 FROM mobility.users WHERE id=${targetId}::uuid`;
    if (!u[0]) throw new DomainError('USER_NOT_FOUND', 'Usuario no encontrado');
    await this.db.$queryRaw`
      INSERT INTO lifebook.blocks (blocker_id, blocked_id)
      VALUES (${userId}::uuid, ${targetId}::uuid) ON CONFLICT DO NOTHING`;
    // Al bloquear se deja de seguir al bloqueado (y viceversa no aplica).
    await this.db.$queryRaw`
      DELETE FROM lifebook.follows
      WHERE (followee_id=${userId}::uuid AND follower_id=${targetId}::uuid)
         OR (followee_id=${targetId}::uuid AND follower_id=${userId}::uuid)`;
    return { ok: true, blocked: true };
  }

  async unblockUser(userId: string, targetId: string) {
    await this.db.$queryRaw`
      DELETE FROM lifebook.blocks WHERE blocker_id=${userId}::uuid AND blocked_id=${targetId}::uuid`;
    return { ok: true, blocked: false };
  }

  /** Mi lista de bloqueados (con nombre para la UI). */
  async myBlocks(userId: string) {
    const rows: any[] = await this.db.$queryRaw`
      SELECT b.blocked_id, u.full_name, u.avatar_url, b.created_at
      FROM lifebook.blocks b
      JOIN mobility.users u ON u.id = b.blocked_id
      WHERE b.blocker_id=${userId}::uuid
      ORDER BY b.created_at DESC LIMIT 200`;
    return rows.map((r) => ({
      id: r.blocked_id, fullName: r.full_name, avatarUrl: r.avatar_url,
      blockedAt: String(r.created_at),
    }));
  }

  // =========================================================================
  // PARTE 7 — BANDEJA (likes/guardados recibidos · seguidores · recomendaciones
  // · comentarios recibidos · menciones @). Estructura inspirada en la página
  // de mensajes de Xiaohongshu (ver DISEÑO-BANDEJA-XHS-LIFEBOOK.md).
  // =========================================================================

  /** Contadores para los iconos del header de Mensajes (Parte 16: NO LEÍDOS). */
  async inboxCounts(userId: string) {
    const rows: any[] = await this.db.$queryRaw`
      SELECT
        (SELECT count(*)::int FROM lifebook.likes l JOIN lifebook.posts p ON p.id=l.post_id
          WHERE p.author_id=${userId}::uuid AND p.state='active' AND l.user_id <> ${userId}::uuid
            AND l.read_at IS NULL) AS likes,
        (SELECT count(*)::int FROM lifebook.bookmarks b JOIN lifebook.posts p ON p.id=b.post_id
          WHERE p.author_id=${userId}::uuid AND p.state='active' AND b.user_id <> ${userId}::uuid
            AND b.read_at IS NULL) AS saves,
        (SELECT count(*)::int FROM lifebook.follows f
          WHERE f.followee_id=${userId}::uuid AND f.read_at IS NULL) AS followers,
        (SELECT count(*)::int FROM lifebook.comments c JOIN lifebook.posts p ON p.id=c.post_id
          WHERE p.author_id=${userId}::uuid AND c.state='active' AND c.author_id <> ${userId}::uuid
            AND c.read_at IS NULL) AS comments,
        (SELECT count(*)::int FROM lifebook.mentions m
          WHERE m.user_id=${userId}::uuid AND m.read_at IS NULL) AS mentions`;
    const r = rows[0] ?? {};
    return {
      likes: Number(r.likes ?? 0), saves: Number(r.saves ?? 0), followers: Number(r.followers ?? 0),
      comments: Number(r.comments ?? 0), mentions: Number(r.mentions ?? 0),
    };
  }

  /**
   * Parte 16: marca como LEÍDA una bandeja completa
   * (`likes` cubre me gusta + guardados; `comments` cubre comentarios + menciones).
   */
  async inboxMarkRead(userId: string, kind: string) {
    const k = String(kind ?? '').trim();
    if (k === 'likes') {
      await this.db.$queryRaw`
        UPDATE lifebook.likes l SET read_at = now()
        FROM lifebook.posts p
        WHERE p.id = l.post_id AND p.author_id = ${userId}::uuid
          AND l.user_id <> ${userId}::uuid AND l.read_at IS NULL`;
      await this.db.$queryRaw`
        UPDATE lifebook.bookmarks b SET read_at = now()
        FROM lifebook.posts p
        WHERE p.id = b.post_id AND p.author_id = ${userId}::uuid
          AND b.user_id <> ${userId}::uuid AND b.read_at IS NULL`;
      return { ok: true, kind: k };
    }
    if (k === 'followers') {
      await this.db.$queryRaw`
        UPDATE lifebook.follows SET read_at = now()
        WHERE followee_id = ${userId}::uuid AND read_at IS NULL`;
      return { ok: true, kind: k };
    }
    if (k === 'comments') {
      await this.db.$queryRaw`
        UPDATE lifebook.comments c SET read_at = now()
        FROM lifebook.posts p
        WHERE p.id = c.post_id AND p.author_id = ${userId}::uuid
          AND c.author_id <> ${userId}::uuid AND c.read_at IS NULL`;
      await this.db.$queryRaw`
        UPDATE lifebook.mentions SET read_at = now()
        WHERE user_id = ${userId}::uuid AND read_at IS NULL`;
      return { ok: true, kind: k };
    }
    throw new DomainError('INBOX_KIND_INVALID', 'Bandeja no válida');
  }

  /**
   * Parte 16: MIS GUARDADOS (las publicaciones que yo marqué).
   * Reutiliza `feedPage` (bloqueos + marcas del visor) y ordena por fecha.
   */
  async mySaves(viewerId: string, opts: { cursor?: string; limit?: number } = {}) {
    const args: unknown[] = [viewerId];
    const where = [
      `p.state='active'`,
      `EXISTS (SELECT 1 FROM lifebook.bookmarks b WHERE b.post_id = p.id AND b.user_id = $1::uuid)`,
      `(p.visibility='public' OR p.author_id = $1::uuid
         OR (p.visibility='followers' AND EXISTS (
              SELECT 1 FROM lifebook.follows f WHERE f.followee_id = p.author_id AND f.follower_id = $1::uuid)))`,
    ].join(' AND ');
    return this.feedPage(where, args, { cursor: opts.cursor, limit: opts.limit, viewerId });
  }

  /** Quién dio me gusta a MIS publicaciones (con la publicación). */
  async likesReceived(userId: string, opts: { limit?: number } = {}) {
    const limit = Math.min(Math.max(Number(opts.limit ?? 50) || 50, 1), 100);
    const rows: any[] = await this.db.$queryRaw`
      SELECT l.created_at, l.reaction, l.read_at, p.id AS post_id, p.type, p.title, p.body,
             (p.media_ids->>0) AS thumb_id,
             u.id AS actor_id, u.full_name, u.avatar_url, u.city
      FROM lifebook.likes l
      JOIN lifebook.posts p ON p.id = l.post_id
      JOIN mobility.users u ON u.id = l.user_id
      WHERE p.author_id=${userId}::uuid AND p.state='active' AND l.user_id <> ${userId}::uuid
      ORDER BY l.created_at DESC
      LIMIT ${limit}`;
    return rows.map((r) => ({
      at: String(r.created_at), reaction: r.reaction ?? 'like', read: !!r.read_at,
      user: { id: r.actor_id, fullName: r.full_name, avatarUrl: r.avatar_url, city: r.city ?? null },
      post: {
        id: r.post_id, type: r.type, title: r.title ?? null,
        preview: String(r.title ?? r.body ?? '').slice(0, 80),
        thumb: r.thumb_id ? { id: r.thumb_id, url: `${USER_PHOTO_BASE}/${r.thumb_id}` } : null,
      },
    }));
  }

  /** Quién guardó MIS publicaciones. */
  async savesReceived(userId: string, opts: { limit?: number } = {}) {
    const limit = Math.min(Math.max(Number(opts.limit ?? 50) || 50, 1), 100);
    const rows: any[] = await this.db.$queryRaw`
      SELECT b.created_at, b.read_at, p.id AS post_id, p.type, p.title, p.body, (p.media_ids->>0) AS thumb_id,
             u.id AS actor_id, u.full_name, u.avatar_url, u.city
      FROM lifebook.bookmarks b
      JOIN lifebook.posts p ON p.id = b.post_id
      JOIN mobility.users u ON u.id = b.user_id
      WHERE p.author_id=${userId}::uuid AND p.state='active' AND b.user_id <> ${userId}::uuid
      ORDER BY b.created_at DESC
      LIMIT ${limit}`;
    return rows.map((r) => ({
      at: String(r.created_at), read: !!r.read_at,
      user: { id: r.actor_id, fullName: r.full_name, avatarUrl: r.avatar_url, city: r.city ?? null },
      post: {
        id: r.post_id, type: r.type, title: r.title ?? null,
        preview: String(r.title ?? r.body ?? '').slice(0, 80),
        thumb: r.thumb_id ? { id: r.thumb_id, url: `${USER_PHOTO_BASE}/${r.thumb_id}` } : null,
      },
    }));
  }

  /** Nuevos seguidores (con "seguir de vuelta" y nº de publicaciones). */
  async newFollowers(userId: string, opts: { limit?: number } = {}) {
    const limit = Math.min(Math.max(Number(opts.limit ?? 50) || 50, 1), 100);
    const rows: any[] = await this.db.$queryRaw`
      SELECT f.created_at, f.read_at, u.id, u.full_name, u.avatar_url, u.city,
             EXISTS(SELECT 1 FROM lifebook.follows f2 WHERE f2.followee_id=f.follower_id AND f2.follower_id=${userId}::uuid) AS followed_back,
             (SELECT count(*)::int FROM lifebook.posts p WHERE p.author_id=u.id AND p.state='active' AND p.visibility='public') AS posts,
             EXISTS(SELECT 1 FROM mobility.drivers d WHERE d.user_id=u.id AND d.status IN ('active','offline')) AS driver,
             EXISTS(SELECT 1 FROM wallet.ecomerse_sellers s WHERE s.user_id=u.id AND s.status='active') AS seller
      FROM lifebook.follows f
      JOIN mobility.users u ON u.id = f.follower_id
      WHERE f.followee_id=${userId}::uuid
      ORDER BY f.created_at DESC
      LIMIT ${limit}`;
    return rows.map((r) => ({
      at: String(r.created_at), read: !!r.read_at,
      id: r.id, fullName: r.full_name, avatarUrl: r.avatar_url, city: r.city ?? null,
      followedBack: !!r.followed_back, posts: Number(r.posts ?? 0),
      verified: { driver: !!r.driver, seller: !!r.seller },
    }));
  }

  /**
   * Recomendaciones de usuarios (regla SIMPLE y transparente, sin algoritmo
   * opaco): personas con publicaciones públicas activas que no sigo, ordenadas
   * por actividad reciente; cada una con su motivo.
   */
  async suggestedUsers(userId: string, opts: { limit?: number } = {}) {
    const limit = Math.min(Math.max(Number(opts.limit ?? 20) || 20, 1), 50);
    const rows: any[] = await this.db.$queryRaw`
      SELECT u.id, u.full_name, u.avatar_url, u.city,
             (SELECT count(*)::int FROM lifebook.posts p
               WHERE p.author_id=u.id AND p.state='active' AND p.visibility='public'
                 AND p.created_at > now() - interval '60 days') AS recent_posts,
             EXISTS(SELECT 1 FROM mobility.drivers d WHERE d.user_id=u.id AND d.status IN ('active','offline')) AS driver,
             EXISTS(SELECT 1 FROM wallet.ecomerse_sellers s WHERE s.user_id=u.id AND s.status='active') AS seller,
             EXISTS(SELECT 1 FROM wallet.food_restaurants r WHERE r.user_id=u.id AND r.status='active') AS food
      FROM mobility.users u
      WHERE u.id <> ${userId}::uuid
        AND u.status <> 'SUSPENDED'
        AND NOT EXISTS(SELECT 1 FROM lifebook.follows f WHERE f.followee_id=u.id AND f.follower_id=${userId}::uuid)
        AND NOT EXISTS(SELECT 1 FROM lifebook.blocks b
              WHERE (b.blocker_id=${userId}::uuid AND b.blocked_id=u.id)
                 OR (b.blocker_id=u.id AND b.blocked_id=${userId}::uuid))
        AND EXISTS(SELECT 1 FROM lifebook.posts p
              WHERE p.author_id=u.id AND p.state='active' AND p.visibility='public')
      ORDER BY recent_posts DESC, u.created_at DESC
      LIMIT ${limit}`;
    return rows.map((r) => ({
      id: r.id, fullName: r.full_name, avatarUrl: r.avatar_url, city: r.city ?? null,
      recentPosts: Number(r.recent_posts ?? 0),
      verified: { driver: !!r.driver, seller: !!r.seller, food: !!r.food },
      reason: r.seller ? 'Tienda verificada'
        : r.food ? 'Restaurante verificado'
          : r.driver ? 'Conductor verificado'
            : Number(r.recent_posts ?? 0) > 0 ? `Publica en ${r.city ?? 'tu ciudad'}` : 'Miembro de la comunidad',
    }));
  }

  /** Comentarios de otras personas en MIS publicaciones. */
  async commentsReceived(userId: string, opts: { limit?: number } = {}) {
    const limit = Math.min(Math.max(Number(opts.limit ?? 50) || 50, 1), 100);
    const rows: any[] = await this.db.$queryRaw`
      SELECT c.id, c.body, c.created_at, c.read_at, u.id AS actor_id, u.full_name, u.avatar_url,
             p.id AS post_id, p.type, p.title, (p.media_ids->>0) AS thumb_id
      FROM lifebook.comments c
      JOIN lifebook.posts p ON p.id = c.post_id
      JOIN mobility.users u ON u.id = c.author_id
      WHERE p.author_id=${userId}::uuid AND c.state='active' AND c.author_id <> ${userId}::uuid
      ORDER BY c.created_at DESC
      LIMIT ${limit}`;
    return rows.map((r) => ({
      id: r.id, body: r.body, at: String(r.created_at), read: !!r.read_at,
      user: { id: r.actor_id, fullName: r.full_name, avatarUrl: r.avatar_url },
      post: {
        id: r.post_id, type: r.type, title: r.title ?? null,
        preview: String(r.title ?? '').slice(0, 80),
        thumb: r.thumb_id ? { id: r.thumb_id, url: `${USER_PHOTO_BASE}/${r.thumb_id}` } : null,
      },
    }));
  }

  /** Menciones (@Nombre) que me hicieron en comentarios. */
  async mentionsReceived(userId: string, opts: { limit?: number } = {}) {
    const limit = Math.min(Math.max(Number(opts.limit ?? 50) || 50, 1), 100);
    const rows: any[] = await this.db.$queryRaw`
      SELECT m.id, m.snippet, m.read_at, m.created_at,
             u.id AS actor_id, u.full_name, u.avatar_url,
             p.id AS post_id, p.type, p.title, (p.media_ids->>0) AS thumb_id
      FROM lifebook.mentions m
      LEFT JOIN lifebook.posts p ON p.id = m.post_id
      JOIN mobility.users u ON u.id = m.actor_id
      WHERE m.user_id=${userId}::uuid
      ORDER BY m.created_at DESC
      LIMIT ${limit}`;
    return rows.map((r) => ({
      id: r.id, snippet: r.snippet ?? null, at: String(r.created_at), read: !!r.read_at,
      user: { id: r.actor_id, fullName: r.full_name, avatarUrl: r.avatar_url },
      post: r.post_id ? {
        id: r.post_id, type: r.type, title: r.title ?? null,
        preview: String(r.title ?? '').slice(0, 80),
        thumb: r.thumb_id ? { id: r.thumb_id, url: `${USER_PHOTO_BASE}/${r.thumb_id}` } : null,
      } : null,
    }));
  }

  /** Marca las menciones como leídas. */
  async markMentionsRead(userId: string) {
    await this.db.$queryRaw`
      UPDATE lifebook.mentions SET read_at = now()
      WHERE user_id=${userId}::uuid AND read_at IS NULL`;
    return { ok: true };
  }

  // =========================================================================
  // INTERACCIONES
  // =========================================================================
  async like(userId: string, postId: string, reaction = 'like') {
    const exists: any[] = await this.db.$queryRaw`SELECT 1 FROM lifebook.posts WHERE id=${postId}::uuid AND state='active'`;
    if (!exists[0]) throw new DomainError('POST_NOT_FOUND', 'Publicación no encontrada');
    const reactions = ['like', 'love', 'agree', 'thanks', 'wow', 'concern', 'fire'];
    const r = reactions.includes(reaction) ? reaction : 'like';
    await this.db.$queryRaw`
      INSERT INTO lifebook.likes (post_id, user_id, reaction)
      VALUES (${postId}::uuid, ${userId}::uuid, ${r})
      ON CONFLICT (post_id, user_id) DO UPDATE SET reaction = EXCLUDED.reaction, created_at = now()`;
    return { liked: true, reaction: r };
  }

  async unlike(userId: string, postId: string) {
    await this.db.$queryRaw`DELETE FROM lifebook.likes WHERE post_id=${postId}::uuid AND user_id=${userId}::uuid`;
    return { liked: false };
  }

  async comment(userId: string, postId: string, body: string, parentId?: string, attachPostId?: string) {
    // Antes de nada: ¿puede esta persona ver la publicación? Si no, 404 y no se
    // llega ni a mirar si los comentarios están abiertos (no se filtra nada).
    await this.assertPostVisible(postId, userId);
    const exists: any[] = await this.db.$queryRaw`
      SELECT 1 FROM lifebook.posts WHERE id=${postId}::uuid AND state='active' AND allow_comments`;
    if (!exists[0]) {
      const closed: any[] = await this.db.$queryRaw`
        SELECT 1 FROM lifebook.posts WHERE id=${postId}::uuid AND state='active' AND NOT allow_comments`;
      if (closed[0]) throw new DomainError('COMMENTS_DISABLED', 'El autor desactivó los comentarios de esta publicación');
      throw new DomainError('POST_NOT_FOUND', 'Publicación no encontrada');
    }
    const text = this.cleanText(body, 1000);
    if (!text) throw new DomainError('COMMENT_REQUIRED', 'Escribe un comentario');
    const pid: string | null = parentId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parentId) ? parentId : null;

    // Publicación adjunta (opcional): una REFERENCIA a algo que ya existe.
    //  · El id tiene que ser un uuid (si no, Postgres contesta 22P02 y sale 500).
    //  · Solo se puede adjuntar lo que uno PUEDE VER. Si no, se podría usar el
    //    comentario para sacar a la luz el título de una publicación privada.
    //  · No vale adjuntar la publicación que se está comentando: una tarjeta de sí
    //    misma no significa nada.
    //  · No se avisa a quien la escribió: si adjuntar avisara, sería un canal de
    //    spam directo (citar a cualquiera para notificarle).
    let adjunto: string | null = null;
    if (attachPostId) {
      const id = String(attachPostId).trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        throw new DomainError('POST_ID_INVALID', 'Publicación no válida');
      }
      if (id === postId) throw new DomainError('CANNOT_ATTACH_SELF', 'No puedes adjuntar la publicación que estás comentando');
      await this.assertPostVisible(id, userId);
      adjunto = id;
    }

    const row: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.comments (post_id, author_id, parent_id, body, attach_post_id)
      VALUES (${postId}::uuid, ${userId}::uuid, ${pid}::uuid, ${text}, ${adjunto}::uuid)
      RETURNING id, created_at`;
    // Menciones @Nombre (Parte 7).
    //
    // OJO, AQUÍ HABÍA UN BUG REAL: la detección buscaba el nombre completo como
    // SUBCADENA del texto, sobre toda la tabla de usuarios, **sin el '@' delante y sin
    // frontera de palabra**. Así, un comentario que dijera «quality» mencionaba a
    // cualquiera que se llamara «Ali», y no hacía falta escribir ningún '@' para
    // mencionar a alguien.
    //
    // Ahora se exige el '@' Y que después del nombre no venga letra ni número (para que
    // «@Ali» no dispare con «@Alice»). Las 21 menciones que hay en la base son del tipo
    // «@Administrador EG Route Plan …», o sea que esto NO rompe ninguna legítima.
    // La comparación se hace en JS —hoy hay 11 usuarios— porque escapar los
    // metacaracteres de un nombre dentro de un `position()` de SQL no es fiable. Si el
    // día de mañana hay miles de usuarios, lo correcto es un `@usuario` normalizado.
    if (text.includes('@')) {
      const usuarios: any[] = await this.db.$queryRaw`
        SELECT id, full_name FROM mobility.users
         WHERE id <> ${userId}::uuid AND full_name IS NOT NULL AND btrim(full_name) <> ''`;
      const mencionados: string[] = usuarios
        .filter((u) => {
          const nombre = String(u.full_name ?? '').trim();
          if (!nombre) return false;
          const escapado = nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          return new RegExp(`@${escapado}(?![\\p{L}\\p{N}])`, 'iu').test(text);
        })
        .map((u) => String(u.id));
      if (mencionados.length > 0) {
        // Huecos ($1..$n) en vez de un array: es el patrón que ya usa el resto del
        // fichero y no depende de cómo mande Prisma los arrays.
        const huecos = mencionados.map((_, i) => `$${i + 1}::uuid`).join(', ');
        await this.db.$queryRawUnsafe(
          `INSERT INTO lifebook.mentions (user_id, actor_id, post_id, comment_id, snippet)
           SELECT u.id, $${mencionados.length + 1}::uuid, $${mencionados.length + 2}::uuid,
                  $${mencionados.length + 3}::uuid, $${mencionados.length + 4}
             FROM mobility.users u
            WHERE u.id IN (${huecos})
           ON CONFLICT (comment_id, user_id) DO NOTHING`,
          ...mencionados, userId, postId, row[0]?.id, text.slice(0, 300),
        );
      }
    }
    return { id: row[0]?.id, ok: true };
  }

  /**
   * Edita un comentario (solo su autor; se marca `edited_at` para poder poner
   * «editado» en la app, como Xiaohongshu).
   */
  async commentEdit(userId: string, commentId: string, text: string) {
    const text2 = this.cleanText(text, 1000);
    if (!text2) throw new DomainError('COMMENT_REQUIRED', 'Escribe un comentario');
    const rows: any[] = await this.db.$queryRaw`
      SELECT c.author_id, c.state FROM lifebook.comments c WHERE c.id=${commentId}::uuid`;
    if (!rows[0] || rows[0].state !== 'active') throw new DomainError('COMMENT_NOT_FOUND', 'Comentario no encontrado');
    if (rows[0].author_id !== userId) throw new DomainError('NOT_COMMENT_AUTHOR', 'Solo puedes editar tus comentarios');
    const upd: any[] = await this.db.$queryRaw`
      UPDATE lifebook.comments SET body=${text2}, edited_at=now()
      WHERE id=${commentId}::uuid
      RETURNING id, body, created_at, edited_at`;
    return {
      ok: true,
      id: upd[0]?.id, body: upd[0]?.body,
      createdAt: upd[0]?.created_at ? String(upd[0].created_at) : null,
      editedAt: upd[0]?.edited_at ? String(upd[0].edited_at) : null,
    };
  }

  /**
   * Elimina un comentario: su autor, el autor de la publicación o un moderador
   * (ADMIN). Si tiene respuestas, se van con él (mismo `state`).
   */
  async commentDelete(userId: string, commentId: string, actorRole = 'PASSENGER') {
    const rows: any[] = await this.db.$queryRaw`
      SELECT c.id, c.author_id, c.post_id, c.state, p.author_id AS post_author
      FROM lifebook.comments c JOIN lifebook.posts p ON p.id = c.post_id
      WHERE c.id=${commentId}::uuid`;
    if (!rows[0] || rows[0].state !== 'active') throw new DomainError('COMMENT_NOT_FOUND', 'Comentario no encontrado');
    const mine = rows[0].author_id === userId;
    const postMine = rows[0].post_author === userId;
    if (!mine && !postMine && actorRole !== 'ADMIN') {
      throw new DomainError('COMMENT_FORBIDDEN', 'No puedes eliminar este comentario');
    }
    await this.db.$queryRaw`
      UPDATE lifebook.comments SET state='removed'
      WHERE id=${commentId}::uuid OR parent_id=${commentId}::uuid`;
    const left: any[] = await this.db.$queryRaw`
      SELECT count(*)::int AS n FROM lifebook.comments
      WHERE post_id=${rows[0].post_id}::uuid AND state='active' AND parent_id IS NULL`;
    return { ok: true, removed: true, commentsLeft: Number(left[0]?.n ?? 0) };
  }

  /**
   * Respuestas de un comentario (Parte 23): cada una dice a quién responde, para
   * que la app pueda pintar «→ @Nombre» y no se pierda el hilo.
   */
  async commentReplies(commentId: string, viewerId?: string, limit = 50) {
    const vid = viewerId || '00000000-0000-0000-0000-000000000000';
    const parent: any[] = await this.db.$queryRaw`
      SELECT c.id, c.author_id, c.post_id, u.full_name AS author_name
      FROM lifebook.comments c JOIN mobility.users u ON u.id = c.author_id
      WHERE c.id=${commentId}::uuid AND c.state='active' LIMIT 1`;
    if (!parent[0]) throw new DomainError('COMMENT_NOT_FOUND', 'Comentario no encontrado');
    // Las respuestas tampoco se leen si no se ve la publicación.
    await this.assertPostVisible(parent[0].post_id, viewerId);
    const cap = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const rows: any[] = await this.db.$queryRawUnsafe(`
      SELECT c.id, c.post_id, c.body, c.created_at, c.edited_at, c.parent_id, c.attach_post_id,
             u.id AS author_id, u.full_name, u.avatar_url, u.role,
             (SELECT count(*)::int FROM lifebook.comment_likes cl WHERE cl.comment_id = c.id) AS likes,
             EXISTS(SELECT 1 FROM lifebook.comment_likes cl2 WHERE cl2.comment_id = c.id AND cl2.user_id = $2::uuid) AS liked_by_me
      FROM lifebook.comments c
      JOIN mobility.users u ON u.id = c.author_id
      WHERE c.parent_id = $1::uuid AND c.state = 'active'
      ORDER BY c.created_at ASC
      LIMIT ${cap}`, commentId, vid);
    const tarjetas = await this.attachmentsFor(rows, viewerId);
    return {
      parentId: commentId,
      replyTo: { id: parent[0].author_id, fullName: parent[0].author_name },
      total: rows.length,
      replies: rows.map((r) => this.serializeComment(r, parent[0].author_name, tarjetas.get(r.attach_post_id) ?? null)),
    };
  }

  /** Forma común de un comentario (lista, respuestas y creación). */
  /**
   * Resuelve, EN UNA SOLA CONSULTA, las publicaciones adjuntas de una página de
   * comentarios. Devuelve un mapa `id -> tarjeta`.
   *
   * FILTRA POR QUIEN MIRA: si el visor no puede ver la publicación adjunta, no
   * devuelve nada para ese id, así que el comentario se ve como texto y **no se
   * filtra ni el título**. Son las mismas reglas que `assertPostVisible`.
   */
  // =========================================================================
  // SEGUIR VIENDO (progreso de reproducción)
  // =========================================================================

  /**
   * Guarda por dónde va una persona en un vídeo. Idempotente y con los valores
   * acotados: un cliente no puede meter una posición negativa, ni mayor que la
   * duración, ni una duración absurda.
   */
  async guardarProgreso(userId: string, postId: string, positionSec: unknown, durationSec: unknown) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(postId ?? '').trim())) {
      throw new DomainError('POST_ID_INVALID', 'Publicación no válida');
    }
    // Solo se guarda progreso de algo que esa persona PUEDE ver (si no, se podría
    // escribir en el historial de un vídeo privado ajeno).
    await this.assertPostVisible(postId, userId);
    const dur = Math.max(0, Math.min(Math.floor(Number(durationSec) || 0), 24 * 3600));
    const techo = dur > 0 ? dur : 24 * 3600;
    const pos = Math.max(0, Math.min(Math.floor(Number(positionSec) || 0), techo));
    await this.db.$queryRaw`
      INSERT INTO lifebook.watch_progress (user_id, post_id, position_sec, duration_sec, updated_at)
      VALUES (${userId}::uuid, ${postId}::uuid, ${pos}, ${dur}, now())
      ON CONFLICT (user_id, post_id)
      DO UPDATE SET position_sec = EXCLUDED.position_sec,
                    duration_sec = EXCLUDED.duration_sec,
                    updated_at = now()`;
    return { ok: true, positionSec: pos, durationSec: dur };
  }

  /** Por dónde iba. Sin fila devuelve ceros: el vídeo empieza del principio. */
  async progreso(userId: string, postId: string) {
    const rows: any[] = await this.db.$queryRaw`
      SELECT position_sec, duration_sec, updated_at
        FROM lifebook.watch_progress
       WHERE user_id = ${userId}::uuid AND post_id = ${postId}::uuid`;
    const r = rows[0];
    return {
      positionSec: Number(r?.position_sec ?? 0),
      durationSec: Number(r?.duration_sec ?? 0),
      updatedAt: r?.updated_at ? String(r.updated_at) : null,
    };
  }

  /** Olvida el progreso de un vídeo (para quitarlo de la lista a mano). */
  async borrarProgreso(userId: string, postId: string) {
    await this.db.$queryRaw`
      DELETE FROM lifebook.watch_progress
       WHERE user_id = ${userId}::uuid AND post_id = ${postId}::uuid`;
    return { ok: true };
  }

  /**
   * A QUIÉN SIGO — la fila de avatares de la pestaña «Seguidos» (el módulo de
   * Xiaohongshu que pidió el dueño).
   *
   * POR QUÉ HUBO QUE AÑADIRLO: no existía. Había seguir/dejar de seguir y
   * `me/new-followers`, que es «quién me sigue A MÍ» —justo lo contrario—, así que la
   * app no tenía forma de pintar la fila de gente a la que sigues.
   *
   * Se devuelve también la fecha de su última publicación para poder ORDENAR POR
   * ACTIVIDAD (quien publicó hace poco, primero). El **anillo de «tiene novedad»** de
   * Xiaohongshu NO se puede hacer con esto: eso exige estado por (usuario, autor) que
   * no existe en ninguna tabla; ordenar por actividad es lo más parecido que se puede
   * hacer sin inventarse datos.
   */
  async aQuienSigo(userId: string, opts: { limit?: number } = {}) {
    const limit = Math.min(Math.max(Number(opts?.limit ?? 20) || 20, 1), 50);
    const rows: any[] = await this.db.$queryRaw`
      SELECT u.id, u.full_name, u.avatar_url, u.city,
             ult.creado AS ultimo
        FROM lifebook.follows f
        JOIN mobility.users u ON u.id = f.followee_id
        LEFT JOIN LATERAL (
          SELECT max(p.created_at) AS creado
            FROM lifebook.posts p
           WHERE p.author_id = u.id AND p.state = 'active' AND p.visibility = 'public'
        ) ult ON true
       WHERE f.follower_id = ${userId}::uuid
       ORDER BY ult.creado DESC NULLS LAST, f.created_at DESC
       LIMIT ${limit}::int`;
    return rows.map((r) => ({
      id: r.id,
      fullName: r.full_name ?? null,
      avatarUrl: r.avatar_url ?? null,
      city: r.city ?? null,
      /** Cuándo publicó por última vez (null = nunca o solo cosas no públicas). */
      lastPostAt: r.ultimo ? String(r.ultimo) : null,
    }));
  }

  /**
   * Los vídeos que dejé A MEDIAS, del más reciente al más antiguo, para la fila
   * «Seguir viendo».
   *
   * Filtra lo que ya no se puede ver con las MISMAS reglas que los adjuntos y el
   * detalle: si el vídeo se borró, se hizo privado o hay bloqueo entre los dos, no se
   * ofrece (mejor no ofrecer nada que ofrecer algo que va a dar 404).
   */
  async seguirViendo(userId: string, opts: { limit?: number } = {}) {
    const limit = Math.min(Math.max(Number(opts?.limit ?? 12) || 12, 1), 50);
    const rows: any[] = await this.db.$queryRaw`
      SELECT w.post_id, w.position_sec, w.duration_sec, w.updated_at,
             p.title, p.type, p.body, p.media_ids,
             p.payload->>'coverUrl' AS cover_url,
             u.id AS author_id, u.full_name, u.avatar_url
        FROM lifebook.watch_progress w
        JOIN lifebook.posts p ON p.id = w.post_id
        JOIN mobility.users u ON u.id = p.author_id
       WHERE w.user_id = ${userId}::uuid
         AND p.state = 'active'
         AND w.position_sec >= ${VISTO_MIN_SEGUNDOS}
         AND (w.duration_sec <= 0 OR w.position_sec < w.duration_sec * ${VISTO_FRACCION_FINAL}::float8)
         AND (p.visibility = 'public' OR p.author_id = ${userId}::uuid)
         AND NOT EXISTS (SELECT 1 FROM lifebook.blocks bb
                          WHERE (bb.blocker_id = p.author_id AND bb.blocked_id = ${userId}::uuid)
                             OR (bb.blocker_id = ${userId}::uuid AND bb.blocked_id = p.author_id))
         AND (p.visibility <> 'followers'
              OR EXISTS (SELECT 1 FROM lifebook.follows f
                          WHERE f.followee_id = p.author_id AND f.follower_id = ${userId}::uuid))
       ORDER BY w.updated_at DESC
       LIMIT ${limit}::int`;
    return rows.map((r) => this.refVideo(r));
  }

  /** Tarjeta de un vídeo para «seguir viendo» (misma forma que la de los adjuntos). */
  private refVideo(r: any) {
    const media: string[] = Array.isArray(r.media_ids) ? r.media_ids : [];
    const url = this.isHttpUrl(r.cover_url) ? String(r.cover_url) : (media[0] ? `${USER_PHOTO_BASE}/${media[0]}` : null);
    return {
      id: r.post_id,
      type: r.type ?? 'video',
      title: r.title ?? null,
      preview: String(r.title ?? r.body ?? '').slice(0, 80),
      thumb: url ? { id: media[0] ?? null, url } : null,
      author: { id: r.author_id, fullName: r.full_name ?? null, avatarUrl: r.avatar_url ?? null },
      positionSec: Number(r.position_sec ?? 0),
      durationSec: Number(r.duration_sec ?? 0),
      /** Por dónde iba, en porcentaje (0-100), para la barrita de la tarjeta. */
      percent: Number(r.duration_sec) > 0
        ? Math.min(100, Math.max(0, Math.round((Number(r.position_sec) / Number(r.duration_sec)) * 100)))
        : 0,
      updatedAt: r.updated_at ? String(r.updated_at) : null,
    };
  }

  /** La ciudad de quien mira: es la que usa la publicidad para segmentar. */
  private async ciudadDe(userId?: string | null): Promise<string | null> {
    if (!userId) return null;
    const rows: any[] = await this.db.$queryRaw`
      SELECT city FROM mobility.users WHERE id=${userId}::uuid`;
    return rows[0]?.city ?? null;
  }

  private async attachmentsFor(rows: any[], viewerId?: string | null): Promise<Map<string, any>> {
    const salida = new Map<string, any>();
    const ids = Array.from(new Set(rows.map((r) => r?.attach_post_id).filter((x) => !!x)));
    if (ids.length === 0) return salida;
    const vid = viewerId || '00000000-0000-0000-0000-000000000000';
    // Un hueco por id ($1..$n) y el visor al final: nada de construir SQL con datos.
    const huecos = ids.map((_, i) => `$${i + 1}::uuid`).join(', ');
    const posts: any[] = await this.db.$queryRawUnsafe(
      `SELECT p.id, p.type, p.title, p.body, p.author_id, p.media_ids,
              p.payload->>'coverUrl' AS cover_url, p.payload->>'priceXaf' AS price_xaf,
              u.full_name, u.avatar_url
         FROM lifebook.posts p
         JOIN mobility.users u ON u.id = p.author_id
        WHERE p.id IN (${huecos})
          AND p.state = 'active'
          AND (p.visibility = 'public' OR p.author_id = $${ids.length + 1}::uuid)
          AND NOT EXISTS (SELECT 1 FROM lifebook.blocks bb
                           WHERE (bb.blocker_id = p.author_id AND bb.blocked_id = $${ids.length + 1}::uuid)
                              OR (bb.blocker_id = $${ids.length + 1}::uuid AND bb.blocked_id = p.author_id))
          AND (p.visibility <> 'followers'
               OR EXISTS (SELECT 1 FROM lifebook.follows f
                           WHERE f.followee_id = p.author_id AND f.follower_id = $${ids.length + 1}::uuid))`,
      ...ids, vid,
    );
    for (const p of posts) {
      // Miniatura: la portada del payload (vídeos, series, podcasts) o la primera
      // foto subida (notas y ventas) — lo mismo que usan el feed y la bandeja.
      const media: string[] = Array.isArray(p.media_ids) ? p.media_ids : [];
      const url = this.isHttpUrl(p.cover_url) ? String(p.cover_url) : (media[0] ? `${USER_PHOTO_BASE}/${media[0]}` : null);
      salida.set(p.id, {
        id: p.id,
        type: p.type,
        title: p.title ?? null,
        preview: String(p.title ?? p.body ?? '').slice(0, 80),
        thumb: url ? { id: media[0] ?? null, url } : null,
        ...(Number(p.price_xaf) > 0 ? { priceXaf: Number(p.price_xaf) } : {}),
        author: { id: p.author_id, fullName: p.full_name ?? null, avatarUrl: p.avatar_url ?? null },
      });
    }
    return salida;
  }

  private serializeComment(r: any, replyToName?: string | null, ref?: any | null) {
    return {
      id: r.id,
      postId: r.post_id,
      parentId: r.parent_id ?? null,
      body: r.body,
      createdAt: r.created_at ? String(r.created_at) : null,
      editedAt: r.edited_at ? String(r.edited_at) : null,
      likes: Number(r.likes ?? 0),
      likedByMe: !!r.liked_by_me,
      repliesCount: Number(r.replies_count ?? 0),
      author: { id: r.author_id, fullName: r.full_name, avatarUrl: r.avatar_url, role: r.role },
      /**
       * Publicación que lleva dentro (referencia, no copia). `null` = sin adjunto
       * o el original ya no está (o quien mira no puede verlo: en ese caso tampoco
       * se manda el título, para no filtrar nada).
       */
      ref: ref ?? null,
      /** En respuestas: a quién contesta. */
      ...(replyToName ? { replyToName } : {}),
    };
  }

  /** Activa/desactiva comentarios (solo el autor o ADMIN). */
  async setCommentsEnabled(actorId: string, actorRole: string, postId: string, enabled: boolean) {
    const p: any[] = await this.db.$queryRaw`
      SELECT author_id FROM lifebook.posts WHERE id=${postId}::uuid`;
    if (!p[0]) throw new DomainError('POST_NOT_FOUND', 'Publicación no encontrada');
    if (p[0].author_id !== actorId && actorRole !== 'ADMIN') {
      throw new DomainError('NOT_POST_AUTHOR', 'Solo el autor puede cambiar esta opción');
    }
    await this.db.$queryRaw`
      UPDATE lifebook.posts SET allow_comments=${enabled}, updated_at=now()
      WHERE id=${postId}::uuid`;
    return { ok: true, allowComments: enabled };
  }

  async comments(postId: string, viewerId?: string) {
    await this.assertPostVisible(postId, viewerId);
    const vid = viewerId || '00000000-0000-0000-0000-000000000000';
    const rows: any[] = await this.db.$queryRaw`
      SELECT c.id, c.post_id, c.author_id, c.body, c.created_at, c.edited_at, c.attach_post_id,
             (SELECT count(*)::int FROM lifebook.comment_likes cl WHERE cl.comment_id = c.id) AS likes,
             EXISTS(SELECT 1 FROM lifebook.comment_likes cl2 WHERE cl2.comment_id = c.id AND cl2.user_id = ${vid}::uuid) AS liked_by_me,
             (SELECT count(*)::int FROM lifebook.comments r WHERE r.parent_id = c.id AND r.state='active') AS replies_count,
             u.full_name, u.avatar_url, u.role
      FROM lifebook.comments c
      JOIN mobility.users u ON u.id = c.author_id
      WHERE c.post_id = ${postId}::uuid AND c.state = 'active' AND c.parent_id IS NULL
      ORDER BY c.created_at ASC LIMIT 100`;
    const tarjetas = await this.attachmentsFor(rows, viewerId);
    return rows.map((r) => this.serializeComment(r, null, tarjetas.get(r.attach_post_id) ?? null));
  }

  // =========================================================================
  // PARTE 12 — CONTRATO LITERAL DEL CLIENTE (alias de rutas y formas)
  // =========================================================================

  /**
   * `POST /posts/:id/comments { text }` → crea el comentario y devuelve el
   * comentario ya formado (el cliente lo pinta sin volver a consultar).
   */
  async commentAsObject(userId: string, postId: string, text: string, parentId?: string, attachPostId?: string) {
    const body = this.cleanText(text, 1000);
    const res = await this.comment(userId, postId, text, parentId, attachPostId);
    const meta: any[] = await this.db.$queryRawUnsafe(
      `SELECT c.created_at, u.full_name, u.avatar_url, u.role
       FROM lifebook.comments c JOIN mobility.users u ON u.id = c.author_id
       WHERE c.id = $1::uuid`, res.id);
    const m = meta[0] ?? {};
    // La tarjeta del adjunto, resuelta con las mismas reglas que en las lecturas
    // (si no se puede ver, va null: nunca se filtra el título).
    const refs = await this.attachmentsFor([{ attach_post_id: attachPostId ?? null }], userId);
    const ref = attachPostId ? (refs.get(attachPostId) ?? null) : null;
    return {
      id: res.id,
      postId,
      /** Parte 23: si es respuesta, a qué comentario contesta. */
      parentId: parentId ?? null,
      ref,
      body,
      likes: 0,
      likedByMe: false,
      repliesCount: 0,
      editedAt: null as string | null,
      createdAt: m.created_at ? String(m.created_at) : new Date().toISOString(),
      author: { id: userId, fullName: m.full_name ?? null, avatarUrl: m.avatar_url ?? null, role: m.role ?? null },
    };
  }

  /**
   * `GET /posts/:id/comments?limit=&cursor=` → `{ comments, nextCursor, total }`
   * con paginación por `created_at` (los comentarios van del más antiguo al más
   * nuevo, como en la pantalla). Sin parámetros se sigue devolviendo el array.
   */
  async commentsPage(postId: string, opts: { limit?: number; cursor?: string; viewerId?: string } = {}) {
    const vis = await this.assertPostVisible(postId, opts.viewerId);
    const limit = Math.min(Math.max(Number(opts.limit ?? 20) || 20, 1), 50);
    const vid = opts.viewerId || '00000000-0000-0000-0000-000000000000';
    const args: unknown[] = [postId];
    let cursorCond = '';
    if (opts.cursor) {
      // El cursor debe ser una fecha válida (si no, Postgres fallaría con 500).
      // Se pasa TAL CUAL para no perder los microsegundos: `new Date()` los trunca
      // a milisegundos y volvería a traer la última fila de la página anterior.
      const raw = String(opts.cursor).trim();
      if (Number.isNaN(Date.parse(raw))) throw new DomainError('CURSOR_INVALID', 'Cursor de paginación no válido');
      args.push(raw);
      cursorCond = ` AND c.created_at > $${args.length}::timestamptz`;
    }
    args.push(vid);
    const vidIdx = args.length;
    args.push(limit + 1);
    const rows: any[] = await this.db.$queryRawUnsafe(`
      SELECT c.id, c.post_id, c.author_id, c.body, c.created_at, c.edited_at, c.attach_post_id,
             to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_cursor,
             (SELECT count(*)::int FROM lifebook.comment_likes cl WHERE cl.comment_id = c.id) AS likes,
             EXISTS(SELECT 1 FROM lifebook.comment_likes cl2 WHERE cl2.comment_id = c.id AND cl2.user_id = $${vidIdx}::uuid) AS liked_by_me,
             (SELECT count(*)::int FROM lifebook.comments r WHERE r.parent_id = c.id AND r.state='active') AS replies_count,
             u.full_name, u.avatar_url, u.role
      FROM lifebook.comments c
      JOIN mobility.users u ON u.id = c.author_id
      WHERE c.post_id = $1::uuid AND c.state = 'active' AND c.parent_id IS NULL${cursorCond}
      ORDER BY c.created_at ASC
      LIMIT $${args.length}`, ...args);
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    const total: any[] = await this.db.$queryRaw`
      SELECT count(*)::int AS n FROM lifebook.comments
      WHERE post_id=${postId}::uuid AND state='active' AND parent_id IS NULL`;
    const tarjetas = await this.attachmentsFor(page, opts.viewerId);
    const cuantos = Number(total[0]?.n ?? 0);

    // ---- PUBLICIDAD DENTRO DE LOS COMENTARIOS (lo de WeChat) -------------------
    // Va en un campo APARTE (`ad`), no como un comentario más: si fuera una fila de
    // `lifebook.comments` ensuciaría el contador, la paginación por cursor y los
    // avisos. Y solo cuando tiene sentido:
    //   · en la PRIMERA página (al paginar reaparecería en cada página),
    //   · con conversación de verdad (>= ANUNCIO_MIN_COMENTARIOS): en un hilo de dos
    //     líneas un anuncio ocupa un tercio de la pantalla,
    //   · nunca para el AUTOR de la publicación (no se le anuncia en su propia casa),
    //   · nunca si el autor cerró los comentarios,
    //   · segmentado por la CIUDAD de quien mira.
    // `total` sigue siendo el número de comentarios: el anuncio no cuenta.
    let ad: unknown = null;
    if (!opts.cursor
        && cuantos >= ANUNCIO_MIN_COMENTARIOS
        && vis.author_id !== opts.viewerId
        && vis.allow_comments) {
      ad = await this.ads.paraComentarios(await this.ciudadDe(opts.viewerId));
    }

    return {
      comments: page.map((r) => ({
        ...this.serializeComment(r, null, tarjetas.get(r.attach_post_id) ?? null),
        createdAt: String(r.created_at),
      })),
      nextCursor: hasMore && page.length ? String(page[page.length - 1].created_cursor) : null,
      total: cuantos,
      ad,
    };
  }

  // =========================================================================
  // PARTE 14 — «ME GUSTA» EN COMENTARIOS
  // =========================================================================

  /** Da me gusta a un comentario activo (idempotente). */
  async commentLike(userId: string, commentId: string) {
    await this.assertCommentVisible(commentId, userId);
    await this.db.$queryRaw`
      INSERT INTO lifebook.comment_likes (comment_id, user_id)
      VALUES (${commentId}::uuid, ${userId}::uuid)
      ON CONFLICT (comment_id, user_id) DO NOTHING`;
    return { liked: true };
  }

  /** Quita el me gusta (idempotente). */
  async commentUnlike(userId: string, commentId: string) {
    // Antes borraba sin comprobar NADA (ni que el comentario existiera). Ahora,
    // como el me gusta, exige que la publicación se pueda ver.
    await this.assertCommentVisible(commentId, userId);
    await this.db.$queryRaw`
      DELETE FROM lifebook.comment_likes
      WHERE comment_id=${commentId}::uuid AND user_id=${userId}::uuid`;
    return { liked: false };
  }

  async follow(userId: string, targetUserId: string) {
    if (userId === targetUserId) throw new DomainError('CANNOT_FOLLOW_SELF', 'No puedes seguirte a ti mismo');
    await this.assertNotBlocked(userId, targetUserId, 'No puedes seguir a este usuario');
    await this.db.$queryRaw`
      INSERT INTO lifebook.follows (followee_id, follower_id)
      VALUES (${targetUserId}::uuid, ${userId}::uuid)
      ON CONFLICT DO NOTHING`;
    return { following: true };
  }

  async unfollow(userId: string, targetUserId: string) {
    await this.db.$queryRaw`DELETE FROM lifebook.follows WHERE followee_id=${targetUserId}::uuid AND follower_id=${userId}::uuid`;
    return { following: false };
  }

  async bookmark(userId: string, postId: string) {
    const exists: any[] = await this.db.$queryRaw`SELECT 1 FROM lifebook.posts WHERE id=${postId}::uuid AND state='active'`;
    if (!exists[0]) throw new DomainError('POST_NOT_FOUND', 'Publicación no encontrada');
    await this.db.$queryRaw`
      INSERT INTO lifebook.bookmarks (post_id, user_id)
      VALUES (${postId}::uuid, ${userId}::uuid) ON CONFLICT DO NOTHING`;
    return { bookmarked: true };
  }

  async unbookmark(userId: string, postId: string) {
    await this.db.$queryRaw`DELETE FROM lifebook.bookmarks WHERE post_id=${postId}::uuid AND user_id=${userId}::uuid`;
    return { bookmarked: false };
  }

  // =========================================================================
  // MODERACIÓN (reporte → cola)
  // =========================================================================
  async report(reporterId: string, contentId: string, contentType: string, reason: string, note?: string) {
    if (!['post', 'comment'].includes(contentType)) throw new DomainError('CONTENT_TYPE_INVALID', 'Tipo de contenido no válido');
    if (!(REPORT_REASONS as readonly string[]).includes(reason)) throw new DomainError('REASON_INVALID', 'Motivo no válido');
    let ownerRow: any[];
    if (contentType === 'post') {
      ownerRow = await this.db.$queryRaw`
        SELECT author_id FROM lifebook.posts WHERE id=${contentId}::uuid`;
    } else {
      ownerRow = await this.db.$queryRaw`
        SELECT author_id FROM lifebook.comments WHERE id=${contentId}::uuid`;
    }
    if (!ownerRow[0]) throw new DomainError('CONTENT_NOT_FOUND', 'Contenido no encontrado');
    if (ownerRow[0].author_id === reporterId) throw new DomainError('CANNOT_REPORT_SELF', 'No puedes reportar tu propio contenido');
    const dup: any[] = await this.db.$queryRaw`
      SELECT 1 FROM lifebook.reports WHERE content_id=${contentId}::uuid AND reporter_id=${reporterId}::uuid`;
    if (dup[0]) throw new DomainError('ALREADY_REPORTED', 'Ya reportaste este contenido');
    await this.db.$queryRaw`
      INSERT INTO lifebook.reports (content_id, content_type, reporter_id, reason, note)
      VALUES (${contentId}::uuid, ${contentType}, ${reporterId}::uuid, ${reason}, ${String(note ?? '').slice(0, 300) || null})`;
    const counts: any[] = await this.db.$queryRaw`
      SELECT count(*)::int AS total FROM lifebook.reports
      WHERE content_id=${contentId}::uuid AND created_at > now() - interval '1 hour'`;
    const quarantine = (counts[0]?.total ?? 0) >= 5;
    if (quarantine && contentType === 'post') {
      await this.db.$queryRaw`
        UPDATE lifebook.posts SET state='quarantined', updated_at=now()
        WHERE id=${contentId}::uuid AND state='active'`;
    }
    return { ok: true, quarantined: quarantine };
  }

  /** Cola admin (básica): reportes abiertos. */
  async adminReports(opts: { state?: string; reason?: string; limit?: number }) {
    const limit = Math.min(Math.max(Number(opts.limit ?? 30) || 30, 1), 100);
    const conds: string[] = [];
    const args: unknown[] = [];
    if (opts.state) { args.push(opts.state); conds.push(`r.state = $${args.length}`); }
    if (opts.reason) { args.push(opts.reason); conds.push(`r.reason = $${args.length}`); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    args.push(limit);
    const rows: any[] = await this.db.$queryRawUnsafe(`
      SELECT r.id, r.content_id, r.content_type, r.reason, r.note, r.state, r.created_at,
             u.full_name AS reporter, p.author_id, p.title, p.body, p.city
      FROM lifebook.reports r
      JOIN mobility.users u ON u.id = r.reporter_id
      JOIN lifebook.posts p ON p.id = r.content_id
      ${where}
      ORDER BY r.created_at DESC LIMIT $${args.length}`, ...args);
    return rows;
  }

  // =========================================================================
  // HELPERS
  // =========================================================================
  private async assertCanPost(userId: string) {
    const u: any[] = await this.db.$queryRaw`
      SELECT status, status_prefs->>'publish_banned_until' AS banned
      FROM mobility.users WHERE id=${userId}::uuid`;
    if (!u[0]) throw new DomainError('USER_NOT_FOUND', 'Usuario no encontrado');
    if (u[0].status === 'SUSPENDED') throw new DomainError('ACCOUNT_SUSPENDED', 'Tu cuenta está suspendida');
    const banned = u[0].banned ? new Date(String(u[0].banned)) : null;
    if (banned && banned > new Date()) throw new DomainError('PUBLISH_SUSPENDED', 'No puedes publicar hasta el ' + banned.toISOString().slice(0, 10));
  }

  private async invalidateFeed(city: string) {
    if (!this.redisOk || !this.redis) return;
    try {
      await this.redis.del(`lb:feed:city:${city.toLowerCase()}`);
    } catch { /* noop */ }
  }

  /** Parte 11: enlace de servicio con la ruta de la app ya resuelta. */
  private serviceLinkOut(link: any) {
    if (!link || typeof link !== 'object') return null;
    const type = String(link.type ?? '');
    return { type, id: link.id ?? null, route: SERVICE_LINK_ROUTES[type] ?? null };
  }

  // =========================================================================
  // PARTE 17 (G1) — GRUPOS + AJUSTES DEL CHAT (no molestar · fijar · fondo ·
  // borrar historial · reclamación · buscar en el historial)
  // =========================================================================

  /**
   * Normaliza los metadatos del grupo (Partes 20–21): **sin listas cerradas** —
   * ciudad, barrio y categoría son texto libre; visibilidad y condición de
   * ingreso caen a su valor por defecto si llega algo raro (no dan error).
   * Solo devuelve las claves que llegan, para no pisar las demás al editar.
   */
  private groupMeta(dto: {
    city?: string; barrio?: string; category?: string;
    description?: string; visibility?: string;
    placeName?: string; placeAddress?: string; placeLon?: number; placeLat?: number; hidePlace?: boolean;
    joinMode?: string; joinQuestion?: string; joinAnswer?: string;
  }) {
    const out: {
      city?: string | null; barrio?: string | null; category?: string | null;
      description?: string | null; visibility?: string;
      place_name?: string | null; place_address?: string | null;
      place_lon?: number | null; place_lat?: number | null; hide_place?: boolean;
      join_mode?: string; join_question?: string | null; join_answer?: string | null;
    } = {};
    if (dto.city !== undefined) out.city = this.cleanText(dto.city, 40) || null;
    if (dto.barrio !== undefined) out.barrio = this.cleanText(dto.barrio, 60) || null;
    if (dto.category !== undefined) out.category = this.cleanText(dto.category, 30) || null;
    if (dto.description !== undefined) out.description = this.cleanText(dto.description, 200) || null;
    if (dto.visibility !== undefined) {
      out.visibility = (GROUP_VISIBILITIES as readonly string[]).includes(String(dto.visibility ?? ''))
        ? String(dto.visibility)
        : 'private';
    }
    // ── Parte 21: punto de encuentro ──
    if (dto.placeName !== undefined) out.place_name = this.cleanText(dto.placeName, 120) || null;
    if (dto.placeAddress !== undefined) out.place_address = this.cleanText(dto.placeAddress, 160) || null;
    if (dto.placeLon !== undefined) out.place_lon = this.coord(dto.placeLon, -180, 180);
    if (dto.placeLat !== undefined) out.place_lat = this.coord(dto.placeLat, -90, 90);
    if (dto.hidePlace !== undefined) out.hide_place = !!dto.hidePlace;
    // ── Parte 21: condición de ingreso ──
    if (dto.joinMode !== undefined) {
      out.join_mode = (GROUP_JOIN_MODES as readonly string[]).includes(String(dto.joinMode ?? ''))
        ? String(dto.joinMode)
        : 'open';
    }
    if (dto.joinQuestion !== undefined) out.join_question = this.cleanText(dto.joinQuestion, 160) || null;
    if (dto.joinAnswer !== undefined) out.join_answer = this.cleanText(dto.joinAnswer, 80) || null;
    return out;
  }

  /** Coordenada válida o `null` (nunca rompe por una coordenada rara). */
  private coord(value: unknown, min: number, max: number): number | null {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min || n > max) return null;
    return n;
  }

  /** Con la pregunta activada, hacen falta pregunta y respuesta. */
  private assertJoinMeta(meta: { join_mode?: string; join_question?: string | null; join_answer?: string | null }) {
    if (meta.join_mode !== 'question') return;
    if (!meta.join_question || !meta.join_answer) {
      throw new DomainError('GROUP_META_INVALID', 'La pregunta de ingreso necesita pregunta y respuesta');
    }
  }

  /** Crea un grupo (máx. 200 miembros). El creador es `owner`. */
  async groupCreate(userId: string, dto: {
    title?: string; memberIds?: string[]; photoUrl?: string;
    city?: string; barrio?: string; category?: string;
    description?: string; visibility?: string; allowedKinds?: string[];
  }) {
    const title = this.cleanText(dto.title, 90);
    if (title.length < 3) throw new DomainError('GROUP_TITLE_REQUIRED', 'El grupo necesita un nombre (3-90)');

    const ids = Array.from(new Set((dto.memberIds ?? []).map(String)
      .filter((m) => /^[0-9a-f-]{36}$/i.test(m) && m !== userId))).slice(0, 199);
    if (ids.length === 0) throw new DomainError('GROUP_MEMBERS_REQUIRED', 'Elige al menos a una persona');

    const valid: any[] = await this.db.$queryRawUnsafe(
      `SELECT id FROM mobility.users WHERE id = ANY($1::uuid[]) AND status <> 'SUSPENDED'`, ids);
    if (valid.length === 0) throw new DomainError('GROUP_MEMBERS_REQUIRED', 'Ninguno de los elegidos es válido');

    const photoId = this.isHttpUrl(dto.photoUrl) ? String(dto.photoUrl).split('/').pop() : null;

    // ── Metadatos (fase Xiaohongshu) ──
    const meta = this.groupMeta(dto);
    const city = meta.city ?? null;
    const barrio = meta.barrio ?? null;
    const category = meta.category ?? null;
    const description = meta.description ?? null;
    const visibility = meta.visibility ?? 'private';
    // Parte 21: punto de encuentro y condición de ingreso.
    this.assertJoinMeta(meta);
    const placeName = meta.place_name ?? null;
    const placeAddress = meta.place_address ?? null;
    const placeLon = meta.place_lon ?? null;
    const placeLat = meta.place_lat ?? null;
    const hidePlace = meta.hide_place ?? false;
    const joinMode = meta.join_mode ?? 'open';
    const joinQuestion = meta.join_question ?? null;
    const joinAnswer = meta.join_answer ?? null;

    // Permisos: aprovechamos el jsonb existente + funciones de grupo.
    const allowedKinds = Array.isArray(dto.allowedKinds) && dto.allowedKinds.length
      ? dto.allowedKinds.filter((k) => DEFAULT_KINDS.includes(k))
      : DEFAULT_KINDS;

    const row: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.conversations
        (kind, title, photo_id, owner_id, allowed_kinds, city, barrio, category, description, visibility,
         place_name, place_address, place_lon, place_lat, hide_place, join_mode, join_question, join_answer)
      VALUES
        ('group', ${title}, ${photoId}::uuid, ${userId}::uuid,
         ${JSON.stringify(allowedKinds)}::jsonb,
         ${city}, ${barrio}, ${category}, ${description}, ${visibility},
         ${placeName}, ${placeAddress}, ${placeLon}, ${placeLat}, ${hidePlace},
         ${joinMode}, ${joinQuestion}, ${joinAnswer})
      RETURNING id, created_at`;
    const convId = row[0]?.id;
    await this.db.$queryRaw`
      INSERT INTO lifebook.group_members (conversation_id, user_id, role)
      VALUES (${convId}::uuid, ${userId}::uuid, 'owner')`;
    for (const id of valid.map((v) => v.id)) {
      await this.db.$queryRaw`
        INSERT INTO lifebook.group_members (conversation_id, user_id, role)
        VALUES (${convId}::uuid, ${id}::uuid, 'member') ON CONFLICT DO NOTHING`;
    }
    const sys = `${this.cleanText(dto.title, 90)} creado · ${valid.length + 1} miembros`;
    await this.db.$queryRaw`
      UPDATE lifebook.conversations SET last_message=${sys.slice(0, 300)}, last_message_at=now()
      WHERE id=${convId}::uuid`;
    return this.groupDetails(userId, convId);
  }

  /** Detalle del grupo (miembros, rol, componentes permitidos). */
  async groupDetails(userId: string, convId: string) {
    const conv = await this.assertConvMember(userId, convId);
    if (conv.kind !== 'group') throw new DomainError('GROUP_NOT_FOUND', 'Este chat no es un grupo');
    const members: any[] = await this.db.$queryRaw`
      SELECT gm.user_id, gm.role, gm.joined_at, gm.muted, gm.pinned,
             u.full_name, u.avatar_url,
             EXISTS(SELECT 1 FROM lifebook.follows f WHERE f.followee_id=gm.user_id AND f.follower_id=${userId}::uuid) AS i_follow
      FROM lifebook.group_members gm
      JOIN mobility.users u ON u.id = gm.user_id
      WHERE gm.conversation_id=${convId}::uuid
      ORDER BY CASE gm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, gm.joined_at ASC
      LIMIT 200`;
    const me = members.find((m) => m.user_id === userId);
    return {
      id: conv.id,
      kind: 'group',
      title: conv.title ?? 'Grupo',
      photoUrl: conv.photo_id ? `${USER_PHOTO_BASE}/${conv.photo_id}` : null,
      ownerId: conv.owner_id,
      membersCount: members.length,
      myRole: me?.role ?? 'member',
      allowedKinds: Array.isArray(conv.allowed_kinds) ? conv.allowed_kinds : null,
      muted: !!me?.muted,
      pinned: !!me?.pinned,
      background: conv.gm_bg ?? null,
      /* Parte 19: metadatos del grupo */
      city: conv.city ?? null,
      barrio: conv.barrio ?? null,
      category: conv.category ?? null,
      description: conv.description ?? null,
      visibility: (conv.visibility ?? 'private') as 'public' | 'private' | 'hidden',
      /* Parte 21: punto de encuentro y condición de ingreso */
      placeName: conv.place_name ?? null,
      placeAddress: conv.place_address ?? null,
      placeLon: conv.place_lon ?? null,
      placeLat: conv.place_lat ?? null,
      hidePlace: !!conv.hide_place,
      joinMode: (conv.join_mode ?? 'open') as 'open' | 'approval' | 'question',
      joinQuestion: conv.join_question ?? null,
      // La respuesta NO se devuelve al cliente: solo la usa el servidor para
      // aceptar o rechazar a quien quiera entrar (Fase siguiente).
      hasJoinAnswer: !!conv.join_answer,
      /* Parte 22: gestión estilo Xiaohongshu */
      announcement: conv.announcement ?? null,
      announcementAt: conv.announcement_at ? String(conv.announcement_at) : null,
      welcomeMessage: conv.welcome_message ?? null,
      showHistory: conv.show_history !== false,
      membersCanSpeak: conv.members_can_speak !== false,
      invitePolicy: (conv.invite_policy ?? 'all') as 'all' | 'admins',
      adminsCount: members.filter((m) => m.role === 'admin').length,
      /* Parte 29 (G4): quitar inactivos (solo si el organizador lo activa). */
      autoRemoveInactive: conv.auto_remove_inactive === true,
      inactiveDays: Number(conv.inactive_days ?? 30) || 30,
      /* Parte 25: tema del grupo (Xiaohongshu lo muestra bajo el nombre). */
      topic: conv.topic ?? null,
      topicAt: conv.topic_at ? String(conv.topic_at) : null,
      createdAt: conv.created_at ? String(conv.created_at) : null,
      members: members.map((m) => ({
        id: m.user_id, fullName: m.full_name, avatarUrl: m.avatar_url,
        role: m.role, joinedAt: String(m.joined_at), iFollow: !!m.i_follow,
      })),
    };
  }

  /** Cambia título, foto, metadatos o los componentes permitidos (dueño/admin). */
  async groupUpdate(userId: string, convId: string, dto: {
    title?: string; photoUrl?: string; allowedKinds?: string[];
    city?: string; barrio?: string; category?: string; description?: string; visibility?: string;
    placeName?: string; placeAddress?: string; placeLon?: number; placeLat?: number; hidePlace?: boolean;
    joinMode?: string; joinQuestion?: string; joinAnswer?: string;
  }) {
    const conv = await this.assertConvMember(userId, convId);
    if (conv.kind !== 'group') throw new DomainError('GROUP_NOT_FOUND', 'Este chat no es un grupo');
    const role = await this.groupRole(userId, convId);
    if (role !== 'owner' && role !== 'admin') throw new DomainError('GROUP_FORBIDDEN', 'Solo el dueño o un administrador puede cambiar el grupo');
    if (dto.title !== undefined) {
      const title = this.cleanText(dto.title, 90);
      if (title.length < 3) throw new DomainError('GROUP_TITLE_REQUIRED', 'El nombre debe tener al menos 3 caracteres');
      await this.db.$queryRaw`UPDATE lifebook.conversations SET title=${title} WHERE id=${convId}::uuid`;
    }
    if (dto.photoUrl !== undefined) {
      const photoId = this.isHttpUrl(dto.photoUrl) ? String(dto.photoUrl).split('/').pop() : null;
      await this.db.$queryRaw`UPDATE lifebook.conversations SET photo_id=${photoId}::uuid WHERE id=${convId}::uuid`;
    }
    if (dto.allowedKinds !== undefined) {
      // Mismos componentes que al crear (incluye los de grupo de G2–G4).
      const allowed = (dto.allowedKinds ?? []).filter((k) => DEFAULT_KINDS.includes(String(k)));
      await this.db.$queryRaw`
        UPDATE lifebook.conversations SET allowed_kinds=${JSON.stringify(allowed)}::jsonb WHERE id=${convId}::uuid`;
    }
    // Metadatos: se actualizan solo los que lleguen (sin listas cerradas).
    const meta = this.groupMeta(dto);
    // Si dejo la condición en «pregunta», tiene que haber pregunta y respuesta
    // (la que ya estaba sirve si solo se cambia otra cosa).
    if (meta.join_mode === 'question') {
      this.assertJoinMeta({
        join_mode: 'question',
        join_question: meta.join_question ?? conv.join_question ?? null,
        join_answer: meta.join_answer ?? conv.join_answer ?? null,
      });
    }
    for (const [key, value] of Object.entries(meta)) {
      if (value === undefined) continue;
      await this.db.$queryRawUnsafe(
        `UPDATE lifebook.conversations SET ${key} = $2 WHERE id = $1::uuid`, convId, value);
    }
    return this.groupDetails(userId, convId);
  }

  /**
   * Añade miembros al grupo (máximo 200). Con `invite_policy='all'` (por
   * defecto, como Xiaohongshu) cualquier miembro puede invitar; con `'admins'`,
   * solo el dueño y los administradores.
   */
  async groupAddMembers(userId: string, convId: string, memberIds: string[]) {
    const conv = await this.assertConvMember(userId, convId);
    if (conv.kind !== 'group') throw new DomainError('GROUP_NOT_FOUND', 'Este chat no es un grupo');
    const role = await this.groupRole(userId, convId);
    const policy = String(conv.invite_policy ?? 'all');
    if (policy === 'admins' && role !== 'owner' && role !== 'admin') {
      throw new DomainError('GROUP_FORBIDDEN', 'En este grupo solo el organizador y los administradores pueden invitar');
    }
    const count: any[] = await this.db.$queryRaw`
      SELECT count(*)::int AS n FROM lifebook.group_members WHERE conversation_id=${convId}::uuid`;
    const current = Number(count[0]?.n ?? 0);
    const ids = Array.from(new Set((memberIds ?? []).map((m) => String(m)).filter((m) => /^[0-9a-f-]{36}$/i.test(m))));
    if (current + ids.length > 200) throw new DomainError('GROUP_FULL', 'El grupo ya tiene el máximo de 200 miembros');
    if (ids.length === 0) throw new DomainError('GROUP_MEMBERS_REQUIRED', 'No hay personas que añadir');
    const valid: any[] = await this.db.$queryRawUnsafe(
      `SELECT id FROM mobility.users WHERE id = ANY($1::uuid[]) AND status <> 'SUSPENDED'`, ids);
    let added = 0;
    for (const v of valid) {
      const ins: any[] = await this.db.$queryRaw`
        INSERT INTO lifebook.group_members (conversation_id, user_id, role)
        VALUES (${convId}::uuid, ${v.id}::uuid, 'member')
        ON CONFLICT DO NOTHING
        RETURNING user_id`;
      if (ins.length) added += 1;
    }
    // Parte 22: mensaje de bienvenida (Xiaohongshu lo manda al entrar).
    const welcome = this.cleanText(conv.welcome_message, 300);
    if (added > 0 && welcome) await this.pushSystemMessage(convId, welcome);
    return this.groupDetails(userId, convId);
  }

  /** Expulsa a un miembro (dueño/admin; el dueño no puede ser expulsado). */
  async groupRemoveMember(userId: string, convId: string, memberId: string) {
    const conv = await this.assertConvMember(userId, convId);
    if (conv.kind !== 'group') throw new DomainError('GROUP_NOT_FOUND', 'Este chat no es un grupo');
    const role = await this.groupRole(userId, convId);
    if (role !== 'owner' && role !== 'admin') throw new DomainError('GROUP_FORBIDDEN', 'Solo el dueño o un administrador puede expulsar');
    if (String(memberId) === String(conv.owner_id)) throw new DomainError('GROUP_FORBIDDEN', 'No se puede expulsar al dueño del grupo');
    const target = await this.groupRole(String(memberId), convId);
    if (!target) throw new DomainError('USER_NOT_FOUND', 'Esa persona no está en el grupo');
    if (role === 'admin' && target !== 'member') throw new DomainError('GROUP_FORBIDDEN', 'Un administrador solo puede expulsar a miembros');
    await this.db.$queryRaw`
      DELETE FROM lifebook.group_members
      WHERE conversation_id=${convId}::uuid AND user_id=${String(memberId)}::uuid`;
    return { ok: true, removed: String(memberId) };
  }

  /** Salgo del grupo (el dueño no puede salir: debe expulsarse antes o cerrarlo). */
  async groupLeave(userId: string, convId: string) {
    const conv = await this.assertConvMember(userId, convId);
    if (conv.kind !== 'group') throw new DomainError('GROUP_NOT_FOUND', 'Este chat no es un grupo');
    if (String(conv.owner_id) === userId) throw new DomainError('GROUP_FORBIDDEN', 'El dueño no puede salir: expulsa a los miembros o elimina el grupo');
    await this.db.$queryRaw`
      DELETE FROM lifebook.group_members
      WHERE conversation_id=${convId}::uuid AND user_id=${userId}::uuid`;
    return { ok: true, left: true };
  }

  /* ══════════ PARTE 22 — GESTIÓN DE GRUPO (estilo Xiaohongshu) ══════════ */

  /** Comprueba que soy dueño (o dueño/admin si `allowAdmin`). */
  private async assertGroupRole(userId: string, convId: string, allowAdmin: boolean) {
    const conv = await this.assertConvMember(userId, convId);
    if (conv.kind !== 'group') throw new DomainError('GROUP_NOT_FOUND', 'Este chat no es un grupo');
    const role = await this.groupRole(userId, convId);
    const ok = role === 'owner' || (allowAdmin && role === 'admin');
    if (!ok) throw new DomainError('GROUP_FORBIDDEN', allowAdmin ? 'Solo el dueño o un administrador puede hacer esto' : 'Solo el dueño del grupo puede hacer esto');
    return { conv, role: role as string };
  }

  /**
   * Ajustes del grupo (dueño/admin): anuncio, bienvenida, compartir historial,
   * quién puede hablar, quién puede invitar y —Parte 25— el TEMA del grupo.
   * Solo se toca lo que llega.
   */
  async groupSettings(userId: string, convId: string, dto: {
    announcement?: string | null; welcomeMessage?: string | null;
    showHistory?: boolean; membersCanSpeak?: boolean; invitePolicy?: string;
    topic?: string | null;
    /** Parte 29 (G4): quitar inactivos y a partir de cuántos días. */
    autoRemoveInactive?: boolean; inactiveDays?: number;
  }) {
    await this.assertGroupRole(userId, convId, true);
    // Parte 25: el tema del grupo se anuncia en el hilo (como los demás ajustes).
    if (dto.topic !== undefined) {
      const topic = this.cleanText(dto.topic, TOPIC_MAX) || null;
      await this.db.$queryRaw`
        UPDATE lifebook.conversations
           SET topic = ${topic}, topic_at = CASE WHEN ${topic}::text IS NULL THEN NULL ELSE now() END
         WHERE id = ${convId}::uuid`;
      if (topic) await this.pushSystemMessage(convId, `📌 Tema del grupo: ${topic}`);
    }
    // `touched` = se cambió algún ajuste de los genéricos (no el tema, que ya
    // dejó su propio aviso «📌 Tema del grupo: …»).
    let touched = false;
    if (dto.announcement !== undefined) {
      const text = this.cleanText(dto.announcement, 500) || null;
      await this.db.$queryRaw`
        UPDATE lifebook.conversations
           SET announcement = ${text}, announcement_at = CASE WHEN ${text}::text IS NULL THEN NULL ELSE now() END
         WHERE id = ${convId}::uuid`;
      touched = true;
    }
    if (dto.welcomeMessage !== undefined) {
      const text = this.cleanText(dto.welcomeMessage, 300) || null;
      await this.db.$queryRaw`UPDATE lifebook.conversations SET welcome_message = ${text} WHERE id = ${convId}::uuid`;
      touched = true;
    }
    if (dto.showHistory !== undefined) {
      await this.db.$queryRaw`UPDATE lifebook.conversations SET show_history = ${!!dto.showHistory} WHERE id = ${convId}::uuid`;
      touched = true;
    }
    if (dto.membersCanSpeak !== undefined) {
      await this.db.$queryRaw`UPDATE lifebook.conversations SET members_can_speak = ${!!dto.membersCanSpeak} WHERE id = ${convId}::uuid`;
      touched = true;
    }
    if (dto.invitePolicy !== undefined) {
      const policy = ['all', 'admins'].includes(String(dto.invitePolicy)) ? String(dto.invitePolicy) : 'all';
      await this.db.$queryRaw`UPDATE lifebook.conversations SET invite_policy = ${policy} WHERE id = ${convId}::uuid`;
      touched = true;
    }
    // Parte 29 (G4): quitar inactivos (por defecto desactivado).
    if (dto.autoRemoveInactive !== undefined) {
      await this.db.$queryRaw`
        UPDATE lifebook.conversations SET auto_remove_inactive = ${!!dto.autoRemoveInactive} WHERE id = ${convId}::uuid`;
      touched = true;
    }
    if (dto.inactiveDays !== undefined) {
      const dias = Math.min(Math.max(Math.round(Number(dto.inactiveDays) || 30), 1), 365);
      await this.db.$queryRaw`
        UPDATE lifebook.conversations SET inactive_days = ${dias} WHERE id = ${convId}::uuid`;
      touched = true;
    }
    // Cambios de ajustes quedan como aviso del sistema (como Xiaohongshu).
    if (touched) await this.pushSystemMessage(convId, '⚙️ El organizador actualizó los ajustes del grupo');
    return this.groupDetails(userId, convId);
  }

  /** Nombra administrador (solo el dueño; máximo 5). */
  async groupSetAdmin(userId: string, convId: string, memberId: string) {
    const { conv } = await this.assertGroupRole(userId, convId, false);
    if (String(memberId) === String(conv.owner_id)) throw new DomainError('GROUP_FORBIDDEN', 'El dueño ya manda más que un administrador');
    const target = await this.groupRole(String(memberId), convId);
    if (!target) throw new DomainError('USER_NOT_FOUND', 'Esa persona no está en el grupo');
    if (target === 'admin') return this.groupDetails(userId, convId);
    const count: any[] = await this.db.$queryRaw`
      SELECT count(*)::int AS n FROM lifebook.group_members
       WHERE conversation_id=${convId}::uuid AND role='admin'`;
    if (Number(count[0]?.n ?? 0) >= 5) throw new DomainError('GROUP_ADMINS_FULL', 'Máximo 5 administradores por grupo');
    await this.db.$queryRaw`
      UPDATE lifebook.group_members SET role='admin'
       WHERE conversation_id=${convId}::uuid AND user_id=${String(memberId)}::uuid`;
    await this.pushSystemMessage(convId, '👑 Hay un administrador nuevo en el grupo');
    return this.groupDetails(userId, convId);
  }

  /** Quita el rol de administrador (solo el dueño). */
  async groupUnsetAdmin(userId: string, convId: string, memberId: string) {
    await this.assertGroupRole(userId, convId, false);
    const target = await this.groupRole(String(memberId), convId);
    if (!target) throw new DomainError('USER_NOT_FOUND', 'Esa persona no está en el grupo');
    if (target !== 'admin') throw new DomainError('GROUP_FORBIDDEN', 'Esa persona no es administradora');
    await this.db.$queryRaw`
      UPDATE lifebook.group_members SET role='member'
       WHERE conversation_id=${convId}::uuid AND user_id=${String(memberId)}::uuid`;
    return this.groupDetails(userId, convId);
  }

  /** Cede el grupo a otra persona: el dueño pasa a administrador (Xiaohongshu). */
  async groupTransfer(userId: string, convId: string, memberId: string) {
    const { conv } = await this.assertGroupRole(userId, convId, false);
    if (String(memberId) === userId) throw new DomainError('GROUP_FORBIDDEN', 'Ya eres el dueño del grupo');
    const target = await this.groupRole(String(memberId), convId);
    if (!target) throw new DomainError('USER_NOT_FOUND', 'Esa persona no está en el grupo');
    await this.db.$queryRaw`
      UPDATE lifebook.conversations SET owner_id=${String(memberId)}::uuid WHERE id=${convId}::uuid`;
    await this.db.$queryRaw`
      UPDATE lifebook.group_members SET role='admin'
       WHERE conversation_id=${convId}::uuid AND user_id=${userId}::uuid`;
    await this.db.$queryRaw`
      UPDATE lifebook.group_members SET role='owner'
       WHERE conversation_id=${convId}::uuid AND user_id=${String(memberId)}::uuid`;
    await this.pushSystemMessage(convId, '👑 El grupo tiene un dueño nuevo');
    return this.groupDetails(userId, convId);
  }

  /**
   * Disuelve el grupo (solo el dueño). Borra la conversación y, en cascada sus
   * miembros y mensajes — es la «zona de riesgo» de Xiaohongshu.
   */
  async groupDissolve(userId: string, convId: string) {
    await this.assertGroupRole(userId, convId, false);
    const msgs: any[] = await this.db.$queryRaw`
      SELECT count(*)::int AS n FROM lifebook.messages WHERE conversation_id=${convId}::uuid`;
    await this.db.$queryRaw`DELETE FROM lifebook.conversations WHERE id=${convId}::uuid`;
    return { ok: true, dissolved: true, messagesRemoved: Number(msgs[0]?.n ?? 0) };
  }

  /** Aviso del sistema en el chat (lo usan los cambios de gestión). */
  private async pushSystemMessage(convId: string, text: string) {
    const body = this.cleanText(text, 300);
    if (!body) return;
    await this.db.$queryRaw`
      INSERT INTO lifebook.messages (conversation_id, sender_id, body, kind, payload)
      SELECT ${convId}::uuid, owner_id, ${body}, 'system', '{}'::jsonb
        FROM lifebook.conversations WHERE id=${convId}::uuid`;
    await this.db.$queryRaw`
      UPDATE lifebook.conversations SET last_message=${body}, last_message_at=now() WHERE id=${convId}::uuid`;
  }

  /**
   * Borra un mensaje para todos (Parte 23). Puede borrarlo quien lo escribió y,
   * en grupos, también el dueño o un administrador (moderación). El mensaje
   * desaparece del hilo y, si era el último, se recalcula la vista previa.
   */
  async chatDeleteMessage(userId: string, convId: string, messageId: string) {
    const conv = await this.assertConvMember(userId, convId);
    const rows: any[] = await this.db.$queryRaw`
      SELECT id, sender_id, created_at FROM lifebook.messages
      WHERE id=${messageId}::uuid AND conversation_id=${convId}::uuid AND state='active' LIMIT 1`;
    if (!rows[0]) throw new DomainError('MESSAGE_NOT_FOUND', 'Ese mensaje ya no está');
    if (rows[0].sender_id !== userId) {
      const role = conv.kind === 'group' ? (conv.gm_role ?? await this.groupRole(userId, convId)) : null;
      if (role !== 'owner' && role !== 'admin') {
        throw new DomainError('MESSAGE_FORBIDDEN', 'Solo puedes eliminar tus mensajes');
      }
    }
    await this.db.$queryRaw`
      UPDATE lifebook.messages SET state='removed', body='', payload='{}'::jsonb
      WHERE id=${messageId}::uuid`;
    // Vista previa en la lista de chats: si era el último, se recalcula.
    const last: any[] = await this.db.$queryRaw`
      SELECT body, created_at FROM lifebook.messages
      WHERE conversation_id=${convId}::uuid AND state='active'
      ORDER BY created_at DESC LIMIT 1`;
    await this.db.$queryRaw`
      UPDATE lifebook.conversations
         SET last_message = ${last[0]?.body ?? null},
             last_message_at = ${last[0]?.created_at ?? null}
       WHERE id=${convId}::uuid`;
    return { ok: true, removed: messageId };
  }

  /** No molestar · fijar arriba · fondo del chat (por usuario y conversación). */
  async chatPrefs(userId: string, convId: string, patch: { muted?: boolean; pinned?: boolean; background?: string | null }) {
    const conv = await this.assertConvMember(userId, convId);
    const bg = patch.background === undefined ? null : String(patch.background ?? '').slice(0, 40) || null;
    if (conv.kind === 'group') {
      await this.db.$queryRawUnsafe(
        `UPDATE lifebook.group_members
            SET muted  = COALESCE($3::boolean, muted),
                pinned = COALESCE($4::boolean, pinned),
                bg     = CASE WHEN $5::boolean THEN $6::text ELSE bg END
          WHERE conversation_id = $1::uuid AND user_id = $2::uuid`,
        convId, userId, patch.muted ?? null, patch.pinned ?? null, patch.background !== undefined, bg);
      return { ok: true, muted: patch.muted ?? null, pinned: patch.pinned ?? null, background: bg };
    }
    const meIsA = conv.user_a === userId;
    await this.db.$queryRawUnsafe(
      `UPDATE lifebook.conversations
          SET muted_${meIsA ? 'a' : 'b'}  = COALESCE($2::boolean, muted_${meIsA ? 'a' : 'b'}),
              pinned_${meIsA ? 'a' : 'b'} = COALESCE($3::boolean, pinned_${meIsA ? 'a' : 'b'}),
              bg_${meIsA ? 'a' : 'b'}     = CASE WHEN $4::boolean THEN $5::text ELSE bg_${meIsA ? 'a' : 'b'} END
        WHERE id = $1::uuid`,
      convId, patch.muted ?? null, patch.pinned ?? null, patch.background !== undefined, bg);
    return { ok: true, muted: patch.muted ?? null, pinned: patch.pinned ?? null, background: bg };
  }

  /** Borra MI historial del chat (marca `cleared` para mí; los demás lo conservan). */
  async chatClear(userId: string, convId: string) {
    const conv = await this.assertConvMember(userId, convId);
    if (conv.kind === 'group') {
      // Parte 18: en grupos también se puede borrar MI historial.
      await this.db.$queryRaw`
        UPDATE lifebook.group_members SET cleared_at = now(), last_read_at = now()
        WHERE conversation_id=${convId}::uuid AND user_id=${userId}::uuid`;
      return { ok: true, scope: 'group' as const };
    }
    const meIsA = conv.user_a === userId;
    await this.db.$queryRawUnsafe(
      `UPDATE lifebook.conversations SET cleared_${meIsA ? 'a' : 'b'} = now() WHERE id = $1::uuid`, convId);
    return { ok: true, scope: 'direct' as const };
  }

  /**
   * Busca en el historial del chat por tipo (Parte 17): `image`, `file`, `post`,
   * `sale`, `system` (transacciones), `emoji` (solo emoticonos) y `link`.
   */
  async chatSearch(userId: string, convId: string, opts: { kind?: string; limit?: number } = {}) {
    const conv = await this.assertConvMember(userId, convId);
    const kind = String(opts.kind ?? '').trim();
    const limit = Math.min(Math.max(Number(opts.limit ?? 50) || 50, 1), 100);
    const args: unknown[] = [convId];
    const conds = [`m.conversation_id = $1::uuid`, `m.state='active'`];
    // Parte 18: lo que borré de mi historial tampoco sale en la búsqueda.
    const cleared = conv.kind === 'group'
      ? conv.gm_cleared_at
      : (conv.user_a === userId ? conv.cleared_a : conv.cleared_b);
    if (cleared) { args.push(cleared); conds.push(`m.created_at > $${args.length}::timestamptz`); }
    // `location`, `vote`, `chain`, `topic`, `checkin` y `ad` son componentes de
    // grupo (Fases G2–G4): hoy no hay mensajes de ese tipo, pero la búsqueda ya
    // los admite para que funcionen en cuanto se envíen.
    if (['image', 'file', 'post', 'sale', 'system', 'order', 'location', 'vote', 'chain', 'topic', 'checkin', 'ad'].includes(kind)) {
      args.push(kind);
      conds.push(`m.kind = $${args.length}`);
      if (kind === 'system') conds.push(`m.payload->>'orderId' IS NOT NULL`);
    } else if (kind === 'link') {
      conds.push(`m.body ~* 'https?://'`);
    } else if (kind === 'emoji') {
      conds.push(`m.body ~ '^[[:space:][:punct:]\u00a9\u00ae\u2122\u2190-\u21FF\u2300-\u27BF\u2B00-\u2BFF\uFE0F\u200D\U0001F000-\U0001FAFF]+$'`);
      conds.push(`m.body <> ''`);
    } else {
      throw new DomainError('SEARCH_KIND_INVALID', 'Búsqueda no válida');
    }
    args.push(limit);
    const rows: any[] = await this.db.$queryRawUnsafe(`
      SELECT m.id, m.conversation_id, m.sender_id, m.body, m.read_at, m.created_at, m.kind, m.payload,
             u.full_name, u.avatar_url,
             p.title AS post_title, p.type AS post_type, p.payload->>'priceXaf' AS post_price,
             p.media_ids AS post_media,
             pr.title AS prod_title, pr.price_xaf AS prod_price, pr.media AS prod_media,
             pr.shop_id AS prod_shop, pr.status AS prod_status,
             o.order_no AS ord_no, o.status AS ord_status, o.total_xaf AS ord_total,
             o.delivery_mode AS ord_delivery, o.delivered_at AS ord_delivered
      FROM lifebook.messages m
      JOIN mobility.users u ON u.id = m.sender_id
      LEFT JOIN lifebook.posts p ON m.kind IN ('post','sale') AND p.id = (m.payload->>'postId')::uuid
      LEFT JOIN lifebook.products pr ON m.kind = 'product' AND pr.id = (m.payload->>'productId')::uuid
      LEFT JOIN lifebook.orders o ON m.kind = 'order'
        AND o.id = CASE WHEN (m.payload->>'orderId') ~ '^[0-9a-f-]{36}$'
                        THEN (m.payload->>'orderId')::uuid ELSE NULL END
      WHERE ${conds.join(' AND ')}
      ORDER BY m.created_at DESC
      LIMIT $${args.length}`, ...args);
    // Parte 24/25: los recuentos (votos y apuntados) que salgan en el historial.
    const votes = await this.voteStats(rows, userId);
    const joins = await this.joinStats(rows, userId);
    return {
      kind,
      total: rows.length,
      messages: rows.map((m) => this.serializeMessage(m, userId, votes, joins)),
    };
  }

  // =========================================================================
  // PARTE 30 (Fase 05) — BÚSQUEDA GLOBAL DE MENSAJES
  // Busca en TODOS mis chats a la vez (1 a 1 y grupos donde soy miembro),
  // respetando lo que borré de mi historial, el «compartir historial» del grupo
  // y los bloqueos, con filtros por tipo y paginación por fecha.
  // =========================================================================

  /** Tipos que se pueden filtrar en la búsqueda global de mensajes. */
  private static readonly MSG_SEARCH_KINDS = [
    'text', 'image', 'file', 'post', 'sale', 'location', 'vote', 'chain', 'checkin', 'ad', 'system', 'order',
  ];

  async searchMyMessages(userId: string, opts: {
    q?: string; kind?: string; conversationId?: string; before?: string; limit?: number;
  } = {}) {
    const limit = Math.min(Math.max(Number(opts.limit ?? 30) || 30, 1), 60);
    const args: unknown[] = [userId];
    const conds: string[] = [`m.state = 'active'`];
    // Solo mis chats: 1 a 1 donde participo o grupos donde soy miembro. Se respeta
    // lo que borré de mi historial, el show_history del grupo y los bloqueos.
    conds.push(`(
      (c.kind <> 'group' AND (c.user_a = $1::uuid OR c.user_b = $1::uuid)
        AND m.created_at > COALESCE(CASE WHEN c.user_a = $1::uuid THEN c.cleared_a ELSE c.cleared_b END, 'epoch'::timestamptz)
        AND NOT EXISTS (
          SELECT 1 FROM lifebook.blocks b
           WHERE (b.blocker_id = $1::uuid AND b.blocked_id = CASE WHEN c.user_a = $1::uuid THEN c.user_b ELSE c.user_a END)
              OR (b.blocked_id = $1::uuid AND b.blocker_id = CASE WHEN c.user_a = $1::uuid THEN c.user_b ELSE c.user_a END)))
      OR
      (c.kind = 'group' AND gm.user_id IS NOT NULL
        AND m.created_at > COALESCE(gm.cleared_at, 'epoch'::timestamptz)
        AND (c.show_history IS NOT FALSE OR gm.role IN ('owner','admin') OR m.created_at >= gm.joined_at))
    )`);
    if (opts.conversationId) {
      args.push(String(opts.conversationId));
      conds.push(`m.conversation_id = $${args.length}::uuid`);
    }
    const kind = String(opts.kind ?? '').trim();
    if (kind) {
      if (!(LifebookService.MSG_SEARCH_KINDS as readonly string[]).includes(kind)) {
        throw new DomainError('SEARCH_KIND_INVALID', 'Tipo de mensaje no válido');
      }
      args.push(kind);
      conds.push(`m.kind = $${args.length}`);
    }
    // Texto: TODAS las palabras, sin acentos ni mayúsculas (hasta 6).
    const term = this.normTerm(opts.q, 60);
    for (const w of term.split(' ').filter(Boolean).slice(0, 6)) {
      args.push(w);
      conds.push(`translate(lower(coalesce(m.body,'')), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN') LIKE '%' || $${args.length} || '%'`);
    }
    if (opts.before) { args.push(String(opts.before)); conds.push(`m.created_at < $${args.length}::timestamptz`); }
    args.push(limit);
    const rows: any[] = await this.db.$queryRawUnsafe(
      `SELECT m.id, m.conversation_id, m.sender_id, m.body, m.kind, m.payload, m.created_at, m.read_at,
              u.full_name, u.avatar_url,
              c.kind AS conv_kind, c.title AS conv_title, c.photo_id AS conv_photo,
              peer.full_name AS peer_name, peer.avatar_url AS peer_avatar
         FROM lifebook.messages m
         JOIN lifebook.conversations c ON c.id = m.conversation_id
         JOIN mobility.users u ON u.id = m.sender_id
         LEFT JOIN lifebook.group_members gm ON gm.conversation_id = c.id AND gm.user_id = $1::uuid
         LEFT JOIN mobility.users peer ON peer.id = CASE WHEN c.user_a = $1::uuid THEN c.user_b ELSE c.user_a END
        WHERE ${conds.join(' AND ')}
        ORDER BY m.created_at DESC
        LIMIT $${args.length}`, ...args);
    const hasMore = rows.length === limit;
    const votes = await this.voteStats(rows, userId);
    const joins = await this.joinStats(rows, userId);
    return {
      query: term || null,
      kind: kind || null,
      total: rows.length,
      nextCursor: hasMore && rows.length ? String(rows[rows.length - 1].created_at) : null,
      messages: rows.map((m) => ({
        ...this.serializeMessage(m, userId, votes, joins),
        // Contexto del chat al que pertenece (para pintar el resultado).
        conversation: {
          id: String(m.conversation_id),
          kind: m.conv_kind === 'group' ? 'group' : 'direct',
          title: m.conv_kind === 'group' ? (m.conv_title ?? 'Grupo') : (m.peer_name ?? 'Chat'),
          photoUrl: m.conv_kind === 'group'
            ? (m.conv_photo ? `${USER_PHOTO_BASE}/${m.conv_photo}` : null)
            : (m.peer_avatar ?? null),
        },
      })),
    };
  }

  // =========================================================================
  // PARTE 29 (G4) — QUITAR INACTIVOS
  // Regla: en un grupo con `auto_remove_inactive` activado se quita a los
  // MIEMBROS (nunca al dueño ni a los administradores) cuya última señal de vida
  // en el grupo sea más antigua que `inactive_days`. Se considera actividad:
  // haber escrito en el grupo, haberlo abierto (`last_read_at`) o haber entrado.
  // =========================================================================

  /** ¿Quién está inactivo en este grupo? (sin tocar nada) */
  private async inactiveMembers(convId: string, days: number) {
    const rows: any[] = await this.db.$queryRaw`
      SELECT gm.user_id, u.full_name, u.avatar_url, gm.role,
             GREATEST(gm.joined_at,
                      COALESCE(gm.last_read_at, gm.joined_at),
                      COALESCE((SELECT max(m.created_at) FROM lifebook.messages m
                                 WHERE m.conversation_id = gm.conversation_id
                                   AND m.sender_id = gm.user_id), gm.joined_at)) AS last_seen
        FROM lifebook.group_members gm
        JOIN mobility.users u ON u.id = gm.user_id
       WHERE gm.conversation_id = ${convId}::uuid
         AND gm.role NOT IN ('owner', 'admin')
         AND GREATEST(gm.joined_at,
                      COALESCE(gm.last_read_at, gm.joined_at),
                      COALESCE((SELECT max(m.created_at) FROM lifebook.messages m
                                 WHERE m.conversation_id = gm.conversation_id
                                   AND m.sender_id = gm.user_id), gm.joined_at))
             < now() - ${`${Math.max(0, Math.round(days))} days`}::interval
       ORDER BY last_seen ASC`;
    return rows;
  }

  /**
   * Revisa (o limpia) los inactivos de UN grupo. Dueño y administradores.
   * `days` permite revisar con otro umbral (p. ej. 0 = «todos los que no son
   * admin», útil para ver la regla) y `dryRun` solo enseña a quién quitaría.
   */
  async groupSweepInactive(userId: string, convId: string, opts: { days?: number; dryRun?: boolean } = {}) {
    const { conv } = await this.assertGroupRole(userId, convId, true);
    const porDefecto = Number(conv.inactive_days ?? 30) || 30;
    const days = opts.days === undefined ? porDefecto : Math.min(Math.max(Math.round(Number(opts.days) || 0), 0), 365);
    const candidatos = await this.inactiveMembers(convId, days);
    if (opts.dryRun) {
      return {
        dryRun: true, days, removed: 0,
        candidates: candidatos.map((c) => ({
          userId: String(c.user_id), fullName: c.full_name ?? null,
          avatarUrl: c.avatar_url ?? null, lastSeen: String(c.last_seen),
        })),
      };
    }
    for (const c of candidatos) {
      await this.db.$queryRaw`
        DELETE FROM lifebook.group_members
         WHERE conversation_id=${convId}::uuid AND user_id=${String(c.user_id)}::uuid`;
    }
    if (candidatos.length > 0) {
      await this.pushSystemMessage(convId,
        `🚪 Se ha quitado a ${candidatos.length} persona${candidatos.length === 1 ? '' : 's'} por inactividad (${days} días sin entrar)`);
    }
    return {
      dryRun: false, days, removed: candidatos.length,
      candidates: candidatos.map((c) => ({
        userId: String(c.user_id), fullName: c.full_name ?? null,
        avatarUrl: c.avatar_url ?? null, lastSeen: String(c.last_seen),
      })),
    };
  }

  /**
   * Barrido de TODOS los grupos que tengan el ajuste activado (lo llama el
   * temporizador cada 6 h). Nunca toca al dueño ni a los administradores.
   */
  async sweepInactiveAll() {
    try {
      const grupos: any[] = await this.db.$queryRaw`
        SELECT id, inactive_days FROM lifebook.conversations
         WHERE kind='group' AND auto_remove_inactive IS TRUE LIMIT 200`;
      for (const g of grupos) {
        const dias = Number(g.inactive_days ?? 30) || 30;
        const candidatos = await this.inactiveMembers(String(g.id), dias);
        if (candidatos.length === 0) continue;
        for (const c of candidatos) {
          await this.db.$queryRaw`
            DELETE FROM lifebook.group_members
             WHERE conversation_id=${String(g.id)}::uuid AND user_id=${String(c.user_id)}::uuid`;
        }
        await this.pushSystemMessage(String(g.id),
          `🚪 Se ha quitado a ${candidatos.length} persona${candidatos.length === 1 ? '' : 's'} por inactividad (${dias} días sin entrar)`);
      }
      return { groups: grupos.length };
    } catch {
      return { groups: 0 };
    }
  }

  // =========================================================================
  // PARTE 28 (G4) — UBICACIÓN EN VIVO · CÓDIGO DE RUTA (QR) · REPORTAR MIEMBROS
  // =========================================================================

  /**
   * Empieza (o reinicia) a compartir MI ubicación en vivo en este chat.
   * `minutes` es la duración; caduca sola al llegar la hora.
   */
  async liveStart(userId: string, convId: string, input: { lat?: number; lng?: number; label?: string; minutes?: number } = {}) {
    await this.assertConvMember(userId, convId);
    const lat = this.coord(input.lat, -90, 90);
    const lng = this.coord(input.lng, -180, 180);
    if (lat === null || lng === null) throw new DomainError('LOCATION_REQUIRED', 'No pude leer tu posición para compartirla en vivo');
    const mins = Math.min(Math.max(Math.round(Number(input.minutes ?? 60) || 60), LIVE_MINUTES_MIN), LIVE_MINUTES_MAX);
    const label = this.cleanText(input.label, LIVE_LABEL_MAX) || null;
    await this.db.$queryRaw`
      INSERT INTO lifebook.live_locations (conversation_id, user_id, lat, lng, label, started_at, updated_at, expires_at)
      VALUES (${convId}::uuid, ${userId}::uuid, ${lat}, ${lng}, ${label}, now(), now(), now() + ${`${mins} minutes`}::interval)
      ON CONFLICT (conversation_id, user_id)
      DO UPDATE SET lat=EXCLUDED.lat, lng=EXCLUDED.lng, label=COALESCE(EXCLUDED.label, lifebook.live_locations.label),
                    updated_at=now(), expires_at=EXCLUDED.expires_at,
                    started_at=CASE WHEN lifebook.live_locations.expires_at < now()
                                    THEN now() ELSE lifebook.live_locations.started_at END`;
    return this.liveList(userId, convId);
  }

  /** Muevo mi posición (lo llama la app cada pocos segundos mientras comparto). */
  async liveUpdate(userId: string, convId: string, input: { lat?: number; lng?: number } = {}) {
    await this.assertConvMember(userId, convId);
    const lat = this.coord(input.lat, -90, 90);
    const lng = this.coord(input.lng, -180, 180);
    if (lat === null || lng === null) throw new DomainError('LOCATION_REQUIRED', 'Posición no válida');
    const rows: any[] = await this.db.$queryRaw`
      UPDATE lifebook.live_locations
         SET lat=${lat}, lng=${lng}, updated_at=now()
       WHERE conversation_id=${convId}::uuid AND user_id=${userId}::uuid AND expires_at > now()
      RETURNING user_id`;
    if (!rows[0]) throw new DomainError('LIVE_NOT_SHARING', 'No estás compartiendo tu ubicación en este chat');
    return this.liveList(userId, convId);
  }

  /** Dejo de compartir. */
  async liveStop(userId: string, convId: string) {
    await this.assertConvMember(userId, convId);
    await this.db.$queryRaw`
      DELETE FROM lifebook.live_locations
       WHERE conversation_id=${convId}::uuid AND user_id=${userId}::uuid`;
    return this.liveList(userId, convId);
  }

  /**
   * Quién está compartiendo su ubicación AHORA en este chat (con su posición y
   * hace cuántos segundos se actualizó). Los caducados o muy viejos se limpian.
   */
  async liveList(userId: string, convId: string) {
    await this.assertConvMember(userId, convId);
    // Limpieza oportunista: caducadas y sin refrescar hace mucho.
    await this.db.$queryRaw`
      DELETE FROM lifebook.live_locations
       WHERE conversation_id=${convId}::uuid
         AND (expires_at < now() OR updated_at < now() - ${`${LIVE_STALE_SEC} seconds`}::interval)`;
    const rows: any[] = await this.db.$queryRaw`
      SELECT l.user_id, l.lat, l.lng, l.label, l.updated_at, l.expires_at, l.started_at,
             u.full_name, u.avatar_url
        FROM lifebook.live_locations l JOIN mobility.users u ON u.id = l.user_id
       WHERE l.conversation_id=${convId}::uuid
       ORDER BY l.started_at ASC`;
    return {
      sharing: rows.map((r) => ({
        userId: String(r.user_id),
        fullName: r.full_name ?? null,
        avatarUrl: r.avatar_url ?? null,
        lat: Number(r.lat),
        lng: Number(r.lng),
        label: r.label ?? null,
        mine: String(r.user_id) === userId,
        updatedAt: String(r.updated_at),
        startedAt: String(r.started_at),
        expiresAt: String(r.expires_at),
        // Segundos desde la última actualización (para pintar «hace 12 s»).
        ageSec: Math.max(0, Math.round((Date.now() - new Date(String(r.updated_at)).getTime()) / 1000)),
        minutesLeft: Math.max(0, Math.round((new Date(String(r.expires_at)).getTime() - Date.now()) / 60000)),
      })),
    };
  }

  /**
   * CÓDIGO de invitación del grupo (dueño y administradores): se genera la
   * primera vez y sirve para invitar sin buscador (y para el QR).
   */
  /**
   * El código del grupo. `opts` permite fijar el TOPE DE USOS y los DÍAS de vida al
   * crearlo o al renovarlo (es lo que ofrece la gestión del grupo). Sin `opts` se
   * comporta como siempre: reutiliza el código vivo y solo lo rota si caducó.
   */
  async groupInviteCode(userId: string, convId: string,
                        opts: { maxUses?: number | null; days?: number } = {}) {
    await this.assertGroupRole(userId, convId, true);
    const rows: any[] = await this.db.$queryRaw`
      SELECT invite_code, title, invite_expires_at
        FROM lifebook.conversations WHERE id=${convId}::uuid LIMIT 1`;
    let code = rows[0]?.invite_code ? String(rows[0].invite_code) : null;
    // Un código CADUCADO se rota al pedirlo, no se devuelve el viejo: si no, el
    // «enlace» del grupo seguiría funcionando eternamente, que es justo el agujero.
    // OJO: sin fecha (códigos anteriores a esta función) también cuenta como caducado,
    // porque «sin caducidad» es exactamente el agujero que queremos cerrar.
    const exp = rows[0]?.invite_expires_at;
    const caducado = !exp || new Date(exp).getTime() <= Date.now();
    if (caducado) code = null;

    // Tope y días pedidos por el dueño. `maxUses: null` = sin tope; `undefined` = no tocar.
    const topePedido: number | null | undefined = opts.maxUses === undefined ? undefined : opts.maxUses;
    const dias = Number.isFinite(opts.days as number) ? Math.min(365, Math.max(1, Number(opts.days))) : 7;
    // Si piden un tope distinto, o reiniciar (days), el código se genera de nuevo: así el
    // contador empieza de cero y no se puede «recargar» un enlace que ya estaba gastado.
    const pedirNuevo = topePedido !== undefined || opts.days !== undefined;
    if (pedirNuevo) code = null;

    if (!code) {
      // Se reintenta por si el código aleatorio choca con otro grupo.
      for (let i = 0; i < 8 && !code; i += 1) {
        const candidato = Array.from({ length: INVITE_CODE_LEN },
          () => INVITE_CODE_ALPHABET[Math.floor(Math.random() * INVITE_CODE_ALPHABET.length)]).join('');
        const dup: any[] = await this.db.$queryRaw`
          SELECT 1 FROM lifebook.conversations WHERE invite_code=${candidato} LIMIT 1`;
        if (!dup[0]) code = candidato;
      }
      if (!code) throw new DomainError('INVITE_CODE_ERROR', 'No pude generar el código del grupo, prueba otra vez');
      // Nace con CADUCIDAD (7 días, como el QR de WeChat) y con el contador a cero.
      await this.db.$queryRaw`
        UPDATE lifebook.conversations
           SET invite_code=${code},
               invite_expires_at = now() + (${dias}::int * interval '1 day'),
               invite_uses = 0
         WHERE id=${convId}::uuid`;
    }
    // El tope se guarda siempre que se pida un enlace nuevo (que es el único caso en el
    // que `pedirNuevo` es cierto). Cambiar el tope = otro enlace, con el contador a cero:
    // así nadie «recarga» un enlace que ya estaba gastado.
    if (pedirNuevo) {
      await this.db.$queryRaw`
        UPDATE lifebook.conversations SET invite_max_uses=${topePedido ?? null} WHERE id=${convId}::uuid`;
    }
    const expRows: any[] = await this.db.$queryRaw`
      SELECT invite_expires_at, invite_uses, invite_max_uses
        FROM lifebook.conversations WHERE id=${convId}::uuid LIMIT 1`;
    const tope = expRows[0]?.invite_max_uses == null ? null : Number(expRows[0].invite_max_uses);
    const usos = Number(expRows[0]?.invite_uses ?? 0);
    return {
      code,
      title: rows[0]?.title ?? null,
      link: `egrouteplan://group/${code}`,
      /** Cuándo deja de valer. La app puede avisar con esto («caduca en 3 días»). */
      expiresAt: expRows[0]?.invite_expires_at ? String(expRows[0].invite_expires_at) : null,
      /** `null` = sin tope de usos. */
      maxUses: tope,
      uses: usos,
      usesLeft: tope == null ? null : Math.max(0, tope - usos),
    };
  }

  /** Grupo al que corresponde un código (para entrar sin buscador). */
  async groupByCode(userId: string, code: string) {
    const limpio = String(code ?? '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, INVITE_CODE_LEN);
    if (limpio.length < 4) throw new DomainError('INVITE_CODE_INVALID', 'Escribe el código completo del grupo');
    const rows: any[] = await this.db.$queryRaw`
      SELECT id, invite_expires_at, invite_uses, invite_max_uses, invite_code
        FROM lifebook.conversations
       WHERE kind='group' AND invite_code=${limpio} LIMIT 1`;
    if (!rows[0]) throw new DomainError('INVITE_CODE_NOT_FOUND', 'No hay ningún grupo con ese código');
    // CADUCIDAD: un código de 6 caracteres que no caduca nunca se puede sacar a fuerza
    // bruta con paciencia (el endpoint solo tiene el límite global). A los 7 días deja
    // de valer y el dueño puede generar otro.
    // Sin fecha TAMBIÉN cuenta como caducado (códigos anteriores a esta función): si no,
    // el dueño lo vería como viejo y el invitado entraría igual.
    const expiraEn = rows[0].invite_expires_at ? new Date(rows[0].invite_expires_at).getTime() : 0;
    if (expiraEn <= Date.now()) {
      throw new DomainError('INVITE_CODE_INVALID', 'Ese código ha caducado: pide uno nuevo a quien te invitó');
    }
    const ficha = await this.groupCard(userId, String(rows[0].id));
    // Cuántas entradas quedan por este enlace. `null` = sin tope. Se manda solo por aquí
    // (entrar con el código), no en la ficha normal: quien tiene el enlace ya conoce el
    // código, quien no lo tiene no necesita saber si quedan plazas.
    const tope = rows[0].invite_max_uses == null ? null : Number(rows[0].invite_max_uses);
    const usos = Number(rows[0].invite_uses ?? 0);
    return {
      ...ficha,
      invite: {
        expiresAt: rows[0].invite_expires_at ? String(rows[0].invite_expires_at) : null,
        maxUses: tope,
        uses: usos,
        usesLeft: tope == null ? null : Math.max(0, tope - usos),
      },
    };
  }

  /**
   * REPORTAR a una persona del chat: crea un reporte de contenido tipo `user`
   * con el mismo catálogo de motivos (lo ve moderación).
   */
  async reportUser(reporterId: string, targetId: string, reason: string, note?: string) {
    if (String(reporterId) === String(targetId)) throw new DomainError('CANNOT_REPORT_SELF', 'No puedes reportarte a ti mismo');
    if (!(REPORT_REASONS as readonly string[]).includes(reason)) throw new DomainError('REASON_INVALID', 'Motivo no válido');
    const u: any[] = await this.db.$queryRaw`
      SELECT id FROM mobility.users WHERE id=${String(targetId)}::uuid LIMIT 1`;
    if (!u[0]) throw new DomainError('USER_NOT_FOUND', 'Esa persona no existe');
    const dup: any[] = await this.db.$queryRaw`
      SELECT 1 FROM lifebook.reports
       WHERE content_id=${String(targetId)}::uuid AND content_type='user' AND reporter_id=${reporterId}::uuid`;
    if (dup[0]) throw new DomainError('ALREADY_REPORTED', 'Ya reportaste a esta persona');
    await this.db.$queryRaw`
      INSERT INTO lifebook.reports (content_id, content_type, reporter_id, reason, note)
      VALUES (${String(targetId)}::uuid, 'user', ${reporterId}::uuid, ${reason}, ${String(note ?? '').slice(0, 300) || null})`;
    return { ok: true, reported: String(targetId) };
  }

  // =========================================================================
  // PARTE 27 (G3) — DESCUBRIR GRUPOS Y UNIRSE
  // Listado público con filtros, ficha pública, «Unirse» según la condición de
  // ingreso y solicitudes que decide el organizador.
  // =========================================================================

  /** Fila de grupo → ficha pública (sin miembros ni datos internos). */
  private serializeGroupCard(g: any, viewerId: string) {
    return {
      id: String(g.id),
      title: String(g.title ?? ''),
      photoUrl: g.photo_id ? `${USER_PHOTO_BASE}/${g.photo_id}` : null,
      city: g.city ?? null,
      barrio: g.barrio ?? null,
      category: g.category ?? null,
      description: g.description ?? null,
      topic: g.topic ?? null,
      visibility: (g.visibility ?? 'private') as 'public' | 'private' | 'hidden',
      joinMode: (g.join_mode ?? 'open') as 'open' | 'approval' | 'question',
      joinQuestion: g.join_question ?? null,
      ownerId: g.owner_id ? String(g.owner_id) : null,
      ownerName: g.owner_name ?? null,
      ownerAvatarUrl: g.owner_avatar ?? null,
      membersCount: Number(g.members_count ?? 0),
      // El punto de encuentro se oculta si el organizador lo pidió.
      placeName: g.hide_place ? null : (g.place_name ?? null),
      createdAt: g.created_at ? String(g.created_at) : null,
      /** Mi relación con el grupo: si ya soy miembro, con qué rol. */
      myRole: g.my_role ?? null,
      /** Estado de mi solicitud: pending | approved | rejected | null. */
      requestState: g.request_state ?? null,
      /** Solo en la ficha: quiénes están (vista previa). */
      members: Array.isArray(g.members) ? g.members : undefined,
    };
  }

  /**
   * Descubrimiento de grupos: solo los **públicos** (los privados se ven por
   * invitación y los ocultos no se listan nunca), con filtros de ciudad,
   * categoría y texto libre.
   */
  async groupList(viewerId: string, opts: { city?: string; category?: string; q?: string; cursor?: string; limit?: number } = {}) {
    const limit = Math.min(Math.max(Number(opts.limit ?? 20) || 20, 1), GROUP_LIST_MAX);
    const args: unknown[] = [viewerId];
    const conds: string[] = [`c.kind = 'group'`, `c.visibility = 'public'`];
    const city = this.optionalCity(opts.city);
    if (city) { args.push(city); conds.push(`c.city ILIKE $${args.length}`); }
    const category = this.cleanText(opts.category, 30);
    if (category) { args.push(category); conds.push(`c.category ILIKE $${args.length}`); }
    const term = this.normTerm(opts.q, 40);
    if (term) {
      // Todas las palabras del término deben aparecer (título, descripción, barrio).
      const words = term.split(' ').filter(Boolean).slice(0, 5);
      for (const w of words) {
        args.push(w);
        conds.push(`translate(lower(coalesce(c.title,'') || ' ' || coalesce(c.description,'') || ' ' || coalesce(c.barrio,'') || ' ' || coalesce(c.topic,'')), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN') LIKE '%' || $${args.length} || '%'`);
      }
    }
    if (opts.cursor) { args.push(String(opts.cursor)); conds.push(`c.created_at < $${args.length}::timestamptz`); }
    args.push(limit);
    const rows: any[] = await this.db.$queryRawUnsafe(
      `SELECT c.*, u.full_name AS owner_name, u.avatar_url AS owner_avatar,
              (SELECT count(*) FROM lifebook.group_members gm WHERE gm.conversation_id = c.id)::int AS members_count,
              (SELECT gm.role FROM lifebook.group_members gm
                WHERE gm.conversation_id = c.id AND gm.user_id = $1::uuid) AS my_role,
              (SELECT r.state FROM lifebook.group_join_requests r
                WHERE r.conversation_id = c.id AND r.user_id = $1::uuid) AS request_state
         FROM lifebook.conversations c
         LEFT JOIN mobility.users u ON u.id = c.owner_id
        WHERE ${conds.join(' AND ')}
        ORDER BY c.created_at DESC
        LIMIT $${args.length}`, ...args);
    const hasMore = rows.length === limit;
    return {
      groups: rows.map((g) => this.serializeGroupCard(g, viewerId)),
      nextCursor: hasMore && rows.length ? String(rows[rows.length - 1].created_at) : null,
    };
  }

  /**
   * Ficha pública de un grupo (para decidir si uno se une): incluye el estado de
   * mi solicitud y una vista previa de los miembros. Los grupos privados solo se
   * abren si ya soy miembro y los ocultos dan 404 (como si no existieran).
   */
  async groupCard(viewerId: string, convId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(String(convId))) throw new DomainError('GROUP_NOT_FOUND', 'Este grupo no existe');
    const rows: any[] = await this.db.$queryRaw`
      SELECT c.*, u.full_name AS owner_name, u.avatar_url AS owner_avatar,
             (SELECT count(*) FROM lifebook.group_members gm WHERE gm.conversation_id = c.id)::int AS members_count,
             (SELECT gm.role FROM lifebook.group_members gm
               WHERE gm.conversation_id = c.id AND gm.user_id = ${viewerId}::uuid) AS my_role,
             (SELECT r.state FROM lifebook.group_join_requests r
               WHERE r.conversation_id = c.id AND r.user_id = ${viewerId}::uuid) AS request_state
        FROM lifebook.conversations c
        LEFT JOIN mobility.users u ON u.id = c.owner_id
       WHERE c.id = ${convId}::uuid AND c.kind = 'group' LIMIT 1`;
    const g = rows[0];
    if (!g) throw new DomainError('GROUP_NOT_FOUND', 'Este grupo no existe');
    const member = !!g.my_role;
    if (g.visibility === 'hidden' && !member) throw new DomainError('GROUP_NOT_FOUND', 'Este grupo no existe');
    if (g.visibility === 'private' && !member) {
      throw new DomainError('GROUP_FORBIDDEN', 'Este grupo es privado: solo se entra por invitación');
    }
    const members: any[] = await this.db.$queryRawUnsafe(
      `SELECT gm.user_id, gm.role, gm.joined_at, u.full_name, u.avatar_url
         FROM lifebook.group_members gm JOIN mobility.users u ON u.id = gm.user_id
        WHERE gm.conversation_id = $1::uuid
        ORDER BY CASE gm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, gm.joined_at ASC
        LIMIT ${GROUP_CARD_MEMBERS_MAX}`, String(convId));
    return this.serializeGroupCard({
      ...g,
      members: members.map((m) => ({
        id: m.user_id, fullName: m.full_name, avatarUrl: m.avatar_url, role: m.role, joinedAt: String(m.joined_at),
      })),
    }, viewerId);
  }

  /** Respuesta normalizada para comparar con la de la pregunta de ingreso. */
  private normAnswer(value: unknown): string {
    return this.normTerm(value, JOIN_ANSWER_MAX);
  }

  /**
   * UNIRSE a un grupo según su condición de ingreso.
   * Devuelve `{ joined: true, group }` si ya estoy dentro, o
   * `{ requested: true, state: 'pending', group }` si queda una solicitud.
   */
  async groupJoin(userId: string, convId: string,
                  input: { answer?: string; note?: string; code?: string } = {}) {
    const g = await this.groupCard(userId, convId); // valida existencia/visibilidad
    if (g.myRole) return { joined: true, requested: false, state: null, group: g };

    // ── EL ENLACE: caducidad y TOPE DE USOS ────────────────────────────────────
    // Solo se mira si la entrada viene CON código (el enlace del perfil, el QR o lo que
    // alguien te haya pasado). Si el código no es el vigente no se aplica nada: puede ser
    // uno viejo que el dueño ya rotó, y entonces esta persona no viene de ese enlace.
    const codigoEnviado = input.code
      ? String(input.code).toUpperCase().replace(/[^A-Z0-9]/g, '')
      : '';
    let codigoVigente: string | null = null;
    if (codigoEnviado) {
      const fila: any[] = await this.db.$queryRaw`
        SELECT invite_code, invite_expires_at, invite_uses, invite_max_uses
          FROM lifebook.conversations WHERE id=${convId}::uuid LIMIT 1`;
      const actual = fila[0]?.invite_code ? String(fila[0].invite_code).toUpperCase() : null;
      if (actual && actual === codigoEnviado) {
        const expira = fila[0].invite_expires_at ? new Date(fila[0].invite_expires_at).getTime() : 0;
        if (expira <= Date.now()) {
          throw new DomainError('INVITE_CODE_INVALID', 'Ese código ha caducado: pide uno nuevo a quien te invitó');
        }
        const tope = fila[0].invite_max_uses == null ? null : Number(fila[0].invite_max_uses);
        const usos = Number(fila[0].invite_uses ?? 0);
        if (tope != null && usos >= tope) {
          throw new DomainError('INVITE_CODE_USED_UP',
            'Ese enlace ya no admite a más gente: pide uno nuevo a quien te invitó');
        }
        codigoVigente = actual;
      }
    }
    // Bloqueos: ni el dueño ni yo podemos entrar si hay bloqueo entre nosotros.
    if (g.ownerId) await this.assertNotBlocked(userId, String(g.ownerId), 'No puedes unirte a este grupo');
    if (g.membersCount >= 200) throw new DomainError('GROUP_FULL', 'El grupo ya tiene el máximo de 200 miembros');

    const answer = this.cleanText(input.answer, JOIN_ANSWER_MAX) || null;
    const note = this.cleanText(input.note, JOIN_NOTE_MAX) || null;

    // ¿Entra directo?
    let entraDirecto = g.joinMode === 'open';
    if (g.joinMode === 'question' && g.joinQuestion) {
      const esperada: any[] = await this.db.$queryRaw`
        SELECT join_answer FROM lifebook.conversations WHERE id=${convId}::uuid LIMIT 1`;
      const correcta = this.normAnswer(esperada[0]?.join_answer);
      // Sin respuesta guardada no hay nada que validar: se comporta como abierto.
      if (!correcta) entraDirecto = true;
      else if (answer && this.normAnswer(answer) === correcta) entraDirecto = true;
    }

    if (entraDirecto) {
      // Cobrar la entrada ANTES de meterlo, y de una sola vez: si dos personas entran a
      // la vez por el mismo enlace, el UPDATE solo deja pasar a las que caben.
      if (codigoVigente) {
        const cobrado: any[] = await this.db.$queryRaw`
          UPDATE lifebook.conversations
             SET invite_uses = invite_uses + 1
           WHERE id=${convId}::uuid
             AND invite_code=${codigoVigente}
             AND invite_expires_at > now()
             AND (invite_max_uses IS NULL OR invite_uses < invite_max_uses)
          RETURNING invite_uses, invite_max_uses`;
        if (!cobrado[0]) {
          throw new DomainError('INVITE_CODE_USED_UP',
            'Ese enlace ya no admite a más gente: pide uno nuevo a quien te invitó');
        }
      }
      await this.db.$queryRaw`
        INSERT INTO lifebook.group_members (conversation_id, user_id, role)
        VALUES (${convId}::uuid, ${userId}::uuid, 'member')
        ON CONFLICT DO NOTHING`;
      // Fuera la solicitud anterior (si la había) y aviso de bienvenida.
      await this.db.$queryRaw`
        DELETE FROM lifebook.group_join_requests WHERE conversation_id=${convId}::uuid AND user_id=${userId}::uuid`;
      const w: any[] = await this.db.$queryRaw`
        SELECT welcome_message FROM lifebook.conversations WHERE id=${convId}::uuid LIMIT 1`;
      const welcome = this.cleanText(w[0]?.welcome_message, 300);
      await this.pushSystemMessage(convId, welcome || '👋 Alguien se ha unido al grupo');
      return { joined: true, requested: false, state: null, group: await this.groupCard(userId, convId) };
    }

    // Solicitud pendiente (aprobación del organizador, o pregunta no acertada).
    await this.db.$queryRaw`
      INSERT INTO lifebook.group_join_requests (conversation_id, user_id, state, answer, note)
      VALUES (${convId}::uuid, ${userId}::uuid, 'pending', ${answer}, ${note})
      ON CONFLICT (conversation_id, user_id)
      DO UPDATE SET state='pending', answer=COALESCE(EXCLUDED.answer, lifebook.group_join_requests.answer),
                    note=COALESCE(EXCLUDED.note, lifebook.group_join_requests.note),
                    created_at=now(), decided_at=NULL, decided_by=NULL`;
    return { joined: false, requested: true, state: 'pending' as const, group: await this.groupCard(userId, convId) };
  }

  /** Cancelo mi solicitud para entrar en un grupo. */
  async groupJoinCancel(userId: string, convId: string) {
    await this.groupCard(userId, convId);
    await this.db.$queryRaw`
      DELETE FROM lifebook.group_join_requests WHERE conversation_id=${convId}::uuid AND user_id=${userId}::uuid`;
    return { ok: true, cancelled: true };
  }

  /** Solicitudes pendientes de un grupo (solo dueño y administradores). */
  async groupRequests(userId: string, convId: string) {
    await this.assertGroupRole(userId, convId, true);
    const rows: any[] = await this.db.$queryRaw`
      SELECT r.user_id, r.state, r.answer, r.note, r.created_at, r.decided_at,
             u.full_name, u.avatar_url, u.city
        FROM lifebook.group_join_requests r
        JOIN mobility.users u ON u.id = r.user_id
       WHERE r.conversation_id = ${convId}::uuid
       ORDER BY CASE r.state WHEN 'pending' THEN 0 ELSE 1 END, r.created_at DESC
       LIMIT 100`;
    const requests = rows.map((r) => ({
      userId: String(r.user_id),
      fullName: r.full_name ?? null,
      avatarUrl: r.avatar_url ?? null,
      city: r.city ?? null,
      state: String(r.state) as 'pending' | 'approved' | 'rejected',
      answer: r.answer ?? null,
      note: r.note ?? null,
      createdAt: String(r.created_at),
      decidedAt: r.decided_at ? String(r.decided_at) : null,
    }));
    return { requests, pending: requests.filter((r) => r.state === 'pending').length };
  }

  /**
   * El organizador aprueba o rechaza una solicitud. Aprobar mete a la persona en
   * el grupo (con el mensaje de bienvenida) y marca la solicitud como aprobada.
   */
  async groupRequestDecide(userId: string, convId: string, targetId: string, action: string) {
    await this.assertGroupRole(userId, convId, true);
    const accion = String(action ?? '').toLowerCase();
    if (!['approve', 'reject'].includes(accion)) throw new DomainError('ACTION_INVALID', 'Acción no válida');
    const rows: any[] = await this.db.$queryRaw`
      SELECT user_id, state FROM lifebook.group_join_requests
       WHERE conversation_id=${convId}::uuid AND user_id=${String(targetId)}::uuid LIMIT 1`;
    if (!rows[0]) throw new DomainError('REQUEST_NOT_FOUND', 'Esa persona no ha pedido entrar');
    if (accion === 'approve') {
      const c: any[] = await this.db.$queryRaw`
        SELECT count(*)::int AS n FROM lifebook.group_members WHERE conversation_id=${convId}::uuid`;
      if (Number(c[0]?.n ?? 0) >= 200) throw new DomainError('GROUP_FULL', 'El grupo ya tiene el máximo de 200 miembros');
      await this.db.$queryRaw`
        INSERT INTO lifebook.group_members (conversation_id, user_id, role)
        VALUES (${convId}::uuid, ${String(targetId)}::uuid, 'member')
        ON CONFLICT DO NOTHING`;
      await this.db.$queryRaw`
        UPDATE lifebook.group_join_requests
           SET state='approved', decided_at=now(), decided_by=${userId}::uuid
         WHERE conversation_id=${convId}::uuid AND user_id=${String(targetId)}::uuid`;
      const w: any[] = await this.db.$queryRaw`
        SELECT welcome_message FROM lifebook.conversations WHERE id=${convId}::uuid LIMIT 1`;
      const welcome = this.cleanText(w[0]?.welcome_message, 300);
      await this.pushSystemMessage(convId, welcome || '✅ El organizador ha aceptado a alguien nuevo en el grupo');
    } else {
      await this.db.$queryRaw`
        UPDATE lifebook.group_join_requests
           SET state='rejected', decided_at=now(), decided_by=${userId}::uuid
         WHERE conversation_id=${convId}::uuid AND user_id=${String(targetId)}::uuid`;
    }
    return this.groupRequests(userId, convId);
  }

  // =========================================================================
  // PARTE 26 (G2-c) — PLAZA DE RETOS
  // Retos de la comunidad: cualquiera crea uno (un objetivo con fecha), la gente
  // se apunta y el detalle devuelve el RANKING por orden de inscripción.
  // =========================================================================

  /** Fila de reto → forma del cliente (con autor, participantes y mis marcas). */
  private serializeChallenge(c: any, viewerId: string, members?: any[]) {
    const endsAt = c.ends_at ? String(c.ends_at) : null;
    const expired = !!endsAt && new Date(endsAt).getTime() < Date.now();
    const state = c.state === 'closed' || expired ? 'closed' : 'open';
    return {
      id: String(c.id),
      title: String(c.title ?? ''),
      body: c.body ? String(c.body) : null,
      city: c.city ?? null,
      prize: c.prize ?? null,
      coverUrl: c.cover_url ?? null,
      author: { id: String(c.author_id), fullName: c.full_name ?? null, avatarUrl: c.avatar_url ?? null },
      state,
      endsAt,
      closedAt: c.closed_at ? String(c.closed_at) : null,
      createdAt: String(c.created_at),
      entries: Number(c.entries ?? 0),
      joinedByMe: c.joined === true,
      mine: String(c.author_id) === viewerId,
      members: members?.map((m) => ({
        id: String(m.user_id),
        fullName: m.full_name ?? null,
        avatarUrl: m.avatar_url ?? null,
        note: m.note ?? null,
        joinedAt: String(m.created_at),
      })) ?? [],
    };
  }

  /**
   * Plaza de retos: lista de retos abiertos (por defecto), con filtros de ciudad
   * y de «los míos» / «a los que me he apuntado».
   */
  async challengeList(viewerId: string, opts: { city?: string; state?: string; mine?: boolean; joined?: boolean; limit?: number } = {}) {
    const limit = Math.min(Math.max(Number(opts.limit ?? 20) || 20, 1), 50);
    const args: unknown[] = [viewerId];
    const conds: string[] = [];
    const state = String(opts.state ?? 'open');
    if (state === 'open') conds.push(`(c.state = 'open' AND (c.ends_at IS NULL OR c.ends_at > now()))`);
    else if (state === 'closed') conds.push(`(c.state = 'closed' OR (c.ends_at IS NOT NULL AND c.ends_at <= now()))`);
    const city = this.optionalCity(opts.city);
    if (city) { args.push(city); conds.push(`c.city ILIKE $${args.length}`); }
    if (opts.mine) { args.push(viewerId); conds.push(`c.author_id = $${args.length}::uuid`); }
    if (opts.joined) { args.push(viewerId); conds.push(`EXISTS (SELECT 1 FROM lifebook.challenge_entries e WHERE e.challenge_id = c.id AND e.user_id = $${args.length}::uuid)`); }
    args.push(limit);
    const rows: any[] = await this.db.$queryRawUnsafe(
      `SELECT c.*, u.full_name, u.avatar_url,
              (SELECT count(*) FROM lifebook.challenge_entries e WHERE e.challenge_id = c.id)::int AS entries,
              EXISTS (SELECT 1 FROM lifebook.challenge_entries e WHERE e.challenge_id = c.id AND e.user_id = $1::uuid) AS joined
         FROM lifebook.challenges c
         JOIN mobility.users u ON u.id = c.author_id
        ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''}
        ORDER BY c.created_at DESC
        LIMIT $${args.length}`, ...args);
    return { challenges: rows.map((c) => this.serializeChallenge(c, viewerId)), total: rows.length };
  }

  /** Crea un reto (cualquiera puede). `endsAt` opcional: si no llega, no caduca. */
  async challengeCreate(userId: string, dto: {
    title?: string; body?: string; city?: string; prize?: string; endsAt?: string; coverUrl?: string;
  }) {
    await this.assertCanPost(userId);
    const title = this.cleanText(dto.title, CHALLENGE_TITLE_MAX);
    if (!title || title.length < 3) throw new DomainError('CHALLENGE_TITLE_REQUIRED', 'Ponle un título al reto (3 letras o más)');
    const body = this.cleanText(dto.body, CHALLENGE_BODY_MAX) || null;
    const city = this.optionalCity(dto.city);
    const prize = this.cleanText(dto.prize, CHALLENGE_PRIZE_MAX) || null;
    const coverUrl = this.isHttpUrl(String(dto.coverUrl ?? '')) ? String(dto.coverUrl).slice(0, 400) : null;
    let endsAt: string | null = null;
    if (dto.endsAt) {
      const d = new Date(String(dto.endsAt));
      if (!Number.isNaN(d.getTime()) && d.getTime() > Date.now()) endsAt = d.toISOString();
    }
    const rows: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.challenges (author_id, title, body, city, prize, cover_url, ends_at)
      VALUES (${userId}::uuid, ${title}, ${body}, ${city}, ${prize}, ${coverUrl},
              ${endsAt}::timestamptz)
      RETURNING *`;
    const u: any[] = await this.db.$queryRaw`
      SELECT full_name, avatar_url FROM mobility.users WHERE id=${userId}::uuid LIMIT 1`;
    return this.serializeChallenge({ ...rows[0], full_name: u[0]?.full_name, avatar_url: u[0]?.avatar_url, entries: 0, joined: false }, userId);
  }

  /** Detalle del reto con el RANKING de participantes (orden de inscripción). */
  async challengeDetail(challengeId: string, viewerId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(String(challengeId))) throw new DomainError('CHALLENGE_NOT_FOUND', 'Reto no encontrado');
    const rows: any[] = await this.db.$queryRaw`
      SELECT c.*, u.full_name, u.avatar_url,
             (SELECT count(*) FROM lifebook.challenge_entries e WHERE e.challenge_id = c.id)::int AS entries,
             EXISTS (SELECT 1 FROM lifebook.challenge_entries e WHERE e.challenge_id = c.id AND e.user_id = ${viewerId}::uuid) AS joined
        FROM lifebook.challenges c
        JOIN mobility.users u ON u.id = c.author_id
       WHERE c.id = ${challengeId}::uuid LIMIT 1`;
    if (!rows[0]) throw new DomainError('CHALLENGE_NOT_FOUND', 'Reto no encontrado');
    const members: any[] = await this.db.$queryRawUnsafe(
      `SELECT e.user_id, e.note, e.created_at, u.full_name, u.avatar_url
         FROM lifebook.challenge_entries e
         JOIN mobility.users u ON u.id = e.user_id
        WHERE e.challenge_id = $1::uuid
        ORDER BY e.created_at ASC
        LIMIT ${CHALLENGE_MEMBERS_MAX}`, String(challengeId));
    return this.serializeChallenge(rows[0], viewerId, members);
  }

  /** Me apunto a un reto (con una nota opcional). Idempotente. */
  async challengeJoin(userId: string, challengeId: string, note?: string) {
    const c = await this.challengeRow(challengeId);
    const expired = !!c.ends_at && new Date(String(c.ends_at)).getTime() < Date.now();
    if (c.state === 'closed' || expired) throw new DomainError('CHALLENGE_CLOSED', 'Ese reto ya está cerrado');
    const text = this.cleanText(note, CHALLENGE_NOTE_MAX) || null;
    await this.db.$queryRaw`
      INSERT INTO lifebook.challenge_entries (challenge_id, user_id, note)
      VALUES (${challengeId}::uuid, ${userId}::uuid, ${text})
      ON CONFLICT (challenge_id, user_id) DO UPDATE SET note = COALESCE(EXCLUDED.note, lifebook.challenge_entries.note)`;
    return this.challengeDetail(challengeId, userId);
  }

  /** Me borro de un reto. */
  async challengeLeave(userId: string, challengeId: string) {
    await this.challengeRow(challengeId);
    await this.db.$queryRaw`
      DELETE FROM lifebook.challenge_entries
       WHERE challenge_id=${challengeId}::uuid AND user_id=${userId}::uuid`;
    return this.challengeDetail(challengeId, userId);
  }

  /** El autor cierra su reto (deja de admitir participantes). */
  async challengeClose(userId: string, challengeId: string) {
    const c = await this.challengeRow(challengeId);
    if (String(c.author_id) !== userId) throw new DomainError('NOT_CHALLENGE_AUTHOR', 'Solo quien creó el reto puede cerrarlo');
    await this.db.$queryRaw`
      UPDATE lifebook.challenges SET state='closed', closed_at=now() WHERE id=${challengeId}::uuid`;
    return this.challengeDetail(challengeId, userId);
  }

  /**
   * El autor BORRA su reto. Solo si no tiene participantes: si ya hay gente
   * apuntada, se cierra (así nadie pierde su sitio sin avisar).
   */
  async challengeDelete(userId: string, challengeId: string) {
    const c = await this.challengeRow(challengeId);
    if (String(c.author_id) !== userId) throw new DomainError('NOT_CHALLENGE_AUTHOR', 'Solo quien creó el reto puede borrarlo');
    const n: any[] = await this.db.$queryRaw`
      SELECT count(*)::int AS n FROM lifebook.challenge_entries WHERE challenge_id=${challengeId}::uuid`;
    if (Number(n[0]?.n ?? 0) > 0) {
      throw new DomainError('CHALLENGE_HAS_ENTRIES', 'Ya hay gente apuntada: ciérralo en vez de borrarlo');
    }
    await this.db.$queryRaw`DELETE FROM lifebook.challenges WHERE id=${challengeId}::uuid`;
    return { ok: true, deleted: challengeId };
  }

  /** Fila cruda del reto (404 si no existe). */
  private async challengeRow(challengeId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(String(challengeId))) throw new DomainError('CHALLENGE_NOT_FOUND', 'Reto no encontrado');
    const rows: any[] = await this.db.$queryRaw`
      SELECT * FROM lifebook.challenges WHERE id=${challengeId}::uuid LIMIT 1`;
    if (!rows[0]) throw new DomainError('CHALLENGE_NOT_FOUND', 'Reto no encontrado');
    return rows[0];
  }

  /**
   * Reclamación por estafa: crea un reporte (motivo `fraud`) sobre la
   * conversación —o su último pedido— para que lo vea moderación.
   */  async chatClaim(userId: string, convId: string, note?: string) {
    const conv = await this.assertConvMember(userId, convId);
    const other = conv.kind === 'group' ? String(conv.owner_id) : this.otherOf(conv, userId);
    let contentId = convId;
    let contentType = 'conversation';
    // Si hay un pedido entre ambos, la reclamación apunta al pedido (más útil).
    const o: any[] = await this.db.$queryRaw`
      SELECT id FROM lifebook.orders
      WHERE (buyer_id=${userId}::uuid AND seller_id=${other}::uuid)
         OR (buyer_id=${other}::uuid AND seller_id=${userId}::uuid)
      ORDER BY created_at DESC LIMIT 1`;
    if (o[0]) { contentId = o[0].id; contentType = 'order'; }
    // Idempotente: repetir la reclamación del mismo contenido no falla.
    const ins: any[] = await this.db.$queryRaw`
      INSERT INTO lifebook.reports (reporter_id, content_id, content_type, reason, note)
      VALUES (${userId}::uuid, ${contentId}::uuid, ${contentType}, 'fraud',
              ${this.cleanText(note, 300) || 'Reclamación por posible estafa desde el chat'})
      ON CONFLICT (content_id, reporter_id) DO NOTHING
      RETURNING id`;
    return { ok: true, reported: contentType, contentId, already: !ins[0] };
  }

  private serialize(row: any, stats: { likes: number; comments: number; bookmarks: number; likedByMe: boolean; bookmarkedByMe: boolean }) {
    const mediaIds = Array.isArray(row.media_ids) ? row.media_ids : [];
    const topics = Array.isArray(row.payload?.topics) ? row.payload.topics : [];
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      city: row.city,
      barrio: row.barrio,
      tone: row.tone,
      topics,
      /** Parte 11: alias pedido por el cliente (mismo contenido que `topics`). */
      tags: topics,
      payload: row.payload ?? {},
      /** Parte 11: incluye `route` (ruta de la app) además de type/id. */
      serviceLink: this.serviceLinkOut(row.service_link),
      media: mediaIds.map((id: string) => ({ id, url: `${USER_PHOTO_BASE}/${id}` })),
      visibility: row.visibility,
      allowComments: row.allow_comments !== false,
      /** Parte 11: alias plano del guardado del visor. */
      savedByMe: !!stats.bookmarkedByMe,
      /** Parte 13: nº de guardados de la publicación. */
      savedCount: Number(stats.bookmarks ?? 0),
      /** Parte 13: el detalle no pertenece a ningún canal. */
      channel: null,
      createdAt: row.created_at ? String(row.created_at) : null,
      author: {
        id: row.author_id,
        fullName: row.full_name,
        /** Parte 11: alias corto del nombre. */
        name: row.full_name,
        avatarUrl: row.avatar_url,
        role: row.role,
        nameColor: row.name_color ?? '',
        /** Parte 11: ¿el visor sigue a este autor? */
        followedByMe: !!row.followed_by_me,
      },
      stats,
    };
  }

  private serializeFeed(row: any, extra: { channel?: string | null } = {}) {
    const mediaIds = Array.isArray(row.media_ids) ? row.media_ids : [];
    const topics = Array.isArray(row.payload?.topics) ? row.payload.topics : [];
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      body: row.body,
      city: row.city,
      barrio: row.barrio,
      topics,
      tags: topics,
      payload: row.payload ?? {},
      /**
       * TANDA I: el SITIO de la nota y a qué distancia está de mí (solo llega si el feed se pidió
       * con mi posición). `distanceKm` se redondea a 100 m: «3,2 km» es lo que se enseña, no 3,1974.
       */
      placeName: typeof row.payload?.placeName === 'string' ? row.payload.placeName : null,
      distanceKm: row.distance_km === null || row.distance_km === undefined
        ? null
        : Math.round(Number(row.distance_km) * 10) / 10,
      serviceLink: this.serviceLinkOut(row.service_link),
      /** Parte 7: nº total de fotos; la tarjeta solo trae la 1ª. */
      mediaCount: Number(row.media_count ?? mediaIds.length ?? 0),
      media: mediaIds.slice(0, 1).map((id: string) => ({ id, url: `${USER_PHOTO_BASE}/${id}` })),
      savedByMe: !!row.bookmarked,
      /** Parte 13: nº de guardados (para el contador de la tarjeta). */
      savedCount: Number(row.saves ?? 0),
      /** Parte 13: canal por el que salió la publicación (para el chip superior). */
      channel: extra.channel ?? null,
      createdAt: row.created_at ? String(row.created_at) : null,
      author: {
        id: row.author_id,
        fullName: row.full_name,
        name: row.full_name,
        avatarUrl: row.avatar_url,
        role: row.role,
        nameColor: row.name_color ?? '',
        followedByMe: !!row.followed_by_me,
      },
      stats: {
        likes: Number(row.likes ?? 0),
        comments: Number(row.comments ?? 0),
        likedByMe: !!row.liked,
        bookmarkedByMe: !!row.bookmarked,
      },
    };
  }
}



