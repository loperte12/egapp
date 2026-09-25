// egrouteplan-app/app/billing-checkout.tsx
/**
 * BillingCheckoutScreen — comprar un plan (Billing/Payments Core).
 * Crea la orden (precio SIEMPRE del servidor), instrucciones de pago, subida de
 * comprobante MULTIPART (cámara/galería, jpg/png, máx 5 MB) con monto y
 * referencia declarados, y estado de la orden.
 *
 * Auditoría senior (2026-09-02, v3 final — fusionada con la revisión del usuario):
 *  · LoadingState único ('idle'|'loading'|'creating'|'submitting'|'refreshing')
 *    — sin flags inconsistentes.
 *  · validación de monto con regla anti-monto-bajo (≥50% del precio del plan
 *    cuando el plan tiene precio) + error inline.
 *  · Permisos de cámara/galería explícitos con "Abrir ajustes" si se deniegan.
 *  · Comprobante MULTIPART (no base64): preview real, cambiar/quitar, 5 MB.
 *  · canSubmit SOLO pending_payment|rejected (endurecido igual que el backend:
 *    no se sobrescribe durante la revisión).
 *  · Fecha con 'es-GQ' + hora (sin bugs de timezone del dispositivo).
 *  · KeyboardAvoidingView, testIDs, a11y, error recoverable con Reintentar,
 *    refresco al volver (useFocusEffect) y manual.
 * Ruta: /billing-checkout?planId= | ?orderId=
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Alert, Image as RNImage, KeyboardAvoidingView, Linking, Platform,
  Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Check, Info, RefreshCw, X, XCircle } from 'lucide-react-native';
import { alpha, espaciado, FormField, GhostButton, PrimaryButton, radios, ScreenHeader, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { billingApi, BillingOrder, BillingPlan } from '../api/billing';
import { formatXAF } from '../utils/formatHelpers';
import { brand } from '@egrouteplan/ui-kit';

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending_payment: { label: 'Pendiente de pago', color: brand.warning },
  proof_submitted: { label: 'Comprobante recibido — en revisión (2–24 h)', color: brand.info },
  under_review: { label: 'En revisión', color: brand.info },
  approved: { label: 'Aprobado · derecho activo', color: brand.success },
  rejected: { label: 'Rechazado', color: brand.danger },
  cancelled: { label: 'Cancelado', color: brand.neutral },
  expired: { label: 'Expirado', color: brand.neutral },
  refunded: { label: 'Reembolsado', color: brand.info },
};
const MAX_PROOF_MB = 5;
type LoadingState = 'idle' | 'loading' | 'creating' | 'submitting' | 'refreshing';

export default function BillingCheckoutScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { planId, orderId, module: moduleParam, targetType, targetId } = useLocalSearchParams<{
    planId: string; orderId?: string; module?: string; targetType?: string; targetId?: string;
  }>();
  const targetModule = moduleParam || 'rental';

  const [plan, setPlan] = useState<BillingPlan | null>(null);
  const [order, setOrder] = useState<BillingOrder | null>(null);
  const [loadingState, setLoadingState] = useState<LoadingState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [proofUri, setProofUri] = useState<string | null>(null);
  const [proofMime, setProofMime] = useState('image/jpeg');
  const [declaredAmount, setDeclaredAmount] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [declaredRef, setDeclaredRef] = useState('');
  const busyRef = useRef(false);

  const load = useCallback(async (mode: 'initial' | 'quiet' = 'initial') => {
    let alive = true;
    if (mode === 'initial') { setLoadingState('loading'); setError(null); }
    try {
      if (orderId) {
        const o = await billingApi.order(orderId);
        if (!alive) return;
        setOrder(o);
        const plans = await billingApi.plans(o.module || targetModule);
        if (!alive) return;
        setPlan(plans.find((x) => x.id === o.planId) ?? null);
      } else if (planId) {
        const plans = await billingApi.plans(targetModule);
        if (!alive) return;
        setPlan(plans.find((x) => x.id === planId) ?? null);
      } else {
        setError('No se especificó un plan u orden.');
      }
    } catch {
      if (alive && mode === 'initial') {
        setError('No pudimos cargar el plan. Revisa tu conexión e inténtalo de nuevo.');
      }
    } finally {
      if (alive && mode === 'initial') setLoadingState('idle');
    }
    return () => { alive = false; };
  }, [planId, orderId, targetModule]);

  useEffect(() => { load('initial'); }, [load]);

  // Refresco silencioso al volver (el admin puede haber aprobado/rechazado).
  useFocusEffect(
    useCallback(() => {
      if (order && loadingState === 'idle') load('quiet').catch(() => undefined);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  /* ── Validación del monto (opcional, entero > 0, anti monto-bajo ≥50% del plan) */
  const amountStatus = useMemo(() => {
    const t = declaredAmount.trim();
    if (t === '') return 'empty' as const;
    const n = Number(t);
    if (!Number.isInteger(n) || n <= 0) return 'invalid' as const;
    if (n > 50_000_000) return 'invalid' as const;
    if (plan && plan.priceXaf > 0 && n < plan.priceXaf * 0.5) return 'low' as const;
    return 'ok' as const;
  }, [declaredAmount, plan]);

  const validateAmount = useCallback((): boolean => {
    if (amountStatus === 'empty') { setAmountError(null); return true; }
    if (amountStatus === 'low') {
      setAmountError(`El monto parece bajo. El precio del plan es ${formatXAF(plan?.priceXaf ?? 0)}.`);
      return false;
    }
    if (amountStatus === 'invalid') {
      setAmountError('El monto debe ser un número entero mayor que 0 (máx 50.000.000).');
      return false;
    }
    setAmountError(null);
    return true;
  }, [amountStatus, plan]);

  /* ── Crear orden ── */
  const createOrder = async () => {
    if (!planId || loadingState === 'creating' || busyRef.current) return;
    busyRef.current = true;
    setLoadingState('creating');
    setError(null);
    try {
      const body: Record<string, string> = { planId };
      if (targetModule !== 'rental') body.module = targetModule;
      if (targetType) body.targetType = targetType;
      else if (targetModule !== 'rental') body.targetType = 'user';
      else body.targetType = 'landlord';
      if (targetId) body.targetId = targetId;
      const r = await billingApi.createOrder(body as any);
      setOrder(r.order ?? null);
      Alert.alert('Orden creada', r.message);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo crear la orden');
    } finally {
      busyRef.current = false;
      setLoadingState('idle');
    }
  };

  const refreshOrder = async () => {
    if (!order || loadingState === 'refreshing') return;
    setLoadingState('refreshing');
    try {
      setOrder(await billingApi.order(order.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar el estado');
    } finally {
      setLoadingState('idle');
    }
  };

  /* ── Permisos + cámara/galería ── */
  const pickProof = () => {
    Alert.alert('Subir comprobante', 'Foto del comprobante (jpg/png, máx 5 MB):', [
      { text: 'Cancelar', style: 'cancel' },
      { text: '📷 Cámara', onPress: () => pickFrom('camera') },
      { text: '🖼️ Galería', onPress: () => pickFrom('gallery') },
    ]);
  };

  const pickFrom = async (source: 'gallery' | 'camera') => {
    try {
      let granted = false;
      if (source === 'camera') {
        const p = await ImagePicker.requestCameraPermissionsAsync();
        granted = p.granted;
      } else {
        const p = await ImagePicker.requestMediaLibraryPermissionsAsync();
        granted = p.granted;
      }
      if (!granted) {
        Alert.alert('Permiso requerido', `Necesitamos acceso a tu ${source === 'camera' ? 'cámara' : 'galería'} para subir el comprobante.`, [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Abrir ajustes', onPress: () => Linking.openSettings() },
        ]);
        return;
      }
      const res = source === 'camera'
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
      if (res.canceled || !res.assets?.[0]) return;
      const a = res.assets[0];
      if ((a.fileSize ?? 0) > MAX_PROOF_MB * 1024 * 1024) {
        Alert.alert('Archivo demasiado pesado', `El comprobante debe pesar menos de ${MAX_PROOF_MB} MB.`);
        return;
      }
      const type = a.mimeType ?? 'image/jpeg';
      if (!type.startsWith('image/')) { Alert.alert('Archivo no válido', 'Sube una imagen (jpg o png).'); return; }
      setProofUri(a.uri);
      setProofMime(type === 'image/png' ? 'image/png' : 'image/jpeg');
    } catch { /* picker cancelado por el sistema */ }
  };

  /* ── Enviar comprobante MULTIPART ── */
  const submitProof = async () => {
    if (!order || !proofUri || loadingState === 'submitting' || busyRef.current) return;
    if (!validateAmount()) return;
    busyRef.current = true;
    setLoadingState('submitting');
    setError(null);
    try {
      const form = new FormData();
      form.append('file', { uri: proofUri, name: `comprobante.${proofMime === 'image/png' ? 'png' : 'jpg'}`, type: proofMime } as unknown as Blob);
      if (amountStatus === 'ok') form.append('declaredAmountXaf', String(Number(declaredAmount)));
      if (declaredRef.trim()) form.append('declaredReference', declaredRef.trim());
      const r = await billingApi.submitProof(order.id, form);
      Alert.alert('Comprobante enviado', r.message);
      setProofUri(null);
      setDeclaredAmount('');
      setDeclaredRef('');
      setAmountError(null);
      await refreshOrder();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir el comprobante');
    } finally {
      busyRef.current = false;
      setLoadingState('idle');
    }
  };

  const canSubmit = !!order
    && (order.status === 'pending_payment' || order.status === 'rejected')
    && !!proofUri
    && amountStatus !== 'invalid'
    && amountStatus !== 'low';

  const st = STATUS_LABELS[order?.status ?? ''] ?? { label: order?.status ?? '', color: colors.textSecondary };
  const s = styles(colors);

  if (loadingState === 'loading') {
    return (
      <View style={[s.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: espaciado.e12, color: colors.textSecondary }}>Cargando…</Text>
      </View>
    );
  }
  if (error && !plan) {
    return (
      <View style={[s.center, { backgroundColor: colors.background, padding: espaciado.e24 }]}>
        <XCircle size={48} color={colors.danger} />
        <Text style={{ color: colors.danger, fontWeight: peso.fuerte, marginTop: espaciado.e12, textAlign: 'center' }}>{error}</Text>
        <View style={{ marginTop: espaciado.e16 }}><GhostButton title="Reintentar" onPress={() => load('initial')} /></View>
        <View style={{ marginTop: espaciado.e8 }}><GhostButton title="Volver" onPress={() => router.back()} /></View>
      </View>
    );
  }
  if (!plan) {
    return (
      <View style={[s.center, { backgroundColor: colors.background, padding: espaciado.e24 }]}>
        <Text style={{ color: colors.danger, fontWeight: peso.fuerte }}>Plan no encontrado</Text>
        <GhostButton title="Volver" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: colors.background }}
    >
      {/* Cabecera del kit desde el 24/09/2026. El `paddingTop` de la zona segura va por `style`,
          que es exactamente para lo que el componente lo admite. */}
      <ScreenHeader
        titulo="Checkout"
        alVolver={() => router.back()}
        style={{ paddingTop: insets.top }}
      />

      <ScrollView
        contentContainerStyle={{ padding: espaciado.e16, paddingBottom: espaciado.e24 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {error && (
          <View style={[s.card, { borderColor: colors.danger, backgroundColor: alpha(colors.danger, 0.06), marginBottom: espaciado.e12 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e8 }}>
              <XCircle size={16} color={colors.danger} />
              <Text style={{ flex: 1, color: colors.danger, fontWeight: peso.medio, fontSize: tipografia.body }}>{error}</Text>
            </View>
            <Pressable onPress={() => load('initial')} style={{ marginTop: espaciado.e8, alignSelf: 'flex-start' }} accessibilityRole="button">
              <Text style={{ color: colors.primary, fontWeight: peso.fuerte, fontSize: tipografia.caption }}>Reintentar</Text>
            </Pressable>
          </View>
        )}

        {/* Plan */}
        <View style={[s.card, { borderColor: colors.border }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: espaciado.e8 }}>
            <Text style={{ fontSize: tipografia.subtitle, fontWeight: peso.fuerte, color: colors.textPrimary, flex: 1 }}>{plan.name}</Text>
            <Text style={{ fontSize: 18, fontWeight: peso.maximo, color: colors.primary }}>{formatXAF(plan.priceXaf)}</Text>
          </View>
          {plan.description ? <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, marginTop: espaciado.e4 }}>{plan.description}</Text> : null}
        </View>

        {/* Orden */}
        {!order ? (
          <View style={{ marginTop: espaciado.e16, gap: espaciado.e10 }}>
            <Text style={{ fontSize: tipografia.body, color: colors.textSecondary, lineHeight: 18 }}>
              Al confirmar se creará tu orden de compra. El precio lo calcula el servidor (no es editable). Después recibirás las instrucciones de pago y podrás subir el comprobante.
            </Text>
            <PrimaryButton title={loadingState === 'creating' ? 'Creando orden…' : 'Confirmar compra'} onPress={createOrder}
              disabled={loadingState === 'creating'} loading={loadingState === 'creating'} testID="billing-create-order" />
          </View>
        ) : (
          <>
            {/* Estado */}
            <View style={[s.card, { borderColor: st.color, backgroundColor: alpha(st.color, 0.06), marginTop: espaciado.e14 }]}>
              <Text style={{ fontSize: tipografia.body, fontWeight: peso.maximo, color: st.color }}>{st.label}</Text>
              <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary, marginTop: espaciado.e4 }}>
                Orden {order.id.slice(0, 8)}… · {formatXAF(order.amountXaf)} · vence{' '}
                {order.expiresAt
                  ? new Date(order.expiresAt).toLocaleString('es-GQ', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                  : '—'}
              </Text>
              {order.rejectionReason ? (
                <View style={{ marginTop: espaciado.e8, flexDirection: 'row', alignItems: 'flex-start', gap: espaciado.e6 }}>
                  <XCircle size={14} color={brand.danger} />
                  <Text style={{ flex: 1, fontSize: tipografia.caption, color: brand.danger, fontWeight: peso.medio }}>Motivo: {order.rejectionReason}</Text>
                </View>
              ) : null}
            </View>

            {/* Instrucciones de pago */}
            {(order.status === 'pending_payment' || order.status === 'rejected') && (
              <View style={[s.card, { borderColor: colors.border, marginTop: espaciado.e12 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e6, marginBottom: espaciado.e6 }}>
                  <Info size={14} color={colors.primary} />
                  <Text style={{ fontSize: tipografia.body, fontWeight: peso.fuerte, color: colors.textPrimary }}>Instrucciones de pago</Text>
                </View>
                <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, lineHeight: 18 }}>
                  {order.paymentInstructions ?? 'Paga por transferencia u Orange Money y sube el comprobante.'}
                </Text>
              </View>
            )}

            {/* Subir comprobante */}
            {(order.status === 'pending_payment' || order.status === 'rejected') && (
              <View style={{ marginTop: espaciado.e16, gap: espaciado.e10 }}>
                <Text style={{ fontSize: tipografia.body, fontWeight: peso.fuerte, color: colors.textPrimary }}>
                  {order.status === 'rejected' ? 'Sube un nuevo comprobante' : 'Sube tu comprobante de pago'}
                </Text>
                {proofUri ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: espaciado.e10 }}>
                    <RNImage source={{ uri: proofUri }} style={{ width: 56, height: 56, borderRadius: radios.sm, backgroundColor: colors.surface }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: tipografia.caption, color: colors.textPrimary, fontWeight: peso.fuerte }}>Comprobante adjunto</Text>
                      <Text style={{ fontSize: 10.5, color: colors.textSecondary }}>jpg/png · máx 5 MB</Text>
                    </View>
                    <GhostButton title="Cambiar" onPress={pickProof} />
                    <Pressable onPress={() => setProofUri(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Quitar comprobante" testID="billing-remove-proof">
                      <X size={18} color={colors.textSecondary} />
                    </Pressable>
                  </View>
                ) : (
                  <Pressable
                    onPress={pickProof}
                    accessibilityRole="button"
                    accessibilityLabel="Subir foto del comprobante"
                    accessibilityHint="Abre cámara o galería"
                    testID="billing-pick-proof"
                    style={({ pressed }) => [s.proofBox, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.8 : 1 }]}
                  >
                    <Camera size={18} color={colors.primary} />
                    <Text style={{ fontSize: tipografia.body, color: colors.primary, fontWeight: peso.fuerte, marginLeft: espaciado.e8 }}>Foto del comprobante (cámara o galería)</Text>
                  </Pressable>
                )}

                <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>Monto pagado (XAF) — opcional pero recomendado</Text>
                <FormField
                  value={declaredAmount}
                  onChangeText={(t) => { setDeclaredAmount(t.replace(/[^\d]/g, '').slice(0, 8)); if (amountError) setAmountError(null); }}
                  onBlur={validateAmount}
                  placeholder={String(plan.priceXaf)}
                  keyboardType="number-pad"
                  accessibilityLabel="Monto pagado"
                  accessibilityHint="Introduce el monto que pagaste"
                  error={amountError ?? undefined}
                />
                <Text style={{ fontSize: tipografia.micro, color: colors.textSecondary }}>Referencia de la transferencia</Text>
                <FormField
                  value={declaredRef}
                  onChangeText={setDeclaredRef}
                  placeholder="Ej: transferencia 12:45, ref. 3456"
                  maxLength={120}
                  accessibilityLabel="Referencia de transferencia"
                  accessibilityHint="Introduce la referencia del pago"
                />
                <PrimaryButton
                  title={loadingState === 'submitting' ? 'Enviando…' : 'Enviar comprobante'}
                  onPress={submitProof}
                  disabled={!canSubmit || loadingState === 'submitting'}
                  loading={loadingState === 'submitting'}
                  testID="billing-submit-proof"
                />
                {!proofUri && (
                  <Text style={{ textAlign: 'center', fontSize: tipografia.micro, color: colors.textSecondary }}>
                    Añade la foto del comprobante para poder enviarlo.
                  </Text>
                )}
              </View>
            )}

            {(order.status === 'proof_submitted' || order.status === 'under_review') && (
              <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, marginTop: espaciado.e12, textAlign: 'center', lineHeight: 16 }}>
                Tu comprobante está en revisión (2–24 h). Cuando lo aprueben, tu derecho quedará activo aquí mismo.
              </Text>
            )}

            {order.status === 'approved' && (
              <View style={{ marginTop: espaciado.e16 }}>
                <PrimaryButton title="Ver mis derechos" onPress={() => router.push('/billing-status' as any)} testID="billing-view-rights" />
              </View>
            )}

            {/* Refrescar estado */}
            <Pressable
              onPress={refreshOrder}
              disabled={loadingState === 'refreshing'}
              accessibilityRole="button"
              accessibilityLabel="Actualizar estado de la orden"
              testID="billing-refresh"
              style={[s.refreshRow, { opacity: loadingState === 'refreshing' ? 0.6 : 1 }]}
            >
              {loadingState === 'refreshing'
                ? <ActivityIndicator size="small" color={colors.textSecondary} />
                : <RefreshCw size={14} color={colors.textSecondary} />}
              <Text style={{ fontSize: tipografia.caption, color: colors.textSecondary, fontWeight: peso.medio }}>
                {loadingState === 'refreshing' ? 'Actualizando…' : 'Actualizar estado'}
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = (c: ReturnType<typeof useTheme>['colors']) =>
  StyleSheet.create({
    card: { borderRadius: radios.md, padding: espaciado.e14, borderWidth: 1 },
    proofBox: { flexDirection: 'row', alignItems: 'center', padding: espaciado.e14, borderRadius: 10, borderWidth: 1 },
    refreshRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e6, marginTop: espaciado.e16, paddingVertical: espaciado.e8 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  });
