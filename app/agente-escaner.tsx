/**
 * AgenteEscanerScreen — escáner QR de los RECADOS del agente (/agente-escaner).
 *
 * Recoge el QR que enseña el vendedor (recogida) o el comprador (entrega). El
 * escaneo de ENTREGA es el que libera el dinero al vendedor en el servidor, así
 * que el paso que se va a ejecutar lo decide la pantalla anterior y aquí se ve
 * bien claro cuál es.
 *
 * Params: orderId (uuid del recado) y paso ('pickup' | 'delivery').
 */
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { ArrowLeft, Check, QrCode } from 'lucide-react-native';
import { brand, espaciado, PrimaryButton, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { AuthGate } from '../core/AuthGate';
import { agentApi } from '../api/agent';

export default function AgenteEscanerScreen() {
  return (
    <AuthGate>
      <Contenido />
    </AuthGate>
  );
}

function Contenido() {
  const { colors } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ orderId?: string; paso?: string }>();
  const orderId = typeof params.orderId === 'string' ? params.orderId : '';
  const paso = params.paso === 'delivery' ? 'delivery' : 'pickup';

  const [permiso, pedirPermiso] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  // El lector dispara muchas veces por segundo: solo vale el primer código.
  const yaLeido = useRef(false);

  const enviar = async (qrToken: string) => {
    setBusy(true); setError(null);
    try {
      if (paso === 'pickup') await agentApi.scanPickup(orderId, qrToken);
      else await agentApi.scanDelivery(orderId, qrToken);
      setHecho(paso === 'pickup'
        ? 'Recogida registrada: el paquete va contigo.'
        : 'Entrega registrada: el dinero se libera al vendedor.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar el escaneo');
      yaLeido.current = false;
    } finally {
      setBusy(false);
    }
  };

  const alLeer = (r: BarcodeScanningResult) => {
    if (yaLeido.current || busy || hecho) return;
    const dato = (r?.data ?? '').trim();
    if (!dato) return;
    yaLeido.current = true;
    void enviar(dato);
  };

  const titulo = paso === 'pickup' ? 'Recogida del paquete' : 'Entrega al comprador';

  return (
    <View style={[styles.root, { backgroundColor: '#000000', paddingTop: insets.top }]}>
      <View style={[styles.header, { borderBottomColor: 'rgba(255,255,255,0.15)' }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Volver">
          <ArrowLeft size={22} color={brand.white} />
        </Pressable>
        <Text style={styles.headerTitle}>{titulo}</Text>
        <View style={{ width: 22 }} />
      </View>

      {hecho ? (
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <View style={[styles.okIcon, { backgroundColor: colors.surface }]}>
            <Check size={26} color={colors.primary} />
          </View>
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.maximo, textAlign: 'center', paddingHorizontal: espaciado.e28 }}>
            {hecho}
          </Text>
          <PrimaryButton title="Volver al panel" onPress={() => router.back()} />
        </View>
      ) : !permiso ? (
        <View style={styles.center}><ActivityIndicator color={brand.white} /></View>
      ) : !permiso.granted ? (
        <View style={[styles.center, { backgroundColor: colors.background }]}>
          <QrCode size={34} color={colors.textSecondary} />
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, textAlign: 'center', paddingHorizontal: espaciado.e30 }}>
            Para leer el código hace falta la cámara.
          </Text>
          <PrimaryButton title="Permitir cámara" onPress={() => void pedirPermiso()} />
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={busy ? undefined : alLeer}
          />
          {/* Marco de apuntado */}
          <View style={styles.overlay} pointerEvents="none">
            <View style={styles.marco} />
            <Text style={styles.ayuda}>
              {paso === 'pickup' ? 'Apunta al código del vendedor' : 'Apunta al código del comprador'}
            </Text>
          </View>
          {busy && (
            <View style={styles.busy}>
              <ActivityIndicator color={brand.white} />
            </View>
          )}
          {error && (
            <View style={styles.errorBox}>
              <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: peso.fuerte, textAlign: 'center' }}>{error}</Text>
              <Pressable onPress={() => { setError(null); yaLeido.current = false; }} accessibilityRole="button">
                <Text style={{ color: brand.white, fontSize: tipografia.caption, fontWeight: peso.titulo, textDecorationLine: 'underline', marginTop: espaciado.e8 }}>
                  Reintentar
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: espaciado.e16, paddingVertical: espaciado.e12, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { color: brand.white, fontSize: tipografia.subtitle, fontWeight: peso.titulo },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: espaciado.e14 },
  okIcon: { width: 60, height: 60, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', gap: espaciado.e16 },
  marco: { width: 230, height: 230, borderRadius: radios.marco, borderWidth: trazo.anillo, borderColor: 'rgba(255,255,255,0.9)' },
  ayuda: { color: brand.white, fontSize: tipografia.body, fontWeight: peso.maximo },
  busy: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)' },
  errorBox: {
    position: 'absolute', left: 20, right: 20, bottom: 40, borderRadius: radios.lg,
    backgroundColor: 'rgba(217,54,54,0.92)', padding: espaciado.e14, alignItems: 'center',
  },
});
