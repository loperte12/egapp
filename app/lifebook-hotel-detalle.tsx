/**
 * lifebook-hotel-detalle — FICHA de un alojamiento + sus habitaciones y calendario.
 *
 * Enseña lo que decide la compra, sin rodeos: fotos, normas de llegada, servicios,
 * y por cada tipo de habitación **el calendario con el precio de cada noche**, la
 * disponibilidad real, la estancia mínima y **cuánto se paga ahora (señal) y cuánto
 * al llegar**. Elegir fechas aquí lleva directo a reservar con esos días puestos.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, altura, brand, espaciado, peso, Precio, radios, tipografia, trazo, trazoIcono, useTheme } from '@egrouteplan/ui-kit';
import { Car, Navigation, Star } from 'lucide-react-native';
import { CalendarPicker, type CalendarDay } from '../components/CalendarPicker';
import { PhotoGallery } from '../components/PhotoGallery';
import {
  hotelApi, type HotelProfile, type HotelRoom, type HotelFx, type HotelArrival, type HotelAirport,
  type HotelReview, type HotelReviewsPage,
} from '../api/hotel';
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

  // ── LAS RESEÑAS DE ESTE ALOJAMIENTO (C-1) ────────────────────────────────────
  /*
    Consulta PÚBLICA y SEPARADA de la ficha: son dos datos independientes y si una falla la otra
    sigue en pie (con la ficha caída no se reserva; con las reseñas caídas se reserva igual, sin la
    confianza delante). Se piden veinte de una vez —el tope del servidor es cincuenta— y se pintan
    cinco: el desplegable no gasta una segunda petición.
  */
  const [resenas, setResenas] = useState<HotelReviewsPage | null>(null);
  const [verTodas, setVerTodas] = useState(false);

  // Para que la nota de la cabecera BAJE a la sección (D1): se suman las dos posiciones —la del
  // contenedor dentro del scroll y la de la sección dentro del contenedor—, que es lo que `onLayout`
  // sabe decir en cada nivel. Sin refs a componentes nativos ni `measure()`.
  const scrollRef = useRef<ScrollView>(null);
  const [yContenido, setYContenido] = useState(0);
  const [yResenas, setYResenas] = useState(0);
  const bajarAResenas = () => {
    scrollRef.current?.scrollTo({ y: Math.max(0, yContenido + yResenas - espaciado.e10), animated: true });
  };

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

  // Las reseñas, una vez por alojamiento.
  useEffect(() => {
    if (!shopId) { setResenas(null); return; }
    let vivo = true;
    setVerTodas(false);
    void hotelApi
      .reviews(shopId, { limit: 20 })
      .then((r) => { if (vivo) setResenas(r); })
      .catch(() => { if (vivo) setResenas(null); });
    return () => { vivo = false; };
  }, [shopId]);

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

  /*
    LA NOTA, COMO LA DECIDE EL SERVIDOR (D2 · [D-K]).
    Tres estados, y ninguno enseña una cifra que el servidor no publique:
      · 0 reseñas   → la cabecera NO dice nada (ni un «0,0» ni un «sin valoraciones»);
      · 1-2 reseñas → dice cuántas hay, SIN media (una sola estancia no es una nota);
      · 3 o más     → la media y el número, que es lo que compara.
    La media sale del espejo del servidor y `publishesRating` es quien manda: aquí no se cuenta nada.
  */
  const nota = resenas && resenas.total > 0
    ? {
        total: resenas.total,
        publica: resenas.publishesRating === true,
        media: Number(resenas.average ?? 0).toFixed(1),
      }
    : null;

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
        <View style={styles.centro}><ActivityIndicator color={colors.text.primary} /></View>
      ) : error ? (
        <View style={[styles.error, { borderColor: colors.danger, backgroundColor: alpha(colors.danger, 0.06) }]}>
          <Text style={{ color: colors.text.danger, fontSize: tipografia.body, fontWeight: peso.medio }}>{error}</Text>
          <Pressable onPress={() => void cargar()} accessibilityRole="button" accessibilityLabel="Reintentar">
            <Text style={[styles.enlace, { color: colors.text.primary }]}>Reintentar</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: insets.bottom + 30, gap: espaciado.e14 }}>
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

          <View style={{ paddingHorizontal: espaciado.e14, gap: espaciado.e14 }} onLayout={(e) => setYContenido(e.nativeEvent.layout.y)}>
          {/* ── Datos del alojamiento ── */}
          <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
            <Text style={[styles.nombre, { color: colors.textPrimary }]}>{hotel?.name}</Text>
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              {[TIPOS[hotel?.propertyKind ?? ''] ?? null, hotel?.stars ? `${hotel.stars}★` : null,
                hotel?.barrio, hotel?.city].filter(Boolean).join(' · ')}
            </Text>

            {/*
              ── LA NOTA DEL ALOJAMIENTO, EN LA CABECERA Y PULSABLE (D1/D2/D3) ──────────────
              Va aquí, con el tipo y las estrellas —que son la categoría que DECLARA el hotelero,
              no una valoración—, porque es el dato que dice si el sitio es bueno de verdad.
              Y es el único sitio de la ficha donde la estrella se pinta RELLENA: el `★` de la
              línea de arriba es `stars`.

              El toque BAJA a la sección de reseñas en vez de abrir otra pantalla: la lista ya está
              cargada, y salir y volver para leer dos opiniones es lo que hace que nadie las lea.
            */}
            {nota ? (
              <Pressable
                onPress={bajarAResenas}
                accessibilityRole="button"
                accessibilityLabel={
                  nota.publica
                    ? `Nota ${nota.media} de ${nota.total} reseñas. Ver las reseñas`
                    : `${nota.total} reseña${nota.total === 1 ? '' : 's'} sin nota publicada. Ver las reseñas`
                }
                hitSlop={8}
                style={[styles.notaChip, { borderColor: colors.border, backgroundColor: colors.surface }]}
              >
                {/* RELLENA solo si la nota se publica; apagada cuando aún no hay con qué (D3). */}
                <Star
                  size={13}
                  color={nota.publica ? colors.text.warning : colors.textSecondary}
                  fill={nota.publica ? colors.text.warning : 'transparent'}
                  strokeWidth={trazoIcono.base}
                />
                <Text style={[styles.notaTxt, { color: colors.textPrimary }]}>
                  {nota.publica
                    ? `${nota.media} · ${nota.total} reseñas`
                    : `${nota.total} reseña${nota.total === 1 ? '' : 's'}`}
                </Text>
                <Text style={[styles.notaFlecha, { color: colors.textSecondary }]}>›</Text>
              </Pressable>
            ) : null}
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
                <Navigation size={14} color={colors.text.secondary} />
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
                <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: colors.text.success }}>🔑 Al llegar</Text>
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
                  <Text style={[styles.botonLineaTxt, { color: colors.text.primary }]}>Pedir taxi al hotel</Text>
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
                      <Precio valor={r.basePriceXaf} tamano="md" color={colors.text.secondary} />
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
                              color={colors.text.primary}
                              fuerte
                            />
                            <Fila etiqueta="Y al llegar al hotel" valor={xaf(cuenta.resto)} color={colors.text.secondary} fuerte />
                            <Text style={[styles.sub, { color: colors.textSecondary }]}>
                              La habitación queda retenida {r.holdMinutes} min mientras se paga la señal.
                            </Text>
                          </>
                        ) : (
                          <Fila etiqueta="Se paga todo al llegar" valor={xaf(cuenta.total)} color={colors.text.secondary} fuerte />
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

          {/* ── RESEÑAS ────────────────────────────────────────────────────────────────
              VA DESPUÉS DE LAS HABITACIONES, y es una decisión, no un descuido (D1): una reserva se
              decide primero por «¿hay cama y a cuánto?» —que es lo que responde esta pantalla con el
              calendario y el precio— y después por «¿qué dicen los que durmieron?». Con la lista
              delante, el precio sale de la primera pantalla. */}
          <View onLayout={(e) => setYResenas(e.nativeEvent.layout.y)} style={{ gap: espaciado.e10 }}>
            <Text style={[styles.seccion, { color: colors.textPrimary }]}>
              {resenas && resenas.total > 0 ? `Reseñas (${resenas.total})` : 'Reseñas'}
            </Text>

            {resenas === null ? (
              <Text style={[styles.sub, { color: colors.textSecondary }]}>Cargando reseñas…</Text>
            ) : resenas.total === 0 ? (
              <Text style={[styles.sub, { color: colors.textSecondary }]}>
                Este alojamiento todavía no tiene reseñas. Las escribe quien ha dormido aquí, cuando
                termina su estancia, y su nota aparecerá en esta ficha.
              </Text>
            ) : (
              <>
                {/* POR QUÉ NO HAY CIFRA (D2): decirlo es la diferencia entre «no hay datos» y
                    «hay dos y no se publican». Debajo del umbral el titular no enseña media. */}
                {!resenas.publishesRating ? (
                  <Text style={[styles.sub, { color: colors.textSecondary }]}>
                    La nota del alojamiento se publica a partir de 3 reseñas. Con {resenas.total}{' '}
                    todavía no se enseña la media: una sola estancia no es una nota.
                  </Text>
                ) : null}

                {(verTodas ? resenas.items : resenas.items.slice(0, 5)).map((r) => (
                  <Resena key={r.id} r={r} />
                ))}

                {!verTodas && resenas.items.length > 5 ? (
                  <Pressable
                    onPress={() => setVerTodas(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Ver todas las reseñas"
                    style={[styles.botonLinea, { borderColor: colors.border, backgroundColor: colors.surface, alignSelf: 'flex-start' }]}
                  >
                    <Text style={[styles.botonLineaTxt, { color: colors.textPrimary }]}>Ver todas</Text>
                  </Pressable>
                ) : null}

                {/* Se dice cuántas se enseñan cuando no son todas: un «(38)» con cinco tarjetas
                    debajo parece un error de la app. */}
                {resenas.total > resenas.items.length ? (
                  <Text style={[styles.sub, { color: colors.textSecondary }]}>
                    Se enseñan las {resenas.items.length} más recientes de {resenas.total}.
                  </Text>
                ) : null}
              </>
            )}
          </View>
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

/**
 * UNA RESEÑA, en la ficha. Solo lectura: aquí no se responde ni se borra nada (eso es de su autor y
 * del hotel, y cada uno tiene su puerta).
 *
 * El nombre va CORTO —el primer nombre—. Esta lista es pública: el servidor manda el nombre completo
 * y nadie pidió figurar con sus dos apellidos por haber dormido una noche. Recortarlo es una decisión
 * de la pantalla, no un olvido.
 *
 * La respuesta del hotel va DEBAJO y con su propio recuadro: es la voz del vendedor, no una reseña
 * más, y mezclarla con el texto del huésped sería meter al hotel dentro de la opinión.
 */
function Resena({ r }: { r: HotelReview }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.resena, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.resenaCab}>
        <Text style={[styles.resenaQuien, { color: colors.textPrimary }]} numberOfLines={1}>
          {nombreCorto(r.guest?.name)}
        </Text>
        <View style={styles.resenaNota}>
          {/* La misma estrella y el MISMO token que en la cabecera y que en taxi/comida/comercio:
              `colors.text.warning`. Una reseña no inventa un color de estrella propio (D3). */}
          <Star size={12} color={colors.text.warning} fill={colors.text.warning} strokeWidth={trazoIcono.base} />
          <Text style={[styles.resenaNotaTxt, { color: colors.textPrimary }]}>{r.rating}</Text>
        </View>
      </View>
      <Text style={[styles.sub, { color: colors.textSecondary }]}>
        {shortDate(String(r.createdAt).slice(0, 10))}
      </Text>
      {r.body ? (
        <Text style={[styles.resenaTexto, { color: colors.textPrimary }]}>{r.body}</Text>
      ) : null}
      {r.reply ? (
        <View style={[styles.respuesta, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[styles.respuestaEtq, { color: colors.textSecondary }]}>Respuesta del alojamiento</Text>
          <Text style={[styles.resenaTexto, { color: colors.textPrimary }]}>{r.reply}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** El primer nombre, y nada más: la lista de reseñas es pública. */
function nombreCorto(nombre: string | null | undefined): string {
  const limpio = String(nombre ?? '').trim();
  return limpio ? limpio.split(/\s+/)[0] : 'Huésped';
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
  volverTxt: { fontSize: tipografia.display, fontWeight: peso.fuerte, lineHeight: 28 },
  // Botón de volver flotante sobre la galería (la barra superior se ve, pero en la
  // ficha el pulgar está abajo: conviene tenerlo también aquí).
  volverFlotante: {
    position: 'absolute', left: 12, width: 36, height: 36, borderRadius: radios.full,
    backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
  },
  volverFlotanteTxt: { color: brand.white, fontSize: tipografia.tituloFicha, fontWeight: peso.fuerte, lineHeight: 26 },
  titulo: { fontSize: tipografia.anchoFuerte, fontWeight: peso.maximo, flex: 1 },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { margin: espaciado.e14, borderWidth: trazo.fino, borderRadius: radios.campo, padding: espaciado.e12, gap: espaciado.e6 },
  enlace: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  bloque: { borderWidth: trazo.fino, borderRadius: radios.panel, padding: espaciado.e12, gap: espaciado.e4 },
  nombre: { fontSize: tipografia.cabecera, fontWeight: peso.maximo },
  sub: { fontSize: tipografia.caption },
  dato: { fontSize: tipografia.body, marginTop: espaciado.e4 },
  servicios: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6, marginTop: espaciado.e8 },
  servicio: { borderWidth: trazo.fino, borderRadius: radios.tarjeta, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e4 },
  servicioTxt: { fontSize: tipografia.caption },
  seccion: { fontSize: tipografia.cuerpo, fontWeight: peso.maximo },
  /** Botón de línea (Cómo llegar, taxi, elegir moneda): el mismo aspecto en los tres sitios. */
  botonLinea: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, borderWidth: trazo.fino, borderRadius: radios.chip, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8, marginTop: espaciado.e6 },
  botonLineaTxt: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  /** Aviso con borde (Al llegar / taxi): información que el huésped necesita, sin gritar. */
  aviso: { borderWidth: trazo.fino, borderRadius: radios.chip, padding: espaciado.e10, marginTop: espaciado.e8 },
  filaHab: { flexDirection: 'row', gap: espaciado.e10, alignItems: 'flex-start' },
  habNombre: { fontSize: tipografia.fino, fontWeight: peso.maximo },
  precio: { fontSize: tipografia.cuerpo, fontWeight: peso.maximo },
  cuenta: { borderWidth: trazo.fino, borderRadius: radios.campo, padding: espaciado.e10, gap: espaciado.e3 },
  filaCuenta: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espaciado.e10 },
  cuentaEtq: { fontSize: tipografia.caption, flex: 1 },
  cuentaVal: { fontSize: tipografia.body },
  separador: { height: 1, marginVertical: espaciado.e5 },
  /** La nota del alojamiento en la cabecera: pastilla pulsable que baja a las reseñas. */
  notaChip: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, alignSelf: 'flex-start',
    borderWidth: trazo.fino, borderRadius: radios.chip,
    paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e6, marginTop: espaciado.e8,
  },
  notaTxt: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  notaFlecha: { fontSize: tipografia.body },
  /** Una reseña: cabecera (quién y cuántas), fecha, texto y, si la hay, la respuesta del hotel. */
  resena: { borderWidth: trazo.fino, borderRadius: radios.campo, padding: espaciado.e10, gap: espaciado.e4 },
  resenaCab: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaciado.e8 },
  resenaQuien: { fontSize: tipografia.fino, fontWeight: peso.fuerte, flex: 1 },
  resenaNota: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 },
  resenaNotaTxt: { fontSize: tipografia.caption, fontWeight: peso.maximo },
  resenaTexto: { fontSize: tipografia.body, lineHeight: 20 },
  respuesta: { borderWidth: trazo.fino, borderRadius: radios.chip, padding: espaciado.e10, marginTop: espaciado.e6, gap: espaciado.e3 },
  respuestaEtq: { fontSize: tipografia.micro, fontWeight: peso.maximo },
  cta: { height: altura.campo, borderRadius: radios.campo, alignItems: 'center', justifyContent: 'center' },
  ctaTxt: { color: brand.white, fontSize: tipografia.cuerpo, fontWeight: peso.maximo },
});
