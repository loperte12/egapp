/**
 * lifebook-hotel-perfil — LA FICHA DEL HOTEL (panel del hotelero).
 *
 * Segunda de las pantallas que faltaban: el servidor sabía guardar la ficha desde la
 * Parte 42 (`PUT my/hotel`) y el cliente tenía el método escrito… pero **ninguna pantalla lo
 * llamaba**. Sin esto, el hotelero no puede poner sus estrellas, su horario de entrada o sus
 * normas: el huésped ve un alojamiento a medio describir.
 *
 * Dos cosas que se han MEDIDO y condicionan la pantalla:
 *
 * 1. **Quitar una forma de pago no funciona desde aquí.** Probado contra el servidor: se pidió
 *    dejar solo «transferencia» y las demás siguieron activas. Guardar la ficha solo puede
 *    ACTIVAR formas de pago, no desactivarlas. Por eso la pantalla lo dice con todas las
 *    letras y manda a los ajustes de la tienda, que es donde sí se quitan.
 *
 * 2. **Un hotel no acepta cualquier forma de pago de la tienda.** El servidor solo admite
 *    cinco (`transfer`, `deposit`, `in_store`, `billing`, `likebook_wallet`) y rechaza el
 *    resto con `PAYMENT_METHOD_INVALID`. La tienda de pruebas tenía «efectivo contra
 *    entrega» activo, que un hotel no puede ofrecer: aquí solo se enseñan las cinco válidas
 *    — y si la tienda tiene otras, se avisa sin ofrecerlas.
 *
 * El nombre, la ciudad y el logo NO se tocan aquí: son de la tienda y se editan en sus
 * ajustes. Duplicarlos sería tener dos sitios que escriben lo mismo.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, FormField, GhostButton, PrimaryButton, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { useScreenGuard } from '@egrouteplan/ui-kit';
import { AuthGate } from '../core/AuthGate';
import { PanelGate } from '../core/PanelGate';
import { hotelApi, type HotelProfile } from '../api/hotel';
import { ApiError } from '../api/httpClient';

const TIPOS: { id: string; label: string }[] = [
  { id: 'hotel', label: 'Hotel' },
  { id: 'hostal', label: 'Hostal' },
  { id: 'guest_house', label: 'Casa de huéspedes' },
  { id: 'apartahotel', label: 'Apartahotel' },
  { id: 'resort', label: 'Resort' },
  { id: 'motel', label: 'Motel' },
];

const SERVICIOS: { id: string; label: string }[] = [
  { id: 'wifi', label: 'Wi-Fi' }, { id: 'desayuno', label: 'Desayuno' },
  { id: 'aire', label: 'Aire acondicionado' }, { id: 'piscina', label: 'Piscina' },
  { id: 'parking', label: 'Aparcamiento' }, { id: 'restaurante', label: 'Restaurante' },
  { id: 'bar', label: 'Bar' }, { id: 'gimnasio', label: 'Gimnasio' },
  { id: 'recepcion_24h', label: 'Recepción 24 h' }, { id: 'agua_caliente', label: 'Agua caliente' },
  { id: 'generador', label: 'Generador eléctrico' }, { id: 'lavanderia', label: 'Lavandería' },
  { id: 'tv', label: 'Televisión' }, { id: 'terraza', label: 'Terraza' },
  { id: 'ascensor', label: 'Ascensor' }, { id: 'admite_mascotas', label: 'Admite mascotas' },
  { id: 'adaptado', label: 'Adaptado' }, { id: 'cocina', label: 'Cocina' },
  { id: 'nevera', label: 'Nevera' }, { id: 'caja_fuerte', label: 'Caja fuerte' },
  { id: 'seguridad', label: 'Vigilancia' },
];

/** Las ÚNICAS que el servidor acepta en un hotel (las demás dan PAYMENT_METHOD_INVALID). */
const PAGOS: { id: string; label: string; hint: string }[] = [
  { id: 'transfer', label: 'Transferencia / Orange Money', hint: 'El huésped envía la referencia y tú confirmas el cobro' },
  { id: 'deposit', label: 'Señal o anticipo', hint: 'Reserva con una parte y el resto al llegar' },
  { id: 'in_store', label: 'Pago en recepción', hint: 'Se cobra al recibir al huésped' },
  { id: 'billing', label: 'Billing', hint: 'Comprobante aprobado por la plataforma' },
  { id: 'likebook_wallet', label: 'Monedero', hint: 'La señal se retiene en el monedero y el hotel la cobra al entrar' },
];

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

export default function PerfilHotelScreen() {
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

  const [hotel, setHotel] = useState<HotelProfile | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const [tipo, setTipo] = useState('hotel');
  const [estrellas, setEstrellas] = useState<number | null>(null);
  const [entradaDesde, setEntradaDesde] = useState('14:00');
  const [entradaHasta, setEntradaHasta] = useState('22:00');
  const [salidaHasta, setSalidaHasta] = useState('12:00');
  const [recepcion24, setRecepcion24] = useState(false);
  const [impuestos, setImpuestos] = useState(true);
  const [servicios, setServicios] = useState<string[]>([]);
  const [normas, setNormas] = useState('');
  // Cómo se entra y dónde está la recepción: lo que el huésped lee al llegar. Se escribe una vez.
  const [llegada, setLlegada] = useState('');
  const [cancelacion, setCancelacion] = useState('');
  const [pagos, setPagos] = useState<string[]>([]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const out = await hotelApi.myHotel();
      const h = out.hotel;
      if (!h) { setError('Todavía no tienes tienda. Créala en «Mi tienda» antes de configurar el alojamiento.'); return; }
      setHotel(h);
      setTipo(h.propertyKind ?? 'hotel');
      setEstrellas(h.stars ?? null);
      setEntradaDesde(h.checkinFrom || '14:00');
      setEntradaHasta(h.checkinUntil || '22:00');
      setSalidaHasta(h.checkoutUntil || '12:00');
      setRecepcion24(!!h.receptionOpen24h);
      setImpuestos(h.taxesIncluded !== false);
      setServicios(h.amenities ?? []);
      setNormas(h.houseRules ?? '');
      setLlegada(h.arrivalNote ?? '');
      setCancelacion(h.cancellationPolicy ?? '');
      if (!h.isHotel) setAviso('Al guardar, tu tienda pasa a ser un alojamiento y aparecerá en el buscador de hotel.');
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo cargar la ficha del hotel.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { void cargar(); }, [cargar]);

  /** Las que constan como activas en la tienda (llegan con su estado). */
  const activosEnTienda = useMemo(() => {
    const raw = hotel?.paymentMethods ?? [];
    return raw
      .map((m) => (typeof m === 'string' ? { method: m, status: 'active' } : m))
      .filter((m) => m.status === 'active')
      .map((m) => String(m.method));
  }, [hotel]);

  // Se marca como elegidas las que ya están activas Y son válidas para un hotel.
  useEffect(() => {
    setPagos(activosEnTienda.filter((m) => PAGOS.some((x) => x.id === m)));
  }, [activosEnTienda]);

  const otrosDeLaTienda = activosEnTienda.filter((m) => !PAGOS.some((x) => x.id === m));

  const problema = useMemo((): string | null => {
    if (!HORA.test(entradaDesde)) return 'La hora de entrada desde tiene que ser HH:MM (por ejemplo 14:00).';
    if (!HORA.test(entradaHasta)) return 'La hora de entrada hasta tiene que ser HH:MM.';
    if (!HORA.test(salidaHasta)) return 'La hora de salida tiene que ser HH:MM.';
    if (entradaHasta <= entradaDesde) return 'La entrada «hasta» tiene que ser posterior a la entrada «desde».';
    if (!pagos.length) return 'Elige al menos una forma de pago.';
    return null;
  }, [entradaDesde, entradaHasta, salidaHasta, pagos]);

  const guardar = async () => {
    if (problema) { Alert.alert('Revisa los datos', problema); return; }
    setGuardando(true);
    setAviso(null);
    try {
      const out = await hotelApi.saveHotel({
        propertyKind: tipo,
        ...(estrellas ? { stars: estrellas } : {}),
        checkinFrom: entradaDesde, checkinUntil: entradaHasta, checkoutUntil: salidaHasta,
        receptionOpen24h: recepcion24,
        taxesIncluded: impuestos,
        amenities: servicios,
        houseRules: normas.trim() || undefined,
        arrivalNote: llegada.trim() || undefined,
        cancellationPolicy: cancelacion.trim() || undefined,
        paymentMethods: pagos,
      });
      setHotel(out.hotel);
      setAviso('Ficha guardada. El huésped ya ve estos datos al buscar y al reservar.');
    } catch (e) {
      setAviso(e instanceof ApiError ? e.message : 'No se pudo guardar la ficha.');
    } finally {
      setGuardando(false);
    }
  };

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
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.hero, lineHeight: 32 }}>‹</Text>
        </Pressable>
        <Text style={{ color: colors.textPrimary, fontSize: tipografia.subCabecera, fontWeight: peso.titulo, flex: 1 }}>Ficha del hotel</Text>
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

          {/* Lo que viene de la tienda */}
          <View style={[styles.caja, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={{ color: colors.textPrimary, fontSize: tipografia.fino, fontWeight: peso.titulo }}>{hotel?.name ?? 'Tu alojamiento'}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e3 }}>
              {[hotel?.barrio, hotel?.city, hotel?.region].filter(Boolean).join(' · ') || 'Sin dirección'}
              {hotel?.isVerified ? ' · ✅ Tienda verificada' : ''}
            </Text>
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e6, lineHeight: 17 }}>
              El nombre, la dirección, el logo y la portada son de tu tienda: se cambian en «Ajustes de la tienda».
            </Text>
            <View style={{ marginTop: espaciado.e10 }}>
              <GhostButton title="Ajustes de la tienda" onPress={() => router.push('/lifebook-merchant-settings' as never)} />
            </View>
          </View>

          <Bloque titulo="Tipo de alojamiento" hint="Ayuda al huésped a saber qué esperar.">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 }}>
              {TIPOS.map((t) => {
                const on = tipo === t.id;
                return (
                  <Pressable
                    key={t.id} onPress={() => setTipo(t.id)}
                    style={[styles.chip, { backgroundColor: on ? colors.primary : colors.surface, borderColor: on ? colors.primary : colors.border }]}
                  >
                    <Text style={{ color: on ? brand.white : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>{t.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Bloque>

          <Bloque titulo="Categoría" hint="De 1 a 5 estrellas. Si no la tienes, déjalo sin marcar: no es obligatorio.">
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}>
              {[1, 2, 3, 4, 5].map((n) => {
                const on = estrellas === n;
                return (
                  <Pressable
                    key={n} onPress={() => setEstrellas(on ? null : n)}
                    accessibilityLabel={`${n} estrella(s)`}
                    style={[styles.estrella, { borderColor: on ? colors.secondary : colors.border, backgroundColor: on ? alpha(colors.secondary, 0.12) : colors.surface }]}
                  >
                    <Text style={{ color: on ? colors.secondary : colors.textSecondary, fontSize: tipografia.cuerpo, fontWeight: peso.titulo }}>{n}★</Text>
                  </Pressable>
                );
              })}
              {estrellas ? (
                <Pressable
                  onPress={() => setEstrellas(null)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Quitar la categoría"
                  style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: espaciado.e6 }}
                >
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>Quitar</Text>
                </Pressable>
              ) : null}
            </View>
          </Bloque>

          <Bloque titulo="Horario de entrada y salida" hint="Es lo primero que mira el huésped el día que llega.">
            <View style={{ flexDirection: 'row', gap: espaciado.e10 }}>
              <View style={{ flex: 1 }}>
                <FormField label="Entrada desde" value={entradaDesde} onChangeText={setEntradaDesde} placeholder="14:00" maxLength={5} keyboardType="numbers-and-punctuation" />
              </View>
              <View style={{ flex: 1 }}>
                <FormField label="Entrada hasta" value={entradaHasta} onChangeText={setEntradaHasta} placeholder="22:00" maxLength={5} keyboardType="numbers-and-punctuation" />
              </View>
            </View>
            <View style={{ height: 10 }} />
            <FormField label="Salida hasta" value={salidaHasta} onChangeText={setSalidaHasta} placeholder="12:00" maxLength={5} keyboardType="numbers-and-punctuation" />
            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e5, marginLeft: espaciado.e4 }}>
              Formato de 24 horas: 14:00, no 2 PM.
            </Text>
            {/* Los dos interruptores van JUNTOS en una caja: sueltos parecían dos cosas
                distintas y sin relación con el horario que tienen encima. */}
            <View style={[styles.grupo, { borderColor: colors.border, backgroundColor: colors.surface }]}>
              <View style={styles.linea}>
                <View style={{ flex: 1, paddingRight: espaciado.e12 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>
                    Recepción abierta 24 horas
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>
                    Si está apagado, el huésped sabe que hay horas sin nadie en recepción.
                  </Text>
                </View>
                <Switch value={recepcion24} onValueChange={setRecepcion24} trackColor={{ true: alpha(colors.primary, 0.5) }} />
              </View>
              <View style={[styles.linea, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border }]}>
                <View style={{ flex: 1, paddingRight: espaciado.e12 }}>
                  <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>
                    Los precios ya incluyen impuestos
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>
                    Evita sorpresas en el mostrador al hacer la cuenta.
                  </Text>
                </View>
                <Switch value={impuestos} onValueChange={setImpuestos} trackColor={{ true: alpha(colors.primary, 0.5) }} />
              </View>
            </View>
          </Bloque>

          <Bloque titulo="Servicios del alojamiento" hint="Marca solo lo que hay de verdad en el hotel.">
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 }}>
              {SERVICIOS.map((s) => {
                const on = servicios.includes(s.id);
                return (
                  <Pressable
                    key={s.id}
                    onPress={() => setServicios((prev) => (on ? prev.filter((x) => x !== s.id) : [...prev, s.id]))}
                    style={[styles.chip, { backgroundColor: on ? alpha(colors.primary, 0.12) : colors.surface, borderColor: on ? colors.primary : colors.border }]}
                  >
                    <Text style={{ color: on ? colors.primary : colors.textPrimary, fontSize: tipografia.caption, fontWeight: peso.maximo }}>
                      {on ? '✓ ' : ''}{s.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Bloque>

          <Bloque titulo="Al llegar" hint="Cómo se entra y dónde está la recepción. Lo lee el huésped cuando baja del taxi, que es justo cuando más perdido está.">
            <FormField
              value={llegada} onChangeText={setLlegada} multiline maxLength={600}
              placeholder="Entrada por la puerta lateral, junto al parking. Recepción en el 2.º piso: si llegas de noche, timbre a la derecha."
            />
            <Contador actual={llegada.length} max={600} />
            <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e4 }}>
              Se enseña en la ficha del hotel, con el botón «Cómo llegar» y el taxi desde el aeropuerto.
            </Text>
          </Bloque>

          <Bloque titulo="Normas de la casa" hint="Se enseñan al reservar. Unas normas claras evitan discusiones en recepción.">
            <FormField
              value={normas} onChangeText={setNormas} multiline maxLength={600}
              placeholder="No fumar en las habitaciones. Silencio a partir de las 23:00. No se admiten visitas sin registrar."
            />
            <Contador actual={normas.length} max={600} />
          </Bloque>

          <Bloque titulo="Política de cancelación" hint="Además del plazo en horas de cada habitación, aquí va lo que quieras dejar claro.">
            <FormField
              value={cancelacion} onChangeText={setCancelacion} multiline maxLength={600}
              placeholder="Cancelación gratuita hasta 48 h antes. Después, la señal no se devuelve."
            />
            <Contador actual={cancelacion.length} max={600} />
          </Bloque>

          <Bloque titulo="Formas de pago" hint="Las que aceptas al reservar. Elige al menos una.">
            {PAGOS.map((m) => {
              const on = pagos.includes(m.id);
              return (
                <Pressable
                  key={m.id}
                  onPress={() => setPagos((prev) => (on ? prev.filter((x) => x !== m.id) : [...prev, m.id]))}
                  style={[styles.pago, { backgroundColor: on ? alpha(colors.primary, 0.08) : colors.surface, borderColor: on ? colors.primary : colors.border }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: peso.maximo }}>
                      {on ? '✓ ' : ''}{m.label}
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2, lineHeight: 16 }}>{m.hint}</Text>
                  </View>
                </Pressable>
              );
            })}

            {otrosDeLaTienda.length ? (
              <Text style={{ color: colors.secondary, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e8, lineHeight: 17 }}>
                ⚠️ Tu tienda tiene activa(s) {otrosDeLaTienda.join(', ')}, que un alojamiento no puede ofrecer.
                No se enseñan al huésped.
              </Text>
            ) : null}

            <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e8, lineHeight: 17 }}>
              Aquí solo se pueden AÑADIR formas de pago. Para quitar una, entra en «Ajustes de la tienda»:
              en la ficha del hotel, desmarcar no la desactiva (comprobado contra el servidor).
            </Text>
          </Bloque>

          <View style={{ marginTop: espaciado.e8 }}>
            <PrimaryButton title="Guardar la ficha" onPress={() => void guardar()} loading={guardando} disabled={!!problema} />
          </View>
          {problema ? (
            <Text style={{ color: colors.secondary, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e10 }}>⚠️ {problema}</Text>
          ) : null}

          <View style={{ marginTop: espaciado.e16 }}>
            <GhostButton title="Mis habitaciones" onPress={() => router.push('/lifebook-hotel-habitaciones' as never)} />
          </View>
        </ScrollView>
      )}
    </View>
  );
}

/**
 * Contador de caracteres.
 *
 * Existe por un motivo concreto: el servidor RECORTA en silencio estos campos a 600 caracteres
 * (`this.clean(dto.houseRules, 600)`). Sin contador, el hotelero escribe ochocientos caracteres,
 * la app los manda, el servidor guarda seiscientos y **el dueño no sabe que ha perdido texto**.
 * Mismo problema con el nombre (120) y la descripción (2000).
 */
function Contador({ actual, max }: { actual: number; max: number }) {
  const { colors } = useTheme();
  const quedan = max - actual;
  return (
    <Text
      style={{
        color: quedan <= 40 ? colors.secondary : colors.textSecondary,
        fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e6, marginLeft: espaciado.e4,
      }}
      accessibilityLiveRegion="polite"
    >
      {quedan <= 40 ? `Te quedan ${quedan} caracteres` : `${actual} de ${max}`}
    </Text>
  );
}

function Bloque({ titulo, hint, children }: { titulo: string; hint?: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={{ marginTop: espaciado.e22 }}>
      <Text style={{ color: colors.textPrimary, fontSize: tipografia.cuerpo, fontWeight: peso.titulo, marginBottom: espaciado.e3 }}>{titulo}</Text>
      {hint ? <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 17, marginBottom: espaciado.e10 }}>{hint}</Text> : <View style={{ height: 7 }} />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  cabecera: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e4,
    paddingHorizontal: espaciado.e12, paddingBottom: espaciado.e10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  volver: { width: 40, height: 34, alignItems: 'center', justifyContent: 'center' },
  aviso: { borderWidth: trazo.fino, borderRadius: radios.md, padding: espaciado.e11, marginBottom: espaciado.e4 },
  caja: { borderWidth: trazo.fino, borderRadius: radios.lg, padding: espaciado.e14 },
  // Objetivos táctiles de 44 px como mínimo (un chip de 33 px se falla con el dedo).
  chip: { borderWidth: trazo.base, borderRadius: radios.full, paddingHorizontal: espaciado.e13, minHeight: 44, justifyContent: 'center' },
  estrella: {
    borderWidth: trazo.base, borderRadius: radios.md, minHeight: 44, minWidth: 54,
    alignItems: 'center', justifyContent: 'center',
  },
  linea: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: espaciado.e11,
  },
  grupo: { borderWidth: trazo.fino, borderRadius: radios.campo, paddingHorizontal: espaciado.e12, marginTop: espaciado.e12 },
  pago: { borderWidth: trazo.base, borderRadius: radios.md, padding: espaciado.e11, marginBottom: espaciado.e8, flexDirection: 'row', alignItems: 'center' },
});
