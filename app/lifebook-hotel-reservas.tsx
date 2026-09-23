/**
 * lifebook-hotel-reservas — MIS RESERVAS (huésped) y, si eres hotelero, las de tu
 * hotel en el mismo sitio (`side=hotel`).
 *
 * Enseña lo que hace falta para no perderse: el **código** de la reserva, el estado
 * de la habitación y el **estado del dinero por separado** (sin cobrar · comprobante
 * enviado · señal cobrada · pagado · devuelto), la **cuenta atrás de la retención**
 * cuando aún no se ha pagado la señal, y las acciones que puede hacer cada parte:
 * enviar la referencia de la transferencia, cancelar **con motivo**, y —el hotel—
 * confirmar el cobro de la señal.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {useTheme, alpha, brand, tipografia, radios, altura} from '@egrouteplan/ui-kit';
import { AuthGate } from '../core/AuthGate';
import {
  hotelApi, PAGO_ETIQUETA, RESERVA_ETIQUETA, METODO_ETIQUETA, type Reservation,
} from '../api/hotel';
import { ApiError } from '../api/httpClient';
import { countdown, longDate, shortDate, xaf } from '../utils/datetime';

export default function HotelReservasScreen() {
  return (
    <AuthGate>
      <Contenido />
    </AuthGate>
  );
}

function Contenido() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const p = useLocalSearchParams<{ side?: string }>();

  const [lado, setLado] = useState<'guest' | 'hotel'>(p.side === 'hotel' ? 'hotel' : 'guest');
  const [reservas, setReservas] = useState<Reservation[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  // Comprobación de permisos: el hotelero solo ve su pestaña si tiene hotel.
  const [esHotelero, setEsHotelero] = useState(false);
  const [shopId, setShopId] = useState<string | null>(null);
  const [ocupacionHoy, setOcupacionHoy] = useState<
    { roomTypeId: string; name: string; totalUnits: number; occupied: number; free: number }[]
  >([]);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    setError(null);
    try {
      const out = await hotelApi.mine(lado);
      setReservas(out.reservations ?? []);
      if (lado === 'hotel') {
        try {
          const mio = await hotelApi.myHotel();
          setEsHotelero(!!mio.hotel);
          setShopId(mio.hotel?.shopId ?? null);
          if (mio.hotel?.shopId) {
            const libro = await hotelApi.dayBook(mio.hotel.shopId);
            setOcupacionHoy(libro.occupancy ?? []);
          }
        } catch { /* sin hotel: la pestaña de hotel queda vacía, no es un error */ }
      } else {
        try {
          const mio = await hotelApi.myHotel();
          setEsHotelero(!!mio.hotel);
        } catch { setEsHotelero(false); }
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudieron cargar tus reservas.');
    } finally {
      setCargando(false);
      setRefrescando(false);
    }
  }, [lado]);

  useEffect(() => { void cargar(); }, [cargar]);

  // La retención se agota: se refresca el contador cada 30 s para que la cuenta
  // atrás no se quede congelada.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const hoy = new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
  const enCurso = useMemo(
    () => reservas.filter((r) => r.viva && r.checkIn <= hoy && r.checkOut > hoy),
    [reservas, hoy],
  );
  const futuras = useMemo(
    () => reservas.filter((r) => r.viva && r.checkIn > hoy),
    [reservas, hoy],
  );
  const pasadas = useMemo(
    () => reservas.filter((r) => !r.viva || r.checkOut <= hoy),
    [reservas, hoy],
  );

  const accion = async (fn: () => Promise<{ reservation: Reservation }>, exito: string) => {
    setAviso(null);
    try {
      await fn();
      setAviso(exito);
      await cargar(true);
    } catch (e) {
      setAviso(e instanceof ApiError ? e.message : 'No se pudo completar la acción.');
    }
  };

  const cancelar = (r: Reservation) => {
    if (Platform.OS === 'web') {
      const motivo = window.prompt('Motivo de la cancelación (queda registrado)') ?? '';
      if (motivo.trim().length < 3) return;
      void accion(() => hotelApi.cancel(r.id, motivo.trim()), 'Reserva cancelada.');
      return;
    }
    // En móvil se pide el motivo con el diálogo nativo (con campo de texto).
    Alert.prompt?.(
      'Cancelar reserva',
      `Motivo para ${r.code} (queda registrado en la reserva)`,
      (motivo?: string) => {
        if (!motivo || motivo.trim().length < 3) return;
        void accion(() => hotelApi.cancel(r.id, motivo.trim()), 'Reserva cancelada.');
      },
      'plain-text',
    );
    if (!Alert.prompt) {
      // Android no tiene Alert.prompt: se cancela con un motivo por defecto editable
      // en la pantalla de detalle (aquí se deja claro qué se registra).
      Alert.alert(
        'Cancelar reserva',
        `Se cancelará ${r.code} y quedará registrado el motivo «Cancelada por el huésped». ¿Seguir?`,
        [
          { text: 'No', style: 'cancel' },
          { text: 'Sí, cancelar', style: 'destructive', onPress: () => void accion(() => hotelApi.cancel(r.id, 'Cancelada por el huésped'), 'Reserva cancelada.') },
        ],
      );
    }
  };

  const confirmarSenal = (r: Reservation) =>
    void accion(() => hotelApi.confirmDeposit(r.id, 'Confirmado en recepción'), 'Señal confirmada: la reserva queda pendiente de tu confirmación final.');

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.barra, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver" style={styles.volver}>
          <Text style={[styles.volverTxt, { color: colors.textPrimary }]}>‹</Text>
        </Pressable>
        <Text style={[styles.titulo, { color: colors.textPrimary }]}>Reservas de hotel</Text>
      </View>

      {/* ── Pestañas: viajero / hotel ── */}
      <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
        {(['guest', 'hotel'] as const).map((s) => {
          const activo = lado === s;
          return (
            <Pressable
              key={s}
              onPress={() => setLado(s)}
              accessibilityRole="tab"
              accessibilityState={{ selected: activo }}
              accessibilityLabel={s === 'guest' ? 'Mis estancias' : 'Reservas de mi hotel'}
              style={[styles.tab, { borderBottomColor: activo ? colors.primary : 'transparent' }]}
            >
              <Text style={[styles.tabTxt, { color: activo ? colors.primary : colors.textSecondary }]}>
                {s === 'guest' ? 'Mis estancias' : 'Mi hotel'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {cargando ? (
        <View style={styles.centro}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        /*
          LISTA VIRTUALIZADA POR SECCIONES (auditoría de diseño, D-04/D-21): antes era un
          ScrollView con un bloque «Grupo» por sección y cada bloque con su .map(), así que
          TODAS las reservas quedaban montadas. Aquí la sección es el grupo y la fila es la
          reserva. `stickySectionHeadersEnabled` en false a propósito: los títulos nunca
          fueron pegajosos. El hueco lo pone el `gap: 12` del contenedor.
        */
        <SectionList
          /*
            Las secciones vacías se filtran a propósito: VirtualizedSectionList cuenta DOS
            celdas por sección aunque no tenga filas (cabecera y pie, ver
            @react-native/virtualized-lists/Lists/VirtualizedSectionList.js L178-180), así que
            sin filtrar saldría un «En curso (0)» que antes NO se veía: el viejo componente
            `Grupo` hacía `return null` cuando la lista venía vacía.
          */
          sections={[
            { titulo: 'En curso', data: enCurso },
            { titulo: 'Próximas', data: futuras },
            { titulo: 'Historial', data: pasadas },
          ].filter((s) => s.data.length > 0)}
          keyExtractor={(r) => r.id}
          contentContainerStyle={{ padding: 14, paddingBottom: insets.bottom + 30, gap: 12 }}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); void cargar(true); }} tintColor={colors.primary} />
          }
          renderSectionHeader={({ section }) => (
            <Text style={[styles.seccion, { color: colors.textPrimary }]}>{section.titulo} ({section.data.length})</Text>
          )}
          renderItem={({ item: r }) => (
            <Tarjeta
              r={r}
              lado={lado}
              onCancelar={cancelar}
              onConfirmarSenal={confirmarSenal}
              onAbrir={(x) => router.push({ pathname: '/lifebook-hotel-reserva', params: { id: x.id } } as never)}
            />
          )}
          ListHeaderComponent={
            /*
            Un `View` con el hueco del contenedor, y no un fragmento: el `gap` de
            `contentContainerStyle` separa CELDAS, y `ListHeaderComponent` es UNA celda. Con un
            fragmento, todo lo de aquí dentro quedaba pegado (era gap: 12 antes de virtualizar).
            */
            <View style={{ gap: 12 }}>
          {aviso ? (
            <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.sub, { color: colors.textPrimary }]}>{aviso}</Text>
            </View>
          ) : null}
          {error ? (
            <View style={[styles.bloque, { borderColor: colors.danger, backgroundColor: alpha(colors.danger, 0.06) }]}>
              <Text style={{ color: colors.danger, fontSize: tipografia.body, fontWeight: '600' }}>{error}</Text>
              <Pressable onPress={() => void cargar()} accessibilityRole="button" accessibilityLabel="Reintentar">
                <Text style={[styles.enlace, { color: colors.primary }]}>Reintentar</Text>
              </Pressable>
            </View>
          ) : null}

          {/* ── Panel del hotelero: ocupación de hoy ── */}
          {lado === 'hotel' && esHotelero && ocupacionHoy.length ? (
            <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.etiqueta, { color: colors.textSecondary }]}>OCUPACIÓN DE HOY</Text>
              {ocupacionHoy.map((o) => (
                <View key={o.roomTypeId} style={styles.linea}>
                  <Text style={[styles.lineaEtq, { color: colors.textPrimary }]}>{o.name}</Text>
                  <Text style={[styles.lineaVal, { color: o.occupied >= o.totalUnits ? colors.danger : colors.success }]}>
                    {o.occupied}/{o.totalUnits} ocupadas · {o.free} libres
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {lado === 'hotel' && !esHotelero ? (
            <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.sub, { color: colors.textPrimary }]}>
                Aquí aparecerán las reservas de tu hotel cuando publiques sus habitaciones.
              </Text>
              <Text style={[styles.sub, { color: colors.textSecondary }]}>
                El hospedaje se configura desde la tienda de Life Book (ficha del alojamiento,
                habitaciones, precios y calendario).
              </Text>
            </View>
          ) : null}

          {reservas.length === 0 && !error ? (
            <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.sub, { color: colors.textPrimary }]}>
                {lado === 'guest' ? 'Todavía no has reservado ninguna estancia.' : 'Tu hotel no tiene reservas todavía.'}
              </Text>
              {lado === 'guest' ? (
                <Pressable onPress={() => router.replace('/lifebook-hotel' as never)} accessibilityRole="button" accessibilityLabel="Buscar alojamiento">
                  <Text style={[styles.enlace, { color: colors.primary }]}>Buscar alojamiento</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

            </View>
          }
        />
      )}
    </View>
  );
}

function Tarjeta({
  r, lado, onCancelar, onConfirmarSenal, onAbrir,
}: {
  r: Reservation;
  lado: 'guest' | 'hotel';
  onCancelar: (r: Reservation) => void;
  onConfirmarSenal: (r: Reservation) => void;
  onAbrir: (r: Reservation) => void;
}) {
  const { colors } = useTheme();
  const [ref, setRef] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const colorEstado = r.status === 'cancelled' || r.status === 'no_show'
    ? colors.textSecondary
    : r.status === 'checked_out'
      ? colors.success
      : r.status === 'hold'
        ? colors.danger
        : colors.primary;

  const puedeEnviarRef = r.role === 'guest' && r.paymentMethod === 'transfer'
    && r.paymentStatus === 'pending' && r.status === 'hold';
  const puedeConfirmarSenal = r.role === 'hotel' && ['hold', 'pending'].includes(r.status)
    && r.paymentStatus !== 'deposit_paid' && r.depositXaf > 0;
  const puedeCancelar = r.viva && !['checked_out', 'cancelled', 'no_show'].includes(r.status);

  const enviar = async () => {
    if (ref.trim().length < 4) return;
    setEnviando(true);
    setMsg(null);
    try {
      await hotelApi.proof(r.id, ref.trim());
      setMsg('Referencia enviada. El hotel la comprobará.');
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : 'No se pudo enviar.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      {/* Tocar la cabecera abre el DETALLE de la reserva (estado, habitación con fotos,
          pago, referencia y cancelación en una sola pantalla). */}
      <Pressable
        onPress={() => onAbrir(r)}
        accessibilityRole="button"
        accessibilityLabel={`Ver el detalle de la reserva ${r.code}`}
      >
      <View style={styles.linea}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.codigo, { color: colors.textPrimary }]}>{r.code}</Text>
          {/* Nombre del huésped / del hotel y de la habitación: son textos de personas, no etiquetas. */}
          <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={2}>
            {lado === 'hotel' ? `${r.guest?.name ?? 'Huésped'}${r.guest?.phone ? ` · ${r.guest.phone}` : ''}` : (r.hotel?.name ?? 'Hotel')}
            {' · '}{r.roomName}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: alpha(colorEstado, 0.12), borderColor: colorEstado }]}>
          <Text style={[styles.badgeTxt, { color: colorEstado }]}>{RESERVA_ETIQUETA[r.status] ?? r.status}</Text>
        </View>
      </View>

      <Text style={[styles.dato, { color: colors.textPrimary }]}>
        {shortDate(r.checkIn, true)} → {shortDate(r.checkOut, true)} · {r.nights} noche(s)
        {r.units > 1 ? ` · ${r.units} habitaciones` : ''} · {r.guests} huésped(es)
      </Text>
      </Pressable>

      <View style={[styles.dinero, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <View style={styles.linea}>
          <Text style={[styles.lineaEtq, { color: colors.textPrimary }]}>Total</Text>
          <Text style={[styles.lineaVal, { color: colors.textPrimary, fontWeight: '800' }]}>{xaf(r.totalXaf)}</Text>
        </View>
        {r.depositXaf > 0 ? (
          <>
            <View style={styles.linea}>
              <Text style={[styles.lineaEtq, { color: colors.textPrimary }]}>Señal ({r.depositPercent} %)</Text>
              <Text style={[styles.lineaVal, { color: colors.primary, fontWeight: '800' }]}>{xaf(r.depositXaf)}</Text>
            </View>
            <View style={styles.linea}>
              <Text style={[styles.lineaEtq, { color: colors.textPrimary }]}>Al llegar</Text>
              <Text style={[styles.lineaVal, { color: colors.secondary, fontWeight: '800' }]}>{xaf(r.remainingXaf)}</Text>
            </View>
          </>
        ) : (
          <View style={styles.linea}>
            <Text style={[styles.lineaEtq, { color: colors.textPrimary }]}>Se paga al llegar</Text>
            <Text style={[styles.lineaVal, { color: colors.secondary, fontWeight: '800' }]}>{xaf(r.totalXaf)}</Text>
          </View>
        )}
        <View style={styles.linea}>
          <Text style={[styles.lineaEtq, { color: colors.textSecondary }]}>Dinero</Text>
          <Text style={[styles.lineaVal, { color: colors.textSecondary }]}>
            {PAGO_ETIQUETA[r.paymentStatus] ?? r.paymentStatus} · {METODO_ETIQUETA[r.paymentMethod] ?? r.paymentMethod}
          </Text>
        </View>
      </View>

      {r.status === 'hold' && r.holdExpiresAt ? (
        <Text style={[styles.aviso, { color: colors.danger }]}>
          ⏳ Retenida {countdown(r.holdExpiresAt)} para pagar la señal ({xaf(r.depositXaf)}).
          Si no se paga, la habitación se libera sola.
        </Text>
      ) : null}
      {r.freeCancellationUntil && r.viva ? (
        <Text style={[styles.aviso, { color: colors.textSecondary }]}>
          Cancelación gratuita hasta el {longDate(r.freeCancellationUntil.slice(0, 10))}.
        </Text>
      ) : null}
      {r.cancelReason ? (
        <Text style={[styles.aviso, { color: colors.textSecondary }]}>Motivo: {r.cancelReason}</Text>
      ) : null}

      {puedeEnviarRef ? (
        <View style={{ gap: 6, marginTop: 8 }}>
          <TextInput
            value={ref}
            onChangeText={setRef}
            placeholder="Nº de operación de tu transferencia"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
            accessibilityLabel="Referencia de la transferencia"
          />
          <Pressable
            onPress={() => void enviar()}
            disabled={enviando || ref.trim().length < 4}
            accessibilityRole="button"
            accessibilityLabel="Enviar referencia"
            accessibilityState={{ disabled: enviando || ref.trim().length < 4 }}
            style={[styles.boton, { backgroundColor: ref.trim().length < 4 ? colors.border : colors.primary }]}
          >
            {enviando ? <ActivityIndicator color={brand.white} /> : <Text style={styles.botonTxt}>Enviar referencia</Text>}
          </Pressable>
        </View>
      ) : null}

      {puedeConfirmarSenal ? (
        <Pressable
          onPress={() => onConfirmarSenal(r)}
          accessibilityRole="button"
          accessibilityLabel={`Confirmar la señal de ${r.code}`}
          style={[styles.boton, { backgroundColor: colors.success, marginTop: 8 }]}
        >
          <Text style={styles.botonTxt}>Confirmar señal recibida ({xaf(r.depositXaf)})</Text>
        </Pressable>
      ) : null}

      {puedeCancelar ? (
        <Pressable
          onPress={() => onCancelar(r)}
          accessibilityRole="button"
          accessibilityLabel={`Cancelar ${r.code}`}
          style={[styles.botonFantasma, { borderColor: colors.border }]}
        >
          <Text style={[styles.botonFantasmaTxt, { color: colors.danger }]}>Cancelar reserva</Text>
        </Pressable>
      ) : null}

      {msg ? <Text style={[styles.aviso, { color: colors.textSecondary }]}>{msg}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  barra: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1 },
  volver: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  volverTxt: { fontSize: 26, fontWeight: '700', lineHeight: 28 },
  titulo: { fontSize: 16.5, fontWeight: '800', flex: 1 },
  tabs: { flexDirection: 'row', borderBottomWidth: 1 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 12, borderBottomWidth: 2 },
  tabTxt: { fontSize: tipografia.body, fontWeight: '700' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bloque: { borderWidth: 1, borderRadius: radios.lg, padding: 12, gap: 4 },
  etiqueta: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6 },
  seccion: { fontSize: 14.5, fontWeight: '800' },
  card: { borderWidth: 1, borderRadius: radios.lg, padding: 12, gap: 4 },
  codigo: { fontSize: 15.5, fontWeight: '800', letterSpacing: 0.5 },
  sub: { fontSize: tipografia.caption },
  dato: { fontSize: tipografia.body, marginTop: 2 },
  linea: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  lineaEtq: { fontSize: tipografia.caption, flex: 1 },
  lineaVal: { fontSize: tipografia.body },
  badge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt: { fontSize: 10.5, fontWeight: '800' },
  dinero: { borderWidth: 1, borderRadius: radios.md, padding: 9, marginTop: 6, gap: 2 },
  aviso: { fontSize: tipografia.caption, marginTop: 6, fontWeight: '600' },
  input: { borderWidth: 1, borderRadius: radios.md, paddingHorizontal: 12, height: altura.punto, fontSize: tipografia.body },
  boton: { height: altura.punto, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center' },
  botonTxt: { color: brand.white, fontSize: tipografia.body, fontWeight: '800' },
  botonFantasma: { borderWidth: 1, borderRadius: radios.md, height: altura.punto, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  botonFantasmaTxt: { fontSize: tipografia.body, fontWeight: '800' },
  enlace: { fontSize: tipografia.caption, fontWeight: '700', marginTop: 4 },
});
