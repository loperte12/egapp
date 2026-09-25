/**
 * IntercityPlanesScreen — Planes Ciudad a Ciudad (conductor) v2.
 * Auditoría aplicada:
 *  · Copy "Planes para conductores" (catálogo real: Gratis 4/mes · Pro ilimitado 5.000/mes).
 *  · useFocusEffect (recarga al volver del checkout), cargas/errores separados con
 *    Reintentar y RefreshControl.
 *  · Plan Gratis SIN checkout (lo gestiona soporte); Pro → billing-checkout real.
 *  · Tarjeta = View (solo el botón actúa; resaltado = plan actual), sin `selected`.
 *  · Barra de uso mensual (Decisión A) con alerta al 100% y CTA directo a Pro.
 *  · Confirmación al bajar a Gratis con aviso de viajes usados; processingPlan por botón,
 *    busyRef, tokens de color, SafeArea y a11y completa.
 * Ruta: /intercity-planes
 */

import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, X } from 'lucide-react-native';
import { alpha, brand, espaciado, radios, ScreenHeader, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { billingApi, type BillingPlan } from '../api/billing';
import { intercityApi, type IcPlan } from '../api/intercity';
import { formatXAF } from '../utils/formatHelpers';

const FEATURE_LABELS: Array<{ key: string; label: string }> = [
  { key: 'monthlyTrips', label: 'Viajes por mes' },
  { key: 'priorityInSearch', label: 'Prioridad en la búsqueda' },
  { key: 'proBadge', label: 'Badge Pro' },
  { key: 'multiVehicle', label: 'Multi-vehículo' },
  { key: 'maxDaysAhead', label: 'Antelación máxima' },
];

const PLAN_ORDER = ['intercity_driver_basic', 'intercity_driver_pro'];

export default function IntercityPlanesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const busyRef = useRef(false);

  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [myPlan, setMyPlan] = useState<IcPlan | null>(null);
  const [plansLoading, setPlansLoading] = useState(true);
  const [myPlanLoading, setMyPlanLoading] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [myPlanError, setMyPlanError] = useState<string | null>(null);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    setPlansError(null);
    try { setPlans(await billingApi.plans('intercity')); }
    catch (e) { setPlansError(e instanceof Error ? e.message : 'No se pudieron cargar los planes'); }
    finally { setPlansLoading(false); }
  }, []);

  const loadMyPlan = useCallback(async () => {
    setMyPlanLoading(true);
    setMyPlanError(null);
    try { setMyPlan(await intercityApi.myPlan()); }
    catch (e) { setMyPlanError(e instanceof Error ? e.message : 'No se pudo cargar tu plan'); }
    finally { setMyPlanLoading(false); }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadPlans();
      void loadMyPlan();
    }, [loadPlans, loadMyPlan]),
  );

  const currentCode = myPlan?.planCode ?? 'intercity_driver_basic';
  const used = myPlan?.monthlyUsed ?? 0;
  const limit = myPlan?.monthlyTrips ?? 0;
  const unlimited = myPlan != null && limit === -1;
  const atLimit = !unlimited && limit > 0 && used >= limit;
  const ordered = PLAN_ORDER
    .map((c) => plans.find((p) => p.code === c))
    .filter((p): p is BillingPlan => Boolean(p));

  const goCheckout = async (plan: BillingPlan) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setProcessingPlan(plan.code);
    try {
      router.push({ pathname: '/billing-checkout', params: { planId: plan.id, module: 'intercity', targetType: 'user' } } as never);
    } finally {
      busyRef.current = false;
      setProcessingPlan(null);
    }
  };

  const proPlan = plans.find((p) => p.code === 'intercity_driver_pro');

  const handleSelectPlan = (plan: BillingPlan) => {
    if (plan.code === currentCode) { Alert.alert('Plan actual', 'Ya tienes este plan activo.'); return; }
    if (plan.code === 'intercity_driver_basic') {
      Alert.alert(
        'Cambiar al plan Gratis',
        unlimited
          ? 'Perderás los viajes ilimitados de tu plan actual. El cambio a Gratis lo gestiona el administrador: escríbenos desde soporte y lo aplicaremos.'
          : `Tienes ${used}/${limit} viajes usados este mes. El cambio a Gratis lo gestiona el administrador: escríbenos desde soporte y lo aplicaremos.`,
        [{ text: 'Entendido' }],
      );
      return;
    }
    void goCheckout(plan);
  };

  const renderFeature = (plan: BillingPlan, key: string) => {
    const features = plan.features as unknown as Record<string, unknown>;
    const v = features[key];
    const label = FEATURE_LABELS.find((f) => f.key === key)?.label ?? key;
    if (key === 'monthlyTrips') {
      return (
        <View style={s.featureRow} key={key}>
          <Text style={s.featureLabel}>{label}</Text>
          <Text style={s.featureValue}>{Number(v) === -1 ? 'Ilimitados' : String(v)}</Text>
        </View>
      );
    }
    if (key === 'maxDaysAhead') {
      return (
        <View style={s.featureRow} key={key}>
          <Text style={s.featureLabel}>{label}</Text>
          <Text style={s.featureValue}>{Number(v) ? `${v} días` : '—'}</Text>
        </View>
      );
    }
    if (typeof v === 'boolean') {
      return (
        <View style={s.featureRow} key={key}>
          <Text style={s.featureLabel}>{label}</Text>
          <View accessible={false}>
            {v ? <Check size={16} color={colors.success} strokeWidth={3} /> : <X size={16} color={colors.textSecondary} strokeWidth={3} />}
          </View>
        </View>
      );
    }
    return null;
  };

  const s = styles(colors);
  const pct = !unlimited && limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {/* Cabecera del kit desde el 24/09/2026 (unificación de las 21 cabeceras). */}
      <ScreenHeader
        titulo="Planes Ciudad a Ciudad"
        alVolver={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={{ padding: espaciado.e16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={plansLoading || myPlanLoading} onRefresh={() => { void loadPlans(); void loadMyPlan(); }} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <Text style={s.title}>Planes para conductores</Text>
        <Text style={s.subtitle}>
          Publica gratis 4 viajes al mes. Con Pro publicas viajes ilimitados, apareces antes en la búsqueda y luces el badge. El pasajero te paga en efectivo; aquí pagas por publicar.
        </Text>

        {plansError && (
          <View style={{ marginBottom: espaciado.e10, backgroundColor: alpha(colors.danger, 0.06), padding: espaciado.e10, borderRadius: 10 }}>
            <Text style={{ color: colors.danger, fontSize: tipografia.caption }}>{plansError}</Text>
            <Pressable onPress={() => void loadPlans()} accessibilityRole="button" accessibilityLabel="Reintentar cargar planes" hitSlop={6}>
              <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e4 }}>Reintentar planes</Text>
            </Pressable>
          </View>
        )}
        {myPlanError && (
          <View style={{ marginBottom: espaciado.e10, backgroundColor: alpha(colors.danger, 0.06), padding: espaciado.e10, borderRadius: 10 }}>
            <Text style={{ color: colors.danger, fontSize: tipografia.caption }}>{myPlanError}</Text>
            <Pressable onPress={() => void loadMyPlan()} accessibilityRole="button" accessibilityLabel="Reintentar cargar mi plan" hitSlop={6}>
              <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: peso.fuerte, marginTop: espaciado.e4 }}>Reintentar mi plan</Text>
            </Pressable>
          </View>
        )}

        {myPlan && (
          <View style={{ backgroundColor: alpha(colors.primary, 0.07), borderRadius: 14, padding: espaciado.e12, marginBottom: espaciado.e14 }}>
            <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.textPrimary }}>
              Tu plan: {myPlan.planName} · {unlimited ? 'viajes ilimitados' : `${used}/${limit} viajes este mes`}
            </Text>
            {myPlan.expiresAt && (
              <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2 }}>
                Vence: {new Date(myPlan.expiresAt).toLocaleDateString('es')}
              </Text>
            )}

            {/* Barra de uso mensual (Decisión A) */}
            {!unlimited && limit > 0 && (
              <View style={{ marginTop: espaciado.e10 }}>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: alpha(colors.border, 0.6), overflow: 'hidden' }}>
                  <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: atLimit ? colors.danger : colors.primary }} />
                </View>
                {atLimit && proPlan && (
                  <Pressable
                    onPress={() => void goCheckout(proPlan)}
                    accessibilityRole="button" accessibilityLabel="Mejorar a Pro"
                    style={({ pressed }) => [{ marginTop: espaciado.e10, backgroundColor: colors.primary, borderRadius: 10, paddingVertical: espaciado.e10, alignItems: 'center', opacity: pressed ? 0.85 : 1 }]}
                  >
                    <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>Límite alcanzado · Pasar a viajes ilimitados</Text>
                  </Pressable>
                )}
              </View>
            )}
          </View>
        )}

        {plansLoading && ordered.length === 0 && (
          <View style={{ alignItems: 'center', marginVertical: espaciado.e30 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, marginTop: espaciado.e8 }}>Cargando planes…</Text>
          </View>
        )}
        {!plansLoading && ordered.length === 0 && !plansError && (
          <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: espaciado.e30 }}>No hay planes disponibles en este momento.</Text>
        )}

        {ordered.map((plan) => {
          const isCurrent = plan.code === currentCode;
          const isPro = plan.code === 'intercity_driver_pro';
          const isProcessing = processingPlan === plan.code;
          const isPaid = plan.priceXaf > 0;
          return (
            <View key={plan.code} style={[s.planCard, { borderColor: isCurrent ? colors.primary : colors.border }, isCurrent && { backgroundColor: alpha(colors.primary, 0.05) }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: espaciado.e14 }}>
                <View style={{ flex: 1, paddingRight: espaciado.e8 }}>
                  <Text style={[s.planName, { color: isPro ? colors.secondary : colors.primary }]}>{plan.name}</Text>
                  {isCurrent && (
                    <View style={[s.currentBadge, { backgroundColor: isPro ? colors.secondary : colors.primary }]}>
                      <Text style={s.currentBadgeText}>Plan actual</Text>
                    </View>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.price}>{plan.priceXaf === 0 ? 'Gratis' : formatXAF(plan.priceXaf)}</Text>
                  {plan.interval === 'monthly' && <Text style={s.period}>/mes</Text>}
                </View>
              </View>

              <View style={{ marginBottom: espaciado.e14 }}>
                {FEATURE_LABELS.map((f) => renderFeature(plan, f.key))}
              </View>

              <Pressable
                onPress={() => handleSelectPlan(plan)}
                disabled={processingPlan !== null || isCurrent}
                accessibilityRole="button"
                accessibilityLabel={isCurrent ? `Plan actual: ${plan.name}` : plan.priceXaf === 0 ? 'Cambiar al plan Gratis' : `Elegir el plan ${plan.name}`}
                accessibilityState={{ disabled: processingPlan !== null || isCurrent, selected: isCurrent }}
                style={({ pressed }) => [
                  s.selectButton,
                  { backgroundColor: isCurrent ? colors.border : isPro ? colors.secondary : colors.primary, opacity: processingPlan !== null ? 0.6 : pressed ? 0.85 : 1 },
                ]}
              >
                {isProcessing ? (
                  <ActivityIndicator color={brand.white} />
                ) : (
                  <Text style={[s.selectButtonText, isCurrent && { color: colors.textSecondary }]}>
                    {isCurrent ? 'Plan activo' : !isPaid ? 'Cambiar a Gratis' : 'Elegir este plan'}
                  </Text>
                )}
              </Pressable>
            </View>
          );
        })}

        <View style={[s.paymentNote, { borderColor: colors.border }]}>
          <Text style={s.paymentNoteTitle}>Cómo funciona</Text>
          <Text style={s.paymentNoteText}>
            1. Elige el plan y confirma la compra.{'\n'}
            2. Paga por transferencia o Mobile Money y sube el comprobante.{'\n'}
            3. El administrador aprueba y tu plan se activa (2–24 h).{'\n'}
            {'\n'}
            ¿Bajar a Gratis? Escríbenos desde soporte y lo gestionamos por ti.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  title: { fontSize: 22, fontWeight: peso.maximo, color: c.textPrimary, marginBottom: espaciado.e6 },
  subtitle: { fontSize: tipografia.body, color: c.textSecondary, lineHeight: 19, marginBottom: espaciado.e18 },
  planCard: { backgroundColor: c.card, borderRadius: radios.lg, padding: espaciado.e18, marginBottom: espaciado.e16, borderWidth: 1 },
  planName: { fontSize: 18, fontWeight: peso.fuerte },
  currentBadge: { paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3, borderRadius: 6, marginTop: espaciado.e6, alignSelf: 'flex-start' },
  currentBadgeText: { color: brand.white, fontSize: tipografia.micro, fontWeight: peso.medio },
  price: { fontSize: tipografia.title, fontWeight: peso.maximo, color: c.textPrimary },
  period: { fontSize: tipografia.body, color: c.textSecondary },
  featureRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: espaciado.e6, borderBottomWidth: 1, borderBottomColor: c.border },
  featureLabel: { fontSize: tipografia.body, color: c.textSecondary, flex: 1 },
  featureValue: { fontSize: tipografia.body, fontWeight: peso.medio, color: c.textPrimary },
  selectButton: { borderRadius: 10, paddingVertical: espaciado.e14, alignItems: 'center' },
  selectButtonText: { color: brand.white, fontSize: 15, fontWeight: peso.fuerte },
  paymentNote: { backgroundColor: c.card, borderRadius: radios.md, padding: espaciado.e16, marginTop: espaciado.e8, borderWidth: 1 },
  paymentNoteTitle: { fontSize: 15, fontWeight: peso.fuerte, color: c.textPrimary, marginBottom: espaciado.e8 },
  paymentNoteText: { fontSize: tipografia.body, color: c.textSecondary, lineHeight: 22 },
});
