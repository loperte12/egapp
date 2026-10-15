/**
 * ServiceGrid — la rejilla de servicios de la home, en 3×5 como el «KingKong» (金刚区) de DiDi.
 *
 *   · QUINCE SERVICIOS A LA VISTA, en tres filas de cinco. Nada escondido en un cajón: DiDi pone
 *     ahí sus módulos diferenciales (interurbano, chárter, alquiler) al mismo nivel que el taxi,
 *     y esta app hace lo mismo con los suyos.
 *   · El reparto por filas imita el criterio de DiDi: el día a día, las cosas y los recados, y
 *     los módulos y los servicios de la casa.
 *
 * Conserva el RoleGate: servicios con perfiles preguntan el rol al tocar
 * (work/alquiler/food/ecomerse); toque largo reabre el selector.
 * comingSoon: celda deshabilitada "Próximamente". Emergencia: abre el modal.
 */

import React from 'react';
import {espaciado, peso, radios, tipografia, trazoIcono} from '@egrouteplan/ui-kit';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SERVICES, type ServiceItem } from '../constants/data';
import { isRoleService } from '../constants/roles';
import { alpha } from '../constants/colors';
import { useTheme } from '../theme/ThemeContext';
import { useServicios } from './servicios/useServicios';
import { SelectorDePerfil } from './servicios/SelectorDePerfil';

/**
 * LA REJILLA, EN TRES FILAS DE CINCO — el «KingKong» (金刚区) de DiDi.
 *
 * DiDi no pone una fila de cuatro accesos y esconde el resto en un cajón: pone **15 servicios a
 * la vista, en 3×5**, y ahí mete sus módulos diferenciales al mismo nivel que el taxi. En su
 * tercera fila están 城际拼车 (interurbano), 包车/接送机 (chárter) y 滴滴租车 (alquiler) —
 * que son exactamente los tres módulos de esta app.
 *
 * Esa es la lección que se copia: **lo que te diferencia se ve en la home, no en un menú**. Antes
 * aquí había 2 filas de 4 más un bloque de chips «Más servicios» donde vivían el interurbano, el
 * paquete y la mudanza: escondidos.
 *
 * El reparto por filas sigue la lógica de DiDi: primero lo del día a día, después las cosas y los
 * recados, y al final los módulos y los servicios de la casa.
 */
const REJILLA: string[][] = [
  // 1 — el día a día
  ['taxi', 'intercity', 'food', 'ecomerse', 'tienda'],
  // 2 — cosas y recados (DiDi: 快送跑腿 · 搬家/家政 en su segunda fila)
  ['paquete', 'mudanza', 'hotel', 'monedero', 'work'],
  // 3 — los módulos (DiDi: 城际拼车 · 包车/接送机 · 滴滴租车) y la casa
  ['reservar', 'alquiler', 'conductor', 'lifebook', 'emergencia'],
];

/**
 * NOMBRES CORTOS, SOLO PARA LA REJILLA.
 *
 * En una celda del 20 % de ancho caben menos letras que en el resto de la app, y los rótulos
 * largos se partían por la mitad: «Ser Conductor» salía como «Ser Cond / uctor» y «Emergencia»
 * como «Emergenc / ia». Con nombres cortos entra todo en dos líneas y la rejilla queda alineada.
 *
 * Va aquí y no en `constants/data.ts` a propósito: el nombre largo es el bueno en las demás
 * pantallas, donde hay sitio. Esto es una decisión de esta rejilla, no un renombrado global.
 */
const ETIQUETA_CORTA: Record<string, string> = {
  intercity: 'Ciudad a Ciudad',
  paquete: 'Paquete',
  alquiler: 'Alquiler',
  conductor: 'Conductor',
  reservar: 'Reservar',
  work: 'Trabajo',
};

export default function ServiceGrid({ onEmergencyPress, glass = false }: {
  onEmergencyPress: () => void;
  /** Modo glassmorphism (Home social): círculos translúcidos sobre el mapa. */
  glass?: boolean;
}) {
  const { colors, isDark } = useTheme();

  // ── LA INTERACCIÓN, COMPARTIDA ───────────────────────────────────────────────────────────────
  // Pulsar un servicio —con sus perfiles, su urgencia, su «próximamente» y su navegación validada— se
  // mudó a `components/servicios/useServicios` el 15/10/2026, cuando el Mercado empezó a enseñar los
  // mismos servicios en su cabecera. **Aquí ya no hay una copia**: si el taxi pregunta el perfil, lo
  // pregunta igual en las dos pantallas, y el día que se añada un caso se añade en un sitio.
  //
  // La navegación segura (lo que evitó el `/emergencia` inexistente) vive dentro del hook.
  const { porId, prensar, mantenerPulsado, eligiendo, elegirPerfil, cerrarSelector } = useServicios(onEmergencyPress);

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
        onPress={() => prensar(item)}
        onLongPress={() => mantenerPulsado(item)}
        delayLongPress={450}
        disabled={disabled}
        accessibilityRole={disabled ? undefined : 'button'}
        accessibilityLabel={disabled ? `${item.label}, próximamente` : `${item.label}${gate ? '. Mantén pulsado para cambiar de perfil' : ''}`}
        accessibilityState={disabled ? { disabled: true } : undefined}
        style={({ pressed }) => [
          styles.cell,
          { width: '20%', opacity: disabled ? 0.5 : pressed ? 0.6 : 1 },
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
          <Icon size={compact ? 20 : 26} color={tint} strokeWidth={trazoIcono.base} />
        </View>
        <Text
          style={[styles.label, { color: isEmergency ? colors.text.danger : disabled ? colors.textSecondary : colors.textPrimary }]}
          numberOfLines={2}
        >
          {ETIQUETA_CORTA[item.id] ?? item.label}
        </Text>
        {disabled ? <Text style={[styles.comingSoon, { color: colors.textSecondary }]}>Pronto</Text> : null}
      </Pressable>
    );
  };

  return (
    <>
      {/* TRES FILAS DE CINCO — el KingKong de DiDi, con los módulos diferenciales a la vista. */}
      {REJILLA.map((fila, i) => (
        <View key={i} style={[styles.row, i > 0 && styles.rowGapTop]}>
          {fila.map((id) => {
            const item = porId.get(id);
            // Hueco reservado: si un servicio desaparece de `constants/data`, la rejilla no se
            // descoloca (cada fila sigue teniendo cinco plazas).
            if (!item) return <View key={id} style={styles.hueco} />;
            return renderCell(item, true);
          })}
        </View>
      ))}

      {/* Selector de perfil: **el mismo modal que la cabecera del Mercado** (`SelectorDePerfil`), no
          una copia. Se llevó allí el 15/10/2026 al compartir la interacción. */}
      <SelectorDePerfil
        solicitud={eligiendo}
        colores={{ card: colors.card, surface: colors.surface, border: colors.border, textPrimary: colors.textPrimary, textSecondary: colors.textSecondary }}
        alElegir={elegirPerfil}
        alCerrar={cerrarSelector}
      />
    </>
  );
}

const styles = StyleSheet.create({
  row: { marginTop: espaciado.e14, flexDirection: 'row', rowGap: 16 },
  rowGapTop: { marginTop: espaciado.e6 },
  cell: { alignItems: 'center', gap: espaciado.e5 },
  /** Hueco de una plaza vacía: mantiene las cinco columnas alineadas. */
  hueco: { width: '20%' },
  circle: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: tipografia.sello, fontWeight: peso.maximo, textAlign: 'center', lineHeight: 12, paddingHorizontal: espaciado.e2 },
  comingSoon: { fontSize: tipografia.sello, fontWeight: peso.maximo, letterSpacing: 0.2, textTransform: 'uppercase' },
  // AQUÍ VIVÍAN las ocho hojas del selector de perfil (`backdrop`, `sheet`, `sheetTitle`, `sheetHint`,
  // `roleRow`, `roleEmoji`, `roleLabel`, `roleHint`). Se fueron con el modal, que ahora vive en
  // `components/servicios/SelectorDePerfil.tsx` y lo comparten la Home y el Mercado: un estilo sin
  // dueño es una copia esperando a que alguien la edite y no cambie nada.
});
