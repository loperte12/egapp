/**
 * lifebook-hotel — BUSCAR ALOJAMIENTO y reservar (módulo hotelero, Parte 42).
 *
 * Lo que corrige respecto al boceto que se evaluó:
 *   · **Las fechas se ELIGEN, no se teclean**: calendario de verdad (mes navegable,
 *     precio por noche, días cerrados/llenos no seleccionables y estancia mínima).
 *   · **No hay pasos previos obligatorios**: fechas y huéspedes primero (es lo que
 *     decide el precio), y solo después la habitación. Nada de teclear `2026-07-01`.
 *   · Ruta PLANA con prefijo (`/lifebook-hotel*`), como el resto de Life Book: no
 *     se inventa un grupo `(hotel)` que colisionaría con `/search` y `/results`.
 *   · Área segura reservada (barra propia con `useSafeAreaInsets`), errores visibles
 *     con «Reintentar» (nunca un spinner mudo) y estado de carga por bloque.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, altura, brand, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { CalendarPicker, type CalendarDay } from '../components/CalendarPicker';
import { HotelResultCard } from '../components/HotelResultCard';
import { hotelApi, type HotelRoom, type HotelSearchResult } from '../api/hotel';
import { ApiError } from '../api/httpClient';
import { addDaysIso, nightsBetween, shortDate, todayIso, xaf } from '../utils/datetime';

const CIUDADES = ['Malabo', 'Bata', 'Mongomo', 'Ebebiyín', 'Oyala', 'Annobón'];
/** El servidor acepta hasta 92 noches por reserva (tope de calendario). */
const MAX_NOCHES = 92;

export default function LifebookHotelScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  // Se puede llegar con fechas ya elegidas (desde una ficha o desde «mis reservas»).
  const params = useLocalSearchParams<{ roomTypeId?: string; checkIn?: string; checkOut?: string; city?: string }>();

  const hoy = todayIso();
  const [ciudad, setCiudad] = useState<string>(params.city ?? '');
  const [checkIn, setCheckIn] = useState<string | null>(params.checkIn ?? null);
  const [checkOut, setCheckOut] = useState<string | null>(params.checkOut ?? null);
  const [huespedes, setHuespedes] = useState(2);
  const [habitaciones, setHabitaciones] = useState(1);
  const [modo, setModo] = useState<'noches' | 'rango'>('noches');
  const [nochesPedidas, setNochesPedidas] = useState(1);

  /**
   * Al volver de la pantalla de fechas (`/lifebook-hotel-fechas`), los parámetros traen
   * la selección: se sincroniza al recuperar el foco para que el buscador muestre las
   * fechas elegidas sin recargar nada a mano.
   */
  useFocusEffect(
    useCallback(() => {
      if (params.checkIn) setCheckIn(params.checkIn);
      if (params.checkOut) setCheckOut(params.checkOut);
    }, [params.checkIn, params.checkOut]),
  );

  const [datos, setDatos] = useState<HotelSearchResult | null>(null);
  const [cargando, setCargando] = useState(false);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Disponibilidad de la habitación de referencia: da el PRECIO POR NOCHE del
  // calendario antes de elegir hotel (es lo que hace útil el calendario).
  // Los precios del calendario se cargan en la pantalla de fechas
  // (`/lifebook-hotel-fechas`), que es donde vive el calendario.

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
  }, [ciudad, checkIn, checkOut, huespedes, habitaciones]);

  // Primera búsqueda al entrar (y cuando cambian fechas/habitaciones: el precio
  // depende de ellas, así que no se deja el resultado viejo en pantalla).
  useEffect(() => { void buscar(); }, [buscar]);

  // Precio por noche del calendario: se pide la disponibilidad de la habitación más
  // barata de los resultados (una sola petición para los 92 días).
  //
  // ⚠️ ANTES ESTO ESTABA ROTO: se exigía `(r.freeUnits ?? 1) >= habitaciones`, y sin
  const noches = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const listo = !!checkIn && !!checkOut && noches > 0;

  /**
   * Contador de días del buscador: solo mueve la SALIDA a partir de la llegada ya elegida
   * (los mínimos por fecha los aplica la pantalla de fechas, que es la que tiene el
   * calendario delante).
   */
  const ajustarNoches = useCallback((delta: number) => {
    setNochesPedidas((prev) => {
      const siguiente = Math.min(MAX_NOCHES, Math.max(1, prev + delta));
      if (checkIn) setCheckOut(addDaysIso(checkIn, siguiente));
      return siguiente;
    });
  }, [checkIn]);

  // Si las fechas cambian por fuera (al volver de la pantalla de fechas), el contador se
  // sincroniza con lo elegido.
  useEffect(() => {
    if (checkIn && checkOut) {
      const n = nightsBetween(checkIn, checkOut);
      if (n > 0 && n !== nochesPedidas) setNochesPedidas(n);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkIn, checkOut]);

  const abrirHotel = (shopId: string) => {
    router.push({
      pathname: '/lifebook-hotel-detalle',
      params: {
        id: shopId,
        ...(checkIn ? { checkIn } : {}),
        ...(checkOut ? { checkOut } : {}),
        guests: String(huespedes),
        units: String(habitaciones),
      },
    } as never);
  };

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
            Reserva por noches · señal y pago al llegar
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/lifebook-hotel-reservas' as never)}
          accessibilityRole="button"
          accessibilityLabel="Mis reservas"
          style={[styles.misReservas, { borderColor: colors.border }]}
        >
          <Text style={[styles.misReservasTxt, { color: colors.primary }]}>Mis reservas</Text>
        </Pressable>
        {/*
          AQUÍ ESTABA EL BOTÓN «MI HOTEL» (el panel del hotelero) Y SE HA QUITADO.
          Esta pantalla es la del HUÉSPED: quien busca alojamiento. Meter aquí la puerta del
          comerciante mezclaba los dos papeles —el que reserva y el que recibe— en el mismo
          sitio, y el hotelero no tenía un acceso PROPIO, lo encontraba de casualidad dentro
          del buscador. Su acceso vive ahora en su cuenta: Perfil → «Tu comercio».
        */}
      </View>

      <FlatList
        data={datos?.hotels ?? []}
        keyExtractor={(item) => item.hotel.id}
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
            {/* ── Dónde ── */}
            <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.etiqueta, { color: colors.textSecondary }]}>DÓNDE</Text>
              <TextInput
                value={ciudad}
                onChangeText={setCiudad}
                placeholder="Ciudad (Malabo, Bata…)"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
                accessibilityLabel="Ciudad"
                returnKeyType="search"
                onSubmitEditing={() => void buscar()}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: espaciado.e8, paddingTop: espaciado.e8 }}>
                <Chip activo={ciudad === ''} texto="Todas" onPress={() => setCiudad('')} />
                {CIUDADES.map((c) => (
                  <Chip key={c} activo={ciudad === c} texto={c} onPress={() => setCiudad(c)} />
                ))}
              </ScrollView>
            </View>

            {/* ── Cuándo: resumen + puerta a la pantalla de fechas ── */}
            <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <View style={styles.filaCabecera}>
                <Text style={[styles.etiqueta, { color: colors.textSecondary }]}>CUÁNDO</Text>
              </View>

              <View style={styles.fechas}>
                <View style={[styles.fechaCaja, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <Text style={[styles.fechaEtq, { color: colors.textSecondary }]}>Entrada</Text>
                  <Text style={[styles.fechaVal, { color: colors.textPrimary }]}>
                    {checkIn ? shortDate(checkIn, true) : '—'}
                  </Text>
                </View>
                <View style={[styles.fechaCaja, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                  <Text style={[styles.fechaEtq, { color: colors.textSecondary }]}>Salida</Text>
                  <Text style={[styles.fechaVal, { color: colors.textPrimary }]}>
                    {checkOut ? shortDate(checkOut, true) : '—'}
                  </Text>
                </View>
              </View>

              {/* El contador de DÍAS: antes la estancia solo se podía fijar con dos toques
                  en el calendario y no había forma de decir «3 noches» de una vez. */}
              <View style={styles.diasFila}>
                <Text style={[styles.diasEtq, { color: colors.textPrimary }]}>
                  {nochesPedidas === 1 ? '1 noche' : `${nochesPedidas} noches`}
                  <Text style={{ color: colors.textSecondary }}>
                    {checkIn ? ` · ${shortDate(checkIn)} → ${shortDate(addDaysIso(checkIn, nochesPedidas))}` : ''}
                  </Text>
                </Text>
                <View style={styles.diasBtns}>
                  <Pressable
                    onPress={() => ajustarNoches(-1)}
                    disabled={nochesPedidas <= 1}
                    accessibilityRole="button"
                    accessibilityLabel="Quitar una noche"
                    accessibilityState={{ disabled: nochesPedidas <= 1 }}
                    style={[styles.diasBtn, {
                      borderColor: colors.border, backgroundColor: colors.surface,
                      opacity: nochesPedidas <= 1 ? 0.35 : 1,
                    }]}
                  >
                    <Text style={[styles.diasBtnTxt, { color: colors.textPrimary }]}>−</Text>
                  </Pressable>
                  <Text style={[styles.diasVal, { color: colors.textPrimary }]}>{nochesPedidas}</Text>
                  <Pressable
                    onPress={() => ajustarNoches(1)}
                    disabled={nochesPedidas >= MAX_NOCHES}
                    accessibilityRole="button"
                    accessibilityLabel="Añadir una noche"
                    accessibilityState={{ disabled: nochesPedidas >= MAX_NOCHES }}
                    style={[styles.diasBtn, {
                      borderColor: colors.border, backgroundColor: colors.surface,
                      opacity: nochesPedidas >= MAX_NOCHES ? 0.35 : 1,
                    }]}
                  >
                    <Text style={[styles.diasBtnTxt, { color: colors.textPrimary }]}>+</Text>
                  </Pressable>
                </View>
              </View>
              {!checkIn ? (
                <Text style={[styles.aviso, { color: colors.textSecondary }]}>
                  Elige el día de llegada en el calendario (abajo).
                </Text>
              ) : null}

              {/* El calendario YA NO se mete aquí: con el contador de días y todo lo de
                  arriba, la rejilla caía por debajo de la barra del sistema y **los días
                  no se podían tocar** (medido: celdas hasta y≈2260). Ahora se elige en su
                  propia pantalla, con el calendario a pantalla completa. */}
              <Pressable
                onPress={() => router.push({
                  pathname: '/lifebook-hotel-fechas',
                  params: {
                    ...(ciudad ? { city: ciudad } : {}),
                    ...(checkIn ? { checkIn } : {}),
                    ...(checkOut ? { checkOut } : {}),
                    guests: String(huespedes),
                    units: String(habitaciones),
                    modo,
                  },
                } as never)}
                accessibilityRole="button"
                accessibilityLabel={checkIn && checkOut
                  ? `Cambiar las fechas. Ahora: ${shortDate(checkIn, true)} a ${shortDate(checkOut, true)}`
                  : 'Elegir las fechas de la estancia'}
                style={[styles.elegirFechas, { borderColor: colors.primary, backgroundColor: alpha(colors.primary, 0.06) }]}
              >
                <Text style={[styles.elegirFechasTxt, { color: colors.primary }]}>
                  {checkIn && checkOut
                    ? `Cambiar fechas · ${shortDate(checkIn, true)} → ${shortDate(checkOut, true)}`
                    : 'Elegir las fechas y los días'}
                </Text>
              </Pressable>
            </View>

            {/* ── Quién viaja ── */}
            <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.etiqueta, { color: colors.textSecondary }]}>QUIÉN Y CUÁNTAS HABITACIONES</Text>
              <Contador
                etiqueta="Huéspedes" valor={huespedes} min={1} max={20}
                onCambio={setHuespedes}
              />
              <Contador
                etiqueta="Habitaciones" valor={habitaciones} min={1} max={10}
                onCambio={setHabitaciones}
              />
            </View>

            {/* ── Estado de la búsqueda ── */}
            {cargando ? (
              <View style={styles.centro}>
                <ActivityIndicator color={colors.primary} />
                <Text style={[styles.aviso, { color: colors.textSecondary }]}>Buscando disponibilidad…</Text>
              </View>
            ) : error ? (
              <View style={[styles.error, { borderColor: colors.danger, backgroundColor: alpha(colors.danger, 0.06) }]}>
                <Text style={[styles.errorTxt, { color: colors.danger }]}>{error}</Text>
                <Pressable onPress={() => void buscar()} accessibilityRole="button" accessibilityLabel="Reintentar">
                  <Text style={[styles.enlace, { color: colors.primary }]}>Reintentar</Text>
                </Pressable>
              </View>
            ) : listo && (datos?.hotels.length ?? 0) === 0 ? (
              <View style={[styles.error, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text style={[styles.aviso, { color: colors.textPrimary }]}>
                  No hay alojamiento disponible con esos datos.
                </Text>
                <Text style={[styles.aviso, { color: colors.textSecondary }]}>
                  Prueba otras fechas, otra ciudad o menos habitaciones. Los hoteles sin hueco sí
                  aparecen marcados como «sin disponibilidad», así que puedes ajustar el rango.
                </Text>
              </View>
            ) : (
              <View style={{ gap: espaciado.e8 }}>
                <Text style={[styles.aviso, { color: colors.textSecondary }]}>
                  {datos?.hotels.length
                    ? listo
                      ? `${datos.hotels.length} alojamiento(s) para ${noches} noche(s) · ${huespedes} huésped(es)`
                      : `${datos.hotels.length} alojamiento(s) en ${datos.city || 'Guinea Ecuatorial'} · elige fechas para ver el precio`
                    : 'Elige fechas y pulsa buscar.'}
                </Text>
                {(datos?.hotels.length ?? 0) > 0 ? (
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
                    accessibilityLabel="Ver todos los resultados"
                    style={[styles.verTodos, { borderColor: colors.primary }]}
                  >
                    <Text style={[styles.verTodosTxt, { color: colors.primary }]}>
                      Ver la lista de resultados
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            )}
          </View>
        }
        ListEmptyComponent={null}
        renderItem={({ item }) => (
          <HotelResultCard
            datos={item}
            habitaciones={habitaciones}
            listo={listo}
            onAbrir={() => abrirHotel(item.hotel.id)}
            onReservar={(room) => abrirHabitacion(room, item.hotel.id, item.hotel.name)}
          />
        )}
      />
    </View>
  );
}

// ─────────────────────────── piezas de la pantalla ──────────────────────────

function Chip({ activo, texto, onPress }: { activo: boolean; texto: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      accessibilityLabel={texto}
      style={[styles.chip, {
        borderColor: activo ? colors.primary : colors.border,
        backgroundColor: activo ? alpha(colors.primary, 0.1) : colors.surface,
      }]}
    >
      <Text style={[styles.chipTxt, { color: activo ? colors.primary : colors.textSecondary }]}>{texto}</Text>
    </Pressable>
  );
}

function Contador({
  etiqueta, valor, min, max, onCambio,
}: { etiqueta: string; valor: number; min: number; max: number; onCambio: (v: number) => void }) {
  const { colors } = useTheme();
  const boton = (texto: string, delta: number, deshabilitado: boolean) => (
    <Pressable
      onPress={() => !deshabilitado && onCambio(Math.min(max, Math.max(min, valor + delta)))}
      disabled={deshabilitado}
      accessibilityRole="button"
      accessibilityLabel={`${delta > 0 ? 'Añadir' : 'Quitar'} ${etiqueta}`}
      accessibilityState={{ disabled: deshabilitado }}
      style={[styles.contBtn, {
        borderColor: colors.border, opacity: deshabilitado ? 0.35 : 1, backgroundColor: colors.surface,
      }]}
    >
      <Text style={[styles.contBtnTxt, { color: colors.textPrimary }]}>{texto}</Text>
    </Pressable>
  );
  return (
    <View style={styles.contFila}>
      <Text style={[styles.contEtq, { color: colors.textPrimary }]}>{etiqueta}</Text>
      <View style={styles.contAcciones}>
        {boton('−', -1, valor <= min)}
        <Text style={[styles.contVal, { color: colors.textPrimary }]}>{valor}</Text>
        {boton('+', 1, valor >= max)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  // Selector de modo (llegada + días · entrada y salida) y contador de noches.
  modoBtn: { flex: 1, borderWidth: trazo.fino, borderRadius: radios.md, paddingVertical: espaciado.e8, alignItems: 'center' },
  modoTxt: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  elegirFechas: { marginTop: espaciado.e10, borderWidth: trazo.fino, borderRadius: radios.md, paddingVertical: espaciado.e11, alignItems: 'center' },
  elegirFechasTxt: { fontSize: tipografia.body, fontWeight: peso.maximo },
  diasFila: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: espaciado.e10, marginTop: espaciado.e10,
  },
  diasEtq: { fontSize: tipografia.body, fontWeight: peso.fuerte, flex: 1 },
  diasBtns: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10 },
  diasBtn: { width: 36, height: 36, borderWidth: trazo.fino, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  diasBtnTxt: { fontSize: 19, fontWeight: peso.maximo, lineHeight: 21 },
  diasVal: { fontSize: tipografia.subtitle, fontWeight: peso.maximo, minWidth: 24, textAlign: 'center' },
  barra: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e8,
    paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10, borderBottomWidth: trazo.fino,
  },
  volver: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  volverTxt: { fontSize: 26, fontWeight: peso.fuerte, lineHeight: 28 },
  titulo: { fontSize: 17, fontWeight: peso.maximo },
  sub: { fontSize: tipografia.caption },
  misReservas: { borderWidth: trazo.fino, borderRadius: radios.md, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e7 },
  misReservasTxt: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  verTodos: { borderWidth: trazo.fino, borderRadius: radios.md, paddingVertical: espaciado.e9, alignItems: 'center' },
  verTodosTxt: { fontSize: tipografia.body, fontWeight: peso.maximo },
  bloque: { borderWidth: trazo.fino, borderRadius: radios.lg, padding: espaciado.e12, gap: espaciado.e2 },
  filaCabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  etiqueta: { fontSize: 10.5, fontWeight: peso.maximo, letterSpacing: 0.6 },
  enlace: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  input: { borderWidth: trazo.fino, borderRadius: radios.md, paddingHorizontal: espaciado.e12, height: altura.punto, fontSize: 14.5, marginTop: espaciado.e6 },
  fechas: { flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e8 },
  fechaCaja: { flex: 1, borderWidth: trazo.fino, borderRadius: radios.md, padding: espaciado.e9 },
  fechaEtq: { fontSize: 10.5, fontWeight: peso.medio },
  fechaVal: { fontSize: tipografia.body, fontWeight: peso.maximo, marginTop: espaciado.e2 },
  chip: { borderWidth: trazo.fino, borderRadius: 20, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e6 },
  chipTxt: { fontSize: tipografia.caption, fontWeight: peso.medio },
  contFila: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: espaciado.e8 },
  contEtq: { fontSize: tipografia.body, fontWeight: peso.medio },
  contAcciones: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10 },
  contBtn: { width: 34, height: 34, borderWidth: trazo.fino, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  contBtnTxt: { fontSize: 18, fontWeight: peso.maximo, lineHeight: 20 },
  contVal: { fontSize: 15, fontWeight: peso.maximo, minWidth: 22, textAlign: 'center' },
  centro: { alignItems: 'center', gap: espaciado.e8, paddingVertical: espaciado.e18 },
  aviso: { fontSize: tipografia.caption },
  error: { borderWidth: trazo.fino, borderRadius: 14, padding: espaciado.e12, gap: espaciado.e6 },
  errorTxt: { fontSize: tipografia.body, fontWeight: peso.medio },
  tarjeta: { borderWidth: trazo.fino, borderRadius: radios.panel, padding: espaciado.e12 },
  tarjetaCab: { flexDirection: 'row', gap: espaciado.e10 },
  tarjetaTitulo: { fontSize: 15.5, fontWeight: peso.maximo },
  tarjetaSub: { fontSize: tipografia.caption, marginTop: espaciado.e2 },
  precio: { fontSize: 15, fontWeight: peso.maximo },
  precioSub: { fontSize: 10.5 },
  habitacion: { borderWidth: trazo.fino, borderRadius: 14, padding: espaciado.e10, flexDirection: 'row', gap: espaciado.e10, alignItems: 'center' },
  habNombre: { fontSize: tipografia.body, fontWeight: peso.maximo },
  habDatos: { fontSize: tipografia.micro, marginTop: espaciado.e2 },
  habTotal: { fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e4 },
  habLibre: { fontSize: tipografia.micro, fontWeight: peso.fuerte },
  reservarBtn: { borderRadius: 10, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7 },
  reservarTxt: { color: brand.white, fontSize: tipografia.caption, fontWeight: peso.maximo },
});
