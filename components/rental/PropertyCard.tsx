/**
 * PropertyCard — tarjeta de propiedad (adaptación del kit PropertyCard.jsx).
 * Usa useTheme + LazyImage + badges propios. Muestra precio condicional,
 * tamaño condicional (landSize vs size) y características según tipo.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { alpha, brand, espaciado, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { LazyImage } from './LazyImage';
import { FeaturedBadge, PremiumBadge, VerificationBadge } from './Badges';
import { LandlordCard, type LandlordCardData } from './LandlordCard';
import { formatXAF, getTimeAgo, getPropertyTypeLabel, isLandType, isCommercialSpecial } from '../../utils/formatHelpers';
import type { RentalProperty } from '../../api/rental';

export function PropertyCard({ property, onPress, onViewLandlord }: {
  property: RentalProperty;
  onPress: () => void;
  onViewLandlord?: (landlord: LandlordCardData) => void;
}) {
  const { colors } = useTheme();
  const isLand = isLandType(property.type);
  const isCommercialSpecialType = isCommercialSpecial(property.type);

  const displayPrice = () => {
    if (property.rentalType === 'short_term' && property.price.pricePerNight) {
      return `${formatXAF(property.price.pricePerNight)}/noche`;
    }
    return `${formatXAF(property.price.monthlyRent)}/mes`;
  };

  const displaySize = () => {
    if (isLand && property.landSize) return `${property.landSize} m²`;
    return property.size ? `${property.size} m²` : null;
  };

  const s = styles(colors);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.card, { borderColor: colors.border }, pressed && { opacity: 0.85 }]}>
      {/* Imagen */}
      <View style={s.imageContainer}>
        <LazyImage
          source={{ uri: property.photos?.[0]?.url }}
          thumbnailSource={{ uri: property.photos?.[0]?.thumbnailUrl }}
          style={s.image}
        />
        <View style={s.badgesTop}>
          {property.isFeatured && <FeaturedBadge />}
          {property.isPremium && <PremiumBadge />}
          {property.isSocialHousing && <View style={s.socialBadge}><Text style={s.socialText}>Social</Text></View>}
        </View>
        {(isLand || isCommercialSpecialType) && (
          <View style={s.typeBadge}><Text style={s.typeText}>{getPropertyTypeLabel(property.type)}</Text></View>
        )}
        {property.rentalType === 'short_term' && (
          <View style={s.shortTermBadge}><Text style={s.shortTermText}>Por noche</Text></View>
        )}
      </View>

      {/* Contenido */}
      <View style={s.content}>
        <View style={s.priceRow}>
          <Text style={s.price}>{displayPrice()}</Text>
          <VerificationBadge level={property.verificationLevel} minLevel={2} />
        </View>
        <Text style={s.title} numberOfLines={2}>{property.title}</Text>
        <Text style={s.location} numberOfLines={1}>📍 {property.location.neighborhood}, {property.location.cityName}</Text>

        <View style={s.featuresRow}>
          {!isLand && property.rooms !== undefined && <Text style={s.feature}>🛏️ {property.rooms}</Text>}
          {!isLand && property.bathrooms !== undefined && <Text style={s.feature}>🚿 {property.bathrooms}</Text>}
          {displaySize() && <Text style={s.feature}>📐 {displaySize()}</Text>}
          {property.amenities.terrace && <Text style={s.feature}>☀️ Terraza</Text>}
          {property.type === 'land_agriculture' && <Text style={s.feature}>🌱 Agrícola</Text>}
          {property.type === 'land_workshop' && <Text style={s.feature}>🔧 Taller</Text>}
          {property.type === 'bar' && <Text style={s.feature}>🍻 Bar</Text>}
          {property.type === 'nightclub' && <Text style={s.feature}>🎵 Disco</Text>}
          {property.essentialServices.generator && <Text style={s.feature}>⚡</Text>}
        </View>

        <View style={[s.footer, { borderTopColor: colors.border }]}>
          <LandlordCard
            landlord={property.landlord}
            variant="compact"
            showViewProfile={true}
            onViewProfile={(l) => {
              if (onViewLandlord) onViewLandlord(l);
            }}
          />
          <Text style={s.freshness}>{getTimeAgo(property.lastUpdated)}</Text>
        </View>      </View>
    </Pressable>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, marginBottom: espaciado.e12, overflow: 'hidden', backgroundColor: c.card },
  imageContainer: { position: 'relative', height: 180 },
  image: { width: '100%', height: '100%' },
  badgesTop: { position: 'absolute', top: 8, left: 8, flexDirection: 'row', gap: espaciado.e4 },
  socialBadge: { backgroundColor: brand.success, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e4, borderRadius: 6 },
  socialText: { color: brand.white, fontSize: 10, fontWeight: peso.fuerte },
  typeBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: 'rgba(15,23,42,0.85)', paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e4, borderRadius: 6 },
  typeText: { color: brand.white, fontSize: tipografia.micro, fontWeight: peso.medio },
  shortTermBadge: { position: 'absolute', bottom: 8, left: 8, backgroundColor: 'rgba(0,0,0,0.75)', paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e4, borderRadius: 6 },
  shortTermText: { color: brand.white, fontSize: tipografia.micro, fontWeight: peso.medio },
  content: { padding: espaciado.e12 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: espaciado.e6 },
  price: { fontSize: 17, fontWeight: peso.fuerte, color: c.textPrimary },
  title: { fontSize: tipografia.body, fontWeight: peso.medio, color: c.textSecondary, marginBottom: espaciado.e4 },
  location: { fontSize: tipografia.caption, color: c.textSecondary, marginBottom: espaciado.e8 },
  featuresRow: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e10, marginBottom: espaciado.e8 },
  feature: { fontSize: tipografia.caption, color: c.textPrimary },
  footer: { paddingTop: espaciado.e10, borderTopWidth: 1, gap: espaciado.e6 },
  freshness: { fontSize: tipografia.micro, color: c.textSecondary, alignSelf: 'flex-end' },
});
