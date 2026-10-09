/**
 * TarjetaInvitacionResena — tarjeta 21 de 54 · `bcim_chat_inviterating_16`
 *
 * QUÉ ES: la invitación a **valorar un producto** que ya se compró. El texto de la invitación, el
 * artículo y el botón para escribir la reseña.
 *
 * FORMA DE LOS DATOS (del DSL): `goods_image` · `goods_name` · `reviewable` (si todavía se puede
 * valorar; cuando deja de poder, la referencia cambia lo que enseña).
 *
 * ANATOMÍA DE LA REFERENCIA (13 nodos): tarjeta radio 12 con borde de 1 · franja de cabecera
 * centrada a 15/18 en gris · separador de 1 a todo lo ancho · bloque del artículo con fondo suave y
 * radio 6 · foto de **48** (no 56: aquí la tarjeta es más estrecha) · el ancho se calcula restando
 * 48 al del contenedor si el remitente es una persona, y 16 si no.
 *
 * DECISIONES:
 *  1. **Sin franja a sangre ni separador de lado a lado.** La referencia los hace sacando el relleno
 *     de la tarjeta, y eso obliga a anularlo a mano — un valor fuera de la escala, que es justo lo
 *     que la guardia de diseño cuenta como deuda. Esta tarjeta se queda **dentro del padding del
 *     patrón**: mismo texto centrado, misma jerarquía, cero valores a mano. Es el caso en que la
 *     regla de la casa mejora el resultado en vez de estorbarlo.
 *  2. **El ancho no se calcula a mano.** La referencia resta 48 o 16 según quién manda el mensaje
 *     porque su motor le da el ancho del contenedor; aquí se adapta con el patrón compartido.
 *  3. **Si ya no se puede valorar, se quita el botón pero NO el artículo.** La referencia contempla
 *     `reviewable`; lo que se descarta es esconder la tarjeta entera: el usuario debe poder recordar
 *     qué compró aunque el plazo haya pasado.
 *
 * CONTRATO: `cardType: 'invitacion-resena'`. Sin tipo nuevo.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import {
  alpha, espaciado, interlineado, peso, radios, tipografia, useTheme,
} from '@egrouteplan/ui-kit';
import { BotonPildora, TarjetaEnChat } from './piezas';

export function TarjetaInvitacionResena({ imagen, producto, sePuedeValorar, onValorar }: {
  imagen?: string | null;
  producto: string;
  /** `false` cuando el plazo de valoración ya pasó. */
  sePuedeValorar?: boolean;
  onValorar?: () => void;
}) {
  const { colors } = useTheme();

  return (
    <TarjetaEnChat>
      <Text style={[estilos.invitacion, { color: colors.textSecondary }]} numberOfLines={2}>
        Te invitamos a valorar este producto
      </Text>

      <View style={[estilos.bloque, { backgroundColor: colors.surface }]}>
        {imagen ? (
          <Image source={imagen} style={estilos.foto} contentFit="cover" cachePolicy="memory-disk" transition={0} />
        ) : (
          <View style={[estilos.foto, { backgroundColor: alpha(colors.primary, 0.08) }]} />
        )}
        <Text style={[estilos.nombre, { color: colors.textPrimary }]} numberOfLines={2}>{producto}</Text>
      </View>

      {sePuedeValorar !== false && onValorar ? (
        <View style={estilos.accion}>
          <BotonPildora texto="Escribir una reseña" onPress={onValorar} />
        </View>
      ) : null}
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  /** 15/18 como la referencia, con la escala del kit: `cuerpo` con `interlineado.body`. */
  invitacion: { fontSize: tipografia.cuerpo, lineHeight: interlineado.body, textAlign: 'center' },
  bloque: {
    flexDirection: 'row', alignItems: 'center', gap: espaciado.e8,
    borderRadius: radios.marca, padding: espaciado.e8, marginTop: espaciado.e12,
  },
  /** 48 como la referencia: esta tarjeta es más estrecha y 56 la apretaría. */
  foto: { width: 48, height: 48, borderRadius: radios.punta },
  nombre: { flex: 1, minWidth: 0, fontSize: tipografia.body, lineHeight: interlineado.amplio, fontWeight: peso.medio },
  accion: { flexDirection: 'row', marginTop: espaciado.e12 },
});
