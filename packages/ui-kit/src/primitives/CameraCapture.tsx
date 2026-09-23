/**
 * CameraCapture — cámara base del Design System (escaneo documental y selfie).
 * Marco guía con esquinas AZUL PRIMARIO, overlay de instrucción de 1 línea,
 * estados de permiso claros y captura con feedback. Sin elementos sobrecargados.
 *
 * Requiere: expo-camera (CameraView). La detección de bordes/liveness real se
 * enchufa después (ML Kit) sin cambiar la API del componente.
 */

import React, { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { readAsStringAsync } from 'expo-file-system';
import { Camera, RefreshCw, ImageIcon } from 'lucide-react-native';
import { useTheme } from '../theme/ThemeContext';
import { useScreenGuard } from '../security/useScreenGuard';
import { PrimaryButton, GhostButton } from './PrimaryButton';

export type CaptureVariant = 'document' | 'selfie';

/** Espera con tope de tiempo: evita quedarse "colgado" si el HAL de cámara
 *  (p. ej. MediaTek) no responde a takePictureAsync (feedback 2026-09-08). */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('capture-timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }).catch((e) => { clearTimeout(t); reject(e); });
  });
}

/** Convierte un archivo de imagen local (file:// uri) a base64 sin depender
 *  del base64 inline de expo-camera (que en algunos HAL MediaTek se cuelga).
 *  Usa expo-file-system (fiabilidad) con respaldo fetch + Blob + FileReader. */
async function uriToBase64(uri: string): Promise<string | null> {
  try {
    return await readAsStringAsync(uri, { encoding: 'base64' });
  } catch {
    try {
      const resp = await fetch(uri);
      const blob = await resp.blob();
      return await new Promise<string | null>((resolve) => {
        try {
          const fr = new FileReader();
          fr.onload = () => {
            const s = String(fr.result ?? '');
            const idx = s.indexOf(',');
            resolve(idx >= 0 ? s.slice(idx + 1) : s || null);
          };
          fr.onerror = () => resolve(null);
          fr.readAsDataURL(blob);
        } catch {
          resolve(null);
        }
      });
    } catch {
      return null;
    }
  }
}

export function CameraCapture({
  variant,
  instruction,
  onCapture,
  onPickGallery,
}: {
  variant: CaptureVariant;
  instruction: string;
  onCapture: (photo: { uri: string; base64?: string }) => void;
  onPickGallery?: () => void;
}) {
  const { colors } = useTheme();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const [captureErr, setCaptureErr] = useState<string | null>(null);
  const isSelfie = variant === 'selfie';

  // Documentos de identidad en pantalla = contenido protegido.
  useScreenGuard(true);

  if (!permission) return <View style={styles.fill} />;

  // ---- Estado de permiso no concedido (sad path de plataforma) ----
  if (!permission.granted) {
    return (
      <View style={styles.permissionBox}>
        <Camera size={40} color={colors.primary} strokeWidth={1.6} />
        <Text style={[styles.permissionTitle, { color: colors.textPrimary }]}>
          Necesitamos tu cámara
        </Text>
        <Text style={[styles.permissionText, { color: colors.textSecondary }]}>
          Solo se usa para escanear tu documento y la prueba de vida. Nada sale de tu dispositivo sin cifrado.
        </Text>
        <PrimaryButton title="Permitir cámara" onPress={requestPermission} />
        {onPickGallery && <GhostButton title="Subir desde galería" onPress={onPickGallery} />}
      </View>
    );
  }

  // Fallback: si la captura inline no responde (HAL MediaTek / expo-camera),
  // abrimos la CÁMARA DEL SISTEMA (expo-image-picker) — frontal en selfie.
  const systemCamera = async () => {
    try {
      const res = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.75,
        base64: true,
        cameraType: isSelfie ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
      });
      if (!res.canceled && res.assets?.[0]) {
        const a = res.assets[0];
        onCapture({ uri: a.uri, base64: a.base64 ?? undefined });
      } else {
        setCaptureErr('Captura cancelada. Vuelve a pulsar el botón para intentarlo.');
      }
    } catch (e) {
      const msg = (e as Error)?.message ?? String(e);
      setCaptureErr(`No se pudo abrir la cámara del sistema (${msg.slice(0, 120)}). Revisa el permiso o reintenta.`);
    }
  };

  const takePhoto = async () => {
    if (capturing || !cameraRef.current) return;
    setCapturing(true);
    setCaptureErr(null);
    try {
      let photo: { uri: string; base64?: string | null } | null = null;
      // Intento 1 (más fiable en MediaTek): capturar SIN base64 inline y
      // convertir el archivo después (el base64 inline puede colgar el HAL).
      try {
        const p = await withTimeout(cameraRef.current.takePictureAsync({
          quality: 0.7,
          base64: false,
          skipProcessing: true,
        }), 8000);
        if (p?.uri) {
          const b64 = await uriToBase64(p.uri);
          if (b64) photo = { uri: p.uri, base64: b64 };
        }
      } catch {
        photo = null;
      }
      // Intento 2: base64 inline (comportamiento original) como respaldo.
      if (!photo) {
        try {
          const p = await withTimeout(cameraRef.current.takePictureAsync({
            quality: 0.85,
            base64: true,
            skipProcessing: false,
          }), 8000);
          if (p?.base64) photo = { uri: p.uri, base64: p.base64 };
        } catch {
          photo = null;
        }
      }
      if (photo) {
        onCapture({ uri: photo.uri, base64: photo.base64 ?? undefined });
      } else {
        setCaptureErr('La cámara no respondió. Reintenta, o pulsa el icono de la izquierda para usar la cámara del sistema.');
      }
    } finally {
      setCapturing(false);
    }
  };

  return (
    <View style={styles.fill}>
      <CameraView
        ref={cameraRef}
        style={styles.fill}
        facing={isSelfie ? 'front' : 'back'}
        flash="auto"
      />

      {/* Marco guía: esquinas azul primario (documento) u óvalo (selfie) */}
      <View style={styles.overlay} pointerEvents="none">
        {isSelfie ? (
          <View style={[styles.oval, { borderColor: colors.primary }]} />
        ) : (
          <View style={styles.frame}>
            {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
              <View key={corner} style={[styles.corner, styles[corner], { borderColor: colors.primary }]} />
            ))}
          </View>
        )}
        <View style={[styles.instructionPill, { backgroundColor: 'rgba(23,23,26,0.55)' }]}>
          <Text style={styles.instructionText}>{instruction}</Text>
        </View>
      </View>

      {captureErr && (
        <View style={[styles.errPill, { backgroundColor: 'rgba(245,63,63,0.92)' }]}>
          <Text style={styles.errText}>{captureErr}</Text>
        </View>
      )}

      {/* Controles */}
      <View style={styles.controls}>
        {onPickGallery ? (
          <Pressable onPress={onPickGallery} style={[styles.galleryBtn, { backgroundColor: colors.card }]} accessibilityLabel="Subir desde galería">
            <ImageIcon size={20} color={colors.primary} />
          </Pressable>
        ) : (
          <Pressable onPress={() => void systemCamera()} style={[styles.galleryBtn, { backgroundColor: 'rgba(255,255,255,0.18)' }]} accessibilityLabel="Usar cámara del sistema">
            <RefreshCw size={20} color="#FFFFFF" />
          </Pressable>
        )}
        <Pressable
          onPress={takePhoto}
          disabled={capturing}
          accessibilityRole="button"
          accessibilityLabel="Capturar foto"
          style={({ pressed }) => [
            styles.shutter,
            {
              borderColor: '#FFFFFF',
              backgroundColor: pressed || capturing ? colors.primaryPressed : colors.primary,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            },
          ]}
        >
          <View style={styles.shutterInner} />
        </Pressable>
        <View style={styles.galleryBtn} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, borderRadius: 20, overflow: 'hidden', backgroundColor: '#17171A' },
  permissionBox: { alignItems: 'center', gap: 12, paddingVertical: 28, paddingHorizontal: 12 },
  permissionTitle: { fontSize: 17, fontWeight: '800' },
  permissionText: { fontSize: 12.5, textAlign: 'center', lineHeight: 18 },
  errPill: { position: 'absolute', top: 10, left: 14, right: 14, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  errText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  frame: { width: '82%', aspectRatio: 1.586, position: 'relative' },
  corner: { position: 'absolute', width: 30, height: 30, borderWidth: 4 },
  tl: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 14 },
  tr: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 14 },
  bl: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 14 },
  br: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 14 },
  oval: { width: '68%', aspectRatio: 0.8, borderRadius: 999, borderWidth: 3 },
  instructionPill: {
    position: 'absolute', bottom: 22, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 999,
  },
  instructionText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '700' },
  controls: {
    position: 'absolute', bottom: 18, left: 0, right: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 34,
  },
  galleryBtn: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  shutter: {
    width: 68, height: 68, borderRadius: 34, borderWidth: 4,
    alignItems: 'center', justifyContent: 'center',
  },
  shutterInner: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFFFFF' },
});
