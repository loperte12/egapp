/**
 * FilaRequisito — una casilla del mapa de onboarding del comerciante: «esto ya lo tienes / esto te
 * falta», y cuando falta, es además el botón que lo resuelve.
 *
 * VENÍA DE `ecomerse-seller.tsx` (donde era la función local `ReqRow`) y estaba ENTERRADA en medio
 * del formulario de publicación: el vendedor tenía que bajar por los campos de un anuncio para
 * enterarse de que le faltaba el KYC. El 20-sep-2026, al partir aquella pantalla de 1.110 líneas en
 * la zona del comerciante, el sitio natural de esta fila es la **portada** (`/tienda`): es
 * literalmente «lo que te falta por hacer», que es lo que el plan quiere que vea al abrir.
 *
 * Dos decisiones que no son de estilo:
 *  · El estado va en el ICONO y en el color, no solo en el texto: una casilla sin marcar tiene que
 *    verse de un golpe.
 *  · Si hay algo que hacer, la fila es un botón (`accessibilityRole="button"`). Si no lo hay, no se
 *    deja un botón muerto: se quita el rol y el `onPress`.
 */

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BadgeCheck, CircleDashed } from 'lucide-react-native';
import { espaciado, icono, peso, tipografia, useTheme } from '@egrouteplan/ui-kit';

export interface FilaRequisitoProps {
  /** Cumplido (`true`) o pendiente (`false`). */
  ok: boolean;
  label: string;
  /** Qué falta, o dónde se arregla. Se pinta bajo la etiqueta. */
  hint?: string;
  /** Si se pasa, la fila entera es un botón. */
  onPress?: () => void;
}

export function FilaRequisito({ ok, label, hint, onPress }: FilaRequisitoProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? `${label}. ${hint ?? 'Pendiente, toca para resolverlo'}` : `${label}. ${ok ? 'Listo' : 'Pendiente'}`}
      style={styles.fila}
    >
      {ok
        ? <BadgeCheck size={icono.sm} color={colors.text.success} />
        : <CircleDashed size={icono.sm} color={colors.textSecondary} />}
      <View style={styles.textos}>
        <Text style={[styles.label, { color: ok ? colors.textPrimary : colors.textSecondary }]}>{label}</Text>
        {hint ? (
          <Text style={[styles.hint, { color: onPress ? colors.text.primary : colors.textSecondary }]}>
            {hint}{onPress ? ' ›' : ''}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fila: { flexDirection: 'row', alignItems: 'center', paddingVertical: espaciado.e4 },
  textos: { flex: 1, marginLeft: espaciado.e8 },
  label: { fontSize: tipografia.caption, fontWeight: peso.medio },
  hint: { fontSize: tipografia.micro, fontWeight: peso.fuerte },
});
