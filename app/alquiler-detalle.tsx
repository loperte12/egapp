/**
 * AlquilerDetalleScreen — detalle de una propiedad (kit PropertyDetailScreen v2) + auditoría v2.
 * Galería con dots + favorito/compartir; precio compuesto (noche+mes); costes
 * transparentes; servicios; descripción; POIs; arrendador verificado; mapa con
 * MapBackground (carga/error/Reintentar); aviso anti-estafa; reportar con feedback;
 * barra Llamar (1) + WhatsApp (2) con contactClicks y safe-area.
 * v2: tema completo, busyRef anti doble-tap, error/Reintentar, iconos lucide,
 * a11y, share con web pública real (/rental/<id>), login si 401 al guardar favorito.
 * Ruta: /alquiler-detalle?id=
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, LayoutChangeEvent, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, Flag, Heart, MapPin, MessageSquare, Phone, Share2, ShieldAlert } from 'lucide-react-native';
import { alpha, espaciado, GhostButton, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { rentalApi, RentalProperty } from '../api/rental';
import { ApiError } from '../api/httpClient';
import { LazyImage } from '../components/rental/LazyImage';
import { FeaturedBadge, PremiumBadge, VerificationBadge } from '../components/rental/Badges';
import { PriceCalculator } from '../components/rental/PriceCalculator';
import { LandlordCard } from '../components/rental/LandlordCard';
import MapBackground from '../components/MapBackground';
import { EgCamera, EgMarkers } from '../packages/map';
import { SERVICE_LABELS } from '../constants/rental';
import { formatXAF, formatDistanceKm, getTimeAgo, getPropertyTypeLabel, getPropertyTypeEmoji, isLandType } from '../utils/formatHelpers';
import { brand } from '@egrouteplan/ui-kit';

/** URL de la web pública del anuncio (creada 2026-09-02: /rental/<id> → landing). */
const APP_PROPERTY_BASE_URL = 'https://egrouteplan.com/rental';

const TEXTS = {
  loading: 'Cargando propiedad…',
  loadErrorTitle: 'No pudimos cargar la propiedad',
  retry: 'Reintentar',
  noPhotos: 'Sin fotos disponibles',
  bedrooms: 'Habitaciones',
  bathrooms: 'Baños',
  size: 'm²',
  terrace: 'Terraza',
  transparentCosts: 'Costes transparentes',
  monthlyRent: 'Renta mensual',
  deposit: 'Depósito',
  agencyFee: 'Comisión agencia',
  cleaningFee: 'Limpieza (corto plazo)',
  perNight: 'Por noche',
  services: 'Servicios',
  description: 'Descripción',
  nearby: 'Cerca de aquí',
  publishedBy: 'Publicado por',
  updated: 'Actualizado',
  call: 'Llamar',
  whatsapp: 'WhatsApp',
  share: 'Compartir anuncio',
  addFavorite: 'Guardar en favoritos',
  removeFavorite: 'Quitar de favoritos',
  unavailablePhone: 'Este anuncio no tiene teléfono disponible.',
  unavailableWhatsApp: 'Este anuncio no tiene WhatsApp disponible.',
  callError: 'No se pudo realizar la llamada.',
  whatsappError: 'No se pudo abrir WhatsApp.',
  loginRequiredTitle: 'Inicia sesión',
  loginRequiredMsg: 'Debes iniciar sesión para guardar favoritos.',
  login: 'Iniciar sesión',
  reportTitle: 'Reportar anuncio',
  reportMessage: '¿Deseas reportar este anuncio por contenido inapropiado o posible fraude?',
  reportConfirm: 'Reportar',
  reportCancel: 'Cancelar',
  reportSent: 'Gracias. Nuestro equipo revisará el anuncio.',
  reportError: 'No se pudo enviar el reporte. Inténtalo de nuevo.',
};

const normalizePhone = (phone: string | null | undefined) => String(phone ?? '').replace(/\D/g, '');

const buildWhatsAppUrl = (phone: string | null | undefined, message: string): string | null => {
  const clean = normalizePhone(phone);
  if (!clean) return null;
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
};

const getAgencyPayerLabel = (payer: string | null | undefined) => {
  if (payer === 'tenant') return 'paga inquilino';
  if (payer === 'landlord') return 'paga propietario';
  return 'compartida';
};

const getPriceLabel = (p: RentalProperty | null): string => {
  const price: RentalProperty['price'] = p?.price ?? { monthlyRent: null, currency: 'XAF', depositMonths: 1, agencyFee: null, agencyFeePayer: null, pricePerNight: null, minNights: 1, cleaningFee: null };
  const rentalType = p?.rentalType;
  const hasMonthly = price.monthlyRent != null;
  const hasNightly = price.pricePerNight != null;
  if (rentalType === 'both' && hasNightly && hasMonthly) {
    return `${formatXAF(price.pricePerNight)}/noche · ${formatXAF(price.monthlyRent)}/mes`;
  }
  if ((rentalType === 'short_term' || rentalType === 'both') && hasNightly) {
    return `${formatXAF(price.pricePerNight)} / noche`;
  }
  if (hasMonthly) return `${formatXAF(price.monthlyRent)} / mes`;
  return 'Precio por confirmar';
};

const getLocationLabel = (p: RentalProperty | null): string =>
  [p?.location?.neighborhood, p?.location?.cityName].filter(Boolean).join(', ');

const buildShareMessage = (p: RentalProperty | null, priceLabel: string): string =>
  [
    `Mira este anuncio: ${p?.title ?? 'Propiedad en alquiler'}`.trim(),
    priceLabel,
    getLocationLabel(p),
    p?.id ? `${APP_PROPERTY_BASE_URL}/${p.id}` : 'Disponible en la app EG Route Plan',
  ].filter(Boolean).join('\n');

const buildWhatsAppMessage = (p: RentalProperty | null, priceLabel: string): string =>
  [
    `Hola, estoy interesado en "${p?.title ?? 'tu anuncio'}".`,
    getLocationLabel(p) ? `Ubicación: ${getLocationLabel(p)}` : null,
    `Precio: ${priceLabel}`,
    p?.id ? `Ver anuncio: ${APP_PROPERTY_BASE_URL}/${p.id}` : null,
  ].filter(Boolean).join('\n');

function GalleryDots({ total, activeIndex }: { total: number; activeIndex: number }) {
  if (total <= 1) return null;
  const { colors } = useTheme();
  const st = styles(colors);
  return (
    <View style={st.dotsContainer} accessibilityElementsHidden>
      {Array.from({ length: total }).map((_, i) => (
        <View key={`dot-${i}`} style={[st.dot, { backgroundColor: activeIndex === i ? brand.white : 'rgba(255,255,255,0.5)' }, activeIndex === i && { width: 18 }]} />
      ))}
    </View>
  );
}

function FeatureItem({ value, label }: { value: string | number; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles(colors).featureItem}>
      <Text style={{ fontSize: 18, fontWeight: peso.fuerte, color: colors.textPrimary }}>{value}</Text>
      <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2 }}>{label}</Text>
    </View>
  );
}

function CostRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  const st = styles(colors);
  return (
    <View style={[st.costRow, { borderBottomColor: colors.border }]}>
      <Text style={[st.costLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={{ fontSize: tipografia.body, fontWeight: peso.medio, color: colors.textPrimary }}>{value}</Text>
    </View>
  );
}

function POIRow({ poi }: { poi: { name: string; distanceKm: number } }) {
  const { colors } = useTheme();
  const st = styles(colors);
  const distance = formatDistanceKm(poi.distanceKm);
  return (
    <View style={[st.poiRow, { borderBottomColor: colors.border }]}>
      <Text style={[st.poiName, { color: colors.textPrimary }]}>{poi.name}</Text>
      <Text style={{ fontSize: tipografia.body, color: colors.textSecondary }}>{distance}</Text>
    </View>
  );
}

const isUnauthorized = (e: unknown) =>
  e instanceof ApiError && (/401|unauthor|login|session/i.test(String(e.code)) || /inicia sesión/i.test(e.message));

export default function AlquilerDetalleScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const idRef = useRef(id);
  idRef.current = id;

  const [prop, setProp] = useState<RentalProperty | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);
  const [activePhoto, setActivePhoto] = useState(0);
  const [galleryWidth, setGalleryWidth] = useState(windowWidth);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const p = await rentalApi.property(id);
      if (idRef.current !== id) return;
      setProp(p);
      setIsFavorite(!!p.isFavorite);
      setActivePhoto(0);
    } catch (e) {
      if (idRef.current === id) setError(e instanceof Error ? e.message : 'No se pudo cargar la propiedad');
    } finally {
      if (idRef.current === id) setLoading(false);
    }
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  const safeData: {
    photos: Array<{ url: string; thumbnailUrl?: string }>;
    location: RentalProperty['location'];
    price: RentalProperty['price'];
    landlord: RentalProperty['landlord'];
    amenities: RentalProperty['amenities'];
    essentialServices: RentalProperty['essentialServices'];
    nearbyPOIs: Array<{ name: string; distanceKm: number }>;
  } = useMemo(() => ({
    photos: Array.isArray(prop?.photos) ? prop.photos : [],
    location: prop?.location ?? { cityId: '', cityName: '', neighborhood: '', address: '', coordinates: { latitude: null, longitude: null } },
    price: prop?.price ?? { monthlyRent: null, currency: 'XAF', depositMonths: 1, agencyFee: null, agencyFeePayer: null, pricePerNight: null, minNights: 1, cleaningFee: null },
    landlord: prop?.landlord ?? { id: '', name: '', phone: '', whatsapp: '', photo: null, rating: 0, reviewsCount: 0, responseTimeHours: 0, verificationLevel: 1, subscription: 'free', isAgency: false, agencyName: null, joinedAt: '' },
    amenities: prop?.amenities ?? {},
    essentialServices: prop?.essentialServices ?? {},
    nearbyPOIs: Array.isArray(prop?.nearbyPOIs) ? prop.nearbyPOIs : [],
  }), [prop]);

  const priceLabel = useMemo(() => getPriceLabel(prop), [prop]);
  const heroHeight = 280 + insets.top;

  const onGalleryLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setGalleryWidth(w);
  }, []);

  const handleGalleryScroll = useCallback((e: any) => {
    const total = safeData.photos.length;
    if (!total) return;
    const w = galleryWidth;
    if (w <= 0) return;
    const raw = Math.round(e.nativeEvent.contentOffset.x / w);
    setActivePhoto(Math.max(0, Math.min(raw, total - 1)));
  }, [safeData.photos.length, galleryWidth]);

  const handleShare = useCallback(async () => {
    try {
      await Share.share({
        title: prop?.title ?? 'Anuncio EG Route Plan',
        message: buildShareMessage(prop, priceLabel),
        url: prop?.id ? `${APP_PROPERTY_BASE_URL}/${prop.id}` : undefined,
      });
    } catch {
      Alert.alert('Compartir', 'No se pudo abrir el menú de compartir.');
    }
  }, [prop, priceLabel]);

  const handleFavorite = useCallback(async () => {
    if (!prop || busyRef.current) return;
    busyRef.current = true;
    const prev = isFavorite;
    setIsFavorite(!prev);
    try {
      const r = await rentalApi.favorite(prop.id);
      setIsFavorite(r.favorited);
    } catch (e) {
      setIsFavorite(prev);
      if (isUnauthorized(e)) {
        Alert.alert(TEXTS.loginRequiredTitle, TEXTS.loginRequiredMsg, [
          { text: TEXTS.reportCancel, style: 'cancel' },
          { text: TEXTS.login, onPress: () => router.push('/auth' as never) },
        ]);
      } else {
        Alert.alert('Favoritos', 'No se pudo actualizar favoritos. Inténtalo de nuevo.');
      }
    } finally {
      busyRef.current = false;
    }
  }, [prop, isFavorite, router]);

  /** Cuenta el contactClicks (requiere sesión) y abre tel/WhatsApp. */
  const handleContact = useCallback(async (kind: 'call' | 'whatsapp') => {
    if (!prop || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await rentalApi.contact(prop.id);
    } catch (e) {
      setBusy(false);
      busyRef.current = false;
      if (isUnauthorized(e)) {
        Alert.alert(TEXTS.loginRequiredTitle, TEXTS.loginRequiredMsg, [
          { text: TEXTS.reportCancel, style: 'cancel' },
          { text: TEXTS.login, onPress: () => router.push('/auth' as never) },
        ]);
        return;
      }
      const msg = e instanceof Error ? e.message : 'Inicia sesión para contactar';
      Alert.alert(kind === 'call' ? TEXTS.call : TEXTS.whatsapp, msg);
      return;
    }
    setBusy(false);
    busyRef.current = false;
    const phone = kind === 'whatsapp' ? (safeData.landlord?.whatsapp || safeData.landlord?.phone) : safeData.landlord?.phone;
    if (!phone) {
      Alert.alert(kind === 'call' ? TEXTS.call : TEXTS.whatsapp, kind === 'call' ? TEXTS.unavailablePhone : TEXTS.unavailableWhatsApp);
      return;
    }
    if (kind === 'call') {
      Linking.openURL(`tel:${phone}`).catch(() => Alert.alert(TEXTS.call, TEXTS.callError));
      return;
    }
    const url = buildWhatsAppUrl(phone, buildWhatsAppMessage(prop, priceLabel));
    if (!url) { Alert.alert(TEXTS.whatsapp, TEXTS.unavailableWhatsApp); return; }
    Linking.openURL(url).catch(() => Alert.alert(TEXTS.whatsapp, TEXTS.whatsappError));
  }, [prop, busyRef, safeData.landlord, priceLabel, router]);

  const handleReport = useCallback(() => {
    if (!prop) return;
    Alert.alert(TEXTS.reportTitle, TEXTS.reportMessage, [
      { text: TEXTS.reportCancel, style: 'cancel' },
      {
        text: TEXTS.reportConfirm, style: 'destructive',
        onPress: async () => {
          if (busyRef.current) return;
          busyRef.current = true;
          try {
            const r = await rentalApi.report(prop.id, 'Fraude');
            Alert.alert('Reporte enviado', r.message || TEXTS.reportSent);
          } catch {
            Alert.alert('Error', TEXTS.reportError);
          } finally {
            busyRef.current = false;
          }
        },
      },
    ]);
  }, [prop]);

  const s = styles(colors);

  // ---------- Carga ----------
  if (!prop && loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: espaciado.e12, color: colors.textSecondary, fontWeight: peso.fuerte }}>{TEXTS.loading}</Text>
      </View>
    );
  }
  // ---------- Error ----------
  if (!prop) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: espaciado.e24 }}>
        <View style={[s.errIcon, { backgroundColor: alpha(colors.danger, 0.1) }]}><Flag size={26} color={colors.danger} /></View>
        <Text style={{ color: colors.textPrimary, fontWeight: peso.fuerte, fontSize: tipografia.subtitle, textAlign: 'center' }}>{TEXTS.loadErrorTitle}</Text>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', marginTop: espaciado.e6, marginBottom: espaciado.e16 }}>{error}</Text>
        <View style={{ flexDirection: 'row', gap: espaciado.e10 }}>
          <GhostButton title="Volver" onPress={() => router.back()} />
          <Pressable
            onPress={() => void load()}
            accessibilityRole="button" accessibilityLabel={TEXTS.retry}
            style={({ pressed }) => [{ paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e10, borderRadius: 10, backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>{TEXTS.retry}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const isLand = isLandType(prop.type);
  const isShortTerm = prop.rentalType === 'short_term' || prop.rentalType === 'both';
  const locationLabel = getLocationLabel(prop);
  const rentalSuffix = prop.rentalType === 'both' ? ' · Largo y corto plazo' : prop.rentalType === 'short_term' ? ' · Solo por noches' : ' · Largo plazo';
  const sizeValue = isLand ? prop.landSize ?? prop.size : prop.size;
  const showRooms = !isLand && prop.rooms != null;
  const showBathrooms = !isLand && prop.bathrooms != null;
  const showSize = sizeValue != null;
  const showTerrace = Boolean(safeData.amenities.terrace);
  const hasFeatures = showRooms || showBathrooms || showSize || showTerrace;
  const availableServices = Object.entries(safeData.essentialServices).filter(([, v]) => Boolean(v));
  const hasCosts = safeData.price.monthlyRent != null || safeData.price.depositMonths != null || safeData.price.agencyFee != null || (isShortTerm && safeData.price.cleaningFee != null);
  const { latitude, longitude } = prop.location.coordinates;
  const hasPhone = Boolean(safeData.landlord?.phone || safeData.landlord?.whatsapp);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Galería */}
        <View style={{ height: heroHeight, position: 'relative' }} onLayout={onGalleryLayout}>
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={handleGalleryScroll} accessibilityLabel="Galería de fotos">
            {safeData.photos.length === 0 ? (
              <View style={{ width: galleryWidth, height: heroHeight, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 40 }}>{getPropertyTypeEmoji(prop.type)}</Text>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e6 }}>{TEXTS.noPhotos}</Text>
              </View>
            ) : safeData.photos.map((ph, i) => (
              <LazyImage
                key={`${ph.url}-${i}`}
                source={{ uri: ph.url }}
                thumbnailSource={ph.thumbnailUrl ? { uri: ph.thumbnailUrl } : undefined}
                style={{ width: galleryWidth, height: heroHeight }}
              />
            ))}
          </ScrollView>

          <GalleryDots total={safeData.photos.length} activeIndex={activePhoto} />

          {/* Badges */}
          <View style={{ position: 'absolute', top: insets.top + 8, left: 56, flexDirection: 'row', gap: espaciado.e6 }}>
            {prop.isFeatured && <FeaturedBadge />}
            {prop.isPremium && <PremiumBadge />}
            {prop.isSocialHousing && <View style={{ backgroundColor: brand.success, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e4, borderRadius: 6 }}><Text style={{ color: brand.white, fontSize: tipografia.micro, fontWeight: peso.fuerte }}>Vivienda social</Text></View>}
          </View>

          {/* Acciones: atrás + favorito + compartir */}
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button" accessibilityLabel="Volver"
            style={[s.iconButton, { position: 'absolute', top: insets.top + 8, left: 12 }]}
          >
            <ArrowLeft size={18} color={brand.white} />
          </Pressable>
          <View style={{ position: 'absolute', top: insets.top + 8, right: 12, flexDirection: 'row', gap: espaciado.e8 }}>
            <Pressable
              onPress={() => void handleFavorite()}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel={isFavorite ? TEXTS.removeFavorite : TEXTS.addFavorite}
              accessibilityState={{ selected: isFavorite }}
              style={({ pressed }) => [s.iconButton, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Heart size={18} color={isFavorite ? brand.danger : brand.white} fill={isFavorite ? brand.danger : 'transparent'} />
            </Pressable>
            <Pressable
              onPress={() => void handleShare()}
              hitSlop={10}
              accessibilityRole="button" accessibilityLabel={TEXTS.share}
              style={({ pressed }) => [s.iconButton, { opacity: pressed ? 0.8 : 1 }]}
            >
              <Share2 size={16} color={brand.white} />
            </Pressable>
          </View>
        </View>

        {/* Contenido */}
        <View style={[s.content, { paddingBottom: 120 + insets.bottom }]}>
          {/* Precio + verificación */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: espaciado.e8, gap: espaciado.e8 }}>
            <Text style={[s.price, { color: colors.textPrimary }]} numberOfLines={2} adjustsFontSizeToFit>{priceLabel}</Text>
            <VerificationBadge level={prop.verificationLevel} />
          </View>

          <Text style={[s.title, { color: colors.textPrimary }]}>{prop.title}</Text>

          {locationLabel ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e4, marginBottom: espaciado.e4 }}>
              <MapPin size={13} color={colors.textSecondary} />
              <Text style={{ fontSize: tipografia.body, color: colors.textSecondary, flex: 1 }}>{locationLabel}{prop.location?.address ? ` · ${prop.location.address}` : ''}</Text>
            </View>
          ) : null}

          <Text style={[s.typeLabel, { color: colors.textSecondary }]}>{getPropertyTypeLabel(prop.type)}{rentalSuffix}</Text>

          {/* Características principales */}
          {hasFeatures && (
            <View style={[s.featuresGrid, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              {showRooms && <FeatureItem value={prop.rooms!} label={TEXTS.bedrooms} />}
              {showBathrooms && <FeatureItem value={prop.bathrooms!} label={TEXTS.bathrooms} />}
              {showSize && <FeatureItem value={sizeValue!} label={TEXTS.size} />}
              {showTerrace && <FeatureItem value="☀️" label={TEXTS.terrace} />}
            </View>
          )}

          {/* Costes transparentes */}
          {hasCosts && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{TEXTS.transparentCosts}</Text>
              {safeData.price.monthlyRent != null && <CostRow label={TEXTS.monthlyRent} value={formatXAF(safeData.price.monthlyRent)} />}
              {safeData.price.depositMonths != null && <CostRow label={TEXTS.deposit} value={`${safeData.price.depositMonths} ${safeData.price.depositMonths === 1 ? 'mes' : 'meses'}`} />}
              {safeData.price.agencyFee != null && <CostRow label={`${TEXTS.agencyFee} (${getAgencyPayerLabel(safeData.price.agencyFeePayer)})`} value={formatXAF(safeData.price.agencyFee)} />}
              {isShortTerm && safeData.price.cleaningFee != null && <CostRow label={TEXTS.cleaningFee} value={formatXAF(safeData.price.cleaningFee)} />}
              {isShortTerm && safeData.price.pricePerNight != null && <CostRow label={`${TEXTS.perNight} (mín. ${safeData.price.minNights ?? 1})`} value={formatXAF(safeData.price.pricePerNight)} />}
            </View>
          )}

          {/* Calculadora de coste mensual */}
          <PriceCalculator property={prop} />

          {/* Servicios */}
          {availableServices.length > 0 && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{TEXTS.services}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 }}>
                {availableServices.map(([k]) => (
                  <View key={k} style={{ backgroundColor: colors.surface, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e6, borderRadius: 20, borderWidth: trazo.fino, borderColor: colors.border }}>
                    <Text style={{ fontSize: tipografia.body, color: colors.textPrimary }}>{SERVICE_LABELS[k] ?? k}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Descripción */}
          {prop.description ? (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{TEXTS.description}</Text>
              <Text style={{ fontSize: tipografia.body, color: colors.textSecondary, lineHeight: 22 }}>{prop.description}</Text>
            </View>
          ) : null}

          {/* Mapa (MapBackground: carga/error/Reintentar + EgCamera centrado) */}
          {latitude && longitude ? (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Ubicación</Text>
              <View style={{ height: 160, borderRadius: 14, overflow: 'hidden' }}>
                <MapBackground>
                  <EgCamera centerCoordinate={[longitude, latitude]} zoomLevel={13} animationMode="moveTo" />
                  <EgMarkers markers={[{ id: 'prop', coordinate: [longitude, latitude] as [number, number], kind: 'origin' as const, label: prop.location.neighborhood }]} />
                </MapBackground>
              </View>
            </View>
          ) : null}

          {/* POIs cercanos */}
          {safeData.nearbyPOIs.length > 0 && (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{TEXTS.nearby}</Text>
              {safeData.nearbyPOIs.map((poi, i) => <POIRow key={poi.name ?? i} poi={poi} />)}
            </View>
          )}

          {/* Propietario */}
          {safeData.landlord?.name ? (
            <View style={s.section}>
              <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{TEXTS.publishedBy}</Text>
              <LandlordCard
                landlord={safeData.landlord}
                variant="detail"
                showViewProfile={true}
                showContactActions={false}
                onViewProfile={(l) => router.push({ pathname: '/landlord-profile', params: { landlordId: l.id ?? '' } } as never)}
              />
            </View>
          ) : null}

          {/* Aviso anti-estafa */}
          <View style={{ marginBottom: espaciado.e14, flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, backgroundColor: alpha(colors.danger, 0.07), padding: espaciado.e12, borderRadius: 10 }}>
            <ShieldAlert size={16} color={colors.danger} />
            <Text style={{ flex: 1, fontSize: tipografia.caption, color: colors.danger, fontWeight: peso.medio, lineHeight: 16 }}>
              No pagues por adelantado ni envíes documentación antes de visitar el inmueble. Si algo parece sospechoso, repórtalo.
            </Text>
          </View>

          {/* Actualización */}
          {prop.lastUpdated ? (
            <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, textAlign: 'center', marginTop: espaciado.e8 }}>{TEXTS.updated} {getTimeAgo(prop.lastUpdated)}</Text>
          ) : null}

          {/* Reportar */}
          <Pressable
            onPress={handleReport}
            accessibilityRole="button"
            accessibilityLabel={TEXTS.reportTitle}
            style={({ pressed }) => [{ alignSelf: 'center', marginTop: espaciado.e12, paddingVertical: espaciado.e8, paddingHorizontal: espaciado.e12, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: espaciado.e5, opacity: pressed ? 0.7 : 1 }]}
          >
            <Flag size={13} color={colors.textSecondary} />
            <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, fontWeight: peso.medio }}>{TEXTS.reportTitle}</Text>
          </Pressable>
        </View>
      </ScrollView>

      {/* Barra inferior fija: Llamar (1) + WhatsApp (2), safe-area */}
      <View style={[s.bottomBar, { backgroundColor: colors.card, borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 12) }]}>
        <Pressable
          onPress={() => void handleContact('call')}
          disabled={busy || !hasPhone}
          accessibilityRole="button" accessibilityLabel={TEXTS.call}
          style={({ pressed }) => [{ flex: 1, borderRadius: radios.md, paddingVertical: espaciado.e14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: espaciado.e6, backgroundColor: colors.surface, opacity: busy || !hasPhone ? 0.5 : pressed ? 0.85 : 1 }]}
        >
          <Phone size={15} color={colors.textPrimary} />
          <Text style={{ fontSize: 15, fontWeight: peso.fuerte, color: colors.textPrimary }}>{TEXTS.call}</Text>
        </Pressable>
        <Pressable
          onPress={() => void handleContact('whatsapp')}
          disabled={busy || !hasPhone}
          accessibilityRole="button" accessibilityLabel={TEXTS.whatsapp}
          style={({ pressed }) => [{ flex: 2, backgroundColor: brand.whatsapp, borderRadius: radios.md, paddingVertical: espaciado.e14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: espaciado.e6, opacity: busy || !hasPhone ? 0.6 : pressed ? 0.85 : 1 }]}
        >
          {busy ? <ActivityIndicator size="small" color={brand.white} /> : <MessageSquare size={15} color={brand.white} />}
          <Text style={{ fontSize: 15, fontWeight: peso.fuerte, color: brand.white }}>{busy ? '…' : TEXTS.whatsapp}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  content: { padding: espaciado.e16 },
  price: { flexShrink: 1, fontSize: 24, fontWeight: peso.maximo },
  title: { fontSize: tipografia.title, fontWeight: peso.fuerte, marginBottom: espaciado.e6 },
  typeLabel: { fontSize: tipografia.body, marginBottom: espaciado.e16 },
  featuresGrid: { flexDirection: 'row', borderRadius: radios.md, padding: espaciado.e14, marginBottom: espaciado.e20, gap: espaciado.e8, borderWidth: trazo.fino },
  featureItem: { flex: 1, alignItems: 'center' },
  section: { marginBottom: espaciado.e22 },
  sectionTitle: { fontSize: tipografia.subtitle, fontWeight: peso.fuerte, marginBottom: espaciado.e10 },
  costRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: espaciado.e8, borderBottomWidth: trazo.fino, gap: espaciado.e12 },
  costLabel: { fontSize: tipografia.body, flex: 1 },
  poiRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: espaciado.e8, borderBottomWidth: trazo.fino, gap: espaciado.e12 },
  poiName: { fontSize: tipografia.body, flex: 1 },
  dotsContainer: { position: 'absolute', bottom: 12, alignSelf: 'center', flexDirection: 'row', gap: espaciado.e6 },
  dot: { width: 7, height: 7, borderRadius: radios.full },
  iconButton: { width: 36, height: 36, borderRadius: radios.full, backgroundColor: 'rgba(16,24,40,0.45)', justifyContent: 'center', alignItems: 'center' },
  errIcon: { width: 60, height: 60, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center', marginBottom: espaciado.e14 },
  bottomBar: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', paddingHorizontal: espaciado.e12, paddingTop: espaciado.e10, borderTopWidth: trazo.fino, gap: espaciado.e10 },
});
