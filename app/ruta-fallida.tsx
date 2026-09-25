/**
 * RUTA FALLIDA (/ruta-fallida) — la pantalla de RESPALDO del sistema de navegación.
 *
 * POR QUÉ EXISTE: antes, cuando un destino no se podía abrir, no pasaba NADA (el botón parecía
 * roto) o expo-router enseñaba una pantalla en inglés («Unmatched Route / Page could not be
 * found»). Las dos cosas dejan al usuario sin saber qué ha pasado.
 *
 * Decisión del dueño (14/09/2026): explicar lo que pasó y dar SIEMPRE una salida limpia al
 * inicio. Nada de redirecciones silenciosas: si te han traído aquí, te lo decimos.
 *
 * La usa el ayudante de navegación (`constants/rutas.ts`) cuando una ruta no está en el mapa o
 * le falta un dato, y también `+not-found.tsx` (que es lo que expo-router usa cuando llega una
 * dirección que no corresponde a ninguna pantalla).
 */
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, tipografia, useTheme, peso, trazo, radios} from '@egrouteplan/ui-kit';
import { Compass, Home, MapPinOff } from 'lucide-react-native';
import { ir } from '../constants/rutas';

export default function RutaFallidaScreen() {
  const { motivo, destino } = useLocalSearchParams<{ motivo?: string; destino?: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: espaciado.e24, paddingBottom: insets.bottom + 24 }}>
        <View style={[styles.icono, { backgroundColor: alpha(colors.primary, 0.1) }]}>
          <MapPinOff size={30} color={colors.primary} />
        </View>

        <Text style={{ color: colors.textPrimary, fontSize: tipografia.cifra, fontWeight: peso.titulo, textAlign: 'center', marginTop: espaciado.e14 }}>
          No pudimos abrir esa pantalla
        </Text>
        <Text style={{ color: colors.textSecondary, fontSize: tipografia.body, lineHeight: 19, textAlign: 'center', marginTop: espaciado.e8 }}>
          {motivo
            ? String(motivo)
            : 'El enlace que has tocado no lleva a ninguna parte de la app.'}
        </Text>

        {destino ? (
          <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, textAlign: 'center', marginTop: espaciado.e10 }}>
            Destino: {String(destino)}
          </Text>
        ) : null}

        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 17, textAlign: 'center', marginTop: espaciado.e14 }}>
          Nada se ha roto en tu cuenta. Puedes volver a donde estabas o empezar desde el inicio.
        </Text>

        <View style={{ gap: espaciado.e10, marginTop: espaciado.e22 }}>
          <Pressable
            onPress={() => ir.inicio(true)}
            accessibilityLabel="Ir al inicio"
            style={[styles.boton, { backgroundColor: colors.primary }]}
          >
            <Home size={17} color={brand.white} />
            <Text style={{ color: brand.white, fontWeight: peso.titulo, fontSize: tipografia.cuerpo }}>Ir al inicio</Text>
          </Pressable>
          <Pressable
            onPress={() => ir.atras()}
            accessibilityLabel="Volver atrás"
            style={[styles.boton, { backgroundColor: colors.surface, borderWidth: trazo.fino, borderColor: colors.border }]}
          >
            <Compass size={17} color={colors.textPrimary} />
            <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.cuerpo }}>Volver atrás</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  icono: { width: 64, height: 64, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  boton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e8, borderRadius: radios.campo, paddingVertical: espaciado.e14 },
});
