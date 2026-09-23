/**
 * LandlordCard — tarjeta del arrendador (kit rental), variantes detail | compact.
 * Avatar (foto o iniciales), verificación, rating, stats (respuesta/anuncios/
 * miembro desde), bio, acciones (ver perfil / llamar / WhatsApp) y nota de
 * confianza. Adaptada: useTheme, getInitials/formatDate, isAgency (no type).
 */

import React from 'react';
import { Alert, Image, Linking, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme, alpha, tipografia, radios } from '@egrouteplan/ui-kit';
import { VerificationBadge } from './Badges';
import { getInitials } from '../../utils/formatHelpers';
import type { RentalProperty } from '../../api/rental';
import { brand } from '@egrouteplan/ui-kit';

export interface LandlordCardData {
  id?: string | null;
  name?: string | null;
  photo?: string | null;
  avatarUrl?: string | null;
  photoUrl?: string | null;
  isAgency?: boolean;
  type?: string;
  rating?: number | null;
  reviewsCount?: number | null;
  reviews?: number | null;
  responseTimeHours?: number | null;
  listingsCount?: number | null;
  activeListingsCount?: number | null;
  propertiesCount?: number | null;
  memberSince?: string | null;
  joinedAt?: string | null;
  verificationLevel?: number;
  phone?: string | null;
  whatsapp?: string | null;
  bio?: string | null;
  description?: string | null;
  agencyName?: string | null;
}

const DEFAULT_TEXTS = {
  defaultName: 'Anunciante',
  landlord: 'Propietario',
  agency: 'Agencia',
  view: 'Ver',
  viewProfile: 'Ver perfil',
  call: 'Llamar',
  whatsapp: 'WhatsApp',
  response: 'Respuesta',
  listings: 'Anuncios',
  memberSince: 'Miembro',
  responds: 'Responde',
  unavailablePhone: 'Este anunciante no tiene teléfono disponible.',
  unavailableWhatsApp: 'Este anunciante no tiene WhatsApp disponible.',
  callError: 'No se pudo realizar la llamada.',
  whatsappError: 'No se pudo abrir WhatsApp.',
  trustNote: 'Consejo de seguridad: verifica la propiedad y evita pagos fuera de la plataforma.',
};

const normalizePhone = (phone: string | null | undefined): string => String(phone ?? '').replace(/\D/g, '');

const buildWhatsAppUrl = (phone: string | null | undefined, message: string): string | null => {
  const clean = normalizePhone(phone);
  if (!clean) return null;
  return `https://wa.me/${clean}?text=${encodeURIComponent(message)}`;
};

const getMemberSinceLabel = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const currentYear = new Date().getFullYear();
  const year = date.getFullYear();
  return currentYear === year ? 'Este año' : `Desde ${year}`;
};

const getResponseValue = (hours: number | null | undefined): string => {
  if (hours == null) return '—';
  const value = Number(hours);
  if (!Number.isFinite(value)) return '—';
  if (value <= 0.5) return 'Min';
  if (value < 1) return '< 1 h';
  return `~${Math.round(value)} h`;
};

const Stat = ({ value, label }: { value: string; label: string }) => {
  const { colors } = useTheme();
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color: colors.textPrimary }]}>{value ?? '—'}</Text>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
    </View>
  );
};

export function LandlordCard({
  landlord,
  property,
  variant = 'detail',
  showViewProfile = true,
  showContactActions = false,
  onViewProfile,
  onCall,
  onWhatsApp,
  texts = {},
  style,
}: {
  landlord: LandlordCardData | null;
  property?: RentalProperty | null;
  variant?: 'detail' | 'compact';
  showViewProfile?: boolean;
  showContactActions?: boolean;
  onViewProfile?: (landlord: LandlordCardData) => void;
  onCall?: (landlord: LandlordCardData) => void;
  onWhatsApp?: (landlord: LandlordCardData) => void;
  texts?: Partial<typeof DEFAULT_TEXTS>;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  if (!landlord) return null;

  const t = { ...DEFAULT_TEXTS, ...texts };
  const name = landlord.name || t.defaultName;
  const subtitle = landlord.isAgency || landlord.type === 'agency' ? (landlord.agencyName ?? t.agency) : t.landlord;
  const initials = getInitials(name);
  const avatarUri = landlord.avatarUrl || landlord.photoUrl || landlord.photo || null;

  const rating = typeof landlord.rating === 'number' ? landlord.rating.toFixed(1) : null;
  const reviewsCount = landlord.reviewsCount ?? landlord.reviews ?? null;
  const listingsCount = landlord.listingsCount ?? landlord.activeListingsCount ?? landlord.propertiesCount ?? null;
  const memberSince = getMemberSinceLabel(landlord.memberSince ?? landlord.joinedAt);
  const responseValue = getResponseValue(landlord.responseTimeHours);

  const canViewProfile = Boolean(onViewProfile);
  const canCall = Boolean(onCall || landlord.phone);
  const canWhatsApp = Boolean(onWhatsApp || landlord.whatsapp || landlord.phone);

  const handleViewProfile = () => onViewProfile?.(landlord);

  const handleCall = () => {
    if (onCall) { onCall(landlord); return; }
    const phone = landlord.phone;
    if (!phone) { Alert.alert(t.call, t.unavailablePhone); return; }
    Linking.openURL(`tel:${String(phone).trim()}`).catch(() => Alert.alert(t.call, t.callError));
  };

  const handleWhatsApp = () => {
    if (onWhatsApp) { onWhatsApp(landlord); return; }
    const phone = landlord.whatsapp || landlord.phone;
    if (!phone) { Alert.alert(t.whatsapp, t.unavailableWhatsApp); return; }
    const message = `Hola, estoy interesado en "${property?.title || 'tu anuncio'}".`;
    const url = buildWhatsAppUrl(phone, message);
    if (!url) { Alert.alert(t.whatsapp, t.unavailableWhatsApp); return; }
    Linking.openURL(url).catch(() => Alert.alert(t.whatsapp, t.whatsappError));
  };

  if (variant === 'compact') {
    return (
      <View style={[styles.compactContainer, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={[styles.compactAvatar, { backgroundColor: colors.surface }]} accessibilityLabel={`Foto de ${name}`} />
        ) : (
          <View style={[styles.compactAvatarInitials, { backgroundColor: colors.primary }]}>
            <Text style={styles.compactAvatarText}>{initials}</Text>
          </View>
        )}
        <View style={styles.compactInfo}>
          <Text style={[styles.compactName, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
          <View style={styles.compactMeta}>
            {rating ? <Text style={[styles.compactRating, { color: colors.textSecondary }]}>⭐ {rating}</Text> : null}
            <VerificationBadge level={landlord.verificationLevel ?? 1} size="small" minLevel={2} />
          </View>
        </View>
        {showViewProfile ? (
          <Pressable style={[styles.compactButton, { backgroundColor: colors.border }, !canViewProfile && styles.disabledButton]} onPress={handleViewProfile} disabled={!canViewProfile} accessibilityRole="button" accessibilityLabel={`Ver perfil de ${name}`}>
            <Text style={[styles.compactButtonText, { color: colors.textPrimary }]}>{t.view}</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }, style]}>
      {/* Header */}
      <View style={styles.header}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={[styles.avatar, { backgroundColor: colors.surface }]} accessibilityLabel={`Foto de ${name}`} />
        ) : (
          <View style={[styles.avatarInitials, { backgroundColor: colors.primary }]}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
        )}
        <View style={styles.headerInfo}>
          <Text style={[styles.name, { color: colors.textPrimary }]} numberOfLines={1}>{name}</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]} numberOfLines={1}>{subtitle}</Text>
          <View style={styles.badgeRow}>
            <VerificationBadge level={landlord.verificationLevel ?? 1} size="small" />
          </View>
        </View>
      </View>

      {/* Meta rápida */}
      {rating || landlord.responseTimeHours != null ? (
        <View style={styles.metaRow}>
          {rating ? <Text style={[styles.ratingText, { color: colors.textPrimary }]}>⭐ {rating}{reviewsCount ? ` (${reviewsCount})` : ''}</Text> : null}
          {landlord.responseTimeHours != null ? <Text style={[styles.responseText, { color: colors.textSecondary }]}>{t.responds}: {responseValue}</Text> : null}
        </View>
      ) : null}

      {/* Stats */}
      <View style={[styles.statsRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Stat value={responseValue} label={t.response} />
        <Stat value={listingsCount != null ? String(listingsCount) : '—'} label={t.listings} />
        <Stat value={memberSince ?? '—'} label={t.memberSince} />
      </View>

      {/* Bio opcional */}
      {landlord.bio || landlord.description ? (
        <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={3}>{landlord.bio || landlord.description}</Text>
      ) : null}

      {/* Acciones */}
      {showViewProfile || showContactActions ? (
        <View style={styles.actionsContainer}>
          {showViewProfile ? (
            <Pressable style={[styles.fullButton, styles.secondaryButton, { backgroundColor: colors.card, borderColor: colors.border }, !canViewProfile && styles.disabledButton]} onPress={handleViewProfile} disabled={!canViewProfile} accessibilityRole="button" accessibilityLabel={`Ver perfil de ${name}`}>
              <Text style={[styles.secondaryButtonText, { color: colors.textPrimary }]}>{t.viewProfile}</Text>
            </Pressable>
          ) : null}
          {showContactActions ? (
            <View style={styles.contactRow}>
              <Pressable style={[styles.contactButton, styles.callButton, { backgroundColor: colors.border }, !canCall && styles.disabledButton]} onPress={handleCall} disabled={!canCall} accessibilityRole="button" accessibilityLabel={`Llamar a ${name}`}>
                <Text style={[styles.callButtonText, { color: colors.textPrimary }]}>{t.call}</Text>
              </Pressable>
              <Pressable style={[styles.contactButton, styles.whatsappButton, !canWhatsApp && styles.disabledButton]} onPress={handleWhatsApp} disabled={!canWhatsApp} accessibilityRole="button" accessibilityLabel={`Enviar WhatsApp a ${name}`}>
                <Text style={styles.whatsappButtonText}>{t.whatsapp}</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Nota de confianza */}
      <Text style={[styles.trustNote, { color: colors.textSecondary }]}>{t.trustNote}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 14, padding: 16, borderWidth: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarInitials: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: brand.white, fontSize: tipografia.title, fontWeight: '700' },
  headerInfo: { flex: 1 },
  name: { fontSize: tipografia.subtitle, fontWeight: '700' },
  subtitle: { fontSize: tipografia.body, marginTop: 2 },
  badgeRow: { flexDirection: 'row', marginTop: 6, gap: 6 },
  metaRow: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  ratingText: { fontSize: tipografia.body, fontWeight: '600' },
  responseText: { fontSize: tipografia.body },
  statsRow: { flexDirection: 'row', borderRadius: radios.md, paddingVertical: 12, paddingHorizontal: 10, marginTop: 14, gap: 8, borderWidth: 1 },
  statItem: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 15, fontWeight: '700' },
  statLabel: { fontSize: tipografia.micro, marginTop: 3 },
  description: { marginTop: 14, fontSize: tipografia.body, lineHeight: 20 },
  actionsContainer: { marginTop: 16 },
  fullButton: { borderRadius: radios.md, paddingVertical: 13, alignItems: 'center', marginBottom: 8 },
  secondaryButton: { borderWidth: 1 },
  secondaryButtonText: { fontSize: tipografia.body, fontWeight: '700' },
  contactRow: { flexDirection: 'row', gap: 8 },
  contactButton: { flex: 1, borderRadius: radios.md, paddingVertical: 13, alignItems: 'center' },
  callButton: {},
  callButtonText: { fontSize: tipografia.body, fontWeight: '700' },
  whatsappButton: { backgroundColor: brand.whatsapp },
  whatsappButtonText: { fontSize: tipografia.body, fontWeight: '700', color: brand.white },
  disabledButton: { opacity: 0.5 },
  trustNote: { marginTop: 14, fontSize: tipografia.micro, lineHeight: 16 },
  compactContainer: { flexDirection: 'row', alignItems: 'center', borderRadius: radios.md, padding: 12, gap: 10, borderWidth: 1 },
  compactAvatar: { width: 40, height: 40, borderRadius: 20 },
  compactAvatarInitials: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  compactAvatarText: { color: brand.white, fontSize: tipografia.subtitle, fontWeight: '700' },
  compactInfo: { flex: 1 },
  compactName: { fontSize: tipografia.body, fontWeight: '700' },
  compactMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  compactRating: { fontSize: tipografia.caption, fontWeight: '600' },
  compactButton: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  compactButtonText: { fontSize: tipografia.caption, fontWeight: '700' },
});
