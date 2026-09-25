/**
 * lifebook-hotel-detalle — FICHA de un alojamiento + sus habitaciones y calendario.
 *
 * Enseña lo que decide la compra, sin rodeos: fotos, normas de llegada, servicios,
 * y por cada tipo de habitación **el calendario con el precio de cada noche**, la
 * disponibilidad real, la estancia mínima y **cuánto se paga ahora (señal) y cuánto
 * al llegar**. Elegir fechas aquí lleva directo a reservar con esos días puestos.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, altura, brand, espaciado, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { Car, Navigation } from 'lucide-react-native';
import { CalendarPicker, type CalendarDay } from '../components/CalendarPicker';
import { PhotoGallery } from '../components/PhotoGallery';
import { hotelApi, type HotelProfile, type HotelRoom, type HotelFx, type HotelArrival, type HotelAirport } from '../api/hotel';
import { ApiError } from '../api/httpClient';
import { absUrl } from '../api/config';
import { nightsBetween, shortDate, todayIso, xaf } from '../utils/datetime';
import { abrirMapa } from '../utils/maps';
import { formatearMoneda, getPaisParaPrecios, setPaisElegido } from '../utils/region';

const MAX_NOCHES = 92;
/** Acento del marketplace (naranja), como en el resto del flujo de servicios. */
const ACCENT = brand.primary; // A1: la acción avanza en azul

/** Etiquetas legibles de los servicios (las claves las define el servidor). */
const SERVICIOS: Record<string, string> = {
  wifi: 'Wi-Fi', desayuno: 'Desayuno', aire: 'Aire acondicionado', piscina: 'Piscina',
  parking: 'Aparcamiento', restaurante: 'Restaurante', bar: 'Bar', gimnasio: 'Gimnasio',
  recepcion_24h: 'Recepción 24 h', agua_caliente: 'Agua caliente', generador: 'Generador',
  lavanderia: 'Lavandería', tv: 'TV', terraza: 'Terraza', ascensor: 'Ascensor',
  admite_mascotas: 'Admite mascotas', adaptado: 'Adaptado', cocina: 'Cocina',
  nevera: 'Nevera', caja_fuerte: 'Caja fuerte', seguridad: 'Seguridad',
};

const TIPOS: Record<string, string> = {
  hotel: 'Hotel', hostal: 'Hostal', guest_house: 'Casa de huéspedes',
  apartahotel: 'Apartahotel', resort: 'Resort', motel: 'Motel',
};

export default function HotelDetalleScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const p = useLocalSearchParams<{
    id: string; checkIn?: string; checkOut?: string; guests?: string; units?: string;
  }>();
  const shopId = String(p.id ?? '');

  const [hotel, setHotel] = useState<HotelProfile | null>(null);
  const [rooms, setRooms] = useState<HotelRoom[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // ── LA MONEDA DEL HUÉSPED ────────────────────────────────────────────────────
  // El precio real es en XAF y el cobro es en efectivo, pero quien reserva desde fuera necesita ver
  // cuánto es en su moneda. `pais` sale de la configuración regional del móvil (o de lo que elija el
  // huésped a mano) y el SERVIDOR hace la conversión: aquí no se calcula nada.
  const [pais, setPais] = useState<string | null>(null);
  const [fx, setFx] = useState<HotelFx | null>(null);
  const [paises, setPaises] = useState<Array<{ code: string; label: string; currency: string; symbol: string }>>([]);
  const [elegirMoneda, setElegirMoneda] = useState(false);
  const [arrival, setArrival] = useState<HotelArrival | null>(null);
  const [airport, setAirport] = useState<HotelAirport | null>(null);

  const [huespedes] = useState(Number(p.guests ?? 2));
  const [habitaciones] = useState(Number(p.units ?? 1));
  const [checkIn, setCheckIn] = useState<string | null>(p.checkIn ?? null);
  const [checkOut, setCheckOut] = useState<string | null>(p.checkOut ?? null);

  // Habitación con el calendario abierto (una cada vez: no se pintan N calendarios).
  const [abierta, setAbierta] = useState<string | null>(null);
  const [dias, setDias] = useState<CalendarDay[]>([]);
  const [cargandoCal, setCargandoCal] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const out = await hotelApi.hotel(shopId, pais);
      setHotel(out.hotel);
      setRooms(out.rooms ?? []);
      setFx(out.fx ?? null);
      setArrival(out.arrival ?? null);
      setAirport(out.airport ?? null);
      if (!abierta && out.rooms?.length) setAbierta(out.rooms[0].id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar el alojamiento.');
    } finally {
      setCargando(false);
    }
  }, [shopId, abierta, pais]);

  useEffect(() => { void cargar(); }, [cargar]);

  // El país, una sola vez al abrir: lo elegido a mano manda sobre lo que diga el sistema.
  useEffect(() => {
    let vivo = true;
    void getPaisParaPrecios().then((p) => { if (vivo && p) setPais(p); });
    return () => { vivo = false; };
  }, []);

  // La lista de países (público): solo se pide cuando el huésped abre el selector, para no gastar una
  // petición en cada visita a la ficha.
  useEffect(() => {
    if (!elegirMoneda || paises.length) return;
    void hotelApi.fx(pais).then((r) => setPaises(r.paises ?? [])).catch(() => undefined);
  }, [elegirMoneda, paises.length, pais]);

  // Calendario de la habitación abierta (92 días de una vez: una sola consulta).
  useEffect(() => {
    if (!abierta) { setDias([]); return; }
    let vivo = true;
    setCargandoCal(true);
    hotelApi
      .calendar(abierta, todayIso(), addDays(todayIso(), MAX_NOCHES), habitaciones)
      .then((c) => { if (vivo) setDias(c.days ?? []); })
      .catch(() => { if (vivo) setDias([]); })
      .finally(() => { if (vivo) setCargandoCal(false); });
    return () => { vivo = false; };
  }, [abierta, habitaciones]);

  const noches = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;
  const roomAbierta = rooms.find((r) => r.id === abierta) ?? null;

  const cuenta = (() => {
    if (!roomAbierta || !noches) return null;
    const precios = dias
      .filter((d) => checkIn && checkOut && d.date >= checkIn && d.date < checkOut)
      .map((d) => d.priceXaf);
    if (precios.length !== noches) return null;
    const subtotal = precios.reduce((a, b) => a + b, 0) * habitaciones;
    const limpieza = roomAbierta.cleaningFeeXaf * habitaciones;
    const tasas = roomAbierta.taxesXaf * habitaciones;
    const total = subtotal + limpieza + tasas;
    const senal = Math.round((total * roomAbierta.depositPercent) / 100);
    return { subtotal, limpieza, tasas, total, senal, resto: total - senal, media: Math.round(subtotal / noches / habitaciones) };
  })();

  const irAReservar = (room: HotelRoom) => {
    router.push({
      pathname: '/lifebook-hotel-reservar',
      params: {
        roomTypeId: room.id,
        shopId,
        shopName: hotel?.name ?? '',
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
        {/* El nombre del alojamiento lo escribe el hotelero: dos líneas antes que recortarlo. */}
        <Text style={[styles.titulo, { color: colors.textPrimary }]} numberOfLines={2}>
          {hotel?.name ?? 'Alojamiento'}
        </Text>
      </View>

      {cargando ? (
        <View style={styles.centro}><ActivityIndicator color={colors.primary} /></View>
      ) : error ? (
        <View style={[styles.error, { borderColor: colors.danger, backgroundColor: alpha(colors.danger, 0.06) }]}>
          <Text style={{ color: colors.danger, fontSize: tipografia.body, fontWeight: peso.medio }}>{error}</Text>
          <Pressable onPress={() => void cargar()} accessibilityRole="button" accessibilityLabel="Reintentar">
            <Text style={[styles.enlace, { color: colors.primary }]}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30, gap: espaciado.e14 }}>
          {/* ── Galería del alojamiento (fotos reales subidas por el hotelero) ── */}
          <PhotoGallery
            photos={[
              absUrl(hotel?.coverUrl),
              ...rooms.flatMap((r) => (r.images ?? []).map((i) => absUrl((i as { url?: string })?.url))),
            ].filter((u): u is string => !!u)}
            height={230}
            emptyLabel="Este alojamiento todavía no tiene fotos"
            emptyIcon="🏨"
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

          <View style={{ paddingHorizontal: espaciado.e14, gap: espaciado.e14 }}>
          {/* ── Datos del alojamiento ── */}
          <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.nombre, { color: colors.textPrimary }]}>{hotel?.name}</Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              {[TIPOS[hotel?.propertyKind ?? ''] ?? null, hotel?.stars ? `${hotel.stars}★` : null,
                hotel?.barrio, hotel?.city].filter(Boolean).join(' · ')}
            </Text>
            {/* Horario de llegada: es la primera pregunta del huésped al reservar. */}
            <Text style={[styles.dato, { color: colors.textPrimary }]}>
              🕐 Entrada de {hotel?.checkinFrom} a {hotel?.checkinUntil} · salida hasta {hotel?.checkoutUntil}
              {hotel?.receptionOpen24h ? ' · recepción 24 h' : ''}
            </Text>
            {hotel?.addressReference ? (
              <Text style={[styles.sub, { color: colors.textSecondary }]}>📍 {hotel.addressReference}</Text>
            ) : null}

            {/* ── CÓMO LLEGAR ────────────────────────────────────────────────────────
                Una referencia («frente al mar») no lleva a ningún sitio. Con las coordenadas del
                hotel, el botón abre el mapa EN EL PUNTO; sin ellas, cae a buscar el texto. */}
            {arrival && (arrival.lat !== null || arrival.addressReference) ? (
              <Pressable
                onPress={() => abrirMapa(arrival.lat, arrival.lng, arrival.addressReference ?? hotel?.name ?? null)}
                accessibilityRole="button"
                accessibilityLabel={`Cómo llegar a ${hotel?.name ?? 'el alojamiento'}`}
                style={[styles.botonLinea, { borderColor: colors.border, backgroundColor: colors.surface }]}
              >
                <Navigation size={14} color={colors.secondary} />
                <Text style={[styles.botonLineaTxt, { color: colors.textPrimary }]}>
                  Cómo llegar{arrival.lat !== null ? '' : ' (por la referencia escrita)'}
                </Text>
              </Pressable>
            ) : null}

            {/* ── AL LLEGAR ──────────────────────────────────────────────────────────
                Lo que el huésped necesita cuando baja del taxi: dónde se entra y dónde está la
                recepción. Lo escribe el hotel en su panel (si no lo ha escrito, no se inventa). */}
            {arrival?.note ? (
              <View style={[styles.aviso, { borderColor: alpha(colors.success, 0.45), backgroundColor: alpha(colors.success, 0.10) }]}>
                <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: colors.success }}>🔑 Al llegar</Text>
                <Text style={{ fontSize: tipografia.caption, color: colors.textPrimary, marginTop: espaciado.e3, lineHeight: 16 }}>{arrival.note}</Text>
              </View>
            ) : null}

            {/* ── TAXI DESDE EL AEROPUERTO ───────────────────────────────────────────
                Llegar al aeropuerto y poder ir al hotel sin escribir una sola dirección: el origen
                (el aeropuerto de la ciudad) y el destino (el hotel) van puestos. El precio de
                referencia de la zona se enseña ANTES de pedirlo, para que no haya sorpresas. */}
            {airport ? (
              <View style={[styles.aviso, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: colors.textPrimary }}>🛫 ¿Llegas al aeropuerto?</Text>
                <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e3, lineHeight: 15 }}>
                  Pide un taxi {airport.label} → {hotel?.name}
                  {airport.priceFromXaf !== null && airport.priceToXaf !== null
                    ? ` · desde ${xaf(airport.priceFromXaf)} hasta ${xaf(airport.priceToXaf)}`
                    : ''}
                </Text>
                <Pressable
                  onPress={() => router.push({
                    pathname: '/taxi',
                    params: {
                      city: airport.city ?? hotel?.city ?? '',
                      oLat: String(airport.lat), oLng: String(airport.lng), oLabel: airport.label,
                      dLat: String(arrival?.lat ?? ''), dLng: String(arrival?.lng ?? ''),
                      dLabel: hotel?.name ?? '',
                    },
                  } as never)}
                  accessibilityRole="button"
                  accessibilityLabel="Pedir un taxi desde el aeropuerto hasta el hotel"
                  style={[styles.botonLinea, { borderColor: alpha(ACCENT, 0.5), backgroundColor: alpha(ACCENT, 0.10) }]}
                >
                  <Car size={14} color={ACCENT} />
                  <Text style={[styles.botonLineaTxt, { color: ACCENT }]}>Pedir taxi al hotel</Text>
                </Pressable>
              </View>
            ) : null}
            {hotel?.description ? (
              <Text style={[styles.dato, { color: colors.textPrimary }]}>{hotel.description}</Text>
            ) : null}

            {(hotel?.amenities ?? []).length ? (
              <View style={styles.servicios}>
                {(hotel?.amenities ?? []).map((a) => (
                  <View key={a} style={[styles.servicio, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                    <Text style={[styles.servicioTxt, { color: colors.textPrimary }]}>
                      {SERVICIOS[a] ?? a.replace(/_/g, ' ')}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {(hotel?.paymentMethods ?? []).length ? (
              <Text style={[styles.sub, { color: colors.textSecondary }]}>
                Formas de pago:{' '}
                {(hotel?.paymentMethods ?? [])
                  .map((m) => (typeof m === 'string' ? m : m.method))
                  .map((m) => ({ transfer: 'transferencia', in_store: 'en recepción', billing: 'facturación',
                    deposit: 'señal', cash_on_delivery: 'contra entrega', likebook_wallet: 'monedero' }[m] ?? m))
                  .join(' · ')}
              </Text>
            ) : null}
            {hotel?.houseRules ? (
              <Text style={[styles.sub, { color: colors.textSecondary }]}>Normas: {hotel.houseRules}</Text>
            ) : null}
            {hotel?.cancellationPolicy ? (
              <Text style={[styles.sub, { color: colors.textSecondary }]}>Cancelación: {hotel.cancellationPolicy}</Text>
            ) : null}
          </View>

          {/* ── Habitaciones ── */}
          <Text style={[styles.seccion, { color: colors.textPrimary }]}>
            Habitaciones ({rooms.length})
          </Text>

          {/* ── CON QUÉ MONEDA ESTÁ VIENDO LOS PRECIOS ────────────────────────────────
              El precio real, y el que se cobra, es en XAF (en efectivo, al llegar al hotel). Esto
              solo cambia CÓMO SE ENSEÑA, para que quien reserva desde fuera sepa cuánto es. Se dice
              con todas las letras, con la fecha del cambio y sin llamarlo «precio»: es una referencia. */}
          <View style={{ gap: espaciado.e6 }}>
            <Pressable
              onPress={() => setElegirMoneda((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Elegir el país para ver los precios en su moneda"
              style={[styles.botonLinea, { borderColor: colors.border, backgroundColor: colors.surface, alignSelf: 'flex-start' }]}
            >
              <Text style={[styles.botonLineaTxt, { color: colors.textPrimary }]}>
                {fx && !fx.esMonedaDelCobro
                  ? `${fx.countryLabel ?? fx.currency} · ${fx.symbol}`
                  : '💱 Ver los precios en otra moneda'}
              </Text>
            </Pressable>
            {fx && !fx.esMonedaDelCobro ? (
              <Text style={[styles.sub, { color: colors.textSecondary }]}>
                Equivalencia orientativa al cambio del {fx.updatedAt ? shortDate(String(fx.updatedAt).slice(0, 10)) : '—'}.
                El pago es en XAF (francos), en efectivo al llegar.
              </Text>
            ) : null}
            {elegirMoneda ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6 }}>
                {paises.length === 0 ? (
                  <Text style={[styles.sub, { color: colors.textSecondary }]}>Cargando países…</Text>
                ) : (
                  paises.map((p) => (
                    <Pressable
                      key={p.code}
                      onPress={() => { setElegirMoneda(false); setPais(p.code); void setPaisElegido(p.code); }}
                      accessibilityRole="button"
                      accessibilityLabel={`Ver los precios desde ${p.label} (${p.currency})`}
                      style={[styles.botonLinea, {
                        borderColor: pais === p.code ? colors.secondary : colors.border,
                        backgroundColor: pais === p.code ? alpha(colors.secondary, 0.12) : colors.surface,
                      }]}
                    >
                      <Text style={[styles.botonLineaTxt, { color: colors.textPrimary }]}>{p.label} · {p.currency}</Text>
                    </Pressable>
                  ))
                )}
              </View>
            ) : null}
          </View>

          {rooms.length === 0 ? (
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              Este alojamiento todavía no tiene habitaciones publicadas.
            </Text>
          ) : null}

          {rooms.map((r) => {
            const esAbierta = r.id === abierta;
            return (
              <View key={r.id} style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Pressable
                  onPress={() => setAbierta(esAbierta ? null : r.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${r.name}: ${esAbierta ? 'ocultar' : 'ver'} calendario`}
                  accessibilityState={{ expanded: esAbierta }}
                >
                  <View style={styles.filaHab}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.habNombre, { color: colors.textPrimary }]}>{r.name}</Text>
                      <Text style={[styles.sub, { color: colors.textSecondary }]}>
                        {r.capacity} huésped(es)
                        {r.beds?.length ? ` · ${r.beds.map((b) => `${b.count} ${b.kind}`).join(', ')}` : ''}
                        {r.sizeM2 ? ` · ${r.sizeM2} m²` : ''}
                        {r.totalUnits > 1 ? ` · ${r.totalUnits} iguales` : ''}
                      </Text>
                      <Text style={[styles.sub, { color: colors.textSecondary }]}>
                        Estancia mínima {r.minNights} noche(s)
                        {r.depositPercent > 0 ? ` · señal del ${r.depositPercent}%` : ' · sin señal (pago al llegar)'}
                        {r.cancellationHours ? ` · cancelación gratis hasta ${r.cancellationHours} h antes` : ''}
                      </Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[styles.precio, { color: colors.secondary }]}>{xaf(r.basePriceXaf)}</Text>
                      {/* ── EL PRECIO EN LA MONEDA DEL HUÉSPED ────────────────────────
                          El precio real es el XAF (es lo que se cobra, en efectivo, al llegar). El
                          equivalente se enseña para que un huésped de fuera sepa cuánto es: lo calcula
                          el servidor. Si el país usa XAF, `esMonedaDelCobro` lo dice y NO se repite la
                          misma cifra con un «≈». */}
                      {typeof r.pricePerNightLocal === 'number' && fx && !fx.esMonedaDelCobro ? (
                        <Text style={[styles.sub, { color: colors.textSecondary }]}>
                          ≈ {formatearMoneda(r.pricePerNightLocal, fx.currency, fx.decimals)}
                        </Text>
                      ) : null}
                      <Text style={[styles.sub, { color: colors.textSecondary }]}>por noche</Text>
                    </View>
                  </View>
                </Pressable>

                {esAbierta ? (
                  <View style={{ marginTop: espaciado.e10, gap: espaciado.e10 }}>
                    <CalendarPicker
                      days={dias}
                      checkIn={checkIn}
                      checkOut={checkOut}
                      onChange={(a, b) => { setCheckIn(a); setCheckOut(b); }}
                      units={habitaciones}
                      minNights={r.minNights}
                      maxNights={Math.min(MAX_NOCHES, r.maxNights)}
                      loading={cargandoCal}
                    />

                    {/* ── La cuenta, con el pago parcial bien visible ── */}
                    {cuenta ? (
                      <View style={[styles.cuenta, { borderColor: colors.border, backgroundColor: colors.surface }]}>
                        <Fila etiqueta={`${noches} noche(s)${habitaciones > 1 ? ` × ${habitaciones} habitaciones` : ''}`} valor={xaf(cuenta.subtotal)} />
                        <Fila etiqueta={`Precio medio por noche`} valor={xaf(cuenta.media)} tenue />
                        {cuenta.limpieza ? <Fila etiqueta="Limpieza" valor={xaf(cuenta.limpieza)} /> : null}
                        {cuenta.tasas ? <Fila etiqueta="Tasas" valor={xaf(cuenta.tasas)} /> : null}
                        <View style={[styles.separador, { backgroundColor: colors.border }]} />
                        <Fila etiqueta="Total de la estancia" valor={xaf(cuenta.total)} fuerte />
                        {cuenta.senal > 0 ? (
                          <>
                            <Fila
                              etiqueta={`Se pagará AHORA (señal ${r.depositPercent}%)`}
                              valor={xaf(cuenta.senal)}
                              color={colors.primary}
                              fuerte
                            />
                            <Fila etiqueta="Y al llegar al hotel" valor={xaf(cuenta.resto)} color={colors.secondary} fuerte />
                            <Text style={[styles.sub, { color: colors.textSecondary }]}>
                              La habitación queda retenida {r.holdMinutes} min mientras se paga la señal.
                            </Text>
                          </>
                        ) : (
                          <Fila etiqueta="Se paga todo al llegar" valor={xaf(cuenta.total)} color={colors.secondary} fuerte />
                        )}
                      </View>
                    ) : (
                      <Text style={[styles.sub, { color: colors.textSecondary }]}>
                        Elige entrada y salida en el calendario para ver el total y la señal.
                      </Text>
                    )}

                    <Pressable
                      onPress={() => irAReservar(r)}
                      accessibilityRole="button"
                      accessibilityLabel={`Reservar ${r.name}`}
                      style={[styles.cta, { backgroundColor: colors.primary }]}
                    >
                      <Text style={styles.ctaTxt}>
                        {noches ? `Reservar · ${cuenta ? xaf(cuenta.total) : `${noches} noche(s)`}` : 'Elegir fechas y reservar'}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}

          {checkIn && checkOut ? (
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              Fechas elegidas: {shortDate(checkIn, true)} → {shortDate(checkOut, true)} · {noches} noche(s)
            </Text>
          ) : null}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Fila({
  etiqueta, valor, tenue, fuerte, color,
}: { etiqueta: string; valor: string; tenue?: boolean; fuerte?: boolean; color?: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.filaCuenta}>
      <Text style={[styles.cuentaEtq, { color: tenue ? colors.textSecondary : colors.textPrimary, fontWeight: fuerte ? peso.fuerte : peso.medio }]}>
        {etiqueta}
      </Text>
      <Text style={[styles.cuentaVal, { color: color ?? colors.textPrimary, fontWeight: fuerte ? peso.maximo : peso.medio }]}>
        {valor}
      </Text>
    </View>
  );
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  barra: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10, borderBottomWidth: trazo.fino },
  volver: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  volverTxt: { fontSize: 26, fontWeight: peso.fuerte, lineHeight: 28 },
  // Botón de volver flotante sobre la galería (la barra superior se ve, pero en la
  // ficha el pulgar está abajo: conviene tenerlo también aquí).
  volverFlotante: {
    position: 'absolute', left: 12, width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  volverFlotanteTxt: { color: brand.white, fontSize: 24, fontWeight: peso.fuerte, lineHeight: 26 },
  titulo: { fontSize: 16.5, fontWeight: peso.maximo, flex: 1 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { margin: espaciado.e14, borderWidth: trazo.fino, borderRadius: 14, padding: espaciado.e12, gap: espaciado.e6 },
  enlace: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  bloque: { borderWidth: trazo.fino, borderRadius: 18, padding: espaciado.e12, gap: espaciado.e4 },
  nombre: { fontSize: 18, fontWeight: peso.maximo },
  sub: { fontSize: tipografia.caption },
  dato: { fontSize: tipografia.body, marginTop: espaciado.e4 },
  servicios: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6, marginTop: espaciado.e8 },
  servicio: { borderWidth: trazo.fino, borderRadius: 20, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e4 },
  servicioTxt: { fontSize: tipografia.caption },
  seccion: { fontSize: 15, fontWeight: peso.maximo },
  /** Botón de línea (Cómo llegar, taxi, elegir moneda): el mismo aspecto en los tres sitios. */
  botonLinea: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, borderWidth: trazo.fino, borderRadius: 10, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8, marginTop: espaciado.e6 },
  botonLineaTxt: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  /** Aviso con borde (Al llegar / taxi): información que el huésped necesita, sin gritar. */
  aviso: { borderWidth: trazo.fino, borderRadius: 10, padding: espaciado.e10, marginTop: espaciado.e8 },
  filaHab: { flexDirection: 'row', gap: espaciado.e10, alignItems: 'flex-start' },
  habNombre: { fontSize: 14.5, fontWeight: peso.maximo },
  precio: { fontSize: 15, fontWeight: peso.maximo },
  cuenta: { borderWidth: trazo.fino, borderRadius: 14, padding: espaciado.e10, gap: espaciado.e3 },
  filaCuenta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espaciado.e10 },
  cuentaEtq: { fontSize: tipografia.caption, flex: 1 },
  cuentaVal: { fontSize: tipografia.body },
  separador: { height: 1, marginVertical: espaciado.e5 },
  cta: { height: altura.campo, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  ctaTxt: { color: brand.white, fontSize: 15, fontWeight: peso.maximo },
});
