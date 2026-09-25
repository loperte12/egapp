/**
 * lifebook-hotel-reserva — DETALLE DE UNA RESERVA (vista del huésped).
 *
 * Es la pantalla que el bloque recibido llamaba `(hotel)/reservation/[id].tsx`, hecha con
 * las reglas de la casa y contra las rutas que existen:
 *
 *   · **Ruta plana** (`/lifebook-hotel-reserva?id=…`): un grupo `(hotel)` no aparece en la
 *     URL y habría dejado la pantalla en `/reservation/+id`.
 *   · **Los datos reales del servidor**: `GET …/reservations/:id` (con la puerta de
 *     huésped/hotel/admin) — no `my-reservations`, que no existe.
 *   · **Cancelar pide MOTIVO** (`PATCH …/reservations/:id/action` con `{action, reason}`) y
 *     el servidor borra las noches ocupadas: la habitación vuelve al calendario. Antes el
 *     bloque cancelaba sin motivo y **dejaba la habitación bloqueada**.
 *   · **No hay «pagar el resto»**: el resto se cobra en recepción al hacer el check-out, y
 *     la señal la confirma **el hotel** (con rastro de quién y con qué). Un botón que
 *     marcara «pagado» desde la app del huésped sería regalarse la habitación.
 *   · **El pago parcial se explica**: señal ahora (con cuenta atrás de la retención) y
 *     resto al llegar, con el desglose y el **campo para pegar la referencia** de la
 *     transferencia (que es como se paga de verdad aquí).
 *   · **El mapa es el del proyecto** (`MapBackground`: MapLibre auto-hospedado con pin,
 *     carga y «Reintentar»), no un WebView contra CDNs ajenos.
 *   · La línea de tiempo **incluye la retención** (`hold`), que era el estado que faltaba
 *     y dejaba la barra sin ningún punto encendido.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, altura, brand, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { AuthGate } from '../core/AuthGate';
import MapBackground from '../components/MapBackground';
import { PhotoGallery } from '../components/PhotoGallery';
import { hotelApi, METODO_ETIQUETA, PAGO_ETIQUETA, type Reservation } from '../api/hotel';
import { ApiError } from '../api/httpClient';
import { absUrl } from '../api/config';
import {
  RESERVATION_STATUS_LABELS, type ReservationStatus,
} from '@egrouteplan/contracts';
import { countdown, longDate, shortDate, xaf } from '../utils/datetime';

const POLL_MS = 20_000;

/** Pasos de la estancia. `hold` es el primero: la reserva retenida sin pagar la señal. */
const PASOS: { clave: string; etiqueta: string }[] = [
  { clave: 'hold', etiqueta: 'Retenida' },
  { clave: 'pending', etiqueta: 'Señal pagada' },
  { clave: 'confirmed', etiqueta: 'Confirmada' },
  { clave: 'checked_in', etiqueta: 'Dentro' },
  { clave: 'checked_out', etiqueta: 'Salida' },
];

export default function HotelReservaDetalleScreen() {
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const reservaId = String(id ?? '');

  const [r, setR] = useState<Reservation | null>(null);
  const [fotos, setFotos] = useState<string[]>([]);
  const [cargando, setCargando] = useState(true);
  const [refrescando, setRefrescando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [actuando, setActuando] = useState(false);
  const [referencia, setReferencia] = useState('');
  const [verMapa, setVerMapa] = useState(false);
  const vivo = useRef(true);

  const cargar = useCallback(async (silencioso = false) => {
    if (!reservaId) { setError('Falta el identificador de la reserva'); setCargando(false); return; }
    if (!silencioso) setCargando(true);
    try {
      const out = await hotelApi.reservation(reservaId);
      if (!vivo.current) return;
      setR(out.reservation);
      setError(null);
    } catch (e) {
      if (!vivo.current) return;
      // El error se ENSEÑA (nada de «Cargando…» eterno por un fallo de red o de permisos).
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar la reserva.');
    } finally {
      if (vivo.current) { setCargando(false); setRefrescando(false); }
    }
  }, [reservaId]);

  useEffect(() => {
    vivo.current = true;
    void cargar();
    const t = setInterval(() => void cargar(true), POLL_MS);
    return () => { vivo.current = false; clearInterval(t); };
  }, [cargar]);

  // Fotos reales de la habitación reservada (las sube el hotelero; el servidor las valida).
  useEffect(() => {
    const roomId = r?.roomTypeId;
    if (!roomId) { setFotos([]); return; }
    let v = true;
    hotelApi.room(roomId)
      .then(({ room }) => {
        if (!v) return;
        const urls = ((room.images ?? []) as { url?: string }[])
          .map((i) => absUrl(i?.url))
          .filter((u): u is string => !!u);
        setFotos(urls);
      })
      .catch(() => { if (v) setFotos([]); });
    return () => { v = false; };
  }, [r?.roomTypeId]);

  const estado = (r?.status ?? 'pending') as ReservationStatus;
  const cancelada = estado === 'cancelled' || estado === 'no_show';
  const viva = r ? (r.viva ?? false) : false;
  const indicePaso = useMemo(() => PASOS.findIndex((p) => p.clave === estado), [estado]);

  const puedeEnviarReferencia = !!r && r.role === 'guest' && r.paymentMethod === 'transfer'
    && r.paymentStatus === 'pending' && viva;
  const puedeCancelar = !!r && viva && !['checked_out', 'cancelled', 'no_show'].includes(estado);

  const enviarReferencia = async () => {
    if (!r || referencia.trim().length < 4) return;
    setActuando(true);
    setAviso(null);
    try {
      const out = await hotelApi.proof(r.id, referencia.trim());
      setR(out.reservation);
      setAviso('Referencia enviada. El hotel la comprobará y confirmará tu señal.');
    } catch (e) {
      setAviso(e instanceof ApiError ? e.message : 'No se pudo enviar la referencia.');
    } finally {
      setActuando(false);
    }
  };

  const cancelar = (motivo: string) => {
    if (!r) return;
    void (async () => {
      setActuando(true);
      setAviso(null);
      try {
        const out = await hotelApi.cancel(r.id, motivo);
        setR(out.reservation);
        setAviso('Reserva cancelada. La habitación vuelve a quedar libre.');
        await cargar(true);
      } catch (e) {
        setAviso(e instanceof ApiError ? e.message : 'No se pudo cancelar la reserva.');
      } finally {
        setActuando(false);
      }
    })();
  };

  const pedirMotivo = () => {
    if (Platform.OS === 'web') {
      const m = typeof window !== 'undefined' ? window.prompt('Motivo de la cancelación (queda registrado)') : null;
      if (m && m.trim().length >= 3) cancelar(m.trim());
      return;
    }
    if (Platform.OS === 'ios' && Alert.prompt) {
      Alert.prompt('Cancelar la reserva', 'Motivo (queda registrado en la reserva)', (m?: string) => {
        if (m && m.trim().length >= 3) cancelar(m.trim());
      }, 'plain-text');
      return;
    }
    Alert.alert(
      'Cancelar la reserva',
      'Se cancelará y quedará registrado el motivo «Cancelada por el huésped». ¿Seguir?',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Sí, cancelar', style: 'destructive', onPress: () => cancelar('Cancelada por el huésped') },
      ],
    );
  };

  // ── Cargando / error (con salida siempre) ──
  if (cargando && !r) {
    return (
      <View style={[styles.centro, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[styles.sub, { color: colors.textSecondary }]}>Cargando la reserva…</Text>
      </View>
    );
  }
  if (!r) {
    return (
      <View style={[styles.centro, { backgroundColor: colors.background, padding: espaciado.e20 }]}>
        <Text style={[styles.errorTxt, { color: colors.danger }]}>{error ?? 'Reserva no encontrada'}</Text>
        <Pressable onPress={() => void cargar()} accessibilityRole="button" accessibilityLabel="Reintentar">
          <Text style={[styles.enlace, { color: colors.primary }]}>Reintentar</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver">
          <Text style={[styles.enlace, { color: colors.textSecondary }]}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  const hotel = r.hotel;
  const puedeMapa = !!hotel?.lat && !!hotel?.lng;

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}
        refreshControl={
          <RefreshControl refreshing={refrescando} onRefresh={() => { setRefrescando(true); void cargar(true); }} tintColor={colors.primary} />
        }
      >
        {/* Fotos reales de la habitación */}
        <PhotoGallery
          photos={fotos}
          height={220}
          emptyLabel="La habitación no tiene fotos todavía"
          overlay={
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Volver"
              hitSlop={12}
              style={[styles.volverFlotante, { top: insets.top + 8 }]}
            >
              <Text style={styles.volverFlotanteTxt}>‹</Text>
            </Pressable>
          }
        />

        <View style={{ padding: espaciado.e14, gap: espaciado.e12 }}>
          {/* ── Estado y línea de tiempo (con la retención incluida) ── */}
          <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.codigo, { color: colors.textPrimary }]}>{r.code}</Text>
            <Text style={[styles.estado, { color: cancelada ? colors.danger : colors.primary }]}>
              {RESERVATION_STATUS_LABELS[estado] ?? r.status}
            </Text>

            {!cancelada ? (
              <View style={styles.pasos}>
                {PASOS.map((p, i) => {
                  const hecho = indicePaso >= 0 && i <= indicePaso;
                  return (
                    <View key={p.clave} style={styles.paso}>
                      <View style={[styles.punto, { backgroundColor: hecho ? colors.primary : colors.border }]} />
                      <Text style={[styles.pasoEtq, { color: hecho ? colors.textPrimary : colors.textSecondary }]}>
                        {p.etiqueta}
                      </Text>
                      {i < PASOS.length - 1 ? (
                        <View style={[styles.linea, { backgroundColor: i < indicePaso ? colors.primary : colors.border }]} />
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : null}

            {estado === 'hold' && r.holdExpiresAt ? (
              <Text style={[styles.avisoTxt, { color: colors.danger }]}>
                ⏳ Retenida {countdown(r.holdExpiresAt)} para pagar la señal ({xaf(r.depositXaf)}).
                Si no se paga, la habitación se libera sola.
              </Text>
            ) : null}
          </View>

          {/* ── El hotel ── */}
          <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.nombre, { color: colors.textPrimary }]}>{hotel?.name ?? 'Alojamiento'}</Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              {[hotel?.barrio, hotel?.city].filter(Boolean).join(' · ') || 'Guinea Ecuatorial'}
            </Text>
            {hotel?.addressReference ? (
              <Text style={[styles.sub, { color: colors.textSecondary }]}>📍 {hotel.addressReference}</Text>
            ) : null}
            <View style={styles.botones}>
              {puedeMapa ? (
                <Pressable
                  onPress={() => setVerMapa(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Ver el hotel en el mapa"
                  style={[styles.botonSec, { borderColor: colors.border, backgroundColor: colors.surface }]}
                >
                  <Text style={[styles.botonSecTxt, { color: colors.primary }]}>Ver en el mapa</Text>
                </Pressable>
              ) : null}
              {r.guestId ? (
                <Pressable
                  onPress={() => router.push('/lifebook-messages' as never)}
                  accessibilityRole="button"
                  accessibilityLabel="Chatear con el hotel"
                  style={[styles.botonSec, { borderColor: colors.border, backgroundColor: colors.surface }]}
                >
                  <Text style={[styles.botonSecTxt, { color: colors.primary }]}>Chatear con el hotel</Text>
                </Pressable>
              ) : null}
            </View>
          </View>

          {/* ── Estancia ── */}
          <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.etiqueta, { color: colors.textSecondary }]}>ESTANCIA</Text>
            <Linea etiqueta="Habitación" valor={r.roomName} />
            <Linea etiqueta="Entrada" valor={`${shortDate(r.checkIn, true)}${r.checkinFrom ? ` · desde ${r.checkinFrom}` : ''}`} />
            <Linea etiqueta="Salida" valor={`${shortDate(r.checkOut, true)}${r.checkoutUntil ? ` · hasta ${r.checkoutUntil}` : ''}`} />
            <Linea etiqueta="Noches" valor={String(r.nights)} />
            <Linea etiqueta="Huéspedes" valor={`${r.guests}${r.units > 1 ? ` · ${r.units} habitaciones` : ''}`} />
            {r.freeCancellationUntil && viva ? (
              <Text style={[styles.sub, { color: colors.textSecondary }]}>
                Cancelación gratuita hasta el {longDate(r.freeCancellationUntil.slice(0, 10))}.
              </Text>
            ) : null}
          </View>

          {/* ── Pago (desglose y estado del dinero, separado del estado de la reserva) ── */}
          <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.etiqueta, { color: colors.textSecondary }]}>PAGO</Text>
            <Linea etiqueta={`${r.nights} noche(s)${r.units > 1 ? ` × ${r.units}` : ''}`} valor={xaf(r.subtotalXaf)} />
            {r.cleaningFeeXaf ? <Linea etiqueta="Limpieza" valor={xaf(r.cleaningFeeXaf)} /> : null}
            {r.taxesXaf ? <Linea etiqueta="Tasas" valor={xaf(r.taxesXaf)} /> : null}
            <Linea etiqueta="Total" valor={xaf(r.totalXaf)} fuerte />
            {r.depositXaf > 0 ? (
              <>
                <Linea etiqueta={`Señal (${r.depositPercent} %)`} valor={xaf(r.depositXaf)} color={colors.primary} fuerte />
                <Linea etiqueta="Al llegar al hotel" valor={xaf(r.remainingXaf)} color={colors.secondary} fuerte />
              </>
            ) : (
              <Linea etiqueta="Se paga al llegar" valor={xaf(r.totalXaf)} color={colors.secondary} fuerte />
            )}
            <Linea etiqueta="Forma de pago" valor={METODO_ETIQUETA[r.paymentMethod] ?? r.paymentMethod} tenue />
            <Linea etiqueta="Estado del pago" valor={PAGO_ETIQUETA[r.paymentStatus] ?? r.paymentStatus} tenue />

            {/* La referencia de la transferencia: así se paga la señal de verdad */}
            {puedeEnviarReferencia ? (
              <View style={{ gap: espaciado.e8, marginTop: espaciado.e8 }}>
                <TextInput
                  value={referencia}
                  onChangeText={setReferencia}
                  placeholder="Nº de operación de tu transferencia"
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
                  accessibilityLabel="Referencia de la transferencia"
                />
                <Pressable
                  onPress={() => void enviarReferencia()}
                  disabled={actuando || referencia.trim().length < 4}
                  accessibilityRole="button"
                  accessibilityLabel="Enviar la referencia"
                  accessibilityState={{ disabled: actuando || referencia.trim().length < 4 }}
                  style={[styles.boton, {
                    backgroundColor: referencia.trim().length < 4 ? colors.border : colors.primary,
                  }]}
                >
                  {actuando ? <ActivityIndicator color={brand.white} /> : <Text style={styles.botonTxt}>Enviar referencia</Text>}
                </Pressable>
                <Text style={[styles.sub, { color: colors.textSecondary }]}>
                  El hotel comprueba la transferencia y confirma tu reserva. El resto ({xaf(r.remainingXaf)}) se
                  paga en recepción.
                </Text>
              </View>
            ) : null}
          </View>

          {/* ── Cancelación ── */}
          <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.etiqueta, { color: colors.textSecondary }]}>CANCELACIÓN</Text>
            {r.cancelReason ? (
              <Text style={[styles.sub, { color: colors.textPrimary }]}>Motivo registrado: {r.cancelReason}</Text>
            ) : null}
            {puedeCancelar ? (
              <>
                <Text style={[styles.sub, { color: colors.textSecondary }]}>
                  {r.freeCancellationUntil
                    ? `Cancelación gratuita hasta el ${longDate(r.freeCancellationUntil.slice(0, 10))}.`
                    : 'Consulta las condiciones del hotel antes de cancelar.'}
                </Text>
                <Pressable
                  onPress={pedirMotivo}
                  disabled={actuando}
                  accessibilityRole="button"
                  accessibilityLabel="Cancelar la reserva"
                  accessibilityState={{ disabled: actuando }}
                  style={[styles.botonFantasma, { borderColor: colors.danger, opacity: actuando ? 0.5 : 1 }]}
                >
                  <Text style={[styles.botonFantasmaTxt, { color: colors.danger }]}>
                    {actuando ? 'Cancelando…' : 'Cancelar la reserva'}
                  </Text>
                </Pressable>
              </>
            ) : (
              <Text style={[styles.sub, { color: colors.textSecondary }]}>
                {cancelada ? 'Esta reserva ya está cerrada.' : 'Esta reserva ya no se puede cancelar desde la app.'}
              </Text>
            )}
          </View>

          {aviso ? (
            <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.sub, { color: colors.textPrimary }]}>{aviso}</Text>
            </View>
          ) : null}
          {error ? (
            <Text style={[styles.errorTxt, { color: colors.danger }]}>{error}</Text>
          ) : null}
        </View>
      </ScrollView>

      {/* ── Mapa del hotel: el del proyecto (auto-hospedado), no un CDN ajeno ── */}
      {verMapa && puedeMapa ? (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}>
          {/* `pin` es [longitud, latitud] y `initialCamera` centra el mapa ahí mismo. */}
          <MapBackground
            pin={[Number(hotel?.lng), Number(hotel?.lat)]}
            initialCamera={{ centerCoordinate: [Number(hotel?.lng), Number(hotel?.lat)], zoomLevel: 15 }}
          >
            <View />
          </MapBackground>
          <Pressable
            onPress={() => setVerMapa(false)}
            accessibilityRole="button"
            accessibilityLabel="Cerrar el mapa"
            style={[styles.cerrarMapa, { top: insets.top + 10, borderColor: colors.border }]}
          >
            <Text style={[styles.cerrarMapaTxt, { color: colors.textPrimary }]}>✕ Cerrar</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function Linea({
  etiqueta, valor, fuerte, tenue, color,
}: { etiqueta: string; valor: string; fuerte?: boolean; tenue?: boolean; color?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.linea}>
      <Text style={[styles.lineaEtq, { color: tenue ? colors.textSecondary : colors.textPrimary, fontWeight: fuerte ? peso.fuerte : peso.medio }]}>
        {etiqueta}
      </Text>
      <Text style={[styles.lineaVal, { color: color ?? colors.textPrimary, fontWeight: fuerte ? peso.maximo : peso.medio }]}>
        {valor}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: espaciado.e10 },
  sub: { fontSize: tipografia.caption, marginTop: espaciado.e4 },
  errorTxt: { fontSize: tipografia.body, fontWeight: peso.fuerte, textAlign: 'center' },
  enlace: { fontSize: tipografia.body, fontWeight: peso.fuerte, marginTop: espaciado.e6 },
  bloque: { borderWidth: trazo.fino, borderRadius: radios.lg, padding: espaciado.e12, gap: espaciado.e3 },
  etiqueta: { fontSize: tipografia.micro, fontWeight: peso.maximo, letterSpacing: 0.6 },
  codigo: { fontSize: tipografia.cabecera, fontWeight: peso.maximo, letterSpacing: 0.6 },
  estado: { fontSize: tipografia.body, fontWeight: peso.maximo, marginTop: espaciado.e2 },
  nombre: { fontSize: tipografia.subtitle, fontWeight: peso.maximo },
  pasos: { flexDirection: 'row', alignItems: 'center', marginTop: espaciado.e12 },
  paso: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  punto: { width: 12, height: 12, borderRadius: radios.full },
  pasoEtq: { fontSize: tipografia.minimo, marginLeft: espaciado.e4, fontWeight: peso.medio },
  linea: { flex: 1, height: 3, marginHorizontal: espaciado.e4 },
  lineaEtq: { fontSize: tipografia.caption, flex: 1 },
  lineaVal: { fontSize: tipografia.body },
  avisoTxt: { fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e8 },
  botones: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8, marginTop: espaciado.e8 },
  botonSec: { borderWidth: trazo.fino, borderRadius: radios.md, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8 },
  botonSecTxt: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  boton: { height: altura.control, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center' },
  botonTxt: { color: brand.white, fontSize: tipografia.body, fontWeight: peso.maximo },
  botonFantasma: { borderWidth: trazo.fino, borderRadius: radios.md, height: altura.control, alignItems: 'center', justifyContent: 'center', marginTop: espaciado.e8 },
  botonFantasmaTxt: { fontSize: tipografia.body, fontWeight: peso.maximo },
  input: { borderWidth: trazo.fino, borderRadius: radios.md, paddingHorizontal: espaciado.e12, height: altura.control, fontSize: tipografia.body },
  volverFlotante: {
    position: 'absolute', left: 12, width: 36, height: 36, borderRadius: radios.full,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  volverFlotanteTxt: { color: brand.white, fontSize: tipografia.tituloFicha, fontWeight: peso.fuerte, lineHeight: 26 },
  cerrarMapa: { position: 'absolute', left: 14, borderWidth: trazo.fino, borderRadius: radios.md, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8, backgroundColor: brand.white },
  cerrarMapaTxt: { fontSize: tipografia.body, fontWeight: peso.maximo },
});
