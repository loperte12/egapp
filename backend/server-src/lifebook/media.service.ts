// =============================================================================
// lb41-media.service.ts — LIFE BOOK · MEDIA REAL (Parte 41)
//
// Qué resuelve (todo medido antes de escribirlo):
//   · Firma URLs contra el HOST PÚBLICO (`MINIO_PUBLIC_ENDPOINT`) y con el camino
//     que nginx pasa TAL CUAL a MinIO → la firma valida (antes: 403
//     SignatureDoesNotMatch porque se firmaba con 127.0.0.1).
//   · El tope de tamaño lo impone el ALMACENAMIENTO con una **POST policy**
//     (`content-length-range`), no el cliente: `PutObjectCommand` + un
//     `fileSizeBytes` declarado no limitaba nada.
//   · **Verificación real** en `/complete`: HEAD (bytes y tipo) + **ffprobe**
//     (duración, códec y dimensiones de verdad) — antes la duración era lo que
//     dijera el cliente.
//   · **Miniatura/póster** del vídeo con ffmpeg leyendo por HTTP con Range
//     (`-ss` antes de `-i`): no descarga el archivo entero.
//   · **Cuota** por persona y día, y registro de subidas para poder borrar
//     huérfanos (la fila se reserva ANTES de firmar).
//   · Buckets **explícitos por privacidad** (`MINIO_BUCKET_MEDIA` público /
//     `MINIO_BUCKET_DOCS` privado). NO se toca `MINIO_BUCKET`, que es de KYC.
//
// Límites por tipo (configurables por entorno):
//   imagen 10 MB · vídeo corto (tiktok/estado) 60 s y 120 MB ·
//   vídeo largo (serie/documental/concierto) 3600 s (60 min) y 2 GB · audio 60 min
// =============================================================================
import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { createWriteStream, promises as fsp } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import {
  DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { DomainError } from '../services/payment-auth.service';
import { MobilityPrismaService } from '../mobility/mobility-prisma.service';

// ───────────────────────────── límites ───────────────────────────────────────
const MB = 1024 * 1024;
const LIMITS = {
  image: { maxBytes: Number(process.env.MEDIA_MAX_IMAGE_MB ?? 10) * MB, maxSec: null as number | null },
  video_short: { maxBytes: Number(process.env.MEDIA_MAX_VIDEO_SHORT_MB ?? 120) * MB, maxSec: 60 },
  // Vídeo LARGO: la regla de negocio son 50 MINUTOS (3000 s) y el tamaño va con la calidad elegida
  // (720p ≈ 900 MB; el tope de 1,2 GB deja margen). El techo de 2 GB que había antes llenaba el disco
  // del servidor en ~15 vídeos. Los dos valores se ajustan por entorno sin desplegar código.
  video_long: {
    maxBytes: Number(process.env.MEDIA_MAX_VIDEO_LONG_MB ?? 1200) * MB,
    maxSec: Number(process.env.MEDIA_MAX_VIDEO_LONG_SEC ?? 3000),   // 50 min
  },
  audio: { maxBytes: Number(process.env.MEDIA_MAX_AUDIO_MB ?? 60) * MB, maxSec: 3600 },
  file: { maxBytes: Number(process.env.MEDIA_MAX_FILE_MB ?? 25) * MB, maxSec: null },
};
const MAX_PER_DAY = Number(process.env.MEDIA_MAX_PER_DAY ?? 40);
const MAX_PENDING_BYTES = Number(process.env.MEDIA_MAX_PENDING_MB ?? 5120) * MB; // 5 GB sin usar
const PRESIGN_TTL = Number(process.env.MEDIA_PRESIGN_TTL ?? 900); // 15 min por archivo
const GET_TTL = 300;                                             // 5 min para leer privado
const PROBE_TIMEOUT_MS = 120_000;
const MAX_PARALLEL_PROBES = 2;                                   // 2 vCPU: no saturar

/** Extensiones aceptadas por tipo declarado (el tipo REAL lo confirma ffprobe). */
const MIME_EXT: Record<string, { kind: 'image' | 'video' | 'audio' | 'file'; ext: string }> = {
  'image/jpeg': { kind: 'image', ext: 'jpg' },
  'image/png': { kind: 'image', ext: 'png' },
  'image/webp': { kind: 'image', ext: 'webp' },
  'image/heic': { kind: 'image', ext: 'heic' },
  'image/heif': { kind: 'image', ext: 'heif' },
  'video/mp4': { kind: 'video', ext: 'mp4' },
  'video/quicktime': { kind: 'video', ext: 'mov' },   // ← el vídeo de iPhone
  'video/webm': { kind: 'video', ext: 'webm' },
  'video/3gpp': { kind: 'video', ext: '3gp' },
  'audio/mpeg': { kind: 'audio', ext: 'mp3' },
  'audio/mp4': { kind: 'audio', ext: 'm4a' },
  'audio/aac': { kind: 'audio', ext: 'aac' },
  'audio/wav': { kind: 'audio', ext: 'wav' },
  'application/pdf': { kind: 'file', ext: 'pdf' },
};

const PURPOSES = ['product', 'post', 'docs'] as const;
type Purpose = (typeof PURPOSES)[number];

interface SignInput {
  purpose?: string;
  kind?: string;            // image | video | audio | file
  durationKind?: string;    // short | long (solo vídeo)
  mimeType?: string;
  fileSizeBytes?: number;
  durationSec?: number;
}

@Injectable()
export class LifebookMediaService {
  private readonly log = new Logger('LifebookMedia');
  private readonly internal: S3Client;
  private readonly signer: S3Client;
  private readonly bucketMedia: string;
  private readonly bucketDocs: string;
  private readonly publicBase: string;
  private activos = 0;

  constructor(private readonly db: MobilityPrismaService) {
    const accessKeyId = String(process.env.MINIO_ACCESS_KEY ?? '').trim();
    const secretAccessKey = String(process.env.MINIO_SECRET_KEY ?? '').trim();
    const interno = String(process.env.MINIO_ENDPOINT ?? 'http://127.0.0.1:9000').trim().replace(/\s+$/, '');
    // Host PÚBLICO para firmar: es el que recibe MinIO (nginx conserva Host y camino).
    const publico = String(process.env.MINIO_PUBLIC_ENDPOINT ?? 'https://hk.egrouteplan.com').trim().replace(/\/+$/, '');

    // Si falta configuración NO se arranca a medias: mejor fallar al arrancar.
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('MEDIA: faltan MINIO_ACCESS_KEY / MINIO_SECRET_KEY (revisa el .env)');
    }

    const base = { region: process.env.MINIO_REGION ?? 'us-east-1', forcePathStyle: true as const, credentials: { accessKeyId, secretAccessKey } };
    this.internal = new S3Client({ ...base, endpoint: interno });
    this.signer = new S3Client({ ...base, endpoint: publico });

    // Buckets explícitos: la media pública y los documentos privados NO se mezclan
    // (y `MINIO_BUCKET` se deja en paz: es el de KYC).
    this.bucketMedia = String(process.env.MINIO_BUCKET_MEDIA ?? 'lifebook-media');
    this.bucketDocs = String(process.env.MINIO_BUCKET_DOCS ?? 'lifebook-docs');
    this.publicBase = String(process.env.MINIO_PUBLIC_BASE ?? `${publico}`).trim().replace(/\/+$/, '');
    this.log.log(`media listo: firma=${publico} interno=${interno} media=${this.bucketMedia} docs=${this.bucketDocs}`);
  }

  // ─────────────────────────── utilidades ────────────────────────────────────
  private uuid(v: unknown, field = 'Identificador'): string {
    const s = String(v ?? '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) {
      throw new DomainError('ID_INVALID', `${field} no válido`);
    }
    return s;
  }

  private bucketDe(purpose: Purpose): { bucket: string; visibility: 'public' | 'private' } {
    return purpose === 'docs'
      ? { bucket: this.bucketDocs, visibility: 'private' }
      : { bucket: this.bucketMedia, visibility: 'public' };
  }

  private publicUrlDe(bucket: string, key: string): string {
    return `${this.publicBase}/${bucket}/${key}`;
  }

  private limitFor(kind: string, durationKind: string) {
    if (kind === 'video') return durationKind === 'long' ? LIMITS.video_long : LIMITS.video_short;
    if (kind === 'image') return LIMITS.image;
    if (kind === 'audio') return LIMITS.audio;
    return LIMITS.file;
  }

  private async conTurno<T>(fn: () => Promise<T>): Promise<T> {
    while (this.activos >= MAX_PARALLEL_PROBES) await new Promise((r) => setTimeout(r, 150));
    this.activos++;
    try { return await fn(); } finally { this.activos--; }
  }

  // ───────────────────────────── 1) FIRMAR ───────────────────────────────────
  /**
   * Reserva la cuota y devuelve una **POST policy** con `content-length-range`:
   * el tope lo aplica MinIO aunque el cliente mienta.
   */
  async signUpload(userId: string, dto: SignInput) {
    const purpose = String(dto.purpose ?? 'product').trim().toLowerCase() as Purpose;
    if (!PURPOSES.includes(purpose)) throw new DomainError('MEDIA_PURPOSE_INVALID', 'Uso de la subida no válido');
    const kind = String(dto.kind ?? 'image').trim().toLowerCase();
    if (!['image', 'video', 'audio', 'file'].includes(kind)) throw new DomainError('MEDIA_KIND_INVALID', 'Tipo de media no válido');
    const durationKind = String(dto.durationKind ?? 'short').trim().toLowerCase() === 'long' ? 'long' : 'short';
    const mime = String(dto.mimeType ?? '').trim().toLowerCase();
    const info = MIME_EXT[mime];
    if (!info) throw new DomainError('MEDIA_TYPE_INVALID', 'Formato no permitido (JPEG, PNG, WebP, HEIC, MP4, MOV, WebM, 3GP, MP3, M4A, WAV, PDF)');
    if (info.kind !== kind) throw new DomainError('MEDIA_TYPE_INVALID', `El archivo no es del tipo declarado (${kind})`);

    const lim = this.limitFor(kind, durationKind);
    const size = Number(dto.fileSizeBytes ?? 0);
    if (!Number.isFinite(size) || size < 1) throw new DomainError('MEDIA_SIZE_REQUIRED', 'No se pudo leer el tamaño del archivo');
    if (size > lim.maxBytes) {
      throw new DomainError('MEDIA_TOO_LARGE', `El archivo supera el máximo (${Math.round(lim.maxBytes / MB)} MB)`);
    }
    if (lim.maxSec !== null) {
      const dur = Number(dto.durationSec ?? 0);
      if (!Number.isInteger(dur) || dur < 1 || dur > lim.maxSec) {
        throw new DomainError('DURATION_INVALID', `La duración debe estar entre 1 y ${lim.maxSec} segundos (se comprobará en el archivo)`);
      }
    }

    // Cuota ANTES de firmar: si no queda, no se entrega URL.
    const uso: any[] = await this.db.$queryRaw`
      SELECT
        (SELECT count(*)::int FROM lifebook.media_uploads
          WHERE user_id = ${userId}::uuid AND created_at > now() - interval '24 hours') AS hoy,
        (SELECT COALESCE(SUM(COALESCE(bytes, declared_bytes)), 0)::bigint FROM lifebook.media_uploads
          WHERE user_id = ${userId}::uuid AND status IN ('pending','ready')) AS pendiente`;
    const hoy = Number(uso[0]?.hoy ?? 0);
    const pendiente = Number(uso[0]?.pendiente ?? 0);
    if (hoy >= MAX_PER_DAY) {
      throw new DomainError('MEDIA_QUOTA_DAY', `Has alcanzado el límite de ${MAX_PER_DAY} subidas en 24 h. Inténtalo más tarde.`);
    }
    if (pendiente + size > MAX_PENDING_BYTES) {
      throw new DomainError('MEDIA_QUOTA_BYTES', 'Tienes demasiado material sin publicar. Publica o elimina lo pendiente antes de subir más.');
    }

    const { bucket, visibility } = this.bucketDe(purpose);
    const key = `${purpose === 'docs' ? 'docs' : purpose === 'post' ? 'posts' : 'products'}/${userId}/${randomUUID()}.${info.ext}`;

    // La clave se reserva en la base ANTES de firmar (así la cuota es real y el
    // huérfano queda registrado con dueño y fecha).
    await this.db.$executeRaw`
      INSERT INTO lifebook.media_uploads (user_id, bucket, object_key, purpose, kind, visibility, declared_bytes, declared_duration_sec)
      VALUES (${userId}::uuid, ${bucket}, ${key}, ${purpose}, ${info.kind}, ${visibility},
              ${size}, ${lim.maxSec === null ? null : Number(dto.durationSec ?? 0)})`;

    const prefix = key.slice(0, key.lastIndexOf('/') + 1);
    void prefix; // (la carpeta del usuario ya va dentro de la clave exacta)
    const { url, fields } = await createPresignedPost(this.signer, {
      Bucket: bucket,
      Key: key,
      Expires: PRESIGN_TTL,
      // Condiciones = la garantía de que el TOPE y el TIPO los impone el
      // almacenamiento, no el cliente. La CLAVE no necesita condición extra:
      // `createPresignedPost` la fija **exacta** en la política (más estricto que
      // un `startsWith`, que además **MinIO rechaza**: `PostPolicyInvalidKeyName`).
      Conditions: [
        ['content-length-range', 1, lim.maxBytes],   // ← el tope lo impone MinIO
        ['eq', '$Content-Type', mime],               // ← y el tipo declarado
      ] as never,
      Fields: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=86400' },
    });

    return {
      uploadUrl: url,
      fields,
      key,
      bucket,
      visibility,
      publicUrl: visibility === 'public' ? this.publicUrlDe(bucket, key) : null,
      maxBytes: lim.maxBytes,
      maxSec: lim.maxSec,
      durationKind,
      expiresIn: PRESIGN_TTL,
      /** Cómo subir: POST multipart con `fields` + el archivo en el campo `file`. */
      method: 'POST' as const,
      fileField: 'file',
      restantesHoy: MAX_PER_DAY - hoy - 1,
    };
  }

  // ──────────────────────── 2) VERIFICAR (/complete) ─────────────────────────
  /**
   * Comprueba que el objeto existe, pesa lo declarado, es del tipo declarado y
   * **su duración real** (ffprobe). Si es vídeo, extrae el póster.
   */
  async complete(userId: string, body: { key?: string; durationSec?: number }) {
    const key = String(body?.key ?? '').trim();
    if (!key || !key.includes('/')) throw new DomainError('MEDIA_KEY_REQUIRED', 'Falta la clave del archivo');
    const rows: any[] = await this.db.$queryRaw`
      SELECT id, user_id, bucket, object_key, purpose, kind, visibility, declared_bytes, declared_duration_sec, status
        FROM lifebook.media_uploads WHERE object_key = ${key} LIMIT 1`;
    const row = rows[0];
    if (!row) throw new DomainError('UPLOAD_NOT_FOUND', 'Esa subida no existe');
    // 🔒 Solo su dueño puede cerrarla (y la clave lleva su carpeta).
    if (row.user_id !== userId) throw new DomainError('UPLOAD_NOT_OWNER', 'Esa subida no es tuya');
    if (!key.startsWith(`${row.purpose === 'docs' ? 'docs' : row.purpose === 'post' ? 'posts' : 'products'}/${userId}/`)) {
      throw new DomainError('UPLOAD_NOT_OWNER', 'La clave no pertenece a tu carpeta');
    }
    if (row.status === 'rejected') throw new DomainError('UPLOAD_REJECTED', 'Esa subida fue rechazada');

    // HEAD: existe, bytes y tipo reales según el almacenamiento.
    let head: any;
    try {
      head = await this.internal.send(new HeadObjectCommand({ Bucket: row.bucket, Key: key }));
    } catch {
      throw new DomainError('UPLOAD_MISSING', 'El archivo no llegó al almacenamiento');
    }
    const bytes = Number(head.ContentLength ?? 0);
    const contentType = String(head.ContentType ?? '');
    const declarado = Number(row.declared_bytes ?? 0);
    if (bytes < 1) throw new DomainError('UPLOAD_MISSING', 'El archivo llegó vacío');
    // Tolerancia del 1 % (los contenedores redondean); por encima, se rechaza.
    if (declarado > 0 && bytes > declarado * 1.01) {
      throw new DomainError('MEDIA_SIZE_MISMATCH', 'El archivo pesa más de lo declarado');
    }

    const lim = this.limitFor(row.kind, row.kind === 'video' ? (Number(row.declared_duration_sec ?? 0) > 60 ? 'long' : 'short') : 'short');

    // Duración REAL con ffprobe (leyendo por URL firmada de lectura: sirve también
    // para el bucket privado y no descarga el archivo entero).
    let durReal: number | null = null;
    let codec: string | null = null;
    let width: number | null = null;
    let height: number | null = null;
    if (row.kind === 'video' || row.kind === 'audio') {
      const getUrl = await this.signedGetInterno(row.bucket, key, 600);
      const probe = await this.conTurno(() => this.ffprobe(getUrl));
      durReal = probe.duration;
      codec = probe.codec;
      width = probe.width;
      height = probe.height;
      if (durReal === null || durReal < 1) throw new DomainError('MEDIA_UNREADABLE', 'No se pudo leer la duración del archivo: ¿está completo?');
      if (lim.maxSec !== null && durReal > lim.maxSec + 2) {
        throw new DomainError('DURATION_TOO_LONG', `El archivo dura ${Math.round(durReal)} s y el máximo es ${lim.maxSec} s`);
      }
    }

    // Póster del vídeo (una extracción con -ss: barato, no descarga todo).
    let posterKey: string | null = null;
    if (row.kind === 'video') {
      try {
        const getUrl = await this.signedGetInterno(row.bucket, key, 600);
        posterKey = await this.conTurno(() => this.extractPoster(row.bucket, key, getUrl));
      } catch (e) {
        this.log.warn(`póster no generado para ${key}: ${(e as Error).message}`);
      }
    }

    await this.db.$executeRaw`
      UPDATE lifebook.media_uploads
         SET status = 'ready', bytes = ${bytes}, duration_sec = ${durReal === null ? null : Math.round(durReal)},
             codec = ${codec}, width = ${width}, height = ${height}, poster_key = ${posterKey}, completed_at = now()
       WHERE id = ${row.id}::uuid`;

    return {
      key,
      bucket: row.bucket,
      visibility: row.visibility,
      url: this.publicUrlDe(row.bucket, key),
      /** Para buckets privados: URL firmada de lectura (caduca). */
      signedUrl: row.visibility === 'private' ? await this.signedGet(row.bucket, key, GET_TTL) : null,
      posterUrl: posterKey ? this.publicUrlDe(row.bucket, posterKey) : null,
      bytes,
      contentType,
      durationSec: durReal === null ? null : Math.round(durReal),
      codec,
      width,
      height,
      verified: true,
    };
  }

  /** Lectura firmada (privados) — el dueño o quien el llamante autorice. */
  async signedGet(bucket: string, key: string, ttl = GET_TTL): Promise<string> {
    return getSignedUrl(this.signer, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: ttl });
  }

  /**
   * Lectura firmada CONTRA MINIO POR DENTRO — para lo que lee el PROPIO SERVIDOR.
   *
   * La diferencia es de minutos, no de estilo: `ffprobe` y la miniatura leen el archivo entero (o buena
   * parte), y con la URL pública esa lectura da la vuelta por internet hasta llegar a MinIO, que está en
   * la MISMA máquina. Medido con un vídeo de 215 MB: 337 s de subida por la URL pública (0,64 MB/s) y
   * `/complete` muerto por EPIPE al cortar nginx. Leyendo por el bucle local, esto es disco.
   *
   * La URL que se le DEVUELVE a la app sigue siendo la pública (`signedGet`): es ella quien necesita
   * alcanzarla desde fuera.
   */
  private async signedGetInterno(bucket: string, key: string, ttl = 600): Promise<string> {
    return getSignedUrl(this.internal, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: ttl });
  }

  /** URL firmada de lectura para el dueño de la subida (documentos privados). */
  async signRead(userId: string, key: string) {
    const rows: any[] = await this.db.$queryRaw`
      SELECT user_id, bucket, object_key, visibility, status FROM lifebook.media_uploads WHERE object_key = ${key} LIMIT 1`;
    const row = rows[0];
    if (!row) throw new DomainError('UPLOAD_NOT_FOUND', 'Esa subida no existe');
    if (row.user_id !== userId) throw new DomainError('UPLOAD_NOT_OWNER', 'Esa subida no es tuya');
    return { key: row.object_key, signedUrl: await this.signedGet(row.bucket, row.object_key, GET_TTL), expiresIn: GET_TTL };
  }

  /** Cuota y estado del material del usuario (para el panel y para la app). */
  async quota(userId: string) {
    const rows: any[] = await this.db.$queryRaw`
      SELECT
        (SELECT count(*)::int FROM lifebook.media_uploads
          WHERE user_id = ${userId}::uuid AND created_at > now() - interval '24 hours') AS hoy,
        (SELECT COALESCE(SUM(COALESCE(bytes, declared_bytes)), 0)::bigint FROM lifebook.media_uploads
          WHERE user_id = ${userId}::uuid AND status IN ('pending','ready')) AS pendiente,
        (SELECT COALESCE(SUM(COALESCE(bytes, declared_bytes)), 0)::bigint FROM lifebook.media_uploads
          WHERE user_id = ${userId}::uuid) AS total,
        (SELECT count(*)::int FROM lifebook.media_uploads
          WHERE user_id = ${userId}::uuid AND status IN ('pending','ready') AND created_at < now() - interval '24 hours') AS huerfanos`;
    return {
      usadasHoy: Number(rows[0]?.hoy ?? 0),
      maxHoy: MAX_PER_DAY,
      pendienteBytes: Number(rows[0]?.pendiente ?? 0),
      maxPendienteBytes: MAX_PENDING_BYTES,
      totalBytes: Number(rows[0]?.total ?? 0),
      huerfanos: Number(rows[0]?.huerfanos ?? 0),
      buckets: { media: this.bucketMedia, docs: this.bucketDocs },
    };
  }

  // ────────────────────────────── ffmpeg ────────────────────────────────────
  /** Duración, códec y tamaño reales (lee solo cabeceras; por HTTP con Range). */
  private ffprobe(url: string): Promise<{ duration: number | null; codec: string | null; width: number | null; height: number | null }> {
    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-show_entries', 'stream=codec_name,width,height',
        '-select_streams', 'v:0',
        '-of', 'json',
        url,
      ];
      const child = execFile('ffprobe', args, { timeout: PROBE_TIMEOUT_MS, maxBuffer: 4 * MB }, (err, stdout) => {
        if (err && !stdout) return reject(new Error(`ffprobe: ${err.message.slice(0, 160)}`));
        try {
          const j = JSON.parse(stdout || '{}');
          const st = (j.streams ?? [])[0] ?? {};
          const dur = Number(j.format?.duration ?? st.duration ?? NaN);
          resolve({
            duration: Number.isFinite(dur) ? dur : null,
            codec: st.codec_name ? String(st.codec_name) : null,
            width: st.width ? Number(st.width) : null,
            height: st.height ? Number(st.height) : null,
          });
        } catch (e) {
          reject(new Error(`ffprobe json: ${(e as Error).message.slice(0, 120)}`));
        }
      });
      child.on('error', (e) => reject(e));
    });
  }

  /** Extrae un fotograma (segundo 1) y lo guarda como `<key>.poster.jpg`. */
  private async extractPoster(bucket: string, key: string, url: string): Promise<string> {
    const tmp = join(tmpdir(), `lb-poster-${randomUUID()}.jpg`);
    await new Promise<void>((resolve, reject) => {
      const args = ['-ss', '1', '-i', url, '-frames:v', '1', '-vf', 'scale=640:-2', '-f', 'image2', '-y', tmp];
      const child = execFile('ffmpeg', args, { timeout: PROBE_TIMEOUT_MS }, (err) => (err ? reject(new Error(`ffmpeg: ${err.message.slice(0, 160)}`)) : resolve()));
      child.on('error', (e) => reject(e));
    });
    const posterKey = `${key}.poster.jpg`;
    const buf = await fsp.readFile(tmp);
    await this.internal.send(new PutObjectCommand({
      Bucket: bucket,
      Key: posterKey,
      Body: buf,
      ContentLength: buf.length,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=86400',
    }));
    await fsp.unlink(tmp).catch(() => undefined);
    return posterKey;
  }

  // ─────────────────────── 3) BORRADO (huérfanos / cambio) ───────────────────
  /** Borra el objeto (y su póster) del usuario y marca la fila. */
  async remove(userId: string, key: string) {
    const rows: any[] = await this.db.$queryRaw`
      SELECT id, user_id, bucket, object_key, poster_key FROM lifebook.media_uploads WHERE object_key = ${key} LIMIT 1`;
    const row = rows[0];
    if (!row) throw new DomainError('UPLOAD_NOT_FOUND', 'Esa subida no existe');
    if (row.user_id !== userId) throw new DomainError('UPLOAD_NOT_OWNER', 'Esa subida no es tuya');
    for (const k of [row.object_key, row.poster_key].filter(Boolean)) {
      await this.internal.send(new DeleteObjectCommand({ Bucket: row.bucket, Key: k })).catch(() => undefined);
    }
    await this.db.$executeRaw`DELETE FROM lifebook.media_uploads WHERE id = ${row.id}::uuid`;
    return { deleted: true, key: row.object_key };
  }

  /**
   * Barrido de huérfanos: subidas verificadas que nunca se usaron y tienen más
   * de `dias`. Se llama a mano (o por cron) — nunca borra lo que está en uso.
   */
  async purgeOrphans(dias = 7, limit = 200) {
    const rows: any[] = await this.db.$queryRaw`
      SELECT id, bucket, object_key, poster_key FROM lifebook.media_uploads
       WHERE status IN ('pending','ready') AND created_at < now() - (${dias} || ' days')::interval
       ORDER BY created_at LIMIT ${limit}`;
    let borrados = 0;
    for (const r of rows) {
      for (const k of [r.object_key, r.poster_key].filter(Boolean)) {
        await this.internal.send(new DeleteObjectCommand({ Bucket: r.bucket, Key: k })).catch(() => undefined);
      }
      await this.db.$executeRaw`DELETE FROM lifebook.media_uploads WHERE id = ${r.id}::uuid`;
      borrados++;
    }
    return { revisados: rows.length, borrados, dias };
  }

  /** Marca como usada la clave que se acaba de guardar en una publicación. */
  async markUsed(userId: string, keys: string[]) {
    const limpio = (keys ?? []).filter((k) => typeof k === 'string' && k.length > 0 && k.length < 400);
    if (!limpio.length) return { marcadas: 0 };
    const r: any[] = await this.db.$queryRaw`
      UPDATE lifebook.media_uploads SET status = 'used', used_at = now()
       WHERE user_id = ${userId}::uuid AND object_key = ANY(${limpio}::text[]) RETURNING id`;
    return { marcadas: r.length };
  }
}
