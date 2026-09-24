/**
 * SocialHomeHeader — cabecera de la Home con DOS CAPAS separadas:
 *
 *  · CAPA PERFIL (SIEMPRE renderizada): fondo = portada real del usuario
 *    (cover_photo_url) o gradiente de marca; identidad del conductor
 *    (avatar 40 + nombre en SU color elegido + "En línea") SIN sombra
 *    degradada; botón de CIUDAD flotando sobre la parte superior del mapa,
 *    con estilo degradado OSCURO + letra AZUL.
 *
 *  · CAPA PUBLICIDAD (superpuesta, solo si hay anuncio y NO oculto): imagen
 *    del anuncio borde a borde + texto + etiqueta "Publicidad" + botón X.
 *    La X solo cambia isAdVisible → la capa perfil permanece intacta.
 *
 * (2026-09-09 v2): altura = 25 % de la pantalla; sin sombra oscura detrás del
 * nombre; nombre con color configurable (users.name_color); ciudad abajo.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImageBackground, Linking, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronDown, MapPin, X } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { useSession } from '../state/session';
import { authApi } from '../api/auth';
import { adsApi, type HomeAd } from '../api/ads';
import { absUrl } from '../api/config';
import { useStatusStore } from '../state/statusStore';
import StatusRingAvatar from './status/StatusRingAvatar';
import StatusChip from './status/StatusChip';
import StatusDetailModal from './status/StatusDetailModal';
import { brand, espaciado, radios, tipografia } from '@egrouteplan/ui-kit';

/** Altura del banner (25 % de la pantalla, acotada). */
const BANNER_H_RATIO = 0.25;
const BANNER_H_MIN = 150;
const BANNER_H_MAX = 300;
/** Zona extra bajo el banner donde flota el botón de ciudad (sobre el mapa). */
const CITY_ZONE_H = 52;

export const homeBannerHeight = (winH: number) =>
  Math.round(Math.min(Math.max(winH * BANNER_H_RATIO, BANNER_H_MIN), BANNER_H_MAX));
export const homeHeaderHeight = (winH: number, insetsTop: number) => insetsTop + homeBannerHeight(winH) + CITY_ZONE_H;

export default function SocialHomeHeader({
  cityName,
  onPressCity,
}: {
  cityName: string;
  onPressCity: () => void;
}) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const router = useRouter();
  const { isAuthenticated } = useSession();

  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [role, setRole] = useState<'PASSENGER' | 'DRIVER' | 'ADMIN' | null>(null);
  const [nameColor, setNameColor] = useState<string | null>(null);
  const { status: myStatus, loading: statusLoading, refresh: refreshStatus, localExpire } = useStatusStore();
  const [detailOpen, setDetailOpen] = useState(false);

  const [ad, setAd] = useState<HomeAd | null>(null);
  const [isAdVisible, setIsAdVisible] = useState(true);
  const countedRef = useRef<string | null>(null);

  const loadProfile = useCallback(() => {
    if (!isAuthenticated) return;
    let alive = true;
    authApi.me()
      .then((p) => {
        if (!alive) return;
        setCoverUrl(p.coverUrl ?? null);
        setAvatarUrl(p.avatarUrl ?? null);
        setDisplayName(p.fullName ?? null);
        setRole(p.role);
        setNameColor(p.nameColor && /^#[0-9A-Fa-f]{6}$/.test(p.nameColor) ? p.nameColor : null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [isAuthenticated]);

  useEffect(() => loadProfile(), [loadProfile]);

  // Refresca el estado al volver la Home al frente y cuando arranca la sesión.
  useEffect(() => { if (isAuthenticated) refreshStatus(); }, [isAuthenticated, refreshStatus]);

  useEffect(() => {
    let alive = true;
    setIsAdVisible(true);
    adsApi.homeBanner(cityName)
      .then((b) => { if (alive) setAd(b); })
      .catch(() => { if (alive) setAd(null); });
    return () => { alive = false; };
  }, [cityName]);

  useEffect(() => {
    if (!isAdVisible || !ad || countedRef.current === ad.id) return;
    countedRef.current = ad.id;
    adsApi.impression(ad.id).catch(() => {});
  }, [ad, isAdVisible]);

  const openAd = () => {
    if (!ad) { onPressCity(); return; }
    adsApi.click(ad.id).catch(() => {});
    if (ad.externalUrl) Linking.openURL(ad.externalUrl).catch(() => {});
    else if (ad.targetRoute) router.push(ad.targetRoute as never);
  };

  const isDriver = role === 'DRIVER';
  const hasSessionIdentity = isAuthenticated && (avatarUrl || displayName);
  const profileCover = coverUrl ? absUrl(coverUrl) : null;
  const fadeTo = isDark ? '#0B1220' : '#E7EDF4';
  const bannerH = homeBannerHeight(winH);
  const showAd = !!ad && isAdVisible;
  const nameTint = nameColor ?? (isDriver ? brand.white : brand.white);

  return (
    <View style={[styles.wrap, { height: insets.top + bannerH + CITY_ZONE_H }]} pointerEvents="box-none">
      {/* ============ CAPA PERFIL (siempre) ============ */}
      <View style={[styles.bannerArea, { top: insets.top, height: bannerH }]} pointerEvents="none">
        {profileCover ? (
          <ImageBackground source={{ uri: profileCover }} style={StyleSheet.absoluteFill} imageStyle={styles.coverImg} />
        ) : (
          <View style={[StyleSheet.absoluteFill, styles.coverFallback]}>
            <Svg height="100%" width="100%">
              <Defs>
                <SvgLinearGradient id="profBg" x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={isDark ? '#16202E' : '#DFEAF2'} />
                  <Stop offset="1" stopColor={isDark ? '#0F1620' : '#F6EEDC'} />
                </SvgLinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#profBg)" />
            </Svg>
          </View>
        )}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg height="100%" width="100%">
            <Defs>
              <SvgLinearGradient id="profFade" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0.6" stopColor={fadeTo} stopOpacity="0" />
                <Stop offset="1" stopColor={fadeTo} stopOpacity="0.85" />
              </SvgLinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#profFade)" />
          </Svg>
        </View>
      </View>

      {/* Identidad (SIEMPRE). SIN sombra degradada; nombre con color elegido.
          El avatar lleva el ANILLO del estado activo (v3). */}
      {hasSessionIdentity && (
        <View style={[styles.identity, { top: insets.top + 10, left: 10 }]} pointerEvents="box-none">
          <StatusRingAvatar
            avatarUrl={avatarUrl}
            name={displayName}
            status={myStatus}
            size={40}
            ringWidth={3}
            onPress={() => router.push('/profile' as never)}
          />
          <View style={{ flexShrink: 1 }}>
            <Text style={[styles.driverName, { color: nameTint }]} numberOfLines={1}>{displayName ?? 'Conductor'}</Text>
            {isDriver ? (
              <View style={styles.onlineRow}>
                <View style={styles.onlineDot} />
                <Text style={[styles.onlineTxt, { color: nameTint }]}>En línea</Text>
              </View>
            ) : null}
            {/* Estado 24h v3: chip sobrio bajo el nombre si hay estado activo.
                Tocar → detalle (Finalizar/Compartir). */}
            {myStatus && !statusLoading ? (
              <StatusChip
                compact
                status={myStatus}
                foreground={brand.white}
                onPress={() => setDetailOpen(true)}
                onExpired={() => { refreshStatus(); }}
              />
            ) : null}
          </View>
        </View>
      )}

      {/* ============ CAPA PUBLICIDAD (superpuesta) ============ */}
      {showAd && (
        <Pressable
          onPress={openAd}
          accessibilityRole="button"
          accessibilityLabel={`Publicidad: ${ad.title}`}
          style={[styles.bannerArea, { top: insets.top, height: bannerH }]}
        >
          <ImageBackground
            source={{ uri: ad.imageUrl ? absUrl(ad.imageUrl) : profileCover ?? DEFAULT_AD_IMG }}
            style={StyleSheet.absoluteFill}
            imageStyle={styles.coverImg}
          />
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            <Svg height="100%" width="100%">
              <Defs>
                <SvgLinearGradient id="adFade" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0.5" stopColor={fadeTo} stopOpacity="0" />
                  <Stop offset="1" stopColor={fadeTo} stopOpacity="0.85" />
                </SvgLinearGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#adFade)" />
            </Svg>
          </View>
          <View style={styles.adCopy} pointerEvents="none">
            <Text style={styles.adTitle} numberOfLines={1}>{ad.emoji ? `${ad.emoji} ` : ''}{ad.title}</Text>
            {ad.subtitle ? <Text style={styles.adSub} numberOfLines={1}>{ad.subtitle}</Text> : null}
          </View>
          {/* Etiqueta Publicidad + X SIEMPRE sobre el anuncio (no ocultos) */}
          <View style={styles.adTag} pointerEvents="none">
            <Text style={styles.adTagTxt}>Publicidad</Text>
          </View>
          <Pressable
            onPress={() => setIsAdVisible(false)}
            accessibilityRole="button"
            accessibilityLabel="Ocultar anuncio"
            hitSlop={10}
            style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.7 : 1 }]}
          >
            <X size={13} color={brand.white} />
          </Pressable>
        </Pressable>
      )}

      {/* Botón de CIUDAD: degradado OSCURO + letra AZUL, flotando sobre el mapa */}
      <Pressable
        onPress={onPressCity}
        accessibilityRole="button"
        accessibilityLabel={`Ubicación actual: ${cityName}`}
        accessibilityHint="Toca para cambiar de ciudad"
        style={({ pressed }) => [styles.cityBtn, { top: insets.top + bannerH + 10, opacity: pressed ? 0.85 : 1 }]}
      >
        <MapPin size={13} color={brand.primary} />
        <Text style={styles.cityTxt} numberOfLines={1}>{cityName || 'Seleccionar ciudad'}</Text>
        <ChevronDown size={13} color={brand.primary} />
      </Pressable>

      {/* Detalle del ESTADO 24h (v3): abierto desde el chip bajo el nombre. */}
      {myStatus && (
        <StatusDetailModal
          visible={detailOpen}
          status={myStatus}
          isMine
          onClose={() => setDetailOpen(false)}
          onEnded={() => localExpire()}
        />
      )}
    </View>
  );
}

const DEFAULT_AD_IMG = 'https://hk.egrouteplan.com/wallet/assets/ads/taxi-malabo.jpg';

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, top: 0, zIndex: 25 },
  bannerArea: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  coverImg: { resizeMode: 'cover' },
  coverFallback: { overflow: 'hidden' },
  identity: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, zIndex: 30 },
  avatar: {
    width: 40, height: 40, borderRadius: 20, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.30)',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)',
  },
  avatarImg: { width: '100%', height: '100%' },
  driverName: { fontSize: tipografia.body, fontWeight: '900', maxWidth: 180 },
  onlineRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, marginTop: 1 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: brand.success, borderWidth: 1, borderColor: 'rgba(255,255,255,0.7)' },
  onlineTxt: { fontSize: 10.5, fontWeight: '900' },
  adCopy: { position: 'absolute', left: 14, right: 60, bottom: 10 },
  adTitle: {
    color: brand.white, fontSize: 15, fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4,
  },
  adSub: {
    color: 'rgba(255,255,255,0.95)', fontSize: tipografia.caption, fontWeight: '700', marginTop: 1,
    textShadowColor: 'rgba(0,0,0,0.55)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 3,
  },
  adTag: {
    position: 'absolute', top: 10, right: 40,
    backgroundColor: 'rgba(0,0,0,0.62)', borderRadius: 6,
    paddingHorizontal: espaciado.e7, paddingVertical: espaciado.e3,
  },
  adTagTxt: { color: brand.white, fontSize: 9, fontWeight: '900', letterSpacing: 0.4 },
  closeBtn: {
    position: 'absolute', top: 8, right: 10,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', zIndex: 50,
  },
  cityBtn: {
    position: 'absolute', left: 14, flexDirection: 'row', alignItems: 'center', gap: espaciado.e5,
    borderRadius: radios.full,
    // Degradado OSCURO + letra AZUL (estilo previo del pill de ciudad).
    backgroundColor: 'rgba(10,16,24,0.78)',
    borderWidth: 1, borderColor: 'rgba(79,168,255,0.5)',
    paddingHorizontal: espaciado.e11, paddingVertical: espaciado.e6,
    zIndex: 30,
    elevation: 3,
  },
  cityTxt: { fontSize: tipografia.caption, fontWeight: '900', color: brand.primary, maxWidth: 180 },
});
