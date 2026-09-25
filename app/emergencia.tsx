/**
 * EMERGENCIA (/emergencia) — flujo crítico: llamar a la policía o a una ambulancia.
 *
 * POR QUÉ EXISTE ESTA PANTALLA: el menú de la pantalla de inicio tenía una entrada «Emergencia»
 * que llevaba a `/emergencia`… **y esa pantalla no existía**. Al tocarla, expo-router mostraba
 * «Unmatched Route / Page could not be found». Lo encontró la auditoría de rutas
 * (`pruebas/auditar-rutas.cjs`), no el ojo: por eso ahora esa auditoría es una prueba.
 *
 * Los teléfonos NO se inventan aquí: son los mismos que ya usa la app en
 * `EmergencyModal` (`constants/data.ts` → `EMERGENCY_CONTACTS`), que el conductor tiene en su
 * pantalla 24/7. Tener dos listas distintas de números de emergencia sería peligroso.
 *
 * Diseño deliberadamente sobrio: números grandes, un toque para llamar, y dos salidas claras.
 * En una emergencia nadie lee párrafos.
 */
import React from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { alpha, brand, espaciado, radios, tipografia, useTheme, peso, trazo} from '@egrouteplan/ui-kit';
import { ArrowLeft, Home, Phone, Siren } from 'lucide-react-native';
import { AuthGate } from '../core/AuthGate';
import { EMERGENCY_CONTACTS } from '../constants/data';
import { ir } from '../constants/rutas';

export default function EmergenciaScreen() {
  return (
    <AuthGate>
      <EmergenciaContent />
    </AuthGate>
  );
}

function EmergenciaContent() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  /** Marca el número. Si el teléfono no puede marcar, se dice en vez de no hacer nada. */
  const llamar = (numero: string, etiqueta: string) => {
    Linking.openURL(`tel:${numero}`).catch(() => {
      // Sin marcador disponible se deja el número a la vista (ya está en pantalla en grande).
      console.warn('[emergencia] no se pudo abrir el marcador para', numero, etiqueta);
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[styles.header, { paddingTop: insets.top + 6, borderBottomColor: alpha(colors.border, 0.5) }]}>
        <Pressable onPress={() => ir.atras()} hitSlop={10} accessibilityLabel="Volver">
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={{ color: colors.danger, fontWeight: peso.titulo, fontSize: 17, flex: 1, marginLeft: espaciado.e10 }}>
          Emergencia
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: espaciado.e16, paddingBottom: insets.bottom + 24, gap: espaciado.e12 }}>
        <View style={[styles.aviso, { backgroundColor: alpha(colors.danger, 0.08), borderColor: alpha(colors.danger, 0.35) }]}>
          <Siren size={22} color={colors.danger} />
          <Text style={{ color: colors.textPrimary, fontSize: tipografia.body, lineHeight: 18, flex: 1 }}>
            Toca un número para llamar. Estas llamadas funcionan aunque no tengas datos: solo
            necesitas cobertura de teléfono.
          </Text>
        </View>

        {EMERGENCY_CONTACTS.map((c) => (
          <Pressable
            key={c.id}
            onPress={() => llamar(c.number, c.label)}
            accessibilityRole="button"
            accessibilityLabel={`Llamar a ${c.label}, ${c.number}`}
            style={({ pressed }) => [styles.tarjeta, {
              backgroundColor: colors.card, borderColor: alpha(colors.danger, 0.35), opacity: pressed ? 0.85 : 1,
            }]}
          >
            <View style={[styles.icono, { backgroundColor: alpha(colors.danger, 0.12) }]}>
              {c.id === 'policia' ? <Siren size={22} color={colors.danger} /> : <Phone size={22} color={colors.danger} />}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: peso.titulo }}>{c.label}</Text>
              {c.note ? (
                <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, marginTop: espaciado.e2 }}>{c.note}</Text>
              ) : null}
              <Text style={{ color: colors.danger, fontSize: tipografia.subtitulo, fontWeight: peso.titulo, marginTop: espaciado.e4 }}>{c.number}</Text>
            </View>
            <View style={{ paddingHorizontal: espaciado.e14, paddingVertical: espaciado.e9, borderRadius: radios.full, backgroundColor: colors.danger }}>
              <Text style={{ color: brand.white, fontSize: tipografia.body, fontWeight: peso.titulo }}>Llamar</Text>
            </View>
          </Pressable>
        ))}

        <Text style={{ color: colors.textSecondary, fontSize: tipografia.caption, lineHeight: 16 }}>
          Si no puedes llamar, escribe por el chat a la persona que tengas más cerca. La app no
          envía tu ubicación automáticamente en una emergencia: dilo tú cuando contesten.
        </Text>

        <View style={{ flexDirection: 'row', gap: espaciado.e10, marginTop: espaciado.e4 }}>
          <Pressable
            onPress={() => ir.atras()}
            accessibilityLabel="Volver"
            style={[styles.salida, { borderColor: colors.border, backgroundColor: colors.surface }]}
          >
            <ArrowLeft size={16} color={colors.textPrimary} />
            <Text style={{ color: colors.textPrimary, fontWeight: peso.maximo, fontSize: tipografia.body }}>Volver</Text>
          </Pressable>
          <Pressable
            onPress={() => ir.inicio(true)}
            accessibilityLabel="Ir al inicio"
            style={[styles.salida, { borderColor: colors.primary, backgroundColor: alpha(colors.primary, 0.1) }]}
          >
            <Home size={16} color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: peso.maximo, fontSize: tipografia.body }}>Ir al inicio</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, paddingHorizontal: espaciado.e12, paddingBottom: espaciado.e8, borderBottomWidth: StyleSheet.hairlineWidth },
  aviso: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e10, borderWidth: trazo.fino, borderRadius: radios.md, padding: espaciado.e12 },
  tarjeta: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, borderWidth: trazo.fino, borderRadius: 14, padding: espaciado.e12 },
  icono: { width: 44, height: 44, borderRadius: radios.full, alignItems: 'center', justifyContent: 'center' },
  salida: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: espaciado.e8, borderWidth: trazo.fino, borderRadius: radios.md, paddingVertical: espaciado.e12 },
});
