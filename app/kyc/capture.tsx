/**
 * KYC — Paso 2: captura de documento (frontal / reverso).
 * Recibe por params: submissionId, docType, sides (csv).
 * Sube cada cara directamente a MinIO vía URL prefirmada y notifica al backend.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraCapture, espaciado, KycStatusBanner, PrimaryButton, StepHeader, tipografia, useTheme, peso} from '@egrouteplan/ui-kit';
import { kycApi, base64ToBytes, hashBytes } from '../../api/kyc';
import { ApiError } from '../../api/auth';
import { KYC_STATUS_TO_STEP } from '@egrouteplan/contracts';

const MIME = 'image/jpeg';

export default function KycCaptureScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ submissionId: string; docType: string; sides: string }>();

  const submissionId = params.submissionId;
  const docType = params.docType;
  const sides = useMemo(() => params.sides.split(',').filter(Boolean), [params.sides]);

  const [stepIndex, setStepIndex] = useState(0);
  const [side, setSide] = useState(sides[0] ?? 'front');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneSides, setDoneSides] = useState<string[]>([]);

  useEffect(() => {
    setSide(sides[stepIndex] ?? sides[sides.length - 1]);
  }, [stepIndex, sides]);

  const instruction =
    side === 'front' ? 'Centra el anverso dentro del marco'
    : side === 'back' ? 'Ahora la parte de atrás'
    : 'Centra el documento';

  const handleCapture = async (photo: { uri: string; base64?: string }) => {
    if (!photo.base64 || busy) return;
    setBusy(true);
    setError(null);

    try {
      const bytes = base64ToBytes(photo.base64);
      const sha256 = hashBytes(bytes);

      const presign = await kycApi.presign(submissionId, {
        docType: docType as any,
        side: side as any,
        mime: MIME,
        bytes: bytes.length,
        sha256,
      });

      await kycApi.uploadToPresignedUrl(presign.uploadUrl, bytes, MIME, presign.headers);

      await kycApi.completeDocument(submissionId, {
        storageKey: presign.storageKey,
        sha256,
        docType: docType as any,
        side: side as any,
        mime: MIME,
        bytes: bytes.length,
      });

      const nextDone = [...doneSides, side];
      setDoneSides(nextDone);

      if (nextDone.length >= sides.length) {
        // Todas las piezas subidas; pasamos a estado para esperar OCR → LIVENESS_REQUIRED.
        router.replace({ pathname: '/kyc/status', params: { submissionId } });
      } else {
        setStepIndex((i) => i + 1);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Error al procesar la foto');
    } finally {
      setBusy(false);
    }
  };

  const stepInfo = KYC_STATUS_TO_STEP.OCR_PENDING;

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <StepHeader
          step={stepInfo.index}
          total={stepInfo.total}
          title={`Foto del documento (${doneSides.length + 1}/${sides.length})`}
          subtitle={instruction}
        />
      </View>

      {error ? (
        <View style={styles.banner}>
          <KycStatusBanner tone="error" title="No se pudo guardar la foto" message={error} />
        </View>
      ) : null}

      <View style={styles.camera}>
        <CameraCapture variant="document" instruction={instruction} onCapture={handleCapture} />
      </View>

      <View style={styles.footer}>
        <Text style={[styles.legal, { color: colors.textSecondary }]}>
          La imagen se cifra antes de salir de tu dispositivo.
        </Text>
        {busy && (
          <PrimaryButton title="Subiendo…" onPress={() => {}} loading disabled />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: espaciado.e20, paddingTop: espaciado.e12, paddingBottom: espaciado.e24 },
  header: { marginBottom: espaciado.e12 },
  banner: { marginBottom: espaciado.e12 },
  camera: { flex: 1, borderRadius: 24, overflow: 'hidden' },
  footer: { marginTop: espaciado.e16, gap: espaciado.e10 },
  legal: { fontSize: tipografia.micro, textAlign: 'center', fontWeight: peso.medio },
});
