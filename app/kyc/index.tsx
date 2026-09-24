/**
 * KYC — Paso 1: datos personales y detección de submission existente.
 * Si ya hay una submission en curso, redirige al paso correspondiente.
 */

import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { espaciado, FormField, KycStatusBanner, PrimaryButton, StepHeader, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { useSession } from '../../state/session';
import { kycApi, type SubmissionState } from '../../api/kyc';
import { ApiError } from '../../api/auth';
import { KYC_STATUS_TO_STEP } from '@egrouteplan/contracts';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NATION_RE = /^[A-Za-z]{2}$/;

function isDocStatus(s: string) {
  return ['INITIATED', 'OCR_PENDING', 'OCR_FAILED'].includes(s);
}

export default function KycStartScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isUnlocked } = useSession();

  const [loading, setLoading] = useState(true);
  const [existing, setExisting] = useState<SubmissionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [nationality, setNationality] = useState('GQ');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isUnlocked) return;
    kycApi
      .current()
      .then((sub) => {
        setExisting(sub);
        if (sub) {
          if (sub.status === 'APPROVED_L2') {
            // Ya verificado: nada que hacer aquí.
          } else if (isDocStatus(sub.status)) {
            const opt = sub.decision.options[0];
            router.replace({
              pathname: '/kyc/capture',
              params: { submissionId: sub.submissionId, docType: opt.docType, sides: opt.sides.join(',') },
            });
          } else if (sub.status === 'LIVENESS_REQUIRED') {
            router.replace({ pathname: '/kyc/liveness', params: { submissionId: sub.submissionId } });
          } else {
            router.replace({ pathname: '/kyc/status', params: { submissionId: sub.submissionId } });
          }
        }
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Error al consultar tu verificación'))
      .finally(() => setLoading(false));
  }, [isUnlocked]);

  const canSubmit =
    fullName.trim().length >= 3 && ISO_DATE_RE.test(birthDate) && NATION_RE.test(nationality);

  const handleStart = async () => {
    if (!isUnlocked || !canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      const idempotencyKey = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const res = await kycApi.start({
        fullName: fullName.trim(),
        birthDate,
        nationality: nationality.toUpperCase(),
        idempotencyKey,
      });
      const opt = res.decision.options[0];
      router.replace({
        pathname: '/kyc/capture',
        params: { submissionId: res.submissionId, docType: opt.docType, sides: opt.sides.join(',') },
      });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No se pudo iniciar la verificación');
      setBusy(false);
    }
  };

  if (loading || !isUnlocked) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>Consultando estado…</Text>
      </View>
    );
  }

  if (existing?.status === 'APPROVED_L2') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: espaciado.e24 }]}>
        <KycStatusBanner
          tone="success"
          title="Identidad verificada"
          message="Ya puedes usar tu monedero de forma segura."
          actionLabel="Ir al monedero"
          onAction={() => router.replace('/monedero')}
        />
      </View>
    );
  }

  const stepInfo = KYC_STATUS_TO_STEP.INITIATED;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 16 }]} keyboardShouldPersistTaps="handled">
        <StepHeader
          step={stepInfo.index}
          total={stepInfo.total}
          title="Verifica tu identidad"
          subtitle="Necesitamos unos datos básicos para cumplir con la normativa y activar tu monedero."
        />

        {error ? (
          <View style={styles.field}>
            <KycStatusBanner tone="error" title="Algo salió mal" message={error} />
          </View>
        ) : null}

        <View style={styles.field}>
          <FormField
            label="Nombre completo"
            placeholder="María Nsue Obiang"
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            autoComplete="name"
          />
        </View>

        <View style={styles.field}>
          <FormField
            label="Fecha de nacimiento"
            placeholder="AAAA-MM-DD"
            value={birthDate}
            onChangeText={(t) => setBirthDate(t.replace(/[^0-9\-]/g, '').slice(0, 10))}
            keyboardType="numbers-and-punctuation"
            error={birthDate.length > 0 && !ISO_DATE_RE.test(birthDate) ? 'Formato: AAAA-MM-DD' : undefined}
          />
        </View>

        <View style={styles.field}>
          <FormField
            label="Nacionalidad"
            placeholder="GQ"
            value={nationality}
            onChangeText={(t) => setNationality(t.slice(0, 2).toUpperCase())}
            autoCapitalize="characters"
            error={nationality.length === 2 && !NATION_RE.test(nationality) ? 'Código de 2 letras' : undefined}
          />
          <Text style={[styles.hint, { color: colors.textSecondary }]}>Código ISO de 2 letras (p. ej. GQ, CM, ES)</Text>
        </View>

        <View style={styles.button}>
          <PrimaryButton title={busy ? 'Iniciando…' : 'Continuar'} onPress={handleStart} disabled={!canSubmit || busy} loading={busy} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaciado.e24 },
  scroll: { flexGrow: 1, paddingHorizontal: espaciado.e24, paddingTop: espaciado.e16, paddingBottom: 40 },
  field: { marginTop: espaciado.e14 },
  hint: { fontSize: tipografia.micro, marginTop: espaciado.e6, fontWeight: '600' },
  button: { marginTop: espaciado.e32 },
});
