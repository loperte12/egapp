/**
 * voice.ts — Locuciones del conductor con voz Qwen3 (DashScope) vía el proxy
 * del backend HK, con FALLBACK automático al TTS local del dispositivo.
 *
 * Flujo:
 *  1. POST /wallet/api/v1/tts/speak { text } (JWT inyectado por httpClient)
 *     → { token } (el servidor sintetiza UNA vez por frase y cachea 60 min).
 *  2. Reproducir https://hk.egrouteplan.com/wallet/api/v1/tts/audio/:token
 *     con expo-audio (MP3 streaming).
 *  3. Si la red falla o el backend no responde → Speech.speak es-ES local,
 *     el conductor nunca se queda sin indicación.
 *
 * Un único AudioPlayer reutilizado: si llega una frase nueva mientras suena
 * otra, replace() corta la anterior y arranca la nueva (maniobras secuenciales,
 * nunca solapadas). La voz se detiene al salir del Conductor (stopAllVoice).
 */

import { http } from './httpClient';
import { API_HOST } from './config';
import * as Speech from 'expo-speech';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

let cloudEnabled = true; // conmutable en runtime (pruebas)
let player: AudioPlayer | null = null;
// Secuencia anti-solapamiento (auditoría 2026-09-08): las frases cloud son
// ASÍNCRONAS — si llegan fuera de orden, una frase vieja podía pisar a la
// nueva (o un fallback local sonaba DESPUÉS de la cloud). Solo se reproduce la
// frase con el número de secuencia más reciente; las obsoletas se descartan.
let voiceSeq = 0;

/** Habilita/deshabilita la voz cloud (no la local). */
export function setCloudVoiceEnabled(v: boolean) {
  cloudEnabled = v;
  if (!v) stopCloudVoice();
}
export function isCloudVoiceEnabled() { return cloudEnabled; }

/** Corta cualquier locución en curso (cloud o local). */
export function stopAllVoice() {
  voiceSeq++; // invalida frases en vuelo (no reproducir lo pendiente)
  try { player?.pause(); } catch { /* noop */ }
  try { Speech.stop(); } catch { /* noop */ }
}

export function stopCloudVoice() {
  voiceSeq++;
  try { player?.pause(); } catch { /* noop */ }
}

/**
 * Locución principal: intenta Qwen3 vía backend; ante cualquier error cae al
 * TTS local del dispositivo (es-ES). Nunca lanza. La secuencia garantiza que
 * si se pide una frase nueva mientras la anterior aún suena/vuela, gana la
 * NUEVA (sin "copiarse" con la versión anterior).
 */
export async function sayNavigation(text: string, opts: { forceLocal?: boolean } = {}): Promise<void> {
  const seq = ++voiceSeq;
  if (opts.forceLocal || !cloudEnabled) { sayLocal(text, seq); return; }
  try {
    const res = await http.post<{ token?: string }>('/tts/speak', { text }, true);
    if (seq !== voiceSeq) return;              // llegó una frase más nueva → descartar
    const token = res?.token;
    if (!token) throw new Error('respuesta sin token');
    const url = `${API_HOST}/wallet/api/v1/tts/audio/${encodeURIComponent(token)}`;
    await playUrl(url, seq);
  } catch (e) {
    if (seq !== voiceSeq) return;
    if (__DEV__) console.warn(`[voice] cloud fallo → TTS local: ${(e as Error).message}`);
    sayLocal(text, seq);
  }
}

/** Reproduce una URL MP3 solo si sigue siendo la frase más reciente. */
async function playUrl(url: string, seq: number): Promise<void> {
  try {
    await setAudioModeAsync({ playsInSilentMode: true, interruptionModeAndroid: 'duckOthers' });
    if (seq !== voiceSeq) return;
    if (!player) {
      player = createAudioPlayer({ uri: url });
    } else {
      player.replace({ uri: url, headers: { 'Cache-Control': 'public' } });
    }
    player.play();
  } catch (e) {
    throw new Error(`reproducción: ${(e as Error).message}`);
  }
}

/** Voz LOCAL del dispositivo (fallback / sin datos): expo-speech es-ES. */
function sayLocal(text: string, seq: number): void {
  try {
    Speech.stop();
    if (seq !== voiceSeq) return;
    Speech.speak(text, { language: 'es-ES', rate: 0.95 });
  } catch { /* motor de voz no disponible */ }
}
