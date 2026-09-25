/**
 * Life Book — TIENDA de un vendedor (/lifebook-store?sellerId=…).
 * Cabecera del vendedor (avatar, bio, ciudad, ★, badge Ecomerse), botones
 * Seguir / Contactar / Ver en Ecomerse, y sus productos en venta (grid 2 col).
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWindowDimensions } from 'react-native';
import { alpha, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { ArrowLeft, BadgeCheck, MapPin, MessageCircle, Star, Store } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { absUrl } from '../api/config';
import { lifebookStoreApi, lifebookChatApi, toPostCard, type LbPostBase, type LbStorePage } from '../api/lifebook';
import { PostCard } from '../components/lifebook/PostCard';
import FloatingFooter, { DOCK_BODY_H } from '../components/FloatingFooter';
import { useAppDock } from '../core/useAppDock';
import { ir as irSeguro } from '../constants/rutas';
import { brand } from '@egrouteplan/ui-kit';

export default function StoreScreen() {
  return (
    <AuthGate>
      <StoreContent />
    </AuthGate>
  );
}

function StoreContent() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { sellerId } = useLocalSearchParams<{ sellerId?: string }>();
  const GAP = 12;
  const cellW = (width - GAP * 3) / 2;
  const [page, setPage] = useState<LbStorePage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyFollow, setBusyFollow] = useState(false);
  const dock = useAppDock();

  useEffect(() => {
    if (!sellerId) { setError('Falta el vendedor'); return; }
    lifebookStoreApi.page(sellerId).then(setPage).catch(() => setError('No se pudo cargar la tienda'));
  }, [sellerId]);

  const toggleFollow = async () => {
    if (!page || busyFollow || page.store.relation.isSelf) return;
    setBusyFollow(true);
    const was = page.store.relation.isFollowing;
    setPage({ ...page, store: { ...page.store, relation: { ...page.store.relation, isFollowing: !was } } });
    try {
      const { lifebookApi } = await import('../api/lifebook');
      await (was ? lifebookApi.unfollow(page.store.id) : lifebookApi.follow(page.store.id));
    } catch {
      setPage({ ...page, store: { ...page.store, relation: { ...page.store.relation, isFollowing: was } } });
    } finally { setBusyFollow(false); }
  };

  const contact = async () => {
    if (!page) return;
    try {
      const conv = await lifebookChatApi.open(page.store.id);
      irSeguro.libre('/lifebook-chat/[id]', { id: conv.id, name: page.store.fullName ?? 'Tienda' });
    } catch { /* sin chat */ }
  };

  if (error || !sellerId) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <View style={[styles.topBar, { borderBottomColor: colors.border, paddingTop: insets.top + 6 }]}>
          <Pressable onPress={() => router.back()} hitSlop={12}><ArrowLeft size={22} color={colors.textPrimary} /></Pressable>
          <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Tienda</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaciado.e24 }}>
          <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo }}>{error ?? 'Tienda'}</Text>
        </View>
      </View>
    );
  }
  if (!page) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.primary} /></View>;
  }

  const s = page.store;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.topBar, { borderBottomColor: colors.border, paddingTop: insets.top + 6 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={{ paddingVertical: espaciado.e4 }}><ArrowLeft size={22} color={colors.textPrimary} /></Pressable>
        <Text style={[styles.topTitle, { color: colors.textPrimary }]}>Tienda</Text>
        <View style={{ width: 22 }} />
      </View>

      <FlatList
        data={page.sales}
        keyExtractor={(p: LbPostBase) => p.id}
        numColumns={2}
        columnWrapperStyle={{ paddingHorizontal: GAP, gap: GAP }}
        contentContainerStyle={{ paddingTop: espaciado.e4, paddingBottom: DOCK_BODY_H + insets.bottom + 24, flexGrow: 1, gap: GAP }}
        ListHeaderComponent={
          <View style={{ padding: espaciado.e16, paddingBottom: espaciado.e6 }}>
            <View style={{ flexDirection: 'row', gap: espaciado.e12, alignItems: 'center' }}>
              {absUrl(s.avatarUrl) ? (
                <Image source={{ uri: absUrl(s.avatarUrl) }} style={[styles.logo, { backgroundColor: colors.surface }]} />
              ) : (
                <View style={[styles.logo, { backgroundColor: alpha(colors.secondary, 0.15), alignItems: 'center', justifyContent: 'center' }]}>
                  <Text style={{ color: colors.secondary, fontSize: tipografia.display, fontWeight: peso.titulo }}>{(s.fullName ?? '?').charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e5 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: tipografia.cabecera, fontWeight: peso.titulo, flexShrink: 1 }}>{s.fullName ?? 'Tienda'}</Text>
                  <BadgeCheck size={17} color={brand.primary} fill={brand.primary} stroke={brand.white} strokeWidth={2.5} />
                </View>
                {s.city ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e3, marginTop: espaciado.e2 }}>
                    <MapPin size={11} color={colors.textSecondary} />
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{s.city}{s.country ? ` · ${s.country}` : ''}</Text>
                  </View>
                ) : null}
                {s.ratingAvg != null && s.ratingAvg > 0 && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e3, marginTop: espaciado.e2 }}>
                    <Star size={12} color={brand.warning} fill={brand.warning} />
                    <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.caption }}>{s.ratingAvg.toFixed(1)}</Text>
                  </View>
                )}
              </View>
            </View>

            {s.bio ? <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, marginTop: espaciado.e10, lineHeight: 19 }}>{s.bio}</Text> : null}

            {s.ecomerse && (
              <View style={[styles.ecomerseChip, { backgroundColor: alpha(colors.secondary, 0.12) }]}>
                <Store size={13} color={colors.secondary} />
                <Text style={{ color: colors.secondary, fontSize: tipografia.caption, fontWeight: peso.titulo }}>Tienda Ecomerse verificada · productos en el Mercado</Text>
              </View>
            )}

            <View style={{ flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e12 }}>
              {!s.relation.isSelf && (
                <Pressable onPress={toggleFollow} style={[styles.btn, { flex: 1, backgroundColor: s.relation.isFollowing ? colors.surface : colors.primary, borderColor: s.relation.isFollowing ? colors.border : colors.primary, borderWidth: trazo.fino }]}>
                  {busyFollow ? <ActivityIndicator size="small" color={s.relation.isFollowing ? colors.textPrimary : brand.white} /> : (
                    <Text style={{ color: s.relation.isFollowing ? colors.textPrimary : brand.white, fontWeight: peso.titulo, fontSize: tipografia.body }}>
                      {s.relation.isFollowing ? 'Siguiendo ✓' : '+ Seguir'}
                    </Text>
                  )}
                </Pressable>
              )}
              <Pressable onPress={contact} style={[styles.btn, { flex: 1, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: trazo.fino }]}>
                <MessageCircle size={15} color={colors.textPrimary} />
                <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.body }}>Contactar</Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: espaciado.e18 }}>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.cuerpo, fontWeight: peso.titulo }}>Productos</Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>{page.sales.length} en venta</Text>
            </View>
          </View>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: espaciado.e30, gap: espaciado.e4 }}>
            <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo }}>Esta tienda aún no tiene productos activos.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <PostCard post={toPostCard(item)} width={cellW} onPress={(id) => irSeguro.libre('/lifebook-post/[id]', { id })} />
        )}
      />

      <FloatingFooter onNavigate={dock} showUnreadBadge />
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingHorizontal: espaciado.e12, paddingBottom: espaciado.e8, borderBottomWidth: StyleSheet.hairlineWidth },
  topTitle: { fontSize: tipografia.cifra, fontWeight: peso.titulo, flex: 1 },
  logo: { width: 68, height: 68, borderRadius: radios.lg },
  ecomerseChip: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, borderRadius: radios.full, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7, marginTop: espaciado.e12, alignSelf: 'flex-start' },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e6, borderRadius: radios.full, paddingVertical: espaciado.e11 },
});

