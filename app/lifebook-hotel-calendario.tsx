/**
 * lifebook-hotel-calendario — PRECIOS POR NOCHE, ESTANCIA MÍNIMA Y CIERRE DE FECHAS.
 *
 * Es la tercera pantalla que le faltaba al hotelero: el servidor sabía guardar excepciones
 * de calendario desde la Parte 42 (`PUT my/room-types/:id/calendar`) y el cliente tenía el
 * método escrito… pero **ninguna pantalla lo llamaba**. Sin esto, el hotelero no puede subir
 * el precio de una noche ni cerrar una semana.
 *
 * DOS DECISIONES QUE NO SON OBVIAS:
 *
 * 1. **No se reutiliza `CalendarPicker`.** Ese calendario es el del HUÉSPED, y a propósito
 *    deja sin tocar los días cerrados y los llenos (así el huésped no llega al 409). Para el
 *    hotelero es justo lo contrario: tiene que poder seleccionar un rango **cerrado** para
 *    volver a abrirlo, y un día lleno para ponerle temporada alta. Aquí todos los días desde
 *    hoy son seleccionables, y el estado (cerrado / con precio propio / lleno) solo se pinta.
 *
 * 2. **El rango es de NOCHES, no de días de calendario.** El servidor aplica la excepción a
 *    las noches del rango, ambas incluidas. Si el hotelero toca el 5 y el 8, son las noches
 *    del 5, 6 y 7 (la del 8 es la salida). Se dice con todas las letras en la pantalla.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, FormField, GhostButton, PrimaryButton, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { useScreenGuard } from '@egrouteplan/ui-kit';
import { AuthGate } from '../core/AuthGate';
import { PanelGate } from '../core/PanelGate';
import { hotelApi, type CalendarDay, type HotelRoom } from '../api/hotel';
import { ApiError } from '../api/httpClient';
import {
  DOW_SHORT, addDaysIso, dowMondayFirst, isWeekendNight, longDate, monthGrid,
  monthLabel, nightsBetween, parseIso, shiftMonth, todayIso, xaf,
} from '../utils/datetime';

/** 92 noches es el tope que acepta el servidor de una vez. */
const MAX_NOCHE = 92;
/** Días que se piden al servidor para pintar (su ficha pública da 60). */
const VENTANA = 92;

const DIAS_SEMANA = [
  { dow: 1, label: 'Lun' }, { dow: 2, label: 'Mar' }, { dow: 3, label: 'Mié' },
  { dow: 4, label: 'Jue' }, { dow: 5, label: 'Vie' }, { dow: 6, label: 'Sáb' },
  { dow: 0, label: 'Dom' },
];

export default function CalendarioScreen() {
  return (
    <AuthGate>
      <PanelGate><Contenido /></PanelGate>
    </AuthGate>
  );
}

function Contenido() {
  useScreenGuard();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const p = useLocalSearchParams<{ id?: string; nombre?: string }>();
  const roomId = String(p.id ?? '');

  const [room, setRoom] = useState<HotelRoom | null>(null);
  const [dias, setDias] = useState<CalendarDay[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [noVisible, setNoVisible] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const hoy = todayIso();
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(addDaysIso(hoy, 2));
  const [precio, setPrecio] = useState('');
  const [minNoches, setMinNoches] = useState('');
  const [cerrar, setCerrar] = useState(false);
  const [semana, setSemana] = useState<number[]>([]);
  const [nota, setNota] = useState('');

  const [mes, setMes] = useState(() => {
    const d = parseIso(hoy);
    return { year: d.getUTCFullYear(), month0: d.getUTCMonth() };
  });

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    setNoVisible(false);
    try {
      const out = await hotelApi.myRooms();
      const r = (out.rooms ?? []).find((x) => x.id === roomId) ?? null;
      setRoom(r);
      try {
        const cal = await hotelApi.calendar(roomId, hoy, addDaysIso(hoy, VENTANA - 1), 1);
        setDias(cal.days ?? []);
      } catch (e) {
        // El calendario PÚBLICO exige que la habitación esté publicada y aprobada. Una
        // habitación recién creada está en revisión, así que aquí no hay rejilla que pintar
        // — pero SÍ se pueden poner precios (esa ruta comprueba solo que sea tuya).
        if (e instanceof ApiError && (e.code === 'ROOM_NOT_FOUND' || e.code === 'RESERVATION_NOT_FOUND')) {
          setNoVisible(true);
          setDias([]);
        } else {
          throw e;
        }
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar el calendario.');
    } finally {
      setCargando(false);
    }
  }, [roomId, hoy]);

  useEffect(() => { void cargar(); }, [cargar]);

  const porFecha = useMemo(() => {
    const m = new Map<string, CalendarDay>();
    for (const d of dias) m.set(d.date, d);
    return m;
  }, [dias]);

  const noches = useMemo(() => {
    if (!desde || !hasta || hasta < desde) return 0;
    return nightsBetween(desde, addDaysIso(hasta, 1));
  }, [desde, hasta]);

  const base = room?.basePriceXaf ?? 0;

  /** Cuántas noches del rango tienen algo puesto (precio propio o cerrado). */
  const afectadas = useMemo(
    () => dias.filter((d) => d.date >= desde && d.date <= hasta
      && (d.closed || Number(d.priceXaf) !== Number(d.basePriceXaf))).length,
    [dias, desde, hasta],
  );

  const tocarDia = (iso: string) => {
    setAviso(null);
    // Primer toque (o toque anterior al inicio): empieza un rango nuevo.
    if (!desde || (desde && hasta) || iso < desde) {
      setDesde(iso);
      setHasta('');
      return;
    }
    if (iso === desde) { setHasta(iso); return; }
    if (nightsBetween(desde, addDaysIso(iso, 1)) > MAX_NOCHE) {
      Alert.alert('Rango demasiado largo', `De una vez se pueden tocar como máximo ${MAX_NOCHE} noches.`);
      return;
    }
    setHasta(iso);
  };

  const guardar = async (accion: 'set' | 'clear') => {
    if (!desde || !hasta) { Alert.alert('Elige el rango', 'Toca el primer y el último día del rango.'); return; }
    if (hasta < desde) { Alert.alert('Rango al revés', 'El último día no puede ser anterior al primero.'); return; }
    if (noches > MAX_NOCHE) { Alert.alert('Rango demasiado largo', `Como máximo ${MAX_NOCHE} noches de una vez.`); return; }

    const precioNum = precio.trim() ? Number(precio.replace(/[^\d]/g, '')) : null;
    const minNum = minNoches.trim() ? Number(minNoches.replace(/[^\d]/g, '')) : null;
    if (accion === 'set') {
      if (precioNum !== null && (precioNum < 1 || precioNum > 100_000_000)) { Alert.alert('Precio no válido', 'El precio tiene que ser mayor que 0.'); return; }
      if (minNum !== null && (minNum < 1 || minNum > 90)) { Alert.alert('Estancia mínima no válida', 'Tiene que estar entre 1 y 90 noches.'); return; }
      if (precioNum === null && minNum === null && !cerrar) {
        Alert.alert('Nada que guardar', 'Indica un precio, una estancia mínima o marca «cerrar estas fechas».');
        return;
      }
    }

    setGuardando(true);
    setAviso(null);
    try {
      const out = await hotelApi.saveCalendar(roomId, {
        action: accion,
        from: desde,
        to: hasta,
        ...(accion === 'set'
          ? {
              priceXaf: precioNum, minNights: minNum, isClosed: cerrar,
              note: nota.trim() || undefined,
              ...(semana.length ? { weekdays: semana } : {}),
            }
          : {}),
      });
      const hecho = accion === 'set'
        ? `Se aplicó a ${out.saved ?? noches} noche(s).`
        : `Se quitó lo puesto en ${out.cleared ?? noches} noche(s).`;
      setAviso(`${hecho}${out.warning ? `\n⚠️ ${out.warning}` : ''}`);
      await cargar();
    } catch (e) {
      setAviso(e instanceof ApiError ? e.message : 'No se pudo guardar.');
    } finally {
      setGuardando(false);
    }
  };

  const celdas = useMemo(() => monthGrid(mes.year, mes.month0), [mes.year, mes.month0]);
  const mesDeHoy = parseIso(hoy);
  const puedeAtras = mes.year > mesDeHoy.getUTCFullYear()
    || (mes.year === mesDeHoy.getUTCFullYear() && mes.month0 > mesDeHoy.getUTCMonth());

  if (cargando) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.cabecera, { paddingTop: insets.top + 8, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver" hitSlop={10} style={styles.volver}>
          <Text style={{ color: colors.textPrimary, fontSize: 30, lineHeight: 32 }}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 17, fontWeight: peso.titulo }}>Precios y fechas</Text>
          {/* El nombre de la habitación es del hotelero: dos líneas, sin recortar a media palabra. */}
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }} numberOfLines={2}>
            {room?.name ?? String(p.nombre ?? 'Habitación')} · {xaf(base)} por noche
          </Text>
        </View>
      </View>

      {error ? (
        <View style={{ padding: espaciado.e16 }}>
          <Text style={{ color: colors.textSecondary, marginBottom: espaciado.e12 }}>{error}</Text>
          <GhostButton title="Reintentar" onPress={() => void cargar()} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: espaciado.e16, paddingBottom: insets.bottom + 30 }} keyboardShouldPersistTaps="handled">
          {aviso ? (
            <View style={[styles.aviso, { backgroundColor: alpha(colors.primary, 0.08), borderColor: alpha(colors.primary, 0.25) }]}>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, lineHeight: 19 }}>{aviso}</Text>
            </View>
          ) : null}

          {noVisible ? (
            <View style={[styles.aviso, { backgroundColor: alpha(colors.secondary, 0.09), borderColor: alpha(colors.secondary, 0.3) }]}>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, lineHeight: 19 }}>
                Esta habitación todavía no está publicada (está en revisión), así que aún no se puede ver su
                calendario día a día. **Sí puedes dejar puestos sus precios y cerrar fechas**: se aplicarán en
                cuanto la aprueben.
              </Text>
            </View>
          ) : null}

          {/* ── Rango de noches ── */}
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.titulo, marginBottom: espaciado.e3 }}>
            1. Elige las noches
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 17, marginBottom: espaciado.e10 }}>
            Toca el primer día y el último. Son noches: del 5 al 8 son las noches del 5, el 6 y el 7
            (la del 8 es la salida del huésped).
          </Text>

          <View style={[styles.rango, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.fuerte }}>DESDE</Text>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.titulo }}>{desde ? longDate(desde) : '—'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.fuerte }}>HASTA</Text>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.titulo }}>{hasta ? longDate(hasta) : '—'}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ color: colors.primary, fontSize: tipografia.body, fontWeight: peso.titulo }}>{noches} noche(s)</Text>
              {afectadas ? (
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro }}>{afectadas} ya modificada(s)</Text>
              ) : null}
            </View>
          </View>

          {/* ── Rejilla: TODOS los días desde hoy son seleccionables ── */}
          <View style={[styles.mes, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <View style={styles.mesCabecera}>
              <Pressable
                onPress={() => setMes(shiftMonth(mes.year, mes.month0, -1))}
                disabled={!puedeAtras}
                hitSlop={8}
                style={{ opacity: puedeAtras ? 1 : 0.3 }}
                accessibilityLabel="Mes anterior"
              >
                <Text style={{ color: colors.textPrimary, fontSize: 22 }}>‹</Text>
              </Pressable>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.titulo }}>
                {monthLabel(mes.year, mes.month0)}
              </Text>
              <Pressable onPress={() => setMes(shiftMonth(mes.year, mes.month0, 1))} hitSlop={8} accessibilityLabel="Mes siguiente">
                <Text style={{ color: colors.textPrimary, fontSize: 22 }}>›</Text>
              </Pressable>
            </View>

            <View style={styles.fila}>
              {DOW_SHORT.map((d, i) => (
                <Text key={`${d}-${i}`} style={[styles.dow, { color: colors.textSecondary }]}>{d}</Text>
              ))}
            </View>

            {Array.from({ length: Math.ceil(celdas.length / 7) }, (_, f) => (
              <View key={f} style={styles.fila}>
                {celdas.slice(f * 7, f * 7 + 7).map((c) => {
                  const d = porFecha.get(c.iso);
                  const pasado = c.iso < hoy;
                  const enRango = !!desde && !!hasta && c.iso >= desde && c.iso <= hasta;
                  const esInicio = c.iso === desde;
                  const esFin = c.iso === hasta;
                  const cerrado = !!d?.closed;
                  const precioPropio = !!d && Number(d.priceXaf) !== Number(d.basePriceXaf);
                  const lleno = !!d && Number(d.freeUnits ?? 1) <= 0;
                  const finde = isWeekendNight(c.iso);
                  const color = esInicio || esFin ? colors.primary
                    : enRango ? alpha(colors.primary, 0.18)
                      : cerrado ? alpha(colors.danger, 0.12)
                        : 'transparent';
                  return (
                    <Pressable
                      key={c.iso}
                      onPress={() => tocarDia(c.iso)}
                      disabled={pasado || !c.inMonth}
                      accessibilityLabel={`${c.day} de ${monthLabel(mes.year, mes.month0)}`}
                      style={[styles.celda, { backgroundColor: color, opacity: c.inMonth && !pasado ? 1 : 0.25 }]}
                    >
                      <Text style={{
                        color: esInicio || esFin ? brand.white : colors.textPrimary,
                        fontSize: tipografia.caption, fontWeight: finde ? peso.titulo : peso.fuerte,
                      }}>
                        {c.day}
                      </Text>
                      {/* Adornos de estado: solo informan, no bloquean el toque. */}
                      <View style={{ flexDirection: 'row', gap: espaciado.e2, marginTop: 1 }}>
                        {cerrado ? <View style={[styles.punto, { backgroundColor: colors.danger }]} /> : null}
                        {precioPropio && !cerrado ? <View style={[styles.punto, { backgroundColor: colors.secondary }]} /> : null}
                        {lleno && !cerrado ? <View style={[styles.punto, { backgroundColor: colors.textSecondary }]} /> : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}

            <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, marginTop: espaciado.e6 }}>
              ⬤ rojo = cerrado · ⬤ naranja = precio propio · ⬤ gris = sin habitaciones libres
            </Text>
          </View>

          <View style={{ marginTop: espaciado.e10, flexDirection: 'row', gap: espaciado.e8 }}>
            <View style={{ flex: 1 }}>
              <GhostButton title="Hoy" onPress={() => { setDesde(hoy); setHasta(addDaysIso(hoy, 2)); }} />
            </View>
            <View style={{ flex: 1 }}>
              <GhostButton title="Este mes entero" onPress={() => { setDesde(hoy); setHasta(addDaysIso(hoy, 29)); }} />
            </View>
          </View>

          {/* ── Qué aplicar ── */}
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.titulo, marginTop: espaciado.e22, marginBottom: espaciado.e3 }}>
            2. Qué aplicar a esas noches
          </Text>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 17, marginBottom: espaciado.e10 }}>
            Precio de temporada, estancia mínima o cerrar. Si dejas un campo vacío, se mantiene lo que ya hubiera.
          </Text>

          <FormField
            label={`Precio de esas noches en XAF (normal: ${xaf(base)})`}
            value={precio} onChangeText={setPrecio} keyboardType="number-pad" placeholder={String(base || 25000)}
          />
          <View style={{ height: 10 }} />
          <FormField
            label="Estancia mínima en esas noches" value={minNoches} onChangeText={setMinNoches}
            keyboardType="number-pad" placeholder="Sin cambiar"
          />
          <View style={{ height: 10 }} />
          <FormField
            label="Nota para ti (opcional)" value={nota} onChangeText={setNota}
            placeholder="Temporada alta, fiestas…" maxLength={120}
          />

          <View style={[styles.linea, { borderColor: colors.border }]}>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.fuerte, flex: 1, paddingRight: espaciado.e12 }}>
              Cerrar estas fechas
            </Text>
            <Switch value={cerrar} onValueChange={setCerrar} trackColor={{ true: alpha(colors.danger, 0.5) }} />
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e4 }}>
            Cerrar = no se puede reservar. Las reservas que ya existan en esas noches **no** se cancelan.
          </Text>

          <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo, marginTop: espaciado.e16, marginBottom: espaciado.e6 }}>
            Solo algunos días de la semana (opcional)
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6 }}>
            {DIAS_SEMANA.map((d) => {
              const on = semana.includes(d.dow);
              return (
                <Pressable
                  key={d.dow}
                  onPress={() => setSemana((prev) => (on ? prev.filter((x) => x !== d.dow) : [...prev, d.dow]))}
                  style={[styles.chip, { backgroundColor: on ? alpha(colors.primary, 0.14) : colors.surface, borderColor: on ? colors.primary : colors.border }]}
                >
                  <Text style={{ color: on ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>
                    {on ? '✓ ' : ''}{d.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e6 }}>
            Sin marcar ninguno, se aplica a todos los días del rango.
          </Text>

          <View style={{ marginTop: espaciado.e18 }}>
            <PrimaryButton
              title={cerrar ? 'Cerrar esas fechas' : 'Guardar precios y fechas'}
              onPress={() => void guardar('set')}
              loading={guardando}
            />
          </View>
          <View style={{ marginTop: espaciado.e10 }}>
            <GhostButton
              title="Quitar lo puesto en esas noches"
              onPress={() => {
                Alert.alert(
                  'Quitar excepciones',
                  'Esas noches vuelven al precio y a las condiciones del tipo de habitación.',
                  [{ text: 'Cancelar', style: 'cancel' }, { text: 'Quitar', onPress: () => void guardar('clear') }],
                );
              }}
              disabled={guardando}
            />
          </View>

          {/* ── Cómo queda ── */}
          {dias.length ? (
            <>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.titulo, marginTop: espaciado.e24, marginBottom: espaciado.e8 }}>
                Cómo queda el próximo mes y medio
              </Text>
              {dias.filter((d) => d.closed || Number(d.priceXaf) !== Number(d.basePriceXaf)).slice(0, 40).map((d) => (
                <View key={d.date} style={[styles.linea, { borderColor: colors.border }]}>
                  <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.fuerte, flex: 1 }}>
                    {longDate(d.date)}
                  </Text>
                  <Text style={{ color: d.closed ? colors.danger : colors.secondary, fontSize: tipografia.body, fontWeight: peso.titulo }}>
                    {d.closed ? 'Cerrado' : xaf(d.priceXaf)}
                  </Text>
                </View>
              ))}
              {!dias.some((d) => d.closed || Number(d.priceXaf) !== Number(d.basePriceXaf)) ? (
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption }}>
                  Todas las noches están al precio normal ({xaf(base)}) y abiertas.
                </Text>
              ) : null}
            </>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  cabecera: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e4,
    paddingHorizontal: espaciado.e12, paddingBottom: espaciado.e10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  volver: { width: 40, height: 34, alignItems: 'center', justifyContent: 'center' },
  aviso: { borderWidth: trazo.fino, borderRadius: radios.md, padding: espaciado.e11, marginBottom: espaciado.e14 },
  rango: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e8,
    borderWidth: trazo.fino, borderRadius: 14, padding: espaciado.e12, marginBottom: espaciado.e12,
  },
  mes: { borderWidth: trazo.fino, borderRadius: radios.lg, padding: espaciado.e10 },
  mesCabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e4, marginBottom: espaciado.e6 },
  fila: { flexDirection: 'row' },
  dow: { flex: 1, textAlign: 'center', fontSize: tipografia.micro, fontWeight: peso.maximo, marginBottom: espaciado.e2 },
  celda: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', borderRadius: 10, margin: 1 },
  punto: { width: 4, height: 4, borderRadius: radios.full },
  chip: { borderWidth: trazo.base, borderRadius: radios.full, paddingHorizontal: espaciado.e13, minHeight: 44, justifyContent: 'center' },
  linea: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: espaciado.e9,
  },
});
