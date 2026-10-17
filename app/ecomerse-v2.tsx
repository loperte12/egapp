/**
 * EcomerseV2Screen — la PANTALLA SEMILLA del v2 del Mercado
 * ==========================================================
 * Ruta: /ecomerse-v2
 *
 * ## Qué es
 *
 * La primera rebanada del shell v2: **una pantalla que sólo pide una sección al servidor y la pinta**.
 * No tiene ni un widget nombrado — el servidor manda el árbol y `FranjaServidor` lo pinta. Es también la
 * primera sección del **panel de rejilla** que se midió en Taobao (`docs/RE-关注-TIENDAS.md` §3):
 * categorías en 3 columnas, celda 98,7×34,7 dp, huecos 13,7 / 7,6.
 *
 * ## Las decisiones, y por qué
 *
 * 1. **Sin árbol de repuesto.** Si la sección no llega, no se pinta y punto: un repuesto en el cliente
 *    sería una segunda fuente de verdad que se queda vieja sin que nadie lo note.
 * 2. **`vacia` NO es `error`.** El servidor puede decir «no hay categorías» (`arbol: null`) y eso es un
 *    estado legítimo; que no llegue (red, HTTP, contrato) es otra cosa. La pantalla lo dice distinto.
 * 3. **El toque no navega todavía.** El árbol manda `$item.id`, pero esta rebanada sólo prueba el
 *    panel; navegar a la categoría es la siguiente ficha. Dejarlo sin hacer es mejor que inventar un
 *    destino.
 */
import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft } from 'lucide-react-native';
import { espaciado, peso, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { FranjaServidor } from '../components/ecomerse/FranjaServidor';

type Estado = 'cargando' | 'lista' | 'vacia' | 'error';

export default function EcomerseV2Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [estado, setEstado] = useState<Estado>('cargando');
  const [recarga, setRecarga] = useState(0);

  return (
    <View style={[s.raiz, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={[s.cabecera, { borderBottomColor: colors.border }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Volver"
        >
          <ArrowLeft size={22} color={colors.textPrimary} />
        </Pressable>
        <Text style={[s.titulo, { color: colors.textPrimary }]}>Mercado v2</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: espaciado.e24 }}>
        <FranjaServidor
          ruta="v2-categorias"
          alTocar={() => undefined}
          alEstado={(e) => setEstado(e)}
          recarga={recarga}
          desplazable={false}
        />

        {estado === 'cargando' ? (
          <ActivityIndicator style={{ marginTop: espaciado.e16 }} color={colors.textPrimary} />
        ) : null}

        {estado === 'error' ? (
          <View style={s.aviso}>
            <Text style={[s.texto, { color: colors.textPrimary }]}>
              No se pudo cargar el panel de categorías.
            </Text>
            <Pressable
              onPress={() => setRecarga((n) => n + 1)}
              accessibilityRole="button"
              accessibilityLabel="Reintentar"
            >
              <Text style={[s.texto, s.enlace, { color: colors.primary }]}>Reintentar</Text>
            </Pressable>
          </View>
        ) : null}

        {estado === 'vacia' ? (
          <View style={s.aviso}>
            <Text style={[s.texto, { color: colors.textPrimary }]}>
              El servidor no mandó categorías.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1 },
  cabecera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.e12,
    paddingHorizontal: espaciado.e16,
    paddingVertical: espaciado.e12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  titulo: { fontSize: tipografia.subtitle, fontWeight: peso.fuerte },
  aviso: { paddingHorizontal: espaciado.e16, paddingTop: espaciado.e16, gap: espaciado.e8 },
  texto: { fontSize: tipografia.body },
  enlace: { fontWeight: peso.fuerte },
});
