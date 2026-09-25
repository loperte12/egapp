/**
 * WorkPlanesScreen — Planes de publicación de Buscar Work (suscripciones) v2.
 * Auditoría aplicada:
 *  · Quitada la tarjeta "Destacar oferta" (pago por oferta → vive en Mis ofertas);
 *    aquí SOLO suscripciones (Gratis/Work Pro/Work Business).
 *  · Recarga al recuperar foco (useFocusEffect) → plan fresco al volver de compra.
 *  · Carga inicial con spinner, error + Reintentar y pull-to-refresh.
 *  · Confirmación de downgrade + aviso si tienes más ofertas activas que el límite
 *    del plan destino (solo UI; el backend ya bloquea publicar sobre la cuota).
 *  · Tarjeta no presionable (sin Pressable anidado): solo el botón actúa.
 *  · a11y completa; spinner por plan (no global); features con fallback.
 * Ruta: /work-planes
 */

import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Check, X } from 'lucide-react-native';
import {ScreenHeader, alpha, brand, espaciado, neutro, peso, radios, tipografia, trazo, useTheme, trazoIcono} from '@egrouteplan/ui-kit';
import { billingApi, BillingPlan } from '../api/billing';
import { workApi, WorkPlan } from '../api/work';
import { formatXAF } from '../utils/formatHelpers';

const FEATURE_LABELS: Array<{ key: string; label: string }> = [
  { key: 'offerLimit', label: 'Ofertas activas' },
  { key: 'priorityInSearch', label: 'Prioridad en búsquedas' },
  { key: 'proBadge', label: 'Badge Pro' },
  { key: 'prioritySupport', label: 'Soporte prioritario' },
];

/** Solo suscripciones (el destaque por oferta se compra desde Mis ofertas). */
const PLAN_ORDER = ['work_basic', 'work_pro', 'work_business'];

const INTERVAL_LABEL: Record<string, string> = { monthly: '/mes', yearly: '/año' };

export default function WorkPlanesScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [myPlan, setMyPlan] = useState<WorkPlan | null>(null);
  const [ready, setReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Código del plan cuya compra se está iniciando (spinner solo en su botón). */
  const [purchaseCode, setPurchaseCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, m] = await Promise.all([billingApi.plans('work'), workApi.myPlan()]);
      setPlans(p);
      setMyPlan(m);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los planes');
    } finally {
      setReady(true);
      setRefreshing(false);
    }
  }, []);

  // Recarga al enfocar (vuelta de billing-checkout tras aprobar compra) y al montar.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const currentCode = myPlan?.planCode ?? 'work_basic';
  const activeJobs = myPlan?.activeJobs ?? 0;
  const ordered = PLAN_ORDER
    .map((code) => plans.find((p) => p.code === code))
    .filter((p): p is BillingPlan => Boolean(p));

  const offerLimitOf = (code: string) => {
    const plan = plans.find((p) => p.code === code);
    return Math.max(1, Number(plan?.features?.offerLimit ?? 1));
  };

  /** Lleva al checkout de Billing (compra real: orden → comprobante → admin). */
  const startCheckout = async (plan: BillingPlan) => {
    setPurchaseCode(plan.code);
    try {
      router.push({
        pathname: '/billing-checkout',
        params: { planId: plan.id, module: 'work', targetType: 'user' },
      } as never);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'No se pudo iniciar la compra');
    } finally {
      setPurchaseCode(null);
    }
  };

  const handleChoose = (plan: BillingPlan) => {
    if (plan.code === currentCode || purchaseCode) return;
    const downgrade = PLAN_ORDER.indexOf(plan.code) < PLAN_ORDER.indexOf(currentCode);
    const overLimit = activeJobs > offerLimitOf(plan.code);
    if (downgrade || overLimit) {
      const lines: string[] = [];
      if (downgrade) lines.push(`Pasarás a «${plan.name}».`);
      if (overLimit) {
        lines.push(
          `Tienes ${activeJobs} oferta(s) activa(s), pero este plan permite ${offerLimitOf(plan.code)}. ` +
          'Podrás mantenerlas hasta que caduquen, pero no podrás publicar nuevas hasta bajar de ese número o subir de plan.',
        );
      }
      Alert.alert(
        plan.priceXaf === 0 ? 'Cambiar al plan Gratis' : 'Confirmar cambio de plan',
        lines.join('\n\n'),
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: plan.priceXaf === 0 ? 'Cambiar a Gratis' : 'Continuar a pago',
            style: plan.priceXaf === 0 ? 'destructive' : 'default',
            onPress: () => { void startCheckout(plan); },
          },
        ],
      );
      return;
    }
    void startCheckout(plan);
  };

  const renderFeature = (plan: BillingPlan, key: string) => {
    const features = plan.features ?? {};
    if (!(key in features)) return null;
    const v = features[key];
    const label = FEATURE_LABELS.find((f) => f.key === key)?.label ?? key;
    if (key === 'offerLimit') {
      const n = Number(v);
      return (
        <View style={s.featureRow} key={key}>
          <Text style={s.featureLabel}>{label}</Text>
          <Text style={s.featureValue}>{Number.isFinite(n) && n > 0 ? String(n) : '—'}</Text>
        </View>
      );
    }
    if (typeof v === 'boolean') {
      return (
        <View style={s.featureRow} key={key}>
          <Text style={s.featureLabel}>{label}</Text>
          {v ? (
            <View accessible={false}><Check size={16} color={brand.success} strokeWidth={trazoIcono.marcado} /></View>
          ) : (
            <View accessible={false}><X size={16} color={neutro.n400} strokeWidth={trazoIcono.marcado} /></View>
          )}
        </View>
      );
    }
    if (v != null && typeof v !== 'object') {
      return (
        <View style={s.featureRow} key={key}>
          <Text style={s.featureLabel}>{label}</Text>
          <Text style={s.featureValue}>{String(v)}</Text>
        </View>
      );
    }
    return null;
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load();
  }, [load]);

  const s = styles(colors);

  // ---------- Carga inicial ----------
  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: espaciado.e12, color: colors.textSecondary, fontWeight: peso.fuerte }}>Cargando planes…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {/* Cabecera del kit desde el 24/09/2026. */}
      <ScreenHeader titulo="Planes Buscar Work" alVolver={() => router.back()} />

      <ScrollView
        contentContainerStyle={{ padding: espaciado.e16, paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} colors={[colors.primary]} />}
      >
        <Text style={s.title}>Planes de publicación</Text>
        <Text style={s.subtitle}>
          Publica gratis 1 oferta. Con Work Pro o Business publicas más ofertas activas y destacas en la búsqueda. Pago por transferencia o Mobile Money; el administrador aprueba tu comprobante (2–24 h).
        </Text>

        {myPlan && (
          <View style={{ backgroundColor: alpha(colors.primary, 0.08), borderRadius: radios.md, padding: espaciado.e12, marginBottom: espaciado.e14 }}>
            <Text style={{ fontSize: tipografia.caption, fontWeight: peso.fuerte, color: colors.textPrimary }}>
              Tu plan: {myPlan.planName} · {activeJobs}/{myPlan.offerLimit} ofertas activas
            </Text>
            {myPlan.expiresAt && (
              <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e2 }}>
                Vence: {new Date(myPlan.expiresAt).toLocaleDateString('es')}
              </Text>
            )}
          </View>
        )}

        {error && ordered.length === 0 && (
          <View style={{ alignItems: 'center', paddingVertical: espaciado.e30, paddingHorizontal: espaciado.e24 }}>
            <Text style={{ color: colors.danger, fontWeight: peso.fuerte, textAlign: 'center' }}>{error}</Text>
            <Pressable
              onPress={() => void load()}
              accessibilityRole="button" accessibilityLabel="Reintentar cargar los planes"
              style={({ pressed }) => [{ marginTop: espaciado.e12, paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e10, borderRadius: radios.chip, backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={{ color: brand.white, fontWeight: peso.maximo, fontSize: tipografia.body }}>Reintentar</Text>
            </Pressable>
          </View>
        )}

        {ordered.map((plan) => {
          const isCurrent = plan.code === currentCode;
          const isFree = plan.priceXaf === 0;
          const busyHere = purchaseCode === plan.code;
          const disabled = isCurrent || purchaseCode !== null;
          const intervalLabel = plan.priceXaf > 0 ? (INTERVAL_LABEL[plan.interval ?? ''] ?? '') : '';
          return (
            <View
              key={plan.code}
              style={[s.planCard, { borderColor: isCurrent ? colors.primary : colors.border, borderWidth: isCurrent ? 2 : 1, backgroundColor: isCurrent ? alpha(colors.primary, 0.05) : colors.card }]}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: espaciado.e14 }}>
                <View style={{ flex: 1, paddingRight: espaciado.e10 }}>
                  <Text style={[s.planName, { color: colors.primary }]}>{plan.name}</Text>
                  {isCurrent && (
                    <View style={[s.currentBadge, { backgroundColor: colors.primary }]}>
                      <Text style={s.currentBadgeText}>Plan actual</Text>
                    </View>
                  )}
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={s.price}>{isFree ? 'Gratis' : formatXAF(plan.priceXaf)}</Text>
                  {intervalLabel !== '' && <Text style={s.period}>{intervalLabel}</Text>}
                </View>
              </View>

              <View style={{ marginBottom: espaciado.e14 }}>
                {FEATURE_LABELS.map((f) => renderFeature(plan, f.key))}
              </View>

              <Pressable
                onPress={() => handleChoose(plan)}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={isCurrent ? `Tu plan actual es ${plan.name}` : `Elegir el plan ${plan.name}`}
                accessibilityState={{ disabled, selected: isCurrent }}
                style={({ pressed }) => [
                  s.selectButton,
                  { backgroundColor: isCurrent ? colors.border : colors.primary, opacity: disabled ? 1 : pressed ? 0.85 : 1 },
                ]}
              >
                {busyHere ? (
                  <ActivityIndicator color={brand.white} />
                ) : (
                  <Text style={[s.selectButtonText, isCurrent && { color: colors.textSecondary }]}>
                    {isCurrent ? 'Plan activo' : isFree ? 'Cambiar a Gratis' : 'Elegir este plan'}
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
            ¿Quieres destacar una oferta ya publicada? Hazlo desde «Mis ofertas → Destacar» con la oferta concreta.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) => StyleSheet.create({
  title: { fontSize: tipografia.subtitulo, fontWeight: peso.maximo, color: c.textPrimary, marginBottom: espaciado.e6 },
  subtitle: { fontSize: tipografia.body, color: c.textSecondary, lineHeight: 19, marginBottom: espaciado.e18 },
  planCard: { borderRadius: radios.lg, padding: espaciado.e18, marginBottom: espaciado.e16 },
  planName: { fontSize: tipografia.cabecera, fontWeight: peso.fuerte },
  currentBadge: { paddingHorizontal: espaciado.e8, paddingVertical: espaciado.e3, borderRadius: radios.marca, marginTop: espaciado.e6, alignSelf: 'flex-start' },
  currentBadgeText: { color: brand.white, fontSize: tipografia.micro, fontWeight: peso.medio },
  price: { fontSize: tipografia.title, fontWeight: peso.maximo, color: c.textPrimary },
  period: { fontSize: tipografia.body, color: c.textSecondary },
  featureRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: espaciado.e6, borderBottomWidth: trazo.fino, borderBottomColor: c.border },
  featureLabel: { fontSize: tipografia.body, color: c.textSecondary, flex: 1 },
  featureValue: { fontSize: tipografia.body, fontWeight: peso.medio, color: c.textPrimary },
  selectButton: { borderRadius: radios.chip, paddingVertical: espaciado.e14, alignItems: 'center' },
  selectButtonText: { color: brand.white, fontSize: tipografia.cuerpo, fontWeight: peso.fuerte },
  paymentNote: { backgroundColor: c.card, borderRadius: radios.md, padding: espaciado.e16, marginTop: espaciado.e8, borderWidth: trazo.fino },
  paymentNoteTitle: { fontSize: tipografia.cuerpo, fontWeight: peso.fuerte, color: c.textPrimary, marginBottom: espaciado.e8 },
  paymentNoteText: { fontSize: tipografia.body, color: c.textSecondary, lineHeight: 22 },
});
