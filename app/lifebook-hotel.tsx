/**
 * lifebook-hotel — BUSCAR ALOJAMIENTO (módulo hotelero).
 *
 * ── REESCRITA EL 27-sep-2026 (P1 del plan de UI, `docs/UI-HOTEL-PLAN-MEJORA.md` §10) ──
 *
 * QUÉ PASABA. El buscador vivía **dentro del `ListHeaderComponent`** de la propia lista, y estaba
 * partido en tres bloques con etiquetas —`DÓNDE` / `CUÁNDO` / `QUIÉN Y CUÁNTAS HABITACIONES`—, cada
 * uno en su marco: dos cajas de fecha, un contador de noches, un aviso, un botón de calendario y dos
 * contadores más. Medido en el móvil (`_c1-01-arranque.png`): **más de mil píxeles de formulario**
 * antes de la primera tarjeta. Además la búsqueda se disparaba SOLA al cambiar cualquier criterio
 * (`useEffect` sobre `buscar`), así que no había un momento en el que el usuario hubiera «buscado».
 *
 * QUÉ HACE AHORA. Una sola tarjeta con tres filas y un botón, como la referencia:
 *   1. **destino** — una hoja con las ciudades reales del país (la API filtra por nombre EXACTO, así
 *      que un campo de texto libre sólo acierta si se escribe perfecto);
 *   2. **llegada · salida · noches · habitaciones y huéspedes** — una línea de cuatro celdas, cada
 *      una con su hoja: los tres primeros trozos abren el calendario, el cuarto abre los contadores;
 *   3. **un botón**: «Buscar alojamiento».
 *
 * Y debajo, la fila de controles con lo que **este servidor sabe hacer de verdad**: `Cerca de mí`
 * (distancia en línea recta, calculada en el cliente) y `Precio` (`minPrice`/`maxPrice`, que la API
 * ya aplicaba). **No hay control de ordenación**: `sort` no existe en el DTO de la búsqueda y
 * responde 400 — un mando que falla es peor que no tenerlo, y queda anotado como pendiente.
 *
 * LA LISTA SE QUEDA. La referencia enseña los resultados en la misma pantalla, debajo del buscador;
 * lo que estaba mal no era tenerla, era el formulario que tenía delante. `/lifebook-hotel-resultados`
 * sigue existiendo para la vista completa.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, peso, radios, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import { ChevronDown, Search } from 'lucide-react-native';
import { HotelResultCard } from '../components/HotelResultCard';
import { HotelCitySheet } from '../components/hotel/HotelCitySheet';
import { HotelGuestsSheet } from '../components/hotel/HotelGuestsSheet';
import { HotelPriceSheet } from '../components/hotel/HotelPriceSheet';
import { hotelApi, type HotelSearchResult } from '../api/hotel';
import { ApiError } from '../api/httpClient';
import { getCurrentGqPosition } from '../api/locate';
import { havKm, type Coord } from '../utils/distancia';
import { nightsBetween, shortDate } from '../utils/datetime';

export default function LifebookHotelScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Se puede llegar con fechas ya elegidas (desde una ficha o desde «mis reservas»).
  const params = useLocalSearchParams<{ checkIn?: string; checkOut?: string; city?: string }>();

  // ── criterios de búsqueda ──
  const [ciudad, setCiudad] = useState<string>(params.city ?? '');
  const [checkIn, setCheckIn] = useState<string | null>(params.checkIn ?? null);
  const [checkOut, setCheckOut] = useState<string | null>(params.checkOut ?? null);
  const [huespedes, setHuespedes] = useState(2);
  const [habitaciones, setHabitaciones] = useState(1);
  const [precio, setPrecio] = useState<{ min?: number; max?: number }>({});

  // ── hojas ──
  const [hojaCiudad, setHojaCiudad] = useState(false);
  const [hojaQuien, setHojaQuien] = useState(false);
  const [hojaPrecio, setHojaPrecio] = useState(false);

  // ── «cerca de mí»: la posición se pide SÓLO cuando el usuario lo pide ──
  const [miPos, setMiPos] = useState<Coord | null>(null);
  const [cerca, setCerca] = useState(false);
  const [avisoGps, setAvisoGps] = useState<string | null>(null);

  const [datos, setDatos] = useState<HotelSearchResult | null>(null);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Contador: subirlo es «el usuario ha pulsado Buscar». Es lo que dispara la búsqueda explícita. */
  const [buscando, setBuscando] = useState(0);

  /**
   * Al volver de la pantalla de fechas (`/lifebook-hotel-fechas`) los parámetros traen la selección:
   * se sincroniza al recuperar el foco para que el buscador muestre las fechas elegidas y el precio
   * se recalcule sin tocar nada.
   */
  useFocusEffect(
    useCallback(() => {
      if (params.checkIn) setCheckIn(params.checkIn);
      if (params.checkOut) setCheckOut(params.checkOut);
    }, [params.checkIn, params.checkOut]),
  );

  const noches = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const listo = !!checkIn && !!checkOut && noches > 0;
  const hayPrecio = precio.min !== undefined || precio.max !== undefined;

  const buscar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    setError(null);
    try {
      const out = await hotelApi.search({
        city: ciudad || undefined,
        checkIn: checkIn ?? undefined,
        checkOut: checkOut ?? undefined,
        guests: huespedes,
        units: habitaciones,
        minPrice: precio.min,
        maxPrice: precio.max,
        limit: 20,
      });
      setDatos(out);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : 'No se pudo buscar. Revisa tu conexión.';
      setError(msg);
      setDatos(null);
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, [ciudad, checkIn, checkOut, huespedes, habitaciones, precio]);

  /**
   * Cuándo se busca, y por qué así:
   *   · al entrar (la lista nunca está vacía por defecto, como en la referencia);
   *   · cuando cambian las FECHAS — el precio depende de ellas, así que volver del calendario
   *     con una selección nueva tiene que refrescar sola;
   *   · cuando el usuario PULSA «Buscar alojamiento» (`buscando`).
   *
   * Y NO cuando cambia la ciudad o los huéspedes por sí solos: esos criterios se aplican al pulsar.
   * Eso es justamente lo que devuelve el gesto de buscar al usuario: antes la pantalla se recargaba
   * sola cada vez que se tocaba un chip y no había forma de saber cuándo había buscado.
   */
  useEffect(() => {
    void buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIn, checkOut, buscando]);

  const abrirFechas = () => {
    router.push({
      pathname: '/lifebook-hotel-fechas',
      params: {
        ...(ciudad ? { city: ciudad } : {}),
        ...(checkIn ? { checkIn } : {}),
        ...(checkOut ? { checkOut } : {}),
        guests: String(huespedes),
        units: String(habitaciones),
        modo: 'noches',
      },
    } as never);
  };

  /**
   * «Cerca de mí». El GPS del proyecto sólo devuelve posición **dentro de Guinea Ecuatorial**
   * (`api/locate.ts`): fuera del país, o sin permiso, devuelve `null` — es una regla de negocio, no
   * un fallo. Cuando eso pasa se dice por qué y no se deja el control encendido mintiendo.
   */
  const alternarCerca = async () => {
    setAvisoGps(null);
    if (cerca) { setCerca(false); return; }
    const pos = await getCurrentGqPosition();
    if (!pos) {
      setAvisoGps('No he podido situarte. La ubicación sólo funciona dentro de Guinea Ecuatorial; puedes elegir una ciudad y buscar igual.');
      return;
    }
    setMiPos(pos);
    setCerca(true);
  };

  /**
   * La lista que se pinta: con distancia si se sabe, y ordenada por cercanía cuando «Cerca de mí»
   * está encendido. El orden se hace sobre la página recibida —ordenar en el servidor exige `sort`,
   * que no existe— y por eso el control sólo promete «lo más cerca de esta página».
   */
  const filas = useMemo(() => {
    const hoteles = datos?.hotels ?? [];
    const conKm = hoteles.map((h) => {
      const km = miPos && h.hotel.lat != null && h.hotel.lng != null
        ? havKm(miPos, [h.hotel.lng, h.hotel.lat])
        : null;
      return { h, km };
    });
    if (cerca) conKm.sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
    return conKm;
  }, [datos, miPos, cerca]);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* ── Barra propia (el Stack va sin cabecera nativa) ── */}
      <View style={[styles.barra, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Volver"
          style={styles.volver}
        >
          <Text style={[styles.volverTxt, { color: colors.textPrimary }]}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.titulo, { color: colors.textPrimary }]}>Alojamiento</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            {ciudad ? `En ${ciudad}` : 'Guinea Ecuatorial'}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/lifebook-hotel-reservas' as never)}
          accessibilityRole="button"
          accessibilityLabel="Mis reservas"
          style={[styles.misReservas, { borderColor: colors.border }]}
        >
          <Text style={[styles.misReservasTxt, { color: colors.text.primary }]}>Mis reservas</Text>
        </Pressable>
      </View>

      <FlatList
        data={filas}
        keyExtractor={(item) => item.h.hotel.id}
        contentContainerStyle={{ padding: espaciado.e14, paddingBottom: insets.bottom + 28, gap: espaciado.e12 }}
        refreshControl={
          <RefreshControl
            refreshing={refrescando}
            onRefresh={() => { setRefrescando(true); void buscar(true); }}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: espaciado.e12 }}>

            {/* ─────────── EL BUSCADOR: una tarjeta, tres filas, un botón ─────────── */}
            <View style={[styles.panel, { borderColor: colors.border, backgroundColor: colors.card }]}>

              {/* fila 1 · destino */}
              <Pressable
                onPress={() => setHojaCiudad(true)}
                accessibilityRole="button"
                accessibilityLabel={`Destino: ${ciudad || 'todas las ciudades'}. Toca para cambiar`}
                style={[styles.filaDestino, { borderBottomColor: colors.border }]}
              >
                <Search size={17} color={colors.textSecondary} />
                <Text style={[styles.destino, { color: colors.textPrimary }]} numberOfLines={1}>
                  {ciudad || 'Todas las ciudades'}
                </Text>
                <ChevronDown size={17} color={colors.textSecondary} />
              </Pressable>

              {/* fila 2 · cuándo y cuántos, en una línea de cuatro celdas */}
              <View style={styles.celdas}>
                <Pressable
                  onPress={abrirFechas}
                  accessibilityRole="button"
                  accessibilityLabel={checkIn ? `Llegada ${shortDate(checkIn, true)}. Toca para cambiar` : 'Elegir la fecha de llegada'}
                  style={styles.celda}
                >
                  <Text style={[styles.celdaEtq, { color: colors.textSecondary }]}>Llegada</Text>
                  <Text style={[styles.celdaVal, { color: colors.textPrimary }]}>
                    {checkIn ? shortDate(checkIn) : '—'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={abrirFechas}
                  accessibilityRole="button"
                  accessibilityLabel={checkOut ? `Salida ${shortDate(checkOut, true)}. Toca para cambiar` : 'Elegir la fecha de salida'}
                  style={[styles.celda, { borderLeftWidth: trazo.fino, borderLeftColor: colors.border }]}
                >
                  <Text style={[styles.celdaEtq, { color: colors.textSecondary }]}>Salida</Text>
                  <Text style={[styles.celdaVal, { color: colors.textPrimary }]}>
                    {checkOut ? shortDate(checkOut) : '—'}
                  </Text>
                </Pressable>

                <Pressable
                  onPress={abrirFechas}
                  accessibilityRole="button"
                  accessibilityLabel={noches > 0 ? `${noches} noche(s). Toca para cambiar` : 'Elegir cuántas noches'}
                  style={[styles.celda, { borderLeftWidth: trazo.fino, borderLeftColor: colors.border }]}
                >
                  <Text style={[styles.celdaEtq, { color: colors.textSecondary }]}>Noches</Text>
                  <Text style={[styles.celdaVal, { color: colors.textPrimary }]}>{noches > 0 ? noches : '—'}</Text>
                </Pressable>

                <Pressable
                  onPress={() => setHojaQuien(true)}
                  accessibilityRole="button"
                  accessibilityLabel={`${habitaciones} habitación(es), ${huespedes} huésped(es). Toca para cambiar`}
                  style={[styles.celda, { borderLeftWidth: trazo.fino, borderLeftColor: colors.border }]}
                >
                  <Text style={[styles.celdaEtq, { color: colors.textSecondary }]}>Hab · huésp</Text>
                  <Text style={[styles.celdaVal, { color: colors.textPrimary }]}>
                    {habitaciones} · {huespedes}
                  </Text>
                </Pressable>
              </View>

              {/* fila 3 · el botón */}
              <View style={styles.ctaCaja}>
                <Pressable
                  onPress={() => setBuscando((n) => n + 1)}
                  accessibilityRole="button"
                  accessibilityLabel="Buscar alojamiento"
                  style={({ pressed }) => [styles.cta, {
                    backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1,
                  }]}
                >
                  <Text style={styles.ctaTxt}>Buscar alojamiento</Text>
                </Pressable>
              </View>
            </View>

            {/* ─────────── CONTROLES: sólo lo que el servidor sabe hacer ─────────── */}
            <View style={styles.filtros}>
              <Pressable
                onPress={() => void alternarCerca()}
                accessibilityRole="button"
                accessibilityState={{ selected: cerca }}
                accessibilityLabel={cerca ? 'Dejar de ordenar por cercanía' : 'Ordenar por cercanía a mí'}
                style={[styles.chip, {
                  borderColor: cerca ? colors.primary : colors.border,
                  backgroundColor: cerca ? alpha(colors.primary, 0.12) : colors.surface,
                }]}
              >
                <Text style={[styles.chipTxt, { color: colors.textPrimary }]}>Cerca de mí</Text>
              </Pressable>

              <Pressable
                onPress={() => setHojaPrecio(true)}
                accessibilityRole="button"
                accessibilityLabel={hayPrecio ? 'Cambiar el filtro de precio' : 'Filtrar por precio'}
                style={[styles.chip, {
                  borderColor: hayPrecio ? colors.primary : colors.border,
                  backgroundColor: hayPrecio ? alpha(colors.primary, 0.12) : colors.surface,
                }]}
              >
                <Text style={[styles.chipTxt, { color: colors.textPrimary }]}>
                  {hayPrecio ? 'Precio puesto' : 'Precio'}
                </Text>
              </Pressable>

              {hayPrecio ? (
                <Pressable
                  onPress={() => { setPrecio({}); setBuscando((n) => n + 1); }}
                  accessibilityRole="button"
                  accessibilityLabel="Quitar el filtro de precio"
                  style={[styles.chip, { borderColor: colors.border, backgroundColor: colors.surface }]}
                >
                  <Text style={[styles.chipTxt, { color: colors.textSecondary }]}>Quitar</Text>
                </Pressable>
              ) : null}

              <Text style={[styles.porNoche, { color: colors.textSecondary }]}>por noche</Text>
            </View>

            {avisoGps ? (
              <Text style={[styles.aviso, { color: colors.text.secondary }]}>{avisoGps}</Text>
            ) : null}

            {/* ─────────── Estado de la búsqueda ─────────── */}
            {cargando ? (
              <View style={styles.centro}>
                <ActivityIndicator color={colors.text.primary} />
                <Text style={[styles.aviso, { color: colors.textSecondary }]}>Buscando disponibilidad…</Text>
              </View>
            ) : error ? (
              <View style={[styles.error, { borderColor: colors.danger, backgroundColor: alpha(colors.danger, 0.06) }]}>
                <Text style={[styles.errorTxt, { color: colors.text.danger }]}>{error}</Text>
                <Pressable onPress={() => void buscar()} accessibilityRole="button" accessibilityLabel="Reintentar">
                  <Text style={[styles.enlace, { color: colors.text.primary }]}>Reintentar</Text>
                </Pressable>
              </View>
            ) : (datos?.hotels.length ?? 0) === 0 ? (
              <View style={[styles.error, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text style={[styles.aviso, { color: colors.textPrimary }]}>
                  No hay alojamiento con esos datos.
                </Text>
                <Text style={[styles.aviso, { color: colors.textSecondary }]}>
                  Prueba otras fechas, otra ciudad o menos habitaciones. Los hoteles sin hueco sí
                  aparecen marcados como «sin disponibilidad», así que puedes ajustar el rango.
                </Text>
              </View>
            ) : (
              <View style={{ gap: espaciado.e8 }}>
                <Text style={[styles.aviso, { color: colors.textSecondary }]}>
                  {filas.length} alojamiento(s)
                  {listo ? ` para ${noches} noche(s) · ${huespedes} huésped(es)` : ' · elige fechas para ver el precio de la estancia'}
                  {hayPrecio ? ' · con el precio puesto' : ''}
                </Text>
                <Pressable
                  onPress={() => router.push({
                    pathname: '/lifebook-hotel-resultados',
                    params: {
                      ...(ciudad ? { city: ciudad } : {}),
                      ...(checkIn ? { checkIn } : {}),
                      ...(checkOut ? { checkOut } : {}),
                      guests: String(huespedes),
                      units: String(habitaciones),
                    },
                  } as never)}
                  accessibilityRole="button"
                  accessibilityLabel="Ver la lista completa de resultados"
                  style={[styles.verTodos, { borderColor: colors.primary }]}
                >
                  <Text style={[styles.verTodosTxt, { color: colors.text.primary }]}>
                    Ver la lista completa
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={null}
        renderItem={({ item }) => (
          <HotelResultCard
            datos={item.h}
            habitaciones={habitaciones}
            listo={listo}
            distanciaKm={item.km}
            onAbrir={() => router.push({
              pathname: '/lifebook-hotel-detalle',
              params: {
                id: item.h.hotel.id,
                ...(checkIn ? { checkIn } : {}),
                ...(checkOut ? { checkOut } : {}),
                guests: String(huespedes),
                units: String(habitaciones),
              },
            } as never)}
          />
        )}
      />

      <HotelCitySheet
        visible={hojaCiudad}
        onClose={() => setHojaCiudad(false)}
        ciudad={ciudad}
        onElegir={setCiudad}
      />
      <HotelGuestsSheet
        visible={hojaQuien}
        onClose={() => setHojaQuien(false)}
        huespedes={huespedes}
        habitaciones={habitaciones}
        onHuespedes={setHuespedes}
        onHabitaciones={setHabitaciones}
      />
      <HotelPriceSheet
        visible={hojaPrecio}
        onClose={() => setHojaPrecio(false)}
        min={precio.min}
        max={precio.max}
        onAplicar={(min, max) => { setPrecio({ min, max }); setBuscando((n) => n + 1); }}
        onQuitar={() => { setPrecio({}); setBuscando((n) => n + 1); }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  barra: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e8,
    paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10, borderBottomWidth: trazo.fino,
  },
  volver: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  volverTxt: { fontSize: tipografia.display, fontWeight: peso.fuerte, lineHeight: 28 },
  titulo: { fontSize: tipografia.subCabecera, fontWeight: peso.maximo },
  sub: { fontSize: tipografia.caption },
  misReservas: { borderWidth: trazo.fino, borderRadius: radios.md, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e7 },
  misReservasTxt: { fontSize: tipografia.caption, fontWeight: peso.fuerte },

  // El buscador: una sola pieza con borde, y dentro las tres filas.
  panel: { borderWidth: trazo.fino, borderRadius: radios.lg, overflow: 'hidden' },
  filaDestino: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e8,
    paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e12, borderBottomWidth: trazo.fino,
  },
  destino: { flex: 1, fontSize: tipografia.cuerpo, fontWeight: peso.maximo },
  celdas: { flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e10 },
  celda: { flex: 1, minWidth: 0, paddingHorizontal: espaciado.e2 },
  celdaEtq: { fontSize: tipografia.micro, fontWeight: peso.medio },
  celdaVal: { fontSize: tipografia.body, fontWeight: peso.maximo, marginTop: espaciado.e2 },
  ctaCaja: { paddingHorizontal: espaciado.e12, paddingBottom: espaciado.e12 },
  cta: { borderRadius: radios.md, paddingVertical: espaciado.e13, alignItems: 'center' },
  ctaTxt: { color: brand.white, fontSize: tipografia.body, fontWeight: peso.maximo },

  // Controles: cerca y precio. Sin orden, porque el servidor no la admite.
  filtros: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 },
  chip: {
    borderWidth: trazo.fino, borderRadius: radios.full, paddingHorizontal: espaciado.e13,
    minHeight: 44, justifyContent: 'center',
  },
  chipTxt: { fontSize: tipografia.caption, fontWeight: peso.maximo },
  porNoche: { fontSize: tipografia.caption, marginLeft: 'auto' },

  aviso: { fontSize: tipografia.caption, lineHeight: 18 },
  enlace: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  verTodos: { borderWidth: trazo.fino, borderRadius: radios.md, paddingVertical: espaciado.e9, alignItems: 'center' },
  verTodosTxt: { fontSize: tipografia.body, fontWeight: peso.maximo },
  centro: { alignItems: 'center', gap: espaciado.e8, paddingVertical: espaciado.e18 },
  error: { borderWidth: trazo.fino, borderRadius: radios.campo, padding: espaciado.e12, gap: espaciado.e6 },
  errorTxt: { fontSize: tipografia.body, fontWeight: peso.medio },
});
