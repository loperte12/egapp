/**
 * SelectorDePerfil — «¿en qué perfil entras?»
 * ==========================================
 *
 * El modal que aparece cuando un servicio tiene **más de un perfil** (taxi: pasajero o conductor). Se
 * movió aquí desde `ServiceGrid` el 15/10/2026 **sin cambiarle nada**: ahora lo pintan la Home y la
 * cabecera del Mercado, y con dos copias la pregunta acabaría siendo distinta en cada sitio.
 *
 * Decía —y sigue diciendo— **que se recuerda**: la elección no es un trámite que se repite cada vez.
 */

import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { espaciado, peso, radios, tipografia, trazo } from '@egrouteplan/ui-kit';

import type { SolicitudDePerfil } from './useServicios';
import type { RoleOption } from '../../constants/roles';

export function SelectorDePerfil({ solicitud, colores, alElegir, alCerrar }: {
  /** `null` = no hay nada que preguntar y el modal no se pinta. */
  solicitud: SolicitudDePerfil | null;
  colores: { card: string; surface: string; border: string; textPrimary: string; textSecondary: string };
  alElegir: (opcion: RoleOption) => void;
  alCerrar: () => void;
}) {
  return (
    <Modal visible={solicitud !== null} transparent animationType="fade" onRequestClose={alCerrar}>
      <View style={s.backdrop}>
        <View style={[s.sheet, { backgroundColor: colores.card }]}>
          <Text style={[s.sheetTitle, { color: colores.textPrimary }]}>
            {solicitud?.servicio.label} — ¿en qué perfil entras?
          </Text>
          <Text style={[s.sheetHint, { color: colores.textSecondary }]}>
            Lo recordaremos en este dispositivo. Mantén pulsado el icono para cambiarlo.
          </Text>
          {solicitud?.opciones.map((opt) => (
            <Pressable
              key={opt.id}
              onPress={() => alElegir(opt)}
              accessibilityRole="button"
              accessibilityLabel={opt.label}
              style={({ pressed }) => [s.roleRow, { backgroundColor: colores.surface, borderColor: colores.border, opacity: pressed ? 0.85 : 1 }]}
            >
              <Text style={s.roleEmoji}>{opt.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.roleLabel, { color: colores.textPrimary }]}>{opt.label}</Text>
                <Text style={[s.roleHint, { color: colores.textSecondary }]}>{opt.hint}</Text>
              </View>
            </Pressable>
          ))}
          <Pressable onPress={alCerrar} accessibilityRole="button" accessibilityLabel="Cancelar" style={{ paddingVertical: espaciado.e12 }}>
            <Text style={{ textAlign: 'center', color: colores.textSecondary, fontWeight: peso.fuerte }}>Cancelar</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(10,15,31,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radios.panelAncho, borderTopRightRadius: radios.panelAncho, padding: espaciado.e20, paddingBottom: espaciado.e28 },
  sheetTitle: { fontSize: tipografia.subCabecera, fontWeight: peso.titulo, textAlign: 'center', marginBottom: espaciado.e4 },
  sheetHint: { fontSize: tipografia.caption, textAlign: 'center', marginBottom: espaciado.e14, lineHeight: 17 },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, borderWidth: trazo.fino, borderRadius: radios.campo, padding: espaciado.e14, marginBottom: espaciado.e10 },
  roleEmoji: { fontSize: tipografia.display },
  roleLabel: { fontSize: tipografia.fino, fontWeight: peso.maximo },
  roleHint: { fontSize: tipografia.caption, marginTop: espaciado.e2, lineHeight: 15 },
});

export default SelectorDePerfil;
