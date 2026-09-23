/**
 * ReservaAnticipadaScreen — Reserva anticipada de vehículo (hasta +3 días).
 * FASE 3 rediseño DiDi (2026-09-04): flujo POR PASOS, una sola cosa por
 * pantalla (queja del dueño: la versión anterior saturaba origen+destino+
 * calendario de mes entero+precio+vehículo en un único scroll, con partes no
 * visibles). Ahora:
 *   Paso 1 · RUTA      (origen → destino)
 *   Paso 2 · COCHE Y HORARIO (día como chips Hoy/Mañana/+3 · hora · vehículo)
 *   Paso 3 · CONFIRMAR (resumen limpio: ruta, fecha, vehículo, precio +
 *                       presupuesto opcional y notas plegados)
 * Barra de progreso (3 puntos) arriba · CTA inferior único por paso.
 * Ruta Expo Router: /reserva
 *
 * Reglas conservadas: el día solo permite hoy..hoy+3; presupuesto opcional; Confirmar exige
 * origen+destino+día (vehículo con default eco).
 *
 * PRECIO (Fase 0 de la auditoría de diseño, D-35): esta pantalla presentaba como «precio estimado
 * por algoritmo» una cifra calculada a partir de la LONGITUD DEL TEXTO escrito en origen y
 * destino, bajo un icono «Seguro». Se retiró: un precio que no depende de la ruta no es un precio.
 * Ahora, o lo propone el usuario (presupuesto) o lo acuerda el conductor.
 */

import React, { useMemo, useState } from 'react';
import {
  FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, Bus, CalendarDays, Car, CarFront, CheckCircle2, Clock, MessageSquare,
  Navigation, ShieldCheck, ChevronLeft, ChevronRight,
} from 'lucide-react-native';
import { useTheme, brand, tipografia, radios } from '@egrouteplan/ui-kit';
import { reservaApi } from '../api/reserva';
import { useSession } from '../state/session';

// ----------------------------- utilidades fecha -----------------------------
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const fmt = (d: Date) => d.toISOString().slice(0, 10);
const weekdayShort = (d: Date) => d.toLocaleDateString('es', { weekday: 'short' });
const dayNum = (d: Date) => d.getDate();
const monthShort = (d: Date) => d.toLocaleDateString('es', { month: 'short' });

// ------------------------------ datos de catálogo ---------------------------
const VEHICLES = [
  { id: 'eco', name: 'Económico', desc: 'Cómodo y accesible', icon: CarFront },
  { id: 'confort', name: 'Confort', desc: 'Mayor espacio', icon: Car },
  { id: 'grande', name: 'Vehículo grande', desc: 'Ideal para grupos', icon: Bus },
] as const;

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = ['00', '15', '30', '45'];

/** Estimación automática: 2000 XAF base + 200 XAF/km (service_fares RESERVA_COCHE). */
/* (retirado en la Fase 0) `estimate(km)` inventaba un precio a partir de la longitud del texto. */

/** Chips de día: Hoy, Mañana, y los siguientes (máx hoy+3). */
function dayChipLabel(d: Date, today: Date): string {
  const diff = Math.round((startOfDay(d).getTime() - startOfDay(today).getTime()) / 86400000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Mañana';
  return `${weekdayShort(d)} ${dayNum(d)}`;
}

type Step = 1 | 2 | 3;
const STEPS: Step[] = [1, 2, 3];

export default function ReservaAnticipadaScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAuthenticated } = useSession();

  const [step, setStep] = useState<Step>(1);
  const [origin, setOrigin] = useState('');
  const [dest, setDest] = useState('');

  const [date, setDate] = useState<Date | null>(null);
  const [timeH, setTimeH] = useState('09');
  const [timeM, setTimeM] = useState('00');

  const [budget, setBudget] = useState('');
  const [vehicle, setVehicle] = useState<string>('eco');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [booking, setBooking] = useState<{ id: string; scheduledAt: string; price: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const today = useMemo(() => startOfDay(new Date()), []);
  const maxDay = useMemo(() => addDays(today, 3), [today]);
  const dayOptions = useMemo(
    () => [today, addDays(today, 1), addDays(today, 2), addDays(today, 3)],
    [today],
  );

  const handleOriginChange = (t: string) => setOrigin(t);
  const handleDestChange = (t: string) => setDest(t);

  /** El precio NO se calcula aquí: es el presupuesto del usuario o se acuerda con el conductor. */
  const budgetNum = budget ? Number(budget) : null;
  const price = budgetNum ?? 0;

  const routeReady = origin.trim().length > 0 && dest.trim().length > 0;
  const scheduleReady = date !== null;
  const canConfirm = routeReady && scheduleReady;

  const vehicleName = VEHICLES.find((v) => v.id === vehicle)?.name ?? 'Económico';
  const whenLabel = date
    ? `${weekdayShort(date)} · ${dayNum(date)} ${monthShort(date)} · ${timeH}:${timeM}`
    : 'Selecciona día y hora';

  const onConfirm = async () => {
    if (!canConfirm || submitting) return;
    if (!isAuthenticated) { router.push('/auth'); return; }
    setSubmitting(true);
    setError(null);
    try {
      const scheduledAt = date ? `${fmt(date)}T${timeH}:${timeM}:00` : '';
      const res = await reservaApi.reserve({
        origin: origin.trim(),
        dest: dest.trim(),
        scheduledAt,
        durationMin: 60,
        budget: budgetNum ?? undefined,
        vehicleType: vehicle,
        notes: notes.trim() || undefined,
      });
      setBooking({ id: res.id, scheduledAt, price: String(res.estimated_price ?? price) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'No se pudo crear la reserva';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // Navegación entre pasos (back contextual).
  const goBack = () => {
    if (step > 1) setStep((step - 1) as Step);
    else router.back();
  };

  const s = styles(colors);

  // ------------------------- PANTALLA CONFIRMADA ----------------------------
  if (booking) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center', padding: 24 }]}>
        <View style={[s.card, { alignItems: 'center', borderColor: colors.success, paddingVertical: 28, width: '100%' }]}>
          <CheckCircle2 size={52} color={colors.success} />
          <Text style={{ fontSize: tipografia.title, fontWeight: '800', color: colors.textPrimary, marginTop: 12 }}>Reserva confirmada</Text>
          <Text style={{ fontSize: 15, color: colors.textSecondary, marginTop: 8, textAlign: 'center' }}>{origin} → {dest}</Text>
          <Text style={{ fontSize: tipografia.body, color: colors.textSecondary, marginTop: 4 }}>{whenLabel}</Text>
          <Text style={{ fontSize: 26, fontWeight: '800', color: colors.textPrimary, marginTop: 14 }}>
            {Number(booking.price).toLocaleString('es')} XAF
          </Text>
          <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: 4 }}>Ref: {booking.id.slice(0, 8)}</Text>
          <Pressable onPress={() => router.back()} style={[s.confirmBtn, { marginTop: 20, paddingHorizontal: 48 }]}>
            <Text style={s.confirmText}>Hecho</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={[s.root, { backgroundColor: colors.background }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* BARRA SUPERIOR: back + título + seguridad */}
      <View style={s.topBar}>
        <Pressable onPress={goBack} hitSlop={12} style={s.iconBtn} accessibilityRole="button" accessibilityLabel={step > 1 ? 'Paso anterior' : 'Volver'}>
          {step > 1 ? <ChevronLeft size={22} color={colors.textPrimary} /> : <ArrowLeft size={22} color={colors.textPrimary} />}
        </Pressable>
        <View style={{ alignItems: 'center' }}>
          <Text style={s.title}>Reservar viaje</Text>
          {/* Progreso por pasos */}
          <View style={s.stepsRow}>
            {STEPS.map((n) => (
              <View key={n} style={[s.stepDot, { backgroundColor: n <= step ? colors.primary : colors.border }]} />
            ))}
          </View>
        </View>
        <View style={[s.iconBtn, { alignItems: 'flex-end' }]}>
          <ShieldCheck size={16} color={colors.success} />
          <Text style={s.securityText}>Seguro</Text>
        </View>
      </View>

      {error && (
        <View style={[s.card, { marginHorizontal: 16, borderColor: colors.danger }]}>
          <Text style={{ color: colors.danger, fontSize: tipografia.body, fontWeight: '600' }}>⚠️ {error}</Text>
        </View>
      )}

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom + 120 }} keyboardShouldPersistTaps="handled">
        {/* ============================ PASO 1 · RUTA ============================ */}
        {step === 1 && (
          <View>
            <Text style={s.stepTitle}>¿A dónde vas?</Text>
            <View style={s.card}>
              <View style={s.routeRow}>
                <View style={s.routeRail}>
                  <View style={[s.routeDot, { backgroundColor: colors.primary }]} />
                  <View style={s.routeLine} />
                  <View style={[s.routeDot, { backgroundColor: colors.secondary }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={s.fieldRow}>
                    <Navigation size={16} color={colors.primary} />
                    <TextInput
                      style={s.input}
                      placeholder="Salida (ubicación actual…)"
                      placeholderTextColor={colors.textSecondary}
                      value={origin}
                      onChangeText={handleOriginChange}
                    />
                  </View>
                  <View style={s.divider} />
                  <View style={s.fieldRow}>
                    <TextInput
                      style={s.input}
                      placeholder="Destino"
                      placeholderTextColor={colors.textSecondary}
                      value={dest}
                      onChangeText={handleDestChange}
                    />
                  </View>
                </View>
              </View>
            </View>
            <Text style={s.hint}>Reservas hasta 3 días después de hoy · Guinea Ecuatorial</Text>
          </View>
        )}

        {/* ==================== PASO 2 · COCHE Y HORARIO ==================== */}
        {step === 2 && (
          <View>
            <Text style={s.stepTitle}>Día y hora de recogida</Text>
            {/* Día como chips (Hoy / Mañana / …+3) — patrón DiDi, sin calendario masivo */}
            <View style={s.chipRow}>
              {dayOptions.map((d) => {
                const active = !!date && fmt(d) === fmt(date);
                const label = dayChipLabel(d, today);
                return (
                  <Pressable
                    key={fmt(d)}
                    onPress={() => setDate(d)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={[s.dayChip, { borderColor: active ? colors.primary : colors.border, backgroundColor: active ? alpha(colors.primary, 0.08) : colors.card }]}
                  >
                    <Text style={[s.dayChipText, { color: active ? colors.primary : colors.textPrimary }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Hora (24 h) y minutos */}
            <View style={[s.card, { marginTop: 14 }]}>
              <View style={s.sectionHeader}>
                <Clock size={16} color={colors.primary} />
                <Text style={s.sectionTitle}>Hora de recogida</Text>
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={s.miniLabel}>Hora</Text>
                  <FlatList
                    horizontal
                    data={HOURS}
                    keyExtractor={(h) => h}
                    showsHorizontalScrollIndicator={false}
                    renderItem={({ item }) => (
                      <Pressable onPress={() => setTimeH(item)} style={[s.chip, timeH === item && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                        <Text style={[s.chipText, timeH === item && { color: brand.white }]}>{item}</Text>
                      </Pressable>
                    )}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.miniLabel}>Minuto</Text>
                  <FlatList
                    horizontal
                    data={MINUTES}
                    keyExtractor={(m) => m}
                    showsHorizontalScrollIndicator={false}
                    renderItem={({ item }) => (
                      <Pressable onPress={() => setTimeM(item)} style={[s.chip, timeM === item && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
                        <Text style={[s.chipText, timeM === item && { color: brand.white }]}>{item}</Text>
                      </Pressable>
                    )}
                  />
                </View>
              </View>
              <Text style={s.pickSummary}>{whenLabel}</Text>
            </View>

            {/* Tipo de vehículo */}
            <Text style={[s.sectionTitle, { marginTop: 20, marginBottom: 10 }]}>Tipo de vehículo</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 16 }}>
              {VEHICLES.map((v) => {
                const Icon = v.icon;
                const active = vehicle === v.id;
                return (
                  <Pressable
                    key={v.id}
                    onPress={() => setVehicle(v.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    style={[s.vehicleCard, active && { borderColor: colors.primary, backgroundColor: alpha(colors.primary, 0.06) }]}
                  >
                    <Icon size={26} color={active ? colors.primary : colors.textSecondary} />
                    <Text style={[s.vehicleName, { color: colors.textPrimary }]}>{v.name}</Text>
                    <Text style={s.vehicleDesc}>{v.desc}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ======================== PASO 3 · CONFIRMAR ======================== */}
        {step === 3 && (
          <View style={{ paddingHorizontal: 16 }}>
            <Text style={s.stepTitle}>Confirma tu reserva</Text>

            {/* Resumen ruta */}
            <View style={s.card}>
              <View style={s.routeRow}>
                <View style={s.routeRail}>
                  <View style={[s.routeDot, { backgroundColor: colors.primary }]} />
                  <View style={s.routeLine} />
                  <View style={[s.routeDot, { backgroundColor: colors.secondary }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.sumLine}>{origin || 'Origen'}</Text>
                  <Text style={[s.sumLine, { marginTop: 6 }]}>{dest || 'Destino'}</Text>
                </View>
              </View>
            </View>

            {/* Resumen horario + vehículo */}
            <View style={s.card}>
              <Row icon={<CalendarDays size={15} color={colors.textSecondary} />} text={whenLabel} />
              <Row icon={<Car size={15} color={colors.textSecondary} />} text={vehicleName} />
            </View>

            {/* Precio: el del usuario o «a convenir». NO se inventa. */}
            <View style={s.card}>
              <Text style={s.label}>{price > 0 ? 'Tu presupuesto' : 'Precio'}</Text>
              <Text style={s.priceBig} accessibilityLabel={price > 0 ? `${price} francos CFA` : 'A convenir con el conductor'}>
                {price > 0 ? `${price.toLocaleString('es')} XAF` : 'A convenir'}
              </Text>
              <Text style={s.miniLabel}>El conductor confirma el precio al aceptar. La app no lo estima.</Text>
            </View>

            {/* Presupuesto deseado (opcional) */}
            <View style={s.card}>
              <Text style={s.label}>Mi presupuesto deseado (opcional)</Text>
              <View style={[s.budgetRow, budgetNum !== null && { borderColor: colors.secondary }]}>
                <TextInput
                  style={[s.budgetInput, budgetNum !== null && { color: colors.secondary }]}
                  placeholder="Escribe tu presupuesto"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                  value={budget}
                  onChangeText={setBudget}
                />
                <Text style={[s.currencyTag, budgetNum !== null && { color: colors.secondary }]}>XAF</Text>
              </View>
            </View>

            {/* Notas (opcional) */}
            <View style={s.card}>
              <View style={s.sectionHeader}>
                <MessageSquare size={15} color={colors.textSecondary} />
                <Text style={s.sectionTitle}>Notas para el conductor (opcional)</Text>
              </View>
              <TextInput
                style={[s.input, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 10 }]}
                placeholder="llevar maletas, punto exacto de parada…"
                placeholderTextColor={colors.textSecondary}
                value={notes}
                onChangeText={setNotes}
              />
            </View>
          </View>
        )}
      </ScrollView>

      {/* CTA inferior único por paso */}
      <View style={s.footer}>
        {step === 1 && (
          <Pressable
            disabled={!routeReady}
            onPress={() => setStep(2)}
            style={[s.confirmBtn, !routeReady && { backgroundColor: colors.textSecondary, opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel="Continuar"
          >
            <Text style={s.confirmText}>Continuar</Text>
            <Text style={[s.confirmSub, { color: 'rgba(255,255,255,0.85)' }]}>Elige día y vehículo</Text>
          </Pressable>
        )}
        {step === 2 && (
          <Pressable
            disabled={!scheduleReady}
            onPress={() => setStep(3)}
            style={[s.confirmBtn, !scheduleReady && { backgroundColor: colors.textSecondary, opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel="Continuar"
          >
            <Text style={s.confirmText}>Continuar</Text>
            <Text style={[s.confirmSub, { color: 'rgba(255,255,255,0.85)' }]}>Revisa el precio</Text>
          </Pressable>
        )}
        {step === 3 && (
          <Pressable
            disabled={!canConfirm || submitting}
            onPress={onConfirm}
            style={[s.confirmBtn, (!canConfirm || submitting) && { backgroundColor: colors.textSecondary, opacity: 0.5 }]}
            accessibilityRole="button"
            accessibilityLabel="Confirmar reserva"
          >
            <Text style={s.confirmText}>{submitting ? 'Procesando…' : price > 0 ? `Confirmar · ${price.toLocaleString('es')} XAF` : 'Confirmar reserva'}</Text>
            <Text style={[s.confirmSub, { color: 'rgba(255,255,255,0.85)' }]}>Tu ruta con seguridad</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

function Row({ icon, text }: { icon: React.ReactNode; text: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
      {icon}
      <Text style={{ flex: 1, fontSize: tipografia.body, color: colors.textPrimary, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

function alpha(hex: string, opacity: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

// ------------------------------- estilos ------------------------------------
const styles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    root: { flex: 1 },
    topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
    iconBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 64 },
    title: { fontSize: 17, fontWeight: '800', color: c.textPrimary },
    stepsRow: { flexDirection: 'row', gap: 5, marginTop: 4 },
    stepDot: { width: 18, height: 4, borderRadius: 2 },
    securityText: { fontSize: 10, color: c.success, fontWeight: '700' },

    stepTitle: { fontSize: tipografia.title, fontWeight: '800', color: c.textPrimary, marginHorizontal: 16, marginTop: 8, marginBottom: 12 },
    card: { backgroundColor: c.card, borderRadius: radios.lg, padding: 14, marginHorizontal: 16, marginBottom: 12, borderWidth: 1, borderColor: c.border, shadowColor: c.shadow, shadowOpacity: 0.05, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 1 },
    routeRow: { flexDirection: 'row', gap: 12 },
    routeRail: { alignItems: 'center', width: 10 },
    routeDot: { width: 10, height: 10, borderRadius: 5 },
    routeLine: { width: 2, flex: 1, backgroundColor: c.border, marginVertical: 2 },
    fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
    input: { flex: 1, fontSize: 15, color: c.textPrimary, padding: 0 },
    divider: { height: 1, backgroundColor: c.border },
    sumLine: { fontSize: 15, fontWeight: '700', color: c.textPrimary },

    chipRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16 },
    dayChip: { flex: 1, alignItems: 'center', borderWidth: 1.5, borderRadius: radios.md, paddingVertical: 12 },
    dayChipText: { fontSize: tipografia.body, fontWeight: '800' },

    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    sectionTitle: { fontSize: tipografia.body, fontWeight: '700', color: c.textPrimary },
    label: { fontSize: tipografia.caption, fontWeight: '700', color: c.textSecondary, marginBottom: 6 },

    chip: { paddingHorizontal: 11, paddingVertical: 8, borderRadius: radios.full, borderWidth: 1, borderColor: c.border, marginRight: 6, backgroundColor: c.background },
    chipText: { fontSize: tipografia.body, color: c.textPrimary, fontWeight: '700' },
    miniLabel: { fontSize: tipografia.micro, color: c.textSecondary, marginBottom: 4 },
    pickSummary: { fontSize: tipografia.body, fontWeight: '800', color: c.primary, marginTop: 12 },

    vehicleCard: { width: 124, padding: 14, borderRadius: radios.lg, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.card, alignItems: 'center', gap: 6 },
    vehicleName: { fontSize: tipografia.body, fontWeight: '800', textAlign: 'center' },
    vehicleDesc: { fontSize: tipografia.micro, color: c.textSecondary, textAlign: 'center' },

    priceBig: { fontSize: tipografia.display, fontWeight: '800', color: c.textPrimary },
    budgetRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: c.border, borderRadius: radios.md, paddingHorizontal: 12, marginTop: 6 },
    budgetInput: { flex: 1, fontSize: 15, color: c.textPrimary, paddingVertical: 10 },
    currencyTag: { fontSize: tipografia.body, fontWeight: '800', color: c.textSecondary },

    hint: { textAlign: 'center', fontSize: tipografia.caption, color: c.textSecondary, marginTop: 10, paddingHorizontal: 24, lineHeight: 16 },

    footer: { position: 'absolute', left: 16, right: 16, bottom: 24 },
    confirmBtn: { backgroundColor: c.primary, borderRadius: radios.full, paddingVertical: 15, alignItems: 'center' },
    confirmText: { fontSize: 16.5, fontWeight: '800', color: brand.white },
    confirmSub: { fontSize: tipografia.micro, marginTop: 2 },
  });
