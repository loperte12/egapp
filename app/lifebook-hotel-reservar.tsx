/**
 * lifebook-hotel-reservar — CONFIRMAR la reserva con PAGO PARCIAL.
 *
 * Lo que corrige del boceto evaluado (tres fallos de lógica que costaban dinero):
 *   1. **El botón NO se activa sin disponibilidad**: se comprueba la disponibilidad
 *      de TODO el rango y con el número de habitaciones pedido (antes, con 1 libre
 *      y 3 pedidas seguía activo y el usuario se comía un 409).
 *   2. **La clave de idempotencia es ESTABLE por intento** (`reserveKey`): un doble
 *      toque no crea dos reservas (antes se generaba nueva en cada pulsación, así
 *      que la idempotencia no protegía de nada).
 *   3. **Los métodos de pago son los que acepta el hotel** (antes había una lista
 *      fija y el usuario elegía uno que el servidor rechazaba).
 *
 * Además: los importes los calcula SIEMPRE el servidor (aquí se enseña el desglose
 * del mismo modo que lo calcula él), la señal se puede bajar hasta 0 (pagar todo al
 * llegar) y tras reservar se muestra el CÓDIGO y la cuenta atrás de la retención.
 */
import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, altura, brand, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { AuthGate } from '../core/AuthGate';
import { CalendarPicker, type CalendarDay } from '../components/CalendarPicker';
import {
  hotelApi, reserveKey, resetReserveKey, METODO_ETIQUETA, type Reservation,
} from '../api/hotel';
import { ApiError } from '../api/httpClient';
import { absUrl } from '../api/config';
import { authApi } from '../api/auth';
import { PhotoGallery } from '../components/PhotoGallery';
import { useSession } from '../state/session';
import { addDaysIso, countdown, longDate, nightsBetween, todayIso, xaf } from '../utils/datetime';

const MAX_NOCHES = 92;

export default function HotelReservarScreen() {
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
  const { phone: telefonoSesion } = useSession();
  const p = useLocalSearchParams<{
    roomTypeId: string; shopId?: string; shopName?: string;
    checkIn?: string; checkOut?: string; guests?: string; units?: string;
  }>();
  const roomTypeId = String(p.roomTypeId ?? '');

  const [checkIn, setCheckIn] = useState<string | null>(p.checkIn ?? null);
  const [checkOut, setCheckOut] = useState<string | null>(p.checkOut ?? null);
  const [huespedes, setHuespedes] = useState(Number(p.guests ?? 2));
  const [habitaciones, setHabitaciones] = useState(Number(p.units ?? 1));

  // La sesión no guarda el nombre: el huésped lo escribe (es quien se aloja, y
  // puede reservar para otra persona). El teléfono sí se rellena de su cuenta.
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState(telefonoSesion ?? '');
  const [email, setEmail] = useState('');
  const [nota, setNota] = useState('');

  React.useEffect(() => {
    if (telefonoSesion && !telefono) setTelefono(telefonoSesion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [telefonoSesion]);

  /**
   * Prellenado del perfil: nombre y teléfono de la cuenta. El usuario puede cambiarlos
   * (se reserva muchas veces para otra persona), pero no tiene que escribirlos otra vez.
   */
  React.useEffect(() => {
    let vivo = true;
    authApi.me()
      .then((perfil) => {
        if (!vivo) return;
        setNombre((n) => n || (perfil?.fullName ?? ''));
        setTelefono((t) => t || (perfil?.phone ?? ''));
        // El perfil no guarda correo (solo nombre, teléfono y datos de KYC): se deja vacío.
      })
      .catch(() => { /* sin perfil, se escribe a mano */ });
    return () => { vivo = false; };
  }, []);

  const [metodo, setMetodo] = useState<string>('transfer');
  const [pct, setPct] = useState<number | null>(null); // null = el del hotel

  const [dias, setDias] = useState<CalendarDay[]>([]);
  const [cargandoCal, setCargandoCal] = useState(true);
  const [room, setRoom] = useState<{
    name: string; minNights: number; maxNights: number; depositPercent: number;
    holdMinutes: number; capacity: number; totalUnits: number; cleaningFeeXaf: number;
    taxesXaf: number; basePriceXaf: number;
    /** Fotos reales de la habitación (las sube el hotelero). */
    images: string[];
    /** Horario de llegada y normas del hotel: lo que el huésped necesita al reservar. */
    checkinFrom: string | null; checkinUntil: string | null; checkoutUntil: string | null;
    houseRules: string | null; cancellationPolicy: string | null;
  } | null>(null);
  const [metodos, setMetodos] = useState<string[]>([]);
  const [nombreHotel, setNombreHotel] = useState(p.shopName ?? '');

  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecha, setHecha] = useState<Reservation | null>(null);
  const [referencia, setReferencia] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  // ── Carga de la habitación (precio, normas y formas de pago del hotel) ──
  const cargar = useCallback(async () => {
    setCargandoCal(true);
    setError(null);
    try {
      const { room: r } = await hotelApi.room(roomTypeId);
      setRoom({
        name: r.name, minNights: r.minNights, maxNights: r.maxNights,
        depositPercent: r.depositPercent, holdMinutes: r.holdMinutes, capacity: r.capacity,
        totalUnits: r.totalUnits, cleaningFeeXaf: r.cleaningFeeXaf, taxesXaf: r.taxesXaf,
        basePriceXaf: r.basePriceXaf,
        images: ((r.images ?? []) as { url?: string }[]).map((i) => absUrl(i?.url)).filter((u): u is string => !!u),
        checkinFrom: null, checkinUntil: null, checkoutUntil: null,
        houseRules: null, cancellationPolicy: null,
      });
      setMetodos((r.paymentMethods ?? []).length ? r.paymentMethods : ['transfer', 'in_store']);
      setMetodo((r.paymentMethods ?? []).includes('transfer') ? 'transfer' : (r.paymentMethods?.[0] ?? 'in_store'));
      if (r.hotel?.name) setNombreHotel(r.hotel.name);
      // Horario de llegada y normas del hotel: la ficha de la habitación no los trae,
      // así que se piden a la ficha del alojamiento (una petición más, y con esto el
      // huésped sabe a qué hora puede llegar ANTES de pagar la señal).
      if (r.hotel?.id) {
        try {
          const h = await hotelApi.hotel(r.hotel.id);
          setRoom((prev) => prev ? {
            ...prev,
            checkinFrom: h.hotel?.checkinFrom ?? null,
            checkinUntil: h.hotel?.checkinUntil ?? null,
            checkoutUntil: h.hotel?.checkoutUntil ?? null,
            houseRules: h.hotel?.houseRules ?? null,
            cancellationPolicy: h.hotel?.cancellationPolicy ?? null,
          } : prev);
        } catch { /* sin horario no se bloquea la reserva */ }
      }
      const cal = await hotelApi.calendar(roomTypeId, todayIso(), addDaysIso(todayIso(), MAX_NOCHES - 1), habitaciones);
      setDias(cal.days ?? []);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar la habitación.');
    } finally {
      setCargandoCal(false);
    }
  }, [roomTypeId, habitaciones]);

  React.useEffect(() => { void cargar(); }, [cargar]);

  // ── Disponibilidad del rango elegido, con el número de habitaciones pedido ──
  const disponibilidad = useMemo(() => {
    if (!checkIn || !checkOut) return { ok: false, motivo: 'Elige las fechas en el calendario' as string | null };
    const noches = dias.filter((d) => d.date >= checkIn && d.date < checkOut);
    const esperadas = nightsBetween(checkIn, checkOut);
    if (noches.length !== esperadas || !noches.length) {
      return { ok: false, motivo: 'Esas fechas están fuera del calendario disponible' };
    }
    const cerrada = noches.find((d) => d.closed);
    if (cerrada) return { ok: false, motivo: `El hotel tiene cerrada la noche del ${cerrada.date}` };
    const llena = noches.find((d) => Number(d.freeUnits) < habitaciones);
    if (llena) {
      return {
        ok: false,
        motivo: Number(llena.freeUnits) === 0
          ? `Ya no queda hueco la noche del ${llena.date}`
          : `Esa noche solo quedan ${llena.freeUnits} habitación(es) y pides ${habitaciones}`,
      };
    }
    const min = Math.max(Number(room?.minNights ?? 1), ...noches.map((d) => Number(d.minNights ?? 1)));
    if (esperadas < min) return { ok: false, motivo: `Esas fechas piden un mínimo de ${min} noche(s)` };
    if (room && esperadas > room.maxNights) {
      return { ok: false, motivo: `Como máximo ${room.maxNights} noche(s) por reserva` };
    }
    if (room && huespedes > room.capacity * habitaciones) {
      return {
        ok: false,
        motivo: `En ${habitaciones} habitación(es) de ese tipo caben ${room.capacity * habitaciones} persona(s)`,
      };
    }
    return { ok: true, motivo: null as string | null };
  }, [checkIn, checkOut, dias, habitaciones, room, huespedes]);

  // ── Cuenta (la calcula el servidor; aquí se reproduce igual para enseñarla) ──
  const cuenta = useMemo(() => {
    if (!checkIn || !checkOut || !room || !disponibilidad.ok) return null;
    const noches = dias.filter((d) => d.date >= checkIn && d.date < checkOut).map((d) => d.priceXaf);
    const nochesCount = nightsBetween(checkIn, checkOut);
    const precioReferencia = Math.max(...noches); // el servidor usa el mayor (snapshot prudente)
    const subtotal = precioReferencia * nochesCount * habitaciones;
    const limpieza = room.cleaningFeeXaf * habitaciones;
    const tasas = room.taxesXaf * habitaciones;
    const total = subtotal + limpieza + tasas;
    const pctFinal = Math.min(pct ?? room.depositPercent, room.depositPercent);
    const senal = Math.round((total * pctFinal) / 100);
    return {
      noches: nochesCount, precioReferencia, media: Math.round(precioReferencia),
      subtotal, limpieza, tasas, total, pct: pctFinal, senal, resto: total - senal,
    };
  }, [checkIn, checkOut, dias, room, habitaciones, pct, disponibilidad.ok]);

  const firma = `${roomTypeId}|${checkIn ?? ''}|${checkOut ?? ''}|${habitaciones}|${huespedes}|${metodo}|${cuenta?.pct ?? ''}`;

  const puedeConfirmar =
    disponibilidad.ok && !!cuenta && nombre.trim().length >= 3 && telefono.replace(/\D/g, '').length >= 6 && !enviando;

  // ── Reservar ──
  const reservar = async () => {
    if (!puedeConfirmar || !cuenta || !checkIn || !checkOut) return;
    setEnviando(true);
    setError(null);
    try {
      const out = await hotelApi.reserve(
        {
          roomTypeId,
          checkIn,
          checkOut,
          units: habitaciones,
          guests: huespedes,
          guestName: nombre.trim(),
          guestPhone: telefono.trim(),
          ...(email.trim() ? { guestEmail: email.trim() } : {}),
          paymentMethod: metodo,
          depositPercent: cuenta.pct,
          ...(nota.trim() ? { note: nota.trim() } : {}),
        },
        reserveKey(firma),
      );
      resetReserveKey(); // la siguiente reserva es otra: clave nueva
      setHecha(out.reservation);
      await cargar(); // el calendario refleja las noches que se acaban de ocupar
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.code === 'ROOM_SOLD_OUT'
            ? 'Alguien acaba de coger esas noches. Prueba otras fechas o pide otra habitación.'
            : e.message
          : 'No se pudo reservar. Revisa tu conexión.',
      );
    } finally {
      setEnviando(false);
    }
  };

  // ── Enviar la referencia de la transferencia ──
  const enviarReferencia = async () => {
    if (!hecha || referencia.trim().length < 4) return;
    setAviso(null);
    try {
      const out = await hotelApi.proof(hecha.id, referencia.trim());
      setHecha(out.reservation);
      setAviso('Referencia enviada: el hotel la comprobará y confirmará tu señal.');
    } catch (e) {
      setAviso(e instanceof ApiError ? e.message : 'No se pudo enviar la referencia.');
    }
  };

  // ═══════════════════════ pantalla de reserva hecha ════════════════════════
  if (hecha) {
    const sinSenal = hecha.depositXaf <= 0;
    return (
      <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
        <ScrollView contentContainerStyle={{ padding: espaciado.e16, paddingBottom: insets.bottom + 30, gap: espaciado.e12 }}>
          <Text style={[styles.ok, { color: colors.success }]}>Reserva hecha</Text>
          <Text style={[styles.codigo, { color: colors.textPrimary }]}>{hecha.code}</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            {nombreHotel || hecha.hotel?.name} · {hecha.roomName}
          </Text>
          <Text style={[styles.dato, { color: colors.textPrimary }]}>
            {longDate(hecha.checkIn)} → {longDate(hecha.checkOut)} · {hecha.nights} noche(s)
            {hecha.units > 1 ? ` · ${hecha.units} habitaciones` : ''}
          </Text>

          <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Linea etiqueta="Total de la estancia" valor={xaf(hecha.totalXaf)} fuerte />
            {sinSenal ? (
              <Linea etiqueta="Se paga al llegar al hotel" valor={xaf(hecha.totalXaf)} color={colors.secondary} fuerte />
            ) : (
              <>
                <Linea
                  etiqueta={`Señal a pagar AHORA (${hecha.depositPercent}%)`}
                  valor={xaf(hecha.depositXaf)}
                  color={colors.primary}
                  fuerte
                />
                <Linea etiqueta="Y al llegar al hotel" valor={xaf(hecha.remainingXaf)} color={colors.secondary} fuerte />
              </>
            )}
            <Linea etiqueta="Forma de pago" valor={METODO_ETIQUETA[hecha.paymentMethod] ?? hecha.paymentMethod} />
            <Linea
              etiqueta="Estado"
              valor={hecha.paymentStatus === 'proof_submitted' ? 'Comprobante enviado' : hecha.status === 'hold' ? 'Retenida sin pagar' : hecha.status}
            />
            {hecha.holdExpiresAt && hecha.status === 'hold' ? (
              <Text style={[styles.retencion, { color: colors.danger }]}>
                ⏳ La habitación está retenida {countdown(hecha.holdExpiresAt)}. Si no se paga la señal,
                se libera sola (no se te cobra nada).
              </Text>
            ) : null}
          </View>

          {!sinSenal && hecha.paymentStatus === 'pending' ? (
            <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.etiqueta, { color: colors.textSecondary }]}>
                PAGA LA SEÑAL POR TRANSFERENCIA O EN RECEPCIÓN
              </Text>
              <Text style={[styles.sub, { color: colors.textPrimary }]}>
                Haz la transferencia de {xaf(hecha.depositXaf)} con el código {hecha.code} como
                referencia y pega aquí el número de operación. El hotel lo comprueba y confirma tu
                reserva.
              </Text>
              <TextInput
                value={referencia}
                onChangeText={setReferencia}
                placeholder="Nº de operación / referencia de la transferencia"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
                accessibilityLabel="Referencia de la transferencia"
              />
              <Pressable
                onPress={() => void enviarReferencia()}
                disabled={referencia.trim().length < 4}
                accessibilityRole="button"
                accessibilityLabel="Enviar referencia"
                accessibilityState={{ disabled: referencia.trim().length < 4 }}
                style={[styles.cta, {
                  backgroundColor: referencia.trim().length < 4 ? colors.border : colors.primary,
                }]}
              >
                <Text style={styles.ctaTxt}>Enviar referencia</Text>
              </Pressable>
              {aviso ? <Text style={[styles.sub, { color: colors.textSecondary }]}>{aviso}</Text> : null}
            </View>
          ) : null}

          <Pressable
            onPress={() => router.replace('/lifebook-hotel-reservas' as never)}
            accessibilityRole="button"
            accessibilityLabel="Ver mis reservas"
            style={[styles.cta, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.ctaTxt}>Ver mis reservas</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ═══════════════════════ formulario de reserva ════════════════════════════
  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.barra, { paddingTop: insets.top + 6, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Volver" style={styles.volver}>
          <Text style={[styles.volverTxt, { color: colors.textPrimary }]}>‹</Text>
        </Pressable>
        <View style={{ flex: 1 }}>
          {/* El nombre de la habitación lo escribe el hotelero: no se recorta a media palabra. */}
          <Text style={[styles.titulo, { color: colors.textPrimary }]} numberOfLines={2}>
            {room?.name ?? 'Habitación'}
          </Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]} numberOfLines={1}>
            {nombreHotel || 'Alojamiento'}
          </Text>
        </View>
      </View>

      {cargandoCal && !room ? (
        <View style={styles.centro}><ActivityIndicator color={colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120, gap: espaciado.e12 }} keyboardShouldPersistTaps="handled">
          {/* ── La habitación, con sus fotos reales ── */}
          <PhotoGallery
            photos={room?.images ?? []}
            height={210}
            emptyLabel="Esta habitación todavía no tiene fotos"
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

          <View style={{ paddingHorizontal: espaciado.e14, gap: espaciado.e12 }}>
          {/* ── Horario de llegada y normas: lo que se pregunta al reservar ── */}
          {room?.checkinFrom ? (
            <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.etiqueta, { color: colors.textSecondary }]}>CÓMO LLEGAR</Text>
              <Text style={[styles.sub, { color: colors.textPrimary }]}>
                🕐 Entrada de {room.checkinFrom} a {room.checkinUntil ?? '—'} · salida hasta {room.checkoutUntil ?? '—'}
              </Text>
              {room.cancellationPolicy ? (
                <Text style={[styles.sub, { color: colors.textSecondary }]}>
                  Cancelación: {room.cancellationPolicy}
                </Text>
              ) : null}
              {room.houseRules ? (
                <Text style={[styles.sub, { color: colors.textSecondary }]}>Normas: {room.houseRules}</Text>
              ) : null}
            </View>
          ) : null}

          {/* ── 1. Fechas ── */}
          <CalendarPicker
            days={dias}
            checkIn={checkIn}
            checkOut={checkOut}
            onChange={(a, b) => { setCheckIn(a); setCheckOut(b); }}
            units={habitaciones}
            minNights={room?.minNights ?? 1}
            maxNights={Math.min(MAX_NOCHES, room?.maxNights ?? 30)}
            loading={cargandoCal}
            footer={
              disponibilidad.motivo ? (
                <Text style={[styles.aviso, { color: colors.danger }]}>{disponibilidad.motivo}</Text>
              ) : cuenta ? (
                <Text style={[styles.aviso, { color: colors.success }]}>
                  ✓ Disponible: {cuenta.noches} noche(s) · {xaf(cuenta.media)} por noche
                </Text>
              ) : null
            }
          />

          {/* ── 2. Habitaciones y huéspedes ── */}
          <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.etiqueta, { color: colors.textSecondary }]}>HABITACIONES Y HUÉSPEDES</Text>
            <Paso etiqueta="Habitaciones" valor={habitaciones} min={1} max={Math.min(10, room?.totalUnits ?? 1)}
              onCambio={setHabitaciones} />
            <Paso etiqueta="Huéspedes" valor={huespedes} min={1} max={Math.max(1, (room?.capacity ?? 2) * habitaciones)}
              onCambio={setHuespedes} />
            {room ? (
              <Text style={[styles.sub, { color: colors.textSecondary }]}>
                Quedan {room.totalUnits} habitación(es) de este tipo en total.
              </Text>
            ) : null}
          </View>

          {/* ── 3. Quién se aloja ── */}
          <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.etiqueta, { color: colors.textSecondary }]}>QUIÉN SE ALOJA</Text>
            <Campo etiqueta="Nombre y apellidos" valor={nombre} onCambio={setNombre} placeholder="Como en tu documento" />
            <Campo etiqueta="Teléfono" valor={telefono} onCambio={setTelefono} placeholder="+240 555 000 000" keyboardType="phone-pad" />
            <Campo etiqueta="Correo (opcional)" valor={email} onCambio={setEmail} placeholder="para el comprobante" keyboardType="email-address" />
            <Campo etiqueta="Petición al hotel (opcional)" valor={nota} onCambio={setNota} placeholder="Llegada tarde, cuna…" />
          </View>

          {/* ── 4. Pago: método del hotel y señal ── */}
          <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.etiqueta, { color: colors.textSecondary }]}>CÓMO SE PAGA</Text>
            <View style={styles.metodos}>
              {metodos.map((m) => {
                const activo = m === metodo;
                return (
                  <Pressable
                    key={m}
                    onPress={() => setMetodo(m)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: activo }}
                    accessibilityLabel={METODO_ETIQUETA[m] ?? m}
                    style={[styles.chip, {
                      borderColor: activo ? colors.primary : colors.border,
                      backgroundColor: activo ? alpha(colors.primary, 0.1) : colors.surface,
                    }]}
                  >
                    <Text style={[styles.chipTxt, { color: activo ? colors.primary : colors.textSecondary }]}>
                      {METODO_ETIQUETA[m] ?? m}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {room && room.depositPercent > 0 ? (
              <>
                <Text style={[styles.sub, { color: colors.textSecondary, marginTop: espaciado.e6 }]}>
                  Señal: elige cuánto pagas ahora (el hotel pide hasta el {room.depositPercent} %).
                  El resto, al llegar.
                </Text>
                <View style={styles.metodos}>
                  {[room.depositPercent, Math.max(10, Math.round(room.depositPercent / 2)), 0].map((opcion) => {
                    const activo = (pct ?? room.depositPercent) === opcion;
                    return (
                      <Pressable
                        key={opcion}
                        onPress={() => setPct(opcion)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: activo }}
                        accessibilityLabel={opcion === 0 ? 'Sin señal, pagar todo al llegar' : `Señal del ${opcion} por ciento`}
                        style={[styles.chip, {
                          borderColor: activo ? colors.primary : colors.border,
                          backgroundColor: activo ? alpha(colors.primary, 0.1) : colors.surface,
                        }]}
                      >
                        <Text style={[styles.chipTxt, { color: activo ? colors.primary : colors.textSecondary }]}>
                          {opcion === 0 ? 'Sin señal (todo al llegar)' : `${opcion} % ahora`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            ) : (
              <Text style={[styles.sub, { color: colors.textSecondary, marginTop: espaciado.e6 }]}>
                Este tipo de habitación se paga al llegar (sin señal).
              </Text>
            )}
          </View>

          {/* ── 5. Cuenta ── */}
          {cuenta ? (
            <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.etiqueta, { color: colors.textSecondary }]}>CUENTA</Text>
              <Linea etiqueta={`${cuenta.noches} noche(s) × ${habitaciones} habitación(es)`} valor={xaf(cuenta.subtotal)} />
              <Linea etiqueta="Precio por noche" valor={xaf(cuenta.precioReferencia)} tenue />
              {cuenta.limpieza ? <Linea etiqueta="Limpieza" valor={xaf(cuenta.limpieza)} /> : null}
              {cuenta.tasas ? <Linea etiqueta="Tasas" valor={xaf(cuenta.tasas)} /> : null}
              <View style={[styles.separador, { backgroundColor: colors.border }]} />
              <Linea etiqueta="Total de la estancia" valor={xaf(cuenta.total)} fuerte />
              {cuenta.senal > 0 ? (
                <>
                  <Linea etiqueta={`Pagas AHORA (señal ${cuenta.pct} %)`} valor={xaf(cuenta.senal)} color={colors.primary} fuerte />
                  <Linea etiqueta="Pagas al llegar" valor={xaf(cuenta.resto)} color={colors.secondary} fuerte />
                </>
              ) : (
                <Linea etiqueta="Pagas todo al llegar" valor={xaf(cuenta.total)} color={colors.secondary} fuerte />
              )}
              {cuenta.senal > 0 && room ? (
                <Text style={[styles.sub, { color: colors.textSecondary }]}>
                  Al confirmar, la habitación queda retenida {room.holdMinutes} minutos mientras pagas la
                  señal. Si no se paga, se libera sola.
                </Text>
              ) : null}
            </View>
          ) : null}

          {error ? (
            <View style={[styles.error, { borderColor: colors.danger, backgroundColor: alpha(colors.danger, 0.06) }]}>
              <Text style={{ color: colors.danger, fontSize: tipografia.body, fontWeight: peso.medio }}>{error}</Text>
            </View>
          ) : null}
          </View>
        </ScrollView>
      )}

      {/* ── CTA fija: nunca activa si no hay disponibilidad ── */}
      <View style={[styles.pie, { paddingBottom: insets.bottom + 10, borderTopColor: colors.border, backgroundColor: colors.card }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.pieEtq, { color: colors.textSecondary }]}>
            {cuenta ? (cuenta.senal > 0 ? `Ahora ${xaf(cuenta.senal)} · al llegar ${xaf(cuenta.resto)}` : 'Se paga al llegar') : 'Elige las fechas'}
          </Text>
          <Text style={[styles.pieTotal, { color: colors.textPrimary }]}>
            {cuenta ? xaf(cuenta.total) : '—'}
          </Text>
        </View>
        <Pressable
          onPress={() => void reservar()}
          disabled={!puedeConfirmar}
          accessibilityRole="button"
          accessibilityLabel="Confirmar reserva"
          accessibilityState={{ disabled: !puedeConfirmar, busy: enviando }}
          style={[styles.confirmar, { backgroundColor: puedeConfirmar ? colors.primary : colors.border }]}
        >
          {enviando ? <ActivityIndicator color={brand.white} /> : <Text style={styles.ctaTxt}>Confirmar reserva</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─────────────────────────── piezas ─────────────────────────────────────────

function Linea({
  etiqueta, valor, tenue, fuerte, color,
}: { etiqueta: string; valor: string; tenue?: boolean; fuerte?: boolean; color?: string }) {
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

function Paso({
  etiqueta, valor, min, max, onCambio,
}: { etiqueta: string; valor: number; min: number; max: number; onCambio: (v: number) => void }) {
  const { colors } = useTheme();
  const boton = (t: string, d: number, off: boolean) => (
    <Pressable
      onPress={() => !off && onCambio(Math.min(max, Math.max(min, valor + d)))}
      disabled={off}
      accessibilityRole="button"
      accessibilityLabel={`${d > 0 ? 'Añadir' : 'Quitar'} ${etiqueta}`}
      accessibilityState={{ disabled: off }}
      style={[styles.pasoBtn, { borderColor: colors.border, backgroundColor: colors.surface, opacity: off ? 0.35 : 1 }]}
    >
      <Text style={[styles.pasoBtnTxt, { color: colors.textPrimary }]}>{t}</Text>
    </Pressable>
  );
  return (
    <View style={styles.linea}>
      <Text style={[styles.lineaEtq, { color: colors.textPrimary }]}>{etiqueta}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e10 }}>
        {boton('−', -1, valor <= min)}
        <Text style={[styles.pasoVal, { color: colors.textPrimary }]}>{valor}</Text>
        {boton('+', 1, valor >= max)}
      </View>
    </View>
  );
}

function Campo({
  etiqueta, valor, onCambio, placeholder, keyboardType,
}: {
  etiqueta: string; valor: string; onCambio: (v: string) => void; placeholder?: string;
  keyboardType?: 'default' | 'phone-pad' | 'email-address';
}) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: espaciado.e8 }}>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>{etiqueta}</Text>
      <TextInput
        value={valor}
        onChangeText={onCambio}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        keyboardType={keyboardType ?? 'default'}
        style={[styles.input, { color: colors.textPrimary, borderColor: colors.border, backgroundColor: colors.surface }]}
        accessibilityLabel={etiqueta}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  volverFlotante: {
    position: 'absolute', left: 12, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  volverFlotanteTxt: { color: brand.white, fontSize: 24, fontWeight: peso.fuerte, lineHeight: 26 },
  barra: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10, borderBottomWidth: trazo.fino },
  volver: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  volverTxt: { fontSize: 26, fontWeight: peso.fuerte, lineHeight: 28 },
  titulo: { fontSize: 16.5, fontWeight: peso.maximo },
  sub: { fontSize: tipografia.caption },
  dato: { fontSize: tipografia.body, fontWeight: peso.medio },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bloque: { borderWidth: trazo.fino, borderRadius: 18, padding: espaciado.e12, gap: espaciado.e3 },
  etiqueta: { fontSize: 10.5, fontWeight: peso.maximo, letterSpacing: 0.6 },
  linea: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espaciado.e10, marginTop: espaciado.e6 },
  lineaEtq: { fontSize: tipografia.caption, flex: 1 },
  lineaVal: { fontSize: tipografia.body },
  separador: { height: 1, marginVertical: espaciado.e7 },
  input: { borderWidth: trazo.fino, borderRadius: radios.md, paddingHorizontal: espaciado.e12, height: altura.control, fontSize: 14.5, marginTop: espaciado.e4 },
  metodos: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8, marginTop: espaciado.e8 },
  chip: { borderWidth: trazo.fino, borderRadius: 20, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e7 },
  chipTxt: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  pasoBtn: { width: 34, height: 34, borderWidth: trazo.fino, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pasoBtnTxt: { fontSize: 18, fontWeight: peso.maximo, lineHeight: 20 },
  pasoVal: { fontSize: 15, fontWeight: peso.maximo, minWidth: 22, textAlign: 'center' },
  aviso: { fontSize: tipografia.caption, marginTop: espaciado.e8, fontWeight: peso.medio },
  error: { borderWidth: trazo.fino, borderRadius: 14, padding: espaciado.e12 },
  pie: {
    position: 'absolute', left: 0, right: 0, bottom: 0, borderTopWidth: trazo.fino,
    paddingHorizontal: espaciado.e14, paddingTop: espaciado.e10, flexDirection: 'row', alignItems: 'center', gap: espaciado.e12,
  },
  pieEtq: { fontSize: tipografia.micro },
  pieTotal: { fontSize: tipografia.subtitle, fontWeight: peso.maximo },
  confirmar: { minWidth: 170, height: altura.campo, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espaciado.e14 },
  cta: { height: altura.campo, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: espaciado.e6 },
  ctaTxt: { color: brand.white, fontSize: 15, fontWeight: peso.maximo },
  ok: { fontSize: tipografia.title, fontWeight: peso.maximo, marginTop: espaciado.e8 },
  codigo: { fontSize: 26, fontWeight: peso.maximo, letterSpacing: 1 },
  retencion: { fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e6 },
});
