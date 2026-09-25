/**
 * lifebook-hotel-fechas — ELEGIR LAS FECHAS DE LA ESTANCIA, a pantalla completa.
 *
 * Por qué existe esta pantalla (y no el calendario dentro del buscador):
 *   Metido en el buscador, entre la ciudad, los modos, las cajas de fecha, el contador
 *   de noches, la rejilla, la leyenda y los huéspedes, el calendario quedaba tan abajo
 *   que **las últimas filas caían por debajo de la barra de navegación del móvil** y no
 *   se podían tocar: se veían los días pero no se podía elegir la llegada. Medido en el
 *   dispositivo: las celdas terminaban en y≈2260 sobre una pantalla de 2374.
 *
 * Aquí el calendario tiene la pantalla entera, así que todos los días son alcanzables, y
 * el resumen (noches y fechas) va fijo abajo con un botón «Usar estas fechas» que devuelve
 * la selección al buscador.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, altura, brand, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { CalendarPicker, type CalendarDay } from '../components/CalendarPicker';
import { hotelApi, type HotelSearchResult } from '../api/hotel';
import { ApiError } from '../api/httpClient';
import { addDaysIso, nightsBetween, shortDate, todayIso } from '../utils/datetime';

const MAX_NOCHES = 92;

export default function HotelFechasScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const p = useLocalSearchParams<{
    city?: string; checkIn?: string; checkOut?: string; guests?: string; units?: string; modo?: string;
  }>();

  const hoy = todayIso();
  const huespedes = Number(p.guests ?? 2);
  const habitaciones = Number(p.units ?? 1);

  const [modo, setModo] = useState<'noches' | 'rango'>(p.modo === 'rango' ? 'rango' : 'noches');
  const [checkIn, setCheckIn] = useState<string | null>(p.checkIn ?? null);
  const [checkOut, setCheckOut] = useState<string | null>(p.checkOut ?? null);
  const [nochesPedidas, setNochesPedidas] = useState(
    p.checkIn && p.checkOut ? Math.max(1, nightsBetween(p.checkIn, p.checkOut)) : 1,
  );

  const [datos, setDatos] = useState<HotelSearchResult | null>(null);
  const [dias, setDias] = useState<CalendarDay[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Habitación de referencia para los precios del calendario: la más barata del destino.
  // (Sin fechas elegidas NO se exige disponibilidad: pedirla antes de elegir los días era
  // el bug que dejaba todos los días deshabilitados.)
  const habitacionRef = useMemo(() => {
    const lista = datos?.hotels ?? [];
    for (const h of lista) {
      const apta = h.rooms.find((r) => Number(r.freeUnits ?? 0) >= habitaciones) ?? h.rooms[0];
      if (apta) return apta;
    }
    return null;
  }, [datos, habitaciones]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const out = await hotelApi.search({
        city: p.city || undefined,
        guests: huespedes,
        units: habitaciones,
        limit: 20,
      });
      setDatos(out);
      const ref = (out.hotels ?? []).flatMap((h) => h.rooms ?? [])[0];
      if (ref) {
        // OJO con el rango: el servidor acepta **92 noches** y responde
      // `RANGE_TOO_LONG` si se pasa. El rango `[hoy, hoy + 91]` son 92 días justos;
      // `hoy + 92` serían 93 y la pantalla se quedaba con «Como máximo 92 días» y sin
      // calendario (fallo real detectado en el móvil).
      const c = await hotelApi.calendar(ref.id, hoy, addDaysIso(hoy, MAX_NOCHES - 1), habitaciones);
        setDias(c.days ?? []);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron cargar los precios del calendario.');
    } finally {
      setCargando(false);
    }
  }, [p.city, huespedes, habitaciones, hoy]);

  useEffect(() => { void cargar(); }, [cargar]);

  const minNoches = useMemo(() => {
    const base = Number(habitacionRef?.minNights ?? 1);
    const desde = checkIn ?? hoy;
    const hasta = addDaysIso(desde, Math.max(nochesPedidas, 1));
    const delRango = dias
      .filter((d) => d.date >= desde && d.date < hasta)
      .reduce((max, d) => Math.max(max, Number(d.minNights ?? 1)), 1);
    return Math.max(base, delRango);
  }, [habitacionRef?.minNights, dias, checkIn, nochesPedidas, hoy]);

  const fijarLlegada = (iso: string) => {
    setCheckIn(iso);
    setCheckOut(addDaysIso(iso, Math.max(nochesPedidas, minNoches)));
  };

  const ajustarNoches = (delta: number) => {
    const siguiente = Math.min(MAX_NOCHES, Math.max(minNoches, nochesPedidas + delta));
    setNochesPedidas(siguiente);
    if (checkIn) setCheckOut(addDaysIso(checkIn, siguiente));
  };

  const noches = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const listo = !!checkIn && !!checkOut && noches > 0;

  /** Devuelve las fechas al buscador (que las lee de los parámetros al volver). */
  const confirmar = () => {
    router.replace({
      pathname: '/lifebook-hotel',
      params: {
        ...(p.city ? { city: p.city } : {}),
        ...(checkIn ? { checkIn } : {}),
        ...(checkOut ? { checkOut } : {}),
        guests: String(huespedes),
        units: String(habitaciones),
      },
    } as never);
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.barra, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver" style={styles.volver}>
          <Text style={[styles.volverTxt, { color: colors.textPrimary }]}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.titulo, { color: colors.textPrimary }]}>Fechas de la estancia</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
            {p.city ? `${p.city} · ` : ''}{huespedes} huésped(es){habitaciones > 1 ? ` · ${habitaciones} habitaciones` : ''}
          </Text>
        </View>
      </View>

      {cargando ? (
        <View style={styles.centro}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[styles.sub, { color: colors.textSecondary }]}>Cargando precios…</Text>
        </View>
      ) : error ? (
        <View style={[styles.aviso, { borderColor: colors.danger, backgroundColor: alpha(colors.danger, 0.06) }]}>
          <Text style={{ color: colors.danger, fontSize: tipografia.body, fontWeight: peso.medio }}>{error}</Text>
          <Pressable onPress={() => void cargar()} accessibilityRole="button" accessibilityLabel="Reintentar">
            <Text style={[styles.enlace, { color: colors.primary }]}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: espaciado.e14, paddingBottom: insets.bottom + 130, gap: espaciado.e12 }}>
          {/* ── Forma de elegir: llegada + días, o entrada y salida ── */}
          <View style={styles.modos}>
            {(['noches', 'rango'] as const).map((m) => {
              const activo = modo === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setModo(m)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: activo }}
                  accessibilityLabel={m === 'noches' ? 'Elegir llegada y número de días' : 'Elegir entrada y salida'}
                  style={[styles.modoBtn, {
                    borderColor: activo ? colors.primary : colors.border,
                    backgroundColor: activo ? alpha(colors.primary, 0.08) : colors.surface,
                  }]}
                >
                  <Text style={[styles.modoTxt, { color: activo ? colors.primary : colors.textSecondary }]}>
                    {m === 'noches' ? 'Llegada + días' : 'Entrada y salida'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* ── Días: contador que calcula la salida ── */}
          <View style={[styles.diasFila, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.diasEtq, { color: colors.textPrimary }]}>
                {nochesPedidas === 1 ? '1 noche' : `${nochesPedidas} noches`}
              </Text>
              <Text style={[styles.sub, { color: colors.textSecondary }]}>
                {checkIn
                  ? `${shortDate(checkIn, true)} → ${shortDate(addDaysIso(checkIn, nochesPedidas), true)}`
                  : 'Elige el día de llegada abajo'}
              </Text>
            </View>
            <View style={styles.diasBtns}>
              <Pressable
                onPress={() => ajustarNoches(-1)}
                disabled={nochesPedidas <= minNoches}
                accessibilityRole="button"
                accessibilityLabel="Quitar una noche"
                accessibilityState={{ disabled: nochesPedidas <= minNoches }}
                style={[styles.diasBtn, {
                  borderColor: colors.border, backgroundColor: colors.surface,
                  opacity: nochesPedidas <= minNoches ? 0.35 : 1,
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

          {minNoches > 1 ? (
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              Estas fechas piden un mínimo de {minNoches} noches.
            </Text>
          ) : null}

          {/* ── El calendario, con la pantalla para él solo ── */}
          <CalendarPicker
            days={dias}
            checkIn={checkIn}
            checkOut={checkOut}
            arrivalOnly={modo === 'noches'}
            nightsCount={modo === 'noches' ? nochesPedidas : undefined}
            onChange={(a, b) => {
              if (modo === 'noches') {
                if (a) fijarLlegada(a);
                return;
              }
              setCheckIn(a);
              setCheckOut(b);
            }}
            units={habitaciones}
            minNights={minNoches}
            maxNights={MAX_NOCHES}
          />

          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            {habitacionRef
              ? `Precios reales de «${habitacionRef.name}». Cada hotel puede tener su propio calendario.`
              : 'Elige un destino con alojamiento para ver precios.'}
          </Text>
        </ScrollView>
      )}

      {/* ── Barra fija: resumen y confirmación (el botón nunca hay que buscarlo) ── */}
      <View style={[styles.pie, { paddingBottom: insets.bottom + 10, borderTopColor: colors.border, backgroundColor: colors.card }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.pieEtq, { color: colors.textSecondary }]}>
            {listo ? `${noches} noche(s)` : 'Elige las fechas'}
          </Text>
          <Text style={[styles.pieTotal, { color: colors.textPrimary }]}>
            {listo && checkIn && checkOut ? `${shortDate(checkIn)} → ${shortDate(checkOut, true)}` : '—'}
          </Text>
        </View>
        <Pressable
          onPress={confirmar}
          disabled={!listo}
          accessibilityRole="button"
          accessibilityLabel="Confirmar las fechas"
          accessibilityState={{ disabled: !listo }}
          style={[styles.confirmar, { backgroundColor: listo ? colors.primary : colors.border }]}
        >
          <Text style={styles.confirmarTxt}>Usar estas fechas</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  barra: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10, borderBottomWidth: trazo.fino },
  volver: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  volverTxt: { fontSize: 26, fontWeight: peso.fuerte, lineHeight: 28 },
  titulo: { fontSize: 16.5, fontWeight: peso.maximo },
  sub: { fontSize: tipografia.caption },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: espaciado.e8 },
  aviso: { margin: espaciado.e14, borderWidth: trazo.fino, borderRadius: 14, padding: espaciado.e12, gap: espaciado.e6 },
  enlace: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  modos: { flexDirection: 'row', gap: espaciado.e8 },
  modoBtn: { flex: 1, borderWidth: trazo.fino, borderRadius: radios.md, paddingVertical: espaciado.e9, alignItems: 'center' },
  modoTxt: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  diasFila: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, borderWidth: trazo.fino, borderRadius: 14, padding: espaciado.e12 },
  diasEtq: { fontSize: 14.5, fontWeight: peso.maximo },
  diasBtns: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10 },
  diasBtn: { width: 38, height: 38, borderWidth: trazo.fino, borderRadius: radios.nota, alignItems: 'center', justifyContent: 'center' },
  diasBtnTxt: { fontSize: tipografia.title, fontWeight: peso.maximo, lineHeight: 22 },
  diasVal: { fontSize: 17, fontWeight: peso.maximo, minWidth: 26, textAlign: 'center' },
  pie: {
    position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: trazo.fino,
    paddingHorizontal: espaciado.e14, paddingTop: espaciado.e10, flexDirection: 'row', alignItems: 'center', gap: espaciado.e12,
  },
  pieEtq: { fontSize: tipografia.caption },
  pieTotal: { fontSize: 15, fontWeight: peso.maximo },
  confirmar: { minWidth: 170, height: altura.campo, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e14 },
  confirmarTxt: { color: brand.white, fontSize: 15, fontWeight: peso.maximo },
});
