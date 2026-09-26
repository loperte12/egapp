/**
 * EcomerseTiendaScreen — la página de una tienda: quién es y todo lo que vende.
 * Ruta: /ecomerse-tienda?id=<sellerId>&nombre=<opcional>
 *
 * POR QUÉ EXISTE: era la salida que faltaba. La ficha enseñaba la tienda y no dejaba entrar; el
 * directorio (`/ecomerse-tiendas`) enseña las tiendas y esta es donde se entra. Con las dos, el
 * Mercado pasa de «productos sueltos» a «productos y quién los vende».
 *
 * ── DE DÓNDE SALE CADA COSA (dos llamadas, cada una a lo suyo) ─────────────────────────────────
 *   · La CABECERA, de `GET /ecomerse/sellers/:id` — la tienda por sí sola.
 *   · Los ANUNCIOS, de `GET /ecomerse/catalog?sellerId=…` — solo los suyos.
 *
 * Antes era **una** llamada: el catálogo entero, filtrado en el cliente por `seller.id`. Eso tenía
 * dos consecuencias, y las dos se han cerrado con los dos endpoints nuevos:
 *   · Se descargaba **todo el Mercado** para pintar una tienda, y con `LIMIT 200` en el servidor los
 *     anuncios de esa tienda que cayeran fuera de esos 200 **desaparecían sin avisar**.
 *   · La cabecera se sacaba del **primer anuncio** encontrado. Una tienda activa **sin anuncios
 *     activos** se quedaba sin nombre, sin ciudad y sin escudo, con un hueco que se lee como «no ha
 *     cargado», y una tienda con anuncios **fuera** de esos 200 también. Ahora la tienda existe por
 *     sí sola y se pregunta aparte.
 *
 * ── LA CUENTA HONESTA DE LOS ANUNCIOS ─────────────────────────────────────────────────────────
 * El servidor cuenta los anuncios activos de la tienda (`anuncios`) y este catálogo sigue llevando
 * `LIMIT 200`. Con un censo de tres cifras, la cabecera puede decir «9 anuncios» y la rejilla
 * enseñar menos. En vez de taparlo, la sección **lo dice**: `Anuncios (N) · mostrando M`. Los dos
 * números son ciertos y se distingue el que manda el servidor del que ha llegado a la pantalla.
 *
 * ── EL PARÁMETRO `nombre` ES SOLO PARA PINTAR MIENTRAS CARGA ───────────────────────────────────
 * El nombre que manda la pantalla anterior es lo que se enseña en la cabecera **hasta que llega el
 * brief del servidor**; en cuanto llega, manda el del servidor. Es un `string` de conveniencia, no
 * un dato de verdad: si viene vacío o miente, se corrige solo en el primer render con datos.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import {
  useTheme, EmptyState, InlineError, espaciado, peso, tipografia, trazo,
} from '@egrouteplan/ui-kit';
import { ecomerseApi, EcomerseProduct, EcomerseSellerCard, EcomerseSellerBrief } from '../api/ecomerse';
import { TarjetaProducto, EsqueletoTarjeta } from '../components/ecomerse/TarjetaProducto';
import { CabeceraTienda } from '../components/ecomerse/CabeceraTienda';
import { BotonPreguntarTienda } from '../components/ecomerse/BotonPreguntarTienda';
import { BotonSeguirTienda } from '../components/ecomerse/BotonSeguirTienda';
import { useAccionesProducto } from '../components/ecomerse/useAccionesProducto';
import { llamarTelefono } from '../utils/llamar';

const ESQUELETOS = [0, 1, 2, 3];

export default function EcomerseTiendaScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const s = styles(colors);
  const { favIds, alternarFavorito, abrirFicha, anadirAlCarrito } = useAccionesProducto();

  const raw = useLocalSearchParams<{ id?: string | string[]; nombre?: string | string[] }>();
  const id = Array.isArray(raw.id) ? raw.id[0] : raw.id;
  const nombreParam = Array.isArray(raw.nombre) ? raw.nombre[0] : raw.nombre;

  const [productos, setProductos] = useState<EcomerseProduct[]>([]);
  const [censo, setCenso] = useState<EcomerseSellerCard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) {
      setError('No sabemos qué tienda abrir.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [tienda, anuncios] = await Promise.all([
        /* La tienda por sí sola. Si no está activa contesta 404 y se sigue sin cabecera: la pantalla
           no se inventa un nombre ni una valoración que el servidor no ha dado. El `catch` es solo
           para eso — si lo que falla es la red, quien rompe es el catálogo y se cae al error. */
        ecomerseApi.seller(id).catch(() => null),
        ecomerseApi.catalog({ sellerId: id }),
      ]);
      setCenso(tienda);
      setProductos(anuncios);
    } catch {
      setError('No pudimos cargar la tienda. Revisa tu conexión e inténtalo de nuevo.');
      setProductos([]);
      setCenso(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  /* AQUÍ VIVÍAN DOS COPIAS DEL CORAZÓN, y las dos se retiraron el 24/09/2026 (Fase 2):
       · el `useEffect` que sincronizaba `favIds` al montar, y
       · `alternarFavorito`, con la sesión, la marca optimista y la vuelta atrás.
     Las dos están ahora en `useAccionesProducto` y llegan juntas en la línea de arriba. Se van con
     ellas la guarda de combinaciones que esta pantalla repetía en `onAdd` — y esa era la peor de las
     tres copias: una guarda duplicada es una guarda que un día deja de coincidir con la otra. */

  /* La cabecera sale de la tienda; el brief del primer anuncio queda como respaldo por si el
     endpoint de la tienda no contestara (red a medias) — y entonces la cifra vuelve a ser la de la
     lista cargada, que es lo único que se sabe con certeza. */
  const seller: EcomerseSellerBrief | null = censo ?? productos[0]?.seller ?? null;
  const nAnuncios = censo?.anuncios ?? productos.length;
  const nombre = seller?.businessName ?? nombreParam ?? 'Tienda';
  const telefono = seller?.phoneContact ?? null;
  const vacia = !loading && !error && productos.length === 0;

  const datos: EcomerseProduct[] = loading && productos.length === 0
    ? ESQUELETOS.map((i) => ({ id: `__sk_${i}` } as EcomerseProduct))
    : productos.length % 2 === 1
      ? [...productos, { id: '__spacer__' } as EcomerseProduct]
      : productos;

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <View style={s.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={s.headerTitle} numberOfLines={1}>{nombre}</Text>
        <View style={{ width: 22 }} />
      </View>

      <FlatList
        data={datos}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={s.colWrap}
        contentContainerStyle={s.lista}
        refreshing={loading && productos.length > 0}
        onRefresh={load}
        ListHeaderComponent={
          <View style={s.cabecera}>
            {/* Si no hay brief (tienda sin anuncios activos, o sin sesión de red) no se pinta la
                tarjeta: la pantalla no se inventa una valoración ni una ciudad que no ha podido
                leer. */}
            {seller && (
              <CabeceraTienda
                seller={seller}
                anuncios={nAnuncios}
                onLlamar={telefono ? () => { void llamarTelefono(telefono); } : undefined}
              />
            )}
            {/*
              LA PUERTA AL CHAT, en el mismo sitio que en la ficha: debajo de quién vende. Aquí NO se
              manda `productId` —se ha entrado a la tienda, no a un anuncio, así que no hay ninguno
              que citar—, y esa diferencia es la razón de que el parámetro sea opcional: el mismo
              botón sirve para los dos caminos sin una segunda versión del texto.
              El margen no se pone a mano: el contenedor ya separa a sus hijos con `gap`.
            */}
            <BotonPreguntarTienda
              sellerId={id}
              nombre={seller?.businessName ?? nombreParam ?? null}
              telefono={telefono}
            />
            {/*
              EL SEGUIMIENTO (店铺关注), junto a la puerta del chat: las dos maneras de quedarse con
              la tienda —hablarle ahora, o tenerla a mano después— viven juntas, debajo de quién
              vende. El botón se encarga de todo (sesión, estado inicial, vuelta atrás); aquí solo se
              coloca, con el mismo `gap` del contenedor que lo de arriba.
            */}
            <BotonSeguirTienda sellerId={id} nombre={seller?.businessName ?? nombreParam ?? null} />
            {!loading && !error && nAnuncios > 0 && (
              <Text style={s.tituloSeccion}>
                Anuncios ({nAnuncios}){productos.length < nAnuncios ? ` · mostrando ${productos.length}` : ''}
              </Text>
            )}
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <View style={{ alignItems: 'center', paddingTop: 40 }}>
              <ActivityIndicator color={colors.text.primary} />
            </View>
          ) : error ? (
            <View style={{ paddingTop: espaciado.e24 }}>
              <InlineError mensaje={error} onReintentar={load} />
            </View>
          ) : vacia ? (
            <EmptyState
              emoji="🏪"
              titulo={nombreParam ? `${nombreParam} no tiene anuncios` : 'Esta tienda no tiene anuncios'}
              texto="La tienda existe, pero ahora mismo no tiene nada publicado. Vuelve a mirar más tarde."
              accionLabel="Ver otras tiendas"
              onAccion={() => router.push('/ecomerse-tiendas' as any)}
            />
          ) : null
        }
        renderItem={({ item }) =>
          item.id.startsWith('__sk_') ? (
            <EsqueletoTarjeta />
          ) : item.id === '__spacer__' ? (
            <View style={{ flex: 1 }} />
          ) : (
            <TarjetaProducto
              product={item}
              favorited={favIds.includes(item.id)}
              onPress={() => abrirFicha(item.id)}
              onFav={() => alternarFavorito(item)}
              /* Las dos acciones son UNA línea cada una porque el módulo común ya se hace cargo del
                 resto: `abrirFicha` lleva a la ficha y `anadirAlCarrito` incluye la guarda de
                 combinaciones (un anuncio con combinaciones no se añade desde la tarjeta: elegir es un
                 paso que la tarjeta no puede dar). Antes la guarda estaba escrita aquí otra vez. */
              onAdd={() => anadirAlCarrito(item)}
            />
          )
        }
      />
    </View>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  root: { flex: 1, backgroundColor: c.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e12, borderBottomWidth: trazo.fino, borderBottomColor: c.border },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: tipografia.subtitle, fontWeight: peso.titulo, color: c.textPrimary },
  colWrap: { gap: espaciado.e8, paddingHorizontal: espaciado.e16 },
  lista: { gap: espaciado.e8, paddingBottom: espaciado.e32 },
  cabecera: { paddingHorizontal: espaciado.e16, paddingTop: espaciado.e12, gap: espaciado.e12 },
  tituloSeccion: { fontSize: tipografia.body, fontWeight: peso.titulo, color: c.textPrimary },
});
