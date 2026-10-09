/**
 * TarjetaConsulta — tarjeta 38 de 54 · `bcim_chat_queueleave_115`
 *
 * QUÉ ES: el **resumen de una consulta** que el usuario dejó en la cola de atención. Repite lo que
 * escribió, el tipo de problema y el número de pedido, para que quede en la conversación y no se
 * pierda cuando la cola avance.
 *
 * FORMA DE LOS DATOS (del DSL): `content` (lo que escribió el usuario) · `questionName` (el tipo de
 * problema) · `orderId` · `leaveMessageTime`.
 *
 * ANATOMÍA DE LA REFERENCIA (8 nodos): tarjeta radio 12 con padding 12 · rótulo «Consulta» a 14/22
 * en peso medio · **bloque gris con fondo suave y radio 8** que contiene el texto a 12/20 · debajo,
 * dos líneas a 10/16 en gris: el tipo de problema y el número de pedido.
 *
 * DECISIONES:
 *  1. **Lo que escribió el usuario va en un bloque con fondo, no suelto.** Es la diferencia entre
 *     «esto lo escribí yo» y «esto me lo dicen»: el fondo delimita su propio texto. La referencia ya
 *     lo hace así y se conserva.
 *  2. **El número de pedido se puede copiar**, como en la tarjeta de cancelación: es un dato que se
 *     da por teléfono o se pega en una reclamación.
 *  3. La fecha de la consulta se añade a las dos líneas de datos cuando llega: la referencia la trae
 *     en los datos pero no la pinta, y una consulta sin fecha en el chat no se sabe de cuándo es.
 *
 * CONTRATO: `cardType: 'consulta'`. Sin tipo nuevo.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { espaciado, interlineado, peso, radios, Tactil, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { TarjetaEnChat } from './piezas';

export function TarjetaConsulta({ contenido, tipoProblema, pedido, fecha, onCopiar }: {
  contenido: string;
  tipoProblema?: string | null;
  pedido?: string | null;
  fecha?: string | null;
  onCopiar?: (valor: string) => void;
}) {
  const { colors } = useTheme();

  return (
    <TarjetaEnChat>
      <Text style={[estilos.rotulo, { color: colors.textPrimary }]} numberOfLines={1}>Consulta</Text>

      <View style={[estilos.bloque, { backgroundColor: colors.surface }]}>
        <Text style={[estilos.contenido, { color: colors.textPrimary }]} numberOfLines={6}>{contenido}</Text>
      </View>

      <View style={estilos.datos}>
        {tipoProblema ? (
          <Text style={[estilos.linea, { color: colors.textSecondary }]} numberOfLines={1}>
            Tipo: {tipoProblema}
          </Text>
        ) : null}

        {pedido ? (
          <Tactil
            onPress={onCopiar ? () => onCopiar(pedido) : undefined}
            accessibilityRole="button"
            accessibilityLabel={`Copiar el número de pedido ${pedido}`}
          >
            <Text style={[estilos.linea, { color: colors.textSecondary }]} numberOfLines={1}>
              Pedido: {pedido}
            </Text>
          </Tactil>
        ) : null}

        {fecha ? (
          <Text style={[estilos.linea, { color: colors.textSecondary }]} numberOfLines={1}>{fecha}</Text>
        ) : null}
      </View>
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  rotulo: { fontSize: tipografia.body, lineHeight: interlineado.suelto, fontWeight: peso.medio, marginBottom: espaciado.e8 },
  bloque: { borderRadius: radios.sm, padding: espaciado.e8 },
  contenido: { fontSize: tipografia.caption, lineHeight: interlineado.amplio },
  datos: { marginTop: espaciado.e8 },
  linea: { fontSize: tipografia.nota, lineHeight: interlineado.caption, marginTop: espaciado.e2 },
});
