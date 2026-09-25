/**
 * Life Book — REPRODUCTOR DE AUDIO (/lifebook-player).
 *
 * **En este fichero ya sólo vive el AUDIO** (`expo-audio`: ±15 s, velocidad, progreso).
 * DISEÑO-UX-LIFEBOOK-AUDIOVISUAL módulos 1-2.
 *
 * ── EL REPRODUCTOR DE VÍDEO SE RETIRÓ (2026-09-13) ──────────────────────────
 * Historia completa, porque explica por qué ya no está:
 *
 * 1. Empezó usando `nativeControls` de `expo-video`. Al probarlo, el dueño pidió que los
 *    botones del CENTRO desaparecieran (el retroceso/avance de ExoPlayer y su ±5 s/±15 s
 *    por defecto): quería SOLO play/pausa. `nativeControls` es todo o nada, así que hubo
 *    que pintar controles propios.
 * 2. En la segunda pasada pidió fuera también los ±15 s propios («sólo debe quedar la de
 *    play»). Se quitaron, y tenía razón de diseño: con la barra de progreso justo debajo,
 *    que se arrastra con el dedo, dos botones de salto son un tercer camino para lo mismo.
 * 3. Y en la tercera pidió lo que resolvía el problema de raíz: **«sólo debe existir un
 *    estado de ver vídeos, el inmersivo; este otro estado debe desaparecer»**.
 *
 * La razón de fondo es la que hacía inevitable el paso 3: con dos pantallas de vídeo, cada
 * arreglo había que hacerlo DOS veces (los ±15 s se quitaron de las dos), el mismo vídeo se
 * comportaba distinto según por dónde entraras, y había dos listas de gestos que mantener de
 * acuerdo. El vídeo vive en `app/lifebook-videos.tsx`, y punto.
 *
 * Si alguien llega aquí con `kind=video` —un enlace viejo, una notificación, una pantalla sin
 * actualizar— se le redirige al feed inmersivo. La redirección está en el componente de abajo.
 *
 * ── LÍMITES MEDIDOS DEL AUDIO, no supuestos ─────────────────────────────────
 * · `useAudioPlayerStatus` sí existe en `expo-audio` (a diferencia del vídeo, que no tiene
 *   `useVideoPlayerStatus`) y es de donde salen `currentTime`, `duration` y `playing`.
 * · `player.seekTo()` en `expo-audio` devuelve una promesa: se le pone `.catch(() => {})`
 *   porque un salto fuera de rango no debe tumbar la pantalla.
 */
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { ArrowLeft, Pause, Play, Rewind, FastForward } from 'lucide-react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { absUrl } from '../api/config';
import { fmtDur } from '../constants/lifebook';

export default function LifeBookPlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{ kind?: string; src?: string; title?: string; cover?: string }>();
  // TRES casos, no dos. `episode` es el ÚNICO vídeo que se reproduce en esta pantalla:
  // un episodio de serie no vive en el feed (ver el comentario de `EpisodePlayerView`).
  const kind: 'audio' | 'episode' | 'video' =
    p.kind === 'audio' ? 'audio' : p.kind === 'episode' ? 'episode' : 'video';
  const src = absUrl(p.src ?? '');
  const title = p.title ? decodeURIComponent(p.title) : 'Reproduciendo';
  const cover = absUrl(p.cover ?? '');

  /* SÓLO QUEDA EL AUDIO Y EL EPISODIO. Un vídeo de PUBLICACIÓN tiene UN ÚNICO estado de
     reproducción: el feed inmersivo (`/lifebook-videos`). Si alguien llega aquí con
     `kind=video` —un enlace viejo, una notificación, una pantalla sin actualizar— se le
     manda allí, en vez de mantener viva una segunda pantalla para el MISMO contenido, con
     sus propios controles, sus propios gestos y sus propios fallos que arreglar por
     duplicado (los ±15 s hubo que quitarlos de las dos).
     El useEffect va ANTES del return: los hooks no pueden ser condicionales. */
  const esVideoDePost = kind === 'video';
  useEffect(() => {
    if (esVideoDePost) router.replace('/lifebook-videos' as never);
  }, [esVideoDePost, router]);
  if (esVideoDePost) return null;

  if (kind === 'episode') {
    return <EpisodePlayerView src={src} title={title} insets={insets} onClose={() => router.back()} />;
  }

  return <AudioPlayerView src={src} title={title} cover={cover} insets={insets} onClose={() => router.back()} />;
}

function CloseBar({ onClose, title, dark }: { onClose: () => void; title: string; dark: boolean }) {
  const insets = useSafeAreaInsets();
  const tint = dark ? brand.white : undefined;
  return (
    <View style={[styles.closeBar, { paddingTop: insets.top + 8 }]}>
      <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Cerrar reproductor">
        <ArrowLeft size={22} color={tint ?? '#1D2129'} />
      </Pressable>
      <Text numberOfLines={1} style={[styles.closeTitle, { color: tint ?? '#1D2129' }]}>{title}</Text>
      <View style={{ width: 36 }} />
    </View>
  );
}

/* ── EL REPRODUCTOR DE VÍDEO YA NO EXISTE (2026-09-13) ────────────────────────
   Aquí vivía `VideoPlayerView`: controles propios (play/pausa, barra arrastrable,
   tiempos) porque `expo-video` no deja elegir qué botones pinta con `nativeControls`.
   Se retiró entero, con sus listeners, su `seekTo` por `currentTime` y sus estilos,
   cuando el dueño pidió que hubiera UN ÚNICO estado de ver vídeo: el feed inmersivo.

   Lo que se gana, que es la razón y no una preferencia: con dos pantallas de vídeo
   cada arreglo había que hacerlo DOS veces (los ±15 s hubo que quitarlos de las dos),
   y el mismo vídeo se comportaba distinto según por dónde entraras. Un solo estado,
   un solo juego de gestos, un solo sitio donde arreglar las cosas.

   El AUDIO conserva su reproductor (abajo) porque no tiene feed inmersivo: un podcast
   no se desliza, se escucha. */
const SPEEDS = [1, 1.25, 1.5, 2];

/* ══════════════════════════════════════════════════════════════════════════════
   REPRODUCTOR DE EPISODIO DE SERIE
   ══════════════════════════════════════════════════════════════════════════════
   POR QUÉ ESTE SÍ SE QUEDA, después de quitar el reproductor de vídeo normal.

   Un EPISODIO DE SERIE **no es una publicación**: vive en `lifebook.series_episodes`,
   con `video_url` en su propia columna, y el feed inmersivo (`/lifebook-videos`) sólo
   sabe de publicaciones (pide `/lifebook/posts/feed` y filtra por `payload.videoUrl`).
   O sea que un episodio **no puede** pintarse en el feed.

   Y hay episodios de verdad: consultado el servidor el 13-sep-2026, **12 series con
   36 episodios, todos con vídeo**. Quitar esta pantalla sin darles salida habría dejado
   36 vídeos imposibles de ver.

   La alternativa que se valoró y se descartó: meter el episodio en el feed como una
   «publicación sintética». Se descartó porque obliga a que el camino MÁS USADO de la app
   (el feed) lleve condiciones para elementos que no son publicaciones —sin me gusta, sin
   comentarios, sin guardar, sin autor—, y eso es meter complejidad en el sitio más caliente
   para satisfacer una preferencia de interfaz. Aquí, en cambio, está aislado.

   Lo que SÍ se cumplió de lo pedido: para los vídeos de publicación **sólo hay un estado**.
   Desde el feed ya no se puede llegar aquí (el icono «Ver a pantalla completa» se quitó) y
   `/lifebook-player?kind=video` redirige al feed. Esta pantalla sólo atiende episodios.

   Controles: play/pausa + barra arrastrable + tiempos. **Sin ±15 s**, por la misma razón
   que en el resto (con la barra debajo, dos botones de salto son un tercer camino para lo
   mismo). */
function EpisodePlayerView({ src, title, insets, onClose }: { src: string; title: string; insets: { bottom: number }; onClose: () => void }) {
  const { colors } = useTheme();
  const player = useVideoPlayer(src || null, (p) => {
    p.loop = false;
    // 0.25 s (por defecto 0.5): la barra se mueve fluida sin renders cada 50 ms.
    p.timeUpdateEventInterval = 0.25;
  });

  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  /** Mientras el dedo arrastra la barra no se le pelea el valor. */
  const [seeking, setSeeking] = useState<number | null>(null);
  /** Ancho real de la barra (`onLayout`): sin esto no se puede convertir la posición del
   *  dedo en segundos, y usar el ancho de pantalla se descuadraría con el padding. */
  const [trackW, setTrackW] = useState(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  /* Los listeners se sueltan al desmontar: `addListener` devuelve una suscripción y, si no
     se libera, el reproductor sigue emitiendo hacia un componente muerto. */
  useEffect(() => {
    if (!src) return;
    const subs = [
      player.addListener('playingChange', (e) => { if (mounted.current) setPlaying(!!e.isPlaying); }),
      player.addListener('timeUpdate', (e) => { if (mounted.current) setCur(e.currentTime); }),
      player.addListener('sourceLoad', (e) => {
        if (!mounted.current) return;
        setDur(Number.isFinite(e.duration) ? e.duration : 0);
        setReady(true);
      }),
      player.addListener('statusChange', (e) => {
        if (!mounted.current) return;
        // Los valores reales del enum son 'idle' | 'loading' | 'readyToPlay' | 'error'.
        setError(e.status === 'error');
      }),
    ];
    return () => { subs.forEach((s) => s.remove()); };
  }, [player, src]);

  if (!src) {
    return (
      <View style={[styles.videoRoot, { alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: brand.white, fontWeight: peso.maximo }}>Este episodio no tiene vídeo</Text>
      </View>
    );
  }

  const shown = seeking ?? cur;
  const pct = dur > 0 ? Math.min(100, (shown / dur) * 100) : 0;
  /** `expo-video` 2.2.3 no tiene `seekTo()`: se salta escribiendo `currentTime`
   *  (VideoPlayer.types.d.ts:44-48). */
  const seekTo = (t: number) => {
    const next = Math.max(0, Math.min(dur || t, t));
    player.currentTime = next;
    setCur(next);
  };
  const playPause = () => {
    if (playing) { player.pause(); setError(false); } else { player.play(); setError(false); }
  };
  /** Convierte la posición del dedo en segundos usando el ancho REAL de la barra. */
  const timeAt = (x: number): number => {
    const usable = Math.max(1, (trackW || 0) - TRACK_MARGIN * 2);
    const ratio = Math.min(1, Math.max(0, (x - TRACK_MARGIN) / usable));
    return ratio * (dur || 0);
  };

  return (
    <View style={[styles.videoRoot, { backgroundColor: '#000000' }]}>
      <CloseBar onClose={onClose} title={title} dark />

      {/* `contain`: el episodio entero, sin recortar. Aquí no hay feed que llenar, así que
          prima ver el contenido completo. */}
      <View style={styles.videoBox}>
        <VideoView
          player={player}
          style={styles.video}
          contentFit="contain"
          nativeControls={false}
          allowsFullscreen={false}
        />
        {/* Único botón del centro: play/pausa. Se oculta mientras reproduce para no tapar. */}
        <Pressable
          onPress={playPause}
          hitSlop={16}
          style={styles.centerPlay}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pausar' : 'Reproducir'}
        >
          {!playing ? (
            <View style={styles.centerPlayBg}>
              <Play size={34} color={brand.white} fill={brand.white} style={{ marginLeft: espaciado.e4 }} />
            </View>
          ) : null}
        </Pressable>
        {!ready && !error ? <ActivityIndicator color={brand.white} style={StyleSheet.absoluteFill} /> : null}
      </View>

      {/* Play/pausa. SOLO play: los ±15 s se quitaron (ver la cabecera). */}
      <View style={styles.ctlRow}>
        <Pressable onPress={playPause} hitSlop={10} style={[styles.playBtn, { backgroundColor: colors.primary }]}
          accessibilityRole="button" accessibilityLabel={playing ? 'Pausar' : 'Reproducir'}>
          {playing ? <Pause size={22} color={brand.white} fill={brand.white} /> : <Play size={22} color={brand.white} fill={brand.white} style={{ marginLeft: espaciado.e3 }} />}
        </Pressable>
      </View>

      {/* Barra: se arrastra con el dedo; al soltar se aplica el salto. */}
      <View
        style={styles.track}
        onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => { setSeeking(timeAt(e.nativeEvent.locationX)); }}
        onResponderMove={(e) => { setSeeking(timeAt(e.nativeEvent.locationX)); }}
        onResponderRelease={() => { if (seeking != null) seekTo(seeking); setSeeking(null); }}
        onResponderTerminate={() => { setSeeking(null); }}
        accessibilityRole="adjustable"
        accessibilityLabel="Progreso del episodio"
      >
        <View style={[styles.trackBg, { backgroundColor: 'rgba(255,255,255,0.28)' }]}>
          <View style={[styles.trackFill, { backgroundColor: colors.primary, width: `${pct}%` }]} />
        </View>
        <View style={[
          styles.knob,
          { left: TRACK_MARGIN + (Math.max(1, (trackW || 0) - TRACK_MARGIN * 2) * pct) / 100, backgroundColor: colors.primary },
        ]} />
      </View>

      <View style={styles.timeRow}>
        <Text style={styles.timeTxt}>{fmtDur(shown)}</Text>
        <Text style={styles.timeTxt}>{fmtDur(dur)}</Text>
      </View>

      {error ? <Text style={styles.errTxt}>No se pudo reproducir este episodio. Reintenta.</Text> : null}

      <View style={{ height: insets.bottom }} />
    </View>
  );
}

/** Margen horizontal de `styles.track` (paddingHorizontal). Debe coincidir. */
const TRACK_MARGIN = 20;

function AudioPlayerView({ src, title, cover, insets, onClose }: {
  src: string; title: string; cover: string; insets: { bottom: number }; onClose: () => void;
}) {
  const { colors } = useTheme();
  const player = useAudioPlayer({ uri: src });
  const status = useAudioPlayerStatus(player);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [error, setError] = useState(false);

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    player.seekTo(0).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cur = Number(status?.currentTime ?? 0);
  const dur = Number(status?.duration ?? 0);
  const playing = !!status?.playing;
  const pct = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;
  const seek = (delta: number) => player.seekTo(Math.max(0, Math.min(dur || cur + delta, cur + delta))).catch(() => {});

  const playPause = () => {
    if (!playing) {
      player.play();
      setError(false);
    } else player.pause();
  };

  return (
    <View style={[styles.audioRoot, { backgroundColor: colors.background }]}>
      <CloseBar onClose={onClose} title={title} dark={false} />
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e26 }}>
        {cover ? (
          <View style={[styles.coverFrame, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Image source={cover} style={styles.cover} contentFit="cover" cachePolicy="memory-disk" />
          </View>
        ) : (
          <View style={[styles.coverFrame, { backgroundColor: alpha(colors.primary, 0.12), borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }]}>
            <Text style={{ fontSize: tipografia.emojiGrande }}>🎙️</Text>
          </View>
        )}
        <Text style={[styles.audioTitle, { color: colors.textPrimary }]} numberOfLines={2}>{title}</Text>

        {/* Progreso */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { backgroundColor: colors.primary, width: `${pct}%` }]} />
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{fmtDur(cur)}</Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{fmtDur(dur || 0)}</Text>
        </View>

        {/* Controles */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e26, marginTop: espaciado.e14 }}>
          <Pressable onPress={() => seek(-15)} hitSlop={10} accessibilityLabel="Retroceder 15 segundos">
            <Rewind size={28} color={colors.textPrimary} />
          </Pressable>
          <Pressable onPress={playPause} accessibilityLabel={playing ? 'Pausar' : 'Reproducir'} style={[styles.playBig, { backgroundColor: colors.primary }]}>
            {playing ? <Pause size={30} color={brand.white} fill={brand.white} /> : <Play size={30} color={brand.white} fill={brand.white} style={{ marginLeft: espaciado.e3 }} />}
          </Pressable>
          <Pressable onPress={() => seek(15)} hitSlop={10} accessibilityLabel="Avanzar 15 segundos">
            <FastForward size={28} color={colors.textPrimary} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => { const next = (speedIdx + 1) % SPEEDS.length; setSpeedIdx(next); player.setPlaybackRate(SPEEDS[next]); }}
          style={[styles.speedBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          accessibilityLabel="Velocidad"
        >
          <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.body }}>{SPEEDS[speedIdx]}x</Text>
        </Pressable>

        {error && (
          <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e10 }}>No se pudo reproducir. Reintenta.</Text>
        )}
        {!status?.isLoaded && (
          <ActivityIndicator color={colors.primary} style={{ marginTop: espaciado.e14 }} />
        )}
      </View>
      <View style={{ height: insets.bottom + 10 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  /* Estilos del EPISODIO (el reproductor de vídeo de publicación ya no existe; éstos son
     los del único reproductor de vídeo que queda). */
  videoRoot: { flex: 1, backgroundColor: '#000000' },
  videoBox: { flex: 1, justifyContent: 'center', backgroundColor: '#000000', paddingTop: 46 },
  video: { width: '100%', height: '100%' },
  centerPlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  centerPlayBg: {
    width: 74, height: 74, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', borderWidth: trazo.fuerte, borderColor: 'rgba(255,255,255,0.85)',
  },
  ctlRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e26, paddingVertical: espaciado.e8 },
  playBtn: { width: 46, height: 46, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center' },
  track: { height: 26, justifyContent: 'center', paddingHorizontal: TRACK_MARGIN },
  trackBg: { height: 4, borderRadius: radios.pista, overflow: 'hidden' },
  trackFill: { height: 4, borderRadius: radios.pista },
  knob: { position: 'absolute', width: 14, height: 14, borderRadius: radios.marca, marginLeft: -7 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: TRACK_MARGIN, paddingBottom: espaciado.e6 },
  timeTxt: { color: 'rgba(255,255,255,0.8)', fontSize: tipografia.caption, fontWeight: peso.fuerte },
  errTxt: { color: brand.danger, fontSize: tipografia.caption, fontWeight: peso.fuerte, textAlign: 'center', paddingHorizontal: espaciado.e24, paddingBottom: espaciado.e8 },

  // Estilos del AUDIO.
  audioRoot: { flex: 1 },
  closeBar: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e14,
  },
  closeBtn: { width: 38, height: 38, borderRadius: radios.full, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center' },
  closeTitle: { flex: 1, textAlign: 'center', fontSize: tipografia.body, fontWeight: peso.maximo, marginHorizontal: espaciado.e10 },
  coverFrame: { width: 220, height: 220, borderRadius: radios.panel, borderWidth: trazo.fino, overflow: 'hidden' },
  cover: { width: '100%', height: '100%' },
  audioTitle: { fontSize: 17, fontWeight: peso.maximo, textAlign: 'center', marginTop: espaciado.e16, marginBottom: espaciado.e18 },
  progressTrack: { width: '100%', height: 5, borderRadius: radios.punta, backgroundColor: 'rgba(0,0,0,0.12)', overflow: 'hidden' },
  progressFill: { height: 5, borderRadius: radios.punta },
  playBig: { width: 62, height: 62, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center' },
  speedBtn: { marginTop: espaciado.e20, paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e8, borderRadius: radios.lg, borderWidth: trazo.fino },
});
