/**
 * HotelDateRange — LA BARRA DE FECHAS DE LA FICHA, y el calendario que abre.
 *
 * ── POR QUÉ EXISTE (27-sep-2026, `docs/UI-HOTEL-PLAN-MEJORA.md` §11) ──────────────────────────
 *
 * El calendario vivía DENTRO del acordeón de cada tipo de habitación (`lifebook-hotel-detalle.tsx`)
 * y se abría solo, en la primera. Medido en el móvil con `uiautomator`: tras desplazar una pantalla
 * y ver por fin el primer precio, **el desplazamiento siguiente era el calendario entero** — la
 * rejilla de días ocupaba la pantalla completa antes de que el huésped viera cuánto cuesta el
 * segundo tipo. Eso no es un calendario mal puesto: es el calendario **en el sitio equivocado**.
 *
 * Aquí las fechas son lo que son en la referencia (Meituan): **una barra, una vez, siempre a la
 * vista**. Se eligen los días en un sitio y todos los precios de la lista hablan de los mismos días.
 *
 * ── DE DÓNDE SALE LA DISPONIBILIDAD, Y POR QUÉ ASÍ ───────────────────────────────────────────
 *
 * La barra es del ALOJAMIENTO, no de una habitación, así que un solo calendario no puede decir la
 * verdad: la habitación 2 puede estar llena y la 5 libre la misma noche. La ficha recibe las
 * habitaciones **sin disponibilidad** (verificado contra el servidor: `freeUnits` viene `null` fuera
 * de la búsqueda con fechas) y el calendario se pide por tipo.
 *
 * La solución es **agregar**: se piden los calendarios de los tipos activos **en paralelo y solo al
 * abrir el calendario** —nunca al abrir la ficha— y de cada noche se queda lo que es cierto para el
 * alojamiento entero:
 *
 *   · **libre** si AL MENOS UN tipo tiene hueco (si no, no habría nada que reservar esa noche);
 *   · **cerrada** solo si TODOS los tipos la tienen cerrada;
 *   · el **precio más bajo** de los tipos con hueco, que es lo que significa «desde» — el mismo
 *     sentido que tiene el precio de la tarjeta de un alojamiento.
 *
 * El tope de `MAX_CALENDARIOS` no es decoración: sin él, un alojamiento de cuarenta tipos dispara
 * cuarenta peticiones al abrir el calendario. Con el tope, la disponibilidad es la de los primeros
 * tipos, y eso es una aproximación **a la baja** (puede decir «lleno» con algún tipo libre más allá
 * del tope) y nunca al alza: no promete una noche que no existe.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { altura, espaciado, peso, radios, tipografia, trazo, trazoIcono, useTheme } from '@egrouteplan/ui-kit';
import { CalendarDays } from 'lucide-react-native';
import { CalendarPicker, type CalendarDay } from '../CalendarPicker';
import { Sheet, SheetHeader } from '../lifebook/ui/Sheet';
import { hotelApi, type HotelRoom } from '../../api/hotel';
import { addDaysIso, isWeekendNight, shortDate, todayIso } from '../../utils/datetime';

/** El mismo horizonte que usa la ficha: 92 días, que es el máximo que acepta el servidor. */
const MAX_NOCHES = 92;
/** Cuántos tipos se consultan para componer la disponibilidad del alojamiento. */
const MAX_CALENDARIOS = 12;

/**
 * Junta los calendarios de varios tipos en uno solo del alojamiento.
 *
 * Se recorre por FECHA y no por lista: una fecha que solo exista en el calendario de un tipo tiene
 * que salir igual, porque para el huésped la pregunta es «¿puedo dormir esa noche aquí?», no «¿qué
 * dice el tipo 3?».
 */
function agregar(listas: CalendarDay[][]): CalendarDay[] {
  const porFecha = new Map<string, CalendarDay[]>();
  for (const lista of listas) {
    for (const d of lista) {
      if (!d?.date) continue;
      const actual = porFecha.get(d.date);
      if (actual) actual.push(d);
      else porFecha.set(d.date, [d]);
    }
  }
  const salida: CalendarDay[] = [];
  for (const [date, dias] of porFecha) {
    // «Libre» una noche es que haya hueco en alguno. Sin ningún `available` explícito se considera
    // disponible: el servidor solo manda `false` cuando sabe que no hay.
    const libres = dias.filter((d) => d.available !== false && !d.closed);
    const conHueco = libres.length > 0;
    const precios = libres.map((d) => Number(d.priceXaf ?? 0)).filter((p) => p > 0);
    salida.push({
      date,
      // El precio es el más bajo de los tipos con hueco: es lo que significa «desde».
      priceXaf: precios.length ? Math.min(...precios) : Number(dias[0]?.priceXaf ?? 0),
      available: conHueco,
      closed: dias.every((d) => !!d.closed),
      weekend: isWeekendNight(date),
      minNights: libres.length ? Math.min(...libres.map((d) => Number(d.minNights ?? 1) || 1)) : undefined,
    });
  }
  return salida.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function HotelDateBar({
  rooms,
  checkIn,
  checkOut,
  huespedes,
  habitaciones,
  onFechas,
  onOcupacion,
}: {
  rooms: HotelRoom[];
  checkIn: string | null;
  checkOut: string | null;
  huespedes: number;
  habitaciones: number;
  onFechas: (checkIn: string | null, checkOut: string | null) => void;
  onOcupacion: () => void;
}) {
  const { colors } = useTheme();
  const [abierto, setAbierto] = useState(false);
  const [dias, setDias] = useState<CalendarDay[]>([]);
  const [cargando, setCargando] = useState(false);

  // La estancia que vale para TODOS los tipos: la más corta que exige cualquiera, y el tope más
  // bajo. Así no se elige una combinación que después el servidor rechace en la mitad de la lista.
  const { minNoches, maxNoches } = useMemo(() => {
    const activas = rooms.filter((r) => r.isActive !== false);
    if (!activas.length) return { minNoches: 1, maxNoches: MAX_NOCHES };
    return {
      minNoches: Math.max(1, Math.min(...activas.map((r) => Number(r.minNights) || 1))),
      maxNoches: Math.max(1, Math.min(MAX_NOCHES, ...activas.map((r) => Number(r.maxNights) || MAX_NOCHES))),
    };
  }, [rooms]);

  // Los calendarios, SOLO al abrir la hoja: la ficha no paga este coste por existir.
  useEffect(() => {
    if (!abierto) return;
    const activas = rooms.filter((r) => r.isActive !== false).slice(0, MAX_CALENDARIOS);
    if (!activas.length) { setDias([]); return; }
    let vivo = true;
    setCargando(true);
    const desde = todayIso();
    const hasta = addDaysIso(desde, MAX_NOCHES);
    void Promise.all(
      activas.map((r) => hotelApi
        .calendar(r.id, desde, hasta, habitaciones)
        .then((c) => (c.days ?? []) as CalendarDay[])
        .catch(() => [] as CalendarDay[])),
    )
      .then((listas) => { if (vivo) setDias(agregar(listas)); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [abierto, rooms, habitaciones]);

  const noches = checkIn && checkOut
    ? Math.max(0, Math.round((Date.parse(`${checkOut}T00:00:00Z`) - Date.parse(`${checkIn}T00:00:00Z`)) / 86400000))
    : 0;

  return (
    <>
      <View style={[styles.barra, { borderColor: colors.border, backgroundColor: colors.card }]}>
        <Pressable
          onPress={() => setAbierto(true)}
          accessibilityRole="button"
          accessibilityLabel={noches
            ? `Fechas: ${shortDate(checkIn as string, true)} a ${shortDate(checkOut as string, true)}, ${noches} noches. Cambiar`
            : 'Elegir las fechas de la estancia'}
          style={styles.fechas}
        >
          <View style={styles.celda}>
            <Text style={[styles.etq, { color: colors.textSecondary }]}>Llegada</Text>
            <Text style={[styles.valor, { color: checkIn ? colors.textPrimary : colors.textSecondary }]}>
              {checkIn ? shortDate(checkIn, true) : '—'}
            </Text>
          </View>
          <View style={[styles.pastilla, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.pastillaTxt, { color: colors.textPrimary }]}>
              {noches ? `${noches} noche${noches === 1 ? '' : 's'}` : 'noches'}
            </Text>
          </View>
          <View style={styles.celda}>
            <Text style={[styles.etq, { color: colors.textSecondary }]}>Salida</Text>
            <Text style={[styles.valor, { color: checkOut ? colors.textPrimary : colors.textSecondary }]}>
              {checkOut ? shortDate(checkOut, true) : '—'}
            </Text>
          </View>
        </Pressable>

        <View style={[styles.separador, { backgroundColor: colors.border }]} />

        <Pressable
          onPress={onOcupacion}
          accessibilityRole="button"
          accessibilityLabel={`Quién viaja: ${habitaciones} habitaciones, ${huespedes} huéspedes. Cambiar`}
          style={styles.ocupacion}
        >
          <CalendarDays size={14} color={colors.text.secondary} strokeWidth={trazoIcono.base} />
          <Text style={[styles.ocupacionTxt, { color: colors.textPrimary }]}>
            {habitaciones} hab · {huespedes} huésped{huespedes === 1 ? '' : 'es'}
          </Text>
          <Text style={[styles.flecha, { color: colors.textSecondary }]}>›</Text>
        </Pressable>
      </View>

      <Sheet visible={abierto} onClose={() => setAbierto(false)}>
        <SheetHeader title="¿Qué noches?" onClose={() => setAbierto(false)} />
        <Text style={[styles.nota, { color: colors.textSecondary }]}>
          La disponibilidad es la de todo el alojamiento: una noche se puede elegir si le queda hueco
          a alguno de sus tipos de habitación, y el precio que se ve es el más bajo de los que quedan.
        </Text>
        <Text style={[styles.nota, { color: colors.textSecondary }]}>
          Estancia de {minNoches} a {maxNoches} noche{maxNoches === 1 ? '' : 's'}
          {minNoches > 1 ? ' según el tipo de habitación' : ''}.
        </Text>
        {cargando && dias.length === 0 ? (
          <ActivityIndicator color={colors.text.primary} style={{ marginVertical: espaciado.e16 }} />
        ) : (
          <View style={[styles.marco, { backgroundColor: colors.surface, borderRadius: radios.panel }]}>
            <CalendarPicker
              days={dias}
              checkIn={checkIn}
              checkOut={checkOut}
              onChange={(a, b) => { onFechas(a, b); if (a && b) setAbierto(false); }}
              units={habitaciones}
              minNights={minNoches}
              maxNights={maxNoches}
              loading={cargando}
            />
          </View>
        )}
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  barra: { borderWidth: trazo.fino, borderRadius: radios.panel, padding: espaciado.e12, gap: espaciado.e10 },
  fechas: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaciado.e8 },
  celda: { flex: 1, gap: espaciado.e2 },
  etq: { fontSize: tipografia.micro },
  valor: { fontSize: tipografia.fino, fontWeight: peso.maximo },
  pastilla: {
    borderWidth: trazo.fino, borderRadius: radios.chip,
    paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e4,
  },
  pastillaTxt: { fontSize: tipografia.micro, fontWeight: peso.fuerte },
  separador: { height: trazo.fino },
  ocupacion: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, minHeight: altura.punto },
  ocupacionTxt: { flex: 1, fontSize: tipografia.caption, fontWeight: peso.fuerte },
  flecha: { fontSize: tipografia.cuerpo },
  nota: { fontSize: tipografia.micro, marginBottom: espaciado.e6, lineHeight: 15 },
  marco: { padding: espaciado.e4 },
});
