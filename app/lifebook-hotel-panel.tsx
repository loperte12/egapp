/**
 * lifebook-hotel-panel — EL PANEL DEL HOTEL (el «hotel-merchant» del boceto).
 *
 * Ruta plana (`/lifebook-hotel-panel`): un grupo `(hotel-merchant)` no aparece en la URL,
 * así que su `index.tsx` habría quedado en `/` y chocado con la portada de la app.
 *
 * Y la decisión de fondo: **el hotel sale de la SESIÓN, no de la URL**. La versión del
 * boceto pedía `shopId` (con un UUID en ceros de marcador) contra rutas que no existían;
 * aquí se llama a `/my/hotel/*`, que el servidor resuelve por el token. No hay id que
 * adivinar ni que comprobar: la puerta es la propia consulta (y `ShopOwnerGuard` queda
 * como segunda capa en las rutas que sí llevan la tienda en la URL).
 *
 * Lo que la pantalla corrige respecto al boceto:
 *   · los botones son los del kit (`title`, no `label`) y solo aparecen los que la
 *     máquina de estados permite **para quien mira** (el huésped solo cancela);
 *   · cancelar y «no se presentó» **piden el motivo** (el servidor lo exige y queda
 *     registrado);
 *   · se ven las **retenidas sin pagar** con su cuenta atrás, que son las urgentes;
 *   · el dinero del día está separado: señal cobrada, pendiente de cobrar y «por
 *     confirmar», en vez de un solo número;
 *   · cada error se enseña y se puede reintentar (ni un `catch {}`).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable, RefreshControl, SectionList, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronRight, Settings } from 'lucide-react-native';
import {alpha, useTheme, brand, tipografia, radios, altura} from '@egrouteplan/ui-kit';
import { useScreenGuard } from '@egrouteplan/ui-kit';
import { AuthGate } from '../core/AuthGate';
import { PanelGate } from '../core/PanelGate';
import { hotelApi, PAGO_ETIQUETA, type HotelDashboard, type Reservation } from '../api/hotel';
import { ApiError } from '../api/httpClient';
import {
  availableActions, isReservationLive, RESERVATION_ACTIONS_SPEC, RESERVATION_STATUS_LABELS,
  type ReservationAction, type ReservationStatus,
} from '@egrouteplan/contracts';
import { countdown, longDate, shortDate, todayIso, xaf } from '../utils/datetime';

const POLL_MS = 20_000;

export default function HotelPanelScreen() {
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

  const [dash, setDash] = useState<HotelDashboard | null>(null);
  const [reservas, setReservas] = useState<Reservation[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null); // id de la reserva en curso
  const vivo = useRef(true);

  const cargar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCargando(true);
    try {
      const [d, l] = await Promise.all([hotelApi.dashboard(), hotelApi.shopReservations()]);
      if (!vivo.current) return;
      setDash(d);
      setReservas(l.reservations ?? []);
      setError(null);
    } catch (e) {
      if (!vivo.current) return;
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar el panel. Revisa tu conexión.');
    } finally {
      if (vivo.current) { setCargando(false); setRefrescando(false); }
    }
  }, []);

  useEffect(() => {
    vivo.current = true;
    void cargar();
    const t = setInterval(() => void cargar(true), POLL_MS);
    return () => { vivo.current = false; clearInterval(t); };
  }, [cargar]);

  const hoy = todayIso();
  const { urgentes, enCurso, futuras, historial } = useMemo(() => {
    const vivas = reservas.filter((r) => isReservationLive(r.status, r.holdExpiresAt));
    return {
      // Lo primero: retenidas sin pagar y por confirmar.
      urgentes: vivas.filter((r) => r.status === 'hold' || r.status === 'pending'),
      enCurso: vivas.filter((r) => ['confirmed', 'checked_in'].includes(r.status) && r.checkIn <= hoy && r.checkOut > hoy),
      futuras: vivas.filter((r) => ['confirmed'].includes(r.status) && r.checkIn > hoy),
      historial: reservas.filter((r) => !isReservationLive(r.status, r.holdExpiresAt)),
    };
  }, [reservas, hoy]);

  const accion = async (id: string, fn: () => Promise<unknown>, exito: string) => {
    setOcupado(id);
    setAviso(null);
    try {
      await fn();
      setAviso(exito);
      await cargar(true);
    } catch (e) {
      // El error del servidor SÍ se enseña: puede ser «quedan 0 habitaciones», «la
      // reserva cambió» o «la entrada es el día X», y todas son útiles.
      setAviso(e instanceof ApiError ? e.message : 'No se pudo completar la acción.');
    } finally {
      setOcupado(null);
    }
  };

  /** Cancelar y no-presentado exigen motivo (el servidor lo comprueba también). */
  const pedirMotivo = (r: Reservation, a: ReservationAction) => {
    const etiqueta = RESERVATION_ACTIONS_SPEC[a].label;
    const enviar = (motivo: string) =>
      void accion(r.id, () => hotelApi.setReservationStatus(r.id, RESERVATION_ACTIONS_SPEC[a].to, motivo.trim()), `«${etiqueta}» hecho en ${r.code}.`);
    if (Platform.OS === 'web') {
      const m = typeof window !== 'undefined' ? window.prompt(`Motivo para ${etiqueta.toLowerCase()} (${r.code})`) : null;
      if (m && m.trim().length >= 3) enviar(m);
      return;
    }
    if (a === 'cancel' && Platform.OS === 'ios' && Alert.prompt) {
      Alert.prompt(`Cancelar ${r.code}`, 'Motivo (queda registrado en la reserva)', (m?: string) => {
        if (m && m.trim().length >= 3) enviar(m);
      }, 'plain-text');
      return;
    }
    // Android/web sin campo de texto: se deja claro qué se va a registrar.
    Alert.alert(
      `${etiqueta} · ${r.code}`,
      a === 'cancel'
        ? 'Se cancelará la reserva y quedará registrado el motivo «Cancelada por el hotel». ¿Seguir?'
        : `Se marcará como no presentado y quedará registrado «El huésped no se presentó». ¿Seguir?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Sí',
          style: a === 'cancel' ? 'destructive' : 'default',
          onPress: () => enviar(a === 'cancel' ? 'Cancelada por el hotel' : 'El huésped no se presentó'),
        },
      ],
    );
  };

  const hacer = (r: Reservation, a: ReservationAction) => {
    const spec = RESERVATION_ACTIONS_SPEC[a];
    if (spec.reasonRequired) return pedirMotivo(r, a);
    void accion(r.id, () => hotelApi.setReservationStatus(r.id, spec.to), `«${spec.label}» hecho en ${r.code}.`);
  };

  const confirmarSenal = (r: Reservation) =>
    void accion(r.id, () => hotelApi.confirmDeposit(r.id, 'Confirmado en recepción'), `Señal de ${r.code} confirmada.`);

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.barra, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver" style={styles.volver}>
          <Text style={[styles.volverTxt, { color: colors.textPrimary }]}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          {/* El nombre del hotel es del dueño: dos líneas, no una recortada a media palabra. */}
          <Text style={[styles.titulo, { color: colors.textPrimary }]} numberOfLines={2}>
            {dash?.shop.name ?? 'Mi hotel'}
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            {dash ? `Hoy, ${longDate(dash.date)}` : 'Panel del alojamiento'}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/lifebook-hotel-reservas?side=hotel' as never)}
          accessibilityRole="button"
          accessibilityLabel="Ver todas las reservas"
          style={[styles.cambiar, { borderColor: colors.border }]}
        >
          <Text style={[styles.cambiarTxt, { color: colors.primary }]}>Todas</Text>
        </Pressable>
      </View>

      {cargando ? (
        <View style={styles.centro}><ActivityIndicator color={colors.primary} /></View>
      ) : error && !dash ? (
        <View style={[styles.aviso, { borderColor: colors.danger, backgroundColor: alpha(colors.danger, 0.06) }]}>
          <Text style={{ color: colors.danger, fontSize: tipografia.body, fontWeight: '600' }}>{error}</Text>
          <Pressable onPress={() => void cargar()} accessibilityRole="button" accessibilityLabel="Reintentar">
            <Text style={[styles.enlace, { color: colors.primary }]}>Reintentar</Text>
          </Pressable>
        </View>
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
            { titulo: 'Requiere tu atención', data: urgentes },
            { titulo: 'En casa hoy', data: enCurso },
            { titulo: 'Próximas llegadas', data: futuras },
            { titulo: 'Historial', data: historial.slice(0, 20) },
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
            <Tarjeta key={r.id} r={r} ocupado={ocupado === r.id} onAccion={hacer} onSenal={confirmarSenal} />
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

          {/*
            ── UNA SOLA PUERTA A LA OTRA PARTE ──
            El panel del comerciante son DOS partes (decisión del dueño, 2026-09-12):
            **Hoy** (esta: lo que caduca — personas esperando y dinero por cobrar) y
            **Gestión** (precios, fotos, textos, catálogo). Mezclarlas hace que lo urgente se
            pierda entre lo que puede esperar, así que aquí no hay atajos sueltos: hay UNA
            puerta clara. La primera versión puso tres tarjetas de acceso y era una barra de
            herramientas dentro de la pantalla del día.
          */}
          <Pressable
            onPress={() => router.push('/lifebook-hotel-gestion' as never)}
            accessibilityRole="button"
            accessibilityLabel="Gestión: ficha del hotel, habitaciones y precios"
            style={[styles.puente, { borderColor: colors.border, backgroundColor: colors.card }]}
          >
            <View style={[styles.puenteIcono, { backgroundColor: alpha(colors.primary, 0.12) }]}>
              <Settings size={17} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: '800' }}>Gestión</Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: 2 }}>
                Ficha del hotel, habitaciones, precios y fechas
              </Text>
            </View>
            <ChevronRight size={18} color={colors.textSecondary} />
          </Pressable>

          {/* ── El día: lo urgente primero, y el dinero separado ── */}
          {dash ? (
            <View style={styles.grid}>
              <Stat titulo="Llegadas hoy" valor={String(dash.arrivalsToday)} />
              <Stat titulo="Salidas hoy" valor={String(dash.departuresToday)} />
              <Stat titulo="Dentro ahora" valor={String(dash.insideNow)} />
              <Stat titulo="Próximas" valor={String(dash.upcoming)} />
              <Stat titulo="Por confirmar" valor={String(dash.pendingConfirm)} tono="aviso" />
              <Stat titulo="Sin pagar (retenidas)" valor={String(dash.unpaidHolds)} tono="alerta" />
            </View>
          ) : null}

          {dash?.occupancy?.length ? (
            <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.etiqueta, { color: colors.textSecondary }]}>OCUPACIÓN DE HOY</Text>
              {dash.occupancy.map((o) => (
                <View key={o.roomTypeId} style={styles.linea}>
                  {/*
                    El nombre del tipo de habitación lo escribió el hotelero en SU panel: aquí
                    (que es su pantalla) recortarlo a una línea era quitándole su propio dato.
                    El número de ocupadas se queda alineado a la derecha en la misma fila.
                  */}
                  <Text style={[styles.lineaEtq, { color: colors.textPrimary }]} numberOfLines={2}>{o.name}</Text>
                  <Text style={[styles.lineaVal, { color: o.free === 0 ? colors.danger : colors.success }]}>
                    {o.occupied}/{o.totalUnits} ocupadas · {o.free} libres
                  </Text>
                </View>
              ))}
              {dash.depositDue > 0 ? (
                <Text style={[styles.avisoTxt, { color: colors.secondary }]}>
                  {dash.depositDue} reserva(s) con señal pendiente de cobro
                </Text>
              ) : null}
            </View>
          ) : null}

            </View>
          }
          ListEmptyComponent={
            !error ? (
            <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.sub, { color: colors.textPrimary }]}>Tu hotel todavía no tiene reservas.</Text>
              <Text style={[styles.sub, { color: colors.textSecondary }]}>
                Aparecerán aquí en cuanto un huésped reserve una de tus habitaciones.
              </Text>
            </View>
            ) : null}
        />
      )}
    </View>
  );
}

function Tarjeta({
  r, ocupado, onAccion, onSenal,
}: {
  r: Reservation;
  ocupado: boolean;
  onAccion: (r: Reservation, a: ReservationAction) => void;
  onSenal: (r: Reservation) => void;
}) {
  const { colors } = useTheme();
  const estado = RESERVATION_STATUS_LABELS[r.status as ReservationStatus] ?? r.status;
  const viva = isReservationLive(r.status, r.holdExpiresAt);
  const acciones = availableActions(r.status, { who: 'hotel', viva });

  const colorEstado = r.status === 'hold'
    ? colors.danger
    : r.status === 'pending'
      ? colors.secondary
      : r.status === 'cancelled' || r.status === 'no_show'
        ? colors.textSecondary
        : r.status === 'checked_out'
          ? colors.success
          : colors.primary;

  const senalPendiente = ['hold', 'pending'].includes(r.status) && r.depositXaf > 0
    && !['deposit_paid', 'paid'].includes(r.paymentStatus);

  return (
    <View style={[styles.card, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.linea}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.codigo, { color: colors.textPrimary }]}>{r.code}</Text>
          {/* El nombre del huésped y el de la habitación los escribió alguien: dos líneas. */}
          <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={2}>
            {r.guest?.name ?? 'Huésped'} · {r.roomName} · {r.units} hab. · {r.guests} huésp.
          </Text>
        </View>
        <View style={[styles.badge, { borderColor: colorEstado, backgroundColor: alpha(colorEstado, 0.12) }]}>
          <Text style={[styles.badgeTxt, { color: colorEstado }]}>{estado}</Text>
        </View>
      </View>

      <Text style={[styles.dato, { color: colors.textPrimary }]}>
        {shortDate(r.checkIn, true)} → {shortDate(r.checkOut, true)} · {r.nights} noche(s)
      </Text>

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
            {PAGO_ETIQUETA[r.paymentStatus] ?? r.paymentStatus}
            {r.depositProof ? ` · ${r.depositProof}` : ''}
          </Text>
        </View>
      </View>

      {r.status === 'hold' && r.holdExpiresAt ? (
        <Text style={[styles.avisoTxt, { color: colors.danger }]}>
          ⏳ Retenida {countdown(r.holdExpiresAt)} sin pagar la señal. Si no se paga, se libera sola.
        </Text>
      ) : null}
      {r.freeCancellationUntil && viva ? (
        <Text style={[styles.avisoTxt, { color: colors.textSecondary }]}>
          Cancelación gratuita hasta el {longDate(r.freeCancellationUntil.slice(0, 10))}.
        </Text>
      ) : null}
      {r.cancelReason ? (
        <Text style={[styles.avisoTxt, { color: colors.textSecondary }]}>Motivo: {r.cancelReason}</Text>
      ) : null}

      {senalPendiente ? (
        <Pressable
          onPress={() => onSenal(r)}
          disabled={ocupado}
          accessibilityRole="button"
          accessibilityLabel={`Confirmar la señal de ${r.code}`}
          accessibilityState={{ disabled: ocupado, busy: ocupado }}
          style={[styles.boton, { backgroundColor: ocupado ? alpha(colors.success, 0.5) : colors.success }]}
        >
          {ocupado ? <ActivityIndicator color={brand.white} /> : (
            <Text style={styles.botonTxt}>Confirmar señal recibida ({xaf(r.depositXaf)})</Text>
          )}
        </Pressable>
      ) : null}

      {acciones.length ? (
        <View style={styles.acciones}>
          {acciones.map((a) => {
            const spec = RESERVATION_ACTIONS_SPEC[a];
            const destructivo = a === 'cancel' || a === 'noshow';
            return (
              <Pressable
                key={a}
                onPress={() => onAccion(r, a)}
                disabled={ocupado}
                accessibilityRole="button"
                accessibilityLabel={`${spec.label} · ${r.code}`}
                accessibilityState={{ disabled: ocupado }}
                style={[
                  styles.accion,
                  destructivo
                    ? { borderColor: colors.border, backgroundColor: 'transparent' }
                    : { borderColor: colors.primary, backgroundColor: alpha(colors.primary, 0.08) },
                  ocupado ? { opacity: 0.5 } : null,
                ]}
              >
                <Text style={[styles.accionTxt, { color: destructivo ? colors.danger : colors.primary }]}>
                  {spec.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function Stat({ titulo, valor, tono }: { titulo: string; valor: string; tono?: 'aviso' | 'alerta' }) {
  const { colors } = useTheme();
  const color = tono === 'alerta' ? colors.danger : tono === 'aviso' ? colors.secondary : colors.textPrimary;
  return (
    <View style={[styles.stat, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <Text style={[styles.statEtq, { color: colors.textSecondary }]} numberOfLines={2}>{titulo}</Text>
      <Text style={[styles.statVal, { color }]}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  barra: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 10, borderBottomWidth: 1 },
  volver: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  volverTxt: { fontSize: 26, fontWeight: '700', lineHeight: 28 },
  titulo: { fontSize: 16.5, fontWeight: '800' },
  sub: { fontSize: tipografia.caption },
  cambiar: { borderWidth: 1, borderRadius: radios.md, paddingHorizontal: 10, paddingVertical: 7 },
  cambiarTxt: { fontSize: tipografia.caption, fontWeight: '700' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  aviso: { margin: 14, borderWidth: 1, borderRadius: 14, padding: 12, gap: 6 },
  enlace: { fontSize: tipografia.caption, fontWeight: '700' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { width: '47.5%', borderWidth: 1, borderRadius: 14, padding: 12 },
  statEtq: { fontSize: tipografia.caption },
  statVal: { fontSize: 24, fontWeight: '800', marginTop: 2 },
  bloque: { borderWidth: 1, borderRadius: radios.lg, padding: 12, gap: 4 },
  /** Puerta única a la parte de Gestión. 56 px de alto: objetivo táctil cómodo. */
  puente: {
    flexDirection: 'row', alignItems: 'center', gap: 11,
    borderWidth: 1, borderRadius: 14, padding: 12, minHeight: 56,
  },
  puenteIcono: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  etiqueta: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.6 },
  seccion: { fontSize: 14.5, fontWeight: '800' },
  card: { borderWidth: 1, borderRadius: radios.lg, padding: 12, gap: 4 },
  codigo: { fontSize: 15.5, fontWeight: '800', letterSpacing: 0.5 },
  dato: { fontSize: tipografia.body, marginTop: 2 },
  linea: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  lineaEtq: { fontSize: tipografia.caption, flex: 1 },
  lineaVal: { fontSize: tipografia.body },
  badge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  badgeTxt: { fontSize: 10.5, fontWeight: '800' },
  dinero: { borderWidth: 1, borderRadius: radios.md, padding: 9, marginTop: 6, gap: 2 },
  avisoTxt: { fontSize: tipografia.caption, marginTop: 6, fontWeight: '600' },
  boton: { height: altura.punto, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  botonTxt: { color: brand.white, fontSize: tipografia.body, fontWeight: '800' },
  acciones: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  accion: { borderWidth: 1, borderRadius: radios.md, paddingHorizontal: 12, height: 40, alignItems: 'center', justifyContent: 'center' },
  accionTxt: { fontSize: tipografia.body, fontWeight: '800' },
});
