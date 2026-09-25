/**
 * Life Book — ESCANEAR (/lifebook-scan)
 *
 * Marco de escaneo de QR. Hoy es la PANTALLA (diseño), sin cámara activa:
 * leer un QR de amigo/grupo necesita `expo-camera` + búsqueda por EG-ID en el
 * servidor (pendiente). El escáner de DOCUMENTOS real está en `/scanner`.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, ScanLine } from 'lucide-react-native';
import { brand, espaciado, tipografia, useTheme, peso, trazo, radios} from '@egrouteplan/ui-kit';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

export default function LifeBookScan() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={{ flex: 1, backgroundColor: brand.visor, paddingTop: insets.top }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e10 }}>
        <Pressable onPress={() => router.back()} hitSlop={8} accessibilityLabel="Volver">
          <ArrowLeft size={20} color={brand.white} />
        </Pressable>
        <Text style={{ color: brand.white, fontWeight: peso.maximo, marginLeft: espaciado.e10, fontSize: tipografia.subtitle }}>Escanear</Text>
      </View>

      {/* Aquí se integrará expo-camera / lector de QR */}
      <View style={styles.frame}>
        <View style={styles.box} />
        <ScanLine size={34} color={brand.white} style={{ position: 'absolute' }} />
      </View>

      <Text style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', fontSize: tipografia.caption, marginTop: espaciado.e16, lineHeight: 18 }}>
        Apunta al código QR para añadir amigos,{'\n'}unirte a grupos o abrir publicaciones
      </Text>

      <Text style={{ color: 'rgba(255,255,255,0.45)', textAlign: 'center', fontSize: tipografia.micro, marginTop: espaciado.e10, marginBottom: insets.bottom + 24 }}>
        Lector pendiente: necesita cámara y búsqueda por EG-ID en el servidor.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  box: {
    width: 220, height: 220, borderRadius: radios.panel,
    borderWidth: trazo.fuerte, borderColor: 'rgba(255,255,255,0.6)',
    borderStyle: 'dashed',
  },
});
