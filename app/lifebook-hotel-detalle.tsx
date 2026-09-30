/**
 * lifebook-hotel-detalle — FICHA de un alojamiento, reestructurada desde el 快搭.
 *
 * ── REESTRUCTURACIÓN 30-sep/01-oct-2026 (diseño `pruebas/kuaida-v12/detail.html`,
 *    auditoría en `docs/KUAIDA-V12-AUDITORIA.md`) ──────────────────────────────────────────────
 *
 * El nuevo diseño de MasterGo cambia la ARQUITECTURA de información de la ficha: adiós las tres
 * pestañas de D8, hola un SCROLL ÚNICO con secciones (info → habitaciones → llegada → servicios →
 * políticas → opiniones), la galería FIJA arriba (260 px) y una BARRA INFERIOR de reserva con la
 * habitación seleccionada. D8 se cerró por un scroll de 2.374 px sin decisión a la vista; este
 * diseño resuelve el mismo problema por otro camino — secciones compactas, habitaciones y precio
 * de compra arriba, lo informativo en acordeones/cards más abajo — y es la decisión MÁS RECIENTE
 * del lienzo, así que manda.
 *
 * QUÉ SE CONSERVA (verificado y con valor real que el diseño no conocía):
 *   · D10 — la galería separa fotos por origen (`Alojamiento`/`Habitaciones`): el dato existe y
 *     el diseño, que no lo sabía, puso una galería plana. Las pestañas de origen se quedan.
 *   · La barra de fechas (`HotelDateBar`) y las tarjetas de tipo (`HotelRoomCard`): el dinero
 *     exacto se calcula en `reservar`; la ficha elige.
 *   · Llegada y taxi al aeropuerto, cómo llegar con coordenadas, moneda por país (FX del
 *     servidor), formas de pago, normas, cancelación.
 *   · La puerta de la nota (D2/C-1): la cifra sólo si `publishesRating`; el toque baja a reseñas.
 *
 * QUÉ ENTRA DEL DISEÑO:
 *   · Scroll único con secciones etiquetadas + galería fija + barra inferior fija (72 px).
 *   · SELECCIÓN de habitación (toque en la tarjeta la marca; «Reservar ahora» usa la marcada).
 *   · Resumen de opiniones con la nota grande y avatar con inicial en cada reseña.
 *   · «Contactar alojamiento» (01-oct): el detalle del hotel trae `ownerId` y el motor de chat de
 *     Life Book es genérico (`POST /lifebook/chat/open { userId }` → `lifebook-chat/[id]`, el mismo
 *     hilo que el hotelero ve en su bandeja). Sin ownerId el botón no se ofrece.
 *   · «Escribir opinión» (01-oct): la ficha descubre las estancias terminadas de ESTE hotel con
 *     `reservations/mine` (`status checked_out` + `reviewId null` — el servidor ya marca cuáles
 *     tienen reseña) y abre `lifebook-hotel-resena` con la reserva elegida. El permiso sigue
 *     siendo del SERVIDOR: la ficha solo deja de ofrecer lo imposible.
 *   · Barras por dimensión (01-oct): el servidor con la migración `027` manda las medias
 *     (limpieza/servicio/ubicación/instalaciones) en la página de reseñas. Se pintan SOLO si
 *     vienen, con la misma regla de publicación que la nota global ([D-K]).
 *
 * QUÉ SE CAE DEL DISEÑO, Y POR QUÉ (sin controles que mienten):
 *   · Distancia «a X km»: sin punto de referencia en la ficha (el GPS es del huésped, no del hotel).
 *   · «Kit ›»: artefacto del prototipo.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, peso, Precio, radios, tipografia, trazo, trazoIcono, useTheme } from '@egrouteplan/ui-kit';
import { BadgeCheck, Car, MapPin, MessageCircle, Navigation, PencilLine, Star } from 'lucide-react-native';
import { PhotoGallery } from '../components/PhotoGallery';
import { HotelGuestsSheet } from '../components/hotel/HotelGuestsSheet';
import { HotelDateBar } from '../components/hotel/HotelDateRange';
import { HotelRoomCard } from '../components/hotel/HotelRoomCard';
import { nombreServicio } from '../components/hotel/servicios';
import {
  hotelApi, type HotelProfile, type HotelRoom, type HotelFx, type HotelArrival, type HotelAirport,
  type HotelReview, type HotelReviewsPage, type Reservation,
} from '../api/hotel';
import { lifebookChatApi } from '../api/lifebook';
import { ApiError } from '../api/httpClient';
import { absUrl } from '../api/config';
import { nightsBetween, shortDate, xaf } from '../utils/datetime';
import { abrirMapa } from '../utils/maps';
import { getPaisParaPrecios, setPaisElegido } from '../utils/region';
import { useSession } from '../state/session';

/** Acento del marketplace (naranja), como en el resto del flujo de servicios. */
const ACCENT = brand.primary;

/** Las dimensiones del desglose (027), en el orden del servidor. Las barras de la ficha y las
 *  estrellas de la pantalla de reseña comparten las MISMAS etiquetas: una sola nomenclatura. */
const DIMENSIONES = [
  { key: 'cleanliness', label: 'Limpieza' },
  { key: 'service', label: 'Servicio' },
  { key: 'location', label: 'Ubicación' },
  { key: 'facilities', label: 'Instalaciones' },
] as const;

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
    LAS FECHAS Y LA OCUPACIÓN SON DE LA PANTALLA, no de una habitación: viven para toda la lista.
  */
  const [huespedes, setHuespedes] = useState(Number(p.guests ?? 2));
  const [habitaciones, setHabitaciones] = useState(Number(p.units ?? 1));
  const [checkIn, setCheckIn] = useState<string | null>(p.checkIn ?? null);
  const [checkOut, setCheckOut] = useState<string | null>(p.checkOut ?? null);
  const [elegirQuien, setElegirQuien] = useState(false);

  // ── SELECCIÓN DE HABITACIÓN (el toque del diseño) ────────────────────────────
  // La barra inferior necesita UNA habitación. La primera disponible viene marcada por defecto
  // (como en el diseño), y tocar una tarjeta la cambia; su CTA propio reserva directo igualmente.
  const [selId, setSelId] = useState<string | null>(null);
  const seleccionada = rooms.find((r) => r.id === selId) ?? rooms[0] ?? null;

  // ── LAS RESEÑAS DE ESTE ALOJAMIENTO (C-1) ────────────────────────────────────
  // Consulta PÚBLICA y SEPARADA de la ficha: si la ficha cae no se reserva; con las reseñas caídas
  // se reserva igual, sin la confianza delante.
  const [resenas, setResenas] = useState<HotelReviewsPage | null>(null);
  const [verTodas, setVerTodas] = useState(false);

  // ── CHAT Y OPINIÓN (los tres puntos del 快搭, con backend real) ───────────────
  // `ownerId`: el dueño de la tienda (el detalle del hotel lo trae). Sin él no se ofrece
  // «Contactar» — no hay a quién escribirle, y adivinarlo no es opción.
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [contactando, setContactando] = useState(false);
  // Las estancias terminadas de ESTE hotel sin reseña escrita: la materia del «Escribir opinión».
  // `null` = todavía sin saber (o sin sesión): el botón no se pinta hasta que el servidor diga.
  const [elegibles, setElegibles] = useState<Reservation[] | null>(null);
  const { isAuthenticated } = useSession();

  const scrollRef = useRef<ScrollView>(null);
  const yResenas = useRef(0);

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
      // El dueño, para el chat. `null` en respuestas de un servidor sin el parche: sin botón.
      setOwnerId(out.ownerId ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar el alojamiento.');
    } finally {
      setCargando(false);
    }
  }, [shopId, pais]);

  useEffect(() => { void cargar(); }, [cargar]);

  // Las estancias elegibles para opinar, cuando hay sesión. La regla no se duplica: el SERVIDOR
  // marca cada reserva con `reviewId` (null = sin reseña) y `status checked_out`; aquí solo se
  // filtra lo que él ya decidió. Si `mine()` falla (token caducado, red), el botón no sale —
  // es un atajo, no un requisito de la ficha.
  useEffect(() => {
    if (!isAuthenticated || !shopId) { setElegibles(null); return; }
    let vivo = true;
    void hotelApi.mine('guest')
      .then((r) => {
        if (!vivo) return;
        const sinResena = (r.reservations ?? [])
          .filter((x) => x.hotel?.id === shopId && x.status === 'checked_out' && !x.reviewId)
          // La más reciente primero: si hay varias sin reseñar, se propone la última salida.
          .sort((a, b) => String(b.checkOut).localeCompare(String(a.checkOut)));
        setElegibles(sinResena);
      })
      .catch(() => { if (vivo) setElegibles(null); });
    return () => { vivo = false; };
  }, [isAuthenticated, shopId]);

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
    void getPaisParaPrecios().then((pa) => { if (vivo && pa) setPais(pa); });
    return () => { vivo = false; };
  }, []);

  // La lista de países (público): solo cuando el huésped abre el selector.
  useEffect(() => {
    if (!elegirMoneda || paises.length) return;
    void hotelApi.fx(pais).then((r) => setPaises(r.paises ?? [])).catch(() => undefined);
  }, [elegirMoneda, paises.length, pais]);

  /*
    LA NOTA, COMO LA DECIDE EL SERVIDOR (D2 · [D-K]). Tres estados, y ninguno enseña una cifra que
    el servidor no publique: 0 reseñas → nada; 1-2 → cuántas hay, SIN media; 3+ → media y número.
  */
  const nota = resenas && resenas.total > 0
    ? {
        total: resenas.total,
        publica: resenas.publishesRating === true,
        media: Number(resenas.average ?? 0).toFixed(1),
      }
    : null;

  /** Noches de la estancia elegida: la barra de fechas las muestra y el botón las repite. */
  const noches = checkIn && checkOut ? nightsBetween(checkIn, checkOut) : 0;

  const irAReservar = useCallback((room: HotelRoom) => {
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
  }, [router, shopId, hotel?.name, checkIn, checkOut, huespedes, habitaciones]);

  // ── CONTACTAR (chat huésped↔hotel) ──────────────────────────────────────────
  // Abre (o encuentra) el hilo direct con el dueño y entra en `lifebook-chat/[id]`: la MISMA
  // pantalla que el chat del pedido, porque es el mismo motor y el mismo hilo que el hotelero
  // ya tiene en su bandeja. El `draft` solo prellena el primer mensaje — se puede borrar.
  const contactar = useCallback(async () => {
    if (!ownerId || contactando) return;
    setContactando(true);
    try {
      const conv = await lifebookChatApi.open(ownerId);
      router.push({
        pathname: '/lifebook-chat/[id]',
        params: {
          id: conv.id,
          name: hotel?.name ?? 'Alojamiento',
          peerId: ownerId,
          draft: 'Hola, tengo una pregunta sobre este alojamiento…',
        },
      } as never);
    } catch {
      // Sin chat no se insiste ni se rompe la ficha: el botón vuelve a estar disponible.
    } finally {
      setContactando(false);
    }
  }, [ownerId, contactando, hotel?.name, router]);

  // ── ESCRIBIR OPINIÓN (atajo desde la ficha) ─────────────────────────────────
  // La puerta del servidor no cambia: estancia terminada, una reseña por estancia. La ficha solo
  // lleva a `lifebook-hotel-resena` con la estancia ya elegida (la más reciente sin reseñar); el
  // camino completo —revisar cada estancia desde Mis reservas— sigue siendo el camino principal.
  const escribirResena = useCallback(() => {
    const estancia = elegibles?.[0];
    if (!estancia) return;
    router.push({
      pathname: '/lifebook-hotel-resena',
      params: {
        reservationId: estancia.id,
        shopId,
        shopName: hotel?.name ?? '',
        ...(estancia.roomName ? { roomName: estancia.roomName } : {}),
      },
    } as never);
  }, [elegibles, shopId, hotel?.name, router]);

  if (cargando) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <View style={styles.centro}><ActivityIndicator color={colors.text.primary} /></View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background, justifyContent: 'center' }]}>
        <View style={[styles.error, { borderColor: colors.danger, backgroundColor: alpha(colors.danger, 0.06) }]}>
          <Text style={{ color: colors.text.danger, fontSize: tipografia.body, fontWeight: peso.medio }}>{error}</Text>
          <Pressable onPress={() => void cargar()} accessibilityRole="button" accessibilityLabel="Reintentar">
            <Text style={[styles.enlace, { color: colors.text.primary }]}>Reintentar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {/* ── Galería FIJA arriba (260 px, como el diseño) — D10: fotos por origen ── */}
      <PhotoGallery
        photos={[]}
        tabs={[
          { label: 'Alojamiento', photos: [absUrl(hotel?.coverUrl)].filter((u): u is string => !!u) },
          { label: 'Habitaciones', photos: rooms.flatMap((r) => (r.images ?? []).map((i) => absUrl((i as { url?: string })?.url))).filter((u): u is string => !!u) },
        ]}
        height={260}
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

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: 96 + insets.bottom }}
      >
        {/* ══════════ INFO (sin etiqueta: es la cabecera de la ficha) ══════════ */}
        <View style={styles.seccionBloque}>
          <View style={styles.nombreFila}>
            <Text style={[styles.nombre, { color: colors.textPrimary }]}>{hotel?.name}</Text>
            {hotel?.isVerified ? (
              <View style={[styles.badgeVerificado, { backgroundColor: colors.card }]}>
                <BadgeCheck size={12} color={colors.text.success} strokeWidth={trazoIcono.acento} />
                <Text style={[styles.badgeVerificadoTxt, { color: colors.textSecondary }]}>Verificado</Text>
              </View>
            ) : null}
          </View>

          {hotel?.propertyKind || hotel?.stars ? (
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              {[TIPOS[hotel?.propertyKind ?? ''] ?? null, hotel?.stars ? `${hotel.stars}★` : null].filter(Boolean).join(' · ')}
            </Text>
          ) : null}

          <View style={styles.filaPin}>
            <MapPin size={14} color={colors.text.secondary} strokeWidth={trazoIcono.base} />
            <Text style={[styles.sub, { color: colors.textSecondary, flex: 1 }]} numberOfLines={1}>
              {[hotel?.barrio, hotel?.city, hotel?.addressReference].filter(Boolean).join(' · ') || 'Guinea Ecuatorial'}
            </Text>
          </View>

          {/*
            LA NOTA (D2/D3): cifra sólo si el servidor la publica. Con el scroll único, el toque
            BAJA a la sección de opiniones (ya no hay pestaña a la que cambiar).
          */}
          {nota ? (
            <Pressable
              onPress={() => scrollRef.current?.scrollTo({ y: yResenas.current - 8, animated: true })}
              accessibilityRole="button"
              accessibilityLabel={
                nota.publica
                  ? `Nota ${nota.media} de ${nota.total} reseñas. Ir a las reseñas`
                  : `${nota.total} reseña${nota.total === 1 ? '' : 's'} sin nota publicada. Ir a las reseñas`
              }
              hitSlop={8}
              style={styles.filaNota}
            >
              <Star
                size={16}
                color={nota.publica ? colors.text.warning : colors.textSecondary}
                fill={nota.publica ? colors.text.warning : 'transparent'}
                strokeWidth={trazoIcono.base}
              />
              <Text style={[styles.notaMedia, { color: colors.textPrimary }]}>
                {nota.publica ? nota.media : ''}
              </Text>
              <Text style={[styles.sub, { color: colors.textSecondary }]}>
                {nota.publica
                  ? `(${nota.total} reseña${nota.total === 1 ? '' : 's'})`
                  : `${nota.total} reseña${nota.total === 1 ? '' : 's'} · sin nota publicada aún`}
              </Text>
            </Pressable>
          ) : null}

          {/*
            LOS TRES PUNTOS DEL DISEÑO (01-oct): cada botón SOLO cuando el backend lo sostiene.
            · Contactar: el detalle trajo `ownerId`. Sin dueño no hay a quién escribirle.
            · Escribir opinión: el servidor devolvió estancias terminadas sin reseña. Si no hay
              (o no hay sesión, o aún no se sabe), no se pinta — un botón que promete escribir a
              quien no puede miente.
          */}
          {ownerId || (elegibles?.length ?? 0) > 0 ? (
            <View style={styles.filaAcciones}>
              {ownerId ? (
                <Pressable
                  onPress={() => void contactar()}
                  disabled={contactando}
                  accessibilityRole="button"
                  accessibilityLabel={`Escribir al alojamiento ${hotel?.name ?? ''}`}
                  style={[styles.accion, { borderColor: colors.border, backgroundColor: colors.surface, opacity: contactando ? 0.6 : 1 }]}
                >
                  <MessageCircle size={16} color={colors.text.primary} strokeWidth={trazoIcono.base} />
                  <Text style={[styles.accionTxt, { color: colors.text.primary }]}>
                    {contactando ? 'Abriendo…' : 'Contactar'}
                  </Text>
                </Pressable>
              ) : null}
              {(elegibles?.length ?? 0) > 0 ? (
                <Pressable
                  onPress={escribirResena}
                  accessibilityRole="button"
                  accessibilityLabel="Escribir tu opinión de tu estancia"
                  style={[styles.accion, { borderColor: colors.border, backgroundColor: colors.surface }]}
                >
                  <PencilLine size={16} color={colors.text.primary} strokeWidth={trazoIcono.base} />
                  <Text style={[styles.accionTxt, { color: colors.text.primary }]}>
                    Escribir opinión{elegibles && elegibles.length > 1 ? ' (tu última estancia)' : ''}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}

          {hotel?.description ? (
            <Text style={[styles.dato, { color: colors.textPrimary }]}>{hotel.description}</Text>
          ) : null}
        </View>

        {/* ══════════ HABITACIONES ══════════ */}
        <Text style={[styles.etiquetaSeccion, { color: colors.textSecondary }]}>Habitaciones</Text>
        <View style={styles.seccionBloque}>
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

          {rooms.map((r) => {
            const activa = seleccionada?.id === r.id;
            return (
              <Pressable
                key={r.id}
                onPress={() => setSelId(r.id)}
                accessibilityRole="button"
                accessibilityLabel={`${r.name}. ${activa ? 'Seleccionada' : 'Toca para seleccionarla'}`}
                accessibilityState={{ selected: activa }}
                style={[styles.habWrapper, {
                  borderColor: activa ? colors.primary : 'transparent',
                  backgroundColor: activa ? alpha(colors.primary, 0.10) : 'transparent',
                }]}
              >
                <HotelRoomCard
                  room={r}
                  noches={noches}
                  habitaciones={habitaciones}
                  onReservar={irAReservar}
                />
              </Pressable>
            );
          })}
        </View>

        {/* ══════════ LLEGADA (valor real: coordenadas, nota del hotel, taxi) ══════════ */}
        {(arrival && (arrival.lat !== null || arrival.addressReference)) || arrival?.note || airport ? (
          <>
            <Text style={[styles.etiquetaSeccion, { color: colors.textSecondary }]}>Llegada</Text>
            <View style={styles.seccionBloque}>
              {arrival && (arrival.lat !== null || arrival.addressReference) ? (
                <Pressable
                  onPress={() => abrirMapa(arrival.lat, arrival.lng, arrival.addressReference ?? hotel?.name ?? null)}
                  accessibilityRole="button"
                  accessibilityLabel={`Cómo llegar a ${hotel?.name ?? 'el alojamiento'}`}
                  style={[styles.botonLinea, { borderColor: colors.border, backgroundColor: colors.surface, marginTop: 0 }]}
                >
                  <Navigation size={14} color={colors.text.secondary} />
                  <Text style={[styles.botonLineaTxt, { color: colors.textPrimary }]}>
                    Cómo llegar{arrival.lat !== null ? '' : ' (por la referencia escrita)'}
                  </Text>
                </Pressable>
              ) : null}

              {arrival?.note ? (
                <View style={[styles.aviso, { borderColor: alpha(colors.success, 0.45), backgroundColor: alpha(colors.success, 0.10) }]}>
                  <Text style={{ fontSize: tipografia.caption, fontWeight: peso.maximo, color: colors.text.success }}>🔑 Al llegar</Text>
                  <Text style={{ fontSize: tipografia.caption, color: colors.textPrimary, marginTop: espaciado.e3, lineHeight: 16 }}>{arrival.note}</Text>
                </View>
              ) : null}

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
                    style={[styles.botonLinea, { borderColor: alpha(ACCENT, 0.5), backgroundColor: alpha(ACCENT, 0.10), marginTop: espaciado.e8 }]}
                  >
                    <Car size={14} color={ACCENT} />
                    <Text style={[styles.botonLineaTxt, { color: colors.text.primary }]}>Pedir taxi al hotel</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          </>
        ) : null}

        {/* ══════════ SERVICIOS (chips con datos reales; sin descripciones por servicio:
                           el servidor no las trae, y el acordeón del diseño era demo) ══════════ */}
        {(hotel?.amenities ?? []).length ? (
          <>
            <Text style={[styles.etiquetaSeccion, { color: colors.textSecondary }]}>Servicios</Text>
            <View style={styles.seccionBloque}>
              <View style={styles.servicios}>
                {(hotel?.amenities ?? []).map((a) => (
                  <View key={a} style={[styles.servicio, { borderColor: colors.border, backgroundColor: colors.card }]}>
                    <Text style={[styles.servicioTxt, { color: colors.textPrimary }]}>{nombreServicio(a)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        ) : null}

        {/* ══════════ POLÍTICAS Y MONEDA ══════════ */}
        <Text style={[styles.etiquetaSeccion, { color: colors.textSecondary }]}>Políticas</Text>
        <View style={[styles.seccionBloque, styles.bloquePoliticas, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <View style={styles.politicaFila}>
            <Text style={[styles.politicaClave, { color: colors.textSecondary }]}>Entrada / salida</Text>
            <Text style={[styles.politicaValor, { color: colors.textPrimary }]}>
              {hotel?.checkinFrom} – {hotel?.checkinUntil}{hotel?.receptionOpen24h ? ' · recepción 24 h' : ''} · salida {hotel?.checkoutUntil}
            </Text>
          </View>
          {hotel?.cancellationPolicy ? (
            <View style={styles.politicaFila}>
              <Text style={[styles.politicaClave, { color: colors.textSecondary }]}>Cancelación</Text>
              <Text style={[styles.politicaValor, { color: colors.textPrimary }]}>{hotel.cancellationPolicy}</Text>
            </View>
          ) : null}
          {(hotel?.paymentMethods ?? []).length ? (
            <View style={styles.politicaFila}>
              <Text style={[styles.politicaClave, { color: colors.textSecondary }]}>Formas de pago</Text>
              <Text style={[styles.politicaValor, { color: colors.textPrimary }]}>
                {(hotel?.paymentMethods ?? [])
                  .map((m) => (typeof m === 'string' ? m : m.method))
                  .map((m) => ({ transfer: 'transferencia', in_store: 'en recepción', billing: 'facturación',
                    deposit: 'señal', cash_on_delivery: 'contra entrega', likebook_wallet: 'monedero' }[m] ?? m))
                  .join(' · ')}
              </Text>
            </View>
          ) : null}
          {hotel?.houseRules ? (
            <View style={styles.politicaFila}>
              <Text style={[styles.politicaClave, { color: colors.textSecondary }]}>Normas</Text>
              <Text style={[styles.politicaValor, { color: colors.textPrimary }]}>{hotel.houseRules}</Text>
            </View>
          ) : null}

          {/*
            ── CON QUÉ MONEDA SE VEN LOS PRECIOS ──
            El cobro es en XAF, en efectivo al llegar. Esto solo cambia CÓMO SE ENSEÑA para quien
            reserva desde fuera, y el SERVIDOR convierte (aquí no se hace aritmética de dinero).
          */}
          <View style={{ gap: espaciado.e6, marginTop: espaciado.e8 }}>
            <Pressable
              onPress={() => setElegirMoneda((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Elegir el país para ver los precios en su moneda"
              style={[styles.botonLinea, { borderColor: colors.border, backgroundColor: colors.surface, alignSelf: 'flex-start', marginTop: 0 }]}
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
                  paises.map((pa) => (
                    <Pressable
                      key={pa.code}
                      onPress={() => { setElegirMoneda(false); setPais(pa.code); void setPaisElegido(pa.code); }}
                      accessibilityRole="button"
                      accessibilityLabel={`Ver los precios desde ${pa.label} (${pa.currency})`}
                      style={[styles.botonLinea, {
                        borderColor: pais === pa.code ? colors.secondary : colors.border,
                        backgroundColor: pais === pa.code ? alpha(colors.secondary, 0.12) : colors.surface,
                        marginTop: 0,
                      }]}
                    >
                      <Text style={[styles.botonLineaTxt, { color: colors.textPrimary }]}>{pa.label} · {pa.currency}</Text>
                    </Pressable>
                  ))
                )}
              </View>
            ) : null}
          </View>
        </View>

        {/* ══════════ OPINIONES ══════════ */}
        <View
          onLayout={(e) => { yResenas.current = e.nativeEvent.layout.y; }}
          style={{ marginTop: espaciado.e20 }}
        >
          <Text style={[styles.etiquetaSeccion, { color: colors.textSecondary }]}>Opiniones</Text>
        </View>
        <View style={styles.seccionBloque}>
          {resenas === null ? (
            <Text style={[styles.sub, { color: colors.textSecondary }]}>Cargando reseñas…</Text>
          ) : resenas.total === 0 ? (
            <Text style={[styles.sub, { color: colors.textSecondary }]}>
              Este alojamiento todavía no tiene reseñas. Las escribe quien ha dormido aquí, cuando
              termina su estancia, y su nota aparecerá en esta ficha.
            </Text>
          ) : (
            <>
              {/* Resumen (el del diseño): nota GRANDE, sólo si el servidor la publica (D2). */}
              <View style={[styles.resumen, { borderColor: colors.border, backgroundColor: colors.card }]}>
                <View>
                  {resenas.publishesRating ? (
                    <Text style={[styles.resumenNota, { color: colors.textPrimary }]}>
                      {Number(resenas.average ?? 0).toFixed(1).replace('.', ',')}
                    </Text>
                  ) : null}
                  <Text style={[styles.sub, { color: colors.textSecondary }]}>
                    {resenas.total} reseña{resenas.total === 1 ? '' : 's'}
                    {resenas.publishesRating ? '' : ' · la media se publica a partir de 3'}
                  </Text>
                </View>
                {resenas.items.length > 5 ? (
                  <Pressable
                    onPress={() => setVerTodas((v) => !v)}
                    accessibilityRole="button"
                    accessibilityLabel={verTodas ? 'Ver sólo las recientes' : 'Ver todas las reseñas'}
                    style={[styles.botonLinea, { borderColor: colors.border, backgroundColor: colors.surface, marginTop: 0 }]}
                  >
                    <Text style={[styles.botonLineaTxt, { color: colors.text.primary }]}>{verTodas ? 'Ver menos' : 'Ver todas'}</Text>
                  </Pressable>
                ) : null}
              </View>

              {/*
                BARRAS POR DIMENSIÓN (027): sólo si el servidor las manda Y publica la nota
                ([D-K], la misma regla que la media global — el desglose no es más fácil de
                publicar que la nota). Una dimensión sin datos no dibuja una barra vacía
                fingiendo ser un dato: sencillamente no sale.
              */}
              {resenas.publishesRating && resenas.dimensions ? (
                <View style={[styles.dims, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  {DIMENSIONES.map((d) => {
                    const dim = resenas.dimensions?.[d.key];
                    if (!dim || dim.count === 0 || dim.average === null) return null;
                    return (
                      <View key={d.key} style={styles.dimFila}>
                        <Text style={[styles.dimEtiqueta, { color: colors.textSecondary }]} numberOfLines={1}>
                          {d.label}
                        </Text>
                        <View style={styles.dimBarra}>
                          <View
                            style={[styles.dimBarraLlena, {
                              backgroundColor: colors.text.warning,
                              width: `${Math.round((dim.average / 5) * 100)}%`,
                            }]}
                          />
                        </View>
                        <Text style={[styles.dimNota, { color: colors.textPrimary }]}>
                          {dim.average.toFixed(1).replace('.', ',')}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}

              {(verTodas ? resenas.items : resenas.items.slice(0, 5)).map((r) => (
                <Resena key={r.id} r={r} />
              ))}

              {resenas.total > resenas.items.length ? (
                <Text style={[styles.sub, { color: colors.textSecondary }]}>
                  Se enseñan las {resenas.items.length} más recientes de {resenas.total}.
                </Text>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>

      {/* ── Barra inferior FIJA: precio de la habitación marcada + Reservar ahora ── */}
      {seleccionada ? (
        <View
          style={[styles.barraReserva, {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            paddingBottom: insets.bottom + espaciado.e10,
          }]}
        >
          <View style={styles.barraReservaDato}>
            <Precio valor={seleccionada.basePriceXaf} tamano="md" color={ACCENT} />
            <Text style={[styles.barraReservaSub, { color: colors.textSecondary }]} numberOfLines={1}>
              {seleccionada.name} · por noche
            </Text>
          </View>
          <Pressable
            onPress={() => irAReservar(seleccionada)}
            accessibilityRole="button"
            accessibilityLabel={`Reservar ${seleccionada.name}`}
            style={[styles.barraReservaBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={styles.barraReservaBtnTxt}>
              {noches > 0 ? `Reservar · ${noches} noche${noches === 1 ? '' : 's'}` : 'Reservar ahora'}
            </Text>
          </Pressable>
        </View>
      ) : null}

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
 * El nombre va CORTO —el primer nombre—: la lista es pública y nadie pidió figurar con sus dos
 * apellidos por haber dormido una noche. La respuesta del hotel va DEBAJO y con su propio recuadro:
 * es la voz del vendedor, no una reseña más. NUEVO del diseño: avatar con la inicial.
 */
function Resena({ r }: { r: HotelReview }) {
  const { colors } = useTheme();
  const inicial = (String(r.guest?.name ?? '').trim().charAt(0) || 'H').toUpperCase();
  return (
    <View style={[styles.resena, { borderColor: colors.border, backgroundColor: colors.card }]}>
      <View style={styles.resenaCab}>
        <View style={[styles.resenaAvatar, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <Text style={[styles.resenaAvatarTxt, { color: colors.text.primary }]}>{inicial}</Text>
        </View>
        <View style={styles.resenaQuienBloque}>
          <Text style={[styles.resenaQuien, { color: colors.textPrimary }]} numberOfLines={1}>
            {nombreCorto(r.guest?.name)}
          </Text>
          <Text style={[styles.resenaFecha, { color: colors.textSecondary }]}>
            {shortDate(String(r.createdAt).slice(0, 10))}
          </Text>
          <View style={styles.resenaNota}>
            {/* La MISMA estrella y el MISMO token que en la cabecera: `colors.text.warning` (D3). */}
            <Star size={11} color={colors.text.warning} fill={colors.text.warning} strokeWidth={trazoIcono.base} />
            <Text style={[styles.resenaNotaTxt, { color: colors.textPrimary }]}>{r.rating}</Text>
          </View>
        </View>
      </View>
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
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { margin: espaciado.e14, borderWidth: trazo.fino, borderRadius: radios.campo, padding: espaciado.e12, gap: espaciado.e6 },
  enlace: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  // Botón de volver flotante sobre la galería (la ficha no lleva barra superior: manda el diseño).
  volverFlotante: {
    position: 'absolute', left: 12, width: 36, height: 36, borderRadius: radios.full,
    backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center',
  },
  volverFlotanteTxt: { color: brand.white, fontSize: tipografia.tituloFicha, fontWeight: peso.fuerte, lineHeight: 26 },
  // Bloques de sección.
  seccionBloque: { paddingHorizontal: espaciado.e14, paddingTop: espaciado.e12, gap: espaciado.e10 },
  etiquetaSeccion: {
    fontSize: tipografia.micro, fontWeight: peso.maximo, letterSpacing: 0.8,
    textTransform: 'uppercase', paddingHorizontal: espaciado.e14, marginTop: espaciado.e16,
  },
  // Info.
  nombreFila: { flexDirection: 'row', alignItems: 'flex-start', gap: espaciado.e8 },
  nombre: { fontSize: tipografia.cabecera, fontWeight: peso.maximo, flex: 1 },
  badgeVerificado: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e3, borderRadius: radios.md,
    paddingHorizontal: espaciado.e6, paddingVertical: espaciado.e3, marginTop: espaciado.e4,
  },
  badgeVerificadoTxt: { fontSize: tipografia.micro, fontWeight: peso.fuerte },
  filaPin: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e6 },
  filaNota: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e6 },
  notaMedia: { fontSize: tipografia.cuerpo, fontWeight: peso.maximo },
  // Los dos atajos de la cabecera (chat + opinión): mitad y mitad, con borde, no primarios —
  // la acción principal de esta pantalla es reservar y lo dice la barra de abajo.
  filaAcciones: { flexDirection: 'row', gap: espaciado.e8, marginTop: espaciado.e10 },
  accion: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e6,
    borderWidth: trazo.fino, borderRadius: radios.chip, paddingVertical: espaciado.e8,
  },
  accionTxt: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  sub: { fontSize: tipografia.caption },
  dato: { fontSize: tipografia.body, lineHeight: 21 },
  // Habitaciones seleccionables.
  habWrapper: { borderRadius: radios.panel, borderWidth: trazo.base },
  // Llegada.
  botonLinea: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, borderWidth: trazo.fino, borderRadius: radios.chip, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8, marginTop: espaciado.e6 },
  botonLineaTxt: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  aviso: { borderWidth: trazo.fino, borderRadius: radios.chip, padding: espaciado.e10, marginTop: espaciado.e6 },
  // Servicios.
  servicios: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e6 },
  servicio: { borderWidth: trazo.fino, borderRadius: radios.tarjeta, paddingHorizontal: espaciado.e10, paddingVertical: espaciado.e4 },
  servicioTxt: { fontSize: tipografia.caption },
  // Políticas.
  bloquePoliticas: { borderWidth: trazo.fino, borderRadius: radios.panel, padding: espaciado.e12, gap: espaciado.e10 },
  politicaFila: { gap: espaciado.e2 },
  politicaClave: { fontSize: tipografia.micro, fontWeight: peso.maximo, letterSpacing: 0.4 },
  politicaValor: { fontSize: tipografia.caption, lineHeight: 17 },
  // Resumen de opiniones.
  resumen: {
    borderWidth: trazo.fino, borderRadius: radios.panel, padding: espaciado.e12,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: espaciado.e10,
  },
  resumenNota: { fontSize: 40, fontWeight: peso.maximo, lineHeight: 44 },
  // Barras por dimensión (027): etiqueta fija a la izquierda, barra elástica en medio, cifra a la
  // derecha. La barra vacía nunca se dibuja: sin datos, la fila no sale.
  dims: { borderWidth: trazo.fino, borderRadius: radios.panel, padding: espaciado.e12, gap: espaciado.e10, marginTop: espaciado.e8 },
  dimFila: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 },
  dimEtiqueta: { width: 92, fontSize: tipografia.caption },
  dimBarra: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  dimBarraLlena: { height: 6, borderRadius: 3 },
  dimNota: { width: 30, fontSize: tipografia.caption, fontWeight: peso.fuerte, textAlign: 'right' },
  // Una reseña.
  resena: { borderWidth: trazo.fino, borderRadius: radios.campo, padding: espaciado.e10, gap: espaciado.e6 },
  resenaCab: { flexDirection: 'row', alignItems: 'flex-start', gap: espaciado.e8 },
  resenaAvatar: {
    width: 32, height: 32, borderRadius: 16, borderWidth: trazo.fino,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  resenaAvatarTxt: { fontSize: tipografia.caption, fontWeight: peso.maximo },
  resenaQuienBloque: { flex: 1, gap: 2 },
  resenaQuien: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  resenaFecha: { fontSize: tipografia.micro },
  resenaNota: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e4 },
  resenaNotaTxt: { fontSize: tipografia.caption, fontWeight: peso.maximo },
  resenaTexto: { fontSize: tipografia.body, lineHeight: 20 },
  respuesta: { borderWidth: trazo.fino, borderRadius: radios.chip, padding: espaciado.e10, gap: espaciado.e3 },
  respuestaEtq: { fontSize: tipografia.micro, fontWeight: peso.maximo },
  // Barra inferior de reserva.
  barraReserva: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e10,
    paddingHorizontal: espaciado.e14, paddingTop: espaciado.e10, borderTopWidth: trazo.fino,
  },
  barraReservaDato: { flex: 1, minWidth: 0, gap: 2 },
  barraReservaSub: { fontSize: tipografia.micro },
  barraReservaBtn: {
    height: 48, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: espaciado.e16, flexShrink: 0,
  },
  barraReservaBtnTxt: { color: brand.white, fontSize: tipografia.body, fontWeight: peso.maximo },
});
