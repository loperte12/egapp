/**
 * ServiceGrid — cuadrícula de acceso jerárquica estilo DiDi (Fase 2, 2026-09-04).
 * Patrón capturado en ref-didi-home.png / didi-home*.xml:
 *   · PRIMARIOS (fila 1, círculos grandes): Taxi, Ciudad a Ciudad,
 *     Ser Conductor, Reservar Coche.
 *   · SECUNDARIOS (fila 2): Comida Rápida, Mercado, Buscar Alquiler,
 *     Buscar Work.
 *   · MÁS SERVICIOS (bloque inferior, chips): Mudanza, Enviar Paquete,
 *     Life Book (próximamente) + Emergencia (acento rojo).
 * Conserva el RoleGate: servicios con perfiles preguntan el rol al tocar
 * (work/alquiler/food/ecomerse); toque largo reabre el selector.
 * comingSoon: celda deshabilitada "Próximamente". Emergencia: abre el modal.
 */

import React, { useMemo, useState } from 'react';
import { espaciado, radios, tipografia, peso, trazo} from '@egrouteplan/ui-kit';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SERVICES, type ServiceItem } from '../constants/data';
import { roleOptionsFor, isRoleService, type RoleOption } from '../constants/roles';
import { getSavedRole, saveRole } from '../state/rolePrefs';
import { alpha } from '../constants/colors';
import { useTheme } from '../theme/ThemeContext';
import { ir as irSeguro } from '../constants/rutas';

const PRIMARY_IDS = ['taxi', 'intercity', 'conductor', 'reservar'];
/**
 * Fila 2 — cuatro plazas al 25 %, y estaban llenas: `['food','ecomerse','alquiler','work']`.
 *
 * Cambio del 20-sep-2026 (zona del comerciante, decisión aprobada): entra **`tienda`** pegada a
 * `ecomerse` —Mercado · Mi tienda, las dos caras del mismo mercado— y sale `work`. **`work` no
 * desaparece**: cae solo a «Más servicios» porque `more` (abajo) se calcula restando primarios y
 * secundarios. Es un cambio de una línea y el comerciante entra en su zona en un toque, sin pasar
 * por el modal de rol ni por menús secundarios.
 */
const SECONDARY_IDS = ['ecomerse', 'tienda', 'food', 'alquiler'];

export default function ServiceGrid({ onEmergencyPress, glass = false }: {
  onEmergencyPress: () => void;
  /** Modo glassmorphism (Home social): círculos translúcidos sobre el mapa. */
  glass?: boolean;
}) {
  const { colors, isDark } = useTheme();
  const router = useRouter();
  const [choosing, setChoosing] = useState<{ service: ServiceItem; options: RoleOption[] } | null>(null);

  const { primary, secondary, more } = useMemo(() => {
    const byId = new Map(SERVICES.map((s) => [s.id, s]));
    const pick = (ids: string[]) => ids.map((id) => byId.get(id)).filter((x): x is ServiceItem => !!x);
    const rest = SERVICES.filter((s) => !PRIMARY_IDS.includes(s.id) && !SECONDARY_IDS.includes(s.id) && s.id !== 'lifebook');
    return { primary: pick(PRIMARY_IDS), secondary: pick(SECONDARY_IDS), more: rest };
  }, []);

  /**
   * NAVEGACIÓN SEGURA (zona del INICIO).
   *
   * Estas tres salidas llevan la ruta escrita en la lista de servicios (`constants/data.ts`). Si
   * esa entrada apunta a una pantalla que ya no existe, antes la pulsación no hacía NADA (o
   * expo-router enseñaba «Unmatched Route» en inglés) — y así se coló `/emergencia`, que no
   * existía: lo encontró la auditoría (`npm run rutas`). Ahora pasa por el ayudante, que valida
   * la ruta y, si no existe, lo explica con salida al inicio.
   */
  const irA = (ruta: string) => irSeguro.libre(String(ruta ?? ''));

  const openForService = async (service: ServiceItem) => {
    const options = roleOptionsFor(service.id);
    if (options.length <= 1) {
      if (options.length === 1) irA(options[0].route);
      return;
    }
    const saved = await getSavedRole(service.id);
    const target = options.find((o) => o.id === saved);
    if (target) irA(target.route);
    else setChoosing({ service, options });
  };

  const handlePress = (item: ServiceItem) => {
    if (item.comingSoon) return;
    if (item.tone === 'emergency') { onEmergencyPress(); return; }
    if (isRoleService(item.id)) { void openForService(item); return; }
    irA(item.route);
  };

  const pickRole = (option: RoleOption) => {
    if (!choosing) return;
    const service = choosing.service;
    setChoosing(null);
    void saveRole(service.id, option.id);
    router.push(option.route as never);
  };

  /** Celda circular tipo DiDi (icono en círculo + etiqueta). */
  const renderCell = (item: ServiceItem, compact = false) => {
    const isEmergency = item.tone === 'emergency';
    const disabled = !!item.comingSoon;
    const gate = !disabled && isRoleService(item.id);
    const tint = isEmergency ? colors.danger : disabled ? colors.textSecondary : colors.secondary;
    const Icon = item.icon;
    const size = compact ? 46 : 58;
    // Glass: círculo blanco semitransparente con borde claro (se ve el fondo).
    const circleGlass = {
      backgroundColor: isDark ? 'rgba(35,35,41,0.5)' : 'rgba(255,255,255,0.55)',
      borderColor: isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.85)',
    };
    return (
      <Pressable
        key={item.id}
        onPress={() => handlePress(item)}
        onLongPress={() => { if (gate) void openForService(item); }}
        delayLongPress={450}
        disabled={disabled}
        accessibilityRole={disabled ? undefined : 'button'}
        accessibilityLabel={disabled ? `${item.label}, próximamente` : `${item.label}${gate ? '. Mantén pulsado para cambiar de perfil' : ''}`}
        accessibilityState={disabled ? { disabled: true } : undefined}
        style={({ pressed }) => [
          styles.cell,
          { width: compact ? 80 : '25%', opacity: disabled ? 0.5 : pressed ? 0.6 : 1 },
        ]}
      >
        <View
          style={[
            styles.circle,
            {
              width: size, height: size, borderRadius: size / 2,
              ...(glass
                ? circleGlass
                : {
                    backgroundColor: isEmergency
                      ? alpha(colors.danger, 0.1)
                      : alpha(tint, disabled ? 0.06 : 0.12),
                    borderColor: alpha(tint, 0.25),
                  }),
            },
          ]}
        >
          <Icon size={compact ? 20 : 26} color={tint} strokeWidth={2.1} />
        </View>
        <Text
          style={[styles.label, { color: isEmergency ? colors.danger : disabled ? colors.textSecondary : colors.textPrimary }]}
          numberOfLines={2}
        >
          {item.label}
        </Text>
        {disabled ? <Text style={styles.comingSoon}>Próximamente</Text> : null}
      </Pressable>
    );
  };

  return (
    <>
      {/* Fila 1 — primarios */}
      <View style={styles.row}>{primary.map((item) => renderCell(item))}</View>

      {/* Fila 2 — secundarios */}
      <View style={[styles.row, styles.rowGapTop]}>{secondary.map((item) => renderCell(item))}</View>

      {/* Más servicios + emergencia (chips) */}
      <View style={[
        styles.moreBlock,
        glass
          ? { backgroundColor: isDark ? 'rgba(35,35,41,0.45)' : 'rgba(255,255,255,0.55)', borderColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.8)' }
          : { backgroundColor: colors.surface, borderColor: colors.border },
      ]}>
        <Text style={[styles.moreTitle, { color: colors.textSecondary }]}>Más servicios</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: espaciado.e10, paddingVertical: espaciado.e2 }}
        >
          {more.map((item) => {
            const isEmergency = item.tone === 'emergency';
            const disabled = !!item.comingSoon;
            const tint = isEmergency ? colors.danger : disabled ? colors.textSecondary : colors.primary;
            const Icon = item.icon;
            return (
              <Pressable
                key={item.id}
                onPress={() => handlePress(item)}
                disabled={disabled}
                accessibilityRole={disabled ? undefined : 'button'}
                accessibilityLabel={disabled ? `${item.label}, próximamente` : item.label}
                accessibilityState={disabled ? { disabled: true } : undefined}
                style={({ pressed }) => [
                  styles.chip,
                  {
                    backgroundColor: isEmergency
                      ? alpha(colors.danger, glass ? 0.16 : 0.08)
                      : glass ? (isDark ? 'rgba(35,35,41,0.45)' : 'rgba(255,255,255,0.55)') : colors.card,
                    borderColor: isEmergency ? alpha(colors.danger, 0.3) : colors.border,
                    opacity: disabled ? 0.5 : pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Icon size={16} color={tint} strokeWidth={2.2} />
                <Text style={[styles.chipLabel, { color: isEmergency ? colors.danger : disabled ? colors.textSecondary : colors.textPrimary }]}>
                  {item.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Selector de perfil (RoleGate) */}
      <Modal visible={choosing !== null} transparent animationType="fade" onRequestClose={() => setChoosing(null)}>
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { backgroundColor: colors.card }]}>
            <Text style={[styles.sheetTitle, { color: colors.textPrimary }]}>
              {choosing?.service.label} — ¿en qué perfil entras?
            </Text>
            <Text style={[styles.sheetHint, { color: colors.textSecondary }]}>Lo recordaremos en este dispositivo. Mantén pulsado el icono para cambiarlo.</Text>
            {choosing?.options.map((opt) => (
              <Pressable
                key={opt.id}
                onPress={() => pickRole(opt)}
                accessibilityRole="button"
                accessibilityLabel={opt.label}
                style={({ pressed }) => [styles.roleRow, { backgroundColor: colors.surface, borderColor: colors.border, opacity: pressed ? 0.85 : 1 }]}
              >
                <Text style={styles.roleEmoji}>{opt.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.roleLabel, { color: colors.textPrimary }]}>{opt.label}</Text>
                  <Text style={[styles.roleHint, { color: colors.textSecondary }]}>{opt.hint}</Text>
                </View>
              </Pressable>
            ))}
            <Pressable onPress={() => setChoosing(null)} accessibilityRole="button" accessibilityLabel="Cancelar" style={{ paddingVertical: espaciado.e12 }}>
              <Text style={{ textAlign: 'center', color: colors.textSecondary, fontWeight: peso.fuerte }}>Cancelar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: espaciado.e14, flexDirection: 'row', rowGap: 16 },
  rowGapTop: { marginTop: espaciado.e6 },
  cell: { alignItems: 'center', gap: espaciado.e5 },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: tipografia.micro, fontWeight: peso.maximo, textAlign: 'center', lineHeight: 13, paddingHorizontal: espaciado.e2 },
  comingSoon: { fontSize: 7.5, fontWeight: peso.maximo, color: '#86909C', letterSpacing: 0.2, textTransform: 'uppercase' },
  moreBlock: {
    marginTop: espaciado.e16,
    borderRadius: radios.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: espaciado.e10,
    paddingLeft: espaciado.e12,
  },
  moreTitle: { fontSize: tipografia.micro, fontWeight: peso.maximo, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: espaciado.e8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espaciado.e6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radios.full,
    paddingHorizontal: espaciado.e12,
    paddingVertical: espaciado.e8,
  },
  chipLabel: { fontSize: tipografia.caption, fontWeight: peso.fuerte },
  backdrop: { flex: 1, backgroundColor: 'rgba(10,15,31,0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: espaciado.e20, paddingBottom: espaciado.e28 },
  sheetTitle: { fontSize: 17, fontWeight: peso.titulo, textAlign: 'center', marginBottom: espaciado.e4 },
  sheetHint: { fontSize: tipografia.caption, textAlign: 'center', marginBottom: espaciado.e14, lineHeight: 17 },
  roleRow: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e12, borderWidth: trazo.fino, borderRadius: 14, padding: espaciado.e14, marginBottom: espaciado.e10 },
  roleEmoji: { fontSize: tipografia.display },
  roleLabel: { fontSize: 14.5, fontWeight: peso.maximo },
  roleHint: { fontSize: tipografia.caption, marginTop: espaciado.e2, lineHeight: 15 },
});
