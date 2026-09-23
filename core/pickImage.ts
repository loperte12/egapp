/**
 * pickImage — utilidad robusta de captura/selección de imagen (perfil, etc.).
 *
 * Por qué NO se usa `base64: true` inline de expo-image-picker: en algunos HAL
 * de Android (p. ej. MediaTek) el retorno con base64 inline se cuelga o vuelve
 * vacío (mismo fallo que tenía la cámara). Aquí se pide solo la URI y el base64
 * se obtiene después con expo-file-system (con respaldo fetch + FileReader),
 * mostrando un estado "Procesando…" mientras tanto.
 */

import * as ImagePicker from 'expo-image-picker';
import { readAsStringAsync } from 'expo-file-system';
import { Platform } from 'react-native';

export interface PickedImage {
  dataUrl: string;      // data:image/jpeg;base64,…
  uri: string;
}

/** URI local (file://) → base64 sin depender del base64 inline del picker. */
export async function uriToBase64(uri: string): Promise<string | null> {
  try {
    return await readAsStringAsync(uri, { encoding: 'base64' });
  } catch {
    // Respaldo: fetch + Blob + FileReader.
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

/**
 * Abre la galería y devuelve la imagen en dataURL.
 * NOTA: NO se usa allowsEditing/aspect en Android: el recorte del sistema
 * (com.android.camera.action.CROP) no existe en muchos dispositivos y hace que
 * el picker vuelva cancelado al instante. El recorte visual lo aplica la UI
 * (avatar circular); la imagen se guarda completa.
 * En Android 13+ el photo picker del sistema no exige permiso de biblioteca
 * (pedirlo devuelve granted=false sin diálogo y bloquea el flujo), así que solo
 * se solicita en Android ≤12 o iOS.
 * Si el usuario cancela devuelve null. Lanza Error con mensaje en español si
 * no hay permiso o no se puede leer el archivo.
 */
export async function pickImageFromLibrary(): Promise<PickedImage | null> {
  const android13plus = Platform.OS === 'android' && Number(Platform.Version ?? 0) >= 33;
  if (!android13plus) {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync().catch(() => null);
    if (perm && !perm.granted && perm.canAskAgain) {
      const asked = await ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => null);
      if (!asked?.granted) throw new Error('Necesitamos permiso para acceder a tus fotos');
    }
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.55,
    selectionLimit: 1,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const b64 = await uriToBase64(asset.uri);
  if (!b64) throw new Error('No se pudo leer la imagen; prueba con otra');
  return { dataUrl: `data:image/jpeg;base64,${b64}`, uri: asset.uri };
}

/** Abre la cámara y devuelve la imagen en dataURL (sin recorte, como selfie). */
export async function pickImageFromCamera(): Promise<PickedImage | null> {
  const perm = await ImagePicker.getCameraPermissionsAsync().catch(() => null);
  if (!perm?.granted) {
    const asked = await ImagePicker.requestCameraPermissionsAsync().catch(() => null);
    if (!asked?.granted) throw new Error('Necesitamos permiso para usar la cámara');
  }
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.55,
    cameraType: ImagePicker.CameraType.back,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const b64 = await uriToBase64(asset.uri);
  if (!b64) throw new Error('No se pudo leer la foto; prueba de nuevo');
  return { dataUrl: `data:image/jpeg;base64,${b64}`, uri: asset.uri };
}

/**
 * Abre la galería en MODO MÚLTIPLE (galería del Estado 24h).
 * Devuelve hasta `max` imágenes en dataURL. En Android 13+ el photo picker del
 * sistema permite selección múltiple sin permiso de biblioteca.
 */
export async function pickImagesFromLibrary(max = 4): Promise<PickedImage[]> {
  const android13plus = Platform.OS === 'android' && Number(Platform.Version ?? 0) >= 33;
  if (!android13plus) {
    const perm = await ImagePicker.getMediaLibraryPermissionsAsync().catch(() => null);
    if (perm && !perm.granted && perm.canAskAgain) {
      const asked = await ImagePicker.requestMediaLibraryPermissionsAsync().catch(() => null);
      if (!asked?.granted) throw new Error('Necesitamos permiso para acceder a tus fotos');
    }
  }
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.55,
    allowsMultipleSelection: true,
    selectionLimit: max,
    orderedSelection: true,
  });
  if (res.canceled || !res.assets?.length) return [];
  const out: PickedImage[] = [];
  for (const asset of res.assets.slice(0, max)) {
    const b64 = await uriToBase64(asset.uri);
    if (b64) out.push({ dataUrl: `data:image/jpeg;base64,${b64}`, uri: asset.uri });
  }
  return out;
}
