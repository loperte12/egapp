/**
 * TarjetaInfraccion — tarjeta 54 de 54 · `bcim_chat_violateitem_219`
 *
 * QUÉ ES: el aviso de que **algo ha sido marcado como infractor**. Es la última de las 54 y, con
 * diferencia, la más delicada: le dice a una persona que su contenido o su tienda han incumplido una
 * norma. Cómo se dice esto importa más que cómo se ve.
 *
 * Y es el único sitio de toda la campaña donde el color de aviso está justificado de verdad.
 *
 * FORMA DE LOS DATOS (del DSL): `violationEntityName` (qué se ha marcado) · `violationStatus` (en qué
 * punto está) · y la imagen del objeto.
 *
 * ANATOMÍA DE LA REFERENCIA (16 nodos): tarjeta radio 12 con padding 12 · cabecera a 16/24 en peso
 * medio: el nombre del objeto **con la palabra «infracción» pegada** y el estado al lado, coloreado
 * según `violationStatus` · fila con la imagen de 56.
 *
 * DECISIONES:
 *  1. **Aquí sí se usa el rojo, y por eso se explica.** En el resto de la campaña lo he evitado
 *     —cupones, devoluciones, cancelaciones— porque ninguna de esas cosas es una emergencia. Una
 *     infracción **sí es una advertencia seria**, y `brand.danger` existe exactamente para eso. Es la
 *     única tarjeta de las 54 donde el rojo dice la verdad.
 *  2. **El nombre y la palabra «infracción» van separados de verdad**, no concatenados como en la
 *     referencia. Ahí se pegan en el mismo nodo («{nombre}违规»), lo que impide darles jerarquía: el
 *     objeto es el dato y «infracción» es la calificación. Separarlos permite pintar el nombre en el
 *     color de texto y la calificación en el de aviso, que es lo que hace legible el aviso de un
 *     vistazo.
 *  3. **No se inventa una acción.** La referencia enseña el estado y el objeto; no ofrece botones.
 *     Añadir aquí un «apelar» o un «pagar» sería inventarme el trámite. Si el producto lo necesita,
 *     se decide con el flujo delante.
 *
 * CONTRATO: `cardType: 'infraccion'`. Sin tipo nuevo.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import {
  alpha, brand, espaciado, interlineado, peso, radios, tipografia, useTheme,
} from '@egrouteplan/ui-kit';
import { TarjetaEnChat } from './piezas';

export function TarjetaInfraccion({ objeto, estado, imagen }: {
  /** Qué se ha marcado (un producto, una nota, una tienda). */
  objeto: string;
  /** En qué punto está la revisión. Lo manda el servidor. */
  estado?: string | null;
  imagen?: string | null;
}) {
  const { colors } = useTheme();

  return (
    <TarjetaEnChat>
      <View style={estilos.cabecera}>
        <Text style={[estilos.objeto, { color: colors.textPrimary }]} numberOfLines={2}>{objeto}</Text>
        {/* La calificación va en el color de aviso; el nombre del objeto, no. */}
        <Text style={[estilos.calificacion, { color: brand.danger }]} numberOfLines={1}>Infracción</Text>
      </View>

      {estado ? (
        <Text style={[estilos.estado, { color: brand.danger }]} numberOfLines={2}>{estado}</Text>
      ) : null}

      {imagen ? (
        <Image source={imagen} style={estilos.imagen} contentFit="cover" cachePolicy="memory-disk" transition={0} />
      ) : (
        <View style={[estilos.imagen, { backgroundColor: alpha(colors.textSecondary, 0.12) }]} />
      )}
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  cabecera: { flexDirection: 'row', alignItems: 'baseline', gap: espaciado.e8, marginBottom: espaciado.e8 },
  objeto: { flex: 1, fontSize: tipografia.subtitle, lineHeight: interlineado.suelto, fontWeight: peso.medio },
  calificacion: { fontSize: tipografia.subtitle, lineHeight: interlineado.suelto, fontWeight: peso.medio },
  estado: { fontSize: tipografia.body, lineHeight: interlineado.body, marginBottom: espaciado.e8 },
  imagen: { width: 56, height: 56, borderRadius: radios.punta },
});
