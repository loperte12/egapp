/**
 * components/lifebook/BotonCucucul.tsx — EL BOTÓN FLOTANTE DE CUCUCUL (tanda N).
 *
 * POR QUÉ ESTE FICHERO Y NO EL DOCK. El dueño quería el asistente a mano en TODA la app. El dock es
 * `components/FloatingFooter.tsx`, que **no se puede tocar** (regla del proyecto), así que el botón
 * vive aquí y se pinta desde `app/_layout.tsx`: aparece por encima de cualquier pantalla sin meter
 * mano en la navegación.
 *
 * DÓNDE SE PONE Y DÓNDE NO:
 *   · abajo a la IZQUIERDA, por encima del dock: en Life Book el botón de publicar/vídeos está abajo a
 *     la derecha y así no se pelean;
 *   · NO se pinta en el propio chat de Cucucul (no tiene sentido un botón que lleve a donde ya estás),
 *     ni en la autenticación, ni en el vídeo a pantalla completa (ahí manda la pantalla).
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { alpha, useTheme, elevation, brand, trazo, radios} from '@egrouteplan/ui-kit';
import { ir as irSeguro } from '../../constants/rutas';

/** Las pantallas donde NO tiene sentido (o estorba). */
const OCULTO_EN = ['/lifebook-ai', '/auth', '/lifebook-player', '/lifebook-videos'];

export default function BotonCucucul() {
  const { colors } = useTheme();
  const router = useRouter();
  const ruta = usePathname();

  if (OCULTO_EN.some((r) => ruta?.startsWith(r))) return null;

  return (
    <View pointerEvents="box-none" style={styles.capa}>
      <Pressable
        onPress={() => irSeguro.libre('/lifebook-ai')}
        accessibilityRole="button"
        accessibilityLabel="Cucucul, el asistente"
        style={[styles.boton, { backgroundColor: colors.primary, borderColor: alpha(brand.white, 0.35) }]}
      >
        <Sparkles size={21} color={brand.white} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  /** Capa transparente: solo el botón recibe toques (`box-none`), el resto de la pantalla sigue viva. */
  capa: { position: 'absolute', left: 16, bottom: 96, zIndex: 20 },
  boton: {
    width: 50, height: 50, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center',
    borderWidth: trazo.fino,
    ...elevation.md,
  },
});
