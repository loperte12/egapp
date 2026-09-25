/**
 * PromoCarousel — anuncios del Home (monetizables) servidos por el backend
 * (GET /api/ads/). Tarjeta deslizable con tintes por anuncio; al tocar registra
 * un clic y navega al servicio (ruta interna del anuncio). Se registra una
 * impresión por carga de la lista. Sin anuncios activos → no ocupa espacio.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Dimensions, FlatList, Pressable, StyleSheet, Text, View,
  type NativeScrollEvent, type NativeSyntheticEvent,
} from 'react-native';
import { useRouter } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { adsApi, type HomeAd } from '../api/ads';
import { alpha } from '../constants/colors';
import { useTheme } from '../theme/ThemeContext';
import { brand, espaciado, radios, tipografia, peso} from '@egrouteplan/ui-kit';

const { width: SCREEN_W } = Dimensions.get('window');
const H_PADDING = 20;
const CARD_W = SCREEN_W - H_PADDING * 2 - 14;
const GAP = 12;

export default function PromoCarousel() {
  const { colors } = useTheme();
  const router = useRouter();
  const [ads, setAds] = useState<HomeAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(0);
  const listRef = useRef<FlatList<HomeAd>>(null);
  const countedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    adsApi
      .list()
      .then((list) => {
        if (!alive) return;
        // Solo tarjetas de servicio en el carrusel; los banners grandes de la
        // portada (kind banner/image) se muestran arriba, no aquí.
        const arr = Array.isArray(list)
          ? list.filter((a) => a.kind !== 'banner' && a.kind !== 'image')
          : [];
        setAds(arr);
        if (arr.length > 0 && !countedRef.current) {
          countedRef.current = true;
          // Impresión aproximada: una por carga de la Home.
          arr.forEach((a) => adsApi.impression(a.id).catch(() => {}));
        }
      })
      .catch(() => {})
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const open = (ad: HomeAd) => {
    adsApi.click(ad.id).catch(() => {});
    if (ad.targetRoute) router.push(ad.targetRoute as never);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / (CARD_W + GAP));
    if (idx !== active) setActive(idx);
  };

  if (!loading && ads.length === 0) return null;

  return (
    <View style={styles.wrap}>
      {loading ? (
        <View style={{ height: 84, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} size="small" />
        </View>
      ) : (
        <>
          <FlatList
            ref={listRef}
            data={ads}
            keyExtractor={(a) => a.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            snapToInterval={CARD_W + GAP}
            decelerationRate="fast"
            disableIntervalMomentum
            onMomentumScrollEnd={onScroll}
            contentContainerStyle={{ paddingRight: H_PADDING }}
            ItemSeparatorComponent={() => <View style={{ width: GAP }} />}
            renderItem={({ item }) => {
              const color = /^#[0-9A-Fa-f]{6}$/.test(item.color ?? '') ? item.color : colors.primary;
              return (
                <Pressable
                  onPress={() => open(item)}
                  accessibilityRole="button"
                  accessibilityLabel={`Oferta: ${item.title}`}
                  style={({ pressed }) => [
                    styles.card,
                    {
                      width: CARD_W,
                      backgroundColor: alpha(color, 0.12),
                      borderColor: alpha(color, 0.35),
                      transform: [{ scale: pressed ? 0.98 : 1 }],
                    },
                  ]}
                >
                  <Text style={styles.emoji}>{item.emoji ?? '✨'}</Text>
                  <View style={styles.cardBody}>
                    <Text style={[styles.cardTitle, { color: colors.textPrimary }]} numberOfLines={1}>
                      {item.title}
                    </Text>
                    {item.subtitle ? (
                      <Text style={[styles.cardSubtitle, { color: colors.textSecondary }]} numberOfLines={1}>
                        {item.subtitle}
                      </Text>
                    ) : null}
                    <View style={[styles.ctaChip, { backgroundColor: color }]}>
                      <Text style={styles.ctaText}>Abrir</Text>
                      <ChevronRight size={13} color={brand.white} strokeWidth={2.6} />
                    </View>
                  </View>
                </Pressable>
              );
            }}
          />
          <View style={styles.dots}>
            {ads.map((a, i) => (
              <View
                key={a.id}
                style={[
                  styles.dot,
                  i === active
                    ? { backgroundColor: colors.primary, width: 18 }
                    : { backgroundColor: alpha(colors.primary, 0.3) },
                ]}
              />
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: espaciado.e20 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    borderWidth: 1,
    padding: espaciado.e14,
    minHeight: 92,
  },
  emoji: { fontSize: 34, marginRight: espaciado.e12 },
  cardBody: { flex: 1 },
  cardTitle: { fontSize: 14.5, fontWeight: peso.maximo },
  cardSubtitle: { fontSize: tipografia.caption, marginTop: espaciado.e2 },
  ctaChip: {
    marginTop: espaciado.e8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.e2,
    paddingHorizontal: espaciado.e10,
    paddingVertical: espaciado.e5,
    borderRadius: radios.full,
  },
  ctaText: { color: brand.white, fontSize: tipografia.micro, fontWeight: peso.maximo },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: espaciado.e5, marginTop: espaciado.e12 },
  dot: { height: 6, width: 6, borderRadius: 3 },
});
