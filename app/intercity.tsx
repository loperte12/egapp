/**
 * IntercityScreen — Ciudad a Ciudad (pasajero) v2.
 * Auditoría aplicada:
 *  · Total de alquiler (charter) correcto: rentalPrice una sola vez.
 *  · Idempotency-Key FRESCA por intento de reserva (adiós clave fija por sesión).
 *  · Error único limpio en cada transición de paso/acción.
 *  · Menores exigen nombre + teléfono de tutor (guardianName → backend).
 *  · Teléfonos normalizados y validados en formato GQ (+240/9 dígitos).
 *  · Compra por encargo EXPLÍCITA ("Compro para mí / para otra persona") con
 *    teléfono del comprador y del viajero separados.
 *  · Chip extraído con a11y, SafeArea, keyboardShouldPersistTaps, LazyImage,
 *    busyRef y navegación desde el ticket.
 * Ruta: /intercity
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ArrowLeft, Route as RouteIcon, Ticket, CheckCircle2, ChevronRight, Crown, BadgeCheck,
} from 'lucide-react-native';
import { alpha, espaciado, FormField, GhostButton, PrimaryButton, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { useSession } from '../state/session';
import { intercityApi, type IcBooking, type IcLocation, type IcTrip, IC_VEHICLE_TYPES, IC_VEHICLE_LABELS } from '../api/intercity';
import { LazyImage } from '../components/rental/LazyImage';
import { brand } from '@egrouteplan/ui-kit';

type Step = 'search' | 'trips' | 'passenger' | 'confirm' | 'ticket';

const NATIONALITIES = ['Ecuatoguineano', 'Extranjero'];
const DOC_TYPES = ['DIP', 'Pasaporte'];
const NEEDS: Array<[string, string]> = [['none', 'Ninguna'], ['pregnant', 'Embarazada'], ['disabled', 'Movilidad reducida'], ['sick', 'Enfermedad']];

const digits = (s: string) => String(s ?? '').replace(/\D/g, '');
/** Normaliza un teléfono GQ: 9 dígitos → +240…; con prefijo 240 → +240…; si no es GQ devuelve null. */
const gqPhone = (raw: string): string | null => {
  const d = digits(raw);
  if (d.length === 9) return `+240${d}`;
  if (d.length === 12 && d.startsWith('240')) return `+${d}`;
  return null;
};
const absUrl = (p: string) => (p.startsWith('http') ? p : `https://hk.egrouteplan.com${p}`);

export default function IntercityScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { phone: sessionPhone } = useSession();
  const busyRef = useRef(false);

  const [step, setStep] = useState<Step>('search');
  const [locs, setLocs] = useState<IcLocation[]>([]);
  const [trips, setTrips] = useState<IcTrip[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Búsqueda
  const [originProv, setOriginProv] = useState('');
  const [originDist, setOriginDist] = useState('');
  const [destProv, setDestProv] = useState('');
  const [destDist, setDestDist] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('');

  // Viaje
  const [trip, setTrip] = useState<IcTrip | null>(null);
  const [seats, setSeats] = useState(1);

  // Pasajero
  const [forOther, setForOther] = useState(false); // compra por encargo (explícito)
  const [buyerPhone, setBuyerPhone] = useState(sessionPhone ?? '');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState(sessionPhone ?? '');
  const [nationality, setNationality] = useState(NATIONALITIES[0]);
  const [docType, setDocType] = useState(DOC_TYPES[0]);
  const [docNumber, setDocNumber] = useState('');
  const [minorCount, setMinorCount] = useState(0);
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [specialNeeds, setSpecialNeeds] = useState('none');
  const [pickupType, setPickupType] = useState<'home' | 'agency'>('home');
  const [pickupAddress, setPickupAddress] = useState('');
  const [passengerFare, setPassengerFare] = useState('');
  const [rental, setRental] = useState(false);
  const [payOn, setPayOn] = useState<'boarding' | 'destination'>('boarding');

  const [booking, setBooking] = useState<{ ticketQrCode: string; message: string; fareStatus: string; booking?: IcBooking } | null>(null);

  useEffect(() => {
    intercityApi.locations().then(setLocs).catch((e) => setError(e instanceof Error ? e.message : 'Error de red'));
  }, []);

  const provinces = useMemo(() => [...new Set(locs.map((l) => l.province))], [locs]);
  const originDists = useMemo(() => locs.filter((l) => l.province === originProv), [locs, originProv]);
  const destDists = useMemo(() => locs.filter((l) => l.province === destProv), [locs, destProv]);
  const originZone = originDists.find((l) => l.district === originDist)?.zone ?? '';
  const destZone = destDists.find((l) => l.district === destDist)?.zone ?? '';
  const travelerPhone = gqPhone(phone);
  const sessionGQ = sessionPhone ? gqPhone(sessionPhone) : null;
  const isCommission = forOther || (sessionGQ != null && travelerPhone != null && travelerPhone !== sessionGQ);

  const go = (s: Step) => { setError(null); setStep(s); };
  const goBack = () => {
    setError(null);
    if (step === 'search') router.back();
    else if (step === 'trips') setStep('search');
    else if (step === 'passenger') setStep('trips');
    else if (step === 'confirm') setStep('passenger');
    else setStep('search'); // ticket → reinicia búsqueda limpia
  };

  const search = async () => {
    if (!originProv || !destProv) { setError('Elige la provincia de origen y de destino'); return; }
    setLoading(true); setError(null);
    try {
      const q: Record<string, string> = { originProvince: originProv, destinationProvince: destProv };
      if (originDist) q.originDistrict = originDist;
      if (destDist) q.destinationDistrict = destDist;
      const rs = await intercityApi.routes(q);
      if (rs.length === 0) { setError('No hay rutas para esa combinación todavía'); return; }
      const allTrips = (await Promise.all(rs.map((r) => intercityApi.trips(r.id, undefined, vehicleFilter || undefined)))).flat();
      const unique = [...new Map(allTrips.map((t) => [t.id, t])).values()]
        .sort((a, b) => new Date(a.departureTime).getTime() - new Date(b.departureTime).getTime());
      setTrips(unique);
      setTrip(null);
      go('trips');
    } catch (e) { setError(e instanceof Error ? e.message : 'Error de red'); }
    finally { setLoading(false); }
  };

  const pickTrip = (t: IcTrip) => {
    setTrip(t);
    setSeats(1);
    setRental(false);
    setPassengerFare('');
    go('passenger');
  };

  const confirm = async () => {
    if (!trip || busyRef.current) return;
    if (!firstName.trim() || !lastName.trim()) { setError('Completa nombre y apellidos'); return; }
    if (!travelerPhone) { setError('Teléfono del viajero no válido: usa +240 o 9 dígitos'); return; }
    if (forOther && !gqPhone(buyerPhone)) { setError('Tu teléfono (comprador) no es válido: usa +240 o 9 dígitos'); return; }
    if (!docNumber.trim()) { setError('Indica el número de documento'); return; }
    if (minorCount > 0) {
      if (!guardianName.trim()) { setError('Indica el nombre del tutor del menor'); return; }
      if (!gqPhone(guardianPhone)) { setError('Teléfono del tutor no válido: usa +240 o 9 dígitos'); return; }
    }
    if (pickupType === 'home' && !pickupAddress.trim()) { setError('Indica tu dirección de recogida a casa'); return; }
    if (rental && !trip.rentalPrice) { setError('Este viaje no ofrece alquiler del vehículo'); return; }
    const fare = rental ? null : (passengerFare.trim() ? Number(passengerFare.trim()) : null);
    if (fare != null && !(fare > 0)) { setError('Tarifa propuesta inválida'); return; }

    setBusyRef(true);
    setError(null);
    // Idempotency-Key FRESCA por intento (no reutilizar una fallida con otro viaje).
    const idemKey = `ic-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      const res = await intercityApi.book({
        tripId: trip.id,
        seatCount: rental ? trip.totalSeats : seats,
        passenger: {
          firstName: firstName.trim(), lastName: lastName.trim(),
          phone: travelerPhone,
          nationalityType: nationality === 'Extranjero' ? 'foreign' : 'national',
          documentType: docType, documentNumber: docNumber.trim(),
          isMinor: minorCount > 0, minorCount,
          guardianId: minorCount > 0 ? gqPhone(guardianPhone) ?? undefined : undefined,
          guardianName: minorCount > 0 ? guardianName.trim() : undefined,
          specialNeeds,
        },
        pickupType,
        pickupAddress: pickupType === 'home' ? pickupAddress.trim() : undefined,
        passengerFare: fare ?? undefined,
        rental,
        payOn,
      }, idemKey);
      setBooking(res);
      go('ticket');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo reservar');
    } finally {
      setBusyRef(false);
    }
  };

  const setBusyRef = (v: boolean) => { busyRef.current = v; };
  const totalSeatsUsed = rental ? trip?.totalSeats ?? 1 : seats;
  const unitPrice = rental ? Number(trip?.rentalPrice ?? 0) : Number(passengerFare.trim() || trip?.price || 0);
  const total = rental ? unitPrice : unitPrice * totalSeatsUsed;

  const s = styles(colors);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={s.topBar}>
        <Pressable onPress={goBack} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={s.title}>Ciudad a Ciudad</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e14 }}>
          <Pressable onPress={() => router.push('/intercity-planes' as never)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Planes">
            <Crown size={20} color={colors.primary} />
          </Pressable>
        </View>
      </View>

      {step !== 'trips' ? (
      <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {step === 'search' && (
          <View style={s.block}>
            <View style={{ alignItems: 'center', gap: espaciado.e4 }}>
              <RouteIcon size={40} color={colors.primary} />
              <Text style={s.big}>¿A dónde vas?</Text>
              <Text style={s.body}>Elige provincia y distrito de salida y de llegada.</Text>
            </View>

            <Text style={s.label}>ORIGEN</Text>
            <View style={s.chipRow}>{provinces.map((p) => <Chip key={p} label={p} active={p === originProv} onPress={() => { setOriginProv(p); setOriginDist(''); setError(null); }} />)}</View>
            {originProv !== '' && <View style={s.chipRow}>{originDists.map((d) => <Chip key={d.district} label={d.district} active={d.district === originDist} onPress={() => { setOriginDist(d.district); setError(null); }} />)}</View>}
            {originZone && <Text style={s.zone}>Zona jurídica: {originZone}</Text>}

            <Text style={s.label}>DESTINO</Text>
            <View style={s.chipRow}>{provinces.map((p) => <Chip key={p} label={p} active={p === destProv} onPress={() => { setDestProv(p); setDestDist(''); setError(null); }} />)}</View>
            {destProv !== '' && <View style={s.chipRow}>{destDists.map((d) => <Chip key={d.district} label={d.district} active={d.district === destDist} onPress={() => { setDestDist(d.district); setError(null); }} />)}</View>}
            {destZone && <Text style={s.zone}>Zona jurídica: {destZone}</Text>}

            <Text style={s.label}>TIPO DE VEHÍCULO (opcional)</Text>
            <View style={s.chipRow}>
              <Chip label="Todos" active={vehicleFilter === ''} onPress={() => setVehicleFilter('')} />
              {IC_VEHICLE_TYPES.map((t) => <Chip key={t} label={IC_VEHICLE_LABELS[t]} active={vehicleFilter === t} onPress={() => setVehicleFilter(t)} />)}
            </View>

            {error && <Text style={s.err}>{error}</Text>}
            <PrimaryButton title={loading ? 'Buscando…' : 'Buscar viajes'} onPress={search} loading={loading} />
          </View>
        )}
        {step === 'passenger' && trip && (
          <View style={s.block}>
            <Text style={s.big}>Tus datos</Text>
            <Text style={s.body}>Vehículo con {trip.availableSeats} asientos libres · {Number(trip.price).toLocaleString('es')} XAF por asiento.</Text>

            <Text style={s.label}>¿PARA QUIÉN ES LA RESERVA?</Text>
            <View style={s.chipRow}>
              <Chip label="Para mí" active={!forOther} onPress={() => { setForOther(false); setBuyerPhone(sessionPhone ?? ''); setError(null); }} />
              <Chip label="Para otra persona" active={forOther} onPress={() => { setForOther(true); setError(null); }} />
            </View>
            {forOther && <FormField label="Tu teléfono (comprador)" placeholder="+240…" value={buyerPhone} onChangeText={setBuyerPhone} keyboardType="phone-pad" />}

            <Text style={s.label}>TIPO DE RESERVA</Text>
            <View style={s.chipRow}>
              <Chip label={`Asiento · ${Number(trip.price).toLocaleString('es')} XAF`} active={!rental} onPress={() => { setRental(false); setError(null); }} />
              {trip.rentalPrice != null && <Chip label={`🚐 Vehículo completo · ${Number(trip.rentalPrice).toLocaleString('es')} XAF`} active={rental} onPress={() => { setRental(true); setError(null); }} />}
            </View>
            {!rental && (
              <View style={s.chipRow}>
                <Text style={s.labelInline}>Asientos: </Text>
                {[1, 2, 3, 4, 5, 6].filter((n) => n <= trip.availableSeats).map((n) => <Chip key={String(n)} label={String(n)} active={n === seats} onPress={() => setSeats(n)} />)}
              </View>
            )}

            <FormField label="Nombre" placeholder="Juan" value={firstName} onChangeText={setFirstName} />
            <FormField label="Apellidos" placeholder="Ondó" value={lastName} onChangeText={setLastName} />
            <FormField label={forOther ? 'Teléfono del viajero' : 'Tu teléfono'} placeholder="+240…" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
            {forOther && <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, fontWeight: '600' }}>El comprador pagará el billete; el viajero viaja con los datos indicados.</Text>}

            <Text style={s.label}>Nacionalidad</Text>
            <View style={s.chipRow}>{NATIONALITIES.map((n) => <Chip key={n} label={n} active={n === nationality} onPress={() => setNationality(n)} />)}</View>
            <Text style={s.label}>Documento</Text>
            <View style={s.chipRow}>{DOC_TYPES.map((d) => <Chip key={d} label={d} active={d === docType} onPress={() => setDocType(d)} />)}</View>
            <FormField label="Número de documento" placeholder="GE-000000" value={docNumber} onChangeText={setDocNumber} />

            <Text style={s.label}>Menores de edad incluidos</Text>
            <View style={s.chipRow}>{[0, 1, 2, 3, 4, 5].map((n) => <Chip key={String(n)} label={String(n)} active={minorCount === n} onPress={() => { setMinorCount(n); setError(null); }} />)}</View>
            {minorCount > 0 && (
              <>
                <FormField label="Nombre del tutor *" placeholder="Ej: María Nguema" value={guardianName} onChangeText={setGuardianName} />
                <FormField label="Teléfono del tutor *" placeholder="+240…" value={guardianPhone} onChangeText={setGuardianPhone} keyboardType="phone-pad" />
              </>
            )}

            <Text style={s.label}>Necesidades especiales</Text>
            <View style={s.chipRow}>{NEEDS.map(([v, l]) => <Chip key={v} label={l} active={specialNeeds === v} onPress={() => setSpecialNeeds(v)} />)}</View>

            <Text style={s.label}>RECOGIDA — puerta a puerta recomendada</Text>
            <View style={s.chipRow}>
              <Chip label="🏠 Recogida a casa" active={pickupType === 'home'} onPress={() => setPickupType('home')} />
              <Chip label="🚏 En agencia" active={pickupType === 'agency'} onPress={() => { setPickupType('agency'); setError(null); }} />
            </View>
            {pickupType === 'home' ? (
              <FormField label="Dirección de recogida" placeholder="Barrio, calle, nº…" value={pickupAddress} onChangeText={setPickupAddress} />
            ) : (
              <View style={[s.warnBox, { backgroundColor: alpha(colors.danger, 0.08) }]}>
                <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: '700', lineHeight: 17 }}>
                  ⚠️ La agencia cobra un importe por recibirte allí. La recogida a casa no tiene coste extra.
                </Text>
              </View>
            )}

            <Text style={s.label}>PAGO</Text>
            <View style={s.chipRow}>
              <Chip label="💵 Al abordar" active={payOn === 'boarding'} onPress={() => setPayOn('boarding')} />
              <Chip label="🏁 Al llegar al destino" active={payOn === 'destination'} onPress={() => setPayOn('destination')} />
            </View>
            {isCommission && payOn === 'boarding' && (
              <Text style={{ color: colors.secondary, fontSize: tipografia.caption, fontWeight: '700' }}>
                ⚠️ Compra por encargo: si el viajero no eres tú, lo normal es que pague al llegar al destino.
              </Text>
            )}

            {!rental && (
              <>
                <Text style={s.label}>¿Quieres proponer una tarifa? (opcional)</Text>
                <FormField label="Tarifa por asiento (XAF)" placeholder={String(trip.price)} value={passengerFare} onChangeText={setPassengerFare} keyboardType="numeric" />
                {passengerFare.trim() && <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '600' }}>El conductor revisará tu propuesta antes de confirmar.</Text>}
              </>
            )}

            {error && <Text style={s.err}>{error}</Text>}
            <PrimaryButton title="Continuar" onPress={() => go('confirm')} />
          </View>
        )}

        {step === 'confirm' && trip && (
          <View style={s.block}>
            <Text style={s.big}>Confirmar reserva</Text>
            <View style={[s.summary, { borderColor: colors.border }]}>
              <Row label="Ruta" value={`${trip.route?.originDistrict ?? ''} → ${trip.route?.destinationDistrict ?? ''}`} />
              <Row label="Salida" value={new Date(trip.departureTime).toLocaleString('es')} />
              <Row label="Tipo" value={rental ? `🚐 Vehículo completo (${trip.totalSeats} plazas)` : `${seats} asiento(s)`} />
              <Row label="Precio" value={rental ? `${Number(trip.rentalPrice).toLocaleString('es')} XAF (total)` : `${unitPrice.toLocaleString('es')} XAF/asiento`} />
              <Row label="Total" value={`${total.toLocaleString('es')} XAF`} bold />
              <Row label="Recogida" value={pickupType === 'home' ? `A casa · ${pickupAddress}` : 'En agencia'} />
              {minorCount > 0 && <Row label="Menores" value={`${minorCount} · tutor ${guardianName.trim() || '—'}`} />}
              {!rental && passengerFare.trim() && <Row label="Tarifa propuesta" value="Pendiente de aceptación" />}
            </View>
            {!rental && passengerFare.trim() && (
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '600', textAlign: 'center' }}>
                Si el conductor acepta tu tarifa, el total será {total.toLocaleString('es')} XAF. Si la rechaza, se liberan tus asientos.
              </Text>
            )}
            {error && <Text style={s.err}>{error}</Text>}
            <PrimaryButton title="Confirmar reserva" onPress={() => void confirm()} loading={busyRef.current} disabled={busyRef.current} />
            <GhostButton title="Volver" onPress={() => go('passenger')} />
          </View>
        )}

        {step === 'ticket' && booking && (
          <View style={[s.block, { alignItems: 'center' }]}>
            <CheckCircle2 size={52} color={colors.success} />
            <Text style={s.big}>{booking.fareStatus === 'proposed' ? 'Tarifa enviada al conductor' : '¡Reserva confirmada!'}</Text>
            <Text style={s.body}>{booking.message}</Text>
            <View style={[s.ticketBox, { borderColor: colors.primary }]}>
              <Ticket size={26} color={colors.primary} />
              <Text style={{ color: colors.textPrimary, fontSize: 26, fontWeight: '900', letterSpacing: 2 }}>{booking.booking?.shortCode ?? booking.ticketQrCode}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '600' }}>{booking.ticketQrCode} · muestra este código al conductor</Text>
            </View>
            {phone.trim() && (
              <Pressable
                onPress={() => {
                  const msg = `🧾 Ticket EG Route Plan\nCódigo: ${booking.booking?.shortCode ?? booking.ticketQrCode} (${booking.ticketQrCode})\n${trip?.route?.originDistrict ?? ''} → ${trip?.route?.destinationDistrict ?? ''}\n${trip ? new Date(trip.departureTime).toLocaleString('es') : ''}\n${rental ? 'Vehículo completo' : `${totalSeatsUsed} asiento(s)`}`;
                  Linking.openURL(`https://wa.me/${digits(phone)}?text=${encodeURIComponent(msg)}`).catch(() => {});
                }}
                accessibilityRole="button" accessibilityLabel="Enviar ticket por WhatsApp"
                style={({ pressed }) => [{ backgroundColor: brand.whatsapp, borderRadius: radios.md, paddingVertical: espaciado.e12, paddingHorizontal: espaciado.e20, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={{ color: brand.white, fontWeight: '800', fontSize: tipografia.body, textAlign: 'center' }}>Enviar por WhatsApp</Text>
              </Pressable>
            )}
            {booking.booking?.payOn === 'destination' && (
              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: tipografia.body }}>💵 Pago: al llegar al destino</Text>
            )}
            {booking.booking?.buyerPhone && phone.trim() && booking.booking.buyerPhone !== gqPhone(phone) && (
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '600', textAlign: 'center' }}>
                🎫 Comprado por {booking.booking.buyerName || booking.booking.buyerPhone} para {firstName.trim()} {lastName.trim()}
              </Text>
            )}
            {booking.fareStatus === 'proposed' && (
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '600', textAlign: 'center' }}>
                Tus asientos quedan reservados hasta que el conductor acepte o rechace tu tarifa.
              </Text>
            )}
            <PrimaryButton title="Listo" onPress={() => router.replace('/')} />
            <GhostButton title="Ver mis tickets" onPress={() => router.push('/my-tickets' as never)} />
          </View>
        )}
      </ScrollView>
      ) : (
        /*
          LISTA VIRTUALIZADA (auditoría de diseño, D-04/D-21): antes era un .map() y todos los
          viajes quedaban montados. Aquí el paso de resultados ES la lista; los pasos de
          formulario siguen en el ScrollView, porque anidar listas virtualizadas la desactiva.
        */
        <FlatList
          data={trips}
          keyExtractor={(t) => t.id}
          contentContainerStyle={[s.content, { gap: espaciado.e12, paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={10}
          windowSize={7}
          removeClippedSubviews
          ListHeaderComponent={
            /*
            Un `View` con el hueco del contenedor, y no un fragmento: el `gap` de
            `contentContainerStyle` separa CELDAS, y `ListHeaderComponent` es UNA celda. Con un
            fragmento, todo lo de aquí dentro quedaba pegado (era gap: espaciado.e12 antes de virtualizar).
            */
            <View style={s.block}>
              <Text style={s.big}>{trip?.route ? `${trip.route.originDistrict ?? ''} → ${trip.route.destinationDistrict ?? ''}` : 'Viajes disponibles'}</Text>
              <Text style={s.body}>Salida por hora local. Paga en efectivo al abordar (o al llegar).</Text>
            </View>
          }
          ListEmptyComponent={
            <Text style={{ color: colors.textSecondary, fontWeight: '700', textAlign: 'center' }}>No hay viajes publicados para esta ruta todavía.</Text>
          }
          renderItem={({ item: t }) => (
            <Pressable key={t.id} onPress={() => pickTrip(t)} accessibilityRole="button"
              accessibilityLabel={`Viaje ${new Date(t.departureTime).toLocaleString('es')}, ${t.availableSeats} asientos libres`}
              style={({ pressed }) => [s.tripCard, { borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}>
              {t.photos && t.photos.length > 0 ? (
                <LazyImage source={{ uri: absUrl(t.photos[0]) }} style={s.avatar} />
              ) : t.publisherPhoto ? (
                <LazyImage source={{ uri: absUrl(t.publisherPhoto) }} style={s.avatar} />
              ) : (
                <View style={[s.avatar, { backgroundColor: alpha(colors.primary, 0.15) }]}><RouteIcon size={20} color={colors.primary} /></View>
              )}
              <View style={{ flex: 1, gap: espaciado.e3 }}>
                <Text style={{ color: colors.textPrimary, fontWeight: '900', fontSize: 15 }}>
                  {new Date(t.departureTime).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  <Text style={{ color: colors.textSecondary, fontWeight: '600', fontSize: tipografia.caption }}>
                    {'  '}{new Date(t.departureTime).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
                  </Text>
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '600' }}>
                  {IC_VEHICLE_LABELS[t.vehicleType ?? 'car'] ?? t.vehicleType}{t.vehicleModel ? ` · ${t.vehicleModel}` : ''}{t.vehiclePlate ? ` · ${t.vehiclePlate}` : ''} · {t.publisherName ?? 'Conductor'}
                </Text>
                {t.publisherBadge ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: alpha(colors.primary, 0.12), paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3, borderRadius: radios.sm, marginTop: espaciado.e4 }}>
                    <BadgeCheck size={12} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 10, fontWeight: '800', marginLeft: espaciado.e4 }}>{t.publisherBadge}</Text>
                  </View>
                ) : null}
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: '600' }}>
                  {t.availableSeats} asientos libres · {Number(t.price).toLocaleString('es')} XAF
                </Text>
                {t.rentalPrice != null && (
                  <Text style={{ color: colors.primary, fontWeight: '800', fontSize: tipografia.caption }}>🚐 Alquiler completo: {Number(t.rentalPrice).toLocaleString('es')} XAF</Text>
                )}
              </View>
              <ChevronRight size={20} color={colors.primary} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: espaciado.e4, gap: espaciado.e12 }}>
      <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, fontWeight: bold ? '900' : '700', flexShrink: 1, textAlign: 'right' }}>{value}</Text>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={({ pressed }) => [styles(colors).chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? alpha(colors.primary, 0.08) : colors.card, opacity: pressed ? 0.85 : 1 }]}
    >
      <Text style={{ color: active ? colors.primary : colors.textPrimary, fontWeight: '700', fontSize: tipografia.caption }}>{label}</Text>
    </Pressable>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e16, paddingTop: espaciado.e12, paddingBottom: espaciado.e6 },
  title: { fontSize: 18, fontWeight: '800', color: c.textPrimary },
  content: { padding: espaciado.e20, gap: espaciado.e16 },
  block: { gap: espaciado.e12 },
  big: { fontSize: tipografia.title, fontWeight: '900', color: c.textPrimary, textAlign: 'center' },
  body: { fontSize: tipografia.body, lineHeight: 20, color: c.textSecondary, textAlign: 'center', fontWeight: '600' },
  label: { fontSize: tipografia.caption, fontWeight: '800', color: c.textSecondary, marginTop: espaciado.e4 },
  labelInline: { fontSize: tipografia.caption, fontWeight: '800', color: c.textSecondary, marginTop: espaciado.e4, alignSelf: 'center' },
  zone: { fontSize: tipografia.caption, fontWeight: '700', color: c.primary },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 },
  chip: { borderRadius: radios.md, borderWidth: 1.5, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8 },
  tripCard: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, borderWidth: 1.5, borderRadius: 14, padding: espaciado.e14 },
  avatar: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: c.surface },
  warnBox: { borderRadius: radios.md, padding: espaciado.e12 },
  summary: { borderRadius: radios.lg, borderWidth: 1.5, padding: espaciado.e14 },
  ticketBox: { alignItems: 'center', gap: espaciado.e8, borderWidth: 2, borderRadius: 18, padding: espaciado.e22, width: '100%', borderStyle: 'dashed' },
  err: { color: c.danger, fontSize: tipografia.body, fontWeight: '700' },
});
