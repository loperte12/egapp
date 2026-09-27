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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Platform, Pressable, RefreshControl, SectionList, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, altura, brand, espaciado, peso, Precio, radios, tipografia, trazo, useTheme } from '@egrouteplan/ui-kit';
import { availableActions, estadoRotulo, senalCobrada } from '@egrouteplan/contracts';
import { AuthGate } from '../core/AuthGate';
import {
  hotelApi, PAGO_ETIQUETA, METODO_ETIQUETA, REVIEWS_DELETE_DAYS, type Reservation,
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

  /*
    AL VOLVER DE VALORAR UNA ESTANCIA, la tarjeta tiene que dejar de ofrecer «Valorar la estancia»
    — y esa reseña se escribe en otra pantalla, así que sin esto la lista seguiría como estaba hasta
    tirar del refresco a mano.

    Se refresca EN SILENCIO y solo en el foco POSTERIOR al montaje: de la primera carga y del cambio
    de pestaña ya se encarga el `useEffect` de arriba (que sí enseña el indicador). La función va por
    referencia para que este efecto no se vuelva a suscribir en cada cambio de lado — si dependiera
    de `cargar`, cada cambio de pestaña dispararía DOS peticiones.
  */
  const cargarRef = useRef(cargar);
  cargarRef.current = cargar;
  const primerFoco = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (primerFoco.current) { primerFoco.current = false; return; }
      void cargarRef.current(true);
    }, []),
  );

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

  const accion = async (fn: () => Promise<unknown>, exito: string) => {
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

  /**
   * Valorar la estancia: abre la pantalla de la reseña con ESTA reserva delante. La puerta la cierra
   * el servidor (estancia tuya, de ese alojamiento, ya terminada); aquí solo se ofrece a quien puede.
   *
   * El `shopId` va en la reserva: `hotel.id` es el identificador de la tienda, que es lo que pide la
   * ruta de las reseñas. Sin él la pantalla no cargaría nada, así que se manda siempre.
   */
  const valorar = (r: Reservation) =>
    router.push({
      pathname: '/lifebook-hotel-resena',
      params: {
        reservationId: r.id,
        shopId: r.hotel?.id ?? '',
        shopName: r.hotel?.name ?? 'el alojamiento',
        roomName: r.roomName,
      },
    } as never);

  /**
   * Borrar la propia reseña. El plazo —7 días— NO se comprueba aquí: lo cierra el servidor
   * (`REVIEW_WINDOW_CLOSED`) y su mensaje ya dice cuál es el plazo. Duplicar la regla en la app sería
   * tener dos versiones que se desincronizan, y la de la app no podría cerrar nada de todos modos.
   */
  const borrarResena = (r: Reservation) => {
    if (!r.reviewId) return;
    const hacerlo = () =>
      void accion(() => hotelApi.deleteReview(String(r.reviewId)), 'Reseña borrada. Puedes escribir otra de esta estancia.');
    if (Platform.OS === 'web') {
      if (window.confirm('Se borrará tu reseña de esta estancia. ¿Seguir?')) hacerlo();
      return;
    }
    Alert.alert(
      'Borrar mi reseña',
      'Se borrará la reseña de esta estancia y podrás escribir otra. No se puede deshacer.',
      [
        { text: 'No', style: 'cancel' },
        { text: 'Sí, borrar', style: 'destructive', onPress: hacerlo },
      ],
    );
  };

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
              <Text style={[styles.tabTxt, { color: activo ? colors.text.primary : colors.textSecondary }]}>
                {s === 'guest' ? 'Mis estancias' : 'Mi hotel'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {cargando ? (
        <View style={styles.centro}><ActivityIndicator color={colors.text.primary} /></View>
      ) : (
        /*
          LISTA VIRTUALIZADA POR SECCIONES (auditoría de diseño, D-04/D-21): antes era un
          ScrollView con un bloque «Grupo» por sección y cada bloque con su .map(), así que
          TODAS las reservas quedaban montadas. Aquí la sección es el grupo y la fila es la
          reserva. `stickySectionHeadersEnabled` en false a propósito: los títulos nunca
          fueron pegajosos. El hueco lo pone el `gap: espaciado.e12` del contenedor.
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
          contentContainerStyle={{ padding: espaciado.e14, paddingBottom: insets.bottom + 30, gap: espaciado.e12 }}
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
              onValorar={valorar}
              onBorrarResena={borrarResena}
              onAbrir={(x) => router.push({ pathname: '/lifebook-hotel-reserva', params: { id: x.id } } as never)}
            />
          )}
          ListHeaderComponent={
            /*
            Un `View` con el hueco del contenedor, y no un fragmento: el `gap` de
            `contentContainerStyle` separa CELDAS, y `ListHeaderComponent` es UNA celda. Con un
            fragmento, todo lo de aquí dentro quedaba pegado (era gap: espaciado.e12 antes de virtualizar).
            */
            <View style={{ gap: espaciado.e12 }}>
          {aviso ? (
            <View style={[styles.bloque, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <Text style={[styles.sub, { color: colors.textPrimary }]}>{aviso}</Text>
            </View>
          ) : null}
          {error ? (
            <View style={[styles.bloque, { borderColor: colors.danger, backgroundColor: alpha(colors.danger, 0.06) }]}>
              <Text style={{ color: colors.text.danger, fontSize: tipografia.body, fontWeight: peso.medio }}>{error}</Text>
              <Pressable onPress={() => void cargar()} accessibilityRole="button" accessibilityLabel="Reintentar">
                <Text style={[styles.enlace, { color: colors.text.primary }]}>Reintentar</Text>
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
                  <Text style={[styles.lineaVal, { color: o.occupied >= o.totalUnits ? colors.text.danger : colors.text.success }]}>
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
                  <Text style={[styles.enlace, { color: colors.text.primary }]}>Buscar alojamiento</Text>
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
  r, lado, onCancelar, onConfirmarSenal, onValorar, onBorrarResena, onAbrir,
}: {
  r: Reservation;
  lado: 'guest' | 'hotel';
  onCancelar: (r: Reservation) => void;
  onConfirmarSenal: (r: Reservation) => void;
  onValorar: (r: Reservation) => void;
  onBorrarResena: (r: Reservation) => void;
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
  /* El MISMO estado en color de TEXTO: `colorEstado` pinta también el tinte y el borde. */
  const colorEstadoTxt = r.status === 'cancelled' || r.status === 'no_show'
    ? colors.textSecondary
    : r.status === 'checked_out'
      ? colors.text.success
      : r.status === 'hold'
        ? colors.text.danger
        : colors.text.primary;

  const puedeEnviarRef = r.role === 'guest' && r.paymentMethod === 'transfer'
    && r.paymentStatus === 'pending' && r.status === 'hold';
  const puedeConfirmarSenal = r.role === 'hotel' && ['hold', 'pending'].includes(r.status)
    && !senalCobrada(r.paymentStatus) && r.depositXaf > 0;
  // Quién puede cancelar lo dice el CONTRATO, no una lista copiada aquí (antes: la misma
  // lista `!['checked_out','cancelled','no_show']` que en la ficha, y ninguna de las dos
  // excluía `checked_in`). `viva: true` porque el `r.viva &&` de delante ya lo exige: así no
  // se cuela la rama del contrato que deja «soltar» una retención ya vencida, que es otro caso.
  const puedeCancelar = r.viva && availableActions(r.status, { who: r.role, viva: true }).includes('cancel');

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
          <Text style={[styles.badgeTxt, { color: colorEstadoTxt }]}>{estadoRotulo(r.status, { senalCobrada: senalCobrada(r.paymentStatus) })}</Text>
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
          <Precio valor={r.totalXaf} tamano="md" color={colors.textPrimary} />
        </View>
        {r.depositXaf > 0 ? (
          <>
            <View style={styles.linea}>
              <Text style={[styles.lineaEtq, { color: colors.textPrimary }]}>Señal ({r.depositPercent} %)</Text>
              <Precio valor={r.depositXaf} tamano="md" color={colors.text.primary} />
            </View>
            <View style={styles.linea}>
              <Text style={[styles.lineaEtq, { color: colors.textPrimary }]}>Al llegar</Text>
              <Precio valor={r.remainingXaf} tamano="md" color={colors.text.secondary} />
            </View>
          </>
        ) : (
          <View style={styles.linea}>
            <Text style={[styles.lineaEtq, { color: colors.textPrimary }]}>Se paga al llegar</Text>
            <Precio valor={r.totalXaf} tamano="md" color={colors.text.secondary} />
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
        <Text style={[styles.aviso, { color: colors.text.danger }]}>
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

      {/*
        ── VALORAR LA ESTANCIA (C-1 · D4) ─────────────────────────────────────────────────
        La puerta es la estancia TERMINADA y solo para el huésped: valorar una estancia en curso es
        valorar una promesa, y el hotel no escribe reseñas de sí mismo. El `reviewId` que manda el
        servidor es lo que evita ofrecer «Valorar» a quien ya la escribió — sin él, el 409 sería la
        puerta en vez de la red.
      */}
      {lado === 'guest' && r.status === 'checked_out' ? (
        r.reviewId ? (
          <View style={{ gap: espaciado.e4, marginTop: espaciado.e8 }}>
            <Text style={[styles.aviso, { color: colors.textSecondary }]}>
              <Text style={{ color: colors.text.warning }}>★ </Text>
              Ya valoraste esta estancia. Se puede borrar durante {REVIEWS_DELETE_DAYS} días; no se
              edita.
            </Text>
            <Pressable
              onPress={() => onBorrarResena(r)}
              accessibilityRole="button"
              accessibilityLabel={`Borrar mi reseña de la reserva ${r.code}`}
              style={[styles.botonFantasma, { borderColor: colors.border }]}
            >
              <Text style={[styles.botonFantasmaTxt, { color: colors.text.danger }]}>Borrar mi reseña</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => onValorar(r)}
            accessibilityRole="button"
            accessibilityLabel={`Valorar la estancia de la reserva ${r.code}`}
            style={[styles.boton, { backgroundColor: colors.primary, marginTop: espaciado.e8 }]}
          >
            <Text style={styles.botonTxt}>Valorar la estancia</Text>
          </Pressable>
        )
      ) : null}

      {puedeEnviarRef ? (
        <View style={{ gap: espaciado.e6, marginTop: espaciado.e8 }}>
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
          style={[styles.boton, { backgroundColor: colors.success, marginTop: espaciado.e8 }]}
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
          <Text style={[styles.botonFantasmaTxt, { color: colors.text.danger }]}>Cancelar reserva</Text>
        </Pressable>
      ) : null}

      {msg ? <Text style={[styles.aviso, { color: colors.textSecondary }]}>{msg}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  barra: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, paddingHorizontal: espaciado.e14, paddingBottom: espaciado.e10, borderBottomWidth: trazo.fino },
  volver: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  volverTxt: { fontSize: tipografia.display, fontWeight: peso.fuerte, lineHeight: 28 },
  titulo: { fontSize: tipografia.anchoFuerte, fontWeight: peso.maximo, flex: 1 },
  tabs: { flexDirection: 'row', borderBottomWidth: trazo.fino },
  tab: { flex: 1, alignItems: 'center', paddingVertical: espaciado.e12, borderBottomWidth: trazo.fuerte },
  tabTxt: { fontSize: tipografia.body, fontWeight: peso.fuerte },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bloque: { borderWidth: trazo.fino, borderRadius: radios.lg, padding: espaciado.e12, gap: espaciado.e4 },
  etiqueta: { fontSize: tipografia.micro, fontWeight: peso.maximo, letterSpacing: 0.6 },
  seccion: { fontSize: tipografia.fino, fontWeight: peso.maximo },
  card: { borderWidth: trazo.fino, borderRadius: radios.lg, padding: espaciado.e12, gap: espaciado.e4 },
  codigo: { fontSize: tipografia.ancho, fontWeight: peso.maximo, letterSpacing: 0.5 },
  sub: { fontSize: tipografia.caption },
  dato: { fontSize: tipografia.body, marginTop: espaciado.e2 },
  linea: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espaciado.e10 },
  lineaEtq: { fontSize: tipografia.caption, flex: 1 },
  lineaVal: { fontSize: tipografia.body },
  badge: { borderWidth: trazo.fino, borderRadius: radios.chip, paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3 },
  badgeTxt: { fontSize: tipografia.micro, fontWeight: peso.maximo },
  dinero: { borderWidth: trazo.fino, borderRadius: radios.md, padding: espaciado.e9, marginTop: espaciado.e6, gap: espaciado.e2 },
  aviso: { fontSize: tipografia.caption, marginTop: espaciado.e6, fontWeight: peso.medio },
  input: { borderWidth: trazo.fino, borderRadius: radios.md, paddingHorizontal: espaciado.e12, height: altura.punto, fontSize: tipografia.body },
  boton: { height: altura.punto, borderRadius: radios.md, alignItems: 'center', justifyContent: 'center' },
  botonTxt: { color: brand.white, fontSize: tipografia.body, fontWeight: peso.maximo },
  botonFantasma: { borderWidth: trazo.fino, borderRadius: radios.md, height: altura.punto, alignItems: 'center', justifyContent: 'center', marginTop: espaciado.e8 },
  botonFantasmaTxt: { fontSize: tipografia.body, fontWeight: peso.maximo },
  enlace: { fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e4 },
});
