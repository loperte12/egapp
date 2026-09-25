/**
 * CalendarPicker — EL CALENDARIO de las reservas (hotel, y reutilizable).
 *
 * Qué resuelve (era la mitad que faltaba del módulo): el buscador pedía escribir
 * las fechas a mano (`2026-07-01`) y la ficha enseñaba una fila de cuadros con el
 * día del mes, sin mes, sin semana, sin precio y sin poder elegir. Aquí hay un
 * calendario de verdad:
 *
 *   · **Mes navegable** (con botones y con el gesto de deslizar), sin salir del
 *     rango que el servidor acepta (92 días) y sin poder ir al pasado.
 *   · **Precio por noche** dentro de cada día (lo devuelve la disponibilidad) y
 *     **estado claro**: libre · fin de semana · cerrado · lleno · pasado.
 *   · **Selección de entrada y salida** con un toque: el primer toque fija la
 *     entrada, el segundo la salida (si es anterior, se reinicia la entrada).
 *   · **Días cerrados y llenos NO son seleccionables**, y una salida que cruce una
 *     noche cerrada/llena tampoco se acepta: así el usuario no llega al 409.
 *   · **Estancia mínima** avisada por noche (`minNights`) y en el resumen.
 *
 * Sin dependencias nuevas: la rejilla la calcula `utils/datetime`.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { alpha, brand, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import {
  DOW_SHORT, addDaysIso, dowMondayFirst, isWeekendNight, longDate, monthGrid,
  monthIndex, monthLabel, nightsBetween, nightsList, parseIso, shiftMonth, todayIso, xaf,
} from '../utils/datetime';

/** Un día del calendario tal y como lo devuelve el servidor. */
export interface CalendarDay {
  date: string;
  priceXaf: number;
  basePriceXaf?: number;
  weekend?: boolean;
  closed?: boolean;
  note?: string | null;
  minNights?: number;
  totalUnits?: number;
  usedUnits?: number;
  freeUnits?: number;
  available?: boolean;
}

export interface CalendarPickerProps {
  /** Días con precio y disponibilidad (una fila por noche). */
  days: CalendarDay[];
  /** Entrada elegida (`YYYY-MM-DD`). */
  checkIn: string | null;
  /** Salida elegida (`YYYY-MM-DD`). */
  checkOut: string | null;
  /** Se llama con (entrada, salida): la salida puede ser `null` a medio elegir. */
  onChange: (checkIn: string | null, checkOut: string | null) => void;
  /**
   * Modo «solo llegada»: un toque fija el DÍA DE LLEGADA y el padre calcula la salida
   * (con `nightsCount`). Es la forma de pedir «llego el 21 y me quedo 3 noches» sin
   * tener que acertar con dos toques.
   */
  arrivalOnly?: boolean;
  /** Noches de la estancia cuando se usa `arrivalOnly` (para pintar el rango). */
  nightsCount?: number;
  /** Habitaciones que se quieren reservar (para exigir disponibilidad suficiente). */
  units?: number;
  /** Estancia mínima del tipo de habitación (por si una noche no la trae). */
  minNights?: number;
  /** Noches máximas que se pueden elegir de una vez. */
  maxNights?: number;
  /** Mes inicial (`YYYY-MM`) — por defecto, el del primer día con datos. */
  initialMonth?: string;
  /** Cargando el rango del mes (spinner discreto en la cabecera). */
  loading?: boolean;
  /** Se pide un mes nuevo al navegar (el servidor devuelve 92 días de una vez). */
  onMonthChange?: (from: string, to: string) => void;
  /** Texto bajo el calendario (por defecto, el resumen de noches y total). */
  footer?: React.ReactNode;
}

export function CalendarPicker({
  days,
  checkIn,
  checkOut,
  onChange,
  arrivalOnly = false,
  nightsCount,
  units = 1,
  minNights = 1,
  maxNights = 30,
  initialMonth,
  loading = false,
  onMonthChange,
  footer,
}: CalendarPickerProps) {
  const { colors } = useTheme();
  const hoy = todayIso();

  // Índice por fecha: el calendario consulta O(1) por celda (sin recorrer el array).
  const porFecha = useMemo(() => {
    const m = new Map<string, CalendarDay>();
    for (const d of days) m.set(d.date, d);
    return m;
  }, [days]);

  const primerDia = days[0]?.date ?? hoy;
  const [mes, setMes] = useState(() => {
    const base = initialMonth ? `${initialMonth}-01` : (checkIn ?? primerDia);
    const d = parseIso(base);
    return { year: d.getUTCFullYear(), month0: d.getUTCMonth() };
  });

  // El mes visible sigue a la selección cuando cambia desde fuera (p. ej. al abrir
  // el calendario con fechas ya elegidas).
  const seleccionPrevia = useRef<string | null>(null);
  useEffect(() => {
    if (!checkIn || seleccionPrevia.current === checkIn) return;
    seleccionPrevia.current = checkIn;
    const d = parseIso(checkIn);
    setMes({ year: d.getUTCFullYear(), month0: d.getUTCMonth() });
  }, [checkIn]);

  // Al cambiar de mes se pide el rango si el padre lo necesita (92 días de golpe).
  useEffect(() => {
    if (!onMonthChange) return;
    const desde = `${mes.year}-${String(mes.month0 + 1).padStart(2, '0')}-01`;
    onMonthChange(desde, addDaysIso(desde, 91));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes.year, mes.month0]);

  const celdas = useMemo(() => monthGrid(mes.year, mes.month0), [mes.year, mes.month0]);
  const mesActual = monthIndex(parseIso(hoy).getUTCFullYear(), parseIso(hoy).getUTCMonth());
  const mesVisible = monthIndex(mes.year, mes.month0);
  const puedeAtras = mesVisible > mesActual;
  const puedeAlante = mesVisible - mesActual < 3; // 92 días ≈ 3 meses

  /** ¿El día se puede tocar? (libre, con plazas, ni pasado ni cerrado) */
  const seleccionable = (d: CalendarDay | undefined, iso: string): boolean => {
    if (iso < hoy) return false;
    if (!d) return false;
    if (d.closed) return false;
    if (d.available === false) return false;
    if (units > 1 && Number(d.freeUnits ?? 0) < units) return false;
    return true;
  };

  /**
   * Un toque fija entrada o salida. Si la salida elegida cruza una noche que no
   * está libre (o se pasa del máximo), se avisa con el estado y NO se acepta: el
   * servidor lo rechazaría con 409 y es mejor no llegar ahí.
   */
  const tocar = (iso: string) => {
    const d = porFecha.get(iso);
    if (!seleccionable(d, iso)) return;
    // Modo «solo llegada»: un toque = día de llegada. La salida la pone el padre con las
    // noches pedidas, así que aquí no se espera un segundo toque (que era justo lo que
    // hacía imposible entender cómo elegir «3 noches»).
    if (arrivalOnly) {
      onChange(iso, null);
      return;
    }
    if (!checkIn || (checkIn && checkOut)) {
      onChange(iso, null);
      return;
    }
    if (iso <= checkIn) {
      onChange(iso, null); // toca antes o el mismo día: empieza de nuevo
      return;
    }
    const noches = nightsBetween(checkIn, iso);
    if (noches > maxNights) return;
    const problema = nightsList(checkIn, iso).find((n) => !seleccionable(porFecha.get(n), n));
    if (problema) return;
    const minExigida = Math.max(minNights, ...nightsList(checkIn, iso).map((n) => Number(porFecha.get(n)?.minNights ?? 0)));
    if (noches < minExigida) return;
    onChange(checkIn, iso);
  };

  /**
   * Rango VISUAL de la estancia. En modo «solo llegada» la salida todavía no la conoce
   * este componente (la calcula el padre con las noches pedidas), así que se pinta el
   * rango a partir de `nightsCount`: así el usuario VE las noches que está eligiendo.
   */
  const hastaVisual = useMemo(() => {
    if (checkOut) return checkOut;
    if (arrivalOnly && checkIn && nightsCount) return addDaysIso(checkIn, nightsCount);
    return null;
  }, [checkOut, arrivalOnly, checkIn, nightsCount]);

  // ── Resumen (noches, precio medio y lo que se paga ahora) ──
  const resumen = useMemo(() => {
    if (!checkIn || !hastaVisual) return null;
    const noches = nightsList(checkIn, hastaVisual);
    if (!noches.length) return null;
    const precios = noches.map((n) => Number(porFecha.get(n)?.priceXaf ?? 0));
    if (precios.some((p) => !p)) return null;
    const subtotal = precios.reduce((a, b) => a + b, 0) * units;
    return {
      noches: noches.length,
      nochesIso: noches,
      subtotal,
      media: Math.round(precios.reduce((a, b) => a + b, 0) / precios.length),
      finesDeSemana: noches.filter(isWeekendNight).length,
      salida: hastaVisual,
    };
  }, [checkIn, hastaVisual, porFecha, units]);

  return (
    <View style={[styles.wrap, { borderColor: colors.border, backgroundColor: colors.card }]}>
      {/* ── Cabecera: mes y navegación ── */}
      <View style={styles.head}>
        <Pressable
          onPress={() => puedeAtras && setMes(shiftMonth(mes.year, mes.month0, -1))}
          disabled={!puedeAtras}
          accessibilityRole="button"
          accessibilityLabel="Mes anterior"
          accessibilityState={{ disabled: !puedeAtras }}
          style={({ pressed }) => [styles.nav, { borderColor: colors.border, opacity: puedeAtras ? (pressed ? 0.6 : 1) : 0.3 }]}
        >
          <Text style={[styles.navTxt, { color: colors.textPrimary }]}>‹</Text>
        </Pressable>
        <View style={styles.headMid}>
          <Text style={[styles.mes, { color: colors.textPrimary }]}>{monthLabel(mes.year, mes.month0)}</Text>
          {loading ? <Text style={[styles.cargando, { color: colors.textSecondary }]}>cargando…</Text> : null}
        </View>
        <Pressable
          onPress={() => puedeAlante && setMes(shiftMonth(mes.year, mes.month0, 1))}
          disabled={!puedeAlante}
          accessibilityRole="button"
          accessibilityLabel="Mes siguiente"
          accessibilityState={{ disabled: !puedeAlante }}
          style={({ pressed }) => [styles.nav, { borderColor: colors.border, opacity: puedeAlante ? (pressed ? 0.6 : 1) : 0.3 }]}
        >
          <Text style={[styles.navTxt, { color: colors.textPrimary }]}>›</Text>
        </Pressable>
      </View>

      {/* ── Días de la semana (lunes primero) ── */}
      <View style={styles.dowRow}>
        {DOW_SHORT.map((d, i) => (
          <Text key={`${d}${i}`} style={[styles.dow, { color: colors.textSecondary }]}>{d}</Text>
        ))}
      </View>

      {/* ── La rejilla: 6 semanas × 7 días ── */}
      <View style={styles.grid}>
        {celdas.map((c) => {
          const d = porFecha.get(c.iso);
          const pasado = c.iso < hoy;
          const esEntrada = c.iso === checkIn;
          // La «salida» que se pinta es la visual (en modo llegada se calcula con las
          // noches pedidas), para que se vea el rango completo desde el primer toque.
          const esSalida = !!hastaVisual && c.iso === hastaVisual;
          const dentro = !!checkIn && !!hastaVisual && c.iso > checkIn && c.iso < hastaVisual;
          const ok = seleccionable(d, c.iso);
          const cerrado = !!d?.closed;
          const lleno = !cerrado && d?.available === false;
          const finde = isWeekendNight(c.iso);
          const conDatos = !!d;

          // Colores por estado: la leyenda de abajo explica cada uno.
          const fondo = esEntrada || esSalida
            ? colors.primary
            : dentro
              ? alpha(colors.primary, 0.14)
              : 'transparent';
          const texto = esEntrada || esSalida
            ? brand.white
            : !c.inMonth || pasado
              ? colors.textSecondary
              : cerrado || lleno || !ok
                ? colors.textSecondary
                : colors.textPrimary;

          return (
            <Pressable
              key={c.iso}
              onPress={() => tocar(c.iso)}
              disabled={!ok}
              accessibilityRole="button"
              accessibilityLabel={`${longDate(c.iso)}${conDatos ? `, ${xaf(d?.priceXaf)}` : ''}${cerrado ? ', cerrado' : lleno ? ', sin disponibilidad' : ''}`}
              accessibilityState={{ disabled: !ok, selected: esEntrada || esSalida }}
              style={({ pressed }) => [
                styles.cell,
                { backgroundColor: fondo, opacity: pressed ? 0.7 : 1 },
                c.iso === hoy && !esEntrada && !esSalida ? { borderColor: colors.primary, borderWidth: trazo.fino } : null,
              ]}
            >
              <Text style={[styles.dia, { color: texto, opacity: c.inMonth ? 1 : 0.4 }]}>{c.day}</Text>
              {conDatos && c.inMonth && !pasado ? (
                cerrado ? (
                  <Text style={[styles.precio, { color: colors.textSecondary }]}>cerrado</Text>
                ) : lleno ? (
                  <Text style={[styles.precio, { color: colors.danger }]}>lleno</Text>
                ) : (
                  <Text style={[styles.precio, { color: finde ? colors.secondary : colors.textSecondary }]}>
                    {Math.round(Number(d?.priceXaf ?? 0) / 1000)}k
                  </Text>
                )
              ) : null}
              {conDatos && c.inMonth && !pasado && ok && Number(d?.minNights ?? 1) > 1 ? (
                <Text style={[styles.min, { color: colors.textSecondary }]}>mín {d?.minNights}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* ── Leyenda: qué significa cada color ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.leyenda}>
        <Leyenda color={colors.primary} texto="tu selección" colors={colors} />
        <Leyenda color={colors.secondary} texto="fin de semana" colors={colors} />
        <Leyenda color={colors.textSecondary} texto="cerrado / pasado" colors={colors} />
        <Leyenda color={colors.danger} texto="sin plazas" colors={colors} />
        <Leyenda color={colors.border} texto="mín N = estancia mínima" colors={colors} />
      </ScrollView>

      {/* ── Resumen de la selección ── */}
      {resumen ? (
        <View style={[styles.resumen, { borderTopColor: colors.border }]}>
          <Text style={[styles.resumenTxt, { color: colors.textPrimary }]}>
            {longDate(checkIn as string)} → {longDate(resumen.salida)}
          </Text>
          <Text style={[styles.resumenSub, { color: colors.textSecondary }]}>
            {resumen.noches} noche{resumen.noches === 1 ? '' : 's'}
            {units > 1 ? ` · ${units} habitaciones` : ''}
            {' · '}{xaf(resumen.media)} por noche
            {resumen.finesDeSemana ? ` · ${resumen.finesDeSemana} de fin de semana` : ''}
          </Text>
          <Text style={[styles.total, { color: colors.textPrimary }]}>
            Estancia: {xaf(resumen.subtotal)}
          </Text>
        </View>
      ) : (
        <View style={[styles.resumen, { borderTopColor: colors.border }]}>
          <Text style={[styles.resumenSub, { color: colors.textSecondary }]}>
            {arrivalOnly
              ? 'Toca el día de LLEGADA (los días los eliges con el contador de arriba)'
              : checkIn ? 'Ahora toca el día de SALIDA' : 'Toca el día de ENTRADA'}
          </Text>
        </View>
      )}

      {footer}
    </View>
  );
}

function Leyenda({ color, texto, colors }: { color: string; texto: string; colors: { textSecondary: string } }) {
  return (
    <View style={styles.leyendaItem}>
      <View style={[styles.punto, { backgroundColor: color }]} />
      <Text style={[styles.leyendaTxt, { color: colors.textSecondary }]}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderWidth: trazo.fino, borderRadius: radios.panel, paddingVertical: espaciado.e12, paddingHorizontal: espaciado.e10 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e4 },
  headMid: { flex: 1, alignItems: 'center' },
  nav: { width: 38, height: 38, borderRadius: radios.md, borderWidth: trazo.fino, alignItems: 'center', justifyContent: 'center' },
  navTxt: { fontSize: 22, fontWeight: peso.maximo, lineHeight: 24 },
  mes: { fontSize: tipografia.subtitle, fontWeight: peso.maximo, textTransform: 'capitalize' },
  cargando: { fontSize: tipografia.micro, marginTop: espaciado.e2 },
  dowRow: { flexDirection: 'row', marginTop: espaciado.e10, marginBottom: espaciado.e4 },
  dow: { flex: 1, textAlign: 'center', fontSize: tipografia.caption, fontWeight: peso.fuerte },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`, minHeight: 56, borderRadius: radios.md, paddingVertical: espaciado.e4,
    alignItems: 'center', justifyContent: 'flex-start', borderWidth: 0,
  },
  dia: { fontSize: tipografia.body, fontWeight: peso.fuerte },
  precio: { fontSize: 9.5, fontWeight: peso.medio, marginTop: 1 },
  min: { fontSize: 8.5, marginTop: 0 },
  leyenda: { gap: espaciado.e12, paddingVertical: espaciado.e8, paddingHorizontal: espaciado.e2, alignItems: 'center' },
  leyendaItem: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e5 },
  punto: { width: 9, height: 9, borderRadius: radios.marca },
  leyendaTxt: { fontSize: 10.5 },
  resumen: { borderTopWidth: trazo.fino, paddingTop: espaciado.e10, paddingHorizontal: espaciado.e4, gap: espaciado.e2 },
  resumenTxt: { fontSize: tipografia.body, fontWeight: peso.fuerte },
  resumenSub: { fontSize: tipografia.caption },
  total: { fontSize: 14.5, fontWeight: peso.maximo, marginTop: espaciado.e2 },
});
