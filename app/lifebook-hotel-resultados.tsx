/**
 * lifebook-hotel-resultados — LA LISTA DE RESULTADOS de una búsqueda de alojamiento.
 *
 * Es la pantalla que en el boceto se llamaba `/(hotel)/results`. Se ha hecho así:
 *   · **Ruta plana con prefijo** (`/lifebook-hotel-resultados`), como el resto de Life
 *     Book: un grupo `(hotel)` no aparece en la URL, así que la pantalla habría quedado
 *     en `/results` — nombre genérico en la raíz de una app que ya tiene `/buscar` y
 *     `/lifebook-search` — y con `typedRoutes` la ruta inventada no compila.
 *   · **La misma tarjeta** que el buscador (`HotelResultCard`): una sola forma de pintar
 *     un resultado, no dos.
 *   · **Con errores y carga de verdad**: si la red falla se dice y se puede reintentar
 *     (nada de `catch {}` dejando la lista vacía como si no hubiera hoteles).
 *   · Recibe los filtros por parámetros y los reenvía a la API tal cual: el servidor es
 *     quien decide disponibilidad y precios.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, espaciado, FormField, GhostButton, PrimaryButton, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { HotelResultCard } from '../components/HotelResultCard';
import { hotelApi, type HotelRoom, type HotelSearchResult } from '../api/hotel';
import { ApiError } from '../api/httpClient';
import { nightsBetween, xaf } from '../utils/datetime';

export default function HotelResultadosScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const p = useLocalSearchParams<{
    city?: string; checkIn?: string; checkOut?: string; guests?: string; units?: string;
  }>();

  const [ciudad, setCiudad] = useState(p.city ?? '');
  const [huespedes] = useState(Number(p.guests ?? 2));
  const [habitaciones] = useState(Number(p.units ?? 1));
  const [datos, setDatos] = useState<HotelSearchResult | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * ── FILTRO DE PRECIO (hueco P0 nº1 del análisis Meituan) ──────────────────────
   * Meituan documenta el precio como **filtro de primer nivel**, no como un extra, y la API ya lo
   * admitía (`minPrice`/`maxPrice`, comprobado: `maxPrice=1` devuelve 0 hoteles). Solo faltaba la
   * interfaz.
   *
   * Se separan los valores que se ESCRIBEN de los APLICADOS a propósito: si se buscara a cada
   * tecla, escribir «25000» lanzaría cinco búsquedas y el usuario vería la lista parpadear.
   *
   * Y una cosa que NO se pone porque el servidor no la admite: **la ordenación**. `sort=price_asc`
   * responde **400** (no está en el DTO de la búsqueda). Un control que devuelve 400 es peor que no
   * tenerlo; queda anotado como pendiente de servidor.
   */
  const [filtroAbierto, setFiltroAbierto] = useState(false);
  const [minTexto, setMinTexto] = useState('');
  const [maxTexto, setMaxTexto] = useState('');
  const [aplicado, setAplicado] = useState<{ min?: number; max?: number; error?: string }>({});

  /** Lo que cuesta cada página. 20 como antes; el servidor lo llama `pageSize`. */
  const POR_PAGINA = 20;
  const [pagina, setPagina] = useState(1);
  const [masCargando, setMasCargando] = useState(false);

  const checkIn = p.checkIn ?? undefined;
  const checkOut = p.checkOut ?? undefined;
  const noches = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;

  const cargar = useCallback(async (silencioso = false, pag = 1) => {
    if (!silencioso) setCargando(true);
    setError(null);
    try {
      const out = await hotelApi.search({
        city: ciudad || undefined,
        checkIn,
        checkOut,
        guests: huespedes,
        units: habitaciones,
        minPrice: aplicado.min,
        maxPrice: aplicado.max,
        page: pag,
        limit: POR_PAGINA,
      });
      // Al paginar se ACUMULA; al buscar de nuevo se reemplaza. Si no, «Ver más» borraría lo
      // que el usuario ya estaba mirando.
      setDatos((prev) => (pag > 1 && prev ? { ...out, hotels: [...prev.hotels, ...(out.hotels ?? [])] } : out));
      setPagina(pag);
    } catch (e) {
      // El error se ENSEÑA: un fallo de red no puede parecer «no hay hoteles».
      setError(e instanceof ApiError ? e.message : 'No se pudo buscar. Revisa tu conexión.');
      if (pag === 1) setDatos(null);
    } finally {
      setCargando(false);
      setRefrescando(false);
      setMasCargando(false);
    }
  }, [ciudad, checkIn, checkOut, huespedes, habitaciones, aplicado]);

  useEffect(() => { void cargar(); }, [cargar]);

  /** Aplica el precio escrito. Se comprueba aquí para no mandar basura al servidor. */
  const aplicarFiltro = () => {
    const num = (t: string) => {
      const n = Number(String(t).replace(/[^\d]/g, ''));
      return String(t).trim() && Number.isFinite(n) && n > 0 ? n : undefined;
    };
    const min = num(minTexto);
    const max = num(maxTexto);
    if (min !== undefined && max !== undefined && max < min) {
      setAplicado((a) => ({ ...a, error: 'El máximo no puede ser menor que el mínimo.' }));
      return;
    }
    setAplicado({ min, max });
    setFiltroAbierto(false);
  };

  const quitarFiltro = () => {
    setMinTexto('');
    setMaxTexto('');
    setAplicado({});
  };

  const hayFiltro = aplicado.min !== undefined || aplicado.max !== undefined;

  const abrirHabitacion = (room: HotelRoom, shopId: string, shopName: string) => {
    router.push({
      pathname: '/lifebook-hotel-reservar',
      params: {
        roomTypeId: room.id,
        shopId,
        shopName,
        ...(checkIn ? { checkIn } : {}),
        ...(checkOut ? { checkOut } : {}),
        guests: String(huespedes),
        units: String(habitaciones),
      },
    } as never);
  };

  const hoteles = datos?.hotels ?? [];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.barra, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver" style={styles.volver}>
          <Text style={[styles.volverTxt, { color: colors.textPrimary }]}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.titulo, { color: colors.textPrimary }]} numberOfLines={1}>
            {ciudad ? `Alojamiento en ${ciudad}` : 'Alojamiento'}
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
            {checkIn && checkOut
              ? `${checkIn} → ${checkOut} · ${noches} noche(s) · ${huespedes} huésped(es)${habitaciones > 1 ? ` · ${habitaciones} habitaciones` : ''}`
              : 'Sin fechas: elige días para ver precios y disponibilidad'}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/lifebook-hotel' as never)}
          accessibilityRole="button"
          accessibilityLabel="Cambiar la búsqueda"
          style={[styles.cambiar, { borderColor: colors.border }]}
        >
          <Text style={[styles.cambiarTxt, { color: colors.primary }]}>Cambiar</Text>
        </Pressable>
      </View>

      {/*
        ── BARRA DE FILTROS ──
        El precio es filtro de PRIMER NIVEL en Meituan, así que va en una barra siempre visible y
        no escondido en un menú. Cuando hay filtro puesto, se ve cuál: un filtro activo que no se
        enseña hace que el usuario crea que «no hay hoteles» en vez de «no hay con ese precio».
      */}
      <View style={[styles.filtros, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => setFiltroAbierto((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={hayFiltro ? 'Cambiar el filtro de precio' : 'Filtrar por precio'}
          accessibilityState={{ expanded: filtroAbierto }}
          style={[styles.chip, {
            borderColor: hayFiltro ? colors.primary : colors.border,
            backgroundColor: hayFiltro ? alpha(colors.primary, 0.12) : colors.surface,
          }]}
        >
          <Text style={{ color: hayFiltro ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>
            {hayFiltro
              ? `Precio: ${aplicado.min !== undefined ? xaf(aplicado.min) : '0'} – ${aplicado.max !== undefined ? xaf(aplicado.max) : 'sin tope'}`
              : '💰 Precio'}
          </Text>
        </Pressable>

        {hayFiltro ? (
          <Pressable
            onPress={quitarFiltro}
            accessibilityRole="button"
            accessibilityLabel="Quitar el filtro de precio"
            style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>Quitar</Text>
          </Pressable>
        ) : null}

        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginLeft: 'auto' }}>por noche</Text>
      </View>

      {filtroAbierto ? (
        <View style={[styles.panelFiltro, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
          <View style={{ flexDirection: 'row', gap: espaciado.e10 }}>
            <View style={{ flex: 1 }}>
              <FormField
                label="Precio mínimo (XAF)" value={minTexto} onChangeText={setMinTexto}
                keyboardType="number-pad" placeholder="Sin mínimo"
              />
            </View>
            <View style={{ flex: 1 }}>
              <FormField
                label="Precio máximo (XAF)" value={maxTexto} onChangeText={setMaxTexto}
                keyboardType="number-pad" placeholder="Sin tope"
              />
            </View>
          </View>
          {aplicado.error ? (
            <Text style={{ color: colors.secondary, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e8 }}>
              ⚠ {aplicado.error}
            </Text>
          ) : null}
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 16, marginTop: espaciado.e8 }}>
            Es el precio por noche. Deja un campo vacío para no poner tope por ese lado.
          </Text>
          {/*
            Nota para quien venga: aquí NO hay control de ordenación porque el servidor no la
            admite (`sort=price_asc` → 400, no está en el DTO de la búsqueda). Un control que
            devuelve 400 es peor que no tenerlo. Queda pendiente de servidor.
          */}
          <View style={{ flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e12 }}>
            <View style={{ flex: 1 }}>
              <PrimaryButton title="Buscar con este precio" onPress={aplicarFiltro} />
            </View>
            <View style={{ flex: 1 }}>
              <GhostButton title="Limpiar" onPress={quitarFiltro} />
            </View>
          </View>
        </View>
      ) : null}

      {cargando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.sub, { color: colors.textSecondary }]}>Buscando disponibilidad…</Text>
        </View>
      ) : error ? (
        <View style={[styles.aviso, { borderColor: colors.danger, backgroundColor: alpha(colors.danger, 0.06) }]}>
          <Text style={{ color: colors.danger, fontSize: tipografia.body, fontWeight: peso.medio }}>{error}</Text>
          <Pressable onPress={() => void cargar()} accessibilityRole="button" accessibilityLabel="Reintentar">
            <Text style={[styles.enlace, { color: colors.primary }]}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={hoteles}
          keyExtractor={(item) => item.hotel.id}
          contentContainerStyle={{ padding: espaciado.e14, paddingBottom: insets.bottom + 24, gap: espaciado.e12 }}
          refreshControl={
            <RefreshControl
              refreshing={refrescando}
              onRefresh={() => { setRefrescando(true); void cargar(true); }}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            hoteles.length ? (
              <Text style={[styles.sub, { color: colors.textSecondary, marginBottom: espaciado.e4 }]}>
                {hoteles.length} alojamiento(s)
                {hoteles.some((h) => h.soldOut) ? ' · los marcados «sin disponibilidad» no tienen hueco en esas fechas' : ''}
              </Text>
            ) : null
          }
          ListFooterComponent={
            /*
              Paginación. `hasMore` puede venir AUSENTE (el servidor hace un `return` temprano sin
              los campos de paginación cuando no hay hoteles), así que se trata «ausente» como «no
              hay más»: un botón «Ver más» que no trae nada es peor que no tenerlo.
            */
            datos?.hasMore && hoteles.length ? (
              <View style={{ marginTop: espaciado.e8 }}>
                <GhostButton
                  title={masCargando ? 'Buscando más…' : 'Ver más alojamientos'}
                  onPress={() => { setMasCargando(true); void cargar(true, pagina + 1); }}
                  disabled={masCargando}
                />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={[styles.vacio, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.vacioTitulo, { color: colors.textPrimary }]}>
                No hay alojamiento con esos datos
              </Text>
              <Text style={[styles.sub, { color: colors.textSecondary }]}>
                Prueba otras fechas, otra ciudad o menos habitaciones. Los hoteles sin hueco sí
                aparecen marcados como «sin disponibilidad», así que puedes ajustar el rango.
              </Text>
              <Pressable onPress={() => router.push('/lifebook-hotel' as never)} accessibilityRole="button" accessibilityLabel="Cambiar la búsqueda">
                <Text style={[styles.enlace, { color: colors.primary }]}>Cambiar la búsqueda</Text>
              </Pressable>
            </View>
          }
          renderItem={({ item }) => (
            <HotelResultCard
              datos={item}
              habitaciones={habitaciones}
              listo={!!(checkIn && checkOut)}
              onAbrir={() => router.push({
                pathname: '/lifebook-hotel-detalle',
                params: {
                  id: item.hotel.id,
                  ...(checkIn ? { checkIn } : {}),
                  ...(checkOut ? { checkOut } : {}),
                  guests: String(huespedes),
                  units: String(habitaciones),
                },
              } as never)}
              onReservar={(room) => abrirHabitacion(room, item.hotel.id, item.hotel.name)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  barra: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10, borderBottomWidth: trazo.fino },
  volver: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  volverTxt: { fontSize: 26, fontWeight: peso.fuerte, lineHeight: 28 },
  titulo: { fontSize: tipografia.anchoFuerte, fontWeight: peso.maximo },
  sub: { fontSize: tipografia.caption },
  cambiar: { borderWidth: trazo.fino, borderRadius: radios.md, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e7 },
  cambiarTxt: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: espaciado.e8 },
  aviso: { margin: espaciado.e14, borderWidth: trazo.fino, borderRadius: 14, padding: espaciado.e12, gap: espaciado.e6 },
  enlace: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  vacio: { borderWidth: trazo.fino, borderRadius: radios.lg, padding: espaciado.e14, gap: espaciado.e6 },
  vacioTitulo: { fontSize: tipografia.fino, fontWeight: peso.maximo },
  // Barra de filtros y panel: el precio es filtro de primer nivel, va siempre a la vista.
  filtros: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e8,
    paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e9, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // 44 px de alto mínimo: un chip de 33 px se falla con el dedo.
  chip: { borderWidth: trazo.base, borderRadius: radios.full, paddingHorizontal: espaciado.e13, minHeight: 44, justifyContent: 'center' },
  panelFiltro: { paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e14, borderBottomWidth: StyleSheet.hairlineWidth },
});
