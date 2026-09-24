/**
 * EcomerseTiendasScreen — el directorio de tiendas del Mercado.
 * Ruta: /ecomerse-tiendas
 *
 * POR QUÉ EXISTE: el Mercado tenía catálogo, ficha, favoritos, pedidos y panel del vendedor, y **no
 * tenía forma de ver las tiendas**. El comprador veía productos sueltos; la única pista de que
 * detrás de cada anuncio hay un negocio con nombre, valoración y ciudad estaba enterrada en la
 * ficha, y encima sin salida. Esta pantalla es la puerta.
 *
 * ── DE DÓNDE SALE LA LISTA: DEL CENSO, NO DEL CATÁLOGO ─────────────────────────────────────────
 * De `GET /ecomerse/sellers`, que es la lista de **tiendas activas** (`wallet.ecomerse_sellers`).
 *
 * Antes esta pantalla **derivaba la lista del catálogo** agrupando por `seller.id`, y eso tenía dos
 * agujeros que estaban escritos en voz alta aquí mismo:
 *   · Una tienda **sin anuncios activos no aparecía**. No había de dónde sacarla: la lista salía de
 *     los anuncios. Por eso el rótulo decía «N tiendas · M anuncios» y **no** prometía un censo.
 *   · El catálogo devuelve `LIMIT 200`: por encima de 200 anuncios activos la lista **se quedaba
 *     corta sin avisar**.
 * Las dos están cerradas. El rótulo ahora sí dice la verdad que el servidor le manda:
 * **`total`** (tiendas que hay, no las que han llegado) y **`anuncios`**, contados sobre todo lo que
 * casa con el filtro. Y si el servidor recorta la página, la pantalla **lo dice** en vez de fingir
 * que esa es la lista entera: `sellers.length < total` es un caso previsto, no un imposible.
 *
 * ── ORDEN ─────────────────────────────────────────────────────────────────────────────────────
 * Lo decide **el servidor**, con el mismo criterio que el catálogo (tiendas de pago primero, luego
 * mejor valoradas, luego más vistas), para que el directorio no contradiga la rejilla que el
 * comprador acaba de ver. Ordenar por «más anuncios» habría sido más vistoso y menos cierto: no
 * sabemos cuánto vende nadie, y el número de anuncios lo mueve el vendedor en una tarde.
 *
 * ── LA FILA ES `CabeceraTienda` ───────────────────────────────────────────────────────────────
 * No hay una fila propia del directorio: cada tienda se pinta con **la misma tarjeta** que la ficha
 * y que la página de tienda. Tres consumidores, una definición — y si mañana se añade el logo de la
 * tienda, aparece en los tres sitios sin tocar ninguno.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronRight, Store } from 'lucide-react-native';
import {
  useTheme, alpha, EmptyState, InlineError, espaciado, peso, radios, tipografia, trazo,
} from '@egrouteplan/ui-kit';
import { ecomerseApi, EcomerseSellerCard } from '../api/ecomerse';
import { CabeceraTienda } from '../components/ecomerse/CabeceraTienda';

export default function EcomerseTiendasScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const s = styles(colors);

  const [tiendas, setTiendas] = useState<EcomerseSellerCard[]>([]);
  /** Las cifras del SERVIDOR: cuántas tiendas hay y cuántos anuncios activos suman. No se derivan
   *  de `tiendas.length`, que es solo lo que llegó en esta página. */
  const [total, setTotal] = useState(0);
  const [anuncios, setAnuncios] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const censo = await ecomerseApi.sellers();
      setTiendas(censo.sellers);
      setTotal(censo.total);
      setAnuncios(censo.anuncios);
    } catch {
      setError('No pudimos cargar las tiendas. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const recortada = tiendas.length < total;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={s.headerTitle}>Tiendas</Text>
        <View style={{ width: 22 }} />
      </View>

      <FlatList
        data={tiendas}
        keyExtractor={(t) => t.id}
        contentContainerStyle={s.lista}
        refreshing={loading && tiendas.length > 0}
        onRefresh={load}
        ListHeaderComponent={
          <View>
            {!error && !loading && (
              <Text style={s.contador}>
                {total} tienda{total === 1 ? '' : 's'} · {anuncios} anuncio{anuncios === 1 ? '' : 's'}
                {recortada ? ` · mostrando ${tiendas.length}` : ''}
              </Text>
            )}

            {/* La puerta del VENDEDOR. Antes vivía en el icono 🏪 de la cabecera del Mercado, y ese
                icono es ahora esta pantalla. No se pierde: cambia de sitio y gana explicación — el
                icono no decía si llevaba a «mi tienda» o a «las tiendas». Aquí dice las dos cosas y
                cada una a su fila. */}
            <Pressable
              onPress={() => router.push('/ecomerse-seller' as any)}
              accessibilityRole="button"
              accessibilityLabel="Mi tienda, publica y gestiona tus anuncios"
              style={[s.miTienda, { backgroundColor: alpha(colors.primary, 0.08), borderColor: alpha(colors.primary, 0.25) }]}
            >
              <View style={[s.iconoMiTienda, { backgroundColor: alpha(colors.primary, 0.15) }]}>
                <Store size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: espaciado.e12 }}>
                <Text style={[s.miTiendaTitulo, { color: colors.textPrimary }]}>Mi tienda</Text>
                <Text style={[s.miTiendaSub, { color: colors.textSecondary }]}>Publica y gestiona tus anuncios</Text>
              </View>
              <ChevronRight size={18} color={colors.primary} />
            </Pressable>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ alignItems: 'center', paddingTop: 48 }}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[s.miTiendaSub, { color: colors.textSecondary, marginTop: espaciado.e10 }]}>Cargando tiendas…</Text>
            </View>
          ) : error ? (
            <View style={{ paddingTop: espaciado.e24 }}>
              <InlineError mensaje={error} onReintentar={load} />
            </View>
          ) : (
            <EmptyState
              emoji="🏪"
              titulo="Todavía no hay tiendas"
              texto="Aquí aparecerán las tiendas que publiquen anuncios en el Mercado."
              accionLabel="Publicar mi primer producto"
              accionPrimaria
              onAccion={() => router.push('/ecomerse-seller' as any)}
            />
          )
        }
        renderItem={({ item }) => (
          <CabeceraTienda
            seller={item}
            anuncios={item.anuncios}
            onPress={() => router.push({ pathname: '/ecomerse-tienda', params: { id: item.id, nombre: item.businessName ?? '' } } as any)}
          />
        )}
      />
    </View>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e12, borderBottomWidth: trazo.fino, borderBottomColor: c.border },
  headerTitle: { fontSize: tipografia.subtitle, fontWeight: peso.titulo, color: c.textPrimary },
  lista: { gap: espaciado.e8, paddingHorizontal: espaciado.e16, paddingBottom: espaciado.e32 },
  contador: { fontSize: tipografia.caption, color: c.textSecondary, paddingVertical: espaciado.e8 },
  miTienda: { flexDirection: 'row', alignItems: 'center', borderRadius: radios.md, borderWidth: trazo.fino, padding: espaciado.e12, marginBottom: espaciado.e8 },
  iconoMiTienda: { width: 44, height: 44, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center' },
  miTiendaTitulo: { fontSize: tipografia.body, fontWeight: peso.fuerte },
  miTiendaSub: { fontSize: tipografia.micro, marginTop: espaciado.e2 },
});
