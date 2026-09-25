/**
 * KYC — Paso 3: prueba de vida (liveness).
 * Obtiene un desafío del servidor, captura 2 selfies consecutivos y los verifica.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraCapture, espaciado, KycStatusBanner, LivenessChallengeView, StepHeader, tipografia, useTheme, peso, radios} from '@egrouteplan/ui-kit';
import { kycApi, base64ToBytes, hashBytes } from '../../api/kyc';
import { ApiError } from '../../api/auth';
import { KYC_STATUS_TO_STEP } from '@egrouteplan/contracts';

const FRAMES_NEEDED = 2;

export default function KycLivenessScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { submissionId } = useLocalSearchParams<{ submissionId: string }>();

  const [challenge, setChallenge] = useState<Awaited<ReturnType<typeof kycApi.createChallenge>> | null>(null);
  const [frames, setFrames] = useState<{ sha256: string; ts: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    kycApi
      .createChallenge(submissionId)
      .then(setChallenge)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Error al crear el desafío'));
  }, [submissionId]);

  const handleCapture = async (photo: { uri: string; base64?: string }) => {
    if (!photo.base64 || !challenge || busy) return;

    const bytes = base64ToBytes(photo.base64);
    const sha256 = hashBytes(bytes);
    const nextFrames = [...frames, { sha256, ts: Date.now() }];
    setFrames(nextFrames);

    if (nextFrames.length >= FRAMES_NEEDED) {
      setBusy(true);
      setError(null);
      try {
        await kycApi.verifyBiometry(submissionId, {
          challengeId: challenge.challengeId,
          sessionSignature: challenge.sessionSignature,
          framesSha256: nextFrames.map((f) => f.sha256),
          captureTimestamps: nextFrames.map((f) => f.ts),
        });
        router.replace({ pathname: '/kyc/status', params: { submissionId } });
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'Error al verificar la prueba de vida');
        setBusy(false);
      }
    }
  };

  const stepInfo = KYC_STATUS_TO_STEP.LIVENESS_REQUIRED;
  const progress = Math.min(frames.length / FRAMES_NEEDED, 1);

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <StepHeader
          step={stepInfo.index}
          total={stepInfo.total}
          title="Prueba de vida"
          subtitle="Sigue la instrucción y captura 2 fotos seguidas dentro del óvalo."
        />
      </View>

      {challenge ? (
        <LivenessChallengeView
          method={challenge.method as any}
          actions={challenge.actions}
          capturing={frames.length > 0 && frames.length < FRAMES_NEEDED}
          progress={progress}
          done={frames.length >= FRAMES_NEEDED}
        />
      ) : null}

      {error ? (
        <View style={styles.banner}>
          <KycStatusBanner tone="error" title="Prueba no válida" message={error} />
        </View>
      ) : null}

      <View style={styles.camera}>
        {busy ? (
          <View style={[styles.processing, { backgroundColor: colors.surface }]}>
            <Text style={[styles.processingText, { color: colors.textPrimary }]}>Verificando…</Text>
          </View>
        ) : (
          <CameraCapture
            variant="selfie"
            instruction={`Foto ${frames.length + 1} de ${FRAMES_NEEDED}`}
            onCapture={handleCapture}
          />
        )}
      </View>

      <View style={styles.footer}>
        <Text style={[styles.hint, { color: colors.textSecondary }]}>
          {frames.length === 0
            ? 'Toca el botón cuando estés listo.'
            : frames.length < FRAMES_NEEDED
              ? 'Toca de nuevo para la segunda foto.'
              : 'Enviando verificación…'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: espaciado.e20, paddingTop: espaciado.e12, paddingBottom: espaciado.e24 },
  header: { marginBottom: espaciado.e12 },
  banner: { marginVertical: espaciado.e12 },
  camera: { flex: 1, borderRadius: radios.marco, overflow: 'hidden' },
  processing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  processingText: { fontSize: tipografia.subtitle, fontWeight: peso.maximo },
  footer: { marginTop: espaciado.e16 },
  hint: { fontSize: tipografia.caption, textAlign: 'center', fontWeight: peso.medio },
});
