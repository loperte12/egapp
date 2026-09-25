/**
 * app/lifebook-catalog.tsx — CATÁLOGO de tiendas y servicios (Parte 33).
 *
 * La puerta de entrada al comercio: filtros por tipo (productos, comida,
 * servicios, alojamiento, alquiler, trabajo), ciudad, orden y búsqueda; tarjetas
 * con precio, tienda, ciudad e insignias de confianza. Cada tarjeta abre la ficha.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { ArrowLeft, Heart, Package, Search, ShoppingCart, X } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { commerceApi, type LbProductCard } from '../api/commerce';
import { carritoApi } from '../api/lifebookCarrito';
import { LB_CITIES } from '../constants/lifebook';
import { LB_SERVICE_TYPES } from '../constants/commerce';
import { ir as irSeguro } from '../constants/rutas';
import { ProductoCard } from '../components/lifebook/ProductoCard';

const SORTS = [
  { id: 'recent', label: 'Novedades' },
  { id: 'price_asc', label: 'Precio ↑' },
  { id: 'price_desc', label: 'Precio ↓' },
  { id: 'rating', label: 'Mejor valorados' },
] as const;

export default function LifeBookCatalogScreen() {
  return (
    <AuthGate>
      <CatalogContent />
    </AuthGate>
  );
}

function CatalogContent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const [items, setItems] = useState<LbProductCard[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [serviceType, setServiceType] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [sort, setSort] = useState<string>('recent');
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const busy = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async (mode: 'initial' | 'more' = 'initial') => {
    if (busy.current) return;
    busy.current = true;
    if (mode === 'initial') setLoading(true); else setMore(true);
    try {
      const page = await commerceApi.catalog({
        serviceType: serviceType || undefined,
        city: city || undefined,
        sort: sort as never,
        q: debouncedQ || undefined,
        cursor: mode === 'more' ? cursor ?? undefined : undefined,
        limit: 20,
      });
      if (!mounted.current) return;
      setItems((prev) => (mode === 'more' ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
    } catch {
      if (mode === 'initial' && mounted.current) setItems([]);
    } finally {
      busy.current = false;
      if (mounted.current) { setLoading(false); setMore(false); }
    }
  }, [serviceType, city, sort, debouncedQ, cursor]);

  useEffect(() => {
    mounted.current = true;
    load('initial');
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceType, city, sort, debouncedQ]);

  const chips = useMemo(
    () => [{ id: '', label: 'Todo', icon: '✨' }, ...LB_SERVICE_TYPES.map((s) => ({ id: s.id as string, label: s.label, icon: s.icon }))],
    [],
  );

  /* El globito del carrito: cuántas cosas llevas (una sola lectura al abrir el catálogo). */
  const [carrito, setCarrito] = useState(0);
  useEffect(() => {
    let vivo = true;
    carritoApi.ver()
      .then((c) => { if (vivo) setCarrito(Number(c?.count ?? 0)); })
      .catch(() => { /* sin carrito, sin globito */ });
    return () => { vivo = false; };
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Cabecera */}
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: alpha(colors.border, 0.5) }]}>
        <Pressable onPress={() => router.back()} hitSlop={10} accessibilityLabel="Volver">
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: tipografia.subtitle, flex: 1, marginLeft: espaciado.e10 }}>
          Tiendas y servicios
        </Text>
        {/* MIS GUARDADOS, en la puerta del mercado: para volver a un producto no hace falta entrar en
            el perfil (encargo del dueño). Es la misma lista que el perfil llama «Colección». */}
        <Pressable
          onPress={() => router.push('/lifebook-guardados' as never)}
          hitSlop={8}
          accessibilityLabel="Mis guardados"
          style={{ marginRight: espaciado.e12 }}
        >
          <Heart size={20} color={colors.textPrimary} />
        </Pressable>
        {/* EL CARRITO, en la puerta del mercado. La especificación lo pone en la fila de accesos
            del tab 市集; aquí no hay tab 市集 (la barra de abajo no se toca), así que la puerta del
            mercado es este catálogo. Con el globito de cuántas cosas llevas. */}
        <Pressable
          onPress={() => irSeguro.libre('/lifebook-carrito')}
          hitSlop={8}
          accessibilityLabel={`Carrito${carrito ? `, ${carrito} producto${carrito === 1 ? '' : 's'}` : ''}`}
          style={{ marginRight: espaciado.e10 }}
        >
          <ShoppingCart size={20} color={colors.textPrimary} />
          {carrito > 0 ? (
            <View style={[styles.globito, { backgroundColor: colors.primary }]}>
              <Text style={{ color: brand.white, fontSize: 9, fontWeight: peso.titulo }}>{carrito > 99 ? '99+' : carrito}</Text>
            </View>
          ) : null}
        </Pressable>
        <Pressable
          onPress={() => irSeguro.libre('/lifebook-sell')}
          accessibilityLabel="Publicar en mi tienda"
          style={[styles.sellBtn, { backgroundColor: colors.primary }]}
        >
          <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: peso.titulo }}>+ Vender</Text>
        </Pressable>
      </View>

      {/* Buscador */}
      <View style={[styles.searchWrap, { backgroundColor: colors.surface, borderColor: alpha(colors.border, 0.6) }]}>
        <Search size={16} color={colors.textSecondary} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Busca producto, comida o servicio…"
          placeholderTextColor={colors.textSecondary}
          style={{ flex: 1, marginLeft: espaciado.e8, color: colors.textPrimary, fontSize: tipografia.body, paddingVertical: 0 }}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Buscar en el catálogo"
        />
        {/* Borrar la búsqueda de un toque: antes había que borrar letra a letra. */}
        {q.length > 0 ? (
          <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityLabel="Borrar la búsqueda">
            <X size={15} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {/* Filtros por tipo.
          OJO (defecto arreglado): este ScrollView se APLASTABA. En React Native los hijos de una
          columna tienen `flexShrink: 1` por defecto, así que el listado de abajo (que sí tiene
          flex:1) le robaba el sitio: los chips quedaban de 17 dp y el texto se cortaba a 4 px de
          alto (medido en el volcado de pantalla). Con `flexGrow:0`/`flexShrink:0` y una altura
          mínima, cada chip mide lo suyo. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipRow}
        contentContainerStyle={{ paddingHorizontal: espaciado.e14, gap: espaciado.e8, alignItems: 'center' }}
      >
        {chips.map((c) => {
          const active = serviceType === c.id;
          return (
            <Pressable
              key={c.id || 'all'}
              onPress={() => setServiceType(c.id)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              style={[styles.chip, {
                backgroundColor: active ? colors.primary : colors.surface,
                borderColor: active ? colors.primary : alpha(colors.border, 0.7),
              }]}
            >
              <Text style={{ color: active ? brand.white : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>
                {c.icon} {c.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* Ciudad + orden */}
      <View style={{ flexDirection: 'row', gap: espaciado.e8, paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e8 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espaciado.e6 }}>
          <Pressable
            onPress={() => setCity('')}
            style={[styles.miniChip, { borderColor: city === '' ? colors.primary : alpha(colors.border, 0.7), backgroundColor: city === '' ? alpha(colors.primary, 0.12) : 'transparent' }]}
          >
            <Text style={{ color: city === '' ? colors.primary : colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.maximo }}>Todas</Text>
          </Pressable>
          {LB_CITIES.map((c) => (
            <Pressable
              key={c}
              onPress={() => setCity(c === city ? '' : c)}
              style={[styles.miniChip, { borderColor: city === c ? colors.primary : alpha(colors.border, 0.7), backgroundColor: city === c ? alpha(colors.primary, 0.12) : 'transparent' }]}
            >
              <Text style={{ color: city === c ? colors.primary : colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.maximo }}>{c}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
      <View style={{ flexDirection: 'row', gap: espaciado.e6, paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e8 }}>
        {SORTS.map((s) => (
          <Pressable key={s.id} onPress={() => setSort(s.id)} accessibilityRole="tab" accessibilityState={{ selected: sort === s.id }}>
            <Text style={{ color: sort === s.id ? colors.primary : colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.maximo, textDecorationLine: sort === s.id ? 'underline' : 'none' }}>
              {s.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Resultados: se DICE qué está pasando. Antes, al escribir, la lista seguía enseñando los
          resultados viejos sin ninguna pista de que estaba buscando (y al no encontrar nada,
          tampoco lo decía). */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e8 }}>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.fuerte, flex: 1 }} numberOfLines={1}>
          {debouncedQ
            ? (loading ? `Buscando «${debouncedQ}»…` : `${items.length} resultado${items.length === 1 ? '' : 's'} para «${debouncedQ}»`)
            : `${items.length}${cursor ? '+' : ''} producto${items.length === 1 ? '' : 's'} y servicios`}
        </Text>
        {q !== debouncedQ ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </View>

      {/* Resultados */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(p) => p.id}
          numColumns={2}
          columnWrapperStyle={{ gap: espaciado.e10, paddingHorizontal: espaciado.e14 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 30, gap: espaciado.e12, flexGrow: 1 }}
          showsVerticalScrollIndicator={false}
          onEndReached={() => cursor && load('more')}
          onEndReachedThreshold={0.6}
          ListFooterComponent={more ? <ActivityIndicator color={colors.primary} style={{ marginVertical: espaciado.e14 }} /> : null}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60, gap: espaciado.e10 }}>
              <Package size={40} color={alpha(colors.primary, 0.35)} />
              <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo }}>Todavía no hay nada publicado aquí</Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', paddingHorizontal: 40 }}>
                Abre tu tienda y publica tu primer producto o servicio: es gratis y se hace desde el móvil.
              </Text>
              <Pressable onPress={() => irSeguro.libre('/lifebook-sell')} style={[styles.sellBtn, { backgroundColor: colors.primary, paddingHorizontal: espaciado.e18, paddingVertical: espaciado.e10 }]}>
                <Text style={{ color: brand.white, fontSize: tipografia.body, fontWeight: peso.titulo }}>Abrir mi tienda</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            /* La tarjeta es COMPARTIDA (`components/lifebook/ProductoCard.tsx`): la misma que usan
               el tab «Productos» del perfil y el historial de productos. Antes estaba copiada aquí. */
            <ProductoCard
              item={item}
              onPress={() => router.push(
                // 🔒 Una HABITACIÓN no se abre como un producto: se entra por la ficha del hotel.
                // Abrirla como producto llevaba a una caja con cantidad y entrega (una habitación
                // «para recoger en tienda»), sin fechas ni noches. El servidor ya rechaza ese
                // atajo (`SERVICE_NOT_ORDERABLE`); aquí el usuario ni lo pisa.
                item.serviceType === 'hotel_room'
                  ? ({ pathname: '/lifebook-hotel-detalle', params: { id: item.shop.id } } as never)
                  : ({ pathname: '/lifebook-product/[id]', params: { id: item.id } } as never),
              )}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sellBtn: { borderRadius: radios.full, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: espaciado.e14, marginTop: espaciado.e10,
    borderWidth: StyleSheet.hairlineWidth, borderRadius: radios.md, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10,
  },
  /* La fila de chips NO se estira ni se encoge: alto propio (ver el comentario del JSX). */
  chipRow: { flexGrow: 0, flexShrink: 0, minHeight: 46, paddingVertical: espaciado.e8 },
  chip: {
    borderWidth: trazo.fino, borderRadius: radios.full, paddingHorizontal: espaciado.e13, minHeight: 32,
    /* ANCHO MÍNIMO: medido en pantalla, el primer chip («✨ Todo») salía de 26 dp con el texto
       cortado mientras los demás salían de 114/103/93 dp. Con un mínimo, todos miden lo mismo
       de ancho como mínimo y la etiqueta se lee entera. */
    minWidth: 78,
    alignItems: 'center', justifyContent: 'center',
  },
  miniChip: { borderWidth: trazo.fino, borderRadius: radios.full, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e5 },
  /** El globito del carrito en la cabecera. */
  globito: {
    position: 'absolute', top: -5, right: -7, minWidth: 16, height: 16, borderRadius: radios.sm,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e3,
  },
});
