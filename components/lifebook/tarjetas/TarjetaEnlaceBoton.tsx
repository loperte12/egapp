/**
 * TarjetaEnlaceBoton — tarjeta 24 de 54 · `bcim_chat_linkcard_100`
 *
 * QUÉ ES: la tarjeta más pequeña que lleva a algún sitio. Un texto y un botón. La usa el servicio al
 * cliente para mandar un enlace con una acción clara («Ver mi pedido», «Abrir la promoción»).
 *
 * ES LA PRIMERA TARJETA QUE LEÍ DE LA REFERENCIA, y la que enseñó cómo funciona todo el sistema:
 * su `dsl.json` entero son 1.865 bytes, y ahí se ve que las tarjetas no son código sino una ficha
 * con datos, colores, medidas y eventos.
 *
 * FORMA DE LOS DATOS (del DSL, tres campos): `card_content` (el texto) · `button_content` (la
 * etiqueta del botón) · `button_url` (el destino).
 *
 * ANATOMÍA DE LA REFERENCIA (5 nodos): tarjeta radio 12 con **borde de 0,5** y padding 12/9 · texto
 * a 14/20 · botón de **80×25** con radio 13, relleno, texto a 13 centrado y **el color de marca de
 * la referencia** · el botón navega al destino.
 *
 * DECISIONES:
 *  1. **El botón va en el azul de acción de LifeBook, no en el rojo de la referencia.** El rojo de
 *     la referencia es su color de marca haciendo de botón; en LifeBook el rojo está reservado a
 *     emergencias y el azul ES la acción, por decisión escrita en `colors.ts`. Es de las pocas
 *     cosas donde no se copia la referencia, y se razona: copiar el rojo obligaría a incumplir la
 *     ley de color de la casa, que es la que sostiene el contraste AA ya verificado.
 *  2. **El botón no lleva ancho fijo.** La referencia mide 80×25; aquí se usa el patrón de píldora
 *     del kit, que crece con su etiqueta. Un botón de ancho fijo se rompe en cuanto la traducción
 *     es más larga que el original — y esta app traduce.
 *
 * CONTRATO: `cardType: 'enlace-boton'`. Sin tipo nuevo.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { espaciado, interlineado, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { BotonPildora, TarjetaEnChat } from './piezas';

export function TarjetaEnlaceBoton({ texto, etiquetaBoton, onAbrir }: {
  texto: string;
  etiquetaBoton: string;
  onAbrir?: () => void;
}) {
  const { colors } = useTheme();

  return (
    <TarjetaEnChat>
      <Text style={[estilos.texto, { color: colors.textPrimary }]} numberOfLines={4}>{texto}</Text>

      <View style={estilos.accion}>
        <BotonPildora texto={etiquetaBoton} onPress={onAbrir} />
      </View>
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  texto: { fontSize: tipografia.body, lineHeight: interlineado.amplio },
  accion: { flexDirection: 'row', marginTop: espaciado.e10 },
});
