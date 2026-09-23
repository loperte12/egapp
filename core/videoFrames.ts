/**
 * videoFrames — extraer fotogramas de un vídeo LOCAL para usarlos como portada (B2).
 *
 * ── POR QUÉ EXISTE ────────────────────────────────────────────────────────────
 * Publicar un vídeo dejaba la portada en manos del servidor: `extractPoster` saca
 * SIEMPRE el fotograma del segundo 1 (`lb41-media.service.ts:405`). Un vídeo que
 * empieza en negro, con una transición o con un plano movido se publica con esa
 * portada, y la portada es lo que decide si alguien entra. Esto deja elegir.
 *
 * ── LA CADENA, VERIFICADA CONTRA LOS .d.ts DE LA VERSIÓN INSTALADA ─────────────
 * 1. `VideoPlayer.generateThumbnailsAsync(times, opts)` → `VideoThumbnail[]`
 *    (expo-video 2.2.2, android+ios). Cada thumbnail es un `SharedRef<'image'>`:
 *    referencia nativa, SIN `uri`. Se puede pintar con expo-image pero NO se puede
 *    subir tal cual — por eso hace falta el paso 2.
 * 2. `ImageManipulator.manipulate(sharedRef)` acepta `string | SharedRef<'image'>`
 *    → `ImageManipulatorContext` → `renderAsync()` → `ImageRef` → `saveAsync()`
 *    → `{ uri, base64 }`. Ahí ya hay ARCHIVO, que es lo que se sube.
 *
 * ⚠️ `useImageManipulator` NO sirve aquí: usa `useReleasingSharedObject`, o sea es
 * un HOOK de React, y esto se llama desde un handler asíncrono. Se usa el módulo
 * nativo (`ImageManipulator.manipulate`) directamente, que es lo que el hook
 * envuelve por dentro.
 *
 * ── MEMORIA NATIVA ────────────────────────────────────────────────────────────
 * Player, contextos, ImageRefs y thumbnails son objetos nativos con `release()`.
 * Se liberan TODOS en `finally`: un bitmap de vídeo sin liberar por fotograma es la
 * forma más rápida de quedarse sin memoria en un móvil. `release()` se envuelve en
 * try/catch porque lanzar sobre un objeto ya liberado provoca un error que taparía
 * el original.
 *
 * ── DEGRADA, NO BLOQUEA ───────────────────────────────────────────────────────
 * `generateThumbnailsAsync` necesita que el asset esté cargado en el player. Si el
 * dispositivo no puede (codec, archivo corrupto, permiso), esto lanza un Error con
 * mensaje en español y la pantalla sigue permitiendo elegir portada desde galería.
 * No poder sacar frames nunca debe impedir publicar.
 */

import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import type { ImageManipulatorContext, ImageRef } from 'expo-image-manipulator';
import { createVideoPlayer, type VideoPlayer } from 'expo-video';

/**
 * Tope de espera a que el player cargue el asset.
 *
 * Con el perfil largo de la Parte 50 (hasta 50 min / 1,2 GB) la carga puede tardar
 * en un móvil. Se espera, pero NO indefinidamente: sin tope, un vídeo que nunca
 * carga dejaría la hoja colgada en «Extrayendo fotogramas…» para siempre. Al vencer
 * el tope se intenta igualmente y, si falla, se informa con la galería como
 * alternativa — que es la vía que ya existía y siempre funciona.
 */
const READY_TIMEOUT_MS = 20_000;

/**
 * Espera a que el player tenga el asset listo para reproducir.
 *
 * `generateThumbnailsAsync` está documentado como «Generates thumbnails from the
 * **currently played** asset», o sea trabaja sobre lo que el player ya cargó.
 * Llamarlo justo tras `createVideoPlayer` —sin esperar— es una carrera: en un vídeo
 * pequeño puede colar, en uno grande falla. Este espera elimina la carrera.
 *
 * También termina si el estado pasa a `error` (codec no admitido, archivo corrupto):
 * esperar ahí sería inútil y dejaría el tope completo de espera.
 */
async function esperarListo(player: VideoPlayer): Promise<void> {
  if (player.status === 'readyToPlay') return;
  await new Promise<void>((resolve) => {
    let hecho = false;
    let sub: { remove: () => void } | null = null;
    let to: ReturnType<typeof setTimeout> | null = null;
    const terminar = () => {
      if (hecho) return;
      hecho = true;
      if (sub) { try { sub.remove(); } catch { /* ya quitado */ } }
      if (to) clearTimeout(to);
      resolve();
    };
    sub = player.addListener('statusChange', ((e: { status: string }) => {
      if (e.status === 'readyToPlay' || e.status === 'error') terminar();
    }) as never);
    to = setTimeout(terminar, READY_TIMEOUT_MS);
  });
}

/** Un fotograma ya convertido en archivo subible. */
export interface VideoFrame {
  /** Segundo real del fotograma (en iOS puede diferir del pedido: es `actualTime`). */
  timeSec: number;
  /** Segundo que se pidió. */
  requestedSec: number;
  /** Archivo en caché — es lo que se sube. */
  uri: string;
  /** `data:image/jpeg;base64,…` para la previsualización inmediata. */
  dataUrl: string;
  width: number;
  height: number;
}

/** Ancho máximo del fotograma. La portada se ve pequeña; 720 px sobra y pesa poco. */
const MAX_W = 720;
/** Compresión JPEG (0–1, siendo 1 sin comprimir). */
const COMPRESS = 0.72;
/** Tope de fotogramas: más no ayuda a elegir y cada uno cuesta memoria nativa. */
export const MAX_FRAMES = 12;

/**
 * Tiempos a muestrear, repartidos por el vídeo.
 *
 * Se evita t=0 a propósito: es el fotograma que ya saca el servidor y suele ser el
 * peor (fundido de entrada, negro). Se evita también el último instante (fundido de
 * salida). Por eso se muestrea en el CENTRO de cada tramo: con 6 fotogramas y 60 s,
 * se piden los segundos 5, 15, 25, 35, 45 y 55.
 */
function tiemposDe(durSec: number, count: number): number[] {
  const dur = Number(durSec);
  if (!Number.isFinite(dur) || dur <= 0) return [];
  const n = Math.max(1, Math.min(MAX_FRAMES, Math.floor(count)));
  const tramo = dur / n;
  const out: number[] = [];
  for (let i = 0; i < n; i += 1) {
    // Centro del tramo, acotado para que no se salga del vídeo.
    const t = tramo * (i + 0.5);
    out.push(Math.max(0.1, Math.min(dur - 0.1, t)));
  }
  // Sin duplicados (en vídeos muy cortos varios tramos caen en el mismo segundo).
  return [...new Set(out.map((t) => Math.round(t * 10) / 10))];
}

/**
 * Extrae hasta `count` fotogramas del vídeo local `uri` y los devuelve como
 * archivos listos para subir.
 *
 * @param uri      ruta local del vídeo (la que dio el picker, aún sin subir).
 * @param durSec   duración en segundos. Con 0/NaN no se puede repartir → lanza.
 * @param count    cuántos fotogramas pedir (tope {@link MAX_FRAMES}).
 */
export async function extraerFrames(uri: string, durSec: number, count = 6): Promise<VideoFrame[]> {
  if (!uri) throw new Error('Falta el vídeo del que sacar la portada.');
  const tiempos = tiemposDe(durSec, count);
  if (tiempos.length === 0) {
    throw new Error('No se pudo leer la duración del vídeo, así que no se pueden ofrecer fotogramas. Elige la portada desde la galería.');
  }

  // Player SIN vista: `createVideoPlayer` es la vía no-hook y sirve para trabajar
  // con el asset en segundo plano.
  let player: ReturnType<typeof createVideoPlayer> | null = null;
  const liberables: Array<{ release: () => void }> = [];
  const liberar = (o: unknown) => {
    const r = o as { release?: () => void } | null;
    if (r && typeof r.release === 'function') {
      try { r.release(); } catch { /* ya liberado: no debe tapar el error real */ }
    }
  };

  try {
    player = createVideoPlayer(uri);
    liberables.push(player as unknown as { release: () => void });

    // Esperar a que el asset esté cargado ANTES de pedir fotogramas: sin esto es
    // una carrera (ver `esperarListo`). Con un tope, para no colgar la hoja.
    await esperarListo(player);

    // Pausa defensiva: `generateThumbnailsAsync` trabaja sobre el asset cargado, no
    // necesita que se reproduzca. Un player sin VideoView normalmente no arranca
    // solo, pero si lo hiciera, reproduciría en segundo plano — y con vídeos de
    // hasta 1,2 GB (perfil largo, Parte 50) eso es tarifa de datos y batería. Pausar
    // es barato y no hace daño si ya estaba pausado.
    try { if (player.playing) player.pause(); } catch { /* estado en transición */ }

    let thumbs;
    try {
      thumbs = await player.generateThumbnailsAsync(tiempos, { maxWidth: MAX_W });
    } catch {
      throw new Error('No se pudieron leer los fotogramas de este vídeo (codec o archivo no admitido). Puedes elegir la portada desde la galería.');
    }
    if (!thumbs || thumbs.length === 0) {
      throw new Error('El vídeo no devolvió ningún fotograma. Puedes elegir la portada desde la galería.');
    }

    const frames: VideoFrame[] = [];
    for (let i = 0; i < thumbs.length; i += 1) {
      const th = thumbs[i];
      liberables.push(th as unknown as { release: () => void });

      // SharedRef<'image'> → archivo. Si un fotograma falla, se salta: con 5 de 6
      // la función sigue siendo útil, y abortar todo por uno es peor.
      let ctx: ImageManipulatorContext | null = null;
      let ref: ImageRef | null = null;
      try {
        ctx = ImageManipulator.manipulate(th);
        liberables.push(ctx);
        ref = await ctx.renderAsync();
        liberables.push(ref);
        const saved = await ref.saveAsync({ base64: true, compress: COMPRESS, format: SaveFormat.JPEG });
        if (!saved?.uri || !saved.base64) continue;
        frames.push({
          // `actualTime` solo existe en iOS; en Android se queda en el pedido.
          timeSec: Number((th as { actualTime?: number }).actualTime ?? th.requestedTime ?? tiempos[i] ?? 0),
          requestedSec: Number(th.requestedTime ?? tiempos[i] ?? 0),
          uri: saved.uri,
          dataUrl: `data:image/jpeg;base64,${saved.base64}`,
          width: saved.width,
          height: saved.height,
        });
      } catch {
        continue;
      }
    }

    if (frames.length === 0) {
      throw new Error('No se pudo convertir ningún fotograma a imagen. Puedes elegir la portada desde la galería.');
    }
    return frames;
  } finally {
    // De atrás hacia adelante: los ImageRef/contexto dependen del thumbnail y del
    // player. Liberar en orden inverso evita tocar algo cuyo padre ya se fue.
    for (let i = liberables.length - 1; i >= 0; i -= 1) liberar(liberables[i]);
  }
}
