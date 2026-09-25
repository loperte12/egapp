/**
 * IntercityPublishScreen — Ciudad a Ciudad (conductor) v2.
 * Auditoría aplicada:
 *  · Gate de perfil de conductor (driverApi.status → aprobado) con mensaje y CTA.
 *  · Límite del plan PROACTIVO (monthlyUsed >= monthlyTrips → botón deshabilitado).
 *  · resetForm tras publicar; duplicate limpia fotos/editId; openEdit resetea editF.
 *  · saveEdit valida hora HH:MM y precios; cobro usa b.totalPrice (tarifa real).
 *  · Fotos por GALERÍA con compresión (quality 0.35) + límite ~700 KB/foto (máx 4);
 *    el backend sigue guardando base64 (multipart real queda anotado como futuro).
 *  · Errores limpiados en transiciones; busyRef anti doble-tap; polling pausado en form.
 *  · SafeArea, Chip con a11y, keyboardShouldPersistTaps, aviso de días fuera del
 *    horizonte de 14 días.
 * Ruta: /intercity-publish
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, SectionList, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { ArrowLeft, Truck, Plus, RefreshCw, ImageIcon, Siren, Crown, X } from 'lucide-react-native';
import { alpha, brand, EmptyState, espaciado, FormField, GhostButton, PrimaryButton, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import EmergencyModal from '../components/EmergencyModal';
import { useSession } from '../state/session';
import { driverApi } from '../api/driver';
import { intercityApi, type IcLocation, type IcTrip, type IcPlan, IC_VEHICLE_TYPES, IC_VEHICLE_LABELS } from '../api/intercity';

type Mode = 'list' | 'form';

const DAY_ORDER = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] as const;
const DAY_INDEX: Record<string, number> = { L: 1, M: 2, X: 3, J: 4, V: 5, S: 6, D: 0 };
const DAY_A11Y: Record<string, string> = { L: 'Lunes', M: 'Martes', X: 'Miércoles', J: 'Jueves', V: 'Viernes', S: 'Sábado', D: 'Domingo' };
const HORIZON_DAYS = 14;
const MAX_PHOTOS = 4;
const MAX_PHOTO_B64_KB = 700;
const TRIP_STATUS_LABELS: Record<string, string> = {
  scheduled: 'Programado', in_transit: 'En ruta', completed: 'Completado', cancelled: 'Cancelado',
};

const ymd = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const nextDayDates = (labels: string[]): string[] => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const out: string[] = [];
  for (const l of labels) {
    const d = new Date(today);
    let offset = (DAY_INDEX[l] - d.getDay() + 7) % 7;
    if (offset === 0) offset = 7;
    d.setDate(d.getDate() + offset);
    if (d.getTime() - today.getTime() <= HORIZON_DAYS * 86400000) out.push(ymd(d));
  }
  return out.sort();
};
const droppedDayLabels = (labels: string[], found: number): string[] => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dropped: string[] = [];
  for (const l of labels) {
    const d = new Date(today);
    let offset = (DAY_INDEX[l] - d.getDay() + 7) % 7;
    if (offset === 0) offset = 7;
    d.setDate(d.getDate() + offset);
    if (d.getTime() - today.getTime() > HORIZON_DAYS * 86400000) dropped.push(DAY_A11Y[l]);
  }
  return dropped;
};
const b64SizeKB = (s: string | null | undefined) => {
  const b = String(s ?? '').split(',')[1] || s || '';
  return Math.round((b.length * 3) / 4 / 1024);
};

const emptyForm = {
  oProv: '', oDist: '', dProv: '', dDist: '', date: '', time: '', seats: 4, price: '',
  rentalPrice: '', vehicleType: 'car', plate: '', model: '', carPhotos: [] as string[], days: [] as string[],
};

export default function IntercityPublishScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isAuthenticated } = useSession();
  const busyRef = useRef(false);

  const [mode, setMode] = useState<Mode>('list');
  const [locs, setLocs] = useState<IcLocation[]>([]);
  const [trips, setTrips] = useState<IcTrip[]>([]);
  const [plan, setPlan] = useState<IcPlan | null>(null);
  const [driverOk, setDriverOk] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emergencyOpen, setEmergencyOpen] = useState(false);

  // Formulario
  const [f, setF] = useState({ ...emptyForm });
  const [editId, setEditId] = useState<string | null>(null);
  const [editF, setEditF] = useState({ price: '', seats: '', rentalPrice: '', vehiclePlate: '', vehicleModel: '', time: '' });

  const load = useCallback(async () => {
    if (!isAuthenticated) { setDriverOk(false); return; }
    if (busyRef.current) return;
    setBusy(true); setError(null);
    try {
      const [l, mt] = await Promise.all([intercityApi.locations(), intercityApi.myTrips()]);
      setLocs(l);
      setTrips(mt);
      intercityApi.myPlan().then(setPlan).catch(() => {});
      const st = await driverApi.status();
      const d = st.driver;
      const ok = !!d && (st.status === 'approved' || d.status === 'approved' || d.status === 'active');
      setDriverOk(ok);
      if (ok) {
        setF((prev) => ({
          ...prev,
          plate: prev.plate || d.vehicle_plate || '',
          model: prev.model || d.vehicle_model || '',
          vehicleType: d.vehicle_type && (IC_VEHICLE_TYPES as readonly string[]).includes(d.vehicle_type) ? d.vehicle_type : prev.vehicleType,
        }));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red');
    } finally {
      setBusy(false);
    }
  }, [isAuthenticated]);

  useEffect(() => { void load(); }, [load]);

  // Polling pausado en form (evita pisar la edición) y con mounted guard.
  const mountedRef = useRef(true);
  useEffect(() => () => { mountedRef.current = false; }, []);
  useEffect(() => {
    if (!isAuthenticated) return;
    const iv = setInterval(() => {
      if (mode !== 'list' || !mountedRef.current) return;
      intercityApi.myTrips().then((t) => mountedRef.current && setTrips(t)).catch(() => {});
    }, 15000);
    return () => clearInterval(iv);
  }, [isAuthenticated, mode]);

  const pendingFares = trips.reduce((n, t) => n + (t.bookings?.filter((b) => b.fareStatus === 'proposed').length ?? 0), 0);
  const atPlanLimit = plan != null && plan.monthlyTrips !== -1 && plan.monthlyUsed >= plan.monthlyTrips;

  const provinces = useMemo(() => [...new Set(locs.map((l) => l.province))], [locs]);
  const oDists = useMemo(() => locs.filter((l) => l.province === f.oProv), [locs, f.oProv]);
  const dDists = useMemo(() => locs.filter((l) => l.province === f.dProv), [locs, f.dProv]);

  const groups = useMemo(() => {
    const m = new Map<string, IcTrip[]>();
    for (const t of trips) {
      const k = `${t.route?.originDistrict ?? '?'} → ${t.route?.destinationDistrict ?? '?'}`;
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(t);
    }
    return [...m.entries()];
  }, [trips]);

  const switchMode = (m: Mode) => { setError(null); setMode(m); };

  const resetForm = () => setF({ ...emptyForm, plate: f.plate, model: f.model, vehicleType: f.vehicleType });

  const pickPhoto = async () => {
    if (f.carPhotos.length >= MAX_PHOTOS) { Alert.alert('Límite de fotos', `Máximo ${MAX_PHOTOS} fotos por viaje.`); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: 'images', quality: 0.35, base64: true });
    if (res.canceled || !res.assets?.[0]) return;
    const b64 = res.assets[0].base64 ?? null;
    if (!b64) { Alert.alert('Imagen', 'No se pudo leer la imagen. Prueba con otra.'); return; }
    const sizeKB = b64SizeKB(b64);
    if (sizeKB > MAX_PHOTO_B64_KB) {
      Alert.alert('Foto demasiado pesada', `Pesa ~${sizeKB} KB (máx. ${MAX_PHOTO_B64_KB} KB). Prueba con otra o edítala antes.`);
      return;
    }
    setF((prev) => ({ ...prev, carPhotos: [...prev.carPhotos, `data:image/jpeg;base64,${b64}`] }));
  };

  const publish = async () => {
    if (!f.oDist || !f.dDist) { setError('Elige origen y destino'); return; }
    if (f.oProv === f.dProv && f.oDist === f.dDist) { setError('Origen y destino deben ser distintos'); return; }
    const priceNum = Number(f.price);
    if (!(priceNum > 0)) { setError('Precio por asiento inválido'); return; }
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(f.time)) { setError('Hora en formato HH:MM (ej. 08:00)'); return; }
    if (atPlanLimit) { setError('Alcanzaste el límite de tu plan mensual. Mejora tu plan para publicar más viajes.'); return; }
    let dep: { departureDays?: string[]; departureTimeOfDay?: string; departureTime?: string } = {};
    if (f.days.length > 0) {
      const dates = nextDayDates(f.days);
      if (dates.length === 0) { setError('Las fechas quedan fuera del horizonte (14 días). Elige otros días.'); return; }
      dep = { departureDays: dates, departureTimeOfDay: f.time };
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) { setError('Fecha en formato AAAA-MM-DD (ej. 2026-09-01)'); return; }
      const dt = new Date(`${f.date}T${f.time}:00`);
      if (Number.isNaN(dt.getTime())) { setError('Fecha u hora inválidas'); return; }
      if (dt.getTime() <= Date.now()) { setError('La salida debe ser futura'); return; }
      dep = { departureTime: dt.toISOString() };
    }
    setBusy(true); setError(null);
    busyRef.current = true;
    try {
      await intercityApi.publish({
        origin: { province: f.oProv, district: f.oDist, zone: oDists.find((d) => d.district === f.oDist)?.zone ?? '' },
        destination: { province: f.dProv, district: f.dDist, zone: dDists.find((d) => d.district === f.dDist)?.zone ?? '' },
        ...dep,
        seats: f.seats, price: priceNum,
        vehiclePlate: f.plate.trim() || undefined, vehicleModel: f.model.trim() || undefined,
        vehicleType: f.vehicleType,
        rentalPrice: f.rentalPrice.trim() ? Number(f.rentalPrice.trim()) : undefined,
        photos: f.carPhotos,
      });
      resetForm();
      switchMode('list');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo publicar');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const openEdit = (t: IcTrip) => {
    setError(null);
    setEditId(t.id);
    setEditF({
      price: String(Number(t.price)),
      seats: String(t.totalSeats),
      rentalPrice: t.rentalPrice != null ? String(Number(t.rentalPrice)) : '',
      vehiclePlate: t.vehiclePlate ?? '',
      vehicleModel: t.vehicleModel ?? '',
      time: new Date(t.departureTime).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
    });
  };

  const saveEdit = async (t: IcTrip) => {
    if (busyRef.current) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(editF.time.trim())) { setError('Hora en formato HH:MM'); return; }
    if (Number(editF.price) <= 0 || Number(editF.seats) < 1) { setError('Precio y asientos deben ser positivos'); return; }
    const hasAccepted = (t.bookings ?? []).some((b) => b.fareStatus === 'accepted' || b.paymentStatus === 'paid');
    if (hasAccepted && (Number(editF.price) !== Number(t.price) || Number(editF.seats) !== t.totalSeats)) {
      setError('No puedes cambiar precio o asientos con reservas aceptadas o pagadas');
      return;
    }
    const body: Record<string, unknown> = {};
    if (Number(editF.price) !== Number(t.price)) body.price = Number(editF.price);
    if (Number(editF.seats) !== t.totalSeats) body.seats = Number(editF.seats);
    if (editF.rentalPrice.trim()) body.rentalPrice = Number(editF.rentalPrice);
    else if (t.rentalPrice != null) body.rentalPrice = null;
    if (editF.vehiclePlate.trim() !== (t.vehiclePlate ?? '')) body.vehiclePlate = editF.vehiclePlate.trim() || null;
    if (editF.vehicleModel.trim() !== (t.vehicleModel ?? '')) body.vehicleModel = editF.vehicleModel.trim() || null;
    const cur = new Date(t.departureTime).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
    if (editF.time.trim() !== cur) {
      const d = new Date(t.departureTime);
      const [hh, mm] = editF.time.trim().split(':');
      d.setHours(Number(hh), Number(mm), 0, 0);
      body.departureTime = d.toISOString();
    }
    await act(() => intercityApi.updateTrip(t.id, body));
    setEditId(null);
    setEditF({ price: '', seats: '', rentalPrice: '', vehiclePlate: '', vehicleModel: '', time: '' });
  };

  const duplicate = (t: IcTrip) => {
    setError(null);
    setEditId(null);
    setF({
      ...emptyForm,
      oProv: t.route?.originProvince ?? '', oDist: t.route?.originDistrict ?? '',
      dProv: t.route?.destinationProvince ?? '', dDist: t.route?.destinationDistrict ?? '',
      price: String(Number(t.price)), seats: t.totalSeats,
      rentalPrice: t.rentalPrice != null ? String(Number(t.rentalPrice)) : '',
      plate: t.vehiclePlate ?? '', model: t.vehicleModel ?? '',
      vehicleType: t.vehicleType ?? 'car',
      time: new Date(t.departureTime).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }),
    });
    switchMode('form');
  };

  const act = async (fn: () => Promise<unknown>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(null);
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : 'Error'); } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const confirmAction = (title: string, msg: string, destructive: boolean, fn: () => Promise<unknown>) =>
    Alert.alert(title, msg, [
      { text: 'Mantener', style: 'cancel' },
      { text: destructive ? title : 'Confirmar', style: destructive ? 'destructive' : 'default', onPress: () => void act(fn) },
    ]);

  const s = styles(colors);
  const priceColor = colors.secondary ?? brand.secondary;

  const set = <K extends keyof typeof emptyForm>(k: K, v: (typeof emptyForm)[K]) => {
    setF((prev) => ({ ...prev, [k]: v }));
    setError(null);
  };

  /*
    Banner del plan + error: comunes a los DOS modos. Antes vivían una sola vez dentro del
    ScrollView; ahora el modo «lista» tiene su propio contenedor virtualizado, así que se
    escriben una vez aquí y se usan en los dos.
  */
  const cabeceraModos = (
    <>
      {plan && (
        <Pressable
          onPress={() => router.push('/intercity-planes' as never)}
          accessibilityRole="button" accessibilityLabel="Ver planes"
          style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', backgroundColor: alpha(colors.primary, 0.08), borderRadius: radios.md, padding: espaciado.e12, marginBottom: espaciado.e14, opacity: pressed ? 0.85 : 1 }]}
        >
          <Crown size={18} color={colors.primary} />
          <View style={{ flex: 1, marginLeft: espaciado.e10 }}>
            <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.textPrimary }}>
              {`${plan.planName} · ${plan.monthlyTrips === -1 ? 'viajes ilimitados' : `${plan.monthlyUsed}/${plan.monthlyTrips} viajes este mes`}`}
            </Text>
            <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: 1 }}>
              {atPlanLimit ? 'Alcanzaste tu límite mensual: mejora tu plan para seguir publicando.' : 'Toca para ver tus planes.'}
            </Text>
          </View>
          <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.primary }}>Mejorar plan ›</Text>
        </Pressable>
      )}

      {error && <Text style={s.err}>{error}</Text>}
    </>
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      <View style={s.topBar}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={s.title}>Publicar viaje</Text>
        <View style={{ flexDirection: 'row', gap: espaciado.e14 }}>
          <Pressable onPress={() => setEmergencyOpen(true)} hitSlop={12} accessibilityRole="button" accessibilityLabel="Emergencia">
            <Siren size={20} color={colors.danger} />
          </Pressable>
          {driverOk === true && (
            <Pressable onPress={() => switchMode(mode === 'list' ? 'form' : 'list')} hitSlop={12} accessibilityRole="button"
              accessibilityLabel={mode === 'list' ? 'Publicar viaje' : 'Ver mis viajes'}>
              {mode === 'list' ? <Plus size={22} color={colors.primary} /> : <RefreshCw size={22} color={colors.primary} />}
            </Pressable>
          )}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={8}>
      {!isAuthenticated || driverOk === false ? (
        /*
          Los dos avisos de entrada van PRIMERO, como antes de virtualizar: sin cuenta o sin alta
          de conductor no hay ni lista ni formulario que enseñar.
        */
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {!isAuthenticated ? (
            <View style={s.block}>
              <Text style={s.big}>Necesitas una cuenta de conductor</Text>
              <Text style={s.body}>Inicia sesión con tu cuenta de conductor verificado para publicar viajes de ciudad a ciudad.</Text>
              <PrimaryButton title="Iniciar sesión" onPress={() => router.push('/auth' as never)} />
            </View>
          ) : (
            <View style={s.block}>
              <Text style={s.big}>No tienes perfil de conductor aprobado</Text>
              <Text style={s.body}>Completa tu alta como conductor (documentos + aprobación) antes de publicar viajes interurbanos.</Text>
              <PrimaryButton title="Alta de conductor" onPress={() => router.push('/driver-onboarding' as never)} />
            </View>
          )}
        </ScrollView>
      ) : mode === 'list' ? (
        /*
          LISTA VIRTUALIZADA (auditoría de diseño, D-04/D-21): la séptima y más delicada de las
          siete. El viaje es la FILA y la reserva es CONTENIDO de la fila (una reserva no se puede
          tocar sin tocar su viaje: aceptar tarifa, cobrar, cancelar); la ruta es la SECCIÓN.
          El modo «formulario» sigue en su ScrollView: anidar listas virtualizadas la desactiva.
        */
        <SectionList
          sections={groups.map(([titulo, data]) => ({ titulo, data })).filter((s) => s.data.length > 0)}
          keyExtractor={(t) => t.id}
          contentContainerStyle={[s.content, { gap: espaciado.e12, paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          stickySectionHeadersEnabled={false}
          initialNumToRender={8}
          windowSize={7}
          removeClippedSubviews
          renderSectionHeader={({ section }) => (
            <Text style={{ color: colors.primary, fontWeight: peso.titulo, fontSize: tipografia.body }}>
              {section.titulo} · {section.data.length} viaje{section.data.length === 1 ? '' : 's'}
            </Text>
          )}
          renderItem={({ item: t }) => (
            <View key={t.id} style={[s.card, { borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textPrimary, fontWeight: peso.titulo, fontSize: 15 }}>
                    {new Date(t.departureTime).toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })} · {new Date(t.departureTime).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontWeight: peso.fuerte, fontSize: tipografia.caption }}>
                    {t.availableSeats}/{t.totalSeats} asientos · {TRIP_STATUS_LABELS[t.status] ?? t.status}
                  </Text>
                </View>
                <Text style={{ color: priceColor, fontWeight: peso.titulo, fontSize: tipografia.subtitle }}>{Number(t.price).toLocaleString('es')} XAF</Text>
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.medio }}>
                {IC_VEHICLE_LABELS[t.vehicleType ?? 'car']} {t.vehicleModel ?? ''}{t.vehiclePlate ? ` · ${t.vehiclePlate}` : ''}{t.rentalPrice != null ? ` · alquiler ${Number(t.rentalPrice).toLocaleString('es')} XAF` : ''}
              </Text>
              {(t.bookings ?? []).map((b) => (
                <View key={b.id} style={[s.bookingRow, { backgroundColor: alpha(colors.border, 0.25) }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body }}>
                      {b.passenger?.firstName} {b.passenger?.lastName} · {b.seatCount} asiento(s)
                    </Text>
                    <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.medio }}>
                      {b.payOn === 'destination' ? '🎫 Por encargo · el viajero paga al final del viaje' : b.fareStatus === 'proposed' ? '💬 tarifa propuesta' : b.paymentStatus === 'paid' ? '✅ pagado' : '💵 pendiente de pago'}
                    </Text>
                    {b.payOn === 'destination' && b.buyerName && (
                      <Text style={{ color: colors.textSecondary, fontSize: tipografia.micro, fontWeight: peso.medio }}>
                        Comprado por {b.buyerName} · viajero: {b.passenger?.firstName} {b.passenger?.lastName}
                      </Text>
                    )}
                  </View>
                  {b.fareStatus === 'proposed' && (
                    <View style={{ flexDirection: 'row', gap: espaciado.e6 }}>
                      <Pressable onPress={() => void act(() => intercityApi.decideFare(b.id, 'accept'))} accessibilityRole="button" accessibilityLabel="Aceptar tarifa"
                        style={[s.miniBtn, { backgroundColor: colors.success }]}>
                        <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.caption }}>Aceptar</Text>
                      </Pressable>
                      <Pressable onPress={() => void act(() => intercityApi.decideFare(b.id, 'decline'))} accessibilityRole="button" accessibilityLabel="Rechazar tarifa"
                        style={[s.miniBtn, { backgroundColor: colors.danger }]}>
                        <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.caption }}>Rechazar</Text>
                      </Pressable>
                    </View>
                  )}
                  {b.fareStatus === 'accepted' && b.paymentStatus !== 'paid' && (
                    <Pressable
                      onPress={() => Alert.alert('Confirmar cobro',
                        `${b.passenger?.firstName ?? 'Viajero'} · ${b.seatCount} asiento(s) · ${Number(b.totalPrice ?? b.seatCount * Number(t.price)).toLocaleString('es')} XAF. ¿Confirmas que pagó?`, [
                          { text: 'Aún no', style: 'cancel' },
                          { text: 'Sí, pagó', style: 'default', onPress: () => void act(() => intercityApi.markPaid(b.id)) },
                        ])}
                      accessibilityRole="button" accessibilityLabel="Confirmar cobro"
                      style={[s.miniBtn, { backgroundColor: colors.primary }]}>
                      <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.caption }}>{b.payOn === 'destination' ? 'Cobrar (final)' : 'Cobrar'}</Text>
                    </Pressable>
                  )}
                </View>
              ))}
              {editId === t.id && (
                <View style={{ gap: espaciado.e8, marginTop: espaciado.e4 }}>
                  <FormField label="Precio por asiento (XAF)" value={editF.price} onChangeText={(v) => setEditF((p) => ({ ...p, price: v }))} keyboardType="numeric" />
                  <FormField label="Asientos totales" value={editF.seats} onChangeText={(v) => setEditF((p) => ({ ...p, seats: v }))} keyboardType="numeric" />
                  <FormField label="Alquiler vehículo (XAF; vacío = quitar)" value={editF.rentalPrice} onChangeText={(v) => setEditF((p) => ({ ...p, rentalPrice: v }))} keyboardType="numeric" />
                  <FormField label="Hora (HH:MM)" value={editF.time} onChangeText={(v) => setEditF((p) => ({ ...p, time: v }))} />
                  <FormField label="Matrícula" value={editF.vehiclePlate} onChangeText={(v) => setEditF((p) => ({ ...p, vehiclePlate: v }))} />
                  <FormField label="Modelo" value={editF.vehicleModel} onChangeText={(v) => setEditF((p) => ({ ...p, vehicleModel: v }))} />
                  <PrimaryButton title="Guardar cambios" onPress={() => void saveEdit(t)} loading={busy} />
                  <GhostButton title="Cancelar" onPress={() => { setEditId(null); setError(null); }} />
                </View>
              )}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8, marginTop: espaciado.e6 }}>
                {t.status === 'scheduled' && (
                  <>
                    <GhostButton title="En ruta" onPress={() => confirmAction('Iniciar ruta', 'Los pasajeros recibirán el aviso de salida. ¿Continuar?', false, () => intercityApi.tripStatus(t.id, 'in_transit'))} />
                    <GhostButton title="Editar" onPress={() => openEdit(t)} />
                    <GhostButton title="Duplicar" onPress={() => duplicate(t)} />
                    <GhostButton title="Cancelar" onPress={() => confirmAction('Cancelar viaje', `¿Seguro que cancelas el viaje a ${t.route?.destinationDistrict ?? 'destino'}? Las reservas se anularán.`, true, () => intercityApi.cancelTrip(t.id))} />
                  </>
                )}
                {t.status === 'in_transit' && (
                  <GhostButton title="Completar" onPress={() => confirmAction('Completar viaje', 'El viaje quedará cerrado. ¿Continuar?', false, () => intercityApi.tripStatus(t.id, 'completed'))} />
                )}
              </View>
            </View>
          )}
          ListHeaderComponent={
            /* El `View` con gap, no un fragmento: el gap del contenedor separa celdas, y la
               cabecera es UNA celda. Con un fragmento, todo lo de dentro quedaba pegado. */
            <View style={s.block}>
              {cabeceraModos}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={s.big}>Mis viajes</Text>
                <Pressable onPress={() => void load()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Actualizar mis viajes">
                  <RefreshCw size={18} color={colors.primary} />
                </Pressable>
              </View>
              {pendingFares > 0 && (
                <View style={{ backgroundColor: alpha(colors.secondary, 0.12), borderRadius: radios.md, padding: espaciado.e10 }}>
                  <Text style={{ color: colors.secondary, fontWeight: peso.titulo, fontSize: tipografia.body }}>🔔 {pendingFares} tarifa(s) propuesta(s) pendiente(s) de tu respuesta</Text>
                </View>
              )}
            </View>
          }
          ListEmptyComponent={
            /*
              Vacío con salida (D-17). El aviso viejo mandaba «pulsa + para crear uno», pero el botón
              + solo se dibuja con perfil de conductor aprobado: el vacío no puede mandar a pulsar
              algo que puede no estar ahí. Mejor decir qué lo llena.
            */
            <EmptyState
              compacto
              icono={<Text style={{ fontSize: tipografia.subtitle }}>🚐</Text>}
              titulo="Aún no has publicado viajes"
              texto="Cuando publiques uno aparecerá aquí, con sus asientos libres, su estado y las reservas que reciba."
            />
          }
        />
      ) : (
        <ScrollView contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 24 }]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {cabeceraModos}

              {mode === 'form' && (
                <View style={s.block}>
                  <Truck size={36} color={colors.primary} />
                  <Text style={s.big}>Publicar viaje</Text>
                  <Text style={s.body}>Provincia → distrito → zona jurídica. Precio por asiento lo pones tú.</Text>

                  <Text style={s.label}>ORIGEN</Text>
                  <View style={s.chipRow}>{provinces.map((p) => <Chip key={p} label={p} active={p === f.oProv} onPress={() => { setF((pr) => ({ ...pr, oProv: p, oDist: '' })); setError(null); }} />)}</View>
                  {f.oProv !== '' && <View style={s.chipRow}>{oDists.map((d) => <Chip key={d.district} label={d.district} active={d.district === f.oDist} onPress={() => { setF((pr) => ({ ...pr, oDist: d.district })); setError(null); }} />)}</View>}

                  <Text style={s.label}>DESTINO</Text>
                  <View style={s.chipRow}>{provinces.map((p) => <Chip key={p} label={p} active={p === f.dProv} onPress={() => { setF((pr) => ({ ...pr, dProv: p, dDist: '' })); setError(null); }} />)}</View>
                  {f.dProv !== '' && <View style={s.chipRow}>{dDists.map((d) => <Chip key={d.district} label={d.district} active={d.district === f.dDist} onPress={() => { setF((pr) => ({ ...pr, dDist: d.district })); setError(null); }} />)}</View>}

                  <Text style={s.label}>Días de la semana (opcional — publica cada día elegido)</Text>
                  <View style={s.chipRow}>
                    {DAY_ORDER.map((l) => <Chip key={l} label={l} active={f.days.includes(l)} a11y={DAY_A11Y[l]} onPress={() => set('days', f.days.includes(l) ? f.days.filter((x) => x !== l) : [...f.days, l])} />)}
                  </View>
                  <FormField label="Hora de salida (HH:MM)" placeholder="08:00" value={f.time} onChangeText={(v) => set('time', v)} />
                  {f.days.length === 0 && <FormField label="Fecha de salida (AAAA-MM-DD)" placeholder="2026-09-01" value={f.date} onChangeText={(v) => set('date', v)} />}
                  {f.days.length > 0 && (
                    <>
                      <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, fontWeight: peso.medio }}>
                        Se publicará en: {nextDayDates(f.days).join(' · ') || '—'} a las {f.time || '—'}.
                      </Text>
                      {droppedDayLabels(f.days, nextDayDates(f.days).length).length > 0 && (
                        <Text style={{ color: colors.danger, fontSize: tipografia.caption, fontWeight: peso.fuerte }}>
                          ⚠️ Fuera del horizonte (14 días): {droppedDayLabels(f.days, 0).join(', ')}
                        </Text>
                      )}
                    </>
                  )}

                  <Text style={s.label}>Asientos</Text>
                  <View style={s.chipRow}>{[2, 3, 4, 6, 8, 10, 12, 18].map((n) => <Chip key={String(n)} label={String(n)} active={n === f.seats} onPress={() => set('seats', n)} />)}</View>

                  <FormField label="Precio por asiento (XAF)" placeholder="5000" value={f.price} onChangeText={(v) => set('price', v)} keyboardType="numeric" />
                  <Text style={s.label}>Tipo de vehículo</Text>
                  <View style={s.chipRow}>{IC_VEHICLE_TYPES.map((t) => <Chip key={t} label={IC_VEHICLE_LABELS[t]} active={f.vehicleType === t} onPress={() => set('vehicleType', t)} />)}</View>
                  <FormField label="Alquiler del vehículo completo (XAF, opcional)" placeholder="25000" value={f.rentalPrice} onChangeText={(v) => set('rentalPrice', v)} keyboardType="numeric" />
                  <FormField label="Matrícula del vehículo" placeholder="GQ-000-00" value={f.plate} onChangeText={(v) => set('plate', v)} />
                  <FormField label="Modelo del vehículo" placeholder="Toyota Hiace" value={f.model} onChangeText={(v) => set('model', v)} />

                  <Text style={s.label}>Fotos del vehículo (opcional, máx. {MAX_PHOTOS})</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e10 }}>
                    {f.carPhotos.map((p, i) => (
                      <View key={i} style={{ position: 'relative' }}>
                        <Image source={{ uri: p }} style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: colors.border }} />
                        <Pressable onPress={() => setF((pr) => ({ ...pr, carPhotos: pr.carPhotos.filter((_, j) => j !== i) }))}
                          accessibilityRole="button" accessibilityLabel="Quitar foto"
                          style={{ position: 'absolute', top: -6, right: -6, backgroundColor: colors.danger, borderRadius: 10, width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
                          <X size={11} color={brand.white} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                  {f.carPhotos.length < MAX_PHOTOS && (
                    <Pressable onPress={() => void pickPhoto()} accessibilityRole="button" accessibilityLabel="Añadir foto del coche"
                      style={[s.photoAdd, { borderColor: colors.border }]}>
                      <ImageIcon size={18} color={colors.primary} />
                      <Text style={{ color: colors.primary, fontWeight: peso.maximo, fontSize: tipografia.body }}>Añadir foto del coche ({f.carPhotos.length}/{MAX_PHOTOS})</Text>
                    </Pressable>
                  )}
                  <Text style={{ fontSize: 10.5, color: colors.textSecondary }}>Se comprimen al elegirlas. Máx. ~{MAX_PHOTO_B64_KB} KB por foto.</Text>

                  {error && <Text style={s.err}>{error}</Text>}
                  {Number(f.price) > 0 && (
                    <View style={{ backgroundColor: alpha(colors.primary, 0.08), borderRadius: radios.md, padding: espaciado.e12 }}>
                      <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body }}>
                        {f.oDist && f.dDist ? `${f.oDist} → ${f.dDist}` : 'Tu ruta'} · {f.seats} asientos × {Number(f.price).toLocaleString('es')} XAF
                      </Text>
                      <Text style={{ color: priceColor, fontWeight: peso.titulo, fontSize: 17, marginTop: espaciado.e2 }}>
                        = {(f.seats * Number(f.price)).toLocaleString('es')} XAF por viaje
                        {f.days.length > 0 ? ` · × ${f.days.length} día${f.days.length === 1 ? '' : 's'}/semana` : ''}
                      </Text>
                    </View>
                  )}
                  {atPlanLimit ? (
                    <PrimaryButton title="Límite de plan alcanzado" disabled onPress={() => {}} />
                  ) : (
                    <PrimaryButton title={busy ? 'Publicando…' : 'Publicar viaje'} onPress={() => void publish()} loading={busy} />
                  )}
                  <GhostButton title="Ver mis viajes" onPress={() => switchMode('list')} />
                </View>
              )}
        </ScrollView>
      )}
      </KeyboardAvoidingView>

      <EmergencyModal visible={emergencyOpen} onClose={() => setEmergencyOpen(false)} />
    </View>
  );
}

function Chip({ label, active, onPress, a11y }: { label: string; active: boolean; onPress: () => void; a11y?: string }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: active }} accessibilityLabel={a11y ?? label}
      style={({ pressed }) => [styles(colors).chip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? alpha(colors.primary, 0.08) : colors.card, opacity: pressed ? 0.85 : 1 }]}>
      <Text style={{ color: active ? colors.primary : colors.textPrimary, fontWeight: peso.fuerte, fontSize: tipografia.caption }}>{label}</Text>
    </Pressable>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: espaciado.e16, paddingTop: espaciado.e12, paddingBottom: espaciado.e6 },
    title: { fontSize: 18, fontWeight: peso.maximo, color: c.textPrimary },
    content: { padding: espaciado.e20, gap: espaciado.e16 },
    block: { gap: espaciado.e12 },
    big: { fontSize: tipografia.title, fontWeight: peso.titulo, color: c.textPrimary, textAlign: 'center' },
    body: { fontSize: tipografia.body, lineHeight: 20, color: c.textSecondary, textAlign: 'center', fontWeight: peso.medio },
    label: { fontSize: tipografia.caption, fontWeight: peso.maximo, color: c.textSecondary, marginTop: espaciado.e4 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: espaciado.e8 },
    chip: { borderRadius: radios.md, borderWidth: trazo.base, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e8 },
    card: { borderWidth: trazo.base, borderRadius: 14, padding: espaciado.e12, gap: espaciado.e6 },
    bookingRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, borderRadius: 10, padding: espaciado.e8 },
    miniBtn: { borderRadius: radios.sm, paddingHorizontal: espaciado.e12, paddingVertical: espaciado.e9 },
    photoAdd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e8, borderWidth: trazo.base, borderStyle: 'dashed', borderRadius: radios.md, paddingVertical: espaciado.e12 },
    err: { color: c.danger, fontSize: tipografia.body, fontWeight: peso.fuerte },
  });
