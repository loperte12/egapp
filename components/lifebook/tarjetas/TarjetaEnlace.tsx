/**
 * TarjetaEnlace — tarjeta 23 de 54 · `bcim_chat_landingpage_103`
 *
 * QUÉ ES: la **vista previa de un enlace**. Cuando alguien comparte una página, no se pega una URL
 * pelada: se enseña la imagen de la página, su título y su descripción, y al tocarla se abre.
 *
 * FORMA DE LOS DATOS (del DSL): `title` · `pageDesc` · `shareUrl` (la imagen) · `pageUrl` (el
 * destino). La referencia además pasa la imagen por `ensureHttps`, porque su servidor puede mandar
 * la dirección sin esquema.
 *
 * ANATOMÍA DE LA REFERENCIA (5 nodos): tarjeta de **210 de ancho** con radio 12 · imagen a ancho
 * completo y **158 de alto** · cuerpo con padding 10/12: título a 16/26 en peso medio y descripción
 * a 12 · toda la tarjeta clicable para abrir la vista previa.
 *
 * DECISIONES:
 *  1. **La imagen va dentro del padding del patrón, no a sangre.** La referencia la pone de borde a
 *     borde sacando el relleno de la tarjeta, lo que obliga a anularlo a mano — un valor fuera de la
 *     escala. Con el padding del patrón y el radio del kit, la portada queda enmarcada, que además
 *     es como LifeBook trata ya todas sus fotos (el bloque del pedido, el del cupón).
 *  2. **El ancho es el del patrón (282), no 210.** La referencia usa 210 porque su tarjeta convive
 *     con otras en una fila; la conversación de LifeBook no lo necesita, y una tarjeta más estrecha
 *     que las demás se leería como un error de alineación. Lo que sí se respeta es la proporción:
 *     la imagen es alta, no una miniatura.
 *  3. **La URL no se enseña nunca.** Ni el destino ni el origen: lo que se enseña es la página.
 *     Una dirección en medio de una conversación no informa a nadie que no sea quien la escribió.
 *
 * CONTRATO: `cardType: 'enlace'`. Sin tipo nuevo.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { espaciado, interlineado, peso, radios, tipografia, useTheme } from '@egrouteplan/ui-kit';
import { TarjetaEnChat } from './piezas';

export function TarjetaEnlace({ imagen, titulo, descripcion, onAbrir }: {
  imagen?: string | null;
  titulo: string;
  descripcion?: string | null;
  onAbrir?: () => void;
}) {
  const { colors } = useTheme();

  return (
    <TarjetaEnChat onPress={onAbrir} etiquetaAccesible={titulo}>
      {imagen ? (
        <Image source={imagen} style={estilos.portada} contentFit="cover" cachePolicy="memory-disk" transition={0} />
      ) : null}

      <Text style={[estilos.titulo, { color: colors.textPrimary }]} numberOfLines={3}>{titulo}</Text>
      {descripcion ? (
        <Text style={[estilos.descripcion, { color: colors.textSecondary }]} numberOfLines={2}>{descripcion}</Text>
      ) : null}
    </TarjetaEnChat>
  );
}

const estilos = StyleSheet.create({
  /** Portada enmarcada por el padding del patrón, con el radio del kit. */
  portada: { width: '100%', height: 158, borderRadius: radios.sm },
  titulo: { fontSize: tipografia.subtitle, lineHeight: interlineado.suelto, fontWeight: peso.medio, marginTop: espaciado.e10 },
  descripcion: { fontSize: tipografia.caption, lineHeight: interlineado.caption, marginTop: espaciado.e6 },
});
