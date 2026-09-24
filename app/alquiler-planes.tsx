/**
 * AlquilerPlanesScreen — Planes de suscripción (kit SubscriptionPlansScreen) v2.
 * Auditoría aplicada:
 *  · Plan Gratis SIN checkout (lo gestiona el admin); planes de pago → billing-checkout.
 *  · Guard de arrendador: si no estás aprobado, aviso con navegación al alta.
 *  · Advertencia de límite: propiedades activas > maxProperties del plan destino.
 *  · Cargas separadas (plans/landlord) con error + reintento individuales, focus reload
 *    (useFocusEffect) y pull-to-refresh.
 *  · Tarjeta = View (sin Pressable anidado): solo el botón actúa; plan actual resaltado.
 *  · a11y completa, spinner por plan, features genéricas (núm/bool/string), tokens del
 *    tema, fallback de plan.color y copy de pago real (2–24 h).
 * Ruta: /alquiler-planes
 */

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Check, X } from 'lucide-react-native';
import { useTheme, alpha, brand, tipografia, radios, ScreenHeader } from '@egrouteplan/ui-kit';
import { rentalApi, type RentalPlan, type LandlordMe } from '../api/rental';
import { billingApi } from '../api/billing';
import { formatXAF } from '../utils/formatHelpers';

const FEATURE_LABELS: Array<{ key: string; label: string }> = [
  { key: 'maxProperties', label: 'Propiedades' },
  { key: 'maxPhotos', label: 'Fotos por anuncio' },
  { key: 'featuredSlots', label: 'Anuncios destacados' },
  { key: 'priorityInSearch', label: 'Prioridad en búsquedas' },
  { key: 'verifiedBadge', label: 'Insignia de verificado' },
  { key: 'analytics', label: 'Estadísticas' },
  { key: 'canPublishCommercial', label: 'Bares, discotecas y terrenos' },
  { key: 'canPublishShortTerm', label: 'Alquiler por noches' },
];

const PLAN_ORDER = ['free', 'verified', 'agency_pro', 'premium'];
const PLAN_CODES: Record<string, string> = {
  verified: 'rental_verified', agency_pro: 'rental_agency_pro', premium: 'rental_premium',
};

const maxPropsOf = (plan?: RentalPlan) => Number(plan?.features?.maxProperties ?? 0);

export default function AlquilerPlanesScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [plans, setPlans] = useState<RentalPlan[]>([]);
  const [landlord, setLandlord] = useState<LandlordMe | null>(null);
  const [plansLoading, setPlansLoading] = useState(true);
  const [landlordLoading, setLandlordLoading] = useState(true);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [landlordError, setLandlordError] = useState<string | null>(null);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    setPlansLoading(true);
    setPlansError(null);
    try {
      setPlans(await rentalApi.plans());
    } catch (e) {
      setPlansError(e instanceof Error ? e.message : 'No se pudieron cargar los planes');
    } finally {
      setPlansLoading(false);
    }
  }, []);

  const loadLandlord = useCallback(async () => {
    setLandlordLoading(true);
    setLandlordError(null);
    try {
      setLandlord(await rentalApi.landlordMe());
    } catch (e) {
      setLandlordError(e instanceof Error ? e.message : 'No se pudo cargar tu estado de arrendador');
    } finally {
      setLandlordLoading(false);
    }
  }, []);

  // Recarga al montar y al volver del checkout (plan recién aprobado).
  useFocusEffect(
    useCallback(() => {
      void loadPlans();
      void loadLandlord();
    }, [loadPlans, loadLandlord]),
  );

  const currentSubscription = landlord?.subscription ?? 'free';
  const approved = !!landlord?.exists && landlord?.status === 'approved';
  const activeProps = landlord?.propertiesCount ?? 0;
  const ordered = PLAN_ORDER
    .map((k) => plans.find((p) => p.key === k))
    .filter((p): p is RentalPlan => Boolean(p));

  const goCheckout = async (planKey: string) => {
    const code = PLAN_CODES[planKey];
    setProcessingPlan(planKey);
    try {
      if (!code) throw new Error('Plan no disponible en el catálogo de pago');
      const billingPlans = await billingApi.plans('rental');
      const bp = billingPlans.find((p) => p.code === code);
      if (!bp) throw new Error('Plan no disponible en el catálogo de pago');
      router.push({ pathname: '/billing-checkout', params: { planId: bp.id, module: 'rental', targetType: 'user' } } as never);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo iniciar la compra');
    } finally {
      setProcessingPlan(null);
    }
  };

  const handleSelectPlan = (planKey: string) => {
    if (planKey === currentSubscription) {
      Alert.alert('Plan actual', 'Ya tienes este plan activo.');
      return;
    }
    if (landlordLoading && !landlord) {
      Alert.alert('Un momento', 'Todavía estamos cargando tu estado de arrendador.');
      return;
    }
    const targetPlan = plans.find((p) => p.key === planKey);

    // Plan Gratis no tiene checkout: lo gestiona el administrador.
    if (planKey === 'free') {
      Alert.alert(
        'Cambiar a plan Gratis',
        'Perderás los beneficios de tu plan actual. El cambio a Gratis lo gestiona el administrador: escríbenos desde soporte y lo aplicaremos.',
        [{ text: 'Entendido' }],
      );
      return;
    }

    // Guard de arrendador (planes de pago requieren landlord aprobado).
    if (!approved) {
      Alert.alert(
        'Arrendador no verificado',
        landlord?.status === 'pending'
          ? 'Tu solicitud de arrendador está pendiente de revisión. Podrás contratar un plan cuando esté aprobada.'
          : landlord?.status === 'rejected'
            ? 'Tu solicitud de arrendador fue rechazada. Corrige los datos y vuelve a enviarla.'
            : 'Para contratar un plan de pago primero debes darte de alta y ser aprobado como arrendador.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Ir al alta', onPress: () => router.push('/alquiler-publicar' as never) },
        ],
      );
      return;
    }

    // Advertencia: propiedades activas por encima del límite del plan destino.
    const targetMax = maxPropsOf(targetPlan);
    if (targetMax > 0 && activeProps > targetMax) {
      Alert.alert(
        'Ojo con tu límite',
        `Tienes ${activeProps} propiedades activas, pero «${targetPlan?.name ?? planKey}» permite ${targetMax}. Podrás mantenerlas hasta cerrarlas, pero no podrás publicar nuevas hasta bajar de ese número o subir de plan. ¿Continuar al pago?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Continuar', onPress: () => { void goCheckout(planKey); } },
        ],
      );
      return;
    }

    // Confirmación de bajada entre planes de pago (se pierden features).
    const curIdx = PLAN_ORDER.indexOf(currentSubscription);
    const dstIdx = PLAN_ORDER.indexOf(planKey);
    if (dstIdx >= 0 && dstIdx < curIdx) {
      Alert.alert(
        'Cambiar a un plan inferior',
        `Pasarás de «${currentSubscription}» a «${targetPlan?.name ?? planKey}» y perderás sus ventajas. Puedes volver a subir cuando quieras.`,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Continuar', onPress: () => { void goCheckout(planKey); } },
        ],
      );
      return;
    }

    void goCheckout(planKey);
  };

  const renderFeature = (plan: RentalPlan, key: string) => {
    const features = plan.features as unknown as Record<string, unknown>;
    const v = features[key];
    const label = FEATURE_LABELS.find((f) => f.key === key)?.label ?? key;
    if (typeof v === 'number') {
      return (
        <View style={s.featureRow} key={key}>
          <Text style={s.featureLabel}>{label}</Text>
          <Text style={s.featureValue}>{v <= 0 ? '—' : String(v)}</Text>
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
    if (v != null) {
      return (
        <View style={s.featureRow} key={key}>
          <Text style={s.featureLabel}>{label}</Text>
          <Text style={s.featureValue}>{String(v)}</Text>
        </View>
      );
    }
    return null;
  };

  const s = styles(colors);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top }}>
      {/* Cabecera del kit desde el 24/09/2026 (unificación de las 21 cabeceras). La clave local
          `header` se retira; el título sube de 700 a `peso.maximo` y el icono de 24 se queda igual. */}
      <ScreenHeader
        titulo="Planes de suscripción"
        alVolver={() => router.back()}
      />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={plansLoading || landlordLoading} onRefresh={() => { void loadPlans(); void loadLandlord(); }} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <Text style={s.title}>Planes de suscripción</Text>
        <Text style={s.subtitle}>
          Publica gratis 1 propiedad. Con un plan de pago publicas más, destacas en la búsqueda y vendes por noches. Pago por transferencia o Mobile Money; el administrador aprueba tu comprobante (2–24 h).
        </Text>

        {plansError && (
          <View style={{ marginBottom: 12, backgroundColor: alpha(colors.danger, 0.06), padding: 10, borderRadius: 10 }}>
            <Text style={{ color: colors.danger, fontSize: tipografia.caption }}>{plansError}</Text>
            <Pressable onPress={() => void loadPlans()} accessibilityRole="button" accessibilityLabel="Reintentar cargar planes" hitSlop={6}>
              <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: '700', marginTop: 4 }}>Reintentar planes</Text>
            </Pressable>
          </View>
        )}
        {landlordError && (
          <View style={{ marginBottom: 12, backgroundColor: alpha(colors.danger, 0.06), padding: 10, borderRadius: 10 }}>
            <Text style={{ color: colors.danger, fontSize: tipografia.caption }}>{landlordError}</Text>
            <Pressable onPress={() => void loadLandlord()} accessibilityRole="button" accessibilityLabel="Reintentar cargar estado de arrendador" hitSlop={6}>
              <Text style={{ color: colors.primary, fontSize: tipografia.caption, fontWeight: '700', marginTop: 4 }}>Reintentar mi estado</Text>
            </Pressable>
          </View>
        )}

        {plansLoading && ordered.length === 0 && (
          <View style={{ alignItems: 'center', marginVertical: 30 }}>
            <ActivityIndicator color={colors.primary} />
            <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, marginTop: 8 }}>Cargando planes…</Text>
          </View>
        )}
        {!plansLoading && ordered.length === 0 && !plansError && (
          <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 30 }}>No hay planes disponibles en este momento.</Text>
        )}

        {ordered.map((plan) => {
          const isCurrent = plan.key === currentSubscription;
          const planColor = plan.color || colors.primary;
          const isProcessing = processingPlan === plan.key;
          const isPaid = plan.price > 0;
          return (
            <View key={plan.key} style={[s.planCard, { borderColor: isCurrent ? planColor : colors.border }, isCurrent && { backgroundColor: alpha(planColor, 0.06) }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={[s.planName, { color: planColor }]}>{plan.name}</Text>
                  {isCurrent && (
                    <View style={[s.currentBadge, { backgroundColor: planColor }]}>
                      <Text style={s.currentBadgeText}>Plan actual</Text>
                    </View>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.price}>{plan.price === 0 ? 'Gratis' : formatXAF(plan.price)}</Text>
                  {plan.period && <Text style={s.period}>/{plan.period}</Text>}
                </View>
              </View>

              <View style={{ marginBottom: 14 }}>
                {FEATURE_LABELS.map((f) => renderFeature(plan, f.key))}
              </View>

              <Pressable
                onPress={() => handleSelectPlan(plan.key)}
                disabled={processingPlan !== null}
                accessibilityRole="button"
                accessibilityLabel={isCurrent ? `Plan actual: ${plan.name}` : plan.price === 0 ? 'Cambiar al plan Gratis' : `Elegir el plan ${plan.name}`}
                accessibilityState={{ disabled: processingPlan !== null, selected: isCurrent }}
                style={({ pressed }) => [
                  s.selectButton,
                  { backgroundColor: isCurrent ? colors.border : planColor, opacity: processingPlan !== null ? 0.6 : pressed ? 0.85 : 1 },
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

        {/* Nota de pago */}
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
  title: { fontSize: 22, fontWeight: '800', color: c.textPrimary, marginBottom: 6 },
  subtitle: { fontSize: tipografia.body, color: c.textSecondary, lineHeight: 19, marginBottom: 18 },
  planCard: { backgroundColor: c.card, borderRadius: radios.lg, padding: 18, marginBottom: 16, borderWidth: 1 },
  planName: { fontSize: 18, fontWeight: '700' },
  currentBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, marginTop: 6, alignSelf: 'flex-start' },
  currentBadgeText: { color: brand.white, fontSize: tipografia.micro, fontWeight: '600' },
  price: { fontSize: tipografia.title, fontWeight: '800', color: c.textPrimary },
  period: { fontSize: tipografia.body, color: c.textSecondary },
  featureRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: c.border },
  featureLabel: { fontSize: tipografia.body, color: c.textSecondary, flex: 1 },
  featureValue: { fontSize: tipografia.body, fontWeight: '600', color: c.textPrimary },
  selectButton: { borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  selectButtonText: { color: brand.white, fontSize: 15, fontWeight: '700' },
  paymentNote: { backgroundColor: c.card, borderRadius: radios.md, padding: 16, marginTop: 8, borderWidth: 1 },
  paymentNoteTitle: { fontSize: 15, fontWeight: '700', color: c.textPrimary, marginBottom: 8 },
  paymentNoteText: { fontSize: tipografia.body, color: c.textSecondary, lineHeight: 22 },
});
