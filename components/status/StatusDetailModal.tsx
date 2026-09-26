/**
 * StatusDetailModal — detalle del ESTADO 24H (vista "story", rediseño 2026-09-09).
 *
 * Al tocar el estado se abre una vista INMERSIVA a pantalla casi completa:
 *  · La FOTO ocupa ~60% del alto de la pantalla (o el fondo del preset con el
 *    emoji gigante si el estado no lleva foto).
 *  · El EMOJI + la LÍNEA se superponen sobre la parte baja de la foto (con
 *    degradado oscuro para legibilidad).
 *  · Si hay VARIAS fotos: swipe horizontal + puntos indicadores (1/4).
 *  · Tocar la foto → visor 100% (foto completa, sin recortes) con cerrar.
 *  · Zona inferior: autor (avatar+nombre+tiempo), ubicación, enlace a servicio
 *    y acciones: Finalizar (propio) / Compartir / Reportar (ajeno).
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Dimensions, Image, Modal, Pressable, ScrollView,
  Share, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock, Flag, MapPin, Share2, X, ZoomIn } from 'lucide-react-native';
import { espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import type { MeProfile } from '../../api/auth';
import type { UserStatus, StatusMediaItem } from '../../api/status';
import { absUrl } from '../../api/config';
import StatusRingAvatar from './StatusRingAvatar';
import { statusBgColors } from '../../constants/status';
import { useStatusStore } from '../../state/statusStore';
import { useServerClock, formatRemainingMs } from '../../hooks/useServerClock';
import { REPORT_REASONS } from '../../constants/status';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { ir as irSeguro } from '../../constants/rutas';
import { brand } from '@egrouteplan/ui-kit';

const { height: WIN_H, width: WIN_W } = Dimensions.get('window');
const HERO_H = Math.round(WIN_H * 0.60);

export default function StatusDetailModal({
  visible,
  status,
  author,
  isMine,
  onClose,
  onEnded,
}: {
  visible: boolean;
  status: UserStatus;
  author?: Pick<MeProfile, 'id' | 'fullName' | 'avatarUrl' | 'role' | 'nameColor'> | null;
  isMine?: boolean;
  onClose: () => void;
  onEnded?: () => void;
}) {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { report, end } = useStatusStore();
  const [busy, setBusy] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [photoIdx, setPhotoIdx] = useState(0);
  const [lightbox, setLightbox] = useState(false);
  const endedRef = useRef(false);
  const nowS = useServerClock(30_000);
  const expiresMs = status.expiresAt ? new Date(status.expiresAt).getTime() : 0;
  const remainingMs = expiresMs ? Math.max(0, expiresMs - nowS) : 0;
  const [c1, c2] = statusBgColors(status.preset.bg);
  const mine = isMine ?? !author;

  const gallery: StatusMediaItem[] = status.gallery?.length ? status.gallery : (status.media ? [status.media] : []);
  const hasPhotos = gallery.length > 0;
  const line = status.text || status.preset.label || '';

  useEffect(() => {
    if (visible) { setReportOpen(false); endedRef.current = false; setBusy(false); setPhotoIdx(0); }
  }, [visible]);

  useEffect(() => {
    if (visible && remainingMs <= 0 && expiresMs && !endedRef.current) {
      const t = setTimeout(() => { endedRef.current = true; onClose(); }, 400);
      return () => clearTimeout(t);
    }
  }, [remainingMs, expiresMs, visible, onClose]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / WIN_W);
    if (idx >= 0 && idx !== photoIdx) setPhotoIdx(idx);
  };

  const doReport = async (reason: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const okR = await report(status.id, reason);
      Alert.alert('Gracias', okR ? 'Hemos recibido tu reporte.' : 'No se pudo enviar el reporte.');
      setReportOpen(false);
    } catch (e) {
      Alert.alert('Reporte', e instanceof Error ? e.message : 'No se pudo enviar el reporte.');
    } finally { setBusy(false); }
  };

  const doEnd = () => {
    Alert.alert('Finalizar estado', '¿Quitar tu estado? Desaparecerá para todos.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Finalizar', style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await end();
            onEnded?.();
            onClose();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo finalizar');
          } finally { setBusy(false); }
        },
      },
    ]);
  };

  const share = () => {
    const label = `${status.preset.emoji} ${line}`;
    Share.share({ message: `Mi estado en EG Route Plan: ${label} · dura 24 h` }).catch(() => {});
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.root}>
        {/* ===== HERO: foto ~60% o fondo del preset ===== */}
        <View style={[styles.hero, { height: HERO_H }]}>
          {hasPhotos ? (
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={32}
              style={styles.heroScroll}
            >
              {gallery.map((m, i) => (
                <Pressable
                  key={m.id}
                  onPress={() => setLightbox(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver foto ${i + 1} a pantalla completa`}
                  style={{ width: WIN_W, height: HERO_H }}
                >
                  <Image source={{ uri: absUrl(m.url) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Svg height="100%" width="100%" style={StyleSheet.absoluteFill}>
              <Defs>
                <SvgLinearGradient id={`hero-${status.id}`} x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={c1} />
                  <Stop offset="1" stopColor={c2} />
                </SvgLinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill={`url(#hero-${status.id})`} />
            </Svg>
          )}

          {/* Degradado inferior del hero (legibilidad del texto superpuesto) */}
          <View pointerEvents="none" style={styles.heroFade}>
            <Svg height="100%" width="100%">
              <Defs>
                <SvgLinearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0.45" stopColor={brand.visor} stopOpacity="0" />
                  <Stop offset="1" stopColor={brand.visor} stopOpacity="0.72" />
                </SvgLinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroFade)" />
            </Svg>
          </View>

          {/* Cabecera flotante del hero */}
          <View style={[styles.heroHeader, { top: insets.top + 8 }]}>
            <StatusRingAvatar
              avatarUrl={author?.avatarUrl ?? null}
              name={author?.fullName}
              status={status}
              size={38}
              ringWidth={3}
            />
            <View style={{ flex: 1, marginLeft: espaciado.e8 }}>
              <Text style={styles.heroName} numberOfLines={1}>{author?.fullName ?? 'Mi estado'}</Text>
              {remainingMs > 0 && (
                <View style={styles.timeRow}>
                  <Clock size={10} color="rgba(255,255,255,0.9)" />
                  <Text style={styles.timeTxt}>quedan {formatRemainingMs(remainingMs)}</Text>
                </View>
              )}
            </View>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Cerrar" style={styles.iconBtn}>
              <X size={22} color={brand.white} />
            </Pressable>
          </View>

          {/* Texto + emoji SUPERPUESTO en la parte baja del hero */}
          {line ? (
            <View style={[styles.overlayText, { bottom: hasPhotos ? 34 : 24 }]} pointerEvents="none">
              {!hasPhotos ? <Text style={styles.overlayEmoji}>{status.preset.emoji}</Text> : null}
              <Text style={styles.overlayLine} numberOfLines={3}>{line}</Text>
            </View>
          ) : null}

          {/* Puntos de galería */}
          {hasPhotos && gallery.length > 1 ? (
            <View style={styles.dots}>
              {gallery.map((m, i) => (
                <View key={m.id} style={[styles.dot, { opacity: i === photoIdx ? 1 : 0.45, backgroundColor: i === photoIdx ? brand.white : brand.white }]} />
              ))}
            </View>
          ) : null}
        </View>

        {/* ===== ZONA INFERIOR (autor, ubicación, enlace, acciones) ===== */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 16, backgroundColor: colors.background }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
            {status.locationText ? (
              <View style={styles.locRow}>
                <MapPin size={13} color={colors.textSecondary} />
                <Text style={[styles.locTxt, { color: colors.textSecondary }]}>{status.locationText}</Text>
              </View>
            ) : null}

            {hasPhotos && (
              <Pressable onPress={() => setLightbox(true)} accessibilityRole="button" accessibilityLabel="Ver foto a pantalla completa" style={styles.zoomHintRow}>
                <ZoomIn size={13} color={colors.textSecondary} />
                <Text style={[styles.zoomHint, { color: colors.textSecondary }]}>
                  Toca la foto para verla en grande
                </Text>
              </Pressable>
            )}

            {status.link && <ServiceLink status={status} colors={colors} onOpen={() => onClose()} />}

            <View style={styles.actions}>
              <Pressable onPress={share} accessibilityRole="button" style={[styles.action, { backgroundColor: colors.surface }]}>
                <Share2 size={17} color={colors.textSecondary} />
                <Text style={[styles.actionTxt, { color: colors.textSecondary }]}>Compartir</Text>
              </Pressable>
              {mine ? (
                <Pressable onPress={doEnd} disabled={busy} accessibilityRole="button" style={[styles.action, { backgroundColor: 'rgba(245,63,63,0.10)' }]}>
                  {busy ? <ActivityIndicator color={colors.text.danger} size="small" /> : <Text style={[styles.actionTxt, { color: colors.text.danger }]}>Finalizar</Text>}
                </Pressable>
              ) : (
                <Pressable onPress={() => setReportOpen(true)} accessibilityRole="button" style={[styles.action, { backgroundColor: 'rgba(245,63,63,0.10)' }]}>
                  <Flag size={17} color={colors.text.danger} />
                  <Text style={[styles.actionTxt, { color: colors.text.danger }]}>Reportar</Text>
                </Pressable>
              )}
            </View>

            {reportOpen && (
              <View style={[styles.reportBox, { backgroundColor: colors.surface }]}>
                <Text style={[styles.reportTitle, { color: colors.textPrimary }]}>¿Por qué reportas este estado?</Text>
                {REPORT_REASONS.map((r) => (
                  <Pressable key={r.value} onPress={() => doReport(r.value)} disabled={busy} accessibilityRole="button" style={({ pressed }) => [styles.reportRow, { borderBottomColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
                    <Text style={[styles.reportRowTxt, { color: colors.textPrimary }]}>{r.label}</Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => setReportOpen(false)} accessibilityRole="button" style={{ paddingVertical: espaciado.e10 }}>
                  <Text style={[styles.reportCancel, { color: colors.textSecondary }]}>Cancelar</Text>
                </Pressable>
              </View>
            )}
          </ScrollView>
        </View>
      </View>

      {/* ===== VISOR 100% (lightbox) ===== */}
      <FullScreenViewer
        visible={lightbox && hasPhotos}
        photos={gallery}
        startIndex={photoIdx}
        onClose={() => setLightbox(false)}
      />
    </Modal>
  );
}

/** Enlace a servicio (fila discreta). */
function ServiceLink({ status, colors, onOpen }: { status: UserStatus; colors: any; onOpen: () => void }) {
  const router = useRouter();
  const ROUTES: Record<string, string> = {
    taxi: '/taxi', intercity: '/intercity', food: '/food',
    ecomerse: '/ecomerse', rental: '/alquiler', work: '/work',
  };
  const labelMap: Record<string, string> = {
    taxi: 'Llamar taxi', intercity: 'Ciudad a Ciudad', food: 'Ver restaurante',
    ecomerse: 'Ver tienda', rental: 'Ver anuncio', work: 'Ver oferta',
  };
  if (!status.link || !ROUTES[status.link.type]) return null;
  const link = status.link;
  const route = ROUTES[link.type];
  return (
    <Pressable
      onPress={() => { onOpen(); irSeguro.libre(String(route ?? '')); }}
      accessibilityRole="button"
      style={({ pressed }) => [styles.serviceBtn, { backgroundColor: 'rgba(0,132,255,0.08)', opacity: pressed ? 0.8 : 1 }]}
    >
      <Text style={{ color: colors.text.primary, fontSize: tipografia.body, fontWeight: peso.titulo }}>
        {labelMap[link.type] ?? 'Ver servicio'} →
      </Text>
    </Pressable>
  );
}

/**
 * FullScreenViewer — visor de la foto a pantalla completa (100%, sin recortes),
 * con swipe horizontal entre fotos y botón cerrar (estilo WhatsApp).
 */
function FullScreenViewer({ visible, photos, startIndex, onClose }: {
  visible: boolean;
  photos: StatusMediaItem[];
  startIndex: number;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [idx, setIdx] = useState(startIndex);

  useEffect(() => {
    if (visible) {
      setIdx(startIndex);
      setTimeout(() => scrollRef.current?.scrollTo({ x: startIndex * WIN_W, animated: false }), 30);
    }
  }, [visible, startIndex]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.lightbox}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Cerrar visor" style={[styles.lightboxClose, { top: insets.top + 10 }]}>
          <X size={24} color={brand.white} />
        </Pressable>
        {photos.length > 1 && (
          <View style={[styles.lightboxCounter, { top: insets.top + 16 }]}>
            <Text style={styles.lightboxCounterTxt}>{idx + 1}/{photos.length}</Text>
          </View>
        )}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / WIN_W))}
          scrollEventThrottle={32}
        >
          {photos.map((p) => (
            <View key={p.id} style={{ width: WIN_W, height: WIN_H }}>
              <FitFullImage uri={absUrl(p.url)} />
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

/** Imagen a pantalla completa: contain (nunca se recorta). */
function FitFullImage({ uri }: { uri: string }) {
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    let alive = true;
    Image.getSize(uri, (w, h) => { if (alive && w > 0 && h > 0) setNatural({ w, h }); }, () => { if (alive) setNatural({ w: 4, h: 3 }); });
    return () => { alive = false; };
  }, [uri]);
  return (
    <View style={{ width: WIN_W, height: WIN_H }}>
      {natural ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={brand.white} /></View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.visor },
  hero: { width: '100%', overflow: 'hidden' },
  heroScroll: { flexGrow: 0 },
  heroFade: { ...StyleSheet.absoluteFillObject },
  heroHeader: {
    position: 'absolute', left: 14, right: 14,
    flexDirection: 'row', alignItems: 'center',
  },
  heroName: { color: brand.white, fontSize: tipografia.cuerpo, fontWeight: peso.titulo, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 },
  timeRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, marginTop: 1 },
  timeTxt: { color: 'rgba(255,255,255,0.95)', fontSize: tipografia.micro, fontWeight: peso.fuerte, textShadowColor: 'rgba(0,0,0,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3 },
  iconBtn: { width: 36, height: 36, borderRadius: radios.full, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', borderWidth: trazo.fino, borderColor: 'rgba(255,255,255,0.35)' },
  overlayText: { position: 'absolute', left: 18, right: 18 },
  overlayEmoji: { fontSize: tipografia.emojiGrande, textShadowColor: 'rgba(0,0,0,0.5)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6 },
  overlayLine: {
    color: brand.white, fontSize: tipografia.subtitulo, fontWeight: peso.titulo, lineHeight: 29,
    textShadowColor: 'rgba(0,0,0,0.7)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 6,
  },
  dots: { position: 'absolute', bottom: 10, alignSelf: 'center', flexDirection: 'row', gap: espaciado.e6 },
  dot: { width: 7, height: 7, borderRadius: radios.full },
  footer: { flex: 1, paddingHorizontal: espaciado.e18, paddingTop: espaciado.e14 },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e5, marginBottom: espaciado.e8 },
  locTxt: { fontSize: tipografia.caption, fontWeight: peso.medio },
  zoomHintRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, marginBottom: espaciado.e12 },
  zoomHint: { fontSize: tipografia.caption, fontWeight: peso.medio, fontStyle: 'italic' },
  serviceBtn: { borderRadius: radios.campo, paddingVertical: espaciado.e12, paddingHorizontal: espaciado.e14, marginBottom: espaciado.e12, alignItems: 'center' },
  actions: { flexDirection: 'row', gap: espaciado.e10 },
  action: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e6, borderRadius: radios.campo, paddingVertical: espaciado.e12 },
  actionTxt: { fontSize: tipografia.body, fontWeight: peso.maximo },
  reportBox: { borderRadius: radios.campo, padding: espaciado.e12, marginTop: espaciado.e14 },
  reportTitle: { fontSize: tipografia.body, fontWeight: peso.titulo, marginBottom: espaciado.e4 },
  reportRow: { paddingVertical: espaciado.e11, borderBottomWidth: trazo.fino },
  reportRowTxt: { fontSize: tipografia.body, fontWeight: peso.medio },
  reportCancel: { fontSize: tipografia.body, fontWeight: peso.fuerte, textAlign: 'center', marginTop: espaciado.e4 },
  lightbox: { flex: 1, backgroundColor: brand.visor },
  lightboxClose: { position: 'absolute', right: 16, zIndex: 10, width: 40, height: 40, borderRadius: radios.full, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  lightboxCounter: { position: 'absolute', left: 18, zIndex: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: radios.full, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e4 },
  lightboxCounterTxt: { color: brand.white, fontSize: tipografia.caption, fontWeight: peso.titulo },
});
