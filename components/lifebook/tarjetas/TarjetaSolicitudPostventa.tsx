/**
 * TarjetaSolicitudPostventa — tarjeta 41 de 54 · `bcim_chat_returnapply_74`
 *
 * QUÉ ES: la puerta de entrada a una **solicitud de postventa**. Enseña el artículo, lo que costó y
 * un botón para presentar la solicitud. Toda la tarjeta lleva al mismo sitio.
 *
 * FORMA DE LOS DATOS (del DSL): `image` · `name` · `price` · `goodsId` · `packageId` · `orderId`.
 *
 * ANATOMÍA DE LA REFERENCIA (15 nodos): tarjeta con radio **20** y padding 12 · título a 15/18 en
 * peso medio · separador de 0,5 · fila con la foto de **65** y radio 8 · nombre a 13 · precio a
 * 15/25 **en el color de marca de la referencia** y botón de píldora a 13 en el mismo color.
 *
 * DECISIONES:
 *  1. **El radio 20 no se inventa: es `radios.tarjeta` del kit**, que existe justo para «tarjeta con
 *     foto». La referencia lo usa aquí y en ninguna de las otras que he visto; en LifeBook el radio
 *     del patrón es 12 y esta tarjeta es la única con 20 — se respeta porque el nombre del token
 *     coincide con el uso, no porque el número sea bonito.
 *  2. **El precio y el botón no van en rojo.** En la referencia son rojos. Aquí el precio va en el
 *     color de texto y el botón en el azul de acción: el rojo de LifeBook es de emergencia, y pedir
 *     una devolución no lo es.
 *  3. La foto es 56, como en el patrón, no 65: es la única tarjeta con 65 y la pieza compartida ya
 *     resuelve el caso con la misma jerarquía.
 *
 * CONTRATO: `cardType: 'solicitud-postventa'`. Sin tipo nuevo.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import {
  alpha, espaciado, interlineado, peso, radios, tipografia, useTheme,
} from '@egrouteplan/ui-kit';
import { BotonPildora, TarjetaEnChat } from './piezas';

export function TarjetaSolicitudPostventa({ imagen, producto, precio, onSolicitar }: {
  imagen?: string | null;
  producto: string;
  precio?: string | null;
  onSolicitar?: () => void;
}) {
  const { colors } = useTheme();

  return (
    <TarjetaEnChat style={estilos.tarjeta} onPress={onSolicitar} etiquetaAccesible={`Solicitar postventa de ${producto}`}>
      <Text style={[estilos.titulo, { color: colors.textPrimary }]} numberOfLines={1}>
        Presentar una solicitud de postventa
      </Text>

      <View style={[estilos.separador, { backgroundColor: colors.border }]} />

      <View style={estilos.fila}>
        {imagen ? (
          <Image source={imagen} style={estilos.foto} contentFit="cover" cachePolicy="memory-disk" transition={0} />
        ) : (
          <View style={[estilos.foto, { backgroundColor: alpha(colors.primary, 0.08) }]} />
        )}

        <View style={estilos.datos}>
          <Text style={[estilos.nombre, { color: colors.textPrimary }]} numberOfLines={2}>{producto}</Text>
          {precio ? (
            <Text style={[estilos.precio, { color: colors.textPrimary }]} numberOfLines={1}>{precio}</Text>
          ) : null}
        </View>
      </View>

      {onSolicitar ? (
        <View style={estilos.accion}>
          <BotonPildora texto="Solicitar" onPress={onSolicitar} />
        </View>
      ) : null}
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  /** Radio 20 de la referencia: `radios.tarjeta`, el token de «tarjeta con foto». */
  tarjeta: { borderRadius: radios.tarjeta },
  titulo: { fontSize: tipografia.cuerpo, lineHeight: interlineado.body, fontWeight: peso.medio },
  separador: { height: StyleSheet.hairlineWidth, marginTop: espaciado.e12 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: espaciado.e8, marginTop: espaciado.e12 },
  /** 56 del patrón, no los 65 de la referencia. */
  foto: { width: 56, height: 56, borderRadius: radios.sm },
  datos: { flex: 1, minWidth: 0 },
  nombre: { fontSize: tipografia.detalle, lineHeight: interlineado.body },
  precio: { fontSize: tipografia.cuerpo, lineHeight: interlineado.suelto, fontWeight: peso.medio, marginTop: espaciado.e2 },
  accion: { flexDirection: 'row', marginTop: espaciado.e12 },
});
