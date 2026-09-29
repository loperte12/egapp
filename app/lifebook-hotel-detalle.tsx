/**
 * lifebook-hotel-detalle — FICHA de un alojamiento: sus habitaciones y sus reseñas.
 *
 * ── QUÉ CAMBIÓ EL 27-sep-2026 (P2 del plan de UI, `docs/UI-HOTEL-PLAN-MEJORA.md` §11) ───────────
 *
 * EL DIAGNÓSTICO, MEDIDO. La ficha se abrió en el móvil y se volcó con `uiautomator`. Pantalla de
 * 2.374 px: en la primera pantalla ENTERA no había **ni una habitación ni un precio** — solo galería,
 * horario, dirección, el botón de mapa, el bloque del taxi al aeropuerto, la descripción, dos
 * servicios y la línea de formas de pago. Desplazando una pantalla aparecía `Habitaciones (8)` y el
 * primer precio; y el desplazamiento SIGUIENTE era el calendario, abierto dentro de la primera
 * habitación, ocupando la pantalla completa antes de que se viera el segundo precio.
 *
 * LO QUE SE HA QUITADO: **el acordeón**. Un tipo de habitación ya no despliega dentro su calendario,
 * su desglose y su botón (`setAbierta`, el `CalendarPicker` interno, la cuenta con `Fila`). Ahora es
 * una tarjeta (`HotelRoomCard`) con foto, servicios, condiciones, el precio de fin de semana —que
 * existía y no se enseñaba en ninguna pantalla— y un solo botón.
 *
 * LO QUE HA OCUPADO SU SITIO: **una barra de fechas** (`HotelDateRange`) encima de la lista, que se
 * elige una vez y vale para todos los tipos. El dinero exacto de la estancia se calcula donde
 * siempre se calculó de verdad: en `lifebook-hotel-reservar.tsx`, que pide el calendario del tipo
 * elegido y desglosa noches, limpieza, tasas, señal y resto. La ficha elige; la reserva cobra.
 *
 * ── D8 + D10 (27-sep-2026): PESTAÑAS Y GALERÍA POR ZONAS ──────────────────────────────────────────
 *
 * La ficha se parte en **tres pestañas** (`Habitaciones · Reseñas · El alojamiento`) en vez de un
 * scroll largo de ~2.400 px sin decisión a la vista. La galería separa las fotos por origen
 * (`Alojamiento` / `Habitaciones`) sin campo nuevo: el origen ya está en el dato.
 *
 * Consecuencias para la navegación interna:
 *   · El chip de nota ya no baja con `scrollTo` → ahora cambia a la pestaña `resenas`.
 *   · `yContenido`, `yResenas` y `bajarAResenas` se eliminan (la lógica de scroll-to-section ya
 *     no aplica con pestañas).
 *   · `scrollRef` se elimina (el ScrollView ya no necesita ref para el scrollTo programático).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, peso, radios, tipografia, trazo, trazoIcono, useTheme } from '@egrouteplan/ui-kit';
import { BadgeCheck, Car, Navigation, Star } from 'lucide-react-native';
import { PhotoGallery } from '../components/PhotoGallery';
import { HotelGuestsSheet } from '../components/hotel/HotelGuestsSheet';
import { HotelDateBar } from '../components/hotel/HotelDateRange';
import { HotelRoomCard } from '../components/hotel/HotelRoomCard';
import { nombreServicio } from '../components/hotel/servicios';
import {
  hotelApi, type HotelProfile, type HotelRoom, type HotelFx, type HotelArrival, type HotelAirport,
  type HotelReview, type HotelReviewsPage,
} from '../api/hotel';
import { ApiError } from '../api/httpClient';
import { absUrl } from '../api/config';
import { nightsBetween, shortDate, xaf } from '../utils/datetime';
import { abrirMapa } from '../utils/maps';
import { getPaisParaPrecios, setPaisElegido } from '../utils/region';

/** Acento del marketplace (naranja), como en el resto del flujo de servicios. */
const ACCENT = brand.primary;

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

  /*
    LAS FECHAS Y LA OCUPACIÓN SON DE LA PANTALLA, no de una habitación.

    Antes, las fechas solo existían dentro del acordeón de un tipo —y `huespedes`/`habitaciones` eran
    constantes que llegaban por parámetro y no se podían cambiar. Ahora viven en la barra de arriba y
    valen para toda la lista, así que tienen que poder cambiar.
  */
  const [huespedes, setHuespedes] = useState(Number(p.guests ?? 2));
  const [habitaciones, setHabitaciones] = useState(Number(p.units ?? 1));
  const [checkIn, setCheckIn] = useState<string | null>(p.checkIn ?? null);
  const [checkOut, setCheckOut] = useState<string | null>(p.checkOut ?? null);
  const [elegirQuien, setElegirQuien] = useState(false);

  // ── D8: PESTAÑA ACTIVA ────────────────────────────────────────────────────────
  // Tres pestañas: `reservar` (habitaciones + fechas), `resenas` (opiniones), `alojamiento`
  // (datos informativos). La pestaña por defecto es `reservar` porque es lo que decide la compra.
  const [tab, setTab] = useState<'reservar' | 'resenas' | 'alojamiento'>('reservar');

  // ── LAS RESEÑAS DE ESTE ALOJAMIENTO (C-1) ────────────────────────────────────
  /*
    Consulta PÚBLICA y SEPARADA de la ficha: son dos datos independientes y si una falla la otra
    sigue en pie (con la ficha caída no se reserva; con las reseñas caídas se reserva igual, sin la
    confianza delante). Se piden veinte de una vez —el tope del servidor es cincuenta— y se pintan
    cinco: el desplegable no gasta una segunda petición.
  */
  const [resenas, setResenas] = useState<HotelReviewsPage | null>(null);
  const [verTodas, setVerTodas] = useState(false);

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
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar el alojamiento.');
    } finally {
      setCargando(false);
    }
  }, [shopId, pais]);

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

  /** Noches de la estancia elegida: la barra las muestra, y el botón de la tarjeta las repite. */
  const noches = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;

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
        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 30 }}>

          {/* ── Galería (D10: fotos separadas en 2 pestañas por origen) ──────────────
              `Alojamiento` = la portada que sube el hotelero; `Habitaciones` = las fotos
              de cada tipo. Sin campo nuevo: el origen ya está en el dato. Si solo una
              pestaña tiene fotos, la barra no se pinta y queda como galería plana. */}
          <PhotoGallery
            photos={[]}
            tabs={[
              { label: 'Alojamiento', photos: [absUrl(hotel?.coverUrl)].filter((u): u is string => !!u) },
              { label: 'Habitaciones', photos: rooms.flatMap((r) => (r.images ?? []).map((i) => absUrl((i as { url?: string })?.url))).filter((u): u is string => !!u) },
            ]}
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

          {/* ════════════════════════════════════════════════════════════════════════
              D8: BARRA DE PESTAÑAS — Habitaciones · Reseñas · El alojamiento

              La ficha se parte en tres pestañas. `reservar` es la que decide la compra
              (habitaciones + fechas + precios), por eso es la pestaña por defecto.
              `alojamiento` agrupa todo lo informativo (datos, horario, taxi, normas…).
              `resenas` muestra las opiniones de quien ha dormido aquí.
          ════════════════════════════════════════════════════════════════════════ */}
          <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <Pressable
              onPress={() => setTab('reservar')}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === 'reservar' }}
              style={[styles.tabBtn, tab === 'reservar' ? { borderBottomColor: colors.primary, borderBottomWidth: trazo.fuerte } : null]}
            >
              <Text style={[styles.tabTxt, { color: tab === 'reservar' ? colors.textPrimary : colors.textSecondary, fontWeight: tab === 'reservar' ? peso.maximo : peso.medio }]}>
                Habitaciones{rooms.length ? ` (${rooms.length})` : ''}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setTab('resenas')}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === 'resenas' }}
              style={[styles.tabBtn, tab === 'resenas' ? { borderBottomColor: colors.primary, borderBottomWidth: trazo.fuerte } : null]}
            >
              <Text style={[styles.tabTxt, { color: tab === 'resenas' ? colors.textPrimary : colors.textSecondary, fontWeight: tab === 'resenas' ? peso.maximo : peso.medio }]}>
                Reseñas{resenas && resenas.total > 0 ? ` (${resenas.total})` : ''}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setTab('alojamiento')}
              accessibilityRole="button"
              accessibilityState={{ selected: tab === 'alojamiento' }}
              style={[styles.tabBtn, tab === 'alojamiento' ? { borderBottomColor: colors.primary, borderBottomWidth: trazo.fuerte } : null]}
            >
              <Text style={[styles.tabTxt, { color: tab === 'alojamiento' ? colors.textPrimary : colors.textSecondary, fontWeight: tab === 'alojamiento' ? peso.maximo : peso.medio }]}>
                El alojamiento
              </Text>
            </Pressable>
          </View>

          {/* ────────────────────────────────────────────────────────────────────────
              TAB: RESERVAR — habitaciones, barra de fechas, tarjetas de tipo.
              Es la pestaña por defecto porque es donde se decide la compra.
          ──────────────────────────────────────────────────────────────────────── */}
          {tab === 'reservar' && (
            <View style={{ paddingHorizontal: espaciado.e14, gap: espaciado.e14, paddingTop: espaciado.e12 }}>

              {/* ── Habitaciones ── */}
              <Text style={[styles.seccion, { color: colors.textPrimary }]}>
                Habitaciones ({rooms.length})
              </Text>

              {/*
                LA BARRA DE FECHAS, UNA VEZ Y PARA TODOS LOS TIPOS.

                Va pegada a la lista porque es SU control: cambiar aquí las noches cambia el verbo del
                botón de cada tarjeta, y el precio exacto de esas noches se calcula en la pantalla de
                reservar. Antes esto era un calendario por habitación dentro del acordeón.
              */}
              {rooms.length > 0 ? (
                <HotelDateBar
                  rooms={rooms}
                  checkIn={checkIn}
                  checkOut={checkOut}
                  huespedes={huespedes}
                  habitaciones={habitaciones}
                  onFechas={(a, b) => { setCheckIn(a); setCheckOut(b); }}
                  onOcupacion={() => setElegirQuien(true)}
                />
              ) : null}

              {rooms.length === 0 ? (
                <Text style={[styles.sub, { color: colors.textSecondary }]}>
                  Este alojamiento todavía no tiene habitaciones publicadas.
                </Text>
              ) : null}

              {rooms.map((r) => (
                <HotelRoomCard
                  key={r.id}
                  room={r}
                  noches={noches}
                  habitaciones={habitaciones}
                  onReservar={irAReservar}
                />
              ))}
            </View>
          )}

          {/* ────────────────────────────────────────────────────────────────────────
              TAB: RESEÑAS — opiniones de quien ha dormido aquí.
              Antes iba después de las habitaciones en un scroll largo (D1 de C-1).
              Con pestañas, el chip de nota ya no baja con scrollTo → cambia a esta pestaña.
          ──────────────────────────────────────────────────────────────────────── */}
          {tab === 'resenas' && (
            <View style={{ paddingHorizontal: espaciado.e14, gap: espaciado.e10, paddingTop: espaciado.e12 }}>
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
          )}

          {/* ────────────────────────────────────────────────────────────────────────
              TAB: EL ALOJAMIENTO — datos informativos.
              Todo lo que el huésped necesita saber pero que no decide la compra: horario,
              dirección, cómo llegar, taxi al aeropuerto, descripción, servicios, moneda,
              formas de pago, normas y política de cancelación.
          ──────────────────────────────────────────────────────────────────────── */}
          {tab === 'alojamiento' && (
            <View style={{ paddingHorizontal: espaciado.e14, gap: espaciado.e14, paddingTop: espaciado.e12 }}>
              {/* ── Datos del alojamiento ── */}
              <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <Text style={[styles.nombre, { color: colors.textPrimary }]}>{hotel?.name}</Text>
                {/*
                  EL ALOJAMIENTO VERIFICADO. `isVerified` / `verificationLevel` llevaban desde la
                  migración del módulo viajando en cada respuesta y **no se pintaban en ninguna pantalla**.
                  Es el equivalente real al distintivo de la referencia (优美会), y a diferencia de aquel
                  no hay que inventarlo ni contratarlo: el dato ya está.
                */}
                {hotel?.isVerified ? (
                  <View style={styles.verificadoFila}>
                    <BadgeCheck size={13} color={colors.text.success} strokeWidth={trazoIcono.acento} />
                    <Text style={[styles.verificadoTxt, { color: colors.text.success }]}>Alojamiento verificado</Text>
                  </View>
                ) : null}
                <Text style={[styles.sub, { color: colors.textSecondary }]}>
                  {[TIPOS[hotel?.propertyKind ?? ''] ?? null, hotel?.stars ? `${hotel.stars}★` : null,
                    hotel?.barrio, hotel?.city].filter(Boolean).join(' · ')}
                </Text>

                {/*
                  ── LA NOTA DEL ALOJAMIENTO, EN EL BLOQUE Y PULSABLE (D1/D2/D3) ──────────────
                  D8: el toque ya no baja con scrollTo → cambia a la pestaña `resenas`.
                */}
                {nota ? (
                  <Pressable
                    onPress={() => setTab('resenas')}
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
                        <Text style={[styles.servicioTxt, { color: colors.textPrimary }]}>{nombreServicio(a)}</Text>
                      </View>
                    ))}
                  </View>
                ) : null}

                {/*
                  ── CON QUÉ MONEDA SE VEN LOS PRECIOS ─────────────────────────────────────
                  El precio real, y el que se cobra, es en XAF (en efectivo, al llegar al hotel). Esto
                  solo cambia CÓMO SE ENSEÑA, para que quien reserva desde fuera sepa cuánto es.

                  Va al FINAL del bloque informativo y no en medio de la lista de habitaciones, que es
                  donde estaba: un selector de moneda partiendo la lista de precios obliga a leerlo antes
                  de ver el primer cuarto, y no es eso lo que se viene a mirar aquí.
                */}
                <View style={{ gap: espaciado.e6, marginTop: espaciado.e6 }}>
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
            </View>
          )}

        </ScrollView>
      )}

      <HotelGuestsSheet
        visible={elegirQuien}
        onClose={() => setElegirQuien(false)}
        huespedes={huespedes}
        habitaciones={habitaciones}
        onHuespedes={setHuespedes}
        onHabitaciones={setHabitaciones}
      />
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
  verificadoFila: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 },
  verificadoTxt: { fontSize: tipografia.micro, fontWeight: peso.fuerte },
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
  /** La nota del alojamiento: pastilla pulsable que cambia a la pestaña de reseñas. */
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
  // ── D8: barra de pestañas de la ficha ──
  tabBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e16, paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e4, borderBottomWidth: trazo.fino },
  tabBtn: { paddingVertical: espaciado.e8, borderBottomWidth: trazo.fuerte, borderBottomColor: 'transparent', minWidth: 80, alignItems: 'center' },
  tabTxt: { fontSize: tipografia.body },
});
