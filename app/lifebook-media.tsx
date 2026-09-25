/**
 * Life Book — PUBLICAR MEDIA (/lifebook-media?kind=video|podcast|serie|episode[&serieId=]).
 * Campos por tipo (PUBLICAR §3.2-3.4, módulos 1-3 del diseño audiovisual):
 *  · video: título + descripción + archivo de vídeo + portada opcional
 *  · podcast: título + descripción + AUDIO (≤60 MB) + portada OBLIGATORIA + duración
 *  · serie: título + descripción + portada opcional (los episodios se añaden después)
 *  · episode: archivo de vídeo + título/descripción (a una serie existente, número automático)
 *
 * ── DOS CAMINOS DE SUBIDA, A PROPÓSITO (Parte 50) ──────────────────────────────
 *  · IMAGEN y AUDIO → `POST /lifebook/media/upload` (multipart contra el API, como siempre).
 *    Son pequeños (≤10 / ≤60 MB) y ese camino ya va fino.
 *  · VÍDEO → URL FIRMADA (./api/lifebookMediaReal): el archivo va **directo del móvil al
 *    almacenamiento**, sin atravesar el proceso del API, y con progreso real. Es lo que
 *    hace posible un vídeo de 50 minutos: por el camino viejo, ~900 MB cruzando el API sin
 *    saber por dónde va. Además el servidor VERIFICA el archivo al cerrar (ffprobe) y saca
 *    el póster.
 *
 * El perfil del vídeo (corto ≤1 min / largo ≤50 min) es una elección EXPLÍCITA del que
 * publica: el corto es el que hace que el feed cargue al instante y no se toca.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import {alpha, espaciado, neutro, peso, radios, tipografia, trazo, useTheme} from '@egrouteplan/ui-kit';
import { ArrowLeft, Clapperboard, ImagePlus, Mic, ShoppingBag, Upload, Video } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { authApi } from '../api/auth';
import { lifebookMediaApi } from '../api/lifebook';
/* TANDA C (bis): los productos del vídeo van por aquí (el `createVideo` de `api/lifebook.ts` no
   acepta `productIds`, y ese fichero no se toca) y con la MISMA hoja que el compositor de notas. */
import { productosEnNotaApi } from '../api/lifebookProductos';
import { SelectorDeProductos } from '../components/lifebook/SelectorDeProductos';
import { limpiarSubida, subirArchivoFirmado, type LbProgreso } from '../api/lifebookMediaReal';
import { pickImagesFromLibrary } from '../core/pickImage';
// B2: elegir la portada desde un fotograma del propio vídeo. Antes solo podía venir
// de la galería o del servidor, que saca SIEMPRE el fotograma del segundo 1
// (`extractPoster`, lb41-media.service.ts:405) — un vídeo que arranca en negro o con
// una transición se publicaba así y no había forma de cambiarlo desde la app.
import { VideoCoverSheet } from '../components/lifebook/VideoCoverSheet';
import {
  LB_CITIES, LB_NOTE_BODY_MAX, LB_NOTE_TITLE_MAX, LB_VIDEO_PERFILES, MEDIA_KIND_ACCEPT,
  fmtDur, lbPeso, lbTiempoSubida, type LbVideoPerfilId,
} from '../constants/lifebook';
import { brand } from '@egrouteplan/ui-kit';

export default function LifeBookMediaComposeScreen() {
  return (
    <AuthGate>
      <MediaComposeContent />
    </AuthGate>
  );
}

type Mode = 'video' | 'podcast' | 'serie' | 'episode';

const MODE_META: Record<Mode, { title: string; icon: typeof Video; color: string }> = {
  video: { title: 'Publicar video corto', icon: Video, color: '#7C3AED' },
  podcast: { title: 'Publicar podcast', icon: Mic, color: '#E0439A' },
  serie: { title: 'Crear serie', icon: Clapperboard, color: brand.secondary },
  episode: { title: 'Añadir episodio', icon: Clapperboard, color: brand.secondary },
};

function MediaComposeContent() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ kind?: string; serieId?: string; serieTitle?: string }>();
  const kind = (MODE_META[params.kind as Mode] ? params.kind as Mode : 'video');
  const meta = MODE_META[kind];
  const serieId = params.serieId;

  const [city, setCity] = useState('Malabo');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [file, setFile] = useState<{ uri: string; name: string; mime: string; durSec: number; sizeBytes: number } | null>(null);
  const [cover, setCover] = useState<{ dataUrl: string; uri: string } | null>(null);
  /** B2: hoja abierta para elegir la portada desde un fotograma del vídeo. */
  const [coverSheetOpen, setCoverSheetOpen] = useState(false);
  const [durManual, setDurManual] = useState('');
  const [allowComments, setAllowComments] = useState(true);
  const [allowDownload, setAllowDownload] = useState(false);
  /**
   * TANDA C (bis) — PRODUCTOS DENTRO DEL VÍDEO.
   *
   * Los productos se enganchan al vídeo igual que a una nota: se ven como **sticker sobre el
   * reproductor**. Hasta ahora el flujo de publicar vídeo no tenía selector (solo se podía por API),
   * así que el sticker existía pero nadie podía ponerle producto desde el móvil.
   */
  const [productos, setProductos] = useState<string[]>([]);
  const [prodOpen, setProdOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Vídeo: perfil (corto/largo) y progreso de la subida firmada ──────────────
  const [perfilId, setPerfilId] = useState<LbVideoPerfilId>('short');
  const [progreso, setProgreso] = useState<LbProgreso | null>(null);
  const [fase, setFase] = useState<'subiendo' | 'verificando' | 'publicando' | null>(null);
  // La clave subida se guarda para poder borrarla si el paso siguiente falla: si no, un
  // vídeo de 900 MB se queda ocupando disco hasta el barrido de huérfanos.
  const claveSubida = useRef<string | null>(null);

  const perfil = LB_VIDEO_PERFILES[perfilId];
  const esVideo = kind === 'video' || kind === 'episode';

  useEffect(() => {
    authApi.me().then((m) => { if (m?.city && (LB_CITIES as readonly string[]).includes(m.city)) setCity(m.city); }).catch(() => {});
  }, []);

  const needsFile = kind === 'video' || kind === 'podcast' || kind === 'episode';
  const needsCover = kind === 'podcast';
  const titleRequired = kind === 'video' || kind === 'serie';

  /**
   * Elige el vídeo y lo MIDE contra el perfil activo.
   *
   * Ojo con lo que se puede saber aquí y lo que no: `asset.duration` y `asset.fileSize` los
   * da el sistema al elegir, y con un vídeo grande a veces vienen a 0. Por eso NO se rechaza
   * por un dato que falta: se deja pasar y el rechazo real lo hace el servidor al cerrar
   * (ffprobe mide el archivo de verdad). Aquí solo se avisa de lo que sí se sabe.
   */
  const pickVideoFile = async () => {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync().catch(() => null);
    if (perm && !perm.granted && perm.canAskAgain) {
      const asked = await ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => null);
      if (!asked?.granted) { Alert.alert('Permiso necesario', 'Necesitamos acceder a tus vídeos para publicar.'); return; }
    }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], quality: 1, selectionLimit: 1 });
    if (res.canceled || !res.assets?.[0]) return;
    const asset = res.assets[0];
    const mime = asset.mimeType ?? 'video/mp4';
    const sizeBytes = Number(asset.fileSize ?? 0) || 0;
    const durSec = Math.max(0, Math.round((asset.duration ?? 0) / 1000)) || 0;

    // Si dura más que el perfil corto, NO se rechaza: se propone el largo. Es lo que el
    // usuario acaba de pedir (un vídeo de 50 minutos) y rechazarlo en seco sería absurdo.
    if (durSec > LB_VIDEO_PERFILES.short.maxSec && perfilId === 'short') {
      setPerfilId('long');
      setError(null);
    }
    const activo = durSec > LB_VIDEO_PERFILES.short.maxSec ? LB_VIDEO_PERFILES.long : perfil;

    if (durSec > activo.maxSec) {
      Alert.alert(
        'Vídeo demasiado largo',
        `Dura ${fmtDur(durSec)} y el máximo del vídeo largo son ${Math.round(activo.maxSec / 60)} minutos (${Math.round(activo.maxSec)} s).`,
      );
      return;
    }
    if (sizeBytes > activo.maxMb * 1024 * 1024) {
      Alert.alert(
        'Vídeo muy pesado',
        `Pesa ${lbPeso(sizeBytes)} y el máximo es ${activo.maxMb} MB. Baja la calidad al grabar (720p) o recórtalo.`,
      );
      return;
    }
    // El caso que de verdad duele: 15 minutos de vídeo en 4K pueden ser varios GB. Avisar
    // ANTES de empezar es la diferencia entre publicar y quedarse sin tarifa de datos.
    if (sizeBytes > 250 * 1024 * 1024) {
      // El tiempo CALCULADO, no un «puede tardar»: 250 MB a la velocidad de referencia son
      // ~20 minutos, y saberlo ANTES es lo único que permite decidir si seguir o esperar al wifi.
      Alert.alert(
        'Vídeo grande',
        `${lbPeso(sizeBytes)}${durSec ? ` · ${fmtDur(durSec)}` : ''}\n`
        + `Subida estimada con datos móviles: ${lbTiempoSubida(sizeBytes)}.\n\n`
        + 'Puede consumir buena parte de tu tarifa. Con wifi va mucho mejor.\n\n'
        + 'El máximo de la plataforma es 50 minutos.',
        [{ text: 'Seguir', style: 'default' }],
      );
    }
    setFile({ uri: asset.uri, name: `video-${Date.now()}.mp4`, mime, durSec: Math.max(1, durSec || 1), sizeBytes });
    setError(null);
  };

  const pickAudioFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: ['audio/*'], copyToCacheDirectory: true, multiple: false });
    if (res.canceled || !res.assets?.[0]) return;
    const a = res.assets[0];
    const mime = a.mimeType ?? 'audio/mpeg';
    const mb = (a.size ?? 0) / (1024 * 1024);
    if (mb > MEDIA_KIND_ACCEPT.audio.maxMb) {
      Alert.alert('Audio muy pesado', `Máximo ${MEDIA_KIND_ACCEPT.audio.maxMb} MB.`);
      return;
    }
    setFile({ uri: a.uri, name: a.name || `audio-${Date.now()}.mp3`, mime, durSec: 0, sizeBytes: Number(a.size ?? 0) || 0 });
    setError(null);
  };

  const pickCover = async () => {
    try {
      const picked = await pickImagesFromLibrary(1);
      if (picked[0]) setCover(picked[0]);
    } catch (e) {
      Alert.alert('Portada', e instanceof Error ? e.message : 'No se pudo elegir la imagen.');
    }
  };

  const canSend = useMemo(() => {
    if (busy) return false;
    if (titleRequired && title.trim().length < 3) return false;
    if (needsFile && !file) return false;
    if (needsCover && !cover) return false;
    if (kind === 'podcast') {
      const mins = Number(durManual);
      if (!Number.isFinite(mins) || mins < 1 || mins > 60) return false;
    }
    // Vídeo: manda el PERFIL elegido. En corto sigue siendo 1 minuto; en largo, 50.
    // Un vídeo corto (≤60 s) se puede publicar en cualquiera de los dos perfiles: el
    // perfil es del contenido, no del archivo.
    if (esVideo && file && file.durSec > perfil.maxSec) return false;
    if (esVideo && file && file.sizeBytes > perfil.maxMb * 1024 * 1024) return false;
    return true;
  }, [busy, titleRequired, title, needsFile, file, needsCover, cover, kind, durManual, esVideo, perfil]);

  const durationSec = () => {
    if (kind === 'podcast') return Math.round(Number(durManual) * 60);
    return file?.durSec || 60;
  };

  const submit = async () => {
    if (!canSend || !file && needsFile) return;
    setBusy(true);
    setError(null);
    setProgreso(null);
    try {
      let mediaUrl: string | null = null;
      let coverUrl: string | null = null;
      // Póster que genera el servidor al cerrar la subida (saca un fotograma del vídeo). Si
      // no se aprovecha, la portada se queda vacía y el detalle NO pinta el bloque de media:
      // `mediaUrls` sale [] y el vídeo se ve "solo como texto".
      let posterSubida: string | null = null;
      // Duración REAL del archivo verificada por el servidor: es la que se publica (el dato
      // que traía el selector puede venir a 0 en vídeos grandes).
      let durVerificada: number | null = null;

      if (needsFile && file) {
        if (esVideo) {
          // ── VÍDEO: URL firmada, directo del móvil al almacenamiento, con progreso ──
          setFase('subiendo');
          const subido = await subirArchivoFirmado(
            { uri: file.uri, name: file.name, mimeType: file.mime, sizeBytes: file.sizeBytes || undefined },
            {
              purpose: 'post',
              kind: 'video',
              durationKind: perfilId,
              durationSec: file.durSec || undefined,
              onProgreso: setProgreso,
              onBillete: (t) => { claveSubida.current = t.key; },
              // El tope bueno es el que devuelve el servidor (y el que impone MinIO): si
              // `.env` cambia, la app se entera sola en vez de mentir con un número fijo.
              comprobarAntes: (t) => {
                const bytes = file.sizeBytes || 0;
                if (bytes > t.maxBytes) {
                  throw new Error(`El vídeo pesa ${lbPeso(bytes)} y el máximo ahora mismo es ${Math.round(t.maxBytes / (1024 * 1024))} MB.`);
                }
                if (file.durSec && t.maxSec && file.durSec > t.maxSec) {
                  throw new Error(`El vídeo dura ${fmtDur(file.durSec)} y el máximo ahora mismo es ${Math.round(t.maxSec / 60)} minutos.`);
                }
              },
            },
          );
          setFase('verificando');
          mediaUrl = subido.url;
          durVerificada = subido.durationSec;
          posterSubida = subido.posterUrl;
          if (!subido.url) throw new Error('El vídeo se subió pero no se pudo obtener su dirección.');
        } else {
          // ── AUDIO: el camino de siempre (≤60 MB, ya va fino) ──
          setFase('subiendo');
          const up = await lifebookMediaApi.uploadFile('audio', { uri: file.uri, name: file.name, mimeType: file.mime });
          mediaUrl = up.url;
        }
      }
      if (cover) {
        const up = await lifebookMediaApi.uploadFile('image', { uri: cover.uri, name: `cover-${Date.now()}.jpg`, mimeType: 'image/jpeg' });
        coverUrl = up.url;
      }
      // La portada que elige el usuario manda; si no eligió ninguna (el caso del vídeo, que no
      // pide portada), se aprovecha el póster que devolvió el servidor al cerrar la subida.
      coverUrl = coverUrl ?? posterSubida;
      setFase('publicando');
      const durFinal = durVerificada && durVerificada > 0 ? durVerificada : durationSec();
      if (kind === 'video') {
        const post = await productosEnNotaApi.publicarVideo({
          title: title.trim(), body: body.trim() || undefined, city,
          videoUrl: mediaUrl!, coverUrl: coverUrl ?? undefined,
          durationSec: durFinal, allowComments, allowDownload,
          // Los productos viajan DENTRO del vídeo: se pintan como sticker sobre el reproductor.
          ...(productos.length ? { productIds: productos } : {}),
        });
        router.replace({ pathname: '/lifebook-post/[id]', params: { id: post.id } } as never);
      } else if (kind === 'podcast') {
        const post = await lifebookMediaApi.createPodcast({
          title: title.trim() || undefined, body: body.trim() || undefined, city,
          audioUrl: mediaUrl!, coverUrl: coverUrl!, durationSec: durFinal, allowComments, allowDownload,
        });
        router.replace({ pathname: '/lifebook-post/[id]', params: { id: post.id } } as never);
      } else if (kind === 'serie') {
        const post = await lifebookMediaApi.createSerie({ title: title.trim(), body: body.trim() || undefined, city, coverUrl: coverUrl ?? undefined });
        router.replace({ pathname: '/lifebook-post/[id]', params: { id: post.id } } as never);
      } else if (kind === 'episode' && serieId) {
        await lifebookMediaApi.addEpisode(serieId, {
          title: title.trim() || undefined, body: body.trim() || undefined,
          videoUrl: mediaUrl!, durationSec: durFinal, allowDownload,
        });
        router.back();
      } else {
        throw new Error('Faltan datos de la serie');
      }
      // Publicado: el archivo ya tiene post, no hay nada que limpiar.
      claveSubida.current = null;
    } catch (e) {
      // Si el archivo YA estaba subido y lo que falló fue publicar, se borra: un vídeo de
      // 900 MB no puede quedarse ocupando disco por un fallo de un segundo.
      await limpiarSubida(claveSubida.current);
      claveSubida.current = null;
      setError(e instanceof Error ? e.message : 'No se pudo publicar. Inténtalo de nuevo.');
      setBusy(false);
      setFase(null);
      setProgreso(null);
    }
  };

  const showDur = kind === 'video' || kind === 'episode';
  const fileLabel = kind === 'podcast' ? 'Archivo de audio' : 'Archivo de vídeo';
  const fileHint = kind === 'podcast'
    ? 'mp3 · m4a · aac… (máx 60 MB · 60 min)'
    : esVideo
      ? `mp4 · mov · webm (${perfilId === 'long' ? 'máx 1200 MB · 50 min' : 'máx 120 MB · 1 min'})`
      : 'mp4 · mov · webm';
  const pesoSubida = file?.sizeBytes ?? 0;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* Barra */}
        <View style={[styles.topBar, { borderBottomColor: colors.border, paddingTop: insets.top + 6 }]}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingVertical: espaciado.e4 }}>
            <ArrowLeft size={22} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.topTitle, { color: colors.textPrimary }]}>{meta.title}</Text>
          <Pressable onPress={submit} disabled={!canSend} style={[styles.publishBtn, { backgroundColor: canSend ? meta.color : alpha(colors.textSecondary, 0.25) }]}>
            {busy ? <ActivityIndicator size="small" color={brand.white} /> : <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: tipografia.body }}>Publicar</Text>}
          </Pressable>
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: espaciado.e16, paddingBottom: insets.bottom + 30 }}>
          {error ? (
            <View style={[styles.errorBox, { backgroundColor: alpha(colors.danger, 0.09), borderColor: alpha(colors.danger, 0.4) }]}>
              <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{error}</Text>
            </View>
          ) : null}

          {/* Archivo principal */}
          {needsFile && (
            <>
              {/* Perfil del vídeo: es una DECISIÓN, no un detalle. El corto es el del feed
                  (carga al instante); el largo es hasta 50 minutos. */}
              {esVideo && (
                <>
                  <Text style={styles.label}>TIPO DE VÍDEO</Text>
                  <View style={{ flexDirection: 'row', gap: espaciado.e8 }}>
                    {(['short', 'long'] as LbVideoPerfilId[]).map((id) => {
                      const p = LB_VIDEO_PERFILES[id];
                      const on = perfilId === id;
                      return (
                        <Pressable
                          key={id}
                          onPress={() => {
                            setPerfilId(id);
                            // Si el archivo elegido no cabe en el perfil nuevo, se suelta:
                            // dejarlo puesto y con el botón muerto no explica nada.
                            if (file && (file.durSec > p.maxSec || file.sizeBytes > p.maxMb * 1024 * 1024)) setFile(null);
                            setError(null);
                          }}
                          style={[styles.perfilCard, {
                            backgroundColor: on ? alpha(meta.color, 0.10) : colors.surface,
                            borderColor: on ? alpha(meta.color, 0.65) : colors.border,
                          }]}
                        >
                          <Text style={{ color: on ? meta.color : colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.titulo }}>{p.label}</Text>
                          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>{p.hint}</Text>
                          <Text style={{ color: colors.textSecondary, fontSize: 10.5, marginTop: espaciado.e2 }}>{p.desc}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                  {perfilId === 'long' && (
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e6, lineHeight: 15 }}>
                      Un vídeo de 50 minutos ocupa mucho. Intenta grabar en 720p: se ve bien y pesa
                      la mitad.{pesoSubida > 0
                        ? ` Este pesa ${lbPeso(pesoSubida)}: con datos móviles son ${lbTiempoSubida(pesoSubida)} de subida.`
                        : ' La subida se hace directa al almacenamiento, pero en datos móviles puede tardar y gastar bastante.'}
                    </Text>
                  )}
                </>
              )}

              <Text style={styles.label}>{fileLabel} *</Text>
              <Pressable
                onPress={busy ? undefined : (kind === 'podcast' ? pickAudioFile : pickVideoFile)}
                style={[styles.dropZone, { backgroundColor: colors.surface, borderColor: file ? alpha(colors.success, 0.6) : colors.border }]}
              >
                {file ? (
                  <View style={{ alignItems: 'center', gap: espaciado.e6 }}>
                    <Text style={{ fontSize: tipografia.heroGrande }}>{kind === 'podcast' ? '🎙️' : '🎬'}</Text>
                    <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body }} numberOfLines={1}>
                      {file.name}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
                      {fmtDur(file.durSec)}{pesoSubida ? ` · ${lbPeso(pesoSubida)}` : ''} · listo para publicar
                    </Text>
                    {!busy && (
                      <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.maximo, marginTop: espaciado.e2 }}>Toca para cambiar</Text>
                    )}
                  </View>
                ) : (
                  <View style={{ alignItems: 'center', gap: espaciado.e6 }}>
                    {kind === 'podcast' ? <Mic size={30} color={meta.color} /> : <Video size={30} color={meta.color} />}
                    <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body }}>{fileLabel}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center' }}>{fileHint}</Text>
                  </View>
                )}
              </Pressable>

              {/* Progreso REAL de la subida: sin esto, 900 MB son una pantalla congelada. */}
              {busy && progreso && fase === 'subiendo' && progreso.total > 0 && (
                <View style={{ marginTop: espaciado.e8 }}>
                  <View style={[styles.progTrack, { backgroundColor: colors.border }]}>
                    <View style={[styles.progFill, { width: `${Math.round(progreso.fraccion * 100)}%`, backgroundColor: meta.color }]} />
                  </View>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e4 }}>
                    {lbPeso(progreso.enviados)} de {lbPeso(progreso.total)} · {Math.round(progreso.fraccion * 100)} %
                    {progreso.mbps > 0.05 ? ` · ${progreso.mbps.toFixed(1).replace('.', ',')} MB/s` : ''}
                    {progreso.restanteSec !== null ? ` · faltan ~${fmtDur(progreso.restanteSec)}` : ''}
                  </Text>
                </View>
              )}

              {esVideo && file && file.durSec > perfil.maxSec && (
                <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e4 }}>
                  ⚠️ El vídeo dura {fmtDur(file.durSec)} y {perfil.label.toLowerCase()} llega a {fmtDur(perfil.maxSec)}.
                  {perfilId === 'short' ? ' Cámbialo a vídeo largo.' : ''}
                </Text>
              )}
              {esVideo && file && file.durSec <= perfil.maxSec && file.sizeBytes > perfil.maxMb * 1024 * 1024 && (
                <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e4 }}>
                  ⚠️ Pesa {lbPeso(file.sizeBytes)} y el máximo es {perfil.maxMb} MB.
                </Text>
              )}
            </>
          )}

          {/* Podcast: duración manual en minutos */}
          {kind === 'podcast' && (
            <>
              <Text style={styles.label}>DURACIÓN (minutos) *</Text>
              <TextInput
                value={durManual}
                onChangeText={(t) => setDurManual(t.replace(/[^0-9]/g, '').slice(0, 2))}
                keyboardType="number-pad"
                placeholder="p. ej. 28"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
              />
            </>
          )}

          {/* Portada */}
          {(kind === 'video' || kind === 'serie' || kind === 'podcast') && (
            <>
              <Text style={styles.label}>
                PORTADA ({kind === 'podcast' ? 'OBLIGATORIA 1:1' : 'recomendada'})
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e10 }}>
                {cover ? (
                  <View>
                    <Image source={{ uri: cover.uri }} style={styles.coverPreview} />
                    <Pressable onPress={() => setCover(null)} style={[styles.photoX, { backgroundColor: 'rgba(0,0,0,0.6)' }]} accessibilityLabel="Quitar portada">
                      <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: tipografia.micro }}>✕</Text>
                    </Pressable>
                  </View>
                ) : null}
                <Pressable onPress={pickCover} style={[styles.coverAdd, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <ImagePlus size={22} color={colors.primary} />
                  <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>{cover ? 'Cambiar' : 'Añadir portada'}</Text>
                </Pressable>
                {/* B2: portada desde un fotograma del vídeo. Solo con vídeo ya elegido y
                    solo en 'video': 'serie' no tiene archivo todavía y 'podcast' es audio,
                    y de un audio no hay fotograma que sacar. `Video` ya estaba importado. */}
                {kind === 'video' && file ? (
                  <Pressable
                    onPress={() => setCoverSheetOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Elegir la portada desde un fotograma del vídeo"
                    style={[styles.coverAdd, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <Video size={22} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>Del vídeo</Text>
                  </Pressable>
                ) : null}
              </View>
            </>
          )}

          {/* Título */}
          {(kind === 'video' || kind === 'serie' || kind === 'episode') && (
            <>
              <Text style={styles.label}>TÍTULO {titleRequired ? '*' : '(opcional)'}</Text>
              <TextInput
                value={title}
                onChangeText={setTitle}
                maxLength={LB_NOTE_TITLE_MAX}
                placeholder={kind === 'serie' ? 'Nombre de la serie' : kind === 'episode' ? 'Título del episodio' : 'Título del video'}
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
              />
            </>
          )}

          {/* Descripción */}
          <Text style={styles.label}>DESCRIPCIÓN {kind === 'podcast' || kind === 'episode' ? '(opcional)' : '(opcional)'}</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            multiline
            placeholder="Cuéntanos de qué va…"
            placeholderTextColor={colors.textSecondary}
            maxLength={LB_NOTE_BODY_MAX}
            style={[styles.textArea, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: colors.border }]}
          />

          {/* Ciudad (no en episode: pertenece a la serie) */}
          {kind !== 'episode' && (
            <>
              <Text style={styles.label}>CIUDAD *</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e7 }}>
                {LB_CITIES.map((c) => {
                  const on = city === c;
                  return (
                    <Pressable key={c} onPress={() => setCity(c)} style={[styles.chip, { backgroundColor: on ? alpha(colors.primary, 0.14) : colors.surface, borderColor: on ? alpha(colors.primary, 0.55) : colors.border }]}>
                      <Text style={{ color: on ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>{c}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {/* TANDA C (bis) — productos DENTRO del vídeo. Solo para VÍDEO: es el único tipo cuya
              publicación acepta `productIds` (se ven como sticker sobre el reproductor). En
              podcast/serie/episodio no se ofrece, en vez de ofrecerlo y perderlo por el camino. */}
          {kind === 'video' ? (
            <>
              <Text style={styles.label}>PRODUCTOS DEL VÍDEO (opcional)</Text>
              <Pressable
                onPress={() => setProdOpen(true)}
                accessibilityLabel="Elegir productos para este vídeo"
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, borderRadius: radios.md,
                  borderWidth: trazo.fino, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e11,
                  backgroundColor: productos.length ? alpha(colors.primary, 0.14) : colors.surface,
                  borderColor: productos.length ? alpha(colors.primary, 0.55) : colors.border,
                }}
              >
                <ShoppingBag size={14} color={productos.length ? colors.primary : colors.textSecondary} />
                <Text style={{ color: productos.length ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>
                  {productos.length
                    ? `${productos.length} producto${productos.length === 1 ? '' : 's'} en este vídeo`
                    : 'Enseñar un producto en el vídeo (opcional)'}
                </Text>
              </Pressable>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e6, lineHeight: 15 }}>
                Sale como una pegatina encima del vídeo, con su precio. Solo productos de tu tienda.
              </Text>
            </>
          ) : null}

          {/* Permisos */}
          {kind !== 'serie' && (
            <View style={{ marginTop: espaciado.e18 }}>
              <View style={styles.switchRow}>
                <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>Permitir comentarios</Text>
                <Switch value={allowComments} onValueChange={setAllowComments} trackColor={{ true: colors.primary }} />
              </View>
              <View style={styles.switchRow}>
                <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>Permitir descarga</Text>
                <Switch value={allowDownload} onValueChange={setAllowDownload} trackColor={{ true: colors.primary }} />
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e2 }}>
                {allowDownload ? 'Cualquiera podrá descargar el archivo.' : 'Solo se podrá escuchar/ver en streaming.'}
              </Text>
            </View>
          )}

          <Pressable onPress={submit} disabled={!canSend} style={[styles.bigPublish, { backgroundColor: canSend ? meta.color : alpha(colors.textSecondary, 0.25) }]}>
            {busy ? <ActivityIndicator size="small" color={brand.white} /> : <Upload size={18} color={brand.white} />}
            <Text style={{ color: brand.white, fontSize: tipografia.subtitle, fontWeight: peso.titulo }}>
              {fase === 'subiendo'
                ? (progreso && progreso.total > 0
                  ? `Subiendo… ${Math.round(progreso.fraccion * 100)} %`
                  : 'Subiendo…')
                : fase === 'verificando' ? 'Comprobando el archivo…'
                  : fase === 'publicando' ? 'Publicando…'
                    : meta.title}
            </Text>
          </Pressable>
        </ScrollView>
      </View>

      {/* B2: elegir portada desde un fotograma del vídeo.
          Al confirmar, el fotograma ya es un ARCHIVO LOCAL (`{ uri, dataUrl }`, la misma
          forma que devuelve la galería) y entra en el mismo estado `cover`. Así la subida
          no cambia: sigue siendo `uploadFile('image', { uri: cover.uri, … })` y hay UNA
          sola vía de portada, no dos. Sin esto habría que tocar también `submit`. */}
      {/* TANDA C (bis): la MISMA hoja de productos que usa el compositor de notas
          (`components/lifebook/SelectorDeProductos.tsx`). Así las dos pantallas se comportan
          igual: mismo orden numerado, mismo tope y mismas reglas. */}
      <SelectorDeProductos
        visible={prodOpen}
        onClose={() => setProdOpen(false)}
        seleccion={productos}
        onCambiar={setProductos}
        titulo="Productos en este vídeo"
        ayuda="Se verán como sticker ENCIMA del vídeo, en el orden en que los elijas."
      />

      <VideoCoverSheet
        visible={coverSheetOpen && kind === 'video' && !!file}
        videoUri={file?.uri ?? ''}
        durSec={file?.durSec ?? 0}
        onClose={() => setCoverSheetOpen(false)}
        onPick={(c) => { setCover(c); setError(null); }}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingHorizontal: espaciado.e12, paddingBottom: espaciado.e8, borderBottomWidth: StyleSheet.hairlineWidth },
  topTitle: { fontSize: tipografia.subtitle, fontWeight: peso.titulo, flex: 1 },
  publishBtn: { borderRadius: radios.full, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e7, minWidth: 76, alignItems: 'center' },
  label: { fontSize: tipografia.caption, fontWeight: peso.titulo, color: neutro.n600, letterSpacing: 0.8, marginTop: espaciado.e16, marginBottom: espaciado.e6 },
  dropZone: { borderRadius: radios.lg, borderWidth: trazo.base, borderStyle: 'dashed', paddingVertical: espaciado.e26, paddingHorizontal: espaciado.e16, alignItems: 'center' },
  coverPreview: { width: 84, height: 84, borderRadius: 14, backgroundColor: neutro.n200 },
  photoX: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  coverAdd: { borderRadius: 14, borderWidth: trazo.fino, borderStyle: 'dashed', paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e12, alignItems: 'center', gap: espaciado.e4 },
  input: { borderRadius: radios.md, borderWidth: trazo.fino, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e9, fontSize: tipografia.body },
  textArea: { borderRadius: radios.md, borderWidth: trazo.fino, padding: espaciado.e12, fontSize: tipografia.body, minHeight: 84, textAlignVertical: 'top' },
  chip: { borderRadius: radios.full, paddingHorizontal: espaciado.e11, paddingVertical: espaciado.e6, borderWidth: trazo.fino, borderColor: 'transparent' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: espaciado.e6 },
  bigPublish: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e8, borderRadius: radios.full, paddingVertical: espaciado.e14, marginTop: espaciado.e22 },
  errorBox: { borderRadius: radios.md, borderWidth: trazo.fino, padding: espaciado.e10, marginBottom: espaciado.e4 },
  perfilCard: { flex: 1, borderRadius: 14, borderWidth: trazo.base, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10 },
  progTrack: { height: 6, borderRadius: radios.full, overflow: 'hidden' },
  progFill: { height: 6, borderRadius: radios.full },
});
