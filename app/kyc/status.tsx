/**
 * KYC — Paso 4: estado de la verificación con polling.
 * Desde aquí se puede reintentar documentos, ir a liveness o volver al monedero.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SOPORTE, whatsappSoporte } from '../../constants/soporte';
import { espaciado, GhostButton, KycStatusBanner, PrimaryButton, StepHeader, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { kycApi, type SubmissionState, KYC_TERMINAL_STATUSES } from '../../api/kyc';
import { ApiError } from '../../api/auth';
import { KYC_STATUS_TO_STEP } from '@egrouteplan/contracts';

const POLL_MS = 1500;

export default function KycStatusScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { submissionId } = useLocalSearchParams<{ submissionId: string }>();

  const [state, setState] = useState<SubmissionState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    /** El temporizador se guarda aquí para poder PARARLO cuando el KYC ya es terminal. */
    let id: ReturnType<typeof setInterval> | null = null;

    const tick = async () => {
      try {
        const s = await kycApi.get(submissionId);
        if (!alive) return;
        setState(s);
        setError(null);
        /**
         * SI EL KYC YA ES TERMINAL, NO SE VUELVE A PREGUNTAR (auditoría de diseño, D-54).
         * Antes este sondeo seguía cada 1,5 s PARA SIEMPRE, también con el KYC aprobado: batería,
         * datos y peticiones al servidor sin ninguna razón. `isTerminal` existía y solo se usaba
         * para pintar.
         */
        if (KYC_TERMINAL_STATUSES.includes(s.status as never)) {
          if (id) { clearInterval(id); id = null; }
        }
      } catch (e) {
        if (!alive) return;
        setError(e instanceof ApiError ? e.message : 'Error al consultar estado');
      }
    };

    tick();
    id = setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      if (id) clearInterval(id);
    };
  }, [submissionId]);

  if (error && !state) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background, padding: espaciado.e24 }]}>
        <KycStatusBanner tone="error" title="Error de conexión" message={error} />
      </View>
    );
  }

  if (!state) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>Consultando estado…</Text>
      </View>
    );
  }

  const stepInfo = KYC_STATUS_TO_STEP[state.status] ?? KYC_STATUS_TO_STEP.AML_CHECK;
  const isTerminal = KYC_TERMINAL_STATUSES.includes(state.status as any);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 16 }]}>
      <View style={styles.header}>
        <StepHeader
          step={stepInfo.index}
          total={stepInfo.total}
          title={stepInfo.label}
          subtitle="Estamos validando tu información. Esto suele tardar unos segundos."
          state={state.status === 'MANUAL_REVIEW' ? 'review' : state.status === 'REJECTED' ? 'error' : 'normal'}
        />
      </View>

      <View style={styles.body}>
        {state.status === 'APPROVED_L2' && (
          <KycStatusBanner
            tone="success"
            title="¡Identidad verificada!"
            message="Ya tienes acceso completo a tu monedero."
            actionLabel="Ir al monedero"
            onAction={() => router.replace('/monedero')}
          />
        )}

        {state.status === 'MANUAL_REVIEW' && (
          <KycStatusBanner
            tone="review"
            title="Revisión en curso"
            message="Un agente revisará tu caso en 24–48 h. Mientras tanto, la app sigue funcionando pero el monedero está en solo lectura."
          />
        )}

        {state.status === 'REJECTED' && (
          <KycStatusBanner
            tone="error"
            title="No se pudo verificar"
            message={`Si crees que es un error, escríbenos: ${SOPORTE.email} · WhatsApp ${SOPORTE.telefono}`}
            actionLabel="Escribir al soporte"
            onAction={() => { void whatsappSoporte('Hola, creo que hay un error en mi verificación de identidad.'); }}
          />
        )}

        {state.status === 'LIVENESS_REQUIRED' && (
          <>
            <Text style={[styles.text, { color: colors.textPrimary }]}>
              Documento validado. Ahora necesitamos la prueba de vida.
            </Text>
            <PrimaryButton
              title="Hacer prueba de vida"
              onPress={() => router.replace({ pathname: '/kyc/liveness', params: { submissionId } })}
            />
          </>
        )}

        {state.status === 'OCR_FAILED' && (
          <>
            <KycStatusBanner
              tone="review"
              title="Documento ilegible"
              message="Repite la foto con buena luz y sin reflejos."
            />
            <PrimaryButton
              title="Repetir fotos"
              onPress={() =>
                router.replace({
                  pathname: '/kyc/capture',
                  params: {
                    submissionId,
                    docType: state.decision.options[0].docType,
                    sides: state.decision.options[0].sides.join(','),
                  },
                })
              }
            />
          </>
        )}

        {!isTerminal && state.status !== 'LIVENESS_REQUIRED' && state.status !== 'OCR_FAILED' && (
          <Text style={[styles.text, { color: colors.textSecondary }]}>
            Validando {state.status === 'OCR_PENDING' ? 'el documento' : 'la prueba de vida'}…
          </Text>
        )}
      </View>

      <View style={styles.footer}>
        <GhostButton title="Cancelar y volver" onPress={() => router.replace('/')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: espaciado.e24, paddingTop: espaciado.e16, paddingBottom: espaciado.e32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: espaciado.e24 },
  header: { marginBottom: espaciado.e24 },
  body: { flex: 1, gap: espaciado.e16 },
  text: { fontSize: tipografia.body, fontWeight: peso.medio, textAlign: 'center' },
  footer: { marginTop: espaciado.e20 },
});
