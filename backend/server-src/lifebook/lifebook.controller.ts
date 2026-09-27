// =============================================================================
// LifebookController — LIFE BOOK Partes 1+2+3+4. Rutas (prefijo /wallet/api/v1/lifebook):
//   POST /posts                  (nota)
//   POST /posts/sale · POST /posts/service · POST /posts/debate
//   POST /posts/video · POST /posts/podcast · POST /posts/serie   (Parte 4)
//   POST /media/upload?kind=image|video|audio                      (Parte 4)
//   GET  /series/:serieId/episodes · POST /series/:serieId/episodes (Parte 4)
//   GET  /posts/feed?channel=&city=&type=&cursor= · GET /posts/for-you
//   GET  /posts/:id · POST /posts/:id/like|comment|bookmark (+DELETE)
//   Alias literal del cliente (Parte 12): POST /posts/:id/save {saved},
//   POST /posts/:id/comments {text}, POST /posts/:id/like {liked},
//   POST /users/:userId/follow {follow} y GET /posts/:id/comments?limit=&cursor=
//   GET  /search?q=&type=&city=&cursor= · GET /search/trends · GET /search/suggest  (Parte 9)
//   POST /users/:userId/follow (+DELETE)
//   GET  /users/:userId/profile · GET /users/:userId/posts   (Parte 3: perfil público)
//   GET  /debates/:id/proposals · POST /debates/:id/proposals
//   POST /proposals/:id/vote
//   POST /debates/:id/state
//   POST /report · GET /admin/reports (ADMIN)
// Canales (Parte 3): for_you | following | nearby | today | debates | food |
//   taxi | work | rental | sales | culture | music | sports
// Parte 24 (G2): el chat acepta `kind='location'` (lat/lng/label) y
//   `kind='vote'` (question + options), y las votaciones se votan en
//   POST /chat/messages/:messageId/vote { optionIdx }.
// Parte 25 (G2-b): el chat acepta `kind='chain'` (title/note/slots) y
//   `kind='checkin'` (label/lat/lng/at), y a los dos se apunta uno con
//   POST /chat/messages/:messageId/join { joined }. El TEMA del grupo se
//   guarda con PATCH /groups/:id/settings { topic }.
// Parte 26 (G2-c): el chat acepta `kind='ad'` (anuncio de grupo, máx. 15 por
//   persona y día → GET /me/ads-left) y la PLAZA DE RETOS vive en
//   /challenges (listar · crear · detalle con ranking · join/leave · close).
// =============================================================================

import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { LifebookService } from './lifebook.service';
import { CurrentUser, JwtAuthGuard, Roles, RolesGuard } from '../http/guards';
import { DomainError } from '../services/payment-auth.service';

const LINK_TYPES = ['taxi', 'food', 'ecomerse', 'work', 'rental', 'paquete', 'tickets', 'lifebook'];

/**
 * Un id de publicación TIENE que ser un uuid (la columna es `uuid` en Postgres).
 *
 * Validarlo ANTES de tocar la base no es cosmética: `${postId}::uuid` con un texto cualquiera
 * revienta en Postgres con `22P02 invalid input syntax for type uuid`, y eso salía como **500**
 * en rutas de LECTURA — ruido en los logs que tapa fallos de verdad, y encima por culpa de quien
 * llama. Con esto es un 400 con código propio.
 *
 * Es el mismo patrón (y el mismo regex) que ya usan `deletePost`, `media.service`, `orders`,
 * `commerce` y `hotel`: el proyecto lo repite en cada entrada en vez de tener un helper común.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class VideoDto {
  @IsString() @Length(3, 90)
  title!: string;
  @IsOptional() @IsString() @MaxLength(500)
  body?: string;
  @IsString() @Length(1, 90)
  city!: string;
  @IsOptional() @IsString() @MaxLength(90)
  barrio?: string;
  @IsString() @MaxLength(500)
  videoUrl!: string;
  @IsOptional() @IsString() @MaxLength(500)
  coverUrl?: string;
  // 50 minutos, no 60 segundos (Parte 50). El perfil `video_long` del servicio de media
  // acepta hasta MEDIA_MAX_VIDEO_LONG_SEC (3000 s) y lo COMPRUEBA con ffprobe sobre el
  // archivo real; este decorador es solo la puerta de entrada. Con `@Max(60)` el vídeo
  // subía entero (900 MB) y moría aquí, al publicar. Si cambia el `.env`, cambia esto.
  @IsInt() @Min(1) @Max(3000)
  durationSec!: number;
  @IsOptional() @IsBoolean()
  allowComments?: boolean;
  @IsOptional() @IsBoolean()
  allowDownload?: boolean;
  @IsOptional() @IsIn(['public', 'followers', 'private'])
  visibility?: string;
  /** TANDA C: productos de mi tienda que van DENTRO del vídeo (máx. 9). */
  @IsOptional() @IsArray() @IsString({ each: true })
  productIds?: string[];
}

class PodcastDto {
  @IsOptional() @IsString() @MaxLength(90)
  title?: string;
  @IsOptional() @IsString() @MaxLength(500)
  body?: string;
  @IsString() @Length(1, 90)
  city!: string;
  @IsOptional() @IsString() @MaxLength(90)
  barrio?: string;
  @IsString() @MaxLength(500)
  audioUrl!: string;
  @IsString() @MaxLength(500)
  coverUrl!: string;
  @IsInt() @Min(1) @Max(3600)
  durationSec!: number;
  @IsOptional() @IsBoolean()
  allowComments?: boolean;
  @IsOptional() @IsBoolean()
  allowDownload?: boolean;
  @IsOptional() @IsIn(['public', 'followers', 'private'])
  visibility?: string;
}

class SerieDto {
  @IsString() @Length(3, 90)
  title!: string;
  @IsOptional() @IsString() @MaxLength(500)
  body?: string;
  @IsString() @Length(1, 90)
  city!: string;
  @IsOptional() @IsString() @MaxLength(90)
  barrio?: string;
  @IsOptional() @IsString() @MaxLength(500)
  coverUrl?: string;
  @IsOptional() @IsBoolean()
  allowComments?: boolean;
  @IsOptional() @IsIn(['public', 'followers', 'private'])
  visibility?: string;
}

class EpisodeDto {
  @IsOptional() @IsString() @MaxLength(120)
  title?: string;
  @IsOptional() @IsString() @MaxLength(500)
  body?: string;
  @IsString() @MaxLength(500)
  videoUrl!: string;
  @IsOptional() @IsString() @MaxLength(500)
  coverUrl?: string;
  @IsInt() @Min(1) @Max(3600)
  durationSec!: number;
  @IsOptional() @IsInt() @Min(1) @Max(50)
  season?: number;
  @IsOptional() @IsInt() @Min(1) @Max(999)
  episode?: number;
  @IsOptional() @IsBoolean()
  allowDownload?: boolean;
}

class CreateNoteDto {
  @IsString() @Length(1, 500)
  body!: string;
  @IsOptional() @IsString() @MaxLength(90)
  title?: string;
  @IsOptional() @IsArray()
  media?: string[];
  @IsString() @Length(1, 90)
  city!: string;
  @IsOptional() @IsString() @MaxLength(90)
  barrio?: string;
  @IsOptional() @IsArray()
  topics?: string[];
  @IsOptional() @IsNumber() @Min(0.3) @Max(3)
  coverRatio?: number;
  @IsOptional() @IsIn(['info', 'opinion', 'denuncia', 'humor', 'pregunta'])
  tone?: string;
  @IsOptional() @IsIn(['public', 'followers', 'private'])
  visibility?: string;
  /** TANDA C: productos de MI tienda que van dentro de la nota (máx. 9). */
  @IsOptional() @IsArray() @IsString({ each: true })
  productIds?: string[];
  @IsOptional() @IsIn(LINK_TYPES)
  linkType?: string;
  @IsOptional() @IsString() @MaxLength(80)
  linkId?: string;
  /**
   * TANDA I — EL SITIO DE LA NOTA (POI): el lugar exacto y sus coordenadas.
   *
   * Se declaran aquí porque el DTO es estricto: sin esto el servidor rechaza la publicación con
   * «property placeName should not exist» y la nota se queda sin sitio (y sin sitio no puede salir
   * en «cerca de mí»).
   */
  @IsOptional() @IsString() @MaxLength(120)
  placeName?: string;
  @IsOptional() @IsNumber() @Min(-90) @Max(90)
  placeLat?: number;
  @IsOptional() @IsNumber() @Min(-180) @Max(180)
  placeLng?: number;
}

class CreateSaleDto {
  @IsString() @Length(3, 90)
  title!: string;
  @IsOptional() @IsString() @MaxLength(500)
  body?: string;
  @IsOptional() @IsArray()
  media?: string[];
  @IsString() @Length(1, 90)
  city!: string;
  @IsOptional() @IsString() @MaxLength(90)
  barrio?: string;
  @IsInt() @Min(0) @Max(100_000_000)
  priceXaf!: number;
  @IsOptional() @IsBoolean()
  negotiable?: boolean;
  @IsOptional() @IsIn(['nuevo', 'como_nuevo', 'usado', 'piezas'])
  condition?: string;
  @IsOptional() @IsString() @MaxLength(40)
  category?: string;
  @IsOptional() @IsArray()
  delivery?: string[];
  @IsOptional() @IsArray()
  paymentMethods?: string[];
  @IsOptional() @IsIn(['inapp', 'phone', 'whatsapp'])
  contactMode?: string;
  @IsOptional() @IsIn(LINK_TYPES)
  linkType?: string;
  @IsOptional() @IsString() @MaxLength(80)
  linkId?: string;
}

class CreateServiceDto {
  @IsString() @Length(1, 500)
  body!: string;
  @IsString() @Length(1, 90)
  city!: string;
  @IsOptional() @IsString() @MaxLength(90)
  barrio?: string;
  @IsOptional() @IsString() @MaxLength(40)
  serviceType?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000)
  priceXaf?: number;
  @IsOptional() @IsIn(['por_hora', 'por_servicio', 'negociable'])
  unit?: string;
  @IsOptional() @IsArray()
  availability?: string[];
  @IsOptional() @IsIn(['inapp', 'phone', 'whatsapp'])
  contactMode?: string;
  @IsOptional() @IsIn(LINK_TYPES)
  linkType?: string;
  @IsOptional() @IsString() @MaxLength(80)
  linkId?: string;
}

class CreateDebateDto {
  @IsString() @Length(5, 90)
  title!: string;
  @IsOptional() @IsString() @MaxLength(500)
  body?: string;
  @IsString() @Length(1, 90)
  city!: string;
  @IsOptional() @IsString() @MaxLength(90)
  barrio?: string;
  @IsIn(['transporte', 'seguridad', 'empleo', 'educacion', 'salud', 'agua', 'comercio', 'juventud', 'mujer', 'cultura', 'medio'])
  category!: string;
  @IsOptional() @IsString() @MaxLength(2000)
  problem?: string;
  @IsOptional() @IsString() @MaxLength(2000)
  context?: string;
  @IsOptional() @IsString() @MaxLength(2000)
  initialProposal?: string;
  @IsOptional() @IsBoolean()
  allowProposals?: boolean;
  @IsOptional() @IsBoolean()
  allowVotes?: boolean;
  @IsOptional() @IsBoolean()
  showApproxLoc?: boolean;
  @IsOptional() @IsArray()
  media?: string[];
}

class ProposalDto {
  @IsString() @Length(3, 300)
  body!: string;
  @IsOptional() @IsIn(['Vecinos', 'Ayuntamiento', 'Empresa', 'EG Route Plan', 'ONG', 'Otro'])
  whoShouldAct?: string;
}

class VoteDto {
  @IsIn(['agree', 'help', 'disagree'])
  vote!: string;
}

class DebateStateDto {
  @IsIn(['open', 'discussing', 'proposals', 'community_resolved', 'attention', 'closed'])
  state!: string;
  @IsOptional() @IsString() @MaxLength(500)
  summary?: string;
}

class CommentDto {
  // El texto sigue siendo obligatorio aunque se adjunte una publicación: así, si
  // algún día se borra lo adjunto, el comentario se lee entero (nunca una fila
  // vacía) y no hace falta guardar copia del original.
  @IsString() @Length(1, 1000)
  body!: string;
  @IsOptional() @IsString()
  parentId?: string;
  /** Publicación que se adjunta dentro del comentario (referencia, no copia). */
  @IsOptional() @IsString() @MaxLength(64)
  attachPostId?: string;
}

class ReportDto {
  @IsString()
  contentId!: string;
  @IsIn(['post', 'comment'])
  contentType!: string;
  @IsIn(['spam', 'fraud', 'false_content', 'harassment', 'hate', 'sexual', 'violence', 'personal_info', 'illegal_sale', 'impersonation', 'false_emergency'])
  reason!: string;
  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

// ---------------- PARTE 5: DTOs (chat · pedidos · moderación) ----------------
class ChatTargetDto { @IsString() userId!: string; }
/**
 * Parte 15: texto, o adjunto (`kind` + `postId`/`mediaUrl`).
 * Parte 24 (G2): `location` (lat/lng/label) y `vote` (question/options).
 * Parte 25 (G2-b): `chain` (title/note/slots) y `checkin` (label/lat/lng/at).
 * Los topes de aquí son **holgados a propósito** (el `whitelist` global exige
 * decorar todos los campos): quien valida de verdad —y devuelve los códigos que
 * la app traduce— es el servicio (`LOCATION_REQUIRED`, `VOTE_QUESTION_REQUIRED`,
 * `VOTE_OPTIONS_INVALID`, `CHAIN_TITLE_REQUIRED`, `CHECKIN_REQUIRED`).
 */
class SendDto {
  @IsOptional() @IsString() @Length(1, 1000)
  body?: string;
  @IsOptional() @IsString() @MaxLength(12)
  kind?: string;
  @IsOptional() @IsString() @MaxLength(64)
  postId?: string;
  /** TANDA D: tarjeta de PRODUCTO dentro del chat (`kind='product'`). */
  @IsOptional() @IsString() @MaxLength(64)
  productId?: string;
  /** Variante ya elegida por el cliente (la tarjeta la enseña). */
  @IsOptional() @IsString() @MaxLength(80)
  productVariant?: string;
  /** `true` cuando la tarjeta se manda al consultar desde la ficha del producto. */
  @IsOptional() @IsBoolean()
  productAsking?: boolean;
  @IsOptional() @IsString() @MaxLength(500)
  mediaUrl?: string;
  @IsOptional() @IsString() @MaxLength(120)
  fileName?: string;
  @IsOptional() @IsInt() @Min(0) @Max(300_000_000)
  fileSize?: number;
  /** Parte 24: ubicación compartida. */
  @IsOptional() @IsNumber()
  lat?: number;
  @IsOptional() @IsNumber()
  lng?: number;
  @IsOptional() @IsString() @MaxLength(300)
  label?: string;
  /** Parte 24: votación. */
  @IsOptional() @IsString() @MaxLength(300)
  question?: string;
  @IsOptional() @IsArray() @IsString({ each: true })
  options?: string[];
  /** Parte 25: cadena (título, nota y plazas). */
  @IsOptional() @IsString() @MaxLength(200)
  title?: string;
  @IsOptional() @IsString() @MaxLength(400)
  note?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1000)
  slots?: number;
  /** Parte 25: fecha/hora de la quedada (ISO). */
  @IsOptional() @IsString() @MaxLength(40)
  at?: string;
  /** Parte 26 (G2-c): anuncio de grupo (precio y enlace opcionales). */
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000)
  priceXaf?: number;
  @IsOptional() @IsString() @MaxLength(20)
  linkType?: string;
  @IsOptional() @IsString() @MaxLength(80)
  linkId?: string;
}

/** Parte 26 (G2-c) — crear un reto de la Plaza. */
export class ChallengeCreateDto {
  // El mínimo de 3 letras lo comprueba el SERVICIO, para que el código sea
  // `CHALLENGE_TITLE_REQUIRED` (la app lo traduce en su aviso).
  @IsString() @MaxLength(120)
  title!: string;
  @IsOptional() @IsString() @MaxLength(500)
  body?: string;
  @IsOptional() @IsString() @MaxLength(80)
  city?: string;
  @IsOptional() @IsString() @MaxLength(160)
  prize?: string;
  @IsOptional() @IsString() @MaxLength(40)
  endsAt?: string;
  @IsOptional() @IsString() @MaxLength(500)
  coverUrl?: string;
}

/** Parte 26 (G2-c) — apuntarse a un reto (nota opcional). */
export class ChallengeJoinDto {
  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}

/** Parte 27 (G3) — unirse a un grupo (respuesta a la pregunta y nota). */
export class GroupJoinDto {
  @IsOptional() @IsString() @MaxLength(200)
  answer?: string;
  @IsOptional() @IsString() @MaxLength(200)
  note?: string;
  /**
   * CÓDIGO del enlace de invitación, cuando se entra desde un enlace (el del perfil, el
   * QR o uno que te hayan pasado). Es lo que gasta una entrada del enlace y lo que hace
   * respetar su tope. Opcional: entrar buscando el grupo no lo manda.
   */
  @IsOptional() @IsString() @MaxLength(16)
  code?: string;
}

/** Parte 27 (G3) — el organizador decide una solicitud. */
export class GroupRequestDecideDto {
  @IsIn(['approve', 'reject'])
  action!: string;
}

/** Parte 28 (G4) — ubicación en vivo: coordenadas, etiqueta y duración. */
export class LiveLocationDto {
  @IsOptional() @IsNumber()
  lat?: number;
  @IsOptional() @IsNumber()
  lng?: number;
  @IsOptional() @IsString() @MaxLength(200)
  label?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1440)
  minutes?: number;
}

/** Parte 28 (G4) — reportar a una persona del chat. */
export class ReportUserDto {
  @IsIn(['spam', 'fraud', 'false_content', 'harassment', 'hate', 'sexual', 'violence', 'personal_info', 'illegal_sale', 'impersonation', 'false_emergency'])
  reason!: string;
  @IsOptional() @IsString() @MaxLength(300)
  note?: string;
}
class OrderCreateDto {
  @IsOptional() @IsString() postId?: string;
  @IsOptional() @IsString() @MaxLength(300) message?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) priceXaf?: number;
}
class OrderActionDto {
  @IsIn(['accept', 'decline', 'send', 'deliver', 'cancel', 'dispute'])
  action!: string;
}
class ModDecisionDto {
  @IsIn(['keep', 'hide', 'remove', 'warn', 'ban_publish', 'suspend_account', 'ban_account', 'restore'])
  action!: string;
  @IsOptional() @IsInt() @Min(1) @Max(365) days?: number;
  @IsOptional() @IsString() @MaxLength(300) note?: string;
}
class AppealDto { @IsOptional() @IsString() @MaxLength(300) note?: string; }
class ModUserActionDto { @IsIn(['lift_publish', 'unsuspend']) action!: string; }
class SettingsPatchDto {
  @IsOptional() publish?: Record<string, unknown>;
  @IsOptional() privacy?: Record<string, unknown>;
  @IsOptional() notifications?: Record<string, unknown>;
  @IsOptional() content?: Record<string, unknown>;
}
class CommentsStateDto { @IsBoolean() enabled!: boolean; }

/**
 * Parte 19/20 — DTO de grupo (fase Xiaohongshu).
 *
 * El `whitelist` global exige decorar TODOS los campos. Los topes de aquí son
 * **holgados a propósito**: quien recorta de verdad es el servicio
 * (`cleanText(city,40)`, `barrio,60`, `category,30`, `description,200`), de modo
 * que un texto largo se recorta en vez de devolver un 400 de validación.
 * Las reglas de negocio viven en el servicio para que los códigos sean los que
 * la app traduce en su aviso inline (`GROUP_TITLE_REQUIRED`,
 * `GROUP_MEMBERS_REQUIRED`).
 */
export class GroupCreateDto {
  @IsOptional() @IsString() @MaxLength(90)
  title?: string;
  @IsOptional() @IsArray() @IsString({ each: true })
  memberIds?: string[];
  @IsOptional() @IsString() @MaxLength(500)
  photoUrl?: string;
  @IsOptional() @IsString() @MaxLength(200)
  city?: string;
  @IsOptional() @IsString() @MaxLength(200)
  barrio?: string;
  @IsOptional() @IsString() @MaxLength(200)
  category?: string;
  @IsOptional() @IsString() @MaxLength(500)
  description?: string;
  @IsOptional() @IsString() @MaxLength(20)
  visibility?: 'public' | 'private' | 'hidden';
  @IsOptional() @IsArray() @IsString({ each: true })
  allowedKinds?: string[];
  /* ── Parte 21: punto de encuentro (buscador del geocoder) ── */
  @IsOptional() @IsString() @MaxLength(300)
  placeName?: string;
  @IsOptional() @IsString() @MaxLength(400)
  placeAddress?: string;
  @IsOptional() @IsNumber()
  placeLon?: number;
  @IsOptional() @IsNumber()
  placeLat?: number;
  @IsOptional() @IsBoolean()
  hidePlace?: boolean;
  /* ── Parte 21: condición de ingreso ── */
  @IsOptional() @IsString() @MaxLength(20)
  joinMode?: 'open' | 'approval' | 'question';
  @IsOptional() @IsString() @MaxLength(400)
  joinQuestion?: string;
  @IsOptional() @IsString() @MaxLength(200)
  joinAnswer?: string;
}

export class GroupUpdateDto extends GroupCreateDto {}

/** Parte 22 — ajustes de gestión del grupo (estilo Xiaohongshu). */
export class GroupSettingsDto {
  @IsOptional() @IsString() @MaxLength(500)
  announcement?: string;
  @IsOptional() @IsString() @MaxLength(300)
  welcomeMessage?: string;
  @IsOptional() @IsBoolean()
  showHistory?: boolean;
  @IsOptional() @IsBoolean()
  membersCanSpeak?: boolean;
  @IsOptional() @IsString() @MaxLength(20)
  invitePolicy?: 'all' | 'admins';
  /** Parte 25 (G2-b): tema del grupo (se anuncia en el hilo al cambiarlo). */
  @IsOptional() @IsString() @MaxLength(120)
  topic?: string;
  /** Parte 29 (G4): quitar inactivos y a partir de cuántos días. */
  @IsOptional() @IsBoolean()
  autoRemoveInactive?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(365)
  inactiveDays?: number;
}

export class GroupMemberDto {
  @IsString() @MaxLength(64)
  userId!: string;
}

@Controller('v1/lifebook')
export class LifebookController {
  constructor(private readonly lb: LifebookService) {}

  // ---------------- PUBLICAR ----------------
  @Post('posts')
  @UseGuards(JwtAuthGuard)
  createNote(@CurrentUser() actor: { userId: string }, @Body() dto: CreateNoteDto) {
    return this.lb.createNote(actor.userId, dto);
  }

  /**
   * TANDA C — los productos que van DENTRO de una nota. Público (como la nota): es lo que se
   * pinta en la barra bajo el texto o como sticker sobre el vídeo.
   */
  @Get('posts/:id/products')
  postProducts(@Param('id') id: string) {
    return this.lb.postProducts(String(id ?? ''));
  }

  /** TANDA C — cambiarlos después, sin reeditar la nota (solo el autor). */
  @Put('posts/:id/products')
  @UseGuards(JwtAuthGuard)
  setPostProducts(@CurrentUser() actor: { userId: string }, @Param('id') id: string,
                  @Body() dto: { productIds?: string[] }) {
    return this.lb.setPostProducts(actor.userId, String(id ?? ''), dto?.productIds);
  }

  @Post('posts/sale')
  @UseGuards(JwtAuthGuard)
  createSale(@CurrentUser() actor: { userId: string }, @Body() dto: CreateSaleDto) {
    return this.lb.createSale(actor.userId, dto);
  }

  @Post('posts/service')
  @UseGuards(JwtAuthGuard)
  createService(@CurrentUser() actor: { userId: string }, @Body() dto: CreateServiceDto) {
    return this.lb.createService(actor.userId, dto);
  }

  @Post('posts/debate')
  @UseGuards(JwtAuthGuard)
  createDebate(@CurrentUser() actor: { userId: string }, @Body() dto: CreateDebateDto) {
    return this.lb.createDebate(actor.userId, dto);
  }

  // ---------------- PARTE 4: MEDIA + VIDEO · PODCAST · SERIE ----------------
  @Post('media/upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 130 * 1024 * 1024 } }))
  uploadMedia(@Query() q: { kind?: string }, @UploadedFile() file: any) {
    return this.lb.uploadMedia(file, String(q.kind ?? ''));
  }

  @Post('posts/video')
  @UseGuards(JwtAuthGuard)
  createVideo(@CurrentUser() actor: { userId: string }, @Body() dto: VideoDto) {
    return this.lb.createVideo(actor.userId, dto);
  }

  @Post('posts/podcast')
  @UseGuards(JwtAuthGuard)
  createPodcast(@CurrentUser() actor: { userId: string }, @Body() dto: PodcastDto) {
    return this.lb.createPodcast(actor.userId, dto);
  }

  @Post('posts/serie')
  @UseGuards(JwtAuthGuard)
  createSerie(@CurrentUser() actor: { userId: string }, @Body() dto: SerieDto) {
    return this.lb.createSerie(actor.userId, dto);
  }

  /**
   * BORRAR una publicación propia (o cualquiera, si quien pide es ADMIN).
   *
   * Es la única ruta del API que borra una publicación: hasta la Parte 50-b no existía
   * ninguna, así que 900 MB publicados por error eran irrecuperables. Borra también los
   * archivos del almacén que sólo esa publicación usaba (ver `LifebookService.deletePost`).
   *
   * Va SIN `@Roles('ADMIN')`: el ADMIN puede borrar cualquiera, pero el caso normal es el
   * autor borrando lo suyo, y eso no se puede expresar con un guard de roles. El permiso se
   * decide en el servicio, contra `author_id` de la fila.
   */
  @Delete('posts/:id')
  @UseGuards(JwtAuthGuard)
  deletePost(@CurrentUser() actor: { userId: string; role?: string }, @Param('id') id: string) {
    return this.lb.deletePost(actor.userId, String(id ?? ''), actor.role ?? 'PASSENGER');
  }

  @Get('series/:serieId/episodes')
  @UseGuards(JwtAuthGuard)
  serieEpisodes(@CurrentUser() actor: { userId: string }, @Param('serieId') serieId: string) {
    return this.lb.serieEpisodes(serieId, actor.userId);
  }

  @Post('series/:serieId/episodes')
  @UseGuards(JwtAuthGuard)
  addEpisode(@CurrentUser() actor: { userId: string }, @Param('serieId') serieId: string, @Body() dto: EpisodeDto) {
    return this.lb.addSerieEpisode(actor.userId, serieId, dto);
  }

  // ---------------- LEER (estáticas antes de :id) ----------------
  @Get('posts/feed')
  @UseGuards(JwtAuthGuard)
  feed(@Query() q: {
    channel?: string; city?: string; type?: string; cursor?: string; limit?: string;
    /** TANDA I: mi posición, el radio, el orden y la ventana de tiempo del feed de Ciudad. */
    lat?: string; lng?: string; radiusKm?: string; sort?: string; since?: string;
  }, @CurrentUser() actor: { userId: string }) {
    if (q.channel) {
      // Parte 3: canales (for_you|following|nearby|today|debates|food|taxi|work|rental|sales|culture|music|sports).
      return this.lb.feedChannel(actor.userId, {
        channel: q.channel, city: q.city, type: q.type,
        cursor: q.cursor, limit: q.limit ? Number(q.limit) : undefined,
        lat: q.lat, lng: q.lng, radiusKm: q.radiusKm, sort: q.sort, since: q.since,
      });
    }
    // Sin channel → comportamiento Parte 1/2 (ciudad + type), intacto para E2E.
    return this.lb.feedCity(String(q.city ?? '').trim() || 'Malabo', {
      cursor: q.cursor, limit: q.limit ? Number(q.limit) : undefined,
      viewerId: actor.userId, type: q.type,
    });
  }

  @Get('posts/for-you')
  @UseGuards(JwtAuthGuard)
  forYou(@Query() q: { type?: string; cursor?: string; limit?: string }, @CurrentUser() actor: { userId: string }) {
    return this.lb.feedForYou(actor.userId, { cursor: q.cursor, limit: q.limit ? Number(q.limit) : undefined, type: q.type });
  }

  // ---------------- BÚSQUEDA (Parte 9) ----------------
  @Get('search/trends')
  @UseGuards(JwtAuthGuard)
  searchTrends(@Query() q: { city?: string; limit?: string }) {
    return this.lb.searchTrends({ city: q.city, limit: q.limit ? Number(q.limit) : undefined });
  }

  @Get('search/suggest')
  @UseGuards(JwtAuthGuard)
  searchSuggest(@Query() q: { q?: string; limit?: string }) {
    return this.lb.searchSuggest({ q: q.q, limit: q.limit ? Number(q.limit) : undefined });
  }

  @Get('search')
  @UseGuards(JwtAuthGuard)
  search(@CurrentUser() actor: { userId: string },
         @Query() q: { q?: string; type?: string; city?: string; cursor?: string; limit?: string }) {
    return this.lb.search(actor.userId, {
      q: q.q, type: q.type, city: q.city, cursor: q.cursor,
      limit: q.limit ? Number(q.limit) : undefined,
    });
  }

  // ---------------- PERFIL PÚBLICO (Parte 3) ----------------
  @Get('users/:userId/profile')
  @UseGuards(JwtAuthGuard)
  userProfile(@CurrentUser() actor: { userId: string }, @Param('userId') userId: string) {
    return this.lb.userProfile(userId, actor.userId);
  }

  @Get('users/:userId/posts')
  @UseGuards(JwtAuthGuard)
  userPosts(@CurrentUser() actor: { userId: string }, @Param('userId') userId: string,
            @Query() q: { type?: string; cursor?: string; limit?: string }) {
    return this.lb.userPosts(userId, actor.userId, {
      type: q.type, cursor: q.cursor, limit: q.limit ? Number(q.limit) : undefined,
    });
  }

  // ---------------- RELACIONADAS (Parte 10) ----------------
  @Get('posts/:id/related')
  @UseGuards(JwtAuthGuard)
  related(@CurrentUser() actor: { userId: string }, @Param('id') id: string, @Query() q: { limit?: string }) {
    return this.lb.relatedPosts(id, actor.userId, { limit: q.limit ? Number(q.limit) : undefined });
  }

  @Get('posts/:id')
  @UseGuards(JwtAuthGuard)
  async post(@CurrentUser() actor: { userId: string }, @Param('id') id: string) {
    const postId = String(id ?? '').trim();
    // El id se valida antes de tocar la base: si no es un uuid, Postgres contesta 22P02 y la
    // ruta de LECTURA devolvía 500. Un id mal formado lo mandó quien llama → 400.
    if (!UUID_RE.test(postId)) throw new DomainError('POST_ID_INVALID', 'Publicación no válida');
    const post = await this.lb.getPost(postId, actor.userId);
    // `getPost` devuelve `null` cuando la publicación no existe **o** cuando su visibilidad no
    // deja verla — a propósito, para no revelar que existe. Antes ese `null` salía como
    // **200 con el cuerpo vacío**: la app no podía distinguir «esta publicación ya no está»
    // (enseñar «se eliminó») de «no me llegó nada» (reintentar). El código es el mismo para los
    // dos casos, así que responder 404 no revela nada que el `null` no revelara ya.
    if (!post) throw new DomainError('POST_NOT_FOUND', 'Esa publicación no existe o ya no está');
    return post;
  }

  // ---------------- DEBATE: propuestas / votos / estados ----------------
  @Get('debates/:id/proposals')
  @UseGuards(JwtAuthGuard)
  proposals(@CurrentUser() actor: { userId: string }, @Param('id') id: string) {
    return this.lb.debateProposals(id, actor.userId);
  }

  @Post('debates/:id/proposals')
  @UseGuards(JwtAuthGuard)
  addProposal(@CurrentUser() actor: { userId: string }, @Param('id') id: string, @Body() dto: ProposalDto) {
    return this.lb.addProposal(actor.userId, id, dto.body, dto.whoShouldAct);
  }

  @Post('proposals/:id/vote')
  @UseGuards(JwtAuthGuard)
  voteProposal(@CurrentUser() actor: { userId: string }, @Param('id') id: string, @Body() dto: VoteDto) {
    return this.lb.voteProposal(actor.userId, id, dto.vote);
  }

  @Post('debates/:id/state')
  @UseGuards(JwtAuthGuard)
  setDebateState(@CurrentUser() actor: { userId: string; role: string }, @Param('id') id: string, @Body() dto: DebateStateDto) {
    return this.lb.setDebateState(actor.userId, actor.role, id, dto);
  }

  // ---------------- INTERACCIÓN ----------------
  // Contrato literal del cliente (Parte 12): el cuerpo puede llevar el estado
  // deseado — `{ liked }`, `{ follow }`, `{ saved }` — y la ruta /save actúa
  // como alias de /bookmark.
  @Post('posts/:id/like')
  @UseGuards(JwtAuthGuard)
  like(@CurrentUser() actor: { userId: string }, @Param('id') id: string, @Body() dto?: { reaction?: string; liked?: boolean }) {
    if (dto?.liked === false) return this.lb.unlike(actor.userId, id);
    return this.lb.like(actor.userId, id, dto?.reaction);
  }

  @Delete('posts/:id/like')
  @UseGuards(JwtAuthGuard)
  unlike(@CurrentUser() actor: { userId: string }, @Param('id') id: string) {
    return this.lb.unlike(actor.userId, id);
  }

  @Post('posts/:id/comment')
  @UseGuards(JwtAuthGuard)
  comment(@CurrentUser() actor: { userId: string }, @Param('id') id: string, @Body() dto: CommentDto) {
    return this.lb.comment(actor.userId, id, dto.body, dto.parentId, dto.attachPostId);
  }

  /** Alias literal: `POST /posts/:id/comments { text }` → comentario creado. */
  @Post('posts/:id/comments')
  @UseGuards(JwtAuthGuard)
  addComment(@CurrentUser() actor: { userId: string }, @Param('id') id: string, @Body() dto: { text?: string; body?: string; parentId?: string; attachPostId?: string }) {
    return this.lb.commentAsObject(actor.userId, id, String(dto?.text ?? dto?.body ?? ''), dto?.parentId, dto?.attachPostId);
  }

  /** Con `limit`/`cursor` devuelve `{comments,nextCursor,total}`; sin ellos, el array de siempre. */
  @Get('posts/:id/comments')
  @UseGuards(JwtAuthGuard)
  comments(@CurrentUser() actor: { userId: string }, @Param('id') id: string, @Query() q: { limit?: string; cursor?: string }) {
    if (q.limit || q.cursor) {
      return this.lb.commentsPage(id, { limit: q.limit ? Number(q.limit) : undefined, cursor: q.cursor, viewerId: actor.userId });
    }
    return this.lb.comments(id, actor.userId);
  }

  // ---------------- PARTE 14: me gusta en comentarios ----------------
  @Post('comments/:id/like')
  @UseGuards(JwtAuthGuard)
  likeComment(@CurrentUser() actor: { userId: string }, @Param('id') id: string) {
    return this.lb.commentLike(actor.userId, id);
  }

  @Delete('comments/:id/like')
  @UseGuards(JwtAuthGuard)
  unlikeComment(@CurrentUser() actor: { userId: string }, @Param('id') id: string) {
    return this.lb.commentUnlike(actor.userId, id);
  }

  @Post('users/:userId/follow')
  @UseGuards(JwtAuthGuard)
  follow(@CurrentUser() actor: { userId: string }, @Param('userId') userId: string, @Body() dto?: { follow?: boolean }) {
    if (dto?.follow === false) return this.lb.unfollow(actor.userId, userId);
    return this.lb.follow(actor.userId, userId);
  }

  @Delete('users/:userId/follow')
  @UseGuards(JwtAuthGuard)
  unfollow(@CurrentUser() actor: { userId: string }, @Param('userId') userId: string) {
    return this.lb.unfollow(actor.userId, userId);
  }

  @Post('posts/:id/bookmark')
  @UseGuards(JwtAuthGuard)
  bookmark(@CurrentUser() actor: { userId: string }, @Param('id') id: string) {
    return this.lb.bookmark(actor.userId, id);
  }

  @Delete('posts/:id/bookmark')
  @UseGuards(JwtAuthGuard)
  unbookmark(@CurrentUser() actor: { userId: string }, @Param('id') id: string) {
    return this.lb.unbookmark(actor.userId, id);
  }

  /** Alias literal: `POST /posts/:id/save { saved }` → guardar/quitar. */
  @Post('posts/:id/save')
  @UseGuards(JwtAuthGuard)
  save(@CurrentUser() actor: { userId: string }, @Param('id') id: string, @Body() dto?: { saved?: boolean }) {
    if (dto?.saved === false) return this.lb.unbookmark(actor.userId, id);
    return this.lb.bookmark(actor.userId, id);
  }

  // ---------------- PARTE 5: CHAT · PEDIDOS · TIENDA ----------------
  @Get('chat/conversations')
  @UseGuards(JwtAuthGuard)
  chatConversations(@CurrentUser() actor: { userId: string }) {
    return this.lb.chatConversations(actor.userId);
  }

  @Get('chat/unread')
  @UseGuards(JwtAuthGuard)
  chatUnread(@CurrentUser() actor: { userId: string }) {
    return this.lb.chatUnreadTotal(actor.userId);
  }

  @Post('chat/open')
  @UseGuards(JwtAuthGuard)
  chatOpen(@CurrentUser() actor: { userId: string }, @Body() dto: ChatTargetDto) {
    return this.lb.chatOpen(actor.userId, dto.userId);
  }

  @Get('chat/conversations/:convId/messages')
  @UseGuards(JwtAuthGuard)
  chatMessages(@CurrentUser() actor: { userId: string }, @Param('convId') convId: string,
               @Query() q: { before?: string; limit?: string }) {
    return this.lb.chatMessages(actor.userId, convId, { before: q.before, limit: q.limit ? Number(q.limit) : undefined });
  }

  @Post('chat/conversations/:convId/messages')
  @UseGuards(JwtAuthGuard)
  chatSend(@CurrentUser() actor: { userId: string }, @Param('convId') convId: string, @Body() dto: SendDto) {
    return this.lb.chatSend(actor.userId, convId, dto);
  }

  /**
   * Parte 24 (G2) — vota en un mensaje de votación (1 voto por persona: volver
   * a votar cambia el voto) y devuelve los recuentos actualizados.
   */
  @Post('chat/messages/:messageId/vote')
  @UseGuards(JwtAuthGuard)
  chatVote(@CurrentUser() actor: { userId: string }, @Param('messageId') messageId: string,
           @Body() dto: { optionIdx?: number }) {
    return this.lb.chatVote(actor.userId, messageId, dto?.optionIdx);
  }

  /**
   * Parte 25 (G2-b) — me apunto (o me doy de baja) en una CADENA o una QUEDADA.
   * Un apunte por persona; sin cuerpo se entiende que me apunto.
   */
  @Post('chat/messages/:messageId/join')
  @UseGuards(JwtAuthGuard)
  chatJoin(@CurrentUser() actor: { userId: string }, @Param('messageId') messageId: string,
           @Body() dto: { joined?: boolean }) {
    return this.lb.chatJoin(actor.userId, messageId, dto?.joined);
  }

  /* ══════════ PARTE 26 (G2-c) — ANUNCIO DE GRUPO Y PLAZA DE RETOS ══════════ */

  /** Cuántos anuncios de grupo me quedan hoy (límite: 15 por persona y día). */
  @Get('me/ads-left')
  @UseGuards(JwtAuthGuard)
  adsLeft(@CurrentUser() actor: { userId: string }) {
    return this.lb.adsLeftToday(actor.userId);
  }

  /** Plaza de retos: lista (abiertos por defecto), con filtros. */
  @Get('challenges')
  @UseGuards(JwtAuthGuard)
  challengeList(@CurrentUser() actor: { userId: string },
                @Query() q: { city?: string; state?: string; mine?: string; joined?: string; limit?: string }) {
    return this.lb.challengeList(actor.userId, {
      city: q.city,
      state: q.state,
      mine: String(q.mine ?? '') === '1' || String(q.mine ?? '') === 'true',
      joined: String(q.joined ?? '') === '1' || String(q.joined ?? '') === 'true',
      limit: q.limit ? Number(q.limit) : undefined,
    });
  }

  /** Crea un reto (cualquiera puede). */
  @Post('challenges')
  @UseGuards(JwtAuthGuard)
  challengeCreate(@CurrentUser() actor: { userId: string }, @Body() dto: ChallengeCreateDto) {
    return this.lb.challengeCreate(actor.userId, dto);
  }

  /** Detalle del reto con el RANKING de participantes. */
  @Get('challenges/:id')
  @UseGuards(JwtAuthGuard)
  challengeDetail(@CurrentUser() actor: { userId: string }, @Param('id') id: string) {
    return this.lb.challengeDetail(id, actor.userId);
  }

  /** Me apunto al reto (nota opcional). */
  @Post('challenges/:id/join')
  @UseGuards(JwtAuthGuard)
  challengeJoin(@CurrentUser() actor: { userId: string }, @Param('id') id: string, @Body() dto: ChallengeJoinDto) {
    return this.lb.challengeJoin(actor.userId, id, dto?.note);
  }

  /** Me borro del reto. */
  @Delete('challenges/:id/join')
  @UseGuards(JwtAuthGuard)
  challengeLeave(@CurrentUser() actor: { userId: string }, @Param('id') id: string) {
    return this.lb.challengeLeave(actor.userId, id);
  }

  /** El autor cierra su reto. */
  @Post('challenges/:id/close')
  @UseGuards(JwtAuthGuard)
  challengeClose(@CurrentUser() actor: { userId: string }, @Param('id') id: string) {
    return this.lb.challengeClose(actor.userId, id);
  }

  /** El autor borra su reto (solo si nadie se ha apuntado todavía). */
  @Delete('challenges/:id')
  @UseGuards(JwtAuthGuard)
  challengeDelete(@CurrentUser() actor: { userId: string }, @Param('id') id: string) {
    return this.lb.challengeDelete(actor.userId, id);
  }

  @Post('chat/conversations/:convId/read')
  @UseGuards(JwtAuthGuard)
  chatMarkRead(@CurrentUser() actor: { userId: string }, @Param('convId') convId: string) {
    return this.lb.chatMarkRead(actor.userId, convId);
  }

  @Post('posts/:id/order')
  @UseGuards(JwtAuthGuard)
  createOrder(@CurrentUser() actor: { userId: string }, @Param('id') id: string, @Body() dto: OrderCreateDto) {
    return this.lb.createOrder(actor.userId, { postId: id, message: dto.message, priceXaf: dto.priceXaf });
  }

  @Get('orders')
  @UseGuards(JwtAuthGuard)
  listOrders(@CurrentUser() actor: { userId: string }, @Query() q: { side?: string }) {
    return this.lb.listOrders(actor.userId, String(q.side ?? 'buyer') === 'seller' ? 'seller' : 'buyer');
  }

  @Get('orders/:id')
  @UseGuards(JwtAuthGuard)
  orderDetail(@CurrentUser() actor: { userId: string }, @Param('id') id: string) {
    return this.lb.orderDetail(actor.userId, id);
  }

  @Post('orders/:id/action')
  @UseGuards(JwtAuthGuard)
  orderAction(@CurrentUser() actor: { userId: string }, @Param('id') id: string, @Body() dto: OrderActionDto) {
    return this.lb.orderAction(actor.userId, id, { action: dto.action });
  }

  @Get('stores/:sellerId')
  @UseGuards(JwtAuthGuard)
  storeProfile(@CurrentUser() actor: { userId: string }, @Param('sellerId') sellerId: string) {
    return this.lb.storeProfile(actor.userId, sellerId);
  }

  // ---------------- MODERACIÓN (cola + decisiones + apelación) ----------------
  @Post('report')
  @UseGuards(JwtAuthGuard)
  report(@CurrentUser() actor: { userId: string }, @Body() dto: ReportDto) {
    return this.lb.report(actor.userId, dto.contentId, dto.contentType, dto.reason, dto.note);
  }

  @Get('admin/reports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  adminReports(@Query() q: { state?: string; reason?: string; limit?: string }) {
    return this.lb.adminReports({ state: q.state, reason: q.reason, limit: q.limit ? Number(q.limit) : undefined });
  }

  // --- Parte 5: cola rica, detalle, decisiones y apelaciones (ADMIN las 3 primeras) ---
  @Get('mod/reports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  modQueue(@Query() q: { state?: string; reason?: string; contentType?: string; limit?: string }) {
    return this.lb.modQueue({
      state: q.state, reason: q.reason, contentType: q.contentType,
      limit: q.limit ? Number(q.limit) : undefined,
    });
  }

  @Get('mod/reports/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  modReportDetail(@Param('id') id: string) {
    return this.lb.modReportDetail(id);
  }

  @Post('mod/reports/:id/decision')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  modDecision(@CurrentUser() actor: { userId: string; role: string }, @Param('id') id: string, @Body() dto: ModDecisionDto) {
    return this.lb.modDecision(actor.userId, id, { action: dto.action, days: dto.days, note: dto.note });
  }

  @Post('mod/reports/:id/appeal')
  @UseGuards(JwtAuthGuard)
  appealReport(@CurrentUser() actor: { userId: string }, @Param('id') id: string, @Body() dto: AppealDto) {
    return this.lb.appealReport(actor.userId, id, { note: dto.note });
  }

  @Post('mod/users/:userId/action')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  modUserAction(@CurrentUser() actor: { userId: string; role: string }, @Param('userId') userId: string, @Body() dto: ModUserActionDto) {
    return this.lb.modUserAction(actor.userId, userId, { action: dto.action });
  }

  // --- Parte 6: ajustes de Life Book · bloqueos · comentarios ---
  @Get('me/settings')
  @UseGuards(JwtAuthGuard)
  lbSettings(@CurrentUser() actor: { userId: string }) {
    return this.lb.lbSettings(actor.userId);
  }

  @Patch('me/settings')
  @UseGuards(JwtAuthGuard)
  updateLbSettings(@CurrentUser() actor: { userId: string }, @Body() dto: Record<string, Record<string, unknown>>) {
    return this.lb.updateLbSettings(actor.userId, dto);
  }

  @Get('me/blocks')
  @UseGuards(JwtAuthGuard)
  myBlocks(@CurrentUser() actor: { userId: string }) {
    return this.lb.myBlocks(actor.userId);
  }

  @Post('users/:userId/block')
  @UseGuards(JwtAuthGuard)
  blockUser(@CurrentUser() actor: { userId: string }, @Param('userId') userId: string) {
    return this.lb.blockUser(actor.userId, userId);
  }

  @Delete('users/:userId/block')
  @UseGuards(JwtAuthGuard)
  unblockUser(@CurrentUser() actor: { userId: string }, @Param('userId') userId: string) {
    return this.lb.unblockUser(actor.userId, userId);
  }

  @Post('posts/:id/comments-state')
  @UseGuards(JwtAuthGuard)
  setCommentsState(@CurrentUser() actor: { userId: string; role: string }, @Param('id') id: string, @Body() dto: CommentsStateDto) {
    return this.lb.setCommentsEnabled(actor.userId, actor.role, id, dto.enabled);
  }

  // --- Parte 7: BANDEJA (iconos del header de Mensajes) ---
  // ---------------- SEGUIR VIENDO (progreso de reproducción) ----------------

  /** Guarda por dónde vas de un vídeo. `POST` y no `PUT` para no tocar los imports. */
  @Post('watch/:postId')
  @UseGuards(JwtAuthGuard)
  guardarProgreso(@CurrentUser() actor: { userId: string }, @Param('postId') postId: string, @Body() dto: { positionSec?: number; durationSec?: number }) {
    return this.lb.guardarProgreso(actor.userId, postId, dto?.positionSec, dto?.durationSec);
  }

  /** Por dónde ibas (para reanudar). Ceros si no hay nada guardado. */
  @Get('watch/:postId')
  @UseGuards(JwtAuthGuard)
  progreso(@CurrentUser() actor: { userId: string }, @Param('postId') postId: string) {
    return this.lb.progreso(actor.userId, postId);
  }

  /** Quita un vídeo de «seguir viendo». */
  @Delete('watch/:postId')
  @UseGuards(JwtAuthGuard)
  borrarProgreso(@CurrentUser() actor: { userId: string }, @Param('postId') postId: string) {
    return this.lb.borrarProgreso(actor.userId, postId);
  }

  /** A quién sigo: la fila de avatares de la pestaña «Seguidos». */
  @Get('me/following')
  @UseGuards(JwtAuthGuard)
  aQuienSigo(@CurrentUser() actor: { userId: string }, @Query() q: { limit?: string }) {
    return this.lb.aQuienSigo(actor.userId, { limit: q.limit ? Number(q.limit) : undefined });
  }

  /** Los vídeos que dejé a medias, para la fila «Seguir viendo». */
  @Get('me/continue-watching')
  @UseGuards(JwtAuthGuard)
  seguirViendo(@CurrentUser() actor: { userId: string }, @Query() q: { limit?: string }) {
    return this.lb.seguirViendo(actor.userId, { limit: q.limit ? Number(q.limit) : undefined });
  }

  @Get('me/inbox-counts')
  @UseGuards(JwtAuthGuard)
  inboxCounts(@CurrentUser() actor: { userId: string }) {
    return this.lb.inboxCounts(actor.userId);
  }

  @Get('me/likes-received')
  @UseGuards(JwtAuthGuard)
  likesReceived(@CurrentUser() actor: { userId: string }, @Query() q: { limit?: string }) {
    return this.lb.likesReceived(actor.userId, { limit: q.limit ? Number(q.limit) : undefined });
  }

  @Get('me/saves-received')
  @UseGuards(JwtAuthGuard)
  savesReceived(@CurrentUser() actor: { userId: string }, @Query() q: { limit?: string }) {
    return this.lb.savesReceived(actor.userId, { limit: q.limit ? Number(q.limit) : undefined });
  }

  @Get('me/new-followers')
  @UseGuards(JwtAuthGuard)
  newFollowers(@CurrentUser() actor: { userId: string }, @Query() q: { limit?: string }) {
    return this.lb.newFollowers(actor.userId, { limit: q.limit ? Number(q.limit) : undefined });
  }

  @Get('me/suggested-users')
  @UseGuards(JwtAuthGuard)
  suggestedUsers(@CurrentUser() actor: { userId: string }, @Query() q: { limit?: string }) {
    return this.lb.suggestedUsers(actor.userId, { limit: q.limit ? Number(q.limit) : undefined });
  }

  @Get('me/comments-received')
  @UseGuards(JwtAuthGuard)
  commentsReceived(@CurrentUser() actor: { userId: string }, @Query() q: { limit?: string }) {
    return this.lb.commentsReceived(actor.userId, { limit: q.limit ? Number(q.limit) : undefined });
  }

  @Get('me/mentions')
  @UseGuards(JwtAuthGuard)
  mentionsReceived(@CurrentUser() actor: { userId: string }, @Query() q: { limit?: string }) {
    return this.lb.mentionsReceived(actor.userId, { limit: q.limit ? Number(q.limit) : undefined });
  }

  @Post('me/mentions/read')
  @UseGuards(JwtAuthGuard)
  markMentionsRead(@CurrentUser() actor: { userId: string }) {
    return this.lb.markMentionsRead(actor.userId);
  }

  // ---------------- PARTE 16: leído en la bandeja + mis guardados ----------------

  /** Marca una bandeja como leída (`likes` · `followers` · `comments`). */
  @Post('me/inbox/read')
  @UseGuards(JwtAuthGuard)
  inboxMarkRead(@CurrentUser() actor: { userId: string }, @Body() dto: { kind?: string }) {
    return this.lb.inboxMarkRead(actor.userId, String(dto?.kind ?? ''));
  }

  /** Mis guardados (publicaciones que yo marqué), paginados por cursor. */
  @Get('me/saves')
  @UseGuards(JwtAuthGuard)
  mySaves(@CurrentUser() actor: { userId: string }, @Query() q: { cursor?: string; limit?: string }) {
    return this.lb.mySaves(actor.userId, {
      cursor: q.cursor, limit: q.limit ? Number(q.limit) : undefined,
    });
  }

  /**
   * Parte 30 (Fase 05) — BÚSQUEDA GLOBAL DE MENSAJES: busca en TODOS mis chats a
   * la vez, con filtro por tipo (`kind`) y por chat (`conversationId`), paginando
   * por fecha. Respeta lo que borré de mi historial y el «compartir historial».
   */
  @Get('me/messages/search')
  @UseGuards(JwtAuthGuard)
  searchMyMessages(@CurrentUser() actor: { userId: string },
                   @Query() q: { q?: string; kind?: string; conversationId?: string; before?: string; limit?: string }) {
    return this.lb.searchMyMessages(actor.userId, {
      q: q.q, kind: q.kind, conversationId: q.conversationId, before: q.before,
      limit: q.limit ? Number(q.limit) : undefined,
    });
  }

  // ---------------- PARTE 17 (G1): GRUPOS + AJUSTES DEL CHAT ----------------

  /**
   * Parte 27 (G3) — DESCUBRIR GRUPOS: listado de los públicos con filtros de
   * ciudad, categoría y texto libre, y marcas de «ya soy miembro» / «tengo
   * solicitud pendiente».
   */
  @Get('groups')
  @UseGuards(JwtAuthGuard)
  groupList(@CurrentUser() actor: { userId: string },
            @Query() q: { city?: string; category?: string; q?: string; cursor?: string; limit?: string }) {
    return this.lb.groupList(actor.userId, {
      city: q.city, category: q.category, q: q.q, cursor: q.cursor,
      limit: q.limit ? Number(q.limit) : undefined,
    });
  }

  /**
   * Parte 28 (G4) — grupo al que corresponde un CÓDIGO de ruta (para entrar sin
   * buscador). Va ANTES de `groups/:id` para que «by-code» no se lea como un id.
   */
  @Get('groups/by-code/:code')
  @UseGuards(JwtAuthGuard)
  groupByCode(@CurrentUser() actor: { userId: string }, @Param('code') code: string) {
    return this.lb.groupByCode(actor.userId, code);
  }

  @Post('groups')
  @UseGuards(JwtAuthGuard)
  groupCreate(@CurrentUser() actor: { userId: string }, @Body() dto: GroupCreateDto) {
    return this.lb.groupCreate(actor.userId, dto);
  }

  @Get('groups/:id')
  @UseGuards(JwtAuthGuard)
  groupDetails(@CurrentUser() actor: { userId: string }, @Param('id') id: string) {
    return this.lb.groupDetails(actor.userId, id);
  }

  /** Parte 27 (G3): FICHA PÚBLICA de un grupo (para decidir si me uno). */
  @Get('groups/:id/card')
  @UseGuards(JwtAuthGuard)
  groupCard(@CurrentUser() actor: { userId: string }, @Param('id') id: string) {
    return this.lb.groupCard(actor.userId, id);
  }

  /**
   * Parte 28 (G4) — CÓDIGO de invitación del grupo (dueño y administradores):
   * sirve para invitar sin buscador y para el QR.
   */
  @Get('groups/:id/invite')
  @UseGuards(JwtAuthGuard)
  groupInviteCode(@CurrentUser() actor: { userId: string }, @Param('id') id: string,
                  @Query() q: { maxUses?: string; days?: string }) {
    // `maxUses` y `days` son opcionales: sin ellos se comporta como siempre. Con ellos se
    // crea un enlace NUEVO con ese tope y esos días (y el contador a cero).
    // '' = no se toca · 'null' = sin tope · número = tope.
    const maxUses = q?.maxUses === undefined || q.maxUses === ''
      ? undefined
      : (q.maxUses === 'null' ? null : Math.max(1, Math.min(10000, Number(q.maxUses))));
    const days = q?.days === undefined || q.days === '' ? undefined : Number(q.days);
    return this.lb.groupInviteCode(actor.userId, id, { maxUses, days });
  }

  /**
   * Parte 27 (G3) — UNIRSE a un grupo: entra directo (open), deja una solicitud
   * (approval) o valida la respuesta de la pregunta de ingreso (question).
   */
  @Post('groups/:id/join')
  @UseGuards(JwtAuthGuard)
  groupJoin(@CurrentUser() actor: { userId: string }, @Param('id') id: string, @Body() dto: GroupJoinDto) {
    // `dto.code` es opcional: va cuando se entra desde un ENLACE de invitación, y es lo
    // que gasta una de las entradas del enlace (y lo que hace respetar su tope).
    return this.lb.groupJoin(actor.userId, id, (dto ?? {}) as { answer?: string; note?: string; code?: string });
  }

  /** Parte 27 (G3): cancelo mi solicitud para entrar. */
  @Delete('groups/:id/join')
  @UseGuards(JwtAuthGuard)
  groupJoinCancel(@CurrentUser() actor: { userId: string }, @Param('id') id: string) {
    return this.lb.groupJoinCancel(actor.userId, id);
  }

  /** Parte 27 (G3): solicitudes del grupo (dueño y administradores). */
  @Get('groups/:id/requests')
  @UseGuards(JwtAuthGuard)
  groupRequests(@CurrentUser() actor: { userId: string }, @Param('id') id: string) {
    return this.lb.groupRequests(actor.userId, id);
  }

  /** Parte 27 (G3): aprobar o rechazar la solicitud de alguien. */
  @Post('groups/:id/requests/:userId')
  @UseGuards(JwtAuthGuard)
  groupRequestDecide(@CurrentUser() actor: { userId: string }, @Param('id') id: string,
                     @Param('userId') targetId: string, @Body() dto: GroupRequestDecideDto) {
    return this.lb.groupRequestDecide(actor.userId, id, targetId, dto?.action);
  }

  /**
   * Parte 29 (G4) — QUITAR INACTIVOS: revisa (o limpia) a los miembros que llevan
   * `inactive_days` sin dar señales en el grupo; nunca toca al dueño ni a los
   * administradores. Con `dryRun` solo enseña a quién quitaría, y `days` permite
   * revisar con otro umbral.
   */
  @Post('groups/:id/sweep-inactive')
  @UseGuards(JwtAuthGuard)
  groupSweepInactive(@CurrentUser() actor: { userId: string }, @Param('id') id: string,
                     @Body() dto: { days?: number; dryRun?: boolean }) {
    return this.lb.groupSweepInactive(actor.userId, id, dto ?? {});
  }

  @Patch('groups/:id')
  @UseGuards(JwtAuthGuard)
  groupUpdate(@CurrentUser() actor: { userId: string }, @Param('id') id: string,
              @Body() dto: GroupUpdateDto) {
    return this.lb.groupUpdate(actor.userId, id, dto);
  }

  @Post('groups/:id/members')
  @UseGuards(JwtAuthGuard)
  groupAddMembers(@CurrentUser() actor: { userId: string }, @Param('id') id: string, @Body() dto: { memberIds?: string[] }) {
    return this.lb.groupAddMembers(actor.userId, id, dto?.memberIds ?? []);
  }

  @Delete('groups/:id/members/:userId')
  @UseGuards(JwtAuthGuard)
  groupRemoveMember(@CurrentUser() actor: { userId: string }, @Param('id') id: string, @Param('userId') targetId: string) {
    return this.lb.groupRemoveMember(actor.userId, id, targetId);
  }

  @Post('groups/:id/leave')
  @UseGuards(JwtAuthGuard)
  groupLeave(@CurrentUser() actor: { userId: string }, @Param('id') id: string) {
    return this.lb.groupLeave(actor.userId, id);
  }

  /* ---------------- PARTE 22: GESTIÓN DE GRUPO (Xiaohongshu) ---------------- */

  /** Ajustes: anuncio, bienvenida, historial, quién habla, quién invita. */
  @Patch('groups/:id/settings')
  @UseGuards(JwtAuthGuard)
  groupSettings(@CurrentUser() actor: { userId: string }, @Param('id') id: string,
                @Body() dto: GroupSettingsDto) {
    return this.lb.groupSettings(actor.userId, id, dto);
  }

  /** Nombra administrador (solo el dueño). */
  @Post('groups/:id/admins')
  @UseGuards(JwtAuthGuard)
  groupSetAdmin(@CurrentUser() actor: { userId: string }, @Param('id') id: string, @Body() dto: GroupMemberDto) {
    return this.lb.groupSetAdmin(actor.userId, id, dto.userId);
  }

  /** Quita el rol de administrador (solo el dueño). */
  @Delete('groups/:id/admins/:userId')
  @UseGuards(JwtAuthGuard)
  groupUnsetAdmin(@CurrentUser() actor: { userId: string }, @Param('id') id: string, @Param('userId') targetId: string) {
    return this.lb.groupUnsetAdmin(actor.userId, id, targetId);
  }

  /** Cede el grupo: el dueño actual pasa a administrador. */
  @Post('groups/:id/owner')
  @UseGuards(JwtAuthGuard)
  groupTransfer(@CurrentUser() actor: { userId: string }, @Param('id') id: string, @Body() dto: GroupMemberDto) {
    return this.lb.groupTransfer(actor.userId, id, dto.userId);
  }

  /** Disuelve el grupo (solo el dueño): borra miembros y mensajes. */
  @Delete('groups/:id')
  @UseGuards(JwtAuthGuard)
  groupDissolve(@CurrentUser() actor: { userId: string }, @Param('id') id: string) {
    return this.lb.groupDissolve(actor.userId, id);
  }

  /** No molestar · fijar arriba · fondo del chat. */
  @Post('chat/conversations/:convId/prefs')
  @UseGuards(JwtAuthGuard)
  chatPrefs(@CurrentUser() actor: { userId: string }, @Param('convId') convId: string,
            @Body() dto: { muted?: boolean; pinned?: boolean; background?: string | null }) {
    return this.lb.chatPrefs(actor.userId, convId, dto ?? {});
  }

  /** Borra MI historial del chat. */
  @Delete('chat/conversations/:convId/messages')
  @UseGuards(JwtAuthGuard)
  chatClear(@CurrentUser() actor: { userId: string }, @Param('convId') convId: string) {
    return this.lb.chatClear(actor.userId, convId);
  }

  /**
   * Parte 23 — borra UN mensaje para todos (el tuyo o, en grupos, cualquiera si
   * eres dueño/administrador).
   */
  @Delete('chat/conversations/:convId/messages/:messageId')
  @UseGuards(JwtAuthGuard)
  chatDeleteMessage(@CurrentUser() actor: { userId: string }, @Param('convId') convId: string,
                    @Param('messageId') messageId: string) {
    return this.lb.chatDeleteMessage(actor.userId, convId, messageId);
  }

  /* ---------------- PARTE 23: COMENTARIOS (editar · borrar · respuestas) ---------------- */

  /** Edita tu comentario. */
  @Patch('comments/:id')
  @UseGuards(JwtAuthGuard)
  commentEdit(@CurrentUser() actor: { userId: string }, @Param('id') id: string,
              @Body() dto: { text?: string; body?: string }) {
    return this.lb.commentEdit(actor.userId, id, String(dto?.text ?? dto?.body ?? ''));
  }

  /** Borra un comentario (autor, autor de la publicación o moderador). */
  @Delete('comments/:id')
  @UseGuards(JwtAuthGuard)
  commentDelete(@CurrentUser() actor: { userId: string; role?: string }, @Param('id') id: string) {
    return this.lb.commentDelete(actor.userId, id, String(actor.role ?? 'PASSENGER'));
  }

  /** Respuestas de un comentario (con «responde a …»). */
  @Get('comments/:id/replies')
  @UseGuards(JwtAuthGuard)
  commentReplies(@CurrentUser() actor: { userId: string }, @Param('id') id: string,
                 @Query() q: { limit?: string }) {
    return this.lb.commentReplies(id, actor.userId, q.limit ? Number(q.limit) : undefined);
  }

  /** Busca en el historial por tipo: image · file · post · sale · system · emoji · link. */
  @Get('chat/conversations/:convId/search')
  @UseGuards(JwtAuthGuard)
  chatSearch(@CurrentUser() actor: { userId: string }, @Param('convId') convId: string,
             @Query() q: { kind?: string; limit?: string }) {
    return this.lb.chatSearch(actor.userId, convId, { kind: q.kind, limit: q.limit ? Number(q.limit) : undefined });
  }

  /** Reclamación por estafa desde el chat (crea un reporte de fraude). */
  @Post('chat/conversations/:convId/claim')
  @UseGuards(JwtAuthGuard)
  chatClaim(@CurrentUser() actor: { userId: string }, @Param('convId') convId: string, @Body() dto: { note?: string }) {
    return this.lb.chatClaim(actor.userId, convId, dto?.note);
  }

  /* ══════════ PARTE 28 (G4) — UBICACIÓN EN VIVO Y REPORTAR PERSONAS ══════════ */

  /** Quién está compartiendo su ubicación ahora en este chat. */
  @Get('chat/conversations/:convId/live')
  @UseGuards(JwtAuthGuard)
  liveList(@CurrentUser() actor: { userId: string }, @Param('convId') convId: string) {
    return this.lb.liveList(actor.userId, convId);
  }

  /** Empiezo (o reinicio) a compartir mi ubicación en vivo durante N minutos. */
  @Post('chat/conversations/:convId/live')
  @UseGuards(JwtAuthGuard)
  liveStart(@CurrentUser() actor: { userId: string }, @Param('convId') convId: string, @Body() dto: LiveLocationDto) {
    return this.lb.liveStart(actor.userId, convId, dto ?? {});
  }

  /** Actualizo mi posición (mientras comparto). */
  @Patch('chat/conversations/:convId/live')
  @UseGuards(JwtAuthGuard)
  liveUpdate(@CurrentUser() actor: { userId: string }, @Param('convId') convId: string, @Body() dto: LiveLocationDto) {
    return this.lb.liveUpdate(actor.userId, convId, dto ?? {});
  }

  /** Dejo de compartir mi ubicación. */
  @Delete('chat/conversations/:convId/live')
  @UseGuards(JwtAuthGuard)
  liveStop(@CurrentUser() actor: { userId: string }, @Param('convId') convId: string) {
    return this.lb.liveStop(actor.userId, convId);
  }

  /** Reportar a una persona (mismo catálogo de motivos que el contenido). */
  @Post('users/:userId/report')
  @UseGuards(JwtAuthGuard)
  reportUser(@CurrentUser() actor: { userId: string }, @Param('userId') targetId: string, @Body() dto: ReportUserDto) {
    return this.lb.reportUser(actor.userId, targetId, dto?.reason, dto?.note);
  }
}

